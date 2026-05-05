import { Countdown } from "@/components/Countdown";
import { EmpaticaWalkTurnResult, fetchWalkTurnResults } from "@/lib/empaticaS3";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Gyroscope } from "expo-sensors";
import * as Speech from "expo-speech";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type TestPhase = "pocket" | "walk-forward" | "turn" | "walk-back" | "finished";

export default function WalkAndTurn() {
  const [countdown, setCountdown] = useState(false);
  const [gameStart, setGameStart] = useState(false);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [empaticaResult, setEmpaticaResult] = useState<EmpaticaWalkTurnResult | null>(null);
  const [fetchingWatch, setFetchingWatch] = useState(false);
  const [testPhase, setTestPhase] = useState<TestPhase>("pocket");

  // Gyroscope data
  const [forwardGyroSum, setForwardGyroSum] = useState(0);
  const [backGyroSum, setBackGyroSum] = useState(0);
  const [forwardSamples, setForwardSamples] = useState(0);
  const [backSamples, setBackSamples] = useState(0);

  const gyroSubscription = useRef<any>(null);
  const phaseTimeoutRef = useRef<any>(null);
  const gameStartTimeRef = useRef<Date | null>(null);
  const router = useRouter();

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
    if (phaseTimeoutRef.current) {
      clearTimeout(phaseTimeoutRef.current);
      phaseTimeoutRef.current = null;
    }
    Speech.stop();
  };

  const handleBackToDashboard = () => {
    cleanupAll();
    setGameStart(false);
    setGameCompleted(false);
    setTestPhase("pocket");
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
        setForwardGyroSum((prev) => prev + movement);
        setForwardSamples((prev) => prev + 1);
      } else {
        setBackGyroSum((prev) => prev + movement);
        setBackSamples((prev) => prev + 1);
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
    setTestPhase("pocket");
    setForwardGyroSum(0);
    setBackGyroSum(0);
    setForwardSamples(0);
    setBackSamples(0);

    // Phase 1: Place phone in pocket (5 seconds)
    speakInstruction("Place the phone in your back pocket");

    phaseTimeoutRef.current = setTimeout(() => {
      // Phase 2: Walk forward (6 seconds)
      setTestPhase("walk-forward");
      speakInstruction("Walk straight for 5 steps");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      startGyroscope(true); // Start tracking forward walk

      phaseTimeoutRef.current = setTimeout(() => {
        stopGyroscope();

        // Phase 3: Turn around (2 seconds, no gyro tracking)
        setTestPhase("turn");
        speakInstruction("Turn around");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        phaseTimeoutRef.current = setTimeout(() => {
          // Phase 4: Walk back (6 seconds)
          setTestPhase("walk-back");
          speakInstruction("Walk 5 steps back to the starting position");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

          startGyroscope(false); // Start tracking backward walk

          phaseTimeoutRef.current = setTimeout(() => {
            stopGyroscope();

            // Phase 5: Finished
            setTestPhase("finished");
            speakInstruction("Task finished");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            phaseTimeoutRef.current = setTimeout(() => {
              handleGameOver();
            }, 2000);
          }, 6000); // 6 seconds walk back
        }, 2000); // 2 seconds turn
      }, 6000); // 6 seconds walk forward
    }, 5000); // 5 seconds pocket placement
  };

  const handleGameOver = () => {
    cleanupAll();
    setGameStart(false);
    setFetchingWatch(true); // show loading screen first

    const endTime = new Date();
    const startTime = gameStartTimeRef.current ?? new Date(endTime.getTime() - 60000);
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
      case "pocket":
        return "phone-portrait-outline";
      case "walk-forward":
        return "arrow-up-outline";
      case "turn":
        return "sync-outline";
      case "walk-back":
        return "arrow-down-outline";
      case "finished":
        return "checkmark-circle-outline";
      default:
        return "phone-portrait-outline";
    }
  };

  const getPhaseText = () => {
    switch (testPhase) {
      case "pocket":
        return "Place phone in your back pocket";
      case "walk-forward":
        return "Walk straight for 5 steps";
      case "turn":
        return "Turn around";
      case "walk-back":
        return "Walk 5 steps back";
      case "finished":
        return "Task finished!";
      default:
        return "";
    }
  };

  const stabilityScore = calculateStabilityScore();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar style="dark" />
      {countdown && (
        <Countdown onComplete={() => { setCountdown(false); gameStartState(); }} />
      )}

      {/* INSTRUCTIONS SCREEN */}
      {!gameStart && !gameCompleted && (
        <>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleBackToDashboard}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Walk and Turn</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="walk-outline" size={64} color="#3B82F6" />
            </View>

            <Text style={styles.instructionTitle}>Walk and Turn Test</Text>

            <Text style={styles.instructionText}>
              Follow the audio instructions carefully. This test measures your
              balance and coordination while walking.
            </Text>

            {/* Steps */}
            <View style={styles.exampleBox}>
              <Text style={styles.exampleLabel}>Test Steps:</Text>

              <View style={styles.stepContainer}>
                <View style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>1</Text>
                  </View>
                  <Text style={styles.stepText}>
                    Place phone in your back pocket (5 seconds)
                  </Text>
                </View>

                <View style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>2</Text>
                  </View>
                  <Text style={styles.stepText}>
                    Walk straight for 5 steps (6 seconds)
                  </Text>
                </View>

                <View style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>3</Text>
                  </View>
                  <Text style={styles.stepText}>Turn around (2 seconds)</Text>
                </View>

                <View style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>4</Text>
                  </View>
                  <Text style={styles.stepText}>
                    Walk back 5 steps (6 seconds)
                  </Text>
                </View>
              </View>

              <View style={styles.exampleNote}>
                <Ionicons name="information-circle" size={20} color="#3B82F6" />
                <Text style={styles.exampleNoteText}>
                  Total duration: ~21 seconds
                </Text>
              </View>
            </View>

            {/* Rules */}
            <View style={styles.rulesBox}>
              <Text style={styles.rulesTitle}>Important:</Text>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>
                  Listen carefully to audio instructions
                </Text>
              </View>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>
                  Keep phone in pocket during the test
                </Text>
              </View>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>Walk in a straight line</Text>
              </View>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>
                  Maintain steady balance throughout
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.startButton}
              onPress={() => setCountdown(true)}
            >
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
            <TouchableOpacity
              onPress={handleBackToDashboard}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Walk and Turn</Text>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.gameScreen}>
            <View style={styles.phaseContainer}>
              <View
                style={[
                  styles.phaseIconContainer,
                  testPhase === "finished" && styles.phaseIconContainerSuccess,
                ]}
              >
                <Ionicons
                  name={getPhaseIcon()}
                  size={80}
                  color={testPhase === "finished" ? "#10B981" : "#3B82F6"}
                />
              </View>

              <Text style={styles.phaseTitle}>{getPhaseText()}</Text>

              {/* Phase indicator */}
              <View style={styles.phaseIndicator}>
                <View
                  style={[
                    styles.phaseDot,
                    testPhase !== "pocket" && styles.phaseDotActive,
                  ]}
                />
                <View
                  style={[
                    styles.phaseDot,
                    testPhase === "walk-forward" ||
                    testPhase === "turn" ||
                    testPhase === "walk-back" ||
                    testPhase === "finished"
                      ? styles.phaseDotActive
                      : {},
                  ]}
                />
                <View
                  style={[
                    styles.phaseDot,
                    testPhase === "turn" ||
                    testPhase === "walk-back" ||
                    testPhase === "finished"
                      ? styles.phaseDotActive
                      : {},
                  ]}
                />
                <View
                  style={[
                    styles.phaseDot,
                    testPhase === "walk-back" || testPhase === "finished"
                      ? styles.phaseDotActive
                      : {},
                  ]}
                />
                <View
                  style={[
                    styles.phaseDot,
                    testPhase === "finished" && styles.phaseDotActive,
                  ]}
                />
              </View>

              <View style={styles.audioIndicator}>
                <Ionicons name="volume-high" size={24} color="#3B82F6" />
                <Text style={styles.audioText}>Listen to instructions</Text>
              </View>
            </View>
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
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  phaseContainer: {
    alignItems: "center",
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
    fontSize: 56,
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
});
