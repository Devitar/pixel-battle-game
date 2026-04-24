import { describe, expect, it } from 'vitest';
import { TRAITS } from '../traits';
import type { TraitId } from '../types';

const EXPECTED_IDS: readonly TraitId[] = [
  'stout',
  'quick',
  'sturdy',
  'sharp_eyed',
  'cowardly',
  'nervous',
];

describe('TRAITS', () => {
  it('registers every expected trait id', () => {
    for (const id of EXPECTED_IDS) {
      expect(TRAITS[id], `missing trait ${id}`).toBeDefined();
    }
  });

  it('has no stray entries', () => {
    expect(Object.keys(TRAITS).sort()).toEqual([...EXPECTED_IDS].sort());
  });

  describe.each(EXPECTED_IDS)('trait %s', (id) => {
    it('has matching id field', () => {
      expect(TRAITS[id].id).toBe(id);
    });

    it('has a non-empty description', () => {
      expect(TRAITS[id].description.length).toBeGreaterThan(0);
    });

    it('has at least one effect (hpEffect or statEffects)', () => {
      const t = TRAITS[id];
      const hasHp = t.hpEffect !== undefined;
      const hasStat = t.statEffects !== undefined && t.statEffects.length > 0;
      expect(hasHp || hasStat).toBe(true);
    });

    it('hpEffect percent mode has delta within [-100, 100]', () => {
      const hp = TRAITS[id].hpEffect;
      if (hp && hp.mode === 'percent') {
        expect(hp.delta).toBeGreaterThanOrEqual(-100);
        expect(hp.delta).toBeLessThanOrEqual(100);
      }
    });

    it('every statEffect targets attack/defense/speed only', () => {
      const stats = TRAITS[id].statEffects ?? [];
      for (const e of stats) {
        expect(['attack', 'defense', 'speed']).toContain(e.stat);
      }
    });
  });
});
