import { describe, expect, it } from 'vitest';
import { EVENTS, type EventCard, type EventPayload } from '../events';

describe('EVENTS table', () => {
  it('is empty (Task 14 will populate)', () => {
    expect(Object.keys(EVENTS)).toHaveLength(0);
  });
});

describe('EventPayload smoke-check', () => {
  it('all four payload kinds are well-typed', () => {
    const p1: EventPayload = { kind: 'hp_delta_party', percent: -0.20 };
    const p2: EventPayload = { kind: 'gold_delta', amount: 150 };
    const p3: EventPayload = { kind: 'add_item', rarity: 'rare' };
    const p4: EventPayload = { kind: 'lose_hero' };
    const all: EventPayload[] = [p1, p2, p3, p4];
    expect(all).toHaveLength(4);
  });

  it('EventCard accepts a 2-choice card with optional dungeonId', () => {
    const card: EventCard = {
      id: 'test_card',
      body: 'A test card.',
      choices: [
        { label: 'Yes', payloads: [{ kind: 'gold_delta', amount: 50 }] },
        { label: 'No', payloads: [] },
      ],
    };
    expect(card.choices).toHaveLength(2);
    expect(card.dungeonId).toBeUndefined();
  });
});
