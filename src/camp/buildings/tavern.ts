import { PLAYER_BODY_SPRITES } from '../../data/body_sprites';
import { NAMES } from '../../data/names';
import { TRAITS } from '../../data/traits';
import type { ClassId, TraitId } from '../../data/types';
import { createHero, type Hero } from '../../heroes/hero';
import type { Rng } from '../../util/rng';

export const HIRE_COST = 50;
export const TAVERN_CANDIDATE_COUNT = 3;

const ALL_TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

export function generateCandidate(
  rng: Rng,
  unlockedClasses: readonly ClassId[],
): Hero {
  const classId = rng.pick(unlockedClasses);
  const traitId = rng.pick(ALL_TRAIT_IDS);
  const bodySpriteId = rng.pick(PLAYER_BODY_SPRITES);
  const name = rng.pick(NAMES);
  const id = `hero_${rng.int(100000, 999999)}`;
  return createHero(classId, name, id, traitId, bodySpriteId);
}

export function generateCandidates(
  rng: Rng,
  unlockedClasses: readonly ClassId[],
): Hero[] {
  const candidates: Hero[] = [];
  for (let i = 0; i < TAVERN_CANDIDATE_COUNT; i++) {
    candidates.push(generateCandidate(rng, unlockedClasses));
  }
  return candidates;
}

export function generateStarterRoster(rng: Rng): Hero[] {
  const classes: ClassId[] = ['knight', 'archer', 'priest'];
  return classes.map((classId) => {
    const traitId = rng.pick(ALL_TRAIT_IDS);
    const bodySpriteId = rng.pick(PLAYER_BODY_SPRITES);
    const name = rng.pick(NAMES);
    const id = `hero_${rng.int(100000, 999999)}`;
    return createHero(classId, name, id, traitId, bodySpriteId);
  });
}
