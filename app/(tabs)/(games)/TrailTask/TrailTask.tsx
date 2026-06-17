import { Countdown } from '@/components/Countdown';
import { ScoreTrendCard } from '@/components/ScoreTrendCard';
import { EMPATICA_PARTICIPANT } from '@/lib/empaticaConfig';
import { saveGameResult } from '@/lib/firestore';
import { ms, scale } from '@/lib/scale';
import { useSession } from '@/lib/SessionContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Circle as SvgCircle, Text as SvgText } from 'react-native-svg';

const { width } = Dimensions.get('window');
const CANVAS_WIDTH = width - 40;
// const TRT_INSTR = require('@/assets/inst_images/TRT_instr.jpg');
const TRT_INSTR = require('@/assets/ins_images/trail_making.png');

const CANVAS_HEIGHT = 500;

// Build sequence: random start letter (not A), 7-8 letters, no Z wrap.
// Numbers = ordinal position of each letter (F=6, G=7, …) matching user example.
function buildSequence(): { sequence: string[]; startLetter: string } {
  const numLetters = Math.floor(Math.random() * 2) + 7; // 7 or 8
  // 0-indexed: A=0 … Z=25. Never start at A (0). Must not exceed Y (index 24).
  const maxStart = 25 - numLetters; // e.g. 8 letters → max start index = 17 (R)
  const startIdx = Math.floor(Math.random() * maxStart) + 1; // 1…maxStart

  const sequence: string[] = [];
  for (let i = 0; i < numLetters; i++) {
    const letterIdx = startIdx + i;
    sequence.push(String.fromCharCode(65 + letterIdx)); // letter
    if (i < numLetters - 1) {
      sequence.push(String(i + 1)); // always 1, 2, 3, … regardless of start letter
    }
  }
  return { sequence, startLetter: String.fromCharCode(65 + startIdx) };
}

type CircleItem = {
  id: string;
  label: string;
  x: number;
  y: number;
  sequenceIndex: number;
};

type LineItem = {
  from: CircleItem;
  to: CircleItem;
};

export default function TrailMaking() {
  const [countdown, setCountdown] = useState(false);
  const [gameStart, setGameStart] = useState(false);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [startLetter, setStartLetter] = useState('');
  const sequenceRef = useRef<string[]>([]);

  const [circles, setCircles] = useState<CircleItem[]>([]);
  const [connectedLines, setConnectedLines] = useState<LineItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startTime, setStartTime] = useState<number>(0);
  const [completionTime, setCompletionTime] = useState<number>(0);
  const [isFailed, setIsFailed] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const errorCountRef = useRef(0);
  const [wronglyTouched, setWronglyTouched] = useState<Set<number>>(new Set());
  const wronglyTouchedRef = useRef<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentIndexRef = useRef(0);
  const segmentTimesRef = useRef<number[]>([]);
  const lastCircleTimeRef = useRef<number>(0);

  // Finger tracking
  const [fingerDown, setFingerDown] = useState(false);
  const [fingerPath, setFingerPath] = useState<{ x: number; y: number }[]>([]);
  const [lastTouchedCircle, setLastTouchedCircle] = useState<number | null>(null);

  const router = useRouter();
  const { sessionMode, completeGame, isLastGame, savePartialSession, resetSession } = useSession();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // No cleanup needed for this game
    };
  }, []);

  const handleBackToDashboard = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    // Leaving mid-session — persist whatever's been saved so far and close out
    // the session so it doesn't linger in a stale, half-finished state.
    if (sessionMode === 'full_session') {
      savePartialSession();
      resetSession();
    }

    setGameStart(false);
    setGameCompleted(false);
    setCircles([]);
    setConnectedLines([]);
    setCurrentIndex(0); currentIndexRef.current = 0;
    setIsFailed(false);
    setFingerDown(false);
    setFingerPath([]);
    setLastTouchedCircle(null);
    setTimeLeft(60);

    router.replace('/(tabs)/dashboard');
  };

  // Random placement with collision rejection — each circle is placed at a truly
  // random position, retried up to MAX_ATTEMPTS times if it overlaps any placed circle.
  // Falls back to a grid slot only if all attempts fail (very rare).
  const generateCircles = (sequence: string[]): CircleItem[] => {
    const n = sequence.length;
    const RADIUS = 22;
    const MIN_DIST = RADIUS * 2 + 14; // minimum center-to-center gap
    const MAX_ATTEMPTS = 300;
    const MARGIN = RADIUS + 8;

    const placed: { x: number; y: number }[] = [];

    const tooClose = (x: number, y: number) =>
      placed.some(p => Math.hypot(p.x - x, p.y - y) < MIN_DIST);

    return sequence.map((label, index) => {
      let x = 0, y = 0;
      let found = false;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const tx = MARGIN + Math.random() * (CANVAS_WIDTH  - MARGIN * 2);
        const ty = MARGIN + Math.random() * (CANVAS_HEIGHT - MARGIN * 2);
        if (!tooClose(tx, ty)) {
          x = tx; y = ty; found = true;
          break;
        }
      }

      if (!found) {
        // Grid fallback — used only when canvas is very crowded
        const cols = Math.ceil(Math.sqrt(n));
        const col = index % cols;
        const row = Math.floor(index / cols);
        x = MARGIN + col * ((CANVAS_WIDTH  - MARGIN * 2) / cols);
        y = MARGIN + row * ((CANVAS_HEIGHT - MARGIN * 2) / Math.ceil(n / cols));
      }

      placed.push({ x, y });
      return { id: `circle-${index}`, label, x, y, sequenceIndex: index };
    });
  };

  const handleCirclePress = (circle: CircleItem) => {
    // Already yellowed (correct or wrong) — ignore entirely
    if (wronglyTouchedRef.current.has(circle.sequenceIndex)) return;
    if (circle.sequenceIndex < currentIndex) return;

    if (circle.sequenceIndex === currentIndex) {
      // ✅ CORRECT — connect line, then advance past any already-yellowed wrong bubbles
      const now = Date.now();
      segmentTimesRef.current = [...segmentTimesRef.current, now - lastCircleTimeRef.current];
      lastCircleTimeRef.current = now;
      if (currentIndex > 0) {
        const previousCircle = circles.find(c => c.sequenceIndex === currentIndex - 1);
        if (previousCircle) {
          setConnectedLines(prev => [...prev, { from: previousCircle, to: circle }]);
        }
      }
      let nextIndex = currentIndex + 1;
      while (nextIndex < circles.length && wronglyTouchedRef.current.has(nextIndex)) {
        nextIndex++; // skip over wrongly-touched bubbles — they're already yellow
      }
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
      if (nextIndex >= circles.length) {
        finishGame(Date.now(), false, circles.length, circles.length);
      }
    } else {
      // ❌ WRONG — turn yellow, lock, count error silently. User sees no difference.
      const updated = new Set(wronglyTouchedRef.current);
      updated.add(circle.sequenceIndex);
      wronglyTouchedRef.current = updated;
      setWronglyTouched(new Set(updated));
      errorCountRef.current += 1;
      setErrorCount(errorCountRef.current);
    }
  };

  const finishGame = (endMs: number, failed: boolean, progressIndex: number, totalCircles: number) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const duration = Math.round((endMs - startTime) / 1000);
    setCompletionTime(duration);
    setGameCompleted(true);
    setGameStart(false);
    setIsFailed(failed);
    setFingerDown(false);
    const metricsPayload = {
      completionTimeSeconds: duration,
      passed: !failed,
      circlesCompleted: progressIndex,
      totalCircles,
      errorCount: errorCountRef.current,
      segmentTimes: segmentTimesRef.current,
    };
    if (sessionMode === 'full_session') {
      completeGame('trail_task', metricsPayload, new Date(startTime));
      if (isLastGame()) {
        router.replace('/session-results');
      } else {
        router.replace('/session-transition');
      }
    } else {
      saveGameResult(
        'trail_task',
        EMPATICA_PARTICIPANT.fullId,
        new Date(startTime),
        new Date(endMs),
        metricsPayload
      );
    }
  };

  const gameStartState = () => {
    const { sequence, startLetter: sl } = buildSequence();
    sequenceRef.current = sequence;
    setStartLetter(sl);
    const newCircles = generateCircles(sequence);
    setCircles(newCircles);
    setConnectedLines([]);
    setCurrentIndex(0);
    const now = Date.now();
    setStartTime(now);
    lastCircleTimeRef.current = now;
    segmentTimesRef.current = [];
    setGameStart(true);
    setGameCompleted(false);
    setIsFailed(false);
    setErrorCount(0); errorCountRef.current = 0;
    setWronglyTouched(new Set()); wronglyTouchedRef.current = new Set();
    setFingerDown(false);
    setFingerPath([]);
    setLastTouchedCircle(null);
    setTimeLeft(60);
    currentIndexRef.current = 0;

    // Start 60-second countdown
    if (timerRef.current) clearInterval(timerRef.current);
    const gameStartMs = Date.now();
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        const next = prev - 1;
        if (next <= 0) {
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          finishGame(gameStartMs + 60000, true, currentIndexRef.current, sequenceRef.current.length);
          return 0;
        }
        return next;
      });
    }, 1000);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* INSTRUCTIONS SCREEN */}
      {!gameStart && !gameCompleted && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackToDashboard} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Trail Making</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Logo */}
            <View style={styles.iconContainer}>
              <Ionicons name="git-branch-outline" size={64} color="#F59E0B" />
            </View>

            <Text style={styles.instructionTitle}>Trail Making Test</Text>
            <Text style={styles.instructionText}>
              Measures visual tracking and task-switching abilities to assess your overall cognitive agility.
            </Text>

            {/* How it works */}
            <View style={styles.exampleBox}>
              <Text style={styles.exampleLabel}>How it works:</Text>
              {[
                'Find the starting point to begin the test.',
                'Connect the letters and numbers in alternating order (e.g., F→1→G→2).',
                'You can lift your finger and re-draw at any time — you won\'t be penalised.',
                'You can cross through the lines you already drew without penalty.',
              ].map((text, i) => (
                <View key={i} style={styles.trtStep}>
                  <View style={styles.trtStepNum}>
                    <Text style={styles.trtStepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.trtStepText}>{text}</Text>
                </View>
              ))}
            </View>

            {/* Step illustration */}
            <Image source={TRT_INSTR} style={styles.trtInstImg} resizeMode="contain" />

            {/* Tip */}
            <View style={styles.trtTipBox}>
              <Ionicons name="time-outline" size={20} color="#F59E0B" style={{ marginBottom: 6 }} />
              <Text style={styles.trtTipText}>Speed & Accuracy determine your score.</Text>
            </View>

            {/* Warning */}
            <View style={styles.trtWarningBox}>
              <Ionicons name="warning-outline" size={18} color="#92400E" style={{ marginRight: 8, marginTop: 1 }} />
              <Text style={styles.trtWarningText}>
                The starting letter changes every play-through — look carefully before you begin.
              </Text>
            </View>

            <TouchableOpacity style={styles.startButton} onPress={() => setCountdown(true)}>
              <Text style={styles.startButtonText}>Begin Test</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </ScrollView>
          {countdown && (
            <Countdown onComplete={() => { setCountdown(false); gameStartState(); }} />
          )}
        </>
      )}

      {/* GAME SCREEN */}
      {gameStart && !gameCompleted && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackToDashboard} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Trail Making</Text>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.gameScreen}>
            {/* Stats */}
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Start:</Text>
                <Text style={styles.statText}>{startLetter}</Text>
              </View>
              <View style={[styles.statCard, { marginLeft: 8, borderColor: timeLeft <= 10 ? '#EF4444' : '#E5E7EB' }]}>
                <Ionicons name="time-outline" size={16} color={timeLeft <= 10 ? '#EF4444' : '#6B7280'} style={{ marginRight: 4 }} />
                <Text style={[styles.statText, { color: timeLeft <= 10 ? '#EF4444' : '#F59E0B', fontSize: 18 }]}>{timeLeft}s</Text>
              </View>
              <View style={styles.instructionCard}>
                <Text style={styles.instructionCardText}>Lift and re-draw freely — connect all circles in order</Text>
              </View>
            </View>

            {/* Canvas */}
            <View 
              style={styles.canvasContainer}
              onTouchStart={(e) => {
                setFingerDown(true);
                const touch = e.nativeEvent.touches[0];
                setFingerPath([{ x: touch.locationX, y: touch.locationY }]);
              }}
              onTouchMove={(e) => {
                if (!fingerDown) return;
                
                const touch = e.nativeEvent.touches[0];
                const newPoint = { x: touch.locationX, y: touch.locationY };
                
                setFingerPath(prev => [...prev, newPoint]);
                
                // Check if finger is over a circle
                circles.forEach(circle => {
                  const distance = Math.sqrt(
                    Math.pow(circle.x - touch.locationX, 2) + 
                    Math.pow(circle.y - touch.locationY, 2)
                  );
                  
                  if (distance <= 22) { // Circle radius
                    // Only process if this is a new circle touch
                    if (lastTouchedCircle !== circle.sequenceIndex) {
                      setLastTouchedCircle(circle.sequenceIndex);
                      handleCirclePress(circle);
                    }
                  }
                });
              }}
              onTouchEnd={() => {
                setFingerDown(false);
                setFingerPath([]);
                setLastTouchedCircle(null);
              }}
            >
              <Svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={styles.svg}>
                {/* Draw finger trail */}
                {fingerPath.length > 1 && fingerPath.map((point, index) => {
                  if (index === 0) return null;
                  const prevPoint = fingerPath[index - 1];
                  return (
                    <Line
                      key={`trail-${index}`}
                      x1={prevPoint.x}
                      y1={prevPoint.y}
                      x2={point.x}
                      y2={point.y}
                      stroke="#FCD34D"
                      strokeWidth={4}
                      opacity={0.6}
                    />
                  );
                })}

                {/* Draw circles - NO HIGHLIGHTING */}
                {circles.map((circle) => {
                  const isYellow = circle.sequenceIndex < currentIndex || wronglyTouched.has(circle.sequenceIndex);
                  return (
                    <SvgCircle
                      key={circle.id}
                      cx={circle.x}
                      cy={circle.y}
                      r={22}
                      fill={isYellow ? '#EAB308' : '#FFFFFF'}
                      stroke="#D1D5DB"
                      strokeWidth={2}
                    />
                  );
                })}

                {/* Draw text */}
                {circles.map((circle) => {
                  const isYellow = circle.sequenceIndex < currentIndex || wronglyTouched.has(circle.sequenceIndex);
                  return (
                    <SvgText
                      key={`text-${circle.id}`}
                      x={circle.x}
                      y={circle.y + 6}
                      fontSize="15"
                      fontWeight="700"
                      fill={isYellow ? '#FFFFFF' : '#1F2937'}
                      textAnchor="middle"
                    >
                      {circle.label}
                    </SvgText>
                  );
                })}
              </Svg>
            </View>

            {/* Instruction */}
            <View style={styles.fingerInstruction}>
              <Ionicons name="hand-left-outline" size={24} color="#F59E0B" />
              <Text style={styles.fingerInstructionText}>
                {fingerDown ? 'Keep drawing...' : 'Touch and drag to connect circles'}
              </Text>
            </View>
          </View>
        </>
      )}

      {/* RESULT SCREEN */}
      {gameCompleted && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackToDashboard} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Trail Making - Results</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView contentContainerStyle={styles.resultScreen}>
            <View style={[
              styles.iconContainer,
              { backgroundColor: !isFailed ? '#FEF3C7' : '#FEE2E2' }
            ]}>
              <Ionicons 
                name={!isFailed ? "checkmark-circle" : "close-circle"} 
                size={64} 
                color={!isFailed ? "#F59E0B" : "#EF4444"} 
              />
            </View>

            <Text style={styles.resultTitle}>
              {!isFailed
                ? errorCount === 0 ? 'Perfect!' : 'Trail Complete'
                : 'Test Failed'}
            </Text>
            <Text style={styles.resultSubtitle}>
              {!isFailed
                ? errorCount === 0
                  ? 'You completed the trail without any errors!'
                  : `You completed the trail with ${errorCount} error${errorCount === 1 ? '' : 's'}.`
                : 'Time ran out before the trail was completed.'}
            </Text>

            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Completion Time</Text>
              <Text style={styles.scoreValue}>{completionTime}</Text>
              <Text style={styles.scoreSubtext}>seconds</Text>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Status</Text>
                  <Text style={[
                    styles.statItemValue,
                    { color: !isFailed ? '#F59E0B' : '#EF4444' }
                  ]}>
                    {!isFailed ? 'Pass' : 'Fail'}
                  </Text>
                </View>
                <View style={styles.statItemDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Errors</Text>
                  <Text style={[
                    styles.statItemValue,
                    { color: errorCount === 0 ? '#10B981' : '#EF4444' }
                  ]}>
                    {errorCount}
                  </Text>
                </View>
                <View style={styles.statItemDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Progress</Text>
                  <Text style={styles.statItemValue}>{currentIndex}/{circles.length}</Text>
                </View>
              </View>
            </View>

            <ScoreTrendCard
              gameType="trail_task"
              participantId="2872-1-1-1"
              currentMetrics={{
                completionTimeSeconds: completionTime,
                errorCount,
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
          {countdown && (
            <Countdown onComplete={() => { setCountdown(false); gameStartState(); }} />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  placeholder: {
    width: 32,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  iconContainer: {
    width: scale(120),
    height: scale(120),
    borderRadius: scale(60),
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 30,
  },
  instructionTitle: {
    fontSize: ms(24),
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 16,
  },
  instructionText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
    paddingHorizontal: 20,
  },

  // Example Box
  exampleBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 30,
  },
  exampleLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 20,
    textAlign: 'center',
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  sequenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  sequenceItem: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sequenceText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  exampleNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
  },
  exampleNoteText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
    flex: 1,
  },

  // Rules
  rulesBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 30,
  },
  rulesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  rule: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
    marginTop: 7,
    marginRight: 12,
  },
  ruleText: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },

  // Start Button
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
    paddingVertical: 16,
    borderRadius: 12,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginRight: 8,
  },

  // GAME SCREEN
  gameScreen: {
    flex: 1,
    padding: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginRight: 4,
  },
  statText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F59E0B',
  },
  instructionCard: {
    flex: 1,
    backgroundColor: '#FEF3C7',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#F59E0B',
    marginLeft: 12,
  },
  instructionCardText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    textAlign: 'center',
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  svg: {
    backgroundColor: '#FAFAFA',
  },
  fingerInstruction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  fingerInstructionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 12,
  },

  // RESULT SCREEN
  resultScreen: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  resultTitle: {
    fontSize: ms(24),
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  resultSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 30,
  },
  scoreCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
    width: '100%',
  },
  scoreLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: ms(56),
    fontWeight: '700',
    color: '#F59E0B',
  },
  scoreSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statItemDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
  },
  statItemLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
  },
  statItemValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 16,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  homeButton: {
    paddingVertical: 12,
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F59E0B',
  },

  trtStep:        { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  trtStepNum:     { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  trtStepNumText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  trtStepText:    { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },
  trtInstImg: {
    width: '100%',
    alignSelf: 'center',
    height: undefined,
    // aspectRatio: 0.45,
     aspectRatio: 360/930,
    // borderRadius: 8,
    borderRadius: 0,
    marginBottom: 16,
  },
  trtTipBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
  },
  trtTipText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 20,
    fontWeight: '600',
  },
  trtWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  trtWarningText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 20,
  },
});



