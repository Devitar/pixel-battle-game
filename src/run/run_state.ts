import type { DungeonId, Item, Wound } from '../data/types';
import { applyLevelUps, levelForXp, xpForBossNode, xpForCombatNode } from '../data/leveling';
import { DEFAULT_WOUND_RUNS_REMAINING } from '../data/wounds';
import { generateFloor } from '../dungeon/floor';
import { rollLoot } from '../dungeon/loot';
import type { Node } from '../dungeon/node';
import type { CombatEvent, CombatResult } from '../combat/types';
import type { Hero } from '../heroes/hero';
import type { Rng } from '../util/rng';
import { addGold, addItem, createPack, type Pack, totalGold } from './pack';

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
}

export interface CashoutOutcome {
  goldBanked: number;
  itemsBanked: readonly Item[];
  heroesReturned: readonly Hero[];
  heroesLost: readonly Hero[];
}

export interface WipeOutcome {
  packLost: Pack;
  heroesLost: readonly Hero[];
}

const PARTY_SIZE = 3;
const COMBAT_NODE_GOLD = 15;
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
    const wipe: WipeOutcome = { packLost: runState.pack, heroesLost: allLost };
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
  const isBoss = completedNode.type === 'boss';
  const fanout = completedNode.nextNodeIds;

  // XP awards — only on victory, only to surviving heroes.
  const xpReward = isBoss
    ? xpForBossNode(runState.currentFloorNumber)
    : xpForCombatNode(runState.currentFloorNumber);
  const partyAfterXp = updatedPartyLiving.map((hero) => {
    const newXp = hero.xp + xpReward;
    const newLevel = levelForXp(newXp);
    return applyLevelUps({ ...hero, xp: newXp }, hero.level, newLevel);
  });

  const reward = isBoss
    ? BOSS_NODE_GOLD * runState.currentFloorNumber
    : COMBAT_NODE_GOLD * runState.currentFloorNumber;
  let newPack = addGold(runState.pack, reward);

  const drop = rollLoot(rng, runState.currentFloorNumber, isBoss);
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
  if (runState.status !== 'camp_screen') {
    throw new Error(`cashout: status must be 'camp_screen', got '${runState.status}'`);
  }
  const outcome: CashoutOutcome = {
    goldBanked: totalGold(runState.pack),
    itemsBanked: runState.pack.items,
    heroesReturned: runState.party,
    heroesLost: runState.fallen,
  };
  return {
    runState: { ...runState, status: 'ended' },
    outcome,
  };
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
