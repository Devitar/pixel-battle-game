# Noticeboard & Party Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace task 12's `NoticeboardPanelScene` stub with the real "begin a run" flow — a two-stage panel (dungeon list → drag-and-drop party picker) that constructs `RunState` + `runRngState` on Descend and transitions to a new throwaway `DungeonScene` stub.

**Architecture:** Two units. (1) A throwaway `DungeonScene` stub at `src/scenes/dungeon_scene.ts` with key `'dungeon'`, registered in `main.ts`, that the picker's Descend can navigate to. (2) A single-file rewrite of `src/scenes/noticeboard_panel_scene.ts` with an internal stage state machine, a `setStage(next)` helper that tears down + rebuilds via a `stageContainer`, and Phaser drag-and-drop wired through scene-level `drag`/`drop`/`dragend` handlers that mutate a `formation: (Hero | null)[]` and call `refreshPickerLayout()` to render from state.

**Tech Stack:** TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 4 (existing 493 tests stay green; no new tests), Phaser 4 (Scene, Container, Rectangle, Text, drag-and-drop input plugin via `setInteractive({ draggable, dropZone })`).

**Spec:** `docs/superpowers/specs/2026-04-25-noticeboard-party-picker-design.md`

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/scenes/dungeon_scene.ts` | **Create** | Throwaway stub. `'dungeon'` scene key, renders `Dungeon (stub)` + run summary. ESC clears `runState`/`runRngState` and transitions to camp. ~40 lines. |
| `src/main.ts` | **Modify** | Add `DungeonScene` import + entry to the `scene: [...]` array. |
| `src/scenes/noticeboard_panel_scene.ts` | **Rewrite** | Full two-stage panel: dungeon-list card → party-picker (drag-drop slots + eligible grid + Descend). Same overlay pattern as Tavern/Barracks. ~380 lines. |

The two-task split is for review boundaries; per the Tavern/Barracks lesson, strict-mode `noUnusedLocals` rules out incremental scaffolding inside Task 2 — the noticeboard scene is one rewrite.

---

## Task 1: Dungeon scene stub + main.ts wiring

**Files:**
- Create: `src/scenes/dungeon_scene.ts`
- Modify: `src/main.ts`

The Descend handler in Task 2 calls `this.scene.start('dungeon')`. That key must resolve to a registered scene — Phaser throws otherwise. This task creates the stub and registers it. After this task, `npm run dev` still runs (the stub isn't reachable from any UI yet), so the value is purely making Task 2 compilable + smoke-testable end to end.

- [ ] **Step 1: Create `src/scenes/dungeon_scene.ts`**

```ts
import * as Phaser from 'phaser';
import { appState } from './app_state';

export class DungeonScene extends Phaser.Scene {
  constructor() {
    super('dungeon');
  }

  create(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x111111)
      .setOrigin(0, 0);

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

- [ ] **Step 2: Register `DungeonScene` in `src/main.ts`**

Open `src/main.ts`. Add the import next to the other scene imports (alphabetical insertion between `CampScene` and `ExplorerScene`):

```ts
import { DungeonScene } from './scenes/dungeon_scene';
```

Add `DungeonScene` to the `scene:` array. Insert it after `NoticeboardPanelScene` and before `MainScene`. The full updated array should read:

```ts
  scene: [
    BootScene,
    CampScene,
    TavernPanelScene,
    BarracksPanelScene,
    NoticeboardPanelScene,
    DungeonScene,
    MainScene,
    ExplorerScene,
  ],
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Existing tests still pass**

Run: `npm test`
Expected: 493 tests pass (no test changes).

- [ ] **Step 5: Build still succeeds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/dungeon_scene.ts src/main.ts
git commit -m "scenes: add dungeon scene stub with abandon-to-camp"
```

---

## Task 2: Rewrite `NoticeboardPanelScene` with two-stage panel + drag-and-drop

**Files:**
- Rewrite: `src/scenes/noticeboard_panel_scene.ts`

Full rewrite in one task — same lesson as Tavern (task 13) and Barracks (task 14). The single file holds: stage state machine, both stage-build helpers, drag handlers, layout-from-state refresh, descend flow, close.

- [ ] **Step 1: Rewrite the scene file**

Replace the entire contents of `src/scenes/noticeboard_panel_scene.ts` with:

```ts
import * as Phaser from 'phaser';
import { listHeroes } from '../camp/roster';
import { DUNGEONS } from '../data/dungeons';
import type { Hero } from '../heroes/hero';
import { startRun } from '../run/run_state';
import { HeroCard } from '../ui/hero_card';
import { createRng } from '../util/rng';
import { appState } from './app_state';

type Stage = 'dungeon_list' | 'party_picker';

interface DragVisual {
  card: HeroCard;
  bg: Phaser.GameObjects.Rectangle;
}

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 920;
const PANEL_H = 460;

const TITLE_Y = 60;
const SUBTITLE_Y = 88;
const CLOSE_X_X = 933;
const CLOSE_X_Y = 63;

// Stage 1
const DUNGEON_CARD_W = 460;
const DUNGEON_CARD_H = 220;

// Stage 2 — slot row
const SLOT_X = [170, 480, 790] as const;
const SLOT_Y = 165;
const SLOT_W = 220;
const SLOT_H = 80;
const SLOT_LABEL_Y = 110;
const SLOT_REMOVE_OFFSET_X = 100;
const SLOT_REMOVE_OFFSET_Y = -32;

// Stage 2 — eligible grid
const ELIGIBLE_LABEL_Y = 220;
const ELIGIBLE_X = [135, 480, 825] as const;
const ELIGIBLE_Y_BASE = 270;
const ELIGIBLE_Y_STRIDE = 60;

// Stage 2 — descend
const DESCEND_X = 820;
const DESCEND_Y = 455;
const DESCEND_W = 180;
const DESCEND_H = 34;
const REASON_Y = 475;

const HERO_BG_W = 184;
const HERO_BG_H = 60;

export class NoticeboardPanelScene extends Phaser.Scene {
  private stage: Stage = 'dungeon_list';
  private stageContainer!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;

  private formation: (Hero | null)[] = [null, null, null];
  private eligibleHeroes: Hero[] = [];
  private dragVisuals = new Map<string, DragVisual>();
  private slotBorders: Phaser.GameObjects.Rectangle[] = [];
  private slotEmptyTexts: Phaser.GameObjects.Text[] = [];
  private slotRemoveButtons: Phaser.GameObjects.Container[] = [];
  private eligibleLabel?: Phaser.GameObjects.Text;
  private descendButtonBg?: Phaser.GameObjects.Rectangle;
  private descendButtonLabel?: Phaser.GameObjects.Text;
  private descendReasonText?: Phaser.GameObjects.Text;

  constructor() {
    super('noticeboard_panel');
  }

  create(): void {
    // Phaser scene reuse — reset per-launch state
    this.stage = 'dungeon_list';
    this.formation = [null, null, null];
    this.eligibleHeroes = [];
    this.dragVisuals.clear();
    this.slotBorders = [];
    this.slotEmptyTexts = [];
    this.slotRemoveButtons = [];
    this.eligibleLabel = undefined;
    this.descendButtonBg = undefined;
    this.descendButtonLabel = undefined;
    this.descendReasonText = undefined;

    this.buildCommonChrome();
    this.stageContainer = this.add.container(0, 0);

    this.input.on('drag', this.onDrag, this);
    this.input.on('drop', this.onDrop, this);
    this.input.on('dragend', this.onDragEnd, this);

    this.input.keyboard?.on('keydown-ESC', () => this.close());

    this.setStage('dungeon_list');
  }

  private buildCommonChrome(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0);
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666);
    this.titleText = this.add
      .text(PANEL_CX, TITLE_Y, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const closeBg = this.add
      .rectangle(CLOSE_X_X, CLOSE_X_Y, 28, 28, 0x553333)
      .setStrokeStyle(1, 0x885555);
    this.add
      .text(CLOSE_X_X, CLOSE_X_Y, '×', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => this.close());
  }

  private setStage(next: Stage): void {
    this.stage = next;
    this.stageContainer.removeAll(true);
    this.slotBorders = [];
    this.slotEmptyTexts = [];
    this.slotRemoveButtons = [];
    this.dragVisuals.clear();
    this.eligibleLabel = undefined;
    this.descendButtonBg = undefined;
    this.descendButtonLabel = undefined;
    this.descendReasonText = undefined;

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

  private buildDungeonListStage(): void {
    this.stageContainer.add(
      this.add
        .text(PANEL_CX, SUBTITLE_Y, 'Choose a dungeon to descend into.', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5),
    );

    const cardBorder = 0x444444;
    const cardBg = this.add
      .rectangle(PANEL_CX, PANEL_CY, DUNGEON_CARD_W, DUNGEON_CARD_H, 0x1a1a1a)
      .setStrokeStyle(2, cardBorder);
    this.stageContainer.add(cardBg);

    const def = DUNGEONS.crypt;
    this.stageContainer.add(
      this.add
        .text(PANEL_CX, 195, def.name, {
          fontFamily: 'monospace',
          fontSize: '22px',
          color: '#ffffff',
        })
        .setOrigin(0.5, 0),
    );
    this.stageContainer.add(
      this.add
        .text(PANEL_CX, 225, def.theme, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5, 0),
    );
    this.stageContainer.add(
      this.add
        .text(PANEL_CX, 250, `${def.floorLength} floors`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5, 0),
    );
    this.stageContainer.add(
      this.add
        .text(PANEL_CX, 350, '▸ Click to plan an expedition', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffcc66',
        })
        .setOrigin(0.5, 0),
    );

    cardBg.setInteractive({ useHandCursor: true });
    cardBg.on('pointerover', () => cardBg.setStrokeStyle(2, 0xffcc66));
    cardBg.on('pointerout', () => cardBg.setStrokeStyle(2, cardBorder));
    cardBg.on('pointerdown', () => this.setStage('party_picker'));
  }

  private buildPartyPickerStage(): void {
    // Back button
    const backBg = this.add
      .rectangle(75, 63, 90, 26, 0x333333)
      .setStrokeStyle(1, 0x666666);
    const backLabel = this.add
      .text(75, 63, '← Back', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.stageContainer.add(backBg);
    this.stageContainer.add(backLabel);
    backBg.setInteractive({ useHandCursor: true });
    backBg.on('pointerdown', () => this.setStage('dungeon_list'));

    // Subtitle
    this.stageContainer.add(
      this.add
        .text(PANEL_CX, SUBTITLE_Y, 'Drag heroes onto slots. Slot 1 is the front line.', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5),
    );

    // Slot zones + labels
    const slotLabels = ['SLOT 1 — FRONT', 'SLOT 2', 'SLOT 3 — BACK'];
    for (let i = 0; i < 3; i++) {
      const x = SLOT_X[i];
      this.stageContainer.add(
        this.add
          .text(x, SLOT_LABEL_Y, slotLabels[i], {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#ffcc66',
          })
          .setOrigin(0.5),
      );

      const zone = this.add
        .rectangle(x, SLOT_Y, SLOT_W, SLOT_H, 0x1a1a1a)
        .setInteractive({ dropZone: true });
      zone.setData('slotIndex', i);
      this.stageContainer.add(zone);

      const border = this.add
        .rectangle(x, SLOT_Y, SLOT_W, SLOT_H)
        .setFillStyle(0x000000, 0)
        .setStrokeStyle(2, 0x555555);
      this.stageContainer.add(border);
      this.slotBorders.push(border);

      const emptyText = this.add
        .text(x, SLOT_Y, 'drag a hero here', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#666666',
          fontStyle: 'italic',
        })
        .setOrigin(0.5);
      this.stageContainer.add(emptyText);
      this.slotEmptyTexts.push(emptyText);

      const removeBg = this.add.rectangle(0, 0, 16, 16, 0x553333).setStrokeStyle(1, 0x885555);
      const removeText = this.add
        .text(0, 0, '×', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      const removeBtn = this.add.container(
        x + SLOT_REMOVE_OFFSET_X,
        SLOT_Y + SLOT_REMOVE_OFFSET_Y,
        [removeBg, removeText],
      );
      removeBg.setInteractive({ useHandCursor: true });
      removeBg.on('pointerdown', () => {
        this.formation[i] = null;
        this.refreshPickerLayout();
      });
      removeBtn.setVisible(false);
      this.stageContainer.add(removeBtn);
      this.slotRemoveButtons.push(removeBtn);
    }

    // Eligible label (text content set by refreshPickerLayout)
    this.eligibleLabel = this.add
      .text(PANEL_CX, ELIGIBLE_LABEL_Y, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);
    this.stageContainer.add(this.eligibleLabel);

    // Build draggable cards for every eligible hero (positions assigned by refreshPickerLayout)
    for (const hero of this.eligibleHeroes) {
      const bg = this.add
        .rectangle(0, 0, HERO_BG_W, HERO_BG_H, 0x000000, 0)
        .setInteractive({ draggable: true, useHandCursor: true });
      bg.setData('heroId', hero.id);
      const card = new HeroCard(this, 0, 0, hero, { size: 'small' });
      this.stageContainer.add(bg);
      this.stageContainer.add(card);
      this.dragVisuals.set(hero.id, { bg, card });
    }

    // Descend button
    this.descendButtonBg = this.add
      .rectangle(DESCEND_X, DESCEND_Y, DESCEND_W, DESCEND_H, 0x333333)
      .setStrokeStyle(2, 0x555555);
    this.descendButtonLabel = this.add
      .text(DESCEND_X, DESCEND_Y, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#777777',
      })
      .setOrigin(0.5);
    this.descendReasonText = this.add
      .text(DESCEND_X, REASON_Y, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#cc6666',
      })
      .setOrigin(0.5, 0);
    this.descendButtonBg.setInteractive({ useHandCursor: true });
    this.descendButtonBg.on('pointerdown', () => this.descend());
    this.stageContainer.add(this.descendButtonBg);
    this.stageContainer.add(this.descendButtonLabel);
    this.stageContainer.add(this.descendReasonText);
  }

  private refreshPickerLayout(): void {
    if (this.stage !== 'party_picker') return;

    // Slot visuals
    for (let i = 0; i < 3; i++) {
      const occupant = this.formation[i];
      const border = this.slotBorders[i];
      const emptyText = this.slotEmptyTexts[i];
      const removeBtn = this.slotRemoveButtons[i];

      if (occupant === null) {
        border.setStrokeStyle(2, 0x555555);
        emptyText.setVisible(true);
        removeBtn.setVisible(false);
      } else {
        border.setStrokeStyle(2, 0xffcc66);
        emptyText.setVisible(false);
        removeBtn.setVisible(true);
        const v = this.dragVisuals.get(occupant.id);
        if (v) {
          v.bg.setPosition(SLOT_X[i], SLOT_Y);
          v.card.setPosition(SLOT_X[i], SLOT_Y);
        }
      }
    }

    // Eligible grid: heroes not in formation, in eligibleHeroes order
    const formationIds = new Set(
      this.formation.filter((h): h is Hero => h !== null).map((h) => h.id),
    );
    let listPos = 0;
    for (const hero of this.eligibleHeroes) {
      if (formationIds.has(hero.id)) continue;
      const row = Math.floor(listPos / 3);
      const col = listPos % 3;
      const x = ELIGIBLE_X[col];
      const y = ELIGIBLE_Y_BASE + row * ELIGIBLE_Y_STRIDE;
      const v = this.dragVisuals.get(hero.id);
      if (v) {
        v.bg.setPosition(x, y);
        v.card.setPosition(x, y);
      }
      listPos++;
    }

    // Eligible label
    const remaining = this.eligibleHeroes.length - formationIds.size;
    this.eligibleLabel?.setText(`ELIGIBLE (${remaining})`);

    // Descend button
    const filledCount = this.formation.filter((h) => h !== null).length;
    const enabled = filledCount === 3;
    if (this.descendButtonBg && this.descendButtonLabel && this.descendReasonText) {
      if (enabled) {
        this.descendButtonBg.setFillStyle(0x2a4a2a).setStrokeStyle(2, 0x44cc44);
        this.descendButtonLabel.setColor('#ffffff').setText('Descend');
        this.descendReasonText.setText('');
      } else {
        this.descendButtonBg.setFillStyle(0x333333).setStrokeStyle(2, 0x555555);
        this.descendButtonLabel.setColor('#777777').setText(`Descend (${filledCount}/3)`);
        this.descendReasonText.setText('Need 3 heroes');
      }
    }
  }

  private placeHeroInSlot(heroId: string, slotIndex: number): void {
    const hero = this.eligibleHeroes.find((h) => h.id === heroId);
    if (!hero) return;

    if (this.formation[slotIndex]?.id === heroId) {
      this.refreshPickerLayout();
      return;
    }

    const sourceIndex = this.formation.findIndex((h) => h?.id === heroId);
    const previousOccupant = this.formation[slotIndex];

    this.formation[slotIndex] = hero;
    if (sourceIndex !== -1) {
      this.formation[sourceIndex] = previousOccupant;
    }

    this.refreshPickerLayout();
  }

  private onDrag(
    _pointer: Phaser.Input.Pointer,
    obj: Phaser.GameObjects.GameObject,
    dragX: number,
    dragY: number,
  ): void {
    if (this.stage !== 'party_picker') return;
    const heroId = obj.getData('heroId') as string | undefined;
    if (heroId === undefined) return;
    const v = this.dragVisuals.get(heroId);
    if (!v) return;
    v.bg.setPosition(dragX, dragY);
    v.card.setPosition(dragX, dragY);
  }

  private onDrop(
    _pointer: Phaser.Input.Pointer,
    obj: Phaser.GameObjects.GameObject,
    zone: Phaser.GameObjects.GameObject,
  ): void {
    if (this.stage !== 'party_picker') return;
    const heroId = obj.getData('heroId') as string | undefined;
    const slotIndex = zone.getData('slotIndex') as number | undefined;
    if (heroId === undefined || slotIndex === undefined) return;
    this.placeHeroInSlot(heroId, slotIndex);
  }

  private onDragEnd(
    _pointer: Phaser.Input.Pointer,
    _obj: Phaser.GameObjects.GameObject,
    dropped: boolean,
  ): void {
    if (this.stage !== 'party_picker') return;
    if (!dropped) this.refreshPickerLayout();
  }

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

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Existing tests still pass**

Run: `npm test`
Expected: 493 tests pass (no test changes).

- [ ] **Step 4: Production build succeeds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Smoke test (manual, dev server)**

Run: `npm run dev`. Open `http://localhost:5173`.

Walk through the spec's smoke-test sequence (`docs/superpowers/specs/2026-04-25-noticeboard-party-picker-design.md` §Tests > Smoke test):

1. **Open Noticeboard from camp.** Title `Noticeboard`, single centered Crypt card with theme + floor count + CTA hint. Card hover → border yellow.
2. **Click Crypt card.** Stage swaps to picker. Title `The Crypt — Pick Your Party`. Three empty slot zones with `drag a hero here`. Eligible 3×3 grid shows all roster heroes with `currentHp > 0`. Descend disabled, label `Descend (0/3)`, reason `Need 3 heroes`.
3. **Drag a hero from list onto slot 2.** Card follows cursor; on drop, slot 2 fills (yellow border, hero card placed; remove × visible). Eligible list re-flows. Label `Descend (1/3)`.
4. **Drag a different hero onto slot 1.** Label `Descend (2/3)`.
5. **Drag a hero onto slot 3.** Label flips to `Descend`. Button turns green; reason text clears.
6. **Drag the slot-1 hero onto slot 3** (swap). Slot 3's hero moves to slot 1; cards repaint. Descend stays valid.
7. **Click slot 2's remove ×.** Hero returns to eligible list; slot 2 empty. Descend disables, `Need 3 heroes`.
8. **Drag a hero onto slot 2 from the list, release outside any drop zone** (cancel). Card snaps back to its source position — no state change.
9. **Click ← Back.** Stage 1 returns. Click Crypt — stage 2 reopens with empty formation.
10. **Fill all 3 slots, click Descend.** Panel disappears; dungeon stub appears with `Dungeon (stub)` + `Run active: crypt, floor 1` + ESC hint.
11. **Inspect localStorage `pixel-battle-game/save`.** `runState.dungeonId === 'crypt'`, `runState.party` is the 3 heroes in slot order, `runRngState` is a number, `currentFloorNodes` populated, `currentNodeIndex === 0`.
12. **Press ESC in the dungeon stub.** `runState`/`runRngState` cleared. Camp scene re-appears with previous gold HUD.
13. **Empty / sparse roster.** Clear localStorage, set `roster.heroes` to 0–2 heroes via DevTools, reload. Open Noticeboard → Crypt. Picker shows the few eligible heroes; Descend stays disabled with `Need 3 heroes`.

If any step diverges, stop and debug before committing. The most likely breakage points (per the spec's drag-and-drop risk note) are: drop-zone hit testing on overlapping zones, drag visual lag, or `dragend` ordering vs `drop`.
Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/noticeboard_panel_scene.ts
git commit -m "noticeboard: rewrite stub with dungeon list + drag-drop party picker"
```

---

## Verification summary

After both tasks:

- `npx tsc --noEmit` — clean
- `npm test` — 493 tests passing (no new tests; pure-logic deps unchanged)
- `npm run build` — succeeds
- Manual smoke test — all 13 steps pass
- After Descend, `localStorage` has paired `runState` + `runRngState` (save invariant from task 9 holds)

---

## Out of scope (per spec §Risks and follow-ups)

- "Remember last party" pre-fill (Tier 2 polish)
- Combined-party stat preview (Tier 2)
- Sort / filter eligible list (Tier 2)
- Boot-time route into dungeon when `runState` is present (task 16's concern)
- Real wipe semantics for the dungeon stub's "abandon" (task 16 territory)
- Party-composition validation (intentionally absent)
- Dashed slot-border rendering — Phaser doesn't support natively; solid muted color used in practice (documented in spec)

---

## Notes for the implementer

- **Phaser scene reuse trap.** `create()` runs every `scene.launch`, but the JS instance persists. The state reset at the top of `create()` is load-bearing for re-opens. Same pattern as Tavern (task 13) and Barracks (task 14).
- **Drag-and-drop event order.** Phaser fires `drop` before `dragend` when a drop hits a zone, with `dragend`'s `dropped` arg `true`. When the drag releases outside any zone, only `dragend` fires with `dropped: false`. The handlers split responsibility: `drop` calls `placeHeroInSlot` (which updates state and re-renders); `dragend` only re-renders on cancel. Either path leaves the layout consistent with `formation` + `eligibleHeroes`.
- **State-driven render is load-bearing.** Drag visuals can drift mid-drag (cards follow the cursor); on every drop / cancel the layout snaps back via `refreshPickerLayout()`. Don't try to track "where is each card" alongside `formation` — derive everything from state.
- **Drop zones are explicitly tagged.** `zone.setData('slotIndex', i)`. The drop handler reads back via `zone.getData('slotIndex')`. Same pattern for the dragged hero (`bg.setData('heroId', hero.id)`). If a future drop target needs different bookkeeping, change the data key, not the handlers' shape.
- **Atomic Descend.** `appState.update` writes `runState` and `runRngState` in a single producer call — required by the save invariant in `src/save/save.ts:20` (both fields paired or both absent).
- **`scene.start('dungeon')` not `scene.resume('camp')`** — Descend leaves camp permanently. The dungeon scene will return control to camp via `scene.start('camp')` (or `scene.resume('camp')` once task 16's real dungeon scene exists). The current stub uses `scene.start('camp')`, which restarts camp from `create()`.
- **Camp's RESUME listener does not fire on Descend.** The Descend path stops the noticeboard panel and starts a different scene; the camp's `pause/resume` cycle isn't completed. Camp will be re-created when the dungeon scene transitions back. Slight overhead, acceptable.
- **`setInteractive({ dropZone: true })` requires `setInteractive` first.** For Rectangle game objects, `setInteractive({ dropZone: true })` works without an explicit hit area — Phaser uses the rectangle's bounds. If a drop zone fails to register, double-check the rectangle's `width` / `height` are set before `setInteractive`.
- **`obj.getData('key')` returns undefined when no data is set.** The drop handler tolerates this with the `=== undefined` guard. If you see drops being dropped (no pun intended), check that `setData` was called before the `setInteractive`.
