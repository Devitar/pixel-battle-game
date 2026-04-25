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
