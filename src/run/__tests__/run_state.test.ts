import { describe, expect, it } from 'vitest';
import { createHeroCombatant } from '@combat/combatant';
import type { CombatResult, CombatState } from '@combat/types';
import { xpForEliteNode } from '@data/leveling';
import type { Item, SlotIndex } from '@data/types';
import type { Encounter, Node } from '@dungeon/node';
import { createHero, type Hero } from '@heroes/hero';
import { createRng } from '@util/rng';
import {
  cashout,
  chooseCampNodeEffect,
  chooseNextNode,
  claimTreasure,
  completeCombat,
  currentNode,
  leaveShop,
  loseHero,
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
      // Prefer handleable branch types; the loop body knows how to advance past
      // combat / elite / shop / camp nodes but not event / treasure. Every fork
      // shape pairs at least one handleable type with anything else, so this
      // priority chain never has to fall through to choices[0].
      const handleableBranch =
        choices.find((n) => n.type === 'combat') ??
        choices.find((n) => n.type === 'elite') ??
        choices.find((n) => n.type === 'shop') ??
        choices.find((n) => n.type === 'camp') ??
        choices[0];
      rs = chooseNextNode(rs, handleableBranch.id);
    }
  }
}

/**
 * Walks the run until the current node has ≥2 outgoing edges (a fork).
 * Returns the runState at that point. Throws if no fork is reached before boss.
 */
function advanceToFork(rsArg: ReturnType<typeof startRun>): ReturnType<typeof startRun> {
  let rs = rsArg;
  while (true) {
    const node = currentNode(rs);
    if (node.nextNodeIds.length >= 2 && !rs.awaitingFork) {
      // Need to clear this node first to set awaitingFork.
      if (node.type === 'combat' || node.type === 'elite') {
        rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
        if (rs.awaitingFork) return rs;
        // After clear, currentNodeId may have advanced — fall through.
      } else {
        // Non-combat fork source — advance via direct chooseNextNode (rare in practice).
        return rs;
      }
    }
    if (rs.awaitingFork) return rs;
    if (node.type === 'boss') {
      throw new Error('advanceToFork: walked past boss without finding a fork');
    }
    if (node.type === 'shop') {
      rs = leaveShop(rs);
      continue;
    }
    if (node.type === 'camp') {
      rs = chooseCampNodeEffect(rs, { kind: 'heal_party' }, createRng(99)).runState;
      continue;
    }
    if (node.type === 'event' || node.type === 'treasure') {
      rs = chooseNextNode(rs, node.nextNodeIds[0]);
      continue;
    }
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    if (rs.awaitingFork) return rs;
  }
}

/**
 * Phase 2b: every floor has exactly one shop. Seed 1 suffices.
 */
function startRunWithShop(): ReturnType<typeof startRun> {
  return startRun('crypt', makeParty(), 1, createRng(1));
}

/**
 * Walks the run to the shop node (wherever it is in the multi-row floor).
 */
function navigateToShop(rsArg: ReturnType<typeof startRun>): ReturnType<typeof startRun> {
  let rs = rsArg;
  while (true) {
    const node = currentNode(rs);
    if (node.type === 'shop') return rs;
    if (node.type === 'boss') {
      throw new Error('navigateToShop: walked past shop without entering it');
    }
    if (node.type === 'camp') {
      rs = chooseCampNodeEffect(rs, { kind: 'heal_party' }, createRng(99)).runState;
      continue;
    }
    if (node.type === 'event' || node.type === 'treasure') {
      rs = chooseNextNode(rs, node.nextNodeIds[0]);
      continue;
    }
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    if (rs.awaitingFork) {
      const choices = nextNodeChoices(rs);
      const branch =
        choices.find((n) => n.type === 'shop') ??
        choices.find((n) => n.type === 'combat') ??
        choices.find((n) => n.type === 'elite') ??
        choices.find((n) => n.type === 'camp') ??
        choices[0];
      rs = chooseNextNode(rs, branch.id);
    }
  }
}

describe('startRun', () => {
  it('returns in_dungeon status with floor 1 generated', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.status).toBe('in_dungeon');
    expect(rs.currentFloorNumber).toBe(1);
    expect(rs.pack).toEqual({ gold: 0, items: [] });
    expect(rs.fallen).toEqual([]);
    // Phase 2b: 8-row floor with 1-3 nodes/middle row → ~12-17 total nodes.
    expect(rs.currentFloorNodes.length).toBeGreaterThanOrEqual(10);
    expect(rs.currentFloorNodes.length).toBeLessThanOrEqual(20);
    expect(rs.awaitingFork).toBe(false);
  });

  it('currentNodeId equals the floor start node id', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Phase 2b id format: ${dungeonId}-f${floor}-r${row}-s${slot}. Start is row 0, slot 1.
    expect(rs.currentNodeId).toBe('crypt-f1-r0-s1');
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
  it('returns one or more nodes matching the start node nextNodeIds', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const start = rs.currentFloorNodes.find((n) => n.id === rs.currentNodeId)!;
    const choices = nextNodeChoices(rs);
    expect(choices.map((c) => c.id).sort()).toEqual([...start.nextNodeIds].sort());
  });

  it('returns multiple nodes from a fork source', () => {
    const rs = advanceToFork(startRun('crypt', makeParty(), 1, createRng(1)));
    const fork = rs.currentFloorNodes.find((n) => n.id === rs.currentNodeId)!;
    const choices = nextNodeChoices(rs);
    expect(choices.length).toBeGreaterThanOrEqual(2);
    expect(choices.map((c) => c.id).sort()).toEqual([...fork.nextNodeIds].sort());
  });
});

describe('chooseNextNode', () => {
  it('advances currentNodeId and clears awaitingFork', () => {
    const rs = advanceToFork(startRun('crypt', makeParty(), 1, createRng(1)));
    expect(rs.awaitingFork).toBe(true);
    const fork = rs.currentFloorNodes.find((n) => n.id === rs.currentNodeId)!;
    const branchId = fork.nextNodeIds[0];
    const rs2 = chooseNextNode(rs, branchId);
    expect(rs2.currentNodeId).toBe(branchId);
    expect(rs2.awaitingFork).toBe(false);
  });

  it('throws when chosen id is not in current node nextNodeIds', () => {
    const rs = advanceToFork(startRun('crypt', makeParty(), 1, createRng(1)));
    const terminalNode = rs.currentFloorNodes.find((n) => n.nextNodeIds.length === 0)!;
    expect(() => chooseNextNode(rs, terminalNode.id)).toThrow();
    expect(() => chooseNextNode(rs, 'bogus-id')).toThrow();
  });

  it('throws when status is not in_dungeon', () => {
    const baseRs = startRun('crypt', makeParty(), 1, createRng(1));
    const start = baseRs.currentFloorNodes.find((n) => n.id === baseRs.currentNodeId)!;
    const rs = { ...baseRs, status: 'camp_screen' as const };
    expect(() => chooseNextNode(rs, start.nextNodeIds[0])).toThrow();
  });
});

describe('completeCombat — victory on linear node', () => {
  it('advances currentNodeId to the single nextNodeId; awaitingFork stays false', () => {
    // Find a seed where the start node has exactly one successor (linear case).
    let rs: ReturnType<typeof startRun> | undefined;
    for (let seed = 1; seed <= 50; seed++) {
      const candidate = startRun('crypt', makeParty(), seed, createRng(seed));
      const start = candidate.currentFloorNodes.find((n) => n.id === candidate.currentNodeId)!;
      if (start.nextNodeIds.length === 1) {
        rs = candidate;
        break;
      }
    }
    if (!rs) throw new Error('no seed found with single-successor start in 1..50');
    const startNode = rs.currentFloorNodes.find((n) => n.id === rs!.currentNodeId)!;
    const expectedNextId = startNode.nextNodeIds[0];
    const result = mockCombatResult(rs.party, [18, 10, 12], 'player_victory');
    const { runState: rs2, wipe } = completeCombat(rs, result, createRng(99));
    expect(wipe).toBeUndefined();
    expect(rs2.currentNodeId).toBe(expectedNextId);
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
    // Walk to a node with ≥2 outgoing edges that's a combat node (so we can
    // resolve combat at it). advanceToFork sets up the post-combat state where
    // awaitingFork=true at the fork source.
    const rs = advanceToFork(startRun('crypt', makeParty(), 1, createRng(1)));
    expect(rs.awaitingFork).toBe(true);
    expect(rs.status).toBe('in_dungeon');
    const fork = rs.currentFloorNodes.find((n) => n.id === rs.currentNodeId)!;
    expect(fork.nextNodeIds.length).toBeGreaterThanOrEqual(2);
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
    // Phase 2b: floor 2 has 9 rows. Start node is row 0, slot 1.
    expect(rs2.currentNodeId).toBe('crypt-f2-r0-s1');
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
    // Capture per-hero XP after the path walk; advanceToBossNode's path varies
    // by which fork shape RNG rolled (combat/elite/shop/camp branch). The test
    // pins the boss-XP delta, not the absolute total.
    const preBossXp = rs.party.map((h) => h.xp);
    const bossResult = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, bossResult, createRng(99));
    for (let i = 0; i < rs2.party.length; i++) {
      expect(rs2.party[i].xp).toBe(preBossXp[i] + 30);
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
        // Prefer combat-bearing then handleable branches so completeCombat
        // doesn't throw next iteration. Every fork shape has at least one
        // combat/elite/shop/camp branch — never falls through to choices[0].
        const choices = nextNodeChoices(rs);
        const branch =
          choices.find((n) => n.type === 'combat') ??
          choices.find((n) => n.type === 'elite') ??
          choices.find((n) => n.type === 'shop') ??
          choices.find((n) => n.type === 'camp') ??
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
  it('at start node: path begins at start, ends at boss', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const path = playerPath(rs);
    expect(path[0].id).toBe(rs.currentNodeId);
    expect(path[path.length - 1].type).toBe('boss');
  });

  it('after picking a fork branch: path passes through the picked branch', () => {
    const rs = advanceToFork(startRun('crypt', makeParty(), 1, createRng(1)));
    const fork = rs.currentFloorNodes.find((n) => n.id === rs.currentNodeId)!;
    const branchId = fork.nextNodeIds[1]; // pick the second branch (not the default)
    const advanced = chooseNextNode(rs, branchId);
    const path = playerPath(advanced);
    expect(path.some((n) => n.id === branchId)).toBe(true);
  });

  it('returns a path of length === rowCount for floor 1 (8 rows)', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const path = playerPath(rs);
    expect(path).toHaveLength(8);
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
    slot: 1,
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
    slot: 1,
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
    const expectedBossId = rs0.currentFloorNodes.find((n) => n.type === 'boss')!.id;
    const damaged: ReturnType<typeof startRun> = {
      ...rs0,
      party: rs0.party.map((h) => ({ ...h, currentHp: 1 })),
    };
    const result = chooseCampNodeEffect(damaged, { kind: 'heal_party' }, createRng(1));
    expect(result.runState.currentNodeId).toBe(expectedBossId);
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
    const expectedBossId = rs0.currentFloorNodes.find((n) => n.type === 'boss')!.id;
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
    expect(result.runState.currentNodeId).toBe(expectedBossId);
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

describe('startRun — lost field', () => {
  it('initializes lost as empty array', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.lost).toEqual([]);
  });
});

describe('loseHero', () => {
  it('removes hero at index from party and appends to lost', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.party).toHaveLength(3);
    expect(rs.lost).toHaveLength(0);
    const after = loseHero(rs, 1);
    expect(after.party).toHaveLength(2);
    expect(after.party[0].id).toBe('h0');
    expect(after.party[1].id).toBe('h2');
    expect(after.lost).toHaveLength(1);
    expect(after.lost[0].id).toBe('h1');
  });

  it('does not transfer the lost hero gear to the pack (distinct from Fallen)', () => {
    const rs0 = startRun('crypt', makeParty(), 1, createRng(1));
    // Verify the hero has at least one equipped item (starter weapon).
    expect(rs0.party[0].equipment.weapon).toBeDefined();
    const packItemsBefore = rs0.pack.items.length;
    const after = loseHero(rs0, 0);
    expect(after.pack.items.length).toBe(packItemsBefore);  // pack unchanged
    expect(after.lost[0].id).toBe('h0');                     // hero in lost
  });

  it('throws on heroIndex out of range', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(() => loseHero(rs, 99)).toThrow();
    expect(() => loseHero(rs, -1)).toThrow();
  });

  it('multiple loseHero calls accumulate in lost', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const after1 = loseHero(rs, 0);
    const after2 = loseHero(after1, 0);
    expect(after2.party).toHaveLength(1);
    expect(after2.lost).toHaveLength(2);
  });
});

describe('cashout — Lost vs Fallen separation', () => {
  it('with one Lost hero and no fallen: heroesLost has 1, heroesFallen empty', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = loseHero(rs, 1);
    const atCamp: ReturnType<typeof startRun> = { ...rs, status: 'camp_screen' };
    const { outcome } = cashout(atCamp);
    expect(outcome.heroesLost).toHaveLength(1);
    expect(outcome.heroesLost[0].id).toBe('h1');
    expect(outcome.heroesFallen).toHaveLength(0);
    expect(outcome.heroesReturned).toHaveLength(2);
  });

  it('with both Lost and Fallen: each outcome field carries the right hero', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    const fallenHero = rs.party[0];
    rs = {
      ...rs,
      party: rs.party.filter((_, i) => i !== 0),
      fallen: [fallenHero],
    };
    rs = loseHero(rs, 0);
    const atCamp: ReturnType<typeof startRun> = { ...rs, status: 'camp_screen' };
    const { outcome } = cashout(atCamp);
    expect(outcome.heroesFallen).toHaveLength(1);
    expect(outcome.heroesFallen[0].id).toBe('h0');
    expect(outcome.heroesLost).toHaveLength(1);
    expect(outcome.heroesLost[0].id).toBe('h1');
    expect(outcome.heroesReturned).toHaveLength(1);
    expect(outcome.heroesReturned[0].id).toBe('h2');
  });

  it('with no losses: both heroesFallen and heroesLost are empty', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const atCamp: ReturnType<typeof startRun> = { ...rs, status: 'camp_screen' };
    const { outcome } = cashout(atCamp);
    expect(outcome.heroesFallen).toEqual([]);
    expect(outcome.heroesLost).toEqual([]);
    expect(outcome.heroesReturned).toHaveLength(3);
  });
});

describe('completeCombat wipe — Lost vs Fallen separation', () => {
  it('with a pre-Lost hero, the wipe carries them in heroesLost (not heroesFallen)', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = loseHero(rs, 1);
    expect(rs.party).toHaveLength(2);
    expect(rs.lost).toHaveLength(1);
    const wipeResult = mockCombatResult(rs.party, rs.party.map(() => 0), 'player_defeat');
    const { wipe } = completeCombat(rs, wipeResult, createRng(99));
    expect(wipe).toBeDefined();
    expect(wipe!.heroesLost).toHaveLength(1);
    expect(wipe!.heroesLost[0].id).toBe('h1');
    const fallenIds = wipe!.heroesFallen.map((h) => h.id);
    expect(fallenIds).toContain('h0');
    expect(fallenIds).toContain('h2');
    expect(fallenIds).not.toContain('h1');
  });

  it('with no Lost heroes: wipe.heroesLost is empty array', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const wipeResult = mockCombatResult(rs.party, [0, 0, 0], 'player_defeat');
    const { wipe } = completeCombat(rs, wipeResult, createRng(99));
    expect(wipe).toBeDefined();
    expect(wipe!.heroesLost).toEqual([]);
    expect(wipe!.heroesFallen).toHaveLength(3);
  });
});

describe('claimTreasure', () => {
  function makeRunWithTreasureNode(): ReturnType<typeof startRun> {
    const baseRun = startRun('crypt', makeParty(), 1, createRng(1));
    // Substitute a synthetic 2-node floor: treasure → boss. Exercises the
    // helper in isolation regardless of what generateFloor rolled.
    const treasureNode: Node = { id: 't0', type: 'treasure', nextNodeIds: ['t-boss'], slot: 1 };
    const bossNode: Node = baseRun.currentFloorNodes.find((n) => n.type === 'boss')!;
    return {
      ...baseRun,
      currentFloorNodes: [treasureNode, { ...bossNode, id: 't-boss' }],
      currentNodeId: 't0',
    };
  }

  function makeItem(): Item {
    return {
      id: 'item-test-1',
      baseId: 'sword_basic',
      slot: 'weapon',
      rarity: 'common',
      weaponType: 'sword',
      affixes: [],
      floorRolledAt: 1,
    };
  }

  it('adds the item to the pack', () => {
    const run = makeRunWithTreasureNode();
    const item = makeItem();
    const next = claimTreasure(run, item);
    expect(next.pack.items).toHaveLength(run.pack.items.length + 1);
    expect(next.pack.items[next.pack.items.length - 1]).toEqual(item);
  });

  it('advances currentNodeId to the (single) successor', () => {
    const run = makeRunWithTreasureNode();
    const next = claimTreasure(run, makeItem());
    expect(next.currentNodeId).toBe('t-boss');
  });

  it("throws if status is not 'in_dungeon'", () => {
    const run = { ...makeRunWithTreasureNode(), status: 'camp_screen' as const };
    expect(() => claimTreasure(run, makeItem())).toThrow(
      /status must be 'in_dungeon'/,
    );
  });

  it("throws if current node is not 'treasure'", () => {
    const run = makeRunWithTreasureNode();
    const wrongRun = { ...run, currentNodeId: 't-boss' };
    expect(() => claimTreasure(wrongRun, makeItem())).toThrow(
      /not 'treasure'/,
    );
  });

  it('does not mutate the input runState', () => {
    const run = makeRunWithTreasureNode();
    const beforeNodeId = run.currentNodeId;
    const beforePackLen = run.pack.items.length;
    claimTreasure(run, makeItem());
    expect(run.currentNodeId).toBe(beforeNodeId);
    expect(run.pack.items).toHaveLength(beforePackLen);
  });
});
