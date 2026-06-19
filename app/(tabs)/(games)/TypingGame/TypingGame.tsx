import { Countdown } from "@/components/Countdown";
import { GameTimer } from "@/components/GameTimer";
import { ScoreTrendCard } from "@/components/ScoreTrendCard";
import { EMPATICA_PARTICIPANT } from "@/lib/empaticaConfig";
import { saveGameResult } from "@/lib/firestore";
import { ms } from '@/lib/scale';
import { useSession } from "@/lib/SessionContext";
import { getRandomSentence } from "@/logic/Sentences";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SCREEN_W = Dimensions.get('window').width;
// const TC_INSTR = require('@/assets/inst_images/TC_instr.jpg');
const TC_INSTR = require('@/assets/ins_images/typing_challenge.png');

export default function TypingChallenge() {
  const router = useRouter();
  const { sessionMode, completeGame, isLastGame, savePartialSession, resetSession } = useSession();
  const inputRef = useRef<TextInput>(null);
  const gameStartTimeRef = useRef<Date | null>(null);
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
  // Refs to read latest values without nested setState
  const correctSentencesRef = useRef(0);
  const totalSentencesRef = useRef(0);
  const totalCharactersRef = useRef(0);
  const correctCharactersRef = useRef(0);
  const totalKeystrokesRef = useRef(0);
  const backspaceCountRef = useRef(0);
  const errorKeystrokesRef = useRef(0);
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
      correctSentencesRef.current += 1;
      setCorrectSentences(correctSentencesRef.current);
    } else {
      const errorsInSentence = userInput.length - correctChars;
      errorKeystrokesRef.current += errorsInSentence;
      setErrorKeystrokes(errorKeystrokesRef.current);
    }

    totalSentencesRef.current += 1;
    setTotalSentences(totalSentencesRef.current);
    correctCharactersRef.current += correctChars;
    setCorrectCharacters(correctCharactersRef.current);
    totalCharactersRef.current += currentSentence.length;
    setTotalCharacters(totalCharactersRef.current);

    // Show feedback briefly, then move to next sentence
    setTimeout(() => {
      generateNewSentence();
    }, 400);
  };

  const startGame = () => {
    setCorrectSentences(0); correctSentencesRef.current = 0;
    setTotalSentences(0); totalSentencesRef.current = 0;
    setTotalCharacters(0); totalCharactersRef.current = 0;
    setCorrectCharacters(0); correctCharactersRef.current = 0;
    setTotalKeystrokes(0); totalKeystrokesRef.current = 0;
    setBackspaceCount(0); backspaceCountRef.current = 0;
    setErrorKeystrokes(0); errorKeystrokesRef.current = 0;
    setGameOver(false);
    setGameStarted(true);
    gameStartTimeRef.current = new Date();
    generateNewSentence();
  };

  const handleGameOver = () => {
    setGameOver(true);
    setGameStarted(false);
    Keyboard.dismiss();

    const endTime = new Date();
    const chars = correctCharactersRef.current;
    const total = totalCharactersRef.current;
    const keystrokes = totalKeystrokesRef.current;
    const metricsPayload = {
      wpm: Math.round((chars / 5) / (60 / 60)),
      accuracy: total > 0 ? Math.round((chars / total) * 100) : 0,
      efficiency: keystrokes > 0 ? Math.round((chars / keystrokes) * 100) : 100,
      correctSentences: correctSentencesRef.current,
      totalSentences: totalSentencesRef.current,
      correctCharacters: chars,
      totalCharacters: total,
      totalKeystrokes: keystrokes,
      backspaceCount: backspaceCountRef.current,
      errorKeystrokes: errorKeystrokesRef.current,
    };
    if (sessionMode === 'full_session') {
      completeGame('typing_game', metricsPayload, gameStartTimeRef.current ?? new Date());
      if (isLastGame()) {
        router.replace('/session-results');
      } else {
        router.replace('/session-transition');
      }
    } else {
      saveGameResult('typing_game', EMPATICA_PARTICIPANT.fullId, gameStartTimeRef.current ?? new Date(), endTime, metricsPayload);
    }
  };

  const handleBackToDashboard = () => {
    if (sessionMode === 'full_session') { savePartialSession(); resetSession(); }
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

  // Render sentence as a single Text so React Native handles word-wrapping
  // naturally — typed portion is dark, remaining portion is gray.
  const renderSentenceWithHighlight = () => {
    const typed = currentSentence.slice(0, userInput.length);
    const remaining = currentSentence.slice(userInput.length);
    return (
      <Text style={styles.sentenceText}>
        <Text style={styles.sentenceTyped}>{typed}</Text>
        <Text style={styles.sentenceRemaining}>{remaining}</Text>
      </Text>
    );
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
        <Text style={styles.headerTitle}>Typing Challenge</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Game Area */}
      <KeyboardAvoidingView
        style={styles.gameArea}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {/* START SCREEN */}
        {!gameStarted && !gameOver && (
          <ScrollView
            contentContainerStyle={styles.startScreen}
            showsVerticalScrollIndicator={false}
          >
            {/* Logo */}
            <View style={styles.iconContainer}>
              <Ionicons name="rocket-outline" size={64} color="#10B981" />
            </View>

            <Text style={styles.instructionTitle}>Typing Challenge Test</Text>
            <Text style={styles.instructionText}>
              Tracks keystroke accuracy and fine motor skills to measure your manual dexterity and focus.
            </Text>

            {/* How it works */}
            <View style={styles.exampleBox}>
              <Text style={styles.exampleLabel}>How it works:</Text>
              {[
                'Type the text shown on the screen.',
                'Type as accurately and quickly as possible within 60 seconds.',
                'Capitalization and punctuation are scored.',
              ].map((text, i) => (
                <View key={i} style={styles.tcStep}>
                  <View style={styles.tcStepNum}>
                    <Text style={styles.tcStepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.tcStepText}>{text}</Text>
                </View>
              ))}
            </View>

            {/* Step illustration */}
            <Image source={TC_INSTR} style={styles.tcInstImg} resizeMode="contain" />

            {/* Caps/punctuation warning */}
            <View style={styles.capsWarning}>
              <Ionicons name="alert-circle" size={20} color="#92400E" />
              <Text style={styles.capsWarningText}>
                Capitalization and punctuation are scored — type exactly as shown.
              </Text>
            </View>

            {/* Tip */}
            <View style={styles.autocorrectWarning}>
              <Ionicons name="information-circle" size={20} color="#10B981" />
              <Text style={styles.autocorrectWarningText}>
                Turn off Auto-correction and Next-word suggestions in your keyboard settings before starting the test.
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
          <View style={styles.playScreen}>
            {/* ── Top: stats + sentence ── */}
            <View style={styles.playTop}>
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
                {renderSentenceWithHighlight()}
              </View>
            </View>

            {/* ── Bottom: input + submit — always visible above keyboard ── */}
            <View style={styles.playBottom}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={userInput}
                onChangeText={(text) => {
                  if (text.length < userInput.length) {
                    setBackspaceCount(backspaceCount + 1);
                  } else {
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
                spellCheck={false}
                importantForAutofill="no"
                multiline
              />

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
            </View>
          </View>
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
              <Text style={[styles.scoreValue, { fontSize: ms(48) }]}>
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
            <ScoreTrendCard
              gameType="typing_game"
              participantId="2872-1-1-1"
              currentMetrics={{
                wpm: Math.round(correctCharacters / 5),
                accuracy: totalCharacters > 0 ? Math.round((correctCharacters / totalCharacters) * 100) : 0,
                efficiency: totalKeystrokes > 0 ? Math.round((correctCharacters / totalKeystrokes) * 100) : 100,
                backspaceCount,
                errorKeystrokes,
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
      </KeyboardAvoidingView>
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
    // paddingHorizontal: 40,
    paddingHorizontal: 20,
    // paddingVertical: 20,
    paddingBottom: 40
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
    justifyContent: "center",
    backgroundColor: "#10B981",
    paddingVertical: 16,
    // paddingHorizontal: 32,
    width: '100%',
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
    padding: 20,
    paddingBottom: 12,
  },
  playTop: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
  },
  playBottom: {
    flexShrink: 0,     // never compress — Submit is always fully visible
    width: '100%',
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginBottom: 12,
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
    marginBottom: 10,
    fontStyle: "italic",
  },
  sentenceContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
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
  sentenceText: {
    fontSize: 19,
    fontWeight: "600",
    lineHeight: 28,
    color: "#9CA3AF",
  },
  sentenceTyped: {
    color: "#1F2937",
  },
  sentenceRemaining: {
    color: "#9CA3AF",
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
    marginBottom: 12,
    minHeight: 80,
    textAlignVertical: "top",
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
    marginBottom: 8,
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
    // paddingHorizontal: 40,
    paddingHorizontal: 20,
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
    fontSize: ms(56),
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
  capsWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    width: "100%",
  },
  capsWarningText: {
    flex: 1,
    fontSize: 13,
    color: "#92400E",
    lineHeight: 19,
    fontWeight: "600",
  },
  autocorrectWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: "#FCD34D",
    width: "100%",
  },
  autocorrectWarningText: {
    flex: 1,
    fontSize: 13,
    color: "#92400E",
    lineHeight: 19,
  },

  tcStep:        { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  tcStepNum:     { width: 30, height: 30, borderRadius: 15, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  tcStepNumText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  tcStepText:    { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },
  tcInstImg: {
    // width: SCREEN_W,
    width: '100%',
    // marginHorizontal: -20,
    height: undefined,
    // aspectRatio: 1.25,
    aspectRatio: 360/290,
    // borderRadius: 8,
    borderRadius: 0,
    marginBottom: 16,
  },
});





