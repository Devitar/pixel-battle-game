import { describe, expect, it } from 'vitest';
import { createHeroCombatant } from '@combat/combatant';
import type { CombatResult, CombatState } from '@combat/types';
import { xpForBossNode, xpForCombatNode, xpForEliteNode } from '@data/leveling';
import type { Item, SlotIndex, Unlocks } from '@data/types';
import { DUNGEONS } from '@data/dungeons';
import type { Encounter, Node } from '@dungeon/node';
import { createHero, type Hero } from '@heroes/hero';
import { createRng } from '@util/rng';
import {
  applyTravelTick,
  cashout,
  chooseCampNodeEffect,
  chooseNextNode,
  claimTreasure,
  completeCombat,
  completeSurpriseCombat,
  currentNode,
  leaveShop,
  loseHero,
  nextNodeChoices,
  nodeRewardGold,
  playerPath,
  pressOn,
  purchaseItem,
  startRun,
  surpriseRewardGold,
} from '../run_state';
import { applyPendingMilestones } from '../milestones';
import type { SaveFile } from '@save/save';

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
 * Walks the run from the current node to (but not entering) the boss, picking
 * a handleable branch at forks. Post-Phase-3-click-to-advance, every node-clear
 * function (completeCombat, leaveShop, claimTreasure, chooseCampNodeEffect)
 * sets awaitingFork=true; the helper translates that into chooseNextNode calls.
 */
function advanceToBossNode(rsArg: ReturnType<typeof startRun>): ReturnType<typeof startRun> {
  let rs = rsArg;
  while (true) {
    if (rs.awaitingFork) {
      const node = currentNode(rs);
      const choices = nextNodeChoices(rs);
      // Prefer handleable branches the rest of the loop body knows how to
      // process; combat/elite/shop/camp/treasure/event are all handled below.
      const branch =
        choices.find((n) => n.type === 'combat') ??
        choices.find((n) => n.type === 'elite') ??
        choices.find((n) => n.type === 'shop') ??
        choices.find((n) => n.type === 'camp') ??
        choices.find((n) => n.type === 'treasure') ??
        choices.find((n) => n.type === 'event') ??
        choices[0];
      rs = chooseNextNode(rs, branch.id);
      // Suppress unused-var warning by referencing node; prevents lint regression
      // in case future edits move the picker code around.
      void node;
      continue;
    }
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
    if (node.type === 'treasure') {
      // Skip treasure — for tests that only need to reach boss; no item claimed.
      // (claimTreasure requires an Item parameter; advanceToBossNode is used by
      // tests that don't care about treasure rooms, so just pick its successor.)
      rs = chooseNextNode(rs, node.nextNodeIds[0]);
      continue;
    }
    if (node.type === 'event') {
      rs = chooseNextNode(rs, node.nextNodeIds[0]);
      continue;
    }
    // node.type is 'combat' or 'elite' — both go through completeCombat
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
  }
}

/**
 * Walks the run until the current node has ≥2 outgoing edges AND awaitingFork
 * is set (a real player-facing fork choice). Returns the runState at that point.
 * Throws if no fork is reached before boss.
 *
 * Post-Phase-3-click-to-advance: every completeCombat sets awaitingFork=true,
 * so this helper has to distinguish "single-fanout pause" (walk through) from
 * "real fork" (return).
 */
function advanceToFork(rsArg: ReturnType<typeof startRun>): ReturnType<typeof startRun> {
  let rs = rsArg;
  while (true) {
    if (rs.awaitingFork) {
      const node = currentNode(rs);
      if (node.nextNodeIds.length >= 2) return rs;
      // Single-fanout pause: advance through the only choice and continue.
      rs = chooseNextNode(rs, node.nextNodeIds[0]);
      continue;
    }
    const node = currentNode(rs);
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
 * Post-Phase-3-click-to-advance, every node-clear function sets awaitingFork=true;
 * the helper picks the shop-preferred branch when at a fork or the only
 * available branch otherwise.
 */
function navigateToShop(rsArg: ReturnType<typeof startRun>): ReturnType<typeof startRun> {
  let rs = rsArg;
  while (true) {
    if (rs.awaitingFork) {
      const choices = nextNodeChoices(rs);
      const branch =
        choices.find((n) => n.type === 'shop') ??
        choices.find((n) => n.type === 'combat') ??
        choices.find((n) => n.type === 'elite') ??
        choices.find((n) => n.type === 'camp') ??
        choices[0];
      rs = chooseNextNode(rs, branch.id);
      continue;
    }
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
  it('does NOT auto-advance; sets awaitingFork=true so the player must click the next node', () => {
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
    const startNodeIdBefore = rs.currentNodeId;
    const result = mockCombatResult(rs.party, [18, 10, 12], 'player_victory');
    const { runState: rs2, wipe } = completeCombat(rs, result, createRng(99));
    expect(wipe).toBeUndefined();
    expect(rs2.currentNodeId).toBe(startNodeIdBefore);
    expect(rs2.awaitingFork).toBe(true);
    expect(rs2.status).toBe('in_dungeon');
    expect(rs2.traversedNodeIds).toEqual(rs.traversedNodeIds);
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

  it('crossing to level 5 pushes l5 onto pendingPerks', () => {
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
      expect(hero.pendingPerks).toEqual(['l5']);
    }
  });
});

describe('completeCombat — loot drop', () => {
  it('drops items into the pack on victory', () => {
    // Phase 5 dropped combat-loot rate from 50% to 10%, so attempts bumped
    // from 30 to 100 to keep this test reliable (P(no drop in 100 @ 10%) ≈ 0.003%).
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    let foundItem = false;
    for (let attempt = 0; attempt < 100 && !foundItem; attempt++) {
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
      // Each clear sets awaitingFork=true; chooseNextNode advances.
      while (rs.status === 'in_dungeon' && currentNode(rs).type === 'shop') {
        rs = leaveShop(rs);
        const cur = currentNode(rs);
        rs = chooseNextNode(rs, cur.nextNodeIds[0]);
      }
      while (rs.status === 'in_dungeon' && currentNode(rs).type === 'camp') {
        rs = chooseCampNodeEffect(rs, { kind: 'heal_party' }, createRng(99)).runState;
        const cur = currentNode(rs);
        rs = chooseNextNode(rs, cur.nextNodeIds[0]);
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

describe('traversedNodeIds (cartographer log)', () => {
  it('startRun initializes to [startNodeId]', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.traversedNodeIds).toEqual([rs.currentNodeId]);
  });

  it('completeCombat single-fanout victory appends the new currentNodeId', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const initial = rs.traversedNodeIds;
    const after = completeCombat(
      rs,
      mockCombatResult(rs.party, [20, 14, 15], 'player_victory'),
      createRng(99),
    ).runState;
    if (after.awaitingFork) {
      // Row-0 → row-1 fanout depends on the seed; if it's a fork source, the
      // append is skipped (covered by the next test).
      expect(after.traversedNodeIds).toEqual(initial);
    } else {
      expect(after.traversedNodeIds).toEqual([...initial, after.currentNodeId]);
    }
  });

  it('completeCombat at fork source does NOT append (currentNodeId unchanged)', () => {
    const rs = advanceToFork(startRun('crypt', makeParty(), 1, createRng(1)));
    expect(rs.awaitingFork).toBe(true);
    expect(rs.traversedNodeIds[rs.traversedNodeIds.length - 1]).toBe(rs.currentNodeId);
  });

  it('chooseNextNode appends the picked branch id', () => {
    const rs = advanceToFork(startRun('crypt', makeParty(), 1, createRng(1)));
    const fork = currentNode(rs);
    const picked = fork.nextNodeIds[1];
    const after = chooseNextNode(rs, picked);
    expect(after.traversedNodeIds).toEqual([...rs.traversedNodeIds, picked]);
  });

  it('completeCombat on boss does NOT append (currentNodeId unchanged on victory)', () => {
    const rs = advanceToBossNode(startRun('crypt', makeParty(), 1, createRng(1)));
    const before = rs.traversedNodeIds;
    const after = completeCombat(
      rs,
      mockCombatResult(rs.party, [20, 14, 15], 'player_victory'),
      createRng(99),
    ).runState;
    expect(after.status).toBe('camp_screen');
    expect(after.traversedNodeIds).toEqual(before);
  });

  it('pressOn resets traversedNodeIds to the new floor start', () => {
    let rs = advanceToBossNode(startRun('crypt', makeParty(), 1, createRng(1)));
    rs = completeCombat(
      rs,
      mockCombatResult(rs.party, [20, 14, 15], 'player_victory'),
      createRng(99),
    ).runState;
    expect(rs.status).toBe('camp_screen');
    const next = pressOn(rs, createRng(2));
    expect(next.traversedNodeIds).toEqual([next.currentNodeId]);
    expect(next.traversedNodeIds).toHaveLength(1);
  });

  it('current node is always the last entry in traversedNodeIds (between forks)', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.traversedNodeIds[rs.traversedNodeIds.length - 1]).toBe(rs.currentNodeId);
    for (let i = 0; i < 3; i++) {
      const node = currentNode(rs);
      if (node.type === 'boss') break;
      rs = completeCombat(
        rs,
        mockCombatResult(rs.party, [20, 14, 15], 'player_victory'),
        createRng(99),
      ).runState;
      if (rs.status !== 'in_dungeon') break;
      expect(rs.traversedNodeIds[rs.traversedNodeIds.length - 1]).toBe(rs.currentNodeId);
      if (rs.awaitingFork) break;
    }
  });
});

describe('applyTravelTick', () => {
  function makePartyWithStates(states: { hp: number; maxHp: number; wounded: boolean }[]): Hero[] {
    return states.map((s, i) => {
      const hero = createHero('knight', `H${i}`, `h${i}`, 'quick', 'body1');
      return {
        ...hero,
        currentHp: s.hp,
        maxHp: s.maxHp,
        wounds: s.wounded ? [{ id: 'bruised' as const, runsRemaining: 5 }] : [],
      };
    });
  }

  function makeRunWithParty(party: Hero[]): ReturnType<typeof startRun> {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    return { ...rs, party };
  }

  it('unwounded hero at half HP gains +1 (heal)', () => {
    const party = makePartyWithStates([{ hp: 10, maxHp: 20, wounded: false }]);
    const rs = makeRunWithParty(party);
    const { runState, deltas } = applyTravelTick(rs);
    expect(runState.party[0].currentHp).toBe(11);
    expect(deltas).toEqual([1]);
  });

  it('unwounded hero at maxHp stays at maxHp (capped, delta=0)', () => {
    const party = makePartyWithStates([{ hp: 20, maxHp: 20, wounded: false }]);
    const rs = makeRunWithParty(party);
    const { runState, deltas } = applyTravelTick(rs);
    expect(runState.party[0].currentHp).toBe(20);
    expect(deltas).toEqual([0]);
  });

  it('wounded hero at half HP takes -1 (damage)', () => {
    const party = makePartyWithStates([{ hp: 10, maxHp: 20, wounded: true }]);
    const rs = makeRunWithParty(party);
    const { runState, deltas } = applyTravelTick(rs);
    expect(runState.party[0].currentHp).toBe(9);
    expect(deltas).toEqual([-1]);
  });

  it('wounded hero at 1 HP stays at 1 (floored — travel cannot kill)', () => {
    const party = makePartyWithStates([{ hp: 1, maxHp: 20, wounded: true }]);
    const rs = makeRunWithParty(party);
    const { runState, deltas } = applyTravelTick(rs);
    expect(runState.party[0].currentHp).toBe(1);
    expect(deltas).toEqual([0]);
  });

  it('multiple wounds still result in -1 (per-hero binary, not per-wound)', () => {
    const party = makePartyWithStates([{ hp: 15, maxHp: 20, wounded: true }]);
    const rs = makeRunWithParty(party);
    rs.party[0].wounds.push({ id: 'hobbled' as const, runsRemaining: 5 });
    rs.party[0].wounds.push({ id: 'concussed' as const, runsRemaining: 5 });
    const { runState, deltas } = applyTravelTick(rs);
    expect(runState.party[0].currentHp).toBe(14);
    expect(deltas).toEqual([-1]);
  });

  it('mixed 3-hero party: each evaluated independently', () => {
    const party = makePartyWithStates([
      { hp: 5,  maxHp: 20, wounded: false },
      { hp: 10, maxHp: 20, wounded: true },
      { hp: 20, maxHp: 20, wounded: false },
    ]);
    const rs = makeRunWithParty(party);
    const { runState, deltas } = applyTravelTick(rs);
    expect(runState.party[0].currentHp).toBe(6);
    expect(runState.party[1].currentHp).toBe(9);
    expect(runState.party[2].currentHp).toBe(20);
    expect(deltas).toEqual([1, -1, 0]);
  });

  it('does not mutate the input runState', () => {
    const party = makePartyWithStates([{ hp: 10, maxHp: 20, wounded: true }]);
    const rs = makeRunWithParty(party);
    const before = JSON.stringify(rs);
    applyTravelTick(rs);
    expect(JSON.stringify(rs)).toBe(before);
  });

  it('returns deltas indexed parallel to party (length matches)', () => {
    const party = makePartyWithStates([
      { hp: 5,  maxHp: 20, wounded: false },
      { hp: 10, maxHp: 20, wounded: true },
    ]);
    const rs = makeRunWithParty(party);
    const { deltas } = applyTravelTick(rs);
    expect(deltas).toHaveLength(rs.party.length);
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
  it('does NOT auto-advance; sets awaitingFork=true so the player must click the next node', () => {
    let rs = startRunWithShop();
    rs = navigateToShop(rs);
    const before = rs.currentNodeId;
    const after = leaveShop(rs);
    expect(after.currentNodeId).toBe(before);
    expect(after.awaitingFork).toBe(true);
    expect(after.traversedNodeIds).toEqual(rs.traversedNodeIds);
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
  it('heals every hero by 25% maxHp; sets awaitingFork=true (player clicks next node to advance)', () => {
    const rs0 = makeCampRun();
    const damaged: ReturnType<typeof startRun> = {
      ...rs0,
      party: rs0.party.map((h) => ({ ...h, currentHp: 1 })),
    };
    const result = chooseCampNodeEffect(damaged, { kind: 'heal_party' }, createRng(1));
    expect(result.runState.currentNodeId).toBe(damaged.currentNodeId);
    expect(result.runState.awaitingFork).toBe(true);
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
  it('removes the wound; sets awaitingFork=true (player clicks next node to advance)', () => {
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
    expect(result.runState.currentNodeId).toBe(wounded.currentNodeId);
    expect(result.runState.awaitingFork).toBe(true);
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

  it('does NOT auto-advance; sets awaitingFork=true so the player must click the next node', () => {
    const run = makeRunWithTreasureNode();
    const next = claimTreasure(run, makeItem());
    expect(next.currentNodeId).toBe(run.currentNodeId);
    expect(next.awaitingFork).toBe(true);
    expect(next.traversedNodeIds).toEqual(run.traversedNodeIds);
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

describe('surprisesThisFloor field', () => {
  it('startRun initializes surprisesThisFloor to 0', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.surprisesThisFloor).toBe(0);
  });

  it('pressOn resets surprisesThisFloor to 0 on floor advance', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Force surprisesThisFloor up via direct shape mutation (test-only).
    rs = { ...rs, surprisesThisFloor: 2 };
    rs = advanceToBossNode(rs);
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    // Now status === 'camp_screen'.
    const after = pressOn(rs, createRng(7));
    expect(after.surprisesThisFloor).toBe(0);
  });
});

describe('completeSurpriseCombat', () => {
  // Build a run state parked at a non-combat destination (e.g., a shop) — i.e.,
  // currentNodeId points at a shop node. We simulate that by walking the run
  // until we land on a non-combat node.
  function runAtNonCombatNode(): ReturnType<typeof startRun> {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    while (true) {
      const node = currentNode(rs);
      if (
        node.type === 'shop' ||
        node.type === 'camp' ||
        node.type === 'event' ||
        node.type === 'treasure'
      ) {
        return rs;
      }
      if (rs.awaitingFork) {
        const choices = nextNodeChoices(rs);
        const nonCombat = choices.find(
          (n) => n.type === 'shop' || n.type === 'camp' || n.type === 'event' || n.type === 'treasure',
        );
        rs = chooseNextNode(rs, (nonCombat ?? choices[0]).id);
        continue;
      }
      if (node.type === 'combat' || node.type === 'elite') {
        rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
        continue;
      }
      // Boss = unreachable here; abort.
      throw new Error('no non-combat node reached before boss in test setup');
    }
  }

  it('preserves currentNodeId, awaitingFork, and status on victory', () => {
    const rs = runAtNonCombatNode();
    const result = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: after } = completeSurpriseCombat(rs, result, createRng(99));
    expect(after.currentNodeId).toBe(rs.currentNodeId);
    expect(after.awaitingFork).toBe(rs.awaitingFork);
    expect(after.status).toBe('in_dungeon');
  });

  it('awards combat-node XP to surviving heroes on victory', () => {
    const rs = runAtNonCombatNode();
    const xpBeforeById = new Map(rs.party.map((h) => [h.id, h.xp]));
    const result = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: after } = completeSurpriseCombat(rs, result, createRng(99));
    for (const survivor of after.party) {
      expect(survivor.xp).toBeGreaterThan(xpBeforeById.get(survivor.id) ?? 0);
    }
  });

  it('adds reduced gold (7g per floor) on victory', () => {
    const rs = runAtNonCombatNode();
    const goldBefore = rs.pack.gold;
    const result = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: after } = completeSurpriseCombat(rs, result, createRng(99));
    // Floor 1 → 7g.
    expect(after.pack.gold - goldBefore).toBe(7);
  });

  it('returns wipe and clears party on full defeat', () => {
    const rs = runAtNonCombatNode();
    const result = mockCombatResult(rs.party, [0, 0, 0], 'player_defeat');
    const { runState: after, wipe } = completeSurpriseCombat(rs, result, createRng(99));
    expect(wipe).toBeDefined();
    expect(after.party.length).toBe(0);
    expect(after.status).toBe('ended');
    expect(wipe!.milestonesTriggered).toEqual(rs.pendingMilestones);
    expect(after.pendingMilestones).toEqual([]);
  });

  it('recovers fallen-hero gear into the pack on victory', () => {
    let rs = runAtNonCombatNode();
    // Equip a sword on hero 0 to verify recovery.
    const sword: Item = {
      id: 'tst-sword',
      baseId: 'sword_basic',
      slot: 'weapon',
      weaponType: 'sword',
      rarity: 'common',
      affixes: [],
      floorRolledAt: 1,
    };
    rs = {
      ...rs,
      party: rs.party.map((h, i) =>
        i === 0 ? { ...h, equipment: { ...h.equipment, weapon: sword } } : h,
      ),
    };
    const itemsBefore = rs.pack.items.length;
    // Hero 0 dies (0 hp).
    const result = mockCombatResult(rs.party, [0, 14, 15], 'player_victory');
    const { runState: after } = completeSurpriseCombat(rs, result, createRng(99));
    expect(after.pack.items.length).toBeGreaterThan(itemsBefore);
    expect(after.pack.items.some((i) => i.id === 'tst-sword')).toBe(true);
  });
});

function makePartyWithHunter(): Hero[] {
  return [
    createHero('knight', 'K', 'h0', 'quick', 'body1'),
    createHero('archer', 'A', 'h1', 'quick', 'body1'),
    createHero('hunter', 'R', 'h_hunter', 'quick', 'body1', undefined, undefined, 'wolf'),
  ];
}

function mockCombatResultWithPet(
  party: readonly Hero[],
  hunterId: string,
  petIsDead: boolean,
  outcome: CombatResult['outcome'],
): CombatResult {
  const combatants = party.map((hero, i) =>
    createHeroCombatant(hero.classId, (i + 1) as SlotIndex, `p${i}`, {
      baseStats: hero.baseStats,
      currentHp: hero.currentHp,
      maxHp: hero.maxHp,
      isDead: false,
    }),
  );
  combatants.push({
    id: `pet_${hunterId}`,
    side: 'player',
    slot: 4,
    kind: 'pet',
    ownerHeroId: hunterId,
    petSpeciesId: 'wolf',
    baseStats: { hp: 14, attack: 6, defense: 2, speed: 5, mind: 0, crit: 10, dodge: 10 },
    currentHp: petIsDead ? 0 : 14,
    maxHp: 14,
    statuses: {},
    cooldowns: {},
    abilities: ['wolf_bite', 'wolf_howl'],
    aiPriority: ['wolf_howl', 'wolf_bite'],
    preferredSlots: [4],
    tags: ['beast'],
    pickedPerks: [],
    equippedLegendaryIds: [],
    equippedLegendaryPassiveIds: [],
    isDead: petIsDead,
  });
  const state: CombatState = { combatants, round: 1, exhaustionLevel: 0 };
  return { finalState: state, events: [], outcome };
}

describe('petsDownByHeroId — post-combat bookkeeping', () => {
  it('completeCombat appends ownerHeroId when pet is dead in finalState', () => {
    const party = makePartyWithHunter();
    const seed = 1;
    let rs = startRun('crypt', party, seed, createRng(seed));
    rs = advanceToBossNode(rs);
    const result = mockCombatResultWithPet(party, 'h_hunter', true, 'player_victory');
    const { runState: after } = completeCombat(rs, result, createRng(2));
    expect(after.petsDownByHeroId).toContain('h_hunter');
  });

  it('does not duplicate when ownerHeroId already in petsDownByHeroId', () => {
    const party = makePartyWithHunter();
    const seed = 1;
    let rs = startRun('crypt', party, seed, createRng(seed));
    rs = advanceToBossNode(rs);
    rs = { ...rs, petsDownByHeroId: ['h_hunter'] };
    const result = mockCombatResultWithPet(party, 'h_hunter', true, 'player_victory');
    const { runState: after } = completeCombat(rs, result, createRng(2));
    expect(after.petsDownByHeroId.filter((id) => id === 'h_hunter')).toHaveLength(1);
  });

  it('does not append when pet is alive in finalState', () => {
    const party = makePartyWithHunter();
    const seed = 1;
    let rs = startRun('crypt', party, seed, createRng(seed));
    rs = advanceToBossNode(rs);
    const result = mockCombatResultWithPet(party, 'h_hunter', false, 'player_victory');
    const { runState: after } = completeCombat(rs, result, createRng(2));
    expect(after.petsDownByHeroId).not.toContain('h_hunter');
  });
});

describe('completeCombat — pendingMilestones populate', () => {
  it('canonical-final-boss defeat populates pendingMilestones with first_crypt_clear', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);
    while (rs.currentFloorNumber < DUNGEONS.crypt.floorsPerRun) {
      rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
      expect(rs.status).toBe('camp_screen');
      rs = pressOn(rs, createRng(99));
      rs = advanceToBossNode(rs);
    }
    const after = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(after.status).toBe('camp_screen');
    expect(after.pendingMilestones).toEqual(['first_crypt_clear']);  // spec 2: real handler
  });

  it('non-canonical (floor 1) boss defeat in a 3-floor dungeon does NOT credit', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);
    expect(rs.currentFloorNumber).toBe(1);
    const after = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(after.pendingMilestones).toEqual([]);
  });

  it('post-canonical (floor 4+) boss defeat does NOT credit', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    for (let f = 1; f <= DUNGEONS.crypt.floorsPerRun; f++) {
      rs = advanceToBossNode(rs);
      rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
      rs = pressOn(rs, createRng(99));
    }
    expect(rs.currentFloorNumber).toBe(DUNGEONS.crypt.floorsPerRun + 1);
    rs = advanceToBossNode(rs);
    const after = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    // pendingMilestones already contains 'first_crypt_clear' from the canonical floor-3 kill.
    // The floor-4 kill must NOT add another entry (it's not canonical).
    expect(after.pendingMilestones).toEqual(['first_crypt_clear']);  // unchanged from before the floor-4 kill
  });
});

describe('cashout — pendingMilestones drain', () => {
  it('returns outcome.milestonesTriggered and zeros runState.pendingMilestones', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    while (rs.currentFloorNumber < DUNGEONS.crypt.floorsPerRun) {
      rs = advanceToBossNode(rs);
      rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
      rs = pressOn(rs, createRng(99));
    }
    rs = advanceToBossNode(rs);
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.status).toBe('camp_screen');

    const { runState: ended, outcome } = cashout(rs);
    expect(outcome.milestonesTriggered).toEqual(rs.pendingMilestones);
    expect(ended.pendingMilestones).toEqual([]);
    expect(ended.status).toBe('ended');
  });
});

describe('completeCombat wipe path — pendingMilestones drain', () => {
  it('wipe outcome includes milestonesTriggered and zeros runState.pendingMilestones', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    if (rs.awaitingFork) rs = chooseNextNode(rs, currentNode(rs).nextNodeIds[0]);
    const wipeResult = mockCombatResult(rs.party, [0, 0, 0], 'player_defeat');
    const { runState: ended, wipe } = completeCombat(rs, wipeResult, createRng(99));
    expect(wipe).toBeDefined();
    expect(wipe!.milestonesTriggered).toEqual(rs.pendingMilestones);
    expect(ended.pendingMilestones).toEqual([]);
    expect(ended.status).toBe('ended');
  });
});

describe('pressOn — pendingMilestones persists across floor advance', () => {
  it('pressOn carries pendingMilestones forward unchanged', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.status).toBe('camp_screen');
    const before = rs.pendingMilestones;
    const after = pressOn(rs, createRng(99));
    expect(after.pendingMilestones).toEqual(before);
  });
});

describe('L10 milestone end-to-end flow', () => {
  // Sentinel Unlocks fixtures threaded through completeCombat. The real
  // production caller (corridor_scene) passes `appState.get().unlocks`; tests
  // build minimal fixtures here so we can flip `legendaryEnabled` independently.
  const UNLOCKS_PRE: Unlocks = {
    classes: [],
    dungeons: ['crypt'],
    buildings: [],
    legendaryEnabled: false,
  };
  const UNLOCKS_POST: Unlocks = {
    classes: [],
    dungeons: ['crypt'],
    buildings: [],
    legendaryEnabled: true,
  };

  it('completing a boss combat that crosses a hero to L10 pushes first_hero_l10 onto pendingMilestones', () => {
    // Walk to the floor-1 boss node, then inject XP=19999 (L9) into the party
    // so the next XP grant — xpForBossNode(1) = 30 — crosses every hero to L10.
    // legendaryEnabled=false so detectXpMilestones evaluates the level-crossing.
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);
    rs = {
      ...rs,
      party: rs.party.map((h) => ({ ...h, xp: 19999, level: 9 })),
    };
    expect(xpForBossNode(rs.currentFloorNumber)).toBeGreaterThan(0);

    const bossResult = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: after } = completeCombat(rs, bossResult, createRng(99), UNLOCKS_PRE);

    expect(after.party[0].level).toBeGreaterThanOrEqual(10);
    expect(after.pendingMilestones).toContain('first_hero_l10');
  });

  it('post-milestone boss kill drops a named legendary (one of the bone_lich pool)', () => {
    // Walk to the floor-1 boss node (bone_lich). With legendaryEnabled=true,
    // rollLoot's boss-drop substitution swaps the normal drop for a named
    // legendary from BOSS_LEGENDARIES.bone_lich = ['lichs_crown', 'phylactery'].
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);

    // Sanity: we're at a boss node. The Crypt dungeon's bossId is bone_lich,
    // which is what completeCombat reads (via DUNGEONS[dungeonId].bossId) to
    // pass into rollLoot's BOSS_LEGENDARIES lookup.
    expect(currentNode(rs).type).toBe('boss');
    expect(DUNGEONS.crypt.bossId).toBe('bone_lich');

    const preItemCount = rs.pack.items.length;
    const bossResult = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: after } = completeCombat(rs, bossResult, createRng(99), UNLOCKS_POST);

    // Boss drops are guaranteed; pack item count must increase by exactly one.
    expect(after.pack.items.length).toBe(preItemCount + 1);
    const drop = after.pack.items[after.pack.items.length - 1];
    expect(drop.rarity).toBe('legendary');
    expect(drop.legendaryId).toBeDefined();
    expect(['lichs_crown', 'phylactery']).toContain(drop.legendaryId);
  });

  it('pre-milestone boss kill drops normal loot (no legendaryId)', () => {
    // Same setup but legendaryEnabled=false: rollLoot's boss-drop substitution
    // is skipped, so the drop goes through the normal rarity-table path. The
    // resulting Item must have no `legendaryId` field.
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);

    const preItemCount = rs.pack.items.length;
    const bossResult = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: after } = completeCombat(rs, bossResult, createRng(99), UNLOCKS_PRE);

    expect(after.pack.items.length).toBe(preItemCount + 1);
    const drop = after.pack.items[after.pack.items.length - 1];
    expect(drop.legendaryId).toBeUndefined();
    expect(drop.rarity).not.toBe('legendary');
  });
});

describe('end-to-end — Crypt clear unlocks Sunken Keep', () => {
  it('full canonical Crypt run: cashout SaveFile gets sunken_keep unlocked', () => {
    // Walk a Crypt run to floor 3, defeat the boss, cash out, apply milestones.
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    while (rs.currentFloorNumber < DUNGEONS.crypt.floorsPerRun) {
      rs = advanceToBossNode(rs);
      rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
      rs = pressOn(rs, createRng(99));
    }
    rs = advanceToBossNode(rs);
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    expect(rs.status).toBe('camp_screen');
    expect(rs.pendingMilestones).toEqual(['first_crypt_clear']);

    // Cashout
    const { runState: ended, outcome } = cashout(rs);
    expect(outcome.milestonesTriggered).toEqual(['first_crypt_clear']);
    expect(ended.pendingMilestones).toEqual([]);

    // Apply to a SaveFile fixture (only the unlocks slice matters here)
    const before = { unlocks: { classes: [], dungeons: ['crypt'] } } as unknown as SaveFile;
    const after = applyPendingMilestones(before, outcome.milestonesTriggered);
    expect(after.unlocks.dungeons).toContain('sunken_keep');
    expect(after.unlocks.classes).toContain('paladin');
  });
});

describe('nodeRewardGold', () => {
  it('combat node: 15 × floor × tier-multiplier', () => {
    expect(nodeRewardGold('combat', 1, 1)).toBe(15);
    expect(nodeRewardGold('combat', 3, 1)).toBe(45);
  });

  it('elite node: 30 × floor × tier-multiplier (regression for under-reported elite gold)', () => {
    // Pre-fix bug: corridor_scene used the combat formula (15×) for elite nodes,
    // under-reporting by half against the value completeCombat actually credits.
    expect(nodeRewardGold('elite', 1, 1)).toBe(30);
    expect(nodeRewardGold('elite', 3, 1)).toBe(90);
  });

  it('boss node: 100 × floor × tier-multiplier', () => {
    expect(nodeRewardGold('boss', 1, 1)).toBe(100);
    expect(nodeRewardGold('boss', 3, 1)).toBe(300);
  });

  it('applies the tier-2 ×1.5 gold multiplier', () => {
    expect(nodeRewardGold('combat', 1, 2)).toBe(23);  // round(15 × 1 × 1.5) = 22.5 → 23
    expect(nodeRewardGold('elite', 1, 2)).toBe(45);   // 30 × 1 × 1.5
    expect(nodeRewardGold('boss', 5, 2)).toBe(750);   // 100 × 5 × 1.5
  });
});

describe('surpriseRewardGold', () => {
  it('7 × floor × tier-multiplier', () => {
    expect(surpriseRewardGold(1, 1)).toBe(7);
    expect(surpriseRewardGold(3, 1)).toBe(21);
    expect(surpriseRewardGold(2, 2)).toBe(21);  // round(7 × 2 × 1.5) = 21
  });
});

describe('completeCombat — credit matches nodeRewardGold for elite nodes', () => {
  // Sanity check: the value completeCombat banks for an elite kill should equal
  // what nodeRewardGold reports — historically these had drifted (display showed
  // combat formula while credit used elite formula).
  it('elite combat victory credits nodeRewardGold("elite", floor, tier)', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Find an elite node on floor 1.
    const eliteNode = rs.currentFloorNodes.find((n): n is Extract<Node, { type: 'elite' }> => n.type === 'elite');
    if (!eliteNode) {
      // Some seeds may not place an elite on floor 1; bail out cleanly.
      return;
    }
    // Manually traverse to the elite node by overwriting currentNodeId. The path
    // logic isn't under test here; we just need an in_dungeon state at an elite.
    rs = { ...rs, currentNodeId: eliteNode.id };
    const tier = DUNGEONS[rs.dungeonId].tier;
    const expectedReward = nodeRewardGold('elite', rs.currentFloorNumber, tier);
    const goldBefore = rs.pack.gold;
    const { runState: after } = completeCombat(
      rs,
      mockCombatResult(rs.party, [20, 14, 15], 'player_victory'),
      createRng(99),
    );
    expect(after.pack.gold - goldBefore).toBe(expectedReward);
  });
});

describe('petsDownByHeroId — initialization', () => {
  it('startRun seeds petsDownByHeroId to []', () => {
    const party = makeParty();  // existing helper in this test file
    const seed = 1;
    const rs = startRun('crypt', party, seed, createRng(seed));
    expect(rs.petsDownByHeroId).toEqual([]);
  });
});

describe('traineeXpBase accumulator', () => {
  // Run parked at a non-combat destination so completeSurpriseCombat is valid.
  // Mirrors the helper in the completeSurpriseCombat describe block.
  function runAtNonCombatNode(): ReturnType<typeof startRun> {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    while (true) {
      const node = currentNode(rs);
      if (
        node.type === 'shop' ||
        node.type === 'camp' ||
        node.type === 'event' ||
        node.type === 'treasure'
      ) {
        return rs;
      }
      if (rs.awaitingFork) {
        const choices = nextNodeChoices(rs);
        const nonCombat = choices.find(
          (n) => n.type === 'shop' || n.type === 'camp' || n.type === 'event' || n.type === 'treasure',
        );
        rs = chooseNextNode(rs, (nonCombat ?? choices[0]).id);
        continue;
      }
      if (node.type === 'combat' || node.type === 'elite') {
        rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
        continue;
      }
      throw new Error('no non-combat node reached before boss in test setup');
    }
  }

  it('startRun initializes traineeXpBase to 0', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.traineeXpBase).toBe(0);
  });

  it('completeCombat victory at a combat node increments by xpForCombatNode(floor)', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Start node is row-0 combat. xpForCombatNode(1) = 5.
    expect(currentNode(rs).type).toBe('combat');
    const result = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const before = rs.traineeXpBase;
    const { runState: next } = completeCombat(rs, result, createRng(99));
    expect(next.traineeXpBase).toBe(before + xpForCombatNode(rs.currentFloorNumber));
  });

  it('completeCombat victory at an elite node increments by xpForEliteNode(floor)', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Find an elite node on floor 1.
    const eliteNode = rs.currentFloorNodes.find((n): n is Extract<Node, { type: 'elite' }> => n.type === 'elite');
    if (!eliteNode) {
      // Skip if seed didn't place an elite on floor 1.
      return;
    }
    // Mirror the same pattern used in the elite-gold test above: jump straight
    // to the elite by overwriting currentNodeId; we're testing accumulator math,
    // not traversal.
    rs = { ...rs, currentNodeId: eliteNode.id };
    const before = rs.traineeXpBase;
    const result = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: next } = completeCombat(rs, result, createRng(99));
    expect(next.traineeXpBase).toBe(before + xpForEliteNode(rs.currentFloorNumber));
  });

  it('completeCombat victory at a boss node increments by xpForBossNode(floor)', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);
    expect(currentNode(rs).type).toBe('boss');
    const before = rs.traineeXpBase;
    const result = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: next } = completeCombat(rs, result, createRng(99));
    expect(next.traineeXpBase).toBe(before + xpForBossNode(rs.currentFloorNumber));
  });

  it('completeSurpriseCombat victory increments by xpForCombatNode(floor)', () => {
    const rs = runAtNonCombatNode();
    const before = rs.traineeXpBase;
    const result = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: next } = completeSurpriseCombat(rs, result, createRng(99));
    expect(next.traineeXpBase).toBe(before + xpForCombatNode(rs.currentFloorNumber));
  });

  it('player_defeat at completeCombat carries traineeXpBase into the WipeOutcome (no increment)', () => {
    const rs0 = startRun('crypt', makeParty(), 1, createRng(1));
    const rs = { ...rs0, traineeXpBase: 50 };
    const result = mockCombatResult(rs.party, [0, 0, 0], 'player_defeat');
    const { wipe } = completeCombat(rs, result, createRng(99));
    expect(wipe).toBeDefined();
    expect(wipe!.traineeXpBase).toBe(50);
  });

  it('player_defeat at completeSurpriseCombat carries traineeXpBase into the WipeOutcome (no increment)', () => {
    const rs0 = runAtNonCombatNode();
    const rs = { ...rs0, traineeXpBase: 75 };
    const result = mockCombatResult(rs.party, [0, 0, 0], 'player_defeat');
    const { wipe } = completeSurpriseCombat(rs, result, createRng(99));
    expect(wipe).toBeDefined();
    expect(wipe!.traineeXpBase).toBe(75);
  });

  it('pressOn preserves traineeXpBase across floor advancement', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = advanceToBossNode(rs);
    rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    // Inject a known value before pressOn so the assertion isn't sensitive to
    // the boss-XP accumulation that just happened.
    const tagged = { ...rs, traineeXpBase: 120 };
    const next = pressOn(tagged, createRng(99));
    expect(next.traineeXpBase).toBe(120);
  });
});
