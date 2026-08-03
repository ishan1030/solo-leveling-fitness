import React, { useEffect, useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { palette } from './design/tokens';
import { TabBar, type Tab } from './nav/TabBar';
import { requiresMedicalStop } from './engine/types';
import { CalibrationResumeScreen, CalibrationScreen } from './screens/Calibration';
import { CheckInScreen } from './screens/CheckIn';
import { HomeScreen } from './screens/Home';
import { LadderScreen } from './screens/Ladder';
import { NewPrScreen, TierUpScreen } from './screens/Moments';
import { ProfileScreen } from './screens/Profile';
import { RankCardScreen } from './screens/RankCard';
import { RevealScreen } from './screens/Reveal';
import { LogInjuryScreen, MedicalStopScreen, SettingsScreen } from './screens/Safety';
import { SeasonScreen } from './screens/Season';
import { SessionScreen, SessionSummaryScreen } from './screens/Session';
import { SocialScreen } from './screens/Social';
import { useApp } from './state/store';
import { useWorld } from './state/world';

/**
 * §4: "App opens directly into CALIBRATION. No splash carousel. No 'welcome!'
 * No sign-up wall."
 *
 * Routing is a phase switch plus a tab, not a navigator stack. The first-run
 * path has no back-navigable history — going "back" from calibration would mean
 * going back to nothing — and keeping the whole cold-open path free of a
 * navigation library is measurably faster to first frame, which is what §4's
 * 90-second target is actually made of.
 *
 * Anything presented over a tab (a session, a moment screen, a safety screen) is
 * a `modal`: it owns the surface until it is dismissed, and it is the only place
 * in the app where a screen can sit on top of another.
 */

type Modal =
  | { kind: 'none' }
  | { kind: 'session' }
  | { kind: 'summary' }
  | { kind: 'checkin' }
  | { kind: 'card' }
  | { kind: 'settings' }
  | { kind: 'log_injury' }
  | { kind: 'medical_stop' }
  | { kind: 'tier_up'; from: Parameters<typeof TierUpScreen>[0]['from']; to: Parameters<typeof TierUpScreen>[0]['to'] }
  | { kind: 'new_pr'; movement: string; value: number; unit: string; previousBest: number | null };

export default function App() {
  const phase = useApp((s) => s.phase);
  const profile = useApp((s) => s.profile);
  const startSession = useApp((s) => s.startSession);
  const applyDecayIfDue = useApp((s) => s.applyDecayIfDue);
  const seedWorld = useWorld((s) => s.seedWorld);

  const [tab, setTab] = useState<Tab>('home');
  const [modal, setModal] = useState<Modal>({ kind: 'none' });

  useEffect(() => {
    if (phase !== 'ACTIVE') return;
    // §5: decay is evaluated on open, never on a background timer.
    applyDecayIfDue();
    seedWorld();
  }, [phase, applyDecayIfDue, seedWorld]);

  // §21: a reported cardiac or syncope history surfaces the stop state on open,
  // once, rather than waiting for the operator to find it.
  const medicalStop = profile ? requiresMedicalStop(profile.readiness) : false;
  const [stopAcknowledged, setStopAcknowledged] = useState(false);

  useEffect(() => {
    if (phase === 'ACTIVE' && medicalStop && !stopAcknowledged) {
      setModal({ kind: 'medical_stop' });
    }
  }, [phase, medicalStop, stopAcknowledged]);

  const close = () => setModal({ kind: 'none' });

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={palette.base} />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.root}>
          {/* ---------------- First run ---------------- */}
          {phase === 'CALIBRATION' && <CalibrationScreen />}
          {phase === 'CALIBRATION_ABANDONED' && <CalibrationResumeScreen />}
          {phase === 'REVEAL' && <RevealScreen />}

          {/* ---------------- Modals ---------------- */}
          {phase === 'ACTIVE' && modal.kind === 'session' && (
            <SessionScreen onDone={() => setModal({ kind: 'summary' })} />
          )}
          {phase === 'ACTIVE' && modal.kind === 'summary' && (
            <SessionSummaryScreen onDone={close} />
          )}
          {phase === 'ACTIVE' && modal.kind === 'checkin' && (
            <CheckInScreen
              onDone={() => {
                // A check-in that started a session lands in the session, not
                // back on the tab that opened it.
                const active = useApp.getState().activeSession;
                setModal(active ? { kind: 'session' } : { kind: 'none' });
              }}
            />
          )}
          {phase === 'ACTIVE' && modal.kind === 'card' && <RankCardScreen onDone={close} />}
          {phase === 'ACTIVE' && modal.kind === 'settings' && (
            <SettingsScreen
              onLogInjury={() => setModal({ kind: 'log_injury' })}
              onMedicalInfo={() => setModal({ kind: 'medical_stop' })}
            />
          )}
          {phase === 'ACTIVE' && modal.kind === 'log_injury' && (
            <LogInjuryScreen onDone={close} />
          )}
          {phase === 'ACTIVE' && modal.kind === 'medical_stop' && (
            <MedicalStopScreen
              onDismiss={() => {
                setStopAcknowledged(true);
                close();
              }}
            />
          )}
          {phase === 'ACTIVE' && modal.kind === 'tier_up' && (
            <TierUpScreen from={modal.from} to={modal.to} onDone={close} />
          )}
          {phase === 'ACTIVE' && modal.kind === 'new_pr' && (
            <NewPrScreen
              movement={modal.movement}
              value={modal.value}
              unit={modal.unit}
              previousBest={modal.previousBest}
              onDone={close}
            />
          )}

          {/* ---------------- Tabs ---------------- */}
          {phase === 'ACTIVE' && modal.kind === 'none' && (
            <>
              <View style={styles.root}>
                {tab === 'home' && (
                  <HomeScreen
                    onStartSession={() => {
                      // Verification is resolved by the check-in flow. An
                      // unscanned session logs as SELF_REPORTED and simply does
                      // not lift the COBALT cap.
                      startSession('SELF_REPORTED', null);
                      setModal({ kind: 'session' });
                    }}
                    onCheckIn={() => setModal({ kind: 'checkin' })}
                    onOpenSettings={() => setModal({ kind: 'settings' })}
                  />
                )}
                {tab === 'ladder' && <LadderScreen />}
                {tab === 'social' && <SocialScreen />}
                {tab === 'season' && <SeasonScreen />}
                {tab === 'profile' && (
                  <ProfileScreen
                    onShowRankCard={() => setModal({ kind: 'card' })}
                    onCheckIn={() => setModal({ kind: 'checkin' })}
                  />
                )}
              </View>

              <TabBar
                active={tab}
                onChange={setTab}
                alertTab={medicalStop ? 'profile' : null}
              />
            </>
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
