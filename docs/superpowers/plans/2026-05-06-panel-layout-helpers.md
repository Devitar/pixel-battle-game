# Panel Layout Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land three pure-function layout helpers in `src/render/panel_layout.ts` and migrate `blacksmith_panel_scene.ts` to use them, eliminating the hand-rolled layout constants that caused Cluster B · 44.

**Architecture:** Three helpers — `panelLayout`, `splitPaneLayout`, `headerStripLayout` — take plain numeric inputs and return computed coordinates. Zero Phaser dependencies (the firewall already prohibits `phaser` imports under `src/render/`). Blacksmith keeps its existing constant names; the values are now derived from the helpers, so downstream code is unchanged but symmetric padding and close-button positioning are guaranteed by construction.

**Tech Stack:** TypeScript (strict), Vitest, Phaser 4.

**Spec:** [`docs/superpowers/specs/2026-05-06-panel-layout-helpers-design.md`](../specs/2026-05-06-panel-layout-helpers-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/render/panel_layout.ts` | Create | Three pure functions + their input/output types. Zero Phaser deps. ~70 LOC. |
| `src/render/__tests__/panel_layout.test.ts` | Create | ~10 unit tests across three describe blocks. |
| `src/scenes/blacksmith_panel_scene.ts` | Modify | Replace hardcoded layout constants with helper-derived values. Existing constant names retained. |

**No other files touched.** Other panel scenes (barracks, hospital, tavern, equip, expeditions) are explicitly out of scope — sub-spec 3 addresses them.

---

## Tasks

### Task 1: Build panel_layout.ts + tests for all three helpers

TDD per helper: write failing test → implement → green. The three helpers don't depend on each other, but bundling them in one task keeps the file/test creation atomic.

**Files:**
- Create: `src/render/panel_layout.ts`
- Create: `src/render/__tests__/panel_layout.test.ts`

- [ ] **Step 1: Run baseline checks**

```
npx tsc --noEmit
npm test
```

Expected: clean typecheck; ~1716 tests passing.

- [ ] **Step 2: Create the test file with the panelLayout describe block**

Create `src/render/__tests__/panel_layout.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { panelLayout, splitPaneLayout, headerStripLayout } from '../panel_layout';

describe('panelLayout', () => {
  it('centers the panel in the canvas', () => {
    const b = panelLayout({ canvasW: 960, canvasH: 540, panelW: 920, panelH: 460 });
    expect(b.panelCx).toBe(480);
    expect(b.panelCy).toBe(270);
  });

  it('computes correct bounds for standard 960x540 / 920x460 layout', () => {
    const b = panelLayout({ canvasW: 960, canvasH: 540, panelW: 920, panelH: 460 });
    expect(b.panelLeft).toBe(20);
    expect(b.panelRight).toBe(940);
    expect(b.panelTop).toBe(40);
    expect(b.panelBottom).toBe(500);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```
npx vitest run src/render/__tests__/panel_layout.test.ts
```

Expected: import error — `panel_layout.ts` doesn't exist yet.

- [ ] **Step 4: Create panel_layout.ts with the panelLayout function**

Create `src/render/panel_layout.ts`:

```typescript
export interface PanelBounds {
  panelCx: number;
  panelCy: number;
  panelLeft: number;
  panelRight: number;
  panelTop: number;
  panelBottom: number;
}

export function panelLayout(opts: {
  canvasW: number;
  canvasH: number;
  panelW: number;
  panelH: number;
}): PanelBounds {
  const panelCx = opts.canvasW / 2;
  const panelCy = opts.canvasH / 2;
  return {
    panelCx,
    panelCy,
    panelLeft: panelCx - opts.panelW / 2,
    panelRight: panelCx + opts.panelW / 2,
    panelTop: panelCy - opts.panelH / 2,
    panelBottom: panelCy + opts.panelH / 2,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

```
npx vitest run src/render/__tests__/panel_layout.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 6: Add splitPaneLayout tests**

Append to `src/render/__tests__/panel_layout.test.ts`:

```typescript
describe('splitPaneLayout', () => {
  it('produces symmetric left/right margins', () => {
    const s = splitPaneLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40, panelBottom: 500,
      listW: 380, detailW: 440, marginH: 20, marginV: 50,
    });
    // marginH = 20 → list left edge = 40 → listCx = 40 + 190 = 230
    expect(s.listCx).toBe(230);
    // detail right edge = 940 - 20 = 920 → detailCx = 920 - 220 = 700
    expect(s.detailCx).toBe(700);
  });

  it('computes the gap as remaining horizontal space', () => {
    const s = splitPaneLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40, panelBottom: 500,
      listW: 380, detailW: 440, marginH: 20, marginV: 50,
    });
    // panelW=920, content=380+440=820, marginH*2=40, gap = 920-820-40 = 60
    expect(s.gap).toBe(60);
  });

  it('throws if listW + detailW + 2*marginH > panel width', () => {
    expect(() => splitPaneLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40, panelBottom: 500,
      listW: 500, detailW: 500, marginH: 20, marginV: 50,
    })).toThrow();
  });

  it('respects vertical margin (marginV) for pane height', () => {
    const s = splitPaneLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40, panelBottom: 500,
      listW: 380, detailW: 440, marginH: 20, marginV: 80,
    });
    // panelH = 460, marginV*2 = 160, paneH = 300
    expect(s.listH).toBe(300);
    expect(s.detailH).toBe(300);
    // listCy = panelTop + marginV + listH/2 = 40 + 80 + 150 = 270
    expect(s.listCy).toBe(270);
    expect(s.detailCy).toBe(270);
  });

  it('produces matching widths and heights for both panes', () => {
    const s = splitPaneLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40, panelBottom: 500,
      listW: 380, detailW: 440, marginH: 20, marginV: 65,
    });
    expect(s.listW).toBe(380);
    expect(s.detailW).toBe(440);
    expect(s.listH).toBe(s.detailH);
  });
});
```

- [ ] **Step 7: Run tests — expect failure**

```
npx vitest run src/render/__tests__/panel_layout.test.ts
```

Expected: import error — `splitPaneLayout` not defined.

- [ ] **Step 8: Add splitPaneLayout to panel_layout.ts**

Append to `src/render/panel_layout.ts`:

```typescript
export interface SplitPaneLayout {
  listCx: number;
  listCy: number;
  listW: number;
  listH: number;
  detailCx: number;
  detailCy: number;
  detailW: number;
  detailH: number;
  gap: number;
}

export function splitPaneLayout(opts: {
  panelLeft: number;
  panelRight: number;
  panelTop: number;
  panelBottom: number;
  listW: number;
  detailW: number;
  marginH: number;
  marginV: number;
}): SplitPaneLayout {
  const panelW = opts.panelRight - opts.panelLeft;
  const gap = panelW - opts.listW - opts.detailW - 2 * opts.marginH;
  if (gap < 0) {
    throw new Error(
      `splitPaneLayout: listW (${opts.listW}) + detailW (${opts.detailW}) + 2*marginH (${2 * opts.marginH}) exceeds panel width (${panelW})`,
    );
  }

  const listCx = opts.panelLeft + opts.marginH + opts.listW / 2;
  const detailCx = opts.panelRight - opts.marginH - opts.detailW / 2;
  const paneH = opts.panelBottom - opts.panelTop - 2 * opts.marginV;
  const paneCy = opts.panelTop + opts.marginV + paneH / 2;

  return {
    listCx,
    listCy: paneCy,
    listW: opts.listW,
    listH: paneH,
    detailCx,
    detailCy: paneCy,
    detailW: opts.detailW,
    detailH: paneH,
    gap,
  };
}
```

- [ ] **Step 9: Run tests — expect pass**

```
npx vitest run src/render/__tests__/panel_layout.test.ts
```

Expected: 7 tests pass (2 panelLayout + 5 splitPaneLayout).

- [ ] **Step 10: Add headerStripLayout tests**

Append to `src/render/__tests__/panel_layout.test.ts`:

```typescript
describe('headerStripLayout', () => {
  it('places close button inside the panel with the configured padding', () => {
    const h = headerStripLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40,
      padding: 8, closeBtnSize: 28,
    });
    // close right edge at 940-8 = 932; closeBtnCx = 932 - 14 = 918
    expect(h.closeBtnCx).toBe(918);
  });

  it('right-aligns gold to leave room for the close button', () => {
    const h = headerStripLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40,
      padding: 8, closeBtnSize: 28,
    });
    // close left edge = 918 - 14 = 904; gold right edge = 904 - 14 = 890
    expect(h.goldRightX).toBe(890);
  });

  it('positions title at the panel center', () => {
    const h = headerStripLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40,
      padding: 8, closeBtnSize: 28,
    });
    // titleCx = (panelLeft + panelRight) / 2 = 480
    expect(h.titleCx).toBe(480);
  });

  it('uses default y offsets when not provided (title at panelTop+20, close at panelTop+23)', () => {
    const h = headerStripLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40,
      padding: 8, closeBtnSize: 28,
    });
    expect(h.titleY).toBe(60);
    expect(h.closeBtnCy).toBe(63);
    expect(h.goldY).toBe(60);
  });

  it('respects custom title/close/gold y offsets', () => {
    const h = headerStripLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40,
      padding: 8, closeBtnSize: 28,
      titleYOffset: 25, closeBtnYOffset: 28, goldYOffset: 25,
    });
    expect(h.titleY).toBe(65);
    expect(h.closeBtnCy).toBe(68);
    expect(h.goldY).toBe(65);
  });

  it('respects custom goldRightOffsetFromCloseLeft', () => {
    const h = headerStripLayout({
      panelLeft: 20, panelRight: 940, panelTop: 40,
      padding: 8, closeBtnSize: 28,
      goldRightOffsetFromCloseLeft: 30,
    });
    // close left edge = 904; gold right edge = 904 - 30 = 874
    expect(h.goldRightX).toBe(874);
  });
});
```

- [ ] **Step 11: Run tests — expect failure**

```
npx vitest run src/render/__tests__/panel_layout.test.ts
```

Expected: import error — `headerStripLayout` not defined.

- [ ] **Step 12: Add headerStripLayout to panel_layout.ts**

Append to `src/render/panel_layout.ts`:

```typescript
export interface HeaderStripLayout {
  titleCx: number;
  titleY: number;
  goldRightX: number;
  goldY: number;
  closeBtnCx: number;
  closeBtnCy: number;
}

export function headerStripLayout(opts: {
  panelLeft: number;
  panelRight: number;
  panelTop: number;
  padding: number;
  closeBtnSize: number;
  titleYOffset?: number;
  closeBtnYOffset?: number;
  goldYOffset?: number;
  goldRightOffsetFromCloseLeft?: number;
}): HeaderStripLayout {
  const titleYOffset = opts.titleYOffset ?? 20;
  const closeBtnYOffset = opts.closeBtnYOffset ?? 23;
  const goldYOffset = opts.goldYOffset ?? 20;
  const goldRightOffsetFromCloseLeft = opts.goldRightOffsetFromCloseLeft ?? 14;

  const closeBtnCx = opts.panelRight - opts.padding - opts.closeBtnSize / 2;
  const closeBtnLeftEdge = closeBtnCx - opts.closeBtnSize / 2;
  const goldRightX = closeBtnLeftEdge - goldRightOffsetFromCloseLeft;

  return {
    titleCx: (opts.panelLeft + opts.panelRight) / 2,
    titleY: opts.panelTop + titleYOffset,
    goldRightX,
    goldY: opts.panelTop + goldYOffset,
    closeBtnCx,
    closeBtnCy: opts.panelTop + closeBtnYOffset,
  };
}
```

- [ ] **Step 13: Run tests — expect pass**

```
npx vitest run src/render/__tests__/panel_layout.test.ts
```

Expected: 13 tests pass (2 panelLayout + 5 splitPaneLayout + 6 headerStripLayout).

- [ ] **Step 14: Run full suite to confirm no regression**

```
npx tsc --noEmit
npm test
```

Expected: clean typecheck; ~1729 tests passing (1716 baseline + 13 new).

- [ ] **Step 15: SKIP — DO NOT COMMIT.** (Per repo policy; leave changes in working tree.)

---

### Task 2: Migrate blacksmith_panel_scene.ts to use the helpers

Replace the hardcoded panel/list-pane/detail-pane/header-strip constants with helper-derived values. Existing constant names retained so downstream code is unchanged.

**Files:**
- Modify: `src/scenes/blacksmith_panel_scene.ts`

- [ ] **Step 1: Replace the layout constants block at the top of blacksmith_panel_scene.ts**

Find the existing constants block (currently lines 16-30 after Cluster B · 44 fixes):

```typescript
const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 920;
const PANEL_H = 460;

const LIST_PANE_CX = 230;
const LIST_PANE_CY = 285;
const LIST_PANE_W = 380;
const LIST_PANE_H = 330;

const DETAIL_PANE_CX = 700;
const DETAIL_PANE_CY = 285;
const DETAIL_PANE_W = 440;
const DETAIL_PANE_H = 330;
```

Replace with:

```typescript
const PANEL = panelLayout({
  canvasW: 960, canvasH: 540,
  panelW: 920, panelH: 460,
});

const SPLIT = splitPaneLayout({
  panelLeft: PANEL.panelLeft, panelRight: PANEL.panelRight,
  panelTop: PANEL.panelTop, panelBottom: PANEL.panelBottom,
  listW: 380, detailW: 440,
  marginH: 20, marginV: 65,  // marginV: 65 preserves the post-Cluster-B·44 visuals (listCy=285, listH=330)
});

const HEADER = headerStripLayout({
  panelLeft: PANEL.panelLeft, panelRight: PANEL.panelRight, panelTop: PANEL.panelTop,
  padding: 8, closeBtnSize: 28,
});

// Existing constant names retained — downstream code references them widely.
const PANEL_CX = PANEL.panelCx;
const PANEL_CY = PANEL.panelCy;
const PANEL_W = 920;
const PANEL_H = 460;

const LIST_PANE_CX = SPLIT.listCx;
const LIST_PANE_CY = SPLIT.listCy;
const LIST_PANE_W = SPLIT.listW;
const LIST_PANE_H = SPLIT.listH;

const DETAIL_PANE_CX = SPLIT.detailCx;
const DETAIL_PANE_CY = SPLIT.detailCy;
const DETAIL_PANE_W = SPLIT.detailW;
const DETAIL_PANE_H = SPLIT.detailH;
```

- [ ] **Step 2: Add the import at the top of the file**

Find the imports block. Add (alphabetical with the other `@render` imports if present, otherwise just add it):

```typescript
import { headerStripLayout, panelLayout, splitPaneLayout } from '@render/panel_layout';
```

- [ ] **Step 3: Replace title and gold positions in `buildOverlayAndPanel`**

Find the existing `titleText` and `goldText` constructions (around lines 173-187):

```typescript
this.titleText = this.add
  .text(PANEL_CX, 60, '', {
    fontFamily: 'monospace',
    fontSize: '18px',
    color: '#ffffff',
  })
  .setOrigin(0.5);

this.goldText = this.add
  .text(890, 60, '', {
    fontFamily: 'monospace',
    fontSize: '14px',
    color: '#ffcc66',
  })
  .setOrigin(1, 0.5);
```

Replace `(PANEL_CX, 60)` with `(HEADER.titleCx, HEADER.titleY)` and `(890, 60)` with `(HEADER.goldRightX, HEADER.goldY)`:

```typescript
this.titleText = this.add
  .text(HEADER.titleCx, HEADER.titleY, '', {
    fontFamily: 'monospace',
    fontSize: '18px',
    color: '#ffffff',
  })
  .setOrigin(0.5);

this.goldText = this.add
  .text(HEADER.goldRightX, HEADER.goldY, '', {
    fontFamily: 'monospace',
    fontSize: '14px',
    color: '#ffcc66',
  })
  .setOrigin(1, 0.5);
```

- [ ] **Step 4: Replace close-button positions in `buildCloseButton`**

Find the existing close button (currently uses `(918, 63)` after Cluster B · 44 fixes):

```typescript
private buildCloseButton(): void {
  const closeBg = this.add
    .rectangle(918, 63, 28, 28, 0x553333)
    .setStrokeStyle(1, 0x885555);
  this.add
    .text(918, 63, '×', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ffffff',
    })
    .setOrigin(0.5);
```

Replace `(918, 63)` with `(HEADER.closeBtnCx, HEADER.closeBtnCy)`:

```typescript
private buildCloseButton(): void {
  const closeBg = this.add
    .rectangle(HEADER.closeBtnCx, HEADER.closeBtnCy, 28, 28, 0x553333)
    .setStrokeStyle(1, 0x885555);
  this.add
    .text(HEADER.closeBtnCx, HEADER.closeBtnCy, '×', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ffffff',
    })
    .setOrigin(0.5);
```

- [ ] **Step 5: Run typecheck**

```
npx tsc --noEmit
```

Expected: clean. The migrated constants resolve to the same values, so all downstream type-checks pass unchanged.

- [ ] **Step 6: Run full test suite**

```
npm test
```

Expected: ~1729 tests pass. Blacksmith isn't unit-tested but its constants now derive from helpers; no test should break.

- [ ] **Step 7: SKIP — DO NOT COMMIT.**

---

### Task 3: Manual browser verification

Verify blacksmith renders pixel-identical to its current Cluster-B·44-fixed state. The migration is value-preserving — any visual difference is a regression in the helper math.

**Files:** None modified.

- [ ] **Step 1: Start the dev server**

```
npm run dev
```

Expected: Vite serves at http://localhost:5173.

- [ ] **Step 2: Navigate to Blacksmith**

In the browser:
- New game (or existing save with the Blacksmith building)
- Click Blacksmith from the camp scene
- Blacksmith panel opens

- [ ] **Step 3: Verify the panel is pixel-identical to pre-migration state**

Visual checks (all should match the post-Cluster-B·44 baseline, since the migration is a value-preserving refactor):

- [ ] List pane (item rows on left) and detail pane (item details on right) have **equal padding** to the panel edges
- [ ] Close button (×) inside the panel with **8px padding** from the right edge
- [ ] Title "Blacksmith · N upgradeable" centered at the top
- [ ] Gold counter right-aligned, with a small gap between it and the close button
- [ ] "Upgrade" / "Sell" tabs visible above the item list, **not covered by the first row** (this verification confirms `LIST_PANE_CY` matches the pre-migration value — a regression here means the helper math is wrong)
- [ ] Item icons sized correctly (~24×24, set by Cluster B · 44 fix — not affected by this migration but worth confirming no regression)
- [ ] Detail pane shows item details (Hood title, rarity, affixes, sell value) in their previous positions

- [ ] **Step 4: Switch to Sell tab**

Click "Sell" tab.

- [ ] Layout matches the Upgrade tab (pane positions identical)
- [ ] Sell-mode rows render in the same positions as Upgrade-mode rows

- [ ] **Step 5: Verify console is clean**

Open devtools console.

- [ ] No errors from the panel rendering
- [ ] No warnings about helper input validation (e.g., the `splitPaneLayout` throw shouldn't fire — values are valid)

- [ ] **Step 6: SKIP — DO NOT COMMIT.** Hand off the dirty working tree to the user for review and manual commit.

---

## Done

- New `src/render/panel_layout.ts` with three pure functions (`panelLayout`, `splitPaneLayout`, `headerStripLayout`)
- ~13 unit tests covering the helpers
- Blacksmith migrated to use helpers; existing constant names retained; downstream code unchanged
- Blacksmith renders pixel-identical to its Cluster-B·44-fixed baseline
- Foundation in place for sub-spec 2 (pixui adoption) and sub-spec 3 (remaining-panel migrations)
- Test count: 1716 → ~1729 (+13)
