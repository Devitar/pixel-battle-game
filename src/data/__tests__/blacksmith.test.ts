import { describe, expect, it } from 'vitest';
import { BLACKSMITH_UPGRADE_COST } from '../blacksmith';

describe('BLACKSMITH_UPGRADE_COST', () => {
  it('rare→epic costs 900g', () => {
    expect(BLACKSMITH_UPGRADE_COST.epic).toBe(900);
  });
  it('keeps existing uncommon=100 and rare=300', () => {
    expect(BLACKSMITH_UPGRADE_COST.uncommon).toBe(100);
    expect(BLACKSMITH_UPGRADE_COST.rare).toBe(300);
  });
});

describe('BLACKSMITH_UPGRADE_COST — Legendary tier', () => {
  it('has no legendary key (legendary is not Blacksmith-reachable)', () => {
    expect('legendary' in BLACKSMITH_UPGRADE_COST).toBe(false);
  });
  it('keeps existing uncommon=100, rare=300, epic=900', () => {
    expect(BLACKSMITH_UPGRADE_COST.uncommon).toBe(100);
    expect(BLACKSMITH_UPGRADE_COST.rare).toBe(300);
    expect(BLACKSMITH_UPGRADE_COST.epic).toBe(900);
  });
});
