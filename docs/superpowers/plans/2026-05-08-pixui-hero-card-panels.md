# PixuiHeroCard Panel Migrations + Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 6 remaining HeroCard/Paperdoll-using scenes to pixui `UiScene`, retire the now-orphaned legacy widgets (`panel_layout.ts`, `hero_card.ts`), and rewrite the README to document the post-pixui asset structure. Closes Cluster B · 45 + Cluster B · 51.

**Architecture:** Apply-the-pattern migrations following the `UiScene + insert DSL + fixPixuiCanvasViewport` shape established by sub-spec 3a/3b/3c-i. Each panel's existing Phaser code is rewritten to use pixui primitives (`Frame`, `Button`, `TextArea`, `Dialog`, `BitmapText`, `Rectangle`) plus the just-shipped `PixuiHeroCard` (with optional `draggable`) and `PixuiPaperdoll`. State changes via `scene.restart()` with module-level state survival. Legacy widgets retire only after their last consumer migrates.

**Tech Stack:** TypeScript 5, phaser-pixui (^0.2.x), Phaser 3.

**Spec:** [`docs/superpowers/specs/2026-05-08-pixui-hero-card-panels-design.md`](../specs/2026-05-08-pixui-hero-card-panels-design.md).

**Project conventions worth knowing:**
- **No commits without explicit user direction** — leave changes in working tree at the end of each task; do NOT run `git add` / `git commit`. The user batches commits manually (typically one commit per sub-spec, possibly per panel — user's call).
- **No new tests for pixui scenes/widgets** — matches sub-spec 3a/3b/3c-i. Verification = typecheck + targeted test run + manual browser smoke (manual smoke is user-driven).
- **Type-check command:** `npx tsc --noEmit`.
- **Test command:** `npm test` (Vitest in CI mode).
- **Migration pattern (every panel):**
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
      this.scene.resume('<parent-scene>');
    }
  }
  ```
- **Key idioms (carried from 3a/3b/3c-i):**
  - `fixPixuiCanvasViewport(this)` BEFORE `super.create()`
  - `insert.topLeft` / `insert.topRight` for top-anchored y (NOT `.left/.right` — origin gotcha)
  - `scene.restart()` for state changes; module-level `let _pendingX = ...` declared above the class for state survival
  - Pass `this` (the Scene) to pixui widget constructors, not `this.scene` (which is the ScenePlugin manager)
  - For PixuiHeroCard drag handlers: use `pointer.x/y`, NOT `dragX/dragY` (HISTORY note from 3c-i)
  - Drop targets: Phaser-native `scene.add.rectangle(...).setInteractive({ dropZone: true })` (pixui doesn't replace this)
- **Reference panels (already on pixui — read these for patterns):**
  - `src/scenes/hospital_panel_scene.ts` — list pane + detail pane
  - `src/scenes/tavern_panel_scene.ts` — `PixuiHeroCard` consumer + per-slot frames
  - `src/scenes/blacksmith_panel_scene.ts` — `pixui.Dialog` + tabbed list with row buttons
  - `src/scenes/shop_overlay_scene.ts` — inline `pixui.Image` for item icons
  - `src/scenes/treasure_room_overlay_scene.ts` — simplest panel; multi-item selection

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/scenes/perk_overlay_scene.ts` | Rewrite | UiScene; `PixuiPaperdoll` + `pixui.Button` perk cards |
| `src/scenes/event_overlay_scene.ts` | Rewrite | UiScene; 3 overlay states (card/hero-picker/outcome) via scene.restart |
| `src/scenes/camp_screen_scene.ts` | Rewrite | UiScene full-scene; 3 `PixuiHeroCard` party row + 3-button action row |
| `src/scenes/barracks_panel_scene.ts` | Rewrite | UiScene; `PixuiHeroCard` slot grid + `PixuiPaperdoll` detail + `pixui.Dialog` retire confirm |
| `src/scenes/expeditions_panel_scene.ts` | Rewrite | UiScene; 2 stages + drag-and-drop with `PixuiHeroCard(draggable: true)` |
| `src/scenes/equip_scene.ts` | Rewrite | UiScene; multi-pane (hero list, paperdoll, slot strip, picker, commit) |
| `src/render/panel_layout.ts` | Delete | Orphaned helper from sub-spec 1 |
| `src/render/__tests__/panel_layout.test.ts` | Delete | 14 tests for the deleted helper |
| `src/ui/hero_card.ts` | Delete | Legacy Phaser HeroCard; consumed by Barracks/Expeditions/camp_screen until step 5 |
| `README.md` | Rewrite (sections) | New asset-layout / pixel-tools / Windows-shim sections |
| `vite/assets.mjs` | Add comments | Brief one-line comments per field (closes B · 51 ask) |
| `src/README.md` | Edit | Remove stale HeroCard / panel-layout references |

`src/render/paperdoll.ts` STAYS (combat consumer). `src/ui/tooltip.ts` STAYS (PixuiHeroCard consumer). `src/ui/pixui_hero_card.ts` and `src/render/pixui_paperdoll.ts` are unchanged in 3c-ii.

---

### Task 1: Migrate PerkOverlay (warm-up)

**Why first:** Smallest panel (142 LOC), Paperdoll-only, exercises `pixui.Button` for the first time on perk cards. If `pixui.Button`'s text-only API can't render title + description distinctly, fall back to Frame + Clickable + manual border swap (Q3's fallback B). Catching that early informs Barracks/Expeditions/Equip button choices.

**Files:**
- Modify: `src/scenes/perk_overlay_scene.ts` (full rewrite, ~142 LOC → similar count)

**Existing functionality to preserve (read `src/scenes/perk_overlay_scene.ts` first):**
- `init({ heroId })` data preserved
- Defensive close if hero missing or no `pendingPerk` (line 48: `this.close()`)
- Background dim overlay (full canvas, click-blocking)
- Panel chrome (centered Frame)
- Paperdoll left of center, scale 4
- Header text: hero name + "Class · Level N" + "Reached Level N!" + "Choose a perk:"
- Two perk cards side-by-side, each with title + description + click handler
- `applyPerk` on pick + `this.close()` on completion
- `close()` does `this.scene.stop(); this.scene.resume('camp')`

**The migration:**

- [ ] **Step 1: Read the existing scene + reference patterns**

Read these for context:
- `src/scenes/perk_overlay_scene.ts` (the scene to rewrite)
- `src/scenes/tavern_panel_scene.ts` (reference: PixuiPaperdoll consumer pattern)
- `src/render/pixui_paperdoll.ts` (the widget being used)
- `node_modules/phaser-pixui/dist/index.d.ts` lines 463-467 (ButtonConfig — note `text?: string` is single-string only; if title + description need distinct visual hierarchy, plan B applies)

- [ ] **Step 2: Rewrite the scene**

Replace the entire file with a UiScene-based implementation following the migration pattern. Preserve all existing functionality (see list above). Specifics:

1. Class extends `UiScene`; constructor takes `viewportConstraints: { mode: ConstraintMode.Maximum, width: 960, height: 540 }`, `theme: uiTheme`.
2. `init(data)` stores `this.heroId = data.heroId`.
3. `create()`:
   - Calls `fixPixuiCanvasViewport(this)` before `super.create()`
   - Resolves hero via `listHeroes(appState.get().roster).find(h => h.id === this.heroId)`; if missing or no `pendingPerk`, calls `this.close()` and returns
   - Builds dim overlay: `this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6).setOrigin(0,0).setInteractive()` (raw Phaser is fine for full-canvas overlay; matches existing Treasure/Shop patterns)
   - Builds panel frame: `this.insert.center.frame({ width: 680, height: 360 })`
   - Inside panel:
     - `PixuiPaperdoll` (scale 4) attached at `panel.insert.topLeft.frame({ x: 80, y: 80, width: 100, height: 200 })` (or similar — derive from existing `PAPERDOLL_X = 280, PAPERDOLL_Y = 200, PANEL_CX = 480, PANEL_CY = 270` math: paperdoll sits 200px left of panel center; in panel-relative coords that's offset (-200, -70))
     - Header text: 4 `BitmapText` lines via `panel.insert.X(...)` placements: hero name (large), class·level (medium), "Reached Level N!" (medium gold), "Choose a perk:" (small)
     - **Two perk cards via `pixui.Button`** — each:
       ```typescript
       panel.insert.bottom.button({
         x: -150,  // for card A; +150 for card B
         y: -20,
         width: 260,
         height: 140,
         text: `${perk.name}\n\n${perk.description}`,  // newline-separated; relies on BitmapText multi-line support
         onClick: () => this.onPick(perkAId),
       });
       ```
       If `pixui.Button` renders the multi-line text awkwardly (e.g., title and description visually indistinguishable), pivot to fallback B:
       ```typescript
       const cardA = panel.insert.bottom.frame({ x: -150, y: -20, width: 260, height: 140 });
       cardA.insert.top.textArea({ y: 16, text: perk.name });  // title (larger via theme size?)
       cardA.insert.center.textArea({ text: perk.description });  // description
       const clickA = new Clickable(this, { width: 260, height: 140, onClick: () => this.onPick(perkAId) });
       cardA.attach(clickA);
       // Hover-highlight: clickA.events.on('pointerover'/'pointerout', ...) toggling a child Rectangle's borderColor
       ```
       Pick whichever produces acceptable visual hierarchy; document the choice in a comment.
   - `this.input.keyboard?.on('keydown-ESC', () => this.close())`
4. `onPick(perkId)`: unchanged logic (`appState.update(...)` + `this.close()`)
5. `close()`: `this.scene.stop(); this.scene.resume('camp');`

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 1730/1730 pass (no test changes; widget unit-tests don't exist for this codebase).

- [ ] **Step 5: Note for user — manual smoke**

Surface to user: PerkOverlay is migrated; manual browser smoke would verify (a) perk cards render with title + description visible, (b) hover/click feedback works, (c) clicking a card applies the perk and closes back to camp. User runs the smoke when ready.

---

### Task 2: Migrate EventOverlay

**Why second:** 418 LOC, Paperdoll-only (TODO claimed HeroCard but the file uses Paperdoll). Three internal states require `scene.restart()` + module-level state survival — same pattern as Hospital's selected-hero or Tavern's candidate-cache.

**Files:**
- Modify: `src/scenes/event_overlay_scene.ts` (full rewrite)

**Existing functionality to preserve (read `src/scenes/event_overlay_scene.ts` first):**
- Three overlay states: `'card'`, `'hero_picker'`, `'outcome'` — defaults to `'card'` on first open
- State `'card'`: title + body text + 2 choice buttons
- State `'hero_picker'`: triggered when a choice has `lose_hero` payload — 3 hero rows (party members) with Paperdoll + name + HP + Pick button
- State `'outcome'`: shows lines describing the outcome + Continue/Dismiss button
- ESC handling differs per state (card → ESC does nothing or closes; outcome → dismiss)
- `applyEventChoice` integration with run state + RNG
- `awaitingFork` flag set on dungeon return for click-to-advance
- Parent scene: `dungeon`

**The migration:**

- [ ] **Step 1: Read the existing scene + identify state transitions**

Read `src/scenes/event_overlay_scene.ts` end-to-end. Map the state machine:
- card → hero_picker (when choice has lose_hero payload) OR card → outcome (otherwise)
- hero_picker → outcome (after pick)
- outcome → close (dismiss)

- [ ] **Step 2: Define module-level state for restart survival**

Above the class declaration, add:

```typescript
// Module-level state survives scene.restart() between overlay-state transitions.
// Reset to defaults on first-open (when scene starts) and on outcome-dismiss.
let _overlayState: 'card' | 'hero_picker' | 'outcome' = 'card';
let _pendingChoiceIndex: 0 | 1 = 0;
let _lastOutcome: EventOutcome | undefined = undefined;
```

- [ ] **Step 3: Rewrite the scene**

Class extends `UiScene` with the standard pattern. `create()`:

1. `fixPixuiCanvasViewport(this); super.create();`
2. Resolve current event card via `currentNode(appState.get().runState!)` (must be type `'event'`).
3. Branch on `_overlayState`:
   - `'card'`: build dim overlay + centered frame, render title (BitmapText), body (TextArea with wordwrap), 2 choice buttons via `panel.insert.bottom.button(...)` calling `onChoiceClicked(index)`.
   - `'hero_picker'`: build dim overlay + centered frame, render title "Choose a hero…" + 3 hero rows. Each row is `frame.insert.top.frame(...)` containing a `PixuiPaperdoll` (scale 2) + name + HP + a Pick button.
   - `'outcome'`: build dim overlay + centered frame, render outcome lines (multiple TextArea) + Dismiss button.
4. ESC handling: `this.input.keyboard?.on('keydown-ESC', () => this.handleEsc())` — preserves existing branching: in card state ignored or closes, in outcome state dismisses.

`onChoiceClicked(index)`:
```typescript
const card = this.currentCard();
const choice = card.choices[index];
const needsHeroPick = choice.payloads.some(p => p.kind === 'lose_hero');
if (needsHeroPick) {
  _pendingChoiceIndex = index;
  _overlayState = 'hero_picker';
  this.scene.restart();
} else {
  this.applyChoice(index);
}
```

`applyChoice(choiceIndex, selectedHeroIndex?)`: unchanged business logic; sets `_lastOutcome = result.outcome; _overlayState = 'outcome'; this.scene.restart()`.

Dismiss handler (outcome → close):
```typescript
private dismiss(): void {
  _overlayState = 'card';
  _lastOutcome = undefined;
  this.scene.stop();
  this.scene.resume('dungeon');
}
```

Reset module state on initial mount (only when entering from non-overlay state — ideally checked via a "has-run-once" flag or by checking if `_lastOutcome` is set before card resolution).

- [ ] **Step 4: Run typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck clean; 1730/1730 pass.

- [ ] **Step 5: Note for user — manual smoke**

Verify event nodes mid-run: card displays both choices, picking a no-hero-pick choice goes straight to outcome, picking a hero-pick choice opens picker, dismiss returns to dungeon, awaitingFork advances correctly.

---

### Task 3: Migrate camp_screen_scene (full-scene)

**Why third:** ~190 LOC, HeroCard-only, **full-scene migration** (no parent panel). First UiScene that's a full game scene rather than a panel modal. Validates the pattern for any future full-scene UiScene needs.

**Files:**
- Modify: `src/scenes/camp_screen_scene.ts` (full rewrite)

**Existing functionality to preserve (read `src/scenes/camp_screen_scene.ts` first):**
- Defensive guard: if no runState or status != 'camp_screen', `console.warn` + `this.scene.start('camp'); return`
- Full-canvas background (`BG_COLOR = 0x1a1020`)
- Header: "Floor Cleared!" (28px green) + "The Crypt · Floor N" (14px gray)
- Pack pill: rectangle + label, conditional 280w/200w based on item count
- Party row: 3 large `HeroCard` at `PARTY_X = [180, 480, 780]`, y=240
- Fallen line + Lost line (conditional)
- 3-button action row at y=470: Equip (220×44), Leave (220×44), Press On (220×44)
- Equip button enabled gating via `equipButtonEnabled(run)` — checks pack items + party hero non-weapon equipment
- Equip button: `scene.launch('equip', { kind: 'in_run', returnTo: 'camp_screen' }) + scene.pause()`
- Leave button: cashout + `scene.start('camp')`
- Press On button: pressOn + `scene.start('dungeon')`
- Resume listener: `scene.restart()` on RESUME (refreshes after equip closes)

**The migration:**

- [ ] **Step 1: Read the existing scene**

Read `src/scenes/camp_screen_scene.ts` fully. Note this is a full scene (`Phaser.Scene`), not a panel overlay.

- [ ] **Step 2: Rewrite as UiScene**

Class extends `UiScene`. `create()`:

1. `fixPixuiCanvasViewport(this); super.create();`
2. Defensive guard preserved.
3. Background: `this.add.rectangle(0, 0, this.scale.width, this.scale.height, BG_COLOR).setOrigin(0,0)` — full-canvas, NO dim overlay (this isn't a modal).
4. Header section via `insert.top.frame(...)`:
   - `BitmapText` "Floor Cleared!" (use `FONT_LARGE` or theme equivalent; tint to green)
   - `BitmapText` `The Crypt · Floor N` below
5. Pack pill: existing rectangle + label (raw Phaser is fine — same pattern as the overlay).
6. **Party row: 3 `PixuiHeroCard(this, party[i], { size: 'large' })`**, each in its own anchored frame at PARTY_X positions. Wound badges from 3c-i auto-render if anyone has wounds.
7. Fallen / Lost lines (BitmapText or raw Phaser text — preserve coloring).
8. **Three-button row via `pixui.Button`**:
   ```typescript
   const equipBtn = this.insert.bottom.button({
     x: -300, y: 30, width: 220, height: 44,
     enabled: equipEnabled,
     text: 'Equip',
     onClick: () => { this.scene.launch('equip', { kind: 'in_run', returnTo: 'camp_screen' }); this.scene.pause(); },
   });
   const leaveBtn = this.insert.bottom.button({
     x: 0, y: 30, width: 220, height: 44,
     text: `Leave (+${run.pack.gold}g to vault)`,
     onClick: () => this.onLeave(),
   });
   const pressOnBtn = this.insert.bottom.button({
     x: 300, y: 30, width: 220, height: 44,
     text: `Press On → Floor ${run.currentFloorNumber + 1}`,
     onClick: () => this.onPressOn(),
   });
   ```
   (x offsets are panel-center-relative; verify exact positioning during impl.)
9. Resume listener preserved: `this.events.on(Phaser.Scenes.Events.RESUME, () => this.scene.restart());`
10. `onLeave()` and `onPressOn()`: existing business logic unchanged.

- [ ] **Step 3: Run typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean; 1730/1730.

- [ ] **Step 4: Note for user — manual smoke**

After a boss clear: camp_screen renders with party HeroCards (badges if wounded), Equip launches equip and returning resumes camp_screen, Leave goes to camp with banked gold/items, Press On goes to next dungeon floor.

---

### Task 4: Migrate Barracks

**Why fourth:** 582 LOC. First time consuming the wound-badge from 3c-i in production. Roster slot grid (12/16/20 capacity) + Paperdoll detail pane + Retire flow with `pixui.Dialog`.

**Files:**
- Modify: `src/scenes/barracks_panel_scene.ts` (full rewrite)

**Existing functionality to preserve (read `src/scenes/barracks_panel_scene.ts` first):**
- Reset per-launch state on `create()` (rosterCards = [], selectedHeroId = null)
- Panel + close button (top-right at 918, 63)
- Title `Barracks · N / cap`
- Upgrade-Barracks button (top-left, conditional on next level + affordability)
- List pane (left): 2-column slot grid; capacity from `appState.get().roster.capacity`; stride scales by capacity
- Each filled slot is `HeroCard(small)` inside a clickable bg rectangle; selection sets gold border on bg
- Empty slots: small rectangle + "empty" text
- Detail pane (right): `Paperdoll(scale 4)` + name + class·Lv + 2-line stats + trait + properties (if any) + wounds (if any) + abilities + Equip Gear / Retire buttons
- Retire flow: click Retire → `confirmRetirePending = true` + rebuild; click Cancel → reset; click Confirm Retire → `removeHero` + `scene.restart()`
- Equip Gear → `scene.launch('equip', { kind: 'barracks', heroId }) + scene.pause()`
- RESUME listener: `rebuildDetail()` on resume from equip

**The migration:**

- [ ] **Step 1: Read the existing scene**

Read `src/scenes/barracks_panel_scene.ts` fully. Note the slot-stride math (lines 57-63) for capacity-scaling slot layout.

- [ ] **Step 2: Define module-level state**

```typescript
// Survives scene.restart() across selection changes / retire confirmations.
let _selectedHeroId: string | null = null;
let _confirmRetirePending = false;
```

Reset on first-open via a sentinel or by checking if the hero still exists at create-time.

- [ ] **Step 3: Rewrite the scene**

Class extends `UiScene`. `create()`:

1. `fixPixuiCanvasViewport(this); super.create();`
2. Dim overlay (raw Phaser).
3. Panel frame: `this.insert.center.frame({ width: 920, height: 460 })`.
4. Title at top via TextArea or BitmapText.
5. Close button: `this.insert.topRight.button({ x: -8, y: 8, width: 28, height: 28, text: '×', onClick: () => this.close() })` — or use `style: 'close'` if theme supports it (verify in `src/render/ui_theme.ts`).
6. Upgrade button (conditional): `panel.insert.topLeft.button({ ... })` with affordability gating.
7. **List pane** (left, 380×360): each slot in the 2-column grid is either:
   - Filled: `slot.attach(new PixuiHeroCard(this, hero, { size: 'small' }))` — wound badge from 3c-i auto-renders. Selection-highlight via swap-on-restart: when `_selectedHeroId === hero.id`, the slot's frame gets a gold border. Without `'selected'` button style (Cluster B · 48), we degrade to "click responds, no visual selection highlight" — but you CAN make the slot frame have a gold border directly via a Rectangle child if you want a visible highlight. **Decision during impl:** ship without highlight (matches Hospital pattern from 3b) OR add a manually-tinted frame border (more code, ~5 LOC per slot). User confirmed B · 48 deferred is acceptable; ship without highlight.
   - Empty: `frame.insert.center.textArea({ text: 'empty' })` inside a small Rectangle.
8. **Detail pane** (right, 440×360): if `_selectedHeroId` resolves to a hero, render the full detail (paperdoll, header text, stats, trait, properties, wounds, abilities, action buttons). If no hero (empty roster), render "No heroes — visit the Tavern to recruit."
9. Action buttons (when not in confirm-retire state):
   - Equip Gear: `pixui.Button` → `scene.launch('equip', { kind: 'barracks', heroId }) + scene.pause()`
   - Retire: `pixui.Button` → `_confirmRetirePending = true; this.scene.restart()`
10. Confirm-retire state (when `_confirmRetirePending`):
    - **Use `pixui.Dialog`** — pattern validated in 3b's Blacksmith sell-confirm. Dialog has `width, height, style` config; visibility controlled via `dialog.visible = true/false`. Children via `dialog.insert.X(...)`. See `src/scenes/blacksmith_panel_scene.ts` for the working example.
    - Title: "Retire {hero.name}?"
    - Body: warning text + roster-low warning if applicable
    - Cancel + Confirm Retire buttons; Confirm calls `appState.update(s => ({ ...s, roster: removeHero(s.roster, hero.id) })); _confirmRetirePending = false; this.scene.restart()`
11. RESUME listener preserved (`this.events.on('resume', () => this.scene.restart())`).
12. ESC handling preserved.

**`pixuiSlotSquare()` extraction decision:** if Barracks's mini-equip-strip on each `PixuiHeroCard` row is to be preserved — examine the existing `HeroCard.buildChildren` lines that render 4 small slot squares per row. Per Q2's soft-C: if it's worth preserving, EITHER add it to PixuiHeroCard (small variant only) OR skip it (current `PixuiHeroCard` already shows class/level/HP/trait — the mini-strip is informational). **Recommended: skip** the mini-strip in 3c-ii; the trait + HP info is enough at a glance, and full equipment lives in the detail pane. Document the omission as a deliberate scope cut.

- [ ] **Step 4: Run typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean; 1730/1730.

- [ ] **Step 5: Note for user — manual smoke**

Verify: barracks opens with full roster grid, click hero shows detail, click Equip Gear opens equip and returns refreshed, click Retire shows dialog, cancel/confirm both work, retire reduces roster, upgrade-Barracks works (if affordable + next level exists).

---

### Task 5: Migrate Expeditions (drag-and-drop)

**Why fifth:** 565 LOC. Drag-and-drop is the unique 3c-ii risk — exercises 3c-i's `draggable: true` for the first time in production. Drag math gotcha (`pointer.x/y` not `dragX/dragY`) is documented in 3c-i HISTORY; this task validates the pattern.

**Files:**
- Modify: `src/scenes/expeditions_panel_scene.ts` (full rewrite)

**Existing functionality to preserve (read `src/scenes/expeditions_panel_scene.ts` first):**
- Two stages: `'dungeon_list'` and `'party_picker'`
- Stage 1: dungeon list buttons (one per unlocked dungeon); `selectedDungeonId` defaults `'crypt'`
- Stage 2 — slot row at SLOT_X=[790,480,170], y=165: 3 slot drop zones; each has empty-slot label or filled card + ×-remove button
- Stage 2 — eligible grid below: each non-formation hero renders as a draggable HeroCard (small)
- Stage 2 — descend button (820, 455): enabled when 3 slots filled + class diversity OR allowable; reason text below if disabled
- ESC handling: stage 2 returns to stage 1; stage 1 closes panel
- DragVisual map: `{bg, card}` per hero; bg is the Phaser Rectangle drag handle (legacy pattern)

**The migration:**

- [ ] **Step 1: Read existing scene + reference patterns**

Read:
- `src/scenes/expeditions_panel_scene.ts` (the scene to rewrite)
- `src/scenes/tavern_panel_scene.ts` (reference: PixuiHeroCard consumer + slot frame layout)
- `src/ui/pixui_hero_card.ts` (the widget being used; look at the `events` getter and constructor's `draggable` option)
- HISTORY entry "PixuiHeroCard foundation" (the dragX/dragY gotcha)

- [ ] **Step 2: Define module-level state**

```typescript
let _stage: 'dungeon_list' | 'party_picker' = 'dungeon_list';
let _selectedDungeonId: DungeonId = 'crypt';
let _formation: (Hero | null)[] = [null, null, null];
```

- [ ] **Step 3: Rewrite the scene**

Class extends `UiScene`. `create()`:

1. `fixPixuiCanvasViewport(this); super.create();`
2. Dim overlay + panel frame (920×460).
3. Title + close button.
4. Branch on `_stage`:

   **Stage 1 ('dungeon_list'):** for each unlocked dungeon, a `pixui.Button` that sets `_selectedDungeonId = id; _stage = 'party_picker'; this.scene.restart()`.

   **Stage 2 ('party_picker'):**
   - Slot row: 3 drop zones via `this.add.rectangle(SLOT_X[i], SLOT_Y, SLOT_W, SLOT_H).setInteractive({ dropZone: true })` (Phaser-native; pixui doesn't replace this).
   - Slot border: `pixui.Frame` or raw Phaser Rectangle for the visible slot indicator.
   - Filled slots: `PixuiHeroCard` placed at SLOT_X[i] via `localX/localY` (or by attaching to a slot-frame).
   - ×-remove buttons on each filled slot: `pixui.Button` (small, 16×16) with `text: '×'`.
   - Eligible heroes (not in formation): each gets `new PixuiHeroCard(this, hero, { size: 'small', draggable: true })`. Position via slot-frame attachment OR `localX/localY` set to ELIGIBLE_X/Y math.
   - **Drag handlers (load-bearing):**
     ```typescript
     card.events.on('dragstart', () => { /* visual feedback if desired */ });
     card.events.on('drag', (pointer: Phaser.Input.Pointer) => {
       // Use pointer.x/y, NOT dragX/dragY (3c-i HISTORY note).
       // Card's parent frame has its own anchor; localX is offset from that.
       // Simplest: track home position at dragstart, set localX = pointer.x - homeAnchorX.
       card.localX = pointer.x - cardHomeAnchorX;
       card.localY = pointer.y - cardHomeAnchorY;
     });
     card.events.on('drop', (_p, dropZone: Phaser.GameObjects.GameObject) => {
       const slotIndex = slotDropZones.indexOf(dropZone);
       if (slotIndex >= 0) {
         _formation[slotIndex] = hero;
         this.scene.restart();
       }
     });
     card.events.on('dragend', (_p, dropped: boolean) => {
       if (!dropped) {
         // Snap card back to its home position via localX/Y reset.
         card.localX = cardHomeAnchorX;  // adjust for whichever was the home
         card.localY = cardHomeAnchorY;
       }
     });
     ```
     (`cardHomeAnchorX/Y` is whatever anchor coords the card was at before drag — capture at dragstart or compute at build-time.)
   - Descend button: `pixui.Button` with `enabled` flag based on formation completeness + reason text below if disabled.
5. ESC: stage 2 → stage 1 + restart; stage 1 → close.

- [ ] **Step 4: Run typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean; 1730/1730.

- [ ] **Step 5: Note for user — manual smoke (drag-heavy)**

Verify: dungeon list selectable, stage 2 shows formation slots + eligible grid, drag a card from grid to a slot — card follows pointer (not jumping to top-left like the 3c-i bug), drop on slot fills formation, drop outside snaps card back, ×-remove clears slot, descend button gates correctly.

---

### Task 6: Migrate Equip (largest)

**Why sixth:** 937 LOC, the biggest single migration in the project. Multi-pane with hero list + paperdoll + slot strip + before/after preview + paged picker. Largest blast radius if pixui has rough edges; placed last so all earlier panels' patterns are validated.

**Files:**
- Modify: `src/scenes/equip_scene.ts` (full rewrite)

**Existing functionality to preserve (read `src/scenes/equip_scene.ts` first — this is a long file):**
- Two modes: `{kind: 'barracks', heroId}` and `{kind: 'in_run', returnTo}`. `init(data)` stores it.
- Left pane: hero list (paged, 4 visible rows) — each row has name, class·Lv·HP, mini-equip-strip (4 small 22×22 rarity-bordered squares)
- Right pane: header (name·class·Lv, stat line with `+green/-red` deltas, kit line) + paperdoll (scale 3) + slot strip (4 large 56×56 squares with sprite icon + label + selection state) + slot-detail card (before/after preview when pack item selected) + picker (paged, 4 visible rows of pack items) + commit button
- Selection state: `Selection = {kind: 'none' | 'pack-item' | 'equipped-slot'}`
- `previewStats(hero, item, slot)` for preview deltas
- `equipFromStash` / `unequipToStash` (barracks mode); `equipFromPack` / `unequipToPack` (in_run mode)
- ESC handling closes panel
- Close path branches on mode: barracks → resume('barracks_panel'); in_run → resume(returnTo)

**The migration:**

- [ ] **Step 1: Read existing scene end-to-end**

Read `src/scenes/equip_scene.ts` (937 LOC) fully. Map the structure:
- Lines 17-113: constants
- Lines 124-148: class top, init, create
- Lines 197-260: left pane (hero list)
- Lines 313-401: right pane top (paperdoll, header, stats line)
- Lines 436-587: slot strip + slot detail + picker
- Lines 600+: picker + commit button + helpers

- [ ] **Step 2: Define module-level state**

```typescript
let _selection: Selection = { kind: 'none' };
let _selectedHeroId: string = '';
let _heroListPageStart = 0;
let _pickerPageStart = 0;
let _mode: EquipMode | undefined = undefined;  // captured in init
```

- [ ] **Step 3: Rewrite the scene in sections**

Class extends `UiScene`. `init(data)` stores `_mode = data` (and clears module state if hero changes). `create()`:

1. `fixPixuiCanvasViewport(this); super.create();`
2. Dim overlay + panel frame (920×460); title; close button.
3. **Left pane** (260×360 at LEFT_PANE_CX=155):
   - Frame at the left.
   - For each visible hero row in `_heroListPageStart..start+4`:
     - Frame at the row's y position
     - Click handler that sets `_selectedHeroId = hero.id; _selection = {kind:'none'}; _pickerPageStart = 0; this.scene.restart()`
     - Selection-highlight: gold border via Rectangle if `_selectedHeroId === hero.id`
     - Name + class·Lv·HP TextArea
     - **Mini-equip-strip (4 small slot squares).** Inline pixui `Rectangle` per slot with rarity-bordered `borderColor` (no icon, no click — purely informational). Compare structure with the slot strip below; if shapes match, lift to a shared helper.
   - Page up/down arrows if list overflows.
4. **Right pane** (620×360 at RIGHT_PANE_CX=640):
   - Frame at the right.
   - **Paperdoll** (scale 3) at PAPERDOLL_X/Y via `PixuiPaperdoll` attached to a sub-frame.
   - **Header** (3 lines):
     - Line 1: name·class·Lv via single `BitmapText`
     - Line 2: stat line with optional preview deltas. Use **multi-instance `BitmapText`** — one instance per stat token (`HP 12`, `ATK 5`, ...), each with its own tint based on delta sign:
       ```typescript
       const xCursor = HEADER_X;
       for (const k of statKeys) {
         const tok = new BitmapText(this, { font: FONT_SMALL, text: `${labels[k]} ${preview.previewStats[k]}${suffix[k] ?? ''}` });
         const delta = preview.deltas[k];
         if (delta && delta > 0) tok.tint = 0x44cc44;
         else if (delta && delta < 0) tok.tint = 0xcc4444;
         // tok.localX / localY set per cursor; attach to header frame
       }
       ```
       Width-based xCursor advancement requires reading the BitmapText's resolved width post-render — verify pixui exposes `tok.width` or read `tok.internal.width`.
     - Line 3: kit line (also colored if preview).
   - **Slot strip** (4 squares at SLOT_STRIP_X[0..3], y=240):
     - Each slot: pixui `Rectangle` (56×56) with rarity-color border + sprite icon (`pixui.Image` if item exists, else label `slot`-name). Click handler if not weapon and not empty.
     - Selection state: gold border (3px) if `_selection.kind === 'equipped-slot' && _selection.slot === slot`, else rarity color (2px).
   - **Slot detail card** (520×60 at CARD_CX=640, y=305): renders before/after item summaries when a pack-item or equipped-slot is selected; renders weapon-slot summary at-rest. Uses `BitmapText` for item names + affixes.
   - **Picker** (540 wide at PICKER_X=640, starting y=345): paged list of pack items (4 visible rows). Each row clickable → sets `_selection = {kind:'pack-item', itemId}; this.scene.restart()`. Page up/down arrows.
   - **Commit button** at (COMMIT_BUTTON_X=850, y=440), 200×28, enabled when `_selection.kind === 'pack-item'` or `'equipped-slot'`. Calls `equipFromStash`/`equipFromPack` or `unequipToStash`/`unequipToPack` based on mode + selection kind, then resets `_selection` and restarts.
5. ESC closes scene; close path branches on `_mode.kind`.

**`pixuiSlotSquare()` extraction decision:** by this point you've seen Equip's main slot strip (56×56, rarity border, icon, label, click) AND its mini-equip-strip in the hero list (22×22, rarity border, no icon, no click). They share rarity-border logic but differ in size/content/interactivity. Verdict during impl: **probably don't extract** — the parameterization (size, has-icon, has-click) makes the helper signature fiddly for ~30 lines saved. Stay inline at both sites.

- [ ] **Step 4: Run typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean; 1730/1730.

- [ ] **Step 5: Note for user — heavy manual smoke**

Verify both modes (barracks + in_run):
- Hero list paginates with arrows
- Selecting a hero updates paperdoll + stats + slot strip
- Clicking a pack item shows before/after preview with colored stat deltas
- Clicking an equipped slot shows unequip preview
- Commit applies the change correctly
- Mini-equip-strip on hero rows shows rarity colors
- Close returns to the right parent (barracks_panel or whichever returnTo)

**Escalation:** if Equip becomes too painful (more than ~1 day of implementation), escalate. Possible decomposition: split into Equip-Left-Pane and Equip-Right-Pane sub-tasks, with the file kept as one but reviewing each pane separately.

---

### Task 7: Retire `panel_layout.ts`

**Why now:** Orphan since 3b. After Equip migrates in Task 6, no scene imports it. Tests for it (`__tests__/panel_layout.test.ts`, 14 tests) also retire.

**Files:**
- Delete: `src/render/panel_layout.ts`
- Delete: `src/render/__tests__/panel_layout.test.ts`

- [ ] **Step 1: Verify zero consumers**

Run: `npx grep -rn "panel_layout" src/ docs/`

Expected: only matches in `docs/` (spec/plan references) and `panel_layout.ts` itself + its test file. No `src/scenes/` or `src/render/` matches outside the file being deleted.

If any consumer is found, STOP and investigate before deleting.

- [ ] **Step 2: Delete the files**

Run: `git rm src/render/panel_layout.ts src/render/__tests__/panel_layout.test.ts`

- [ ] **Step 3: Run typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck clean. Test count: **1730 → 1716** (14 panel-layout tests removed).

- [ ] **Step 4: Run a build smoke**

Run: `npm run build`
Expected: Vite builds dist/ cleanly. (No new test failures, but ensures no production build references the deleted file.)

---

### Task 8: Retire `hero_card.ts`

**Why now:** All 3 consumers (Barracks, Expeditions, camp_screen) migrated in Tasks 3-5. PixuiHeroCard fully replaces it.

**Files:**
- Delete: `src/ui/hero_card.ts`

- [ ] **Step 1: Verify zero consumers**

Run: `npx grep -rn "from '@ui/hero_card'\|from '\\./hero_card'\|HeroCard" src/`

Expected: matches only inside `src/ui/hero_card.ts` itself (the file being deleted), `src/ui/pixui_hero_card.ts` (which has class doc-comment references to "legacy HeroCard" — fine to keep as historical context), and `src/README.md` (which we'll clean up in Task 9).

If any active import or `new HeroCard(...)` instantiation in `src/scenes/` is found, STOP and investigate.

- [ ] **Step 2: Delete the file**

Run: `git rm src/ui/hero_card.ts`

- [ ] **Step 3: Run typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean; 1716/1716.

- [ ] **Step 4: Run a build smoke**

Run: `npm run build`
Expected: builds cleanly.

---

### Task 9: README rewrite (closes Cluster B · 51)

**Why:** The README still describes the pre-pixui asset structure; new contributors are confused by `assets/` (build-time inputs) vs `public/assets/` (runtime-served) without context.

**Files:**
- Modify: `README.md` (new sections + edits)
- Modify: `vite/assets.mjs` (add field comments)
- Modify: `src/README.md` (remove stale references)

- [ ] **Step 1: Read existing README + existing source files for accurate writeup**

Read:
- `README.md` (whole file) — see current structure
- `vite/assets.mjs` — confirm field shape
- `vite.config.ts` — Windows shim implementation (around the `process.platform === 'win32'` check)
- `assets/ui.yaml` and `assets/fonts.yaml` (top-level configs)

- [ ] **Step 2: Update `README.md`** with these new sections (placement: after "How to run" / before existing "Architecture" or similar):

```markdown
## Asset layout

The project has three asset locations, each with a different purpose:

- **`assets/`** — pixui inputs (sprite PNGs + bitmap-font PNGs + YAML manifests).
  Build-time only. Packed into atlases by [pixel-tools](https://www.npmjs.com/package/pixel-tools)
  via the Vite plugin defined in `vite/assets.mjs`. Not served at runtime.
- **`public/assets/`** — runtime-served audio + animated sprites + Phaser spritesheets
  (legacy game assets predating pixui). Vite copies this directory to `dist/assets/`
  unchanged during build.
- **`public/packed_assets/`** — pixel-tools build output (gitignored). Contains
  `mana_soul.png`/`mana_soul.json` (UI atlas) and `fonts.png`/`fonts.json`
  (bitmap-font atlas). Regenerated automatically when files in `assets/` change.

YAML manifests:
- `assets/ui.yaml` — sprite atlas description (frame sizes, slices, output target)
- `assets/fonts.yaml` — bitmap-font character map and source PNG references

## Pixel-tools pipeline

Asset packing runs as part of the Vite dev server / build. Configuration lives in
`vite/assets.mjs`:

```javascript
export const assetsConfig = {
  source_path: "assets",                          // where YAMLs + PNGs live
  destination_path: "public/packed_assets",       // build output directory
  fonts: [{ source: "fonts.yaml" }],              // font manifests
  atlases: [{ source: "ui.yaml", target: "mana_soul" }],  // atlas manifests
};
```

Both YAMLs are watched in dev mode — any change re-packs the affected atlas
without restarting the server.

## Windows shim

pixel-tools ships its CLI binaries as npm `.cmd` shims. Node's `spawnSync`
without `shell: true` can't resolve them on Windows. To work around this,
`vite.config.ts` copies the `.exe` binaries into `node_modules/.cache/pixel-tools-shims/`
at module-load time and prepends that directory to PATH. Linux/Mac unaffected.
```

- [ ] **Step 3: Update `vite/assets.mjs`** with field comments. Read the existing file first; add one-line comments per field (matching the style above).

- [ ] **Step 4: Update `src/README.md`** — remove any references to legacy `hero_card.ts` or `panel_layout.ts`. Read the current `src/README.md`, find lines mentioning these files, and either delete them or replace with the pixui-equivalent reference (e.g., `pixui_hero_card.ts`).

- [ ] **Step 5: Run typecheck + tests + build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: clean; 1716/1716; build succeeds.

---

### Task 10: Final verification + handoff

- [ ] **Step 1: Confirm working-tree contains only 3c-ii changes**

Run: `git status`
Expected modified files (depending on whether the user committed earlier panel migrations as separate commits):
- `src/scenes/perk_overlay_scene.ts`
- `src/scenes/event_overlay_scene.ts`
- `src/scenes/camp_screen_scene.ts`
- `src/scenes/barracks_panel_scene.ts`
- `src/scenes/expeditions_panel_scene.ts`
- `src/scenes/equip_scene.ts`
- `README.md`
- `vite/assets.mjs`
- `src/README.md`

Expected deleted files:
- `src/render/panel_layout.ts`
- `src/render/__tests__/panel_layout.test.ts`
- `src/ui/hero_card.ts`

Expected untracked:
- `docs/superpowers/specs/2026-05-08-pixui-hero-card-panels-design.md` (the spec)
- `docs/superpowers/plans/2026-05-08-pixui-hero-card-panels.md` (this plan)

- [ ] **Step 2: Run final typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run final test suite**

Run: `npm test`
Expected: **1716/1716** pass (1730 - 14 panel-layout tests).

- [ ] **Step 4: Run final build smoke**

Run: `npm run build`
Expected: builds dist/ successfully.

- [ ] **Step 5: Hand off to user**

Surface to user:

> 3c-ii implementation complete. 6 panels migrated to pixui (Perk, Event, camp_screen, Barracks, Expeditions, Equip); `panel_layout.ts` retired (+ 14 tests); `hero_card.ts` retired; README rewrites cover the post-pixui asset structure (closes Cluster B · 51). Working tree clean except for the migration changes. 1716/1716 tests pass; typecheck clean; build succeeds. Ready for review and commit. Cluster B · 45 closes.

---

## Self-Review

**1. Spec coverage:**
- ✅ PerkOverlay migration with `pixui.Button` perk cards (Q3-A) — Task 1
- ✅ EventOverlay migration with 3-state machine — Task 2
- ✅ camp_screen full-scene migration with 3-button row — Task 3
- ✅ Barracks migration with HeroCard slot grid + Paperdoll detail + Dialog retire — Task 4
- ✅ Expeditions migration with drag-and-drop using `pointer.x/y` — Task 5
- ✅ Equip migration with multi-instance BitmapText for colored stat deltas — Task 6
- ✅ panel_layout.ts retirement + 14 tests — Task 7
- ✅ hero_card.ts retirement — Task 8
- ✅ README rewrite + vite/assets.mjs comments + src/README.md cleanup — Task 9
- ✅ Final verification + handoff — Task 10
- ✅ paperdoll.ts STAYS — confirmed in spec out-of-scope; not deleted in any task
- ✅ pixuiSlotSquare() extraction decision flagged at impl-time in Tasks 4 + 6
- ✅ Smallest-first ordering (Q4-A) — Tasks 1 → 6 in size order
- ✅ No commit steps (matches user policy "never commit without explicit direction")

**2. Placeholder scan:**
- No "TBD" / "implement later" / "add appropriate handling" text.
- Two intentional impl-time decisions flagged with diagnostic recipes: `pixui.Button` text-only check on PerkOverlay (Task 1 step 2 — fallback B if cramped); `pixuiSlotSquare()` extraction at Tasks 4+6 (decided based on shape comparison).
- No abstract "similar to Task N" references — each task is self-contained with code blocks where needed.

**3. Type consistency:**
- Module-level state names consistent across tasks: `_overlayState` (Task 2), `_selectedHeroId` + `_confirmRetirePending` (Task 4), `_stage` + `_selectedDungeonId` + `_formation` (Task 5), `_selection` + `_selectedHeroId` + `_heroListPageStart` + `_pickerPageStart` + `_mode` (Task 6).
- `PixuiHeroCard` constructor signature consistent with 3c-i (`(scene, hero, opts)` with `opts.size`, `opts.draggable`, `opts.isDead`, `opts.onClick`).
- `pixui.Button` config consistent (`{x, y, width, height, text, enabled, onClick}`) across Tasks 1, 3, 4, 5, 6.
- `card.events` API usage consistent (Tasks 5: `dragstart`/`drag`/`drop`/`dragend`).
- Drop-target identification pattern consistent (Task 5: `slotDropZones.indexOf(dropZone)`).
- Test count math consistent: 1730 → 1716 across Tasks 7 and 10.

No issues found.
