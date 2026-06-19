import { Countdown } from '@/components/Countdown';
import { ScoreTrendCard } from '@/components/ScoreTrendCard';
import { EMPATICA_PARTICIPANT } from '@/lib/empaticaConfig';
import { saveGameResult } from '@/lib/firestore';
import { useSession } from '@/lib/SessionContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';
import DSSTDemo from './DSSTDemo';
const { width } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// GRID LAYOUT
// 9 dots in a 3×3 grid, indexed:
//   0  1  2
//   3  4  5
//   6  7  8
// ─────────────────────────────────────────────────────────────────────────────
const DOT_COLS = [0, 1, 2, 0, 1, 2, 0, 1, 2];
const DOT_ROWS = [0, 0, 0, 1, 1, 1, 2, 2, 2];

// ─────────────────────────────────────────────────────────────────────────────
// RECOGNITION: Edge-set Jaccard matching
// A symbol is defined by WHICH DOT PAIRS are connected, not by draw order or
// direction. The user may draw any stroke in any direction and still match.
// ─────────────────────────────────────────────────────────────────────────────

function makeEdge(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

// If a straight drag from dot a to dot b passes exactly through a collinear
// midpoint dot (same row/column/diagonal), return that dot's index.
// Users always capture intermediate dots, so (0,6) becomes (0,3)+(3,6) etc.
function midDot(a: number, b: number): number | null {
  const mc = (DOT_COLS[a] + DOT_COLS[b]) / 2;
  const mr = (DOT_ROWS[a] + DOT_ROWS[b]) / 2;
  for (let i = 0; i < 9; i++) {
    if (DOT_COLS[i] === mc && DOT_ROWS[i] === mr) return i;
  }
  return null;
}

// Convert a dot sequence to its expanded atomic edge set.
// Long edges that span a collinear midpoint are split into two shorter edges.
function seqToEdgeSet(seq: number[]): Set<string> {
  const edges = new Set<string>();
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1], b = seq[i];
    const mid = midDot(a, b);
    if (mid !== null) {
      edges.add(makeEdge(a, mid));
      edges.add(makeEdge(mid, b));
    } else {
      edges.add(makeEdge(a, b));
    }
  }
  return edges;
}

// Jaccard distance: 0 = identical sets, 1 = no overlap
function jaccardDist(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  a.forEach(e => { if (b.has(e)) inter++; });
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : 1 - inter / union;
}

// ─────────────────────────────────────────────────────────────────────────────
// SYMBOL DEFINITIONS
// Each symbol type has:
//   - display character
//   - canonical dot sequences (primary + variants for tolerance)
//   - direction sequence derived from those dots
// ─────────────────────────────────────────────────────────────────────────────
const SYMBOL_CHARS = [
  '>', '✕', 'Z', 'L', 'U', '◇', 'N', 'W', '/',
  'T', '+', '7', 'Λ', 'V', 'Π', 'Γ', '⊏', '<', '=',
];


const CANONICAL_SEQS: number[][][] = [
  [[0, 5, 6]],             // 0  >   right chevron
  [[0, 4, 8], [2, 4, 6]],  // 1  ✕   X (two strokes)
  [[0, 2, 6, 8]],          // 2  Z   shape
  [[0, 6, 8]],             // 3  L   shape
  [[0, 6, 8, 2]],          // 4  U   shape
  [[1, 5, 7, 3], [1, 3]],  // 5  ◇   diamond
  [[0, 6, 4, 2, 8]],       // 6  N   left side down + diagonal up-right + right side down
  [[0, 6, 1, 8, 2]],       // 7  W   shape TL→BL→TC→BR→TR
  [[6, 4, 2]],             // 8  /   slash
  [[0, 2], [1, 7]],        // 9  T   top bar + center drop
  [[3, 5], [1, 7]],        // 10 +   plus (two strokes)
  [[0, 2, 6]],             // 11 7   top bar + diagonal to BL
  [[3, 1, 5]],             // 12 Λ   up caret
  [[3, 7, 5]],             // 13 V   down caret
  [[6, 0, 2, 8]],          // 14 Π   pi/arch (BL→TL→TR→BR)
  [[6, 0, 2]],             // 15 Γ   reverse-L (BL→TL→TR)
  [[2, 0, 6, 8]],          // 16 ⊓   cap (TR→TL→BL→BR)
  [[2, 3, 8]],             // 17 <   left chevron
  [[0, 2], [6, 8]],        // 18 =   top + bottom bars
];

// Match user's drawn strokes against all symbols.
// Compares edge sets — which dot-pairs are connected — using Jaccard distance.
// Draw order, stroke direction, and number of strokes don't matter.
function recognizeSymbol(strokes: number[][]): number {
  const validStrokes = strokes.filter(s => s.length >= 2);
  if (validStrokes.length === 0) return -1;

  const userEdges = new Set<string>();
  validStrokes.forEach(stroke => {
    for (let i = 1; i < stroke.length; i++) {
      userEdges.add(makeEdge(stroke[i - 1], stroke[i]));
    }
  });
  if (userEdges.size === 0) return -1;

  let bestSym = -1;
  let bestScore = Infinity;
  let bestRecall = 0;

  CANONICAL_SEQS.forEach((variants, symIdx) => {
    // Combine expanded edges from all variants into one canonical edge set
    const canonEdges = new Set<string>();
    variants.forEach(seq => seqToEdgeSet(seq).forEach(e => canonEdges.add(e)));

    const score = jaccardDist(userEdges, canonEdges);

    // Recall = fraction of canonical edges the user actually drew
    let inter = 0;
    userEdges.forEach(e => { if (canonEdges.has(e)) inter++; });
    const recall = canonEdges.size > 0 ? inter / canonEdges.size : 0;

    if (score < bestScore) {
      bestScore = score;
      bestSym = symIdx;
      bestRecall = recall;
    }
  });

  // Must draw nearly all canonical edges (recall >= 0.95) AND not add excessive extras (jaccard < 0.18)
  return bestScore < 0.18 && bestRecall >= 0.95 ? bestSym : -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const CANVAS_SIZE = Math.min(width - 32, 360);
const DOT_RADIUS  = Math.round(CANVAS_SIZE * 0.055);
const CAPTURE_R   = Math.round(CANVAS_SIZE * 0.117);
const PADDING     = Math.round(CANVAS_SIZE * 0.158);

function dotXY(dotIdx: number): { x: number; y: number } {
  const step = (CANVAS_SIZE - PADDING * 2) / 2;
  return {
    x: PADDING + DOT_COLS[dotIdx] * step,
    y: PADDING + DOT_ROWS[dotIdx] * step,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MINI PREVIEW (tiny dot grid showing expected pattern)
// ─────────────────────────────────────────────────────────────────────────────
const MINI = 54;
const MINI_PAD = 10;

function MiniPreview({ symIdx, size = MINI, showDots = false }: { symIdx: number; size?: number; showDots?: boolean }) {
  const pad  = Math.round(size * MINI_PAD / MINI);
  const step = (size - pad * 2) / 2;
  const seqs = CANONICAL_SEQS[symIdx];

  const dotPos = (d: number) => ({
    cx: pad + DOT_COLS[d] * step,
    cy: pad + DOT_ROWS[d] * step,
  });

  return (
    <Svg width={size} height={size}>
      {showDots && Array.from({ length: 9 }, (_, i) => {
        const { cx, cy } = dotPos(i);
        return <Circle key={i} cx={cx} cy={cy} r={3} fill="#D1D5DB" />;
      })}
      {seqs.map((seq, si) =>
        seq.slice(1).map((d, i) => {
          const a = dotPos(seq[i]);
          const b = dotPos(d);
          return (
            <Line
              key={`${si}-${i}`}
              x1={a.cx} y1={a.cy}
              x2={b.cx} y2={b.cy}
              stroke="#4338CA"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          );
        })
      )}
      {showDots && [...new Set(seqs.flat())].map(d => {
        const { cx, cy } = dotPos(d);
        return <Circle key={`a${d}`} cx={cx} cy={cy} r={4} fill="#4338CA" />;
      })}
    </Svg>
  );
}


function shuffle(arr: number[]): number[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function DSST() {
  const router = useRouter();
  const { sessionMode, completeGame, isLastGame, savePartialSession, resetSession } = useSession();

  // ── countdown ──
  const [countdown, setCountdown] = useState(false);

  // ── phase ──
  const [phase, setPhase] = useState<'intro' | 'playing' | 'results'>('intro');

  // ── session ──
  // sessionMap[digit] = symbol type index
  const [sessionMap, setSessionMap]   = useState<number[]>(DIGITS);
  const [currentDigit, setCurrentDigit] = useState(0);
  const [score, setScore]             = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const scoreRef = useRef(0);
  const attemptsRef = useRef(0);
  const itemTimesRef = useRef<number[]>([]);
  const itemStartTimeRef = useRef<number>(0);

  // ── drawing state (dot-connect pattern lock) ──
  // strokes: array of completed strokes (each stroke = array of dot indices)
  // currentStroke: dots visited in current in-progress stroke
  const [strokes, setStrokes]               = useState<number[][]>([]);
  const strokesRef                          = useRef<number[][]>([]);
  const currentStrokeRef                    = useRef<number[]>([]);
  const visitedInCurrentRef                 = useRef<Set<number>>(new Set());
  const [, forceUpdate]                     = useState(0);

  // ── feedback ──
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  // ── timer ──
  const [timeLeft, setTimeLeft] = useState(60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gameStartTimeRef = useRef<Date | null>(null);

  // ─── game control ───────────────────────────────────────────────────────
  const clearDrawing = useCallback(() => {
    strokesRef.current = [];
    currentStrokeRef.current = [];
    visitedInCurrentRef.current = new Set();
    setStrokes([]);
    forceUpdate(n => n + 1);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startGame = useCallback(() => {
    stopTimer();
    const map = shuffle(Array.from({ length: 19 }, (_, i) => i)).slice(0, 10);
    setSessionMap(map);
    setScore(0); scoreRef.current = 0;
    setTotalAttempts(0); attemptsRef.current = 0;
    itemTimesRef.current = [];
    setTimeLeft(60);
    clearDrawing();
    setCurrentDigit(Math.floor(Math.random() * 10));
    setPhase('playing');
    gameStartTimeRef.current = new Date();
    itemStartTimeRef.current = Date.now();

    let remaining = 60;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        const metricsPayload = {
          score: scoreRef.current,
          totalAttempts: attemptsRef.current,
          accuracy: attemptsRef.current > 0 ? Math.round((scoreRef.current / attemptsRef.current) * 100) : 0,
          itemTimes: itemTimesRef.current,
        };
        if (sessionMode === 'full_session') {
          completeGame('dsst', metricsPayload, gameStartTimeRef.current ?? new Date());
          if (isLastGame()) {
            router.replace('/session-results');
          } else {
            router.replace('/session-transition');
          }
        } else {
          saveGameResult('dsst', EMPATICA_PARTICIPANT.fullId, gameStartTimeRef.current ?? new Date(), new Date(), metricsPayload);
          setPhase('results');
        }
      }
    }, 1000);
  }, [clearDrawing, stopTimer]);

  const handleBackToIntro = useCallback(() => {
    stopTimer();
    setPhase('intro');
    setScore(0);
    setTotalAttempts(0);
    setTimeLeft(60);
    clearDrawing();
  }, [clearDrawing, stopTimer]);

  const handleBackToDashboard = useCallback(() => {
    if (sessionMode === 'full_session') {
      savePartialSession();
      resetSession();
    }
    stopTimer();
    setPhase('intro');
    setScore(0);
    setTotalAttempts(0);
    setTimeLeft(30);
    clearDrawing();
    router.replace('/(tabs)/dashboard');
  }, [router, clearDrawing, stopTimer, sessionMode, savePartialSession, resetSession]);

  // ─── pattern lock pan responder ─────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,

      onPanResponderGrant: (evt) => {
        // Start new stroke — clear visited set for this stroke
        visitedInCurrentRef.current = new Set();
        currentStrokeRef.current    = [];
        checkCapture(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        forceUpdate(n => n + 1);
      },

      onPanResponderMove: (evt) => {
        checkCapture(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        forceUpdate(n => n + 1);
      },

      onPanResponderRelease: () => {
        if (currentStrokeRef.current.length >= 2) {
          strokesRef.current = [...strokesRef.current, [...currentStrokeRef.current]];
          setStrokes([...strokesRef.current]);
        }
        currentStrokeRef.current = [];
        visitedInCurrentRef.current = new Set();
        forceUpdate(n => n + 1);
      },
    })
  ).current;

  function checkCapture(lx: number, ly: number) {
    for (let i = 0; i < 9; i++) {
      if (visitedInCurrentRef.current.has(i)) continue;
      const { x, y } = dotXY(i);
      const dist = Math.sqrt((lx - x) ** 2 + (ly - y) ** 2);
      if (dist < CAPTURE_R) {
        visitedInCurrentRef.current.add(i);
        currentStrokeRef.current = [...currentStrokeRef.current, i];
        break; 
      }
    }
  }

  const handleSubmit = useCallback(() => {
    const allStrokes = [...strokesRef.current];
    if (allStrokes.length === 0 || allStrokes.every(s => s.length < 2)) return;

    const recognized = recognizeSymbol(allStrokes);
    const expected   = sessionMap[currentDigit];
    const correct    = recognized === expected;

    itemTimesRef.current = [...itemTimesRef.current, Date.now() - itemStartTimeRef.current];

    if (correct) { setScore(s => { scoreRef.current = s + 1; return s + 1; }); }
    setTotalAttempts(t => { attemptsRef.current = t + 1; return t + 1; });
    setFeedback(correct ? 'correct' : 'wrong');

    setTimeout(() => {
      setFeedback(null);
      clearDrawing();
      setCurrentDigit(Math.floor(Math.random() * 10));
      itemStartTimeRef.current = Date.now();
    }, 700);
  }, [sessionMap, currentDigit, clearDrawing]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: INTRO
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <View style={s.header}>
          <TouchableOpacity onPress={handleBackToDashboard} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>DSST</Text>
          <View style={s.ph} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.iconCircle}>
            <Ionicons name="grid-outline" size={60} color="#8B5CF6" />
          </View>

          <Text style={s.bigTitle}>Digit Symbol Substitution Test</Text>
          <Text style={s.subText}>
            Assesses processing speed and working memory to evaluate your current cognitive acuity.
          </Text>

          {/* How it works */}
          <View style={s.howItWorksCard}>
            <Text style={s.cardTitle}>How it works:</Text>
            {[
              'Check the reference table to find the symbol for the displayed digit.',
              'Draw the symbol on the grid and tap Submit to continue.',
              'Complete as many as possible within 60 seconds.',
            ].map((text, i) => (
              <View key={i} style={s.howStep}>
                <View style={s.howStepNum}>
                  <Text style={s.howStepNumText}>{i + 1}</Text>
                </View>
                <Text style={s.howStepText}>{text}</Text>
              </View>
            ))}
          </View>

          {/* Symbol reference table */}
          <View style={s.card}>
            <Text style={s.cardTitle}>All 20 symbols — learn them before playing</Text>
            <Text style={s.familiarizeNote}>
              Take a moment to familiarize yourself with the symbols before starting.
            </Text>
            {CANONICAL_SEQS.map((_, i) => (
              <View key={i} style={s.symbolRow}>
                <MiniPreview symIdx={i} size={72} showDots={true} />
                <View style={s.symbolInfo}>
                  <Text style={s.symbolChar}>{SYMBOL_CHARS[i]}</Text>
                </View>
              </View>
            ))}
          </View>
          <DSSTDemo />
          {/* Tips */}
          <View style={s.rulesCard}>
            <Ionicons name="information-circle" size={20} color="#8B5CF6" style={{ marginBottom: 8 }} />
            {[
              'At the start of each session, the system will randomly choose 10 of the 20 above symbols.',
              'These symbols will remain unchanged throughout your current session.',
            ].map((r, i) => (
              <View key={i} style={s.ruleRow}>
                <View style={s.bullet} />
                <Text style={s.ruleText}>{r}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={s.startBtn} onPress={() => setCountdown(true)}>
            <Text style={s.startBtnText}>Begin Test</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          </TouchableOpacity>
        </ScrollView>
        {countdown && (
          <Countdown onComplete={() => { setCountdown(false); startGame(); }} />
        )}
       
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: RESULTS
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'results') {
    const acc = totalAttempts > 0 ? Math.round((score / totalAttempts) * 100) : 0;
    const passed = score >= 20;
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <View style={s.header}>
          <TouchableOpacity onPress={handleBackToDashboard} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>DSST Results</Text>
          <View style={s.ph} />
        </View>

        <ScrollView contentContainerStyle={s.resultScroll}>
          <View style={[s.iconCircle, { backgroundColor: passed ? '#D1FAE5' : '#FEE2E2' }]}>
            <Ionicons
              name={passed ? 'checkmark-circle' : 'close-circle'}
              size={64}
              color={passed ? '#10B981' : '#EF4444'}
            />
          </View>

          <Text style={s.bigTitle}>{passed ? 'Excellent!' : 'Test Complete'}</Text>
          <Text style={s.subText}>
            {passed ? 'You passed the DSST!' : 'Keep practicing to improve your speed'}
          </Text>

          <View style={s.scoreCard}>
            <Text style={s.scoreLabel}>Final Score</Text>
            <Text style={s.scoreNum}>{score}</Text>
            <Text style={s.scoreSubLabel}>correct drawings</Text>
            <View style={s.statsRow}>
              <View style={s.statItem}>
                <Text style={s.statLabel}>Accuracy</Text>
                <Text style={s.statValue}>{acc}%</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Text style={s.statLabel}>Total</Text>
                <Text style={s.statValue}>{totalAttempts}</Text>
              </View>
            </View>
          </View>

          <ScoreTrendCard
            gameType="dsst"
            participantId="2872-1-1-1"
            currentMetrics={{ score, accuracy: acc, totalAttempts }}
          />

          <TouchableOpacity style={s.retryButton} onPress={() => setCountdown(true)}>
            <Ionicons name="refresh" size={20} color="#FFF" />
            <Text style={s.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ghostBtn} onPress={handleBackToDashboard}>
            <Text style={s.ghostBtnText}>Back to Dashboard</Text>
          </TouchableOpacity>
        </ScrollView>
        {countdown && (
          <Countdown onComplete={() => { setCountdown(false); startGame(); }} />
        )}
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: GAME
  // ─────────────────────────────────────────────────────────────────────────
  const hasDrawing = strokesRef.current.some(s => s.length >= 2) ||
                     currentStrokeRef.current.length >= 2;

  // All dots currently "lit" (visited in any committed stroke)
  const litDots = new Set(strokesRef.current.flat());
  // Current in-progress stroke dots
  const activeDots = new Set(currentStrokeRef.current);

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleBackToIntro} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>DSST</Text>
        <View style={s.ph} />
      </View>

      <ScrollView style={s.gameWrap} contentContainerStyle={s.gameWrapContent} showsVerticalScrollIndicator={false}>

        {/* ── Stats bar ── */}
        <View style={s.statsBar}>
          <View style={s.statPill}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />
            <Text style={s.statPillText}>{score} correct</Text>
          </View>
          <View style={[s.statPill, timeLeft <= 10 && { borderColor: '#EF4444' }]}>
            <Ionicons name="timer-outline" size={16} color={timeLeft <= 10 ? '#EF4444' : '#8B5CF6'} />
            <Text style={[s.statPillText, timeLeft <= 10 && { color: '#EF4444' }]}>{timeLeft}s</Text>
          </View>
        </View>

        {/* ── Reference grid (2 rows × 5 cols) ── */}
        <Text style={s.refLabel}>Reference:</Text>
        {[DIGITS.slice(0, 5), DIGITS.slice(5)].map((row, ri) => (
          <View key={ri} style={[s.refGrid, ri === 0 && s.refGridTop]}>
            {row.map(d => (
              <View key={d} style={s.refCell}>
                <Text style={s.refNum}>{d}</Text>
                <MiniPreview symIdx={sessionMap[d]} size={38} />
              </View>
            ))}
          </View>
        ))}

        {/* ── Stimulus + Drawing canvas ── */}
        {/* Stimulus strip above canvas */}
        <View style={s.stimBox}>
          <Text style={s.refLabel}>Draw the symbol for:</Text>
          <Text style={s.stimDigit}>{currentDigit}</Text>
        </View>

        {/* Pattern-lock canvas */}
        <View style={s.mainRow}>
          <View
            style={s.canvas}
            {...panResponder.panHandlers}
          >
            <Svg width={CANVAS_SIZE} height={CANVAS_SIZE}>

              {/* ── Committed stroke lines ── */}
              {strokesRef.current.map((stroke, si) =>
                stroke.slice(1).map((d, i) => {
                  const a = dotXY(stroke[i]);
                  const b = dotXY(d);
                  return (
                    <Line
                      key={`cs-${si}-${i}`}
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke="#4338CA" strokeWidth={4} strokeLinecap="round"
                    />
                  );
                })
              )}

              {/* ── In-progress stroke lines ── */}
              {currentStrokeRef.current.slice(1).map((d, i) => {
                const a = dotXY(currentStrokeRef.current[i]);
                const b = dotXY(d);
                return (
                  <Line
                    key={`al-${i}`}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke="#8B5CF6" strokeWidth={4} strokeLinecap="round"
                  />
                );
              })}

              {/* ── Dots ── */}
              {Array.from({ length: 9 }, (_, i) => {
                const { x, y } = dotXY(i);
                const isActive = activeDots.has(i);
                const isLit    = litDots.has(i);
                return (
                  <React.Fragment key={i}>
                    {/* Outer ring for active dots */}
                    {(isActive || isLit) && (
                      <Circle cx={x} cy={y} r={DOT_RADIUS + 4}
                        fill={isActive ? 'rgba(139,92,246,0.2)' : 'rgba(67,56,202,0.15)'}
                      />
                    )}
                    {/* Main dot */}
                    <Circle
                      cx={x} cy={y} r={DOT_RADIUS}
                      fill={isActive ? '#8B5CF6' : isLit ? '#4338CA' : '#E5E7EB'}
                    />
                  </React.Fragment>
                );
              })}
            </Svg>

            {/* Feedback overlay */}
            {feedback && (
              <View style={[
                s.feedbackOverlay,
                feedback === 'correct' ? s.feedbackOK : s.feedbackErr,
              ]}>
                <Text style={s.feedbackIcon}>
                  {feedback === 'correct' ? '✓' : '✕'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Action buttons ── */}
        <View style={s.actionRow}>
          <TouchableOpacity style={s.clearBtn} onPress={clearDrawing}>
            <Ionicons name="refresh-outline" size={16} color="#6B7280" />
            <Text style={s.clearBtnText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.submitBtn, !hasDrawing && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!hasDrawing}
          >
            <Text style={s.submitBtnText}>Submit</Text>
            <Ionicons name="checkmark" size={16} color="#FFF" />
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#FAFAFA' },
  header:     {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn:    { padding: 4 },
  headerTitle:{ fontSize: 18, fontWeight: '700', color: '#1F2937' },
  ph:         { width: 32 },

  // intro / results scroll
  scroll:     { padding: 20, paddingBottom: 40 },
  resultScroll: { padding: 40, alignItems: 'center' },

  iconCircle: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: '#F5F3FF',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 20,
  },
  bigTitle:   { fontSize: 22, fontWeight: '700', color: '#1F2937', textAlign: 'center', marginBottom: 10 },
  subText:    { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21, marginBottom: 24, paddingHorizontal: 10 },

  card:       { backgroundColor: '#F9FAFB', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20 },
  cardTitle:  { fontSize: 14, fontWeight: '700', color: '#1F2937', marginBottom: 14 },

  symbolRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  symbolInfo: { flex: 1 },
  symbolChar: { fontSize: 22, fontWeight: '700', color: '#4338CA', marginBottom: 2 },
  symbolDesc: { fontSize: 11, color: '#6B7280', lineHeight: 16 },

  rulesCard:  { backgroundColor: '#F9FAFB', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 28 },
  rulesTitle: { fontSize: 14, fontWeight: '700', color: '#1F2937', marginBottom: 12 },
  ruleRow:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  bullet:     { width: 6, height: 6, borderRadius: 3, backgroundColor: '#8B5CF6', marginTop: 6, marginRight: 10 },
  ruleText:   { flex: 1, fontSize: 13, color: '#6B7280', lineHeight: 19 },

  retryButton: {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#8B5CF6",
  paddingVertical: 16,
  paddingHorizontal: 32,
  borderRadius: 12,
  marginBottom: 16,
},
retryButtonText: {
  fontSize: 16,
  fontWeight: "600",
  color: "#FFFFFF",
  marginLeft: 8,
},

  startBtn:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#8B5CF6', paddingVertical: 16, borderRadius: 12, gap: 8,
  },
  startBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  ghostBtn:   { paddingVertical: 12, marginTop: 8 },
  ghostBtnText: { fontSize: 15, fontWeight: '600', color: '#8B5CF6', textAlign: 'center' },

  // game
  gameWrap:   { flex: 1 },
  gameWrapContent: { flexGrow: 1, padding: 16 },
  statsBar:   { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  statPill:   {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFF', paddingVertical: 7, paddingHorizontal: 16,
    borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
  },
  statPillText: { fontSize: 18, fontWeight: '700', color: '#1F2937' },

  refLabel:   { fontSize: 11, fontWeight: '600', color: '#6B7280', marginBottom: 4 },
  refGrid:    {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB',
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
    overflow: 'hidden', marginBottom: 12,
  },
  refGridTop: {
    borderTopLeftRadius: 10, borderTopRightRadius: 10,
    borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
    borderBottomWidth: 0, marginBottom: 0,
  },
  refCell:    { flex: 1, alignItems: 'center', paddingVertical: 4, backgroundColor: '#F9FAFB', borderRightWidth: 0.5, borderRightColor: '#E5E7EB' },
  refNum:     { fontSize: 13, fontWeight: '700', color: '#9CA3AF', marginBottom: 2 },

  mainRow:    { alignItems: 'center', marginBottom: 14 },

  stimBox:    {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, borderWidth: 2, borderColor: '#8B5CF6', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 20,
    backgroundColor: '#FFF', marginBottom: 12,
  },
  stimDigit:  { fontSize: 36, fontWeight: '700', color: '#1F2937' },

  canvas:     {
    width: CANVAS_SIZE, height: CANVAS_SIZE,
    backgroundColor: '#FFF', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#D1D5DB',
    overflow: 'hidden', alignSelf: 'center',
  },

  feedbackOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    opacity: 0.8, borderRadius: 12,
  },
  feedbackOK:  { backgroundColor: '#D1FAE5' },
  feedbackErr: { backgroundColor: '#FEE2E2' },
  feedbackIcon: { fontSize: 64, fontWeight: '700' },

  actionRow:  { flexDirection: 'row', gap: 10 },
  clearBtn:   {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#F3F4F6', paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  clearBtnText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  submitBtn:  {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#8B5CF6', paddingVertical: 12, borderRadius: 10,
  },
  submitBtnDisabled: { backgroundColor: '#C4B5FD' },
  submitBtnText: { fontSize: 14, fontWeight: '600', color: '#FFF' },

  // results
  scoreCard:  { backgroundColor: '#FFF', borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 28, width: '100%' },
  scoreLabel: { fontSize: 14, color: '#6B7280', marginBottom: 8 },
  scoreNum:   { fontSize: 56, fontWeight: '700', color: '#8B5CF6' },
  scoreSubLabel: { fontSize: 13, color: '#9CA3AF', marginBottom: 20 },
  statsRow:   { flexDirection: 'row', alignItems: 'center', paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB', width: '100%' },
  statItem:   { flex: 1, alignItems: 'center' },
  statDivider:{ width: 1, height: 36, backgroundColor: '#E5E7EB' },
  statLabel:  { fontSize: 11, color: '#6B7280', marginBottom: 4 },
  statValue:  { fontSize: 20, fontWeight: '700', color: '#1F2937' },

  howItWorksCard: { backgroundColor: '#F9FAFB', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20 },
  howStep:        { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  howStepNum:     { width: 30, height: 30, borderRadius: 15, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  howStepNumText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  howStepText:    { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },
  familiarizeNote:{ fontSize: 13, color: '#6B7280', fontStyle: 'italic', marginBottom: 16, lineHeight: 18 },
});



