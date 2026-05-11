import { describe, expect, it } from 'vitest';
import { createRoster } from '@camp/roster';
import { addItems, createStash } from '@camp/stash';
import { createVault, credit } from '@camp/vault';
import { createDefaultUnlocks, type SaveFile } from '@save/save';
import type { Item, Rarity } from '@data/types';
import { applyItemSell, itemSellValue } from '../sell';

function makeItem(id: string, rarity: Rarity): Item {
  return {
    id,
    baseId: 'sword_basic',
    slot: 'weapon',
    rarity,
    weaponType: 'sword',
    affixes: [],
    floorRolledAt: 1,
  };
}

function makeState(items: readonly Item[], gold = 0): SaveFile {
  return {
    version: 1,
    roster: createRoster(),
    vault: credit(createVault(), gold),
    stash: addItems(createStash(), items),
    unlocks: createDefaultUnlocks(),
    buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1, training_grounds: 1 },
    hospitalTreatmentsRemaining: 1,
    tavernCandidates: [],
    traineeHeroIds: [null, null],
    campRngState: 0,
  };
}

describe('itemSellValue', () => {
  it('returns 10g for common', () => {
    expect(itemSellValue(makeItem('w', 'common'))).toBe(10);
  });

  it('returns 30g for uncommon', () => {
    expect(itemSellValue(makeItem('w', 'uncommon'))).toBe(30);
  });

  it('returns 80g for rare', () => {
    expect(itemSellValue(makeItem('w', 'rare'))).toBe(80);
  });
});

describe('applyItemSell', () => {
  it('removes the item from stash and credits the vault by its sell value', () => {
    const item = makeItem('w', 'uncommon');
    const before = makeState([item], 100);
    const after = applyItemSell(before, 'w');
    expect(after.stash.items).toHaveLength(0);
    expect(after.vault.gold).toBe(130); // 100 + 30
  });

  it('throws when the item is not in stash', () => {
    const before = makeState([makeItem('w', 'common')]);
    expect(() => applyItemSell(before, 'missing')).toThrow();
  });

  it('does not mutate input state', () => {
    const item = makeItem('w', 'rare');
    const before = makeState([item], 0);
    const snapshot = JSON.stringify(before);
    applyItemSell(before, 'w');
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('only removes the item with matching id when stash has multiple', () => {
    const a = makeItem('a', 'common');
    const b = makeItem('b', 'rare');
    const before = makeState([a, b], 0);
    const after = applyItemSell(before, 'b');
    expect(after.stash.items).toHaveLength(1);
    expect(after.stash.items[0].id).toBe('a');
    expect(after.vault.gold).toBe(80);
  });
});
