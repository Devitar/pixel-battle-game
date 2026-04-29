# Event System Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the event-card data shapes (`EventCard`, `EventChoice`, `EventPayload`), the `drawEventCard` deck helper, the `applyEventChoice` resolver, and a `loseHero` operation on `RunState` (sliced from Cluster A · 15). Resolver supports four payload kinds: `hp_delta_party`, `gold_delta`, `add_item`, `lose_hero`.

**Architecture:** Five sequential tasks, each landing a green test suite and one commit.

1. `data/events.ts` — types + empty `EVENTS` table.
2. `dungeon/event_deck.ts` — `drawEventCard` helper with dungeon filtering.
3. `dungeon/loot.ts` — new exported `rollEventItem(rng, floor, rarity)` helper.
4. `run/run_state.ts` — `RunState.lost: readonly Hero[]`, `loseHero` op; `save/save.ts` normalizer default for `lost`.
5. `run/event_resolver.ts` — `applyEventChoice` resolver wiring all four payload kinds together.

After Task 5, the event system is end-to-end testable. Downstream tasks (Cluster A · 14 cards, Cluster A · 15 Lost-category save serialization, future floor integration, Cluster B · 5 UI overlay) plug in without further core changes.

**Tech Stack:** TypeScript, Vitest. No Phaser imports under `src/data/`, `src/dungeon/`, `src/run/`, `src/save/`.

**Spec:** `docs/superpowers/specs/2026-04-29-event-system-core-design.md`. Read it before starting.

**Numerical knobs (from spec §5.1):**

- HP delta from events clamps at min 1 HP per hero (events don't kill).
- Gold delta clamps at 0 (negative deltas cap at current pack gold).
- Decks draw with replacement.

---

## Task 1: `data/events.ts` — types + empty `EVENTS`

Define the event-card types. `EVENTS` ships empty for now; Task 14 will populate it. Tests in this task are smoke-checks (types compile, table is empty).

**Files:**
- Create: `src/data/events.ts`
- Create: `src/data/__tests__/events.test.ts`

- [ ] **Step 1.1: Write the failing test file**

Create `src/data/__tests__/events.test.ts` with this exact content:

```typescript
import { describe, expect, it } from 'vitest';
import { EVENTS, type EventCard, type EventPayload } from '../events';

describe('EVENTS table', () => {
  it('is empty (Task 14 will populate)', () => {
    expect(Object.keys(EVENTS)).toHaveLength(0);
  });
});

describe('EventPayload smoke-check', () => {
  it('all four payload kinds are well-typed', () => {
    const p1: EventPayload = { kind: 'hp_delta_party', percent: -0.20 };
    const p2: EventPayload = { kind: 'gold_delta', amount: 150 };
    const p3: EventPayload = { kind: 'add_item', rarity: 'rare' };
    const p4: EventPayload = { kind: 'lose_hero' };
    const all: EventPayload[] = [p1, p2, p3, p4];
    expect(all).toHaveLength(4);
  });

  it('EventCard accepts a 2-choice card with optional dungeonId', () => {
    const card: EventCard = {
      id: 'test_card',
      body: 'A test card.',
      choices: [
        { label: 'Yes', payloads: [{ kind: 'gold_delta', amount: 50 }] },
        { label: 'No', payloads: [] },
      ],
    };
    expect(card.choices).toHaveLength(2);
    expect(card.dungeonId).toBeUndefined();
  });
});
```

- [ ] **Step 1.2: Run the test and verify it fails**

Run: `npx vitest run src/data/__tests__/events.test.ts`

Expected: FAIL — `Cannot find module '../events'`.

- [ ] **Step 1.3: Create `data/events.ts`**

Create `src/data/events.ts` with this exact content:

```typescript
import type { DungeonId, Rarity } from './types';

export type EventCardId = string;

export type EventPayload =
  | { kind: 'hp_delta_party'; percent: number }
  | { kind: 'gold_delta'; amount: number }
  | { kind: 'add_item'; rarity: Rarity }
  | { kind: 'lose_hero' };

export interface EventChoice {
  label: string;
  payloads: readonly EventPayload[];
}

export interface EventCard {
  id: EventCardId;
  body: string;
  choices: readonly [EventChoice, EventChoice];
  dungeonId?: DungeonId;
}

// Empty for now — Task 14 populates with ~20 cards.
export const EVENTS: Record<EventCardId, EventCard> = {};
```

- [ ] **Step 1.4: Run the test and verify it passes**

Run: `npx vitest run src/data/__tests__/events.test.ts`

Expected: PASS — all 3 cases green.

- [ ] **Step 1.5: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total = baseline + 3.

- [ ] **Step 1.6: Commit**

```bash
git add src/data/events.ts src/data/__tests__/events.test.ts
git commit -m "feat(data): event card types + empty EVENTS table"
```

---

## Task 2: `dungeon/event_deck.ts` — `drawEventCard` helper

Add the deck-draw helper that filters by dungeon and picks via RNG. Throws on empty pool.

**Files:**
- Create: `src/dungeon/event_deck.ts`
- Create: `src/dungeon/__tests__/event_deck.test.ts`

- [ ] **Step 2.1: Write the failing test file**

Create `src/dungeon/__tests__/event_deck.test.ts` with this exact content:

```typescript
import { describe, expect, it } from 'vitest';
import type { EventCard } from '../../data/events';
import type { DungeonId } from '../../data/types';
import { createRng } from '../../util/rng';
import { drawEventCard } from '../event_deck';

const SHARED_A: EventCard = {
  id: 'shared_a',
  body: 'shared a',
  choices: [
    { label: 'Yes', payloads: [] },
    { label: 'No', payloads: [] },
  ],
};

const SHARED_B: EventCard = {
  id: 'shared_b',
  body: 'shared b',
  choices: [
    { label: 'Yes', payloads: [] },
    { label: 'No', payloads: [] },
  ],
};

const CRYPT_ONLY: EventCard = {
  id: 'crypt_only',
  body: 'crypt only',
  choices: [
    { label: 'Yes', payloads: [] },
    { label: 'No', payloads: [] },
  ],
  dungeonId: 'crypt',
};

describe('drawEventCard', () => {
  it('returns a card whose dungeonId is undefined or matches the requested dungeon', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const card = drawEventCard([SHARED_A, CRYPT_ONLY], 'crypt', createRng(seed));
      expect(card.dungeonId === undefined || card.dungeonId === 'crypt').toBe(true);
    }
  });

  it('filters out cards whose dungeonId does not match the requested dungeon', () => {
    // Construct a card stamped to a non-'crypt' dungeon. DungeonId is currently a single-member
    // union ('crypt'); cast to bypass the compile-time constraint to validate the runtime filter.
    const otherDungeonOnly: EventCard = {
      ...SHARED_B,
      id: 'other_only',
      dungeonId: 'sunken_keep' as DungeonId,
    };
    for (let seed = 1; seed <= 50; seed++) {
      const card = drawEventCard([SHARED_A, otherDungeonOnly], 'crypt', createRng(seed));
      expect(card.id).not.toBe('other_only');
      expect(card.id).toBe('shared_a');
    }
  });

  it('throws if the eligible pool is empty', () => {
    expect(() => drawEventCard([], 'crypt', createRng(1))).toThrow();
  });

  it('throws if no cards in the pool match the requested dungeon', () => {
    const otherDungeonOnly: EventCard = {
      ...SHARED_B,
      id: 'other_only',
      dungeonId: 'sunken_keep' as DungeonId,
    };
    expect(() => drawEventCard([otherDungeonOnly], 'crypt', createRng(1))).toThrow();
  });

  it('determinism: same seed + same eligible pool → same card', () => {
    const a = drawEventCard([SHARED_A, SHARED_B, CRYPT_ONLY], 'crypt', createRng(42));
    const b = drawEventCard([SHARED_A, SHARED_B, CRYPT_ONLY], 'crypt', createRng(42));
    expect(a.id).toBe(b.id);
  });
});
```

- [ ] **Step 2.2: Run the test and verify it fails**

Run: `npx vitest run src/dungeon/__tests__/event_deck.test.ts`

Expected: FAIL — `Cannot find module '../event_deck'`.

- [ ] **Step 2.3: Create `dungeon/event_deck.ts`**

Create `src/dungeon/event_deck.ts` with this exact content:

```typescript
import type { EventCard } from '../data/events';
import type { DungeonId } from '../data/types';
import type { Rng } from '../util/rng';

export function drawEventCard(
  cards: readonly EventCard[],
  dungeonId: DungeonId,
  rng: Rng,
): EventCard {
  const eligible = cards.filter(
    (c) => c.dungeonId === undefined || c.dungeonId === dungeonId,
  );
  if (eligible.length === 0) {
    throw new Error(`drawEventCard: no eligible cards for dungeon '${dungeonId}'`);
  }
  return rng.pick(eligible);
}
```

- [ ] **Step 2.4: Run the test and verify it passes**

Run: `npx vitest run src/dungeon/__tests__/event_deck.test.ts`

Expected: PASS — all 5 cases green.

- [ ] **Step 2.5: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total = previous + 5.

- [ ] **Step 2.6: Commit**

```bash
git add src/dungeon/event_deck.ts src/dungeon/__tests__/event_deck.test.ts
git commit -m "feat(dungeon): drawEventCard helper with dungeon filtering"
```

---

## Task 3: `dungeon/loot.ts` — `rollEventItem` helper

Add an exported `rollEventItem(rng, floor, rarity)` helper that generates an item of a fixed rarity. Reuses the internal helpers used by `rollLoot` / `rollShopItem`.

**Files:**
- Modify: `src/dungeon/loot.ts`
- Modify: `src/dungeon/__tests__/loot.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Open `src/dungeon/__tests__/loot.test.ts`. At the bottom of the file, append a new describe block:

```typescript
describe('rollEventItem', () => {
  it('always returns an item (never null)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const item = rollEventItem(createRng(seed), 1, 'common');
      expect(item).not.toBeNull();
    }
  });

  it('item rarity equals the requested rarity (common)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const item = rollEventItem(createRng(seed), 5, 'common');
      expect(item.rarity).toBe('common');
    }
  });

  it('item rarity equals the requested rarity (uncommon)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const item = rollEventItem(createRng(seed), 5, 'uncommon');
      expect(item.rarity).toBe('uncommon');
    }
  });

  it('item rarity equals the requested rarity (rare)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const item = rollEventItem(createRng(seed), 5, 'rare');
      expect(item.rarity).toBe('rare');
    }
  });

  it('floorRolledAt equals the floor passed in', () => {
    for (const floor of [1, 7, 12]) {
      const item = rollEventItem(createRng(1), floor, 'rare');
      expect(item.floorRolledAt).toBe(floor);
    }
  });

  it('determinism: same seed + floor + rarity → identical item', () => {
    const a = rollEventItem(createRng(123), 7, 'rare');
    const b = rollEventItem(createRng(123), 7, 'rare');
    expect(a).toEqual(b);
  });
});
```

Also extend the imports at the top of the file:

```typescript
import { rollLoot, rollEventItem } from '../loot';
```

- [ ] **Step 3.2: Run the test and verify it fails**

Run: `npx vitest run src/dungeon/__tests__/loot.test.ts -t 'rollEventItem'`

Expected: FAIL — `rollEventItem is not exported` or compilation error.

- [ ] **Step 3.3: Add `rollEventItem` to `loot.ts`**

Open `src/dungeon/loot.ts`. After the existing `rollShopItem` function (around line 130–156), add:

```typescript
export function rollEventItem(rng: Rng, floorNumber: number, rarity: Rarity): Item {
  // Always-drop, forced-rarity item. Slot picked uniformly. Affixes / rare-property
  // scaled at current floor. Used by the event-resolver's add_item payload.
  const slot = rng.pick(ALL_SLOTS);
  const base = pickBaseId(rng, slot);
  const affixIds = pickAffixes(rng, affixCount(rarity, slot));
  const affixes: RolledAffix[] = affixIds.map((id) => ({
    affixId: id,
    value: rollAffixValue(id, floorNumber),
  }));
  const rareProperty = rarity === 'rare' ? pickRareProperty(rng, slot, floorNumber) : undefined;
  const id = generateItemId(rng);
  return {
    id,
    baseId: base.baseId,
    slot,
    rarity,
    ...(base.weaponType !== undefined ? { weaponType: base.weaponType } : {}),
    affixes,
    ...(rareProperty !== undefined ? { rareProperty } : {}),
    floorRolledAt: floorNumber,
  };
}
```

- [ ] **Step 3.4: Run the tests and verify they pass**

Run: `npx vitest run src/dungeon/__tests__/loot.test.ts`

Expected: PASS — all existing loot tests + 6 new rollEventItem tests green.

- [ ] **Step 3.5: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total = previous + 6.

- [ ] **Step 3.6: Commit**

```bash
git add src/dungeon/loot.ts src/dungeon/__tests__/loot.test.ts
git commit -m "feat(dungeon): rollEventItem helper (forced-rarity item roll)"
```

---

## Task 4: `RunState.lost` + `loseHero` op + save normalizer

Extend `RunState` with `lost: readonly Hero[]`. Add `loseHero(rs, heroIndex): RunState`. Update `startRun` to initialize `lost: []`. Update the save normalizer to default missing `runState.lost` to `[]` for backward compat.

**Files:**
- Modify: `src/run/run_state.ts`
- Modify: `src/run/__tests__/run_state.test.ts`
- Modify: `src/save/save.ts`
- Modify: `src/save/__tests__/save.test.ts`

- [ ] **Step 4.1: Write failing tests for `RunState.lost` + `loseHero`**

Open `src/run/__tests__/run_state.test.ts`. Add `loseHero` to the existing imports from `'../run_state'`:

```typescript
import {
  cashout,
  chooseCampNodeEffect,
  chooseNextNode,
  completeCombat,
  currentNode,
  leaveShop,
  loseHero,
  nextNodeChoices,
  playerPath,
  pressOn,
  purchaseItem,
  startRun,
} from '../run_state';
```

At the bottom of the file (after the last existing describe), append a new describe block:

```typescript
describe('startRun — lost field', () => {
  it('initializes lost as empty array', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.lost).toEqual([]);
  });
});

describe('loseHero', () => {
  it('removes hero at index from party and appends to lost', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.party).toHaveLength(3);
    expect(rs.lost).toHaveLength(0);
    const after = loseHero(rs, 1);
    expect(after.party).toHaveLength(2);
    expect(after.party[0].id).toBe('h0');
    expect(after.party[1].id).toBe('h2');
    expect(after.lost).toHaveLength(1);
    expect(after.lost[0].id).toBe('h1');
  });

  it('strips equipped gear from the lost hero (all 4 slots undefined)', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Verify the hero has at least some equipment to start.
    const heroBefore = rs.party[0];
    expect(heroBefore.equipment).toBeDefined();
    const after = loseHero(rs, 0);
    const lostHero = after.lost[0];
    expect(lostHero.equipment.weapon).toBeUndefined();
    expect(lostHero.equipment.shield).toBeUndefined();
    expect(lostHero.equipment.outfit).toBeUndefined();
    expect(lostHero.equipment.hat).toBeUndefined();
  });

  it('throws on heroIndex out of range', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(() => loseHero(rs, 99)).toThrow();
    expect(() => loseHero(rs, -1)).toThrow();
  });

  it('multiple loseHero calls accumulate in lost', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const after1 = loseHero(rs, 0);
    const after2 = loseHero(after1, 0); // index 0 is the next surviving hero
    expect(after2.party).toHaveLength(1);
    expect(after2.lost).toHaveLength(2);
  });
});
```

- [ ] **Step 4.2: Run the test and verify it fails**

Run: `npx vitest run src/run/__tests__/run_state.test.ts -t 'startRun — lost field|loseHero'`

Expected: FAIL — `loseHero is not exported`, and `rs.lost` is `undefined`.

- [ ] **Step 4.3: Add `lost` to `RunState` + initialize in `startRun` + add `loseHero` op**

Open `src/run/run_state.ts`. Find the `RunState` interface (around line 15–26):

```typescript
export interface RunState {
  readonly dungeonId: DungeonId;
  readonly seed: number;
  readonly party: readonly Hero[];
  readonly pack: Pack;
  readonly currentFloorNumber: number;
  readonly currentFloorNodes: readonly Node[];
  readonly currentNodeId: string;
  readonly awaitingFork: boolean;
  readonly status: RunStatus;
  readonly fallen: readonly Hero[];
}
```

Add `lost`:

```typescript
export interface RunState {
  readonly dungeonId: DungeonId;
  readonly seed: number;
  readonly party: readonly Hero[];
  readonly pack: Pack;
  readonly currentFloorNumber: number;
  readonly currentFloorNodes: readonly Node[];
  readonly currentNodeId: string;
  readonly awaitingFork: boolean;
  readonly status: RunStatus;
  readonly fallen: readonly Hero[];
  readonly lost: readonly Hero[];
}
```

Find `startRun` (around line 45–67). The existing return value:

```typescript
return {
  dungeonId,
  seed,
  party: [...party],
  pack: createPack(),
  currentFloorNumber: 1,
  currentFloorNodes: nodes,
  currentNodeId: startNodeId,
  awaitingFork: false,
  status: 'in_dungeon',
  fallen: [],
};
```

Add `lost: []`:

```typescript
return {
  dungeonId,
  seed,
  party: [...party],
  pack: createPack(),
  currentFloorNumber: 1,
  currentFloorNodes: nodes,
  currentNodeId: startNodeId,
  awaitingFork: false,
  status: 'in_dungeon',
  fallen: [],
  lost: [],
};
```

Add the `loseHero` function. Place it after `chooseCampNodeEffect` (search for that name to find a good neighborhood):

```typescript
export function loseHero(runState: RunState, heroIndex: number): RunState {
  if (heroIndex < 0 || heroIndex >= runState.party.length) {
    throw new Error(`loseHero: index ${heroIndex} out of range [0, ${runState.party.length})`);
  }
  const hero = runState.party[heroIndex];
  // Strip equipped gear (per gdd §8 — gear is gone with the Lost hero, not transferred to pack).
  const stripped: Hero = {
    ...hero,
    equipment: { weapon: undefined, shield: undefined, outfit: undefined, hat: undefined },
  };
  return {
    ...runState,
    party: runState.party.filter((_, i) => i !== heroIndex),
    lost: [...runState.lost, stripped],
  };
}
```

- [ ] **Step 4.4: Run the tests and verify they pass**

Run: `npx vitest run src/run/__tests__/run_state.test.ts`

Expected: PASS — all existing run_state tests + 4 new tests green.

- [ ] **Step 4.5: Update the save normalizer**

Saves predating this change will load with `runState.lost === undefined`. The `normalizeSaveFile` function needs to default it to `[]`.

Open `src/save/save.ts`. Find `normalizeSaveFile` (around line 96–105):

```typescript
function normalizeSaveFile(file: SaveFile): SaveFile {
  return {
    ...file,
    stash: file.stash ?? createStash(),
    roster: {
      ...file.roster,
      heroes: file.roster.heroes.map(normalizeHero),
    },
  };
}
```

Replace with:

```typescript
function normalizeSaveFile(file: SaveFile): SaveFile {
  return {
    ...file,
    stash: file.stash ?? createStash(),
    roster: {
      ...file.roster,
      heroes: file.roster.heroes.map(normalizeHero),
    },
    runState: file.runState === undefined
      ? undefined
      : { ...file.runState, lost: file.runState.lost ?? [] },
  };
}
```

- [ ] **Step 4.6: Write a failing test for the save-normalizer default**

Open `src/save/__tests__/save.test.ts`. Find a good spot near the other normalize tests (search for `normalize` or `stash` in the file). At the bottom of the file, append:

```typescript
describe('save normalizer — runState.lost default', () => {
  it('defaults missing runState.lost to []', () => {
    const storage: Storage = {
      length: 1,
      key: () => null,
      clear: () => {},
      getItem: (_k: string) => JSON.stringify({
        version: CURRENT_SCHEMA_VERSION,
        roster: { heroes: [], slots: 12 },
        vault: { gold: 0 },
        unlocks: { classes: [], dungeons: [] },
        runState: {
          dungeonId: 'crypt',
          seed: 1,
          party: [],
          pack: { gold: 0, items: [] },
          currentFloorNumber: 1,
          currentFloorNodes: [],
          currentNodeId: '',
          awaitingFork: false,
          status: 'in_dungeon',
          fallen: [],
          // NOTE: lost intentionally omitted to simulate a pre-Task-13 save
        },
        runRngState: 12345,
      }),
      removeItem: () => {},
      setItem: () => {},
    };
    const loaded = load(storage);
    expect(loaded).not.toBeNull();
    expect(loaded!.runState).toBeDefined();
    expect(loaded!.runState!.lost).toEqual([]);
  });

  it('preserves an explicit runState.lost array', () => {
    const fakeHero = {
      id: 'h0', classId: 'knight', name: 'K',
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 5, dodge: 5 },
      currentHp: 0, maxHp: 20,
      traitId: 'quick', bodySpriteId: 'body1',
      wounds: [], equipment: {},
      xp: 0, level: 1, pendingPerk: false,
    };
    const storage: Storage = {
      length: 1,
      key: () => null,
      clear: () => {},
      getItem: (_k: string) => JSON.stringify({
        version: CURRENT_SCHEMA_VERSION,
        roster: { heroes: [], slots: 12 },
        vault: { gold: 0 },
        unlocks: { classes: [], dungeons: [] },
        runState: {
          dungeonId: 'crypt',
          seed: 1,
          party: [],
          pack: { gold: 0, items: [] },
          currentFloorNumber: 1,
          currentFloorNodes: [],
          currentNodeId: '',
          awaitingFork: false,
          status: 'in_dungeon',
          fallen: [],
          lost: [fakeHero],
        },
        runRngState: 12345,
      }),
      removeItem: () => {},
      setItem: () => {},
    };
    const loaded = load(storage);
    expect(loaded!.runState!.lost).toHaveLength(1);
    expect(loaded!.runState!.lost[0].id).toBe('h0');
  });
});
```

Verify the existing imports in `save.test.ts` already include `load` and `CURRENT_SCHEMA_VERSION`. If not, add them at the top:

```typescript
import { load, CURRENT_SCHEMA_VERSION } from '../save';
```

- [ ] **Step 4.7: Run the save tests and verify they pass**

Run: `npx vitest run src/save/__tests__/save.test.ts -t 'runState.lost'`

Expected: PASS — both cases green. (The implementation in step 4.5 already covers the default.)

- [ ] **Step 4.8: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total = previous + 6.

- [ ] **Step 4.9: Commit**

```bash
git add src/run/run_state.ts src/run/__tests__/run_state.test.ts src/save/save.ts src/save/__tests__/save.test.ts
git commit -m "feat(run): RunState.lost + loseHero op + save normalizer default"
```

---

## Task 5: `event_resolver.ts` — `applyEventChoice`

The main resolver wiring. Reads payloads, applies them in order, accumulates structured outcome. Validates `selectedHeroIndex` up-front when any payload is `lose_hero`.

**Files:**
- Create: `src/run/event_resolver.ts`
- Create: `src/run/__tests__/event_resolver.test.ts`

- [ ] **Step 5.1: Write the failing test file**

Create `src/run/__tests__/event_resolver.test.ts` with this exact content:

```typescript
import { describe, expect, it } from 'vitest';
import type { EventCard } from '../../data/events';
import { createHero, type Hero } from '../../heroes/hero';
import { createRng } from '../../util/rng';
import { applyEventChoice } from '../event_resolver';
import type { RunState } from '../run_state';
import { startRun } from '../run_state';

function makeParty(): Hero[] {
  return [
    createHero('knight', 'K', 'h0', 'quick', 'body1'),
    createHero('archer', 'A', 'h1', 'quick', 'body1'),
    createHero('priest', 'P', 'h2', 'quick', 'body1'),
  ];
}

function makeRun(): RunState {
  return startRun('crypt', makeParty(), 1, createRng(1));
}

const HP_DAMAGE_CARD: EventCard = {
  id: 'hp_damage',
  body: 'A test card.',
  choices: [
    { label: 'Take damage', payloads: [{ kind: 'hp_delta_party', percent: -0.20 }] },
    { label: 'Decline', payloads: [] },
  ],
};

const HP_HEAL_CARD: EventCard = {
  id: 'hp_heal',
  body: 'A test card.',
  choices: [
    { label: 'Heal', payloads: [{ kind: 'hp_delta_party', percent: 0.30 }] },
    { label: 'Decline', payloads: [] },
  ],
};

const GOLD_GAIN_CARD: EventCard = {
  id: 'gold_gain',
  body: 'A test card.',
  choices: [
    { label: 'Gain', payloads: [{ kind: 'gold_delta', amount: 100 }] },
    { label: 'Decline', payloads: [] },
  ],
};

const GOLD_LOSS_CARD: EventCard = {
  id: 'gold_loss',
  body: 'A test card.',
  choices: [
    { label: 'Pay', payloads: [{ kind: 'gold_delta', amount: -50 }] },
    { label: 'Decline', payloads: [] },
  ],
};

const ITEM_CARD: EventCard = {
  id: 'item_gain',
  body: 'A test card.',
  choices: [
    { label: 'Take rare item', payloads: [{ kind: 'add_item', rarity: 'rare' }] },
    { label: 'Decline', payloads: [] },
  ],
};

const LOSE_HERO_CARD: EventCard = {
  id: 'lose_hero',
  body: 'A test card.',
  choices: [
    { label: 'Sacrifice a hero', payloads: [{ kind: 'lose_hero' }] },
    { label: 'Decline', payloads: [] },
  ],
};

const COMBO_CARD: EventCard = {
  id: 'combo',
  body: 'A test card.',
  choices: [
    {
      label: 'HP for gold',
      payloads: [
        { kind: 'hp_delta_party', percent: -0.20 },
        { kind: 'gold_delta', amount: 150 },
      ],
    },
    { label: 'Decline', payloads: [] },
  ],
};

describe('applyEventChoice — hp_delta_party', () => {
  it('negative percent reduces every living hero HP by round(maxHp * percent)', () => {
    const rs = makeRun();
    const expected = rs.party.map((h) => h.currentHp - Math.round(h.maxHp * 0.20));
    const result = applyEventChoice(rs, HP_DAMAGE_CARD, 0, {}, createRng(1));
    for (let i = 0; i < result.runState.party.length; i++) {
      expect(result.runState.party[i].currentHp).toBe(expected[i]);
    }
  });

  it('outcome reports per-hero hpChanges deltas', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, HP_DAMAGE_CARD, 0, {}, createRng(1));
    expect(result.outcome.hpChanges).toBeDefined();
    expect(result.outcome.hpChanges).toHaveLength(rs.party.length);
    for (const change of result.outcome.hpChanges!) {
      expect(change.delta).toBeLessThan(0);
    }
  });

  it('positive percent heals, clamped at maxHp', () => {
    const rs0 = makeRun();
    const damaged: RunState = {
      ...rs0,
      party: rs0.party.map((h) => ({ ...h, currentHp: 1 })),
    };
    const result = applyEventChoice(damaged, HP_HEAL_CARD, 0, {}, createRng(1));
    for (const hero of result.runState.party) {
      const expected = Math.min(hero.maxHp, 1 + Math.round(hero.maxHp * 0.30));
      expect(hero.currentHp).toBe(expected);
    }
  });

  it('clamps at min 1 HP per hero (events do not kill)', () => {
    const rs0 = makeRun();
    // Set every hero to exactly 1 HP. A -100% damage payload would otherwise drop them to 1 - max.
    const oneHp: RunState = {
      ...rs0,
      party: rs0.party.map((h) => ({ ...h, currentHp: 1 })),
    };
    const lethalCard: EventCard = {
      id: 'lethal',
      body: 'x',
      choices: [
        { label: 'Take damage', payloads: [{ kind: 'hp_delta_party', percent: -1.0 }] },
        { label: 'Decline', payloads: [] },
      ],
    };
    const result = applyEventChoice(oneHp, lethalCard, 0, {}, createRng(1));
    for (const hero of result.runState.party) {
      expect(hero.currentHp).toBe(1);
    }
  });
});

describe('applyEventChoice — gold_delta', () => {
  it('positive amount increases pack.gold by exactly the amount', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, GOLD_GAIN_CARD, 0, {}, createRng(1));
    expect(result.runState.pack.gold).toBe(rs.pack.gold + 100);
    expect(result.outcome.goldDelta).toBe(100);
  });

  it('negative amount with sufficient gold deducts the amount', () => {
    const rs0 = makeRun();
    const rich: RunState = { ...rs0, pack: { ...rs0.pack, gold: 200 } };
    const result = applyEventChoice(rich, GOLD_LOSS_CARD, 0, {}, createRng(1));
    expect(result.runState.pack.gold).toBe(150);
    expect(result.outcome.goldDelta).toBe(-50);
  });

  it('negative amount exceeding current gold caps at current gold', () => {
    const rs0 = makeRun();
    const poor: RunState = { ...rs0, pack: { ...rs0.pack, gold: 10 } };
    const result = applyEventChoice(poor, GOLD_LOSS_CARD, 0, {}, createRng(1));
    expect(result.runState.pack.gold).toBe(0);
    expect(result.outcome.goldDelta).toBe(-10);
  });
});

describe('applyEventChoice — add_item', () => {
  it('adds an item to pack.items', () => {
    const rs = makeRun();
    expect(rs.pack.items).toHaveLength(0);
    const result = applyEventChoice(rs, ITEM_CARD, 0, {}, createRng(1));
    expect(result.runState.pack.items).toHaveLength(1);
  });

  it('rolled item rarity matches the payload rarity', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, ITEM_CARD, 0, {}, createRng(1));
    expect(result.runState.pack.items[0].rarity).toBe('rare');
  });

  it('item.floorRolledAt equals run currentFloorNumber', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, ITEM_CARD, 0, {}, createRng(1));
    expect(result.runState.pack.items[0].floorRolledAt).toBe(rs.currentFloorNumber);
  });

  it('outcome reports the added item', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, ITEM_CARD, 0, {}, createRng(1));
    expect(result.outcome.itemAdded).toBeDefined();
    expect(result.outcome.itemAdded!.id).toBe(result.runState.pack.items[0].id);
  });
});

describe('applyEventChoice — lose_hero', () => {
  it('strips equipped gear and moves hero from party to lost', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, LOSE_HERO_CARD, 0, { selectedHeroIndex: 1 }, createRng(1));
    expect(result.runState.party).toHaveLength(2);
    expect(result.runState.lost).toHaveLength(1);
    expect(result.runState.lost[0].id).toBe('h1');
    expect(result.runState.lost[0].equipment.weapon).toBeUndefined();
  });

  it('outcome reports heroLost', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, LOSE_HERO_CARD, 0, { selectedHeroIndex: 1 }, createRng(1));
    expect(result.outcome.heroLost).toBeDefined();
    expect(result.outcome.heroLost!.heroIndex).toBe(1);
    expect(result.outcome.heroLost!.heroName).toBe('A');
  });

  it('throws if selectedHeroIndex is missing', () => {
    const rs = makeRun();
    expect(() => applyEventChoice(rs, LOSE_HERO_CARD, 0, {}, createRng(1))).toThrow();
  });

  it('throws if selectedHeroIndex is out of range', () => {
    const rs = makeRun();
    expect(() => applyEventChoice(rs, LOSE_HERO_CARD, 0, { selectedHeroIndex: 99 }, createRng(1))).toThrow();
    expect(() => applyEventChoice(rs, LOSE_HERO_CARD, 0, { selectedHeroIndex: -1 }, createRng(1))).toThrow();
  });
});

describe('applyEventChoice — multi-payload', () => {
  it('combo card applies HP loss then gold gain in sequence', () => {
    const rs = makeRun();
    const expectedHps = rs.party.map((h) => h.currentHp - Math.round(h.maxHp * 0.20));
    const result = applyEventChoice(rs, COMBO_CARD, 0, {}, createRng(1));
    for (let i = 0; i < result.runState.party.length; i++) {
      expect(result.runState.party[i].currentHp).toBe(expectedHps[i]);
    }
    expect(result.runState.pack.gold).toBe(rs.pack.gold + 150);
    expect(result.outcome.hpChanges).toBeDefined();
    expect(result.outcome.goldDelta).toBe(150);
  });

  it('Decline choice (empty payloads) leaves RunState unchanged with empty outcome', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, HP_DAMAGE_CARD, 1, {}, createRng(1));
    expect(result.runState).toEqual(rs);
    expect(result.outcome).toEqual({});
  });
});

describe('applyEventChoice — validation', () => {
  it('throws if choiceIndex is out of range', () => {
    const rs = makeRun();
    expect(() => applyEventChoice(rs, HP_DAMAGE_CARD, 2 as 0 | 1, {}, createRng(1))).toThrow();
  });

  it('failing args validation does not mutate (RunState unchanged via throw)', () => {
    const rs = makeRun();
    expect(() => applyEventChoice(rs, LOSE_HERO_CARD, 0, {}, createRng(1))).toThrow();
    // rs is unchanged; nothing to assert beyond the throw because the function never returns.
  });
});
```

- [ ] **Step 5.2: Run the test and verify it fails**

Run: `npx vitest run src/run/__tests__/event_resolver.test.ts`

Expected: FAIL — `Cannot find module '../event_resolver'`.

- [ ] **Step 5.3: Create `event_resolver.ts`**

Create `src/run/event_resolver.ts` with this exact content:

```typescript
import type { EventCard, EventPayload } from '../data/events';
import type { Item } from '../data/types';
import { rollEventItem } from '../dungeon/loot';
import type { Hero } from '../heroes/hero';
import type { Rng } from '../util/rng';
import { addGold, addItem, spendGold } from './pack';
import { loseHero, type RunState } from './run_state';

export interface EventChoiceArgs {
  selectedHeroIndex?: number;
}

export interface EventOutcome {
  hpChanges?: readonly { heroIndex: number; delta: number }[];
  goldDelta?: number;
  itemAdded?: Item;
  heroLost?: { heroIndex: number; heroName: string };
}

export function applyEventChoice(
  runState: RunState,
  card: EventCard,
  choiceIndex: 0 | 1,
  args: EventChoiceArgs,
  rng: Rng,
): { runState: RunState; outcome: EventOutcome } {
  const choice = card.choices[choiceIndex];
  if (!choice) {
    throw new Error(`applyEventChoice: choiceIndex ${choiceIndex} out of range`);
  }

  // Validate args before any mutation.
  if (choice.payloads.some((p) => p.kind === 'lose_hero')) {
    const idx = args.selectedHeroIndex;
    if (idx === undefined || idx < 0 || idx >= runState.party.length) {
      throw new Error(`applyEventChoice: lose_hero payload requires valid args.selectedHeroIndex`);
    }
  }

  let rs = runState;
  const outcome: EventOutcome = {};

  for (const payload of choice.payloads) {
    const result = applyPayload(rs, payload, args, rng);
    rs = result.runState;
    Object.assign(outcome, result.outcomeDelta);
  }

  return { runState: rs, outcome };
}

function applyPayload(
  rs: RunState,
  payload: EventPayload,
  args: EventChoiceArgs,
  rng: Rng,
): { runState: RunState; outcomeDelta: Partial<EventOutcome> } {
  switch (payload.kind) {
    case 'hp_delta_party': {
      const hpChanges: { heroIndex: number; delta: number }[] = [];
      const newParty: Hero[] = rs.party.map((hero, i) => {
        const raw = Math.round(hero.maxHp * payload.percent);
        const target = Math.max(1, Math.min(hero.maxHp, hero.currentHp + raw));
        const delta = target - hero.currentHp;
        if (delta !== 0) hpChanges.push({ heroIndex: i, delta });
        return { ...hero, currentHp: target };
      });
      return {
        runState: { ...rs, party: newParty },
        outcomeDelta: { hpChanges },
      };
    }
    case 'gold_delta': {
      const before = rs.pack.gold;
      const newPack = payload.amount >= 0
        ? addGold(rs.pack, payload.amount)
        : spendGold(rs.pack, Math.min(rs.pack.gold, -payload.amount));
      const delta = newPack.gold - before;
      return {
        runState: { ...rs, pack: newPack },
        outcomeDelta: { goldDelta: delta },
      };
    }
    case 'add_item': {
      const item = rollEventItem(rng, rs.currentFloorNumber, payload.rarity);
      return {
        runState: { ...rs, pack: addItem(rs.pack, item) },
        outcomeDelta: { itemAdded: item },
      };
    }
    case 'lose_hero': {
      const idx = args.selectedHeroIndex!;  // already validated
      const hero = rs.party[idx];
      const heroName = hero.name;
      return {
        runState: loseHero(rs, idx),
        outcomeDelta: { heroLost: { heroIndex: idx, heroName } },
      };
    }
  }
}
```

- [ ] **Step 5.4: Run the tests and verify they pass**

Run: `npx vitest run src/run/__tests__/event_resolver.test.ts`

Expected: PASS — all ~17 cases green.

- [ ] **Step 5.5: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total = previous + ~17.

- [ ] **Step 5.6: Smoke-check determinism by running the suite twice**

Run: `npm test` again.

Expected: identical pass count, identical seed-bound test outputs.

- [ ] **Step 5.7: Commit**

```bash
git add src/run/event_resolver.ts src/run/__tests__/event_resolver.test.ts
git commit -m "feat(run): applyEventChoice resolver (hp/gold/item/lose_hero payloads)"
```

---

## Closing checklist

- [ ] **All 5 tasks landed in 5 commits**, each with green tests and green tsc.
- [ ] **No imports of `phaser`** under `src/data/`, `src/dungeon/`, `src/run/`, `src/save/`. Verify via:
  ```bash
  grep -r "from 'phaser'" src/data src/dungeon src/run src/save || echo "OK — no phaser imports"
  ```
  Expected output: `OK — no phaser imports`.
- [ ] **gdd.md** is the design source of truth. Numerical knobs (HP-clamp at 1, gold-clamp at 0) live in the resolver.
- [ ] **Out-of-scope follow-ups** the spec called out:
  - Cluster A · 14 — initial event deck (~20 cards).
  - Cluster A · 15 — Lost-vs-Fallen save serialization in CashoutOutcome / WipeOutcome; rename of existing `heroesLost` field if useful; one event card using the `lose_hero` payload.
  - Future floor-integration task — add `'event'` Node variant; route to event-overlay scene.
  - Cluster B · 5 — event card UI overlay.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster A · 13 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commits, awaiting user direction per CLAUDE.md.

**Test count delta from baseline:**
- +3 (Task 1: events types smoke-check)
- +5 (Task 2: drawEventCard)
- +6 (Task 3: rollEventItem)
- +6 (Task 4: RunState.lost + loseHero + save normalizer)
- +~17 (Task 5: event resolver across 4 payload kinds + validation + multi-payload)
- = **+~37 total**
