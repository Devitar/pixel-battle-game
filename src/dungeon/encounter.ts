import { ENEMIES } from '../data/enemies';
import type { EnemyId, SlotIndex } from '../data/types';
import type { Rng } from '../util/rng';
import type { Encounter, EnemyPlacement, ScaleFactors } from './node';

const ENCOUNTER_SIZE_WEIGHTS = [
  { value: 2, weight: 20 },
  { value: 3, weight: 60 },
  { value: 4, weight: 20 },
];

function isFrontLiner(enemyId: EnemyId): boolean {
  const preferred = ENEMIES[enemyId].preferredSlots;
  return preferred.some((s) => s === 1 || s === 2);
}

function assignSlots(enemies: readonly EnemyId[]): EnemyPlacement[] {
  const frontIds = enemies.filter(isFrontLiner);
  const backIds = enemies.filter((id) => !isFrontLiner(id));
  const placements: EnemyPlacement[] = [];
  let front = 1;
  let back = enemies.length;
  for (const id of frontIds) {
    placements.push({ enemyId: id, slot: front as SlotIndex });
    front += 1;
  }
  for (const id of backIds) {
    placements.push({ enemyId: id, slot: back as SlotIndex });
    back -= 1;
  }
  placements.sort((a, b) => a.slot - b.slot);
  return placements;
}

export function composeCombatEncounter(
  pool: readonly EnemyId[],
  scale: ScaleFactors,
  rng: Rng,
): Encounter {
  const size = rng.weighted(ENCOUNTER_SIZE_WEIGHTS);

  const picks: EnemyId[] = [];
  for (let i = 0; i < size; i++) {
    picks.push(rng.pick(pool));
  }

  if (!picks.some(isFrontLiner)) {
    const frontPool = pool.filter(isFrontLiner);
    picks[0] = rng.pick(frontPool);
  }

  return { enemies: assignSlots(picks), scale };
}

export function composeBossEncounter(
  bossId: EnemyId,
  pool: readonly EnemyId[],
  scale: ScaleFactors,
  rng: Rng,
): Encounter {
  const frontPool = pool.filter(isFrontLiner);
  const minion1 = rng.pick(frontPool);
  const minion2 = rng.pick(pool);

  const placements: EnemyPlacement[] = [
    { enemyId: minion1, slot: 1 as SlotIndex },
    { enemyId: minion2, slot: 2 as SlotIndex },
    { enemyId: bossId, slot: 3 as SlotIndex },
  ];

  return { enemies: placements, scale };
}
