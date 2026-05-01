import { describe, expect, it } from 'vitest';
import { createRng } from '@util/rng';
import { generateShop } from '../shop';

describe('generateShop', () => {
  it('returns 4 items', () => {
    const { inventory } = generateShop(1, createRng(1));
    expect(inventory).toHaveLength(4);
  });

  it('items are in slot order: weapon, shield, outfit, hat', () => {
    const { inventory } = generateShop(1, createRng(1));
    expect(inventory.map((s) => s.item.slot)).toEqual(['weapon', 'shield', 'outfit', 'hat']);
  });

  it('all items start with sold: false', () => {
    const { inventory } = generateShop(1, createRng(1));
    for (const slot of inventory) expect(slot.sold).toBe(false);
  });

  it('prices are positive integers', () => {
    const { inventory } = generateShop(2, createRng(1));
    for (const slot of inventory) {
      expect(Number.isInteger(slot.price)).toBe(true);
      expect(slot.price).toBeGreaterThan(0);
    }
  });

  it('floor-1 common-rarity item: price in [25, 35]', () => {
    for (let seed = 1; seed < 50; seed++) {
      const { inventory } = generateShop(1, createRng(seed));
      for (const slot of inventory) {
        if (slot.item.rarity === 'common') {
          expect(slot.price, `seed ${seed} item ${slot.item.id}`).toBeGreaterThanOrEqual(25);
          expect(slot.price, `seed ${seed} item ${slot.item.id}`).toBeLessThanOrEqual(35);
        }
      }
    }
  });

  it('floor-3 rare-rarity item: price in [510, 690] (when found)', () => {
    let foundRare = false;
    for (let seed = 1; seed < 200 && !foundRare; seed++) {
      const { inventory } = generateShop(3, createRng(seed));
      for (const slot of inventory) {
        if (slot.item.rarity === 'rare') {
          expect(slot.price).toBeGreaterThanOrEqual(510);
          expect(slot.price).toBeLessThanOrEqual(690);
          foundRare = true;
          break;
        }
      }
    }
    expect(foundRare).toBe(true);
  });

  it('determinism: same seed produces identical inventory', () => {
    const a = generateShop(1, createRng(42));
    const b = generateShop(1, createRng(42));
    expect(a).toEqual(b);
  });

  it('floor 3 average price is roughly 2-4.5x floor 1 average', () => {
    const { inventory: f1 } = generateShop(1, createRng(99));
    const { inventory: f3 } = generateShop(3, createRng(99));
    const avgF1 = f1.reduce((acc, s) => acc + s.price, 0) / f1.length;
    const avgF3 = f3.reduce((acc, s) => acc + s.price, 0) / f3.length;
    expect(avgF3 / avgF1).toBeGreaterThan(2.0);
    expect(avgF3 / avgF1).toBeLessThan(4.5);
  });
});
