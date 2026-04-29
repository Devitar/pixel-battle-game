import { describe, expect, it } from 'vitest';
import { createHeroCombatant } from '../../combat/combatant';
import type { CombatResult, CombatState } from '../../combat/types';
import { xpForEliteNode } from '../../data/leveling';
import type { SlotIndex } from '../../data/types';
import type { Encounter, Node } from '../../dungeon/node';
import { createHero, type Hero } from '../../heroes/hero';
import { createRng } from '../../util/rng';
import {
  cashout,
  chooseCampNodeEffect,
  chooseNextNode,
  completeCombat,
  currentNode,
  leaveShop,
  nextNodeChoices,
  playerPath,
  pressOn,
  purchaseItem,
  startRun,
} from '../run_state';

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

/**
 * Walks the run from the current node to (but not entering) the boss,
 * skipping shops via leaveShop and picking the combat branch at forks
 * so the path always traverses combat-only.
 */
function advanceToBossNode(rsArg: ReturnType<typeof startRun>): ReturnType<typeof startRun> {
  let rs = rsArg;
  while (true) {
    const node = currentNode(rs);
    if (node.type === 'boss') return rs;
    if (node.type === 'shop') {
      rs = leaveShop(rs);
      continue;
    }
    if (node.type === 'camp') {
      rs = chooseCampNodeEffect(rs, { kind: 'heal_party' }, createRng(99)).runState;
      continue;
    }
    // node.type is 'combat' or 'elite' — both go through completeCombat
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    if (rs.awaitingFork) {
      const choices = nextNodeChoices(rs);
      const combatBranch =
        choices.find((n) => n.type === 'combat') ??
        choices.find((n) => n.type === 'elite') ??
        choices[0];
      rs = chooseNextNode(rs, combatBranch.id);
    }
  }
}

/**
 * Returns a RunState started from a seed whose floor 1 includes a shop on
 * one of the fork branches. After Task 5, fork shape is RNG-rolled per seed,
 * so callers needing a shop must search for a shop-bearing seed.
 */
function startRunWithShop(): ReturnType<typeof startRun> {
  for (let seed = 1; seed <= 50; seed++) {
    const rs = startRun('crypt', makeParty(), seed, createRng(seed));
    if (rs.currentFloorNodes.some((n) => n.type === 'shop')) {
      return rs;
    }
  }
  throw new Error('no shop-bearing seed in [1..50]');
}

/**
 * Walks to the shop node (whichever fork branch it's on for the seed).
 */
function navigateToShop(rsArg: ReturnType<typeof startRun>): ReturnType<typeof startRun> {
  let rs = rsArg;
  // Clear n0.
  rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
  // Clear n1, hit fork.
  rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
  // Pick the shop branch.
  const shopBranch = nextNodeChoices(rs).find((n) => n.type === 'shop')!;
  rs = chooseNextNode(rs, shopBranch.id);
  return rs;
}

describe('startRun', () => {
  it('returns in_dungeon status with floor 1 generated', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.status).toBe('in_dungeon');
    expect(rs.currentFloorNumber).toBe(1);
    expect(rs.pack).toEqual({ gold: 0, items: [] });
    expect(rs.fallen).toEqual([]);
    expect(rs.currentFloorNodes).toHaveLength(5);
    expect(rs.awaitingFork).toBe(false);
  });

  it('currentNodeId equals the floor start node id', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.currentNodeId).toBe('crypt-f1-n0');
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
  it('returns the node matching currentNodeId', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const node = currentNode(rs);
    expect(node.id).toBe(rs.currentNodeId);
  });

  it('throws when status is not in_dungeon', () => {
    const rs = { ...startRun('crypt', makeParty(), 1, createRng(1)), status: 'camp_screen' as const };
    expect(() => currentNode(rs)).toThrow();
  });

  it('throws when currentNodeId is not in the floor', () => {
    const rs = { ...startRun('crypt', makeParty(), 1, createRng(1)), currentNodeId: 'bogus-id' };
    expect(() => currentNode(rs)).toThrow();
  });
});

describe('nextNodeChoices', () => {
  it('returns one node from the start (linear)', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const choices = nextNodeChoices(rs);
    expect(choices).toHaveLength(1);
    expect(choices[0].id).toBe('crypt-f1-n1');
  });

  it('returns two nodes from the fork source (n1)', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Clear n0 to advance to n1.
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.currentNodeId).toBe('crypt-f1-n1');
    const choices = nextNodeChoices(rs);
    expect(choices).toHaveLength(2);
    expect(choices.map((c) => c.id).sort()).toEqual(['crypt-f1-n2a', 'crypt-f1-n2b']);
  });
});

describe('chooseNextNode', () => {
  it('advances currentNodeId and clears awaitingFork', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.awaitingFork).toBe(true);
    rs = chooseNextNode(rs, 'crypt-f1-n2a');
    expect(rs.currentNodeId).toBe('crypt-f1-n2a');
    expect(rs.awaitingFork).toBe(false);
  });

  it('throws when chosen id is not in current node nextNodeIds', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(() => chooseNextNode(rs, 'crypt-f1-boss')).toThrow();
    expect(() => chooseNextNode(rs, 'bogus-id')).toThrow();
  });

  it('throws when status is not in_dungeon', () => {
    const rs = { ...startRun('crypt', makeParty(), 1, createRng(1)), status: 'camp_screen' as const };
    expect(() => chooseNextNode(rs, 'crypt-f1-n1')).toThrow();
  });
});

describe('completeCombat — victory on linear node', () => {
  it('advances currentNodeId to the single nextNodeId; awaitingFork stays false', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [18, 10, 12], 'player_victory');
    const { runState: rs2, wipe } = completeCombat(rs, result, createRng(99));
    expect(wipe).toBeUndefined();
    expect(rs2.currentNodeId).toBe('crypt-f1-n1');
    expect(rs2.awaitingFork).toBe(false);
    expect(rs2.status).toBe('in_dungeon');
  });

  it('drops fallen heroes from the party', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [10, 0, 12], 'player_victory');
    const { runState: rs2, wipe } = completeCombat(rs, result, createRng(99));
    expect(wipe).toBeUndefined();
    expect(rs2.party).toHaveLength(2);
    expect(rs2.fallen).toHaveLength(1);
  });
});

describe('completeCombat — victory at fork source', () => {
  it('keeps currentNodeId at fork source; sets awaitingFork true', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Clear n0 to position at n1 (fork source).
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.currentNodeId).toBe('crypt-f1-n1');
    expect(rs.awaitingFork).toBe(false);
    // Now clear n1.
    const result = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    expect(rs2.currentNodeId).toBe('crypt-f1-n1');
    expect(rs2.awaitingFork).toBe(true);
    expect(rs2.status).toBe('in_dungeon');
  });
});

describe('completeCombat — victory on boss node', () => {
  it('flips status to camp_screen', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);
    const bossResult = mockCombatResult(rs.party, [5, 5, 5], 'player_victory');
    const { runState: rs2, wipe } = completeCombat(rs, bossResult, createRng(99));
    expect(wipe).toBeUndefined();
    expect(rs2.status).toBe('camp_screen');
  });
});

describe('completeCombat — defeat', () => {
  it('returns wipe outcome and clears party + pack', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [0, 0, 0], 'player_defeat');
    const { runState: rs2, wipe } = completeCombat(rs, result, createRng(99));
    expect(wipe).toBeDefined();
    expect(rs2.status).toBe('ended');
    expect(rs2.party).toHaveLength(0);
    expect(rs2.pack).toEqual({ gold: 0, items: [] });
  });
});

describe('pressOn', () => {
  it('regenerates floor with new floorNumber and resets currentNodeId + awaitingFork', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.status).toBe('camp_screen');
    const rs2 = pressOn(rs, createRng(99));
    expect(rs2.status).toBe('in_dungeon');
    expect(rs2.currentFloorNumber).toBe(2);
    expect(rs2.currentNodeId).toBe('crypt-f2-n0');
    expect(rs2.awaitingFork).toBe(false);
  });
});

describe('cashout', () => {
  it('returns survivors and pack contents; ends the run', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    const itemsInPack = rs.pack.items;
    const { runState: rs2, outcome } = cashout(rs);
    expect(rs2.status).toBe('ended');
    expect(outcome.itemsBanked).toEqual(itemsInPack);
    expect(outcome.heroesReturned).toHaveLength(3);
  });

  it('throws when called outside camp_screen', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(() => cashout(rs)).toThrow();
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
    rs = advanceToBossNode(rs);
    // Path so far = 3 combat clears (n0 + n1 + branch), so each survivor has 15 XP.
    const bossResult = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, bossResult, createRng(99));
    // 15 (combat) + 30 (boss) = 45.
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(45);
    }
  });

  it('does not award XP to dead heroes', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [18, 0, 12], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    expect(rs2.fallen).toHaveLength(1);
    expect(rs2.fallen[0].xp).toBe(0);
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(5);
    }
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

describe('completeCombat — loot drop', () => {
  it('drops items into the pack on victory', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    let foundItem = false;
    for (let attempt = 0; attempt < 30 && !foundItem; attempt++) {
      const result = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
      const { runState: next } = completeCombat(rs, result, createRng(attempt + 1));
      if (next.pack.items.length > rs.pack.items.length) {
        foundItem = true;
      }
      rs = next;
      if (rs.awaitingFork) {
        // Prefer combat-bearing branches so completeCombat doesn't throw next iteration.
        const choices = nextNodeChoices(rs);
        const branch =
          choices.find((n) => n.type === 'combat') ??
          choices.find((n) => n.type === 'elite') ??
          choices[0];
        rs = chooseNextNode(rs, branch.id);
      }
      // If the current node is non-combat (shop/camp branch), walk past it.
      while (rs.status === 'in_dungeon' && currentNode(rs).type === 'shop') {
        rs = leaveShop(rs);
      }
      while (rs.status === 'in_dungeon' && currentNode(rs).type === 'camp') {
        rs = chooseCampNodeEffect(rs, { kind: 'heal_party' }, createRng(99)).runState;
      }
      if (rs.status !== 'in_dungeon') {
        rs = startRun('crypt', makeParty(), 1, createRng(attempt + 100));
      }
    }
    expect(foundItem).toBe(true);
  });

  it('loot drops are deterministic per RNG state', () => {
    const a = startRun('crypt', makeParty(), 1, createRng(1));
    const b = startRun('crypt', makeParty(), 1, createRng(1));
    const ra = completeCombat(a, mockCombatResult(a.party, [20, 14, 15], 'player_victory'), createRng(7)).runState;
    const rb = completeCombat(b, mockCombatResult(b.party, [20, 14, 15], 'player_victory'), createRng(7)).runState;
    expect(ra.pack).toEqual(rb.pack);
  });

  it('completeCombat is pure (does not mutate input runState)', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const before = JSON.stringify(rs);
    completeCombat(rs, mockCombatResult(rs.party, [15, 10, 10], 'player_victory'), createRng(99));
    expect(JSON.stringify(rs)).toBe(before);
  });
});

describe('playerPath', () => {
  it('at start node: path goes through branch A (default)', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const path = playerPath(rs);
    expect(path.map((n) => n.id)).toEqual([
      'crypt-f1-n0',
      'crypt-f1-n1',
      'crypt-f1-n2a',
      'crypt-f1-boss',
    ]);
  });

  it('at fork source awaiting pick: path defaults to branch A', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.awaitingFork).toBe(true);
    const path = playerPath(rs);
    expect(path[2].id).toBe('crypt-f1-n2a');
  });

  it('after picking branch A: path goes through n2a', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = chooseNextNode(rs, 'crypt-f1-n2a');
    const path = playerPath(rs);
    expect(path[2].id).toBe('crypt-f1-n2a');
  });

  it('after picking branch B: path goes through n2b', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = chooseNextNode(rs, 'crypt-f1-n2b');
    const path = playerPath(rs);
    expect(path[2].id).toBe('crypt-f1-n2b');
  });

  it('at boss after branch B: falls back to branch A (ambiguity)', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    rs = chooseNextNode(rs, 'crypt-f1-n2b');
    // n2b's type is seed-dependent — handle both shop and combat cases.
    const node2b = currentNode(rs);
    if (node2b.type === 'shop') {
      rs = leaveShop(rs);
    } else {
      rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    }
    expect(rs.currentNodeId).toBe('crypt-f1-boss');
    const path = playerPath(rs);
    // Both branches reach boss; defaults to A.
    expect(path[2].id).toBe('crypt-f1-n2a');
  });

  it('returns 4-node player path for Crypt floor (not the 5-node graph)', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const path = playerPath(rs);
    expect(path).toHaveLength(4);
  });
});

describe('purchaseItem', () => {
  it('decreases pack.gold by price, adds item to pack.items, marks slot sold', () => {
    let rs = startRunWithShop();
    rs = navigateToShop(rs);
    rs = { ...rs, pack: { ...rs.pack, gold: 1000 } };
    const shop = currentNode(rs);
    if (shop.type !== 'shop') throw new Error('expected shop');
    const targetItem = shop.inventory[0].item;
    const targetPrice = shop.inventory[0].price;

    const after = purchaseItem(rs, targetItem.id);
    expect(after.pack.gold).toBe(1000 - targetPrice);
    expect(after.pack.items.find((i) => i.id === targetItem.id)).toBeDefined();
    const updatedShop = after.currentFloorNodes.find((n) => n.id === shop.id)!;
    if (updatedShop.type !== 'shop') throw new Error('expected shop');
    expect(updatedShop.inventory[0].sold).toBe(true);
  });

  it('throws when current node is not a shop', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(() => purchaseItem(rs, 'any-id')).toThrow();
  });

  it('throws on unknown item id', () => {
    let rs = startRunWithShop();
    rs = navigateToShop(rs);
    rs = { ...rs, pack: { ...rs.pack, gold: 1000 } };
    expect(() => purchaseItem(rs, 'bogus-item-id')).toThrow();
  });

  it('throws when item already sold', () => {
    let rs = startRunWithShop();
    rs = navigateToShop(rs);
    rs = { ...rs, pack: { ...rs.pack, gold: 1000 } };
    const shop = currentNode(rs);
    if (shop.type !== 'shop') throw new Error('expected shop');
    const itemId = shop.inventory[0].item.id;
    rs = purchaseItem(rs, itemId);
    expect(() => purchaseItem(rs, itemId)).toThrow();
  });

  it('throws on insufficient gold', () => {
    let rs = startRunWithShop();
    rs = navigateToShop(rs);
    rs = { ...rs, pack: { ...rs.pack, gold: 0 } };
    const shop = currentNode(rs);
    if (shop.type !== 'shop') throw new Error('expected shop');
    const itemId = shop.inventory[0].item.id;
    expect(() => purchaseItem(rs, itemId)).toThrow();
  });

  it('throws when status is not in_dungeon', () => {
    let rs = startRunWithShop();
    rs = navigateToShop(rs);
    const synthetic = { ...rs, status: 'camp_screen' as const };
    expect(() => purchaseItem(synthetic, 'any')).toThrow();
  });
});

describe('leaveShop', () => {
  it('advances currentNodeId to next', () => {
    let rs = startRunWithShop();
    rs = navigateToShop(rs);
    const shop = currentNode(rs);
    const before = rs.currentNodeId;
    const after = leaveShop(rs);
    expect(after.currentNodeId).not.toBe(before);
    expect(after.currentNodeId).toBe(shop.nextNodeIds[0]);
  });

  it('throws when current node is not a shop', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(() => leaveShop(rs)).toThrow();
  });

  it('throws when status is not in_dungeon', () => {
    let rs = startRunWithShop();
    rs = navigateToShop(rs);
    const synthetic = { ...rs, status: 'camp_screen' as const };
    expect(() => leaveShop(synthetic)).toThrow();
  });
});

function makeEliteRun(seed = 1): ReturnType<typeof startRun> {
  // Hand-build a RunState whose currentNode is an elite node so we can test
  // completeCombat's elite branch in isolation, independent of floor-gen
  // changes (those land in Task 5).
  const rs = startRun('crypt', makeParty(), seed, createRng(seed));
  const eliteEncounter: Encounter = {
    enemies: [{ enemyId: 'skeleton_warrior', slot: 1 }],
    scale: { hp: 1, attack: 1 },
  };
  const eliteId = 'crypt-f1-elite-test';
  const bossId = rs.currentFloorNodes.find((n) => n.type === 'boss')!.id;
  const eliteNode: Node = {
    id: eliteId,
    type: 'elite',
    encounter: eliteEncounter,
    nextNodeIds: [bossId],
  };
  return {
    ...rs,
    currentFloorNodes: [...rs.currentFloorNodes, eliteNode],
    currentNodeId: eliteId,
  };
}

describe('completeCombat — elite node', () => {
  it('grants 30 × floor gold to the pack', () => {
    const rs = makeEliteRun();
    const result = completeCombat(
      rs,
      mockCombatResult(rs.party, [20, 14, 15], 'player_victory'),
      createRng(99),
    );
    expect(result.runState.pack.gold).toBe(30 * rs.currentFloorNumber);
  });

  it('grants xpForEliteNode XP to surviving heroes', () => {
    const rs = makeEliteRun();
    const expectedXp = xpForEliteNode(rs.currentFloorNumber);
    const result = completeCombat(
      rs,
      mockCombatResult(rs.party, [20, 14, 15], 'player_victory'),
      createRng(99),
    );
    for (const hero of result.runState.party) {
      expect(hero.xp).toBe(expectedXp);
    }
  });

  it('always adds a Rare item to the pack', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rs = makeEliteRun(seed);
      const result = completeCombat(
        rs,
        mockCombatResult(rs.party, [20, 14, 15], 'player_victory'),
        createRng(seed),
      );
      expect(result.runState.pack.items).toHaveLength(1);
      expect(result.runState.pack.items[0].rarity).toBe('rare');
    }
  });

  it('advances to the next node (in_dungeon, not camp_screen)', () => {
    const rs = makeEliteRun();
    const result = completeCombat(
      rs,
      mockCombatResult(rs.party, [20, 14, 15], 'player_victory'),
      createRng(99),
    );
    expect(result.runState.status).toBe('in_dungeon');
  });
});

function makeCampRun(seed = 1): ReturnType<typeof startRun> {
  // Hand-build a RunState whose currentNode is a camp node so we can test
  // chooseCampNodeEffect in isolation, independent of floor-gen changes
  // (those land in Task 4).
  const rs = startRun('crypt', makeParty(), seed, createRng(seed));
  const campId = 'crypt-f1-camp-test';
  const bossId = rs.currentFloorNodes.find((n) => n.type === 'boss')!.id;
  const campNode: Node = {
    id: campId,
    type: 'camp',
    nextNodeIds: [bossId],
  };
  return {
    ...rs,
    currentFloorNodes: [...rs.currentFloorNodes, campNode],
    currentNodeId: campId,
  };
}

describe('chooseCampNodeEffect — heal_party', () => {
  it('advances currentNodeId and heals every hero by 25% maxHp', () => {
    const rs0 = makeCampRun();
    const damaged: ReturnType<typeof startRun> = {
      ...rs0,
      party: rs0.party.map((h) => ({ ...h, currentHp: 1 })),
    };
    const result = chooseCampNodeEffect(damaged, { kind: 'heal_party' }, createRng(1));
    expect(result.runState.currentNodeId).toBe('crypt-f1-boss');
    for (let i = 0; i < result.runState.party.length; i++) {
      const hero = result.runState.party[i];
      expect(hero.currentHp).toBe(1 + Math.round(hero.maxHp * 0.25));
    }
  });

  it('returns no outcome (only leave returns one)', () => {
    const rs = makeCampRun();
    const result = chooseCampNodeEffect(rs, { kind: 'heal_party' }, createRng(1));
    expect(result.outcome).toBeUndefined();
  });
});

describe('chooseCampNodeEffect — treat_wound', () => {
  it('advances currentNodeId and removes the wound', () => {
    const rs0 = makeCampRun();
    const wounded: ReturnType<typeof startRun> = {
      ...rs0,
      party: rs0.party.map((h, i) =>
        i === 0 ? { ...h, wounds: [{ id: 'bruised' as const, runsRemaining: 5 }] } : h,
      ),
    };
    const result = chooseCampNodeEffect(
      wounded,
      { kind: 'treat_wound', heroIndex: 0, woundIndex: 0 },
      createRng(1),
    );
    expect(result.runState.currentNodeId).toBe('crypt-f1-boss');
    expect(result.runState.party[0].wounds).toEqual([]);
  });
});

describe('chooseCampNodeEffect — leave (cashout)', () => {
  it('returns CashoutOutcome and ends the run', () => {
    const rs0 = makeCampRun();
    const withGold: ReturnType<typeof startRun> = {
      ...rs0,
      pack: { gold: 50, items: [] },
    };
    const result = chooseCampNodeEffect(withGold, { kind: 'leave' }, createRng(1));
    expect(result.outcome).toBeDefined();
    expect(result.outcome!.goldBanked).toBe(50);
    expect(result.outcome!.heroesReturned).toEqual(withGold.party);
    expect(result.runState.status).toBe('ended');
  });

  it('works on floor 1 with no boss beaten (no penalty/conditions)', () => {
    const rs = makeCampRun();
    expect(rs.currentFloorNumber).toBe(1);
    const result = chooseCampNodeEffect(rs, { kind: 'leave' }, createRng(1));
    expect(result.outcome).toBeDefined();
    expect(result.runState.status).toBe('ended');
  });
});

describe('chooseCampNodeEffect — validation', () => {
  it('throws if currentNode is not a camp', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(() => chooseCampNodeEffect(rs, { kind: 'heal_party' }, createRng(1))).toThrow();
  });

  it('throws if status is not in_dungeon', () => {
    const rs = makeCampRun();
    const ended: ReturnType<typeof startRun> = { ...rs, status: 'ended' };
    expect(() => chooseCampNodeEffect(ended, { kind: 'heal_party' }, createRng(1))).toThrow();
  });
});

describe('cashout — accepts camp nodes', () => {
  it('accepts in_dungeon + camp currentNode (no throw)', () => {
    const rs = makeCampRun();
    expect(() => cashout(rs)).not.toThrow();
    const { runState, outcome } = cashout(rs);
    expect(runState.status).toBe('ended');
    expect(outcome.heroesReturned).toEqual(rs.party);
  });

  it('still throws on in_dungeon at non-camp nodes', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    // currentNode is preamble combat, not camp.
    expect(() => cashout(rs)).toThrow();
  });

  it('still throws on status === ended', () => {
    const rs = makeCampRun();
    const ended: ReturnType<typeof startRun> = { ...rs, status: 'ended' };
    expect(() => cashout(ended)).toThrow();
  });
});
