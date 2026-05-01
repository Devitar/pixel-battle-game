import { describe, expect, it } from 'vitest';
import type { EventCard } from '@data/events';
import type { DungeonId } from '@data/types';
import { createRng } from '@util/rng';
import { drawEventCard } from '../event_deck';

const SHARED_A: EventCard = {
  id: 'shared_a',
  body: 'shared a',
  choices: [
    { label: 'Yes', payloads: [] },
    { label: 'No', payloads: [] },
  ],
};

const SHARED_B: EventCard = {
  id: 'shared_b',
  body: 'shared b',
  choices: [
    { label: 'Yes', payloads: [] },
    { label: 'No', payloads: [] },
  ],
};

const CRYPT_ONLY: EventCard = {
  id: 'crypt_only',
  body: 'crypt only',
  choices: [
    { label: 'Yes', payloads: [] },
    { label: 'No', payloads: [] },
  ],
  dungeonId: 'crypt',
};

describe('drawEventCard', () => {
  it('returns a card whose dungeonId is undefined or matches the requested dungeon', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const card = drawEventCard([SHARED_A, CRYPT_ONLY], 'crypt', createRng(seed));
      expect(card.dungeonId === undefined || card.dungeonId === 'crypt').toBe(true);
    }
  });

  it('filters out cards whose dungeonId does not match the requested dungeon', () => {
    const otherDungeonOnly: EventCard = {
      ...SHARED_B,
      id: 'other_only',
      dungeonId: 'sunken_keep' as DungeonId,
    };
    for (let seed = 1; seed <= 50; seed++) {
      const card = drawEventCard([SHARED_A, otherDungeonOnly], 'crypt', createRng(seed));
      expect(card.id).not.toBe('other_only');
      expect(card.id).toBe('shared_a');
    }
  });

  it('throws if the eligible pool is empty', () => {
    expect(() => drawEventCard([], 'crypt', createRng(1))).toThrow();
  });

  it('throws if no cards in the pool match the requested dungeon', () => {
    const otherDungeonOnly: EventCard = {
      ...SHARED_B,
      id: 'other_only',
      dungeonId: 'sunken_keep' as DungeonId,
    };
    expect(() => drawEventCard([otherDungeonOnly], 'crypt', createRng(1))).toThrow();
  });

  it('determinism: same seed + same eligible pool → same card', () => {
    const a = drawEventCard([SHARED_A, SHARED_B, CRYPT_ONLY], 'crypt', createRng(42));
    const b = drawEventCard([SHARED_A, SHARED_B, CRYPT_ONLY], 'crypt', createRng(42));
    expect(a.id).toBe(b.id);
  });
});
