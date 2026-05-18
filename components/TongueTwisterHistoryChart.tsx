import { fetchGameHistoryFull } from '@/lib/firestore';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

const SCREEN_W = Dimensions.get('window').width;
// scrollview padding: 40 each side; card padding: 16 each side
const CHART_W = SCREEN_W - 112;
const CHART_H = 200;
const PAD = { top: 20, bottom: 32, left: 28, right: 8 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;

const METRICS: { key: string; label: string; color: string }[] = [
  { key: 'correctReadings',     label: 'Correct Readings', color: '#10B981' },
  { key: 'avgPhonemeErrorRate', label: 'Phoneme Error',    color: '#EF4444' },
  { key: 'avgJitter',           label: 'Jitter',           color: '#F59E0B' },
  { key: 'avgShimmer',          label: 'Shimmer',          color: '#8B5CF6' },
  { key: 'avgSpeakingRate',     label: 'Speaking Rate',    color: '#3B82F6' },
];

function normalize(values: (number | null)[]): (number | null)[] {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return values.map(() => null);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  return values.map(v => (v === null ? null : (v - min) / range));
}

interface CurrentMetrics {
  correctReadings?: number | null;
  avgPhonemeErrorRate?: number | null;
  avgJitter?: number | null;
  avgShimmer?: number | null;
  avgSpeakingRate?: number | null;
}

interface Props {
  currentMetrics: CurrentMetrics;
  participantId: string;
}

export function TongueTwisterHistoryChart({ currentMetrics, participantId }: Props) {
  const [history, setHistory] = useState<{ date: string; metrics: Record<string, any> }[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    fetchGameHistoryFull('tongue_twister', participantId).then(h => {
      if (mounted.current) { setHistory(h); setLoading(false); }
    });
    return () => { mounted.current = false; };
  }, [participantId]);

  const allRecords = [
    ...history,
    { date: new Date().toISOString(), metrics: currentMetrics as Record<string, any> },
  ];

  const n = allRecords.length;
  const gx = (i: number) =>
    PAD.left + (n <= 1 ? INNER_W / 2 : (i / (n - 1)) * INNER_W);
  const gy = (v: number) => PAD.top + (1 - v) * INNER_H;

  const fmtDate = (iso: string, i: number) => {
    if (i === n - 1) return 'Now';
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // build normalized series per metric
  const series = METRICS.map(m => ({
    ...m,
    raw: allRecords.map(r => {
      const v = r.metrics[m.key];
      return typeof v === 'number' && !isNaN(v) ? v : null;
    }),
  })).map(s => ({ ...s, norm: normalize(s.raw) }));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Performance Over Time</Text>
      <Text style={styles.subtitle}>
        All 5 metrics normalized to [0–1] across their own range · red dot = current session
      </Text>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#F59E0B" />
        </View>
      ) : n < 2 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            Complete the game again to see your trend over time.
          </Text>
        </View>
      ) : (
        <Svg width={CHART_W} height={CHART_H}>
          {/* horizontal grid lines at 0, 0.25, 0.5, 0.75, 1 */}
          {[0, 0.25, 0.5, 0.75, 1].map(t => (
            <Line
              key={`grid-${t}`}
              x1={PAD.left} y1={gy(t)}
              x2={PAD.left + INNER_W} y2={gy(t)}
              stroke={t === 0 || t === 1 ? '#D1D5DB' : '#F3F4F6'}
              strokeWidth={t === 0 || t === 1 ? 1 : 0.8}
              strokeDasharray={t !== 0 && t !== 1 ? '4,3' : undefined}
            />
          ))}
          {/* y-axis */}
          <Line
            x1={PAD.left} y1={PAD.top}
            x2={PAD.left} y2={PAD.top + INNER_H}
            stroke="#D1D5DB" strokeWidth={1}
          />

          {/* y-axis labels */}
          {[1, 0.5, 0].map(t => (
            <SvgText
              key={`yl-${t}`}
              x={PAD.left - 4} y={gy(t) + 3}
              fontSize="8" fill="#9CA3AF" textAnchor="end"
            >
              {t.toFixed(1)}
            </SvgText>
          ))}

          {/* lines per metric */}
          {series.map(s => {
            const pts = s.norm
              .map((v, i) => (v !== null ? `${gx(i)},${gy(v)}` : null))
              .filter(Boolean) as string[];
            if (pts.length < 2) return null;
            return (
              <Polyline
                key={`line-${s.key}`}
                points={pts.join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}

          {/* dots */}
          {series.map(s =>
            s.norm.map((v, i) => {
              if (v === null) return null;
              const isCurrent = i === n - 1;
              return (
                <Circle
                  key={`dot-${s.key}-${i}`}
                  cx={gx(i)} cy={gy(v)}
                  r={isCurrent ? 5 : 3}
                  fill={isCurrent ? '#EF4444' : s.color}
                  stroke="#FFFFFF" strokeWidth={1.5}
                />
              );
            })
          )}

          {/* x-axis labels: first, last, and evenly spaced ones in between */}
          {allRecords.map((r, i) => {
            const skip = n > 6 && i !== 0 && i !== n - 1 && i % Math.ceil((n - 1) / 4) !== 0;
            if (skip) return null;
            return (
              <SvgText
                key={`xl-${i}`}
                x={gx(i)} y={CHART_H - 4}
                fontSize="8"
                fill={i === n - 1 ? '#EF4444' : '#9CA3AF'}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                fontWeight={i === n - 1 ? '700' : '400'}
              >
                {fmtDate(r.date, i)}
              </SvgText>
            );
          })}
        </Svg>
      )}

      {/* legend */}
      <View style={styles.legend}>
        {METRICS.map(m => (
          <View key={m.key} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: m.color }]} />
            <Text style={styles.legendLabel}>{m.label}</Text>
          </View>
        ))}
      </View>
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
  title: { fontSize: 15, fontWeight: '700', color: '#1F2937', marginBottom: 2 },
  subtitle: { fontSize: 10, color: '#9CA3AF', marginBottom: 12, lineHeight: 14 },
  loadingBox: { height: CHART_H, alignItems: 'center', justifyContent: 'center' },
  emptyBox: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 18, height: 3, borderRadius: 2 },
  legendLabel: { fontSize: 10, color: '#6B7280' },
});
