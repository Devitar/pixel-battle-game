import { describe, expect, it } from 'vitest';
import type { HeroEquipment, Item } from '@data/types';
import type { Stats } from '@combat/types';
import {
  applyEquipmentStats,
  describeRarePropertyFields,
  rarePropertyFields,
} from '../stats';

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

describe('describeRarePropertyFields', () => {
  it('returns an empty array when no fields are present', () => {
    expect(describeRarePropertyFields({})).toEqual([]);
  });

  it('formats burningWeaponDamage as a fixed-2-turns burn line', () => {
    expect(describeRarePropertyFields({ burningWeaponDamage: 3 })).toEqual([
      'burns 2 turns (+3 dmg)',
    ]);
  });

  it('formats lifesteal / thorns / regen lines individually', () => {
    expect(describeRarePropertyFields({ lifestealPercent: 25 })).toEqual(['25% lifesteal']);
    expect(describeRarePropertyFields({ thornsDamage: 2 })).toEqual(['2 thorns']);
    expect(describeRarePropertyFields({ regenPerRound: 1 })).toEqual(['+1 regen/round']);
  });

  it('emits lines in fixed order (burning, lifesteal, thorns, regen) regardless of input key order', () => {
    const fields = {
      regenPerRound: 1,
      thornsDamage: 2,
      lifestealPercent: 25,
      burningWeaponDamage: 3,
    };
    expect(describeRarePropertyFields(fields)).toEqual([
      'burns 2 turns (+3 dmg)',
      '25% lifesteal',
      '2 thorns',
      '+1 regen/round',
    ]);
  });
});
