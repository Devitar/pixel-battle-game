# Event system core — Design

- **TODO entry:** Cluster A · 13 (Event system core).
- **Tier:** 2.
- **Date:** 2026-04-29.

## 1 · Scope

Adds the event-card data shapes, the deck-draw helper, the `applyEventChoice` resolver, and a `loseHero` operation on `RunState` (sliced from Cluster A · 15). After this task, the event system can resolve any of four payload kinds against `RunState`; downstream tasks ship card content, save-schema serialization for the Lost category, and node/scene wiring.

**Pulled from Task 15 (Lost hero category):**

- `RunState.lost: readonly Hero[]` field (new).
- `loseHero(rs, heroIndex): RunState` operation that strips equipped gear and moves the hero from `party` to `lost`.
- Save normalizer default for missing `lost` field.

**Out of scope:**

- Adding `'event'` to the `Node` discriminated union or wiring events into `floor.ts`.
- Save-schema "Lost vs Fallen" serialization in `CashoutOutcome` / `WipeOutcome` (Task 15).
- Authored event-card content beyond test fixtures (Task 14 — ~20 cards).
- Event-card UI overlay (Cluster B · 5).

## 2 · Data shapes

New `src/data/events.ts`:

```ts
import type { DungeonId, Rarity } from './types';

export type EventCardId = string;

export type EventPayload =
  | { kind: 'hp_delta_party'; percent: number }   // negative = damage; clamped at min 1 HP per hero
  | { kind: 'gold_delta'; amount: number }        // can be negative; pack gold clamps at 0
  | { kind: 'add_item'; rarity: Rarity }          // rolls a fresh item of the given rarity
  | { kind: 'lose_hero' };                         // requires args.selectedHeroIndex

export interface EventChoice {
  label: string;                                   // button text
  payloads: readonly EventPayload[];               // applied in array order; empty = "Decline"
}

export interface EventCard {
  id: EventCardId;
  body: string;                                    // narrative text shown on the card
  choices: readonly [EventChoice, EventChoice];    // exactly 2 choices
  dungeonId?: DungeonId;                           // undefined = shared deck; otherwise dungeon-specific
}

export const EVENTS: Record<EventCardId, EventCard> = {};
// Empty for now — Task 14 populates with ~20 cards. Tests in this task hand-craft EventCard fixtures inline.
```

**Decline choice convention:** a choice with an empty `payloads` array is the "Decline" path — RunState unchanged after applying it. Test fixtures use `{ label: 'Decline', payloads: [] }` for these.

## 3 · `loseHero` operation on `RunState` (Task 15 slice)

`RunState` gains:

```ts
readonly lost: readonly Hero[];
```

`startRun` initializes `lost: []`. The save loader's `normalizeSaveFile` defaults missing `lost` to `[]` (pre-launch policy — no schema bump).

New op in `src/run/run_state.ts`:

```ts
export function loseHero(runState: RunState, heroIndex: number): RunState {
  if (heroIndex < 0 || heroIndex >= runState.party.length) {
    throw new Error(`loseHero: index ${heroIndex} out of range [0, ${runState.party.length})`);
  }
  const hero = runState.party[heroIndex];
  // Strip equipped gear (per gdd §8 — gear is gone with the Lost hero, not transferred to pack).
  const stripped: Hero = {
    ...hero,
    equipment: { weapon: undefined, shield: undefined, outfit: undefined, hat: undefined },
  };
  return {
    ...runState,
    party: runState.party.filter((_, i) => i !== heroIndex),
    lost: [...runState.lost, stripped],
  };
}
```

Cluster A · 15 will later add: distinct `lost` vs `fallen` reporting in `CashoutOutcome` / `WipeOutcome`, an event card using the payload (Task 14 may pre-author one), and Cluster B · 11 scene-side rendering.

## 4 · Deck draw helper

New `src/dungeon/event_deck.ts`:

```ts
import type { DungeonId } from '../data/types';
import type { EventCard } from '../data/events';
import type { Rng } from '../util/rng';

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
```

- **With replacement** — independent draws each time. No deck-state on RunState.
- **Filtering:** card with `dungeonId === undefined` is shared (always eligible); `dungeonId === 'crypt'` is Crypt-only. Other dungeons skip Crypt-only cards.
- **Empty-pool throw:** the call site (future floor-integration task) decides how to handle.

**File location rationale:** `src/data/` is "pure content tables" (`MODIFIERS`, `WOUNDS`, `TRAITS`); `src/dungeon/` is "content-aware logic that runs against state." `drawEventCard` consumes RNG, so it belongs alongside `loot.ts` / `modifier_stamp.ts`.

## 5 · `applyEventChoice` resolver

New `src/run/event_resolver.ts`:

```ts
import type { EventCard, EventPayload } from '../data/events';
import type { Item } from '../data/types';
import { rollEventItem } from '../dungeon/loot';
import type { Hero } from '../heroes/hero';
import type { Rng } from '../util/rng';
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

  let rs = runState;
  const outcome: EventOutcome = {};

  for (const payload of choice.payloads) {
    const result = applyPayload(rs, payload, args, rng);
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
      const newPack = payload.amount >= 0
        ? addGold(rs.pack, payload.amount)
        : spendGold(rs.pack, Math.min(rs.pack.gold, -payload.amount));
      const delta = newPack.gold - before;
      return {
        runState: { ...rs, pack: newPack },
        outcomeDelta: { goldDelta: delta },
      };
    }
    case 'add_item': {
      const item = rollEventItem(rng, rs.currentFloorNumber, payload.rarity);
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
```

### 5.1 · Clamping rules

- **HP delta** — `Math.max(1, ...)` ensures HP can't drop to 0 from events. The Lost path is the narrative-removal path; HP-loss is just damage. Heroes already at 1 HP stay at 1.
- **Gold delta** — negative deltas cap at current pack gold via `spendGold(min(have, want))`. Outcome's `goldDelta` reports the actual delta applied (may be smaller in magnitude than the payload's `amount`).
- **Args validation order** — all `lose_hero` payloads in the chosen branch require valid `selectedHeroIndex`. Validation runs before any mutation; failing args → original `RunState` unchanged.

### 5.2 · Multi-payload choices

A choice's `payloads` array applies left-to-right; state threads through. So `[{kind: 'hp_delta_party', percent: -0.20}, {kind: 'gold_delta', amount: 150}]` first reduces HP across the (current) party, then adds gold. Outcome accumulates: both `hpChanges` and `goldDelta` populated.

Empty `payloads: []` (Decline) → no payload applies → outcome is `{}` and `runState` is identical to input.

## 6 · `rollEventItem` helper in `dungeon/loot.ts`

Add as an exported helper:

```ts
export function rollEventItem(rng: Rng, floorNumber: number, rarity: Rarity): Item {
  // Always-drop, forced-rarity item. Slot picked uniformly. Affixes / rare-property
  // scaled at current floor.
  const slot = rng.pick(ALL_SLOTS);
  const base = pickBaseId(rng, slot);
  const affixIds = pickAffixes(rng, affixCount(rarity, slot));
  const affixes: RolledAffix[] = affixIds.map((id) => ({
    affixId: id,
    value: rollAffixValue(id, floorNumber),
  }));
  const rareProperty = rarity === 'rare' ? pickRareProperty(rng, slot, floorNumber) : undefined;
  const id = generateItemId(rng);
  return {
    id,
    baseId: base.baseId,
    slot,
    rarity,
    ...(base.weaponType !== undefined ? { weaponType: base.weaponType } : {}),
    affixes,
    ...(rareProperty !== undefined ? { rareProperty } : {}),
    floorRolledAt: floorNumber,
  };
}
```

Reuses the internal helpers (`ALL_SLOTS`, `pickBaseId`, `pickAffixes`, `affixCount`, `pickRareProperty`, `generateItemId`) used by `rollLoot` and `rollShopItem`. The shape parallels `rollLoot`'s elite-rarity path but accepts any `Rarity` value — gives Task 14 flexibility (`'common'` for cheap finds, `'rare'` for the gdd's "gain rare item" cards).

## 7 · Test plan

### `src/data/__tests__/events.test.ts` (new)

- `EVENTS` is an empty record (placeholder; Task 14 populates).
- The exported types compile (smoke check via test fixtures using each payload kind).

### `src/run/__tests__/event_resolver.test.ts` (new)

**hp_delta_party:**

- Negative percent reduces every living hero's HP by `round(maxHp * percent)`; clamped at min 1 HP per hero.
- Positive percent heals every living hero's HP, clamped at maxHp.
- Outcome reports per-hero delta in `outcome.hpChanges` for each affected hero.
- Heroes already at 1 HP stay at 1 (no death from events).

**gold_delta:**

- Positive amount increases pack.gold by exactly the amount.
- Negative amount with sufficient gold deducts the amount.
- Negative amount exceeding current gold caps at current gold (delta = `-current`).
- Outcome reports actual delta in `outcome.goldDelta`.

**add_item:**

- Adds an item to `pack.items`.
- Rolled item rarity matches the payload's `rarity` (across `'common'`, `'uncommon'`, `'rare'`).
- `Item.floorRolledAt` equals the run's `currentFloorNumber`.
- Outcome reports the item in `outcome.itemAdded`.

**lose_hero:**

- Strips equipped gear (all 4 slots become `undefined`).
- Removes hero from `party`, appends to `lost`.
- Outcome reports `{ heroIndex, heroName }`.
- Throws if `args.selectedHeroIndex` is missing.
- Throws if `selectedHeroIndex` is out of range.

**Multi-payload choice:**

- "Lose 20% HP, gain 150g" — both payloads apply in sequence; outcome carries both `hpChanges` and `goldDelta`.
- Empty `payloads` array (Decline choice) — RunState unchanged; outcome is empty object.

**Validation:**

- Throws if `choiceIndex` is not 0 or 1.
- Args validation runs before any mutation (failing args → original RunState unchanged via the throw).

### `src/dungeon/__tests__/loot.test.ts` (extend)

- `rollEventItem` always returns an item (never null).
- Item rarity equals the requested rarity, across many seeds and rarities.
- Determinism: same seed + floor + rarity → same item.

### `src/dungeon/__tests__/event_deck.test.ts` (new)

- `drawEventCard` returns a card whose `dungeonId` is undefined OR matches the requested dungeon.
- Filters out non-matching dungeon-specific cards.
- Throws if the eligible pool is empty.
- Determinism: same seed + same eligible pool → same card.

### `src/run/__tests__/run_state.test.ts` (extend)

- `loseHero` removes hero at index from party; appends to lost.
- Stripped hero has all 4 equipment slots undefined.
- Throws on out-of-range index.
- `startRun` initializes `lost: []`.

### `src/save/__tests__/save.test.ts` (extend)

- Save normalizer defaults missing `runState.lost` to `[]` for backward compat.

## 8 · Files touched

| File | Change |
|---|---|
| `src/data/events.ts` | **New.** `EventCardId`, `EventPayload`, `EventChoice`, `EventCard`, empty `EVENTS` record. |
| `src/dungeon/event_deck.ts` | **New.** `drawEventCard(cards, dungeonId, rng): EventCard`. |
| `src/dungeon/loot.ts` | Add `rollEventItem(rng, floorNumber, rarity): Item` exported helper. |
| `src/run/event_resolver.ts` | **New.** `EventChoiceArgs`, `EventOutcome`, `applyEventChoice`, internal `applyPayload`. |
| `src/run/run_state.ts` | Add `lost: readonly Hero[]` to `RunState`; init `lost: []` in `startRun`; new `loseHero` op. |
| `src/save/save.ts` | `normalizeSaveFile` defaults `runState.lost` to `[]` for backward compat. |
| `src/data/__tests__/events.test.ts` | **New.** Per §7. |
| `src/dungeon/__tests__/event_deck.test.ts` | **New.** Per §7. |
| `src/dungeon/__tests__/loot.test.ts` | Extend with `rollEventItem` tests. |
| `src/run/__tests__/event_resolver.test.ts` | **New.** Per §7. |
| `src/run/__tests__/run_state.test.ts` | Extend with `loseHero` tests + `startRun` initial-`lost` check. |
| `src/save/__tests__/save.test.ts` | Extend with `lost` default-on-load test. |

## 9 · Save schema

Pre-launch policy holds: schema stays at v1, no migration. `RunState.lost` is a new field on the save's `runState`. Saves predating this change will load with `lost === undefined`; the `normalizeSaveFile` helper defaults it to `[]`. Same pattern as the existing `stash` / `pendingPerk` defaults.

`Hero` itself is unchanged — we don't add a "Lost" category marker on the hero; the `lost` vs `fallen` distinction lives at the RunState level. Cluster A · 15 will decide whether `CashoutOutcome` / `WipeOutcome` need separate `heroesLost: readonly Hero[]` fields beyond the existing `heroesLost` (which today aggregates fallen).

## 10 · Open questions

None at design time. Numerical knobs (HP-delta clamp at 1, gold clamp at 0, with-replacement draw) all live in the resolver and are tunable inline.
