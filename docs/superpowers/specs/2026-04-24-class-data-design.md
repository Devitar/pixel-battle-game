# Class Data — Knight, Archer, Priest (Tier 1)

**Status:** Design · **Date:** 2026-04-24 · **Source TODO:** Cluster A, task 2

## Purpose

Define the three Tier 1 classes (Knight, Archer, Priest) and all of their abilities as pure-TypeScript data modules under `src/data/`. This task produces the content the combat engine (task 4) will consume to resolve fights, and establishes the type vocabulary — ability effects, target selectors, class template — that the rest of Tier 1 will build on.

Scope is deliberately narrow: data shapes and Tier 1 content. Gear-modifies-ability, Mind/Crit/Dodge stats, Wounds, leveling, and enemy abilities are all out of scope (Tier 2 or later tasks).

## Constraints

- **Phaser firewall.** All new files live under `src/data/`. No imports of `phaser`. Fast Vitest execution.
- **Tier 1 stat model.** HP, Attack, Defense, Speed only. No Mind, Crit, or Dodge. Priest heals scale off Attack.
- **Data, not logic.** `src/data/` modules declare content and shape. The combat engine in task 4 owns behavior (damage formulas, status ticks, target resolution).
- **No gear variants.** Each class has exactly 4 abilities: 3 signature + 1 class-specific basic attack. Gear-modifies-ability is Tier 2 scope.

## Module layout

Three new files in `src/data/`, one new test folder:

| Path | Purpose |
|---|---|
| `src/data/types.ts` | Shared types (`ClassId`, `AbilityId`, `SlotIndex`, `Side`, `TargetSelector`, `TargetFilter`, `AbilityEffect`, `BuffableStat`, `Ability`, `AbilityTag`, `ClassDef`, `StatusId`, `CombatantTag`, `WeaponType`, `StarterLoadout`). Pure shape definitions, no logic. |
| `src/data/abilities.ts` | `export const ABILITIES: Record<AbilityId, Ability>`. 12 entries — 4 per class. |
| `src/data/classes.ts` | `export const CLASSES: Record<ClassId, ClassDef>`. 3 entries — Knight, Archer, Priest. |
| `src/data/__tests__/classes.test.ts` | Data-integrity checks on `CLASSES`. |
| `src/data/__tests__/abilities.test.ts` | Data-integrity checks on `ABILITIES`. |

Import boundary: `src/data/` imports only from `src/data/` and from `src/combat/types.ts` (for the existing `Stats` interface). No imports into `src/data/` from scenes, rendering, or any phaser-adjacent folder.

**Starter paperdoll loadout.** `ClassDef.starterLoadout` references sprite frame ids (e.g., `SPRITE_NAMES.weapon.sword_tier1`). Because `src/render/sprite_names.generated.ts` is a pure typed-constants file with no phaser dependency, `data/classes.ts` importing `SPRITE_NAMES` does not violate the firewall. Implementation verifies this; if that assumption turns out false, the fallback is logical ids as strings (`weapon: 'sword_tier1'`) resolved at the render layer.

## Ability effect model

`AbilityEffect` is a discriminated union. Each kind carries only the fields its effect needs, so TypeScript enforces correctness per kind at compile time.

```ts
export type AbilityEffect =
  | { kind: 'damage';  power: number }
  | { kind: 'heal';    power: number }
  | { kind: 'stun';    duration: number }
  | { kind: 'shove';   slots: number }
  | { kind: 'pull';    slots: number }
  | { kind: 'buff';    stat: BuffableStat; delta: number; duration: number; statusId: StatusId }
  | { kind: 'debuff';  stat: BuffableStat; delta: number; duration: number; statusId: StatusId }
  | { kind: 'mark';    damageBonus: number; duration: number; statusId: StatusId }
  | { kind: 'taunt';   duration: number; statusId: StatusId };

export type BuffableStat = 'hp' | 'attack' | 'defense' | 'speed';
// 'hp' refers to max HP. When max changes, current HP follows (engine behavior).
```

**Conventions:**

- `power` is a damage/heal multiplier: the engine computes `round(power × caster.Attack)`. Keeps ability data readable; lets gear/traits scale Attack upstream without touching ability data.
- `delta` values are **flat only** in Tier 1. Percent-mode deltas (e.g., "-10% max HP") can be added as a non-breaking extension in Tier 2 by adding an optional `mode: 'flat' | 'percent'` field.
- `statusId` is a kebab-case string naming the status applied. Used for two things: (a) the engine tracks active statuses per combatant by id; (b) target selectors filter on the presence/absence of a given id (so Bulwark can skip its cast while already buffed). Status ids are unique across the whole game — `'bulwark'` only ever refers to the Knight's Defense buff; pick distinct ids for distinct effects.
- `mark.damageBonus` is a multiplier applied to the *next damage instance* against the marked target (engine hook).
- `taunt` is a targeting override applied to the opposing side's AI (engine hook); no stat change.

## Ability shape

```ts
export interface Ability {
  id: AbilityId;
  name: string;
  canCastFrom: readonly SlotIndex[];
  target: TargetSelector;
  effects: readonly AbilityEffect[];
  tags?: readonly AbilityTag[];
}

export type AbilityTag = 'radiant';   // Tier 1 set. Tier 2 will add 'fire', 'frost', etc.
```

- `canCastFrom` lists the caster slots from which the ability can be used. A caster in an ineligible slot cannot cast it; the engine falls through to the next priority ability (or the shuffle fallback).
- `effects` is one or more effects. Shield Bash is `[damage, stun]`.
- `tags` is an optional flag list used by the engine for cross-cutting hooks. `AbilityTag` describes the damage flavor of the ability (Tier 1: `'radiant'`; Tier 2 will add `'fire'`, `'frost'`, etc.). `CombatantTag` describes a creature type (`'undead'`, `'beast'`, `'humanoid'` — defined when task 3 introduces enemy data). The combat engine applies a bonus when an ability's `AbilityTag`s pair with a target's `CombatantTag`s — Smite's `'radiant'` vs an undead enemy is the canonical Tier 1 pairing. The two types must not be conflated.

## Target selector grammar

```ts
export interface TargetSelector {
  side: 'self' | 'ally' | 'enemy';
  slots?: readonly SlotIndex[] | 'all' | 'furthest';
  filter?: TargetFilter;
  pick?: 'first' | 'random' | 'lowestHp' | 'highestHp';
}

export type TargetFilter =
  | { kind: 'hurt' }
  | { kind: 'hasStatus';   statusId: StatusId }
  | { kind: 'lacksStatus'; statusId: StatusId }
  | { kind: 'hasTag';      tag: CombatantTag };

export type SlotIndex = 1 | 2 | 3 | 4;
```

**Semantics (for the engine in task 4):**

1. Start from the set of combatants on `side` (self / ally / enemy) that are alive.
2. Apply `slots` if present:
   - `SlotIndex[]`: keep combatants currently in those ranks.
   - `'all'`: keep everyone.
   - `'furthest'`: keep only the last-occupied rank (dynamic — equals the highest slot currently occupied by a living combatant on that side).
3. Apply `filter` if present: drop anyone who fails the predicate.
4. If the resulting set is empty, the ability is **not castable** (selector legality doubles as AI gating — this is how Mend skips when nobody is hurt).
5. `pick` controls single-target vs AoE:
   - `pick` **absent** → effects apply to every member of the candidate set (AoE). Volley's `{ side: 'enemy', slots: 'all' }` hits everyone.
   - `pick` **present** → narrows the set to exactly one combatant (single-target). `'first'` = lowest slot index; `'lowestHp'` / `'highestHp'` = self-explanatory; `'random'` uses the combat RNG. `archer_shoot`'s `{ side: 'enemy', slots: 'all', pick: 'first' }` means "any living enemy, hit the frontmost."

`slots` and `pick` are independent: `slots` defines the candidate set, `pick` decides whether to apply the effect to all of them or one. `slots: 'all'` is a synonym for omitting `slots`.

**Engine invariant declared here:** **collapse-on-death.** Dead combatants do not hold slots. When a combatant dies, everyone behind them shifts forward one rank. This means `slots: [1]` always resolves to the nearest living enemy (no need for a separate `'nearest'` shorthand). Corpses are not a mechanic in Tier 1; Tier 2+ may reintroduce them explicitly.

## Class template

```ts
export interface ClassDef {
  id: ClassId;
  name: string;
  baseStats: Stats;                        // from src/combat/types.ts
  preferredWeapon: WeaponType;             // Tier 2's gear rule will read this
  abilities: readonly AbilityId[];         // all abilities this class knows
  aiPriority: readonly AbilityId[];        // ordered; engine picks first legal
  starterLoadout: StarterLoadout;
}

export type ClassId = 'knight' | 'archer' | 'priest';
export type WeaponType = 'sword' | 'bow' | 'holy_symbol';

export interface StarterLoadout {
  weapon: string;        // sprite frame id
  shield?: string;       // sprite frame id — Knight only in Tier 1
}
```

Body / hair / hat / outfit are rolled at recruitment time (task 8), not owned by class data.

**AI priority.** A flat ordered list of ability ids. On a combatant's turn the engine walks the list top-to-bottom, asks each ability "do you have a legal target from this caster's current slot?" (via the selector), and casts the first one that answers yes. "Is this the right situation?" is expressed through the target filter (`hurt`, `lacksStatus`, etc.), not through a separate condition system. If no priority ability is castable, the combatant takes a default shuffle action to reposition (engine-owned fallback; Tier 1 task 4 scope).

## Tier 1 content

### Classes

| Class | HP | Attack | Defense | Speed | Preferred weapon | Starter shield |
|---|---|---|---|---|---|---|
| Knight | 20 | 4 | 4 | 3 | `sword` | yes |
| Archer | 14 | 5 | 2 | 5 | `bow` | no |
| Priest | 15 | 3 | 2 | 4 | `holy_symbol` | no |

Numbers are design starting points; task 4 will tune once fights can be played.

### AI priorities

- **Knight**: `[shield_bash, bulwark, taunt, knight_slash]`
- **Archer**: `[flare_arrow, piercing_shot, volley, archer_shoot]`
- **Priest**: `[mend, bless, smite, priest_strike]`

### Abilities

All 12 ability records. Filter shorthand: `lacksStatus('x')` ≡ `{ kind: 'lacksStatus', statusId: 'x' }`; `hurt()` ≡ `{ kind: 'hurt' }`.

#### Knight

| Ability | canCastFrom | target | effects |
|---|---|---|---|
| `knight_slash` | [1, 2] | `{ side: 'enemy', slots: [1] }` | `[{ kind: 'damage', power: 1.0 }]` |
| `shield_bash` | [1, 2] | `{ side: 'enemy', slots: [1] }` | `[{ kind: 'damage', power: 0.6 }, { kind: 'stun', duration: 1 }]` |
| `bulwark` | [1, 2, 3] | `{ side: 'self', filter: lacksStatus('bulwark') }` | `[{ kind: 'buff', stat: 'defense', delta: 3, duration: 2, statusId: 'bulwark' }]` |
| `taunt` | [1, 2, 3] | `{ side: 'self', filter: lacksStatus('taunting') }` | `[{ kind: 'taunt', duration: 2, statusId: 'taunting' }]` |

#### Archer

| Ability | canCastFrom | target | effects |
|---|---|---|---|
| `archer_shoot` | [1, 2, 3] | `{ side: 'enemy', slots: 'all', pick: 'first' }` | `[{ kind: 'damage', power: 1.0 }]` |
| `piercing_shot` | [2, 3] | `{ side: 'enemy', slots: [3, 4], pick: 'first' }` | `[{ kind: 'damage', power: 1.4 }]` |
| `volley` | [2, 3] | `{ side: 'enemy', slots: 'all' }` | `[{ kind: 'damage', power: 0.5 }]` |
| `flare_arrow` | [2, 3] | `{ side: 'enemy', filter: lacksStatus('marked'), pick: 'first' }` | `[{ kind: 'mark', damageBonus: 0.5, duration: 2, statusId: 'marked' }]` |

`archer_shoot` uses `slots: 'all'` with `pick: 'first'` so that Archer can basic-attack any living enemy, reflecting a bow's reach even in the pre-gear Tier 1.

#### Priest

| Ability | canCastFrom | target | effects | tags |
|---|---|---|---|---|
| `priest_strike` | [1, 2] | `{ side: 'enemy', slots: [1] }` | `[{ kind: 'damage', power: 0.8 }]` | — |
| `mend` | [2, 3] | `{ side: 'ally', filter: hurt(), pick: 'lowestHp' }` | `[{ kind: 'heal', power: 1.2 }]` | — |
| `smite` | [2, 3] | `{ side: 'enemy', slots: [1] }` | `[{ kind: 'damage', power: 1.1 }]` | `['radiant']` |
| `bless` | [2, 3] | `{ side: 'ally', filter: lacksStatus('blessed'), pick: 'first' }` | `[{ kind: 'buff', stat: 'attack', delta: 2, duration: 2, statusId: 'blessed' }]` | — |

Priest's `priest_strike` is melee (caster must be in slot 1 or 2). If Priest is in slot 3 and needs a fallback, the class's kit normally covers it (Mend, Bless, Smite all cast from 2–3). If none are legal from slot 3 (pathological case), the combatant shuffles forward.

## Tests

### `src/data/__tests__/classes.test.ts`

- Every `ClassId` (`'knight' | 'archer' | 'priest'`) has an entry in `CLASSES`.
- For each class: every id in `abilities` exists in `ABILITIES`; every id in `aiPriority` exists in `abilities`.
- For each class: every stat in `baseStats` is positive and finite.
- Knight's `starterLoadout.shield` is defined; Archer's and Priest's are not.

### `src/data/__tests__/abilities.test.ts`

- For each ability: `canCastFrom` is non-empty, and every slot is within [1, 3] (class abilities are player-side).
- For each ability: if `target.slots` is an array, each slot is within [1, 4].
- For each ability: `effects` is non-empty.
- For each ability: every `statusId` appearing in an effect is a non-empty kebab-case string.
- **Status round-trip:** for every ability whose selector filters on `statusId: X`, if the ability also produces a status with id `X`, the two ids match verbatim (catches silent typos that would make Bulwark loop forever).

Test files stay small (a few dozen lines of table-driven checks). Behavioral tests — turn order, damage resolution, AI branching — belong in task 4, not here.

## Risks and follow-ups

- **Balance.** Numbers are unvalidated. Task 4 is the first opportunity to playtest and tune; expect adjustments.
- **Basic attack melee-ness.** Priest's `priest_strike` requires slot 1 or 2, which is unusual for a back-row class. Acceptable because the Priest's actual kit (Mend/Bless/Smite) covers slots 2–3 and will almost always be legal before basic attack gets reached. If playtesting shows Priest stalling from slot 3, one fix is adding a `priest_strike_ranged` variant in Tier 2 via gear.
- **Engine invariants declared in this spec.** Task 4 (combat engine) must honor: (a) collapse-on-death — dead combatants do not hold slots; (b) selector empty-set semantics — ability is not castable, fall through AI priority; (c) `power × Attack` damage/heal formula; (d) flat buff/debuff deltas.
- **Enemy abilities.** Task 3 (Crypt enemies) reuses the `Ability` type and the effect/selector grammar. Enemy-only effects (e.g., Black Smoke percent debuffs) may motivate the `mode: 'flat' | 'percent'` extension — add when the content actually needs it.
