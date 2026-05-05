import { Countdown } from '@/components/Countdown';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Square = {
  id: number;
  color: string;
};

export default function ChoiceReaction() {
  const [countdown, setCountdown] = useState(false);
  const [gameStart, setGameStart] = useState(false);
  const [gameCompleted, setGameCompleted] = useState(false);

  // Game state
  const [squares, setSquares] = useState<Square[]>([
    { id: 0, color: '#000000' },
    { id: 1, color: '#000000' },
    { id: 2, color: '#000000' },
    { id: 3, color: '#000000' },
  ]);
  const [activeSquare, setActiveSquare] = useState<number | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<'waiting' | 'blue' | 'red'>('waiting');
  
  // Scoring
  const [pressReactionTimes, setPressReactionTimes] = useState<number[]>([]);
  const [releaseReactionTimes, setReleaseReactionTimes] = useState<number[]>([]);
  const [errors, setErrors] = useState(0);
  
  const [perceivedDuration, setPerceivedDuration] = useState(0);

  // Timing
  const blueStartTime = useRef<number>(0);
  const redStartTime = useRef<number>(0);
  const gameStartTimeRef = useRef<number>(0);
  const missedBlueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRespondedToBlueRef = useRef(false);
  const gameActiveRef = useRef(false);

  const BLUE_MAX_MS = 2000; // If user doesn't press blue within this time, count as error and go to next round
  const BLUE_COLOR = '#3B82F6';
  const BLUE_PRESSED_COLOR = '#1D4ED8'; // Darker blue when holding

  const router = useRouter();

  const handleBackToDashboard = () => {
    gameActiveRef.current = false;
    
    if (missedBlueTimeoutRef.current) {
      clearTimeout(missedBlueTimeoutRef.current);
      missedBlueTimeoutRef.current = null;
    }
    if (redDelayTimeoutRef.current) {
      clearTimeout(redDelayTimeoutRef.current);
      redDelayTimeoutRef.current = null;
    }
    setSquares([
      { id: 0, color: '#000000' },
      { id: 1, color: '#000000' },
      { id: 2, color: '#000000' },
      { id: 3, color: '#000000' },
    ]);
    setGameCompleted(false);
    setGameStart(false);
    setActiveSquare(null);
    setCurrentPhase('waiting');
    setIsHolding(false);
    setPressReactionTimes([]);
    setReleaseReactionTimes([]);
    setErrors(0);
    router.replace('/(tabs)/dashboard');
  };

  const resetSquares = () => {
    setSquares([
      { id: 0, color: '#000000' },
      { id: 1, color: '#000000' },
      { id: 2, color: '#000000' },
      { id: 3, color: '#000000' },
    ]);
  };

  const startNewRound = () => {
    if (!gameActiveRef.current) return;
    
    if (missedBlueTimeoutRef.current) {
      clearTimeout(missedBlueTimeoutRef.current);
      missedBlueTimeoutRef.current = null;
    }
    if (redDelayTimeoutRef.current) {
      clearTimeout(redDelayTimeoutRef.current);
      redDelayTimeoutRef.current = null;
    }
    resetSquares();
    setActiveSquare(null);
    setIsHolding(false);
    setCurrentPhase('waiting');
    hasRespondedToBlueRef.current = false;
    
    // Random delay before showing blue (500ms - 2000ms)
    const delay = Math.random() * 1500 + 500;
    
    setTimeout(() => {
      if (!gameActiveRef.current) return;
      
      const randomSquare = Math.floor(Math.random() * 4);
      setActiveSquare(randomSquare);
      setCurrentPhase('blue');
      hasRespondedToBlueRef.current = false;
      blueStartTime.current = Date.now();
      
      // Update square color
      setSquares(prev => prev.map(sq => 
        sq.id === randomSquare ? { ...sq, color: BLUE_COLOR } : sq
      ));

      // If user doesn't press blue within BLUE_MAX_MS, count as error and go to next round
      missedBlueTimeoutRef.current = setTimeout(() => {
        if (!gameActiveRef.current) return;
        missedBlueTimeoutRef.current = null;
        setErrors(prev => prev + 1);
        startNewRound();
      }, BLUE_MAX_MS);
    }, delay);
  };

  const handleSquarePressIn = (id: number) => {
    if (!gameActiveRef.current) return;
    
    if (currentPhase === 'blue' && id === activeSquare) {
      if (hasRespondedToBlueRef.current) {
        // Press again after already responding (e.g. pressed then released) – count as error and move on
        if (redDelayTimeoutRef.current) {
          clearTimeout(redDelayTimeoutRef.current);
          redDelayTimeoutRef.current = null;
        }
        setErrors(prev => prev + 1);
        startNewRound();
        return;
      }
      // First press on blue – cancel "missed blue" timeout
      hasRespondedToBlueRef.current = true;
      if (missedBlueTimeoutRef.current) {
        clearTimeout(missedBlueTimeoutRef.current);
        missedBlueTimeoutRef.current = null;
      }
      const reactionTime = Date.now() - blueStartTime.current;
      setPressReactionTimes(prev => [...prev, reactionTime]);
      setIsHolding(true);
      
      // Change to red after 500ms - 1500ms
      const redDelay = Math.random() * 1000 + 500;
      redDelayTimeoutRef.current = setTimeout(() => {
        if (!gameActiveRef.current) return;
        redDelayTimeoutRef.current = null;
        setCurrentPhase('red');
        redStartTime.current = Date.now();
        setSquares(prev => prev.map(sq => 
          sq.id === id ? { ...sq, color: '#EF4444' } : sq
        ));
      }, redDelay);
    } else if (currentPhase !== 'waiting') {
      setErrors(prev => prev + 1);
    }
  };

  const handleSquarePressOut = (id: number) => {
    if (!gameActiveRef.current) return;
    
    if (currentPhase === 'red' && id === activeSquare && isHolding) {
      // Correct release during red phase
      const reactionTime = Date.now() - redStartTime.current;
      setReleaseReactionTimes(prev => [...prev, reactionTime]);
      
      setTimeout(() => {
        if (!gameActiveRef.current) return;
        startNewRound();
      }, 500);
    } else if (isHolding && currentPhase === 'blue') {
      // Released before it turned red – count as error, cancel red transition, go to next round
      if (redDelayTimeoutRef.current) {
        clearTimeout(redDelayTimeoutRef.current);
        redDelayTimeoutRef.current = null;
      }
      setErrors(prev => prev + 1);
      setIsHolding(false);
      setTimeout(() => {
        if (!gameActiveRef.current) return;
        startNewRound();
      }, 500);
    }
  };

  const handleGameOver = () => {
    gameActiveRef.current = false;
    
    // Clear all timeouts
    if (missedBlueTimeoutRef.current) {
      clearTimeout(missedBlueTimeoutRef.current);
      missedBlueTimeoutRef.current = null;
    }
    if (redDelayTimeoutRef.current) {
      clearTimeout(redDelayTimeoutRef.current);
      redDelayTimeoutRef.current = null;
    }
    
    setGameCompleted(true);
    setGameStart(false);
  };

  const handleStop = () => {
    const elapsed = Math.round((Date.now() - gameStartTimeRef.current) / 1000);
    setPerceivedDuration(elapsed);
    handleGameOver();
  };

  const gameStartState = () => {
    gameActiveRef.current = true;
    gameStartTimeRef.current = Date.now();
    setGameStart(true);
    setGameCompleted(false);
    setPressReactionTimes([]);
    setReleaseReactionTimes([]);
    setErrors(0);
    setPerceivedDuration(0);
    startNewRound();
  };

  // Calculate average reaction times
  const avgPressTime = pressReactionTimes.length > 0
    ? Math.round(pressReactionTimes.reduce((a, b) => a + b, 0) / pressReactionTimes.length)
    : 0;
  
  const avgReleaseTime = releaseReactionTimes.length > 0
    ? Math.round(releaseReactionTimes.reduce((a, b) => a + b, 0) / releaseReactionTimes.length)
    : 0;

  const totalReactions = pressReactionTimes.length;
  const isPassing = avgPressTime < 800 && avgReleaseTime < 800 && errors < 5;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />

      {/* INSTRUCTIONS SCREEN */}
      {!gameStart && !gameCompleted && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackToDashboard} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Choice Reaction</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="finger-print-outline" size={64} color="#10B981" />
            </View>

            <Text style={styles.instructionTitle}>Choice Reaction Game</Text>
            
            <Text style={styles.instructionText}>
              When one of the squares turns blue, press and hold it. When it turns red, release immediately.
            </Text>

            {/* Example Section */}
            <View style={styles.exampleBox}>
              <Text style={styles.exampleLabel}>How it works:</Text>

              {/* Start Screen */}
              <Text style={styles.stepTitle}>1. Wait for a square to turn blue</Text>
              <View style={styles.gridContainer}>
                <View style={styles.gridRow}>
                  <View style={[styles.square, { backgroundColor: '#000000' }]} />
                  <View style={[styles.square, { backgroundColor: '#000000' }]} />
                </View>
                <View style={styles.gridRow}>
                  <View style={[styles.square, { backgroundColor: '#000000' }]} />
                  <View style={[styles.square, { backgroundColor: '#000000' }]} />
                </View>
              </View>

              {/* Blue Square */}
              <Text style={styles.stepTitle}>2. Press and HOLD the blue square</Text>
              <View style={styles.gridContainer}>
                <View style={styles.gridRow}>
                  <View style={[styles.square, { backgroundColor: '#000000' }]} />
                  <View style={[styles.square, { backgroundColor: '#3B82F6' }]} />
                </View>
                <View style={styles.gridRow}>
                  <View style={[styles.square, { backgroundColor: '#000000' }]} />
                  <View style={[styles.square, { backgroundColor: '#000000' }]} />
                </View>
              </View>

              {/* Red Square */}
              <Text style={styles.stepTitle}>3. When it turns red, RELEASE immediately</Text>
              <View style={styles.gridContainer}>
                <View style={styles.gridRow}>
                  <View style={[styles.square, { backgroundColor: '#000000' }]} />
                  <View style={[styles.square, { backgroundColor: '#EF4444' }]} />
                </View>
                <View style={styles.gridRow}>
                  <View style={[styles.square, { backgroundColor: '#000000' }]} />
                  <View style={[styles.square, { backgroundColor: '#000000' }]} />
                </View>
              </View>

              <View style={styles.exampleNote}>
                <Ionicons name="information-circle" size={20} color="#10B981" />
                <Text style={styles.exampleNoteText}>
                  <Text style={styles.boldText}>Blue</Text> = Press & Hold • <Text style={styles.boldText}>Red</Text> = Release
                </Text>
              </View>
            </View>

            {/* Rules */}
            <View style={styles.rulesBox}>
              <Text style={styles.rulesTitle}>Test Rules:</Text>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>Tap STOP when you feel 30 seconds have passed — no visible timer</Text>
              </View>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>We measure your reaction time for both press and release</Text>
              </View>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>Pressing wrong squares counts as errors</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.startButton} onPress={() => setCountdown(true)}>
              <Text style={styles.startButtonText}>Begin Test</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </ScrollView>
          {countdown && (
            <Countdown onComplete={() => { setCountdown(false); gameStartState(); }} />
          )}
        </>
      )}

      {/* GAME SCREEN */}
      {gameStart && !gameCompleted && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackToDashboard} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Choice Reaction</Text>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.gameScreen}>
            {/* Time-perception prompt */}
            <Text style={styles.timePrompt}>Tap STOP when you feel 30 seconds have passed</Text>

            {/* Reaction instruction */}
            <Text style={styles.gameInstruction}>
              {currentPhase === 'waiting' && 'Wait for a square to turn blue...'}
              {currentPhase === 'blue' && 'Press and HOLD the blue square!'}
              {currentPhase === 'red' && 'RELEASE when red!'}
            </Text>

            {/* 2x2 Grid */}
            <View style={styles.gameGridContainer}>
              <View style={styles.gameGridRow}>
                {squares.slice(0, 2).map((square) => (
                  <Pressable
                    key={square.id}
                    style={[
                      styles.gameSquare,
                      {
                        backgroundColor:
                          square.id === activeSquare && currentPhase === 'blue' && isHolding
                            ? BLUE_PRESSED_COLOR
                            : square.color,
                      },
                    ]}
                    onPressIn={() => handleSquarePressIn(square.id)}
                    onPressOut={() => handleSquarePressOut(square.id)}
                  />
                ))}
              </View>
              <View style={styles.gameGridRow}>
                {squares.slice(2, 4).map((square) => (
                  <Pressable
                    key={square.id}
                    style={[
                      styles.gameSquare,
                      {
                        backgroundColor:
                          square.id === activeSquare && currentPhase === 'blue' && isHolding
                            ? BLUE_PRESSED_COLOR
                            : square.color,
                      },
                    ]}
                    onPressIn={() => handleSquarePressIn(square.id)}
                    onPressOut={() => handleSquarePressOut(square.id)}
                  />
                ))}
              </View>
            </View>

            {/* STOP button */}
            <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
              <Ionicons name="stop-circle-outline" size={24} color="#FFFFFF" />
              <Text style={styles.stopButtonText}>STOP</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* RESULT SCREEN */}
      {gameCompleted && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackToDashboard} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Choice Reaction - Results</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView contentContainerStyle={styles.resultScreen}>
            <View style={[
              styles.iconContainer,
              { backgroundColor: isPassing ? '#D1FAE5' : '#FEE2E2' }
            ]}>
              <Ionicons 
                name={isPassing ? "checkmark-circle" : "close-circle"} 
                size={64} 
                color={isPassing ? "#10B981" : "#EF4444"} 
              />
            </View>

            <Text style={styles.resultTitle}>
              {isPassing ? 'Excellent Reactions!' : 'Test Complete'}
            </Text>
            <Text style={styles.resultSubtitle}>
              {isPassing 
                ? 'Your reaction times are good!' 
                : 'Practice to improve your reaction speed'}
            </Text>

            {/* Press Reaction Time */}
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Avg Press Reaction</Text>
              <Text style={styles.scoreValue}>{avgPressTime}</Text>
              <Text style={styles.scoreSubtext}>milliseconds</Text>
              
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Total Rounds</Text>
                  <Text style={styles.statItemValue}>{totalReactions}</Text>
                </View>
                <View style={styles.statItemDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Errors</Text>
                  <Text style={styles.statItemValue}>{errors}</Text>
                </View>
              </View>
            </View>

            {/* Release Reaction Time */}
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Avg Release Reaction</Text>
              <Text style={styles.scoreValue}>{avgReleaseTime}</Text>
              <Text style={styles.scoreSubtext}>milliseconds</Text>
            </View>

            {/* Time Perception */}
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Time Perception</Text>
              <Text style={styles.scoreValue}>{perceivedDuration}s</Text>
              <Text style={styles.scoreSubtext}>you stopped at (target: 30s)</Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Difference</Text>
                  <Text style={styles.statItemValue}>
                    {perceivedDuration >= 30 ? '+' : ''}{perceivedDuration - 30}s
                  </Text>
                </View>
                <View style={styles.statItemDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Accuracy</Text>
                  <Text style={styles.statItemValue}>
                    {Math.round(100 - Math.abs(perceivedDuration - 30) / 30 * 100)}%
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.retryButton} onPress={() => setCountdown(true)}>
              <Ionicons name="refresh" size={20} color="#FFFFFF" />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.homeButton} onPress={handleBackToDashboard}>
              <Text style={styles.homeButtonText}>Back to Dashboard</Text>
            </TouchableOpacity>
          </ScrollView>
          {countdown && (
            <Countdown onComplete={() => { setCountdown(false); gameStartState(); }} />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  placeholder: {
    width: 32,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 30,
  },
  instructionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 16,
  },
  instructionText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
    paddingHorizontal: 20,
  },

  // Example Box
  exampleBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 30,
  },
  exampleLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 20,
    textAlign: 'center',
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
    marginTop: 16,
  },

  // Grid
  gridContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 20,
  },
  square: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },

  // Example Note
  exampleNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  exampleNoteText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
    flex: 1,
  },
  boldText: {
    fontWeight: '700',
    color: '#10B981',
  },

  // Rules
  rulesBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 30,
  },
  rulesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  rule: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginTop: 7,
    marginRight: 12,
  },
  ruleText: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },

  // Start Button
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 12,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginRight: 8,
  },

  // GAME SCREEN
  gameScreen: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 40,
  },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginLeft: 8,
  },
  gameInstruction: {
    fontSize: 18,
    fontWeight: '600',
    color: '#10B981',
    textAlign: 'center',
    marginBottom: 40,
  },
  gameGridContainer: {
    alignItems: 'center',
  },
  gameGridRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 30,
    marginBottom: 30,
  },
  gameSquare: {
    width: 120,
    height: 120,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#E5E7EB',
  },

  // RESULT SCREEN
  resultScreen: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  resultSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 30,
  },
  scoreCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
    width: '100%',
  },
  scoreLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: 56,
    fontWeight: '700',
    color: '#10B981',
  },
  scoreSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statItemDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
  },
  statItemLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
  },
  statItemValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 16,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  homeButton: {
    paddingVertical: 12,
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
  },
  timePrompt: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 32,
    gap: 8,
  },
  stopButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});