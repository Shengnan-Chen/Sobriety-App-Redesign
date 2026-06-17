import { Countdown } from '@/components/Countdown';
import { ScoreTrendCard } from '@/components/ScoreTrendCard';
import { EMPATICA_PARTICIPANT } from '@/lib/empaticaConfig';
import { saveGameResult } from '@/lib/firestore';
import { ms, scale } from '@/lib/scale';
import { useSession } from '@/lib/SessionContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChoiceReactionDemo } from './ChoiceReactionDemo';

const SCREEN_W = Dimensions.get('window').width;
// const CR_INSTR = require('@/assets/inst_images/CR_instr.jpg');
const CR_INSTR = require('@/assets/ins_images/choice_reaction.png');

type Square = { id: number; color: string };
type Phase = 'intro' | 'game' | 'results';

const BLUE_COLOR = '#3B82F6';
const BLUE_PRESSED_COLOR = '#1D4ED8';
const BLUE_MAX_MS = 2000;

const BLACK_SQUARES: Square[] = [
  { id: 0, color: '#000000' },
  { id: 1, color: '#000000' },
  { id: 2, color: '#000000' },
  { id: 3, color: '#000000' },
];

export default function ChoiceReaction() {
  const [countdown, setCountdown] = useState(false);
  const [phase, setPhase] = useState<Phase>('intro');

  const [squares, setSquares] = useState<Square[]>(BLACK_SQUARES);
  const [activeSquare, setActiveSquare] = useState<number | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<'waiting' | 'blue' | 'red'>('waiting');

  const [pressReactionTimes, setPressReactionTimes] = useState<number[]>([]);
  const [releaseReactionTimes, setReleaseReactionTimes] = useState<number[]>([]);
  const [errors, setErrors] = useState(0);
  const [perceivedDuration, setPerceivedDuration] = useState(0);

  const blueStartTime = useRef<number>(0);
  const redStartTime = useRef<number>(0);
  const gameStartTimeRef = useRef<number>(0);
  const missedBlueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextRoundTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRespondedToBlueRef = useRef(false);
  const gameActiveRef = useRef(false);
  const pressReactionTimesRef = useRef<number[]>([]);
  const releaseReactionTimesRef = useRef<number[]>([]);
  const errorsRef = useRef(0);
  const roundTimesRef = useRef<{ press: number; release: number | null }[]>([]);

  const router = useRouter();
  const { sessionMode, completeGame, isLastGame, savePartialSession, resetSession } = useSession();

  // ── helpers ───────────────────────────────────────────────────────────────

  const clearTimeouts = () => {
    if (missedBlueTimeoutRef.current) { clearTimeout(missedBlueTimeoutRef.current); missedBlueTimeoutRef.current = null; }
    if (redDelayTimeoutRef.current)   { clearTimeout(redDelayTimeoutRef.current);   redDelayTimeoutRef.current   = null; }
    if (nextRoundTimeoutRef.current)  { clearTimeout(nextRoundTimeoutRef.current);  nextRoundTimeoutRef.current  = null; }
  };

  const resetSquares = () => setSquares([...BLACK_SQUARES]);

  // ── round logic ───────────────────────────────────────────────────────────

  const startNewRound = () => {
    if (!gameActiveRef.current) return;
    clearTimeouts();
    resetSquares();
    setActiveSquare(null);
    setIsHolding(false);
    setCurrentPhase('waiting');
    hasRespondedToBlueRef.current = false;

    const delay = Math.random() * 1500 + 500;
    setTimeout(() => {
      if (!gameActiveRef.current) return;
      const randomSquare = Math.floor(Math.random() * 4);
      setActiveSquare(randomSquare);
      setCurrentPhase('blue');
      hasRespondedToBlueRef.current = false;
      blueStartTime.current = Date.now();
      setSquares(prev => prev.map(sq => sq.id === randomSquare ? { ...sq, color: BLUE_COLOR } : sq));

      missedBlueTimeoutRef.current = setTimeout(() => {
        if (!gameActiveRef.current) return;
        missedBlueTimeoutRef.current = null;
        setErrors(prev => { errorsRef.current = prev + 1; return prev + 1; });
        startNewRound();
      }, BLUE_MAX_MS);
    }, delay);
  };

  const handleSquarePressIn = (id: number) => {
    if (!gameActiveRef.current) return;
    if (currentPhase === 'blue' && id === activeSquare) {
      if (hasRespondedToBlueRef.current) {
        clearTimeouts();
        setErrors(prev => { errorsRef.current = prev + 1; return prev + 1; });
        startNewRound();
        return;
      }
      hasRespondedToBlueRef.current = true;
      clearTimeouts();
      const rt = Date.now() - blueStartTime.current;
      setPressReactionTimes(prev => { const n = [...prev, rt]; pressReactionTimesRef.current = n; return n; });
      roundTimesRef.current = [...roundTimesRef.current, { press: rt, release: null }];
      setIsHolding(true);
      const redDelay = Math.random() * 1000 + 500;
      redDelayTimeoutRef.current = setTimeout(() => {
        if (!gameActiveRef.current) return;
        redDelayTimeoutRef.current = null;
        setCurrentPhase('red');
        redStartTime.current = Date.now();
        setSquares(prev => prev.map(sq => sq.id === id ? { ...sq, color: '#EF4444' } : sq));
      }, redDelay);
    } else if (currentPhase !== 'waiting') {
      setErrors(prev => prev + 1);
    }
  };

  const handleSquarePressOut = (id: number) => {
    if (!gameActiveRef.current) return;
    if (currentPhase === 'red' && id === activeSquare && isHolding) {
      const rt = Date.now() - redStartTime.current;
      setReleaseReactionTimes(prev => { const n = [...prev, rt]; releaseReactionTimesRef.current = n; return n; });
      const lastIdx = roundTimesRef.current.length - 1;
      if (lastIdx >= 0) {
        roundTimesRef.current = roundTimesRef.current.map((r, i) => i === lastIdx ? { ...r, release: rt } : r);
      }
      clearTimeouts();
      nextRoundTimeoutRef.current = setTimeout(() => {
        nextRoundTimeoutRef.current = null;
        if (gameActiveRef.current) startNewRound();
      }, 500);
    } else if (isHolding && currentPhase === 'blue') {
      clearTimeouts();
      setErrors(prev => prev + 1);
      setIsHolding(false);
      nextRoundTimeoutRef.current = setTimeout(() => {
        nextRoundTimeoutRef.current = null;
        if (gameActiveRef.current) startNewRound();
      }, 500);
    }
  };

  // ── game lifecycle ────────────────────────────────────────────────────────

  const gameStartState = () => {
    gameActiveRef.current = true;
    gameStartTimeRef.current = Date.now();
    pressReactionTimesRef.current = [];
    releaseReactionTimesRef.current = [];
    roundTimesRef.current = [];
    errorsRef.current = 0;
    setPressReactionTimes([]); setReleaseReactionTimes([]); setErrors(0); setPerceivedDuration(0);
    setPhase('game');
    startNewRound();
  };

  const handleStop = () => {
    const elapsed = Math.round((Date.now() - gameStartTimeRef.current) / 1000);
    setPerceivedDuration(elapsed);
    handleGameOver(elapsed);
  };

  const handleGameOver = (elapsedSeconds: number) => {
    gameActiveRef.current = false;
    clearTimeouts();
    setPhase('results');

    const endTime = new Date();
    const press = pressReactionTimesRef.current;
    const release = releaseReactionTimesRef.current;
    const avgPress = press.length > 0 ? Math.round(press.reduce((a, b) => a + b, 0) / press.length) : 0;
    const avgRelease = release.length > 0 ? Math.round(release.reduce((a, b) => a + b, 0) / release.length) : 0;
    const metricsPayload = {
      avgPressReactionTimeMs: avgPress,
      avgReleaseReactionTimeMs: avgRelease,
      totalRounds: press.length,
      errors: errorsRef.current,
      perceivedDurationSeconds: elapsedSeconds,
      timeDeltaSeconds: elapsedSeconds - 30,
      roundTimes: roundTimesRef.current,
    };
    if (sessionMode === 'full_session') {
      completeGame('choice_reaction', metricsPayload, new Date(gameStartTimeRef.current));
      if (isLastGame()) { router.replace('/session-results'); }
      else              { router.replace('/session-transition'); }
    } else {
      saveGameResult('choice_reaction', EMPATICA_PARTICIPANT.fullId, new Date(gameStartTimeRef.current), endTime, metricsPayload);
    }
  };

  const handleBackToDashboard = () => {
    if (sessionMode === 'full_session') { savePartialSession(); resetSession(); }
    gameActiveRef.current = false;
    clearTimeouts();
    resetSquares();
    setPhase('intro');
    setActiveSquare(null);
    setCurrentPhase('waiting');
    setIsHolding(false);
    setPressReactionTimes([]); setReleaseReactionTimes([]); setErrors(0); setPerceivedDuration(0);
    router.replace('/(tabs)/dashboard');
  };

  // ── derived display values ────────────────────────────────────────────────

  const avgPressTime = pressReactionTimes.length > 0
    ? Math.round(pressReactionTimes.reduce((a, b) => a + b, 0) / pressReactionTimes.length) : 0;
  const avgReleaseTime = releaseReactionTimes.length > 0
    ? Math.round(releaseReactionTimes.reduce((a, b) => a + b, 0) / releaseReactionTimes.length) : 0;
  const totalReactions = pressReactionTimes.length;
  const isPassing = avgPressTime < 800 && avgReleaseTime < 800 && errors < 5;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* ── INTRO ── */}
      {phase === 'intro' && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackToDashboard} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Choice Reaction</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Logo */}
            <View style={styles.iconContainer}>
              <Ionicons name="finger-print-outline" size={64} color="#10B981" />
            </View>

            <Text style={styles.instructionTitle}>Choice Reaction Test</Text>
            <Text style={styles.instructionText}>
              Evaluates reaction speed, decision-making, and time perception to assess your cognitive focus.
            </Text>

            {/* How it works */}
            <View style={styles.exampleBox}>
              <Text style={styles.exampleLabel}>How it works:</Text>
              {[
                'Follow the color cues: Hold for blue, release for red.',
                'Stop the test when you estimate 30 seconds have passed.',
              ].map((text, i) => (
                <View key={i} style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{text}</Text>
                </View>
              ))}
            </View>

            {/* Step illustration */}
            <Image source={CR_INSTR} style={styles.crInstImg} resizeMode="contain" />
            <ChoiceReactionDemo />
            {/* Tips */}
            <View style={styles.tipsBox}>
              <Ionicons name="information-circle" size={20} color="#10B981" style={{ marginBottom: 8 }} />
              {[
                'Press & release accuracy matters.',
                'Wrong taps count as errors.',
              ].map((tip, i) => (
                <View key={i} style={styles.tipRow}>
                  <View style={styles.tipBullet} />
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
            
            <TouchableOpacity style={styles.startButton} onPress={() => setCountdown(true)}>
              <Text style={styles.startButtonText}>Begin Test</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </ScrollView>
          {countdown && <Countdown onComplete={() => { setCountdown(false); gameStartState(); }} />}
        </>
      )}

      {/* ── GAME ── */}
      {phase === 'game' && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackToDashboard} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Choice Reaction</Text>
            <View style={styles.placeholder} />
          </View>
          <View style={styles.gameScreen}>
            <Text style={styles.timePrompt}>Tap STOP when you feel 30 seconds have passed</Text>

            <View style={styles.gameGridContainer}>
              {[squares.slice(0, 2), squares.slice(2, 4)].map((row, ri) => (
                <View key={ri} style={styles.gameGridRow}>
                  {row.map(square => (
                    <Pressable
                      key={square.id}
                      style={[styles.gameSquare, {
                        backgroundColor: square.id === activeSquare && currentPhase === 'blue' && isHolding
                          ? BLUE_PRESSED_COLOR : square.color,
                      }]}
                      onPressIn={() => handleSquarePressIn(square.id)}
                      onPressOut={() => handleSquarePressOut(square.id)}
                    />
                  ))}
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
              <Ionicons name="stop-circle-outline" size={24} color="#FFFFFF" />
              <Text style={styles.stopButtonText}>STOP</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── RESULTS ── */}
      {phase === 'results' && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackToDashboard} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Choice Reaction - Results</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView contentContainerStyle={styles.resultScreen}>
            <View style={[styles.iconContainer, { backgroundColor: isPassing ? '#D1FAE5' : '#FEE2E2' }]}>
              <Ionicons
                name={isPassing ? 'checkmark-circle' : 'close-circle'}
                size={64}
                color={isPassing ? '#10B981' : '#EF4444'}
              />
            </View>
            <Text style={styles.resultTitle}>{isPassing ? 'Excellent Reactions!' : 'Test Complete'}</Text>
            <Text style={styles.resultSubtitle}>
              {isPassing ? 'Your reaction times are good!' : 'Practice to improve your reaction speed'}
            </Text>

            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Avg Press Reaction</Text>
              <Text style={styles.scoreValue}>{avgPressTime}</Text>
              <Text style={styles.scoreSubtext}>milliseconds</Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Total Rounds</Text>
                  <Text style={styles.statItemValue}>{totalReactions}</Text>
                </View>
                <View style={styles.statItemDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Errors</Text>
                  <Text style={styles.statItemValue}>{errors}</Text>
                </View>
              </View>
            </View>

            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Avg Release Reaction</Text>
              <Text style={styles.scoreValue}>{avgReleaseTime}</Text>
              <Text style={styles.scoreSubtext}>milliseconds</Text>
            </View>

            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Time Perception</Text>
              <Text style={styles.scoreValue}>{perceivedDuration}s</Text>
              <Text style={styles.scoreSubtext}>you stopped at (target: 30s)</Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Difference</Text>
                  <Text style={styles.statItemValue}>
                    {perceivedDuration >= 30 ? '+' : ''}{perceivedDuration - 30}s
                  </Text>
                </View>
                <View style={styles.statItemDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Accuracy</Text>
                  <Text style={styles.statItemValue}>
                    {Math.round(100 - Math.abs(perceivedDuration - 30) / 30 * 100)}%
                  </Text>
                </View>
              </View>
            </View>

            <ScoreTrendCard
              gameType="choice_reaction"
              participantId="2872-1-1-1"
              currentMetrics={{
                avgPressReactionTimeMs: avgPressTime,
                avgReleaseReactionTimeMs: avgReleaseTime,
                timeDeltaSeconds: perceivedDuration - 30,
              }}
            />

            <TouchableOpacity style={styles.retryButton} onPress={() => setCountdown(true)}>
              <Ionicons name="refresh" size={20} color="#FFFFFF" />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.homeButton} onPress={handleBackToDashboard}>
              <Text style={styles.homeButtonText}>Back to Dashboard</Text>
            </TouchableOpacity>
          </ScrollView>
          {countdown && <Countdown onComplete={() => { setCountdown(false); gameStartState(); }} />}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#FAFAFA' },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backButton:       { padding: 4 },
  headerTitle:      { fontSize: 18, fontWeight: '700', color: '#1F2937' },
  placeholder:      { width: 32 },
  scrollContent:    { padding: 20, paddingBottom: 40 },
  iconContainer:    { width: scale(120), height: scale(120), borderRadius: scale(60), backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 30 },
  instructionTitle: { fontSize: ms(24), fontWeight: '700', color: '#1F2937', textAlign: 'center', marginBottom: 16 },
  instructionText:  { fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 24, marginBottom: 30, paddingHorizontal: 20 },

  // Example box
  exampleBox:      { backgroundColor: '#F9FAFB', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 30 },
  exampleLabel:    { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 20, textAlign: 'center' },
  stepTitle:       { fontSize: 14, fontWeight: '600', color: '#6B7280', marginBottom: 12, marginTop: 16 },
  gridContainer:   { alignItems: 'center', marginBottom: 10 },
  gridRow:         { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 20 },
  square:          { width: 80, height: 80, borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB' },
  exampleNote:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#D1FAE5', padding: 12, borderRadius: 8, marginTop: 10 },
  exampleNoteText: { fontSize: 14, color: '#6B7280', marginLeft: 8, flex: 1 },
  boldText:        { fontWeight: '700', color: '#10B981' },

  // Rules
  rulesBox:        { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 30 },
  rulesTitle:      { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 16 },
  rule:            { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  bulletPoint:     { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981', marginTop: 7, marginRight: 12 },
  ruleText:        { flex: 1, fontSize: 14, color: '#6B7280', lineHeight: 20 },
  startButton:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 12 },
  startButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', marginRight: 8 },

  // Game screen
  gameScreen:        { flex: 1, padding: 20, justifyContent: 'center' },
  timePrompt:        { fontSize: 14, fontWeight: '600', color: '#6B7280', textAlign: 'center', marginBottom: 40, paddingHorizontal: 20 },
  gameGridContainer: { alignItems: 'center' },
  gameGridRow:       { flexDirection: 'row', justifyContent: 'center', gap: 30, marginBottom: 30 },
  gameSquare:        { width: scale(120), height: 120, borderRadius: 16, borderWidth: 3, borderColor: '#E5E7EB' },
  stopButton:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444', paddingVertical: 16, borderRadius: 12, marginTop: 32, gap: 8 },
  stopButtonText:    { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },

  // Results
  resultScreen:    { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  resultTitle:     { fontSize: ms(24), fontWeight: '700', color: '#1F2937', marginBottom: 8 },
  resultSubtitle:  { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 30 },
  scoreCard:       { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20, width: '100%' },
  scoreLabel:      { fontSize: 14, color: '#6B7280', marginBottom: 8 },
  scoreValue:      { fontSize: ms(56), fontWeight: '700', color: '#10B981' },
  scoreSubtext:    { fontSize: 14, color: '#9CA3AF', marginBottom: 20 },
  statsRow:        { flexDirection: 'row', alignItems: 'center', paddingTop: 20, borderTopWidth: 1, borderTopColor: '#E5E7EB', width: '100%' },
  statItem:        { flex: 1, alignItems: 'center' },
  statItemDivider: { width: 1, height: 40, backgroundColor: '#E5E7EB' },
  statItemLabel:   { fontSize: 12, color: '#6B7280', marginBottom: 6 },
  statItemValue:   { fontSize: 20, fontWeight: '700', color: '#1F2937' },
  retryButton:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#10B981', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, marginBottom: 16 },
  retryButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', marginLeft: 8 },
  homeButton:      { paddingVertical: 12 },
  homeButtonText:  { fontSize: 16, fontWeight: '600', color: '#10B981' },

  step:           { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  stepNumber:     { width: 30, height: 30, borderRadius: 15, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  stepNumberText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  stepText:       { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },

  crInstImg: {
    // width: SCREEN_W,
    width: '100%',
    // marginHorizontal: -20,
    height: undefined,
    // aspectRatio: 1.25,
    aspectRatio: 360/380,
    // borderRadius: 8,
    borderRadius: 0,
    marginBottom: 16,
  },
  tipsBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tipBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginTop: 7,
    marginRight: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: '#065F46',
    lineHeight: 20,
  },
});




