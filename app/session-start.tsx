import { useSession, GAME_ROUTES } from '@/lib/SessionContext';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function SessionStart() {
  const router = useRouter();
  const { getCurrentGame } = useSession();

  useEffect(() => {
    // getCurrentGame() reads from refs — correct for both fresh and resumed sessions
    const game = getCurrentGame();
    if (game && GAME_ROUTES[game]) {
      router.replace(GAME_ROUTES[game] as any);
    }
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1F2937' }}>
      <ActivityIndicator size="large" color="#6366F1" />
    </View>
  );
}
