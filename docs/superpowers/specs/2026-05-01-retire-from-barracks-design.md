# Retire hero from Barracks — Design

- **TODO entry:** Cluster B · 14 (Retire hero from Barracks).
- **Tier:** 2.
- **Date:** 2026-05-01.

## 1 · Scope

Add a destructive **Retire** button to the Barracks detail pane next to the existing Equip Gear button. Click → inline two-step confirm (the row's two buttons become "Cancel" + "Confirm Retire", and a red warning line appears above). Confirm runs `removeHero` from `src/camp/roster.ts:32`, persists via `appState.update`, and `scene.restart()`s the Barracks panel so the just-retired hero falls out of the list.

**Out of scope:**

- Modal-overlay or state-machine confirm pattern. Inline two-step is enough for one button → confirm flow; the modal would be tonally heavy next to the casual Equip Gear button, and the `camp_node_overlay`-style state machine is overkill for a single state branch.
- Hard-disabling Retire when the resulting roster size would be < 3. Tavern is one click away; gating is paternalistic. Instead, the warning text appends a notice when roster will drop below the run minimum.
- Tracked / in-place list-pane rebuild. The list pane currently builds untracked empty-slot rectangles in `create()`; refactoring to a tracked container would add ~30 lines for marginal polish on a rarely-hit flow. `scene.restart()` is one line and reads as "something significant just happened" — appropriate framing for a destructive action.
- Confirmation persistence across scene reopens. `confirmRetirePending` is a per-instance field; closing and reopening Barracks resets it. Switching the selected hero also resets it (handled in `selectHero`).
- Data-layer changes. `removeHero` already exists in `roster.ts` and is suitable as-is; it's already called by death/lost handlers in dungeon/camp scenes.

## 2 · Layout

Detail pane bounds: x=495–935, y=90–450 (`DETAIL_PANE_CX = 715`, `DETAIL_PANE_W = 440`, `DETAIL_PANE_CY = 270`, `DETAIL_PANE_H = 360`).

| Element | Position | Size | Bg | Stroke |
|---|---|---|---|---|
| Equip Gear (existing) | `(670, 430)` | 140×32 | `0x335533` | `0x66aa66` |
| Retire (new) | `(820, 430)` | 140×32 | `0x553333` | `0x885555` |

`(820 ± 70)` → x=750–890, fits inside the pane with margin. The destructive red palette matches the close-button corner reds in `buildCloseButton`.

In confirm state the same two slots host different buttons (see §4).

## 3 · Scene state

Add one field to `BarracksPanelScene`:

```ts
private confirmRetirePending: boolean = false;
```

Reset paths:

- Field initializer at scene construction → `false` on first `create()`.
- `scene.restart()` after a confirm → field re-initialized to `false`.
- `selectHero(id)` clears it before calling `rebuildDetail()` — switching heroes mid-confirm is an implicit cancel.
- Cancel button click → sets `false` and calls `rebuildDetail()`.

## 4 · Render in `rebuildDetail`

Replace the existing Equip-Gear-only button block at the end of `rebuildDetail` (currently lines 351–370) with a branch on `this.confirmRetirePending`:

```ts
if (!this.confirmRetirePending) {
  this.renderActionRow(hero);
} else {
  this.renderConfirmRow(hero);
}
```

### `renderActionRow(hero: Hero): void`

Renders the existing Equip Gear button (unchanged from today) PLUS a new Retire button at `(820, 430)`:

```ts
// Equip Gear — existing block, unchanged
const equipBtn = this.add
  .rectangle(DETAIL_TEXT_X + 80, 430, 140, 32, 0x335533)
  .setStrokeStyle(2, 0x66aa66);
this.detailContainer.add(equipBtn);
this.detailContainer.add(
  this.add
    .text(DETAIL_TEXT_X + 80, 430, 'Equip Gear', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
    })
    .setOrigin(0.5),
);
equipBtn.setInteractive({ useHandCursor: true });
equipBtn.on('pointerdown', () => {
  this.scene.launch('barracks_equip', { heroId: hero.id });
  this.scene.pause();
});

// Retire — new
const retireBtn = this.add
  .rectangle(DETAIL_TEXT_X + 230, 430, 140, 32, 0x553333)
  .setStrokeStyle(2, 0x885555);
this.detailContainer.add(retireBtn);
this.detailContainer.add(
  this.add
    .text(DETAIL_TEXT_X + 230, 430, 'Retire', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
    })
    .setOrigin(0.5),
);
retireBtn.setInteractive({ useHandCursor: true });
retireBtn.on('pointerdown', () => {
  this.confirmRetirePending = true;
  this.rebuildDetail();
});
```

`DETAIL_TEXT_X = 590`, so `+80 = 670` (Equip Gear, unchanged) and `+230 = 820` (Retire, new). Reusing the existing `+80` offset reads as "this row is anchored relative to the hero's text column."

### `renderConfirmRow(hero: Hero): void`

Renders the warning text above the row, then Cancel + Confirm Retire in the same two slots:

```ts
const rosterLen = appState.get().roster.heroes.length;
let warning = `Retire ${hero.name}? Hero is gone forever. No refund.`;
if (rosterLen - 1 < 3) {
  warning += ' ⚠ Roster will drop below 3 — recruit at the Tavern before starting a run.';
}

this.detailContainer.add(
  this.add
    .text(DETAIL_PANE_CX, 405, warning, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ff6666',
      align: 'center',
      wordWrap: { width: 400 },
    })
    .setOrigin(0.5, 1),
);

// Cancel — slot 1, muted gray
const cancelBtn = this.add
  .rectangle(DETAIL_TEXT_X + 80, 430, 140, 32, 0x444444)
  .setStrokeStyle(2, 0x888888);
this.detailContainer.add(cancelBtn);
this.detailContainer.add(
  this.add
    .text(DETAIL_TEXT_X + 80, 430, 'Cancel', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
    })
    .setOrigin(0.5),
);
cancelBtn.setInteractive({ useHandCursor: true });
cancelBtn.on('pointerdown', () => {
  this.confirmRetirePending = false;
  this.rebuildDetail();
});

// Confirm Retire — slot 2, destructive red
const confirmBtn = this.add
  .rectangle(DETAIL_TEXT_X + 230, 430, 140, 32, 0x553333)
  .setStrokeStyle(2, 0x885555);
this.detailContainer.add(confirmBtn);
this.detailContainer.add(
  this.add
    .text(DETAIL_TEXT_X + 230, 430, 'Confirm Retire', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
    })
    .setOrigin(0.5),
);
confirmBtn.setInteractive({ useHandCursor: true });
confirmBtn.on('pointerdown', () => {
  appState.update((s) => ({ ...s, roster: removeHero(s.roster, hero.id) }));
  this.scene.restart();
});
```

Warning text positioning:

- x = `DETAIL_PANE_CX` (= 715), the detail-pane center. The two button centers are at 670 and 820; their midpoint is 745, but anchoring on the pane center reads cleaner and the 30px offset is invisible at this scale.
- y = 405 with `setOrigin(0.5, 1)` — bottom-anchored, so the text grows upward when wordWrap creates extra lines. ~16px between the text baseline (y≈405) and the button row top (y=430-16=414) is enough for a single 12px line; multi-line wraps push text into the abilities region above. That's acceptable for the rare confirm-state moment.

### Helper-vs-inline

Whether to extract `renderActionRow` / `renderConfirmRow` as private methods or inline the branch directly in `rebuildDetail` is left to the implementer. Either is fine; the helpers keep `rebuildDetail` shorter and make the state-branch obvious, but the codebase doesn't have strong precedent either way. The plan can pick.

## 5 · `selectHero` change

`selectHero` (line 171) needs to clear `confirmRetirePending` so switching heroes mid-confirm cancels the pending retire:

```ts
private selectHero(id: string | null): void {
  this.selectedHeroId = id;
  this.confirmRetirePending = false;
  this.refreshSelectionHighlights();
  this.rebuildDetail();
}
```

One added line. Without it, selecting hero B while confirm is pending on hero A would render the confirm UI for B (because `rebuildDetail` re-reads the field), and clicking Confirm would retire B instead of A — silent footgun.

## 6 · Imports

Add to the top of `src/scenes/barracks_panel_scene.ts`:

```ts
import { listHeroes, removeHero } from '../camp/roster';
```

(`listHeroes` is already imported; just add `removeHero` to the same line.)

## 7 · Files touched

| File | Change |
|---|---|
| `src/scenes/barracks_panel_scene.ts` | Add `confirmRetirePending` field; clear it in `selectHero`; replace the existing Equip-Gear-only button block in `rebuildDetail` with a state-branch rendering either the action row (Equip Gear + Retire) or the confirm row (warning + Cancel + Confirm Retire). Add `removeHero` to the existing `'../camp/roster'` import. |

No other files touched. No save schema change. No test infrastructure change. No data-layer change.

## 8 · Test plan

No unit tests (Phaser scene/UI convention; matches Cluster B · 13, 15, 16, 17 and the equip-from-stash, hospital, camp-node-UI tasks). The new behavior is a UI state toggle around an already-tested `removeHero` call.

**Acceptance:**

- `npx tsc --noEmit` green.
- `npm run build` succeeds.
- `npm test` stays green.

**Manual play verification:**

- Open Barracks with 4+ heroes. Detail pane shows Equip Gear + Retire side by side. Retire button is destructive red.
- Click Retire. Buttons swap to Cancel (gray) + Confirm Retire (red). Warning line appears above in red, single line, ending with "No refund."
- Click Cancel. Buttons revert to Equip Gear + Retire. No state change.
- Click Retire → click a different hero in the list. Detail pane rebuilds for the new hero in normal state (Equip Gear + Retire), confirm pending cleared.
- Click Retire → click Confirm Retire. Scene restarts. The retired hero is gone from the list. The first remaining hero is selected. Title text shows updated `N / capacity`.
- Open Barracks with exactly 3 heroes. Click Retire on any. Warning text wraps to multiple lines and includes the "⚠ Roster will drop below 3" notice. Confirm proceeds normally; post-confirm the title shows `2 / 12` and the list has 2 cards + 10 empty slots.
- Open Barracks with 1 hero. Click Retire → Confirm. Scene restarts; "No heroes — visit the Tavern to recruit." message renders in the detail pane.
- Open Barracks → Equip Gear → exit BarracksEquipScene back to Barracks. Detail pane resumes via the existing RESUME handler in normal state (no confirm pending — it never was).
- ESC closes Barracks normally; reopening starts in normal state regardless of prior confirm-pending state in the same session (scene state resets per `create()`).

## 9 · Risk

Low. Single-file additive change. No combat-resolution, save-schema, or data-layer touches. `scene.restart()` is idempotent and the scene already exercises full reconstruction via the existing `create()` path. The only subtle interaction is the `selectHero` clear (§5), called out explicitly to prevent the cross-hero footgun.

## 10 · Open questions

None at design time.
