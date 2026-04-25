import { describe, expect, it } from 'vitest';
import { createHero } from '../../heroes/hero';
import {
  addHero,
  canAdd,
  createRoster,
  DEFAULT_ROSTER_CAPACITY,
  getHero,
  listHeroes,
  removeHero,
  updateHero,
} from '../roster';

describe('createRoster', () => {
  it('defaults capacity to 12', () => {
    const r = createRoster();
    expect(r.capacity).toBe(DEFAULT_ROSTER_CAPACITY);
    expect(r.heroes).toEqual([]);
  });

  it('accepts a custom capacity', () => {
    const r = createRoster(16);
    expect(r.capacity).toBe(16);
  });

  it('throws on non-positive capacity', () => {
    expect(() => createRoster(0)).toThrow();
    expect(() => createRoster(-5)).toThrow();
  });
});

describe('addHero', () => {
  it('appends to heroes and returns a new roster', () => {
    const r = createRoster();
    const h = createHero('knight', 'Eira', 'h1', 'quick', 'body1');
    const r2 = addHero(r, h);
    expect(r2.heroes).toEqual([h]);
    expect(r.heroes).toEqual([]);
  });

  it('throws at capacity', () => {
    let r = createRoster(2);
    r = addHero(r, createHero('knight', 'A', 'h1', 'quick', 'body1'));
    r = addHero(r, createHero('archer', 'B', 'h2', 'quick', 'body1'));
    expect(() => addHero(r, createHero('priest', 'C', 'h3', 'quick', 'body1'))).toThrow();
  });

  it('throws on duplicate id', () => {
    let r = createRoster();
    r = addHero(r, createHero('knight', 'A', 'h1', 'quick', 'body1'));
    expect(() => addHero(r, createHero('archer', 'B', 'h1', 'quick', 'body1'))).toThrow();
  });
});

describe('removeHero', () => {
  it('removes the matching hero and returns a new roster', () => {
    let r = createRoster();
    r = addHero(r, createHero('knight', 'A', 'h1', 'quick', 'body1'));
    r = addHero(r, createHero('archer', 'B', 'h2', 'quick', 'body1'));
    const r2 = removeHero(r, 'h1');
    expect(r2.heroes.map((h) => h.id)).toEqual(['h2']);
    expect(r.heroes.map((h) => h.id)).toEqual(['h1', 'h2']);
  });

  it('throws on missing id', () => {
    const r = createRoster();
    expect(() => removeHero(r, 'missing')).toThrow();
  });
});

describe('updateHero', () => {
  it('replaces by id, preserving array index', () => {
    let r = createRoster();
    r = addHero(r, createHero('knight', 'A', 'h1', 'quick', 'body1'));
    r = addHero(r, createHero('archer', 'B', 'h2', 'quick', 'body1'));
    const wounded = { ...r.heroes[0], currentHp: 5 };
    const r2 = updateHero(r, wounded);
    expect(r2.heroes[0].currentHp).toBe(5);
    expect(r2.heroes[0].id).toBe('h1');
    expect(r2.heroes[1].id).toBe('h2');
  });

  it('throws on missing id', () => {
    const r = createRoster();
    expect(() => updateHero(r, createHero('knight', 'A', 'h1', 'quick', 'body1'))).toThrow();
  });
});

describe('getHero', () => {
  it('returns the hero when present', () => {
    const r = addHero(createRoster(), createHero('knight', 'A', 'h1', 'quick', 'body1'));
    expect(getHero(r, 'h1')?.name).toBe('A');
  });

  it('returns undefined when missing', () => {
    expect(getHero(createRoster(), 'missing')).toBeUndefined();
  });
});

describe('listHeroes', () => {
  it('returns the heroes array', () => {
    let r = createRoster();
    r = addHero(r, createHero('knight', 'A', 'h1', 'quick', 'body1'));
    expect(listHeroes(r)).toHaveLength(1);
  });
});

describe('canAdd', () => {
  it('true under capacity', () => {
    expect(canAdd(createRoster(3))).toBe(true);
  });

  it('false at capacity', () => {
    let r = createRoster(1);
    r = addHero(r, createHero('knight', 'A', 'h1', 'quick', 'body1'));
    expect(canAdd(r)).toBe(false);
  });
});
