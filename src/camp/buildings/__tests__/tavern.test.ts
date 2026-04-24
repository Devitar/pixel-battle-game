import { describe, expect, it } from 'vitest';
import { CLASSES } from '../../../data/classes';
import { PLAYER_BODY_SPRITES } from '../../../data/body_sprites';
import { NAMES } from '../../../data/names';
import { TRAITS } from '../../../data/traits';
import type { ClassId } from '../../../data/types';
import { createRng } from '../../../util/rng';
import {
  generateCandidate,
  generateCandidates,
  generateStarterRoster,
  HIRE_COST,
  TAVERN_CANDIDATE_COUNT,
} from '../tavern';

const TIER1_CLASSES: ClassId[] = ['knight', 'archer', 'priest'];

describe('HIRE_COST and TAVERN_CANDIDATE_COUNT', () => {
  it('exports the expected constants', () => {
    expect(HIRE_COST).toBe(50);
    expect(TAVERN_CANDIDATE_COUNT).toBe(3);
  });
});

describe('generateCandidate', () => {
  it('returns a Hero with classId in the unlocked set', () => {
    const c = generateCandidate(createRng(1), TIER1_CLASSES);
    expect(TIER1_CLASSES).toContain(c.classId);
  });

  it('returns a Hero with a registered trait', () => {
    const c = generateCandidate(createRng(1), TIER1_CLASSES);
    expect(TRAITS[c.traitId]).toBeDefined();
  });

  it('returns a Hero with a body sprite from PLAYER_BODY_SPRITES', () => {
    const c = generateCandidate(createRng(1), TIER1_CLASSES);
    expect(PLAYER_BODY_SPRITES).toContain(c.bodySpriteId);
  });

  it('returns a Hero with a name from NAMES', () => {
    const c = generateCandidate(createRng(1), TIER1_CLASSES);
    expect(NAMES).toContain(c.name);
  });

  it('is deterministic per seed', () => {
    const a = generateCandidate(createRng(42), TIER1_CLASSES);
    const b = generateCandidate(createRng(42), TIER1_CLASSES);
    expect(a).toEqual(b);
  });
});

describe('generateCandidates', () => {
  it('returns exactly TAVERN_CANDIDATE_COUNT heroes', () => {
    const list = generateCandidates(createRng(1), TIER1_CLASSES);
    expect(list).toHaveLength(TAVERN_CANDIDATE_COUNT);
  });

  it('is deterministic per seed', () => {
    const a = generateCandidates(createRng(7), TIER1_CLASSES);
    const b = generateCandidates(createRng(7), TIER1_CLASSES);
    expect(a).toEqual(b);
  });

  it('Stout candidates have maxHp > classBaseHp; others equal class base', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const list = generateCandidates(createRng(seed), TIER1_CLASSES);
      for (const h of list) {
        const classBase = CLASSES[h.classId].baseStats.hp;
        if (h.traitId === 'stout') {
          expect(h.maxHp, `seed ${seed} hero ${h.id}`).toBeGreaterThan(classBase);
        } else {
          expect(h.maxHp, `seed ${seed} hero ${h.id}`).toBe(classBase);
        }
      }
    }
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
