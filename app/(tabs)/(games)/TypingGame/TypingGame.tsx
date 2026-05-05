import { Countdown } from "@/components/Countdown";
import { GameTimer } from "@/components/GameTimer";
import { getRandomSentence } from "@/logic/Sentences";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TypingChallenge() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const [countdown, setCountdown] = useState(false);

  const [currentSentence, setCurrentSentence] = useState("");
  const [userInput, setUserInput] = useState("");
  const [correctSentences, setCorrectSentences] = useState(0);
  const [totalSentences, setTotalSentences] = useState(0);
  const [totalCharacters, setTotalCharacters] = useState(0);
  const [correctCharacters, setCorrectCharacters] = useState(0);
  const [totalKeystrokes, setTotalKeystrokes] = useState(0);
  const [backspaceCount, setBackspaceCount] = useState(0);
  const [errorKeystrokes, setErrorKeystrokes] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    if (gameStarted && !gameOver) {
      inputRef.current?.focus();
    }
  }, [gameStarted, gameOver, currentSentence]);

  const generateNewSentence = () => {
    setCurrentSentence(getRandomSentence());
    setUserInput("");
  };

  const calculateAccuracy = (typed: string, target: string): number => {
    let correct = 0;
    const minLength = Math.min(typed.length, target.length);

    for (let i = 0; i < minLength; i++) {
      if (typed[i] === target[i]) {
        correct++;
      }
    }
    return correct;
  };

  const handleSubmit = () => {
    if (userInput.trim() === "") return;

    const isExactMatch = userInput === currentSentence;
    const correctChars = calculateAccuracy(userInput, currentSentence);

    if (isExactMatch) {
      setCorrectSentences(correctSentences + 1);
    } else {
      const errorsInSentence = userInput.length - correctChars;
      setErrorKeystrokes(errorKeystrokes + errorsInSentence);
    }

    setTotalSentences(totalSentences + 1);
    setCorrectCharacters(correctCharacters + correctChars);
    setTotalCharacters(totalCharacters + currentSentence.length);

    // Show feedback briefly, then move to next sentence
    setTimeout(() => {
      generateNewSentence();
    }, 400);
  };

  const startGame = () => {
    setCorrectSentences(0);
    setTotalSentences(0);
    setTotalCharacters(0);
    setCorrectCharacters(0);
    setTotalKeystrokes(0);
    setBackspaceCount(0);
    setErrorKeystrokes(0);
    setGameOver(false);
    setGameStarted(true);
    generateNewSentence();
  };

  const handleGameOver = () => {
    setGameOver(true);
    setGameStarted(false);
    Keyboard.dismiss();
  };

  const handleBackToDashboard = () => {
    setCorrectSentences(0);
    setTotalSentences(0);
    setTotalCharacters(0);
    setCorrectCharacters(0);
    setTotalKeystrokes(0);
    setBackspaceCount(0);
    setErrorKeystrokes(0);
    setGameOver(false);
    setGameStarted(false);
    setUserInput("");
    setCurrentSentence("");
    router.replace("/(tabs)/dashboard");
  };

  const calculateWPM = () => {
    // WPM = (characters typed / 5) / minutes
    // Average word = 5 characters
    const timeInMinutes = 60 / 60; // 60 seconds = 1 minute
    const words = correctCharacters / 5;
    return Math.round(words / timeInMinutes);
  };

  const calculateOverallAccuracy = () => {
    if (totalCharacters === 0) return 0;
    return Math.round((correctCharacters / totalCharacters) * 100);
  };

  const calculateEfficiency = () => {
    if (totalKeystrokes === 0) return 100;
    return Math.round((correctCharacters / totalKeystrokes) * 100);
  };

  const getEfficiencyRating = () => {
    const efficiency = calculateEfficiency();
    if (efficiency >= 90) return { text: "Excellent", color: "#10B981" };
    if (efficiency >= 75) return { text: "Good", color: "#F59E0B" };
    if (efficiency >= 60) return { text: "Fair", color: "#EF4444" };
    return { text: "Needs Improvement", color: "#EF4444" };
  };

  // Helper function to highlight typed characters
  const renderSentenceWithHighlight = () => {
    return currentSentence.split("").map((char, index) => {
      let color = "#6B7280"; // Default gray

      if (index < userInput.length) {
        color = "#1F2937";
      }

      return (
        <Text key={index} style={{ color, fontSize: 20, fontWeight: "600" }}>
          {char}
        </Text>
      );
    });
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
        <Text style={styles.headerTitle}>Typing Challenge</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Game Area */}
      <View style={styles.gameArea}>
        {/* START SCREEN */}
        {!gameStarted && !gameOver && (
          <ScrollView
            contentContainerStyle={styles.startScreen}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="rocket-outline" size={64} color="#10B981" />
            </View>
            <Text style={styles.instructionTitle}>Typing Speed Test</Text>
            <Text style={styles.instructionText}>
              Type the sentences that appear as quickly and accurately as
              possible. Press <Text style={styles.boldText}>Submit</Text> after
              each sentence.
            </Text>

            {/* Example */}
            <View style={styles.exampleBox}>
              <Text style={styles.exampleLabel}>Example:</Text>
              <Text style={styles.exampleSentence}>
                The quick brown fox jumps over the lazy dog.
              </Text>
              <Text style={styles.exampleText}>
                Type the sentence exactly as shown, including punctuation
              </Text>
            </View>

            <TouchableOpacity style={styles.startButton} onPress={() => setCountdown(true)}>
              <Text style={styles.startButtonText}>Begin Test</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* PLAY SCREEN */}
        {gameStarted && !gameOver && (
          <ScrollView
            contentContainerStyle={styles.playScreen}
            showsVerticalScrollIndicator={false}
          >
            {/* Timer & Score */}
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <Ionicons name="time-outline" size={20} color="#4F46E5" />
                <GameTimer time={60} onTimeUp={handleGameOver} />
              </View>
              <View style={styles.statCard}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color="#10B981"
                />
                <Text style={styles.statText}>{correctSentences}</Text>
              </View>
            </View>

            {/* Instruction reminder */}
            <Text style={styles.reminderText}>Type the sentence below</Text>

            {/* Current Sentence Display with Live Highlighting */}
            <View style={styles.sentenceContainer}>
              <View style={styles.sentenceTextContainer}>
                {renderSentenceWithHighlight()}
              </View>
            </View>

            {/* Input Field */}
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={userInput}
              onChangeText={(text) => {
                // Track backspace
                if (text.length < userInput.length) {
                  setBackspaceCount(backspaceCount + 1);
                } else {
                  // Track keystroke
                  setTotalKeystrokes(totalKeystrokes + 1);
                }
                setUserInput(text);
              }}
              onSubmitEditing={handleSubmit}
              placeholder="Start typing..."
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              multiline
            />

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                userInput.trim() === "" && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={userInput.trim() === ""}
            >
              <Text style={styles.submitButtonText}>Submit</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* RESULT SCREEN */}
        {gameOver && (
          <ScrollView
            contentContainerStyle={styles.resultScreen}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[styles.iconContainer, { backgroundColor: "#D1FAE5" }]}
            >
              <Ionicons name="checkmark-circle" size={64} color="#10B981" />
            </View>
            <Text style={styles.resultTitle}>Game Finished</Text>
            <Text style={styles.resultSubtitle}>
              Your typing test results are shown below.
            </Text>

            {/* Typing Speed Card */}
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Typing Speed</Text>
              <Text style={styles.scoreValue}>{calculateWPM()}</Text>
              <Text style={styles.scoreUnit}>WPM</Text>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Accuracy</Text>
                  <Text style={styles.statItemValue}>
                    {calculateOverallAccuracy()}%
                  </Text>
                </View>
                <View style={styles.statItemDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statItemLabel}>Sentences</Text>
                  <Text style={styles.statItemValue}>
                    {correctSentences}/{totalSentences}
                  </Text>
                </View>
              </View>
            </View>

            {/* Typing Efficiency Card */}
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Typing Efficiency</Text>
              <Text style={[styles.scoreValue, { fontSize: 48 }]}>
                {calculateEfficiency()}%
              </Text>
              <Text
                style={[
                  styles.efficiencyRating,
                  { color: getEfficiencyRating().color },
                ]}
              >
                {getEfficiencyRating().text}
              </Text>

              <View style={styles.detailsGrid}>
                <View style={styles.detailItem}>
                  <Ionicons name="create-outline" size={20} color="#6B7280" />
                  <Text style={styles.detailLabel}>Total Keystrokes</Text>
                  <Text style={styles.detailValue}>{totalKeystrokes}</Text>
                </View>

                <View style={styles.detailItem}>
                  <Ionicons
                    name="backspace-outline"
                    size={20}
                    color="#EF4444"
                  />
                  <Text style={styles.detailLabel}>Backspaces</Text>
                  <Text style={styles.detailValue}>{backspaceCount}</Text>
                </View>

                <View style={styles.detailItem}>
                  <Ionicons
                    name="close-circle-outline"
                    size={20}
                    color="#F59E0B"
                  />
                  <Text style={styles.detailLabel}>Errors</Text>
                  <Text style={styles.detailValue}>{errorKeystrokes}</Text>
                </View>

                <View style={styles.detailItem}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={20}
                    color="#10B981"
                  />
                  <Text style={styles.detailLabel}>Correct Chars</Text>
                  <Text style={styles.detailValue}>{correctCharacters}</Text>
                </View>
              </View>
            </View>

            {/* Action Buttons */}
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
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingVertical: 20,
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
    marginBottom: 12,
  },
  exampleSentence: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 12,
    textAlign: "center",
  },
  exampleText: {
    fontSize: 14,
    color: "#6B7280",
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
    flexGrow: 1,
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
    paddingVertical: 10,
    paddingHorizontal: 20,
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
  sentenceContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    width: "100%",
  },
  sentenceContainerCorrect: {
    borderColor: "#10B981",
    backgroundColor: "#D1FAE5",
  },
  sentenceContainerIncorrect: {
    borderColor: "#EF4444",
    backgroundColor: "#FEE2E2",
  },
  sentenceTextContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 16,
    color: "#1F2937",
    width: "100%",
    marginBottom: 20,
    minHeight: 80,
    textAlignVertical: "top",
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#10B981",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginBottom: 20,
  },
  submitButtonDisabled: {
    backgroundColor: "#9CA3AF",
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginRight: 8,
  },
  progressText: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 10,
  },

  // RESULT SCREEN
  resultScreen: {
    flexGrow: 1,
    justifyContent: "center",
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
    color: "#10B981",
    marginBottom: 0,
  },
  scoreUnit: {
    fontSize: 16,
    color: "#6B7280",
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
  efficiencyRating: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 20,
  },
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between", // ✅ Add this
    width: "100%",
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  detailItem: {
    width: "48%", // ✅ Changed from 47% to 48%
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12, // ✅ Add spacing between rows
  },
  detailLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 8,
    marginBottom: 4,
    textAlign: "center",
  },
  detailValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
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
});
