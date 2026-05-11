# Hunter Class Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Hunter class (Cluster D · 4) — a ranged class that bonds with a pet (wolf / hawk / bear) acting as a free 4th combatant in slot 4. Unlock gates on first Sunken Keep clear.

**Architecture:** Pet is a peer `Combatant` with new `kind: 'pet'`. Pet attack scales from the owning Hunter's effective Attack at combat-setup time. Pet down → out for the run; respawns at any post-boss camp node. New `commandPet` effect kind lets the Hunter trigger an immediate pet action; new `petAlive` AI condition gates that ability. Save schema bumps from v2 → v3.

**Tech Stack:** TypeScript, Vitest (no browser harness for engine logic), Phaser only in scenes (firewall preserved).

**Spec:** `docs/superpowers/specs/2026-05-10-hunter-class-design.md`

---

## File Structure

**Created:**
- `src/data/pet_species.ts` — PetSpeciesDef + PET_SPECIES registry (wolf, hawk, bear).
- `src/data/__tests__/pet_species.test.ts` — registry shape tests.

**Modified:**
- `src/data/types.ts` — widens ClassId, AbilityId, MilestoneId, PerkId, PerkDef, AbilityEffect, AiCondition, Combatant kind/fields.
- `src/data/abilities.ts` — adds 4 Hunter abilities + 6 pet abilities.
- `src/data/classes.ts` — adds `hunter` entry to CLASSES.
- `src/data/perks.ts` — adds `beastmaster` and `sharpshooter` perks.
- `src/data/__tests__/abilities.test.ts` — extends EXPECTED_IDS + effect-shape tests.
- `src/data/__tests__/classes.test.ts` — Hunter shape tests.
- `src/data/__tests__/perks.test.ts` — Hunter perk tests.
- `src/combat/types.ts` — Combatant.kind widening + ownerHeroId/petSpeciesId fields.
- `src/combat/combatant.ts` — adds `createPetCombatant`.
- `src/combat/__tests__/combatant.test.ts` — `createPetCombatant` tests.
- `src/combat/ability_priority.ts` — extends `checkAiCondition` for `petAlive`.
- `src/combat/__tests__/ability_priority.test.ts` — petAlive tests.
- `src/combat/effects.ts` — extends `applyEffect` switch with `commandPet` case.
- `src/combat/__tests__/effects.test.ts` — commandPet tests.
- `src/heroes/hero.ts` — adds `petSpeciesId?` to Hero, plus optional param on `createHero`.
- `src/heroes/__tests__/hero.test.ts` — `createHero` with petSpeciesId test.
- `src/run/run_state.ts` — adds `petsDownByHeroId` to RunState; threads through `startRun` / `completeCombat` / `completeSurpriseCombat`.
- `src/run/__tests__/run_state.test.ts` — petsDownByHeroId tests.
- `src/run/combat_setup.ts` — extends `buildCombatState` with pet pass + 3rd param.
- `src/run/__tests__/combat_setup.test.ts` — pet build tests.
- `src/dungeon/camp_node.ts` — `applyCampNodeEffect` resets `petsDownByHeroId`.
- `src/dungeon/__tests__/camp_node.test.ts` — pet respawn test.
- `src/run/milestones.ts` — adds `first_sunken_keep_clear` handler + detector entry.
- `src/run/__tests__/milestones.test.ts` — handler + detector tests.
- `src/save/migration.ts` — bumps `CURRENT_SCHEMA_VERSION` to 3, adds `MIGRATIONS[2]`.
- `src/save/__tests__/migration.test.ts` — v2 → v3 test.
- `src/camp/buildings/tavern.ts` — `generateCandidate` rolls `petSpeciesId` for Hunter candidates.
- `src/camp/buildings/__tests__/tavern.test.ts` — Hunter candidate has petSpeciesId.
- `gdd.md` — fixes §3 row 7 (Warren → Sunken Keep).

---

## Phase 1 — Data Foundation

### Task 1: Hunter own-kit abilities

**Files:**
- Modify: `src/data/types.ts` (widen `AbilityId`)
- Modify: `src/data/abilities.ts` (add 4 entries)
- Modify: `src/data/__tests__/abilities.test.ts` (add to EXPECTED_IDS + effect-shape tests)

- [ ] **Step 1: Write the failing test for the 4 new Hunter ability ids**

In `src/data/__tests__/abilities.test.ts`, append to `EXPECTED_IDS` (after the Paladin block):

```typescript
  // Hunter
  'hunter_shoot',
  'hunters_mark',
  'crippling_shot',
  'command_strike',
];
```

Add a new `describe` block at the end of the file:

```typescript
describe('hunter abilities', () => {
  it('hunter_shoot is a basic single-target ranged attack', () => {
    const a = ABILITIES.hunter_shoot;
    expect(a.canCastFrom).toEqual([1, 2, 3]);
    expect(a.target.side).toBe('enemy');
    expect(a.target.pick).toBe('first');
    expect(a.effects).toHaveLength(1);
    const eff = a.effects[0] as Extract<AbilityEffect, { kind: 'damage' }>;
    expect(eff.kind).toBe('damage');
    expect(eff.scalingStat).toBe('attack');
  });

  it('hunters_mark applies marked status with damageBonus', () => {
    const a = ABILITIES.hunters_mark;
    expect(a.cooldown).toBe(4);
    const filter = a.target.filter as Extract<TargetFilter, { kind: 'lacksStatus' }>;
    expect(filter.kind).toBe('lacksStatus');
    expect(filter.statusId).toBe('marked');
    const eff = a.effects[0] as Extract<AbilityEffect, { kind: 'mark' }>;
    expect(eff.kind).toBe('mark');
    expect(eff.statusId).toBe('marked');
    expect(eff.damageBonus).toBe(2);
    expect(eff.duration).toBe(3);
  });

  it('crippling_shot deals damage and applies slowed', () => {
    const a = ABILITIES.crippling_shot;
    expect(a.cooldown).toBe(3);
    expect(a.canCastFrom).toEqual([2, 3]);
    const damage = a.effects.find((e) => e.kind === 'damage');
    expect(damage).toBeDefined();
    const debuff = a.effects.find((e) => e.kind === 'debuff') as
      | Extract<AbilityEffect, { kind: 'debuff' }>
      | undefined;
    expect(debuff).toBeDefined();
    expect(debuff!.statusId).toBe('slowed');
    expect(debuff!.stat).toBe('speed');
    expect(debuff!.delta).toBe(-2);
  });

  it('command_strike has commandPet effect, petAlive aiCondition, self target', () => {
    const a = ABILITIES.command_strike;
    expect(a.cooldown).toBe(3);
    expect(a.target.side).toBe('self');
    expect(a.aiCondition).toEqual({ kind: 'petAlive' });
    expect(a.effects).toHaveLength(1);
    expect(a.effects[0].kind).toBe('commandPet');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/__tests__/abilities.test.ts`
Expected: TypeScript compile error — `'hunter_shoot'` is not assignable to `AbilityId`; or `commandPet` is not a valid effect kind; or `petAlive` is not a valid AiCondition kind.

- [ ] **Step 3: Widen AbilityId in `src/data/types.ts`**

Find the `export type AbilityId =` union. After the Paladin block, append:

```typescript
  // Hunter
  | 'hunter_shoot'
  | 'hunters_mark'
  | 'crippling_shot'
  | 'command_strike';
```

(Move the closing `;` to the new last line; remove it from the previous last line.)

- [ ] **Step 4: Widen AbilityEffect to include `commandPet`**

In `src/data/types.ts`, append to the `AbilityEffect` union:

```typescript
  | { kind: 'commandPet' };
```

(Same `;` shuffle as above.)

- [ ] **Step 5: Widen AiCondition to include `petAlive`**

In `src/data/types.ts`, append to the `AiCondition` union:

```typescript
  | { kind: 'petAlive' };
```

- [ ] **Step 6: Add Hunter ability entries to `src/data/abilities.ts`**

Append to the `ABILITIES` record (preserve trailing comma style of the file):

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

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/data/__tests__/abilities.test.ts`
Expected: PASS for the 4 new Hunter tests + the existing EXPECTED_IDS list test.

NOTE: TypeScript may still error on `applyEffect` switch in `src/combat/effects.ts` (exhaustiveness — `commandPet` not handled) and on `checkAiCondition` (petAlive not handled). These are addressed in Tasks 11 and 12; if the engine code uses an explicit `: never` exhaustiveness check, you may see a `tsc` error here. **Workaround:** add temporary `case 'commandPet': return;` to `applyEffect` and `case 'petAlive': return false;` to `checkAiCondition` to keep tsc green — these stubs are replaced with real logic in Tasks 11–12.

- [ ] **Step 8: Commit**

```bash
git add src/data/types.ts src/data/abilities.ts src/data/__tests__/abilities.test.ts src/combat/effects.ts src/combat/ability_priority.ts
git commit -m "Hunter abilities — types + 4 own-kit entries"
```

---

### Task 2: Pet abilities (wolf, hawk, bear)

**Files:**
- Modify: `src/data/types.ts` (widen `AbilityId` further)
- Modify: `src/data/abilities.ts` (add 6 entries)
- Modify: `src/data/__tests__/abilities.test.ts` (add to EXPECTED_IDS + tests)

- [ ] **Step 1: Write failing tests for the 6 pet ability ids**

In `src/data/__tests__/abilities.test.ts`, extend `EXPECTED_IDS` (after Hunter block):

```typescript
  // Pet kits
  'wolf_bite',
  'wolf_howl',
  'hawk_dive',
  'hawk_screech',
  'bear_maul',
  'bear_roar',
];
```

Append a new `describe` block:

```typescript
describe('pet abilities', () => {
  it('wolf_bite is a melee single-target attack from any slot', () => {
    const a = ABILITIES.wolf_bite;
    expect(a.canCastFrom).toEqual([1, 2, 3, 4]);
    expect(a.target.slots).toEqual([1, 2]);
    expect(a.effects[0].kind).toBe('damage');
  });

  it('wolf_howl buffs allies (excluding caster) with blessed +1 attack', () => {
    const a = ABILITIES.wolf_howl;
    expect(a.cooldown).toBe(4);
    expect(a.target.side).toBe('ally');
    expect(a.target.slots).toBe('all');
    expect(a.target.includeCaster).toBe(false);
    const eff = a.effects[0] as Extract<AbilityEffect, { kind: 'buff' }>;
    expect(eff.statusId).toBe('blessed');
    expect(eff.stat).toBe('attack');
    expect(eff.delta).toBe(1);
  });

  it('hawk_dive targets back-row enemies with bonus crit', () => {
    const a = ABILITIES.hawk_dive;
    expect(a.target.slots).toEqual([3, 4]);
    const eff = a.effects[0] as Extract<AbilityEffect, { kind: 'damage' }>;
    expect(eff.bonusCrit).toBe(10);
  });

  it('hawk_screech is AoE enemy damage', () => {
    const a = ABILITIES.hawk_screech;
    expect(a.cooldown).toBe(4);
    expect(a.target.slots).toBe('all');
    expect(a.effects[0].kind).toBe('damage');
  });

  it('bear_maul targets slot-1 enemy from any slot', () => {
    const a = ABILITIES.bear_maul;
    expect(a.target.slots).toEqual([1]);
  });

  it('bear_roar is AoE damage with chance-stun', () => {
    const a = ABILITIES.bear_roar;
    expect(a.cooldown).toBe(4);
    expect(a.target.slots).toBe('all');
    expect(a.effects).toHaveLength(2);
    const stun = a.effects.find((e) => e.kind === 'stun') as Extract<AbilityEffect, { kind: 'stun' }>;
    expect(stun).toBeDefined();
    expect(stun.chance).toBe(0.2);
    expect(stun.duration).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests, verify failing**

Run: `npx vitest run src/data/__tests__/abilities.test.ts`
Expected: FAIL — `'wolf_bite'` etc. not assignable to `AbilityId`.

- [ ] **Step 3: Widen AbilityId for pets**

In `src/data/types.ts`, after the Hunter block, append:

```typescript
  // Pet kits
  | 'wolf_bite'
  | 'wolf_howl'
  | 'hawk_dive'
  | 'hawk_screech'
  | 'bear_maul'
  | 'bear_roar';
```

- [ ] **Step 4: Add pet ability entries to `src/data/abilities.ts`**

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

- [ ] **Step 5: Run tests, verify passing**

Run: `npx vitest run src/data/__tests__/abilities.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/types.ts src/data/abilities.ts src/data/__tests__/abilities.test.ts
git commit -m "Hunter abilities — pet kits (wolf/hawk/bear)"
```

---

### Task 3: Pet species data + module

**Files:**
- Create: `src/data/pet_species.ts`
- Create: `src/data/__tests__/pet_species.test.ts`
- Modify: `src/data/types.ts` (add `PetSpeciesId`)

- [ ] **Step 1: Write failing tests for PET_SPECIES registry**

Create `src/data/__tests__/pet_species.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { PET_SPECIES } from '../pet_species';
import { ABILITIES } from '../abilities';
import type { PetSpeciesId } from '../types';

const EXPECTED: readonly PetSpeciesId[] = ['wolf', 'hawk', 'bear'];

describe('PET_SPECIES registry', () => {
  it('contains exactly the 3 species', () => {
    expect(Object.keys(PET_SPECIES).sort()).toEqual([...EXPECTED].sort());
  });

  it('each species has preferredSlots [4]', () => {
    for (const id of EXPECTED) {
      expect(PET_SPECIES[id].preferredSlots).toEqual([4]);
    }
  });

  it('each species references valid AbilityIds', () => {
    for (const id of EXPECTED) {
      const def = PET_SPECIES[id];
      expect(ABILITIES[def.basicAbility]).toBeDefined();
      for (const a of def.abilities) {
        expect(ABILITIES[a]).toBeDefined();
      }
    }
  });

  it('each species aiPriority is a subset of its abilities', () => {
    for (const id of EXPECTED) {
      const def = PET_SPECIES[id];
      for (const a of def.aiPriority) {
        expect(def.abilities).toContain(a);
      }
    }
  });

  it('all species are tagged beast', () => {
    for (const id of EXPECTED) {
      expect(PET_SPECIES[id].tags).toContain('beast');
    }
  });

  it('attackScaleFromHunter is a positive fraction', () => {
    for (const id of EXPECTED) {
      const s = PET_SPECIES[id].attackScaleFromHunter;
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run, verify failing**

Run: `npx vitest run src/data/__tests__/pet_species.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Add `PetSpeciesId` to `src/data/types.ts`**

After `ClassId`:

```typescript
export type PetSpeciesId = 'wolf' | 'hawk' | 'bear';
```

- [ ] **Step 4: Create `src/data/pet_species.ts`**

```typescript
import type { Stats } from '@combat/types';
import type { AbilityId, CombatantTag, PetSpeciesId, SlotIndex } from './types';

export interface PetSpeciesDef {
  id: PetSpeciesId;
  name: string;
  baseStats: Stats;
  /** Pet attack at combat-setup = round(scale * hunterEffectiveAttack) + perkBonus.
   *  baseStats.attack is a sentinel 0; the species attack budget is fully captured here. */
  attackScaleFromHunter: number;
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

- [ ] **Step 5: Run, verify passing**

Run: `npx vitest run src/data/__tests__/pet_species.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/types.ts src/data/pet_species.ts src/data/__tests__/pet_species.test.ts
git commit -m "Hunter — pet species registry (wolf/hawk/bear)"
```

---

### Task 4: Hunter class entry

**Files:**
- Modify: `src/data/types.ts` (widen `ClassId`)
- Modify: `src/data/classes.ts` (add `hunter`)
- Modify: `src/data/__tests__/classes.test.ts` (Hunter shape tests)

- [ ] **Step 1: Write failing tests**

In `src/data/__tests__/classes.test.ts`, append:

```typescript
describe('hunter class', () => {
  it('has the expected chassis', () => {
    const c = CLASSES.hunter;
    expect(c.id).toBe('hunter');
    expect(c.baseStats).toEqual({
      hp: 14, attack: 4, defense: 2, speed: 4, mind: 0, crit: 10, dodge: 10,
    });
    expect(c.primaryStat).toBe('attack');
    expect(c.preferredWeapon).toBe('bow');
    expect(c.weaponFamily).toBe('ranged');
  });

  it('has the expected ability set', () => {
    const c = CLASSES.hunter;
    expect(c.basicAbility).toBe('hunter_shoot');
    expect([...c.abilities].sort()).toEqual(
      ['command_strike', 'crippling_shot', 'hunter_shoot', 'hunters_mark']
    );
    expect(c.aiPriority[0]).toBe('command_strike');
  });

  it('starter loadout is bow_basic only (no shield, no spear)', () => {
    const c = CLASSES.hunter;
    expect(c.starterLoadout.weapon).toBe('bow_basic');
    expect(c.starterLoadout.shield).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, verify failing**

Run: `npx vitest run src/data/__tests__/classes.test.ts`
Expected: FAIL — `'hunter'` not assignable to ClassId, or CLASSES.hunter missing.

- [ ] **Step 3: Widen ClassId**

In `src/data/types.ts`, change:

```typescript
export type ClassId = 'knight' | 'archer' | 'priest' | 'barbarian' | 'rogue' | 'mage' | 'paladin' | 'hunter';
```

- [ ] **Step 4: Add `hunter` entry to CLASSES**

In `src/data/classes.ts`, append (after `paladin`):

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

- [ ] **Step 5: Run, verify passing**

Run: `npx vitest run src/data/__tests__/classes.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/types.ts src/data/classes.ts src/data/__tests__/classes.test.ts
git commit -m "Hunter class — CLASSES entry"
```

---

### Task 5: Hunter perks (beastmaster + sharpshooter)

**Files:**
- Modify: `src/data/types.ts` (widen `PerkId`, extend `PerkDef`)
- Modify: `src/data/perks.ts` (add 2 entries)
- Modify: `src/data/__tests__/perks.test.ts` (assertions)

- [ ] **Step 1: Write failing tests**

In `src/data/__tests__/perks.test.ts`, append:

```typescript
describe('hunter perks', () => {
  it('beastmaster: pet-only +2 attack via petAttackBonus field', () => {
    const p = PERKS.beastmaster;
    expect(p.classId).toBe('hunter');
    expect(p.petAttackBonus).toBe(2);
    expect(p.statEffects ?? []).toEqual([]);
  });

  it('sharpshooter: hero +2 attack via statEffects', () => {
    const p = PERKS.sharpshooter;
    expect(p.classId).toBe('hunter');
    expect(p.petAttackBonus).toBeUndefined();
    expect(p.statEffects).toEqual([{ stat: 'attack', delta: 2 }]);
  });
});
```

- [ ] **Step 2: Run, verify failing**

Run: `npx vitest run src/data/__tests__/perks.test.ts`
Expected: FAIL — `'beastmaster'` not assignable; `petAttackBonus` not a property.

- [ ] **Step 3: Widen PerkId + extend PerkDef in `src/data/types.ts`**

```typescript
export type PerkId =
  | /* existing */
  | 'arcane_power' | 'quick_cast'
  // Paladin
  | 'righteous' | 'vindicator'
  // Hunter
  | 'beastmaster' | 'sharpshooter';

export interface PerkDef {
  id: PerkId;
  name: string;
  description: string;
  classId: ClassId;
  statEffects?: readonly TraitStatEffect[];
  hpEffect?: TraitHpEffect;
  petAttackBonus?: number;
}
```

- [ ] **Step 4: Add perk entries to `src/data/perks.ts`**

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
  description: "+2 Attack. Hunter's shots hit harder.",
  classId: 'hunter',
  statEffects: [{ stat: 'attack', delta: 2 }],
},
```

- [ ] **Step 5: Run, verify passing**

Run: `npx vitest run src/data/__tests__/perks.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/types.ts src/data/perks.ts src/data/__tests__/perks.test.ts
git commit -m "Hunter perks — beastmaster + sharpshooter"
```

---

## Phase 2 — Combatant + Engine

### Task 6: Widen `Combatant.kind` + add pet bookkeeping fields

**Files:**
- Modify: `src/combat/types.ts`

- [ ] **Step 1: Skip writing a test (purely additive type-only change)**

This task widens types and adds optional fields. There's no behavioral assertion to write — TDD doesn't apply cleanly. Type-checks act as the test (`tsc --noEmit` or `npm run build`).

- [ ] **Step 2: Modify `src/combat/types.ts`**

Change the `kind` field on `Combatant`:

```typescript
kind: 'hero' | 'enemy' | 'pet';
```

Add two new optional fields (group with the existing optional bag):

```typescript
ownerHeroId?: string;          // pet → owning Hunter's Hero.id
petSpeciesId?: PetSpeciesId;   // pet → species id (for sprite resolution)
```

Add the import:

```typescript
import type {
  /* existing imports */
  PetSpeciesId,
} from '@data/types';
```

- [ ] **Step 3: Verify type-check passes**

Run: `npm run build`
Expected: build passes. The widening is non-breaking (no existing code creates `kind: 'pet'`); the optional fields are non-breaking.

NOTE: If `tsc` complains about exhaustiveness in any switch statement on `kind`, locate the switch and add `case 'pet': /* fallthrough or no-op */` as appropriate. Likely sites: `src/render/combat_actor.ts` (sprite resolution — adding the `'pet'` branch is part of Task 16's scope; for now a placeholder fallthrough is fine).

- [ ] **Step 4: Commit**

```bash
git add src/combat/types.ts
git commit -m "Combatant — widen kind to include 'pet' + add pet fields"
```

---

### Task 7: `createPetCombatant`

**Files:**
- Modify: `src/combat/combatant.ts`
- Modify: `src/combat/__tests__/combatant.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/combat/__tests__/combatant.test.ts`:

```typescript
import { createPetCombatant } from '../combatant';
import { PET_SPECIES } from '@data/pet_species';

describe('createPetCombatant', () => {
  it('builds a wolf with attack scaled from hunter Attack=10', () => {
    const pet = createPetCombatant('wolf', 'hunter_id_1', 10);
    expect(pet.kind).toBe('pet');
    expect(pet.side).toBe('player');
    expect(pet.slot).toBe(4);
    expect(pet.ownerHeroId).toBe('hunter_id_1');
    expect(pet.petSpeciesId).toBe('wolf');
    // wolf scale 0.6 × 10 = 6
    expect(pet.baseStats.attack).toBe(6);
    expect(pet.baseStats.hp).toBe(PET_SPECIES.wolf.baseStats.hp);
    expect(pet.maxHp).toBe(PET_SPECIES.wolf.baseStats.hp);
    expect(pet.currentHp).toBe(PET_SPECIES.wolf.baseStats.hp);
    expect(pet.tags).toContain('beast');
    expect(pet.preferredSlots).toEqual([4]);
    expect(pet.id).toBe('pet_hunter_id_1');
  });

  it('applies petAttackBonus on top of the scaled attack', () => {
    const pet = createPetCombatant('hawk', 'h2', 8, 2);
    // hawk scale 0.5 × 8 = 4, +2 perk bonus = 6
    expect(pet.baseStats.attack).toBe(6);
  });

  it('rounds the scaled attack', () => {
    // bear scale 0.4 × 7 = 2.8 → 3
    const pet = createPetCombatant('bear', 'h3', 7);
    expect(pet.baseStats.attack).toBe(3);
  });

  it('uses species abilities and aiPriority', () => {
    const pet = createPetCombatant('wolf', 'h4', 10);
    expect(pet.abilities).toEqual(PET_SPECIES.wolf.abilities);
    expect(pet.aiPriority).toEqual(PET_SPECIES.wolf.aiPriority);
  });
});
```

- [ ] **Step 2: Run, verify failing**

Run: `npx vitest run src/combat/__tests__/combatant.test.ts`
Expected: FAIL — `createPetCombatant` not exported.

- [ ] **Step 3: Implement `createPetCombatant`**

In `src/combat/combatant.ts`, add imports:

```typescript
import { PET_SPECIES } from '@data/pet_species';
import type { PetSpeciesId } from '@data/types';
```

Append the function:

```typescript
export function createPetCombatant(
  speciesId: PetSpeciesId,
  ownerHeroId: string,
  hunterEffectiveAttack: number,
  petAttackBonus: number = 0,
  petId: CombatantId = `pet_${ownerHeroId}`,
): Combatant {
  const def = PET_SPECIES[speciesId];
  const computedAttack =
    Math.round(def.attackScaleFromHunter * hunterEffectiveAttack) + petAttackBonus;
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

- [ ] **Step 4: Run, verify passing**

Run: `npx vitest run src/combat/__tests__/combatant.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/combat/combatant.ts src/combat/__tests__/combatant.test.ts
git commit -m "Hunter — createPetCombatant with attack-scaling"
```

---

### Task 8: `petAlive` AI condition

**Files:**
- Modify: `src/combat/ability_priority.ts`
- Modify: `src/combat/__tests__/ability_priority.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/combat/__tests__/ability_priority.test.ts`. The file already imports `makeHeroCombatant`, `makeEnemyCombatant`, `makeTestState` from `./helpers` and `createRng` from `@util/rng`. Use them:

```typescript
import { createPetCombatant } from '../combatant';

describe('petAlive AI condition', () => {
  it('blocks command_strike when the Hunter has no living pet', () => {
    const hunter = makeHeroCombatant('hunter', 1, 'h_alone');
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e1');
    const state = makeTestState([hunter], [enemy]);
    const pick = pickAbility(hunter, state, createRng(1));
    expect(pick?.abilityId).not.toBe('command_strike');
  });

  it('allows command_strike when a pet is alive and owned by the Hunter', () => {
    const hunter = makeHeroCombatant('hunter', 1, 'h_with_pet');
    const pet = createPetCombatant('wolf', 'h_with_pet', 10);
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e1');
    const state = makeTestState([hunter, pet], [enemy]);
    const pick = pickAbility(hunter, state, createRng(1));
    expect(pick?.abilityId).toBe('command_strike');
  });

  it('blocks command_strike when the pet is dead', () => {
    const hunter = makeHeroCombatant('hunter', 1, 'h_dead_pet');
    const pet = createPetCombatant('wolf', 'h_dead_pet', 10);
    pet.isDead = true;
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e1');
    const state = makeTestState([hunter, pet], [enemy]);
    const pick = pickAbility(hunter, state, createRng(1));
    expect(pick?.abilityId).not.toBe('command_strike');
  });
});
```

- [ ] **Step 2: Run, verify failing**

Run: `npx vitest run src/combat/__tests__/ability_priority.test.ts`
Expected: FAIL — petAlive case not handled (the temp stub from Task 1 returns false unconditionally, so the "allows" case fails; or returns true unconditionally, so the "blocks" case fails).

- [ ] **Step 3: Update `checkAiCondition` signature + implement `petAlive`**

In `src/combat/ability_priority.ts`:

```typescript
function checkAiCondition(
  cond: AiCondition,
  caster: Combatant,
  targetIds: readonly CombatantId[],
  state: CombatState,
): boolean {
  switch (cond.kind) {
    case 'minTargets':
      return targetIds.length >= cond.n;
    case 'casterHpBelow':
      return caster.maxHp > 0 && caster.currentHp / caster.maxHp < cond.ratio;
    case 'petAlive':
      return state.combatants.some(
        (c) => c.kind === 'pet' && c.ownerHeroId === caster.id && !c.isDead,
      );
  }
}
```

Update the only call site (in `pickAbility`) to pass `state`:

```typescript
if (ability.aiCondition && !checkAiCondition(ability.aiCondition, caster, targetIds, state)) continue;
```

- [ ] **Step 4: Run, verify passing**

Run: `npx vitest run src/combat/__tests__/ability_priority.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/combat/ability_priority.ts src/combat/__tests__/ability_priority.test.ts
git commit -m "Hunter — petAlive AI condition for command_strike"
```

---

### Task 9: `commandPet` effect

**Files:**
- Modify: `src/combat/effects.ts`
- Modify: `src/combat/__tests__/effects.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/combat/__tests__/effects.test.ts`:

The file already imports `applyAbility`, `ABILITIES`, `createRng`, `makeHeroCombatant`, `makeEnemyCombatant`, `makeTestState`. Add one new import for `createPetCombatant`.

```typescript
import { createPetCombatant } from '../combatant';

describe('commandPet effect', () => {
  it('triggers the pet\'s AI-picked ability', () => {
    const hunter = makeHeroCombatant('hunter', 1, 'h1');
    const pet = createPetCombatant('wolf', 'h1', 10);
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e1');
    const state = makeTestState([hunter, pet], [enemy]);

    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.command_strike, hunter, [hunter.id], state, createRng(1), events);

    // wolf picks wolf_howl (cd 0, top priority) → applies blessed buff to ally hunter.
    // If howl filters out (no eligible allies), wolf_bite triggers damage on enemy.
    // Either way an ability_cast for the pet should appear in events.
    const petCasts = events.filter(
      (e) => e.kind === 'ability_cast' && e.casterId === pet.id,
    );
    expect(petCasts.length).toBe(1);
  });

  it('no-ops gracefully when the pet is dead', () => {
    const hunter = makeHeroCombatant('hunter', 1, 'h2');
    const pet = createPetCombatant('wolf', 'h2', 10);
    pet.isDead = true;
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e1');
    const state = makeTestState([hunter, pet], [enemy]);

    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.command_strike, hunter, [hunter.id], state, createRng(1), events);

    const petCasts = events.filter(
      (e) => e.kind === 'ability_cast' && e.casterId === pet.id,
    );
    expect(petCasts.length).toBe(0);
    // Hunter's command_strike cast event should still appear
    const hunterCasts = events.filter(
      (e) => e.kind === 'ability_cast' && e.casterId === hunter.id,
    );
    expect(hunterCasts.length).toBe(1);
  });

  it('sets cooldown on pet\'s triggered ability', () => {
    const hunter = makeHeroCombatant('hunter', 1, 'h3');
    const pet = createPetCombatant('wolf', 'h3', 10);
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e1');
    const state = makeTestState([hunter, pet], [enemy]);

    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.command_strike, hunter, [hunter.id], state, createRng(1), events);

    // wolf_howl has cooldown 4; setCooldown stores 4+1=5 per the convention in combat.ts.
    if (pet.cooldowns.wolf_howl !== undefined) {
      expect(pet.cooldowns.wolf_howl).toBeGreaterThanOrEqual(4);
    }
  });
});
```

- [ ] **Step 2: Run, verify failing**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t "commandPet"`
Expected: FAIL — the temp stub from Task 1 makes commandPet a no-op, so no pet cast events fire.

- [ ] **Step 3: Replace the stub with real `commandPet` resolution**

In `src/combat/effects.ts`, locate the temp stub `case 'commandPet': return;` inside `applyEffect` and replace it. Add an import at the top of the file if needed:

```typescript
import { pickAbility } from './ability_priority';
import { setCooldown } from './cooldowns';
import { ABILITIES } from '@data/abilities';
```

Replace the case body:

```typescript
case 'commandPet': {
  const pet = state.combatants.find(
    (c) => c.kind === 'pet' && c.ownerHeroId === caster.id && !c.isDead,
  );
  if (!pet) return;
  const picked = pickAbility(pet, state, rng);
  if (!picked) return;
  const petAbility = ABILITIES[picked.abilityId];
  // Defensive: a pet ability cannot itself be commandPet (only Hunters have command_strike).
  // If a future pet kit ever adds commandPet, no-op to avoid infinite recursion.
  if (petAbility.effects.some((e) => e.kind === 'commandPet')) return;
  applyAbility(petAbility, pet, picked.targetIds, state, rng, events);
  if (petAbility.cooldown !== undefined) {
    setCooldown(pet, petAbility.id, petAbility.cooldown + 1);
  }
  return;
}
```

- [ ] **Step 4: Run, verify passing**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t "commandPet"`
Expected: PASS for all three new tests.

- [ ] **Step 5: Commit**

```bash
git add src/combat/effects.ts src/combat/__tests__/effects.test.ts
git commit -m "Hunter — commandPet effect resolution"
```

---

## Phase 3 — Hero + RunState Plumbing

### Task 10: `Hero.petSpeciesId` + `createHero` param

**Files:**
- Modify: `src/heroes/hero.ts`
- Modify: `src/heroes/__tests__/hero.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/heroes/__tests__/hero.test.ts`:

```typescript
describe('createHero — Hunter petSpeciesId', () => {
  it('stores petSpeciesId on Hunter heroes when provided', () => {
    const hero = createHero(
      'hunter', 'Robin', 'h_robin', 'stout',
      'body_male_human', 'legs_default', 'feet_default',
      'wolf',
    );
    expect(hero.petSpeciesId).toBe('wolf');
  });

  it('leaves petSpeciesId undefined for non-Hunter classes', () => {
    const hero = createHero(
      'knight', 'Aldous', 'h_aldous', 'stout',
      'body_male_human',
    );
    expect(hero.petSpeciesId).toBeUndefined();
  });

  it('leaves petSpeciesId undefined for a Hunter when not provided', () => {
    const hero = createHero(
      'hunter', 'Mute', 'h_mute', 'quick',
      'body_female_human',
    );
    expect(hero.petSpeciesId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, verify failing**

Run: `npx vitest run src/heroes/__tests__/hero.test.ts -t "petSpeciesId"`
Expected: FAIL — `hero.petSpeciesId` not a property.

- [ ] **Step 3: Modify `src/heroes/hero.ts`**

Add to the `Hero` interface:

```typescript
petSpeciesId?: PetSpeciesId;
```

Add the import:

```typescript
import type { /* existing */, PetSpeciesId } from '@data/types';
```

Modify `createHero` signature to take an optional 8th param:

```typescript
export function createHero(
  classId: ClassId,
  name: string,
  id: string,
  traitId: TraitId,
  bodySpriteId: string,
  legsSpriteId: string = DEFAULT_LEGS_SPRITE,
  feetSpriteId: string = DEFAULT_FEET_SPRITE,
  petSpeciesId?: PetSpeciesId,
): Hero {
  const def = CLASSES[classId];
  const equipment = buildStarterEquipment(id, def.starterLoadout);
  const maxHp = computeMaxHp(def.baseStats.hp, TRAITS[traitId], equipment);
  return {
    id,
    classId,
    name,
    baseStats: { ...def.baseStats },
    currentHp: maxHp,
    maxHp,
    traitId,
    bodySpriteId,
    legsSpriteId,
    feetSpriteId,
    wounds: [],
    equipment,
    xp: 0,
    level: 1,
    pendingPerk: false,
    ...(petSpeciesId !== undefined && classId === 'hunter' ? { petSpeciesId } : {}),
  };
}
```

- [ ] **Step 4: Run, verify passing**

Run: `npx vitest run src/heroes/__tests__/hero.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/heroes/hero.ts src/heroes/__tests__/hero.test.ts
git commit -m "Hunter — Hero.petSpeciesId + createHero param"
```

---

### Task 11: `RunState.petsDownByHeroId` + startRun init

**Files:**
- Modify: `src/run/run_state.ts`
- Modify: `src/run/__tests__/run_state.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/run/__tests__/run_state.test.ts`:

```typescript
describe('petsDownByHeroId — initialization', () => {
  it('startRun seeds petsDownByHeroId to []', () => {
    const party = makeParty();  // existing helper in this test file
    const seed = 1;
    const rs = startRun('crypt', party, seed, createRng(seed));
    expect(rs.petsDownByHeroId).toEqual([]);
  });
});
```

`makeParty()` and `createRng` from `@util/rng` are already imported in this test file.

- [ ] **Step 2: Run, verify failing**

Expected: FAIL — `petsDownByHeroId` not in RunState.

- [ ] **Step 3: Modify `src/run/run_state.ts`**

Extend `RunState` interface:

```typescript
export interface RunState {
  /* existing fields */
  petsDownByHeroId: readonly string[];
}
```

Modify `startRun` to initialize the field:

```typescript
return {
  /* existing fields */
  petsDownByHeroId: [],
};
```

- [ ] **Step 4: Run all run_state tests, verify passing**

Run: `npx vitest run src/run/__tests__/run_state.test.ts`
Expected: PASS — including the new test and any existing tests that examine RunState shape.

NOTE: Tests that call `startRun` and snapshot the entire returned RunState may now show an additional `petsDownByHeroId: []` field. If `toEqual` snapshot tests fail, update them to include the field.

- [ ] **Step 5: Commit**

```bash
git add src/run/run_state.ts src/run/__tests__/run_state.test.ts
git commit -m "Hunter — RunState.petsDownByHeroId field + startRun init"
```

---

### Task 12: `buildCombatState` pet pass

**Files:**
- Modify: `src/run/combat_setup.ts`
- Modify: `src/run/__tests__/combat_setup.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/run/__tests__/combat_setup.test.ts`:

```typescript
import { createHero } from '@heroes/hero';

function huntersInParty(): Hero[] {
  const archer = createHero('archer', 'A', 'a1', 'stout', 'body_male_human');
  const knight = createHero('knight', 'K', 'k1', 'stout', 'body_male_human');
  const hunter = createHero(
    'hunter', 'Robin', 'r1', 'stout',
    'body_female_human', undefined, undefined, 'wolf',
  );
  return [knight, archer, hunter];
}

describe('buildCombatState — pet build pass', () => {
  it('appends a wolf pet at slot 4 for a Hunter party member', () => {
    const party = huntersInParty();
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState(party, encounter, []);
    const pet = state.combatants.find((c) => c.kind === 'pet');
    expect(pet).toBeDefined();
    expect(pet!.slot).toBe(4);
    expect(pet!.ownerHeroId).toBe('r1');
    expect(pet!.petSpeciesId).toBe('wolf');
  });

  it('skips the pet when the Hunter\'s id is in petsDownByHeroId', () => {
    const party = huntersInParty();
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState(party, encounter, ['r1']);
    const pet = state.combatants.find((c) => c.kind === 'pet');
    expect(pet).toBeUndefined();
  });

  it('builds no pet for a Hunter without petSpeciesId (defensive)', () => {
    const knight = createHero('knight', 'K', 'k1', 'stout', 'body_male_human');
    const archer = createHero('archer', 'A', 'a1', 'stout', 'body_male_human');
    const hunterNoPet = createHero('hunter', 'X', 'x1', 'stout', 'body_male_human');
    const party = [knight, archer, hunterNoPet];
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState(party, encounter, []);
    expect(state.combatants.find((c) => c.kind === 'pet')).toBeUndefined();
  });

  it('reads Beastmaster perk and adds petAttackBonus', () => {
    const knight = createHero('knight', 'K', 'k1', 'stout', 'body_male_human');
    const archer = createHero('archer', 'A', 'a1', 'stout', 'body_male_human');
    const hunter = createHero(
      'hunter', 'B', 'b1', 'stout',
      'body_male_human', undefined, undefined, 'bear',
    );
    hunter.perkId = 'beastmaster';
    const party = [knight, archer, hunter];
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState(party, encounter, []);
    const pet = state.combatants.find((c) => c.kind === 'pet');
    const huntCombatant = state.combatants.find((c) => c.id === 'p2');
    expect(pet).toBeDefined();
    // bear scale 0.4 × hunter effective attack + 2 perk bonus
    const expected = Math.round(0.4 * huntCombatant!.baseStats.attack) + 2;
    expect(pet!.baseStats.attack).toBe(expected);
  });
});
```

`FLAT_SCALE` and `Encounter` are already imported/defined in the file (top of `combat_setup.test.ts`). The empty-enemies encounter is the standard shape used throughout existing tests for combat-setup-shape checks.

- [ ] **Step 2: Run, verify failing**

Run: `npx vitest run src/run/__tests__/combat_setup.test.ts`
Expected: FAIL — `buildCombatState` doesn't accept a 3rd param; no pets in output.

- [ ] **Step 3: Modify `buildCombatState`**

In `src/run/combat_setup.ts`:

Add imports:

```typescript
import { createPetCombatant } from '@combat/combatant';
import { PERKS } from '@data/perks';
```

Update the signature:

```typescript
export function buildCombatState(
  party: readonly Hero[],
  encounter: Encounter,
  petsDownByHeroId: readonly string[] = [],
): CombatState {
```

After the existing hero-build loop (and before the enemy-build loop), insert:

```typescript
// Pet build pass — for each Hunter party member with a petSpeciesId whose pet
// isn't currently down for the run, add a pet combatant at slot 4.
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
```

- [ ] **Step 4: Run, verify passing**

Run: `npx vitest run src/run/__tests__/combat_setup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/run/combat_setup.ts src/run/__tests__/combat_setup.test.ts
git commit -m "Hunter — buildCombatState pet pass"
```

---

### Task 13: post-combat pet bookkeeping

**Files:**
- Modify: `src/run/run_state.ts` (`completeCombat` + `completeSurpriseCombat`)
- Modify: `src/run/__tests__/run_state.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/run/__tests__/run_state.test.ts`. Add a local helper after the existing `makeParty` helper:

```typescript
function makePartyWithHunter(): Hero[] {
  return [
    createHero('knight', 'K', 'h0', 'quick', 'body1'),
    createHero('archer', 'A', 'h1', 'quick', 'body1'),
    createHero('hunter', 'R', 'h_hunter', 'quick', 'body1', undefined, undefined, 'wolf'),
  ];
}

function mockCombatResultWithPet(
  party: readonly Hero[],
  hunterId: string,
  petIsDead: boolean,
  outcome: CombatResult['outcome'],
): CombatResult {
  const combatants = party.map((hero, i) =>
    createHeroCombatant(hero.classId, (i + 1) as SlotIndex, `p${i}`, {
      baseStats: hero.baseStats,
      currentHp: hero.currentHp,
      maxHp: hero.maxHp,
      isDead: false,
    }),
  );
  combatants.push({
    id: `pet_${hunterId}`,
    side: 'player',
    slot: 4,
    kind: 'pet',
    ownerHeroId: hunterId,
    petSpeciesId: 'wolf',
    baseStats: { hp: 14, attack: 6, defense: 2, speed: 5, mind: 0, crit: 10, dodge: 10 },
    currentHp: petIsDead ? 0 : 14,
    maxHp: 14,
    statuses: {},
    cooldowns: {},
    abilities: ['wolf_bite', 'wolf_howl'],
    aiPriority: ['wolf_howl', 'wolf_bite'],
    preferredSlots: [4],
    tags: ['beast'],
    isDead: petIsDead,
  });
  const state: CombatState = { combatants, round: 1, exhaustionLevel: 0 };
  return { finalState: state, events: [], outcome };
}
```

Then the tests:

```typescript
describe('petsDownByHeroId — post-combat bookkeeping', () => {
  it('completeCombat appends ownerHeroId when pet is dead in finalState', () => {
    const party = makePartyWithHunter();
    const seed = 1;
    let rs = startRun('crypt', party, seed, createRng(seed));
    rs = advanceToBossNode(rs);  // existing helper
    const result = mockCombatResultWithPet(party, 'h_hunter', true, 'player_victory');
    const { runState: after } = completeCombat(rs, result, createRng(2));
    expect(after.petsDownByHeroId).toContain('h_hunter');
  });

  it('does not duplicate when ownerHeroId already in petsDownByHeroId', () => {
    const party = makePartyWithHunter();
    const seed = 1;
    let rs = startRun('crypt', party, seed, createRng(seed));
    rs = advanceToBossNode(rs);
    rs = { ...rs, petsDownByHeroId: ['h_hunter'] };
    const result = mockCombatResultWithPet(party, 'h_hunter', true, 'player_victory');
    const { runState: after } = completeCombat(rs, result, createRng(2));
    expect(after.petsDownByHeroId.filter((id) => id === 'h_hunter')).toHaveLength(1);
  });

  it('does not append when pet is alive in finalState', () => {
    const party = makePartyWithHunter();
    const seed = 1;
    let rs = startRun('crypt', party, seed, createRng(seed));
    rs = advanceToBossNode(rs);
    const result = mockCombatResultWithPet(party, 'h_hunter', false, 'player_victory');
    const { runState: after } = completeCombat(rs, result, createRng(2));
    expect(after.petsDownByHeroId).not.toContain('h_hunter');
  });
});
```

(The exact `createRng` import name should match the rng helper already used by this test file — verify the import block at the top before adding.)

- [ ] **Step 2: Run, verify failing**

Run: `npx vitest run src/run/__tests__/run_state.test.ts -t "post-combat bookkeeping"`
Expected: FAIL — `petsDownByHeroId` returned unchanged.

- [ ] **Step 3: Modify `completeCombat` and `completeSurpriseCombat`**

In `src/run/run_state.ts`, in BOTH `completeCombat` and `completeSurpriseCombat`, after the existing hero-loop and BEFORE the `player_defeat` early-return, add:

```typescript
// Pet-down bookkeeping. Hero ids are 'p0'/'p1'/'p2'; pet ids are 'pet_${heroId}',
// so the hero loop above naturally skipped them.
const newPetsDown: string[] = [...runState.petsDownByHeroId];
for (const c of result.finalState.combatants) {
  if (c.kind === 'pet' && c.isDead && c.ownerHeroId && !newPetsDown.includes(c.ownerHeroId)) {
    newPetsDown.push(c.ownerHeroId);
  }
}
```

On the `player_defeat` (wipe) path, keep the wipe-return shape unchanged — `petsDownByHeroId` is irrelevant for an ended run; leave the existing `runState: { ...runState, party: [], fallen: allLost, ... }` block as-is (it doesn't include `petsDownByHeroId`, so the spread carries over the OLD value, which is fine — the run is over).

On the victory path, thread `petsDownByHeroId: newPetsDown` into the returned RunState. This means finding the existing return statement(s) for the victory path and adding the field to each.

- [ ] **Step 4: Run, verify passing**

Run: `npx vitest run src/run/__tests__/run_state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/run/run_state.ts src/run/__tests__/run_state.test.ts
git commit -m "Hunter — completeCombat tracks pet downs"
```

---

### Task 14: `applyCampNodeEffect` pet respawn

**Files:**
- Modify: `src/dungeon/camp_node.ts`
- Modify: `src/dungeon/__tests__/camp_node.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/dungeon/__tests__/camp_node.test.ts`:

Use existing test fixtures from `src/dungeon/__tests__/camp_node.test.ts`. The file already builds RunState fixtures with helpers; mirror them. Sketch:

```typescript
import { createRng } from '@util/rng';

describe('applyCampNodeEffect — pet respawn', () => {
  it('clears petsDownByHeroId on heal_party', () => {
    const baseRunState = makeRunStateForCampTest();  // existing test helper in this file
    const runState = { ...baseRunState, petsDownByHeroId: ['hunter_id_1', 'hunter_id_2'] };
    const after = applyCampNodeEffect(runState, { kind: 'heal_party' }, createRng(0));
    expect(after.petsDownByHeroId).toEqual([]);
  });

  it('clears petsDownByHeroId on treat_wound', () => {
    const baseRunState = makeRunStateForCampTest();
    // Inject a wound on hero 0 + a downed pet
    const wounded: Hero = { ...baseRunState.party[0], wounds: [{ id: 'bruised', runsRemaining: 2 }] };
    const runState = {
      ...baseRunState,
      party: [wounded, ...baseRunState.party.slice(1)],
      petsDownByHeroId: ['hunter_id_1'],
    };
    const after = applyCampNodeEffect(
      runState, { kind: 'treat_wound', heroIndex: 0, woundIndex: 0 }, createRng(0),
    );
    expect(after.petsDownByHeroId).toEqual([]);
    expect(after.party[0].wounds).toHaveLength(0);
  });
});
```

If the existing test file uses a different helper name than `makeRunStateForCampTest`, look at how the file's existing `applyCampNodeEffect` tests construct their RunState fixture and reuse that path.

- [ ] **Step 2: Run, verify failing**

Run: `npx vitest run src/dungeon/__tests__/camp_node.test.ts -t "pet respawn"`
Expected: FAIL — petsDownByHeroId returned unchanged.

- [ ] **Step 3: Modify `applyCampNodeEffect`**

In `src/dungeon/camp_node.ts`, replace the function body's first lines:

```typescript
export function applyCampNodeEffect(
  runState: RunState,
  choice: Exclude<CampNodeChoice, { kind: 'leave' }>,
  _rng: Rng,
): RunState {
  // Reset pets-down regardless of choice. The pet rests at camp.
  const respawned: RunState = { ...runState, petsDownByHeroId: [] };

  if (choice.kind === 'heal_party') {
    const newParty = respawned.party.map((hero) => {
      const healed = Math.round(hero.maxHp * HEAL_PARTY_PERCENT);
      return { ...hero, currentHp: Math.min(hero.maxHp, hero.currentHp + healed) };
    });
    return { ...respawned, party: newParty };
  }

  // treat_wound (operates on respawned)
  const { heroIndex, woundIndex } = choice;
  if (heroIndex < 0 || heroIndex >= respawned.party.length) {
    throw new Error(`applyCampNodeEffect: heroIndex ${heroIndex} out of range [0, ${respawned.party.length})`);
  }
  const hero = respawned.party[heroIndex];
  if (hero.wounds.length === 0) {
    throw new Error(`applyCampNodeEffect: hero at index ${heroIndex} has no wounds to treat`);
  }
  if (woundIndex < 0 || woundIndex >= hero.wounds.length) {
    throw new Error(`applyCampNodeEffect: woundIndex ${woundIndex} out of range [0, ${hero.wounds.length})`);
  }
  const newWounds = hero.wounds.filter((_, i) => i !== woundIndex);
  const newParty = respawned.party.map((h, i) =>
    i === heroIndex ? { ...h, wounds: newWounds } : h,
  );
  return { ...respawned, party: newParty };
}
```

(Diff is small: introduce `respawned` at the top, then operate on `respawned` instead of `runState` throughout the function.)

- [ ] **Step 4: Run, verify passing**

Run: `npx vitest run src/dungeon/__tests__/camp_node.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dungeon/camp_node.ts src/dungeon/__tests__/camp_node.test.ts
git commit -m "Hunter — applyCampNodeEffect resets pets-down"
```

---

## Phase 4 — Milestone Wiring

### Task 15: `first_sunken_keep_clear`

**Files:**
- Modify: `src/data/types.ts` (widen MilestoneId)
- Modify: `src/run/milestones.ts`
- Modify: `src/run/__tests__/milestones.test.ts`

- [ ] **Step 1: Write failing tests**

Modify `src/run/__tests__/milestones.test.ts`:

Replace the "has only the spec-2 entries" test:

```typescript
  it('has only the registered milestone ids', () => {
    expect(Object.keys(MILESTONES).sort()).toEqual(['first_crypt_clear', 'first_sunken_keep_clear']);
  });
```

Replace the "returns [] for sunken_keep clears" test:

```typescript
  it('returns [first_sunken_keep_clear] for sunken_keep canonical-final', () => {
    expect(detectBossMilestones('sunken_keep', 3)).toEqual(['first_sunken_keep_clear']);
  });
```

(Verify `DUNGEONS.sunken_keep.floorsPerRun === 3` matches; if it's 4, use 4 in the assertion.)

Append a new describe block:

```typescript
describe('first_sunken_keep_clear handler', () => {
  it('appends hunter to unlocks.classes on a fresh state', () => {
    const before = makeFakeSave({
      classes: ['knight', 'archer', 'priest', 'paladin'],
      dungeons: ['crypt', 'sunken_keep'],
    });
    const after = MILESTONES.first_sunken_keep_clear(before);
    expect(after.unlocks.classes).toContain('hunter');
    expect(after.unlocks.classes).toContain('paladin');  // preserves
  });

  it('is idempotent', () => {
    const before = makeFakeSave({
      classes: ['knight', 'hunter'],
      dungeons: ['crypt', 'sunken_keep'],
    });
    const after = MILESTONES.first_sunken_keep_clear(before);
    expect(after).toBe(before);
  });
});

describe('applyPendingMilestones — first_sunken_keep_clear', () => {
  it('runs the handler when id is in list', () => {
    const before = makeFakeSave({
      classes: ['knight'],
      dungeons: ['crypt', 'sunken_keep'],
    });
    const after = applyPendingMilestones(before, ['first_sunken_keep_clear']);
    expect(after.unlocks.classes).toContain('hunter');
  });
});
```

- [ ] **Step 2: Run, verify failing**

Run: `npx vitest run src/run/__tests__/milestones.test.ts`
Expected: FAIL — `'first_sunken_keep_clear'` not in MilestoneId; handler missing.

- [ ] **Step 3: Widen MilestoneId**

In `src/data/types.ts`:

```typescript
export type MilestoneId = 'first_crypt_clear' | 'first_sunken_keep_clear';
```

- [ ] **Step 4: Add handler + detector entry**

In `src/run/milestones.ts`:

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

- [ ] **Step 5: Run, verify passing**

Run: `npx vitest run src/run/__tests__/milestones.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/types.ts src/run/milestones.ts src/run/__tests__/milestones.test.ts
git commit -m "Hunter — first_sunken_keep_clear milestone handler + detector"
```

---

## Phase 5 — Save Migration

### Task 16: v2 → v3 schema migration

**Files:**
- Modify: `src/save/migration.ts`
- Modify: `src/save/__tests__/migration.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/save/__tests__/migration.test.ts`:

```typescript
it('v2 → v3: bumps version, backfills runState.petsDownByHeroId to []', () => {
  const v2 = {
    version: 2,
    roster: { heroes: [], capacity: 12 },
    vault: { gold: 0 },
    stash: { items: [] },
    unlocks: { classes: ['knight'], dungeons: ['crypt'] },
    buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
    hospitalTreatmentsRemaining: 0,
    tavernCandidates: [],
    campRngState: 12345,
    runState: {
      dungeonId: 'crypt',
      seed: 1,
      party: [],
      pack: { gold: 0, items: [] },
      currentFloorNumber: 1,
      currentFloorNodes: [],
      currentNodeId: 'start',
      awaitingFork: false,
      status: 'in_dungeon',
      fallen: [],
      lost: [],
      traversedNodeIds: [],
      surprisesThisFloor: 0,
      pendingMilestones: [],
    },
    runRngState: 99999,
  };
  const result = migrate(v2) as unknown as { version: number; runState: { petsDownByHeroId: unknown } };
  expect(result).not.toBeNull();
  expect(result.version).toBe(3);
  expect(result.runState.petsDownByHeroId).toEqual([]);
});

it('v2 → v3: no runState (camp-only save) just bumps version', () => {
  const v2 = {
    version: 2,
    roster: { heroes: [], capacity: 12 },
    vault: { gold: 0 },
    stash: { items: [] },
    unlocks: { classes: ['knight'], dungeons: ['crypt'] },
    buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
    hospitalTreatmentsRemaining: 0,
    tavernCandidates: [],
    campRngState: 12345,
  };
  const result = migrate(v2) as unknown as { version: number; runState: unknown };
  expect(result).not.toBeNull();
  expect(result.version).toBe(3);
  expect(result.runState).toBeUndefined();
});
```

Also update the existing test's `CURRENT_SCHEMA_VERSION` baseline assumption (it currently uses `CURRENT_SCHEMA_VERSION` — should still be correct since the constant updates). Make sure `it('returns the input as-is when version matches CURRENT_SCHEMA_VERSION')` still passes after the bump.

- [ ] **Step 2: Run, verify failing**

Run: `npx vitest run src/save/__tests__/migration.test.ts`
Expected: FAIL — no migration for v2.

- [ ] **Step 3: Bump `CURRENT_SCHEMA_VERSION` and add migration**

In `src/save/migration.ts`:

```typescript
export const CURRENT_SCHEMA_VERSION = 3;

const MIGRATIONS: Record<number, MigrationFn> = {
  // v1 → v2: introduce SaveFile.campRngState (Cluster B · 58, 2026-05-10).
  1: (raw) => ({ ...raw, campRngState: Date.now(), version: 2 }),

  // v2 → v3: introduce Hero.petSpeciesId (defensive — no Hunters can exist pre-v3)
  // and RunState.petsDownByHeroId (default to []). Hunter spec, 2026-05-10.
  2: (raw) => {
    const out: Record<string, unknown> = { ...raw, version: 3 };
    // Defensive Hunter petSpeciesId backfill in roster.heroes
    const roster = out.roster as { heroes?: Array<Record<string, unknown>> } | undefined;
    if (roster?.heroes) {
      roster.heroes = roster.heroes.map((h) =>
        h.classId === 'hunter' && !h.petSpeciesId ? { ...h, petSpeciesId: 'wolf' } : h,
      );
    }
    // Same in tavernCandidates
    const candidates = out.tavernCandidates as Array<Record<string, unknown>> | undefined;
    if (candidates) {
      out.tavernCandidates = candidates.map((h) =>
        h.classId === 'hunter' && !h.petSpeciesId ? { ...h, petSpeciesId: 'wolf' } : h,
      );
    }
    // In-progress run: backfill petsDownByHeroId + party heroes
    const runState = out.runState as Record<string, unknown> | undefined;
    if (runState) {
      if (runState.petsDownByHeroId === undefined) {
        runState.petsDownByHeroId = [];
      }
      const party = runState.party as Array<Record<string, unknown>> | undefined;
      if (party) {
        runState.party = party.map((h) =>
          h.classId === 'hunter' && !h.petSpeciesId ? { ...h, petSpeciesId: 'wolf' } : h,
        );
      }
    }
    return out;
  },
};
```

- [ ] **Step 4: Run, verify passing**

Run: `npx vitest run src/save/__tests__/migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/save/migration.ts src/save/__tests__/migration.test.ts
git commit -m "Hunter — save schema bump v2 → v3 (petSpeciesId + petsDownByHeroId)"
```

---

## Phase 6 — Recruitment Integration

### Task 17: Tavern `generateCandidate` rolls petSpeciesId for Hunters

**Files:**
- Modify: `src/camp/buildings/tavern.ts`
- Modify: `src/camp/buildings/__tests__/tavern.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/camp/buildings/__tests__/tavern.test.ts`:

```typescript
import { Rng, createRngFromState } from '@util/rng';

describe('generateCandidate — Hunter petSpeciesId', () => {
  it('rolls a petSpeciesId when classId is hunter', () => {
    // Force the rng to pick "hunter" by giving only that class to the unlock list.
    const rng = createRngFromState(42);
    const hero = generateCandidate(rng, ['hunter']);
    expect(hero.classId).toBe('hunter');
    expect(hero.petSpeciesId).toBeDefined();
    expect(['wolf', 'hawk', 'bear']).toContain(hero.petSpeciesId);
  });

  it('does not roll petSpeciesId for non-Hunter classes', () => {
    const rng = createRngFromState(42);
    const hero = generateCandidate(rng, ['knight']);
    expect(hero.classId).toBe('knight');
    expect(hero.petSpeciesId).toBeUndefined();
  });
});
```

(Adjust the rng helper import to match the file's existing usage. If a deterministic `Rng` factory is named differently, look at the existing tavern tests for the convention.)

- [ ] **Step 2: Run, verify failing**

Run: `npx vitest run src/camp/buildings/__tests__/tavern.test.ts -t "petSpeciesId"`
Expected: FAIL — petSpeciesId is undefined for Hunter candidates.

- [ ] **Step 3: Modify `generateCandidate`**

In `src/camp/buildings/tavern.ts`:

```typescript
import type { ClassId, PetSpeciesId } from '@data/types';

const PET_SPECIES_IDS: readonly PetSpeciesId[] = ['wolf', 'hawk', 'bear'];

export function generateCandidate(
  rng: Rng,
  unlockedClasses: readonly ClassId[],
): Hero {
  const classId = rng.pick(unlockedClasses);
  const traitId = rng.pick(ALL_TRAIT_IDS);
  const bodySpriteId = rng.pick(PLAYER_BODY_SPRITES);
  const legsSpriteId = rng.pick(PLAYER_LEGS_SPRITES);
  const feetSpriteId = rng.pick(PLAYER_FEET_SPRITES);
  const name = rng.pick(NAMES);
  const id = `hero_${rng.int(100000, 999999)}`;
  const petSpeciesId = classId === 'hunter' ? rng.pick(PET_SPECIES_IDS) : undefined;
  return createHero(
    classId, name, id, traitId, bodySpriteId, legsSpriteId, feetSpriteId, petSpeciesId,
  );
}
```

- [ ] **Step 4: Run, verify passing**

Run: `npx vitest run src/camp/buildings/__tests__/tavern.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/camp/buildings/tavern.ts src/camp/buildings/__tests__/tavern.test.ts
git commit -m "Hunter — Tavern rolls petSpeciesId for hunter candidates"
```

---

## Phase 7 — Documentation + Final Verification

### Task 18: gdd patch (§3 row 7)

**Files:**
- Modify: `gdd.md`

- [ ] **Step 1: Read line 87 of gdd.md to confirm content**

Run: `Read gdd.md offset=80 limit=15`
Expected: Confirms row 7 reads `Unlocks: first Warren clear.`

- [ ] **Step 2: Replace "first Warren clear" with "first Sunken Keep clear"**

In `gdd.md`, change in line 87:

From: `Bonds with a pet that occupies slot 4 and acts on its own priority. Unlocks: first Warren clear.`
To: `Bonds with a pet that occupies slot 4 and acts on its own priority. Unlocks: first Sunken Keep clear.`

- [ ] **Step 3: Commit**

```bash
git add gdd.md
git commit -m "gdd — fix Hunter unlock condition to first Sunken Keep clear"
```

---

### Task 19: Full test suite + build verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: ALL existing tests pass, plus the new Hunter tests added across Tasks 1–17.

- [ ] **Step 2: Run a TypeScript build**

Run: `npm run build`
Expected: build succeeds. Watch for exhaustiveness errors in any switch on `Combatant.kind`, `AbilityEffect.kind`, or `AiCondition.kind` — if found, address with appropriate `case 'pet':` / `case 'commandPet':` / `case 'petAlive':` arms.

- [ ] **Step 3: Spot-check sprite resolution for pets**

Pet rendering uses placeholder beast NPC frames per the spec's "Out of scope" section. For this plan, the engine logic is what's tested. The visual smoke (browser playthrough confirming wolves render, etc.) is **deliberately deferred to a follow-up Cluster C task** — per saved memory, browser smoke tests aren't required at end-of-task unless the user requests one. Document the placeholder mapping decision in HISTORY.md (when migrating this TODO entry).

- [ ] **Step 4: Final commit (no-op if 1–3 produced no changes)**

If tests/build revealed any fix-ups (e.g., a switch that didn't have its `commandPet` case), commit them:

```bash
git add -p  # review changes
git commit -m "Hunter — fix-ups from full-suite verification"
```

---

## Spec coverage check

Skim the spec sections; confirm each is covered by a task:

- **Type widening (ClassId, AbilityId, MilestoneId, PerkId, PerkDef, AbilityEffect, AiCondition, Combatant.kind/fields, PetSpeciesId)** — Tasks 1, 2, 3, 4, 5, 6, 15.
- **Hunter abilities (4)** — Task 1.
- **Pet abilities (6)** — Task 2.
- **PET_SPECIES registry** — Task 3.
- **Hunter class entry** — Task 4.
- **Hunter perks + petAttackBonus mechanism** — Tasks 5 & 12.
- **createPetCombatant** — Task 7.
- **petAlive AI condition** — Task 8.
- **commandPet effect** — Task 9.
- **Hero.petSpeciesId + createHero param** — Task 10.
- **RunState.petsDownByHeroId + startRun init** — Task 11.
- **buildCombatState pet pass** — Task 12.
- **completeCombat + completeSurpriseCombat pet bookkeeping** — Task 13.
- **camp_node pet respawn** — Task 14.
- **first_sunken_keep_clear handler + detector** — Task 15.
- **Save schema v2 → v3 migration** — Task 16.
- **Tavern petSpeciesId roll** — Task 17.
- **gdd §3 row 7 patch** — Task 18.
- **Full-suite + build verification** — Task 19.

All spec requirements are mapped to tasks. The "out of scope" items (spear, bespoke pet art, retroactive unlocks, pet swap, Chapel/Training Grounds) are correctly NOT in this plan.

---

## Implementation notes

- **Sprite resolution for pets** is intentionally not in this plan. `src/render/combat_actor.ts` and `src/scenes/combat_playback.ts` will need a `kind === 'pet'` branch resolving via `petSpeciesId` to a beast NPC frame. If the build in Task 19 errors on a missing exhaustive case, add the placeholder branches there with TODO comments referencing this spec.
- **Pet HP non-persistence** between encounters is a deliberate design decision (see spec Q2 + risks). No code task tracks pet HP across encounters; pets always start at full HP unless their owner is in `petsDownByHeroId`.
- **Beastmaster vs Sharpshooter** mechanism asymmetry — Beastmaster uses `petAttackBonus`, read at combat-setup; Sharpshooter uses `statEffects`, applied to Hero baseStats. The two paths don't conflict; future pet-buffing perks can mirror Beastmaster's pattern.
- **The `applyAbility` import in `effects.ts`** for `commandPet` resolution is internal-to-module — `applyAbility` is exported from the same file so the case body can call it directly.
