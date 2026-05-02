import { describe, expect, it } from 'vitest';
import { CLASSES } from '@data/classes';
import {
  PLAYER_BODY_SPRITES,
  PLAYER_FEET_SPRITES,
  PLAYER_LEGS_SPRITES,
} from '@data/body_sprites';
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
} from '../tavern';

const TIER1_CLASSES: ClassId[] = ['knight', 'archer', 'priest'];

describe('HIRE_COST', () => {
  it('exports the expected constant', () => {
    expect(HIRE_COST).toBe(50);
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

  it('returns a Hero with legs + feet sprites from the catalog (cosmetic variety)', () => {
    const c = generateCandidate(createRng(1), TIER1_CLASSES);
    expect(PLAYER_LEGS_SPRITES).toContain(c.legsSpriteId);
    expect(PLAYER_FEET_SPRITES).toContain(c.feetSpriteId);
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
  it('returns exactly the requested count of heroes', () => {
    const list = generateCandidates(createRng(1), TIER1_CLASSES, 3);
    expect(list).toHaveLength(3);
  });

  it('is deterministic per seed', () => {
    const a = generateCandidates(createRng(7), TIER1_CLASSES, 3);
    const b = generateCandidates(createRng(7), TIER1_CLASSES, 3);
    expect(a).toEqual(b);
  });

  it('maxHp matches trait HP effect for stout / frail / others', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const list = generateCandidates(createRng(seed), TIER1_CLASSES, 3);
      for (const h of list) {
        const classBase = CLASSES[h.classId].baseStats.hp;
        if (h.traitId === 'stout') {
          expect(h.maxHp, `seed ${seed} hero ${h.id}`).toBeGreaterThan(classBase);
        } else if (h.traitId === 'frail') {
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
    const current = generateCandidates(createRng(1), TIER1_CLASSES, 3);
    const out = ensureCandidatesForCap(current, 3, createRng(99), TIER1_CLASSES);
    expect(out).toBe(current);
  });

  it('regenerates when current is empty (fresh save case)', () => {
    const out = ensureCandidatesForCap([], 3, createRng(1), TIER1_CLASSES);
    expect(out).toHaveLength(3);
  });

  it('regenerates when current length is less than requested (post-upgrade cap grew)', () => {
    const current = generateCandidates(createRng(1), TIER1_CLASSES, 3);
    const out = ensureCandidatesForCap(current, 4, createRng(2), TIER1_CLASSES);
    expect(out).toHaveLength(4);
    expect(out).not.toBe(current);
  });

  it('regenerates when current length exceeds requested', () => {
    const current = generateCandidates(createRng(1), TIER1_CLASSES, 5);
    const out = ensureCandidatesForCap(current, 3, createRng(2), TIER1_CLASSES);
    expect(out).toHaveLength(3);
    expect(out).not.toBe(current);
  });

  it('reference equality on the no-regen path enables a !== check to detect regeneration', () => {
    // The scene relies on `ensured !== persisted` to decide whether to persist
    // a new state. Pinning that contract here so a future "always copy" change
    // doesn't silently break the persistence-skip optimization.
    const current = generateCandidates(createRng(1), TIER1_CLASSES, 3);
    expect(ensureCandidatesForCap(current, 3, createRng(1), TIER1_CLASSES)).toBe(current);
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
