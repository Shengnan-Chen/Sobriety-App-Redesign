import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { registerUser } from '@/lib/auth';
import { scale, ms, vs } from '@/lib/scale';

export default function SignUp() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    setError('');
    setLoading(true);
    try {
      await registerUser(email);
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      setError(e?.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
      <StatusBar style="dark" />
      
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <View style={styles.icon}>
              <Ionicons name="shield-checkmark-outline" size={32} color="#4F46E5" />
            </View>
          </View>

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Start monitoring with professional tools</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color="#6B7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              placeholderTextColor="#9CA3AF"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#6B7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity style={styles.button} onPress={handleSignUp} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Creating account...' : 'Create Account'}</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" style={styles.buttonIcon} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(auth)/signin')}>
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.linkTextBold}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  scrollContent: { flexGrow: 1 },
  content: { flexGrow: 1, padding: scale(20), justifyContent: 'center', minHeight: '100%' },
  iconContainer: { alignItems: 'center', marginBottom: vs(20) },
  icon: { width: scale(70), height: scale(70), borderRadius: scale(16), backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: ms(28), fontWeight: '700', color: '#1F2937', textAlign: 'center', marginBottom: vs(8) },
  subtitle: { fontSize: ms(14), color: '#6B7280', textAlign: 'center', marginBottom: vs(40) },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 16, color: '#1F2937', paddingVertical: 12 },
  button: { backgroundColor: '#1F2937', paddingVertical: 16, borderRadius: 12, marginTop: 10, marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', marginRight: 8 },
  buttonIcon: { marginTop: 2 },
  linkText: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  linkTextBold: { color: '#4F46E5', fontWeight: '600' },
  errorText: { fontSize: 13, color: '#EF4444', textAlign: 'center', marginBottom: 12, paddingHorizontal: 8 },
});