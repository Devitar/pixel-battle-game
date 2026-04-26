import * as Phaser from 'phaser';
import type { EnemyId } from '../data/types';
import { ENEMY_SHEET, SHEET } from './frames';
import { ENEMY_VISUALS } from './enemy_sprites';
import { LAYER_ORDER, type PaperdollSlot } from './paperdoll_layers';

const OVERLAY_SLOTS: readonly Exclude<PaperdollSlot, 'body'>[] = LAYER_ORDER.filter(
  (s): s is Exclude<PaperdollSlot, 'body'> => s !== 'body',
);

export class EnemySprite extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, enemyId: EnemyId) {
    super(scene, x, y);
    const visual = ENEMY_VISUALS[enemyId];
    this.add(scene.add.image(0, 0, ENEMY_SHEET.key, visual.bodyFrame));
    for (const slot of OVERLAY_SLOTS) {
      const frame = visual[slot];
      if (frame !== undefined) {
        this.add(scene.add.image(0, 0, SHEET.key, frame));
      }
    }
    scene.add.existing(this);
  }
}
