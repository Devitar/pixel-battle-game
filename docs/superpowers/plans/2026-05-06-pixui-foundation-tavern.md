# pixui Foundation + Tavern PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the foundation for Path D pixui adoption — extract `fixPixuiCanvasViewport()` helper, build `PixuiPaperdoll` and `PixuiHeroCard` as pixui Container compositions, refactor hospital to use the helper, migrate Tavern as proof of concept.

**Architecture:** Three new files in `src/render/` and `src/ui/` follow the existing Paperdoll/HeroCard API surface so callers can drop-in-replace. Hospital refactor is value-preserving (helper extraction). Tavern migration is the first PoC of the new widgets in a real panel; full feature parity preserved.

**Tech Stack:** TypeScript (strict), Phaser 4, `phaser-pixui ^0.2.1` (already installed in sub-spec 2).

**Spec:** [`docs/superpowers/specs/2026-05-06-pixui-foundation-tavern-design.md`](../specs/2026-05-06-pixui-foundation-tavern-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/render/pixui_canvas_fix.ts` | Create | Single function `fixPixuiCanvasViewport(scene)`. ~25 LOC including comment. |
| `src/render/pixui_paperdoll.ts` | Create | `PixuiPaperdoll extends pixui.Container`. Same external API as `Paperdoll`. ~80 LOC. |
| `src/ui/pixui_hero_card.ts` | Create | `PixuiHeroCard extends pixui.Container`. Same external API as `HeroCard`. Reuses `createTooltip()`. ~150 LOC. |
| `src/scenes/hospital_panel_scene.ts` | Modify | Replace inline viewport patch with `fixPixuiCanvasViewport(this)` call. Pixel-identical refactor. |
| `src/scenes/tavern_panel_scene.ts` | Rewrite | `Phaser.Scene` → `UiScene`. Uses `PixuiHeroCard`. Full feature parity. ~250 LOC (was ~330). |

**Existing widgets unchanged:** `src/render/paperdoll.ts` and `src/ui/hero_card.ts` stay alive for non-pixui consumers (Combat, Corridor, not-yet-migrated panels). Retirement decision deferred to sub-spec 3c.

---

## Tasks

### Task 1: Extract fixPixuiCanvasViewport helper + refactor hospital

Trivial extract. Pixel-identical refactor (hospital should render the same after).

**Files:**
- Create: `src/render/pixui_canvas_fix.ts`
- Modify: `src/scenes/hospital_panel_scene.ts`

- [ ] **Step 1: Run baseline checks**

```
npx tsc --noEmit
npm test
```

Expected: clean typecheck; ~1730 tests passing.

- [ ] **Step 2: Create `src/render/pixui_canvas_fix.ts`**

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

- [ ] **Step 3: Refactor `src/scenes/hospital_panel_scene.ts` to use the helper**

Find the `create()` method. The current state has the inline patch (~7 LOC) at the top of `create()`. Replace it with a single call to the helper.

Before:
```typescript
create(): void {
  // pixui's ResponsiveScene reads window.innerWidth/innerHeight to size its
  // viewport — wrong for our embedded fixed-resolution game (canvas is always
  // 960×540; Phaser.Scale.FIT handles browser fitting). Patch the private
  // canvas-dim methods on this instance to use Phaser's logical canvas size,
  // then recompute the viewport before super.create() builds the UI tree.
  // Constructor-time _updateViewport ran with bad numbers but never reached
  // a render — re-running here corrects it.
  const self = this as unknown as {
    _getCanvasWidth: () => number;
    _getCanvasHeight: () => number;
    _getDevicePixelRatio: () => number;
    _updateViewport: () => void;
  };
  self._getCanvasWidth = () => this.game.scale.width;
  self._getCanvasHeight = () => this.game.scale.height;
  self._getDevicePixelRatio = () => 1;
  self._updateViewport();

  super.create();
  // ... rest of create() unchanged
}
```

After:
```typescript
create(): void {
  fixPixuiCanvasViewport(this);
  super.create();
  // ... rest of create() unchanged
}
```

Also add the import at the top of the file:

```typescript
import { fixPixuiCanvasViewport } from '@render/pixui_canvas_fix';
```

- [ ] **Step 4: Run typecheck + tests**

```
npx tsc --noEmit
npm test
```

Expected: clean typecheck; 1730 tests passing.

- [ ] **Step 5: Manual verification — hospital still renders identically**

```
npm run dev
```

Open http://localhost:5173. From a save with at least one wounded hero, open the Hospital panel.

- [ ] Hospital renders pixel-identical to before the refactor (frames at correct size, no overflow, X close button visible at top-right, list/detail panes split correctly)
- [ ] Click a wounded hero → details show
- [ ] Click X → returns to camp
- [ ] No console errors

Stop the dev server.

- [ ] **Step 6: SKIP — DO NOT COMMIT.** Per repo policy, leave changes in working tree.

---

### Task 2: Build PixuiPaperdoll

Pixui Container composition of 8 layered Image children. Matches existing `Paperdoll` API. Uses `layerFramesFor()` from `paperdoll_layers.ts` (pure function, reusable).

**Files:**
- Create: `src/render/pixui_paperdoll.ts`

- [ ] **Step 1: Read pixui's Container + Image source to verify API**

```
sed -n '186,220p' node_modules/phaser-pixui/dist/index.d.ts
```

Look for:
- `Container.attach(components)` — does it append, or replace? If append, find a `clear()` / `detach()` method.
- `Container.forEach(f)` — useful for iterating children for cleanup.
- `Image` constructor — `new Image(scene, { texture: 'sprites', frame: '...' })`.

```
grep -n "class Container\|attach\|detach\|forEach" node_modules/phaser-pixui/dist/index.js | head -30
```

Find the Container class implementation; verify whether `attach()` clears prior children or appends.

**Expected finding (verify):** pixui's Container.attach() appends. To rebuild, we need to dispose existing children first. Pixui exposes `Container._children` (private) and `forEach(f)` to iterate.

If pixui has no built-in clear primitive, the rebuild approach is: iterate existing layer Images and call `.destroy()` on the underlying Phaser GameObject (each pixui Image wraps a GameObject we can access).

If reading reveals a cleaner API, prefer it. Document the chosen approach inline as a comment.

- [ ] **Step 2: Read existing `src/render/paperdoll.ts` and `src/render/paperdoll_layers.ts`**

```
cat src/render/paperdoll.ts
cat src/render/paperdoll_layers.ts
```

Note:
- `LAYER_ORDER` is the z-order array (body, legs, feet, outfit, hair, hat, shield, weapon)
- `layerFramesFor(loadout: Loadout): readonly number[]` returns the sprite frame indices for each layer in z-order
- `Loadout` interface and `OptionalSlot` type
- `Paperdoll`'s `equip()` does `this.removeAll(true)` then `this.rebuild()`

We mirror this structure with pixui primitives.

- [ ] **Step 3: Create `src/render/pixui_paperdoll.ts`**

```typescript
import { Container, Image } from 'phaser-pixui';
import type { Scene } from 'phaser';
import {
  layerFramesFor,
  type Loadout,
  type OptionalSlot,
} from '@render/paperdoll_layers';
import { SHEET } from '@render/frames';

export interface PixuiPaperdollOptions {
  /** Scale factor applied to each layer Image. Default 1 (16×16 native). */
  scale?: number;
}

/**
 * pixui-native paperdoll — Container of layered Image children, one per
 * LAYER_ORDER slot. Same external API as src/render/paperdoll.ts (equip /
 * unequip / currentLoadout) so callers can drop-in-replace.
 */
export class PixuiPaperdoll extends Container {
  private loadout: Loadout;
  private layerImages: Image[] = [];
  private scale: number;
  private internalScene: Scene;

  constructor(scene: Scene, loadout: Loadout, opts: PixuiPaperdollOptions = {}) {
    super(scene);
    this.internalScene = scene;
    this.loadout = { ...loadout };
    this.scale = opts.scale ?? 1;
    this.rebuild();
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

  private rebuild(): void {
    // Tear down prior layer Images. Pixui's Container.attach() appends rather
    // than replaces, so we destroy existing children explicitly.
    // (Verify exact Container cleanup API during impl — adjust if pixui exposes
    // a clear()/detach() primitive that's cleaner.)
    for (const img of this.layerImages) {
      // Each pixui Image wraps a Phaser GameObject; destroy the underlying object.
      // The exact accessor (`.gameObject`, `.sprite`, etc.) is verified during impl.
      const internal = img as unknown as { gameObject?: Phaser.GameObjects.GameObject };
      internal.gameObject?.destroy();
    }
    this.layerImages = [];

    const frames = layerFramesFor(this.loadout);
    for (const frame of frames) {
      const img = new Image(this.internalScene, {
        texture: SHEET.key,
        frame: String(frame),
      });
      this.layerImages.push(img);
    }
    this.attach(this.layerImages);

    // Apply scale to each layer (verify Image scale API during impl — may be a
    // setter on the underlying GameObject, or a constructor option).
    if (this.scale !== 1) {
      for (const img of this.layerImages) {
        const internal = img as unknown as { gameObject?: { setScale?: (s: number) => void } };
        internal.gameObject?.setScale?.(this.scale);
      }
    }
  }
}
```

(The escape-hatch casts `as unknown as { gameObject?: ... }` are scoped to specific lines because pixui's exact Image-to-GameObject accessor isn't declared in the public types we've read. Verify and replace with the actual API during implementation.)

- [ ] **Step 4: Run typecheck**

```
npx tsc --noEmit
```

Expected: clean. The escape-hatch casts satisfy TypeScript even without exact pixui internals.

- [ ] **Step 5: Run tests**

```
npm test
```

Expected: 1730 tests pass. PixuiPaperdoll has no unit tests (matches existing Paperdoll pattern); existing tests unaffected.

- [ ] **Step 6: SKIP — DO NOT COMMIT.**

---

### Task 3: Build PixuiHeroCard

Pixui composition of PixuiPaperdoll + name TextArea + HP Progress + trait Image + Clickable. Matches existing `HeroCard` API. Tooltips reuse `createTooltip()` from `src/ui/tooltip.ts`.

**Files:**
- Create: `src/ui/pixui_hero_card.ts`

- [ ] **Step 1: Read pixui's Clickable + TextArea + Progress source to verify APIs**

```
grep -n "class Clickable\|class TextArea\|class Progress\|ClickableState" node_modules/phaser-pixui/dist/index.d.ts
sed -n '171,260p' node_modules/phaser-pixui/dist/index.d.ts
```

Look for:
- `Clickable` constructor — does it take `{ width, height, onClick, onPointerOver, onPointerOut }` or different field names?
- `TextArea` config — `{ text: string }` plus what styling?
- `Progress` config — does it take a `value` field? How is it set programmatically?

If the .d.ts is incomplete, read the .js source for actual implementation:

```
grep -n "Clickable\|TextArea\|Progress" node_modules/phaser-pixui/dist/index.js | head -30
```

Document the actual field names you find. The Task 3 Step 3 code below uses placeholder field names that need verification.

- [ ] **Step 2: Read existing `src/ui/hero_card.ts` and `src/ui/tooltip.ts`**

```
cat src/ui/hero_card.ts
cat src/ui/tooltip.ts
```

Note:
- HeroCard's constructor signature: `(scene, x, y, hero, opts)` where opts has `size, isDead?, onClick?`
- HeroCard internals: paperdoll on left, text column on right (name, class, HP bar, trait icon)
- HeroCard creates tooltip on `pointerover`, destroys on `pointerout`
- `createTooltip(scene, hero)` returns a Phaser Container at scene root
- `applyEquipmentStats(hero)` returns computed stats for HP bar `currentHp / maxHp`
- `heroToLoadout(hero)` produces the Loadout for the paperdoll

- [ ] **Step 3: Create `src/ui/pixui_hero_card.ts`**

```typescript
import { Container, TextArea, Progress, Image, Clickable } from 'phaser-pixui';
import * as Phaser from 'phaser';
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

/**
 * pixui-native hero card — Container of PixuiPaperdoll + name + HP + trait +
 * Clickable overlay. Same external API as src/ui/hero_card.ts.
 *
 * Tooltips reuse the existing createTooltip() helper, which renders at scene
 * root (not inside this Container). Slight architectural impurity acceptable
 * because pixui has no Tooltip primitive.
 */
export class PixuiHeroCard extends Container {
  private hero: Hero;
  private opts: PixuiHeroCardOptions;
  private tooltip?: Phaser.GameObjects.Container;
  private internalScene: Phaser.Scene;

  constructor(scene: Phaser.Scene, hero: Hero, opts: PixuiHeroCardOptions) {
    super(scene);
    this.internalScene = scene;
    this.hero = hero;
    this.opts = opts;
    this.build();
  }

  private build(): void {
    const isLarge = this.opts.size === 'large';
    const w = isLarge ? LARGE_WIDTH : SMALL_WIDTH;
    const h = isLarge ? LARGE_HEIGHT : SMALL_HEIGHT;
    const paperdollScale = isLarge ? PAPERDOLL_SCALE_LARGE : PAPERDOLL_SCALE_SMALL;

    // Paperdoll (left side)
    const paperdoll = new PixuiPaperdoll(
      this.internalScene,
      heroToLoadout(this.hero),
      { scale: paperdollScale },
    );

    // Name + class label (right side, top)
    const className = CLASSES[this.hero.classId].name;
    const nameText = new TextArea(this.internalScene, {
      text: `${this.hero.name}\n${className}`,
    });

    // HP bar (right side, middle)
    const stats = applyEquipmentStats(this.hero);
    const hpRatio = stats.maxHp > 0 ? this.hero.currentHp / stats.maxHp : 0;
    const hpBar = new Progress(this.internalScene, {
      value: hpRatio,
    });

    // Trait icon (right side, bottom)
    const traitDef = TRAITS[this.hero.traitId];
    // Verify trait icon source during impl — TraitDef may not have a .iconFrame field;
    // if not, use a placeholder pixui.Image or skip the trait icon for the PoC.
    const traitFrame = (traitDef as unknown as { iconFrame?: number }).iconFrame ?? 0;
    const traitIcon = new Image(this.internalScene, {
      texture: 'sprites',
      frame: String(traitFrame),
    });

    // Click + hover overlay (covers the whole card area)
    // The exact field names for Clickable's hover events are verified during
    // impl (Task 3 Step 1). The names below are a starting guess based on the
    // pixui example's `onClick: () => ...` pattern.
    const clickable = new Clickable(this.internalScene, {
      width: w,
      height: h,
      onClick: this.opts.onClick,
      // Hover handlers — exact field names TBD during impl
    });

    // Wire hover events directly on the Clickable's underlying interactive
    // GameObject if Clickable doesn't expose onPointerOver/onPointerOut:
    const internal = clickable as unknown as { interactive?: Phaser.GameObjects.GameObject };
    internal.interactive?.on?.('pointerover', () => this.showTooltip());
    internal.interactive?.on?.('pointerout', () => this.hideTooltip());

    // Z-order: paperdoll → text → HP → trait → click overlay (last so it
    // captures input)
    this.attach([paperdoll, nameText, hpBar, traitIcon, clickable]);

    // Dead-state: tint each layer of the paperdoll red. PixuiPaperdoll doesn't
    // currently expose a tint API; for now, apply tint to the paperdoll's
    // underlying child GameObjects via a cast. TODO sub-spec 3c: add a clean
    // `setTint(color)` method to PixuiPaperdoll.
    if (this.opts.isDead) {
      this.applyDeadTint(paperdoll);
    }
  }

  private applyDeadTint(paperdoll: PixuiPaperdoll): void {
    // pixui.Container exposes forEach(f) per the .d.ts — use it to walk children.
    // Each child is a pixui.Image wrapping a Phaser Sprite that supports setTint.
    const tintColor = 0xff5555;
    paperdoll.forEach((child) => {
      const internal = child as unknown as { gameObject?: { setTint?: (c: number) => void } };
      internal.gameObject?.setTint?.(tintColor);
    });
  }

  private showTooltip(): void {
    if (this.tooltip) return;
    this.tooltip = createTooltip(this.internalScene, this.hero);
  }

  private hideTooltip(): void {
    this.tooltip?.destroy();
    this.tooltip = undefined;
  }
}
```

(Multiple `as unknown as` casts are scoped to specific lines because pixui's exact internals aren't fully documented in the .d.ts. Replace with proper types if Step 1's source-reading reveals them. The hover-event wiring via the underlying interactive GameObject is a fallback if pixui.Clickable doesn't expose onPointerOver/onPointerOut config fields.)

- [ ] **Step 4: Run typecheck**

```
npx tsc --noEmit
```

Expected: clean. The escape-hatch casts satisfy TypeScript.

- [ ] **Step 5: Run tests**

```
npm test
```

Expected: 1730 tests pass.

- [ ] **Step 6: SKIP — DO NOT COMMIT.**

---

### Task 4: Migrate tavern_panel_scene.ts to UiScene + PixuiHeroCard

Full rewrite. Preserves all functionality (hire candidates, re-roll, hire button, gold-check, roster-cap-check, close, ESC, upgrade-tavern button). Uses `PixuiHeroCard` for each candidate. Uses `fixPixuiCanvasViewport()` + hospital's patterns.

**Files:**
- Modify: `src/scenes/tavern_panel_scene.ts` (full rewrite)

- [ ] **Step 1: Read the current tavern_panel_scene.ts thoroughly**

```
cat src/scenes/tavern_panel_scene.ts
```

Make a list of:
- All external functions called (`@camp/buildings/tavern`, `@camp/roster`, `@camp/vault`, `@camp/building_levels`, `@camp/building_upgrade`)
- All internal methods (build*, hire, reroll, close, etc.)
- All visual elements (header, candidate cards, hire buttons, re-roll button, reason text)
- All event handlers (ESC, close button, hire button, re-roll button, upgrade button)
- The `SLOT_X_BY_COUNT` lookup table (probably an existing constant — preserve it)
- Persistent-candidate caching pattern (probably uses `appState.update(...)` to store and read candidates across panel reopens)

Goal: identify exactly what needs preserving in the rewrite.

- [ ] **Step 2: Rewrite `src/scenes/tavern_panel_scene.ts` extending UiScene**

Replace the file's contents. Skeleton (fill in tavern-specific logic by referring to the original):

```typescript
import { ConstraintMode, UiScene } from 'phaser-pixui';
import { hospitalTreatmentCap, nextLevel, tavernCandidateCap } from '@camp/building_levels';  // verify exact exports
import { applyBuildingUpgrade } from '@camp/building_upgrade';
import {
  ensureCandidatesForCap,
  generateCandidates,
  HIRE_COST,
  REROLL_COST,
} from '@camp/buildings/tavern';
import { addHero } from '@camp/roster';
import { balance, spend } from '@camp/vault';
import type { Hero } from '@heroes/hero';
import { fixPixuiCanvasViewport } from '@render/pixui_canvas_fix';
import { uiTheme } from '@render/ui_theme';
import { PixuiHeroCard } from '@ui/pixui_hero_card';
import { createRng } from '@util/rng';
import { appState } from './app_state';

// SLOT_X_BY_COUNT — preserved from original tavern. Values are absolute canvas
// x-coords for N candidates centered on the screen. Adjust to be relative to
// pixui center (offset from x=480) when used inside insert.center.frame()
// during the candidate loop below.
const SLOT_X_BY_COUNT: Record<3 | 4 | 5, readonly number[]> = {
  3: [...],  // copy from original
  4: [...],
  5: [...],
};

export class TavernPanelScene extends UiScene {
  constructor() {
    super({
      key: 'tavern_panel',
      viewportConstraints: { mode: ConstraintMode.Maximum, width: 960, height: 540 },
      theme: uiTheme,
    });
  }

  create(): void {
    fixPixuiCanvasViewport(this);
    super.create();

    const state = appState.get();
    const cap = tavernCandidateCap(state.buildingLevels.tavern);
    const vaultGold = balance(state.vault);
    const rng = createRng(Date.now());

    // Persisted candidates: ensure the count matches current cap (regenerate on
    // cap change post-upgrade, otherwise reuse).
    const candidates = ensureCandidatesForCap(
      state.tavernCandidates,
      cap,
      rng,
      state.unlocks.classes,
    );
    if (candidates !== state.tavernCandidates) {
      // Persist newly-generated candidates so they survive panel close/reopen.
      appState.update((s) => ({ ...s, tavernCandidates: candidates }));
    }

    // Header
    this.insert.top.textArea({ y: 28, text: `Tavern · ${candidates.length} candidates` });
    this.insert.top.textArea({ y: 52, text: `Gold: ${vaultGold}` });
    this.insert.topRight.button({
      x: 4,
      y: 4,
      width: 48,
      text: 'X',
      onClick: () => this.close(),
    });

    // Upgrade-tavern button (top-left, when applicable) — same as hospital pattern
    const level = state.buildingLevels.tavern;
    const next = nextLevel('tavern', level);
    if (next !== null) {
      const canAfford = vaultGold >= next.upgradeCost;
      this.insert.topLeft.button({
        x: 4,
        y: 4,
        width: 160,
        enabled: canAfford,
        text: `Upgrade ${next.upgradeCost}g`,
        onClick: () => {
          appState.update((s) => applyBuildingUpgrade(s, 'tavern'));
          this.scene.restart();
        },
      });
    }

    // Candidates row — each is a PixuiHeroCard inside a slot frame
    const slotXs = SLOT_X_BY_COUNT[candidates.length as 3 | 4 | 5];
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const slotXFromCenter = slotXs[i] - 480;  // SLOT_X_BY_COUNT is canvas-absolute; convert to center-relative

      const slot = this.insert.center.frame({
        x: slotXFromCenter,
        y: 0,
        width: 220,
        height: 320,
      });

      // PixuiHeroCard inside the slot frame
      const card = new PixuiHeroCard(this, candidate, {
        size: 'large',
        onClick: () => this.attemptHire(candidate),
      });
      slot.attach(card);

      // Hire button below the card
      const canAffordHire = vaultGold >= HIRE_COST;
      const rosterFull = state.roster.heroes.length >= state.roster.capacity;
      const canHire = canAffordHire && !rosterFull;
      slot.insert.bottom.button({
        y: 8,
        width: -16,
        enabled: canHire,
        text: `Hire ${HIRE_COST}g`,
        onClick: () => this.attemptHire(candidate),
      });

      // Reason text when hire is blocked
      if (!canHire) {
        const reason = rosterFull ? 'Roster full' : 'Not enough gold';
        slot.insert.bottom.textArea({ y: 36, text: reason });
      }
    }

    // Re-roll button at bottom
    const canAffordReroll = vaultGold >= REROLL_COST;
    this.insert.bottom.button({
      y: 16,
      width: 200,
      enabled: canAffordReroll,
      text: `Re-roll · ${REROLL_COST}g`,
      onClick: () => this.reroll(),
    });

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private attemptHire(candidate: Hero): void {
    const state = appState.get();
    if (balance(state.vault) < HIRE_COST) return;
    if (state.roster.heroes.length >= state.roster.capacity) return;

    const newRoster = addHero(state.roster, candidate);
    const newVault = spend(state.vault, HIRE_COST);
    const remainingCandidates = state.tavernCandidates.filter((c) => c.id !== candidate.id);

    appState.update((s) => ({
      ...s,
      roster: newRoster,
      vault: newVault,
      tavernCandidates: remainingCandidates,
    }));

    this.scene.restart();
  }

  private reroll(): void {
    const state = appState.get();
    if (balance(state.vault) < REROLL_COST) return;

    const cap = tavernCandidateCap(state.buildingLevels.tavern);
    const rng = createRng(Date.now());
    const newCandidates = generateCandidates(rng, state.unlocks.classes, cap);
    const newVault = spend(state.vault, REROLL_COST);

    appState.update((s) => ({
      ...s,
      vault: newVault,
      tavernCandidates: newCandidates,
    }));

    this.scene.restart();
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
```

(Imports and exact API names — `tavernCandidateCap`, `ensureCandidatesForCap`, `addHero`, etc. — need verification against the actual existing tavern code in Step 1. Adjust if names differ.)

- [ ] **Step 3: Run typecheck**

```
npx tsc --noEmit
```

Expected: clean. If errors:
- Import path issues: verify `@camp/buildings/tavern` exports the functions you're importing
- Type mismatches: verify `tavernCandidateCap` / `ensureCandidatesForCap` signatures
- pixui DSL field names: verify `insert.center.frame(...)` config fields (x, y, width, height) match pixui types

- [ ] **Step 4: Run tests**

```
npm test
```

Expected: 1730 tests pass. Tavern isn't unit-tested.

- [ ] **Step 5: SKIP — DO NOT COMMIT.**

---

### Task 5: Manual browser verification

Verify Tavern works end-to-end with the new pixui widgets, and hospital still works after the helper refactor.

**Files:** None modified.

- [ ] **Step 1: Start the dev server**

```
npm run dev
```

Wait for "ready in Xms". Open http://localhost:5173.

- [ ] **Step 2: Verify hospital regression check**

From a save with at least one wounded hero, open Hospital from camp.

- [ ] Hospital renders pixel-identical to before this sub-spec's refactor (Task 1 changes)
- [ ] Click a wounded hero → details show
- [ ] Click X → returns to camp
- [ ] No console errors

- [ ] **Step 3: Verify Tavern works under pixui**

From camp, click Tavern.

- [ ] Header shows "Tavern · N candidates" + "Gold: NNNN"
- [ ] Upgrade button at top-left (when applicable)
- [ ] Close button (X) at top-right
- [ ] N hire candidates (3-5 depending on tavern level) render in a row
- [ ] Each candidate shows a `PixuiHeroCard` — paperdoll on left, name + class on right, HP bar, trait icon
- [ ] Hover over a candidate → tooltip appears (existing `createTooltip` rendered above the pixui frame at scene root)
- [ ] Move pointer off → tooltip disappears
- [ ] Hire button under each candidate shows cost (e.g., "Hire 50g")
- [ ] When `gold < HIRE_COST`: hire buttons disabled + "Not enough gold" reason text under each
- [ ] When `roster.length >= capacity`: hire buttons disabled + "Roster full" reason text
- [ ] Click hire → gold deducts, candidate removed from row, panel rebuilds via `scene.restart()`
- [ ] Re-roll button at bottom shows cost
- [ ] When `gold < REROLL_COST`: re-roll button disabled
- [ ] Click re-roll → new candidates appear, gold deducts
- [ ] X button closes; returns to camp; camp HUD's gold counter updates
- [ ] ESC also closes
- [ ] No console errors throughout

- [ ] **Step 4: Verify visual integrity**

- [ ] PixuiPaperdoll's 8 layers render in correct z-order (body behind everything; weapon on top)
- [ ] Equipment from each candidate's starter loadout shows on the paperdoll
- [ ] If any candidate is "dead" state-wise (shouldn't happen for fresh hires, but if you can engineer one): paperdoll renders with red tint
- [ ] HP bar reflects each candidate's HP (should be full HP for fresh hires)
- [ ] No pixui frame extends past the panel boundary
- [ ] No widget overflow / clipping

- [ ] **Step 5: Stop dev server**

Ctrl-C in the dev-server terminal.

- [ ] **Step 6: Final test + typecheck**

```
npx tsc --noEmit
npm test
```

Expected: clean; 1730 tests pass.

- [ ] **Step 7: SKIP — DO NOT COMMIT.** Hand off the dirty working tree to the user for review and manual commit.

---

## Done

- `fixPixuiCanvasViewport()` extracted as a reusable helper; hospital uses it.
- `PixuiPaperdoll` exists as a pixui Container composition matching the existing Paperdoll API.
- `PixuiHeroCard` exists as a pixui Container composition matching the existing HeroCard API; tooltips reuse `createTooltip()`.
- Tavern migrated to UiScene + PixuiHeroCard with full feature parity.
- Hospital still works (regression-checked).
- Test count unchanged (1730).
- Patterns established for sub-specs 3b (4 easy panels) and 3c (5 HeroCard panels + cleanup).
