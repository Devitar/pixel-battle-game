# Hunter Class — Design Spec

**Date:** 2026-05-10
**Status:** Locked design, ready for implementation plan
**Related TODO:** Cluster D · 4
**Builds on:** [`2026-05-06-paladin-class-design.md`](./2026-05-06-paladin-class-design.md) (spec 3 — milestone-handler-extension pattern, class-data integration template).

## Why

Hunter is the second unlockable class — the player's reward for clearing the Sunken Keep the first time. Mechanically novel relative to the existing 7 classes: Hunter introduces a **second player-side actor** (the pet) that occupies slot 4 and acts on its own AI priority. The pet is a separate `Combatant`, scaled by the owning Hunter's effective Attack at combat-setup time.

After this ships:

- Defeating the Sunken Keep floor-3 boss → `unlocks.classes` gains `'hunter'`.
- Hunter candidates appear in the Tavern hire pool at the same rate as the other unlocked classes.
- When a Hunter is hired, RNG rolls one of three `petSpeciesId` values (`wolf | hawk | bear`) and stamps it on the Hero record. The species is fixed for that Hunter's life.
- Bringing a Hunter on an expedition automatically adds the pet at slot 4 of every encounter (provided the pet hasn't been downed-for-the-run).
- Pets are downed-for-the-run on death; they respawn on arrival at any post-boss camp node.
- `first_sunken_keep_clear` is scaffolded as a new `MilestoneId` with its own handler so Cluster D · 5 (Chapel) and · 6 (Training Grounds) can extend it the same way Paladin extended `first_crypt_clear`.

## Scope summary

**In scope:**

- 1 new `ClassId`: `'hunter'`
- 4 new `AbilityId`s for Hunter's own kit: `'hunter_shoot'`, `'hunters_mark'`, `'crippling_shot'`, `'command_strike'`
- 6 new `AbilityId`s for pet kits: `'wolf_bite'`, `'wolf_howl'`, `'hawk_dive'`, `'hawk_screech'`, `'bear_maul'`, `'bear_roar'`
- 1 new `MilestoneId`: `'first_sunken_keep_clear'`
- 1 new entry in `MILESTONES` handler appending `'hunter'` to `unlocks.classes`
- 1 new entry in `detectBossMilestones` for `dungeon=sunken_keep, floor=DUNGEONS.sunken_keep.floorsPerRun`
- 3 new `PetSpeciesId`s (`'wolf' | 'hawk' | 'bear'`) with per-species defs in a new `src/data/pet_species.ts`
- New `Combatant.kind: 'pet'` variant + `createPetCombatant()`
- New `Combatant.ownerHeroId?: string` and `Combatant.petSpeciesId?: PetSpeciesId` fields
- New `AbilityEffect` kind: `{ kind: 'commandPet' }`
- New `AiCondition` kind: `{ kind: 'petAlive' }` (gates `command_strike` so Hunter doesn't burn its turn when pet is down)
- `Hero.petSpeciesId?: PetSpeciesId` field, rolled at recruit for Hunters only
- `RunState.petsDownByHeroId: readonly string[]` — Hunters whose pets are currently down for the run
- 2 new perks (Hunter level-5 perk pair): `'beastmaster'` and `'sharpshooter'`
- New optional `PerkDef.petAttackBonus?: number` field for Beastmaster (path 1 — explicit pet-only buff)
- gdd §3 row 7 fix (Warren → Sunken Keep) — same-PR documentation patch
- Save schema bump (Hero shape + RunState shape both change) + migration (`CURRENT_SCHEMA_VERSION 2 → 3`)
- Tests in lockstep across all of the above

**Out of scope (deferred):**

- **Spear weapon support.** gdd §3 row 7 lists "Bow / Spear" as Hunter weapons. Current `WeaponType` enum has no `'spear'`. Spear support is a future Cluster D follow-up; this spec ships bow-only. Hunter without a bow drops to basic-only (same rule as every other class), no `swapTarget` / `weaponSwaps` defined.
- **Bespoke Hunter and pet sprite art.** Hunter renders via the existing paperdoll. Pet sprites use existing beast NPC frames as placeholders (similar treatment to the original Crypt enemies). Cluster C art polish handles bespoke art later.
- **Pet leveling / pet trait roll.** Pet stats are entirely determined by species + Hunter's effective Attack at combat-setup. No XP for the pet. No pet traits, perks, or wounds.
- **Pet swap mechanic.** Once a Hunter rolls a species, that's their pet for life. "Bond a new pet" is a future camp-action feature; not in this spec.
- **Chapel and Training Grounds buildings.** Cluster D · 5 and · 6 are sibling specs that share the `first_sunken_keep_clear` handler. This spec scaffolds the handler and MilestoneId so they can extend it; it does not ship those buildings.
- **Retroactive unlock for already-cleared saves.** Players who cleared Sunken Keep before Hunter shipped will need to clear it again to unlock Hunter. Same policy as Paladin (per saved-memory `feedback_save_migrations`: pre-launch, retroactive grants are not implemented).
- **Hunter recruitment-rate weighting.** Hunter appears uniformly in the tavern pool once unlocked; no rarity weighting.

## Locked decisions (brainstorm log)

| # | Question | Decision |
|---|---|---|
| Q1 | Pet & party slots | **Free 4th actor (gdd-literal)** — `PARTY_SIZE` stays 3 heroes; pet auto-occupies slot 4 whenever a Hunter is in the party. Hunter parties have 4 combatants → 4 turns/round. Balance comes from leaner Hunter chassis (Attack 4 vs Archer's 5) and per-species pet attack-scale fractions (`0.4`–`0.6` of Hunter Attack). |
| Q2 | Pet death | **Down for the run, returns at camp** (mid-run camp respawn included). Pet drops in combat → out for the rest of the run. Pet respawns at every post-boss camp node and at start of next run. Pet HP **does not** persist between encounters within a floor; pet either is alive (full HP next encounter) or down (absent until camp). |
| Q3 | Pet species | **Rolled at recruit (wolf / hawk / bear)** uniformly. Species is fixed for the Hunter's life. Each species has a distinct 2-ability kit. |
| Q4 | Hunter dies first | **Pet keeps fighting independently.** Bond is logical, not mechanical — pet's `ownerHeroId` is bookkeeping only; runtime AI doesn't reference it (except for `command_strike` resolution and Beastmaster perk). |
| Q5 | Hunter kit relationship to pet | **Mostly standalone, one pet-command ability.** Hunter has basic + 2 standalone bow specials + 1 pet-command (`command_strike`). |
| Q6 | Pet stat scaling | **Scales with Hunter primary stat (gear-aware)**. Pet attack at combat-setup = `round(species.attackScaleFromHunter * hunterEffectiveAttack) + perkBonus`, where `hunterEffectiveAttack` is the post-equipment-post-traits-post-wounds value built in `combat_setup.ts`. Pet HP / speed / etc. stay fixed per species. |
| Q7 | Pet-as-Combatant architecture | **A — new `kind: 'pet'`** peer Combatant. Single-line `kind` widening; localized guards in player-side hero-only code paths (XP, wound application, Fallen detection, post-combat HP write-back). Pet placed at slot 4 with `preferredSlots: [4]`; collapses forward naturally if heroes die. |
| Q8 | Beastmaster perk mechanism | **Path 1 — explicit pet-only buff.** Adds optional `PerkDef.petAttackBonus?: number` field; Beastmaster sets it to `2`. Combat-setup pet creation reads the owning Hunter's perk and adds the bonus to pet attack at build time. Avoids the "did this perk help?" ambiguity of relying on Hunter→pet scaling. |

## Architecture — pet as peer Combatant

### `Combatant` widening

```typescript
// src/combat/types.ts
export interface Combatant {
  /* existing fields */
  kind: 'hero' | 'enemy' | 'pet';   // widened
  ownerHeroId?: string;              // pet → owning Hunter's id (for command_strike + Beastmaster)
  petSpeciesId?: PetSpeciesId;       // pet → species id (for sprite resolution + UI)
}
```

### Player-side guards — what changes, what stays

A grep sweep at the start of implementation enumerates the existing `kind === 'hero'` / `kind === 'enemy'` sites. The sweep was done during spec drafting; the inventory:

**Existing guards that STAY narrow** (correctly hero-only — do not widen for pets):

- `src/combat/effects.ts:134` — wound generation on heavy/crit damage. Pets have no wound list; the existing `target.kind === 'hero'` guard is correct.
- `src/render/combat_actor.ts:125, 186` — sprite/wound-overlay rendering. Pet rendering will get its OWN branch (`kind === 'pet'`); the existing hero branches stay narrow.

**New code added (no existing guards to widen)**:

- `src/run/combat_setup.ts:buildCombatState` — adds a pet build pass after the hero loop. Signature gains a third param: `petsDownByHeroId: readonly string[]`.
- `src/run/run_state.ts:completeCombat` and `:completeSurpriseCombat` — the existing hero-HP write-back loops are keyed by `c.id === \`p${i}\``; pet ids are `pet_${heroId}`, so pets are naturally excluded. Add a NEW pass after each loop that collects `kind === 'pet' && isDead` combatants into `petsDownByHeroId`.
- XP awarding iterates `runState.party` (Hero records), not combatants — pets aren't in the party array, so XP is naturally pet-free. No guard needed.
- Fallen / Lost detection iterates the hero loop's id-keyed lookup — pets are naturally excluded. No guard needed.
- `scenes/combat_playback.ts` — `PARTY_X[4] = 160` already exists. Sprite resolution branches on `kind`; new `kind === 'pet'` branch resolves via `petSpeciesId` to a beast frame.

## Data model — concrete additions

### `src/data/types.ts`

```typescript
export type ClassId = 'knight' | 'archer' | 'priest' | 'barbarian' | 'rogue' | 'mage' | 'paladin' | 'hunter';

export type PetSpeciesId = 'wolf' | 'hawk' | 'bear';

export type AbilityId =
  | /* existing entries unchanged */
  // Hunter own-kit
  | 'hunter_shoot'
  | 'hunters_mark'
  | 'crippling_shot'
  | 'command_strike'
  // Pet kits
  | 'wolf_bite'
  | 'wolf_howl'
  | 'hawk_dive'
  | 'hawk_screech'
  | 'bear_maul'
  | 'bear_roar';

export type StatusId = /* existing union — NO additions */;
// hunters_mark reuses 'marked'; wolf_howl reuses 'blessed'; crippling_shot reuses 'slowed';
// bear_roar reuses 'stunned' for its chance-stun.

export type AbilityEffect =
  | /* existing variants */
  | { kind: 'commandPet' };

export type AiCondition =
  | /* existing variants */
  | { kind: 'petAlive' };

export type MilestoneId = 'first_crypt_clear' | 'first_sunken_keep_clear';

export type PerkId =
  | /* existing entries */
  // Hunter
  | 'beastmaster' | 'sharpshooter';

export interface PerkDef {
  /* existing fields */
  petAttackBonus?: number;   // applied to pet attack at combat-setup time (Beastmaster)
}
```

### `src/data/pet_species.ts` — new module

```typescript
import type { PetSpeciesId, AbilityId, CombatantTag, SlotIndex } from './types';
import type { Stats } from '@combat/types';

export interface PetSpeciesDef {
  id: PetSpeciesId;
  name: string;
  baseStats: Stats;                    // attack OVERWRITTEN at combat-setup with Hunter-scaled value
  attackScaleFromHunter: number;       // pet attack = round(scale * hunterEffectiveAttack) + perkBonus
  preferredSlots: readonly SlotIndex[];
  basicAbility: AbilityId;
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  tags: readonly CombatantTag[];
}

export const PET_SPECIES: Record<PetSpeciesId, PetSpeciesDef> = {
  wolf: {
    id: 'wolf', name: 'Wolf',
    baseStats: { hp: 14, attack: 0, defense: 2, speed: 5, mind: 0, crit: 10, dodge: 10 },
    attackScaleFromHunter: 0.6,
    preferredSlots: [4],
    basicAbility: 'wolf_bite',
    abilities: ['wolf_bite', 'wolf_howl'],
    aiPriority: ['wolf_howl', 'wolf_bite'],
    tags: ['beast'],
  },
  hawk: {
    id: 'hawk', name: 'Hawk',
    baseStats: { hp: 9, attack: 0, defense: 1, speed: 7, mind: 0, crit: 20, dodge: 15 },
    attackScaleFromHunter: 0.5,
    preferredSlots: [4],
    basicAbility: 'hawk_dive',
    abilities: ['hawk_dive', 'hawk_screech'],
    aiPriority: ['hawk_screech', 'hawk_dive'],
    tags: ['beast'],
  },
  bear: {
    id: 'bear', name: 'Bear',
    baseStats: { hp: 22, attack: 0, defense: 4, speed: 2, mind: 0, crit: 5, dodge: 5 },
    attackScaleFromHunter: 0.4,
    preferredSlots: [4],
    basicAbility: 'bear_maul',
    abilities: ['bear_maul', 'bear_roar'],
    aiPriority: ['bear_roar', 'bear_maul'],
    tags: ['beast'],
  },
};
```

`baseStats.attack: 0` is a sentinel — the species-base attack is folded entirely into the Hunter-scaled formula. **Tunable during implementation:** if pets feel too weak when Hunter has low Attack (early game, bare-bones bow), introduce a non-zero floor (e.g., `wolf.baseStats.attack = 2; petAttack = max(species.baseStats.attack, scaleFormula)`). Flag during balance pass.

### `src/data/classes.ts` — Hunter entry

```typescript
hunter: {
  id: 'hunter',
  name: 'Hunter',
  baseStats: { hp: 14, attack: 4, defense: 2, speed: 4, mind: 0, crit: 10, dodge: 10 },
  primaryStat: 'attack',
  preferredWeapon: 'bow',
  weaponFamily: 'ranged',
  basicAbility: 'hunter_shoot',
  abilities: ['hunter_shoot', 'hunters_mark', 'crippling_shot', 'command_strike'],
  aiPriority: ['command_strike', 'hunters_mark', 'crippling_shot', 'hunter_shoot'],
  starterLoadout: { weapon: 'bow_basic' },
},
```

**Numeric notes:**
- HP 14 mirrors Archer (ranged-fragile chassis).
- Attack 4 vs Archer's 5 — the 1-point haircut compensates for the pet's free 4th turn. Tunable.
- Crit 10 / Dodge 10 mirrors Archer (mobile back-row fighter).
- AI priority leads with `command_strike` (when pet alive) for the same reason Paladin leads with Consecrate: the pet-amplifying play-pattern reads first.
- No `swapTarget` or `weaponSwaps` — bow-only; off-bow means basic-only.

### `src/data/abilities.ts` — Hunter own-kit

```typescript
hunter_shoot: {
  id: 'hunter_shoot', name: 'Shoot',
  canCastFrom: [1, 2, 3],
  target: { side: 'enemy', slots: [1, 2, 3, 4], pick: 'first' },
  effects: [{ kind: 'damage', power: 1.0, scalingStat: 'attack' }],
},

hunters_mark: {
  id: 'hunters_mark', name: "Hunter's Mark",
  canCastFrom: [1, 2, 3],
  target: { side: 'enemy', filter: { kind: 'lacksStatus', statusId: 'marked' }, pick: 'first' },
  effects: [{ kind: 'mark', damageBonus: 2, duration: 3, statusId: 'marked' }],
  cooldown: 4,
},

crippling_shot: {
  id: 'crippling_shot', name: 'Crippling Shot',
  canCastFrom: [2, 3],
  target: { side: 'enemy', slots: [1, 2, 3, 4], pick: 'first' },
  effects: [
    { kind: 'damage', power: 0.8, scalingStat: 'attack' },
    { kind: 'debuff', stat: 'speed', delta: -2, duration: 2, statusId: 'slowed' },
  ],
  cooldown: 3,
},

command_strike: {
  id: 'command_strike', name: 'Command',
  canCastFrom: [1, 2, 3],
  target: { side: 'self' },
  effects: [{ kind: 'commandPet' }],
  cooldown: 3,
  aiCondition: { kind: 'petAlive' },
},
```

### `src/data/abilities.ts` — pet kits

```typescript
// Wolf
wolf_bite: {
  id: 'wolf_bite', name: 'Bite',
  canCastFrom: [1, 2, 3, 4],
  target: { side: 'enemy', slots: [1, 2], pick: 'first' },
  effects: [{ kind: 'damage', power: 1.0, scalingStat: 'attack' }],
},
wolf_howl: {
  id: 'wolf_howl', name: 'Howl',
  canCastFrom: [1, 2, 3, 4],
  target: { side: 'ally', slots: 'all', includeCaster: false },
  effects: [{ kind: 'buff', stat: 'attack', delta: 1, duration: 2, statusId: 'blessed' }],
  cooldown: 4,
},

// Hawk
hawk_dive: {
  id: 'hawk_dive', name: 'Dive',
  canCastFrom: [3, 4],
  target: { side: 'enemy', slots: [3, 4], pick: 'first' },
  effects: [{ kind: 'damage', power: 1.1, scalingStat: 'attack', bonusCrit: 10 }],
},
hawk_screech: {
  id: 'hawk_screech', name: 'Screech',
  canCastFrom: [1, 2, 3, 4],
  target: { side: 'enemy', slots: 'all' },
  effects: [{ kind: 'damage', power: 0.5, scalingStat: 'attack' }],
  cooldown: 4,
},

// Bear
bear_maul: {
  id: 'bear_maul', name: 'Maul',
  canCastFrom: [1, 2, 3, 4],
  target: { side: 'enemy', slots: [1], pick: 'first' },
  effects: [{ kind: 'damage', power: 1.2, scalingStat: 'attack' }],
},
bear_roar: {
  id: 'bear_roar', name: 'Roar',
  canCastFrom: [1, 2, 3, 4],
  target: { side: 'enemy', slots: 'all' },
  effects: [
    { kind: 'damage', power: 0.4, scalingStat: 'attack' },
    { kind: 'stun', duration: 1, chance: 0.2 },
  ],
  cooldown: 4,
},
```

**Numeric notes** (relative to existing kit, expect tuning):
- All pet abilities scale on `attack` (the Hunter-scaled value). Pets are pure-attack actors; they have `mind: 0`.
- AoE pet abilities (`hawk_screech`, `bear_roar`) deliberately have low `power` (0.4–0.5) to balance the area effect.
- `bear_roar`'s 20% stun is per-target, applied independently to each enemy (matching existing `stun` chance semantics).
- Pet `canCastFrom` is widened to `[1, 2, 3, 4]` (or `[3, 4]` for `hawk_dive`) so pets remain useful when collapsed forward after hero deaths. `preferredSlots: [4]` keeps them at the back when their hero allies are alive.
- `wolf_howl` reuses `'blessed'` (Priest's bless mechanic). Mechanically equivalent; flavor differs. Documented in tests.
- `command_strike` is the only ability with a `petAlive` AI condition. Other Hunter abilities are pet-agnostic.

### `src/data/perks.ts` — Hunter level-5 pair

```typescript
beastmaster: {
  id: 'beastmaster',
  name: 'Beastmaster',
  description: '+2 Attack to your pet.',
  classId: 'hunter',
  petAttackBonus: 2,
},

sharpshooter: {
  id: 'sharpshooter',
  name: 'Sharpshooter',
  description: '+2 Attack. Hunter\'s shots hit harder.',
  classId: 'hunter',
  statEffects: [{ stat: 'attack', delta: 2 }],
},
```

These are paired in the perk picker via the existing class-pair lookup pattern.

**Beastmaster mechanism:** the existing perk system applies `statEffects` to the owning Hero's stats at hero-build time. Beastmaster has *no* `statEffects` (it doesn't buff the Hunter at all); instead, the new optional `petAttackBonus` field is read at *combat-setup pet creation* time. Hero/perk code paths that consume `statEffects` ignore `petAttackBonus` cleanly (no shape collision).

The forced fork mirrors Paladin's `righteous` (caster path) vs `vindicator` (melee path): Beastmaster doubles down on pet identity; Sharpshooter on Hunter-self damage. A Hunter player must commit to "is this Hunter about the bond, or about the bow?"

### `src/run/run_state.ts` — RunState shape

```typescript
export interface RunState {
  /* existing fields */
  petsDownByHeroId: readonly string[];
}
```

`petsDownByHeroId` is run-scoped; it does not persist outside an active run. `startRun` initializes it to `[]`. `applyCampNodeEffect` resets it to `[]` regardless of camp choice (heal_party, treat_wound, or leave) — the pet "rests up" any time the player visits a camp.

### `src/heroes/hero.ts` — Hero shape

```typescript
export interface Hero {
  /* existing fields */
  petSpeciesId?: PetSpeciesId;   // present iff classId === 'hunter'
}
```

Hunter recruitment in `src/camp/buildings/tavern.ts:generateCandidate` rolls `petSpeciesId` uniformly from `['wolf', 'hawk', 'bear']` whenever `classId === 'hunter'`, and threads it into `createHero`. `createHero` gains an optional `petSpeciesId?: PetSpeciesId` param (8th positional, after `feetSpriteId`); when provided and `classId === 'hunter'`, the Hero record gets the field set. Other classes' Heroes never set this field.

### `src/combat/combatant.ts` — `createPetCombatant`

```typescript
export function createPetCombatant(
  speciesId: PetSpeciesId,
  ownerHeroId: string,
  hunterEffectiveAttack: number,
  petAttackBonus: number = 0,
  petId: CombatantId = `pet_${ownerHeroId}`,
): Combatant {
  const def = PET_SPECIES[speciesId];
  const computedAttack = Math.round(def.attackScaleFromHunter * hunterEffectiveAttack) + petAttackBonus;
  return {
    id: petId,
    side: 'player',
    slot: 4,
    kind: 'pet',
    ownerHeroId,
    petSpeciesId: speciesId,
    baseStats: { ...def.baseStats, attack: computedAttack },
    currentHp: def.baseStats.hp,
    maxHp: def.baseStats.hp,
    statuses: {},
    cooldowns: {},
    abilities: def.abilities,
    aiPriority: def.aiPriority,
    preferredSlots: def.preferredSlots,
    tags: def.tags,
    isDead: false,
  };
}
```

### `src/run/combat_setup.ts` — pet build pass

```typescript
export function buildCombatState(
  party: readonly Hero[],
  encounter: Encounter,
  petsDownByHeroId: readonly string[] = [],
): CombatState {
  const combatants: Combatant[] = [];

  for (let i = 0; i < party.length; i++) {
    /* existing hero combatant build — unchanged */
  }

  // After the hero loop, add pet combatants for hunters whose pet isn't down.
  for (let i = 0; i < party.length; i++) {
    const hero = party[i];
    if (hero.classId !== 'hunter' || !hero.petSpeciesId) continue;
    if (petsDownByHeroId.includes(hero.id)) continue;
    const heroCombatant = combatants[i];
    const perk = hero.perkId ? PERKS[hero.perkId] : undefined;
    const petAttackBonus = perk?.petAttackBonus ?? 0;
    combatants.push(
      createPetCombatant(
        hero.petSpeciesId,
        hero.id,
        heroCombatant.baseStats.attack,
        petAttackBonus,
      ),
    );
  }

  for (let i = 0; i < encounter.enemies.length; i++) {
    /* existing enemy build — unchanged */
  }

  return { combatants, round: 0, exhaustionLevel: 0 };
}
```

The third param defaults to `[]` so existing callers (tests, dev tooling) work unchanged.

### `src/combat/effects.ts` — `commandPet` resolution

When `applyAbility` encounters an effect of `kind: 'commandPet'`:

1. Find `caster`'s living pet: `state.combatants.find(c => c.kind === 'pet' && c.ownerHeroId === caster.id && !c.isDead)`.
2. If no pet found, no-op (the cooldown still applies — the Hunter has "called for" the pet that isn't there). **AI is gated by `aiCondition: petAlive` so the AI only picks `command_strike` when a pet is alive; the no-op branch is defense-in-depth for hand-built combat states or post-pet-death moves within the same turn.**
3. If pet found: call `pickAbility(pet, state, rng)` to get the pet's natural choice. Apply via `applyAbility(petAbility, pet, targetIds, state, rng, events)`. The pet's cooldowns advance for the picked ability normally (via `setCooldown` after apply).

The pet still takes its own initiative-driven turn this round. `command_strike` adds a *second* pet action in the round it triggers.

**Recursion guard:** pets do not have `command_strike` (only Hunters do), so `commandPet` cannot recurse via pet kits. The implementation should still defensively no-op if the picked pet ability somehow has a `commandPet` effect (e.g., if someone later adds it to a pet kit). A unit test asserts this guard.

### `src/combat/ability_priority.ts` — `petAlive` condition

```typescript
function checkAiCondition(
  cond: AiCondition,
  caster: Combatant,
  targetIds: readonly CombatantId[],
  state: CombatState,   // signature widens to take state for petAlive lookup
): boolean {
  switch (cond.kind) {
    case 'minTargets': /* unchanged */
    case 'casterHpBelow': /* unchanged */
    case 'petAlive':
      return state.combatants.some(
        (c) => c.kind === 'pet' && c.ownerHeroId === caster.id && !c.isDead,
      );
  }
}
```

The `pickAbility` caller already has `state` in scope; the signature change is local.

### `src/dungeon/camp_node.ts` — pet respawn at camp

```typescript
export function applyCampNodeEffect(
  runState: RunState,
  choice: Exclude<CampNodeChoice, { kind: 'leave' }>,
  _rng: Rng,
): RunState {
  // Reset pets-down regardless of choice. The pet rests up at camp.
  const respawned: RunState = { ...runState, petsDownByHeroId: [] };

  if (choice.kind === 'heal_party') { /* operates on respawned */ }
  // treat_wound — operates on respawned
  /* ... */
}
```

`applyCampNodeEffect` is only called for `heal_party` and `treat_wound` (its `choice` param is `Exclude<CampNodeChoice, { kind: 'leave' }>`). The `'leave'` (cashout) path is short-circuited at the caller (`chooseCampNodeEffect`) and ends the run, so it doesn't need the pet-down reset.

### `src/run/run_state.ts` — post-combat pet bookkeeping

Both `completeCombat` (line 187) and `completeSurpriseCombat` (line 320) need the pet-down pass added. The existing hero-HP write-back loop is keyed by `c.id === \`p${i}\`` — pet ids are `pet_${ownerHeroId}` and thus naturally excluded; **no guard added to the existing loop**.

After the existing hero loop, before the `player_defeat` early-return, add:

```typescript
// Collect new pet downs from this combat. Hero ids are 'p0'/'p1'/'p2';
// pet ids are 'pet_${heroId}', so the hero loop above already skips them.
const newPetsDown: string[] = [...runState.petsDownByHeroId];
for (const c of result.finalState.combatants) {
  if (c.kind === 'pet' && c.isDead && c.ownerHeroId && !newPetsDown.includes(c.ownerHeroId)) {
    newPetsDown.push(c.ownerHeroId);
  }
}
```

On the `player_defeat` (wipe) path: the run is ending, so `petsDownByHeroId` is no longer meaningful — leave the wipe-return shape unchanged (no pet-down field needed in `WipeOutcome`).

On the victory path: thread `newPetsDown` into the `runState` returned from `completeCombat` / `completeSurpriseCombat`. Same change in both functions.

### `src/run/milestones.ts` — handler + detector

```typescript
export const MILESTONES: Record<MilestoneId, MilestoneHandler> = {
  first_crypt_clear: /* unchanged */,
  first_sunken_keep_clear: (state) => {
    if (state.unlocks.classes.includes('hunter')) return state;
    return {
      ...state,
      unlocks: { ...state.unlocks, classes: [...state.unlocks.classes, 'hunter'] },
    };
  },
};

export function detectBossMilestones(
  dungeonId: DungeonId,
  floorNumber: number,
): readonly MilestoneId[] {
  if (dungeonId === 'crypt' && floorNumber === DUNGEONS.crypt.floorsPerRun) {
    return ['first_crypt_clear'];
  }
  if (dungeonId === 'sunken_keep' && floorNumber === DUNGEONS.sunken_keep.floorsPerRun) {
    return ['first_sunken_keep_clear'];
  }
  return [];
}
```

The handler is scaffolded as a separate entry — Cluster D · 5 (Chapel) and · 6 (Training Grounds) extend it the same way Paladin extended `first_crypt_clear`.

### `src/save/save.ts` + `src/save/migration.ts` — schema bump

Bump `CURRENT_SCHEMA_VERSION` from `2` to `3`. Register `MIGRATIONS[2]`:

```typescript
// v2 → v3: introduce Hero.petSpeciesId (defensive — no Hunters can exist pre-v3)
// and RunState.petsDownByHeroId (default to []). Hunter spec, 2026-05-10.
2: (raw) => {
  const out: Record<string, unknown> = { ...raw, version: 3 };
  // Roster heroes — defensively backfill petSpeciesId on any Hunter (shouldn't exist pre-v3)
  const roster = out.roster as { heroes?: Array<Record<string, unknown>> } | undefined;
  if (roster?.heroes) {
    roster.heroes = roster.heroes.map((h) => {
      if (h.classId === 'hunter' && !h.petSpeciesId) {
        return { ...h, petSpeciesId: 'wolf' };  // fallback species
      }
      return h;
    });
  }
  // tavernCandidates — same treatment
  const candidates = out.tavernCandidates as Array<Record<string, unknown>> | undefined;
  if (candidates) {
    out.tavernCandidates = candidates.map((h) => {
      if (h.classId === 'hunter' && !h.petSpeciesId) {
        return { ...h, petSpeciesId: 'wolf' };
      }
      return h;
    });
  }
  // In-progress runState — backfill petsDownByHeroId; backfill party heroes
  const runState = out.runState as Record<string, unknown> | undefined;
  if (runState) {
    if (runState.petsDownByHeroId === undefined) {
      runState.petsDownByHeroId = [];
    }
    const party = runState.party as Array<Record<string, unknown>> | undefined;
    if (party) {
      runState.party = party.map((h) => {
        if (h.classId === 'hunter' && !h.petSpeciesId) {
          return { ...h, petSpeciesId: 'wolf' };
        }
        return h;
      });
    }
  }
  return out;
},
```

**Defensive backfill:** no Hunters can exist in pre-v3 saves (the class wasn't recruitable), so the heroes-loop branches are no-ops in practice. They exist for paranoia + clarity. The only real-world effect of the migration is `runState.petsDownByHeroId = []` for in-progress runs.

### gdd patch

Same PR: edit gdd.md line 87 (§3 row 7), change "Unlocks: first Warren clear." → "Unlocks: first Sunken Keep clear." Aligns with §9 meta-progression and the spec.

## Test impact

### New tests

- **`src/data/__tests__/classes.test.ts`** — assert `CLASSES.hunter` is registered with the expected shape (chassis, abilities, aiPriority, primaryStat, weapon).
- **`src/data/__tests__/abilities.test.ts`** — add the 10 new ability ids to `EXPECTED_IDS`. Effect-shape tests for Hunter and pet abilities. Assert `command_strike` has `aiCondition.kind === 'petAlive'`.
- **`src/data/__tests__/pet_species.test.ts` (new file)** — assert `PET_SPECIES` has all three entries with valid stats / abilities / aiPriority. Assert each species' aiPriority entries are subsets of its abilities.
- **`src/data/__tests__/perks.test.ts`** — assert `beastmaster` and `sharpshooter` are registered and class-paired with `'hunter'`. Assert `beastmaster.petAttackBonus === 2`.
- **`src/combat/__tests__/combatant.test.ts`** — `createPetCombatant` returns the correct shape; attack scales correctly with hunter effective attack + perk bonus.
- **`src/combat/__tests__/command_strike.test.ts` (new file)** — integration: Hunter casts `command_strike`, pet performs its AI-picked ability immediately, pet still acts on its own initiative this round (= 2 pet actions in the round). With pet dead, `command_strike` is gated out by `petAlive` (Hunter picks next-priority ability instead). With a hand-built state where pet is dead and Hunter forces `command_strike`, the effect no-ops gracefully and the Hunter cooldown still ticks.
- **`src/combat/__tests__/pet_in_combat.test.ts` (new file)** — pet placed at slot 4, takes a turn per round, AI picks per its priority. Pet collapses to slot 3/2/1 correctly when player heroes die ahead of it.
- **`src/run/__tests__/combat_setup.test.ts`** — `buildCombatState` adds a pet combatant for a Hunter party member (provided pet not down). With `petsDownByHeroId` containing the Hunter's id, no pet combatant is built.
- **`src/run/__tests__/run_state.test.ts`** — pet down post-combat appends `ownerHeroId` to `petsDownByHeroId`. Hero HP write-back skips pet combatants. Camp-node visit clears `petsDownByHeroId`.
- **`src/run/__tests__/milestones.test.ts`** — `first_sunken_keep_clear` handler appends `'hunter'` to `unlocks.classes` idempotently. `detectBossMilestones` returns `['first_sunken_keep_clear']` when called with `('sunken_keep', floorsPerRun)`.
- **`src/save/__tests__/migration.test.ts`** — v2 → v3 migration backfills `petsDownByHeroId: []` on an in-progress runState; defensive Hunter petSpeciesId backfill works.
- **Tavern integration** — Hunter candidates have a rolled `petSpeciesId` after milestone fires.

### Existing tests that need updating

- `src/run/__tests__/milestones.test.ts` — the existing `first_crypt_clear` tests should be unaffected.
- `src/run/__tests__/run_state.test.ts` — any test that ends a Sunken Keep run by clearing the boss should add a parallel `expect(after.unlocks.classes).toContain('hunter')` assertion (mirroring how Paladin tests were extended).
- Per saved memory `feedback_grep_tests_before_data_edits`: grep `__tests__/` for `PARTY_SIZE`, `combatants.length`, `kind === 'hero'`, and any test that hand-builds a `CombatState` — pet additions may break length-equals-3 assertions.

## Risks and open questions

- **`commandPet` recursion** — pets don't have `command_strike`, so `commandPet` cannot recurse via the data. The implementation should still defensively guard (no-op if a `commandPet` effect resolves to an ability that itself contains a `commandPet` effect). Unit test asserts this.
- **`aiCondition` signature widening** — adding `petAlive` to `AiCondition` requires `checkAiCondition` to accept `state` (for the `combatants.some(...)` lookup). One-line signature change in `ability_priority.ts`; all existing call sites pass `state` since they have it. Confirm during implementation.
- **Pet sprite resolution** — `scenes/combat_playback.ts` and `render/combat_actor.ts` currently branch on `kind === 'hero'` vs `kind === 'enemy'` for sprite/atlas selection. Pet (`kind === 'pet'`) will need a third branch that resolves via `petSpeciesId`. Out of scope as a *core* spec item but required for the feature to render at all. Task in the implementation plan should call out a placeholder mapping (wolf → existing wolf NPC frame, etc.) and flag bespoke art as Cluster C work.
- **Hunter idle-pose paperdoll** — Hunter's paperdoll uses bow + body + outfit + hair (no shield). Should look fine with existing layers. Flag any visual oddities during browser smoke (e.g., bow-string clip on certain bodies).
- **Tavern recruitment pool** — `generateCandidates` reads `unlockedClasses` (a `readonly ClassId[]` param) and rolls candidates from that set. The recruitment path is already unlock-driven (Paladin verified this works). The hardcoded `['knight', 'archer', 'priest']` at `tavern.ts:58` is `generateStarterRoster`, the new-game seed for the Tier-1 starter trio — not a recruitment path. **No tavern code change needed for Hunter to appear in the hire pool.** Hunter pet-roll happens inside `generateCandidates` (or wherever Hunter heroes are constructed), not at the unlock-list level.
- **`buildCombatState` callers** — every test that calls `buildCombatState(party, encounter)` continues to work (third param defaults to `[]`). Production callers in `run_state.ts`/`scenes/combat_scene.ts` must pass `runState.petsDownByHeroId`. Grep for `buildCombatState(` to enumerate.
- **Pet HP non-persistence between encounters** — explicit design decision (full HP at start of every combat unless downed). If playtesting shows pets feel "too renewable" — an issue at the low end of difficulty — the easy fix is to persist pet HP in `RunState.petCurrentHpByHeroId` and reset it only at camp. Flagged for future tuning, not this spec.
- **Beastmaster perk shape** — adding `petAttackBonus?: number` to `PerkDef` is the smallest viable schema change. Future pet-buffing perks (e.g., +pet HP, +pet defense) can extend this pattern with parallel optional fields, OR the perk system can be refactored to a more general "applies-to" registry. Out of scope; flag if a third pet-buffing perk lands.
- **Action-economy balance** — Hunter parties have 4 turns/round; other parties have 3. Combined with `command_strike` (5th pet-action on a 3-turn cooldown), Hunter parties may overpower content tuned for 3-actor parties. Numbers are a tuning pass, not a structural risk; flag during implementation playtesting.

## Future spec hooks (not implemented here)

- **Cluster D · 5 (Chapel)** — extends `first_sunken_keep_clear` handler to also unlock the Chapel building.
- **Cluster D · 6 (Training Grounds)** — same handler extension for Training Grounds.
- **Spear weapon** — adds `'spear'` to `WeaponType`, defines spear-tier items, adds Hunter `swapTarget` / `weaponSwaps` for spear. Hunter's "Bow / Spear" gdd line gets fully realized.
- **Pet swap camp action** — a future camp-side feature to "rebond" a Hunter with a different species. Likely Cluster D follow-up.
- **Bespoke pet sprite art** — Cluster C art polish task once placeholders ship.
