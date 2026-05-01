import { ENEMIES } from '@data/enemies';
import type { EnemyId } from '@data/types';
import type { Rng } from '@util/rng';
import { assignSlots } from './encounter';
import type { Encounter, ScaleFactors } from './node';

export const ELITE_HP_MULT = 1.5;
export const ELITE_ATTACK_MULT = 1.25;
const ELITE_SIZE = 4;

function isFrontLiner(enemyId: EnemyId): boolean {
  const preferred = ENEMIES[enemyId].preferredSlots;
  return preferred.some((s) => s === 1 || s === 2);
}

export function composeEliteEncounter(
  pool: readonly EnemyId[],
  scale: ScaleFactors,
  rng: Rng,
): Encounter {
  const picks: EnemyId[] = [];
  for (let i = 0; i < ELITE_SIZE; i++) {
    picks.push(rng.pick(pool));
  }

  if (!picks.some(isFrontLiner)) {
    const frontPool = pool.filter(isFrontLiner);
    picks[0] = rng.pick(frontPool);
  }

  return {
    enemies: assignSlots(picks),
    scale: {
      hp: scale.hp * ELITE_HP_MULT,
      attack: scale.attack * ELITE_ATTACK_MULT,
    },
  };
}
