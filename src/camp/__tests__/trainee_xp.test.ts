import { describe, expect, it } from 'vitest';
import { grantTraineeXp } from '@camp/trainee_xp';
import type { SaveFile } from '@save/save';
import type { Hero } from '@heroes/hero';

function makeHero(id: string, xp = 0, level = 1): Hero {
  return {
    id,
    classId: 'knight',
    name: id,
    baseStats: { hp: 20, attack: 5, defense: 2, speed: 5, mind: 0, crit: 5, dodge: 5 },
    currentHp: 20,
    maxHp: 20,
    traitIds: ['stout'],
    bodySpriteId: 'body1',
    legsSpriteId: 'legs1',
    feetSpriteId: 'feet1',
    wounds: [],
    equipment: {
      weapon: {
        id: `w_${id}`,
        baseId: 'sword_basic',
        slot: 'weapon',
        rarity: 'common',
        affixes: [],
        floorRolledAt: 1,
      },
    },
    xp,
    level,
    pendingPerks: [],
    pickedPerks: [],
  };
}

function makeSaveFile(opts: {
  heroes: readonly Hero[];
  traineeHeroIds: readonly (string | null)[];
  trainingUnlocked: boolean;
  level?: 1 | 2 | 3;
}): SaveFile {
  return {
    version: 6,
    roster: { heroes: [...opts.heroes], capacity: 12 },
    vault: { gold: 0 },
    stash: { items: [] },
    unlocks: {
      classes: ['knight'],
      dungeons: ['crypt'],
      buildings: opts.trainingUnlocked ? ['training_grounds'] : [],
    },
    buildingLevels: {
      tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1,
      training_grounds: opts.level ?? 1,
    },
    hospitalTreatmentsRemaining: 1,
    tavernCandidates: [],
    campRngState: 0,
    traineeHeroIds: opts.traineeHeroIds,
  };
}

describe('grantTraineeXp', () => {
  it('no-op when Training Grounds not unlocked', () => {
    const h1 = makeHero('h1');
    const state = makeSaveFile({
      heroes: [h1], traineeHeroIds: ['h1'], trainingUnlocked: false,
    });
    const result = grantTraineeXp(state, 240, []);
    expect(result.eligibleCount).toBe(0);
    expect(result.xpPerTrainee).toBe(0);
    expect(result.state.roster.heroes[0]?.xp).toBe(0);
  });

  it('no-op when traineeXpBase is 0', () => {
    const h1 = makeHero('h1');
    const state = makeSaveFile({
      heroes: [h1], traineeHeroIds: ['h1'], trainingUnlocked: true,
    });
    const result = grantTraineeXp(state, 0, []);
    expect(result.eligibleCount).toBe(0);
    expect(result.state.roster.heroes[0]?.xp).toBe(0);
  });

  it('grants round(base × 0.25) XP per trainee at L1', () => {
    const h1 = makeHero('h1');
    const h2 = makeHero('h2');
    const state = makeSaveFile({
      heroes: [h1, h2], traineeHeroIds: ['h1', 'h2'], trainingUnlocked: true, level: 1,
    });
    const result = grantTraineeXp(state, 240, []);
    expect(result.eligibleCount).toBe(2);
    expect(result.xpPerTrainee).toBe(60);
    expect(result.state.roster.heroes.find((h) => h.id === 'h1')?.xp).toBe(60);
    expect(result.state.roster.heroes.find((h) => h.id === 'h2')?.xp).toBe(60);
  });

  it('grants round(base × 0.40) at L2 and round(base × 0.55) at L3', () => {
    const h1 = makeHero('h1');
    const state2 = makeSaveFile({
      heroes: [h1], traineeHeroIds: ['h1', null, null], trainingUnlocked: true, level: 2,
    });
    const result2 = grantTraineeXp(state2, 240, []);
    expect(result2.xpPerTrainee).toBe(96);

    const state3 = makeSaveFile({
      heroes: [h1], traineeHeroIds: ['h1', null, null, null], trainingUnlocked: true, level: 3,
    });
    const result3 = grantTraineeXp(state3, 240, []);
    expect(result3.xpPerTrainee).toBe(132);
  });

  it('skips slots that are null', () => {
    const h1 = makeHero('h1');
    const state = makeSaveFile({
      heroes: [h1], traineeHeroIds: [null, 'h1'], trainingUnlocked: true,
    });
    const result = grantTraineeXp(state, 240, []);
    expect(result.eligibleCount).toBe(1);
  });

  it('skips trainees whose id is in activeHeroIds (double-dip prevention)', () => {
    const h1 = makeHero('h1');
    const h2 = makeHero('h2');
    const state = makeSaveFile({
      heroes: [h1, h2], traineeHeroIds: ['h1', 'h2'], trainingUnlocked: true,
    });
    const result = grantTraineeXp(state, 240, ['h1']);
    expect(result.eligibleCount).toBe(1);
    expect(result.state.roster.heroes.find((h) => h.id === 'h1')?.xp).toBe(0);
    expect(result.state.roster.heroes.find((h) => h.id === 'h2')?.xp).toBe(60);
  });

  it('skips trainees whose id is not in roster.heroes (orphan)', () => {
    const h1 = makeHero('h1');
    const state = makeSaveFile({
      heroes: [h1], traineeHeroIds: ['h1', 'ghost-id'], trainingUnlocked: true,
    });
    const result = grantTraineeXp(state, 240, []);
    expect(result.eligibleCount).toBe(1);
    expect(result.state.roster.heroes.find((h) => h.id === 'h1')?.xp).toBe(60);
  });

  it('returns no-op result when every slot is null/orphan/active', () => {
    const h1 = makeHero('h1');
    const state = makeSaveFile({
      heroes: [h1], traineeHeroIds: [null, 'ghost'], trainingUnlocked: true,
    });
    const result = grantTraineeXp(state, 240, []);
    expect(result.eligibleCount).toBe(0);
    expect(result.xpPerTrainee).toBe(0);
    expect(result.state).toBe(state);
  });

  it('triggers level-ups via applyLevelUps', () => {
    const h1 = makeHero('h1', 150, 1);
    const state = makeSaveFile({
      heroes: [h1], traineeHeroIds: ['h1'], trainingUnlocked: true,
    });
    const result = grantTraineeXp(state, 240, []);
    const after = result.state.roster.heroes.find((h) => h.id === 'h1');
    expect(after?.xp).toBe(210);
    expect(after?.level).toBe(2);
    expect(after?.maxHp).toBeGreaterThan(20);
  });

  it('L5 trainee receives XP but level stays at 5', () => {
    const h1 = makeHero('h1', 4000, 5);
    h1.pendingPerks = ['l5'];
    const state = makeSaveFile({
      heroes: [h1], traineeHeroIds: ['h1'], trainingUnlocked: true,
    });
    const result = grantTraineeXp(state, 240, []);
    const after = result.state.roster.heroes.find((h) => h.id === 'h1');
    expect(after?.xp).toBe(4060);
    expect(after?.level).toBe(5);
    expect(after?.pendingPerks).toEqual(['l5']);
  });
});
