import { describe, expect, it } from 'vitest';
import { CLASSES } from '../classes';
import { createHero, type Hero } from '@heroes/hero';
import {
  applyLevelUps,
  LEVEL_THRESHOLDS,
  levelForXp,
  MAX_LEVEL,
  xpForBossNode,
  xpForCombatNode,
} from '../leveling';

function makeHero(classId: Parameters<typeof createHero>[0]): Hero {
  return createHero(classId, 'X', 'h0', 'quick', 'body1');
}

describe('LEVEL_THRESHOLDS and MAX_LEVEL', () => {
  it('MAX_LEVEL is 10', () => {
    expect(MAX_LEVEL).toBe(10);
  });

  it('has 10 entries matching the spec', () => {
    expect(LEVEL_THRESHOLDS).toEqual([0, 200, 800, 2000, 4000, 6000, 9000, 12500, 16000, 20000]);
  });
});

describe('xpForCombatNode / xpForBossNode', () => {
  it('combat node: 5 × floor', () => {
    expect(xpForCombatNode(1)).toBe(5);
    expect(xpForCombatNode(2)).toBe(10);
    expect(xpForCombatNode(3)).toBe(15);
  });

  it('boss node: 30 × floor', () => {
    expect(xpForBossNode(1)).toBe(30);
    expect(xpForBossNode(2)).toBe(60);
    expect(xpForBossNode(3)).toBe(90);
  });
});

describe('levelForXp', () => {
  it.each([
    [0,     1],
    [199,   1],
    [200,   2],
    [799,   2],
    [800,   3],
    [1999,  3],
    [2000,  4],
    [3999,  4],
    [4000,  5],
    [5999,  5],
    [6000,  6],
    [8999,  6],
    [9000,  7],
    [12499, 7],
    [12500, 8],
    [15999, 8],
    [16000, 9],
    [19999, 9],
    [20000, 10],
    [99999, 10],
  ])('xp=%d → level %d', (xp, level) => {
    expect(levelForXp(xp)).toBe(level);
  });
});

describe('applyLevelUps', () => {
  it('returns hero unchanged when no level cross', () => {
    const h = makeHero('knight');
    const result = applyLevelUps(h, 1, 1);
    expect(result).toEqual(h);
  });

  it('Knight L1→L2: +2 maxHp, +2 currentHp, +1 defense, level=2, no pendingPerks', () => {
    const h = makeHero('knight');
    const baseHp = h.maxHp;
    const baseDef = h.baseStats.defense;
    const result = applyLevelUps(h, 1, 2);
    expect(result.maxHp).toBe(baseHp + 2);
    expect(result.currentHp).toBe(h.currentHp + 2);
    expect(result.baseStats.defense).toBe(baseDef + 1);
    expect(result.level).toBe(2);
    expect(result.pendingPerks).toEqual([]);
  });

  it('Rogue L1→L2: +2 crit (crit-primary special case)', () => {
    const h = makeHero('rogue');
    const baseCrit = h.baseStats.crit;
    const result = applyLevelUps(h, 1, 2);
    expect(result.baseStats.crit).toBe(baseCrit + 2);
  });

  it('Knight L1→L5 multi-level jump: +8 maxHp, +4 defense, pendingPerks=[l5]', () => {
    const h = makeHero('knight');
    const baseHp = h.maxHp;
    const baseDef = h.baseStats.defense;
    const result = applyLevelUps(h, 1, 5);
    expect(result.maxHp).toBe(baseHp + 8);
    expect(result.baseStats.defense).toBe(baseDef + 4);
    expect(result.level).toBe(5);
    expect(result.pendingPerks).toEqual(['l5']);
  });

  it('L4→L5 pushes l5 onto pendingPerks', () => {
    const h = makeHero('archer');
    const result = applyLevelUps({ ...h, level: 4 }, 4, 5);
    expect(result.pendingPerks).toEqual(['l5']);
  });

  it('L5→L5 no-op preserves pendingPerks if already set', () => {
    const h = makeHero('archer');
    const atFive = { ...h, level: 5, pendingPerks: ['l5'] as const };
    const result = applyLevelUps(atFive, 5, 5);
    expect(result).toEqual(atFive);
  });

  it('does not mutate the input hero', () => {
    const h = makeHero('knight');
    const baseDef = h.baseStats.defense;
    applyLevelUps(h, 1, 5);
    expect(h.baseStats.defense).toBe(baseDef);
    expect(h.level).toBe(1);
  });

  it('every class produces a level-up that bumps its primaryStat', () => {
    for (const classId of Object.keys(CLASSES) as Array<keyof typeof CLASSES>) {
      const def = CLASSES[classId];
      const h = makeHero(classId);
      const baseValue = h.baseStats[def.primaryStat];
      const result = applyLevelUps(h, 1, 2);
      expect(result.baseStats[def.primaryStat], `class ${classId}`)
        .toBeGreaterThan(baseValue);
    }
  });
});

describe('applyLevelUps tier-push', () => {
  function baseHero(level: number): Hero {
    const h = makeHero('knight');
    return { ...h, level };
  }

  it('L4→L5 pushes "l5" to pendingPerks', () => {
    const before = baseHero(4);
    const after = applyLevelUps(before, 4, 5);
    expect(after.pendingPerks).toEqual(['l5']);
  });

  it('L9→L10 pushes "l10" to pendingPerks', () => {
    const before = baseHero(9);
    const after = applyLevelUps(before, 9, 10);
    expect(after.pendingPerks).toEqual(['l10']);
  });

  it('L4→L10 pushes both ["l5", "l10"] in order', () => {
    const before = baseHero(4);
    const after = applyLevelUps(before, 4, 10);
    expect(after.pendingPerks).toEqual(['l5', 'l10']);
  });

  it('L6→L7 does not push any tier (no boundary crossed)', () => {
    const before = baseHero(6);
    const after = applyLevelUps(before, 6, 7);
    expect(after.pendingPerks).toEqual([]);
  });

  it('appends to existing pendingPerks rather than overwriting', () => {
    const before = { ...baseHero(4), pendingPerks: ['l5'] as const };
    const after = applyLevelUps(before, 4, 10);
    // Existing 'l5' preserved (not duplicated), 'l10' appended.
    expect(after.pendingPerks).toEqual(['l5', 'l10']);
  });

  it('per-level HP and primary-stat bumps apply per level (L4→L10 = 6 levels)', () => {
    const before = baseHero(4);
    const after = applyLevelUps(before, 4, 10);
    expect(after.maxHp).toBe(before.maxHp + 6 * 2);     // 2 HP per level
    expect(after.baseStats.defense).toBe(before.baseStats.defense + 6 * 1); // Knight primary = defense, +1/level
  });
});
