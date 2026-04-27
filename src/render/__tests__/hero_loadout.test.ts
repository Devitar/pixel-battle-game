import { describe, expect, it } from 'vitest';
import { BASE_ITEMS } from '../../data/items';
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
});
