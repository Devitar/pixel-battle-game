import { describe, expect, it } from 'vitest';
import type { EventCard } from '../../data/events';
import { createHero, type Hero } from '../../heroes/hero';
import { createRng } from '../../util/rng';
import { applyEventChoice } from '../event_resolver';
import type { RunState } from '../run_state';
import { startRun } from '../run_state';

function makeParty(): Hero[] {
  return [
    createHero('knight', 'K', 'h0', 'quick', 'body1'),
    createHero('archer', 'A', 'h1', 'quick', 'body1'),
    createHero('priest', 'P', 'h2', 'quick', 'body1'),
  ];
}

function makeRun(): RunState {
  return startRun('crypt', makeParty(), 1, createRng(1));
}

const HP_DAMAGE_CARD: EventCard = {
  id: 'hp_damage',
  body: 'A test card.',
  choices: [
    { label: 'Take damage', payloads: [{ kind: 'hp_delta_party', percent: -0.20 }] },
    { label: 'Decline', payloads: [] },
  ],
};

const HP_HEAL_CARD: EventCard = {
  id: 'hp_heal',
  body: 'A test card.',
  choices: [
    { label: 'Heal', payloads: [{ kind: 'hp_delta_party', percent: 0.30 }] },
    { label: 'Decline', payloads: [] },
  ],
};

const GOLD_GAIN_CARD: EventCard = {
  id: 'gold_gain',
  body: 'A test card.',
  choices: [
    { label: 'Gain', payloads: [{ kind: 'gold_delta', amount: 100 }] },
    { label: 'Decline', payloads: [] },
  ],
};

const GOLD_LOSS_CARD: EventCard = {
  id: 'gold_loss',
  body: 'A test card.',
  choices: [
    { label: 'Pay', payloads: [{ kind: 'gold_delta', amount: -50 }] },
    { label: 'Decline', payloads: [] },
  ],
};

const ITEM_CARD: EventCard = {
  id: 'item_gain',
  body: 'A test card.',
  choices: [
    { label: 'Take rare item', payloads: [{ kind: 'add_item', rarity: 'rare' }] },
    { label: 'Decline', payloads: [] },
  ],
};

const LOSE_HERO_CARD: EventCard = {
  id: 'lose_hero',
  body: 'A test card.',
  choices: [
    { label: 'Sacrifice a hero', payloads: [{ kind: 'lose_hero' }] },
    { label: 'Decline', payloads: [] },
  ],
};

const COMBO_CARD: EventCard = {
  id: 'combo',
  body: 'A test card.',
  choices: [
    {
      label: 'HP for gold',
      payloads: [
        { kind: 'hp_delta_party', percent: -0.20 },
        { kind: 'gold_delta', amount: 150 },
      ],
    },
    { label: 'Decline', payloads: [] },
  ],
};

describe('applyEventChoice — hp_delta_party', () => {
  it('negative percent reduces every living hero HP by round(maxHp * percent)', () => {
    const rs = makeRun();
    const expected = rs.party.map((h) => h.currentHp - Math.round(h.maxHp * 0.20));
    const result = applyEventChoice(rs, HP_DAMAGE_CARD, 0, {}, createRng(1));
    for (let i = 0; i < result.runState.party.length; i++) {
      expect(result.runState.party[i].currentHp).toBe(expected[i]);
    }
  });

  it('outcome reports per-hero hpChanges deltas', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, HP_DAMAGE_CARD, 0, {}, createRng(1));
    expect(result.outcome.hpChanges).toBeDefined();
    expect(result.outcome.hpChanges).toHaveLength(rs.party.length);
    for (const change of result.outcome.hpChanges!) {
      expect(change.delta).toBeLessThan(0);
    }
  });

  it('positive percent heals, clamped at maxHp', () => {
    const rs0 = makeRun();
    const damaged: RunState = {
      ...rs0,
      party: rs0.party.map((h) => ({ ...h, currentHp: 1 })),
    };
    const result = applyEventChoice(damaged, HP_HEAL_CARD, 0, {}, createRng(1));
    for (const hero of result.runState.party) {
      const expected = Math.min(hero.maxHp, 1 + Math.round(hero.maxHp * 0.30));
      expect(hero.currentHp).toBe(expected);
    }
  });

  it('clamps at min 1 HP per hero (events do not kill)', () => {
    const rs0 = makeRun();
    const oneHp: RunState = {
      ...rs0,
      party: rs0.party.map((h) => ({ ...h, currentHp: 1 })),
    };
    const lethalCard: EventCard = {
      id: 'lethal',
      body: 'x',
      choices: [
        { label: 'Take damage', payloads: [{ kind: 'hp_delta_party', percent: -1.0 }] },
        { label: 'Decline', payloads: [] },
      ],
    };
    const result = applyEventChoice(oneHp, lethalCard, 0, {}, createRng(1));
    for (const hero of result.runState.party) {
      expect(hero.currentHp).toBe(1);
    }
  });
});

describe('applyEventChoice — gold_delta', () => {
  it('positive amount increases pack.gold by exactly the amount', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, GOLD_GAIN_CARD, 0, {}, createRng(1));
    expect(result.runState.pack.gold).toBe(rs.pack.gold + 100);
    expect(result.outcome.goldDelta).toBe(100);
  });

  it('negative amount with sufficient gold deducts the amount', () => {
    const rs0 = makeRun();
    const rich: RunState = { ...rs0, pack: { ...rs0.pack, gold: 200 } };
    const result = applyEventChoice(rich, GOLD_LOSS_CARD, 0, {}, createRng(1));
    expect(result.runState.pack.gold).toBe(150);
    expect(result.outcome.goldDelta).toBe(-50);
  });

  it('negative amount exceeding current gold caps at current gold', () => {
    const rs0 = makeRun();
    const poor: RunState = { ...rs0, pack: { ...rs0.pack, gold: 10 } };
    const result = applyEventChoice(poor, GOLD_LOSS_CARD, 0, {}, createRng(1));
    expect(result.runState.pack.gold).toBe(0);
    expect(result.outcome.goldDelta).toBe(-10);
  });
});

describe('applyEventChoice — add_item', () => {
  it('adds an item to pack.items', () => {
    const rs = makeRun();
    expect(rs.pack.items).toHaveLength(0);
    const result = applyEventChoice(rs, ITEM_CARD, 0, {}, createRng(1));
    expect(result.runState.pack.items).toHaveLength(1);
  });

  it('rolled item rarity matches the payload rarity', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, ITEM_CARD, 0, {}, createRng(1));
    expect(result.runState.pack.items[0].rarity).toBe('rare');
  });

  it('item.floorRolledAt equals run currentFloorNumber', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, ITEM_CARD, 0, {}, createRng(1));
    expect(result.runState.pack.items[0].floorRolledAt).toBe(rs.currentFloorNumber);
  });

  it('outcome reports the added item', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, ITEM_CARD, 0, {}, createRng(1));
    expect(result.outcome.itemAdded).toBeDefined();
    expect(result.outcome.itemAdded!.id).toBe(result.runState.pack.items[0].id);
  });
});

describe('applyEventChoice — lose_hero', () => {
  it('moves hero from party to lost', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, LOSE_HERO_CARD, 0, { selectedHeroIndex: 1 }, createRng(1));
    expect(result.runState.party).toHaveLength(2);
    expect(result.runState.lost).toHaveLength(1);
    expect(result.runState.lost[0].id).toBe('h1');
  });

  it('does not transfer the lost hero gear to the pack', () => {
    const rs = makeRun();
    const packItemsBefore = rs.pack.items.length;
    const result = applyEventChoice(rs, LOSE_HERO_CARD, 0, { selectedHeroIndex: 1 }, createRng(1));
    expect(result.runState.pack.items.length).toBe(packItemsBefore);
  });

  it('outcome reports heroLost', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, LOSE_HERO_CARD, 0, { selectedHeroIndex: 1 }, createRng(1));
    expect(result.outcome.heroLost).toBeDefined();
    expect(result.outcome.heroLost!.heroIndex).toBe(1);
    expect(result.outcome.heroLost!.heroName).toBe('A');
  });

  it('throws if selectedHeroIndex is missing', () => {
    const rs = makeRun();
    expect(() => applyEventChoice(rs, LOSE_HERO_CARD, 0, {}, createRng(1))).toThrow();
  });

  it('throws if selectedHeroIndex is out of range', () => {
    const rs = makeRun();
    expect(() => applyEventChoice(rs, LOSE_HERO_CARD, 0, { selectedHeroIndex: 99 }, createRng(1))).toThrow();
    expect(() => applyEventChoice(rs, LOSE_HERO_CARD, 0, { selectedHeroIndex: -1 }, createRng(1))).toThrow();
  });
});

describe('applyEventChoice — multi-payload', () => {
  it('combo card applies HP loss then gold gain in sequence', () => {
    const rs = makeRun();
    const expectedHps = rs.party.map((h) => h.currentHp - Math.round(h.maxHp * 0.20));
    const result = applyEventChoice(rs, COMBO_CARD, 0, {}, createRng(1));
    for (let i = 0; i < result.runState.party.length; i++) {
      expect(result.runState.party[i].currentHp).toBe(expectedHps[i]);
    }
    expect(result.runState.pack.gold).toBe(rs.pack.gold + 150);
    expect(result.outcome.hpChanges).toBeDefined();
    expect(result.outcome.goldDelta).toBe(150);
  });

  it('Decline choice (empty payloads) leaves RunState unchanged with empty outcome', () => {
    const rs = makeRun();
    const result = applyEventChoice(rs, HP_DAMAGE_CARD, 1, {}, createRng(1));
    expect(result.runState).toEqual(rs);
    expect(result.outcome).toEqual({});
  });
});

describe('applyEventChoice — validation', () => {
  it('throws if choiceIndex is out of range', () => {
    const rs = makeRun();
    expect(() => applyEventChoice(rs, HP_DAMAGE_CARD, 2 as 0 | 1, {}, createRng(1))).toThrow();
  });

  it('failing args validation does not mutate (RunState unchanged via throw)', () => {
    const rs = makeRun();
    expect(() => applyEventChoice(rs, LOSE_HERO_CARD, 0, {}, createRng(1))).toThrow();
  });
});
