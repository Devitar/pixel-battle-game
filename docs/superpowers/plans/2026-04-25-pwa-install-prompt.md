# PWA Install Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a one-time-per-session modal on touch devices that walks the user through installing the page as a PWA, so iPhone users (where in-browser fullscreen is impossible) and other mobile users get a chrome-less full-viewport experience.

**Architecture:** Three pieces. (1) `src/util/pwa_install_prompt.ts` exports a single `installPwaPrompt()` function that checks conditions, classifies the browser by UA, builds the modal DOM programmatically, and wires up dismissal. (2) `src/style.css` gets new rules for the backdrop and card. (3) `src/main.ts` calls `installPwaPrompt()` once after the existing fullscreen-button setup.

**Tech Stack:** TypeScript, plain DOM, sessionStorage, matchMedia. No Phaser dependency in the new module (lives under `src/util/` per the project's firewall rule).

**Spec:** `docs/superpowers/specs/2026-04-25-pwa-install-prompt-design.md`

**Per-project convention (`CLAUDE.md`):** commits happen only on explicit user instruction.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/util/pwa_install_prompt.ts` | **Create** | `classifyBrowser(ua)` pure function + `installPwaPrompt()` entry point that gates on conditions, UA-classifies, and mounts the modal. |
| `src/util/__tests__/pwa_install_prompt.test.ts` | **Create** | Unit tests for `classifyBrowser` covering each of the four classes plus the desktop "no match" case. |
| `src/style.css` | **Modify** | Add `#pwa-prompt-backdrop` + `#pwa-prompt-card` styles. |
| `src/main.ts` | **Modify** | One-line call to `installPwaPrompt()` after the fullscreen-button block. |

---

## Task 1: `classifyBrowser` pure function (TDD)

**Goal:** A pure UA-string classifier with no DOM dependency. Returns `'ios-safari' | 'ios-other' | 'android-chrome' | 'android-other' | null`.

**Files:**
- Create: `src/util/pwa_install_prompt.ts`
- Create: `src/util/__tests__/pwa_install_prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/util/__tests__/pwa_install_prompt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classifyBrowser } from '../pwa_install_prompt';

describe('classifyBrowser', () => {
  it('classifies iPhone Safari', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(classifyBrowser(ua)).toBe('ios-safari');
  });

  it('classifies iPad Safari', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
    expect(classifyBrowser(ua)).toBe('ios-safari');
  });

  it('classifies iPhone Chrome (CriOS)', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/119.0.0.0 Mobile/15E148 Safari/604.1';
    expect(classifyBrowser(ua)).toBe('ios-other');
  });

  it('classifies iPhone Firefox (FxiOS)', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/119.0 Mobile/15E148 Safari/604.1';
    expect(classifyBrowser(ua)).toBe('ios-other');
  });

  it('classifies iPhone Edge (EdgiOS)', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/119.0 Mobile/15E148 Safari/604.1';
    expect(classifyBrowser(ua)).toBe('ios-other');
  });

  it('classifies Android Chrome', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36';
    expect(classifyBrowser(ua)).toBe('android-chrome');
  });

  it('classifies Android Firefox', () => {
    const ua = 'Mozilla/5.0 (Android 14; Mobile; rv:119.0) Gecko/119.0 Firefox/119.0';
    expect(classifyBrowser(ua)).toBe('android-other');
  });

  it('classifies Android Edge as android-other (EdgA marker)', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 EdgA/119.0.0.0';
    expect(classifyBrowser(ua)).toBe('android-other');
  });

  it('classifies Android Opera as android-other (OPR marker)', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 OPR/76.0.0.0';
    expect(classifyBrowser(ua)).toBe('android-other');
  });

  it('returns null for desktop Chrome', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
    expect(classifyBrowser(ua)).toBeNull();
  });

  it('returns null for desktop Safari', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
    expect(classifyBrowser(ua)).toBeNull();
  });

  it('returns null for desktop Firefox', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0';
    expect(classifyBrowser(ua)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/util/__tests__/pwa_install_prompt.test.ts`
Expected: every test fails — module/export not found.

- [ ] **Step 3: Implement `classifyBrowser`**

Create `src/util/pwa_install_prompt.ts`:

```ts
export type BrowserClass = 'ios-safari' | 'ios-other' | 'android-chrome' | 'android-other' | null;

export function classifyBrowser(ua: string): BrowserClass {
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  if (isIOS) {
    if (/CriOS|FxiOS|EdgiOS/.test(ua)) return 'ios-other';
    return 'ios-safari';
  }
  const isAndroid = /Android/.test(ua);
  if (isAndroid) {
    if (/EdgA|OPR\//.test(ua)) return 'android-other';
    if (/Chrome/.test(ua)) return 'android-chrome';
    return 'android-other';
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/util/__tests__/pwa_install_prompt.test.ts`
Expected: all 12 tests pass.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: 499 + 12 = 511 tests pass.

- [ ] **Step 6: Commit (only if user has authorized commits this turn)**

```bash
git add src/util/pwa_install_prompt.ts src/util/__tests__/pwa_install_prompt.test.ts
git commit -m "util: add classifyBrowser UA classifier for PWA install prompt"
```

---

## Task 2: `installPwaPrompt` modal mounting

**Goal:** Add the runtime entry point that gates on conditions, builds the modal DOM, and wires up dismissal.

**Files:**
- Modify: `src/util/pwa_install_prompt.ts` (extend with the runtime function).

- [ ] **Step 1: Append `installPwaPrompt` to the module**

Append to `src/util/pwa_install_prompt.ts`:

```ts
const DISMISS_KEY = 'pwa-prompt-dismissed';
const SHOW_DELAY_MS = 1500;

interface InstructionContent {
  pitch: string;
  steps: string[];
}

function instructionsFor(klass: Exclude<BrowserClass, null>): InstructionContent {
  switch (klass) {
    case 'ios-safari':
      return {
        pitch: 'Get the full-screen experience.',
        steps: [
          'Tap the Share button (⮭) at the bottom of the screen.',
          'Scroll down and tap "Add to Home Screen".',
          'Tap "Add" in the top-right.',
        ],
      };
    case 'ios-other':
      return {
        pitch: 'Get the full-screen experience.',
        steps: [
          'Add to Home Screen requires Safari on iPhone or iPad.',
          'Open this page in Safari, then use the Share menu.',
        ],
      };
    case 'android-chrome':
      return {
        pitch: 'Get the full-screen experience.',
        steps: [
          'Tap the menu (⋮) in the top-right.',
          'Tap "Install app" (or "Add to Home Screen").',
          'Tap "Install".',
        ],
      };
    case 'android-other':
      return {
        pitch: 'Get the full-screen experience.',
        steps: [
          'Look for an "Install" or "Add to Home Screen" option in your browser’s menu.',
        ],
      };
  }
}

function shouldShow(): boolean {
  if (!window.matchMedia('(pointer: coarse)').matches) return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return false;
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return false;
  if (sessionStorage.getItem(DISMISS_KEY) !== null) return false;
  return true;
}

function buildModal(content: InstructionContent): HTMLElement {
  const backdrop = document.createElement('div');
  backdrop.id = 'pwa-prompt-backdrop';

  const card = document.createElement('div');
  card.id = 'pwa-prompt-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'pwa-prompt-title');

  const title = document.createElement('h2');
  title.id = 'pwa-prompt-title';
  title.className = 'pwa-prompt-title';
  title.textContent = 'Install Pixel Battle';

  const pitch = document.createElement('p');
  pitch.className = 'pwa-prompt-pitch';
  pitch.textContent = content.pitch;

  const list = document.createElement('ol');
  list.className = 'pwa-prompt-steps';
  for (const step of content.steps) {
    const li = document.createElement('li');
    li.textContent = step;
    list.appendChild(li);
  }

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'pwa-prompt-dismiss';
  dismiss.textContent = 'Maybe Later';

  card.append(title, pitch, list, dismiss);
  backdrop.appendChild(card);
  return backdrop;
}

export function installPwaPrompt(): void {
  if (!shouldShow()) return;
  const klass = classifyBrowser(navigator.userAgent);
  if (klass === null) return;

  const content = instructionsFor(klass);
  const backdrop = buildModal(content);

  function dismiss(): void {
    sessionStorage.setItem(DISMISS_KEY, '1');
    backdrop.remove();
  }

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) dismiss();
  });
  const dismissButton = backdrop.querySelector('.pwa-prompt-dismiss');
  dismissButton?.addEventListener('click', dismiss);

  setTimeout(() => {
    document.body.appendChild(backdrop);
  }, SHOW_DELAY_MS);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run the test suite**

Run: `npm test`
Expected: 511 tests pass. The new `installPwaPrompt` has no unit tests (DOM-construction code can't be exercised in the project's Node-based Vitest setup); the load-bearing pure function `classifyBrowser` is covered by Task 1.

- [ ] **Step 4: Commit (only if user has authorized commits this turn)**

```bash
git add src/util/pwa_install_prompt.ts
git commit -m "util: add installPwaPrompt modal mounting"
```

---

## Task 3: Modal styles

**Goal:** Add CSS for the backdrop and card. Centered, dark backdrop, mobile-first sizing.

**Files:**
- Modify: `src/style.css`

- [ ] **Step 1: Append the styles**

Append to `src/style.css`:

```css
#pwa-prompt-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.78);
  padding: 16px;
  font-family: system-ui, -apple-system, sans-serif;
  animation: pwa-prompt-fade 200ms ease-out;
}

#pwa-prompt-card {
  width: 100%;
  max-width: 340px;
  padding: 24px;
  border-radius: 12px;
  background: #1a1a1a;
  color: #eee;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.pwa-prompt-title {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
}

.pwa-prompt-pitch {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: #bbb;
}

.pwa-prompt-steps {
  margin: 0 0 20px 0;
  padding-left: 20px;
  font-size: 14px;
  line-height: 1.5;
}

.pwa-prompt-steps li {
  margin-bottom: 6px;
}

.pwa-prompt-dismiss {
  display: block;
  width: 100%;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  background: transparent;
  color: #ddd;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: rgba(255, 255, 255, 0.3);
}

.pwa-prompt-dismiss:hover,
.pwa-prompt-dismiss:focus,
.pwa-prompt-dismiss:active {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

@keyframes pwa-prompt-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

The `z-index: 1100` puts the modal above the fullscreen-toggle button (z-index 999) and the rotate-prompt overlay (z-index 1000).

- [ ] **Step 2: Build to confirm CSS bundles cleanly**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit (only if user has authorized commits this turn)**

```bash
git add src/style.css
git commit -m "style: add PWA install prompt modal styles"
```

---

## Task 4: Wire into `main.ts` and verify

**Goal:** Call `installPwaPrompt()` once at startup. Confirm everything compiles, tests pass, and the modal appears in browser when expected.

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add the import and call**

In `src/main.ts`, modify the import block (currently after `installPortraitInputAdapter`'s removal, the file imports just scenes and Phaser). Add:

```ts
import { installPwaPrompt } from './util/pwa_install_prompt';
```

After the existing fullscreen-button setup block (the last block in the file), append:

```ts
installPwaPrompt();
```

The full bottom of the file should now look like:

```ts
const fullscreenButton = document.getElementById('fullscreen-toggle');
const fsRoot = document.documentElement as HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
};
const fullscreenSupported = !!(fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen);
if (fullscreenButton && !fullscreenSupported) {
  fullscreenButton.style.display = 'none';
}
if (fullscreenButton && fullscreenSupported) {
  fullscreenButton.addEventListener('click', async () => {
    // …existing handler…
  });
}

installPwaPrompt();
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: 511 tests pass.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Manual browser smoke test**

Run: `npm run dev:host:https` (HTTPS so iPhone testing works without certificate-trust friction). Open in:

1. **Chrome dev tools, iPhone preset, regular Safari mode (not standalone)** — modal should appear after ~1.5s with iOS Safari instructions. Tap "Maybe Later" — modal disappears. Reload — modal does **not** reappear (sessionStorage). Open a new tab/window — modal **does** appear.
2. **Chrome dev tools, Pixel/Android preset** — modal appears with Android Chrome instructions.
3. **Desktop browser at narrow width** — modal does **not** appear (`pointer: coarse` is false on a mouse).
4. **Add to Home Screen on a real iPhone, then launch from icon** — modal does **not** appear (standalone mode).

If any of these fail, stop and investigate before proceeding.

- [ ] **Step 6: Commit (only if user has authorized commits this turn)**

```bash
git add src/main.ts
git commit -m "main: wire PWA install prompt"
```

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Three-condition gate (`pointer: coarse`, not standalone, not dismissed) | Task 2 (`shouldShow`) |
| 1.5s show delay | Task 2 (`SHOW_DELAY_MS`) |
| Backdrop + centered card | Tasks 2 + 3 |
| iOS Safari instructions | Task 2 (`instructionsFor('ios-safari')`) |
| iOS non-Safari instructions | Task 2 (`instructionsFor('ios-other')`) |
| Android Chrome instructions | Task 2 (`instructionsFor('android-chrome')`) |
| Android other instructions | Task 2 (`instructionsFor('android-other')`) |
| UA-classification function unit-tested | Task 1 |
| sessionStorage dismissal | Task 2 (`dismiss()`) |
| Tap-on-backdrop dismisses | Task 2 (event listener with target check) |
| z-index above fullscreen button (999) | Task 3 (`z-index: 1100`) |
| `src/util/` firewall — no Phaser import | Tasks 1 + 2 (no Phaser imports added) |
| One-line wire-up in `main.ts` | Task 4 |
| Manual smoke-test matrix (iOS, Android, desktop, standalone) | Task 4 Step 5 |

**Out-of-scope items confirmed unaddressed:** `beforeinstallprompt`, localization, custom icons/screenshots, telemetry, N-day re-prompt, install detection.

**Type consistency check:** `BrowserClass` exported from Task 1 is consumed via `Exclude<BrowserClass, null>` in Task 2's `instructionsFor` signature. `installPwaPrompt` (no args, void return) is exported by Task 2 and called by Task 4. CSS class names in Task 2 (`pwa-prompt-title`, `pwa-prompt-pitch`, `pwa-prompt-steps`, `pwa-prompt-dismiss`) match the rules in Task 3.

**Placeholder scan:** none. Every step shows the actual code or command. The "…existing handler…" comment in Task 4 Step 1's full-file snippet is a reference to already-present code that the engineer is not modifying — clearly marked as such.
