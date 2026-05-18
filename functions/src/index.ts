import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

admin.initializeApp();
const db = admin.firestore();

const awsKeyId     = defineSecret('AWS_ACCESS_KEY_ID');
const awsSecretKey = defineSecret('AWS_SECRET_ACCESS_KEY');

const BUCKET = 'empatica-us-east-1-prod-data';
const REGION = 'us-east-1';

// ─── Timing constants ─────────────────────────────────────────────────────────

const TEN_MIN_MS = 10 * 60 * 1000;
const BUFFER_MS  =  2 * 60 * 1000;  // wait 2 min after upload before fetching
const GIVE_UP_MS =  3 * 60 * 60 * 1000;  // give up after 3 hours

// ─── Metrics per game ─────────────────────────────────────────────────────────

const METRICS_BY_GAME: Record<string, string[]> = {
  single_leg_stand: ['pulse-rate', 'accelerometers-std', 'activity-intensity', 'body-position'],
  walk_and_turn:    ['pulse-rate', 'accelerometers-std', 'step-counts', 'activity-intensity'],
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmpaticaCfg {
  orgId: string;
  siteId: string;
  participantId: string;
  deviceId: string;
  subjectId: string;
}

interface MinuteRow {
  timestamp: number;
  datetime: string;
  value: number;
}

// ─── Timing helpers ───────────────────────────────────────────────────────────

/**
 * Given a game's start time, returns the two UTC timestamps at which we should
 * fetch S3 data:
 *   first  = the 10-min upload mark immediately after the game started + 2 min buffer
 *   second = the following 10-min upload mark + 2 min buffer
 *
 * Example: game starts 09:28
 *   nextUpload = 09:30
 *   first      = 09:32   ← fetch, store as 'partial'
 *   second     = 09:42   ← fetch again, overwrite as 'fetched' (more accurate)
 */
function getUploadBoundaries(gameStartIso: string): { first: number; second: number } {
  const startMs    = new Date(gameStartIso).getTime();
  const startMinMs = Math.floor(startMs / 60_000) * 60_000;
  // Next 10-minute boundary strictly after the game started
  const nextUpload = Math.ceil((startMinMs + 1) / TEN_MIN_MS) * TEN_MIN_MS;
  return {
    first:  nextUpload + BUFFER_MS,
    second: nextUpload + TEN_MIN_MS + BUFFER_MS,
  };
}

// ─── S3 helpers ───────────────────────────────────────────────────────────────

async function streamToString(body: unknown): Promise<string> {
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks).toString('utf-8');
  }
  if (typeof (body as Blob).text === 'function') return (body as Blob).text();
  throw new Error('Unexpected S3 body type');
}

function parseCSV(text: string): MinuteRow[] {
  const lines = text.trim().split('\n').slice(1);
  const rows: MinuteRow[] = [];
  for (const line of lines) {
    const cols = line.split(',').map(v => v.trim());
    if (cols.length < 4 || cols[3] === '') continue;
    const ts  = Number(cols[0]);
    const val = Number(cols[3]);
    if (!isNaN(ts) && !isNaN(val)) rows.push({ timestamp: ts, datetime: cols[1], value: val });
  }
  return rows;
}

async function fetchMetric(
  s3: S3Client,
  cfg: EmpaticaCfg,
  dateStr: string,
  metric: string,
  startMs: number,
  endMs: number,
): Promise<MinuteRow[]> {
  const key =
    `v2/${cfg.orgId}/${cfg.siteId}/${cfg.participantId}/participant_data/` +
    `${dateStr}/${cfg.deviceId}/digital_biomarkers/aggregated_per_minute/` +
    `${cfg.subjectId}_${dateStr}_${metric}.csv`;
  try {
    const res  = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const text = await streamToString(res.Body);
    return parseCSV(text).filter(r => r.timestamp >= startMs && r.timestamp <= endMs);
  } catch (e: unknown) {
    if ((e as { name?: string }).name === 'NoSuchKey') return [];
    throw e;
  }
}

/**
 * Fetches all configured metrics for a game and returns them keyed by
 * snake_case metric name. Returns an empty object if no rows found at all.
 *
 * For session games we only have a start time, so endMs = startMinute + 2 min
 * to cover the game window (games are ≤ 30 s so they span at most 2 minutes).
 */
async function fetchGameMetrics(
  s3: S3Client,
  cfg: EmpaticaCfg,
  gameType: string,
  startIso: string,
  endIso?: string,
): Promise<Record<string, MinuteRow[]>> {
  const startMs    = new Date(startIso).getTime();
  const startMinMs = Math.floor(startMs / 60_000) * 60_000;
  const endMs      = endIso
    ? new Date(endIso).getTime()
    : startMinMs + 60_000;  // 1-minute window — only the minute the game was played

  const dateStr = new Date(startIso).toISOString().slice(0, 10);
  const metrics = METRICS_BY_GAME[gameType];
  if (!metrics) return {};  // game type has no Empatica data

  const result: Record<string, MinuteRow[]> = {};
  let hasData = false;

  for (const metric of metrics) {
    // Use startMinMs (floor to minute) so rows timestamped at the start of the
    // game's minute (e.g. 05:41:00 for a game starting at 05:41:54) are included.
    const rows = await fetchMetric(s3, cfg, dateStr, metric, startMinMs, endMs);
    result[metric.replace(/-/g, '_')] = rows;
    if (rows.length > 0) hasData = true;
  }

  return hasData ? result : {};
}

// ─── Individual game_results processing ──────────────────────────────────────

async function processIndividualGames(s3: S3Client, now: number): Promise<void> {
  const snap = await db.collection('game_results')
    .where('empaticaStatus', 'in', ['pending', 'partial'])
    .get();

  console.log(`[Empatica/individual] ${snap.size} record(s) to check`);

  for (const doc of snap.docs) {
    const d          = doc.data();
    const startIso   = d.empaticaStartTime as string;
    const endIso     = d.empaticaEndTime   as string;
    const status     = d.empaticaStatus    as string;
    const gameType   = d.gameType          as string;
    const boundaries = getUploadBoundaries(startIso);
    const startMs    = new Date(startIso).getTime();

    if (now - startMs > GIVE_UP_MS) {
      await doc.ref.update({ empaticaStatus: 'unavailable' });
      console.log(`[Empatica/individual] ${doc.id} — giving up (> 3 h old)`);
      continue;
    }

    const cfg: EmpaticaCfg = {
      orgId:         d.empaticaOrgId,
      siteId:        d.empaticaSiteId,
      participantId: d.empaticaParticipantId,
      deviceId:      d.empaticaDeviceId,
      subjectId:     d.empaticaSubjectId,
    };

    try {
      if (status === 'pending' && now >= boundaries.first) {
        const data = await fetchGameMetrics(s3, cfg, gameType, startIso, endIso);
        if (Object.keys(data).length > 0) {
          await doc.ref.update({
            empaticaStatus: 'partial',
            empaticaData: data,
            empaticaFirstFetchAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log(`[Empatica/individual] ${doc.id} (${gameType}) — first fetch done`);
        } else {
          console.log(`[Empatica/individual] ${doc.id} (${gameType}) — no data yet, will retry`);
        }
      } else if (status === 'partial' && now >= boundaries.second) {
        const data = await fetchGameMetrics(s3, cfg, gameType, startIso, endIso);
        // Always mark fetched at second window — overwrite data if better, keep old if not
        await doc.ref.update({
          empaticaStatus: 'fetched',
          ...(Object.keys(data).length > 0 ? { empaticaData: data } : {}),
          empaticaFetchedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[Empatica/individual] ${doc.id} (${gameType}) — second fetch done (final)`);
      }
    } catch (e) {
      console.error(`[Empatica/individual] ${doc.id} error:`, e);
    }
  }
}

// ─── Full session processing ──────────────────────────────────────────────────

async function processSessionGames(s3: S3Client, now: number): Promise<void> {
  const snap = await db.collection('sessions')
    .where('empaticaSessionStatus', 'in', ['pending', 'partial'])
    .get();

  console.log(`[Empatica/session] ${snap.size} session(s) to check`);

  for (const sessionDoc of snap.docs) {
    const d         = sessionDoc.data();
    const gameTimes = (d.gameTimes ?? {}) as Record<string, string>;
    const games     = (d.games     ?? {}) as Record<string, any>;

    const cfg: EmpaticaCfg = {
      orgId:         d.empaticaOrgId,
      siteId:        d.empaticaSiteId,
      participantId: d.empaticaParticipantId,
      deviceId:      d.empaticaDeviceId,
      subjectId:     d.empaticaSubjectId,
    };

    // Firestore dot-notation updates so we only touch changed game fields
    const updates: Record<string, any> = {};

    for (const [gameType, startIso] of Object.entries(gameTimes)) {
      // Skip games that don't produce Empatica watch data
      if (!METRICS_BY_GAME[gameType]) continue;

      const gameData = games[gameType] ?? {};
      const status   = gameData.empaticaStatus as string | undefined;

      if (!status || status === 'fetched' || status === 'unavailable') continue;

      const boundaries = getUploadBoundaries(startIso);
      const startMs    = new Date(startIso).getTime();

      if (now - startMs > GIVE_UP_MS) {
        updates[`games.${gameType}.empaticaStatus`] = 'unavailable';
        console.log(`[Empatica/session] ${sessionDoc.id} / ${gameType} — giving up`);
        continue;
      }

      try {
        if (status === 'pending' && now >= boundaries.first) {
          const data = await fetchGameMetrics(s3, cfg, gameType, startIso);
          if (Object.keys(data).length > 0) {
            updates[`games.${gameType}.empaticaStatus`] = 'partial';
            updates[`games.${gameType}.empaticaData`]   = data;
            console.log(`[Empatica/session] ${sessionDoc.id} / ${gameType} — first fetch done`);
          } else {
            console.log(`[Empatica/session] ${sessionDoc.id} / ${gameType} — no data yet`);
          }
        } else if (status === 'partial' && now >= boundaries.second) {
          const data = await fetchGameMetrics(s3, cfg, gameType, startIso);
          updates[`games.${gameType}.empaticaStatus`] = 'fetched';
          if (Object.keys(data).length > 0) {
            updates[`games.${gameType}.empaticaData`] = data;
          }
          console.log(`[Empatica/session] ${sessionDoc.id} / ${gameType} — second fetch done (final)`);
        }
      } catch (e) {
        console.error(`[Empatica/session] ${sessionDoc.id} / ${gameType} error:`, e);
      }
    }

    if (Object.keys(updates).length === 0) continue;

    // Recalculate top-level status based only on empatica-relevant games
    const empaticaGameTypes = Object.keys(gameTimes).filter(gt => METRICS_BY_GAME[gt]);
    const mergedStatuses = empaticaGameTypes.map(gt => {
      const updatedStatus = updates[`games.${gt}.empaticaStatus`];
      return updatedStatus ?? (games[gt]?.empaticaStatus as string | undefined);
    });

    const allDone    = mergedStatuses.length > 0 && mergedStatuses.every(s => s === 'fetched' || s === 'unavailable');
    const anyPartial = mergedStatuses.some(s => s === 'partial');
    updates['empaticaSessionStatus'] = allDone ? 'fetched' : anyPartial ? 'partial' : 'pending';

    await sessionDoc.ref.update(updates);
    console.log(`[Empatica/session] ${sessionDoc.id} — saved updates, session status: ${updates['empaticaSessionStatus']}`);
  }
}

// ─── Scheduled entry point ────────────────────────────────────────────────────

export const fetchEmpaticaData = onSchedule(
  {
    schedule: 'every 5 minutes',
    secrets: [awsKeyId, awsSecretKey],
    timeoutSeconds: 120,
    region: 'us-central1',
  },
  async () => {
    const s3 = new S3Client({
      region: REGION,
      credentials: {
        accessKeyId:     awsKeyId.value(),
        secretAccessKey: awsSecretKey.value(),
      },
    });

    const now = Date.now();
    await processIndividualGames(s3, now);
    await processSessionGames(s3, now);
  },
);
