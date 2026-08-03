# 14 · Open questions

> §24 deliverable 14: "Open questions — list anything ambiguous rather than
> inventing an answer."
>
> §25: "If any instruction above conflicts with another, surface the conflict and
> ask."

Everything below is either an unresolved `{{VARIABLE}}` or a genuine conflict in
the brief. Nothing here has been guessed.

---

## A · Unconfirmed variables — blocking

### A1 · Pricing — three values

§18 specifies `{{price}}/mo`, `{{price}}/yr`, and `{{price}}/season`. All three
are unset.

This matters more than usual because §18 also requires **regional pricing for
Nepal**, and the ratio between the Nepal tier and the global tier is a positioning
decision, not an arithmetic one. A price that reads as fair in Bharatpur and a
price that reads as premium in London are different products.

**What I need:** monthly, annual, and per-season, in NPR and USD.
**What is already built regardless:** the 7-day trial, the entitlement matrix, the
restore-purchases path, and the one-tap cancellation requirement.

### A2 · App name — final

Five candidates with rationale are in [13-launch-assets.md](13-launch-assets.md).
**MERIDIAN** is the working name and appears in `app.config.ts`, `package.json`,
the store listing and the landing copy.

**What I need:** the winner, plus a trademark search before the store listing is
submitted. I have checked for genre-cliché overlap; I have not and cannot check
trademark registers.

### A3 · Repository name

The repository is `solo-leveling-fitness`. §3's hard rule forbids that vocabulary
in any product-facing artifact, and a source-tree scan in
`src/data/design.test.ts` enforces it inside `src/`.

**The repository name itself is outside that scan.** It should be renamed before
the code is public — a repo URL is a product-facing artifact the moment anyone
sees it.

---

## B · Unconfirmed variables — non-blocking

### B1 · Camera rep detection and wearable heart-rate import

§15 lists `{{camera rep detection | wearable heart-rate import}}` as optional. §25
forbids phase-two deferrals, so "later" is not available — these are either in
v1.0 or out of it.

**My recommendation: both out of v1.0, explicitly and permanently for camera.**

Camera rep detection is a research project with a poor accuracy floor across
varied lighting, angles and body types, and §15 already requires it be presented
as "a correctable assist, never the source of truth for verified stats" — which
means it cannot contribute to the moat and would consume disproportionate
engineering.

Wearable HR import (Apple Health / Health Connect) is genuinely straightforward
and I would take it if you want one of the two.

**What I need:** in or out, for each.

### B2 · Typeface licensing

The build ships platform system faces so launch has no font dependency. The
intended licensed families:

| Role | Recommendation | Alternative |
|---|---|---|
| Display | Söhne Breit | GT America Expanded |
| UI | Söhne | Inter (free) |
| Data | Söhne Mono | JetBrains Mono (free) |

A free-only stack (Inter + JetBrains Mono) is a legitimate ship. It is
marginally less distinctive and costs nothing.

**What I need:** budget, or a decision to ship free faces.

### B3 · Bharatpur seed venues

§12 needs real partner venues at launch or the territory system shows an empty
board on day one — which is worse than not shipping it.

**What I need:** how many Bharatpur gyms are committed, and their names, addresses
and coordinates.

### B4 · Trainer verification credentials

§10 tier 3 is `TRAINER_CONFIRM` — "a verified trainer signs off." What counts as a
verified trainer in Nepal is a real question with no obvious answer: certification
bodies vary, and an over-strict rule makes the tier unusable while a loose one
makes it worthless.

**What I need:** which credentials qualify, and who reviews them.

---

## C · Conflicts in the brief

### C1 · §17 "tier floors at one below season-peak" — floor or demotion?

**The ambiguity.** §5 uses "floors at one tier below career peak" to mean a
*minimum* — decay cannot take you below it. §17 uses nearly identical wording for
the season reset.

Read as a pure floor, a season reset does nothing at all to an operator finishing
at their peak — which contradicts "PARTIAL RESET" being a reset.

**What I built:** the new tier is `min(current tier, season peak − 1)`. An
operator at their peak drops exactly one tier; an operator already lower keeps
their real, lower tier; nobody ever drops more than one tier.

This makes the reset real while bounding it, which I believe is the intent. **It
is an interpretation, and it is the one I would most like confirmed** — it is
the only place in this build where I resolved an ambiguity by choosing rather
than by asking, because leaving it unresolved would have left `rolloverSeason`
unimplementable.

Caught by a test during the build: my first implementation read it as a pure
floor and did not demote a SOLAR operator at all.

### C2 · §14 ELITE_COMMANDER vs §21 "no shame, no ultimatums"

**The conflict.** §14 wants a "theatrical" high-intensity personality. §21 forbids
shame, guilt and ultimatums in all motivational copy. Theatrical drill-instructor
register is built almost entirely from those materials.

**How I resolved it.** ELITE_COMMANDER is theatrical about *the ladder and the
achievement*, never about the operator. "The board just moved. Everyone below you
noticed" is theatre. "You're pathetic, get up" is shame, and every line in the
bank is regex-tested against a shame filter.

Additionally, MEDICAL_STOP and INJURY_LOGGED **override the personality entirely**
and use the calm register regardless of what the operator chose. §14 says
Commander is roleplay flavour, not coaching advice; a safety event is not a place
for flavour.

**Flagging it because** you may want the Commander sharper than I have written
it. There is room to push it without touching §21, but I would want that
reviewed line by line rather than loosened in the filter.

### C3 · §5 decay vs §16 "rest never costs anything"

**The tension.** §16 is emphatic that rest carries no cost. §5 removes 1 CPS/day
after 21 idle days.

**Why I do not think it is a contradiction.** They measure different things. §16
governs *streaks*, which are a motivational device — those never punish rest. §5
governs *tier*, which is a claim about present capability — and 21 days of
inactivity genuinely does reduce capability. A ladder that let a rank persist
indefinitely without training would be making a false claim, which returns to §2
FAILURE 2 through a different door.

The design makes this honest by: a 21-day grace period, a hard floor one tier
below career peak, a complete suspension for logged injury or illness, and copy
that frames the drop as a measurement rather than a penalty.

**Flagging it** so you can confirm the 21-day grace and the −1/day rate are where
you want them. Both are config values and can be tuned remotely without a
release.

### C4 · §21 no weight tracking vs §7 bodyweight-relative scoring

**The tension.** §21 forbids weight tracking anywhere. §7 requires scoring
bodyweight movements and load ratios, which needs a bodyweight number.

**How I resolved it.** `bodyweightKg` exists as a **scoring input only**: one
current value, no history, never graphed, never a target, never mentioned by
AXIOM, and never shown on a card or profile. It is used in exactly two places —
bodyweight-movement work units and the 6× implausibility ceiling.

The source scan bans `weightGoal`, `targetWeight`, `bodyFat`, `bmi`, `calories`
and their variants outright. Bodyweight-as-input passes; bodyweight-as-metric
would not compile past review.

**Flagging it** because it is the closest thing to a compromise in this build. An
alternative — asking for a bodyweight *band* rather than a number — would satisfy
§21 more strictly at some cost to scoring accuracy. Say the word and I will
switch it.

---

## D · Decisions I made that you should review

These were not ambiguous enough to block, but they are choices.

| # | Decision | Rationale | Reversible? |
|---|---|---|---|
| D1 | Raid rewards cap at 2.1× (2.73× boss) | Higher and solo operators get pushed off the ladder — replacing FAILURE 3 with a worse problem | Yes, one constant |
| D2 | Rival draws split points rather than voiding | Two people who both trained hard should not both get nothing | Yes |
| D3 | Rivals scored on *gain* not absolute score | The only fair comparison across a ±1 tier spread | Structural |
| D4 | Verification lapses after 30 days | Keeps the top honest over time, not just at first check-in | Yes, one constant |
| D5 | Streak gap tolerance derived from declared rest days | A 3×/week trainee keeps a streak a 6×/week trainee also keeps | Yes |
| D6 | Streak reset copy does not name the lost number | Naming what was lost *is* loss-framing | Copy only |
| D7 | 8 calibration screens group 12 inputs | §4 says 8 questions; §6 lists 12 inputs. Grouped where they are the same physical test. | Yes |
| D8 | Quest board falls back to `full_body` when all groups collide | An empty quest board is worse than a repeated group | Yes |
| D9 | Cooldown message states the session still logs | §21 forbids penalising extra training | Copy only |
| D10 | Sigils drawn from primitives, not shipped as art | Identical geometry at 16px and 320px; no asset pipeline | Structural |

---

## E · Not open — decided and built

Recorded here so they are not re-litigated.

| Question | Answer | Source |
|---|---|---|
| MODE | BUILD | Confirmed |
| Coach entity | **AXIOM** | Confirmed |
| Languages | **English only** | Confirmed |
| Platform | React Native + Expo | Brief |
| Primary market | Nepal → India → South Asia | Brief |
| Launch city | Bharatpur | Brief |
| Season length | 13 weeks, fixed | Brief, §17 |
| Tier names | ASH · IRON · COBALT · STORM · SOLAR · ECLIPSE | Brief, §3 |
| Trust cap | COBALT for self-reported | Brief, §6 |
| Pillar weights | 30/30/25/15 | Brief, §5 |
| Gain cap | +2.0/pillar/7 days | Brief, §5 |
| Decay | −1 CPS/day after 21 idle days | Brief, §5 |
| Pass | 50 tiers, quest XP only | Brief, §17 |
| Fairness rule | No competitive advantage sold, ever | Brief, §18 |
| Minimum age | 16 | Brief, §21 |
| Calorie / weight / body-fat tracking | **None. Anywhere.** | Brief, §21 |
