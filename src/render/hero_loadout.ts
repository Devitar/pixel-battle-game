import { BASE_ITEMS } from '../data/items';
import type { Hero } from '../heroes/hero';
import type { Loadout } from './paperdoll';

export function heroToLoadout(hero: Hero): Loadout {
  const eq = hero.equipment;
  return {
    body: parseInt(hero.bodySpriteId, 10),
    weapon: parseInt(BASE_ITEMS[eq.weapon.baseId].spriteId, 10),
    shield: eq.shield ? parseInt(BASE_ITEMS[eq.shield.baseId].spriteId, 10) : undefined,
  };
}
