# Camp Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace task 16's `CampScreenScene` stub with the real Tier 1 post-boss decision screen — header + pack pill + 3-`HeroCard` party row + Fallen line + `Leave` and `Press On` buttons — and fix the boot-routing gap so a `camp_screen`-status save resumes correctly on page reload.

**Architecture:** Two units, sequenced bottom-up. (1) Boot scene routing — add a `camp_screen` branch before the existing `runState` branch so the new scene becomes a valid resume target. (2) Full rewrite of `src/scenes/camp_screen_scene.ts` with two click handlers: `Press On` calls `pressOn(run, rng)` and atomically persists paired `runState` + `runRngState` before `scene.start('dungeon')`; `Leave` is the existing stub's `returnToCamp` body verbatim, renamed and rewired. No new files, no schema changes, no new run-state transitions. All pure-logic deps (`pressOn`, `cashout`, `credit`, `updateHero`, `removeHero`, `createRngFromState`, save invariant) are already in place.

**Tech Stack:** TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 4 (existing 511 tests stay green; no new tests), Phaser 4 (Scene, Rectangle, Text, pointer input, `HeroCard` Container).

**Spec:** `docs/superpowers/specs/2026-04-25-camp-screen-design.md`

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/scenes/boot_scene.ts` | **Modify** | Add `camp_screen` branch to the routing. ~3 lines. |
| `src/scenes/camp_screen_scene.ts` | **Rewrite** | Replace the stub. Real post-boss decision UI with Leave / Press On. ~150 lines. |

**No** changes to `main.ts` (the scene is already registered), no new files, no new tests, no new run-state transitions, no schema changes.

The bottom-up order means Task 1 lands a routing fix that is harmless on its own (the existing stub still serves as a valid `'camp_screen'` scene target), and Task 2 lands the rewrite. If only Task 1 ships, the player still sees the stub UI; if only Task 2 ships, the rewrite works on the boss-cleared transition but page-reload mid-decision still bounces to camp. Both tasks ship together for the full feature.

---

## Task 1: Boot routing fix

**Files:**
- Modify: `src/scenes/boot_scene.ts:21-31`

The existing two-way check (`runState` set → `'dungeon'`, else `'camp'`) sends `camp_screen`-status saves to the dungeon scene, whose own `create()` guard then bounces to camp — leaving the run dangling in `appState`. Add a `camp_screen` branch before the generic `runState` branch.

- [ ] **Step 1: Modify the routing block in `boot_scene.ts`**

Replace lines 26–30 (the `if (saveFile.runState) { ... } else { ... }` block) with:

```ts
    if (saveFile.runState?.status === 'camp_screen') {
      this.scene.start('camp_screen');
    } else if (saveFile.runState) {
      this.scene.start('dungeon');
    } else {
      this.scene.start('camp');
    }
```

The full `create()` method now reads:

```ts
  create(): void {
    const rng = createRng(Date.now());
    const { saveFile } = resolveSaveState(window.localStorage, rng);
    appState.init(saveFile, window.localStorage);

    if (saveFile.runState?.status === 'camp_screen') {
      this.scene.start('camp_screen');
    } else if (saveFile.runState) {
      this.scene.start('dungeon');
    } else {
      this.scene.start('camp');
    }
  }
```

No import changes needed.

- [ ] **Step 2: Typecheck passes**

Run: `npx tsc --noEmit`
Expected: clean — no errors.

- [ ] **Step 3: Test suite stays green**

Run: `npm test`
Expected: 511 tests pass (no test changes; routing logic is not under test, same as before).

- [ ] **Step 4: Smoke test — fresh game and mid-dungeon are unaffected**

Run: `npm run dev`. Open `http://localhost:5173`.

1. **Fresh game.** With `localStorage` cleared (or no run yet), boot → `'camp'` scene appears. Vault gold visible, three buildings (Tavern, Barracks, Noticeboard) clickable. ✓
2. **Mid-dungeon save.** Hire 3 heroes via Tavern, descend via Noticeboard. After the first combat resolves, while the result panel is up, hard-reload the browser tab. Boot → `'dungeon'` scene appears with the run resumed. ✓

If either case routes wrong, the new branch is mis-ordered or the optional-chain expression has a typo. The third path (`'camp_screen'`) is verified at the end of Task 2's smoke test.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/boot_scene.ts
git commit -m "boot: route to camp_screen when saved run is post-boss"
```

---

## Task 2: Camp screen scene rewrite

**Files:**
- Rewrite: `src/scenes/camp_screen_scene.ts`

Replaces the stub's text summary + single `Return to Camp` button with the real Tier 1 decision UI. The stub's `returnToCamp` body becomes `onLeave` verbatim; the new `onPressOn` handler reads `runRngState`, calls `pressOn(run, rng)`, and persists paired `runState` + `runRngState` atomically before transitioning to the dungeon scene.

- [ ] **Step 1: Rewrite `src/scenes/camp_screen_scene.ts`**

Replace the entire file with:

```ts
import * as Phaser from 'phaser';
import { removeHero, updateHero } from '../camp/roster';
import { credit } from '../camp/vault';
import { cashout, pressOn, type RunState } from '../run/run_state';
import { HeroCard } from '../ui/hero_card';
import { createRngFromState } from '../util/rng';
import { appState } from './app_state';

const PARTY_X = [180, 480, 780] as const;
const PARTY_Y = 240;
const BG_COLOR = 0x1a1020;

export class CampScreenScene extends Phaser.Scene {
  constructor() {
    super('camp_screen');
  }

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

  private buildBackground(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, BG_COLOR)
      .setOrigin(0, 0);
  }

  private buildHeader(run: RunState): void {
    this.add
      .text(480, 40, 'Floor Cleared!', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#4caf50',
      })
      .setOrigin(0.5);

    this.add
      .text(480, 78, `The Crypt · Floor ${run.currentFloorNumber}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);
  }

  private buildPackPill(run: RunState): void {
    this.add
      .rectangle(480, 130, 200, 40, 0x2a2418)
      .setStrokeStyle(2, 0xaa8844);
    this.add
      .text(480, 130, `Pack: ${run.pack.gold}g`, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);
  }

  private buildPartyRow(run: RunState): void {
    for (let i = 0; i < run.party.length; i++) {
      new HeroCard(this, PARTY_X[i], PARTY_Y, run.party[i], { size: 'large' });
    }
  }

  private buildFallenLine(run: RunState): void {
    if (run.fallen.length === 0) return;
    const names = run.fallen.map((h) => h.name).join(', ');
    this.add
      .text(480, 360, `Fallen: ${names}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#cc8888',
      })
      .setOrigin(0.5);
  }

  private buildButtons(run: RunState): void {
    const leaveBg = this.add
      .rectangle(300, 470, 220, 44, 0x2a4a2a)
      .setStrokeStyle(2, 0x44cc44);
    this.add
      .text(300, 470, `Leave (+${run.pack.gold}g to vault)`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    leaveBg.setInteractive({ useHandCursor: true });
    leaveBg.on('pointerdown', () => this.onLeave());

    const pressOnBg = this.add
      .rectangle(660, 470, 220, 44, 0x3a2a1a)
      .setStrokeStyle(2, 0xcc8844);
    this.add
      .text(660, 470, `Press On → Floor ${run.currentFloorNumber + 1}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    pressOnBg.setInteractive({ useHandCursor: true });
    pressOnBg.on('pointerdown', () => this.onPressOn());
  }

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
}
```

Notes for the implementer:
- `import { cashout, pressOn, type RunState }` uses the inline-`type` form to satisfy `verbatimModuleSyntax`. Same idiom as `dungeon_scene.ts:7-9`.
- The two `runState!` non-null assertions in the handlers are justified by the `create()` guard at the top of the file (which `scene.start('camp')`s out if `runState` is missing or wrong status). The `runRngState!` in `onPressOn` is justified by the save-pairing invariant — if `runState` is set, `runRngState` is set too.
- `HeroCard` is constructed directly with `new HeroCard(this, x, y, hero, opts)` — the constructor calls `scene.add.existing(this)` internally (`hero_card.ts:39`). No need to capture the return.
- The `roster.heroes.some(...)` guards in `onLeave` are unchanged from the stub. Cheap, document the invariant.
- No private fields. Every visual object lives only in Phaser's display list. Eliminates the orphan-field class of failures called out in task 16's HISTORY.

- [ ] **Step 2: Typecheck passes**

Run: `npx tsc --noEmit`
Expected: clean — no errors. If `verbatimModuleSyntax` complains about the `type RunState` import, switch to a separate `import type { RunState } from '../run/run_state';` line and remove `type RunState` from the value-imports line.

- [ ] **Step 3: Test suite stays green**

Run: `npm test`
Expected: 511 tests pass (no test changes; pure-logic deps unchanged).

- [ ] **Step 4: Production build succeeds**

Run: `npm run build`
Expected: `tsc + vite build` finishes without errors.

- [ ] **Step 5: Smoke test (manual, dev server)**

Run: `npm run dev`. Open `http://localhost:5173`.

Walk through the spec's smoke-test sequence (`docs/superpowers/specs/2026-04-25-camp-screen-design.md` §Acceptance criteria), elaborated:

1. **Reach the camp_screen.** Either fresh-start (Tavern → hire 3 → Noticeboard → drag 3 → Descend → fight all four nodes including the boss → click result panel to dismiss) *or* pre-arrange a save with `runState.status === 'camp_screen'` via DevTools.
2. **Layout sanity.** Background dark crypt-purple `#1a1020`. Title `Floor Cleared!` in green at top-center. Subtitle `The Crypt · Floor 1` below. Tan-bordered Pack pill `Pack: Ng` at y=130. Three large `HeroCard`s at y=240 centers x=180/480/780, each showing the hero's paperdoll, name, class, HP bar, and stat line. If anyone died, the Fallen line at y=360 lists their names.
3. **Buttons read correctly.** `Leave (+Ng to vault)` in green at left (x=300, y=470). `Press On → Floor 2` in warm-orange at right (x=660, y=470). Hover cursor changes on each.
4. **Click Leave.** Scene transitions to `'camp'`. Camp's gold HUD reflects `previous + run.pack.gold`. Open Barracks: surviving heroes show post-run HP; fallen heroes are absent. Open localStorage `pixel-battle-game/save`: `runState` and `runRngState` are absent; `vault.gold` is incremented; `roster.heroes` is the pruned set.
5. **Replay, click Press On instead.** Set up a fresh post-boss save (or `localStorage.removeItem` and replay). On the camp_screen, click `Press On → Floor 2`. Scene transitions to `'dungeon'`. HUD top-left reads `The Crypt · Floor 2 · Node 1 / 4`. Party paperdolls walk in from off-screen-left to node 0. Combat fires automatically. Continue clearing floors — the loop should bank correctly on Leave at any later floor.
6. **Page reload mid-decision (the boot-routing fix).** With the camp_screen visible (after step 1, before clicking), hard-reload the browser tab. Boot routes to `'camp_screen'` (per Task 1's fix). Scene rebuilds with the same layout, same pack value, same party / fallen state. Click Press On → still gets Floor 2. Click Leave → still cashes out correctly.
7. **Variable party size.** If only 1 or 2 heroes survived the boss, only that many `HeroCard`s render — at the leftmost positions (x=180, then x=480 if a second survivor exists). The Fallen line lists the dead. Layout still reads correctly without stretched / centered / anomalous spacing.
8. **Localstorage save invariant.** After clicking Press On, inspect localStorage. `runState.currentFloorNumber === 2`, `runState.currentNodeIndex === 0`, `runState.status === 'in_dungeon'`, `runState.currentFloorNodes` is a fresh 4-node array, `runRngState` is set (any number) — both are present, honoring the pairing invariant.

If any step diverges, stop and debug before committing. Likely friction points: `HeroCard`-against-bare-background visual issues (the card's own `0x444444` border may look anemic — adjust the scene background or add a subtle panel behind the row), button-color overlap with the wipe panel, or layout collisions if a future change moves the buttons.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/camp_screen_scene.ts
git commit -m "camp_screen: rewrite stub with Leave / Press On decision UI"
```

---

## Verification summary

After both tasks:

- `npx tsc --noEmit` — clean
- `npm test` — 511 tests passing (no new tests; pure-logic deps unchanged)
- `npm run build` — succeeds
- Manual smoke test — all 8 steps pass
- Tier 1 gambling loop fully end-to-end playable: cleared boss → Leave (cashout, banks gold, returns survivors) **or** Press On (advances to next floor, walks in, fights again). Page-reload-mid-decision gap closed.

---

## Out of scope (per spec §Risks and follow-ups)

- Confirmation modal on Leave / Press On (Tier 2 polish)
- Animated gold-counting on screen open (Tier 2 polish)
- Upcoming-floor preview on Press On (preserves Tier 1's "you don't know what's ahead" tension)
- `Abandon` button (per GDD §4, only exists at mid-floor camp nodes — Tier 2)
- Equipment recovery from fallen heroes (Tier 2 — gear flow doesn't exist yet)
- Per-hero "ready / hurt / critical" flag separate from the HP bar (redundant with combat-scene readout)

---

## Notes for the implementer

- **The `create()` guard is load-bearing.** It catches the "scene was started with the wrong runState shape" case via `console.warn` and bounces to camp. Tier 1 normal flow never triggers it; defensive only. Same idiom as the dungeon scene's guard.
- **Render-from-state, no scene-local fields.** Every visual builder reads from the `run` parameter passed in by `create()`. No `private foo!: Phaser.GameObjects.X` slots — eliminates the entire orphan-field class of strict-mode failures that bit task 16 during execution.
- **Single `appState.update` per click.** Each handler computes its outcome up front, then writes the full new state in one atomic producer. The save invariant (`runState` and `runRngState` both-present-or-both-absent) is honored by writing both fields together inside the same producer.
- **`HeroCard` constructor adds itself to the scene.** The `scene.add.existing(this)` call inside `HeroCard`'s constructor (`hero_card.ts:39`) means `new HeroCard(...)` is the complete idiom — no need for `this.add.existing(card)` afterward, no need to capture the return value unless you'll mutate it later.
- **Party row collapses on death.** `completeCombat` filters dead heroes out of `run.party` (see `run_state.ts:76-91`). A slot-2 death means `run.party[1]` is the surviving slot-3 hero, who renders at `PARTY_X[1] = 480` — not at `780`. Original formation order is not recoverable post-combat; the Fallen line by name is the only record of who was where. This matches the dungeon scene's existing party-rendering convention (see `dungeon_scene.ts:160-166`).
- **`Press On` rng plumbing.** `createRngFromState(runRngState)` restores the rng to its post-combat state; `pressOn(run, rng)` advances it via `generateFloor`; the new `rng.getState()` is persisted alongside the new `runState`. Skip any of these and the next floor's content becomes nondeterministic on resume.
- **`scene.start('dungeon')` not `'camp_screen'`.** After `Press On`, status flips back to `'in_dungeon'`, so the camp_screen's own `create()` guard would bounce a re-entry to camp. The `start('dungeon')` is the only correct destination.
- **No `main.ts` change.** `CampScreenScene` is already registered (task 16 added it). The class name and scene key (`'camp_screen'`) are unchanged; the class is just rewritten.
- **Color palette quick-reference:**
  - Background `0x1a1020` — matches dungeon scene
  - Title green `#4caf50` — matches dungeon scene's `Victory!`
  - Subtitle gray `#aaaaaa` — standard secondary-text gray
  - Pack pill: fill `0x2a2418`, stroke `0xaa8844`, text `#ffcc66` — tan-on-dark, gold accent
  - Fallen line `#cc8888` — softer than the wipe panel's `#cc6666` (this isn't a wipe, just losses)
  - Leave: fill `0x2a4a2a`, stroke `0x44cc44` — same green as the wipe panel's `Return to Camp`, intentional (both are "exit the run" affordances)
  - Press On: fill `0x3a2a1a`, stroke `0xcc8844` — warm-orange, signals "risky path." Distinct from Leave's green.
