import { CLASSES } from '../data/classes';
import type { Hero } from '../heroes/hero';
import type { Loadout } from './paperdoll';

export function heroToLoadout(hero: Hero): Loadout {
  const classDef = CLASSES[hero.classId];
  const starter = classDef.starterLoadout;
  return {
    body: parseInt(hero.bodySpriteId, 10),
    weapon: parseInt(starter.weapon, 10),
    shield: starter.shield !== undefined ? parseInt(starter.shield, 10) : undefined,
  };
}
