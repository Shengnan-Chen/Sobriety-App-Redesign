import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

const SCREEN_W = Dimensions.get('window').width;
// card padding 16×2 + scroll padding 20×2 = 72
const CHART_W  = SCREEN_W - 72;
const CHART_H  = 150;
const PAD      = { top: 16, bottom: 28, left: 40, right: 12 };
const INNER_W  = CHART_W - PAD.left - PAD.right;
const INNER_H  = CHART_H - PAD.top  - PAD.bottom;

interface DataPoint { session: number; value: number }

interface Props {
  data: DataPoint[];
  color: string;
  label: string;
  lowerBetter?: boolean;
}

function fmt(v: number) {
  if (Number.isInteger(v)) return String(v);
  return v < 0.1 ? v.toFixed(3) : v.toFixed(2);
}

export function SessionLineChart({ data, color, label, lowerBetter }: Props) {
  if (data.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyLabel}>{label}</Text>
        <Text style={styles.emptyText}>No session data yet</Text>
      </View>
    );
  }

  const values  = data.map(d => d.value);
  const minV    = Math.min(...values);
  const maxV    = Math.max(...values);
  const range   = maxV - minV || 1;

  const toX = (i: number) =>
    PAD.left + (data.length > 1 ? (i / (data.length - 1)) * INNER_W : INNER_W / 2);
  const toY = (v: number) =>
    PAD.top + INNER_H - ((v - minV) / range) * INNER_H;

  const polyPts = data.map((d, i) => `${toX(i)},${toY(d.value)}`).join(' ');

  const latest = values[values.length - 1];
  const first  = values[0];
  const delta  = latest - first;
  const isGood = delta === 0 ? null : lowerBetter ? delta < 0 : delta > 0;
  const trendColor = isGood === null ? '#9CA3AF' : isGood ? '#10B981' : '#EF4444';
  const trendStr   = delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${fmt(delta)}`;

  const gridFracs = [0, 0.5, 1];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.trendBadge, { backgroundColor: trendColor + '20' }]}>
          <Text style={[styles.trendText, { color: trendColor }]}>{trendStr}</Text>
        </View>
      </View>

      <Svg width={CHART_W} height={CHART_H}>
        {/* Horizontal grid lines + y-axis labels */}
        {gridFracs.map((f, i) => {
          const y = PAD.top + INNER_H * (1 - f);
          const v = minV + range * f;
          return (
            <React.Fragment key={i}>
              <Line
                x1={PAD.left} y1={y}
                x2={PAD.left + INNER_W} y2={y}
                stroke="#F3F4F6" strokeWidth={1}
              />
              <SvgText
                x={PAD.left - 4} y={y + 4}
                fontSize={9} fill="#9CA3AF" textAnchor="end"
              >
                {fmt(v)}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Connection line */}
        {data.length > 1 && (
          <Polyline
            points={polyPts}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Data points + x labels */}
        {data.map((d, i) => (
          <React.Fragment key={i}>
            <Circle cx={toX(i)} cy={toY(d.value)} r={5} fill={color} />
            <SvgText
              x={toX(i)} y={CHART_H - 4}
              fontSize={9} fill="#9CA3AF" textAnchor="middle"
            >
              {`S${d.session}`}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { marginBottom: 24 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  label:      { fontSize: 13, fontWeight: '600', color: '#374151', flex: 1 },
  trendBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  trendText:  { fontSize: 12, fontWeight: '700' },
  empty:      { alignItems: 'center', paddingVertical: 24 },
  emptyLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  emptyText:  { fontSize: 12, color: '#9CA3AF' },
});
