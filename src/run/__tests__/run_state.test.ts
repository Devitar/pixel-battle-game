import { describe, expect, it } from 'vitest';
import { createHeroCombatant } from '../../combat/combatant';
import type { CombatResult, CombatState } from '../../combat/types';
import type { SlotIndex } from '../../data/types';
import { createHero, type Hero } from '../../heroes/hero';
import { createRng } from '../../util/rng';
import { cashout, completeCombat, currentNode, pressOn, startRun } from '../run_state';

function makeParty(): Hero[] {
  return [
    createHero('knight', 'K', 'h0'),
    createHero('archer', 'A', 'h1'),
    createHero('priest', 'P', 'h2'),
  ];
}

function mockCombatResult(
  party: readonly Hero[],
  finalHps: readonly number[],
  outcome: CombatResult['outcome'],
): CombatResult {
  const combatants = party.map((hero, i) => {
    const finalHp = finalHps[i] ?? hero.currentHp;
    return createHeroCombatant(hero.classId, (i + 1) as SlotIndex, `p${i}`, {
      baseStats: hero.baseStats,
      currentHp: finalHp,
      maxHp: hero.maxHp,
      isDead: finalHp <= 0,
    });
  });
  const state: CombatState = { combatants, round: 1 };
  return { finalState: state, events: [], outcome };
}

describe('startRun', () => {
  it('returns in_dungeon status with floor 1 generated', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.status).toBe('in_dungeon');
    expect(rs.currentFloorNumber).toBe(1);
    expect(rs.currentNodeIndex).toBe(0);
    expect(rs.pack).toEqual({ gold: 0 });
    expect(rs.fallen).toEqual([]);
    expect(rs.currentFloorNodes).toHaveLength(4);
  });

  it('throws on party size != 3', () => {
    const rng = createRng(1);
    expect(() => startRun('crypt', [], 1, rng)).toThrow();
    expect(() => startRun('crypt', [createHero('knight', 'K', 'h0')], 1, rng)).toThrow();
    const four: Hero[] = [
      createHero('knight', 'K', 'h0'),
      createHero('archer', 'A', 'h1'),
      createHero('priest', 'P', 'h2'),
      createHero('knight', 'K2', 'h3'),
    ];
    expect(() => startRun('crypt', four, 1, rng)).toThrow();
  });
});

describe('currentNode', () => {
  it('returns the node at currentNodeIndex', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const node = currentNode(rs);
    expect(node).toBe(rs.currentFloorNodes[0]);
  });

  it('throws when status is not in_dungeon', () => {
    const rs = { ...startRun('crypt', makeParty(), 1, createRng(1)), status: 'camp_screen' as const };
    expect(() => currentNode(rs)).toThrow();
  });
});

describe('completeCombat — victory on combat node', () => {
  it('advances to the next node and awards 15 × floorNumber gold', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [18, 10, 12], 'player_victory');
    const { runState: rs2, wipe } = completeCombat(rs, result);
    expect(wipe).toBeUndefined();
    expect(rs2.status).toBe('in_dungeon');
    expect(rs2.currentNodeIndex).toBe(1);
    expect(rs2.pack.gold).toBe(15);
    expect(rs2.party[0].currentHp).toBe(18);
    expect(rs2.party[1].currentHp).toBe(10);
    expect(rs2.party[2].currentHp).toBe(12);
  });

  it('one hero dies but party survives — moves dead hero to fallen', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [10, 0, 12], 'player_victory');
    const { runState: rs2, wipe } = completeCombat(rs, result);
    expect(wipe).toBeUndefined();
    expect(rs2.party).toHaveLength(2);
    expect(rs2.party.map((h) => h.id)).toEqual(['h0', 'h2']);
    expect(rs2.fallen).toHaveLength(1);
    expect(rs2.fallen[0].id).toBe('h1');
    expect(rs2.pack.gold).toBe(15);
    expect(rs2.status).toBe('in_dungeon');
    expect(rs2.currentNodeIndex).toBe(1);
  });
});

describe('completeCombat — victory on boss node', () => {
  it('transitions to camp_screen and awards 100 × floorNumber gold', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    for (let i = 0; i < 3; i++) {
      const result = mockCombatResult(rs.party, [18, 10, 12], 'player_victory');
      rs = completeCombat(rs, result).runState;
    }
    expect(rs.currentNodeIndex).toBe(3);
    expect(rs.currentFloorNodes[3].type).toBe('boss');

    const bossResult = mockCombatResult(rs.party, [5, 5, 5], 'player_victory');
    const { runState: rs2, wipe } = completeCombat(rs, bossResult);
    expect(wipe).toBeUndefined();
    expect(rs2.status).toBe('camp_screen');
    expect(rs2.pack.gold).toBe(15 * 3 + 100);
    expect(rs2.currentNodeIndex).toBe(3);
  });
});

describe('completeCombat — defeat or timeout', () => {
  it('player_defeat triggers wipe', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [0, 0, 0], 'player_defeat');
    const { runState: rs2, wipe } = completeCombat(rs, result);
    expect(rs2.status).toBe('ended');
    expect(rs2.party).toEqual([]);
    expect(rs2.pack).toEqual({ gold: 0 });
    expect(wipe).toBeDefined();
    expect(wipe?.packLost).toEqual({ gold: 0 });
    expect(wipe?.heroesLost).toHaveLength(3);
  });

  it('timeout triggers wipe', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [15, 10, 8], 'timeout');
    const { wipe } = completeCombat(rs, result);
    expect(wipe).toBeDefined();
    expect(wipe?.heroesLost).toHaveLength(3);
  });

  it('wipe heroesLost includes heroes who fell in earlier combats', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = completeCombat(rs, mockCombatResult(rs.party, [10, 0, 12], 'player_victory')).runState;
    expect(rs.fallen).toHaveLength(1);
    expect(rs.fallen[0].id).toBe('h1');

    const wipeResult = mockCombatResult(rs.party, [0, 0], 'player_defeat');
    const { wipe } = completeCombat(rs, wipeResult);
    expect(wipe).toBeDefined();
    expect(wipe?.heroesLost).toHaveLength(3);
    expect(wipe?.heroesLost.map((h) => h.id).sort()).toEqual(['h0', 'h1', 'h2']);
  });

  it('wipe zeroes the pack but carries the pre-wipe pack in the outcome', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = completeCombat(rs, mockCombatResult(rs.party, [18, 10, 12], 'player_victory')).runState;
    expect(rs.pack.gold).toBe(15);
    const { runState: rs2, wipe } = completeCombat(rs, mockCombatResult(rs.party, [0, 0, 0], 'player_defeat'));
    expect(rs2.pack).toEqual({ gold: 0 });
    expect(wipe?.packLost).toEqual({ gold: 15 });
  });
});

describe('pressOn', () => {
  it('generates the next floor and resets node index', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    for (let i = 0; i < 3; i++) {
      rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory')).runState;
    }
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory')).runState;
    expect(rs.status).toBe('camp_screen');
    expect(rs.currentFloorNumber).toBe(1);

    const rs2 = pressOn(rs, createRng(99));
    expect(rs2.currentFloorNumber).toBe(2);
    expect(rs2.currentNodeIndex).toBe(0);
    expect(rs2.status).toBe('in_dungeon');
    expect(rs2.currentFloorNodes).toHaveLength(4);
    expect(rs2.party).toEqual(rs.party);
    expect(rs2.pack).toEqual(rs.pack);
  });

  it('throws when status is not camp_screen', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(() => pressOn(rs, createRng(1))).toThrow();
  });
});

describe('cashout', () => {
  it('returns outcome with gold and hero lists; runState goes to ended', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    for (let i = 0; i < 3; i++) {
      rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory')).runState;
    }
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory')).runState;

    const { runState: rs2, outcome } = cashout(rs);
    expect(rs2.status).toBe('ended');
    expect(outcome.goldBanked).toBe(15 * 3 + 100);
    expect(outcome.heroesReturned).toHaveLength(3);
    expect(outcome.heroesLost).toEqual([]);
  });

  it('throws when status is not camp_screen', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(() => cashout(rs)).toThrow();
  });
});

describe('immutability', () => {
  it('startRun followed by completeCombat does not mutate the original RunState', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const snapshot = JSON.parse(JSON.stringify(rs));
    completeCombat(rs, mockCombatResult(rs.party, [15, 10, 10], 'player_victory'));
    expect(JSON.parse(JSON.stringify(rs))).toEqual(snapshot);
  });
});
