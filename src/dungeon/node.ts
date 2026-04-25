import type { EnemyId, SlotIndex } from '../data/types';

export interface ScaleFactors {
  hp: number;
  attack: number;
}

export interface EnemyPlacement {
  enemyId: EnemyId;
  slot: SlotIndex;
}

export interface Encounter {
  enemies: readonly EnemyPlacement[];
  scale: ScaleFactors;
}

export type Node =
  | { id: string; type: 'combat'; encounter: Encounter }
  | { id: string; type: 'boss'; encounter: Encounter };

export type NodeType = Node['type'];
