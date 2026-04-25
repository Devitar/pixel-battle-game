import type { Hero } from '../heroes/hero';

export const DEFAULT_ROSTER_CAPACITY = 12;

export interface Roster {
  readonly heroes: readonly Hero[];
  readonly capacity: number;
}

export function createRoster(capacity: number = DEFAULT_ROSTER_CAPACITY): Roster {
  if (capacity < 1) {
    throw new Error(`createRoster: capacity must be >= 1, got ${capacity}`);
  }
  return { heroes: [], capacity };
}

export function canAdd(roster: Roster): boolean {
  return roster.heroes.length < roster.capacity;
}

export function addHero(roster: Roster, hero: Hero): Roster {
  if (!canAdd(roster)) {
    throw new Error(`addHero: roster at capacity ${roster.capacity}`);
  }
  if (roster.heroes.some((h) => h.id === hero.id)) {
    throw new Error(`addHero: hero with id '${hero.id}' already in roster`);
  }
  return { ...roster, heroes: [...roster.heroes, hero] };
}

export function removeHero(roster: Roster, heroId: string): Roster {
  const idx = roster.heroes.findIndex((h) => h.id === heroId);
  if (idx === -1) {
    throw new Error(`removeHero: no hero with id '${heroId}'`);
  }
  return {
    ...roster,
    heroes: [...roster.heroes.slice(0, idx), ...roster.heroes.slice(idx + 1)],
  };
}

export function updateHero(roster: Roster, hero: Hero): Roster {
  const idx = roster.heroes.findIndex((h) => h.id === hero.id);
  if (idx === -1) {
    throw new Error(`updateHero: no hero with id '${hero.id}'`);
  }
  const next = [...roster.heroes];
  next[idx] = hero;
  return { ...roster, heroes: next };
}

export function getHero(roster: Roster, heroId: string): Hero | undefined {
  return roster.heroes.find((h) => h.id === heroId);
}

export function listHeroes(roster: Roster): readonly Hero[] {
  return roster.heroes;
}
