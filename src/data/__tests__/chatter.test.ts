import { describe, expect, it } from 'vitest';
import { createHero } from '@heroes/hero';
import type { ClassId } from '../types';
import { CHATTER, computeChatterCondition } from '../chatter';

const ALL_CLASSES: readonly ClassId[] = ['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage'];
const ALL_CONDITIONS = ['healthy', 'wounded', 'critical'] as const;

describe('CHATTER table coverage', () => {
  it('every class has an entry', () => {
    for (const classId of ALL_CLASSES) {
      expect(CHATTER[classId], `class ${classId} missing from CHATTER`).toBeDefined();
    }
  });

  it('every (class, condition) bucket has ≥1 line', () => {
    for (const classId of ALL_CLASSES) {
      for (const condition of ALL_CONDITIONS) {
        const pool = CHATTER[classId][condition];
        expect(pool, `${classId}.${condition} bucket missing`).toBeDefined();
        expect(pool.length, `${classId}.${condition} pool is empty`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('all lines are non-empty strings', () => {
    for (const classId of ALL_CLASSES) {
      for (const condition of ALL_CONDITIONS) {
        for (const line of CHATTER[classId][condition]) {
          expect(line.length, `${classId}.${condition} has empty line`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('computeChatterCondition', () => {
  function makeHero(opts: { hp: number; maxHp: number; wounded: boolean }) {
    const hero = createHero('knight', 'K', 'h0', 'quick', 'body1');
    return {
      ...hero,
      currentHp: opts.hp,
      maxHp: opts.maxHp,
      wounds: opts.wounded ? [{ id: 'bruised' as const, runsRemaining: 5 }] : [],
    };
  }

  it('returns "critical" when HP / maxHp < 0.3 regardless of wounds', () => {
    expect(computeChatterCondition(makeHero({ hp: 5, maxHp: 20, wounded: false }))).toBe('critical');
    expect(computeChatterCondition(makeHero({ hp: 5, maxHp: 20, wounded: true }))).toBe('critical');
  });

  it('returns "wounded" when wounds.length > 0 and HP not critical', () => {
    expect(computeChatterCondition(makeHero({ hp: 15, maxHp: 20, wounded: true }))).toBe('wounded');
    expect(computeChatterCondition(makeHero({ hp: 20, maxHp: 20, wounded: true }))).toBe('wounded');
  });

  it('returns "healthy" when no wounds and HP ≥ 30%', () => {
    expect(computeChatterCondition(makeHero({ hp: 20, maxHp: 20, wounded: false }))).toBe('healthy');
    expect(computeChatterCondition(makeHero({ hp: 10, maxHp: 20, wounded: false }))).toBe('healthy');
  });

  it('boundary: HP / maxHp === 0.3 returns "wounded" if wounded, "healthy" if not (strict <)', () => {
    expect(computeChatterCondition(makeHero({ hp: 6, maxHp: 20, wounded: false }))).toBe('healthy');
    expect(computeChatterCondition(makeHero({ hp: 6, maxHp: 20, wounded: true }))).toBe('wounded');
  });
});
