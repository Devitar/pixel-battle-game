import type { EventCard } from '@data/events';
import type { DungeonId } from '@data/types';
import type { Rng } from '@util/rng';

export function drawEventCard(
  cards: readonly EventCard[],
  dungeonId: DungeonId,
  rng: Rng,
): EventCard {
  const eligible = cards.filter(
    (c) => c.dungeonId === undefined || c.dungeonId === dungeonId,
  );
  if (eligible.length === 0) {
    throw new Error(`drawEventCard: no eligible cards for dungeon '${dungeonId}'`);
  }
  return rng.pick(eligible);
}
