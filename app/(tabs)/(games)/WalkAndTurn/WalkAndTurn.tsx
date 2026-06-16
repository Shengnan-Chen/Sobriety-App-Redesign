import { Countdown } from "@/components/Countdown";
import { ScoreTrendCard } from "@/components/ScoreTrendCard";
import { EMPATICA_PARTICIPANT } from "@/lib/empaticaConfig";
import { EmpaticaWalkTurnResult, fetchWalkTurnResults } from "@/lib/empaticaS3";
import { saveGameResult } from "@/lib/firestore";
import { ms } from '@/lib/scale';
import { useSession } from "@/lib/SessionContext";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Gyroscope } from "expo-sensors";
import * as Speech from "expo-speech";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SCREEN_W = Dimensions.get('window').width;
// const WAT_INST = require('@/assets/inst_images/WAT_inst.jpg');
const WAT_INST = require('@/assets/ins_images/walk_and_turn.png');

type TestPhase = "walk-forward" | "turn" | "walk-back" | "finished";

export default function WalkAndTurn() {
  const [countdown, setCountdown] = useState(false);
  const [gameStart, setGameStart] = useState(false);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [empaticaResult, setEmpaticaResult] = useState<EmpaticaWalkTurnResult | null>(null);
  const [fetchingWatch, setFetchingWatch] = useState(false);
  const [testPhase, setTestPhase] = useState<TestPhase>("walk-forward");

  // Gyroscope data
  const [forwardGyroSum, setForwardGyroSum] = useState(0);
  const [backGyroSum, setBackGyroSum] = useState(0);
  const [forwardSamples, setForwardSamples] = useState(0);
  const [backSamples, setBackSamples] = useState(0);

  const gyroSubscription = useRef<any>(null);
  const gameStartTimeRef = useRef<Date | null>(null);
  const forwardGyroSumRef = useRef(0);
  const backGyroSumRef = useRef(0);
  const forwardSamplesRef = useRef(0);
  const backSamplesRef = useRef(0);
  const router = useRouter();
  const { sessionMode, completeGame, isLastGame, savePartialSession, resetSession } = useSession();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, []);

  const cleanupAll = () => {
    if (gyroSubscription.current) {
      gyroSubscription.current.remove();
      Gyroscope.removeAllListeners();
      gyroSubscription.current = null;
    }
    Speech.stop();
  };

  const handleBackToDashboard = () => {
    if (sessionMode === 'full_session') { savePartialSession(); resetSession(); }
    cleanupAll();
    setGameStart(false);
    setGameCompleted(false);
    setTestPhase("walk-forward");
    setForwardGyroSum(0);
    setBackGyroSum(0);
    setForwardSamples(0);
    setBackSamples(0);
    router.replace("/(tabs)/dashboard");
  };

  const speakInstruction = (text: string) => {
    Speech.speak(text, {
      language: "en-US",
      pitch: 1.0,
      rate: 0.9,
    });
  };

  const startGyroscope = (isForward: boolean) => {
    Gyroscope.setUpdateInterval(100); // 10Hz sampling

    gyroSubscription.current = Gyroscope.addListener((data) => {
      const movement = Math.abs(data.x) + Math.abs(data.y) + Math.abs(data.z);

      if (isForward) {
        setForwardGyroSum((prev) => { forwardGyroSumRef.current = prev + movement; return prev + movement; });
        setForwardSamples((prev) => { forwardSamplesRef.current = prev + 1; return prev + 1; });
      } else {
        setBackGyroSum((prev) => { backGyroSumRef.current = prev + movement; return prev + movement; });
        setBackSamples((prev) => { backSamplesRef.current = prev + 1; return prev + 1; });
      }
    });
  };

  const stopGyroscope = () => {
    if (gyroSubscription.current) {
      gyroSubscription.current.remove();
      Gyroscope.removeAllListeners();
      gyroSubscription.current = null;
    }
  };

  const gameStartState = () => {
    setGameStart(true);
    setGameCompleted(false);
    setEmpaticaResult(null);
    gameStartTimeRef.current = new Date();
    setTestPhase("walk-forward");
    setForwardGyroSum(0);
    setBackGyroSum(0);
    setForwardSamples(0);
    setBackSamples(0);
    forwardGyroSumRef.current = 0;
    backGyroSumRef.current = 0;
    forwardSamplesRef.current = 0;
    backSamplesRef.current = 0;
    speakInstruction("Walk straight for 5 steps, then tap Done");
    startGyroscope(true);
  };

  // User presses Done to advance through each phase manually.
  const handleNextPhase = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    switch (testPhase) {
      case "walk-forward":
        stopGyroscope();
        setTestPhase("turn");
        speakInstruction("Turn around, then tap Done");
        break;
      case "turn":
        setTestPhase("walk-back");
        speakInstruction("Walk 5 steps back to start, then tap Done");
        startGyroscope(false);
        break;
      case "walk-back":
        stopGyroscope();
        setTestPhase("finished");
        speakInstruction("Task finished");
        setTimeout(() => handleGameOver(), 1500);
        break;
    }
  };

  const handleGameOver = () => {
    cleanupAll();
    setGameStart(false);
    setFetchingWatch(true); // show loading screen first

    const endTime = new Date();
    const startTime = gameStartTimeRef.current ?? new Date(endTime.getTime() - 60000);

    const fwdSum = forwardGyroSumRef.current;
    const bkSum = backGyroSumRef.current;
    const fwdSamples = forwardSamplesRef.current;
    const bkSamples = backSamplesRef.current;
    const totalSamples = fwdSamples + bkSamples;
    const totalMovement = fwdSum + bkSum;
    const avgMovement = totalSamples > 0 ? totalMovement / totalSamples : 0;
    const score = Math.round(Math.max(0, Math.min(100, 100 - avgMovement * 30)));
    const metricsPayload = {
      stabilityScore: score,
      forwardGyroAvg: fwdSamples > 0 ? fwdSum / fwdSamples : 0,
      backGyroAvg: bkSamples > 0 ? bkSum / bkSamples : 0,
      totalSamples,
    };
    if (sessionMode === 'full_session') {
      completeGame('walk_and_turn', metricsPayload, startTime);
      if (isLastGame()) {
        router.replace('/session-results');
      } else {
        router.replace('/session-transition');
      }
    } else {
      saveGameResult(
        'walk_and_turn',
        EMPATICA_PARTICIPANT.fullId,
        startTime,
        endTime,
        metricsPayload
      );
    }
    console.log('[WalkAndTurn] Game over. Fetching watch data...');
    console.log('[WalkAndTurn] Start time:', startTime.toISOString());
    console.log('[WalkAndTurn] End time:', endTime.toISOString());

    fetchWalkTurnResults(startTime, endTime).then(result => {
      console.log('[WalkAndTurn] Watch data result:', JSON.stringify(result));
      setEmpaticaResult(result);
      setFetchingWatch(false);
      setGameCompleted(true);
    });
  };

  const calculateStabilityScore = () => {
    const totalSamples = forwardSamples + backSamples;
    if (totalSamples === 0) return 0;

    const totalMovement = forwardGyroSum + backGyroSum;
    const averageMovement = totalMovement / totalSamples;

    // Calculate score (0-100, lower movement = higher score)
    // Typical walking movement is around 0.5-2.0
    const score = Math.max(0, Math.min(100, 100 - averageMovement * 30));
    return Math.round(score);
  };

  const getPhaseIcon = () => {
    switch (testPhase) {
      case "walk-forward": return "arrow-up-outline";
      case "turn":         return "sync-outline";
      case "walk-back":    return "arrow-down-outline";
      case "finished":     return "checkmark-circle-outline";
    }
  };

  const getPhaseStep = () => {
    switch (testPhase) {
      case "walk-forward": return "Step 1 of 3";
      case "turn":         return "Step 2 of 3";
      case "walk-back":    return "Step 3 of 3";
      case "finished":     return "Done";
    }
  };

  const getPhaseText = () => {
    switch (testPhase) {
      case "walk-forward": return "Walk straight for 5 steps";
      case "turn":         return "Turn around";
      case "walk-back":    return "Walk 5 steps back to start";
      case "finished":     return "Task complete!";
    }
  };

  const stabilityScore = calculateStabilityScore();

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      {countdown && (
        <Countdown onComplete={() => { setCountdown(false); gameStartState(); }} />
      )}

      {/* INSTRUCTIONS SCREEN */}
      {!gameStart && !gameCompleted && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackToDashboard} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Walk and Turn Test</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Logo */}
            <View style={styles.iconContainer}>
              <Ionicons name="walk-outline" size={64} color="#3B82F6" />
            </View>

            <Text style={styles.instructionTitle}>Walk and Turn Test</Text>
            <Text style={styles.instructionText}>
              Evaluates gait stability and physical coordination to assess your basic motor skills.
            </Text>

            {/* How it works */}
            <View style={styles.exampleBox}>
              <Text style={styles.exampleLabel}>How it works:</Text>
              {[
                "Walk 5 steps straight at a steady pace.",
                "Turn around and walk back to the starting point.",
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
            <Image source={WAT_INST} style={styles.watInstImg} resizeMode="contain" />

            {/* Tips */}
            <View style={styles.tipsBox}>
              <Ionicons name="information-circle" size={20} color="#3B82F6" style={{ marginBottom: 8 }} />
              {[
                "Find a place with a clear path to walk.",
                "Always begin with your right foot.",
                "Listen for audio cues for each step.",
                "Stay on a straight line.",
                'Tap "Done" after each completed stage.',
              ].map((tip, i) => (
                <View key={i} style={styles.tipRow}>
                  <View style={styles.tipBullet} />
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.startButton} onPress={() => setCountdown(true)}>
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
            <Text style={styles.headerTitle}>Walk and Turn</Text>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.gameScreen}>
            <View style={styles.phaseContainer}>
              {/* Step badge */}
              <Text style={styles.stepBadge}>{getPhaseStep()}</Text>

              {/* Phase icon */}
              <View style={[
                styles.phaseIconContainer,
                testPhase === "finished" && styles.phaseIconContainerSuccess,
              ]}>
                <Ionicons
                  name={getPhaseIcon() as any}
                  size={80}
                  color={testPhase === "finished" ? "#10B981" : "#3B82F6"}
                />
              </View>

              <Text style={styles.phaseTitle}>{getPhaseText()}</Text>

              {/* 3-dot progress indicator */}
              <View style={styles.phaseIndicator}>
                {(["walk-forward", "turn", "walk-back"] as const).map((p) => {
                  const phaseOrder = ["walk-forward", "turn", "walk-back", "finished"];
                  const active = phaseOrder.indexOf(testPhase) >= phaseOrder.indexOf(p);
                  return (
                    <View key={p} style={[styles.phaseDot, active && styles.phaseDotActive]} />
                  );
                })}
              </View>

              {/* Audio hint */}
              <View style={styles.audioIndicator}>
                <Ionicons name="volume-high" size={20} color="#3B82F6" />
                <Text style={styles.audioText}>Listen for audio cues</Text>
              </View>
            </View>

            {/* Done button — hidden on finished phase (auto-completes) */}
            {testPhase !== "finished" && (
              <TouchableOpacity style={styles.doneButton} onPress={handleNextPhase}>
                <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
                <Text style={styles.doneButtonText}>Done — Next Step</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {/* LOADING / FETCHING WATCH DATA */}
      {fetchingWatch && !gameStart && !gameCompleted && (
        <>
          <View style={styles.header}>
            <View style={styles.placeholder} />
            <Text style={styles.headerTitle}>Fetching Watch Data...</Text>
            <View style={styles.placeholder} />
          </View>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 }}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1F2937' }}>Syncing EmbracePlus Data</Text>
            <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center' }}>
              Retrieving accelerometer and pulse rate from the watch...
            </Text>
          </View>
        </>
      )}

      {/* RESULT SCREEN */}
      {gameCompleted && (
        <>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleBackToDashboard}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Walk and Turn - Results</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView contentContainerStyle={styles.resultScreen}>
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: stabilityScore >= 70 ? "#DBEAFE" : "#FEE2E2",
                },
              ]}
            >
              <Ionicons
                name={
                  stabilityScore >= 70 ? "checkmark-circle" : "close-circle"
                }
                size={64}
                color={stabilityScore >= 70 ? "#3B82F6" : "#EF4444"}
              />
            </View>

            <Text style={styles.resultTitle}>
              {stabilityScore >= 70 ? "Well Done!" : "Test Complete"}
            </Text>
            <Text style={styles.resultSubtitle}>
              {stabilityScore >= 70
                ? "You maintained good balance!"
                : "Practice walking in a straight line"}
            </Text>

            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Stability Score</Text>
              <Text style={styles.scoreValue}>{stabilityScore}</Text>
              <Text style={styles.scoreSubtext}>out of 100</Text>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Samples</Text>
                  <Text style={styles.statItemValue}>
                    {forwardSamples + backSamples}
                  </Text>
                </View>
                <View style={styles.statItemDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Status</Text>
                  <Text
                    style={[
                      styles.statItemValue,
                      { color: stabilityScore >= 70 ? "#3B82F6" : "#EF4444" },
                    ]}
                  >
                    {stabilityScore >= 70 ? "Pass" : "Fail"}
                  </Text>
                </View>
              </View>
            </View>

            {/* EmbracePlus Watch Data */}
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>EmbracePlus Watch Data</Text>
              {fetchingWatch ? (
                <Text style={styles.statItemValue}>Fetching from watch...</Text>
              ) : empaticaResult && empaticaResult.pulseRate.length > 0 ? (
                <>
                  <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 4 }}>
                    <Text style={[styles.statItemLabel, { flex: 1.2 }]}>Time</Text>
                    <Text style={[styles.statItemLabel, { flex: 1, textAlign: 'center' }]}>Pulse</Text>
                    <Text style={[styles.statItemLabel, { flex: 1, textAlign: 'center' }]}>Accel</Text>
                    <Text style={[styles.statItemLabel, { flex: 1, textAlign: 'center' }]}>Steps</Text>
                    <Text style={[styles.statItemLabel, { flex: 1, textAlign: 'right' }]}>Intensity</Text>
                  </View>
                  {empaticaResult.pulseRate.map((pr, i) => {
                    const acc = empaticaResult.accelerometerStd[i];
                    const steps = empaticaResult.stepCounts[i];
                    const intensity = empaticaResult.activityIntensity[i];
                    return (
                      <View key={i} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                        <Text style={[styles.statItemValue, { flex: 1.2, fontSize: 11 }]}>{pr.datetime.slice(11, 16)}Z</Text>
                        <Text style={[styles.statItemValue, { flex: 1, textAlign: 'center', fontSize: 11 }]}>{`${pr.value} bpm`}</Text>
                        <Text style={[styles.statItemValue, { flex: 1, textAlign: 'center', fontSize: 11 }]}>{acc ? acc.value.toFixed(3) : '—'}</Text>
                        <Text style={[styles.statItemValue, { flex: 1, textAlign: 'center', fontSize: 11 }]}>{steps ? steps.value.toFixed(0) : '—'}</Text>
                        <Text style={[styles.statItemValue, { flex: 1, textAlign: 'right', fontSize: 11 }]}>{intensity ? intensity.value.toFixed(2) : '—'}</Text>
                      </View>
                    );
                  })}
                </>
              ) : (
                <Text style={[styles.statItemLabel, { textAlign: 'center' }]}>
                  Watch data unavailable — check sync
                </Text>
              )}
            </View>

            <ScoreTrendCard
              gameType="walk_and_turn"
              participantId="2872-1-1-1"
              currentMetrics={{
                stabilityScore,
                forwardGyroAvg: forwardSamples > 0 ? forwardGyroSum / forwardSamples : 0,
                backGyroAvg: backSamples > 0 ? backGyroSum / backSamples : 0,
                totalSamples: forwardSamples + backSamples,
              }}
            />

            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => setCountdown(true)}
            >
              <Ionicons name="refresh" size={20} color="#FFFFFF" />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.homeButton}
              onPress={handleBackToDashboard}
            >
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
    backgroundColor: "#FAFAFA",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
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
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 30,
  },
  instructionTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 16,
  },
  instructionText: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 30,
    paddingHorizontal: 20,
  },

  // Example Box
  exampleBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 30,
  },
  exampleLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 20,
    textAlign: "center",
  },
  stepContainer: {
    marginBottom: 20,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: "#1F2937",
    lineHeight: 20,
  },
  exampleNote: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DBEAFE",
    padding: 12,
    borderRadius: 8,
  },
  exampleNoteText: {
    fontSize: 14,
    color: "#6B7280",
    marginLeft: 8,
    flex: 1,
  },

  // Rules
  rulesBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 30,
  },
  rulesTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 16,
  },
  rule: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#3B82F6",
    marginTop: 7,
    marginRight: 12,
  },
  ruleText: {
    flex: 1,
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },

  // Start Button
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    borderRadius: 12,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginRight: 8,
  },

  // GAME SCREEN
  gameScreen: {
    flex: 1,
  },
  phaseContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  phaseIconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
  },
  phaseIconContainerSuccess: {
    backgroundColor: "#D1FAE5",
  },
  phaseTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 30,
  },
  phaseIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 30,
    gap: 12,
  },
  phaseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#E5E7EB",
  },
  phaseDotActive: {
    backgroundColor: "#3B82F6",
  },
  audioIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DBEAFE",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  audioText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E40AF",
    marginLeft: 8,
  },
  stepBadge: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3B82F6",
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 24,
    overflow: "hidden",
  },
  doneButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3B82F6",
    paddingVertical: 18,
    borderRadius: 14,
    marginHorizontal: 24,
    marginBottom: 20,
    gap: 10,
  },
  doneButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // RESULT SCREEN
  resultScreen: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
  },
  resultSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 30,
  },
  scoreCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 20,
    width: "100%",
  },
  scoreLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: ms(56),
    fontWeight: "700",
    color: "#3B82F6",
  },
  scoreSubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    width: "100%",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statItemDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#E5E7EB",
  },
  statItemLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 6,
  },
  statItemValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 16,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginLeft: 8,
  },
  homeButton: {
    paddingVertical: 12,
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#3B82F6",
  },

  watInstImg: {
    // width: SCREEN_W,
    // marginHorizontal: -20,
    // height: undefined,
    // aspectRatio: 0.75,
    // borderRadius: 8,
    // marginBottom: 16,
    width: SCREEN_W -40,
    alignSelf: 'center',
    height: undefined,
    aspectRatio: 360/700,
    borderRadius: 0,
    marginBottom: 16,
  },
  tipsBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tipBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3B82F6',
    marginTop: 7,
    marginRight: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 20,
  },
});





