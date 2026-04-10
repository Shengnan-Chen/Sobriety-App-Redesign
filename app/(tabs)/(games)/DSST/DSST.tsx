import { GameTimer } from '@/components/GameTimer';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useRef, useState } from 'react';
import {
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';

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
const SYMBOL_CHARS = ['>', '✓', '✕', 'Z', 'L', 'U', '◇', '∧', 'W', '/'];
const SYMBOL_DESC  = [
  'Right angle — start TL, drag to MR, then BL',
  'Checkmark — start TR, drag to BC, then ML',
  'X cross — two strokes: TL→BR and TR→BL',
  'Z shape — start TL, right to TR, diagonal to BL, right to BR',
  'L shape — start TL, drag down to BL, then right to BR',
  'U shape — start TL, drag down to BL, right to BR, up to TR',
  'Small square — trace edges TC→MR→BC→ML',
  'Triangle — start BL, draw up to TC, then down to BR',
  'W shape — TL→BL→MC→BR→TR',
  'Slash — diagonal BL to TR (or TR to BL)',
];

// Canonical dot sequences for each symbol (used for mini-preview + recognition)
// Multiple variants allow different drawing approaches
// Each entry is one or more dot sequences. For single-stroke symbols, one
// sequence is enough — the edge-set matcher handles any draw order/direction.
// For X (sym 2), both sequences are the two REQUIRED strokes; their edges combine.
const CANONICAL_SEQS: number[][][] = [
  [[0, 5, 6]],            // 0 >  chevron
  [[2, 7, 3]],            // 1 ✓  checkmark
  [[0, 4, 8], [2, 4, 6]], // 2 ✕  X — two required strokes
  [[0, 2, 6, 8]],          // 3 Z  shape (top→right→diag→bottom)
  [[0, 6, 8]],            // 4 L  shape
  [[0, 6, 8, 2]],         // 5 U  shape
  [[1, 5, 7, 3]],         // 6 ▫  small square
  [[6, 1, 8]],            // 7 △  triangle — BL→TC→BR
  [[0, 6, 4, 8, 2]],      // 8 W  shape
  [[6, 4, 2]],            // 9 /  slash
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

  CANONICAL_SEQS.forEach((variants, symIdx) => {
    // Combine expanded edges from all variants into one canonical edge set
    const canonEdges = new Set<string>();
    variants.forEach(seq => seqToEdgeSet(seq).forEach(e => canonEdges.add(e)));

    const score = jaccardDist(userEdges, canonEdges);
    if (score < bestScore) {
      bestScore = score;
      bestSym = symIdx;
    }
  });

  // 0.25 threshold: user must share ≥75% of edges with the best-matching symbol
  return bestScore <= 0.25 ? bestSym : -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const CANVAS_SIZE = 240;
const DOT_RADIUS  = 14;
const CAPTURE_R   = 30; // finger must be within this px to capture a dot
const PADDING     = 40; // canvas edge padding

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

function MiniPreview({ symIdx }: { symIdx: number }) {
  const step = (MINI - MINI_PAD * 2) / 2;
  const seqs = CANONICAL_SEQS[symIdx];

  const dotPos = (d: number) => ({
    cx: MINI_PAD + DOT_COLS[d] * step,
    cy: MINI_PAD + DOT_ROWS[d] * step,
  });

  return (
    <Svg width={MINI} height={MINI}>
      {/* All 9 dots (dim) */}
      {Array.from({ length: 9 }, (_, i) => {
        const { cx, cy } = dotPos(i);
        return <Circle key={i} cx={cx} cy={cy} r={3} fill="#D1D5DB" />;
      })}
      {/* Connected lines */}
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
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        })
      )}
      {/* Active dots (bright) */}
      {[...new Set(seqs.flat())].map(d => {
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

  // ── phase ──
  const [phase, setPhase] = useState<'intro' | 'playing' | 'results'>('intro');

  // ── session ──
  // sessionMap[digit] = symbol type index
  const [sessionMap, setSessionMap]   = useState<number[]>(DIGITS);
  const [currentDigit, setCurrentDigit] = useState(0);
  const [score, setScore]             = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);

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

  // ── canvas offset (for touch → canvas coord mapping) ──
  const canvasOffset = useRef({ x: 0, y: 0 });

  // ─── game control ───────────────────────────────────────────────────────
  const clearDrawing = useCallback(() => {
    strokesRef.current = [];
    currentStrokeRef.current = [];
    visitedInCurrentRef.current = new Set();
    setStrokes([]);
    forceUpdate(n => n + 1);
  }, []);

  const startGame = useCallback(() => {
    const map = shuffle(DIGITS);
    setSessionMap(map);
    setScore(0);
    setTotalAttempts(0);
    clearDrawing();
    setCurrentDigit(Math.floor(Math.random() * 10));
    setPhase('playing');
  }, [clearDrawing]);

  const handleGameOver = useCallback(() => setPhase('results'), []);

  const handleBackToIntro = useCallback(() => {
    setPhase('intro');
    setScore(0);
    setTotalAttempts(0);
    clearDrawing();
  }, [clearDrawing]);

  const handleBackToDashboard = useCallback(() => {
    setPhase('intro');
    setScore(0);
    setTotalAttempts(0);
    clearDrawing();
    router.replace('/(tabs)/dashboard');
  }, [router, clearDrawing]);

  // ─── pattern lock pan responder ─────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,

      onPanResponderGrant: (evt) => {
        // Start new stroke — clear visited set for this stroke
        visitedInCurrentRef.current = new Set();
        currentStrokeRef.current    = [];
        checkCapture(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
        forceUpdate(n => n + 1);
      },

      onPanResponderMove: (evt) => {
        checkCapture(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
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

  function checkCapture(pageX: number, pageY: number) {
    const lx = pageX - canvasOffset.current.x;
    const ly = pageY - canvasOffset.current.y;

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

    if (correct) setScore(s => s + 1);
    setTotalAttempts(t => t + 1);
    setFeedback(correct ? 'correct' : 'wrong');

    setTimeout(() => {
      setFeedback(null);
      clearDrawing();
      setCurrentDigit(Math.floor(Math.random() * 10));
    }, 700);
  }, [sessionMap, currentDigit, clearDrawing]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: INTRO
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
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
            Each digit 0–9 maps to a symbol. When shown a number, draw its
            symbol by connecting the dots — just like a phone pattern lock.
          </Text>

          <View style={s.card}>
            <Text style={s.cardTitle}>The 10 symbols &amp; how to draw them</Text>
            {CANONICAL_SEQS.map((_, i) => (
              <View key={i} style={s.symbolRow}>
                <MiniPreview symIdx={i} />
                <View style={s.symbolInfo}>
                  <Text style={s.symbolChar}>{SYMBOL_CHARS[i]}</Text>
                  <Text style={s.symbolDesc} numberOfLines={2}>{SYMBOL_DESC[i]}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={s.rulesCard}>
            <Text style={s.rulesTitle}>Rules</Text>
            {[
              '60 seconds — match as many as possible',
              'Drag through the dots to draw the symbol',
              'Tap Clear to redo, Submit to confirm',
              'Symbol grid reshuffles each new session',
              'You advance whether correct or not',
            ].map((r, i) => (
              <View key={i} style={s.ruleRow}>
                <View style={s.bullet} />
                <Text style={s.ruleText}>{r}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={s.startBtn} onPress={startGame}>
            <Text style={s.startBtnText}>Begin Test</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          </TouchableOpacity>
        </ScrollView>
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
      <SafeAreaView style={s.container} edges={['top']}>
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

          <TouchableOpacity style={s.startBtn} onPress={startGame}>
            <Ionicons name="refresh" size={20} color="#FFF" />
            <Text style={s.startBtnText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ghostBtn} onPress={handleBackToDashboard}>
            <Text style={s.ghostBtnText}>Back to Dashboard</Text>
          </TouchableOpacity>
        </ScrollView>
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
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleBackToIntro} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>DSST</Text>
        <View style={s.ph} />
      </View>

      <View style={s.gameWrap}>

        {/* ── Stats bar ── */}
        <View style={s.statsBar}>
          <View style={s.statPill}>
            <Ionicons name="time-outline" size={16} color="#8B5CF6" />
            <GameTimer time={60} onTimeUp={handleGameOver} />
          </View>
          <View style={s.statPill}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />
            <Text style={s.statPillText}>{score}</Text>
          </View>
        </View>

        {/* ── Reference grid (2 rows × 5 cols) ── */}
        <Text style={s.refLabel}>Reference:</Text>
        {[DIGITS.slice(0, 5), DIGITS.slice(5)].map((row, ri) => (
          <View key={ri} style={[s.refGrid, ri === 0 && s.refGridTop]}>
            {row.map(d => (
              <View
                key={d}
                style={[s.refCell, d === currentDigit && s.refCellHL]}
              >
                <Text style={[s.refNum, d === currentDigit && s.refNumHL]}>{d}</Text>
                <Text style={[s.refSym, d === currentDigit && s.refSymHL]}>
                  {SYMBOL_CHARS[sessionMap[d]]}
                </Text>
              </View>
            ))}
          </View>
        ))}

        {/* ── Stimulus + Drawing canvas ── */}
        <View style={s.mainRow}>

          {/* Stimulus box */}
          <View style={s.stimBox}>
            <Text style={s.stimDigit}>{currentDigit}</Text>
          </View>

          {/* Pattern-lock canvas */}
          <View
            style={s.canvas}
            onLayout={e => {
              e.target.measure((_x, _y, _w, _h, px, py) => {
                canvasOffset.current = { x: px, y: py };
              });
            }}
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

      </View>
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

  startBtn:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#8B5CF6', paddingVertical: 16, borderRadius: 12, gap: 8,
  },
  startBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  ghostBtn:   { paddingVertical: 12, marginTop: 8 },
  ghostBtnText: { fontSize: 15, fontWeight: '600', color: '#8B5CF6', textAlign: 'center' },

  // game
  gameWrap:   { flex: 1, padding: 16 },
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
  refCell:    { flex: 1, alignItems: 'center', paddingVertical: 7, backgroundColor: '#F9FAFB', borderRightWidth: 0.5, borderRightColor: '#E5E7EB' },
  refCellHL:  { backgroundColor: '#EEF2FF' },
  refNum:     { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
  refNumHL:   { color: '#4338CA' },
  refSym:     { fontSize: 18, fontWeight: '600', color: '#374151' },
  refSymHL:   { color: '#4338CA' },

  mainRow:    { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 14 },

  stimBox:    {
    width: 80, borderWidth: 2, borderColor: '#8B5CF6', borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 12,
    backgroundColor: '#FFF', height: CANVAS_SIZE,
  },
  stimDigit:  { fontSize: 36, fontWeight: '700', color: '#1F2937', marginBottom: 6 },
  stimSym:    { fontSize: 18, color: '#8B5CF6', marginTop: 6 },

  canvas:     {
    width: CANVAS_SIZE, height: CANVAS_SIZE,
    backgroundColor: '#FFF', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#D1D5DB',
    overflow: 'hidden',
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
});
