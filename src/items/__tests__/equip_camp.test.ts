import { describe, expect, it } from 'vitest';
import { addHero, createRoster } from '../../camp/roster';
import { addItems, createStash } from '../../camp/stash';
import type { Item } from '../../data/types';
import { createHero } from '../../heroes/hero';
import { equipFromStash, unequipToStash } from '../equip_camp';

function makeOutfitItem(id: string): Item {
  return {
    id,
    baseId: 'outfit_cloth',
    slot: 'outfit',
    rarity: 'common',
    affixes: [],
    floorRolledAt: 1,
  };
}

function makeShieldItem(id: string): Item {
  return {
    id,
    baseId: 'shield_basic',
    slot: 'shield',
    rarity: 'common',
    affixes: [],
    floorRolledAt: 1,
  };
}

function setup(items: Item[] = []) {
  const hero = createHero('knight', 'K', 'h0', 'quick', 'body1');
  const roster = addHero(createRoster(), hero);
  const stash = addItems(createStash(), items);
  return { hero, roster, stash };
}

describe('equipFromStash', () => {
  it('equips a stash item to an empty slot — hero gains item, stash loses it', () => {
    const outfit = makeOutfitItem('o1');
    const { hero, roster, stash } = setup([outfit]);
    expect(hero.equipment.outfit).toBeUndefined();

    const result = equipFromStash(roster, stash, hero.id, outfit.id, 'outfit');

    const updatedHero = result.roster.heroes.find((h) => h.id === hero.id)!;
    expect(updatedHero.equipment.outfit).toEqual(outfit);
    expect(result.stash.items.find((i) => i.id === outfit.id)).toBeUndefined();
  });

  it('swap: when slot is filled, displaced item returns to stash', () => {
    const outfit1 = makeOutfitItem('o1');
    const outfit2 = makeOutfitItem('o2');
    const { hero, roster, stash } = setup([outfit2]);
    // Pre-equip outfit1 onto hero before testing swap.
    const preResult = equipFromStash(roster, addItems(stash, [outfit1]), hero.id, outfit1.id, 'outfit');
    // Now swap to outfit2.
    const result = equipFromStash(preResult.roster, preResult.stash, hero.id, outfit2.id, 'outfit');

    const updatedHero = result.roster.heroes.find((h) => h.id === hero.id)!;
    expect(updatedHero.equipment.outfit?.id).toBe('o2');
    expect(result.stash.items.find((i) => i.id === 'o1')).toBeDefined();
    expect(result.stash.items.find((i) => i.id === 'o2')).toBeUndefined();
  });

  it('recomputes maxHp and clamps currentHp', () => {
    const outfit = makeOutfitItem('o1');
    const { hero, roster, stash } = setup([outfit]);
    const initialMaxHp = hero.maxHp;

    const result = equipFromStash(roster, stash, hero.id, outfit.id, 'outfit');
    const updatedHero = result.roster.heroes.find((h) => h.id === hero.id)!;

    // outfit_cloth grants +6 hp per BASE_ITEM_STATS.
    expect(updatedHero.maxHp).toBe(initialMaxHp + 6);
    // currentHp was at full; should still be ≤ maxHp.
    expect(updatedHero.currentHp).toBeLessThanOrEqual(updatedHero.maxHp);
  });

  it('throws on missing hero', () => {
    const outfit = makeOutfitItem('o1');
    const { roster, stash } = setup([outfit]);
    expect(() => equipFromStash(roster, stash, 'no-such-hero', outfit.id, 'outfit')).toThrow();
  });

  it('throws on missing item', () => {
    const { hero, roster, stash } = setup();
    expect(() => equipFromStash(roster, stash, hero.id, 'no-such-item', 'outfit')).toThrow();
  });

  it('throws on slot mismatch', () => {
    const outfit = makeOutfitItem('o1');
    const { hero, roster, stash } = setup([outfit]);
    expect(() => equipFromStash(roster, stash, hero.id, outfit.id, 'shield')).toThrow();
  });
});

describe('unequipToStash', () => {
  it('non-weapon slot: hero loses item, stash gains it', () => {
    const shield = makeShieldItem('s1');
    const { hero, roster, stash } = setup([shield]);
    const equipped = equipFromStash(roster, stash, hero.id, shield.id, 'shield');

    const result = unequipToStash(equipped.roster, equipped.stash, hero.id, 'shield');

    const updatedHero = result.roster.heroes.find((h) => h.id === hero.id)!;
    expect(updatedHero.equipment.shield).toBeUndefined();
    expect(result.stash.items.find((i) => i.id === 's1')).toBeDefined();
  });

  it('weapon slot throws', () => {
    const { hero, roster, stash } = setup();
    expect(() => unequipToStash(roster, stash, hero.id, 'weapon')).toThrow();
  });

  it('empty slot is a no-op (returns same roster + stash)', () => {
    // Knight starts with no outfit equipped.
    const { hero, roster, stash } = setup();
    const result = unequipToStash(roster, stash, hero.id, 'outfit');
    expect(result.roster).toBe(roster);
    expect(result.stash).toBe(stash);
  });

  it('throws on missing hero', () => {
    const { roster, stash } = setup();
    expect(() => unequipToStash(roster, stash, 'no-such-hero', 'shield')).toThrow();
  });
});

describe('roundtrip', () => {
  it('equip then unequip returns the item to stash', () => {
    const shield = makeShieldItem('s1');
    const { hero, roster, stash } = setup([shield]);

    const equipped = equipFromStash(roster, stash, hero.id, shield.id, 'shield');
    const unequipped = unequipToStash(equipped.roster, equipped.stash, hero.id, 'shield');

    const finalHero = unequipped.roster.heroes.find((h) => h.id === hero.id)!;
    // Knight starts with a starter shield; after equip+unequip the stash should
    // contain BOTH the original starter shield (displaced by the swap) AND the
    // 's1' stash shield (which got unequipped). Finds at least the s1 we put in.
    expect(finalHero.equipment.shield).toBeUndefined();
    expect(unequipped.stash.items.find((i) => i.id === 's1')).toBeDefined();
  });
});
