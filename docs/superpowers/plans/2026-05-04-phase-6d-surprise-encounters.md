# Phase 6d — Surprise Encounters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add RNG-driven mid-corridor surprise encounters during travel toward non-combat nodes, with floor-capped probability, mini skirmishes, and a "tax-not-replacement" model that preserves the chosen destination.

**Architecture:** Pure-TS trigger logic + run-state field for the floor cap; reuses Phase 6c's in-corridor combat infrastructure. Surprise rolling happens at click time (dungeon scene) and threads through an extended corridor handoff. The corridor scene branches between standard travel and "partial scroll → combat → resume scroll" depending on the handoff payload.

**Tech Stack:** TypeScript, Vitest, Phaser 3. Companion spec: `docs/superpowers/specs/2026-05-04-phase-6d-surprise-encounters-design.md`.

---

## File Structure

**Files created:**

- `src/dungeon/surprise.ts` — pure module exporting `rollSurprise` and `floorCap`. Single responsibility: decide whether/what surprise to fire.
- `src/dungeon/__tests__/surprise.test.ts` — unit tests for the trigger logic.

**Files modified:**

- `src/run/run_state.ts` — add `surprisesThisFloor: number` to `RunState`; init in `startRun`; reset in `pressOn`; new `completeSurpriseCombat()` export.
- `src/run/__tests__/run_state.test.ts` — extended tests for the new field, reset, and `completeSurpriseCombat`.
- `src/save/save.ts` — extend `normalizeSaveFile` to default `surprisesThisFloor` to 0 on older saves.
- `src/dungeon/encounter.ts` — export the previously private `isFrontLiner` helper for reuse in `surprise.ts`.
- `src/scenes/corridor_handoff.ts` — extend the payload type to include `surprise: SurpriseSpec | null`; rename `setCorridorDeltas`/`consumeCorridorDeltas` → `setCorridorHandoff`/`consumeCorridorHandoff`.
- `src/scenes/dungeon_scene.ts` — `onNodeClicked` calls `rollSurprise`, branches on hit.
- `src/scenes/corridor_scene.ts` — adds surprise branch in `create()`, `startSurpriseCombat`, `processSurpriseCombatResult`, `resumeScrollToDestination`, and the surprise-flavored result panel.
- `TODO.md` / `HISTORY.md` — housekeeping at the end.

---

## Task 1: Add `surprisesThisFloor` to RunState

**Files:**
- Modify: `src/run/run_state.ts` (RunState interface, `startRun`, `pressOn`)
- Modify: `src/save/save.ts:normalizeSaveFile`
- Test: `src/run/__tests__/run_state.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/run/__tests__/run_state.test.ts` (inside an existing or new `describe` block — pick `describe('startRun')` if present, else add at end):

```ts
describe('surprisesThisFloor field', () => {
  it('startRun initializes surprisesThisFloor to 0', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.surprisesThisFloor).toBe(0);
  });

  it('pressOn resets surprisesThisFloor to 0 on floor advance', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Force surprisesThisFloor up via direct shape mutation (test-only).
    rs = { ...rs, surprisesThisFloor: 2 };
    rs = advanceToBossNode(rs);
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    // Now status === 'camp_screen'.
    const after = pressOn(rs, createRng(7));
    expect(after.surprisesThisFloor).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/run/__tests__/run_state.test.ts -t "surprisesThisFloor"`
Expected: 2 failures — TypeScript error or undefined property.

- [ ] **Step 3: Add field to `RunState` and initialize in `startRun`**

In `src/run/run_state.ts`, edit the `RunState` interface (around lines 15-28):

```ts
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
  readonly traversedNodeIds: readonly string[];
  readonly surprisesThisFloor: number;  // new — count of surprises that fired on the current floor
}
```

In `startRun` (around line 49), add `surprisesThisFloor: 0,` to the returned object.

In `pressOn` (around line 287), add `surprisesThisFloor: 0,` to the returned object.

- [ ] **Step 4: Default field on older saves in `normalizeSaveFile`**

In `src/save/save.ts:normalizeSaveFile` (around line 118), edit the `runState` branch:

```ts
runState: file.runState === undefined
  ? undefined
  : {
      ...file.runState,
      lost: file.runState.lost ?? [],
      traversedNodeIds: file.runState.traversedNodeIds ?? [file.runState.currentNodeId],
      surprisesThisFloor: file.runState.surprisesThisFloor ?? 0,
    },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/run/__tests__/run_state.test.ts -t "surprisesThisFloor"`
Expected: 2 passes.

Then run the full run_state suite to confirm no regressions:
Run: `npx vitest run src/run/__tests__/run_state.test.ts`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/run/run_state.ts src/run/__tests__/run_state.test.ts src/save/save.ts
git commit -m "Phase 6d — add surprisesThisFloor to RunState"
```

---

## Task 2: Export `isFrontLiner` from encounter.ts

**Files:**
- Modify: `src/dungeon/encounter.ts:12`

- [ ] **Step 1: Make `isFrontLiner` an exported function**

In `src/dungeon/encounter.ts` line 12, change:

```ts
function isFrontLiner(enemyId: EnemyId): boolean {
```

to:

```ts
export function isFrontLiner(enemyId: EnemyId): boolean {
```

- [ ] **Step 2: Run the existing encounter tests to verify no regression**

Run: `npx vitest run src/dungeon/__tests__/encounter.test.ts`
Expected: all green (no behavior change).

- [ ] **Step 3: Commit**

```bash
git add src/dungeon/encounter.ts
git commit -m "Phase 6d — export isFrontLiner for surprise.ts reuse"
```

---

## Task 3: Create `surprise.ts` — `floorCap` and gating logic

**Files:**
- Create: `src/dungeon/surprise.ts`
- Test: `src/dungeon/__tests__/surprise.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/dungeon/__tests__/surprise.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CRYPT_POOL, CRYPT_BOSS } from '@data/enemies';
import type { DungeonDef } from '@data/types';
import { ENEMIES } from '@data/enemies';
import type { Hero } from '@heroes/hero';
import { createRng } from '@util/rng';
import type { RunState } from '@run/run_state';
import { floorCap, rollSurprise } from '../surprise';

const CRYPT: DungeonDef = {
  id: 'crypt',
  name: 'The Crypt',
  theme: '',
  floorLength: 3,
  enemyPool: CRYPT_POOL,
  bossId: CRYPT_BOSS,
};

function fakeRunState(over: Partial<RunState> = {}): RunState {
  return {
    dungeonId: 'crypt',
    seed: 1,
    party: [] as readonly Hero[],
    pack: { gold: 0, items: [] },
    currentFloorNumber: 1,
    currentFloorNodes: [],
    currentNodeId: 'x',
    awaitingFork: false,
    status: 'in_dungeon',
    fallen: [],
    lost: [],
    traversedNodeIds: ['x'],
    surprisesThisFloor: 0,
    ...over,
  } as RunState;
}

describe('floorCap', () => {
  it('returns 1 for floors 1 and 2, 2 for floor 3', () => {
    expect(floorCap(1)).toBe(1);
    expect(floorCap(2)).toBe(1);
    expect(floorCap(3)).toBe(2);
  });
});

describe('rollSurprise — gating', () => {
  it('returns null for combat destinations', () => {
    const run = fakeRunState();
    // Use a forced-true RNG to confirm the gate, not the probability.
    expect(rollSurprise(run, CRYPT, 'combat', createRng(1))).toBeNull();
  });

  it('returns null for elite destinations', () => {
    const run = fakeRunState();
    expect(rollSurprise(run, CRYPT, 'elite', createRng(1))).toBeNull();
  });

  it('returns null for boss destinations', () => {
    const run = fakeRunState();
    expect(rollSurprise(run, CRYPT, 'boss', createRng(1))).toBeNull();
  });

  it('returns null when surprisesThisFloor >= floorCap', () => {
    const run = fakeRunState({ currentFloorNumber: 1, surprisesThisFloor: 1 });
    // Sample many seeds — none should fire because cap is 1 and we're at 1.
    for (let seed = 1; seed <= 50; seed++) {
      expect(rollSurprise(run, CRYPT, 'shop', createRng(seed))).toBeNull();
    }
  });

  it('floor 3 cap allows up to 2 surprises', () => {
    const run = fakeRunState({ currentFloorNumber: 3, surprisesThisFloor: 1 });
    // At floor 3, cap is 2, so at count=1 we should NOT be hard-blocked. Some
    // seeds will hit the probability gate. Verify at least one seed fires.
    let anyHit = false;
    for (let seed = 1; seed <= 200; seed++) {
      if (rollSurprise(run, CRYPT, 'shop', createRng(seed)) !== null) {
        anyHit = true;
        break;
      }
    }
    expect(anyHit).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/dungeon/__tests__/surprise.test.ts`
Expected: import error / module not found.

- [ ] **Step 3: Create the module skeleton**

Create `src/dungeon/surprise.ts`:

```ts
import type { DungeonDef } from '@data/types';
import type { Rng } from '@util/rng';
import type { RunState } from '@run/run_state';
import type { Encounter, NodeType } from './node';

export function floorCap(floorNumber: number): number {
  return floorNumber >= 3 ? 2 : 1;
}

export function rollSurprise(
  run: RunState,
  dungeon: DungeonDef,
  destinationType: NodeType,
  rng: Rng,
): Encounter | null {
  if (
    destinationType === 'combat' ||
    destinationType === 'elite' ||
    destinationType === 'boss'
  ) {
    return null;
  }
  if (run.surprisesThisFloor >= floorCap(run.currentFloorNumber)) {
    return null;
  }
  // Probability gate added in Task 4.
  return null;
}
```

- [ ] **Step 4: Run tests to verify the gating tests pass**

Run: `npx vitest run src/dungeon/__tests__/surprise.test.ts -t "rollSurprise — gating"`
Expected: first 4 tests pass; "floor 3 cap allows up to 2 surprises" still fails (rollSurprise always returns null at this point).

That's expected — Task 4 fixes that.

- [ ] **Step 5: Commit**

```bash
git add src/dungeon/surprise.ts src/dungeon/__tests__/surprise.test.ts
git commit -m "Phase 6d — surprise.ts skeleton with floorCap + gating"
```

---

## Task 4: Add probability gate to `rollSurprise`

**Files:**
- Modify: `src/dungeon/surprise.ts`
- Test: `src/dungeon/__tests__/surprise.test.ts`

- [ ] **Step 1: Add the probability test**

Append to `src/dungeon/__tests__/surprise.test.ts`:

```ts
describe('rollSurprise — probability gate', () => {
  // Sample N trials with deterministic seeds and verify hit rate falls within
  // ±5% of the configured per-floor probability. The encounter content isn't
  // verified here — Task 5 covers that. We just check non-null vs null.
  function hitRate(floorNumber: number, trials: number): number {
    let hits = 0;
    for (let seed = 1; seed <= trials; seed++) {
      const run = fakeRunState({ currentFloorNumber: floorNumber, surprisesThisFloor: 0 });
      if (rollSurprise(run, CRYPT, 'shop', createRng(seed)) !== null) hits++;
    }
    return hits / trials;
  }

  it('floor 1 fires within tolerance of 15%', () => {
    const rate = hitRate(1, 1000);
    expect(rate).toBeGreaterThan(0.10);
    expect(rate).toBeLessThan(0.20);
  });

  it('floor 2 fires within tolerance of 20%', () => {
    const rate = hitRate(2, 1000);
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.25);
  });

  it('floor 3 fires within tolerance of 25%', () => {
    const rate = hitRate(3, 1000);
    expect(rate).toBeGreaterThan(0.20);
    expect(rate).toBeLessThan(0.30);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/dungeon/__tests__/surprise.test.ts -t "probability gate"`
Expected: 3 failures (rate is 0).

- [ ] **Step 3: Implement the probability roll**

Edit `src/dungeon/surprise.ts` — replace the `// Probability gate...` section:

```ts
const PROBABILITY_BY_FLOOR: Record<number, number> = {
  1: 0.15,
  2: 0.20,
  3: 0.25,
};

function probabilityForFloor(floorNumber: number): number {
  return PROBABILITY_BY_FLOOR[floorNumber] ?? PROBABILITY_BY_FLOOR[3];
}

export function rollSurprise(
  run: RunState,
  dungeon: DungeonDef,
  destinationType: NodeType,
  rng: Rng,
): Encounter | null {
  if (
    destinationType === 'combat' ||
    destinationType === 'elite' ||
    destinationType === 'boss'
  ) {
    return null;
  }
  if (run.surprisesThisFloor >= floorCap(run.currentFloorNumber)) {
    return null;
  }
  if (rng.next() >= probabilityForFloor(run.currentFloorNumber)) {
    return null;
  }
  // Encounter composition added in Task 5 — return a placeholder shape now to
  // let probability tests pass without fully implementing composition.
  return { enemies: [], scale: { hp: 1, attack: 1 } };
}
```

- [ ] **Step 4: Run tests to verify probability tests pass**

Run: `npx vitest run src/dungeon/__tests__/surprise.test.ts -t "probability gate"`
Expected: 3 passes.

Then the cap test from Task 3 should also fully pass:
Run: `npx vitest run src/dungeon/__tests__/surprise.test.ts`
Expected: all surprise tests green.

- [ ] **Step 5: Commit**

```bash
git add src/dungeon/surprise.ts src/dungeon/__tests__/surprise.test.ts
git commit -m "Phase 6d — surprise.ts probability roll with per-floor weights"
```

---

## Task 5: Encounter composition in `rollSurprise`

**Files:**
- Modify: `src/dungeon/surprise.ts`
- Test: `src/dungeon/__tests__/surprise.test.ts`

- [ ] **Step 1: Write composition tests**

Append to `src/dungeon/__tests__/surprise.test.ts`:

```ts
describe('rollSurprise — encounter composition', () => {
  // Find a seed that produces a hit on floor 1, then verify the encounter shape.
  function firstHitEncounter(floorNumber: number) {
    for (let seed = 1; seed <= 1000; seed++) {
      const run = fakeRunState({ currentFloorNumber: floorNumber });
      const enc = rollSurprise(run, CRYPT, 'shop', createRng(seed));
      if (enc !== null) return enc;
    }
    throw new Error('no surprise hit in 1000 seeds — probability table may be off');
  }

  it('encounter has 1 or 2 enemies', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      // Vary trial start by perturbing the floor number to get diverse seeds.
      const enc = firstHitEncounter(1);
      expect(enc.enemies.length).toBeGreaterThanOrEqual(1);
      expect(enc.enemies.length).toBeLessThanOrEqual(2);
    }
  });

  it('every encounter has at least one front-liner', () => {
    let checked = 0;
    for (let seed = 1; seed <= 2000 && checked < 50; seed++) {
      const run = fakeRunState({ currentFloorNumber: 1 });
      const enc = rollSurprise(run, CRYPT, 'shop', createRng(seed));
      if (enc === null) continue;
      checked++;
      const hasFront = enc.enemies.some((p) => {
        const preferred = ENEMIES[p.enemyId].preferredSlots;
        return preferred.some((s) => s === 1 || s === 2);
      });
      expect(hasFront, `seed ${seed} produced all-back-liner surprise`).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('no enemy placement carries modifierIds', () => {
    let checked = 0;
    for (let seed = 1; seed <= 2000 && checked < 50; seed++) {
      const run = fakeRunState({ currentFloorNumber: 1 });
      const enc = rollSurprise(run, CRYPT, 'shop', createRng(seed));
      if (enc === null) continue;
      checked++;
      for (const placement of enc.enemies) {
        expect(placement.modifierIds).toBeUndefined();
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('scale matches floorScale of currentFloorNumber', () => {
    const enc = firstHitEncounter(2);
    // floorScale(2) = { hp: 1.1, attack: 1.1 }
    expect(enc.scale.hp).toBeCloseTo(1.1, 5);
    expect(enc.scale.attack).toBeCloseTo(1.1, 5);
  });

  it('slots are 1..N densely packed (no gaps)', () => {
    let checked = 0;
    for (let seed = 1; seed <= 2000 && checked < 50; seed++) {
      const run = fakeRunState({ currentFloorNumber: 1 });
      const enc = rollSurprise(run, CRYPT, 'shop', createRng(seed));
      if (enc === null) continue;
      checked++;
      const slots = enc.enemies.map((e) => e.slot).sort((a, b) => a - b);
      const expected = Array.from({ length: enc.enemies.length }, (_, i) => i + 1);
      expect(slots).toEqual(expected);
    }
    expect(checked).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/dungeon/__tests__/surprise.test.ts -t "encounter composition"`
Expected: failures — current implementation returns `enemies: []`.

- [ ] **Step 3: Implement composition**

Edit `src/dungeon/surprise.ts` — replace placeholder return with real composition:

```ts
import type { DungeonDef, EnemyId } from '@data/types';
import type { Rng, WeightedOption } from '@util/rng';
import type { RunState } from '@run/run_state';
import { assignSlots, isFrontLiner } from './encounter';
import type { Encounter, NodeType } from './node';
import { floorScale } from './scaling';

export function floorCap(floorNumber: number): number {
  return floorNumber >= 3 ? 2 : 1;
}

const PROBABILITY_BY_FLOOR: Record<number, number> = {
  1: 0.15,
  2: 0.20,
  3: 0.25,
};

function probabilityForFloor(floorNumber: number): number {
  return PROBABILITY_BY_FLOOR[floorNumber] ?? PROBABILITY_BY_FLOOR[3];
}

const SIZE_WEIGHTS: readonly WeightedOption<1 | 2>[] = [
  { value: 1, weight: 30 },
  { value: 2, weight: 70 },
];

export function rollSurprise(
  run: RunState,
  dungeon: DungeonDef,
  destinationType: NodeType,
  rng: Rng,
): Encounter | null {
  if (
    destinationType === 'combat' ||
    destinationType === 'elite' ||
    destinationType === 'boss'
  ) {
    return null;
  }
  if (run.surprisesThisFloor >= floorCap(run.currentFloorNumber)) {
    return null;
  }
  if (rng.next() >= probabilityForFloor(run.currentFloorNumber)) {
    return null;
  }

  const size = rng.weighted(SIZE_WEIGHTS);
  const picks: EnemyId[] = [];
  for (let i = 0; i < size; i++) {
    picks.push(rng.pick(dungeon.enemyPool));
  }
  if (!picks.some(isFrontLiner)) {
    const frontPool = dungeon.enemyPool.filter(isFrontLiner);
    picks[0] = rng.pick(frontPool);
  }

  return {
    enemies: assignSlots(picks),
    scale: floorScale(run.currentFloorNumber),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/dungeon/__tests__/surprise.test.ts`
Expected: all surprise tests green.

- [ ] **Step 5: Commit**

```bash
git add src/dungeon/surprise.ts src/dungeon/__tests__/surprise.test.ts
git commit -m "Phase 6d — rollSurprise encounter composition"
```

---

## Task 6: `completeSurpriseCombat` in run_state.ts

**Files:**
- Modify: `src/run/run_state.ts` (add new function)
- Test: `src/run/__tests__/run_state.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/run/__tests__/run_state.test.ts`:

```ts
import { completeSurpriseCombat } from '../run_state';  // ADD to existing import block

describe('completeSurpriseCombat', () => {
  // Build a run state parked at a non-combat destination (e.g., a shop) — i.e.,
  // currentNodeId points at a shop node. We simulate that by walking the run
  // until awaitingFork, then choosing a shop branch (if any) — fall back to
  // any non-combat branch.
  function runAtNonCombatNode(): ReturnType<typeof startRun> {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Just-after-startRun, currentNodeId is the start node (combat). We need
    // to advance to a non-combat node. Walk until we land on shop/camp/event/
    // treasure or run out of options.
    while (true) {
      const node = currentNode(rs);
      if (
        node.type === 'shop' ||
        node.type === 'camp' ||
        node.type === 'event' ||
        node.type === 'treasure'
      ) {
        return rs;
      }
      if (rs.awaitingFork) {
        const choices = nextNodeChoices(rs);
        const nonCombat = choices.find(
          (n) => n.type === 'shop' || n.type === 'camp' || n.type === 'event' || n.type === 'treasure',
        );
        rs = chooseNextNode(rs, (nonCombat ?? choices[0]).id);
        continue;
      }
      if (node.type === 'combat' || node.type === 'elite') {
        rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
        continue;
      }
      // Boss = unreachable here; abort.
      throw new Error('no non-combat node reached before boss in test setup');
    }
  }

  it('does NOT advance currentNodeId on victory', () => {
    const rs = runAtNonCombatNode();
    const before = rs.currentNodeId;
    const result = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: after } = completeSurpriseCombat(rs, result, createRng(99));
    expect(after.currentNodeId).toBe(before);
  });

  it('adds reduced gold (7g per floor) on victory', () => {
    const rs = runAtNonCombatNode();
    const goldBefore = rs.pack.gold;
    const result = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: after } = completeSurpriseCombat(rs, result, createRng(99));
    // Floor 1 → 7g.
    expect(after.pack.gold - goldBefore).toBe(7);
  });

  it('returns wipe and clears party on full defeat', () => {
    const rs = runAtNonCombatNode();
    const result = mockCombatResult(rs.party, [0, 0, 0], 'player_defeat');
    const { runState: after, wipe } = completeSurpriseCombat(rs, result, createRng(99));
    expect(wipe).toBeDefined();
    expect(after.party.length).toBe(0);
    expect(after.status).toBe('ended');
  });

  it('recovers fallen-hero gear into the pack on victory', () => {
    let rs = runAtNonCombatNode();
    // Equip a sword on hero 0 to verify recovery.
    const sword: Item = {
      id: 'tst-sword',
      baseId: 'sword_basic',
      slot: 'weapon',
      weaponType: 'sword',
      rarity: 'common',
      affixes: [],
      floorRolledAt: 1,
    };
    rs = {
      ...rs,
      party: rs.party.map((h, i) =>
        i === 0 ? { ...h, equipment: { ...h.equipment, weapon: sword } } : h,
      ),
    };
    const itemsBefore = rs.pack.items.length;
    // Hero 0 dies (0 hp).
    const result = mockCombatResult(rs.party, [0, 14, 15], 'player_victory');
    const { runState: after } = completeSurpriseCombat(rs, result, createRng(99));
    expect(after.pack.items.length).toBeGreaterThan(itemsBefore);
    expect(after.pack.items.some((i) => i.id === 'tst-sword')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/run/__tests__/run_state.test.ts -t "completeSurpriseCombat"`
Expected: import error.

- [ ] **Step 3: Implement `completeSurpriseCombat`**

In `src/run/run_state.ts`, add after the `completeCombat` function (around line 285):

```ts
const SURPRISE_GOLD_BASE = 7;  // half of COMBAT_NODE_GOLD = 15, rounded down

export function completeSurpriseCombat(
  runState: RunState,
  result: CombatResult,
  rng: Rng,
): { runState: RunState; wipe?: WipeOutcome } {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`completeSurpriseCombat: status must be 'in_dungeon', got '${runState.status}'`);
  }

  const updatedPartyLiving: Hero[] = [];
  const newFallen: Hero[] = [];
  for (let i = 0; i < runState.party.length; i++) {
    const original = runState.party[i];
    const combatant = result.finalState.combatants.find((c) => c.id === `p${i}`);
    if (!combatant) {
      updatedPartyLiving.push(original);
      continue;
    }
    const newWounds = woundsFromEvents(result.events, `p${i}`);
    const updated: Hero = {
      ...original,
      currentHp: Math.max(0, combatant.currentHp),
      wounds: newWounds.length > 0 ? [...original.wounds, ...newWounds] : original.wounds,
    };
    if (combatant.isDead) {
      newFallen.push(updated);
    } else {
      updatedPartyLiving.push(updated);
    }
  }

  if (result.outcome === 'player_defeat') {
    const allLost: Hero[] = [
      ...runState.fallen,
      ...newFallen,
      ...updatedPartyLiving,
    ];
    const wipe: WipeOutcome = {
      packLost: runState.pack,
      heroesFallen: allLost,
      heroesLost: runState.lost,
    };
    return {
      runState: {
        ...runState,
        party: [],
        fallen: allLost,
        pack: createPack(),
        status: 'ended',
      },
      wipe,
    };
  }

  // XP awards mirror combat-node policy — surprises ARE combat, just unannounced.
  const xpReward = xpForCombatNode(runState.currentFloorNumber);
  const partyAfterXp = updatedPartyLiving.map((hero) => {
    const newXp = hero.xp + xpReward;
    const newLevel = levelForXp(newXp);
    return applyLevelUps({ ...hero, xp: newXp }, hero.level, newLevel);
  });

  // Reduced gold reward.
  const reward = SURPRISE_GOLD_BASE * runState.currentFloorNumber;
  let newPack = addGold(runState.pack, reward);

  // Loot at standard 'combat' kind — same 10% gate.
  const drop = rollLoot(rng, runState.currentFloorNumber, 'combat');
  if (drop) {
    newPack = addItem(newPack, drop);
  }

  // Fallen-hero gear recovery (mirrors completeCombat).
  for (const fallen of newFallen) {
    const eq = fallen.equipment;
    const items: Item[] = [eq.weapon, eq.shield, eq.outfit, eq.hat].filter(
      (i): i is Item => i !== undefined,
    );
    for (const item of items) {
      newPack = addItem(newPack, item);
    }
  }

  // Critical: do NOT change currentNodeId; do NOT set awaitingFork; do NOT
  // change status. Heroes still need to walk to the destination after this.
  return {
    runState: {
      ...runState,
      party: partyAfterXp,
      fallen: [...runState.fallen, ...newFallen],
      pack: newPack,
    },
  };
}
```

Add `xpForCombatNode` to the existing import from `@data/leveling` at the top of the file if it isn't already imported (it is — line 2 already imports it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/run/__tests__/run_state.test.ts -t "completeSurpriseCombat"`
Expected: 4 passes.

Then full suite:
Run: `npx vitest run src/run/__tests__/run_state.test.ts`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/run/run_state.ts src/run/__tests__/run_state.test.ts
git commit -m "Phase 6d — completeSurpriseCombat (no node advance, half gold)"
```

---

## Task 7: Extend corridor handoff with surprise field

**Files:**
- Modify: `src/scenes/corridor_handoff.ts`
- Modify: `src/scenes/dungeon_scene.ts:7,250`
- Modify: `src/scenes/corridor_scene.ts:24,141`

- [ ] **Step 1: Replace handoff module contents**

Replace the entire contents of `src/scenes/corridor_handoff.ts`:

```ts
import type { Encounter } from '@dungeon/node';

export interface SurpriseSpec {
  encounter: Encounter;
  spawnFraction: number;  // 0.4–0.6 of WORLD_SCROLL_DISTANCE — random per fire
}

export interface CorridorHandoffPayload {
  deltas: readonly number[];
  surprise: SurpriseSpec | null;
}

let pending: CorridorHandoffPayload | undefined;

export function setCorridorHandoff(payload: CorridorHandoffPayload): void {
  pending = payload;
}

export function consumeCorridorHandoff(): CorridorHandoffPayload | undefined {
  const out = pending;
  pending = undefined;
  return out;
}
```

- [ ] **Step 2: Update the dungeon scene's import + call**

In `src/scenes/dungeon_scene.ts`:

Line 7 — change:
```ts
import { setCorridorDeltas } from './corridor_handoff';
```
to:
```ts
import { setCorridorHandoff } from './corridor_handoff';
```

Around line 250, change:
```ts
const { runState: postTick, deltas } = applyTravelTick(advanced);
setCorridorDeltas(deltas);
return { ...s, runState: postTick };
```
to:
```ts
const { runState: postTick, deltas } = applyTravelTick(advanced);
setCorridorHandoff({ deltas, surprise: null });
return { ...s, runState: postTick };
```

- [ ] **Step 3: Update the corridor scene's import + call**

In `src/scenes/corridor_scene.ts`:

Line 24 — change:
```ts
import { consumeCorridorDeltas } from './corridor_handoff';
```
to:
```ts
import { consumeCorridorHandoff } from './corridor_handoff';
```

Around line 141 (inside `create()`), change:
```ts
const handoff = consumeCorridorDeltas();
this.deltas = handoff?.deltas ?? [];
```
to:
```ts
const handoff = consumeCorridorHandoff();
this.deltas = handoff?.deltas ?? [];
```

(The `handoff.surprise` field will be wired up in Tasks 8–11; for now it's just unused.)

- [ ] **Step 4: Verify the build is green**

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `npm test`
Expected: all green (no behavior change yet — no surprise actually fires).

- [ ] **Step 5: Smoke test in dev**

Run: `npm run dev`
Open the game, start a run, walk to any node, observe travel works as today (HP tick, chatter, scroll, combat / overlay). Close server.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/corridor_handoff.ts src/scenes/dungeon_scene.ts src/scenes/corridor_scene.ts
git commit -m "Phase 6d — extend corridor handoff with surprise field"
```

---

## Task 8: Wire `rollSurprise` into the dungeon scene click handler

**Files:**
- Modify: `src/scenes/dungeon_scene.ts:5-7,225-254`

- [ ] **Step 1: Add imports**

In `src/scenes/dungeon_scene.ts`, edit the imports at the top:

```ts
import { DUNGEONS } from '@data/dungeons';
import { rollSurprise } from '@dungeon/surprise';
import { applyTravelTick, chooseNextNode, currentNode } from '@run/run_state';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';
import { setCorridorHandoff } from './corridor_handoff';
```

- [ ] **Step 2: Replace the `onNodeClicked` body's tick branch**

Find the block at line 246-253 that reads:

```ts
appState.update((s) => {
  const advanced = chooseNextNode(s.runState!, nodeId);
  const { runState: postTick, deltas } = applyTravelTick(advanced);
  setCorridorHandoff({ deltas, surprise: null });
  return { ...s, runState: postTick };
});
this.scene.start('corridor');
```

Replace with:

```ts
appState.update((s) => {
  const advanced = chooseNextNode(s.runState!, nodeId);
  const dungeon = DUNGEONS[advanced.dungeonId];

  // Roll surprise BEFORE applying tick — surprise replaces tick if it fires.
  if (s.runRngState === undefined) {
    // Defensive: should never happen during in_dungeon flow. Fall back to tick.
    const { runState: postTick, deltas } = applyTravelTick(advanced);
    setCorridorHandoff({ deltas, surprise: null });
    return { ...s, runState: postTick };
  }

  const rng = createRngFromState(s.runRngState);
  const destNode = currentNode(advanced); // currentNodeId is now the destination
  const surpriseEnc = rollSurprise(advanced, dungeon, destNode.type, rng);

  if (surpriseEnc !== null) {
    // Surprise fires: skip tick, increment counter, roll spawn fraction.
    const spawnFraction = 0.4 + rng.next() * 0.2;  // [0.4, 0.6)
    setCorridorHandoff({
      deltas: [0, 0, 0],
      surprise: { encounter: surpriseEnc, spawnFraction },
    });
    return {
      ...s,
      runState: { ...advanced, surprisesThisFloor: advanced.surprisesThisFloor + 1 },
      runRngState: rng.getState(),
    };
  }

  // No surprise — standard tick path.
  const { runState: postTick, deltas } = applyTravelTick(advanced);
  setCorridorHandoff({ deltas, surprise: null });
  return { ...s, runState: postTick, runRngState: rng.getState() };
});
this.scene.start('corridor');
```

- [ ] **Step 3: Verify the build**

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `npm test`
Expected: all green.

- [ ] **Step 4: Smoke — verify no surprise rendering breaks travel**

The corridor scene doesn't render surprises yet (Tasks 9-12), but `setCorridorHandoff({ ..., surprise: ... })` shouldn't break anything. The corridor scene currently just reads `handoff.deltas`.

Run: `npm run dev`
Start a run and walk through several edges. About 15–25% of non-combat-bound edges will roll a "phantom" surprise — the run-state increments `surprisesThisFloor`, the HP tick is suppressed, but the corridor scene plays a normal scroll without the ambush combat. This is an intentional intermediate state — Tasks 9–12 add the visual.

Test for: no errors, no broken travel, normal combat-bound edges still tick + scroll + fight.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/dungeon_scene.ts
git commit -m "Phase 6d — roll surprise at click time, thread through handoff"
```

---

## Task 9: Corridor scene — partial scroll + enemy embedding

**Files:**
- Modify: `src/scenes/corridor_scene.ts`

- [ ] **Step 1: Capture the surprise spec in the scene**

In `src/scenes/corridor_scene.ts`, near the existing instance fields (around line 88):

```ts
private surprise: SurpriseSpec | null = null;
private surpriseEnemyActors: CombatActor[] = [];
```

Add the `SurpriseSpec` import to line 24:

```ts
import { consumeCorridorHandoff, type SurpriseSpec } from './corridor_handoff';
```

In `create()` initialization (around line 117):

```ts
this.heroVisuals = [];
this.preCombatParty = [];
this.combatLoot = [];
this.resultPanel = undefined;
this.wipeOutcome = undefined;
this.actors = new Map();
this.playback = undefined;
this.combatHud = undefined;
this.combatHudObjects = [];
this.combatFfBg = undefined;
this.combatFfLabel = undefined;
this.surprise = null;                     // NEW
this.surpriseEnemyActors = [];            // NEW
```

After consuming the handoff (around line 141):

```ts
const handoff = consumeCorridorHandoff();
this.deltas = handoff?.deltas ?? [];
this.surprise = handoff?.surprise ?? null;
```

- [ ] **Step 2: Branch in `create()` between standard travel and surprise travel**

Replace the existing `if (run.traversedNodeIds.length === 1)` branch at line 161 with:

```ts
if (run.traversedNodeIds.length === 1) {
  // Fresh entry (first node). Skip walk, engage immediately.
  this.engageDestination();
} else if (this.surprise) {
  this.startSurpriseWalk();
} else {
  this.startWalk();
}
```

- [ ] **Step 3: Implement `startSurpriseWalk`**

Add this method to the `CorridorScene` class, near `startWalk` (around line 324):

```ts
private startSurpriseWalk(): void {
  if (!this.surprise) return;

  // Speed control via scene timescale (mirrors startWalk).
  this.tweens.timeScale = this.walkSpeed;
  this.time.timeScale = this.walkSpeed;

  // Embed surprise enemies inside the world container at world-relative
  // x = ENEMY_X_BY_SLOT[slot] + spawnFraction * WORLD_SCROLL_DISTANCE.
  // After scrolling left by spawnFraction*WORLD_SCROLL_DISTANCE, each enemy
  // appears on screen at ENEMY_X_BY_SLOT[slot].
  const fraction = this.surprise.spawnFraction;
  const enemies = this.surprise.encounter.enemies;
  const scale = this.surprise.encounter.scale;
  let enemyIdx = 0;
  for (const placement of enemies) {
    const finalScreenX = ENEMY_X_BY_SLOT[placement.slot];
    const worldRelX = finalScreenX + fraction * WORLD_SCROLL_DISTANCE;
    const enemyId = placement.enemyId;
    const isBoss = ENEMIES[enemyId].role === 'boss';
    const visual = ENEMY_VISUALS[enemyId];
    const bodyScale = visual.bodyScale ?? (isBoss ? BOSS_BODY_SCALE : 3);
    const combatantId = `e${enemyIdx++}` as CombatantId;
    // Pre-scale HP so the placeholder HP bar is full and matches the real
    // combat-start HP (surprises have no modifiers, so scale is the only
    // adjustment to base HP).
    const scaledHp = Math.round(ENEMIES[enemyId].baseStats.hp * scale.hp);
    const actor = new CombatActor(this, worldRelX, ROW_Y, {
      kind: 'enemy',
      combatantId,
      displayName: ENEMIES[enemyId].name,
      enemyId,
      currentHp: scaledHp,
      maxHp: scaledHp,
      bodyScale,
    });
    this.worldContainer.add(actor);
    this.surpriseEnemyActors.push(actor);
  }

  // Schedule chatter only if it would land BEFORE the surprise spawn time.
  this.maybeScheduleSurpriseChatter(appState.get().runState!.party, fraction);

  // Partial scroll: tween to spawnFraction of the full distance.
  const distance = fraction * WORLD_SCROLL_DISTANCE;
  const duration = fraction * TOTAL_TRAVEL_MS;
  this.tweens.add({
    targets: this.worldContainer,
    x: -distance,
    duration,
    ease: 'Linear',
    onComplete: () => this.startSurpriseCombat(),
  });
}

private maybeScheduleSurpriseChatter(party: readonly Hero[], spawnFraction: number): void {
  if (Math.random() >= CHATTER_PROBABILITY) return;
  if (party.length === 0) return;
  const step = Math.random() < 0.5 ? 2 : 4;
  const chatterTimeMs = step * STEP_DURATION_MS;
  const surpriseTimeMs = spawnFraction * TOTAL_TRAVEL_MS;
  if (chatterTimeMs >= surpriseTimeMs) return;  // chatter would land in/after combat — skip
  const heroIndex = Math.floor(Math.random() * party.length);
  const hero = party[heroIndex];
  const condition = computeChatterCondition(hero);
  const pool = CHATTER[hero.classId][condition];
  if (pool.length === 0) return;
  const line = pool[Math.floor(Math.random() * pool.length)];
  this.time.delayedCall(chatterTimeMs, () => this.spawnChatterBubble(heroIndex, line));
}
```

(Task 10 implements `startSurpriseCombat`. For now stub it.)

- [ ] **Step 4: Stub `startSurpriseCombat` so the build compiles**

Add to the class (placement: just under `startSurpriseWalk`):

```ts
private startSurpriseCombat(): void {
  // Implemented in Task 10.
  console.warn('startSurpriseCombat: not yet implemented — falling through to destination');
  this.engageDestination();
}
```

- [ ] **Step 5: Verify the build**

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Smoke test**

Run: `npm run dev`
Start a run; walk through several non-combat-bound edges. When a surprise fires, you should see:
- HP tick suppressed (no popup at step 3).
- Partial scroll to ~50% of normal distance.
- Enemy sprites visible, sliding into view as scroll progresses.
- Scroll halts; `console.warn` fires; scene falls through to the destination overlay (normal shop/camp/event/treasure UI). No combat yet — that's Task 10.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/corridor_scene.ts
git commit -m "Phase 6d — corridor partial scroll + surprise enemy embedding"
```

---

## Task 10: Corridor scene — `startSurpriseCombat`

**Files:**
- Modify: `src/scenes/corridor_scene.ts`

- [ ] **Step 1: Replace the stub with the real implementation**

Replace the `startSurpriseCombat` stub from Task 9 with:

```ts
private startSurpriseCombat(): void {
  if (!this.surprise) return;
  const state = appState.get();
  const run = state.runState;
  if (!run || run.status !== 'in_dungeon') return;
  if (state.runRngState === undefined) {
    console.warn('CorridorScene: runRngState missing for surprise combat');
    return;
  }

  const encounter = this.surprise.encounter;

  // Stop hero bob/rotate (mirrors startCombatInPlace).
  for (const visual of this.heroVisuals) {
    this.tweens.killTweensOf(visual.actor);
    this.tweens.killTweensOf(visual.actor.bodyVisual);
    visual.actor.setY(ROW_Y);
    visual.actor.bodyVisual.setAngle(0);
  }
  this.tweens.timeScale = 1;
  this.time.timeScale = 1;

  const rng = createRngFromState(state.runRngState);
  const combatState = buildCombatState(run.party, encounter);
  const result = resolveCombat(combatState, rng);

  // Tear down the placeholder surprise enemy actors — buildEnemyActors will
  // create the real ones with correct HP / modifiers.
  for (const a of this.surpriseEnemyActors) a.destroy();
  this.surpriseEnemyActors = [];

  this.combatSpeed = state.preferences?.combatSpeed ?? 1;
  this.ffBg.setVisible(false);
  this.ffLabel.setVisible(false);

  const displayNames = this.buildDisplayNames(run, combatState);
  this.buildSurpriseEnemyActorsForCombat(combatState, displayNames);
  this.combatHud = this.buildCombatHud();

  this.playback = new CombatPlayback(
    this,
    result.events,
    this.actors,
    this.combatHud,
    combatState,
    displayNames,
  );
  this.playback.setSpeed(this.combatSpeed);
  this.playback.onComplete = () => {
    this.processSurpriseCombatResult(result, rng.getState());
  };

  this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    this.playback?.abort();
    this.tweens.timeScale = 1;
    this.time.timeScale = 1;
  });

  // No ENEMY_SLIDE_IN_MS delay — enemies were visible during the partial scroll.
  void this.playback.run();
}

private buildSurpriseEnemyActorsForCombat(
  combatState: CombatState,
  displayNames: Map<CombatantId, string>,
): void {
  // Place enemies at standard ENEMY_X_BY_SLOT positions (NOT in worldContainer)
  // — combat happens against the heroes who are at PARTY_X positions; both
  // sides need to be in scene-space so the bbox calculations in CombatPlayback
  // line up with damage popups, etc.
  for (const c of combatState.combatants) {
    if (c.side !== 'enemy') continue;
    const finalX = ENEMY_X_BY_SLOT[c.slot];
    const enemyId = c.enemyId!;
    const isBoss = ENEMIES[enemyId].role === 'boss';
    const visual = ENEMY_VISUALS[enemyId];
    const bodyScale = visual.bodyScale ?? (isBoss ? BOSS_BODY_SCALE : 3);
    const actor = new CombatActor(this, finalX, ROW_Y, {
      kind: 'enemy',
      combatantId: c.id,
      displayName: displayNames.get(c.id) ?? c.id,
      enemyId,
      currentHp: c.currentHp,
      maxHp: c.maxHp,
      bodyScale,
    });
    this.actors.set(c.id, actor);
  }
}

private processSurpriseCombatResult(result: CombatResult, rngStateAfter: number): void {
  // Implemented in Task 11.
  console.warn('processSurpriseCombatResult: not yet implemented — falling through to destination');
  this.engageDestination();
  void result;
  void rngStateAfter;
}
```

- [ ] **Step 2: Verify the build**

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `npm test`
Expected: all green.

- [ ] **Step 3: Smoke test**

Run: `npm run dev`
When a surprise fires, you should now see:
- Partial scroll to spawn point.
- Enemies visible and approaching during scroll.
- Scroll halts; bob/rotate stops; combat HUD appears; `CombatPlayback` runs.
- After combat ends, `console.warn` fires; scene falls through to the destination overlay (no result panel yet — that's Task 11).

Verify the heroes and enemies engage correctly. If the heroes' positions look off, double-check that the surprise enemies are in scene-space (not in `worldContainer`).

- [ ] **Step 4: Commit**

```bash
git add src/scenes/corridor_scene.ts
git commit -m "Phase 6d — surprise combat plays in corridor"
```

---

## Task 11: Surprise result panel + `processSurpriseCombatResult`

**Files:**
- Modify: `src/scenes/corridor_scene.ts`

- [ ] **Step 1: Add the import for `completeSurpriseCombat`**

In `src/scenes/corridor_scene.ts`, edit the existing run_state import (around line 16):

```ts
import {
  completeCombat,
  completeSurpriseCombat,
  currentNode,
  type RunState,
  type WipeOutcome,
} from '@run/run_state';
```

Also add the surprise gold constant (around line 65, near other reward constants):

```ts
const SURPRISE_GOLD_BASE = 7;
```

- [ ] **Step 2: Replace the `processSurpriseCombatResult` stub**

Replace the stub from Task 10 with the real implementation:

```ts
private processSurpriseCombatResult(result: CombatResult, rngStateAfter: number): void {
  const run = appState.get().runState!;
  this.preCombatParty = [...run.party];
  const prePackLen = run.pack.items.length;

  const rng = createRngFromState(rngStateAfter);
  const { runState: nextRun, wipe } = completeSurpriseCombat(run, result, rng);
  this.combatLoot = nextRun.pack.items.slice(prePackLen);

  appState.update((s) => ({
    ...s,
    runState: nextRun,
    runRngState: rng.getState(),
  }));

  // Tear down combat HUD (mirrors processCombatResultInline).
  for (const obj of this.combatHudObjects) obj.destroy();
  this.combatHudObjects = [];
  this.combatHud = undefined;
  this.combatFfBg?.destroy();
  this.combatFfLabel?.destroy();
  this.combatFfBg = undefined;
  this.combatFfLabel = undefined;
  this.ffBg.setVisible(true);
  this.ffLabel.setVisible(true);
  for (const [id, actor] of this.actors) {
    if (id.startsWith('e')) {
      actor.destroy();
      this.actors.delete(id);
    }
  }

  if (wipe) {
    this.wipeOutcome = wipe;
    this.buildWipePanel();
  } else {
    this.buildSurpriseResultPanel();
  }
}

private buildSurpriseResultPanel(): void {
  const run = appState.get().runState!;
  const reward = SURPRISE_GOLD_BASE * run.currentFloorNumber;

  const lootCount = this.combatLoot.length;
  const lootBlockHeight = lootCount > 0 ? 16 + lootCount * 14 : 0;
  const bgHeight = 180 + lootBlockHeight;
  const dismissY = 70 + lootBlockHeight;

  const bg = this.add
    .rectangle(0, 0, 320, bgHeight, 0x1a1a1a)
    .setStrokeStyle(2, 0xffaa44);
  const title = this.add
    .text(0, -bgHeight / 2 + 25, 'Ambushed!', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffaa44',
    })
    .setOrigin(0.5);
  const gold = this.add
    .text(0, -bgHeight / 2 + 48, `+${reward}g`, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffcc66',
    })
    .setOrigin(0.5);

  const lines: Phaser.GameObjects.Text[] = [];
  let y = -bgHeight / 2 + 72;
  const survivorsById = new Map(run.party.map((h) => [h.id, h]));
  for (const preHero of this.preCombatParty) {
    const survivor = survivorsById.get(preHero.id);
    const fallen = survivor === undefined;
    const text = fallen
      ? `${preHero.name}: Fallen`
      : (() => {
          const delta = preHero.currentHp - survivor.currentHp;
          return delta === 0
            ? `${survivor.name}: untouched`
            : `${survivor.name}: -${delta} HP (${survivor.currentHp}/${survivor.maxHp})`;
        })();
    lines.push(
      this.add
        .text(0, y, text, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: fallen ? '#cc8888' : '#aaaaaa',
        })
        .setOrigin(0.5),
    );
    y += 14;
  }

  if (lootCount > 0) {
    y += 4;
    lines.push(
      this.add
        .text(0, y, 'Loot:', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#dddddd',
        })
        .setOrigin(0.5),
    );
    y += 14;
    for (const item of this.combatLoot) {
      const name = itemDisplayName(item);
      const affixes = itemAffixDescription(item);
      const text = affixes.length > 0 ? `${name} · ${affixes}` : name;
      lines.push(
        this.add
          .text(0, y, text, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: RARITY_HEX[item.rarity],
          })
          .setOrigin(0.5),
      );
      y += 14;
    }
  }

  const dismiss = this.add
    .text(0, dismissY, '▸ click to continue', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#888888',
      fontStyle: 'italic',
    })
    .setOrigin(0.5);

  this.resultPanel = this.add.container(480, 270, [bg, title, gold, ...lines, dismiss]);

  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerdown', () => this.onSurpriseResultDismiss());
}

private onSurpriseResultDismiss(): void {
  this.resultPanel?.destroy(true);
  this.resultPanel = undefined;
  this.resumeScrollToDestination();
}

private resumeScrollToDestination(): void {
  // Implemented in Task 12.
  console.warn('resumeScrollToDestination: not yet implemented — engaging directly');
  this.engageDestination();
}
```

- [ ] **Step 3: Verify the build**

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `npm test`
Expected: all green.

- [ ] **Step 4: Smoke test**

Run: `npm run dev`
When a surprise fires:
- Combat plays out as in Task 10.
- "Ambushed!" panel appears (orange title) with reduced gold (7/14/21g by floor) + per-hero HP delta + any loot.
- Click dismisses.
- `console.warn` fires; the scene jumps directly to `engageDestination` (no resumed scroll yet — Task 12 adds that).

Verify gold totals correctly added to pack. Verify wipe path still triggers the standard "Heroes Fallen" wipe panel (try a forced-defeat scenario by editing a low-HP hero into the party, or just trust the unit tests).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/corridor_scene.ts
git commit -m "Phase 6d — surprise result panel (Ambushed! variant)"
```

---

## Task 12: `resumeScrollToDestination`

**Files:**
- Modify: `src/scenes/corridor_scene.ts`

- [ ] **Step 1: Replace the stub with the real implementation**

Replace the `resumeScrollToDestination` stub from Task 11 with:

```ts
private resumeScrollToDestination(): void {
  if (!this.surprise) {
    this.engageDestination();
    return;
  }
  const fraction = this.surprise.spawnFraction;

  // Restore travel-time hero animations.
  for (const visual of this.heroVisuals) {
    const slot = this.heroVisuals.indexOf(visual);
    const bobPhase = slot * 333;
    this.tweens.add({
      targets: visual.actor,
      y: { from: ROW_Y, to: ROW_Y - 3 },
      duration: 500,
      yoyo: true,
      repeat: -1,
      delay: bobPhase,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: visual.actor.bodyVisual,
      angle: { from: -5, to: 5 },
      duration: 500,
      yoyo: true,
      repeat: -1,
      delay: bobPhase,
      ease: 'Sine.easeInOut',
    });
  }

  // Apply walk-speed timescale for the resumed scroll.
  this.tweens.timeScale = this.walkSpeed;
  this.time.timeScale = this.walkSpeed;

  // Tween the world container the remaining distance to fully-scrolled.
  const remainingDuration = (1 - fraction) * TOTAL_TRAVEL_MS;
  this.tweens.add({
    targets: this.worldContainer,
    x: -WORLD_SCROLL_DISTANCE,
    duration: remainingDuration,
    ease: 'Linear',
    onComplete: () => this.engageDestination(),
  });
}
```

- [ ] **Step 2: Verify the build**

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `npm test`
Expected: all green.

- [ ] **Step 3: Smoke test the full surprise flow**

Run: `npm run dev`
Walk a run until a surprise fires (15–25% per non-combat edge). Verify:
- Partial scroll → enemy embedding → scroll halt → combat → "Ambushed!" panel → dismiss → bob/rotate restored → resumed scroll → destination overlay.
- Toggle walk-speed (F) and combat-speed (F during combat) to verify timescales work mid-flow.
- Verify on wipe (force a defeat): standard wipe panel appears, "Return to Camp" returns to camp scene.
- Verify floor cap: walk many edges on F1 — at most 1 surprise per floor; F3 — at most 2.
- Verify destination preserved: after surprise win, the original shop/camp/event/treasure overlay opens normally.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/corridor_scene.ts
git commit -m "Phase 6d — resume scroll to destination after surprise win"
```

---

## Task 13: Housekeeping — TODO + HISTORY

**Files:**
- Modify: `TODO.md`
- Modify: `HISTORY.md`

- [ ] **Step 1: Mark Phase 6d ✅ in TODO.md**

In `TODO.md`, find the Phase 6d entry under "Cluster B · 30 — Map-based dungeon scene":

```markdown
    - **Phase 6d — Surprise encounters.** RNG-driven enemy injection during travel toward non-combat nodes. Builds on the in-corridor combat infrastructure shipped in 6c. Needs its own brainstorm (probability per step? per non-combat path? content/scaling of injected enemies?). Subsumed-from-6c portion: in-corridor combat plumbing already done.
```

Replace with:

```markdown
    - **Phase 6d — Surprise encounters.** ✅ *Shipped 2026-05-04 (see HISTORY).* RNG-driven mid-corridor ambushes during travel toward non-combat nodes. Per-edge probability scaling F1 15% / F2 20% / F3 25% with per-floor cap of 1 (2 on F3). Mini skirmishes (1–2 enemies, no modifiers) with reduced gold (7g × floor) and standard 10% combat loot rate. Tax model — destination preserved. Surprise replaces per-edge HP tick. Spec: `docs/superpowers/specs/2026-05-04-phase-6d-surprise-encounters-design.md`.
```

- [ ] **Step 2: Add a slim entry to HISTORY.md**

In `HISTORY.md`, at the top (newest-first ordering per CLAUDE.md), add:

```markdown
## 2026-05-04 — Phase 6d · Surprise encounters

**Why:** Phase 6 framing of "in-corridor events" left non-combat travel feeling too safe. Phase 6d adds RNG-driven mid-corridor ambushes during travel toward shop / camp / event / treasure nodes, paying off the cartographer-party fiction with real corridor risk.

**Decisions:** Tax model (destination preserved on surprise win) over replacement model — keeps the press-on/cashout decision crisp and avoids punishing the player for path choices. Per-edge probability with soft floor cap (F1/F2: 1 max, F3: 2 max) over no-cap or floor-fixed variants — bounded pathological strings of ambushes without losing per-edge tension. Mini skirmish (1–2 enemies, no modifier stamping) with reduced gold (~7g × floor) and standard 10% combat loot rate — differentiates surprises from combat nodes visually and economically. Surprise replaces the per-edge HP tick rather than stacking — one major corridor event per edge.

**Surprises:** Front-liner guarantee fallback (mirrors `composeCombatEncounter`) is needed even at size 1 — a single back-line pick gets replaced. Enemy embedding inside `worldContainer` works for the entrance phase but combat needs enemies in scene-space (not in the scrolling container) so `CombatPlayback`'s damage-popup geometry lines up with hero positions; placeholder actors are torn down at combat start and replaced with scene-space ones.

**Source:** `docs/superpowers/specs/2026-05-04-phase-6d-surprise-encounters-design.md`. Brainstorm 2026-05-04 (Q1 tax/A, Q2 cap/B, Q3 mini/B, Q4 replace/B).
```

- [ ] **Step 3: Final smoke + verification**

Run: `npm test`
Expected: all green.

Run: `npm run build`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add TODO.md HISTORY.md
git commit -m "Phase 6d — TODO + HISTORY"
```

---

## Plan complete

After Task 13, Phase 6d is shipped. Surprises fire at 15/20/25% per non-combat-bound edge, capped at 1/1/2 per floor, with mini encounters and reduced rewards, all while preserving the original destination.
