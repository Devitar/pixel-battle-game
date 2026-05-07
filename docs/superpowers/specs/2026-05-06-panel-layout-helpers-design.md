# Panel Layout Helpers (sub-spec 1 of 3) — Design Spec

**Date:** 2026-05-06
**Status:** Locked design, ready for implementation plan
**Related TODO:** Cluster B · 45 (Migrate UI to phaser-pixui library) — sub-spec 1 of 3
**Sub-specs in this initiative:**
1. **Layout helpers foundation + blacksmith migration** (this spec)
2. pixui adoption + widget mapping (future)
3. Migrate remaining panels (future)

## Why

Cluster B · 44 (UI mispositioning bug) revealed that hand-rolled layout constants drift across files. 17 hardcoded x/y constants across 5 panel scenes had to be manually shifted to fix asymmetric padding, close-button overflow, and tab/list-pane overlap. The bugs were authored in from the start (commit `cc2bbfb`, 2026-04-30) and only surfaced when a user noticed.

The root cause is *no layout system*: every panel reinvents margin/centering math from scratch with hardcoded numbers. Pure-function layout helpers prevent this by construction — symmetric margins are computed, not specified; close buttons can't overflow because the helper enforces padding from the panel-right edge.

This sub-spec lands the foundation: three helpers + blacksmith migrated as proof. Future sub-specs (2 and 3) build on this.

## Scope summary

**In scope:**

- 1 new file: `src/render/panel_layout.ts` — three pure functions, zero Phaser deps
- 1 new test file: `src/render/__tests__/panel_layout.test.ts` — unit tests for each helper
- Modifications to `src/scenes/blacksmith_panel_scene.ts` — replace hardcoded layout constants with helper-derived values; existing constant names retained (downstream code unchanged)

**Out of scope (deferred):**

- **pixui adoption** — sub-spec 2 in this initiative; widget primitives (Button, ProgressBar, TextArea) addressed separately from layout
- **Other panel migrations** — sub-spec 3; barracks / hospital / tavern / equip / expeditions stay as they are after Cluster B · 44 fixes
- **Tab-strip helper, row-list helper, slot-grid helper** — only blacksmith uses tabs; only blacksmith uses the row-list pattern at this layer; only equip uses the slot-grid pattern. Rule of Three: wait for the third use case before extracting a helper.
- **Container-builder API (option B)** — explicitly chose pure-function (option A) shape per Q1 brainstorm. A → B is an additive evolution available later when patterns repeat.
- **Mode-toggle tab x/y, ROW_*, detail-pane content y positions, mode-toggle dimensions, building-upgrade button positions** — all stay hardcoded in `blacksmith_panel_scene.ts` for now. Bespoke per scene; not yet generalizable.

## Locked decisions (brainstorm log)

| # | Question | Decision |
|---|---|---|
| Q0 | Decompose pixui migration into sub-specs? | **Yes — 3 sub-specs.** Layout helpers (this spec), pixui adoption + widget mapping (future), remaining-panel migrations (future). Each produces working software on its own. |
| Q1 | What's the actual goal — solve layout brittleness, get nicer widgets, or both? | **C — Both.** Sub-spec 1 attacks layout (the Cluster B · 44 root cause); sub-spec 2 attacks widgets (pixui). Combined, both pain sources addressed. |
| Q2 | API style for layout helpers | **A — Coordinate-returning pure functions.** Scenes still call `this.add.rectangle(x, y, ...)` with computed `x`/`y`. Trade-offs: less per-scene boilerplate reduction than B, but no upfront API design pressure, no escape-hatch friction, and trivially testable. Discussed at length: A is the disciplined evolutionary-design choice for internal single-consumer helpers; B → A is an additive evolution available later when patterns prove themselves. |
| Q3 | What primitives in the first cut? | **Three.** `panelLayout`, `splitPaneLayout`, `headerStripLayout` — exactly what blacksmith needs. Skip tab-strip, row-list, slot-grid until a third scene needs them (Rule of Three). YAGNI. |
| Q4 | Migration shape for blacksmith | **Keep existing constant names; derive their values from helper calls.** Minimum disruption — downstream code (`PANEL_CX` references in 200+ lines) unchanged. The values are now provably symmetric; the bugs from Cluster B · 44 cannot reoccur. |
| Q5 | Tests | **Yes, ~10 unit tests.** The pure-function shape (Q2) preserves testability that container-builders would have lost. Three describe blocks, one per helper. |

## Architecture

### `src/render/panel_layout.ts` (new file)

Single module exporting three pure functions plus their input/output types. Zero imports from `phaser` (the firewall already prohibits this for `src/render/`, but worth restating: these helpers operate on plain numbers).

```typescript
// Inputs/outputs
export interface PanelBounds {
  panelCx: number; panelCy: number;
  panelLeft: number; panelRight: number;
  panelTop: number; panelBottom: number;
}

export interface SplitPaneLayout {
  listCx: number; listCy: number; listW: number; listH: number;
  detailCx: number; detailCy: number; detailW: number; detailH: number;
  gap: number;
}

export interface HeaderStripLayout {
  titleCx: number; titleY: number;
  goldRightX: number; goldY: number;
  closeBtnCx: number; closeBtnCy: number;
}
```

Function signatures:

```typescript
export function panelLayout(opts: {
  canvasW: number; canvasH: number;
  panelW: number; panelH: number;
}): PanelBounds;

export function splitPaneLayout(opts: {
  panelLeft: number; panelRight: number; panelTop: number; panelBottom: number;
  listW: number; detailW: number;
  marginH: number; marginV: number;
}): SplitPaneLayout;

export function headerStripLayout(opts: {
  panelLeft: number; panelRight: number; panelTop: number;
  padding: number;
  closeBtnSize: number;
  titleYOffset?: number;        // default 20 (title at panelTop + 20)
  closeBtnYOffset?: number;     // default 23 (close center at panelTop + 23, fits 28-tall close in header strip)
  goldYOffset?: number;         // default 20 (gold baseline matches title)
  goldRightOffsetFromCloseLeft?: number;  // default 14 (gold right edge sits 14px before close left edge)
}): HeaderStripLayout;
```

### `src/render/__tests__/panel_layout.test.ts` (new file)

Three describe blocks, ~10 tests:

```typescript
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
  });
});

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
});
```

### Blacksmith migration

In `src/scenes/blacksmith_panel_scene.ts`, replace the top-of-file constants block.

**Before (current state, post-Cluster-B·44):**

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

**After:**

```typescript
import { panelLayout, splitPaneLayout, headerStripLayout } from '@render/panel_layout';

const PANEL = panelLayout({
  canvasW: 960, canvasH: 540,
  panelW: 920, panelH: 460,
});

const SPLIT = splitPaneLayout({
  panelLeft: PANEL.panelLeft, panelRight: PANEL.panelRight,
  panelTop: PANEL.panelTop, panelBottom: PANEL.panelBottom,
  listW: 380, detailW: 440,
  marginH: 20, marginV: 65,  // preserves current Cluster-B·44 visuals; see "Migration math note" below
});

const HEADER = headerStripLayout({
  panelLeft: PANEL.panelLeft, panelRight: PANEL.panelRight, panelTop: PANEL.panelTop,
  padding: 8, closeBtnSize: 28,
  titleYOffset: 20, closeBtnYOffset: 23, goldYOffset: 20,
});

// Existing constant names retained — downstream code references them everywhere.
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

Then in `buildOverlayAndPanel`, replace the hardcoded title/gold/close coordinates:

```typescript
this.titleText = this.add
  .text(HEADER.titleCx, HEADER.titleY, '', { /* style unchanged */ })
  .setOrigin(0.5);

this.goldText = this.add
  .text(HEADER.goldRightX, HEADER.goldY, '', { /* style unchanged */ })
  .setOrigin(1, 0.5);
```

And in `buildCloseButton`:

```typescript
const closeBg = this.add
  .rectangle(HEADER.closeBtnCx, HEADER.closeBtnCy, 28, 28, 0x553333)
  .setStrokeStyle(1, 0x885555);
this.add
  .text(HEADER.closeBtnCx, HEADER.closeBtnCy, '×', { /* style unchanged */ })
  .setOrigin(0.5);
```

**Migration math note:** The current state of blacksmith (after Cluster B · 44) has `LIST_PANE_CY = 285, LIST_PANE_H = 330` — produced by lowering the pane top from y=90 to y=120 to clear the tabs. With `marginV = 80`:
- `paneH = panelH - 2*marginV = 460 - 160 = 300`
- `listCy = panelTop + marginV + paneH/2 = 40 + 80 + 150 = 270`

That's `LIST_PANE_CY=270, LIST_PANE_H=300` — **a 15px difference from the current `285/330` values.** To preserve current visuals exactly, we'd need `marginV = 65` (which yields `paneH = 330, listCy = 285`).

**Decision:** Use `marginV = 65` for now to preserve the current Cluster-B·44-fixed visuals. The semantic of `marginV` is "vertical padding between panel edge and pane edge" — `65` is a defensible value that happens to match the current asymmetric vertical layout (panel header takes 75 px above the pane, panel bottom has 50px below). This is a workaround; the cleaner long-term fix is to also expose a `headerStripHeight` parameter so the pane top is `panelTop + headerStripHeight`. **Deferred to a future sub-spec when more panels share the pattern.**

### Tests for blacksmith migration

No new scene tests (Phaser scenes aren't unit-tested in this codebase). Manual verification checklist:

- [ ] Open Blacksmith — pixel-identical to current Cluster-B·44-fixed visuals
- [ ] List pane and detail pane have equal horizontal margins
- [ ] Close button inside panel with 8px padding from right edge
- [ ] Title centered at panel center
- [ ] Gold counter right-aligned with 14px gap to close button
- [ ] Switching to Sell tab — same layout

## Risks and open questions

- **Migration math approximation.** The chosen `marginV = 65` exactly preserves current visuals but is a "magic number" derived from the current asymmetric vertical layout. A cleaner future API would expose `headerStripHeight` separately. Documented as a deferred follow-up.
- **API design risk on first use.** These are the first helpers; their signatures may turn out wrong after a second/third scene tries to use them. Mitigated by: (1) helpers are internal single-consumer, (2) refactoring them is a one-commit change to all callers, (3) sub-specs 2 and 3 will validate the API by exercising it across more scenes.
- **`splitPaneLayout` doesn't model the case where one pane is much larger than the other** (like equip's 260+620 split). The current API enforces both panes get the same vertical box. If equip migrates later, we may need to extend the helper. Acceptable: equip is in sub-spec 3, not this one.

## Future spec hooks (not implemented here)

- **Sub-spec 2 (pixui adoption)** — independent of layout helpers; can run in parallel or after this sub-spec.
- **Sub-spec 3 (remaining panels)** — applies these helpers to barracks, hospital, tavern, equip, expeditions. Will reveal which helper APIs need to grow vs which are right.
- **Tab-strip helper** — when the second scene with tabs appears (currently only blacksmith)
- **Row-list helper** — when the second scene needs paginated row layout (currently only blacksmith uses this exact shape)
- **Container-builder graduation (option B)** — when a helper has 3+ callers all writing the same imperative glue around its output, that's the signal to graduate it to a container-builder shape.
