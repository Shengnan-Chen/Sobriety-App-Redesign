import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db, auth } from './firebase';
import { EMPATICA_PARTICIPANT } from './empaticaConfig';
import { retryAsync } from './retry';

export type GameType =
  | 'visual_pursuit'
  | 'dsst'
  | 'tongue_twister'
  | 'choice_reaction'
  | 'stroop_naming'
  | 'trail_task'
  | 'typing_game'
  | 'single_leg_stand'
  | 'walk_and_turn';

export const GAME_METRIC_LABEL: Record<string, string> = {
  dsst: 'Accuracy (%)',
  stroop_naming: 'Accuracy (%)',
  typing_game: 'WPM',
  single_leg_stand: 'Stability Score',
  walk_and_turn: 'Stability Score',
  choice_reaction: 'Reaction Time (ms)',
  trail_task: 'Completion Time (s)',
  tongue_twister: 'Phrases Completed',
};

export function extractPrimaryScore(gameType: string, metrics: any): number | null {
  if (!metrics || metrics.skipped) return null;
  switch (gameType) {
    case 'dsst':
    case 'stroop_naming':
      return typeof metrics.accuracy === 'number' ? metrics.accuracy : null;
    case 'typing_game':
      return typeof metrics.wpm === 'number' ? metrics.wpm : null;
    case 'single_leg_stand':
    case 'walk_and_turn':
      return typeof metrics.stabilityScore === 'number' ? metrics.stabilityScore : null;
    case 'choice_reaction':
      return typeof metrics.avgPressReactionTimeMs === 'number' ? metrics.avgPressReactionTimeMs : null;
    case 'trail_task':
      return typeof metrics.completionTimeSeconds === 'number' ? metrics.completionTimeSeconds : null;
    case 'tongue_twister':
      return typeof metrics.phrasesCompleted === 'number' ? metrics.phrasesCompleted : null;
    default:
      return null;
  }
}

export interface HistoryPoint {
  date: string;
  value: number;
}

export async function fetchGameHistory(
  gameType: string,
  _participantId?: string,
): Promise<HistoryPoint[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    // Single-field query only (userUid) — gameType filtered client-side to avoid composite index
    const q = query(
      collection(db, 'game_results'),
      where('userUid', '==', uid),
    );
    const snap = await getDocs(q);
    const points: HistoryPoint[] = [];
    snap.docs.forEach(doc => {
      const d = doc.data();
      if (d.gameType !== gameType) return;  // client-side gameType filter
      const value = extractPrimaryScore(gameType, d.metrics);
      if (value !== null && d.startTime) {
        points.push({ date: d.startTime, value });
      }
    });
    points.sort((a, b) => a.date.localeCompare(b.date));
    return points;
  } catch (e) {
    console.log('[Firestore] fetchGameHistory error:', e);
    return [];
  }
}

export interface HistoricalRecord {
  date: string;
  metrics: Record<string, any>;
  sessionType?: 'individual' | 'full_session';
}

export async function fetchGameHistoryFull(
  gameType: string,
  _participantId?: string,
  sessionType?: 'individual' | 'full_session',
): Promise<HistoricalRecord[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const q = query(
      collection(db, 'game_results'),
      where('userUid', '==', uid),
    );
    const snap = await getDocs(q);
    return snap.docs
      .filter(doc => doc.data().gameType === gameType)
      .map(doc => {
        const d = doc.data();
        return {
          date: d.startTime as string,
          metrics: d.metrics ?? {},
          sessionType: d.sessionType as 'individual' | 'full_session' | undefined,
        };
      })
      .filter(r => {
        if (!r.date || r.metrics?.skipped) return false;
        if (!sessionType) return true;
        // Records without sessionType field are legacy individual plays
        const recType = r.sessionType ?? 'individual';
        return recType === sessionType;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) {
    console.log('[Firestore] fetchGameHistoryFull error:', e);
    return [];
  }
}

// Fetches per-game metrics from the sessions collection for full-session trend graphs.
// Each session document has a `games` map; this extracts the entry for the given gameType.
export async function fetchSessionGameHistory(
  gameType: string,
  _participantId: string,
): Promise<HistoricalRecord[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const q = query(
      collection(db, 'sessions'),
      where('userUid', '==', uid),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(doc => {
        const d = doc.data();
        const gameMetrics = d.games?.[gameType];
        return {
          date: d.startTime as string,
          metrics: gameMetrics ?? {},
        };
      })
      .filter(r => r.date && r.metrics && r.metrics.played !== false)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) {
    console.log('[Firestore] fetchSessionGameHistory error:', e);
    return [];
  }
}

const EMPATICA_GAME_TYPES = new Set<GameType>(['walk_and_turn', 'single_leg_stand']);

export async function saveGameResult(
  gameType: GameType,
  participantId: string,
  startTime: Date,
  endTime: Date,
  metrics: Record<string, any>,
  sessionType: 'individual' | 'full_session' = 'individual',
) {
  const needsEmpatica = EMPATICA_GAME_TYPES.has(gameType);
  try {
    // Retry on transient failures so a dropped connection doesn't lose this result.
    const docRef = await retryAsync(() => addDoc(collection(db, 'game_results'), {
      gameType,
      participantId,
      userUid:   auth.currentUser?.uid   ?? null,
      userEmail: auth.currentUser?.email ?? null,
      sessionType,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationSeconds: Math.round((endTime.getTime() - startTime.getTime()) / 1000),
      metrics,
      createdAt: serverTimestamp(),
      // Empatica watch data only needed for balance/gait games
      ...(needsEmpatica ? {
        empaticaStatus: 'pending',
        empaticaStartTime: startTime.toISOString(),
        empaticaEndTime: endTime.toISOString(),
        empaticaOrgId:         EMPATICA_PARTICIPANT.orgId,
        empaticaSiteId:        EMPATICA_PARTICIPANT.siteId,
        empaticaParticipantId: EMPATICA_PARTICIPANT.participantId,
        empaticaDeviceId:      EMPATICA_PARTICIPANT.deviceId,
        empaticaSubjectId:     EMPATICA_PARTICIPANT.subjectId,
      } : {}),
    }), 3, 2000);
    console.log(`[Firestore] Saved ${gameType} result:`, docRef.id);
    return docRef.id;
  } catch (e) {
    console.log('[Firestore] Save error (all retries failed):', e);
    return null;
  }
}

export interface SessionSummary {
  id: string;
  startTime: string;
  endTime: string;
  games: Record<string, any>;
  gameQueue: string[];
}

export async function fetchAllSessions(_participantId?: string): Promise<SessionSummary[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const q = query(
      collection(db, 'sessions'),
      where('userUid', '==', uid),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => {
        const data = d.data();
        return {
          id: d.id,
          startTime: (data.startTime ?? '') as string,
          endTime: (data.endTime ?? '') as string,
          games: (data.games ?? {}) as Record<string, any>,
          gameQueue: (data.gameQueue ?? []) as string[],
          status: (data.status ?? '') as string,
        };
      })
      .filter(d => d.status === 'complete')
      .sort((a, b) => b.startTime.localeCompare(a.startTime));
  } catch (e) {
    console.log('[Firestore] fetchAllSessions error:', e);
    return [];
  }
}

/** Directly patches a single game's metrics inside a session document.
 *  Used by background jobs (e.g. VP video upload) that finish after the session
 *  context may have already been reset, so we can't rely on savePartialSession. */
export async function updateSessionGameResult(
  sessionDocId: string,
  gameType: string,
  metrics: Record<string, any>,
): Promise<void> {
  try {
    // Retry on transient failures — this is the write that lands video URLs in the
    // session document, so it must not be lost to a single dropped connection.
    await retryAsync(() => updateDoc(doc(db, 'sessions', sessionDocId), {
      [`games.${gameType}`]: metrics,
    }), 3, 2000);
    console.log(`[Firestore] Patched session ${sessionDocId} → games.${gameType}`);
  } catch (e) {
    console.log('[Firestore] updateSessionGameResult error (all retries failed):', e);
  }
}

/** Marks a partial session as abandoned so it no longer shows up as resumable. */
export async function abandonPartialSession(docId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'sessions', docId), { status: 'abandoned' });
  } catch (e) {
    console.log('[Firestore] abandonPartialSession error:', e);
  }
}

export interface PartialSessionDoc {
  id: string;
  gameQueue: string[];
  games: Record<string, any>;
  gameTimes: Record<string, string>;
  startTime: string;
  gamesCompleted: number;
}

export async function fetchLatestPartialSession(
  _participantId?: string,
): Promise<PartialSessionDoc | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  try {
    // Single-field query — filters status='partial' client-side to avoid composite index.
    const q = query(
      collection(db, 'sessions'),
      where('userUid', '==', uid),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    // Filter status='partial' and sort to get the most recent
    const partialDocs = snap.docs
      .filter(d => d.data().status === 'partial')
      .sort((a, b) => {
        const aT = (a.data().startTime as string) ?? '';
        const bT = (b.data().startTime as string) ?? '';
        return bT.localeCompare(aT);
      });
    if (partialDocs.length === 0) return null;
    const d = partialDocs[0];
    const data = d.data();
    const gameTimes = (data.gameTimes ?? {}) as Record<string, string>;
    return {
      id: d.id,
      gameQueue: (data.gameQueue ?? []) as string[],
      games: (data.games ?? {}) as Record<string, any>,
      gameTimes,
      startTime: data.startTime as string,
      gamesCompleted: Object.keys(gameTimes).length,
    };
  } catch (e) {
    console.log('[Firestore] fetchLatestPartialSession error:', e);
    return null;
  }
}
