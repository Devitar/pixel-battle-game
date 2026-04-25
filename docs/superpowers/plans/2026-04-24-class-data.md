# Class Data — Knight, Archer, Priest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the three Tier 1 classes (Knight, Archer, Priest) and their 12 abilities as pure-TypeScript data modules under `src/data/`, with data-integrity tests.

**Architecture:** Three new files in `src/data/` — `types.ts` (shared shapes), `abilities.ts` (ABILITIES registry of 12 entries), `classes.ts` (CLASSES registry of 3 entries). Test files alongside in `src/data/__tests__/`. Everything is pure data + type definitions — no runtime logic, no phaser, no imports outside `src/data/` (plus `src/combat/types.ts` for `Stats` and `src/render/sprite_names.generated.ts` for sprite frame ids; both are pure-data modules with no phaser dependency).

**Tech Stack:** TypeScript 6.0, Vitest 4.1.

**Repo convention (overrides skill default):** `CLAUDE.md` says *"Never create git commits without explicit user instruction in the current turn."* This plan therefore has **no commit steps**. Each task ends with a verification step; the user will stage and commit at their chosen cadence.

**Source spec:** [`docs/superpowers/specs/2026-04-24-class-data-design.md`](../specs/2026-04-24-class-data-design.md).

---

## File Structure

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/data/types.ts` | Create | All shared types for `data/`: `ClassId`, `AbilityId`, `SlotIndex`, `Side`, `TargetSelector`, `TargetFilter`, `AbilityEffect`, `BuffableStat`, `Ability`, `AbilityTag`, `ClassDef`, `WeaponType`, `StarterLoadout`, `StatusId`, `CombatantTag`. Pure declarations. |
| `src/data/abilities.ts` | Create | `export const ABILITIES: Record<AbilityId, Ability>` with the 12 Tier 1 ability records. |
| `src/data/classes.ts` | Create | `export const CLASSES: Record<ClassId, ClassDef>` with 3 class records (Knight, Archer, Priest). |
| `src/data/__tests__/abilities.test.ts` | Create | Data-integrity checks: every `AbilityId` registered, `canCastFrom` non-empty and in range, slot ranges valid, effects non-empty, statusId round-trip, statusId kebab-case. |
| `src/data/__tests__/classes.test.ts` | Create | Data-integrity checks: every `ClassId` registered, ability / aiPriority refs resolve, baseStats positive, Knight has shield starter, Archer and Priest don't. |

---

## Task 1: Create `src/data/types.ts`

**Files:**
- Create: `src/data/types.ts`

Types alone cannot be TDD-tested (no runtime behavior). The gate is a `tsc --noEmit` pass: if types are self-consistent, the compile succeeds.

- [ ] **Step 1: Create `src/data/types.ts` with the full content**

```ts
import type { Stats } from '../combat/types';

export type ClassId = 'knight' | 'archer' | 'priest';

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
  | 'bless';

export type StatusId = 'bulwark' | 'taunting' | 'marked' | 'blessed';

export type AbilityTag = 'radiant';

export type CombatantTag = 'undead' | 'beast' | 'humanoid';

export type WeaponType = 'sword' | 'bow' | 'holy_symbol';

export type SlotIndex = 1 | 2 | 3 | 4;

export type Side = 'self' | 'ally' | 'enemy';

export type BuffableStat = 'hp' | 'attack' | 'defense' | 'speed';

export type TargetFilter =
  | { kind: 'hurt' }
  | { kind: 'hasStatus'; statusId: StatusId }
  | { kind: 'lacksStatus'; statusId: StatusId }
  | { kind: 'hasTag'; tag: CombatantTag };

export interface TargetSelector {
  side: Side;
  slots?: readonly SlotIndex[] | 'all' | 'furthest';
  filter?: TargetFilter;
  pick?: 'first' | 'random' | 'lowestHp' | 'highestHp';
}

export type AbilityEffect =
  | { kind: 'damage'; power: number }
  | { kind: 'heal'; power: number }
  | { kind: 'stun'; duration: number }
  | { kind: 'shove'; slots: number }
  | { kind: 'pull'; slots: number }
  | { kind: 'buff'; stat: BuffableStat; delta: number; duration: number; statusId: StatusId }
  | { kind: 'debuff'; stat: BuffableStat; delta: number; duration: number; statusId: StatusId }
  | { kind: 'mark'; damageBonus: number; duration: number; statusId: StatusId }
  | { kind: 'taunt'; duration: number; statusId: StatusId };

export interface Ability {
  id: AbilityId;
  name: string;
  canCastFrom: readonly SlotIndex[];
  target: TargetSelector;
  effects: readonly AbilityEffect[];
  tags?: readonly AbilityTag[];
}

export interface StarterLoadout {
  weapon: string;       // sprite frame id from SPRITE_NAMES.weapon.*
  shield?: string;      // sprite frame id from SPRITE_NAMES.shield.* (Knight only in Tier 1)
}

export interface ClassDef {
  id: ClassId;
  name: string;
  baseStats: Stats;
  preferredWeapon: WeaponType;
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  starterLoadout: StarterLoadout;
}
```

- [ ] **Step 2: Verify types.ts compiles cleanly**

Run: `npx tsc --noEmit`
Expected: exit code 0, no output.

If `src/combat/types.ts` import fails, verify it exists and exports `Stats` (it already does in this repo).

---

## Task 2: Implement `src/data/abilities.ts` with integrity tests

**Files:**
- Create: `src/data/abilities.ts`
- Create: `src/data/__tests__/abilities.test.ts`

TDD cycle: write tests first, stub `abilities.ts` so the tests compile, run (RED), fill in data, run (GREEN).

- [ ] **Step 1: Create `src/data/abilities.ts` as a stub**

```ts
import type { Ability, AbilityId } from './types';

export const ABILITIES: Record<AbilityId, Ability> = {} as Record<AbilityId, Ability>;
```

- [ ] **Step 2: Create `src/data/__tests__/abilities.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../abilities';
import type { AbilityEffect, AbilityId, StatusId, TargetFilter } from '../types';

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
];

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function producedStatusIds(effects: readonly AbilityEffect[]): readonly StatusId[] {
  const out: StatusId[] = [];
  for (const e of effects) {
    if (e.kind === 'buff' || e.kind === 'debuff' || e.kind === 'mark' || e.kind === 'taunt') {
      out.push(e.statusId);
    }
  }
  return out;
}

function filterStatusId(filter: TargetFilter | undefined): StatusId | undefined {
  if (!filter) return undefined;
  if (filter.kind === 'hasStatus' || filter.kind === 'lacksStatus') return filter.statusId;
  return undefined;
}

describe('ABILITIES', () => {
  it('registers every expected ability id', () => {
    for (const id of EXPECTED_IDS) {
      expect(ABILITIES[id], `missing ability ${id}`).toBeDefined();
    }
  });

  it('has no stray entries', () => {
    const actual = Object.keys(ABILITIES).sort();
    const expected = [...EXPECTED_IDS].sort();
    expect(actual).toEqual(expected);
  });

  describe.each(EXPECTED_IDS)('ability %s', (id) => {
    it('has matching id field', () => {
      expect(ABILITIES[id].id).toBe(id);
    });

    it('has a non-empty canCastFrom of valid player-side slots', () => {
      const slots = ABILITIES[id].canCastFrom;
      expect(slots.length).toBeGreaterThan(0);
      for (const s of slots) expect([1, 2, 3]).toContain(s);
    });

    it('has at least one effect', () => {
      expect(ABILITIES[id].effects.length).toBeGreaterThan(0);
    });

    it('has valid target slots if array', () => {
      const slots = ABILITIES[id].target.slots;
      if (Array.isArray(slots)) {
        for (const s of slots) expect([1, 2, 3, 4]).toContain(s);
      }
    });

    it('produces only kebab-case statusIds', () => {
      for (const sid of producedStatusIds(ABILITIES[id].effects)) {
        expect(sid, `bad statusId on ${id}: ${sid}`).toMatch(KEBAB_CASE);
      }
    });

    it('round-trips statusId between filter and effect', () => {
      const filterId = filterStatusId(ABILITIES[id].target.filter);
      const produced = producedStatusIds(ABILITIES[id].effects);
      if (filterId && produced.length > 0) {
        expect(
          produced.includes(filterId),
          `ability ${id} filters on '${filterId}' but does not produce it`,
        ).toBe(true);
      }
    });
  });
});
```

- [ ] **Step 3: Run the test file — expect RED**

Run: `npx vitest run src/data/__tests__/abilities.test.ts`
Expected: FAIL. The `registers every expected ability id` test reports each of the 12 ids as missing; `has no stray entries` reports empty keys vs expected 12.

- [ ] **Step 4: Fill in `src/data/abilities.ts` with all 12 ability records**

Replace the stub file content entirely:

```ts
import type { Ability, AbilityId } from './types';

export const ABILITIES: Record<AbilityId, Ability> = {
  knight_slash: {
    id: 'knight_slash',
    name: 'Slash',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 1.0 }],
  },
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
  bulwark: {
    id: 'bulwark',
    name: 'Bulwark',
    canCastFrom: [1, 2, 3],
    target: { side: 'self', filter: { kind: 'lacksStatus', statusId: 'bulwark' } },
    effects: [{ kind: 'buff', stat: 'defense', delta: 3, duration: 2, statusId: 'bulwark' }],
  },
  taunt: {
    id: 'taunt',
    name: 'Taunt',
    canCastFrom: [1, 2, 3],
    target: { side: 'self', filter: { kind: 'lacksStatus', statusId: 'taunting' } },
    effects: [{ kind: 'taunt', duration: 2, statusId: 'taunting' }],
  },

  archer_shoot: {
    id: 'archer_shoot',
    name: 'Shoot',
    canCastFrom: [1, 2, 3],
    target: { side: 'enemy', slots: 'all', pick: 'first' },
    effects: [{ kind: 'damage', power: 1.0 }],
  },
  piercing_shot: {
    id: 'piercing_shot',
    name: 'Piercing Shot',
    canCastFrom: [2, 3],
    target: { side: 'enemy', slots: [3, 4], pick: 'first' },
    effects: [{ kind: 'damage', power: 1.4 }],
  },
  volley: {
    id: 'volley',
    name: 'Volley',
    canCastFrom: [2, 3],
    target: { side: 'enemy', slots: 'all' },
    effects: [{ kind: 'damage', power: 0.5 }],
  },
  flare_arrow: {
    id: 'flare_arrow',
    name: 'Flare Arrow',
    canCastFrom: [2, 3],
    target: { side: 'enemy', filter: { kind: 'lacksStatus', statusId: 'marked' }, pick: 'first' },
    effects: [{ kind: 'mark', damageBonus: 0.5, duration: 2, statusId: 'marked' }],
  },

  priest_strike: {
    id: 'priest_strike',
    name: 'Strike',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 0.8 }],
  },
  mend: {
    id: 'mend',
    name: 'Mend',
    canCastFrom: [2, 3],
    target: { side: 'ally', filter: { kind: 'hurt' }, pick: 'lowestHp' },
    effects: [{ kind: 'heal', power: 1.2 }],
  },
  smite: {
    id: 'smite',
    name: 'Smite',
    canCastFrom: [2, 3],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 1.1 }],
    tags: ['radiant'],
  },
  bless: {
    id: 'bless',
    name: 'Bless',
    canCastFrom: [2, 3],
    target: { side: 'ally', filter: { kind: 'lacksStatus', statusId: 'blessed' }, pick: 'first' },
    effects: [{ kind: 'buff', stat: 'attack', delta: 2, duration: 2, statusId: 'blessed' }],
  },
};
```

- [ ] **Step 5: Run the test file — expect GREEN**

Run: `npx vitest run src/data/__tests__/abilities.test.ts`
Expected: all tests pass (1 `describe.each` × 6 cases × 12 abilities + 2 top-level = 74 passing assertions, give or take).

- [ ] **Step 6: Verify it still type-checks**

Run: `npx tsc --noEmit`
Expected: exit code 0.

---

## Task 3: Implement `src/data/classes.ts` with integrity tests

**Files:**
- Create: `src/data/classes.ts`
- Create: `src/data/__tests__/classes.test.ts`

Same TDD cycle as Task 2.

- [ ] **Step 1: Create `src/data/classes.ts` as a stub**

```ts
import type { ClassDef, ClassId } from './types';

export const CLASSES: Record<ClassId, ClassDef> = {} as Record<ClassId, ClassDef>;
```

- [ ] **Step 2: Create `src/data/__tests__/classes.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../abilities';
import { CLASSES } from '../classes';
import type { ClassId } from '../types';

const EXPECTED_IDS: readonly ClassId[] = ['knight', 'archer', 'priest'];
const STATS: readonly ('hp' | 'attack' | 'defense' | 'speed')[] = [
  'hp',
  'attack',
  'defense',
  'speed',
];

describe('CLASSES', () => {
  it('registers every expected class id', () => {
    for (const id of EXPECTED_IDS) {
      expect(CLASSES[id], `missing class ${id}`).toBeDefined();
    }
  });

  it('has no stray entries', () => {
    const actual = Object.keys(CLASSES).sort();
    const expected = [...EXPECTED_IDS].sort();
    expect(actual).toEqual(expected);
  });

  describe.each(EXPECTED_IDS)('class %s', (id) => {
    it('has matching id field', () => {
      expect(CLASSES[id].id).toBe(id);
    });

    it('has all four base stats positive and finite', () => {
      for (const s of STATS) {
        const v = CLASSES[id].baseStats[s];
        expect(v, `${id}.${s}`).toBeGreaterThan(0);
        expect(Number.isFinite(v), `${id}.${s} finite`).toBe(true);
      }
    });

    it('lists only registered abilities', () => {
      for (const abilityId of CLASSES[id].abilities) {
        expect(ABILITIES[abilityId], `${id} references missing ability ${abilityId}`).toBeDefined();
      }
    });

    it('aiPriority is a subset of abilities', () => {
      const abilities = new Set<string>(CLASSES[id].abilities);
      for (const p of CLASSES[id].aiPriority) {
        expect(
          abilities.has(p),
          `${id} prioritizes ${p} which is not in its abilities list`,
        ).toBe(true);
      }
    });

    it('has a starter weapon sprite id', () => {
      expect(CLASSES[id].starterLoadout.weapon).toBeTruthy();
    });
  });

  it('Knight starts with a shield, Archer and Priest do not', () => {
    expect(CLASSES.knight.starterLoadout.shield).toBeTruthy();
    expect(CLASSES.archer.starterLoadout.shield).toBeUndefined();
    expect(CLASSES.priest.starterLoadout.shield).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test file — expect RED**

Run: `npx vitest run src/data/__tests__/classes.test.ts`
Expected: FAIL — every `class %s` `describe.each` block errors on `CLASSES[id]` being `undefined`; top-level `registers every expected class id` reports all three ids missing.

- [ ] **Step 4: Fill in `src/data/classes.ts` with the 3 class records**

Replace the stub file content entirely:

```ts
import { SPRITE_NAMES } from '../render/sprite_names.generated';
import type { ClassDef, ClassId } from './types';

export const CLASSES: Record<ClassId, ClassDef> = {
  knight: {
    id: 'knight',
    name: 'Knight',
    baseStats: { hp: 20, attack: 4, defense: 4, speed: 3 },
    preferredWeapon: 'sword',
    abilities: ['knight_slash', 'shield_bash', 'bulwark', 'taunt'],
    aiPriority: ['shield_bash', 'bulwark', 'taunt', 'knight_slash'],
    starterLoadout: {
      weapon: String(SPRITE_NAMES.weapon.sword_tier1),
      shield: String(SPRITE_NAMES.shield.alloy_shield_1),
    },
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    baseStats: { hp: 14, attack: 5, defense: 2, speed: 5 },
    preferredWeapon: 'bow',
    abilities: ['archer_shoot', 'piercing_shot', 'volley', 'flare_arrow'],
    aiPriority: ['flare_arrow', 'piercing_shot', 'volley', 'archer_shoot'],
    starterLoadout: {
      weapon: String(SPRITE_NAMES.weapon.bow_wood_tier1),
    },
  },
  priest: {
    id: 'priest',
    name: 'Priest',
    baseStats: { hp: 15, attack: 3, defense: 2, speed: 4 },
    preferredWeapon: 'holy_symbol',
    abilities: ['priest_strike', 'mend', 'smite', 'bless'],
    aiPriority: ['mend', 'bless', 'smite', 'priest_strike'],
    starterLoadout: {
      weapon: String(SPRITE_NAMES.weapon.mace_tier1),
    },
  },
};
```

Notes:
- `SPRITE_NAMES.weapon.*` entries are frame-index numbers; `String(...)` stores them as strings in `StarterLoadout.weapon` (its type). The render layer will convert back when resolving a sprite.
- Priest's cosmetic weapon is the mace (the sprite catalog has no "holy symbol" yet); the logical `preferredWeapon` stays `'holy_symbol'` to match the GDD. When bespoke holy-symbol art arrives in a later task, only the sprite id needs updating.

- [ ] **Step 5: Run the test file — expect GREEN**

Run: `npx vitest run src/data/__tests__/classes.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Verify everything still type-checks**

Run: `npx tsc --noEmit`
Expected: exit code 0.

---

## Task 4: Full-suite verification

**Files:** none changed.

- [ ] **Step 1: Run the full Vitest suite**

Run: `npm test`
Expected: all tests pass (the two new data test files plus any pre-existing tests under `src/render/__tests__/` and `src/util/__tests__/`).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: `tsc` exits 0, Vite emits a `dist/` bundle. No warnings about unused symbols in the new `src/data/` files.

- [ ] **Step 3: Hand off to the user**

Summarize:
- Files created: `src/data/types.ts`, `src/data/abilities.ts`, `src/data/classes.ts`, `src/data/__tests__/abilities.test.ts`, `src/data/__tests__/classes.test.ts`.
- Tests added: N assertions across two files.
- Offer to help the user stage and commit, per repo convention (no commits without explicit user instruction).
- Suggest updating `TODO.md` → `HISTORY.md` for task 2 once the user is satisfied.

---

## Self-review

**Spec coverage (spec sections → tasks):**

- Purpose / constraints → Task header.
- Module layout → Task 1 (types), Task 2 (abilities), Task 3 (classes).
- Ability effect model → Task 1 defines the union; Task 2 populates.
- Ability shape → Task 1 defines; Task 2 populates.
- Target selector grammar (incl. collapse-on-death note) → Task 1 defines; Task 2 abilities use it.
- Class template → Task 1 defines `ClassDef`; Task 3 populates.
- Tier 1 content (class table, AI priorities, 12 abilities) → Tasks 2 and 3.
- Tests (classes.test.ts + abilities.test.ts) → Tasks 2 and 3.
- Risks / follow-ups — not implementation-level; no task needed.

No gaps.

**Placeholder scan:** No TBDs, TODOs, "implement later," or "similar to Task N" shortcuts. Every step has runnable content.

**Type consistency:** Cross-checked — `AbilityId` list in types.ts matches `EXPECTED_IDS` in the test and the 12 keys in `ABILITIES`. `StatusId` ids (`bulwark`, `taunting`, `marked`, `blessed`) match what the ability `effects` produce and what the target filters reference. `ClassId` list matches between types.ts, the test, and the `CLASSES` keys. `SPRITE_NAMES` field paths (`weapon.sword_tier1`, `weapon.bow_wood_tier1`, `weapon.mace_tier1`, `shield.alloy_shield_1`) all exist in the generated file (verified against `src/render/sprite_names.generated.ts`).
