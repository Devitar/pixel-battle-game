import type { DungeonId, DungeonTier, Item, MilestoneId, Wound } from '@data/types';
import { applyLevelUps, levelForXp, xpForBossNode, xpForCombatNode, xpForEliteNode } from '@data/leveling';
import { DEFAULT_WOUND_RUNS_REMAINING } from '@data/wounds';
import { DUNGEONS } from '@data/dungeons';
import { applyCampNodeEffect, type CampNodeChoice } from '@dungeon/camp_node';
import { generateFloor } from '@dungeon/floor';
import { rollLoot } from '@dungeon/loot';
import type { Node } from '@dungeon/node';
import { goldMultiplier } from '@dungeon/scaling';
import type { CombatEvent, CombatResult } from '@combat/types';
import type { Hero } from '@heroes/hero';
import type { Rng } from '@util/rng';
import { addGold, addItem, createPack, spendGold, type Pack, totalGold } from './pack';
import { detectBossMilestones } from './milestones';

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
  readonly traversedNodeIds: readonly string[];
  readonly surprisesThisFloor: number;
  readonly pendingMilestones: readonly MilestoneId[];
}

export interface CashoutOutcome {
  goldBanked: number;
  itemsBanked: readonly Item[];
  heroesReturned: readonly Hero[];
  heroesFallen: readonly Hero[];   // died in combat this run
  heroesLost: readonly Hero[];     // narratively Lost via event/hazard during this run
  milestonesTriggered: readonly MilestoneId[];
}

export interface WipeOutcome {
  packLost: Pack;
  heroesFallen: readonly Hero[];   // died in combat (including the wiping fight)
  heroesLost: readonly Hero[];     // narratively Lost prior to the wipe
  milestonesTriggered: readonly MilestoneId[];
}

export const PARTY_SIZE = 3;

function dungeonTierOf(runState: RunState): DungeonTier {
  return DUNGEONS[runState.dungeonId].tier;
}

const COMBAT_NODE_GOLD = 15;
const ELITE_NODE_GOLD = 30;
const BOSS_NODE_GOLD = 100;
const SURPRISE_GOLD_BASE = 7;  // half of COMBAT_NODE_GOLD = 15, rounded down

export function nodeRewardGold(
  kind: 'combat' | 'elite' | 'boss',
  floorNumber: number,
  tier: DungeonTier,
): number {
  const base = kind === 'boss' ? BOSS_NODE_GOLD : kind === 'elite' ? ELITE_NODE_GOLD : COMBAT_NODE_GOLD;
  return Math.round(base * floorNumber * goldMultiplier(tier));
}

export function surpriseRewardGold(floorNumber: number, tier: DungeonTier): number {
  return Math.round(SURPRISE_GOLD_BASE * floorNumber * goldMultiplier(tier));
}

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
    traversedNodeIds: [startNodeId],
    surprisesThisFloor: 0,
    pendingMilestones: [],
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
    traversedNodeIds: [...runState.traversedNodeIds, nextNodeId],
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
  // Non-leave camp choice: apply the effect and stay at the camp node so the
  // map can light up the next-row choice for the player to click. Same
  // click-to-advance contract as completeCombat — see the awaitingFork comment
  // there.
  const newRunState = applyCampNodeEffect(runState, choice, rng);
  return {
    runState: {
      ...newRunState,
      awaitingFork: true,
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
      milestonesTriggered: runState.pendingMilestones,
    };
    return {
      runState: {
        ...runState,
        party: [],
        fallen: allLost,
        pack: createPack(),
        status: 'ended',
        pendingMilestones: [],
      },
      wipe,
    };
  }

  const completedNode = currentNode(runState);
  if (
    completedNode.type === 'shop' ||
    completedNode.type === 'camp' ||
    completedNode.type === 'event' ||
    completedNode.type === 'treasure'
  ) {
    throw new Error(`completeCombat: current node is type '${completedNode.type}', not a combat-bearing node`);
  }
  const kind = completedNode.type;
  const isBoss = kind === 'boss';

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

  const reward = nodeRewardGold(kind, runState.currentFloorNumber, dungeonTierOf(runState));
  let newPack = addGold(runState.pack, reward);

  const drop = rollLoot(rng, runState.currentFloorNumber, kind, dungeonTierOf(runState));
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
    const def = DUNGEONS[runState.dungeonId];
    const isCanonicalFinal = runState.currentFloorNumber === def.floorsPerRun;
    const triggered = isCanonicalFinal
      ? detectBossMilestones(runState.dungeonId, runState.currentFloorNumber)
      : [];
    return {
      runState: {
        ...runState,
        party: partyAfterXp,
        fallen: [...runState.fallen, ...newFallen],
        pack: newPack,
        status: 'camp_screen',
        pendingMilestones: [...runState.pendingMilestones, ...triggered],
      },
    };
  }

  // Non-boss victory — stay at the just-cleared node and flag awaitingFork
  // (regardless of fanout). The player clicks the next node on the map to
  // advance, even when there's only one choice. Auto-advancing combat→combat
  // felt jarring; the cartographer-feel demands every transition be a click.
  // The "fork" name is now a slight misnomer — it really means "awaiting any
  // next-node choice, even a single one" — kept for blast-radius reasons.
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

export function completeSurpriseCombat(
  runState: RunState,
  result: CombatResult,
  rng: Rng,
): { runState: RunState; wipe?: WipeOutcome } {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`completeSurpriseCombat: status must be 'in_dungeon', got '${runState.status}'`);
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
      milestonesTriggered: runState.pendingMilestones,
    };
    return {
      runState: {
        ...runState,
        party: [],
        fallen: allLost,
        pack: createPack(),
        status: 'ended',
        pendingMilestones: [],
      },
      wipe,
    };
  }

  // XP awards mirror combat-node policy — surprises ARE combat, just unannounced.
  const xpReward = xpForCombatNode(runState.currentFloorNumber);
  const partyAfterXp = updatedPartyLiving.map((hero) => {
    const newXp = hero.xp + xpReward;
    const newLevel = levelForXp(newXp);
    return applyLevelUps({ ...hero, xp: newXp }, hero.level, newLevel);
  });

  // Reduced gold reward.
  const reward = surpriseRewardGold(runState.currentFloorNumber, dungeonTierOf(runState));
  let newPack = addGold(runState.pack, reward);

  // Loot at standard 'combat' kind — same 10% gate.
  const drop = rollLoot(rng, runState.currentFloorNumber, 'combat', dungeonTierOf(runState));
  if (drop) {
    newPack = addItem(newPack, drop);
  }

  // Fallen-hero gear recovery (mirrors completeCombat).
  for (const fallen of newFallen) {
    const eq = fallen.equipment;
    const items: Item[] = [eq.weapon, eq.shield, eq.outfit, eq.hat].filter(
      (i): i is Item => i !== undefined,
    );
    for (const item of items) {
      newPack = addItem(newPack, item);
    }
  }

  // Critical: do NOT change currentNodeId; do NOT set awaitingFork; do NOT
  // change status. Heroes still need to walk to the destination after this.
  return {
    runState: {
      ...runState,
      party: partyAfterXp,
      fallen: [...runState.fallen, ...newFallen],
      pack: newPack,
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
    traversedNodeIds: [startNodeId],
    surprisesThisFloor: 0,
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
    milestonesTriggered: runState.pendingMilestones,
  };
  return {
    runState: { ...runState, status: 'ended', pendingMilestones: [] },
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
  // Stay at the shop and flag awaitingFork — the player clicks the next-row
  // node to advance. This also fixes the "shop at fork-source silently picks
  // branch 0" bug; the map now offers both branches as click targets.
  return {
    ...runState,
    awaitingFork: true,
  };
}

export function claimTreasure(runState: RunState, item: Item): RunState {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`claimTreasure: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const cur = currentNode(runState);
  if (cur.type !== 'treasure') {
    throw new Error(`claimTreasure: current node is type '${cur.type}', not 'treasure'`);
  }
  return {
    ...runState,
    pack: addItem(runState.pack, item),
    awaitingFork: true,
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

/**
 * Phase 6a per-edge HP tick. Evaluated once per edge during travel.
 *
 * Per hero (binary on wound presence):
 * - `wounds.length > 0` → take -1 HP, floored at 1 (travel chip damage cannot kill).
 * - `wounds.length === 0` → gain +1 HP, capped at maxHp.
 *
 * Returns the new run state and a `deltas` array indexed parallel to `runState.party`
 * (each entry is -1, 0, or +1). The travel scene reads `deltas` to render per-hero
 * popups; entries equal to 0 mean no popup should render.
 *
 * Pure: does not mutate the input runState.
 */
export function applyTravelTick(runState: RunState): { runState: RunState; deltas: readonly number[] } {
  const deltas: number[] = [];
  const newParty = runState.party.map((hero) => {
    if (hero.wounds.length > 0) {
      const newHp = Math.max(1, hero.currentHp - 1);
      const delta = newHp - hero.currentHp;
      deltas.push(delta);
      return delta === 0 ? hero : { ...hero, currentHp: newHp };
    }
    const newHp = Math.min(hero.maxHp, hero.currentHp + 1);
    const delta = newHp - hero.currentHp;
    deltas.push(delta);
    return delta === 0 ? hero : { ...hero, currentHp: newHp };
  });
  return {
    runState: { ...runState, party: newParty },
    deltas,
  };
}
