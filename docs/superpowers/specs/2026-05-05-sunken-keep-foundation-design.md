# Sunken Keep — Spec 1: Foundation + Milestone Plumbing

**Date:** 2026-05-05
**Status:** Locked design, ready for implementation plan
**Related TODO:** Cluster D · 1 (Sunken Keep)
**Decomposed from:** the full Sunken Keep TODO entry, split per the brainstorm Q1 decision into:

- **Spec 1 (this doc):** dungeon-agnostic foundation — `tier` field + balance plumbing + multi-dungeon Expeditions UI + milestone registry pattern with no handlers wired.
- **Spec 2 (future):** Sunken Keep content — `'sunken_keep'` `DungeonId`, `DUNGEONS['sunken_keep']` entry, 4 minion enemies + 1 boss, abilities, AI priorities, sprite mappings, art, and the `'first_crypt_clear'` milestone handler.

## Why

The Crypt is the only dungeon. Adding the Sunken Keep requires:

1. A `tier` concept that drives balance differences (gdd §5: nodes per floor, scaling rate, loot quality, gold multiplier).
2. Multi-dungeon UI (the Expeditions panel currently hardcodes a single Crypt card).
3. A milestone-unlock system (gdd §9): "first Crypt clear → unlock Sunken Keep", and later Paladin/Hunter/Chapel/Training Grounds/Sunken Keep gear tier on subsequent firsts.

None of this exists today. Doing it as part of the Sunken Keep content drop would create a single spec spanning data + balance + UI + content + art — too large to review and execute as one unit. Spec 1 lands the dungeon-agnostic plumbing; spec 2 drops in the new dungeon as strictly additive content. The milestone registry, balance API, and Expeditions UI are reviewed once, on plumbing-only PRs that leave today's behavior byte-identical.

## Scope summary

**In scope (this spec):**

- `DungeonDef.tier` field + tier render in Expeditions card (closes Cluster B · 18 HISTORY's deferred tier label).
- Field rename `DungeonDef.floorLength` → `floorsPerRun`; add optional `DungeonDef.rowsPerFloor`.
- `tier` parameter threaded through `floorScale`, `pickRarity`, `rollLoot`, `rollShopItem`, `rollEventItem`. New `goldMultiplier(tier)` helper applied at all gold-grant sites.
- Milestone registry module (`src/run/milestones.ts`) with empty `MILESTONES` record and `MilestoneId = never`.
- `RunState.pendingMilestones` field; populated in `completeCombat` on canonical-final-boss defeat; drained in `cashout` and the wipe path of `completeCombat`. `outcome.milestonesTriggered` extension on `CashoutOutcome` and the wipe outcome.
- Multi-dungeon Expeditions UI: vertical-list layout, locked-card rendering, dungeon-aware party-picker title.
- `EnemySprite.setLocked()` method for silhouetting locked-card enemy previews.
- `RunState` save normalizer one-line addition for `pendingMilestones` defaulting.

**Out of scope (deferred to spec 2 or later):**

- `'sunken_keep'` `DungeonId`, `DUNGEONS['sunken_keep']` entry, enemy data, boss data, sprites, art.
- `'first_crypt_clear'` milestone handler (MilestoneId stays `never` in spec 1).
- Paladin class (gdd §9 first-Crypt-clear effect).
- Tier-2 specific balance numbers — `TIER_SCALING_SLOPE[2]`, `TIER_RARITY_FLOOR_BONUS[2]`, `TIER_GOLD_MULTIPLIER[2]` ship as no-ops (= tier-1 values) in spec 1; spec 2 picks the real numbers.
- Per-tier color palette for the tier badge — spec 1 ships a placeholder; spec 2 picks the colors.
- Hunter, Chapel, Training Grounds, Sunken Keep gear tier (all gate on first Sunken Keep clear; not relevant in spec 1).
- Non-cashout milestones (Level 10, 25 crits) — different observers, separate spec when they're built.

## Locked decisions (brainstorm log)

| # | Question | Decision |
|---|---|---|
| Q1 | Decomposition: how many specs and how split? | **B** — two specs: foundation + milestone first, then content + art. |
| Q2 | Reconcile gdd's "nodes per floor" with current 8+(f−1) generator. | **A** — rename `floorLength` → `floorsPerRun`; add tier-modulated `rowsPerFloor` knob (Crypt = 8, Sunken Keep = TBD in spec 2); reinterpret gdd §4 as directional. |
| Q3 | Which balance dimensions does tier parameterize? | **A** — all four (rows, scaling rate, loot quality, gold multiplier). Tier=1 is identity; tier-2 numbers ship in spec 2. |
| Q4 | How much of the milestone system does spec 1 ship? | **B** — registry pattern, no handlers wired in spec 1. Spec 2 registers `first_crypt_clear → unlock sunken_keep` along with its content. |
| Q5 | Where does multi-dungeon Expeditions UI live? | **A** — spec 1 owns the UI plumbing. Renders 1 card today identically to current; layout function tested with synthetic 2-dungeon fixture. Spec 2 just adds the dungeon entry. |
| Q6 | When does a milestone fire? | **A** — fire on canonical-final-boss defeat, captured on `RunState.pendingMilestones`, applied at run-end (cashout AND wipe). Press-on-after-boss-then-wipe still credits the clear. |
| sub | Does the gold multiplier affect shop prices? | **No** — multiplier applies to grants only. Higher-tier shops feel cheaper relative to grants, not just bigger numbers. |
| sub | Locked-card enemy preview style? | **Silhouettes from the start** — `setTint(0x000000)` + reduced alpha on the EnemySprite children. |
| sub | `cashout` SaveFile coupling? | **Stays pure** — `cashout` keeps its `(runState) → { runState, outcome }` shape; `outcome.milestonesTriggered: MilestoneId[]` is the new field; scene-level callers apply via `applyPendingMilestones(saveFile, ids)` in their existing `appState.update` block. |

## Architecture

Five layers touched, all behind the existing Phaser firewall.

| Layer | Files | Role |
|---|---|---|
| **Data types** | `src/data/types.ts` | Add `tier: 1\|2\|3\|4` and rename `floorLength` → `floorsPerRun` on `DungeonDef`; add optional `rowsPerFloor?: number` and `unlockRequirement?: string`; add `MilestoneId = never`. |
| **Data values** | `src/data/dungeons.ts` | Crypt entry: `tier: 1`, rename field, leave `rowsPerFloor` and `unlockRequirement` unset. |
| **Balance** | `src/dungeon/scaling.ts`, `loot.ts`, `floor.ts` | Thread `tier` through `floorScale(floor, tier)`, `rollLoot(rng, floor, kind, tier)`, `pickRarity(rng, floor, tier)`, `rollShopItem(rng, slot, floor, tier)`, `rollEventItem(rng, floor, rarity, tier)`. Add `goldMultiplier(tier)` and apply at all gold-grant sites. Generator reads `(dungeon.rowsPerFloor ?? 8) + (floor − 1)`. Tier=1 is identity for every function. |
| **Milestones** | new `src/run/milestones.ts` | Registry pattern: `MILESTONES: Record<MilestoneId, MilestoneHandler>` (empty); `detectBossMilestones(dungeonId, floorNumber, alreadyFired)` returns triggered ids (returns `[]` everywhere in spec 1); `applyPendingMilestones(state, ids)` runs handlers (no-op in spec 1). |
| **Run state** | `src/run/run_state.ts` | Add `pendingMilestones: readonly MilestoneId[]` on RunState (default `[]`); populate in `completeCombat` when `kind === 'boss'` AND `floorNumber === DUNGEONS[dungeonId].floorsPerRun`; drain in `cashout` (returned via `outcome.milestonesTriggered`) and in the wipe branch of `completeCombat`. |
| **Save** | `src/save/save.ts` | One-line addition to `normalizeSaveFile` for `pendingMilestones` defaulting. No schema bump. |
| **UI** | `src/scenes/expeditions_panel_scene.ts`, `src/render/enemy_sprite.ts` | Refactor Expeditions to render N cards from `Object.values(DUNGEONS)` against `unlocks.dungeons`. Tier badge on each card. Locked-card rendering path. Party-picker title becomes dungeon-aware. New `EnemySprite.setLocked()` method tints children for silhouette rendering. |

**Test-coverage philosophy:** tier=1 calls of every parameterized function must produce byte-identical RNG output to today. Locked in by (a) keeping all existing test snapshots passing unchanged, (b) adding tier=1 default-arg assertions wherever a tier parameter is added, (c) one new "tier=2 differs from tier=1" smoke test per parameterized function, using a synthetic dungeon fixture to override `TIER_SCALING_SLOPE[2]` etc.

## Data model changes

**`src/data/types.ts`:**

```typescript
export type DungeonId = 'crypt';  // unchanged in spec 1
export type DungeonTier = 1 | 2 | 3 | 4;

export interface DungeonDef {
  id: DungeonId;
  name: string;
  theme: string;
  tier: DungeonTier;             // NEW — required
  floorsPerRun: number;          // RENAMED from floorLength
  rowsPerFloor?: number;         // NEW — optional, defaults to 8 in generator
  enemyPool: readonly EnemyId[];
  bossId: EnemyId;
  unlockRequirement?: string;    // NEW — human-readable string for locked card; Crypt unset (always unlocked)
}

export type MilestoneId = never;  // empty in spec 1; spec 2 introduces 'first_crypt_clear'
```

Empty `MilestoneId` union is intentional — registry compiles to `Record<never, ...> = {}`, dispatch typechecks against future ids without naming any today, and adding ids in spec 2 is a one-line edit.

**`src/data/dungeons.ts`:**

```typescript
export const DUNGEONS: Record<DungeonId, DungeonDef> = {
  crypt: {
    id: 'crypt',
    name: 'The Crypt',
    theme: 'Undead ruins',
    tier: 1,
    floorsPerRun: 3,
    enemyPool: CRYPT_POOL,
    bossId: CRYPT_BOSS,
  },
};
```

**`src/run/run_state.ts`:**

```typescript
interface RunState {
  // ...existing fields...
  pendingMilestones: readonly MilestoneId[];  // NEW — default []
}

export interface CashoutOutcome {
  // ...existing fields...
  milestonesTriggered: readonly MilestoneId[];  // NEW
}

// (Wipe outcome on completeCombat also gains milestonesTriggered.)
```

**`src/save/save.ts` — `normalizeSaveFile` one-line:**

```typescript
runState: file.runState === undefined ? undefined : {
  ...file.runState,
  // existing defaults...
  pendingMilestones: file.runState.pendingMilestones ?? [],
}
```

**`SaveFile` shape unchanged.** `unlocks.dungeons: ['crypt']` from `createDefaultUnlocks()` is unchanged in spec 1; spec 2's milestone handler will mutate `unlocks.dungeons` to add `'sunken_keep'`.

## Tier-aware balance API

### Row count (`floor.ts`)

One-line change in `tryGenerateFloor`:

```typescript
const rowCount = (dungeon.rowsPerFloor ?? 8) + (floorNumber - 1);
```

Crypt with `rowsPerFloor` unset → 8/9/10 rows, identical to today. The Phase 2b quota generator's feasibility (1 shop + 1 camp + 1–2 treasure + 1–2 event + 1–2 elite + filler combat) depends on row count; spec 2 picks Sunken Keep's `rowsPerFloor` carefully to keep the quota feasible.

### Scaling rate (`scaling.ts`)

```typescript
export function floorScale(floor: number, tier: DungeonTier = 1): ScaleFactors {
  if (floor < 1) throw new Error(`floorScale: floor must be >= 1, got ${floor}`);
  const slope = TIER_SCALING_SLOPE[tier];
  const mult = 1 + slope * (floor - 1);
  return { hp: mult, attack: mult };
}

const TIER_SCALING_SLOPE: Record<DungeonTier, number> = {
  1: 0.10,  // today's value
  2: 0.10,  // placeholder — spec 2 picks the real value
  3: 0.10,
  4: 0.10,
};
```

Default `tier = 1` covers callers not yet threaded.

### Loot quality (`loot.ts`)

`pickRarity` and `rollLoot` shift the *effective floor* used for the rarity table lookup at higher tiers. Same `RARITY_TABLE`, no per-tier table duplication.

```typescript
function rarityWeightsAt(floor: number, tier: DungeonTier): { common: number; uncommon: number; rare: number } {
  const effectiveFloor = floor + TIER_RARITY_FLOOR_BONUS[tier];
  // ...existing lerp logic against RARITY_TABLE, using effectiveFloor
}

const TIER_RARITY_FLOOR_BONUS: Record<DungeonTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

export function pickRarity(rng: Rng, floor: number, tier: DungeonTier = 1): Rarity { /* ... */ }

export function rollLoot(rng: Rng, floor: number, kind: LootKind, tier: DungeonTier = 1): Item | null { /* ... */ }

export function rollShopItem(rng: Rng, slot: ItemSlot, floor: number, tier: DungeonTier = 1): Item { /* ... */ }

export function rollEventItem(rng: Rng, floor: number, rarity: Rarity, tier: DungeonTier = 1): Item { /* ... */ }
```

### Gold multiplier (new helper in `scaling.ts`)

```typescript
export function goldMultiplier(tier: DungeonTier): number {
  return TIER_GOLD_MULTIPLIER[tier];
}

const TIER_GOLD_MULTIPLIER: Record<DungeonTier, number> = { 1: 1, 2: 1, 3: 1, 4: 1 };
```

Applied at gold-grant sites only (not shop prices — shop prices stay flat at higher tier so higher-tier dungeons feel relatively richer):

| Site | File | Formula |
|---|---|---|
| Combat-node gold | `run_state.ts` `completeCombat` | `reward = baseGold * floor * goldMultiplier(tier)` |
| Boss-node gold | `run_state.ts` `completeCombat` | `reward = BOSS_NODE_GOLD * floor * goldMultiplier(tier)` |
| Elite-node gold | `run_state.ts` `completeCombat` | `reward = ELITE_NODE_GOLD * floor * goldMultiplier(tier)` |
| Surprise-encounter gold | `dungeon/surprise.ts` | `gold = SURPRISE_GOLD_BASE * floor * goldMultiplier(tier)` |
| Event-card gold rewards | `run/event_resolver.ts` | Multiply payout by `goldMultiplier(tier)` |

Tier is sourced from `DUNGEONS[runState.dungeonId].tier` at every site (RunState already carries `dungeonId`).

## Milestone registry

New module: `src/run/milestones.ts`. Pure-TS, under the firewall.

```typescript
import { DUNGEONS } from '@data/dungeons';
import type { DungeonId, MilestoneId } from '@data/types';
import type { SaveFile } from '@save/save';

export type MilestoneHandler = (state: SaveFile) => SaveFile;

// Spec 1 ships an empty registry. Spec 2 adds 'first_crypt_clear' here
// alongside the DUNGEONS['sunken_keep'] entry.
export const MILESTONES: Record<MilestoneId, MilestoneHandler> = {} as Record<MilestoneId, MilestoneHandler>;

/**
 * Returns the milestone ids triggered by this boss defeat.
 * Called from completeCombat when:
 *   - the defeated encounter's kind is 'boss'
 *   - AND floorNumber === DUNGEONS[dungeonId].floorsPerRun (canonical final boss only)
 */
export function detectBossMilestones(
  dungeonId: DungeonId,
  floorNumber: number,
): readonly MilestoneId[] {
  return [];  // empty in spec 1
}

/**
 * Drains pendingMilestones into SaveFile by running each handler.
 * Idempotent — handlers are responsible for their own no-op-on-repeat logic
 * (e.g., 'first_crypt_clear' handler will check if 'sunken_keep' is already
 * in unlocks.dungeons before adding it).
 */
export function applyPendingMilestones(
  state: SaveFile,
  ids: readonly MilestoneId[],
): SaveFile {
  let next = state;
  for (const id of ids) {
    const handler = MILESTONES[id];
    if (handler) next = handler(next);
  }
  return next;
}
```

**Wiring — populate in `completeCombat`:**

In the boss-victory branch (after the existing reward / loot / fallen-recovery logic):

```typescript
if (isBoss) {
  const def = DUNGEONS[runState.dungeonId];
  const isCanonicalFinal = runState.currentFloorNumber === def.floorsPerRun;
  const triggered = isCanonicalFinal
    ? detectBossMilestones(runState.dungeonId, runState.currentFloorNumber)
    : [];
  return {
    runState: {
      ...runState,
      // existing fields...
      status: 'camp_screen',
      pendingMilestones: [...runState.pendingMilestones, ...triggered],
    },
  };
}
```

The canonical-final-boss gate (`floorNumber === floorsPerRun`) means floor-4+ press-on bosses do NOT credit the clear. Conventional roguelike semantics: the dungeon clears at its canonical length; deeper is bonus.

Wipe path also needs to drain `pendingMilestones`. In `completeCombat`'s wipe branch:

```typescript
if (type === 'wipe') {
  // ...existing wipe logic...
  return {
    runState: { ...runState, /* ... */, status: 'ended', pendingMilestones: [] },
    wipe: { ...wipe, milestonesTriggered: runState.pendingMilestones },
  };
}
```

The `WipeOutcome` interface (alongside `CashoutOutcome`) gains `milestonesTriggered: readonly MilestoneId[]`. Both run-end paths return the same shape for the milestone field, so scene-level orchestration is uniform.

**Invariant — `pendingMilestones` persists across `pressOn`:**

`pressOn` (advance to next floor) does NOT drain `pendingMilestones`. The field persists via the existing `...runState` spread in `pressOn`'s return statement — no explicit handling needed, but the implementation must verify this holds (e.g., by a test asserting that `cashout` after `completeCombat(boss) → pressOn → completeCombat(combat) → cashout` credits the milestone). This is what makes Q6's player-friendly "killed the boss → press on → wipe still credits the clear" semantics work.

**Wiring — drain in `cashout`:**

```typescript
export function cashout(runState: RunState): { runState: RunState; outcome: CashoutOutcome } {
  // existing validation...
  const outcome: CashoutOutcome = {
    // existing fields...
    milestonesTriggered: runState.pendingMilestones,
  };
  return {
    runState: { ...runState, status: 'ended', pendingMilestones: [] },
    outcome,
  };
}
```

**Scene-level orchestration:**

`cashout` stays pure of SaveFile. Scene callers (e.g., `camp_screen_scene.ts`) extend their existing `appState.update` block:

```typescript
const { runState: ended, outcome } = cashout(run);
appState.update((s) => {
  let next = applyCashoutBanking(s, outcome);  // existing
  next = applyPendingMilestones(next, outcome.milestonesTriggered);  // NEW
  return { ...next, runState: undefined, runRngState: undefined };
});
```

Same pattern for the wipe path (any scene that handles wipe outcomes).

## Multi-dungeon Expeditions UI

The current `expeditions_panel_scene.ts` renders one centered Crypt card. Refactor to a vertical-list layout that scales 1→4 dungeons without scrolling.

**Layout:**

```typescript
const CARD_W = 820;
const CARD_H = 96;
const GAP = 12;
// vertical stack centered on PANEL_CY; max 4 cards = 420px < PANEL_H = 460.
```

With **N=1** (Crypt today), the card centers in the panel — visually similar to today's design but in the new compact format. With **N=2–4**, cards stack with consistent gap.

**Card content (unlocked):**

- Top-left: dungeon name (larger font) + tier badge (`T1`/`T2`/`T3`/`T4` in a colored pill — placeholder color in spec 1).
- Top-right: theme + floor count.
- Bottom-left: signature enemy strip (existing logic from current scene, compacted).
- Bottom-right: `▸ Click to plan` prompt.
- Click target: full card; `setInteractive` + hover styling per existing pattern.

**Card content (locked):**

- Background goes darker (`0x141414`); stroke muted.
- Name replaced with `???`; tier badge still shown.
- Theme line replaced with `Unlock by: {def.unlockRequirement}` (sourced from new `DungeonDef` field).
- Enemy strip rendered as **silhouettes**: `EnemySprite.setLocked()` applies `setTint(0x000000)` + `setAlpha(0.7)` to all child sprites (body, weapon, shield, hat, etc.). New method on `EnemySprite`.
- Click is a no-op (no `setInteractive`).

**Source of truth for locked-vs-unlocked:**

```typescript
const allDungeons = Object.values(DUNGEONS);
const unlockedIds = new Set(state.unlocks.dungeons);
const cards = allDungeons.map(def => ({ def, locked: !unlockedIds.has(def.id) }));
```

In spec 1, every entry in `DUNGEONS` is also in `unlocks.dungeons` — no card renders as locked in production. Spec 2's Sunken Keep entry is the first locked card.

**Party-picker title:**

```typescript
private selectedDungeonId: DungeonId = 'crypt';  // default to first unlocked

// in setStage('party_picker'):
const def = DUNGEONS[this.selectedDungeonId];
this.titleText.setText(`${def.name} — Pick Your Party`);

// in descend():
const runState = startRun(this.selectedDungeonId, party, seed, rng);
```

`selectedDungeonId` is captured when the player clicks an unlocked card. Spec 1 only has one option, so the default initialization is sufficient; spec 2's Sunken Keep entry exercises the multi-option flow.

**`EnemySprite.setLocked()` method:**

```typescript
public setLocked(locked: boolean): void {
  const tint = locked ? 0x000000 : 0xffffff;
  const alpha = locked ? 0.7 : 1.0;
  // Apply to all child sprites:
  this.list.forEach((child) => {
    if (child instanceof Phaser.GameObjects.Sprite || child instanceof Phaser.GameObjects.Image) {
      child.setTint(tint).setAlpha(alpha);
    }
  });
}
```

(Exact implementation may differ depending on `EnemySprite`'s child structure; verify at impl-time.)

## Tier-threading catalogue

Comprehensive list of sites that need updating to thread `tier`. Implementation must verify nothing's missed; the existing test snapshots are the regression fixture.

**Sites that gain a `tier` parameter:**

| Site | Source of `tier` | Default |
|---|---|---|
| `floorScale(floor, tier)` in `scaling.ts` | `DUNGEONS[runState.dungeonId].tier` | `1` |
| `pickRarity(rng, floor, tier)` in `loot.ts` | Same | `1` |
| `rollLoot(rng, floor, kind, tier)` in `loot.ts` | Same | `1` |
| `rollShopItem(rng, slot, floor, tier)` in `loot.ts` | Same — caller is `shop.ts` | `1` |
| `rollEventItem(rng, floor, rarity, tier)` in `loot.ts` | Same — caller is `event_resolver.ts` | `1` |
| `goldMultiplier(tier)` (new) | Same | n/a (required) |

**Gold-grant sites (apply `goldMultiplier(tier)` factor):**

| Site | File | Notes |
|---|---|---|
| Combat-node gold | `run_state.ts` `completeCombat` | `reward = baseGold * floor * goldMultiplier(tier)` |
| Boss-node gold | same | `reward = BOSS_NODE_GOLD * floor * goldMultiplier(tier)` |
| Elite-node gold | same | `reward = ELITE_NODE_GOLD * floor * goldMultiplier(tier)` |
| Surprise-encounter gold | `dungeon/surprise.ts` | `gold = SURPRISE_GOLD_BASE * floor * goldMultiplier(tier)` |
| Event-card gold rewards | `run/event_resolver.ts` | Wherever `gold:` payouts apply |
| Treasure-room gold (if any) | check during impl | Verify whether treasure rooms grant gold today |

**Sites that read `dungeon.tier` indirectly:**

`floor.ts`'s `tryGenerateFloor` already has `dungeon` in scope from `DUNGEONS[dungeonId]`. It threads `dungeon.tier` into its inner calls when those calls need it. Loot is rolled at run-state-time not generation-time per the Phase 2a HISTORY note, so `floor.ts` itself does not call `rollLoot`.

## Migration policy

Pre-launch — schema stays at version 1.

| Change | Migration |
|---|---|
| `DungeonDef.floorLength` → `floorsPerRun` rename | Pure code rename. Field is in data, not in any save. No save migration. |
| `DungeonDef.tier` (required new field) | Code-only change; Crypt entry updated in same PR. |
| `DungeonDef.rowsPerFloor` (optional) | Defaulted in generator (`?? 8`). No migration. |
| `DungeonDef.unlockRequirement` (optional) | Defaulted in renderer (locked-card path only reads it). No migration. |
| `MilestoneId = never` | Type-only; no runtime cost. |
| `RunState.pendingMilestones` (required new field) | Defaulted to `[]` in `normalizeSaveFile`'s existing `runState` block — one new line. In-flight saves loaded post-deploy get `pendingMilestones: []` automatically. |
| `CashoutOutcome.milestonesTriggered` | Outcome is not persisted to save; field is constructed at cashout time. No migration. |

## Test plan

**Existing tests must pass unchanged** (regression fixture for "tier=1 = today"):

- `src/dungeon/__tests__/scaling.test.ts`
- `src/dungeon/__tests__/loot.test.ts`
- `src/dungeon/__tests__/floor.test.ts`
- `src/dungeon/__tests__/shop.test.ts`
- `src/dungeon/__tests__/surprise.test.ts`
- `src/run/__tests__/event_resolver.test.ts`
- `src/run/__tests__/run_state.test.ts`
- `src/save/__tests__/save.test.ts`

**New tests (additive):**

- `scaling.test.ts`:
  - `floorScale(f, 1)` ≡ `floorScale(f)` (no-arg default).
  - `floorScale(f, 2)` differs from `floorScale(f, 1)` given a placeholder slope. Use a test-fixture file that overrides `TIER_SCALING_SLOPE[2] = 0.13` and restores in afterEach.
  - `goldMultiplier(1) === 1`. `goldMultiplier(2) === 1` in spec 1 baseline.
- `loot.test.ts`:
  - `pickRarity(rng, f, 1)` ≡ `pickRarity(rng, f)` (no-arg).
  - Same for `rollLoot`, `rollShopItem`, `rollEventItem`.
  - Smoke `pickRarity(rng, f, 2)` differs given a placeholder offset.
- `floor.test.ts`:
  - Synthetic dungeon fixture with `rowsPerFloor: 10` produces 10/11/12-row floors.
  - Default fixture (Crypt without `rowsPerFloor`) produces 8/9/10-row floors (regression).
- new `milestones.test.ts`:
  - Registry compiles empty (typecheck-only).
  - `applyPendingMilestones(state, [])` returns state unchanged.
  - `detectBossMilestones('crypt', 3)` returns `[]` (spec 1 baseline).
- `run_state.test.ts`:
  - `completeCombat` populates `pendingMilestones` only on canonical-final-boss defeat. Use synthetic 2-floor fixture — assert floor-1 boss does NOT populate; floor-2 boss DOES (with empty array since `MilestoneId = never`); floor-3+ boss does NOT (post-canonical).
  - `pressOn` preserves `pendingMilestones` across floor advance (asserts the press-on-after-canonical-clear-then-wipe path still credits at run-end).
  - `cashout` returns `outcome.milestonesTriggered = runState.pendingMilestones` and zeros the field on the new `runState`.
  - Wipe path returns `wipe.milestonesTriggered` and zeros the field.
  - Save normalizer defaults `pendingMilestones: []` for in-flight saves predating the field.
- `expeditions_panel_scene.ts`:
  - No scene-test infrastructure exists; locked-rendering verified by manual smoke.
  - Layout-math unit test on the new pure helper (extract `computeCardPositions(N, panelHeight, cardHeight, gap): number[]` for testability).

**Estimated test count delta:** roughly +25–30 tests. Existing test count: 1515. Spec 1 should land around 1540–1545.

## Risks

1. **Threading miss.** "tier=1 = today" depends on every gold-grant and loot-roll site getting the tier param. Mitigation: existing test snapshots are the regression fixture; if anything's missed, those tests break.
2. **Scene-level milestone application miss.** `cashout` stays pure of SaveFile (option ii'); scene callers must call `applyPendingMilestones`. If any call-site forgets, milestones silently drop. Mitigation: a single test asserting `cashout` returns `milestonesTriggered: []` in spec 1 baseline. Spec 2 extends the assertion when handlers exist.
3. **Phase 2b row-count regression.** Spec 1's row-count change is `(dungeon.rowsPerFloor ?? 8) + (floor − 1)` — Crypt without `rowsPerFloor` set keeps today's 8/9/10. The Phase 2b quota system depends on row count; spec 2 picks Sunken Keep's `rowsPerFloor` carefully to keep the quota feasible. Spec-2 concern, flagged here for handoff.
4. **`floorLength` rename blast radius.** Grep at impl-time for all references; the type-checker catches what grep misses. Test fixtures, scene prose ("3 floors"), and the Expeditions card rendering all need updates.
5. **`EnemySprite.setLocked()` child-traversal.** `EnemySprite` is a Phaser container; iterating `this.list` to apply tint may miss nested containers (e.g., if paperdoll layers are themselves grouped). Verify at impl-time with the live Crypt enemies.

## Success criteria

- All existing tests pass unchanged.
- Tier=1 calls of every parameterized function are byte-identical to today (verified by snapshot tests).
- Crypt run plays identically to today (verified by manual smoke: descend, fight, cash out).
- Multi-dungeon UI renders 1 card today and would correctly render N≥2 cards (verified by synthetic fixture in unit test).
- Locked-card rendering path is exercised by unit test even though no production-locked dungeon exists.
- `pendingMilestones` populates on Crypt floor-3 boss defeat (verified by `run_state.test.ts`).
- `cashout` and wipe both return `outcome.milestonesTriggered` (empty array in spec 1).
- New test count delta is ~25–30; total around 1540–1545.

## Hand-off to spec 2

When spec 2 lands, the additive surface is:

1. Add `'sunken_keep'` to the `DungeonId` union.
2. Add `DUNGEONS['sunken_keep']` entry — `tier: 2`, `floorsPerRun: ?`, `rowsPerFloor: ?`, `enemyPool: SUNKEN_KEEP_POOL`, `bossId: ?`, `unlockRequirement: 'Defeat the Bone Lich'`.
3. Add 4 minion `EnemyId`s + 1 boss `EnemyId` to types/enemies/visuals.
4. Add `'first_crypt_clear'` to `MilestoneId` union.
5. Register `MILESTONES['first_crypt_clear']` handler that adds `'sunken_keep'` to `state.unlocks.dungeons` (idempotent — checks first).
6. Update `detectBossMilestones` body: `if (dungeonId === 'crypt' && floorNumber === DUNGEONS.crypt.floorsPerRun) return ['first_crypt_clear']`.
7. Pick real values for `TIER_SCALING_SLOPE[2]`, `TIER_RARITY_FLOOR_BONUS[2]`, `TIER_GOLD_MULTIPLIER[2]`.
8. Pick tier-2 color for the tier badge.
9. Add Sunken Keep art (boss sprite minimum; minion bodies optional per Cluster C precedent).

No refactors should be needed in spec 2 — the foundation is shaped to receive content.
