import { CLASSES } from '../data/classes';
import { TRAITS } from '../data/traits';
import type { ClassId, TraitDef, TraitId } from '../data/types';
import type { Stats } from '../combat/types';

export interface Hero {
  id: string;
  classId: ClassId;
  name: string;
  baseStats: Stats;
  currentHp: number;
  maxHp: number;
  traitId: TraitId;
  bodySpriteId: string;
}

export function createHero(
  classId: ClassId,
  name: string,
  id: string,
  traitId: TraitId,
  bodySpriteId: string,
): Hero {
  const def = CLASSES[classId];
  const maxHp = computeMaxHp(def.baseStats.hp, TRAITS[traitId]);
  return {
    id,
    classId,
    name,
    baseStats: { ...def.baseStats },
    currentHp: maxHp,
    maxHp,
    traitId,
    bodySpriteId,
  };
}

function computeMaxHp(classBaseHp: number, trait: TraitDef): number {
  if (!trait.hpEffect) return classBaseHp;
  const { delta, mode } = trait.hpEffect;
  if (mode === 'percent') {
    return Math.round(classBaseHp * (1 + delta / 100));
  }
  return classBaseHp + delta;
}
