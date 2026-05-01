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
  it('MAX_LEVEL is 5', () => {
    expect(MAX_LEVEL).toBe(5);
  });

  it('thresholds are [0, 200, 800, 2000, 4000]', () => {
    expect(LEVEL_THRESHOLDS).toEqual([0, 200, 800, 2000, 4000]);
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
  it('xp 0 → level 1', () => { expect(levelForXp(0)).toBe(1); });
  it('xp 199 → level 1 (just below)', () => { expect(levelForXp(199)).toBe(1); });
  it('xp 200 → level 2 (boundary)', () => { expect(levelForXp(200)).toBe(2); });
  it('xp 799 → level 2', () => { expect(levelForXp(799)).toBe(2); });
  it('xp 800 → level 3', () => { expect(levelForXp(800)).toBe(3); });
  it('xp 1999 → level 3', () => { expect(levelForXp(1999)).toBe(3); });
  it('xp 2000 → level 4', () => { expect(levelForXp(2000)).toBe(4); });
  it('xp 3999 → level 4', () => { expect(levelForXp(3999)).toBe(4); });
  it('xp 4000 → level 5', () => { expect(levelForXp(4000)).toBe(5); });
  it('xp 99999 → level 5 (capped at MAX_LEVEL)', () => { expect(levelForXp(99999)).toBe(5); });
});

describe('applyLevelUps', () => {
  it('returns hero unchanged when no level cross', () => {
    const h = makeHero('knight');
    const result = applyLevelUps(h, 1, 1);
    expect(result).toEqual(h);
  });

  it('Knight L1→L2: +2 maxHp, +2 currentHp, +1 defense, level=2, no pendingPerk', () => {
    const h = makeHero('knight');
    const baseHp = h.maxHp;
    const baseDef = h.baseStats.defense;
    const result = applyLevelUps(h, 1, 2);
    expect(result.maxHp).toBe(baseHp + 2);
    expect(result.currentHp).toBe(h.currentHp + 2);
    expect(result.baseStats.defense).toBe(baseDef + 1);
    expect(result.level).toBe(2);
    expect(result.pendingPerk).toBe(false);
  });

  it('Rogue L1→L2: +2 crit (crit-primary special case)', () => {
    const h = makeHero('rogue');
    const baseCrit = h.baseStats.crit;
    const result = applyLevelUps(h, 1, 2);
    expect(result.baseStats.crit).toBe(baseCrit + 2);
  });

  it('Knight L1→L5 multi-level jump: +8 maxHp, +4 defense, pendingPerk=true', () => {
    const h = makeHero('knight');
    const baseHp = h.maxHp;
    const baseDef = h.baseStats.defense;
    const result = applyLevelUps(h, 1, 5);
    expect(result.maxHp).toBe(baseHp + 8);
    expect(result.baseStats.defense).toBe(baseDef + 4);
    expect(result.level).toBe(5);
    expect(result.pendingPerk).toBe(true);
  });

  it('L4→L5 sets pendingPerk', () => {
    const h = makeHero('archer');
    const result = applyLevelUps({ ...h, level: 4 }, 4, 5);
    expect(result.pendingPerk).toBe(true);
  });

  it('L5→L5 no-op preserves pendingPerk if already true', () => {
    const h = makeHero('archer');
    const atFive = { ...h, level: 5, pendingPerk: true };
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
