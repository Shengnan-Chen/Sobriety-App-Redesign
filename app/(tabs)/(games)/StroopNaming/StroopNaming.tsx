import { Countdown } from "@/components/Countdown";
import { GameTimer } from "@/components/GameTimer";
import { ScoreTrendCard } from "@/components/ScoreTrendCard";
import StroopBrick from "@/components/StroopBricks";
import { EMPATICA_PARTICIPANT } from "@/lib/empaticaConfig";
import { saveGameResult } from "@/lib/firestore";
import { ms } from '@/lib/scale';
import { useSession } from "@/lib/SessionContext";
import { StroopGameGen } from "@/logic/StroopGameGen";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useRef, useState } from "react";
import { Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SCREEN_W = Dimensions.get('window').width;
// const SN_INSTR = require('@/assets/inst_images/SN_instr.jpg');
const SN_INSTR = require('@/assets/ins_images/stroop.png');

// CSS "brown" (#A52A2A) reads as more purple/maroon to some participants —
// use a warmer, more recognizably brown shade instead.
const COLOR_OVERRIDES: Record<string, string> = {
  brown: '#8B4513',
};
const getDisplayColor = (name: string) => COLOR_OVERRIDES[name] ?? name;

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
    setGameOver(false);
    setGameStarted(true);
    gameStartTimeRef.current = Date.now();
    parseGameGen();
  };

  const handleGameOver = () => {
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
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
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
          <ScrollView style={{ width: '100%' }} contentContainerStyle={styles.startScreen} showsVerticalScrollIndicator={false}>
            {/* Logo */}
            <View style={styles.iconContainer}>
              <Ionicons name="text-outline" size={64} color="#3B82F6" />
            </View>

            <Text style={styles.instructionTitle}>Stroop Test</Text>
            <Text style={styles.instructionText}>
              Evaluates cognitive flexibility, interference control, and time perception to assess your cognitive impairment.
            </Text>

            {/* How it works */}
            <View style={styles.snHowBox}>
              <Text style={styles.snHowLabel}>How it works:</Text>
              {[
                "Ignore the word's meaning and tap the text's actual color.",
                'Answer as many as you can in 30 seconds.',
              ].map((text, i) => (
                <View key={i} style={styles.snStep}>
                  <View style={styles.snStepNum}>
                    <Text style={styles.snStepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.snStepText}>{text}</Text>
                </View>
              ))}
            </View>

            {/* Step illustration */}
            <Image source={SN_INSTR} style={styles.snInstImg} resizeMode="contain" />

            <TouchableOpacity style={styles.startButton} onPress={() => setCountdown(true)}>
              <Text style={styles.startButtonText}>Begin Test</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* PLAY SCREEN */}
        {gameStarted && !gameOver && (
          <View style={styles.playScreen}>
            {/* 30-second auto timer */}
            <GameTimer time={30} onTimeUp={handleGameOver} />

            {/* Instruction reminder */}
            <Text style={styles.reminderText}>
              Select the COLOR of the word
            </Text>

            {/* Main Brick */}
            <View style={styles.mainBrickContainer}>
              <StroopBrick color="#F3F4F6" text={colorWord} textColor={getDisplayColor(color)} />
            </View>

            {/* Options */}
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

            {/* Action Buttons */}
            <ScoreTrendCard
              gameType="stroop_naming"
              participantId="2872-1-1-1"
              currentMetrics={{
                accuracy: totalAttempts > 0 ? Math.round((score / totalAttempts) * 100) : 0,
                avgReactionTimeMs: reactionTimesRef.current.length > 0
                  ? Math.round(reactionTimesRef.current.reduce((a, b) => a + b, 0) / reactionTimesRef.current.length)
                  : 0,
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
  },

  // START SCREEN
  startScreen: {
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
    marginBottom: 16,
    textAlign: "center",
  },
  instructionText: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 20,
    paddingHorizontal: 8,
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
    justifyContent: "center",
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
    flex: 1,
    width: "100%",
    alignItems: "center",
    padding: 20,
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
    fontSize: ms(48),
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

  snHowBox:      { backgroundColor: '#F9FAFB', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20 },
  snHowLabel:    { fontSize: 15, fontWeight: '700', color: '#1F2937', marginBottom: 16, textAlign: 'center' },
  snStep:        { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  snStepNum:     { width: 30, height: 30, borderRadius: 15, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  snStepNumText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  snStepText:    { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },
  snInstImg: {
    // width: SCREEN_W - 115,
    width: '100%',
    alignSelf: 'center',
    height: undefined,
    // aspectRatio: 1.625,
    aspectRatio: 360/300,
    // borderRadius: 8,
    borderRadius: 0,
    marginBottom: 20,
  },
  snTipBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  snTipText: {
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 20,
  },
});





