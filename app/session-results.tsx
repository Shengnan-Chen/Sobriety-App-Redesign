import { useSession, GAME_NAMES } from '@/lib/SessionContext';
import { saveSession } from '@/lib/saveSession';
import { EMPATICA_PARTICIPANT } from '@/lib/empaticaConfig';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
  visual_pursuit: ['apiSuccess', 'portrait.xNystagmus', 'landscape.xNystagmus'],
  dsst: ['score', 'accuracy', 'totalAttempts'],
  tongue_twister: ['phrasesCompleted', 'avgJitter', 'avgSpeakingRate'],
  choice_reaction: ['avgPressReactionTimeMs', 'errors', 'totalRounds'],
  stroop_naming: ['score', 'accuracy', 'totalAttempts'],
  trail_task: ['completionTimeSeconds', 'passed', 'circlesCompleted'],
  typing_game: ['wpm', 'accuracy', 'efficiency'],
  single_leg_stand: ['stabilityScore', 'sampleCount'],
  walk_and_turn: ['stabilityScore', 'totalSamples', 'forwardGyroAvg'],
};

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
  const { sessionResults, sessionGameTimes, sessionStartTime, gameQueue, resetSession, awaitAllPendingJobs, hasPendingJobs, partialSessionId } = useSession();
  const [saving, setSaving] = useState(false);
  const [awaitingAnalysis, setAwaitingAnalysis] = useState(false);

  // If background analysis jobs are still running when we arrive here,
  // wait for them automatically so the save button shows accurate data.
  useEffect(() => {
    if (!hasPendingJobs()) return;
    setAwaitingAnalysis(true);
    awaitAllPendingJobs().then(() => setAwaitingAnalysis(false));
  }, []);

  const handleSaveAndReturn = async () => {
    setSaving(true);
    try {
      // In case jobs finished between the useEffect and the button press
      await awaitAllPendingJobs();
      await saveSession(
        EMPATICA_PARTICIPANT.fullId,
        sessionStartTime ?? new Date(),
        new Date(),
        sessionResults,
        sessionGameTimes,
        'complete',
        gameQueue,
        partialSessionId ?? undefined,  // updates existing doc if this was a resumed session
      );
    } catch (e) {
      console.log('[SessionResults] Save error:', e);
    }
    resetSession();
    router.replace('/(tabs)/dashboard');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
              ) : (
                <Text style={styles.noDataText}>No data recorded</Text>
              )}
            </View>
          );
        })}

        <TouchableOpacity
          style={[styles.saveButton, (saving || awaitingAnalysis) && styles.saveButtonDisabled]}
          onPress={handleSaveAndReturn}
          disabled={saving || awaitingAnalysis}
        >
          {awaitingAnalysis ? (
            <>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Completing analysis...</Text>
            </>
          ) : saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Save & Return to Dashboard</Text>
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
    width: 96,
    height: 96,
    borderRadius: 48,
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
});

