import type { ModifierId } from '../data/modifiers';
import type { EnemyId, Item, SlotIndex } from '../data/types';

export interface ScaleFactors {
  hp: number;
  attack: number;
}

export interface EnemyPlacement {
  enemyId: EnemyId;
  slot: SlotIndex;
  modifierIds?: readonly ModifierId[];
}

export interface Encounter {
  enemies: readonly EnemyPlacement[];
  scale: ScaleFactors;
}

export interface ShopItem {
  readonly item: Item;
  readonly price: number;
  readonly sold: boolean;
}

export type Node =
  | { id: string; type: 'combat'; encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'elite';  encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'boss';   encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'shop';   inventory: readonly ShopItem[]; nextNodeIds: readonly string[] }
  | { id: string; type: 'camp';   nextNodeIds: readonly string[] };

export type NodeType = Node['type'];
