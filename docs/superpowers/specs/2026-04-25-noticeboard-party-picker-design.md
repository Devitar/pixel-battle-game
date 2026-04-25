# Noticeboard & Party Picker (Tier 1)

**Status:** Design · **Date:** 2026-04-25 · **Source TODO:** Cluster B, task 15

## Purpose

Replace task 12's `NoticeboardPanelScene` stub with the real "begin a run" entry point: a two-stage panel that takes the player from picking a dungeon (Tier 1: only The Crypt) through assigning three roster heroes to formation slots, then constructs `RunState` + `runRngState` and transitions to the dungeon scene. The first scene that uses Phaser's drag-and-drop input system, and the first scene to leave camp via `scene.start` (rather than `scene.resume('camp')`).

## Dependencies and invariants

**Vocabulary from prior tasks:**
- `appState` singleton (task 10), `appState.update(producer)` for atomic state changes with auto-save.
- `startRun(dungeonId, party, seed, rng)` (task 6) — produces `RunState`; throws if `party.length !== 3`.
- `RunState` shape (task 6): `dungeonId`, `seed`, `party`, `pack`, `currentFloorNumber`, `currentFloorNodes`, `currentNodeIndex`, `status`, `fallen`.
- `listHeroes`, `Roster` (task 7).
- `DUNGEONS` (task 5) — Tier 1 has only `'crypt'`.
- `createRng(seed)` and `rng.getState()` (tasks 1 + 9).
- Save invariant (task 9, `save.ts:20`): `runState` and `runRngState` must be both present or both absent.
- `HeroCard` (task 11) — `small` variant used here.
- Phaser overlay pattern (task 12): `scene.launch('noticeboard_panel')` from camp pauses camp; close = `scene.stop()` + `scene.resume('camp')`.

**New invariants this spec declares:**
- **Two stages, one scene.** `'dungeon_list'` → `'party_picker'`. Stage transitions tear down + rebuild stage-specific game objects via a `stageContainer`. Common chrome (overlay, panel, title text, close ×) persists across swaps.
- **Formation reset on stage entry.** Re-entering the picker (back-then-forward) starts with an empty `formation = [null, null, null]`. Selection state is not persisted across panel opens.
- **Render from state, always.** Drag visuals can drift during a drag, but every drop / cancel triggers `refreshPickerLayout()` which repositions all cards based on the canonical `formation` + `eligibleHeroes` data. Non-dragged cards re-flow when an eligible card is lifted out of the grid.
- **Atomic descend.** A single `appState.update` writes both `runState` and `runRngState` to honor the save pairing invariant.
- **Descend leaves camp.** `scene.stop(); scene.start('dungeon')` — not `scene.resume('camp')`. Camp will be re-created when the dungeon scene returns control.
- **Eligibility is `currentHp > 0`.** No "injured" filter in Tier 1 (no wound system yet — Tier 2 territory).
- **Tier 1 dungeon-list shows one item.** Single centered `Crypt` card. Tier 2 swaps for a vertical list of identical-shape cards.
- **Drop-zone identity carried via `setData`.** Each drop zone has `setData('slotIndex', i)`; each draggable hero handle has `setData('heroId', id)`. Scene-level `drop` handler reads both to perform the assignment.

## Module layout

| Path | Action | Responsibility |
|---|---|---|
| `src/scenes/noticeboard_panel_scene.ts` | **Rewrite** | Replace task 12's stub. Two-stage panel, drag-and-drop assignment, atomic descend. |
| `src/scenes/dungeon_scene.ts` | **Create** | Throwaway stub (key `'dungeon'`). Renders `Dungeon (stub)` + run summary. ESC clears `runState`/`runRngState` and `scene.start('camp')`. |
| `src/main.ts` | **Modify** | Register `DungeonScene` in the scene list. |

**Imports for `noticeboard_panel_scene.ts`:** `phaser`, `appState`, `listHeroes` from camp/roster, `DUNGEONS` from data/dungeons, `startRun` from run/run_state, `HeroCard` from ui/hero_card, `createRng` from util/rng, `Hero` type.

**Imports for `dungeon_scene.ts`:** `phaser`, `appState`.

## Layout (panel coordinates inside 960×540 viewport)

Panel is 920×460 at (480, 270) — same dimensions as Barracks for visual consistency.

### Common chrome (always visible)

| Element | Position (center) | Size | Notes |
|---|---|---|---|
| Overlay | (0, 0) origin | 960×540 | alpha 0.6 black |
| Panel rectangle | (480, 270) | 920×460 | `#222222` fill, `#666666` 2px border. Spans y=40..500. |
| Title | (480, 60) | 18px white | stage-dependent text |
| Close × | (933, 63) | 28×28 | `#553333` bg / `#885555` border / `×` glyph |

### Stage 1 — Dungeon list

| Element | Position (center) | Size | Notes |
|---|---|---|---|
| Title | (480, 60) | 18px | `Noticeboard` |
| Subtitle | (480, 88) | 12px gray | `Choose a dungeon to descend into.` |
| Dungeon card bg | (480, 270) | 460×220 | `#1a1a1a` fill, `#444` 2px border. Hover: border → `#ffcc66`. Click → advance to picker. |
| Dungeon name | (480, 195) origin (0.5, 0) | 22px white | `The Crypt` |
| Theme line | (480, 225) origin (0.5, 0) | 13px gray | `Undead ruins` (from `DUNGEONS.crypt.theme`) |
| Floor count | (480, 250) origin (0.5, 0) | 13px gray | `3 floors` (from `DUNGEONS.crypt.floorLength`) |
| CTA hint | (480, 350) origin (0.5, 0) | 12px tan | `▸ Click to plan an expedition` |

### Stage 2 — Party picker

| Element | Position (center) | Size | Notes |
|---|---|---|---|
| Back button bg | (75, 63) | 90×26 | `#333333` fill, `#666` 1px border, `← Back` 12px white |
| Title | (480, 60) | 18px | `The Crypt — Pick Your Party` |
| Subtitle | (480, 88) | 12px gray | `Drag heroes onto slots. Slot 1 is the front line.` |
| Slot label (×3) | per slot, y=110 | 11px tan | `SLOT 1 — FRONT`, `SLOT 2`, `SLOT 3 — BACK` |
| Slot drop zone (×3) | (170, 165), (480, 165), (790, 165) | 220×80 | `#1a1a1a` fill, `#555` 2px dashed border (empty) / `#ffcc66` 2px solid (filled / drag-hover) |
| Slot empty placeholder | per slot center | 11px gray italic | `drag a hero here` (only when slot empty) |
| Slot occupant card | placed at slot center | 180×56 (small `HeroCard`) | rebuilt by `refreshPickerLayout()` |
| Slot remove × | per slot, top-right corner of zone | 16×16 | `#553333` bg, `×` 12px (only when slot filled) |
| Eligible label | (480, 220) | 12px tan uppercase | `ELIGIBLE ({N})` |
| Eligible card slots | (135, 270 + r*60), (480, 270 + r*60), (825, 270 + r*60), r=0..2 | 180×56 each | 3-col × 3-row grid (max 9 cards — `12 - 3` worst case) |
| Descend button bg | (820, 455) | 180×34 | green when valid (`#2a4a2a` fill / `#44cc44` border / white label) / gray (`#333` / `#555` / `#777`) otherwise |
| Descend button label | same center | 13px | `Descend (N/3)` while filling, `Descend` once 3 slotted |
| Reason text | (820, 475) origin (0.5, 0) | 11px `#cc6666` | shown only when disabled — `Need 3 heroes` |

The slot zones span x=60..280, x=370..590, x=680..900 (90px gaps between adjacent zones, 60px clearance from panel edges). Eligible columns at x=135/480/825 give 165-px gap centers (cards span 180 wide → 165 - 180/2 - 180/2 = -15 — wait, cards at x=135 span x=45..225, x=480 cards span 390..570, x=825 cards span 735..915). Gap between adjacent eligible cards = 390 - 225 = 165. Plenty of breathing room.

## Scene-local state

```ts
type Stage = 'dungeon_list' | 'party_picker';

interface DragVisual {
  card: HeroCard;
  bg: Phaser.GameObjects.Rectangle;
}

private stage: Stage = 'dungeon_list';
private stageContainer!: Phaser.GameObjects.Container;
private titleText!: Phaser.GameObjects.Text;

// Picker stage state
private formation: (Hero | null)[] = [null, null, null];
private eligibleHeroes: Hero[] = [];
private dragVisuals = new Map<string, DragVisual>();
private slotZones: Phaser.GameObjects.Rectangle[] = [];
private slotBorders: Phaser.GameObjects.Rectangle[] = [];
private slotEmptyTexts: Phaser.GameObjects.Text[] = [];
private slotRemoveButtons: Phaser.GameObjects.Container[] = [];
private descendButtonBg!: Phaser.GameObjects.Rectangle;
private descendButtonLabel!: Phaser.GameObjects.Text;
private descendReasonText!: Phaser.GameObjects.Text;
```

`stageContainer` parents every stage-specific game object so `setStage` can tear them down with one `removeAll(true)` call. The slot zones / borders / empty texts arrays are kept as scene-local refs (not just inside the container) so `refreshPickerLayout()` can mutate them in place per-frame instead of rebuilding the whole stage.

## `create()` flow

1. Reset per-launch state: `this.stage = 'dungeon_list'; this.formation = [null, null, null]; this.eligibleHeroes = []; this.dragVisuals.clear(); this.slotZones = []; this.slotBorders = []; this.slotEmptyTexts = []; this.slotRemoveButtons = [];` (Phaser scene-instance reuse trap).
2. Build common chrome (overlay, panel, title text placeholder, close ×).
3. Initialize `this.stageContainer = this.add.container(0, 0)`.
4. Register scene-level drag handlers (drag, drop, dragend) — registered once, dispatched only when stage 2 has draggable / drop-zone objects.
5. ESC handler closes the panel.
6. `setStage('dungeon_list')`.

## `setStage(next: Stage)`

```ts
private setStage(next: Stage): void {
  this.stage = next;
  this.stageContainer.removeAll(true);
  this.slotZones = [];
  this.slotBorders = [];
  this.slotEmptyTexts = [];
  this.slotRemoveButtons = [];
  this.dragVisuals.clear();

  if (next === 'dungeon_list') {
    this.titleText.setText('Noticeboard');
    this.buildDungeonListStage();
  } else {
    this.titleText.setText('The Crypt — Pick Your Party');
    this.formation = [null, null, null];
    this.eligibleHeroes = listHeroes(appState.get().roster).filter((h) => h.currentHp > 0);
    this.buildPartyPickerStage();
    this.refreshPickerLayout();
  }
}
```

## `buildDungeonListStage()`

Adds subtitle text, the dungeon card (one rectangle + 4 text objects: name, theme, floor count, CTA hint), all parented to `stageContainer`. The card's background rectangle gets `setInteractive({ useHandCursor: true })`; `pointerover` / `pointerout` swap the border color between `#444` and `#ffcc66`; `pointerdown` calls `setStage('party_picker')`.

## `buildPartyPickerStage()`

1. Build the back button (bg rect + text) — `pointerdown` → `setStage('dungeon_list')`.
2. Build the subtitle + eligible label (label text rebuilt by `refreshPickerLayout` to show count).
3. Build three slot zones:
   - For each `i` in `0..2`: position at `[170, 480, 790][i], 165`. Slot label text above (y=110). The drop-zone rectangle has `setInteractive({ dropZone: true })` and `setData('slotIndex', i)`. A separate dashed-border rectangle underneath provides the visual.
   - The remove × button (Container with bg + text) is built but starts `setVisible(false)` — `refreshPickerLayout` toggles visibility and binds its `pointerdown` handler.
4. Build the Descend button + reason text.
5. Build draggable cards for `this.eligibleHeroes` (positions assigned by `refreshPickerLayout`).

The `dragVisuals` map keys cards by hero id so `placeHeroInSlot` and the cancel-drag handler can locate them.

## Drag-and-drop wiring

**Per draggable hero card** (built once per eligible hero in `buildPartyPickerStage`):

```ts
const bg = this.add.rectangle(0, 0, 184, 60, 0x000000, 0)
  .setInteractive({ draggable: true, useHandCursor: true });
bg.setData('heroId', hero.id);
const card = new HeroCard(this, 0, 0, hero, { size: 'small' });
this.stageContainer.add(bg);
this.stageContainer.add(card);
this.dragVisuals.set(hero.id, { bg, card });
```

The HeroCard is non-interactive — clicks pass through to `bg` (same pattern as Barracks). The bg is the drag handle.

**Per slot drop zone** (built once per slot in `buildPartyPickerStage`):

```ts
const zone = this.add.rectangle(slotX, 165, 220, 80, 0x1a1a1a)
  .setInteractive({ dropZone: true });
zone.setData('slotIndex', i);
const border = this.add.rectangle(slotX, 165, 220, 80)
  .setStrokeStyle(2, 0x555555).setFillStyle();  // border-only
this.stageContainer.add(zone);
this.stageContainer.add(border);
this.slotZones.push(zone);
this.slotBorders.push(border);
```

(The `setFillStyle()` with no args removes the fill; the dashed effect is approximated visually — Phaser doesn't support dashed strokes natively, so we use a solid muted color in practice; the dashed look is a visual aspiration, not a strict requirement.)

**Scene-level handlers** (registered once in `create`):

```ts
this.input.on('drag', (_p: unknown, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
  if (!('x' in obj) || !('y' in obj)) return;
  (obj as Phaser.GameObjects.Rectangle).setPosition(dragX, dragY);
  const heroId = obj.getData?.('heroId') as string | undefined;
  if (heroId) this.dragVisuals.get(heroId)?.card.setPosition(dragX, dragY);
});

this.input.on('drop', (_p: unknown, obj: Phaser.GameObjects.GameObject, zone: Phaser.GameObjects.GameObject) => {
  const heroId = obj.getData?.('heroId') as string | undefined;
  const slotIndex = zone.getData?.('slotIndex') as number | undefined;
  if (heroId !== undefined && slotIndex !== undefined) {
    this.placeHeroInSlot(heroId, slotIndex);
  }
});

this.input.on('dragend', (_p: unknown, _obj: Phaser.GameObjects.GameObject, dropped: boolean) => {
  if (!dropped) this.refreshPickerLayout();
});
```

Type-narrowing is needed because Phaser's typings don't tell us which game-object subtype was dragged. The `if heroId !== undefined && slotIndex !== undefined` guard handles the case where a drag's drop fires on something we didn't tag.

## `placeHeroInSlot(heroId, slotIndex)`

```ts
private placeHeroInSlot(heroId: string, slotIndex: number): void {
  const hero = this.heroById(heroId);
  if (!hero) return;

  // No-op if dropping a hero on its own current slot
  if (this.formation[slotIndex]?.id === heroId) {
    this.refreshPickerLayout();
    return;
  }

  const sourceIndex = this.formation.findIndex((h) => h?.id === heroId);
  const previousOccupant = this.formation[slotIndex];

  this.formation[slotIndex] = hero;
  if (sourceIndex !== -1) {
    // Hero was already in formation: swap (previous occupant — could be null — moves to source slot)
    this.formation[sourceIndex] = previousOccupant;
  }
  // Else: hero came from the eligible list. previousOccupant (if any) returns to the list automatically
  // because the formation array no longer references it; refreshPickerLayout will place it back.

  this.refreshPickerLayout();
}

private heroById(id: string): Hero | undefined {
  return this.eligibleHeroes.find((h) => h.id === id);
}
```

## `refreshPickerLayout()`

Single function that's called after every state change (drop, cancel, slot remove ×, stage entry). Walks `formation` + `eligibleHeroes` and:

1. **Slot visuals.** For each slot index `i`:
   - If `formation[i]` is null: set border to `#555` 2px (dashed-aspirational solid in practice); show empty placeholder text; hide the remove × button.
   - Else: set border to `#ffcc66` 2px solid; hide empty placeholder; place the hero's `dragVisual.card` and `bg` at the slot center; show + bind the remove × button to `() => { this.formation[i] = null; this.refreshPickerLayout(); }`.

2. **Eligible grid.** Build a list of hero ids in `eligibleHeroes` order, skipping any id present in `formation`. For each remaining id at position `j`:
   - row = `Math.floor(j / 3)`, col = `j % 3`
   - x = `[135, 480, 825][col]`, y = `270 + row * 60`
   - Place that hero's `dragVisual.card` and `bg` at (x, y).

3. **Eligible label** text: `ELIGIBLE (${eligibleHeroes.length - filledCount})` where `filledCount` = formation entries that are non-null.

4. **Descend button.** Enabled iff `formation.every(h => h !== null)`. Apply enabled/disabled styles. Label = `Descend` when enabled, `Descend (N/3)` when not. Reason text = `''` when enabled, `Need 3 heroes` when not.

The descend button's interactivity stays on always (same pattern as Tavern's hire buttons); the descend handler short-circuits when invalid.

## `descend()`

```ts
private descend(): void {
  if (!this.formation.every((h): h is Hero => h !== null)) return;
  const party = this.formation as readonly Hero[];

  const seed = Date.now();
  const rng = createRng(seed);
  const runState = startRun('crypt', party, seed, rng);

  appState.update((s) => ({
    ...s,
    runState,
    runRngState: rng.getState(),
  }));

  this.scene.stop();
  this.scene.start('dungeon');
}
```

## Dungeon scene stub (`src/scenes/dungeon_scene.ts`)

```ts
import * as Phaser from 'phaser';
import { appState } from './app_state';

export class DungeonScene extends Phaser.Scene {
  constructor() {
    super('dungeon');
  }

  create(): void {
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x111111).setOrigin(0, 0);
    this.add
      .text(480, 240, 'Dungeon (stub)', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const state = appState.get();
    if (state.runState) {
      this.add
        .text(
          480,
          290,
          `Run active: ${state.runState.dungeonId}, floor ${state.runState.currentFloorNumber}`,
          {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#aaaaaa',
          },
        )
        .setOrigin(0.5);
    }

    this.add
      .text(480, 360, 'Press ESC to abandon and return to camp', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#888888',
      })
      .setOrigin(0.5);

    this.input.keyboard?.on('keydown-ESC', () => this.abandon());
  }

  private abandon(): void {
    appState.update((s) => ({ ...s, runState: undefined, runRngState: undefined }));
    this.scene.start('camp');
  }
}
```

Registered in `src/main.ts` alongside the existing scenes.

## Empty / edge states

- **Roster empty or < 3 eligible.** Picker shows whatever cards exist; Descend stays disabled with `Need 3 heroes`. The player closes the panel and recruits more at the Tavern.
- **Pre-existing run in `appState`** (e.g., page reloaded mid-run). Out of scope here — task 16's dungeon scene will resume; for Tier 1's stub, the boot scene transitions to camp regardless. The Noticeboard panel does not check for an existing `runState` and would happily overwrite it on Descend. If this matters before task 16 ships, the simplest guard is the dungeon stub itself (it surfaces the active run on screen and lets the player abandon).
- **Roster mid-mutation.** Cannot occur — Noticeboard reads on stage entry. Other panels are mutually exclusive (camp pauses on launch, only one panel resumes camp on close).
- **Drag canceled outside any drop zone.** `dragend` with `dropped: false` triggers `refreshPickerLayout()` — the dragged card snaps back to its source position deterministically.

## Tests

### Unit tests: none new

Pure-logic dependencies (`startRun`, `listHeroes`, `save` invariants, `createRng`, `getState`) are already covered by tasks 6 / 7 / 9. The new code is Phaser glue — drag-and-drop handlers, stage-swap helpers, layout rebuild, and the throwaway dungeon stub. Mocking Phaser's input plugin and scene manager for assertions is high-effort, low-yield.

### Smoke test (manual, dev server)

`npm run dev`:

1. **Open Noticeboard from camp.** Title `Noticeboard`, single centered Crypt card with theme + floor count + CTA hint. Card hover → border yellow.
2. **Click Crypt card.** Stage swaps to picker. Title `The Crypt — Pick Your Party`. Three empty slot zones with dashed borders + `drag a hero here`. Eligible 3×3 grid below shows all roster heroes with `currentHp > 0`. Descend disabled, label `Descend (0/3)`, reason `Need 3 heroes`.
3. **Drag a hero from list onto slot 2.** Card follows cursor; on drop, slot 2 fills (solid yellow border, hero card placed; remove × visible top-right of slot zone). Eligible list re-flows. Descend label `Descend (1/3)`, still disabled.
4. **Drag a different hero onto slot 1.** Same. Label `Descend (2/3)`.
5. **Drag a hero onto slot 3.** Label `Descend (3/3)` → `Descend`. Button turns green; reason text clears.
6. **Drag the slot-1 hero onto slot 3** (swap). Slot 3's hero moves to slot 1; cards repaint. Descend stays valid.
7. **Click slot 2's remove ×.** Hero returns to eligible list; slot 2 reverts to empty. Descend re-disables, `Need 3 heroes`.
8. **Drag a hero onto slot 2 from the list, then drag it back onto the eligible grid** (release outside any drop zone). Card snaps back to its source slot — no state change.
9. **Click ← Back.** Stage 1 returns. Click Crypt again — stage 2 reopens with fresh empty formation.
10. **Fill all three slots, click Descend.** Panel disappears; dungeon stub appears with `Dungeon (stub)` + `Run active: crypt, floor 1` + ESC hint.
11. **Inspect localStorage `pixel-battle-game/save`.** `runState.dungeonId === 'crypt'`, `runState.party` is the 3 heroes in slot order (slot 1 first), `runRngState` is a number, `currentFloorNodes` is populated, `currentNodeIndex === 0`.
12. **Press ESC in the dungeon stub.** `runState` and `runRngState` cleared. Camp scene appears with previous gold HUD.
13. **Empty / sparse roster.** Clear localStorage, set `roster.heroes` to 0–2 heroes via DevTools, reload. Open Noticeboard → Crypt. Picker shows the few eligible heroes; Descend stays disabled with `Need 3 heroes`.

### Automated checks

- `npx tsc --noEmit` clean.
- `npm test` — existing 493 tests pass; no new tests.
- `npm run build` succeeds.

## Risks and follow-ups

- **First drag-and-drop in the codebase.** Phaser's input plugin has known quirks (drop-zone bounds need explicit shape, `dragend` ordering vs `drop`, hit-test order with overlapping zones). The fallback if drag-and-drop is buggy on the target platform is the click-to-assign model from the brainstorm — single-rule change in `placeHeroInSlot`.
- **No "remember last party."** Each picker open starts empty. Tier 2 polish — add `lastParty: HeroId[]` to `SaveFile`, pre-fill on open.
- **No combined-party preview.** No party-stats summary or class-balance hint. Tier 2.
- **No filtering / sorting of eligible list.** Insertion order from `roster.heroes`. Fine at Tier 1 cap (≤ 9 eligible).
- **Reloading mid-run lands at camp, not dungeon.** Boot transitions to `'camp'` unconditionally. Task 16's dungeon scene will need to resume on its own from `runState`, and boot may need to route there. Out of scope.
- **Dungeon stub's "abandon" clears the run.** Convenient for dev testing but doesn't reflect real Tier 1 wipe semantics. Stub trades correctness for letting the player back to camp during development. Real dungeon scene (task 16) will treat abandon as a wipe (or disallow it).
- **No party-composition validation.** Player can submit 3 priests, all in one class. By design — learning curve is part of the gameplay.
- **`startRun` re-uses `Date.now()` as seed.** Rolling forward is the rng's job; the seed is stored in `RunState` for replay/regen. If true reproducibility matters later, accept an explicit seed.
- **Descend transitions away from camp permanently.** Camp's `RESUME` listener never fires for this path. Camp will be re-created from scratch when the dungeon scene returns control. Slight overhead; acceptable.
- **Drag visuals mutate game-object positions during drag.** The cancel path relies on `refreshPickerLayout()` to put everything back, including non-dragged cards that may have shifted layout. State-driven repositioning is load-bearing.
- **Pre-existing `runState` is overwritten on Descend.** No guard. Acceptable for Tier 1 (boot doesn't auto-resume into dungeon yet); becomes a UX bug when task 16 ships and the player can leave camp with an active run. Add a guard in the Descend handler then.
- **Dashed slot border is solid in practice.** Phaser doesn't render dashed strokes natively. The visual aspiration is documented in the layout table; the implementation uses a muted solid color and relies on the empty placeholder text + color difference to communicate state.
