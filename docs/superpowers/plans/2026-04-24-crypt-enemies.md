# Crypt Enemies — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the 4 Crypt minions + Bone Lich boss as pure-TypeScript data, with 8 new enemy-only abilities, the Crypt pool/boss exports, and integrity tests.

**Architecture:** Extend the existing `src/data/` layer from task 2. `types.ts` gains `EnemyId`, `EnemyRole`, `EnemyDef` and 8 new `AbilityId` literals + 2 new `StatusId` literals. `abilities.ts` gains 8 new ability records. A new `enemies.ts` exports the `ENEMIES` registry, `CRYPT_POOL`, and `CRYPT_BOSS`. Two existing test files are adjusted to split canCastFrom validation: abilities.test.ts loosens to `⊆ [1..4]` (enemy abilities cast from slot 4), classes.test.ts adds a per-class check that referenced abilities stay `⊆ [1..3]`.

**Tech Stack:** TypeScript 6.0, Vitest 4.1. No phaser.

**Repo convention (overrides skill default):** `CLAUDE.md` says *"Never create git commits without explicit user instruction in the current turn."* This plan has **no commit steps**. The user stages and commits at their own cadence.

**Source spec:** [`docs/superpowers/specs/2026-04-24-crypt-enemies-design.md`](../specs/2026-04-24-crypt-enemies-design.md).

---

## File Structure

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/data/types.ts` | Modify | Add `EnemyId`, `EnemyRole`, `EnemyDef`; extend `AbilityId` (+8), `StatusId` (+2). |
| `src/data/abilities.ts` | Modify | Append 8 enemy-only ability records. |
| `src/data/enemies.ts` | Create | `ENEMIES` registry + `CRYPT_POOL` + `CRYPT_BOSS`. |
| `src/data/__tests__/abilities.test.ts` | Modify | Expand `EXPECTED_IDS` to 20 ids; loosen `canCastFrom` slot range to `[1..4]`. |
| `src/data/__tests__/classes.test.ts` | Modify | Add per-class check that `canCastFrom` of every referenced ability is `⊆ [1..3]`. |
| `src/data/__tests__/enemies.test.ts` | Create | Integrity + pool/boss coherence + caster-slot-reach checks. |

---

## Task 1: Extend types + abilities for enemy vocabulary

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/abilities.ts`
- Modify: `src/data/__tests__/abilities.test.ts`

This task must land atomically — extending `AbilityId` without adding the corresponding `ABILITIES` entries would leave `Record<AbilityId, Ability>` type-incomplete. Steps land types, records, and test expectations together, in an order that keeps the compiler happy between each save.

- [ ] **Step 1: Extend `src/data/types.ts`**

Modify the file. Extend the existing `AbilityId` union with 8 new enemy ids (append to the existing list), extend `StatusId` with two new ids, and add `EnemyId`, `EnemyRole`, `EnemyDef` at the bottom of the file.

Change `AbilityId` from:

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
  | 'bless';
```

to:

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
  | 'curse_of_frailty';
```

Change `StatusId` from:

```ts
export type StatusId = 'bulwark' | 'taunting' | 'marked' | 'blessed';
```

to:

```ts
export type StatusId = 'bulwark' | 'taunting' | 'marked' | 'blessed' | 'rotting' | 'frailty';
```

Append these new declarations at the end of the file:

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

After saving, `src/data/abilities.ts` will fail to typecheck because `ABILITIES: Record<AbilityId, Ability>` is now missing 8 keys. That's expected — the next step resolves it.

- [ ] **Step 2: Append 8 enemy ability records to `src/data/abilities.ts`**

Open the file and insert the following inside the `ABILITIES` object literal, after the existing `bless` entry and before the closing `};`:

```ts
  bone_slash: {
    id: 'bone_slash',
    name: 'Bone Slash',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 0.8 }],
  },
  bone_arrow: {
    id: 'bone_arrow',
    name: 'Bone Arrow',
    canCastFrom: [2, 3, 4],
    target: { side: 'enemy', slots: 'all', pick: 'first' },
    effects: [{ kind: 'damage', power: 0.9 }],
  },
  rotting_bite: {
    id: 'rotting_bite',
    name: 'Rotting Bite',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1] },
    effects: [
      { kind: 'damage', power: 0.9 },
      { kind: 'debuff', stat: 'attack', delta: -1, duration: 2, statusId: 'rotting' },
    ],
  },
  dark_bolt: {
    id: 'dark_bolt',
    name: 'Dark Bolt',
    canCastFrom: [2, 3, 4],
    target: { side: 'enemy', slots: 'all', pick: 'first' },
    effects: [{ kind: 'damage', power: 0.9 }],
  },
  dark_pact: {
    id: 'dark_pact',
    name: 'Dark Pact',
    canCastFrom: [2, 3, 4],
    target: { side: 'ally', filter: { kind: 'hurt' }, pick: 'lowestHp' },
    effects: [{ kind: 'heal', power: 1.0 }],
  },
  necrotic_wave: {
    id: 'necrotic_wave',
    name: 'Necrotic Wave',
    canCastFrom: [1, 2, 3, 4],
    target: { side: 'enemy', slots: 'all' },
    effects: [{ kind: 'damage', power: 0.4 }],
  },
  lich_strike: {
    id: 'lich_strike',
    name: 'Lich Strike',
    canCastFrom: [1, 2, 3, 4],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 1.0 }],
  },
  curse_of_frailty: {
    id: 'curse_of_frailty',
    name: 'Curse of Frailty',
    canCastFrom: [1, 2, 3, 4],
    target: { side: 'enemy', filter: { kind: 'lacksStatus', statusId: 'frailty' }, pick: 'first' },
    effects: [{ kind: 'debuff', stat: 'hp', delta: -3, duration: 2, statusId: 'frailty' }],
  },
```

After this step, the file typechecks again.

- [ ] **Step 3: Update `src/data/__tests__/abilities.test.ts` — expand `EXPECTED_IDS` and loosen slot range**

Change `EXPECTED_IDS` from:

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
];
```

to (adds the 8 new enemy ids):

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
];
```

Change the `canCastFrom` slot-range assertion from:

```ts
    it('has a non-empty canCastFrom of valid player-side slots', () => {
      const slots = ABILITIES[id].canCastFrom;
      expect(slots.length).toBeGreaterThan(0);
      for (const s of slots) expect([1, 2, 3]).toContain(s);
    });
```

to:

```ts
    it('has a non-empty canCastFrom of valid slots', () => {
      const slots = ABILITIES[id].canCastFrom;
      expect(slots.length).toBeGreaterThan(0);
      for (const s of slots) expect([1, 2, 3, 4]).toContain(s);
    });
```

Leave every other test in the file unchanged — the `describe.each(EXPECTED_IDS)` block automatically covers the 8 new abilities once they're in `EXPECTED_IDS`.

- [ ] **Step 4: Run the ability tests**

Run: `npx vitest run src/data/__tests__/abilities.test.ts`
Expected: all tests pass. The suite now runs ~122 assertions across 20 abilities (was 74 across 12).

- [ ] **Step 5: Run the typecheck**

Run: `npx tsc --noEmit`
Expected: exit code 0, no output.

---

## Task 2: Tighten `classes.test.ts` with player-side slot check

**Files:**
- Modify: `src/data/__tests__/classes.test.ts`

Task 1 relaxed abilities.test.ts's `[1..3]` slot check to `[1..4]` to accommodate enemy abilities. This task reclaims the narrower enforcement at the layer where it actually matters — the class module, which may only reference abilities castable from player-side slots.

- [ ] **Step 1: Add the player-side slot check inside the `describe.each(EXPECTED_IDS)('class %s', ...)` block**

Open `src/data/__tests__/classes.test.ts`. Locate the existing test block:

```ts
    it('has a starter weapon sprite id', () => {
      expect(CLASSES[id].starterLoadout.weapon).toBeTruthy();
    });
  });
```

Insert the new test before the closing `});`:

```ts
    it('has a starter weapon sprite id', () => {
      expect(CLASSES[id].starterLoadout.weapon).toBeTruthy();
    });

    it('references only abilities castable from player-side slots', () => {
      for (const abilityId of CLASSES[id].abilities) {
        const slots = ABILITIES[abilityId].canCastFrom;
        for (const s of slots) {
          expect(
            [1, 2, 3],
            `${id} references ${abilityId} with canCastFrom=${s} (must be 1-3)`,
          ).toContain(s);
        }
      }
    });
  });
```

The existing `import { ABILITIES } from '../abilities';` is already in the file, so no new imports are needed.

- [ ] **Step 2: Run the class tests**

Run: `npx vitest run src/data/__tests__/classes.test.ts`
Expected: all tests pass. Tier 1 class abilities all cast from slots in [1..3], so the new check is green immediately.

---

## Task 3: Create `src/data/enemies.ts` with integrity tests

**Files:**
- Create: `src/data/enemies.ts`
- Create: `src/data/__tests__/enemies.test.ts`

Same TDD shape as task 2 (classes) from the previous plan: stub, write tests, confirm RED, fill data, confirm GREEN.

- [ ] **Step 1: Create `src/data/enemies.ts` as a stub**

```ts
import type { EnemyDef, EnemyId } from './types';

export const ENEMIES: Record<EnemyId, EnemyDef> = {} as Record<EnemyId, EnemyDef>;

export const CRYPT_POOL: readonly EnemyId[] = [];

export const CRYPT_BOSS: EnemyId = 'bone_lich';
```

- [ ] **Step 2: Create `src/data/__tests__/enemies.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../abilities';
import { CRYPT_BOSS, CRYPT_POOL, ENEMIES } from '../enemies';
import type { EnemyId } from '../types';

const EXPECTED_IDS: readonly EnemyId[] = [
  'skeleton_warrior',
  'skeleton_archer',
  'ghoul',
  'cultist',
  'bone_lich',
];

const STATS: readonly ('hp' | 'attack' | 'defense' | 'speed')[] = [
  'hp',
  'attack',
  'defense',
  'speed',
];

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const SPRITE_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

describe('ENEMIES', () => {
  it('registers every expected enemy id', () => {
    for (const id of EXPECTED_IDS) {
      expect(ENEMIES[id], `missing enemy ${id}`).toBeDefined();
    }
  });

  it('has no stray entries', () => {
    const actual = Object.keys(ENEMIES).sort();
    const expected = [...EXPECTED_IDS].sort();
    expect(actual).toEqual(expected);
  });

  describe.each(EXPECTED_IDS)('enemy %s', (id) => {
    it('has matching id field', () => {
      expect(ENEMIES[id].id).toBe(id);
    });

    it('has all four base stats positive and finite', () => {
      for (const s of STATS) {
        const v = ENEMIES[id].baseStats[s];
        expect(v, `${id}.${s}`).toBeGreaterThan(0);
        expect(Number.isFinite(v), `${id}.${s} finite`).toBe(true);
      }
    });

    it('has a non-empty tags list', () => {
      expect(ENEMIES[id].tags.length).toBeGreaterThan(0);
    });

    it('lists only registered abilities', () => {
      for (const abilityId of ENEMIES[id].abilities) {
        expect(ABILITIES[abilityId], `${id} references missing ability ${abilityId}`).toBeDefined();
      }
    });

    it('aiPriority is a subset of abilities', () => {
      const abilitySet = new Set<string>(ENEMIES[id].abilities);
      for (const p of ENEMIES[id].aiPriority) {
        expect(
          abilitySet.has(p),
          `${id} prioritizes ${p} which is not in its abilities list`,
        ).toBe(true);
      }
    });

    it('has non-empty preferredSlots within 1..4', () => {
      const slots = ENEMIES[id].preferredSlots;
      expect(slots.length).toBeGreaterThan(0);
      for (const s of slots) expect([1, 2, 3, 4]).toContain(s);
    });

    it('has a non-empty kebab-case spriteId', () => {
      expect(ENEMIES[id].spriteId).toMatch(SPRITE_ID_PATTERN);
      expect(ENEMIES[id].spriteId).toMatch(KEBAB_CASE.source.replace(/-/g, '_'));
    });

    it('every priority ability overlaps preferredSlots', () => {
      const preferred = new Set<number>(ENEMIES[id].preferredSlots);
      for (const abilityId of ENEMIES[id].aiPriority) {
        const castable = ABILITIES[abilityId].canCastFrom;
        const overlap = castable.some((s) => preferred.has(s));
        expect(
          overlap,
          `${id}: priority ability ${abilityId} (canCastFrom=${castable.join(',')}) does not overlap preferredSlots=${[...preferred].join(',')}`,
        ).toBe(true);
      }
    });
  });

  it('exactly one enemy has role boss, and it equals CRYPT_BOSS', () => {
    const bosses = Object.values(ENEMIES).filter((e) => e.role === 'boss');
    expect(bosses).toHaveLength(1);
    expect(bosses[0].id).toBe(CRYPT_BOSS);
  });

  it('every minion appears in CRYPT_POOL and vice-versa', () => {
    const minionIds = Object.values(ENEMIES)
      .filter((e) => e.role === 'minion')
      .map((e) => e.id)
      .sort();
    const poolIds = [...CRYPT_POOL].sort();
    expect(poolIds).toEqual(minionIds);
  });

  it('CRYPT_POOL entries are all registered as minions', () => {
    for (const id of CRYPT_POOL) {
      expect(ENEMIES[id], `pool references missing enemy ${id}`).toBeDefined();
      expect(ENEMIES[id].role).toBe('minion');
    }
  });
});
```

Notes on the spriteId regex: the existing `KEBAB_CASE` regex used in abilities tests uses hyphens, but sprite ids use underscores (`skeleton_warrior`, `bone_lich`). Using a snake_case pattern here matches the logical-id convention from the spec.

- [ ] **Step 3: Run the enemy tests — expect RED**

Run: `npx vitest run src/data/__tests__/enemies.test.ts`
Expected: FAIL. The `registers every expected enemy id` test reports 5 missing ids; `has no stray entries` fails; the `describe.each` block errors on `ENEMIES[id]` being undefined; the pool/boss coherence tests fail (pool is empty).

- [ ] **Step 4: Replace `src/data/enemies.ts` with the full implementation**

```ts
import type { EnemyDef, EnemyId } from './types';

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  skeleton_warrior: {
    id: 'skeleton_warrior',
    name: 'Skeleton Warrior',
    role: 'minion',
    baseStats: { hp: 12, attack: 3, defense: 2, speed: 3 },
    tags: ['undead'],
    abilities: ['bone_slash'],
    aiPriority: ['bone_slash'],
    preferredSlots: [1, 2],
    spriteId: 'skeleton_warrior',
  },
  skeleton_archer: {
    id: 'skeleton_archer',
    name: 'Skeleton Archer',
    role: 'minion',
    baseStats: { hp: 10, attack: 4, defense: 1, speed: 4 },
    tags: ['undead'],
    abilities: ['bone_arrow'],
    aiPriority: ['bone_arrow'],
    preferredSlots: [3, 4],
    spriteId: 'skeleton_archer',
  },
  ghoul: {
    id: 'ghoul',
    name: 'Ghoul',
    role: 'minion',
    baseStats: { hp: 14, attack: 3, defense: 2, speed: 3 },
    tags: ['undead'],
    abilities: ['rotting_bite'],
    aiPriority: ['rotting_bite'],
    preferredSlots: [1, 2],
    spriteId: 'ghoul',
  },
  cultist: {
    id: 'cultist',
    name: 'Cultist',
    role: 'minion',
    baseStats: { hp: 10, attack: 3, defense: 1, speed: 3 },
    tags: ['humanoid'],
    abilities: ['dark_pact', 'dark_bolt'],
    aiPriority: ['dark_pact', 'dark_bolt'],
    preferredSlots: [3, 4],
    spriteId: 'cultist',
  },
  bone_lich: {
    id: 'bone_lich',
    name: 'Bone Lich',
    role: 'boss',
    baseStats: { hp: 35, attack: 5, defense: 3, speed: 3 },
    tags: ['undead'],
    abilities: ['curse_of_frailty', 'necrotic_wave', 'lich_strike'],
    aiPriority: ['curse_of_frailty', 'necrotic_wave', 'lich_strike'],
    preferredSlots: [3, 4],
    spriteId: 'bone_lich',
  },
};

export const CRYPT_POOL: readonly EnemyId[] = [
  'skeleton_warrior',
  'skeleton_archer',
  'ghoul',
  'cultist',
];

export const CRYPT_BOSS: EnemyId = 'bone_lich';
```

- [ ] **Step 5: Run the enemy tests — expect GREEN**

Run: `npx vitest run src/data/__tests__/enemies.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Run the typecheck**

Run: `npx tsc --noEmit`
Expected: exit code 0.

---

## Task 4: Full-suite verification

**Files:** none changed.

- [ ] **Step 1: Run the full Vitest suite**

Run: `npm test`
Expected: all tests pass. Total should be roughly ~180 assertions (was 140 after task 2; this task adds ~40 — 48 on abilities re-expansion + 40+ across 5 enemies).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: `tsc` exits 0, Vite emits a `dist/` bundle. The pre-existing chunk-size warning about phaser is unrelated.

- [ ] **Step 3: Hand off to user**

Summarize:
- Files created: `src/data/enemies.ts`, `src/data/__tests__/enemies.test.ts`.
- Files modified: `src/data/types.ts`, `src/data/abilities.ts`, `src/data/__tests__/abilities.test.ts`, `src/data/__tests__/classes.test.ts`.
- Test count added vs. pre-task-3 baseline.
- Offer to migrate TODO.md → HISTORY.md entry for task 3.
- Remind that commits are user-driven per repo convention.

---

## Self-review

**Spec coverage:**

- Module layout (types extension, abilities extension, new enemies.ts, test-file adjustments) → Task 1 covers types + abilities + abilities.test; Task 2 covers classes.test; Task 3 covers enemies.ts + enemies.test.
- `EnemyDef` shape → Task 1 step 1 adds it.
- Enemy-only ability additions (8 records, 2 new statusIds) → Task 1 steps 1 and 2.
- Tier 1 Crypt content (5 enemies, pool, boss) → Task 3 step 4.
- Tests (registry completeness, role/pool coherence, caster-slot reach) → Task 3 step 2.
- Risks / follow-ups → not implementation-level; no task needed.
- Caster-relative sides → declared in spec, will be honored when task 4 (combat engine) implements the selector resolver. No test harness for it at this layer.
- Max-HP debuff clamp semantics → engine invariant for task 4; no test at this layer.

No gaps.

**Placeholder scan:** no TBDs, "similar to task N" references, or vague instructions. Every code step has complete content.

**Type consistency:** cross-checked — the 8 new `AbilityId` literals listed in types.ts, the 8 new records in abilities.ts, and the 8 new ids in `EXPECTED_IDS` all match. The 5 `EnemyId` literals match the `ENEMIES` keys and the `EXPECTED_IDS` in enemies.test.ts. `CRYPT_POOL` has exactly the 4 minion ids and `CRYPT_BOSS` is `bone_lich`, which is the only entry with `role: 'boss'`. `StatusId` extension (`rotting`, `frailty`) is used by the `rotting_bite` and `curse_of_frailty` abilities respectively.
