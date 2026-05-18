"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchEmpaticaData = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const params_1 = require("firebase-functions/params");
const client_s3_1 = require("@aws-sdk/client-s3");
const stream_1 = require("stream");
admin.initializeApp();
const db = admin.firestore();
const awsKeyId = (0, params_1.defineSecret)('AWS_ACCESS_KEY_ID');
const awsSecretKey = (0, params_1.defineSecret)('AWS_SECRET_ACCESS_KEY');
const BUCKET = 'empatica-us-east-1-prod-data';
const REGION = 'us-east-1';
// ─── Timing constants ─────────────────────────────────────────────────────────
const TEN_MIN_MS = 10 * 60 * 1000;
const BUFFER_MS = 2 * 60 * 1000; // wait 2 min after upload before fetching
const GIVE_UP_MS = 3 * 60 * 60 * 1000; // give up after 3 hours
// ─── Metrics per game ─────────────────────────────────────────────────────────
// Only these two games produce Empatica watch data worth fetching.
const METRICS_BY_GAME = {
    single_leg_stand: ['pulse-rate', 'accelerometers-std', 'activity-intensity', 'body-position'],
    walk_and_turn: ['pulse-rate', 'accelerometers-std', 'step-counts', 'activity-intensity'],
};
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
function getUploadBoundaries(gameStartIso) {
    const startMs = new Date(gameStartIso).getTime();
    const startMinMs = Math.floor(startMs / 60000) * 60000;
    // Next 10-minute boundary strictly after the game started
    const nextUpload = Math.ceil((startMinMs + 1) / TEN_MIN_MS) * TEN_MIN_MS;
    return {
        first: nextUpload + BUFFER_MS,
        second: nextUpload + TEN_MIN_MS + BUFFER_MS,
    };
}
// ─── S3 helpers ───────────────────────────────────────────────────────────────
async function streamToString(body) {
    var _a, e_1, _b, _c;
    if (body instanceof stream_1.Readable) {
        const chunks = [];
        try {
            for (var _d = true, body_1 = __asyncValues(body), body_1_1; body_1_1 = await body_1.next(), _a = body_1_1.done, !_a; _d = true) {
                _c = body_1_1.value;
                _d = false;
                const chunk = _c;
                chunks.push(Buffer.from(chunk));
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = body_1.return)) await _b.call(body_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return Buffer.concat(chunks).toString('utf-8');
    }
    if (typeof body.text === 'function')
        return body.text();
    throw new Error('Unexpected S3 body type');
}
function parseCSV(text) {
    const lines = text.trim().split('\n').slice(1);
    const rows = [];
    for (const line of lines) {
        const cols = line.split(',').map(v => v.trim());
        if (cols.length < 4 || cols[3] === '')
            continue;
        const ts = Number(cols[0]);
        const val = Number(cols[3]);
        if (!isNaN(ts) && !isNaN(val))
            rows.push({ timestamp: ts, datetime: cols[1], value: val });
    }
    return rows;
}
async function fetchMetric(s3, cfg, dateStr, metric, startMs, endMs) {
    const key = `v2/${cfg.orgId}/${cfg.siteId}/${cfg.participantId}/participant_data/` +
        `${dateStr}/${cfg.deviceId}/digital_biomarkers/aggregated_per_minute/` +
        `${cfg.subjectId}_${dateStr}_${metric}.csv`;
    try {
        const res = await s3.send(new client_s3_1.GetObjectCommand({ Bucket: BUCKET, Key: key }));
        const text = await streamToString(res.Body);
        return parseCSV(text).filter(r => r.timestamp >= startMs && r.timestamp <= endMs);
    }
    catch (e) {
        if (e.name === 'NoSuchKey')
            return [];
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
async function fetchGameMetrics(s3, cfg, gameType, startIso, endIso) {
    const startMs = new Date(startIso).getTime();
    const startMinMs = Math.floor(startMs / 60000) * 60000;
    const endMs = endIso
        ? new Date(endIso).getTime()
        : startMinMs + 2 * 60000; // 2-minute window when no end time available
    const dateStr = new Date(startIso).toISOString().slice(0, 10);
    const metrics = METRICS_BY_GAME[gameType];
    if (!metrics)
        return {}; // game type has no Empatica data
    const result = {};
    let hasData = false;
    for (const metric of metrics) {
        const rows = await fetchMetric(s3, cfg, dateStr, metric, startMs, endMs);
        result[metric.replace(/-/g, '_')] = rows;
        if (rows.length > 0)
            hasData = true;
    }
    return hasData ? result : {};
}
// ─── Individual game_results processing ──────────────────────────────────────
async function processIndividualGames(s3, now) {
    const snap = await db.collection('game_results')
        .where('empaticaStatus', 'in', ['pending', 'partial'])
        .get();
    console.log(`[Empatica/individual] ${snap.size} record(s) to check`);
    for (const doc of snap.docs) {
        const d = doc.data();
        const startIso = d.empaticaStartTime;
        const endIso = d.empaticaEndTime;
        const status = d.empaticaStatus;
        const gameType = d.gameType;
        const boundaries = getUploadBoundaries(startIso);
        const startMs = new Date(startIso).getTime();
        if (now - startMs > GIVE_UP_MS) {
            await doc.ref.update({ empaticaStatus: 'unavailable' });
            console.log(`[Empatica/individual] ${doc.id} — giving up (> 3 h old)`);
            continue;
        }
        const cfg = {
            orgId: d.empaticaOrgId,
            siteId: d.empaticaSiteId,
            participantId: d.empaticaParticipantId,
            deviceId: d.empaticaDeviceId,
            subjectId: d.empaticaSubjectId,
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
                }
                else {
                    console.log(`[Empatica/individual] ${doc.id} (${gameType}) — no data yet, will retry`);
                }
            }
            else if (status === 'partial' && now >= boundaries.second) {
                const data = await fetchGameMetrics(s3, cfg, gameType, startIso, endIso);
                // Always mark fetched at second window — overwrite data if better, keep old if not
                await doc.ref.update(Object.assign(Object.assign({ empaticaStatus: 'fetched' }, (Object.keys(data).length > 0 ? { empaticaData: data } : {})), { empaticaFetchedAt: admin.firestore.FieldValue.serverTimestamp() }));
                console.log(`[Empatica/individual] ${doc.id} (${gameType}) — second fetch done (final)`);
            }
        }
        catch (e) {
            console.error(`[Empatica/individual] ${doc.id} error:`, e);
        }
    }
}
// ─── Full session processing ──────────────────────────────────────────────────
async function processSessionGames(s3, now) {
    var _a, _b, _c;
    const snap = await db.collection('sessions')
        .where('empaticaSessionStatus', 'in', ['pending', 'partial'])
        .get();
    console.log(`[Empatica/session] ${snap.size} session(s) to check`);
    for (const sessionDoc of snap.docs) {
        const d = sessionDoc.data();
        const gameTimes = ((_a = d.gameTimes) !== null && _a !== void 0 ? _a : {});
        const games = ((_b = d.games) !== null && _b !== void 0 ? _b : {});
        const cfg = {
            orgId: d.empaticaOrgId,
            siteId: d.empaticaSiteId,
            participantId: d.empaticaParticipantId,
            deviceId: d.empaticaDeviceId,
            subjectId: d.empaticaSubjectId,
        };
        // Firestore dot-notation updates so we only touch changed game fields
        const updates = {};
        for (const [gameType, startIso] of Object.entries(gameTimes)) {
            // Skip games that don't produce Empatica watch data
            if (!METRICS_BY_GAME[gameType])
                continue;
            const gameData = (_c = games[gameType]) !== null && _c !== void 0 ? _c : {};
            const status = gameData.empaticaStatus;
            if (!status || status === 'fetched' || status === 'unavailable')
                continue;
            const boundaries = getUploadBoundaries(startIso);
            const startMs = new Date(startIso).getTime();
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
                        updates[`games.${gameType}.empaticaData`] = data;
                        console.log(`[Empatica/session] ${sessionDoc.id} / ${gameType} — first fetch done`);
                    }
                    else {
                        console.log(`[Empatica/session] ${sessionDoc.id} / ${gameType} — no data yet`);
                    }
                }
                else if (status === 'partial' && now >= boundaries.second) {
                    const data = await fetchGameMetrics(s3, cfg, gameType, startIso);
                    updates[`games.${gameType}.empaticaStatus`] = 'fetched';
                    if (Object.keys(data).length > 0) {
                        updates[`games.${gameType}.empaticaData`] = data;
                    }
                    console.log(`[Empatica/session] ${sessionDoc.id} / ${gameType} — second fetch done (final)`);
                }
            }
            catch (e) {
                console.error(`[Empatica/session] ${sessionDoc.id} / ${gameType} error:`, e);
            }
        }
        if (Object.keys(updates).length === 0)
            continue;
        // Recalculate top-level status based only on empatica-relevant games
        const empaticaGameTypes = Object.keys(gameTimes).filter(gt => METRICS_BY_GAME[gt]);
        const mergedStatuses = empaticaGameTypes.map(gt => {
            var _a;
            const updatedStatus = updates[`games.${gt}.empaticaStatus`];
            return updatedStatus !== null && updatedStatus !== void 0 ? updatedStatus : (_a = games[gt]) === null || _a === void 0 ? void 0 : _a.empaticaStatus;
        });
        const allDone = mergedStatuses.length > 0 && mergedStatuses.every(s => s === 'fetched' || s === 'unavailable');
        const anyPartial = mergedStatuses.some(s => s === 'partial');
        updates['empaticaSessionStatus'] = allDone ? 'fetched' : anyPartial ? 'partial' : 'pending';
        await sessionDoc.ref.update(updates);
        console.log(`[Empatica/session] ${sessionDoc.id} — saved updates, session status: ${updates['empaticaSessionStatus']}`);
    }
}
// ─── Scheduled entry point ────────────────────────────────────────────────────
exports.fetchEmpaticaData = (0, scheduler_1.onSchedule)({
    schedule: 'every 5 minutes',
    secrets: [awsKeyId, awsSecretKey],
    timeoutSeconds: 120,
    region: 'us-central1',
}, async () => {
    const s3 = new client_s3_1.S3Client({
        region: REGION,
        credentials: {
            accessKeyId: awsKeyId.value(),
            secretAccessKey: awsSecretKey.value(),
        },
    });
    const now = Date.now();
    await processIndividualGames(s3, now);
    await processSessionGames(s3, now);
});
//# sourceMappingURL=index.js.map