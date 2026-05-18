import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { EMPATICA_S3, EMPATICA_PARTICIPANT } from './empaticaConfig';

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
      await updateDoc(doc(db, 'sessions', existingDocId), data);
      console.log('[Session] Updated session:', existingDocId);
      return existingDocId;
    } else {
      const docRef = await addDoc(collection(db, 'sessions'), {
        ...data,
        createdAt: serverTimestamp(),
      });
      console.log('[Session] Saved session:', docRef.id);
      return docRef.id;
    }
  } catch (e) {
    console.log('[Session] Save error:', e);
    return null;
  }
}
