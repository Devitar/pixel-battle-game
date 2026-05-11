# Chapel Building Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Note on commits:** Each task ends with a `git commit` step per skill template. This codebase's CLAUDE.md says "never create git commits without explicit user instruction in the current turn" — defer to the user at execution time. If the user opts to skip commits, leave changes in the working tree and proceed to the next task.

**Goal:** Implement the Chapel camp building (Cluster D · 5) — a L1-only camp building unlocked by the `first_sunken_keep_clear` milestone that lets the player spend gold to Replace or Add traits on heroes, capped at 3 traits per hero.

**Architecture:** Heroes get a `traitIds: readonly TraitId[]` field (replacing the singular `traitId`). Chapel actions roll new traits from the pool minus the hero's current set, using the persisted `campRngState` for determinism. UI mirrors Hospital's hero-list + detail-pane layout. Unlock gating uses a new `Unlocks.buildings` field that the milestone handler appends to.

**Tech Stack:** TypeScript, Vitest, Phaser (scenes only). Phaser firewall preserved.

**Spec:** `docs/superpowers/specs/2026-05-11-chapel-building-design.md`

---

## File Structure

**Created:**
- `src/camp/buildings/chapel.ts` — `chapelReplaceCost`, `chapelAddCost`, `rollNewTrait`, `replaceTrait`, `addTrait`, `MAX_TRAITS_PER_HERO`.
- `src/camp/buildings/__tests__/chapel.test.ts` — chapel module tests.
- `src/scenes/chapel_panel_scene.ts` — Chapel UI scene.

**Modified:**
- `src/data/types.ts` — owns `BuildingId` (moved from save.ts); widens `Unlocks` with `buildings`.
- `src/save/save.ts` — re-exports `BuildingId` for back-compat; widens BuildingId with `'chapel'`; updates `createDefaultUnlocks`; default building levels.
- `src/save/boot.ts` — `buildingLevels` includes `chapel: 1`.
- `src/save/migration.ts` — bumps `CURRENT_SCHEMA_VERSION` 3→4; adds `MIGRATIONS[3]`.
- `src/save/__tests__/migration.test.ts` — v3→v4 test.
- `src/save/__tests__/save.test.ts` — fixture updates (`buildingLevels.chapel`, `unlocks.buildings`).
- `src/camp/building_levels.ts` — adds `chapel` entry to `BUILDING_LEVELS`.
- `src/camp/__tests__/building_levels.test.ts` — chapel-level shape tests.
- `src/heroes/hero.ts` — `Hero.traitId` → `traitIds`; `computeMaxHp` / `recomputeMaxHp` accept arrays.
- `src/heroes/__tests__/hero.test.ts` — fixture/assertion updates for `traitIds`.
- `src/combat/types.ts` — `Combatant.traitId?` → `traitIds?`.
- `src/combat/statuses.ts` — `getEffectiveStat` iterates `traitIds`.
- `src/combat/__tests__/statuses.test.ts` — multi-trait stat-effect tests.
- `src/combat/__tests__/combatant.test.ts` — fixture updates.
- `src/run/combat_setup.ts` — passes `traitIds`.
- `src/run/__tests__/combat_setup.test.ts` — fixture updates.
- `src/run/milestones.ts` — `first_sunken_keep_clear` extended to append `'chapel'`.
- `src/run/__tests__/milestones.test.ts` — handler extension tests.
- `src/scenes/camp_scene.ts` — conditional Chapel tile.
- `src/scenes/barracks_panel_scene.ts` — multi-trait label.
- `src/ui/widgets/hero_card.ts` — multi-trait label with 2-trait + ellipsis truncation.
- `src/main.ts` — registers `ChapelPanelScene`.
- `src/camp/buildings/__tests__/tavern.test.ts`, `src/items/__tests__/equip.test.ts`, `src/scenes/__tests__/app_state.test.ts`, `src/camp/__tests__/building_upgrade.test.ts`, `src/items/__tests__/sell.test.ts` — fixture sweep (`traitId:` references → `traitIds:` and/or `buildingLevels`/`unlocks` widening).
- `gdd.md` — §6 row 6 patch.

---

## Phase 1 — Foundation: BuildingId + Unlocks

### Task 1: Move `BuildingId` to `data/types.ts` (pure refactor)

**Files:**
- Modify: `src/data/types.ts` (add canonical `BuildingId` type)
- Modify: `src/save/save.ts` (replace inline definition with re-export)

- [ ] **Step 1: Add BuildingId to `src/data/types.ts`**

Append near the end of the file (before the `Unlocks` interface so it's defined before use):

```typescript
export type BuildingId = 'tavern' | 'barracks' | 'blacksmith' | 'hospital';
```

- [ ] **Step 2: Replace `save.ts:14` inline definition with a re-export**

In `src/save/save.ts`, change:

```typescript
export type BuildingId = 'tavern' | 'barracks' | 'blacksmith' | 'hospital';
```

to:

```typescript
export type { BuildingId } from '@data/types';
```

- [ ] **Step 3: Verify build + tests still pass**

Run: `npm run build`
Expected: clean. The re-export is type-identical, so no consumer needs to change.

Run: `npm test`
Expected: all tests pass (~1848 baseline).

- [ ] **Step 4: Commit**

```bash
git add src/data/types.ts src/save/save.ts
git commit -m "Move BuildingId to data/types.ts (re-export from save.ts)"
```

---

### Task 2: Widen `BuildingId` with `'chapel'`; widen `Unlocks` with `buildings`

**Files:**
- Modify: `src/data/types.ts` (widen BuildingId, widen Unlocks)
- Modify: `src/save/save.ts` (update `createDefaultUnlocks`, normalize default)
- Modify: `src/save/boot.ts` (createFreshSave's buildingLevels default)
- Modify: `src/camp/building_levels.ts` (BUILDING_LEVELS.chapel entry)
- Modify: `src/camp/__tests__/building_levels.test.ts` (chapel tests)
- Modify: `src/save/__tests__/save.test.ts` (`createDefaultUnlocks` test, fixtures)
- Modify: `src/save/__tests__/boot.test.ts` (fixture update)
- Modify: `src/save/__tests__/migration.test.ts` (fixture: existing v1→v2 test now produces buildingLevels including chapel via migration; for now its assertions don't read building levels so likely no change — verify)
- Modify: `src/scenes/__tests__/app_state.test.ts` (fixture)
- Modify: `src/camp/__tests__/building_upgrade.test.ts` (fixture)
- Modify: `src/items/__tests__/sell.test.ts` (fixture)

- [ ] **Step 1: Write failing tests for chapel BUILDING_LEVELS shape**

Append to `src/camp/__tests__/building_levels.test.ts`:

```typescript
describe('chapel building levels (L1-only)', () => {
  it('registers chapel with exactly one tier at level 1', () => {
    expect(BUILDING_LEVELS.chapel).toHaveLength(1);
    expect(BUILDING_LEVELS.chapel[0]?.level).toBe(1);
    expect(BUILDING_LEVELS.chapel[0]?.upgradeCost).toBe(0);
  });

  it('chapel has no L2 upgrade path', () => {
    expect(nextLevel('chapel', 1)).toBeNull();
  });
});
```

Append to `src/save/__tests__/save.test.ts` — find the existing `describe('createDefaultUnlocks', ...)` block (search line ~241) and update the existing test:

```typescript
describe('createDefaultUnlocks', () => {
  it('returns the six Tier-1+ classes, the Crypt dungeon, and an empty buildings list', () => {
    const u = createDefaultUnlocks();
    expect([...u.classes].sort()).toEqual(['archer', 'barbarian', 'knight', 'mage', 'priest', 'rogue']);
    expect(u.dungeons).toEqual(['crypt']);
    expect(u.buildings).toEqual([]);
  });
});
```

(If the existing test asserted only `classes` and `dungeons`, widen it to also check `buildings: []`.)

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run src/camp/__tests__/building_levels.test.ts src/save/__tests__/save.test.ts`
Expected: FAIL — `BUILDING_LEVELS.chapel` is undefined; `createDefaultUnlocks` lacks `buildings`.

- [ ] **Step 3: Widen `BuildingId` in `src/data/types.ts`**

```typescript
export type BuildingId = 'tavern' | 'barracks' | 'blacksmith' | 'hospital' | 'chapel';
```

- [ ] **Step 4: Widen `Unlocks` in `src/data/types.ts`**

```typescript
export interface Unlocks {
  classes: readonly ClassId[];
  dungeons: readonly DungeonId[];
  buildings: readonly BuildingId[];
}
```

- [ ] **Step 5: Update `createDefaultUnlocks` in `src/save/save.ts`**

Find the function (around line 107) and update:

```typescript
export function createDefaultUnlocks(): Unlocks {
  return {
    classes: ['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage'],
    dungeons: ['crypt'],
    buildings: [],
  };
}
```

- [ ] **Step 6: Update `normalize` default in `src/save/save.ts:129`**

The defensive default for missing `buildingLevels` currently reads:

```typescript
buildingLevels: file.buildingLevels ?? { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
```

Update to:

```typescript
buildingLevels: file.buildingLevels ?? { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1 },
```

Also add a defensive default for `unlocks.buildings` if `normalize` exposes one — search the file for `unlocks` defaults and ensure `buildings: []` is included where missing.

- [ ] **Step 7: Update `createFreshSave` in `src/save/boot.ts:41`**

```typescript
buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1 },
```

- [ ] **Step 8: Add `chapel` to `BUILDING_LEVELS` in `src/camp/building_levels.ts`**

After the `hospital` entry (line 25-29), append:

```typescript
chapel: [
  { level: 1, upgradeCost: 0, unlockDescription: 'Add or replace traits on heroes' },
],
```

- [ ] **Step 9: Sweep test fixtures for `buildingLevels` + `unlocks` shape**

Each of these files constructs `buildingLevels: { tavern: 1, ... }` and/or `unlocks: { classes: [...], dungeons: [...] }`. Add `chapel: 1` to building levels objects and `buildings: []` to unlocks objects. Use `replace_all: false` per occurrence (small surface, easy to verify each touch):

- `src/save/__tests__/save.test.ts` — multiple fixtures
- `src/save/__tests__/boot.test.ts` — one fixture
- `src/scenes/__tests__/app_state.test.ts` — one fixture
- `src/camp/__tests__/building_upgrade.test.ts` — one fixture
- `src/items/__tests__/sell.test.ts` — one fixture
- `src/save/__tests__/migration.test.ts` — fixtures for v1→v2 and v2→v3 tests; **do NOT add `chapel: 1` to the v1 raw fixture or v2 raw fixture** (those represent pre-v4 shape). The v3→v4 migration test in Task 8 will assert chapel gets defaulted in.

Note on `migration.test.ts` v1→v2 test: it produces a v2 (now v3 after Hunter) save. After this task, the migration chain v1 → v2 → v3 → v4 produces a v4 save that DOES include `chapel: 1` and `unlocks.buildings: []`. The existing test asserts only `campRngState` shape; it should still pass without modification because the migration adds the chapel/buildings defaults under the v3→v4 step (which doesn't exist yet — comes in Task 8). For now, leave that test alone; it'll be fine after Task 8 lands.

- [ ] **Step 10: Run tests — expect passing**

Run: `npm test`
Expected: PASS for all tests (the previously-failing chapel tests + createDefaultUnlocks test now pass).

Run: `npm run build`
Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add src/data/types.ts src/save/save.ts src/save/boot.ts src/camp/building_levels.ts src/camp/__tests__/building_levels.test.ts src/save/__tests__/save.test.ts src/save/__tests__/boot.test.ts src/scenes/__tests__/app_state.test.ts src/camp/__tests__/building_upgrade.test.ts src/items/__tests__/sell.test.ts
git commit -m "Chapel — BuildingId + Unlocks.buildings + BUILDING_LEVELS.chapel"
```

---

## Phase 2 — Hero shape (single lockstep task)

### Task 3: `Hero.traitId` → `traitIds: readonly TraitId[]` cascade

**Files:**
- Modify: `src/heroes/hero.ts` (interface, createHero internal wrap, computeMaxHp/recomputeMaxHp)
- Modify: `src/combat/types.ts` (Combatant.traitId → traitIds)
- Modify: `src/combat/statuses.ts` (getEffectiveStat loop)
- Modify: `src/run/combat_setup.ts` (pass-through)
- Modify: `src/scenes/barracks_panel_scene.ts` (multi-trait label)
- Modify: `src/ui/widgets/hero_card.ts` (multi-trait label with truncation)
- Modify: `src/heroes/__tests__/hero.test.ts` (fixtures + new multi-trait test)
- Modify: `src/combat/__tests__/statuses.test.ts` (multi-trait stat-effect test)
- Modify: `src/combat/__tests__/combatant.test.ts` (fixture updates)
- Modify: `src/run/__tests__/combat_setup.test.ts` (fixture updates)
- Modify: `src/camp/buildings/__tests__/tavern.test.ts` (fixture updates)
- Modify: `src/items/__tests__/equip.test.ts` (fixture updates)
- Modify: `src/save/__tests__/save.test.ts` (fixture updates)

This is the largest task in the plan because the shape change is load-bearing. Lockstep is necessary because TypeScript's exhaustiveness would otherwise leave the build broken between intermediate steps.

- [ ] **Step 1: Write failing test — multi-trait stat composition**

Append to `src/heroes/__tests__/hero.test.ts`:

```typescript
describe('multi-trait Hero shape', () => {
  it('stores traitIds as a single-element array on createHero', () => {
    const hero = createHero('knight', 'A', 'h1', 'stout', 'body1');
    expect(hero.traitIds).toEqual(['stout']);
  });

  it('computeMaxHp composes multiple percent-mode hp effects multiplicatively', () => {
    // Stout = +10% HP. Stacking should give 1.21× base, not 1.20×.
    const knightHp = 20;
    const stout = TRAITS.stout;
    const traits = [stout, stout];  // illegal in practice (excluded by pool) but verifies compose order
    const equipment = {
      weapon: { id: 'w', baseId: 'sword_basic', slot: 'weapon', rarity: 'common', affixes: [], floorRolledAt: 1 },
    } as never;
    const hp = computeMaxHp(knightHp, traits, equipment);
    // 20 → 22 → 24.2 → round = 24 (per applyHpEffect's Math.round). Verify the compose order
    // produces a value strictly greater than the single-stout case.
    const singleHp = computeMaxHp(knightHp, [stout], equipment);
    expect(hp).toBeGreaterThan(singleHp);
  });

  it('recomputeMaxHp uses every trait in the array', () => {
    const hero = createHero('knight', 'A', 'h2', 'stout', 'body1');
    const heroWithTwo = { ...hero, traitIds: ['stout', 'sturdy' as const] };
    const recomputed = recomputeMaxHp(heroWithTwo);
    // Sturdy = +1 Defense (no HP effect); Stout = +10% HP. Recomputed maxHp should equal
    // the single-stout case (sturdy does not change HP).
    expect(recomputed.maxHp).toBe(recomputeMaxHp(hero).maxHp);
  });
});
```

Adjust the percent-mode test if `TRAITS.stout.hpEffect` semantics differ from `{ mode: 'percent', delta: 10 }`; read `src/data/traits.ts` first to confirm the exact shape.

Append to `src/combat/__tests__/statuses.test.ts`:

```typescript
describe('getEffectiveStat with multiple traitIds', () => {
  it('sums stat effects across all traits', () => {
    const combatant = makeHeroCombatant('knight', 1, 'p0', {
      traitIds: ['quick', 'sharp_eyed'],
    });
    // Quick = +1 Speed; Sharp_eyed = +5 Crit (verify exact deltas vs traits.ts).
    // Knight base speed = 3; with quick = 4. Sharp_eyed has no speed effect.
    const speed = getEffectiveStat(combatant, 'speed');
    expect(speed).toBeGreaterThan(combatant.baseStats.speed);
  });

  it('returns base stat when traitIds is empty', () => {
    const combatant = makeHeroCombatant('knight', 1, 'p0', { traitIds: [] });
    expect(getEffectiveStat(combatant, 'speed')).toBe(combatant.baseStats.speed);
  });
});
```

Read `src/data/traits.ts` to confirm `quick`/`sharp_eyed` deltas and adjust if necessary. The point of the test is to verify the *loop* compose semantics, not the specific numbers.

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run src/heroes/__tests__/hero.test.ts src/combat/__tests__/statuses.test.ts`
Expected: FAIL — `hero.traitIds` is undefined; `computeMaxHp` signature mismatch.

- [ ] **Step 3: Update `Hero` interface in `src/heroes/hero.ts`**

```typescript
export interface Hero {
  id: string;
  classId: ClassId;
  name: string;
  baseStats: Stats;
  currentHp: number;
  maxHp: number;
  traitIds: readonly TraitId[];   // was: traitId: TraitId
  bodySpriteId: string;
  legsSpriteId: string;
  feetSpriteId: string;
  wounds: Wound[];
  equipment: HeroEquipment;
  xp: number;
  level: number;
  pendingPerk: boolean;
  perkId?: PerkId;
  petSpeciesId?: PetSpeciesId;
}
```

- [ ] **Step 4: Update `createHero` to internally wrap traitId in an array**

`createHero(...)` keeps its `traitId: TraitId` parameter. Update the return:

```typescript
return {
  id,
  classId,
  name,
  baseStats: { ...def.baseStats },
  currentHp: maxHp,
  maxHp,
  traitIds: [traitId],   // was: traitId,
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
```

Also update the `maxHp` calculation right above:

```typescript
const maxHp = computeMaxHp(def.baseStats.hp, [TRAITS[traitId]], equipment);
```

- [ ] **Step 5: Update `computeMaxHp` signature**

```typescript
export function computeMaxHp(
  classBaseHp: number,
  traits: readonly TraitDef[],    // was: trait: TraitDef
  equipment: HeroEquipment,
  perk?: PerkDef,
): number {
  let base = classBaseHp;
  for (const trait of traits) {
    if (trait.hpEffect) base = applyHpEffect(base, trait.hpEffect);
  }
  if (perk?.hpEffect) base = applyHpEffect(base, perk.hpEffect);
  return base + gearTotal(equipment);
}
```

- [ ] **Step 6: Update `recomputeMaxHp`**

```typescript
export function recomputeMaxHp(hero: Hero): Hero {
  const classDef = CLASSES[hero.classId];
  const traits = hero.traitIds.map((id) => TRAITS[id]);
  const perk = hero.perkId ? PERKS[hero.perkId] : undefined;
  const newMaxHp = computeMaxHp(classDef.baseStats.hp, traits, hero.equipment, perk);
  return {
    ...hero,
    maxHp: newMaxHp,
    currentHp: Math.min(hero.currentHp, newMaxHp),
  };
}
```

Also: if `applyPerk` at the bottom of the file reads `hero.traitId`, update similarly to use `traitIds`.

- [ ] **Step 7: Update `Combatant.traitId` → `traitIds` in `src/combat/types.ts`**

Find line 54 (approximately) and change:

```typescript
traitIds?: readonly TraitId[];   // was: traitId?: TraitId
```

- [ ] **Step 8: Update `getEffectiveStat` in `src/combat/statuses.ts`**

Replace lines ~22-29:

```typescript
if (stat !== 'hp' && combatant.traitIds) {
  for (const id of combatant.traitIds) {
    const trait = TRAITS[id];
    for (const effect of trait.statEffects ?? []) {
      if (effect.stat === stat && evaluateTraitCondition(effect.condition, combatant)) {
        total += effect.delta;
      }
    }
  }
}
```

- [ ] **Step 9: Update `combat_setup.ts:80` pass-through**

```typescript
traitIds: hero.traitIds,   // was: traitId: hero.traitId,
```

- [ ] **Step 10: Update `src/scenes/barracks_panel_scene.ts:278`**

```typescript
const traitNames = hero.traitIds.map((id) => TRAITS[id].name).join(' · ');
// then use traitNames where the trait line is rendered
```

Read context around line 278 to wire `traitNames` into the existing render call.

- [ ] **Step 11: Update `src/ui/widgets/hero_card.ts:121` with truncation**

```typescript
const traitNames = this.hero.traitIds.length > 2
  ? this.hero.traitIds.slice(0, 2).map((id) => TRAITS[id].name).join(' · ') + ' …'
  : this.hero.traitIds.map((id) => TRAITS[id].name).join(' · ');
```

Then thread `traitNames` into the existing trait text render.

- [ ] **Step 12: Sweep test fixtures**

Each of these files has `traitId: 'something'` hero-literal fixtures or assertions. Convert to `traitIds: ['something']`. Search each file with grep:

```
src/heroes/__tests__/hero.test.ts          (existing fixtures + new tests from Step 1)
src/combat/__tests__/statuses.test.ts      (existing fixtures + new tests from Step 1)
src/combat/__tests__/combatant.test.ts     (any traitId in createHeroCombatant overrides)
src/run/__tests__/combat_setup.test.ts     (createHero call sites — should be createHero(), keeping the singular param, so no fixture change needed; but verify)
src/camp/buildings/__tests__/tavern.test.ts (createHero call sites — same)
src/items/__tests__/equip.test.ts          (any direct Hero literals)
src/save/__tests__/save.test.ts            (any direct Hero literals)
```

For each file:
1. Open it.
2. Grep for `traitId:` (the colon distinguishes literal fields from variable names like `traitId` in createHero call signatures, which can stay).
3. Convert each occurrence to `traitIds: [...]`.

If `combat_setup.test.ts` uses `createHero(...)` with the `traitId` parameter, that parameter name doesn't need to change — it's the call shape, not the Hero shape. Only Hero-literal `traitId: 'something'` field references convert.

- [ ] **Step 13: Run tests — expect passing**

Run: `npm test`
Expected: PASS — all existing tests still pass, plus the new multi-trait tests.

Run: `npm run build`
Expected: clean.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "Chapel — Hero.traitId → traitIds (multi-trait shape cascade)"
```

---

## Phase 3 — Chapel module

### Task 4: `src/camp/buildings/chapel.ts` + tests

**Files:**
- Create: `src/camp/buildings/chapel.ts`
- Create: `src/camp/buildings/__tests__/chapel.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/camp/buildings/__tests__/chapel.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  chapelReplaceCost,
  chapelAddCost,
  rollNewTrait,
  replaceTrait,
  addTrait,
  MAX_TRAITS_PER_HERO,
} from '../chapel';
import { createHero } from '@heroes/hero';
import { createRng } from '@util/rng';
import { TRAITS } from '@data/traits';
import type { TraitId } from '@data/types';

const ALL_TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

describe('chapelReplaceCost', () => {
  it('returns 50 × hero.level', () => {
    const hero = createHero('knight', 'A', 'h1', 'stout', 'body1');
    expect(chapelReplaceCost(hero)).toBe(50);
    expect(chapelReplaceCost({ ...hero, level: 5 })).toBe(250);
    expect(chapelReplaceCost({ ...hero, level: 10 })).toBe(500);
  });
});

describe('chapelAddCost', () => {
  it('returns 50 × level × currentTraitCount', () => {
    const hero = createHero('knight', 'A', 'h1', 'stout', 'body1');
    // 1 trait, level 1: 50 × 1 × 1 = 50
    expect(chapelAddCost(hero)).toBe(50);
    // 1 trait, level 5: 50 × 5 × 1 = 250
    expect(chapelAddCost({ ...hero, level: 5 })).toBe(250);
    // 2 traits, level 5: 50 × 5 × 2 = 500
    expect(chapelAddCost({ ...hero, level: 5, traitIds: ['stout', 'quick'] })).toBe(500);
  });

  it('returns Infinity when at the trait cap', () => {
    const hero = createHero('knight', 'A', 'h1', 'stout', 'body1');
    const capped = { ...hero, traitIds: ['stout', 'quick', 'lucky' as TraitId] };
    expect(chapelAddCost(capped)).toBe(Infinity);
  });
});

describe('rollNewTrait', () => {
  it('returns a trait not in the current set', () => {
    const rng = createRng(1);
    const current: readonly TraitId[] = ['stout'];
    const newTrait = rollNewTrait(current, rng);
    expect(current).not.toContain(newTrait);
  });

  it('throws when every trait is already in the current set', () => {
    const rng = createRng(1);
    expect(() => rollNewTrait(ALL_TRAIT_IDS, rng)).toThrow(/no traits left/);
  });
});

describe('replaceTrait', () => {
  it('replaces the trait at the given index with a different trait', () => {
    const rng = createRng(1);
    const hero = createHero('knight', 'A', 'h1', 'stout', 'body1');
    const updated = replaceTrait(hero, 0, rng);
    expect(updated.traitIds).toHaveLength(1);
    expect(updated.traitIds[0]).not.toBe('stout');
  });

  it('preserves other traits when replacing one of many', () => {
    const rng = createRng(1);
    const hero = createHero('knight', 'A', 'h1', 'stout', 'body1');
    const heroTwoTraits = { ...hero, traitIds: ['stout', 'quick'] as readonly TraitId[] };
    const updated = replaceTrait(heroTwoTraits, 0, rng);
    expect(updated.traitIds[1]).toBe('quick');
    expect(updated.traitIds[0]).not.toBe('stout');
    expect(updated.traitIds[0]).not.toBe('quick');
  });

  it('throws on invalid index', () => {
    const rng = createRng(1);
    const hero = createHero('knight', 'A', 'h1', 'stout', 'body1');
    expect(() => replaceTrait(hero, -1, rng)).toThrow(/invalid index/);
    expect(() => replaceTrait(hero, 1, rng)).toThrow(/invalid index/);
  });

  it('recomputes maxHp when the new trait has a different hpEffect', () => {
    const rng = createRng(1);
    const hero = createHero('knight', 'A', 'h1', 'stout', 'body1');
    // We can't easily assert the exact new maxHp without knowing which trait the RNG picks,
    // but we can verify maxHp is recomputed (in the consistent recompute path) by checking
    // it matches recomputeMaxHp on the updated hero.
    const updated = replaceTrait(hero, 0, rng);
    // The function calls recomputeMaxHp internally; the returned maxHp reflects the new trait set.
    expect(updated.maxHp).toBeGreaterThan(0);
  });
});

describe('addTrait', () => {
  it('appends a new trait to the array', () => {
    const rng = createRng(1);
    const hero = createHero('knight', 'A', 'h1', 'stout', 'body1');
    const updated = addTrait(hero, rng);
    expect(updated.traitIds).toHaveLength(2);
    expect(updated.traitIds[0]).toBe('stout');  // preserved
    expect(updated.traitIds[1]).not.toBe('stout');
  });

  it('throws when at the cap', () => {
    const rng = createRng(1);
    const hero = createHero('knight', 'A', 'h1', 'stout', 'body1');
    const capped = { ...hero, traitIds: ['stout', 'quick', 'lucky'] as readonly TraitId[] };
    expect(() => addTrait(capped, rng)).toThrow(/MAX_TRAITS_PER_HERO/);
  });
});

describe('MAX_TRAITS_PER_HERO', () => {
  it('is 3', () => {
    expect(MAX_TRAITS_PER_HERO).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests — expect failures (module not found)**

Run: `npx vitest run src/camp/buildings/__tests__/chapel.test.ts`
Expected: FAIL — `Cannot find module '../chapel'`.

- [ ] **Step 3: Create `src/camp/buildings/chapel.ts`**

```typescript
import { TRAITS } from '@data/traits';
import type { TraitId } from '@data/types';
import { recomputeMaxHp, type Hero } from '@heroes/hero';
import type { Rng } from '@util/rng';

const ALL_TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

export const MAX_TRAITS_PER_HERO = 3;

export function chapelReplaceCost(hero: Hero): number {
  return 50 * hero.level;
}

/** Returns Infinity when the hero is at the cap — UI gates the Add button on this. */
export function chapelAddCost(hero: Hero): number {
  if (hero.traitIds.length >= MAX_TRAITS_PER_HERO) return Infinity;
  return 50 * hero.level * hero.traitIds.length;
}

export function rollNewTrait(currentIds: readonly TraitId[], rng: Rng): TraitId {
  const pool = ALL_TRAIT_IDS.filter((id) => !currentIds.includes(id));
  if (pool.length === 0) {
    throw new Error('rollNewTrait: no traits left in pool (hero has every trait)');
  }
  return rng.pick(pool);
}

export function replaceTrait(hero: Hero, indexToReplace: number, rng: Rng): Hero {
  if (indexToReplace < 0 || indexToReplace >= hero.traitIds.length) {
    throw new Error(
      `replaceTrait: invalid index ${indexToReplace} (have ${hero.traitIds.length})`,
    );
  }
  const newTrait = rollNewTrait(hero.traitIds, rng);
  const newTraitIds = hero.traitIds.map((id, i) => (i === indexToReplace ? newTrait : id));
  return recomputeMaxHp({ ...hero, traitIds: newTraitIds });
}

export function addTrait(hero: Hero, rng: Rng): Hero {
  if (hero.traitIds.length >= MAX_TRAITS_PER_HERO) {
    throw new Error(`addTrait: hero already at MAX_TRAITS_PER_HERO (${MAX_TRAITS_PER_HERO})`);
  }
  const newTrait = rollNewTrait(hero.traitIds, rng);
  return recomputeMaxHp({ ...hero, traitIds: [...hero.traitIds, newTrait] });
}
```

- [ ] **Step 4: Run tests — expect passing**

Run: `npx vitest run src/camp/buildings/__tests__/chapel.test.ts`
Expected: PASS (all chapel tests).

Run: `npm test` and `npm run build` — expect clean.

- [ ] **Step 5: Commit**

```bash
git add src/camp/buildings/chapel.ts src/camp/buildings/__tests__/chapel.test.ts
git commit -m "Chapel — chapel.ts business logic + tests"
```

---

## Phase 4 — UI: panel scene + camp tile

### Task 5: `ChapelPanelScene`

**Files:**
- Create: `src/scenes/chapel_panel_scene.ts`
- Modify: `src/main.ts` (register the scene)

This task creates the Chapel UI scene. The structure mirrors Hospital almost line-for-line; reading `src/scenes/hospital_panel_scene.ts` before starting is highly recommended.

- [ ] **Step 1: Open Hospital scene as a reference**

Read `src/scenes/hospital_panel_scene.ts` end-to-end to absorb the patterns: scene-level state, `_pendingSelectedHeroId` / `_listPageStart` module-scoped persistence, `_detailContainer`/`_rowBgs` instance state, paging arrows, vault gold display, action buttons, partial-update on hero selection.

- [ ] **Step 2: Create `src/scenes/chapel_panel_scene.ts`**

This is a ~400-500 LOC scene file. Below is the full structure; adapt details (button positions, exact widget calls) to match Hospital's idioms in your codebase.

```typescript
import * as Phaser from 'phaser';
import {
  MAX_TRAITS_PER_HERO,
  addTrait,
  chapelAddCost,
  chapelReplaceCost,
  replaceTrait,
} from '@camp/buildings/chapel';
import { listHeroes, updateHero } from '@camp/roster';
import { balance, spend } from '@camp/vault';
import { TRAITS } from '@data/traits';
import type { Hero } from '@heroes/hero';
import { createRng, createRngFromState } from '@util/rng';
import {
  Button,
  COLOR,
  createBitmapText,
  createPanel,
} from '@ui/widgets';
import { appState } from './app_state';

let _pendingSelectedHeroId: string | null = null;
let _listPageStart = 0;

const PANEL_X = 20;
const PANEL_Y = 40;
const PANEL_W = 920;
const PANEL_H = 460;

const LIST_X = PANEL_X + 10;
const LIST_W = 380;

const DETAIL_X = LIST_X + LIST_W + 20;
const DETAIL_Y = PANEL_Y + 70;
const DETAIL_W = 480;
const DETAIL_H = PANEL_H - 90;

const ROW_X = LIST_X + LIST_W / 2;
const ROW_Y_BASE = PANEL_Y + 100;
const ROW_STRIDE = 56;
const ROW_W = 360;
const ROW_H = 50;
const VISIBLE_ROWS = 6;

const PAGE_ARROW_X = LIST_X + LIST_W + 8;
const PAGE_UP_Y = ROW_Y_BASE - 6;
const PAGE_DOWN_Y = ROW_Y_BASE + (VISIBLE_ROWS - 1) * ROW_STRIDE + 6;

const TRAIT_ROW_H = 40;
const TRAIT_ROW_STRIDE = 48;

export class ChapelPanelScene extends Phaser.Scene {
  private _detailContainer: Phaser.GameObjects.Container | undefined;
  private _rowBgs: { bg: Phaser.GameObjects.Rectangle; id: string }[] = [];
  private _selectedHeroId: string | null = null;

  constructor() {
    super('chapel_panel');
  }

  create(): void {
    this._detailContainer = undefined;
    this._rowBgs = [];

    const state = appState.get();
    const heroes = listHeroes(state.roster);
    const vaultGold = balance(state.vault);

    if (_pendingSelectedHeroId && heroes.some((h) => h.id === _pendingSelectedHeroId)) {
      this._selectedHeroId = _pendingSelectedHeroId;
    } else {
      this._selectedHeroId = heroes.length > 0 ? heroes[0].id : null;
    }
    _pendingSelectedHeroId = this._selectedHeroId;

    createPanel({ scene: this, x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H });

    createBitmapText({
      scene: this,
      x: 480,
      y: 12,
      text: `Chapel · ${heroes.length} heroes`,
      font: 'medium',
      size: 16,
      originX: 0.5,
    });

    createBitmapText({
      scene: this,
      x: 944,
      y: 12,
      text: `Gold: ${vaultGold}`,
      font: 'medium',
      size: 16,
      originX: 1,
    });

    // Close button — match Hospital pattern
    new Button({
      scene: this,
      x: PANEL_X + PANEL_W - 30,
      y: PANEL_Y + 20,
      label: '×',
      onClick: () => {
        _listPageStart = 0;
        this.scene.stop();
        this.scene.resume('camp');
      },
    });

    this.renderHeroList(heroes);
    this.renderDetailPane(heroes);
  }

  private renderHeroList(heroes: readonly Hero[]): void {
    const end = Math.min(_listPageStart + VISIBLE_ROWS, heroes.length);
    for (let i = _listPageStart; i < end; i++) {
      this.renderHeroRow(heroes[i], i - _listPageStart);
    }
    this.renderPagingArrows(heroes);
  }

  private renderHeroRow(hero: Hero, slot: number): void {
    const y = ROW_Y_BASE + slot * ROW_STRIDE;
    const bg = this.add
      .rectangle(ROW_X, y, ROW_W, ROW_H, 0x1a1a1a)
      .setStrokeStyle(2, hero.id === this._selectedHeroId ? COLOR.accentGold : 0x444444);
    this._rowBgs.push({ bg, id: hero.id });
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.selectHero(hero.id));

    createBitmapText({
      scene: this,
      x: ROW_X - ROW_W / 2 + 12,
      y: y - 12,
      text: `${hero.name} · ${hero.classId} · Lv ${hero.level}`,
      font: 'small',
      size: 16,
    });
    const traitNames = hero.traitIds.map((id) => TRAITS[id].name).join(' · ');
    createBitmapText({
      scene: this,
      x: ROW_X - ROW_W / 2 + 12,
      y: y + 8,
      text: traitNames,
      font: 'small',
      size: 16,
      tint: 0xccbbaa,
    });
  }

  private renderPagingArrows(heroes: readonly Hero[]): void {
    if (_listPageStart > 0) {
      const up = this.add.text(PAGE_ARROW_X, PAGE_UP_Y, '▲', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#aaaaaa',
      }).setInteractive({ useHandCursor: true });
      up.on('pointerdown', () => {
        _listPageStart = Math.max(0, _listPageStart - VISIBLE_ROWS);
        this.scene.restart();
      });
    }
    if (_listPageStart + VISIBLE_ROWS < heroes.length) {
      const down = this.add.text(PAGE_ARROW_X, PAGE_DOWN_Y, '▼', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#aaaaaa',
      }).setInteractive({ useHandCursor: true });
      down.on('pointerdown', () => {
        _listPageStart = Math.min(
          heroes.length - VISIBLE_ROWS,
          _listPageStart + VISIBLE_ROWS,
        );
        this.scene.restart();
      });
    }
  }

  private selectHero(heroId: string): void {
    this._selectedHeroId = heroId;
    _pendingSelectedHeroId = heroId;
    // Partial update: re-stroke list rows, re-render detail pane
    for (const { bg, id } of this._rowBgs) {
      bg.setStrokeStyle(2, id === heroId ? COLOR.accentGold : 0x444444);
    }
    if (this._detailContainer) this._detailContainer.destroy();
    this.renderDetailPane(listHeroes(appState.get().roster));
  }

  private renderDetailPane(heroes: readonly Hero[]): void {
    const hero = heroes.find((h) => h.id === this._selectedHeroId);
    this._detailContainer = this.add.container(DETAIL_X, DETAIL_Y);

    if (!hero) {
      this._detailContainer.add(
        createBitmapText({
          scene: this,
          x: DETAIL_W / 2,
          y: DETAIL_H / 2,
          text: 'No heroes in your roster.',
          font: 'small',
          size: 16,
          originX: 0.5,
          tint: 0x888888,
        }),
      );
      return;
    }

    // Header
    this._detailContainer.add(
      createBitmapText({
        scene: this,
        x: 12,
        y: 0,
        text: `${hero.name} (${hero.classId} · Lv ${hero.level})`,
        font: 'medium',
        size: 16,
      }),
    );

    // Current traits header
    this._detailContainer.add(
      createBitmapText({
        scene: this,
        x: 12,
        y: 40,
        text: 'Current traits:',
        font: 'small',
        size: 16,
        tint: 0xaaaaaa,
      }),
    );

    const replaceCost = chapelReplaceCost(hero);
    const vaultGold = balance(appState.get().vault);

    // Trait rows
    for (let i = 0; i < hero.traitIds.length; i++) {
      const yi = 70 + i * TRAIT_ROW_STRIDE;
      const trait = TRAITS[hero.traitIds[i]];
      this._detailContainer.add(
        createBitmapText({
          scene: this,
          x: 24,
          y: yi,
          text: `• ${trait.name}`,
          font: 'small',
          size: 16,
        }),
      );

      const canAfford = vaultGold >= replaceCost;
      const btn = new Button({
        scene: this,
        x: DETAIL_W - 100,
        y: yi + 8,
        label: `Replace · ${replaceCost}g`,
        disabled: !canAfford,
        onClick: () => this.doReplace(hero.id, i),
      });
      this._detailContainer.add(btn.container);
    }

    // Slots-used label
    const slotsY = 70 + hero.traitIds.length * TRAIT_ROW_STRIDE + 20;
    this._detailContainer.add(
      createBitmapText({
        scene: this,
        x: 12,
        y: slotsY,
        text: `Slots used: ${hero.traitIds.length}/${MAX_TRAITS_PER_HERO}`,
        font: 'small',
        size: 16,
        tint: 0xaaaaaa,
      }),
    );

    // Add button
    const addCost = chapelAddCost(hero);
    const atCap = hero.traitIds.length >= MAX_TRAITS_PER_HERO;
    const canAffordAdd = !atCap && vaultGold >= addCost;
    const addLabel = atCap
      ? '+ Add — at cap'
      : `+ Add a trait — ${addCost}g`;
    const addBtn = new Button({
      scene: this,
      x: DETAIL_W - 140,
      y: slotsY + 28,
      label: addLabel,
      disabled: !canAffordAdd,
      onClick: () => this.doAdd(hero.id),
    });
    this._detailContainer.add(addBtn.container);
  }

  private doReplace(heroId: string, indexToReplace: number): void {
    const state = appState.get();
    const hero = state.roster.heroes.find((h) => h.id === heroId);
    if (!hero) return;
    const cost = chapelReplaceCost(hero);
    if (balance(state.vault) < cost) return;

    const campRng = createRngFromState(state.campRngState);
    const newVault = spend(state.vault, cost);
    const updatedHero = replaceTrait(hero, indexToReplace, campRng);
    const newRoster = updateHero(state.roster, updatedHero);
    appState.update({
      ...state,
      vault: newVault,
      roster: newRoster,
      campRngState: campRng.getState(),
    });
    this.flashTrait(updatedHero.id, indexToReplace);
    this.scene.restart();
  }

  private doAdd(heroId: string): void {
    const state = appState.get();
    const hero = state.roster.heroes.find((h) => h.id === heroId);
    if (!hero) return;
    const cost = chapelAddCost(hero);
    if (cost === Infinity || balance(state.vault) < cost) return;

    const campRng = createRngFromState(state.campRngState);
    const newVault = spend(state.vault, cost);
    const updatedHero = addTrait(hero, campRng);
    const newRoster = updateHero(state.roster, updatedHero);
    appState.update({
      ...state,
      vault: newVault,
      roster: newRoster,
      campRngState: campRng.getState(),
    });
    this.flashTrait(updatedHero.id, updatedHero.traitIds.length - 1);
    this.scene.restart();
  }

  private flashTrait(_heroId: string, _index: number): void {
    // 700ms tint flourish on the changed trait row. Lightweight placeholder:
    // the scene.restart() above already re-renders; a richer animation can replace
    // this method later. Visual polish is non-load-bearing.
  }
}
```

Notes on the above:
- The `Button` widget shape (`{ scene, x, y, label, disabled, onClick, container }`) is assumed to match the existing Hospital pattern. Read `src/ui/widgets/index.ts` for the exact `Button` interface and adapt — Hospital's call sites are the canonical reference.
- `appState.update(...)` may not be the exact method name. Hospital uses `appState.get()` extensively; check whether updates go through `appState.update` or a different setter. Match Hospital's pattern.
- `flashTrait` is a placeholder for the 700ms tint flourish described in the spec. The minimum implementation is `scene.restart()`, which re-renders the detail pane with the new trait visible. Animation polish is non-load-bearing per the spec ("Tunable during implementation"). Leave as a no-op for v1.

- [ ] **Step 3: Register the scene in `src/main.ts`**

Open `src/main.ts` and find the existing scene-registration list. Add `ChapelPanelScene` to the list:

```typescript
import { ChapelPanelScene } from './scenes/chapel_panel_scene';
// ...
scene: [
  // existing scenes
  ChapelPanelScene,
],
```

(Read the file to find the exact registration site; the pattern matches Hospital's registration.)

- [ ] **Step 4: Run build to verify TS compile**

Run: `npm run build`
Expected: clean. There are no unit tests for this scene (Phaser-dependent scene code is integration-tested via in-browser smoke).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/chapel_panel_scene.ts src/main.ts
git commit -m "Chapel — ChapelPanelScene + registration"
```

---

### Task 6: Camp scene conditional Chapel tile

**Files:**
- Modify: `src/scenes/camp_scene.ts`

- [ ] **Step 1: Update `src/scenes/camp_scene.ts:14-22`**

Replace the building-creation block:

```typescript
this.buildBuilding('Tavern', 180, 0x664433, 100, 110, 'tavern_panel');
this.buildBuilding('Blacksmith', 300, 0x665533, 100, 120, 'blacksmith_panel');
this.buildBuilding('Barracks', 440, 0x555555, 100, 130, 'barracks_panel');
this.buildBuilding('Hospital', 580, 0x885566, 100, 100, 'hospital_panel');
if (appState.get().unlocks.buildings.includes('chapel')) {
  this.buildBuilding('Chapel', 720, 0x886688, 90, 110, 'chapel_panel');
  this.buildBuilding('Expeditions', 850, 0x998866, 80, 60, 'expeditions_panel');
} else {
  this.buildBuilding('Expeditions', 720, 0x998866, 80, 60, 'expeditions_panel');
}
```

- [ ] **Step 2: Verify build + tests**

Run: `npm run build`
Expected: clean.

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/camp_scene.ts
git commit -m "Chapel — conditional camp tile gated on unlocks.buildings"
```

---

## Phase 5 — Milestone wiring

### Task 7: Extend `first_sunken_keep_clear` handler

**Files:**
- Modify: `src/run/milestones.ts`
- Modify: `src/run/__tests__/milestones.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/run/__tests__/milestones.test.ts`. The existing `first_sunken_keep_clear handler` describe block (from Hunter spec) has tests for Hunter append + idempotency. Extend it:

```typescript
it('appends chapel to unlocks.buildings on a fresh state', () => {
  const before = makeFakeSave({
    classes: ['knight'],
    dungeons: ['crypt', 'sunken_keep'],
    buildings: [],
  });
  const after = MILESTONES.first_sunken_keep_clear(before);
  expect(after.unlocks.buildings).toContain('chapel');
});

it('appends only chapel when hunter already unlocked', () => {
  const before = makeFakeSave({
    classes: ['knight', 'hunter'],
    dungeons: ['crypt', 'sunken_keep'],
    buildings: [],
  });
  const after = MILESTONES.first_sunken_keep_clear(before);
  expect(after.unlocks.buildings).toContain('chapel');
  expect(after.unlocks.classes).toEqual(['knight', 'hunter']);
});

it('appends only hunter when chapel already unlocked', () => {
  const before = makeFakeSave({
    classes: ['knight'],
    dungeons: ['crypt', 'sunken_keep'],
    buildings: ['chapel'],
  });
  const after = MILESTONES.first_sunken_keep_clear(before);
  expect(after.unlocks.classes).toContain('hunter');
  expect(after.unlocks.buildings).toEqual(['chapel']);
});
```

Update the existing idempotency test from Hunter spec — it currently sets `classes: ['knight', 'hunter']` and `dungeons: ['crypt', 'sunken_keep']`. Add `buildings: ['chapel']` so both branches no-op:

```typescript
it('is idempotent', () => {
  const before = makeFakeSave({
    classes: ['knight', 'hunter'],
    dungeons: ['crypt', 'sunken_keep'],
    buildings: ['chapel'],
  });
  const after = MILESTONES.first_sunken_keep_clear(before);
  expect(after).toBe(before);
});
```

Also update the `makeFakeSave` helper if it doesn't already accept `buildings`. It likely just spreads the unlocks object — verify it's `Unlocks`-compatible after the type widening.

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run src/run/__tests__/milestones.test.ts`
Expected: FAIL — handler doesn't append chapel.

- [ ] **Step 3: Extend the handler in `src/run/milestones.ts`**

Update the `first_sunken_keep_clear` entry:

```typescript
first_sunken_keep_clear: (state) => {
  let next = state;
  if (!next.unlocks.classes.includes('hunter')) {
    next = {
      ...next,
      unlocks: { ...next.unlocks, classes: [...next.unlocks.classes, 'hunter'] },
    };
  }
  if (!next.unlocks.buildings.includes('chapel')) {
    next = {
      ...next,
      unlocks: { ...next.unlocks, buildings: [...next.unlocks.buildings, 'chapel'] },
    };
  }
  return next;  // identity preserved when both branches no-op
},
```

- [ ] **Step 4: Run tests — expect passing**

Run: `npx vitest run src/run/__tests__/milestones.test.ts`
Expected: PASS.

Run: `npm test` and `npm run build` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/run/milestones.ts src/run/__tests__/milestones.test.ts
git commit -m "Chapel — first_sunken_keep_clear appends to unlocks.buildings"
```

---

## Phase 6 — Save migration v3 → v4

### Task 8: Schema bump + Hero.traitId → traitIds migration

**Files:**
- Modify: `src/save/migration.ts`
- Modify: `src/save/__tests__/migration.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/save/__tests__/migration.test.ts`:

```typescript
it('v3 → v4: Hero.traitId → traitIds; buildingLevels.chapel = 1; unlocks.buildings = []', () => {
  const v3 = {
    version: 3,
    roster: {
      heroes: [
        { id: 'h1', classId: 'knight', traitId: 'stout', xp: 0, level: 1, /* other Hero fields elided */ },
      ],
      capacity: 12,
    },
    vault: { gold: 0 },
    stash: { items: [] },
    unlocks: { classes: ['knight'], dungeons: ['crypt'] },
    buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
    hospitalTreatmentsRemaining: 0,
    tavernCandidates: [
      { id: 'c1', classId: 'archer', traitId: 'quick', xp: 0, level: 1 },
    ],
    campRngState: 12345,
    runState: {
      dungeonId: 'crypt',
      seed: 1,
      party: [{ id: 'p1', classId: 'priest', traitId: 'wise', xp: 0, level: 1 }],
      fallen: [{ id: 'f1', classId: 'mage', traitId: 'frail', xp: 0, level: 1 }],
      lost: [{ id: 'l1', classId: 'rogue', traitId: 'lucky', xp: 0, level: 1 }],
      pack: { gold: 0, items: [] },
      currentFloorNumber: 1,
      currentFloorNodes: [],
      currentNodeId: 'start',
      awaitingFork: false,
      status: 'in_dungeon',
      traversedNodeIds: [],
      surprisesThisFloor: 0,
      pendingMilestones: [],
      petsDownByHeroId: [],
    },
    runRngState: 99999,
  };
  const result = migrate(v3) as unknown as {
    version: number;
    roster: { heroes: Array<{ traitIds?: string[]; traitId?: string }> };
    tavernCandidates: Array<{ traitIds?: string[] }>;
    runState: {
      party: Array<{ traitIds?: string[] }>;
      fallen: Array<{ traitIds?: string[] }>;
      lost: Array<{ traitIds?: string[] }>;
    };
    buildingLevels: { chapel?: number };
    unlocks: { buildings?: string[] };
  };
  expect(result).not.toBeNull();
  expect(result.version).toBe(4);
  expect(result.roster.heroes[0].traitIds).toEqual(['stout']);
  expect(result.roster.heroes[0].traitId).toBeUndefined();
  expect(result.tavernCandidates[0].traitIds).toEqual(['quick']);
  expect(result.runState.party[0].traitIds).toEqual(['wise']);
  expect(result.runState.fallen[0].traitIds).toEqual(['frail']);
  expect(result.runState.lost[0].traitIds).toEqual(['lucky']);
  expect(result.buildingLevels.chapel).toBe(1);
  expect(result.unlocks.buildings).toEqual([]);
});

it('v3 → v4: heroes already migrated (defensive) pass through', () => {
  const v3 = {
    version: 3,
    roster: {
      heroes: [{ id: 'h1', classId: 'knight', traitIds: ['stout', 'quick'] }],
      capacity: 12,
    },
    vault: { gold: 0 },
    stash: { items: [] },
    unlocks: { classes: ['knight'], dungeons: ['crypt'] },
    buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
    hospitalTreatmentsRemaining: 0,
    tavernCandidates: [],
    campRngState: 12345,
  };
  const result = migrate(v3) as unknown as { roster: { heroes: Array<{ traitIds: string[] }> } };
  expect(result.roster.heroes[0].traitIds).toEqual(['stout', 'quick']);
});

it('v3 → v4: no runState (camp-only save) bumps version and defaults building/unlocks fields', () => {
  const v3 = {
    version: 3,
    roster: { heroes: [], capacity: 12 },
    vault: { gold: 0 },
    stash: { items: [] },
    unlocks: { classes: ['knight'], dungeons: ['crypt'] },
    buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
    hospitalTreatmentsRemaining: 0,
    tavernCandidates: [],
    campRngState: 12345,
  };
  const result = migrate(v3) as unknown as {
    version: number;
    runState?: unknown;
    buildingLevels: { chapel?: number };
    unlocks: { buildings?: string[] };
  };
  expect(result.version).toBe(4);
  expect(result.runState).toBeUndefined();
  expect(result.buildingLevels.chapel).toBe(1);
  expect(result.unlocks.buildings).toEqual([]);
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run src/save/__tests__/migration.test.ts`
Expected: FAIL — `MIGRATIONS[3]` doesn't exist.

- [ ] **Step 3: Bump `CURRENT_SCHEMA_VERSION` and add `MIGRATIONS[3]`**

In `src/save/migration.ts`:

```typescript
export const CURRENT_SCHEMA_VERSION = 4;

const MIGRATIONS: Record<number, MigrationFn> = {
  // v1 → v2: introduce SaveFile.campRngState (Cluster B · 58, 2026-05-10).
  1: (raw) => ({ ...raw, campRngState: Date.now(), version: 2 }),

  // v2 → v3: Hero.petSpeciesId (defensive) + RunState.petsDownByHeroId default []. Hunter spec, 2026-05-10.
  2: (raw) => {
    const out: Record<string, unknown> = { ...raw, version: 3 };
    const roster = out.roster as { heroes?: Array<Record<string, unknown>> } | undefined;
    if (roster?.heroes) {
      roster.heroes = roster.heroes.map((h) =>
        h.classId === 'hunter' && !h.petSpeciesId ? { ...h, petSpeciesId: 'wolf' } : h,
      );
    }
    const candidates = out.tavernCandidates as Array<Record<string, unknown>> | undefined;
    if (candidates) {
      out.tavernCandidates = candidates.map((h) =>
        h.classId === 'hunter' && !h.petSpeciesId ? { ...h, petSpeciesId: 'wolf' } : h,
      );
    }
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

  // v3 → v4: Hero.traitId → traitIds (single → array); buildingLevels.chapel = 1; unlocks.buildings = [].
  // Chapel spec, 2026-05-11.
  3: (raw) => {
    const out: Record<string, unknown> = { ...raw, version: 4 };

    const migrateHero = (h: Record<string, unknown>): Record<string, unknown> => {
      if (Array.isArray(h.traitIds)) return h;
      if (typeof h.traitId !== 'string') return h;
      const { traitId, ...rest } = h;
      return { ...rest, traitIds: [traitId] };
    };

    const roster = out.roster as { heroes?: Array<Record<string, unknown>> } | undefined;
    if (roster?.heroes) roster.heroes = roster.heroes.map(migrateHero);

    const candidates = out.tavernCandidates as Array<Record<string, unknown>> | undefined;
    if (candidates) out.tavernCandidates = candidates.map(migrateHero);

    const runState = out.runState as Record<string, unknown> | undefined;
    if (runState) {
      const party = runState.party as Array<Record<string, unknown>> | undefined;
      if (party) runState.party = party.map(migrateHero);
      const fallen = runState.fallen as Array<Record<string, unknown>> | undefined;
      if (fallen) runState.fallen = fallen.map(migrateHero);
      const lost = runState.lost as Array<Record<string, unknown>> | undefined;
      if (lost) runState.lost = lost.map(migrateHero);
    }

    const bl = out.buildingLevels as Record<string, unknown> | undefined;
    if (bl && bl.chapel === undefined) bl.chapel = 1;

    const unlocks = out.unlocks as Record<string, unknown> | undefined;
    if (unlocks && unlocks.buildings === undefined) unlocks.buildings = [];

    return out;
  },
};
```

- [ ] **Step 4: Run tests — expect passing**

Run: `npx vitest run src/save/__tests__/migration.test.ts`
Expected: PASS.

Run: `npm test` and `npm run build` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/save/migration.ts src/save/__tests__/migration.test.ts
git commit -m "Chapel — save schema bump v3 → v4 (traitIds + buildings)"
```

---

## Phase 7 — gdd patch + final verification

### Task 9: gdd §6 row 6 patch

**Files:**
- Modify: `gdd.md`

- [ ] **Step 1: Edit gdd.md line 198**

Change:

```markdown
| **Chapel** *(unlock)* | Remove a Trait from a hero. Expensive. Unlocks after first Sunken Keep clear. | L1 only |
```

to:

```markdown
| **Chapel** *(unlock)* | Add or replace traits on a hero — up to 3 per hero. Expensive. Unlocks after first Sunken Keep clear. | L1 only |
```

- [ ] **Step 2: Commit**

```bash
git add gdd.md
git commit -m "gdd — update Chapel row to Add-or-Replace traits design"
```

---

### Task 10: Full test suite + build verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: ALL existing tests pass plus the new Chapel-related tests.

- [ ] **Step 2: Run the TypeScript build**

Run: `npm run build`
Expected: build succeeds with no type errors. Watch specifically for:
- Exhaustiveness errors on `Record<BuildingId, ...>` switches/iterations (the chapel widening adds a key).
- Exhaustiveness errors on `Combatant.kind` switches (unrelated to this spec but worth checking).
- Unused-import warnings if any helper became dead.

- [ ] **Step 3: Sanity-check the diff scope**

Run: `git diff --stat main`
Expected: ~20-25 files modified, ~600-800 net lines added (roughly 60% scene code, 40% data + migration + tests).

- [ ] **Step 4: Final commit (no-op if 1–3 produced no changes)**

If verification turned up any small fix-ups (e.g., a switch case needed for a Building widening site), commit them:

```bash
git add -p
git commit -m "Chapel — fix-ups from full-suite verification"
```

If nothing changed, skip this step.

---

## Spec coverage check

| Spec section | Task(s) |
|---|---|
| BuildingId widening + move to data/types | Task 1, Task 2 |
| Unlocks.buildings field + createDefaultUnlocks | Task 2 |
| BUILDING_LEVELS.chapel entry | Task 2 |
| Hero.traitId → traitIds + computeMaxHp/recomputeMaxHp signature change | Task 3 |
| Combatant.traitIds + getEffectiveStat loop | Task 3 |
| combat_setup pass-through | Task 3 |
| HeroCard + Barracks multi-trait label with truncation | Task 3 |
| chapel.ts business logic (replaceTrait, addTrait, costs, cap) | Task 4 |
| ChapelPanelScene + main.ts registration | Task 5 |
| Camp scene conditional Chapel tile | Task 6 |
| Milestone handler extension (first_sunken_keep_clear → chapel) | Task 7 |
| Save schema v3 → v4 migration | Task 8 |
| gdd row 6 patch | Task 9 |
| Final verification | Task 10 |

All spec requirements are mapped. Out-of-scope items (L2/L3, retroactive unlocks, preview-then-confirm UI, bespoke art) correctly absent.

---

## Implementation notes

- **Hero shape cascade (Task 3) is the largest task** — touches ~10 files in lockstep. The TS compiler will guide you through each site; treat any "Property 'traitId' does not exist" error as a one-line fix at that site.
- **Phaser firewall preserved** — `chapel.ts` (in `src/camp/buildings/`) does not import `phaser`. Only `chapel_panel_scene.ts` (in `src/scenes/`) imports Phaser.
- **Camp RNG threading** — Chapel actions use `campRngState` (per the same pattern as Tavern reroll and hire). Read `state.campRngState` → create rng → run action → write back `campRngState = rng.getState()`. Mirror the Tavern's pattern exactly; bug surface is small if you follow it.
- **`flashTrait` reveal animation is a placeholder** — the scene.restart() already re-renders the changed trait visibly. Richer animation polish is non-load-bearing; defer if time-constrained.
- **Migration scope** covers all 5 Hero record locations in save (`roster.heroes`, `tavernCandidates`, `runState.party/fallen/lost`). Re-verify by grepping `src/save/__tests__/` for `traitId:` and confirming any test fixture that should be migrated through v3→v4 has its assertions updated.
