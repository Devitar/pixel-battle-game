import type { Item } from '@data/types';

export interface Stash {
  readonly items: readonly Item[];
}

export function createStash(): Stash {
  return { items: [] };
}

export function addItems(stash: Stash, items: readonly Item[]): Stash {
  if (items.length === 0) return { items: [...stash.items] };
  return { items: [...stash.items, ...items] };
}

export function removeItem(stash: Stash, itemId: string): Stash {
  const idx = stash.items.findIndex((i) => i.id === itemId);
  if (idx < 0) {
    throw new Error(`removeItem: item id '${itemId}' not in stash`);
  }
  return { items: [...stash.items.slice(0, idx), ...stash.items.slice(idx + 1)] };
}
