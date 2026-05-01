import { describe, expect, it } from 'vitest';
import { applyEventChoice } from '../../run/event_resolver';
import { startRun } from '../../run/run_state';
import { createHero } from '../../heroes/hero';
import { createRng } from '../../util/rng';
import { describePayload, EVENTS, type EventCard, type EventPayload } from '../events';

function makeRun() {
  return startRun(
    'crypt',
    [
      createHero('knight', 'K', 'h0', 'quick', 'body1'),
      createHero('archer', 'A', 'h1', 'quick', 'body1'),
      createHero('priest', 'P', 'h2', 'quick', 'body1'),
    ],
    1,
    createRng(1),
  );
}

const ALL_CARDS: EventCard[] = Object.values(EVENTS);

describe('EVENTS deck — shape', () => {
  it('has exactly 20 cards', () => {
    expect(Object.keys(EVENTS)).toHaveLength(20);
  });

  it('15 cards are shared (dungeonId === undefined)', () => {
    const shared = ALL_CARDS.filter((c) => c.dungeonId === undefined);
    expect(shared).toHaveLength(15);
  });

  it('5 cards are Crypt-specific (dungeonId === "crypt")', () => {
    const crypt = ALL_CARDS.filter((c) => c.dungeonId === 'crypt');
    expect(crypt).toHaveLength(5);
  });
});

describe('EVENTS deck — Lost coverage', () => {
  it('exactly 4 cards have a lose_hero payload anywhere in their choices', () => {
    const lostCards = ALL_CARDS.filter((c) =>
      c.choices.some((choice) =>
        choice.payloads.some((p) => p.kind === 'lose_hero'),
      ),
    );
    expect(lostCards).toHaveLength(4);
  });

  it('no choice contains two or more lose_hero payloads', () => {
    for (const card of ALL_CARDS) {
      for (const choice of card.choices) {
        const loseHeroCount = choice.payloads.filter((p) => p.kind === 'lose_hero').length;
        expect(loseHeroCount, `card '${card.id}' choice has ${loseHeroCount} lose_hero payloads`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('EVENTS deck — payload-kind coverage', () => {
  function deckIncludesPayloadKind(kind: EventPayload['kind']): boolean {
    return ALL_CARDS.some((c) =>
      c.choices.some((choice) =>
        choice.payloads.some((p) => p.kind === kind),
      ),
    );
  }

  it('at least one card uses hp_delta_party', () => {
    expect(deckIncludesPayloadKind('hp_delta_party')).toBe(true);
  });

  it('at least one card uses gold_delta', () => {
    expect(deckIncludesPayloadKind('gold_delta')).toBe(true);
  });

  it('at least one card uses add_item', () => {
    expect(deckIncludesPayloadKind('add_item')).toBe(true);
  });

  it('at least one card uses lose_hero', () => {
    expect(deckIncludesPayloadKind('lose_hero')).toBe(true);
  });
});

describe('EVENTS deck — card structure validation', () => {
  it('every card has exactly 2 choices', () => {
    for (const card of ALL_CARDS) {
      expect(card.choices, `card '${card.id}'`).toHaveLength(2);
    }
  });

  it('every card has a non-empty body', () => {
    for (const card of ALL_CARDS) {
      expect(card.body.length, `card '${card.id}' has empty body`).toBeGreaterThan(0);
    }
  });

  it("every card's id matches its key in EVENTS", () => {
    for (const [key, card] of Object.entries(EVENTS)) {
      expect(card.id, `EVENTS['${key}'].id mismatch`).toBe(key);
    }
  });

  it("every card's id is unique", () => {
    const ids = ALL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('EVENTS deck — end-to-end resolution sanity', () => {
  it('hooded_stranger choice 0 deals HP damage and gains 150g', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, EVENTS.hooded_stranger, 0, {}, createRng(1));
    expect(result.runState.pack.gold).toBe(rs.pack.gold + 150);
    expect(result.outcome.goldDelta).toBe(150);
    expect(result.outcome.hpChanges).toBeDefined();
    expect(result.outcome.hpChanges!.length).toBeGreaterThan(0);
    for (const change of result.outcome.hpChanges!) {
      expect(change.delta).toBeLessThan(0);
    }
  });

  it('silent_priest choice 0 deducts 80g and heals every hero', () => {
    const rs0 = makeRun();
    // Damage every hero so the heal is observable.
    const damaged = {
      ...rs0,
      pack: { ...rs0.pack, gold: 200 },
      party: rs0.party.map((h) => ({ ...h, currentHp: 1 })),
    };
    const result = applyEventChoice(damaged, EVENTS.silent_priest, 0, {}, createRng(1));
    expect(result.runState.pack.gold).toBe(120);
    expect(result.outcome.goldDelta).toBe(-80);
    for (const hero of result.runState.party) {
      expect(hero.currentHp).toBeGreaterThan(1);
    }
  });
});

describe('describePayload', () => {
  it('renders a negative hp_delta_party as "Party loses N% HP"', () => {
    expect(describePayload({ kind: 'hp_delta_party', percent: -0.20 }))
      .toBe('Party loses 20% HP');
  });

  it('renders a positive hp_delta_party as "Party heals N% HP"', () => {
    expect(describePayload({ kind: 'hp_delta_party', percent: 0.25 }))
      .toBe('Party heals 25% HP');
  });

  it('renders a positive gold_delta with a + sign', () => {
    expect(describePayload({ kind: 'gold_delta', amount: 150 }))
      .toBe('+150g');
  });

  it('renders a negative gold_delta with the literal sign', () => {
    expect(describePayload({ kind: 'gold_delta', amount: -80 }))
      .toBe('-80g');
  });

  it('renders add_item with the rarity word', () => {
    expect(describePayload({ kind: 'add_item', rarity: 'common' }))
      .toBe('Gain a common item');
    expect(describePayload({ kind: 'add_item', rarity: 'uncommon' }))
      .toBe('Gain a uncommon item');
    expect(describePayload({ kind: 'add_item', rarity: 'rare' }))
      .toBe('Gain a rare item');
  });

  it('renders lose_hero as "Lose a hero"', () => {
    expect(describePayload({ kind: 'lose_hero' }))
      .toBe('Lose a hero');
  });
});
