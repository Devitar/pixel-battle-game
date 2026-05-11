import { TRAITS } from '@data/traits';
import type { TraitId } from '@data/types';
import { recomputeMaxHp, type Hero } from '@heroes/hero';
import type { Rng } from '@util/rng';

const ALL_TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

export const MAX_TRAITS_PER_HERO = 3;

export function chapelReplaceCost(hero: Hero): number {
  return 50 * hero.level;
}

/** Returns Infinity when the hero is at the cap — UI gates the Add button on this. */
export function chapelAddCost(hero: Hero): number {
  if (hero.traitIds.length >= MAX_TRAITS_PER_HERO) return Infinity;
  return 50 * hero.level * hero.traitIds.length;
}

export function rollNewTrait(currentIds: readonly TraitId[], rng: Rng): TraitId {
  const pool = ALL_TRAIT_IDS.filter((id) => !currentIds.includes(id));
  if (pool.length === 0) {
    throw new Error('rollNewTrait: no traits left in pool (hero has every trait)');
  }
  return rng.pick(pool);
}

export function replaceTrait(hero: Hero, indexToReplace: number, rng: Rng): Hero {
  if (indexToReplace < 0 || indexToReplace >= hero.traitIds.length) {
    throw new Error(
      `replaceTrait: invalid index ${indexToReplace} (have ${hero.traitIds.length})`,
    );
  }
  const newTrait = rollNewTrait(hero.traitIds, rng);
  const newTraitIds = hero.traitIds.map((id, i) => (i === indexToReplace ? newTrait : id));
  return recomputeMaxHp({ ...hero, traitIds: newTraitIds });
}

export function addTrait(hero: Hero, rng: Rng): Hero {
  if (hero.traitIds.length >= MAX_TRAITS_PER_HERO) {
    throw new Error(`addTrait: hero already at MAX_TRAITS_PER_HERO (${MAX_TRAITS_PER_HERO})`);
  }
  const newTrait = rollNewTrait(hero.traitIds, rng);
  return recomputeMaxHp({ ...hero, traitIds: [...hero.traitIds, newTrait] });
}
