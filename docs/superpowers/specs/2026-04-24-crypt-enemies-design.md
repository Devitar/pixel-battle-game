# Crypt Enemies — Minion Pool & Boss (Tier 1)

**Status:** Design · **Date:** 2026-04-24 · **Source TODO:** Cluster A, task 3

## Purpose

Define the 4 Crypt minion types and the Crypt boss as pure-TypeScript data modules under `src/data/`. This task gives the combat engine (task 4) enemies to resolve fights against, and gives the floor generator (task 5) a pool to draw encounter lineups from.

Scope is the 5 enemies, their 8 new enemy-only abilities, two new statusIds, and the Crypt pool/boss exports. No floor generation, no scaling, no encounter composition — those belong to task 5.

## Dependencies on prior work

This task is the direct successor to task 2 (class data) and reuses its vocabulary without modification:

- `Ability`, `TargetSelector`, `AbilityEffect` (9-kind discriminated union), `TargetFilter`, `SlotIndex`, `Side`, `CombatantTag`, `StatusId`, `AbilityTag` — all from `src/data/types.ts`.
- The `power × Attack` damage/heal formula.
- The flat-priority + smart-target-selector AI pattern.
- The collapse-on-death engine invariant.
- The caster-relative interpretation of `TargetSelector.side` (`'self'` = caster, `'ally'` = same-side combatants other than caster, `'enemy'` = opposing-side combatants). This spec makes that relativity explicit because the Cultist's `dark_pact` heals enemy-side allies, which is the first time the interpretation matters for written content. Task 4's combat engine must honor it.

No new effect primitives, no new `AbilityTag`, no changes to existing types beyond appending literals.

## Module layout

| Path | Change | Responsibility |
|---|---|---|
| `src/data/types.ts` | Extend | Add `EnemyId`, `EnemyRole`, `EnemyDef`. Extend `AbilityId` with 8 enemy-only ids. Extend `StatusId` with `'rotting'`, `'frailty'`. |
| `src/data/abilities.ts` | Extend | Add 8 new ability records. |
| `src/data/enemies.ts` | Create | `ENEMIES` registry, `CRYPT_POOL`, `CRYPT_BOSS`. |
| `src/data/__tests__/enemies.test.ts` | Create | Integrity checks on `ENEMIES` + pool/boss coherence. |
| `src/data/__tests__/abilities.test.ts` | Modify | Loosen `canCastFrom ⊆ [1,2,3]` to `⊆ [1,2,3,4]`. |
| `src/data/__tests__/classes.test.ts` | Modify | Add per-class check that referenced abilities have `canCastFrom ⊆ [1,2,3]`, reclaiming the player-side-only enforcement at the layer where it belongs. |

Firewall unchanged: `src/data/enemies.ts` imports only `./types` and `./abilities`. No phaser.

## `EnemyDef` shape

```ts
export type EnemyId =
  | 'skeleton_warrior'
  | 'skeleton_archer'
  | 'ghoul'
  | 'cultist'
  | 'bone_lich';

export type EnemyRole = 'minion' | 'boss';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  role: EnemyRole;
  baseStats: Stats;
  tags: readonly CombatantTag[];
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  preferredSlots: readonly SlotIndex[];
  spriteId: string;
}
```

**Field semantics:**

- `tags` is mandatory. Every Tier 1 minion except the Cultist carries `['undead']`; the Cultist carries `['humanoid']`. Smite's `AbilityTag: 'radiant'` pairs with `'undead'` via set intersection in the engine, producing a bonus-damage multiplier — so Cultists are deliberately not bonus-hit by Smite. Design intent: create a tactical signal where Smite wrecks skeletons and the Lich but requires normal handling for Cultists.
- `preferredSlots` is a *hint* for the task 5 floor generator. The combat engine does not read it — a shoved skeleton archer still fights from slot 1, it just can't cast `bone_arrow` from there and will take a shuffle action. The generator uses the hint to build plausible lineups.
- `spriteId` is a logical string (`'skeleton_warrior'`, `'bone_lich'`). Task 19 maps logical ids to sprite frame ids when real enemy art lands. Until then, the combat scene (task 17) may map logical ids to any existing NPC frame for placeholder rendering. The data layer does not know or care what frame number any enemy resolves to.
- No `starterLoadout` (enemies don't equip gear) and no `preferredWeapon` (same reason).

## Enemy-only ability additions

Appended to `ABILITIES` in `src/data/abilities.ts`. `canCastFrom` uses enemy slot range [1..4]. `target.side` is caster-relative.

| Ability | canCastFrom | target | effects |
|---|---|---|---|
| `bone_slash` | [1, 2] | `{ side: 'enemy', slots: [1] }` | `[{ kind: 'damage', power: 0.8 }]` |
| `bone_arrow` | [2, 3, 4] | `{ side: 'enemy', slots: 'all', pick: 'first' }` | `[{ kind: 'damage', power: 0.9 }]` |
| `rotting_bite` | [1, 2] | `{ side: 'enemy', slots: [1] }` | `[{ kind: 'damage', power: 0.9 }, { kind: 'debuff', stat: 'attack', delta: -1, duration: 2, statusId: 'rotting' }]` |
| `dark_bolt` | [2, 3, 4] | `{ side: 'enemy', slots: 'all', pick: 'first' }` | `[{ kind: 'damage', power: 0.9 }]` |
| `dark_pact` | [2, 3, 4] | `{ side: 'ally', filter: { kind: 'hurt' }, pick: 'lowestHp' }` | `[{ kind: 'heal', power: 1.0 }]` |
| `necrotic_wave` | [1, 2, 3, 4] | `{ side: 'enemy', slots: 'all' }` | `[{ kind: 'damage', power: 0.4 }]` |
| `lich_strike` | [1, 2, 3, 4] | `{ side: 'enemy', slots: [1] }` | `[{ kind: 'damage', power: 1.0 }]` |
| `curse_of_frailty` | [1, 2, 3, 4] | `{ side: 'enemy', filter: { kind: 'lacksStatus', statusId: 'frailty' }, pick: 'first' }` | `[{ kind: 'debuff', stat: 'hp', delta: -3, duration: 2, statusId: 'frailty' }]` |

Two new `StatusId` values: `'rotting'` (ghoul's attack debuff) and `'frailty'` (lich's max-HP debuff). No new `AbilityTag`.

**On `bone_arrow` vs `dark_bolt`:** identical selectors and near-identical power is intentional. The Cultist differentiates itself through `dark_pact` (healer behaviour expressed in AI priority), not through its ranged attack.

**On `necrotic_wave`:** low per-target power (0.4). With Bone Lich Attack 5 and 3 player combatants, a wave deals ~2 damage per target = ~6 party-wide damage. Boss feels signature, not oppressive.

**On `curse_of_frailty`:** uses `stat: 'hp'` — the max-HP debuff case. Engine invariant task 4 must honor: when max HP changes, current HP is clamped to `min(current, newMax)` (so a max-HP drop from 20 to 17 only reduces current HP if current was >17; a target at 15/20 stays at 15/17). When the debuff expires and max returns to 20, current HP does **not** rise to compensate — it stays where it was last left. This makes the debuff chip damage for full-HP targets and a pressure cap for already-wounded ones.

## Tier 1 Crypt content

### Enemies

| Enemy | Role | HP | Atk | Def | Spd | Tags | Preferred slots | Abilities (AI priority) | Sprite id |
|---|---|---|---|---|---|---|---|---|---|
| Skeleton Warrior | minion | 12 | 3 | 2 | 3 | `['undead']` | `[1, 2]` | `[bone_slash]` | `skeleton_warrior` |
| Skeleton Archer | minion | 10 | 4 | 1 | 4 | `['undead']` | `[3, 4]` | `[bone_arrow]` | `skeleton_archer` |
| Ghoul | minion | 14 | 3 | 2 | 3 | `['undead']` | `[1, 2]` | `[rotting_bite]` | `ghoul` |
| Cultist | minion | 10 | 3 | 1 | 3 | `['humanoid']` | `[3, 4]` | `[dark_pact, dark_bolt]` | `cultist` |
| Bone Lich | **boss** | 35 | 5 | 3 | 3 | `['undead']` | `[3, 4]` | `[curse_of_frailty, necrotic_wave, lich_strike]` | `bone_lich` |

Stats are design baselines; task 4 will tune.

### Pool and boss exports

```ts
export const ENEMIES: Record<EnemyId, EnemyDef> = { /* 5 entries above */ };

export const CRYPT_POOL: readonly EnemyId[] = [
  'skeleton_warrior',
  'skeleton_archer',
  'ghoul',
  'cultist',
];

export const CRYPT_BOSS: EnemyId = 'bone_lich';
```

Uniform pool, no weighting. Moving to `WeightedOption<EnemyId>[]` is trivial later (the RNG's `weighted()` helper already exists) — but weighting before playtesting is guesswork.

**Front-line / back-line split (2 + 2):** two minions prefer slots 1–2 (Skeleton Warrior, Ghoul), two prefer slots 3–4 (Skeleton Archer, Cultist). This lets task 5's encounter composer always produce a plausible 3–4 enemy lineup without pathological same-slot pile-ups.

**Minions have no basic-attack fallback.** Each minion has exactly one ability, castable only from its preferred slots. If combat repositioning forces a minion out of its preferred range (e.g., a Skeleton Archer shoved into slot 1), the combatant takes a shuffle action to reposition rather than casting a flailing-melee default. This keeps minion definitions small and matches the Tier 1 "shuffle is the fallback" rule task 4 will implement.

## Tests

### New: `src/data/__tests__/enemies.test.ts`

- Every `EnemyId` has an entry in `ENEMIES`; no stray keys.
- For each enemy:
  - `id` field matches the key.
  - `baseStats` are all positive and finite.
  - `abilities` is non-empty and every entry is registered in `ABILITIES`.
  - `aiPriority` is a subset of `abilities`.
  - `preferredSlots` is non-empty and every slot is within [1, 4].
  - `tags` is non-empty.
  - `spriteId` is a non-empty kebab-case string.
- **Role/pool coherence:**
  - Exactly one enemy has `role: 'boss'`, and its id equals `CRYPT_BOSS`.
  - Every id in `CRYPT_POOL` exists in `ENEMIES` and has `role: 'minion'`.
  - Every enemy with `role: 'minion'` appears in `CRYPT_POOL` (no orphan minions).
- **Caster-slot reach:** for every enemy, every ability in `aiPriority` has a non-empty intersection between `canCastFrom` and the enemy's `preferredSlots`. Catches "skeleton archer prefers slot 1 but bone_arrow can't cast from there" bugs.

### Modified: `src/data/__tests__/abilities.test.ts`

- Change the `canCastFrom ⊆ [1,2,3]` assertion to `⊆ [1,2,3,4]`. Enemy abilities legitimately cast from slot 4.
- Every other existing check (effects non-empty, kebab statusId, round-trip filter↔status) iterates over `Object.values(ABILITIES)`, so the 8 new records get validated without extra code.

### Modified: `src/data/__tests__/classes.test.ts`

- New per-class check: every ability id in `abilities` has `canCastFrom ⊆ [1,2,3]`. Pins player-side-only enforcement at the layer that owns it.

Behavioral tests (AI branching, damage formulas, status-tick behavior) belong to task 4's combat engine, not this task.

## Risks and follow-ups

- **Stat balance unvalidated.** Numbers will need tuning once task 4 can simulate fights. Bone Lich at HP 35 and Attack 5 is a starting point, not a promise.
- **Encounter composition is task 5's problem.** This task provides `preferredSlots` as a hint; whether "3 minions, 1 of each front-or-back" or "4-enemy encounters" happens depends entirely on task 5's composer. No design commitment here about lineup shape.
- **`spriteId` is a logical string.** Task 19 needs to add a resolution step — either extend `SPRITE_NAMES` with an `enemy` category or add a separate `ENEMY_SPRITE_FRAMES: Record<string, number>` map. Not this task's concern.
- **Caster-relative sides are declared here.** Task 4 must implement them. If task 4 adopts absolute sides, `dark_pact` silently heals the player party. Worth calling out explicitly in task 4's plan when it lands.
- **Engine invariants this spec adds on top of task 2's list:** (e) max-HP debuffs clamp current HP down; max-HP buff/restore does not push current HP up (current HP stays where it is when the debuff expires).
