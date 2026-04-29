# Elite nodes — Design

- **TODO entry:** Cluster A · 10 (Elite nodes).
- **Tier:** 2.
- **Date:** 2026-04-29.

## 1 · Scope

Add a new `'elite'` node type to the dungeon graph: a tougher fight (4 enemies + stat boost on top of `floorScale`) that grants a guaranteed Rare drop and 2× combat gold/XP on victory. Elites compete with shops at floor forks — the player's trade-off becomes "the safe combat, the shop, or the harder fight for guaranteed loot."

Out of scope (covered by other tasks):

- **Modifier stamping** (Cluster A · 12) — elites build the encounter shape but don't attach Armored / Enraged tags. Picked up cleanly when modifiers ship.
- **Elite icon / visual marker** (Cluster B · 10) — dungeon scene shows a placeholder glyph for now; B-10 differentiates.

## 2 · Architecture

Three core changes to the data layer.

### 2.1 · `Node` union gains `'elite'` variant

In `src/dungeon/node.ts`:

```ts
export type Node =
  | { id: string; type: 'combat'; encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'elite';  encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'boss';   encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'shop';   inventory: readonly ShopItem[]; nextNodeIds: readonly string[] };
```

Same shape as `'combat'` and `'boss'` — the `encounter` carries the boosted enemies + scale.

### 2.2 · `composeEliteEncounter` generator

New module `src/dungeon/elite.ts`:

```ts
export const ELITE_HP_MULT = 1.5;
export const ELITE_ATTACK_MULT = 1.25;

export function composeEliteEncounter(
  pool: readonly EnemyId[],
  scale: ScaleFactors,
  rng: Rng,
): Encounter;
```

- Always 4 enemies (no 2/3/4 weighting).
- Frontliner-presence guarantee: if no rolled enemy has `preferredSlots ⊇ {1,2}`, replace `picks[0]` with a frontliner pick from the front-only sub-pool. (Same logic as `composeCombatEncounter`.)
- Returns `Encounter` with:
  ```ts
  { enemies: assignSlots(picks), scale: { hp: scale.hp * ELITE_HP_MULT, attack: scale.attack * ELITE_ATTACK_MULT } }
  ```

### 2.3 · Shared `assignSlots`

`assignSlots` currently lives as a private helper inside `encounter.ts`. Promote it to an exported helper at the top of that file (the file's slot-assignment is the only consumer pattern that's about to be shared, and a one-import in `elite.ts` is cleaner than a brand-new "slots.ts" module). `encounter.ts` keeps using it locally; `elite.ts` imports it.

## 3 · Loot, gold, XP

### 3.1 · `rollLoot` API change — boolean → enum

In `src/dungeon/loot.ts`:

```ts
export type CombatKind = 'combat' | 'elite' | 'boss';
export function rollLoot(rng: Rng, floorNumber: number, kind: CombatKind): Item | null;
```

Three branches:

- **`'combat'`** (existing behavior): 50% drop gate; if drop, current-floor rarity weights, current-floor scaling.
- **`'elite'`** (new): 100% drop, **rarity forced to `'rare'`**, slot uniformly picked across all 4 slots, affixes / rare-property scaled at current floor. `floorRolledAt = floorNumber`.
- **`'boss'`** (existing behavior): 100% drop, next-floor rarity weights, current-floor affix scaling.

The forced-Rare branch reuses `pickAffixes` / `pickRareProperty` / `generateItemId` exactly the way `'boss'` does — the only difference is `rarity` is hard-coded `'rare'` instead of `pickRarity(rng, …)`. Skips the rarity-roll RNG draw, which means the elite branch's RNG consumption order is one draw shorter than boss's. Tests for elite stand alone — no expectation of seed parity with boss.

### 3.2 · Reward branching in `completeCombat`

In `src/run/run_state.ts`, the `isBoss: boolean` derivation is replaced with `kind: CombatKind` derived once from `node.type`:

| `kind` | Gold | XP | Loot call |
|---|---|---|---|
| `'combat'` | `COMBAT_NODE_GOLD × floor` (15 × floor — existing) | `xpForCombatNode(floor)` (existing) | `rollLoot(rng, floor, 'combat')` |
| `'elite'` | `ELITE_NODE_GOLD × floor` (**30 × floor**) | `xpForEliteNode(floor)` (**= 2 × `xpForCombatNode(floor)`**) | `rollLoot(rng, floor, 'elite')` (always returns) |
| `'boss'` | `BOSS_NODE_GOLD × floor` (100 × floor — existing) | `xpForBossNode(floor)` (existing) | `rollLoot(rng, floor, 'boss')` |

New constant `ELITE_NODE_GOLD = 30`. New `xpForEliteNode(floor)` helper alongside the existing two.

Status transition after elite victory: same as `'combat'` (back to walking). **Not** `'boss'` (which transitions to `'camp_screen'`).

## 4 · Floor generation: 3-shape fork RNG

In `src/dungeon/floor.ts`, replace the single boolean `shopOnBranchA` with a triangular roll:

```ts
type ForkShape = 'shop_vs_combat' | 'elite_vs_combat' | 'elite_vs_shop';

const shape: ForkShape = rng.weighted([
  { value: 'shop_vs_combat',  weight: 1 },
  { value: 'elite_vs_combat', weight: 1 },
  { value: 'elite_vs_shop',   weight: 1 },
]);
const specialOnBranchA = rng.next() < 0.5;
```

The fork's two branches are then constructed conditionally per shape:

- `'shop_vs_combat'`: one branch is `'shop'` (existing inventory roll), one is `'combat'`.
- `'elite_vs_combat'`: one branch is `'elite'` (new encounter roll), one is `'combat'`.
- `'elite_vs_shop'`: one branch is `'elite'`, one is `'shop'`. **No combat-fork-branch is generated**, so no rng draw for that encounter.

`specialOnBranchA` decides which side gets the more-distinguished node:

- `'shop_vs_combat'`: `specialOnBranchA = true` → branch A is shop.
- `'elite_vs_combat'`: `specialOnBranchA = true` → branch A is elite.
- `'elite_vs_shop'`: `specialOnBranchA = true` → branch A is elite (shop on B). Symmetric, but pinning a single rule keeps tests simple.

### 4.1 · RNG-consumption order

Order of draws inside `generateFloor` after the change:

1. `shape` weighted-roll.
2. `specialOnBranchA` boolean.
3. Preamble combat encounters n0 and n1 (unchanged).
4. **Conditionally**: combat-fork-branch encounter (only for shapes that include a combat branch — `'shop_vs_combat'` or `'elite_vs_combat'`).
5. **Conditionally**: elite encounter (only for `'elite_vs_combat'` or `'elite_vs_shop'`).
6. **Conditionally**: shop inventory (only for `'shop_vs_combat'` or `'elite_vs_shop'`).
7. Boss encounter (unchanged).

**Caveat for existing seed-stable tests.** Today the fork-shape decision is the *first* RNG draw inside `generateFloor` (`shopOnBranchA`). Replacing that single boolean with a weighted-roll plus a follow-up boolean changes the *first two* draws — every downstream encounter (preamble n0, n1, combat-fork-branch when present, shop, boss) consumes RNG starting from a shifted state. Tests that assert specific seed-dependent encounter content via the full `generateFloor` API will need updated expectations. Tests that exercise `composeCombatEncounter` / `composeBossEncounter` / `generateShop` directly with their own RNG are unaffected. The "exactly one shop per floor" property no longer holds — replaced by "every floor's fork has at least one shop OR elite, with `'elite_vs_shop'` shapes holding both."

## 5 · Out-of-scope shims

Two scenes touch `node.type`. Required edits to keep type-checking green and rendering non-broken:

- **`src/scenes/dungeon_scene.ts`** line 156 — icon-row glyph mapping. Add a placeholder `'⚔'` for `'elite'` (B-10 replaces it). Line 585's `isBoss = node.type === 'boss'` check stays valid (elite is not boss).
- **`src/scenes/combat_scene.ts`** line 59 — already gates on `'shop'`; `'elite'` falls through to the combat path, which is correct. May require a one-line type-narrowing tweak so `node.encounter` compiles against the wider `Node` union.

## 6 · Test plan

### `src/dungeon/__tests__/elite.test.ts` (new)

- Always 4 enemies across N seeds.
- Frontliner is present (slot 1 or 2 occupied) across N seeds.
- Scale on the encounter equals `{ hp: floorScale.hp × ELITE_HP_MULT, attack: floorScale.attack × ELITE_ATTACK_MULT }` for floors 1, 5, 10.
- Same seed → same encounter (determinism).

### `src/dungeon/__tests__/loot.test.ts` (extend)

- `rollLoot(rng, floor, 'elite')` always returns an item (no null) across many seeds.
- Item rarity is always `'rare'` across many seeds, multiple floors.
- Item has 2 affixes (or 3 for hat slot) — matches Rare rules.
- Affix values scale at the current floor (verify `floorRolledAt`).
- Determinism: same seed → same item.
- API migration: every existing call site uses the new enum (no `isBoss: boolean` left).

### `src/dungeon/__tests__/floor.test.ts` (extend)

- For `'elite_vs_shop'` floors, neither fork branch is `'combat'`.
- For `'elite_vs_combat'` floors, exactly one branch is `'elite'` and the other is `'combat'`.
- For `'shop_vs_combat'` floors, exactly one branch is `'shop'` and the other is `'combat'` (existing test, stays valid for that shape).
- Across a large seed sample (N ≥ 300), each of the three shapes appears in at least 20% of floors.

### `src/run/__tests__/run_state.test.ts` (extend)

- Completing an elite node grants `30 × floor` gold to the pack.
- Completing an elite node grants `xpForEliteNode(floor)` XP to surviving heroes.
- Completing an elite node always adds a Rare item to the pack.
- Status after elite-completion advances to walking (not `'camp_screen'`).
- The existing test loop that walks the diamond handles `'elite'` nodes the same way it handles `'combat'`.

## 7 · Files touched

| File | Change |
|---|---|
| `src/dungeon/node.ts` | Extend `Node` union with `'elite'` variant. |
| `src/dungeon/elite.ts` | **New.** `composeEliteEncounter`, `ELITE_HP_MULT`, `ELITE_ATTACK_MULT`. |
| `src/dungeon/encounter.ts` | Promote `assignSlots` to an exported helper at the top of the file; keep local consumer. |
| `src/dungeon/loot.ts` | Replace `isBoss: boolean` with `kind: CombatKind`; add elite branch (forced Rare). Export `CombatKind`. |
| `src/dungeon/floor.ts` | Replace `shopOnBranchA` with the 3-shape fork RNG; conditionally generate combat-fork-branch / elite encounter / shop inventory based on shape. |
| `src/run/run_state.ts` | `completeCombat`: derive `kind` from `node.type`; new `ELITE_NODE_GOLD` constant and `xpForEliteNode` helper; reward branching. |
| `src/scenes/dungeon_scene.ts` | Icon glyph: placeholder `'⚔'` for `'elite'` (B-10 replaces). |
| `src/scenes/combat_scene.ts` | Type-narrowing tweak only — no behavioral change. |
| `src/dungeon/__tests__/elite.test.ts` | **New.** Per §6. |
| `src/dungeon/__tests__/loot.test.ts` | Extend per §6 + migrate `isBoss` calls. |
| `src/dungeon/__tests__/floor.test.ts` | Extend per §6. |
| `src/run/__tests__/run_state.test.ts` | Extend per §6. |

## 8 · Save schema

Pre-launch policy holds: schema stays at v1, no migration. Saves predating this change have no `'elite'` nodes (their floor was generated before the variant existed). New saves on a fork-shape that includes elite naturally serialize the elite variant. Saves predating the `rollLoot` API rename don't matter — `rollLoot` is called fresh on each combat completion, never serialized.

## 9 · Open questions

None at design time. Numerical knobs (`ELITE_HP_MULT = 1.5`, `ELITE_ATTACK_MULT = 1.25`, `ELITE_NODE_GOLD = 30`, the 1/3 fork-shape weighting) are tuneable later from the constants without touching the data shape.
