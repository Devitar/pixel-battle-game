import { describe, expect, it } from 'vitest';
import { CLASSES } from '@data/classes';
import {
  PLAYER_BODY_SPRITES,
  PLAYER_FEET_SPRITES,
  PLAYER_LEGS_SPRITES,
} from '@data/body_sprites';
import { LEVEL_THRESHOLDS, MAX_LEVEL } from '@data/leveling';
import { NAMES } from '@data/names';
import { TRAITS } from '@data/traits';
import type { ClassId } from '@data/types';
import { createRng } from '@util/rng';
import {
  ensureCandidatesForCap,
  generateCandidate,
  generateCandidates,
  generateStarterRoster,
  HIRE_COST,
  HIRE_COST_BY_LEVEL,
  LEVEL_ROLL_TABLE,
} from '../tavern';

const TIER1_CLASSES: ClassId[] = ['knight', 'archer', 'priest'];

describe('HIRE_COST', () => {
  it('exports the expected constant', () => {
    expect(HIRE_COST).toBe(50);
  });
});

describe('generateCandidate', () => {
  it('returns a Hero with classId in the unlocked set', () => {
    const c = generateCandidate(createRng(1), TIER1_CLASSES, 1);
    expect(TIER1_CLASSES).toContain(c.classId);
  });

  it('returns a Hero with a registered trait', () => {
    const c = generateCandidate(createRng(1), TIER1_CLASSES, 1);
    expect(TRAITS[c.traitIds[0]]).toBeDefined();
  });

  it('returns a Hero with a body sprite from PLAYER_BODY_SPRITES', () => {
    const c = generateCandidate(createRng(1), TIER1_CLASSES, 1);
    expect(PLAYER_BODY_SPRITES).toContain(c.bodySpriteId);
  });

  it('returns a Hero with legs + feet sprites from the catalog (cosmetic variety)', () => {
    const c = generateCandidate(createRng(1), TIER1_CLASSES, 1);
    expect(PLAYER_LEGS_SPRITES).toContain(c.legsSpriteId);
    expect(PLAYER_FEET_SPRITES).toContain(c.feetSpriteId);
  });

  it('returns a Hero with a name from NAMES', () => {
    const c = generateCandidate(createRng(1), TIER1_CLASSES, 1);
    expect(NAMES).toContain(c.name);
  });

  it('is deterministic per seed', () => {
    const a = generateCandidate(createRng(42), TIER1_CLASSES, 1);
    const b = generateCandidate(createRng(42), TIER1_CLASSES, 1);
    expect(a).toEqual(b);
  });
});

describe('generateCandidates', () => {
  it('returns exactly the requested count of heroes', () => {
    const list = generateCandidates(createRng(1), TIER1_CLASSES, 3, 1);
    expect(list).toHaveLength(3);
  });

  it('is deterministic per seed', () => {
    const a = generateCandidates(createRng(7), TIER1_CLASSES, 3, 1);
    const b = generateCandidates(createRng(7), TIER1_CLASSES, 3, 1);
    expect(a).toEqual(b);
  });

  it('maxHp matches trait HP effect for stout / frail / others', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const list = generateCandidates(createRng(seed), TIER1_CLASSES, 3, 1);
      for (const h of list) {
        const classBase = CLASSES[h.classId].baseStats.hp;
        if (h.traitIds[0] === 'stout') {
          expect(h.maxHp, `seed ${seed} hero ${h.id}`).toBeGreaterThan(classBase);
        } else if (h.traitIds[0] === 'frail') {
          expect(h.maxHp, `seed ${seed} hero ${h.id}`).toBeLessThan(classBase);
        } else {
          expect(h.maxHp, `seed ${seed} hero ${h.id}`).toBe(classBase);
        }
      }
    }
  });
});

describe('ensureCandidatesForCap', () => {
  it('returns input unchanged when length matches the requested count', () => {
    const current = generateCandidates(createRng(1), TIER1_CLASSES, 3, 1);
    const out = ensureCandidatesForCap(current, 3, createRng(99), TIER1_CLASSES, 1);
    expect(out).toBe(current);
  });

  it('regenerates when current is empty (fresh save case)', () => {
    const out = ensureCandidatesForCap([], 3, createRng(1), TIER1_CLASSES, 1);
    expect(out).toHaveLength(3);
  });

  it('regenerates when current length is less than requested (post-upgrade cap grew)', () => {
    const current = generateCandidates(createRng(1), TIER1_CLASSES, 3, 1);
    const out = ensureCandidatesForCap(current, 4, createRng(2), TIER1_CLASSES, 1);
    expect(out).toHaveLength(4);
    expect(out).not.toBe(current);
  });

  it('regenerates when current length exceeds requested', () => {
    const current = generateCandidates(createRng(1), TIER1_CLASSES, 5, 1);
    const out = ensureCandidatesForCap(current, 3, createRng(2), TIER1_CLASSES, 1);
    expect(out).toHaveLength(3);
    expect(out).not.toBe(current);
  });

  it('reference equality on the no-regen path enables a !== check to detect regeneration', () => {
    // The scene relies on `ensured !== persisted` to decide whether to persist
    // a new state. Pinning that contract here so a future "always copy" change
    // doesn't silently break the persistence-skip optimization.
    const current = generateCandidates(createRng(1), TIER1_CLASSES, 3, 1);
    expect(ensureCandidatesForCap(current, 3, createRng(1), TIER1_CLASSES, 1)).toBe(current);
  });
});

describe('generateStarterRoster', () => {
  it('returns exactly 3 heroes, one per Tier 1 class', () => {
    const roster = generateStarterRoster(createRng(1));
    expect(roster).toHaveLength(3);
    const classIds = roster.map((h) => h.classId).sort();
    expect(classIds).toEqual(['archer', 'knight', 'priest']);
  });

  it('is deterministic per seed', () => {
    const a = generateStarterRoster(createRng(99));
    const b = generateStarterRoster(createRng(99));
    expect(a).toEqual(b);
  });
});

describe('generateCandidate — paladin in unlocked pool', () => {
  it('produces a paladin candidate when paladin is in unlockedClasses', () => {
    const rng = createRng(1);
    const unlocked: ClassId[] = ['paladin'];  // single-class pool guarantees the roll
    const hero = generateCandidate(rng, unlocked, 1);
    expect(hero.classId).toBe('paladin');
  });
});

describe('generateCandidate — Hunter petSpeciesId', () => {
  it('rolls a petSpeciesId when classId is hunter', () => {
    const rng = createRng(42);
    const hero = generateCandidate(rng, ['hunter'], 1);
    expect(hero.classId).toBe('hunter');
    expect(hero.petSpeciesId).toBeDefined();
    expect(['wolf', 'hawk', 'bear']).toContain(hero.petSpeciesId);
  });

  it('does not roll petSpeciesId for non-Hunter classes', () => {
    const rng = createRng(42);
    const hero = generateCandidate(rng, ['knight'], 1);
    expect(hero.classId).toBe('knight');
    expect(hero.petSpeciesId).toBeUndefined();
  });
});

describe('HIRE_COST_BY_LEVEL', () => {
  it('exports 50 / 150 / 400 for levels 1 / 2 / 3', () => {
    expect(HIRE_COST_BY_LEVEL[1]).toBe(50);
    expect(HIRE_COST_BY_LEVEL[2]).toBe(150);
    expect(HIRE_COST_BY_LEVEL[3]).toBe(400);
  });
});

describe('LEVEL_ROLL_TABLE', () => {
  it('L1 Tavern has a single entry with weight 1.00 for level 1', () => {
    expect(LEVEL_ROLL_TABLE[1]).toHaveLength(1);
    expect(LEVEL_ROLL_TABLE[1][0]).toEqual({ value: 1, weight: 1.00 });
  });

  it('L2 Tavern weights sum to 1.00 with entries (1, 0.75) and (2, 0.25)', () => {
    expect(LEVEL_ROLL_TABLE[2]).toEqual([
      { value: 1, weight: 0.75 },
      { value: 2, weight: 0.25 },
    ]);
    const sum = LEVEL_ROLL_TABLE[2].reduce((s, e) => s + e.weight, 0);
    expect(sum).toBeCloseTo(1.00, 5);
  });

  it('L3 Tavern weights sum to 1.00 with entries (1, 0.65), (2, 0.25), (3, 0.10)', () => {
    expect(LEVEL_ROLL_TABLE[3]).toEqual([
      { value: 1, weight: 0.65 },
      { value: 2, weight: 0.25 },
      { value: 3, weight: 0.10 },
    ]);
    const sum = LEVEL_ROLL_TABLE[3].reduce((s, e) => s + e.weight, 0);
    expect(sum).toBeCloseTo(1.00, 5);
  });
});

describe('generateCandidate — pre-leveled (Tavern L2/L3)', () => {
  it('always returns level 1 at L1 Tavern', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const c = generateCandidate(createRng(seed), TIER1_CLASSES, 1);
      expect(c.level).toBe(1);
      expect(c.xp).toBe(0);
    }
  });

  it('L2 candidates have xp = LEVEL_THRESHOLDS[1] (200) and bumped primary stat', () => {
    let l2: ReturnType<typeof generateCandidate> | undefined;
    for (let seed = 1; seed <= 200; seed++) {
      const c = generateCandidate(createRng(seed), TIER1_CLASSES, 2);
      if (c.level === 2) { l2 = c; break; }
    }
    expect(l2, 'seeded search found no L2 candidate within 200 seeds').toBeDefined();
    expect(l2!.xp).toBe(LEVEL_THRESHOLDS[1]);
    expect(l2!.level).toBe(2);

    const def = CLASSES[l2!.classId];
    const primaryBump = def.primaryStat === 'crit' ? 2 : 1;
    expect(l2!.baseStats[def.primaryStat]).toBe(def.baseStats[def.primaryStat] + primaryBump);
  });

  it('L3 candidates have xp = LEVEL_THRESHOLDS[2] (800) and double-bumped primary stat', () => {
    let l3: ReturnType<typeof generateCandidate> | undefined;
    for (let seed = 1; seed <= 1000; seed++) {
      const c = generateCandidate(createRng(seed), TIER1_CLASSES, 3);
      if (c.level === 3) { l3 = c; break; }
    }
    expect(l3, 'seeded search found no L3 candidate within 1000 seeds').toBeDefined();
    expect(l3!.xp).toBe(LEVEL_THRESHOLDS[2]);
    expect(l3!.level).toBe(3);

    const def = CLASSES[l3!.classId];
    const primaryBump = (def.primaryStat === 'crit' ? 2 : 1) * 2;
    expect(l3!.baseStats[def.primaryStat]).toBe(def.baseStats[def.primaryStat] + primaryBump);
  });

  it('pre-leveled candidates have pendingPerk: false (Tavern caps below MAX_LEVEL)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const c = generateCandidate(createRng(seed), TIER1_CLASSES, 3);
      expect(c.pendingPerk, `seed ${seed}`).toBe(false);
      expect(c.level).toBeLessThan(MAX_LEVEL);
    }
  });

  it('pre-leveled candidates have maxHp bumped by 2/level from class base + gear', () => {
    let l2: ReturnType<typeof generateCandidate> | undefined;
    for (let seed = 1; seed <= 200; seed++) {
      const c = generateCandidate(createRng(seed), TIER1_CLASSES, 2);
      if (c.level === 2) { l2 = c; break; }
    }
    expect(l2).toBeDefined();
    // L2 hero has 1 level-up applied → +2 HP from level-up alone.
    // Trait/gear may add more on top; assert the floor: maxHp >= classBaseHp + 2.
    const classBaseHp = CLASSES[l2!.classId].baseStats.hp;
    expect(l2!.maxHp).toBeGreaterThanOrEqual(classBaseHp + 2);
    expect(l2!.currentHp).toBe(l2!.maxHp);  // freshly generated, full HP
  });

  it('pickCandidateLevel(L3, 5000 seeds) approximates 65/25/10 within ±5%', () => {
    let counts = { 1: 0, 2: 0, 3: 0 };
    const N = 5000;
    for (let seed = 1; seed <= N; seed++) {
      const c = generateCandidate(createRng(seed), TIER1_CLASSES, 3);
      counts[c.level as 1 | 2 | 3]++;
    }
    expect(counts[1] / N).toBeCloseTo(0.65, 1);  // ±0.05
    expect(counts[2] / N).toBeCloseTo(0.25, 1);
    expect(counts[3] / N).toBeCloseTo(0.10, 1);
  });
});
