import { describe, expect, it } from 'vitest';
import { floorScale, goldMultiplier } from '../scaling';

describe('floorScale', () => {
  it('floor 1 is 1.0× on both stats', () => {
    expect(floorScale(1)).toEqual({ hp: 1.0, attack: 1.0 });
  });

  it('floor 2 is 1.1× on both stats', () => {
    const s = floorScale(2);
    expect(s.hp).toBeCloseTo(1.1);
    expect(s.attack).toBeCloseTo(1.1);
  });

  it('floor 10 is 1.9× on both stats', () => {
    const s = floorScale(10);
    expect(s.hp).toBeCloseTo(1.9);
    expect(s.attack).toBeCloseTo(1.9);
  });

  it('throws on floor 0', () => {
    expect(() => floorScale(0)).toThrow();
  });

  it('throws on negative floors', () => {
    expect(() => floorScale(-5)).toThrow();
  });
});

describe('floorScale — tier parameter', () => {
  it('default tier (no arg) equals tier=1 (parity)', () => {
    for (const f of [1, 2, 5, 10, 20]) {
      expect(floorScale(f)).toEqual(floorScale(f, 1));
    }
  });

  it('tier 1 today: floor 1 = 1.0×, floor 10 = 1.9× (regression-lock)', () => {
    expect(floorScale(1, 1).hp).toBeCloseTo(1.0);
    expect(floorScale(10, 1).hp).toBeCloseTo(1.9);
  });

  it('throws on floor 0 regardless of tier', () => {
    expect(() => floorScale(0, 1)).toThrow();
    expect(() => floorScale(0, 2)).toThrow();
  });
});

describe('goldMultiplier', () => {
  it('tier 1 returns 1 (identity)', () => {
    expect(goldMultiplier(1)).toBe(1);
  });

  it('tier 2-4 return 1 in spec 1 baseline (placeholder)', () => {
    expect(goldMultiplier(2)).toBe(1);
    expect(goldMultiplier(3)).toBe(1);
    expect(goldMultiplier(4)).toBe(1);
  });
});
