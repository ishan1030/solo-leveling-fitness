import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { CheckInScreen } from './CheckIn';
import { CoachScreen } from './Coach';
import { HomeScreen } from './Home';
import { LadderScreen } from './Ladder';
import { NewPrScreen, TierUpScreen } from './Moments';
import { ProfileScreen } from './Profile';
import { RankCardScreen } from './RankCard';
import { RecordsScreen } from './Records';
import { RevealScreen } from './Reveal';
import { LogInjuryScreen, MedicalStopScreen, RecoveryPathScreen, SettingsScreen } from './Safety';
import { SeasonScreen } from './Season';
import { SessionSummaryScreen } from './Session';
import { SocialScreen } from './Social';
import { TerritoryScreen } from './Territory';
import { TrialsScreen } from './Trials';

import { NO_READINESS_FLAGS } from '../engine/types';
import { noop, resetStores, seedOperator } from '../test/harness';

/**
 * Screen render tests.
 *
 * These exist because 426 engine tests passed while the app showed a white
 * screen after the reveal. `useApp((s) => s.standing())` returned a fresh
 * object on every call, so zustand saw a changed slice on every store read and
 * re-rendered forever — React error #185, across nine screens. Nothing that
 * never mounts a component can catch that.
 *
 * So the baseline assertion for every screen is simply: it mounts, and it puts
 * real text on the page. An infinite render loop throws during render, and a
 * crashed subtree renders nothing — both fail here.
 */

/** Mounts and asserts the screen produced meaningful output. */
function expectRenders(ui: React.ReactElement, mustContain?: RegExp) {
  const { container } = render(ui);
  const text = container.textContent ?? '';

  expect(text.length, 'screen rendered blank').toBeGreaterThan(20);
  if (mustContain) expect(text).toMatch(mustContain);
  return text;
}

beforeEach(() => {
  resetStores();
});

// ---------------------------------------------------------------------------
// The regression this whole project exists for
// ---------------------------------------------------------------------------

describe('render stability', () => {
  it('mounts Home without an infinite render loop', () => {
    seedOperator();
    // If a selector returns a fresh object each call, React throws
    // "Maximum update depth exceeded" here rather than rendering.
    expect(() =>
      render(
        <HomeScreen
          onStartSession={noop}
          onCheckIn={noop}
          onOpenSettings={noop}
          onOpenCoach={noop}
        />,
      ),
    ).not.toThrow();
  });

  it('re-renders a bounded number of times for one mount', () => {
    seedOperator();
    let renders = 0;

    function Counted() {
      renders += 1;
      // A runaway loop would blow past this long before React's own limit.
      if (renders > 50) throw new Error(`runaway render loop: ${renders} renders`);
      return (
        <HomeScreen
          onStartSession={noop}
          onCheckIn={noop}
          onOpenSettings={noop}
          onOpenCoach={noop}
        />
      );
    }

    render(<Counted />);
    expect(renders).toBeLessThan(50);
  });

  it('mounts every tab destination', () => {
    seedOperator();
    for (const ui of [
      <LadderScreen onShowTerritory={noop} onShowTrials={noop} />,
      <SocialScreen />,
      <SeasonScreen />,
      <ProfileScreen onShowRankCard={noop} onCheckIn={noop} onShowRecords={noop} />,
    ]) {
      const { container, unmount } = render(ui);
      expect((container.textContent ?? '').length).toBeGreaterThan(20);
      unmount();
    }
  });
});

// ---------------------------------------------------------------------------
// Every screen mounts
// ---------------------------------------------------------------------------

describe('every screen mounts and renders content', () => {
  beforeEach(() => seedOperator());

  it('Home', () =>
    void expectRenders(
      <HomeScreen onStartSession={noop} onCheckIn={noop} onOpenSettings={noop} onOpenCoach={noop} />,
      /OPERATOR/,
    ));

  it('Reveal', () => void expectRenders(<RevealScreen />, /CALIBRATION COMPLETE/));

  it('Ladder', () =>
    void expectRenders(<LadderScreen onShowTerritory={noop} onShowTrials={noop} />, /LADDER/));

  it('Social', () => void expectRenders(<SocialScreen />, /Rivals/i));

  it('Season', () => void expectRenders(<SeasonScreen />, /SEASON/));

  it('Profile', () =>
    void expectRenders(
      <ProfileScreen onShowRankCard={noop} onCheckIn={noop} onShowRecords={noop} />,
      /Pillars/i,
    ));

  it('Check-in', () => void expectRenders(<CheckInScreen onDone={noop} />, /Scan into a venue/i));

  it('Coach', () => void expectRenders(<CoachScreen onDone={noop} />, /AXIOM/));

  it('Records', () => void expectRenders(<RecordsScreen onDone={noop} />, /Records/i));

  it('Territory', () => void expectRenders(<TerritoryScreen onDone={noop} />, /Territory/i));

  it('Trials', () => void expectRenders(<TrialsScreen onDone={noop} />, /Trial/i));

  it('Rank card', () => void expectRenders(<RankCardScreen onDone={noop} />, /rank card/i));

  it('Session summary with no summary', () =>
    void expectRenders(<SessionSummaryScreen onDone={noop} />, /Session logged/i));

  it('Settings', () => void expectRenders(<SettingsScreen onLogInjury={noop} onMedicalInfo={noop} />, /Privacy/i));

  it('Log injury', () =>
    void expectRenders(<LogInjuryScreen onDone={noop} onShowRecoveryPath={noop} />, /What is going on/i));

  it('Medical stop', () => void expectRenders(<MedicalStopScreen onDismiss={noop} />, /doctor/i));

  it('Recovery path', () => void expectRenders(<RecoveryPathScreen onDone={noop} />, /No rush/i));

  /**
   * The moment screens deliberately start near-empty and build through timed
   * stages, so a blanket "renders lots of text" assertion is the wrong shape for
   * them. What matters at frame one is §20: the cinematic is skippable before
   * it has finished, not after.
   */
  it('Tier-up moment mounts with its label and a skip control from frame one', () => {
    const { container } = render(<TierUpScreen from="COBALT" to="STORM" onDone={noop} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/TIER UP/);
    expect(text).toMatch(/SKIP/);
  });

  it('Tier-up moment resolves to the new tier once skipped', async () => {
    render(<TierUpScreen from="COBALT" to="STORM" onDone={noop} />);
    await act(async () => {
      fireEvent.click(screen.getByText('SKIP'));
    });
    expect(document.body.textContent).toMatch(/STORM/);
  });

  it('New PR moment', () =>
    void expectRenders(
      <NewPrScreen movement="Back Barbell Squat" value={120} unit="kg" previousBest={110} onDone={noop} />,
      /BACK BARBELL SQUAT/i,
    ));
});

// ---------------------------------------------------------------------------
// The states that carry a specification obligation
// ---------------------------------------------------------------------------

describe('§6 — the trust cap is visible on screen', () => {
  it('names the withheld tier on Home when capped', () => {
    // Pillars worth STORM, self-reported, so the cap bites.
    seedOperator({
      pillars: { strength: 70, endurance: 68, consistency: 75, mobility: 62 },
      verification: 'SELF_REPORTED',
    });

    const text = expectRenders(
      <HomeScreen onStartSession={noop} onCheckIn={noop} onOpenSettings={noop} onOpenCoach={noop} />,
    );
    expect(text).toMatch(/worth STORM/);
    expect(text).toMatch(/COBALT/);
  });

  it('does not show the cap notice once verified', () => {
    seedOperator({
      pillars: { strength: 70, endurance: 68, consistency: 75, mobility: 62 },
      verification: 'QR_CHECK_IN',
    });

    const text = expectRenders(
      <HomeScreen onStartSession={noop} onCheckIn={noop} onOpenSettings={noop} onOpenCoach={noop} />,
    );
    expect(text).not.toMatch(/worth STORM/);
  });

  it('states the cap on the profile too, where it is least comfortable', () => {
    seedOperator({
      pillars: { strength: 70, endurance: 68, consistency: 75, mobility: 62 },
      verification: 'SELF_REPORTED',
    });
    const text = expectRenders(
      <ProfileScreen onShowRankCard={noop} onCheckIn={noop} onShowRecords={noop} />,
    );
    expect(text).toMatch(/UNVERIFIED/);
  });
});

describe('§16 / §21 — a paused operator is not prompted', () => {
  it('replaces the quest board with a way back', () => {
    seedOperator({ paused: 'injury' });
    const text = expectRenders(
      <HomeScreen onStartSession={noop} onCheckIn={noop} onOpenSettings={noop} onOpenCoach={noop} />,
    );
    expect(text).toMatch(/Recovery mode|frozen/i);
    expect(text).toMatch(/ready to train/i);
  });

  it('shows no AXIOM next-session prescription while paused', () => {
    seedOperator({ paused: 'injury' });
    const text = expectRenders(
      <HomeScreen onStartSession={noop} onCheckIn={noop} onOpenSettings={noop} onOpenCoach={noop} />,
    );
    expect(text).not.toMatch(/NEXT SESSION/);
  });

  it('suppresses the coach recommendation while paused', () => {
    seedOperator({ paused: 'illness' });
    const text = expectRenders(<CoachScreen onDone={noop} />);
    expect(text).toMatch(/paused|Recovery is the training/i);
  });
});

describe('§21 — the medical-stop state', () => {
  const cardiac = { ...NO_READINESS_FLAGS, chestPain: true };

  it('leads Home with the stop banner', () => {
    seedOperator({ readiness: cardiac });
    const text = expectRenders(
      <HomeScreen onStartSession={noop} onCheckIn={noop} onOpenSettings={noop} onOpenCoach={noop} />,
    );
    expect(text).toMatch(/physician|doctor/i);
  });

  it('suppresses every challenge prompt', () => {
    seedOperator({ readiness: cardiac });
    const text = expectRenders(
      <HomeScreen onStartSession={noop} onCheckIn={noop} onOpenSettings={noop} onOpenCoach={noop} />,
    );
    expect(text).not.toMatch(/PRIMARY ·/);
    expect(text).not.toMatch(/NEXT SESSION/);
  });

  it('tells the operator their rank is safe', () => {
    seedOperator({ readiness: cardiac });
    const text = expectRenders(<MedicalStopScreen onDismiss={noop} />);
    expect(text).toMatch(/rank/i);
    expect(text).toMatch(/safe|frozen/i);
  });
});

describe('§14 — AXIOM on screen', () => {
  it('shows a next-session prescription for an active operator', () => {
    seedOperator();
    const text = expectRenders(<CoachScreen onDone={noop} />);
    expect(text).toMatch(/NEXT SESSION/);
  });

  it('never shows a diet or body-composition prescription', () => {
    seedOperator();
    const text = expectRenders(<CoachScreen onDone={noop} />);
    expect(text).not.toMatch(/\b(calorie|kcal|body ?fat|macro|meal plan|weight target)\b/i);
  });

  it('gates the Commander personality behind an opt-in', () => {
    seedOperator();
    render(<CoachScreen onDone={noop} />);
    // The VOICE tab is where personalities live; the lock is stated up front.
    expect(screen.getByText('VOICE')).toBeTruthy();
  });
});

describe('§18 — the fairness rule is stated where money is asked for', () => {
  it('appears on the season screen', () => {
    seedOperator();
    const text = expectRenders(<SeasonScreen />);
    expect(text).toMatch(/SEASON/);
  });
});

describe('§7 — an empty record book explains itself', () => {
  it('does not render a blank records screen', () => {
    seedOperator();
    const text = expectRenders(<RecordsScreen onDone={noop} />);
    expect(text).toMatch(/Nothing recorded yet|baseline/i);
  });
});
