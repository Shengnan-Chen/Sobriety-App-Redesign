import { logoutUser, onAuthChanged } from '@/lib/auth';
import { setActiveParticipant } from '@/lib/empaticaConfig';
import { parseParticipantConfig, saveParticipantConfig } from '@/lib/participantConfig';
import { useParticipant } from '@/lib/ParticipantContext';
import { scale } from '@/lib/scale';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Profile() {
  const router = useRouter();
  const { expandConfig } = useLocalSearchParams<{ expandConfig?: string }>();
  const { config, refresh } = useParticipant();

  const [user, setUser] = useState<User | null>(null);
  const [fullId, setFullId] = useState(config?.fullId ?? '');
  const [serial, setSerial] = useState(config?.serialNumber ?? '');
  const [saving, setSaving] = useState(false);
  const [configExpanded, setConfigExpanded] = useState(false);

  useEffect(() => {
    const unsub = onAuthChanged(u => setUser(u));
    return unsub;
  }, []);

  // Auto-expand the Empatica Configuration section when arriving via "Go to Settings".
  useEffect(() => {
    if (expandConfig) setConfigExpanded(true);
  }, [expandConfig]);

  // Sync fields when config loads/changes
  useEffect(() => {
    if (config) {
      setFullId(config.fullId);
      setSerial(config.serialNumber);
    }
  }, [config]);

  const handleSaveConfig = async () => {
    const parsed = parseParticipantConfig(fullId, serial);
    if (!parsed) {
      Alert.alert(
        'Invalid format',
        'Participant Full ID must be in the format shown in the Empatica Care Lab app (e.g. 2872-1-1-1).',
      );
      return;
    }
    Keyboard.dismiss(); // blur inputs so the cursor stops blinking after saving
    setSaving(true);
    await saveParticipantConfig(parsed);
    setActiveParticipant(parsed);
    await refresh();
    setSaving(false);
    Alert.alert('Saved', 'Empatica configuration updated.');
  };

  const handleSignOut = async () => {
    await logoutUser();
    router.replace('/(auth)/signin');
  };

  const parsedPreview = fullId && serial ? parseParticipantConfig(fullId, serial) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile header */}
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={40} color="#6366F1" />
              </View>
            </View>
            <Text style={styles.profileEmail}>{user?.email ?? '—'}</Text>
            <Text style={styles.profileRole}>Research Participant</Text>
          </View>

          {/* Empatica config section */}
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setConfigExpanded(v => !v)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeaderLeft}>
              <Ionicons name="watch-outline" size={18} color="#6366F1" />
              <Text style={styles.sectionTitle}>Empatica Configuration</Text>
            </View>
            <Ionicons
              name={configExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#9CA3AF"
            />
          </TouchableOpacity>

          {configExpanded && (
            <View style={styles.configCard}>
              {/* Current values */}
              {config && (
                <View style={styles.currentConfig}>
                  {[
                    ['Participant Full ID', config.fullId],
                    ['Watch Serial', config.serialNumber],
                    ['Subject ID', config.subjectId],
                    ['Device ID', config.deviceId],
                  ].map(([k, v]) => (
                    <View key={k} style={styles.configRow}>
                      <Text style={styles.configKey}>{k}</Text>
                      <Text style={styles.configVal}>{v}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.editLabel}>Update Participant Full ID</Text>
              <TextInput
                style={styles.input}
                value={fullId}
                onChangeText={setFullId}
                placeholder="e.g. 2872-1-1-1"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.editLabel}>Update Watch Serial Number</Text>
              <TextInput
                style={styles.input}
                value={serial}
                onChangeText={setSerial}
                placeholder="e.g. 3YK671D258"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                autoCorrect={false}
              />

              {/* Live preview */}
              {parsedPreview && (fullId !== config?.fullId || serial !== config?.serialNumber) && (
                <View style={styles.previewCard}>
                  <Text style={styles.previewTitle}>New configuration preview</Text>
                  {[
                    ['Subject ID', parsedPreview.subjectId],
                    ['Device ID', parsedPreview.deviceId],
                  ].map(([k, v]) => (
                    <View key={k} style={styles.configRow}>
                      <Text style={styles.configKey}>{k}</Text>
                      <Text style={styles.configVal}>{v}</Text>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSaveConfig}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.saveButtonText}>Save Configuration</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Sign out */}
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#FAFAFA' },
  scrollView:  { flex: 1 },
  scrollContent: { paddingBottom: 48 },

  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  avatarContainer: { marginBottom: 14 },
  avatar: {
    width: scale(80),
    height: scale(80),
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileEmail: { fontSize: 18, fontWeight: '700', color: '#1F2937', marginBottom: 4 },
  profileRole:  { fontSize: 13, color: '#6B7280' },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#1F2937' },

  configCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginBottom: 16,
  },
  currentConfig: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 14,
    marginBottom: 18,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  configRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  configKey:  { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  configVal:  { fontSize: 12, fontWeight: '700', color: '#1F2937', fontFamily: 'monospace' },

  editLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1F2937',
    marginBottom: 16,
    fontFamily: 'monospace',
    backgroundColor: '#FAFAFA',
  },

  previewCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    gap: 6,
  },
  previewTitle: { fontSize: 11, fontWeight: '600', color: '#15803D', marginBottom: 4 },

  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 13,
    borderRadius: 10,
    gap: 8,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },

  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    marginHorizontal: 20,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  signOutText: { fontSize: 16, fontWeight: '600', color: '#EF4444' },
});


