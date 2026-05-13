# Training Grounds Building — Design Spec

**Date:** 2026-05-11
**Status:** Locked design, ready for implementation plan
**Related TODO:** Cluster D · 6
**Builds on:** [`2026-05-10-hunter-class-design.md`](./2026-05-10-hunter-class-design.md) and [`2026-05-11-chapel-building-design.md`](./2026-05-11-chapel-building-design.md) (`first_sunken_keep_clear` milestone scaffolded by Hunter, extended by Chapel; this spec extends it a third time. `Unlocks.buildings` field added by Chapel.)

## Why

Training Grounds is the third and final Sunken-Keep-gated unlock (Hunter shipped 2026-05-10; Chapel 2026-05-11; Training Grounds is this spec). It solves the "benched heroes lag behind" problem: players who keep an extended roster otherwise have no reason to invest in non-active heroes. Benched heroes assigned to trainee slots earn passive XP from every completed run, pro-rated against what an active hero earned on that run.

After this ships:

- Clearing the Sunken Keep floor-3 boss → `unlocks.buildings` gains `'training_grounds'` (alongside the existing `'chapel'` append).
- The Training Grounds building tile appears in the camp scene once unlocked.
- The player drags benched heroes into N slot cards (N = 2/3/4 by building level). Slot assignments persist across runs and across sessions.
- At run-end (cashout or wipe), every assigned trainee who is still alive and was not in the active party gains XP equal to `round(traineeXpBase × proRate)`, where `traineeXpBase` is the cumulative per-node XP yield this run, and `proRate` is `0.25 / 0.40 / 0.55` by building level.
- Result panels (cashout and wipe) show a one-liner: "Training Grounds: N trainees gained X XP."

## Scope summary

**In scope:**

- 1 new `BuildingId`: `'training_grounds'`. Re-exported from `save.ts` (already moved to `data/types.ts` by the Chapel spec).
- `BUILDING_LEVELS.training_grounds` — three tiers: L1 (0g, 2 slots/25%), L2 (200g, 3 slots/40%), L3 (500g, 4 slots/55%).
- Two new constant lookups exported from `building_levels.ts`: `TRAINEE_SLOT_CAPACITY` and `TRAINEE_PRO_RATE` (both `Record<BuildingLevel, number>`).
- New field `RunState.traineeXpBase: number`, initialized to 0, incremented by the same `xpReward` value at the two existing per-node XP-grant sites: `completeCombat` (which handles combat/elite/boss via one ternary `xpReward`) and `completeSurpriseCombat`. Survives floor advancement.
- New field `WipeOutcome.traineeXpBase: number`, carrying the cumulative value out of the wipe path.
- New field `SaveFile.traineeHeroIds: readonly (string | null)[]`. Fixed-length nullable array; length === `TRAINEE_SLOT_CAPACITY[buildingLevels.training_grounds]`. Default `[null, null]` at L1. Slot identity is positional (slot 0, slot 1, …).
- New module `src/camp/trainee_xp.ts` exporting `grantTraineeXp(state, traineeXpBase, activeHeroIds) → { state, xpPerTrainee, eligibleCount }`. Pure TS, no Phaser.
- New scene `src/scenes/training_grounds_panel_scene.ts` — N slot drop-zones at the top, eligible-hero grid below, drag-from-grid-to-slot UX modeled on `expeditions_panel_scene.ts`. Standard upgrade button at the bottom. Roughly 400-500 LOC.
- `camp_scene.ts` conditionally renders the Training Grounds tile (gated on `unlocks.buildings.includes('training_grounds')`). Combined with the existing Chapel gate, the building-tile build loop becomes lookup-driven to handle the four combinations cleanly.
- Extend `first_sunken_keep_clear` milestone handler (currently appends `'hunter'` and `'chapel'`) to also append `'training_grounds'` to `unlocks.buildings`. Idempotent.
- Scene registry: `main.ts` registers `TrainingGroundsPanelScene`. Scene key: `'training_grounds_panel'`.
- Save schema bump v4 → v5 + migration: adds `buildingLevels.training_grounds = 1`, `traineeHeroIds = [null, null]`, and (if a run is in progress) `runState.traineeXpBase = 0`.
- `createDefaultUnlocks()` unchanged (Training Grounds, like Chapel, starts locked). `createFreshSave()` constructs `buildingLevels.training_grounds: 1` and `traineeHeroIds: [null, null]`.
- `normalizeSaveFile` scrubs orphaned trainee slot refs: any `traineeHeroIds[i]` whose hero is not in `roster.heroes` → set to `null`. Also length-matches the slot array to the current building level (defensive, in case of schema drift).
- Run-completion hooks: at `camp_screen_scene.ts:206` (cashout) and `corridor_scene.ts:1321` (wipe), `grantTraineeXp` is called alongside `applyPendingMilestones` to apply the trainee XP grant to SaveFile.
- One-liner toast on both result panels: `"Training Grounds: N trainees gained X XP."` Hidden when `eligibleCount === 0`.
- gdd §6 row 7 patch: drop the "Gained on both cashout and wipe; wipes pay less." clause. Replace with "Gained on every completed run regardless of outcome — trainee XP reflects time spent training." (parallel to the Chapel "Remove → Add or Replace" gdd patch).
- Tests in lockstep for the XP accumulator, the grant helper, scene wiring, milestone handler extension, save migration, and normalize-on-load scrubbing.

**Out of scope (deferred):**

- **Mid-run trainee XP feedback** — no per-node toast, no in-corridor reveal. Player sees the grant only on the run-end panel.
- **Per-trainee XP breakdown on the result panel** — one-liner only ("N trainees gained X XP"). The list-form ("Hero A: 60 → 80 XP; Hero B: 60 → 132 XP") is rejected as visually heavy for a passive mechanic.
- **Auto-assignment** — the gdd's explicit slot count rules out "every benched hero passively trains at a tiny rate."
- **Per-slot specialization** — every slot pays out identically. No "elite slot" / "tier-2 slot" distinction.
- **Retroactive `training_grounds` unlock for saves that already cleared Sunken Keep pre-v5.** Same policy as Paladin/Hunter/Chapel — the milestone fires on a *new* canonical-final-boss defeat, not retroactively.
- **Bespoke Training Grounds building sprite art.** Camp tile uses a placeholder color (Cluster C polish later).
- **Past-MAX_LEVEL trainee progression.** Trainees at L5 with full XP receive no XP-bar feedback; pendingPerk fires the perk-picker exactly once (existing behavior). No "post-cap currency" or prestige.

## Locked decisions (brainstorm log)

| # | Question | Decision |
|---|---|---|
| Q1 | XP base | **Sum of cleared-node XP yields this run.** Same value an active survivor of the run would have accumulated. Pro-rate by building level. Trainee's level does NOT enter the formula. |
| Q2 | Wipe-vs-cashout rate | **Wipes pay the same as cashouts.** The framing is "time spent training" — what matters is the run's depth, not the outcome. gdd §6 row 7 patched to drop the "wipes pay less" clause. |
| Q3 | Pro-rate constants | **L1 = 25%, L2 = 40%, L3 = 55%.** Verbatim from gdd §6 row 7. |
| Q4 | Slot capacity | **L1 = 2, L2 = 3, L3 = 4.** Verbatim from gdd §6 row 7. |
| Q5 | Building cost ladder | **L1 = 0g, L2 = 200g, L3 = 500g.** Parity with Tavern/Barracks/Hospital ladders. Not gdd-specified. |
| Q6 | Assignment UX | **Drag heroes into N slot cards**, parallel to the Expeditions party-picker pattern. N slot cards always rendered (greyed-out for nulls). Slot identity is positional. |
| Q7 | Slot persistence | **Persist across runs and sessions.** Player sets it once and leaves it. The slot reference clears automatically when the assigned hero leaves the roster (dies, is dismissed). |
| Q8 | Double-dip prevention | **A hero in the active party for a run earns active XP only, not trainee XP, for that run.** Their slot remains assigned across the boundary. |
| Q9 | Accumulator location | **`traineeXpBase` lives on RunState**, incremented in-engine at each existing XP grant site. Rejected: recomputing from `traversedNodeIds` at end-of-run. |
| Q10 | Save schema | **Nullable fixed-length array** (`readonly (string \| null)[]`), not variable-length. Slot positions are stable across drag-out / drag-in. |
| Q11 | Reporting | **One-liner toast on result panels** (cashout and wipe). Hidden when no trainees were eligible. |

## Data model — concrete additions

### `src/data/types.ts`

```typescript
export type BuildingId =
  | 'tavern'
  | 'barracks'
  | 'blacksmith'
  | 'hospital'
  | 'chapel'
  | 'training_grounds';   // NEW
```

(`BuildingId` was moved to `data/types.ts` by the Chapel spec and re-exported from `save.ts`; the widening lives here.)

### `src/save/save.ts`

```typescript
export interface SaveFile {
  /* existing fields */
  traineeHeroIds: readonly (string | null)[];   // NEW. Length matches building level.
}
```

`BuildingLevels = Record<BuildingId, BuildingLevel>` now requires a `training_grounds` entry. Default value is `1`. Camp tile visibility is controlled by `unlocks.buildings`, not by the level.

`createFreshSave()` adds:

```typescript
buildingLevels: {
  tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1,
  training_grounds: 1,
},
traineeHeroIds: [null, null],
```

### `src/camp/building_levels.ts`

```typescript
training_grounds: [
  { level: 1, upgradeCost: 0,   unlockDescription: '2 trainee slots · 25% XP' },
  { level: 2, upgradeCost: 200, unlockDescription: '3 trainee slots · 40% XP' },
  { level: 3, upgradeCost: 500, unlockDescription: '4 trainee slots · 55% XP' },
],
```

Plus two new exports:

```typescript
export const TRAINEE_SLOT_CAPACITY: Record<BuildingLevel, number> = { 1: 2, 2: 3, 3: 4 };
export const TRAINEE_PRO_RATE: Record<BuildingLevel, number>     = { 1: 0.25, 2: 0.40, 3: 0.55 };
```

`nextLevel('training_grounds', 1)` returns the L2 def; `nextLevel('training_grounds', 2)` returns L3; `nextLevel('training_grounds', 3)` returns `null`. No special-case in the upgrade path.

### `src/run/run_state.ts` — RunState shape

```typescript
export interface RunState {
  /* existing fields */
  readonly traineeXpBase: number;   // NEW. Cumulative per-node XP yield this run.
}
```

`startRun` initializes `traineeXpBase: 0`. `advanceFloor` carries it through (no reset).

`completeCombat` (around line 271-275, after the `xpReward` computation):

```typescript
const traineeXpBase = runState.traineeXpBase + xpReward;
/* … existing partyAfterXp, pack, etc. … */
return {
  runState: {
    ...runState,
    party: partyAfterXp,
    /* … */
    traineeXpBase,
  },
};
```

`completeSurpriseCombat` (around line 399-404): same pattern with `traineeXpBase += xpForCombatNode(runState.currentFloorNumber)`.

Defeat paths (`player_defeat` branches at lines 235 and 379): the `WipeOutcome` carries `traineeXpBase: runState.traineeXpBase`. No additional increment on defeat — per-node XP is awarded only on victory, so a defeat at a combat node doesn't add to the base for that node.

### `src/run/run_state.ts` — WipeOutcome

```typescript
export interface WipeOutcome {
  /* existing fields */
  readonly traineeXpBase: number;   // NEW.
}
```

Cashout doesn't need a parallel field — `cashout()` returns the full `runState`, which already carries `traineeXpBase`. The cashout call site reads it directly from the RunState.

### `src/camp/trainee_xp.ts` — new module (firewalled, no Phaser)

```typescript
import { applyLevelUps, levelForXp } from '@data/leveling';
import type { Hero } from '@heroes/hero';
import type { SaveFile } from '@save/save';
import { TRAINEE_PRO_RATE } from './building_levels';

export interface TraineeXpResult {
  state: SaveFile;
  xpPerTrainee: number;
  eligibleCount: number;
}

/**
 * Grants trainee XP to every assigned, still-alive, still-on-roster hero whose
 * id is NOT in `activeHeroIds` (double-dip prevention).
 *
 * Returns the next SaveFile, the (uniform) XP amount granted, and the count
 * of eligible trainees — caller surfaces those on the result panel.
 *
 * No-op (identity-preserving) when Training Grounds is not unlocked, or when
 * `traineeXpBase === 0`, or when no slot is filled with an eligible hero.
 */
export function grantTraineeXp(
  state: SaveFile,
  traineeXpBase: number,
  activeHeroIds: readonly string[],
): TraineeXpResult {
  if (!state.unlocks.buildings.includes('training_grounds')) {
    return { state, xpPerTrainee: 0, eligibleCount: 0 };
  }
  if (traineeXpBase === 0) {
    return { state, xpPerTrainee: 0, eligibleCount: 0 };
  }

  const level = state.buildingLevels.training_grounds;
  const proRate = TRAINEE_PRO_RATE[level];
  const xpPerTrainee = Math.round(traineeXpBase * proRate);

  const activeSet = new Set(activeHeroIds);
  const rosterById = new Map(state.roster.heroes.map((h) => [h.id, h]));

  let eligibleCount = 0;
  const nextHeroes = state.roster.heroes.map((h) => h);   // copy for in-place writes
  for (const slotId of state.traineeHeroIds) {
    if (slotId === null) continue;
    if (activeSet.has(slotId)) continue;
    const hero = rosterById.get(slotId);
    if (!hero) continue;   // orphan ref; cleanup handled by normalizeSaveFile

    eligibleCount += 1;
    const idx = nextHeroes.findIndex((h) => h.id === slotId);
    const before = nextHeroes[idx];
    const newXp = before.xp + xpPerTrainee;
    const newLevel = levelForXp(newXp);
    nextHeroes[idx] = applyLevelUps({ ...before, xp: newXp }, before.level, newLevel);
  }

  if (eligibleCount === 0) {
    return { state, xpPerTrainee: 0, eligibleCount: 0 };
  }

  return {
    state: { ...state, roster: { ...state.roster, heroes: nextHeroes } },
    xpPerTrainee,
    eligibleCount,
  };
}
```

Pure function; deterministic given the input SaveFile + base + active list. Existing `applyLevelUps` handles stat bumps, HP increases, and the `pendingPerk` flag on MAX_LEVEL.

## Camp scene tile

`src/scenes/camp_scene.ts:14-22` currently has a two-branch conditional for Chapel. With Training Grounds added, the four-combination matrix is cleanest as a lookup-driven build loop:

```typescript
type CampTile = {
  name: string; key: string; color: number; width: number; height: number;
};
const tiles: CampTile[] = [
  { name: 'Tavern',     key: 'tavern_panel',     color: 0x664433, width: 100, height: 110 },
  { name: 'Blacksmith', key: 'blacksmith_panel', color: 0x665533, width: 100, height: 120 },
  { name: 'Barracks',   key: 'barracks_panel',   color: 0x555555, width: 100, height: 130 },
  { name: 'Hospital',   key: 'hospital_panel',   color: 0x885566, width: 100, height: 100 },
];
const unlocks = appState.get().unlocks.buildings;
if (unlocks.includes('chapel')) {
  tiles.push({ name: 'Chapel', key: 'chapel_panel', color: 0x886688, width: 90, height: 110 });
}
if (unlocks.includes('training_grounds')) {
  tiles.push({ name: 'Training', key: 'training_grounds_panel', color: 0x668866, width: 100, height: 120 });
}
tiles.push({ name: 'Expeditions', key: 'expeditions_panel', color: 0x998866, width: 80, height: 60 });

const FIRST_X = 180;
const STEP_X  = 130;
tiles.forEach((tile, i) => {
  this.buildBuilding(tile.name, FIRST_X + i * STEP_X, tile.color, tile.width, tile.height, tile.key);
});
```

This replaces the existing per-building hardcoded x-coordinates. At 6 tiles (no Chapel/Training Grounds) the spread is 180 → 830; at 7 tiles 180 → 960; at 8 tiles 180 → 1090 — overflows the 960-wide canvas. Mitigation: drop `STEP_X` to 110 when `tiles.length >= 7`, or accept the overflow as a known follow-up. Recommendation: ship at STEP_X=130 and re-balance during implementation once the tile renders.

Placeholder color `0x668866` (muted green — "training field" mood). Bespoke art is a Cluster C task.

## Training Grounds panel scene — `src/scenes/training_grounds_panel_scene.ts`

### Layout

Modeled on `expeditions_panel_scene.ts` stage 2 (party_picker). Layout constants:

```
┌────────────────────────────────────────────────────────────────────┐
│ Training Grounds · Lv 1                              [×] Close      │
│ Slots: 1 / 2 · Trainees gain 25% of run XP                          │
├────────────────────────────────────────────────────────────────────┤
│ ┌─[slot 0]──┐ ┌─[slot 1]──┐                                         │
│ │   Robin   │ │  (empty)  │                                         │
│ │ Hunter L3 │ │           │                                         │
│ └───────────┘ └───────────┘                                         │
│                                                                     │
│ Eligible heroes (drag to a slot):                                   │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                              │
│ │ Aldous   │ │ Brenna   │ │ Cassidy  │   …                          │
│ │ Knight L2│ │ Archer L4│ │ Priest L1│                              │
│ └──────────┘ └──────────┘ └──────────┘                              │
│                                                                     │
│ [Upgrade to L2 — 200g]                                              │
└────────────────────────────────────────────────────────────────────┘
```

Key constants (mirroring Expeditions where possible):

```typescript
const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W  = 920;
const PANEL_H  = 500;

const SLOT_Y = 175;
const SLOT_W = 180;
const SLOT_H = 80;
// Slot X coordinates computed by spread: 4 slots = (180, 320, 460, 600, 740);
// 3 slots = (260, 400, 540, 680); 2 slots = (340, 480, 620). Center-aligned.

const ELIGIBLE_Y_BASE = 290;
const ELIGIBLE_Y_STRIDE = 60;
const ELIGIBLE_COLS = 4;

const UPGRADE_Y = 460;
```

### Drag interactions (port from Expeditions)

Reuse the `expeditions_panel_scene.ts:254-340` drag-factory shape verbatim:

- `card.events.on('dragstart')` — float the card, hide its eligible-grid placeholder.
- `card.events.on('drag', pointer)` — set card.x/y to pointer.
- `card.events.on('drop', dropZone)` — match `dropZone` against the `slotDropZones` array; assign the hero to that slot index.
- `card.events.on('dragend', dropped)` — if not dropped on any zone, snap back to home position.

**Drop on empty slot** → assignment: `traineeHeroIds = traineeHeroIds.map((id, i) => i === slotIndex ? heroId : id)`.

**Drop on filled slot** → swap: if the dragged hero is already in another slot, swap the two slot contents. If the dragged hero is from the eligible grid (not yet assigned), replace the target slot's hero (the displaced hero returns to the eligible grid).

**Drag-out from slot** → slot card itself becomes a drag source. If dropped outside any slot, the slot becomes `null`.

State writes go through `appState.update((s) => ({ ...s, traineeHeroIds: nextAssignments }))`. No "Save" button — assignments are live, like Equip / Stash mutations.

### Capacity-driven rendering

The panel reads `level = appState.get().buildingLevels.training_grounds` and `capacity = TRAINEE_SLOT_CAPACITY[level]`. Renders exactly `capacity` slot cards, in the center-aligned X positions noted above. Slot 0 is leftmost.

When `traineeHeroIds.length !== capacity` (defensive — shouldn't happen post-normalize, but possible during a mid-upgrade window), the panel reads `traineeHeroIds[i] ?? null` for `i in [0, capacity)`.

### Upgrade button

Mirror of Hospital/Tavern. Reads `nextLevel('training_grounds', level)`; if non-null, renders `[Upgrade to L{N+1} — {cost}g]` at `UPGRADE_Y`. On click:

1. `spend(vault, cost)` (gated when insufficient).
2. `buildingLevels = { ...s.buildingLevels, training_grounds: level + 1 }`.
3. `traineeHeroIds = [...s.traineeHeroIds, null]` (push one null per new slot — typically just one).
4. Save. `scene.restart()` to re-render with new capacity.

Hidden when `level === 3`.

### Edge cases

- **Empty roster:** eligible grid renders empty; slots render empty. Player can still upgrade.
- **All heroes assigned:** eligible grid is empty (no dimmed-in-place duplicate); slots remain filled.
- **Hero assigned + Expeditions starts with that hero:** no in-panel feedback. The trainee-XP path skips the hero (via `activeHeroIds` gate). Slot ref stays through the run; the hero earns active XP only.
- **Hero dies on a run while assigned:** `normalizeSaveFile` scrubs the orphan ref on next load. Player sees the slot empty when re-opening the panel.
- **Stale `traineeHeroIds.length` < capacity** (e.g., from a future save shape regression): panel reads slot `i` as `null` when out of bounds. Render-side robust.

## Run-completion hooks

### Cashout — `src/scenes/camp_screen_scene.ts:206`

The existing block:

```typescript
const { outcome } = cashout(run);
appState.update((s) => {
  /* … apply outcome to vault / stash / roster / unlocks … */
  return applyPendingMilestones(next, outcome.milestonesTriggered);
});
```

Becomes (insert the trainee grant BEFORE the milestone application):

```typescript
const { outcome } = cashout(run);
const activeIds = [
  ...outcome.heroesReturned.map((h) => h.id),
  ...outcome.heroesFallen.map((h) => h.id),
  ...outcome.heroesLost.map((h) => h.id),
];
let xpReport = { xpPerTrainee: 0, eligibleCount: 0 };
appState.update((s) => {
  /* … existing outcome-application … */
  const grant = grantTraineeXp(next, run.traineeXpBase, activeIds);
  xpReport = { xpPerTrainee: grant.xpPerTrainee, eligibleCount: grant.eligibleCount };
  return applyPendingMilestones(grant.state, outcome.milestonesTriggered);
});
// xpReport available for the result-panel toast (rendered later in this scene).
```

**Order rationale:** trainee XP grant happens before milestone application so that the run's earned XP applies under the building level at the time the run was played (not at the post-milestone level). In practice the first sunken-keep clear path — the only one where the milestone changes things — has `traineeHeroIds` all-null at that moment (Training Grounds wasn't yet unlocked), so the grant is a no-op anyway. Order is robustness, not correctness.

### Wipe — `src/scenes/corridor_scene.ts:1321`

The existing block:

```typescript
appState.update((s) => {
  /* … apply wipe outcome to roster / vault / unlocks … */
  return applyPendingMilestones(next, wipe.milestonesTriggered);
});
```

Becomes:

```typescript
const activeIds = [
  ...wipe.heroesFallen.map((h) => h.id),
  ...wipe.heroesLost.map((h) => h.id),
];
let xpReport = { xpPerTrainee: 0, eligibleCount: 0 };
appState.update((s) => {
  /* … existing wipe-application … */
  const grant = grantTraineeXp(next, wipe.traineeXpBase, activeIds);
  xpReport = { xpPerTrainee: grant.xpPerTrainee, eligibleCount: grant.eligibleCount };
  return applyPendingMilestones(grant.state, wipe.milestonesTriggered);
});
// xpReport available for the wipe-result panel toast.
```

### Result-panel toast

Both `camp_screen_scene.ts` (cashout result section) and `corridor_scene.ts` (wipe-result section, around line 1200-1300) render a single text line below their existing summary content:

```typescript
if (xpReport.eligibleCount > 0) {
  this.add.text(
    PANEL_CX, TOAST_Y,
    `Training Grounds: ${xpReport.eligibleCount} trainee${xpReport.eligibleCount === 1 ? '' : 's'} gained ${xpReport.xpPerTrainee} XP.`,
    { fontFamily: 'monospace', fontSize: '14px', color: '#aaddaa' },
  ).setOrigin(0.5);
}
```

Color matches the muted-green building palette; no animation, no separate panel.

## Milestone wiring

### `src/run/milestones.ts`

Extend the existing `first_sunken_keep_clear` handler with a third idempotent branch:

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
  if (!next.unlocks.buildings.includes('training_grounds')) {
    next = {
      ...next,
      unlocks: { ...next.unlocks, buildings: [...next.unlocks.buildings, 'training_grounds'] },
    };
  }
  return next;
},
```

Branches are disjoint and order-independent. Idempotent.

### `src/run/__tests__/milestones.test.ts`

New tests:

```typescript
it('appends training_grounds to unlocks.buildings on a fresh state', () => {
  const before = makeFakeSave({
    classes: ['knight'],
    dungeons: ['crypt', 'sunken_keep'],
    buildings: [],
  });
  const after = MILESTONES.first_sunken_keep_clear(before);
  expect(after.unlocks.buildings).toContain('training_grounds');
});

it('appends only training_grounds when hunter and chapel already unlocked', () => {
  const before = makeFakeSave({
    classes: ['knight', 'hunter'],
    dungeons: ['crypt', 'sunken_keep'],
    buildings: ['chapel'],
  });
  const after = MILESTONES.first_sunken_keep_clear(before);
  expect(after.unlocks.buildings).toEqual(['chapel', 'training_grounds']);
  expect(after.unlocks.classes).toEqual(['knight', 'hunter']);
});
```

The existing idempotency test widens its `buildings` array to verify all three branches no-op when fully unlocked.

## Save schema v4 → v5

Bump `CURRENT_SCHEMA_VERSION` from 4 to 5. Register `MIGRATIONS[4]`:

```typescript
// v4 → v5: Training Grounds. Add buildingLevels.training_grounds = 1;
// traineeHeroIds = [null, null]; (mid-run) runState.traineeXpBase = 0.
// Training Grounds spec, 2026-05-11.
4: (raw) => {
  const out: Record<string, unknown> = { ...raw, version: 5 };

  const bl = out.buildingLevels as Record<string, unknown> | undefined;
  if (bl && bl.training_grounds === undefined) bl.training_grounds = 1;

  if (out.traineeHeroIds === undefined) {
    out.traineeHeroIds = [null, null];   // L1 capacity
  }

  const runState = out.runState as Record<string, unknown> | undefined;
  if (runState && runState.traineeXpBase === undefined) {
    runState.traineeXpBase = 0;
  }

  return out;
},
```

**Retroactive unlock policy:** saves that already cleared Sunken Keep pre-v5 do NOT auto-unlock Training Grounds. Same policy as Paladin/Hunter/Chapel.

### `normalizeSaveFile` — orphan-slot scrubbing

In `src/save/save.ts:126`, extend `normalizeSaveFile` with two lines:

```typescript
function normalizeSaveFile(file: SaveFile): SaveFile {
  return {
    ...file,
    stash: file.stash ?? createStash(),
    buildingLevels: file.buildingLevels ?? { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1, training_grounds: 1 },
    hospitalTreatmentsRemaining: file.hospitalTreatmentsRemaining ?? 1,
    tavernCandidates: file.tavernCandidates ?? [],
    traineeHeroIds: normalizeTraineeSlots(file),   // NEW
    roster: { ...file.roster, heroes: file.roster.heroes.map(normalizeHero) },
    runState: file.runState === undefined ? undefined : {
      ...file.runState,
      /* … existing defaults … */
      traineeXpBase: file.runState.traineeXpBase ?? 0,   // NEW
    },
  };
}

function normalizeTraineeSlots(file: SaveFile): readonly (string | null)[] {
  const level = file.buildingLevels?.training_grounds ?? 1;
  const capacity = TRAINEE_SLOT_CAPACITY[level];
  const rosterIds = new Set(file.roster.heroes.map((h) => h.id));
  const current = file.traineeHeroIds ?? [];
  // Scrub orphans, then length-match to capacity.
  const scrubbed = current.map((id) => (id !== null && rosterIds.has(id) ? id : null));
  if (scrubbed.length === capacity) return scrubbed;
  if (scrubbed.length < capacity) return [...scrubbed, ...Array(capacity - scrubbed.length).fill(null)];
  return scrubbed.slice(0, capacity);   // truncate if oversized
}
```

`normalizeTraineeSlots` runs on every load. Cheap; defensive against save-shape drift, hero dismissal-while-assigned, building-level changes mid-save.

## `createFreshSave()`

```typescript
buildingLevels: {
  tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1,
  training_grounds: 1,
},
traineeHeroIds: [null, null],
```

`createDefaultUnlocks()` is unchanged: `buildings: []`.

## Test impact

### New tests

- **`src/camp/__tests__/trainee_xp.test.ts`** (new file):
  - All-null slots → eligibleCount 0, identity-preserving state.
  - Two assigned trainees, `traineeXpBase=240`, L1 (25%) → each gains 60 XP. `applyLevelUps` is invoked.
  - Trainee whose id is in `activeHeroIds` → skipped (double-dip prevention).
  - Trainee whose id is not in `roster.heroes` (orphan) → skipped.
  - Training Grounds locked (`unlocks.buildings` missing `'training_grounds'`) → no-op.
  - `traineeXpBase === 0` → no-op.
  - L5 trainee receiving 100 XP past 4000 → XP increments, level stays at 5, `pendingPerk` preserved.
  - Multiple level-ups in one grant (e.g., 300 XP at L1 → ends L2 with 100 XP) handled by `applyLevelUps`.
- **`src/data/__tests__/building_levels.test.ts`** (extend existing):
  - `TRAINEE_PRO_RATE` and `TRAINEE_SLOT_CAPACITY` shape.
  - `BUILDING_LEVELS.training_grounds` has 3 tiers with the cost ladder above.
  - `nextLevel('training_grounds', 3) === null`.
- **`src/run/__tests__/run_state.test.ts`** (extend):
  - `startRun` sets `traineeXpBase: 0`.
  - `completeCombat` victory increments by the matching `xpFor*Node(floor)`.
  - `completeSurpriseCombat` victory increments by `xpForCombatNode(floor)`.
  - Defeat paths do NOT increment beyond the pre-defeat value.
  - `advanceFloor` preserves `traineeXpBase`.
  - `WipeOutcome.traineeXpBase` carries the cumulative value out of the wipe path.
- **`src/run/__tests__/milestones.test.ts`** (extend):
  - `first_sunken_keep_clear` adds `'training_grounds'` to `unlocks.buildings`.
  - Idempotent when all three branches already applied.
- **`src/save/__tests__/migration.test.ts`** (extend):
  - v4 → v5: `buildingLevels.training_grounds = 1`; `traineeHeroIds = [null, null]`; `runState.traineeXpBase = 0` when a run is in progress.
  - v1 → v2 → v3 → v4 → v5 chain still passes.
- **`src/save/__tests__/save.test.ts`** (extend):
  - `normalizeTraineeSlots` scrubs orphaned heroIds → null.
  - `normalizeTraineeSlots` length-matches the array to building-level capacity (pads with null when short; truncates when over).

### Existing tests to update

- `src/save/__tests__/save.test.ts` — `createFreshSave` fixture asserts `buildingLevels.training_grounds: 1` and `traineeHeroIds: [null, null]`.
- Per saved memory `feedback_grep_tests_before_data_edits`: grep `__tests__/` for `traineeXpBase`, `traineeHeroIds`, `buildingLevels` literals and update fixtures in lockstep.

### Manual UX smoke test

- Open the Training Grounds panel; drag a hero into slot 0; close; reopen → assignment persists.
- Drag the same hero out of slot 0 → slot becomes empty; reopen → still empty.
- Drag hero A into slot 0, drag hero B onto slot 0 → A returns to eligible grid, B occupies slot 0.
- Drag a hero from slot 0 to slot 1 → swap (or move-into-empty); slot 0 empties.
- Start an expedition with the assigned trainee in the party → trainee earns active XP this run, no trainee XP.
- Cash out → result panel shows one-liner with correct XP amount; trainee's XP increases.
- Wipe a run → wipe panel shows the same one-liner; trainee still gains XP (per the "time spent training" framing).
- Upgrade to L2 → a third slot card appears; existing assignments preserved.
- Dismiss an assigned trainee via Barracks → next load shows the slot empty (normalize scrub).

## Risks and open questions

- **Camp tile horizontal overflow.** With Chapel and Training Grounds both unlocked the camp scene shows 7 tiles total (4 base + Chapel + Training + Expeditions). At `STEP_X=130` starting from `FIRST_X=180`, the last tile centers at `x = 180 + 6×130 = 960` — right on the canvas edge, and with Expeditions's `width=80` extends to `x=1000`, overflowing by ~40px. Mitigation: tune `STEP_X` to ~125 during implementation (last center at 930, extends to 970 — still just over), or drop the leading offset, or switch to a two-row layout if more buildings land later. Flagged as a known follow-up — the panel scene itself works regardless.
- **`traineeXpBase` accumulator on mid-run save.** If a player saves mid-run (auto-save fires after every node), the partially-accumulated `traineeXpBase` persists. On resume, the in-engine increment continues correctly. No bug — but worth a test that the resumed run's final XP equals what a single-session run would have produced.
- **`normalizeTraineeSlots` runs every load.** Cost is O(roster.length + capacity), both ≤ 20. Negligible. The defensive truncation case (`scrubbed.length > capacity`) shouldn't trigger in normal play, but covers an explicit "downgrade building" feature if one ever lands.
- **MAX_LEVEL trainee XP feedback.** A L5 trainee gains XP that pushes the bar past 4000 but cannot level. The Barracks display shows the raw XP value; no visual cap. Acceptable for now; would be cleaner if `xp` capped at the L5 threshold or the Barracks UI hid the excess. Flag if future XP-display work touches this.
- **Drag-from-slot UX collision with eligible-grid drag.** When a slot's hero is being dragged out, the eligible grid renders the same hero greyed-in-place (since they're still in roster). The eligible-grid card must NOT be draggable while the slot card is mid-drag. Manage via a per-hero `draggable = !inAnySlot` check at render time; or rely on the Phaser drag system's one-pointer-one-drag invariant. Verify during implementation.
- **One-line toast i18n.** The pluralization (`trainee` / `trainees`) is hardcoded English. The codebase has no i18n today; if/when added, swap to a token-based format. Not in scope here.
- **No mid-run XP feedback** — a deliberate choice (per locked decisions), but if playtesting reveals players don't realize the mechanic exists, consider a small in-corridor "Trainees: +X XP" toast on each node victory. Behind a feature flag if added.

## Future spec hooks (not implemented here)

- **Bespoke Training Grounds sprite art** — Cluster C polish task once placeholders ship.
- **Slot specialization** — gdd doesn't currently call for it, but if a future tier introduces "Drill Sergeant slot" (boosts a specific stat) or "Recovery slot" (heals wounds passively), the data model supports it via per-slot metadata.
- **Auto-fill toggle** — a per-player preference to automatically backfill empty slots from the bench after every run. Out of scope; the gdd's drag-into-slot model is explicit.
- **Past-MAX_LEVEL prestige** — trainees who hit L5 with excess XP could earn a "prestige token" usable for something. No design yet; flag if XP-display work surfaces the wasted-XP question.
