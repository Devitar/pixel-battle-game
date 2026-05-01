import { describe, expect, it } from 'vitest';
import { BASE_ITEMS } from '../../data/items';
import type { Item } from '../../data/types';
import { createHero } from '../../heroes/hero';
import { heroToLoadout } from '../hero_loadout';

describe('heroToLoadout', () => {
  it('reads weapon sprite from equipped item, not class default', () => {
    const knight = createHero('knight', 'K', 'h1', 'quick', '5');
    const loadout = heroToLoadout(knight);
    expect(loadout.body).toBe(5);
    expect(loadout.weapon).toBe(parseInt(BASE_ITEMS.sword_basic.spriteId, 10));
    expect(loadout.shield).toBe(parseInt(BASE_ITEMS.shield_basic.spriteId, 10));
  });

  it('omits shield for heroes without one', () => {
    const archer = createHero('archer', 'A', 'h2', 'quick', '5');
    const loadout = heroToLoadout(archer);
    expect(loadout.shield).toBeUndefined();
  });

  it('uses the hero bodySpriteId for the body field', () => {
    const hero = createHero('knight', 'K', 'h0', 'quick', '162');
    const loadout = heroToLoadout(hero);
    expect(loadout.body).toBe(162);
  });

  it('omits outfit + hat for heroes without them equipped', () => {
    const archer = createHero('archer', 'A', 'h2', 'quick', '5');
    expect(archer.equipment.outfit).toBeUndefined();
    expect(archer.equipment.hat).toBeUndefined();
    const loadout = heroToLoadout(archer);
    expect(loadout.outfit).toBeUndefined();
    expect(loadout.hat).toBeUndefined();
  });

  it('placeholder spriteId "0" is treated as no-render (outfit slot)', () => {
    // outfit_cloth currently has spriteId '0' per Cluster C · 2 placeholder.
    // The guard in heroToLoadout should skip the layer rather than render frame 0.
    const outfit: Item = {
      id: 'o1',
      baseId: 'outfit_cloth',
      slot: 'outfit',
      rarity: 'common',
      affixes: [],
      floorRolledAt: 1,
    };
    const knight = createHero('knight', 'K', 'h1', 'quick', '5');
    const knightWithOutfit = {
      ...knight,
      equipment: { ...knight.equipment, outfit },
    };
    const loadout = heroToLoadout(knightWithOutfit);
    expect(loadout.outfit).toBeUndefined();
  });

  it('placeholder spriteId "0" is treated as no-render (hat slot)', () => {
    const hat: Item = {
      id: 'h1',
      baseId: 'hat_cap',
      slot: 'hat',
      rarity: 'common',
      affixes: [],
      floorRolledAt: 1,
    };
    const knight = createHero('knight', 'K', 'h1', 'quick', '5');
    const knightWithHat = {
      ...knight,
      equipment: { ...knight.equipment, hat },
    };
    const loadout = heroToLoadout(knightWithHat);
    expect(loadout.hat).toBeUndefined();
  });
});
