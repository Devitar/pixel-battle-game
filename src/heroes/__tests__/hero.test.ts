import { describe, expect, it } from 'vitest';
import { CLASSES } from '../../data/classes';
import { createHero } from '../hero';

describe('createHero — basic shape', () => {
  it('builds a Knight with full HP and stored trait / body', () => {
    const h = createHero('knight', 'Eira', 'h1', 'quick', 'body1');
    expect(h.id).toBe('h1');
    expect(h.classId).toBe('knight');
    expect(h.name).toBe('Eira');
    expect(h.baseStats).toEqual(CLASSES.knight.baseStats);
    expect(h.currentHp).toBe(h.maxHp);
    expect(h.maxHp).toBe(CLASSES.knight.baseStats.hp);
    expect(h.traitId).toBe('quick');
    expect(h.bodySpriteId).toBe('body1');
  });

  it('two heroes with identical inputs are structurally equal', () => {
    const a = createHero('archer', 'Luna', 'h2', 'quick', 'body2');
    const b = createHero('archer', 'Luna', 'h2', 'quick', 'body2');
    expect(a).toEqual(b);
  });

  it('baseStats is a copy, not a reference to CLASSES', () => {
    const h = createHero('priest', 'Ser', 'h3', 'quick', 'body3');
    expect(h.baseStats).not.toBe(CLASSES.priest.baseStats);
  });
});

describe('createHero — HP trait baking', () => {
  it('Stout Knight: 20 × 1.10 = 22', () => {
    const h = createHero('knight', 'K', 'h1', 'stout', 'body1');
    expect(h.maxHp).toBe(22);
    expect(h.currentHp).toBe(22);
  });

  it('Stout Archer: 14 × 1.10 = 15.4 → round 15', () => {
    const h = createHero('archer', 'A', 'h1', 'stout', 'body1');
    expect(h.maxHp).toBe(15);
  });

  it('Stout Priest: 15 × 1.10 = 16.5 → round 17', () => {
    const h = createHero('priest', 'P', 'h1', 'stout', 'body1');
    expect(h.maxHp).toBe(17);
  });

  it('Quick Knight: HP unaffected', () => {
    const h = createHero('knight', 'K', 'h1', 'quick', 'body1');
    expect(h.maxHp).toBe(CLASSES.knight.baseStats.hp);
  });

  it('Non-HP traits leave HP at class default', () => {
    for (const trait of ['quick', 'sturdy', 'sharp_eyed', 'cowardly', 'nervous'] as const) {
      const h = createHero('knight', 'K', 'h1', trait, 'body1');
      expect(h.maxHp, `trait ${trait}`).toBe(CLASSES.knight.baseStats.hp);
    }
  });
});
