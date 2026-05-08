import * as Phaser from 'phaser';
import { ConstraintMode, UiScene } from 'phaser-pixui';
import { listHeroes } from '@camp/roster';
import { DUNGEONS } from '@data/dungeons';
import type { DungeonDef, DungeonId, EnemyId } from '@data/types';
import type { Hero } from '@heroes/hero';
import { EnemySprite } from '@render/enemy_sprite';
import { fixPixuiCanvasViewport } from '@render/pixui_canvas_fix';
import { uiTheme } from '@render/ui_theme';
import { PixuiHeroCard } from '@ui/pixui_hero_card';
import { startRun } from '@run/run_state';
import { createRng } from '@util/rng';
import { appState } from './app_state';
import { computeCardPositions } from './expeditions_layout';

// Module-level state survives scene.restart() across stage transitions.
// Reset on close.
let _stage: 'dungeon_list' | 'party_picker' = 'dungeon_list';
let _selectedDungeonId: DungeonId = 'crypt';
let _formation: (Hero | null)[] = [null, null, null];

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 920;
const PANEL_H = 460;

const TITLE_Y = 60;
const SUBTITLE_Y = 88;

// Stage 2 — slot row. Slot 1 (front) on the right to match combat scene's
// party layout (party on left of combat, slot 1 closest to enemies on the right).
const SLOT_X = [790, 480, 170] as const;
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

export class ExpeditionsPanelScene extends UiScene {
  constructor() {
    super({
      key: 'expeditions_panel',
      viewportConstraints: { mode: ConstraintMode.Maximum, width: 960, height: 540 },
      theme: uiTheme,
    });
  }

  create(): void {
    fixPixuiCanvasViewport(this);
    super.create();

    // Dim overlay (raw Phaser — full-canvas modal backdrop)
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0);

    // Panel chrome (raw Phaser — contains EnemySprite children in stage 1)
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666);

    const titleText = this.add
      .text(PANEL_CX, TITLE_Y, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // Close button (pixui.Button via topRight — matches Barracks/Tavern pattern)
    this.insert.topRight.button({
      x: 4,
      y: 4,
      width: 48,
      text: 'X',
      onClick: () => this.close(),
    });

    if (_stage === 'dungeon_list') {
      titleText.setText('Expeditions');
      this.buildDungeonListStage();
    } else {
      const def = DUNGEONS[_selectedDungeonId];
      titleText.setText(`${def.name} — Pick Your Party`);
      this.buildPartyPickerStage();
    }

    this.input.keyboard?.on('keydown-ESC', () => {
      if (_stage === 'party_picker') {
        _stage = 'dungeon_list';
        _formation = [null, null, null];
        this.scene.restart();
      } else {
        this.close();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Stage 1 — Dungeon list
  // ---------------------------------------------------------------------------

  private buildDungeonListStage(): void {
    this.add
      .text(PANEL_CX, SUBTITLE_Y, 'Choose a dungeon to descend into.', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    const allDungeons = Object.values(DUNGEONS);
    const unlockedIds = new Set(appState.get().unlocks.dungeons);
    const cards = allDungeons.map((def) => ({ def, locked: !unlockedIds.has(def.id) }));

    const CARD_W = 820;
    const CARD_H = 96;
    const GAP = 12;
    const positions = computeCardPositions(cards.length, PANEL_H, CARD_H, GAP);
    const panelTop = PANEL_CY - PANEL_H / 2;

    for (let i = 0; i < cards.length; i++) {
      const { def, locked } = cards[i];
      const cardY = panelTop + positions[i];
      this.renderDungeonCard(PANEL_CX, cardY, CARD_W, CARD_H, def, locked);
    }
  }

  private renderDungeonCard(
    cx: number,
    cy: number,
    w: number,
    h: number,
    def: DungeonDef,
    locked: boolean,
  ): void {
    const cardBorder = locked ? 0x333333 : 0x444444;
    const cardBg = this.add
      .rectangle(cx, cy, w, h, locked ? 0x141414 : 0x1a1a1a)
      .setStrokeStyle(2, cardBorder);

    // Title (top-left)
    const title = locked ? '???' : def.name;
    const titleObj = this.add
      .text(cx - w / 2 + 16, cy - h / 2 + 12, title, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: locked ? '#666666' : '#ffffff',
      })
      .setOrigin(0, 0);

    // Tier badge
    const TIER_COLOR: Record<number, number> = {
      1: 0xccaa44,
      2: 0x4488cc,
      3: 0xcc4444,
      4: 0x8844cc,
    };
    const badgeColor = TIER_COLOR[def.tier] ?? 0x666666;
    const badgeX = titleObj.x + titleObj.width + 8;
    const badgeY = titleObj.y + titleObj.height / 2;
    this.add.rectangle(badgeX, badgeY, 36, 18, badgeColor).setOrigin(0, 0.5);
    this.add
      .text(badgeX + 18, badgeY, `T${def.tier}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // Theme + floor count (top-right) OR unlock requirement (locked)
    const themeText = locked
      ? `Unlock by: ${def.unlockRequirement ?? 'Locked'}`
      : `${def.theme} · ${def.floorsPerRun} floors`;
    this.add
      .text(cx + w / 2 - 16, cy - h / 2 + 16, themeText, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#aaaaaa',
      })
      .setOrigin(1, 0);

    // Signature enemy strip (bottom-left)
    const ids: readonly EnemyId[] = [...def.enemyPool, def.bossId];
    const SCALE = 1.5;
    const FRAME_W = 16;
    const BOSS_W = 32;
    const GAP_PX = 6;
    let cursor = cx - w / 2 + 16;
    const stripGroundY = cy + h / 2 - 8;

    for (const enemyId of ids) {
      const isBoss = enemyId === def.bossId;
      const frameW = isBoss ? BOSS_W : FRAME_W;
      const fullSize = frameW * SCALE;
      const centerX = cursor + fullSize / 2;
      const centerY = stripGroundY - fullSize / 2;
      const sprite = new EnemySprite(this, centerX, centerY, enemyId);
      sprite.setScale(SCALE);
      if (locked) sprite.setLocked(true);
      cursor += fullSize + GAP_PX;
    }

    // Click prompt (bottom-right) + interaction — unlocked only
    if (!locked) {
      this.add
        .text(cx + w / 2 - 16, cy + h / 2 - 12, '▸ Click to plan', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffcc66',
        })
        .setOrigin(1, 1);
      cardBg.setInteractive({ useHandCursor: true });
      cardBg.on('pointerover', () => cardBg.setStrokeStyle(2, 0xffcc66));
      cardBg.on('pointerout', () => cardBg.setStrokeStyle(2, cardBorder));
      cardBg.on('pointerdown', () => {
        _selectedDungeonId = def.id;
        _stage = 'party_picker';
        _formation = [null, null, null];
        this.scene.restart();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 2 — Party picker (slots + draggable eligible heroes)
  // ---------------------------------------------------------------------------

  private buildPartyPickerStage(): void {
    const eligibleHeroes = listHeroes(appState.get().roster).filter((h) => h.currentHp > 0);

    // Back button (pixui)
    this.insert.topLeft.button({
      x: 30,
      y: 28,
      width: 90,
      height: 26,
      text: '← Back',
      onClick: () => {
        _stage = 'dungeon_list';
        _formation = [null, null, null];
        this.scene.restart();
      },
    });

    this.add
      .text(PANEL_CX, SUBTITLE_Y, 'Drag heroes onto slots. Slot 1 is the front line.', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    // -----------------------------------------------------------------------
    // Slot drop zones (Phaser-native — pixui doesn't replace this)
    // -----------------------------------------------------------------------

    const slotDropZones: Phaser.GameObjects.Rectangle[] = [];
    const slotLabels = ['SLOT 1 — FRONT', 'SLOT 2', 'SLOT 3 — BACK'];

    // installDragHandlers wires drag / drop / dragend onto a card.
    // frameAnchorX/Y are the canvas-world center of the card's host frame —
    // used to convert pointer canvas coords into card-local offsets.
    // Cards are centered in their frame (localX/Y = 0 at rest), so snap-back
    // resets both to 0 regardless of whether the card lives in a slot or the
    // eligible grid.
    const installDragHandlers = (
      card: PixuiHeroCard,
      hero: Hero,
      frameAnchorX: number,
      frameAnchorY: number,
    ): void => {
      // Use pointer.x/y, not Phaser's dragX/dragY — pixui's hit area is a
      // scene-rooted Phaser Container at (0,0), so dragX/dragY measure
      // pointer-minus-grab-offset relative to that origin, not canvas coords.
      // Result of using dragX/dragY: cards snap to top-left after first drag
      // (caught during 3c-i smoke testing — see HISTORY).
      card.events.on('drag', (pointer: Phaser.Input.Pointer) => {
        card.localX = pointer.x - frameAnchorX;
        card.localY = pointer.y - frameAnchorY;
      });

      card.events.on('drop', (_p: Phaser.Input.Pointer, dropZone: Phaser.GameObjects.GameObject) => {
        const slotIndex = slotDropZones.indexOf(dropZone as Phaser.GameObjects.Rectangle);
        if (slotIndex < 0) return;

        // Slot-swap / move logic:
        //   - sourceSlotIndex >= 0  → card came from a slot; vacate it (or swap if target filled)
        //   - sourceSlotIndex === -1 → card came from the eligible grid
        // In both cases, the previous occupant of the target slot (if any) returns
        // to its natural position on restart (eligible grid or its own slot via _formation).
        const previousOccupant = _formation[slotIndex];
        const sourceSlotIndex = _formation.findIndex((h) => h?.id === hero.id);

        _formation[slotIndex] = hero;
        if (sourceSlotIndex !== -1) {
          // Vacate source slot; if target was filled, place its occupant there (swap).
          _formation[sourceSlotIndex] = previousOccupant;
        }

        this.scene.restart();
      });

      // Snap back to home position if not dropped on a valid zone.
      card.events.on('dragend', (_p: Phaser.Input.Pointer, dropped: boolean) => {
        if (!dropped) {
          card.localX = 0;
          card.localY = 0;
        }
      });
    };

    for (let i = 0; i < 3; i++) {
      const x = SLOT_X[i];

      this.add
        .text(x, SLOT_LABEL_Y, slotLabels[i], {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffcc66',
        })
        .setOrigin(0.5);

      // Invisible drop zone (Phaser-native)
      const zone = this.add
        .rectangle(x, SLOT_Y, SLOT_W, SLOT_H, 0x1a1a1a)
        .setInteractive({ dropZone: true });
      slotDropZones.push(zone);

      // Visible slot border
      const occupant = _formation[i];
      const borderColor = occupant !== null ? 0xffcc66 : 0x555555;
      this.add
        .rectangle(x, SLOT_Y, SLOT_W, SLOT_H)
        .setFillStyle(0x000000, 0)
        .setStrokeStyle(2, borderColor);

      if (occupant === null) {
        // Empty slot label
        this.add
          .text(x, SLOT_Y, 'drag a hero here', {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#666666',
            fontStyle: 'italic',
          })
          .setOrigin(0.5);
      } else {
        // Filled slot: PixuiHeroCard in a frame-as-positioning-shim (Barracks pattern)
        const slotFrame = this.insert.topLeft.frame({
          x: x - SLOT_W / 2,
          y: SLOT_Y - SLOT_H / 2,
          width: SLOT_W,
          height: SLOT_H,
        });
        const slotCard = new PixuiHeroCard(this, occupant, { size: 'small', draggable: true });
        slotFrame.attach(slotCard);
        installDragHandlers(slotCard, occupant, x, SLOT_Y);

        // ×-remove button (pixui)
        this.insert.topLeft.button({
          x: x + SLOT_REMOVE_OFFSET_X - 8,
          y: SLOT_Y + SLOT_REMOVE_OFFSET_Y - 8,
          width: 16,
          height: 16,
          text: '×',
          onClick: () => {
            _formation[i] = null;
            this.scene.restart();
          },
        });
      }
    }

    // -----------------------------------------------------------------------
    // Eligible heroes grid — draggable PixuiHeroCards
    // -----------------------------------------------------------------------

    const formationIds = new Set(
      _formation.filter((h): h is Hero => h !== null).map((h) => h.id),
    );
    const eligibleInGrid = eligibleHeroes.filter((h) => !formationIds.has(h.id));

    const remaining = eligibleInGrid.length;
    this.add
      .text(PANEL_CX, ELIGIBLE_LABEL_Y, `ELIGIBLE (${remaining})`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);

    for (let listPos = 0; listPos < eligibleInGrid.length; listPos++) {
      const hero = eligibleInGrid[listPos];
      const col = listPos % 3;
      const row = Math.floor(listPos / 3);
      const homeAbsX = ELIGIBLE_X[col];
      const homeAbsY = ELIGIBLE_Y_BASE + row * ELIGIBLE_Y_STRIDE;

      // Frame-as-positioning-shim — places card at absolute canvas coords.
      // homeAbsX/homeAbsY are canvas-world centers for the card.
      // The frame anchor is topLeft; offset by half-card to center it.
      const CARD_W = 180;
      const CARD_H = 60;
      const cardFrame = this.insert.topLeft.frame({
        x: homeAbsX - CARD_W / 2,
        y: homeAbsY - CARD_H / 2,
        width: CARD_W,
        height: CARD_H,
      });

      const card = new PixuiHeroCard(this, hero, { size: 'small', draggable: true });
      cardFrame.attach(card);
      installDragHandlers(card, hero, homeAbsX, homeAbsY);
    }

    // -----------------------------------------------------------------------
    // Descend button
    // -----------------------------------------------------------------------

    const filledCount = _formation.filter((h) => h !== null).length;
    const canDescend = filledCount === 3;

    const descendBg = this.add
      .rectangle(
        DESCEND_X,
        DESCEND_Y,
        DESCEND_W,
        DESCEND_H,
        canDescend ? 0x2a4a2a : 0x333333,
      )
      .setStrokeStyle(2, canDescend ? 0x44cc44 : 0x555555);

    this.add
      .text(DESCEND_X, DESCEND_Y, canDescend ? 'Descend' : `Descend (${filledCount}/3)`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: canDescend ? '#ffffff' : '#777777',
      })
      .setOrigin(0.5);

    if (!canDescend) {
      this.add
        .text(DESCEND_X, REASON_Y, 'Need 3 heroes', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#cc6666',
        })
        .setOrigin(0.5, 0);
    }

    if (canDescend) {
      descendBg.setInteractive({ useHandCursor: true });
      descendBg.on('pointerdown', () => this.descend());
    }
  }

  // ---------------------------------------------------------------------------
  // Descend
  // ---------------------------------------------------------------------------

  private descend(): void {
    if (!_formation.every((h): h is Hero => h !== null)) return;
    const party = _formation as readonly Hero[];

    const seed = Date.now();
    const rng = createRng(seed);
    const runState = startRun(_selectedDungeonId, party, seed, rng);

    appState.update((s) => ({
      ...s,
      runState,
      runRngState: rng.getState(),
    }));

    _stage = 'dungeon_list';
    _formation = [null, null, null];

    this.scene.stop();
    this.scene.start('dungeon');
  }

  // ---------------------------------------------------------------------------
  // Close
  // ---------------------------------------------------------------------------

  private close(): void {
    _stage = 'dungeon_list';
    _formation = [null, null, null];
    this.scene.stop();
    this.scene.resume('camp');
  }
}
