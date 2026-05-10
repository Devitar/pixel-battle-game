import * as Phaser from 'phaser';
import { listHeroes } from '@camp/roster';
import { DUNGEONS } from '@data/dungeons';
import type { DungeonDef, DungeonId, EnemyId } from '@data/types';
import type { Hero } from '@heroes/hero';
import { EnemySprite } from '@render/enemy_sprite';
import { Button, HeroCard } from '@ui/widgets';
import { startRun } from '@run/run_state';
import { createRng } from '@util/rng';
import { appState } from './app_state';
import { computeCardPositions } from './expeditions_layout';

let _stage: 'dungeon_list' | 'party_picker' = 'dungeon_list';
let _selectedDungeonId: DungeonId = 'crypt';
let _formation: (Hero | null)[] = [null, null, null];

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 920;
const PANEL_H = 460;

const TITLE_Y = 60;
const SUBTITLE_Y = 88;

// Stage 2 — slot row.
const SLOT_X = [790, 480, 170] as const;
const SLOT_Y = 165;
const SLOT_W = 220;
const SLOT_H = 80;
const SLOT_LABEL_Y = 110;

// Stage 2 — eligible grid.
const ELIGIBLE_LABEL_Y = 220;
const ELIGIBLE_X = [135, 480, 825] as const;
const ELIGIBLE_Y_BASE = 270;
const ELIGIBLE_Y_STRIDE = 60;

// Stage 2 — descend.
const DESCEND_X = 820;
const DESCEND_Y = 455;
const DESCEND_W = 180;
const DESCEND_H = 34;
const REASON_Y = 475;

export class ExpeditionsPanelScene extends Phaser.Scene {
  constructor() {
    super('expeditions_panel');
  }

  create(): void {
    // Dim overlay.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    // Panel chrome (raw rect, not pixui Frame — this scene has many
    // EnemySprite children that need predictable depth ordering).
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666);

    const titleObj = this.add
      .text(PANEL_CX, TITLE_Y, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    new Button({
      scene: this,
      x: 908,
      y: 4,
      width: 48,
      height: 32,
      text: 'X',
      font: 'medium',
      fontSize: 16,
      onClick: () => this.close(),
    });

    if (_stage === 'dungeon_list') {
      titleObj.setText('Expeditions');
      this.buildDungeonListStage();
    } else {
      const def = DUNGEONS[_selectedDungeonId];
      titleObj.setText(`${def.name} - Pick Your Party`);
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

  // --- Stage 1: Dungeon list ------------------------------------------------

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

    const title = locked ? '???' : def.name;
    const titleObj = this.add
      .text(cx - w / 2 + 16, cy - h / 2 + 12, title, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: locked ? '#666666' : '#ffffff',
      })
      .setOrigin(0, 0);

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

    if (!locked) {
      this.add
        .text(cx + w / 2 - 16, cy + h / 2 - 12, '> Click to plan', {
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

  // --- Stage 2: Party picker ------------------------------------------------

  private buildPartyPickerStage(): void {
    const eligibleHeroes = listHeroes(appState.get().roster).filter((h) => h.currentHp > 0);

    new Button({
      scene: this,
      x: 30,
      y: 28,
      width: 100,
      height: 28,
      text: '< Back',
      font: 'medium',
      fontSize: 16,
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

    const slotDropZones: Phaser.GameObjects.Rectangle[] = [];
    const slotLabels = ['SLOT 1 - FRONT', 'SLOT 2', 'SLOT 3 - BACK'];

    // Drag handler factory. The HeroCard's hit area is interactive+draggable
    // but lives inside the card's container (a Phaser.GameObjects.Container).
    // Phaser's drag system reports pointer.x/y in canvas coords; we move the
    // card's container directly so the whole visible card follows the
    // pointer. On dragend without a drop, snap back to (homeX, homeY).
    const installDragHandlers = (
      card: HeroCard,
      hero: Hero,
      homeX: number,
      homeY: number,
    ): void => {
      let grabOffsetX = 0;
      let grabOffsetY = 0;

      card.events.on('dragstart', (pointer: Phaser.Input.Pointer) => {
        grabOffsetX = pointer.x - card.container.x;
        grabOffsetY = pointer.y - card.container.y;
      });

      card.events.on('drag', (pointer: Phaser.Input.Pointer) => {
        card.container.x = pointer.x - grabOffsetX;
        card.container.y = pointer.y - grabOffsetY;
      });

      card.events.on('drop', (_p: Phaser.Input.Pointer, dropZone: Phaser.GameObjects.GameObject) => {
        const slotIndex = slotDropZones.indexOf(dropZone as Phaser.GameObjects.Rectangle);
        if (slotIndex < 0) return;

        const previousOccupant = _formation[slotIndex];
        const sourceSlotIndex = _formation.findIndex((h) => h?.id === hero.id);

        _formation[slotIndex] = hero;
        if (sourceSlotIndex !== -1) {
          _formation[sourceSlotIndex] = previousOccupant;
        }

        this.scene.restart();
      });

      card.events.on(
        'dragend',
        (_p: Phaser.Input.Pointer, _dx: number, _dy: number, dropped: boolean) => {
          if (!dropped) {
            card.container.x = homeX;
            card.container.y = homeY;
          }
        },
      );
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

      // Invisible drop zone.
      const zone = this.add
        .rectangle(x, SLOT_Y, SLOT_W, SLOT_H, 0x1a1a1a)
        .setInteractive({ dropZone: true });
      slotDropZones.push(zone);

      const occupant = _formation[i];
      const borderColor = occupant !== null ? 0xffcc66 : 0x555555;
      this.add
        .rectangle(x, SLOT_Y, SLOT_W, SLOT_H)
        .setFillStyle(0x000000, 0)
        .setStrokeStyle(2, borderColor);

      if (occupant === null) {
        this.add
          .text(x, SLOT_Y, 'drag a hero here', {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#666666',
            fontStyle: 'italic',
          })
          .setOrigin(0.5);
      } else {
        const slotCard = new HeroCard({
          scene: this,
          x,
          y: SLOT_Y,
          hero: occupant,
          size: 'small',
          draggable: true,
        });
        installDragHandlers(slotCard, occupant, x, SLOT_Y);

        // ×-remove button.
        new Button({
          scene: this,
          x: x + 92 - 8,
          y: SLOT_Y - 32 - 8,
          width: 16,
          height: 16,
          text: 'x',
          font: 'medium',
          fontSize: 14,
          onClick: () => {
            _formation[i] = null;
            this.scene.restart();
          },
        });
      }
    }

    // Eligible heroes grid.
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
      const homeX = ELIGIBLE_X[col];
      const homeY = ELIGIBLE_Y_BASE + row * ELIGIBLE_Y_STRIDE;

      const card = new HeroCard({
        scene: this,
        x: homeX,
        y: homeY,
        hero,
        size: 'small',
        draggable: true,
      });
      installDragHandlers(card, hero, homeX, homeY);
    }

    // Descend button (raw Phaser custom rect — fits the panel-bottom-right
    // position better than the standard Button widget).
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

  private close(): void {
    _stage = 'dungeon_list';
    _formation = [null, null, null];
    this.scene.stop();
    this.scene.resume('camp');
  }
}
