# Epic gear tier (rarity 4 of 5) — design spec

**Date:** 2026-05-12
**Status:** Draft, awaiting review
**Source:** Brainstorm 2026-05-12, decomposed from a broader "legendary gear + L10 milestone" scope (TODO Cluster D · 8).

## Summary

Add `'epic'` to the `Rarity` union between `'rare'` and `'legendary'`. Epic items roll 3 affixes (4 for hats, mirroring the existing rare-hat asymmetry) plus a guaranteed rare-property. Epic enters the loot pool at deeper floors per an extended `RARITY_TABLE` row. Blacksmith upgrade cost and sell value extend on the existing geometric curve. Rarity color is purple `#a060ff`.

This is **Spec 2 of 4** in the legendary cascade (Spec 1 — MAX_LEVEL + L10 perks — shipped 2026-05-12). This spec is independent of Spec 1 and Spec 3; can ship anytime.

## In scope

- Widen `Rarity = 'common' | 'uncommon' | 'rare' | 'epic'` (no `'legendary'` yet — Spec 3's job).
- Extend `RARITY_TABLE` rows with an `epic` column. Curve: floor 1 (0%) → 3 (0%) → 5 (1%) → 8 (3%) → 10 (5%) → 15 (10%). Rare nudges down to make room (0/2/5/12/18/25).
- `affixCount(rarity, slot)`: epic non-hat = 3, epic hat = 4 (extends the existing +1-per-tier curve and preserves the rare-hat-bonus pattern).
- Widen `pickRareProperty` call-site condition from `rarity === 'rare'` to `rarity === 'rare' || rarity === 'epic'` at every drop-resolution site.
- `BLACKSMITH_UPGRADE_COST.epic = 900` (continues 3× geometric from 100 → 300 → 900).
- `SELL_VALUE.epic = 200` (continues ~2.5× geometric from 10 → 30 → 80 → 200).
- Extract `RARITY_COLOR_HEX` / `RARITY_COLOR_NUM` to a new `src/render/rarity_colors.ts`, with Epic = `#a060ff` (purple). Replace duplicates in `equip_scene.ts` and `event_overlay_scene.ts` with imports.

## Out of scope

- `'legendary'` rarity — Spec 3 (Cluster D · 9). Defers because adding a stub legendary requires picking sentinel values for every `Record<Rarity, X>`, which is Spec 3's number-setting work.
- Affix-value scaling at Epic — Epic items use `rollAffixValue(affixId, floor)` unchanged. Tier differentiation comes from "more affixes + guaranteed rare-property," not larger per-affix numbers. Matches the established precedent from Sunken Keep's spec ("tier-2 differentiation comes from rarity-distribution shift, not from numerically larger affix values").
- Boss-drop substitution / named items — Spec 3.
- Random legendary unique-passive pool — Spec 4.
- Shop pricing tuning for Epic — shops already use `pickRarity` so Epic appears in stock automatically; if the resulting shop price feels off in playtest, address in a follow-up.

## Type system changes

```ts
// src/data/types.ts
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';
```

The widening propagates to every `Record<Rarity, X>` and `Record<Exclude<Rarity, 'common'>, X>` (or similar exclusion). TypeScript will surface the consumers; expected to be at minimum: `BLACKSMITH_UPGRADE_COST`, `SELL_VALUE`, `RARITY_COLOR_HEX`, `RARITY_COLOR_NUM`, and the `pickRarity` weighted-options array in `loot.ts`.

## Loot integration

### RARITY_TABLE extension

```ts
interface RarityRow { floor: number; common: number; uncommon: number; rare: number; epic: number }

const RARITY_TABLE: readonly RarityRow[] = [
  { floor: 1,  common: 90, uncommon: 10, rare:  0, epic:  0 },
  { floor: 3,  common: 80, uncommon: 18, rare:  2, epic:  0 },
  { floor: 5,  common: 70, uncommon: 24, rare:  5, epic:  1 },
  { floor: 8,  common: 55, uncommon: 30, rare: 12, epic:  3 },
  { floor: 10, common: 45, uncommon: 32, rare: 18, epic:  5 },
  { floor: 15, common: 30, uncommon: 35, rare: 25, epic: 10 },
];
```

Each row's weights still sum to 100. `rarityWeightsAt` returns the 4-key shape; `pluckWeights` and `lerp` extend to include `epic`.

### pickRarity

```ts
function pickRarity(rng: Rng, floor: number, tier: DungeonTier = 1): Rarity {
  const w = rarityWeightsAt(floor, tier);
  const opts: WeightedOption<Rarity>[] = [
    { value: 'common',   weight: w.common },
    { value: 'uncommon', weight: w.uncommon },
    { value: 'rare',     weight: w.rare },
    { value: 'epic',     weight: w.epic },
  ];
  return rng.weighted(opts);
}
```

### affixCount

```ts
function affixCount(rarity: Rarity, slot: ItemSlot): number {
  if (rarity === 'common') return 0;
  if (rarity === 'uncommon') return 1;
  if (rarity === 'rare') return slot === 'hat' ? 3 : 2;
  return slot === 'hat' ? 4 : 3; // epic
}
```

### Rare-property gate

Three call sites in `loot.ts` (rollEventItem, generateShopItem, rollDropItem). Each currently:

```ts
const rareProperty = rarity === 'rare' ? pickRareProperty(rng, slot, floor) : undefined;
```

Becomes:

```ts
const rareProperty =
  (rarity === 'rare' || rarity === 'epic') ? pickRareProperty(rng, slot, floor) : undefined;
```

`pickRareProperty` already returns `undefined` for `slot === 'hat'`, so epic hats correctly have 4 affixes and no rare-property.

### Effective-floor interaction

Epic inherits the existing `TIER_RARITY_FLOOR_BONUS` mechanism. Sunken Keep (tier 2, bonus +3) on its floor-4 boss gets effective floor 7, which interpolates to Epic weight ≈ 2-3% — small but reliably appearing. Future Warren/Abyss tier bonuses (still 0 today, will be set higher by the dungeons-3-4 spec) push Epic appearance up further.

## Blacksmith + sell

```ts
// src/data/blacksmith.ts
export const BLACKSMITH_UPGRADE_COST: Record<Exclude<Rarity, 'common'>, number> = {
  uncommon: 100,
  rare: 300,
  epic: 900,
};
```

```ts
// src/items/sell.ts
const SELL_VALUE: Record<Rarity, number> = {
  common: 10,
  uncommon: 30,
  rare: 80,
  epic: 200,
};
```

The Blacksmith upgrade flow today uses `BLACKSMITH_UPGRADE_COST[targetRarity]` (verify in `src/items/upgrade.ts`). If the upgrade logic hardcodes `'rare'` as the cap rather than reading from the record, widen the cap check to allow `rare → epic` upgrades.

**Blacksmith building-level gate:** rare → epic upgrades require Blacksmith building level 3. Extends the existing pattern (L1 = common→uncommon, L2 = uncommon→rare, L3 = rare→epic). `canBlacksmithUpgrade` gains a `rare && blacksmithLevel < 3` check alongside the existing `uncommon && blacksmithLevel < 2` check.

Behavior expectation: an `'epic'` item cannot be upgraded further (Epic is the cap until Spec 3 adds Legendary).

## UI rarity colors

New file `src/render/rarity_colors.ts`:

```ts
import type { Rarity } from '@data/types';

export const RARITY_COLOR_HEX: Record<Rarity, string> = {
  common:   '#cccccc',
  uncommon: '#4488ff',
  rare:     '#ffcc66',
  epic:     '#a060ff',
};

export const RARITY_COLOR_NUM: Record<Rarity, number> = {
  common:   0xcccccc,
  uncommon: 0x4488ff,
  rare:     0xffcc66,
  epic:     0xa060ff,
};
```

Update callers:
- `src/scenes/equip_scene.ts` — remove local `RARITY_COLOR_NUM` and `RARITY_COLOR_HEX` consts (~lines 56-66); replace with `import { RARITY_COLOR_NUM, RARITY_COLOR_HEX } from '@render/rarity_colors';`.
- `src/scenes/event_overlay_scene.ts` — same pattern, remove local `RARITY_COLOR` (~line 56) and use the new import.

Phaser firewall: `src/render/` may depend on `@data/types`. Scenes may depend on render. Both fine.

## Save migration

**None.** Widening `Rarity` doesn't invalidate any stored value — existing saves contain `'common' | 'uncommon' | 'rare'` items which all remain valid under the wider union. `CURRENT_SCHEMA_VERSION` stays at 6.

## Testing strategy

### Loot tests (`src/dungeon/__tests__/loot.test.ts`)

- Verify Epic appears at the expected floors: 0% at floor 1, 0% at floor 3, ~1% at floor 5, ~10% at floor 15. Use a deterministic RNG seed + large sample to assert the distribution.
- Verify Epic items roll 3 affixes (non-hat) / 4 affixes (hat).
- Verify Epic items get a rare-property on weapon/shield/outfit (epic hats correctly have no rare-property).
- Verify rare's distribution still works (nudged but not broken).
- Update any existing rarity-distribution snapshot tests.

### Items tests

- `src/items/__tests__/upgrade.test.ts` — `rare → epic` upgrade costs 900g; `epic` items cannot upgrade further (or upgrade is a no-op, matching the existing behavior at the previous cap).
- `src/items/__tests__/sell.test.ts` — `sell(epic_item)` credits 200g.

### Blacksmith tests

- `BLACKSMITH_UPGRADE_COST.epic === 900`.

### Type-system tests

No runtime tests needed for the Rarity union widening itself — `tsc --noEmit` catches missing record entries.

## Risks

- **Missed `pickRareProperty` call site.** Three locations in `loot.ts` to widen. Easy to miss one. Mitigation: grep for the pattern `rarity === 'rare'` in `src/dungeon/` and audit each match during implementation.
- **Exhaustiveness gaps.** Any `switch` on `Rarity` without a `default` branch will error on `'epic'`. TypeScript surfaces this; address each one.
- **Shop pricing tuning.** Shops use `pickRarity` so Epic items appear in floor-15 shop stock automatically. The existing shop-price formula may produce surprising numbers for Epic. Out of scope to retune here, but spot-check in implementation; if obviously broken, fix or flag for a follow-up.
- **Upgrade chain cap behavior.** If `src/items/upgrade.ts` hardcodes `'rare'` as the terminal rarity, Epic upgrades won't work without that fix. Implementation should read the cap from `BLACKSMITH_UPGRADE_COST` keys.

## Decisions captured

- **Only `'epic'` in this spec, not `'epic' + 'legendary'`.** Revised the 2026-05-12 brainstorm note. Reason: TypeScript doesn't have "type-only" enum values — adding `'legendary'` requires picking real numbers for every `Record<Rarity, X>`, which is Spec 3's job.
- **Conservative drop curve** over aggressive (1% Crypt) or late-only (only Warren+) variants. Sunken Keep boss gets a meaningful but small Epic chance; Crypt stays Epic-free.
- **Affix asymmetry preserved** — epic hats get +1 affix over epic non-hats, mirroring the existing rare pattern.
- **Geometric cost curve preserved** — 100 → 300 → 900 for upgrade; 10 → 30 → 80 → 200 for sell.
- **Purple `#a060ff`** for Epic. Classic MMO-progression color; clear visual contrast with gold-rare.
- **Centralize rarity colors** to `src/render/rarity_colors.ts` since the spec already touches every consumer. Spec 3's legendary color lands in one place.

## Follow-ups (out of scope for this spec)

To go into TODO entries when this ships:

- **Sister Spec 3 (Cluster D · 9)** — adds `'legendary'` to the Rarity union, with named boss drops + L10 milestone gate. Will reuse this spec's centralized `rarity_colors.ts`.
- **Shop pricing tuning for Epic** — if implementation playtest reveals weird numbers, capture as a small TODO.
- **Tier 3/4 floor bonuses** — when Warren/Abyss dungeons ship, their `TIER_RARITY_FLOOR_BONUS` entries (currently 0) will get tuned upward to make Epic and (eventually) Legendary more common in those zones.
