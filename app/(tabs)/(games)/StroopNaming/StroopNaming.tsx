import { Countdown } from "@/components/Countdown";
import { ScoreTrendCard } from "@/components/ScoreTrendCard";
import { saveGameResult } from "@/lib/firestore";
import { EMPATICA_PARTICIPANT } from "@/lib/empaticaConfig";
import { useSession } from "@/lib/SessionContext";
import StroopBrick from "@/components/StroopBricks";
import { StroopGameGen } from "@/logic/StroopGameGen";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function StroopNaming() {
  const router = useRouter();
  const { sessionMode, completeGame, isLastGame, savePartialSession, resetSession } = useSession();
  const [countdown, setCountdown] = useState(false);
  const [color, setColor] = useState("");
  const [colorWord, setColorWord] = useState("");
  const [options, setGameOptions] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [perceivedDuration, setPerceivedDuration] = useState(0);
  const gameStartTimeRef = useRef<number>(0);
  const scoreRef = useRef(0);
  const totalAttemptsRef = useRef(0);
  const stimulusTimeRef = useRef<number>(0);
  const reactionTimesRef = useRef<number[]>([]);

  const parseGameGen = () => {
    const gameInfo = StroopGameGen();
    setColor(gameInfo.word_color);
    setColorWord(gameInfo.word);
    setGameOptions(gameInfo.options);
    stimulusTimeRef.current = Date.now();
  };

  const checkIfCorrect = (option: string) => {
    const reactionMs = Date.now() - stimulusTimeRef.current;
    reactionTimesRef.current = [...reactionTimesRef.current, reactionMs];
    if (option.toLowerCase() === color) {
      setScore(s => { scoreRef.current = s + 1; return s + 1; });
    }
    setTotalAttempts(t => { totalAttemptsRef.current = t + 1; return t + 1; });
    parseGameGen();
  };

  const startGame = () => {
    scoreRef.current = 0;
    totalAttemptsRef.current = 0;
    reactionTimesRef.current = [];
    setScore(0);
    setTotalAttempts(0);
    setPerceivedDuration(0);
    setGameOver(false);
    setGameStarted(true);
    gameStartTimeRef.current = Date.now();
    parseGameGen();
  };

  const handleGameOver = (elapsedSeconds: number) => {
    setGameOver(true);
    setGameStarted(false);

    const endTime = new Date();
    const currentScore = scoreRef.current;
    const currentAttempts = totalAttemptsRef.current;
    const times = reactionTimesRef.current;
    const avgReactionTimeMs = times.length > 0
      ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      : 0;
    const metricsPayload = {
      score: currentScore,
      totalAttempts: currentAttempts,
      accuracy: currentAttempts > 0 ? Math.round((currentScore / currentAttempts) * 100) : 0,
      avgReactionTimeMs,
      perceivedDurationSeconds: elapsedSeconds,
      timeDeltaSeconds: elapsedSeconds - 30,
    };
    if (sessionMode === 'full_session') {
      completeGame('stroop_naming', metricsPayload, new Date(gameStartTimeRef.current));
      if (isLastGame()) {
        router.replace('/session-results');
      } else {
        router.replace('/session-transition');
      }
    } else {
      saveGameResult(
        'stroop_naming',
        EMPATICA_PARTICIPANT.fullId,
        new Date(gameStartTimeRef.current),
        endTime,
        metricsPayload
      );
    }
  };

  const handleStop = () => {
    const elapsed = Math.round((Date.now() - gameStartTimeRef.current) / 1000);
    setPerceivedDuration(elapsed);
    handleGameOver(elapsed);
  };

  const handleBackToDashboard = () => {
    if (sessionMode === 'full_session') {
      savePartialSession();
      resetSession();
    }
    setGameOver(false);
    setGameStarted(false);
    setScore(0);
    setTotalAttempts(0);

    router.replace("/(tabs)/dashboard");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBackToDashboard}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Stroop Naming</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Game Area */}
      <View style={styles.gameArea}>
        {/* START SCREEN */}
        {!gameStarted && !gameOver && (
          <View style={styles.startScreen}>
            <View style={styles.iconContainer}>
              <Ionicons name="text-outline" size={64} color="#3B82F6" />
            </View>
            <Text style={styles.instructionTitle}>Stroop Test</Text>
            <Text style={styles.instructionText}>
              A word will appear at the top. Choose the answer that matches the{" "}
              <Text style={styles.boldText}>COLOR</Text> of the word, not what
              the text says.
            </Text>

            <TouchableOpacity style={styles.startButton} onPress={() => setCountdown(true)}>
              <Text style={styles.startButtonText}>Begin Test</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* PLAY SCREEN */}
        {gameStarted && !gameOver && (
          <View style={styles.playScreen}>
            <Text style={styles.timePrompt}>
              Tap STOP when you feel 30 seconds have passed
            </Text>

            {/* Instruction reminder */}
            <Text style={styles.reminderText}>
              Select the COLOR of the word
            </Text>

            {/* Main Brick */}
            <View style={styles.mainBrickContainer}>
              <StroopBrick color="#F3F4F6" text={colorWord} textColor={color} />
            </View>

            {/* Options - All same neutral color with text labels */}
            <View style={styles.optionsContainer}>
              {options.map((opt, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => checkIfCorrect(opt)}
                  style={styles.optionButton}
                  activeOpacity={0.7}
                >
                  <Text style={styles.optionText}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* STOP button */}
            <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
              <Ionicons name="stop-circle-outline" size={24} color="#FFFFFF" />
              <Text style={styles.stopButtonText}>STOP</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* RESULT SCREEN */}
        {gameOver && (
          <ScrollView style={styles.resultScrollView} contentContainerStyle={styles.resultScreen} showsVerticalScrollIndicator={false}>
            <View
              style={[styles.iconContainer, { backgroundColor: "#D1FAE5" }]}
            >
              <Ionicons name="checkmark-circle" size={64} color="#10B981" />
            </View>
            <Text style={styles.resultTitle}>Game Finished</Text>
            <Text style={styles.resultSubtitle}>
              Your Stroop test results are shown below.
            </Text>

            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Final Score</Text>
              <Text style={styles.scoreValue}>{score}</Text>
              <Text style={styles.scoreSubtext}>
                correct answers out of {totalAttempts}
              </Text>
              <View style={styles.accuracyContainer}>
                <Text style={styles.accuracyLabel}>Accuracy:</Text>
                <Text style={styles.accuracyValue}>
                  {totalAttempts > 0
                    ? Math.round((score / totalAttempts) * 100)
                    : 0}
                  %
                </Text>
              </View>
            </View>

            {/* Time Perception */}
            <View style={[styles.scoreCard, { marginTop: 0 }]}>
              <Text style={styles.scoreLabel}>Time Perception</Text>
              <Text style={styles.scoreValue}>{perceivedDuration}s</Text>
              <Text style={styles.scoreSubtext}>you stopped at (target: 30s)</Text>
              <View style={styles.accuracyContainer}>
                <Text style={styles.accuracyLabel}>Difference:</Text>
                <Text style={styles.accuracyValue}>
                  {perceivedDuration >= 30 ? "+" : ""}{perceivedDuration - 30}s
                </Text>
              </View>
            </View>

            {/* Action Buttons */}
            <ScoreTrendCard
              gameType="stroop_naming"
              participantId="2872-1-1-1"
              currentMetrics={{
                accuracy: totalAttempts > 0 ? Math.round((score / totalAttempts) * 100) : 0,
                avgReactionTimeMs: reactionTimesRef.current.length > 0
                  ? Math.round(reactionTimesRef.current.reduce((a, b) => a + b, 0) / reactionTimesRef.current.length)
                  : 0,
                timeDeltaSeconds: perceivedDuration - 30,
              }}
            />

            <TouchableOpacity style={styles.retryButton} onPress={() => setCountdown(true)}>
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
        )}
      </View>
      {countdown && (
        <Countdown onComplete={() => { setCountdown(false); startGame(); }} />
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
  gameArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  // START SCREEN
  startScreen: {
    alignItems: "center",
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
  },
  instructionTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 16,
  },
  instructionText: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 30,
  },
  boldText: {
    fontWeight: "700",
    color: "#4F46E5",
  },
  exampleBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 30,
    width: "100%",
  },
  exampleLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 16,
  },
  exampleText: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 16,
    textAlign: "center",
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4F46E5",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginRight: 8,
  },

  // PLAY SCREEN
  playScreen: {
    width: "100%",
    alignItems: "center",
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginBottom: 20,
  },
  statCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  statText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginLeft: 8,
  },
  reminderText: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 20,
    fontStyle: "italic",
  },
  mainBrickContainer: {
    marginVertical: 30,
  },
  optionsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 20,
    gap: 12,
  },
  optionButton: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    minWidth: 120,
    alignItems: "center",
  },
  optionText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    textTransform: "capitalize",
  },

  // RESULT SCREEN
  resultScrollView: {
    flex: 1,
    width: "100%",
  },
  resultScreen: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 40,
    paddingVertical: 20,
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
    marginBottom: 30,
    minWidth: 220,
  },
  scoreLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: "700",
    color: "#4F46E5",
    marginBottom: 4,
  },
  scoreSubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    marginBottom: 12,
  },
  accuracyContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  accuracyLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginRight: 8,
  },
  accuracyValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#10B981",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4F46E5",
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
    color: "#4F46E5",
  },
  timePrompt: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF4444",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 24,
    width: "100%",
    gap: 8,
  },
  stopButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});

