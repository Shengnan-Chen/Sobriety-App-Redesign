import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useSession, GAME_ROUTES, GAME_NAMES } from '@/lib/SessionContext';
import { fetchLatestPartialSession, abandonPartialSession, PartialSessionDoc } from '@/lib/firestore';
import { useParticipant } from '@/lib/ParticipantContext';
import { markVerificationShown, wasVerificationShown } from '@/lib/auth';
import { saveParticipantConfig } from '@/lib/participantConfig';
import { scale, ms, vs } from '@/lib/scale';

const games = [
  { id: 1, name: 'Visual Pursuit', category: 'OCULUR ASSESSMENT', time: '2-5 min', icon: 'eye-outline', color: '#3B82F6', route: '/(tabs)/(games)/VisualPursuit/VisualPursuit' },
  { id: 2, name: 'Walk and Turn', category: 'PSYCHOMOTOR', time: '1-2 min', icon: 'walk-outline', color: '#8B5CF6', route: '/(tabs)/(games)/WalkAndTurn/WalkAndTurn' },
  { id: 3, name: 'Single Leg Stand', category: 'BALANCE CONTROL', time: '30 sec', icon: 'person-outline', color: '#06B6D4', route: '/(tabs)/(games)/SingleLegStand/SingleLegStand' },
  { id: 4, name: 'Choice Reaction', category: 'COGNITIVE', time: '1 min', icon: 'timer-outline', color: '#8B5CF6', route: '/(tabs)/(games)/ChoiceReaction/ChoiceReaction' },
  { id: 5, name: 'DSST', category: 'COGNITIVE', time: '2 min', icon: 'grid-outline', color: '#8B5CF6', route: '/(tabs)/(games)/DSST/DSST' },
  { id: 6, name: 'Tongue Twisters', category: 'LINGUISTIC', time: '1 min', icon: 'chatbox-outline', color: '#06B6D4', route: '/(tabs)/(games)/TongueTwister/TongueTwister' },
  { id: 7, name: 'Typing Challenge', category: 'MOTOR SKILLS', time: '2 min', icon: 'rocket-outline', color: '#10B981', route: '/(tabs)/(games)/TypingGame/TypingGame' },
  { id: 8, name: 'Stroop Naming', category: 'COGNITIVE', time: '30 sec', icon: 'text-outline', color: '#3B82F6', route: '/(tabs)/(games)/StroopNaming/StroopNaming' },
  { id: 9, name: 'Trail Task', category: 'COGNITIVE', time: '2 min', icon: 'trail-sign-outline', color: '#f63bf6', route: '/(tabs)/(games)/TrailTask/TrailTask' },
];

export default function Dashboard() {
  const router = useRouter();
  const { sessionMode, setSessionMode, resumeSession, startSession } = useSession();
  const { config, loading } = useParticipant();
  const [partialSession, setPartialSession] = useState<PartialSessionDoc | null>(null);
  const [verifyVisible, setVerifyVisible] = useState(false);

  // Re-run whenever the participant config becomes available
  useEffect(() => {
    const participantId = config?.fullId ?? '';
    fetchLatestPartialSession(participantId).then(session => {
      setPartialSession(session);
    });
  }, [config?.fullId]);

  // Show the verification dialog once per login. The flag lives in the auth
  // module (not a per-mount ref), so returning to the dashboard after a full
  // session does NOT re-trigger it — only a new login does.
  useEffect(() => {
    if (loading || wasVerificationShown()) return;
    markVerificationShown();
    setVerifyVisible(true);
  }, [loading]);

  const handleConfirmId = async () => {
    // Re-persist the current config as an explicit confirmation (no-op if absent).
    if (config) await saveParticipantConfig(config);
    setVerifyVisible(false);
  };

  const handleGoToSettings = () => {
    setVerifyVisible(false);
    // Pass a changing value so Profile re-expands the config section every time.
    router.push({ pathname: '/(tabs)/profile', params: { expandConfig: String(Date.now()) } } as any);
  };

  const idMissing = !config?.fullId || !config?.serialNumber;

  const handleContinueSession = () => {
    if (!partialSession) return;
    resumeSession(partialSession);
    setPartialSession(null);
    router.replace('/session-start' as any);
  };

  // "Start New" on the resume card just dismisses the card — doesn't launch anything.
  // The "Start Full Session" button below is what actually starts a new session.
  const handleDismissPartialSession = () => {
    if (partialSession?.id) abandonPartialSession(partialSession.id);
    setPartialSession(null);
  };

  const handleStartFullSession = () => {
    startSession();
    router.replace('/session-start' as any);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <TouchableOpacity>
          <Ionicons name="person-circle-outline" size={32} color="#1F2937" />
        </TouchableOpacity>
      </View>

      {/* Mode Toggle */}
      <View style={styles.modeToggleContainer}>
        <TouchableOpacity
          style={[styles.modeButton, sessionMode === 'individual' && styles.modeButtonActive]}
          onPress={() => setSessionMode('individual')}
        >
          <Ionicons name="apps-outline" size={16} color={sessionMode === 'individual' ? '#FFFFFF' : '#6B7280'} />
          <Text style={[styles.modeButtonText, sessionMode === 'individual' && styles.modeButtonTextActive]}>
            Individual Games
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, sessionMode === 'full_session' && styles.modeButtonActive]}
          onPress={() => setSessionMode('full_session')}
        >
          <Ionicons name="layers-outline" size={16} color={sessionMode === 'full_session' ? '#FFFFFF' : '#6B7280'} />
          <Text style={[styles.modeButtonText, sessionMode === 'full_session' && styles.modeButtonTextActive]}>
            Full Session
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {sessionMode === 'full_session' ? (
          <View style={styles.fullSessionContainer}>

            {/* Resume card — only shown when a partial session exists */}
            {partialSession && (
              <View style={styles.resumeCard}>
                <View style={styles.resumeIconWrap}>
                  <Ionicons name="time-outline" size={28} color="#F59E0B" />
                </View>
                <Text style={styles.resumeTitle}>Unfinished Session</Text>
                <Text style={styles.resumeSubtitle}>
                  {partialSession.gamesCompleted} of {partialSession.gameQueue.length} games completed
                </Text>
                {/* Show remaining games */}
                <View style={styles.resumeGameList}>
                  {partialSession.gameQueue
                    .filter(g => partialSession.gameTimes[g] === undefined)
                    .map(g => (
                      <View key={g} style={styles.resumeGameItem}>
                        <Ionicons name="ellipse-outline" size={12} color="#6B7280" />
                        <Text style={styles.resumeGameName}>{GAME_NAMES[g] ?? g}</Text>
                      </View>
                    ))}
                </View>
                <View style={styles.resumeButtons}>
                  <TouchableOpacity style={styles.continueButton} onPress={handleContinueSession}>
                    <Ionicons name="play-circle" size={18} color="#FFFFFF" />
                    <Text style={styles.continueButtonText}>Continue</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.newSessionButton} onPress={handleDismissPartialSession}>
                    <Ionicons name="close" size={18} color="#6B7280" />
                    <Text style={styles.newSessionButtonText}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={styles.fullSessionCard}>
              <View style={styles.fullSessionIconWrap}>
                <Ionicons name="layers-outline" size={48} color="#6366F1" />
              </View>
              <Text style={styles.fullSessionTitle}>Full Session Mode</Text>
              <Text style={styles.fullSessionSubtitle}>
                Complete all 9 tests in a randomized order. Results are saved together as one session.
              </Text>

              <View style={styles.gameListPreview}>
                {games.map((g) => (
                  <View key={g.id} style={styles.gameListItem}>
                    <Ionicons name={g.icon as any} size={18} color={g.color} />
                    <Text style={styles.gameListItemText}>{g.name}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={styles.startSessionButton} onPress={handleStartFullSession}>
                <Ionicons name="play-circle-outline" size={24} color="#FFFFFF" />
                <Text style={styles.startSessionButtonText}>Start Full Session</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.grid}>
            {games.map((game) => (
              <TouchableOpacity
                key={game.id}
                style={styles.card}
                onPress={() => router.push(game.route as any)}
              >
                <View style={[styles.iconContainer, { backgroundColor: `${game.color}15` }]}>
                  <Ionicons name={game.icon as any} size={28} color={game.color} />
                </View>
                <Text style={styles.gameName}>{game.name}</Text>
                <Text style={styles.gameCategory}>{game.category}</Text>
                <View style={styles.timeContainer}>
                  <Ionicons name="time-outline" size={14} color="#9CA3AF" />
                  <Text style={styles.timeText}>{game.time}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Verification dialog — shown every time the dashboard is entered */}
      <Modal
        visible={verifyVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVerifyVisible(false)}
      >
        <View style={styles.verifyBackdrop}>
          <View style={styles.verifyCard}>
            <TouchableOpacity
              style={styles.verifyClose}
              onPress={() => setVerifyVisible(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>

            <View style={styles.verifyIconWrap}>
              <Ionicons name="watch-outline" size={32} color="#6366F1" />
            </View>
            <Text style={styles.verifyTitle}>Confirm Your Assigned Info</Text>
            <Text style={styles.verifySubtitle}>
              Please confirm that the Participant ID and Watch Serial Number below match your
              assigned device.
            </Text>

            <View style={styles.verifyValues}>
              <View style={styles.verifyRow}>
                <Text style={styles.verifyKey}>Participant ID</Text>
                <Text style={[styles.verifyVal, !config?.fullId && styles.verifyValMissing]}>
                  {config?.fullId || 'Not set'}
                </Text>
              </View>
              <View style={styles.verifyDivider} />
              <View style={styles.verifyRow}>
                <Text style={styles.verifyKey}>Watch Serial Number</Text>
                <Text style={[styles.verifyVal, !config?.serialNumber && styles.verifyValMissing]}>
                  {config?.serialNumber || 'Not set'}
                </Text>
              </View>
            </View>

            {idMissing && (
              <View style={styles.verifyWarn}>
                <Ionicons name="alert-circle" size={16} color="#B45309" />
                <Text style={styles.verifyWarnText}>
                  Invalid Participant ID or Watch Serial Number. Please update this information in Profile.
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.verifySettingsButton} onPress={handleGoToSettings}>
              <Ionicons name="settings-outline" size={18} color="#6366F1" />
              <Text style={styles.verifySettingsText}>Go to Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.verifySaveButton, idMissing && styles.verifySaveDisabled]}
              onPress={handleConfirmId}
              disabled={idMissing}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.verifySaveText}>Confirm</Text>
            </TouchableOpacity>
            
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  // Verification dialog
  verifyBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  verifyCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  verifyClose: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    zIndex: 1,
  },
  verifyIconWrap: {
    width: scale(64),
    height: scale(64),
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    marginTop: 6,
  },
  verifyTitle: {
    fontSize: ms(20),
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  verifySubtitle: {
    fontSize: 13.5,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
  },
  verifyValues: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  verifyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  verifyKey: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  verifyVal: { fontSize: 14, fontWeight: '700', color: '#1F2937', fontFamily: 'monospace' },
  verifyValMissing: { color: '#DC2626' },
  verifyDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 12 },
  verifyWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  verifyWarnText: { flex: 1, fontSize: 12.5, color: '#B45309', lineHeight: 17 },
  verifySettingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#6366F1',
    marginBottom: 10,
  },
  verifySettingsText: { fontSize: 15, fontWeight: '700', color: '#6366F1' },
  verifySaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#6366F1',
  },
  verifySaveDisabled: { backgroundColor: '#C7D2FE' },
  verifySaveText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: ms(24),
    fontWeight: '700',
    color: '#1F2937',
  },
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  modeButtonActive: {
    backgroundColor: '#6366F1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  modeButtonTextActive: {
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  iconContainer: {
    width: scale(56),
    height: scale(56),
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  gameName: {
    fontSize: ms(16),
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  gameCategory: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 4,
  },
  // Resume card
  resumeCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
  },
  resumeIconWrap: {
    width: scale(52),
    height: scale(52),
    borderRadius: 26,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  resumeTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  resumeSubtitle: {
    fontSize: 13,
    color: '#B45309',
    marginBottom: 12,
  },
  resumeGameList: {
    marginBottom: 16,
    gap: 6,
  },
  resumeGameItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resumeGameName: {
    fontSize: 13,
    color: '#6B7280',
  },
  resumeButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  continueButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  continueButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  newSessionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#6366F1',
    gap: 6,
  },
  newSessionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6366F1',
  },

  // Full Session Mode
  fullSessionContainer: {
    paddingTop: 8,
  },
  fullSessionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  fullSessionIconWrap: {
    width: scale(96),
    height: scale(96),
    borderRadius: 48,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  fullSessionTitle: {
    fontSize: ms(22),
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  fullSessionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  gameListPreview: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  gameListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  gameListItemText: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '500',
  },
  startSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    gap: 10,
  },
  startSessionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});


