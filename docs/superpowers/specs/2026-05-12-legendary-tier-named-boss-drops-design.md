# Legendary tier + L10 milestone + named boss drops — design spec

**Date:** 2026-05-12
**Status:** Draft, awaiting review
**Source:** Brainstorm 2026-05-12, decomposed from the broader "legendary gear + L10 milestone" scope (TODO Cluster D · 9).

## Summary

Add `'legendary'` as the fifth and final `Rarity` tier. Author 4 hand-crafted named legendary items (2 per existing boss: Bone Lich, Drowned King). Wire a new `'first_hero_l10'` milestone that fires when any party hero crosses Level 10 — this milestone flips a `SaveFile.unlocks.legendaryEnabled` flag that hard-gates legendary drops. Post-milestone, every final-boss kill produces a guaranteed named legendary (one of the boss's 2 items at random). Legendary is the upgrade-chain cap (no Blacksmith path to it; obtainable only via boss drops).

This is **Spec 3 of 4** in the legendary cascade. Spec 1 (MAX_LEVEL+L10 perks) and Spec 2 (Epic tier) both shipped 2026-05-12 and are prerequisites. Sister Spec 4 (random legendaries + curated passive pool) is gated on this one.

## In scope

- Widen `Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'`.
- Add `LegendaryId` union with 4 ids: `'lichs_crown' | 'phylactery' | 'tidewalker_helm' | 'kings_aegis'`.
- `Item.legendaryId?: LegendaryId` — new optional field. When set: `rarity === 'legendary'`, `affixes: []`, no `rareProperty`. Stats and passive looked up from `LEGENDARY_DEFS`.
- New `LEGENDARY_DEFS: Record<LegendaryId, LegendaryDef>` — fixed stats + flavor + slot + baseId + `triggeredEffect` per item. Reuses Spec 1's perk trigger/action palette.
- New `BOSS_LEGENDARIES: Record<EnemyId, readonly LegendaryId[]>` — maps each legendary-dropping boss to its 2-item pool.
- `MilestoneId` gains `'first_hero_l10'`.
- `Unlocks` gains `legendaryEnabled: boolean`.
- New `detectXpMilestones(partyBefore, partyAfter, unlocks)` function in `src/run/milestones.ts`; called from the two XP-grant sites in `run_state.ts`.
- `rollLoot` substitution: post-milestone, final-boss kills return a `rollNamedLegendary(rng, bossId, floor)` instead of the normal next-floor rarity-table roll.
- `SELL_VALUE.legendary = 500`.
- `NEXT_RARITY.legendary = null` (legendary is also a cap). `NEXT_RARITY.epic` stays `null` (Blacksmith can't reach legendary).
- `BLACKSMITH_UPGRADE_COST` value type widens exclude to `Exclude<Rarity, 'common' | 'legendary'>` — no legendary upgrade cost.
- `RARITY_COLOR_HEX.legendary = '#ff8800'`, `RARITY_COLOR_NUM.legendary = 0xff8800` (classic orange).
- Blacksmith UI sell-confirm gate widens to include legendary (dynamic dialog text already handles all rarities).
- Status synthesizer gains `case 'drowning'` mapping for King's Aegis's applyStatus action.
- Save migration v6 → v7: backfill `unlocks.legendaryEnabled = false` for existing saves.

## Out of scope (deferred)

- **Random legendaries from non-boss content** — Spec 4 (TODO Cluster D · 10).
- **Curated unique-passive pool for random legendaries** — Spec 4.
- **Bespoke sprites for named legendaries** — Cluster C art polish. This spec uses each legendary's existing-baseId sprite. The rarity color border (orange) is the legendary-tier visual cue.
- **Drowned King boss bespoke sprite** — already Cluster C · 3.
- **Tier 3/4 dungeon bosses** (Warren, Abyss) — `BOSS_LEGENDARIES` will gain entries when those dungeons ship.

## The 4 named legendaries

| Id | Name | Slot | Boss | Stats | Passive |
|---|---|---|---|---|---|
| `lichs_crown` | Lich's Crown | hat | Bone Lich | +5 Mind, +5% Crit | `onKill` → `gainStat mind +2, duration 3, stacking true` (max 5) |
| `phylactery` | Phylactery | outfit | Bone Lich | +15 HP, +2 Defense | `onStruck` → `applyStatus 'rotting', target 'other', duration 2, payload damagePerTurn 3` |
| `tidewalker_helm` | Tidewalker Helm | hat | Drowned King | +5 HP, +3 Defense | `whenBelowHp ratio 0.5` → `gainStat defense +4` |
| `kings_aegis` | King's Aegis | shield | Drowned King | +10 HP, +3 Defense | `onStruck` → `applyStatus 'drowning', target 'other', duration 3, payload damagePerTurn 3` |

**Flavor (tooltip strings):**
- *Lich's Crown:* "A circlet of bleached vertebrae, still humming with the lich's hunger."
- *Phylactery:* "A glass vial of black ichor; the lich's life force trapped in glass that never breaks."
- *Tidewalker Helm:* "A waterlogged crown of brass and barnacle, heavier than it looks."
- *King's Aegis:* "A scarred boss-shield etched with sigils that still drip seawater."

**Slot rationale:** 2 hats, 1 outfit, 1 shield. All universal-equipable (no weaponType constraint). Class coverage: every class has at least one strongly-desired drop (casters → Lich's Crown; tanks → all 4 are good; melee DPS → Phylactery or Tidewalker; ranged → Lich's Crown for crit, Tidewalker for survivability).

**baseId for sprite lookup:**
- `lichs_crown` → `'hat_hood'` (hood reads as lich-y)
- `phylactery` → `'outfit_cloth'`
- `tidewalker_helm` → `'hat_cap'`
- `kings_aegis` → `'shield_basic'`

Each legendary renders with its baseId's existing frame plus the orange rarity border. Bespoke art is a Cluster C follow-up.

## Type system additions

```ts
// src/data/types.ts

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type LegendaryId =
  | 'lichs_crown'
  | 'phylactery'
  | 'tidewalker_helm'
  | 'kings_aegis';

export interface LegendaryDef {
  id: LegendaryId;
  name: string;
  flavor: string;
  slot: ItemSlot;
  baseId: ItemBaseId;
  stats: Partial<Record<BuffableStat, number>>;
  hpBonus?: number;
  triggeredEffect: TriggeredEffect;
}

export type MilestoneId =
  | 'first_crypt_clear'
  | 'first_sunken_keep_clear'
  | 'first_hero_l10';

export interface Unlocks {
  classes: readonly ClassId[];
  dungeons: readonly DungeonId[];
  buildings: readonly BuildingId[];
  legendaryEnabled: boolean;
}

export interface Item {
  // ... existing fields unchanged ...
  readonly legendaryId?: LegendaryId;
}
```

## LEGENDARY_DEFS

Lives at `src/data/legendaries.ts` (new file):

```ts
import type { LegendaryDef, LegendaryId } from './types';

export const LEGENDARY_DEFS: Record<LegendaryId, LegendaryDef> = {
  lichs_crown: {
    id: 'lichs_crown',
    name: "Lich's Crown",
    flavor: "A circlet of bleached vertebrae, still humming with the lich's hunger.",
    slot: 'hat',
    baseId: 'hat_hood',
    stats: { mind: 5, crit: 5 },
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'mind', delta: 2, duration: 3, stacking: true },
    },
  },
  phylactery: {
    id: 'phylactery',
    name: 'Phylactery',
    flavor: "A glass vial of black ichor; the lich's life force trapped in glass that never breaks.",
    slot: 'outfit',
    baseId: 'outfit_cloth',
    stats: { defense: 2 },
    hpBonus: 15,
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: {
        kind: 'applyStatus', statusId: 'rotting', duration: 2, target: 'other',
        payload: { damagePerTurn: 3 },
      },
    },
  },
  tidewalker_helm: {
    id: 'tidewalker_helm',
    name: 'Tidewalker Helm',
    flavor: 'A waterlogged crown of brass and barnacle, heavier than it looks.',
    slot: 'hat',
    baseId: 'hat_cap',
    stats: { defense: 3 },
    hpBonus: 5,
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'defense', delta: 4 },
    },
  },
  kings_aegis: {
    id: 'kings_aegis',
    name: "King's Aegis",
    flavor: 'A scarred boss-shield etched with sigils that still drip seawater.',
    slot: 'shield',
    baseId: 'shield_basic',
    stats: { defense: 3 },
    hpBonus: 10,
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: {
        kind: 'applyStatus', statusId: 'drowning', duration: 3, target: 'other',
        payload: { damagePerTurn: 3 },
      },
    },
  },
};

export const BOSS_LEGENDARIES: Partial<Record<EnemyId, readonly LegendaryId[]>> = {
  bone_lich: ['lichs_crown', 'phylactery'],
  drowned_king: ['tidewalker_helm', 'kings_aegis'],
};
```

`Partial<Record<EnemyId, readonly LegendaryId[]>>` because only bosses with named legendaries appear in the record; the lookup site checks for `undefined` to fall through to normal loot.

## L10 milestone wiring

**Add to `src/run/milestones.ts`:**

```ts
import type { Hero } from '@heroes/hero';

/** Detects XP-grant-driven milestones (currently just first_hero_l10). */
export function detectXpMilestones(
  partyBefore: readonly Hero[],
  partyAfter: readonly Hero[],
  unlocks: Unlocks,
): readonly MilestoneId[] {
  if (unlocks.legendaryEnabled) return [];
  const crossed = partyAfter.some((h, i) =>
    h.level >= 10 && partyBefore[i].level < 10,
  );
  return crossed ? ['first_hero_l10'] : [];
}

// Inside MILESTONES record:
first_hero_l10: (state) => {
  if (state.unlocks.legendaryEnabled) return state;
  return {
    ...state,
    unlocks: { ...state.unlocks, legendaryEnabled: true },
  };
},
```

**Call sites in `src/run/run_state.ts`:**
- `completeCombat` around line 285 (after `applyLevelUps`): capture `partyBefore` (the party-living slice pre-XP) and `partyAfter` (the post-applyLevelUps party); call `detectXpMilestones(partyBefore, partyAfter, unlocks)`; push detected ids onto `runState.pendingMilestones` alongside any boss-clear milestones from `detectBossMilestones`.
- `completeSurpriseCombat` around line 417: same pattern.

The existing pending-milestones drain path (probably at run-end or cashout, per Spec 1's pattern) applies the milestone via `applyPendingMilestones`, which calls the new `first_hero_l10` handler.

## Boss-drop substitution

**Add to `src/dungeon/loot.ts`:**

```ts
import { LEGENDARY_DEFS, BOSS_LEGENDARIES } from '@data/legendaries';

function rollNamedLegendary(rng: Rng, legendaryId: LegendaryId, floor: number): Item {
  const def = LEGENDARY_DEFS[legendaryId];
  return {
    id: generateItemId(rng),
    baseId: def.baseId,
    slot: def.slot,
    rarity: 'legendary',
    affixes: [],
    floorRolledAt: floor,
    legendaryId,
  };
}
```

**Modify `rollLoot` signature:**

```ts
export function rollLoot(
  rng: Rng,
  floorNumber: number,
  kind: LootKind,
  tier: DungeonTier = 1,
  legendaryEnabled = false,
  bossId?: EnemyId,
): Item | null {
  // existing combat-drop gate
  if (kind === 'combat' && rng.next() >= 0.1) return null;

  // NEW: post-L10 named legendary substitution
  if (kind === 'boss' && legendaryEnabled && bossId) {
    const pool = BOSS_LEGENDARIES[bossId];
    if (pool && pool.length > 0) {
      return rollNamedLegendary(rng, rng.pick(pool), floorNumber);
    }
  }

  // ... existing rollLoot body (rarity roll, slot, affixes, etc.) ...
}
```

**Caller update in `src/run/run_state.ts:291`:**

```ts
// Before:
const drop = rollLoot(rng, runState.currentFloorNumber, kind, dungeonTierOf(runState));

// After (only for boss kinds — extract bossId from encounter):
const drop = rollLoot(
  rng,
  runState.currentFloorNumber,
  kind,
  dungeonTierOf(runState),
  state.unlocks.legendaryEnabled,
  kind === 'boss' ? bossEnemyIdFrom(runState) : undefined,
);
```

`bossEnemyIdFrom(runState)` reads the current node's encounter to find the boss enemy id. Implementation detail; verify the encounter shape during implementation.

`completeSurpriseCombat` doesn't drop boss-tier loot (surprise combats aren't bosses), so no `bossId` needed there — pass `legendaryEnabled` and `undefined` for safety.

## Synthesizer extension

**Modify `src/combat/perk_hooks.ts:synthesizeStatusEffect`:**

```ts
case 'drowning':
  return {
    kind: 'poison',
    damagePerTurn: payload?.damagePerTurn ?? DEFAULT_POISON_DAMAGE_PER_TURN,
    duration,
    statusId,
  };
```

Single-line addition (extends the existing `'poisoned' | 'burning' | 'rotting'` fall-through). Reuses the same `DEFAULT_POISON_DAMAGE_PER_TURN` constant.

## Sell value + upgrade chain

```ts
// src/items/sell.ts
const SELL_VALUE: Record<Rarity, number> = {
  common: 10, uncommon: 30, rare: 80, epic: 200, legendary: 500,
};

// src/items/upgrade.ts
const NEXT_RARITY: Record<Rarity, Exclude<Rarity, 'common'> | null> = {
  common: 'uncommon',
  uncommon: 'rare',
  rare: 'epic',
  epic: null,        // unchanged — Blacksmith caps at epic
  legendary: null,
};

// src/data/blacksmith.ts — exclude widens
export const BLACKSMITH_UPGRADE_COST: Record<Exclude<Rarity, 'common' | 'legendary'>, number> = {
  uncommon: 100,
  rare: 300,
  epic: 900,
};
```

`canUpgrade(legendary_item)` returns `false` (via `nextRarity === null`). `canUpgrade(epic_item)` also returns `false` — unchanged from Spec 2.

## UI

**`src/render/rarity_colors.ts`:**

```ts
export const RARITY_COLOR_HEX: Record<Rarity, string> = {
  common: '#cccccc', uncommon: '#4488ff', rare: '#ffcc66',
  epic: '#a060ff', legendary: '#ff8800',
};
export const RARITY_COLOR_NUM: Record<Rarity, number> = {
  common: 0xcccccc, uncommon: 0x4488ff, rare: 0xffcc66,
  epic: 0xa060ff, legendary: 0xff8800,
};
```

**`src/scenes/blacksmith_panel_scene.ts:685` (sell-confirm gate):**

```ts
if (item.rarity === 'rare' || item.rarity === 'epic' || item.rarity === 'legendary') {
  // confirm dialog
}
```

Dialog title already uses `\`Sell ${item.rarity} item?\`` (Task 5 of Spec 2) — handles all rarities.

**Tooltip rendering** (Item tooltip / Equip panel): when `item.legendaryId` is set, display the legendary's `name` instead of the baseId's display name, and include the flavor text. Find the tooltip render path during implementation; minimal surgery expected.

## Save migration v6 → v7

```ts
// src/save/migration.ts — CURRENT_SCHEMA_VERSION = 7

// v6 → v7: introduce unlocks.legendaryEnabled (default false).
// Legendary tier + L10 milestone spec, 2026-05-12.
6: (raw) => {
  const out: Record<string, unknown> = { ...raw, version: 7 };
  const unlocks = out.unlocks as Record<string, unknown> | undefined;
  if (unlocks && typeof unlocks.legendaryEnabled !== 'boolean') {
    out.unlocks = { ...unlocks, legendaryEnabled: false };
  }
  return out;
},
```

Existing items in saves don't need migration — they're all non-legendary (Spec 2's Epic widening didn't require migration either, same reasoning).

## Testing strategy

### Updates to existing tests

- `MilestoneId` test (if it exists) — add `'first_hero_l10'` to the expected list.
- `Unlocks` interface test — add `legendaryEnabled: false` to default shape.
- `BLACKSMITH_UPGRADE_COST` shape test — verify exclude widening; no legendary key.
- `SELL_VALUE` test — add `legendary: 500`.
- `NEXT_RARITY` test — `nextRarity('epic')` still `null`; `nextRarity('legendary')` is `null`.

### New tests

| Area | Coverage |
|---|---|
| L10 milestone detection | `detectXpMilestones` returns `['first_hero_l10']` when any hero crosses 9→10; returns `[]` if unlocks already enabled (idempotency); returns `[]` if no hero crosses; returns `['first_hero_l10']` even if only one of several heroes crossed |
| Handler | `MILESTONES.first_hero_l10` flips `unlocks.legendaryEnabled` from false to true; idempotent on already-true |
| `rollLoot` boss substitution | With `legendaryEnabled: true, bossId: 'bone_lich'`, returns an item with `legendaryId in ['lichs_crown', 'phylactery']`; with `legendaryEnabled: false`, returns normal loot (no legendaryId); 1000 samples produce roughly 50/50 split between the 2 ids |
| `rollNamedLegendary` | Constructs an Item with the right `legendaryId`, `rarity: 'legendary'`, `affixes: []`, `slot` and `baseId` from the def, fresh id from rng |
| LEGENDARY_DEFS shape | All 4 entries have non-empty name, flavor, slot, baseId, triggeredEffect with valid trigger+action |
| BOSS_LEGENDARIES shape | bone_lich + drowned_king present; each maps to exactly 2 legendary ids; future-boss entries absent |
| Synthesizer 'drowning' | `synthesizeStatusEffect('drowning', 3, { damagePerTurn: 3 })` returns `kind: 'poison'` with the right fields |
| Sell value | `itemSellValue` returns 500 for a legendary item |
| Save migration v6 → v7 | Backfills `legendaryEnabled: false`; idempotent on v7 saves |
| Rarity colors | hex + num records both have `legendary` key |
| Blacksmith sell-confirm | Triggers for legendary items (alongside rare and epic) |
| Per-legendary integration | For each of 4 legendaries: equip onto a hero, drive a combat that triggers its passive, verify the expected effect (e.g., Lich's Crown stack on kill; Phylactery rotting on attacker; Tidewalker Helm aura at low HP; King's Aegis drowning on attacker) |

## Risks

- **`bossEnemyIdFrom(runState)` plumbing.** Need to extract the boss enemy id from the current encounter at the loot site. Verify the encounter shape exposes this directly. If not, the encounter resolution may need a small helper.
- **Pre-L10 boss loot policy unchanged.** Bosses still drop next-floor rarity-table rolls before the milestone flips. Spec 2's Epic tier already populated that pool. No regression risk.
- **Random pick from 2-item pool determinism.** `rng.pick(pool)` is consistent with existing usage; tests should use fixed seeds.
- **Tooltip render path discovery.** The Equip panel and item tooltip render baseId display names today; the legendary name override needs to land in 1-2 places. Likely small; verify during implementation.
- **Future Warren / Abyss bosses.** `BOSS_LEGENDARIES` is `Partial<Record<EnemyId, ...>>` — bosses without legendaries fall through to normal loot. When Warren/Abyss arrive, adding entries is a localized data edit.
- **Detection only fires on level-crossing transitions.** A hero hired *at* L10 (e.g., a future Tavern pre-leveled extension to L10) would never cross 9→10 and wouldn't trigger the milestone. Not an issue today (Tavern pre-leveled caps at L3); flag if Tavern ever extends past L10. Fix would be a defensive scan at hire time, or change detection to `partyAfter.some(h => h.level >= 10) && partyBefore.every(h => h.level < 10)`.

## Decisions

- **Hard L10 milestone gate.** Pre-L10 bosses drop normal next-floor rarity-table loot (Epic eligible). Post-L10, every final-boss kill drops a guaranteed named legendary.
- **100% drop rate with duplicates allowed** (not unique-per-save or hybrid). Per-kill model. Players who farm get duplicates → sell for vault gold.
- **2 named legendaries per boss, random of 2.** Pool size matches the Sunken Keep cascade's "give the player options" pattern.
- **Fixed stats per legendary.** Not rolled. Each legendary IS the legendary, predictable across kills.
- **No Blacksmith path to legendary.** `NEXT_RARITY.epic` stays `null` from Spec 2. Legendary is boss-drop-only. Players can't grind any epic into a legendary via gold.
- **All 4 slots universal-equipable** (no weaponType constraints). 2 hats / 1 outfit / 1 shield distribution. Class coverage achieved via stat/passive variety, not slot variety.
- **Reused baseId sprites.** Bespoke art deferred to Cluster C. Orange rarity border is the legendary visual cue.
- **Detection via `detectXpMilestones`, parallel to `detectBossMilestones`.** Same pattern; new function for clarity. Idempotent guard: `if (unlocks.legendaryEnabled) return []`.
- **`SELL_VALUE.legendary = 500`** (continues 10/30/80/200/500 geometric). Farming bosses for gold becomes meaningful at ~500g per kill.
- **`'drowning'` statusId mapping** added to synthesizer (single line). The id already exists in the StatusId union; we're just registering the AbilityEffect shape it produces.

## Follow-ups

To go into TODO entries when this ships:

- **Sister Spec 4 (TODO Cluster D · 10)** — random legendaries from non-boss content + curated unique-passive pool. Reuses this spec's `legendaryId` discriminator pattern (absence of `legendaryId` = random legendary; presence = named).
- **Bespoke sprites for named legendaries** — Cluster C art polish. Each legendary's `baseId` is its current sprite; a `LegendaryDef.spriteId?` override field could be added later if Cluster C wants bespoke art.
- **Tooltip flavor text rendering** — the Equip panel needs to surface `flavor` field text. Minor UI polish.
- **Future-boss BOSS_LEGENDARIES entries** when Warren / Abyss arrive.
