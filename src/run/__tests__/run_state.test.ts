import { describe, expect, it } from 'vitest';
import { createHeroCombatant } from '../../combat/combatant';
import type { CombatResult, CombatState } from '../../combat/types';
import type { SlotIndex } from '../../data/types';
import { createHero, type Hero } from '../../heroes/hero';
import { createRng } from '../../util/rng';
import { cashout, completeCombat, currentNode, pressOn, startRun } from '../run_state';

function makeParty(): Hero[] {
  return [
    createHero('knight', 'K', 'h0', 'quick', 'body1'),
    createHero('archer', 'A', 'h1', 'quick', 'body1'),
    createHero('priest', 'P', 'h2', 'quick', 'body1'),
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
  const state: CombatState = { combatants, round: 1, exhaustionLevel: 0 };
  return { finalState: state, events: [], outcome };
}

describe('startRun', () => {
  it('returns in_dungeon status with floor 1 generated', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.status).toBe('in_dungeon');
    expect(rs.currentFloorNumber).toBe(1);
    expect(rs.currentNodeIndex).toBe(0);
    expect(rs.pack).toEqual({ gold: 0, items: [] });
    expect(rs.fallen).toEqual([]);
    expect(rs.currentFloorNodes).toHaveLength(4);
  });

  it('throws on party size != 3', () => {
    const rng = createRng(1);
    expect(() => startRun('crypt', [], 1, rng)).toThrow();
    expect(() => startRun('crypt', [createHero('knight', 'K', 'h0', 'quick', 'body1')], 1, rng)).toThrow();
    const four: Hero[] = [
      createHero('knight', 'K', 'h0', 'quick', 'body1'),
      createHero('archer', 'A', 'h1', 'quick', 'body1'),
      createHero('priest', 'P', 'h2', 'quick', 'body1'),
      createHero('knight', 'K2', 'h3', 'quick', 'body1'),
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
    const { runState: rs2, wipe } = completeCombat(rs, result, createRng(99));
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
    const { runState: rs2, wipe } = completeCombat(rs, result, createRng(99));
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
      rs = completeCombat(rs, result, createRng(99)).runState;
    }
    expect(rs.currentNodeIndex).toBe(3);
    expect(rs.currentFloorNodes[3].type).toBe('boss');

    const bossResult = mockCombatResult(rs.party, [5, 5, 5], 'player_victory');
    const { runState: rs2, wipe } = completeCombat(rs, bossResult, createRng(99));
    expect(wipe).toBeUndefined();
    expect(rs2.status).toBe('camp_screen');
    expect(rs2.pack.gold).toBe(15 * 3 + 100);
    expect(rs2.currentNodeIndex).toBe(3);
  });
});

describe('completeCombat — defeat', () => {
  it('player_defeat triggers wipe', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [0, 0, 0], 'player_defeat');
    const { runState: rs2, wipe } = completeCombat(rs, result, createRng(99));
    expect(rs2.status).toBe('ended');
    expect(rs2.party).toEqual([]);
    expect(rs2.pack).toEqual({ gold: 0, items: [] });
    expect(wipe).toBeDefined();
    expect(wipe?.packLost).toEqual({ gold: 0, items: [] });
    expect(wipe?.heroesLost).toHaveLength(3);
  });

  it('wipe heroesLost includes heroes who fell in earlier combats', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = completeCombat(rs, mockCombatResult(rs.party, [10, 0, 12], 'player_victory'), createRng(99)).runState;
    expect(rs.fallen).toHaveLength(1);
    expect(rs.fallen[0].id).toBe('h1');

    const wipeResult = mockCombatResult(rs.party, [0, 0], 'player_defeat');
    const { wipe } = completeCombat(rs, wipeResult, createRng(99));
    expect(wipe).toBeDefined();
    expect(wipe?.heroesLost).toHaveLength(3);
    expect(wipe?.heroesLost.map((h) => h.id).sort()).toEqual(['h0', 'h1', 'h2']);
  });

  it('wipe zeroes the pack but carries the pre-wipe pack in the outcome', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = completeCombat(rs, mockCombatResult(rs.party, [18, 10, 12], 'player_victory'), createRng(99)).runState;
    expect(rs.pack.gold).toBe(15);
    const { runState: rs2, wipe } = completeCombat(rs, mockCombatResult(rs.party, [0, 0, 0], 'player_defeat'), createRng(99));
    expect(rs2.pack).toEqual({ gold: 0, items: [] });
    // Pre-wipe pack carried 15 gold + whatever loot rolled in. Both lost.
    expect(wipe?.packLost.gold).toBe(15);
  });
});

describe('pressOn', () => {
  it('generates the next floor and resets node index', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    for (let i = 0; i < 3; i++) {
      rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    }
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
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
      rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    }
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;

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
    completeCombat(rs, mockCombatResult(rs.party, [15, 10, 10], 'player_victory'), createRng(99));
    expect(JSON.parse(JSON.stringify(rs))).toEqual(snapshot);
  });
});

describe('completeCombat — loot drop', () => {
  function advanceToBoss(rs: ReturnType<typeof startRun>): ReturnType<typeof startRun> {
    let cur = rs;
    while (cur.currentFloorNodes[cur.currentNodeIndex].type !== 'boss') {
      cur = completeCombat(
        cur,
        mockCombatResult(cur.party, [20, 14, 15], 'player_victory'),
        createRng(50),
      ).runState;
    }
    return cur;
  }

  it('boss victory always appends one item to pack', () => {
    const rs = advanceToBoss(startRun('crypt', makeParty(), 1, createRng(1)));
    const before = rs.pack.items.length;
    const next = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(7)).runState;
    expect(next.pack.items.length).toBe(before + 1);
  });

  it('combat-node victory appends 0 or 1 items, depending on RNG', () => {
    let drops = 0;
    let noDrops = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const rs = startRun('crypt', makeParty(), 1, createRng(seed));
      const next = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(seed * 1000)).runState;
      if (next.pack.items.length > 0) drops += 1; else noDrops += 1;
    }
    expect(drops).toBeGreaterThan(0);
    expect(noDrops).toBeGreaterThan(0);
  });
});

describe('completeCombat — fallen gear transfer', () => {
  it('fallen hero gear transfers into the pack on victory', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Knight (h0) falls; archer + priest survive.
    const result = mockCombatResult(rs.party, [0, 14, 15], 'player_victory');
    const next = completeCombat(rs, result, createRng(99)).runState;
    // Knight gear: weapon + shield = 2 items minimum (+ possible loot drop)
    const ids = next.pack.items.map((i) => i.id);
    expect(ids).toContain('starter_h0_weapon');
    expect(ids).toContain('starter_h0_shield');
  });

  it('on wipe, all gear is lost (pack.items zeroed)', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [0, 0, 0], 'player_defeat');
    const { runState, wipe } = completeCombat(rs, result, createRng(99));
    expect(runState.pack.items).toEqual([]);
    expect(wipe).toBeDefined();
  });
});

describe('cashout — itemsBanked', () => {
  it('returns the pack items in outcome.itemsBanked', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Advance through several combats so loot may drop, then to boss for camp_screen.
    while (rs.currentFloorNodes[rs.currentNodeIndex].type !== 'boss') {
      rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(50)).runState;
    }
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(50)).runState;
    expect(rs.status).toBe('camp_screen');
    const itemsInPack = rs.pack.items;
    const { outcome } = cashout(rs);
    expect(outcome.itemsBanked).toEqual(itemsInPack);
  });
});

describe('completeCombat — XP awards', () => {
  it('awards 5×floor XP to survivors after a floor-1 combat-node victory', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [18, 10, 12], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(5);
      expect(hero.level).toBe(1);
    }
  });

  it('awards 30×floor XP after a boss victory', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Advance to the boss node (floor 1 has 3 combat + 1 boss).
    for (let i = 0; i < 3; i++) {
      rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    }
    const bossResult = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, bossResult, createRng(99));
    // Each survivor accumulated 3 × 5 (combat) + 30 (boss) = 45 XP.
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(45);
    }
  });

  it('does not award XP to dead heroes (combatant isDead)', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [18, 0, 12], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(5);
    }
    // Dead hero went into fallen, did not receive XP.
    expect(rs2.fallen).toHaveLength(1);
    expect(rs2.fallen[0].xp).toBe(0);
  });

  it('does not award XP on player_defeat', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [0, 0, 0], 'player_defeat');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    expect(rs2.party).toHaveLength(0);
    for (const hero of rs2.fallen) {
      expect(hero.xp).toBe(0);
    }
  });

  it('crossing the level-2 threshold applies stat bumps', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Pre-load each hero with 195 XP so the next 5-XP combat reward crosses 200.
    rs = {
      ...rs,
      party: rs.party.map((h) => ({ ...h, xp: 195 })),
    };
    const result = mockCombatResult(rs.party, [18, 10, 12], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(200);
      expect(hero.level).toBe(2);
    }
    // Knight got +1 defense; archer got +1 attack; priest got +1 mind.
    const knight = rs2.party.find((h) => h.classId === 'knight')!;
    expect(knight.baseStats.defense).toBe(5); // base 4 + 1
  });

  it('crossing to level 5 sets pendingPerk', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = {
      ...rs,
      party: rs.party.map((h) => ({ ...h, xp: 3995, level: 4 })),
    };
    const result = mockCombatResult(rs.party, [18, 10, 12], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(4000);
      expect(hero.level).toBe(5);
      expect(hero.pendingPerk).toBe(true);
    }
  });
});
