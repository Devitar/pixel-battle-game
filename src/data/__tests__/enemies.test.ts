import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../abilities';
import { CRYPT_BOSS, CRYPT_POOL, ENEMIES } from '../enemies';
import type { EnemyId } from '../types';

const EXPECTED_IDS: readonly EnemyId[] = [
  'skeleton_warrior',
  'skeleton_archer',
  'ghoul',
  'cultist',
  'bone_lich',
];

const STATS: readonly ('hp' | 'attack' | 'defense' | 'speed')[] = [
  'hp',
  'attack',
  'defense',
  'speed',
];

const SPRITE_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

describe('ENEMIES', () => {
  it('registers every expected enemy id', () => {
    for (const id of EXPECTED_IDS) {
      expect(ENEMIES[id], `missing enemy ${id}`).toBeDefined();
    }
  });

  it('has no stray entries', () => {
    const actual = Object.keys(ENEMIES).sort();
    const expected = [...EXPECTED_IDS].sort();
    expect(actual).toEqual(expected);
  });

  describe.each(EXPECTED_IDS)('enemy %s', (id) => {
    it('has matching id field', () => {
      expect(ENEMIES[id].id).toBe(id);
    });

    it('has all four base stats positive and finite', () => {
      for (const s of STATS) {
        const v = ENEMIES[id].baseStats[s];
        expect(v, `${id}.${s}`).toBeGreaterThan(0);
        expect(Number.isFinite(v), `${id}.${s} finite`).toBe(true);
      }
    });

    it('has a non-empty tags list', () => {
      expect(ENEMIES[id].tags.length).toBeGreaterThan(0);
    });

    it('lists only registered abilities', () => {
      for (const abilityId of ENEMIES[id].abilities) {
        expect(ABILITIES[abilityId], `${id} references missing ability ${abilityId}`).toBeDefined();
      }
    });

    it('aiPriority is a subset of abilities', () => {
      const abilitySet = new Set<string>(ENEMIES[id].abilities);
      for (const p of ENEMIES[id].aiPriority) {
        expect(
          abilitySet.has(p),
          `${id} prioritizes ${p} which is not in its abilities list`,
        ).toBe(true);
      }
    });

    it('has non-empty preferredSlots within 1..4', () => {
      const slots = ENEMIES[id].preferredSlots;
      expect(slots.length).toBeGreaterThan(0);
      for (const s of slots) expect([1, 2, 3, 4]).toContain(s);
    });

    it('has a non-empty snake_case spriteId', () => {
      expect(ENEMIES[id].spriteId).toMatch(SPRITE_ID_PATTERN);
    });

    it('every priority ability overlaps preferredSlots', () => {
      const preferred = new Set<number>(ENEMIES[id].preferredSlots);
      for (const abilityId of ENEMIES[id].aiPriority) {
        const castable = ABILITIES[abilityId].canCastFrom;
        const overlap = castable.some((s) => preferred.has(s));
        expect(
          overlap,
          `${id}: priority ability ${abilityId} (canCastFrom=${castable.join(',')}) does not overlap preferredSlots=${[...preferred].join(',')}`,
        ).toBe(true);
      }
    });
  });

  it('exactly one enemy has role boss, and it equals CRYPT_BOSS', () => {
    const bosses = Object.values(ENEMIES).filter((e) => e.role === 'boss');
    expect(bosses).toHaveLength(1);
    expect(bosses[0].id).toBe(CRYPT_BOSS);
  });

  it('every minion appears in CRYPT_POOL and vice-versa', () => {
    const minionIds = Object.values(ENEMIES)
      .filter((e) => e.role === 'minion')
      .map((e) => e.id)
      .sort();
    const poolIds = [...CRYPT_POOL].sort();
    expect(poolIds).toEqual(minionIds);
  });

  it('CRYPT_POOL entries are all registered as minions', () => {
    for (const id of CRYPT_POOL) {
      expect(ENEMIES[id], `pool references missing enemy ${id}`).toBeDefined();
      expect(ENEMIES[id].role).toBe('minion');
    }
  });
});
