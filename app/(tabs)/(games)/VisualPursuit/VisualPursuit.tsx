import { saveGameResult, updateSessionGameResult } from "@/lib/firestore";
import { EMPATICA_PARTICIPANT } from "@/lib/empaticaConfig";
import { uploadVideo } from "@/lib/firebaseStorage";
import * as FileSystem from 'expo-file-system/legacy';
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "react-native";
import Svg, { Line } from "react-native-svg";

const INST1 = require('@/assets/inst_images/vp_inst1.jpg');  // portrait steps (1 & 2)
const INST2 = require('@/assets/inst_images/vp_inst2.jpg');  // landscape steps (3 & 4)

const { width: SCREEN_W } = Dimensions.get("window");
const BALL_SIZE = 36;
const BALL_SPEED = 5;
const BALL_PAUSE_FRAMES = 15; // ~450ms pause at 30ms tick
const API_BASE = "https://unsoaped-tomas-monarchically.ngrok-free.dev";

// PiP camera dimensions (fixed — never changes during recording)
const PIP_W = 88;
const PIP_H = 112;
const HEADER_H = 56; // paddingVertical:16×2 + icon height:24

// Calibration oval dimensions — shrunk so two ovals fit side-by-side on the alignment screen
const CALIB_OVAL_W = 122;   // wide axis
const CALIB_OVAL_H = 80;    // narrow axis

// Fixed square footprint for the rotated info panel on horizontal-round calibration —
// a square's bounding box is unchanged by a 90° rotation, so it can't overflow its slot.
const ALIGN_PANEL_SIZE = Math.min(SCREEN_W - 64, 280);

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
  vertical_left:    "Fill the oval with your LEFT eye — hold still",
  vertical_right:   "Fill the oval with your RIGHT eye — hold still",
  horizontal_left:  "Fill the oval with your LEFT eye — hold still",
  horizontal_right: "Fill the oval with your RIGHT eye — hold still",
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

// ─── step illustration components ────────────────────────────────────────────
// inst1.jpg = portrait steps (1 & 2), inst2.jpg = landscape steps (3 & 4)

const introStyles = StyleSheet.create({
  stepCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  stepBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
    letterSpacing: 0.5,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  // Portrait phone wrap
  phoneWrap: {
    alignItems: 'center',
    gap: 4,
  },
  phoneAsset: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ballOverlayPortrait: {
    position: 'absolute',
    top: 28,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F59E0B',
  },
  arrowPortrait: {
    position: 'absolute',
    top: 40,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  // Landscape phone wrap
  phoneWrapLandscape: {
    alignItems: 'center',
    gap: 4,
  },
  phoneAssetLandscape: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ballOverlayLandscape: {
    position: 'absolute',
    left: 30,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F59E0B',
  },
  arrowLandscape: {
    position: 'absolute',
    left: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  // Camera / eye tags on illustrations
  cameraTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cameraTagText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#3B82F6',
  },
  eyeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  eyeTagLeft: { alignSelf: 'flex-start' },
  eyeTagRight: { alignSelf: 'flex-end' },
  eyeTagText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#6366F1',
  },
  // Right-side label column
  labelCol: {
    flex: 1,
    gap: 6,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  eyeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  eyeLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366F1',
  },
  cameraLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cameraLabelText: {
    fontSize: 11,
    color: '#3B82F6',
    fontWeight: '500',
    flex: 1,
  },
  labelInstruction: {
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 16,
  },
  cameraNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12 },
  cameraNoteText: { fontSize: 12, color: '#3B82F6', fontWeight: '500' },

  // Illustration container
  illWrap: {
    alignItems: 'center',
    gap: 6,
    width: 130,
  },
  instImg: {
    width: 120,
    height: 150,
    borderRadius: 8,
  },
  fullImgPortrait: {
    width: SCREEN_W,
    marginHorizontal: -20,
    height: undefined,
    aspectRatio: 0.75,
    borderRadius: 8,
    marginBottom: 16,
  },
  fullImgLandscape: {
    width: SCREEN_W,
    marginHorizontal: -20,
    height: undefined,
    aspectRatio: 0.75,
    borderRadius: 8,
    marginBottom: 16,
  },
  // Light card behind the phone image
  phoneCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: 90,
    height: 130,
  },
  phoneCardLandscape: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: 130,
    height: 80,
  },
  phoneImgPortrait: {
    width: 72,
    height: 112,
  },
  phoneImgLandscape: {
    width: 112,
    height: 62,
  },
  eyeImg: {
    width: 12,
    height: 12,
  },
  // Small label chip
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: 'center',
  },
  chipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#3B82F6',
  },
});

// ─── component ───────────────────────────────────────────────────────────────

export default function VisualPursuit() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { sessionMode, completeGame, updateGameResult, addPendingJob, isLastGame, getPartialSessionId } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<TestPhase>("intro");
  const [ballPosition, setBallPosition] = useState({ x: 0, y: 0 });
  const [roundResults, setRoundResults] = useState<{
    apiSuccess: boolean;
    rounds: Record<RoundKey, {
      videoUrl: string | null;
      apiSuccess: boolean;
      totalFrames?: number;
      pupilDetected?: number;
      irisDetected?: number;
      durationSeconds?: number;
    }>;
  } | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const gameStartTimeRef = useRef<Date | null>(null);
  const canvasHeightRef = useRef(420);
  const canvasWidthRef = useRef(SCREEN_W - 40);
  const animationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef(false);
  const recordingPromiseRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
  const cameraReadyRef = useRef(false);
  const pendingRecordRef = useRef(false);
  const isRunningRef = useRef(false);
  const ballXRef = useRef(0);
  const ballYRef = useRef(0);
  const ballStageRef = useRef<BallStage>("to-end");
  const pauseFramesRef = useRef(0);
  const ballCycleRef = useRef(0); // counts completed round-trips; game ends after 2
  // Per-round URIs — camera is always full-screen (no resize) so per-round
  // recording is now safe. File is copied to documentDirectory before upload
  // because fetch() cannot access the camera cache path on Android.
  const roundUrisRef = useRef<Record<RoundKey, string | null>>({
    vertical_left: null, vertical_right: null,
    horizontal_left: null, horizontal_right: null,
  });
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
    pauseFramesRef.current = 0;
    ballCycleRef.current = 0; // reset — will complete after 2 full round-trips

    if (vertical) {
      const centerY = canvasHeightRef.current / 2 - BALL_SIZE / 2;
      ballXRef.current = centerX;
      ballYRef.current = centerY;
      setBallPosition({ x: centerX, y: centerY });
    } else {
      ballXRef.current = centerX;
      ballYRef.current = 0;
      setBallPosition({ x: centerX, y: 0 });
    }

    animationRef.current = setInterval(() => {
      if (pauseFramesRef.current > 0) {
        pauseFramesRef.current--;
        return;
      }

      const cx = canvasWidthRef.current / 2 - BALL_SIZE / 2;

      if (vertical) {
        const centerY = canvasHeightRef.current / 2 - BALL_SIZE / 2;

        if (ballStageRef.current === "to-end") {
          // Moving up to top
          ballYRef.current = Math.max(0, ballYRef.current - BALL_SPEED);
          if (ballYRef.current <= 0) {
            pauseFramesRef.current = BALL_PAUSE_FRAMES;
            ballStageRef.current = "to-start";
          }
        } else {
          // Returning to center
          ballYRef.current = Math.min(centerY, ballYRef.current + BALL_SPEED);
          if (ballYRef.current >= centerY) {
            ballCycleRef.current += 1;
            if (ballCycleRef.current >= 2) {
              // Both sweeps done
              stopAnimation();
              onComplete();
              return;
            }
            // Start second sweep — brief pause at center before going again
            pauseFramesRef.current = BALL_PAUSE_FRAMES;
            ballStageRef.current = "to-end";
          }
        }
        setBallPosition({ x: cx, y: ballYRef.current });
      } else {
        const maxY = canvasHeightRef.current - BALL_SIZE;

        if (ballStageRef.current === "to-end") {
          // Moving down to bottom
          ballYRef.current = Math.min(maxY, ballYRef.current + BALL_SPEED);
          if (ballYRef.current >= maxY) {
            pauseFramesRef.current = BALL_PAUSE_FRAMES;
            ballStageRef.current = "to-start";
          }
        } else {
          // Returning to top
          ballYRef.current = Math.max(0, ballYRef.current - BALL_SPEED);
          if (ballYRef.current <= 0) {
            ballCycleRef.current += 1;
            if (ballCycleRef.current >= 2) {
              // Both sweeps done
              stopAnimation();
              onComplete();
              return;
            }
            // Start second sweep — brief pause at top before going again
            pauseFramesRef.current = BALL_PAUSE_FRAMES;
            ballStageRef.current = "to-end";
          }
        }
        setBallPosition({ x: cx, y: ballYRef.current });
      }
    }, 30);
  };

  const stopAndSaveRound = async (round: RoundKey): Promise<string | null> => {
    const rawUri = await stopRecording();
    if (!rawUri) { console.log(`[VP] ${round} — no URI from stopRecording`); return null; }
    // Copy from camera cache to documentDirectory so fetch() can access it for upload
    try {
      const dest = `${FileSystem.documentDirectory}vp_${round}_${Date.now()}.mp4`;
      await FileSystem.copyAsync({ from: rawUri, to: dest });
      console.log(`[VP] ${round} saved: ${dest}`);
      return dest;
    } catch (e) {
      console.log(`[VP] ${round} copy failed, using raw uri:`, e);
      return rawUri;
    }
  };

  const onRoundComplete = async (roundIndex: number) => {
    stopAnimation();
    const round = ROUND_ORDER[roundIndex];
    const uri = await stopAndSaveRound(round);
    roundUrisRef.current[round] = uri;

    const nextIndex = roundIndex + 1;
    if (nextIndex < ROUND_ORDER.length) {
      setPhase(getRoundAlignPhase(ROUND_ORDER[nextIndex]));
    } else {
      analyzeAll();
    }
  };

  const onOKPressed = () => {
    const round = getRoundFromPhase(phase);
    if (!round) return;
    const roundIndex = ROUND_ORDER.indexOf(round);
    roundStartTimesRef.current[round] = new Date();
    // Phase change moves camera from absoluteFill → pip (layout change).
    // Wait 50ms for the layout to settle before starting recording to avoid null URI.
    setPhase(getRoundTestPhase(round));
    startBallAnimation(round, () => onRoundComplete(roundIndex));
    setTimeout(() => {
      if (cameraReadyRef.current) startRecording();
      else pendingRecordRef.current = true;
    }, 50);
  };

  const analyzeAll = async () => {
    isRunningRef.current = false;
    const capturedUris = { ...roundUrisRef.current };
    const capturedGameStart = gameStartTimeRef.current ?? new Date();
    const roundTimes = Object.fromEntries(
      Object.entries(roundStartTimesRef.current).map(([k, v]) => [k, v?.toISOString() ?? null]),
    );

    // Downloads frames.json from the API and computes nystagmus metrics from
    // the per-frame gaze_offset_px (pupil_center minus iris_center).
    const computeNystagmus = async (jsonUrl: string): Promise<Record<string, any> | null> => {
      try {
        const res = await fetch(jsonUrl);
        if (!res.ok) { console.log('[VP] frames.json fetch failed:', res.status); return null; }
        const data = await res.json();
        const frames: any[] = data.frames ?? [];

        // Only frames where both pupil and iris were detected have a gaze offset
        const offsets = frames
          .map((f: any) => f.gaze_offset_px)
          .filter((g: any) => Array.isArray(g) && g.length === 2);

        if (offsets.length < 3) return null;   // not enough data

        const xs = offsets.map((g: number[]) => g[0]);
        const ys = offsets.map((g: number[]) => g[1]);

        const mean  = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
        const std   = (a: number[], m: number) =>
          Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
        const round1 = (n: number) => Math.round(n * 10) / 10;

        const avgX = mean(xs), avgY = mean(ys);

        // Direction changes in the gaze signal = oscillation frequency proxy.
        // A sign change in consecutive differences indicates a reversal.
        const dirChanges = (arr: number[]) => {
          let c = 0;
          for (let i = 2; i < arr.length; i++) {
            if ((arr[i] - arr[i - 1]) * (arr[i - 1] - arr[i - 2]) < 0) c++;
          }
          return c;
        };

        const xDirChanges = dirChanges(xs);
        const yDirChanges = dirChanges(ys);
        const xJitter = std(xs, avgX);
        const yJitter = std(ys, avgY);

        // Nystagmus intensity proxy: jitter × oscillation rate
        // Higher = more involuntary oscillation detected
        const fps = data.fps ?? 1;
        const xNystagmus = round1(xJitter * (xDirChanges / (frames.length / fps)));
        const yNystagmus = round1(yJitter * (yDirChanges / (frames.length / fps)));

        return {
          gazeFrames:       offsets.length,
          xAmplitudePx:     round1(Math.max(...xs.map(Math.abs))),
          yAmplitudePx:     round1(Math.max(...ys.map(Math.abs))),
          xJitterPx:        round1(xJitter),
          yJitterPx:        round1(yJitter),
          avgGazeOffsetX:   round1(avgX),
          avgGazeOffsetY:   round1(avgY),
          xDirectionChanges: xDirChanges,
          yDirectionChanges: yDirChanges,
          xNystagmusScore:  xNystagmus,  // horizontal involuntary oscillation (HAN proxy)
          yNystagmusScore:  yNystagmus,  // vertical involuntary oscillation (VAN proxy)
        };
      } catch (e) {
        console.log('[VP] computeNystagmus error:', e);
        return null;
      }
    };

    // Upload video first (always), then call API, then download frames.json
    // and compute nystagmus — all in sequence so nothing blocks the video save.
    const uploadRound = async (round: RoundKey) => {
      const uri = capturedUris[round];
      if (!uri) return { round, videoUrl: null, apiResult: null, apiSuccess: false, nystagmus: null };
      const videoUrl = await uploadVideo(uri, EMPATICA_PARTICIPANT.fullId, "visual_pursuit", round).catch(e => {
        console.log(`[VP] Upload failed for ${round}:`, e);
        return null;
      });
      const apiResult = await analyzeVideo(uri).catch(e => {
        console.log(`[VP] API failed for ${round}:`, e);
        return null;
      });
      // Download and process per-frame data immediately — the json_url is only
      // valid while the API server is running (ngrok session).
      const nystagmus = apiResult?.json_url
        ? await computeNystagmus(`${API_BASE}${apiResult.json_url}`)
        : null;
      return { round, videoUrl, apiResult, apiSuccess: apiResult !== null, nystagmus };
    };

    const uploadAllSequential = async () => {
      const results = [];
      for (const round of ROUND_ORDER) {
        results.push(await uploadRound(round));
      }
      return results;
    };

    // Builds the Firestore metrics object. Saves:
    //   - videoUrls: flat map of all 4 video URLs (saved even if API failed)
    //   - rounds: per-round video URL + API summary + nystagmus metrics
    const buildMetrics = (results: Awaited<ReturnType<typeof uploadRound>>[]) => {
      const videoUrls: Record<string, string | null> = {};
      const rounds: Record<string, any> = {};
      for (const r of results) {
        videoUrls[r.round] = r.videoUrl;
        rounds[r.round] = {
          videoUrl:   r.videoUrl,
          apiSuccess: r.apiSuccess,
          ...(r.apiResult ? {
            totalFrames:     r.apiResult.n_total_frames,
            pupilDetected:   r.apiResult.n_pupil_detected,
            irisDetected:    r.apiResult.n_iris_detected,
            fps:             r.apiResult.fps,
            durationSeconds: r.apiResult.duration_s,
            csvUrl:  r.apiResult.csv_url  ? `${API_BASE}${r.apiResult.csv_url}`  : null,
            jsonUrl: r.apiResult.json_url ? `${API_BASE}${r.apiResult.json_url}` : null,
          } : {}),
          ...(r.nystagmus ? { nystagmus: r.nystagmus } : {}),
        };
      }
      return {
        videoUrls,
        rounds,
        roundTimes,
        apiSuccess: results.some(r => r.apiSuccess),
      };
    };

    if (sessionMode === "full_session") {
      // Await so the partial-session doc is guaranteed to exist (and its ID set)
      // before we read it below — otherwise, when VP is the first game to complete,
      // getPartialSessionId() can still return null because the save hasn't resolved.
      await completeGame("visual_pursuit", { apiSuccess: null }, capturedGameStart);
      // Capture the partial session doc ID NOW — before the user navigates away and
      // potentially resets the session context. Video uploads take 30-60 s and the
      // context may be cleared long before they finish.
      const sessionDocId = getPartialSessionId();
      if (isLastGame()) { router.replace("/session-results"); }
      else { router.replace("/session-transition"); }

      const job = (async (): Promise<void> => {
        const results = await uploadAllSequential();
        const metrics = buildMetrics(results);
        // Update in-memory context (works if session is still active)
        updateGameResult("visual_pursuit", metrics);
        // Also patch Firestore directly — this works even if the session was
        // abandoned and resetSession() has already been called.
        if (sessionDocId) {
          await updateSessionGameResult(sessionDocId, "visual_pursuit", metrics);
        }
      })();
      addPendingJob(job);
      return;
    }

    // Individual mode — sequential uploads
    setPhase("analyzing");
    const results = await uploadAllSequential();
    saveGameResult(
      "visual_pursuit", EMPATICA_PARTICIPANT.fullId, capturedGameStart, new Date(),
      buildMetrics(results),
      "individual",
    );
    const roundMap: Record<string, any> = {};
    for (const r of results) {
      roundMap[r.round] = {
        videoUrl: r.videoUrl,
        apiSuccess: r.apiSuccess,
        ...(r.apiResult ? {
          totalFrames:   r.apiResult.n_total_frames,
          pupilDetected: r.apiResult.n_pupil_detected,
          irisDetected:  r.apiResult.n_iris_detected,
          durationSeconds: r.apiResult.duration_s,
        } : {}),
        ...(r.nystagmus ? { nystagmus: r.nystagmus } : {}),
      };
    }
    setRoundResults({ apiSuccess: results.some(r => r.apiSuccess), rounds: roundMap as any });
    setPhase("complete");
  };

  const gameStartState = async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    cleanup();
    brightnessAnim.setValue(0);
    roundUrisRef.current = { vertical_left: null, vertical_right: null, horizontal_left: null, horizontal_right: null };
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
  const currentRound = getRoundFromPhase(phase);
  const isHorizontalAlign =
    phase === "align-horizontal-left" || phase === "align-horizontal-right";

  // Which eye's oval is the one being tested this round (gets the solid outline).
  const testedSide: "left" | "right" | null = currentRound
    ? (currentRound.endsWith("_left") ? "left" : "right")
    : null;

  // Horizontal rounds are calibrated with the phone rotated 90° — the divider/ovals
  // are drawn top/bottom on-screen so they read as left/right once the phone is rotated.
  // The front camera sits at render-top, which (after the user's physical rotation)
  // ends up on the same side as the tested eye's oval — so that eye is the one
  // actually in front of the camera lens.
  const calibFirstSide: "left" | "right" =
    isHorizontalAlign ? (currentRound === "horizontal_left" ? "left" : "right") : "left";
  const calibSecondSide: "left" | "right" = calibFirstSide === "left" ? "right" : "left";

  // During test phases, the camera (absoluteFill) needs to show through — make container transparent
  const isTestPhase = TEST_PHASES.has(phase);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
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

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Logo + title */}
            <View style={styles.iconContainer}>
              <Ionicons name="eye-outline" size={52} color="#6366F1" />
            </View>
            <Text style={styles.instructionTitle}>Visual Pursuit Test</Text>
            <Text style={styles.instructionText}>
              Analyzes involuntary eye movements to provide an objective assessment of your sobriety.
            </Text>
            <Text style={[styles.instructionText, { fontSize: 12, color: '#9CA3AF', marginTop: -8 }]}>
              The camera records your eye movements for AI analysis.
            </Text>

            {/* How it works */}
            <View style={styles.exampleBox}>
              <Text style={styles.exampleLabel}>How it works</Text>
              {[
                "Vertical Scan: Track the ball with each eye for 15s (portrait).",
                "Horizontal Scan: Track the ball with each eye for 15s (landscape).",
                "AI Analysis: System processes your eye movement data.",
                "View Results: Receive instant performance insights.",
              ].map((text, i) => (
                <View key={i} style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{text}</Text>
                </View>
              ))}
            </View>

            {/* Step illustrations — images contain all step info */}
            <Image source={INST1} style={introStyles.fullImgPortrait} resizeMode="contain" />
            <Image source={INST2} style={introStyles.fullImgLandscape} resizeMode="contain" />

            {/* Warning */}
            <View style={styles.exampleNote}>
              <Ionicons name="information-circle" size={20} color="#6366F1" />
              <Text style={styles.exampleNoteText}>
                Move only your eyes — keep your head and phone still during the test.
              </Text>
            </View>

            {/* Eye-fills-oval instruction */}
            <View style={[styles.exampleNote, { backgroundColor: '#FEF3C7', marginTop: 12, borderWidth: 1, borderColor: '#FCD34D' }]}>
              <Ionicons name="eye-outline" size={20} color="#92400E" />
              <Text style={[styles.exampleNoteText, { color: '#92400E' }]}>
                The phone needs to be positioned so the eye fills the whole oval.
              </Text>
            </View>

            <TouchableOpacity style={[styles.startButton, { marginTop: 20 }]} onPress={gameStartState}>
              <Text style={styles.startButtonText}>Begin Test</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </ScrollView>
        </>
      )}

      {/* ── CAMERA AREA (pupil-test, align-*, test-*) ──────────────────────── */}
      {cameraActive && (
        <>
          {/* Camera — absoluteFill during alignment/pupil phases (full-screen preview),
              small fixed pip during test phases (recording in progress).
              The 50ms delay in onOKPressed lets the layout change settle before
              recordAsync starts, preventing the null URI issue on Android. */}
          <CameraView
            ref={cameraRef}
            style={
              isTestPhase
                ? [styles.pipCamera, { top: insets.top + HEADER_H }]
                : StyleSheet.absoluteFill
            }
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

          {/* Test overlay — white screen with header + full-height content.
              Pip camera (zIndex 25) floats above this overlay in the top-right corner.
              Pip border (zIndex 26) draws the indigo frame on top of the camera. */}
          {TEST_PHASES.has(phase) && (
            <>
              <View style={[StyleSheet.absoluteFill, styles.testOverlay]}>
                {/* Header covers the status bar area */}
                <View style={[styles.header, { paddingTop: insets.top + 16, paddingBottom: 16 }]}>
                  <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color="#1F2937" />
                  </TouchableOpacity>
                  <Text style={styles.headerTitle} numberOfLines={1}>
                    {currentRound ? ROUND_LABELS[currentRound] : "Visual Pursuit"}
                  </Text>
                  <View style={styles.placeholder} />
                </View>

                {/* Content fills all remaining height — canvas takes the most space */}
                <View style={styles.testContent}>
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
                    <View style={[styles.ball, { left: ballPosition.x, top: ballPosition.y }]} />
                  </View>
                  <View style={styles.recordingIndicator}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingText}>Recording</Text>
                  </View>
                </View>
              </View>

              {/* Pip border sits above the camera (zIndex 26) — draws the indigo frame */}
              <View style={[styles.pipBorder, { top: insets.top + HEADER_H }]} />
            </>
          )}

          {/* Alignment overlay — semi-transparent so pip camera shows through (zIndex 20) */}
          {ALIGN_PHASES.has(phase) && currentRound && (
            <View style={[StyleSheet.absoluteFill, styles.alignOverlay]}>
              <View style={styles.alignHeader}>
                <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                  <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: "#FFFFFF" }]}>Visual Pursuit</Text>
                <View style={styles.placeholder} />
              </View>

              {/* Dotted center divider with one eye placeholder on each side. The eye being
                  tested this round gets a solid outline; the other stays dotted. For vertical
                  rounds the divider/ovals run left-right; for horizontal rounds they run
                  top-bottom on-screen so they read as left-right once the phone is rotated. */}
              <View style={styles.calibSection}>
                <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                  {isHorizontalAlign ? (
                    <Line
                      x1="0%" y1="50%" x2="100%" y2="50%"
                      stroke="#FFFFFF"
                      strokeWidth={2}
                      strokeDasharray="6,8"
                      strokeOpacity={0.5}
                    />
                  ) : (
                    <Line
                      x1="50%" y1="0%" x2="50%" y2="100%"
                      stroke="#FFFFFF"
                      strokeWidth={2}
                      strokeDasharray="6,8"
                      strokeOpacity={0.5}
                    />
                  )}
                </Svg>
                <View style={[styles.calibRow, isHorizontalAlign ? styles.calibRowVertical : styles.calibRowHorizontal]}>
                  {[calibFirstSide, calibSecondSide].map(side => (
                    <View key={side} style={styles.calibSide}>
                      <View
                        style={[
                          isVerticalRound(currentRound) ? styles.calibOvalVertical : styles.calibOvalHorizontal,
                          side === testedSide ? styles.calibOvalSolid : styles.calibOvalDotted,
                        ]}
                      />
                    </View>
                  ))}
                </View>
              </View>

              {/* Round info + instruction + OK button. Horizontal rounds: rendered as a
                  fixed square and rotated so it reads correctly once the phone is
                  physically rotated 90°. Left eye: -90° (phone rotated CW).
                  Right eye: +90° (phone flipped 180°). */}
              <View style={[
                styles.alignBottom,
                isHorizontalAlign && styles.alignBottomSquare,
                currentRound === 'horizontal_left'  && styles.alignBottomLandscape,
                currentRound === 'horizontal_right' && styles.alignBottomLandscapeRight,
              ]}>
                <Text style={styles.roundLabel}>{ROUND_LABELS[currentRound]}</Text>
                <Text style={styles.alignInstruction}>{ROUND_INSTRUCTION[currentRound]}</Text>
                <Text style={styles.alignSubtext}>{ROUND_DIRECTION[currentRound]}</Text>
                <TouchableOpacity style={styles.okButton} onPress={onOKPressed}>
                  <Text style={styles.okButtonText}>OK — Start Round</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Pupil brightness overlay — covers camera (zIndex 30) */}
          {phase === "pupil-test" && (
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                styles.pupilScreen,
                {
                  zIndex: 30,
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
            <Text style={styles.headerTitle}>Visual Pursuit — Results</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView contentContainerStyle={styles.resultScreen} showsVerticalScrollIndicator={false}>
            {/* Overall badge */}
            <View style={[styles.resultCard, { alignItems: 'center', gap: 8 }]}>
              <Ionicons
                name={roundResults.apiSuccess ? "checkmark-circle" : "cloud-offline-outline"}
                size={40}
                color={roundResults.apiSuccess ? "#10B981" : "#9CA3AF"}
              />
              <Text style={styles.resultCardTitle}>
                {roundResults.apiSuccess ? "Analysis Complete" : "Videos Saved — API Offline"}
              </Text>
              <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
                {roundResults.apiSuccess
                  ? "Eye movement data processed successfully"
                  : "All 4 videos uploaded. Analysis will be available when server is online."}
              </Text>
            </View>

            {/* Per-round results — pupil detection % + nystagmus scores only */}
            {ROUND_ORDER.map(round => {
              const r       = roundResults.rounds[round];
              const label   = ROUND_LABELS[round];
              const nyst    = (r as any)?.nystagmus;
              const pupilPct = r?.totalFrames
                ? Math.round((r.pupilDetected ?? 0) / r.totalFrames * 100)
                : null;
              return (
                <View key={round} style={styles.resultCard}>
                  <Text style={styles.resultCardTitle}>{label}</Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
                    {/* Pupil detection */}
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, color: '#6B7280', marginBottom: 2 }}>Pupil</Text>
                      <Text style={{ fontSize: 22, fontWeight: '700', color: '#6366F1' }}>
                        {pupilPct !== null ? `${pupilPct}%` : '—'}
                      </Text>
                    </View>
                    {/* Horizontal nystagmus */}
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, color: '#6B7280', marginBottom: 2 }}>H-Nyst</Text>
                      <Text style={{ fontSize: 22, fontWeight: '700', color: '#8B5CF6' }}>
                        {nyst?.xNystagmusScore != null ? nyst.xNystagmusScore.toFixed(2) : '—'}
                      </Text>
                    </View>
                    {/* Vertical nystagmus */}
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, color: '#6B7280', marginBottom: 2 }}>V-Nyst</Text>
                      <Text style={{ fontSize: 22, fontWeight: '700', color: '#06B6D4' }}>
                        {nyst?.yNystagmusScore != null ? nyst.yNystagmusScore.toFixed(2) : '—'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}

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

  // Small pip camera — fixed size, overflow:hidden clips preview to the box.
  // Sits above testOverlay (zIndex 20) so it floats in the top-right corner.
  pipCamera: {
    position: 'absolute',
    right: 0,
    width: PIP_W,
    height: PIP_H,
    overflow: 'hidden',
    zIndex: 25,
  },
  // White overlay covering the screen during test phases (below the pip camera)
  testOverlay: {
    backgroundColor: '#FAFAFA',
    zIndex: 20,
  },
  // Indigo border frame drawn on top of the pip camera
  pipBorder: {
    position: 'absolute',
    right: 0,
    width: PIP_W,
    height: PIP_H,
    borderWidth: 2,
    borderColor: '#6366F1',
    borderRadius: 8,
    zIndex: 26,
  },
  // Content below header — flex:1 so canvas fills the maximum available height
  testContent: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    padding: 8,
  },

  // Alignment overlay — semi-transparent so live camera shows through as background
  alignOverlay: {
    backgroundColor: "rgba(0,0,0,0.50)",
    zIndex: 20,
  },
  alignHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "rgba(0,0,0,0.25)",
  },

  // Calibration section: dotted center divider + two side-by-side eye placeholders.
  // Used for both vertical and horizontal alignment phases.
  calibSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 18,
  },
  calibRow: {
    alignItems: "center",
  },
  // Vertical rounds: divider/ovals run left-right
  calibRowHorizontal: {
    flexDirection: "row",
    width: "100%",
  },
  // Horizontal rounds: divider/ovals run top-bottom on-screen
  calibRowVertical: {
    flexDirection: "column",
    height: "100%",
  },
  calibSide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // Vertical rounds — landscape oval (wider than tall, matches eye shape)
  calibOvalVertical: {
    width: CALIB_OVAL_W,
    height: CALIB_OVAL_H,
    borderRadius: 9999,
    borderWidth: 2.5,
    backgroundColor: "transparent",
  },

  // Horizontal rounds — portrait oval (taller than wide, dimensions swapped vs vertical)
  calibOvalHorizontal: {
    width: CALIB_OVAL_H,
    height: CALIB_OVAL_W,
    borderRadius: 9999,
    borderWidth: 2.5,
    backgroundColor: "transparent",
  },

  // The eye being tested this round — solid outline
  calibOvalSolid: {
    borderColor: "#6366F1",
    borderStyle: "solid",
  },

  // The other eye — dotted outline
  calibOvalDotted: {
    borderColor: "rgba(255,255,255,0.45)",
    borderStyle: "dotted",
  },

  // Left eye: text rotated +90° to read correctly (was upside down at -90°)
  alignBottomLandscape: {
    transform: [{ rotate: '90deg' }],
  },
  // Right eye: text rotated -90° to read correctly (was upside down at +90°)
  alignBottomLandscapeRight: {
    transform: [{ rotate: '-90deg' }],
  },

  alignInstruction: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    paddingHorizontal: 8,
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
    justifyContent: "center",
    gap: 10,
  },
  // Horizontal rounds only — a fixed square so a 90° rotation can't change its
  // footprint or overflow into the oval/divider area above.
  alignBottomSquare: {
    width: ALIGN_PANEL_SIZE,
    height: ALIGN_PANEL_SIZE,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  roundLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#E5E7EB",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    overflow: "hidden",
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
    marginBottom: 8,
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


