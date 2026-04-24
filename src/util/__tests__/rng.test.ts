import { describe, it, expect } from 'vitest';
import { createRng } from '../rng';

describe('rng.int', () => {
  it('returns integers within [min, max] inclusive', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(3, 8);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(8);
    }
  });

  it('reaches both endpoints over enough samples', () => {
    const rng = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.int(1, 6));
    expect(seen).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('returns min when min === max', () => {
    const rng = createRng(99);
    expect(rng.int(5, 5)).toBe(5);
    expect(rng.int(5, 5)).toBe(5);
  });

  it('is deterministic for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) {
      expect(a.int(0, 1000)).toBe(b.int(0, 1000));
    }
  });
});

describe('rng.pick', () => {
  it('returns an element from the given array', () => {
    const rng = createRng(2);
    const options = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 100; i++) {
      expect(options).toContain(rng.pick(options));
    }
  });

  it('can reach every element given enough samples', () => {
    const rng = createRng(3);
    const options = ['a', 'b', 'c', 'd'];
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(rng.pick(options));
    expect(seen).toEqual(new Set(options));
  });

  it('is deterministic for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const arr = [10, 20, 30, 40, 50];
    for (let i = 0; i < 100; i++) {
      expect(a.pick(arr)).toBe(b.pick(arr));
    }
  });

  it('throws when given an empty array', () => {
    const rng = createRng(1);
    expect(() => rng.pick([])).toThrow();
  });
});

describe('rng.shuffle', () => {
  it('returns a permutation of the input (same elements)', () => {
    const rng = createRng(5);
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = rng.shuffle(input);
    expect(shuffled.slice().sort((a, b) => a - b)).toEqual(input);
  });

  it('does not mutate the input array', () => {
    const rng = createRng(5);
    const input = [1, 2, 3, 4, 5];
    const snapshot = [...input];
    rng.shuffle(input);
    expect(input).toEqual(snapshot);
  });

  it('is deterministic for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(a.shuffle(input)).toEqual(b.shuffle(input));
  });

  it('actually shuffles (not identity) for large-enough arrays', () => {
    const rng = createRng(7);
    const input = Array.from({ length: 20 }, (_, i) => i);
    const shuffled = rng.shuffle(input);
    // With 20 elements, the identity permutation has probability 1/20! — effectively zero.
    expect(shuffled).not.toEqual(input);
  });

  it('handles empty and single-element arrays', () => {
    const rng = createRng(1);
    expect(rng.shuffle([])).toEqual([]);
    expect(rng.shuffle([42])).toEqual([42]);
  });
});

describe('rng.weighted', () => {
  it('returns values in rough proportion to their weights', () => {
    const rng = createRng(1);
    const options = [
      { value: 'common', weight: 70 },
      { value: 'rare', weight: 30 },
    ];
    const counts: Record<string, number> = { common: 0, rare: 0 };
    const N = 10000;
    for (let i = 0; i < N; i++) counts[rng.weighted(options)]++;
    // Expected ~70/30 split. Allow ±5% absolute tolerance.
    expect(counts.common / N).toBeGreaterThan(0.65);
    expect(counts.common / N).toBeLessThan(0.75);
    expect(counts.rare / N).toBeGreaterThan(0.25);
    expect(counts.rare / N).toBeLessThan(0.35);
  });

  it('always returns the only option when given one choice', () => {
    const rng = createRng(1);
    for (let i = 0; i < 10; i++) {
      expect(rng.weighted([{ value: 'only', weight: 5 }])).toBe('only');
    }
  });

  it('skips zero-weight options', () => {
    const rng = createRng(1);
    const options = [
      { value: 'never', weight: 0 },
      { value: 'always', weight: 1 },
    ];
    for (let i = 0; i < 100; i++) {
      expect(rng.weighted(options)).toBe('always');
    }
  });

  it('is deterministic for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const opts = [
      { value: 'x', weight: 3 },
      { value: 'y', weight: 2 },
      { value: 'z', weight: 1 },
    ];
    for (let i = 0; i < 100; i++) {
      expect(a.weighted(opts)).toBe(b.weighted(opts));
    }
  });

  it('throws on empty options', () => {
    const rng = createRng(1);
    expect(() => rng.weighted([])).toThrow();
  });

  it('throws if all weights are zero', () => {
    const rng = createRng(1);
    expect(() =>
      rng.weighted([
        { value: 'a', weight: 0 },
        { value: 'b', weight: 0 },
      ]),
    ).toThrow();
  });
});

describe('createRng', () => {
  it('produces a deterministic sequence from a given seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('returns values in [0, 1) from next()', () => {
    const rng = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is roughly uniform across 10 buckets over 10000 samples', () => {
    const rng = createRng(12345);
    const buckets = new Array(10).fill(0);
    const N = 10000;
    for (let i = 0; i < N; i++) {
      const bucket = Math.floor(rng.next() * 10);
      buckets[bucket]++;
    }
    // Each bucket should get ~1000; allow generous ±25% tolerance.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(750);
      expect(count).toBeLessThan(1250);
    }
  });
});
