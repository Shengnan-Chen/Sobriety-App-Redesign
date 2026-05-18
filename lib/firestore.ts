import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import { EMPATICA_PARTICIPANT } from './empaticaConfig';

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
  participantId: string,
): Promise<HistoryPoint[]> {
  try {
    const q = query(
      collection(db, 'game_results'),
      where('gameType', '==', gameType),
      where('participantId', '==', participantId),
    );
    const snap = await getDocs(q);
    const points: HistoryPoint[] = [];
    snap.docs.forEach(doc => {
      const d = doc.data();
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
  participantId: string,
  sessionType?: 'individual' | 'full_session',
): Promise<HistoricalRecord[]> {
  try {
    const q = query(
      collection(db, 'game_results'),
      where('gameType', '==', gameType),
      where('participantId', '==', participantId),
    );
    const snap = await getDocs(q);
    return snap.docs
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
  participantId: string,
): Promise<HistoricalRecord[]> {
  try {
    const q = query(
      collection(db, 'sessions'),
      where('participantId', '==', participantId),
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
    const docRef = await addDoc(collection(db, 'game_results'), {
      gameType,
      participantId,
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
    });
    console.log(`[Firestore] Saved ${gameType} result:`, docRef.id);
    return docRef.id;
  } catch (e) {
    console.log('[Firestore] Save error:', e);
    return null;
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
  participantId: string,
): Promise<PartialSessionDoc | null> {
  if (!participantId) return null;
  try {
    // Single-field queries only — no composite index needed.
    // We filter by status client-side and pick the most recent by startTime.
    const q = query(
      collection(db, 'sessions'),
      where('participantId', '==', participantId),
      where('status', '==', 'partial'),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    // Sort client-side to get the most recent partial session
    const sorted = snap.docs.sort((a, b) => {
      const aT = (a.data().startTime as string) ?? '';
      const bT = (b.data().startTime as string) ?? '';
      return bT.localeCompare(aT);
    });
    const d = sorted[0];
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
