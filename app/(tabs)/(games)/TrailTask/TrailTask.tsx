import { Countdown } from '@/components/Countdown';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Circle as SvgCircle, Text as SvgText } from 'react-native-svg';

const { width } = Dimensions.get('window');
const CANVAS_WIDTH = width - 40;
const CANVAS_HEIGHT = 500;

// Build sequence: random start letter (not A), 7-8 letters, no Z wrap.
// Numbers = ordinal position of each letter (F=6, G=7, …) matching user example.
function buildSequence(): { sequence: string[]; startLetter: string } {
  const numLetters = Math.floor(Math.random() * 2) + 7; // 7 or 8
  // 0-indexed: A=0 … Z=25. Never start at A (0). Must not exceed Y (index 24).
  const maxStart = 25 - numLetters; // e.g. 8 letters → max start index = 17 (R)
  const startIdx = Math.floor(Math.random() * maxStart) + 1; // 1…maxStart

  const sequence: string[] = [];
  for (let i = 0; i < numLetters; i++) {
    const letterIdx = startIdx + i;
    sequence.push(String.fromCharCode(65 + letterIdx)); // letter
    if (i < numLetters - 1) {
      sequence.push(String(letterIdx + 1)); // ordinal (F→6, G→7 …)
    }
  }
  return { sequence, startLetter: String.fromCharCode(65 + startIdx) };
}

type CircleItem = {
  id: string;
  label: string;
  x: number;
  y: number;
  sequenceIndex: number;
};

type LineItem = {
  from: CircleItem;
  to: CircleItem;
};

export default function TrailMaking() {
  const [countdown, setCountdown] = useState(false);
  const [gameStart, setGameStart] = useState(false);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [startLetter, setStartLetter] = useState('');
  const sequenceRef = useRef<string[]>([]);

  const [circles, setCircles] = useState<CircleItem[]>([]);
  const [connectedLines, setConnectedLines] = useState<LineItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startTime, setStartTime] = useState<number>(0);
  const [completionTime, setCompletionTime] = useState<number>(0);
  const [isFailed, setIsFailed] = useState(false);

  // Finger tracking
  const [fingerDown, setFingerDown] = useState(false);
  const [fingerPath, setFingerPath] = useState<{ x: number; y: number }[]>([]);
  const [lastTouchedCircle, setLastTouchedCircle] = useState<number | null>(null);

  const router = useRouter();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // No cleanup needed for this game
    };
  }, []);

  const handleBackToDashboard = () => {
    setGameStart(false);
    setGameCompleted(false);
    setCircles([]);
    setConnectedLines([]);
    setCurrentIndex(0);
    setIsFailed(false);
    setFingerDown(false);
    setFingerPath([]);
    setLastTouchedCircle(null);

    router.replace('/(tabs)/dashboard');
  };

  // Generate random positions for circles
  const generateCircles = (sequence: string[]): CircleItem[] => {
    const newCircles: CircleItem[] = [];
    const minDistance = 70;
    const margin = 50;

    sequence.forEach((label, index) => {
      let x, y;
      let attempts = 0;
      
      do {
        x = Math.random() * (CANVAS_WIDTH - 2 * margin) + margin;
        y = Math.random() * (CANVAS_HEIGHT - 2 * margin) + margin;
        attempts++;
        
        const tooClose = newCircles.some(circle => {
          const distance = Math.sqrt(
            Math.pow(circle.x - x, 2) + Math.pow(circle.y - y, 2)
          );
          return distance < minDistance;
        });
        
        if (!tooClose || attempts >= 100) break;
      } while (true);
      
      newCircles.push({
        id: `circle-${index}`,
        label,
        x,
        y,
        sequenceIndex: index,
      });
    });
    
    return newCircles;
  };

  const handleCirclePress = (circle: CircleItem) => {
    if (circle.sequenceIndex === currentIndex) {
      // ✅ CORRECT
      if (currentIndex > 0) {
        const previousCircle = circles.find(c => c.sequenceIndex === currentIndex - 1);
        if (previousCircle) {
          setConnectedLines(prev => [...prev, { from: previousCircle, to: circle }]);
        }
      }
      
      setCurrentIndex(currentIndex + 1);
      
      // Check if completed ALL circles
      if (currentIndex === circles.length - 1) {
        const endTime = Date.now();
        setCompletionTime(Math.round((endTime - startTime) / 1000));
        setGameCompleted(true);
        setGameStart(false);
        setIsFailed(false);
        setFingerDown(false);
      }
    } else if (circle.sequenceIndex > currentIndex) {
      // ❌ WRONG - skipped a circle
      const endTime = Date.now();
      setCompletionTime(Math.round((endTime - startTime) / 1000));
      setGameCompleted(true);
      setGameStart(false);
      setIsFailed(true);
      setFingerDown(false);
    }
    // Ignore if already completed circle
  };

  const gameStartState = () => {
    const { sequence, startLetter: sl } = buildSequence();
    sequenceRef.current = sequence;
    setStartLetter(sl);
    const newCircles = generateCircles(sequence);
    setCircles(newCircles);
    setConnectedLines([]);
    setCurrentIndex(0);
    setStartTime(Date.now());
    setGameStart(true);
    setGameCompleted(false);
    setIsFailed(false);
    setFingerDown(false);
    setFingerPath([]);
    setLastTouchedCircle(null);
  };

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
            <Text style={styles.headerTitle}>Trail Making</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="git-branch-outline" size={64} color="#F59E0B" />
            </View>

            <Text style={styles.instructionTitle}>Trail Making Task</Text>
            
            <Text style={styles.instructionText}>
              Connect the circles in order by drawing a continuous line. Do not lift your finger!
            </Text>

            {/* Example Section */}
            <View style={styles.exampleBox}>
              <Text style={styles.exampleLabel}>How it works:</Text>

              <Text style={styles.stepTitle}>Example Sequence Pattern:</Text>
              <View style={styles.sequenceContainer}>
                <View style={styles.sequenceItem}>
                  <Text style={styles.sequenceText}>F</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color="#F59E0B" />
                <View style={styles.sequenceItem}>
                  <Text style={styles.sequenceText}>6</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color="#F59E0B" />
                <View style={styles.sequenceItem}>
                  <Text style={styles.sequenceText}>G</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color="#F59E0B" />
                <View style={styles.sequenceItem}>
                  <Text style={styles.sequenceText}>7</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color="#F59E0B" />
                <View style={styles.sequenceItem}>
                  <Text style={styles.sequenceText}>H</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color="#F59E0B" />
                <View style={styles.sequenceItem}>
                  <Text style={styles.sequenceText}>8</Text>
                </View>
              </View>

              <View style={styles.exampleNote}>
                <Ionicons name="information-circle" size={20} color="#F59E0B" />
                <Text style={styles.exampleNoteText}>
                  Draw one continuous line through all circles in order
                </Text>
              </View>
            </View>

            {/* Rules */}
            <View style={styles.rulesBox}>
              <Text style={styles.rulesTitle}>Test Rules:</Text>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>Alternate between letters and their ordinal numbers (e.g. F→6→G→7→H→8)</Text>
              </View>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>Only the starting letter is shown — figure out the rest!</Text>
              </View>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>⚠️ Keep finger down - lifting finger = TEST FAILS</Text>
              </View>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>Draw a continuous trail through all circles</Text>
              </View>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>Complete as fast as possible for best results</Text>
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
            <Text style={styles.headerTitle}>Trail Making</Text>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.gameScreen}>
            {/* Stats */}
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Start:</Text>
                <Text style={styles.statText}>{startLetter}</Text>
              </View>
              <View style={styles.instructionCard}>
                <Text style={styles.instructionCardText}>Draw a continuous line without lifting your finger</Text>
              </View>
            </View>

            {/* Canvas */}
            <View 
              style={styles.canvasContainer}
              onTouchStart={(e) => {
                setFingerDown(true);
                const touch = e.nativeEvent.touches[0];
                setFingerPath([{ x: touch.locationX, y: touch.locationY }]);
              }}
              onTouchMove={(e) => {
                if (!fingerDown) return;
                
                const touch = e.nativeEvent.touches[0];
                const newPoint = { x: touch.locationX, y: touch.locationY };
                
                setFingerPath(prev => [...prev, newPoint]);
                
                // Check if finger is over a circle
                circles.forEach(circle => {
                  const distance = Math.sqrt(
                    Math.pow(circle.x - touch.locationX, 2) + 
                    Math.pow(circle.y - touch.locationY, 2)
                  );
                  
                  if (distance <= 30) { // Circle radius
                    // Only process if this is a new circle touch
                    if (lastTouchedCircle !== circle.sequenceIndex) {
                      setLastTouchedCircle(circle.sequenceIndex);
                      handleCirclePress(circle);
                    }
                  }
                });
              }}
              onTouchEnd={() => {
                if (fingerDown && currentIndex < circles.length) {
                  // User lifted finger before completing - FAIL
                  const endTime = Date.now();
                  setCompletionTime(Math.round((endTime - startTime) / 1000));
                  setGameCompleted(true);
                  setGameStart(false);
                  setIsFailed(true);
                }
                setFingerDown(false);
                setFingerPath([]);
              }}
            >
              <Svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={styles.svg}>
                {/* Draw finger trail */}
                {fingerPath.length > 1 && fingerPath.map((point, index) => {
                  if (index === 0) return null;
                  const prevPoint = fingerPath[index - 1];
                  return (
                    <Line
                      key={`trail-${index}`}
                      x1={prevPoint.x}
                      y1={prevPoint.y}
                      x2={point.x}
                      y2={point.y}
                      stroke="#FCD34D"
                      strokeWidth={4}
                      opacity={0.6}
                    />
                  );
                })}

                {/* Draw circles - NO HIGHLIGHTING */}
                {circles.map((circle) => {
                  const isCompleted = circle.sequenceIndex < currentIndex;
                  
                  return (
                    <SvgCircle
                      key={circle.id}
                      cx={circle.x}
                      cy={circle.y}
                      r={30}
                      fill={isCompleted ? '#EAB308' : '#FFFFFF'}
                      stroke="#D1D5DB"
                      strokeWidth={2}
                    />
                  );
                })}

                {/* Draw text */}
                {circles.map((circle) => {
                  const isCompleted = circle.sequenceIndex < currentIndex;
                  
                  return (
                    <SvgText
                      key={`text-${circle.id}`}
                      x={circle.x}
                      y={circle.y + 8}
                      fontSize="20"
                      fontWeight="700"
                      fill={isCompleted ? '#FFFFFF' : '#1F2937'}
                      textAnchor="middle"
                    >
                      {circle.label}
                    </SvgText>
                  );
                })}
              </Svg>
            </View>

            {/* Instruction */}
            <View style={styles.fingerInstruction}>
              <Ionicons name="hand-left-outline" size={24} color="#F59E0B" />
              <Text style={styles.fingerInstructionText}>
                {fingerDown ? 'Keep drawing...' : 'Touch and drag to connect circles'}
              </Text>
            </View>
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
            <Text style={styles.headerTitle}>Trail Making - Results</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView contentContainerStyle={styles.resultScreen}>
            <View style={[
              styles.iconContainer,
              { backgroundColor: !isFailed ? '#FEF3C7' : '#FEE2E2' }
            ]}>
              <Ionicons 
                name={!isFailed ? "checkmark-circle" : "close-circle"} 
                size={64} 
                color={!isFailed ? "#F59E0B" : "#EF4444"} 
              />
            </View>

            <Text style={styles.resultTitle}>
              {!isFailed ? 'Perfect!' : 'Test Failed'}
            </Text>
            <Text style={styles.resultSubtitle}>
              {!isFailed 
                ? 'You completed the trail without errors!' 
                : isFailed && currentIndex < circles.length 
                  ? 'You lifted your finger too early' 
                  : 'You tapped the wrong circle'}
            </Text>

            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Completion Time</Text>
              <Text style={styles.scoreValue}>{completionTime}</Text>
              <Text style={styles.scoreSubtext}>seconds</Text>
              
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Status</Text>
                  <Text style={[
                    styles.statItemValue,
                    { color: !isFailed ? '#F59E0B' : '#EF4444' }
                  ]}>
                    {!isFailed ? 'Pass' : 'Fail'}
                  </Text>
                </View>
                <View style={styles.statItemDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Progress</Text>
                  <Text style={styles.statItemValue}>{currentIndex}/{circles.length}</Text>
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
    backgroundColor: '#FEF3C7',
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
  },
  sequenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  sequenceItem: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sequenceText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  exampleNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
  },
  exampleNoteText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
    flex: 1,
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
    backgroundColor: '#F59E0B',
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
    backgroundColor: '#F59E0B',
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
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginRight: 4,
  },
  statText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F59E0B',
  },
  instructionCard: {
    flex: 1,
    backgroundColor: '#FEF3C7',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#F59E0B',
    marginLeft: 12,
  },
  instructionCardText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    textAlign: 'center',
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  svg: {
    backgroundColor: '#FAFAFA',
  },
  fingerInstruction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  fingerInstructionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 12,
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
    color: '#F59E0B',
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
    backgroundColor: '#F59E0B',
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
    color: '#F59E0B',
  },
});