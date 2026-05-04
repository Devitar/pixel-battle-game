# Phase 6c — Unified Corridor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all in-dungeon-action moments (travel, combat, result/wipe panels, node overlays) into a single `'corridor'` scene with camera-style world scrolling. Delete the standalone combat scene. The dungeon scene narrows to its core role: between-travel map navigation.

**Architecture:** Seven tasks in dependency order. Each leaves the game in a working (if intermediate) state. (1) Rename `travel`→`corridor`, mechanical-only refactor. (2) Replace Paperdoll-only hero visuals with `CombatActor`, align hero coordinates to combat scene's. (3) Camera scroll — heroes static, world container scrolls left with placeholder tile pattern + pillar/torch decorations. (4) Move arrival logic + result/wipe panels + overlay launches from dungeon scene to corridor; combat still fires standalone combat scene as today (intermediate state with brief double-swap). (5) Inline combat playback into corridor; delete combat scene + combat handoff; embed enemies in scrolling world. (6) Corridor handles first-node entry (no walk-in tween; awaitingEngage gate moves to corridor). (7) TODO + HISTORY.

**Tech Stack:** TypeScript 6 (strict), Vitest 4, Phaser 4 (`Phaser.GameObjects.Container` for world + hero containers, tween chains for scroll/bob/rotate, `CombatPlayback` reused as-is).

**Spec:** `docs/superpowers/specs/2026-05-03-phase-6c-unified-corridor-design.md` (locked design from 2026-05-03 brainstorm).

**Repo conventions** (from CLAUDE.md / memory):
- **No commits anywhere in this plan.** The user runs commits manually. Each task's "Done" checkpoint is a review point.
- Use `git mv` for file renames so history is preserved.
- The Phaser firewall: `dungeon/`, `run/`, `data/` files MUST NOT `import 'phaser'`. All scene-level work stays in `src/scenes/`.
- Save schema stays at version 1; no migrations. No state shape changes in this phase.
- Don't materialize empty directories.
- HISTORY entries use the slim template (~15-25 lines). Phase 6c is large — entry can stretch a bit but stay focused.
- Before editing data-shape constants, grep `__tests__/` (per memory). No data-shape changes here.

---

## File structure (end state)

| Path | Action | Purpose |
|---|---|---|
| `src/scenes/corridor_scene.ts` | **Renamed from `travel_scene.ts`** + heavy modify | New name. Hosts travel + combat + result/wipe + overlays. End state ~700-800 lines. |
| `src/scenes/corridor_handoff.ts` | **Renamed from `travel_handoff.ts`** | Same module, renamed for clarity. |
| `src/scenes/combat_scene.ts` | **Delete** (Task 5) | Absorbed into corridor scene. |
| `src/scenes/combat_handoff.ts` | **Delete** (Task 5) | No longer needed (combat result no longer crosses scene boundaries). |
| `src/scenes/dungeon_scene.ts` | **Modify** | Loses: result panel, wipe panel, awaitingEngage gate, processCombatReturn, walk-in tween. Keeps: map render, fog-of-war, fork-pick click handling, transition to corridor. End state ~500-600 lines (down from 851). |
| `src/scenes/camp_node_overlay_scene.ts` | **Modify** (Task 4) | `scene.resume('dungeon')` → `scene.resume('corridor')`. |
| `src/scenes/shop_overlay_scene.ts` | **Modify** (Task 4) | Same. |
| `src/scenes/event_overlay_scene.ts` | **Modify** (Task 4) | Same. |
| `src/scenes/treasure_room_overlay_scene.ts` | **Modify** (Task 4) | Same. |
| `src/main.ts` | **Modify** | `TravelScene` → `CorridorScene`; remove `CombatScene` (Task 5). |
| `TODO.md`, `HISTORY.md` | **Modify** (Task 7) | Mark 6c ✅; add new 6d entry. |

---

## Task 1: Rename + scaffold

After this task: `travel` scene renamed to `corridor`. No behavior change. Game plays identically; just different scene/file names.

**Files:**
- Rename: `src/scenes/travel_scene.ts` → `src/scenes/corridor_scene.ts` (`git mv`)
- Rename: `src/scenes/travel_handoff.ts` → `src/scenes/corridor_handoff.ts` (`git mv`)
- Modify: `src/scenes/dungeon_scene.ts`
- Modify: `src/main.ts`

- [ ] **Step 1.1: Run baseline tests**

Run: `npm test`

Expected: ALL 1486 tests pass. Note the count.

- [ ] **Step 1.2: `git mv` the scene file**

Run: `git mv src/scenes/travel_scene.ts src/scenes/corridor_scene.ts`

- [ ] **Step 1.3: `git mv` the handoff file**

Run: `git mv src/scenes/travel_handoff.ts src/scenes/corridor_handoff.ts`

- [ ] **Step 1.4: Rename the class + Phaser key inside the new corridor scene file**

Open `src/scenes/corridor_scene.ts`. Find:

```ts
import { consumeTravelDeltas } from './travel_handoff';
```

Replace with:

```ts
import { consumeTravelDeltas } from './corridor_handoff';
```

Find the class declaration:

```ts
export class TravelScene extends Phaser.Scene {
  // ...
  constructor() {
    super('travel');
  }
```

Replace with:

```ts
export class CorridorScene extends Phaser.Scene {
  // ...
  constructor() {
    super('corridor');
  }
```

(The class name change requires updating the warning string near the `'in_dungeon'` guard — find any `'TravelScene'` mentions in console.warn calls and replace with `'CorridorScene'`.)

- [ ] **Step 1.5: Update `main.ts` import + registration**

Open `src/main.ts`. Find:

```ts
import { TravelScene } from './scenes/travel_scene';
```

Replace with:

```ts
import { CorridorScene } from './scenes/corridor_scene';
```

Find the scene array entry:

```ts
    DungeonScene,
    TravelScene,
    CombatScene,
```

Replace with:

```ts
    DungeonScene,
    CorridorScene,
    CombatScene,
```

- [ ] **Step 1.6: Update `dungeon_scene.ts` to launch `'corridor'` instead of `'travel'`**

Open `src/scenes/dungeon_scene.ts`. Find the imports block:

```ts
import { setTravelDeltas } from './travel_handoff';
```

Replace with:

```ts
import { setTravelDeltas } from './corridor_handoff';
```

Find the `scene.start` in `onNodeClicked`:

```ts
    this.scene.start('travel');
```

Replace with:

```ts
    this.scene.start('corridor');
```

- [ ] **Step 1.7: Typecheck + full-suite run**

Run: `npm run build && npm test`

Expected: typecheck passes, all 1486 tests pass.

If the build complains about `TravelScene` imports anywhere else, grep for them and update:

```bash
grep -rn "TravelScene\|'travel'" src/
```

Should return nothing (or only matches in plans/specs/HISTORY which are documentation).

- [ ] **Step 1.8: Smoke test**

`npm run dev`, walk through one expedition: enter dungeon → walk-in → engage combat → win → next node → travel → arrive. Verify behavior matches pre-rename. The console should show no warnings about scene-key mismatches.

---

## Task 2: Hero rendering — CombatActor + position alignment

After this task: heroes render via `CombatActor` (paperdoll + name label + HP bar + status strip) at combat scene's coordinates. Bob applies to actor container; rotate to inner paperdoll only. Game still works in travel + the existing combat scene swap.

**Files:**
- Modify: `src/scenes/corridor_scene.ts`

- [ ] **Step 2.1: Add `CombatActor` import + adjust constants**

Open `src/scenes/corridor_scene.ts`. In imports add:

```ts
import { CombatActor } from '@render/combat_actor';
import type { CombatantId } from '@combat/types';
```

Remove the now-unused imports if present:

```ts
import { Paperdoll } from '@render/paperdoll';      // remove
import { heroToLoadout } from '@render/hero_loadout'; // remove
```

Replace the existing position constants (around the top of the file) with combat-aligned values:

```ts
// Mirror combat scene exactly so heroes render identically across travel+combat.
const ROW_Y = 300;          // CombatActor anchor y; matches combat_scene.ts
const HERO_X_BY_SLOT: readonly number[] = [400, 320, 240]; // slot 0/1/2 → PARTY_X[1/2/3]
const FLOOR_LINE_Y = 324;   // where heroes' feet land (ROW_Y + CombatActor's FLOOR_Y=24)
const SCENE_W = 960;
const SCENE_H = 540;
const CEILING_Y = 240;      // ceiling band ends here
```

Remove the old `GROUND_Y = 380` and `HERO_BODY_HALF`/`HERO_BODY_SCALE`/`HERO_FRAME_SIZE` constants (CombatActor handles body sizing internally).

Update the `HP_BAR_W`/`HP_BAR_H`/`HPBAR_BELOW_FEET` constants — these were for the standalone HP bar that's now inside CombatActor. Remove them entirely (CombatActor owns its HP bar).

- [ ] **Step 2.2: Replace `HeroVisual` interface and `heroVisuals` field**

Find:

```ts
interface HeroVisual {
  container: Phaser.GameObjects.Container;
  paperdoll: Paperdoll;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
}
```

Replace with:

```ts
interface HeroVisual {
  actor: CombatActor;
  combatantId: CombatantId;
}
```

Find the field declaration:

```ts
private heroVisuals: HeroVisual[] = [];
```

Keep as-is (just the interface shape changed).

- [ ] **Step 2.3: Rewrite `buildBackdrop` to match new floor line position**

Find `buildBackdrop`. Replace with:

```ts
  private buildBackdrop(): void {
    // Solid base background.
    this.add.rectangle(0, 0, SCENE_W, SCENE_H, 0x1a1020).setOrigin(0, 0);
    // Ceiling band suggesting the corridor's top.
    this.add.rectangle(0, 0, SCENE_W, CEILING_Y, 0x251530).setOrigin(0, 0);
    // Floor line where heroes' feet land.
    this.add.rectangle(0, FLOOR_LINE_Y, SCENE_W, 1, 0x555555).setOrigin(0, 0);
    // Subtle floor band below.
    this.add.rectangle(0, FLOOR_LINE_Y + 1, SCENE_W, SCENE_H - FLOOR_LINE_Y - 1, 0x140820).setOrigin(0, 0);
  }
```

- [ ] **Step 2.4: Rewrite `buildHeroes` to use `CombatActor`**

Find `buildHeroes`. Replace with:

```ts
  private buildHeroes(party: readonly Hero[]): void {
    party.forEach((hero, slot) => {
      if (slot >= HERO_X_BY_SLOT.length) return;
      const x = HERO_X_BY_SLOT[slot];
      const combatantId = `p${slot}` as CombatantId;
      const actor = new CombatActor(this, x, ROW_Y, {
        kind: 'hero',
        combatantId,
        displayName: hero.name,
        hero,
        currentHp: hero.currentHp,
        maxHp: hero.maxHp,
      });

      // Bob (vertical sine) on the actor container; phase-offset per slot.
      const bobPhase = slot * 333;
      this.tweens.add({
        targets: actor,
        y: { from: ROW_Y, to: ROW_Y - 3 },
        duration: 500,
        yoyo: true,
        repeat: -1,
        delay: bobPhase,
        ease: 'Sine.easeInOut',
      });
      // Rotate the inner paperdoll only (so HP bar + name don't tilt).
      // CombatActor exposes `bodyView` as its first child; access via list[0].
      const paperdollLayer = actor.list[0] as Phaser.GameObjects.Container;
      this.tweens.add({
        targets: paperdollLayer,
        angle: { from: -5, to: 5 },
        duration: 500,
        yoyo: true,
        repeat: -1,
        delay: bobPhase,
        ease: 'Sine.easeInOut',
      });

      this.heroVisuals.push({ actor, combatantId });
    });
  }
```

- [ ] **Step 2.5: Update `fireHpTick` to use the actor's HP bar**

Find `fireHpTick`. Replace with:

```ts
  private fireHpTick(): void {
    const run = appState.get().runState;
    if (!run) return;
    this.heroVisuals.forEach((visual, slot) => {
      const delta = this.deltas[slot] ?? 0;
      const hero = run.party[slot];
      if (hero) {
        // CombatActor exposes setHpBar(currentHp, maxHp) which animates the bar.
        // Returned Promise is fine to ignore — we don't await it.
        void visual.actor.setHpBar(hero.currentHp, hero.maxHp);
      }
      if (delta !== 0) this.spawnHpPopup(visual.actor, delta);
    });
  }
```

- [ ] **Step 2.6: Confirm `setHpBar` exists on CombatActor**

Run:

```bash
grep -n "setHpBar" src/render/combat_actor.ts
```

Expected: a public method `setHpBar(currentHp: number, maxHp: number): Promise<void>`. This is the existing combat-playback path for HP updates; reusing it ensures travel HP ticks animate the same way combat damage does.

No code changes needed in this step if it exists.

- [ ] **Step 2.7: Update `spawnHpPopup` to position above the actor**

Find `spawnHpPopup`. Replace with:

```ts
  private spawnHpPopup(actor: CombatActor, delta: number): void {
    const text = delta > 0 ? `+${delta}` : `${delta}`;
    const color = delta > 0 ? '#4caf50' : '#cc6666';
    // Actor anchor is at ROW_Y; head is approximately ROW_Y - 48 (body height).
    const popupY = ROW_Y - 56;
    const popup = this.add
      .text(actor.x, popupY, text, {
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
```

- [ ] **Step 2.8: Update `spawnChatterBubble` to position above the actor**

Find `spawnChatterBubble`. The bubble was added as a child of the hero container (so it followed the hero); now the actor IS the hero container. Update the method:

```ts
  private spawnChatterBubble(heroIndex: number, line: string): void {
    const visual = this.heroVisuals[heroIndex];
    if (!visual) return;

    const text = this.add
      .text(0, 0, line, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: CHATTER_TEXT_COLOR,
        fontStyle: 'italic',
      })
      .setOrigin(0.5);

    const padX = 6;
    const padY = 4;
    const w = text.width + padX * 2;
    const h = text.height + padY * 2;
    // CombatActor anchor at ROW_Y=300; bubble above the hero head.
    // Inner-actor coordinates: head top is around y=-48 (above actor anchor).
    const bubbleY = -56;

    const bg = this.add.graphics();
    bg.fillStyle(CHATTER_BUBBLE_BG, 1);
    bg.fillRoundedRect(-w / 2, bubbleY - h / 2, w, h, 3);
    bg.lineStyle(1, CHATTER_BUBBLE_BORDER, 1);
    bg.strokeRoundedRect(-w / 2, bubbleY - h / 2, w, h, 3);
    bg.fillStyle(CHATTER_BUBBLE_BG, 1);
    bg.fillTriangle(-3, bubbleY + h / 2, 3, bubbleY + h / 2, 0, bubbleY + h / 2 + 4);
    bg.lineStyle(1, CHATTER_BUBBLE_BORDER, 1);
    bg.lineBetween(-3, bubbleY + h / 2, 0, bubbleY + h / 2 + 4);
    bg.lineBetween(0, bubbleY + h / 2 + 4, 3, bubbleY + h / 2);

    text.setPosition(0, bubbleY);

    // Add as children of the actor so the bubble follows the hero (including bob).
    visual.actor.add([bg, text]);

    bg.setAlpha(0);
    text.setAlpha(0);
    this.tweens.add({
      targets: [bg, text],
      alpha: 1,
      duration: CHATTER_FADE_IN_MS,
      ease: 'Cubic.easeOut',
    });
    const holdMs = CHATTER_HOLD_MS / this.walkSpeed;
    this.time.delayedCall(CHATTER_FADE_IN_MS + holdMs, () => {
      this.tweens.add({
        targets: [bg, text],
        alpha: 0,
        duration: CHATTER_FADE_OUT_MS,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          bg.destroy();
          text.destroy();
        },
      });
    });
  }
```

- [ ] **Step 2.9: Remove the walk tween from `startWalk`**

Find `startWalk`. The current implementation tweens each hero's container x. We're keeping heroes static now (Task 3 will introduce world scrolling instead). Replace with:

```ts
  private startWalk(): void {
    const totalDuration = TOTAL_TRAVEL_MS / this.walkSpeed;
    const tickDelay = totalDuration * HP_TICK_FRACTION;

    // Schedule the HP-tick popups at step 3.
    this.time.delayedCall(tickDelay, () => this.fireHpTick());

    // Heroes are static (Task 3 will add scrolling-world motion). On the
    // travel-duration timer, transition back to dungeon for the next click.
    this.time.delayedCall(totalDuration, () => this.onTravelComplete());
  }
```

- [ ] **Step 2.10: Typecheck + full-suite run**

Run: `npm run build && npm test`

Expected: typecheck passes, all 1486 tests pass.

If `setHp` (or whatever method name you used in Step 2.6) is missing on `CombatActor`, the typecheck will tell you. Fix per Step 2.6.

- [ ] **Step 2.11: Smoke test**

Travel scene renders heroes via CombatActor: paperdoll + name label below + HP bar below name. Heroes static (no walk). HP tick popup fires at ~3s. Chatter bubble appears above heroes (~70% chance). On travel completion → returns to dungeon → engages destination.

---

## Task 3: Camera scroll — heroes static, world scrolls left

After this task: a "world container" with placeholder tile pattern + pillar/torch placeholder sprites scrolls leftward during travel. Heroes remain static. Visual sense of motion restored.

**Files:**
- Modify: `src/scenes/corridor_scene.ts`

- [ ] **Step 3.1: Add scroll-related constants**

Near the existing constants in `corridor_scene.ts`, add:

```ts
const WORLD_SCROLL_DISTANCE = 200;  // matches Phase 6a's WALK_DISTANCE
const TILE_W = 32;                   // floor tile width
const TILE_COLORS: readonly number[] = [0x1a1020, 0x251530];
const PILLAR_W = 8;
const PILLAR_H = 60;
const PILLAR_COLOR = 0x3a2a1a;       // placeholder; real torch art replaces later
const PILLAR_SPACING = 160;          // every 5 tiles
```

- [ ] **Step 3.2: Add a `worldContainer` field**

Add to the field declarations:

```ts
private worldContainer!: Phaser.GameObjects.Container;
```

- [ ] **Step 3.3: Build the world container in `create()`**

In `create()`, between `buildBackdrop()` and `buildHud()`, add:

```ts
    this.buildWorldContainer();
```

- [ ] **Step 3.4: Implement `buildWorldContainer`**

Add the method. The container holds floor tiles + pillar placeholders, sized to extend beyond the visible scene by `WORLD_SCROLL_DISTANCE` so scrolling leftward keeps the right side filled:

```ts
  private buildWorldContainer(): void {
    this.worldContainer = this.add.container(0, 0);

    // Floor tiles spanning from left edge to right + scroll buffer.
    const tilesNeeded = Math.ceil((SCENE_W + WORLD_SCROLL_DISTANCE) / TILE_W);
    for (let i = 0; i < tilesNeeded; i++) {
      const x = i * TILE_W;
      const color = TILE_COLORS[i % TILE_COLORS.length];
      const tile = this.add.rectangle(x, FLOOR_LINE_Y + 1, TILE_W, SCENE_H - FLOOR_LINE_Y - 1, color).setOrigin(0, 0);
      this.worldContainer.add(tile);
    }

    // Pillar/torch placeholders at intervals.
    const pillarsNeeded = Math.ceil((SCENE_W + WORLD_SCROLL_DISTANCE) / PILLAR_SPACING);
    for (let i = 0; i < pillarsNeeded; i++) {
      const x = i * PILLAR_SPACING + PILLAR_SPACING / 2;
      const pillar = this.add.rectangle(x, FLOOR_LINE_Y - PILLAR_H, PILLAR_W, PILLAR_H, PILLAR_COLOR).setOrigin(0.5, 0);
      this.worldContainer.add(pillar);
    }
  }
```

The `worldContainer.x` starts at 0 (no scroll). The scroll tween (next step) moves it left.

- [ ] **Step 3.5: Add scroll tween to `startWalk`**

Update `startWalk`:

```ts
  private startWalk(): void {
    const totalDuration = TOTAL_TRAVEL_MS / this.walkSpeed;
    const tickDelay = totalDuration * HP_TICK_FRACTION;

    // World scrolls left over the travel duration.
    this.tweens.add({
      targets: this.worldContainer,
      x: -WORLD_SCROLL_DISTANCE,
      duration: totalDuration,
      ease: 'Linear',
      onComplete: () => this.onTravelComplete(),
    });

    // Schedule the HP-tick popups at step 3.
    this.time.delayedCall(tickDelay, () => this.fireHpTick());
  }
```

(The `time.delayedCall(totalDuration, ...)` from Task 2 step 2.9 is replaced by the tween's `onComplete` — same trigger, just consolidated.)

- [ ] **Step 3.6: Verify backdrop → world container ordering**

The world container is drawn AFTER `buildBackdrop`'s base/ceiling/floor-band rectangles, so it renders ON TOP of them (visible). And it's drawn BEFORE `buildHud` and `buildHeroes`, so chrome and heroes render on top of it. Confirm this order in `create()`:

```ts
    this.buildBackdrop();
    this.buildWorldContainer();
    this.buildHud();
    this.buildHeroes(run.party);
    this.maybeScheduleChatter(run.party);
    this.startWalk();
```

- [ ] **Step 3.7: Typecheck + full-suite run**

Run: `npm run build && npm test`

Expected: typecheck passes, all 1486 tests pass.

- [ ] **Step 3.8: Smoke test**

Walk into a node. Expected:
- Heroes stay at fixed positions (slot 1 at x=400, slot 2 at x=320, slot 3 at x=240).
- Floor tiles + pillars scroll leftward.
- Pillars appear/disappear off the right/left edges as you'd expect.
- Travel still completes after ~7.5s and transitions to dungeon.

---

## Task 4: Corridor takes over arrival — overlays, result panel, wipe panel

After this task: the corridor scene handles all node arrivals. Result/wipe panels render in corridor. Overlays (shop/camp/event/treasure) launch over the corridor scene and resume corridor on close. **Combat still uses the standalone combat scene** (Task 5 inlines it). Brief intermediate state: combat node arrival = corridor → combat scene → corridor (one extra swap, fixed in Task 5).

**Files:**
- Modify: `src/scenes/corridor_scene.ts`
- Modify: `src/scenes/dungeon_scene.ts`
- Modify: `src/scenes/camp_node_overlay_scene.ts`
- Modify: `src/scenes/shop_overlay_scene.ts`
- Modify: `src/scenes/event_overlay_scene.ts`
- Modify: `src/scenes/treasure_room_overlay_scene.ts`

- [ ] **Step 4.1: Move `processCombatReturn`, `buildResultPanel`, `onResultDismiss`, `buildWipePanel`, `onWipeReturn` from dungeon scene to corridor scene**

Open `src/scenes/dungeon_scene.ts`. Locate these methods (search for `processCombatReturn`, `buildResultPanel`, etc.). Cut them out (along with related fields: `preCombatParty`, `combatLoot`, `wipeOutcome`, `resultPanel`).

Open `src/scenes/corridor_scene.ts`. Paste them in. Add the necessary imports at the top:

```ts
import type { CombatResult } from '@combat/types';
import type { Item, Rarity } from '@data/types';
import type { Node } from '@dungeon/node';
import { itemAffixDescription, itemDisplayName } from '@items/selectors';
import {
  applyTravelTick,
  chooseNextNode,
  completeCombat,
  currentNode,
  type WipeOutcome,
} from '@run/run_state';
import { createRngFromState } from '@util/rng';
import { consumeCombatResult } from './combat_handoff';
```

(Some of these may already be present — keep one copy of each.)

Add the field declarations to `CorridorScene`:

```ts
private preCombatParty: Hero[] = [];
private combatLoot: readonly Item[] = [];
private wipeOutcome?: WipeOutcome;
private resultPanel?: Phaser.GameObjects.Container;
```

Add necessary constants (copy from dungeon scene):

```ts
const COMBAT_NODE_REWARD = 15;
const BOSS_NODE_REWARD = 100;
const RARITY_HEX: Record<Rarity, string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
};
```

The `processCombatReturn`, `buildResultPanel`, `onResultDismiss`, `buildWipePanel`, `onWipeReturn` methods come over verbatim — but their `scene.start('camp')` / `scene.start('camp_screen')` transitions stay as they are (those are correct destinations).

The end-of-result-panel logic in `onResultDismiss` currently calls `setState('walking_to_next')` for the legacy auto-advance flow and returns early on awaitingFork. Update to: after dismiss, transition to `'dungeon'` for fork pick (since the player needs the map):

```ts
  private onResultDismiss(): void {
    this.resultPanel?.destroy(true);
    this.resultPanel = undefined;
    const run = appState.get().runState!;
    if (run.status === 'camp_screen') {
      this.scene.start('camp_screen');
      return;
    }
    // After combat win, return to dungeon for the next fork pick.
    this.scene.start('dungeon');
  }
```

- [ ] **Step 4.2: Update corridor scene's `create()` to handle combat handoff and arrival**

In `create()`, ADD the combat-handoff branch (so the corridor catches the result panel after combat scene completes). Replace the existing flow:

```ts
    this.buildBackdrop();
    this.buildWorldContainer();
    this.buildHud();
    this.buildHeroes(run.party);
    this.maybeScheduleChatter(run.party);

    const handoff = consumeCombatResult();
    if (handoff) {
      this.processCombatReturn(handoff.result, handoff.rngStateAfter);
    } else {
      this.startWalk();
    }
  }
```

(So if combat just finished, the corridor opens the result panel instead of starting a new walk.)

- [ ] **Step 4.3: Update corridor's `onTravelComplete` to launch overlays / combat at destination**

Find `onTravelComplete`. Replace with:

```ts
  private onTravelComplete(): void {
    const run = appState.get().runState;
    if (!run) return;
    const node = currentNode(run);
    if (node.type === 'shop') {
      this.scene.launch('shop_overlay');
      this.scene.pause();
      return;
    }
    if (node.type === 'camp') {
      this.scene.launch('camp_node_overlay');
      this.scene.pause();
      return;
    }
    if (node.type === 'event') {
      this.scene.launch('event_overlay');
      this.scene.pause();
      return;
    }
    if (node.type === 'treasure') {
      this.scene.launch('treasure_room_overlay');
      this.scene.pause();
      return;
    }
    // Combat node — fire the combat scene (intermediate; Task 5 inlines this).
    this.scene.start('combat');
  }
```

- [ ] **Step 4.4: Add a RESUME handler on the corridor scene for overlay close**

Below `create()`, add the events handler. Mirror the dungeon scene's RESUME flow but adapted: on overlay close, if not at boss-final, transition to dungeon for fork pick (player needs map after non-combat resolution).

```ts
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      const run = appState.get().runState;
      if (!run || run.status !== 'in_dungeon') {
        // Cashout from camp ended the run; transition to camp screen.
        this.scene.start('camp');
        return;
      }
      // After overlay close, return to dungeon for next fork pick.
      this.scene.start('dungeon');
    });
```

(Add this inside `create()` near the top, before the handoff check.)

- [ ] **Step 4.5: Strip dungeon scene of the now-moved logic**

Open `src/scenes/dungeon_scene.ts`. Remove:
- The `processCombatReturn` method.
- The `buildResultPanel` method.
- The `onResultDismiss` method.
- The `buildWipePanel` method.
- The `onWipeReturn` method.
- The `handleArrival` method (corridor handles arrival now).
- The `handleWalkInArrival` method (Task 6 will reintroduce a corridor-side equivalent).
- The `awaitingEngage` field (Task 6 moves this to corridor).
- The `setState`, `walking_in`, `walking_to_next`, `showing_result`, `showing_wipe` plumbing (corridor handles all in-action state).
- The `processCombatReturn` handoff branch in `create()`.
- The `consumeCombatResult` import.
- The `partyToken`, `buildPartyToken`, `partyTokenPosFor`, `tweenPartyTo`, `currentNodeIdSafe` (no longer needed — corridor renders heroes; map shows static map).

What stays in dungeon scene:
- Map rendering (nodes, edges, fog-of-war).
- `onNodeClicked` for fork picks (advance via `chooseNextNode`, `applyTravelTick`, `setTravelDeltas`, `scene.start('corridor')`).
- HUD top (floor info, pack info).
- Status bar bottom.

`create()` simplifies to:

```ts
  create(): void {
    this.nodeContainers = new Map();
    this.nodeBgByNodeId = new Map();
    this.nodeGlyphByNodeId = new Map();
    this.nodeLabelByNodeId = new Map();

    const state = appState.get();
    if (!state.runState || state.runState.status !== 'in_dungeon') {
      console.warn('DungeonScene entered without active runState');
      this.scene.start('camp');
      return;
    }

    this.layout = computeMapLayout(state.runState.currentFloorNodes, {
      left: MAP_LEFT,
      top: MAP_TOP,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    });
    this.visibility = computeVisibility(
      state.runState.currentFloorNodes,
      state.runState.currentNodeId,
      state.runState.traversedNodeIds,
      LOOKAHEAD_ROWS,
    );

    this.buildBackground();
    this.buildHud();
    this.buildEdges();
    this.buildNodes();
    this.buildStatusBar();

    this.refreshHud();
    this.refreshNodeStates();
    this.refreshStatusBar();
  }
```

(Note: `onNodeClicked` is the only interaction. No walk-in tween, no engage gate — Task 6 brings the engage gate back via the corridor.)

- [ ] **Step 4.6: Update overlay scenes to resume corridor instead of dungeon**

For each of the four overlay scene files, find `scene.resume('dungeon')` and replace with `scene.resume('corridor')`.

`src/scenes/camp_node_overlay_scene.ts`:

```ts
    this.scene.resume('corridor');
```

`src/scenes/shop_overlay_scene.ts`:

```ts
    this.scene.resume('corridor');
```

`src/scenes/event_overlay_scene.ts`:

```ts
    this.scene.resume('corridor');
```

`src/scenes/treasure_room_overlay_scene.ts`:

```ts
    this.scene.resume('corridor');
```

- [ ] **Step 4.7: Typecheck + full-suite run**

Run: `npm run build && npm test`

Expected: typecheck passes, all 1486 tests pass. Some scene-related tests might break if they reference dungeon-scene methods that moved — investigate per-failure.

If tests reference removed dungeon-scene methods (e.g., result panel building), the tests likely don't exist (Phaser scenes aren't unit-tested per repo convention). If they DO exist, update or remove.

- [ ] **Step 4.8: Smoke test**

Full expedition flow:
1. Enter dungeon → dungeon scene shows map (no walk-in tween anymore — Task 6 will fix this for the start node).
2. Click start node → corridor → world scrolls → arrives → fires combat scene → combat plays → returns to corridor → result panel in corridor → dismiss → back to dungeon.
3. Walk to a shop node → corridor → arrival → shop overlay over corridor → leave → resume corridor → transition to dungeon for fork pick.
4. Walk to a camp node → similar; camp overlay over corridor.

EXPECTED ROUGH EDGE: when player first enters dungeon, no walk-in tween fires (Task 6 fixes this). Currently they'll be at the start node with the map showing; clicking the start node should trigger combat scene directly via the dungeon's `onNodeClicked` → corridor → combat. There is no longer an `awaitingEngage` gate in this intermediate state. The first-node behavior is broken/unpolished until Task 6.

---

## Task 5: Inline combat in corridor — delete combat scene + handoff

After this task: combat plays in corridor (no scene swap). Combat scene file deleted. Combat handoff file deleted.

**Files:**
- Modify: `src/scenes/corridor_scene.ts` (heavy)
- Delete: `src/scenes/combat_scene.ts`
- Delete: `src/scenes/combat_handoff.ts`
- Modify: `src/main.ts`

- [ ] **Step 5.1: Add combat-related imports + constants to corridor scene**

Open `src/scenes/corridor_scene.ts`. Add imports:

```ts
import { resolveCombat } from '@combat/combat';
import type { CombatState } from '@combat/types';
import { ENEMIES } from '@data/enemies';
import type { Encounter } from '@dungeon/node';
import { ENEMY_VISUALS } from '@render/enemy_sprites';
import { buildCombatState } from '@run/combat_setup';
import { CombatPlayback, type CombatPlaybackHud } from './combat_playback';
```

Add constants:

```ts
const ENEMY_X_BY_SLOT: readonly number[] = [0, 560, 640, 720, 800];
const ROUND_COUNTER_Y = 24;
const ROUND_BANNER_Y = 200;
const ACTION_LOG_Y = 510;
const BOSS_BODY_SCALE = 4.5;
```

Add fields:

```ts
private actors = new Map<CombatantId, CombatActor>();
private playback?: CombatPlayback;
private combatHud?: CombatPlaybackHud;
private combatHudObjects: Phaser.GameObjects.GameObject[] = [];
```

(The existing `heroVisuals` array is parallel — `actors` map is keyed by combatantId and includes BOTH heroes and enemies for combat purposes.)

- [ ] **Step 5.2: Register heroes in the `actors` map at hero build time**

In `buildHeroes`, after pushing to `heroVisuals`, also register in `actors`:

```ts
      this.actors.set(combatantId, actor);
      this.heroVisuals.push({ actor, combatantId });
```

- [ ] **Step 5.3: Add `startCombatInPlace` method**

Add a method that resolves combat, builds enemy actors (positioned in the world container at end-of-scroll positions), builds the combat HUD, and starts playback:

```ts
  private startCombatInPlace(): void {
    const state = appState.get();
    const run = state.runState;
    if (!run || run.status !== 'in_dungeon') return;
    if (state.runRngState === undefined) {
      console.warn('CorridorScene: runRngState missing for in-corridor combat');
      return;
    }

    const node = currentNode(run);
    if (node.type === 'shop' || node.type === 'camp' || node.type === 'event' || node.type === 'treasure') {
      console.warn(`startCombatInPlace called on non-combat node '${node.type}'`);
      return;
    }
    const encounter: Encounter = node.encounter;

    const rng = createRngFromState(state.runRngState);
    const combatState = buildCombatState(run.party, encounter);
    const result = resolveCombat(combatState, rng);

    const displayNames = this.buildDisplayNames(run, combatState);
    this.buildEnemyActors(combatState, displayNames, encounter);
    this.combatHud = this.buildCombatHud();

    this.playback = new CombatPlayback(
      this,
      result.events,
      this.actors,
      this.combatHud,
      combatState,
      displayNames,
    );
    this.playback.setSpeed(state.preferences?.combatSpeed ?? 1);
    this.playback.onComplete = () => {
      // Persist post-combat state inline (no handoff needed — same scene).
      this.processCombatResultInline(result, rng.getState());
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.playback?.abort();
      this.tweens.timeScale = 1;
      this.time.timeScale = 1;
    });

    void this.playback.run();
  }
```

- [ ] **Step 5.4: Add helpers `buildDisplayNames`, `buildEnemyActors`, `buildCombatHud`, `processCombatResultInline`**

Port these from the deleted combat scene with minor adjustments. Add to corridor scene:

```ts
  private buildDisplayNames(
    run: RunState,
    combatState: CombatState,
  ): Map<CombatantId, string> {
    const names = new Map<CombatantId, string>();
    for (let i = 0; i < run.party.length; i++) {
      names.set(`p${i}`, run.party[i].name);
    }
    for (const c of combatState.combatants) {
      if (c.side === 'enemy' && c.enemyId) {
        names.set(c.id, ENEMIES[c.enemyId].name);
      }
    }
    return names;
  }

  private buildEnemyActors(
    combatState: CombatState,
    displayNames: Map<CombatantId, string>,
    encounter: Encounter,
  ): void {
    let enemyIdx = 0;
    for (const c of combatState.combatants) {
      if (c.side !== 'enemy') continue;
      const x = ENEMY_X_BY_SLOT[c.slot];
      const enemyId = c.enemyId!;
      const isBoss = ENEMIES[enemyId].role === 'boss';
      const visual = ENEMY_VISUALS[enemyId];
      const bodyScale = visual.bodyScale ?? (isBoss ? BOSS_BODY_SCALE : 3);
      const placement = encounter.enemies[enemyIdx++];
      const actor = new CombatActor(this, x, ROW_Y, {
        kind: 'enemy',
        combatantId: c.id,
        displayName: displayNames.get(c.id) ?? c.id,
        enemyId,
        currentHp: c.currentHp,
        maxHp: c.maxHp,
        bodyScale,
        ...(placement.modifierIds !== undefined ? { modifierIds: placement.modifierIds } : {}),
      });
      this.actors.set(c.id, actor);
    }
  }

  private buildCombatHud(): CombatPlaybackHud {
    const roundCounter = this.add
      .text(480, ROUND_COUNTER_Y, 'Round 1', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);
    const roundBanner = this.add
      .text(480, ROUND_BANNER_Y, '', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#ffcc66',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0);
    const actionLog = this.add
      .text(480, ACTION_LOG_Y, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.combatHudObjects.push(roundCounter, roundBanner, actionLog);
    return { roundCounter, roundBanner, actionLog };
  }

  private processCombatResultInline(result: CombatResult, rngStateAfter: number): void {
    const run = appState.get().runState!;
    this.preCombatParty = [...run.party];
    const prePackLen = run.pack.items.length;
    const rng = createRngFromState(rngStateAfter);
    const { runState: nextRun, wipe } = completeCombat(run, result, rng);
    this.combatLoot = nextRun.pack.items.slice(prePackLen);
    appState.update((s) => ({
      ...s,
      runState: nextRun,
      runRngState: rng.getState(),
    }));

    // Tear down combat HUD; result/wipe panel takes over.
    for (const obj of this.combatHudObjects) obj.destroy();
    this.combatHudObjects = [];
    // Tear down enemy actors (heroes stay).
    for (const [id, actor] of this.actors) {
      if (id.startsWith('e')) {
        actor.destroy();
        this.actors.delete(id);
      }
    }

    if (wipe) {
      this.wipeOutcome = wipe;
      this.buildWipePanel();
    } else {
      this.buildResultPanel();
    }
  }
```

- [ ] **Step 5.5: Update `onTravelComplete` to call `startCombatInPlace` instead of scene.start('combat')**

Replace the combat branch in `onTravelComplete`:

```ts
    // Combat node — start combat in-place (no scene swap).
    this.startCombatInPlace();
```

(The non-combat overlay branches stay unchanged.)

- [ ] **Step 5.6: Remove combat handoff consumption from corridor's `create()`**

In `create()`, remove the combat handoff branch (no longer needed — combat result handled inline):

```ts
    // Remove these lines:
    const handoff = consumeCombatResult();
    if (handoff) {
      this.processCombatReturn(handoff.result, handoff.rngStateAfter);
    } else {
      this.startWalk();
    }
```

Replace with:

```ts
    this.startWalk();
```

Also remove the import:

```ts
    // Remove:
    import { consumeCombatResult } from './combat_handoff';
```

Remove `processCombatReturn` from the corridor scene (it's no longer needed; combat result handled inline by `processCombatResultInline`).

- [ ] **Step 5.7: Delete combat scene + handoff**

Run:

```bash
git rm src/scenes/combat_scene.ts src/scenes/combat_handoff.ts
```

- [ ] **Step 5.8: Remove `CombatScene` import + registration from main.ts**

Open `src/main.ts`. Remove:

```ts
import { CombatScene } from './scenes/combat_scene';
```

In the scene array, remove `CombatScene`:

```ts
    DungeonScene,
    CorridorScene,
    // (CombatScene removed)
    CampScreenScene,
```

- [ ] **Step 5.9: Typecheck + full-suite run**

Run: `npm run build && npm test`

Expected: typecheck passes, all 1486 tests pass.

If a test imports `combat_scene` or `combat_handoff` directly, it needs updating. Most likely no tests do (these are Phaser scenes); but `grep -rn "combat_scene\|combat_handoff" src/` will surface any.

- [ ] **Step 5.10: Smoke test**

Full combat flow in corridor:
1. Walk to combat node. World scrolls. On arrival, enemy CombatActors appear at ENEMY_X positions.
2. Combat HUD (round counter, action log) appears.
3. Combat plays out in corridor with hero + enemy CombatActors. HP bars update from combat damage.
4. Win → enemies destroyed; combat HUD removed; result panel renders in corridor over the same backdrop.
5. Result dismiss → transition to dungeon for fork pick.
6. Walk to non-combat node — overlay opens over corridor as before; close returns to dungeon.

Note: per spec §2.4, enemies should ideally appear via the scrolling-world entrance. For Phase 6c first version we're using the simpler "spawn at scroll completion" approach above. The world-embedded enemy entrance is a polish improvement that can ship in a follow-up — call it out in the smoke notes.

---

## Task 6: First-node entry — corridor handles fresh expedition

After this task: starting a fresh expedition lands the player in the corridor at the start node with a click-to-engage gate (Phase 4 awaitingEngage moves here). No walk-in tween; heroes + enemy at the start node visible immediately.

**Files:**
- Modify: `src/scenes/dungeon_scene.ts`
- Modify: `src/scenes/corridor_scene.ts`

- [ ] **Step 6.1: Update dungeon scene to launch corridor on fresh entry**

In `dungeon_scene.ts:create()`, after the layout/visibility setup and HUD building, add a redirect for fresh entry:

```ts
    // Fresh expedition: bypass the map view and land directly in the corridor.
    // Player still gets a fork-pick view after combat completes.
    if (state.runState.traversedNodeIds.length === 1) {
      this.scene.start('corridor');
      return;
    }
```

Place this AFTER `this.buildBackground()` etc. but before the refresh calls to avoid wasted work. Actually, simpler: put it RIGHT AFTER the in-dungeon guard at the top of `create()`:

```ts
    if (!state.runState || state.runState.status !== 'in_dungeon') {
      console.warn('DungeonScene entered without active runState');
      this.scene.start('camp');
      return;
    }
    // Fresh expedition (just past camp / press-on): bypass map, land in corridor.
    if (state.runState.traversedNodeIds.length === 1) {
      this.scene.start('corridor');
      return;
    }
    // ... rest of create()
```

- [ ] **Step 6.2: Add `awaitingEngage` to corridor + handle fresh entry**

In `corridor_scene.ts`, add the field:

```ts
private awaitingEngage = false;
```

In `create()`, detect fresh entry — `traversedNodeIds.length === 1` AND no scroll yet — and set up the engage gate instead of starting the walk:

```ts
    // ... after buildBackdrop, buildWorldContainer, buildHud, buildHeroes, maybeScheduleChatter

    if (run.traversedNodeIds.length === 1) {
      // Fresh entry. No scroll; player clicks current node visual to engage.
      this.awaitingEngage = true;
      this.showEngagePrompt();
    } else {
      this.startWalk();
    }
  }
```

(Replace the previous `this.startWalk();` line.)

- [ ] **Step 6.3: Add `showEngagePrompt` method**

Add a method that displays a "Click to Engage" prompt visually. For first version, simple click-anywhere-on-screen handler:

```ts
  private showEngagePrompt(): void {
    const prompt = this.add
      .text(SCENE_W / 2, ROW_Y - 80, 'Click to Engage', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffcc66',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    // Pulsing alpha for visibility.
    this.tweens.add({
      targets: prompt,
      alpha: { from: 0.5, to: 1 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    // Make scene clickable to engage.
    this.input.once('pointerdown', () => {
      if (!this.awaitingEngage) return;
      this.awaitingEngage = false;
      prompt.destroy();
      this.engageDestination();
    });
  }
```

- [ ] **Step 6.4: Add `engageDestination` method**

This is what `onTravelComplete` does today, factored out so it can be triggered by either the walk completion or the engage-prompt click:

```ts
  private engageDestination(): void {
    const run = appState.get().runState;
    if (!run) return;
    const node = currentNode(run);
    if (node.type === 'shop') {
      this.scene.launch('shop_overlay');
      this.scene.pause();
      return;
    }
    if (node.type === 'camp') {
      this.scene.launch('camp_node_overlay');
      this.scene.pause();
      return;
    }
    if (node.type === 'event') {
      this.scene.launch('event_overlay');
      this.scene.pause();
      return;
    }
    if (node.type === 'treasure') {
      this.scene.launch('treasure_room_overlay');
      this.scene.pause();
      return;
    }
    this.startCombatInPlace();
  }
```

Update `onTravelComplete` to delegate:

```ts
  private onTravelComplete(): void {
    this.engageDestination();
  }
```

- [ ] **Step 6.5: Typecheck + full-suite run**

Run: `npm run build && npm test`

Expected: typecheck passes, all 1486 tests pass.

- [ ] **Step 6.6: Smoke test**

Full first-node flow:
1. Start fresh Crypt expedition. Dungeon scene flickers briefly (the redirect) and lands in corridor.
2. Heroes visible at center positions; start-node enemy NOT visible (Task 5's `startCombatInPlace` builds enemies; they don't appear during the engage-prompt phase).
3. "Click to Engage" prompt pulses above heroes. Click → prompt dismisses → enemy appears + combat HUD + combat starts.
4. Combat plays normally → result panel → dismiss → transition to dungeon (now `traversedNodeIds.length > 1`, so dungeon shows the map for fork pick).

If you want enemies visible during the engage-prompt for narrative reasons, add a call to `buildEnemyActors` (with stub combat state) in `showEngagePrompt` — but for first version, the simpler "no enemies until combat starts" works.

---

## Task 7: TODO + HISTORY housekeeping

**Files:**
- Modify: `TODO.md`
- Modify: `HISTORY.md`

- [ ] **Step 7.1: Update TODO entry #30 — mark Phase 6c done, add new Phase 6d**

Open `TODO.md`. Find the Phase 6c bullet:

```
    - **Phase 6c — Surprise encounters with in-corridor combat.** RNG-driven enemy injection at any step; pause the walk tween, spawn enemies on the right, launch combat as overlay/sub-scene over the travel backdrop. Win → resume walking. Wipe → standard wipe path. Largest of the three; needs its own brainstorm.
```

Replace with:

```
    - **Phase 6c — Unified corridor (in-action scene).** ✅ *Shipped 2026-05-04 (see HISTORY).* All in-dungeon-action moments (travel, combat, result/wipe panels, node overlays) unified into a single `'corridor'` scene with camera-style world scrolling. Standalone combat scene deleted; combat plays in corridor. Heroes static at combat-matched positions; world container scrolls left with placeholder tile pattern + pillar/torch placeholders (real art is a Cluster C polish task). Spec: `docs/superpowers/specs/2026-05-03-phase-6c-unified-corridor-design.md`.
    - **Phase 6d — Surprise encounters.** RNG-driven enemy injection during travel toward non-combat nodes. Builds on the in-corridor combat infrastructure shipped in 6c. Needs its own brainstorm (probability per step? per non-combat path? content/scaling of injected enemies?). Subsumed-from-6c portion: in-corridor combat plumbing already done.
```

- [ ] **Step 7.2: Add the HISTORY entry**

Open `HISTORY.md`. Insert at the top (newest first):

```markdown
### 2026-05-04 · Map-based dungeon scene — Phase 6c (unified corridor) (Cluster B · 30)

- **Why:** TODO #30 Phase 6c (rescoped during 2026-05-03 brainstorm). Original 6c was "surprise encounters with in-corridor combat." Smoke-testing 6a/6b surfaced that the screen swap from corridor to combat scene was jarring even with matching backdrops; user wanted a unified in-action scene. This phase delivers that — the standalone combat scene is gone; combat, travel, result panels, and overlays all happen in one `'corridor'` scene. The new Phase 6d takes over the original 6c's surprise-encounter scope (now trivial since in-corridor combat infrastructure is built).
- **Decisions:**
  - **Camera-style world scrolling over hero-walks-right.** Heroes static at combat-matched positions (`PARTY_X = [-, 400, 320, 240]`); world container scrolls left during travel. Placeholder tile pattern + pillar/torch sprites stand in for real art (Cluster C polish task). Single visual model where the world contains everything (heroes, scenery, future enemies for Phase 6d surprise encounters).
  - **`CombatActor` for heroes throughout travel + combat.** Single rendering path — same actor, same HP bar, same name label. Travel HP tick and combat damage write to the same `setHp` call. Bob applies to actor container; rotate to inner paperdoll only (HP bar + name don't tilt).
  - **Combat scene file deleted.** Its responsibilities (background, HUD, actor build, playback wiring, handoff) absorbed into corridor scene. Combat handoff module deleted too (no scene boundary to cross). End state: one large corridor scene file; dungeon scene narrows to map-only.
  - **First-node entry uses an explicit "Click to Engage" prompt in corridor instead of a walk-in tween.** No "from" node to scroll from on dungeon entry. The Phase 4 `awaitingEngage` gate moves to the corridor as a pulsing prompt overlay.
  - **Result/wipe panels render in corridor.** Combat ends in-place; panel slides over the corridor backdrop. After dismiss, transition to dungeon scene only when the player needs the map (fork pick after combat) — the dungeon scene becomes a "between travels" view rather than the everywhere-default.
  - **Walk-speed and combat-speed kept as separate Preferences.** Could merge later; not worth the migration risk this phase.
- **Surprises:**
  - **Hero coordinate system needed careful alignment.** Combat scene's `ROW_Y=300` puts hero feet at y≈324 (via the actor's internal `FLOOR_Y=24` + body half). Travel scene's old `GROUND_Y=380` was a different coordinate concept (visual ground line where Paperdoll feet rendered). Reconciling required moving the corridor's floor line to y=324 — heroes appear higher up than the prior travel scene, with more empty space below them (used for combat HUD area).
  - **Enemy entrance via scrolling world** is described in spec §2.4 as the intended behavior, but Task 5 ships with the simpler "spawn at scroll completion" approach. World-embedded enemy entrance is a polish improvement deferred to a follow-up; leaves a small gap between spec intent and shipped behavior.
  - **Brief intermediate state during Task 4** had combat node arrivals doing TWO scene swaps (corridor → combat → corridor) before Task 5 inlined combat. Worth knowing if executing tasks out of order.
- **Source:** TODO.md Cluster B · 30 Phase 6c. Spec: `docs/superpowers/specs/2026-05-03-phase-6c-unified-corridor-design.md`. Plan: `docs/superpowers/plans/2026-05-04-phase-6c-unified-corridor.md`. Test count delta: 1486 → 1486 (no new tests; scene-level changes verified by manual smoke per repo convention).
```

- [ ] **Step 7.3: Final full-suite run**

Run: `npm test`

Expected: ALL 1486 tests pass.

- [ ] **Step 7.4: Report to the user**

Summarize: Phase 6c shipped. Files touched (corridor scene grew, combat scene + handoff deleted, dungeon scene shrunk, overlays repointed, main.ts updated), test count delta (no change — all scene-level), smoke-test checklist (engagement → combat → result → fork pick → travel → arrival → engage → ...). Done.
