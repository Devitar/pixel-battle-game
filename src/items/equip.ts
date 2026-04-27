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
