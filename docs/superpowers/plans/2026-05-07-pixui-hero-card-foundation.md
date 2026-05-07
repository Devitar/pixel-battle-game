# PixuiHeroCard Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add wound-badge + tap-to-toggle tooltip and a `draggable` mode to `PixuiHeroCard`, closing Cluster B · 53 and unblocking the 3c-ii panel migrations.

**Architecture:** All changes land in one file (`src/ui/pixui_hero_card.ts`). The wound badge + tooltip are Phaser-rooted GameObjects held in a single `phaserOverlay` Phaser Container parented to scene root, with position synced via an override of pixui's `Component.updatePosition()` hook. The draggable mode threads `draggable: true` through the internal pixui `Clickable` and exposes its `events` EventEmitter publicly so consumers can bind Phaser drag events directly.

**Tech Stack:** TypeScript 5, phaser-pixui (^0.2.x), Phaser 3.

**Spec:** [`docs/superpowers/specs/2026-05-07-pixui-hero-card-foundation-design.md`](../specs/2026-05-07-pixui-hero-card-foundation-design.md).

**Project conventions worth knowing:**
- **No commits without explicit user direction** — leave changes in working tree at end of each task; do NOT run `git add` / `git commit`. The user batch-commits.
- **No new tests for pixui scenes/widgets** — matches sub-spec 3a/3b. Verification = typecheck + targeted test run + manual browser smoke.
- **Type-checking command:** `npx tsc --noEmit`.
- **Test command:** `npm test` (Vitest in CI mode). Single test: `npx vitest run path/to/file.test.ts`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/ui/pixui_hero_card.ts` | Modify | All foundation work — wound badge, tooltip toggle, position sync, draggable mode, public events |

No new files. No tests added (matches existing pixui-scene/widget pattern).

---

### Task 1: Promote Clickable to a private field + add `draggable` option

**Why first:** Subsequent tasks need `this.clickable` accessible; defining the field shape early avoids churning the class structure mid-plan.

**Files:**
- Modify: `src/ui/pixui_hero_card.ts:15-19` (add option), `src/ui/pixui_hero_card.ts:48-58` (add field), `src/ui/pixui_hero_card.ts:172-182` (use field, pass draggable)

- [ ] **Step 1: Add `draggable` to the options interface**

In `src/ui/pixui_hero_card.ts`, replace lines 15-19 (the `PixuiHeroCardOptions` interface):

```typescript
export interface PixuiHeroCardOptions {
  size: PixuiHeroCardSize;
  isDead?: boolean;
  onClick?: () => void;
  draggable?: boolean;
}
```

- [ ] **Step 2: Add `clickable` private field on the class**

After line 49 (`private opts: PixuiHeroCardOptions;`), add:

```typescript
  private clickable!: Clickable;
```

The `!` definite-assignment assertion is fine because `clickable` is always created in `build()` which is called from the constructor.

- [ ] **Step 3: Replace the local `clickable` const with the field assignment + thread `draggable`**

Replace lines 172-182 (the existing Clickable construction block):

```typescript
    // Clickable overlay — covers the whole card, on top of everything.
    // When draggable=true, Phaser drag events (dragstart/drag/drop/dragend)
    // fire on this Clickable's events EventEmitter automatically — exposed
    // via the public `events` getter for consumers like Expeditions.
    this.clickable = new Clickable(this.scene, {
      width: w,
      height: h,
      draggable: this.opts.draggable ?? false,
      onClick: this.opts.onClick,
    });
    this.attach(this.clickable);
```

(Note: the existing `clickable.events.on('pointerover'/'pointerout', ...)` lines and the `onPointerOver`/`onPointerOut` no-op methods are removed — they were placeholder hover hooks that never resolved into real behavior. Cluster B · 53's tooltip lives on the wound badge, not on card hover.)

- [ ] **Step 4: Remove the dead `onPointerOver` and `onPointerOut` methods**

Delete lines 185-195 (both methods + their comments). The class ends at the closing brace.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: 1730/1730 pass (matches 3b's count). No regressions.

---

### Task 2: Expose public `events` getter

**Why:** Consumers (Expeditions, in 3c-ii) need to bind Phaser drag events. Phaser fires drag events on the Clickable's hit-area's EventEmitter, which IS pixui's `Clickable.events`. We expose that as a public getter.

**Files:**
- Modify: `src/ui/pixui_hero_card.ts:1-2` (import), `src/ui/pixui_hero_card.ts` (add getter near the field declarations)

- [ ] **Step 1: Add `Events` to the type-only Phaser import**

Replace line 2:

```typescript
import type { Scene, Events } from 'phaser';
```

- [ ] **Step 2: Add the public `events` getter**

After the `clickable!: Clickable;` field declaration (added in Task 1), and before the constructor, add:

```typescript
  /**
   * Public passthrough to the internal Clickable's events EventEmitter.
   *
   * When `draggable: true` is set in options, Phaser fires drag events on
   * this EventEmitter automatically:
   *
   *   card.events.on('dragstart', (pointer) => ...);
   *   card.events.on('drag', (pointer, dragX, dragY) => { card.localX = ...; });
   *   card.events.on('drop', (pointer, dropZone) => ...);
   *   card.events.on('dragend', (pointer, dropped) => ...);
   *
   * Drop-target identification: Phaser fires the per-GameObject 'drop' event
   * here with the `dropZone` GameObject; consumers map dropZone → slot index
   * using their own slot ownership. PixuiHeroCard owns the source-of-drag
   * identity (`this`).
   */
  get events(): Events.EventEmitter {
    return this.clickable.events;
  }
```

- [ ] **Step 3: Run typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck clean; 1730/1730 pass.

---

### Task 3: Add wound-badge primitives (Phaser overlay container + interactive text)

**Why:** Cluster B · 53 — the `🩸 N` badge that renders top-right of the card when the hero has wounds. Built only when `wounds.length > 0 && !isDead`. Tooltip wiring is in Task 5.

**Files:**
- Modify: `src/ui/pixui_hero_card.ts` (imports, fields, badge constants, build hook)

- [ ] **Step 1: Add the wounds data import**

After line 5 (the existing `TRAITS` import), add:

```typescript
import { WOUNDS, describeWoundEffect } from '@data/wounds';
```

(`describeWoundEffect` is used in Task 5; safe to import now.)

- [ ] **Step 2: Add badge offset constants**

After the existing `LARGE_W`/`LARGE_H` constants block (around lines 26-27), add:

```typescript
// Wound-badge offsets — match legacy HeroCard's badge placement (top-right of card).
const BADGE_OFFSET_X_SMALL = 75;
const BADGE_OFFSET_Y_SMALL = -22;
const BADGE_OFFSET_X_LARGE = 125;
const BADGE_OFFSET_Y_LARGE = -48;
```

- [ ] **Step 3: Add the Phaser-overlay private fields**

In the class, alongside the other private fields (after `clickable!: Clickable;` from Task 1), add:

```typescript
  // Phaser-rooted overlay holding the wound badge + active tooltip. Parented
  // to scene root; auto-destroyed on scene shutdown. Position synced to
  // PixuiHeroCard's resolved world coords via updatePosition() override
  // (Task 4). Only created when the hero has wounds and isn't dead.
  private phaserOverlay?: Phaser.GameObjects.Container;
  private woundBadge?: Phaser.GameObjects.Text;
  private tooltipChild?: Phaser.GameObjects.Container;
```

(The `Phaser.GameObjects.Container`/`.Text` references work without an extra import because the existing `import type { Scene } from 'phaser'` is in the file; the global Phaser namespace is available at the type level via `phaser`'s declaration. If typecheck complains, replace with `import type * as Phaser from 'phaser'`.)

- [ ] **Step 4: Add the `buildPhaserOverlay()` method**

Inside the class, add this method (place it after `build()` but before any other methods you'll add later):

```typescript
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
```

(`toggleWoundTooltip` is implemented in Task 5; until then the pointerdown handler will reference an undefined method. Skip the typecheck after this step alone — Tasks 3, 4, and 5 must all land before the file typechecks cleanly. If you want incremental verification, you can stub `toggleWoundTooltip` here as a no-op and replace it in Task 5.)

- [ ] **Step 5: Stub `toggleWoundTooltip` as a no-op so the file typechecks before Task 5**

Add this stub method right after `buildPhaserOverlay`:

```typescript
  private toggleWoundTooltip(_badgeX: number, _badgeY: number): void {
    // Implemented in Task 5.
  }
```

- [ ] **Step 6: Wire `buildPhaserOverlay()` into `build()`**

At the end of `build()` (just before the closing brace at line 183), add:

```typescript
    if (this.hero.wounds.length > 0 && !this.opts.isDead) {
      this.buildPhaserOverlay();
    }
```

- [ ] **Step 7: Run typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck clean; 1730/1730 pass.

---

### Task 4: Override `updatePosition()` to sync overlay to card's resolved position

**Why:** pixui resolves layout *after* the constructor (via `Container.reposition()` from the parent calling `child.reposition(...)` which calls `child.updatePosition()`). The phaserOverlay's Phaser-side `setPosition` must mirror `this.x`/`this.y` whenever pixui repositions the card.

**Files:**
- Modify: `src/ui/pixui_hero_card.ts` (add the override method on the class)

- [ ] **Step 1: Add the `updatePosition()` override**

Inside the class, add this method (place it adjacent to `build()`):

```typescript
  protected override updatePosition(): void {
    super.updatePosition();
    this.phaserOverlay?.setPosition(this.x, this.y);
  }
```

The `super.updatePosition()` call preserves pixui's Container child-repositioning logic (which iterates `_children` and recursively repositions them — verified in `node_modules/phaser-pixui/dist/index.js:448-466`).

- [ ] **Step 2: Run typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck clean; 1730/1730 pass.

---

### Task 5: Implement `toggleWoundTooltip()` via existing `createTooltip()`

**Why:** Tap-to-toggle the wound-details tooltip on the badge. Reuses the existing `createTooltip()` helper unchanged — it already accepts a `Phaser.GameObjects.Container` parent (our `phaserOverlay`), and its destruction-cascade lifecycle works because Phaser destroys child GameObjects when their parent is destroyed.

**Files:**
- Modify: `src/ui/pixui_hero_card.ts` (add tooltip import, replace stub method)

- [ ] **Step 1: Add the `createTooltip` import**

After the `PixuiPaperdoll` import on line 7, add:

```typescript
import { createTooltip } from './tooltip';
```

- [ ] **Step 2: Replace the `toggleWoundTooltip` stub with the real implementation**

Replace the stub from Task 3 with:

```typescript
  // Tap-to-toggle wound-details tooltip on the badge. Same UX as legacy
  // HeroCard. Tooltip is parented to phaserOverlay so destruction cascades:
  // dismissing destroys the tooltip; scene shutdown destroys the overlay
  // (and the tooltip with it).
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
    this.tooltipChild = createTooltip(
      this.scene,
      this.phaserOverlay,
      badgeX - 30,
      badgeY,
      lines,
    );
  }
```

The `badgeX - 30` matches legacy `HeroCard`'s anchor offset (legacy: `this.toggleTooltip(badgeX - 30, badgeY, lines)` — see `src/ui/hero_card.ts:183`).

- [ ] **Step 3: Run typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck clean; 1730/1730 pass.

---

### Task 6: Update class-level doc comment with constraints

**Why:** Document the lifetime rules and misuse warnings discovered during design — future maintainers (and 3c-ii consumers) need to know these.

**Files:**
- Modify: `src/ui/pixui_hero_card.ts:34-46` (the existing class doc comment)

- [ ] **Step 1: Replace the existing class doc comment**

Replace lines 34-46 (the existing `/** ... */` block immediately above `export class PixuiHeroCard`) with:

```typescript
/**
 * pixui-native hero card — Container of PixuiPaperdoll + BitmapText labels +
 * Rectangle HP bar + Clickable overlay. Same external API as legacy HeroCard.
 *
 * Why BitmapText/Rectangle instead of TextArea/Progress: those are
 * StyledComponents whose constructors require an InsertContext (not a Scene).
 * BitmapText and Rectangle take Scene directly and are the correct primitives
 * for a self-contained Container subclass.
 *
 * Wound badge + tooltip (Cluster B · 53):
 * - When `hero.wounds.length > 0 && !opts.isDead`, a `🩸 N` badge renders
 *   top-right of the card. Tap toggles a Phaser-rooted tooltip listing each
 *   wound's name + effect.
 * - Badge + tooltip live in a single scene-rooted Phaser.GameObjects.Container
 *   (`phaserOverlay`) whose position is synced to this card's resolved world
 *   coords via the `updatePosition()` override.
 *
 * Draggable mode:
 * - Pass `draggable: true` in options to enable Phaser drag-and-drop. Phaser
 *   drag events fire on the public `events` EventEmitter automatically.
 *
 * Lifetime constraints (load-bearing):
 * - PixuiHeroCard's Phaser-rooted children rely on `scene.restart()` for
 *   cleanup. Don't destroy a single PixuiHeroCard instance without restarting
 *   the scene — phaserOverlay would leak.
 * - PixuiHeroCard has no setHero() / in-place rebuild. pixui's Container has
 *   no clear() primitive; rebuild via scene.restart() (Tavern's pattern) or
 *   construct a fresh PixuiHeroCard.
 * - For the wound badge to position correctly, the card must be `attach`ed
 *   into a pixui-rooted parent so `updatePosition()` fires. A constructed-
 *   but-never-attached card with wounds will render its badge at (0, 0).
 */
```

- [ ] **Step 2: Run typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck clean; 1730/1730 pass.

---

### Task 7: Manual verification — wounded card + tooltip flow

**Why:** No production consumer of the wound badge exists until 3c-ii. Verify by injecting a temporary mock-wounded candidate in Tavern, observe in browser, revert.

**Files (temporary mutations, NOT committed):**
- Modify: `src/scenes/tavern_panel_scene.ts:122` (the `new PixuiHeroCard(...)` call) — temp only, revert after

- [ ] **Step 1: Apply the mock-wounded mutation**

In `src/scenes/tavern_panel_scene.ts`, locate line 122:

```typescript
const card = new PixuiHeroCard(this, candidate, { size: 'small' });
```

Temporarily replace with:

```typescript
const candidateWithWounds = i === 0
  ? { ...candidate, wounds: [{ id: 'bruised' as const }, { id: 'concussed' as const }] }
  : candidate;
const card = new PixuiHeroCard(this, candidateWithWounds, { size: 'small' });
```

This injects 2 mock wounds into the first candidate only.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (If the `Hero.wounds` type rejects `{id: 'bruised' as const}`, broaden the cast — read `src/heroes/hero.ts` for the actual `Wound` type and adjust. The `as const` lets `id` keep its literal type for the `WOUNDS[w.id]` lookup.)

- [ ] **Step 3: Run dev server**

Run: `npm run dev`
Expected: Vite serves at http://localhost:5173.

- [ ] **Step 4: Manual verification in browser**

Navigate through the game to open the Tavern panel. Verify:
- The first candidate card shows a `🩸 2` red badge in its top-right corner.
- Tapping the badge opens a tooltip listing both wounds (name + effect description) above the badge.
- Tapping the badge again dismisses the tooltip.
- Closing Tavern and reopening it (re-entering the panel) re-renders the badge correctly with no leaked overlays from the previous session.
- Re-rolling candidates (if first candidate gets re-rolled out of slot 0) re-creates the badge correctly on the new occupant.
- DevTools console: no errors.

If any of these fail, stop and diagnose before proceeding. Likely failure modes:
  - Badge rendering at (0, 0) → `updatePosition()` not firing; check Task 4's override.
  - Tooltip rendering off-screen → `badgeX - 30` anchor offset doesn't compose with phaserOverlay's transform; consider parenting tooltip to scene root with absolute world coords (Risk 4 in spec).
  - Overlay leaking on re-roll → scene.restart() ordering; verify pixui's `_root._initialized` reset still runs (read `src/render/pixui_canvas_fix.ts`).

- [ ] **Step 5: Revert the mock-wounded mutation**

Restore `src/scenes/tavern_panel_scene.ts:122` to:

```typescript
const card = new PixuiHeroCard(this, candidate, { size: 'small' });
```

Verify with `git diff src/scenes/tavern_panel_scene.ts` — should show no changes.

---

### Task 8: Manual verification — draggable flow

**Why:** Same rationale as Task 7 — no production consumer of `draggable: true` until 3c-ii Expeditions. Verify the events surface fires and the card follows the pointer.

**Files (temporary mutations, NOT committed):**
- Modify: `src/scenes/tavern_panel_scene.ts:122-123` — temp only, revert after

- [ ] **Step 1: Apply the draggable mutation**

In `src/scenes/tavern_panel_scene.ts`, replace line 122-123:

```typescript
const card = new PixuiHeroCard(this, candidate, { size: 'small' });
slot.attach(card);
```

with:

```typescript
const card = new PixuiHeroCard(this, candidate, { size: 'small', draggable: true });
slot.attach(card);
card.events.on('dragstart', () => console.log('[drag] start'));
card.events.on('drag', (_p: Phaser.Input.Pointer, dx: number, dy: number) => {
  // Translate canvas-absolute drag coords to slot-frame-relative.
  // Slot frame is centered at (480 + slotXFromCenter, 270 + (-20)) per the
  // surrounding insert.center.frame call.
  card.localX = dx - (480 + slotXFromCenter);
  card.localY = dy - (270 - 20);
});
card.events.on('drop', (_p: Phaser.Input.Pointer, zone: Phaser.GameObjects.GameObject) => {
  console.log('[drag] dropped on', zone);
});
card.events.on('dragend', (_p: Phaser.Input.Pointer, dropped: boolean) => {
  console.log('[drag] end · dropped=', dropped);
});
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run dev server + verify in browser**

Run: `npm run dev`

In Tavern, click-drag a candidate card with the mouse. Verify:
- DevTools console logs `[drag] start` on mousedown.
- The card visibly follows the pointer during drag.
- Console logs `[drag] end · dropped= false` on mouseup (no drop zone exists, so `dropped` is false). The card snaps back to its slot position on the next scene reflow (or stays at the dropped location until re-roll — both are acceptable for this verification).
- No console errors. No drag-related visual glitches (the badge from Task 7's hero, if still mutated, follows the card thanks to `updatePosition()` sync).

If drag events don't fire, the most likely cause is that pixui's hit area isn't picking up Phaser's input — check that `Clickable`'s `draggable: true` propagates to the underlying Phaser hit area. Source-read `node_modules/phaser-pixui/dist/index.js:282-340` if needed.

- [ ] **Step 4: Revert the draggable mutation**

Restore lines 122-123 to:

```typescript
const card = new PixuiHeroCard(this, candidate, { size: 'small' });
slot.attach(card);
```

Verify with `git diff src/scenes/tavern_panel_scene.ts` — should show no changes.

---

### Task 9: Final verification + handoff

- [ ] **Step 1: Confirm working tree contains only the foundation changes**

Run: `git status`
Expected: only `src/ui/pixui_hero_card.ts` modified. (The spec doc and plan doc may also appear if not yet committed — that's fine.)

If anything else shows up, investigate before handing off.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: 1730/1730 pass (matches sub-spec 3b's count).

- [ ] **Step 4: Hand off to user for review + commit**

Working-tree changes are ready for review. Per project policy, the engineer does NOT commit. Surface to user:

> 3c-i implementation complete. `src/ui/pixui_hero_card.ts` modified; spec follow-ups (#53 closed, #46–52 / #54–57 still open per their own scope). Manual verification via temporary Tavern mutations passed (badge + tooltip + draggable). Working tree clean except for `src/ui/pixui_hero_card.ts`. 1730/1730 tests pass; typecheck clean. Ready for review and commit.

---

## Self-Review

**Spec coverage:**
- ✅ Wound badge (top-right of card, only when wounds.length > 0 && !isDead) — Task 3
- ✅ Tap-to-toggle tooltip via createTooltip() — Task 5
- ✅ phaserOverlay parented to scene root, position synced via updatePosition() — Tasks 3, 4
- ✅ `draggable?: boolean` option on PixuiHeroCardOptions — Task 1
- ✅ Public `events` getter — Task 2
- ✅ Drop-target identification via per-GameObject drop event — documented in Task 2's getter doc + Task 8 verification
- ✅ Lifetime warnings in source comment — Task 6
- ✅ Manual verification via Tavern temp mutation — Tasks 7, 8
- ✅ Final typecheck + test pass — Task 9
- ✅ No commit step (matches project policy) — Task 9 hands off to user

**Placeholder scan:** No "TBD" / "implement later" / "add appropriate handling" text in tasks. Every code block is concrete. Two intentional impl-time investigations are flagged with diagnostic recipes (not placeholders): "if typecheck rejects the wound cast, broaden the type" (Task 7 step 2), "if drag events don't fire, source-read pixui Interactive" (Task 8 step 3).

**Type consistency:**
- `PixuiHeroCardOptions.draggable?: boolean` — Task 1 defines, Task 8 uses ✓
- `clickable: Clickable` private field — Task 1 defines, Task 2 reads via getter ✓
- `events: Events.EventEmitter` — Task 2 defines, Task 8 binds to it ✓
- `phaserOverlay`, `woundBadge`, `tooltipChild` — Task 3 defines, Tasks 4 & 5 use ✓
- `updatePosition()` override signature `protected override updatePosition(): void` — Task 4 ✓
- `toggleWoundTooltip(badgeX: number, badgeY: number): void` — Task 3 stubs, Task 5 implements with same signature ✓
- `createTooltip` signature `(scene, parent, anchorX, anchorY, lines)` — Task 5 calls with `(this.scene, this.phaserOverlay, badgeX - 30, badgeY, lines)` matching `src/ui/tooltip.ts:18-24` ✓
- Wound IDs `'bruised'` / `'concussed'` — verified to exist in `src/data/wounds.ts:4,14` ✓

**Risks acknowledged inline:** Tasks 4 (updatePosition timing), 7 (badge positioning), 8 (drag event firing) each include diagnostic recipes if the happy path fails — matches the spec's risks 1–4.

No issues found.
