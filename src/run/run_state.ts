import type { DungeonId, Item, Wound } from '@data/types';
import { applyLevelUps, levelForXp, xpForBossNode, xpForCombatNode, xpForEliteNode } from '@data/leveling';
import { DEFAULT_WOUND_RUNS_REMAINING } from '@data/wounds';
import { applyCampNodeEffect, type CampNodeChoice } from '@dungeon/camp_node';
import { generateFloor } from '@dungeon/floor';
import { rollLoot, type CombatKind } from '@dungeon/loot';
import type { Node } from '@dungeon/node';
import type { CombatEvent, CombatResult } from '@combat/types';
import type { Hero } from '@heroes/hero';
import type { Rng } from '@util/rng';
import { addGold, addItem, createPack, spendGold, type Pack, totalGold } from './pack';

export type RunStatus = 'in_dungeon' | 'camp_screen' | 'ended';

export interface RunState {
  readonly dungeonId: DungeonId;
  readonly seed: number;
  readonly party: readonly Hero[];
  readonly pack: Pack;
  readonly currentFloorNumber: number;
  readonly currentFloorNodes: readonly Node[];
  readonly currentNodeId: string;
  readonly awaitingFork: boolean;
  readonly status: RunStatus;
  readonly fallen: readonly Hero[];
  readonly lost: readonly Hero[];
}

export interface CashoutOutcome {
  goldBanked: number;
  itemsBanked: readonly Item[];
  heroesReturned: readonly Hero[];
  heroesFallen: readonly Hero[];   // died in combat this run
  heroesLost: readonly Hero[];     // narratively Lost via event/hazard during this run
}

export interface WipeOutcome {
  packLost: Pack;
  heroesFallen: readonly Hero[];   // died in combat (including the wiping fight)
  heroesLost: readonly Hero[];     // narratively Lost prior to the wipe
}

const PARTY_SIZE = 3;
const COMBAT_NODE_GOLD = 15;
const ELITE_NODE_GOLD = 30;
const BOSS_NODE_GOLD = 100;

export function startRun(
  dungeonId: DungeonId,
  party: readonly Hero[],
  seed: number,
  rng: Rng,
): RunState {
  if (party.length !== PARTY_SIZE) {
    throw new Error(`startRun: party must have ${PARTY_SIZE} heroes, got ${party.length}`);
  }
  const { nodes, startNodeId } = generateFloor(dungeonId, 1, rng);
  return {
    dungeonId,
    seed,
    party: [...party],
    pack: createPack(),
    currentFloorNumber: 1,
    currentFloorNodes: nodes,
    currentNodeId: startNodeId,
    awaitingFork: false,
    status: 'in_dungeon',
    fallen: [],
    lost: [],
  };
}

export function currentNode(runState: RunState): Node {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`currentNode: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const node = runState.currentFloorNodes.find((n) => n.id === runState.currentNodeId);
  if (!node) {
    throw new Error(`currentNode: id '${runState.currentNodeId}' not in current floor`);
  }
  return node;
}

export function nextNodeChoices(runState: RunState): readonly Node[] {
  const cur = currentNode(runState);
  return cur.nextNodeIds.map((id) => {
    const n = runState.currentFloorNodes.find((x) => x.id === id);
    if (!n) {
      throw new Error(`nextNodeChoices: id '${id}' not in current floor`);
    }
    return n;
  });
}

export function chooseNextNode(runState: RunState, nextNodeId: string): RunState {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`chooseNextNode: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const cur = currentNode(runState);
  if (!cur.nextNodeIds.includes(nextNodeId)) {
    throw new Error(
      `chooseNextNode: '${nextNodeId}' is not a valid next node from '${cur.id}'`,
    );
  }
  return {
    ...runState,
    currentNodeId: nextNodeId,
    awaitingFork: false,
  };
}

export function chooseCampNodeEffect(
  runState: RunState,
  choice: CampNodeChoice,
  rng: Rng,
): { runState: RunState; outcome?: CashoutOutcome } {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`chooseCampNodeEffect: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const cur = currentNode(runState);
  if (cur.type !== 'camp') {
    throw new Error(`chooseCampNodeEffect: current node is type '${cur.type}', not 'camp'`);
  }
  if (choice.kind === 'leave') {
    return cashout(runState);
  }
  const newRunState = applyCampNodeEffect(runState, choice, rng);
  return {
    runState: {
      ...newRunState,
      currentNodeId: cur.nextNodeIds[0],
    },
  };
}

export function loseHero(runState: RunState, heroIndex: number): RunState {
  if (heroIndex < 0 || heroIndex >= runState.party.length) {
    throw new Error(`loseHero: index ${heroIndex} out of range [0, ${runState.party.length})`);
  }
  const hero = runState.party[heroIndex];
  // Per gdd §8 — gear is gone with the Lost hero (NOT transferred to pack like Fallen).
  // The hero record retains its equipment fields, but since the hero is moved to `lost`
  // (not `party`), the gear is unreachable in gameplay. The behavioral distinction from
  // Fallen is that completeCombat's pack-transfer loop is never invoked on this hero.
  return {
    ...runState,
    party: runState.party.filter((_, i) => i !== heroIndex),
    lost: [...runState.lost, hero],
  };
}

export function completeCombat(
  runState: RunState,
  result: CombatResult,
  rng: Rng,
): { runState: RunState; wipe?: WipeOutcome } {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`completeCombat: status must be 'in_dungeon', got '${runState.status}'`);
  }

  const updatedPartyLiving: Hero[] = [];
  const newFallen: Hero[] = [];
  for (let i = 0; i < runState.party.length; i++) {
    const original = runState.party[i];
    const combatant = result.finalState.combatants.find((c) => c.id === `p${i}`);
    if (!combatant) {
      updatedPartyLiving.push(original);
      continue;
    }
    const newWounds = woundsFromEvents(result.events, `p${i}`);
    const updated: Hero = {
      ...original,
      currentHp: Math.max(0, combatant.currentHp),
      wounds: newWounds.length > 0 ? [...original.wounds, ...newWounds] : original.wounds,
    };
    if (combatant.isDead) {
      newFallen.push(updated);
    } else {
      updatedPartyLiving.push(updated);
    }
  }

  if (result.outcome === 'player_defeat') {
    const allLost: Hero[] = [
      ...runState.fallen,
      ...newFallen,
      ...updatedPartyLiving,
    ];
    const wipe: WipeOutcome = {
      packLost: runState.pack,
      heroesFallen: allLost,
      heroesLost: runState.lost,
    };
    return {
      runState: {
        ...runState,
        party: [],
        fallen: allLost,
        pack: createPack(),
        status: 'ended',
      },
      wipe,
    };
  }

  const completedNode = currentNode(runState);
  if (
    completedNode.type === 'shop' ||
    completedNode.type === 'camp' ||
    completedNode.type === 'event'
  ) {
    throw new Error(`completeCombat: current node is type '${completedNode.type}', not a combat-bearing node`);
  }
  const kind: CombatKind = completedNode.type;
  const isBoss = kind === 'boss';
  const fanout = completedNode.nextNodeIds;

  // XP awards — only on victory, only to surviving heroes.
  const xpReward =
    kind === 'boss'  ? xpForBossNode(runState.currentFloorNumber) :
    kind === 'elite' ? xpForEliteNode(runState.currentFloorNumber) :
                       xpForCombatNode(runState.currentFloorNumber);
  const partyAfterXp = updatedPartyLiving.map((hero) => {
    const newXp = hero.xp + xpReward;
    const newLevel = levelForXp(newXp);
    return applyLevelUps({ ...hero, xp: newXp }, hero.level, newLevel);
  });

  const reward =
    kind === 'boss'  ? BOSS_NODE_GOLD  * runState.currentFloorNumber :
    kind === 'elite' ? ELITE_NODE_GOLD * runState.currentFloorNumber :
                       COMBAT_NODE_GOLD * runState.currentFloorNumber;
  let newPack = addGold(runState.pack, reward);

  const drop = rollLoot(rng, runState.currentFloorNumber, kind);
  if (drop) {
    newPack = addItem(newPack, drop);
  }

  for (const fallen of newFallen) {
    const eq = fallen.equipment;
    const items: Item[] = [eq.weapon, eq.shield, eq.outfit, eq.hat].filter(
      (i): i is Item => i !== undefined,
    );
    for (const item of items) {
      newPack = addItem(newPack, item);
    }
  }

  if (isBoss) {
    return {
      runState: {
        ...runState,
        party: partyAfterXp,
        fallen: [...runState.fallen, ...newFallen],
        pack: newPack,
        status: 'camp_screen',
      },
    };
  }

  // Non-boss victory — advance based on fanout.
  if (fanout.length === 1) {
    return {
      runState: {
        ...runState,
        party: partyAfterXp,
        fallen: [...runState.fallen, ...newFallen],
        pack: newPack,
        status: 'in_dungeon',
        currentNodeId: fanout[0],
      },
    };
  }

  // fanout.length === 2 — fork source. Stay at this node; flag awaitingFork.
  return {
    runState: {
      ...runState,
      party: partyAfterXp,
      fallen: [...runState.fallen, ...newFallen],
      pack: newPack,
      status: 'in_dungeon',
      awaitingFork: true,
    },
  };
}

export function pressOn(runState: RunState, rng: Rng): RunState {
  if (runState.status !== 'camp_screen') {
    throw new Error(`pressOn: status must be 'camp_screen', got '${runState.status}'`);
  }
  const nextFloor = runState.currentFloorNumber + 1;
  const { nodes, startNodeId } = generateFloor(runState.dungeonId, nextFloor, rng);
  return {
    ...runState,
    currentFloorNumber: nextFloor,
    currentFloorNodes: nodes,
    currentNodeId: startNodeId,
    awaitingFork: false,
    status: 'in_dungeon',
  };
}

export function cashout(runState: RunState): { runState: RunState; outcome: CashoutOutcome } {
  const atCamp = runState.status === 'in_dungeon' &&
                 currentNode(runState).type === 'camp';
  if (runState.status !== 'camp_screen' && !atCamp) {
    throw new Error(`cashout: must be at camp_screen or camp node, got status='${runState.status}'`);
  }
  const outcome: CashoutOutcome = {
    goldBanked: totalGold(runState.pack),
    itemsBanked: runState.pack.items,
    heroesReturned: runState.party,
    heroesFallen: runState.fallen,
    heroesLost: runState.lost,
  };
  return {
    runState: { ...runState, status: 'ended' },
    outcome,
  };
}

export function purchaseItem(runState: RunState, itemId: string): RunState {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`purchaseItem: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const cur = currentNode(runState);
  if (cur.type !== 'shop') {
    throw new Error(`purchaseItem: current node is type '${cur.type}', not 'shop'`);
  }
  const idx = cur.inventory.findIndex((s) => s.item.id === itemId);
  if (idx < 0) {
    throw new Error(`purchaseItem: item id '${itemId}' not in shop inventory`);
  }
  const slot = cur.inventory[idx];
  if (slot.sold) {
    throw new Error(`purchaseItem: item id '${itemId}' already sold`);
  }
  if (runState.pack.gold < slot.price) {
    throw new Error(
      `purchaseItem: insufficient gold (have ${runState.pack.gold}, need ${slot.price})`,
    );
  }

  const newInventory = cur.inventory.map((s, i) =>
    i === idx ? { ...s, sold: true } : s,
  );
  const newNodes = runState.currentFloorNodes.map((n) =>
    n.id === cur.id ? { ...cur, inventory: newInventory } : n,
  );

  return {
    ...runState,
    currentFloorNodes: newNodes,
    pack: addItem(spendGold(runState.pack, slot.price), slot.item),
  };
}

export function leaveShop(runState: RunState): RunState {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`leaveShop: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const cur = currentNode(runState);
  if (cur.type !== 'shop') {
    throw new Error(`leaveShop: current node is type '${cur.type}', not 'shop'`);
  }
  return {
    ...runState,
    currentNodeId: cur.nextNodeIds[0],
  };
}

/**
 * The player's traversal path through the current floor: from the start node
 * to (and including) the boss, picking the branch that contains `currentNodeId`
 * at each fork. Defaults to branch index 0 when ambiguous (player at start,
 * at fork source awaiting pick, or downstream of multiple branches).
 */
export function playerPath(runState: RunState): readonly Node[] {
  const referenced = new Set(
    runState.currentFloorNodes.flatMap((n) => [...n.nextNodeIds]),
  );
  const start = runState.currentFloorNodes.find((n) => !referenced.has(n.id));
  if (!start) return [];

  const path: Node[] = [start];
  let cur = start;
  while (cur.nextNodeIds.length > 0) {
    const nextId = pickBranchToward(runState, cur, runState.currentNodeId);
    const next = runState.currentFloorNodes.find((n) => n.id === nextId);
    if (!next) break;
    path.push(next);
    cur = next;
  }
  return path;
}

function pickBranchToward(rs: RunState, from: Node, target: string): string {
  if (from.nextNodeIds.length === 1) return from.nextNodeIds[0];
  // Multiple branches: pick the first one whose forward-reachable set contains target.
  for (const branchId of from.nextNodeIds) {
    if (reachableFrom(rs, branchId).has(target)) return branchId;
  }
  // Ambiguous: target isn't downstream of any branch (player at start / fork source)
  // OR is downstream of multiple (e.g., boss after convergence). Default to branch 0.
  return from.nextNodeIds[0];
}

function reachableFrom(rs: RunState, fromId: string): Set<string> {
  const seen = new Set<string>();
  const stack = [fromId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = rs.currentFloorNodes.find((n) => n.id === id);
    if (node) for (const next of node.nextNodeIds) stack.push(next);
  }
  return seen;
}

function woundsFromEvents(
  events: readonly CombatEvent[],
  combatantId: string,
): Wound[] {
  const wounds: Wound[] = [];
  for (const ev of events) {
    if (ev.kind === 'wound_inflicted' && ev.combatantId === combatantId) {
      wounds.push({ id: ev.woundId, runsRemaining: DEFAULT_WOUND_RUNS_REMAINING });
    }
  }
  return wounds;
}
