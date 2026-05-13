import { describe, expect, it } from 'vitest';
import { applyPendingMilestones, detectBossMilestones, detectXpMilestones, MILESTONES } from '../milestones';
import type { SaveFile } from '@save/save';
import type { Hero } from '@heroes/hero';
import type { Unlocks } from '@data/types';

function makeFakeSave(unlocks: Omit<Unlocks, 'legendaryEnabled'> & Partial<Pick<Unlocks, 'legendaryEnabled'>>): SaveFile {
  const fullUnlocks: Unlocks = {
    ...unlocks,
    legendaryEnabled: unlocks.legendaryEnabled ?? false,
  };
  return { unlocks: fullUnlocks } as unknown as SaveFile;
}

describe('milestones — registry', () => {
  it('registers first_crypt_clear', () => {
    expect(MILESTONES.first_crypt_clear).toBeDefined();
    expect(typeof MILESTONES.first_crypt_clear).toBe('function');
  });

  it('has only the registered milestone ids', () => {
    expect(Object.keys(MILESTONES).sort()).toEqual(['first_crypt_clear', 'first_hero_l10', 'first_sunken_keep_clear']);
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

  it('returns [first_sunken_keep_clear] for sunken_keep canonical-final', () => {
    expect(detectBossMilestones('sunken_keep', 3)).toEqual(['first_sunken_keep_clear']);
  });
});

describe('first_crypt_clear handler', () => {
  it('appends sunken_keep to unlocks.dungeons on a fresh state', () => {
    const before = makeFakeSave({ classes: [], dungeons: ['crypt'], buildings: [] });
    const after = MILESTONES.first_crypt_clear(before);
    expect(after.unlocks.dungeons).toContain('sunken_keep');
    expect(after.unlocks.dungeons).toContain('crypt');  // preserves existing
  });

  it('is idempotent — second application does not duplicate when both already unlocked', () => {
    const before = makeFakeSave({
      classes: ['knight', 'paladin'],
      dungeons: ['crypt', 'sunken_keep'],
      buildings: [],
    });
    const after = MILESTONES.first_crypt_clear(before);
    expect(after).toBe(before);  // identity return on full no-op
  });

  it('appends paladin to unlocks.classes on a fresh state', () => {
    const before = makeFakeSave({
      classes: ['knight', 'archer', 'priest'],
      dungeons: ['crypt'],
      buildings: [],
    });
    const after = MILESTONES.first_crypt_clear(before);
    expect(after.unlocks.classes).toContain('paladin');
    expect(after.unlocks.classes).toContain('knight');  // preserves existing
    expect(after.unlocks.classes).toContain('archer');
    expect(after.unlocks.classes).toContain('priest');
  });

  it('appends only paladin when sunken_keep already unlocked', () => {
    const before = makeFakeSave({
      classes: ['knight'],
      dungeons: ['crypt', 'sunken_keep'],
      buildings: [],
    });
    const after = MILESTONES.first_crypt_clear(before);
    expect(after.unlocks.classes).toContain('paladin');
    expect(after.unlocks.dungeons).toEqual(['crypt', 'sunken_keep']);  // unchanged
  });

  it('appends only sunken_keep when paladin already unlocked', () => {
    const before = makeFakeSave({
      classes: ['knight', 'paladin'],
      dungeons: ['crypt'],
      buildings: [],
    });
    const after = MILESTONES.first_crypt_clear(before);
    expect(after.unlocks.dungeons).toContain('sunken_keep');
    expect(after.unlocks.classes).toEqual(['knight', 'paladin']);  // unchanged
  });
});

describe('applyPendingMilestones', () => {
  it('returns input unchanged for empty id list', () => {
    const state = makeFakeSave({ classes: [], dungeons: ['crypt'], buildings: [] });
    expect(applyPendingMilestones(state, [])).toBe(state);
  });

  it('runs the first_crypt_clear handler when id is in list', () => {
    const before = makeFakeSave({ classes: ['knight'], dungeons: ['crypt'], buildings: [] });
    const after = applyPendingMilestones(before, ['first_crypt_clear']);
    expect(after.unlocks.dungeons).toContain('sunken_keep');
    expect(after.unlocks.classes).toContain('paladin');
  });
});

describe('first_sunken_keep_clear handler', () => {
  it('appends hunter to unlocks.classes on a fresh state', () => {
    const before = makeFakeSave({
      classes: ['knight', 'archer', 'priest', 'paladin'],
      dungeons: ['crypt', 'sunken_keep'],
      buildings: [],
    });
    const after = MILESTONES.first_sunken_keep_clear(before);
    expect(after.unlocks.classes).toContain('hunter');
    expect(after.unlocks.classes).toContain('paladin');  // preserves
  });

  it('is idempotent', () => {
    const before = makeFakeSave({
      classes: ['knight', 'hunter'],
      dungeons: ['crypt', 'sunken_keep'],
      buildings: ['chapel', 'training_grounds'],
    });
    const after = MILESTONES.first_sunken_keep_clear(before);
    expect(after).toBe(before);
  });

  it('appends chapel to unlocks.buildings on a fresh state', () => {
    const before = makeFakeSave({
      classes: ['knight'],
      dungeons: ['crypt', 'sunken_keep'],
      buildings: [],
    });
    const after = MILESTONES.first_sunken_keep_clear(before);
    expect(after.unlocks.buildings).toContain('chapel');
  });

  it('appends only chapel when hunter already unlocked', () => {
    const before = makeFakeSave({
      classes: ['knight', 'hunter'],
      dungeons: ['crypt', 'sunken_keep'],
      buildings: [],
    });
    const after = MILESTONES.first_sunken_keep_clear(before);
    expect(after.unlocks.buildings).toContain('chapel');
    expect(after.unlocks.classes).toEqual(['knight', 'hunter']);
  });

  it('appends only hunter when chapel and training_grounds already unlocked', () => {
    const before = makeFakeSave({
      classes: ['knight'],
      dungeons: ['crypt', 'sunken_keep'],
      buildings: ['chapel', 'training_grounds'],
    });
    const after = MILESTONES.first_sunken_keep_clear(before);
    expect(after.unlocks.classes).toContain('hunter');
    expect(after.unlocks.buildings).toEqual(['chapel', 'training_grounds']);
  });
});

describe('first_sunken_keep_clear — training_grounds branch', () => {
  it('appends training_grounds to unlocks.buildings on a fresh state', () => {
    const before = makeFakeSave({
      classes: ['knight'],
      dungeons: ['crypt', 'sunken_keep'],
      buildings: [],
    });
    const after = MILESTONES.first_sunken_keep_clear(before);
    expect(after.unlocks.buildings).toContain('training_grounds');
  });

  it('appends only training_grounds when hunter and chapel already unlocked', () => {
    const before = makeFakeSave({
      classes: ['knight', 'hunter'],
      dungeons: ['crypt', 'sunken_keep'],
      buildings: ['chapel'],
    });
    const after = MILESTONES.first_sunken_keep_clear(before);
    expect(after.unlocks.buildings).toEqual(['chapel', 'training_grounds']);
    expect(after.unlocks.classes).toEqual(['knight', 'hunter']);
  });

  it('is idempotent when all three branches already applied', () => {
    const before = makeFakeSave({
      classes: ['knight', 'hunter'],
      dungeons: ['crypt', 'sunken_keep'],
      buildings: ['chapel', 'training_grounds'],
    });
    const after = MILESTONES.first_sunken_keep_clear(before);
    expect(after.unlocks.buildings).toEqual(['chapel', 'training_grounds']);
  });
});

describe('applyPendingMilestones — first_sunken_keep_clear', () => {
  it('runs the handler when id is in list', () => {
    const before = makeFakeSave({
      classes: ['knight'],
      dungeons: ['crypt', 'sunken_keep'],
      buildings: [],
    });
    const after = applyPendingMilestones(before, ['first_sunken_keep_clear']);
    expect(after.unlocks.classes).toContain('hunter');
  });
});

function makeHero(level: number): Hero {
  return {
    id: 'h0',
    classId: 'knight',
    name: 'Test',
    baseStats: { hp: 30, attack: 5, defense: 2, speed: 5, mind: 1, crit: 5, dodge: 5 },
    currentHp: 30,
    maxHp: 30,
    traitIds: ['quick'],
    bodySpriteId: 'body1',
    legsSpriteId: 'legs1',
    feetSpriteId: 'feet1',
    wounds: [],
    equipment: {
      weapon: {
        id: 'w',
        baseId: 'sword_basic',
        slot: 'weapon',
        rarity: 'common',
        weaponType: 'sword',
        affixes: [],
        floorRolledAt: 1,
      },
    },
    xp: 0,
    level,
    pendingPerks: [],
    pickedPerks: [],
  };
}

const NO_LEGENDARY: Unlocks = {
  classes: [],
  dungeons: [],
  buildings: [],
  legendaryEnabled: false,
};

describe('detectXpMilestones', () => {
  it('returns first_hero_l10 when a hero crosses 9 → 10', () => {
    const before = [makeHero(9)];
    const after = [makeHero(10)];
    expect(detectXpMilestones(before, after, NO_LEGENDARY)).toEqual(['first_hero_l10']);
  });

  it('returns [] when no hero crosses 10', () => {
    const before = [makeHero(5)];
    const after = [makeHero(6)];
    expect(detectXpMilestones(before, after, NO_LEGENDARY)).toEqual([]);
  });

  it('returns [] when unlocks.legendaryEnabled is already true (idempotency)', () => {
    const before = [makeHero(9)];
    const after = [makeHero(10)];
    const unlocked: Unlocks = { ...NO_LEGENDARY, legendaryEnabled: true };
    expect(detectXpMilestones(before, after, unlocked)).toEqual([]);
  });

  it('returns first_hero_l10 even if only one of multiple heroes crossed', () => {
    const before = [makeHero(5), makeHero(9), makeHero(7)];
    const after = [makeHero(5), makeHero(10), makeHero(7)];
    expect(detectXpMilestones(before, after, NO_LEGENDARY)).toEqual(['first_hero_l10']);
  });

  it('returns [] when hero was already at 10 before (no crossing)', () => {
    const before = [makeHero(10)];
    const after = [makeHero(10)];
    expect(detectXpMilestones(before, after, NO_LEGENDARY)).toEqual([]);
  });
});

describe('MILESTONES.first_hero_l10 handler', () => {
  it('flips unlocks.legendaryEnabled from false to true', () => {
    const before = makeFakeSave({
      classes: ['knight'],
      dungeons: ['crypt'],
      buildings: [],
      legendaryEnabled: false,
    });
    const after = MILESTONES.first_hero_l10(before);
    expect(after.unlocks.legendaryEnabled).toBe(true);
    // preserves other unlocks
    expect(after.unlocks.classes).toEqual(['knight']);
    expect(after.unlocks.dungeons).toEqual(['crypt']);
    expect(after.unlocks.buildings).toEqual([]);
  });

  it('is idempotent (no-op if already true)', () => {
    const before = makeFakeSave({
      classes: ['knight'],
      dungeons: ['crypt'],
      buildings: [],
      legendaryEnabled: true,
    });
    const after = MILESTONES.first_hero_l10(before);
    expect(after).toBe(before);
  });
});
