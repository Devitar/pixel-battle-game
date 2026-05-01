import * as Phaser from 'phaser';
import { removeHero, tickRosterWounds, updateHero } from '@camp/roster';
import { addItems } from '@camp/stash';
import { credit } from '@camp/vault';
import type { WoundId } from '@data/types';
import { WOUNDS, describeWoundEffect } from '@data/wounds';
import { chooseCampNodeEffect } from '@run/run_state';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 540;
const PANEL_H = 380;

const TITLE_Y = 110;
const BACK_X = 720;
const BACK_Y = TITLE_Y;

const OPTION_X = PANEL_CX;
const OPTION_W = 400;
const OPTION_H = 60;
const OPTION_Y_BASE = 175;
const OPTION_STRIDE = 70;

const WOUND_ROW_X = PANEL_CX;
const WOUND_ROW_W = 460;
const WOUND_ROW_H = 50;
const WOUND_ROW_Y_BASE = 175;
const WOUND_ROW_STRIDE = 56;

const PREVIEW_Y = 180;
const PREVIEW_LINE_HEIGHT = 22;
const CONFIRM_BUTTON_Y = 360;
const CONFIRM_BUTTON_W = 200;
const CONFIRM_BUTTON_H = 36;

type OverlayState = 'main' | 'treat_picker' | 'leave_confirm' | 'outcome';

type LastAction =
  | {
      kind: 'heal';
      lines: readonly { name: string; delta: number; currentHp: number; maxHp: number }[];
    }
  | { kind: 'treat'; heroName: string; woundName: string };

export class CampNodeOverlayScene extends Phaser.Scene {
  private contentContainer!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;
  private backButton?: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text };
  private state: OverlayState = 'main';
  private lastAction: LastAction | null = null;

  constructor() {
    super('camp_node_overlay');
  }

  create(): void {
    this.state = 'main';
    this.lastAction = null;
    this.buildBackgroundAndPanel();
    this.contentContainer = this.add.container(0, 0);
    this.rerender();
  }

  private buildBackgroundAndPanel(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666);

    this.titleText = this.add
      .text(PANEL_CX, TITLE_Y, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }

  private rerender(): void {
    this.contentContainer.removeAll(true);
    this.destroyBackButton();

    if (this.state === 'main') {
      this.titleText.setText('Camp');
      this.buildMain();
    } else if (this.state === 'treat_picker') {
      this.titleText.setText('Camp · Treat Wound');
      this.buildBackButton();
      this.buildTreatPicker();
    } else if (this.state === 'leave_confirm') {
      this.titleText.setText('Camp · Leave Dungeon');
      this.buildBackButton();
      this.buildLeaveConfirm();
    } else {
      // outcome
      const action = this.lastAction;
      this.titleText.setText(
        action?.kind === 'treat' ? 'Camp · Wound Treated' : 'Camp · Party Rested',
      );
      this.buildOutcome();
    }
  }

  private setOverlayState(s: OverlayState): void {
    this.state = s;
    this.rerender();
  }

  private destroyBackButton(): void {
    if (this.backButton) {
      this.backButton.bg.destroy();
      this.backButton.label.destroy();
      this.backButton = undefined;
    }
  }

  private buildBackButton(): void {
    const bg = this.add
      .rectangle(BACK_X, BACK_Y, 60, 26, 0x444444)
      .setStrokeStyle(1, 0x888888);
    const label = this.add
      .text(BACK_X, BACK_Y, 'Back', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.setOverlayState('main'));
    this.backButton = { bg, label };
  }

  private buildMain(): void {
    const run = appState.get().runState!;
    const hasWounds = run.party.some((h) => h.wounds.length > 0);

    this.buildOptionButton(0, 'Heal Party', 'Each hero recovers 25% maxHp', true, () => {
      this.applyHealParty();
    });
    this.buildOptionButton(1, 'Treat Wound', 'Heal one wound on one hero', hasWounds, () => {
      this.setOverlayState('treat_picker');
    });
    this.buildOptionButton(2, 'Leave Dungeon', 'Bank pack and return to camp', true, () => {
      this.setOverlayState('leave_confirm');
    });
  }

  private buildOptionButton(
    index: number,
    label: string,
    subtitle: string,
    enabled: boolean,
    onClick: () => void,
  ): void {
    const y = OPTION_Y_BASE + index * OPTION_STRIDE;
    const bg = this.add
      .rectangle(OPTION_X, y, OPTION_W, OPTION_H, enabled ? 0x333333 : 0x1f1f1f)
      .setStrokeStyle(1, enabled ? 0x888888 : 0x444444);
    const labelText = this.add
      .text(OPTION_X, y - 10, label, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: enabled ? '#ffffff' : '#666666',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const subtitleText = this.add
      .text(OPTION_X, y + 12, subtitle, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: enabled ? '#bbbbbb' : '#555555',
      })
      .setOrigin(0.5);

    this.contentContainer.add(bg);
    this.contentContainer.add(labelText);
    this.contentContainer.add(subtitleText);

    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', onClick);
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
      this.contentContainer.add(
        this.add
          .text(PANEL_CX, 220, 'No wounds to treat.', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#888888',
          })
          .setOrigin(0.5),
      );
      return;
    }

    for (let i = 0; i < pairs.length; i++) {
      this.buildWoundRow(pairs[i], i);
    }
  }

  private buildWoundRow(
    pair: { heroIndex: number; woundIndex: number; heroName: string; woundId: WoundId },
    rowIndex: number,
  ): void {
    const y = WOUND_ROW_Y_BASE + rowIndex * WOUND_ROW_STRIDE;
    const def = WOUNDS[pair.woundId];
    const desc = describeWoundEffect(def.effect);

    const rowBg = this.add
      .rectangle(WOUND_ROW_X, y, WOUND_ROW_W, WOUND_ROW_H, 0x222222)
      .setStrokeStyle(1, 0x444444);
    this.contentContainer.add(rowBg);

    this.contentContainer.add(
      this.add
        .text(WOUND_ROW_X - 210, y - 8, `${pair.heroName} · ${def.name}`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffffff',
        })
        .setOrigin(0, 0.5),
    );
    this.contentContainer.add(
      this.add
        .text(WOUND_ROW_X - 210, y + 10, desc, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#aaaaaa',
        })
        .setOrigin(0, 0.5),
    );

    const buttonBg = this.add
      .rectangle(WOUND_ROW_X + 180, y, 60, 26, 0x335533)
      .setStrokeStyle(1, 0x66aa66);
    this.contentContainer.add(buttonBg);
    this.contentContainer.add(
      this.add
        .text(WOUND_ROW_X + 180, y, 'Treat', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );

    buttonBg.setInteractive({ useHandCursor: true });
    buttonBg.on('pointerdown', () => this.applyTreatWound(pair.heroIndex, pair.woundIndex));
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
      this.contentContainer.add(
        this.add
          .text(PANEL_CX, PREVIEW_Y + i * PREVIEW_LINE_HEIGHT, lines[i], {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#dddddd',
          })
          .setOrigin(0.5),
      );
    }

    const buttonBg = this.add
      .rectangle(PANEL_CX, CONFIRM_BUTTON_Y, CONFIRM_BUTTON_W, CONFIRM_BUTTON_H, 0x553355)
      .setStrokeStyle(2, 0xaa66aa);
    this.contentContainer.add(buttonBg);
    this.contentContainer.add(
      this.add
        .text(PANEL_CX, CONFIRM_BUTTON_Y, 'Confirm Leave', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    buttonBg.setInteractive({ useHandCursor: true });
    buttonBg.on('pointerdown', () => this.applyLeave());
  }

  private buildOutcome(): void {
    const action = this.lastAction;
    if (!action) return;

    if (action.kind === 'heal') {
      for (let i = 0; i < action.lines.length; i++) {
        const line = action.lines[i];
        const text = line.delta > 0
          ? `${line.name}: +${line.delta} HP (${line.currentHp}/${line.maxHp})`
          : `${line.name}: full HP`;
        this.contentContainer.add(
          this.add
            .text(PANEL_CX, PREVIEW_Y + i * PREVIEW_LINE_HEIGHT, text, {
              fontFamily: 'monospace',
              fontSize: '13px',
              color: line.delta > 0 ? '#44cc44' : '#aaaaaa',
            })
            .setOrigin(0.5),
        );
      }
    } else {
      this.contentContainer.add(
        this.add
          .text(PANEL_CX, PREVIEW_Y, `${action.heroName}: ${action.woundName} treated`, {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#44cc44',
          })
          .setOrigin(0.5),
      );
    }

    const buttonBg = this.add
      .rectangle(PANEL_CX, CONFIRM_BUTTON_Y, CONFIRM_BUTTON_W, CONFIRM_BUTTON_H, 0x335533)
      .setStrokeStyle(2, 0x66aa66);
    this.contentContainer.add(buttonBg);
    this.contentContainer.add(
      this.add
        .text(PANEL_CX, CONFIRM_BUTTON_Y, 'Dismiss', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    buttonBg.setInteractive({ useHandCursor: true });
    buttonBg.on('pointerdown', () => this.closeAndResume());
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

    // Compute per-hero deltas before persisting (party indices align — heal_party
    // doesn't add or remove heroes).
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

    this.lastAction = { kind: 'heal', lines };
    this.setOverlayState('outcome');
  }

  private applyTreatWound(heroIndex: number, woundIndex: number): void {
    const run = appState.get().runState!;
    const rng = this.rng();

    // Capture hero name + wound name BEFORE applying — treat_wound removes the
    // wound from the hero, so we can't read it afterwards.
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

    this.lastAction = { kind: 'treat', heroName, woundName };
    this.setOverlayState('outcome');
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
      roster = tickRosterWounds(roster);
      return {
        ...s,
        vault,
        stash,
        roster,
        runState: undefined,
        runRngState: undefined,
      };
    });

    this.scene.stop();
    this.scene.stop('dungeon');
    this.scene.start('camp');
  }

  private closeAndResume(): void {
    this.scene.stop();
    this.scene.resume('dungeon');
  }
}
