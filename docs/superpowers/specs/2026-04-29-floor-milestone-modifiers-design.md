# Floor-milestone enemy modifiers — Design

- **TODO entry:** Cluster A · 12 (Floor-milestone enemy modifiers).
- **Tier:** 2.
- **Date:** 2026-04-29.

## 1 · Scope

Add three enemy modifiers — **Armored**, **Venomous**, **Enraged** — that stamp on individual enemy combatants based on floor and node type. Modifier effects apply during combat resolution; the player learns them by playing.

**Stamping rules:**

- **Combat encounters:** modifier pool unlocks at floor milestones.
  - Floor 1–4: no pool, no modifiers.
  - Floor 5–9: `['armored']`.
  - Floor 10–14: `['armored', 'venomous']`.
  - Floor 15+: `['armored', 'venomous', 'enraged']`.
  - Each enemy on a milestone-or-later floor receives **one** rolled modifier from the available pool.
- **Elite encounters:** every enemy gets one rolled modifier from the **full 3-modifier pool**, regardless of floor. This is the "elites preview the deeper mechanics" design lever — also fulfills the "stamps a modifier" piece deferred from Cluster A · 10.
- **Bosses:** no modifiers. Bosses are bespoke encounters; mixing modifiers in is out of scope.

**Out of scope:**

- Visual badges / icons on enemy combatants in the combat scene.
- Modifier-on-modifier interactions; only one modifier per enemy in this task.
- Modifier-stacking, cleansing, or player-side counterplay beyond the existing combat mechanics.
- Refactor of `Combatant`'s optional-passive-fields into a `passives` bag — the in-code comment "candidates for consolidation once 3+ more land" is a flag, not a mandate. After this task lands, `Combatant` gains 4 more optional fields (`venomousDamage`, `venomousDuration`, `enragedThreshold`, `enragedAttackDelta`). The consolidation refactor is reasonable future work but is unrelated to the user-visible goal here; deferred.

## 2 · Modifier definitions

New `src/data/modifiers.ts`:

```ts
import type { BuffableStat } from './types';

export type ModifierId = 'armored' | 'venomous' | 'enraged';

export type ModifierEffect =
  | { kind: 'statDelta'; stat: BuffableStat; delta: number }                              // Armored
  | { kind: 'venomous_on_hit'; damagePerTurn: number; duration: number }                  // Venomous
  | { kind: 'enraged_threshold'; hpRatio: number; attackDelta: number };                   // Enraged

export interface ModifierDef {
  id: ModifierId;
  name: string;
  effect: ModifierEffect;
}

export const MODIFIERS: Record<ModifierId, ModifierDef> = {
  armored:  { id: 'armored',  name: 'Armored',  effect: { kind: 'statDelta',           stat: 'defense', delta: 2 } },
  venomous: { id: 'venomous', name: 'Venomous', effect: { kind: 'venomous_on_hit',     damagePerTurn: 2, duration: 2 } },
  enraged:  { id: 'enraged',  name: 'Enraged',  effect: { kind: 'enraged_threshold',   hpRatio: 0.5, attackDelta: 3 } },
};

export const MODIFIER_IDS: readonly ModifierId[] = Object.keys(MODIFIERS) as ModifierId[];
```

**Numerical knobs** — tuned for Crypt-floor stat ranges (enemy base attack 3–5, defense 1–3):

- Armored: `+2 defense` (~doubles or triples a Crypt enemy's natural defense).
- Venomous: `2 damage/turn` for `2 turns` (a fixed 4-damage residual hit, ignoring target Defense like other poison effects).
- Enraged: at `<50% HP`, `+3 flat attack` (Crypt enemy attack 3–5 + 3 ≈ 60–100% increase when wounded).

**Enraged is flat `+3 attack`, not a percentage.** Applied via the existing `getEffectiveStat` stat-addition pattern. Percentage scaling would require a multi-step compute that doesn't fit the current statDelta-style architecture; flat is sufficient at Tier 2.

## 3 · Encounter data shape

Extend `EnemyPlacement` (`src/dungeon/node.ts`):

```ts
export interface EnemyPlacement {
  enemyId: EnemyId;
  slot: SlotIndex;
  modifierIds?: readonly ModifierId[];  // NEW — undefined or empty = unmodified
}
```

`modifierIds` is an array (forward-compatible for future multi-modifier stacking) but only ever populated with 0 or 1 entries today.

## 4 · Stamping logic

New helper module `src/dungeon/modifier_stamp.ts`:

```ts
import type { ModifierId } from '../data/modifiers';
import { MODIFIER_IDS } from '../data/modifiers';
import type { Rng } from '../util/rng';
import type { EnemyPlacement } from './node';

export function poolForFloor(floorNumber: number): readonly ModifierId[] {
  if (floorNumber < 5)  return [];
  if (floorNumber < 10) return ['armored'];
  if (floorNumber < 15) return ['armored', 'venomous'];
  return ['armored', 'venomous', 'enraged'];
}

export function fullPool(): readonly ModifierId[] {
  return MODIFIER_IDS;
}

export function rollModifier(pool: readonly ModifierId[], rng: Rng): ModifierId | undefined {
  if (pool.length === 0) return undefined;
  return rng.pick(pool);
}

export function stampCombatModifiers(
  enemies: readonly EnemyPlacement[],
  floorNumber: number,
  rng: Rng,
): EnemyPlacement[] {
  const pool = poolForFloor(floorNumber);
  if (pool.length === 0) return [...enemies];
  return enemies.map((p) => ({ ...p, modifierIds: [rng.pick(pool)] }));
}

export function stampEliteModifiers(
  enemies: readonly EnemyPlacement[],
  rng: Rng,
): EnemyPlacement[] {
  const pool = fullPool();
  return enemies.map((p) => ({ ...p, modifierIds: [rng.pick(pool)] }));
}
```

`floor.ts` calls the appropriate stamper after each encounter is built:

- After `composeCombatEncounter` for n0 / n1 / combat-fork-branch: `stampCombatModifiers(enc.enemies, floorNumber, rng)`.
- After `composeEliteEncounter` (when used): `stampEliteModifiers(enc.enemies, rng)`.
- Boss encounter is left untouched.

The stamper returns a fresh `EnemyPlacement[]`. The encounter object's `enemies` field is then replaced with the stamped array.

### 4.1 · RNG-consumption order

Stamping consumes RNG (one `rng.pick(pool)` per enemy in modified encounters). Drawn after the encounter is built. Order inside `generateFloor` after the change:

1. `shape` weighted-roll (existing).
2. `specialOnBranchA` boolean (existing).
3. Preamble n0 encounter (existing) → stamp n0 modifiers.
4. Preamble n1 encounter (existing) → stamp n1 modifiers.
5. Conditional combat-fork-branch encounter → stamp modifiers.
6. Conditional elite encounter → stamp elite modifiers.
7. Conditional shop inventory (no stamping).
8. Boss encounter (no stamping).

Stamping draws **one rng.pick per enemy**. So a 4-enemy elite consumes 4 draws after the encounter is composed. Existing seed-stable tests for floors that don't trigger any stamping (floor 1–4 combat-only) stay byte-identical. Tests asserting full-floor RNG-stable output for floor 5+ may shift — `findFloorWithShape` and shape-distribution tests are agnostic and keep working.

## 5 · Combat resolution wiring

Three sites in the combat code update — one per modifier kind.

### 5.1 · Armored — stat injection in `combat_setup.ts`

After `scaleEnemyStats`, apply modifier `statDelta` effects to the scaled stats:

```ts
import { MODIFIERS, type ModifierId } from '../data/modifiers';

function applyModifiersToStats(base: Stats, modifierIds: readonly ModifierId[] | undefined): Stats {
  if (!modifierIds || modifierIds.length === 0) return base;
  const result: Stats = { ...base };
  for (const id of modifierIds) {
    const effect = MODIFIERS[id].effect;
    if (effect.kind === 'statDelta') {
      result[effect.stat] += effect.delta;
    }
  }
  return result;
}
```

Called inline in the enemy-build loop in `buildCombatState`, after `scaleEnemyStats`. Mirror of `applyWoundsToStats` for heroes.

### 5.2 · Venomous — new `Combatant` fields + `effects.ts` block

Add to `src/combat/types.ts` `Combatant` interface:

```ts
venomousDamage?: number;    // damage-per-turn for poison applied on hit
venomousDuration?: number;  // duration in turns (typically 2)
```

In `src/run/combat_setup.ts`, when building enemy combatants, if `'venomous'` is in `modifierIds`, set both fields from `MODIFIERS.venomous.effect`.

In `src/combat/effects.ts`, after the existing `burningWeaponDamage` block (around line 72), add a parallel block:

```ts
if (caster.venomousDamage !== undefined && !lethal) {
  const duration = caster.venomousDuration ?? 2;
  target.statuses['poisoned'] = {
    statusId: 'poisoned',
    remainingTurns: duration,
    effect: { kind: 'poison', damagePerTurn: caster.venomousDamage, duration, statusId: 'poisoned' },
    sourceId: caster.id,
  };
  events.push({
    kind: 'status_applied',
    sourceId: caster.id,
    targetId: target.id,
    statusId: 'poisoned',
    duration,
  });
}
```

**Status ID note:** `'poisoned'` is already in the `StatusId` type (used by status tests). The `'burning'` and `'poisoned'` keys in `combatant.statuses` are independent; an enemy hit by both a Burning weapon and a Venomous attacker accumulates both statuses concurrently.

**Lethal-hit consistency:** mirroring the burning-weapon convention, Venomous does not apply poison on a killing blow.

### 5.3 · Enraged — runtime read in `getEffectiveStat`

Add to `src/combat/types.ts` `Combatant` interface:

```ts
enragedThreshold?: number;    // hp ratio below which enraged kicks in (e.g. 0.5)
enragedAttackDelta?: number;  // attack bonus when enraged is active
```

In `src/run/combat_setup.ts`, when building enemy combatants, if `'enraged'` is in `modifierIds`, set both fields from `MODIFIERS.enraged.effect`.

In `src/combat/statuses.ts` `getEffectiveStat`, after the existing perk block (around line 39), add:

```ts
if (
  stat === 'attack' &&
  combatant.enragedThreshold !== undefined &&
  combatant.enragedAttackDelta !== undefined &&
  combatant.maxHp > 0 &&
  combatant.currentHp / combatant.maxHp < combatant.enragedThreshold
) {
  total += combatant.enragedAttackDelta;
}
```

The check fires per-attack-resolution. As the enemy takes damage and crosses the threshold, future Attack reads pick up the bonus automatically. The `< combatant.enragedThreshold` is strict less-than: at exactly 50% HP the bonus is **not** active; below 50% it kicks in.

## 6 · Test plan

### `src/data/__tests__/modifiers.test.ts` (new)

- `MODIFIERS.armored` has `effect.kind === 'statDelta'`, `stat: 'defense'`, `delta: 2`.
- `MODIFIERS.venomous` has `effect.kind === 'venomous_on_hit'`, `damagePerTurn: 2`, `duration: 2`.
- `MODIFIERS.enraged` has `effect.kind === 'enraged_threshold'`, `hpRatio: 0.5`, `attackDelta: 3`.
- `MODIFIER_IDS` contains exactly the three IDs in some order.

### `src/dungeon/__tests__/modifier_stamp.test.ts` (new)

- `poolForFloor(N)`: returns `[]` for N=1, 4; `['armored']` for N=5, 9; `['armored','venomous']` for N=10, 14; `['armored','venomous','enraged']` for N=15, 30.
- `fullPool()` returns all three IDs.
- `rollModifier([], rng)` returns `undefined`.
- `rollModifier(pool, rng)` returns a member of the pool.
- `stampCombatModifiers` on floor 4 returns input enemies with no `modifierIds` set.
- `stampCombatModifiers` on floor 5 returns enemies each with exactly one `modifierIds` entry, all from `['armored']`.
- `stampCombatModifiers` on floor 15 returns enemies each with exactly one `modifierIds` entry from the full pool (across many seeds, each ID appears).
- `stampEliteModifiers` on floor 1 returns enemies each with exactly one `modifierIds` entry from the full pool (across many seeds, all three IDs appear).
- Determinism: same inputs + seed → same `modifierIds`.

### `src/dungeon/__tests__/floor.test.ts` (extend)

- Floor 1 enemies (combat n0/n1/fork-branch) have no `modifierIds`.
- Floor 5 combat encounters (n0/n1, and any combat-fork-branch): every enemy has exactly one `modifierIds` entry, all from `['armored']`.
- Floor 15 combat encounters: every enemy has exactly one `modifierIds` entry from the full pool.
- Elite encounter on floor 1: every enemy has exactly one `modifierIds` from the full pool.
- Boss encounters carry no `modifierIds` (any floor).

### `src/run/__tests__/combat_setup.test.ts` (extend)

- An enemy placement with `modifierIds: ['armored']` produces a combatant whose `baseStats.defense` equals scaled-defense + 2.
- An enemy placement with `modifierIds: ['venomous']` produces a combatant with `venomousDamage: 2`, `venomousDuration: 2`.
- An enemy placement with `modifierIds: ['enraged']` produces a combatant with `enragedThreshold: 0.5`, `enragedAttackDelta: 3`.
- An enemy placement with `modifierIds: undefined` or `[]` produces a combatant with none of those modifier-derived fields set.

### `src/combat/__tests__/effects.test.ts` (extend)

- A venomous enemy hitting a hero non-lethally applies the `'poisoned'` status with the modifier's damagePerTurn and duration.
- A venomous enemy hitting a hero lethally **does not** apply poison (no `'poisoned'` status on the dead target).
- A `status_applied` event is emitted alongside the poison application.

### `src/combat/__tests__/statuses.test.ts` (extend)

- `getEffectiveStat(combatant, 'attack')` for an enraged combatant at full HP returns the base attack (threshold not crossed).
- Same combatant at `currentHp / maxHp < 0.5` returns `base + enragedAttackDelta`.
- Same combatant at exactly `currentHp / maxHp === 0.5` returns the base (strict less-than).
- The bonus only applies when `stat === 'attack'`, not other stats.

## 7 · Files touched

| File | Change |
|---|---|
| `src/data/modifiers.ts` | **New.** `ModifierId`, `ModifierEffect`, `MODIFIERS`, `MODIFIER_IDS`. |
| `src/dungeon/node.ts` | Extend `EnemyPlacement` with optional `modifierIds`. |
| `src/dungeon/modifier_stamp.ts` | **New.** `poolForFloor`, `fullPool`, `rollModifier`, `stampCombatModifiers`, `stampEliteModifiers`. |
| `src/dungeon/floor.ts` | Call `stampCombatModifiers` after each combat encounter and `stampEliteModifiers` after the elite encounter. Boss untouched. |
| `src/combat/types.ts` | Extend `Combatant` with optional `venomousDamage`, `venomousDuration`, `enragedThreshold`, `enragedAttackDelta`. |
| `src/run/combat_setup.ts` | New `applyModifiersToStats` helper; set venomous/enraged fields on the enemy combatant when `modifierIds` includes them. |
| `src/combat/effects.ts` | After existing `burningWeaponDamage` block, parallel `venomousDamage` block. |
| `src/combat/statuses.ts` | In `getEffectiveStat`, threshold check for enraged attack-bonus. |
| `src/data/__tests__/modifiers.test.ts` | **New.** Per §6. |
| `src/dungeon/__tests__/modifier_stamp.test.ts` | **New.** Per §6. |
| `src/dungeon/__tests__/floor.test.ts` | Extend per §6. |
| `src/run/__tests__/combat_setup.test.ts` | Extend per §6. |
| `src/combat/__tests__/effects.test.ts` | Extend per §6. |
| `src/combat/__tests__/statuses.test.ts` | Extend per §6. |

## 8 · Save schema

Pre-launch policy holds: schema stays at v1, no migration. `EnemyPlacement.modifierIds` is optional, so old serialized encounters without the field load fine (stays `undefined` = unmodified). New saves serialize `modifierIds` naturally as part of `currentFloorNodes`.

The `Combatant` extension fields (`venomousDamage`, `venomousDuration`, `enragedThreshold`, `enragedAttackDelta`) are runtime-only — combatants live inside in-flight `CombatState`, not persisted. No save concern there.

## 9 · Open questions

None at design time. Numerical knobs (Armored +2 defense, Venomous 2 dmg × 2 turns, Enraged 0.5 / +3 attack, milestone floors 5/10/15) are tuneable from the constants in `data/modifiers.ts` and `dungeon/modifier_stamp.ts` without touching the data shape.
