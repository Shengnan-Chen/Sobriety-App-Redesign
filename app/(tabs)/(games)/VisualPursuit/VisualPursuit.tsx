import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const BALL_SIZE = 40;
const CANVAS_WIDTH = width - 40;
const TEST_DURATION = 15;
const PAUSE_AT_END = 2500;
const API_BASE = "https://nonpreventable-uncoagulating-vergie.ngrok-free.dev";

type TestPhase =
  | "intro"
  | "pupil-test"
  | "align-portrait"
  | "test-portrait"
  | "align-landscape"
  | "test-landscape"
  | "analyzing"
  | "complete";

interface VideoMetrics {
  xNystagmus: boolean;
  yNystagmus: boolean;
  avgPupilDiameter: number;
}

interface Metrics {
  portrait: VideoMetrics | null;
  landscape: VideoMetrics | null;
  apiSuccess: boolean;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function VisualPursuit() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<TestPhase>("intro");
  const [ballPosition, setBallPosition] = useState({
    x: CANVAS_WIDTH / 2,
    y: 50,
  });
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const cameraMode = "video";

  const cameraRef = useRef<CameraView>(null);
  const ballYRef = useRef(50);
  const movingDownRef = useRef(true);
  const isPausedRef = useRef(false);
  const canvasHeightRef = useRef(400);
  const animationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunningRef = useRef(false);

  const recordingPromiseRef = useRef<
    Promise<{ uri: string } | undefined> | null
  >(null);
  const isRecordingRef = useRef(false);
  const cameraReadyRef = useRef(false);
  const pendingRecordRef = useRef(false);
  const calibCountRef = useRef(0);
  const calibPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calibStartRef = useRef(0);
  const portraitUriRef = useRef<string | null>(null);
  const landscapeUriRef = useRef<string | null>(null);

  // brightness animation for pupil test
  const brightnessAnim = useRef(new Animated.Value(0)).current;

  const proceedFromAlignRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup(), []);

  const stopCalibPolling = () => {
    calibPollRef.current && clearTimeout(calibPollRef.current);
    calibPollRef.current = null;
  };

  const startAlignThenProceed = (onReady: () => void) => {
    stopCalibPolling();
    pendingRecordRef.current = true;
    calibPollRef.current = setTimeout(onReady, 3000);
  };

  const cleanup = () => {
    animationRef.current && clearInterval(animationRef.current);
    pauseTimeoutRef.current && clearTimeout(pauseTimeoutRef.current);
    phaseTimeoutRef.current && clearTimeout(phaseTimeoutRef.current);
    animationRef.current = null;
    pauseTimeoutRef.current = null;
    phaseTimeoutRef.current = null;
    stopCalibPolling();
    if (isRecordingRef.current) {
      try { cameraRef.current?.stopRecording(); } catch {}
      isRecordingRef.current = false;
      recordingPromiseRef.current = null;
    }
  };

  const stopAnimation = () => {
    animationRef.current && clearInterval(animationRef.current);
    pauseTimeoutRef.current && clearTimeout(pauseTimeoutRef.current);
    animationRef.current = null;
    pauseTimeoutRef.current = null;
  };

  const startBallAnimation = () => {
    animationRef.current = setInterval(() => {
      if (isPausedRef.current) return;
      const bottom = canvasHeightRef.current - BALL_SIZE;
      let newY = ballYRef.current;

      if (movingDownRef.current) {
        newY = Math.min(ballYRef.current + 3, bottom);
        if (newY >= bottom) {
          movingDownRef.current = false;
          isPausedRef.current = true;
          pauseTimeoutRef.current = setTimeout(() => {
            isPausedRef.current = false;
          }, PAUSE_AT_END);
        }
      } else {
        newY = Math.max(ballYRef.current - 3, 0);
        if (newY <= 0) {
          movingDownRef.current = true;
          isPausedRef.current = true;
          pauseTimeoutRef.current = setTimeout(() => {
            isPausedRef.current = false;
          }, PAUSE_AT_END);
        }
      }

      ballYRef.current = newY;
      setBallPosition({ x: CANVAS_WIDTH / 2, y: newY });
    }, 30);
  };

  const startRecording = () => {
    console.log("[VP] startRecording called — cameraRef:", !!cameraRef.current, "cameraReady:", cameraReadyRef.current, "isRecording:", isRecordingRef.current);
    if (!cameraRef.current || !cameraReadyRef.current || isRecordingRef.current) return;
    isRecordingRef.current = true;
    console.log("[VP] startRecording → calling recordAsync");
    recordingPromiseRef.current = cameraRef.current.recordAsync({
      maxDuration: 20,
    });
    recordingPromiseRef.current.then(
      (r) => console.log("[VP] recordAsync resolved:", r?.uri ?? "null"),
      (e) => console.log("[VP] recordAsync rejected:", e)
    );
  };

  const stopRecording = async (): Promise<string | null> => {
    console.log("[VP] stopRecording called — isRecording:", isRecordingRef.current);
    if (!isRecordingRef.current) return null;
    isRecordingRef.current = false;
    try {
      console.log("[VP] calling camera.stopRecording()");
      cameraRef.current?.stopRecording();
      const result = await recordingPromiseRef.current;
      recordingPromiseRef.current = null;
      console.log("[VP] stopRecording uri:", result?.uri ?? "null");
      return result?.uri ?? null;
    } catch (e) {
      console.log("[VP] stopRecording error:", e);
      recordingPromiseRef.current = null;
      return null;
    }
  };

  const analyzeVideo = async (uri: string): Promise<{
    xNystagmus: boolean;
    yNystagmus: boolean;
    avgPupilDiameter: number;
  } | null> => {
    try {
      console.log("[VP] analyzeVideo start, uri:", uri);
      const formData = new FormData();
      formData.append("video", { uri, type: "video/mp4", name: "recording.mp4" } as any);

      const res = await fetch(`${API_BASE}/predict/video?sample_rate=4&overlay=0`, {
        method: "POST", body: formData,
      });
      console.log("[VP] POST status:", res.status);
      if (!res.ok) { console.log("[VP] POST failed:", await res.text()); return null; }

      const job = await res.json();
      console.log("[VP] job response:", JSON.stringify(job));

      return {
        xNystagmus: job.x_nystagmus_present ?? false,
        yNystagmus: job.y_nystagmus_present ?? false,
        avgPupilDiameter: job.avg_pupil_semi_diameter_major_px ?? 0,
      };
    } catch (e) {
      console.log("[VP] analyzeVideo error:", e);
      return null;
    }
  };

  const resetBall = () => {
    ballYRef.current = 50;
    setBallPosition({ x: CANVAS_WIDTH / 2, y: 50 });
    movingDownRef.current = true;
    isPausedRef.current = false;
  };

  const runLandscapeTest = () => {
    setPhase("test-landscape");
    resetBall();
    // camera is switching to video mode; onCameraReady will call startRecording via pendingRecordRef
    if (cameraReadyRef.current) startRecording();
    startBallAnimation();

    phaseTimeoutRef.current = setTimeout(async () => {
      stopAnimation();
      landscapeUriRef.current = await stopRecording();
      setPhase("analyzing");

      const [m1, m2] = await Promise.all([
        portraitUriRef.current ? analyzeVideo(portraitUriRef.current) : null,
        landscapeUriRef.current ? analyzeVideo(landscapeUriRef.current) : null,
      ]);

      setMetrics({
        portrait: m1,
        landscape: m2,
        apiSuccess: m1 !== null || m2 !== null,
      });
      setPhase("complete");
      isRunningRef.current = false;
    }, TEST_DURATION * 1000);
  };

  const runPortraitTest = () => {
    setPhase("test-portrait");
    resetBall();
    // camera is switching to video mode; onCameraReady will call startRecording via pendingRecordRef
    if (cameraReadyRef.current) startRecording();
    startBallAnimation();

    phaseTimeoutRef.current = setTimeout(async () => {
      stopAnimation();
      portraitUriRef.current = await stopRecording();
      setPhase("align-landscape");
      startAlignThenProceed(runLandscapeTest);
    }, TEST_DURATION * 1000);
  };

  const startAfterCalibration = () => {
    setPhase("pupil-test");
    brightnessAnim.setValue(0);

    Animated.timing(brightnessAnim, {
      toValue: 1,
      duration: 8000,
      useNativeDriver: false,
    }).start(() => {
      resetBall();
      setPhase("align-portrait");
      startAlignThenProceed(runPortraitTest);
    });
  };

  const gameStartState = async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    cleanup();
    setMetrics(null);
    brightnessAnim.setValue(0);
    portraitUriRef.current = null;
    landscapeUriRef.current = null;
    cameraReadyRef.current = false;
    pendingRecordRef.current = false;
    calibCountRef.current = 0;

    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        isRunningRef.current = false;
        return;
      }
    }

    startAfterCalibration();
  };

  const handleBackToDashboard = () => {
    cleanup();
    isRunningRef.current = false;
    proceedFromAlignRef.current = null;
    setPhase("intro");
    setMetrics(null);
    brightnessAnim.setValue(0);
    router.replace("/(tabs)/dashboard");
  };


  const cameraActive = [
    "pupil-test",
    "align-portrait",
    "test-portrait",
    "align-landscape",
    "test-landscape",
  ].includes(phase);
  const isCameraFull =
    phase === "align-portrait" ||
    phase === "align-landscape";
  const isLandscapePhase =
    phase === "align-landscape" || phase === "test-landscape";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar style="dark" />

      {/* ── INTRO ──────────────────────────────────────────────────────── */}
      {phase === "intro" && (
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

          {permission && !permission.granted && !permission.canAskAgain && (
            <View style={styles.banner}>
              <Ionicons name="warning-outline" size={16} color="#92400E" />
              <Text style={styles.bannerText}>
                Camera access denied — enable in Settings for AI analysis
              </Text>
            </View>
          )}

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="eye-outline" size={64} color="#6366F1" />
            </View>
            <Text style={styles.instructionTitle}>Visual Pursuit Test</Text>
            <Text style={styles.instructionText}>
              Follow the moving ball with your eyes only. Do not move your
              head! The camera records your eye movements for AI analysis.
            </Text>

            <View style={styles.exampleBox}>
              <Text style={styles.exampleLabel}>How it works:</Text>
              <View style={styles.stepContainer}>
                {[
                  "Hold phone upright (portrait) — position your face",
                  "Follow ball up-to-down (15 seconds)",
                  "Rotate phone sideways (landscape) — position your face",
                  "Follow ball up-to-down again (15 seconds)",
                  "AI analyzes your eye tracking data",
                ].map((text, i) => (
                  <View key={i} style={styles.step}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>{i + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{text}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.exampleNote}>
                <Ionicons
                  name="information-circle"
                  size={20}
                  color="#6366F1"
                />
                <Text style={styles.exampleNoteText}>
                  Ball pauses for 2 seconds at each end
                </Text>
              </View>
            </View>

            <View style={styles.rulesBox}>
              <Text style={styles.rulesTitle}>Test Rules:</Text>
              {[
                "Total duration: ~34 seconds + AI analysis",
                "Keep head completely still",
                "Only move your eyes to follow the ball",
                "Front camera records for analysis",
              ].map((rule, i) => (
                <View key={i} style={styles.rule}>
                  <View style={styles.bulletPoint} />
                  <Text style={styles.ruleText}>{rule}</Text>
                </View>
              ))}
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

{/* ── PUPIL BRIGHTNESS TEST ───────────────────────────────────────── */}
      {phase === "pupil-test" && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.pupilScreen,
            {
              backgroundColor: brightnessAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["#050505", "#FFFFFF"],
              }),
            },
          ]}
        >
          <Animated.Text
            style={[
              styles.pupilText,
              {
                color: brightnessAnim.interpolate({
                  inputRange: [0, 0.4, 1],
                  outputRange: ["#FFFFFF", "#FFFFFF", "#1F2937"],
                }),
              },
            ]}
          >
            Keep your eyes open and look at the screen
          </Animated.Text>
          <View style={styles.cameraIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>Recording</Text>
          </View>
        </Animated.View>
      )}

      {/* ── CAMERA (align + test phases) ───────────────────────────────── */}
      {cameraActive && (
        <>
          {/* Game canvas — visible during test phases */}
          {!isCameraFull && (
            <View style={{ flex: 1 }}>
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
                <View style={styles.statsContainer}>
                  <View style={styles.directionCard}>
                    <Ionicons
                      name="swap-vertical-outline"
                      size={20}
                      color="#6366F1"
                    />
                    <Text style={styles.directionText}>
                      {phase === "test-portrait"
                        ? "Portrait Mode (Up-Down)"
                        : "Landscape Mode (Up-Down)"}
                    </Text>
                  </View>
                </View>

                <View style={styles.instructionCard}>
                  <Ionicons name="eye-outline" size={24} color="#6366F1" />
                  <Text style={styles.gameInstruction}>
                    Follow the ball with your eyes only. Keep your head still!
                  </Text>
                </View>

                <View
                  style={styles.canvas}
                  onLayout={(e) => {
                    canvasHeightRef.current = e.nativeEvent.layout.height;
                  }}
                >
                  <View
                    style={[
                      styles.ball,
                      { left: ballPosition.x, top: ballPosition.y },
                    ]}
                  />
                </View>

                <View style={styles.cameraIndicator}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>Recording</Text>
                </View>
              </View>
            </View>
          )}

          {/* CameraView — full screen during align phases, PiP during test */}
          <CameraView
            ref={cameraRef}
            style={isCameraFull ? StyleSheet.absoluteFill : styles.cameraPip}
            facing="front"
            mode={cameraMode}
            mute={true}
            onCameraReady={() => {
              console.log("[VP] onCameraReady fired, mode:", cameraMode);
              cameraReadyRef.current = true;
              if (pendingRecordRef.current) {
                pendingRecordRef.current = false;
                startRecording();
              }
            }}
          />

          {/* Portrait / landscape align overlay */}
          {(phase === "align-portrait" || phase === "align-landscape") && (
            <View style={[StyleSheet.absoluteFill, styles.alignOverlay]}>
              {/* Header */}
              <View style={styles.header}>
                <TouchableOpacity onPress={handleBackToDashboard} style={styles.backButton}>
                  <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: "#FFFFFF" }]}>Visual Pursuit</Text>
                <View style={styles.placeholder} />
              </View>

              {/* Oval guide — centered in remaining space */}
              <View style={styles.alignOvalWrap}>
                <View style={[
                  styles.faceOval,
                  isLandscapePhase ? styles.faceOvalLandscape : styles.faceOvalPortrait,
                ]} />
              </View>

              {/* Labels at bottom */}
              <View style={styles.alignBottomSection}>
                <Text style={styles.alignTitle}>
                  {isLandscapePhase ? "Hold phone sideways (landscape)" : "Hold phone upright (portrait)"}
                </Text>
                <Text style={styles.alignSubtitle}>Position your face inside the oval</Text>
                <Text style={styles.alignSubtitle}>Starting in 3 seconds...</Text>
              </View>
            </View>
          )}
        </>
      )}

      {/* ── ANALYZING ──────────────────────────────────────────────────── */}
      {phase === "analyzing" && (
        <>
          <View style={styles.header}>
            <View style={styles.backButton} />
            <Text style={styles.headerTitle}>Analyzing...</Text>
            <View style={styles.placeholder} />
          </View>
          <View style={styles.analyzingContainer}>
            <ActivityIndicator size="large" color="#6366F1" />
            <Text style={styles.analyzingTitle}>Analyzing Eye Movements</Text>
            <Text style={styles.analyzingSubtitle}>
              AI is processing your eye tracking data...
            </Text>
          </View>
        </>
      )}

      {/* ── RESULTS ────────────────────────────────────────────────────── */}
      {phase === "complete" && metrics && (
        <>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleBackToDashboard}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Visual Pursuit — Results</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView
            contentContainerStyle={styles.resultScreen}
            showsVerticalScrollIndicator={false}
          >
            {!metrics.apiSuccess && (
              <View style={styles.banner}>
                <Ionicons name="cloud-offline-outline" size={16} color="#92400E" />
                <Text style={styles.bannerText}>API unavailable — results may be inaccurate</Text>
              </View>
            )}

            {[
              { label: "Recording 1 — Portrait", data: metrics.portrait },
              { label: "Recording 2 — Landscape", data: metrics.landscape },
            ].map(({ label, data }) => (
              <View key={label} style={styles.scoreCard}>
                <Text style={styles.scoreLabel}>{label}</Text>
                {data === null ? (
                  <Text style={[styles.metricLabel, { color: "#9CA3AF" }]}>Analysis unavailable</Text>
                ) : (
                  <>
                    <View style={styles.metricRow}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Horizontal Nystagmus (HGN)</Text>
                        <Text style={[styles.metricValue, { color: data.xNystagmus ? "#EF4444" : "#10B981" }]}>
                          {data.xNystagmus ? "Detected" : "Not Detected"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.metricDivider} />
                    <View style={styles.metricRow}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Vertical Nystagmus (VGN)</Text>
                        <Text style={[styles.metricValue, { color: data.yNystagmus ? "#EF4444" : "#10B981" }]}>
                          {data.yNystagmus ? "Detected" : "Not Detected"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.metricDivider} />
                    <View style={styles.metricRow}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Avg Pupil Semi-Diameter</Text>
                        <Text style={[styles.metricValue, { color: "#6366F1" }]}>
                          {data.avgPupilDiameter.toFixed(1)} px
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </View>
            ))}

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

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA" },

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
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  placeholder: { width: 32 },

  scrollContent: { padding: 20, paddingBottom: 40 },

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
  stepContainer: { marginBottom: 20 },
  step: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  stepNumberText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  stepText: { flex: 1, fontSize: 14, color: "#1F2937", lineHeight: 20 },
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
  rule: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#6366F1",
    marginTop: 7,
    marginRight: 12,
  },
  ruleText: { flex: 1, fontSize: 14, color: "#6B7280", lineHeight: 20 },

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

  // Camera PiP during test phases
  cameraPip: {
    position: "absolute",
    top: 80,
    right: 12,
    width: 90,
    height: 120,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#6366F1",
    zIndex: 10,
  },

  alignOverlay: { backgroundColor: "rgba(0,0,0,0.35)" },
  alignOvalWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  faceOval: {
    borderWidth: 3,
    borderColor: "#6366F1",
    borderStyle: "dashed",
    backgroundColor: "transparent",
    borderRadius: 9999,
  },
  faceOvalPortrait: {
    width: width * 0.88,
    height: width * 1.32,
  },
  faceOvalLandscape: {
    width: width * 0.78,
    height: width * 0.42,
  },
  alignBottomSection: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    alignItems: "center",
    gap: 8,
  },
  alignTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
  },
  alignSubtitle: {
    fontSize: 14,
    color: "#D1D5DB",
    textAlign: "center",
  },
  readyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6366F1",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  readyButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Game screen
  gameScreen: { flex: 1, padding: 20 },
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
  recordingText: { fontSize: 14, fontWeight: "600", color: "#991B1B" },

  // Analyzing
  analyzingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  analyzingTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginTop: 8,
  },
  analyzingSubtitle: { fontSize: 14, color: "#6B7280", textAlign: "center" },

  // Banner (permission warning / API offline)
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 8,
    gap: 8,
  },
  bannerText: { flex: 1, fontSize: 13, color: "#92400E" },

  // Results
  resultScreen: {
    flexGrow: 1,
    alignItems: "center",
    padding: 20,
    paddingBottom: 40,
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
    marginBottom: 20,
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
  scoreLabel: { fontSize: 14, color: "#6B7280", marginBottom: 8 },
  scoreValue: { fontSize: 56, fontWeight: "700", color: "#6366F1" },
  scoreSubtext: { fontSize: 14, color: "#9CA3AF", marginBottom: 20 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    width: "100%",
  },
  statItem: { flex: 1, alignItems: "center" },
  statItemDivider: { width: 1, height: 40, backgroundColor: "#E5E7EB" },
  statItemLabel: { fontSize: 12, color: "#6B7280", marginBottom: 6 },
  statItemValue: { fontSize: 20, fontWeight: "700", color: "#1F2937" },
  calibStatusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, marginBottom: 8, paddingHorizontal: 16 },
  calibDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#9CA3AF" },
  calibStatusText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", flexShrink: 1 },
  metricRow: { width: "100%", marginBottom: 12 },
  metricDivider: { height: 1, backgroundColor: "#E5E7EB", marginBottom: 12 },
  metricItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  metricLabel: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  metricValue: { fontSize: 14, fontWeight: "700", color: "#1F2937" },
  metricBar: {
    height: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 4,
    overflow: "hidden",
  },
  metricBarFill: { height: "100%", borderRadius: 4 },

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
  homeButton: { paddingVertical: 12 },
  homeButtonText: { fontSize: 16, fontWeight: "600", color: "#6366F1" },

  // Face calibration status pill
  faceStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.55)",
    gap: 8,
    marginTop: 16,
  },
  faceStatusReady: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    borderWidth: 1,
    borderColor: "#10B981",
  },
  faceStatusNone: {
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  faceStatusWarn: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  faceStatusText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // Face calibration
  faceAlignCheck: {
    position: "absolute",
    bottom: 60,
    alignSelf: "center",
    alignItems: "center",
    gap: 8,
  },
  faceAlignCheckText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#10B981",
  },

  // Distance check screen
  distanceScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 20,
  },
  distanceIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  distanceTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
  },
  distanceSubtitle: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 24,
  },
  distanceTip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF2FF",
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  distanceTipText: {
    flex: 1,
    fontSize: 14,
    color: "#4338CA",
    lineHeight: 20,
  },
  distanceCountdown: {
    fontSize: 14,
    color: "#9CA3AF",
    fontStyle: "italic",
    marginTop: 8,
  },

  // Pupil brightness test
  pupilScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 24,
    paddingHorizontal: 40,
  },
  pupilText: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 28,
  },
});
