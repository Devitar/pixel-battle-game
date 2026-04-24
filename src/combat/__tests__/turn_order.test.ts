import { describe, expect, it } from 'vitest';
import { createRng } from '../../util/rng';
import { computeInitiative } from '../turn_order';
import { makeEnemyCombatant, makeHeroCombatant } from './helpers';

describe('computeInitiative', () => {
  it('is deterministic for a given seed', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    const combatants = [
      makeHeroCombatant('archer', 3, 'p0'),
      makeHeroCombatant('priest', 2, 'p1'),
      makeEnemyCombatant('skeleton_warrior', 1, 'e0'),
    ];
    expect(computeInitiative(combatants, rng1)).toEqual(computeInitiative(combatants, rng2));
  });

  it('sorts higher Speed earlier when gap exceeds variance', () => {
    const rng = createRng(1);
    const fastHero = makeHeroCombatant('archer', 3, 'p0');
    const slowHero = makeHeroCombatant('priest', 2, 'p1', {
      baseStats: { hp: 15, attack: 3, defense: 2, speed: 1 },
    });
    const order = computeInitiative([slowHero, fastHero], rng);
    expect(order).toEqual(['p0', 'p1']);
  });

  it('ties go to player side', () => {
    const hero = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 3 },
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 12, attack: 3, defense: 2, speed: 3 },
    });
    for (let seed = 1; seed <= 10; seed++) {
      const localRng = createRng(seed);
      const order = computeInitiative([enemy, hero], localRng);
      expect(order.includes('p0')).toBe(true);
      expect(order.includes('e0')).toBe(true);
    }
  });

  it('excludes dead combatants', () => {
    const rng = createRng(1);
    const alive = makeHeroCombatant('archer', 3, 'p0');
    const dead = makeHeroCombatant('knight', 1, 'p1', { isDead: true });
    const order = computeInitiative([alive, dead], rng);
    expect(order).toEqual(['p0']);
  });

  it('a single combatant is placed first', () => {
    const bigSpeedHero = makeHeroCombatant('archer', 1, 'p0', {
      baseStats: { hp: 10, attack: 1, defense: 1, speed: 100 },
    });
    for (let seed = 1; seed <= 5; seed++) {
      const rng = createRng(seed);
      const order = computeInitiative([bigSpeedHero], rng);
      expect(order).toEqual(['p0']);
    }
  });
});
