# pixui Foundation + Tavern PoC (sub-spec 3a of 3) — Design Spec

**Date:** 2026-05-06
**Status:** Locked design, ready for implementation plan
**Related TODO:** Cluster B · 45 (Migrate UI to phaser-pixui library) — sub-spec 3a of 3
**Sub-specs in this initiative:**
1. Layout helpers + blacksmith migration ([completed](./2026-05-06-panel-layout-helpers-design.md))
2. pixui Hello-World on hospital ([completed](./2026-05-06-pixui-adoption-design.md))
3. **Path D — Re-implement Paperdoll/HeroCard as pixui composites; migrate everything**
   - 3a — **Foundation + Tavern PoC** (this spec)
   - 3b — Easy panels: CampNodeOverlay, TreasureRoomOverlay, Blacksmith, ShopOverlay (future)
   - 3c — HeroCard panels: Barracks, Equip, Expeditions, EventOverlay, PerkOverlay + cleanup (future)

## Why

Sub-spec 2's whole-implementation review identified a critical strategic concern: most remaining panels embed Phaser GameObjects (HeroCard, Paperdoll), which pixui can't host directly. Three paths surfaced (pixui-only-for-compatible / escape-hatch-infra / halt pixui). A **fourth path emerged from clarifying questions: re-implement Paperdoll/HeroCard as pixui Container compositions** of pixui.Image + TextArea + Progress + Image. This unblocks pixui adoption everywhere without escape-hatch infrastructure.

Sub-spec 3a lands the foundation:
- The `fixPixuiCanvasViewport()` helper, extracted from hospital
- `PixuiPaperdoll` (~80 LOC, 8-layer composition)
- `PixuiHeroCard` (~150 LOC, composes PixuiPaperdoll + name + HP + trait + tooltip + click)
- Tavern migrated to UiScene as the proof of concept (smallest HeroCard-using panel; validates PixuiHeroCard end-to-end)

If sub-spec 3a goes well, sub-specs 3b and 3c become mechanical apply-the-pattern work. If PixuiPaperdoll/PixuiHeroCard turn out to have rough edges, we discover them on one panel before committing 9 more migrations.

## Scope summary

**In scope:**

- Create: `src/render/pixui_canvas_fix.ts` — single function `fixPixuiCanvasViewport(scene)`
- Create: `src/render/pixui_paperdoll.ts` — `PixuiPaperdoll extends pixui.Container`, matching existing Paperdoll API (`equip`, `unequip`, `currentLoadout`)
- Create: `src/ui/pixui_hero_card.ts` — `PixuiHeroCard extends pixui.Container`, matching existing HeroCard API (`size`, `isDead`, `onClick`); reuses existing `createTooltip()` for hover tooltips
- Modify: `src/scenes/hospital_panel_scene.ts` — replace inline viewport patch with `fixPixuiCanvasViewport(this)` call (pixel-identical refactor; validates the extracted helper)
- Rewrite: `src/scenes/tavern_panel_scene.ts` — `Phaser.Scene` → `UiScene`; uses `PixuiHeroCard` for each candidate; preserves all functionality

**Out of scope (deferred):**

- **Sub-spec 3b** — CampNodeOverlay, TreasureRoomOverlay, Blacksmith, ShopOverlay migrations
- **Sub-spec 3c** — Barracks, Equip, Expeditions, EventOverlay, PerkOverlay migrations + cleanup of `panel_layout.ts` retirement
- **Retiring existing `src/render/paperdoll.ts` and `src/ui/hero_card.ts`** — they stay alive for non-pixui consumers (Combat, Corridor) and for the 9 not-yet-migrated panels
- **The 7 Cluster B follow-ups (#46–52)** — addressed inline during 3b/3c if they bite, OR shipped separately
- **Theme palette polish** (#47) — visual consistency between hospital/tavern (pixui) and other panels (gray) is acceptable in this transitional state
- **Combat / Dungeon / Corridor scene migrations** — never targeted by pixui; out of the whole Cluster B · 45 initiative

## Locked decisions (brainstorm log)

| # | Question | Decision |
|---|---|---|
| Q1 | PixuiPaperdoll API shape | **A — Match existing Paperdoll API.** `equip(changes: Partial<Loadout>)`, `unequip(slot)`, `currentLoadout()`. Drop-in for callers; existing API is well-shaped (paperdoll mutations live at the WIDGET level, expressible without scene rebuild). Internal `equip()` rebuilds via `pixui.Container.attach()`. Need to verify `attach()` cleanly handles repeat calls during impl. |
| Q2 | PixuiHeroCard API shape | **Match existing HeroCard API** (`size: 'small'\|'large'`, `isDead?`, `onClick?`). Drop-in for callers. Composes PixuiPaperdoll + name (TextArea) + HP (Progress) + trait (Image) + Clickable overlay. |
| sub | Tooltips on PixuiHeroCard | **B — Reuse existing `createTooltip()` directly.** Tooltip is a top-level overlay (not embedded in a frame), so it can render at scene root unchanged. PixuiHeroCard's hover-in calls `createTooltip(scene, hero)`; hover-out destroys the handle. Slight architectural impurity (Phaser GameObject created from pixui-native widget), acceptable since it's at scene root. |
| Q3 | Tavern migration scope | **Full feature parity.** Hire candidates (3-5), re-roll, hire (with gold-check + roster-cap-check), close (X + ESC), upgrade-tavern button. If anything turns out painful in pixui, file as follow-up TODO. |
| sub | File locations | **Mirror existing layout.** `PixuiPaperdoll` at `src/render/pixui_paperdoll.ts` (sibling to `paperdoll.ts`); `PixuiHeroCard` at `src/ui/pixui_hero_card.ts` (sibling to `hero_card.ts`). Existing widgets stay alive for non-pixui consumers. |

## Architecture

### `src/render/pixui_canvas_fix.ts` (new file)

Single export. Patches pixui's private viewport-calc methods on a UiScene instance + re-runs `_updateViewport()` so the viewport matches our Phaser game canvas (960×540) instead of `window.innerWidth/Height`.

```typescript
import type { UiScene } from 'phaser-pixui';

/**
 * pixui's ResponsiveScene reads window.innerWidth/innerHeight to compute its
 * viewport — wrong for our embedded fixed-resolution game (canvas is always
 * 960×540; Phaser.Scale.FIT handles browser fitting).
 *
 * This helper monkey-patches the private accessors on the scene instance to
 * read Phaser's logical canvas dims, then re-runs _updateViewport() so the
 * cached _viewport reflects the corrected values.
 *
 * Constructor-time _updateViewport ran with bad numbers but never reached a
 * render — re-running here, before super.create() builds the UI tree,
 * corrects it.
 *
 * Call from a UiScene's create() BEFORE super.create().
 */
export function fixPixuiCanvasViewport(scene: UiScene): void {
  const internal = scene as unknown as {
    _getCanvasWidth: () => number;
    _getCanvasHeight: () => number;
    _getDevicePixelRatio: () => number;
    _updateViewport: () => void;
  };
  internal._getCanvasWidth = () => scene.game.scale.width;
  internal._getCanvasHeight = () => scene.game.scale.height;
  internal._getDevicePixelRatio = () => 1;
  internal._updateViewport();
}
```

### `src/render/pixui_paperdoll.ts` (new file)

`PixuiPaperdoll extends pixui.Container`. Same external API as `Paperdoll` from `src/render/paperdoll.ts`. Internally holds an array of `pixui.Image` children (one per `LAYER_ORDER` slot) and rebuilds the stack on `equip`/`unequip` via `pixui.Container.attach()`.

```typescript
import { Container, Image, type Component } from 'phaser-pixui';
import type { Scene } from 'phaser';
import {
  layerFramesFor,
  type Loadout,
  type OptionalSlot,
} from '@render/paperdoll_layers';
import { SHEET } from '@render/frames';

export interface PixuiPaperdollOptions {
  scale?: number;
}

export class PixuiPaperdoll extends Container {
  private loadout: Loadout;
  private layerImages: Image[] = [];

  constructor(scene: Scene, loadout: Loadout, opts: PixuiPaperdollOptions = {}) {
    super(scene);
    this.loadout = { ...loadout };
    this.rebuild(opts.scale ?? 1);
  }

  equip(changes: Partial<Loadout>): void {
    this.loadout = { ...this.loadout, ...changes };
    this.rebuild();
  }

  unequip(slot: OptionalSlot): void {
    const next: Loadout = { ...this.loadout };
    delete next[slot];
    this.loadout = next;
    this.rebuild();
  }

  currentLoadout(): Readonly<Loadout> {
    return this.loadout;
  }

  private rebuild(scale: number = 1): void {
    // Clear prior layers (verify pixui.Container.attach([]) semantics during impl
    // — may need explicit detach calls if attach doesn't replace).
    for (const img of this.layerImages) {
      // detach via container API; exact call verified during impl
    }
    this.layerImages = [];

    const frames = layerFramesFor(this.loadout);
    for (const frame of frames) {
      const img = new Image(this.scene, {
        texture: SHEET.key,
        frame: String(frame),
      });
      // Apply scale if needed (verify Image scale API during impl)
      this.layerImages.push(img);
    }
    this.attach(this.layerImages as Component[]);
  }
}
```

(Exact `pixui.Container.attach()` semantics for replace-vs-append verified during implementation. If `attach()` only appends, an explicit `detach()` or `clear()` call needed first. If pixui has no `clear()` primitive, the rebuild may need to dispose Image instances and recreate the Container — flag during impl.)

### `src/ui/pixui_hero_card.ts` (new file)

`PixuiHeroCard extends pixui.Container`. Same external API as `HeroCard` from `src/ui/hero_card.ts`. Composes a `PixuiPaperdoll` + name TextArea + HP Progress + trait Image + Clickable overlay. Tooltips reuse the existing `createTooltip()` from `src/ui/tooltip.ts`.

```typescript
import { Container, TextArea, Progress, Image, Clickable } from 'phaser-pixui';
import type { Scene } from 'phaser';
import type { Hero } from '@heroes/hero';
import { CLASSES } from '@data/classes';
import { TRAITS } from '@data/traits';
import { applyEquipmentStats } from '@items/stats';
import { heroToLoadout } from '@render/hero_loadout';
import { PixuiPaperdoll } from '@render/pixui_paperdoll';
import { createTooltip } from './tooltip';

export type PixuiHeroCardSize = 'small' | 'large';

export interface PixuiHeroCardOptions {
  size: PixuiHeroCardSize;
  isDead?: boolean;
  onClick?: () => void;
}

const PAPERDOLL_SCALE_SMALL = 2;
const PAPERDOLL_SCALE_LARGE = 4;

const SMALL_WIDTH = 180;
const SMALL_HEIGHT = 60;
const LARGE_WIDTH = 280;
const LARGE_HEIGHT = 120;

export class PixuiHeroCard extends Container {
  private hero: Hero;
  private opts: PixuiHeroCardOptions;
  private tooltip?: Phaser.GameObjects.Container;

  constructor(scene: Scene, hero: Hero, opts: PixuiHeroCardOptions) {
    super(scene);
    this.hero = hero;
    this.opts = opts;
    this.build();
  }

  private build(): void {
    const isLarge = this.opts.size === 'large';
    const w = isLarge ? LARGE_WIDTH : SMALL_WIDTH;
    const h = isLarge ? LARGE_HEIGHT : SMALL_HEIGHT;
    const paperdollScale = isLarge ? PAPERDOLL_SCALE_LARGE : PAPERDOLL_SCALE_SMALL;

    // Paperdoll on the left
    const paperdoll = new PixuiPaperdoll(this.scene, heroToLoadout(this.hero), { scale: paperdollScale });
    if (this.opts.isDead) {
      // Apply red tint to each layer (pixui.Container itself isn't a Renderable,
      // so tint is per-child Image — verify during impl)
    }

    // Name / class / HP / trait on the right
    const nameText = new TextArea(this.scene, {
      text: `${this.hero.name}\n${CLASSES[this.hero.classId].name}`,
    });

    const stats = applyEquipmentStats(this.hero);
    const hpProgress = new Progress(this.scene, {
      value: this.hero.currentHp / stats.maxHp,
    });

    const traitDef = TRAITS[this.hero.traitId];
    const traitIcon = new Image(this.scene, {
      texture: 'sprites',
      frame: String(traitDef.iconFrame),  // verify trait icon frame source
    });

    // Click handler + hover tooltip via Clickable overlay
    const clickable = new Clickable(this.scene, {
      width: w,
      height: h,
      onClick: this.opts.onClick,
      onPointerOver: () => this.showTooltip(),
      onPointerOut: () => this.hideTooltip(),
    });

    // Attach all components in z-order: paperdoll → text → hp → trait → click overlay
    this.attach([paperdoll, nameText, hpProgress, traitIcon, clickable]);
  }

  private showTooltip(): void {
    if (this.tooltip) return;
    this.tooltip = createTooltip(this.scene, this.hero);
  }

  private hideTooltip(): void {
    this.tooltip?.destroy();
    this.tooltip = undefined;
  }
}
```

(Exact `pixui.Clickable` config verified during impl — the `onPointerOver`/`onPointerOut` field names are illustrative; pixui may use different conventions. The dead-state tint application is also TBD during impl since pixui.Container isn't a Renderable; we may need to wrap PixuiPaperdoll in a Renderable or apply tint per-child Image.)

### `src/scenes/hospital_panel_scene.ts` (modified)

Pixel-identical refactor: replace inline viewport patch with helper call.

```typescript
// Before (current state, sub-spec 2):
create(): void {
  const self = this as unknown as { /* ... 7 lines of inline patch ... */ };
  self._getCanvasWidth = () => this.game.scale.width;
  self._getCanvasHeight = () => this.game.scale.height;
  self._getDevicePixelRatio = () => 1;
  self._updateViewport();
  super.create();
  // ... rest unchanged ...
}

// After:
import { fixPixuiCanvasViewport } from '@render/pixui_canvas_fix';

create(): void {
  fixPixuiCanvasViewport(this);
  super.create();
  // ... rest unchanged ...
}
```

This is a pure-refactor change; hospital should render identically.

### `src/scenes/tavern_panel_scene.ts` (rewritten)

Full migration from `Phaser.Scene` to `UiScene` + `insert` DSL. Preserves all functionality. Uses `PixuiHeroCard` for each candidate. Adopts hospital's patterns:
- `fixPixuiCanvasViewport(this)` at top of `create()`
- `scene.restart()` for state changes (hire success, re-roll, upgrade)
- Module-level state survival NOT needed (Tavern doesn't have a "selected candidate" persistent state — re-roll always rebuilds the candidate set, hire removes one)
- `this.scene.stop(); this.scene.resume('camp')` for close

Key external functions preserved (no changes to these):
- `generateCandidates(rng, unlockedClasses, count)` from `@camp/buildings/tavern`
- `addHero(roster, hero)` from `@camp/roster`
- `spend(vault, cost)` from `@camp/vault`
- `applyBuildingUpgrade(state, 'tavern')` for tavern upgrade
- Persistent-candidate caching (panel reopen with same candidates) via `appState`

Per-candidate sub-frame pattern: `slot = this.insert.center.frame(...)` to anchor a `PixuiHeroCard` + its Hire button as a unit. `SLOT_X_BY_COUNT` lookup table preserved for x positioning per candidate count.

## Tests

- **No new unit tests** — matches existing pattern. Paperdoll, HeroCard, scene classes are not unit-tested in this codebase.
- **Manual verification:** hospital still works after refactor (regression check); Tavern works end-to-end with the new widgets (hire, re-roll, candidate display, tooltips on hover, close button + ESC).
- **Test count delta:** 0.

## Risks and open questions

1. **`pixui.Container.attach()` semantics under repeat calls.** Need to verify `attach([])` cleanly removes prior children, or whether explicit `detach()` calls are needed. PixuiPaperdoll's `equip()` depends on this. **Investigated during impl by reading `node_modules/phaser-pixui/dist/index.js` Container source.**

2. **Hover events on `pixui.Clickable`.** Need to verify the exact event-handler field names (`onPointerOver`/`onPointerOut` is illustrative). pixui's `ClickableState` enum was visible in the .d.ts; the event API needs source-reading.

3. **`pixui.TextArea` for one-line labels.** May render with extra padding for multi-line text; consider `pixui.BitmapText` for tight name/class labels if TextArea looks bloated.

4. **`pixui.Progress` value-setting.** Verified `Progress` class exists; need to confirm `progress.value = N` (or `setValue(N)`) works programmatically for HP-bar updates.

5. **Dead-state tint on PixuiPaperdoll.** pixui.Container isn't a Renderable — tint is per-Image. PixuiPaperdoll may need to expose a `setTint(color)` method that applies to each child Image, or wrap in a Renderable. Investigated during impl.

6. **PixuiHeroCard performance.** Each card creates ~12 pixui Components (8 paperdoll layers + 4 card elements). Tavern shows 3-5 cards; that's 36-60 components per panel open. Should be fine; flag if frame rate drops on panel open.

7. **`createTooltip()` signature compatibility.** Existing `createTooltip(scene, hero)` returns a Phaser Container. PixuiHeroCard calling it from inside a pixui-native widget is slightly unusual but mechanically clean (tooltip is at scene root, not embedded in a Frame). Verify the existing helper's signature accepts `pixui.Scene` (which IS a `Phaser.Scene` subclass).

8. **Tavern's per-candidate sub-frame layout.** pixui's `insert.center.frame()` anchors children relative to the center; positioning N candidates side-by-side may need x-offsets in the SLOT_X_BY_COUNT lookup table to be relative-to-center, not absolute pixels. Verify during impl.

If any risk turns out to be a deal-breaker, the implementer escalates and we revisit before continuing.

## What sub-specs 3b and 3c will need from this sub-spec

- Working `PixuiPaperdoll` and `PixuiHeroCard` with documented APIs
- The `fixPixuiCanvasViewport()` helper as the canonical setup for any new UiScene
- Hospital + Tavern as reference implementations (smoke-tested working)
- Honest writeup of any pixui rough edges encountered (in HISTORY entry when this sub-spec ships)
- Decision points for sub-spec 3c: whether to retire existing `paperdoll.ts` / `hero_card.ts` after all panels migrate, or leave them for non-pixui consumers (Combat, Corridor)
