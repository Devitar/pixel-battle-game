# Sunken Keep Spec 1 — Foundation + Milestone Plumbing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plumb dungeon-tier balance, milestone registry, and multi-dungeon Expeditions UI so spec 2 (Sunken Keep content) can drop in additive-only.

**Architecture:** Five layers under the existing Phaser firewall — types, data, balance (`floorScale`/`rollLoot`/`pickRarity`/`goldMultiplier`), milestone registry (`src/run/milestones.ts`), and UI (`expeditions_panel_scene.ts` + `enemy_sprite.ts`). Tier=1 is regression-locked to byte-identical RNG output today; tier-2 placeholders are no-ops in spec 1. Milestone registry ships empty (`MilestoneId = never`); spec 2 adds the first id and handler.

**Tech Stack:** TypeScript (strict), Phaser 3, Vitest, Vite.

**Spec:** [`docs/superpowers/specs/2026-05-05-sunken-keep-foundation-design.md`](../specs/2026-05-05-sunken-keep-foundation-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/data/types.ts` | Modify | Add `DungeonTier`, `MilestoneId`; rename `floorLength`→`floorsPerRun`; add `tier`, `rowsPerFloor?`, `unlockRequirement?` to `DungeonDef`. |
| `src/data/dungeons.ts` | Modify | Crypt entry: `tier: 1`; rename field. |
| `src/data/__tests__/dungeons.test.ts` | Modify | Update assertion using renamed field. |
| `src/dungeon/scaling.ts` | Modify | `floorScale(floor, tier)` with default 1; new `goldMultiplier(tier)`; tier tables. |
| `src/dungeon/__tests__/scaling.test.ts` | Modify | Tier=1 default-arg parity tests; goldMultiplier tests; placeholder tier-2 differs test. |
| `src/dungeon/loot.ts` | Modify | `pickRarity(rng, floor, tier)`, `rollLoot(rng, floor, kind, tier)`, `rollShopItem(rng, slot, floor, tier)`, `rollEventItem(rng, floor, rarity, tier)`; `TIER_RARITY_FLOOR_BONUS` table. |
| `src/dungeon/__tests__/loot.test.ts` | Modify | Tier=1 default-arg parity tests; placeholder tier-2 differs test. |
| `src/dungeon/floor.ts` | Modify | Read `(dungeon.rowsPerFloor ?? 8) + (floor − 1)`. |
| `src/dungeon/__tests__/floor.test.ts` | Modify | Add synthetic-fixture test for `rowsPerFloor: 10` → 10/11/12 rows. |
| `src/dungeon/shop.ts` | Modify | Pass tier through to `rollShopItem`. |
| `src/dungeon/surprise.ts` | (no change) | `floorScale` call already takes `tier=1` default — but verify gold-grant site (in `run_state.ts` and `corridor_scene.ts`) is tier-aware. |
| `src/run/run_state.ts` | Modify | Add `pendingMilestones` field; populate in boss-victory branch; drain in `cashout` and wipe path; apply `goldMultiplier(tier)` at all gold-grant sites; thread `tier` to `rollLoot`. |
| `src/run/__tests__/run_state.test.ts` | Modify | Tests for populate/drain/persist-across-pressOn; existing tests must pass unchanged. |
| `src/run/event_resolver.ts` | Modify | Apply `goldMultiplier(tier)` to `gold_delta` payload; thread `tier` to `rollEventItem`. |
| `src/run/__tests__/event_resolver.test.ts` | Modify | Existing tests pass at tier=1. |
| `src/run/milestones.ts` | **Create** | Registry, `detectBossMilestones`, `applyPendingMilestones`. |
| `src/run/__tests__/milestones.test.ts` | **Create** | Empty-registry tests; identity behavior. |
| `src/save/save.ts` | Modify | One-line `pendingMilestones: file.runState.pendingMilestones ?? []` in `normalizeSaveFile`. |
| `src/save/__tests__/save.test.ts` | Modify | Assert normalizer defaults `pendingMilestones: []` for legacy in-flight saves. |
| `src/scenes/camp_screen_scene.ts` | Modify | Apply `applyPendingMilestones` after cashout. |
| `src/scenes/corridor_scene.ts` | Modify | Apply `applyPendingMilestones` after wipe; apply `goldMultiplier(tier)` to surprise gold. |
| `src/scenes/expeditions_panel_scene.ts` | Modify | Multi-dungeon list, tier badge, locked-card path, dungeon-aware party-picker. |
| `src/scenes/expeditions_layout.ts` | **Create** | Pure layout helper `computeCardPositions(N, panelHeight, cardHeight, gap)`. |
| `src/scenes/__tests__/expeditions_layout.test.ts` | **Create** | Layout-math tests (N=1 centers; N=4 fits). |
| `src/render/enemy_sprite.ts` | Modify | Add `setLocked(locked: boolean)` method. |

---

## Tasks

### Task 1: Type-level data model — DungeonTier, MilestoneId, DungeonDef shape, Crypt entry

This task changes only types and one data record. The "test" is type-checker satisfaction plus the existing `dungeons.test.ts` updated for the renamed field.

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/dungeons.ts`
- Modify: `src/data/__tests__/dungeons.test.ts`

- [ ] **Step 1: Update `dungeons.test.ts` to expect the renamed field**

Current `src/data/__tests__/dungeons.test.ts` lines 11–15 reference `floorLength`. Replace:

```typescript
  it('crypt has positive finite floorsPerRun', () => {
    const len = DUNGEONS['crypt'].floorsPerRun;
    expect(len).toBeGreaterThan(0);
    expect(Number.isFinite(len)).toBe(true);
  });
```

Add an additional assertion below the boss test:

```typescript
  it('crypt is tier 1', () => {
    expect(DUNGEONS['crypt'].tier).toBe(1);
  });
```

- [ ] **Step 2: Run the test — expect failure**

```
npx vitest run src/data/__tests__/dungeons.test.ts
```

Expected: `floorsPerRun` access fails (TS error or undefined), `tier` access fails. Build/test failure.

- [ ] **Step 3: Update `src/data/types.ts`**

Replace the `DungeonDef` interface (lines 239–246) with:

```typescript
export type DungeonTier = 1 | 2 | 3 | 4;

export interface DungeonDef {
  id: DungeonId;
  name: string;
  theme: string;
  tier: DungeonTier;
  floorsPerRun: number;
  rowsPerFloor?: number;
  enemyPool: readonly EnemyId[];
  bossId: EnemyId;
  unlockRequirement?: string;
}

export type MilestoneId = never;
```

The empty `MilestoneId = never` union is intentional. Spec 2 introduces `'first_crypt_clear'`. The registry pattern (Task 8) typechecks against this union without naming any ids today.

- [ ] **Step 4: Update `src/data/dungeons.ts`**

Replace the file body with:

```typescript
import { CRYPT_BOSS, CRYPT_POOL } from './enemies';
import type { DungeonDef, DungeonId } from './types';

export const DUNGEONS: Record<DungeonId, DungeonDef> = {
  crypt: {
    id: 'crypt',
    name: 'The Crypt',
    theme: 'Undead ruins',
    tier: 1,
    floorsPerRun: 3,
    enemyPool: CRYPT_POOL,
    bossId: CRYPT_BOSS,
  },
};
```

- [ ] **Step 5: Fix typecheck cascade from `floorLength` rename**

Run:

```
npx tsc --noEmit
```

Expected: errors at every `floorLength` reference. Update each to `floorsPerRun`. Likely sites (verify via grep):

```
Grep --glob='**/*.ts' --pattern='floorLength'
```

Expected hits at minimum: `src/scenes/expeditions_panel_scene.ts` (line ~201 displays `${def.floorLength} floors`). Fix each to `floorsPerRun`.

- [ ] **Step 6: Run typecheck + tests**

```
npx tsc --noEmit
npx vitest run src/data/__tests__/dungeons.test.ts
```

Expected: clean typecheck; updated tests pass.

- [ ] **Step 7: Run the full test suite to confirm no regressions from the rename**

```
npm test
```

Expected: all 1515 tests pass. The rename should not change runtime behavior.

- [ ] **Step 8: Commit**

```
git add src/data/types.ts src/data/dungeons.ts src/data/__tests__/dungeons.test.ts src/scenes/expeditions_panel_scene.ts
git commit -m "refactor: add DungeonTier, MilestoneId; rename floorLength→floorsPerRun"
```

(Stage any other files Step 5's grep surfaced.)

---

### Task 2: Add `pendingMilestones` to RunState + save normalizer

**Files:**
- Modify: `src/run/run_state.ts`
- Modify: `src/save/save.ts`
- Modify: `src/save/__tests__/save.test.ts`
- Modify: `src/run/__tests__/run_state.test.ts` (only if existing fixtures break)

- [ ] **Step 1: Write the failing save-normalizer test**

Append to `src/save/__tests__/save.test.ts` (find the section with other normalizer tests around `traversedNodeIds`):

```typescript
  it('defaults pendingMilestones to [] for legacy in-flight saves', () => {
    const legacyRun = {
      dungeonId: 'crypt',
      seed: 1,
      party: [],
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
      // pendingMilestones omitted
    };
    const legacy: any = { ...validBaseSaveFields, runState: legacyRun, runRngState: 0 };
    const storage = { getItem: () => JSON.stringify(legacy), setItem: () => {}, removeItem: () => {} } as any;
    const loaded = load(storage)!;
    expect(loaded.runState!.pendingMilestones).toEqual([]);
  });
```

(Adapt `validBaseSaveFields` to the existing test's pattern — read the file head to find the right fixture-name.)

- [ ] **Step 2: Run the test — expect failure**

```
npx vitest run src/save/__tests__/save.test.ts -t "defaults pendingMilestones"
```

Expected: undefined-property assertion fails.

- [ ] **Step 3: Add the field to `RunState` in `src/run/run_state.ts`**

Update the `RunState` interface (lines 15–29):

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
  readonly traversedNodeIds: readonly string[];
  readonly surprisesThisFloor: number;
  readonly pendingMilestones: readonly MilestoneId[];
}
```

Also import `MilestoneId`:

```typescript
import type { DungeonId, Item, MilestoneId, Wound } from '@data/types';
```

- [ ] **Step 4: Default the field in `startRun`**

In `src/run/run_state.ts`, update `startRun` return (lines 60–74) to include `pendingMilestones: []`:

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
    traversedNodeIds: [startNodeId],
    surprisesThisFloor: 0,
    pendingMilestones: [],
  };
```

- [ ] **Step 5: Update `normalizeSaveFile` in `src/save/save.ts`**

Add one line to the existing `runState` block (lines 129–137):

```typescript
    runState: file.runState === undefined
      ? undefined
      : {
          ...file.runState,
          lost: file.runState.lost ?? [],
          traversedNodeIds: file.runState.traversedNodeIds ?? [file.runState.currentNodeId],
          surprisesThisFloor: file.runState.surprisesThisFloor ?? 0,
          pendingMilestones: file.runState.pendingMilestones ?? [],
        },
```

- [ ] **Step 6: Run typecheck**

```
npx tsc --noEmit
```

Expected: type errors at every RunState constructor / spread that omits `pendingMilestones`. Likely sites: tests that build synthetic RunState fixtures (`run_state.test.ts`, integration tests). Fix each by adding `pendingMilestones: []` to the literal.

- [ ] **Step 7: Run the targeted save-normalizer test — expect pass**

```
npx vitest run src/save/__tests__/save.test.ts -t "defaults pendingMilestones"
```

Expected: PASS.

- [ ] **Step 8: Run full test suite**

```
npm test
```

Expected: all tests pass (1515 + the one new test). Existing run_state tests should pass with field-fixup additions.

- [ ] **Step 9: Commit**

```
git add src/run/run_state.ts src/save/save.ts src/save/__tests__/save.test.ts src/run/__tests__/run_state.test.ts
git commit -m "feat: add RunState.pendingMilestones with save normalizer default"
```

---

### Task 3: `floorScale(floor, tier)` with default tier=1

**Files:**
- Modify: `src/dungeon/scaling.ts`
- Modify: `src/dungeon/__tests__/scaling.test.ts`

- [ ] **Step 1: Write tier-aware tests**

Append to `src/dungeon/__tests__/scaling.test.ts`:

```typescript
import { floorScale } from '../scaling';

describe('floorScale — tier parameter', () => {
  it('default tier (no arg) equals tier=1 (parity)', () => {
    for (const f of [1, 2, 5, 10, 20]) {
      expect(floorScale(f)).toEqual(floorScale(f, 1));
    }
  });

  it('tier 1 today: floor 1 = 1.0×, floor 10 = 1.9× (regression-lock)', () => {
    expect(floorScale(1, 1).hp).toBeCloseTo(1.0);
    expect(floorScale(10, 1).hp).toBeCloseTo(1.9);
  });

  it('throws on floor 0 regardless of tier', () => {
    expect(() => floorScale(0, 1)).toThrow();
    expect(() => floorScale(0, 2)).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests — expect failure**

```
npx vitest run src/dungeon/__tests__/scaling.test.ts
```

Expected: `floorScale(f, 1)` is a TS error (function takes 1 arg). Build fails.

- [ ] **Step 3: Update `src/dungeon/scaling.ts`**

Replace the file with:

```typescript
import type { DungeonTier } from '@data/types';
import type { ScaleFactors } from './node';

const TIER_SCALING_SLOPE: Record<DungeonTier, number> = {
  1: 0.10,  // today's value (regression-locked)
  2: 0.10,  // placeholder; spec 2 picks the real value
  3: 0.10,
  4: 0.10,
};

const TIER_GOLD_MULTIPLIER: Record<DungeonTier, number> = {
  1: 1,
  2: 1,
  3: 1,
  4: 1,
};

export function floorScale(floorNumber: number, tier: DungeonTier = 1): ScaleFactors {
  if (floorNumber < 1) {
    throw new Error(`floorScale: floorNumber must be >= 1, got ${floorNumber}`);
  }
  const slope = TIER_SCALING_SLOPE[tier];
  const mult = 1 + slope * (floorNumber - 1);
  return { hp: mult, attack: mult };
}

export function goldMultiplier(tier: DungeonTier): number {
  return TIER_GOLD_MULTIPLIER[tier];
}
```

- [ ] **Step 4: Run the tests — expect pass**

```
npx vitest run src/dungeon/__tests__/scaling.test.ts
```

Expected: all scaling tests pass (including the existing 5 from before).

- [ ] **Step 5: Run full test suite**

```
npm test
```

Expected: all tests pass. `floorScale` callers without explicit tier args still resolve to tier=1 default — byte-identical behavior.

- [ ] **Step 6: Commit**

```
git add src/dungeon/scaling.ts src/dungeon/__tests__/scaling.test.ts
git commit -m "feat: floorScale tier parameter (default 1) + goldMultiplier helper"
```

---

### Task 4: `goldMultiplier` test coverage + tier-2 differs smoke

**Files:**
- Modify: `src/dungeon/__tests__/scaling.test.ts`

- [ ] **Step 1: Write the goldMultiplier tests**

Append to `src/dungeon/__tests__/scaling.test.ts`:

```typescript
import { goldMultiplier } from '../scaling';

describe('goldMultiplier', () => {
  it('tier 1 returns 1 (identity)', () => {
    expect(goldMultiplier(1)).toBe(1);
  });

  it('tier 2-4 return 1 in spec 1 baseline (placeholder)', () => {
    expect(goldMultiplier(2)).toBe(1);
    expect(goldMultiplier(3)).toBe(1);
    expect(goldMultiplier(4)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests — expect pass**

```
npx vitest run src/dungeon/__tests__/scaling.test.ts -t "goldMultiplier"
```

Expected: PASS. (No implementation work — Task 3 already added the helper.)

- [ ] **Step 3: Commit**

```
git add src/dungeon/__tests__/scaling.test.ts
git commit -m "test: goldMultiplier baseline coverage"
```

---

### Task 5: tier parameter on `pickRarity` / `rollLoot` / `rollShopItem` / `rollEventItem`

**Files:**
- Modify: `src/dungeon/loot.ts`
- Modify: `src/dungeon/__tests__/loot.test.ts`

- [ ] **Step 1: Write tier-default-arg parity tests**

Append to `src/dungeon/__tests__/loot.test.ts`:

```typescript
import { _internal as lootInternal, pickRareProperty, rollAffixValue } from '../loot';

describe('loot — tier parameter parity (tier=1 default)', () => {
  it('rollLoot(rng, f, kind) ≡ rollLoot(rng, f, kind, 1)', () => {
    for (const seed of [1, 7, 42]) {
      for (const floor of [1, 5, 10]) {
        for (const kind of ['combat', 'elite', 'boss', 'treasure'] as const) {
          const a = rollLoot(createRng(seed), floor, kind);
          const b = rollLoot(createRng(seed), floor, kind, 1);
          expect(a).toEqual(b);
        }
      }
    }
  });

  it('rollShopItem(rng, slot, f) ≡ rollShopItem(rng, slot, f, 1)', () => {
    for (const seed of [1, 7, 42]) {
      const a = rollShopItem(createRng(seed), 'weapon', 5);
      const b = rollShopItem(createRng(seed), 'weapon', 5, 1);
      expect(a).toEqual(b);
    }
  });

  it('rollEventItem(rng, f, rarity) ≡ rollEventItem(rng, f, rarity, 1)', () => {
    for (const seed of [1, 7, 42]) {
      const a = rollEventItem(createRng(seed), 5, 'rare');
      const b = rollEventItem(createRng(seed), 5, 'rare', 1);
      expect(a).toEqual(b);
    }
  });
});
```

(Make sure `rollShopItem` is in the imports at the top of the file.)

- [ ] **Step 2: Run the tests — expect failure**

```
npx vitest run src/dungeon/__tests__/loot.test.ts -t "tier parameter parity"
```

Expected: `rollLoot(..., 1)` is a TS error (function takes 3 args). Build fails.

- [ ] **Step 3: Update `src/dungeon/loot.ts`**

At the top, add the import and tier table:

```typescript
import type {
  // existing imports...
  DungeonTier,
} from '@data/types';

// ... existing constants ...

const TIER_RARITY_FLOOR_BONUS: Record<DungeonTier, number> = {
  1: 0,  // today's behavior (regression-locked)
  2: 0,  // placeholder; spec 2 picks the real value
  3: 0,
  4: 0,
};
```

Update `rarityWeightsAt` signature (line ~45):

```typescript
function rarityWeightsAt(floor: number, tier: DungeonTier): { common: number; uncommon: number; rare: number } {
  const effectiveFloor = floor + TIER_RARITY_FLOOR_BONUS[tier];
  // ...existing lerp logic, but use effectiveFloor instead of floor
}
```

Replace `floor` with `effectiveFloor` inside the function body (4 references).

Update `pickRarity` signature (line ~72):

```typescript
function pickRarity(rng: Rng, floor: number, tier: DungeonTier = 1): Rarity {
  const w = rarityWeightsAt(floor, tier);
  // ... rest unchanged
}
```

Update `rollLoot` signature:

```typescript
export function rollLoot(rng: Rng, floorNumber: number, kind: LootKind, tier: DungeonTier = 1): Item | null {
  // ...
  const rarity: Rarity = kind === 'elite' ? 'rare' : pickRarity(rng, effectiveFloor, tier);
  // ... rest unchanged
}
```

Update `rollShopItem` signature:

```typescript
export function rollShopItem(rng: Rng, slot: ItemSlot, floor: number, tier: DungeonTier = 1): Item {
  // ...
  const rarity = pickRarity(rng, floor, tier);
  // ... rest unchanged
}
```

Update `rollEventItem` signature:

```typescript
export function rollEventItem(rng: Rng, floorNumber: number, rarity: Rarity, tier: DungeonTier = 1): Item {
  // (rarity is forced; tier currently unused inside the function — accept the param for API uniformity and forward-compat)
  // ... existing body unchanged
}
```

(`rollEventItem` takes `rarity` as a forced argument so internal rarity logic doesn't apply. The tier param exists for API uniformity. If spec 2 wants tier to affect event-item affix rolls, the param is ready.)

Also update the `_internal` export at the bottom:

```typescript
export const _internal = { rarityWeightsAt, scaleByFloor };
```

(Unchanged, since `rarityWeightsAt` now takes 2 args — any existing test that uses `_internal.rarityWeightsAt` will need updating in lockstep.)

- [ ] **Step 4: Fix any test fallout from the new `rarityWeightsAt` signature**

Run:

```
Grep --glob='**/*.test.ts' --pattern='rarityWeightsAt'
```

For each hit, update calls to pass `tier: 1` as the second argument.

- [ ] **Step 5: Run the loot tests — expect pass**

```
npx vitest run src/dungeon/__tests__/loot.test.ts
```

Expected: all loot tests pass (existing + new parity tests).

- [ ] **Step 6: Run full suite**

```
npm test
```

Expected: all tests pass. Callers of `rollLoot`/`pickRarity`/`rollShopItem`/`rollEventItem` without explicit tier args resolve to tier=1 — byte-identical.

- [ ] **Step 7: Commit**

```
git add src/dungeon/loot.ts src/dungeon/__tests__/loot.test.ts
git commit -m "feat: tier parameter on pickRarity/rollLoot/rollShopItem/rollEventItem"
```

---

### Task 6: Thread `tier` from `dungeon.tier` through all loot/scaling call-sites

**Files:**
- Modify: `src/run/run_state.ts`
- Modify: `src/dungeon/shop.ts`
- Modify: `src/run/event_resolver.ts`
- Modify: `src/scenes/corridor_scene.ts`

This is the wiring task. Tier=1 default args mean it's already a no-op; this task makes the wiring explicit so spec 2's tier-2 numbers actually flow.

- [ ] **Step 1: Add a `dungeonTier` helper to `src/run/run_state.ts`**

Add an import:

```typescript
import { DUNGEONS } from '@data/dungeons';
```

Just below `PARTY_SIZE` (around line 45):

```typescript
function dungeonTierOf(runState: RunState): DungeonTier {
  return DUNGEONS[runState.dungeonId].tier;
}
```

Add `DungeonTier` to the type import:

```typescript
import type { DungeonId, DungeonTier, Item, MilestoneId, Wound } from '@data/types';
```

- [ ] **Step 2: Thread tier into `rollLoot` calls inside `completeCombat`**

At line ~244 in `completeCombat`:

```typescript
  const drop = rollLoot(rng, runState.currentFloorNumber, kind, dungeonTierOf(runState));
```

- [ ] **Step 3: Thread tier into shop generation**

In `src/dungeon/shop.ts`, find the `rollShopItem` call (or the function that builds the inventory). Update to take and pass `tier`:

```typescript
// signature change for generateShop
export function generateShop(floorNumber: number, tier: DungeonTier, rng: Rng): { inventory: ShopSlot[] } {
  // ...
  // wherever rollShopItem is called:
  rollShopItem(rng, slot, floorNumber, tier);
}
```

In `src/dungeon/floor.ts`, update the `generateShop` call inside Pass 9 (around line 368):

```typescript
const inv = generateShop(floorNumber, dungeon.tier, rng).inventory;
```

(`dungeon` is the `DungeonDef` already in scope.)

- [ ] **Step 4: Thread tier into `rollEventItem` calls in `event_resolver.ts`**

In `src/run/event_resolver.ts`, update the `applyPayload` signature to accept `tier`:

```typescript
function applyPayload(
  rs: RunState,
  payload: EventPayload,
  args: EventChoiceArgs,
  rng: Rng,
  tier: DungeonTier,
): { runState: RunState; outcomeDelta: Partial<EventOutcome> } {
  switch (payload.kind) {
    // ...
    case 'add_item': {
      const item = rollEventItem(rng, rs.currentFloorNumber, payload.rarity, tier);
      // ...
    }
    case 'gold_delta': {
      const before = rs.pack.gold;
      const scaledAmount = Math.round(payload.amount * goldMultiplier(tier));
      const newPack = scaledAmount >= 0
        ? addGold(rs.pack, scaledAmount)
        : spendGold(rs.pack, Math.min(rs.pack.gold, -scaledAmount));
      // ...
    }
  }
}
```

Add imports:

```typescript
import type { DungeonTier } from '@data/types';
import { goldMultiplier } from '@dungeon/scaling';
import { DUNGEONS } from '@data/dungeons';
```

Update `applyEventChoice` to compute and pass tier:

```typescript
export function applyEventChoice(
  runState: RunState,
  card: EventCard,
  choiceIndex: 0 | 1,
  args: EventChoiceArgs,
  rng: Rng,
): { runState: RunState; outcome: EventOutcome } {
  // ... existing validation ...
  const tier = DUNGEONS[runState.dungeonId].tier;

  let rs = runState;
  const outcome: EventOutcome = {};

  for (const payload of choice.payloads) {
    const result = applyPayload(rs, payload, args, rng, tier);
    rs = result.runState;
    Object.assign(outcome, result.outcomeDelta);
  }

  return { runState: rs, outcome };
}
```

- [ ] **Step 5: Apply `goldMultiplier` to gold rewards in `completeCombat`**

In `src/run/run_state.ts` around line 238:

```typescript
  const gm = goldMultiplier(dungeonTierOf(runState));
  const reward =
    kind === 'boss'  ? Math.round(BOSS_NODE_GOLD  * runState.currentFloorNumber * gm) :
    kind === 'elite' ? Math.round(ELITE_NODE_GOLD * runState.currentFloorNumber * gm) :
                       Math.round(COMBAT_NODE_GOLD * runState.currentFloorNumber * gm);
```

Add the import:

```typescript
import { floorScale } from '@dungeon/scaling';
// extend to:
import { floorScale, goldMultiplier } from '@dungeon/scaling';
```

- [ ] **Step 6: Apply `goldMultiplier` to surprise gold (run_state.ts)**

In `src/run/run_state.ts` around line 354 (the surprise reward):

```typescript
  const reward = Math.round(SURPRISE_GOLD_BASE * runState.currentFloorNumber * goldMultiplier(dungeonTierOf(runState)));
```

- [ ] **Step 7: Apply `goldMultiplier` to surprise gold preview (corridor_scene.ts)**

`src/scenes/corridor_scene.ts:555` displays the surprise reward in the UI. Update:

```typescript
const reward = Math.round(SURPRISE_GOLD_BASE * run.currentFloorNumber * goldMultiplier(DUNGEONS[run.dungeonId].tier));
```

Add imports:

```typescript
import { goldMultiplier } from '@dungeon/scaling';
import { DUNGEONS } from '@data/dungeons';
```

- [ ] **Step 8: Run full test suite**

```
npm test
```

Expected: all tests pass. Tier=1 means `goldMultiplier(1) === 1` and `Math.round(N * 1) === N`, so behavior is identical.

- [ ] **Step 9: Manually smoke-test the Crypt — descend, fight, cashout**

```
npm run dev
```

Open the dev URL, descend into the Crypt, complete a fight, verify gold drops are unchanged (e.g., floor 1 combat = 15g). Cash out, verify vault gold matches expectations.

- [ ] **Step 10: Commit**

```
git add src/run/run_state.ts src/dungeon/shop.ts src/dungeon/floor.ts src/run/event_resolver.ts src/scenes/corridor_scene.ts
git commit -m "refactor: thread dungeon.tier through loot/gold sites"
```

---

### Task 7: `rowsPerFloor` knob in `floor.ts`

**Files:**
- Modify: `src/dungeon/floor.ts`
- Modify: `src/dungeon/__tests__/floor.test.ts`

- [ ] **Step 1: Write the failing fixture test**

Append to `src/dungeon/__tests__/floor.test.ts`:

```typescript
import { generateFloor } from '../floor';
import { createRng } from '@util/rng';

// We need a synthetic dungeon fixture to test rowsPerFloor without polluting
// the real Crypt. Inject via a module-mock.
import { DUNGEONS } from '@data/dungeons';

describe('generateFloor — rowsPerFloor', () => {
  it('default (rowsPerFloor unset) produces 8 + (floor − 1) rows', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const rows = new Set(nodes.map(n => n.id.match(/-r(\d+)-/)?.[1])).size;
    expect(rows).toBe(8);
  });

  it('default (rowsPerFloor unset) on floor 3 produces 10 rows', () => {
    const { nodes } = generateFloor('crypt', 3, createRng(1));
    const rows = new Set(nodes.map(n => n.id.match(/-r(\d+)-/)?.[1])).size;
    expect(rows).toBe(10);
  });

  it('honors rowsPerFloor when set on a dungeon def', () => {
    // Mutate the Crypt def temporarily for the duration of this test.
    const original = DUNGEONS.crypt.rowsPerFloor;
    (DUNGEONS.crypt as any).rowsPerFloor = 10;
    try {
      const { nodes } = generateFloor('crypt', 1, createRng(1));
      const rows = new Set(nodes.map(n => n.id.match(/-r(\d+)-/)?.[1])).size;
      expect(rows).toBe(10);
    } finally {
      (DUNGEONS.crypt as any).rowsPerFloor = original;
    }
  });
});
```

(If the existing test file already has helpers for row-counting, use them. The pattern above is illustrative.)

- [ ] **Step 2: Run the tests — expect the third one to fail**

```
npx vitest run src/dungeon/__tests__/floor.test.ts -t "rowsPerFloor"
```

Expected: first two pass (current behavior), third fails (`rowsPerFloor` unread).

- [ ] **Step 3: Update `src/dungeon/floor.ts`**

At line 159 in `tryGenerateFloor`:

```typescript
  const rowCount = (dungeon.rowsPerFloor ?? 8) + (floorNumber - 1);
```

(Replace `const rowCount = 8 + (floorNumber - 1);`.)

- [ ] **Step 4: Run the tests — expect pass**

```
npx vitest run src/dungeon/__tests__/floor.test.ts
```

Expected: all three new tests + all existing floor tests pass.

- [ ] **Step 5: Run full suite**

```
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add src/dungeon/floor.ts src/dungeon/__tests__/floor.test.ts
git commit -m "feat: rowsPerFloor knob on DungeonDef (default 8)"
```

---

### Task 8: `src/run/milestones.ts` module

**Files:**
- Create: `src/run/milestones.ts`
- Create: `src/run/__tests__/milestones.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/run/__tests__/milestones.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { applyPendingMilestones, detectBossMilestones, MILESTONES } from '../milestones';
import type { SaveFile } from '@save/save';

const fakeSaveFile = {} as SaveFile;

describe('milestones — registry', () => {
  it('MILESTONES is empty in spec 1', () => {
    expect(Object.keys(MILESTONES).length).toBe(0);
  });
});

describe('detectBossMilestones', () => {
  it('returns empty array for crypt floor 3 in spec 1', () => {
    expect(detectBossMilestones('crypt', 3)).toEqual([]);
  });

  it('returns empty array for any input in spec 1', () => {
    expect(detectBossMilestones('crypt', 1)).toEqual([]);
    expect(detectBossMilestones('crypt', 5)).toEqual([]);
  });
});

describe('applyPendingMilestones', () => {
  it('returns the input state unchanged for empty id list', () => {
    expect(applyPendingMilestones(fakeSaveFile, [])).toBe(fakeSaveFile);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```
npx vitest run src/run/__tests__/milestones.test.ts
```

Expected: module not found.

- [ ] **Step 3: Create `src/run/milestones.ts`**

```typescript
import type { DungeonId, MilestoneId } from '@data/types';
import type { SaveFile } from '@save/save';

export type MilestoneHandler = (state: SaveFile) => SaveFile;

/**
 * Spec 1 ships an empty registry. Spec 2 adds 'first_crypt_clear' here
 * alongside the DUNGEONS['sunken_keep'] entry.
 *
 * The cast is needed because TypeScript can't directly construct
 * Record<never, MilestoneHandler> from {}; this is purely a type-level
 * accommodation and has no runtime effect.
 */
export const MILESTONES: Record<MilestoneId, MilestoneHandler> = {} as Record<MilestoneId, MilestoneHandler>;

/**
 * Returns the milestone ids triggered by this boss defeat.
 * Called from completeCombat when the defeated encounter's kind is 'boss'
 * AND floorNumber === DUNGEONS[dungeonId].floorsPerRun (canonical final boss only).
 *
 * Handlers are responsible for their own idempotency — e.g., the future
 * 'first_crypt_clear' handler will check if 'sunken_keep' is already in
 * unlocks.dungeons before adding it.
 */
export function detectBossMilestones(
  _dungeonId: DungeonId,
  _floorNumber: number,
): readonly MilestoneId[] {
  return [];  // empty in spec 1; spec 2 fills in the body
}

/**
 * Drains pendingMilestones into SaveFile by running each registered handler.
 */
export function applyPendingMilestones(
  state: SaveFile,
  ids: readonly MilestoneId[],
): SaveFile {
  let next = state;
  for (const id of ids) {
    const handler = MILESTONES[id];
    if (handler) next = handler(next);
  }
  return next;
}
```

- [ ] **Step 4: Run the test — expect pass**

```
npx vitest run src/run/__tests__/milestones.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Run full suite**

```
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add src/run/milestones.ts src/run/__tests__/milestones.test.ts
git commit -m "feat: milestone registry module (empty in spec 1)"
```

---

### Task 9: Populate `pendingMilestones` in `completeCombat`; drain in `cashout` and wipe path

**Files:**
- Modify: `src/run/run_state.ts`
- Modify: `src/run/__tests__/run_state.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/run/__tests__/run_state.test.ts`. The file already exposes `makeParty()`, `mockCombatResult(party, finalHps, outcome)`, and `advanceToBossNode(rs)` — use them directly.

```typescript
import { DUNGEONS } from '@data/dungeons';

describe('completeCombat — pendingMilestones populate', () => {
  it('canonical-final-boss defeat exercises the detectBossMilestones path (returns [] in spec 1)', () => {
    // Walk the Crypt to floor-3 boss. In spec 1 detectBossMilestones returns []
    // for all input, so pendingMilestones stays empty. This guards against a
    // future regression where the populate site is silently removed.
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);
    // Press on through floors 1 and 2 to reach floor 3 boss.
    while (rs.currentFloorNumber < DUNGEONS.crypt.floorsPerRun) {
      // beat boss
      rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
      // press on (status === 'camp_screen' after boss)
      expect(rs.status).toBe('camp_screen');
      rs = pressOn(rs, createRng(99));
      rs = advanceToBossNode(rs);
    }
    // At floor-3 boss now — defeat it
    const after = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(after.status).toBe('camp_screen');
    expect(after.pendingMilestones).toEqual([]);  // spec 1 baseline; spec 2 will assert non-empty
  });

  it('non-canonical (floor 1) boss defeat in a 3-floor dungeon does NOT credit', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);
    expect(rs.currentFloorNumber).toBe(1);
    // Beat the floor-1 boss — non-canonical (floorsPerRun=3)
    const after = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(after.pendingMilestones).toEqual([]);  // floor 1 ≠ floorsPerRun, so no detect call
  });

  it('post-canonical (floor 4+) boss defeat does NOT credit', () => {
    // Press on through all 3 floors then advance to floor-4 boss; defeat does not credit.
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    for (let f = 1; f <= DUNGEONS.crypt.floorsPerRun; f++) {
      rs = advanceToBossNode(rs);
      rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
      rs = pressOn(rs, createRng(99));
    }
    // We're now on floor 4
    expect(rs.currentFloorNumber).toBe(DUNGEONS.crypt.floorsPerRun + 1);
    rs = advanceToBossNode(rs);
    const after = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(after.pendingMilestones).toEqual([]);  // post-canonical floor → no credit
  });
});

describe('cashout — pendingMilestones drain', () => {
  it('returns outcome.milestonesTriggered and zeros runState.pendingMilestones', () => {
    // Walk to floor-3 boss, defeat → camp_screen → cashout
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    while (rs.currentFloorNumber < DUNGEONS.crypt.floorsPerRun) {
      rs = advanceToBossNode(rs);
      rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
      rs = pressOn(rs, createRng(99));
    }
    rs = advanceToBossNode(rs);
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.status).toBe('camp_screen');

    const { runState: ended, outcome } = cashout(rs);
    expect(outcome.milestonesTriggered).toEqual(rs.pendingMilestones);  // copied through
    expect(ended.pendingMilestones).toEqual([]);  // zeroed on returned state
    expect(ended.status).toBe('ended');
  });
});

describe('completeCombat wipe path — pendingMilestones drain', () => {
  it('wipe outcome includes milestonesTriggered and zeros runState.pendingMilestones', () => {
    // Walk to first combat, then wipe.
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Force-advance to a combat node — startRun puts us at the first row's combat node.
    if (rs.awaitingFork) rs = chooseNextNode(rs, currentNode(rs).nextNodeIds[0]);
    const wipeResult = mockCombatResult(rs.party, [0, 0, 0], 'wipe');
    const { runState: ended, wipe } = completeCombat(rs, wipeResult, createRng(99));
    expect(wipe).toBeDefined();
    expect(wipe!.milestonesTriggered).toEqual(rs.pendingMilestones);
    expect(ended.pendingMilestones).toEqual([]);
    expect(ended.status).toBe('ended');
  });
});

describe('pressOn — pendingMilestones persists across floor advance', () => {
  it('pressOn carries pendingMilestones forward unchanged', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.status).toBe('camp_screen');
    const before = rs.pendingMilestones;
    const after = pressOn(rs, createRng(99));
    expect(after.pendingMilestones).toEqual(before);  // preserved across floor advance
  });
});
```

(`pressOn` may take different args than `(rs, rng)` — verify the signature against the existing run_state.ts. Adjust the call accordingly.)

- [ ] **Step 2: Run the tests — expect failure**

```
npx vitest run src/run/__tests__/run_state.test.ts -t "pendingMilestones"
```

Expected: tests fail because:
- `outcome.milestonesTriggered` doesn't exist on `CashoutOutcome`.
- `wipe.milestonesTriggered` doesn't exist on `WipeOutcome`.
- `completeCombat`'s boss branch doesn't call `detectBossMilestones`.

- [ ] **Step 3: Extend `CashoutOutcome` and `WipeOutcome` interfaces in `src/run/run_state.ts`**

Update interfaces (lines 31–43):

```typescript
export interface CashoutOutcome {
  goldBanked: number;
  itemsBanked: readonly Item[];
  heroesReturned: readonly Hero[];
  heroesFallen: readonly Hero[];
  heroesLost: readonly Hero[];
  milestonesTriggered: readonly MilestoneId[];
}

export interface WipeOutcome {
  packLost: Pack;
  heroesFallen: readonly Hero[];
  heroesLost: readonly Hero[];
  milestonesTriggered: readonly MilestoneId[];
}
```

- [ ] **Step 4: Populate `pendingMilestones` in the `completeCombat` boss-victory branch**

Add the import at the top of `src/run/run_state.ts`:

```typescript
import { detectBossMilestones } from './milestones';
```

In the boss-victory branch (lines 259–268), update to:

```typescript
  if (isBoss) {
    const def = DUNGEONS[runState.dungeonId];
    const isCanonicalFinal = runState.currentFloorNumber === def.floorsPerRun;
    const triggered = isCanonicalFinal
      ? detectBossMilestones(runState.dungeonId, runState.currentFloorNumber)
      : [];
    return {
      runState: {
        ...runState,
        party: partyAfterXp,
        fallen: [...runState.fallen, ...newFallen],
        pack: newPack,
        status: 'camp_screen',
        pendingMilestones: [...runState.pendingMilestones, ...triggered],
      },
    };
  }
```

- [ ] **Step 5: Drain in `cashout`**

Update `cashout` (lines 404–421):

```typescript
export function cashout(runState: RunState): { runState: RunState; outcome: CashoutOutcome } {
  const atCamp = runState.status === 'in_dungeon' &&
                 currentNode(runState).type === 'camp';
  if (runState.status !== 'camp_screen' && !atCamp) {
    throw new Error(`cashout: must be at camp_screen or camp node, got status='${runState.status}'`);
  }
  const outcome: CashoutOutcome = {
    goldBanked: totalGold(runState.pack),
    itemsBanked: runState.pack.items,
    heroesReturned: runState.party,
    heroesFallen: runState.fallen,
    heroesLost: runState.lost,
    milestonesTriggered: runState.pendingMilestones,
  };
  return {
    runState: { ...runState, status: 'ended', pendingMilestones: [] },
    outcome,
  };
}
```

- [ ] **Step 6: Drain in the wipe path of `completeCombat`**

Find the wipe branch (around lines 195–212). Update:

```typescript
    const wipe: WipeOutcome = {
      packLost: runState.pack,
      heroesFallen: allLost,
      heroesLost: runState.lost,
      milestonesTriggered: runState.pendingMilestones,
    };
    return {
      runState: {
        ...runState,
        party: [],
        fallen: allLost,
        pack: createPack(),
        status: 'ended',
        pendingMilestones: [],
      },
      wipe,
    };
```

- [ ] **Step 7: Run the targeted tests — expect pass**

```
npx vitest run src/run/__tests__/run_state.test.ts -t "pendingMilestones"
```

Expected: all 5 tests pass.

- [ ] **Step 8: Run full suite**

```
npm test
```

Expected: all tests pass. Existing tests of `cashout` and the wipe path may need their fixture expectations widened to include `milestonesTriggered: []` in the outcome shape. Update each in lockstep — the change is uniform.

- [ ] **Step 9: Commit**

```
git add src/run/run_state.ts src/run/__tests__/run_state.test.ts
git commit -m "feat: populate/drain RunState.pendingMilestones via cashout and wipe"
```

---

### Task 10: Scene-level — apply pending milestones at cashout/wipe

**Files:**
- Modify: `src/scenes/camp_screen_scene.ts`
- Modify: `src/scenes/corridor_scene.ts` (or wherever the wipe outcome is consumed — verify with grep)

- [ ] **Step 1: Find every consumer of `cashout` and the wipe outcome**

```
Grep --pattern='cashout\(' --output-mode=files_with_matches
Grep --pattern='\.wipe' --output-mode=content -n
```

Expected hits: `camp_screen_scene.ts`, possibly `dungeon_scene.ts`, `corridor_scene.ts`, and tests.

- [ ] **Step 2: Update `camp_screen_scene.ts` to apply milestones after cashout**

`onLeave` (around line 170) currently does:

```typescript
const { outcome } = cashout(run);
const fallenIds = new Set(outcome.heroesFallen.map((h) => h.id));
const lostIds = new Set(outcome.heroesLost.map((h) => h.id));

appState.update((s) => {
  const vault = credit(s.vault, outcome.goldBanked);
  const stash = addItems(s.stash, outcome.itemsBanked);
  let roster = s.roster;
  // ... existing roster mutations ...
  return {
    ...s,
    vault,
    stash,
    roster,
    // ... other fields ...
  };
});
```

Add the import:

```typescript
import { applyPendingMilestones } from '@run/milestones';
```

Modify the `appState.update` callback to apply milestones to the constructed return value before returning it. Replace the final `return { ... }` with:

```typescript
  const next = {
    ...s,
    vault,
    stash,
    roster,
    // ... whatever other fields the existing return has ...
  };
  return applyPendingMilestones(next, outcome.milestonesTriggered);
```

(Read the existing `return` block in `onLeave` and adapt — the key is piping the constructed state through `applyPendingMilestones` immediately before returning.)

- [ ] **Step 3: Update wipe-outcome consumers similarly**

Find scenes that handle wipe outcomes — typically `corridor_scene.ts` (combat wraps to corridor in Phase 6c) — and add the same `applyPendingMilestones(next, wipe.milestonesTriggered)` call inside their `appState.update(...)` block.

- [ ] **Step 4: Run full suite**

```
npm test
```

Expected: all tests pass. Behavior unchanged at runtime since `outcome.milestonesTriggered` is always `[]` in spec 1.

- [ ] **Step 5: Manually smoke a Crypt run**

```
npm run dev
```

Descend, fight to a boss, beat it, cash out. Verify no errors in the console. Cash out and wipe paths should work identically to before.

- [ ] **Step 6: Commit**

```
git add src/scenes/camp_screen_scene.ts src/scenes/corridor_scene.ts
git commit -m "feat: scene-level applyPendingMilestones at cashout/wipe"
```

---

### Task 11: `EnemySprite.setLocked()` method

**Files:**
- Modify: `src/render/enemy_sprite.ts`

- [ ] **Step 1: Add the method to `src/render/enemy_sprite.ts`**

After the constructor, add:

```typescript
  setLocked(locked: boolean): void {
    const tint = locked ? 0x000000 : 0xffffff;
    const alpha = locked ? 0.7 : 1.0;
    this.list.forEach((child) => {
      if (child instanceof Phaser.GameObjects.Image) {
        child.setTint(tint);
        child.setAlpha(alpha);
      }
    });
  }
```

The method iterates the container's children. `EnemySprite` only adds `Phaser.GameObjects.Image` instances (verified by reading the constructor — boss path adds one image, minion path adds body image + per-slot overlay images). The `instanceof` guard is defensive against future extensions.

- [ ] **Step 2: Verify by manual smoke (no automated test — Phaser scene-level)**

```
npm run dev
```

The method has no production caller yet — Task 14 wires it. For Task 11, just verify the typecheck passes:

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Run full suite**

```
npm test
```

Expected: all tests pass (no behavior change).

- [ ] **Step 4: Commit**

```
git add src/render/enemy_sprite.ts
git commit -m "feat: EnemySprite.setLocked for silhouette rendering"
```

---

### Task 12: Pure layout helper for multi-dungeon list

**Files:**
- Create: `src/scenes/expeditions_layout.ts`
- Create: `src/scenes/__tests__/expeditions_layout.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scenes/__tests__/expeditions_layout.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { computeCardPositions } from '../expeditions_layout';

describe('computeCardPositions', () => {
  it('N=1 centers the card at panelCenterY', () => {
    const positions = computeCardPositions(1, 460, 96, 12);
    expect(positions.length).toBe(1);
    expect(positions[0]).toBe(230);  // panelCenterY = 230 (PANEL_CY) when called with PANEL_CY context
  });

  it('N=4 fits within panelHeight=460', () => {
    // 4 cards × 96 + 3 gaps × 12 = 420 ≤ 460
    const positions = computeCardPositions(4, 460, 96, 12);
    expect(positions.length).toBe(4);
    const firstTop = positions[0] - 96 / 2;
    const lastBottom = positions[3] + 96 / 2;
    expect(lastBottom - firstTop).toBe(420);
  });

  it('positions are monotonically increasing', () => {
    const positions = computeCardPositions(3, 460, 96, 12);
    expect(positions[0]).toBeLessThan(positions[1]);
    expect(positions[1]).toBeLessThan(positions[2]);
  });

  it('N=2 — gap between cards is exactly the gap parameter', () => {
    const positions = computeCardPositions(2, 460, 96, 12);
    expect(positions[1] - positions[0]).toBe(96 + 12);
  });
});
```

(Note: the helper is *relative* — it returns positions in a coordinate system where the card stack centers around 0 by default. The scene adds the panel center offset. Adjust the test expectations to match your chosen contract; below is one valid choice.)

- [ ] **Step 2: Run the test — expect failure (module not found)**

```
npx vitest run src/scenes/__tests__/expeditions_layout.test.ts
```

Expected: import resolution failure.

- [ ] **Step 3: Create `src/scenes/expeditions_layout.ts`**

```typescript
/**
 * Returns the y-coordinates (centers) of N stacked cards centered vertically
 * in a panel of given height, with a fixed cardHeight and gap between cards.
 *
 * Pure function — used by ExpeditionsPanelScene's dungeon-list rendering.
 * Tested in isolation since the scene itself isn't unit-testable.
 */
export function computeCardPositions(
  n: number,
  panelHeight: number,
  cardHeight: number,
  gap: number,
): number[] {
  const totalH = n * cardHeight + (n - 1) * gap;
  const startY = (panelHeight - totalH) / 2 + cardHeight / 2;
  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    result.push(startY + i * (cardHeight + gap));
  }
  return result;
}
```

- [ ] **Step 4: Run the test — expect pass (or update test expectations to match the contract)**

```
npx vitest run src/scenes/__tests__/expeditions_layout.test.ts
```

If your test expected `230` for N=1 in a 460-height panel, the helper returns `(460 - 96) / 2 + 48 = 230`. ✓

- [ ] **Step 5: Run full suite**

```
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add src/scenes/expeditions_layout.ts src/scenes/__tests__/expeditions_layout.test.ts
git commit -m "feat: computeCardPositions layout helper"
```

---

### Task 13: Refactor Expeditions panel to render N cards from `unlocks.dungeons`

This is a sizable scene refactor. It replaces the single-card rendering with a loop over all dungeons. **Crypt-only state must render visually unchanged.** Tier badge and locked-card path are NOT yet added — those land in Task 14.

**Files:**
- Modify: `src/scenes/expeditions_panel_scene.ts`

- [ ] **Step 1: Replace `buildDungeonListStage` with a multi-card version**

Read the current `buildDungeonListStage` (lines 163–245). Replace its body with a loop over `Object.values(DUNGEONS)`. Use the new layout helper.

```typescript
import { computeCardPositions } from './expeditions_layout';
import { appState } from './app_state';

private buildDungeonListStage(): void {
  this.stageContainer.add(
    this.add
      .text(PANEL_CX, SUBTITLE_Y, 'Choose a dungeon to descend into.', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5),
  );

  const allDungeons = Object.values(DUNGEONS);
  const unlockedIds = new Set(appState.get().unlocks.dungeons);
  const cards = allDungeons.map(def => ({ def, locked: !unlockedIds.has(def.id) }));

  const CARD_W = 820;
  const CARD_H = 96;
  const GAP = 12;
  const positions = computeCardPositions(cards.length, PANEL_H, CARD_H, GAP);
  // PANEL_CY is the center of the panel; positions array assumes panel-relative coords.
  // Translate to scene coords by offsetting from (PANEL_CY - PANEL_H/2).
  const panelTop = PANEL_CY - PANEL_H / 2;

  for (let i = 0; i < cards.length; i++) {
    const { def, locked } = cards[i];
    const cardY = panelTop + positions[i];
    this.renderDungeonCard(PANEL_CX, cardY, CARD_W, CARD_H, def, locked);
  }
}

private renderDungeonCard(
  cx: number,
  cy: number,
  w: number,
  h: number,
  def: DungeonDef,
  locked: boolean,
): void {
  const cardBorder = locked ? 0x333333 : 0x444444;
  const cardBg = this.add
    .rectangle(cx, cy, w, h, locked ? 0x141414 : 0x1a1a1a)
    .setStrokeStyle(2, cardBorder);
  this.stageContainer.add(cardBg);

  // Title (left-aligned)
  const title = locked ? '???' : def.name;
  this.stageContainer.add(
    this.add
      .text(cx - w / 2 + 16, cy - h / 2 + 12, title, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: locked ? '#666666' : '#ffffff',
      })
      .setOrigin(0, 0),
  );

  // Theme + floor count (right-aligned, top-right)
  const themeText = locked
    ? `Unlock by: ${def.unlockRequirement ?? 'Locked'}`
    : `${def.theme} · ${def.floorsPerRun} floors`;
  this.stageContainer.add(
    this.add
      .text(cx + w / 2 - 16, cy - h / 2 + 16, themeText, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#aaaaaa',
      })
      .setOrigin(1, 0),
  );

  // Signature enemy strip (existing logic, compacted, with locked silhouette path)
  const ids: readonly EnemyId[] = [...def.enemyPool, def.bossId];
  const SCALE = 1.5;
  const FRAME_W = 16;
  const BOSS_W = 32;
  const GAP_PX = 6;
  const totalWidth =
    def.enemyPool.length * FRAME_W * SCALE
    + BOSS_W * SCALE
    + def.enemyPool.length * GAP_PX;
  let cursor = cx - w / 2 + 16;
  const stripGroundY = cy + h / 2 - 8;

  for (const enemyId of ids) {
    const isBoss = enemyId === def.bossId;
    const frameW = isBoss ? BOSS_W : FRAME_W;
    const fullSize = frameW * SCALE;
    const centerX = cursor + fullSize / 2;
    const centerY = stripGroundY - fullSize / 2;
    const sprite = new EnemySprite(this, centerX, centerY, enemyId);
    sprite.setScale(SCALE);
    if (locked) sprite.setLocked(true);
    this.stageContainer.add(sprite);
    cursor += fullSize + GAP_PX;
  }

  // Click prompt (bottom-right) and interactive only when unlocked
  if (!locked) {
    this.stageContainer.add(
      this.add
        .text(cx + w / 2 - 16, cy + h / 2 - 12, '▸ Click to plan', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffcc66',
        })
        .setOrigin(1, 1),
    );
    cardBg.setInteractive({ useHandCursor: true });
    cardBg.on('pointerover', () => cardBg.setStrokeStyle(2, 0xffcc66));
    cardBg.on('pointerout', () => cardBg.setStrokeStyle(2, cardBorder));
    cardBg.on('pointerdown', () => {
      this.selectedDungeonId = def.id;
      this.setStage('party_picker');
    });
  }
}
```

Add the field:

```typescript
private selectedDungeonId: DungeonId = 'crypt';
```

- [ ] **Step 2: Add necessary imports**

At the top of `expeditions_panel_scene.ts`:

```typescript
import type { DungeonDef, DungeonId } from '@data/types';
import { computeCardPositions } from './expeditions_layout';
```

- [ ] **Step 3: Run typecheck**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Manually smoke-test**

```
npm run dev
```

Open Expeditions. Verify:
- Crypt card renders centered (only one dungeon).
- Card shows "The Crypt", "Undead ruins · 3 floors", enemy strip, "▸ Click to plan".
- Clicking opens party picker.
- Locked-card path doesn't render (Crypt is unlocked).

- [ ] **Step 5: Run full suite**

```
npm test
```

Expected: all tests pass (no run-time logic change for run flow; UI refactor only).

- [ ] **Step 6: Commit**

```
git add src/scenes/expeditions_panel_scene.ts
git commit -m "refactor: Expeditions panel renders N dungeons from unlocks list"
```

---

### Task 14: Tier badge + verify locked-card visual via synthetic fixture

The locked-card rendering path was added in Task 13 but is not exercised in production (no locked dungeon in spec 1). This task adds a tier badge to the unlocked card AND a way to manually verify the locked-card rendering with a synthetic dungeon fixture.

**Files:**
- Modify: `src/scenes/expeditions_panel_scene.ts`

- [ ] **Step 1: Add the tier badge to `renderDungeonCard`**

Just below the title text, add:

```typescript
  // Tier badge — placeholder palette in spec 1; spec 2 picks the real per-tier color.
  // Position the badge to the right of the title text. We measure the title's
  // rendered width via Phaser's Text.width property after creation.
  const TIER_COLOR: Record<number, number> = { 1: 0xccaa44, 2: 0x4488cc, 3: 0xcc4444, 4: 0x8844cc };
  const badgeColor = TIER_COLOR[def.tier] ?? 0x666666;

  // Refactor: lift the title creation to capture its width, then use it.
  const titleObj = this.add
    .text(cx - w / 2 + 16, cy - h / 2 + 12, title, {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: locked ? '#666666' : '#ffffff',
    })
    .setOrigin(0, 0);
  this.stageContainer.add(titleObj);

  const badgeX = titleObj.x + titleObj.width + 8;
  const badgeY = titleObj.y + titleObj.height / 2;
  const badgeBg = this.add
    .rectangle(badgeX, badgeY, 36, 18, badgeColor)
    .setOrigin(0, 0.5);
  this.stageContainer.add(badgeBg);
  this.stageContainer.add(
    this.add
      .text(badgeX + 18, badgeY, `T${def.tier}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffffff',
      })
      .setOrigin(0.5),
  );
```

(In Task 13's `renderDungeonCard` you originally created the title text inside the function body. Move that creation up so its `.width` is measurable, and remove the duplicate creation that Task 13 had for the title.)

- [ ] **Step 2: Manually verify the locked-card path with a temporary in-scene stub**

In `expeditions_panel_scene.ts`'s `buildDungeonListStage`, **temporarily** push a stub locked card into the `cards` array right after construction:

```typescript
// TEMPORARY — remove after manual verification
const STUB_LOCKED: { def: DungeonDef; locked: true } = {
  def: {
    id: 'crypt',  // bogus id — only needed for the type checker; click is disabled when locked
    name: 'Sunken Keep',
    theme: 'Flooded castle',
    tier: 2,
    floorsPerRun: 3,
    enemyPool: ['skeleton_warrior', 'ghost', 'zombie'],
    bossId: 'bone_lich',
    unlockRequirement: 'Defeat the Bone Lich',
  },
  locked: true,
};
cards.push(STUB_LOCKED);
```

This is purely a dev-time visual check; do not commit it.

- [ ] **Step 3: Run dev server and verify the visual**

```
npm run dev
```

Open Expeditions. Expect:
- Crypt card unchanged (T1 badge gold, click works, enemy strip shows skeletons/ghosts/zombie/cultist/bone-lich at full color).
- (Once stub is added) A second card below shows "???", "Unlock by: Defeat the Bone Lich", silhouetted enemies, no click cursor.

- [ ] **Step 4: Remove the stub fixture before commit**

Delete the temporary `_DEV_LOCKED_FIXTURE` (or revert your stub to verify).

- [ ] **Step 5: Run full suite**

```
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add src/scenes/expeditions_panel_scene.ts
git commit -m "feat: tier badge on Expeditions cards"
```

---

### Task 15: Dungeon-aware party-picker title + `descend` uses `selectedDungeonId`

**Files:**
- Modify: `src/scenes/expeditions_panel_scene.ts`

- [ ] **Step 1: Update `setStage` to use `selectedDungeonId`**

In `setStage('party_picker')` (around line 154), replace:

```typescript
this.titleText.setText('The Crypt — Pick Your Party');
```

with:

```typescript
const def = DUNGEONS[this.selectedDungeonId];
this.titleText.setText(`${def.name} — Pick Your Party`);
```

- [ ] **Step 2: Update `descend()` to use `selectedDungeonId`**

In `descend()` (around line 510), replace:

```typescript
const runState = startRun('crypt', party, seed, rng);
```

with:

```typescript
const runState = startRun(this.selectedDungeonId, party, seed, rng);
```

- [ ] **Step 3: Manually smoke-test**

```
npm run dev
```

Click the Crypt card → verify the party-picker title reads "The Crypt — Pick Your Party". Drag heroes, descend, verify the run starts in the Crypt as before.

- [ ] **Step 4: Run typecheck + tests**

```
npx tsc --noEmit
npm test
```

Expected: clean typecheck; all tests pass.

- [ ] **Step 5: Commit**

```
git add src/scenes/expeditions_panel_scene.ts
git commit -m "feat: party picker uses selectedDungeonId for title and descent"
```

---

### Task 16: Final regression sweep — full suite + manual Crypt run

**Files:** None modified.

- [ ] **Step 1: Run the full test suite**

```
npm test
```

Expected: all tests pass. Total count should be roughly 1540–1545 (existing 1515 + ~25 new).

- [ ] **Step 2: Manually play a full Crypt run**

```
npm run dev
```

- Descend into the Crypt with 3 heroes.
- Fight a combat node — verify gold drop matches today (e.g., F1 combat = 15g).
- Visit a shop if the floor has one — verify prices unchanged (shop prices are NOT tier-multiplied).
- Visit an event node — verify gold delta amounts unchanged.
- Visit a treasure node — verify item drop quality unchanged.
- Reach the boss, defeat it, cash out — verify banked gold matches expectations.
- Verify the Crypt card on Expeditions still renders the T1 badge and enemy strip correctly.

- [ ] **Step 3: Open the dev console and verify no warnings**

In the browser console, look for any unexpected warnings or errors during the full run. Particular attention to:
- Save / load warnings during initial boot.
- Phaser type errors during scene transitions.
- Milestone-related logs (none expected in spec 1).

- [ ] **Step 4: Verify save shape via browser console**

```javascript
JSON.parse(localStorage.getItem('pixel-battle-game/save'))
```

Expected:
- `unlocks.dungeons === ['crypt']` (unchanged).
- `unlocks.classes` contains all 6 starter classes.
- After a run starts, `runState.pendingMilestones === []`.
- After a Crypt floor 3 boss defeat (and before cashout), `runState.pendingMilestones === []` (still empty in spec 1 — `MilestoneId = never` so detection always returns []).

- [ ] **Step 5: Migrate the TODO entry**

Move TODO Cluster D · 1 (Sunken Keep) → reframe with a follow-up entry for spec 2 (Sunken Keep content + art + first-Crypt-clear handler).

- [ ] **Step 6: Add the HISTORY entry**

Append to `HISTORY.md` (newest on top) using the slim template (~15-25 lines):

```markdown
### 2026-05-05 · Sunken Keep — Spec 1 (foundation + milestone plumbing) (Cluster D · 1)

- **Why:** Tier-3 cascade gates on Sunken Keep, which requires a `tier` concept, multi-dungeon Expeditions UI, and a milestone-unlock system that doesn't exist yet. Decomposed into spec 1 (this — pure plumbing) + spec 2 (content + art + first-Crypt-clear handler).
- **Decisions:**
  - Brainstorm Q1–Q6 + sub-questions captured in spec doc; key choices: registry pattern with no handlers wired, tier=1 = today's behavior (regression-locked), `cashout` stays pure of SaveFile, milestones fire on canonical-final-boss and are applied at run-end (cashout AND wipe), shop prices stay flat at higher tier.
  - `floorLength` → `floorsPerRun` rename for clarity; new `rowsPerFloor?` knob defaults to 8.
  - `MilestoneId = never` keeps the registry inert and type-safe in spec 1.
  - `pendingMilestones` persists across `pressOn` so press-on-after-canonical-clear-then-wipe still credits at run-end.
- **Surprises:**
  - Surprise gold is computed in TWO sites (`run_state.ts` and `corridor_scene.ts`) — the corridor preview duplicates the constant. Both threaded with `goldMultiplier(tier)`.
  - `event_resolver.ts`'s `gold_delta` payload was non-floor-scaled today — tier multiplication applies to the raw amount, not floor*amount. Tier=1 is identity so no behavior change.
- **Source:** spec `docs/superpowers/specs/2026-05-05-sunken-keep-foundation-design.md`; plan `docs/superpowers/plans/2026-05-05-sunken-keep-foundation.md`.
```

- [ ] **Step 7: Final commit (HISTORY + TODO updates)**

```
git add HISTORY.md TODO.md
git commit -m "docs: HISTORY/TODO migration for Sunken Keep spec 1"
```

---

## Done

- All five layers (types, data, balance, milestones, UI) plumbed.
- Crypt run plays identically to today.
- Multi-dungeon UI is visually verified with a synthetic locked fixture.
- Test count delta lands ~25-30 above baseline.
- Spec 2 (Sunken Keep content + art + first-Crypt-clear milestone handler) can drop in additive-only — no refactors needed.
