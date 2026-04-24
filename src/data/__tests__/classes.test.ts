import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../abilities';
import { CLASSES } from '../classes';
import type { ClassId } from '../types';

const EXPECTED_IDS: readonly ClassId[] = ['knight', 'archer', 'priest'];
const STATS: readonly ('hp' | 'attack' | 'defense' | 'speed')[] = [
  'hp',
  'attack',
  'defense',
  'speed',
];

describe('CLASSES', () => {
  it('registers every expected class id', () => {
    for (const id of EXPECTED_IDS) {
      expect(CLASSES[id], `missing class ${id}`).toBeDefined();
    }
  });

  it('has no stray entries', () => {
    const actual = Object.keys(CLASSES).sort();
    const expected = [...EXPECTED_IDS].sort();
    expect(actual).toEqual(expected);
  });

  describe.each(EXPECTED_IDS)('class %s', (id) => {
    it('has matching id field', () => {
      expect(CLASSES[id].id).toBe(id);
    });

    it('has all four base stats positive and finite', () => {
      for (const s of STATS) {
        const v = CLASSES[id].baseStats[s];
        expect(v, `${id}.${s}`).toBeGreaterThan(0);
        expect(Number.isFinite(v), `${id}.${s} finite`).toBe(true);
      }
    });

    it('lists only registered abilities', () => {
      for (const abilityId of CLASSES[id].abilities) {
        expect(ABILITIES[abilityId], `${id} references missing ability ${abilityId}`).toBeDefined();
      }
    });

    it('aiPriority is a subset of abilities', () => {
      const abilities = new Set<string>(CLASSES[id].abilities);
      for (const p of CLASSES[id].aiPriority) {
        expect(
          abilities.has(p),
          `${id} prioritizes ${p} which is not in its abilities list`,
        ).toBe(true);
      }
    });

    it('has a starter weapon sprite id', () => {
      expect(CLASSES[id].starterLoadout.weapon).toBeTruthy();
    });
  });

  it('Knight starts with a shield, Archer and Priest do not', () => {
    expect(CLASSES.knight.starterLoadout.shield).toBeTruthy();
    expect(CLASSES.archer.starterLoadout.shield).toBeUndefined();
    expect(CLASSES.priest.starterLoadout.shield).toBeUndefined();
  });
});
