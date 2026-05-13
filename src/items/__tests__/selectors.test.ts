import { describe, expect, it } from 'vitest';
import type { Item } from '@data/types';
import type { Pack } from '@run/pack';
import { filterPackBySlot, itemAffixDescription, itemDisplayName, itemFlavor } from '../selectors';

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

  it('legendary item: returns the LegendaryDef name (not the baseId name)', () => {
    const item: Item = {
      id: 'i', baseId: 'hat_hood', slot: 'hat', rarity: 'legendary',
      affixes: [], floorRolledAt: 10, legendaryId: 'lichs_crown',
    };
    expect(itemDisplayName(item)).toBe("Lich's Crown");
  });
});

describe('itemFlavor', () => {
  it('returns the LegendaryDef.flavor for legendary items', () => {
    const item: Item = {
      id: 'i', baseId: 'hat_hood', slot: 'hat', rarity: 'legendary',
      affixes: [], floorRolledAt: 10, legendaryId: 'lichs_crown',
    };
    expect(itemFlavor(item)).toContain('vertebrae');
  });

  it('returns undefined for non-legendary items', () => {
    expect(itemFlavor(sword('a'))).toBeUndefined();
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

import { createHero } from '@heroes/hero';
import { previewStats } from '../selectors';

describe('previewStats', () => {
  it('returns currentStats and previewStats based on equipment-only math', () => {
    const knight = createHero('knight', 'K', 'h1', 'quick', '0');
    const swap: Item = {
      id: 'w2', baseId: 'sword_basic', slot: 'weapon', rarity: 'uncommon',
      weaponType: 'sword', affixes: [{ affixId: 'of_power', value: 2 }], floorRolledAt: 1,
    };
    const result = previewStats(knight, swap, 'weapon');
    expect(result.currentStats.attack).toBe(5);          // class base 4 + sword 1
    expect(result.previewStats.attack).toBe(5 + 2);      // class base 4 + sword 1 + of_power +2
    expect(result.deltas.attack).toBe(2);
  });

  it('deltas object only contains stats that changed', () => {
    const knight = createHero('knight', 'K', 'h1', 'quick', '0');
    const sameSword: Item = {
      id: 'w2', baseId: 'sword_basic', slot: 'weapon', rarity: 'common',
      weaponType: 'sword', affixes: [], floorRolledAt: 1,
    };
    const result = previewStats(knight, sameSword, 'weapon');
    expect(result.deltas).toEqual({});
  });

  it('vigor outfit affix flows through into hp delta', () => {
    const archer = createHero('archer', 'A', 'h1', 'quick', '0');
    const cloak: Item = {
      id: 'o', baseId: 'outfit_cloth', slot: 'outfit', rarity: 'uncommon',
      affixes: [{ affixId: 'of_vigor', value: 6 }], floorRolledAt: 1,
    };
    const result = previewStats(archer, cloak, 'outfit');
    expect(result.currentStats.hp).toBe(14);
    expect(result.previewStats.hp).toBe(14 + 6 + 6);
    expect(result.deltas.hp).toBe(12);
  });

  it('uses the swap-into-slot semantics (replaces existing item in slot)', () => {
    const knight = createHero('knight', 'K', 'h1', 'quick', '0');
    const stoutShield: Item = {
      id: 's2', baseId: 'shield_basic', slot: 'shield', rarity: 'uncommon',
      affixes: [{ affixId: 'of_the_bear', value: 2 }], floorRolledAt: 1,
    };
    const result = previewStats(knight, stoutShield, 'shield');
    expect(result.currentStats.defense).toBe(5);
    expect(result.previewStats.defense).toBe(7);
    expect(result.deltas.defense).toBe(2);
  });
});
