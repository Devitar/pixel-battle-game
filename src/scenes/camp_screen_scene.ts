import * as Phaser from 'phaser';
import { removeHero, updateHero } from '../camp/roster';
import { credit } from '../camp/vault';
import { cashout } from '../run/run_state';
import { appState } from './app_state';

export class CampScreenScene extends Phaser.Scene {
  constructor() {
    super('camp_screen');
  }

  create(): void {
    const run = appState.get().runState;
    if (!run || run.status !== 'camp_screen') {
      console.warn('CampScreenScene entered without runState in camp_screen status');
      this.scene.start('camp');
      return;
    }

    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x111111).setOrigin(0, 0);

    this.add
      .text(480, 80, 'Floor Cleared!', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#4caf50',
      })
      .setOrigin(0.5);

    this.add
      .text(480, 130, `The Crypt · Floor ${run.currentFloorNumber}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    this.add
      .text(480, 170, `Pack: ${run.pack.gold}g · ${run.party.length} survivors`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);

    if (run.fallen.length > 0) {
      this.add
        .text(480, 210, `Fallen: ${run.fallen.map((h) => h.name).join(', ')}`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#cc6666',
        })
        .setOrigin(0.5);
    }

    const btnBg = this.add
      .rectangle(480, 360, 200, 40, 0x2a4a2a)
      .setStrokeStyle(2, 0x44cc44);
    this.add
      .text(480, 360, 'Return to Camp', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerdown', () => this.returnToCamp());

    this.add
      .text(480, 460, '(Tier 1 stub — Press On unlocks in task 18)', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#666666',
      })
      .setOrigin(0.5);
  }

  private returnToCamp(): void {
    const run = appState.get().runState!;
    const { outcome } = cashout(run);
    const fallenIds = new Set(outcome.heroesLost.map((h) => h.id));

    appState.update((s) => {
      const vault = credit(s.vault, outcome.goldBanked);
      let roster = s.roster;
      for (const survivor of outcome.heroesReturned) {
        if (roster.heroes.some((h) => h.id === survivor.id)) {
          roster = updateHero(roster, survivor);
        }
      }
      for (const id of fallenIds) {
        if (roster.heroes.some((h) => h.id === id)) {
          roster = removeHero(roster, id);
        }
      }
      return {
        ...s,
        vault,
        roster,
        runState: undefined,
        runRngState: undefined,
      };
    });

    this.scene.start('camp');
  }
}
