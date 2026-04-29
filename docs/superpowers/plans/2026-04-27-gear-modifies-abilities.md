# Gear-Modifies-Abilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the GDD §3 weapon-family rule — equipped weapon gates each class's signature kit (preferred = full kit; same-family = one ability swapped per weapon; wholly wrong = basic only) plus the shield-presence sub-rule.

**Architecture:** Pure-TS resolver `resolveCombatAbilities(hero)` in a new `src/items/kit.ts` module. Combat resolver doesn't change — kit resolution happens upstream at `buildCombatState` time, with the resolved abilities + aiPriority passed through `createHeroCombatant` overrides. 8 new "swap" abilities added; `shield_bash` flagged as `requiresShield`. No new effect kinds, no new statuses, no save schema changes.

**Tech Stack:** TypeScript 6.0, Vitest 4.1. Pure-TS for everything; no Phaser changes.

**Repo convention:** `CLAUDE.md` says *"Never create git commits without explicit user instruction in the current turn."* This plan has no commit steps; the user drives staging and commits.

**Source spec:** [`docs/superpowers/specs/2026-04-27-gear-modifies-abilities-design.md`](../specs/2026-04-27-gear-modifies-abilities-design.md).

---

## File Structure

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/data/types.ts` | Modify | Add `WeaponFamily` type. Extend `AbilityId` with 8 new ids. Add `requiresShield?: boolean` to `Ability`. Extend `ClassDef` with `weaponFamily`, `basicAbility`, `swapTarget?`, `weaponSwaps?`. |
| `src/data/items.ts` | Modify | Export `WEAPON_FAMILY: Record<WeaponType, WeaponFamily>` table. |
| `src/data/abilities.ts` | Modify | Add 8 new ability defs. Add `requiresShield: true` to `shield_bash`. |
| `src/data/__tests__/abilities.test.ts` | Modify | Extend `EXPECTED_IDS` to include the 8 new ids. Add tests for `requiresShield`. |
| `src/data/classes.ts` | Modify | Each class declares `weaponFamily` + `basicAbility`. Non-Archer classes also declare `swapTarget` + `weaponSwaps`. |
| `src/data/__tests__/classes.test.ts` | Modify | Tests for new ClassDef fields, family integrity, swap-mapping validity. |
| `src/items/kit.ts` | Create | `resolveCombatAbilities(hero) → { abilities, aiPriority }`. The kit-resolution algorithm. |
| `src/items/__tests__/kit.test.ts` | Create | ~25 cases: 3 bands × per-class × shield filter × invariants. |
| `src/run/combat_setup.ts` | Modify | `buildCombatState` calls `resolveCombatAbilities(hero)` and routes `abilities` + `aiPriority` into `createHeroCombatant` overrides. |
| `src/run/__tests__/combat_setup.test.ts` | Modify | Integration tests confirming kit resolution flows through. |

---

## Task 1: Type additions + per-class `weaponFamily` and `basicAbility`

This task adds the type-level scaffolding plus the *required* class fields (`weaponFamily`, `basicAbility`). Optional fields (`swapTarget`, `weaponSwaps`, `requiresShield`) are added to types but only consumed in later tasks. AbilityId union is **not yet extended** with the 8 new ids — Task 3 does that since it also adds the corresponding ability defs.

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/classes.ts`
- Modify: `src/data/__tests__/classes.test.ts`

- [ ] **Step 1: Add `WeaponFamily` type and `requiresShield`/`ClassDef` extensions in `src/data/types.ts`**

Find the existing `WeaponType` declaration. Append after it:

```ts
export type WeaponFamily = 'melee' | 'ranged' | 'magic';
```

Find the existing `Ability` interface. Add the optional field:

```ts
export interface Ability {
  id: AbilityId;
  name: string;
  canCastFrom: readonly SlotIndex[];
  target: TargetSelector;
  effects: readonly AbilityEffect[];
  tags?: readonly AbilityTag[];
  cooldown?: number;
  aiCondition?: AiCondition;
  requiresShield?: boolean;
}
```

Find the existing `ClassDef` interface and replace with:

```ts
export interface ClassDef {
  id: ClassId;
  name: string;
  baseStats: Stats;
  preferredWeapon: WeaponType;
  weaponFamily: WeaponFamily;
  basicAbility: AbilityId;
  swapTarget?: AbilityId;
  weaponSwaps?: Partial<Record<WeaponType, AbilityId>>;
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  starterLoadout: StarterLoadout;
}
```

- [ ] **Step 2: Update `src/data/classes.ts` — add `weaponFamily` and `basicAbility` to all 6 classes**

Replace the file with:

```ts
import type { ClassDef, ClassId } from './types';

export const CLASSES: Record<ClassId, ClassDef> = {
  knight: {
    id: 'knight',
    name: 'Knight',
    baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 5, dodge: 5 },
    preferredWeapon: 'sword',
    weaponFamily: 'melee',
    basicAbility: 'knight_slash',
    abilities: ['knight_slash', 'shield_bash', 'bulwark', 'taunt'],
    aiPriority: ['shield_bash', 'bulwark', 'taunt', 'knight_slash'],
    starterLoadout: { weapon: 'sword_basic', shield: 'shield_basic' },
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    baseStats: { hp: 14, attack: 5, defense: 2, speed: 5, mind: 0, crit: 15, dodge: 10 },
    preferredWeapon: 'bow',
    weaponFamily: 'ranged',
    basicAbility: 'archer_shoot',
    abilities: ['archer_shoot', 'piercing_shot', 'volley', 'flare_arrow'],
    aiPriority: ['flare_arrow', 'piercing_shot', 'volley', 'archer_shoot'],
    starterLoadout: { weapon: 'bow_basic' },
  },
  priest: {
    id: 'priest',
    name: 'Priest',
    baseStats: { hp: 15, attack: 3, defense: 2, speed: 4, mind: 5, crit: 5, dodge: 5 },
    preferredWeapon: 'holy_symbol',
    weaponFamily: 'magic',
    basicAbility: 'priest_strike',
    abilities: ['priest_strike', 'mend', 'smite', 'bless'],
    aiPriority: ['mend', 'bless', 'smite', 'priest_strike'],
    starterLoadout: { weapon: 'mace_basic' },
  },
  barbarian: {
    id: 'barbarian',
    name: 'Barbarian',
    baseStats: { hp: 22, attack: 6, defense: 3, speed: 3, mind: 0, crit: 10, dodge: 5 },
    preferredWeapon: 'axe',
    weaponFamily: 'melee',
    basicAbility: 'barbarian_swing',
    abilities: ['barbarian_swing', 'cleave', 'rampage', 'bloodthirst'],
    aiPriority: ['rampage', 'cleave', 'bloodthirst', 'barbarian_swing'],
    starterLoadout: { weapon: 'axe_basic' },
  },
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    baseStats: { hp: 13, attack: 5, defense: 1, speed: 6, mind: 0, crit: 20, dodge: 15 },
    preferredWeapon: 'daggers',
    weaponFamily: 'melee',
    basicAbility: 'rogue_strike',
    abilities: ['rogue_strike', 'backstab', 'vanish', 'poison_strike'],
    aiPriority: ['vanish', 'backstab', 'poison_strike', 'rogue_strike'],
    starterLoadout: { weapon: 'daggers_basic' },
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    baseStats: { hp: 12, attack: 2, defense: 1, speed: 4, mind: 8, crit: 5, dodge: 5 },
    preferredWeapon: 'staff',
    weaponFamily: 'magic',
    basicAbility: 'mage_zap',
    abilities: ['mage_zap', 'firebolt', 'frost_nova', 'arc_shock'],
    aiPriority: ['frost_nova', 'firebolt', 'arc_shock', 'mage_zap'],
    starterLoadout: { weapon: 'staff_basic' },
  },
};
```

- [ ] **Step 3: Append failing tests to `src/data/__tests__/classes.test.ts`**

Append before the final closing `});`:

```ts
  describe('weaponFamily + basicAbility', () => {
    it('every class declares a weaponFamily', () => {
      const valid = new Set(['melee', 'ranged', 'magic']);
      for (const id of EXPECTED_IDS) {
        expect(valid.has(CLASSES[id].weaponFamily), `${id}.weaponFamily`).toBe(true);
      }
    });

    it("each class's basicAbility is in its abilities list", () => {
      for (const id of EXPECTED_IDS) {
        const def = CLASSES[id];
        expect(def.abilities, `${id}.basicAbility`).toContain(def.basicAbility);
      }
    });

    it('basicAbility resolves to a registered ability', () => {
      for (const id of EXPECTED_IDS) {
        expect(ABILITIES[CLASSES[id].basicAbility]).toBeDefined();
      }
    });
  });
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/data/__tests__/classes.test.ts`
Expected: all passing.

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 2: `WEAPON_FAMILY` table

Add the weapon-type → family lookup constant in `src/data/items.ts`. Used by the resolver in Task 5.

**Files:**
- Modify: `src/data/items.ts`

- [ ] **Step 1: Add `WEAPON_FAMILY` to `src/data/items.ts`**

Find the existing imports at top of `src/data/items.ts`. Add `WeaponFamily` to the type imports:

```ts
import type {
  AffixDef,
  AffixId,
  ItemBaseId,
  ItemSlot,
  RarePropertyDef,
  RarePropertyId,
  WeaponFamily,
  WeaponType,
} from './types';
```

After the existing `BASE_ITEM_STATS` constant (at the bottom of the file), append:

```ts
export const WEAPON_FAMILY: Record<WeaponType, WeaponFamily> = {
  sword: 'melee',
  axe: 'melee',
  daggers: 'melee',
  bow: 'ranged',
  staff: 'magic',
  holy_symbol: 'magic',
};
```

- [ ] **Step 2: Verify typecheck + tests**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run src/data`
Expected: all passing (no new tests needed for this constant — Task 5's kit.test.ts will exercise it).

---

## Task 3: 8 new ability defs + `requiresShield` flag + AbilityId extension

Adds the 8 swap-replacement abilities to `abilities.ts`, extends the `AbilityId` union in `types.ts`, and flags `shield_bash` with `requiresShield: true`.

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/abilities.ts`
- Modify: `src/data/__tests__/abilities.test.ts`

- [ ] **Step 1: Extend `AbilityId` in `src/data/types.ts`**

Find the existing `AbilityId` declaration:

```ts
export type AbilityId =
  | 'knight_slash'
  | 'shield_bash'
  | 'bulwark'
  | 'taunt'
  | 'archer_shoot'
  | 'piercing_shot'
  | 'volley'
  | 'flare_arrow'
  | 'priest_strike'
  | 'mend'
  | 'smite'
  | 'bless'
  | 'bone_slash'
  | 'bone_arrow'
  | 'rotting_bite'
  | 'dark_bolt'
  | 'dark_pact'
  | 'necrotic_wave'
  | 'lich_strike'
  | 'curse_of_frailty'
  | 'chilling_touch'
  | 'barbarian_swing'
  | 'cleave'
  | 'rampage'
  | 'bloodthirst'
  | 'rogue_strike'
  | 'backstab'
  | 'vanish'
  | 'poison_strike'
  | 'mage_zap'
  | 'firebolt'
  | 'frost_nova'
  | 'arc_shock';
```

Replace with:

```ts
export type AbilityId =
  | 'knight_slash'
  | 'shield_bash'
  | 'bulwark'
  | 'taunt'
  | 'archer_shoot'
  | 'piercing_shot'
  | 'volley'
  | 'flare_arrow'
  | 'priest_strike'
  | 'mend'
  | 'smite'
  | 'bless'
  | 'bone_slash'
  | 'bone_arrow'
  | 'rotting_bite'
  | 'dark_bolt'
  | 'dark_pact'
  | 'necrotic_wave'
  | 'lich_strike'
  | 'curse_of_frailty'
  | 'chilling_touch'
  | 'barbarian_swing'
  | 'cleave'
  | 'rampage'
  | 'bloodthirst'
  | 'rogue_strike'
  | 'backstab'
  | 'vanish'
  | 'poison_strike'
  | 'mage_zap'
  | 'firebolt'
  | 'frost_nova'
  | 'arc_shock'
  | 'knight_cleaving_swing'
  | 'knight_quick_slash'
  | 'barbarian_whirl_strike'
  | 'barbarian_frenzy'
  | 'rogue_riposte'
  | 'rogue_brutal_chop'
  | 'priest_arcane_bolt'
  | 'mage_holy_light';
```

- [ ] **Step 2: Add `requiresShield: true` to `shield_bash` in `src/data/abilities.ts`**

Find the existing `shield_bash` entry:

```ts
  shield_bash: {
    id: 'shield_bash',
    name: 'Shield Bash',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1] },
    effects: [
      { kind: 'damage', power: 0.6 },
      { kind: 'stun', duration: 1 },
    ],
  },
```

Replace with:

```ts
  shield_bash: {
    id: 'shield_bash',
    name: 'Shield Bash',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1] },
    effects: [
      { kind: 'damage', power: 0.6 },
      { kind: 'stun', duration: 1 },
    ],
    requiresShield: true,
  },
```

- [ ] **Step 3: Append the 8 new ability defs to `src/data/abilities.ts`**

Find the closing `};` of the `ABILITIES` object. Insert just before it:

```ts
  knight_cleaving_swing: {
    id: 'knight_cleaving_swing',
    name: 'Cleaving Swing',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1, 2] },
    effects: [{ kind: 'damage', power: 0.7 }],
    aiCondition: { kind: 'minTargets', n: 2 },
  },
  knight_quick_slash: {
    id: 'knight_quick_slash',
    name: 'Quick Slash',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 0.7, bonusCrit: 20 }],
  },
  barbarian_whirl_strike: {
    id: 'barbarian_whirl_strike',
    name: 'Whirl Strike',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1, 2] },
    effects: [{ kind: 'damage', power: 0.65 }],
    aiCondition: { kind: 'minTargets', n: 2 },
  },
  barbarian_frenzy: {
    id: 'barbarian_frenzy',
    name: 'Frenzy',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 0.9, bonusCrit: 10 }],
  },
  rogue_riposte: {
    id: 'rogue_riposte',
    name: 'Riposte',
    canCastFrom: [1, 2, 3],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 1.0, bonusCrit: 15 }],
    cooldown: 2,
  },
  rogue_brutal_chop: {
    id: 'rogue_brutal_chop',
    name: 'Brutal Chop',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 1.4 }],
    cooldown: 2,
  },
  priest_arcane_bolt: {
    id: 'priest_arcane_bolt',
    name: 'Arcane Bolt',
    canCastFrom: [2, 3],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 1.0, scalingStat: 'mind' }],
  },
  mage_holy_light: {
    id: 'mage_holy_light',
    name: 'Holy Light',
    canCastFrom: [2, 3],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 1.0, scalingStat: 'mind' }],
    cooldown: 2,
    tags: ['radiant'],
  },
```

- [ ] **Step 4: Update `src/data/__tests__/abilities.test.ts` `EXPECTED_IDS`**

Find `EXPECTED_IDS`:

```ts
const EXPECTED_IDS: readonly AbilityId[] = [
  'knight_slash',
  // ... existing 32 ids ...
  'arc_shock',
];
```

Replace with the extended list:

```ts
const EXPECTED_IDS: readonly AbilityId[] = [
  'knight_slash',
  'shield_bash',
  'bulwark',
  'taunt',
  'archer_shoot',
  'piercing_shot',
  'volley',
  'flare_arrow',
  'priest_strike',
  'mend',
  'smite',
  'bless',
  'bone_slash',
  'bone_arrow',
  'rotting_bite',
  'dark_bolt',
  'dark_pact',
  'necrotic_wave',
  'lich_strike',
  'curse_of_frailty',
  'chilling_touch',
  'barbarian_swing',
  'cleave',
  'rampage',
  'bloodthirst',
  'rogue_strike',
  'backstab',
  'vanish',
  'poison_strike',
  'mage_zap',
  'firebolt',
  'frost_nova',
  'arc_shock',
  'knight_cleaving_swing',
  'knight_quick_slash',
  'barbarian_whirl_strike',
  'barbarian_frenzy',
  'rogue_riposte',
  'rogue_brutal_chop',
  'priest_arcane_bolt',
  'mage_holy_light',
];
```

- [ ] **Step 5: Append `requiresShield` tests to `src/data/__tests__/abilities.test.ts`**

Append before the file's final closing `});` (or as a top-level describe block):

```ts
describe('requiresShield flag', () => {
  it('shield_bash requires a shield', () => {
    expect(ABILITIES.shield_bash.requiresShield).toBe(true);
  });

  it('no other ability has requiresShield set', () => {
    for (const id of EXPECTED_IDS) {
      if (id === 'shield_bash') continue;
      expect(
        ABILITIES[id].requiresShield ?? false,
        `${id}.requiresShield should not be set`,
      ).toBe(false);
    }
  });
});
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run src/data`
Expected: all passing.

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 4: Per-class `swapTarget` + `weaponSwaps`

Wires up the per-class swap mappings on top of Task 1's class shape. Archer remains without swap mapping.

**Files:**
- Modify: `src/data/classes.ts`
- Modify: `src/data/__tests__/classes.test.ts`

- [ ] **Step 1: Add `swapTarget` + `weaponSwaps` to 5 classes in `src/data/classes.ts`**

For each non-Archer class entry, add the two fields. The full file now reads:

```ts
import type { ClassDef, ClassId } from './types';

export const CLASSES: Record<ClassId, ClassDef> = {
  knight: {
    id: 'knight',
    name: 'Knight',
    baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 5, dodge: 5 },
    preferredWeapon: 'sword',
    weaponFamily: 'melee',
    basicAbility: 'knight_slash',
    swapTarget: 'shield_bash',
    weaponSwaps: { axe: 'knight_cleaving_swing', daggers: 'knight_quick_slash' },
    abilities: ['knight_slash', 'shield_bash', 'bulwark', 'taunt'],
    aiPriority: ['shield_bash', 'bulwark', 'taunt', 'knight_slash'],
    starterLoadout: { weapon: 'sword_basic', shield: 'shield_basic' },
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    baseStats: { hp: 14, attack: 5, defense: 2, speed: 5, mind: 0, crit: 15, dodge: 10 },
    preferredWeapon: 'bow',
    weaponFamily: 'ranged',
    basicAbility: 'archer_shoot',
    abilities: ['archer_shoot', 'piercing_shot', 'volley', 'flare_arrow'],
    aiPriority: ['flare_arrow', 'piercing_shot', 'volley', 'archer_shoot'],
    starterLoadout: { weapon: 'bow_basic' },
  },
  priest: {
    id: 'priest',
    name: 'Priest',
    baseStats: { hp: 15, attack: 3, defense: 2, speed: 4, mind: 5, crit: 5, dodge: 5 },
    preferredWeapon: 'holy_symbol',
    weaponFamily: 'magic',
    basicAbility: 'priest_strike',
    swapTarget: 'smite',
    weaponSwaps: { staff: 'priest_arcane_bolt' },
    abilities: ['priest_strike', 'mend', 'smite', 'bless'],
    aiPriority: ['mend', 'bless', 'smite', 'priest_strike'],
    starterLoadout: { weapon: 'mace_basic' },
  },
  barbarian: {
    id: 'barbarian',
    name: 'Barbarian',
    baseStats: { hp: 22, attack: 6, defense: 3, speed: 3, mind: 0, crit: 10, dodge: 5 },
    preferredWeapon: 'axe',
    weaponFamily: 'melee',
    basicAbility: 'barbarian_swing',
    swapTarget: 'cleave',
    weaponSwaps: { sword: 'barbarian_whirl_strike', daggers: 'barbarian_frenzy' },
    abilities: ['barbarian_swing', 'cleave', 'rampage', 'bloodthirst'],
    aiPriority: ['rampage', 'cleave', 'bloodthirst', 'barbarian_swing'],
    starterLoadout: { weapon: 'axe_basic' },
  },
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    baseStats: { hp: 13, attack: 5, defense: 1, speed: 6, mind: 0, crit: 20, dodge: 15 },
    preferredWeapon: 'daggers',
    weaponFamily: 'melee',
    basicAbility: 'rogue_strike',
    swapTarget: 'backstab',
    weaponSwaps: { sword: 'rogue_riposte', axe: 'rogue_brutal_chop' },
    abilities: ['rogue_strike', 'backstab', 'vanish', 'poison_strike'],
    aiPriority: ['vanish', 'backstab', 'poison_strike', 'rogue_strike'],
    starterLoadout: { weapon: 'daggers_basic' },
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    baseStats: { hp: 12, attack: 2, defense: 1, speed: 4, mind: 8, crit: 5, dodge: 5 },
    preferredWeapon: 'staff',
    weaponFamily: 'magic',
    basicAbility: 'mage_zap',
    swapTarget: 'firebolt',
    weaponSwaps: { holy_symbol: 'mage_holy_light' },
    abilities: ['mage_zap', 'firebolt', 'frost_nova', 'arc_shock'],
    aiPriority: ['frost_nova', 'firebolt', 'arc_shock', 'mage_zap'],
    starterLoadout: { weapon: 'staff_basic' },
  },
};
```

- [ ] **Step 2: Append swap-mapping integrity tests to `src/data/__tests__/classes.test.ts`**

Add a new top-level describe block at the bottom:

```ts
describe('swap mappings', () => {
  const SWAP_CLASSES: readonly ClassId[] = ['knight', 'priest', 'barbarian', 'rogue', 'mage'];

  it('Archer has no swapTarget or weaponSwaps', () => {
    expect(CLASSES.archer.swapTarget).toBeUndefined();
    expect(CLASSES.archer.weaponSwaps).toBeUndefined();
  });

  describe.each(SWAP_CLASSES)('class %s swap mapping', (id) => {
    it('declares both swapTarget and weaponSwaps', () => {
      expect(CLASSES[id].swapTarget).toBeDefined();
      expect(CLASSES[id].weaponSwaps).toBeDefined();
    });

    it("swapTarget is in the class's abilities list", () => {
      const def = CLASSES[id];
      expect(def.abilities).toContain(def.swapTarget!);
    });

    it('weaponSwaps keys are same family as the class but not the preferred weapon', () => {
      const def = CLASSES[id];
      const family = def.weaponFamily;
      const familyMembers: Record<typeof family, readonly string[]> = {
        melee: ['sword', 'axe', 'daggers'],
        ranged: ['bow'],
        magic: ['staff', 'holy_symbol'],
      };
      const allowed = new Set(familyMembers[family]);
      for (const weaponType of Object.keys(def.weaponSwaps!)) {
        expect(allowed.has(weaponType), `${id}.weaponSwaps key '${weaponType}' must be ${family}`).toBe(true);
        expect(weaponType, `${id}.weaponSwaps key cannot equal preferredWeapon`).not.toBe(def.preferredWeapon);
      }
    });

    it('weaponSwaps values are valid registered abilities', () => {
      const def = CLASSES[id];
      for (const swapId of Object.values(def.weaponSwaps!)) {
        expect(ABILITIES[swapId!], `${id}.weaponSwaps value '${swapId}' must be a registered ability`).toBeDefined();
      }
    });
  });
});
```

- [ ] **Step 3: Run tests + typecheck**

Run: `npx vitest run src/data`
Expected: all passing.

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 5: `resolveCombatAbilities` resolver + tests

Implements the kit-resolution algorithm. Heavy test coverage — this is the load-bearing logic of the task.

**Files:**
- Create: `src/items/kit.ts`
- Create: `src/items/__tests__/kit.test.ts`

- [ ] **Step 1: Create `src/items/__tests__/kit.test.ts` with full test surface**

```ts
import { describe, expect, it } from 'vitest';
import { BASE_ITEMS } from '../../data/items';
import { CLASSES } from '../../data/classes';
import type { ClassId, Item, ItemBaseId, ItemSlot } from '../../data/types';
import { createHero, type Hero } from '../../heroes/hero';
import { resolveCombatAbilities } from '../kit';

function makeItem(baseId: ItemBaseId, slot: ItemSlot, id: string): Item {
  const def = BASE_ITEMS[baseId];
  return {
    id,
    baseId,
    slot,
    rarity: 'common',
    ...(def.weaponType !== undefined ? { weaponType: def.weaponType } : {}),
    affixes: [],
    floorRolledAt: 1,
  };
}

function makeHeroWith(opts: {
  classId: ClassId;
  weaponBaseId: ItemBaseId;
  shieldBaseId?: ItemBaseId;
}): Hero {
  const hero = createHero(opts.classId, 'TestHero', `h_${opts.classId}`, 'quick', '0');
  const weapon = makeItem(opts.weaponBaseId, 'weapon', 'w_test');
  const shield = opts.shieldBaseId !== undefined
    ? makeItem(opts.shieldBaseId, 'shield', 's_test')
    : undefined;
  return {
    ...hero,
    equipment: {
      weapon,
      ...(shield !== undefined ? { shield } : {}),
    },
  };
}

const PREFERRED_WEAPON: Record<ClassId, ItemBaseId> = {
  knight: 'sword_basic',
  archer: 'bow_basic',
  priest: 'mace_basic',         // holy_symbol family base
  barbarian: 'axe_basic',
  rogue: 'daggers_basic',
  mage: 'staff_basic',
};

describe('resolveCombatAbilities — Band 1 (preferred weapon)', () => {
  it('Knight + sword + shield → full kit', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toEqual(CLASSES.knight.abilities);
    expect(result.aiPriority).toEqual(CLASSES.knight.aiPriority);
  });

  it.each(Object.keys(PREFERRED_WEAPON) as ClassId[])(
    '%s + preferred weapon → full kit',
    (classId) => {
      const opts: Parameters<typeof makeHeroWith>[0] = {
        classId,
        weaponBaseId: PREFERRED_WEAPON[classId],
      };
      // Knight needs the shield to retain shield_bash.
      if (classId === 'knight') opts.shieldBaseId = 'shield_basic';
      const hero = makeHeroWith(opts);
      const result = resolveCombatAbilities(hero);
      expect(result.abilities).toEqual(CLASSES[classId].abilities);
      expect(result.aiPriority).toEqual(CLASSES[classId].aiPriority);
    },
  );
});

describe('resolveCombatAbilities — Band 2 (same-family swap)', () => {
  it('Knight + axe → swap shield_bash to knight_cleaving_swing', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'axe_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('knight_cleaving_swing');
    expect(result.abilities).not.toContain('shield_bash');
    expect(result.aiPriority).toContain('knight_cleaving_swing');
    expect(result.aiPriority).not.toContain('shield_bash');
    // Other 3 abilities unchanged.
    expect(result.abilities).toContain('knight_slash');
    expect(result.abilities).toContain('bulwark');
    expect(result.abilities).toContain('taunt');
  });

  it('Knight + daggers → swap shield_bash to knight_quick_slash', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'daggers_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('knight_quick_slash');
    expect(result.abilities).not.toContain('shield_bash');
  });

  it('Barbarian + sword → swap cleave to barbarian_whirl_strike', () => {
    const hero = makeHeroWith({ classId: 'barbarian', weaponBaseId: 'sword_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('barbarian_whirl_strike');
    expect(result.abilities).not.toContain('cleave');
  });

  it('Barbarian + daggers → swap cleave to barbarian_frenzy', () => {
    const hero = makeHeroWith({ classId: 'barbarian', weaponBaseId: 'daggers_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('barbarian_frenzy');
    expect(result.abilities).not.toContain('cleave');
  });

  it('Rogue + sword → swap backstab to rogue_riposte', () => {
    const hero = makeHeroWith({ classId: 'rogue', weaponBaseId: 'sword_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('rogue_riposte');
    expect(result.abilities).not.toContain('backstab');
  });

  it('Rogue + axe → swap backstab to rogue_brutal_chop', () => {
    const hero = makeHeroWith({ classId: 'rogue', weaponBaseId: 'axe_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('rogue_brutal_chop');
    expect(result.abilities).not.toContain('backstab');
  });

  it('Priest + staff → swap smite to priest_arcane_bolt', () => {
    const hero = makeHeroWith({ classId: 'priest', weaponBaseId: 'staff_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('priest_arcane_bolt');
    expect(result.abilities).not.toContain('smite');
  });

  it('Mage + holy_symbol (mace_basic) → swap firebolt to mage_holy_light', () => {
    const hero = makeHeroWith({ classId: 'mage', weaponBaseId: 'mace_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('mage_holy_light');
    expect(result.abilities).not.toContain('firebolt');
  });
});

describe('resolveCombatAbilities — Band 3 (wholly wrong)', () => {
  it('Mage + sword → only mage_zap', () => {
    const hero = makeHeroWith({ classId: 'mage', weaponBaseId: 'sword_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toEqual(['mage_zap']);
    expect(result.aiPriority).toEqual(['mage_zap']);
  });

  it('Knight + bow → only knight_slash', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'bow_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toEqual(['knight_slash']);
  });

  it('Priest + daggers → only priest_strike', () => {
    const hero = makeHeroWith({ classId: 'priest', weaponBaseId: 'daggers_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toEqual(['priest_strike']);
  });

  it('Rogue + staff → only rogue_strike', () => {
    const hero = makeHeroWith({ classId: 'rogue', weaponBaseId: 'staff_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toEqual(['rogue_strike']);
  });
});

describe('resolveCombatAbilities — Archer special case', () => {
  it('Archer + bow → full kit', () => {
    const hero = makeHeroWith({ classId: 'archer', weaponBaseId: 'bow_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toEqual(CLASSES.archer.abilities);
  });

  it('Archer + sword → only archer_shoot (no same-family alt)', () => {
    const hero = makeHeroWith({ classId: 'archer', weaponBaseId: 'sword_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toEqual(['archer_shoot']);
  });

  it('Archer + staff → only archer_shoot', () => {
    const hero = makeHeroWith({ classId: 'archer', weaponBaseId: 'staff_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toEqual(['archer_shoot']);
  });
});

describe('resolveCombatAbilities — shield filter', () => {
  it('Knight + sword + shield → kit includes shield_bash', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('shield_bash');
  });

  it('Knight + sword + no shield → kit excludes shield_bash, length 3', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).not.toContain('shield_bash');
    expect(result.abilities).toHaveLength(3);
  });

  it('Knight + axe + no shield → kit unchanged from "axe + shield" case', () => {
    const heroNoShield = makeHeroWith({ classId: 'knight', weaponBaseId: 'axe_basic' });
    const heroWithShield = makeHeroWith({ classId: 'knight', weaponBaseId: 'axe_basic', shieldBaseId: 'shield_basic' });
    const r1 = resolveCombatAbilities(heroNoShield);
    const r2 = resolveCombatAbilities(heroWithShield);
    expect(r1.abilities).toEqual(r2.abilities);
  });

  it('aiPriority is filtered identically to abilities', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.aiPriority).not.toContain('shield_bash');
  });
});

describe('resolveCombatAbilities — invariants', () => {
  it('every result has at least one ability', () => {
    for (const classId of Object.keys(PREFERRED_WEAPON) as ClassId[]) {
      for (const weaponBaseId of ['sword_basic', 'bow_basic', 'staff_basic'] as const) {
        const hero = makeHeroWith({ classId, weaponBaseId });
        const result = resolveCombatAbilities(hero);
        expect(result.abilities.length, `${classId} + ${weaponBaseId}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('every aiPriority entry exists in abilities', () => {
    for (const classId of Object.keys(PREFERRED_WEAPON) as ClassId[]) {
      for (const weaponBaseId of ['sword_basic', 'axe_basic', 'bow_basic', 'staff_basic'] as const) {
        const hero = makeHeroWith({ classId, weaponBaseId });
        const result = resolveCombatAbilities(hero);
        const abilitySet = new Set<string>(result.abilities);
        for (const id of result.aiPriority) {
          expect(abilitySet.has(id), `${classId} + ${weaponBaseId}: aiPriority '${id}'`).toBe(true);
        }
      }
    }
  });

  it('does not mutate hero input', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'axe_basic' });
    const snapshot = JSON.stringify(hero);
    resolveCombatAbilities(hero);
    expect(JSON.stringify(hero)).toBe(snapshot);
  });

  it('is deterministic — same hero produces same result twice', () => {
    const hero = makeHeroWith({ classId: 'mage', weaponBaseId: 'mace_basic' });
    const a = resolveCombatAbilities(hero);
    const b = resolveCombatAbilities(hero);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `npx vitest run src/items/__tests__/kit.test.ts`
Expected: FAIL — `Cannot find module '../kit'`.

- [ ] **Step 3: Create `src/items/kit.ts`**

```ts
import { ABILITIES } from '../data/abilities';
import { CLASSES } from '../data/classes';
import { WEAPON_FAMILY } from '../data/items';
import type { AbilityId } from '../data/types';
import type { Hero } from '../heroes/hero';

export interface ResolvedCombatAbilities {
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
}

export function resolveCombatAbilities(hero: Hero): ResolvedCombatAbilities {
  const classDef = CLASSES[hero.classId];
  const equippedWeaponType = hero.equipment.weapon.weaponType;
  if (!equippedWeaponType) {
    // Defensive against data corruption — every weapon should have weaponType.
    return { abilities: [classDef.basicAbility], aiPriority: [classDef.basicAbility] };
  }

  const equippedFamily = WEAPON_FAMILY[equippedWeaponType];
  const preferredFamily = classDef.weaponFamily;
  const isPreferred = equippedWeaponType === classDef.preferredWeapon;

  let abilities: AbilityId[];
  let aiPriority: AbilityId[];

  if (isPreferred) {
    // Band 1: preferred weapon — full kit
    abilities = [...classDef.abilities];
    aiPriority = [...classDef.aiPriority];
  } else if (
    equippedFamily === preferredFamily &&
    classDef.swapTarget !== undefined &&
    classDef.weaponSwaps !== undefined &&
    classDef.weaponSwaps[equippedWeaponType] !== undefined
  ) {
    // Band 2: same family, swap one ability
    const replacement = classDef.weaponSwaps[equippedWeaponType]!;
    const target = classDef.swapTarget;
    abilities = classDef.abilities.map((a) => (a === target ? replacement : a));
    aiPriority = classDef.aiPriority.map((a) => (a === target ? replacement : a));
  } else {
    // Band 3: wholly wrong — only basic
    abilities = [classDef.basicAbility];
    aiPriority = [classDef.basicAbility];
  }

  // Shield filter — applied last
  if (hero.equipment.shield === undefined) {
    abilities = abilities.filter((id) => !ABILITIES[id].requiresShield);
    aiPriority = aiPriority.filter((id) => !ABILITIES[id].requiresShield);
  }

  return { abilities, aiPriority };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/items/__tests__/kit.test.ts`
Expected: all (~25) passing.

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 6: Integrate `resolveCombatAbilities` into `buildCombatState`

Wire the resolver into the hero loop so the resolved kit flows into each combatant's `abilities` and `aiPriority` fields.

**Files:**
- Modify: `src/run/combat_setup.ts`
- Modify: `src/run/__tests__/combat_setup.test.ts`

- [ ] **Step 1: Append failing integration tests to `src/run/__tests__/combat_setup.test.ts`**

```ts
import type { Item } from '../../data/types';
import { resolveCombatAbilities } from '../../items/kit';

describe('buildCombatState — kit resolution', () => {
  it('Knight wielding axe → Combatant.abilities includes knight_cleaving_swing, excludes shield_bash', () => {
    const hero = createHero('knight', 'K', 'h0', 'quick', '0');
    const axeWeapon: Item = {
      id: 'w_axe', baseId: 'axe_basic', slot: 'weapon', rarity: 'common',
      weaponType: 'axe', affixes: [], floorRolledAt: 1,
    };
    const heroWithAxe: typeof hero = {
      ...hero,
      equipment: { ...hero.equipment, weapon: axeWeapon },
    };
    const encounter = { enemies: [{ enemyId: 'skeleton_warrior' as const, slot: 1 as const }], scale: FLAT_SCALE };
    const state = buildCombatState([heroWithAxe], encounter);
    const p0 = state.combatants[0];
    expect(p0.abilities).toContain('knight_cleaving_swing');
    expect(p0.abilities).not.toContain('shield_bash');
  });

  it('Knight wielding bow → Combatant.abilities is [knight_slash]', () => {
    const hero = createHero('knight', 'K', 'h0', 'quick', '0');
    const bow: Item = {
      id: 'w_bow', baseId: 'bow_basic', slot: 'weapon', rarity: 'common',
      weaponType: 'bow', affixes: [], floorRolledAt: 1,
    };
    const heroWithBow: typeof hero = {
      ...hero,
      equipment: { ...hero.equipment, weapon: bow },
    };
    const encounter = { enemies: [{ enemyId: 'skeleton_warrior' as const, slot: 1 as const }], scale: FLAT_SCALE };
    const state = buildCombatState([heroWithBow], encounter);
    const p0 = state.combatants[0];
    expect(p0.abilities).toEqual(['knight_slash']);
  });

  it('Combatant.abilities matches resolveCombatAbilities output', () => {
    const hero = createHero('mage', 'M', 'h0', 'quick', '0');
    const resolved = resolveCombatAbilities(hero);
    const encounter = { enemies: [{ enemyId: 'skeleton_warrior' as const, slot: 1 as const }], scale: FLAT_SCALE };
    const state = buildCombatState([hero], encounter);
    expect(state.combatants[0].abilities).toEqual(resolved.abilities);
    expect(state.combatants[0].aiPriority).toEqual(resolved.aiPriority);
  });
});
```

> **Note:** `FLAT_SCALE` is the existing test fixture in `combat_setup.test.ts`. If your test file has been re-organized differently, use whatever the local equivalent is (typically `{ hp: 1.0, attack: 1.0 }`).

- [ ] **Step 2: Run tests to verify failures**

Run: `npx vitest run src/run/__tests__/combat_setup.test.ts -t "kit resolution"`
Expected: FAIL — Combatants still use `def.abilities` from class, not the resolved kit.

- [ ] **Step 3: Update `src/run/combat_setup.ts`**

Find the `buildCombatState` function and replace its hero-loop body:

```ts
import { ENEMIES } from '../data/enemies';
import { applyEquipmentStats, rarePropertyFields } from '../items/stats';
import { resolveCombatAbilities } from '../items/kit';
import type { EnemyId, SlotIndex, Wound } from '../data/types';
import { WOUNDS } from '../data/wounds';
import { createEnemyCombatant, createHeroCombatant } from '../combat/combatant';
import type { CombatState, Combatant, Stats } from '../combat/types';
import type { Encounter, ScaleFactors } from '../dungeon/node';
import type { Hero } from '../heroes/hero';

function applyWoundsToStats(base: Stats, wounds: readonly Wound[]): Stats {
  const result: Stats = { ...base };
  for (const wound of wounds) {
    const effect = WOUNDS[wound.id].effect;
    if (effect.kind === 'statDelta') {
      result[effect.stat] += effect.delta;
    }
  }
  return result;
}

function computeDamageTakenMultiplier(wounds: readonly Wound[]): number {
  let mult = 1;
  for (const wound of wounds) {
    const effect = WOUNDS[wound.id].effect;
    if (effect.kind === 'damageTakenMult') {
      mult += effect.multiplier - 1;
    }
  }
  return mult;
}

function scaleEnemyStats(enemyId: EnemyId, scale: ScaleFactors): Stats {
  const base = ENEMIES[enemyId].baseStats;
  return {
    hp: Math.round(base.hp * scale.hp),
    attack: Math.round(base.attack * scale.attack),
    defense: base.defense,
    speed: base.speed,
    mind: base.mind,
    crit: base.crit,
    dodge: base.dodge,
  };
}

export function buildCombatState(
  party: readonly Hero[],
  encounter: Encounter,
): CombatState {
  const combatants: Combatant[] = [];

  for (let i = 0; i < party.length; i++) {
    const hero = party[i];
    const woundedStats = applyWoundsToStats(hero.baseStats, hero.wounds);
    const fullStats = applyEquipmentStats(woundedStats, hero.equipment);
    const damageTakenMultiplier = computeDamageTakenMultiplier(hero.wounds);
    const rareFields = rarePropertyFields(hero.equipment);
    const { abilities, aiPriority } = resolveCombatAbilities(hero);
    const woundedMaxHp = fullStats.hp;
    combatants.push(
      createHeroCombatant(hero.classId, (i + 1) as SlotIndex, `p${i}`, {
        baseStats: fullStats,
        currentHp: Math.min(hero.currentHp, woundedMaxHp),
        maxHp: woundedMaxHp,
        traitId: hero.traitId,
        abilities,
        aiPriority,
        ...(damageTakenMultiplier !== 1 ? { damageTakenMultiplier } : {}),
        ...rareFields,
      }),
    );
  }

  for (let i = 0; i < encounter.enemies.length; i++) {
    const placement = encounter.enemies[i];
    const scaled = scaleEnemyStats(placement.enemyId, encounter.scale);
    combatants.push(
      createEnemyCombatant(placement.enemyId, placement.slot, `e${i}`, {
        baseStats: scaled,
        currentHp: scaled.hp,
        maxHp: scaled.hp,
      }),
    );
  }

  return { combatants, round: 0, exhaustionLevel: 0 };
}
```

- [ ] **Step 4: Run all tests + typecheck + build**

Run: `npx vitest run`
Expected: all passing (existing tests + new integration tests).

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run build`
Expected: success.

---

## Verification checklist

- [ ] `npm test` passes (existing 804 + ~30 new tests).
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] Phaser firewall intact: `grep -r "from 'phaser'" src/data src/items src/run src/combat src/heroes src/save src/dungeon src/camp` returns nothing.
- [ ] All 6 classes have `weaponFamily` + `basicAbility`. 5 of 6 have `swapTarget` + `weaponSwaps` (Archer omits both).
- [ ] 8 new abilities exist in `ABILITIES` and the `AbilityId` union.
- [ ] `shield_bash.requiresShield === true`; no other ability has it set.
- [ ] `resolveCombatAbilities` covers all 3 bands + shield filter.
- [ ] `buildCombatState` routes the resolved kit through `createHeroCombatant` overrides.

---

## Open follow-ups (out of scope this plan)

- **Barracks panel resolved-kit display.** Most important. Currently shows `CLASSES[classId].abilities` directly; will become misleading once players equip non-preferred weapons. Should be next-task.
- **Equip panel ability preview** — "swapping to this weapon will swap Shield Bash → Cleaving Swing" overlay.
- **Two-handed weapon → blocks shield slot.** Currently a Knight could equip an axe AND a shield with no rule preventing it.
- **Per-tier weapon variants** (basic sword vs longsword vs greatsword). Future weapon sub-types extend the kit-resolution algorithm naturally.
- **Archer same-family flexibility.** Already in `ideas.md`. Defer post-launch.
- **Balance tuning** of the 8 new swap abilities (Whirl Strike's 0.65 power, Priest + staff losing radiant tag, etc.). Best done via playtest signal.
