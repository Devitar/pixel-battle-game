import { describe, expect, it } from 'vitest';
import { createRng } from '@util/rng';
import type { EnemyPlacement } from '../node';
import {
  fullPool,
  poolForFloor,
  rollModifier,
  stampCombatModifiers,
  stampEliteModifiers,
} from '../modifier_stamp';

const PLACEMENTS: EnemyPlacement[] = [
  { enemyId: 'skeleton_warrior', slot: 1 },
  { enemyId: 'skeleton_archer', slot: 4 },
];

describe('poolForFloor', () => {
  it('returns [] for floors 1..4', () => {
    expect(poolForFloor(1)).toEqual([]);
    expect(poolForFloor(4)).toEqual([]);
  });

  it('returns [armored] for floors 5..9', () => {
    expect(poolForFloor(5)).toEqual(['armored']);
    expect(poolForFloor(9)).toEqual(['armored']);
  });

  it('returns [armored, venomous] for floors 10..14', () => {
    expect(poolForFloor(10)).toEqual(['armored', 'venomous']);
    expect(poolForFloor(14)).toEqual(['armored', 'venomous']);
  });

  it('returns [armored, venomous, enraged] for floor 15+', () => {
    expect(poolForFloor(15)).toEqual(['armored', 'venomous', 'enraged']);
    expect(poolForFloor(30)).toEqual(['armored', 'venomous', 'enraged']);
  });
});

describe('fullPool', () => {
  it('returns all three modifier IDs', () => {
    expect(new Set(fullPool())).toEqual(new Set(['armored', 'venomous', 'enraged']));
  });
});

describe('rollModifier', () => {
  it('returns undefined for an empty pool', () => {
    expect(rollModifier([], createRng(1))).toBeUndefined();
  });

  it('returns a member of the pool for a non-empty pool', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const result = rollModifier(['armored', 'venomous'], createRng(seed));
      expect(['armored', 'venomous']).toContain(result);
    }
  });
});

describe('stampCombatModifiers', () => {
  it('returns input enemies with no modifierIds set on floor < 5', () => {
    const result = stampCombatModifiers(PLACEMENTS, 4, createRng(1));
    expect(result).toHaveLength(PLACEMENTS.length);
    for (const p of result) {
      expect(p.modifierIds).toBeUndefined();
    }
  });

  it('on floor 5: every enemy has exactly one modifierIds entry from [armored]', () => {
    const result = stampCombatModifiers(PLACEMENTS, 5, createRng(1));
    expect(result).toHaveLength(PLACEMENTS.length);
    for (const p of result) {
      expect(p.modifierIds).toHaveLength(1);
      expect(p.modifierIds![0]).toBe('armored');
    }
  });

  it('on floor 15: every enemy has one modifierIds from the full pool (all three appear across seeds)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const result = stampCombatModifiers(PLACEMENTS, 15, createRng(seed));
      for (const p of result) {
        expect(p.modifierIds).toHaveLength(1);
        seen.add(p.modifierIds![0]);
      }
    }
    expect(seen).toEqual(new Set(['armored', 'venomous', 'enraged']));
  });

  it('determinism: same input + seed → same modifierIds', () => {
    const a = stampCombatModifiers(PLACEMENTS, 15, createRng(42));
    const b = stampCombatModifiers(PLACEMENTS, 15, createRng(42));
    expect(a).toEqual(b);
  });

  it('does not mutate the input array', () => {
    const original = [...PLACEMENTS];
    stampCombatModifiers(PLACEMENTS, 15, createRng(1));
    expect(PLACEMENTS).toEqual(original);
    for (const p of PLACEMENTS) {
      expect(p.modifierIds).toBeUndefined();
    }
  });
});

describe('stampEliteModifiers', () => {
  it('on floor 1 (any floor): every enemy has one modifierIds from the full pool (all three appear across seeds)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const result = stampEliteModifiers(PLACEMENTS, createRng(seed));
      for (const p of result) {
        expect(p.modifierIds).toHaveLength(1);
        seen.add(p.modifierIds![0]);
      }
    }
    expect(seen).toEqual(new Set(['armored', 'venomous', 'enraged']));
  });

  it('determinism: same input + seed → same modifierIds', () => {
    const a = stampEliteModifiers(PLACEMENTS, createRng(42));
    const b = stampEliteModifiers(PLACEMENTS, createRng(42));
    expect(a).toEqual(b);
  });
});
