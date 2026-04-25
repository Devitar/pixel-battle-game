import * as Phaser from 'phaser';
import { appState } from './app_state';

export class DungeonScene extends Phaser.Scene {
  constructor() {
    super('dungeon');
  }

  create(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x111111)
      .setOrigin(0, 0);

    this.add
      .text(480, 240, 'Dungeon (stub)', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const state = appState.get();
    if (state.runState) {
      this.add
        .text(
          480,
          290,
          `Run active: ${state.runState.dungeonId}, floor ${state.runState.currentFloorNumber}`,
          {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#aaaaaa',
          },
        )
        .setOrigin(0.5);
    }

    this.add
      .text(480, 360, 'Press ESC to abandon and return to camp', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#888888',
      })
      .setOrigin(0.5);

    this.input.keyboard?.on('keydown-ESC', () => this.abandon());
  }

  private abandon(): void {
    appState.update((s) => ({ ...s, runState: undefined, runRngState: undefined }));
    this.scene.start('camp');
  }
}
