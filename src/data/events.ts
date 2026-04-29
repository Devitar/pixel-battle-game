import type { DungeonId, Rarity } from './types';

export type EventCardId = string;

export type EventPayload =
  | { kind: 'hp_delta_party'; percent: number }
  | { kind: 'gold_delta'; amount: number }
  | { kind: 'add_item'; rarity: Rarity }
  | { kind: 'lose_hero' };

export interface EventChoice {
  label: string;
  payloads: readonly EventPayload[];
}

export interface EventCard {
  id: EventCardId;
  body: string;
  choices: readonly [EventChoice, EventChoice];
  dungeonId?: DungeonId;
}

// Empty for now — Task 14 populates with ~20 cards.
export const EVENTS: Record<EventCardId, EventCard> = {};
