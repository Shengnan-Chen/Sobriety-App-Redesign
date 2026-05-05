import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface CountdownProps {
  onComplete: () => void;
}

export function Countdown({ onComplete }: CountdownProps) {
  const [step, setStep] = useState<'Ready' | '3' | '2' | '1' | 'Go!'>('Ready');

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep('3'),   900),
      setTimeout(() => setStep('2'),  1900),
      setTimeout(() => setStep('1'),  2900),
      setTimeout(() => setStep('Go!'), 3900),
      setTimeout(() => onComplete(),   4600),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const isGo = step === 'Go!';
  const isNum = step === '3' || step === '2' || step === '1';

  return (
    <View style={styles.overlay}>
      <Text style={[styles.label, isGo && styles.goLabel, isNum && styles.numLabel]}>
        {step}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  label: {
    fontSize: 52,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  numLabel: {
    fontSize: 96,
    color: '#FFFFFF',
  },
  goLabel: {
    fontSize: 72,
    color: '#10B981',
  },
});
