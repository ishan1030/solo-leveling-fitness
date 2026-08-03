import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Button,
  Divider,
  Notice,
  Panel,
  Screen,
  SectionLabel,
  TierBadge,
  TierSigil,
} from '../design/components';
import { palette, space, surface, type } from '../design/tokens';
import {
  MAX_RIVALS,
  canAddRival,
  formatRivalryRecord,
  resolveRivalWeek,
  suggestRivals,
  type RivalCandidate,
} from '../engine/rivals';
import {
  RAID_MAX_PARTY,
  RAID_MIN_PARTY,
  handleDropOut,
  pillarDiversityMultiplier,
  raidRewardMultiplier,
  validateRaid,
} from '../engine/raids';
import { PILLARS, type Pillar } from '../engine/types';
import { lineFor } from '../data/copy';
import { useApp, useStanding } from '../state/store';
import { useWorld } from '../state/world';

/**
 * §11 + §9 — the social layer, and the defeat for §2 FAILURE 3.
 *
 * The organising idea: this screen is a list of **obligations to named people**,
 * not a feed. §11 is explicit — "No feed. No likes. No infinite scroll. This is
 * deliberate." So there is nothing here to scroll through idly. Every row is
 * either someone waiting on you or someone you are competing with this week.
 */

export function SocialScreen() {
  const profile = useApp((s) => s.profile);
  const standing = useStanding();
  const personality = useApp((s) => s.coachPersonality);

  const candidates = useWorld((s) => s.rivalCandidates);
  const rivalries = useWorld((s) => s.rivalries);
  const addRivalry = useWorld((s) => s.addRivalry);
  const removeRivalry = useWorld((s) => s.removeRivalry);
  const activeRaid = useWorld((s) => s.activeRaid);
  const openRaid = useWorld((s) => s.openRaid);
  const joinRaid = useWorld((s) => s.joinRaid);
  const logRaidPortion = useWorld((s) => s.logRaidPortion);
  const dropFromRaid = useWorld((s) => s.dropFromRaid);
  const closeRaid = useWorld((s) => s.closeRaid);

  const [pendingPillar, setPendingPillar] = useState<Pillar>('strength');

  const currentRivalIds = rivalries.map((r) => r.rivalOperatorId);

  const suggestions = useMemo(() => {
    if (!profile || !standing) return [];
    return suggestRivals({
      operatorId: profile.id,
      operatorTier: standing.tier,
      operatorCityId: profile.cityId ?? 'bharatpur',
      operatorVenueId: profile.homeVenueId ?? 'v_bharatpur_iron',
      currentRivalIds,
      candidates,
    });
  }, [profile, standing, currentRivalIds, candidates]);

  const nameFor = (operatorId: string) =>
    candidates.find((c) => c.operatorId === operatorId)?.displayName ?? 'Operator';

  if (!profile || !standing) return null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ------------------------------------------------------------- */}
        <SectionLabel>{`Rivals · ${rivalries.length} of ${MAX_RIVALS}`}</SectionLabel>
        <Text style={[type.small, { color: palette.muted, marginBottom: space.sm }]}>
          Three at most, all within one tier of you. Scored on pillar points
          gained this week — not on who is already stronger — so the lower-ranked
          operator can genuinely win.
        </Text>

        {rivalries.map((rivalry) => {
          // Demonstration values. In production these come from the week's
          // scored sessions for each operator.
          const yourGain = 1.6;
          const theirGain = 1.2;
          const result = resolveRivalWeek(rivalry, yourGain, theirGain, {
            operator: profile.displayName,
            rival: nameFor(rivalry.rivalOperatorId),
          });
          const voice = lineFor(
            result.outcome === 'operator'
              ? 'RIVAL_WON'
              : result.outcome === 'rival'
                ? 'RIVAL_LOST'
                : 'RIVAL_DRAW',
            personality,
            { rival: nameFor(rivalry.rivalOperatorId), pillar: rivalry.pillar },
          );

          return (
            <Panel key={rivalry.id} style={{ marginBottom: space.xs }}>
              <View style={styles.rivalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.title, { color: palette.ink }]}>
                    {nameFor(rivalry.rivalOperatorId)}
                  </Text>
                  <Text style={[type.label, { color: palette.muted, marginTop: 2 }]}>
                    {rivalry.pillar.toUpperCase()} · {formatRivalryRecord(rivalry.record)}
                  </Text>
                </View>
                <TierBadge
                  tier={
                    candidates.find((c) => c.operatorId === rivalry.rivalOperatorId)?.tier ??
                    standing.tier
                  }
                />
              </View>

              <Divider />

              <View style={styles.headToHead}>
                <View style={styles.h2hSide}>
                  <Text style={[type.label, { color: palette.muted }]}>YOU</Text>
                  <Text style={[type.dataLarge, { color: palette.signal }]}>
                    {yourGain.toFixed(2)}
                  </Text>
                </View>
                <Text style={[type.label, { color: palette.muted }]}>THIS WEEK</Text>
                <View style={[styles.h2hSide, { alignItems: 'flex-end' }]}>
                  <Text style={[type.label, { color: palette.muted }]}>THEM</Text>
                  <Text style={[type.dataLarge, { color: palette.ink }]}>
                    {theirGain.toFixed(2)}
                  </Text>
                </View>
              </View>

              <Text style={[type.small, { color: palette.ink, marginTop: space.xs }]}>
                {voice.caption}
              </Text>

              <View style={{ height: space.sm }} />
              <Button
                label="End rivalry"
                variant="ghost"
                onPress={() => removeRivalry(rivalry.id)}
              />
            </Panel>
          );
        })}

        {rivalries.length === 0 && (
          <Notice tone="info">
            No rivals yet. This is the single strongest reason people keep opening
            this app on day twelve — one standing weekly appointment with a real
            person.
          </Notice>
        )}

        {canAddRival(currentRivalIds) && suggestions.length > 0 && (
          <>
            <View style={{ height: space.md }} />
            <SectionLabel>Suggested — same venue first</SectionLabel>

            <View style={styles.pillarPicker}>
              {PILLARS.map((pillar) => (
                <Pressable
                  key={pillar}
                  onPress={() => setPendingPillar(pillar)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: pendingPillar === pillar }}
                  accessibilityLabel={`Compete on ${pillar}`}
                  style={[styles.chip, pendingPillar === pillar && styles.chipSelected]}
                >
                  <Text
                    style={[
                      type.dataSmall,
                      { color: pendingPillar === pillar ? palette.base : palette.ink },
                    ]}
                  >
                    {pillar.slice(0, 4).toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            {suggestions.slice(0, 4).map((candidate) => (
              <SuggestionRow
                key={candidate.operatorId}
                candidate={candidate}
                sameVenue={candidate.venueId === (profile.homeVenueId ?? 'v_bharatpur_iron')}
                sameCity={candidate.cityId === (profile.cityId ?? 'bharatpur')}
                onAdd={() => {
                  addRivalry(candidate, pendingPillar);
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }}
              />
            ))}
          </>
        )}

        {/* ------------------------------------------------------------- */}
        <View style={{ height: space.xl }} />
        <SectionLabel>Raid</SectionLabel>
        <Text style={[type.small, { color: palette.muted, marginBottom: space.sm }]}>
          {RAID_MIN_PARTY}–{RAID_MAX_PARTY} operators, training together or in the
          same window. Every one of them logs their own portion — nobody gets
          carried.
        </Text>

        {!activeRaid && (
          <Panel>
            <Text style={[type.body, { color: palette.ink }]}>No raid open.</Text>
            <Text style={[type.small, { color: palette.muted, marginTop: space.xxs }]}>
              Rewards scale with party size and with pillar diversity — a runner
              and a lifter together earn more than two lifters.
            </Text>
            <View style={{ height: space.sm }} />
            <Button
              label="Open a raid"
              onPress={() => openRaid(profile.id, pendingPillar)}
            />
          </Panel>
        )}

        {activeRaid && (
          <RaidPanel
            nameFor={(id) => (id === profile.id ? profile.displayName : nameFor(id))}
            candidates={suggestions}
            onJoin={joinRaid}
            onLog={logRaidPortion}
            onDrop={dropFromRaid}
            onClose={closeRaid}
          />
        )}

        <View style={{ height: space.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function SuggestionRow({
  candidate,
  sameVenue,
  sameCity,
  onAdd,
}: {
  candidate: RivalCandidate;
  sameVenue: boolean;
  sameCity: boolean;
  onAdd: () => void;
}) {
  const proximity = sameVenue ? 'SAME VENUE' : sameCity ? 'SAME CITY' : 'IN RANGE';

  return (
    <Pressable
      onPress={onAdd}
      accessibilityRole="button"
      accessibilityLabel={`Challenge ${candidate.displayName}, ${candidate.tier} tier, ${proximity.toLowerCase()}`}
      style={styles.suggestionRow}
    >
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: palette.ink }]}>{candidate.displayName}</Text>
        <View style={styles.rowMeta}>
          <TierBadge tier={candidate.tier} size={12} />
          <Text
            style={[
              type.dataSmall,
              { color: sameVenue ? palette.signal : palette.muted },
            ]}
          >
            {proximity}
          </Text>
        </View>
      </View>
      <Text style={[type.label, { color: palette.signal }]}>CHALLENGE</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

function RaidPanel({
  nameFor,
  candidates,
  onJoin,
  onLog,
  onDrop,
  onClose,
}: {
  nameFor: (operatorId: string) => string;
  candidates: RivalCandidate[];
  onJoin: (candidate: RivalCandidate, pillar: Pillar) => void;
  onLog: (operatorId: string) => void;
  onDrop: (operatorId: string) => void;
  onClose: () => void;
}) {
  const activeRaid = useWorld((s) => s.activeRaid)!;
  const personality = useApp((s) => s.coachPersonality);

  const validation = useMemo(
    () => validateRaid({ raid: activeRaid, lastRaidByPair: {}, now: new Date() }),
    [activeRaid],
  );

  const active = activeRaid.participants.filter((p) => !p.droppedOut);
  const loggedCount = active.filter((p) => p.loggedPortion).length;
  const multiplier = raidRewardMultiplier(activeRaid);
  const diversity = pillarDiversityMultiplier(active);

  const complete = validation.valid;

  return (
    <Panel accent={complete ? palette.signal : undefined}>
      <View style={styles.raidHeader}>
        <View>
          <Text style={[type.label, { color: palette.muted }]}>PARTY</Text>
          <Text style={[type.title, { color: palette.ink }]}>
            {loggedCount} of {active.length} logged
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[type.label, { color: palette.muted }]}>MULTIPLIER</Text>
          <Text style={[type.dataLarge, { color: palette.signal }]}>
            {multiplier.toFixed(2)}×
          </Text>
        </View>
      </View>

      <Text style={[type.dataSmall, { color: palette.muted, marginTop: space.xxs }]}>
        DIVERSITY {diversity.toFixed(2)}× · {new Set(active.map((p) => p.contributingPillar)).size}{' '}
        DISTINCT PILLARS
      </Text>

      <Divider />

      {/*
        §19 moment screen 4 arranges these sigils on an arc, in log order, with
        no leader position. Here they are a list for the same reason: nobody can
        carry anybody, so nobody gets a top slot.
      */}
      {activeRaid.participants.map((participant) => (
        <View
          key={participant.operatorId}
          style={styles.participantRow}
          accessible
          accessibilityLabel={`${nameFor(participant.operatorId)}, contributing ${
            participant.contributingPillar
          }, ${
            participant.droppedOut
              ? 'left the raid'
              : participant.loggedPortion
                ? 'portion logged'
                : 'has not logged yet'
          }`}
        >
          <View
            style={[
              styles.participantDot,
              {
                backgroundColor: participant.droppedOut
                  ? palette.hairline
                  : participant.loggedPortion
                    ? palette.signal
                    : 'transparent',
                borderColor: participant.loggedPortion ? palette.signal : palette.muted,
              },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={[
                type.body,
                { color: participant.droppedOut ? palette.muted : palette.ink },
              ]}
            >
              {nameFor(participant.operatorId)}
            </Text>
            <Text style={[type.dataSmall, { color: palette.muted }]}>
              {participant.contributingPillar.toUpperCase()}
              {participant.droppedOut ? ' · LEFT' : ''}
            </Text>
          </View>

          {!participant.droppedOut && !participant.loggedPortion && (
            <Pressable
              onPress={() => onLog(participant.operatorId)}
              accessibilityRole="button"
              accessibilityLabel={`Mark ${nameFor(participant.operatorId)} portion as logged`}
              style={styles.miniAction}
            >
              <Text style={[type.label, { color: palette.signal }]}>LOG</Text>
            </Pressable>
          )}
        </View>
      ))}

      {/* Every unmet condition, named, with the operator responsible. */}
      {!complete && validation.rejections.length > 0 && (
        <>
          <Divider />
          {validation.rejections.map((rejection, index) => (
            <Text
              key={`${rejection.code}_${index}`}
              style={[type.small, { color: palette.muted, marginBottom: 2 }]}
            >
              {rejection.operatorId ? `${nameFor(rejection.operatorId)} — ` : ''}
              {rejection.detail}
            </Text>
          ))}
        </>
      )}

      {complete && (
        <>
          <Divider />
          <Text style={[type.small, { color: palette.ink }]}>
            {lineFor('RAID_COMPLETE', personality, { count: active.length }).caption}
          </Text>
        </>
      )}

      <View style={{ height: space.md }} />

      {active.length < RAID_MAX_PARTY && candidates.length > 0 && (
        <>
          <Text style={[type.label, { color: palette.muted }]}>INVITE</Text>
          {candidates.slice(0, 3).map((candidate, index) => (
            <Pressable
              key={candidate.operatorId}
              onPress={() =>
                onJoin(candidate, PILLARS[(index + 1) % PILLARS.length] as Pillar)
              }
              accessibilityRole="button"
              accessibilityLabel={`Invite ${candidate.displayName} to the raid`}
              style={styles.suggestionRow}
            >
              <Text style={[type.body, { color: palette.ink, flex: 1 }]}>
                {candidate.displayName}
              </Text>
              <Text style={[type.label, { color: palette.signal }]}>INVITE</Text>
            </Pressable>
          ))}
          <View style={{ height: space.sm }} />
        </>
      )}

      {complete ? (
        <Button label="Complete raid" onPress={onClose} />
      ) : (
        <Button
          label="Leave raid"
          variant="ghost"
          accessibilityLabel="Leave the raid. No penalty, and everything you logged still counts."
          onPress={() => {
            const outcome = handleDropOut(activeRaid, activeRaid.hostOperatorId);
            onDrop(activeRaid.hostOperatorId);
            if (outcome.outcome === 'abandoned') onClose();
          }}
        />
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------

/** §19 moment screen 4 — RAID COMPLETE. Sigils resolving together on an arc. */
export function RaidCompleteScreen({ onDone }: { onDone: () => void }) {
  const standing = useStanding();
  if (!standing) return null;

  return (
    <Screen>
      <View style={styles.momentRoot}>
        <Text style={[type.label, { color: palette.muted }]}>RAID COMPLETE</Text>
        <View style={{ height: space.xl }} />
        <View style={styles.arc}>
          {[0, 1, 2, 3].map((index) => (
            <View key={index} style={{ marginTop: index === 1 || index === 2 ? -14 : 0 }}>
              <TierSigil tier={standing.tier} size={52} />
            </View>
          ))}
        </View>
        <View style={{ height: space.lg }} />
        <Text style={[type.moment, { color: palette.signal }]}>1.82×</Text>
        <Text style={[type.label, { color: palette.muted, marginTop: space.xs }]}>
          STRENGTH · ENDURANCE · MOBILITY
        </Text>
        <View style={{ height: space.xxl }} />
        <Button label="Done" onPress={onDone} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xl,
  },
  rivalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headToHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  h2hSide: {
    minWidth: 72,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: space.md,
    borderWidth: surface.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.surface,
    marginBottom: space.xs,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: 2,
  },
  pillarPicker: {
    flexDirection: 'row',
    gap: space.xs,
    marginBottom: space.sm,
  },
  chip: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: surface.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.surface,
  },
  chipSelected: {
    backgroundColor: palette.signal,
    borderColor: palette.signal,
  },
  raidHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
  },
  participantDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  miniAction: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  momentRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
});
