import { CLASSES } from '../data/classes';
import type { ClassId } from '../data/types';
import type { Stats } from '../combat/types';

export interface Hero {
  id: string;
  classId: ClassId;
  name: string;
  baseStats: Stats;
  currentHp: number;
  maxHp: number;
}

export function createHero(classId: ClassId, name: string, id: string): Hero {
  const def = CLASSES[classId];
  return {
    id,
    classId,
    name,
    baseStats: { ...def.baseStats },
    currentHp: def.baseStats.hp,
    maxHp: def.baseStats.hp,
  };
}
