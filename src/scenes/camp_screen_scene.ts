import * as Phaser from 'phaser';
import { hospitalTickAmount, hospitalTreatmentCap } from '@camp/building_levels';
import { removeHero, tickRosterWounds, updateHero } from '@camp/roster';
import { addItems } from '@camp/stash';
import { credit } from '@camp/vault';
import { applyPendingMilestones } from '@run/milestones';
import { cashout, pressOn, type RunState } from '@run/run_state';
import { HeroCard } from '@ui/hero_card';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';

const PARTY_X = [180, 480, 780] as const;
const PARTY_Y = 240;
const BG_COLOR = 0x1a1020;

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

    this.buildBackground();
    this.buildHeader(run);
    this.buildPackPill(run);
    this.buildPartyRow(run);
    this.buildFallenLine(run);
    this.buildButtons(run);

    this.events.on(Phaser.Scenes.Events.RESUME, () => this.scene.restart());
  }

  private buildBackground(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, BG_COLOR)
      .setOrigin(0, 0);
  }

  private buildHeader(run: RunState): void {
    this.add
      .text(480, 40, 'Floor Cleared!', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#4caf50',
      })
      .setOrigin(0.5);

    this.add
      .text(480, 78, `The Crypt · Floor ${run.currentFloorNumber}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);
  }

  private buildPackPill(run: RunState): void {
    const itemCount = run.pack.items.length;
    const label =
      itemCount > 0
        ? `Pack: ${run.pack.gold}g · ${itemCount} item${itemCount === 1 ? '' : 's'}`
        : `Pack: ${run.pack.gold}g`;
    const width = itemCount > 0 ? 280 : 200;
    this.add
      .rectangle(480, 130, width, 40, 0x2a2418)
      .setStrokeStyle(2, 0xaa8844);
    this.add
      .text(480, 130, label, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);
  }

  private buildPartyRow(run: RunState): void {
    for (let i = 0; i < run.party.length; i++) {
      new HeroCard(this, PARTY_X[i], PARTY_Y, run.party[i], { size: 'large' });
    }
  }

  private buildFallenLine(run: RunState): void {
    let y = 360;
    if (run.fallen.length > 0) {
      const names = run.fallen.map((h) => h.name).join(', ');
      this.add
        .text(480, y, `Fallen: ${names}`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#cc8888',
        })
        .setOrigin(0.5);
      y += 14;
    }
    if (run.lost.length > 0) {
      const names = run.lost.map((h) => h.name).join(', ');
      this.add
        .text(480, y, `Lost: ${names}`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#aa66aa',
        })
        .setOrigin(0.5);
    }
  }

  private buildButtons(run: RunState): void {
    // Three-button row: Equip · Leave · Press On
    const equipEnabled = this.equipButtonEnabled(run);
    const equipBg = this.add
      .rectangle(160, 470, 220, 44, equipEnabled ? 0x2a2a4a : 0x222222)
      .setStrokeStyle(2, equipEnabled ? 0x6688cc : 0x444444);
    this.add
      .text(160, 470, 'Equip', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: equipEnabled ? '#ffffff' : '#666666',
      })
      .setOrigin(0.5);
    if (equipEnabled) {
      equipBg.setInteractive({ useHandCursor: true });
      equipBg.on('pointerdown', () => {
        this.scene.launch('equip', { kind: 'in_run', returnTo: 'camp_screen' });
        this.scene.pause();
      });
    }

    const leaveBg = this.add
      .rectangle(460, 470, 220, 44, 0x2a4a2a)
      .setStrokeStyle(2, 0x44cc44);
    this.add
      .text(460, 470, `Leave (+${run.pack.gold}g to vault)`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    leaveBg.setInteractive({ useHandCursor: true });
    leaveBg.on('pointerdown', () => this.onLeave());

    const pressOnBg = this.add
      .rectangle(760, 470, 220, 44, 0x3a2a1a)
      .setStrokeStyle(2, 0xcc8844);
    this.add
      .text(760, 470, `Press On → Floor ${run.currentFloorNumber + 1}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    pressOnBg.setInteractive({ useHandCursor: true });
    pressOnBg.on('pointerdown', () => this.onPressOn());
  }

  private equipButtonEnabled(run: RunState): boolean {
    if (run.pack.items.length > 0) return true;
    for (const hero of run.party) {
      if (hero.equipment.shield || hero.equipment.outfit || hero.equipment.hat) {
        return true;
      }
    }
    return false;
  }

  private onLeave(): void {
    const run = appState.get().runState!;
    const { outcome } = cashout(run);
    const fallenIds = new Set(outcome.heroesFallen.map((h) => h.id));
    const lostIds = new Set(outcome.heroesLost.map((h) => h.id));

    appState.update((s) => {
      const vault = credit(s.vault, outcome.goldBanked);
      const stash = addItems(s.stash, outcome.itemsBanked);
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
      for (const id of lostIds) {
        if (roster.heroes.some((h) => h.id === id)) {
          roster = removeHero(roster, id);
        }
      }
      roster = tickRosterWounds(roster, hospitalTickAmount(s.buildingLevels.hospital));
      const next = {
        ...s,
        vault,
        stash,
        roster,
        hospitalTreatmentsRemaining: hospitalTreatmentCap(s.buildingLevels.hospital),
        runState: undefined,
        runRngState: undefined,
      };
      return applyPendingMilestones(next, outcome.milestonesTriggered);
    });

    this.scene.start('camp');
  }

  private onPressOn(): void {
    const state = appState.get();
    const run = state.runState!;
    const rng = createRngFromState(state.runRngState!);
    const nextRun = pressOn(run, rng);

    appState.update((s) => ({
      ...s,
      runState: nextRun,
      runRngState: rng.getState(),
    }));

    this.scene.start('dungeon');
  }
}
