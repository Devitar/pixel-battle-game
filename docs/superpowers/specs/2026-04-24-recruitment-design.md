# Recruitment Logic (Tier 1)

**Status:** Design · **Date:** 2026-04-24 · **Source TODO:** Cluster A, task 8

## Purpose

Tavern candidate generation: roll 3 heroes with class / body / name / trait, and a starter-roster helper for task 10's boot-scene save-file creation. This task also introduces the trait system — a third modifier source (alongside base stats and combat statuses) that `getEffectiveStat` reads during combat, enabling GDD's conditional traits like "Cowardly — −1 Speed when in slot 1."

Scope is Tier 1: 6 traits (4 flat positives + 2 slot-1 conditional negatives), ~50 ungendered fantasy names, 8 body sprites (4 races × 2 genders), flat `HIRE_COST = 50`. No reroll (Tier 2), no starter perks (leveling is Tier 2), no gear variants (Tier 2).

## Dependencies and invariants

**Vocabulary from prior tasks:**
- `ClassId`, `CLASSES` (task 2), `Hero`, `createHero` (task 6), `Roster`, `Vault` (task 7), `Rng` (task 1), `SPRITE_NAMES.character.*` (codegen from `spritenames.txt`).
- `Combatant`, `getEffectiveStat` (task 4).

**Invariants this spec declares:**
- **Traits are the third modifier source.** Combat stat reads now sum (a) base stats, (b) trait effects if satisfied by runtime context, (c) active buff/debuff statuses.
- **HP trait effects bake at `createHero`; non-HP trait effects evaluate at `getEffectiveStat`.** HP is special because `maxHp` is already a stored field per the task 4 invariant. Baking matches that existing asymmetry. Non-HP (attack/defense/speed) evaluation supports conditional traits.
- **`Candidate` is just a `Hero`.** No separate type. The Tavern returns `Hero[]`; hiring = `addHero(roster, hero)` + `spend(vault, HIRE_COST)`.
- **Traits never tick.** Unlike statuses, traits are permanent per-hero for the whole run. `tickStatuses` remains status-only.
- **Trait conditions live in the data.** `TraitCondition` is a discriminated union Tier 1 initializes with one kind (`inSlot`); Tier 2 extends (`hpBelow`, `statusActive`, etc.) without re-shaping the system.

## Module layout

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/data/types.ts` | Modify | Add `TraitId` literal union, `TraitCondition`, `TraitHpEffect`, `TraitStatEffect`, `TraitDef`. |
| `src/data/traits.ts` | Create | `TRAITS` registry — 6 Tier 1 entries. |
| `src/data/names.ts` | Create | `NAMES` — ~50 ungendered fantasy names. |
| `src/data/body_sprites.ts` | Create | `PLAYER_BODY_SPRITES` — 8 race × gender sprite frame ids. |
| `src/heroes/hero.ts` | Modify | `Hero` gains `traitId`, `bodySpriteId`. `createHero` signature extended; HP trait effect baked. |
| `src/combat/types.ts` | Modify | `Combatant` gains optional `traitId?`. |
| `src/combat/statuses.ts` | Modify | `getEffectiveStat` reads non-HP trait effects with condition evaluation. |
| `src/camp/buildings/tavern.ts` | Create | `generateCandidate`, `generateCandidates`, `generateStarterRoster`, `HIRE_COST`, `TAVERN_CANDIDATE_COUNT`. |
| `src/data/__tests__/traits.test.ts` | Create | |
| `src/data/__tests__/names.test.ts` | Create | |
| `src/heroes/__tests__/hero.test.ts` | Modify | Extend for trait + body. |
| `src/combat/__tests__/statuses.test.ts` | Modify | Trait evaluation cases. |
| `src/combat/__tests__/combatant.test.ts` | Modify | `traitId` propagation. |
| `src/run/__tests__/combat_setup.test.ts` | Modify | Trait flows through `buildCombatState`. |
| `src/run/__tests__/run_state.test.ts` | Modify | Mechanical: `createHero` signature churn. |
| `src/camp/buildings/__tests__/tavern.test.ts` | Create | |

**Import boundary:** `src/camp/buildings/` imports from `src/data/`, `src/heroes/`, `src/util/`. No phaser. Combat engine imports `TRAITS` from `src/data/traits.ts` during stat evaluation — a new data consumer on the combat side, consistent with how combat already imports `ABILITIES` / `CLASSES` / `ENEMIES`.

## Trait types (`src/data/types.ts`)

```ts
export type TraitId =
  | 'stout'
  | 'quick'
  | 'sturdy'
  | 'sharp_eyed'
  | 'cowardly'
  | 'nervous';

export type TraitCondition = { kind: 'inSlot'; slot: SlotIndex };

export interface TraitHpEffect {
  delta: number;               // e.g., 10 for +10% or 2 for flat +2
  mode: 'flat' | 'percent';
}

export interface TraitStatEffect {
  stat: 'attack' | 'defense' | 'speed';
  delta: number;
  condition?: TraitCondition;
}

export interface TraitDef {
  id: TraitId;
  name: string;
  description: string;
  hpEffect?: TraitHpEffect;
  statEffects?: readonly TraitStatEffect[];
}
```

Two effect shapes (not a union) because HP and non-HP follow different application rules (bake vs evaluate) and HP never has conditions in Tier 1. The split is explicit at the data site and consumer.

## Trait content (`src/data/traits.ts`)

```ts
export const TRAITS: Record<TraitId, TraitDef> = {
  stout: {
    id: 'stout',
    name: 'Stout',
    description: '+10% HP',
    hpEffect: { delta: 10, mode: 'percent' },
  },
  quick: {
    id: 'quick',
    name: 'Quick',
    description: '+1 Speed',
    statEffects: [{ stat: 'speed', delta: 1 }],
  },
  sturdy: {
    id: 'sturdy',
    name: 'Sturdy',
    description: '+1 Defense',
    statEffects: [{ stat: 'defense', delta: 1 }],
  },
  sharp_eyed: {
    id: 'sharp_eyed',
    name: 'Sharp-eyed',
    description: '+1 Attack',
    statEffects: [{ stat: 'attack', delta: 1 }],
  },
  cowardly: {
    id: 'cowardly',
    name: 'Cowardly',
    description: '-1 Speed when in slot 1',
    statEffects: [{ stat: 'speed', delta: -1, condition: { kind: 'inSlot', slot: 1 } }],
  },
  nervous: {
    id: 'nervous',
    name: 'Nervous',
    description: '-1 Defense when in slot 1',
    statEffects: [{ stat: 'defense', delta: -1, condition: { kind: 'inSlot', slot: 1 } }],
  },
};
```

4 flat positives + 2 slot-1 conditional negatives. Keeps most rolls upbeat with a couple of "hmm, interesting" traits that create positioning decisions.

## Body sprite catalog (`src/data/body_sprites.ts`)

```ts
import { SPRITE_NAMES } from '../render/sprite_names.generated';

export const PLAYER_BODY_SPRITES: readonly string[] = [
  String(SPRITE_NAMES.character.female_light),
  String(SPRITE_NAMES.character.male_light),
  String(SPRITE_NAMES.character.female_tan),
  String(SPRITE_NAMES.character.male_tan),
  String(SPRITE_NAMES.character.female_dark),
  String(SPRITE_NAMES.character.male_dark),
  String(SPRITE_NAMES.character.female_orc),
  String(SPRITE_NAMES.character.male_orc),
];
```

8 entries per GDD. `PLAYER_` prefix because enemy body sprites live under a different catalog (task 19).

## Names (`src/data/names.ts`)

```ts
export const NAMES: readonly string[] = [
  // ~50 ungendered fantasy names. Final list during implementation.
];
```

Flat array, no gender tagging. Any name pairs with any body sprite.

## Hero changes

```ts
// src/heroes/hero.ts

export interface Hero {
  id: string;
  classId: ClassId;
  name: string;
  baseStats: Stats;
  currentHp: number;
  maxHp: number;
  traitId: TraitId;
  bodySpriteId: string;
}

export function createHero(
  classId: ClassId,
  name: string,
  id: string,
  traitId: TraitId,
  bodySpriteId: string,
): Hero {
  const def = CLASSES[classId];
  const maxHp = computeMaxHp(def.baseStats.hp, TRAITS[traitId]);
  return {
    id,
    classId,
    name,
    baseStats: { ...def.baseStats },
    currentHp: maxHp,
    maxHp,
    traitId,
    bodySpriteId,
  };
}

function computeMaxHp(classBaseHp: number, trait: TraitDef): number {
  if (!trait.hpEffect) return classBaseHp;
  const { delta, mode } = trait.hpEffect;
  if (mode === 'percent') return Math.round(classBaseHp * (1 + delta / 100));
  return classBaseHp + delta;
}
```

- `baseStats` stays as class base; only `maxHp` reflects the HP trait effect. Future UI code that wants "class base 20, with Stout 22" reads both.
- `currentHp === maxHp` at creation. Stout Knight spawns at 22/22.
- Two new required params on `createHero`. Existing callers update mechanically with `'stout'` / `PLAYER_BODY_SPRITES[0]` placeholders.

## Combatant changes + trait evaluation

### `Combatant` gains optional `traitId`

```ts
export interface Combatant {
  // ... existing fields ...
  traitId?: TraitId;
}
```

Optional — enemies don't have traits in Tier 1. `createHeroCombatant`'s `overrides` already lets callers pass `traitId`; `buildCombatState` in `combat_setup.ts` passes `traitId: hero.traitId` so the Combatant inherits the Hero's trait.

### `getEffectiveStat` reads traits

```ts
function evaluateTraitCondition(condition: TraitCondition | undefined, combatant: Combatant): boolean {
  if (!condition) return true;
  switch (condition.kind) {
    case 'inSlot':
      return combatant.slot === condition.slot;
  }
}

export function getEffectiveStat(combatant: Combatant, stat: BuffableStat): number {
  let total = combatant.baseStats[stat === 'hp' ? 'hp' : stat];

  // Traits — non-HP only; HP is baked at Hero creation
  if (stat !== 'hp' && combatant.traitId) {
    const trait = TRAITS[combatant.traitId];
    for (const effect of trait.statEffects ?? []) {
      if (effect.stat === stat && evaluateTraitCondition(effect.condition, combatant)) {
        total += effect.delta;
      }
    }
  }

  // Statuses — unchanged
  for (const status of Object.values(combatant.statuses)) {
    const e = status.effect;
    if ((e.kind === 'buff' || e.kind === 'debuff') && e.stat === stat) {
      total += e.delta;
    }
  }
  return total;
}
```

Trait evaluation happens between base stats and status effects. Order doesn't matter arithmetically (all deltas are additive), but the layered reading keeps the three modifier sources legible at call sites.

`TraitCondition` switch is exhaustive — TS flags unhandled variants when Tier 2 adds new condition kinds.

## Tavern (`src/camp/buildings/tavern.ts`)

```ts
export const HIRE_COST = 50;
export const TAVERN_CANDIDATE_COUNT = 3;

const ALL_TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

export function generateCandidate(rng: Rng, unlockedClasses: readonly ClassId[]): Hero {
  const classId = rng.pick(unlockedClasses);
  const traitId = rng.pick(ALL_TRAIT_IDS);
  const bodySpriteId = rng.pick(PLAYER_BODY_SPRITES);
  const name = rng.pick(NAMES);
  const id = `hero_${rng.int(100000, 999999)}`;
  return createHero(classId, name, id, traitId, bodySpriteId);
}

export function generateCandidates(rng: Rng, unlockedClasses: readonly ClassId[]): Hero[] {
  const candidates: Hero[] = [];
  for (let i = 0; i < TAVERN_CANDIDATE_COUNT; i++) {
    candidates.push(generateCandidate(rng, unlockedClasses));
  }
  return candidates;
}

export function generateStarterRoster(rng: Rng): Hero[] {
  const classes: ClassId[] = ['knight', 'archer', 'priest'];
  return classes.map((classId) => {
    const traitId = rng.pick(ALL_TRAIT_IDS);
    const bodySpriteId = rng.pick(PLAYER_BODY_SPRITES);
    const name = rng.pick(NAMES);
    const id = `hero_${rng.int(100000, 999999)}`;
    return createHero(classId, name, id, traitId, bodySpriteId);
  });
}
```

**Four detail notes:**

- **Hero id format: `hero_<6-digit-int>`.** Random from `rng.int(100000, 999999)` — 900k namespace, collision handled at `addHero` time by task 7's throw-on-duplicate.
- **RNG consumption order fixed per candidate:** class → trait → body → name → id. Deterministic replay.
- **`unlockedClasses` as parameter** (not module constant) so Tier 3's milestone unlocks (Paladin after first Crypt clear) can pass larger arrays without a code change.
- **No reroll, no cost check.** The Tavern data layer produces candidates only. UI in task 13 gates the Hire button via `canAdd(roster)` + `balance(vault) >= HIRE_COST`.

## Tests

### New: `src/data/__tests__/traits.test.ts`

- Every `TraitId` has an entry in `TRAITS`; no stray keys.
- Each entry's `id` field matches its key.
- Every trait has either `hpEffect` or `statEffects` (not neither).
- `hpEffect.mode === 'percent'` → `delta` is between -100 and 100.
- Every `statEffects.stat` is in `['attack', 'defense', 'speed']`.
- `description` is a non-empty string.

### New: `src/data/__tests__/names.test.ts`

- `NAMES.length >= 50`.
- No duplicates.
- Every entry is a non-empty string.

### Extended: `src/heroes/__tests__/hero.test.ts`

- Stout Knight: `maxHp === 22` (20 × 1.10 = 22).
- Stout Archer: `maxHp === 15` (14 × 1.10 = 15.4 → round 15).
- Stout Priest: `maxHp === 17` (15 × 1.10 = 16.5 → round 17 under `Math.round`'s round-half-up).
- Quick Knight: `maxHp === 20` (Quick doesn't touch HP).
- `currentHp === maxHp` immediately after creation.
- `traitId` stored verbatim; `bodySpriteId` stored verbatim.

### Extended: `src/combat/__tests__/statuses.test.ts`

- Quick combatant: `getEffectiveStat(c, 'speed') === base + 1`.
- Stout combatant: `getEffectiveStat(c, 'hp') === base` (HP not re-evaluated; baked elsewhere).
- Cowardly combatant in slot 1: `getEffectiveStat(c, 'speed') === base - 1`.
- Cowardly combatant in slot 2: `getEffectiveStat(c, 'speed') === base` (condition not satisfied).
- Sturdy + Bulwark: `defense === base + 4`.
- Combatant without `traitId` (enemy): no trait contribution.

### Extended: `src/combat/__tests__/combatant.test.ts`

- `createHeroCombatant(..., { traitId: 'stout' })` sets `traitId` on the result.
- `createEnemyCombatant(...)` leaves `traitId` undefined.

### Extended: `src/run/__tests__/combat_setup.test.ts`

- `buildCombatState` propagates each Hero's `traitId` into the Combatant.

### Extended: existing tests

- `src/run/__tests__/run_state.test.ts` — `createHero` signature churn (add two args to each call).
- `src/heroes/__tests__/hero.test.ts` — existing tests get the two new args.

### New: `src/camp/buildings/__tests__/tavern.test.ts`

- `generateCandidates(rng, ['knight', 'archer', 'priest'])` returns `TAVERN_CANDIDATE_COUNT` heroes.
- Each candidate's `classId` is in the unlocked set.
- Each candidate's `traitId` is in `TRAITS`.
- Each candidate's `bodySpriteId` is in `PLAYER_BODY_SPRITES`.
- Each candidate's `name` is in `NAMES`.
- **Determinism:** same seed → identical candidates.
- **HP reflects trait:** Stout candidates have `maxHp > classBaseHp`; others have `maxHp === classBaseHp`.
- `generateStarterRoster(rng)` returns exactly 3 heroes, one per Tier 1 class, random everything else.
- Starter roster deterministic per seed.
- `HIRE_COST === 50`, `TAVERN_CANDIDATE_COUNT === 3`.

## Risks and follow-ups

- **HP-bake asymmetry.** Trait HP effects bake at creation; non-HP evaluate at read time. This makes `Hero.maxHp` drift from `baseStats.hp` for Stout heroes. UI showing "Knight base HP 20, with Stout 22" needs to read both fields. Documented in Hero creation comments.
- **`TraitCondition` is a one-kind union.** `inSlot` only. Tier 2 traits (e.g., "Frenzied: +1 Attack when below 50% HP") will extend it. Exhaustive switch catches missing cases.
- **Traits never tick.** The status tick system continues to handle only combat-duration effects. A future "cursed trait" that expires would need a different mechanism — likely just a status with no producing ability.
- **Hero id collisions.** 6-digit random ids have ~20% collision probability across a 100-hero lifetime (birthday paradox for 900k namespace). Tier 1 roster cap is 12 so collisions are functionally impossible, but as saves accumulate over many runs it grows. Tier 2 may move to UUIDs or a monotonic counter.
- **Starter-roster helper in this task.** Task 10 (boot scene) will call `generateStarterRoster(rng)` when no save file exists. Included here because the generation logic is identical to Tavern candidates.
- **Name list is content.** ~50 placeholder names during implementation; can be swapped wholesale in a future content pass without touching logic.
- **Body sprite ids are SPRITE_NAMES strings.** Same convention as `starterLoadout.weapon` in `ClassDef` (task 2). `Hero.bodySpriteId` is a string to match.
- **No per-class hire cost.** Tier 1 flat `HIRE_COST`. Tier 2 may vary (e.g., Paladin costs more). When that happens, `HIRE_COST` becomes a function `hireCostFor(classId): number` — non-breaking for the UI.
