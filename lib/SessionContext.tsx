import React, { createContext, useContext, useRef, useState } from 'react';
import { saveSession } from './saveSession';
import { EMPATICA_PARTICIPANT } from './empaticaConfig';

export const GAME_ROUTES: Record<string, string> = {
  visual_pursuit: '/(tabs)/(games)/VisualPursuit/VisualPursuit',
  dsst: '/(tabs)/(games)/DSST/DSST',
  tongue_twister: '/(tabs)/(games)/TongueTwister/TongueTwister',
  choice_reaction: '/(tabs)/(games)/ChoiceReaction/ChoiceReaction',
  stroop_naming: '/(tabs)/(games)/StroopNaming/StroopNaming',
  trail_task: '/(tabs)/(games)/TrailTask/TrailTask',
  typing_game: '/(tabs)/(games)/TypingGame/TypingGame',
  single_leg_stand: '/(tabs)/(games)/SingleLegStand/SingleLegStand',
  walk_and_turn: '/(tabs)/(games)/WalkAndTurn/WalkAndTurn',
};

export const GAME_NAMES: Record<string, string> = {
  visual_pursuit: 'Visual Pursuit',
  dsst: 'DSST',
  tongue_twister: 'Tongue Twisters',
  choice_reaction: 'Choice Reaction',
  stroop_naming: 'Stroop Naming',
  trail_task: 'Trail Task',
  typing_game: 'Typing Game',
  single_leg_stand: 'Single Leg Stand',
  walk_and_turn: 'Walk and Turn',
};

// Default metric values used for games not played in a partial session.
const DEFAULT_GAME_METRICS: Record<string, Record<string, any>> = {
  visual_pursuit:   { apiSuccess: false, played: false },
  dsst:             { score: 0, accuracy: 0, totalAttempts: 0, played: false },
  tongue_twister:   { phrasesCompleted: 0, correctReadings: 0, avgJitter: 0, avgShimmer: 0, avgPhonemeErrorRate: 0, avgSpeakingRate: 0, played: false },
  choice_reaction:  { avgPressReactionTimeMs: 0, avgReleaseReactionTimeMs: 0, timeDeltaSeconds: 0, played: false },
  stroop_naming:    { score: 0, accuracy: 0, totalAttempts: 0, avgReactionTimeMs: 0, timeDeltaSeconds: 0, played: false },
  trail_task:       { completionTimeSeconds: 0, errorCount: 0, played: false },
  typing_game:      { wpm: 0, accuracy: 0, efficiency: 0, played: false },
  single_leg_stand: { stabilityScore: 0, sampleCount: 0, averageGyro: { x: 0, y: 0, z: 0 }, played: false },
  walk_and_turn:    { stabilityScore: 0, forwardGyroAvg: 0, backGyroAvg: 0, totalSamples: 0, played: false },
};

const ALL_GAMES = [
  'visual_pursuit',
  'dsst',
  'tongue_twister',
  'choice_reaction',
  'stroop_naming',
  'trail_task',
  'typing_game',
  'single_leg_stand',
  'walk_and_turn',
];

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface SessionContextType {
  sessionMode: 'individual' | 'full_session';
  setSessionMode: (mode: 'individual' | 'full_session') => void;
  sessionResults: Record<string, any>;
  sessionGameTimes: Record<string, string>;
  sessionStartTime: Date | null;
  gameQueue: string[];
  currentGameIndex: number;
  sessionId: string | null;
  partialSessionId: string | null;
  startSession: () => void;
  resumeSession: (partial: import('./firestore').PartialSessionDoc) => void;
  completeGame: (gameType: string, metrics: any, startTime?: Date) => void;
  updateGameResult: (gameType: string, updates: Record<string, any>) => void;
  addPendingJob: (job: Promise<void>) => void;
  awaitAllPendingJobs: () => Promise<void>;
  hasPendingJobs: () => boolean;
  isLastGame: () => boolean;
  getCurrentGame: () => string | null;
  getNextGame: () => string | null;
  getLastCompletedGame: () => string | null;
  getCompletedCount: () => number;
  resetSession: () => void;
  savePartialSession: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessionMode, setSessionMode] = useState<'individual' | 'full_session'>('individual');
  const [sessionResults, setSessionResults] = useState<Record<string, any>>({});
  const sessionResultsRef = useRef<Record<string, any>>({});
  // Background API jobs (e.g. VP/TT analysis during session) — not state to avoid re-renders
  const pendingJobsRef = useRef<Promise<void>[]>([]);
  const [sessionGameTimes, setSessionGameTimes] = useState<Record<string, string>>({});
  const sessionGameTimesRef = useRef<Record<string, string>>({});
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const sessionStartTimeRef = useRef<Date | null>(null);
  const [gameQueue, setGameQueue] = useState<string[]>([]);
  const gameQueueRef = useRef<string[]>([]);
  const [currentGameIndex, setCurrentGameIndex] = useState(0);
  // Ref mirrors currentGameIndex but updates synchronously — prevents stale-closure
  // bugs in isLastGame/getCurrentGame/getNextGame called right after completeGame.
  const currentGameIndexRef = useRef(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Stores the Firestore doc ID of the partial session being resumed, so the final
  // save updates that document instead of creating a new one.
  const [partialSessionId, setPartialSessionId] = useState<string | null>(null);

  const startSession = () => {
    const queue = shuffleArray(ALL_GAMES);
    const id = `session_${Date.now()}`;
    const now = new Date();
    setSessionMode('full_session');
    setGameQueue(queue);
    gameQueueRef.current = queue;
    currentGameIndexRef.current = 0;
    setCurrentGameIndex(0);
    setSessionResults({});
    sessionResultsRef.current = {};
    setSessionGameTimes({});
    sessionGameTimesRef.current = {};
    setSessionStartTime(now);
    sessionStartTimeRef.current = now;
    setSessionId(id);
  };

  const completeGame = (gameType: string, metrics: any, startTime?: Date) => {
    setSessionResults(prev => {
      const next = { ...prev, [gameType]: metrics };
      sessionResultsRef.current = next;
      return next;
    });
    if (startTime) {
      const iso = startTime.toISOString();
      setSessionGameTimes(prev => {
        const next = { ...prev, [gameType]: iso };
        sessionGameTimesRef.current = next;
        return next;
      });
    }
    currentGameIndexRef.current += 1;
    setCurrentGameIndex(currentGameIndexRef.current);
  };

  // Merge updates into an already-completed game's metrics (used by background jobs
  // that finish after completeGame has already been called with placeholder data).
  const updateGameResult = (gameType: string, updates: Record<string, any>) => {
    setSessionResults(prev => {
      const next = { ...prev, [gameType]: { ...(prev[gameType] ?? {}), ...updates } };
      sessionResultsRef.current = next;
      return next;
    });
  };

  const addPendingJob = (job: Promise<void>) => {
    pendingJobsRef.current = [...pendingJobsRef.current, job];
  };

  const awaitAllPendingJobs = async () => {
    if (pendingJobsRef.current.length === 0) return;
    await Promise.allSettled(pendingJobsRef.current);
    pendingJobsRef.current = [];
  };

  const hasPendingJobs = () => pendingJobsRef.current.length > 0;

  // Restores a previously saved partial session so the user can continue from where they left off.
  const resumeSession = (partial: import('./firestore').PartialSessionDoc) => {
    const firstUnplayedIndex = partial.gamesCompleted;

    setSessionMode('full_session');
    setGameQueue(partial.gameQueue);
    gameQueueRef.current = partial.gameQueue;
    currentGameIndexRef.current = firstUnplayedIndex;
    setCurrentGameIndex(firstUnplayedIndex);

    // Pre-populate results for already-played games (so the final save has complete data)
    const playedResults: Record<string, any> = {};
    for (const game of partial.gameQueue) {
      if (partial.gameTimes[game] !== undefined) {
        playedResults[game] = partial.games[game] ?? {};
      }
    }
    setSessionResults(playedResults);
    sessionResultsRef.current = playedResults;

    setSessionGameTimes(partial.gameTimes);
    sessionGameTimesRef.current = partial.gameTimes;

    const start = new Date(partial.startTime);
    setSessionStartTime(start);
    sessionStartTimeRef.current = start;

    setPartialSessionId(partial.id);
    setSessionId(partial.id);
  };

  const savePartialSession = () => {
    const startTime = sessionStartTimeRef.current;
    const queue = gameQueueRef.current;
    // Save as long as the session was started — even if no game was completed yet.
    if (!startTime || queue.length === 0) return;
    const results = sessionResultsRef.current;
    const paddedResults: Record<string, any> = {};
    for (const game of queue) {
      paddedResults[game] = results[game] ?? DEFAULT_GAME_METRICS[game] ?? { played: false };
    }
    saveSession(
      EMPATICA_PARTICIPANT.fullId,
      startTime,
      new Date(),
      paddedResults,
      sessionGameTimesRef.current,
      'partial',
      queue,
      partialSessionId ?? undefined,
    ).then(id => {
      if (id) setPartialSessionId(id);
    }).catch(e => console.log('[Session] Partial save error:', e));
  };

  // All navigation helpers read from refs so they reflect the updated index
  // even when called in the same tick as completeGame (before React re-renders).
  // isLastGame is called AFTER completeGame has already incremented the ref,
  // so we compare against the full length (not length-1).
  const isLastGame = () => currentGameIndexRef.current >= gameQueueRef.current.length;
  const getCurrentGame = () => gameQueueRef.current[currentGameIndexRef.current] ?? null;
  // After completeGame increments the index, getCurrentGame IS the next game to play.
  const getNextGame = () => gameQueueRef.current[currentGameIndexRef.current] ?? null;
  // The game that was just finished (one step behind current).
  const getLastCompletedGame = () => gameQueueRef.current[currentGameIndexRef.current - 1] ?? null;
  const getCompletedCount = () => currentGameIndexRef.current;

  const resetSession = () => {
    setSessionMode('individual');
    setSessionResults({});
    sessionResultsRef.current = {};
    setSessionGameTimes({});
    sessionGameTimesRef.current = {};
    setSessionStartTime(null);
    sessionStartTimeRef.current = null;
    setGameQueue([]);
    gameQueueRef.current = [];
    currentGameIndexRef.current = 0;
    setCurrentGameIndex(0);
    setSessionId(null);
    setPartialSessionId(null);
    pendingJobsRef.current = [];
  };

  return (
    <SessionContext.Provider value={{
      sessionMode,
      setSessionMode,
      sessionResults,
      sessionGameTimes,
      sessionStartTime,
      gameQueue,
      currentGameIndex,
      sessionId,
      partialSessionId,
      startSession,
      resumeSession,
      completeGame,
      updateGameResult,
      addPendingJob,
      awaitAllPendingJobs,
      hasPendingJobs,
      isLastGame,
      getCurrentGame,
      getNextGame,
      getLastCompletedGame,
      getCompletedCount,
      resetSession,
      savePartialSession,
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
