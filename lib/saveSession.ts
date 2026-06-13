import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { EMPATICA_PARTICIPANT } from './empaticaConfig';
import { retryAsync } from './retry';

const EMPATICA_GAMES = new Set(['walk_and_turn', 'single_leg_stand']);

export async function saveSession(
  participantId: string,
  startTime: Date,
  endTime: Date,
  results: Record<string, any>,
  gameTimes: Record<string, string> = {},
  status: 'complete' | 'partial' = 'complete',
  gameQueue: string[] = [],
  existingDocId?: string,   // If set, updates the existing doc instead of creating a new one
): Promise<string | null> {
  try {
    const gamesOut: Record<string, any> = {};
    for (const [gameType, metrics] of Object.entries(results)) {
      if (metrics?.played === false) {
        gamesOut[gameType] = metrics;
      } else if (EMPATICA_GAMES.has(gameType)) {
        gamesOut[gameType] = {
          ...metrics,
          empaticaStatus: gameTimes[gameType] ? 'pending' : 'unavailable',
          empaticaData: null,
        };
      } else {
        gamesOut[gameType] = metrics;
      }
    }

    const playedEmpaticaGames = Object.keys(gameTimes).filter(g => EMPATICA_GAMES.has(g));
    const hasEmpaticaGames = playedEmpaticaGames.length > 0;

    const data: Record<string, any> = {
      participantId,
      userUid:   auth.currentUser?.uid   ?? null,
      userEmail: auth.currentUser?.email ?? null,
      mode: 'full_session',
      status,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationSeconds: Math.round((endTime.getTime() - startTime.getTime()) / 1000),
      games: gamesOut,
      gameTimes,
      gameQueue,
      empaticaSessionStatus: hasEmpaticaGames ? 'pending' : 'unavailable',
      empaticaOrgId:         EMPATICA_PARTICIPANT.orgId,
      empaticaSiteId:        EMPATICA_PARTICIPANT.siteId,
      empaticaParticipantId: EMPATICA_PARTICIPANT.participantId,
      empaticaDeviceId:      EMPATICA_PARTICIPANT.deviceId,
      empaticaSubjectId:     EMPATICA_PARTICIPANT.subjectId,
    };

    if (existingDocId) {
      // Use dot-notation for every game field so a later savePartialSession never
      // clobbers a background-job patch (e.g. VP video results) that already landed.
      const { games, ...rest } = data;
      const dotGames: Record<string, any> = {};
      for (const [k, v] of Object.entries(games as Record<string, any>)) {
        dotGames[`games.${k}`] = v;
      }
      // Retry on transient failures so a dropped connection doesn't lose this session save.
      await retryAsync(() => updateDoc(doc(db, 'sessions', existingDocId), { ...rest, ...dotGames }), 3, 2000);
      console.log('[Session] Updated session:', existingDocId);
      return existingDocId;
    } else {
      const docRef = await retryAsync(() => addDoc(collection(db, 'sessions'), {
        ...data,
        createdAt: serverTimestamp(),
      }), 3, 2000);
      console.log('[Session] Saved session:', docRef.id);
      return docRef.id;
    }
  } catch (e) {
    console.log('[Session] Save error:', e);
    return null;
  }
}
