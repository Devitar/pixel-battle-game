# PWA Install Prompt for Mobile Users

**Status:** Design · **Date:** 2026-04-25

## Purpose

iPhone Safari has no in-browser fullscreen API for arbitrary elements (we confirmed this empirically). The only path to a chrome-less, full-viewport experience on iPhone is **Add to Home Screen**, which launches the page in standalone PWA mode. Most mobile users won't discover this on their own. This spec adds a one-time-per-session modal that appears on touch devices, detects the user's browser, and walks them through the install steps.

## Behavior

A modal appears 1.5 seconds after page load when **all three** conditions are met:
1. `matchMedia('(pointer: coarse)')` matches (touch device — phones and tablets).
2. The page is **not** already running in standalone mode (`matchMedia('(display-mode: standalone)')` is false AND `navigator.standalone` is not true). The latter is iOS-Safari-specific.
3. `sessionStorage.getItem('pwa-prompt-dismissed')` is null.

The modal:
- Dark semi-transparent backdrop covering the viewport.
- Centered card (~340px wide, capped at `min(340px, 90vw)`).
- Heading "Install Pixel Battle" plus one-line pitch ("Get the full-screen experience.").
- OS-specific step-by-step install instructions (see below).
- "Maybe Later" button at the bottom.
- Tap-on-backdrop also dismisses.

Dismissal writes `sessionStorage.setItem('pwa-prompt-dismissed', '1')`. Per the chosen UX (option B from brainstorming), the modal reappears on next visit until the user actually installs — at which point `display-mode: standalone` suppresses it permanently.

## Per-OS instruction content

UA-detected at modal mount time via simple `navigator.userAgent` substring tests. Four classes:

- **iOS Safari** — UA contains `iPhone` or `iPad` AND does NOT contain `CriOS`/`FxiOS`/`EdgiOS`. Instructions: "1. Tap the Share button (⎙) at the bottom of the screen. 2. Scroll down and tap **Add to Home Screen**. 3. Tap **Add** in the top-right."
- **iOS non-Safari** (Chrome/Firefox/Edge on iOS) — UA contains `iPhone` or `iPad` AND contains one of `CriOS`/`FxiOS`/`EdgiOS`. Instructions: "Add to Home Screen requires Safari on iPhone/iPad. Open this page in Safari, then use the Share menu."
- **Android Chrome** — UA contains `Android` AND contains `Chrome` (not `EdgA` or `OPR`). Instructions: "1. Tap the menu (⋮) in the top-right. 2. Tap **Install app** (or **Add to Home Screen**). 3. Tap **Install**."
- **Android other** (Firefox, Edge, Opera, Samsung Internet) — UA contains `Android` AND no Chrome match. Instructions: "Look for an 'Install' or 'Add to Home Screen' option in your browser's menu."

UA sniffing is a known anti-pattern in general but acceptable here — we're only branching the *display content*, not behavior, and the cost of an incorrect classification is showing the wrong text (still useful, since users can ignore irrelevant steps).

## Architecture

Three files:

- **`src/util/pwa_install_prompt.ts`** — exports `installPwaPrompt()`. Inside: condition checks, UA classification, DOM construction (programmatic — no template strings, no innerHTML), event listeners, dismissal handling. Imports nothing from Phaser. ~120 lines.
- **`src/style.css`** — `#pwa-prompt-backdrop` and `#pwa-prompt-card` rules: position fixed full-viewport, z-index above the fullscreen button (1000+), centering, dark backdrop, card styling, fade-in transition.
- **`src/main.ts`** — one-line call: `installPwaPrompt()` after the existing fullscreen button setup.

The module manages everything itself: condition checks, DOM creation/mount/teardown, event listeners. Caller is one line.

## File layout

| Path | Action | Responsibility |
|---|---|---|
| `src/util/pwa_install_prompt.ts` | **Create** | Module with `installPwaPrompt()` entry point. |
| `src/style.css` | **Modify** | Add backdrop and card styles. |
| `src/main.ts` | **Modify** | One-line call to mount the prompt. |

## Tests

No Vitest tests. The module is pure DOM construction + UA branching; it requires a real browser to verify. Manual testing across:
- iOS Safari → instructions match Share menu flow.
- iOS Chrome → "open in Safari" message.
- Android Chrome (Chrome dev tools emulation works) → install-from-menu instructions.
- Desktop browser at narrow width but with a mouse → no modal (pointer: coarse fails).
- After dismissal → no re-appear in same tab/session. Reappears on new tab.
- After Add to Home Screen → launching from icon shows no modal (standalone mode).

The UA-classification function (`classifyBrowser(uaString): 'ios-safari' | 'ios-other' | 'android-chrome' | 'android-other' | null`) is the only piece worth a unit test — pure-string-in, string-out. Test cases for representative UA strings of each class.

## Out of scope

- `beforeinstallprompt` event (Chrome's programmatic install prompt). Would let Android Chrome users install with one tap inside the modal. Adds complexity, Android-only, and Chrome may auto-show its own install banner anyway. Skip for v1.
- Localization. English only.
- Custom emoji icons or per-OS graphics in the modal. Plain text + a couple of unicode glyphs in the instructions only.
- Screenshot images of the Share menu. Could add later if conversion data shows users not following the text.
- Telemetry on dismissal vs install rate. No analytics infrastructure in this project yet.
- Re-prompt after N days. Per-session only (option B from brainstorm).
- Detecting when the user actually installs (no reliable cross-platform event for this). The standalone-mode check on the next visit covers it.
