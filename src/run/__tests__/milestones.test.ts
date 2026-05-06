import { describe, expect, it } from 'vitest';
import { applyPendingMilestones, detectBossMilestones, MILESTONES } from '../milestones';
import type { SaveFile } from '@save/save';

const fakeSaveFile = {} as SaveFile;

describe('milestones — registry', () => {
  it('MILESTONES is empty in spec 1', () => {
    expect(Object.keys(MILESTONES).length).toBe(0);
  });
});

describe('detectBossMilestones', () => {
  it('returns empty array for crypt floor 3 in spec 1', () => {
    expect(detectBossMilestones('crypt', 3)).toEqual([]);
  });

  it('returns empty array for any input in spec 1', () => {
    expect(detectBossMilestones('crypt', 1)).toEqual([]);
    expect(detectBossMilestones('crypt', 5)).toEqual([]);
  });
});

describe('applyPendingMilestones', () => {
  it('returns the input state unchanged for empty id list', () => {
    expect(applyPendingMilestones(fakeSaveFile, [])).toBe(fakeSaveFile);
  });
});
