import { describe, expect, it } from 'vitest';
import { MODIFIERS, MODIFIER_IDS } from '../modifiers';

describe('MODIFIERS table', () => {
  it('armored has statDelta defense +2', () => {
    expect(MODIFIERS.armored.id).toBe('armored');
    expect(MODIFIERS.armored.name).toBe('Armored');
    expect(MODIFIERS.armored.effect).toEqual({
      kind: 'statDelta',
      stat: 'defense',
      delta: 2,
    });
  });

  it('venomous has venomous_on_hit 2 dmg × 2 turns', () => {
    expect(MODIFIERS.venomous.id).toBe('venomous');
    expect(MODIFIERS.venomous.name).toBe('Venomous');
    expect(MODIFIERS.venomous.effect).toEqual({
      kind: 'venomous_on_hit',
      damagePerTurn: 2,
      duration: 2,
    });
  });

  it('enraged has enraged_threshold 0.5 / +3 attack', () => {
    expect(MODIFIERS.enraged.id).toBe('enraged');
    expect(MODIFIERS.enraged.name).toBe('Enraged');
    expect(MODIFIERS.enraged.effect).toEqual({
      kind: 'enraged_threshold',
      hpRatio: 0.5,
      attackDelta: 3,
    });
  });
});

describe('MODIFIER_IDS', () => {
  it('contains exactly the three modifier IDs', () => {
    expect(MODIFIER_IDS).toHaveLength(3);
    expect(new Set(MODIFIER_IDS)).toEqual(new Set(['armored', 'venomous', 'enraged']));
  });
});
