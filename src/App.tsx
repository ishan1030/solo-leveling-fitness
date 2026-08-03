import React, { useEffect, useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { palette } from './design/tokens';
import { CalibrationResumeScreen, CalibrationScreen } from './screens/Calibration';
import { HomeScreen } from './screens/Home';
import { RankCardScreen } from './screens/RankCard';
import { RevealScreen } from './screens/Reveal';
import { SessionScreen, SessionSummaryScreen } from './screens/Session';
import { useApp } from './state/store';

/**
 * §4: "App opens directly into CALIBRATION. No splash carousel. No 'welcome!'
 * No sign-up wall."
 *
 * Routing is a phase switch rather than a navigator stack, because the app has
 * no back-navigable history before the reveal — going "back" from calibration
 * would mean going back to nothing. Post-reveal screens use local state for the
 * session flow, which keeps the whole first-run path free of navigation
 * dependencies and measurably faster to first frame.
 */

type PostRevealScreen = 'home' | 'session' | 'summary' | 'card';

export default function App() {
  const phase = useApp((s) => s.phase);
  const startSession = useApp((s) => s.startSession);
  const applyDecayIfDue = useApp((s) => s.applyDecayIfDue);
  const [screen, setScreen] = useState<PostRevealScreen>('home');

  // §5: decay is evaluated on open, never on a background timer.
  useEffect(() => {
    if (phase === 'ACTIVE') applyDecayIfDue();
  }, [phase, applyDecayIfDue]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={palette.base} />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.root}>
          {phase === 'CALIBRATION' && <CalibrationScreen />}
          {phase === 'CALIBRATION_ABANDONED' && <CalibrationResumeScreen />}
          {phase === 'REVEAL' && <RevealScreen />}

          {phase === 'ACTIVE' && screen === 'home' && (
            <HomeScreen
              onStartSession={() => {
                // Verification is resolved by the check-in flow; an unscanned
                // session logs as SELF_REPORTED and simply does not lift the cap.
                startSession('SELF_REPORTED', null);
                setScreen('session');
              }}
            />
          )}
          {phase === 'ACTIVE' && screen === 'session' && (
            <SessionScreen onDone={() => setScreen('summary')} />
          )}
          {phase === 'ACTIVE' && screen === 'summary' && (
            <SessionSummaryScreen onDone={() => setScreen('home')} />
          )}
          {phase === 'ACTIVE' && screen === 'card' && (
            <RankCardScreen onDone={() => setScreen('home')} />
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.base,
  },
});
