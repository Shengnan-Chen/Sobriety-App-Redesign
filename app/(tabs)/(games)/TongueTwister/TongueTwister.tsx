import { GameTimer } from '@/components/GameTimer';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TONGUE_TWISTERS = [
  "She sells seashells by the seashore",
  "Peter Piper picked a peck of pickled peppers",
  "How much wood would a woodchuck chuck if a woodchuck could chuck wood",
  "Fuzzy Wuzzy was a bear, Fuzzy Wuzzy had no hair",
  "I scream, you scream, we all scream for ice cream",
  "Red leather, yellow leather",
  "Unique New York, unique New York",
  "Irish wristwatch, Swiss wristwatch",
  "Toy boat, toy boat, toy boat",
  "Six sleek swans swam swiftly southwards",
];

const API_URL = 'https://tongue-twister-game-api.ngrok.io/analyze';

type APIResponse = {
  word_transcription: string;
  phoneme_transcription: string;
  is_correct_reading: boolean;
  speaking_rate_word_per_sec: number;
  speaking_rate_char_within_words: number;
  pauses_by_sec: number[];
  pause_avg_by_sec: number;
  speaking_rate_phoneme_within_words: number;
  f0_mean: number;
  f0_sd: number;
  jitter: number;
  shimmer: number;
  vowel_articulation_index: number | string;
  phoneme_error_rate: number;
};

export default function TongueTwisters() {
  const [gameStart, setGameStart] = useState(false);
  const [gameCompleted, setGameCompleted] = useState(false);
  
  // Game state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phrasesCompleted, setPhrasesCompleted] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Recording
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingUriRef = useRef<string | null>(null);
  
  // Scores (accumulated across all phrases)
  const [clarityScores, setClarityScores] = useState<number[]>([]);
  const [articulationScores, setArticulationScores] = useState<number[]>([]);
  const [speedScores, setSpeedScores] = useState<number[]>([]);
  const [apiResponses, setApiResponses] = useState<APIResponse[]>([]);

  const router = useRouter();

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync();
      }
    };
  }, []);

  const handleBackToDashboard = async () => {
    if (recordingRef.current) {
      await recordingRef.current.stopAndUnloadAsync();
    }
    setGameStart(false);
    setGameCompleted(false);
    setCurrentIndex(0);
    setPhrasesCompleted(0);
    setIsRecording(false);
    setIsAnalyzing(false);
    setClarityScores([]);
    setArticulationScores([]);
    setSpeedScores([]);
    setApiResponses([]);
    router.replace('/(tabs)/dashboard');
  };

  const startRecording = async () => {
    console.log('🎙️ === START RECORDING ===');
    try {
      const { status } = await Audio.requestPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone permission is required for this test.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setIsRecording(true);
      console.log('✅ Recording started');
    } catch (err) {
      console.error('💥 Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    console.log('🛑 === STOP RECORDING ===');
    
    if (!recordingRef.current) {
      console.warn('⚠️ No active recording');
      return;
    }
    
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      
      console.log('📍 Recording URI:', uri);
      recordingUriRef.current = uri;
      setIsRecording(false);
      
      recordingRef.current = null;
      console.log('✅ Recording stopped');
    } catch (err) {
      console.error('💥 Failed to stop recording', err);
    }
  };

  const analyzeRecording = async (uri: string, referenceText: string) => {
    console.log('🎤 === ANALYZE RECORDING STARTED ===');
    console.log('URI:', uri);
    console.log('Reference text:', referenceText);
    
    try {
      setIsAnalyzing(true);

      // Health check
      console.log('🏥 Performing health check...');
      try {
        const healthCheck = await fetch('https://tongue-twister-game-api.ngrok.io/health');
        console.log('✅ Health check status:', healthCheck.status);
        if (!healthCheck.ok) {
          throw new Error('API server is not responding to health check');
        }
      } catch (healthErr) {
        console.error('❌ Health check failed:', healthErr);
        throw new Error('Cannot reach API server. It may be offline.');
      }

      // Create FormData
      console.log('📦 Creating FormData...');
      const formData = new FormData();
      formData.append('reference_text', referenceText);
      
      formData.append('audio_file', {
        uri: uri,
        type: 'audio/m4a',
        name: 'recording.m4a',
      } as any);
      
      console.log('✅ FormData created');

      // Send to API
      console.log('🚀 Sending to API:', API_URL);
      const apiResponse = await fetch(API_URL, {
        method: 'POST',
        body: formData,
      });

      console.log('📨 API Response received - Status:', apiResponse.status);

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error('❌ API Error response:', errorText);
        throw new Error(`API Error: ${apiResponse.status} - ${errorText}`);
      }

      console.log('📖 Parsing JSON response...');
      const result: APIResponse = await apiResponse.json();
      console.log('✅ API Result received:', JSON.stringify(result, null, 2));
      
      // Calculate scores
      console.log('🧮 Calculating scores...');
      const clarity = calculateClarityScore(result);
      const articulation = calculateArticulationScore(result);
      const speed = calculateSpeedScore(result);

      console.log('✅ Scores calculated:');
      console.log('  - Clarity:', clarity);
      console.log('  - Articulation:', articulation);
      console.log('  - Speed:', speed);

      // Store scores
      console.log('💾 Storing scores...');
      setClarityScores(prev => {
        const newScores = [...prev, clarity];
        console.log('💾 Clarity scores updated:', newScores);
        return newScores;
      });
      setArticulationScores(prev => {
        const newScores = [...prev, articulation];
        console.log('💾 Articulation scores updated:', newScores);
        return newScores;
      });
      setSpeedScores(prev => {
        const newScores = [...prev, speed];
        console.log('💾 Speed scores updated:', newScores);
        return newScores;
      });
      setApiResponses(prev => {
        const newResponses = [...prev, result];
        console.log('💾 API responses updated. Total count:', newResponses.length);
        return newResponses;
      });

      console.log('✅ === ANALYZE RECORDING COMPLETED ===');
      setIsAnalyzing(false);
    } catch (err) {
      console.error('💥 === ANALYSIS FAILED ===');
      console.error('Error type:', err instanceof Error ? err.constructor.name : typeof err);
      console.error('Error message:', err instanceof Error ? err.message : err);
      console.error('Full error:', err);
      
      setIsAnalyzing(false);
      
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert(
        'Analysis Failed', 
        `${errorMessage}\n\nUsing default scores for now.`
      );
      
      // Fallback scores
      console.log('⚠️ Using fallback scores (50, 50, 50)');
      setClarityScores(prev => [...prev, 50]);
      setArticulationScores(prev => [...prev, 50]);
      setSpeedScores(prev => [...prev, 50]);
    }
  };

  const calculateClarityScore = (response: APIResponse): number => {
    // Based on phoneme error rate (lower is better)
    const clarityFromPER = Math.max(0, Math.min(100, (1 - response.phoneme_error_rate) * 100));
    
    // Bonus for correct reading
    const correctBonus = response.is_correct_reading ? 10 : 0;
    
    return Math.min(100, Math.round(clarityFromPER + correctBonus));
  };

  const calculateArticulationScore = (response: APIResponse): number => {
    // Based on vowel articulation index
    let vaiScore = 50; // Default if "n/a"
    
    if (typeof response.vowel_articulation_index === 'number') {
      // VAI typically ranges from 0.8 to 1.2, normalize to 0-100
      vaiScore = Math.max(0, Math.min(100, (response.vowel_articulation_index - 0.8) * 250));
    }
    
    // Factor in jitter and shimmer (lower is better)
    const jitterScore = Math.max(0, Math.min(100, (0.05 - response.jitter) * 1000));
    const shimmerScore = Math.max(0, Math.min(100, (0.10 - response.shimmer) * 500));
    
    return Math.round((vaiScore * 0.5) + (jitterScore * 0.25) + (shimmerScore * 0.25));
  };

  const calculateSpeedScore = (response: APIResponse): number => {
    // Based on speaking rate (words per second)
    const wps = response.speaking_rate_word_per_sec;
    
    let speedScore = 0;
    if (wps >= 2 && wps <= 4) {
      speedScore = 100; // Optimal range
    } else if (wps < 2) {
      speedScore = Math.max(0, (wps / 2) * 100);
    } else {
      speedScore = Math.max(0, 100 - ((wps - 4) * 20));
    }
    
    // Factor in pause consistency
    const pauseScore = Math.max(0, Math.min(100, (0.5 - response.pause_avg_by_sec) * 200));
    
    return Math.round((speedScore * 0.7) + (pauseScore * 0.3));
  };

  const gameStartState = async () => {
    setGameStart(true);
    setGameCompleted(false);
    setCurrentIndex(0);
    setPhrasesCompleted(0);
    setClarityScores([]);
    setArticulationScores([]);
    setSpeedScores([]);
    setApiResponses([]);
    
    // Start recording immediately
    await startRecording();
  };

  const handleNext = async () => {
    console.log('⏭️ === NEXT BUTTON PRESSED ===');
    
    // Stop current recording
    console.log('🛑 Stopping recording...');
    await stopRecording();
    console.log('✅ Recording stopped. URI:', recordingUriRef.current);
    
    // Analyze the recording
    if (recordingUriRef.current) {
      console.log('🎯 Starting analysis for phrase:', TONGUE_TWISTERS[currentIndex]);
      await analyzeRecording(recordingUriRef.current, TONGUE_TWISTERS[currentIndex]);
      console.log('✅ Analysis complete');
    } else {
      console.warn('⚠️ No recording URI found!');
    }
    
    setPhrasesCompleted(prev => prev + 1);
    
    // Move to next phrase
    if (currentIndex < TONGUE_TWISTERS.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setCurrentIndex(0);
    }
    
    // Start recording for next phrase
    console.log('🎙️ Starting new recording...');
    await startRecording();
  };

  const handleGameOver = async () => {
    await stopRecording();
    
    // Show loading state
    setIsAnalyzing(true);
    
    // Analyze the last recording
    if (recordingUriRef.current) {
      await analyzeRecording(recordingUriRef.current, TONGUE_TWISTERS[currentIndex]);
    }
    
    // Wait a bit to ensure all async operations complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setIsAnalyzing(false);
    setGameStart(false);
    setGameCompleted(true);
    
    // Log final scores
    console.log('=== GAME OVER - FINAL SCORES ===');
    console.log('Clarity scores array:', clarityScores);
    console.log('Articulation scores array:', articulationScores);
    console.log('Speed scores array:', speedScores);
    console.log('Number of API responses:', apiResponses.length);
  };

  // Calculate average scores
  const avgClarity = clarityScores.length > 0 
    ? Math.round(clarityScores.reduce((a, b) => a + b, 0) / clarityScores.length)
    : 0;
  
  const avgArticulation = articulationScores.length > 0
    ? Math.round(articulationScores.reduce((a, b) => a + b, 0) / articulationScores.length)
    : 0;
  
  const avgSpeed = speedScores.length > 0
    ? Math.round(speedScores.reduce((a, b) => a + b, 0) / speedScores.length)
    : 0;

  const overallScore = Math.round((avgClarity + avgArticulation + avgSpeed) / 3);

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
            <Text style={styles.headerTitle}>Tongue Twisters</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="mic-outline" size={64} color="#F59E0B" />
            </View>

            <Text style={styles.instructionTitle}>Tongue Twister Test</Text>
            
            <Text style={styles.instructionText}>
              Read the tongue twisters aloud as clearly as you can. We'll analyze your speech for clarity and articulation.
            </Text>

            {/* Example Section */}
            <View style={styles.exampleBox}>
              <Text style={styles.exampleLabel}>How it works:</Text>

              <View style={styles.stepContainer}>
                <View style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>1</Text>
                  </View>
                  <Text style={styles.stepText}>A tongue twister will appear on screen</Text>
                </View>

                <View style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>2</Text>
                  </View>
                  <Text style={styles.stepText}>Read it aloud clearly into the microphone</Text>
                </View>

                <View style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>3</Text>
                  </View>
                  <Text style={styles.stepText}>Press "NEXT" to move to the next phrase</Text>
                </View>

                <View style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>4</Text>
                  </View>
                  <Text style={styles.stepText}>Continue for 30 seconds</Text>
                </View>
              </View>

              <View style={styles.examplePhrase}>
                <Ionicons name="chatbox-outline" size={24} color="#F59E0B" />
                <Text style={styles.examplePhraseText}>
                  "She sells seashells by the seashore"
                </Text>
              </View>

              <View style={styles.exampleNote}>
                <Ionicons name="information-circle" size={20} color="#F59E0B" />
                <Text style={styles.exampleNoteText}>
                  Speak clearly and at a normal pace
                </Text>
              </View>
            </View>

            {/* Rules */}
            <View style={styles.rulesBox}>
              <Text style={styles.rulesTitle}>Test Rules:</Text>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>30 seconds total duration</Text>
              </View>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>Read as many phrases as possible</Text>
              </View>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>Press NEXT after each phrase</Text>
              </View>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>Clarity and speed both count</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.startButton} onPress={gameStartState}>
              <Text style={styles.startButtonText}>Begin Test</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </ScrollView>
        </>
      )}

      {/* GAME SCREEN */}
      {gameStart && !gameCompleted && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackToDashboard} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Tongue Twisters</Text>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.gameScreen}>
            {/* Timer & Count */}
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <Ionicons name="time-outline" size={20} color="#F59E0B" />
                <GameTimer time={30} onTimeUp={handleGameOver} />
              </View>
              <View style={styles.statCard}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#10B981" />
                <Text style={styles.statText}>{phrasesCompleted}</Text>
              </View>
            </View>

            {/* Recording Indicator */}
            {isRecording && (
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>Recording</Text>
              </View>
            )}

            {/* Analyzing Indicator */}
            {isAnalyzing && (
              <View style={styles.analyzingIndicator}>
                <Ionicons name="analytics-outline" size={20} color="#3B82F6" />
                <Text style={styles.analyzingText}>Analyzing...</Text>
              </View>
            )}

            {/* Tongue Twister Display */}
            <View style={styles.twisterCard}>
              <Ionicons name="chatbox-ellipses-outline" size={48} color="#F59E0B" />
              <Text style={styles.twisterText}>
                {TONGUE_TWISTERS[currentIndex]}
              </Text>
            </View>

            {/* Microphone Visual */}
            <View style={styles.microphoneContainer}>
              <View style={[styles.microphoneRing, isRecording && styles.microphoneRingActive]} />
              <View style={[styles.microphoneRing2, isRecording && styles.microphoneRing2Active]} />
              <View style={styles.microphoneIcon}>
                <Ionicons name="mic" size={48} color={isRecording ? "#EF4444" : "#9CA3AF"} />
              </View>
            </View>

            {/* Next Button */}
            <TouchableOpacity 
              style={[styles.nextButton, isAnalyzing && styles.nextButtonDisabled]} 
              onPress={handleNext}
              disabled={isAnalyzing}
            >
              <Text style={styles.nextButtonText}>NEXT</Text>
              <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
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
            <Text style={styles.headerTitle}>Tongue Twisters - Results</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView contentContainerStyle={styles.resultScreen}>
            <View style={[
              styles.iconContainer,
              { backgroundColor: overallScore >= 70 ? '#FEF3C7' : '#FEE2E2' }
            ]}>
              <Ionicons 
                name={overallScore >= 70 ? "checkmark-circle" : "close-circle"} 
                size={64} 
                color={overallScore >= 70 ? "#F59E0B" : "#EF4444"} 
              />
            </View>

            <Text style={styles.resultTitle}>
              {overallScore >= 70 ? 'Excellent Speech!' : 'Test Complete'}
            </Text>
            <Text style={styles.resultSubtitle}>
              {overallScore >= 70 
                ? 'Your speech clarity is very good!' 
                : 'Practice to improve articulation'}
            </Text>

            {/* Overall Score */}
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Overall Score</Text>
              <Text style={styles.scoreValue}>{overallScore}</Text>
              <Text style={styles.scoreSubtext}>out of 100</Text>
              
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Phrases</Text>
                  <Text style={styles.statItemValue}>{phrasesCompleted}</Text>
                </View>
                <View style={styles.statItemDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Status</Text>
                  <Text style={[
                    styles.statItemValue,
                    { color: overallScore >= 70 ? '#F59E0B' : '#EF4444' }
                  ]}>
                    {overallScore >= 70 ? 'Pass' : 'Fail'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Detailed Metrics */}
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Speech Analysis</Text>
              
              <View style={styles.metricRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Clarity</Text>
                  <Text style={styles.metricValue}>{avgClarity}/100</Text>
                </View>
                <View style={styles.metricBar}>
                  <View style={[styles.metricBarFill, { width: `${avgClarity}%`, backgroundColor: '#F59E0B' }]} />
                </View>
              </View>

              <View style={styles.metricRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Articulation</Text>
                  <Text style={styles.metricValue}>{avgArticulation}/100</Text>
                </View>
                <View style={styles.metricBar}>
                  <View style={[styles.metricBarFill, { width: `${avgArticulation}%`, backgroundColor: '#10B981' }]} />
                </View>
              </View>

              <View style={styles.metricRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Speed</Text>
                  <Text style={styles.metricValue}>{avgSpeed}/100</Text>
                </View>
                <View style={styles.metricBar}>
                  <View style={[styles.metricBarFill, { width: `${avgSpeed}%`, backgroundColor: '#3B82F6' }]} />
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.retryButton} onPress={gameStartState}>
              <Ionicons name="refresh" size={20} color="#FFFFFF" />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.homeButton} onPress={handleBackToDashboard}>
              <Text style={styles.homeButtonText}>Back to Dashboard</Text>
            </TouchableOpacity>
          </ScrollView>
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
  stepContainer: {
    marginBottom: 20,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
    lineHeight: 20,
  },
  examplePhrase: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#F59E0B',
    marginBottom: 16,
  },
  examplePhraseText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 12,
    flex: 1,
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
    justifyContent: 'space-between',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
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
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    marginRight: 8,
  },
  recordingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#991B1B',
  },
  analyzingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DBEAFE',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  analyzingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    marginLeft: 8,
  },
  twisterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#F59E0B',
    marginBottom: 30,
  },
  twisterText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 32,
  },
  microphoneContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    position: 'relative',
  },
  microphoneRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F3F4F6',
  },
  microphoneRingActive: {
    backgroundColor: '#FEE2E2',
  },
  microphoneRing2: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#F9FAFB',
  },
  microphoneRing2Active: {
    backgroundColor: '#FEF2F2',
  },
  microphoneIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#E5E7EB',
    zIndex: 10,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
    paddingVertical: 18,
    borderRadius: 12,
    gap: 12,
  },
  nextButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
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
  metricRow: {
    width: '100%',
    marginBottom: 20,
  },
  metricItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  metricBar: {
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  metricBarFill: {
    height: '100%',
    borderRadius: 4,
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