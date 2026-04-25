# Floor Generation — The Crypt (Tier 1)

**Status:** Design · **Date:** 2026-04-24 · **Source TODO:** Cluster A, task 5

## Purpose

Generate linear floors for The Crypt — 3 combat nodes + 1 boss node — with per-node enemy encounters drawn from the Crypt pool and flat +10%/floor stat scaling. The output is pure data: consumed downstream by run state (task 6) to materialize Combatants and by the dungeon scene (task 16) to render the floor layout.

Scope is deliberately minimal: no forks, no shops, no events, no camp nodes (all Tier 2+). The floor structure is fixed at `[combat, combat, combat, boss]`; the contents are rolled.

## Dependencies and invariants

**Vocabulary from tasks 2–3:**
- `EnemyId`, `EnemyDef`, `CombatantTag`, `SlotIndex`, `ENEMIES`.
- `CRYPT_POOL`, `CRYPT_BOSS`.
- `preferredSlots` hint on `EnemyDef` — the encounter composer reads this to classify enemies as front-liners vs back-liners.

**From `src/util/rng`:**
- `rng.pick(array)`, `rng.weighted(options)`, deterministic for a given seed.

**Invariants this spec declares:**
- Encounter composition follows a fixed RNG consumption order (size → enemy picks → optional front-liner re-roll). Determinism guaranteed for given `(dungeonId, floorNumber, seed)`.
- Scaling is applied multiplicatively to HP and Attack only. Defense and Speed do not scale in Tier 1.
- The floor generator does not create `Combatant` instances. It produces `Node[]` containing enemy ids + slot placements + scale factors. Conversion to Combatants happens at fight-start time (task 6's run state).

## Module layout

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/data/types.ts` | Modify | Add `DungeonId` literal union + `DungeonDef` interface. |
| `src/data/dungeons.ts` | Create | `DUNGEONS` registry (Crypt only for Tier 1). |
| `src/dungeon/node.ts` | Create | `Node` discriminated union, `Encounter`, `EnemyPlacement`, `ScaleFactors`. |
| `src/dungeon/scaling.ts` | Create | `floorScale(floorNumber)` — pure math. |
| `src/dungeon/encounter.ts` | Create | `composeCombatEncounter`, `composeBossEncounter`. Handles pool filtering, front-liner constraint, slot assignment. |
| `src/dungeon/floor.ts` | Create | `generateFloor(dungeonId, floorNumber, rng)` — thin orchestrator. |
| `src/data/__tests__/dungeons.test.ts` | Create | Data-integrity checks. |
| `src/dungeon/__tests__/scaling.test.ts` | Create | Exact scale values + error cases. |
| `src/dungeon/__tests__/encounter.test.ts` | Create | Determinism, size distribution, front-liner guarantee, slot assignment. |
| `src/dungeon/__tests__/floor.test.ts` | Create | Structure, scale propagation, boss placement, determinism. |

**Import boundary:** `src/dungeon/` imports from `src/data/` and `src/util/rng`. Does NOT import from `src/combat/` — floor generation produces data, not Combatants. The run state layer (task 6) is what bridges dungeon data and combat state. No phaser.

## Types

```ts
// src/data/types.ts — additions

export type DungeonId = 'crypt';

export interface DungeonDef {
  id: DungeonId;
  name: string;
  theme: string;
  floorLength: number;         // number of non-boss nodes per floor; 3 for Crypt
  enemyPool: readonly EnemyId[];
  bossId: EnemyId;
}
```

```ts
// src/dungeon/node.ts

import type { EnemyId, SlotIndex } from '../data/types';

export interface ScaleFactors {
  hp: number;                  // multiplier applied to maxHp and currentHp at spawn
  attack: number;              // multiplier applied to baseStats.attack at spawn
}

export interface EnemyPlacement {
  enemyId: EnemyId;
  slot: SlotIndex;
}

export interface Encounter {
  enemies: readonly EnemyPlacement[];
  scale: ScaleFactors;
}

export type Node =
  | { id: string; type: 'combat'; encounter: Encounter }
  | { id: string; type: 'boss'; encounter: Encounter };

export type NodeType = Node['type'];
```

**Type notes:**

- `scale` lives on the `Encounter`, not the `Node`. Every encounter on the same floor has the same scale, but duplicating it keeps the encounter self-describing — the run-state layer can build Combatants from an `Encounter` alone without needing to know which floor it came from.
- `Node.id` is a stable string (`'crypt-f1-n0'`, `'crypt-f1-boss'`). Zero consumers read it in Tier 1, but it's cheap insurance for save state / event logging later.
- `type: 'boss'` is a semantic flag for the dungeon scene (boss music, terminate floor). The `Encounter` shape is identical to combat; consumers that don't care about UI flair can treat both node types the same.

## Dungeon data

```ts
// src/data/dungeons.ts

import { CRYPT_BOSS, CRYPT_POOL } from './enemies';
import type { DungeonDef, DungeonId } from './types';

export const DUNGEONS: Record<DungeonId, DungeonDef> = {
  crypt: {
    id: 'crypt',
    name: 'The Crypt',
    theme: 'Undead ruins',
    floorLength: 3,
    enemyPool: CRYPT_POOL,
    bossId: CRYPT_BOSS,
  },
};
```

One entry in Tier 1. Tier 3 adds Sunken Keep / Warren / Abyss by extending the `DungeonId` union and appending entries.

## Scaling

```ts
// src/dungeon/scaling.ts

import type { ScaleFactors } from './node';

export function floorScale(floorNumber: number): ScaleFactors {
  if (floorNumber < 1) {
    throw new Error(`floorScale: floorNumber must be >= 1, got ${floorNumber}`);
  }
  const mult = 1 + 0.1 * (floorNumber - 1);
  return { hp: mult, attack: mult };
}
```

**Formula:** `mult = 1 + 0.1 × (floorNumber - 1)`. Linear, +10% per floor.

- Floor 1: 1.0× (no scaling)
- Floor 5: 1.4×
- Floor 10: 1.9×
- Floor 20: 2.9×

Applied multiplicatively: `scaledHp = round(baseHp × scale.hp)`, `scaledAttack = round(baseAttack × scale.attack)`. The run state layer performs the rounding when constructing Combatants. `scaling.ts` provides the raw factors; consumers round at apply time.

Defense and Speed are unscaled in Tier 1. If Tier 2 introduces "Armored" or "Enraged" enemy modifiers, they arrive as a separate additive layer — not a change to `floorScale`.

## Encounter composer

### Front-liner classification

```ts
function isFrontLiner(enemyId: EnemyId): boolean {
  const preferred = ENEMIES[enemyId].preferredSlots;
  return preferred.some((s) => s === 1 || s === 2);
}
```

A front-liner is any enemy whose `preferredSlots` includes slot 1 or 2. In the Crypt pool: `skeleton_warrior` and `ghoul`. Back-liners: `skeleton_archer` and `cultist` (preferredSlots `[3, 4]`).

### Combat encounter composition

```ts
const ENCOUNTER_SIZE_WEIGHTS = [
  { value: 2, weight: 20 },
  { value: 3, weight: 60 },
  { value: 4, weight: 20 },
];

export function composeCombatEncounter(
  pool: readonly EnemyId[],
  scale: ScaleFactors,
  rng: Rng,
): Encounter
```

Procedure:

1. **Size roll:** `size = rng.weighted(ENCOUNTER_SIZE_WEIGHTS)`. Values: 2 (20%), 3 (60%), 4 (20%).
2. **Initial picks:** call `rng.pick(pool)` `size` times. Duplicates allowed — a fight with 2 skeleton warriors is valid.
3. **Front-liner guarantee:** if no pick is a front-liner, replace `picks[0]` with `rng.pick(frontPool)` where `frontPool = pool.filter(isFrontLiner)`. Consumes one additional RNG call only when the guarantee triggers. Rationale: all-back-liner encounters soft-lock because back-liners in slot 1 can't cast their moves and shuffle forever.
4. **Slot assignment** (see below).

### Boss encounter composition

```ts
export function composeBossEncounter(
  bossId: EnemyId,
  pool: readonly EnemyId[],
  scale: ScaleFactors,
  rng: Rng,
): Encounter
```

Procedure:

1. **Minion 1 (slot 1):** `rng.pick(pool.filter(isFrontLiner))` — guaranteed front-liner, the boss's meat shield.
2. **Minion 2 (slot 2):** `rng.pick(pool)` — uniform from full pool.
3. **Boss (slot 3):** `bossId`.

Fixed 3-combatant total. Boss placement is hardcoded to slot 3 for Tier 1; future dungeons that want a 4-combatant boss fight will need their own composer or parameterization.

### Slot assignment

```ts
function assignSlots(enemies: readonly EnemyId[]): EnemyPlacement[]
```

Procedure:

- **Front-liners fill ascending slots from 1:** slot 1, then 2, ...
- **Back-liners fill descending slots from N:** slot N, then N-1, ...
- Meet in the middle; densely packed (no gaps, no duplicates).
- Final array sorted by slot ascending so callers see visual left-to-right order.

Examples with 3-enemy encounter (N = 3):

- 2 front + 1 back: `[front@1, front@2, back@3]`
- 1 front + 2 back: `[front@1, back@2, back@3]`
- 3 front + 0 back: `[front@1, front@2, front@3]`
- 0 front + 3 back: **impossible** — front-liner guarantee prevents this.

Back-liners at slot 2 are mechanically fine: `bone_arrow` and `dark_bolt` both have `canCastFrom: [2, 3, 4]`.

## Floor generator

```ts
// src/dungeon/floor.ts

export function generateFloor(
  dungeonId: DungeonId,
  floorNumber: number,
  rng: Rng,
): Node[]
```

Procedure:

1. Look up `dungeon = DUNGEONS[dungeonId]`.
2. Compute `scale = floorScale(floorNumber)`.
3. For `i` from 0 to `dungeon.floorLength - 1`:
   - Append `{ id: 'crypt-f<floor>-n<i>', type: 'combat', encounter: composeCombatEncounter(dungeon.enemyPool, scale, rng) }`.
4. Append `{ id: 'crypt-f<floor>-boss', type: 'boss', encounter: composeBossEncounter(dungeon.bossId, dungeon.enemyPool, scale, rng) }`.
5. Return the array.

**RNG consumption order (deterministic):** for Crypt with `floorLength: 3`, the RNG is consumed in this order:

1. Combat node 0: size roll → `size` enemy picks → maybe 1 front-liner re-roll.
2. Combat node 1: size roll → picks → maybe re-roll.
3. Combat node 2: size roll → picks → maybe re-roll.
4. Boss node: 1 minion-1 pick → 1 minion-2 pick.

A different seed produces a different floor; the same seed reproduces exactly.

## Tests

### `src/data/__tests__/dungeons.test.ts`

- `DUNGEONS['crypt']` exists with `id: 'crypt'`.
- `floorLength > 0` and finite.
- `enemyPool` is non-empty; every entry exists in `ENEMIES`.
- `bossId` exists in `ENEMIES` and has `role: 'boss'`.

### `src/dungeon/__tests__/scaling.test.ts`

- `floorScale(1)` → `{ hp: 1.0, attack: 1.0 }` (exact).
- `floorScale(2)` → `{ hp: 1.1, attack: 1.1 }` (`toBeCloseTo` to tolerate FP).
- `floorScale(10)` → `{ hp: 1.9, attack: 1.9 }`.
- `floorScale(0)` throws; `floorScale(-1)` throws.

### `src/dungeon/__tests__/encounter.test.ts`

- **Determinism:** same seed + same pool + same scale → identical encounter.
- **Size bounds:** over 1000 rolls, observed sizes ⊆ `{2, 3, 4}`; none outside.
- **Front-liner guarantee:** using a seed empirically known to roll an initial all-back-liner draw, the returned encounter has ≥1 front-liner.
- **Slot assignment — 2 front + 1 back:** expected `[front@1, front@2, back@3]`.
- **Slot assignment — 1 front + 2 back:** expected `[front@1, back@2, back@3]`.
- **Slot assignment — 2 enemies:** slots `[1, 2]` densely; no gaps.
- **Slot assignment — 4 enemies:** slots `[1, 2, 3, 4]` densely.
- **No duplicates:** every encounter's slots are unique.
- **Boss encounter shape:** 3 placements; slot 3 is the boss; slot 1 is a front-liner; slot 2 is any pool member.

### `src/dungeon/__tests__/floor.test.ts`

- **Determinism:** same `(dungeonId, floorNumber, seed)` → identical `Node[]`.
- **Structure:** Crypt floor 1 produces 4 nodes: `[combat, combat, combat, boss]`.
- **Boss always last:** `nodes[nodes.length - 1].type === 'boss'`.
- **Scale propagation:** every encounter on floor N has `scale.hp === floorScale(N).hp` and same for `attack`.
- **Unique ids within a floor:** no two nodes share an `id`.
- **Pool integrity:** every enemy in every combat encounter is a member of `CRYPT_POOL`.
- **Boss identity:** the boss encounter contains `bone_lich` at slot 3.

Behavioral tests for run-through (walking the floor, consuming nodes, resolving combat) belong to task 6, not this task.

## Risks and follow-ups

- **No enemy HP variance within a floor.** All enemies in all encounters on floor N share the same scale. Tier 2 milestone modifiers (Armored, Venomous, Enraged) will layer on top.
- **Scaling rounding timing.** `floorScale` returns raw multipliers; the run state layer (task 6) rounds when constructing Combatants. Rounding earlier (inside `composeCombatEncounter`) would bake scaling into the encounter data and obscure the raw factor — kept separate so the factor is inspectable.
- **Pool weighting is uniform.** Task 3 left weighting as a "later" optimization. Balance playtesting may reveal that skeleton_archer needs to be rarer (ranged damage compounds in AoE) or that ghoul's debuff is too common. Uniform is the honest starting point.
- **Boss-fight size is fixed at 3.** Sunken Keep (tier 2) may want 4-combatant boss fights to match its 4-node floor feel. Handle by adding a `bossEncounterSize` field to `DungeonDef` when it matters.
- **No branching / forks.** A major Tier 2 feature. When forks land, `generateFloor` returns a `Node` graph (not a list), and `Node` gains a `nextNodeIds: string[]` field. Rework here is contained.
- **Run state layer owns scale application.** Task 6 will define how `Encounter` + `ScaleFactors` → `Combatant[]`. That's where rounding, combatantId assignment, and the final `CombatState` construction happen.
