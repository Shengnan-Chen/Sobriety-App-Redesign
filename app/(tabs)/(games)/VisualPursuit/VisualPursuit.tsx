import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width, height } = Dimensions.get("window");
const BALL_SIZE = 40;
const CANVAS_WIDTH = width - 40;
const CANVAS_HEIGHT = 400;
const TEST_DURATION = 15; // 15 seconds per test
const PAUSE_AT_END = 2; // 2 seconds pause at each end

type TestPhase =
  | "camera-portrait"
  | "portrait-test"
  | "camera-landscape"
  | "landscape-test"
  | "complete";

export default function VisualPursuit() {
  const [gameStart, setGameStart] = useState(false);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraOrientation, setCameraOrientation] = useState<
    "portrait" | "landscape"
  >("portrait");
  const [testPhase, setTestPhase] = useState<TestPhase>("camera-portrait");

  // Ball animation state
  const [ballPosition, setBallPosition] = useState({
    x: CANVAS_WIDTH / 2,
    y: 50,
  });
  const [isPaused, setIsPaused] = useState(false);

  // Hardcoded results
  const [nystagmusScore] = useState(85);
  const [pupilResponse] = useState(92);
  const [eyeRedness] = useState(15);
  

  const animationRef = useRef<any>(null);
  const pauseTimeoutRef = useRef<any>(null);
  const phaseTimeoutRef = useRef<any>(null);
  const movingDownRef = useRef(true);
  const canvasHeightRef = useRef(CANVAS_HEIGHT);
  const router = useRouter();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAllTimers();
    };
  }, []);

  const cleanupAllTimers = () => {
    if (animationRef.current) {
      clearInterval(animationRef.current);
      animationRef.current = null;
    }
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }
    if (phaseTimeoutRef.current) {
      clearTimeout(phaseTimeoutRef.current);
      phaseTimeoutRef.current = null;
    }
  };

  const resetGameState = () => {
    cleanupAllTimers();
    setGameStart(false);
    setGameCompleted(false);
    setShowCamera(false);
    setCameraOrientation("portrait");
    setTestPhase("camera-portrait");
    setBallPosition({ x: CANVAS_WIDTH / 2, y: 50 });
    movingDownRef.current = true;
    setIsPaused(false);
    canvasHeightRef.current = CANVAS_HEIGHT;
  };

  const handleBackToDashboard = () => {
    resetGameState();
    router.replace("/(tabs)/dashboard");
  };

  const startBallAnimation = () => {
    animationRef.current = setInterval(() => {
      if (isPaused) return;

      setBallPosition((prev) => {
        const speed = 3;
        const topBoundary = 0; // Touch the top edge
        const bottomBoundary = canvasHeightRef.current - BALL_SIZE; // Touch the bottom edge
        let newY = prev.y;

        // Move based on current direction
        if (movingDownRef.current) {
          newY = prev.y + speed;

          // Check if reached bottom
          if (newY >= bottomBoundary) {
            newY = bottomBoundary;
            movingDownRef.current = false;
            setIsPaused(true);
            pauseTimeoutRef.current = setTimeout(() => {
              setIsPaused(false);
            }, PAUSE_AT_END * 1000);
          }
        } else {
          newY = prev.y - speed;

          // Check if reached top
          if (newY <= topBoundary) {
            newY = topBoundary;
            movingDownRef.current = true;
            setIsPaused(true);
            pauseTimeoutRef.current = setTimeout(() => {
              setIsPaused(false);
            }, PAUSE_AT_END * 1000);
          }
        }

        return { x: prev.x, y: newY };
      });
    }, 30);
  };

  const gameStartState = () => {
    resetGameState();

    setShowCamera(true);
    setCameraOrientation("portrait");
    setTestPhase("camera-portrait");

    // Phase 1: Portrait camera alignment (2 seconds)
    phaseTimeoutRef.current = setTimeout(() => {
      setShowCamera(false);
      setGameStart(true);
      setTestPhase("portrait-test");

      // Start portrait (vertical movement - UP AND DOWN)
      setBallPosition({ x: CANVAS_WIDTH / 2, y: 50 });
      movingDownRef.current = true;
      setIsPaused(false);

      startBallAnimation();

      // Phase 2: After 15 seconds, switch to landscape
      phaseTimeoutRef.current = setTimeout(() => {
        cleanupAllTimers();

        setShowCamera(true);
        setCameraOrientation("landscape");
        setTestPhase("camera-landscape");

        // Phase 3: Landscape camera alignment (2 seconds)
        phaseTimeoutRef.current = setTimeout(() => {
          setShowCamera(false);
          setTestPhase("landscape-test");

          // Start landscape (also vertical movement - UP AND DOWN)
          setBallPosition({ x: CANVAS_WIDTH / 2, y: 50 });
          movingDownRef.current = true;
          setIsPaused(false);

          startBallAnimation();

          // Phase 4: After 15 seconds, complete
          phaseTimeoutRef.current = setTimeout(() => {
            handleGameOver();
          }, TEST_DURATION * 1000);
        }, 2000);
      }, TEST_DURATION * 1000);
    }, 2000);
  };

  const handleGameOver = () => {
    cleanupAllTimers();
    setGameStart(false);
    setGameCompleted(true);
  };

  const overallScore = Math.round(
    (nystagmusScore + pupilResponse + (100 - eyeRedness)) / 3,
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar style="dark" />

      {/* INSTRUCTIONS SCREEN */}
      {!gameStart && !gameCompleted && !showCamera && (
        <>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleBackToDashboard}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Visual Pursuit</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="eye-outline" size={64} color="#6366F1" />
            </View>

            <Text style={styles.instructionTitle}>Visual Pursuit Test</Text>

            <Text style={styles.instructionText}>
              Follow the moving ball with your eyes only. Do not move your head!
              The camera will record your eye movements.
            </Text>

            {/* Example Section */}
            <View style={styles.exampleBox}>
              <Text style={styles.exampleLabel}>How it works:</Text>

              <View style={styles.stepContainer}>
                <View style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>1</Text>
                  </View>
                  <Text style={styles.stepText}>
                    Hold phone upright (portrait) - Position your face
                  </Text>
                </View>

                <View style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>2</Text>
                  </View>
                  <Text style={styles.stepText}>
                    Follow ball up-to-down (15 seconds)
                  </Text>
                </View>

                <View style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>3</Text>
                  </View>
                  <Text style={styles.stepText}>
                    Rotate phone sideways (landscape) - Position your face
                  </Text>
                </View>

                <View style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>4</Text>
                  </View>
                  <Text style={styles.stepText}>
                    Follow ball up-to-down again (15 seconds)
                  </Text>
                </View>
              </View>

              <View style={styles.exampleNote}>
                <Ionicons name="information-circle" size={20} color="#6366F1" />
                <Text style={styles.exampleNoteText}>
                  Ball pauses for 2 seconds at each end
                </Text>
              </View>
            </View>

            {/* Rules */}
            <View style={styles.rulesBox}>
              <Text style={styles.rulesTitle}>Test Rules:</Text>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>Total duration: ~34 seconds</Text>
              </View>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>Keep head completely still</Text>
              </View>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>
                  Only move your eyes to follow the ball
                </Text>
              </View>
              <View style={styles.rule}>
                <View style={styles.bulletPoint} />
                <Text style={styles.ruleText}>Camera records for analysis</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.startButton}
              onPress={gameStartState}
            >
              <Text style={styles.startButtonText}>Begin Test</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </ScrollView>
        </>
      )}

      {/* CAMERA OPENING SCREEN */}
      {showCamera && (
        <View style={styles.cameraScreen}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleBackToDashboard}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: "#FFFFFF" }]}>
              Visual Pursuit
            </Text>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.cameraContainer}>
            {/* Entire content rotates in landscape */}
            <View
              style={[
                styles.cameraContent,
                cameraOrientation === "landscape" &&
                  styles.cameraContentLandscape,
              ]}
            >
              <View style={styles.faceOutline}>
                <Ionicons name="happy-outline" size={120} color="#6366F1" />
              </View>

              <Text style={styles.cameraText}>
                {cameraOrientation === "portrait"
                  ? "Hold phone upright (portrait)"
                  : "Hold phone sideways (landscape)"}
              </Text>
              <Text style={styles.cameraSubtext}>
                Position your face in the frame
              </Text>

              <View style={styles.orientationIndicator}>
                <Ionicons
                  name={
                    cameraOrientation === "portrait"
                      ? "phone-portrait-outline"
                      : "phone-landscape-outline"
                  }
                  size={48}
                  color="#6366F1"
                />
              </View>
            </View>
          </View>
        </View>
      )}

      {/* GAME SCREEN */}
      {gameStart && !gameCompleted && !showCamera && (
        <>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleBackToDashboard}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Visual Pursuit</Text>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.gameScreen}>
            {/* Stats */}
            <View style={styles.statsContainer}>
              <View style={styles.directionCard}>
                <Ionicons
                  name="swap-vertical-outline"
                  size={20}
                  color="#6366F1"
                />
                <Text style={styles.directionText}>
                  {testPhase === "portrait-test"
                    ? "Portrait Mode (Up-Down)"
                    : "Landscape Mode (Up-Down)"}
                </Text>
              </View>
            </View>

            {/* Instructions */}
            <View style={styles.instructionCard}>
              <Ionicons name="eye-outline" size={24} color="#6366F1" />
              <Text style={styles.gameInstruction}>
                Follow the ball with your eyes only. Keep your head still!
              </Text>
            </View>

            {/* Ball Animation Canvas */}
            <View
              style={styles.canvas}
              onLayout={(event) => {
                const { height } = event.nativeEvent.layout;
                canvasHeightRef.current = height;
              }}
            >
              <View
                style={[
                  styles.ball,
                  {
                    left: ballPosition.x,
                    top: ballPosition.y,
                  },
                ]}
              />
            </View>

            {/* Camera indicator */}
            <View style={styles.cameraIndicator}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>Recording</Text>
            </View>
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
            <Text style={styles.headerTitle}>Visual Pursuit - Results</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView contentContainerStyle={styles.resultScreen}>
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: overallScore >= 70 ? "#EEF2FF" : "#FEE2E2" },
              ]}
            >
              <Ionicons
                name={overallScore >= 70 ? "checkmark-circle" : "close-circle"}
                size={64}
                color={overallScore >= 70 ? "#6366F1" : "#EF4444"}
              />
            </View>

            <Text style={styles.resultTitle}>
              {overallScore >= 70 ? "Excellent Eye Tracking!" : "Test Complete"}
            </Text>
            <Text style={styles.resultSubtitle}>
              {overallScore >= 70
                ? "Your eye movements are very good!"
                : "Practice to improve eye coordination"}
            </Text>

            {/* Overall Score */}
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Overall Score</Text>
              <Text style={styles.scoreValue}>{overallScore}</Text>
              <Text style={styles.scoreSubtext}>out of 100</Text>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Duration</Text>
                  <Text style={styles.statItemValue}>34s</Text>
                </View>
                <View style={styles.statItemDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Status</Text>
                  <Text
                    style={[
                      styles.statItemValue,
                      { color: overallScore >= 70 ? "#6366F1" : "#EF4444" },
                    ]}
                  >
                    {overallScore >= 70 ? "Pass" : "Fail"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Detailed Metrics */}
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Detailed Analysis</Text>

              <View style={styles.metricRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Nystagmus Control</Text>
                  <Text style={styles.metricValue}>{nystagmusScore}/100</Text>
                </View>
                <View style={styles.metricBar}>
                  <View
                    style={[
                      styles.metricBarFill,
                      {
                        width: `${nystagmusScore}%`,
                        backgroundColor: "#6366F1",
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.metricRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Pupil Response</Text>
                  <Text style={styles.metricValue}>{pupilResponse}/100</Text>
                </View>
                <View style={styles.metricBar}>
                  <View
                    style={[
                      styles.metricBarFill,
                      {
                        width: `${pupilResponse}%`,
                        backgroundColor: "#10B981",
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.metricRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Eye Redness</Text>
                  <Text style={styles.metricValue}>{eyeRedness}/100</Text>
                </View>
                <View style={styles.metricBar}>
                  <View
                    style={[
                      styles.metricBarFill,
                      { width: `${eyeRedness}%`, backgroundColor: "#EF4444" },
                    ]}
                  />
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.retryButton}
              onPress={gameStartState}
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
    backgroundColor: "#EEF2FF",
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
    backgroundColor: "#6366F1",
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
    backgroundColor: "#EEF2FF",
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
    backgroundColor: "#6366F1",
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
    backgroundColor: "#6366F1",
    paddingVertical: 16,
    borderRadius: 12,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginRight: 8,
  },

  // CAMERA SCREEN
  cameraScreen: {
    flex: 1,
    backgroundColor: "#1F2937",
  },
  cameraContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  cameraContent: {
    alignItems: "center",
  },
  cameraContentLandscape: {
    transform: [{ rotate: "90deg" }],
  },
  faceOutline: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 4,
    borderColor: "#6366F1",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 30,
  },
  cameraText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 12,
    textAlign: "center",
  },
  cameraSubtext: {
    fontSize: 16,
    color: "#9CA3AF",
    textAlign: "center",
  },
  orientationIndicator: {
    marginTop: 30,
    padding: 20,
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    borderRadius: 12,
  },

  // GAME SCREEN
  gameScreen: {
    flex: 1,
    padding: 20,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 20,
  },
  directionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF2FF",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#6366F1",
  },
  directionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4338CA",
    marginLeft: 8,
  },
  instructionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF2FF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  gameInstruction: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4338CA",
    marginLeft: 12,
    flex: 1,
  },
  canvas: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#6366F1",
    position: "relative",
    marginBottom: 20,
  },
  ball: {
    position: "absolute",
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    backgroundColor: "#EAB308",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  cameraIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#EF4444",
    marginRight: 8,
  },
  recordingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#991B1B",
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
    color: "#6366F1",
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
  metricRow: {
    width: "100%",
    marginBottom: 20,
  },
  metricItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F2937",
  },
  metricBar: {
    height: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 4,
    overflow: "hidden",
  },
  metricBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#6366F1",
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
    color: "#6366F1",
  },
});
