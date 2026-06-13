import { useSession, GAME_NAMES } from '@/lib/SessionContext';
import { saveSession } from '@/lib/saveSession';
import { EMPATICA_PARTICIPANT } from '@/lib/empaticaConfig';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { scale, ms, vs } from '@/lib/scale';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const GAME_ICONS: Record<string, string> = {
  visual_pursuit: 'eye-outline',
  dsst: 'grid-outline',
  tongue_twister: 'mic-outline',
  choice_reaction: 'timer-outline',
  stroop_naming: 'text-outline',
  trail_task: 'git-branch-outline',
  typing_game: 'rocket-outline',
  single_leg_stand: 'person-outline',
  walk_and_turn: 'walk-outline',
};

const GAME_KEY_METRICS: Record<string, string[]> = {
  dsst: ['score', 'accuracy', 'totalAttempts'],
  tongue_twister: ['phrasesCompleted', 'avgJitter', 'avgSpeakingRate'],
  choice_reaction: ['avgPressReactionTimeMs', 'errors', 'totalRounds'],
  stroop_naming: ['score', 'accuracy', 'totalAttempts'],
  trail_task: ['completionTimeSeconds', 'passed', 'circlesCompleted'],
  typing_game: ['wpm', 'accuracy', 'efficiency'],
  single_leg_stand: ['stabilityScore', 'sampleCount'],
  walk_and_turn: ['stabilityScore', 'totalSamples', 'forwardGyroAvg'],
};

const VP_ROUNDS = [
  { key: 'vertical_left',   label: 'R1 — Vertical Left' },
  { key: 'vertical_right',  label: 'R2 — Vertical Right' },
  { key: 'horizontal_left', label: 'R3 — Horizontal Left' },
  { key: 'horizontal_right',label: 'R4 — Horizontal Right' },
];

function VPMetrics({ metrics }: { metrics: any }) {
  return (
    <View style={styles.metricsContainer}>
      {VP_ROUNDS.map(({ key, label }) => {
        const r = metrics?.rounds?.[key];
        const pupilPct = r?.totalFrames
          ? Math.round((r.pupilDetected ?? 0) / r.totalFrames * 100)
          : null;
        const xNyst = r?.nystagmus?.xNystagmusScore ?? null;
        const yNyst = r?.nystagmus?.yNystagmusScore ?? null;
        return (
          <View key={key} style={styles.vpRoundRow}>
            <Text style={styles.vpRoundLabel}>{label}</Text>
            <View style={styles.vpRoundValues}>
              <Text style={styles.vpStat}>
                <Text style={styles.vpStatLabel}>Pupil </Text>
                <Text style={styles.metricValue}>{pupilPct !== null ? `${pupilPct}%` : '—'}</Text>
              </Text>
              <Text style={styles.vpStat}>
                <Text style={styles.vpStatLabel}>H-Nyst </Text>
                <Text style={styles.metricValue}>{xNyst !== null ? xNyst.toFixed(1) : '—'}</Text>
              </Text>
              <Text style={styles.vpStat}>
                <Text style={styles.vpStatLabel}>V-Nyst </Text>
                <Text style={styles.metricValue}>{yNyst !== null ? yNyst.toFixed(1) : '—'}</Text>
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

function formatMetricValue(value: any): string {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

function formatMetricKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/\./g, ' ')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

export default function SessionResults() {
  const router = useRouter();
  const { sessionResults, sessionGameTimes, sessionStartTime, gameQueue, resetSession, awaitAllPendingJobs, hasPendingJobs, partialSessionId, getSessionResults } = useSession();
  const [saveState, setSaveState] = useState<'pending' | 'saving' | 'saved' | 'error'>('pending');

  // Auto-save as soon as this screen mounts (after any background analysis jobs finish).
  // This way the session is in Firestore even if the user closes the app without tapping the button.
  useEffect(() => {
    setSaveState('saving');
    awaitAllPendingJobs()          // wait for VP / TT background analysis if still running
      .then(() => saveSession(
        EMPATICA_PARTICIPANT.fullId,
        sessionStartTime ?? new Date(),
        new Date(),
        getSessionResults(),       // read live results — background jobs may have updated these
        sessionGameTimes,
        'complete',
        gameQueue,
        partialSessionId ?? undefined,
      ))
      .then(() => setSaveState('saved'))
      .catch(e => {
        console.log('[SessionResults] Auto-save error:', e);
        setSaveState('error');
      });
  }, []);

  const handleReturn = () => {
    resetSession();
    router.replace('/(tabs)/dashboard');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Session Complete</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <View style={styles.heroBadge}>
            <Ionicons name="trophy-outline" size={48} color="#6366F1" />
          </View>
          <Text style={styles.heroTitle}>All 9 Games Complete!</Text>
          <Text style={styles.heroSubtitle}>
            {gameQueue.length} games completed in this session
          </Text>
        </View>

        {gameQueue.map((gameKey) => {
          const metrics = sessionResults[gameKey];
          const icon = GAME_ICONS[gameKey] ?? 'game-controller-outline';
          const name = GAME_NAMES[gameKey] ?? gameKey;
          const metricKeys = GAME_KEY_METRICS[gameKey] ?? [];

          return (
            <View key={gameKey} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <Ionicons name={icon as any} size={22} color="#6366F1" />
                </View>
                <Text style={styles.cardTitle}>{name}</Text>
                {metrics ? (
                  <View style={styles.completedBadge}>
                    <Text style={styles.completedBadgeText}>Done</Text>
                  </View>
                ) : (
                  <View style={[styles.completedBadge, styles.skippedBadge]}>
                    <Text style={styles.completedBadgeText}>Skipped</Text>
                  </View>
                )}
              </View>

              {metrics ? (
                gameKey === 'visual_pursuit'
                  ? <VPMetrics metrics={metrics} />
                  : (
                    <View style={styles.metricsContainer}>
                      {metricKeys.map((metricKey) => {
                        const value = getNestedValue(metrics, metricKey);
                        return (
                          <View key={metricKey} style={styles.metricRow}>
                            <Text style={styles.metricLabel}>{formatMetricKey(metricKey)}</Text>
                            <Text style={styles.metricValue}>{formatMetricValue(value)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )
              ) : (
                <Text style={styles.noDataText}>No data recorded</Text>
              )}
            </View>
          );
        })}

        {/* Save status indicator */}
        <View style={styles.saveStatus}>
          {saveState === 'saving' && (
            <>
              <ActivityIndicator size="small" color="#6366F1" />
              <Text style={styles.saveStatusText}>Saving session...</Text>
            </>
          )}
          {saveState === 'saved' && (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              <Text style={[styles.saveStatusText, { color: '#10B981' }]}>Session saved</Text>
            </>
          )}
          {saveState === 'error' && (
            <>
              <Ionicons name="warning-outline" size={18} color="#EF4444" />
              <Text style={[styles.saveStatusText, { color: '#EF4444' }]}>Save failed — tap below to retry</Text>
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saveState === 'saving' && styles.saveButtonDisabled]}
          onPress={saveState === 'error' ? () => {
            setSaveState('saving');
            saveSession(
              EMPATICA_PARTICIPANT.fullId,
              sessionStartTime ?? new Date(),
              new Date(),
              sessionResults,
              sessionGameTimes,
              'complete',
              gameQueue,
              partialSessionId ?? undefined,
            ).then(() => setSaveState('saved')).catch(() => setSaveState('error'));
          } : handleReturn}
          disabled={saveState === 'saving'}
        >
          {saveState === 'saving' ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : saveState === 'error' ? (
            <>
              <Ionicons name="refresh" size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Retry Save</Text>
            </>
          ) : (
            <>
              <Ionicons name="home-outline" size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Return to Dashboard</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1F2937' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  heroSection: { alignItems: 'center', marginBottom: 32 },
  heroBadge: {
    width: scale(96),
    height: scale(96),
    borderRadius: scale(48),
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#1F2937', marginBottom: 4 },
  heroSubtitle: { fontSize: 14, color: '#6B7280' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1F2937' },
  completedBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  skippedBadge: { backgroundColor: '#F3F4F6' },
  completedBadgeText: { fontSize: 11, fontWeight: '600', color: '#065F46' },
  metricsContainer: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 12 },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  metricLabel: { fontSize: 13, color: '#6B7280', flex: 1 },
  metricValue: { fontSize: 13, fontWeight: '700', color: '#1F2937', textAlign: 'right' },
  noDataText: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic', marginTop: 4 },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
    gap: 10,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  saveStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
    minHeight: 24,
  },
  saveStatusText: { fontSize: 13, fontWeight: '500', color: '#6B7280' },

  vpRoundRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  vpRoundLabel: { fontSize: 12, fontWeight: '700', color: '#6366F1', marginBottom: 4 },
  vpRoundValues: { flexDirection: 'row', gap: 12 },
  vpStat: { fontSize: 12 },
  vpStatLabel: { color: '#6B7280' },
});



