import {
  PLAYER_BODY_SPRITES,
  PLAYER_FEET_SPRITES,
  PLAYER_LEGS_SPRITES,
} from '@data/body_sprites';
import { applyLevelUps, LEVEL_THRESHOLDS } from '@data/leveling';
import { NAMES } from '@data/names';
import { TRAITS } from '@data/traits';
import type { ClassId, PetSpeciesId, TraitId } from '@data/types';
import { createHero, type Hero } from '@heroes/hero';
import type { BuildingLevel } from '@save/save';
import type { Rng, WeightedOption } from '@util/rng';

export const HIRE_COST = 50;
export const REROLL_COST = 25;

export const HIRE_COST_BY_LEVEL: Record<1 | 2 | 3, number> = {
  1: 50,
  2: 150,
  3: 400,
};

export const LEVEL_ROLL_TABLE: Record<BuildingLevel, readonly WeightedOption<1 | 2 | 3>[]> = {
  1: [
    { value: 1, weight: 1.00 },
  ],
  2: [
    { value: 1, weight: 0.75 },
    { value: 2, weight: 0.25 },
  ],
  3: [
    { value: 1, weight: 0.65 },
    { value: 2, weight: 0.25 },
    { value: 3, weight: 0.10 },
  ],
};

function pickCandidateLevel(rng: Rng, tavernLevel: BuildingLevel): 1 | 2 | 3 {
  return rng.weighted(LEVEL_ROLL_TABLE[tavernLevel]);
}

const ALL_TRAIT_IDS = Object.keys(TRAITS) as TraitId[];
const PET_SPECIES_IDS: readonly PetSpeciesId[] = ['wolf', 'hawk', 'bear'];

export function generateCandidate(
  rng: Rng,
  unlockedClasses: readonly ClassId[],
  tavernLevel: BuildingLevel,
): Hero {
  const classId = rng.pick(unlockedClasses);
  const traitId = rng.pick(ALL_TRAIT_IDS);
  const bodySpriteId = rng.pick(PLAYER_BODY_SPRITES);
  const legsSpriteId = rng.pick(PLAYER_LEGS_SPRITES);
  const feetSpriteId = rng.pick(PLAYER_FEET_SPRITES);
  const name = rng.pick(NAMES);
  const id = `hero_${rng.int(100000, 999999)}`;
  const petSpeciesId = classId === 'hunter' ? rng.pick(PET_SPECIES_IDS) : undefined;
  const baseHero = createHero(
    classId, name, id, traitId, bodySpriteId, legsSpriteId, feetSpriteId, petSpeciesId,
  );
  const targetLevel = pickCandidateLevel(rng, tavernLevel);
  if (targetLevel === 1) return baseHero;
  const leveled = applyLevelUps(baseHero, 1, targetLevel);
  return { ...leveled, xp: LEVEL_THRESHOLDS[targetLevel - 1] };
}

export function generateCandidates(
  rng: Rng,
  unlockedClasses: readonly ClassId[],
  count: number,
  tavernLevel: BuildingLevel,
): Hero[] {
  const candidates: Hero[] = [];
  for (let i = 0; i < count; i++) {
    candidates.push(generateCandidate(rng, unlockedClasses, tavernLevel));
  }
  return candidates;
}

// Persisted-candidate gate: returns `current` unchanged when its length matches
// the requested count (panel reopen / hire-replace path), or a freshly-rolled
// set otherwise (empty save, or post-upgrade cap change). The "regenerate on
// mismatch" semantics double as the explicit reset signal when Tavern upgrades.
export function ensureCandidatesForCap(
  current: readonly Hero[],
  count: number,
  rng: Rng,
  unlockedClasses: readonly ClassId[],
  tavernLevel: BuildingLevel,
): readonly Hero[] {
  if (current.length === count) return current;
  return generateCandidates(rng, unlockedClasses, count, tavernLevel);
}

export function generateStarterRoster(rng: Rng): Hero[] {
  const classes: ClassId[] = ['knight', 'archer', 'priest'];
  return classes.map((classId) => {
    const traitId = rng.pick(ALL_TRAIT_IDS);
    const bodySpriteId = rng.pick(PLAYER_BODY_SPRITES);
    const legsSpriteId = rng.pick(PLAYER_LEGS_SPRITES);
    const feetSpriteId = rng.pick(PLAYER_FEET_SPRITES);
    const name = rng.pick(NAMES);
    const id = `hero_${rng.int(100000, 999999)}`;
    return createHero(classId, name, id, traitId, bodySpriteId, legsSpriteId, feetSpriteId);
  });
}
