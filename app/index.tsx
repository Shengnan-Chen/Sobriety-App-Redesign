import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function Index() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.iconContainer}>
        <Image source={require('../assets/images/impairmate-logo.jpg')} style={styles.icon} />
      </View>

      <Text style={styles.title}>ImpairMate</Text>
      
      <Text style={styles.subtitle}>
        Sobriety Field Tests the right way!
      </Text>

      <TouchableOpacity 
        style={styles.button}
        onPress={() => router.push('/(auth)/signin')}
      >
        <Text style={styles.buttonText}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  iconContainer: {
    marginBottom: 30,
  },
  icon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 40,
  },
  description: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
    marginBottom: 50,
  },
  button: {
    backgroundColor: '#1F2937',
    paddingVertical: 16,
    paddingHorizontal: 60,
    borderRadius: 12,
    width: '100%',
    maxWidth: 300,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});