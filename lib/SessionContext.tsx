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
  'visual_pursuit', 'dsst', 'tongue_twister', 'choice_reaction', 'stroop_naming',
  'trail_task', 'typing_game', 'single_leg_stand', 'walk_and_turn',
];

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Shuffles the game queue, then ensures Visual Pursuit never lands first or last —
// its long video-upload job needs the session to stay open well past its completion,
// which is most reliable when other games are queued on both sides of it.
function shuffleSessionQueue(): string[] {
  const queue = shuffleArray(ALL_GAMES);
  const lastIdx = queue.length - 1;
  const vpIdx = queue.indexOf('visual_pursuit');
  if (vpIdx === 0 || vpIdx === lastIdx) {
    const middleIndices = queue
      .map((_, i) => i)
      .filter(i => i !== 0 && i !== lastIdx && i !== vpIdx);
    const swapIdx = middleIndices[Math.floor(Math.random() * middleIndices.length)];
    [queue[vpIdx], queue[swapIdx]] = [queue[swapIdx], queue[vpIdx]];
  }
  return queue;
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
  completeGame: (gameType: string, metrics: any, startTime?: Date) => Promise<void>;
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
  savePartialSession: () => Promise<void>;
  getPartialSessionId: () => string | null;
  getSessionResults: () => Record<string, any>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessionMode, setSessionModeState] = useState<'individual' | 'full_session'>('individual');
  const sessionModeRef = useRef<'individual' | 'full_session'>('individual');

  const [sessionResults, setSessionResults] = useState<Record<string, any>>({});
  const sessionResultsRef = useRef<Record<string, any>>({});

  const pendingJobsRef = useRef<Promise<void>[]>([]);

  const [sessionGameTimes, setSessionGameTimes] = useState<Record<string, string>>({});
  const sessionGameTimesRef = useRef<Record<string, string>>({});

  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const sessionStartTimeRef = useRef<Date | null>(null);

  const [gameQueue, setGameQueue] = useState<string[]>([]);
  const gameQueueRef = useRef<string[]>([]);

  const [currentGameIndex, setCurrentGameIndex] = useState(0);
  const currentGameIndexRef = useRef(0);

  const [sessionId, setSessionId] = useState<string | null>(null);

  const [partialSessionId, setPartialSessionId] = useState<string | null>(null);
  // Ref mirrors partialSessionId so savePartialSession always reads the latest value
  // even when called immediately after setPartialSessionId (before React re-renders).
  const partialSessionIdRef = useRef<string | null>(null);

  // ── helpers ──────────────────────────────────────────────────────────────────

  const setSessionMode = (mode: 'individual' | 'full_session') => {
    sessionModeRef.current = mode;
    setSessionModeState(mode);
  };

  const setPartialSessionIdSync = (id: string | null) => {
    partialSessionIdRef.current = id;
    setPartialSessionId(id);
  };

  // ── core session actions ──────────────────────────────────────────────────────

  const startSession = () => {
    const queue = shuffleSessionQueue();
    const now = new Date();
    sessionModeRef.current = 'full_session';
    setSessionModeState('full_session');
    gameQueueRef.current = queue;
    setGameQueue(queue);
    currentGameIndexRef.current = 0;
    setCurrentGameIndex(0);
    sessionResultsRef.current = {};
    setSessionResults({});
    sessionGameTimesRef.current = {};
    setSessionGameTimes({});
    sessionStartTimeRef.current = now;
    setSessionStartTime(now);
    setSessionId(`session_${Date.now()}`);
    partialSessionIdRef.current = null;
    setPartialSessionId(null);
    pendingJobsRef.current = [];
  };

  const resumeSession = (partial: import('./firestore').PartialSessionDoc) => {
    const playedResults: Record<string, any> = {};
    for (const game of partial.gameQueue) {
      if (partial.gameTimes[game] !== undefined) {
        playedResults[game] = partial.games[game] ?? {};
      }
    }
    const start = new Date(partial.startTime);

    sessionModeRef.current = 'full_session';
    setSessionModeState('full_session');
    gameQueueRef.current = partial.gameQueue;
    setGameQueue(partial.gameQueue);
    currentGameIndexRef.current = partial.gamesCompleted;
    setCurrentGameIndex(partial.gamesCompleted);
    sessionResultsRef.current = playedResults;
    setSessionResults(playedResults);
    sessionGameTimesRef.current = partial.gameTimes;
    setSessionGameTimes(partial.gameTimes);
    sessionStartTimeRef.current = start;
    setSessionStartTime(start);
    partialSessionIdRef.current = partial.id;
    setPartialSessionId(partial.id);
    setSessionId(partial.id);
  };

  // ── savePartialSession ────────────────────────────────────────────────────────
  // Reads exclusively from refs so it is safe to call at any point — immediately
  // after completeGame, from a BackHandler, or from an individual game's back button.
  // Uses partialSessionIdRef so it always targets the right Firestore doc even when
  // called before React has had a chance to re-render with the updated state.
  // Returns a promise so callers that need the resulting partial-session doc ID
  // (e.g. Visual Pursuit, before kicking off its background upload job) can await
  // it instead of reading partialSessionIdRef before it has been set.
  const savePartialSession = (): Promise<void> => {
    const startTime = sessionStartTimeRef.current;
    const queue = gameQueueRef.current;
    if (!startTime || queue.length === 0) return Promise.resolve();

    const results = sessionResultsRef.current;
    const paddedResults: Record<string, any> = {};
    for (const game of queue) {
      paddedResults[game] = results[game] ?? DEFAULT_GAME_METRICS[game] ?? { played: false };
    }

    return saveSession(
      EMPATICA_PARTICIPANT.fullId,
      startTime,
      new Date(),
      paddedResults,
      sessionGameTimesRef.current,
      'partial',
      queue,
      partialSessionIdRef.current ?? undefined,   // use ref — always current
    ).then(id => {
      if (id) setPartialSessionIdSync(id);         // update ref + state together
    }).catch(e => console.log('[Session] Partial save error:', e));
  };

  // ── completeGame ─────────────────────────────────────────────────────────────
  // Updates refs synchronously (before state) so savePartialSession called
  // immediately after sees the new data.
  const completeGame = (gameType: string, metrics: any, startTime?: Date): Promise<void> => {
    // Update refs first so any subsequent call to savePartialSession is accurate
    const newResults = { ...sessionResultsRef.current, [gameType]: metrics };
    sessionResultsRef.current = newResults;
    setSessionResults(newResults);

    if (startTime) {
      const iso = startTime.toISOString();
      const newTimes = { ...sessionGameTimesRef.current, [gameType]: iso };
      sessionGameTimesRef.current = newTimes;
      setSessionGameTimes(newTimes);
    }

    currentGameIndexRef.current += 1;
    setCurrentGameIndex(currentGameIndexRef.current);

    // Auto-save after every completed game so no data is ever lost mid-session.
    // Returned so callers (e.g. Visual Pursuit) can await the partial-session doc
    // being created/updated before reading getPartialSessionId().
    if (sessionModeRef.current === 'full_session') {
      return savePartialSession();
    }
    return Promise.resolve();
  };

  // ── updateGameResult ──────────────────────────────────────────────────────────
  // Called by background jobs (VP/TT analysis) after completeGame.
  // Also triggers a partial save so the updated data reaches Firestore immediately.
  const updateGameResult = (gameType: string, updates: Record<string, any>) => {
    const newResults = {
      ...sessionResultsRef.current,
      [gameType]: { ...(sessionResultsRef.current[gameType] ?? {}), ...updates },
    };
    sessionResultsRef.current = newResults;
    setSessionResults(newResults);

    if (sessionModeRef.current === 'full_session') {
      savePartialSession();
    }
  };

  // ── pending jobs ──────────────────────────────────────────────────────────────

  const addPendingJob = (job: Promise<void>) => {
    pendingJobsRef.current = [...pendingJobsRef.current, job];
  };

  const awaitAllPendingJobs = async () => {
    if (pendingJobsRef.current.length === 0) return;
    await Promise.allSettled(pendingJobsRef.current);
    pendingJobsRef.current = [];
  };

  const hasPendingJobs = () => pendingJobsRef.current.length > 0;

  // ── navigation helpers ────────────────────────────────────────────────────────

  // Reads partialSessionIdRef synchronously — safe to call from background jobs
  // even after resetSession() has been called.
  const getPartialSessionId = () => partialSessionIdRef.current;

  // Reads sessionResultsRef synchronously — always reflects the latest results
  // (including updates from background jobs like VP), unlike the `sessionResults`
  // state value captured in a mount-time effect closure.
  const getSessionResults = () => sessionResultsRef.current;

  const isLastGame = () => currentGameIndexRef.current >= gameQueueRef.current.length;
  const getCurrentGame = () => gameQueueRef.current[currentGameIndexRef.current] ?? null;
  const getNextGame = () => gameQueueRef.current[currentGameIndexRef.current] ?? null;
  const getLastCompletedGame = () => gameQueueRef.current[currentGameIndexRef.current - 1] ?? null;
  const getCompletedCount = () => currentGameIndexRef.current;

  // ── reset ─────────────────────────────────────────────────────────────────────

  const resetSession = () => {
    sessionModeRef.current = 'individual';
    setSessionModeState('individual');
    sessionResultsRef.current = {};
    setSessionResults({});
    sessionGameTimesRef.current = {};
    setSessionGameTimes({});
    sessionStartTimeRef.current = null;
    setSessionStartTime(null);
    gameQueueRef.current = [];
    setGameQueue([]);
    currentGameIndexRef.current = 0;
    setCurrentGameIndex(0);
    setSessionId(null);
    partialSessionIdRef.current = null;
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
      getPartialSessionId,
      getSessionResults,
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
