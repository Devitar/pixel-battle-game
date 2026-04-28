import { describe, expect, it } from 'vitest';
import { AFFIXES, BASE_ITEMS, BASE_ITEM_STATS, RARE_PROPERTIES, WEAPON_DISPLAY_NAME } from '../items';
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

describe('WEAPON_DISPLAY_NAME', () => {
  it('has an entry for every WeaponType', () => {
    const weaponTypes = ['sword', 'axe', 'daggers', 'bow', 'staff', 'holy_symbol'] as const;
    for (const wt of weaponTypes) {
      expect(WEAPON_DISPLAY_NAME[wt], `missing entry for ${wt}`).toBeTruthy();
    }
  });

  it('holy_symbol displays as "Holy Symbol"', () => {
    expect(WEAPON_DISPLAY_NAME.holy_symbol).toBe('Holy Symbol');
  });
});
