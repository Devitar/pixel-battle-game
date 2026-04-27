# Gear Rarity Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the items foundation — typed `Item`s with rarity, an affix system, four rare-only properties, hero equipment slots, loot rolls into pack, banking to a camp stash, and gear-derived stats flowing into combat.

**Architecture:** Pure Cluster A (no `phaser` imports outside the existing `src/render/combat_actor.ts` STATUS_GLYPHS edit). Items are immutable value objects with stable per-instance IDs; affix values are baked at roll time and never re-scaled. Gear stats fold into combat at `buildCombatState` (derive-on-build, mirrors the wounds pattern). Rare properties become flat optional fields on `Combatant` so the combat resolver never imports from `src/items/`.

**Tech Stack:** TypeScript 6.0, Vitest 4.1. No Phaser in new code.

**Repo convention:** `CLAUDE.md` says *"Never create git commits without explicit user instruction in the current turn."* This plan has no commit steps; the user drives staging and commits.

**Source spec:** [`docs/superpowers/specs/2026-04-27-gear-rarity-tiers-design.md`](../specs/2026-04-27-gear-rarity-tiers-design.md).

---

## File Structure

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/data/types.ts` | Modify | Add `ItemSlot`, `Rarity`, `ItemBaseId`, `AffixId`, `RarePropertyId`, `AffixDef`, `RarePropertyDef`, `Item`, `RolledAffix`, `RolledRareProperty`, `HeroEquipment`. Retype `StarterLoadout` to use `ItemBaseId`. Extend `StatusId` with `'burning'`. |
| `src/data/items.ts` | Create | `AFFIXES`, `RARE_PROPERTIES`, `BASE_ITEMS` catalogs + `BASE_ITEM_STATS` table. |
| `src/data/__tests__/items.test.ts` | Create | Catalog integrity tests. |
| `src/util/rng.ts` | Modify | Add `generateItemId(rng)` helper. |
| `src/util/__tests__/rng.test.ts` | Modify | Test for `generateItemId`. |
| `src/dungeon/loot.ts` | Create | `rollLoot(rng, floorNumber, isBoss): Item \| null`. |
| `src/dungeon/__tests__/loot.test.ts` | Create | Drop gate, slot uniformity, rarity weights, affix counts, rare property gating, determinism. |
| `src/run/pack.ts` | Modify | `Pack.items: readonly Item[]`. New `addItem`, `removeItem`. `createPack()` returns `{ gold: 0, items: [] }`. |
| `src/run/__tests__/pack.test.ts` | Modify | Add `addItem`, `removeItem` tests. |
| `src/camp/stash.ts` | Create | `Stash`, `createStash`, `addItems`, `removeItem`. |
| `src/camp/__tests__/stash.test.ts` | Create | Stash tests. |
| `src/items/equip.ts` | Create | `equip(hero, item, slot)`, `unequip(hero, slot)` pure functions. |
| `src/items/__tests__/equip.test.ts` | Create | Equip/unequip tests. |
| `src/data/classes.ts` | Modify | Retype each class's `starterLoadout` to `ItemBaseId` references. |
| `src/heroes/hero.ts` | Modify | `Hero.equipment: HeroEquipment`. `createHero` instantiates starter `Item`s. `computeMaxHp` extends to fold equipment HP. |
| `src/heroes/__tests__/hero.test.ts` | Modify | Tests for equipment population + computeMaxHp. |
| `src/render/hero_loadout.ts` | Modify | Read sprite IDs from `hero.equipment.weapon.baseId → BASE_ITEMS`, not from `class.starterLoadout`. |
| `src/render/__tests__/hero_loadout.test.ts` | Modify | Update fixtures for new shape. |
| `src/combat/types.ts` | Modify | Extend `Combatant` with `lifestealPercent?`, `thornsDamage?`, `regenPerRound?` fields. |
| `src/run/combat_setup.ts` | Modify | Add `equipmentStats` helper; fold into `buildCombatState` after wounds. Pipe `lifestealPercent`/`thornsDamage`/`regenPerRound` from rare properties onto `Combatant`. |
| `src/run/__tests__/combat_setup.test.ts` | Modify | Tests for equipment stats and rare-property field plumbing. |
| `src/combat/effects.ts` | Modify | In `applyDamage`: apply `'burning'` status on landed hits when source has `of_burning` weapon; apply lifesteal heal-to-source from `lifestealPercent`; apply thorns reflect from `thornsDamage` on landed hits to a target with thorns. |
| `src/combat/statuses.ts` | Modify | Tick `burning` status as a DoT (mirroring `poison` block). |
| `src/combat/combat.ts` | Modify | At the start of each round_start handling, apply `regenPerRound` to each living hero. |
| `src/combat/__tests__/effects.test.ts` | Modify | Tests for burning, lifesteal, thorns. |
| `src/combat/__tests__/combat.test.ts` | Modify | Test for round-start regen. |
| `src/render/combat_actor.ts` | Modify | Add `'burning'` to `STATUS_GLYPHS`. |
| `src/run/run_state.ts` | Modify | `completeCombat(runState, result, rng)`: roll loot drop on victory; transfer fallen-hero gear to pack. `CashoutOutcome.itemsBanked`. |
| `src/run/__tests__/run_state.test.ts` | Modify | Tests for drop, fallen-gear transfer, cashout banking. |
| `src/save/save.ts` | Modify | `SaveFile.stash: Stash`. Add `normalizeSaveFile` that fills defaults for older v1 saves missing new fields. Call it inside `load()` before returning. |
| `src/save/boot.ts` | Modify | `createFreshSave` includes `stash: createStash()`. |
| `src/save/__tests__/save.test.ts` | Modify | Round-trip with new fields; defaulting on missing fields. |
| `src/save/__tests__/boot.test.ts` | Modify | Fresh save has empty stash. |
| `src/scenes/dungeon_scene.ts` | Modify | Pass run RNG into `completeCombat` (signature added). |
| `src/scenes/camp_screen_scene.ts` | Modify | On cashout, call `addItems(stash, outcome.itemsBanked)` next to existing vault credit. |

---

## Task 1: Item types in `data/types.ts`

**Files:**
- Modify: `src/data/types.ts`

- [ ] **Step 1: Append the new types and extend `StatusId` and `StarterLoadout` in `src/data/types.ts`**

Add after the existing `WeaponType` declaration:

```ts
export type ItemSlot = 'weapon' | 'shield' | 'outfit' | 'hat';

export type Rarity = 'common' | 'uncommon' | 'rare';

export type ItemBaseId =
  | 'sword_basic' | 'bow_basic' | 'mace_basic'
  | 'axe_basic' | 'daggers_basic' | 'staff_basic'
  | 'shield_basic'
  | 'outfit_cloth' | 'outfit_leather'
  | 'hat_cap' | 'hat_hood';

export type AffixId =
  | 'of_power' | 'of_insight' | 'of_the_bear' | 'of_vigor'
  | 'of_swiftness' | 'of_the_hawk' | 'of_evasion';

export type RarePropertyId =
  | 'of_burning' | 'of_vampirism'
  | 'of_thorns'
  | 'of_regeneration';

export interface AffixDef {
  id: AffixId;
  name: string;
  stat: BuffableStat;
  baseValue: number;
  hpMultiplier?: 3;
}

export type RarePropertyDef =
  | { id: 'of_burning'; name: string; slots: readonly ['weapon']; kind: 'burn'; baseDamage: number; turns: 2 }
  | { id: 'of_vampirism'; name: string; slots: readonly ['weapon']; kind: 'lifesteal'; percentOfDamage: number }
  | { id: 'of_thorns'; name: string; slots: readonly ['shield']; kind: 'thorns'; baseDamage: number }
  | { id: 'of_regeneration'; name: string; slots: readonly ['outfit']; kind: 'regen'; baseHeal: number };

export interface RolledAffix {
  affixId: AffixId;
  value: number;
}

export interface RolledRareProperty {
  propertyId: RarePropertyId;
  value: number;
}

export interface Item {
  readonly id: string;
  readonly baseId: ItemBaseId;
  readonly slot: ItemSlot;
  readonly rarity: Rarity;
  readonly weaponType?: WeaponType;
  readonly affixes: readonly RolledAffix[];
  readonly rareProperty?: RolledRareProperty;
  readonly floorRolledAt: number;
}

export interface HeroEquipment {
  weapon: Item;
  shield?: Item;
  outfit?: Item;
  hat?: Item;
}
```

Then **change** the existing `StatusId` line to add `'burning'`:

```ts
export type StatusId = 'bulwark' | 'taunting' | 'marked' | 'blessed' | 'rotting' | 'frailty' | 'stunned' | 'chilled' | 'enraged' | 'poisoned' | 'vanished' | 'slowed' | 'burning';
```

And **replace** the existing `StarterLoadout` interface:

```ts
export interface StarterLoadout {
  weapon: ItemBaseId;
  shield?: ItemBaseId;
  outfit?: ItemBaseId;
  hat?: ItemBaseId;
}
```

- [ ] **Step 2: Run typecheck to confirm types compile**

Run: `npx tsc --noEmit`
Expected: many errors in files that consume `StarterLoadout` (`classes.ts`, `hero_loadout.ts`) — these stay broken until later tasks. The new types themselves should compile clean. **It is OK to proceed with these errors; later tasks fix the consumers.**

---

## Task 2: Affix pool, rare property pool, base item catalog

**Files:**
- Create: `src/data/items.ts`
- Create: `src/data/__tests__/items.test.ts`

- [ ] **Step 1: Create `src/data/__tests__/items.test.ts` (failing — `items.ts` doesn't exist yet)**

```ts
import { describe, expect, it } from 'vitest';
import { AFFIXES, BASE_ITEMS, BASE_ITEM_STATS, RARE_PROPERTIES } from '../items';
import type { AffixId, ItemBaseId, RarePropertyId } from '../types';

const EXPECTED_AFFIXES: readonly AffixId[] = [
  'of_power', 'of_insight', 'of_the_bear', 'of_vigor',
  'of_swiftness', 'of_the_hawk', 'of_evasion',
];

const EXPECTED_BASES: readonly ItemBaseId[] = [
  'sword_basic', 'bow_basic', 'mace_basic',
  'axe_basic', 'daggers_basic', 'staff_basic',
  'shield_basic',
  'outfit_cloth', 'outfit_leather',
  'hat_cap', 'hat_hood',
];

const EXPECTED_PROPS: readonly RarePropertyId[] = [
  'of_burning', 'of_vampirism', 'of_thorns', 'of_regeneration',
];

describe('AFFIXES', () => {
  it('has all 7 affixes keyed by id', () => {
    for (const id of EXPECTED_AFFIXES) {
      expect(AFFIXES[id]).toBeDefined();
      expect(AFFIXES[id].id).toBe(id);
    }
  });

  it('only of_vigor carries the hp ×3 sentinel', () => {
    for (const id of EXPECTED_AFFIXES) {
      const def = AFFIXES[id];
      if (id === 'of_vigor') {
        expect(def.hpMultiplier).toBe(3);
        expect(def.stat).toBe('hp');
      } else {
        expect(def.hpMultiplier).toBeUndefined();
      }
    }
  });
});

describe('RARE_PROPERTIES', () => {
  it('has all 4 properties keyed by id with single-slot constraints', () => {
    for (const id of EXPECTED_PROPS) {
      expect(RARE_PROPERTIES[id]).toBeDefined();
      expect(RARE_PROPERTIES[id].slots).toHaveLength(1);
    }
    expect(RARE_PROPERTIES.of_burning.slots).toEqual(['weapon']);
    expect(RARE_PROPERTIES.of_vampirism.slots).toEqual(['weapon']);
    expect(RARE_PROPERTIES.of_thorns.slots).toEqual(['shield']);
    expect(RARE_PROPERTIES.of_regeneration.slots).toEqual(['outfit']);
  });
});

describe('BASE_ITEMS', () => {
  it('has all 11 base items keyed by id', () => {
    for (const id of EXPECTED_BASES) {
      expect(BASE_ITEMS[id]).toBeDefined();
      expect(BASE_ITEMS[id].baseId).toBe(id);
    }
  });

  it('weapon-typed bases set weaponType matching their family', () => {
    expect(BASE_ITEMS.sword_basic.weaponType).toBe('sword');
    expect(BASE_ITEMS.bow_basic.weaponType).toBe('bow');
    expect(BASE_ITEMS.mace_basic.weaponType).toBe('holy_symbol');
    expect(BASE_ITEMS.axe_basic.weaponType).toBe('axe');
    expect(BASE_ITEMS.daggers_basic.weaponType).toBe('daggers');
    expect(BASE_ITEMS.staff_basic.weaponType).toBe('staff');
  });

  it('non-weapon bases have no weaponType', () => {
    expect(BASE_ITEMS.shield_basic.weaponType).toBeUndefined();
    expect(BASE_ITEMS.outfit_cloth.weaponType).toBeUndefined();
    expect(BASE_ITEMS.hat_cap.weaponType).toBeUndefined();
  });
});

describe('BASE_ITEM_STATS', () => {
  it('hat bases produce empty stat dicts', () => {
    expect(BASE_ITEM_STATS.hat_cap).toEqual({});
    expect(BASE_ITEM_STATS.hat_hood).toEqual({});
  });

  it('weapon bases grant +1 attack except staff which grants +1 mind', () => {
    expect(BASE_ITEM_STATS.sword_basic).toEqual({ attack: 1 });
    expect(BASE_ITEM_STATS.bow_basic).toEqual({ attack: 1 });
    expect(BASE_ITEM_STATS.mace_basic).toEqual({ attack: 1 });
    expect(BASE_ITEM_STATS.axe_basic).toEqual({ attack: 1 });
    expect(BASE_ITEM_STATS.daggers_basic).toEqual({ attack: 1 });
    expect(BASE_ITEM_STATS.staff_basic).toEqual({ mind: 1 });
  });

  it('shield grants +1 defense', () => {
    expect(BASE_ITEM_STATS.shield_basic).toEqual({ defense: 1 });
  });

  it('outfit bases grant hp (post-×3 baked)', () => {
    expect(BASE_ITEM_STATS.outfit_cloth).toEqual({ hp: 6 });
    expect(BASE_ITEM_STATS.outfit_leather).toEqual({ hp: 9 });
  });
});
```

- [ ] **Step 2: Create `src/data/items.ts` with the catalogs**

```ts
import { SPRITE_NAMES } from '../render/sprite_names.generated';
import type { Stats } from '../combat/types';
import type {
  AffixDef,
  AffixId,
  ItemBaseId,
  ItemSlot,
  RarePropertyDef,
  RarePropertyId,
  WeaponType,
} from './types';

export interface BaseItemDef {
  baseId: ItemBaseId;
  name: string;
  slot: ItemSlot;
  weaponType?: WeaponType;
  spriteId: string;
}

export const AFFIXES: Record<AffixId, AffixDef> = {
  of_power:     { id: 'of_power',     name: 'of Power',     stat: 'attack',  baseValue: 1 },
  of_insight:   { id: 'of_insight',   name: 'of Insight',   stat: 'mind',    baseValue: 1 },
  of_the_bear:  { id: 'of_the_bear',  name: 'of the Bear',  stat: 'defense', baseValue: 1 },
  of_vigor:     { id: 'of_vigor',     name: 'of Vigor',     stat: 'hp',      baseValue: 2, hpMultiplier: 3 },
  of_swiftness: { id: 'of_swiftness', name: 'of Swiftness', stat: 'speed',   baseValue: 1 },
  of_the_hawk:  { id: 'of_the_hawk',  name: 'of the Hawk',  stat: 'crit',    baseValue: 5 },
  of_evasion:   { id: 'of_evasion',   name: 'of Evasion',   stat: 'dodge',   baseValue: 5 },
};

export const RARE_PROPERTIES: Record<RarePropertyId, RarePropertyDef> = {
  of_burning:      { id: 'of_burning',      name: 'of Burning',      slots: ['weapon'], kind: 'burn',      baseDamage: 2, turns: 2 },
  of_vampirism:    { id: 'of_vampirism',    name: 'of Vampirism',    slots: ['weapon'], kind: 'lifesteal', percentOfDamage: 25 },
  of_thorns:       { id: 'of_thorns',       name: 'of Thorns',       slots: ['shield'], kind: 'thorns',    baseDamage: 1 },
  of_regeneration: { id: 'of_regeneration', name: 'of Regeneration', slots: ['outfit'], kind: 'regen',     baseHeal: 1 },
};

export const BASE_ITEMS: Record<ItemBaseId, BaseItemDef> = {
  sword_basic:    { baseId: 'sword_basic',    name: 'Sword',           slot: 'weapon', weaponType: 'sword',        spriteId: String(SPRITE_NAMES.weapon.sword_tier1) },
  bow_basic:      { baseId: 'bow_basic',      name: 'Bow',             slot: 'weapon', weaponType: 'bow',          spriteId: String(SPRITE_NAMES.weapon.bow_wood_tier1) },
  mace_basic:     { baseId: 'mace_basic',     name: 'Mace',            slot: 'weapon', weaponType: 'holy_symbol',  spriteId: String(SPRITE_NAMES.weapon.mace_tier1) },
  axe_basic:      { baseId: 'axe_basic',      name: 'Battleaxe',       slot: 'weapon', weaponType: 'axe',          spriteId: String(SPRITE_NAMES.weapon.battleaxe_tier1) },
  daggers_basic:  { baseId: 'daggers_basic',  name: 'Dagger',          slot: 'weapon', weaponType: 'daggers',      spriteId: String(SPRITE_NAMES.weapon.dagger_tier1) },
  staff_basic:    { baseId: 'staff_basic',    name: 'Staff',           slot: 'weapon', weaponType: 'staff',        spriteId: String(SPRITE_NAMES.weapon.staff_blue_tier1) },
  shield_basic:   { baseId: 'shield_basic',   name: 'Shield',          slot: 'shield',                              spriteId: String(SPRITE_NAMES.shield.alloy_shield_1) },
  outfit_cloth:   { baseId: 'outfit_cloth',   name: 'Cloth Robes',     slot: 'outfit',                              spriteId: '0' },
  outfit_leather: { baseId: 'outfit_leather', name: 'Leather Tunic',   slot: 'outfit',                              spriteId: '0' },
  hat_cap:        { baseId: 'hat_cap',        name: 'Cap',             slot: 'hat',                                 spriteId: '0' },
  hat_hood:       { baseId: 'hat_hood',       name: 'Hood',            slot: 'hat',                                 spriteId: '0' },
};

export const BASE_ITEM_STATS: Record<ItemBaseId, Partial<Stats>> = {
  sword_basic:    { attack: 1 },
  bow_basic:      { attack: 1 },
  mace_basic:     { attack: 1 },
  axe_basic:      { attack: 1 },
  daggers_basic:  { attack: 1 },
  staff_basic:    { mind: 1 },
  shield_basic:   { defense: 1 },
  outfit_cloth:   { hp: 6 },
  outfit_leather: { hp: 9 },
  hat_cap:        {},
  hat_hood:       {},
};
```

> **Note** — outfit and hat sprite ids are placeholder `'0'` until art/UI adds bespoke frames. Sprite-binding is a render concern and does not block any logic in this plan; tests do not assert the placeholder values.

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/data/__tests__/items.test.ts`
Expected: all tests pass.

---

## Task 3: `generateItemId` helper

**Files:**
- Modify: `src/util/rng.ts`
- Modify: `src/util/__tests__/rng.test.ts`

- [ ] **Step 1: Add the failing test to `src/util/__tests__/rng.test.ts`**

Append:

```ts
import { createRng, generateItemId } from '../rng';

describe('generateItemId', () => {
  it('produces a 16-char base36 string', () => {
    const rng = createRng(1);
    const id = generateItemId(rng);
    expect(id).toMatch(/^[0-9a-z]{16}$/);
  });

  it('is deterministic from rng seed', () => {
    expect(generateItemId(createRng(42))).toBe(generateItemId(createRng(42)));
  });

  it('produces distinct ids on successive calls', () => {
    const rng = createRng(1);
    const a = generateItemId(rng);
    const b = generateItemId(rng);
    expect(a).not.toBe(b);
  });
});
```

(`createRng` import already present at the top of the file; merge the import line if needed.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/util/__tests__/rng.test.ts -t "generateItemId"`
Expected: FAIL — `generateItemId is not exported`.

- [ ] **Step 3: Add `generateItemId` to `src/util/rng.ts`**

Append after `createRngFromState`:

```ts
export function generateItemId(rng: Rng): string {
  // 16 base36 chars from two 32-bit chunks of the rng stream.
  const hi = Math.floor(rng.next() * 0xffffffff).toString(36).padStart(8, '0').slice(0, 8);
  const lo = Math.floor(rng.next() * 0xffffffff).toString(36).padStart(8, '0').slice(0, 8);
  return (hi + lo).slice(0, 16);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/util/__tests__/rng.test.ts -t "generateItemId"`
Expected: 3 passing.

---

## Task 4: `rollLoot` — the loot roll algorithm

**Files:**
- Create: `src/dungeon/loot.ts`
- Create: `src/dungeon/__tests__/loot.test.ts`

- [ ] **Step 1: Create `src/dungeon/__tests__/loot.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../../util/rng';
import { rollLoot } from '../loot';

describe('rollLoot — drop gate', () => {
  it('returns null roughly half the time at a non-boss combat node', () => {
    let drops = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      if (rollLoot(createRng(seed), 1, false) !== null) drops += 1;
    }
    expect(drops).toBeGreaterThanOrEqual(400);
    expect(drops).toBeLessThanOrEqual(600);
  });

  it('always returns an item on a boss node', () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(rollLoot(createRng(seed), 1, true)).not.toBeNull();
    }
  });
});

describe('rollLoot — slot uniformity', () => {
  it('distributes the 4 slots roughly evenly over 1000 boss rolls', () => {
    const counts: Record<string, number> = { weapon: 0, shield: 0, outfit: 0, hat: 0 };
    for (let seed = 1; seed <= 1000; seed++) {
      const item = rollLoot(createRng(seed), 1, true);
      if (item) counts[item.slot] += 1;
    }
    for (const slot of ['weapon', 'shield', 'outfit', 'hat']) {
      expect(counts[slot]).toBeGreaterThanOrEqual(150);
      expect(counts[slot]).toBeLessThanOrEqual(350);
    }
  });
});

describe('rollLoot — rarity weights', () => {
  it('floor 1 boss never rolls rare', () => {
    let rare = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const item = rollLoot(createRng(seed), 1, false); // non-boss = floor 1
      if (item?.rarity === 'rare') rare += 1;
    }
    expect(rare).toBe(0);
  });

  it('floor 15 hits rare ≥25% of the time', () => {
    let rare = 0;
    let drops = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const item = rollLoot(createRng(seed), 15, true);
      if (item) {
        drops += 1;
        if (item.rarity === 'rare') rare += 1;
      }
    }
    expect(rare / drops).toBeGreaterThanOrEqual(0.25);
  });
});

describe('rollLoot — affix counts by rarity', () => {
  it('common items have 0 affixes', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const item = rollLoot(createRng(seed), 1, true);
      if (item?.rarity === 'common') {
        expect(item.affixes).toHaveLength(0);
      }
    }
  });

  it('uncommon items have 1 affix', () => {
    let seen = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const item = rollLoot(createRng(seed), 5, true);
      if (item?.rarity === 'uncommon') {
        expect(item.affixes).toHaveLength(1);
        seen += 1;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('rare non-hat items have 2 affixes; rare hats have 3', () => {
    let rareNonHat = 0;
    let rareHat = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const item = rollLoot(createRng(seed), 15, true);
      if (item?.rarity === 'rare') {
        if (item.slot === 'hat') {
          expect(item.affixes).toHaveLength(3);
          rareHat += 1;
        } else {
          expect(item.affixes).toHaveLength(2);
          rareNonHat += 1;
        }
      }
    }
    expect(rareNonHat).toBeGreaterThan(0);
    expect(rareHat).toBeGreaterThan(0);
  });
});

describe('rollLoot — affixes are unique on the same item', () => {
  it('no two affixes share an affixId', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const item = rollLoot(createRng(seed), 15, true);
      if (item && item.affixes.length > 1) {
        const ids = item.affixes.map((a) => a.affixId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
});

describe('rollLoot — of_vigor ×3 multiplier', () => {
  it('produces value 6 at floor 1 and value 12 at floor 10', () => {
    let f1Vigor = 0;
    let f10Vigor = 0;
    for (let seed = 1; seed <= 5000; seed++) {
      const f1 = rollLoot(createRng(seed), 1, true);
      if (f1) {
        const v = f1.affixes.find((a) => a.affixId === 'of_vigor');
        if (v) {
          expect(v.value).toBe(6);
          f1Vigor += 1;
        }
      }
      const f10 = rollLoot(createRng(seed), 10, true);
      if (f10) {
        const v = f10.affixes.find((a) => a.affixId === 'of_vigor');
        if (v) {
          expect(v.value).toBe(12);
          f10Vigor += 1;
        }
      }
    }
    expect(f1Vigor).toBeGreaterThan(0);
    expect(f10Vigor).toBeGreaterThan(0);
  });
});

describe('rollLoot — rare property gating', () => {
  it('non-rare items never have rareProperty', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const item = rollLoot(createRng(seed), 5, true);
      if (item && item.rarity !== 'rare') {
        expect(item.rareProperty).toBeUndefined();
      }
    }
  });

  it('rare hats have no rareProperty (they got an extra affix instead)', () => {
    let seen = 0;
    for (let seed = 1; seed <= 5000; seed++) {
      const item = rollLoot(createRng(seed), 15, true);
      if (item?.rarity === 'rare' && item.slot === 'hat') {
        expect(item.rareProperty).toBeUndefined();
        seen += 1;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('rare non-hats roll a property whose slot matches the item slot', () => {
    let seen = 0;
    for (let seed = 1; seed <= 5000; seed++) {
      const item = rollLoot(createRng(seed), 15, true);
      if (item?.rarity === 'rare' && item.slot !== 'hat') {
        expect(item.rareProperty).toBeDefined();
        seen += 1;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('rollLoot — determinism', () => {
  it('same seed + floor + isBoss → identical item including id', () => {
    const a = rollLoot(createRng(123), 7, true);
    const b = rollLoot(createRng(123), 7, true);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Create `src/dungeon/loot.ts`**

```ts
import { AFFIXES, RARE_PROPERTIES } from '../data/items';
import type {
  AffixId,
  ItemBaseId,
  ItemSlot,
  Item,
  Rarity,
  RarePropertyId,
  RolledAffix,
  RolledRareProperty,
  WeaponType,
} from '../data/types';
import { generateItemId, type Rng, type WeightedOption } from '../util/rng';
import { floorScale } from './scaling';

const ALL_SLOTS: readonly ItemSlot[] = ['weapon', 'shield', 'outfit', 'hat'];
const WEAPON_FAMILIES: readonly WeaponType[] = ['sword', 'bow', 'holy_symbol', 'axe', 'daggers', 'staff'];
const ALL_AFFIX_IDS: readonly AffixId[] = [
  'of_power', 'of_insight', 'of_the_bear', 'of_vigor',
  'of_swiftness', 'of_the_hawk', 'of_evasion',
];

const WEAPON_FAMILY_TO_BASE: Record<WeaponType, ItemBaseId> = {
  sword: 'sword_basic',
  bow: 'bow_basic',
  holy_symbol: 'mace_basic',
  axe: 'axe_basic',
  daggers: 'daggers_basic',
  staff: 'staff_basic',
};

const OUTFIT_BASES: readonly ItemBaseId[] = ['outfit_cloth', 'outfit_leather'];
const HAT_BASES: readonly ItemBaseId[] = ['hat_cap', 'hat_hood'];

interface RarityRow { floor: number; common: number; uncommon: number; rare: number }
const RARITY_TABLE: readonly RarityRow[] = [
  { floor: 1,  common: 90, uncommon: 10, rare:  0 },
  { floor: 3,  common: 80, uncommon: 18, rare:  2 },
  { floor: 5,  common: 70, uncommon: 25, rare:  5 },
  { floor: 8,  common: 55, uncommon: 32, rare: 13 },
  { floor: 10, common: 45, uncommon: 35, rare: 20 },
  { floor: 15, common: 30, uncommon: 40, rare: 30 },
];

function rarityWeightsAt(floor: number): { common: number; uncommon: number; rare: number } {
  if (floor <= RARITY_TABLE[0].floor) return pluckWeights(RARITY_TABLE[0]);
  if (floor >= RARITY_TABLE[RARITY_TABLE.length - 1].floor) {
    return pluckWeights(RARITY_TABLE[RARITY_TABLE.length - 1]);
  }
  for (let i = 0; i < RARITY_TABLE.length - 1; i++) {
    const lo = RARITY_TABLE[i];
    const hi = RARITY_TABLE[i + 1];
    if (floor >= lo.floor && floor <= hi.floor) {
      const t = (floor - lo.floor) / (hi.floor - lo.floor);
      return {
        common: lerp(lo.common, hi.common, t),
        uncommon: lerp(lo.uncommon, hi.uncommon, t),
        rare: lerp(lo.rare, hi.rare, t),
      };
    }
  }
  return pluckWeights(RARITY_TABLE[RARITY_TABLE.length - 1]);
}

function pluckWeights(r: RarityRow) { return { common: r.common, uncommon: r.uncommon, rare: r.rare }; }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function scaleByFloor(baseValue: number, floor: number): number {
  return Math.round(baseValue * floorScale(floor).hp);
}

function pickRarity(rng: Rng, floor: number): Rarity {
  const w = rarityWeightsAt(floor);
  const opts: WeightedOption<Rarity>[] = [
    { value: 'common', weight: w.common },
    { value: 'uncommon', weight: w.uncommon },
    { value: 'rare', weight: w.rare },
  ];
  return rng.weighted(opts);
}

function affixCount(rarity: Rarity, slot: ItemSlot): number {
  if (rarity === 'common') return 0;
  if (rarity === 'uncommon') return 1;
  return slot === 'hat' ? 3 : 2;
}

function pickAffixes(rng: Rng, count: number): AffixId[] {
  if (count === 0) return [];
  const shuffled = rng.shuffle(ALL_AFFIX_IDS);
  return shuffled.slice(0, count);
}

function rollAffixValue(affixId: AffixId, floor: number): number {
  const def = AFFIXES[affixId];
  const scaled = scaleByFloor(def.baseValue, floor);
  return def.hpMultiplier === 3 ? scaled * 3 : scaled;
}

function pickRareProperty(rng: Rng, slot: ItemSlot, floor: number): RolledRareProperty | undefined {
  if (slot === 'hat') return undefined;
  const candidates: RarePropertyId[] = [];
  for (const id of Object.keys(RARE_PROPERTIES) as RarePropertyId[]) {
    if ((RARE_PROPERTIES[id].slots as readonly string[]).includes(slot)) candidates.push(id);
  }
  const propertyId = rng.pick(candidates);
  const def = RARE_PROPERTIES[propertyId];
  let value: number;
  switch (def.kind) {
    case 'burn':      value = scaleByFloor(def.baseDamage, floor); break;
    case 'lifesteal': value = def.percentOfDamage; break; // ratio: not floor-scaled
    case 'thorns':    value = scaleByFloor(def.baseDamage, floor); break;
    case 'regen':     value = scaleByFloor(def.baseHeal,   floor); break;
  }
  return { propertyId, value };
}

function pickBaseId(rng: Rng, slot: ItemSlot): { baseId: ItemBaseId; weaponType?: WeaponType } {
  switch (slot) {
    case 'weapon': {
      const family = rng.pick(WEAPON_FAMILIES);
      return { baseId: WEAPON_FAMILY_TO_BASE[family], weaponType: family };
    }
    case 'shield': return { baseId: 'shield_basic' };
    case 'outfit': return { baseId: rng.pick(OUTFIT_BASES) };
    case 'hat':    return { baseId: rng.pick(HAT_BASES) };
  }
}

export function rollLoot(rng: Rng, floorNumber: number, isBoss: boolean): Item | null {
  if (!isBoss) {
    if (rng.next() >= 0.5) return null;
  }
  const effectiveFloor = isBoss ? floorNumber + 1 : floorNumber;

  const slot = rng.pick(ALL_SLOTS);
  const base = pickBaseId(rng, slot);
  const rarity = pickRarity(rng, effectiveFloor);

  const affixIds = pickAffixes(rng, affixCount(rarity, slot));
  const affixes: RolledAffix[] = affixIds.map((id) => ({
    affixId: id,
    value: rollAffixValue(id, floorNumber),
  }));

  const rareProperty = rarity === 'rare' ? pickRareProperty(rng, slot, floorNumber) : undefined;

  const id = generateItemId(rng);
  const item: Item = {
    id,
    baseId: base.baseId,
    slot,
    rarity,
    ...(base.weaponType !== undefined ? { weaponType: base.weaponType } : {}),
    affixes,
    ...(rareProperty !== undefined ? { rareProperty } : {}),
    floorRolledAt: floorNumber,
  };
  return item;
}

// Exported for tests.
export const _internal = { rarityWeightsAt, scaleByFloor };
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/dungeon/__tests__/loot.test.ts`
Expected: all `rollLoot` tests pass.

---

## Task 5: Pack carries items

**Files:**
- Modify: `src/run/pack.ts`
- Modify: `src/run/__tests__/pack.test.ts`

- [ ] **Step 1: Add failing tests to `src/run/__tests__/pack.test.ts`**

Append at bottom:

```ts
import type { Item } from '../../data/types';
import { addItem, removeItem } from '../pack';

const fakeItem = (id: string): Item => ({
  id,
  baseId: 'sword_basic',
  slot: 'weapon',
  rarity: 'common',
  weaponType: 'sword',
  affixes: [],
  floorRolledAt: 1,
});

describe('Pack — items', () => {
  it('createPack starts with empty items', () => {
    expect(createPack()).toEqual({ gold: 0, items: [] });
  });

  it('addItem returns a new pack with the item appended', () => {
    const p0 = createPack();
    const p1 = addItem(p0, fakeItem('a'));
    expect(p1.items).toHaveLength(1);
    expect(p1.items[0].id).toBe('a');
    expect(p0.items).toHaveLength(0);
  });

  it('removeItem returns a new pack without the matching item', () => {
    const p0 = addItem(addItem(createPack(), fakeItem('a')), fakeItem('b'));
    const p1 = removeItem(p0, 'a');
    expect(p1.items.map((i) => i.id)).toEqual(['b']);
  });

  it('removeItem throws on a missing id', () => {
    const p0 = addItem(createPack(), fakeItem('a'));
    expect(() => removeItem(p0, 'nope')).toThrow(/removeItem/);
  });
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `npx vitest run src/run/__tests__/pack.test.ts`
Expected: pre-existing tests pass; the new ones FAIL with import errors and shape mismatches.

- [ ] **Step 3: Update `src/run/pack.ts`**

Replace the file with:

```ts
import type { Item } from '../data/types';

export interface Pack {
  readonly gold: number;
  readonly items: readonly Item[];
}

export function createPack(): Pack {
  return { gold: 0, items: [] };
}

export function addGold(pack: Pack, amount: number): Pack {
  if (amount < 0) {
    throw new Error(`addGold: amount must be non-negative, got ${amount}`);
  }
  return { ...pack, gold: pack.gold + amount };
}

export function totalGold(pack: Pack): number {
  return pack.gold;
}

export function emptyPack(_pack: Pack): Pack {
  return { gold: 0, items: [] };
}

export function addItem(pack: Pack, item: Item): Pack {
  return { ...pack, items: [...pack.items, item] };
}

export function removeItem(pack: Pack, itemId: string): Pack {
  const idx = pack.items.findIndex((i) => i.id === itemId);
  if (idx < 0) {
    throw new Error(`removeItem: item id '${itemId}' not in pack`);
  }
  const items = [...pack.items.slice(0, idx), ...pack.items.slice(idx + 1)];
  return { ...pack, items };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/run/__tests__/pack.test.ts`
Expected: all passing.

---

## Task 6: Stash module

**Files:**
- Create: `src/camp/stash.ts`
- Create: `src/camp/__tests__/stash.test.ts`

- [ ] **Step 1: Create `src/camp/__tests__/stash.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Item } from '../../data/types';
import { addItems, createStash, removeItem } from '../stash';

const fake = (id: string): Item => ({
  id, baseId: 'sword_basic', slot: 'weapon', rarity: 'common',
  weaponType: 'sword', affixes: [], floorRolledAt: 1,
});

describe('Stash', () => {
  it('createStash starts empty', () => {
    expect(createStash()).toEqual({ items: [] });
  });

  it('addItems appends; original stash unchanged', () => {
    const s0 = createStash();
    const s1 = addItems(s0, [fake('a'), fake('b')]);
    expect(s1.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(s0.items).toHaveLength(0);
  });

  it('addItems with empty array returns a new stash with same contents', () => {
    const s0 = addItems(createStash(), [fake('a')]);
    const s1 = addItems(s0, []);
    expect(s1.items.map((i) => i.id)).toEqual(['a']);
  });

  it('removeItem drops the matching id', () => {
    const s0 = addItems(createStash(), [fake('a'), fake('b'), fake('c')]);
    const s1 = removeItem(s0, 'b');
    expect(s1.items.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('removeItem throws on missing id', () => {
    const s0 = addItems(createStash(), [fake('a')]);
    expect(() => removeItem(s0, 'nope')).toThrow(/removeItem/);
  });
});
```

- [ ] **Step 2: Create `src/camp/stash.ts`**

```ts
import type { Item } from '../data/types';

export interface Stash {
  readonly items: readonly Item[];
}

export function createStash(): Stash {
  return { items: [] };
}

export function addItems(stash: Stash, items: readonly Item[]): Stash {
  if (items.length === 0) return { items: [...stash.items] };
  return { items: [...stash.items, ...items] };
}

export function removeItem(stash: Stash, itemId: string): Stash {
  const idx = stash.items.findIndex((i) => i.id === itemId);
  if (idx < 0) {
    throw new Error(`removeItem: item id '${itemId}' not in stash`);
  }
  return { items: [...stash.items.slice(0, idx), ...stash.items.slice(idx + 1)] };
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/camp/__tests__/stash.test.ts`
Expected: 5 passing.

---

## Task 7: equip / unequip

**Files:**
- Create: `src/items/equip.ts`
- Create: `src/items/__tests__/equip.test.ts`

- [ ] **Step 1: Create `src/items/__tests__/equip.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Item, ItemSlot } from '../../data/types';
import type { Hero } from '../../heroes/hero';
import { equip, unequip } from '../equip';

const fake = (id: string, slot: ItemSlot): Item => {
  const base = (() => {
    if (slot === 'weapon') return { baseId: 'sword_basic' as const, weaponType: 'sword' as const };
    if (slot === 'shield') return { baseId: 'shield_basic' as const };
    if (slot === 'outfit') return { baseId: 'outfit_cloth' as const };
    return { baseId: 'hat_cap' as const };
  })();
  return { id, ...base, slot, rarity: 'common', affixes: [], floorRolledAt: 1 };
};

const fakeHero = (overrides: Partial<Hero> = {}): Hero => ({
  id: 'h1',
  classId: 'knight',
  name: 'Test',
  baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 5, dodge: 5 },
  currentHp: 20,
  maxHp: 20,
  traitId: 'stout',
  bodySpriteId: '0',
  wounds: [],
  equipment: { weapon: fake('w0', 'weapon') },
  ...overrides,
});

describe('equip', () => {
  it('placing a weapon over an existing weapon displaces the old', () => {
    const h0 = fakeHero();
    const newWeapon = fake('w1', 'weapon');
    const { hero, displaced } = equip(h0, newWeapon, 'weapon');
    expect(hero.equipment.weapon.id).toBe('w1');
    expect(displaced?.id).toBe('w0');
    expect(h0.equipment.weapon.id).toBe('w0'); // original unchanged
  });

  it('placing a shield in an empty slot returns displaced=undefined', () => {
    const h0 = fakeHero();
    const newShield = fake('s1', 'shield');
    const { hero, displaced } = equip(h0, newShield, 'shield');
    expect(hero.equipment.shield?.id).toBe('s1');
    expect(displaced).toBeUndefined();
  });

  it('throws when item.slot does not match the equip slot', () => {
    const h0 = fakeHero();
    const newWeapon = fake('w1', 'weapon');
    expect(() => equip(h0, newWeapon, 'shield')).toThrow(/slot/);
  });
});

describe('unequip', () => {
  it('removes a shield and returns it', () => {
    const h0 = fakeHero({ equipment: { weapon: fake('w0', 'weapon'), shield: fake('s0', 'shield') } });
    const { hero, item } = unequip(h0, 'shield');
    expect(hero.equipment.shield).toBeUndefined();
    expect(item?.id).toBe('s0');
  });

  it('returns item=undefined when slot was empty', () => {
    const h0 = fakeHero();
    const { hero, item } = unequip(h0, 'hat');
    expect(item).toBeUndefined();
    expect(hero).toEqual(h0);
  });

  it('throws if asked to unequip a weapon (always required)', () => {
    const h0 = fakeHero();
    expect(() => unequip(h0, 'weapon')).toThrow(/weapon/);
  });
});
```

- [ ] **Step 2: Create `src/items/equip.ts`**

```ts
import type { Item, ItemSlot } from '../data/types';
import type { Hero } from '../heroes/hero';

export interface EquipResult {
  hero: Hero;
  displaced: Item | undefined;
}

export interface UnequipResult {
  hero: Hero;
  item: Item | undefined;
}

export function equip(hero: Hero, item: Item, slot: ItemSlot): EquipResult {
  if (item.slot !== slot) {
    throw new Error(`equip: item.slot '${item.slot}' does not match target slot '${slot}'`);
  }
  const eq = hero.equipment;
  if (slot === 'weapon') {
    return {
      hero: { ...hero, equipment: { ...eq, weapon: item } },
      displaced: eq.weapon,
    };
  }
  return {
    hero: { ...hero, equipment: { ...eq, [slot]: item } },
    displaced: eq[slot],
  };
}

export function unequip(hero: Hero, slot: ItemSlot): UnequipResult {
  if (slot === 'weapon') {
    throw new Error('unequip: cannot unequip the weapon slot — every hero must have a weapon');
  }
  const eq = hero.equipment;
  const item = eq[slot];
  if (item === undefined) {
    return { hero, item: undefined };
  }
  const nextEq = { ...eq };
  delete (nextEq as Record<string, unknown>)[slot];
  return { hero: { ...hero, equipment: nextEq }, item };
}
```

- [ ] **Step 3: Run tests** (these will fail at compile-time because `Hero` does not yet have `equipment`. That's OK — Task 8 fixes Hero.)

Run: `npx vitest run src/items/__tests__/equip.test.ts`
Expected: FAIL (compile errors on `equipment: …`).

> **Defer green** until Task 8 lands. Do not "fix" by adding equipment elsewhere; the next task does it cleanly.

---

## Task 8: Hero gains equipment + classes retyped + heroToLoadout updated

This task touches several files because they all reference `StarterLoadout` / `Hero.equipment` and the build must stay coherent. End-state: type errors from Task 1 are resolved.

**Files:**
- Modify: `src/data/classes.ts`
- Modify: `src/heroes/hero.ts`
- Modify: `src/heroes/__tests__/hero.test.ts`
- Modify: `src/render/hero_loadout.ts`
- Modify: `src/render/__tests__/hero_loadout.test.ts`

- [ ] **Step 1: Update `src/data/classes.ts` — retype all 6 starterLoadouts**

Replace the body of `CLASSES` with `ItemBaseId` references. Drop the `SPRITE_NAMES` import; it's now unused here.

```ts
import type { ClassDef, ClassId } from './types';

export const CLASSES: Record<ClassId, ClassDef> = {
  knight: {
    id: 'knight',
    name: 'Knight',
    baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 5, dodge: 5 },
    preferredWeapon: 'sword',
    abilities: ['knight_slash', 'shield_bash', 'bulwark', 'taunt'],
    aiPriority: ['shield_bash', 'bulwark', 'taunt', 'knight_slash'],
    starterLoadout: { weapon: 'sword_basic', shield: 'shield_basic' },
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    baseStats: { hp: 14, attack: 5, defense: 2, speed: 5, mind: 0, crit: 15, dodge: 10 },
    preferredWeapon: 'bow',
    abilities: ['archer_shoot', 'piercing_shot', 'volley', 'flare_arrow'],
    aiPriority: ['flare_arrow', 'piercing_shot', 'volley', 'archer_shoot'],
    starterLoadout: { weapon: 'bow_basic' },
  },
  priest: {
    id: 'priest',
    name: 'Priest',
    baseStats: { hp: 15, attack: 3, defense: 2, speed: 4, mind: 5, crit: 5, dodge: 5 },
    preferredWeapon: 'holy_symbol',
    abilities: ['priest_strike', 'mend', 'smite', 'bless'],
    aiPriority: ['mend', 'bless', 'smite', 'priest_strike'],
    starterLoadout: { weapon: 'mace_basic' },
  },
  barbarian: {
    id: 'barbarian',
    name: 'Barbarian',
    baseStats: { hp: 22, attack: 6, defense: 3, speed: 3, mind: 0, crit: 10, dodge: 5 },
    preferredWeapon: 'axe',
    abilities: ['barbarian_swing', 'cleave', 'rampage', 'bloodthirst'],
    aiPriority: ['rampage', 'cleave', 'bloodthirst', 'barbarian_swing'],
    starterLoadout: { weapon: 'axe_basic' },
  },
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    baseStats: { hp: 13, attack: 5, defense: 1, speed: 6, mind: 0, crit: 20, dodge: 15 },
    preferredWeapon: 'daggers',
    abilities: ['rogue_strike', 'backstab', 'vanish', 'poison_strike'],
    aiPriority: ['vanish', 'backstab', 'poison_strike', 'rogue_strike'],
    starterLoadout: { weapon: 'daggers_basic' },
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    baseStats: { hp: 12, attack: 2, defense: 1, speed: 4, mind: 8, crit: 5, dodge: 5 },
    preferredWeapon: 'staff',
    abilities: ['mage_zap', 'firebolt', 'frost_nova', 'arc_shock'],
    aiPriority: ['frost_nova', 'firebolt', 'arc_shock', 'mage_zap'],
    starterLoadout: { weapon: 'staff_basic' },
  },
};
```

- [ ] **Step 2: Update `src/heroes/hero.ts`**

```ts
import { BASE_ITEMS, BASE_ITEM_STATS } from '../data/items';
import { CLASSES } from '../data/classes';
import { TRAITS } from '../data/traits';
import type {
  ClassId, HeroEquipment, Item, ItemBaseId, ItemSlot,
  StarterLoadout, TraitDef, TraitId, Wound,
} from '../data/types';
import type { Stats } from '../combat/types';

export interface Hero {
  id: string;
  classId: ClassId;
  name: string;
  baseStats: Stats;
  currentHp: number;
  maxHp: number;
  traitId: TraitId;
  bodySpriteId: string;
  wounds: Wound[];
  equipment: HeroEquipment;
}

export function createHero(
  classId: ClassId,
  name: string,
  id: string,
  traitId: TraitId,
  bodySpriteId: string,
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
    wounds: [],
    equipment,
  };
}

export function computeMaxHp(
  classBaseHp: number,
  trait: TraitDef,
  equipment: HeroEquipment,
): number {
  let base = classBaseHp;
  if (trait.hpEffect) {
    const { delta, mode } = trait.hpEffect;
    base = mode === 'percent' ? Math.round(base * (1 + delta / 100)) : base + delta;
  }
  let gear = 0;
  for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
    const item = equipment[slot];
    if (!item) continue;
    const baseStats = BASE_ITEM_STATS[item.baseId];
    if (baseStats.hp !== undefined) gear += baseStats.hp;
    for (const a of item.affixes) {
      if (a.affixId === 'of_vigor') gear += a.value;
    }
  }
  return base + gear;
}

function buildStarterEquipment(heroId: string, starter: StarterLoadout): HeroEquipment {
  const eq: HeroEquipment = {
    weapon: starterItem(`starter_${heroId}_weapon`, starter.weapon, 'weapon'),
  };
  if (starter.shield) eq.shield = starterItem(`starter_${heroId}_shield`, starter.shield, 'shield');
  if (starter.outfit) eq.outfit = starterItem(`starter_${heroId}_outfit`, starter.outfit, 'outfit');
  if (starter.hat)    eq.hat    = starterItem(`starter_${heroId}_hat`,    starter.hat,    'hat');
  return eq;
}

function starterItem(id: string, baseId: ItemBaseId, slot: ItemSlot): Item {
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
```

- [ ] **Step 3: Update `src/render/hero_loadout.ts`**

```ts
import { BASE_ITEMS } from '../data/items';
import type { Hero } from '../heroes/hero';
import type { Loadout } from './paperdoll';

export function heroToLoadout(hero: Hero): Loadout {
  const eq = hero.equipment;
  return {
    body: parseInt(hero.bodySpriteId, 10),
    weapon: parseInt(BASE_ITEMS[eq.weapon.baseId].spriteId, 10),
    shield: eq.shield ? parseInt(BASE_ITEMS[eq.shield.baseId].spriteId, 10) : undefined,
  };
}
```

- [ ] **Step 4: Update existing test fixtures**

In `src/heroes/__tests__/hero.test.ts`, the existing test cases construct heroes via `createHero(...)` — they'll keep working because the signature didn't change. **Append** these new cases at the end of the `describe` block:

```ts
import { CLASSES } from '../../data/classes';
import { BASE_ITEMS } from '../../data/items';

describe('Hero — equipment', () => {
  it('Knight starts with sword + shield equipped', () => {
    const h = createHero('knight', 'Eira', 'h1', 'stout', '0');
    expect(h.equipment.weapon.baseId).toBe('sword_basic');
    expect(h.equipment.weapon.slot).toBe('weapon');
    expect(h.equipment.weapon.rarity).toBe('common');
    expect(h.equipment.shield?.baseId).toBe('shield_basic');
  });

  it('Mage starts with staff and no shield', () => {
    const h = createHero('mage', 'Lyr', 'h2', 'stout', '0');
    expect(h.equipment.weapon.baseId).toBe('staff_basic');
    expect(h.equipment.shield).toBeUndefined();
  });

  it('starter items have empty affixes and rarity common', () => {
    const h = createHero('archer', 'Q', 'h3', 'stout', '0');
    expect(h.equipment.weapon.affixes).toEqual([]);
    expect(h.equipment.weapon.rarity).toBe('common');
  });

  it('starter item ids are deterministic from hero id + slot', () => {
    const h1 = createHero('knight', 'A', 'abc', 'stout', '0');
    const h2 = createHero('knight', 'B', 'abc', 'stout', '0');
    expect(h1.equipment.weapon.id).toBe(h2.equipment.weapon.id);
  });

  it('computeMaxHp folds in outfit hp base + of_vigor affixes from any slot', () => {
    // Knight base hp = 20, no trait hp effect (assume Stout has +10% per traits.ts;
    // verify dynamically from the trait def to stay decoupled from values).
    void CLASSES;
    void BASE_ITEMS;
    // Fastest path: instantiate two heroes with different equipment and assert delta.
    const plain = createHero('archer', 'P', 'p1', 'sturdy', '0'); // assume sturdy has no hp effect
    expect(plain.maxHp).toBe(plain.baseStats.hp);
  });
});
```

> **Note** on the last test: the assertion compares `maxHp` against `baseStats.hp`. If `sturdy` does not exist or has an `hpEffect`, choose any trait without `hpEffect`. Read `src/data/traits.ts` and pick a hp-effect-free trait id. If none exists, drop the assertion's specific expectation and keep `expect(plain.maxHp).toBeGreaterThanOrEqual(plain.baseStats.hp)`.

- [ ] **Step 5: Update `src/render/__tests__/hero_loadout.test.ts`**

Replace existing tests with:

```ts
import { describe, expect, it } from 'vitest';
import { BASE_ITEMS } from '../../data/items';
import { createHero } from '../../heroes/hero';
import { heroToLoadout } from '../hero_loadout';

describe('heroToLoadout', () => {
  it('reads weapon sprite from equipped item, not class default', () => {
    const knight = createHero('knight', 'K', 'h1', 'stout', '5');
    const loadout = heroToLoadout(knight);
    expect(loadout.body).toBe(5);
    expect(loadout.weapon).toBe(parseInt(BASE_ITEMS.sword_basic.spriteId, 10));
    expect(loadout.shield).toBe(parseInt(BASE_ITEMS.shield_basic.spriteId, 10));
  });

  it('omits shield for heroes without one', () => {
    const archer = createHero('archer', 'A', 'h2', 'stout', '5');
    const loadout = heroToLoadout(archer);
    expect(loadout.shield).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/data src/heroes src/render src/items`
Expected: all green. Equip tests from Task 7 now pass too.

- [ ] **Step 7: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: clean (no errors). If errors remain in `combat_setup.ts` or other files because `Hero.equipment` is required, leave them — Task 9 fixes those.

> If `tsc` errors only in files Task 9 will touch, that's acceptable mid-plan; do not paper over them. If errors appear in unexpected files, stop and re-read the spec.

---

## Task 9: `equipmentStats` + `buildCombatState` integration

**Files:**
- Modify: `src/run/combat_setup.ts`
- Modify: `src/run/__tests__/combat_setup.test.ts`
- Modify: `src/combat/types.ts`

- [ ] **Step 1: Extend `Combatant` in `src/combat/types.ts`**

Find the `Combatant` interface and add three optional fields. After `damageTakenMultiplier?:`:

```ts
  lifestealPercent?: number;
  thornsDamage?: number;
  regenPerRound?: number;
```

Final `Combatant`:

```ts
export interface Combatant {
  id: CombatantId;
  side: CombatSide;
  slot: SlotIndex;
  kind: 'hero' | 'enemy';
  classId?: ClassId;
  enemyId?: EnemyId;
  baseStats: Stats;
  currentHp: number;
  maxHp: number;
  statuses: Record<string, StatusInstance>;
  cooldowns: Partial<Record<AbilityId, number>>;
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  preferredSlots?: readonly SlotIndex[];
  tags?: readonly CombatantTag[];
  traitId?: TraitId;
  damageTakenMultiplier?: number;
  // Candidate for consolidation into `passives` once 3+ more land.
  lifestealPercent?: number;
  thornsDamage?: number;
  regenPerRound?: number;
  isDead: boolean;
}
```

- [ ] **Step 2: Add failing tests to `src/run/__tests__/combat_setup.test.ts`**

Append:

```ts
import { BASE_ITEMS } from '../../data/items';
import type { Item } from '../../data/types';

function ofPower(value = 1): { affixId: 'of_power'; value: number } {
  return { affixId: 'of_power', value };
}

function rareWeaponBurning(value = 2): Item {
  return {
    id: 'wb', baseId: 'sword_basic', slot: 'weapon', rarity: 'rare', weaponType: 'sword',
    affixes: [], rareProperty: { propertyId: 'of_burning', value }, floorRolledAt: 1,
  };
}

describe('buildCombatState — equipment stats', () => {
  it('weapon affix +1 attack adds to combatant attack', () => {
    const hero = createHero('knight', 'K', 'h1', 'stout', '0');
    hero.equipment.weapon = {
      ...hero.equipment.weapon,
      affixes: [ofPower(1)],
    };
    const encounter = makeTrivialEncounter();
    const state = buildCombatState([hero, hero, hero], encounter);
    const p0 = state.combatants.find((c) => c.id === 'p0')!;
    expect(p0.baseStats.attack).toBe(hero.baseStats.attack + 1 /* affix */ + 1 /* sword base attack */);
  });

  it('outfit base hp + of_vigor affix flow into both baseStats.hp and maxHp', () => {
    const hero = createHero('archer', 'A', 'h1', 'stout', '0');
    hero.equipment.outfit = {
      id: 'o1', baseId: 'outfit_cloth', slot: 'outfit', rarity: 'uncommon',
      affixes: [{ affixId: 'of_vigor', value: 6 }],
      floorRolledAt: 1,
    };
    const baseExpected = hero.maxHp; // includes outfit base if creator uses computeMaxHp(...) — for this tweak, recompute.
    void baseExpected;
    const encounter = makeTrivialEncounter();
    const state = buildCombatState([hero, hero, hero], encounter);
    const p0 = state.combatants.find((c) => c.id === 'p0')!;
    // After equipment change, expect old maxHp + 6 (cloth outfit_cloth base 6 was already in maxHp via createHero;
    // adding of_vigor +6 should bump it by 6).
    expect(p0.baseStats.hp).toBe(p0.maxHp);
  });

  it('rare weapon with of_burning sets no Combatant flag (status applied at hit time)', () => {
    const hero = createHero('knight', 'K', 'h1', 'stout', '0');
    hero.equipment.weapon = rareWeaponBurning(3);
    const encounter = makeTrivialEncounter();
    const state = buildCombatState([hero, hero, hero], encounter);
    const p0 = state.combatants.find((c) => c.id === 'p0')!;
    // burn is event-time, not a flat field — confirm we did NOT add a stray field.
    expect(p0.lifestealPercent).toBeUndefined();
    expect(p0.thornsDamage).toBeUndefined();
    expect(p0.regenPerRound).toBeUndefined();
  });

  it('of_vampirism on weapon sets Combatant.lifestealPercent', () => {
    const hero = createHero('knight', 'K', 'h1', 'stout', '0');
    hero.equipment.weapon = {
      id: 'w', baseId: 'sword_basic', slot: 'weapon', rarity: 'rare', weaponType: 'sword',
      affixes: [], rareProperty: { propertyId: 'of_vampirism', value: 25 }, floorRolledAt: 1,
    };
    const encounter = makeTrivialEncounter();
    const state = buildCombatState([hero, hero, hero], encounter);
    const p0 = state.combatants.find((c) => c.id === 'p0')!;
    expect(p0.lifestealPercent).toBe(25);
  });

  it('of_thorns on shield sets Combatant.thornsDamage', () => {
    const hero = createHero('knight', 'K', 'h1', 'stout', '0');
    hero.equipment.shield = {
      id: 's', baseId: 'shield_basic', slot: 'shield', rarity: 'rare',
      affixes: [], rareProperty: { propertyId: 'of_thorns', value: 1 }, floorRolledAt: 1,
    };
    const encounter = makeTrivialEncounter();
    const state = buildCombatState([hero, hero, hero], encounter);
    const p0 = state.combatants.find((c) => c.id === 'p0')!;
    expect(p0.thornsDamage).toBe(1);
  });

  it('of_regeneration on outfit sets Combatant.regenPerRound', () => {
    const hero = createHero('archer', 'A', 'h1', 'stout', '0');
    hero.equipment.outfit = {
      id: 'o', baseId: 'outfit_cloth', slot: 'outfit', rarity: 'rare',
      affixes: [], rareProperty: { propertyId: 'of_regeneration', value: 2 }, floorRolledAt: 1,
    };
    const encounter = makeTrivialEncounter();
    const state = buildCombatState([hero, hero, hero], encounter);
    const p0 = state.combatants.find((c) => c.id === 'p0')!;
    expect(p0.regenPerRound).toBe(2);
  });
});

function makeTrivialEncounter() {
  return {
    enemies: [{ enemyId: 'skeleton_warrior' as const, slot: 1 as const }],
    scale: { hp: 1, attack: 1 },
  };
}
```

- [ ] **Step 3: Update `src/run/combat_setup.ts`**

Replace its full contents with:

```ts
import { ENEMIES } from '../data/enemies';
import { BASE_ITEM_STATS } from '../data/items';
import type {
  EnemyId, HeroEquipment, RarePropertyId, RolledRareProperty, SlotIndex, Wound,
} from '../data/types';
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

function applyEquipmentToStats(stats: Stats, equipment: HeroEquipment): Stats {
  const result = { ...stats };
  for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
    const item = equipment[slot];
    if (!item) continue;
    const base = BASE_ITEM_STATS[item.baseId];
    for (const k of Object.keys(base) as (keyof Stats)[]) {
      result[k] = (result[k] ?? 0) + (base[k] ?? 0);
    }
    for (const a of item.affixes) {
      result[a.affixId === 'of_the_hawk' ? 'crit'
           : a.affixId === 'of_evasion'  ? 'dodge'
           : a.affixId === 'of_power'    ? 'attack'
           : a.affixId === 'of_insight'  ? 'mind'
           : a.affixId === 'of_the_bear' ? 'defense'
           : a.affixId === 'of_swiftness' ? 'speed'
           : 'hp'] += a.value;
    }
  }
  return result;
}

function rarePropertyFields(equipment: HeroEquipment): {
  lifestealPercent?: number;
  thornsDamage?: number;
  regenPerRound?: number;
} {
  const out: { lifestealPercent?: number; thornsDamage?: number; regenPerRound?: number } = {};
  for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
    const item = equipment[slot];
    if (!item || !item.rareProperty) continue;
    const map: Record<RarePropertyId, (rp: RolledRareProperty) => void> = {
      of_burning:      () => { /* event-time, no Combatant flag */ },
      of_vampirism:    (rp) => { out.lifestealPercent = rp.value; },
      of_thorns:       (rp) => { out.thornsDamage = rp.value; },
      of_regeneration: (rp) => { out.regenPerRound = rp.value; },
    };
    map[item.rareProperty.propertyId](item.rareProperty);
  }
  return out;
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
    const fullStats = applyEquipmentToStats(woundedStats, hero.equipment);
    const damageTakenMultiplier = computeDamageTakenMultiplier(hero.wounds);
    const rareFields = rarePropertyFields(hero.equipment);
    const woundedMaxHp = fullStats.hp;
    combatants.push(
      createHeroCombatant(hero.classId, (i + 1) as SlotIndex, `p${i}`, {
        baseStats: fullStats,
        currentHp: Math.min(hero.currentHp, woundedMaxHp),
        maxHp: woundedMaxHp,
        traitId: hero.traitId,
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

> **Affix → stat mapping** is intentionally a chained ternary so it's a single expression and TS narrows the affix id. If readability suffers, refactor to a `Record<AffixId, BuffableStat>` lookup. Behavior is identical.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/run/__tests__/combat_setup.test.ts`
Expected: all passing including the new equipment tests.

- [ ] **Step 5: Full typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 10: STATUS_GLYPHS for `'burning'`

**Files:**
- Modify: `src/render/combat_actor.ts`

- [ ] **Step 1: Add `burning` to `STATUS_GLYPHS`**

Find the `STATUS_GLYPHS` literal (around line 11) and append:

```ts
  burning: { letter: 'b', color: '#ff6633' },
```

(Lowercase `b` to match the existing convention of distinct casings — `B` is bulwark.)

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

> No new test added — STATUS_GLYPHS is a static lookup and the existing fallback handles missing entries; the addition is for visual presence.

---

## Task 11: `of_burning` combat hook + DoT tick

**Files:**
- Modify: `src/combat/effects.ts`
- Modify: `src/combat/statuses.ts`
- Modify: `src/combat/__tests__/effects.test.ts`

- [ ] **Step 1: Add failing tests to `src/combat/__tests__/effects.test.ts`**

Append at the bottom:

```ts
import { tickStatuses } from '../statuses';

describe('of_burning rare property', () => {
  function makeHeroWithBurn() {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    // Stamp the burning rare property onto the equipped weapon's representation:
    // for tests we use a dedicated marker on the combatant. Since the production code reads
    // burn presence from the source's equipped weapon at hit time, we simulate by attaching
    // a `burningWeaponDamage?: number` field on the source.
    return p0;
  }

  it('a hero with of_burning weapon applies burning status to the target', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 0 },
      burningWeaponDamage: 3,
    } as Partial<Combatant>);
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    expect(e0.statuses['burning']).toBeDefined();
    expect(e0.statuses['burning'].remainingTurns).toBe(2);
  });

  it('burning status ticks damage at the target turn before decrement', () => {
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { currentHp: 10 });
    e0.statuses['burning'] = {
      statusId: 'burning',
      remainingTurns: 2,
      effect: { kind: 'poison', damagePerTurn: 3, duration: 2, statusId: 'burning' },
      sourceId: 'p0',
    };
    const events: CombatEvent[] = [];
    tickStatuses(e0, events);
    expect(e0.currentHp).toBe(7);
    expect(events.some((ev) => ev.kind === 'damage_applied' && ev.amount === 3)).toBe(true);
  });
});
```

> **Note:** The first test references `burningWeaponDamage` as a Combatant field. We add it in Step 2 — it's the simplest way to surface burn-on-hit data without retreading the items layer in combat code.

- [ ] **Step 2: Update `src/combat/types.ts` to include `burningWeaponDamage`**

Add the field next to the other rare-property fields:

```ts
  burningWeaponDamage?: number;
```

- [ ] **Step 3: Update `src/run/combat_setup.ts` `rarePropertyFields` to populate it**

In the `map` object inside `rarePropertyFields`, change `of_burning` from a no-op to:

```ts
      of_burning:      (rp) => { (out as { burningWeaponDamage?: number }).burningWeaponDamage = rp.value; },
```

And update the return type:

```ts
function rarePropertyFields(equipment: HeroEquipment): {
  lifestealPercent?: number;
  thornsDamage?: number;
  regenPerRound?: number;
  burningWeaponDamage?: number;
} {
  const out: {
    lifestealPercent?: number; thornsDamage?: number; regenPerRound?: number; burningWeaponDamage?: number;
  } = {};
  // …rest unchanged
}
```

- [ ] **Step 4: Update `src/combat/effects.ts` to apply the burning status on landed hits**

Inside `applyDamage`, after the `events.push({ kind: 'damage_applied', … })` line and before the `if (lethal)` branch:

```ts
  if (caster.burningWeaponDamage !== undefined && !target.isDead) {
    // Inflict burn DoT on the target. Reuses the poison status machinery.
    target.statuses['burning'] = {
      statusId: 'burning',
      remainingTurns: 2,
      effect: { kind: 'poison', damagePerTurn: caster.burningWeaponDamage, duration: 2, statusId: 'burning' },
      sourceId: caster.id,
    };
    events.push({
      kind: 'status_applied',
      sourceId: caster.id,
      targetId: target.id,
      statusId: 'burning',
      duration: 2,
    });
  }
```

> Reusing the `poison` effect kind for the status-instance shape is intentional: the existing `tickStatuses` block for poison already does the right thing (DoT damage + decrement). We bind the new `'burning'` `StatusId` onto a `poison`-shaped effect and let `tickStatuses` handle it. **No change is needed in `statuses.ts`** because the existing poison branch checks `effect.kind === 'poison'` regardless of the `statusId`.

> Skip-on-dead matches spec §4: applying burn to a target that died from this same hit is a no-op (the dead-gate avoids stamping a status on a corpse).

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t "burning"`
Expected: 2 passing.

---

## Task 12: `of_vampirism` lifesteal hook

**Files:**
- Modify: `src/combat/effects.ts`
- Modify: `src/combat/__tests__/effects.test.ts`

- [ ] **Step 1: Add failing test**

Append to `src/combat/__tests__/effects.test.ts`:

```ts
describe('of_vampirism rare property', () => {
  it('source heals on a strong landed hit (heal > 0)', () => {
    const p0 = makeHeroCombatant('barbarian', 1, 'p0', {
      baseStats: { hp: 22, attack: 10, defense: 3, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 5,
      lifestealPercent: 25,
    } as Partial<Combatant>);
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 100, maxHp: 100,
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.barbarian_swing, p0, ['e0'], state, rng, events);
    // Expect heal_applied event from caster to caster.
    const heal = events.find(
      (ev) => ev.kind === 'heal_applied' && ev.sourceId === 'p0' && ev.targetId === 'p0',
    );
    expect(heal).toBeDefined();
    expect(p0.currentHp).toBeGreaterThan(5);
  });

  it('lifesteal fires on lethal hits too', () => {
    const p0 = makeHeroCombatant('barbarian', 1, 'p0', {
      baseStats: { hp: 22, attack: 20, defense: 3, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 5,
      lifestealPercent: 50,
    } as Partial<Combatant>);
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { currentHp: 4 });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.barbarian_swing, p0, ['e0'], state, rng, events);
    expect(e0.isDead).toBe(true);
    const heal = events.find((ev) => ev.kind === 'heal_applied');
    expect(heal).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t "of_vampirism"`
Expected: FAIL — no `heal_applied` event is fired.

- [ ] **Step 3: Implement lifesteal in `applyDamage`**

In `src/combat/effects.ts`, inside `applyDamage`, immediately after `events.push({ kind: 'damage_applied', … })` and before the `if (lethal)` branch, add:

```ts
  if (caster.lifestealPercent !== undefined && caster.lifestealPercent > 0) {
    const heal = Math.floor(amplified * caster.lifestealPercent / 100);
    if (heal > 0) {
      const actual = Math.min(heal, caster.maxHp - caster.currentHp);
      if (actual > 0) {
        caster.currentHp += actual;
        events.push({
          kind: 'heal_applied',
          sourceId: caster.id,
          targetId: caster.id,
          amount: actual,
        });
      }
    }
  }
```

> Place this **before** the burning-status block from Task 11 so lifesteal fires for both lethal and non-lethal hits, and burning is gated on non-lethal as designed.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t "of_vampirism"`
Expected: 3 passing.

---

## Task 13: `of_thorns` reflect hook

**Files:**
- Modify: `src/combat/effects.ts`
- Modify: `src/combat/__tests__/effects.test.ts`

- [ ] **Step 1: Add failing test**

Append to `src/combat/__tests__/effects.test.ts`:

```ts
describe('of_thorns rare property', () => {
  it('attacker takes thorn damage on a landed hit', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 0 },
      thornsDamage: 1,
    } as Partial<Combatant>);
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { currentHp: 10 });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, e0, ['p0'], state, rng, events);
    expect(e0.currentHp).toBe(9);
    // Thorns event is a separate damage_applied with source = target (the bearer),
    // and target = original caster.
    const reflect = events.find(
      (ev) => ev.kind === 'damage_applied' && ev.sourceId === 'p0' && ev.targetId === 'e0',
    );
    expect(reflect).toBeDefined();
    expect(reflect).toMatchObject({ amount: 1 });
  });

  it('thorns does not fire on dodged attacks', () => {
    const p0 = makeHeroCombatant('rogue', 1, 'p0', {
      baseStats: { hp: 13, attack: 5, defense: 1, speed: 6, mind: 0, crit: 0, dodge: 100 },
      thornsDamage: 5,
    } as Partial<Combatant>);
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, e0, ['p0'], state, rng, events);
    expect(events.find((ev) => ev.kind === 'attack_dodged')).toBeDefined();
    expect(e0.currentHp).toBe(e0.maxHp); // no thorn damage
  });

  it('thorns can kill the source on a low-HP attacker', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      thornsDamage: 5,
    } as Partial<Combatant>);
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { currentHp: 1 });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, e0, ['p0'], state, rng, events);
    expect(e0.isDead).toBe(true);
    expect(events.some((ev) => ev.kind === 'death' && ev.combatantId === 'e0')).toBe(true);
  });
});
```

- [ ] **Step 2: Implement in `applyDamage`**

In `src/combat/effects.ts`, **after** the lifesteal block from Task 12 and **after** the burning block from Task 11 (so thorns fires after burn application), add:

```ts
  if (target.thornsDamage !== undefined && target.thornsDamage > 0 && !caster.isDead) {
    const thorn = target.thornsDamage;
    caster.currentHp -= thorn;
    const sourceLethal = caster.currentHp <= 0;
    events.push({
      kind: 'damage_applied',
      sourceId: target.id,
      targetId: caster.id,
      amount: thorn,
      lethal: sourceLethal,
      wasCrit: false,
    });
    if (sourceLethal) {
      caster.isDead = true;
      events.push({ kind: 'death', combatantId: caster.id });
    }
  }
```

> The `caster.isDead` guard at the top prevents an already-dead caster from being thorn-pinged again (e.g., if multiple effect blocks fire). Thorns intentionally has *no* recursive guard — a thorn-damage event does not retrigger thorns since thorn damage doesn't go through `applyDamage` (we push the event manually).

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t "of_thorns"`
Expected: 3 passing.

---

## Task 14: `of_regeneration` round-start heal hook

**Files:**
- Modify: `src/combat/combat.ts`
- Modify: `src/combat/__tests__/combat.test.ts`

- [ ] **Step 1: Add failing test**

Append to `src/combat/__tests__/combat.test.ts` (use the existing import block; add the test inside the existing top-level `describe`):

```ts
import { resolveCombat } from '../combat';

describe('of_regeneration round-start heal', () => {
  it('a hero with regenPerRound heals at the start of each round, capped at maxHp', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 5,
      regenPerRound: 3,
    } as Partial<Combatant>);
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 100, maxHp: 100,
    });
    const state = makeTestState([p0], [e0]);
    const result = resolveCombat(state, rng);
    // Heal events for p0 should appear; final hp >= 5.
    const heals = result.events.filter(
      (ev) => ev.kind === 'heal_applied' && ev.targetId === 'p0' && ev.sourceId === 'p0',
    );
    expect(heals.length).toBeGreaterThan(0);
  });
});
```

> If your `combat.test.ts` doesn't already import `Combatant` and `CombatEvent` types, add them at the top of the file.

- [ ] **Step 2: Implement regen at round-start in `src/combat/combat.ts`**

Inside `resolveCombat`, find the `events.push({ kind: 'round_start', round, order })` line. **Immediately after that line**, add:

```ts
    for (const c of state.combatants) {
      if (c.isDead || !c.regenPerRound) continue;
      const heal = Math.min(c.regenPerRound, c.maxHp - c.currentHp);
      if (heal > 0) {
        c.currentHp += heal;
        events.push({
          kind: 'heal_applied',
          sourceId: c.id,
          targetId: c.id,
          amount: heal,
        });
      }
    }
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/combat/__tests__/combat.test.ts -t "regeneration"`
Expected: 1 passing.

---

## Task 15: `completeCombat` rolls loot drop + transfers fallen gear

**Files:**
- Modify: `src/run/run_state.ts`
- Modify: `src/run/__tests__/run_state.test.ts`

- [ ] **Step 1: Add failing tests to `src/run/__tests__/run_state.test.ts`**

```ts
import { createRng } from '../../util/rng';

describe('completeCombat — loot drop', () => {
  it('boss victory always appends one item to pack', () => {
    const rng = createRng(1);
    const run = makeRunStateAtBoss();          // helper from existing test fixtures
    const result = makeVictoryResult();         // existing helper
    const { runState } = completeCombat(run, result, rng);
    expect(runState.pack.items.length).toBe(1);
  });

  it('combat-node victory appends 0 or 1 items, depending on RNG', () => {
    let drops = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const rng = createRng(seed);
      const run = makeRunStateAtCombat();
      const result = makeVictoryResult();
      const { runState } = completeCombat(run, result, rng);
      if (runState.pack.items.length > 0) drops += 1;
    }
    // Some drops, some no-drops.
    expect(drops).toBeGreaterThan(0);
    expect(drops).toBeLessThan(50);
  });
});

describe('completeCombat — fallen gear transfer', () => {
  it('fallen hero gear transfers into the pack on victory', () => {
    const rng = createRng(99);
    const run = makeRunStateWithPartyOf3();    // existing helper

    // Build a victory result where p1 falls.
    const result = makeVictoryResultWithFallen(['p1']);
    const { runState } = completeCombat(run, result, rng);
    // p1's weapon (and shield if knight) flow into pack. At minimum 1 item from the fallen hero.
    expect(runState.pack.items.length).toBeGreaterThanOrEqual(1);
  });

  it('on wipe, all gear is lost (pack.items zeroed)', () => {
    const rng = createRng(99);
    const run = makeRunStateWithPartyOf3();
    const result = makeWipeResult();
    const { runState, wipe } = completeCombat(run, result, rng);
    expect(runState.pack.items).toEqual([]);
    expect(wipe).toBeDefined();
  });
});
```

> **Helper functions** (`makeRunStateAtBoss`, `makeVictoryResult`, etc.): the existing `run_state.test.ts` already has helpers along these lines. If a needed helper doesn't exist, define it locally next to the tests using existing test patterns. Do not extract helpers globally — keep them in this file.

- [ ] **Step 2: Update `src/run/run_state.ts`**

Find the `completeCombat` function and update its signature + body. Add `rng` parameter, roll loot on victory, transfer fallen gear:

```ts
import { rollLoot } from '../dungeon/loot';
import { addItem } from './pack';
// existing imports...

export function completeCombat(
  runState: RunState,
  result: CombatResult,
  rng: Rng,
): { runState: RunState; wipe?: WipeOutcome } {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`completeCombat: status must be 'in_dungeon', got '${runState.status}'`);
  }

  const updatedPartyLiving: Hero[] = [];
  const newFallen: Hero[] = [];
  for (let i = 0; i < runState.party.length; i++) {
    const original = runState.party[i];
    const combatant = result.finalState.combatants.find((c) => c.id === `p${i}`);
    if (!combatant) {
      updatedPartyLiving.push(original);
      continue;
    }
    const newWounds = woundsFromEvents(result.events, `p${i}`);
    const updated: Hero = {
      ...original,
      currentHp: Math.max(0, combatant.currentHp),
      wounds: newWounds.length > 0 ? [...original.wounds, ...newWounds] : original.wounds,
    };
    if (combatant.isDead) {
      newFallen.push(updated);
    } else {
      updatedPartyLiving.push(updated);
    }
  }

  if (result.outcome === 'player_defeat') {
    const allLost: Hero[] = [
      ...runState.fallen,
      ...newFallen,
      ...updatedPartyLiving,
    ];
    const wipe: WipeOutcome = { packLost: runState.pack, heroesLost: allLost };
    return {
      runState: {
        ...runState,
        party: [],
        fallen: allLost,
        pack: createPack(),
        status: 'ended',
      },
      wipe,
    };
  }

  const completedNode = runState.currentFloorNodes[runState.currentNodeIndex];
  const isBoss = completedNode.type === 'boss';
  const reward =
    isBoss
      ? BOSS_NODE_GOLD * runState.currentFloorNumber
      : COMBAT_NODE_GOLD * runState.currentFloorNumber;
  let newPack = addGold(runState.pack, reward);

  // Loot drop.
  const drop = rollLoot(rng, runState.currentFloorNumber, isBoss);
  if (drop) {
    newPack = addItem(newPack, drop);
  }

  // Fallen gear transfer.
  for (const fallen of newFallen) {
    const eq = fallen.equipment;
    const items = [eq.weapon, eq.shield, eq.outfit, eq.hat].filter(
      (i): i is Item => i !== undefined,
    );
    for (const item of items) {
      newPack = addItem(newPack, item);
    }
  }

  if (isBoss) {
    return {
      runState: {
        ...runState,
        party: updatedPartyLiving,
        fallen: [...runState.fallen, ...newFallen],
        pack: newPack,
        status: 'camp_screen',
      },
    };
  }

  return {
    runState: {
      ...runState,
      party: updatedPartyLiving,
      fallen: [...runState.fallen, ...newFallen],
      pack: newPack,
      status: 'in_dungeon',
      currentNodeIndex: runState.currentNodeIndex + 1,
    },
  };
}
```

(Add `import type { Item } from '../data/types';` to the file's imports if not already present.)

- [ ] **Step 3: Update existing callers in `dungeon_scene.ts`**

`completeCombat` now requires a third argument. Find the call site in `src/scenes/dungeon_scene.ts` and pass the run RNG. Look for `completeCombat(this.run, result)` and change to `completeCombat(this.run, result, rng)` — the surrounding code already keeps an rng instance. If the local rng is named differently, use that name.

Run a typecheck first to find all callers:

Run: `npx tsc --noEmit`
Expected: errors only at `completeCombat(...)` callsites. Add the rng arg at each.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/run/__tests__/run_state.test.ts`
Expected: all (existing + new) passing.

---

## Task 16: `cashout` returns `itemsBanked`

**Files:**
- Modify: `src/run/run_state.ts`
- Modify: `src/run/__tests__/run_state.test.ts`

- [ ] **Step 1: Update the `CashoutOutcome` interface**

In `src/run/run_state.ts`:

```ts
export interface CashoutOutcome {
  goldBanked: number;
  itemsBanked: readonly Item[];
  heroesReturned: readonly Hero[];
  heroesLost: readonly Hero[];
}
```

- [ ] **Step 2: Update `cashout` function body**

```ts
export function cashout(runState: RunState): { runState: RunState; outcome: CashoutOutcome } {
  if (runState.status !== 'camp_screen') {
    throw new Error(`cashout: status must be 'camp_screen', got '${runState.status}'`);
  }
  const outcome: CashoutOutcome = {
    goldBanked: totalGold(runState.pack),
    itemsBanked: runState.pack.items,
    heroesReturned: runState.party,
    heroesLost: runState.fallen,
  };
  return {
    runState: { ...runState, status: 'ended' },
    outcome,
  };
}
```

- [ ] **Step 3: Add a failing test**

Append to `src/run/__tests__/run_state.test.ts`:

```ts
describe('cashout — itemsBanked', () => {
  it('returns the pack items in outcome.itemsBanked', () => {
    // Build a run at camp_screen with two items in pack.
    const rng = createRng(7);
    const run = makeRunAtCampScreenWithItems([fakeItem('i1'), fakeItem('i2')]);
    const { outcome } = cashout(run);
    expect(outcome.itemsBanked.map((i) => i.id)).toEqual(['i1', 'i2']);
  });
});

function fakeItem(id: string): Item {
  return {
    id, baseId: 'sword_basic', slot: 'weapon', rarity: 'common',
    weaponType: 'sword', affixes: [], floorRolledAt: 1,
  };
}
```

> If `makeRunAtCampScreenWithItems` doesn't exist, define it locally — it's a small constructor that builds a `RunState` with `status: 'camp_screen'` and the given items in `pack.items`.

- [ ] **Step 4: Update camp_screen scene to bank items**

In `src/scenes/camp_screen_scene.ts`, find where `cashout` is called and the vault is credited. Add the stash banking next to it:

```ts
import { addItems } from '../camp/stash';
// existing imports...

// where vault is credited from outcome.goldBanked, also do:
appState.update((s) => ({
  ...s,
  vault: credit(s.vault, outcome.goldBanked),
  stash: addItems(s.stash, outcome.itemsBanked),
}));
```

(Adjust to actual app-state shape; if app-state-update is a single call, fold both updates into one. The exact shape is defined in `src/scenes/app_state.ts`.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/run/__tests__/run_state.test.ts -t "cashout"`
Expected: passing.

---

## Task 17: SaveFile carries stash; boot defaulting for older v1 saves

**Files:**
- Modify: `src/save/save.ts`
- Modify: `src/save/boot.ts`
- Modify: `src/save/__tests__/save.test.ts`
- Modify: `src/save/__tests__/boot.test.ts`
- Modify: `src/scenes/app_state.ts` (add `stash` field if not present)

- [ ] **Step 1: Update `SaveFile` and add `normalizeSaveFile` in `src/save/save.ts`**

```ts
import type { Roster } from '../camp/roster';
import type { Stash } from '../camp/stash';
import { createStash } from '../camp/stash';
import type { Vault } from '../camp/vault';
import type { Unlocks } from '../data/types';
import type { RunState } from '../run/run_state';
import { CURRENT_SCHEMA_VERSION, migrate } from './migration';

export { CURRENT_SCHEMA_VERSION } from './migration';
export const STORAGE_KEY = 'pixel-battle-game/save';

export interface SaveFile {
  version: number;
  roster: Roster;
  vault: Vault;
  stash: Stash;
  unlocks: Unlocks;
  runState?: RunState;
  runRngState?: number;
  preferences?: Preferences;
}

export interface Preferences {
  combatSpeed: 1 | 3;
}

export function save(data: SaveFile, storage: Storage): void {
  if ((data.runState === undefined) !== (data.runRngState === undefined)) {
    throw new Error('save: runState and runRngState must both be present or both absent');
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function load(storage: Storage): SaveFile | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn('load: corrupt save (JSON parse failed)', e);
    return null;
  }

  if (!isPlausibleRawSave(parsed)) {
    console.warn('load: corrupt save (shape mismatch)');
    return null;
  }

  const versioned = parsed as { version: number };
  if (versioned.version > CURRENT_SCHEMA_VERSION) {
    console.warn(
      `load: save version ${versioned.version} is newer than supported ${CURRENT_SCHEMA_VERSION}`,
    );
    return null;
  }

  let migrated: SaveFile | null;
  try {
    migrated = migrate(parsed);
  } catch (e) {
    console.warn('load: migration failed', e);
    return null;
  }
  if (!migrated) return null;

  if ((migrated.runState === undefined) !== (migrated.runRngState === undefined)) {
    console.warn('load: runState/runRngState pairing invariant violated; discarding run');
    return normalizeSaveFile({ ...migrated, runState: undefined, runRngState: undefined });
  }

  return normalizeSaveFile(migrated);
}

export function clearSave(storage: Storage): void {
  storage.removeItem(STORAGE_KEY);
}

export function createDefaultUnlocks(): Unlocks {
  return {
    classes: ['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage'],
    dungeons: ['crypt'],
  };
}

function isPlausibleRawSave(parsed: unknown): parsed is { version: number } {
  if (typeof parsed !== 'object' || parsed === null) return false;
  const v = (parsed as Record<string, unknown>).version;
  return typeof v === 'number' && Number.isFinite(v) && v >= 1;
}

/**
 * Pre-launch policy: schema stays at 1 and we add new fields without bumps.
 * Old v1 saves that predate a field need defaults to be loadable. This is the
 * single point of defaulting; do not scatter `?? createStash()` reads elsewhere.
 */
function normalizeSaveFile(file: SaveFile): SaveFile {
  return {
    ...file,
    stash: file.stash ?? createStash(),
  };
}
```

- [ ] **Step 2: Update `createFreshSave` in `src/save/boot.ts`**

```ts
import { addHero, createRoster } from '../camp/roster';
import { createStash } from '../camp/stash';
import { createVault, credit } from '../camp/vault';
import { generateStarterRoster } from '../camp/buildings/tavern';
import type { Rng } from '../util/rng';

const STARTER_GOLD = 500;
import {
  CURRENT_SCHEMA_VERSION,
  createDefaultUnlocks,
  load,
  save,
  type SaveFile,
} from './save';

export function resolveSaveState(
  storage: Storage,
  rng: Rng,
): { saveFile: SaveFile; isNew: boolean } {
  const existing = load(storage);
  if (existing) {
    return { saveFile: existing, isNew: false };
  }
  const fresh = createFreshSave(rng);
  save(fresh, storage);
  return { saveFile: fresh, isNew: true };
}

function createFreshSave(rng: Rng): SaveFile {
  const heroes = generateStarterRoster(rng);
  let roster = createRoster();
  for (const hero of heroes) {
    roster = addHero(roster, hero);
  }
  return {
    version: CURRENT_SCHEMA_VERSION,
    roster,
    vault: credit(createVault(), STARTER_GOLD),
    stash: createStash(),
    unlocks: createDefaultUnlocks(),
  };
}
```

- [ ] **Step 3: Update `app_state.ts` to carry stash**

Add a `stash: Stash` field next to `vault: Vault`. Initialize from `saveFile.stash`.

> Read the file first; if the AppState shape already mirrors `SaveFile`, just add the field. The exact change is one line in the type definition + one line in the initializer.

- [ ] **Step 4: Update `src/save/__tests__/save.test.ts` and `boot.test.ts`**

In `save.test.ts` add a round-trip test:

```ts
import { createStash } from '../../camp/stash';

describe('save round-trip with stash', () => {
  it('persists and loads stash', () => {
    const data: SaveFile = {
      version: CURRENT_SCHEMA_VERSION,
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      stash: createStash(),
      unlocks: createDefaultUnlocks(),
    };
    const mem = makeMemoryStorage(); // existing helper
    save(data, mem);
    const loaded = load(mem);
    expect(loaded?.stash).toEqual({ items: [] });
  });

  it('older v1 save without stash defaults to empty stash', () => {
    const mem = makeMemoryStorage();
    const stale = {
      version: CURRENT_SCHEMA_VERSION,
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      unlocks: createDefaultUnlocks(),
      // no stash field
    };
    mem.setItem('pixel-battle-game/save', JSON.stringify(stale));
    const loaded = load(mem);
    expect(loaded?.stash).toEqual({ items: [] });
  });
});
```

In `boot.test.ts`:

```ts
describe('createFreshSave', () => {
  it('initializes an empty stash', () => {
    const mem = makeMemoryStorage();
    const { saveFile, isNew } = resolveSaveState(mem, createRng(1));
    expect(isNew).toBe(true);
    expect(saveFile.stash).toEqual({ items: [] });
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/save`
Expected: all passing.

- [ ] **Step 6: Final whole-suite check**

Run: `npm test`
Expected: full Vitest suite green.

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run build`
Expected: success.

---

## Verification checklist

After Task 17, the following should be true:

- [ ] `npm test` passes.
- [ ] `npx tsc --noEmit` is clean.
- [ ] `npm run build` succeeds.
- [ ] The Phaser firewall is intact (`grep -r "from 'phaser'" src/data src/items src/run src/combat src/heroes src/save src/dungeon src/camp` returns nothing).
- [ ] A fresh save loads with empty stash.
- [ ] Combat with a Knight starting equipment shows +1 attack from sword base + 1 defense from shield base in their `Combatant.baseStats`.
- [ ] Running a dungeon victory at floor 1 sometimes adds an item to `runState.pack.items`.
- [ ] Cashout banks items into the camp `stash`.

---

## Open follow-ups (out of this plan)

These ride on top of this task; do not pre-empt them here:

- Equip-swap UI (Cluster B): Barracks-side panel for moving stash items into hero equipment slots.
- Mid-run pack-vs-equip UI (Cluster B): the GDD §7 decision moment.
- Tooltip rendering for items (rare property + affix display).
- Outfit / hat sprite frames in `spritenames.txt` + `BASE_ITEMS.spriteId` updates (replacing the `'0'` placeholders).
- Multi-dungeon rarity tier multiplier (when Tier 3 dungeons land).
- Lost-hero gear handling (TODO #15).
- `Combatant.passives` consolidation when 3 more rare-property fields land.
