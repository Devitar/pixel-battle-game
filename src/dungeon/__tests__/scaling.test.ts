import { describe, expect, it } from 'vitest';
import { floorScale } from '../scaling';

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
