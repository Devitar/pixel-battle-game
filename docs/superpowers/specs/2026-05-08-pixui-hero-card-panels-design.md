# PixuiHeroCard Panel Migrations + Cleanup (sub-spec 3c-ii of 3) — Design Spec

**Date:** 2026-05-08
**Status:** Locked design, ready for implementation plan
**Related TODO:** Cluster B · 45 (Migrate UI to phaser-pixui library) — sub-spec 3c-ii of 3
**Closes:** Cluster B · 45 + Cluster B · 51 (README + asset-pipeline docs)
**Sub-specs in this initiative:**
1. Layout helpers + blacksmith migration ([completed](./2026-05-06-panel-layout-helpers-design.md))
2. pixui Hello-World on hospital ([completed](./2026-05-06-pixui-adoption-design.md))
3. Path D — Re-implement Paperdoll/HeroCard as pixui composites; migrate everything
   - 3a — Foundation + Tavern PoC ([completed](./2026-05-06-pixui-foundation-tavern-design.md))
   - 3b — Easy panels: Treasure, Shop, CampNode, Blacksmith ([completed](./2026-05-06-pixui-easy-panels-design.md))
   - 3c — Path D part 2 — split into 3c-i and 3c-ii during 2026-05-07 brainstorm
     - 3c-i — PixuiHeroCard foundation ([completed](./2026-05-07-pixui-hero-card-foundation-design.md))
     - 3c-ii — **HeroCard panel migrations + cleanup** (this spec)

## Why

After 3c-i (committed `4c4211f`), `PixuiHeroCard` ships with wound badge + tap-to-toggle tooltip + draggable mode + public `events` getter. The foundation is validated. 3c-ii is the mechanical apply-the-pattern phase: 6 remaining scenes migrate to pixui, legacy widgets retire where their consumers all migrate, README catches up to the post-pixui asset structure, and Cluster B · 45 closes.

The 6 scenes break into three rough complexity buckets:
- **Mechanical** — PerkOverlay (Paperdoll only), EventOverlay (Paperdoll only), camp_screen_scene (HeroCard only, full-scene)
- **Complex consumer** — Barracks (HeroCard list + Paperdoll detail + retire flow + dialog)
- **Specialized** — Expeditions (drag-and-drop, exercises 3c-i's `draggable`), Equip (937 LOC, slot strip + per-row mini-strip + before/after preview + picker)

All 6 are independent migrations of independent scenes; no cross-panel dependencies force sequencing.

## Scope summary

**In scope:**

- Migrate 6 scenes to pixui `UiScene` + `insert` DSL, in order:
  1. `src/scenes/perk_overlay_scene.ts` (142 LOC) — Paperdoll only; perk-cards become `pixui.Button`
  2. `src/scenes/event_overlay_scene.ts` (418 LOC) — Paperdoll only (TODO entry incorrectly said HeroCard)
  3. `src/scenes/camp_screen_scene.ts` (~190 LOC) — HeroCard only; **full-scene migration** (no parent to resume)
  4. `src/scenes/barracks_panel_scene.ts` (582 LOC) — HeroCard list + Paperdoll detail; consumes 3c-i wound-badge
  5. `src/scenes/expeditions_panel_scene.ts` (565 LOC) — HeroCard with drag-and-drop; uses `pointer.x/y` per 3c-i HISTORY note
  6. `src/scenes/equip_scene.ts` (937 LOC) — Paperdoll + slot-strip + picker + commit
- Retire `src/render/panel_layout.ts` + delete `src/render/__tests__/panel_layout.test.ts` (14 tests)
- Retire `src/ui/hero_card.ts`
- README structural rewrite (closes Cluster B · 51): asset layout, pixel-tools pipeline, Windows shim, `vite/assets.mjs` field comments, stale-reference purge
- Possibly extract `pixuiSlotSquare()` helper (impl-time decision — see Q2 below)

**Out of scope (explicitly):**

- `src/render/paperdoll.ts` — STAYS ALIVE; consumed by `src/render/combat_actor.ts` (combat scene out of scope) and `src/scenes/dev/main_scene.ts`
- `src/ui/tooltip.ts` — STAYS; consumed by `PixuiHeroCard`
- Combat / Dungeon / Corridor scene migrations — never targeted by pixui
- Theme palette polish (Cluster B · 47), `'selected'` button style (B · 48), Blacksmith row tinting (B · 57) — independent follow-ups
- Hospital pagination (B · 46), Windows shim arch detection (B · 50), pixui_canvas_fix sanity check (B · 55), Tavern RNG audit (B · 56) — independent follow-ups
- `insert.left/right` gotcha doc (B · 54) — sidestepped by sticking with `insert.topLeft/topRight`; formal documentation out-of-scope

## Locked decisions (brainstorm log)

| # | Question | Decision |
|---|---|---|
| Q1 | Spec packaging — single, split, or per-panel | **A — Single spec for all 6 panels + cleanup.** Mirrors 3b's "4 panels in one spec" pattern. Foundation work (3c-i) already de-risked the unknowns (drag, tooltip, draggable). |
| Q2 | `pixuiItemIcon()` extraction (3b deferred this) | **A — Don't extract for plain icons.** Three sites, ~3 lines each inline; helper saves ~6 lines net (premature abstraction). Blacksmith/Shop already inline; Equip slot strip is structurally different (square + rarity border + selection state + label) so the 3b deferral premise turned out wrong. **Soft C — extract `pixuiSlotSquare()` only if Barracks's per-row mini-equip-strip wants the same shape as Equip's main slot strip** (impl-time decision during step 4 or 6). |
| Q3 | PerkOverlay perk-card hover-highlight | **A — Use `pixui.Button` for perk cards.** Native hover/pressed states from theme. Cards ARE buttons functionally; styled-button form matches the rest of the migrated UI. **Fallback B — Frame + Clickable + manual border swap, ~10 LOC** if button styling feels cramped on 260×140 cards during impl. |
| Q4 | Migration ordering | **A — Smallest → largest, mechanical first.** Perk → Event → camp_screen → Barracks → Expeditions → Equip → cleanup. Pattern settles before complex consumers test foundation edge cases. Mirrors 3b's smallest-first decision. |
| Q5 | README + asset-pipeline docs scope | **A — Close Cluster B · 51 entirely as part of 3c-ii cleanup.** Single coherent post-migration README; closes B · 51 alongside B · 45 in one sweep. |
| sub | `camp_screen_scene` inclusion (TODO's 11-panel count didn't list it) | **In scope (decided 3c-i Q1).** Without it, `hero_card.ts` can't fully retire. Adds ~190 LOC of work; included as step 3. |

## Architecture

### Migration pattern (every panel)

Established by 3a/3b/3c-i. Every panel-style scene follows:

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
    // ... insert.X.frame/button/textArea/dialog ...
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');  // or whichever parent scene
  }
}
```

**Key rules carried forward from 3a/3b/3c-i:**

- `fixPixuiCanvasViewport(this)` BEFORE `super.create()` — handles viewport patch + `scene.restart()` corruption fix
- `insert.topLeft` / `insert.topRight` for top-anchored y (NOT `.left/.right` — origin gotcha, B · 54)
- `scene.restart()` for state changes (no in-place pixui rebuild)
- Module-level `let _pendingX = ...` declared above the class for state survival across restart
- `this` IS the Scene; `this.scene` is the ScenePlugin manager — pass `this` to pixui widget constructors
- For `PixuiHeroCard` consumers: drop-target ID via `card.events.on('drop', (pointer, dropZone) => ...)`; drag math uses `pointer.x/y` (not `dragX/dragY`)

### Per-panel notes

#### 1. PerkOverlay (warm-up, smallest)

**142 LOC; Paperdoll only.**

- Construct `PixuiPaperdoll` directly with the hero's loadout. Place inside an `insert.topLeft.frame` or similar at the existing PAPERDOLL_X/Y coords, scale 4.
- Header text (name, class·level, "Reached Level N!", "Choose a perk:") via `pixui.TextArea` or inline `BitmapText`.
- **Perk cards: `pixui.Button`** — title and description text in the button's content. Native hover/pressed states. If cramped on 260×140, fall back to Frame + Clickable + manual border swap.
- Parent scene: camp.
- State: stateless (renders perk choices once; no internal state changes — clicking a perk applies it and closes).

#### 2. EventOverlay

**418 LOC; Paperdoll only.**

- Three overlay states: `'card'`, `'hero_picker'`, `'outcome'`. `scene.restart()` for state transitions; **module-level `let _pendingState: OverlayState = 'card'` and `let _lastOutcome: EventOutcome | undefined`** survive restart. Reset to `'card'`/undefined on first-open and on outcome-dismiss.
- Card state: title + body text + 2 choice buttons (`pixui.Button`).
- Hero picker state: 3 hero rows (one per party member) — each is `PixuiPaperdoll` + name/HP text + "Pick" button.
- Outcome state: outcome lines text + "Continue" button.
- Parent scene: dungeon (event nodes are mid-run).

#### 3. camp_screen_scene (full scene, not panel modal)

**~190 LOC; HeroCard only.** **Migration shape differs:** this is the post-boss "Floor Cleared!" scene between floors, not a panel overlay.

- Extends `UiScene`. **No parent to resume on close** — exit paths are `this.scene.start('camp')` (Leave) or `this.scene.start('dungeon')` (Press On). The Equip button launches `equip` as a sub-scene that resumes camp_screen on close (existing pattern preserved).
- Background `Rectangle` (no overlay; full canvas at `BG_COLOR`).
- Header text "Floor Cleared!" + subheader "The Crypt · Floor N" via `BitmapText`.
- Pack pill: rectangle + label.
- **Party row: 3 `PixuiHeroCard` (`size: 'large'`)** — wound badges from 3c-i light up if anyone's wounded.
- Fallen / Lost lines (existing text rendering, possibly preserved as `BitmapText`).
- **Three-button row: Equip / Leave / Press On** (`pixui.Button`). Equip launches the equip scene as a sub-scene (`scene.launch('equip', {...}) + scene.pause()`). Leave triggers cashout + `scene.start('camp')`. Press On triggers `pressOn()` + `scene.start('dungeon')`.
- Scene's resume listener (`scene.restart()` on resume) preserved — fires after returning from the equip sub-scene.

#### 4. Barracks (most complex non-Equip)

**582 LOC; HeroCard list + Paperdoll detail.**

- Roster slot grid: 12/16/20 capacity (L1/L2/L3) in a 2-column layout. Each filled slot is a `PixuiHeroCard` (`size: 'small'`) inside a slot-frame; empty slots render as a Rectangle + "empty" text.
- Selection highlight: gold border on the selected slot's frame. **Without a `'selected'` Button style (Cluster B · 48), graceful degrade to "click responds, no visible selection highlight"** (matches Hospital's approach from 3b). Module-level `let _selectedHeroId: string | null = null` survives restart.
- Detail pane: `PixuiPaperdoll` (scale 4) + name/class/Lv + 2-line stats + trait + properties block (if any) + wounds block (if any) + abilities block + Equip Gear / Retire buttons.
- **Retire confirmation: `pixui.Dialog`** — same pattern as Blacksmith's sell-confirm from 3b. Module-level `let _confirmRetirePending = false`.
- Upgrade-Barracks button at top-left of header strip (when next level exists and affordable).
- **`pixuiSlotSquare()` extraction trigger:** Barracks's mini-equip-strip on each `PixuiHeroCard`-row currently lives in legacy `HeroCard.buildChildren` (4 small slot squares with rarity-border). PixuiHeroCard doesn't render this; if the visual is to be preserved, either (a) add it to `PixuiHeroCard` itself (small variant only) or (b) skip it (`PixuiHeroCard` already shows class/level/HP/trait — the mini-equip-strip is redundant with the detail pane). **Decision deferred to impl** — examine the existing visual and choose preserve-vs-skip; if preserve, extract `pixuiSlotSquare()` shared with Equip if shapes match.
- Parent scene: camp.
- Scene's RESUME handler (`rebuildDetail()` after equip-scene closes) preserved via `scene.restart()`.

#### 5. Expeditions (drag-and-drop)

**565 LOC; HeroCard with drag-and-drop.** **The drag-math gotcha is the unique 3c-ii risk.**

- Two stages: `'dungeon_list'` and `'party_picker'`. Module-level `let _stage` + `let _formation: (Hero | null)[] = [null, null, null]` survive restart.
- Stage 1: Dungeon list — buttons for each unlocked dungeon → click sets `_selectedDungeonId` and transitions to stage 2.
- Stage 2 — slot row: 3 slot drop zones at SLOT_X[0..2]. **Drop zones stay Phaser-native** — `scene.add.rectangle(...).setInteractive({ dropZone: true })` (pixui doesn't replace this; Phaser drag-drop event flow is independent of pixui).
- Stage 2 — eligible grid: each eligible hero (not in formation) renders as `PixuiHeroCard` (`size: 'small', draggable: true`).
- **Drag handling (load-bearing — see HISTORY entry from 3c-i):**
  ```typescript
  card.events.on('drag', (pointer: Phaser.Input.Pointer) => {
    // Use pointer.x/y, NOT dragX/dragY. dragX/dragY are deltas from pixui's
    // hit-area container at (0,0), not canvas-world coords.
    card.localX = pointer.x - parentCenterX;  // parentCenterX = card's slot-frame center x
    card.localY = pointer.y - parentCenterY;
  });
  card.events.on('drop', (_pointer, dropZone: Phaser.GameObjects.GameObject) => {
    // Map dropZone → slot index via slotRectangles array lookup
    const slotIndex = slotRectangles.indexOf(dropZone);
    if (slotIndex >= 0) /* place hero in formation[slotIndex] */;
  });
  card.events.on('dragend', (_pointer, dropped: boolean) => {
    if (!dropped) /* snap card back to eligible-grid position */;
  });
  ```
- Slot remove buttons: small `×` button at each filled slot's top-right (`pixui.Button` or inline Phaser).
- Descend button + reason text via `pixui.Button` + `pixui.TextArea`. Disabled state when formation incomplete.
- Eligible label, slot labels via `pixui.TextArea`.
- Parent scene: camp.

#### 6. Equip (biggest, 937 LOC)

**Paperdoll + slot-strip + picker + commit.** Multi-pane scene with the most internal structure.

- Two modes (preserved): `{kind: 'barracks', heroId}` and `{kind: 'in_run', returnTo}`. Init data preserved.
- Left pane: Hero list (paged, 4 visible rows) — each row has name, class·Lv·HP, and a **mini-equip-strip** (4 small slot squares with rarity-color border).
- Right pane: Paperdoll (scale 3) + header (name·class·Lv, stat line with optional preview-deltas, kit line) + slot strip (4 large slot squares with rarity-border + selection state + label) + before/after slot detail card + picker (paged item list, 4 visible rows) + commit button.
- **Slot square widget:** Equip's slot strip uses 56×56 rarity-bordered squares with a sprite icon centered + label below + click handler. Compare with Barracks's mini-equip-strip (22×22, rarity border, no icon) during impl — if shapes are similar enough, extract `pixuiSlotSquare()` shared widget. Otherwise both stay inline.
- **Stat-line colored deltas (preview state):** when a pack-item is selected, the stat line shows colored deltas (`+green/-red`). pixui `BitmapText` tint is whole-text; per-token coloring requires multiple `BitmapText` instances laid out horizontally (or one `BitmapText` per token, repositioned via `localX`). Implementer reads pixui source for `setCharacterTint` if available; fallback is multi-instance.
- Page-up/page-down arrow buttons: `pixui.Button` with `▲`/`▼` symbols (assuming bitmap font supports them; otherwise text alternatives).
- Commit button: `pixui.Button`, disabled when nothing pending.
- Selection state (`{kind: 'none' | 'pack-item' | 'equipped-slot'}`) + page indices: module-level state survives restart.
- Parent scene: camp (mode=barracks) OR corridor (mode=in_run). Init data preserved.

### Cleanup phase (after step 6)

- **Retire `src/render/panel_layout.ts`.** Verify zero consumers via `grep` (orphan since 3b). Delete file + `src/render/__tests__/panel_layout.test.ts` (14 tests). Test count: 1730 → 1716.
- **Retire `src/ui/hero_card.ts`.** Verify zero consumers (Barracks/Expeditions/camp_screen all migrated by step 5). Delete file. **`src/ui/tooltip.ts` STAYS** — `PixuiHeroCard` uses it for the wound-badge tooltip.
- **Keep `src/render/paperdoll.ts` ALIVE.** Still consumed by `src/render/combat_actor.ts` (combat scene out of scope) and `src/scenes/dev/main_scene.ts` (dev scene). Combat-scene migration is permanently out of scope; dev scene migration is unnecessary churn.

### README rewrite (closes Cluster B · 51)

Rework `README.md` with new top-level sections covering the post-pixui state:

- **Asset layout.** Three-way distinction: `assets/` (pixui inputs, build-time-packed via pixel-tools — sprites + bitmap fonts + YAML manifests) vs `public/assets/` (runtime-served audio + Phaser spritesheets) vs `public/packed_assets/` (pixel-tools output, gitignored).
- **Pixel-tools pipeline.** YAML manifests at `assets/ui.yaml` and `assets/fonts.yaml`; `vite/assets.mjs` config; pixel-tools as a Vite plugin (regen on file change in dev, full build at `npm run build`).
- **Windows shim.** 2-3 line explanation of why `vite.config.ts` copies platform binaries to `node_modules/.cache/pixel-tools-shims/` and prepends to PATH (Windows-only `.cmd` shim resolution issue).
- **`vite/assets.mjs` field comments.** Brief one-line comment per `source_path` / `destination_path` / `fonts` / `atlases`.
- **Stale references.** Remove any HeroCard / Paperdoll references in `src/README.md` that the post-retirement state makes inaccurate (legacy `hero_card.ts` retired; `paperdoll.ts` stays for combat).

## Tests

- **No new unit tests for panel migrations.** Matches sub-spec 3a/3b/3c-i pattern; pixui scenes/widgets aren't unit-tested in this codebase.
- **Test count delta from cleanup:** 1730 → 1716 (delete `panel_layout.test.ts`'s 14 tests).
- **Manual verification per panel** — each works end-to-end after migration:
  - PerkOverlay: opens after level-up, perk cards show hover/pressed states, click applies perk, closes back to camp.
  - EventOverlay: opens at event nodes, all 3 states (card / hero-picker / outcome) work, choices apply outcomes, dismiss returns to dungeon.
  - camp_screen: opens after boss clear, party row shows wound badges, Cash Out / Press On both work.
  - Barracks: opens from camp, hero list paginates by capacity, detail pane shows full hero info including wounds tooltip, Equip Gear and Retire flows both work, retire dialog confirms/cancels.
  - Expeditions: opens from camp, dungeon list selectable, drag-drop into formation slots works, descend button gates correctly, Cancel returns to camp.
  - Equip: opens from Barracks (mode=barracks) or corridor (mode=in_run), hero list works, slot strip + picker + commit flow preserves all stat-preview behavior.
- **Manual verification of cleanup:** after panel_layout.ts and hero_card.ts retirement, full game smoke (boot → camp → run → combat → camp_screen → camp) confirms nothing references the deleted files.

## Risks and open questions

1. **`pixui.Button` styling on PerkOverlay's 260×140 perk cards.** Theme buttons are typically smaller/squarer. Large content-rich buttons may feel weird visually. **Fallback B (Frame + Clickable + manual border swap)** ready if cramped during impl.

2. **Equip's stat-line colored deltas.** pixui `BitmapText` tint applies to whole text; per-token coloring requires multiple `BitmapText` instances. Verify during impl whether `setCharacterTint` is available on pixui `BitmapText` (probably not — pixui wraps Phaser's BitmapText which does support per-character tint, but pixui's accessor may not expose it). Multi-instance is the fallback; ~7 BitmapText per stat line × 1 stat line = 7 instances, acceptable.

3. **Barracks selection highlight regression.** No `'selected'` button style yet (Cluster B · 48). 3c-ii ships with "click responds, no visible selection highlight" — same pattern Hospital used in 3b. B · 48 closes the gap separately.

4. **Equip's complexity (937 LOC) in one task.** Largest single migration. Risk: mid-impl discovery of pixui gap. If blocked, escalate before sinking time. Mitigations: order puts Equip last, so all earlier panels' patterns are validated first; if Equip needs to split, the spec naturally breaks at "left pane" / "right pane" / "picker" boundaries.

5. **camp_screen full-scene migration.** No prior reference for "full-scene UiScene" — Hospital/Tavern/etc. are panels with parent scenes. Verify viewport setup composes cleanly during impl. The full-canvas background rectangle (BG_COLOR) replaces the dim-overlay pattern panels use.

6. **`pixuiSlotSquare()` extraction signal.** Decided during impl: if Barracks's mini-strip (22×22, rarity border, no icon) and Equip's slot strip (56×56, rarity border, sprite icon, label, click) share enough structure to warrant a parameterized helper, extract it. Otherwise both stay inline.

7. **Drag math during impl.** The `pointer.x/y` pattern is documented in 3c-i HISTORY but Expeditions is the first real consumer. If `parentCenterX/Y` math turns out wrong (e.g., the slot frame's anchor isn't where it appears), the smoke test catches it. Plan time for diagnostic logging during step 5.

8. **PerkOverlay's `_pendingPerk` on hero state.** Per-hero pending perk surfaces this scene; verify the existing `applyPerk(hero, perkId)` flow integrates with the migrated scene's close path.

9. **Cluster B · 47/48/57 stay deferred.** Theme palette mismatch, missing `'selected'` style, Blacksmith row tinting workaround all still apply post-3c-ii. 3c-ii doesn't try to close them — just doesn't make them worse.

If any risk turns out to be a deal-breaker, the implementer escalates and we revisit before continuing.

## What 3c-ii ships

After 3c-ii merges:

- All 11 panel scenes + 1 full-scene (camp_screen) on pixui (Hospital ✓, TreasureRoomOverlay ✓, ShopOverlay ✓, CampNodeOverlay ✓, Blacksmith ✓, Tavern ✓ + new: PerkOverlay, EventOverlay, camp_screen, Barracks, Expeditions, Equip)
- `src/render/panel_layout.ts` retired (and its 14 tests)
- `src/ui/hero_card.ts` retired
- README rewrites cover post-pixui asset structure
- **Cluster B · 45 closes** (the entire pixui adoption initiative)
- **Cluster B · 51 closes** (README + asset-pipeline docs)
- Possibly: `pixuiSlotSquare()` helper extracted (impl-time decision)

Test count: 1730 → 1716. No production tests added; 14 panel-layout tests removed alongside the retired helper.
