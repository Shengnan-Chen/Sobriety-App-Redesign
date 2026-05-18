import { useSession, GAME_NAMES, GAME_ROUTES } from '@/lib/SessionContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SessionTransition() {
  const router = useRouter();
  const { gameQueue, getLastCompletedGame, getNextGame, getCompletedCount } = useSession();
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Read from ref-based helpers — always correct even if state hasn't re-rendered yet
  const completedGame = getLastCompletedGame();
  const completedName = completedGame ? (GAME_NAMES[completedGame] ?? completedGame) : '';
  const completedCount = getCompletedCount();
  const nextGameKey = getNextGame();
  const nextGameName = nextGameKey ? (GAME_NAMES[nextGameKey] ?? nextGameKey) : '';
  const nextGameRoute = nextGameKey ? GAME_ROUTES[nextGameKey] : null;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 3000,
      useNativeDriver: false,
    }).start();

    const timer = setTimeout(() => {
      if (nextGameRoute) {
        router.replace(nextGameRoute as any);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        {/* Completed badge */}
        <View style={styles.checkBadge}>
          <Ionicons name="checkmark-circle" size={64} color="#10B981" />
          <Text style={styles.checkText}>
            Game {completedCount} of {gameQueue.length} complete
          </Text>
        </View>

        <Text style={styles.completedName}>{completedName}</Text>

        <View style={styles.divider} />

        <Text style={styles.upNextLabel}>Up next:</Text>
        <Text style={styles.nextGameName}>{nextGameName}</Text>

        {/* Countdown bar */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
        <Text style={styles.countdownText}>Starting in 3 seconds...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1F2937',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  checkBadge: {
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  checkText: {
    fontSize: 16,
    color: '#10B981',
    fontWeight: '600',
    textAlign: 'center',
  },
  completedName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 32,
  },
  divider: {
    width: 60,
    height: 2,
    backgroundColor: '#374151',
    marginBottom: 32,
  },
  upNextLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  nextGameName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#6366F1',
    textAlign: 'center',
    marginBottom: 48,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#374151',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 3,
  },
  countdownText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});
