import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { onAuthChanged } from '@/lib/auth';
import { SessionProvider } from '@/lib/SessionContext';
import { ParticipantProvider, useParticipant } from '@/lib/ParticipantContext';
import type { User } from 'firebase/auth';

function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();
  const { config, loading: configLoading } = useParticipant();

  useEffect(() => {
    const unsub = onAuthChanged((u) => setUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    if (user === undefined || configLoading) return;

    const inAuthGroup  = segments[0] === '(auth)';
    const inSetupGroup = segments[0] === 'setup';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/signin');
    } else if (user && inAuthGroup) {
      // Logged in — go to setup if no participant config, otherwise dashboard
      if (!config) {
        router.replace('/setup' as any);
      } else {
        router.replace('/(tabs)/dashboard');
      }
    } else if (user && !inAuthGroup && !inSetupGroup && !config) {
      // Config was cleared after login — redirect to setup
      router.replace('/setup' as any);
    }
  }, [user, segments, config, configLoading]);

  if (user === undefined || configLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAFA' }}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ParticipantProvider>
      <SessionProvider>
        <AuthGate>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="index" />
            <Stack.Screen name="setup" />
            <Stack.Screen name="session-transition" />
            <Stack.Screen name="session-results" />
            <Stack.Screen name="session-start" />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          </Stack>
        </AuthGate>
      </SessionProvider>
    </ParticipantProvider>
  );
}
