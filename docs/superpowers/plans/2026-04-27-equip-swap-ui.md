# Equip-Swap UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the post-boss equip-swap UI — a launchable panel scene that lets the player move items between pack and hero equipment, with stat preview, opened from `camp_screen_scene` (and architected so future rest-area overlays can launch the same scene).

**Architecture:** Pure-TS helpers (`src/items/stats.ts`, `src/items/selectors.ts`, `src/run/equip_run.ts`) hold all transition logic and display formatting; the new `EquipPanelScene` is a thin Phaser orchestrator over those helpers. State mutations go through `appState.update()` which persists to localStorage. No stash UI; pack ↔ equipment only.

**Tech Stack:** TypeScript 6.0, Vitest 4.1, Phaser. New code is pure-TS except `equip_panel_scene.ts` and the `camp_screen_scene` / `dungeon_scene` HUD edits.

**Repo convention:** `CLAUDE.md` says *"Never create git commits without explicit user instruction in the current turn."* This plan has no commit steps; the user drives staging and commits.

**Source spec:** [`docs/superpowers/specs/2026-04-27-equip-swap-ui-design.md`](../specs/2026-04-27-equip-swap-ui-design.md).

---

## File Structure

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/items/stats.ts` | Create | `applyEquipmentStats(stats, equipment)` and `rarePropertyFields(equipment)` extracted from `combat_setup.ts`. Plus the `AFFIX_TO_STAT` map and the `RarePropertyFields` type. |
| `src/items/__tests__/stats.test.ts` | Create | Tests for the extracted helpers (snapshot of behavior pre/post extraction). |
| `src/run/combat_setup.ts` | Modify | Import `applyEquipmentStats` + `rarePropertyFields` from `src/items/stats.ts` instead of defining locally. |
| `src/items/selectors.ts` | Create | `filterPackBySlot`, `itemDisplayName`, `itemAffixDescription`, `previewStats`, plus `formatAffix`/`formatRareProperty` private helpers. |
| `src/items/__tests__/selectors.test.ts` | Create | Tests for all four selector functions. |
| `src/run/equip_run.ts` | Create | `equipFromPack(runState, heroIndex, packItemId, slot)` and `unequipToPack(runState, heroIndex, slot)` — atomic transactions with maxHp clamping. |
| `src/run/__tests__/equip_run.test.ts` | Create | Tests for both transaction functions including throw cases. |
| `src/scenes/equip_panel_scene.ts` | Create | `EquipPanelScene` Phaser scene — chrome, party list, equipment slots, pack list, stat preview, bottom button, all interaction handlers. |
| `src/main.ts` | Modify | Register `EquipPanelScene` in scene array. |
| `src/scenes/dungeon_scene.ts` | Modify | Pack pill: add item count to label. |
| `src/scenes/camp_screen_scene.ts` | Modify | Pack pill item count, Equip button, button-disable logic, RESUME → `scene.restart()`. |

---

## Task 1: Extract `stats.ts` helpers

Pulls `applyEquipmentStats` and `rarePropertyFields` (and the `AFFIX_TO_STAT` map and `RarePropertyFields` type) out of `src/run/combat_setup.ts` into a new module that both `combat_setup.ts` and `selectors.ts` (Task 2) import. **No functional change** — same code, new home. The old file just imports from the new one.

**Files:**
- Create: `src/items/stats.ts`
- Create: `src/items/__tests__/stats.test.ts`
- Modify: `src/run/combat_setup.ts`

- [ ] **Step 1: Create `src/items/__tests__/stats.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { HeroEquipment, Item } from '../../data/types';
import type { Stats } from '../../combat/types';
import { applyEquipmentStats, rarePropertyFields } from '../stats';

const ZERO_STATS: Stats = { hp: 0, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 };

const sword = (id: string, affixes: Item['affixes'] = []): Item => ({
  id, baseId: 'sword_basic', slot: 'weapon', rarity: 'common',
  weaponType: 'sword', affixes, floorRolledAt: 1,
});

const shield = (id: string, rareProperty?: Item['rareProperty']): Item => ({
  id, baseId: 'shield_basic', slot: 'shield', rarity: rareProperty ? 'rare' : 'common',
  affixes: [], ...(rareProperty ? { rareProperty } : {}), floorRolledAt: 1,
});

describe('applyEquipmentStats', () => {
  it('adds weapon base stat (sword: +1 attack)', () => {
    const eq: HeroEquipment = { weapon: sword('w') };
    const out = applyEquipmentStats(ZERO_STATS, eq);
    expect(out.attack).toBe(1);
  });

  it('sums affix values into the matching stat keys', () => {
    const eq: HeroEquipment = {
      weapon: sword('w', [
        { affixId: 'of_power', value: 2 },
        { affixId: 'of_the_hawk', value: 5 },
      ]),
    };
    const out = applyEquipmentStats(ZERO_STATS, eq);
    expect(out.attack).toBe(1 + 2);
    expect(out.crit).toBe(5);
  });

  it('handles all four slots together', () => {
    const eq: HeroEquipment = {
      weapon: sword('w'),
      shield: shield('s'),
      outfit: { id: 'o', baseId: 'outfit_cloth', slot: 'outfit', rarity: 'common', affixes: [], floorRolledAt: 1 },
      hat: { id: 'h', baseId: 'hat_cap', slot: 'hat', rarity: 'common', affixes: [], floorRolledAt: 1 },
    };
    const out = applyEquipmentStats(ZERO_STATS, eq);
    expect(out.attack).toBe(1);   // sword
    expect(out.defense).toBe(1);  // shield
    expect(out.hp).toBe(6);       // outfit_cloth
    // hat_cap contributes nothing
  });

  it('does not mutate input stats object', () => {
    const eq: HeroEquipment = { weapon: sword('w') };
    const input = { ...ZERO_STATS };
    applyEquipmentStats(input, eq);
    expect(input).toEqual(ZERO_STATS);
  });
});

describe('rarePropertyFields', () => {
  it('returns burningWeaponDamage for of_burning weapon', () => {
    const eq: HeroEquipment = {
      weapon: { id: 'w', baseId: 'sword_basic', slot: 'weapon', rarity: 'rare', weaponType: 'sword',
        affixes: [], rareProperty: { propertyId: 'of_burning', value: 3 }, floorRolledAt: 1 },
    };
    expect(rarePropertyFields(eq)).toEqual({ burningWeaponDamage: 3 });
  });

  it('returns lifestealPercent for of_vampirism weapon', () => {
    const eq: HeroEquipment = {
      weapon: { id: 'w', baseId: 'sword_basic', slot: 'weapon', rarity: 'rare', weaponType: 'sword',
        affixes: [], rareProperty: { propertyId: 'of_vampirism', value: 25 }, floorRolledAt: 1 },
    };
    expect(rarePropertyFields(eq)).toEqual({ lifestealPercent: 25 });
  });

  it('returns thornsDamage for of_thorns shield', () => {
    const eq: HeroEquipment = {
      weapon: { id: 'w', baseId: 'sword_basic', slot: 'weapon', rarity: 'common', weaponType: 'sword',
        affixes: [], floorRolledAt: 1 },
      shield: shield('s', { propertyId: 'of_thorns', value: 2 }),
    };
    expect(rarePropertyFields(eq)).toEqual({ thornsDamage: 2 });
  });

  it('returns regenPerRound for of_regeneration outfit', () => {
    const eq: HeroEquipment = {
      weapon: { id: 'w', baseId: 'sword_basic', slot: 'weapon', rarity: 'common', weaponType: 'sword',
        affixes: [], floorRolledAt: 1 },
      outfit: { id: 'o', baseId: 'outfit_cloth', slot: 'outfit', rarity: 'rare',
        affixes: [], rareProperty: { propertyId: 'of_regeneration', value: 1 }, floorRolledAt: 1 },
    };
    expect(rarePropertyFields(eq)).toEqual({ regenPerRound: 1 });
  });

  it('returns empty object when no rare properties', () => {
    const eq: HeroEquipment = { weapon: sword('w') };
    expect(rarePropertyFields(eq)).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/items/__tests__/stats.test.ts`
Expected: FAIL — `Cannot find module '../stats'`.

- [ ] **Step 3: Create `src/items/stats.ts` by extracting from `combat_setup.ts`**

```ts
import { BASE_ITEM_STATS } from '../data/items';
import type {
  AffixId, BuffableStat, HeroEquipment, RarePropertyId, RolledRareProperty,
} from '../data/types';
import type { Stats } from '../combat/types';

const AFFIX_TO_STAT: Record<AffixId, BuffableStat> = {
  of_power: 'attack',
  of_insight: 'mind',
  of_the_bear: 'defense',
  of_vigor: 'hp',
  of_swiftness: 'speed',
  of_the_hawk: 'crit',
  of_evasion: 'dodge',
};

export function applyEquipmentStats(stats: Stats, equipment: HeroEquipment): Stats {
  const result: Stats = { ...stats };
  for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
    const item = equipment[slot];
    if (!item) continue;
    const base = BASE_ITEM_STATS[item.baseId];
    for (const k of Object.keys(base) as (keyof Stats)[]) {
      result[k] = result[k] + (base[k] ?? 0);
    }
    for (const a of item.affixes) {
      const stat = AFFIX_TO_STAT[a.affixId];
      result[stat] = result[stat] + a.value;
    }
  }
  return result;
}

export interface RarePropertyFields {
  lifestealPercent?: number;
  thornsDamage?: number;
  regenPerRound?: number;
  burningWeaponDamage?: number;
}

export function rarePropertyFields(equipment: HeroEquipment): RarePropertyFields {
  const out: RarePropertyFields = {};
  for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
    const item = equipment[slot];
    if (!item || !item.rareProperty) continue;
    const map: Record<RarePropertyId, (rp: RolledRareProperty) => void> = {
      of_burning:      (rp) => { out.burningWeaponDamage = rp.value; },
      of_vampirism:    (rp) => { out.lifestealPercent = rp.value; },
      of_thorns:       (rp) => { out.thornsDamage = rp.value; },
      of_regeneration: (rp) => { out.regenPerRound = rp.value; },
    };
    map[item.rareProperty.propertyId](item.rareProperty);
  }
  return out;
}
```

- [ ] **Step 4: Update `src/run/combat_setup.ts` to import from the new module**

Replace the file's import block + remove the now-extracted functions. Final file:

```ts
import { ENEMIES } from '../data/enemies';
import { applyEquipmentStats, rarePropertyFields } from '../items/stats';
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

> **Note:** `applyEquipmentToStats` (the local function name) is renamed to `applyEquipmentStats` (no `To`) when extracted. Tests already use the new name. The local call inside `buildCombatState` was updated above.

- [ ] **Step 5: Run all related tests + typecheck**

Run: `npx vitest run src/items src/run`
Expected: all green (new tests + existing run/combat_setup tests still pass).

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 2: Selectors — `filterPackBySlot`, `itemDisplayName`, `itemAffixDescription`

Three pure formatters. `previewStats` is split into Task 3 because it's bigger.

**Files:**
- Create: `src/items/selectors.ts`
- Create: `src/items/__tests__/selectors.test.ts`

- [ ] **Step 1: Create `src/items/__tests__/selectors.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Item } from '../../data/types';
import type { Pack } from '../../run/pack';
import { filterPackBySlot, itemAffixDescription, itemDisplayName } from '../selectors';

const sword = (id: string, overrides: Partial<Item> = {}): Item => ({
  id, baseId: 'sword_basic', slot: 'weapon', rarity: 'common',
  weaponType: 'sword', affixes: [], floorRolledAt: 1, ...overrides,
});

const outfit = (id: string, overrides: Partial<Item> = {}): Item => ({
  id, baseId: 'outfit_cloth', slot: 'outfit', rarity: 'common',
  affixes: [], floorRolledAt: 1, ...overrides,
});

describe('filterPackBySlot', () => {
  it('returns only items matching the slot', () => {
    const pack: Pack = {
      gold: 0,
      items: [sword('a'), outfit('b'), sword('c')],
    };
    expect(filterPackBySlot(pack, 'weapon').map((i) => i.id)).toEqual(['a', 'c']);
    expect(filterPackBySlot(pack, 'outfit').map((i) => i.id)).toEqual(['b']);
    expect(filterPackBySlot(pack, 'shield')).toEqual([]);
  });
});

describe('itemDisplayName', () => {
  it('common item: returns the base item name', () => {
    expect(itemDisplayName(sword('a'))).toBe('Sword');
  });

  it('uncommon with one affix: appends affix name', () => {
    const item = sword('a', { rarity: 'uncommon', affixes: [{ affixId: 'of_power', value: 1 }] });
    expect(itemDisplayName(item)).toBe('Sword of Power');
  });

  it('rare with property: appends property name regardless of affixes', () => {
    const item = sword('a', {
      rarity: 'rare',
      affixes: [{ affixId: 'of_swiftness', value: 1 }],
      rareProperty: { propertyId: 'of_burning', value: 2 },
    });
    expect(itemDisplayName(item)).toBe('Sword of Burning');
  });
});

describe('itemAffixDescription', () => {
  it('common with no affixes: empty string', () => {
    expect(itemAffixDescription(sword('a'))).toBe('');
  });

  it('uncommon with affix: formats with stat suffix', () => {
    const item = sword('a', {
      rarity: 'uncommon',
      affixes: [{ affixId: 'of_power', value: 2 }],
    });
    expect(itemAffixDescription(item)).toBe('+2 atk');
  });

  it('rare with affixes + property: joins with " · "', () => {
    const item = sword('a', {
      rarity: 'rare',
      affixes: [
        { affixId: 'of_power', value: 1 },
        { affixId: 'of_the_hawk', value: 5 },
      ],
      rareProperty: { propertyId: 'of_burning', value: 2 },
    });
    expect(itemAffixDescription(item)).toBe('+1 atk · +5% crit · burns 2 turns');
  });

  it('regen property formatted as "+N regen/round"', () => {
    const item = outfit('a', {
      rarity: 'rare',
      rareProperty: { propertyId: 'of_regeneration', value: 1 },
    });
    expect(itemAffixDescription(item)).toBe('+1 regen/round');
  });

  it('thorns property formatted as "N thorns"', () => {
    const item: Item = {
      id: 's', baseId: 'shield_basic', slot: 'shield', rarity: 'rare',
      affixes: [], rareProperty: { propertyId: 'of_thorns', value: 2 }, floorRolledAt: 1,
    };
    expect(itemAffixDescription(item)).toBe('2 thorns');
  });

  it('vampirism property formatted as "N% lifesteal"', () => {
    const item = sword('a', {
      rarity: 'rare',
      rareProperty: { propertyId: 'of_vampirism', value: 25 },
    });
    expect(itemAffixDescription(item)).toBe('25% lifesteal');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/items/__tests__/selectors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/items/selectors.ts`**

```ts
import { AFFIXES, BASE_ITEMS, RARE_PROPERTIES } from '../data/items';
import type { Item, ItemSlot, RolledAffix, RolledRareProperty } from '../data/types';
import type { Pack } from '../run/pack';

const AFFIX_STAT_SUFFIX: Record<RolledAffix['affixId'], string> = {
  of_power: 'atk',
  of_insight: 'mind',
  of_the_bear: 'def',
  of_vigor: 'hp',
  of_swiftness: 'spd',
  of_the_hawk: '% crit',
  of_evasion: '% dodge',
};

export function filterPackBySlot(pack: Pack, slot: ItemSlot): readonly Item[] {
  return pack.items.filter((i) => i.slot === slot);
}

export function itemDisplayName(item: Item): string {
  const baseName = BASE_ITEMS[item.baseId].name;
  if (item.rareProperty) {
    return `${baseName} ${RARE_PROPERTIES[item.rareProperty.propertyId].name}`;
  }
  if (item.rarity === 'uncommon' && item.affixes.length > 0) {
    return `${baseName} ${AFFIXES[item.affixes[0].affixId].name}`;
  }
  return baseName;
}

export function itemAffixDescription(item: Item): string {
  const parts: string[] = [];
  for (const a of item.affixes) parts.push(formatAffix(a));
  if (item.rareProperty) parts.push(formatRareProperty(item.rareProperty));
  return parts.join(' · ');
}

function formatAffix(a: RolledAffix): string {
  const suffix = AFFIX_STAT_SUFFIX[a.affixId];
  // Percent stats display the % in the suffix already; flat stats prefix +.
  if (suffix.startsWith('%')) {
    return `+${a.value}${suffix}`; // e.g. "+5% crit"
  }
  return `+${a.value} ${suffix}`; // e.g. "+1 atk"
}

function formatRareProperty(p: RolledRareProperty): string {
  switch (p.propertyId) {
    case 'of_burning':      return `burns ${p.value === 1 ? '1 turn' : `${RARE_PROPERTIES.of_burning.kind === 'burn' ? RARE_PROPERTIES.of_burning.turns : 2} turns`}`;
    case 'of_vampirism':    return `${p.value}% lifesteal`;
    case 'of_thorns':       return `${p.value} thorns`;
    case 'of_regeneration': return `+${p.value} regen/round`;
  }
}
```

> **Note** about `formatRareProperty` for burning: the displayed turn count is the `turns` constant on `RARE_PROPERTIES.of_burning` (currently `2`). The expression looks awkward because TypeScript needs to discriminate the union — simpler equivalent:
>
> ```ts
> case 'of_burning': {
>   const def = RARE_PROPERTIES.of_burning;
>   return `burns ${def.turns} turns`; // "burns 2 turns"
> }
> ```
>
> Use the simpler form. The test fixtures expect "burns 2 turns".

Replace the `case 'of_burning':` line with:

```ts
    case 'of_burning': {
      return `burns ${RARE_PROPERTIES.of_burning.turns} turns`;
    }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/items/__tests__/selectors.test.ts`
Expected: 11 passing (3 filter + 3 displayName + 5 affixDescription).

---

## Task 3: Selectors — `previewStats`

The stat-preview computation. Equipment-only effective stats (no traits, no wounds) per spec §2.

**Files:**
- Modify: `src/items/selectors.ts`
- Modify: `src/items/__tests__/selectors.test.ts`

- [ ] **Step 1: Append failing tests to `src/items/__tests__/selectors.test.ts`**

```ts
import { createHero } from '../../heroes/hero';
import { previewStats } from '../selectors';

describe('previewStats', () => {
  it('returns currentStats and previewStats based on equipment-only math', () => {
    const knight = createHero('knight', 'K', 'h1', 'quick', '0');
    // Knight starter: sword_basic (+1 atk) + shield_basic (+1 def). Knight class baseStats.attack = 4.
    // currentStats.attack should be class base 4 + sword 1 = 5.
    const swap: Item = {
      id: 'w2', baseId: 'sword_basic', slot: 'weapon', rarity: 'uncommon',
      weaponType: 'sword', affixes: [{ affixId: 'of_power', value: 2 }], floorRolledAt: 1,
    };
    const result = previewStats(knight, swap, 'weapon');
    expect(result.currentStats.attack).toBe(5);          // 4 + 1
    expect(result.previewStats.attack).toBe(5 + 2);      // base 4 + sword 1 + of_power +2
    expect(result.deltas.attack).toBe(2);
  });

  it('deltas object only contains stats that changed', () => {
    const knight = createHero('knight', 'K', 'h1', 'quick', '0');
    const sameSword: Item = {
      id: 'w2', baseId: 'sword_basic', slot: 'weapon', rarity: 'common',
      weaponType: 'sword', affixes: [], floorRolledAt: 1,
    };
    const result = previewStats(knight, sameSword, 'weapon');
    // Same sword (no affixes) — no deltas.
    expect(result.deltas).toEqual({});
  });

  it('vigor outfit affix flows through into hp delta', () => {
    const archer = createHero('archer', 'A', 'h1', 'quick', '0');
    const cloak: Item = {
      id: 'o', baseId: 'outfit_cloth', slot: 'outfit', rarity: 'uncommon',
      affixes: [{ affixId: 'of_vigor', value: 6 }], floorRolledAt: 1,
    };
    const result = previewStats(archer, cloak, 'outfit');
    // Archer base hp 14. Cloak adds outfit_cloth base hp (+6) and of_vigor (+6) = +12.
    expect(result.currentStats.hp).toBe(14);
    expect(result.previewStats.hp).toBe(14 + 6 + 6);
    expect(result.deltas.hp).toBe(12);
  });

  it('uses the swap-into-slot semantics (replaces existing item in slot)', () => {
    const knight = createHero('knight', 'K', 'h1', 'quick', '0');
    // Replace shield with a +2 defense shield.
    const stoutShield: Item = {
      id: 's2', baseId: 'shield_basic', slot: 'shield', rarity: 'uncommon',
      affixes: [{ affixId: 'of_the_bear', value: 2 }], floorRolledAt: 1,
    };
    const result = previewStats(knight, stoutShield, 'shield');
    // Knight base def 4 + shield_basic (+1) = 5. Replace with same shield +2 → 4 + 1 + 2 = 7.
    expect(result.currentStats.defense).toBe(5);
    expect(result.previewStats.defense).toBe(7);
    expect(result.deltas.defense).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `npx vitest run src/items/__tests__/selectors.test.ts -t "previewStats"`
Expected: FAIL — `previewStats is not exported`.

- [ ] **Step 3: Add `previewStats` to `src/items/selectors.ts`**

Append:

```ts
import type { Stats } from '../combat/types';
import type { Hero } from '../heroes/hero';
import type { HeroEquipment } from '../data/types';
import { applyEquipmentStats } from './stats';

export interface StatPreview {
  currentStats: Stats;
  previewStats: Stats;
  /** Only stats whose values changed are present. */
  deltas: Partial<Stats>;
}

/**
 * Equipment-only effective stats: class baseStats + equipment (base + affixes).
 * Trait and wound effects are intentionally excluded — they're invariant across
 * the swap and would shift both columns identically without changing the delta.
 * Matches the existing Barracks display convention.
 */
export function previewStats(hero: Hero, item: Item, slot: ItemSlot): StatPreview {
  const currentStats = applyEquipmentStats(hero.baseStats, hero.equipment);
  const simulatedEquipment: HeroEquipment = swapIntoSlot(hero.equipment, item, slot);
  const previewStatsResult = applyEquipmentStats(hero.baseStats, simulatedEquipment);

  const deltas: Partial<Stats> = {};
  for (const k of Object.keys(currentStats) as (keyof Stats)[]) {
    if (currentStats[k] !== previewStatsResult[k]) {
      deltas[k] = previewStatsResult[k] - currentStats[k];
    }
  }
  return { currentStats, previewStats: previewStatsResult, deltas };
}

function swapIntoSlot(equipment: HeroEquipment, item: Item, slot: ItemSlot): HeroEquipment {
  if (slot === 'weapon') return { ...equipment, weapon: item };
  return { ...equipment, [slot]: item };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/items/__tests__/selectors.test.ts`
Expected: all (11 + 4) passing.

---

## Task 4: `equipFromPack`

Atomic transaction: remove from pack, equip on hero, push displaced (if any) back to pack, recompute maxHp.

**Files:**
- Create: `src/run/equip_run.ts`
- Create: `src/run/__tests__/equip_run.test.ts`

- [ ] **Step 1: Create `src/run/__tests__/equip_run.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Item } from '../../data/types';
import { createHero } from '../../heroes/hero';
import { addItem, createPack } from '../pack';
import { startRun } from '../run_state';
import { createRng } from '../../util/rng';
import { equipFromPack } from '../equip_run';

const sword = (id: string, overrides: Partial<Item> = {}): Item => ({
  id, baseId: 'sword_basic', slot: 'weapon', rarity: 'common',
  weaponType: 'sword', affixes: [], floorRolledAt: 1, ...overrides,
});

const outfit = (id: string, overrides: Partial<Item> = {}): Item => ({
  id, baseId: 'outfit_cloth', slot: 'outfit', rarity: 'common',
  affixes: [], floorRolledAt: 1, ...overrides,
});

function makeRunWithPackItems(items: readonly Item[]) {
  const party = [
    createHero('knight', 'K', 'h0', 'quick', '0'),
    createHero('archer', 'A', 'h1', 'quick', '0'),
    createHero('priest', 'P', 'h2', 'quick', '0'),
  ];
  const rs = startRun('crypt', party, 1, createRng(1));
  let pack = createPack();
  for (const it of items) pack = addItem(pack, it);
  return { ...rs, pack };
}

describe('equipFromPack — happy paths', () => {
  it('swaps weapon: hero gets new, old weapon goes to pack', () => {
    const newWeapon = sword('w_new', { affixes: [{ affixId: 'of_power', value: 1 }], rarity: 'uncommon' });
    const rs = makeRunWithPackItems([newWeapon]);
    const oldWeaponId = rs.party[0].equipment.weapon.id;
    const result = equipFromPack(rs, 0, 'w_new', 'weapon');
    expect(result.party[0].equipment.weapon.id).toBe('w_new');
    expect(result.pack.items.find((i) => i.id === oldWeaponId)).toBeDefined();
    expect(result.pack.items.find((i) => i.id === 'w_new')).toBeUndefined();
  });

  it('equips into empty slot: no displaced item', () => {
    const newOutfit = outfit('o_new');
    const rs = makeRunWithPackItems([newOutfit]);
    expect(rs.party[0].equipment.outfit).toBeUndefined();
    const result = equipFromPack(rs, 0, 'o_new', 'outfit');
    expect(result.party[0].equipment.outfit?.id).toBe('o_new');
    expect(result.pack.items).toHaveLength(0); // no displaced
  });

  it('clamps currentHp when newMaxHp is lower than old currentHp (rare case)', () => {
    // No mechanism in current data lowers maxHp on equip change, but the clamp logic
    // should still hold: if a hero somehow has currentHp > newMaxHp, it gets clamped.
    // Set up: hero with currentHp manually pushed above maxHp.
    const rs = makeRunWithPackItems([sword('w_new')]);
    const heroWithBoostedHp = { ...rs.party[0], currentHp: 999 };
    const rsWithBoost = { ...rs, party: [heroWithBoostedHp, rs.party[1], rs.party[2]] };
    const result = equipFromPack(rsWithBoost, 0, 'w_new', 'weapon');
    expect(result.party[0].currentHp).toBeLessThanOrEqual(result.party[0].maxHp);
  });

  it('vigor outfit raises maxHp; currentHp preserved if within new max', () => {
    const vigorOutfit = outfit('o_vigor', {
      rarity: 'rare',
      affixes: [{ affixId: 'of_vigor', value: 6 }],
    });
    const rs = makeRunWithPackItems([vigorOutfit]);
    const oldMaxHp = rs.party[0].maxHp;
    const oldCurrentHp = rs.party[0].currentHp;
    const result = equipFromPack(rs, 0, 'o_vigor', 'outfit');
    // outfit_cloth base (+6) + of_vigor (+6) = +12 max hp
    expect(result.party[0].maxHp).toBe(oldMaxHp + 6 + 6);
    expect(result.party[0].currentHp).toBe(oldCurrentHp); // unchanged
  });

  it('item identity preserved across equip → re-equip cycle', () => {
    const swordA = sword('a');
    const swordB = sword('b');
    const rs = makeRunWithPackItems([swordA, swordB]);
    const initialWeaponId = rs.party[0].equipment.weapon.id;
    const after1 = equipFromPack(rs, 0, 'a', 'weapon');
    const after2 = equipFromPack(after1, 0, 'b', 'weapon');
    // After two swaps, original starter weapon and item 'a' are both in pack with stable ids.
    const packIds = after2.pack.items.map((i) => i.id).sort();
    expect(packIds).toContain(initialWeaponId);
    expect(packIds).toContain('a');
    expect(after2.party[0].equipment.weapon.id).toBe('b');
  });
});

describe('equipFromPack — validation', () => {
  it('throws on out-of-bounds heroIndex without mutating state', () => {
    const rs = makeRunWithPackItems([sword('w')]);
    const snapshot = JSON.stringify(rs);
    expect(() => equipFromPack(rs, 5, 'w', 'weapon')).toThrow(/heroIndex/);
    expect(JSON.stringify(rs)).toBe(snapshot);
  });

  it('throws on missing item id without mutating state', () => {
    const rs = makeRunWithPackItems([]);
    const snapshot = JSON.stringify(rs);
    expect(() => equipFromPack(rs, 0, 'nope', 'weapon')).toThrow(/'nope'/);
    expect(JSON.stringify(rs)).toBe(snapshot);
  });

  it('throws on slot/item mismatch without mutating state', () => {
    const rs = makeRunWithPackItems([sword('w')]);
    const snapshot = JSON.stringify(rs);
    expect(() => equipFromPack(rs, 0, 'w', 'shield')).toThrow(/does not match target slot/);
    expect(JSON.stringify(rs)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `npx vitest run src/run/__tests__/equip_run.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/run/equip_run.ts`**

```ts
import { CLASSES } from '../data/classes';
import { TRAITS } from '../data/traits';
import type { ItemSlot } from '../data/types';
import { computeMaxHp } from '../heroes/hero';
import { equip, unequip } from '../items/equip';
import { addItem, removeItem } from './pack';
import type { RunState } from './run_state';

export function equipFromPack(
  runState: RunState,
  heroIndex: number,
  packItemId: string,
  slot: ItemSlot,
): RunState {
  if (heroIndex < 0 || heroIndex >= runState.party.length) {
    throw new Error(
      `equipFromPack: heroIndex ${heroIndex} out of bounds (party size ${runState.party.length})`,
    );
  }
  const hero = runState.party[heroIndex];
  const packItem = runState.pack.items.find((i) => i.id === packItemId);
  if (!packItem) {
    throw new Error(`equipFromPack: item id '${packItemId}' not in pack`);
  }
  if (packItem.slot !== slot) {
    throw new Error(
      `equipFromPack: item.slot '${packItem.slot}' does not match target slot '${slot}'`,
    );
  }

  const { hero: nextHero, displaced } = equip(hero, packItem, slot);
  const classDef = CLASSES[nextHero.classId];
  const trait = TRAITS[nextHero.traitId];
  const newMaxHp = computeMaxHp(classDef.baseStats.hp, trait, nextHero.equipment);
  const clampedHero = {
    ...nextHero,
    maxHp: newMaxHp,
    currentHp: Math.min(nextHero.currentHp, newMaxHp),
  };

  let nextPack = removeItem(runState.pack, packItemId);
  if (displaced !== undefined) nextPack = addItem(nextPack, displaced);

  const nextParty = [...runState.party];
  nextParty[heroIndex] = clampedHero;
  return { ...runState, party: nextParty, pack: nextPack };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/run/__tests__/equip_run.test.ts`
Expected: all (8) passing.

---

## Task 5: `unequipToPack`

The reverse transaction: shield/outfit/hat → pack. Throws on weapon.

**Files:**
- Modify: `src/run/equip_run.ts`
- Modify: `src/run/__tests__/equip_run.test.ts`

- [ ] **Step 1: Append failing tests**

```ts
import { unequipToPack } from '../equip_run';

describe('unequipToPack — happy paths', () => {
  it('moves shield to pack and clears the slot', () => {
    const rs = makeRunWithPackItems([]);
    expect(rs.party[0].equipment.shield).toBeDefined();
    const shieldId = rs.party[0].equipment.shield!.id;
    const result = unequipToPack(rs, 0, 'shield');
    expect(result.party[0].equipment.shield).toBeUndefined();
    expect(result.pack.items.map((i) => i.id)).toContain(shieldId);
  });

  it('no-op when slot is empty', () => {
    const rs = makeRunWithPackItems([]);
    expect(rs.party[0].equipment.outfit).toBeUndefined();
    const result = unequipToPack(rs, 0, 'outfit');
    expect(result).toBe(rs); // returns the same reference
  });

  it('recomputes maxHp after unequipping a vigor outfit', () => {
    // First equip a vigor outfit, then unequip it.
    const vigorOutfit = outfit('o_vigor', {
      rarity: 'rare',
      affixes: [{ affixId: 'of_vigor', value: 6 }],
    });
    const rs1 = makeRunWithPackItems([vigorOutfit]);
    const rs2 = equipFromPack(rs1, 0, 'o_vigor', 'outfit');
    const boostedMaxHp = rs2.party[0].maxHp;
    const rs3 = unequipToPack(rs2, 0, 'outfit');
    expect(rs3.party[0].maxHp).toBeLessThan(boostedMaxHp);
  });
});

describe('unequipToPack — validation', () => {
  it('throws on weapon slot', () => {
    const rs = makeRunWithPackItems([]);
    expect(() => unequipToPack(rs, 0, 'weapon')).toThrow(/weapon/);
  });

  it('throws on out-of-bounds heroIndex', () => {
    const rs = makeRunWithPackItems([]);
    expect(() => unequipToPack(rs, 9, 'shield')).toThrow(/heroIndex/);
  });
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `npx vitest run src/run/__tests__/equip_run.test.ts -t "unequipToPack"`
Expected: FAIL — `unequipToPack is not exported`.

- [ ] **Step 3: Append `unequipToPack` to `src/run/equip_run.ts`**

```ts
export function unequipToPack(
  runState: RunState,
  heroIndex: number,
  slot: ItemSlot,
): RunState {
  if (slot === 'weapon') {
    throw new Error('unequipToPack: cannot unequip the weapon slot — every hero must have a weapon');
  }
  if (heroIndex < 0 || heroIndex >= runState.party.length) {
    throw new Error(
      `unequipToPack: heroIndex ${heroIndex} out of bounds (party size ${runState.party.length})`,
    );
  }
  const hero = runState.party[heroIndex];
  const { hero: nextHero, item } = unequip(hero, slot);
  if (item === undefined) return runState;

  const classDef = CLASSES[nextHero.classId];
  const trait = TRAITS[nextHero.traitId];
  const newMaxHp = computeMaxHp(classDef.baseStats.hp, trait, nextHero.equipment);
  const clampedHero = {
    ...nextHero,
    maxHp: newMaxHp,
    currentHp: Math.min(nextHero.currentHp, newMaxHp),
  };

  const nextPack = addItem(runState.pack, item);
  const nextParty = [...runState.party];
  nextParty[heroIndex] = clampedHero;
  return { ...runState, party: nextParty, pack: nextPack };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/run/__tests__/equip_run.test.ts`
Expected: all (8 + 5) passing.

---

## Task 6: Pack pill HUD updates (item count visibility)

Two surgical edits — both pack pills now read `Pack: 50g · 3 items` (or just `Pack: 50g` when empty).

**Files:**
- Modify: `src/scenes/dungeon_scene.ts`
- Modify: `src/scenes/camp_screen_scene.ts`

- [ ] **Step 1: Edit `src/scenes/dungeon_scene.ts:refreshHud`**

Find the line:
```ts
this.hudPack.setText(`Pack: ${run.pack.gold}g`);
```
Replace with:
```ts
const itemCount = run.pack.items.length;
const packLabel =
  itemCount > 0
    ? `Pack: ${run.pack.gold}g · ${itemCount} item${itemCount === 1 ? '' : 's'}`
    : `Pack: ${run.pack.gold}g`;
this.hudPack.setText(packLabel);
```

- [ ] **Step 2: Edit `src/scenes/camp_screen_scene.ts:buildPackPill`**

Find:
```ts
private buildPackPill(run: RunState): void {
  this.add
    .rectangle(480, 130, 200, 40, 0x2a2418)
    .setStrokeStyle(2, 0xaa8844);
  this.add
    .text(480, 130, `Pack: ${run.pack.gold}g`, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffcc66',
    })
    .setOrigin(0.5);
}
```
Replace the inner text construction with:
```ts
private buildPackPill(run: RunState): void {
  const itemCount = run.pack.items.length;
  const label =
    itemCount > 0
      ? `Pack: ${run.pack.gold}g · ${itemCount} item${itemCount === 1 ? '' : 's'}`
      : `Pack: ${run.pack.gold}g`;
  // Pill widens slightly to fit the longer label when items are present.
  const width = itemCount > 0 ? 280 : 200;
  this.add
    .rectangle(480, 130, width, 40, 0x2a2418)
    .setStrokeStyle(2, 0xaa8844);
  this.add
    .text(480, 130, label, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffcc66',
    })
    .setOrigin(0.5);
}
```

- [ ] **Step 3: Run vitest + typecheck**

Run: `npx vitest run`
Expected: all green (no test changes; behavioral change only in HUD rendering).

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 7: `EquipPanelScene` scaffold + scene registration

Just the chrome — overlay, panel rect, title, close button, ESC binding. No content yet.

**Files:**
- Create: `src/scenes/equip_panel_scene.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create `src/scenes/equip_panel_scene.ts`**

```ts
import * as Phaser from 'phaser';
import type { ItemSlot } from '../data/types';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 920;
const PANEL_H = 460;

type Selection =
  | { kind: 'none' }
  | { kind: 'pack-item'; itemId: string }
  | { kind: 'equipped-slot'; slot: ItemSlot };

export class EquipPanelScene extends Phaser.Scene {
  private selectedHeroIndex: number = 0;
  private selection: Selection = { kind: 'none' };
  private packPageStart: number = 0;
  private contentContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('equip_panel');
  }

  create(): void {
    // Reset per-launch state — Phaser scene instances are reused.
    this.selectedHeroIndex = 0;
    this.selection = { kind: 'none' };
    this.packPageStart = 0;

    this.buildOverlayAndPanel();
    this.buildCloseButton();
    this.contentContainer = this.add.container(0, 0);
    this.repaint();

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private buildOverlayAndPanel(): void {
    const overlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0);
    overlay.setInteractive();
    // Click outside the panel rect = close. The panel rect (built next, layered
    // on top) intercepts its own clicks first.
    overlay.on('pointerdown', () => this.close());

    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666)
      .setInteractive(); // intercepts clicks so they don't bubble to overlay

    this.add
      .text(PANEL_CX, 60, 'Equip', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }

  private buildCloseButton(): void {
    const closeBg = this.add
      .rectangle(933, 63, 28, 28, 0x553333)
      .setStrokeStyle(1, 0x885555);
    this.add
      .text(933, 63, '×', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => this.close());
  }

  private repaint(): void {
    this.contentContainer.removeAll(true);
    // Content built in subsequent tasks: party list, equipment slots, pack list, button.
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp_screen');
  }
}
```

- [ ] **Step 2: Register the scene in `src/main.ts`**

Add the import:
```ts
import { EquipPanelScene } from './scenes/equip_panel_scene';
```

Add to the scene array, after `CampScreenScene`:
```ts
  scene: [
    BootScene,
    CampScene,
    TavernPanelScene,
    BarracksPanelScene,
    NoticeboardPanelScene,
    DungeonScene,
    CombatScene,
    CampScreenScene,
    EquipPanelScene,
    MainScene,
    ExplorerScene,
  ],
```

- [ ] **Step 3: Verify build is clean**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: all existing tests pass.

> **Note on tests:** the codebase convention is no scene-level smoke tests (`src/scenes/__tests__/` only contains `app_state.test.ts`). The spec proposed adding one for this panel; in practice, adding scene tests requires Phaser test infrastructure that doesn't exist in the repo. **Skipping the panel-scene smoke test in deference to existing conventions** — the underlying logic (equip_run, selectors) is fully tested at the pure-TS layer.

---

## Task 8: Left pane (party list) + Zone 2 (equipment slots) + selection model

Build the left pane (3 hero rows with mini-equipment-strip) and the right pane's equipment-slot squares (4 horizontal squares, click to select equipped non-weapon slot for unequip preview).

**Files:**
- Modify: `src/scenes/equip_panel_scene.ts`

- [ ] **Step 1: Add helpers and constants near the top of the file**

After the existing constants (`PANEL_CX`, etc.), add:

```ts
import { BASE_ITEMS } from '../data/items';
import type { Item } from '../data/types';
import type { Hero } from '../heroes/hero';
import type { RunState } from '../run/run_state';

const LEFT_PANE_CX = 185;
const LEFT_PANE_W = 260;
const LEFT_PANE_H = 360;
const PARTY_ROW_Y = [180, 270, 360] as const;
const PARTY_ROW_H = 90;

const RIGHT_PANE_CX = 635;
const RIGHT_PANE_W = 640;
const RIGHT_PANE_H = 360;

const SLOTS: readonly ItemSlot[] = ['weapon', 'shield', 'outfit', 'hat'];
const SLOT_SQUARE_SIZE = 56;
const SLOT_STRIP_Y = 235;
const SLOT_STRIP_X = [475, 565, 655, 745] as const;

const RARITY_COLOR: Record<'common' | 'uncommon' | 'rare', number> = {
  common: 0xcccccc,
  uncommon: 0x4488ff,
  rare: 0xffcc66,
};

const SELECTION_GOLD = 0xffcc66;
```

(`Item` was imported earlier in spec but verify it's in the imports at top.)

- [ ] **Step 2: Replace the empty `repaint()` with party-list + slot-strip rendering**

Replace the `repaint()` body with:

```ts
  private repaint(): void {
    this.contentContainer.removeAll(true);
    const run = appState.get().runState;
    if (!run || run.status !== 'camp_screen') return;

    this.buildLeftPane(run);
    this.buildRightPane(run);
  }

  private buildLeftPane(run: RunState): void {
    // Pane background
    this.contentContainer.add(
      this.add
        .rectangle(LEFT_PANE_CX, PANEL_CY, LEFT_PANE_W, LEFT_PANE_H, 0x1a1a1a)
        .setStrokeStyle(1, 0x444444),
    );

    // 3 hero rows
    for (let i = 0; i < run.party.length; i++) {
      this.buildHeroRow(run.party[i], i, PARTY_ROW_Y[i]);
    }
  }

  private buildHeroRow(hero: Hero, index: number, y: number): void {
    const isSelected = this.selectedHeroIndex === index;
    const bg = this.add
      .rectangle(LEFT_PANE_CX, y, LEFT_PANE_W - 20, PARTY_ROW_H - 4, 0x222222)
      .setStrokeStyle(2, isSelected ? SELECTION_GOLD : 0x444444);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      this.selectedHeroIndex = index;
      this.selection = { kind: 'none' };
      this.packPageStart = 0;
      this.repaint();
    });
    this.contentContainer.add(bg);

    // Hero name + class
    this.contentContainer.add(
      this.add.text(LEFT_PANE_CX - LEFT_PANE_W / 2 + 14, y - 28, hero.name, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      }),
    );
    this.contentContainer.add(
      this.add.text(LEFT_PANE_CX - LEFT_PANE_W / 2 + 14, y - 12, `${hero.classId} · HP ${hero.currentHp}/${hero.maxHp}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#aaaaaa',
      }),
    );

    // Mini-equipment-strip: 4 small squares
    const stripY = y + 22;
    const stripStartX = LEFT_PANE_CX - LEFT_PANE_W / 2 + 20;
    for (let s = 0; s < SLOTS.length; s++) {
      const slot = SLOTS[s];
      const item = hero.equipment[slot];
      const sx = stripStartX + s * 26;
      this.contentContainer.add(
        this.add
          .rectangle(sx, stripY, 22, 22, 0x111111)
          .setStrokeStyle(1, item ? RARITY_COLOR[item.rarity] : 0x333333),
      );
    }
  }

  private buildRightPane(run: RunState): void {
    this.contentContainer.add(
      this.add
        .rectangle(RIGHT_PANE_CX, PANEL_CY, RIGHT_PANE_W, RIGHT_PANE_H, 0x1a1a1a)
        .setStrokeStyle(1, 0x444444),
    );
    this.buildSlotStrip(run);
  }

  private buildSlotStrip(run: RunState): void {
    const hero = run.party[this.selectedHeroIndex];
    if (!hero) return;
    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const item = hero.equipment[slot];
      this.buildSlotSquare(slot, item, SLOT_STRIP_X[i]);
    }
  }

  private buildSlotSquare(slot: ItemSlot, item: Item | undefined, x: number): void {
    const isSelected =
      this.selection.kind === 'equipped-slot' && this.selection.slot === slot;
    const isWeapon = slot === 'weapon';
    const borderColor = item
      ? RARITY_COLOR[item.rarity]
      : 0x444444;
    const square = this.add
      .rectangle(x, SLOT_STRIP_Y, SLOT_SQUARE_SIZE, SLOT_SQUARE_SIZE, 0x222222)
      .setStrokeStyle(isSelected ? 3 : 2, isSelected ? SELECTION_GOLD : borderColor);

    // Sprite or empty-slot label
    if (item) {
      const sprite = this.add
        .sprite(x, SLOT_STRIP_Y, 'sprites', parseInt(BASE_ITEMS[item.baseId].spriteId, 10))
        .setScale(2);
      this.contentContainer.add(sprite);
    } else {
      this.contentContainer.add(
        this.add
          .text(x, SLOT_STRIP_Y, slot, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#666666',
          })
          .setOrigin(0.5),
      );
    }

    // Slot label below
    this.contentContainer.add(
      this.add
        .text(x, SLOT_STRIP_Y + SLOT_SQUARE_SIZE / 2 + 8, slot, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#888888',
        })
        .setOrigin(0.5),
    );

    // Tap behavior: only non-weapon occupied slots are interactive for selection.
    if (item && !isWeapon) {
      square.setInteractive({ useHandCursor: true });
      square.on('pointerdown', () => {
        if (isSelected) {
          // Second tap: commit unequip — wired in Task 9.
          // For now this task: just re-select (no-op visible change).
          return;
        }
        this.selection = { kind: 'equipped-slot', slot };
        this.repaint();
      });
    }
    this.contentContainer.add(square);
  }
```

> **Note on the sprite atlas:** `parseInt(BASE_ITEMS[item.baseId].spriteId, 10)` references the same sprite-frame index the paperdoll uses. The placeholder `'0'` for outfit/hat (TODO Cluster C · 2) renders as frame 0 — visually a body sprite — until those entries get bespoke art. Functionally safe.

- [ ] **Step 3: Verify scene mounts and renders**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run dev` (manual smoke check; no automated test)
- Open the game in a browser, complete a boss combat to reach camp_screen.
- Currently no Equip button exists yet (Task 11 adds it). Verify with `localStorage` or by inspecting the scene that the data flows correctly. Or, temporarily add a debug binding: `this.input.keyboard?.on('keydown-E', () => this.scene.launch('equip_panel'));` in camp_screen_scene's `create()` to test launching during dev. Remove the binding before committing.

Run: `npx vitest run`
Expected: all existing tests pass.

---

## Task 9: Zone 3 (pack list) + bottom button + commit handlers

Add the pack list with pagination and the contextual Equip/Unequip button. Wire commit handlers via `equipFromPack` and `unequipToPack`.

**Files:**
- Modify: `src/scenes/equip_panel_scene.ts`

- [ ] **Step 1: Add imports + constants**

```ts
import { itemAffixDescription, itemDisplayName } from '../items/selectors';
import { equipFromPack, unequipToPack } from '../run/equip_run';
```

After existing constants, append:

```ts
const PACK_LIST_X_LEFT = 360;
const PACK_LIST_Y_START = 320;
const PACK_LIST_ROW_H = 32;
const PACK_LIST_VISIBLE_ROWS = 4;
const PACK_PAGE_ARROW_X = 905;

const BUTTON_Y = 440;
const BUTTON_W = 240;
const BUTTON_H = 32;
const BUTTON_X = 800;

const SLOT_TAG: Record<ItemSlot, string> = {
  weapon: '[w]',
  shield: '[s]',
  outfit: '[o]',
  hat:    '[h]',
};
```

- [ ] **Step 2: Add `buildPackListAndButton` and helper methods**

After the existing `buildSlotStrip`, add:

```ts
  private buildPackListAndButton(run: RunState): void {
    // Header
    const itemCount = run.pack.items.length;
    this.contentContainer.add(
      this.add.text(PACK_LIST_X_LEFT, PACK_LIST_Y_START - 18, `Pack (${itemCount})`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#cccccc',
      }),
    );

    // Visible page slice
    const pageItems = run.pack.items.slice(
      this.packPageStart,
      this.packPageStart + PACK_LIST_VISIBLE_ROWS,
    );

    if (pageItems.length === 0) {
      this.contentContainer.add(
        this.add.text(PACK_LIST_X_LEFT, PACK_LIST_Y_START + 20, 'Pack is empty.', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#888888',
        }),
      );
    } else {
      for (let i = 0; i < pageItems.length; i++) {
        this.buildPackRow(pageItems[i], i);
      }
    }

    // Pagination arrows (only when overflow)
    if (run.pack.items.length > PACK_LIST_VISIBLE_ROWS) {
      this.buildPaginationArrows(run);
    }

    // Bottom button
    this.buildBottomButton(run);
  }

  private buildPackRow(item: Item, indexInPage: number): void {
    const y = PACK_LIST_Y_START + indexInPage * PACK_LIST_ROW_H;
    const isSelected =
      this.selection.kind === 'pack-item' && this.selection.itemId === item.id;

    const bg = this.add
      .rectangle(PACK_LIST_X_LEFT + 250, y + 12, 510, PACK_LIST_ROW_H - 4,
        isSelected ? 0x2a2418 : 0x1a1a1a)
      .setStrokeStyle(1, isSelected ? SELECTION_GOLD : 0x222222);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.onPackRowTap(item));
    this.contentContainer.add(bg);

    // Slot tag prefix
    this.contentContainer.add(
      this.add.text(PACK_LIST_X_LEFT + 8, y + 4, SLOT_TAG[item.slot], {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#888888',
      }),
    );

    // Display name (rarity-colored) + rarity tag
    this.contentContainer.add(
      this.add.text(PACK_LIST_X_LEFT + 38, y + 2,
        `${itemDisplayName(item)}  [${item.rarity}]`,
      {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: this.rarityHex(item.rarity),
      }),
    );

    // Affix description (line 2)
    const affixDesc = itemAffixDescription(item);
    if (affixDesc.length > 0) {
      this.contentContainer.add(
        this.add.text(PACK_LIST_X_LEFT + 38, y + 18, affixDesc, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#999999',
        }),
      );
    }
  }

  private rarityHex(rarity: 'common' | 'uncommon' | 'rare'): string {
    return rarity === 'common' ? '#cccccc' : rarity === 'uncommon' ? '#4488ff' : '#ffcc66';
  }

  private buildPaginationArrows(run: RunState): void {
    const canPageUp = this.packPageStart > 0;
    const canPageDown = this.packPageStart + PACK_LIST_VISIBLE_ROWS < run.pack.items.length;

    const upArrow = this.add
      .text(PACK_PAGE_ARROW_X, PACK_LIST_Y_START + 6, '▲', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: canPageUp ? '#cccccc' : '#444444',
      })
      .setOrigin(0.5);
    if (canPageUp) {
      upArrow.setInteractive({ useHandCursor: true });
      upArrow.on('pointerdown', () => {
        this.packPageStart = Math.max(0, this.packPageStart - PACK_LIST_VISIBLE_ROWS);
        this.repaint();
      });
    }
    this.contentContainer.add(upArrow);

    const downArrow = this.add
      .text(PACK_PAGE_ARROW_X, PACK_LIST_Y_START + 110, '▼', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: canPageDown ? '#cccccc' : '#444444',
      })
      .setOrigin(0.5);
    if (canPageDown) {
      downArrow.setInteractive({ useHandCursor: true });
      downArrow.on('pointerdown', () => {
        this.packPageStart += PACK_LIST_VISIBLE_ROWS;
        this.repaint();
      });
    }
    this.contentContainer.add(downArrow);
  }

  private buildBottomButton(run: RunState): void {
    const enabled = this.selection.kind !== 'none';
    const label = this.buttonLabel(run);

    const bg = this.add
      .rectangle(BUTTON_X, BUTTON_Y, BUTTON_W, BUTTON_H,
        enabled ? 0x3a2a1a : 0x222222)
      .setStrokeStyle(2, enabled ? 0xcc8844 : 0x444444);
    this.contentContainer.add(bg);
    this.contentContainer.add(
      this.add.text(BUTTON_X, BUTTON_Y, label, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: enabled ? '#ffffff' : '#666666',
      }).setOrigin(0.5),
    );
    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.commit());
    }
  }

  private buttonLabel(run: RunState): string {
    if (this.selection.kind === 'pack-item') {
      const item = run.pack.items.find((i) => i.id === this.selection.itemId);
      if (item) return `Equip ${itemDisplayName(item)}`;
    }
    if (this.selection.kind === 'equipped-slot') {
      const hero = run.party[this.selectedHeroIndex];
      const item = hero?.equipment[this.selection.slot];
      if (item) return `Unequip ${itemDisplayName(item)}`;
    }
    return 'Equip';
  }

  private onPackRowTap(item: Item): void {
    if (this.selection.kind === 'pack-item' && this.selection.itemId === item.id) {
      // Second tap on same row: commit.
      this.commit();
      return;
    }
    this.selection = { kind: 'pack-item', itemId: item.id };
    this.repaint();
  }

  private commit(): void {
    if (this.selection.kind === 'pack-item') {
      const itemId = this.selection.itemId;
      const heroIdx = this.selectedHeroIndex;
      const run = appState.get().runState!;
      const item = run.pack.items.find((i) => i.id === itemId);
      if (!item) {
        this.selection = { kind: 'none' };
        this.repaint();
        return;
      }
      const slot = item.slot;
      appState.update((s) => ({
        ...s,
        runState: equipFromPack(s.runState!, heroIdx, itemId, slot),
      }));
    } else if (this.selection.kind === 'equipped-slot') {
      const slot = this.selection.slot;
      const heroIdx = this.selectedHeroIndex;
      appState.update((s) => ({
        ...s,
        runState: unequipToPack(s.runState!, heroIdx, slot),
      }));
    }
    this.selection = { kind: 'none' };
    this.repaint();
  }
```

- [ ] **Step 3: Wire `buildPackListAndButton` into `buildRightPane`**

Update `buildRightPane`:

```ts
  private buildRightPane(run: RunState): void {
    this.contentContainer.add(
      this.add
        .rectangle(RIGHT_PANE_CX, PANEL_CY, RIGHT_PANE_W, RIGHT_PANE_H, 0x1a1a1a)
        .setStrokeStyle(1, 0x444444),
    );
    this.buildSlotStrip(run);
    this.buildPackListAndButton(run);
  }
```

Also update the slot-square second-tap branch from Task 8 (which was a no-op) to commit:

In `buildSlotSquare`, replace the inner `if (isSelected) { return; }` block with:

```ts
      square.setInteractive({ useHandCursor: true });
      square.on('pointerdown', () => {
        if (this.selection.kind === 'equipped-slot' && this.selection.slot === slot) {
          this.commit();
          return;
        }
        this.selection = { kind: 'equipped-slot', slot };
        this.repaint();
      });
```

- [ ] **Step 4: Verify build + manual smoke**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: all green.

Manual smoke (with the temporary `keydown-E` binding from Task 8 if still present):
- Trigger a few combats, reach camp_screen, press E.
- Verify pack list shows items, hero rows show equipment, equip and unequip both work.
- Verify pagination arrows appear with 5+ items.

---

## Task 10: Zone 1 (hero header + stat preview)

Add the top zone of the right pane: hero name/class header + current effective stats line + previewed stats line (only when an item or slot is selected).

**Files:**
- Modify: `src/scenes/equip_panel_scene.ts`

- [ ] **Step 1: Add the import**

```ts
import { previewStats, type StatPreview } from '../items/selectors';
```

- [ ] **Step 2: Add helpers and constants**

```ts
const HEADER_X_LEFT = 350;
const HEADER_NAME_Y = 110;
const HEADER_STATS_CURRENT_Y = 132;
const HEADER_STATS_PREVIEW_Y = 158;
const PREVIEW_ARROW_Y = 145;
```

- [ ] **Step 3: Add `buildZoneOne` method**

```ts
  private buildZoneOne(run: RunState): void {
    const hero = run.party[this.selectedHeroIndex];
    if (!hero) return;

    // Header line
    this.contentContainer.add(
      this.add.text(HEADER_X_LEFT, HEADER_NAME_Y, `${hero.name} ◆ ${hero.classId}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      }),
    );

    // Current stats (equipment-only effective math)
    const preview = this.computePreviewIfSelected(run, hero);
    const currentLine = this.formatStatsLine(preview ? preview.currentStats : this.computeEquipmentStats(hero));
    this.contentContainer.add(
      this.add.text(HEADER_X_LEFT, HEADER_STATS_CURRENT_Y, currentLine, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#dddddd',
      }),
    );

    // Preview row (only when selection is active)
    if (preview) {
      this.contentContainer.add(
        this.add.text(HEADER_X_LEFT + 100, PREVIEW_ARROW_Y, '↓', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#888888',
        }),
      );
      this.buildPreviewStatsLine(preview);
    }
  }

  private computePreviewIfSelected(run: RunState, hero: Hero): StatPreview | null {
    if (this.selection.kind === 'pack-item') {
      const item = run.pack.items.find((i) => i.id === this.selection.itemId);
      if (item) return previewStats(hero, item, item.slot);
    }
    if (this.selection.kind === 'equipped-slot') {
      // Preview the unequip — simulate by computing stats with the slot removed.
      // We synthesize a "zero-effect" item so previewStats can do the diff. Cleaner:
      // compute current stats and stats-without-the-item directly.
      return this.previewUnequipStats(hero, this.selection.slot);
    }
    return null;
  }

  private previewUnequipStats(hero: Hero, slot: ItemSlot): StatPreview {
    const item = hero.equipment[slot];
    if (!item) {
      const current = this.computeEquipmentStats(hero);
      return { currentStats: current, previewStats: current, deltas: {} };
    }
    const currentStats = this.computeEquipmentStats(hero);
    const equipmentWithoutSlot = { ...hero.equipment };
    delete (equipmentWithoutSlot as Record<string, unknown>)[slot];
    // applyEquipmentStats is the same engine as previewStats uses internally.
    // Import it directly for this branch.
    const preview = applyEquipmentStats(hero.baseStats, equipmentWithoutSlot as HeroEquipment);
    const deltas: Partial<Stats> = {};
    for (const k of Object.keys(currentStats) as (keyof Stats)[]) {
      if (currentStats[k] !== preview[k]) {
        deltas[k] = preview[k] - currentStats[k];
      }
    }
    return { currentStats, previewStats: preview, deltas };
  }

  private computeEquipmentStats(hero: Hero): Stats {
    return applyEquipmentStats(hero.baseStats, hero.equipment);
  }

  private formatStatsLine(stats: Stats): string {
    return `HP ${stats.hp}  ATK ${stats.attack}  DEF ${stats.defense}  SPD ${stats.speed}  MND ${stats.mind}  CRT ${stats.crit}%  DDG ${stats.dodge}%`;
  }

  private buildPreviewStatsLine(preview: StatPreview): void {
    // Render each stat token; color it green/red if it changed.
    // All 7 stats included so any affix-driven delta surfaces (crit, dodge, mind affected by affixes).
    const tokens: { text: string; color: string }[] = [];
    const keys: (keyof Stats)[] = ['hp', 'attack', 'defense', 'speed', 'mind', 'crit', 'dodge'];
    const labels: Record<keyof Stats, string> = {
      hp: 'HP', attack: 'ATK', defense: 'DEF', speed: 'SPD', mind: 'MND',
      crit: 'CRT', dodge: 'DDG',
    };
    const suffix: Partial<Record<keyof Stats, string>> = { crit: '%', dodge: '%' };
    for (const k of keys) {
      const delta = preview.deltas[k];
      let color = '#dddddd';
      if (delta !== undefined && delta > 0) color = '#44cc44';
      else if (delta !== undefined && delta < 0) color = '#cc4444';
      tokens.push({ text: `${labels[k]} ${preview.previewStats[k]}${suffix[k] ?? ''}`, color });
    }
    let xCursor = HEADER_X_LEFT;
    for (const tok of tokens) {
      const t = this.add.text(xCursor, HEADER_STATS_PREVIEW_Y, tok.text, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: tok.color,
      });
      this.contentContainer.add(t);
      xCursor += t.width + 16;
    }
  }
```

- [ ] **Step 4: Add the missing imports for `applyEquipmentStats`, `Stats`, `HeroEquipment`**

At the top of the file, ensure these imports exist (some may be in place already from prior tasks — additive):

```ts
import { applyEquipmentStats } from '../items/stats';
import type { HeroEquipment } from '../data/types';
import type { Stats } from '../combat/types';
```

- [ ] **Step 5: Wire `buildZoneOne` into `buildRightPane`**

Update:

```ts
  private buildRightPane(run: RunState): void {
    this.contentContainer.add(
      this.add
        .rectangle(RIGHT_PANE_CX, PANEL_CY, RIGHT_PANE_W, RIGHT_PANE_H, 0x1a1a1a)
        .setStrokeStyle(1, 0x444444),
    );
    this.buildZoneOne(run);
    this.buildSlotStrip(run);
    this.buildPackListAndButton(run);
  }
```

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: all green.

Manual smoke (via the temporary E binding):
- Tap a pack item → preview row appears with green/red coloring on changed stats.
- Tap an equipped non-weapon slot → preview row appears with the inverse delta.
- Tap a hero row → preview clears (selection reset).

---

## Task 11: Wire Equip button into camp_screen + RESUME-driven restart

Add the Equip button to the `camp_screen_scene` button row. Wire RESUME to `scene.restart()` so the camp_screen rebuilds against mutated state when the panel closes. Remove the temporary `keydown-E` debug binding if it was added in Task 8.

**Files:**
- Modify: `src/scenes/camp_screen_scene.ts`

- [ ] **Step 1: Update `buildButtons` to a 3-button row**

Current:
```ts
  private buildButtons(run: RunState): void {
    const leaveBg = this.add
      .rectangle(300, 470, 220, 44, 0x2a4a2a)
      .setStrokeStyle(2, 0x44cc44);
    this.add
      .text(300, 470, `Leave (+${run.pack.gold}g to vault)`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    leaveBg.setInteractive({ useHandCursor: true });
    leaveBg.on('pointerdown', () => this.onLeave());

    const pressOnBg = this.add
      .rectangle(660, 470, 220, 44, 0x3a2a1a)
      .setStrokeStyle(2, 0xcc8844);
    this.add
      .text(660, 470, `Press On → Floor ${run.currentFloorNumber + 1}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    pressOnBg.setInteractive({ useHandCursor: true });
    pressOnBg.on('pointerdown', () => this.onPressOn());
  }
```

Replace with:

```ts
  private buildButtons(run: RunState): void {
    // Three-button row: Equip · Leave · Press On
    const equipEnabled = this.equipButtonEnabled(run);
    const equipBg = this.add
      .rectangle(160, 470, 220, 44, equipEnabled ? 0x2a2a4a : 0x222222)
      .setStrokeStyle(2, equipEnabled ? 0x6688cc : 0x444444);
    this.add
      .text(160, 470, 'Equip', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: equipEnabled ? '#ffffff' : '#666666',
      })
      .setOrigin(0.5);
    if (equipEnabled) {
      equipBg.setInteractive({ useHandCursor: true });
      equipBg.on('pointerdown', () => {
        this.scene.launch('equip_panel');
        this.scene.pause();
      });
    }

    const leaveBg = this.add
      .rectangle(460, 470, 220, 44, 0x2a4a2a)
      .setStrokeStyle(2, 0x44cc44);
    this.add
      .text(460, 470, `Leave (+${run.pack.gold}g to vault)`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    leaveBg.setInteractive({ useHandCursor: true });
    leaveBg.on('pointerdown', () => this.onLeave());

    const pressOnBg = this.add
      .rectangle(760, 470, 220, 44, 0x3a2a1a)
      .setStrokeStyle(2, 0xcc8844);
    this.add
      .text(760, 470, `Press On → Floor ${run.currentFloorNumber + 1}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    pressOnBg.setInteractive({ useHandCursor: true });
    pressOnBg.on('pointerdown', () => this.onPressOn());
  }

  private equipButtonEnabled(run: RunState): boolean {
    if (run.pack.items.length > 0) return true;
    for (const hero of run.party) {
      if (hero.equipment.shield || hero.equipment.outfit || hero.equipment.hat) {
        return true;
      }
    }
    return false;
  }
```

- [ ] **Step 2: Add RESUME → `scene.restart()` in `create()`**

After the existing `this.buildButtons(run);` line in `create()`, append:

```ts
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.scene.restart());
```

- [ ] **Step 3: Remove the temporary debug E-binding (if Task 8 added one)**

If you inserted `this.input.keyboard?.on('keydown-E', () => this.scene.launch('equip_panel'));` into `camp_screen_scene.ts` for testing, remove it.

- [ ] **Step 4: Final verification**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: all green.

Run: `npm run build`
Expected: success.

Manual smoke (full flow):
- Run a fresh game → fight to boss → win.
- Camp screen shows pack pill with item count.
- Click "Equip" button → panel opens.
- Verify: select hero, tap pack item, see preview, tap Equip → swap commits.
- Tap × or ESC → panel closes; camp_screen rebuilds with updated equipment shown on hero cards.
- Verify Leave still cashes out properly (items go to stash via Section 5 of items-foundation work).
- Verify Press On preserves the equipment state into the next floor.

---

## Verification checklist

- [ ] `npm test` (all 768+ tests pass; expect ~30 new tests added across stats / selectors / equip_run).
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] Phaser firewall intact: `grep -r "from 'phaser'" src/data src/items src/run src/combat src/heroes src/save src/dungeon src/camp` returns nothing.
- [ ] Camp screen shows item count in pack pill.
- [ ] Equip button on camp_screen opens panel; ESC / × / outside-tap close it.
- [ ] Selecting a pack item shows stat preview with colored deltas.
- [ ] Selecting an equipped non-weapon slot shows unequip preview.
- [ ] Equip / Unequip commit persists to localStorage (close + reopen the page → equipment retained).
- [ ] Vigor outfit raises maxHp; current HP doesn't auto-heal.

---

## Open follow-ups (out of scope this plan)

- TODO #11 mid-floor rest-area equip access (just launch `equip_panel` from the rest-area overlay).
- Stash UI at the camp hub (Blacksmith / hub-equip scene) — this is the future cleanup that uses banked stash items.
- Bespoke outfit/hat sprites (TODO Cluster C · 2) — currently outfit/hat slot squares show frame 0 placeholder.
- Lost-hero handling (TODO #15) and its interaction with the equip panel's hero list.
- Accessibility: keyboard navigation through hero rows / pack list / button (currently mouse/touch only).
