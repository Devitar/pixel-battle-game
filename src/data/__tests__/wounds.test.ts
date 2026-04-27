import { describe, expect, it } from 'vitest';
import { WOUNDS, WOUND_IDS } from '../wounds';
import type { WoundId } from '../types';

const EXPECTED_IDS: readonly WoundId[] = [
  'bruised',
  'hobbled',
  'concussed',
  'winded',
  'unsteady',
  'broken_bone',
];

describe('WOUNDS', () => {
  it('registers every expected wound id', () => {
    for (const id of EXPECTED_IDS) {
      expect(WOUNDS[id], `missing wound ${id}`).toBeDefined();
    }
  });

  it('has no stray entries', () => {
    expect(Object.keys(WOUNDS).sort()).toEqual([...EXPECTED_IDS].sort());
  });

  it('WOUND_IDS contains every wound exactly once', () => {
    expect([...WOUND_IDS].sort()).toEqual([...EXPECTED_IDS].sort());
  });

  describe.each(EXPECTED_IDS)('wound %s', (id) => {
    it('has matching id field', () => {
      expect(WOUNDS[id].id).toBe(id);
    });

    it('has a non-empty name', () => {
      expect(WOUNDS[id].name.length).toBeGreaterThan(0);
    });

    it('has a defined effect', () => {
      const effect = WOUNDS[id].effect;
      expect(effect).toBeDefined();
      expect(['statDelta', 'damageTakenMult']).toContain(effect.kind);
    });
  });

  it('bruised is a damage-taken multiplier of 1.20', () => {
    expect(WOUNDS.bruised.effect).toEqual({ kind: 'damageTakenMult', multiplier: 1.20 });
  });

  it('hobbled reduces speed by 2', () => {
    expect(WOUNDS.hobbled.effect).toEqual({ kind: 'statDelta', stat: 'speed', delta: -2 });
  });

  it('broken_bone reduces hp by 10', () => {
    expect(WOUNDS.broken_bone.effect).toEqual({ kind: 'statDelta', stat: 'hp', delta: -10 });
  });
});
