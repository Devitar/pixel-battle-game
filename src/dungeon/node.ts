import type { EventCardId } from '@data/events';
import type { ModifierId } from '@data/modifiers';
import type { EnemyId, Item, SlotIndex } from '@data/types';

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
  | { id: string; type: 'combat'; encounter: Encounter; nextNodeIds: readonly string[]; slot: 0 | 1 | 2 }
  | { id: string; type: 'elite';  encounter: Encounter; nextNodeIds: readonly string[]; slot: 0 | 1 | 2 }
  | { id: string; type: 'boss';   encounter: Encounter; nextNodeIds: readonly string[]; slot: 0 | 1 | 2 }
  | { id: string; type: 'shop';   inventory: readonly ShopItem[]; nextNodeIds: readonly string[]; slot: 0 | 1 | 2 }
  | { id: string; type: 'camp';   nextNodeIds: readonly string[]; slot: 0 | 1 | 2 }
  | { id: string; type: 'event';  cardId: EventCardId; nextNodeIds: readonly string[]; slot: 0 | 1 | 2 }
  | { id: string; type: 'treasure'; nextNodeIds: readonly string[]; slot: 0 | 1 | 2 };

export type NodeType = Node['type'];
