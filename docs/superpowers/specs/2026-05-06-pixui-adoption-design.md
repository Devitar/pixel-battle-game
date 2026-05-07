# pixui Hello-World Adoption (sub-spec 2 of 3) — Design Spec

**Date:** 2026-05-06
**Status:** Locked design, ready for implementation plan
**Related TODO:** Cluster B · 45 (Migrate UI to phaser-pixui library) — sub-spec 2 of 3
**Sub-specs in this initiative:**
1. Layout helpers foundation + blacksmith migration ([completed 2026-05-06](./2026-05-06-panel-layout-helpers-design.md))
2. **pixui adoption + Hello-World hospital migration** (this spec)
3. Migrate remaining panels (future)

## Why

Cluster B · 44 (UI mispositioning bug) and sub-spec 1 (layout helpers) addressed *layout brittleness*. This sub-spec attacks the second axis of pain: hand-rolled widget primitives. Every panel scene reimplements close buttons / tab buttons / row buttons / dialogs from scratch — `add.rectangle().setStrokeStyle() + add.text() + setInteractive() + on('pointerdown')` chains repeated 60+ times across 6 panel scenes. A widget library would replace these with named, themed components.

The user committed the `tinyRPG_manaSoulGUI` sprite pack and `tinyRPG_fontKit02` bitmap font pack — the same canonical assets the pixui example uses. This eliminates the asset-creation barrier and makes pixui adoption tractable.

## Scope summary

**In scope:**

- Asset reorganization: move UI sprite PNGs from `public/assets/sprites/tinyRPG_manaSoulGUI_v_1_0/` to `assets/ui/`; move bitmap font PNGs from `public/assets/fonts/tinyRPG_fontKit02_v1_0/` to `assets/` (root) with name normalization
- Discard the TTF font files (pixui consumes the PNG sheets directly via `fonts.yaml`)
- New deps: `phaser-pixui` (runtime), `pixel-tools` (dev)
- New files: `assets/ui.yaml`, `assets/fonts.yaml` (copied from pixui example, paths adjusted)
- New file: `vite/assets.mjs` (asset config consumed by pixel-tools)
- Modify: `vite.config.ts` (or create as `.ts` — wire pixel-tools as a Vite plugin or build hook)
- Modify: `.gitignore` (add `public/packed_assets/`)
- Modify: `src/scenes/boot_scene.ts` (load packed atlas + bitmap fonts from `packed_assets/`)
- New file: `src/render/ui_theme.ts` (pixui ThemeConfig — copy from example, lightly project-flavored)
- Migrate: `src/scenes/hospital_panel_scene.ts` to extend `UiScene` and use the `insert` DSL for all widgets

**Out of scope (deferred):**

- **Other panel migrations** — sub-spec 3 covers barracks, blacksmith, tavern, equip, expeditions
- **Combat / dungeon / corridor scene migrations** — not panel-shaped; pixui doesn't target them
- **Custom theme art** — using the example's `mana_soul` theme as-is; project-flavored theme polish in sub-spec 3 or later
- **Adapter layer (`closeButton()` / `tabButton()` factories)** — wait until sub-spec 3 reveals which patterns repeat
- **Removing or mothballing sub-spec 1's layout helpers** — they remain in active use by the 5 unmigrated panels until sub-spec 3 finishes
- **The 51-PNG pack's unused sheets** — only the sheets referenced by `ui.yaml` get used in this sub-spec; remaining sheets stay in `assets/ui/` for future use (or get pruned in a cleanup pass later)

## Locked decisions (brainstorm log)

| # | Question | Decision |
|---|---|---|
| Q1 | After sub-spec 1's layout helpers landed, what's the goal of sub-spec 2 — solve layout brittleness, get nicer widgets, or both? | **C — Both** (solidified in sub-spec 1 brainstorm). Sub-spec 1 attacked layout; sub-spec 2 attacks widgets. |
| Q1.1 | Given pixui's actual API (extends `UiScene`, has its own `insert` DSL replacing layout-helper math), should we still adopt pixui? | **B (revised) — Adopt pixui fully.** Even though pixui's `insert` DSL displaces sub-spec 1's helpers for migrated panels, the framework's value (themed widgets, asset pipeline, layout DSL) is worth the architectural pivot. Sub-spec 1's helpers stay relevant for unmigrated panels. |
| Q1.2 | pixui requires UI sprite art + bitmap fonts — major art investment? | **No (resolved by user)** — user already has the canonical `tinyRPG_manaSoulGUI` + `tinyRPG_fontKit02` assets the pixui example uses. The artwork barrier disappears. |
| Q1.3 | pixui's asset pipeline — pack atlas + generate BMFonts manually? | **No** — pixui example uses `pixel-tools` (npm dev dep) + YAML manifests. pixel-tools generates the atlas + fonts at build time from raw PNG sheets. We adopt this pipeline. |
| Q1.4 | Pull asset definitions from the pixui example? | **Yes** — copy `ui.yaml`, `fonts.yaml`, `vite/assets.mjs`, and example `theme.ts` from `phaser-pixui/example/`. Reorganize our PNGs to match the example's expected layout (`assets/ui/*.png` for sprites, `assets/*.png` for fonts) so the YAMLs work with minimal edits. |
| Q2 | Sub-spec 2 scope: Hello-World, Foundation+Signature panel, or Investigation only? | **A — Hello-World** (mirrors sub-spec 1's pattern). Add deps, set up minimal viable theme, migrate one small panel (hospital) end-to-end. Sub-spec 3 covers the rest. |
| sub | Which panel to migrate first? | **Hospital** — smallest panel scene, fewest features, lowest blast radius if pixui has rough edges. Avoids re-migrating blacksmith (which sub-spec 1 just touched). |
| sub | Asset reorganization direction? | **Reorganize project to match pixui example layout** (`assets/ui/`, `assets/*.png` for fonts) rather than editing YAMLs to point at our existing structure. Cleaner long-term — the pixui-blessed structure is also a more conventional asset layout. |
| sub | Where do generated atlas + fonts live? | `public/packed_assets/` (matches example). Gitignored — pixel-tools regenerates on build. |

## Architecture

### Directory layout (after this sub-spec)

```
assets/                                 # build-time inputs (NOT served directly)
├── ui/
│   ├── 20250420manaSoul9SlicesA-Sheet.png
│   ├── 20250420manaSoulHeaderA-Sheet.png
│   ├── 20250421barA-Sheet.png
│   ├── 20250421manaSoulButtonB-Sheet.png
│   ├── 20250425closeButton-Sheet.png
│   ├── 20250425optionsButton-Sheet.png
│   ├── ... (all 51 PNGs from the original pack)
│   └── bar_green.png                   # auxiliary (from example)
├── ui.yaml                             # pixui sprite manifest
├── fonts.yaml                          # pixui font manifest
├── mana_roots.png                      # bitmap font (renamed from rootsFont.png)
├── mana_trunk.png                      # bitmap font (renamed from trunkFont.png)
└── mana_branches.png                   # bitmap font (renamed from branchesFont.png)

public/
├── packed_assets/                      # GENERATED by pixel-tools — gitignored
│   ├── mana_soul.png                   # packed atlas
│   ├── mana_soul.json                  # atlas manifest
│   ├── fonts.png                       # packed font atlas
│   └── fonts.json                      # font manifest
└── assets/                             # existing game assets (audio, animated, fonts/, sprites/) — UNCHANGED
    ├── audio/
    ├── animated/
    ├── fonts/                          # tinyRPG_fontKit02 already removed (moved up to assets/)
    └── sprites/                        # tinyRPG_manaSoulGUI already removed (moved up to assets/ui/)

vite/
└── assets.mjs                          # pixel-tools config

src/
├── render/
│   ├── ui_theme.ts                     # NEW — pixui ThemeConfig
│   └── panel_layout.ts                 # UNCHANGED — still used by non-migrated panels
└── scenes/
    ├── boot_scene.ts                   # MODIFIED — loads packed_assets
    ├── hospital_panel_scene.ts         # REWRITTEN — extends UiScene
    └── (others unchanged)
```

### Asset pipeline

1. **Author time:** PNGs + YAMLs live in `assets/`
2. **Build time:** `pixel-tools` (invoked from `vite/assets.mjs`) reads YAMLs, packs PNGs into `public/packed_assets/`
3. **Runtime:** `BootScene.preload()` calls `this.load.atlas('mana_soul', 'packed_assets/mana_soul.png', 'packed_assets/mana_soul.json')` and similar for fonts
4. **Theme runtime:** `uiTheme` in `src/render/ui_theme.ts` references atlas key `'mana_soul'` and font names `'mana_roots'`/`'mana_trunk'`/`'mana_branches'` — pixui's `UiScene` consumes the theme

### Hospital scene — before vs after

**Before (current state, after Cluster B · 44 fixes):**

```typescript
import * as Phaser from 'phaser';
// ...

const LIST_PANE_CX = 230;
const LIST_PANE_CY = 270;
// ... 30+ lines of layout constants ...

export class HospitalPanelScene extends Phaser.Scene {
  create(): void {
    this.buildOverlayAndPanel();   // hand-rolls overlay + panel + title + gold rectangles
    this.buildCloseButton();       // hand-rolls close button rectangle + text + setInteractive
    this.buildListPaneBackground();
    this.buildDetailPaneBackground();
    // ...
  }
  // ...
}
```

**After:**

```typescript
import { ConstraintMode, UiScene } from 'phaser-pixui';
import { uiTheme } from '@render/ui_theme';
// ...

export class HospitalPanelScene extends UiScene {
  constructor() {
    super({
      key: 'hospital_panel',
      viewportConstraints: { mode: ConstraintMode.Minimum, height: 540 },
      theme: uiTheme,
    });
  }

  create(): void {
    // Header frame
    const header = this.insert.top.frame({ height: 60 });
    header.insert.center.label({ text: `Hospital · ${woundedCount} wounded` });
    header.insert.topRight.button({
      style: 'close',
      onClick: () => this.close(),
    });

    // Left list pane (wounded heroes)
    const listFrame = this.insert.left.frame({ width: 380 });
    for (const hero of woundedHeroes) {
      listFrame.insert.button({ text: hero.name, onClick: () => this.selectHero(hero.id) });
    }

    // Right detail pane (wound details + treat buttons)
    const detailFrame = this.insert.right.frame({ width: 440 });
    // ...
  }
}
```

(Exact `insert` API surface verified during impl by reading pixui example + source.)

### Theme

`src/render/ui_theme.ts` — copied from example, lightly adjusted:

```typescript
import { TextAlign, ThemeConfig } from 'phaser-pixui';

export const uiTheme: ThemeConfig = {
  resources: {
    basePath: 'packed_assets',
    atlas: 'mana_soul',
    fonts: { atlas: 'fonts', names: ['mana_roots', 'mana_trunk', 'mana_branches'] },
  },
  palette: {
    default: 0xfbe4af,
    light: 0xfbe4af,
    dark: 0x111343,
    disabled: 0x7bb6bc,
  },
  fontName: 'mana_roots',
  fontSize: 16,
  fontTint: 'light',
  button: {
    frame: 'button',
    defaultWidth: 128,
    fontTintDisabled: 'disabled',
    styles: {
      close: { frame: 'closeButton', shape: 'square' }, // verified by reading pixui button.ts
    },
  },
  progress: { frame: 'progress_curly', bar: 'bar_green', paddingX: 5, paddingY: 3 },
  frame: { frame: 'frame_light', paddingX: 12, paddingY: 14 },
  dialog: { frame: 'frame_bright', paddingX: 16, paddingY: 16, backdropColor: 0x000000, backdropAlpha: 0.5 },
};
```

We adopt the example's palette as-is for now. Project-color polish (matching `#ffcc66` gold accent etc.) deferred to sub-spec 3 if the visual mismatch is jarring.

### Vite integration

New file `vite/assets.mjs`:

```javascript
export const assetsConfig = {
  source_path: "assets",
  destination_path: "public/packed_assets",
  fonts: [{ source: "fonts.yaml" }],
  atlases: [{ source: "ui.yaml", target: "mana_soul" }],
};
```

`vite.config.ts` (created if absent — currently project may rely on Vite's zero-config) imports `pixel-tools` and registers it as a plugin/dev-server hook with `assetsConfig`. Exact API verified during impl.

### Tests

- No unit tests for the theme (config object).
- No unit tests for hospital (matches existing scene-test pattern).
- No unit tests for pixui (third-party).
- **Manual verification:** open hospital, see wounded heroes list, select a hero, see wound details, click a treatment button, verify hero healing + vault deduction, close button works, escape key works, return to camp updates HUD.
- Test count delta: 0.

## Risks and open questions

- **`UiScene` vs `Phaser.Scene` API differences.** Hospital uses `this.add.X`, `this.input.keyboard?.on('keydown-ESC', ...)`, `this.events.on(Phaser.Scenes.Events.RESUME, ...)`, `this.scene.start('camp')`. UiScene almost certainly extends Phaser.Scene under the hood, so most of these should still work. Confirmed during impl.
- **Viewport constraint compatibility.** Our game is fixed 960×540 with `Phaser.Scale.FIT, autoCenter: CENTER_BOTH`. pixui example uses `ConstraintMode.Minimum` with `height: 320` (responsive). The `insert.center.button(...)` etc. positioning is viewport-relative — for our fixed canvas, we set `height: 540` and probably need to figure out the width constraint mode. Verified during impl.
- **pixel-tools API undocumented.** Implementer reads `pixel-tools` source to understand the Vite integration shape (it's `^0.9.2`, a 0.x release — API may evolve).
- **Hospital functional regression risk.** The migration is a rewrite, not a value-preserving refactor. All hospital functionality must be preserved: wound list, treatment cost calculation, vault deduction, hero healing, save updates. Manual verification covers this; if a regression slips, sub-spec 3 will catch it.
- **Font rendering quality on a 16px-base theme.** pixui example theme uses `fontSize: 16`. Our existing scenes use `fontSize: '12px'`-`'14px'`. The `mana_roots` bitmap font may render larger or different from the system monospace. Visual mismatch acceptable in this sub-spec; sub-spec 3 polishes.
- **Existing camp scene's button to launch hospital.** When the camp scene calls `this.scene.start('hospital_panel')` (or `launch`), the new UiScene-based hospital must be reachable via the same scene key. Verified during impl.

## What sub-spec 3 will need from this sub-spec

- Working `pixel-tools` Vite integration that regenerates `public/packed_assets/` on file change
- Hospital scene as a working pixui reference implementation
- `uiTheme` baseline that other panels can extend (e.g., adding `tabButton` style for blacksmith's Upgrade/Sell tabs)
- Documented patterns for: panel header (title/gold/close), list pane with rows, detail pane, modal confirms (sell-rare-style)
- Honest writeup of pixui's rough edges encountered, surfaced in the HISTORY entry when this sub-spec ships
- A decision point: when we finish migrating the last panel in sub-spec 3, do we remove the now-unused `panel_layout.ts` helpers or leave them as utilities?
