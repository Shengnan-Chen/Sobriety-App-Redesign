import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, View } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import NetInfo from '@react-native-community/netinfo';
import { onAuthChanged } from '@/lib/auth';
import { SessionProvider, useSession } from '@/lib/SessionContext';
import { ParticipantProvider, useParticipant } from '@/lib/ParticipantContext';
import { processQueue } from '@/lib/uploadQueue';
import { processSessionQueue } from '@/lib/sessionQueue';
import type { User } from 'firebase/auth';

function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();
  const { config, loading: configLoading } = useParticipant();
  const { savePartialSession, sessionMode } = useSession();
  // Ref keeps sessionMode current inside async closures / event listeners
  // without triggering re-renders or stale closure bugs.
  const sessionModeRef = useRef(sessionMode);
  useEffect(() => { sessionModeRef.current = sessionMode; }, [sessionMode]);

  // When a full session ends (mode flips back to 'individual'), immediately
  // process any queued sessions that were skipped during the active session.
  useEffect(() => {
    if (sessionMode === 'individual') {
      setTimeout(async () => {
        await processSessionQueue();
        processQueue();
      }, 1000);
    }
  }, [sessionMode]);

  useEffect(() => {
    const unsub = onAuthChanged((u) => {
      setUser(u);
      if (u) {
        setTimeout(async () => {
          // Skip session queue if a full session is in progress — running it now
          // would create a duplicate Firestore doc that conflicts with the ongoing
          // savePartialSession calls. It will fire when the session ends (above).
          if (sessionModeRef.current !== 'full_session') {
            await processSessionQueue();
          }
          processQueue(); // uploads can always run regardless of session state
        }, 1000);
      }
    });
    return unsub;
  }, []);

  // Also process queues whenever internet is restored.
  // Use isConnected only — isInternetReachable is unreliable on Android
  // (returns null even when internet is working), which would block the queue.
  useEffect(() => {
    let lastConnected = false;
    const unsub = NetInfo.addEventListener(state => {
      const connected = state.isConnected === true;
      if (connected && !lastConnected) {
        // Delay by 3 s so reconnect processing doesn't saturate the JS event loop
        // mid-game (e.g. during VP ball animation or TT recording).
        setTimeout(async () => {
          // Same guard — don't replay session queue mid-session.
          if (sessionModeRef.current !== 'full_session') {
            await processSessionQueue();
          }
          processQueue();
        }, 3000);
      }
      lastConnected = connected;
    });
    return unsub;
  }, []);

  // Intercept the Android hardware back button inside game screens.
  // Always saves the partial session first so no in-progress data is lost,
  // then navigates to dashboard instead of going back through the history stack.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const path = segments.join('/');
      if (path === 'session-results') {
        // Let session-results handle its own cleanup via useEffect return.
        // Just navigate — the unmount cleanup calls resetSession().
        router.replace('/(tabs)/dashboard');
        return true;
      }
      if (path.includes('(games)')) {
        if (sessionMode === 'full_session') savePartialSession();
        router.replace('/(tabs)/dashboard');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [segments, router, sessionMode, savePartialSession]);

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
  // Hide the Android system navigation bar (back/home/recents buttons) app-wide.
  // The gesture navigation area is still functional; it just doesn't render visible buttons.
  useEffect(() => {
    NavigationBar.setVisibilityAsync('hidden');
    NavigationBar.setBehaviorAsync('overlay-swipe'); // swipe from edge to reveal temporarily
  }, []);

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
