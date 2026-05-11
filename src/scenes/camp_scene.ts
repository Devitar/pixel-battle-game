import * as Phaser from 'phaser';
import { listHeroes } from '@camp/roster';
import { balance } from '@camp/vault';
import { clearSave, isSoftlocked } from '@save/save';
import { appState } from './app_state';

export class CampScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;

  constructor() {
    super('camp');
  }

  create(): void {
    this.buildHud();
    this.buildGround();
    type CampTile = {
      name: string; key: string; color: number; width: number; height: number;
    };
    const tiles: CampTile[] = [
      { name: 'Tavern',     key: 'tavern_panel',     color: 0x664433, width: 100, height: 110 },
      { name: 'Blacksmith', key: 'blacksmith_panel', color: 0x665533, width: 100, height: 120 },
      { name: 'Barracks',   key: 'barracks_panel',   color: 0x555555, width: 100, height: 130 },
      { name: 'Hospital',   key: 'hospital_panel',   color: 0x885566, width: 100, height: 100 },
    ];
    const unlockedBuildings = appState.get().unlocks.buildings;
    if (unlockedBuildings.includes('chapel')) {
      tiles.push({ name: 'Chapel', key: 'chapel_panel', color: 0x886688, width: 90, height: 110 });
    }
    if (unlockedBuildings.includes('training_grounds')) {
      tiles.push({ name: 'Training', key: 'training_grounds_panel', color: 0x668866, width: 100, height: 120 });
    }
    tiles.push({ name: 'Expeditions', key: 'expeditions_panel', color: 0x998866, width: 80, height: 60 });

    const FIRST_X = 180;
    const STEP_X  = tiles.length >= 7 ? 125 : 130;
    tiles.forEach((tile, i) => {
      this.buildBuilding(tile.name, FIRST_X + i * STEP_X, tile.color, tile.width, tile.height, tile.key);
    });
    this.buildDevHints();
    this.maybeBuildResetButton();

    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.refreshHud();
      this.maybeLaunchPerkPicker();
    });

    this.input.keyboard?.on('keydown-NINE', () => this.scene.start('main'));
    this.input.keyboard?.on('keydown-ZERO', () => this.scene.start('explorer'));

    this.maybeLaunchPerkPicker();
  }

  // Softlock fallback (Cluster B · 40 — Reset Camp). Renders only when the
  // player can't recruit (vault < HIRE_COST) AND can't expedition (roster
  // < PARTY_SIZE). The Tavern's free-hire path covers the common-case recovery;
  // this is the last-resort wipe-and-restart for the deeper softlock state.
  private maybeBuildResetButton(): void {
    if (!isSoftlocked(appState.get())) return;

    const x = 480;
    const y = 50;
    const bg = this.add
      .rectangle(x, y, 200, 30, 0x553333)
      .setStrokeStyle(2, 0x885555);
    this.add
      .text(x, y, 'Reset Camp (softlocked)', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffcccc',
      })
      .setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.showResetConfirm());
  }

  private showResetConfirm(): void {
    const overlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.75)
      .setOrigin(0, 0);

    const dialogBg = this.add
      .rectangle(480, 270, 480, 220, 0x222222)
      .setStrokeStyle(2, 0x885555);

    const title = this.add
      .text(480, 200, 'Reset Camp?', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffcccc',
      })
      .setOrigin(0.5);

    const body = this.add
      .text(
        480,
        250,
        'This wipes your save and starts over with a fresh roster + 500g.\nYour current heroes, gear, and progress will be lost.',
        {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#cccccc',
          align: 'center',
        },
      )
      .setOrigin(0.5);

    const cancelBg = this.add
      .rectangle(380, 330, 140, 36, 0x333333)
      .setStrokeStyle(2, 0x666666);
    const cancelLabel = this.add
      .text(380, 330, 'Cancel', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const confirmBg = this.add
      .rectangle(580, 330, 140, 36, 0x553333)
      .setStrokeStyle(2, 0xcc6666);
    const confirmLabel = this.add
      .text(580, 330, 'Reset', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const dismiss = (): void => {
      overlay.destroy();
      dialogBg.destroy();
      title.destroy();
      body.destroy();
      cancelBg.destroy();
      cancelLabel.destroy();
      confirmBg.destroy();
      confirmLabel.destroy();
    };

    cancelBg.setInteractive({ useHandCursor: true });
    cancelBg.on('pointerdown', dismiss);

    confirmBg.setInteractive({ useHandCursor: true });
    confirmBg.on('pointerdown', () => {
      dismiss();
      this.performReset();
    });
  }

  private performReset(): void {
    clearSave(window.localStorage);
    appState.reset();
    this.scene.start('boot');
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
