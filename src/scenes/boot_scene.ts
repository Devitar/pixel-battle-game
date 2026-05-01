import * as Phaser from 'phaser';
import { resolveSaveState } from '@save/boot';
import { SHEET, ENEMY_SHEET, BOSS_SHEET } from '@render/frames';
import { createRng } from '@util/rng';
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
    this.load.spritesheet(ENEMY_SHEET.key, ENEMY_SHEET.url, {
      frameWidth: ENEMY_SHEET.frameWidth,
      frameHeight: ENEMY_SHEET.frameHeight,
      margin: ENEMY_SHEET.margin,
      spacing: ENEMY_SHEET.spacing,
    });
    this.load.spritesheet(BOSS_SHEET.key, BOSS_SHEET.url, {
      frameWidth: BOSS_SHEET.frameWidth,
      frameHeight: BOSS_SHEET.frameHeight,
      margin: BOSS_SHEET.margin,
      spacing: BOSS_SHEET.spacing,
    });
  }

  create(): void {
    const rng = createRng(Date.now());
    const { saveFile } = resolveSaveState(window.localStorage, rng);
    appState.init(saveFile, window.localStorage);

    if (saveFile.runState?.status === 'camp_screen') {
      this.scene.start('camp_screen');
    } else if (saveFile.runState) {
      this.scene.start('dungeon');
    } else {
      this.scene.start('camp');
    }
  }
}
