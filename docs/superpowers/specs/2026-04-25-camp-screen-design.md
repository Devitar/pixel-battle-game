# Camp Screen — post-boss decision (Tier 1)

**Status:** Design · **Date:** 2026-04-25 · **Source TODO:** Cluster B, task 18

## Purpose

Replace task 16's `CampScreenScene` stub with the real post-boss decision screen — the emotional centerpiece of the Tier 1 gambling loop. The player sees pack gold, party condition (HP-bar-bearing `HeroCard`s), and any fallen, then commits to **Leave** (bank pack, end the run) or **Press On** (advance into the next floor with everything still at risk). Also fixes the boot-routing gap that would currently lose a player's mid-decision save on page reload.

The pure-logic deps (`cashout`, `pressOn`, `credit`, `updateHero`, `removeHero`, `createRngFromState` + `getState`, save invariant) are all in place; this task is wiring + UI.

## Dependencies and invariants

**Vocabulary from prior tasks:**
- `RunState` / `RunStatus = 'in_dungeon' | 'camp_screen' | 'ended'` (task 6).
- `cashout(runState)` returns `{ runState (status='ended'), outcome: { goldBanked, heroesReturned, heroesLost } }` (task 6).
- `pressOn(runState, rng)` returns next `RunState` (status='in_dungeon', `currentFloorNumber+1`, fresh `currentFloorNodes`, `currentNodeIndex=0`); throws if status is not `'camp_screen'` (task 6).
- `credit(vault, amount)` (task 7), `updateHero(roster, hero)` and `removeHero(roster, id)` (task 7).
- `appState.update(producer)` for atomic save with auto-persist (task 10).
- `createRngFromState(state)` and `Rng.getState()` (task 9).
- Save invariant (task 9, `save.ts:20`): `runState` and `runRngState` must be both present or both absent.
- `HeroCard` (task 11) supports `size: 'small' | 'large'`, `isDead: boolean`, `onClick`.
- Boot scene's `resolveSaveState` → `appState.init` flow (task 10) and existing two-way routing (task 16).

**New invariants this spec declares:**
- **Three-way boot routing.** If `saveFile.runState?.status === 'camp_screen'`, boot transitions to `'camp_screen'`. Else if `saveFile.runState` is set, to `'dungeon'`. Else to `'camp'`. Closes a Tier 1 page-reload gap that was previously masked because reaching camp_screen was rare.
- **Camp-screen scene mutates atomically and saves before transitioning.**
  - `Press On`: single `appState.update` writes `{ runState: pressOn(...), runRngState: rng.getState() }`. Then `scene.start('dungeon')`.
  - `Leave`: single `appState.update` writes `{ vault: credit(...), roster: <updated>, runState: undefined, runRngState: undefined }`. Then `scene.start('camp')`. (Identical to the stub's `returnToCamp` body.)
- **Render-from-state, no scene-local fields.** Every visual element is built from `appState.get().runState` in `create()` and held only in Phaser's display list. No `private foo!: Phaser.GameObjects.X` slots — eliminates the orphan-field class of failures called out in task 16's HISTORY.
- **No animations, no state machine.** This is a static decision screen; click handlers transition immediately. Tier 1 simplicity.
- **No confirmation modals.** Press On and Leave commit on first click. Commitment is the design intent of the gambling loop.

## Module layout

| Path | Action | Responsibility |
|---|---|---|
| `src/scenes/camp_screen_scene.ts` | **Rewrite** | Replace task 16's stub. Header + pack pill + 3-`HeroCard` party row + fallen line + Leave / Press On buttons. ~150 lines. |
| `src/scenes/boot_scene.ts` | **Modify** | Add `camp_screen` branch to the routing. ~3 lines. |

**No** changes to `main.ts` (the scene is already registered), no new files, no new tests, no new run-state transitions, no schema changes.

**Imports for `camp_screen_scene.ts`:**
- `phaser`
- `appState` from `./app_state`
- `cashout` and `pressOn` from `../run/run_state`
- `credit` from `../camp/vault`
- `removeHero` and `updateHero` from `../camp/roster`
- `createRngFromState` from `../util/rng`
- `HeroCard` from `../ui/hero_card`

## Layout (coordinates inside 960×540 viewport)

| Element | Position (center unless noted) | Size | Notes |
|---|---|---|---|
| Background fill | (0, 0) origin | 960×540 | `#1a1020` (matches dungeon scene crypt-purple) |
| Title | (480, 40) | 28px green `#4caf50` | `Floor Cleared!` |
| Subtitle | (480, 78) | 14px gray `#aaaaaa` | `The Crypt · Floor {currentFloorNumber}` |
| Pack pill bg | (480, 130) | 200×40 rect, `#2a2418` fill, `#aa8844` 2px border | tan-on-dark, prominent |
| Pack pill text | (480, 130) | 16px tan `#ffcc66` | `Pack: {gold}g` |
| Party HeroCards | centers x=180, 480, 780; y=240 | 280×120 each (`size: 'large'`) | one card per `run.party[i]` (1–3 cards) |
| Fallen line | (480, 360) | 11px red-gray `#cc8888` | `Fallen: {names joined ', '}` — only if `run.fallen.length > 0` |
| Leave button bg | (300, 470) | 220×44 rect, `#2a4a2a` fill, `#44cc44` 2px border | green outline (positive direction) |
| Leave button text | (300, 470) | 14px white | `Leave (+{run.pack.gold}g to vault)` |
| Press On button bg | (660, 470) | 220×44 rect, `#3a2a1a` fill, `#cc8844` 2px border | warm-orange outline (risky direction) |
| Press On button text | (660, 470) | 14px white | `Press On → Floor {currentFloorNumber + 1}` |

**Layout math notes:**
- 3 cards × 280 width + 2 × 20px gap = 880 wide; centered → 40px margin each side; centers at x = 40 + 140 = 180, 480, 780. ✓
- Party row vertical span: y=240 ± 60 = 180–300. Doesn't collide with subtitle (78), pack (130–150), fallen (360), or buttons (448–492).
- 1- or 2-survivor parties pack to the leftmost positions in `run.party` array order. `completeCombat` filters dead heroes out of `party` (see `run_state.ts:76-91`), so a slot-2 death collapses the array — the surviving slot-3 hero would render at the middle x=480 position, not at x=780. This matches the dungeon scene's existing convention (`dungeon_scene.ts:160-166` indexes `SLOT_X_OFFSETS` by `i` over the filtered `run.party`). The original formation order is not recoverable from `run.party` post-combat; the Fallen line by name is the only record of who was where.

## Build order in `create()`

```ts
create(): void {
  const run = appState.get().runState;
  if (!run || run.status !== 'camp_screen') {
    console.warn('CampScreenScene entered without runState in camp_screen status');
    this.scene.start('camp');
    return;
  }
  this.buildBackground();
  this.buildHeader(run);
  this.buildPackPill(run);
  this.buildPartyRow(run);
  this.buildFallenLine(run);
  this.buildButtons(run);
}
```

The guard is preserved verbatim from the stub. Same warn-and-bounce-to-camp behavior; defensive-only, should never trigger via normal flow.

## Press On handler

```ts
private onPressOn(): void {
  const state = appState.get();
  const run = state.runState!;
  const rng = createRngFromState(state.runRngState!);
  const nextRun = pressOn(run, rng);

  appState.update((s) => ({
    ...s,
    runState: nextRun,
    runRngState: rng.getState(),
  }));

  this.scene.start('dungeon');
}
```

**Why this shape:**
- `pressOn(run, rng)` validates `status === 'camp_screen'`, increments `currentFloorNumber`, calls `generateFloor(dungeonId, nextFloor, rng)`, resets `currentNodeIndex` to 0, sets status back to `'in_dungeon'`. All real work lives there; this handler is pure wiring.
- Single atomic `appState.update` writes `runState` and `runRngState` paired — required by the save invariant.
- `createRngFromState` + `getState` round-trip mirrors the Noticeboard Descend (`noticeboard_panel_scene.ts:485`) and dungeon-scene combat-return (`dungeon_scene.ts:91`) exactly.
- `scene.start('dungeon')` (not `launch` / `resume`) — camp_screen is leaving permanently. Dungeon scene's `create()` will see `status === 'in_dungeon'`, no combat handoff in its module-level slot, and route to its `'walking_in'` cold-entry path. Already proven by Noticeboard's Descend flow.
- `runRngState!` non-null assertion is justified by the save-pairing invariant: if `runState` is set (verified by the `create()` guard), `runRngState` must be set too.

## Leave handler

Body is identical to the stub's `returnToCamp` (only the method name and the call site change). Reproducing here for spec completeness:

```ts
private onLeave(): void {
  const run = appState.get().runState!;
  const { outcome } = cashout(run);
  const fallenIds = new Set(outcome.heroesLost.map((h) => h.id));

  appState.update((s) => {
    const vault = credit(s.vault, outcome.goldBanked);
    let roster = s.roster;
    for (const survivor of outcome.heroesReturned) {
      if (roster.heroes.some((h) => h.id === survivor.id)) {
        roster = updateHero(roster, survivor);
      }
    }
    for (const id of fallenIds) {
      if (roster.heroes.some((h) => h.id === id)) {
        roster = removeHero(roster, id);
      }
    }
    return {
      ...s,
      vault,
      roster,
      runState: undefined,
      runRngState: undefined,
    };
  });

  this.scene.start('camp');
}
```

The `roster.heroes.some(...)` guards exist because a hero could in principle be removed from the roster between run-start and now. Tier 1 has no such code path, but the guards are cheap and document the invariant.

## Boot-routing fix

Replace the existing two-way check in `boot_scene.ts:create()`:

```ts
if (saveFile.runState?.status === 'camp_screen') {
  this.scene.start('camp_screen');
} else if (saveFile.runState) {
  this.scene.start('dungeon');
} else {
  this.scene.start('camp');
}
```

**Why this shape:**
- `'camp_screen'` is the only mid-run status the dungeon scene can't host — `dungeon_scene.ts`'s `create()` guard bounces non-`'in_dungeon'` runs to camp, leaving the run dangling in `appState`.
- `'ended'` should never persist — every cashout/wipe handler clears `runState` and `runRngState` to `undefined` in the same `appState.update` that would have set `'ended'`. If a corrupt save somehow has `status === 'ended'` with `runState` present, the `else if` falls through to `'dungeon'`, whose existing guard catches it. Symmetric with the existing behavior; no new branch needed.
- Order matters — the `camp_screen` branch must come *before* the generic `runState` branch.

## Edge cases

**Variable party size (1–3 survivors).** `run.party.length` is at least 1 on `camp_screen` (`computeOutcome` in `combat.ts:30` requires `playerAlive` for `player_victory`). The party-row builder iterates `run.party` and places each card at `x = [180, 480, 780][i]` — cards pack leftward since `completeCombat` filters dead heroes out of the array. Same convention as the dungeon scene's party rendering.

**Multiple Press Ons in a row.** `pressOn` doesn't care about absolute floor number; `generateFloor(dungeonId, nextFloor, rng)` is called per call. Floor 2 → 3 → 4 → … all save-correctly because the `appState.update` happens once per Press On.

**Reload mid-decision.** Player reaches camp_screen → save persists `runState{status: camp_screen}` + `runRngState`. Reload → boot routes to `'camp_screen'` (per the fix above) → scene rebuilds identical UI from `appState`. Player picks Press On → `pressOn` consumes the same `runRngState` → identical Floor N+1. Determinism preserved.

**Pack value on the Leave button.** Reads `run.pack.gold` directly (Tier 1: pack only contains gold; `Pack` type's `gold` field is the full value). Tier 2 will need this label expanded when gear-in-pack lands.

**No `Abandon` button.** Per GDD §4, Abandon exists only at *mid-floor camp nodes* (Tier 2). On the post-boss screen, "abandon" is meaningless — you've cleared a boss; Leave already pays out.

## Risks

1. **Button-color overlap with the wipe panel's `Return to Camp` button** (also green outline). Both end at the camp scene via a green button, slightly fuzzing the symbol across very different outcomes. Mitigation: contexts differ — wipe panel has a red `Wipe!` title; camp_screen has a green `Floor Cleared!` title.
2. **`HeroCard` at `large` size against a bare scene background** (Tavern and Barracks wrap them in panels). The card's own `0x444444` border should provide enough containment, but worth eyeballing during smoke test.
3. **No new tests** — same precedent as task 16. The save-invariant pattern (paired `runState` + `runRngState` writes) is identical to four other call sites that have been working since task 9; regression surface is small.

## Rejected alternatives

- *Confirmation modal on Press On / Leave.* Tier 1 commitment is the design intent; second-guessing dilutes the moment.
- *Show the upcoming floor's node preview (4 ⚔ + 1 ☠ icons) on Press On.* Noticeboard doesn't preview node types either; preserves "you don't know what's ahead" tension.
- *Per-hero "ready / hurt / critical" flag.* The HP bar already encodes this and matches the in-combat readout.
- *Animate the gold counting up on screen open.* Tier 2 polish; static reads instantly.
- *Darkest-Dungeon-style party-left, decisions-right split.* Rejected during clarifying questions — horizontal full-width row reads better at 960×540.
- *Add an `Abandon` button "for symmetry."* Per GDD §4, Abandon only exists on mid-floor camp nodes (Tier 2).
- *Three small (180×56) `HeroCard`s.* Rejected during clarifying questions — the post-boss screen is a *decision about the party*, so the same large-card detail level used for Tavern recruits and Barracks selection applies.

## Acceptance criteria

- `src/scenes/camp_screen_scene.ts` renders header, pack pill, 3-card party row (per `run.party.length`), optional fallen line, Leave + Press On buttons in the layout above.
- `Leave` banks `run.pack.gold` to the vault, updates surviving heroes' HP in the roster, removes fallen heroes, clears `runState` + `runRngState` in a single `appState.update`, then `scene.start('camp')`.
- `Press On` advances `runState` via `pressOn(run, rng)`, persists paired `runState` + `runRngState` in a single `appState.update`, then `scene.start('dungeon')`.
- `boot_scene.ts` routes to `'camp_screen'` when `saveFile.runState?.status === 'camp_screen'`; existing two paths preserved.
- All four `appState.update` writes (Leave, Press On, plus the two existing flows in dungeon scene) honor the `runState` / `runRngState` pairing invariant.
- Smoke test: clear a Crypt boss, screen renders correctly with HP-accurate cards. Click Leave → camp scene with vault credited and roster updated. Replay, click Press On → dungeon scene Floor 2, walking-in animation. Reload page mid-decision → camp_screen reappears unchanged.
