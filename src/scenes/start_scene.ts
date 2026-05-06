import * as Phaser from 'phaser';

const TITLE_TEXT = 'Darkane Times';
const PROMPT_TEXT = 'Tap anywhere to start';

const TITLE_COLOR = '#ffcc66';
const PROMPT_COLOR = '#cccccc';
const BG_COLOR = 0x111111;

const SCENE_W = 960;
const SCENE_H = 540;
const TITLE_Y = 200;
const PROMPT_Y = 380;

const TITLE_FONT_SIZE = '48px';
const PROMPT_FONT_SIZE = '16px';

const PROMPT_FADE_MS = 1200;
const PROMPT_ALPHA_MIN = 0.35;
const PROMPT_ALPHA_MAX = 1.0;

const AUDIO_KEY = 'theme';
const AUDIO_VOLUME = 0.5;

export class StartScene extends Phaser.Scene {
  private nextSceneId!: string;

  constructor() {
    super('start');
  }

  init(data: { nextSceneId: string }): void {
    this.nextSceneId = data.nextSceneId;
  }

  create(): void {
    this.add
      .rectangle(0, 0, SCENE_W, SCENE_H, BG_COLOR)
      .setOrigin(0, 0);

    this.add
      .text(SCENE_W / 2, TITLE_Y, TITLE_TEXT, {
        fontFamily: 'monospace',
        fontSize: TITLE_FONT_SIZE,
        color: TITLE_COLOR,
      })
      .setOrigin(0.5);

    const prompt = this.add
      .text(SCENE_W / 2, PROMPT_Y, PROMPT_TEXT, {
        fontFamily: 'monospace',
        fontSize: PROMPT_FONT_SIZE,
        color: PROMPT_COLOR,
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: { from: PROMPT_ALPHA_MAX, to: PROMPT_ALPHA_MIN },
      duration: PROMPT_FADE_MS,
      yoyo: true,
      repeat: -1,
    });

    this.sound.play(AUDIO_KEY, { loop: true, volume: AUDIO_VOLUME });

    this.input.once('pointerdown', this.advance, this);
    this.input.keyboard?.once('keydown-ENTER', this.advance, this);
    this.input.keyboard?.once('keydown-SPACE', this.advance, this);
  }

  private advance(): void {
    this.sound.stopByKey(AUDIO_KEY);
    this.scene.start(this.nextSceneId);
  }
}
