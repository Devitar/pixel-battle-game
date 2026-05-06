# Sunken Keep — Spec 2: Content + First-Crypt-Clear Handler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop the Sunken Keep dungeon (4 minions + 1 boss + 4 abilities + 1 status) into spec 1's foundation, register the `first_crypt_clear` milestone handler, and pick real tier-2 balance numbers.

**Architecture:** Strictly additive content. No API refactors — every code surface from spec 1 is consumed as-is. Type-level additions cascade to data tables (`ENEMIES`, `ABILITIES`, `DUNGEONS`, `ENEMY_VISUALS`), tier-2 placeholder values become real numbers (`scaling.ts`, `loot.ts`), and the milestone registry gets its first handler. Spec 1's multi-dungeon UI auto-renders Sunken Keep without scene changes.

**Tech Stack:** TypeScript (strict), Phaser 3, Vitest, Vite.

**Spec:** [`docs/superpowers/specs/2026-05-06-sunken-keep-content-design.md`](../specs/2026-05-06-sunken-keep-content-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/data/types.ts` | Modify | Add `'sunken_keep'` to `DungeonId`; replace `MilestoneId = never` with `MilestoneId = 'first_crypt_clear'`; add 5 `EnemyId`s; add 4 `AbilityId`s; add `'drowning'` to `StatusId`. |
| `src/data/abilities.ts` | Modify | Append 4 new ability entries (`drowning_embrace`, `tidal_smash`, `crushing_wave`, `drowning_lure`). |
| `src/data/__tests__/abilities.test.ts` | Modify | Add the 4 new ids to `EXPECTED_IDS`; add effect-shape tests. |
| `src/data/enemies.ts` | Modify | Append 5 new enemy entries; add `SUNKEN_KEEP_POOL` and `SUNKEN_KEEP_BOSS` exports. |
| `src/data/__tests__/enemies.test.ts` | Modify | Add the 5 new ids to `EXPECTED_IDS`; add `SUNKEN_KEEP_POOL` / `SUNKEN_KEEP_BOSS` registration tests. |
| `src/data/dungeons.ts` | Modify | Add `DUNGEONS['sunken_keep']` entry. |
| `src/data/__tests__/dungeons.test.ts` | Modify | Add Sunken Keep registration tests (tier 2, floorsPerRun 3, rowsPerFloor 10, unlock requirement, valid pool/boss). |
| `src/render/enemy_sprites.ts` | Modify | Add 5 entries to `ENEMY_VISUALS` (placeholders reusing existing frames). |
| `src/dungeon/scaling.ts` | Modify | `TIER_SCALING_SLOPE[2]: 0.10 → 0.13`; `TIER_GOLD_MULTIPLIER[2]: 1 → 1.5`. |
| `src/dungeon/__tests__/scaling.test.ts` | Modify | Replace placeholder tier-2 assertions with real-number assertions. |
| `src/dungeon/loot.ts` | Modify | `TIER_RARITY_FLOOR_BONUS[2]: 0 → 3`. |
| `src/dungeon/__tests__/loot.test.ts` | Modify | Replace placeholder tier-2 assertions; add tier-2 rarity-shift smoke test. |
| `src/run/milestones.ts` | Modify | Register `MILESTONES['first_crypt_clear']`; replace `detectBossMilestones` body; simplify `applyPendingMilestones` cast (no longer needed). |
| `src/run/__tests__/milestones.test.ts` | Modify | Replace spec-1 "MILESTONES is empty" / "returns []" tests with real-handler assertions; add idempotency + flow tests. |
| `src/run/__tests__/run_state.test.ts` | Modify | Update spec-1 "canonical-final-boss returns []" test to assert `['first_crypt_clear']`; add end-to-end Crypt-clear-→-Sunken-Keep-unlocked integration test. |
| `HISTORY.md` | Modify | Append spec-2 entry per the slim template. |
| `TODO.md` | Modify | Migrate Cluster D · 1 → HISTORY (spec 2 done); add new Cluster C entries for bespoke Drowned King art (high priority) and bespoke minion bodies. |

**No new files.** Every change is additive against existing files.

---

## Tasks

### Task 1: Type-level additions

Wire up the new TypeScript identifiers. This is a typecheck-only task — every other task references these types, so it must land first. Spec-1 placeholder cast in `milestones.ts`'s `applyPendingMilestones` (`MILESTONES as Record<string, MilestoneHandler | undefined>`) becomes redundant after this task because `MilestoneId` is no longer `never`. The cast removal happens in Task 7 alongside the handler register.

**Files:**
- Modify: `src/data/types.ts`

- [ ] **Step 1: Run baseline typecheck and tests**

```
npx tsc --noEmit
npm test
```

Expected: clean typecheck; 1543 tests pass (baseline from spec 1).

- [ ] **Step 2: Update `src/data/types.ts`**

Replace `DungeonId`:

```typescript
export type DungeonId = 'crypt' | 'sunken_keep';
```

Replace `MilestoneId`:

```typescript
export type MilestoneId = 'first_crypt_clear';
```

(Remove the inline `// empty in spec 1; spec 2 introduces 'first_crypt_clear'` comment from spec 1's line, since the comment no longer applies.)

Add to the `EnemyId` union — keep the existing entries on top, append the new ones:

```typescript
export type EnemyId =
  | 'skeleton_warrior'
  | 'skeleton_archer'
  | 'ghost'
  | 'zombie'
  | 'cultist'
  | 'bone_lich'
  // Sunken Keep
  | 'drowned_knight'
  | 'brine_crab'
  | 'drowned_sailor'
  | 'siren'
  | 'drowned_king';
```

Add to the `AbilityId` union (find the existing union, append before the `;`):

```typescript
export type AbilityId =
  | /* existing entries unchanged */
  | 'mage_holy_light'
  // Sunken Keep
  | 'drowning_embrace'
  | 'tidal_smash'
  | 'crushing_wave'
  | 'drowning_lure';
```

Add to the `StatusId` union:

```typescript
export type StatusId = 'bulwark' | 'taunting' | 'marked' | 'blessed' | 'rotting' | 'frailty' | 'stunned' | 'chilled' | 'enraged' | 'poisoned' | 'vanished' | 'slowed' | 'burning' | 'drowning';
```

- [ ] **Step 3: Run typecheck — expect failures**

```
npx tsc --noEmit
```

Expected: cascade of errors. `Record<DungeonId, DungeonDef>` in `dungeons.ts` is missing `sunken_keep`; `ENEMIES` is missing 5 ids; `ABILITIES` is missing 4 ids; `MILESTONES`'s empty-record cast may now have type issues (`Record<'first_crypt_clear', MilestoneHandler>` from `{}` is no longer assignable cleanly — but the explicit `as` cast still works).

These are EXPECTED — Tasks 2-7 fill them in.

- [ ] **Step 4: Run vitest — expect failures**

```
npx vitest run src/data/__tests__/enemies.test.ts src/data/__tests__/abilities.test.ts src/data/__tests__/dungeons.test.ts
```

Expected: TypeScript errors prevent compilation. That's fine — we'll iterate through subsequent tasks to clear them.

- [ ] **Step 5: SKIP — DO NOT COMMIT.** (Per user's no-commit policy; leave changes in working tree.)

---

### Task 2: New abilities (`drowning_embrace`, `tidal_smash`, `crushing_wave`, `drowning_lure`)

**Files:**
- Modify: `src/data/abilities.ts`
- Modify: `src/data/__tests__/abilities.test.ts`

- [ ] **Step 1: Update the test fixture FIRST**

In `src/data/__tests__/abilities.test.ts`, add the 4 new ids to `EXPECTED_IDS` (find the existing array starting around line 5 with `'knight_slash'`):

```typescript
const EXPECTED_IDS: readonly AbilityId[] = [
  /* existing 40+ entries unchanged */
  'mage_holy_light',
  // Sunken Keep
  'drowning_embrace',
  'tidal_smash',
  'crushing_wave',
  'drowning_lure',
];
```

(Append the 4 ids at the end with the `// Sunken Keep` separator comment.)

Add new test cases at the end of the file (before the final `});` if there's a top-level describe):

```typescript
describe('drowning_embrace', () => {
  it('is registered with the expected effect shape (pull + drowning poison)', () => {
    const a = ABILITIES.drowning_embrace;
    expect(a.id).toBe('drowning_embrace');
    expect(a.canCastFrom).toContain(1);
    expect(a.cooldown).toBe(3);
    const pull = a.effects.find(e => e.kind === 'pull');
    expect(pull).toBeDefined();
    const poison = a.effects.find(e => e.kind === 'poison');
    expect(poison).toBeDefined();
    if (poison && poison.kind === 'poison') {
      expect(poison.statusId).toBe('drowning');
      expect(poison.damagePerTurn).toBeGreaterThan(0);
    }
  });
});

describe('drowning_lure', () => {
  it('is registered with poison effect that applies the drowning status', () => {
    const a = ABILITIES.drowning_lure;
    expect(a.id).toBe('drowning_lure');
    expect(a.cooldown).toBe(2);
    const poison = a.effects.find(e => e.kind === 'poison');
    expect(poison).toBeDefined();
    if (poison && poison.kind === 'poison') {
      expect(poison.statusId).toBe('drowning');
    }
  });

  it('targets lowest-hp enemy (the wounded hero)', () => {
    const a = ABILITIES.drowning_lure;
    expect(a.target.pick).toBe('lowestHp');
  });
});

describe('tidal_smash and crushing_wave', () => {
  it('tidal_smash is single-target high-damage', () => {
    const a = ABILITIES.tidal_smash;
    expect(a.id).toBe('tidal_smash');
    expect(a.target.slots).toEqual([1]);
    const dmg = a.effects.find(e => e.kind === 'damage');
    if (dmg && dmg.kind === 'damage') {
      expect(dmg.power).toBeCloseTo(1.4);
    }
  });

  it('crushing_wave is AoE with cooldown 3', () => {
    const a = ABILITIES.crushing_wave;
    expect(a.id).toBe('crushing_wave');
    expect(a.target.slots).toBe('all');
    expect(a.cooldown).toBe(3);
    const dmg = a.effects.find(e => e.kind === 'damage');
    if (dmg && dmg.kind === 'damage') {
      expect(dmg.power).toBeCloseTo(0.6);
    }
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```
npx vitest run src/data/__tests__/abilities.test.ts
```

Expected: tests fail because `ABILITIES.drowning_embrace` (etc.) is undefined.

- [ ] **Step 3: Add the 4 ability entries to `src/data/abilities.ts`**

Append at the end of the `ABILITIES` object literal (just before the closing `};`):

```typescript
  drowning_embrace: {
    id: 'drowning_embrace',
    name: 'Drowning Embrace',
    canCastFrom: [1, 2, 3],
    target: { side: 'enemy', slots: [3], pick: 'first' },
    effects: [
      { kind: 'pull', slots: 2 },
      { kind: 'poison', damagePerTurn: 3, duration: 3, statusId: 'drowning' },
    ],
    cooldown: 3,
  },

  tidal_smash: {
    id: 'tidal_smash',
    name: 'Tidal Smash',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1], pick: 'first' },
    effects: [{ kind: 'damage', power: 1.4 }],
  },

  crushing_wave: {
    id: 'crushing_wave',
    name: 'Crushing Wave',
    canCastFrom: [1, 2, 3],
    target: { side: 'enemy', slots: 'all' },
    effects: [{ kind: 'damage', power: 0.6 }],
    cooldown: 3,
  },

  drowning_lure: {
    id: 'drowning_lure',
    name: 'Drowning Lure',
    canCastFrom: [3, 4],
    target: { side: 'enemy', slots: 'all', pick: 'lowestHp' },
    effects: [
      { kind: 'poison', damagePerTurn: 2, duration: 2, statusId: 'drowning' },
    ],
    cooldown: 2,
  },
```

- [ ] **Step 4: Run abilities tests — expect pass**

```
npx vitest run src/data/__tests__/abilities.test.ts
```

Expected: all pass.

- [ ] **Step 5: SKIP — DO NOT COMMIT.**

---

### Task 3: New enemies (4 minions + 1 boss) + pool constants

**Files:**
- Modify: `src/data/enemies.ts`
- Modify: `src/data/__tests__/enemies.test.ts`

- [ ] **Step 1: Update the test fixture FIRST**

In `src/data/__tests__/enemies.test.ts`, add the 5 new ids to `EXPECTED_IDS`:

```typescript
const EXPECTED_IDS: readonly EnemyId[] = [
  'skeleton_warrior',
  'skeleton_archer',
  'ghost',
  'zombie',
  'cultist',
  'bone_lich',
  // Sunken Keep
  'drowned_knight',
  'brine_crab',
  'drowned_sailor',
  'siren',
  'drowned_king',
];
```

Add new test cases at the end:

```typescript
import { SUNKEN_KEEP_BOSS, SUNKEN_KEEP_POOL } from '../enemies';

describe('SUNKEN_KEEP_POOL', () => {
  it('contains exactly the 4 expected minions', () => {
    expect([...SUNKEN_KEEP_POOL].sort()).toEqual(
      ['brine_crab', 'drowned_knight', 'drowned_sailor', 'siren'].sort()
    );
  });

  it('every entry is a registered minion', () => {
    for (const id of SUNKEN_KEEP_POOL) {
      expect(ENEMIES[id]).toBeDefined();
      expect(ENEMIES[id].role).toBe('minion');
    }
  });
});

describe('SUNKEN_KEEP_BOSS', () => {
  it('points to drowned_king and is a registered boss', () => {
    expect(SUNKEN_KEEP_BOSS).toBe('drowned_king');
    expect(ENEMIES[SUNKEN_KEEP_BOSS]).toBeDefined();
    expect(ENEMIES[SUNKEN_KEEP_BOSS].role).toBe('boss');
  });
});

describe('Drowned King', () => {
  it('has the 3 boss abilities and front-line preferred slots', () => {
    const e = ENEMIES.drowned_king;
    expect([...e.abilities].sort()).toEqual(['crushing_wave', 'drowning_embrace', 'tidal_smash']);
    expect(e.preferredSlots).toEqual([1, 2]);
    expect(e.tags).toContain('humanoid');
    expect(e.tags).not.toContain('undead');  // Smite-decoupling
  });
});

describe('Siren', () => {
  it('uses drowning_lure (introduces drowning to minion combat)', () => {
    const e = ENEMIES.siren;
    expect(e.abilities).toContain('drowning_lure');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```
npx vitest run src/data/__tests__/enemies.test.ts
```

Expected: import error for `SUNKEN_KEEP_POOL` / `SUNKEN_KEEP_BOSS`; missing enemy entries.

- [ ] **Step 3: Add the 5 enemy entries to `src/data/enemies.ts`**

Append inside the `ENEMIES` object literal (before the closing `};`):

```typescript
  drowned_knight: {
    id: 'drowned_knight',
    name: 'Drowned Knight',
    role: 'minion',
    baseStats: { hp: 14, attack: 4, defense: 3, speed: 3, mind: 0, crit: 5, dodge: 5 },
    tags: ['humanoid'],
    abilities: ['bone_slash', 'bone_throw'],
    aiPriority: ['bone_slash', 'bone_throw'],
    preferredSlots: [1, 2],
  },
  brine_crab: {
    id: 'brine_crab',
    name: 'Brine Crab',
    role: 'minion',
    baseStats: { hp: 18, attack: 3, defense: 4, speed: 2, mind: 0, crit: 5, dodge: 0 },
    tags: ['beast'],
    abilities: ['rotting_bite', 'lurch'],
    aiPriority: ['rotting_bite', 'lurch'],
    preferredSlots: [1, 2],
  },
  drowned_sailor: {
    id: 'drowned_sailor',
    name: 'Drowned Sailor',
    role: 'minion',
    baseStats: { hp: 11, attack: 5, defense: 1, speed: 4, mind: 0, crit: 5, dodge: 5 },
    tags: ['humanoid'],
    abilities: ['bone_arrow'],
    aiPriority: ['bone_arrow'],
    preferredSlots: [3, 4],
  },
  siren: {
    id: 'siren',
    name: 'Siren',
    role: 'minion',
    baseStats: { hp: 12, attack: 3, defense: 1, speed: 4, mind: 4, crit: 5, dodge: 10 },
    tags: ['humanoid'],
    abilities: ['drowning_lure', 'dark_bolt'],
    aiPriority: ['drowning_lure', 'dark_bolt'],
    preferredSlots: [3, 4],
  },
  drowned_king: {
    id: 'drowned_king',
    name: 'The Drowned King',
    role: 'boss',
    baseStats: { hp: 50, attack: 6, defense: 4, speed: 2, mind: 0, crit: 10, dodge: 0 },
    tags: ['humanoid'],
    abilities: ['drowning_embrace', 'tidal_smash', 'crushing_wave'],
    aiPriority: ['drowning_embrace', 'crushing_wave', 'tidal_smash'],
    preferredSlots: [1, 2],
  },
```

Add the pool exports at the end of the file (after the `CRYPT_*` exports):

```typescript
export const SUNKEN_KEEP_POOL: readonly EnemyId[] = [
  'drowned_knight',
  'brine_crab',
  'drowned_sailor',
  'siren',
];

export const SUNKEN_KEEP_BOSS: EnemyId = 'drowned_king';
```

- [ ] **Step 4: Run enemies tests — expect pass**

```
npx vitest run src/data/__tests__/enemies.test.ts
```

Expected: all pass.

- [ ] **Step 5: SKIP — DO NOT COMMIT.**

---

### Task 4: Sunken Keep dungeon entry

**Files:**
- Modify: `src/data/dungeons.ts`
- Modify: `src/data/__tests__/dungeons.test.ts`

- [ ] **Step 1: Update the test FIRST**

Append to `src/data/__tests__/dungeons.test.ts`:

```typescript
describe('DUNGEONS.sunken_keep', () => {
  it('is registered with tier 2', () => {
    expect(DUNGEONS.sunken_keep).toBeDefined();
    expect(DUNGEONS.sunken_keep.id).toBe('sunken_keep');
    expect(DUNGEONS.sunken_keep.tier).toBe(2);
  });

  it('has 3 floors with rowsPerFloor 10', () => {
    expect(DUNGEONS.sunken_keep.floorsPerRun).toBe(3);
    expect(DUNGEONS.sunken_keep.rowsPerFloor).toBe(10);
  });

  it('has the expected unlock requirement string', () => {
    expect(DUNGEONS.sunken_keep.unlockRequirement).toBe('Defeat the Bone Lich');
  });

  it('enemyPool references registered enemies', () => {
    for (const id of DUNGEONS.sunken_keep.enemyPool) {
      expect(ENEMIES[id], `pool references missing enemy ${id}`).toBeDefined();
    }
  });

  it('bossId is a registered boss', () => {
    const bossId = DUNGEONS.sunken_keep.bossId;
    expect(ENEMIES[bossId]).toBeDefined();
    expect(ENEMIES[bossId].role).toBe('boss');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```
npx vitest run src/data/__tests__/dungeons.test.ts
```

Expected: `DUNGEONS.sunken_keep` is undefined.

- [ ] **Step 3: Update `src/data/dungeons.ts`**

Replace the file body with:

```typescript
import { CRYPT_BOSS, CRYPT_POOL, SUNKEN_KEEP_BOSS, SUNKEN_KEEP_POOL } from './enemies';
import type { DungeonDef, DungeonId } from './types';

export const DUNGEONS: Record<DungeonId, DungeonDef> = {
  crypt: {
    id: 'crypt',
    name: 'The Crypt',
    theme: 'Undead ruins',
    tier: 1,
    floorsPerRun: 3,
    enemyPool: CRYPT_POOL,
    bossId: CRYPT_BOSS,
  },
  sunken_keep: {
    id: 'sunken_keep',
    name: 'The Sunken Keep',
    theme: 'Flooded castle',
    tier: 2,
    floorsPerRun: 3,
    rowsPerFloor: 10,
    enemyPool: SUNKEN_KEEP_POOL,
    bossId: SUNKEN_KEEP_BOSS,
    unlockRequirement: 'Defeat the Bone Lich',
  },
};
```

- [ ] **Step 4: Run dungeons tests — expect pass**

```
npx vitest run src/data/__tests__/dungeons.test.ts
```

Expected: all pass (existing Crypt tests + new Sunken Keep tests).

- [ ] **Step 5: Run typecheck**

```
npx tsc --noEmit
```

Expected: still some errors (sprite mappings + tier multipliers + milestone handler missing). That's fine — will resolve in subsequent tasks.

- [ ] **Step 6: SKIP — DO NOT COMMIT.**

---

### Task 5: Sprite mappings (placeholders)

**Files:**
- Modify: `src/render/enemy_sprites.ts`

The `ENEMY_VISUALS: Record<EnemyId, EnemyVisual>` requires entries for every `EnemyId`. After Task 1 added 5 new ids, the typecheck will fail until this task adds them. Visuals are placeholders reusing existing frames per Q7.

- [ ] **Step 1: Add the 5 entries to `src/data/render/enemy_sprites.ts`**

Append inside the `ENEMY_VISUALS` object literal (before the closing `};`):

```typescript
  drowned_knight: {
    bodyFrame: ENEMY_BODY.skeleton,
    weapon: SPRITE_NAMES.weapon.sword_tier2,
    shield: SPRITE_NAMES.shield.wood_buckler_tier1,
  },
  brine_crab: {
    bodyFrame: ENEMY_BODY.zombie,
    legs: SPRITE_NAMES.legs.black,
    feet: SPRITE_NAMES.feet.black,
  },
  drowned_sailor: {
    bodyFrame: ENEMY_BODY.skeleton,
    weapon: SPRITE_NAMES.weapon.bow_wood_tier1,
  },
  siren: {
    bodyFrame: ENEMY_BODY.cultist,
    legs: SPRITE_NAMES.legs.black,
    feet: SPRITE_NAMES.feet.black,
    outfit: SPRITE_NAMES.torso.shirt_black_long,
    hat: SPRITE_NAMES.head.wizardhat_4,
    weapon: SPRITE_NAMES.weapon.staff_green_tier2,
  },
  drowned_king: {
    bossSprite: 0,  // PLACEHOLDER — reuses Bone Lich's frame; Cluster C follow-up paints bespoke 32x32
    bodyScale: 2,
  },
```

(File path is `src/render/enemy_sprites.ts` — confirm by Read at impl-time. The existing `bone_lich` entry follows the `bossSprite + bodyScale` pattern; mirror it for `drowned_king`.)

- [ ] **Step 2: Run typecheck**

```
npx tsc --noEmit
```

Expected: 5 EnemyVisual cascade errors should now be resolved. Remaining errors will be from tier-multiplier and milestone tasks.

- [ ] **Step 3: SKIP — DO NOT COMMIT.**

---

### Task 6: Tier-2 balance numbers (slope, gold, rarity)

**Files:**
- Modify: `src/dungeon/scaling.ts`
- Modify: `src/dungeon/__tests__/scaling.test.ts`
- Modify: `src/dungeon/loot.ts`
- Modify: `src/dungeon/__tests__/loot.test.ts`

- [ ] **Step 1: Update scaling tests FIRST**

In `src/dungeon/__tests__/scaling.test.ts`, find the spec-1 test that asserts `goldMultiplier(2) === 1` (the placeholder baseline). Replace with the real expected value:

```typescript
describe('goldMultiplier', () => {
  it('tier 1 returns 1 (identity)', () => {
    expect(goldMultiplier(1)).toBe(1);
  });

  it('tier 2 returns 1.5 (Sunken Keep)', () => {
    expect(goldMultiplier(2)).toBe(1.5);
  });

  it('tier 3-4 return 1 in spec 2 baseline (placeholder)', () => {
    expect(goldMultiplier(3)).toBe(1);
    expect(goldMultiplier(4)).toBe(1);
  });
});
```

Add tier-2 floorScale assertion:

```typescript
describe('floorScale tier 2', () => {
  it('floor 1 tier 2 is still 1.0× (slope baseline)', () => {
    expect(floorScale(1, 2).hp).toBeCloseTo(1.0);
  });

  it('floor 12 tier 2 is ~2.43× (slope 0.13 × 11 + 1)', () => {
    const s = floorScale(12, 2);
    expect(s.hp).toBeCloseTo(2.43);
    expect(s.attack).toBeCloseTo(2.43);
  });

  it('tier 2 differs from tier 1 at floor > 1', () => {
    expect(floorScale(5, 2).hp).toBeGreaterThan(floorScale(5, 1).hp);
  });
});
```

- [ ] **Step 2: Run scaling tests — expect failure**

```
npx vitest run src/dungeon/__tests__/scaling.test.ts
```

Expected: `goldMultiplier(2)` returns 1 (not 1.5); `floorScale(12, 2).hp` is 2.10 (not 2.43).

- [ ] **Step 3: Update `src/dungeon/scaling.ts`**

Update the two tier-2 entries:

```typescript
const TIER_SCALING_SLOPE: Record<DungeonTier, number> = {
  1: 0.10,
  2: 0.13,   // Sunken Keep — was 0.10 placeholder
  3: 0.10,
  4: 0.10,
};

const TIER_GOLD_MULTIPLIER: Record<DungeonTier, number> = {
  1: 1,
  2: 1.5,    // Sunken Keep — was 1 placeholder
  3: 1,
  4: 1,
};
```

- [ ] **Step 4: Run scaling tests — expect pass**

```
npx vitest run src/dungeon/__tests__/scaling.test.ts
```

Expected: all pass.

- [ ] **Step 5: Update loot tests**

`pickRarity` is internal (not exported), so test the tier-2 rarity offset through `rollLoot` (boss kind always drops, eliminating the 10% combat-drop gate variance):

In `src/dungeon/__tests__/loot.test.ts`, append:

```typescript
describe('rollLoot — tier 2 rarity offset', () => {
  it('tier 2 boss drops roll rare more often than tier 1 boss drops at floor 1', () => {
    // Tier 1 floor-1 boss: effectiveFloor = 1 + 1 = 2 → rare ≈ 1% (lerp row1 rare:0, row3 rare:2 at t=0.5).
    // Tier 2 floor-1 boss: effectiveFloor = (1 + 1) + 3 = 5 → rare = 5% per RARITY_TABLE row {floor:5, rare:5}.
    // Expect tier 2 to roll significantly more rares.
    let tier1Rare = 0;
    let tier2Rare = 0;
    const N = 1000;
    for (let seed = 1; seed <= N; seed++) {
      const r1 = rollLoot(createRng(seed), 1, 'boss', 1);
      const r2 = rollLoot(createRng(seed), 1, 'boss', 2);
      if (r1?.rarity === 'rare') tier1Rare++;
      if (r2?.rarity === 'rare') tier2Rare++;
    }
    expect(tier2Rare).toBeGreaterThan(tier1Rare * 2);
    expect(tier2Rare).toBeGreaterThanOrEqual(25);   // ≥2.5%, safely below the ~5% expected
    expect(tier2Rare).toBeLessThanOrEqual(100);     // ≤10%, safely above
  });
});
```

- [ ] **Step 6: Run loot tests — expect failure**

```
npx vitest run src/dungeon/__tests__/loot.test.ts
```

Expected: tier-2 rarity test fails because `TIER_RARITY_FLOOR_BONUS[2] === 0`.

- [ ] **Step 7: Update `src/dungeon/loot.ts`**

Update the tier-2 entry:

```typescript
const TIER_RARITY_FLOOR_BONUS: Record<DungeonTier, number> = {
  1: 0,
  2: 3,      // Sunken Keep — was 0 placeholder
  3: 0,
  4: 0,
};
```

- [ ] **Step 8: Run loot tests — expect pass**

```
npx vitest run src/dungeon/__tests__/loot.test.ts
```

Expected: all pass.

- [ ] **Step 9: SKIP — DO NOT COMMIT.**

---

### Task 7: Milestone handler — register `first_crypt_clear`, update `detectBossMilestones`, simplify cast

**Files:**
- Modify: `src/run/milestones.ts`
- Modify: `src/run/__tests__/milestones.test.ts`

- [ ] **Step 1: Update milestones tests FIRST**

Replace the entire body of `src/run/__tests__/milestones.test.ts` with:

```typescript
import { describe, expect, it } from 'vitest';
import { applyPendingMilestones, detectBossMilestones, MILESTONES } from '../milestones';
import type { SaveFile } from '@save/save';
import type { Unlocks } from '@data/types';

function makeFakeSave(unlocks: Unlocks): SaveFile {
  return { unlocks } as unknown as SaveFile;
}

describe('milestones — registry', () => {
  it('registers first_crypt_clear', () => {
    expect(MILESTONES.first_crypt_clear).toBeDefined();
    expect(typeof MILESTONES.first_crypt_clear).toBe('function');
  });

  it('has only the spec-2 entries (no stray)', () => {
    expect(Object.keys(MILESTONES).sort()).toEqual(['first_crypt_clear']);
  });
});

describe('detectBossMilestones', () => {
  it('returns [first_crypt_clear] for crypt floor 3 (canonical-final)', () => {
    expect(detectBossMilestones('crypt', 3)).toEqual(['first_crypt_clear']);
  });

  it('returns [] for crypt floor 1 (non-canonical)', () => {
    expect(detectBossMilestones('crypt', 1)).toEqual([]);
  });

  it('returns [] for crypt floor 4+ (post-canonical)', () => {
    expect(detectBossMilestones('crypt', 4)).toEqual([]);
    expect(detectBossMilestones('crypt', 10)).toEqual([]);
  });

  it('returns [] for sunken_keep clears (no spec-2 handler for that)', () => {
    expect(detectBossMilestones('sunken_keep', 3)).toEqual([]);
  });
});

describe('first_crypt_clear handler', () => {
  it('appends sunken_keep to unlocks.dungeons on a fresh state', () => {
    const before = makeFakeSave({ classes: [], dungeons: ['crypt'] });
    const after = MILESTONES.first_crypt_clear(before);
    expect(after.unlocks.dungeons).toContain('sunken_keep');
    expect(after.unlocks.dungeons).toContain('crypt');  // preserves existing
  });

  it('is idempotent — second application does not duplicate', () => {
    const before = makeFakeSave({ classes: [], dungeons: ['crypt', 'sunken_keep'] });
    const after = MILESTONES.first_crypt_clear(before);
    expect(after).toBe(before);  // identity return on already-unlocked
  });

  it('preserves classes unchanged', () => {
    const before = makeFakeSave({
      classes: ['knight', 'archer', 'priest'],
      dungeons: ['crypt'],
    });
    const after = MILESTONES.first_crypt_clear(before);
    expect(after.unlocks.classes).toEqual(['knight', 'archer', 'priest']);
  });
});

describe('applyPendingMilestones', () => {
  it('returns input unchanged for empty id list', () => {
    const state = makeFakeSave({ classes: [], dungeons: ['crypt'] });
    expect(applyPendingMilestones(state, [])).toBe(state);
  });

  it('runs the first_crypt_clear handler when id is in list', () => {
    const before = makeFakeSave({ classes: [], dungeons: ['crypt'] });
    const after = applyPendingMilestones(before, ['first_crypt_clear']);
    expect(after.unlocks.dungeons).toContain('sunken_keep');
  });
});
```

- [ ] **Step 2: Run milestones tests — expect failure**

```
npx vitest run src/run/__tests__/milestones.test.ts
```

Expected: `MILESTONES.first_crypt_clear` is undefined; `detectBossMilestones` returns `[]` for floor 3 (spec-1 baseline).

- [ ] **Step 3: Update `src/run/milestones.ts`**

Replace the file body with:

```typescript
import { DUNGEONS } from '@data/dungeons';
import type { DungeonId, MilestoneId } from '@data/types';
import type { SaveFile } from '@save/save';

export type MilestoneHandler = (state: SaveFile) => SaveFile;

/**
 * Spec 2 introduces 'first_crypt_clear'. Future class/dungeon specs extend
 * this registry — e.g., the Paladin spec extends the first_crypt_clear handler
 * to also append 'paladin' to state.unlocks.classes.
 *
 * Handlers are responsible for their own idempotency.
 */
export const MILESTONES: Record<MilestoneId, MilestoneHandler> = {
  first_crypt_clear: (state) => {
    if (state.unlocks.dungeons.includes('sunken_keep')) return state;
    return {
      ...state,
      unlocks: {
        ...state.unlocks,
        dungeons: [...state.unlocks.dungeons, 'sunken_keep'],
      },
    };
  },
};

/**
 * Returns the milestone ids triggered by this boss defeat.
 * Called from completeCombat when:
 *   - the defeated encounter's kind is 'boss'
 *   - AND floorNumber === DUNGEONS[dungeonId].floorsPerRun (canonical final boss only)
 */
export function detectBossMilestones(
  dungeonId: DungeonId,
  floorNumber: number,
): readonly MilestoneId[] {
  if (dungeonId === 'crypt' && floorNumber === DUNGEONS.crypt.floorsPerRun) {
    return ['first_crypt_clear'];
  }
  return [];
}

/**
 * Drains pendingMilestones into SaveFile by running each registered handler.
 */
export function applyPendingMilestones(
  state: SaveFile,
  ids: readonly MilestoneId[],
): SaveFile {
  let next = state;
  for (const id of ids) {
    const handler = MILESTONES[id];
    if (handler) next = handler(next);
  }
  return next;
}
```

(Note: the `applyPendingMilestones` cast from spec 1 — `(MILESTONES as Record<string, MilestoneHandler | undefined>)[id as string]` — is replaced with direct `MILESTONES[id]` indexing. With `MilestoneId = 'first_crypt_clear'`, TypeScript can now type-check this cleanly.)

- [ ] **Step 4: Run milestones tests — expect pass**

```
npx vitest run src/run/__tests__/milestones.test.ts
```

Expected: all 12+ new/replaced tests pass.

- [ ] **Step 5: Run full typecheck**

```
npx tsc --noEmit
```

Expected: clean. All cascade errors from Task 1 should now be resolved.

- [ ] **Step 6: Run full test suite**

```
npm test
```

Expected: most tests pass, but at least one will fail — the `run_state.test.ts` test from spec 1 that asserts `pendingMilestones === []` after canonical Crypt boss defeat now fails because the handler is registered. That's expected — Task 8 fixes it.

- [ ] **Step 7: SKIP — DO NOT COMMIT.**

---

### Task 8: Update spec-1 `run_state` tests + add end-to-end integration test

**Files:**
- Modify: `src/run/__tests__/run_state.test.ts`

The spec-1 test "canonical-final-boss defeat exercises the detectBossMilestones path (returns [] in spec 1)" now expects a non-empty result. This task updates that test and adds an end-to-end test verifying the full Crypt-clear-→-Sunken-Keep-unlocked flow.

- [ ] **Step 1: Find and update the existing spec-1 test**

In `src/run/__tests__/run_state.test.ts`, find the test:

```typescript
it('canonical-final-boss defeat exercises the detectBossMilestones path (returns [] in spec 1)', ...)
```

Replace the assertion at the end:

```typescript
expect(after.pendingMilestones).toEqual([]);  // spec 1 baseline; spec 2 will assert non-empty
```

with:

```typescript
expect(after.pendingMilestones).toEqual(['first_crypt_clear']);  // spec 2: real handler
```

Also update the test name to reflect the new state:

```typescript
it('canonical-final-boss defeat populates pendingMilestones with first_crypt_clear', ...)
```

- [ ] **Step 2: Update the cashout drain test similarly**

Find the cashout drain test:

```typescript
it('returns outcome.milestonesTriggered and zeros runState.pendingMilestones', ...)
```

The body should already work (it asserts `outcome.milestonesTriggered === rs.pendingMilestones`). After spec 2, both sides equal `['first_crypt_clear']`, which is now a meaningful drain assertion. No body change needed — but verify the test passes by running it.

- [ ] **Step 3: Add an end-to-end integration test**

Append to the file:

```typescript
import { applyPendingMilestones } from '../milestones';

describe('end-to-end — Crypt clear unlocks Sunken Keep', () => {
  it('full canonical Crypt run: cashout SaveFile gets sunken_keep unlocked', () => {
    // Walk a Crypt run to floor 3, defeat the boss, cash out, apply milestones.
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    while (rs.currentFloorNumber < DUNGEONS.crypt.floorsPerRun) {
      rs = advanceToBossNode(rs);
      rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
      rs = pressOn(rs, createRng(99));
    }
    rs = advanceToBossNode(rs);
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.status).toBe('camp_screen');
    expect(rs.pendingMilestones).toEqual(['first_crypt_clear']);

    // Cashout
    const { runState: ended, outcome } = cashout(rs);
    expect(outcome.milestonesTriggered).toEqual(['first_crypt_clear']);
    expect(ended.pendingMilestones).toEqual([]);

    // Apply to a SaveFile fixture (only the unlocks slice matters here)
    const before = { unlocks: { classes: [], dungeons: ['crypt'] } } as unknown as SaveFile;
    const after = applyPendingMilestones(before, outcome.milestonesTriggered);
    expect(after.unlocks.dungeons).toContain('sunken_keep');
  });
});
```

(Add `import type { SaveFile } from '@save/save';` if not already present.)

- [ ] **Step 4: Run run_state tests — expect pass**

```
npx vitest run src/run/__tests__/run_state.test.ts
```

Expected: all pass (including the renamed canonical-final-boss test, the cashout drain test, and the new integration test).

- [ ] **Step 5: Run full suite**

```
npm test
```

Expected: all tests pass. Test count now ~1570-1580 (1543 baseline + ~25-30 new spec-2 tests, minus the 3-ish tests replaced).

- [ ] **Step 6: SKIP — DO NOT COMMIT.**

---

### Task 9: Sunken Keep floor-generation smoke test

This adds an integration test that the multi-dungeon foundation actually composes a Sunken Keep floor end-to-end (no missing sprites, no missing abilities, no quota-feasibility regression).

**Files:**
- Modify: `src/dungeon/__tests__/floor.test.ts`

- [ ] **Step 1: Add the test**

Append to `src/dungeon/__tests__/floor.test.ts`:

```typescript
describe('generateFloor — Sunken Keep', () => {
  it('floor 1 Sunken Keep produces 10 rows', () => {
    const { nodes } = generateFloor('sunken_keep', 1, createRng(1));
    const rows = new Set(nodes.map(n => n.id.match(/-r(\d+)-/)?.[1])).size;
    expect(rows).toBe(10);
  });

  it('floor 3 Sunken Keep produces 12 rows', () => {
    const { nodes } = generateFloor('sunken_keep', 3, createRng(1));
    const rows = new Set(nodes.map(n => n.id.match(/-r(\d+)-/)?.[1])).size;
    expect(rows).toBe(12);
  });

  it('Sunken Keep encounters reference Sunken Keep enemies', () => {
    const { nodes } = generateFloor('sunken_keep', 1, createRng(1));
    const combatNodes = nodes.filter(n => n.type === 'combat');
    expect(combatNodes.length).toBeGreaterThan(0);
    for (const node of combatNodes) {
      if (node.type === 'combat') {
        for (const enemy of node.encounter.enemies) {
          expect(['drowned_knight', 'brine_crab', 'drowned_sailor', 'siren']).toContain(enemy.enemyId);
        }
      }
    }
  });

  it('Sunken Keep boss is the Drowned King', () => {
    const { nodes } = generateFloor('sunken_keep', 1, createRng(1));
    const bossNode = nodes.find(n => n.type === 'boss');
    expect(bossNode).toBeDefined();
    if (bossNode && bossNode.type === 'boss') {
      // Boss encounters include the boss + minions; the boss should be drowned_king.
      const hasKing = bossNode.encounter.enemies.some(e => e.enemyId === 'drowned_king');
      expect(hasKing).toBe(true);
    }
  });

  it('quota generator succeeds across many seeds (no infeasibility)', () => {
    let failures = 0;
    for (let seed = 1; seed <= 100; seed++) {
      try {
        for (let f = 1; f <= 3; f++) {
          generateFloor('sunken_keep', f, createRng(seed * 1000 + f));
        }
      } catch {
        failures++;
      }
    }
    expect(failures).toBe(0);
  });
});
```

(`enemy.enemyId` may be a different field name — check the actual `EncounterEnemy` shape at impl time. The shape comes from `composeCombatEncounter` / `composeBossEncounter`.)

- [ ] **Step 2: Run floor tests — expect pass**

```
npx vitest run src/dungeon/__tests__/floor.test.ts
```

Expected: all pass. The quota-feasibility test is the most important — it confirms 10/11/12-row floors with the existing quota system (1 shop + 1 camp + 1-2 treasure + 1-2 event + 1-2 elite + filler combat) generate cleanly.

- [ ] **Step 3: SKIP — DO NOT COMMIT.**

---

### Task 10: Final regression sweep + HISTORY/TODO migration

**Files:** `HISTORY.md`, `TODO.md`

- [ ] **Step 1: Run the full test suite one final time**

```
npm test
```

Expected: all tests pass. Final count ~1570-1580.

- [ ] **Step 2: Run typecheck**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Append spec-2 HISTORY entry**

Open `HISTORY.md` and add immediately below the existing `<!-- Add completed entries below this line. Newest at the top. -->` line:

```markdown
### 2026-05-06 · Sunken Keep — Spec 2 (content + first-Crypt-clear handler) (Cluster D · 1)

- **Why:** Spec 1 (2026-05-05) plumbed the dungeon-tier balance API, milestone registry, multi-dungeon Expeditions UI, and locked-card rendering. Spec 2 drops the Sunken Keep into that foundation as additive content. After this lands, defeating the Crypt floor-3 boss unlocks the Sunken Keep dungeon.
- **Decisions** (Q1–Q7 + sub-questions in spec):
  - Paladin out of scope — separate future spec, extends the same `first_crypt_clear` handler.
  - Hybrid abilities — boss gets 3 bespoke abilities + new `drowning` status; minions reuse the Crypt pool with one new minion ability (`drowning_lure` on the Siren).
  - Floor density: `floorsPerRun: 3, rowsPerFloor: 10` → 10/11/12 rows. Same run length as Crypt; ~22% more nodes per floor.
  - Tier-2 multipliers: slope `0.13`, rarity floor-bonus `+3`, gold multiplier `×1.5`.
  - Boss is the Drowned King (front-line bruiser) — mechanical foil to Bone Lich (back-line caster). Drowning Embrace pulls a back-line hero forward + applies `drowning` DoT (cooldown 3).
  - Boss `tags: ['humanoid']` (not `'undead'`) — Priest's Smite anti-undead doesn't auto-trivialize tier-2.
  - Art: placeholders reusing existing frames per Cluster C precedent. Drowned King reuses Bone Lich's `bossSprite: 0` until bespoke art lands.
  - Milestone handler is idempotent (checks `unlocks.dungeons.includes('sunken_keep')` before appending).
  - `applyPendingMilestones` cast simplified — `MilestoneId` is now a real string union, so `MILESTONES[id]()` typechecks cleanly without the spec-1 workaround.
- **Surprises:**
  - `EXPECTED_IDS` arrays in `enemies.test.ts` and `abilities.test.ts` use `.toEqual` against an exact list — so adding new enemies/abilities requires updating the fixture in lockstep, not just appending data.
  - The Brine Crab uses `rotting_bite` (existing Crypt ability) — thematically odd ("rotting" on a crab) but accepted in Q6; visual flavor abstracts it.
  - Drowned Knight ≡ skeleton_warrior visually under placeholder mapping (same body + sword). Acceptable since they appear in different dungeons; flagged in Cluster C entry.
- **Source:** spec `docs/superpowers/specs/2026-05-06-sunken-keep-content-design.md`; plan `docs/superpowers/plans/2026-05-06-sunken-keep-content.md`. Test count delta: 1543 → ~1570-1580 (verify exact at impl time).
```

- [ ] **Step 4: Migrate TODO Cluster D · 1**

Open `TODO.md`. Find Cluster D · 1 (Sunken Keep — Spec 2) and DELETE the entire entry — its content has been migrated to HISTORY by Step 3.

(Do NOT renumber other entries; per saved memory feedback, gaps in cluster numbering are fine.)

- [ ] **Step 5: Add new Cluster C entries for bespoke art**

In `TODO.md`, find the Cluster C section. Append two new entries:

```markdown
### 3 · Bespoke art for the Drowned King boss (high priority)

- **What:** Replace the placeholder `bossSprite: 0` (which reuses Bone Lich's frame) in `ENEMY_VISUALS.drowned_king` with a bespoke 32×32 sprite. Drowned-knight in armor with a crown silhouette per gdd §4 / spec-2 design.
- **Why:** Marquee art moment for tier 2. Until this ships, the Drowned King visually mirrors Bone Lich, undermining the "different boss, different fight" promise of spec 2.
- **Tier:** 3 (originally) — non-blocking now that placeholders work, but high priority within Cluster C.
- **Acceptance:**
  - New 32×32 frame added to `BOSS_SHEET`.
  - `ENEMY_VISUALS.drowned_king.bossSprite` updated to point at the new frame.
  - Optionally: keep `bodyScale: 2` for the same visual size as Bone Lich.
- **Touches:** `public/assets/sprites/boss_sprites.png`, `spritenames.txt` (if BOSS_SHEET frames are named), `src/render/enemy_sprites.ts`.

### 4 · Bespoke art for Sunken Keep minion bodies (lower priority)

- **What:** Replace placeholder `ENEMY_BODY` reuse in `ENEMY_VISUALS` for `drowned_knight`, `brine_crab`, `drowned_sailor`, `siren` with bespoke 16×16 sprites.
- **Why:** Sunken Keep currently shares enemy silhouettes with Crypt enemies (skeleton/zombie/cultist palettes). Bespoke art makes the dungeon visually distinct.
- **Tier:** 3 (originally) — non-blocking; placeholders work.
- **Acceptance:**
  - New `ENEMY_BODY` constants added (`drowned_knight`, `brine_crab`, `drowned_sailor`, `siren`) with new 16×16 frames in the enemy sheet.
  - `ENEMY_VISUALS` mappings updated to point at the new bodies.
  - Brine Crab in particular benefits from a non-humanoid silhouette (it's tagged `'beast'` but currently uses zombie body).
- **Touches:** `public/assets/sprites/enemy_sprites.png`, `src/render/enemy_sprites.ts`.
```

- [ ] **Step 6: Run full test suite one more time**

```
npm test
```

Expected: still all passing.

- [ ] **Step 7: SKIP — DO NOT COMMIT.** Hand off the dirty working tree to the user for review and manual commit.

---

## Done

- All 5 new enemies, 4 new abilities, 1 new dungeon, 1 new status, 1 new milestone handler land additively.
- Tier-2 multipliers concrete: slope `0.13`, rarity `+3`, gold `×1.5`.
- Crypt continues to play identically to today (tier 1 unchanged; multiplier additions don't affect tier=1 callers).
- Defeating Crypt floor-3 boss → cashout → Sunken Keep card unlocks.
- Test count: ~1570-1580 (verify exact at impl time).
- Two new Cluster C TODO entries filed for bespoke art.
- Spec-2 HISTORY entry captures decisions + surprises + source pointers.
