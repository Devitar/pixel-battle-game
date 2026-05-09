import * as Phaser from 'phaser';
import { hospitalTickAmount, hospitalTreatmentCap } from '@camp/building_levels';
import { removeHero, tickRosterWounds, updateHero } from '@camp/roster';
import { addItems } from '@camp/stash';
import { credit } from '@camp/vault';
import { applyPendingMilestones } from '@run/milestones';
import { cashout, pressOn, type RunState } from '@run/run_state';
import { Button, HeroCard, assertWidgetAssetsLoaded } from '@ui/widgets';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';

// Canvas positions for party cards.
const PARTY_X = [180, 480, 780] as const;
const PARTY_Y = 240;

// Bottom action buttons (Equip / Leave / Press On).
const BOTTOM_BUTTON_W = 220;
const BOTTOM_BUTTON_H = 44;
const BOTTOM_BUTTON_Y = 540 - 30 - BOTTOM_BUTTON_H; // 30px from canvas bottom
const BOTTOM_BUTTON_X = [
  160 - BOTTOM_BUTTON_W / 2, // Equip:    button center at canvas x=160
  460 - BOTTOM_BUTTON_W / 2, // Leave:    center at 460
  760 - BOTTOM_BUTTON_W / 2, // Press On: center at 760
];

// Full-scene background colour (not a dim overlay — camp_screen owns the
// whole canvas).
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

    assertWidgetAssetsLoaded(this);

    // Full-canvas background.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, BG_COLOR)
      .setOrigin(0, 0);

    // Header (raw Phaser text — needs per-instance colour and font size).
    this.add
      .text(480, 40, 'Floor Cleared!', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#4caf50',
      })
      .setOrigin(0.5, 0.5);
    this.add
      .text(480, 78, `The Crypt · Floor ${run.currentFloorNumber}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5, 0.5);

    // Pack pill — raw Phaser rectangle + label.
    const itemCount = run.pack.items.length;
    const packLabel =
      itemCount > 0
        ? `Pack: ${run.pack.gold}g · ${itemCount} item${itemCount === 1 ? '' : 's'}`
        : `Pack: ${run.pack.gold}g`;
    const pillWidth = itemCount > 0 ? 280 : 200;
    this.add.rectangle(480, 130, pillWidth, 40, 0x2a2418).setStrokeStyle(2, 0xaa8844);
    this.add
      .text(480, 130, packLabel, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);

    // Party row — 3 large hero cards. Wound badges auto-render.
    for (let i = 0; i < run.party.length; i++) {
      new HeroCard({
        scene: this,
        x: PARTY_X[i],
        y: PARTY_Y,
        hero: run.party[i],
        size: 'large',
      });
    }

    // Fallen / Lost status lines (conditional, raw Phaser for coloured text).
    let statusY = 360;
    if (run.fallen.length > 0) {
      const names = run.fallen.map((h) => h.name).join(', ');
      this.add
        .text(480, statusY, `Fallen: ${names}`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#cc8888',
        })
        .setOrigin(0.5);
      statusY += 14;
    }
    if (run.lost.length > 0) {
      const names = run.lost.map((h) => h.name).join(', ');
      this.add
        .text(480, statusY, `Lost: ${names}`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#aa66aa',
        })
        .setOrigin(0.5);
    }

    // Bottom button row.
    const equipEnabled = this.equipButtonEnabled(run);
    new Button({
      scene: this,
      x: BOTTOM_BUTTON_X[0],
      y: BOTTOM_BUTTON_Y,
      width: BOTTOM_BUTTON_W,
      height: BOTTOM_BUTTON_H,
      enabled: equipEnabled,
      text: 'Equip',
      font: 'medium',
      fontSize: 16,
      onClick: () => {
        if (!equipEnabled) return;
        this.scene.launch('equip', { kind: 'in_run', returnTo: 'camp_screen' });
        this.scene.pause();
      },
    });
    new Button({
      scene: this,
      x: BOTTOM_BUTTON_X[1],
      y: BOTTOM_BUTTON_Y,
      width: BOTTOM_BUTTON_W,
      height: BOTTOM_BUTTON_H,
      text: `Leave (+${run.pack.gold}g to vault)`,
      font: 'medium',
      fontSize: 16,
      onClick: () => this.onLeave(),
    });
    new Button({
      scene: this,
      x: BOTTOM_BUTTON_X[2],
      y: BOTTOM_BUTTON_Y,
      width: BOTTOM_BUTTON_W,
      height: BOTTOM_BUTTON_H,
      text: `Press On > Floor ${run.currentFloorNumber + 1}`,
      font: 'medium',
      fontSize: 16,
      onClick: () => this.onPressOn(),
    });

    // Resume listener — triggered when equip scene closes and this scene
    // resumes. Restart refreshes party cards (e.g. newly equipped items).
    this.events.once(Phaser.Scenes.Events.RESUME, () => this.scene.restart());
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
