import { fetchGameHistoryFull, fetchSessionGameHistory, HistoricalRecord } from '@/lib/firestore';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

const SCREEN_W = Dimensions.get('window').width;
// card has 20px scrollview padding + 16px card padding on each side
const CARD_INNER_W = SCREEN_W - 72;
const COL_GAP = 8;
const CHART_W = Math.floor((CARD_INNER_W - COL_GAP) / 2);
const CHART_H = 80;
const PAD = { top: 14, bottom: 18, left: 30, right: 4 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;

const CHART_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#3B82F6', '#14B8A6'];

const GAME_METRICS: Record<string, { key: string; label: string; unit?: string }[]> = {
  dsst: [
    { key: 'score', label: 'Score' },
    { key: 'accuracy', label: 'Accuracy', unit: '%' },
    { key: 'totalAttempts', label: 'Attempts' },
  ],
  stroop_naming: [
    { key: 'accuracy', label: 'Accuracy', unit: '%' },
    { key: 'avgReactionTimeMs', label: 'Reaction Time', unit: 'ms' },
    { key: 'timeDeltaSeconds', label: 'Time Delta', unit: 's' },
  ],
  typing_game: [
    { key: 'wpm', label: 'WPM' },
    { key: 'accuracy', label: 'Accuracy', unit: '%' },
    { key: 'efficiency', label: 'Efficiency', unit: '%' },
  ],
  single_leg_stand: [
    { key: 'stabilityScore', label: 'Stability' },
    { key: 'sampleCount', label: 'Samples' },
    { key: 'averageGyro.x', label: 'Gyro X' },
    { key: 'averageGyro.y', label: 'Gyro Y' },
    { key: 'averageGyro.z', label: 'Gyro Z' },
  ],
  walk_and_turn: [
    { key: 'stabilityScore', label: 'Stability' },
    { key: 'forwardGyroAvg', label: 'Fwd Gyro Avg' },
    { key: 'backGyroAvg', label: 'Back Gyro Avg' },
    { key: 'totalSamples', label: 'Samples' },
  ],
  choice_reaction: [
    { key: 'avgPressReactionTimeMs', label: 'Press RT', unit: 'ms' },
    { key: 'avgReleaseReactionTimeMs', label: 'Release RT', unit: 'ms' },
    { key: 'timeDeltaSeconds', label: 'Time Delta', unit: 's' },
  ],
  trail_task: [
    { key: 'completionTimeSeconds', label: 'Completion Time', unit: 's' },
    { key: 'errorCount', label: 'Errors' },
  ],
  tongue_twister: [
    { key: 'phrasesCompleted', label: 'Phrases' },
    { key: 'correctReadings', label: 'Correct' },
    { key: 'avgJitter', label: 'Jitter' },
    { key: 'avgShimmer', label: 'Shimmer' },
    { key: 'avgPhonemeErrorRate', label: 'Phoneme Err' },
    { key: 'avgSpeakingRate', label: 'Speaking Rate', unit: 'w/s' },
  ],
};

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtVal(v: number) {
  if (Number.isInteger(v)) return String(v);
  if (Math.abs(v) < 0.01) return v.toFixed(4);
  return v.toFixed(2);
}

interface ChartPoint { label: string; value: number; isCurrent?: boolean; }

function MiniChart({ data, color }: { data: ChartPoint[]; color: string }) {
  const values = data.map(d => d.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const range = rawMax - rawMin || 1;

  const gx = (i: number) =>
    PAD.left + (data.length === 1 ? INNER_W / 2 : (i / (data.length - 1)) * INNER_W);
  const gy = (v: number) => PAD.top + (1 - (v - rawMin) / range) * INNER_H;
  const pts = data.map((d, i) => `${gx(i)},${gy(d.value)}`).join(' ');

  return (
    <Svg width={CHART_W} height={CHART_H}>
      {/* axes */}
      <Line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + INNER_H} stroke="#E5E7EB" strokeWidth={1} />
      <Line x1={PAD.left} y1={PAD.top + INNER_H} x2={PAD.left + INNER_W} y2={PAD.top + INNER_H} stroke="#E5E7EB" strokeWidth={1} />

      {/* line */}
      {data.length > 1 && (
        <Polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      )}

      {/* dots */}
      {data.map((d, i) => (
        <Circle
          key={i}
          cx={gx(i)} cy={gy(d.value)}
          r={d.isCurrent ? 5 : 3}
          fill={d.isCurrent ? '#EF4444' : color}
          stroke="#FFFFFF" strokeWidth={1}
        />
      ))}

      {/* x labels: first and last only */}
      <SvgText x={gx(0)} y={CHART_H - 2} fontSize="7.5" fill="#9CA3AF" textAnchor="middle">
        {data[0].label}
      </SvgText>
      {data.length > 1 && (
        <SvgText x={gx(data.length - 1)} y={CHART_H - 2} fontSize="7.5" fill="#EF4444" textAnchor="middle">
          Now
        </SvgText>
      )}

      {/* y labels */}
      <SvgText x={PAD.left - 3} y={PAD.top + 4} fontSize="7" fill="#9CA3AF" textAnchor="end">
        {fmtVal(rawMax)}
      </SvgText>
      <SvgText x={PAD.left - 3} y={PAD.top + INNER_H + 2} fontSize="7" fill="#9CA3AF" textAnchor="end">
        {fmtVal(rawMin)}
      </SvgText>
    </Svg>
  );
}

interface Props {
  gameType: string;
  participantId: string;
  currentMetrics: Record<string, any>;
  sessionType?: 'individual' | 'full_session';
}

export function ScoreTrendCard({ gameType, participantId, currentMetrics, sessionType = 'individual' }: Props) {
  const [history, setHistory] = useState<HistoricalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const fetch = sessionType === 'full_session'
      ? fetchSessionGameHistory(gameType, participantId)
      : fetchGameHistoryFull(gameType, participantId, 'individual');
    fetch.then(h => {
      if (mounted.current) { setHistory(h); setLoading(false); }
    });
    return () => { mounted.current = false; };
  }, [gameType, participantId, sessionType]);

  const metricDefs = GAME_METRICS[gameType] ?? [];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Score Trends</Text>
        <Text style={styles.subtitle}>
          {loading ? 'Loading…' : history.length === 0 ? 'First attempt — play again to see trends' : `${history.length} previous attempt${history.length === 1 ? '' : 's'}`}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#6366F1" />
        </View>
      ) : (
        <View style={styles.grid}>
          {metricDefs.map((def, idx) => {
            const currentValue = getNestedValue(currentMetrics, def.key);
            if (typeof currentValue !== 'number' || isNaN(currentValue)) return null;

            const histPoints: ChartPoint[] = history
              .map(rec => {
                const v = getNestedValue(rec.metrics, def.key);
                return typeof v === 'number' && !isNaN(v)
                  ? { label: fmtDate(rec.date), value: v }
                  : null;
              })
              .filter((p): p is ChartPoint => p !== null);

            const allPoints: ChartPoint[] = [
              ...histPoints,
              { label: 'Now', value: currentValue, isCurrent: true },
            ];

            const trend = histPoints.length > 0
              ? currentValue - histPoints[histPoints.length - 1].value
              : null;

            const color = CHART_COLORS[idx % CHART_COLORS.length];

            return (
              <View key={def.key} style={styles.cell}>
                <View style={styles.cellHeader}>
                  <Text style={styles.cellLabel} numberOfLines={1}>
                    {def.label}{def.unit ? ` (${def.unit})` : ''}
                  </Text>
                  {trend !== null && (
                    <Text style={[styles.trendText, { color: trend >= 0 ? '#10B981' : '#EF4444' }]}>
                      {trend >= 0 ? '▲' : '▼'} {fmtVal(Math.abs(trend))}
                    </Text>
                  )}
                </View>
                <Text style={[styles.currentVal, { color }]}>{fmtVal(currentValue)}</Text>
                {allPoints.length >= 2 ? (
                  <MiniChart data={allPoints} color={color} />
                ) : (
                  <View style={styles.noHistBox}>
                    <Text style={styles.noHistText}>No history yet</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
    width: '100%',
  },
  header: { marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '700', color: '#1F2937', marginBottom: 2 },
  subtitle: { fontSize: 11, color: '#9CA3AF' },
  loadingBox: { height: 80, alignItems: 'center', justifyContent: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: COL_GAP,
  },
  cell: {
    width: CHART_W,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  cellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cellLabel: { fontSize: 10, color: '#6B7280', flex: 1, fontWeight: '600' },
  trendText: { fontSize: 9, fontWeight: '700', marginLeft: 4 },
  currentVal: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  noHistBox: { height: CHART_H, alignItems: 'center', justifyContent: 'center' },
  noHistText: { fontSize: 10, color: '#D1D5DB', fontStyle: 'italic' },
});
