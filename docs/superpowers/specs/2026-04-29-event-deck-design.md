# Initial event deck — Design

- **TODO entry:** Cluster A · 14 (Initial event deck — ~20 cards).
- **Tier:** 2.
- **Date:** 2026-04-29.

## 1 · Scope

Author 20 event cards in `src/data/events.ts`'s `EVENTS` table. Cards leverage the four payload kinds shipped in Cluster A · 13 (`hp_delta_party`, `gold_delta`, `add_item`, `lose_hero`). No new mechanics — pure content authoring.

**Distribution:**

| Category | Count | Notes |
|---|---:|---|
| HP-for-gold trades | 7 | The gdd archetype. -X% HP for +Yg. |
| Reverse trades (gold for HP heal) | 2 | Pay gold to recover HP. |
| Free-reward cards | 3 | Take vs. leave (with implicit narrative cost). |
| Lost-hero gambles | 4 | Sacrifice a hero for reward, or pay HP to save them. |
| Crypt-specific flavor | 4 | Undead/tomb themes; mix of trade, reward, and ghost-pact (Lost). |

Total: 15 shared + 5 Crypt-specific. Of the 5 Crypt cards, one is a Lost-gamble (`ghost_pact`) — so total Lost cards = 3 shared + 1 Crypt = 4.

**Numerical balance targets:**

- HP costs per card: 10–35%.
- Gold values: 50–300g for trades; gold scales loosely with HP risk.
- Items: `'common'` / `'uncommon'` / `'rare'` per card. **Rare items reserved for Lost-gamble cards or premium high-HP-cost trades** (no free rares — except the lone "skeleton with satchel" find, which is narratively a high-tension take).
- Lost gambles offer the strongest rewards (rare item, big gold) — Lost is the hardest cost.

**Tone:** gdd's Darkest Dungeon framing — gothic, doom-laden, short narrator voice. Card bodies are 1–2 sentences. Choice labels use active verbs ("Pay the toll", not "Yes").

**Out of scope:**

- Floor-generator integration (`'event'` Node variant, fork-shape RNG inclusion) — future task.
- Event card UI overlay — Cluster B · 5.
- Per-card balance playtesting — numbers below are first-pass; tunable via constants once playtested.

## 2 · The 20 cards

### Shared deck (15 — `dungeonId: undefined`)

| # | id | body | choices |
|---|---|---|---|
| 1 | `hooded_stranger` | A hooded stranger blocks your path, palm extended. The price of passage is paid in blood. | `[Bleed and pass — -20% HP, +150g]` / `[Walk away]` |
| 2 | `shrine_of_pain` | An iron shrine drips with old blood. A lever invites you to feed it. | `[Pull the lever — -15% HP, +100g]` / `[Leave it untouched]` |
| 3 | `starving_merchant` | A pale merchant offers gold for fresh wounds. He will not say why. | `[Bleed for him — -25% HP, +200g]` / `[Decline]` |
| 4 | `wishing_well` | A well demands tribute. The water turns red where the coins fall. | `[Toss a coin — -30% HP, +250g]` / `[Walk past]` |
| 5 | `gamblers_dice` | A gambler at a roadside table wagers against your vigor. | `[Roll — -10% HP, +50g]` / `[Don't roll]` |
| 6 | `dark_pact` | A whisper from nowhere offers riches for a fragment of soul. | `[Accept the gold — -35% HP, +300g]` / `[Reject the whisper]` |
| 7 | `silent_priest` | A robed priest offers healing for a coin. He does not speak. | `[Tithe — -80g, +25% HP]` / `[Decline]` |
| 8 | `bone_dust_pedlar` | A pedlar sells bone dust said to seal even mortal wounds. | `[Buy a pinch — -100g, +30% HP]` / `[Walk past]` |
| 9 | `abandoned_chest` | An unattended chest sits in an alcove. The lid lifts without resistance. | `[Take the gold — +100g]` / `[Leave it, suspect a trap]` |
| 10 | `forgotten_traveler` | A skeleton clutches a fresh satchel. The bones are old; the contents are not. | `[Loot the satchel — +rare item]` / `[Show respect, walk on]` |
| 11 | `glimmering_pile` | A neat pile of coins rests on a stone slab. No owner in sight. | `[Take it — +75g]` / `[Leave it untouched]` |
| 12 | `cursed_mirror` | A cursed mirror shows one hero their doom. The room grows colder as they stare. | `[Gaze — that hero is Lost, +rare item]` / `[Pull them away — -40% HP]` |
| 13 | `the_pit` | A pit yawns beneath the floor; one hero hangs by their fingers. | `[Let them go — they are Lost, +200g]` / `[Try to save them — -30% HP]` |
| 14 | `siren_song` | A song drifts from the dark. One of yours stops listening to anything else. | `[Let them follow — they are Lost, +250g + uncommon item]` / `[Drag them back — -25% HP]` |
| 15 | `midnight_market` | A market materialises in the gloom. The stalls vanish if you blink. | `[Buy from the dealer — -150g, +rare item]` / `[Browse and leave]` |

### Crypt-specific (5 — `dungeonId: 'crypt'`)

| # | id | body | choices |
|---|---|---|---|
| 16 | `skeletal_hand` | A bone hand emerges from the rubble. It clutches something that glints. | `[Pry it loose — -10% HP, +100g]` / `[Walk past]` |
| 17 | `broken_sarcophagus` | A cracked sarcophagus oozes black mist. Inside, faint glimmers. | `[Reach inside — -20% HP, +rare item]` / `[Reseal it]` |
| 18 | `ghost_pact` | A pale ghost offers passage in exchange for a hero's eternal company. | `[Accept — that hero is Lost, +250g + uncommon item]` / `[Refuse — -35% HP]` |
| 19 | `necromancers_journal` | A journal lies open on a stone table. The runes burn the eyes that read them. | `[Read it — -20% HP, +uncommon item]` / `[Burn it, +50g]` |
| 20 | `whispering_skull` | A skull on a pedestal whispers your names, one by one. | `[Listen — -15% HP, +75g]` / `[Smash it]` |

**Note on ids:** apostrophes removed from ids (`gamblers_dice`, `necromancers_journal`) since `EventCardId` is a plain string and apostrophes in keys complicate object-literal ergonomics.

## 3 · Payload encodings

Conventions:

- HP percentages: `percent: -0.20` for `-20%`, `percent: 0.25` for `+25%`.
- Gold: `amount: 150` for gain, `amount: -80` for loss.
- Items: `rarity: 'common' | 'uncommon' | 'rare'` per card.
- Lost-hero: `{ kind: 'lose_hero' }` — UI passes `selectedHeroIndex` at choice time.
- Decline / Walk-away: empty `payloads: []`.

### 3.1 · Sample encodings

```ts
hooded_stranger: {
  id: 'hooded_stranger',
  body: 'A hooded stranger blocks your path, palm extended. The price of passage is paid in blood.',
  choices: [
    {
      label: 'Bleed and pass',
      payloads: [
        { kind: 'hp_delta_party', percent: -0.20 },
        { kind: 'gold_delta', amount: 150 },
      ],
    },
    { label: 'Walk away', payloads: [] },
  ],
},

silent_priest: {
  id: 'silent_priest',
  body: 'A robed priest offers healing for a coin. He does not speak.',
  choices: [
    {
      label: 'Tithe',
      payloads: [
        { kind: 'gold_delta', amount: -80 },
        { kind: 'hp_delta_party', percent: 0.25 },
      ],
    },
    { label: 'Decline', payloads: [] },
  ],
},

forgotten_traveler: {
  id: 'forgotten_traveler',
  body: 'A skeleton clutches a fresh satchel. The bones are old; the contents are not.',
  choices: [
    {
      label: 'Loot the satchel',
      payloads: [{ kind: 'add_item', rarity: 'rare' }],
    },
    { label: 'Show respect, walk on', payloads: [] },
  ],
},

cursed_mirror: {
  id: 'cursed_mirror',
  body: 'A cursed mirror shows one hero their doom. The room grows colder as they stare.',
  choices: [
    {
      label: 'Gaze',
      payloads: [
        { kind: 'lose_hero' },
        { kind: 'add_item', rarity: 'rare' },
      ],
    },
    {
      label: 'Pull them away',
      payloads: [{ kind: 'hp_delta_party', percent: -0.40 }],
    },
  ],
},

ghost_pact: {
  id: 'ghost_pact',
  body: 'A pale ghost offers passage in exchange for a hero\'s eternal company.',
  choices: [
    {
      label: 'Accept',
      payloads: [
        { kind: 'lose_hero' },
        { kind: 'gold_delta', amount: 250 },
        { kind: 'add_item', rarity: 'uncommon' },
      ],
    },
    {
      label: 'Refuse',
      payloads: [{ kind: 'hp_delta_party', percent: -0.35 }],
    },
  ],
  dungeonId: 'crypt',
},
```

The other 15 cards follow these patterns mechanically. The implementation plan will spell out each card's payload array.

### 3.2 · Resolver-edge-case verification

Two interactions to confirm via tests since they're easy to miss when authoring:

- **Lost-with-multi-payload (`cursed_mirror`, `siren_song`, `ghost_pact`):** these cards have `[lose_hero, ...other payloads]` in one choice. Per the Task 13 resolver's args-validate-up-front behavior, `lose_hero` runs first against the *current* party; subsequent payloads (`add_item`, `gold_delta`) run on the post-lose RunState and write to the pack normally. Outcome accumulates both `heroLost` and the other deltas.
- **Multi-Lost prevention:** none of the 20 cards has two `lose_hero` payloads in a single choice. The Task 13 spec noted multi-Lost-in-one-choice would re-use the same `selectedHeroIndex` (a bug surface). The deck respects the constraint; tested below.

## 4 · File structure

| File | Change |
|---|---|
| `src/data/events.ts` | Populate `EVENTS` with the 20-card record. Group by category in source for readability (trades, reverse-trades, free-rewards, Lost-gambles, then Crypt-themed). |
| `src/data/__tests__/events.test.ts` | Replace the existing "EVENTS is empty" test with concrete deck assertions. |

No new files; no other touchpoints.

## 5 · Test plan

`src/data/__tests__/events.test.ts` (rewrite — the existing "EVENTS is empty" test is replaced):

### Deck shape

- `EVENTS` has exactly 20 cards (`Object.keys(EVENTS).length === 20`).
- Exactly 5 cards have `dungeonId === 'crypt'`; 15 have `dungeonId === undefined`.

### Lost coverage

- Exactly 4 cards include a `lose_hero` payload anywhere in their choices (3 shared + 1 Crypt).
- No card has two `lose_hero` payloads in any single choice.

### Payload-kind coverage

- At least one card uses each payload kind: `hp_delta_party`, `gold_delta`, `add_item`, `lose_hero`.

### Card structure validation

- Every card has exactly 2 choices.
- Every card has a non-empty body.
- Every card's id matches its key in the `EVENTS` record (`EVENTS[id].id === id`).
- Every card's id is unique across the deck (set size === 20).

### End-to-end resolution sanity

- `applyEventChoice(rs, EVENTS.hooded_stranger, 0, {}, rng)` returns the expected HP delta and `+150g` outcome.
- `applyEventChoice(rs, EVENTS.silent_priest, 0, {}, rng)` returns `-80g` and a positive HP delta on each hero.

(Full resolver behavior is covered by Task 13's `event_resolver.test.ts`; these two cases are deck-level smoke tests.)

## 6 · Save schema

No schema change. Cards are pure data; saves don't reference card content directly. The system shipped in Task 13 is unaffected.

## 7 · Open questions

None at design time. All numerical knobs (HP percentages, gold amounts, item rarities) live as inline literals in `EVENTS` and are tunable per-card. Card body text and choice labels are open to revision during implementation review.
