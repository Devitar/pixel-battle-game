# pixui Easy Panels Migration (sub-spec 3b of 3) — Design Spec

**Date:** 2026-05-06
**Status:** Locked design, ready for implementation plan
**Related TODO:** Cluster B · 45 (Migrate UI to phaser-pixui library) — sub-spec 3b of 3
**Sub-specs in this initiative:**
1. Layout helpers + blacksmith migration ([completed](./2026-05-06-panel-layout-helpers-design.md))
2. pixui Hello-World on hospital ([completed](./2026-05-06-pixui-adoption-design.md))
3. Path D — Re-implement Paperdoll/HeroCard as pixui composites; migrate everything
   - 3a — Foundation + Tavern PoC ([completed](./2026-05-06-pixui-foundation-tavern-design.md))
   - 3b — **Easy panels: TreasureRoomOverlay, ShopOverlay, CampNodeOverlay, Blacksmith** (this spec)
   - 3c — HeroCard panels: Barracks, Equip, Expeditions, EventOverlay, PerkOverlay + cleanup (future)

## Why

Sub-spec 3a established the foundation: `fixPixuiCanvasViewport()` helper, `PixuiPaperdoll`, `PixuiHeroCard`, with Hospital and Tavern as working pixui scenes. Sub-spec 3b migrates the 4 remaining panel scenes that DON'T embed Phaser GameObjects (HeroCard, Paperdoll). After 3b, 6 of 11 panels are on pixui; only HeroCard-dependent ones remain (3c).

3b also validates two pieces of net-new pixui surface area before 3c needs them:
- `pixui.Dialog` (Blacksmith's rare-item sell-confirm modal)
- Inline `pixui.Image` for item icons (Blacksmith rows, ShopOverlay items)

## Scope summary

**In scope:**

- Rewrite: `src/scenes/treasure_room_overlay_scene.ts` — smallest panel, warm-up
- Rewrite: `src/scenes/shop_overlay_scene.ts` — adds inline `pixui.Image` for item icons
- Rewrite: `src/scenes/camp_node_overlay_scene.ts` — largest non-Blacksmith; multiple node-effect branches
- Rewrite: `src/scenes/blacksmith_panel_scene.ts` — largest panel; adopts `pixui.Dialog` for sell-confirm; retires its sub-spec 1 `panel_layout.ts` references

**Out of scope (deferred):**

- **Sub-spec 3c** — Barracks, Equip, Expeditions, EventOverlay, PerkOverlay migrations + cleanup
- **Retiring legacy widgets** — `src/render/paperdoll.ts`, `src/ui/hero_card.ts` stay alive for sub-spec 3c's not-yet-migrated consumers
- **Retiring `src/render/panel_layout.ts`** — after Blacksmith migrates in 3b, panel_layout.ts has zero consumers; retirement happens in 3c cleanup
- **Extracting `pixuiItemIcon()` helper** — Q2 chose Rule-of-Three deferral; sub-spec 3c's Equip slot strip is the 3rd use site → extraction trigger
- **The 11 Cluster B follow-ups (#46–56)** — addressed inline during 3b if they bite, otherwise filed forward
- **Combat / Dungeon / Corridor scene migrations** — never targeted by pixui

## Locked decisions (brainstorm log)

| # | Question | Decision |
|---|---|---|
| Q1 | Sell-confirm modal (rare items) — adopt `pixui.Dialog`, build wrapper, or skip migration? | **A — Adopt `pixui.Dialog` directly.** First adoption of the primitive on a real consumer, no abstraction overhead. If 3c reveals 3+ confirm-dialog use sites with the same call shape, that's the Rule-of-Three trigger to graduate to a project-side `confirmDialog()` factory. Dialog already configured in `uiTheme` (`frame: 'frame_bright'`, `backdropColor: 0x000000`, `backdropAlpha: 0.5`). |
| Q2 | Item icons (Blacksmith rows, ShopOverlay items, future Equip slot strip) — extract `pixuiItemIcon()` helper now or inline? | **B — Inline in 3b; extract in 3c when 3rd use site appears.** Per-call construction is 3 lines; helper saves 2 lines per site at the cost of 8 lines for the file. Break-even at best for 3b's 2 use sites. The third site (Equip slot strip in 3c) likely surfaces variations like rarity tint or click handler — designing the helper API at that point is informed by real callers. |
| sub | Migration order | **Smallest first.** TreasureRoomOverlay → ShopOverlay → CampNodeOverlay → Blacksmith. Pattern settles on simple panels before tackling the largest one + its new Dialog adoption. |
| sub | Single spec for all 4 panels vs split | **Single spec.** Mechanical apply-the-pattern work; each panel is its own task within the spec. No cross-panel dependencies. Same shape as sub-spec 2 + 3a (foundation + N panels). |

## Architecture

### Migration pattern (each panel)

Established by hospital + tavern in sub-spec 3a. Every panel follows:

```typescript
import { ConstraintMode, UiScene } from 'phaser-pixui';
import { fixPixuiCanvasViewport } from '@render/pixui_canvas_fix';
import { uiTheme } from '@render/ui_theme';

export class FooPanelScene extends UiScene {
  constructor() {
    super({
      key: 'foo_panel',
      viewportConstraints: { mode: ConstraintMode.Maximum, width: 960, height: 540 },
      theme: uiTheme,
    });
  }

  create(): void {
    fixPixuiCanvasViewport(this);
    super.create();

    // Header strip
    this.insert.top.textArea({ y: 28, text: 'Foo Panel · context' });
    this.insert.topRight.button({ x: 4, y: 4, width: 48, text: 'X', onClick: () => this.close() });

    // Content frames — use insert.topLeft / insert.topRight (NOT .left/.right)
    // because pixui's .left/.right have origin (Left, Center) which makes y
    // values offsets from canvas center, causing overflow past canvas bottom.
    // See Cluster B · 54.
    const listPane = this.insert.topLeft.frame({ x: 8, y: 80, width: 380, height: -80 });
    const detailPane = this.insert.topRight.frame({ x: 8, y: 80, width: 440, height: -80 });

    // ... panel-specific content ...

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');  // or whichever parent scene applies
  }
}
```

Key rules:
- `fixPixuiCanvasViewport(this)` BEFORE `super.create()` — handles viewport patch + scene.restart() corruption fix
- `insert.topLeft` / `insert.topRight` for top-anchored y (not `insert.left/.right`)
- `scene.restart()` for state changes (no in-place pixui rebuild)
- Module-level state survival via `let _pendingX = ...` declared above the class — only when state must persist across restart
- Close: `this.scene.stop(); this.scene.resume(<parent>)`

### Panel-specific notes

#### TreasureRoomOverlay (smallest, warm-up)

- 162 LOC. No icons, no dialog, no tooltip.
- Probably renders treasure items + a confirm/skip flow.
- Verify the parent scene during impl (likely `dungeon` or `corridor` — different from `camp` since this is mid-run).
- No new pixui patterns needed; pure UiScene + insert DSL.

#### ShopOverlay (item icons, no dialog)

- 229 LOC. Items rendered with sprite icons.
- **Inline `pixui.Image` pattern:**
  ```typescript
  // Inside a UiScene, `this` IS the Scene. `this.scene` is the ScenePlugin
  // manager — passing it to pixui widget constructors fails typecheck.
  const itemSprite = new Image(this, {
    texture: 'sprites',
    frame: String(BASE_ITEMS[item.baseId].spriteId),
  });
  itemSprite.internal.setScale(1.5);  // existing scale preserved
  ```
- Parent scene: `dungeon` or `corridor` (mid-run shop).

#### CampNodeOverlay (largest non-Blacksmith)

- 471 LOC. No HeroCard, no Paperdoll, no item icons (per the Cluster B · 45 paper survey).
- Multiple node-effect branches (camp action menu — Pray, Equip, Move, etc.).
- May have pixui patterns we haven't hit. If anything blocks, follow same "investigate during impl" approach as 3a Tasks 2-4.
- Parent scene: probably `corridor` (mid-run camp action).

#### Blacksmith (largest, dialog adoption, item icons)

- 881 LOC. Item icons in row lists. Sell-confirm dialog for rare items.
- **`pixui.Dialog` for sell-confirm:**
  ```typescript
  // Replaces blacksmith_panel_scene.ts:631+ hand-rolled overlay+dialog
  // Pattern verified during impl by reading node_modules/phaser-pixui/dist/index.d.ts Dialog class
  const dialog = this.insert.center.dialog({
    width: 420,
    height: 180,
    onCancel: () => dialog.close(),  // exact API tbd-during-impl
    children: [
      /* title, body, confirm/cancel buttons */
    ],
  });
  ```
- **Inline item icons** — same pattern as ShopOverlay.
- **Sub-spec 1 `panel_layout.ts` retirement signal:** after this rewrite, Blacksmith no longer imports `panelLayout`, `splitPaneLayout`, `headerStripLayout`. With Hospital + Tavern already migrated and Blacksmith being the last sub-spec-1 consumer, `panel_layout.ts` becomes dead code at 3b's end. Don't retire it in 3b (3c cleanup scope) — just note the inflection.
- Parent scene: `camp`.

### What sub-spec 3c needs from this sub-spec

- `pixui.Dialog` validated as a working primitive (Blacksmith's sell-confirm) — Barracks "retire hero" can adopt it
- Inline `pixui.Image` pattern for item icons (Blacksmith + ShopOverlay) — Equip slot strip in 3c will be the 3rd use site triggering `pixuiItemIcon()` extraction
- Confirmation that `panel_layout.ts` has zero remaining consumers — clear path to retire in 3c cleanup
- Honest writeup of pixui rough edges encountered (in HISTORY entry)

## Tests

- No new unit tests (matches sub-spec 3a pattern; pixui scenes/widgets not unit-tested in this codebase).
- **Manual verification per panel** — each works end-to-end after migration:
  - TreasureRoomOverlay: opens from corridor/dungeon, items selectable, close works
  - ShopOverlay: opens from corridor/dungeon, items render with icons, purchase deducts gold, close works
  - CampNodeOverlay: opens from corridor, all action branches functional (Pray, Equip, Move, etc.), close works
  - Blacksmith: opens from camp, both Upgrade and Sell tabs work, item icons render, sell-confirm dialog opens for rare items + confirms/cancels, close works
- Test count delta: 0.

## Risks

1. **`pixui.Dialog` API surface untested.** First adoption. Implementer reads `node_modules/phaser-pixui/dist/index.d.ts` Dialog class + `index.js` implementation before writing the sell-confirm. If blocked >30 min, escalate.
2. **CampNodeOverlay complexity.** 471 LOC with multiple node-effect branches. May surface pixui patterns we haven't seen. Follow sub-spec 3a's "investigate during impl + escalate if stuck" rule.
3. **Blacksmith preserves stash/vault/upgrade flow.** Rewrite must preserve all integrations: `@items/upgrade`, `@items/sell`, `@camp/stash`, `@camp/vault`. No scene tests for Blacksmith; underlying domain-logic tests must stay passing.
4. **4 panels in flight at once.** All 4 migrations uncommitted before sub-spec ships. If one goes badly we either revert it or land 3b incomplete. Acceptable since each panel is independent.
5. **`pixui.Dialog` close mechanics.** pixui dialogs likely have a built-in close path that conflicts with our "scene.stop + resume" pattern. Verify during impl whether dialog dismissal is local (no scene change) or scene-level (back to parent).

## Out-of-scope notes

- **`pixuiItemIcon()` extraction** is filed implicitly as a sub-spec-3c task (when Equip slot strip is the 3rd use site, extract). Not a TODO entry; lives in 3c spec.
- **Cluster B · 54 (`insert.left/right` gotcha)** — this spec's migration pattern explicitly uses `insert.topLeft/topRight`, sidestepping the gotcha. The actual fix (wrapper or doc) is still scoped in #54; 3b doesn't address it directly but doesn't re-introduce the bug.
- **Cluster B · 53 (PixuiHeroCard tooltip parity)** — gates 3c, not 3b. 3b's panels don't use HeroCard, so the tooltip work doesn't block here.
