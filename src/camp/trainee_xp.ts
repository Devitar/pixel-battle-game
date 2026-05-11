import { applyLevelUps, levelForXp } from '@data/leveling';
import type { SaveFile } from '@save/save';
import { TRAINEE_PRO_RATE } from './building_levels';

export interface TraineeXpResult {
  state: SaveFile;
  xpPerTrainee: number;
  eligibleCount: number;
}

/**
 * Grants trainee XP to every assigned, alive, non-active trainee.
 *
 * - Skips null slots, orphan ids (not in roster.heroes), and ids in `activeHeroIds`.
 * - Returns identity-preserved state when there's nothing to do.
 *
 * Pure: no Phaser, no I/O. Caller persists the returned state.
 */
export function grantTraineeXp(
  state: SaveFile,
  traineeXpBase: number,
  activeHeroIds: readonly string[],
): TraineeXpResult {
  if (!state.unlocks.buildings.includes('training_grounds')) {
    return { state, xpPerTrainee: 0, eligibleCount: 0 };
  }
  if (traineeXpBase === 0) {
    return { state, xpPerTrainee: 0, eligibleCount: 0 };
  }

  const level = state.buildingLevels.training_grounds;
  const proRate = TRAINEE_PRO_RATE[level];
  const xpPerTrainee = Math.round(traineeXpBase * proRate);

  const activeSet = new Set(activeHeroIds);
  const rosterById = new Map(state.roster.heroes.map((h) => [h.id, h]));

  let eligibleCount = 0;
  const nextHeroes = state.roster.heroes.slice();
  for (const slotId of state.traineeHeroIds) {
    if (slotId === null) continue;
    if (activeSet.has(slotId)) continue;
    const hero = rosterById.get(slotId);
    if (!hero) continue;

    eligibleCount += 1;
    const idx = nextHeroes.findIndex((h) => h.id === slotId);
    const before = nextHeroes[idx];
    const newXp = before.xp + xpPerTrainee;
    const newLevel = levelForXp(newXp);
    nextHeroes[idx] = applyLevelUps({ ...before, xp: newXp }, before.level, newLevel);
  }

  if (eligibleCount === 0) {
    return { state, xpPerTrainee: 0, eligibleCount: 0 };
  }

  return {
    state: { ...state, roster: { ...state.roster, heroes: nextHeroes } },
    xpPerTrainee,
    eligibleCount,
  };
}
