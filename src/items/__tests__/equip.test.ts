import { describe, expect, it } from 'vitest';
import type { Item, ItemSlot } from '@data/types';
import type { Hero } from '@heroes/hero';
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
  traitIds: ['stout'],
  bodySpriteId: '0',
  legsSpriteId: '0',
  feetSpriteId: '0',
  wounds: [],
  equipment: { weapon: fake('w0', 'weapon') },
  xp: 0,
  level: 1,
  pendingPerks: [],
  pickedPerks: [],
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
