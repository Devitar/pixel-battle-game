import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../abilities';
import { CRYPT_BOSS, CRYPT_POOL, ENEMIES, SUNKEN_KEEP_BOSS, SUNKEN_KEEP_POOL } from '../enemies';
import type { EnemyId } from '../types';

const EXPECTED_IDS: readonly EnemyId[] = [
  'skeleton_warrior',
  'skeleton_archer',
  'ghost',
  'zombie',
  'cultist',
  'bone_lich',
  // Sunken Keep
  'drowned_knight',
  'brine_crab',
  'drowned_sailor',
  'siren',
  'drowned_king',
];

const STATS: readonly ('hp' | 'attack' | 'defense' | 'speed')[] = [
  'hp',
  'attack',
  'defense',
  'speed',
];

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

  it('CRYPT_BOSS is registered as boss', () => {
    expect(ENEMIES[CRYPT_BOSS]).toBeDefined();
    expect(ENEMIES[CRYPT_BOSS].role).toBe('boss');
  });

  it('CRYPT_POOL entries are all registered as minions', () => {
    for (const id of CRYPT_POOL) {
      expect(ENEMIES[id], `pool references missing enemy ${id}`).toBeDefined();
      expect(ENEMIES[id].role).toBe('minion');
    }
  });
});

describe('SUNKEN_KEEP_POOL', () => {
  it('contains exactly the 4 expected minions', () => {
    expect([...SUNKEN_KEEP_POOL].sort()).toEqual(
      ['brine_crab', 'drowned_knight', 'drowned_sailor', 'siren'].sort()
    );
  });

  it('every entry is a registered minion', () => {
    for (const id of SUNKEN_KEEP_POOL) {
      expect(ENEMIES[id]).toBeDefined();
      expect(ENEMIES[id].role).toBe('minion');
    }
  });
});

describe('SUNKEN_KEEP_BOSS', () => {
  it('points to drowned_king and is a registered boss', () => {
    expect(SUNKEN_KEEP_BOSS).toBe('drowned_king');
    expect(ENEMIES[SUNKEN_KEEP_BOSS]).toBeDefined();
    expect(ENEMIES[SUNKEN_KEEP_BOSS].role).toBe('boss');
  });
});

describe('Drowned King', () => {
  it('has the 3 boss abilities and front-line preferred slots', () => {
    const e = ENEMIES.drowned_king;
    expect([...e.abilities].sort()).toEqual(['crushing_wave', 'drowning_embrace', 'tidal_smash']);
    expect(e.preferredSlots).toEqual([1, 2]);
    expect(e.tags).toContain('humanoid');
    expect(e.tags).not.toContain('undead');  // Smite-decoupling
  });
});

describe('Siren', () => {
  it('uses drowning_lure (introduces drowning to minion combat)', () => {
    const e = ENEMIES.siren;
    expect(e.abilities).toContain('drowning_lure');
  });
});
