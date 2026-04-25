import * as Phaser from 'phaser';
import { resolveSaveState } from '../save/boot';
import { SHEET } from '../render/frames';
import { createRng } from '../util/rng';
import { appState } from './app_state';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.spritesheet(SHEET.key, SHEET.url, {
      frameWidth: SHEET.frameWidth,
      frameHeight: SHEET.frameHeight,
      margin: SHEET.margin,
      spacing: SHEET.spacing,
    });
  }

  create(): void {
    const rng = createRng(Date.now());
    const { saveFile } = resolveSaveState(window.localStorage, rng);
    appState.init(saveFile, window.localStorage);

    if (saveFile.runState) {
      this.scene.start('dungeon');
    } else {
      this.scene.start('camp');
    }
  }
}
