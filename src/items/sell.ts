import { removeItem } from '@camp/stash';
import { credit } from '@camp/vault';
import type { Item, Rarity } from '@data/types';
import type { SaveFile } from '@save/save';

// Flat sell prices by rarity. Roughly 33% of floor-1 shop buy prices (30/80/200)
// per dungeon/shop.ts. Doesn't scale by floorRolledAt — kept simple for v1; if
// late-game balance needs late-floor rares to be worth more, swap to a
// floor-scaled formula in a single place.
const SELL_VALUE: Record<Rarity, number> = {
  common: 10,
  uncommon: 30,
  rare: 80,
  epic: 200,
};

export function itemSellValue(item: Item): number {
  return SELL_VALUE[item.rarity];
}

export function applyItemSell(state: SaveFile, itemId: string): SaveFile {
  const item = state.stash.items.find((i) => i.id === itemId);
  if (!item) {
    throw new Error(`applyItemSell: item id '${itemId}' not in stash`);
  }
  return {
    ...state,
    stash: removeItem(state.stash, itemId),
    vault: credit(state.vault, itemSellValue(item)),
  };
}
