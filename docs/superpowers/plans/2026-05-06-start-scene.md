# Start Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a start scene shown on every boot — title "Darkane Times", looping theme music, "Tap anywhere to start" prompt — that advances to whatever scene `BootScene` was going to route to.

**Architecture:** Single-file Phaser scene at `src/scenes/start_scene.ts`. `BootScene` loads the audio in its preload and passes the routed-to scene id via `scene.start('start', { nextSceneId })`. Start scene plays music, renders title + prompt with alpha-tween, advances on pointer/keyboard, stops music on advance. No app_state changes, no save changes, no unit tests (matches existing scene pattern).

**Tech Stack:** TypeScript (strict), Phaser 3, Vite.

**Spec:** [`docs/superpowers/specs/2026-05-06-start-scene-design.md`](../specs/2026-05-06-start-scene-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/scenes/start_scene.ts` | Create | Single Phaser scene class. Renders title + prompt, plays music, wires input, advances to a stored next-scene id. |
| `src/main.ts` | Modify | Import + register `StartScene` in the scene array (between `BootScene` and `CampScene`). |
| `src/scenes/boot_scene.ts` | Modify | Load `darkane_times.ogg` via `this.load.audio` in `preload`. Refactor `create` to compute `nextSceneId` once and dispatch via `scene.start('start', { nextSceneId })` instead of three direct routes. |

**No new tests.** Per spec: existing scene tests cover only pure helpers; Phaser scene classes themselves are not unit-tested in this codebase. Manual verification only.

---

## Tasks

### Task 1: Create StartScene + register in main.ts

Lands the scene file end-to-end (visuals + audio + input + advance). Registers it in `main.ts` so it's reachable. After this task, the game still boots as it does today (boot routes directly to camp/dungeon/camp_screen) — the start scene exists but isn't on the boot path yet.

This sequencing prevents a broken-state intermediate: if Task 2 (boot route refactor) ran before the start scene existed, `scene.start('start', ...)` would throw.

**Files:**
- Create: `src/scenes/start_scene.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Run baseline checks**

```
npx tsc --noEmit
npm test
```

Expected: clean typecheck; all tests pass (post-Paladin-follow-up baseline ~1716).

- [ ] **Step 2: Create `src/scenes/start_scene.ts`**

```typescript
import * as Phaser from 'phaser';

const TITLE_TEXT = 'Darkane Times';
const PROMPT_TEXT = 'Tap anywhere to start';

const TITLE_COLOR = '#ffcc66';
const PROMPT_COLOR = '#cccccc';
const BG_COLOR = 0x111111;

const SCENE_W = 960;
const SCENE_H = 540;
const TITLE_Y = 200;
const PROMPT_Y = 380;

const TITLE_FONT_SIZE = '48px';
const PROMPT_FONT_SIZE = '16px';

const PROMPT_FADE_MS = 1200;
const PROMPT_ALPHA_MIN = 0.35;
const PROMPT_ALPHA_MAX = 1.0;

const AUDIO_KEY = 'theme';
const AUDIO_VOLUME = 0.5;

export class StartScene extends Phaser.Scene {
  private nextSceneId!: string;

  constructor() {
    super('start');
  }

  init(data: { nextSceneId: string }): void {
    this.nextSceneId = data.nextSceneId;
  }

  create(): void {
    this.add
      .rectangle(0, 0, SCENE_W, SCENE_H, BG_COLOR)
      .setOrigin(0, 0);

    this.add
      .text(SCENE_W / 2, TITLE_Y, TITLE_TEXT, {
        fontFamily: 'monospace',
        fontSize: TITLE_FONT_SIZE,
        color: TITLE_COLOR,
      })
      .setOrigin(0.5);

    const prompt = this.add
      .text(SCENE_W / 2, PROMPT_Y, PROMPT_TEXT, {
        fontFamily: 'monospace',
        fontSize: PROMPT_FONT_SIZE,
        color: PROMPT_COLOR,
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: { from: PROMPT_ALPHA_MAX, to: PROMPT_ALPHA_MIN },
      duration: PROMPT_FADE_MS,
      yoyo: true,
      repeat: -1,
    });

    this.sound.play(AUDIO_KEY, { loop: true, volume: AUDIO_VOLUME });

    this.input.once('pointerdown', this.advance, this);
    this.input.keyboard?.once('keydown-ENTER', this.advance, this);
    this.input.keyboard?.once('keydown-SPACE', this.advance, this);
  }

  private advance(): void {
    this.sound.stopByKey(AUDIO_KEY);
    this.scene.start(this.nextSceneId);
  }
}
```

Notes:
- `this.input.once(...)` (not `.on(...)`) so each handler fires exactly once. The handler calls `advance()`, which transitions away from the scene; the unfired listeners on the other input types are torn down when the scene shuts down.
- `sound.stopByKey(AUDIO_KEY)` is the standard Phaser 3 API. If it turns out to not exist on the installed Phaser version, fall back to `this.sound.stopAll()` or hold the play handle.
- Audio play happens unconditionally — Phaser silently queues the play call if the browser autoplay policy hasn't yet been satisfied; the user's tap unlocks the audio context, and looping starts then. The tap also advances the scene, so in the autoplay-blocked case the music never actually plays. That's acceptable for v1 — the visual prompt is the brand moment regardless.

- [ ] **Step 3: Register `StartScene` in `src/main.ts`**

Find the imports block and add (alphabetically, after `ShopOverlayScene` and before `TavernPanelScene` per the existing alphabetical-ish order):

```typescript
import { StartScene } from './scenes/start_scene';
```

In the scene array, add `StartScene` immediately after `BootScene`:

```typescript
  scene: [
    BootScene,
    StartScene,
    CampScene,
    /* ...rest unchanged... */
  ],
```

- [ ] **Step 4: Run typecheck**

```
npx tsc --noEmit
```

Expected: clean. The new file compiles; no cascade errors.

- [ ] **Step 5: Run tests**

```
npm test
```

Expected: all pass (~1716). The new scene file isn't tested directly; existing tests are unaffected.

- [ ] **Step 6: SKIP — DO NOT COMMIT.** (Per user's no-commit policy; leave changes in working tree.)

---

### Task 2: Refactor BootScene to load audio + route through StartScene

Wires the start scene onto the boot path. After this task, every page load goes through the start screen before reaching camp/dungeon/camp_screen.

**Files:**
- Modify: `src/scenes/boot_scene.ts`

- [ ] **Step 1: Modify `src/scenes/boot_scene.ts`**

Add the audio load to `preload` after the existing spritesheet loads. Replace the routing block in `create` with a single dispatch that computes `nextSceneId` from save state and forwards to the start scene.

Final file should look like this:

```typescript
import * as Phaser from 'phaser';
import { resolveSaveState } from '@save/boot';
import { SHEET, ENEMY_SHEET, BOSS_SHEET } from '@render/frames';
import { createRng } from '@util/rng';
import { appState } from './app_state';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.spritesheet(SHEET.key, SHEET.url, {
      frameWidth: SHEET.frameWidth,
      frameHeight: SHEET.frameHeight,
      margin: SHEET.margin,
      spacing: SHEET.spacing,
    });
    this.load.spritesheet(ENEMY_SHEET.key, ENEMY_SHEET.url, {
      frameWidth: ENEMY_SHEET.frameWidth,
      frameHeight: ENEMY_SHEET.frameHeight,
      margin: ENEMY_SHEET.margin,
      spacing: ENEMY_SHEET.spacing,
    });
    this.load.spritesheet(BOSS_SHEET.key, BOSS_SHEET.url, {
      frameWidth: BOSS_SHEET.frameWidth,
      frameHeight: BOSS_SHEET.frameHeight,
      margin: BOSS_SHEET.margin,
      spacing: BOSS_SHEET.spacing,
    });
    this.load.audio('theme', 'assets/audio/darkane_times.ogg');
  }

  create(): void {
    const rng = createRng(Date.now());
    const { saveFile } = resolveSaveState(window.localStorage, rng);
    appState.init(saveFile, window.localStorage);

    const nextSceneId =
      saveFile.runState?.status === 'camp_screen' ? 'camp_screen' :
      saveFile.runState                            ? 'dungeon' :
                                                     'camp';
    this.scene.start('start', { nextSceneId });
  }
}
```

Notes:
- The audio path `'assets/audio/darkane_times.ogg'` is relative to Vite's served root. The file lives at `public/assets/audio/darkane_times.ogg`; Vite serves `public/` at the root path, so the URL is `/assets/audio/darkane_times.ogg`. Phaser's loader prepends the base URL automatically.
- The `nextSceneId` ternary preserves the original three-way semantic (`camp_screen` if post-boss; `dungeon` if mid-run; otherwise `camp`).
- The `'start'` scene key matches `StartScene`'s constructor (`super('start')`) from Task 1.

- [ ] **Step 2: Run typecheck**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Run tests**

```
npm test
```

Expected: all pass (~1716). Boot scene isn't unit-tested; no test changes required.

- [ ] **Step 4: SKIP — DO NOT COMMIT.**

---

### Task 3: Manual verification across save states

This is verification, not implementation. No code changes. The implementer runs the dev server in the browser and walks through each save-state path.

**Files:** None modified.

- [ ] **Step 1: Start the dev server**

```
npm run dev
```

Expected: Vite reports `Local:   http://localhost:5173/`. Open it.

- [ ] **Step 2: Verify fresh-save path (no `runState`)**

In the browser's devtools console:

```javascript
localStorage.clear();
location.reload();
```

Expected sequence:
- BootScene loads (briefly black)
- StartScene appears: black background, gold "Darkane Times" centered upper-half (~y=200), grey "Tap anywhere to start" centered lower-half (~y=380), prompt fading gently
- Music starts on first interaction (browser autoplay policy may delay until tap)
- Tap anywhere on the canvas (or press Enter, or Space) → music stops, transitions to **CampScene** (the existing camp screen with buildings)

If the music never starts: that's the autoplay policy. Tap once, then reload — on the second load the audio context should already be unlocked.

- [ ] **Step 3: Verify mid-run path (`runState.status === 'in_dungeon'`)**

From the camp scene, click Expeditions → start a Crypt run → walk into the first floor (do NOT defeat the boss). Then in devtools:

```javascript
location.reload();
```

Expected:
- StartScene appears (same visuals as Step 2)
- Tap → transitions to **DungeonScene** (the dungeon map view, not camp)

The save's `runState.status` is `'in_dungeon'` from the partial run, so the route falls through the third branch of the ternary and lands on `'dungeon'`.

- [ ] **Step 4: Verify post-boss path (`runState.status === 'camp_screen'`)**

This requires defeating a Crypt boss to land in the camp_screen state. The fastest way:
- From a fresh camp, run an expedition
- Speed through the dungeon (use the fast-forward button if available; `combat_speed_persistence` saves the setting)
- Defeat the floor-1 boss (or floor-3 for canonical Crypt clear)
- After the boss-defeat result panel, the game is in `'camp_screen'` status (mid-run between floors, NOT the regular camp)
- Reload the browser

Expected:
- StartScene appears (same visuals)
- Tap → transitions to **CampScreenScene** (the cash-out-or-press-on choice screen, NOT the regular camp)

If reaching this state is too time-consuming, manually edit `localStorage` instead:

```javascript
const save = JSON.parse(localStorage.getItem(Object.keys(localStorage)[0]));
save.runState.status = 'camp_screen';
localStorage.setItem(Object.keys(localStorage)[0], JSON.stringify(save));
location.reload();
```

(This requires an existing run to be present so `runState` exists. Alternatively, skip this case if it's awkward to reach — Steps 2 and 3 already verify both branches of the routing logic.)

- [ ] **Step 5: Verify keyboard fallback**

From the start screen (any save state), press **Enter** or **Space** instead of clicking. Expected: same advance behavior as tap.

- [ ] **Step 6: Verify alpha-tween on the prompt**

Watch the "Tap anywhere to start" prompt for ~5 seconds. Expected: smooth fade from full-opacity (1.0) down to ~0.35 and back, ~1.2 seconds per direction. No flicker, no stuttering.

- [ ] **Step 7: Verify console is clean**

Open devtools console. Expected: no errors during boot, scene enter, advance, or transition. Phaser's normal startup logs are fine; what's NOT fine is `TypeError`, `Cannot read property...`, or 404s on the audio file.

If you see `404 GET /assets/audio/darkane_times.ogg`: the path in `BootScene.preload` is wrong; verify the file exists at `public/assets/audio/darkane_times.ogg` and the Phaser load uses `'assets/audio/darkane_times.ogg'` (no leading slash, no `public/` prefix).

- [ ] **Step 8: SKIP — DO NOT COMMIT.** Hand off the dirty working tree to the user for review and manual commit.

---

## Done

- New `StartScene` shows on every page load, between `BootScene` and the previously-routed-to scene.
- Title "Darkane Times" + gentle prompt fade + looping theme music.
- Tap, Enter, or Space advances to the same scene `BootScene` would have routed to (camp / dungeon / camp_screen depending on save state).
- Music stops cleanly on advance; subsequent scenes are silent (matches current behavior).
- No save-schema changes, no test-suite changes, no app_state changes.
