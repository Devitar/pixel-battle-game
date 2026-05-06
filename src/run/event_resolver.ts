import type { EventCard, EventPayload } from '@data/events';
import type { DungeonTier, Item } from '@data/types';
import { DUNGEONS } from '@data/dungeons';
import { rollEventItem } from '@dungeon/loot';
import { goldMultiplier } from '@dungeon/scaling';
import type { Hero } from '@heroes/hero';
import type { Rng } from '@util/rng';
import { addGold, addItem, spendGold } from './pack';
import { loseHero, type RunState } from './run_state';

export interface EventChoiceArgs {
  selectedHeroIndex?: number;
}

export interface EventOutcome {
  hpChanges?: readonly { heroIndex: number; delta: number }[];
  goldDelta?: number;
  itemAdded?: Item;
  heroLost?: { heroIndex: number; heroName: string };
}

export function applyEventChoice(
  runState: RunState,
  card: EventCard,
  choiceIndex: 0 | 1,
  args: EventChoiceArgs,
  rng: Rng,
): { runState: RunState; outcome: EventOutcome } {
  const choice = card.choices[choiceIndex];
  if (!choice) {
    throw new Error(`applyEventChoice: choiceIndex ${choiceIndex} out of range`);
  }

  // Validate args before any mutation.
  if (choice.payloads.some((p) => p.kind === 'lose_hero')) {
    const idx = args.selectedHeroIndex;
    if (idx === undefined || idx < 0 || idx >= runState.party.length) {
      throw new Error(`applyEventChoice: lose_hero payload requires valid args.selectedHeroIndex`);
    }
  }

  const tier = DUNGEONS[runState.dungeonId].tier;

  let rs = runState;
  const outcome: EventOutcome = {};

  for (const payload of choice.payloads) {
    const result = applyPayload(rs, payload, args, rng, tier);
    rs = result.runState;
    Object.assign(outcome, result.outcomeDelta);
  }

  return { runState: rs, outcome };
}

function applyPayload(
  rs: RunState,
  payload: EventPayload,
  args: EventChoiceArgs,
  rng: Rng,
  tier: DungeonTier,
): { runState: RunState; outcomeDelta: Partial<EventOutcome> } {
  switch (payload.kind) {
    case 'hp_delta_party': {
      const hpChanges: { heroIndex: number; delta: number }[] = [];
      const newParty: Hero[] = rs.party.map((hero, i) => {
        const raw = Math.round(hero.maxHp * payload.percent);
        const target = Math.max(1, Math.min(hero.maxHp, hero.currentHp + raw));
        const delta = target - hero.currentHp;
        if (delta !== 0) hpChanges.push({ heroIndex: i, delta });
        return { ...hero, currentHp: target };
      });
      return {
        runState: { ...rs, party: newParty },
        outcomeDelta: { hpChanges },
      };
    }
    case 'gold_delta': {
      const before = rs.pack.gold;
      const scaledAmount = Math.round(payload.amount * goldMultiplier(tier));
      const newPack = scaledAmount >= 0
        ? addGold(rs.pack, scaledAmount)
        : spendGold(rs.pack, Math.min(rs.pack.gold, -scaledAmount));
      const delta = newPack.gold - before;
      return {
        runState: { ...rs, pack: newPack },
        outcomeDelta: { goldDelta: delta },
      };
    }
    case 'add_item': {
      const item = rollEventItem(rng, rs.currentFloorNumber, payload.rarity, tier);
      return {
        runState: { ...rs, pack: addItem(rs.pack, item) },
        outcomeDelta: { itemAdded: item },
      };
    }
    case 'lose_hero': {
      const idx = args.selectedHeroIndex!;  // already validated
      const hero = rs.party[idx];
      const heroName = hero.name;
      return {
        runState: loseHero(rs, idx),
        outcomeDelta: { heroLost: { heroIndex: idx, heroName } },
      };
    }
  }
}
