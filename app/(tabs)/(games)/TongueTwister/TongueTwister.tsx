import { Countdown } from '@/components/Countdown';
import { GameTimer } from '@/components/GameTimer';
import { TongueTwisterHistoryChart } from '@/components/TongueTwisterHistoryChart';
import { EMPATICA_PARTICIPANT } from '@/lib/empaticaConfig';
import { uploadAudio } from '@/lib/firebaseStorage';
import { saveGameResult } from '@/lib/firestore';
import { ms, scale } from '@/lib/scale';
import { useSession } from '@/lib/SessionContext';
import { Ionicons } from '@expo/vector-icons';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SCREEN_W = Dimensions.get('window').width;
// const TT_INSTR = require('@/assets/inst_images/TT_instr.png');
const TT_INSTR = require('@/assets/ins_images/tongue_twister.png');

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
  const [countdown, setCountdown] = useState(false);
  const [gameStart, setGameStart] = useState(false);
  const [gameCompleted, setGameCompleted] = useState(false);

  // Game state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phrasesCompleted, setPhrasesCompleted] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [shuffledPhrases, setShuffledPhrases] = useState<string[]>(TONGUE_TWISTERS);

  // expo-audio recorder (hook must be at component top level)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingUriRef = useRef<string | null>(null);
  const isHandlingRef = useRef(false);
  const gameStartTimeRef = useRef<Date | null>(null);
  // Tracks API responses in a ref so handleGameOver can read the final list
  // without relying on the setState updater pattern (which is illegal in React).
  const apiResponsesRef = useRef<APIResponse[]>([]);
  // Tracks local file paths for every phrase recording so they can be uploaded at game end
  const phraseUrisRef = useRef<string[]>([]);
  
  // Scores (accumulated across all phrases)
  const [apiResponses, setApiResponses] = useState<APIResponse[]>([]);

  const router = useRouter();
  const { sessionMode, completeGame, updateGameResult, addPendingJob, isLastGame, savePartialSession, resetSession } = useSession();

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      recorder.stop().catch(() => {});
    };
  }, []);

  const resetState = async () => {
    isHandlingRef.current = false;
    await recorder.stop().catch(() => {});
    setGameStart(false);
    setGameCompleted(false);
    setCurrentIndex(0);
    setPhrasesCompleted(0);
    setIsRecording(false);
    setIsAnalyzing(false);
    setApiResponses([]);
    apiResponsesRef.current = [];
    phraseUrisRef.current = [];
  };

  const handleBackToIntro = async () => {
    await resetState();
  };

  const handleBackToDashboard = async () => {
    if (sessionMode === 'full_session') {
      savePartialSession();
      resetSession();
    }
    await resetState();
    router.replace('/(tabs)/dashboard');
  };

  const startRecording = async () => {
    console.log('🎙️ === START RECORDING ===');
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission Required', 'Microphone permission is required for this test.');
        return;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      console.log('✅ Recording started');
    } catch (err) {
      console.error('💥 Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) {
        // Save to a unique path per phrase so recordings aren't overwritten
        const dest = FileSystem.documentDirectory + `tt_phrase_${Date.now()}.m4a`;
        await FileSystem.copyAsync({ from: uri, to: dest });
        recordingUriRef.current = dest;
        phraseUrisRef.current = [...phraseUrisRef.current, dest];
      } else {
        recordingUriRef.current = null;
      }
      setIsRecording(false);
    } catch (err) {
      console.error('💥 Failed to stop recording', err);
    }
  };

  // HIGH_QUALITY preset records .m4a (AAC) on both iOS and Android
  const getAudioMeta = (uri: string) => ({
    uri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  });

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

const audioMeta = getAudioMeta(uri);
      console.log('📍 Audio meta:', audioMeta);

      console.log('📦 Creating FormData...');
      const formData = new FormData();
      formData.append('reference_text', referenceText);
      formData.append('audio_file', audioMeta as any);

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

      setApiResponses(prev => {
        const newResponses = [...prev, result];
        apiResponsesRef.current = newResponses;
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
      
      console.log('⚠️ Analysis failed — no fallback scores recorded');
    }
  };

  // ─── REPLACED: scoring functions ─────────────────────────────────────────

  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

  // Clarity — phoneme error rate. Weighted low in final score due to accent bias.
  // Sober baseline ~0.05, clearly impaired ~0.40
  const calculateClarityScore = (response: APIResponse): number => {
    const perScore = clamp(((0.40 - response.phoneme_error_rate) / (0.40 - 0.05)) * 100);
    const readingPenalty = response.is_correct_reading ? 0 : -8;
    return clamp(perScore + readingPenalty);
  };

  // Articulation — jitter + shimmer only. Both are direct waveform measurements,
  // accent-independent, and reflect involuntary vocal motor control.
  // Jitter: sober <0.020, impaired >0.050
  // Shimmer: sober <0.060, impaired >0.150
  const calculateArticulationScore = (response: APIResponse): number => {
    const jitterScore  = clamp(((0.050 - response.jitter)  / (0.050 - 0.010)) * 100);
    const shimmerScore = clamp(((0.150 - response.shimmer) / (0.150 - 0.060)) * 100);
    return clamp((jitterScore * 0.5) + (shimmerScore * 0.5));
  };

  // Speed — deviation from ideal 3.0 wps penalised in both directions
  // (too slow = sedated, too fast = erratic), plus pause pattern and pitch stability.
  // F0 SD: sober 15–25 Hz, impaired >50 Hz
  const calculateSpeedScore = (response: APIResponse): number => {
    const deviation  = Math.abs(response.speaking_rate_word_per_sec - 3.0);
    const speedScore = clamp(100 - (deviation / 1.2) * 60);
    const pauseScore = clamp(((0.60 - response.pause_avg_by_sec) / (0.60 - 0.10)) * 100);
    const pitchScore = clamp(((50 - response.f0_sd) / (50 - 15)) * 100);
    return clamp((speedScore * 0.5) + (pauseScore * 0.3) + (pitchScore * 0.2));
  };

  // ─────────────────────────────────────────────────────────────────────────

  const gameStartState = async () => {
    const shuffled = [...TONGUE_TWISTERS].sort(() => Math.random() - 0.5);
    setShuffledPhrases(shuffled);
    setGameStart(true);
    setGameCompleted(false);
    setCurrentIndex(0);
    setPhrasesCompleted(0);
    setApiResponses([]);
    apiResponsesRef.current = [];
    phraseUrisRef.current = [];
    gameStartTimeRef.current = new Date();

    // Start recording immediately
    await startRecording();
  };

  const handleNext = async () => {
    if (isHandlingRef.current) return;
    isHandlingRef.current = true;
    console.log('⏭️ === NEXT BUTTON PRESSED ===');

    console.log('🛑 Stopping recording...');
    await stopRecording();
    console.log('✅ Recording stopped. URI:', recordingUriRef.current);
    
    // Analyze the recording
    if (recordingUriRef.current) {
      console.log('🎯 Starting analysis for phrase:', shuffledPhrases[currentIndex]);
      await analyzeRecording(recordingUriRef.current, shuffledPhrases[currentIndex]);
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
    isHandlingRef.current = false;
  };

  const buildMetrics = (responses: APIResponse[]) => {
    const avgVal = (key: keyof APIResponse) => {
      const vals = responses
        .map(r => r[key])
        .filter(v => typeof v === 'number' && !isNaN(v as number)) as number[];
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    return {
      phrasesCompleted: responses.length,
      avgJitter: avgVal('jitter'),
      avgShimmer: avgVal('shimmer'),
      avgPhonemeErrorRate: avgVal('phoneme_error_rate'),
      avgSpeakingRate: avgVal('speaking_rate_word_per_sec'),
      correctReadings: responses.filter(r => r.is_correct_reading).length,
    };
  };

  const handleGameOver = async () => {
    if (isHandlingRef.current) return;
    isHandlingRef.current = true;
    await stopRecording();

    if (sessionMode === 'full_session') {
      // Session mode: don't block. Call completeGame immediately with the responses
      // we already have (all phrases except the last), then analyze the last phrase
      // in the background so the session can keep moving.
      const responsesBeforeLast = apiResponsesRef.current;
      const capturedUri = recordingUriRef.current;
      const capturedPhrase = shuffledPhrases[currentIndex];
      const capturedStartTime = gameStartTimeRef.current ?? new Date();

      completeGame('tongue_twister', buildMetrics(responsesBeforeLast), capturedStartTime);
      if (isLastGame()) {
        router.replace('/session-results');
      } else {
        router.replace('/session-transition');
      }

      // Background: analyze last phrase + upload all recordings
      const capturedPhraseUris = [...phraseUrisRef.current];
      const capturedPhrases = [...shuffledPhrases];
      const job = (async (): Promise<void> => {
        // Analyze last phrase
        let extraResponse: APIResponse | null = null;
        if (capturedUri) {
          try {
            const formData = new FormData();
            formData.append('reference_text', capturedPhrase);
            formData.append('audio_file', getAudioMeta(capturedUri) as any);
            const res = await fetch(API_URL, { method: 'POST', body: formData });
            if (res.ok) extraResponse = await res.json();
          } catch (e) {
            console.log('[TT] Background last-phrase analysis failed:', e);
          }
        }
        const allResponses = extraResponse
          ? [...responsesBeforeLast, extraResponse]
          : responsesBeforeLast;
        // Upload all phrase recordings
        const audioUrls = await Promise.all(
          capturedPhraseUris.map((uri, i) =>
            uploadAudio(uri, EMPATICA_PARTICIPANT.fullId, capturedPhrases[i] ?? `phrase_${i}`, i).catch(() => null)
          )
        );
        updateGameResult('tongue_twister', {
          ...buildMetrics(allResponses),
          audioUrls: audioUrls.filter(Boolean),
        });
      })();
      addPendingJob(job);

      setGameStart(false);
      setGameCompleted(true);
      isHandlingRef.current = false;
      return;
    }

    // Individual mode: show loading screen, await last phrase analysis, then results
    setIsAnalyzing(true);
    if (recordingUriRef.current) {
      await analyzeRecording(recordingUriRef.current, shuffledPhrases[currentIndex]);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsAnalyzing(false);
    setGameStart(false);
    setGameCompleted(true);

    const finalResponses = apiResponsesRef.current;
    console.log('[TT] Game over — responses collected:', finalResponses.length);

    // Upload all phrase recordings and include URLs in saved result
    const audioUrls = await Promise.all(
      phraseUrisRef.current.map((uri, i) =>
        uploadAudio(uri, EMPATICA_PARTICIPANT.fullId, shuffledPhrases[i] ?? `phrase_${i}`, i).catch(() => null)
      )
    );

    saveGameResult(
      'tongue_twister',
      EMPATICA_PARTICIPANT.fullId,
      gameStartTimeRef.current ?? new Date(),
      new Date(),
      { ...buildMetrics(finalResponses), audioUrls: audioUrls.filter(Boolean) },
    );

    isHandlingRef.current = false;
  };

  const avg = (key: keyof APIResponse) => {
    const vals = apiResponses
      .map(r => r[key])
      .filter(v => typeof v === 'number' && !isNaN(v as number)) as number[];
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const correctCount = apiResponses.filter(r => r.is_correct_reading).length;
  const avgJitter = avg('jitter');
  const avgShimmer = avg('shimmer');
  const avgPER = avg('phoneme_error_rate');
  const avgRate = avg('speaking_rate_word_per_sec');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* INSTRUCTIONS SCREEN */}
      {!gameStart && !gameCompleted && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackToDashboard} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Tongue Twister</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Logo */}
            <View style={styles.iconContainer}>
              <Ionicons name="mic-outline" size={64} color="#F59E0B" />
            </View>

            <Text style={styles.instructionTitle}>Tongue Twister Test</Text>
            <Text style={styles.instructionText}>
              Tests your speech clarity and articulation speed to assess your current mental sharpness.
            </Text>

            {/* How it works */}
            <View style={styles.exampleBox}>
              <Text style={styles.exampleLabel}>How it works:</Text>
              {[
                'Read the tongue twister aloud into the microphone.',
                'Read as many phrases as possible within the 30-second time limit.',
              ].map((text, i) => (
                <View key={i} style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{text}</Text>
                </View>
              ))}
            </View>

            {/* Step illustration */}
            <Image source={TT_INSTR} style={styles.ttInstImg} resizeMode="contain" />

            {/* Tip */}
            <View style={styles.ttTipsBox}>
              <Ionicons name="information-circle" size={20} color="#F59E0B" style={{ marginBottom: 6 }} />
              <Text style={styles.ttTipText}>
                Ensure you are in a quiet environment for optimal voice analysis.
              </Text>
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
            <TouchableOpacity onPress={handleBackToIntro} style={styles.backButton}>
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
                <GameTimer time={30} onTimeUp={handleGameOver} paused={isAnalyzing} />
              </View>
              <View style={styles.statCard}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#10B981" />
                <Text style={styles.statText}>{phrasesCompleted}</Text>
              </View>
            </View>

            {/* Tongue Twister Display */}
            <View style={styles.twisterCard}>
              <Ionicons name="chatbox-ellipses-outline" size={48} color="#F59E0B" />
              <Text style={styles.twisterText}>
                {shuffledPhrases[currentIndex]}
              </Text>
            </View>

            {/* Status Banner */}
            {isAnalyzing ? (
              <View style={styles.statusBanner}>
                <Ionicons name="analytics-outline" size={18} color="#3B82F6" />
                <Text style={styles.statusBannerText}>Analyzing your speech...</Text>
              </View>
            ) : (
              <View style={[styles.statusBanner, styles.statusBannerRecording]}>
                <View style={styles.recordingPulse} />
                <Text style={styles.statusBannerRecordingText}>Recording in progress — say the phrase above</Text>
              </View>
            )}

            {/* Next instruction + button */}
            {!isAnalyzing && (
              <Text style={styles.nextHint}>When you're done speaking, press NEXT</Text>
            )}
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
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Speech Analysis</Text>
              <Text style={[styles.metricLabel, { color: '#6B7280', marginBottom: 16 }]}>
                Averaged across {apiResponses.length} phrase{apiResponses.length !== 1 ? 's' : ''}
              </Text>

              {[
                {
                  label: 'Correct Readings',
                  value: `${correctCount} / ${apiResponses.length}`,
                  color: correctCount === apiResponses.length ? '#10B981' : '#F59E0B',
                },
                {
                  label: 'Phoneme Error Rate',
                  value: avgPER !== null ? avgPER.toFixed(3) : 'n/a',
                  color: avgPER !== null && avgPER < 0.2 ? '#10B981' : '#EF4444',
                },
                {
                  label: 'Jitter (vocal steadiness)',
                  value: avgJitter !== null ? avgJitter.toFixed(4) : 'n/a',
                  color: avgJitter !== null && avgJitter < 0.02 ? '#10B981' : avgJitter !== null && avgJitter < 0.05 ? '#F59E0B' : '#EF4444',
                },
                {
                  label: 'Shimmer (amplitude control)',
                  value: avgShimmer !== null ? avgShimmer.toFixed(4) : 'n/a',
                  color: avgShimmer !== null && avgShimmer < 0.06 ? '#10B981' : avgShimmer !== null && avgShimmer < 0.15 ? '#F59E0B' : '#EF4444',
                },
                {
                  label: 'Speaking Rate (words/sec)',
                  value: avgRate !== null ? avgRate.toFixed(2) : 'n/a',
                  color: avgRate !== null && avgRate >= 2.0 && avgRate <= 4.0 ? '#10B981' : '#F59E0B',
                },
              ].map(({ label, value, color }) => (
                <View key={label} style={styles.metricRow}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>{label}</Text>
                    <Text style={[styles.metricValue, { color }]}>{value}</Text>
                  </View>
                </View>
              ))}
            </View>

            <TongueTwisterHistoryChart
              participantId="2872-1-1-1"
              currentMetrics={{
                correctReadings: correctCount,
                avgJitter,
                avgShimmer,
                avgPhonemeErrorRate: avgPER,
                avgSpeakingRate: avgRate,
              }}
            />

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
    width: scale(120),
    height: scale(120),
    borderRadius: scale(60),
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 30,
  },
  instructionTitle: {
    fontSize: ms(24),
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
  gameScreen: {
    flex: 1,
    padding: 20,
    justifyContent: 'flex-start',
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
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DBEAFE',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 10,
    gap: 8,
  },
  statusBannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
  },
  statusBannerRecording: {
    backgroundColor: '#FEE2E2',
  },
  recordingPulse: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
  },
  statusBannerRecordingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#991B1B',
    flexShrink: 1,
  },
  nextHint: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 10,
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
    marginBottom: 16,
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
    width: scale(120),
    height: scale(120),
    borderRadius: scale(60),
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
  resultScreen: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  resultTitle: {
    fontSize: ms(24),
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
    fontSize: ms(56),
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

  ttInstImg: {
    // width: SCREEN_W,
    width: '100%',
    // marginHorizontal: -20,
    height: undefined,
    // aspectRatio: 1.3,
    aspectRatio: 360/340,
    // borderRadius: 8,
    borderRadius: 0,
    marginBottom: 16,
  },
  ttTipsBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  ttTipText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 20,
  },
});



