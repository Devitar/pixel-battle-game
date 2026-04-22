import * as Phaser from 'phaser';
import './style.css';

class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Pixel Battle', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
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
