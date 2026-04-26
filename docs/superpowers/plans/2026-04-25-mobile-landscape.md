# Mobile Landscape — Rotate-Device Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opaque "Please rotate your device" overlay that fills the screen when the viewport is in portrait orientation, hiding the game until the user reorients to landscape.

**Architecture:** Pure HTML + CSS. A new `#rotate-prompt` div is added next to `#game` in `index.html`. CSS hides it by default and shows it inside `@media (orientation: portrait)`. No JavaScript change.

**Tech Stack:** HTML, CSS media queries.

**Spec:** `docs/superpowers/specs/2026-04-25-mobile-landscape-design.md`

**Per-project convention (`CLAUDE.md`):** commits happen only on explicit user instruction.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `index.html` | **Modify** | Add the `#rotate-prompt` div sibling to `#game`. |
| `src/style.css` | **Modify** | Hide `#rotate-prompt` by default; show it in portrait via media query. |

---

## Task 1: Add the overlay to `index.html`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Insert the overlay div**

In `index.html`, immediately after the `<div id="game"></div>` line, insert the rotate-prompt block:

```html
<div id="game"></div>
<div id="rotate-prompt" role="alert" aria-live="polite">
  <div class="rotate-prompt-icon" aria-hidden="true">&#x21BB;</div>
  <div class="rotate-prompt-text">Please rotate your device to landscape</div>
</div>
<script type="module" src="/src/main.ts"></script>
```

The `role="alert"` and `aria-live="polite"` make screen readers announce the prompt when it appears. `aria-hidden="true"` on the icon prevents it from being read separately (the text already conveys the meaning). `&#x21BB;` is the unicode rotate-arrow glyph — no SVG asset needed.

---

## Task 2: Style the overlay

**Files:**
- Modify: `src/style.css`

- [ ] **Step 1: Add the rotate-prompt CSS**

Append to `src/style.css` (after the existing `#game` rule):

```css
#rotate-prompt {
  display: none;
}

@media (orientation: portrait) {
  #rotate-prompt {
    display: flex;
    position: fixed;
    inset: 0;
    z-index: 1000;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    background: #000;
    color: #ddd;
    font-family: system-ui, -apple-system, sans-serif;
    text-align: center;
    padding: 32px;
  }

  .rotate-prompt-icon {
    font-size: 96px;
    line-height: 1;
    animation: rotate-prompt-spin 2s ease-in-out infinite;
  }

  .rotate-prompt-text {
    font-size: 18px;
    max-width: 280px;
  }

  @keyframes rotate-prompt-spin {
    0%, 40% { transform: rotate(0deg); }
    60%, 100% { transform: rotate(90deg); }
  }
}
```

Notes:
- `inset: 0` is shorthand for `top: 0; right: 0; bottom: 0; left: 0`.
- `z-index: 1000` puts the overlay above the Phaser canvas (which has no z-index — defaults to 0).
- The keyframe animation gently rotates the icon 0° → 90° → 0° on a 2-second cycle, hinting at the rotation the user should perform. Holds at 0° for the first 40% of the cycle, animates to 90° from 40%–60%, holds at 90% from 60%–100%, then snaps back to 0° on loop. The snap-back is intentional (visual reset of the gesture).
- `system-ui, -apple-system, sans-serif` keeps the prompt readable across platforms without bundling a font.

---

## Task 3: Verify

**Files:**
- None (verification only).

- [ ] **Step 1: Typecheck and run tests**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck clean, all 499 tests pass (no JS change).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual browser smoke test**

Run: `npm run dev`
- Open `http://localhost:5173`.
- Open dev tools, switch to device-emulation, pick a portrait phone preset (e.g. iPhone 12).
- Reload. The overlay should fill the screen. Icon should gently rotate. Game should be invisible behind it.
- Switch device-emulation to landscape. The overlay should disappear. Game should render normally.
- Switch back to portrait without reloading. Overlay should reappear.
- Resize a regular desktop browser window to taller-than-wide. Overlay should appear. Resize back to wider. Overlay should disappear.

If any of these fail, stop and investigate before proceeding.

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Add `#rotate-prompt` div in `index.html` | Task 1 |
| Hide by default, show in portrait via `@media (orientation: portrait)` | Task 2 |
| Full viewport coverage, opaque background, z-index above game | Task 2 |
| Icon + text content | Tasks 1 + 2 |
| No JS change | (no task — by design) |
| Manual verification across orientations | Task 3 |

**Out-of-scope items confirmed unaddressed:** tap-to-fullscreen + orientation lock, width-gated activation, localization, custom icon art, transition animation between overlay and game.

**Placeholder scan:** none. Every step shows the actual HTML or CSS to add.
