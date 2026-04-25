import { describe, expect, it } from 'vitest';
import { CLASSES } from '../../data/classes';
import { createHero } from '../../heroes/hero';
import { heroToLoadout } from '../hero_loadout';

describe('heroToLoadout', () => {
  it('Knight gets sword + shield from class starter loadout', () => {
    const hero = createHero('knight', 'K', 'h0', 'quick', '42');
    const loadout = heroToLoadout(hero);
    expect(loadout.body).toBe(42);
    expect(loadout.weapon).toBe(parseInt(CLASSES.knight.starterLoadout.weapon, 10));
    expect(loadout.shield).toBe(parseInt(CLASSES.knight.starterLoadout.shield!, 10));
  });

  it('Archer gets bow but no shield', () => {
    const hero = createHero('archer', 'A', 'h0', 'quick', '52');
    const loadout = heroToLoadout(hero);
    expect(loadout.body).toBe(52);
    expect(loadout.weapon).toBe(parseInt(CLASSES.archer.starterLoadout.weapon, 10));
    expect(loadout.shield).toBeUndefined();
  });

  it('Priest gets holy symbol but no shield', () => {
    const hero = createHero('priest', 'P', 'h0', 'quick', '108');
    const loadout = heroToLoadout(hero);
    expect(loadout.weapon).toBe(parseInt(CLASSES.priest.starterLoadout.weapon, 10));
    expect(loadout.shield).toBeUndefined();
  });

  it('uses the hero bodySpriteId for the body field', () => {
    const hero = createHero('knight', 'K', 'h0', 'quick', '162');
    const loadout = heroToLoadout(hero);
    expect(loadout.body).toBe(162);
  });
});
