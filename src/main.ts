import * as Phaser from 'phaser';
import './style.css';
import { MainScene } from './scenes/dev/main_scene';
import { ExplorerScene } from './scenes/dev/explorer_scene';

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
  scene: [MainScene, ExplorerScene],
});
