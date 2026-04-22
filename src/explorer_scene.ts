import * as Phaser from 'phaser';
import { SHEET, CATEGORIES, frameAt, firstFrameOf, type CategoryName } from './frames';

const CATEGORY_ORDER: readonly CategoryName[] = [
  'character',
  'undergarment',
  'outergarment',
  'hair',
  'hat',
  'shield',
  'weapon',
];

const GRID_SCALE = 2;
const GRID_PADDING = 4;
const GRID_ORIGIN_X = 24;
const GRID_ORIGIN_Y = 80;
const PREVIEW_SCALE = 10;

export class ExplorerScene extends Phaser.Scene {
  private catIndex = 0;
  private cursorCol = 0;
  private cursorRow = 0;

  private headerText!: Phaser.GameObjects.Text;
  private gridGroup!: Phaser.GameObjects.Group;
  private spritePreview!: Phaser.GameObjects.Image;
  private characterBase!: Phaser.GameObjects.Image;
  private dressedOverlay!: Phaser.GameObjects.Image;
  private cursorRect!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('explorer');
  }

  preload() {
    this.load.spritesheet(SHEET.key, SHEET.url, {
      frameWidth: SHEET.frameWidth,
      frameHeight: SHEET.frameHeight,
      margin: SHEET.margin,
      spacing: SHEET.spacing,
    });
  }

  create() {
    this.headerText = this.add.text(16, 16, '', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
    });

    this.add.text(16, this.scale.height - 24, '← → ↑ ↓ navigate    Q / E switch category', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#888888',
    });

    this.gridGroup = this.add.group();

    const previewY = this.scale.height / 2;
    const leftPreviewX = this.scale.width - 320;
    const rightPreviewX = this.scale.width - 120;
    const baseFrame = firstFrameOf('character');

    this.spritePreview = this.add
      .image(leftPreviewX, previewY, SHEET.key, 0)
      .setScale(PREVIEW_SCALE);
    this.characterBase = this.add
      .image(rightPreviewX, previewY, SHEET.key, baseFrame)
      .setScale(PREVIEW_SCALE);
    this.dressedOverlay = this.add
      .image(rightPreviewX, previewY, SHEET.key, 0)
      .setScale(PREVIEW_SCALE);

    const labelStyle = { fontFamily: 'monospace', fontSize: '12px', color: '#888888' };
    this.add.text(leftPreviewX, previewY + 100, 'sprite', labelStyle).setOrigin(0.5);
    this.add.text(rightPreviewX, previewY + 100, 'on character', labelStyle).setOrigin(0.5);

    const cellSize = SHEET.frameWidth * GRID_SCALE;
    this.cursorRect = this.add
      .rectangle(0, 0, cellSize + 2, cellSize + 2)
      .setStrokeStyle(2, 0xffee00)
      .setFillStyle();

    this.input.keyboard?.on('keydown-LEFT', () => this.moveCursor(-1, 0));
    this.input.keyboard?.on('keydown-RIGHT', () => this.moveCursor(1, 0));
    this.input.keyboard?.on('keydown-UP', () => this.moveCursor(0, -1));
    this.input.keyboard?.on('keydown-DOWN', () => this.moveCursor(0, 1));
    this.input.keyboard?.on('keydown-Q', () => this.switchCategory(-1));
    this.input.keyboard?.on('keydown-E', () => this.switchCategory(1));

    this.redrawGrid();
  }

  private get currentCategory(): CategoryName {
    return CATEGORY_ORDER[this.catIndex];
  }

  private get categoryWidth(): number {
    const { firstCol, lastCol } = CATEGORIES[this.currentCategory];
    return lastCol - firstCol + 1;
  }

  private moveCursor(dCol: number, dRow: number) {
    this.cursorCol = Phaser.Math.Clamp(this.cursorCol + dCol, 0, this.categoryWidth - 1);
    this.cursorRow = Phaser.Math.Clamp(this.cursorRow + dRow, 0, SHEET.rows - 1);
    this.updateSelection();
  }

  private switchCategory(delta: number) {
    this.catIndex = (this.catIndex + delta + CATEGORY_ORDER.length) % CATEGORY_ORDER.length;
    this.cursorCol = 0;
    this.cursorRow = 0;
    this.redrawGrid();
  }

  private redrawGrid() {
    this.gridGroup.clear(true, true);
    const { firstCol } = CATEGORIES[this.currentCategory];
    const cellStride = SHEET.frameWidth * GRID_SCALE + GRID_PADDING;

    for (let row = 0; row < SHEET.rows; row++) {
      for (let col = 0; col < this.categoryWidth; col++) {
        const frame = frameAt(firstCol + col, row);
        const x = GRID_ORIGIN_X + col * cellStride;
        const y = GRID_ORIGIN_Y + row * cellStride;
        const img = this.add.image(x, y, SHEET.key, frame).setScale(GRID_SCALE).setOrigin(0);
        this.gridGroup.add(img);
      }
    }

    this.updateSelection();
  }

  private updateSelection() {
    const category = this.currentCategory;
    const { firstCol, lastCol } = CATEGORIES[category];
    const sheetCol = firstCol + this.cursorCol;
    const frame = frameAt(sheetCol, this.cursorRow);

    this.headerText.setText(
      `${category}  [cols ${firstCol}–${lastCol}]    frame ${frame}   col ${sheetCol}  row ${this.cursorRow}`,
    );
    this.spritePreview.setFrame(frame);
    this.dressedOverlay.setFrame(frame);
    // In the character block the "on character" panel would just be two
    // characters stacked on each other, so hide the base there.
    this.characterBase.setVisible(category !== 'character');

    const cellStride = SHEET.frameWidth * GRID_SCALE + GRID_PADDING;
    const cellSize = SHEET.frameWidth * GRID_SCALE;
    this.cursorRect.setPosition(
      GRID_ORIGIN_X + this.cursorCol * cellStride + cellSize / 2,
      GRID_ORIGIN_Y + this.cursorRow * cellStride + cellSize / 2,
    );
  }
}
