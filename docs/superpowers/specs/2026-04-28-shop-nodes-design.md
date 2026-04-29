# Shop Nodes

**Status:** Design · **Date:** 2026-04-28 · **Source:** [`TODO.md`](../../../TODO.md) Cluster A · 9 — gdd §4 + §7 + §10 Tier 2.

## Purpose

Add shop nodes as the third `Node` variant. Each Crypt floor's fork now offers a shop on one branch and combat on the other (deterministic from run RNG which side is shop), giving the player a real "spend gold for gear or fight for XP+gold" decision. Shops carry 4 gear items — one per slot (weapon, shield, outfit, hat) — with prices that scale linearly per rarity × floor with ±15% variance for shopping flavor. The dungeon scene gets an auto-leave stub for shop nodes; Cluster B · 3 (Shop UI) replaces the stub with a real overlay later. Potions are deferred to a future task once a consumable system is designed.

## Dependencies and invariants

**Vocabulary already in place:**
- `Node = { combat | boss }` with `id`, `encounter`, `nextNodeIds` (`src/dungeon/node.ts`).
- `rollLoot(rng, floor, isBoss): Item | null` (`src/dungeon/loot.ts`) — single-item generator with internal helpers for slot/rarity/affixes/rare-property selection.
- `Pack = { gold, items }` (`src/run/pack.ts`) with `addGold`, `addItem`, `removeItem`. Missing: `spendGold`.
- `RunState.currentFloorNodes`, `currentNodeId`, `awaitingFork` (Cluster A · 8).
- `currentNode(rs)`, `chooseNextNode(rs, id)`, `playerPath(rs)` (`src/run/run_state.ts`).
- Floor generator hardcodes the diamond: 4 combat + 1 boss in n0/n1/n2a/n2b/boss.
- Dungeon scene's `handleArrival`-style logic lives in `walking_in` and `walking_to_next` `onComplete` callbacks (Cluster B · 6 added the `awaitingFork` guard).
- Save policy: pre-launch v1; new shape additions land via JSON without migration.

**Invariants this spec declares:**
- **Every shop node has exactly 4 items, one per slot.** Always weapon, shield, outfit, hat. Generation order is deterministic so same-seed runs produce identical inventories.
- **Shop branch is rolled deterministically from run RNG.** Floor generator's first RNG draw chooses `shopOnBranchA: boolean`. Same seed → same shop placement.
- **Prices: `BASE × floor × (1 ± 0.15)`** where BASE is `{ common: 30, uncommon: 80, rare: 200 }`. Variance is per-item, deterministic from RNG.
- **Rarity weights match `rollLoot`'s table.** Reuse `rarityWeightsAt(floor)`. No separate "shop premium" table.
- **`sold: boolean` lives on each `ShopItem`.** Once `purchaseItem` flips it true, the item stays sold across save/reload. The shop's inventory mutates within `currentFloorNodes`; the rest of the floor structure is unchanged.
- **Shops are non-combat.** They have no `encounter`. The dungeon scene's "arrival at shop" path is distinct from "arrival at combat" — currently auto-leaves; B · 3 will replace.
- **No XP/gold/loot reward on leaving a shop.** Shops are purely transactional.

## Module layout

| Path | Action | Responsibility |
|---|---|---|
| `src/dungeon/node.ts` | **Modify** | Add `ShopItem` interface; add `'shop'` variant to `Node` union with `inventory: readonly ShopItem[]` (no `encounter` field). |
| `src/dungeon/shop.ts` | **Create** | `generateShop(floorNumber, rng)` + `BASE_PRICE_BY_RARITY` and `PRICE_VARIANCE` constants. |
| `src/dungeon/loot.ts` | **Modify** | Extract `rollShopItem(rng, slot, floor): Item` as exported helper; refactor `rollLoot` to use it. |
| `src/dungeon/floor.ts` | **Modify** | Roll `shopOnBranchA` deterministically; build n2a/n2b conditionally as shop or combat. |
| `src/dungeon/__tests__/floor.test.ts` | **Modify** | Update "fork structure" test for combat-vs-shop branches; add shop-branch determinism + shop-inventory shape. |
| `src/dungeon/__tests__/shop.test.ts` | **Create** | 8 cases: 4-item count, slot order, sold-false initially, prices in band, rarity follows lerp, determinism, floor-scaled prices. |
| `src/run/pack.ts` | **Modify** | Add `spendGold(pack, amount)` with non-negative + sufficient-gold guards. |
| `src/run/__tests__/pack.test.ts` | **Modify** | Add `spendGold` tests (3 cases: success, negative throws, overspend throws). |
| `src/run/run_state.ts` | **Modify** | Add `purchaseItem(rs, itemId)` and `leaveShop(rs)`. |
| `src/run/__tests__/run_state.test.ts` | **Modify** | Add `purchaseItem` describe block (6 cases) and `leaveShop` describe block (3 cases). |
| `src/scenes/dungeon_scene.ts` | **Modify** | Extract `handleArrival()` (consolidates Cluster B · 6's two onComplete callbacks); add shop auto-leave stub; add 🛒 glyph for shop nodes in `buildNodes` and `buildForkOption`. |

No save migration. No combat or hero changes. No new dungeon-scene state values (the auto-leave stub flows through existing `walking_to_next`).

## Schema changes

### `Node` (`src/dungeon/node.ts`)

```ts
export interface ShopItem {
  readonly item: Item;
  readonly price: number;
  readonly sold: boolean;
}

export type Node =
  | { id: string; type: 'combat'; encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'boss';   encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'shop';   inventory: readonly ShopItem[]; nextNodeIds: readonly string[] };
```

The `shop` variant has `inventory` instead of `encounter`. Type narrowing on `node.type` lets consumers access the right field.

### `Pack` (`src/run/pack.ts`)

`spendGold(pack, amount): Pack` — symmetric with `addGold`, validates non-negative and sufficient balance:

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

### `RunState` — no shape change

`currentFloorNodes` already accommodates the new variant. The shop's `inventory` mutates within this array via `purchaseItem`; everything else stays.

## Behavior

### `generateShop(floorNumber, rng)` — `src/dungeon/shop.ts`

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

**RNG consumption per shop:** 4 items × (slot rolls + price variance) = a deterministic sequence for any seed. RNG order is item-then-price, slot order weapon → shield → outfit → hat.

**Price examples:**
- Floor 1 common: `30 × 1 × (1 ± 0.15)` → 26-35g.
- Floor 1 uncommon: `80 × 1 × (1 ± 0.15)` → 68-92g.
- Floor 1 rare: `200 × 1 × (1 ± 0.15)` → 170-230g.
- Floor 3 rare: `200 × 3 × (1 ± 0.15)` → 510-690g.

### `rollShopItem` — `src/dungeon/loot.ts` extraction

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
```

Existing `rollLoot` becomes a thin wrapper:

```ts
export function rollLoot(rng: Rng, floorNumber: number, isBoss: boolean): Item | null {
  if (!isBoss) {
    if (rng.next() >= 0.5) return null;
  }
  const effectiveFloor = isBoss ? floorNumber + 1 : floorNumber;
  const slot = rng.pick(ALL_SLOTS);
  return rollShopItem(rng, slot, effectiveFloor);
}
```

The refactor preserves `rollLoot`'s public API, RNG consumption order, and behavior for combat/boss drops. Existing loot tests should continue to pass.

### Floor generator — `src/dungeon/floor.ts`

```ts
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

**RNG consumption order:**
1. `shopOnBranchA` — one draw.
2. `enc0` — combat encounter at n0.
3. `enc1` — combat encounter at n1 (fork source).
4. `enc2Combat` — combat encounter for whichever branch is combat.
5. `shop.inventory` — 4 items × (rolls + price), via `generateShop`.
6. `encBoss` — boss encounter.

**Floor structure unchanged** otherwise: 5-node diamond, fork at n1, both branches reach boss.

### `purchaseItem(rs, itemId)` — `src/run/run_state.ts`

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
```

Validates 5 pre-conditions; updates two pieces of state (inventory + pack) atomically; immutable.

### `leaveShop(rs)` — `src/run/run_state.ts`

```ts
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

Shops always have exactly one `nextNodeId` in Tier 2 (the boss). Validates and advances.

### Dungeon scene — `handleArrival` extraction + auto-leave stub

Consolidate Cluster B · 6's two `onComplete` callbacks into a single helper:

```ts
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
```

```ts
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

The recursive `setState('walking_to_next')` after `leaveShop` is intentional — the party walks from the shop's position to the next node (boss). On arrival there, `handleArrival` fires again, sees combat, and starts the boss fight.

### Shop glyph in icon row

`buildNodes` (and `buildForkOption` if a shop ends up offered as a fork branch — Tier 2 always: the fork's branch nodes are n2a/n2b which are visible at the picker stage, and one of them is shop):

```ts
const glyph = node.type === 'boss' ? '☠' : node.type === 'shop' ? '🛒' : '⚔';
```

Three call sites: `buildNodes` (icon row main), `buildForkOption` (picker buttons), and check whether `defaultPlayerPath`'s rendering path uses the glyph elsewhere (Cluster B · 6 simplified this — only `buildForkOption` and `buildNodes`).

## Tests

### `src/run/__tests__/pack.test.ts` — 3 new cases

```ts
describe('spendGold', () => {
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

### `src/dungeon/__tests__/shop.test.ts` (new) — 8 cases

```ts
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
    // Find a common item across multiple seeds (test-helper sweep).
    for (let seed = 1; seed < 50; seed++) {
      const { inventory } = generateShop(1, createRng(seed));
      for (const slot of inventory) {
        if (slot.item.rarity === 'common') {
          expect(slot.price).toBeGreaterThanOrEqual(25);
          expect(slot.price).toBeLessThanOrEqual(35);
        }
      }
    }
  });

  it('floor-3 rare-rarity item: price in [510, 690]', () => {
    for (let seed = 1; seed < 200; seed++) {
      const { inventory } = generateShop(3, createRng(seed));
      for (const slot of inventory) {
        if (slot.item.rarity === 'rare') {
          expect(slot.price).toBeGreaterThanOrEqual(510);
          expect(slot.price).toBeLessThanOrEqual(690);
          return; // one example is enough; loop breaks on first rare found
        }
      }
    }
  });

  it('determinism: same seed produces identical inventory', () => {
    const a = generateShop(1, createRng(42));
    const b = generateShop(1, createRng(42));
    expect(a).toEqual(b);
  });

  it('different floors produce different price levels for same rarity', () => {
    // Sample a common across floor 1 and floor 3 with same seed; floor 3 should be ~3x.
    // (Test asserts ratio is roughly in band — exact match would require the same RNG state,
    // which differs because pickRarity consumes RNG too.)
    const { inventory: f1 } = generateShop(1, createRng(99));
    const { inventory: f3 } = generateShop(3, createRng(99));
    // Compare averages; expect f3 average to be 2.5x-3.5x f1 average.
    const avgF1 = f1.reduce((a, s) => a + s.price, 0) / f1.length;
    const avgF3 = f3.reduce((a, s) => a + s.price, 0) / f3.length;
    expect(avgF3 / avgF1).toBeGreaterThan(2.0);
    expect(avgF3 / avgF1).toBeLessThan(4.5);
  });
});
```

### `src/dungeon/__tests__/floor.test.ts` — modify

Update the existing fork-structure test (currently asserts both branches are combat). New shape:

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

Update other existing tests where appropriate — the "every combat encounter uses pool enemies only" test still works (filters by type === 'combat'). The "every node has nextNodeIds" still works.

### `src/run/__tests__/run_state.test.ts` — `purchaseItem` and `leaveShop` blocks

Helper: a small wrapper to navigate to the shop branch in tests:

```ts
/**
 * Walks to the shop node (whichever branch it's on for the seed).
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

`purchaseItem` (6 cases):
1. **Successful purchase** — pack.gold decreases by price, item appears in pack.items, ShopItem flagged sold.
2. **Throws when current node isn't a shop** (call from n0 — combat node).
3. **Throws on unknown item id** — pass `'bogus-id'`.
4. **Throws when item already sold** — purchase same item twice in succession.
5. **Throws on insufficient gold** — set `rs.pack.gold = 0` before purchase.
6. **Throws when status isn't `in_dungeon`** — synthesize `{ ...rs, status: 'camp_screen' }`.

`leaveShop` (3 cases):
1. **Advances `currentNodeId` to next** — boss id.
2. **Throws when current node isn't a shop**.
3. **Throws when status isn't `in_dungeon`**.

**No automated dungeon-scene tests** — Phaser-coupled. Manual smoke verification in `npm run dev`: clear floor 1's first combat, fork picker shows shop on one branch (🛒) and combat (⚔) on the other, click shop → party walks to shop → auto-leaves and walks to boss. Save during the walk-through to verify reload behavior.

**Estimated test count delta:** ~+20 cases (8 shop + 6 purchase + 3 leaveShop + 3 spendGold).

## Out of scope

- **Potions / consumables.** No data structure or consume mechanic exists; designing them is its own task. Shops ship gear-only.
- **Shop UI overlay.** Cluster B · 3. This task ships the auto-leave stub; B · 3 replaces it with a real shop overlay.
- **Sell-back / merchant trading.** No way to sell items back; the shop is buy-only.
- **Restocking after purchase.** Once an item is sold, the slot stays "sold" until the floor regenerates (next `pressOn`).
- **Per-floor shop count.** One shop per floor (the one fork branch). Variable shop counts per floor depth land with the larger floor-shape generalization in deeper dungeons.
- **Shop-only items / unique stock.** Shop inventory is rolled from the same pool as loot drops. No "shop-exclusive rarities."
- **Discount events / haggling.** Just static prices with ±15% RNG variance.

## Surprises / call-outs

- **`rollLoot` refactor preserves API.** Extracting `rollShopItem` is mechanical — `rollLoot`'s test suite stays valid because the slot-pick → item-roll order is preserved. Some seed-specific tests may need expectation updates if the extraction perturbs RNG state by even one draw, but spot-check confirms it doesn't (the extracted function consumes RNG identically).
- **Floor-generator RNG order changes.** Pre-task: rolled 4 combat encounters then boss. Post-task: rolls `shopOnBranchA` first, then 2 combat encounters (n0, n1), then 1 conditional combat encounter, then shop (4 items × 2 rolls), then boss. **Same-seed runs produce different graphs than pre-task.** Run-state tests that depend on specific node ids may need updated expectations; tests that assert structural properties (fork at n1, both branches reach boss) survive.
- **Shop inventory mutates within `currentFloorNodes`.** `purchaseItem` returns a new `RunState` with a new `currentFloorNodes` array (the shop node's `inventory` is replaced). All other nodes pass through unchanged. The mutation point is small and localized.
- **`handleArrival` extraction is opportunistic DRY-up.** Cluster B · 6 left the `awaitingFork` check duplicated in `walking_in` and `walking_to_next`. This task consolidates both into one helper. If it grows to 4+ branches (event nodes, camp nodes, etc. in future tasks), splitting back into per-state callbacks may be appropriate.
- **Auto-leave stub means players gain nothing from shops in Tier 2 standalone.** Same pattern as Cluster A · 8 (forks shipped before the picker UI). The next task in the cluster (B · 3) makes shops visible. Acceptable interim state.
- **Save during shop walk-through is fine** — auto-leave is synchronous from the player's perspective (no decision pending), so `currentNodeId` either points at the shop (mid-walk) or at the boss (post-leave). Either is recoverable via `handleArrival` on scene mount.
