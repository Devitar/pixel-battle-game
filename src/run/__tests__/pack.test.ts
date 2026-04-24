import { describe, expect, it } from 'vitest';
import { addGold, createPack, emptyPack, totalGold } from '../pack';

describe('Pack', () => {
  it('createPack starts empty', () => {
    expect(createPack()).toEqual({ gold: 0 });
  });

  it('addGold returns a new pack with increased gold', () => {
    const p = createPack();
    const p2 = addGold(p, 10);
    expect(p2.gold).toBe(10);
    expect(p.gold).toBe(0);
  });

  it('addGold returns a new object even for zero amount', () => {
    const p = createPack();
    const p2 = addGold(p, 0);
    expect(p2).toEqual(p);
    expect(p2).not.toBe(p);
  });

  it('totalGold returns the gold field', () => {
    expect(totalGold({ gold: 42 })).toBe(42);
  });

  it('emptyPack returns a zero-gold pack', () => {
    expect(emptyPack({ gold: 99 })).toEqual({ gold: 0 });
  });

  it('addGold throws on negative amount', () => {
    expect(() => addGold(createPack(), -1)).toThrow();
  });

  it('pack additions are immutable — chain of adds preserves prior packs', () => {
    const p0 = createPack();
    const p1 = addGold(p0, 5);
    const p2 = addGold(p1, 10);
    expect(p0.gold).toBe(0);
    expect(p1.gold).toBe(5);
    expect(p2.gold).toBe(15);
  });
});
