import * as Phaser from 'phaser';
import { listHeroes } from '../camp/roster';
import { balance } from '../camp/vault';
import { appState } from './app_state';

export class CampScene extends Phaser.Scene {
  constructor() {
    super('camp');
  }

  create(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const state = appState.get();
    const heroCount = listHeroes(state.roster).length;
    const gold = balance(state.vault);

    this.add
      .text(cx, cy - 60, 'Camp (stub)', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy, `Heroes: ${heroCount}   Gold: ${gold}`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + 60, 'Press 1 for Paperdoll Demo · 2 for Sprite Explorer', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#666666',
      })
      .setOrigin(0.5);

    this.input.keyboard?.on('keydown-ONE', () => this.scene.start('main'));
    this.input.keyboard?.on('keydown-TWO', () => this.scene.start('explorer'));
  }
}
