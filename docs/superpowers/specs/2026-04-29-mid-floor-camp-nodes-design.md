# Mid-floor camp nodes — Design

- **TODO entry:** Cluster A · 11 (Mid-floor camp nodes).
- **Tier:** 2.
- **Date:** 2026-04-29.

## 1 · Scope

Add a new `'camp'` Node variant to the dungeon graph as a fork-branch type. Players landing on a camp node choose one of three effects:

- **Heal Party** — every living hero recovers 25% of `maxHp` (capped at `maxHp`).
- **Treat Wound** — player picks one hero + one specific wound from that hero; the wound is removed.
- **Leave Dungeon** — full cashout (pack banks to vault, survivors return, status `'ended'`). Identical reward path to post-boss cashout. **No conditions** — works on floor 1 before any boss is beaten. This is a deliberate override of gdd §4's "cannot cash out from camp node."

### Out of scope

- **Sharpen weapons** — the gdd's third camp option. Requires a "buff for next combat" mechanic that doesn't exist anywhere in the codebase yet. Designing temp-buffs in service of one use case risks an awkward shape; defer to a future task that has a real driver.
- **Picker UI overlay** — Cluster B · 4 covers it. Until B · 4 lands, the dungeon scene auto-applies `heal_party` and advances. Pattern matches the shop auto-leave stub used pre-B · 3.

## 2 · Architecture

### 2.1 · `Node` union gains `'camp'` variant

In `src/dungeon/node.ts`:

```ts
export type Node =
  | { id: string; type: 'combat'; encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'elite';  encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'boss';   encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'shop';   inventory: readonly ShopItem[]; nextNodeIds: readonly string[] }
  | { id: string; type: 'camp';   nextNodeIds: readonly string[] };
```

No `encounter`, no `inventory` — camp is non-combat. Same shape pattern as shop's lack of encounter.

### 2.2 · `camp_node.ts` module

New `src/dungeon/camp_node.ts`:

```ts
import type { Wound } from '../data/types';
import type { Hero } from '../heroes/hero';
import type { Rng } from '../util/rng';
import type { RunState } from '../run/run_state';

export type CampNodeChoice =
  | { kind: 'heal_party' }
  | { kind: 'treat_wound'; heroIndex: number; woundIndex: number }
  | { kind: 'leave' };

export const HEAL_PARTY_PERCENT = 0.25;

export function applyCampNodeEffect(
  runState: RunState,
  choice: Exclude<CampNodeChoice, { kind: 'leave' }>,
  rng: Rng,
): RunState;
```

- `'heal_party'`: maps `runState.party`, each hero gets `currentHp = min(maxHp, currentHp + round(maxHp * HEAL_PARTY_PERCENT))`. Heroes with `currentHp <= 0` are not in `party` (they're in `fallen` after combat resolution), so the "living only" filter is implicit.
- `'treat_wound'`: validates `heroIndex` is in range and `woundIndex` is in the hero's wounds array; splices the wound out. Throws on invalid indices or empty wounds array.
- `'leave'` is **not handled here** — handled by `chooseCampNodeEffect` in `run_state.ts` because cashout requires the cashout code path which lives in `run_state.ts`. Keeps `camp_node.ts` free of `cashout` import.

The `rng: Rng` parameter is reserved for future variance (e.g. random wound selection if we add an "auto-pick wound" mode). No current effect consumes RNG; the parameter exists for API parity with other apply-effect functions in the codebase.

### 2.3 · `chooseCampNodeEffect` on RunState

In `src/run/run_state.ts`:

```ts
export function chooseCampNodeEffect(
  runState: RunState,
  choice: CampNodeChoice,
  rng: Rng,
): { runState: RunState; outcome?: CashoutOutcome };
```

- Validates `runState.status === 'in_dungeon'` and `currentNode(runState).type === 'camp'`. Throws otherwise.
- For `'heal_party'` / `'treat_wound'`: calls `applyCampNodeEffect`, then advances `currentNodeId` to `currentNode.nextNodeIds[0]`. Camp branches always have a single fanout (to boss), so `nextNodeIds.length === 1`.
- For `'leave'`: delegates to `cashout()`. Returns `{ runState, outcome }` where outcome is the existing `CashoutOutcome` shape.

## 3 · Cashout-from-camp: relaxing `cashout()`

Today `cashout()` throws if `status !== 'camp_screen'`. Loosen to:

```ts
export function cashout(runState: RunState): { runState: RunState; outcome: CashoutOutcome } {
  const atCamp = runState.status === 'in_dungeon' &&
                 currentNode(runState).type === 'camp';
  if (runState.status !== 'camp_screen' && !atCamp) {
    throw new Error(`cashout: must be at camp_screen or camp node, got status='${runState.status}'`);
  }
  // existing body unchanged
  const outcome: CashoutOutcome = {
    goldBanked: totalGold(runState.pack),
    itemsBanked: runState.pack.items,
    heroesReturned: runState.party,
    heroesLost: runState.fallen,
  };
  return {
    runState: { ...runState, status: 'ended' },
    outcome,
  };
}
```

This is a deliberate behavioral expansion to a stable API. Two existing callers (`camp_screen_scene.ts` and the existing `cashout` tests) keep working as-is — they always call cashout from `'camp_screen'` status, which remains valid.

## 4 · Floor generation: 6-shape fork RNG

In `src/dungeon/floor.ts`, expand the fork-shape enum from 3 to 6:

```ts
type ForkShape =
  | 'shop_vs_combat'
  | 'elite_vs_combat'
  | 'elite_vs_shop'
  | 'camp_vs_combat'
  | 'camp_vs_shop'
  | 'camp_vs_elite';

const FORK_SHAPE_WEIGHTS: readonly WeightedOption<ForkShape>[] = [
  { value: 'shop_vs_combat',  weight: 1 },
  { value: 'elite_vs_combat', weight: 1 },
  { value: 'elite_vs_shop',   weight: 1 },
  { value: 'camp_vs_combat',  weight: 1 },
  { value: 'camp_vs_shop',    weight: 1 },
  { value: 'camp_vs_elite',   weight: 1 },
];
```

Uniform 1/6 weighting. Each branch type appears in ~50% of floors (3 of 6 shapes contain it).

**Behavioral note:** existing fork shapes drop from 1/3 to 1/6 frequency. Players will see shop-vs-combat (and other existing shapes) half as often as before. Acceptable for Tier 2; tunable later via the weights array.

### 4.1 · RNG-consumption order

Order inside `generateFloor` after the change:

1. `shape` weighted-roll (now 6 outcomes).
2. `specialOnBranchA` boolean.
3. Preamble n0, n1 combat encounters (unchanged).
4. **Conditionally**: combat-fork-branch encounter (only for `shop_vs_combat`, `elite_vs_combat`, `camp_vs_combat`).
5. **Conditionally**: elite encounter (only for shapes with elite).
6. **Conditionally**: shop inventory (only for shapes with shop).
7. Boss encounter (unchanged).

Camp nodes consume no RNG beyond the shape roll. Their construction is pure data: `{ id, type: 'camp', nextNodeIds: [idBoss] }`.

The shape weighted-roll itself stays a single RNG draw (just a 6-way weighted-pick instead of 3-way), so existing seed-stable tests for floors that rolled into a non-camp shape may shift expectations slightly. Tests that hand-search for a specific shape via the `findFloorWithShape` helper (added in elites task) need expanding to know about camp shapes; the helper extends to 6 shapes by adding the same matches-on-types checks.

### 4.2 · `specialOnBranchA` mapping for new shapes

For consistency with the elite task's pinned-rule pattern:

- `camp_vs_combat`: `specialOnBranchA = true` → branch A is camp.
- `camp_vs_shop`:   `specialOnBranchA = true` → branch A is camp.
- `camp_vs_elite`:  `specialOnBranchA = true` → branch A is camp (elite on B).

Camp is the "more distinguished" node in all three cases.

## 5 · Dungeon-scene stub

`src/scenes/dungeon_scene.ts` `handleArrival` gains a third branch for `'camp'`:

```ts
if (node.type === 'camp') {
  // Stub: auto-apply heal_party and advance. Cluster B · 4 replaces this
  // with the picker overlay launch.
  const rng = createRngFromState(state.runRngState);
  const result = chooseCampNodeEffect(run, { kind: 'heal_party' }, rng);
  appState.update({ runState: result.runState, runRngState: rng.getState() });
  this.startWalkingToNextNode();
  return;
}
```

(Exact plumbing — rng creation, app-state persistence, transition method name — matches how shop's auto-leave stub was wired in Cluster A · 9. Implementation reads the existing pattern.)

The `'camp'` branch must run **before** the `startCombatAtCurrentNode()` fallthrough, since camp is non-combat.

`buildNodes` glyph mapping gets a `'camp'` case:

```ts
const glyph =
  node.type === 'boss'  ? '☠' :
  node.type === 'shop'  ? '🛒' :
  node.type === 'elite' ? '💀' :
  node.type === 'camp'  ? '🏕' :
  '⚔';
```

`refreshNodeColors` doesn't add a camp-specific color in this task — camp uses the default future-state grey `#888888` like combat and shop. Cluster B · 4 may refine.

## 6 · Combat-scene defensive guard

`src/scenes/combat_scene.ts` `create` currently early-returns on `'shop'` with a defensive warning. Add the same for `'camp'`:

```ts
if (node.type === 'shop' || node.type === 'camp') {
  console.warn(`CombatScene entered with non-combat node type '${node.type}'; returning to dungeon`);
  this.scene.start('dungeon');
  return;
}
```

This should never fire in production once the auto-leave stub is in place, but defends against state-machine bugs and keeps the type narrowing clean.

## 7 · Test plan

### `src/dungeon/__tests__/camp_node.test.ts` (new)

- `applyCampNodeEffect({ kind: 'heal_party' })`:
  - Each living hero's currentHp gains `round(maxHp * 0.25)`.
  - Heroes already at max stay at max (no overflow).
  - Heroes at exactly maxHp - 1 with maxHp = 20 → +5 → 20 (no overflow).
  - Heroes in `runState.fallen` are not touched (only `runState.party` is the input).
- `applyCampNodeEffect({ kind: 'treat_wound', heroIndex, woundIndex })`:
  - Removes the wound at the specified position; other wounds intact; other heroes unchanged.
  - Throws on `heroIndex` out of range.
  - Throws on `woundIndex` out of range for the hero's wounds array.
  - Throws if hero has empty wounds array.
- Determinism: same input → same output (no RNG dependency in current effects).

### `src/dungeon/__tests__/floor.test.ts` (extend)

- Across N=600 seeds, all 6 shapes appear with at least 60 occurrences each (10% lower bound; expected ~100 = 1/6).
- `camp_vs_combat` shape: branches sort to `['camp', 'combat']`.
- `camp_vs_shop` shape: branches sort to `['camp', 'shop']`.
- `camp_vs_elite` shape: branches sort to `['camp', 'elite']`.
- Update `findFloorWithShape` helper to handle the 3 new shape names.
- Existing distribution test (the 3-shape variant from elite task) is replaced by the 6-shape test above.

### `src/run/__tests__/run_state.test.ts` (extend)

- `chooseCampNodeEffect({ kind: 'heal_party' })`: advances `currentNodeId` to next; party HP is healed.
- `chooseCampNodeEffect({ kind: 'treat_wound', ... })`: advances and removes the wound; throws on invalid indices.
- `chooseCampNodeEffect({ kind: 'leave' })` from a camp node: returns `outcome`; status is `'ended'`; pack is empty post-cashout (banked).
- `chooseCampNodeEffect` throws if currentNode is not `'camp'`.
- `cashout()` accepts `in_dungeon` + camp currentNode (no throw); other in_dungeon states still throw.
- Existing `cashout()` tests for `'camp_screen'` status stay green unchanged.
- `advanceToBossNode` test helper updated to walk through camp nodes via `chooseCampNodeEffect({ kind: 'heal_party' }, …)`.

## 8 · Files touched

| File | Change |
|---|---|
| `src/dungeon/node.ts` | Extend `Node` union with `'camp'` variant. |
| `src/dungeon/camp_node.ts` | **New.** `CampNodeChoice` types, `applyCampNodeEffect`, `HEAL_PARTY_PERCENT`. |
| `src/dungeon/floor.ts` | Expand `ForkShape` enum to 6 shapes; add `usesCampBranch` flag and conditional camp-branch construction (no encounter draw). |
| `src/run/run_state.ts` | New `chooseCampNodeEffect`; relax `cashout()` status guard. |
| `src/scenes/dungeon_scene.ts` | New `'camp'` branch in `handleArrival` (auto-leave stub) + `'🏕'` glyph mapping. |
| `src/scenes/combat_scene.ts` | Extend defensive early-return to include `'camp'`. |
| `src/dungeon/__tests__/camp_node.test.ts` | **New.** Per §7. |
| `src/dungeon/__tests__/floor.test.ts` | Extend `findFloorWithShape` to 6 shapes; new shape-coverage tests; loosen distribution lower bound to 60 / 600. |
| `src/run/__tests__/run_state.test.ts` | New camp-effect tests; update `advanceToBossNode` to walk through camp; new cashout-from-camp tests. |

## 9 · Save schema

Pre-launch policy holds: schema stays at v1, no migration. Saves predating this change have no `'camp'` nodes; new saves on a camp-bearing fork-shape carry the variant naturally. The `cashout()` guard relaxation is loader-irrelevant — it runs at call time, not on save shape.

## 10 · Open questions

None at design time. Numerical knobs (`HEAL_PARTY_PERCENT = 0.25`, `1/6` shape weighting) are tuneable from the named constants without touching the data shape.
