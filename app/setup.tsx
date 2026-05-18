import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useParticipant } from '@/lib/ParticipantContext';
import { parseParticipantConfig, saveParticipantConfig } from '@/lib/participantConfig';

export default function Setup() {
  const router = useRouter();
  const { refresh } = useParticipant();
  const [fullId, setFullId] = useState('');
  const [serial, setSerial] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const config = parseParticipantConfig(fullId, serial);
    if (!config) {
      Alert.alert(
        'Invalid Format',
        'Participant Full ID must be in the format: 2872-1-1-1\nCheck the Empatica Care Lab app → Settings.',
      );
      return;
    }
    if (!serial.trim()) {
      Alert.alert('Missing Serial', 'Please enter the watch serial number.');
      return;
    }
    setSaving(true);
    await saveParticipantConfig(config);
    await refresh();
    router.replace('/(tabs)/dashboard');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.iconWrap}>
            <Ionicons name="watch-outline" size={56} color="#6366F1" />
          </View>

          <Text style={styles.title}>Participant Setup</Text>
          <Text style={styles.subtitle}>
            Open the Empatica Care Lab app → Settings and enter the two values shown there.
          </Text>

          {/* Reference image description */}
          <View style={styles.guideCard}>
            <View style={styles.guideRow}>
              <Ionicons name="person-outline" size={18} color="#6366F1" />
              <Text style={styles.guideLabel}>Participant full ID</Text>
              <Text style={styles.guideExample}>e.g. 2872-1-1-1</Text>
            </View>
            <View style={styles.guideDivider} />
            <View style={styles.guideRow}>
              <Ionicons name="watch-outline" size={18} color="#6366F1" />
              <Text style={styles.guideLabel}>Serial number</Text>
              <Text style={styles.guideExample}>e.g. 3YK671D258</Text>
            </View>
          </View>

          {/* Full ID input */}
          <Text style={styles.label}>Participant Full ID</Text>
          <TextInput
            style={styles.input}
            value={fullId}
            onChangeText={setFullId}
            placeholder="2872-1-1-1"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Serial number input */}
          <Text style={styles.label}>Watch Serial Number</Text>
          <TextInput
            style={styles.input}
            value={serial}
            onChangeText={setSerial}
            placeholder="3YK671D258"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="characters"
            autoCorrect={false}
          />

          {/* Preview */}
          {fullId && serial ? (() => {
            const cfg = parseParticipantConfig(fullId, serial);
            return cfg ? (
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>Detected configuration</Text>
                {[
                  ['Participant ID', cfg.participantId],
                  ['Subject ID', cfg.subjectId],
                  ['Device ID', cfg.deviceId],
                ].map(([k, v]) => (
                  <View key={k} style={styles.previewRow}>
                    <Text style={styles.previewKey}>{k}</Text>
                    <Text style={styles.previewVal}>{v}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={[styles.previewCard, styles.previewError]}>
                <Ionicons name="warning-outline" size={16} color="#DC2626" />
                <Text style={styles.previewErrorText}>Full ID format not recognised</Text>
              </View>
            );
          })() : null}

          <TouchableOpacity
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                <Text style={styles.buttonText}>Save & Continue</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  content: { padding: 24, paddingBottom: 40 },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
    marginTop: 16,
  },
  title: { fontSize: 26, fontWeight: '700', color: '#1F2937', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21, marginBottom: 24 },

  guideCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 28,
    gap: 10,
  },
  guideRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  guideLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#374151' },
  guideExample: { fontSize: 13, color: '#6B7280', fontFamily: 'monospace' },
  guideDivider: { height: 1, backgroundColor: '#C7D2FE' },

  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
    marginBottom: 18,
    fontFamily: 'monospace',
  },

  previewCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    gap: 6,
  },
  previewError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewTitle: { fontSize: 12, fontWeight: '600', color: '#15803D', marginBottom: 4 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between' },
  previewKey: { fontSize: 13, color: '#6B7280' },
  previewVal: { fontSize: 13, fontWeight: '600', color: '#1F2937', fontFamily: 'monospace' },
  previewErrorText: { fontSize: 13, color: '#DC2626' },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
