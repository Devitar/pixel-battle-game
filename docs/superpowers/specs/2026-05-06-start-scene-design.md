# Start Scene — Design Spec

**Date:** 2026-05-06
**Status:** Locked design, ready for implementation plan
**Related TODO:** Cluster B · 43 (Start screen with title + theme music)

## Why

Theme music exists in `public/assets/audio/darkane_times.ogg` but isn't wired into any scene yet. Currently `BootScene` finishes asset loading and immediately routes to `camp` / `dungeon` / `camp_screen` based on save state — silent, no title, no presentation moment. A start scene gives the game a proper "boot moment": title + theme music + tap-to-start, played on every page load. Pre-launch, this is the right time to overshoot on presentation.

## Scope summary

**In scope:**

- 1 new file: `src/scenes/start_scene.ts` — single Phaser scene class
- Modifications to `src/scenes/boot_scene.ts`: load `darkane_times.ogg` in `preload`; route to `'start'` (with the previously-computed next-scene id passed via `scene.start` data) instead of routing directly to camp/dungeon/camp_screen
- Modifications to `src/main.ts`: register `StartScene` in the scene array

**Out of scope (deferred):**

- **Bespoke background art** — placeholder solid color (`#111111`) until art lands
- **Cross-scene music persistence** — music stops on tap; per-scene audio ownership. Camp / dungeon stay silent (matches current behavior — no other scene has music yet)
- **Settings / volume slider** — hard-coded volume `0.5`; future settings overlay handles user preference
- **"First-time-only" gating** — start screen shows on every boot; players who don't want it refresh past it
- **Title art / animations beyond prompt fade** — no title slide-in, no particle effects; static title with just the prompt fade
- **Unit tests** — matches existing scene pattern (only `app_state.test.ts` and `expeditions_layout.test.ts` exist under `src/scenes/__tests__/`; neither instantiates a Phaser scene class directly). Verification is manual — `npm run dev`, observe.

## Locked decisions (brainstorm log)

| # | Question | Decision |
|---|---|---|
| Q1 | Music persistence after tap | **A — Stop at tap** — start_scene fully owns its audio. Tap stops the track, transitions to next scene, which is silent. No other scene has music yet, so cross-scene audio surface area pays no benefit. Camp / dungeon / camp_screen continue to behave as today. |
| Q2 | When does the start screen show | **A — Every boot** — title + music play on every page load. Resume-from-save players see the title briefly, tap, land in their saved state. Title becomes the universal entry point. Friction (1 tap) is acceptable; the brand moment is the value. |

## Architecture

**Single-file, single-responsibility.** No new helpers, no new modules, no shared state. The start scene is a small intercept between BootScene and whatever scene the save state routed to.

### Data flow

```
BootScene.preload()
  ├── existing spritesheet loads (unchanged)
  └── this.load.audio('theme', 'assets/audio/darkane_times.ogg')   ← NEW

BootScene.create()
  ├── existing save resolution (unchanged)
  ├── compute nextSceneId based on saveFile.runState.status         ← refactored from direct .scene.start calls
  └── this.scene.start('start', { nextSceneId })                    ← was: 3 conditional .scene.start calls

StartScene.init({ nextSceneId })
  └── store nextSceneId on the instance

StartScene.create()
  ├── render background rectangle (solid #111111)
  ├── render title text "Darkane Times"
  ├── render prompt text "Tap anywhere to start" with alpha-tween (0.35 ↔ 1.0, 1200ms, yoyo, repeat -1)
  ├── this.sound.play('theme', { loop: true, volume: 0.5 })
  ├── this.input.on('pointerdown', this.advance, this)
  ├── this.input.keyboard?.on('keydown-ENTER', this.advance, this)
  └── this.input.keyboard?.on('keydown-SPACE', this.advance, this)

StartScene.advance()
  ├── this.sound.stopByKey('theme')
  └── this.scene.start(this.nextSceneId)
```

### Why this shape

- **Boot computes route, start dispatches.** Boot already has the save state in hand; it's the natural place to decide where the player ends up. Start scene just plays its presentation and forwards the decision. Keeps start scene save-agnostic.
- **Audio loaded in boot, played in start.** Phaser's loader caches by key — load once in boot's preload (which is purpose-built for asset loading), then the start scene plays from cache. Matches the existing spritesheet pattern.
- **No app_state, no save changes.** This is a pure presentation layer. The start scene reads no app state and writes no app state. The scene-id forwarding happens via Phaser's `scene.start(key, data)` payload, not via a global store.

## Components

### `src/scenes/start_scene.ts` (new file)

Single class: `StartScene extends Phaser.Scene`. Constructor passes `'start'` as the scene key.

Fields:
- `private nextSceneId!: string` — set in `init`

Methods:
- `init(data: { nextSceneId: string }): void` — store the routed-to scene id
- `create(): void` — build the visuals + start music + wire input
- `private advance(): void` — stop music, transition

No helpers extracted; everything fits cleanly in one ~80-100 LOC file with one responsibility (show title + music, advance on input).

### `src/scenes/boot_scene.ts` (modified)

`preload`: add `this.load.audio('theme', 'assets/audio/darkane_times.ogg')` after the existing spritesheet loads.

`create`: replace the `if/else if/else` routing block with:

```typescript
const nextSceneId =
  saveFile.runState?.status === 'camp_screen' ? 'camp_screen' :
  saveFile.runState ? 'dungeon' :
                      'camp';
this.scene.start('start', { nextSceneId });
```

The semantic intent (route based on save state) is preserved; the destination is just deferred until after the start screen.

### `src/main.ts` (modified)

Add `StartScene` to the scene array between `BootScene` and `CampScene` (Phaser scene order doesn't strictly matter for routing, but placing it next to boot reads correctly).

Add `import { StartScene } from './scenes/start_scene';` to the import block.

## Visuals

| Element | Property | Value |
|---|---|---|
| Background | Solid color | `#111111` (matches `main.ts` game backgroundColor) |
| Title | Text | `"Darkane Times"` |
| Title | Font | `'monospace'`, size `48px` |
| Title | Color | `#ffcc66` (the gold accent used in result panels and gold counters) |
| Title | Position | Centered horizontally, `y = 200` |
| Prompt | Text | `"Tap anywhere to start"` |
| Prompt | Font | `'monospace'`, size `16px` |
| Prompt | Color | `#cccccc` |
| Prompt | Position | Centered horizontally, `y = 380` |
| Prompt | Tween | Alpha `0.35 → 1.0`, duration `1200ms`, yoyo `true`, repeat `-1` |

Canvas remains `960 × 540` (matches the game's existing dimensions).

## Audio

| Property | Value |
|---|---|
| Asset path | `public/assets/audio/darkane_times.ogg` |
| Phaser key | `'theme'` |
| Loaded in | `BootScene.preload()` |
| Played in | `StartScene.create()` via `this.sound.play('theme', { loop: true, volume: 0.5 })` |
| Stopped in | `StartScene.advance()` via `this.sound.stopByKey('theme')` |

**Browser autoplay policy note:** Most browsers block autoplay on page load until the user interacts. The first user gesture (tap-anywhere on the canvas) is what unlocks audio context. This means:

- The music may not play until the player clicks/taps. The "Tap anywhere to start" prompt elegantly invites the gesture.
- If the player has previously interacted with the page (e.g., used the fullscreen button before reload), the music may play immediately on scene enter.

The implementation should attempt `this.sound.play('theme', ...)` unconditionally and let Phaser handle the autoplay-policy fallback (Phaser silently queues the play call until user gesture). No special "click to enable audio" UI needed — the prompt already serves that role.

## Input

| Trigger | Behavior |
|---|---|
| `pointerdown` (anywhere on canvas) | `advance()` |
| `keydown-ENTER` | `advance()` |
| `keydown-SPACE` | `advance()` |

`Escape` is intentionally **not** bound — Esc reads as "cancel / go back," but here there's nowhere to go back to. The available keyboard fallbacks are advance-style only.

`advance()` is idempotent at the engine level (Phaser's `scene.start` safely ignores re-entrant calls during transition), but the implementation should also remove its own listeners on first advance to avoid stacking.

## Testing

**No unit tests.** This is a Phaser scene with no extractable pure logic — everything is "build a UI, wire input, play music, forward to another scene." Existing scene tests (`app_state.test.ts`, `expeditions_layout.test.ts`) cover only pure helpers, never Phaser scene classes themselves.

**Manual verification checklist** (run `npm run dev`, open browser):

- [ ] On fresh save (no `runState`): boot → start → tap → camp scene
- [ ] On in-progress run save (`runState.status === 'in_dungeon'`): boot → start → tap → dungeon scene
- [ ] On post-boss save (`runState.status === 'camp_screen'`): boot → start → tap → camp_screen scene
- [ ] Title "Darkane Times" renders centered upper-half, gold color, 48px monospace
- [ ] Prompt "Tap anywhere to start" renders centered lower-half, gentle alpha pulse (~1.2s yoyo)
- [ ] Music starts playing on first user interaction (browser autoplay-policy permitting); loops
- [ ] Music stops cleanly on tap; next scene is silent
- [ ] Enter and Space keys also advance (in addition to pointer)
- [ ] No console errors on enter, advance, or scene transition

## Risks and open questions

- **Phaser audio API surface** — `this.sound.play('theme', { loop, volume })` and `this.sound.stopByKey('theme')` are standard Phaser 3, but verify against the project's installed Phaser version. If `stopByKey` isn't available, fall back to keeping a reference to the play handle and calling `.stop()` on it.
- **Tap target coverage** — `this.input.on('pointerdown')` listens at the scene level. Since the start scene doesn't have any other interactive widgets, every pointerdown advances. If a widget is added later (e.g., volume slider), the advance handler needs to scope tightly (e.g., to a transparent fullscreen rectangle behind everything else).
- **Cross-tab audio collision** — if the player has the game open in two tabs, both will try to play the theme. Browser audio context handles this per-tab, but the volumes stack. Acceptable for v1; document as a limitation if it becomes a complaint.

## Future spec hooks (not implemented here)

- **Bespoke title art** (background image, animated logo) — Cluster C art polish entry to be filed when this ships
- **Cross-scene music persistence** — when a second piece of music is added (e.g., dungeon ambient, combat theme), revisit audio ownership. Likely path: a small `audio_bus.ts` module that tracks the currently-playing track and crossfades between them
- **Settings overlay** — volume slider, mute toggle. Belongs in a separate spec; would also expose a "skip start screen" preference for repeat players
