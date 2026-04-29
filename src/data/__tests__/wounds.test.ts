import { describe, expect, it } from 'vitest';
import { WOUNDS, WOUND_IDS, describeWoundEffect } from '../wounds';
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

describe('describeWoundEffect', () => {
  it('describes bruised as +20% damage taken', () => {
    expect(describeWoundEffect(WOUNDS.bruised.effect)).toBe('+20% damage taken');
  });

  it('describes hobbled as -2 Speed', () => {
    expect(describeWoundEffect(WOUNDS.hobbled.effect)).toBe('-2 Speed');
  });

  it('describes concussed as -2 Mind', () => {
    expect(describeWoundEffect(WOUNDS.concussed.effect)).toBe('-2 Mind');
  });

  it('describes winded as -2 Attack', () => {
    expect(describeWoundEffect(WOUNDS.winded.effect)).toBe('-2 Attack');
  });

  it('describes unsteady as -5 Crit', () => {
    expect(describeWoundEffect(WOUNDS.unsteady.effect)).toBe('-5 Crit');
  });

  it('describes broken_bone as -10 Max HP', () => {
    expect(describeWoundEffect(WOUNDS.broken_bone.effect)).toBe('-10 Max HP');
  });
});
