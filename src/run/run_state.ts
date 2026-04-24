import type { DungeonId } from '../data/types';
import { generateFloor } from '../dungeon/floor';
import type { Node } from '../dungeon/node';
import type { CombatResult } from '../combat/types';
import type { Hero } from '../heroes/hero';
import type { Rng } from '../util/rng';
import { addGold, createPack, type Pack, totalGold } from './pack';

export type RunStatus = 'in_dungeon' | 'camp_screen' | 'ended';

export interface RunState {
  readonly dungeonId: DungeonId;
  readonly seed: number;
  readonly party: readonly Hero[];
  readonly pack: Pack;
  readonly currentFloorNumber: number;
  readonly currentFloorNodes: readonly Node[];
  readonly currentNodeIndex: number;
  readonly status: RunStatus;
  readonly fallen: readonly Hero[];
}

export interface CashoutOutcome {
  goldBanked: number;
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
  const nodes = generateFloor(dungeonId, 1, rng);
  return {
    dungeonId,
    seed,
    party: [...party],
    pack: createPack(),
    currentFloorNumber: 1,
    currentFloorNodes: nodes,
    currentNodeIndex: 0,
    status: 'in_dungeon',
    fallen: [],
  };
}

export function currentNode(runState: RunState): Node {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`currentNode: status must be 'in_dungeon', got '${runState.status}'`);
  }
  return runState.currentFloorNodes[runState.currentNodeIndex];
}

export function completeCombat(
  runState: RunState,
  result: CombatResult,
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
    const updated: Hero = { ...original, currentHp: Math.max(0, combatant.currentHp) };
    if (combatant.isDead) {
      newFallen.push(updated);
    } else {
      updatedPartyLiving.push(updated);
    }
  }

  if (result.outcome === 'player_defeat' || result.outcome === 'timeout') {
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

  const completedNode = runState.currentFloorNodes[runState.currentNodeIndex];
  const reward =
    completedNode.type === 'boss'
      ? BOSS_NODE_GOLD * runState.currentFloorNumber
      : COMBAT_NODE_GOLD * runState.currentFloorNumber;
  const newPack = addGold(runState.pack, reward);

  if (completedNode.type === 'boss') {
    return {
      runState: {
        ...runState,
        party: updatedPartyLiving,
        fallen: [...runState.fallen, ...newFallen],
        pack: newPack,
        status: 'camp_screen',
      },
    };
  }

  return {
    runState: {
      ...runState,
      party: updatedPartyLiving,
      fallen: [...runState.fallen, ...newFallen],
      pack: newPack,
      status: 'in_dungeon',
      currentNodeIndex: runState.currentNodeIndex + 1,
    },
  };
}

export function pressOn(runState: RunState, rng: Rng): RunState {
  if (runState.status !== 'camp_screen') {
    throw new Error(`pressOn: status must be 'camp_screen', got '${runState.status}'`);
  }
  const nextFloor = runState.currentFloorNumber + 1;
  const nodes = generateFloor(runState.dungeonId, nextFloor, rng);
  return {
    ...runState,
    currentFloorNumber: nextFloor,
    currentFloorNodes: nodes,
    currentNodeIndex: 0,
    status: 'in_dungeon',
  };
}

export function cashout(runState: RunState): { runState: RunState; outcome: CashoutOutcome } {
  if (runState.status !== 'camp_screen') {
    throw new Error(`cashout: status must be 'camp_screen', got '${runState.status}'`);
  }
  const outcome: CashoutOutcome = {
    goldBanked: totalGold(runState.pack),
    heroesReturned: runState.party,
    heroesLost: runState.fallen,
  };
  return {
    runState: { ...runState, status: 'ended' },
    outcome,
  };
}
