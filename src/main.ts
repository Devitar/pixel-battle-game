import * as Phaser from 'phaser';
import './style.css';
import { SHEET, firstFrameOf, type CategoryName } from './frames';

const SPRITE_SCALE = 6;

class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
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
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    this.add
      .text(cx, 40, 'Pixel Battle', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // Every sprite is pre-offset within its 16x16 tile, so all layers stack
    // at the same position to form a fully-equipped character.
    const layers: CategoryName[] = [
      'character',
      'undergarment',
      'outergarment',
      'hair',
      'hat',
      'shield',
      'weapon',
    ];
    for (const layer of layers) {
      this.add.image(cx, cy, SHEET.key, firstFrameOf(layer)).setScale(SPRITE_SCALE);
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#111111',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene],
});
