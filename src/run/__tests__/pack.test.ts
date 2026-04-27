import { describe, expect, it } from 'vitest';
import type { Item } from '../../data/types';
import { addGold, addItem, createPack, emptyPack, removeItem, totalGold } from '../pack';

describe('Pack — gold', () => {
  it('createPack starts empty', () => {
    expect(createPack()).toEqual({ gold: 0, items: [] });
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
    expect(totalGold({ gold: 42, items: [] })).toBe(42);
  });

  it('emptyPack returns a zero-gold, empty-items pack', () => {
    expect(emptyPack({ gold: 99, items: [] })).toEqual({ gold: 0, items: [] });
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

const fakeItem = (id: string): Item => ({
  id,
  baseId: 'sword_basic',
  slot: 'weapon',
  rarity: 'common',
  weaponType: 'sword',
  affixes: [],
  floorRolledAt: 1,
});

describe('Pack — items', () => {
  it('createPack starts with empty items', () => {
    expect(createPack()).toEqual({ gold: 0, items: [] });
  });

  it('addItem returns a new pack with the item appended', () => {
    const p0 = createPack();
    const p1 = addItem(p0, fakeItem('a'));
    expect(p1.items).toHaveLength(1);
    expect(p1.items[0].id).toBe('a');
    expect(p0.items).toHaveLength(0);
  });

  it('removeItem returns a new pack without the matching item', () => {
    const p0 = addItem(addItem(createPack(), fakeItem('a')), fakeItem('b'));
    const p1 = removeItem(p0, 'a');
    expect(p1.items.map((i) => i.id)).toEqual(['b']);
  });

  it('removeItem throws on a missing id', () => {
    const p0 = addItem(createPack(), fakeItem('a'));
    expect(() => removeItem(p0, 'nope')).toThrow(/removeItem/);
  });
});
