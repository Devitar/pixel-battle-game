import { BASE_ITEMS } from '@data/items';
import type { Hero } from '@heroes/hero';
import type { Loadout } from './paperdoll';

export function heroToLoadout(hero: Hero): Loadout {
  const eq = hero.equipment;
  return {
    body: parseInt(hero.bodySpriteId, 10),
    legs: parseInt(hero.legsSpriteId, 10),
    feet: parseInt(hero.feetSpriteId, 10),
    weapon: parseInt(BASE_ITEMS[eq.weapon.baseId].spriteId, 10),
    shield: eq.shield ? itemFrame(eq.shield.baseId) : undefined,
    outfit: eq.outfit ? itemFrame(eq.outfit.baseId) : undefined,
    hat: eq.hat ? itemFrame(eq.hat.baseId) : undefined,
  };
}

// '0' is the placeholder sentinel for items without a real sprite frame yet
// (currently hats per Cluster C · 2 — outfits wired up in Cluster B · 31).
// Returning undefined skips the layer entirely instead of rendering frame 0
// as a stacked visual artifact.
function itemFrame(baseId: keyof typeof BASE_ITEMS): number | undefined {
  const spriteId = BASE_ITEMS[baseId].spriteId;
  if (spriteId === '0') return undefined;
  return parseInt(spriteId, 10);
}
