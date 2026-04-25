import * as Phaser from 'phaser';
import { ENEMIES } from '../data/enemies';
import type { EnemyId } from '../data/types';

const RECT_W = 16;
const RECT_H = 24;
const TINT_BOSS = 0x882222;
const TINT_MINION = 0x664444;
const STROKE_COLOR = 0x222222;

export class EnemyPlaceholder extends Phaser.GameObjects.Container {
  private rect: Phaser.GameObjects.Rectangle;
  private originalTint: number;

  constructor(scene: Phaser.Scene, x: number, y: number, enemyId: EnemyId) {
    super(scene, x, y);
    const def = ENEMIES[enemyId];
    this.originalTint = def.role === 'boss' ? TINT_BOSS : TINT_MINION;
    this.rect = scene.add
      .rectangle(0, 0, RECT_W, RECT_H, this.originalTint)
      .setStrokeStyle(1, STROKE_COLOR);
    this.add(this.rect);
    scene.add.existing(this);
  }

  flash(color: number): void {
    this.rect.setFillStyle(color);
  }

  unflash(): void {
    this.rect.setFillStyle(this.originalTint);
  }
}
