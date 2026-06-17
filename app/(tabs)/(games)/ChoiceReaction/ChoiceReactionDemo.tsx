import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const DEMO_ANIMATION = require('@/assets/animation/choice_reaction_demo.json');

export function ChoiceReactionDemo() {
  const [hasStarted, setHasStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const lottieRef = useRef<LottieView>(null);

  // 等待状态切换完成、progress 受控属性变为 undefined 之后，再调用 play()，
  // 避免和 progress 属性切换之间的时序竞争导致动画消失/卡死。
  useEffect(() => {
    if (hasStarted) {
      lottieRef.current?.play();
    }
  }, [hasStarted]);

  const handlePress = () => {
    if (!hasStarted) {
      setIsPlaying(true);
      setHasStarted(true);
      return;
    }

    if (isPlaying) {
      lottieRef.current?.pause();
      setIsPlaying(false);
    } else {
      lottieRef.current?.resume();
      setIsPlaying(true);
    }
  };

  const showPlayButton = !isPlaying;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Ionicons name="sparkles" size={14} color="#FFFFFF" />
        </View>
        <View style={styles.headerTextGroup}>
          <Text style={styles.labelText}>Quick Demo</Text>
          <Text style={styles.subLabelText}>A quick preview before you start</Text>
        </View>
      </View>

      <Pressable style={styles.animationBox} onPress={handlePress}>
        <LottieView
          ref={lottieRef}
          source={DEMO_ANIMATION}
          style={styles.lottie}
          progress={hasStarted ? undefined : 0.5}
          loop
          autoPlay={false}
        />

        {showPlayButton && (
          <View style={styles.playButtonOverlay}>
            <View style={styles.playButtonGlow} />
            <Ionicons name="play-circle" size={60} color="rgba(255,255,255,0.95)" />
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextGroup: {
    flex: 1,
  },
  labelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  subLabelText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 1,
  },
  animationBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  lottie: {
    width: '100%',
    height: '100%',
  },
  playButtonOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.25)',
  },
  playButtonGlow: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
});