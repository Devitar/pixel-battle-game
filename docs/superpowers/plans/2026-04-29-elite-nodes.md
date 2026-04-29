# Elite Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `'elite'` node type to the dungeon graph — a tougher fight (4 enemies + stat boost on top of `floorScale`) that grants a guaranteed Rare drop and 2× combat gold/XP. Elites compete with shops at floor forks via a 3-shape RNG.

**Architecture:** Five sequential tasks, each landing a green test suite and a commit.

1. New `composeEliteEncounter` generator + shared `assignSlots` helper. Pure addition — no behavior change yet.
2. `rollLoot` API migration from `isBoss: boolean` to `kind: 'combat' | 'elite' | 'boss'` + new elite branch (forced Rare).
3. Extend the `Node` discriminated union with the `'elite'` variant + scene type-narrowing shims.
4. `completeCombat` derives `kind` from `node.type` and applies elite gold/XP rewards.
5. Floor generator switches the fork from `shopOnBranchA: boolean` to a triangular RNG that yields one of `shop_vs_combat` / `elite_vs_combat` / `elite_vs_shop` per floor.

After Task 5, elite nodes appear in the wild. Order matters: Task 5 produces elite nodes that Tasks 2–4 must already be ready to handle.

**Tech Stack:** TypeScript, Vitest. No Phaser imports under `src/dungeon/`, `src/data/`, `src/run/` (firewall rule from `CLAUDE.md`).

**Spec:** `docs/superpowers/specs/2026-04-29-elite-nodes-design.md`. Read it before starting.

**Numerical knobs (from spec §2.2 / §3.2):**

- `ELITE_HP_MULT = 1.5`
- `ELITE_ATTACK_MULT = 1.25`
- `ELITE_NODE_GOLD = 30` (combat = 15, boss = 100)
- `xpForEliteNode(floor) = 10 * floor` (combat = `5 * floor`, boss = `30 * floor`)

---

## Task 1: `composeEliteEncounter` foundation

Add the encounter generator that future floor generation will call. Pure addition: no `Node` union change, no rollLoot change. After this task, `composeEliteEncounter` is reachable from tests but no production caller invokes it yet.

**Files:**
- Modify: `src/dungeon/encounter.ts` (export `assignSlots` so `elite.ts` can reuse it)
- Create: `src/dungeon/elite.ts`
- Create: `src/dungeon/__tests__/elite.test.ts`

- [ ] **Step 1.1: Write the failing test file**

Create `src/dungeon/__tests__/elite.test.ts` with this exact content:

```typescript
import { describe, expect, it } from 'vitest';
import { CRYPT_POOL, ENEMIES } from '../../data/enemies';
import type { EnemyId } from '../../data/types';
import { createRng } from '../../util/rng';
import { composeEliteEncounter, ELITE_ATTACK_MULT, ELITE_HP_MULT } from '../elite';
import { floorScale } from '../scaling';

const FLAT_SCALE = { hp: 1.0, attack: 1.0 };

function isFrontLiner(id: EnemyId): boolean {
  return ENEMIES[id].preferredSlots.some((s) => s === 1 || s === 2);
}

describe('composeEliteEncounter', () => {
  it('is deterministic for a given seed', () => {
    const a = composeEliteEncounter(CRYPT_POOL, FLAT_SCALE, createRng(42));
    const b = composeEliteEncounter(CRYPT_POOL, FLAT_SCALE, createRng(42));
    expect(a).toEqual(b);
  });

  it('always produces exactly 4 enemies', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const enc = composeEliteEncounter(CRYPT_POOL, FLAT_SCALE, createRng(seed));
      expect(enc.enemies).toHaveLength(4);
    }
  });

  it('slots are densely packed 1..4 with no duplicates', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const enc = composeEliteEncounter(CRYPT_POOL, FLAT_SCALE, createRng(seed));
      const slots = enc.enemies.map((e) => e.slot).sort((a, b) => a - b);
      expect(slots).toEqual([1, 2, 3, 4]);
    }
  });

  it('every encounter has at least one front-liner', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const enc = composeEliteEncounter(CRYPT_POOL, FLAT_SCALE, createRng(seed));
      const hasFront = enc.enemies.some((p) => isFrontLiner(p.enemyId));
      expect(hasFront, `seed ${seed} produced all-back-liner elite`).toBe(true);
    }
  });

  it('every enemy is from the supplied pool', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const enc = composeEliteEncounter(CRYPT_POOL, FLAT_SCALE, createRng(seed));
      for (const placement of enc.enemies) {
        expect(CRYPT_POOL).toContain(placement.enemyId);
      }
    }
  });

  it('multiplies the supplied scale by the elite multipliers', () => {
    for (const floorNumber of [1, 5, 10]) {
      const baseScale = floorScale(floorNumber);
      const enc = composeEliteEncounter(CRYPT_POOL, baseScale, createRng(1));
      expect(enc.scale.hp).toBeCloseTo(baseScale.hp * ELITE_HP_MULT, 10);
      expect(enc.scale.attack).toBeCloseTo(baseScale.attack * ELITE_ATTACK_MULT, 10);
    }
  });

  it('elite multipliers are exactly 1.5 hp / 1.25 attack', () => {
    expect(ELITE_HP_MULT).toBe(1.5);
    expect(ELITE_ATTACK_MULT).toBe(1.25);
  });
});
```

- [ ] **Step 1.2: Run the test and verify it fails**

Run: `npx vitest run src/dungeon/__tests__/elite.test.ts`

Expected: FAIL — `Cannot find module '../elite'`.

- [ ] **Step 1.3: Promote `assignSlots` to an exported helper**

Open `src/dungeon/encounter.ts`. The current file has a private `assignSlots` function used by both `composeCombatEncounter` and `composeBossEncounter`. Add the `export` keyword to its declaration:

```typescript
export function assignSlots(enemies: readonly EnemyId[]): EnemyPlacement[] {
  // existing body unchanged
}
```

(Just add `export` — body is unchanged. Same with the helper `isFrontLiner` if you want to share it, but it's tiny enough that `elite.ts` can re-define it locally; keep `isFrontLiner` private to `encounter.ts` for now.)

- [ ] **Step 1.4: Create the elite module**

Create `src/dungeon/elite.ts` with this exact content:

```typescript
import { ENEMIES } from '../data/enemies';
import type { EnemyId } from '../data/types';
import type { Rng } from '../util/rng';
import { assignSlots } from './encounter';
import type { Encounter, ScaleFactors } from './node';

export const ELITE_HP_MULT = 1.5;
export const ELITE_ATTACK_MULT = 1.25;
const ELITE_SIZE = 4;

function isFrontLiner(enemyId: EnemyId): boolean {
  const preferred = ENEMIES[enemyId].preferredSlots;
  return preferred.some((s) => s === 1 || s === 2);
}

export function composeEliteEncounter(
  pool: readonly EnemyId[],
  scale: ScaleFactors,
  rng: Rng,
): Encounter {
  const picks: EnemyId[] = [];
  for (let i = 0; i < ELITE_SIZE; i++) {
    picks.push(rng.pick(pool));
  }

  if (!picks.some(isFrontLiner)) {
    const frontPool = pool.filter(isFrontLiner);
    picks[0] = rng.pick(frontPool);
  }

  return {
    enemies: assignSlots(picks),
    scale: {
      hp: scale.hp * ELITE_HP_MULT,
      attack: scale.attack * ELITE_ATTACK_MULT,
    },
  };
}
```

- [ ] **Step 1.5: Run the test and verify it passes**

Run: `npx vitest run src/dungeon/__tests__/elite.test.ts`

Expected: PASS — all 7 cases green.

- [ ] **Step 1.6: Run the full suite to confirm no regressions**

Run: `npm test`

Expected: PASS — all existing tests green; total = previous total + 7.

Also run `npx tsc --noEmit` and confirm no type errors.

- [ ] **Step 1.7: Commit**

```bash
git add src/dungeon/elite.ts src/dungeon/encounter.ts src/dungeon/__tests__/elite.test.ts
git commit -m "feat(dungeon): composeEliteEncounter generator (4 enemies, +50% HP, +25% attack)"
```

---

## Task 2: `rollLoot` API migration to `kind: CombatKind`

Replace the `isBoss: boolean` parameter with a discriminated `kind` enum and add the `'elite'` branch (forced Rare). Update both call sites (`run_state.ts` and the existing test file). Add new tests for the elite branch. After this task, `rollLoot` is ready to be called with `'elite'` but no caller does so yet.

**Files:**
- Modify: `src/dungeon/loot.ts`
- Modify: `src/dungeon/__tests__/loot.test.ts`
- Modify: `src/run/run_state.ts:175` (call site update)

- [ ] **Step 2.1: Write failing tests for the elite kind**

Open `src/dungeon/__tests__/loot.test.ts` and add these new `describe` blocks at the bottom of the file (before the closing newline):

```typescript
describe('rollLoot — elite kind', () => {
  it('always returns an item (no null) across many seeds', () => {
    for (let seed = 1; seed <= 500; seed++) {
      expect(rollLoot(createRng(seed), 1, 'elite')).not.toBeNull();
    }
  });

  it('item rarity is always rare across many seeds and floors', () => {
    for (const floor of [1, 5, 10, 15]) {
      for (let seed = 1; seed <= 200; seed++) {
        const item = rollLoot(createRng(seed), floor, 'elite');
        expect(item).not.toBeNull();
        expect(item!.rarity).toBe('rare');
      }
    }
  });

  it('rare non-hat items have 2 affixes; rare hats have 3', () => {
    let nonHat = 0;
    let hat = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const item = rollLoot(createRng(seed), 5, 'elite');
      expect(item).not.toBeNull();
      if (item!.slot === 'hat') {
        expect(item!.affixes).toHaveLength(3);
        hat += 1;
      } else {
        expect(item!.affixes).toHaveLength(2);
        nonHat += 1;
      }
    }
    expect(nonHat).toBeGreaterThan(0);
    expect(hat).toBeGreaterThan(0);
  });

  it('floorRolledAt equals the floor passed in', () => {
    for (const floor of [1, 7, 12]) {
      const item = rollLoot(createRng(1), floor, 'elite');
      expect(item!.floorRolledAt).toBe(floor);
    }
  });

  it('non-hat rare items always have a rareProperty', () => {
    let seen = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const item = rollLoot(createRng(seed), 5, 'elite');
      if (item!.slot !== 'hat') {
        expect(item!.rareProperty).toBeDefined();
        seen += 1;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('determinism: same seed + floor + kind → identical item', () => {
    const a = rollLoot(createRng(123), 7, 'elite');
    const b = rollLoot(createRng(123), 7, 'elite');
    expect(a).toEqual(b);
  });

  it('exports CombatKind type accepting combat | elite | boss', () => {
    // Type-level smoke test — these calls must compile.
    const r1 = rollLoot(createRng(1), 1, 'combat');
    const r2 = rollLoot(createRng(1), 1, 'elite');
    const r3 = rollLoot(createRng(1), 1, 'boss');
    expect([r1, r2, r3].every((r) => r === null || typeof r === 'object')).toBe(true);
  });
});
```

- [ ] **Step 2.2: Migrate the existing tests' call sites from boolean to enum**

The existing tests in `src/dungeon/__tests__/loot.test.ts` call `rollLoot(createRng(seed), N, true)` and `rollLoot(createRng(seed), N, false)`. Migrate every call:

- `rollLoot(rng, floor, true)` → `rollLoot(rng, floor, 'boss')`
- `rollLoot(rng, floor, false)` → `rollLoot(rng, floor, 'combat')`

Specific lines to update (from current file at HEAD):

| Line | Old | New |
|---|---|---|
| 9 | `rollLoot(createRng(seed), 1, false)` | `rollLoot(createRng(seed), 1, 'combat')` |
| 17 | `rollLoot(createRng(seed), 1, true)` | `rollLoot(createRng(seed), 1, 'boss')` |
| 26 | `rollLoot(createRng(seed), 1, true)` | `rollLoot(createRng(seed), 1, 'boss')` |
| 40 | `rollLoot(createRng(seed), 1, false)` | `rollLoot(createRng(seed), 1, 'combat')` |
| 50 | `rollLoot(createRng(seed), 15, true)` | `rollLoot(createRng(seed), 15, 'boss')` |
| 63 | `rollLoot(createRng(seed), 1, true)` | `rollLoot(createRng(seed), 1, 'boss')` |
| 73 | `rollLoot(createRng(seed), 5, true)` | `rollLoot(createRng(seed), 5, 'boss')` |
| 86 | `rollLoot(createRng(seed), 15, true)` | `rollLoot(createRng(seed), 15, 'boss')` |
| 105 | `rollLoot(createRng(seed), 15, true)` | `rollLoot(createRng(seed), 15, 'boss')` |
| 119 | `rollLoot(createRng(seed), 1, true)` | `rollLoot(createRng(seed), 1, 'boss')` |
| 127 | `rollLoot(createRng(seed), 10, true)` | `rollLoot(createRng(seed), 10, 'boss')` |
| 144 | `rollLoot(createRng(seed), 5, true)` | `rollLoot(createRng(seed), 5, 'boss')` |
| 154 | `rollLoot(createRng(seed), 15, true)` | `rollLoot(createRng(seed), 15, 'boss')` |
| 166 | `rollLoot(createRng(seed), 15, true)` | `rollLoot(createRng(seed), 15, 'boss')` |
| 178–179 | `rollLoot(createRng(123), 7, true)` | `rollLoot(createRng(123), 7, 'boss')` |

Use `Edit` with `replace_all: true` on `, true)` → `, 'boss')` once and `, false)` → `, 'combat')` once on this single file. Verify by re-reading after the edits.

Also: line 177's docstring `'same seed + floor + isBoss → identical item including id'` — update to `'same seed + floor + kind → identical item including id'`.

- [ ] **Step 2.3: Run the loot tests and verify they fail**

Run: `npx vitest run src/dungeon/__tests__/loot.test.ts`

Expected: FAIL — type error or runtime error because `rollLoot` still has the boolean signature. The old `, 'boss')` calls won't typecheck. The new `'elite'` branch doesn't exist.

- [ ] **Step 2.4: Update `rollLoot` signature and add the elite branch**

Open `src/dungeon/loot.ts`. Find `rollLoot` at line 158. Replace its signature and body:

```typescript
export type CombatKind = 'combat' | 'elite' | 'boss';

export function rollLoot(rng: Rng, floorNumber: number, kind: CombatKind): Item | null {
  if (kind === 'combat') {
    if (rng.next() >= 0.5) return null;
  }

  // Boss loot uses next-floor rarity weights but same-floor scaling for affix
  // values + rare-property values + the floorRolledAt stamp. Elite loot uses
  // current-floor scaling everywhere and forces rarity = rare. Combat loot
  // (when it drops) uses current-floor scaling and the per-floor rarity table.
  const effectiveFloor = kind === 'boss' ? floorNumber + 1 : floorNumber;

  const slot = rng.pick(ALL_SLOTS);
  const base = pickBaseId(rng, slot);
  const rarity: Rarity = kind === 'elite' ? 'rare' : pickRarity(rng, effectiveFloor);

  const affixIds = pickAffixes(rng, affixCount(rarity, slot));
  const affixes: RolledAffix[] = affixIds.map((id) => ({
    affixId: id,
    value: rollAffixValue(id, floorNumber),
  }));

  const rareProperty = rarity === 'rare' ? pickRareProperty(rng, slot, floorNumber) : undefined;

  const id = generateItemId(rng);
  const item: Item = {
    id,
    baseId: base.baseId,
    slot,
    rarity,
    ...(base.weaponType !== undefined ? { weaponType: base.weaponType } : {}),
    affixes,
    ...(rareProperty !== undefined ? { rareProperty } : {}),
    floorRolledAt: floorNumber,
  };
  return item;
}
```

Notes:

- The combat-drop gate stays at `kind === 'combat'`. Boss and elite always drop.
- `effectiveFloor = floor + 1` only for boss (next-floor rarity weights). Elite skips the rarity-roll entirely (`'rare'` is hard-coded). Combat uses current floor.
- The elite branch's rarity assignment is `'rare'` with no `pickRarity` call, so it consumes one fewer RNG draw than the boss branch. The other RNG draws (`pickAffixes`, `pickRareProperty`, `generateItemId`) are identical.
- `Rarity` is already imported at the top of the file. If the linter complains about an unused-import, leave the import — it's used in the type annotation.

- [ ] **Step 2.5: Update the `run_state.ts` call site**

Open `src/run/run_state.ts`. Find line 175:

```typescript
const drop = rollLoot(rng, runState.currentFloorNumber, isBoss);
```

Replace with:

```typescript
const drop = rollLoot(rng, runState.currentFloorNumber, isBoss ? 'boss' : 'combat');
```

(Task 4 will replace this line again with a `kind`-derived call. For now this preserves existing behavior under the new API.)

- [ ] **Step 2.6: Run the full suite**

Run: `npm test`

Expected: PASS — all 1135+ existing tests green, plus 7 new elite-kind tests = total +7 from baseline.

Run `npx tsc --noEmit` — green.

- [ ] **Step 2.7: Commit**

```bash
git add src/dungeon/loot.ts src/dungeon/__tests__/loot.test.ts src/run/run_state.ts
git commit -m "feat(dungeon): rollLoot kind enum + elite branch (forced Rare)"
```

---

## Task 3: `Node` union extension + scene shims

Add the `'elite'` variant to the `Node` discriminated union and update the two scene call sites that pattern-match on `node.type`. After this task, the type system is ready for elite nodes; no production code path produces them yet.

**Files:**
- Modify: `src/dungeon/node.ts`
- Modify: `src/scenes/dungeon_scene.ts:156`
- Modify: `src/scenes/combat_scene.ts` (verify only — likely no change)

- [ ] **Step 3.1: Confirm baseline is green**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green.

- [ ] **Step 3.2: Extend the `Node` union**

Open `src/dungeon/node.ts`. The current union is:

```typescript
export type Node =
  | { id: string; type: 'combat'; encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'boss'; encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'shop'; inventory: readonly ShopItem[]; nextNodeIds: readonly string[] };
```

Replace with:

```typescript
export type Node =
  | { id: string; type: 'combat'; encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'elite';  encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'boss';   encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'shop';   inventory: readonly ShopItem[]; nextNodeIds: readonly string[] };
```

- [ ] **Step 3.3: Run tsc to find consumers that need updating**

Run: `npx tsc --noEmit`

Expected output: errors at the call sites that pattern-match on `node.type` and don't handle `'elite'`. The most likely error is in `src/scenes/dungeon_scene.ts` around line 156 (the icon glyph mapping is exhaustive only for the three existing types — the ternary chain returns `'⚔'` as a default which already covers `'elite'`; verify no error there). If `tsc` reports no errors, that means the existing pattern-matches are non-exhaustive and elite falls into a default branch — which is what we want for now.

If `tsc` reports any errors, address them before continuing. The expected outcome here is **no errors** because:

- `combat_scene.ts:59` does `if (node.type === 'shop') return;` then accesses `node.encounter`. After the narrowing, type is `combat | elite | boss`; all three have `encounter`. Compiles.
- `dungeon_scene.ts:156` is `node.type === 'boss' ? '☠' : node.type === 'shop' ? '🛒' : '⚔'`. The default `'⚔'` covers both `'combat'` and `'elite'`. Compiles. Cluster B · 10 will replace the default with a distinct elite glyph.
- `dungeon_scene.ts:238` is `if (node.type === 'shop')` — falls through to `startCombatAtCurrentNode()` for combat | elite | boss. Elite goes through the combat path correctly.
- `dungeon_scene.ts:585` is `isBoss = node.type === 'boss'`. Stays valid.
- `floor.test.ts:84` is `if (node.type === 'shop') continue;` followed by `node.encounter.scale` access. After narrowing, type is `combat | elite | boss`; all three have `encounter`. Compiles.
- `run_state.test.ts:55-56` is `if (node.type === 'boss') return rs;` then `if (node.type === 'shop') {...}`. Falls through to `completeCombat` for combat | elite. The test helper `advanceToBossNode` will be updated in Task 4 to handle elite explicitly.

If `tsc` is green, proceed. (If it isn't, fix the errors before moving on — file an additional step inline with the actual errors observed.)

- [ ] **Step 3.4: Add an explicit elite glyph mapping in `dungeon_scene.ts`**

Even though the existing default covers elite, make the mapping explicit so Cluster B · 10 has a single line to change. Open `src/scenes/dungeon_scene.ts`. Find line 156:

```typescript
const glyph = node.type === 'boss' ? '☠' : node.type === 'shop' ? '🛒' : '⚔';
```

Replace with:

```typescript
const glyph =
  node.type === 'boss' ? '☠' :
  node.type === 'shop' ? '🛒' :
  node.type === 'elite' ? '⚔' :  // placeholder — Cluster B · 10 will distinguish from combat
  '⚔';
```

(Both elite and combat use `'⚔'` for now. Cluster B · 10 swaps the elite line to a distinct glyph.)

- [ ] **Step 3.5: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. No test count change.

- [ ] **Step 3.6: Commit**

```bash
git add src/dungeon/node.ts src/scenes/dungeon_scene.ts
git commit -m "feat(dungeon): add 'elite' variant to Node union"
```

---

## Task 4: `completeCombat` elite reward path

Make `completeCombat` derive a `CombatKind` from `node.type` and apply the right gold/XP/loot rule per kind. New constant `ELITE_NODE_GOLD = 30`; new helper `xpForEliteNode(floor) = 10 * floor`. Update the test helper `advanceToBossNode` to walk through elite nodes the way it walks through combat. Add new tests proving elite reward correctness.

**Files:**
- Modify: `src/data/leveling.ts` (new `xpForEliteNode` helper)
- Modify: `src/run/run_state.ts` (constant, kind derivation, reward branching, call-site update)
- Modify: `src/run/__tests__/run_state.test.ts` (new elite tests + update `advanceToBossNode`)

- [ ] **Step 4.1: Add `xpForEliteNode` to leveling.ts**

Open `src/data/leveling.ts`. Add the helper between `xpForCombatNode` (line 16) and `xpForBossNode` (line 20):

```typescript
export function xpForCombatNode(floor: number): number {
  return 5 * floor;
}

export function xpForEliteNode(floor: number): number {
  return 10 * floor;
}

export function xpForBossNode(floor: number): number {
  return 30 * floor;
}
```

(Two-line addition between the existing helpers.)

- [ ] **Step 4.2: Write failing tests for elite reward path**

Open `src/run/__tests__/run_state.test.ts`. At the top of the file, add these imports to the existing import block (do NOT inline them mid-file — TS requires top-of-file imports):

```typescript
import { xpForEliteNode } from '../../data/leveling';
import type { Encounter, Node } from '../../dungeon/node';
```

Then, near the end of the file (after the last `describe`), add this new helper + describe block:

```typescript
function makeEliteRun(seed = 1): ReturnType<typeof startRun> {
  // Hand-build a RunState whose currentNode is an elite node so we can test
  // completeCombat's elite branch in isolation, independent of floor-gen
  // changes (those land in Task 5).
  const rs = startRun('crypt', makeParty(), seed, createRng(seed));
  const eliteEncounter: Encounter = {
    enemies: [{ enemyId: 'skeleton_warrior', slot: 1 }],
    scale: { hp: 1, attack: 1 },
  };
  const eliteId = 'crypt-f1-elite-test';
  const bossId = rs.currentFloorNodes.find((n) => n.type === 'boss')!.id;
  const eliteNode: Node = {
    id: eliteId,
    type: 'elite',
    encounter: eliteEncounter,
    nextNodeIds: [bossId],
  };
  return {
    ...rs,
    currentFloorNodes: [...rs.currentFloorNodes, eliteNode],
    currentNodeId: eliteId,
  };
}

describe('completeCombat — elite node', () => {
  it('grants 30 × floor gold to the pack', () => {
    const rs = makeEliteRun();
    const result = completeCombat(
      rs,
      mockCombatResult(rs.party, [20, 14, 15], 'player_victory'),
      createRng(99),
    );
    expect(result.runState.pack.gold).toBe(30 * rs.currentFloorNumber);
  });

  it('grants xpForEliteNode XP to surviving heroes', () => {
    const rs = makeEliteRun();
    const expectedXp = xpForEliteNode(rs.currentFloorNumber);
    const result = completeCombat(
      rs,
      mockCombatResult(rs.party, [20, 14, 15], 'player_victory'),
      createRng(99),
    );
    for (const hero of result.runState.party) {
      expect(hero.xp).toBe(expectedXp);
    }
  });

  it('always adds a Rare item to the pack', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rs = makeEliteRun(seed);
      const result = completeCombat(
        rs,
        mockCombatResult(rs.party, [20, 14, 15], 'player_victory'),
        createRng(seed),
      );
      expect(result.runState.pack.items).toHaveLength(1);
      expect(result.runState.pack.items[0].rarity).toBe('rare');
    }
  });

  it('advances to the next node (in_dungeon, not camp_screen)', () => {
    const rs = makeEliteRun();
    const result = completeCombat(
      rs,
      mockCombatResult(rs.party, [20, 14, 15], 'player_victory'),
      createRng(99),
    );
    expect(result.runState.status).toBe('in_dungeon');
  });
});
```

Notes:

- `makeEliteRun` cheats by appending an extra elite node to the existing diamond and pointing `currentNodeId` at it. It's a unit-test scaffold: you can't reach this state from real gameplay (yet), but `completeCombat` just looks at `currentNode(rs)` to derive `kind`, so the synthetic state exercises the new code path cleanly.
- The "always adds a Rare item" test uses `currentRng = createRng(seed)` for both the run state and the loot — irrelevant since loot pulls a fresh sequence from the supplied rng.

- [ ] **Step 4.3: Run the new tests and verify they fail**

Run: `npx vitest run src/run/__tests__/run_state.test.ts -t 'completeCombat — elite node'`

Expected: FAIL —
- "grants 30 × floor gold" fails (current code grants 15 × floor for combat).
- "grants xpForEliteNode XP" fails (current code grants xpForCombatNode XP for combat).
- "always adds a Rare item" fails (current code uses `'combat'` kind → 50% drop gate, no forced rarity).
- "advances to in_dungeon" should already pass but verify.

- [ ] **Step 4.4: Update `completeCombat` to switch on `kind`**

Open `src/run/run_state.ts`. Around line 40, the constants block currently reads:

```typescript
const COMBAT_NODE_GOLD = 15;
const BOSS_NODE_GOLD = 100;
```

Add `ELITE_NODE_GOLD`:

```typescript
const COMBAT_NODE_GOLD = 15;
const ELITE_NODE_GOLD = 30;
const BOSS_NODE_GOLD = 100;
```

Update the imports at the top of `run_state.ts`. Currently:

```typescript
import { applyLevelUps, levelForXp, xpForBossNode, xpForCombatNode } from '../data/leveling';
```

Add `xpForEliteNode`:

```typescript
import { applyLevelUps, levelForXp, xpForBossNode, xpForCombatNode, xpForEliteNode } from '../data/leveling';
```

Also import `CombatKind`:

```typescript
import { rollLoot, type CombatKind } from '../dungeon/loot';
```

Now find the `isBoss` derivation around line 157:

```typescript
const completedNode = currentNode(runState);
const isBoss = completedNode.type === 'boss';
const fanout = completedNode.nextNodeIds;
```

Replace with a `kind` derivation:

```typescript
const completedNode = currentNode(runState);
if (completedNode.type === 'shop') {
  throw new Error(`completeCombat: current node is type 'shop', not a combat-bearing node`);
}
const kind: CombatKind = completedNode.type; // 'combat' | 'elite' | 'boss'
const isBoss = kind === 'boss';
const fanout = completedNode.nextNodeIds;
```

(The shop guard is defensive — `completeCombat` should only ever be called on combat-bearing nodes. Existing `currentNode` already throws if status is wrong, but it can return a `'shop'`-typed node. The throw makes the invariant explicit.)

Update the XP block (currently lines 161–163):

```typescript
const xpReward = isBoss
  ? xpForBossNode(runState.currentFloorNumber)
  : xpForCombatNode(runState.currentFloorNumber);
```

Replace with:

```typescript
const xpReward =
  kind === 'boss'  ? xpForBossNode(runState.currentFloorNumber) :
  kind === 'elite' ? xpForEliteNode(runState.currentFloorNumber) :
                     xpForCombatNode(runState.currentFloorNumber);
```

Update the gold-reward block (currently lines 170–172):

```typescript
const reward = isBoss
  ? BOSS_NODE_GOLD * runState.currentFloorNumber
  : COMBAT_NODE_GOLD * runState.currentFloorNumber;
```

Replace with:

```typescript
const reward =
  kind === 'boss'  ? BOSS_NODE_GOLD  * runState.currentFloorNumber :
  kind === 'elite' ? ELITE_NODE_GOLD * runState.currentFloorNumber :
                     COMBAT_NODE_GOLD * runState.currentFloorNumber;
```

Update the loot-roll line (currently line 175 — already updated in Task 2 to `isBoss ? 'boss' : 'combat'`):

```typescript
const drop = rollLoot(rng, runState.currentFloorNumber, isBoss ? 'boss' : 'combat');
```

Replace with:

```typescript
const drop = rollLoot(rng, runState.currentFloorNumber, kind);
```

(`kind` is already typed as `CombatKind` so this satisfies the new signature.)

The `isBoss` local stays defined and is still used by the camp-screen branch around line 190 (`if (isBoss) { return ... 'camp_screen' }`). Don't remove it.

- [ ] **Step 4.5: Update `advanceToBossNode` test helper to walk elite nodes**

Open `src/run/__tests__/run_state.test.ts`. Find `advanceToBossNode` (around line 51). The current loop:

```typescript
while (true) {
  const node = currentNode(rs);
  if (node.type === 'boss') return rs;
  if (node.type === 'shop') {
    rs = leaveShop(rs);
    continue;
  }
  rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
  if (rs.awaitingFork) {
    const choices = nextNodeChoices(rs);
    const combatBranch = choices.find((n) => n.type === 'combat') ?? choices[0];
    rs = chooseNextNode(rs, combatBranch.id);
  }
}
```

Update the fork-pick line so that combat-bearing branches (combat OR elite) are preferred over shops, but with a fallback so `'elite_vs_shop'` floors still progress:

```typescript
while (true) {
  const node = currentNode(rs);
  if (node.type === 'boss') return rs;
  if (node.type === 'shop') {
    rs = leaveShop(rs);
    continue;
  }
  // node.type is 'combat' or 'elite' — both go through completeCombat
  rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
  if (rs.awaitingFork) {
    const choices = nextNodeChoices(rs);
    const combatBranch =
      choices.find((n) => n.type === 'combat') ??
      choices.find((n) => n.type === 'elite') ??
      choices[0];
    rs = chooseNextNode(rs, combatBranch.id);
  }
}
```

(After Task 5, some seeds will produce `'elite_vs_shop'` floors where `advanceToBossNode` falls through both findings to `choices[0]` — which will be elite or shop. If shop, the next loop iteration calls `leaveShop`. If elite, it gets `completeCombat`'d. Both work.)

- [ ] **Step 4.6: Run the run_state tests**

Run: `npx vitest run src/run/__tests__/run_state.test.ts`

Expected: PASS — all existing run_state tests + 4 new elite tests green.

- [ ] **Step 4.7: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total test count = baseline + 7 (Task 1) + 7 (Task 2) + 4 (Task 4) = baseline + 18.

- [ ] **Step 4.8: Commit**

```bash
git add src/data/leveling.ts src/run/run_state.ts src/run/__tests__/run_state.test.ts
git commit -m "feat(run): completeCombat elite path (2× combat gold/XP, forced Rare drop)"
```

---

## Task 5: Floor generator 3-shape fork RNG

Replace the boolean `shopOnBranchA` with a triangular RNG that picks one of `'shop_vs_combat'`, `'elite_vs_combat'`, `'elite_vs_shop'` per floor (uniform 1/3 each), then a separate `specialOnBranchA` boolean. Update `floor.ts` and `floor.test.ts` together. After this task, elite nodes appear in the wild and Tasks 2–4 are exercised end-to-end.

**Files:**
- Modify: `src/dungeon/floor.ts`
- Modify: `src/dungeon/__tests__/floor.test.ts`

- [ ] **Step 5.1: Replace existing fork-shape tests with shape-agnostic + per-shape tests**

Open `src/dungeon/__tests__/floor.test.ts`. Several existing tests assert behavior specific to the old `shop_vs_combat`-only world. Update them now (TDD-style: red, then update floor.ts, then green).

**Test 5.1.a — "floor 1 has 5 nodes: 3 combat + 1 shop + 1 boss (diamond)" at lines 21–30**

Old assertion is shape-specific. Replace with shape-agnostic:

```typescript
it('floor 1 has 5 nodes: 2 preamble combat + 2 fork branches + 1 boss', () => {
  const { nodes } = generateFloor('crypt', 1, createRng(1));
  expect(nodes).toHaveLength(5);
  const bossCount = nodes.filter((n) => n.type === 'boss').length;
  expect(bossCount).toBe(1);
  // The other 4 nodes are 2 preamble combats + 2 fork branches whose types
  // depend on the rolled fork shape. Per-shape coverage in the dedicated
  // tests below.
});
```

**Test 5.1.b — "fork structure: one branch is combat, one is shop" at lines 42–55**

This locks in the old `shop_vs_combat`-only shape. Replace with:

```typescript
it('fork has exactly 2 branches, both pointing at the unique boss', () => {
  const { nodes } = generateFloor('crypt', 1, createRng(1));
  const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
  expect(fork.nextNodeIds).toHaveLength(2);
  const branches = fork.nextNodeIds.map((id) => nodes.find((n) => n.id === id)!);
  for (const b of branches) {
    expect(b.nextNodeIds).toHaveLength(1);
    const target = nodes.find((n) => n.id === b.nextNodeIds[0])!;
    expect(target.type).toBe('boss');
  }
});

it('fork branches are exactly the pair from one fork shape', () => {
  // Across many seeds, the fork-branch type pair is one of three shapes.
  const seenShapes = new Set<string>();
  for (let seed = 1; seed <= 200; seed++) {
    const { nodes } = generateFloor('crypt', 1, createRng(seed));
    const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
    const branchTypes = fork.nextNodeIds
      .map((id) => nodes.find((n) => n.id === id)!.type)
      .sort()
      .join('+');
    seenShapes.add(branchTypes);
  }
  expect(seenShapes).toEqual(new Set(['combat+shop', 'combat+elite', 'elite+shop']));
});
```

**Test 5.1.c — "propagates per-floor scale to every encounter" at lines 79–88**

Currently the test skips `'shop'` and asserts `node.encounter.scale === floorScale(floorNumber)` for the rest. With elite nodes, the elite's scale is `floorScale × ELITE_*_MULT`. Update to skip elite as well, since the elite encounter has its own multipliers:

```typescript
it('propagates per-floor scale to every non-elite encounter', () => {
  for (const floorNumber of [1, 2, 5, 10]) {
    const expected = floorScale(floorNumber);
    const { nodes } = generateFloor('crypt', floorNumber, createRng(1));
    for (const node of nodes) {
      if (node.type === 'shop') continue;
      if (node.type === 'elite') continue; // elite scale = floorScale × elite multipliers; covered separately
      expect(node.encounter.scale).toEqual(expected);
    }
  }
});

it('elite encounters apply ELITE_HP_MULT and ELITE_ATTACK_MULT on top of floorScale', () => {
  // Find a seed that produces an elite-bearing floor.
  for (let seed = 1; seed <= 50; seed++) {
    for (const floorNumber of [1, 5]) {
      const baseScale = floorScale(floorNumber);
      const { nodes } = generateFloor('crypt', floorNumber, createRng(seed));
      const elite = nodes.find((n) => n.type === 'elite');
      if (!elite) continue;
      expect(elite.encounter.scale.hp).toBeCloseTo(baseScale.hp * 1.5, 10);
      expect(elite.encounter.scale.attack).toBeCloseTo(baseScale.attack * 1.25, 10);
      return; // one elite-bearing sample is enough
    }
  }
  throw new Error('no elite-bearing floor found in the sample range');
});
```

**Test 5.1.d — "every combat encounter uses pool enemies only" at lines 90–98**

Currently filters `nodes.filter((n) => n.type === 'combat')`. Update to also include elite:

```typescript
it('every combat-bearing encounter uses pool enemies only', () => {
  const { nodes } = generateFloor('crypt', 1, createRng(1));
  const combatBearing = nodes.filter((n) => n.type === 'combat' || n.type === 'elite');
  for (const node of combatBearing) {
    if (node.type === 'shop' || node.type === 'boss') continue;
    for (const placement of node.encounter.enemies) {
      expect(CRYPT_POOL).toContain(placement.enemyId);
    }
  }
});
```

(The redundant `'shop' || 'boss'` filter is for type-narrowing only — the `combatBearing` filter already excludes them.)

**Test 5.1.e — "shop branch placement is deterministic per seed" at lines 118–124**

Currently asserts the shop's id is the same across two `generateFloor(... createRng(7))` calls. Some seeds now produce `'elite_vs_combat'` floors with no shop, so this test must be guarded. Replace with:

```typescript
it('floor generation is deterministic per seed (full nodes equality)', () => {
  for (const seed of [1, 7, 42]) {
    const a = generateFloor('crypt', 1, createRng(seed));
    const b = generateFloor('crypt', 1, createRng(seed));
    expect(a).toEqual(b);
  }
});
```

(Stronger: tests determinism of the entire output, not just shop placement.)

**Test 5.1.f — "shop has 4 inventory items" at lines 126–131**

This is fine as-is *if* the seed-1 floor still has a shop. After the RNG change, seed 1 may roll a shop-less shape. Find a seed that produces a shop and use it. Replace:

```typescript
it('shop (when present on a floor) has 4 inventory items', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const { nodes } = generateFloor('crypt', 1, createRng(seed));
    const shop = nodes.find((n) => n.type === 'shop');
    if (!shop) continue;
    if (shop.type !== 'shop') throw new Error('expected shop');
    expect(shop.inventory).toHaveLength(4);
    return;
  }
  throw new Error('no shop-bearing floor found in the sample range');
});
```

**Test 5.1.g — Add per-shape coverage**

Add three new tests that find seeds for each fork shape and verify their structure:

```typescript
function findFloorWithShape(
  shape: 'shop_vs_combat' | 'elite_vs_combat' | 'elite_vs_shop',
  maxSeeds = 200,
): { nodes: ReturnType<typeof generateFloor>['nodes']; fork: { type: string }[] } {
  for (let seed = 1; seed <= maxSeeds; seed++) {
    const { nodes } = generateFloor('crypt', 1, createRng(seed));
    const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
    const branches = fork.nextNodeIds
      .map((id) => nodes.find((n) => n.id === id)!)
      .map((n) => ({ type: n.type }));
    const types = branches.map((b) => b.type).sort();
    const matches =
      (shape === 'shop_vs_combat'  && types[0] === 'combat' && types[1] === 'shop') ||
      (shape === 'elite_vs_combat' && types[0] === 'combat' && types[1] === 'elite') ||
      (shape === 'elite_vs_shop'   && types[0] === 'elite'  && types[1] === 'shop');
    if (matches) return { nodes, fork: branches };
  }
  throw new Error(`no '${shape}' floor in first ${maxSeeds} seeds`);
}

it('shop_vs_combat shape: fork branches are exactly one combat and one shop', () => {
  const { fork } = findFloorWithShape('shop_vs_combat');
  expect(fork.map((b) => b.type).sort()).toEqual(['combat', 'shop']);
});

it('elite_vs_combat shape: fork branches are exactly one combat and one elite', () => {
  const { fork } = findFloorWithShape('elite_vs_combat');
  expect(fork.map((b) => b.type).sort()).toEqual(['combat', 'elite']);
});

it('elite_vs_shop shape: fork branches are exactly one elite and one shop (no combat)', () => {
  const { fork } = findFloorWithShape('elite_vs_shop');
  expect(fork.map((b) => b.type).sort()).toEqual(['elite', 'shop']);
  for (const b of fork) {
    expect(b.type).not.toBe('combat');
  }
});

it('three fork shapes are roughly evenly distributed across seeds', () => {
  const counts = { shop_vs_combat: 0, elite_vs_combat: 0, elite_vs_shop: 0 };
  for (let seed = 1; seed <= 300; seed++) {
    const { nodes } = generateFloor('crypt', 1, createRng(seed));
    const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
    const types = fork.nextNodeIds
      .map((id) => nodes.find((n) => n.id === id)!.type)
      .sort()
      .join('+');
    if (types === 'combat+shop')  counts.shop_vs_combat += 1;
    else if (types === 'combat+elite') counts.elite_vs_combat += 1;
    else if (types === 'elite+shop')   counts.elite_vs_shop += 1;
  }
  // Expected ~100 each (1/3 of 300). Loose lower bound: at least 60.
  expect(counts.shop_vs_combat).toBeGreaterThanOrEqual(60);
  expect(counts.elite_vs_combat).toBeGreaterThanOrEqual(60);
  expect(counts.elite_vs_shop).toBeGreaterThanOrEqual(60);
});
```

- [ ] **Step 5.2: Run the floor tests and verify they fail**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts`

Expected: FAIL — the new shape tests fail because `floor.ts` still produces only `'shop_vs_combat'` floors. The "three shapes are roughly evenly distributed" test sees 300/0/0 and fails on the elite-shape lower bounds.

- [ ] **Step 5.3: Update `floor.ts` to the 3-shape fork RNG**

Open `src/dungeon/floor.ts`. Replace the entire body of `generateFloor` with:

```typescript
import { DUNGEONS } from '../data/dungeons';
import type { DungeonId } from '../data/types';
import type { Rng, WeightedOption } from '../util/rng';
import { composeBossEncounter, composeCombatEncounter } from './encounter';
import { composeEliteEncounter } from './elite';
import type { Node } from './node';
import { floorScale } from './scaling';
import { generateShop } from './shop';

type ForkShape = 'shop_vs_combat' | 'elite_vs_combat' | 'elite_vs_shop';

const FORK_SHAPE_WEIGHTS: readonly WeightedOption<ForkShape>[] = [
  { value: 'shop_vs_combat',  weight: 1 },
  { value: 'elite_vs_combat', weight: 1 },
  { value: 'elite_vs_shop',   weight: 1 },
];

export function generateFloor(
  dungeonId: DungeonId,
  floorNumber: number,
  rng: Rng,
): { nodes: readonly Node[]; startNodeId: string } {
  const dungeon = DUNGEONS[dungeonId];
  const scale = floorScale(floorNumber);

  const idPrefix = `${dungeonId}-f${floorNumber}`;
  const id0 = `${idPrefix}-n0`;
  const id1 = `${idPrefix}-n1`;
  const id2a = `${idPrefix}-n2a`;
  const id2b = `${idPrefix}-n2b`;
  const idBoss = `${idPrefix}-boss`;

  // Roll fork shape and which branch (A or B) gets the more-distinguished
  // node. Drawn first so RNG consumption order downstream stays deterministic.
  const shape: ForkShape = rng.weighted(FORK_SHAPE_WEIGHTS);
  const specialOnBranchA = rng.next() < 0.5;

  const enc0 = composeCombatEncounter(dungeon.enemyPool, scale, rng);
  const enc1 = composeCombatEncounter(dungeon.enemyPool, scale, rng);

  // Conditionally compose only the encounters/inventory the rolled shape
  // requires. RNG order: combat-fork-branch encounter (if shape uses combat),
  // then elite encounter (if shape uses elite), then shop inventory (if shape
  // uses shop).
  const usesCombatBranch = shape === 'shop_vs_combat' || shape === 'elite_vs_combat';
  const usesEliteBranch  = shape === 'elite_vs_combat' || shape === 'elite_vs_shop';
  const usesShopBranch   = shape === 'shop_vs_combat'  || shape === 'elite_vs_shop';

  const combatBranchEnc = usesCombatBranch
    ? composeCombatEncounter(dungeon.enemyPool, scale, rng)
    : undefined;
  const eliteBranchEnc = usesEliteBranch
    ? composeEliteEncounter(dungeon.enemyPool, scale, rng)
    : undefined;
  const shopBranchInv = usesShopBranch ? generateShop(floorNumber, rng).inventory : undefined;

  const encBoss = composeBossEncounter(dungeon.bossId, dungeon.enemyPool, scale, rng);

  // Build the two branch nodes per shape. `specialOnBranchA` decides which
  // side gets the more-distinguished node:
  //   shop_vs_combat:   true → A is shop, B is combat
  //   elite_vs_combat:  true → A is elite, B is combat
  //   elite_vs_shop:    true → A is elite, B is shop
  const buildCombatBranch = (id: string): Node => {
    if (combatBranchEnc === undefined) {
      throw new Error(`generateFloor: combatBranchEnc undefined for shape '${shape}'`);
    }
    return { id, type: 'combat', encounter: combatBranchEnc, nextNodeIds: [idBoss] };
  };
  const buildEliteBranch = (id: string): Node => {
    if (eliteBranchEnc === undefined) {
      throw new Error(`generateFloor: eliteBranchEnc undefined for shape '${shape}'`);
    }
    return { id, type: 'elite', encounter: eliteBranchEnc, nextNodeIds: [idBoss] };
  };
  const buildShopBranch = (id: string): Node => {
    if (shopBranchInv === undefined) {
      throw new Error(`generateFloor: shopBranchInv undefined for shape '${shape}'`);
    }
    return { id, type: 'shop', inventory: shopBranchInv, nextNodeIds: [idBoss] };
  };

  let node2a: Node;
  let node2b: Node;
  switch (shape) {
    case 'shop_vs_combat':
      node2a = specialOnBranchA ? buildShopBranch(id2a) : buildCombatBranch(id2a);
      node2b = specialOnBranchA ? buildCombatBranch(id2b) : buildShopBranch(id2b);
      break;
    case 'elite_vs_combat':
      node2a = specialOnBranchA ? buildEliteBranch(id2a) : buildCombatBranch(id2a);
      node2b = specialOnBranchA ? buildCombatBranch(id2b) : buildEliteBranch(id2b);
      break;
    case 'elite_vs_shop':
      node2a = specialOnBranchA ? buildEliteBranch(id2a) : buildShopBranch(id2a);
      node2b = specialOnBranchA ? buildShopBranch(id2b) : buildEliteBranch(id2b);
      break;
  }

  const nodes: Node[] = [
    { id: id0, type: 'combat', encounter: enc0, nextNodeIds: [id1] },
    { id: id1, type: 'combat', encounter: enc1, nextNodeIds: [id2a, id2b] },
    node2a,
    node2b,
    { id: idBoss, type: 'boss', encounter: encBoss, nextNodeIds: [] },
  ];

  return { nodes, startNodeId: id0 };
}
```

Notes:

- `WeightedOption` is exported from `src/util/rng.ts` — verify the import name (search for `WeightedOption` in that file). If named differently, adjust.
- The throws inside the `build*Branch` helpers are unreachable in practice — the shape switch only calls a helper after the corresponding `usesXBranch` flag was true, which means the `XBranchEnc` was composed. They're there to satisfy `strict` TS narrowing without `!` non-null assertions.

- [ ] **Step 5.4: Run the floor tests**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts`

Expected: PASS — all updated and new tests green.

- [ ] **Step 5.5: Run the full suite end-to-end**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total test count delta from baseline:
- +7 (Task 1: elite encounter)
- +7 (Task 2: rollLoot elite branch)
- +4 (Task 4: completeCombat elite path)
- +5 net (Task 5: 5 new shape tests; some old asserts replaced with shape-agnostic equivalents — net new is positive)
- ≈ +23 total

The actual delta depends on how many existing assertions stayed vs got replaced; check the count for sanity but don't fail the task on a small delta mismatch.

- [ ] **Step 5.6: Smoke-check determinism by running tests twice**

Run: `npm test` again (back-to-back).

Expected: Identical pass count, identical seed-bound test outputs. Floor RNG is deterministic per seed; running twice should produce zero variance.

- [ ] **Step 5.7: Commit**

```bash
git add src/dungeon/floor.ts src/dungeon/__tests__/floor.test.ts
git commit -m "feat(dungeon): 3-shape fork RNG (shop_vs_combat | elite_vs_combat | elite_vs_shop)"
```

---

## Closing checklist

- [ ] **All 5 tasks landed in 5 commits**, each with green tests and green tsc.
- [ ] **No imports of `phaser`** under `src/dungeon/`, `src/data/`, `src/run/`. Verify via:
  ```bash
  grep -r "from 'phaser'" src/dungeon src/data src/run || echo "OK — no phaser imports"
  ```
  Expected output: `OK — no phaser imports`.
- [ ] **`gdd.md` is the source of truth** for design intent. The numerical knobs (`ELITE_HP_MULT`, etc.) live as named constants in code so post-shipping balance tuning is one-line edits.
- [ ] **Out-of-scope follow-ups** the spec called out:
  - Cluster B · 10 — Elite icon visual marker. Replaces the `'⚔'` placeholder line in `dungeon_scene.ts:156` with a distinct glyph.
  - Cluster A · 12 — Floor-milestone enemy modifiers. When that lands, modifiers will be applied per-floor by the floor generator and elites can stamp from the same modifier pool.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from `TODO.md` (Cluster A · 10) into `HISTORY.md` newest-first, with the slim template (Why / Decisions / Surprises / Source). The user does this themselves; you offer to draft the migration text.
- [ ] **Do not commit the spec or this plan as part of the feature commits** — those land separately. The brainstorming flow committed the spec; commit this plan now as a doc-only change before starting Task 1:
  ```bash
  git add docs/superpowers/specs/2026-04-29-elite-nodes-design.md docs/superpowers/plans/2026-04-29-elite-nodes.md
  git commit -m "docs: spec + plan for Cluster A · 10 (elite nodes)"
  ```
  ⚠️ **Per CLAUDE.md, never commit without explicit user direction.** This step waits for the user's go-ahead.
