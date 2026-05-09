# PixuiHeroCard Foundation (sub-spec 3c-i of 3) — Design Spec

**Date:** 2026-05-07
**Status:** Locked design, ready for implementation plan
**Related TODO:** Cluster B · 45 (Migrate UI to phaser-pixui library) — sub-spec 3c-i of 3
**Related TODO follow-up closed by this sub-spec:** Cluster B · 53 (PixuiHeroCard tooltip parity)
**Sub-specs in this initiative:**
1. Layout helpers + blacksmith migration ([completed](./2026-05-06-panel-layout-helpers-design.md))
2. pixui Hello-World on hospital ([completed](./2026-05-06-pixui-adoption-design.md))
3. Path D — Re-implement Paperdoll/HeroCard as pixui composites; migrate everything
   - 3a — Foundation + Tavern PoC ([completed](./2026-05-06-pixui-foundation-tavern-design.md))
   - 3b — Easy panels: Treasure, Shop, CampNode, Blacksmith ([completed](./2026-05-06-pixui-easy-panels-design.md))
   - 3c — Path D part 2 — split into 3c-i and 3c-ii during 2026-05-07 brainstorm
     - 3c-i — **PixuiHeroCard foundation** (this spec)
     - 3c-ii — HeroCard panel migrations + cleanup (future, scoped after 3c-i lands)

## Why

After 3a/3b, 6 of 11 panels run on pixui. The remaining 5 panels — PerkOverlay, EventOverlay, Barracks, Expeditions, Equip — plus the post-boss `camp_screen_scene` (a HeroCard consumer not in the original 11-panel count) all depend on Phaser-side widgets that pixui can't host directly.

3a established `PixuiHeroCard` as the pixui-native replacement for legacy `HeroCard`, but two functional gaps were deferred:

1. **Wound-badge tap-to-toggle tooltip.** Filed as Cluster B · 53. Legacy `HeroCard` shows a `🩸 N` badge in the top-right and tap-toggles a tooltip listing each wound's name + effect. PixuiHeroCard's `onPointerOver`/`onPointerOut` are intentional no-ops. Tavern doesn't need this (level-1 candidates have 0 wounds), but Barracks and `camp_screen` do — and migrating them without the badge would be a visible UX regression.

2. **Draggable mode.** Expeditions's party-picker uses Phaser drag-and-drop on each `HeroCard`. PixuiHeroCard has no draggable mode today.

Sub-spec 3c-i lands these two foundation pieces in isolation, before any scene migrations begin in 3c-ii. Mirrors the 3a (foundation) → 3b (apply pattern) split that has worked twice already in this initiative.

## Scope summary

**In scope:**

- Modify: `src/ui/pixui_hero_card.ts`
  - Wound badge (`🩸 N` Phaser Text overlay, top-right of card; only when `hero.wounds.length > 0 && !opts.isDead`)
  - Tap-to-toggle tooltip via existing `createTooltip()`; reuses the Phaser tooltip primitive unchanged
  - Phaser-rooted overlay container that holds badge + tooltip, parented at scene root, position-synced to PixuiHeroCard via `updatePosition()` override
  - New `draggable?: boolean` option in `PixuiHeroCardOptions`; passed to internal `Clickable`
  - Public `events` getter exposing the internal Clickable's `EventEmitter` so consumers can bind Phaser drag events (`dragstart`/`drag`/`drop`/`dragend`)
- Manual verification via temporary Tavern mutation (see §Manual verification below) — no new code committed for testing

**Out of scope (deferred to 3c-ii):**

- Scene migrations: PerkOverlay, EventOverlay, Barracks, Expeditions, Equip, camp_screen_scene
- Cleanup: retire `src/render/panel_layout.ts` (orphaned after 3b), retire `src/ui/hero_card.ts` (still consumed by Barracks/Expeditions/camp_screen until 3c-ii migrates them)
- `pixuiItemIcon()` extraction (3b deferred this; 3c-ii's Equip slot strip is the third use site that triggers extraction)
- README update for pixui

**Out of scope (independent follow-ups, separate work):**

- Cluster B · 47 (theme palette polish — gold/dark vs mana_soul)
- Cluster B · 48 (`'selected'` button style)
- Cluster B · 57 (Blacksmith row tinting workaround)
- Combat/Dungeon/Corridor scene migrations — never targeted by pixui
- Bespoke wound-badge sprite icon (would graduate emoji to pixel art if/when art polish happens; not required for parity)

## Locked decisions (brainstorm log)

| # | Question | Decision |
|---|---|---|
| Q1 | Include `camp_screen_scene` in the 3c retirement story (not in the TODO's 11-panel count, but a `HeroCard` consumer)? | **Yes — include in 3c-ii.** Without it, `hero_card.ts` can't fully retire; one screen drifting from the rest creates long-term divergence risk. Stretches 3c-ii's scope by ~190 LOC; acceptable. |
| Q2 | Cluster B · 53 tooltip parity strategy | **A — Phaser-rooted tooltip; reuse `createTooltip()`.** Existing helper works; the parent-lifecycle issue is solved by tracking handles on PixuiHeroCard and relying on scene shutdown for cleanup. Alternative B (build a pixui-native tooltip primitive) overbuilds for one consumer; alternative C (defer tooltip; ship Barracks with a visible-but-non-interactive badge) ships a known regression. |
| Q3 | Draggable mode design | **A — PixuiHeroCard gains `draggable: true` option.** Card is the drag handle. Internal Clickable's `events` is exposed publicly; consumers bind Phaser drag events directly. Drop-target identification via Phaser's per-GameObject `drop` event (PixuiHeroCard doesn't need to expose pixui internals). Alternative B (Phaser bg rides alongside pixui card) keeps the gnarly two-objects-per-hero pattern. |
| Q4 | Spec packaging — single 3c spec, foundation+migrations split, or three-way split | **B — split foundation (3c-i) from migrations (3c-ii).** Mirrors 3a→3b precedent. Foundation contracts (tooltip lifecycle, drag-event surface) ripple through 5 panels; validating in isolation is safer than catching bugs mid-Barracks. Three-way split (3c-i + small panels + heavy panels) is over-fragmented at the panel sizes involved. |
| Q5 | Wound badge composition (bitmap fonts can't render emoji per 3b discovery) | **A — Phaser-native `scene.add.text()` with emoji.** Same architectural shape as the tooltip (Phaser-rooted, scene-lifetime). Alternative B (plain text "[N]") drops visual distinctiveness; C (sprite icon) is the right long-term answer but requires art work — graduates from emoji during a future polish pass. |
| sub | Manual verification path during 3c-i (no production consumer for badge or draggable until 3c-ii) | **Tavern with temporary mutation.** During impl, the engineer injects mock wounds and `draggable: true` into Tavern's candidate construction (`tavern_panel_scene.ts:122`), verifies in the browser, and reverts before commit. (Earlier draft proposed extending `src/scenes/dev/main_scene.ts`, but it's a plain `Phaser.Scene` and PixuiHeroCard's `attach()` requires a pixui-rooted parent — full UiScene migration of the dev scene is disproportionate work for one-off verification.) |

## Architecture

### Wound badge + tooltip

**Lifetime model.** PixuiHeroCard is a pixui `Container`, not a Phaser `Container`. The legacy `createTooltip()` parents the tooltip to a Phaser Container so destruction cascades. We mirror that by giving PixuiHeroCard a single Phaser `GameObjects.Container` ("phaserOverlay") that holds the badge + (when toggled on) the tooltip. The overlay is parented to scene root; Phaser auto-destroys it on scene shutdown. PixuiHeroCard's `scene.restart()` pattern (used by Tavern, will be used by all 3c-ii panels) gives us correct cleanup for free.

**Layout sync.** pixui resolves layout *after* PixuiHeroCard's constructor (via `reposition()` from the parent Container). PixuiHeroCard overrides the `protected updatePosition()` hook on pixui's Component class to copy `this.x` / `this.y` into the phaserOverlay's `setPosition`, so the badge tracks the card's resolved world position.

**Construction conditions.** Badge is built only when `hero.wounds.length > 0 && !opts.isDead`. Mirrors legacy.

```typescript
// In src/ui/pixui_hero_card.ts (additions)

import { WOUNDS, describeWoundEffect } from '@data/wounds';
import { createTooltip } from './tooltip';

const BADGE_OFFSET_X_SMALL = 75;   // matches legacy HeroCard (small)
const BADGE_OFFSET_Y_SMALL = -22;
const BADGE_OFFSET_X_LARGE = 125;  // matches legacy HeroCard (large)
const BADGE_OFFSET_Y_LARGE = -48;

export class PixuiHeroCard extends Container {
  private phaserOverlay?: Phaser.GameObjects.Container;
  private woundBadge?: Phaser.GameObjects.Text;
  private tooltipChild?: Phaser.GameObjects.Container;
  // ... existing fields ...

  private build(): void {
    // ... existing pixui composition ...

    if (this.hero.wounds.length > 0 && !this.opts.isDead) {
      this.buildPhaserOverlay();
    }
  }

  private buildPhaserOverlay(): void {
    const isLarge = this.opts.size === 'large';
    const badgeX = isLarge ? BADGE_OFFSET_X_LARGE : BADGE_OFFSET_X_SMALL;
    const badgeY = isLarge ? BADGE_OFFSET_Y_LARGE : BADGE_OFFSET_Y_SMALL;

    this.phaserOverlay = this.scene.add.container(0, 0);

    this.woundBadge = this.scene.add
      .text(badgeX, badgeY, `🩸 ${this.hero.wounds.length}`, {
        fontFamily: 'monospace',
        fontSize: isLarge ? '13px' : '11px',
        color: '#ff6666',
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });

    this.woundBadge.on('pointerdown', () => this.toggleWoundTooltip(badgeX, badgeY));

    this.phaserOverlay.add(this.woundBadge);
  }

  protected updatePosition(): void {
    super.updatePosition();
    this.phaserOverlay?.setPosition(this.x, this.y);
  }

  private toggleWoundTooltip(badgeX: number, badgeY: number): void {
    if (this.tooltipChild) {
      this.tooltipChild.destroy();
      this.tooltipChild = undefined;
      return;
    }
    if (!this.phaserOverlay) return;
    const lines = this.hero.wounds.map((w) => {
      const def = WOUNDS[w.id];
      return `${def.name} — ${describeWoundEffect(def.effect)}`;
    });
    // createTooltip parents the tooltip to phaserOverlay; destruction cascades.
    this.tooltipChild = createTooltip(
      this.scene,
      this.phaserOverlay,
      badgeX - 30,
      badgeY,
      lines,
    );
  }
}
```

(Exact `updatePosition()` override timing verified during impl by reading pixui Container source. If `updatePosition()` doesn't fire reliably, fallback is to listen to a layout-resolved event or call `phaserOverlay.setPosition(this.x, this.y)` from a one-shot `scene.events.once('postupdate', ...)` listener.)

**Source-comment constraint:** "PixuiHeroCard's Phaser-rooted children (phaserOverlay, woundBadge, tooltipChild) rely on `scene.restart()` for cleanup. Don't destroy a single PixuiHeroCard instance without restarting the scene — the overlay would leak." Already matches the existing PixuiHeroCard pattern (no `setHero()` for the same reason).

### Draggable mode

**API surface:**

```typescript
export interface PixuiHeroCardOptions {
  size: PixuiHeroCardSize;
  isDead?: boolean;
  onClick?: () => void;
  draggable?: boolean;  // NEW
}

export class PixuiHeroCard extends Container {
  private clickable!: Clickable;
  // ... existing fields ...

  // NEW: passthrough to internal Clickable's events EventEmitter.
  // When draggable=true, Phaser drag events fire here automatically.
  get events(): EventEmitter {
    return this.clickable.events;
  }

  private build(): void {
    // ... paperdoll, name/class/HP/trait composition ...

    this.clickable = new Clickable(this.scene, {
      width: w,
      height: h,
      draggable: this.opts.draggable ?? false,
      onClick: this.opts.onClick,
    });
    this.clickable.events.on('pointerover', () => this.onPointerOver());
    this.clickable.events.on('pointerout', () => this.onPointerOut());
    this.attach(this.clickable);
  }
}
```

**Consumer usage pattern (for 3c-ii Expeditions):**

```typescript
// In Expeditions
const card = new PixuiHeroCard(this, hero, { size: 'small', draggable: true });

card.events.on('dragstart', (pointer: Phaser.Input.Pointer) => {
  // visual feedback for drag start
});
card.events.on('drag', (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
  card.localX = dragX;
  card.localY = dragY;
});
card.events.on('drop', (pointer: Phaser.Input.Pointer, dropZone: Phaser.GameObjects.GameObject) => {
  // dropZone is the slot rectangle; consumer maps dropZone → slot index
});
card.events.on('dragend', (pointer: Phaser.Input.Pointer, dropped: boolean) => {
  // dropped=false means released outside any drop zone — consumer snaps card back
});
```

**Why no leaky internals are needed for drop-target identification:** Phaser fires the `drop` event on the dragged GameObject's own emitter (with `dropZone` as a parameter), not just on the drop zone. Since pixui's Clickable wires its hit area's events EventEmitter into `Interactive.events` (verified by reading `node_modules/phaser-pixui/dist/index.js` lines 282–339), `card.events.on('drop', ...)` receives the per-GameObject drop event directly. Consumer maps `dropZone → slot` using its own slot ownership; PixuiHeroCard owns the source identity (`this` = the dragged card).

**Drop zones stay Phaser-native.** Slot rectangles in 3c-ii Expeditions will use `scene.add.rectangle(...).setInteractive({ dropZone: true })`. pixui doesn't replace this; Phaser's input system handles drop-zone resolution unchanged.

**Position-during-drag.** Consumer sets `card.localX = dragX; card.localY = dragY;` in the `drag` handler. pixui Component exposes `localX` / `localY` setters that move the card within its parent.

### Manual verification — Tavern with temporary mutation

Tavern is the only PixuiHeroCard consumer in production today. Verify both new code paths by temporarily mutating Tavern's candidate construction during impl:

1. **Wounded hero card.** In `tavern_panel_scene.ts` near the `new PixuiHeroCard(this, candidate, ...)` call, replace the candidate with `{ ...candidate, wounds: [{id: 'bruised'}, {id: 'concussed'}] }` (valid wound IDs from `src/data/wounds.ts`). Run `npm run dev`, open Tavern, verify (a) badge renders top-right of card, (b) tap shows tooltip with both wound names + descriptions, (c) tap again dismisses, (d) re-roll/close-and-reopen Tavern doesn't leak the overlay, (e) scene shutdown cleans up. Revert the mutation.

2. **Draggable card.** In the same call site, add `draggable: true` to the options. Wire a one-shot `card.events.on('drag', (_, x, y) => { card.localX = x - 480; card.localY = y - 270; })` (translating canvas-absolute pointer to slot-frame-relative coords) plus a console.log for `dragstart`/`drop`/`dragend`. Run `npm run dev`, open Tavern, drag a candidate card around, verify drag events fire and `card.localX`/`localY` updates make the card follow the pointer. Revert the mutation.

The mutations are local-only verification scaffolding; nothing committed. The implementer reverts before the PixuiHeroCard changes ship.

## Tests

- **No new unit tests.** Matches sub-spec 3a/3b pattern. Test count delta: 0.
- **Manual verification** as described above (Tavern with temporary mutation; reverted before commit).

## Risks and open questions

1. **`updatePosition()` override timing.** pixui's Container `updatePosition()` is `protected` and called when layout resolves and on subsequent reflows. Verify during impl that (a) it fires reliably, (b) `this.x`/`this.y` are world coordinates at that point (not parent-local), (c) it fires before any scene tick where the user might tap the badge. If the timing is wrong, fallback is `scene.events.once('postupdate', ...)` to defer overlay positioning.

2. **Phaser drop event firing on dragged GameObject.** §3 assumes `drop` fires on the dragged GameObject's own EventEmitter. Phaser docs and most usage suggest this is correct, but if pixui's hit-area registration filters that event, the fallback is `scene.input.on('drop', (pointer, draggedGO, dropZone) => ...)` at scene level + the consumer maintains `Map<draggedGO, card>`. Less ergonomic but functionally equivalent.

3. **scene.restart() cleanup ordering.** Scene shutdown destroys scene-rooted Phaser GameObjects, but verify the timing matches pixui's restart sequence — specifically that the new PixuiHeroCard instance's overlay is created AFTER the old scene's children are torn down. `pixui_canvas_fix.ts`'s `_root._initialized` reset already handles pixui's side; Phaser handles its side. Should compose, but worth a manual check on dev-scene restart.

4. **Tooltip parented to phaserOverlay vs scene root.** Spec parents the tooltip to `phaserOverlay` (so destruction cascades when overlay is destroyed). If `createTooltip()`'s positioning math doesn't compose cleanly with the overlay's transform — since overlay is at the card's world position, tooltip's `anchorX/anchorY` are card-local — fall back to parenting the tooltip to scene root with absolute world coords. Cheap pivot; verify during impl.

5. **No production validation until 3c-ii lands.** Mitigated by Tavern-with-temp-mutation (sub-decision). A class of bug — "foundation works on a single Tavern card but fails at scale in a Barracks list of 6+ cards" — only surfaces in 3c-ii. Acceptable risk; Tavern verification catches the common cases.

6. **Lifetime if a card with a wound badge is constructed but never positioned.** If a future caller constructs a PixuiHeroCard with `wounds.length > 0` and never `attach`es it (so `updatePosition()` never fires), the phaserOverlay will sit at (0, 0) on the scene root. This isn't broken (the overlay is still cleaned up at scene shutdown), but it's a misuse warning to put in the PixuiHeroCard source comment alongside the existing "rebuild via scene.restart" guidance.

If any risk turns out to be a deal-breaker, the implementer escalates and we revisit before continuing.

## What 3c-ii will need from this sub-spec

- PixuiHeroCard with working wound badge + tap-to-toggle tooltip — closes Cluster B · 53; unblocks Barracks and `camp_screen` migration
- PixuiHeroCard with `draggable: true` option + public `events` getter — unblocks Expeditions migration
- Honest writeup of any pixui rough edges encountered (in HISTORY entry when 3c-i ships)
- Confirmation that the `updatePosition()` override pattern works — if it does, 3c-ii's panels can use the same pattern for any other Phaser-rooted helpers; if not, we re-evaluate before Barracks
- Tavern verification path documented (so 3c-ii can repeat the temp-mutation approach if needed for Barracks/Expeditions edge cases before real consumers exist)
