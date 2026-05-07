# pixui Hello-World Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land `phaser-pixui` end-to-end in the codebase. Asset pipeline produces packed atlas + fonts; theme module configured; hospital panel migrated to `UiScene` + `insert` DSL.

**Architecture:** `pixel-tools` (Vite-time) reads YAML manifests from `assets/`, packs PNGs into `public/packed_assets/`. `BootScene` loads the packed assets. `UiScene`-extending scenes use a shared theme to render via the example-provided `mana_soul` art pack. Sub-spec 1's layout helpers stay relevant for unmigrated panels.

**Tech Stack:** TypeScript (strict), Phaser 4, Vite 8, `phaser-pixui` (new), `pixel-tools` (new).

**Spec:** [`docs/superpowers/specs/2026-05-06-pixui-adoption-design.md`](../specs/2026-05-06-pixui-adoption-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `public/assets/sprites/tinyRPG_manaSoulGUI_v_1_0/*.png` (51 files) | Move (`git mv`) → `assets/ui/*.png` | UI sprite sheets — relocated to pixui's expected layout. |
| `public/assets/fonts/tinyRPG_fontKit02_v1_0/20250414rootsFont.png` | Move + rename → `assets/mana_roots.png` | Bitmap font sheet (renamed to match pixui example's font names). |
| `public/assets/fonts/tinyRPG_fontKit02_v1_0/20250414trunkFont.png` | Move + rename → `assets/mana_trunk.png` | Bitmap font sheet. |
| `public/assets/fonts/tinyRPG_fontKit02_v1_0/20250414branchesFont.png` | Move + rename → `assets/mana_branches.png` | Bitmap font sheet. |
| `public/assets/fonts/tinyRPG_fontKit02_v1_0/*.ttf` | Delete | TTF originals — pixui uses the PNG sheets directly via `fonts.yaml`. |
| `public/assets/fonts/tinyRPG_fontKit02_v1_0/README.html` | Move → `assets/tinyRPG_fontKit02_README.html` | Preserve license/attribution. |
| `public/assets/sprites/tinyRPG_manaSoulGUI_v_1_0/README.html` | Move → `assets/tinyRPG_manaSoulGUI_README.html` | Preserve license/attribution. |
| `assets/ui.yaml` | Create | pixui sprite manifest (copied from `phaser-pixui/example/assets/ui.yaml`). |
| `assets/fonts.yaml` | Create | pixui font manifest (copied from `phaser-pixui/example/assets/fonts.yaml`). |
| `assets/ui/bar_green.png` | Create (download from example) | Auxiliary asset referenced by `ui.yaml` (not in our pack). |
| `package.json` | Modify | Add `phaser-pixui` (deps) + `pixel-tools` (devDeps). |
| `vite/assets.mjs` | Create | pixel-tools config consumed by Vite. |
| `vite.config.ts` | Create or modify | Wire `pixel-tools` as a Vite plugin so `npm run dev` regenerates `packed_assets/` on YAML/PNG changes. |
| `.gitignore` | Modify | Add `public/packed_assets/` (generated artifacts). |
| `src/scenes/boot_scene.ts` | Modify | Load `packed_assets/mana_soul.{png,json}` and the bitmap fonts in `preload()`. |
| `src/render/ui_theme.ts` | Create | Export `uiTheme: ThemeConfig` (copied from example, lightly project-flavored). |
| `src/scenes/hospital_panel_scene.ts` | Rewrite | Extend `UiScene`, use `insert` DSL. All hospital functionality preserved (roster integration, healing logic, vault deduction). |

---

## Tasks

### Task 1: Asset reorganization

Pure file moves with `git mv` to preserve history. No code changes. After this task, the project's pre-existing game features still work because nothing in `src/` references the moved paths (verified by grep below).

**Files:** Moves under `public/assets/` and `assets/` only.

- [ ] **Step 1: Verify no source code references the soon-to-be-moved asset paths**

Use the Grep tool with pattern `tinyRPG_manaSoulGUI|tinyRPG_fontKit02|manaSoul9Slices|manaTab|manaSoulButton|manaSoulHeader|rootsFont|trunkFont|branchesFont` over `src/` and `vite*` and `package.json`, output_mode `files_with_matches`.

Expected: zero matches in `src/` (the assets aren't loaded by any scene yet — they were just sitting in `public/assets/` for the pixui adoption work). If matches DO appear, stop and report — those references must be updated as part of this task.

- [ ] **Step 2: Create the new directory structure**

```
mkdir -p assets/ui
```

(No need to mkdir for `public/packed_assets/` — pixel-tools will create it later.)

- [ ] **Step 3: Move the UI sprite PNGs**

```
git mv "public/assets/sprites/tinyRPG_manaSoulGUI_v_1_0"/*.png assets/ui/
git mv "public/assets/sprites/tinyRPG_manaSoulGUI_v_1_0/README.html" assets/tinyRPG_manaSoulGUI_README.html
rmdir "public/assets/sprites/tinyRPG_manaSoulGUI_v_1_0"
```

(If the shell glob doesn't include the README, the second `git mv` handles it explicitly. Final `rmdir` removes the now-empty source folder.)

- [ ] **Step 4: Move and rename the bitmap font PNGs**

```
git mv public/assets/fonts/tinyRPG_fontKit02_v1_0/20250414rootsFont.png assets/mana_roots.png
git mv public/assets/fonts/tinyRPG_fontKit02_v1_0/20250414trunkFont.png assets/mana_trunk.png
git mv public/assets/fonts/tinyRPG_fontKit02_v1_0/20250414branchesFont.png assets/mana_branches.png
git mv public/assets/fonts/tinyRPG_fontKit02_v1_0/README.html assets/tinyRPG_fontKit02_README.html
```

- [ ] **Step 5: Delete the TTF originals (not used by pixui)**

```
rm "public/assets/fonts/tinyRPG_fontKit02_v1_0/Tiny RPG - Mana Branch.ttf"
rm "public/assets/fonts/tinyRPG_fontKit02_v1_0/Tiny RPG - Mana Root.ttf"
rm "public/assets/fonts/tinyRPG_fontKit02_v1_0/Tiny RPG - Mana Trunk.ttf"
rmdir public/assets/fonts/tinyRPG_fontKit02_v1_0
```

- [ ] **Step 6: Run baseline checks**

```
npx tsc --noEmit
npm test
```

Expected: clean typecheck; ~1730 tests passing. The asset moves shouldn't affect anything (no code references them).

- [ ] **Step 7: SKIP — DO NOT COMMIT.** Leave staged moves in working tree.

---

### Task 2: Install dependencies

Add `phaser-pixui` (runtime) and `pixel-tools` (dev). No game-code changes yet.

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install phaser-pixui**

```
npm install phaser-pixui
```

Expected: package.json's `dependencies` now contains `phaser-pixui`. Verify with `cat package.json | grep phaser-pixui`.

- [ ] **Step 2: Install pixel-tools as devDependency**

```
npm install --save-dev pixel-tools
```

Expected: package.json's `devDependencies` now contains `pixel-tools`. Verify with `cat package.json | grep pixel-tools`.

- [ ] **Step 3: Run typecheck and tests**

```
npx tsc --noEmit
npm test
```

Expected: clean. New deps don't affect any existing code yet.

- [ ] **Step 4: SKIP — DO NOT COMMIT.**

---

### Task 3: Pull in YAML manifests + auxiliary asset

Copy the example's `ui.yaml`, `fonts.yaml`, and `bar_green.png` into our `assets/` directory. Verify they reference PNGs that exist in our `assets/ui/`.

**Files:**
- Create: `assets/ui.yaml`
- Create: `assets/fonts.yaml`
- Create: `assets/ui/bar_green.png` (downloaded from pixui example)

- [ ] **Step 1: Create `assets/ui.yaml` with content from the pixui example**

Write `assets/ui.yaml`:

```yaml
- name: frame_light
  image: ui/20250420manaSoul9SlicesA-Sheet.png
  nineslice: { x: 30, y: 20, w: 36, h: 60 }
- name: frame_dark
  image: ui/20250420manaSoul9SlicesB-Sheet.png
  nineslice: { x: 32, y: 32, w: 32, h: 32 }
- name: frame_bright
  image: ui/20250420manaSoul9SlicesC-Sheet.png
  nineslice: { x: 32, y: 32, w: 32, h: 32 }
- name: header_scroll
  image: ui/20250420manaSoulHeaderA-Sheet.png
  nineslice: { x: 30, y: 13, w: 38, h: 9 }
- name: progress_curly
  image: ui/20250421barA-Sheet.png
  nineslice: { x: 22, y: 4, w: 51, h: 3 }
- name: bar_green
  image: ui/bar_green.png
  nineslice: { x: 2, y: 2, w: 4, h: 4 }
- name: button
  image: ui/20250421manaSoulButtonB-Sheet.png
  nineslice: { x: 10, y: 0, w: 70, h: 22 }
  spritesheet:
    sprite_width: 96
    sprite_height: 22
    sprite_names:
      up: 0
      hover: 1
      down: 2
      disabled: 3
- name: button_settings
  image: ui/20250425optionsButton-Sheet.png
  spritesheet:
    sprite_width: 32
    sprite_height: 32
    sprite_names:
      up: 0
      hover: 1
      down: 2
      disabled: 3
```

- [ ] **Step 2: Create `assets/fonts.yaml` with content from the pixui example**

Write `assets/fonts.yaml`:

```yaml
- name: mana_branches
  size: 16
  line_spacing: 1
  letter_spacing: 1
  space_width: 4
  letters:
    - "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    - "abcdefghijklmnopqrstuvwxyz"
    - '0123456789!"#$%&''()*+,-./:'
    - ";<=>?[]\\^_`{}|~@·ÄÁÀÂÅÃäáà"
    - "âåãÏÍÌÎïíìîÜÚÙÛüúùûÖÓÒÔÕöó"
    - "òôõËÉÈÊëéèêŸÝỲÿýỳÇçÑñÆæŒœß"
    - "ðÐþÞ¿¡"
- name: mana_roots
  size: 16
  line_spacing: 1
  letter_spacing: 1
  space_width: 4
  letters:
    - "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    - "abcdefghijklmnopqrstuvwxyz"
    - '0123456789!"#$%&''()*+,-./:'
    - ";<=>?[]\\^_`{}|~@·ÄÁÀÂÅÃäáà"
    - "âåãÏÍÌÎïíìîÜÚÙÛüúùûÖÓÒÔÕöó"
    - "òôõËÉÈÊëéèêŸÝỲÿýỳÇçÑñÆæŒœß"
    - "ðÐþÞ¿¡"
- name: mana_trunk
  size: 16
  line_spacing: 1
  letter_spacing: 1
  space_width: 4
  letters:
    - "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    - "abcdefghijklmnopqrstuvwxyz"
    - '0123456789!"#$%&''()*+,-./:'
    - ";<=>?[]\\^_`{}|~@·ÄÁÀÂÅÃäáà"
    - "âåãÏÍÌÎïíìîÜÚÙÛüúùûÖÓÒÔÕöó"
    - "òôõËÉÈÊëéèêŸÝỲÿýỳÇçÑñÆæŒœß"
    - "ðÐþÞ¿¡"
```

(The example's `fonts.yaml` only declared `mana_branches`. We declare all three since our pack has all three font sheets and the theme references all three. If the example's `fonts.yaml` differs from this when you check, prefer the example's version and add the additional font entries by analogy.)

- [ ] **Step 3: Download `bar_green.png` from the pixui example into `assets/ui/`**

The example's `ui.yaml` references `bar_green.png`, but our sprite pack doesn't include it. Fetch from the pixui example repo:

```
curl -L -o assets/ui/bar_green.png https://raw.githubusercontent.com/skhoroshavin/phaser-pixui/main/example/assets/ui/bar_green.png
```

Verify the file exists and has non-zero size:

```
ls -la assets/ui/bar_green.png
```

- [ ] **Step 4: Verify all PNGs referenced by ui.yaml exist in assets/ui/**

Verify by listing each:

```
ls assets/ui/20250420manaSoul9SlicesA-Sheet.png
ls assets/ui/20250420manaSoul9SlicesB-Sheet.png
ls assets/ui/20250420manaSoul9SlicesC-Sheet.png
ls assets/ui/20250420manaSoulHeaderA-Sheet.png
ls assets/ui/20250421barA-Sheet.png
ls assets/ui/bar_green.png
ls assets/ui/20250421manaSoulButtonB-Sheet.png
ls assets/ui/20250425optionsButton-Sheet.png
```

Expected: all 8 files present. If any are missing, find them under `assets/ui/` (the rename in Task 1 may have used a slightly different filename) or download from the pixui example repo.

- [ ] **Step 5: Verify all font PNGs exist in assets/**

```
ls assets/mana_roots.png
ls assets/mana_trunk.png
ls assets/mana_branches.png
```

Expected: all 3 files present.

- [ ] **Step 6: SKIP — DO NOT COMMIT.**

---

### Task 4: Set up pixel-tools Vite integration

Create `vite/assets.mjs` with the pixel-tools config and wire it into Vite. Verify pixel-tools generates `public/packed_assets/` on dev-server start.

**Files:**
- Create: `vite/assets.mjs`
- Create or modify: `vite.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Create `vite/assets.mjs`**

```javascript
export const assetsConfig = {
  source_path: "assets",
  destination_path: "public/packed_assets",
  fonts: [{ source: "fonts.yaml" }],
  atlases: [{ source: "ui.yaml", target: "mana_soul" }],
};
```

- [ ] **Step 2: Read pixel-tools' README/source to learn the Vite plugin API**

The pixel-tools package was just installed. Find its main entry:

```
cat node_modules/pixel-tools/package.json
```

Look for the `main` / `exports` / `bin` fields. Then inspect the source to understand the Vite integration:

```
ls node_modules/pixel-tools/
cat node_modules/pixel-tools/README.md 2>/dev/null || echo "no README"
```

Also reference the pixui example's `vite/config.dev.mjs` and `vite/config.prod.mjs`:

```
curl -s https://raw.githubusercontent.com/skhoroshavin/phaser-pixui/main/example/vite/config.dev.mjs
curl -s https://raw.githubusercontent.com/skhoroshavin/phaser-pixui/main/example/vite/config.prod.mjs
```

Document the integration shape (a Vite plugin? a build script? a watcher?) before writing the next step. **If pixel-tools has no Vite plugin and only a CLI, the integration may need a custom Vite plugin wrapper that invokes the CLI on dev-server start and on file changes.**

- [ ] **Step 3: Wire pixel-tools into `vite.config.ts`**

If `vite.config.ts` doesn't exist, create it. Otherwise modify the existing one. The integration shape depends on pixel-tools' API (verified in Step 2). Sketch:

```typescript
import { defineConfig } from 'vite';
import { assetsConfig } from './vite/assets.mjs';
// import the pixel-tools Vite plugin or CLI runner

export default defineConfig({
  // existing config (if any)
  plugins: [
    // pixelToolsPlugin(assetsConfig)  ← exact name verified during Step 2
  ],
});
```

If pixel-tools is CLI-only, write a small Vite plugin in `vite.config.ts` that runs pixel-tools at `buildStart` and watches for file changes:

```typescript
import { spawnSync } from 'node:child_process';

function pixelToolsPlugin() {
  return {
    name: 'pixel-tools',
    buildStart() {
      const result = spawnSync('npx', ['pixel-tools', '--config', 'vite/assets.mjs'], { stdio: 'inherit' });
      if (result.status !== 0) throw new Error('pixel-tools failed');
    },
    // configureServer hook for dev-mode file watching, if needed
  };
}
```

(Exact CLI invocation verified during Step 2.)

- [ ] **Step 4: Add `public/packed_assets/` to `.gitignore`**

Append to `.gitignore`:

```
public/packed_assets/
```

If `.gitignore` doesn't exist, create it with this single line.

- [ ] **Step 5: Run dev server briefly to verify pixel-tools generates output**

```
npm run dev
```

Watch the console output. Expected: pixel-tools logs that it processed `ui.yaml` and `fonts.yaml`. Wait until "ready in Xms" or similar from Vite, then Ctrl-C to stop.

Verify the output exists:

```
ls public/packed_assets/
```

Expected files (names depend on pixel-tools' output format — verify during impl):
- `mana_soul.png` (packed UI atlas)
- `mana_soul.json` (atlas manifest)
- One or more font output files (likely `fonts.png` + `fonts.json`, or per-font files like `mana_roots.png` + `mana_roots.json`)

If pixel-tools fails or produces nothing, debug:
- Are PNG paths in the YAMLs correct (relative to `assets/`)?
- Is pixel-tools' Vite integration wired correctly?
- Read pixel-tools' source to understand its expected input/output structure.

**If this step blocks for more than 30 minutes**: stop and escalate. The asset pipeline is the foundation; if it doesn't work, hospital migration can't proceed.

- [ ] **Step 6: Run typecheck and tests**

```
npx tsc --noEmit
npm test
```

Expected: clean. No game-code changes yet.

- [ ] **Step 7: SKIP — DO NOT COMMIT.**

---

### Task 5: BootScene loads packed assets + theme module

Modify `BootScene.preload()` to load the packed atlas + bitmap fonts. Create `src/render/ui_theme.ts`. No scene migrations yet — this task just verifies the assets load without errors.

**Files:**
- Modify: `src/scenes/boot_scene.ts`
- Create: `src/render/ui_theme.ts`

- [ ] **Step 1: Inspect what pixel-tools actually output to determine loader call shape**

```
ls public/packed_assets/
file public/packed_assets/*.png 2>/dev/null
cat public/packed_assets/*.json 2>/dev/null | head -50
```

Goal: identify whether the output is a Phaser-compatible atlas (`.png` + `.json` with `frames` shape) and what the bitmap font format is (likely `.png` + `.json`, or `.png` + `.fnt`). The loader call in Step 2 depends on this.

- [ ] **Step 2: Modify `src/scenes/boot_scene.ts` to load the packed assets**

Find the existing `preload()` method. Add the packed-asset loads after the existing spritesheet/audio loads:

```typescript
preload(): void {
  // existing spritesheet + audio loads (UNCHANGED)
  this.load.spritesheet(SHEET.key, SHEET.url, { /* ... */ });
  // ...
  this.load.audio('theme', 'assets/audio/darkane_times.ogg');

  // pixui packed assets
  this.load.atlas('mana_soul', 'packed_assets/mana_soul.png', 'packed_assets/mana_soul.json');
  // Bitmap fonts — exact loader call verified by Step 1's inspection
  this.load.bitmapFont('mana_roots', 'packed_assets/mana_roots.png', 'packed_assets/mana_roots.json');
  this.load.bitmapFont('mana_trunk', 'packed_assets/mana_trunk.png', 'packed_assets/mana_trunk.json');
  this.load.bitmapFont('mana_branches', 'packed_assets/mana_branches.png', 'packed_assets/mana_branches.json');
}
```

(If pixel-tools output a single combined font atlas instead of three separate files, adjust accordingly. If the file extensions differ — e.g., `.fnt` instead of `.json` — adjust.)

- [ ] **Step 3: Create `src/render/ui_theme.ts`**

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
  },
  progress: { frame: 'progress_curly', bar: 'bar_green', paddingX: 5, paddingY: 3 },
  frame: { frame: 'frame_light', paddingX: 12, paddingY: 14 },
  dialog: {
    frame: 'frame_bright',
    paddingX: 16,
    paddingY: 16,
    backdropColor: 0x000000,
    backdropAlpha: 0.5,
  },
};
```

- [ ] **Step 4: Run typecheck**

```
npx tsc --noEmit
```

Expected: clean. The `ThemeConfig` import resolves to `phaser-pixui`'s exported type.

If typecheck fails on `ThemeConfig` field shape (e.g., `palette` requires different keys), inspect `node_modules/phaser-pixui/dist/theme/theme.d.ts` for the actual type and adjust.

- [ ] **Step 5: Run dev server briefly to verify assets load without console errors**

```
npm run dev
```

Open `http://localhost:5173` in a browser. The existing game should still work (camp scene loads). Open devtools console — expected: no errors about missing `mana_soul`, `mana_roots`, etc.

Stop the dev server.

- [ ] **Step 6: Run tests**

```
npm test
```

Expected: 1730 tests still passing.

- [ ] **Step 7: SKIP — DO NOT COMMIT.**

---

### Task 6: Migrate hospital_panel_scene.ts to UiScene

The big one. Rewrite hospital from `Phaser.Scene` to `UiScene`. Functionality must be preserved end-to-end (roster integration, healing logic, vault deduction, scene transitions).

**Files:**
- Modify: `src/scenes/hospital_panel_scene.ts` (full rewrite of `create()` and supporting methods)

- [ ] **Step 1: Read the current hospital_panel_scene.ts thoroughly**

```
cat src/scenes/hospital_panel_scene.ts
```

Make a list of:
- All external functions hospital calls (roster, vault, hospital-specific logic)
- All internal methods (`buildOverlayAndPanel`, `buildCloseButton`, `buildListPaneBackground`, `buildDetailPaneBackground`, `selectHero`, treatment-button handlers, `close`, etc.)
- All visual elements (header strip, list of wounded heroes, detail pane with wound rows, treatment buttons)
- All event handlers (ESC key, close button click, hero selection click, treat button click)

Goal: identify exactly what needs preserving in the rewrite.

- [ ] **Step 2: Read the pixui example's `ui.ts` for the `insert` DSL pattern**

```
curl -s https://raw.githubusercontent.com/skhoroshavin/phaser-pixui/main/example/src/ui.ts
```

Note the patterns:
- `super({ key, viewportConstraints: {...}, theme })` constructor shape
- `this.insert.bottom.frame({...})` — positioned frame
- `frame.insert.scrollableTextArea({...})` — nested insert
- `this.insert.center.button({ text, onClick })` — button with click handler
- `this.insert.topRight.button({...})` — corner-positioned widget

Also inspect `node_modules/phaser-pixui/dist/scene/UiScene.d.ts` (or similar) to find the exact `insert` API surface (which positioning slots exist, what each accepts).

- [ ] **Step 3: Rewrite `src/scenes/hospital_panel_scene.ts` extending UiScene**

Replace the file's contents. Skeleton structure (fill in the hospital-specific logic by referring to the original file):

```typescript
import { ConstraintMode, UiScene } from 'phaser-pixui';
import { listHeroes, treatHero } from '@camp/roster';   // verify exact import paths from original
import { balance, spend } from '@camp/vault';
import { uiTheme } from '@render/ui_theme';
import type { Hero } from '@heroes/hero';
import { appState } from './app_state';

export class HospitalPanelScene extends UiScene {
  private selectedHeroId: string | null = null;

  constructor() {
    super({
      key: 'hospital_panel',
      viewportConstraints: { mode: ConstraintMode.Minimum, height: 540 },
      theme: uiTheme,
    });
  }

  create(): void {
    this.selectedHeroId = null;

    // Header strip with title + gold + close button
    const header = this.insert.top.frame({ height: 60 });
    const woundedCount = listHeroes(appState.get().roster).filter((h) => h.wounds.length > 0).length;
    header.insert.center.label({ text: `Hospital · ${woundedCount} wounded` });
    header.insert.topRight.button({
      text: 'X',
      onClick: () => this.close(),
    });

    // Left pane — wounded hero list
    const listPane = this.insert.left.frame({ width: 380 });
    const woundedHeroes = listHeroes(appState.get().roster).filter((h) => h.wounds.length > 0);
    for (const hero of woundedHeroes) {
      listPane.insert.button({
        text: `${hero.name}  (${hero.wounds.length} wounds)`,
        onClick: () => this.selectHero(hero.id),
      });
    }

    // Right pane — detail
    this.rebuildDetailPane();

    // Keyboard shortcut
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private rebuildDetailPane(): void {
    // Render wound details + treatment buttons for this.selectedHeroId
    // (implementation mirrors the original detail-pane logic; see original file)
  }

  private selectHero(heroId: string): void {
    this.selectedHeroId = heroId;
    this.rebuildDetailPane();
  }

  private close(): void {
    this.scene.stop();
    this.scene.start('camp');
  }
}
```

**Critical:** preserve every piece of hospital functionality:
- Wound display per hero
- Treatment cost calculation
- Vault deduction on treat
- Roster update on treat
- Save persistence (`appState.update(...)` in the existing code)
- Camp scene refresh on close

If any pixui pattern doesn't fit (e.g., `insert.left.frame` doesn't expose nested `insert.button`), read the pixui source for the right pattern.

- [ ] **Step 4: Run typecheck**

```
npx tsc --noEmit
```

Expected: clean. If errors, the most likely causes are:
- `insert.X.Y(...)` API mismatch — verify the actual API by reading pixui source
- Theme field mismatches — adjust `uiTheme`
- Import path issues — verify `@render/ui_theme` resolves

- [ ] **Step 5: Run tests**

```
npm test
```

Expected: 1730 tests still pass. Hospital isn't unit-tested (Phaser scenes aren't tested in this codebase), but no other test should break.

- [ ] **Step 6: SKIP — DO NOT COMMIT.**

---

### Task 7: Manual browser verification

**Files:** None modified.

- [ ] **Step 1: Start the dev server**

```
npm run dev
```

Wait for "ready in Xms". Open http://localhost:5173.

- [ ] **Step 2: Verify camp scene + non-hospital panels still work**

- [ ] Camp scene loads (no console errors about missing assets)
- [ ] Open Tavern — works as before
- [ ] Open Barracks — works as before
- [ ] Open Blacksmith — works as before (sub-spec 1's layout helpers still in effect)
- [ ] Open Expeditions — works as before

- [ ] **Step 3: Verify hospital panel works under pixui**

From a save with at least one wounded hero (or set up one via dev console):

- [ ] Open Hospital from camp
- [ ] Header shows "Hospital · N wounded" with title + close button rendered via pixui
- [ ] Left pane shows the wounded hero list, rendered as pixui buttons
- [ ] Click a hero → right pane shows wound details + treat buttons
- [ ] Click a treat button → gold deducts from vault, hero's wound is removed from the list, hospital re-renders with updated state
- [ ] Click X (close button) → returns to camp; camp scene's gold counter updates
- [ ] Press ESC → also returns to camp
- [ ] No console errors throughout

- [ ] **Step 4: Verify visual rendering**

- [ ] UI sprite art (frames, buttons) renders correctly — not magenta/missing-texture squares
- [ ] Bitmap fonts render — not blank or fallback
- [ ] Visuals may look noticeably different from the prior hospital appearance (pixui's `mana_soul` art vs our previous gray rectangles). Acceptable as long as functionality works; sub-spec 3 polishes.

- [ ] **Step 5: Verify dev hot-reload of assets**

With dev server running, edit `assets/ui.yaml` (e.g., change a `paddingX` value), save. Expected: pixel-tools regenerates packed_assets, Vite reloads, hospital re-renders. (If hot-reload doesn't work, this is a quality-of-life issue not a blocker — flag for later.)

- [ ] **Step 6: Stop the dev server**

Ctrl-C in the dev-server terminal.

- [ ] **Step 7: Final test + typecheck**

```
npx tsc --noEmit
npm test
```

Expected: clean; 1730 tests pass.

- [ ] **Step 8: SKIP — DO NOT COMMIT.** Hand off the dirty working tree to the user for review and manual commit.

---

## Done

- Asset pipeline: `pixel-tools` reads YAML manifests at build time, generates `public/packed_assets/`. Dev server regenerates on file change.
- New deps in `package.json`: `phaser-pixui`, `pixel-tools`.
- New theme module: `src/render/ui_theme.ts`.
- Boot scene loads `mana_soul` atlas + 3 bitmap fonts.
- Hospital scene migrated to `UiScene` + `insert` DSL. All hospital functionality preserved.
- Other panels (barracks, blacksmith, tavern, equip, expeditions) unchanged — still use sub-spec 1's layout helpers.
- Test count unchanged (1730).
- Sub-spec 3 ready: pattern established for the remaining-panel migrations.
