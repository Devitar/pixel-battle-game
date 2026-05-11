import { describe, expect, it } from 'vitest';
import { createHero, type Hero } from '@heroes/hero';
import { createRng } from '@util/rng';
import { applyCampNodeEffect, HEAL_PARTY_PERCENT } from '../camp_node';
import type { RunState } from '@run/run_state';
import type { Wound } from '@data/types';

function makeParty(): Hero[] {
  return [
    createHero('knight', 'K', 'h0', 'quick', 'body1'),
    createHero('archer', 'A', 'h1', 'quick', 'body1'),
    createHero('priest', 'P', 'h2', 'quick', 'body1'),
  ];
}

function makeRunState(partyOverrides: Partial<Hero>[] = []): RunState {
  const party = makeParty().map((h, i) => ({ ...h, ...(partyOverrides[i] ?? {}) }));
  return {
    dungeonId: 'crypt',
    seed: 1,
    party,
    pack: { gold: 0, items: [] },
    currentFloorNumber: 1,
    currentFloorNodes: [],
    currentNodeId: '',
    awaitingFork: false,
    status: 'in_dungeon',
    fallen: [],
    lost: [],
    traversedNodeIds: [],
    surprisesThisFloor: 0,
    pendingMilestones: [],
    petsDownByHeroId: [],
    traineeXpBase: 0,
  };
}

describe('applyCampNodeEffect — heal_party', () => {
  it('grants each hero +round(maxHp * HEAL_PARTY_PERCENT) HP', () => {
    const rs = makeRunState([
      { currentHp: 1, maxHp: 20 },
      { currentHp: 5, maxHp: 24 },
      { currentHp: 10, maxHp: 16 },
    ]);
    const result = applyCampNodeEffect(rs, { kind: 'heal_party' }, createRng(1));
    expect(result.party[0].currentHp).toBe(1 + Math.round(20 * HEAL_PARTY_PERCENT));   // 1 + 5 = 6
    expect(result.party[1].currentHp).toBe(5 + Math.round(24 * HEAL_PARTY_PERCENT));   // 5 + 6 = 11
    expect(result.party[2].currentHp).toBe(10 + Math.round(16 * HEAL_PARTY_PERCENT));  // 10 + 4 = 14
  });

  it('caps healing at maxHp (no overflow)', () => {
    const rs = makeRunState([
      { currentHp: 19, maxHp: 20 },
      { currentHp: 24, maxHp: 24 },
      { currentHp: 12, maxHp: 16 },
    ]);
    const result = applyCampNodeEffect(rs, { kind: 'heal_party' }, createRng(1));
    expect(result.party[0].currentHp).toBe(20); // 19 + 5 = 24, capped at 20
    expect(result.party[1].currentHp).toBe(24); // already at max
    expect(result.party[2].currentHp).toBe(16); // 12 + 4 = 16, exactly at max
  });

  it('does not touch the fallen list', () => {
    const rs = makeRunState();
    const fallenHero = makeParty()[0];
    const rsWithFallen: RunState = { ...rs, fallen: [{ ...fallenHero, currentHp: 0 }] };
    const result = applyCampNodeEffect(rsWithFallen, { kind: 'heal_party' }, createRng(1));
    expect(result.fallen).toEqual(rsWithFallen.fallen);
    expect(result.fallen[0].currentHp).toBe(0);
  });

  it('leaves wounds untouched', () => {
    const wounds: Wound[] = [{ id: 'bruised', runsRemaining: 5 }];
    const rs = makeRunState([{ currentHp: 1, maxHp: 20, wounds }]);
    const result = applyCampNodeEffect(rs, { kind: 'heal_party' }, createRng(1));
    expect(result.party[0].wounds).toEqual(wounds);
  });
});

describe('applyCampNodeEffect — treat_wound', () => {
  it('removes the specified wound; other wounds intact', () => {
    const wounds: Wound[] = [
      { id: 'bruised', runsRemaining: 5 },
      { id: 'hobbled', runsRemaining: 3 },
      { id: 'winded',  runsRemaining: 2 },
    ];
    const rs = makeRunState([{ wounds }]);
    const result = applyCampNodeEffect(
      rs,
      { kind: 'treat_wound', heroIndex: 0, woundIndex: 1 },
      createRng(1),
    );
    expect(result.party[0].wounds).toHaveLength(2);
    expect(result.party[0].wounds[0]).toEqual({ id: 'bruised', runsRemaining: 5 });
    expect(result.party[0].wounds[1]).toEqual({ id: 'winded',  runsRemaining: 2 });
  });

  it('leaves other heroes untouched', () => {
    const rs = makeRunState([
      { wounds: [{ id: 'bruised', runsRemaining: 5 }] },
      { wounds: [{ id: 'hobbled', runsRemaining: 3 }] },
      { wounds: [] },
    ]);
    const result = applyCampNodeEffect(
      rs,
      { kind: 'treat_wound', heroIndex: 0, woundIndex: 0 },
      createRng(1),
    );
    expect(result.party[0].wounds).toEqual([]);
    expect(result.party[1].wounds).toEqual([{ id: 'hobbled', runsRemaining: 3 }]);
    expect(result.party[2].wounds).toEqual([]);
  });

  it('leaves currentHp untouched', () => {
    const rs = makeRunState([
      { currentHp: 10, maxHp: 20, wounds: [{ id: 'bruised', runsRemaining: 5 }] },
    ]);
    const result = applyCampNodeEffect(
      rs,
      { kind: 'treat_wound', heroIndex: 0, woundIndex: 0 },
      createRng(1),
    );
    expect(result.party[0].currentHp).toBe(10);
  });

  it('throws on heroIndex out of range', () => {
    const rs = makeRunState();
    expect(() =>
      applyCampNodeEffect(rs, { kind: 'treat_wound', heroIndex: 99, woundIndex: 0 }, createRng(1)),
    ).toThrow();
    expect(() =>
      applyCampNodeEffect(rs, { kind: 'treat_wound', heroIndex: -1, woundIndex: 0 }, createRng(1)),
    ).toThrow();
  });

  it('throws on woundIndex out of range', () => {
    const rs = makeRunState([{ wounds: [{ id: 'bruised', runsRemaining: 5 }] }]);
    expect(() =>
      applyCampNodeEffect(rs, { kind: 'treat_wound', heroIndex: 0, woundIndex: 5 }, createRng(1)),
    ).toThrow();
    expect(() =>
      applyCampNodeEffect(rs, { kind: 'treat_wound', heroIndex: 0, woundIndex: -1 }, createRng(1)),
    ).toThrow();
  });

  it('throws if hero has empty wounds array', () => {
    const rs = makeRunState();
    expect(() =>
      applyCampNodeEffect(rs, { kind: 'treat_wound', heroIndex: 0, woundIndex: 0 }, createRng(1)),
    ).toThrow();
  });
});

describe('applyCampNodeEffect — pet respawn', () => {
  it('clears petsDownByHeroId on heal_party', () => {
    const baseRunState = makeRunState();
    const runState = { ...baseRunState, petsDownByHeroId: ['hunter_id_1', 'hunter_id_2'] };
    const after = applyCampNodeEffect(runState, { kind: 'heal_party' }, createRng(0));
    expect(after.petsDownByHeroId).toEqual([]);
  });

  it('clears petsDownByHeroId on treat_wound', () => {
    const baseRunState = makeRunState();
    const wounded: Hero = { ...baseRunState.party[0], wounds: [{ id: 'bruised', runsRemaining: 2 }] };
    const runState = {
      ...baseRunState,
      party: [wounded, ...baseRunState.party.slice(1)],
      petsDownByHeroId: ['hunter_id_1'],
    };
    const after = applyCampNodeEffect(
      runState, { kind: 'treat_wound', heroIndex: 0, woundIndex: 0 }, createRng(0),
    );
    expect(after.petsDownByHeroId).toEqual([]);
    expect(after.party[0].wounds).toHaveLength(0);
  });
});

describe('applyCampNodeEffect — determinism', () => {
  it('same input → same output for heal_party', () => {
    const rs = makeRunState([{ currentHp: 5, maxHp: 20 }]);
    const a = applyCampNodeEffect(rs, { kind: 'heal_party' }, createRng(1));
    const b = applyCampNodeEffect(rs, { kind: 'heal_party' }, createRng(1));
    expect(a).toEqual(b);
  });

  it('HEAL_PARTY_PERCENT is exactly 0.25', () => {
    expect(HEAL_PARTY_PERCENT).toBe(0.25);
  });
});
