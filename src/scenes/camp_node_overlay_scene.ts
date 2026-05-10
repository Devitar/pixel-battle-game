import * as Phaser from 'phaser';
import { hospitalTickAmount, hospitalTreatmentCap } from '@camp/building_levels';
import { removeHero, tickRosterWounds, updateHero } from '@camp/roster';
import { addItems } from '@camp/stash';
import { credit } from '@camp/vault';
import type { WoundId } from '@data/types';
import { WOUNDS, describeWoundEffect } from '@data/wounds';
import { chooseCampNodeEffect } from '@run/run_state';
import {
  Button,
  createBitmapText,
  createPanel,
} from '@ui/widgets';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';

type OverlayState = 'main' | 'treat_picker' | 'leave_confirm' | 'outcome';

type LastAction =
  | {
      kind: 'heal';
      lines: readonly { name: string; delta: number; currentHp: number; maxHp: number }[];
    }
  | { kind: 'treat'; heroName: string; woundName: string };

// Module-level state persists across scene.restart().
let _overlayState: OverlayState = 'main';
let _lastAction: LastAction | null = null;

const PANEL_X = 160;
const PANEL_Y = 80;
const PANEL_W = 640;
const PANEL_H = 400;

const ROW_X = PANEL_X + 16;
const ROW_W = PANEL_W - 32;

export class CampNodeOverlayScene extends Phaser.Scene {
  constructor() {
    super('camp_node_overlay');
  }

  create(): void {
    // Dim overlay.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    const titleText =
      _overlayState === 'main'
        ? 'Camp'
        : _overlayState === 'treat_picker'
          ? 'Camp - Treat Wound'
          : _overlayState === 'leave_confirm'
            ? 'Camp - Leave Dungeon'
            : _lastAction?.kind === 'treat'
              ? 'Camp - Wound Treated'
              : 'Camp - Party Rested';

    createBitmapText({
      scene: this,
      x: 480,
      y: 12,
      text: titleText,
      font: 'medium',
      size: 16,
      originX: 0.5,
    });

    if (_overlayState !== 'main') {
      new Button({
        scene: this,
        x: 16,
        y: 4,
        width: 80,
        height: 32,
        text: 'Back',
        font: 'medium',
        fontSize: 16,
        onClick: () => this.goto('main'),
      });
    }

    new Button({
      scene: this,
      x: 908,
      y: 4,
      width: 48,
      height: 32,
      text: 'X',
      font: 'medium',
      fontSize: 16,
      onClick: () => this.closeAndResume(),
    });

    createPanel({ scene: this, x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H });

    if (_overlayState === 'main') {
      this.buildMain();
    } else if (_overlayState === 'treat_picker') {
      this.buildTreatPicker();
    } else if (_overlayState === 'leave_confirm') {
      this.buildLeaveConfirm();
    } else {
      this.buildOutcome();
    }

    this.input.keyboard?.on('keydown-ESC', () => this.closeAndResume());
  }

  private buildMain(): void {
    const run = appState.get().runState!;
    const hasWounds = run.party.some((h) => h.wounds.length > 0);

    const stride = 80;
    const baseY = PANEL_Y + 30;

    this.buildOptionRow(baseY, 'Heal Party', 'Each hero recovers 25% maxHp', true, () =>
      this.applyHealParty(),
    );
    this.buildOptionRow(baseY + stride, 'Treat Wound', 'Heal one wound on one hero', hasWounds, () =>
      this.goto('treat_picker'),
    );
    this.buildOptionRow(baseY + stride * 2, 'Leave Dungeon', 'Bank pack and return to camp', true, () =>
      this.goto('leave_confirm'),
    );
  }

  private buildOptionRow(
    rowTopY: number,
    label: string,
    subtitle: string,
    enabled: boolean,
    onClick: () => void,
  ): void {
    const rowH = 60;
    // Subtle row backdrop.
    this.add
      .rectangle(ROW_X + ROW_W / 2, rowTopY + rowH / 2, ROW_W, rowH, 0x111111)
      .setStrokeStyle(1, 0x333333);

    this.add.text(ROW_X + 12, rowTopY + 8, label, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffffff',
    });
    this.add.text(ROW_X + 12, rowTopY + 32, subtitle, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#aaaaaa',
    });

    if (enabled) {
      new Button({
        scene: this,
        x: ROW_X + ROW_W - 116,
        y: rowTopY + 14,
        width: 100,
        height: 32,
        text: 'Select',
        font: 'medium',
        fontSize: 16,
        onClick,
      });
    }
  }

  private buildTreatPicker(): void {
    const run = appState.get().runState!;
    const pairs: { heroIndex: number; woundIndex: number; heroName: string; woundId: WoundId }[] = [];
    for (let hi = 0; hi < run.party.length; hi++) {
      const hero = run.party[hi];
      for (let wi = 0; wi < hero.wounds.length; wi++) {
        pairs.push({
          heroIndex: hi,
          woundIndex: wi,
          heroName: hero.name,
          woundId: hero.wounds[wi].id,
        });
      }
    }

    if (pairs.length === 0) {
      createBitmapText({
        scene: this,
        x: PANEL_X + PANEL_W / 2,
        y: PANEL_Y + PANEL_H / 2 - 8,
        text: 'No wounds to treat.',
        font: 'small',
        size: 16,
        originX: 0.5,
      });
      return;
    }

    const rowH = 52;
    const stride = 60;
    const baseY = PANEL_Y + 30;

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      const def = WOUNDS[pair.woundId];
      const desc = describeWoundEffect(def.effect);
      const rowTopY = baseY + i * stride;

      this.add
        .rectangle(ROW_X + ROW_W / 2, rowTopY + rowH / 2, ROW_W, rowH, 0x111111)
        .setStrokeStyle(1, 0x333333);

      this.add.text(ROW_X + 12, rowTopY + 8, `${pair.heroName} · ${def.name}`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
      });
      this.add.text(ROW_X + 12, rowTopY + 28, desc, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#cccccc',
      });

      new Button({
        scene: this,
        x: ROW_X + ROW_W - 96,
        y: rowTopY + 10,
        width: 80,
        height: 32,
        text: 'Treat',
        font: 'medium',
        fontSize: 16,
        onClick: () => this.applyTreatWound(pair.heroIndex, pair.woundIndex),
      });
    }
  }

  private buildLeaveConfirm(): void {
    const run = appState.get().runState!;
    const lines: string[] = [
      `Bank ${run.pack.gold}g and ${run.pack.items.length} item${run.pack.items.length === 1 ? '' : 's'}.`,
      `${run.party.length} hero${run.party.length === 1 ? '' : 'es'} return safe.`,
    ];
    if (run.lost.length > 0) {
      lines.push(`(${run.lost.length} hero${run.lost.length === 1 ? ' was' : 'es were'} Lost.)`);
    }

    for (let i = 0; i < lines.length; i++) {
      createBitmapText({
        scene: this,
        x: PANEL_X + 16,
        y: PANEL_Y + 30 + i * 28,
        text: lines[i],
        font: 'small',
        size: 16,
      });
    }

    new Button({
      scene: this,
      x: PANEL_X + PANEL_W / 2 - 100,
      y: PANEL_Y + PANEL_H - 60,
      width: 200,
      height: 32,
      text: 'Confirm Leave',
      font: 'medium',
      fontSize: 16,
      onClick: () => this.applyLeave(),
    });
  }

  private buildOutcome(): void {
    const action = _lastAction;
    if (!action) return;

    if (action.kind === 'heal') {
      for (let i = 0; i < action.lines.length; i++) {
        const line = action.lines[i];
        const text =
          line.delta > 0
            ? `${line.name}: +${line.delta} HP (${line.currentHp}/${line.maxHp})`
            : `${line.name}: full HP`;
        createBitmapText({
          scene: this,
          x: PANEL_X + 16,
          y: PANEL_Y + 30 + i * 28,
          text,
          font: 'small',
          size: 16,
        });
      }
    } else {
      createBitmapText({
        scene: this,
        x: PANEL_X + 16,
        y: PANEL_Y + 30,
        text: `${action.heroName}: ${action.woundName} treated`,
        font: 'small',
        size: 16,
      });
    }

    new Button({
      scene: this,
      x: PANEL_X + PANEL_W / 2 - 80,
      y: PANEL_Y + PANEL_H - 60,
      width: 160,
      height: 32,
      text: 'Dismiss',
      font: 'medium',
      fontSize: 16,
      onClick: () => this.closeAndResume(),
    });
  }

  private goto(state: OverlayState): void {
    _overlayState = state;
    this.scene.restart();
  }

  private rng() {
    const rngState = appState.get().runRngState;
    if (rngState === undefined) {
      throw new Error('CampNodeOverlayScene: runRngState missing');
    }
    return createRngFromState(rngState);
  }

  private applyHealParty(): void {
    const run = appState.get().runState!;
    const rng = this.rng();
    const result = chooseCampNodeEffect(run, { kind: 'heal_party' }, rng);

    const lines = run.party.map((preHero, i) => {
      const post = result.runState.party[i];
      return {
        name: post.name,
        delta: post.currentHp - preHero.currentHp,
        currentHp: post.currentHp,
        maxHp: post.maxHp,
      };
    });

    appState.update((s) => ({
      ...s,
      runState: result.runState,
      runRngState: rng.getState(),
    }));

    _lastAction = { kind: 'heal', lines };
    this.goto('outcome');
  }

  private applyTreatWound(heroIndex: number, woundIndex: number): void {
    const run = appState.get().runState!;
    const rng = this.rng();

    // Capture hero name + wound name BEFORE applying — treat_wound removes
    // the wound from the hero, so we can't read it afterwards.
    const heroName = run.party[heroIndex].name;
    const woundName = WOUNDS[run.party[heroIndex].wounds[woundIndex].id].name;

    const result = chooseCampNodeEffect(
      run,
      { kind: 'treat_wound', heroIndex, woundIndex },
      rng,
    );
    appState.update((s) => ({
      ...s,
      runState: result.runState,
      runRngState: rng.getState(),
    }));

    _lastAction = { kind: 'treat', heroName, woundName };
    this.goto('outcome');
  }

  private applyLeave(): void {
    const run = appState.get().runState!;
    const rng = this.rng();
    const result = chooseCampNodeEffect(run, { kind: 'leave' }, rng);
    const outcome = result.outcome!;
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
      return {
        ...s,
        vault,
        stash,
        roster,
        hospitalTreatmentsRemaining: hospitalTreatmentCap(s.buildingLevels.hospital),
        runState: undefined,
        runRngState: undefined,
      };
    });

    _overlayState = 'main';
    _lastAction = null;
    this.scene.stop();
    this.scene.stop('corridor');
    this.scene.start('camp');
  }

  private closeAndResume(): void {
    _overlayState = 'main';
    _lastAction = null;
    this.scene.stop();
    this.scene.resume('corridor');
  }
}
