# Phase 6a — Travel Scene + Per-Step HP Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated `'travel'` scene that plays between map-node transitions, replacing the Phase 4 inline `walking_to_next` tween. Heroes appear as bobbing/rotating sprites walking left-to-right across a corridor; one HP tick fires per edge as the first per-step event (foundation for Phase 6b chatter and Phase 6c surprise encounters).

**Architecture:** Five tasks. (1) Pure-TS `applyTravelTick(rs): { runState, deltas }` helper in `run_state.ts` — per-hero binary trigger, ±1 with maxHp cap and 1-HP floor, fully unit-tested. (2) Tiny `travel_handoff` module mirroring `combat_handoff.ts` for passing per-hero deltas from dungeon scene to travel scene. (3) New `'travel'` scene with backdrop, single-file hero sprites with bob+rotate tweens, per-hero HP bars, HUD, walk tween over 7.5s/walkSpeed, HP popups firing at step 3 (40% through travel). (4) Wire dungeon scene's `onNodeClicked` to call `applyTravelTick` + `scene.start('travel')`, and `create()` to handle return-from-travel by snapping the party and auto-engaging. (5) Housekeeping — TODO decomposition + HISTORY entry.

**Tech Stack:** TypeScript 6 (strict), Vitest 4, Phaser 4. New scene primitives: `Phaser.GameObjects.Container` for hero groups, `tweens.add` with `yoyo: true, repeat: -1` for bob/rotate animations, `time.delayedCall` for the step-3 HP-tick fire timing.

**Spec:** `docs/superpowers/specs/2026-05-03-phase-6a-travel-scene-design.md` (locked design from 2026-05-03 brainstorm).

**Repo conventions** (from CLAUDE.md / memory):
- **No commits anywhere in this plan.** The user runs commits manually. Each task's "Done" checkpoint is for review, not commit.
- The Phaser firewall: `run/` files MUST NOT `import 'phaser'`. The `applyTravelTick` helper stays pure TS.
- Save schema stays at version 1; no migrations. `applyTravelTick` mutates existing `Hero.currentHp` only — no new fields.
- Don't materialize empty directories.
- HISTORY entries use the slim template (~15-25 lines).
- Before editing data-shape constants, grep `__tests__/` for hardcoded references (per memory). `applyTravelTick` is additive, no shape change — but the test file in Task 1 is the canonical reference.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/run/run_state.ts` | **Modify** | Add `applyTravelTick(rs): { runState, deltas }` — per-hero binary trigger (≥1 wound → -1, 0 wounds → +1), maxHp cap, 1-HP floor. ~25 lines added. |
| `src/run/__tests__/run_state.test.ts` | **Modify** | New `describe('applyTravelTick')` block with 8 unit tests covering trigger conditions, cap/floor, mixed party, purity, deltas-array correctness. ~120 lines added. |
| `src/scenes/travel_handoff.ts` | **Create** | Module-level shared variable for passing per-hero deltas (`readonly number[]`) from dungeon → travel scene. Mirrors `combat_handoff.ts`. ~13 lines. |
| `src/scenes/travel_scene.ts` | **Create** | New `TravelScene` class. Backdrop, 3 hero sprites with bob/rotate tweens, per-hero HP bars, HUD (floor/pack/walkSpeed), walk tween, HP popups at step 3. ~290 lines. |
| `src/scenes/dungeon_scene.ts` | **Modify** | `onNodeClicked` calls `applyTravelTick` + sets handoff + `scene.start('travel')` instead of `setState('walking_to_next')`. `create()` adds a "return from travel" branch (no walk-in re-tween, snap + auto-engage). ~40 lines net change. |
| `src/main.ts` | **Modify** | Register `TravelScene` in the scene array. ~2 lines. |
| `TODO.md` | **Modify** (Task 5) | Decompose Phase 6+ into Phase 6a / 6b / 6c; mark 6a ✅. |
| `HISTORY.md` | **Modify** (Task 5) | Slim entry at top per template. |

---

## Task 1: Pure-TS `applyTravelTick` helper + tests

After this task: green build, all existing tests pass plus new `applyTravelTick` tests. Helper exists but is unused (Task 4 wires it). No behavioral change for the player.

**Files:**
- Modify: `src/run/run_state.ts`
- Modify: `src/run/__tests__/run_state.test.ts`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL 1471 tests pass. Note the count.

- [ ] **Step 1.2: Add `applyTravelTick` to `run_state.ts`**

Open `src/run/run_state.ts`. Add the helper at the bottom of the file, after `playerPath` (around line 451):

```ts
/**
 * Phase 6a per-edge HP tick. Evaluated once per edge during travel.
 *
 * Per hero (binary on wound presence):
 * - `wounds.length > 0` → take -1 HP, floored at 1 (travel chip damage cannot kill).
 * - `wounds.length === 0` → gain +1 HP, capped at maxHp.
 *
 * Returns the new run state and a `deltas` array indexed parallel to `runState.party`
 * (each entry is -1, 0, or +1). The travel scene reads `deltas` to render per-hero
 * popups; entries equal to 0 mean no popup should render.
 *
 * Pure: does not mutate the input runState.
 */
export function applyTravelTick(runState: RunState): { runState: RunState; deltas: readonly number[] } {
  const deltas: number[] = [];
  const newParty = runState.party.map((hero) => {
    if (hero.wounds.length > 0) {
      const newHp = Math.max(1, hero.currentHp - 1);
      const delta = newHp - hero.currentHp;
      deltas.push(delta);
      return delta === 0 ? hero : { ...hero, currentHp: newHp };
    }
    const newHp = Math.min(hero.maxHp, hero.currentHp + 1);
    const delta = newHp - hero.currentHp;
    deltas.push(delta);
    return delta === 0 ? hero : { ...hero, currentHp: newHp };
  });
  return {
    runState: { ...runState, party: newParty },
    deltas,
  };
}
```

- [ ] **Step 1.3: Add the `applyTravelTick` import to the test file**

Open `src/run/__tests__/run_state.test.ts`. Find the imports from `'../run_state'` (around line 9-23). Add `applyTravelTick` to the import list:

```ts
import {
  applyTravelTick,
  cashout,
  chooseCampNodeEffect,
  chooseNextNode,
  claimTreasure,
  completeCombat,
  currentNode,
  leaveShop,
  loseHero,
  nextNodeChoices,
  playerPath,
  pressOn,
  purchaseItem,
  startRun,
} from '../run_state';
```

(Alphabetize per the existing convention.)

- [ ] **Step 1.4: Add the `applyTravelTick` test block**

Find the end of the `describe('traversedNodeIds (cartographer log)', ...)` block (around line 600 — find by searching for the next describe after `traversedNodeIds`). Add a new describe block after it:

```ts
describe('applyTravelTick', () => {
  function makePartyWithStates(states: { hp: number; maxHp: number; wounded: boolean }[]): Hero[] {
    return states.map((s, i) => {
      const hero = createHero('knight', `H${i}`, `h${i}`, 'quick', 'body1');
      return {
        ...hero,
        currentHp: s.hp,
        maxHp: s.maxHp,
        wounds: s.wounded ? [{ id: 'bruised' as const, runsRemaining: 5 }] : [],
      };
    });
  }

  function makeRunWithParty(party: Hero[]): RunState {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    return { ...rs, party };
  }

  it('unwounded hero at half HP gains +1 (heal)', () => {
    const party = makePartyWithStates([{ hp: 10, maxHp: 20, wounded: false }]);
    const rs = makeRunWithParty(party);
    const { runState, deltas } = applyTravelTick(rs);
    expect(runState.party[0].currentHp).toBe(11);
    expect(deltas).toEqual([1]);
  });

  it('unwounded hero at maxHp stays at maxHp (capped, delta=0)', () => {
    const party = makePartyWithStates([{ hp: 20, maxHp: 20, wounded: false }]);
    const rs = makeRunWithParty(party);
    const { runState, deltas } = applyTravelTick(rs);
    expect(runState.party[0].currentHp).toBe(20);
    expect(deltas).toEqual([0]);
  });

  it('wounded hero at half HP takes -1 (damage)', () => {
    const party = makePartyWithStates([{ hp: 10, maxHp: 20, wounded: true }]);
    const rs = makeRunWithParty(party);
    const { runState, deltas } = applyTravelTick(rs);
    expect(runState.party[0].currentHp).toBe(9);
    expect(deltas).toEqual([-1]);
  });

  it('wounded hero at 1 HP stays at 1 (floored — travel cannot kill)', () => {
    const party = makePartyWithStates([{ hp: 1, maxHp: 20, wounded: true }]);
    const rs = makeRunWithParty(party);
    const { runState, deltas } = applyTravelTick(rs);
    expect(runState.party[0].currentHp).toBe(1);
    expect(deltas).toEqual([0]);
  });

  it('multiple wounds still result in -1 (per-hero binary, not per-wound)', () => {
    const party = makePartyWithStates([{ hp: 15, maxHp: 20, wounded: true }]);
    const rs = makeRunWithParty(party);
    // Stack additional wounds.
    rs.party[0].wounds.push({ id: 'hobbled' as const, runsRemaining: 5 });
    rs.party[0].wounds.push({ id: 'concussed' as const, runsRemaining: 5 });
    const { runState, deltas } = applyTravelTick(rs);
    expect(runState.party[0].currentHp).toBe(14);
    expect(deltas).toEqual([-1]);
  });

  it('mixed 3-hero party: each evaluated independently', () => {
    const party = makePartyWithStates([
      { hp: 5,  maxHp: 20, wounded: false },  // unwounded, below max → +1
      { hp: 10, maxHp: 20, wounded: true },   // wounded, mid HP → -1
      { hp: 20, maxHp: 20, wounded: false },  // unwounded at max → 0
    ]);
    const rs = makeRunWithParty(party);
    const { runState, deltas } = applyTravelTick(rs);
    expect(runState.party[0].currentHp).toBe(6);
    expect(runState.party[1].currentHp).toBe(9);
    expect(runState.party[2].currentHp).toBe(20);
    expect(deltas).toEqual([1, -1, 0]);
  });

  it('does not mutate the input runState', () => {
    const party = makePartyWithStates([{ hp: 10, maxHp: 20, wounded: true }]);
    const rs = makeRunWithParty(party);
    const before = JSON.stringify(rs);
    applyTravelTick(rs);
    expect(JSON.stringify(rs)).toBe(before);
  });

  it('returns deltas indexed parallel to party (length matches)', () => {
    const party = makePartyWithStates([
      { hp: 5,  maxHp: 20, wounded: false },
      { hp: 10, maxHp: 20, wounded: true },
    ]);
    const rs = makeRunWithParty(party);
    const { deltas } = applyTravelTick(rs);
    expect(deltas).toHaveLength(rs.party.length);
  });
});
```

- [ ] **Step 1.5: Run new tests**

Run: `npx vitest run src/run/__tests__/run_state.test.ts -t "applyTravelTick"`

Expected: ALL 8 new tests pass.

- [ ] **Step 1.6: Full-suite run for Task 1**

Run: `npm test`

Expected: ALL tests pass; count up by 8 (1471 → 1479).

---

## Task 2: Travel handoff module

After this task: a tiny module exists for passing per-hero deltas from dungeon → travel scene at scene-start time. Mirrors the existing `combat_handoff.ts` pattern.

**Files:**
- Create: `src/scenes/travel_handoff.ts`

- [ ] **Step 2.1: Create the handoff module**

Create `src/scenes/travel_handoff.ts`:

```ts
let pending: { deltas: readonly number[] } | undefined;

export function setTravelDeltas(deltas: readonly number[]): void {
  pending = { deltas };
}

export function consumeTravelDeltas(): { deltas: readonly number[] } | undefined {
  const out = pending;
  pending = undefined;
  return out;
}
```

- [ ] **Step 2.2: Run typecheck**

Run: `npm run build`

Expected: typecheck passes (no usages yet, just the module exists).

- [ ] **Step 2.3: Full-suite run for Task 2**

Run: `npm test`

Expected: ALL 1479 tests pass (no test changes; module is unused so far).

---

## Task 3: Travel scene — shell + animation + HP popups

After this task: a full `TravelScene` exists, registered in `main.ts`, but never started by anyone yet. The next task wires the dungeon scene to actually launch it. Game behavior unchanged from the player's perspective.

This is the largest task. Bundling backdrop + sprites + bob/rotate + HP bars + HUD + walk tween + step-3 popups into one task because they're tightly coupled (the popup logic needs the HP bar refs and the timed callback needs the walk tween's duration).

**Files:**
- Create: `src/scenes/travel_scene.ts`
- Modify: `src/main.ts`

- [ ] **Step 3.1: Scaffold the scene file with imports + class shell**

Create `src/scenes/travel_scene.ts`:

```ts
import * as Phaser from 'phaser';
import { Paperdoll } from '@render/paperdoll';
import { heroToLoadout } from '@render/hero_loadout';
import type { Hero } from '@heroes/hero';
import { appState } from './app_state';
import { consumeTravelDeltas } from './travel_handoff';

const SCENE_W = 960;
const SCENE_H = 540;
const GROUND_Y = 380;
const CEILING_Y = 100;

const HERO_BODY_SCALE = 3;
const HERO_FRAME_SIZE = 16;
const HERO_BODY_HALF = (HERO_FRAME_SIZE * HERO_BODY_SCALE) / 2;

// Single-file front-to-back; mirrors combat scene's PARTY_X.
// Slot 0 (frontmost) on the right; slot 2 (back) on the left.
const HERO_X_BY_SLOT: readonly number[] = [400, 320, 240];

const HP_BAR_W = 56;
const HP_BAR_H = 4;
const HPBAR_BELOW_FEET = 6;

const WALK_DISTANCE = 200;             // total horizontal distance heroes traverse
const STEPS_PER_EDGE = 5;
const STEP_DURATION_MS = 1500;          // per-step duration at 1× walkSpeed
const TOTAL_TRAVEL_MS = STEPS_PER_EDGE * STEP_DURATION_MS; // 7500ms at 1×
const HP_TICK_STEP = 3;                 // step (1-indexed) at which the HP popup fires
const HP_TICK_FRACTION = HP_TICK_STEP / STEPS_PER_EDGE;     // 0.6 — fraction of total travel
const POPUP_DURATION_MS = 500;

const FF_X = 944;
const FF_Y = 48;
const FF_W = 60;
const FF_H = 24;

interface HeroVisual {
  container: Phaser.GameObjects.Container;
  paperdoll: Paperdoll;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
}

export class TravelScene extends Phaser.Scene {
  private walkSpeed: 1 | 3 = 1;
  private heroVisuals: HeroVisual[] = [];
  private deltas: readonly number[] = [];
  private hudFloor!: Phaser.GameObjects.Text;
  private hudPack!: Phaser.GameObjects.Text;
  private ffBg!: Phaser.GameObjects.Rectangle;
  private ffLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('travel');
  }

  create(): void {
    this.heroVisuals = [];

    const state = appState.get();
    const run = state.runState;
    if (!run || run.status !== 'in_dungeon') {
      console.warn('TravelScene entered without active in_dungeon runState');
      this.scene.start('camp');
      return;
    }

    this.walkSpeed = state.preferences?.walkSpeed ?? 1;
    const handoff = consumeTravelDeltas();
    this.deltas = handoff?.deltas ?? [];

    this.buildBackdrop();
    this.buildHud();
    this.buildHeroes(run.party);
    this.startWalk();
  }
}
```

- [ ] **Step 3.2: Implement `buildBackdrop`**

Add the method inside the `TravelScene` class:

```ts
  private buildBackdrop(): void {
    // Solid base background — matches dungeon scene.
    this.add.rectangle(0, 0, SCENE_W, SCENE_H, 0x1a1020).setOrigin(0, 0);
    // Ceiling band (slightly lighter) suggesting the corridor's top.
    this.add.rectangle(0, 0, SCENE_W, CEILING_Y, 0x251530).setOrigin(0, 0);
    // Ground line where heroes' feet land.
    this.add.rectangle(0, GROUND_Y, SCENE_W, 1, 0x555555).setOrigin(0, 0);
    // Subtle floor band below ground line.
    this.add.rectangle(0, GROUND_Y + 1, SCENE_W, SCENE_H - GROUND_Y - 1, 0x140820).setOrigin(0, 0);
  }
```

- [ ] **Step 3.3: Implement `buildHud`**

```ts
  private buildHud(): void {
    const run = appState.get().runState!;
    const total = run.currentFloorNodes.length;
    this.hudFloor = this.add
      .text(16, 16, `The Crypt · Floor ${run.currentFloorNumber} · ${total} nodes`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0, 0);
    const itemCount = run.pack.items.length;
    const packLabel =
      itemCount > 0
        ? `Pack: ${run.pack.gold}g · ${itemCount} item${itemCount === 1 ? '' : 's'}`
        : `Pack: ${run.pack.gold}g`;
    this.hudPack = this.add
      .text(944, 16, packLabel, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffcc66',
      })
      .setOrigin(1, 0);

    // Walk-speed toggle — mirrors dungeon scene's FF UI.
    this.ffBg = this.add
      .rectangle(FF_X, FF_Y, FF_W, FF_H, 0x222222)
      .setOrigin(1, 0)
      .setStrokeStyle(2, this.walkSpeed === 3 ? 0x44cc44 : 0x666666);
    this.ffLabel = this.add
      .text(FF_X - FF_W / 2, FF_Y + FF_H / 2, `${this.walkSpeed}×`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.ffBg.setInteractive({ useHandCursor: true });
    this.ffBg.on('pointerdown', () => this.toggleWalkSpeed());
    this.input.keyboard?.on('keydown-F', () => this.toggleWalkSpeed());
  }

  private toggleWalkSpeed(): void {
    this.walkSpeed = this.walkSpeed === 1 ? 3 : 1;
    this.ffLabel.setText(`${this.walkSpeed}×`);
    this.ffBg.setStrokeStyle(2, this.walkSpeed === 3 ? 0x44cc44 : 0x666666);
    appState.update((s) => ({
      ...s,
      preferences: {
        combatSpeed: s.preferences?.combatSpeed ?? 1,
        walkSpeed: this.walkSpeed,
      },
    }));
  }
```

Note: a mid-travel speed toggle does NOT retroactively change the in-flight tween's duration; it only affects future travels. That's the simplest behavior and matches how the combat scene's speed toggle works (it changes future playback, not the in-flight clip).

- [ ] **Step 3.4: Implement `buildHeroes` with bob/rotate tweens and HP bars**

```ts
  private buildHeroes(party: readonly Hero[]): void {
    party.forEach((hero, slot) => {
      if (slot >= HERO_X_BY_SLOT.length) return; // safety; PARTY_SIZE = 3
      const startX = HERO_X_BY_SLOT[slot] - WALK_DISTANCE;
      const bodyCenterY = GROUND_Y - HERO_BODY_HALF;

      const paperdoll = new Paperdoll(this, 0, 0, heroToLoadout(hero));
      paperdoll.setPosition(0, bodyCenterY);
      paperdoll.setScale(HERO_BODY_SCALE);

      const hpBarY = GROUND_Y + HPBAR_BELOW_FEET;
      const hpBarBg = this.add.rectangle(0, hpBarY, HP_BAR_W, HP_BAR_H, 0x333333);
      const ratio = hero.maxHp > 0 ? hero.currentHp / hero.maxHp : 0;
      const hpBarFill = this.add
        .rectangle(-HP_BAR_W / 2, hpBarY, HP_BAR_W * ratio, HP_BAR_H, this.hpColor(ratio))
        .setOrigin(0, 0.5);

      const container = this.add.container(startX, 0, [paperdoll, hpBarBg, hpBarFill]);

      // Bob (vertical sine) + rotate (sine) — phase-offset per slot so heroes
      // bob/rotate out of sync, looking more natural than synchronized.
      const bobPhase = slot * 333; // ms
      this.tweens.add({
        targets: container,
        y: { from: 0, to: -3 },
        duration: 500,
        yoyo: true,
        repeat: -1,
        delay: bobPhase,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: paperdoll,
        angle: { from: -5, to: 5 },
        duration: 500,
        yoyo: true,
        repeat: -1,
        delay: bobPhase,
        ease: 'Sine.easeInOut',
      });

      this.heroVisuals.push({ container, paperdoll, hpBarBg, hpBarFill });
    });
  }

  private hpColor(ratio: number): number {
    if (ratio > 0.6) return 0x4caf50;
    if (ratio > 0.3) return 0xffcc66;
    return 0xcc6666;
  }
```

- [ ] **Step 3.5: Implement `startWalk` with the timed HP-tick fire**

```ts
  private startWalk(): void {
    const totalDuration = TOTAL_TRAVEL_MS / this.walkSpeed;
    const tickDelay = totalDuration * HP_TICK_FRACTION;

    // Schedule the HP-tick popups + bar updates at step 3.
    this.time.delayedCall(tickDelay, () => this.fireHpTick());

    // Walk tween — slide each hero's container right by WALK_DISTANCE.
    this.heroVisuals.forEach((visual, slot) => {
      const targetX = HERO_X_BY_SLOT[slot];
      this.tweens.add({
        targets: visual.container,
        x: targetX,
        duration: totalDuration,
        ease: 'Linear',
        // Only fire the on-complete callback once (from slot 0's tween) to avoid
        // triple-firing the scene transition.
        onComplete: slot === 0 ? () => this.onTravelComplete() : undefined,
      });
    });
  }

  private fireHpTick(): void {
    const run = appState.get().runState;
    if (!run) return;
    this.heroVisuals.forEach((visual, slot) => {
      const delta = this.deltas[slot] ?? 0;
      // Update HP bar to reflect post-tick state (state was already mutated
      // pre-travel in dungeon_scene's onNodeClicked; visual just catches up).
      const hero = run.party[slot];
      if (hero) {
        const ratio = hero.maxHp > 0 ? hero.currentHp / hero.maxHp : 0;
        visual.hpBarFill.width = HP_BAR_W * ratio;
        visual.hpBarFill.setFillStyle(this.hpColor(ratio));
      }
      // Render popup if there was a delta.
      if (delta !== 0) this.spawnHpPopup(visual.container, delta);
    });
  }

  private spawnHpPopup(parent: Phaser.GameObjects.Container, delta: number): void {
    const text = delta > 0 ? `+${delta}` : `${delta}`;
    const color = delta > 0 ? '#4caf50' : '#cc6666';
    const popup = this.add
      .text(parent.x, GROUND_Y - HERO_BODY_HALF * 2 - 8, text, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: popup,
      y: popup.y - 12,
      alpha: 0,
      duration: POPUP_DURATION_MS,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.destroy(),
    });
  }

  private onTravelComplete(): void {
    this.scene.start('dungeon');
  }
```

Note on the popup `parent.x`: the popup is added directly to the scene (not as a child of the container), so it stays put as the hero finishes walking. We position it at `parent.x` at the moment of firing — effectively above the hero at step 3 of travel.

- [ ] **Step 3.6: Register `TravelScene` in `main.ts`**

Open `src/main.ts`. Add the import (alphabetical insertion, after `TavernPanelScene`):

```ts
import { TavernPanelScene } from './scenes/tavern_panel_scene';
import { TravelScene } from './scenes/travel_scene';
import { TreasureRoomOverlayScene } from './scenes/treasure_room_overlay_scene';
```

In the scene array (around line 35-55), add `TravelScene` after `DungeonScene`:

```ts
    DungeonScene,
    TravelScene,
    CombatScene,
```

- [ ] **Step 3.7: Typecheck + full suite**

Run: `npm run build && npm test`

Expected: typecheck passes, all 1479 tests pass. No new test failures (the scene exists but is never launched yet).

If typecheck complains about an import path, double-check the `@render/paperdoll` and `@heroes/hero` paths — they should match the existing imports in `combat_actor.ts`.

---

## Task 4: Wire dungeon scene → travel scene → dungeon scene

After this task: clicking a next-row node fires the travel scene, which plays the walk + popup, then returns to the dungeon scene which auto-engages the destination. This is the player-visible ship state.

**Files:**
- Modify: `src/scenes/dungeon_scene.ts`

- [ ] **Step 4.1: Add the imports**

Open `src/scenes/dungeon_scene.ts`. Find the imports block (around line 1-20). Add:

```ts
import { applyTravelTick, ... } from '@run/run_state';
```

(Add `applyTravelTick` to the existing import list from `@run/run_state`.)

Also add:

```ts
import { setTravelDeltas } from './travel_handoff';
```

- [ ] **Step 4.2: Wire `onNodeClicked` to launch travel scene**

Find `onNodeClicked` (around line 460). Replace the fork-pick branch:

```ts
  private onNodeClicked(nodeId: string): void {
    const run = appState.get().runState;
    if (!run || run.status !== 'in_dungeon') return;

    // Click on the current node when awaiting engage (post walk-in only):
    // engage combat / open the overlay.
    if (this.awaitingEngage && nodeId === run.currentNodeId) {
      this.awaitingEngage = false;
      this.refreshNodeStates();
      this.handleArrival();
      return;
    }

    if (!run.awaitingFork) return;
    const cur = currentNode(run);
    if (!cur.nextNodeIds.includes(nodeId)) return;

    // Advance currentNodeId, then apply per-edge HP tick BEFORE handing off to
    // the travel scene so saved state is consistent if the user closes mid-travel.
    appState.update((s) => {
      const advanced = chooseNextNode(s.runState!, nodeId);
      const { runState: postTick, deltas } = applyTravelTick(advanced);
      setTravelDeltas(deltas);
      return { ...s, runState: postTick };
    });
    this.scene.start('travel');
  }
```

- [ ] **Step 4.3: Update `create()` to handle return-from-travel**

Find `create()` (around line 96). The current end of `create()` reads:

```ts
    const handoff = consumeCombatResult();
    if (handoff) {
      this.processCombatReturn(handoff.result, handoff.rngStateAfter);
    } else {
      this.refreshHud();
      this.refreshNodeStates();
      this.refreshStatusBar();
      this.setState('walking_in');
    }
  }
```

Replace with:

```ts
    const handoff = consumeCombatResult();
    if (handoff) {
      this.processCombatReturn(handoff.result, handoff.rngStateAfter);
    } else if (state.runState.traversedNodeIds.length === 1) {
      // First node of the floor — true walk-in from off-screen.
      this.refreshHud();
      this.refreshNodeStates();
      this.refreshStatusBar();
      this.setState('walking_in');
    } else {
      // Returning from travel scene — party is already at currentNodeId per
      // the pre-travel state mutation. Snap the token (no walk-in tween) and
      // auto-engage; the player chose this node by clicking, so consent is
      // aligned (no awaitingEngage gate needed).
      const pos = this.partyTokenPosFor(state.runState.currentNodeId);
      this.partyToken.x = pos.x;
      this.partyToken.y = pos.y;
      this.refreshHud();
      this.refreshNodeStates();
      this.refreshStatusBar();
      this.handleArrival();
    }
  }
```

- [ ] **Step 4.4: Typecheck + full suite**

Run: `npm run build && npm test`

Expected: typecheck passes, all 1479 tests pass.

If a test that uses helper functions in `run_state.test.ts` fails (e.g., `advanceToBossNode` or `navigateToShop`), it likely means the helper relied on the old fork-click + walking_to_next behavior. Those helpers don't go through `onNodeClicked` (they call `chooseNextNode` directly), so they should be unaffected. If something does break, investigate whether the helper synthesizes a state that needs `applyTravelTick` for parity — most likely it does NOT (helpers test the run-state module in isolation; travel scene is a UI concern).

- [ ] **Step 4.5: Manual smoke test instructions**

Per memory ("skip browser smoke by default"), do NOT auto-launch the browser. Prepare these instructions for the user:

```
Phase 6a smoke-test checklist:
1. `npm run dev`, open http://localhost:5173.
2. Start a fresh expedition into the Crypt.
3. Walk in to the start node (Phase 4 walk-in tween still plays). Click start
   node to engage combat. Win.
4. Result panel dismissed → fork choices light up → click a next-row node.
5. **Travel scene fires.** You should see:
   - Dark purple corridor backdrop with ground line.
   - 3 hero paperdolls walking left-to-right, single-file (slot 1 frontmost on
     the right). Each bobs and rotates out of sync.
   - Per-hero HP bars below feet.
   - Floor / pack info top-left/right; 1×/3× toggle below pack.
   - At ~3s in (step 3 of 5), HP popups appear above each hero: "+1" green for
     unwounded heroes, "-1" red for wounded heroes, no popup if at maxHp/no
     change. HP bars visibly update.
6. Travel completes (~7.5s at 1×) → returns to dungeon scene → next node's
   content fires immediately (combat starts, shop opens, etc.). NO walk-in
   tween, NO awaitingEngage gate (consent already given by clicking).
7. Click 1× → 3× toggle in travel scene; persists. Future travels are 3× faster
   (~2.5s instead of 7.5s).
8. Press F to toggle from keyboard. Same effect.
9. Confirm wound HP loss is permanent across travels — a hero with one wound
   loses 1 HP per edge traveled.
10. A hero at 1 HP with a wound: takes the tick (popup shows "-1") but HP stays
    at 1 (floored — travel cannot kill).
```

---

## Task 5: TODO + HISTORY housekeeping

After this task: TODO reflects the Phase 6+ decomposition (6a/6b/6c) with 6a marked ✅; HISTORY entry filed.

**Files:**
- Modify: `TODO.md`
- Modify: `HISTORY.md`

- [ ] **Step 5.1: Decompose Phase 6+ in TODO.md**

Open `TODO.md`. Find the `Phase 6+ — Travel-time effects` block under entry #30. It currently reads:

```
  - **Phase 6+ — Travel-time effects** (each its own brainstorm, building on Phase 4):
    - Surprise encounters (RNG + node-injection mid-edge).
    - Passive HP changes per step (heal if healthy, damage if wounded/sick).
    - Hero chatter (text snippets + display widget).
```

Replace with:

```
  - **Phase 6 — Travel scene + per-step events** (decomposed 2026-05-03 brainstorm into three sub-phases; original framing assumed map-only inline events, refactored to a dedicated travel scene where heroes walk visibly between nodes):
    - **Phase 6a — Travel scene shell + per-step HP changes.** ✅ *Shipped 2026-05-03 (see HISTORY).* New `'travel'` scene with bobbing/rotating hero sprites walking left-to-right; per-edge HP tick at step 3 (±1, wound-binary, capped/floored, never kills). Spec: `docs/superpowers/specs/2026-05-03-phase-6a-travel-scene-design.md`.
    - **Phase 6b — Hero chatter.** Probabilistic chatter bubbles at step 2 / step 4. New chatter data module + display widget. Pure flavor; no mechanical impact. Layers onto Phase 6a's per-step infrastructure.
    - **Phase 6c — Surprise encounters with in-corridor combat.** RNG-driven enemy injection at any step; pause the walk tween, spawn enemies on the right, launch combat as overlay/sub-scene over the travel backdrop. Win → resume walking. Wipe → standard wipe path. Largest of the three; needs its own brainstorm.
```

- [ ] **Step 5.2: Add the HISTORY entry**

Open `HISTORY.md`. Insert at the top (newest first), per the slim template:

```markdown
### 2026-05-03 · Map-based dungeon scene — Phase 6a (travel scene + per-step HP) (Cluster B · 30)

- **Why:** TODO #30 Phase 6+ decomposed during 2026-05-03 brainstorm into 6a/6b/6c. 6a builds the foundation: a dedicated `'travel'` scene replacing the Phase 4 inline `walking_to_next` tween, with bobbing/rotating hero sprites, per-hero HP bars, and one HP tick per edge as the first per-step event. 6b (chatter) and 6c (surprise encounters with in-corridor combat) layer onto the per-step infrastructure here.
- **Decisions:**
  - **New `'travel'` scene over overlay/inline-state.** The travel scene is a substantively different visual surface (corridor with bobbing heroes vs. the map graph). Overlay framing felt wrong — overlays are usually small panels. Inline state would bloat the dungeon scene. New scene keeps `dungeon_scene.ts` focused on the map and the travel scene focused on travel.
  - **Bob + rotate over walk-cycle frames.** No walk-cycle sprite art exists; rather than an asset detour, vertical bob (±3px sine) + rotation (±5° sine) on existing static paperdolls reads as walking. Phase-offset per hero so they bob/rotate out of sync — looks more natural than synchronized.
  - **Per-edge ±1 HP, floor at 1, never kills.** User-locked: travel chip damage cannot deliver the killing blow. Wounded hero at 1 HP enters the next combat at 1 HP and is in danger from any hit, but doesn't die from chip alone. Magnitude is small enough to be predictable balance (24 HP per run for a wounded hero ≈ 1 fight's worth).
  - **State mutation pre-travel, not mid-travel.** `applyTravelTick` runs in `dungeon_scene.ts:onNodeClicked` BEFORE `scene.start('travel')`. Travel scene just animates popups for already-applied deltas. Trade-off: closing mid-travel and reopening shows the post-tick state at destination instead of mid-animation — but state is internally consistent and that's the right priority.
  - **Walk-in (dungeon entry) does NOT use travel scene.** No "from" node to traverse from. Walk-in keeps the existing tween + Phase 4 `awaitingEngage` gate. Travel scene is only for inter-node transitions.
- **Surprises:**
  - **Mid-travel walk-speed toggle does not retroactively change the in-flight tween.** Phaser's `tweens.add` locks duration at start; toggling during a walk affects future travels only. Matches the combat scene's speed-toggle semantics; called out in scene comments so a future implementer doesn't try to "fix" it as a bug.
- **Source:** TODO.md Cluster B · 30 Phase 6a. Spec: `docs/superpowers/specs/2026-05-03-phase-6a-travel-scene-design.md`. Plan: `docs/superpowers/plans/2026-05-03-phase-6a-travel-scene.md`. Test count delta: 1471 → 1479 (+8: applyTravelTick lifecycle).
```

- [ ] **Step 5.3: Final full-suite run**

Run: `npm test`

Expected: ALL 1479 tests pass.

- [ ] **Step 5.4: Report to the user**

Summarize: Phase 6a shipped. Files touched (new travel scene + handoff module + applyTravelTick helper + dungeon scene wiring), test count delta (1471 → 1479), smoke-test checklist (from step 4.5) for the user to run. Done.
