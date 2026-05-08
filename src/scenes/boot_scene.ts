import * as Phaser from 'phaser';
import { resolveSaveState } from '@save/boot';
import { SHEET, ENEMY_SHEET, BOSS_SHEET } from '@render/frames';
import { ATLAS, FONT } from '@ui/widgets';
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
    this.load.audio('theme', 'assets/audio/darkane_times.ogg');

    // Custom UI atlas + bitmap fonts (replaces pixui's per-scene preload).
    // Loaded once here so every scene that uses src/ui/widgets has them.
    this.load.setPath('packed_assets');
    this.load.atlas(ATLAS, `${ATLAS}.png`, `${ATLAS}.atlas`);
    for (const fontName of Object.values(FONT)) {
      this.load.bitmapFont(fontName, 'fonts.png', `${fontName}.bmfont`);
    }
    this.load.setPath();
  }

  create(): void {
    const rng = createRng(Date.now());
    const { saveFile } = resolveSaveState(window.localStorage, rng);
    appState.init(saveFile, window.localStorage);

    const nextSceneId =
      saveFile.runState?.status === 'camp_screen' ? 'camp_screen' :
      saveFile.runState                            ? 'dungeon' :
                                                     'camp';
    this.scene.start('start', { nextSceneId });
  }
}
