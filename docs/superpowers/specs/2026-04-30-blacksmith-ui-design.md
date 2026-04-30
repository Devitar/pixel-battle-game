# Blacksmith building UI — Design

- **TODO entry:** Cluster B · 2 (Blacksmith building).
- **Tier:** 2.
- **Date:** 2026-04-30.

## 1 · Scope

Add a Blacksmith scene to the camp hub. Player clicks the Blacksmith tile, sees a single list of upgradeable items pulled from both the stash *and* roster-equipped gear. Clicking **Upgrade** on an item spends gold and replaces the item with a new one whose rarity is bumped one tier (common → uncommon, uncommon → rare). Layout pattern matches `hospital_panel_scene.ts` (left list / right detail).

The items data layer is fully shipped (Cluster A · 4 · *Gear rarity tiers + items foundation*). This task adds:

- One pure core module (`src/items/upgrade.ts`) that knows how to produce an upgraded `Item`.
- One Phaser scene (`src/scenes/blacksmith_panel_scene.ts`).
- One small constants module (`src/data/blacksmith.ts`).
- A mechanical promotion of two private helpers in `src/dungeon/loot.ts` to `export` (no behavior change).

**Out of scope (defer to future tasks):**

- Materials economy (gdd §6 mentions materials drop from elites/bosses; not modeled anywhere in the codebase yet).
- Building levels and Blacksmith upgrades (no save state for building levels exists; Hospital and Tavern have the same gap and ship at conceptual L1).
- `epic` rarity. The `Rarity` type is `'common' | 'uncommon' | 'rare'`. Adding `epic` is its own balance + loot-table change with broad blast radius.
- Re-rolling existing affixes on an item (separate feature).
- Upgrading items mid-run (Blacksmith is camp-only; no pack interaction).
- A Blacksmith tile-click in-run.

## 2 · Decisions

| Decision | Choice | Reasoning |
|---|---|---|
| Resource cost | Gold only | Matches pre-launch save schema; no `materials` field yet. |
| Cost values | `100g` common→uncommon, `300g` uncommon→rare | Fits the gdd's economy reference points (potions ~70g, rare weapon ~200–400g). |
| Building level | None | Both upgrade tiers available from day one. Same precedent as Hospital. |
| Affix selection | Random, excluded from existing affixes on the item | Matches the rest of the game's "outcomes are rolled" identity (loot, shop stock, recruitment). Affix uniqueness is always satisfiable: 7 affixes total, items max at 3. |
| Rare-property selection | Random, only rolled when reaching `rare` and slot supports it | Hats can't roll a rare property even at rare; their value bump is the third affix instead. |
| Value-scaling floor | `item.floorRolledAt` | Keeps the new affix and rare property in-tier with the item's existing values. |
| `floorRolledAt` after upgrade | Unchanged | Preserves the item's tier provenance. |
| `id` after upgrade | Fresh `generateItemId(rng)` | Old item is consumed; new item gets a new identity. Avoids any aliasing if both ever co-exist briefly during persistence. |
| Item scope | Stash + equipped (single unified list) | Avoids "go to Barracks → unequip → Blacksmith" friction. |
| List filter | Hide items already at `rare` | Implicit "upgradeable" filter; no special rule. |

## 3 · Camp scene — add Blacksmith tile

`src/scenes/camp_scene.ts`'s `create()` currently has Tavern (180) / Barracks (440) / Hospital (580) / Noticeboard (720). Insert a 5th tile between Tavern and Barracks at `x=300`:

```ts
this.buildBuilding('Tavern',     180, 0x664433, 100, 110, 'tavern_panel');
this.buildBuilding('Blacksmith', 300, 0x665533, 100, 120, 'blacksmith_panel');  // NEW
this.buildBuilding('Barracks',   440, 0x555555, 100, 130, 'barracks_panel');
this.buildBuilding('Hospital',   580, 0x885566, 100, 100, 'hospital_panel');
this.buildBuilding('Noticeboard',720, 0x998866,  80,  60, 'noticeboard_panel');
```

Color `0x665533` (warm bronze/forge brown) reads as "smithy" against the existing palette without clashing. Width/height `100×120` sits in the same scale band as the other buildings.

`BlacksmithPanelScene` is registered in `src/main.ts` alongside the other panel scenes.

## 4 · `src/data/blacksmith.ts` — constants

```ts
import type { Rarity } from './types';

// Cost is keyed by the *target* rarity (i.e. the rarity the item will become).
export const BLACKSMITH_UPGRADE_COST: Record<Exclude<Rarity, 'common'>, number> = {
  uncommon: 100,
  rare: 300,
};
```

Single tunable surface for both costs.

## 5 · `src/items/upgrade.ts` — core API

Pure TS, no Phaser, lives in the firewalled `items/` folder.

```ts
import type { Item, Rarity, RolledAffix } from '../data/types';
import { pickAffixes, pickRareProperty, rollAffixValue } from '../dungeon/loot';
import { type Rng, generateItemId } from '../util/rng';
import { BLACKSMITH_UPGRADE_COST } from '../data/blacksmith';

const NEXT_RARITY: Record<Rarity, Rarity | null> = {
  common: 'uncommon',
  uncommon: 'rare',
  rare: null,
};

export function nextRarity(r: Rarity): Rarity | null {
  return NEXT_RARITY[r];
}

export function canUpgrade(item: Item): boolean {
  return nextRarity(item.rarity) !== null;
}

export function upgradeCost(item: Item): number {
  const target = nextRarity(item.rarity);
  if (target === null) {
    throw new Error(`upgradeCost: item already at max rarity '${item.rarity}'`);
  }
  return BLACKSMITH_UPGRADE_COST[target];
}

export function upgradeItem(item: Item, rng: Rng): Item {
  const target = nextRarity(item.rarity);
  if (target === null) {
    throw new Error(`upgradeItem: cannot upgrade item at rarity '${item.rarity}'`);
  }

  // Pick a new affix not already on the item.
  // Note: pickAffixes shuffles ALL_AFFIX_IDS; we filter the existing affixes out
  // of consideration first so a pre-shuffle pick of size 1 satisfies uniqueness.
  // Implementation calls a small local helper that mirrors pickAffixes' shape
  // but with an exclusion set — see §5.1.
  const newAffix = rollNewAffix(item, rng);

  // If reaching 'rare' and slot supports a rare property, roll one.
  // Hats keep `rareProperty: undefined` even at rare.
  const rareProperty = target === 'rare' && item.slot !== 'hat'
    ? pickRareProperty(rng, item.slot, item.floorRolledAt)
    : item.rareProperty;

  const upgraded: Item = {
    ...item,
    id: generateItemId(rng),
    rarity: target,
    affixes: [...item.affixes, newAffix],
    ...(rareProperty !== undefined ? { rareProperty } : {}),
  };
  return upgraded;
}
```

### 5.1 · `rollNewAffix`

Local helper inside `upgrade.ts`. The existing `pickAffixes` in `loot.ts` doesn't take an exclusion set, and this is the only caller that needs one — a private helper is the right scope:

```ts
const ALL_AFFIX_IDS: readonly AffixId[] = [
  'of_power', 'of_insight', 'of_the_bear', 'of_vigor',
  'of_swiftness', 'of_the_hawk', 'of_evasion',
];

function rollNewAffix(item: Item, rng: Rng): RolledAffix {
  const used = new Set(item.affixes.map((a) => a.affixId));
  const available = ALL_AFFIX_IDS.filter((id) => !used.has(id));
  if (available.length === 0) {
    // Defensive — items max at 3 affixes (hat at rare); upgrade is blocked at rare.
    throw new Error('rollNewAffix: no available affixes');
  }
  const affixId = rng.pick(available);
  return { affixId, value: rollAffixValue(affixId, item.floorRolledAt) };
}
```

`ALL_AFFIX_IDS` duplicates the same constant in `loot.ts`. Kept duplicated for now (single import, two definitions) — both lists are 7 entries and trivially diff-able. If a third site needs the list, promote to a shared constants module.

### 5.2 · Promotions in `dungeon/loot.ts`

Two functions go from `function` to `export function` (no behavior change, no signature change):

- `rollAffixValue(affixId: AffixId, floor: number): number` — used by `rollNewAffix`.
- `pickRareProperty(rng: Rng, slot: ItemSlot, floor: number): RolledRareProperty | undefined` — used by `upgradeItem`.

`pickAffixes` stays private — `upgrade.ts` doesn't need it (the uniqueness-against-existing-affixes need is met by the local `rollNewAffix` helper).

No tests on `loot.ts` change. The `_internal` test export already exists for surface-area tests; we're not adding to it.

## 6 · `src/items/__tests__/upgrade.test.ts` — tests

Seeded `createRng()` for determinism. Test file imports `rollEventItem` (or constructs items inline) to set up fixtures, then asserts on `upgradeItem`'s output.

| # | Setup | Assertion |
|---|---|---|
| 1 | common weapon at floor 5 | rarity becomes `uncommon`; `affixes.length === 1`; new affix has correct value via `rollAffixValue(id, 5)`. |
| 2 | uncommon weapon at floor 5 (has `of_power`) | rarity becomes `rare`; `affixes.length === 2`; second affix is *not* `of_power`; `rareProperty` is defined; `rareProperty.propertyId` is weapon-valid. |
| 3 | uncommon hat at floor 5 (has `of_power`) | rarity becomes `rare`; `affixes.length === 3` (hat-at-rare bonus from `affixCount`); `rareProperty === undefined`. *(See note below.)* |
| 4 | rare weapon | `upgradeItem` throws; `canUpgrade` returns `false`; `upgradeCost` throws. |
| 5 | uncommon shield | `id` is different from the input's `id`. |
| 6 | uncommon outfit at floor 7 | `floorRolledAt` is preserved (still 7). |
| 7 | `nextRarity('common') === 'uncommon'`, `nextRarity('uncommon') === 'rare'`, `nextRarity('rare') === null`. |
| 8 | `upgradeCost` for a common returns `100`, for an uncommon returns `300`. |

**Hat-at-rare nuance (case 3).** `affixCount(rare, 'hat') === 3` and `affixCount(uncommon, 'hat') === 1`. So an uncommon hat with 1 affix that gets upgraded ends with 2 affixes, not 3 — but the loot-side roller for a *fresh* rare hat would have 3. This is a **deliberate divergence**: Blacksmith adds *one* affix per tier, not "fill to target tier's affix count." Adjust assertion accordingly: `affixes.length === 2` (was 1, +1 from upgrade). The test description should call this out so a future reader understands it's intentional.

If we ever decide Blacksmith should "fill to target affix count" (so an upgraded hat-rare matches a freshly-rolled hat-rare in stat budget), that's a separate balance decision. Not in scope here.

## 7 · Blacksmith scene — UI

`src/scenes/blacksmith_panel_scene.ts`. Mirrors `hospital_panel_scene.ts` constants where possible.

### 7.1 · Layout

- **Overlay + bordered panel** at `(480, 270)`, `920×460`.
- **Title** at top: `Blacksmith · {N upgradeable}`.
- **Vault gold** at top-right of title bar: `Gold: {balance}`.
- **Close button** (× at panel top-right; ESC keybind) — `scene.stop()` then `scene.resume('camp')`.
- **Left pane** (list): item rows, paged.
- **Right pane** (detail): selected item — current rarity badge, target preview, "What this changes" block.

### 7.2 · List rows

Each row ≈48px tall:

```
┌────────────────────────────────────────────────────────────────┐
│  [icon] Sword of Power      +1 atk          Stash    100g  [Upgrade] │
│         common                                                       │
└────────────────────────────────────────────────────────────────┘
```

- **Icon** — sprite frame from `BASE_ITEMS[item.baseId].spriteId`, rendered via the existing item-icon pattern in `equip_panel_scene.ts`. Reuse, don't reinvent.
- **Display name** — `itemDisplayName(item)`, colored by current rarity using the `RARITY_COLOR` map already in `equip_panel_scene.ts` (`common: 0xcccccc, uncommon: 0x4488ff, rare: 0xffcc66` — extract to a shared constants location? **No** — duplicate the literal map for now; if a third site wants it, promote it then. Same precedent as `'#ff6666'` in HeroCard/Barracks per the wound-display HISTORY note).
- **Subtitle line** — italic affix description via `itemAffixDescription(item)`, plus current rarity word in muted text.
- **Location label** — `Stash` (in dim grey) or `on {hero.name}` (with hero name in roster-color) as a centered third column.
- **Cost** — `100g` or `300g`, dimmed (`#cc6666`) when `vault < cost`, gold (`#ffcc66`) otherwise.
- **Upgrade button** — interactive when affordable; greyed when not. Same green/grey button styling as Hospital's Treat button.

Selection: clicking a row sets `selectedItemId`; the right pane rebuilds. Selection highlight = gold stroke on row bg, same as Hospital.

### 7.3 · Right pane (detail)

The right pane is a static preview/explainer — **no Upgrade button**. The action lives on the list row only. Pattern: row = actionable surface, detail pane = explainer. Reduces visual weight and avoids a redundant click target.

For the selected item, common → uncommon:

```
   Sword of Power
   common  →  uncommon

   What this changes:
     +1 random affix

   Cost: 100g
```

For uncommon → rare on a non-hat:

```
   What this changes:
     +1 random affix
     +1 rare property

   Cost: 300g
```

For uncommon → rare on a hat:

```
   What this changes:
     +1 random affix

   Cost: 300g
```

### 7.4 · Paging

Realistic content size is ~10–25 upgradeable items (12 heroes × ~3 equipped items + 0–15 stash items, minus rares). The Hospital's "cap at 6, no paging" approach won't scale.

Adopt `equip_panel_scene.ts`'s pattern:

- `LIST_VISIBLE_ROWS = 6`
- `listPageStart: number` — index into the filtered list.
- Up/down arrow buttons render at the right edge of the list pane when there are more items than fit.
- Disabled (greyed) at the start/end of the list.

Cleared state on every `rebuild()` — if the just-upgraded item dropped out of the list, clamp `listPageStart` so we don't show an empty page.

### 7.5 · Sort order

In the filtered upgradeable list:

1. **Stash items first**, then **equipped** (grouped by hero in `roster.heroes` order — the same order that surfaces everywhere else).
2. Within each group, sort by current rarity ascending (commons first, then uncommons), so cheap upgrades surface above expensive ones.
3. Within same rarity, by `floorRolledAt` ascending (older items first), then by `id` for stable ordering.

### 7.6 · Empty state

Title shows `Blacksmith · 0 upgradeable`; list pane shows centered text "No items can be upgraded." (e.g., empty stash and all roster gear is rare); detail pane is empty.

## 8 · Upgrade interaction

On Upgrade-button click for `(item, location)` where `location` is `{ kind: 'stash' } | { kind: 'equipped'; heroId: string; slot: ItemSlot }`:

```ts
const state = appState.get();
const cost = upgradeCost(item);
if (balance(state.vault) < cost) return;

const rng = createRng(Math.floor(Math.random() * 0xffffffff));
const upgraded = upgradeItem(item, rng);
const newVault = spend(state.vault, cost);

let nextStash = state.stash;
let nextRoster = state.roster;

if (location.kind === 'stash') {
  nextStash = addItems(removeItem(state.stash, item.id), [upgraded]);
} else {
  const hero = listHeroes(state.roster).find((h) => h.id === location.heroId);
  if (!hero) return;  // defensive
  const { hero: nextHero } = equip(hero, upgraded, location.slot);
  nextRoster = updateHero(state.roster, nextHero);
}

appState.update((s) => ({
  ...s,
  vault: newVault,
  stash: nextStash,
  roster: nextRoster,
}));

this.rebuild();
```

Rationale:

- **Stash path:** `removeItem` then `addItems` — same shape used in Equip-panel mid-run flows.
- **Equipped path:** `equip(hero, upgraded, slot)` returns `{ hero, displaced }`; `displaced` is the *old* item, which we drop on the floor (the Blacksmith consumed it). Then `updateHero` to write the hero back.
- The `Math.random()`-seeded RNG is non-deterministic but doesn't need to be — Blacksmith outcomes don't affect run determinism (no `runRngState` is touched). Same approach as Tavern recruitment.
- Defensive checks (hero existence, gold balance) mirror Hospital's pattern.

## 9 · Files touched

| File | Change |
|---|---|
| `src/data/blacksmith.ts` | **New.** `BLACKSMITH_UPGRADE_COST` constant. |
| `src/items/upgrade.ts` | **New.** `nextRarity`, `canUpgrade`, `upgradeCost`, `upgradeItem`, plus private `rollNewAffix`. |
| `src/items/__tests__/upgrade.test.ts` | **New.** ~8 deterministic test cases. |
| `src/dungeon/loot.ts` | Promote `pickAffixes`, `rollAffixValue`, `pickRareProperty` to `export`. |
| `src/scenes/blacksmith_panel_scene.ts` | **New.** The Blacksmith panel scene. |
| `src/scenes/camp_scene.ts` | Add `'Blacksmith'` `buildBuilding` call between Tavern and Barracks. |
| `src/main.ts` | Import `BlacksmithPanelScene`; add to scene list. |

## 10 · Save schema

No schema change. `vault`, `stash`, `roster` are all existing persisted state with existing operations (`spend`, `addItems`/`removeItem`, `equip`/`updateHero`).

## 11 · Test plan

**Core (`src/items/__tests__/upgrade.test.ts`):** the 8 cases from §6.

**Scene layer:** no automated tests (Phaser convention). Manual play verification:

- Blacksmith tile is clickable on camp; opens the panel.
- List shows stash items + equipped items, with rare items hidden.
- Selecting a row shows the detail preview (current → target rarity, "what changes").
- Upgrading a stash item with sufficient gold: deducts gold, replaces stash item with one at bumped rarity, rebuilds list.
- Upgrading an equipped item: hero's equipment slot now holds the upgraded item; old item is gone.
- Insufficient gold: button greyed; click is no-op.
- Up/down paging arrows work; clamp at start/end.
- Empty state ("No items can be upgraded.") renders when stash is empty and all equipped items are rare.
- ESC and × close the panel back to camp.
- Stat preview in Barracks reflects the upgraded item's affixes after a roundtrip.

## 12 · Open questions

None. Cost knobs (`100g`, `300g`) and color/layout constants are tunable from single sites if balance shifts.
