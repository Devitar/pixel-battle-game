# Mobile Landscape — Rotate-Device Prompt

**Status:** Design · **Date:** 2026-04-25

## Purpose

The game is fixed at 960×540 (16:9 landscape). On a phone in portrait orientation, `Phaser.Scale.FIT` shrinks the canvas to viewport width and leaves big black bars top and bottom — unplayable. This spec adds a fullscreen "Please rotate your device" overlay that hides the game until the viewport flips to landscape.

## History

This spec originally proposed a CSS-rotation hack (option B from the brainstorm) that visually rotated the canvas 90° in portrait so the user could play without rotating their phone. That approach failed in practice — Phaser's `ScaleManager.getParentBounds()` reads `parent.getBoundingClientRect()`, which returns the *post-rotation* visual bbox, so the canvas was sized into the wrong dimensions. Monkey-patching `getBoundingClientRect` on `#game` made it work for one device tested but the result was still off-center, suggesting Phaser reaches dimension info through additional code paths. There is no official Phaser API for "render landscape on a portrait viewport"; `screen.orientation.lock('landscape')` is the closest, and it requires fullscreen mode (which iOS Safari doesn't support at all). The standard production pattern for Phaser mobile games is the rotate-device prompt — option A from the brainstorm — which is what this spec now implements.

## Behavior

- When the viewport is in portrait orientation, an opaque overlay fills the screen with a rotate-phone icon and the text "Please rotate your device to landscape".
- When the viewport flips to landscape, the overlay disappears and the game (which has been running underneath the whole time) becomes visible at its standard FIT-scaled landscape size.
- Switching mid-session works automatically — pure CSS media query, no JavaScript.
- The Phaser game itself is unchanged. It always renders in 960×540 landscape; in landscape on a phone it FITs the available width with letterboxing top/bottom as it has always done.
- Tablets and resized desktop browsers in portrait orientation see the prompt too — intentional, since the same playability problem applies.

## Architecture

Pure HTML + CSS. No JavaScript code change.

- **`index.html`** — sibling to `#game`, a new `<div id="rotate-prompt">` containing an icon and text.
- **`src/style.css`** — `#rotate-prompt { display: none }` by default; inside `@media (orientation: portrait)` it becomes a `position: fixed` flex container at `z-index: 1000` with full viewport coverage (`inset: 0`), opaque black background, and a subtle rotate-animation on the icon.
- **No JS change.** No Phaser-side code, no event listeners, no input adapters.

## File layout

| Path | Action | Responsibility |
|---|---|---|
| `index.html` | **Modify** | Add the `#rotate-prompt` div sibling to `#game`. |
| `src/style.css` | **Modify** | Hide `#rotate-prompt` by default; show it in portrait via media query. |

## Out of scope

- "Tap to enter fullscreen + lock landscape." Could be added later as a single `requestFullscreen()` + `screen.orientation.lock('landscape')` call inside the prompt's tap handler. Skipped now because (a) iOS Safari doesn't support orientation lock, so it's not universal, and (b) most users will rotate before tapping anyway.
- Width-gated activation (e.g. only on viewports < 900px wide). Adding a `(max-width)` clause to the media query is a one-line change if needed.
- Localized text. English only for now.
- Custom icon art (SVG, image). The unicode `↻` glyph at large size is sufficient.
- Animated transition between overlay and game. The default snap-on/snap-off at the media-query boundary is fine.

## Tests

No automated tests. The behavior is pure CSS visibility driven by viewport orientation — Vitest in this project runs in Node without a real DOM viewport, so there's nothing to assert. Verification is by manual smoke test in browser dev tools' device emulation:
- Portrait phone preset → overlay fills the screen, no game visible.
- Landscape preset → no overlay, game renders normally.
- Resize a desktop browser to taller-than-wide → overlay appears. Resize back → overlay disappears.
