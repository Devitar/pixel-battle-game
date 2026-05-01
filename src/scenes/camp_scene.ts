import * as Phaser from 'phaser';
import { listHeroes } from '../camp/roster';
import { balance } from '../camp/vault';
import { appState } from './app_state';

export class CampScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;

  constructor() {
    super('camp');
  }

  create(): void {
    this.buildHud();
    this.buildGround();
    this.buildBuilding('Tavern', 180, 0x664433, 100, 110, 'tavern_panel');
    this.buildBuilding('Blacksmith', 300, 0x665533, 100, 120, 'blacksmith_panel');
    this.buildBuilding('Barracks', 440, 0x555555, 100, 130, 'barracks_panel');
    this.buildBuilding('Hospital', 580, 0x885566, 100, 100, 'hospital_panel');
    this.buildBuilding('Expeditions', 720, 0x998866, 80, 60, 'expeditions_panel');
    this.buildDevHints();

    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.refreshHud();
      this.maybeLaunchPerkPicker();
    });

    this.input.keyboard?.on('keydown-NINE', () => this.scene.start('main'));
    this.input.keyboard?.on('keydown-ZERO', () => this.scene.start('explorer'));

    this.maybeLaunchPerkPicker();
  }

  private maybeLaunchPerkPicker(): void {
    const pending = listHeroes(appState.get().roster).find((h) => h.pendingPerk);
    if (!pending) return;
    this.scene.launch('perk_overlay', { heroId: pending.id });
    this.scene.pause();
  }

  private buildHud(): void {
    this.goldText = this.add.text(16, 16, '', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ffcc66',
    });
    this.refreshHud();
  }

  private refreshHud(): void {
    const gold = balance(appState.get().vault);
    this.goldText.setText(`Gold: ${gold}`);
  }

  private buildGround(): void {
    this.add.rectangle(0, 480, 960, 1, 0x555555).setOrigin(0, 0);
  }

  private buildBuilding(
    label: string,
    centerX: number,
    color: number,
    w: number,
    h: number,
    panelKey: string,
  ): void {
    const top = 480 - h;
    const rect = this.add
      .rectangle(centerX, top, w, h, color)
      .setOrigin(0.5, 0)
      .setStrokeStyle(2, 0x888888);
    this.add
      .text(centerX, top + h / 2, label, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    rect.setInteractive({ useHandCursor: true });
    rect.on('pointerdown', () => {
      this.scene.launch(panelKey);
      this.scene.pause();
    });
  }

  private buildDevHints(): void {
    this.add
      .text(944, 524, '9: paperdoll · 0: sprite explorer', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#666666',
      })
      .setOrigin(1, 1);
  }
}
