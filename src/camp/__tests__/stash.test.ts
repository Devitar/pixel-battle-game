import { describe, expect, it } from 'vitest';
import type { Item } from '../../data/types';
import { addItems, createStash, removeItem } from '../stash';

const fake = (id: string): Item => ({
  id, baseId: 'sword_basic', slot: 'weapon', rarity: 'common',
  weaponType: 'sword', affixes: [], floorRolledAt: 1,
});

describe('Stash', () => {
  it('createStash starts empty', () => {
    expect(createStash()).toEqual({ items: [] });
  });

  it('addItems appends; original stash unchanged', () => {
    const s0 = createStash();
    const s1 = addItems(s0, [fake('a'), fake('b')]);
    expect(s1.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(s0.items).toHaveLength(0);
  });

  it('addItems with empty array returns a new stash with same contents', () => {
    const s0 = addItems(createStash(), [fake('a')]);
    const s1 = addItems(s0, []);
    expect(s1.items.map((i) => i.id)).toEqual(['a']);
  });

  it('removeItem drops the matching id', () => {
    const s0 = addItems(createStash(), [fake('a'), fake('b'), fake('c')]);
    const s1 = removeItem(s0, 'b');
    expect(s1.items.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('removeItem throws on missing id', () => {
    const s0 = addItems(createStash(), [fake('a')]);
    expect(() => removeItem(s0, 'nope')).toThrow(/removeItem/);
  });
});
