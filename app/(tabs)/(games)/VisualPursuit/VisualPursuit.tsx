import { saveGameResult } from "@/lib/firestore";
import { EMPATICA_PARTICIPANT } from "@/lib/empaticaConfig";
import { uploadVideo } from "@/lib/firebaseStorage";
import { useSession } from "@/lib/SessionContext";
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
const BALL_SIZE = 36;
const BALL_SPEED = 3;
const API_BASE = "https://nonpreventable-uncoagulating-vergie.ngrok-free.dev";

// Eye-shaped oval — sized to be inclusive for all eye sizes
const EYE_OVAL_W = 150;
const EYE_OVAL_H = 90;

type RoundKey = "vertical_left" | "vertical_right" | "horizontal_left" | "horizontal_right";
type BallStage = "to-end" | "to-start";

const ROUND_ORDER: RoundKey[] = [
  "vertical_left",
  "vertical_right",
  "horizontal_left",
  "horizontal_right",
];

const ROUND_LABELS: Record<RoundKey, string> = {
  vertical_left:    "Round 1 — Vertical, Left Eye",
  vertical_right:   "Round 2 — Vertical, Right Eye",
  horizontal_left:  "Round 3 — Horizontal, Left Eye",
  horizontal_right: "Round 4 — Horizontal, Right Eye",
};

const ROUND_INSTRUCTION: Record<RoundKey, string> = {
  vertical_left:    "Position your LEFT eye inside the oval",
  vertical_right:   "Position your RIGHT eye inside the oval",
  horizontal_left:  "Position your LEFT eye inside the oval",
  horizontal_right: "Position your RIGHT eye inside the oval",
};

const ROUND_DIRECTION: Record<RoundKey, string> = {
  vertical_left:    "Ball: CENTER → UP → CENTER",
  vertical_right:   "Ball: CENTER → UP → CENTER",
  horizontal_left:  "Ball: TOP → BOTTOM → TOP",
  horizontal_right: "Ball: TOP → BOTTOM → TOP",
};

type TestPhase =
  | "intro"
  | "pupil-test"
  | "align-vertical-left"
  | "test-vertical-left"
  | "align-vertical-right"
  | "test-vertical-right"
  | "align-horizontal-left"
  | "test-horizontal-left"
  | "align-horizontal-right"
  | "test-horizontal-right"
  | "analyzing"
  | "complete";

const ALIGN_PHASES = new Set<TestPhase>([
  "align-vertical-left",
  "align-vertical-right",
  "align-horizontal-left",
  "align-horizontal-right",
]);

const TEST_PHASES = new Set<TestPhase>([
  "test-vertical-left",
  "test-vertical-right",
  "test-horizontal-left",
  "test-horizontal-right",
]);

function isVerticalRound(round: RoundKey) {
  return round.startsWith("vertical");
}

function getRoundAlignPhase(round: RoundKey): TestPhase {
  return `align-${round.replace("_", "-")}` as TestPhase;
}

function getRoundTestPhase(round: RoundKey): TestPhase {
  return `test-${round.replace("_", "-")}` as TestPhase;
}

function getRoundFromPhase(p: TestPhase): RoundKey | null {
  for (const round of ROUND_ORDER) {
    if (p === getRoundAlignPhase(round) || p === getRoundTestPhase(round)) return round;
  }
  return null;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function VisualPursuit() {
  const router = useRouter();
  const { sessionMode, completeGame, updateGameResult, addPendingJob, isLastGame } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<TestPhase>("intro");
  const [ballPosition, setBallPosition] = useState({ x: 0, y: 0 });
  const [roundResults, setRoundResults] = useState<{ videoUrl: string | null; apiSuccess: boolean } | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const gameStartTimeRef = useRef<Date | null>(null);
  const canvasHeightRef = useRef(420);
  const canvasWidthRef = useRef(width - 40);
  const animationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef(false);
  const recordingPromiseRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
  const cameraReadyRef = useRef(false);
  const pendingRecordRef = useRef(false);
  const isRunningRef = useRef(false);
  const ballXRef = useRef(0);
  const ballYRef = useRef(0);
  const ballStageRef = useRef<BallStage>("to-end");
  // Single video URI for the entire 4-round test (recorded continuously,
  // no stop/start between rounds — avoids Android camera cycle failures).
  const videoUriRef = useRef<string | null>(null);
  const roundStartTimesRef = useRef<Record<RoundKey, Date | null>>({
    vertical_left: null,
    vertical_right: null,
    horizontal_left: null,
    horizontal_right: null,
  });

  const brightnessAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => () => cleanup(), []);

  const cleanup = () => {
    animationRef.current && clearInterval(animationRef.current);
    animationRef.current = null;
    if (isRecordingRef.current) {
      try { cameraRef.current?.stopRecording(); } catch {}
      isRecordingRef.current = false;
      recordingPromiseRef.current = null;
    }
  };

  const stopAnimation = () => {
    animationRef.current && clearInterval(animationRef.current);
    animationRef.current = null;
  };

  const startRecording = () => {
    if (!cameraRef.current || !cameraReadyRef.current || isRecordingRef.current) return;
    isRecordingRef.current = true;
    recordingPromiseRef.current = cameraRef.current.recordAsync({ maxDuration: 300 });
    recordingPromiseRef.current.then(
      r => console.log("[VP] recordAsync resolved:", r?.uri ?? "null"),
      e => console.log("[VP] recordAsync rejected:", e),
    );
  };

  const stopRecording = async (): Promise<string | null> => {
    if (!isRecordingRef.current) return null;
    isRecordingRef.current = false;
    try {
      cameraRef.current?.stopRecording();
      const result = await recordingPromiseRef.current;
      recordingPromiseRef.current = null;
      return result?.uri ?? null;
    } catch (e) {
      recordingPromiseRef.current = null;
      return null;
    }
  };

  const analyzeVideo = async (uri: string): Promise<any> => {
    try {
      const formData = new FormData();
      formData.append("video", { uri, type: "video/mp4", name: "recording.mp4" } as any);
      const res = await fetch(`${API_BASE}/predict/video?sample_rate=4&overlay=0`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        console.log("[VP] API error:", res.status);
        return null;
      }
      return await res.json();
    } catch (e) {
      console.log("[VP] analyzeVideo error:", e);
      return null;
    }
  };

  const startBallAnimation = (round: RoundKey, onComplete: () => void) => {
    const vertical = isVerticalRound(round);
    const centerX = canvasWidthRef.current / 2 - BALL_SIZE / 2;
    ballStageRef.current = "to-end";

    if (vertical) {
      // Starts at center Y, goes to top, returns to center
      const centerY = canvasHeightRef.current / 2 - BALL_SIZE / 2;
      ballXRef.current = centerX;
      ballYRef.current = centerY;
      setBallPosition({ x: centerX, y: centerY });
    } else {
      // Horizontal rounds: ball starts at top (y=0), goes to bottom, returns to top
      ballXRef.current = centerX;
      ballYRef.current = 0;
      setBallPosition({ x: centerX, y: 0 });
    }

    animationRef.current = setInterval(() => {
      const cx = canvasWidthRef.current / 2 - BALL_SIZE / 2;

      if (vertical) {
        const centerY = canvasHeightRef.current / 2 - BALL_SIZE / 2;

        if (ballStageRef.current === "to-end") {
          // Moving up to top
          ballYRef.current = Math.max(0, ballYRef.current - BALL_SPEED);
          if (ballYRef.current <= 0) ballStageRef.current = "to-start";
        } else {
          // Returning to center
          ballYRef.current = Math.min(centerY, ballYRef.current + BALL_SPEED);
          if (ballYRef.current >= centerY) {
            stopAnimation();
            onComplete();
            return;
          }
        }
        setBallPosition({ x: cx, y: ballYRef.current });
      } else {
        // Horizontal rounds: full vertical range, top → bottom → top
        const maxY = canvasHeightRef.current - BALL_SIZE;

        if (ballStageRef.current === "to-end") {
          // Moving down to bottom
          ballYRef.current = Math.min(maxY, ballYRef.current + BALL_SPEED);
          if (ballYRef.current >= maxY) ballStageRef.current = "to-start";
        } else {
          // Returning to top
          ballYRef.current = Math.max(0, ballYRef.current - BALL_SPEED);
          if (ballYRef.current <= 0) {
            stopAnimation();
            onComplete();
            return;
          }
        }
        setBallPosition({ x: cx, y: ballYRef.current });
      }
    }, 30);
  };

  const onRoundComplete = async (roundIndex: number) => {
    stopAnimation();
    const nextIndex = roundIndex + 1;
    if (nextIndex < ROUND_ORDER.length) {
      // More rounds remain — keep recording, just advance to next alignment screen
      setPhase(getRoundAlignPhase(ROUND_ORDER[nextIndex]));
    } else {
      // All 4 rounds done — stop the single continuous recording now
      const uri = await stopRecording();
      videoUriRef.current = uri;
      console.log('[VP] All rounds complete, video uri:', uri ?? 'null');
      analyzeAll();
    }
  };

  const onOKPressed = () => {
    const round = getRoundFromPhase(phase);
    if (!round) return;
    const roundIndex = ROUND_ORDER.indexOf(round);
    roundStartTimesRef.current[round] = new Date();
    // Recording is already running continuously — just advance phase and start ball.
    setPhase(getRoundTestPhase(round));
    startBallAnimation(round, () => onRoundComplete(roundIndex));
  };

  const analyzeAll = async () => {
    isRunningRef.current = false;
    const uri = videoUriRef.current;
    const capturedGameStart = gameStartTimeRef.current ?? new Date();
    const roundTimes = Object.fromEntries(
      Object.entries(roundStartTimesRef.current).map(([k, v]) => [k, v?.toISOString() ?? null]),
    );

    if (sessionMode === "full_session") {
      completeGame("visual_pursuit", { apiSuccess: null }, capturedGameStart);
      if (isLastGame()) {
        router.replace("/session-results");
      } else {
        router.replace("/session-transition");
      }
      // Upload and analyze in the background
      const capturedUri = uri;
      const job = (async (): Promise<void> => {
        if (!capturedUri) return;
        const [apiResult, videoUrl] = await Promise.all([
          analyzeVideo(capturedUri),
          uploadVideo(capturedUri, EMPATICA_PARTICIPANT.fullId, "visual_pursuit", "full_test").catch(() => null),
        ]);
        updateGameResult("visual_pursuit", {
          videoUrl, rawApiResponse: apiResult,
          apiSuccess: apiResult !== null, roundTimes,
        });
      })();
      addPendingJob(job);
      return;
    }

    // Individual mode: show analyzing screen, await upload + API, save result
    setPhase("analyzing");
    const videoUrl = uri
      ? await uploadVideo(uri, EMPATICA_PARTICIPANT.fullId, "visual_pursuit", "full_test").catch(() => null)
      : null;
    const apiResult = uri ? await analyzeVideo(uri) : null;

    saveGameResult(
      "visual_pursuit",
      EMPATICA_PARTICIPANT.fullId,
      capturedGameStart,
      new Date(),
      { videoUrl, rawApiResponse: apiResult, apiSuccess: apiResult !== null, roundTimes },
      "individual",
    );
    setRoundResults({ videoUrl, apiSuccess: apiResult !== null });
    setPhase("complete");
  };

  const gameStartState = async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    cleanup();
    brightnessAnim.setValue(0);
    videoUriRef.current = null;
    roundStartTimesRef.current = { vertical_left: null, vertical_right: null, horizontal_left: null, horizontal_right: null };
    cameraReadyRef.current = false;
    pendingRecordRef.current = false;
    gameStartTimeRef.current = new Date();
    setRoundResults(null);

    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) { isRunningRef.current = false; return; }
    }

    setPhase("pupil-test");
    Animated.timing(brightnessAnim, {
      toValue: 1,
      duration: 8000,
      useNativeDriver: false,
    }).start(() => {
      // Start the single continuous recording now — it runs through all 4 rounds
      // without stopping, eliminating per-round camera cycle failures on Android.
      if (cameraReadyRef.current) {
        startRecording();
      } else {
        pendingRecordRef.current = true;
      }
      setPhase(getRoundAlignPhase(ROUND_ORDER[0]));
    });
  };

  const handleBack = () => {
    cleanup();
    isRunningRef.current = false;
    brightnessAnim.setValue(0);
    setPhase("intro");
    setRoundResults(null);
    router.replace("/(tabs)/dashboard");
  };

  const cameraActive = !["intro", "analyzing", "complete"].includes(phase);
  const showCameraFull = phase === "pupil-test" || ALIGN_PHASES.has(phase);
  const currentRound = getRoundFromPhase(phase);
  const isHorizontalAlign =
    phase === "align-horizontal-left" || phase === "align-horizontal-right";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar style="dark" />

      {/* ── INTRO ──────────────────────────────────────────────────────────── */}
      {phase === "intro" && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
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
              Follow the moving ball with your eyes only. Do not move your head!
              The camera records your eye movements for AI analysis.
            </Text>

            <View style={styles.exampleBox}>
              <Text style={styles.exampleLabel}>4 Rounds:</Text>
              <View style={styles.stepContainer}>
                {[
                  "Align LEFT eye (center) — ball moves center → up → center",
                  "Align RIGHT eye (center) — ball moves center → up → center",
                  "Align LEFT eye (top, near camera) — ball moves top → bottom → top",
                  "Align RIGHT eye (top, near camera) — ball moves top → bottom → top",
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
                <Ionicons name="information-circle" size={20} color="#6366F1" />
                <Text style={styles.exampleNoteText}>
                  Each round ends automatically when the ball returns to start
                </Text>
              </View>
            </View>

            <View style={styles.rulesBox}>
              <Text style={styles.rulesTitle}>Rules:</Text>
              {[
                "Keep your head completely still",
                "Only move your eyes to follow the ball",
                "Tap OK when your eye is aligned to start each round",
                "Front camera records for AI analysis",
              ].map((rule, i) => (
                <View key={i} style={styles.rule}>
                  <View style={styles.bulletPoint} />
                  <Text style={styles.ruleText}>{rule}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.startButton} onPress={gameStartState}>
              <Text style={styles.startButtonText}>Begin Test</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </ScrollView>
        </>
      )}

      {/* ── CAMERA AREA (pupil-test, align-*, test-*) ──────────────────────── */}
      {cameraActive && (
        <>
          {/* Game canvas — shown during test phases */}
          {TEST_PHASES.has(phase) && (
            <View style={{ flex: 1 }}>
              <View style={styles.header}>
                <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                  <Ionicons name="chevron-back" size={24} color="#1F2937" />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {currentRound ? ROUND_LABELS[currentRound] : "Visual Pursuit"}
                </Text>
                <View style={styles.placeholder} />
              </View>

              <View style={styles.gameScreen}>
                <View style={styles.instructionCard}>
                  <Ionicons name="eye-outline" size={20} color="#6366F1" />
                  <Text style={styles.gameInstruction}>
                    Follow the ball — eyes only, head still!
                  </Text>
                </View>
                <View
                  style={styles.canvas}
                  onLayout={e => {
                    canvasHeightRef.current = e.nativeEvent.layout.height;
                    canvasWidthRef.current = e.nativeEvent.layout.width;
                  }}
                >
                  <View
                    style={[styles.ball, { left: ballPosition.x, top: ballPosition.y }]}
                  />
                </View>
                <View style={styles.recordingIndicator}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>Recording</Text>
                </View>
              </View>
            </View>
          )}

          {/* CameraView — full screen during pupil-test/align, PiP during test */}
          <CameraView
            ref={cameraRef}
            style={showCameraFull ? StyleSheet.absoluteFill : styles.cameraPip}
            facing="front"
            mode="video"
            mute={true}
            onCameraReady={() => {
              console.log("[VP] onCameraReady");
              cameraReadyRef.current = true;
              if (pendingRecordRef.current) {
                pendingRecordRef.current = false;
                startRecording();
              }
            }}
          />

          {/* Pupil brightness overlay */}
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
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>Recording</Text>
              </View>
            </Animated.View>
          )}

          {/* Alignment overlay */}
          {ALIGN_PHASES.has(phase) && currentRound && (
            <View style={[StyleSheet.absoluteFill, styles.alignOverlay]}>
              <View style={styles.alignHeader}>
                <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                  <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: "#FFFFFF" }]}>Visual Pursuit</Text>
                <View style={styles.placeholder} />
              </View>

              {isHorizontalAlign ? (
                // Near top (near front camera) for horizontal rounds
                <View style={styles.horizontalOvalSection}>
                  <View style={styles.eyeOval} />
                  <Text style={styles.alignInstruction}>{ROUND_INSTRUCTION[currentRound]}</Text>
                  <Text style={styles.alignSubtext}>Align near the front camera</Text>
                </View>
              ) : (
                // Centered for vertical rounds
                <View style={styles.verticalOvalSection}>
                  <View style={styles.eyeOval} />
                  <Text style={styles.alignInstruction}>{ROUND_INSTRUCTION[currentRound]}</Text>
                </View>
              )}

              <View style={styles.alignBottom}>
                <Text style={styles.roundLabel}>{ROUND_LABELS[currentRound]}</Text>
                <Text style={styles.ballDirectionText}>{ROUND_DIRECTION[currentRound]}</Text>
                <TouchableOpacity style={styles.okButton} onPress={onOKPressed}>
                  <Text style={styles.okButtonText}>OK — Start Round</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}

      {/* ── ANALYZING ──────────────────────────────────────────────────────── */}
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
            <Text style={styles.analyzingSubtitle}>Processing all 4 rounds...</Text>
          </View>
        </>
      )}

      {/* ── COMPLETE ───────────────────────────────────────────────────────── */}
      {phase === "complete" && roundResults && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Visual Pursuit — Done</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView
            contentContainerStyle={styles.resultScreen}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.resultCard}>
              <Text style={styles.resultCardTitle}>Visual Pursuit — All 4 Rounds</Text>
              {roundResults.apiSuccess ? (
                <View style={styles.resultRow}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  <Text style={styles.resultSuccess}>Analysis complete — data saved</Text>
                </View>
              ) : (
                <View style={styles.resultRow}>
                  <Ionicons name="cloud-offline-outline" size={20} color="#9CA3AF" />
                  <Text style={styles.resultUnavailable}>API unavailable — video saved</Text>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.retryButton} onPress={gameStartState}>
              <Ionicons name="refresh" size={20} color="#FFFFFF" />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.homeButton} onPress={handleBack}>
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
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#1F2937", flex: 1, textAlign: "center" },
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
    marginBottom: 28,
  },
  instructionTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 12,
  },
  instructionText: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 23,
    marginBottom: 28,
    paddingHorizontal: 8,
  },

  exampleBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 24,
  },
  exampleLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 16,
    textAlign: "center",
  },
  stepContainer: { marginBottom: 16 },
  step: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
  },
  stepNumberText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  stepText: { flex: 1, fontSize: 14, color: "#374151", lineHeight: 20 },
  exampleNote: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF2FF",
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  exampleNoteText: { fontSize: 13, color: "#4338CA", flex: 1, lineHeight: 18 },

  rulesBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 28,
  },
  rulesTitle: { fontSize: 15, fontWeight: "700", color: "#1F2937", marginBottom: 14 },
  rule: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#6366F1",
    marginTop: 7,
    marginRight: 12,
    flexShrink: 0,
  },
  ruleText: { flex: 1, fontSize: 14, color: "#6B7280", lineHeight: 20 },

  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6366F1",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  startButtonText: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },

  // Camera PiP during test phases
  cameraPip: {
    position: "absolute",
    top: 84,
    right: 12,
    width: 80,
    height: 108,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#6366F1",
    zIndex: 10,
  },

  // Pupil test
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

  // Alignment overlay
  alignOverlay: { backgroundColor: "rgba(0,0,0,0.40)" },
  alignHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "rgba(0,0,0,0.25)",
  },

  // Eye oval — eye-shaped, inclusive for all eye sizes
  eyeOval: {
    width: EYE_OVAL_W,
    height: EYE_OVAL_H,
    borderRadius: 9999,
    borderWidth: 2.5,
    borderColor: "#6366F1",
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },

  // Vertical rounds: oval centered in remaining space
  verticalOvalSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 18,
  },

  // Horizontal rounds: oval near top (near front camera)
  horizontalOvalSection: {
    paddingTop: 28,
    alignItems: "center",
    gap: 14,
  },

  alignInstruction: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    paddingHorizontal: 24,
  },
  alignSubtext: {
    fontSize: 13,
    color: "#D1D5DB",
    textAlign: "center",
  },

  alignBottom: {
    paddingHorizontal: 24,
    paddingBottom: 36,
    alignItems: "center",
    gap: 10,
  },
  roundLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#E5E7EB",
    textAlign: "center",
  },
  ballDirectionText: {
    fontSize: 13,
    color: "#D1D5DB",
    textAlign: "center",
  },
  okButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6366F1",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 6,
    gap: 8,
  },
  okButtonText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },

  // Game screen during test phases
  gameScreen: { flex: 1, padding: 16 },
  instructionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF2FF",
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    gap: 10,
  },
  gameInstruction: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4338CA",
    flex: 1,
  },
  canvas: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#6366F1",
    position: "relative",
    marginBottom: 14,
    overflow: "hidden",
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
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#EF4444",
  },
  recordingText: { fontSize: 13, fontWeight: "600", color: "#991B1B" },

  // Analyzing
  analyzingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  analyzingTitle: { fontSize: 20, fontWeight: "700", color: "#1F2937", marginTop: 8 },
  analyzingSubtitle: { fontSize: 14, color: "#6B7280", textAlign: "center" },

  // Results
  resultScreen: { padding: 20, paddingBottom: 40 },
  resultCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 10,
  },
  resultCardTitle: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  resultSuccess: { fontSize: 13, color: "#065F46", fontWeight: "500" },
  resultUnavailable: { fontSize: 13, color: "#9CA3AF" },

  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6366F1",
    paddingVertical: 15,
    borderRadius: 12,
    marginBottom: 14,
    gap: 8,
  },
  retryButtonText: { fontSize: 15, fontWeight: "600", color: "#FFFFFF" },
  homeButton: { paddingVertical: 12, alignItems: "center" },
  homeButtonText: { fontSize: 15, fontWeight: "600", color: "#6366F1" },

  // Banner (permission warning)
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
});
