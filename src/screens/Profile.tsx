import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Divider,
  Notice,
  Panel,
  PillarBar,
  Screen,
  SectionLabel,
  Stat,
  TierBadge,
  TierSigil,
} from '../design/components';
import { palette, space, surface, tierVisuals, type } from '../design/tokens';
import { RECALIBRATION_INTERVAL_DAYS, canRecalibrate } from '../engine/calibration';
import { computeDecay, describeLevelTierTension } from '../engine/progression';
import { formatRivalryRecord } from '../engine/rivals';
import { PILLARS, isVerified } from '../engine/types';
import { VERIFICATION_VALIDITY_DAYS } from '../engine/verification';
import { STATIC_COPY } from '../data/copy';
import { useApp } from '../state/store';
import { useWorld } from '../state/world';

/**
 * §C — the operator's identity surface, and the §17 career timeline.
 *
 * The organising principle is that this screen never flatters. It shows the
 * verification state plainly, shows the trust cap as a live number rather than a
 * footnote, and shows decay if it is running. §2 FAILURE 2 is defeated by making
 * trust legible everywhere the rank is legible — including here, where it is
 * least comfortable.
 */
export function ProfileScreen({
  onShowRankCard,
  onCheckIn,
  onShowRecords,
}: {
  onShowRankCard: () => void;
  onCheckIn: () => void;
  onShowRecords: () => void;
}) {
  const profile = useApp((s) => s.profile);
  const standing = useApp((s) => s.standing());
  const streak = useApp((s) => s.streak);
  const sessions = useApp((s) => s.sessions);

  const rivalries = useWorld((s) => s.rivalries);
  const candidates = useWorld((s) => s.rivalCandidates);
  const archive = useWorld((s) => s.archive);
  const venues = useWorld((s) => s.venues);

  const decay = useMemo(
    () => (profile ? computeDecay(profile, new Date()) : null),
    [profile],
  );

  if (!profile || !standing) return null;

  const visual = tierVisuals[standing.tier];
  const verified = isVerified(standing.verification);
  const tension = describeLevelTierTension(standing);
  const venueName =
    venues.find((v) => v.id === profile.homeVenueId)?.name ?? 'No home venue';

  const verifiedSessions = sessions.filter((s) => isVerified(s.verification)).length;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: palette.muted }]}>OPERATOR</Text>
            <Text style={[type.display, { color: palette.ink }]}>{profile.displayName}</Text>
            <View style={{ height: space.xs }} />
            <TierBadge tier={standing.tier} />
          </View>
          <TierSigil tier={standing.tier} size={88} />
        </View>

        <Panel>
          <View style={styles.statRow}>
            <Stat label="Power score" value={standing.cps.toFixed(1)} accent={visual.color} />
            <Stat label="Level" value={String(standing.level)} />
            <Stat label="Streak" value={String(streak.count)} />
          </View>
        </Panel>

        {/* §5: the tension between level and tier, stated as honest. */}
        {tension && (
          <Panel style={{ marginTop: space.sm }}>
            <Text style={[type.small, { color: palette.ink }]}>{tension}</Text>
            <Text style={[type.small, { color: palette.muted, marginTop: space.xs }]}>
              {STATIC_COPY.levelVersusTier}
            </Text>
          </Panel>
        )}

        <View style={{ height: space.lg }} />
        <SectionLabel>Pillars</SectionLabel>
        <Panel>
          {PILLARS.map((pillar) => (
            <PillarBar
              key={pillar}
              pillar={pillar}
              value={profile.pillars[pillar]}
              accent={visual.color}
            />
          ))}
        </Panel>

        {/* ------------------------------------------------------------- */}
        <View style={{ height: space.lg }} />
        <SectionLabel>Verification</SectionLabel>
        <Panel accent={verified ? palette.signal : palette.alert}>
          <View style={styles.verificationHeader}>
            <Text style={[type.title, { color: verified ? palette.signal : palette.alert }]}>
              {verified ? standing.verification.replace(/_/g, ' ') : 'UNVERIFIED'}
            </Text>
            <Text style={[type.dataSmall, { color: palette.muted }]}>
              {verifiedSessions} VERIFIED SESSION{verifiedSessions === 1 ? '' : 'S'}
            </Text>
          </View>

          {standing.trustCapped ? (
            <>
              <Divider />
              <Text style={[type.small, { color: palette.ink }]}>
                Your score is worth{' '}
                <Text style={{ color: tierVisuals[standing.uncappedTier].color }}>
                  {standing.uncappedTier}
                </Text>
                . You are shown {standing.tier} because self-reported profiles cap
                there. One scanned session lifts it permanently.
              </Text>
              <View style={{ height: space.sm }} />
              <Button label="Find a venue" onPress={onCheckIn} />
            </>
          ) : (
            <>
              <Divider />
              <Text style={[type.small, { color: palette.muted }]}>
                Verification lapses after {VERIFICATION_VALIDITY_DAYS} days without a
                scanned session. That is what keeps the top of this ladder honest
                over time, rather than only on the day you first checked in.
              </Text>
            </>
          )}
        </Panel>

        {/* §5: decay, stated plainly rather than discovered. */}
        {decay && (decay.isDecaying || decay.graceDaysRemaining < 7) && (
          <View style={{ marginTop: space.sm }}>
            <Notice tone={decay.isDecaying ? 'caution' : 'info'}>
              {decay.isDecaying
                ? `${decay.idleDays} idle days. Power score is falling by 1 per day and floors at ${
                    tierVisuals[standing.tier].label
                  } — one tier below your career best. It cannot fall further than that.`
                : `${decay.graceDaysRemaining} days before decay starts. Log anything and it resets.`}
            </Notice>
          </View>
        )}

        {profile.pausedFor && (
          <View style={{ marginTop: space.sm }}>
            <Notice tone="info">
              {`Paused for ${profile.pausedFor}. Nothing decays, your streak is held at ${streak.count}, and no challenge prompts will reach you.`}
            </Notice>
          </View>
        )}

        {/* ------------------------------------------------------------- */}
        {rivalries.length > 0 && (
          <>
            <View style={{ height: space.lg }} />
            <SectionLabel>Rivalry records</SectionLabel>
            <Text style={[type.small, { color: palette.muted, marginBottom: space.xs }]}>
              These persist across seasons. A season reset never touches them.
            </Text>
            <Panel>
              {rivalries.map((rivalry, index) => (
                <View key={rivalry.id}>
                  {index > 0 && <View style={styles.rowDivider} />}
                  <View
                    style={styles.recordRow}
                    accessible
                    accessibilityLabel={`Against ${
                      candidates.find((c) => c.operatorId === rivalry.rivalOperatorId)
                        ?.displayName ?? 'operator'
                    } on ${rivalry.pillar}: ${formatRivalryRecord(rivalry.record)}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, { color: palette.ink }]}>
                        {candidates.find((c) => c.operatorId === rivalry.rivalOperatorId)
                          ?.displayName ?? 'Operator'}
                      </Text>
                      <Text style={[type.dataSmall, { color: palette.muted }]}>
                        {rivalry.pillar.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[type.data, { color: palette.ink }]}>
                      {formatRivalryRecord(rivalry.record)}
                    </Text>
                  </View>
                </View>
              ))}
            </Panel>
          </>
        )}

        {/* ------------------------------------------------------------- */}
        <View style={{ height: space.lg }} />
        <SectionLabel>Career</SectionLabel>
        <Text style={[type.small, { color: palette.muted, marginBottom: space.xs }]}>
          One permanent entry per season. Append-only — nothing here is ever
          rewritten.
        </Text>
        <Panel>
          {archive.map((entry, index) => (
            <View key={entry.seasonNumber}>
              {index > 0 && <View style={styles.timelineConnector} />}
              <View
                style={styles.timelineRow}
                accessible
                accessibilityLabel={`Season ${entry.seasonNumber}: ${entry.tier} tier, level ${entry.level}, power score ${entry.cps}, placement ${entry.placement ?? 'unranked'}`}
              >
                <TierSigil tier={entry.tier} size={36} />
                <View style={{ flex: 1, marginLeft: space.sm }}>
                  <Text style={[type.body, { color: palette.ink }]}>
                    Season {entry.seasonNumber}
                  </Text>
                  <Text style={[type.dataSmall, { color: palette.muted }]}>
                    {entry.tier} · LV {entry.level} · CPS {entry.cps.toFixed(1)}
                    {entry.placement ? ` · #${entry.placement}` : ''}
                  </Text>
                </View>
              </View>
            </View>
          ))}

          <View style={styles.timelineConnector} />
          <View style={styles.timelineRow}>
            <TierSigil tier={standing.tier} size={36} />
            <View style={{ flex: 1, marginLeft: space.sm }}>
              <Text style={[type.body, { color: palette.signal }]}>
                Season 1 · in progress
              </Text>
              <Text style={[type.dataSmall, { color: palette.muted }]}>
                {standing.tier} · LV {standing.level} · CPS {standing.cps.toFixed(1)}
              </Text>
            </View>
          </View>
        </Panel>

        {/* ------------------------------------------------------------- */}
        <View style={{ height: space.lg }} />
        <SectionLabel>Home venue</SectionLabel>
        <Panel>
          <Text style={[type.body, { color: palette.ink }]}>{venueName}</Text>
          <Text style={[type.dataSmall, { color: palette.muted, marginTop: 2 }]}>
            {(profile.cityId ?? 'bharatpur').toUpperCase()}
          </Text>
        </Panel>

        <View style={{ height: space.lg }} />
        <Button label="Rank card" onPress={onShowRankCard} />
        <View style={{ height: space.xs }} />
        <Button label="Personal records" variant="secondary" onPress={onShowRecords} />
        <View style={{ height: space.xs }} />
        <Button
          label={`Recalibrate (every ${RECALIBRATION_INTERVAL_DAYS} days)`}
          variant="secondary"
          disabled={!canRecalibrate(new Date('2026-01-05'), new Date())}
          onPress={() => {}}
          accessibilityLabel={`Recalibrate. Available every ${RECALIBRATION_INTERVAL_DAYS} days.`}
        />

        <View style={{ height: space.lg }} />
        <Text style={[type.small, { color: palette.muted }]}>
          {STATIC_COPY.medicalDisclaimer}
        </Text>
        <View style={{ height: space.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.md,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  verificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.xs,
  },
  rowDivider: {
    height: surface.hairlineWidth,
    backgroundColor: surface.borderColor,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.xs,
  },
  // §19 moment screen 5: the connecting line is the emotional beat, so it is a
  // real drawn element rather than implied spacing.
  timelineConnector: {
    width: surface.hairlineWidth,
    height: space.md,
    backgroundColor: palette.hairline,
    marginLeft: 18,
  },
});
