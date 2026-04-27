import type { Item } from '../data/types';

export interface Pack {
  readonly gold: number;
  readonly items: readonly Item[];
}

export function createPack(): Pack {
  return { gold: 0, items: [] };
}

export function addGold(pack: Pack, amount: number): Pack {
  if (amount < 0) {
    throw new Error(`addGold: amount must be non-negative, got ${amount}`);
  }
  return { ...pack, gold: pack.gold + amount };
}

export function totalGold(pack: Pack): number {
  return pack.gold;
}

export function emptyPack(_pack: Pack): Pack {
  return { gold: 0, items: [] };
}

export function addItem(pack: Pack, item: Item): Pack {
  return { ...pack, items: [...pack.items, item] };
}

export function removeItem(pack: Pack, itemId: string): Pack {
  const idx = pack.items.findIndex((i) => i.id === itemId);
  if (idx < 0) {
    throw new Error(`removeItem: item id '${itemId}' not in pack`);
  }
  const items = [...pack.items.slice(0, idx), ...pack.items.slice(idx + 1)];
  return { ...pack, items };
}
