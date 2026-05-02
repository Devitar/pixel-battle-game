import { PLAYER_BODY_SPRITES } from '@data/body_sprites';
import { NAMES } from '@data/names';
import { TRAITS } from '@data/traits';
import type { ClassId, TraitId } from '@data/types';
import { createHero, type Hero } from '@heroes/hero';
import type { Rng } from '@util/rng';

export const HIRE_COST = 50;
export const REROLL_COST = 25;

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
  count: number,
): Hero[] {
  const candidates: Hero[] = [];
  for (let i = 0; i < count; i++) {
    candidates.push(generateCandidate(rng, unlockedClasses));
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
): readonly Hero[] {
  if (current.length === count) return current;
  return generateCandidates(rng, unlockedClasses, count);
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
