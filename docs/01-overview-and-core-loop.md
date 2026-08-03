# 1 · Product overview and the core loop

> **Working name: MERIDIAN.** Five candidates and the rationale for each are in
> [13-launch-assets.md](13-launch-assets.md). The repository is named
> `solo-leveling-fitness`; §3 forbids that vocabulary in any product-facing
> artifact, so it appears nowhere in the app, the store listing, or these docs.
> **The repository should be renamed before launch.**

---

## Positioning

> The only fitness ladder where your rank is earned in a real gym and can't be faked.

MERIDIAN is a competitive fitness ladder. An operator is calibrated on day one,
receives a tier derived from measured capability, and climbs by training. The
rank is public, comparable, and — above COBALT — verifiable. The verification
network is the moat: an ECLIPSE operator scanned into a real venue and did the
work, and every other operator on the board knows it.

**Confirmed decisions carried into this spec**

| Variable | Value |
|---|---|
| MODE | BUILD |
| Coach entity | **AXIOM** |
| Languages at v1.0 | English only |
| Platform | React Native (iOS + Android) + marketing web page |
| Primary market | Nepal → India → wider South Asia |
| Launch city | Bharatpur |

Pricing (`{{price}}` ×3) is **not confirmed** and is listed in
[14-open-questions.md](14-open-questions.md) rather than invented.

---

## The core loop

```
                    ┌──────────────────────────────────────────┐
                    │             CALIBRATION                  │
                    │   8 questions · under 90 seconds         │
                    │   readiness gate BEFORE any test         │
                    └────────────────────┬─────────────────────┘
                                         │
                                         ▼
                    ┌──────────────────────────────────────────┐
                    │              THE REVEAL                  │
                    │   stats tick up · sigil forms last       │
                    │   RANK CARD generated                    │
                    │   status: UNVERIFIED, capped at COBALT   │
                    └────────────────────┬─────────────────────┘
                                         │  "Save my rank"
                                         ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │                            THE DAILY LOOP                               │
   │                                                                         │
   │   ┌──────────┐   generated from    ┌──────────┐                         │
   │   │  QUEST   │◄──weakest pillar────│ STANDING │                         │
   │   │  BOARD   │   + logged capacity │  (CPS)   │                         │
   │   └────┬─────┘                     └────▲─────┘                         │
   │        │ operator trains                │                               │
   │        ▼                                │ capped +2.0/pillar/7d         │
   │   ┌──────────┐   measured load,     ┌────┴─────┐                        │
   │   │ LOGGING  │───volume, pace──────►│ SCORING  │                        │
   │   │ ≤2 taps  │                      │  ENGINE  │                        │
   │   └────┬─────┘                      └────┬─────┘                        │
   │        │                                 │                              │
   │        │ optional QR scan                │ XP                           │
   │        ▼                                 ▼                              │
   │   ┌──────────┐                      ┌──────────┐                        │
   │   │  VERIFY  │─lifts the COBALT────►│  LEVEL   │                        │
   │   │  at gym  │  cap permanently     │          │                        │
   │   └──────────┘                      └──────────┘                        │
   └────────────────────────────┬────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
  ┌───────────┐          ┌───────────┐          ┌───────────┐
  │   RAIDS   │          │  RIVALS   │          │ TERRITORY │
  │  2–6 ppl  │          │  max 3    │          │ venue→city│
  │  everyone │          │  ±1 tier  │          │  →global  │
  │  must log │          │  weekly   │          │  monthly  │
  └─────┬─────┘          └─────┬─────┘          └─────┬─────┘
        └───────────────────────┼───────────────────────┘
                                ▼
                    ┌──────────────────────────┐
                    │   WEEKLY RE-EVALUATION   │
                    │   requires ≥1 verified   │
                    │   session in the window  │
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │   SEASON · 13 weeks      │
                    │   partial reset          │
                    │   archived permanently   │
                    └──────────────────────────┘
```

### Why the loop holds

Three obligations are created inside week one, deliberately staggered:

| Day | Obligation created | Mechanism |
|---|---|---|
| 0 | Something to lose | The rank card exists before the account does |
| 0 | A 24-hour deadline | One quest is already active and expiring at signup |
| 1–3 | A visible ceiling | The COBALT trust cap names exactly what is being withheld |
| 3–7 | **A standing obligation to another human** | First rival accepted, or first raid pairing formed |

The fourth is the one that matters. §2 FAILURE 3 kills apps in this genre on
day 12; a rivalry or a raid streak is the only thing in the design that another
person notices when the operator does not open the app.

---

## What is in v1.0

Everything in the brief. There is no phase two.

- Calibration, readiness gating, and 90-day recalibration
- Four-pillar progression, derived tiers, levels, decay, weekly re-evaluation
- 302-movement exercise library, offline-first logging, PR history
- Daily / weekly / anomaly / trial quest engine
- Raids with proximity and shared-window verification
- Friends, rivals, guilds
- Venue → city → global territory
- Four-tier verification network and the partner-gym programme
- Rank cards, share loop, referral attribution
- AXIOM: text for free operators, voice for premium, three personalities
- 13-week seasons, 50-tier pass, permanent career archive
- Subscription, seasonal pass, and the fairness rule enforced in the type system

---

## Document map

| # | Document | Deliverable |
|---|---|---|
| 1 | This file | Overview and core loop |
| 2 | [02-failure-defeat-table.md](02-failure-defeat-table.md) | How each §2 failure is defeated |
| 3 | [03-screen-inventory.md](03-screen-inventory.md) | Every screen, purpose, and states |
| 4 | [04-data-model.md](04-data-model.md) | Full data model |
| 5 | [05-progression-state-machine.md](05-progression-state-machine.md) | State machine + 3 worked users |
| 6 | [06-generation-logic.md](06-generation-logic.md) | Quest, raid, rival generation |
| 7 | [07-verification-anticheat.md](07-verification-anticheat.md) | Verification and anti-cheat |
| 8 | [08-copy-bank.md](08-copy-bank.md) | Notification and voice copy bank |
| 9 | [09-monetization-matrix.md](09-monetization-matrix.md) | Entitlement matrix |
| 10 | [10-visual-system.md](10-visual-system.md) | Palette, type, spacing, motion |
| 11 | [11-moment-screens.md](11-moment-screens.md) | Five moment screens, frame by frame |
| 12 | [12-rank-card-spec.md](12-rank-card-spec.md) | Rank card layout per tier |
| 13 | [13-launch-assets.md](13-launch-assets.md) | Names, store, landing, retention |
| 14 | [14-open-questions.md](14-open-questions.md) | Everything ambiguous, uninvented |
| — | [15-technical-architecture.md](15-technical-architecture.md) | §22 architecture |
