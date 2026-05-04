import type { DungeonDef, EnemyId } from '@data/types';
import type { Rng, WeightedOption } from '@util/rng';
import type { RunState } from '@run/run_state';
import { assignSlots, isFrontLiner } from './encounter';
import type { Encounter, NodeType } from './node';
import { floorScale } from './scaling';

export function floorCap(floorNumber: number): number {
  return floorNumber >= 3 ? 2 : 1;
}

const PROBABILITY_BY_FLOOR: Record<number, number> = {
  1: 0.15,
  2: 0.20,
  3: 0.25,
};

function probabilityForFloor(floorNumber: number): number {
  return PROBABILITY_BY_FLOOR[floorNumber] ?? PROBABILITY_BY_FLOOR[3];
}

const SIZE_WEIGHTS: readonly WeightedOption<1 | 2>[] = [
  { value: 1, weight: 30 },
  { value: 2, weight: 70 },
];

export function rollSurprise(
  run: RunState,
  dungeon: DungeonDef,
  destinationType: NodeType,
  rng: Rng,
): Encounter | null {
  if (
    destinationType === 'combat' ||
    destinationType === 'elite' ||
    destinationType === 'boss'
  ) {
    return null;
  }
  if (run.surprisesThisFloor >= floorCap(run.currentFloorNumber)) {
    return null;
  }
  if (rng.next() >= probabilityForFloor(run.currentFloorNumber)) {
    return null;
  }

  const size = rng.weighted(SIZE_WEIGHTS);
  const picks: EnemyId[] = [];
  for (let i = 0; i < size; i++) {
    picks.push(rng.pick(dungeon.enemyPool));
  }
  if (!picks.some(isFrontLiner)) {
    const frontPool = dungeon.enemyPool.filter(isFrontLiner);
    picks[0] = rng.pick(frontPool);
  }

  return {
    enemies: assignSlots(picks),
    scale: floorScale(run.currentFloorNumber),
  };
}
