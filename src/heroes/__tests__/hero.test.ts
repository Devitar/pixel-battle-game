import { describe, expect, it } from 'vitest';
import { CLASSES } from '../../data/classes';
import { createHero } from '../hero';

describe('createHero', () => {
  it('builds a Knight with full HP from class base stats', () => {
    const h = createHero('knight', 'Eira', 'h1');
    expect(h.id).toBe('h1');
    expect(h.classId).toBe('knight');
    expect(h.name).toBe('Eira');
    expect(h.baseStats).toEqual(CLASSES.knight.baseStats);
    expect(h.currentHp).toBe(CLASSES.knight.baseStats.hp);
    expect(h.maxHp).toBe(CLASSES.knight.baseStats.hp);
  });

  it('two heroes with identical inputs are structurally equal', () => {
    const a = createHero('archer', 'Luna', 'h2');
    const b = createHero('archer', 'Luna', 'h2');
    expect(a).toEqual(b);
  });

  it('baseStats is a copy, not a reference to CLASSES', () => {
    const h = createHero('priest', 'Ser', 'h3');
    expect(h.baseStats).not.toBe(CLASSES.priest.baseStats);
  });
});
