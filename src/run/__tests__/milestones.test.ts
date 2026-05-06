import { describe, expect, it } from 'vitest';
import { applyPendingMilestones, detectBossMilestones, MILESTONES } from '../milestones';
import type { SaveFile } from '@save/save';
import type { Unlocks } from '@data/types';

function makeFakeSave(unlocks: Unlocks): SaveFile {
  return { unlocks } as unknown as SaveFile;
}

describe('milestones — registry', () => {
  it('registers first_crypt_clear', () => {
    expect(MILESTONES.first_crypt_clear).toBeDefined();
    expect(typeof MILESTONES.first_crypt_clear).toBe('function');
  });

  it('has only the spec-2 entries (no stray)', () => {
    expect(Object.keys(MILESTONES).sort()).toEqual(['first_crypt_clear']);
  });
});

describe('detectBossMilestones', () => {
  it('returns [first_crypt_clear] for crypt floor 3 (canonical-final)', () => {
    expect(detectBossMilestones('crypt', 3)).toEqual(['first_crypt_clear']);
  });

  it('returns [] for crypt floor 1 (non-canonical)', () => {
    expect(detectBossMilestones('crypt', 1)).toEqual([]);
  });

  it('returns [] for crypt floor 4+ (post-canonical)', () => {
    expect(detectBossMilestones('crypt', 4)).toEqual([]);
    expect(detectBossMilestones('crypt', 10)).toEqual([]);
  });

  it('returns [] for sunken_keep clears (no spec-2 handler for that)', () => {
    expect(detectBossMilestones('sunken_keep', 3)).toEqual([]);
  });
});

describe('first_crypt_clear handler', () => {
  it('appends sunken_keep to unlocks.dungeons on a fresh state', () => {
    const before = makeFakeSave({ classes: [], dungeons: ['crypt'] });
    const after = MILESTONES.first_crypt_clear(before);
    expect(after.unlocks.dungeons).toContain('sunken_keep');
    expect(after.unlocks.dungeons).toContain('crypt');  // preserves existing
  });

  it('is idempotent — second application does not duplicate', () => {
    const before = makeFakeSave({ classes: [], dungeons: ['crypt', 'sunken_keep'] });
    const after = MILESTONES.first_crypt_clear(before);
    expect(after).toBe(before);  // identity return on already-unlocked
  });

  it('preserves classes unchanged', () => {
    const before = makeFakeSave({
      classes: ['knight', 'archer', 'priest'],
      dungeons: ['crypt'],
    });
    const after = MILESTONES.first_crypt_clear(before);
    expect(after.unlocks.classes).toEqual(['knight', 'archer', 'priest']);
  });
});

describe('applyPendingMilestones', () => {
  it('returns input unchanged for empty id list', () => {
    const state = makeFakeSave({ classes: [], dungeons: ['crypt'] });
    expect(applyPendingMilestones(state, [])).toBe(state);
  });

  it('runs the first_crypt_clear handler when id is in list', () => {
    const before = makeFakeSave({ classes: [], dungeons: ['crypt'] });
    const after = applyPendingMilestones(before, ['first_crypt_clear']);
    expect(after.unlocks.dungeons).toContain('sunken_keep');
  });
});
