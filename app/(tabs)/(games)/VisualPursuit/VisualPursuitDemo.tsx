import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const EYE_VERTICAL_ANIMATION = require('@/assets/animation/eyeverticle_demo.json');
const EYE_LANDSCAPE_ANIMATION = require('@/assets/animation/eyelandscape_demo.json');

type EyeAnimationBoxProps = {
  source: any;
  mirrored?: boolean;
  roundNumber: number;
  eyeLabel: string;
  cameraHint?: string;
};

function EyeAnimationBox({ source, mirrored = false, roundNumber, eyeLabel, cameraHint }: EyeAnimationBoxProps) {
  const [hasStarted, setHasStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const lottieRef = useRef<LottieView>(null);

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
    <View style={styles.eyeColumn}>
      <View style={styles.roundBadge}>
        <Text style={styles.roundBadgeText}>Round</Text>
        <View style={styles.roundBadgeNum}>
          <Text style={styles.roundBadgeNumText}>{roundNumber}</Text>
        </View>
      </View>

      <Pressable style={styles.animationBox} onPress={handlePress}>
        <LottieView
          ref={lottieRef}
          source={source}
          style={[styles.lottie, mirrored && styles.mirrored]}
          progress={hasStarted ? undefined : 0.5}
          loop
          autoPlay={false}
        />

        {showPlayButton && (
          <View style={styles.playButtonOverlay}>
            <View style={styles.playButtonGlow} />
            <Ionicons name="play-circle" size={40} color="rgba(255,255,255,0.95)" />
          </View>
        )}
      </Pressable>

      <Text style={styles.eyeLabel}>{eyeLabel}</Text>
      {cameraHint ? (
        <Text style={styles.cameraHintText}>{cameraHint}</Text>
      ) : null}
    </View>
  );
}

export default function VisualPursuitDemo() {
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

      <View style={styles.row}>
        <EyeAnimationBox
          source={EYE_VERTICAL_ANIMATION}
          roundNumber={1}
          eyeLabel="Left eye is the test eye"
        />
        <EyeAnimationBox
          source={EYE_VERTICAL_ANIMATION}
          mirrored
          roundNumber={2}
          eyeLabel="Right eye is the test eye"
        />
      </View>

      <View style={[styles.row, styles.lastRow]}>
        <EyeAnimationBox
          source={EYE_LANDSCAPE_ANIMATION}
          roundNumber={3}
          eyeLabel="Left eye is the test eye"
          cameraHint="Camera: left side"
        />
        <EyeAnimationBox
          source={EYE_LANDSCAPE_ANIMATION}
          mirrored
          roundNumber={4}
          eyeLabel="Right eye is the test eye"
          cameraHint="Camera: right side"
        />
      </View>
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
    backgroundColor: '#6366F1',
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
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  lastRow: {
    marginBottom: 0,
  },
  eyeColumn: {
    flex: 1,
  },
  roundBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    gap: 6,
    marginBottom: 8,
  },
  roundBadgeNum: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBadgeNumText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  roundBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6366F1',
    letterSpacing: 0.3,
  },
  eyeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 15,
  },
  cameraHintText: {
    fontSize: 10,
    color: '#6366F1',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
  animationBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  lottie: {
    width: '100%',
    height: '100%',
  },
  mirrored: {
    transform: [{ scaleX: -1 }],
  },
  playButtonOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.25)',
  },
  playButtonGlow: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
});