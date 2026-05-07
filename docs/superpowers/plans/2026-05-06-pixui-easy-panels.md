# pixui Easy Panels Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate 4 non-HeroCard panels (TreasureRoomOverlay, ShopOverlay, CampNodeOverlay, Blacksmith) from `Phaser.Scene` to `UiScene` + pixui DSL, following the patterns established by sub-spec 3a's Hospital + Tavern.

**Architecture:** Apply-the-pattern work. Each panel rewrites to extend `UiScene`, calls `fixPixuiCanvasViewport(this)` first in `create()`, uses `insert.topLeft`/`insert.topRight` for top-anchored layouts (NOT `.left/.right`), uses `scene.restart()` for state changes, and `scene.stop() + scene.resume(parent)` to close. Blacksmith adopts `pixui.Dialog` for its sell-confirm modal — first use of that primitive. ShopOverlay + Blacksmith use inline `pixui.Image` for item-icon sprites (no shared helper yet — extracted in 3c per spec Q2).

**Tech Stack:** TypeScript (strict), Phaser 4, `phaser-pixui ^0.2.1`.

**Spec:** [`docs/superpowers/specs/2026-05-06-pixui-easy-panels-design.md`](../specs/2026-05-06-pixui-easy-panels-design.md)

---

## File Structure

| File | Action | Notes |
|---|---|---|
| `src/scenes/treasure_room_overlay_scene.ts` | Rewrite | 162 LOC. No icons, no dialog. Pure UiScene + insert DSL. |
| `src/scenes/shop_overlay_scene.ts` | Rewrite | 229 LOC. Inline `new pixui.Image(...)` for item icons. |
| `src/scenes/camp_node_overlay_scene.ts` | Rewrite | 471 LOC. No icons. Multiple node-effect branches. |
| `src/scenes/blacksmith_panel_scene.ts` | Rewrite | 881 LOC. Inline pixui.Image for item icons. **Adopts `pixui.Dialog`** for sell-confirm modal. Drops sub-spec-1 panel_layout.ts imports. |

No new files. No shared widgets extracted. All migrations consume existing infrastructure (`fixPixuiCanvasViewport`, `uiTheme`).

---

## Migration pattern (reference)

Every panel below follows this skeleton, with panel-specific content filling the body:

```typescript
import { ConstraintMode, UiScene } from 'phaser-pixui';
import { fixPixuiCanvasViewport } from '@render/pixui_canvas_fix';
import { uiTheme } from '@render/ui_theme';
// + panel-specific imports

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
    this.insert.top.textArea({ y: 28, text: 'Foo · context' });
    this.insert.topRight.button({
      x: 4, y: 4, width: 48,
      text: 'X',
      onClick: () => this.close(),
    });

    // Content frames — use insert.topLeft / insert.topRight for top-anchored y.
    // (insert.left/.right have origin (Left|Right, Center) — y is offset from
    // canvas CENTER, causing overflow past canvas bottom. See Cluster B · 54.)
    const listPane = this.insert.topLeft.frame({ x: 8, y: 80, width: 380, height: -80 });
    const detailPane = this.insert.topRight.frame({ x: 8, y: 80, width: 440, height: -80 });

    // panel-specific content using:
    //   listPane.insert.top.button(...)
    //   listPane.insert.center.textArea(...)
    //   detailPane.insert.top.frame(...) for nested rows
    //   new Image(this.scene, { texture: 'sprites', frame: ... }) for sprites

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume(<parent>);  // 'camp' for panel scenes; 'corridor' or 'dungeon' for overlays
  }
}
```

Key rules (carry forward from sub-spec 3a):
- `fixPixuiCanvasViewport(this)` BEFORE `super.create()`
- `insert.topLeft` / `insert.topRight` (NOT `.left/.right`)
- `scene.restart()` for state changes (no in-place pixui rebuild)
- Module-level state via `let _pendingX = ...` ABOVE the class — only when state must persist across restart
- Close via `scene.stop()` + `scene.resume(parent)`

---

## Tasks

### Task 1: Migrate TreasureRoomOverlay (warm-up)

Smallest of the 4. No icons, no dialog, no tooltips. Validates the pattern in a low-risk panel before tackling the bigger ones.

**Files:**
- Rewrite: `src/scenes/treasure_room_overlay_scene.ts`

- [ ] **Step 1: Run baseline checks**

```
npx tsc --noEmit
npm test
```

Expected: clean typecheck; 1730 tests passing.

- [ ] **Step 2: Read current treasure_room_overlay_scene.ts thoroughly**

```
cat src/scenes/treasure_room_overlay_scene.ts
```

Note:
- All external functions called (likely `@dungeon/treasure`, `@camp/stash`, `@run/run_state`)
- Visual elements (header, treasure list, claim/skip buttons)
- Event handlers (ESC, close, claim, skip)
- Parent scene that launched the overlay (verify via `this.scene.start(...)` calls + `camp_scene.ts` / `corridor_scene.ts` / `dungeon_scene.ts` to find who launches it)

- [ ] **Step 3: Read hospital + tavern as the working reference**

```
cat src/scenes/hospital_panel_scene.ts
cat src/scenes/tavern_panel_scene.ts
```

Note the patterns: constructor + fixPixuiCanvasViewport + insert.topLeft/topRight + scene.restart for state changes + scene.stop+resume for close.

- [ ] **Step 4: Rewrite `src/scenes/treasure_room_overlay_scene.ts`**

Apply the migration pattern from the "Migration pattern (reference)" section at the top of this plan. Preserve all hospital-style invariants:
- Constructor passes the standard config
- `fixPixuiCanvasViewport(this)` first
- `insert.topLeft` / `insert.topRight` for top-anchored content
- All treasure-room functionality preserved (treasure display, claim, skip, save persistence)
- Close: stop scene + resume parent (verify parent name from Step 2)

If pixui can't express something cleanly (e.g., the treasure-row layout), follow sub-spec 3a's "investigate during impl + escalate if blocked >30 min" rule.

- [ ] **Step 5: Run typecheck**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Run tests**

```
npm test
```

Expected: 1730 tests pass.

- [ ] **Step 7: SKIP — DO NOT COMMIT.**

---

### Task 2: Migrate ShopOverlay (introduces inline pixui.Image)

229 LOC. Items rendered with sprite icons via inline `new pixui.Image(...)`. First time we use pixui.Image in a scene file.

**Files:**
- Rewrite: `src/scenes/shop_overlay_scene.ts`

- [ ] **Step 1: Read current shop_overlay_scene.ts thoroughly**

```
cat src/scenes/shop_overlay_scene.ts
```

Note:
- All external functions (likely `@dungeon/shop`, `@camp/stash`, `@camp/vault`, `@run/run_state`)
- How item sprites are currently rendered (`this.add.sprite(x, y, 'sprites', frameIdx)`)
- Visual elements (header, item list with icons, prices, purchase buttons)
- Parent scene (likely `corridor` or `dungeon`)

- [ ] **Step 2: Rewrite `src/scenes/shop_overlay_scene.ts`**

Apply the migration pattern. For item icons, use this inline pattern (matching the spec's Q2 decision to inline rather than extract a helper in 3b):

```typescript
import { Image } from 'phaser-pixui';
// ...

const itemSprite = new Image(this.scene, {
  texture: 'sprites',
  frame: String(BASE_ITEMS[item.baseId].spriteId),
});
itemSprite.internal.setScale(1.5);  // existing scale preserved
// Then attach to a frame: someFrame.attach(itemSprite, OriginX.Left, OriginY.Top);
```

Notes:
- `BASE_ITEMS` from `@data/items` — verify import path
- The `String(...)` cast is needed because pixui.Image's `frame` field expects a string
- `OriginX` / `OriginY` from `phaser-pixui`
- `.internal.setScale()` reaches into the underlying Phaser Sprite — confirmed pattern from PixuiPaperdoll (sub-spec 3a Task 2)

Preserve all functionality: item list, gold-check, purchase, leave-shop, ESC.

- [ ] **Step 3: Run typecheck**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Run tests**

```
npm test
```

Expected: 1730 tests pass.

- [ ] **Step 5: SKIP — DO NOT COMMIT.**

---

### Task 3: Migrate CampNodeOverlay (largest non-Blacksmith)

471 LOC. No HeroCard, no Paperdoll, no item icons (per the sub-spec 3 paper survey). Multiple camp-action branches (Pray, Equip, Move, etc.) — may surface pixui patterns we haven't seen.

**Files:**
- Rewrite: `src/scenes/camp_node_overlay_scene.ts`

- [ ] **Step 1: Read current camp_node_overlay_scene.ts thoroughly**

```
cat src/scenes/camp_node_overlay_scene.ts
```

Note:
- All external functions (likely `@run/run_state.chooseCampNodeEffect`, `@items/equip`, `@camp/roster`)
- All action branches (each "Pray", "Equip", "Move", etc. — list them all)
- Whether each action is its own UI sub-flow or a single shared layout
- Parent scene (likely `corridor`)

- [ ] **Step 2: Rewrite `src/scenes/camp_node_overlay_scene.ts`**

Apply the migration pattern. For action branches:
- If each branch is a separate UI flow, use `scene.restart()` + module-level state to track which branch is active
- If they're inline in a single render, use conditional `this.insert.X(...)` calls per branch

Preserve all camp-action functionality: each action triggers correct game-state mutation, save persistence, scene transition or close.

If any pattern in CampNodeOverlay doesn't fit cleanly (e.g., a hero-selection sub-screen that needs to embed paperdolls), STOP and report — that's a sign the panel isn't actually 3b-friendly per the paper survey. Verify by re-reading the survey: CampNodeOverlay should have `0` paperdoll/HeroCard refs.

- [ ] **Step 3: Run typecheck**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Run tests**

```
npm test
```

Expected: 1730 tests pass.

- [ ] **Step 5: SKIP — DO NOT COMMIT.**

---

### Task 4: Migrate Blacksmith (pixui.Dialog adoption + item icons + retire panel_layout.ts)

The big one. 881 LOC. Inline item icons (same pattern as ShopOverlay). Adopts `pixui.Dialog` for the rare-item sell-confirm modal — first use of that primitive in our codebase. Drops imports of `panelLayout`, `splitPaneLayout`, `headerStripLayout` (sub-spec 1's helpers); after this rewrite, those helpers have zero remaining consumers and are candidates for retirement in sub-spec 3c cleanup.

**Files:**
- Rewrite: `src/scenes/blacksmith_panel_scene.ts`

- [ ] **Step 1: Read pixui's Dialog source to verify API**

```
grep -n "class Dialog\|DialogConfig\|dialog(" node_modules/phaser-pixui/dist/index.d.ts | head -10
sed -n '385,415p' node_modules/phaser-pixui/dist/index.d.ts
```

Look for:
- Dialog constructor signature
- How children are attached (via Container.attach or via insert DSL?)
- How dismissal works (close() method? onCancel/onClose handlers?)
- Whether Dialog blocks input on the parent (modal behavior)

Also check the .js implementation for actual factory invocation:

```
grep -n "dialog(" node_modules/phaser-pixui/dist/index.js | head -10
```

Document the actual API shape before writing the sell-confirm code. The plan's Step 4 below uses placeholder field names that need verification.

- [ ] **Step 2: Read current blacksmith_panel_scene.ts thoroughly**

```
cat src/scenes/blacksmith_panel_scene.ts
```

Note in particular:
- The current sell-confirm flow at line ~631+ (`showSellConfirm`, `performSell`, the hand-rolled overlay+dialog)
- All imports from `@render/panel_layout` (`panelLayout`, `splitPaneLayout`, `headerStripLayout`) — these go away
- All `this.add.sprite(...)` calls for item icons — replaced with inline pixui.Image
- Mode-toggle (Upgrade/Sell tabs) — pixui has no tab primitive; use buttons + module-level state
- `appState.update(...)` calls and the integrations they touch (vault, stash, roster)

- [ ] **Step 3: Rewrite `src/scenes/blacksmith_panel_scene.ts` — main scene migration**

Apply the standard migration pattern. Specific points:

**Mode toggle (Upgrade/Sell tabs):** No pixui tab primitive. Use two buttons; track active mode via module-level state (`let _pendingMode: 'upgrade' | 'sell' | null = null`). Click switches `_pendingMode` and calls `scene.restart()`. The "selected" visual state is currently a known regression (see Cluster B · 48); same pattern as hospital — pass `style: isSelected ? 'selected' : undefined` (no-op until the theme adds the style).

**Item icons in row lists:** Inline pixui.Image as in Task 2:
```typescript
const itemSprite = new Image(this.scene, {
  texture: 'sprites',
  frame: String(BASE_ITEMS[item.baseId].spriteId),
});
itemSprite.internal.setScale(1.5);
```

**Drop panel_layout.ts imports:** Remove all uses of `panelLayout`, `splitPaneLayout`, `headerStripLayout`. Replace their derived constants (`PANEL_CX`, `LIST_PANE_CX`, etc.) with inline values matching the pixui DSL coordinate system (anchor + offset).

- [ ] **Step 4: Add the pixui.Dialog sell-confirm flow**

Replace the existing `showSellConfirm` method's hand-rolled overlay+dialog with `pixui.Dialog`. Skeleton (exact API verified during Step 1):

```typescript
private showSellConfirm(item: Item): void {
  // pixui.Dialog config — exact field names verified during impl by reading
  // node_modules/phaser-pixui/dist/index.d.ts Dialog class signature.
  const dialog = this.insert.center.dialog({
    width: 420,
    height: 180,
    // ... children: title text + body text + cancel/confirm buttons ...
  });

  // The dialog's internal structure:
  //   title  → 'Sell rare item?'
  //   body   → 'You will receive ${itemSellValue(item)}g.'
  //   cancel → onClick: () => dialog.close()  (exact close API tbd-during-impl)
  //   confirm → onClick: () => { this.performSell(item); dialog.close(); }
}
```

If pixui's Dialog doesn't have a clean `.close()` method, see the .d.ts for the actual dismissal pattern. Possible alternatives:
- pixui's dialog auto-closes on backdrop click (verify via index.js)
- Dialog has a `visible` field that can be toggled
- Dialog needs explicit destroy

Pick whichever pixui exposes; document the choice in a code comment.

Preserve `performSell(item)` logic verbatim — it does the actual `applyItemSell` + vault deduct + roster update + scene.restart.

- [ ] **Step 5: Run typecheck**

```
npx tsc --noEmit
```

Expected: clean. If errors:
- pixui.Dialog field name mismatch — verify against Step 1 findings
- `panel_layout.ts` import errors — should have been removed in Step 3; double-check

- [ ] **Step 6: Run tests**

```
npm test
```

Expected: 1730 tests pass. Blacksmith isn't unit-tested but `@items/upgrade`, `@items/sell` tests must stay passing.

- [ ] **Step 7: SKIP — DO NOT COMMIT.**

---

### Task 5: Manual browser verification

User-driven. Verify all 4 migrated panels work end-to-end.

**Files:** None modified.

- [ ] **Step 1: Start dev server**

```
npm run dev
```

Open http://localhost:5173.

- [ ] **Step 2: Verify TreasureRoomOverlay**

Trigger a treasure room (during a Crypt run, traverse to a treasure node).

- [ ] Overlay opens with treasure items visible
- [ ] Click claim → item added to stash
- [ ] Click skip → no item gained
- [ ] ESC closes
- [ ] No console errors

- [ ] **Step 3: Verify ShopOverlay**

Trigger a shop (during a run, traverse to a shop node).

- [ ] Overlay opens with shop items visible
- [ ] Item icons render (small sprites next to names)
- [ ] Gold-display correct
- [ ] Click purchase → gold deducts, item added to stash, item removed from shop
- [ ] Click leave shop → returns to corridor
- [ ] No console errors

- [ ] **Step 4: Verify CampNodeOverlay**

Trigger a camp node (during a run, traverse to a camp node).

- [ ] Overlay opens with action buttons (Pray, Equip, Move, etc. — whatever the existing flow shows)
- [ ] Each action triggers correct game-state effect
- [ ] Close returns to corridor
- [ ] No console errors

- [ ] **Step 5: Verify Blacksmith**

From camp, click Blacksmith.

- [ ] Header shows blacksmith info + gold
- [ ] Upgrade tab + Sell tab toggleable
- [ ] Item rows display with item-icon sprites (small icons, not the green-bordered placeholders)
- [ ] Detail pane shows selected item info
- [ ] Click Upgrade button on a row → gold deducts, item upgraded
- [ ] Switch to Sell tab → items list with sell values
- [ ] Click Sell on a common item → instant sell, gold added
- [ ] Click Sell on a **rare** item → confirm dialog appears
- [ ] Confirm dialog shows the rare-item warning + Cancel/Sell buttons
- [ ] Click Cancel → dialog closes, item retained
- [ ] Click Sell → dialog closes, item sold, gold added
- [ ] Close blacksmith → returns to camp; gold counter updates
- [ ] No console errors

- [ ] **Step 6: Final typecheck + tests**

```
npx tsc --noEmit
npm test
```

Expected: clean; 1730 tests pass.

- [ ] **Step 7: SKIP — DO NOT COMMIT.** Hand off the dirty working tree to the user for review and manual commit.

---

## Done

- 4 panels migrated to UiScene + pixui DSL
- pixui.Dialog validated as a working primitive (Blacksmith sell-confirm)
- Inline pixui.Image pattern used in Blacksmith + ShopOverlay (2 of 3 anticipated use sites; 3rd in 3c triggers helper extraction)
- `panel_layout.ts` has zero remaining consumers — clear path to retire in 3c cleanup
- Test count unchanged (1730)
- 6 of 11 panels now on pixui (Hospital, Tavern, plus these 4)
- Sub-spec 3c remaining: 5 HeroCard panels (Barracks, Equip, Expeditions, EventOverlay, PerkOverlay) + cleanup
