import type { ItemSlot } from '../data/types';
import type { Rng } from '../util/rng';
import { rollShopItem } from './loot';
import type { ShopItem } from './node';

const SHOP_SLOTS: readonly ItemSlot[] = ['weapon', 'shield', 'outfit', 'hat'];

const BASE_PRICE_BY_RARITY = {
  common: 30,
  uncommon: 80,
  rare: 200,
} as const;

const PRICE_VARIANCE = 0.15;

export function generateShop(
  floorNumber: number,
  rng: Rng,
): { inventory: readonly ShopItem[] } {
  const inventory: ShopItem[] = SHOP_SLOTS.map((slot) => {
    const item = rollShopItem(rng, slot, floorNumber);
    const base = BASE_PRICE_BY_RARITY[item.rarity];
    const variance = (rng.next() * 2 - 1) * PRICE_VARIANCE;
    const price = Math.round(base * floorNumber * (1 + variance));
    return { item, price, sold: false };
  });
  return { inventory };
}
