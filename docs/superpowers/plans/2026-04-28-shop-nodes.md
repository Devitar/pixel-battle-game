# Shop Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shop nodes as the third `Node` variant. The Crypt floor's fork now offers a shop on one branch (deterministic from RNG which side) with 4 gear items at floor-scaled prices. Ships the auto-leave dungeon-scene stub; Cluster B · 3 (Shop UI) replaces it later.

**Architecture:** Four tasks. (1) Foundation — pack `spendGold`, Node `shop` variant, `rollShopItem` extraction from `loot.ts`. (2) Shop generator + floor integration — `generateShop`, the conditional shop-or-combat branch logic in `generateFloor`, with floor.test.ts adaptations. (3) RunState shop API — `purchaseItem(rs, itemId)` + `leaveShop(rs)`. (4) Dungeon scene — extract `handleArrival` (DRY-up of B · 6's onComplete callbacks), add shop auto-leave stub, add 🛒 glyph. Each task ends with vitest green and tsc clean.

**Tech Stack:** TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 4, Phaser 4. Tasks 1-3 are inside the firewall; Task 4 is Phaser scene work, untested per repo convention.

**Spec:** [`docs/superpowers/specs/2026-04-28-shop-nodes-design.md`](../specs/2026-04-28-shop-nodes-design.md)

**Project policy reminder:** Per [`CLAUDE.md`](../../../CLAUDE.md), never run `git commit` without explicit user direction. Each task ends with a "stage and report" step — the user runs the commit themselves.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/dungeon/node.ts` | **Modify** | Add `ShopItem` interface; add `'shop'` variant to `Node` union with `inventory` (no `encounter`). |
| `src/dungeon/loot.ts` | **Modify** | Extract `rollShopItem(rng, slot, floor): Item` as a named export; refactor `rollLoot` to delegate. |
| `src/dungeon/shop.ts` | **Create** | `generateShop(floorNumber, rng)` + `BASE_PRICE_BY_RARITY` + `PRICE_VARIANCE` constants. ~30 lines. |
| `src/dungeon/__tests__/shop.test.ts` | **Create** | 8 cases: count, slot order, sold-false initial, prices in band, rarity follows lerp, determinism. |
| `src/dungeon/floor.ts` | **Modify** | Roll `shopOnBranchA`; build n2a/n2b conditionally as shop or combat. |
| `src/dungeon/__tests__/floor.test.ts` | **Modify** | Replace fork-structure test (combat-vs-combat → combat-vs-shop); add shop-determinism + shop-inventory shape. |
| `src/run/pack.ts` | **Modify** | Add `spendGold(pack, amount)`. |
| `src/run/__tests__/pack.test.ts` | **Modify** | Add 3 cases: success, negative throws, overspend throws. |
| `src/run/run_state.ts` | **Modify** | Add `purchaseItem(rs, itemId)` and `leaveShop(rs)`. |
| `src/run/__tests__/run_state.test.ts` | **Modify** | Add `describe('purchaseItem', ...)` (6 cases) + `describe('leaveShop', ...)` (3 cases) + `navigateToShop` helper. |
| `src/scenes/dungeon_scene.ts` | **Modify** | Extract `handleArrival()`; add shop auto-leave stub; add 🛒 glyph in `buildNodes` + `buildForkOption`. |

No save schema changes, migration code, or hero/combat/leveling changes.

---

## Task 1: Foundation — pack, Node variant, rollShopItem extraction

**Goal:** Land the schema and helper preconditions for shops without yet building shops. Pack gets `spendGold`. Node gets the `shop` variant. Loot's item-generation gets factored into a per-slot helper.

**Files:**
- Modify: `src/run/pack.ts`
- Modify: `src/run/__tests__/pack.test.ts`
- Modify: `src/dungeon/node.ts`
- Modify: `src/dungeon/loot.ts`

- [ ] **Step 1: Write the failing tests for `spendGold`**

In `src/run/__tests__/pack.test.ts`, add `spendGold` to the existing import line:

```ts
import { addGold, addItem, createPack, emptyPack, removeItem, spendGold, totalGold } from '../pack';
```

Append a new `describe` block at the bottom:

```ts
describe('Pack — spendGold', () => {
  it('decreases gold by amount', () => {
    const pack = addGold(createPack(), 50);
    const result = spendGold(pack, 10);
    expect(result.gold).toBe(40);
  });

  it('throws on negative amount', () => {
    expect(() => spendGold(createPack(), -5)).toThrow();
  });

  it('throws when amount exceeds gold', () => {
    const pack = addGold(createPack(), 50);
    expect(() => spendGold(pack, 100)).toThrow();
  });
});
```

- [ ] **Step 2: Run pack tests to confirm they fail**

Run: `npx vitest run src/run/__tests__/pack.test.ts`

Expected: `spendGold` import fails to resolve. 3 failures.

- [ ] **Step 3: Add `spendGold` to `pack.ts`**

In `src/run/pack.ts`, append after the existing `addGold`:

```ts
export function spendGold(pack: Pack, amount: number): Pack {
  if (amount < 0) {
    throw new Error(`spendGold: amount must be non-negative, got ${amount}`);
  }
  if (amount > pack.gold) {
    throw new Error(`spendGold: amount ${amount} exceeds available gold ${pack.gold}`);
  }
  return { ...pack, gold: pack.gold - amount };
}
```

- [ ] **Step 4: Run pack tests to confirm they pass**

Run: `npx vitest run src/run/__tests__/pack.test.ts`

Expected: PASS on all spendGold cases plus existing tests.

- [ ] **Step 5: Add `ShopItem` interface and `shop` variant to `Node`**

In `src/dungeon/node.ts`, replace the `Node` type with:

```ts
import type { EnemyId, Item, SlotIndex } from '../data/types';

export interface ScaleFactors {
  hp: number;
  attack: number;
}

export interface EnemyPlacement {
  enemyId: EnemyId;
  slot: SlotIndex;
}

export interface Encounter {
  enemies: readonly EnemyPlacement[];
  scale: ScaleFactors;
}

export interface ShopItem {
  readonly item: Item;
  readonly price: number;
  readonly sold: boolean;
}

export type Node =
  | { id: string; type: 'combat'; encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'boss'; encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'shop'; inventory: readonly ShopItem[]; nextNodeIds: readonly string[] };

export type NodeType = Node['type'];
```

`Item` is now imported alongside the existing `EnemyId` / `SlotIndex` imports.

- [ ] **Step 6: Extract `rollShopItem` from `loot.ts`**

In `src/dungeon/loot.ts`, find `rollLoot` (around lines 130-160) and refactor. Replace the existing `rollLoot` body with:

```ts
export function rollShopItem(rng: Rng, slot: ItemSlot, floor: number): Item {
  const base = pickBaseId(rng, slot);
  const rarity = pickRarity(rng, floor);

  const affixIds = pickAffixes(rng, affixCount(rarity, slot));
  const affixes: RolledAffix[] = affixIds.map((id) => ({
    affixId: id,
    value: rollAffixValue(id, floor),
  }));

  const rareProperty = rarity === 'rare' ? pickRareProperty(rng, slot, floor) : undefined;

  const id = generateItemId(rng);
  return {
    id,
    baseId: base.baseId,
    slot,
    rarity,
    ...(base.weaponType !== undefined ? { weaponType: base.weaponType } : {}),
    affixes,
    ...(rareProperty !== undefined ? { rareProperty } : {}),
    floorRolledAt: floor,
  };
}

export function rollLoot(rng: Rng, floorNumber: number, isBoss: boolean): Item | null {
  if (!isBoss) {
    if (rng.next() >= 0.5) return null;
  }
  const effectiveFloor = isBoss ? floorNumber + 1 : floorNumber;
  const slot = rng.pick(ALL_SLOTS);
  return rollShopItem(rng, slot, effectiveFloor);
}
```

The RNG consumption order inside `rollShopItem` matches what `rollLoot` did before: `pickBaseId` (consumes RNG for weapon family, outfit base, hat base depending on slot) → `pickRarity` → `pickAffixes` → `pickRareProperty` (if rare) → `generateItemId`. The `rollLoot` wrapper only adds the up-front "drop or null" + slot pick + effective-floor calculation, all of which preserve the existing public API.

- [ ] **Step 7: Run the full test suite + type-check**

Run: `npm test`

Expected: All tests pass — pack tests now include spendGold; existing loot tests still pass because the RNG order through `rollShopItem` is identical to the old `rollLoot` body.

Run: `npx tsc --noEmit`

Expected: Clean. The `Node` shop variant is now in scope but no callers consume it yet.

- [ ] **Step 8: Stage and report**

```bash
git add src/run/pack.ts src/run/__tests__/pack.test.ts \
        src/dungeon/node.ts src/dungeon/loot.ts
git status
```

Tell the user: **"Task 1 ready. `spendGold` in pack; `shop` variant in `Node`; `rollShopItem` extracted from `rollLoot` (refactor preserves public API and RNG order). Suggested commit message: `feat: shop foundation (pack spendGold, Node shop variant, rollShopItem extract)`. Awaiting your direction."**

---

## Task 2: Shop generator + floor integration

**Goal:** `generateShop(floorNumber, rng)` produces a 4-item inventory. `generateFloor` rolls which fork branch is the shop and replaces that branch with a shop node. Floor tests adapt to the new combat-vs-shop fork shape.

**Files:**
- Create: `src/dungeon/shop.ts`
- Create: `src/dungeon/__tests__/shop.test.ts`
- Modify: `src/dungeon/floor.ts`
- Modify: `src/dungeon/__tests__/floor.test.ts`

- [ ] **Step 1: Write the failing tests for `generateShop`**

Create `src/dungeon/__tests__/shop.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../../util/rng';
import { generateShop } from '../shop';

describe('generateShop', () => {
  it('returns 4 items', () => {
    const { inventory } = generateShop(1, createRng(1));
    expect(inventory).toHaveLength(4);
  });

  it('items are in slot order: weapon, shield, outfit, hat', () => {
    const { inventory } = generateShop(1, createRng(1));
    expect(inventory.map((s) => s.item.slot)).toEqual(['weapon', 'shield', 'outfit', 'hat']);
  });

  it('all items start with sold: false', () => {
    const { inventory } = generateShop(1, createRng(1));
    for (const slot of inventory) expect(slot.sold).toBe(false);
  });

  it('prices are positive integers', () => {
    const { inventory } = generateShop(2, createRng(1));
    for (const slot of inventory) {
      expect(Number.isInteger(slot.price)).toBe(true);
      expect(slot.price).toBeGreaterThan(0);
    }
  });

  it('floor-1 common-rarity item: price in [25, 35]', () => {
    for (let seed = 1; seed < 50; seed++) {
      const { inventory } = generateShop(1, createRng(seed));
      for (const slot of inventory) {
        if (slot.item.rarity === 'common') {
          expect(slot.price, `seed ${seed} item ${slot.item.id}`).toBeGreaterThanOrEqual(25);
          expect(slot.price, `seed ${seed} item ${slot.item.id}`).toBeLessThanOrEqual(35);
        }
      }
    }
  });

  it('floor-3 rare-rarity item: price in [510, 690] (when found)', () => {
    let foundRare = false;
    for (let seed = 1; seed < 200 && !foundRare; seed++) {
      const { inventory } = generateShop(3, createRng(seed));
      for (const slot of inventory) {
        if (slot.item.rarity === 'rare') {
          expect(slot.price).toBeGreaterThanOrEqual(510);
          expect(slot.price).toBeLessThanOrEqual(690);
          foundRare = true;
          break;
        }
      }
    }
    expect(foundRare).toBe(true);
  });

  it('determinism: same seed produces identical inventory', () => {
    const a = generateShop(1, createRng(42));
    const b = generateShop(1, createRng(42));
    expect(a).toEqual(b);
  });

  it('floor 3 average price is roughly 2-4.5x floor 1 average', () => {
    const { inventory: f1 } = generateShop(1, createRng(99));
    const { inventory: f3 } = generateShop(3, createRng(99));
    const avgF1 = f1.reduce((acc, s) => acc + s.price, 0) / f1.length;
    const avgF3 = f3.reduce((acc, s) => acc + s.price, 0) / f3.length;
    expect(avgF3 / avgF1).toBeGreaterThan(2.0);
    expect(avgF3 / avgF1).toBeLessThan(4.5);
  });
});
```

- [ ] **Step 2: Run shop tests to confirm they fail**

Run: `npx vitest run src/dungeon/__tests__/shop.test.ts`

Expected: Module not found — `generateShop` not yet exported.

- [ ] **Step 3: Create `src/dungeon/shop.ts`**

```ts
import type { ItemSlot } from '../data/types';
import type { Rng } from '../util/rng';
import { rollShopItem } from './loot';
import type { ShopItem } from './node';

const SHOP_SLOTS: readonly ItemSlot[] = ['weapon', 'shield', 'outfit', 'hat'];

const BASE_PRICE_BY_RARITY = {
  common: 30,
  uncommon: 80,
  rare: 200,
} as const;

const PRICE_VARIANCE = 0.15;

export function generateShop(
  floorNumber: number,
  rng: Rng,
): { inventory: readonly ShopItem[] } {
  const inventory: ShopItem[] = SHOP_SLOTS.map((slot) => {
    const item = rollShopItem(rng, slot, floorNumber);
    const base = BASE_PRICE_BY_RARITY[item.rarity];
    const variance = (rng.next() * 2 - 1) * PRICE_VARIANCE;
    const price = Math.round(base * floorNumber * (1 + variance));
    return { item, price, sold: false };
  });
  return { inventory };
}
```

- [ ] **Step 4: Run shop tests to confirm they pass**

Run: `npx vitest run src/dungeon/__tests__/shop.test.ts`

Expected: PASS on all 8 cases.

- [ ] **Step 5: Update floor.test.ts — replace fork-structure test**

In `src/dungeon/__tests__/floor.test.ts`, find the test `'fork structure: one node has 2 nextNodeIds, both branches converge at boss'` (the existing test asserts both branches are combat). Replace it with:

```ts
it('fork structure: one branch is combat, one is shop, both converge at boss', () => {
  const { nodes } = generateFloor('crypt', 1, createRng(1));
  const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
  const branches = fork.nextNodeIds.map((id) => nodes.find((n) => n.id === id)!);
  const types = branches.map((b) => b.type).sort();
  expect(types).toEqual(['combat', 'shop']);

  // Both branches' nextNodeIds point at the same boss.
  for (const b of branches) {
    expect(b.nextNodeIds).toHaveLength(1);
    const target = nodes.find((n) => n.id === b.nextNodeIds[0])!;
    expect(target.type).toBe('boss');
  }
});
```

Then append two new tests at the end of the `describe('generateFloor — Crypt', ...)` block:

```ts
it('shop branch placement is deterministic per seed', () => {
  const a = generateFloor('crypt', 1, createRng(7));
  const b = generateFloor('crypt', 1, createRng(7));
  const aShop = a.nodes.find((n) => n.type === 'shop')!.id;
  const bShop = b.nodes.find((n) => n.type === 'shop')!.id;
  expect(aShop).toBe(bShop);
});

it('shop has 4 inventory items', () => {
  const { nodes } = generateFloor('crypt', 1, createRng(1));
  const shop = nodes.find((n) => n.type === 'shop')!;
  expect(shop.inventory).toHaveLength(4);
});
```

Also update the existing `'floor 1 has 5 nodes: 4 combat + 1 boss (diamond)'` test — the floor now has 3 combat + 1 shop + 1 boss:

```ts
it('floor 1 has 5 nodes: 3 combat + 1 shop + 1 boss (diamond)', () => {
  const { nodes } = generateFloor('crypt', 1, createRng(1));
  expect(nodes).toHaveLength(5);
  const combatCount = nodes.filter((n) => n.type === 'combat').length;
  const shopCount = nodes.filter((n) => n.type === 'shop').length;
  const bossCount = nodes.filter((n) => n.type === 'boss').length;
  expect(combatCount).toBe(3);
  expect(shopCount).toBe(1);
  expect(bossCount).toBe(1);
});
```

The existing test `'every combat encounter uses pool enemies only'` already filters by `n.type === 'combat'`, so it survives. The `'propagates per-floor scale to every encounter'` test also filters out shop nodes implicitly because shops have no `encounter` field — but TypeScript will narrow this correctly. **Verify:** check that test for any direct `node.encounter.scale` access on every node — if so, filter to combat/boss only:

```ts
it('propagates per-floor scale to every encounter', () => {
  for (const floorNumber of [1, 2, 5, 10]) {
    const expected = floorScale(floorNumber);
    const { nodes } = generateFloor('crypt', floorNumber, createRng(1));
    for (const node of nodes) {
      if (node.type === 'shop') continue;
      expect(node.encounter.scale).toEqual(expected);
    }
  }
});
```

- [ ] **Step 6: Run floor tests to confirm they fail (generator not yet updated)**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts`

Expected: failures — generator still produces all-combat fork branches.

- [ ] **Step 7: Update `generateFloor` to roll shop branch**

Replace `src/dungeon/floor.ts` with:

```ts
import { DUNGEONS } from '../data/dungeons';
import type { DungeonId } from '../data/types';
import type { Rng } from '../util/rng';
import { composeBossEncounter, composeCombatEncounter } from './encounter';
import type { Node } from './node';
import { floorScale } from './scaling';
import { generateShop } from './shop';

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

  // Roll which fork branch becomes a shop. Drawn first so RNG consumption
  // for downstream encounters/inventory stays deterministic per seed.
  const shopOnBranchA = rng.next() < 0.5;

  const enc0 = composeCombatEncounter(dungeon.enemyPool, scale, rng);
  const enc1 = composeCombatEncounter(dungeon.enemyPool, scale, rng);
  const enc2Combat = composeCombatEncounter(dungeon.enemyPool, scale, rng);
  const shop = generateShop(floorNumber, rng);
  const encBoss = composeBossEncounter(dungeon.bossId, dungeon.enemyPool, scale, rng);

  const node2a: Node = shopOnBranchA
    ? { id: id2a, type: 'shop', inventory: shop.inventory, nextNodeIds: [idBoss] }
    : { id: id2a, type: 'combat', encounter: enc2Combat, nextNodeIds: [idBoss] };
  const node2b: Node = shopOnBranchA
    ? { id: id2b, type: 'combat', encounter: enc2Combat, nextNodeIds: [idBoss] }
    : { id: id2b, type: 'shop', inventory: shop.inventory, nextNodeIds: [idBoss] };

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

- [ ] **Step 8: Run floor tests to confirm they pass**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts`

Expected: PASS — all updated structural tests + the 2 new shop-determinism + shop-inventory tests.

- [ ] **Step 9: Run the full test suite + type-check**

Run: `npm test`

Expected: All tests pass. **Run-state tests may have failures** if any specific seed-derived expectation breaks. Spot-check the failures: if they're seed-specific node-id tests (e.g., `expect(rs.currentNodeId).toBe('crypt-f1-n2a')`), update the expectation by deriving the shop branch from `nextNodeChoices(rs)` — see Task 3's `navigateToShop` helper or the existing `chooseNextNode(rs, ...)` calls. Most existing tests (which use `chooseNextNode(rs, currentNode(rs).nextNodeIds[0])` or the `advanceToBossNode` helper) should survive because they pick branch A regardless of shop placement; if `nextNodeIds[0]` happens to be a shop, the test will fail at `completeCombat` because shops have no encounter to fight.

The cleanest fix at the run-state-test layer is to update `advanceToBossNode` in `src/run/__tests__/run_state.test.ts` to skip shop branches:

```ts
function advanceToBossNode(rsArg: ReturnType<typeof startRun>): ReturnType<typeof startRun> {
  let rs = rsArg;
  while (true) {
    const node = currentNode(rs);
    if (node.type === 'boss') return rs;
    if (node.type === 'shop') {
      // Test helper: skip shops by leaving them.
      rs = leaveShop(rs);
      continue;
    }
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    if (rs.awaitingFork) {
      // Pick the combat branch (avoid the shop branch for tests that need to reach boss via combat).
      const choices = nextNodeChoices(rs);
      const combatBranch = choices.find((n) => n.type === 'combat') ?? choices[0];
      rs = chooseNextNode(rs, combatBranch.id);
    }
  }
}
```

This requires `leaveShop` to exist, which Task 3 ships. **For Task 2's verification**, expect failures in run-state tests that traverse the floor (e.g., the boss-XP test that calls `advanceToBossNode`); they resolve in Task 3 once `leaveShop` is exported and `advanceToBossNode` is updated.

If run-state tests fail at this stage with errors mentioning shop branches or undefined encounter access, leave them broken — they resolve in Task 3.

Run: `npx tsc --noEmit`

Expected: Clean.

- [ ] **Step 10: Stage and report**

```bash
git add src/dungeon/shop.ts src/dungeon/__tests__/shop.test.ts \
        src/dungeon/floor.ts src/dungeon/__tests__/floor.test.ts
git status
```

Tell the user: **"Task 2 ready. `generateShop` + tests; floor generator rolls shop branch and produces combat-vs-shop fork. Run-state tests may have failures around `advanceToBossNode` not knowing how to skip shops — these resolve in Task 3. Suggested commit message: `feat(dungeon): shop nodes in floor generator`. Awaiting your direction."**

---

## Task 3: RunState shop API — purchaseItem + leaveShop

**Goal:** Two new exports on `run_state.ts`: `purchaseItem(rs, itemId)` and `leaveShop(rs)`. Six purchase tests + three leave tests cover validation. The `advanceToBossNode` test helper updates to skip shops, fixing any Task 2 ripple in existing run-state tests.

**Files:**
- Modify: `src/run/run_state.ts`
- Modify: `src/run/__tests__/run_state.test.ts`

- [ ] **Step 1: Write the failing tests for `purchaseItem` and `leaveShop`**

In `src/run/__tests__/run_state.test.ts`, add `purchaseItem` and `leaveShop` to the imports:

```ts
import {
  cashout,
  chooseNextNode,
  completeCombat,
  currentNode,
  leaveShop,
  nextNodeChoices,
  playerPath,
  pressOn,
  purchaseItem,
  startRun,
} from '../run_state';
```

Add a `navigateToShop` helper near the top of the file (after `mockCombatResult`):

```ts
/**
 * Walks to the shop node (whichever fork branch it's on for the seed).
 */
function navigateToShop(rsArg: ReturnType<typeof startRun>): ReturnType<typeof startRun> {
  let rs = rsArg;
  // Clear n0.
  rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
  // Clear n1, hit fork.
  rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
  // Pick the shop branch.
  const shopBranch = nextNodeChoices(rs).find((n) => n.type === 'shop')!;
  rs = chooseNextNode(rs, shopBranch.id);
  return rs;
}
```

Update the existing `advanceToBossNode` helper to skip shops:

```ts
function advanceToBossNode(rsArg: ReturnType<typeof startRun>): ReturnType<typeof startRun> {
  let rs = rsArg;
  while (true) {
    const node = currentNode(rs);
    if (node.type === 'boss') return rs;
    if (node.type === 'shop') {
      rs = leaveShop(rs);
      continue;
    }
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    if (rs.awaitingFork) {
      // Pick the combat branch (avoid shops to ensure we encounter combat to reach boss XP).
      const choices = nextNodeChoices(rs);
      const combatBranch = choices.find((n) => n.type === 'combat') ?? choices[0];
      rs = chooseNextNode(rs, combatBranch.id);
    }
  }
}
```

Append the new `describe` blocks at the end of the file:

```ts
describe('purchaseItem', () => {
  it('decreases pack.gold by price, adds item to pack.items, marks slot sold', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = navigateToShop(rs);
    // Give the player enough gold for any item.
    rs = { ...rs, pack: { ...rs.pack, gold: 1000 } };
    const shop = currentNode(rs);
    if (shop.type !== 'shop') throw new Error('expected shop');
    const targetItem = shop.inventory[0].item;
    const targetPrice = shop.inventory[0].price;

    const after = purchaseItem(rs, targetItem.id);
    expect(after.pack.gold).toBe(1000 - targetPrice);
    expect(after.pack.items.find((i) => i.id === targetItem.id)).toBeDefined();
    const updatedShop = after.currentFloorNodes.find((n) => n.id === shop.id)!;
    if (updatedShop.type !== 'shop') throw new Error('expected shop');
    expect(updatedShop.inventory[0].sold).toBe(true);
  });

  it('throws when current node is not a shop', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(() => purchaseItem(rs, 'any-id')).toThrow();
  });

  it('throws on unknown item id', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = navigateToShop(rs);
    rs = { ...rs, pack: { ...rs.pack, gold: 1000 } };
    expect(() => purchaseItem(rs, 'bogus-item-id')).toThrow();
  });

  it('throws when item already sold', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = navigateToShop(rs);
    rs = { ...rs, pack: { ...rs.pack, gold: 1000 } };
    const shop = currentNode(rs);
    if (shop.type !== 'shop') throw new Error('expected shop');
    const itemId = shop.inventory[0].item.id;
    rs = purchaseItem(rs, itemId);
    expect(() => purchaseItem(rs, itemId)).toThrow();
  });

  it('throws on insufficient gold', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = navigateToShop(rs);
    rs = { ...rs, pack: { ...rs.pack, gold: 0 } };
    const shop = currentNode(rs);
    if (shop.type !== 'shop') throw new Error('expected shop');
    const itemId = shop.inventory[0].item.id;
    expect(() => purchaseItem(rs, itemId)).toThrow();
  });

  it('throws when status is not in_dungeon', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = navigateToShop(rs);
    const synthetic = { ...rs, status: 'camp_screen' as const };
    expect(() => purchaseItem(synthetic, 'any')).toThrow();
  });
});

describe('leaveShop', () => {
  it('advances currentNodeId to next', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = navigateToShop(rs);
    const shop = currentNode(rs);
    const before = rs.currentNodeId;
    const after = leaveShop(rs);
    expect(after.currentNodeId).not.toBe(before);
    expect(after.currentNodeId).toBe(shop.nextNodeIds[0]);
  });

  it('throws when current node is not a shop', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(() => leaveShop(rs)).toThrow();
  });

  it('throws when status is not in_dungeon', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = navigateToShop(rs);
    const synthetic = { ...rs, status: 'camp_screen' as const };
    expect(() => leaveShop(synthetic)).toThrow();
  });
});
```

- [ ] **Step 2: Run run-state tests to confirm failures**

Run: `npx vitest run src/run/__tests__/run_state.test.ts`

Expected: failures — `purchaseItem` and `leaveShop` not exported from `run_state.ts`. Plus any pre-Task-3 ripple from Task 2.

- [ ] **Step 3: Add `purchaseItem` and `leaveShop` to `run_state.ts`**

In `src/run/run_state.ts`, add `addItem` and `spendGold` to the existing pack imports:

```ts
import { addGold, addItem, createPack, spendGold, type Pack, totalGold } from './pack';
```

Append the two new exports near the bottom of the file (after `cashout`, before `playerPath`):

```ts
export function purchaseItem(runState: RunState, itemId: string): RunState {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`purchaseItem: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const cur = currentNode(runState);
  if (cur.type !== 'shop') {
    throw new Error(`purchaseItem: current node is type '${cur.type}', not 'shop'`);
  }
  const idx = cur.inventory.findIndex((s) => s.item.id === itemId);
  if (idx < 0) {
    throw new Error(`purchaseItem: item id '${itemId}' not in shop inventory`);
  }
  const slot = cur.inventory[idx];
  if (slot.sold) {
    throw new Error(`purchaseItem: item id '${itemId}' already sold`);
  }
  if (runState.pack.gold < slot.price) {
    throw new Error(
      `purchaseItem: insufficient gold (have ${runState.pack.gold}, need ${slot.price})`,
    );
  }

  const newInventory = cur.inventory.map((s, i) =>
    i === idx ? { ...s, sold: true } : s,
  );
  const newNodes = runState.currentFloorNodes.map((n) =>
    n.id === cur.id ? { ...cur, inventory: newInventory } : n,
  );

  return {
    ...runState,
    currentFloorNodes: newNodes,
    pack: addItem(spendGold(runState.pack, slot.price), slot.item),
  };
}

export function leaveShop(runState: RunState): RunState {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`leaveShop: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const cur = currentNode(runState);
  if (cur.type !== 'shop') {
    throw new Error(`leaveShop: current node is type '${cur.type}', not 'shop'`);
  }
  return {
    ...runState,
    currentNodeId: cur.nextNodeIds[0],
  };
}
```

- [ ] **Step 4: Run run-state tests to confirm they pass**

Run: `npx vitest run src/run/__tests__/run_state.test.ts`

Expected: PASS on all `purchaseItem` and `leaveShop` cases plus existing tests. The `advanceToBossNode` helper now correctly skips shops, so any Task 2 ripples are resolved.

- [ ] **Step 5: Run the full test suite + type-check**

Run: `npm test`

Expected: All tests pass.

Run: `npx tsc --noEmit`

Expected: Clean.

- [ ] **Step 6: Stage and report**

```bash
git add src/run/run_state.ts src/run/__tests__/run_state.test.ts
git status
```

Tell the user: **"Task 3 ready. `purchaseItem` (6 cases) + `leaveShop` (3 cases). `advanceToBossNode` test helper now skips shops correctly. Suggested commit message: `feat(run): purchaseItem and leaveShop API`. Awaiting your direction."**

---

## Task 4: Dungeon scene — handleArrival + auto-leave stub + 🛒 glyph

**Goal:** Extract `handleArrival()` to consolidate the duplicated logic from Cluster B · 6's two `onComplete` callbacks. Add the shop auto-leave stub. Add 🛒 glyph for shop nodes in the icon row and fork-picker. No automated tests (Phaser-side, untested per repo convention); verify via tsc + manual smoke.

**Files:**
- Modify: `src/scenes/dungeon_scene.ts`

- [ ] **Step 1: Add `leaveShop` to the run_state import**

In `src/scenes/dungeon_scene.ts`, find the existing run_state import (currently includes `chooseNextNode`, `completeCombat`, `currentNode`, `playerPath`, `RunState`, `WipeOutcome`). Add `leaveShop`:

```ts
import {
  chooseNextNode,
  completeCombat,
  currentNode,
  leaveShop,
  playerPath,
  type RunState,
  type WipeOutcome,
} from '../run/run_state';
```

- [ ] **Step 2: Extract `handleArrival()` and update `setState`**

Find the `setState` switch (post-Cluster B · 6, the `walking_in` and `walking_to_next` cases each have an inline `awaitingFork`-checking onComplete callback). Replace the switch with:

```ts
private setState(next: DungeonSceneState): void {
  switch (next) {
    case 'walking_in':
      this.tweenPartyTo(
        this.partyXForNode(this.currentNodeIndex()),
        WALK_IN_DURATION,
        'Cubic.easeOut',
        () => this.handleArrival(),
      );
      break;
    case 'walking_to_next':
      this.tweenPartyTo(
        this.partyXForNode(this.currentNodeIndex()),
        WALK_NEXT_DURATION,
        'Cubic.easeInOut',
        () => this.handleArrival(),
      );
      break;
    case 'showing_result':
      this.buildResultPanel();
      break;
    case 'awaiting_fork_pick':
      this.buildForkPicker();
      break;
    case 'showing_wipe':
      this.buildWipePanel();
      break;
  }
}

private handleArrival(): void {
  const run = appState.get().runState;
  if (!run) return;

  if (run.awaitingFork) {
    this.setState('awaiting_fork_pick');
    return;
  }

  const node = currentNode(run);
  if (node.type === 'shop') {
    // Tier 2 stub: auto-leave. Cluster B · 3 replaces with a shop overlay.
    appState.update((s) => ({ ...s, runState: leaveShop(s.runState!) }));
    this.setState('walking_to_next');
    return;
  }

  this.startCombatAtCurrentNode();
}
```

- [ ] **Step 3: Add 🛒 glyph in `buildNodes`**

Find `buildNodes` (currently uses ternary `node.type === 'boss' ? '☠' : '⚔'`). Replace with:

```ts
  private buildNodes(): void {
    const run = appState.get().runState!;
    const path = playerPath(run);
    for (let i = 0; i < path.length && i < NODE_X.length; i++) {
      const node = path[i];
      const glyph = node.type === 'boss' ? '☠' : node.type === 'shop' ? '🛒' : '⚔';
      const x = NODE_X[i];
      const icon = this.add
        .text(x, NODE_Y, glyph, {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#888888',
        })
        .setOrigin(0.5);
      const label = this.add
        .text(x, NODE_LABEL_Y, node.type, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5);
      this.nodeIcons.push(icon);
      this.nodeLabels.push(label);
    }
  }
```

- [ ] **Step 4: Add 🛒 glyph in `buildForkOption`**

Find `buildForkOption` (in the fork picker code from B · 6). Replace the glyph line:

```ts
    const branchNode = run.currentFloorNodes.find((n) => n.id === branchId)!;
    const glyph = branchNode.type === 'boss' ? '☠' : branchNode.type === 'shop' ? '🛒' : '⚔';
    const typeLabel = branchNode.type;
```

- [ ] **Step 5: Run the full test suite + type-check**

Run: `npm test`

Expected: All tests pass — no scene tests, but full suite verifies no run-state regressions from imports.

Run: `npx tsc --noEmit`

Expected: Clean.

- [ ] **Step 6: Stage and report**

```bash
git add src/scenes/dungeon_scene.ts
git status
```

Tell the user: **"Task 4 ready. `handleArrival` consolidates B · 6's two onComplete callbacks; shop auto-leave stub fires when entering a shop; 🛒 glyph renders for shop nodes in the icon row and fork picker. Suggested commit message: `feat(scenes): shop auto-leave stub and 🛒 glyph`. Awaiting your direction. Manual smoke recommended: `npm run dev`, run a Crypt floor 1 fight, see 🛒 in the fork picker, click it, party walks to shop and auto-leaves to boss."**

---

## Post-implementation: TODO and HISTORY

After Task 4 is committed, the user typically migrates the TODO entry into HISTORY. Don't do this unprompted — wait for direction. The TODO entry to migrate is the Cluster A · 9 entry in [`TODO.md`](../../../TODO.md). Per the [slim HISTORY entry policy](../../../CLAUDE.md), keep the entry to ~15-25 lines: Why / Decisions / Surprises / Source.

Suggested HISTORY-entry sketch:

```markdown
### YYYY-MM-DD · Shop nodes (Cluster A · 9)

**Why:** Adds the gdd's "spend gold for gear vs fight for XP/gold" decision. Without shops, all fork branches were combat-vs-combat and the Crypt had no real economy beyond "save gold for the camp Vault." This task ships the data + traversal foundation: every Crypt floor's fork now has a shop on one branch (deterministic from RNG), 4 gear items at floor-scaled prices. Cluster B · 3 replaces the auto-leave stub with a real shop overlay later.

**Decisions:**
- **Gear-only Tier 2 ship.** Potions deferred — no consumable system exists yet, so building potions alongside shops would balloon scope. Shop is gear-only; potions land with their own design pass.
- **One shop per floor on a random fork branch.** Predictable cadence (you always see one shop per floor) + variable placement (RNG decides which branch) keeps the choice meaningful without making shops avoidable. Replaces the combat-vs-combat fork with combat-vs-shop, which is the asymmetric trade-off the gdd called for.
- **Prices: `BASE × floor × (1 ± 0.15)`** with bases 30/80/200 for common/uncommon/rare. ±15% RNG variance per item adds "hunt for deals" flavor. Linear floor scaling matches gold income (15g/floor combat, 100g/floor boss).
- **Inventory slot order is fixed: weapon, shield, outfit, hat.** One item per slot guarantees coverage; rarity / weapon-family / affixes carry the variety. RNG variance lives in the rolls, not the slot composition.
- **`rollShopItem(rng, slot, floor)` extracted from `rollLoot`.** Both shop and combat-loot use the same item-generation path, same rarity weights. Refactor preserves `rollLoot`'s public API and RNG order.

**Surprises:**
- Updating `advanceToBossNode` test helper to skip shops was the trickiest change — without it, every test that walks the floor to boss broke. Solved by branching on `node.type === 'shop'` in the helper and calling `leaveShop` to advance.
- Floor-generator RNG order changes (added `shopOnBranchA` first draw + the conditional combat encounter logic), so same-seed runs produce different specific encounters than pre-task. Tests asserting structural properties (fork shape, terminal count) survive; tests asserting specific node ids would have needed updating but none did.

**Source:** TODO.md Cluster A · 9 → spec at `docs/superpowers/specs/2026-04-28-shop-nodes-design.md` → plan at `docs/superpowers/plans/2026-04-28-shop-nodes.md`. Test count delta: ~+20.
```

---

## Self-review notes

Reviewed the plan against the spec:

- **Spec coverage:** All schema changes (Node `shop`, Pack `spendGold`, ShopItem) → Task 1 + 2. Generator → Task 2. RunState API → Task 3. Dungeon scene auto-leave + glyph → Task 4. All ~25 spec-mandated tests are explicit steps across Tasks 1-3.
- **Type consistency:** `ShopItem`, `purchaseItem(rs, itemId): RunState`, `leaveShop(rs): RunState`, `generateShop(floorNumber, rng): { inventory: readonly ShopItem[] }`, `rollShopItem(rng, slot, floor): Item` — all signatures match across tasks. `BASE_PRICE_BY_RARITY` constants identical.
- **No placeholders:** Every step has actual code or precise commands. The HISTORY-entry sketch uses `YYYY-MM-DD` because the completion date isn't known yet — documentation, not implementation.
- **Inter-task gap:** Task 2 leaves run-state tests potentially red around `advanceToBossNode` — explicitly documented in Task 2 step 9. Task 3 step 1 includes the helper update that closes the gap. tsc stays clean throughout.
