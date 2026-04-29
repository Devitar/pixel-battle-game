# Event Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author 20 event cards in `EVENTS` (15 shared + 5 Crypt-specific). 4 cards trigger Lost outcomes. No new mechanics — pure content authoring against the Cluster A · 13 system.

**Architecture:** Single content-authoring task. Rewrite `src/data/__tests__/events.test.ts` from the existing "EVENTS is empty" test to deck-shape assertions, then populate `EVENTS` in `src/data/events.ts` with 20 cards. Tests verify count / dungeon split / payload-kind coverage / Lost coverage / structure invariants / two end-to-end resolver smoke checks.

**Tech Stack:** TypeScript, Vitest. No Phaser imports.

**Spec:** `docs/superpowers/specs/2026-04-29-event-deck-design.md`. Read before starting.

---

## Task 1: Populate `EVENTS` with 20 cards

**Files:**
- Modify: `src/data/events.ts` (replace `EVENTS = {}` with the populated record)
- Modify: `src/data/__tests__/events.test.ts` (replace existing "EVENTS is empty" test with deck assertions)

- [ ] **Step 1.1: Rewrite the test file**

Open `src/data/__tests__/events.test.ts`. Replace the entire file contents with:

```typescript
import { describe, expect, it } from 'vitest';
import { applyEventChoice } from '../../run/event_resolver';
import { startRun } from '../../run/run_state';
import { createHero } from '../../heroes/hero';
import { createRng } from '../../util/rng';
import { EVENTS, type EventCard, type EventPayload } from '../events';

function makeRun() {
  return startRun(
    'crypt',
    [
      createHero('knight', 'K', 'h0', 'quick', 'body1'),
      createHero('archer', 'A', 'h1', 'quick', 'body1'),
      createHero('priest', 'P', 'h2', 'quick', 'body1'),
    ],
    1,
    createRng(1),
  );
}

const ALL_CARDS: EventCard[] = Object.values(EVENTS);

describe('EVENTS deck — shape', () => {
  it('has exactly 20 cards', () => {
    expect(Object.keys(EVENTS)).toHaveLength(20);
  });

  it('15 cards are shared (dungeonId === undefined)', () => {
    const shared = ALL_CARDS.filter((c) => c.dungeonId === undefined);
    expect(shared).toHaveLength(15);
  });

  it('5 cards are Crypt-specific (dungeonId === "crypt")', () => {
    const crypt = ALL_CARDS.filter((c) => c.dungeonId === 'crypt');
    expect(crypt).toHaveLength(5);
  });
});

describe('EVENTS deck — Lost coverage', () => {
  it('exactly 4 cards have a lose_hero payload anywhere in their choices', () => {
    const lostCards = ALL_CARDS.filter((c) =>
      c.choices.some((choice) =>
        choice.payloads.some((p) => p.kind === 'lose_hero'),
      ),
    );
    expect(lostCards).toHaveLength(4);
  });

  it('no choice contains two or more lose_hero payloads', () => {
    for (const card of ALL_CARDS) {
      for (const choice of card.choices) {
        const loseHeroCount = choice.payloads.filter((p) => p.kind === 'lose_hero').length;
        expect(loseHeroCount, `card '${card.id}' choice has ${loseHeroCount} lose_hero payloads`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('EVENTS deck — payload-kind coverage', () => {
  function deckIncludesPayloadKind(kind: EventPayload['kind']): boolean {
    return ALL_CARDS.some((c) =>
      c.choices.some((choice) =>
        choice.payloads.some((p) => p.kind === kind),
      ),
    );
  }

  it('at least one card uses hp_delta_party', () => {
    expect(deckIncludesPayloadKind('hp_delta_party')).toBe(true);
  });

  it('at least one card uses gold_delta', () => {
    expect(deckIncludesPayloadKind('gold_delta')).toBe(true);
  });

  it('at least one card uses add_item', () => {
    expect(deckIncludesPayloadKind('add_item')).toBe(true);
  });

  it('at least one card uses lose_hero', () => {
    expect(deckIncludesPayloadKind('lose_hero')).toBe(true);
  });
});

describe('EVENTS deck — card structure validation', () => {
  it('every card has exactly 2 choices', () => {
    for (const card of ALL_CARDS) {
      expect(card.choices, `card '${card.id}'`).toHaveLength(2);
    }
  });

  it('every card has a non-empty body', () => {
    for (const card of ALL_CARDS) {
      expect(card.body.length, `card '${card.id}' has empty body`).toBeGreaterThan(0);
    }
  });

  it("every card's id matches its key in EVENTS", () => {
    for (const [key, card] of Object.entries(EVENTS)) {
      expect(card.id, `EVENTS['${key}'].id mismatch`).toBe(key);
    }
  });

  it("every card's id is unique", () => {
    const ids = ALL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('EVENTS deck — end-to-end resolution sanity', () => {
  it('hooded_stranger choice 0 deals HP damage and gains 150g', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, EVENTS.hooded_stranger, 0, {}, createRng(1));
    expect(result.runState.pack.gold).toBe(rs.pack.gold + 150);
    expect(result.outcome.goldDelta).toBe(150);
    expect(result.outcome.hpChanges).toBeDefined();
    expect(result.outcome.hpChanges!.length).toBeGreaterThan(0);
    for (const change of result.outcome.hpChanges!) {
      expect(change.delta).toBeLessThan(0);
    }
  });

  it('silent_priest choice 0 deducts 80g and heals every hero', () => {
    const rs0 = makeRun();
    // Damage every hero so the heal is observable.
    const damaged = {
      ...rs0,
      pack: { ...rs0.pack, gold: 200 },
      party: rs0.party.map((h) => ({ ...h, currentHp: 1 })),
    };
    const result = applyEventChoice(damaged, EVENTS.silent_priest, 0, {}, createRng(1));
    expect(result.runState.pack.gold).toBe(120);
    expect(result.outcome.goldDelta).toBe(-80);
    for (const hero of result.runState.party) {
      expect(hero.currentHp).toBeGreaterThan(1);
    }
  });
});
```

- [ ] **Step 1.2: Run the tests and verify they fail**

Run: `npx vitest run src/data/__tests__/events.test.ts`

Expected: FAIL — most assertions fail because `EVENTS` is still empty. Specifically:
- "has exactly 20 cards" fails (expects 20, got 0).
- All payload-kind coverage tests fail.
- All structure/end-to-end tests fail or skip due to missing `EVENTS.hooded_stranger` / `EVENTS.silent_priest`.

- [ ] **Step 1.3: Populate `EVENTS` with the 15 shared cards**

Open `src/data/events.ts`. Replace `export const EVENTS: Record<EventCardId, EventCard> = {};` with the populated record. Group by category in source for readability.

```typescript
// Empty for now — Task 14 populates with ~20 cards.
export const EVENTS: Record<EventCardId, EventCard> = {
  // ─── Trades: HP for gold ───────────────────────────────────────────────
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
  shrine_of_pain: {
    id: 'shrine_of_pain',
    body: 'An iron shrine drips with old blood. A lever invites you to feed it.',
    choices: [
      {
        label: 'Pull the lever',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.15 },
          { kind: 'gold_delta', amount: 100 },
        ],
      },
      { label: 'Leave it untouched', payloads: [] },
    ],
  },
  starving_merchant: {
    id: 'starving_merchant',
    body: 'A pale merchant offers gold for fresh wounds. He will not say why.',
    choices: [
      {
        label: 'Bleed for him',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.25 },
          { kind: 'gold_delta', amount: 200 },
        ],
      },
      { label: 'Decline', payloads: [] },
    ],
  },
  wishing_well: {
    id: 'wishing_well',
    body: 'A well demands tribute. The water turns red where the coins fall.',
    choices: [
      {
        label: 'Toss a coin',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.30 },
          { kind: 'gold_delta', amount: 250 },
        ],
      },
      { label: 'Walk past', payloads: [] },
    ],
  },
  gamblers_dice: {
    id: 'gamblers_dice',
    body: 'A gambler at a roadside table wagers against your vigor.',
    choices: [
      {
        label: 'Roll',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.10 },
          { kind: 'gold_delta', amount: 50 },
        ],
      },
      { label: "Don't roll", payloads: [] },
    ],
  },
  dark_pact: {
    id: 'dark_pact',
    body: 'A whisper from nowhere offers riches for a fragment of soul.',
    choices: [
      {
        label: 'Accept the gold',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.35 },
          { kind: 'gold_delta', amount: 300 },
        ],
      },
      { label: 'Reject the whisper', payloads: [] },
    ],
  },

  // ─── Reverse trades: gold for HP heal ──────────────────────────────────
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
  bone_dust_pedlar: {
    id: 'bone_dust_pedlar',
    body: 'A pedlar sells bone dust said to seal even mortal wounds.',
    choices: [
      {
        label: 'Buy a pinch',
        payloads: [
          { kind: 'gold_delta', amount: -100 },
          { kind: 'hp_delta_party', percent: 0.30 },
        ],
      },
      { label: 'Walk past', payloads: [] },
    ],
  },

  // ─── Free-reward / suspicion cards ─────────────────────────────────────
  abandoned_chest: {
    id: 'abandoned_chest',
    body: 'An unattended chest sits in an alcove. The lid lifts without resistance.',
    choices: [
      {
        label: 'Take the gold',
        payloads: [{ kind: 'gold_delta', amount: 100 }],
      },
      { label: 'Leave it, suspect a trap', payloads: [] },
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
  glimmering_pile: {
    id: 'glimmering_pile',
    body: 'A neat pile of coins rests on a stone slab. No owner in sight.',
    choices: [
      {
        label: 'Take it',
        payloads: [{ kind: 'gold_delta', amount: 75 }],
      },
      { label: 'Leave it untouched', payloads: [] },
    ],
  },

  // ─── Lost-hero gambles ─────────────────────────────────────────────────
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
  the_pit: {
    id: 'the_pit',
    body: 'A pit yawns beneath the floor; one hero hangs by their fingers.',
    choices: [
      {
        label: 'Let them go',
        payloads: [
          { kind: 'lose_hero' },
          { kind: 'gold_delta', amount: 200 },
        ],
      },
      {
        label: 'Try to save them',
        payloads: [{ kind: 'hp_delta_party', percent: -0.30 }],
      },
    ],
  },
  siren_song: {
    id: 'siren_song',
    body: 'A song drifts from the dark. One of yours stops listening to anything else.',
    choices: [
      {
        label: 'Let them follow',
        payloads: [
          { kind: 'lose_hero' },
          { kind: 'gold_delta', amount: 250 },
          { kind: 'add_item', rarity: 'uncommon' },
        ],
      },
      {
        label: 'Drag them back',
        payloads: [{ kind: 'hp_delta_party', percent: -0.25 }],
      },
    ],
  },

  // ─── Combo / special ───────────────────────────────────────────────────
  midnight_market: {
    id: 'midnight_market',
    body: 'A market materialises in the gloom. The stalls vanish if you blink.',
    choices: [
      {
        label: 'Buy from the dealer',
        payloads: [
          { kind: 'gold_delta', amount: -150 },
          { kind: 'add_item', rarity: 'rare' },
        ],
      },
      { label: 'Browse and leave', payloads: [] },
    ],
  },
};
```

- [ ] **Step 1.4: Add the 5 Crypt-specific cards**

Append before the closing `};` of the `EVENTS` record. Place after the `midnight_market` entry:

```typescript
  // ─── Crypt-specific ────────────────────────────────────────────────────
  skeletal_hand: {
    id: 'skeletal_hand',
    body: 'A bone hand emerges from the rubble. It clutches something that glints.',
    choices: [
      {
        label: 'Pry it loose',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.10 },
          { kind: 'gold_delta', amount: 100 },
        ],
      },
      { label: 'Walk past', payloads: [] },
    ],
    dungeonId: 'crypt',
  },
  broken_sarcophagus: {
    id: 'broken_sarcophagus',
    body: 'A cracked sarcophagus oozes black mist. Inside, faint glimmers.',
    choices: [
      {
        label: 'Reach inside',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.20 },
          { kind: 'add_item', rarity: 'rare' },
        ],
      },
      { label: 'Reseal it', payloads: [] },
    ],
    dungeonId: 'crypt',
  },
  ghost_pact: {
    id: 'ghost_pact',
    body: "A pale ghost offers passage in exchange for a hero's eternal company.",
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
  necromancers_journal: {
    id: 'necromancers_journal',
    body: 'A journal lies open on a stone table. The runes burn the eyes that read them.',
    choices: [
      {
        label: 'Read it',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.20 },
          { kind: 'add_item', rarity: 'uncommon' },
        ],
      },
      {
        label: 'Burn it',
        payloads: [{ kind: 'gold_delta', amount: 50 }],
      },
    ],
    dungeonId: 'crypt',
  },
  whispering_skull: {
    id: 'whispering_skull',
    body: 'A skull on a pedestal whispers your names, one by one.',
    choices: [
      {
        label: 'Listen',
        payloads: [
          { kind: 'hp_delta_party', percent: -0.15 },
          { kind: 'gold_delta', amount: 75 },
        ],
      },
      { label: 'Smash it', payloads: [] },
    ],
    dungeonId: 'crypt',
  },
```

- [ ] **Step 1.5: Run the tests and verify they pass**

Run: `npx vitest run src/data/__tests__/events.test.ts`

Expected: PASS — all assertions green:
- 20 cards / 15 shared / 5 Crypt.
- 4 Lost-bearing cards.
- All four payload kinds covered.
- All structure invariants hold.
- Both end-to-end resolution sanity checks pass.

- [ ] **Step 1.6: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total test count delta from baseline = +14 (4 deck-shape + 2 Lost coverage + 4 payload-kind coverage + 4 structure + 2 sanity − 1 replaced).

Actually, the existing `events.test.ts` had 3 tests (the empty-table + two payload-types smoke checks). The new file ships ~16 tests. Net delta ≈ +13.

- [ ] **Step 1.7: Commit**

```bash
git add src/data/events.ts src/data/__tests__/events.test.ts
git commit -m "feat(data): initial event deck (15 shared + 5 Crypt-specific cards)"
```

---

## Closing checklist

- [ ] **Task landed in 1 commit**, with green tests and green tsc.
- [ ] **No imports of `phaser`** under `src/data/`. Verify via:
  ```bash
  grep -r "from 'phaser'" src/data || echo "OK — no phaser imports"
  ```
  Expected output: `OK — no phaser imports`.
- [ ] **gdd.md** is the design source of truth. Card body text and choice labels are tonal calls; tunable per card.
- [ ] **Out-of-scope follow-ups** the spec called out:
  - Floor-generator integration (`'event'` Node variant, fork-shape RNG inclusion) — future task.
  - Cluster A · 15 — Lost-vs-Fallen save serialization in `CashoutOutcome` / `WipeOutcome` and Cluster B · 11 scene wiring. **Note:** the event card requirement from Task 15's acceptance ("at least one event card triggers a Lost outcome") is **already satisfied** by this deck — Task 15 narrows to the schema/scene work only.
  - Cluster B · 5 — event card UI overlay.
  - Per-card balance playtesting — numbers in the deck are first-pass.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster A · 14 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commit, awaiting user direction per CLAUDE.md.

**Test count delta from baseline:** +13 (16 new − 3 replaced).
