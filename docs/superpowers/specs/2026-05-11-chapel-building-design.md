# Chapel Building — Design Spec

**Date:** 2026-05-11
**Status:** Locked design, ready for implementation plan
**Related TODO:** Cluster D · 5
**Builds on:** [`2026-05-10-hunter-class-design.md`](./2026-05-10-hunter-class-design.md) (Cluster D · 4 — `first_sunken_keep_clear` milestone scaffolded; this spec extends the handler).

## Why

Chapel is the second of three Sunken-Keep-gated unlocks (Hunter shipped 2026-05-10; Chapel is this spec; Training Grounds follows as Cluster D · 6). The gdd's original framing was "remove a negative Trait from a hero, expensive." Brainstorming pivoted the feature toward a *growth* model rather than a *fix* model: heroes can now accumulate up to 3 traits across their lifetime, via two distinct Chapel actions.

After this ships:

- Clearing the Sunken Keep floor-3 boss → `unlocks.buildings` gains `'chapel'` (alongside the existing `'hunter'` class append).
- The Chapel building tile appears in the camp scene once unlocked.
- Heroes' `traitId: TraitId` field becomes `traitIds: readonly TraitId[]` (single → array). Every hero starts with a 1-element array on recruit.
- Players can spend gold at the Chapel to either **Replace** an existing trait (random re-roll, excluded from current set) or **Add** a brand-new trait (also random, also excluded from current). Both actions are commit-then-reveal.
- Hard cap of 3 traits per hero. Add button disabled at cap.

## Scope summary

**In scope:**

- 1 new `BuildingId`: `'chapel'`
- Widen `Unlocks` to include `buildings: readonly BuildingId[]` (parallels `classes`/`dungeons`)
- Move `BuildingId` from `src/save/save.ts` into `src/data/types.ts` to avoid a save→data layering inversion when `Unlocks` references it. Re-export from `save.ts` for compatibility.
- `BUILDING_LEVELS.chapel = [{ level: 1, upgradeCost: 0, unlockDescription: 'Add or replace traits on heroes' }]` — L1-only.
- Hero shape: `Hero.traitId: TraitId` → `Hero.traitIds: readonly TraitId[]`. `createHero(...)` keeps its single-trait param (caller-facing); internally wraps to a 1-element array.
- `computeMaxHp` and `recomputeMaxHp` accept a `readonly TraitDef[]` instead of a single `TraitDef`. HP effects compose left-to-right.
- `Combatant.traitId?: TraitId` → `traitIds?: readonly TraitId[]`. `getEffectiveStat` iterates the array summing stat effects.
- `combat_setup.ts` passes `traitIds: hero.traitIds` to `createHeroCombatant`.
- UI updates: HeroCard (`ui/widgets/hero_card.ts`) and Barracks (`scenes/barracks_panel_scene.ts`) render multi-trait labels via `.map(id => TRAITS[id].name).join(' · ')`. HeroCard's compact form truncates to first 2 traits + `…` if over.
- New module `src/camp/buildings/chapel.ts` with `chapelReplaceCost`, `chapelAddCost`, `rollNewTrait`, `replaceTrait`, `addTrait`, and `MAX_TRAITS_PER_HERO = 3`.
- New scene `src/scenes/chapel_panel_scene.ts` — hero list + detail pane mirroring Hospital's pattern. Per-trait `[Replace]` buttons and one `[+ Add a trait]` button per hero. Commit-then-reveal with a brief tint flourish on the changed/added row.
- Extend `first_sunken_keep_clear` milestone handler (currently appends `'hunter'`) to also append `'chapel'` to `unlocks.buildings`. Idempotent.
- `camp_scene.ts` conditionally renders the Chapel tile (gated on `unlocks.buildings.includes('chapel')`) with an x-coordinate shuffle to fit between Hospital and Expeditions.
- Scene registry: `main.ts` registers `ChapelPanelScene`.
- Save schema bump v3 → v4 + migration: converts each Hero record's `traitId` to `traitIds: [traitId]`; defaults `buildingLevels.chapel = 1` and `unlocks.buildings = []`.
- `createDefaultUnlocks().buildings = []`. `createFreshSave` constructs `buildingLevels.chapel: 1`.
- gdd §6 row 6 patch: "Remove a Trait from a hero. Expensive." → "Add or replace traits on a hero — up to 3 per hero. Expensive."
- Tests in lockstep for chapel actions, scene wiring, milestone handler extension, and save migration.

**Out of scope (deferred):**

- **Tier 2/3 progression** — gdd explicitly says L1-only. No upgrade button on the panel. `nextLevel('chapel', 1)` returns `null` naturally.
- **Removing a trait entirely** — the gdd's original "Remove" wording is dropped in favor of Replace/Add per locked brainstorm decisions. Negative-trait escape happens via Replace (overwrite the bad one with a random new one). gdd row 6 patched accordingly.
- **Preview-then-confirm flow.** Both actions are commit-then-reveal random. No preview; no re-roll-on-bad-result mechanism.
- **Retroactive `chapel` unlock for saves that already cleared Sunken Keep pre-this-spec.** Same policy as Paladin/Hunter — the milestone fires on a *new* canonical-final-boss defeat, not retroactively. Per saved-memory `feedback_save_migrations`, save migrations are in scope but retroactive grants are not implemented pre-launch.
- **Cluster D · 6 (Training Grounds).** Sibling spec; will extend the same `first_sunken_keep_clear` handler with a third branch.
- **Bespoke Chapel building sprite art.** Camp tile uses a placeholder color (Cluster C polish later).

## Locked decisions (brainstorm log)

| # | Question | Decision |
|---|---|---|
| Q1 | Trait removal cost | **50g × hero level (flat).** Level-1 hero pays 50g; level-10 pays 500g. Framed as "protect your investment" — the more invested the hero, the costlier to swap traits. Aligned with Tavern hire cost (50g) as the base unit. |
| Q2 | Trait removal end state | **Re-roll a new random trait** (rather than leave empty or use a sentinel). Gambling flavor: pay, then see what you get. Hero never ends up with no trait. |
| Q3 | Re-roll pool | **Exclude current traits.** New trait rolled uniformly from `ALL_TRAIT_IDS` minus the hero's existing trait set. Guaranteed change — never wastes gold on a same-trait re-roll. |
| Q4 | Chapel scope: just Replace, or Add too? | **Both — two separate actions.** Replace swaps an existing trait; Add grows the hero. gdd-divergence: original "Remove a Trait" wording is dropped. |
| Q5 | Trait cap | **3 traits per hero.** Add button disabled when at cap. |
| Q6 | Add cost scaling | **50g × hero level × current trait count.** L5 hero with 1 trait pays 250g to add a 2nd; same hero with 2 traits pays 500g to add a 3rd. Replace cost remains flat by trait count. |
| Q7 | Reveal timing | **Commit-then-reveal** for both actions. Gold deducts on click; new trait is revealed in the detail pane with a brief 700ms tint flourish on the changed/added row. No modal. |
| Q8 | Unlock gating mechanism | **Extend `Unlocks` with `buildings: readonly BuildingId[]`** (parallels classes/dungeons). The `first_sunken_keep_clear` milestone handler appends `'chapel'`. Camp scene checks `unlocks.buildings.includes('chapel')` to decide whether to render the tile. |

## Data model — concrete additions

### `src/data/types.ts`

```typescript
import type { BuildingId } from '@save/save';   // OR move BuildingId here

export interface Unlocks {
  classes: readonly ClassId[];
  dungeons: readonly DungeonId[];
  buildings: readonly BuildingId[];   // NEW
}
```

**Layering decision:** moving `BuildingId` from `save.ts` to `data/types.ts` avoids a `data` → `save` import (which would invert the typical dependency direction). Re-export from `save.ts` so existing imports keep working without churn:

```typescript
// src/save/save.ts
export type { BuildingId } from '@data/types';
```

### `src/save/save.ts` — BuildingId widening

```typescript
// Now in data/types.ts; save.ts re-exports
export type BuildingId = 'tavern' | 'barracks' | 'blacksmith' | 'hospital' | 'chapel';
```

`BuildingLevels = Record<BuildingId, BuildingLevel>` now requires a `chapel` entry. Default value is `1` (Chapel is L1-only; the field is always present but the camp tile visibility is controlled by `unlocks.buildings`, not by the level).

`createDefaultUnlocks()` returns `buildings: []`. `createFreshSave()` includes `chapel: 1` in the `buildingLevels` object.

### `src/camp/building_levels.ts`

Append to `BUILDING_LEVELS`:

```typescript
chapel: [
  { level: 1, upgradeCost: 0, unlockDescription: 'Add or replace traits on heroes' },
],
```

`nextLevel('chapel', 1)` returns `null` naturally. No special case in `applyBuildingUpgrade` — Chapel just can't be upgraded.

### `src/heroes/hero.ts` — Hero shape

```typescript
export interface Hero {
  /* existing fields */
  traitIds: readonly TraitId[];   // was: traitId: TraitId
}
```

`createHero(...)` keeps its `traitId: TraitId` param (caller-facing); internally wraps:

```typescript
return {
  /* existing fields */
  traitIds: [traitId],
};
```

All 4 call sites of `createHero` (Tavern x2, starter roster, test helpers) are unchanged.

### `src/heroes/hero.ts` — `computeMaxHp` and `recomputeMaxHp`

```typescript
export function computeMaxHp(
  classBaseHp: number,
  traits: readonly TraitDef[],    // was: trait: TraitDef
  equipment: HeroEquipment,
  perk?: PerkDef,
): number {
  let base = classBaseHp;
  for (const trait of traits) {
    if (trait.hpEffect) base = applyHpEffect(base, trait.hpEffect);
  }
  if (perk?.hpEffect) base = applyHpEffect(base, perk.hpEffect);
  return base + gearTotal(equipment);
}

export function recomputeMaxHp(hero: Hero): Hero {
  const classDef = CLASSES[hero.classId];
  const traits = hero.traitIds.map((id) => TRAITS[id]);
  const perk = hero.perkId ? PERKS[hero.perkId] : undefined;
  const newMaxHp = computeMaxHp(classDef.baseStats.hp, traits, hero.equipment, perk);
  return {
    ...hero,
    maxHp: newMaxHp,
    currentHp: Math.min(hero.currentHp, newMaxHp),
  };
}
```

**Numeric note:** percent-mode HP effects compound multiplicatively when stacked (e.g., two +10% effects = 1.21×, not 1.20×). In practice we exclude duplicate traits, but worth a dedicated test for the compose order.

### `src/combat/types.ts` — Combatant

```typescript
traitIds?: readonly TraitId[];   // was: traitId?: TraitId
```

### `src/combat/statuses.ts:getEffectiveStat`

```typescript
if (stat !== 'hp' && combatant.traitIds) {
  for (const id of combatant.traitIds) {
    const trait = TRAITS[id];
    for (const effect of trait.statEffects ?? []) {
      if (effect.stat === stat && evaluateTraitCondition(effect.condition, combatant)) {
        total += effect.delta;
      }
    }
  }
}
```

Multi-trait stat effects sum naturally — same compose pattern as wounds and equipment.

### `src/run/combat_setup.ts`

`createHeroCombatant(..., { traitIds: hero.traitIds, ... })` instead of `traitId: hero.traitId`. One-line change in the existing overrides object.

### `src/camp/buildings/chapel.ts` — new module

```typescript
import { TRAITS } from '@data/traits';
import type { TraitId } from '@data/types';
import { recomputeMaxHp, type Hero } from '@heroes/hero';
import type { Rng } from '@util/rng';

const ALL_TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

export const MAX_TRAITS_PER_HERO = 3;

export function chapelReplaceCost(hero: Hero): number {
  return 50 * hero.level;
}

/** Returns Infinity when the hero is at the cap — UI uses this to gate the Add button. */
export function chapelAddCost(hero: Hero): number {
  if (hero.traitIds.length >= MAX_TRAITS_PER_HERO) return Infinity;
  return 50 * hero.level * hero.traitIds.length;
}

export function rollNewTrait(currentIds: readonly TraitId[], rng: Rng): TraitId {
  const pool = ALL_TRAIT_IDS.filter((id) => !currentIds.includes(id));
  if (pool.length === 0) {
    throw new Error('rollNewTrait: no traits left in pool (hero has every trait)');
  }
  return rng.pick(pool);
}

export function replaceTrait(hero: Hero, indexToReplace: number, rng: Rng): Hero {
  if (indexToReplace < 0 || indexToReplace >= hero.traitIds.length) {
    throw new Error(
      `replaceTrait: invalid index ${indexToReplace} (have ${hero.traitIds.length})`,
    );
  }
  const newTrait = rollNewTrait(hero.traitIds, rng);
  const newTraitIds = hero.traitIds.map((id, i) => (i === indexToReplace ? newTrait : id));
  return recomputeMaxHp({ ...hero, traitIds: newTraitIds });
}

export function addTrait(hero: Hero, rng: Rng): Hero {
  if (hero.traitIds.length >= MAX_TRAITS_PER_HERO) {
    throw new Error(`addTrait: hero already at MAX_TRAITS_PER_HERO (${MAX_TRAITS_PER_HERO})`);
  }
  const newTrait = rollNewTrait(hero.traitIds, rng);
  return recomputeMaxHp({ ...hero, traitIds: [...hero.traitIds, newTrait] });
}
```

Both ops re-run `recomputeMaxHp` because the new trait may have a different `hpEffect` than the one it replaces (or any current trait).

### Trait UI rendering

`src/scenes/barracks_panel_scene.ts:278` and `src/ui/widgets/hero_card.ts:121` currently render a single trait line via `TRAITS[hero.traitId].name`. Becomes:

```typescript
const traitNames = hero.traitIds.map((id) => TRAITS[id].name).join(' · ');
```

For the HeroCard compact form, the trait line could overflow at 3 traits. Truncate to first 2 + ellipsis:

```typescript
const traitNames = hero.traitIds.length > 2
  ? hero.traitIds.slice(0, 2).map((id) => TRAITS[id].name).join(' · ') + ' …'
  : hero.traitIds.map((id) => TRAITS[id].name).join(' · ');
```

Full list always visible in the Barracks detail pane (no truncation there — wider layout).

## Chapel scene — `src/scenes/chapel_panel_scene.ts`

### Layout

Mirrors Hospital's hero-list + detail-pane structure (panel constants `PANEL_X=20`, `PANEL_W=920`, etc., copied wholesale). Roughly 400-500 LOC.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Chapel · 12 heroes · Gold: 1240                              [×] Close   │
├─────────────────────────────────────┬────────────────────────────────────┤
│ HERO LIST (left, paginated)         │ DETAIL PANE (right)                │
│                                     │                                    │
│ Aldous · Knight · Lv 3              │ Robin (Hunter · Lv 5)              │
│   Quick                             │                                    │
│ Brenna · Archer · Lv 2              │ Current traits:                    │
│   Stout · Lucky                     │   • Stout      [Replace 250g]      │
│ ▶ Robin · Hunter · Lv 5             │   • Quick      [Replace 250g]      │
│   Stout · Quick                     │                                    │
│ Cassidy · Priest · Lv 4             │ Slots used: 2/3                    │
│   Sharp_eyed                        │ [+ Add a third trait — 500g]       │
│ …                                   │                                    │
│ [▲ page up]            [▼ page down]│                                    │
└─────────────────────────────────────┴────────────────────────────────────┘
```

### State (scene instance + module-scoped persistence across `scene.restart()`)

Mirrors Hospital exactly:

```typescript
private _selectedHeroId: string | null = null;
private _detailContainer: Phaser.GameObjects.Container | undefined;
private _rowBgs: { bg: Phaser.GameObjects.Rectangle; id: string }[] = [];

let _pendingSelectedHeroId: string | null = null;
let _listPageStart = 0;
```

### Hero list

Every hero in the roster is selectable — unlike Hospital (which filters to wounded), Chapel shows everyone since trait operations apply to any hero. Row format: name, class, level on line 1; current traits (comma-joined) on line 2. Same paging arrows and `VISIBLE_ROWS = 6` constants as Hospital.

### Detail pane

Three sections:

1. **Header**: hero name, class, level (large bitmap text).
2. **Current traits list**: one row per `hero.traitIds[i]`. Each row has:
   - Trait name (small bitmap text)
   - Per-row Replace button labeled `[Replace · 250g]`. Cost is `chapelReplaceCost(hero)` (same for every row of the hero — flat in trait count). Button is grayed when `balance(vault) < cost`.
3. **Add slot**: a label `Slots used: N/3` and a single `[+ Add a trait — 500g]` button. Cost is `chapelAddCost(hero)`. Button is grayed:
   - When `hero.traitIds.length >= MAX_TRAITS_PER_HERO` (cap reached), with hint text "At trait cap (3)".
   - When `balance(vault) < cost` (insufficient gold), button label shows the cost regardless.

### Action flow (commit-then-reveal)

**Replace:**
1. Player clicks `[Replace · 250g]` for `hero.traitIds[i]`.
2. Vault check: `spend(vault, chapelReplaceCost(hero))` (button gated when insufficient, so this should succeed).
3. `campRng = createRngFromState(state.campRngState)` → `updatedHero = replaceTrait(hero, i, campRng)` → `updateHero(roster, updatedHero)` → write back `campRngState = campRng.getState()`.
4. Save.
5. **Reveal:** detail pane re-renders with the new trait in slot `i`. 700ms tint animation on the changed row (fade from `COLOR.accentGold` back to default) draws the eye.

**Add:**
1. Player clicks `[+ Add a trait — 500g]`.
2. Same vault/rng/save flow as Replace, calling `addTrait(hero, campRng)`.
3. **Reveal:** new trait row appears at the end of the traits list with the same 700ms tint flourish. If this was the 3rd trait, the Add button disables and the cap hint appears.

### Edge cases

- **Empty roster:** detail pane shows "No heroes in your roster."
- **Vault insufficient:** Replace/Add buttons are grayed pre-click. Cost label is still rendered; no tooltip needed (gray + label communicates state).
- **At trait cap:** Add button grayed with `[+ Add — at cap]` text or similar; replace buttons remain enabled.
- **Scene reopened after a hero is removed mid-session (e.g., expedition started):** `_pendingSelectedHeroId` no longer matches anyone in the roster → fall back to the first hero (same recovery as Hospital).

### Camp scene tile

`src/scenes/camp_scene.ts:14-22` — conditional building tile:

```typescript
this.buildBuilding('Tavern', 180, 0x664433, 100, 110, 'tavern_panel');
this.buildBuilding('Blacksmith', 300, 0x665533, 100, 120, 'blacksmith_panel');
this.buildBuilding('Barracks', 440, 0x555555, 100, 130, 'barracks_panel');
this.buildBuilding('Hospital', 580, 0x885566, 100, 100, 'hospital_panel');
if (appState.get().unlocks.buildings.includes('chapel')) {
  this.buildBuilding('Chapel', 720, 0x886688, 90, 110, 'chapel_panel');
  this.buildBuilding('Expeditions', 850, 0x998866, 80, 60, 'expeditions_panel');
} else {
  this.buildBuilding('Expeditions', 720, 0x998866, 80, 60, 'expeditions_panel');
}
```

Chapel slots in BEFORE Expeditions. The 850-x for Expeditions when Chapel is present is **tunable during implementation** — if the camp scene scrolls or buildings overflow, re-balance.

### Scene registry

`src/main.ts` registers `ChapelPanelScene` alongside the other panel scenes. Scene key: `'chapel_panel'`.

## Milestone wiring

### `src/data/types.ts`

`MilestoneId` is unchanged (`'first_crypt_clear' | 'first_sunken_keep_clear'` — already widened in Cluster D · 4).

### `src/run/milestones.ts`

Extend the existing `first_sunken_keep_clear` handler:

```typescript
first_sunken_keep_clear: (state) => {
  let next = state;
  if (!next.unlocks.classes.includes('hunter')) {
    next = {
      ...next,
      unlocks: { ...next.unlocks, classes: [...next.unlocks.classes, 'hunter'] },
    };
  }
  if (!next.unlocks.buildings.includes('chapel')) {
    next = {
      ...next,
      unlocks: { ...next.unlocks, buildings: [...next.unlocks.buildings, 'chapel'] },
    };
  }
  return next;
},
```

Same idempotency shape as `first_crypt_clear`. Cluster D · 6 will append a third branch for `'training_grounds'`.

### `src/run/__tests__/milestones.test.ts`

The Hunter tests (Cluster D · 4) widen to also assert `chapel` appended. Two new tests:

```typescript
it('appends chapel to unlocks.buildings on a fresh state', () => {
  const before = makeFakeSave({
    classes: ['knight'],
    dungeons: ['crypt', 'sunken_keep'],
    buildings: [],
  });
  const after = MILESTONES.first_sunken_keep_clear(before);
  expect(after.unlocks.buildings).toContain('chapel');
});

it('appends only chapel when hunter already unlocked', () => {
  const before = makeFakeSave({
    classes: ['knight', 'hunter'],
    dungeons: ['crypt', 'sunken_keep'],
    buildings: [],
  });
  const after = MILESTONES.first_sunken_keep_clear(before);
  expect(after.unlocks.buildings).toContain('chapel');
  expect(after.unlocks.classes).toEqual(['knight', 'hunter']);
});
```

The existing idempotency test widens its `classes`/`buildings` arrays to verify both branches no-op.

## Save schema v3 → v4

Bump `CURRENT_SCHEMA_VERSION` from 3 to 4. Register `MIGRATIONS[3]`:

```typescript
// v3 → v4: Hero.traitId → Hero.traitIds (single → array); add buildingLevels.chapel = 1;
// add unlocks.buildings = []. Chapel spec, 2026-05-11.
3: (raw) => {
  const out: Record<string, unknown> = { ...raw, version: 4 };

  const migrateHero = (h: Record<string, unknown>): Record<string, unknown> => {
    if (Array.isArray(h.traitIds)) return h;        // already migrated (defensive)
    if (typeof h.traitId !== 'string') return h;    // malformed; let downstream handle
    const { traitId, ...rest } = h;
    return { ...rest, traitIds: [traitId] };
  };

  const roster = out.roster as { heroes?: Array<Record<string, unknown>> } | undefined;
  if (roster?.heroes) roster.heroes = roster.heroes.map(migrateHero);

  const candidates = out.tavernCandidates as Array<Record<string, unknown>> | undefined;
  if (candidates) out.tavernCandidates = candidates.map(migrateHero);

  const runState = out.runState as Record<string, unknown> | undefined;
  if (runState) {
    const party = runState.party as Array<Record<string, unknown>> | undefined;
    if (party) runState.party = party.map(migrateHero);
    const fallen = runState.fallen as Array<Record<string, unknown>> | undefined;
    if (fallen) runState.fallen = fallen.map(migrateHero);
    const lost = runState.lost as Array<Record<string, unknown>> | undefined;
    if (lost) runState.lost = lost.map(migrateHero);
  }

  const bl = out.buildingLevels as Record<string, unknown> | undefined;
  if (bl && bl.chapel === undefined) bl.chapel = 1;

  const unlocks = out.unlocks as Record<string, unknown> | undefined;
  if (unlocks && unlocks.buildings === undefined) unlocks.buildings = [];

  return out;
},
```

Each saved hero record (in roster, tavernCandidates, runState.party/fallen/lost) gets its single `traitId` converted to a 1-element `traitIds` array. `buildingLevels.chapel` defaults to `1`; `unlocks.buildings` defaults to `[]`. No data loss.

**Retroactive unlock policy:** saves that already cleared Sunken Keep pre-v4 do NOT auto-unlock Chapel. Same policy as Paladin/Hunter (per saved-memory `feedback_save_migrations`).

## `createDefaultUnlocks()` and `createFreshSave()`

```typescript
export function createDefaultUnlocks(): Unlocks {
  return {
    classes: ['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage'],
    dungeons: ['crypt'],
    buildings: [],
  };
}
```

`createFreshSave()` constructs `buildingLevels` with `chapel: 1` alongside the four existing entries.

## Test impact

### New tests

- `src/camp/buildings/__tests__/chapel.test.ts` (new file) — `chapelReplaceCost`, `chapelAddCost`, `rollNewTrait` (verifies exclusion of current ids), `replaceTrait` (verifies new trait differs, indexed-replace semantics), `addTrait` (verifies append + cap-throw), `MAX_TRAITS_PER_HERO`.
- `src/run/__tests__/milestones.test.ts` — new assertions for `chapel` appended on Sunken Keep clear; idempotency widening; integration test for both branches no-op.
- `src/save/__tests__/migration.test.ts` — new v3→v4 test verifying Hero `traitId → traitIds: [traitId]` conversion + `buildingLevels.chapel = 1` + `unlocks.buildings = []`.
- `src/heroes/__tests__/hero.test.ts` — `computeMaxHp` with multi-trait array, including the percent-mode compose check.
- `src/camp/__tests__/building_levels.test.ts` — `BUILDING_LEVELS.chapel[0].level === 1`; `nextLevel('chapel', 1) === null`.

### Existing tests to update

- `src/save/__tests__/save.test.ts` — `createDefaultUnlocks` test expects `buildings: []`. Fixture `buildingLevels` literals add `chapel: 1`.
- `src/heroes/__tests__/hero.test.ts` — every `Hero.traitId` access in fixtures becomes `Hero.traitIds[0]` (or hand-rolled `traitIds: [...]`).
- `src/combat/__tests__/statuses.test.ts` — any test asserting trait stat effects should still pass after the loop refactor; verify the trait-condition path with multiple traits.
- `src/ui/widgets/__tests__/hero_card.test.ts` (if it exists) — multi-trait label rendering + truncation.
- Per saved memory `feedback_grep_tests_before_data_edits`: grep `__tests__/` for `traitId:` literal references and update in lockstep.

## Risks and open questions

- **HeroCard label overflow at 3 traits** — the compact form may visually pinch even with the 2-trait truncation. Verify during implementation; if needed, switch to a count-and-icon-row pattern (e.g., "3 traits" + icons) for the small card. Detail panes are unaffected.
- **HP recompute on every Chapel action** — `replaceTrait`/`addTrait` both call `recomputeMaxHp`. If the new trait has `hpEffect` percent-mode, the hero's `currentHp` is clamped to the new `maxHp`. Worst case: a trait re-roll could reduce a hero's max HP slightly (e.g., Stout +10% replaced by a non-HP trait). Player-visible but expected; documented in the Chapel description text.
- **Migration scope across save fixture variants** — the v3→v4 migration touches 5 places where Hero records live (`roster.heroes`, `tavernCandidates`, `runState.party`, `runState.fallen`, `runState.lost`). Verify against existing test fixtures that exercise all five — particularly the wipe-path tests where `fallen` is populated.
- **`getEffectiveStat` performance** — looping over `traitIds` (max 3) for every stat read is a 3× factor on a previously single-trait code path. Cheap in absolute terms (the function isn't on a hot inner loop) but worth a quick profile check during combat playback if anything feels sluggish.
- **`createHero` param signature** — keeping the singular `traitId: TraitId` param hides the underlying array. Future feature work that needs to seed multi-trait recruits (e.g., legendary npcs) will need a direct Hero-literal construction or a new builder. Acceptable for this spec; flag if a third trait-multi feature lands.
- **Scene x-coordinate balance** — the camp_scene shuffle places Chapel between Hospital and Expeditions at x=720; Expeditions moves to x=850. With 6 buildings on a 960-wide canvas, the layout is tight. May need a small icon-size reduction or a horizontal scroll if Training Grounds (Cluster D · 6) also adds a tile.

## Future spec hooks (not implemented here)

- **Cluster D · 6 (Training Grounds)** — extends `first_sunken_keep_clear` handler with a third branch appending `'training_grounds'` to `unlocks.buildings`. Adds another camp tile.
- **Bespoke Chapel sprite art** — Cluster C polish task once placeholders ship.
- **Trait categorization (positive / negative / neutral)** — useful if a future feature wants to restrict Replace's pool to only positive traits (a "blessed re-roll" upgrade tier). Not in scope here; the current pool is unfiltered.
- **Chapel L2/L3 progression** — gdd locks L1-only; if future design adds tiers (e.g., L2 = preview-before-confirm, L3 = pick-specific-trait), the data model supports it via `BUILDING_LEVELS.chapel` growing.
