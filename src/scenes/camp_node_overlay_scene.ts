import { ConstraintMode, UiScene } from 'phaser-pixui';
import type { Frame } from 'phaser-pixui';
import { hospitalTickAmount, hospitalTreatmentCap } from '@camp/building_levels';
import { removeHero, tickRosterWounds, updateHero } from '@camp/roster';
import { addItems } from '@camp/stash';
import { credit } from '@camp/vault';
import type { WoundId } from '@data/types';
import { WOUNDS, describeWoundEffect } from '@data/wounds';
import { chooseCampNodeEffect } from '@run/run_state';
import { fixPixuiCanvasViewport } from '@render/pixui_canvas_fix';
import { uiTheme } from '@render/ui_theme';
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

export class CampNodeOverlayScene extends UiScene {
  constructor() {
    super({
      key: 'camp_node_overlay',
      viewportConstraints: { mode: ConstraintMode.Maximum, width: 960, height: 540 },
      theme: uiTheme,
    });
  }

  create(): void {
    fixPixuiCanvasViewport(this);
    super.create();

    // Header
    const titleText = _overlayState === 'main'
      ? 'Camp'
      : _overlayState === 'treat_picker'
        ? 'Camp · Treat Wound'
        : _overlayState === 'leave_confirm'
          ? 'Camp · Leave Dungeon'
          : _lastAction?.kind === 'treat'
            ? 'Camp · Wound Treated'
            : 'Camp · Party Rested';

    this.insert.top.textArea({ y: 28, text: titleText });

    if (_overlayState !== 'main') {
      this.insert.topLeft.button({
        x: 8,
        y: 4,
        width: 72,
        text: 'Back',
        onClick: () => this.goto('main'),
      });
    }

    this.insert.topRight.button({
      x: 4,
      y: 4,
      width: 48,
      text: 'X',
      onClick: () => this.closeAndResume(),
    });

    // Main panel
    const panel = this.insert.topLeft.frame({
      x: 160,
      y: 60,
      width: 640,
      height: 400,
    });

    if (_overlayState === 'main') {
      this.buildMain(panel);
    } else if (_overlayState === 'treat_picker') {
      this.buildTreatPicker(panel);
    } else if (_overlayState === 'leave_confirm') {
      this.buildLeaveConfirm(panel);
    } else {
      this.buildOutcome(panel);
    }

    this.input.keyboard?.on('keydown-ESC', () => this.closeAndResume());
  }

  private buildMain(panel: Frame): void {
    const run = appState.get().runState!;
    const hasWounds = run.party.some((h) => h.wounds.length > 0);

    const optionH = 60;
    const optionStride = 72;

    this.buildOptionRow(panel, 0, optionStride, optionH, 'Heal Party', 'Each hero recovers 25% maxHp', true, () => {
      this.applyHealParty();
    });
    this.buildOptionRow(panel, 1, optionStride, optionH, 'Treat Wound', 'Heal one wound on one hero', hasWounds, () => {
      this.goto('treat_picker');
    });
    this.buildOptionRow(panel, 2, optionStride, optionH, 'Leave Dungeon', 'Bank pack and return to camp', true, () => {
      this.goto('leave_confirm');
    });
  }

  private buildOptionRow(
    panel: Frame,
    index: number,
    stride: number,
    rowH: number,
    label: string,
    subtitle: string,
    enabled: boolean,
    onClick: () => void,
  ): void {
    const rowY = 16 + index * stride;
    const row = panel.insert.topLeft.frame({ x: 16, y: rowY, width: -32, height: rowH });
    row.insert.topLeft.textArea({ x: 12, y: 8, text: label });
    row.insert.topLeft.textArea({ x: 12, y: 32, text: subtitle });
    if (enabled) {
      row.insert.right.button({
        x: 8,
        width: 100,
        text: 'Select',
        onClick,
      });
    }
  }

  private buildTreatPicker(panel: Frame): void {
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
      panel.insert.center.textArea({ text: 'No wounds to treat.' });
      return;
    }

    const rowH = 52;
    const rowStride = 60;

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      const def = WOUNDS[pair.woundId];
      const desc = describeWoundEffect(def.effect);
      const rowY = 16 + i * rowStride;

      const row = panel.insert.topLeft.frame({ x: 16, y: rowY, width: -32, height: rowH });
      row.insert.topLeft.textArea({ x: 12, y: 8, text: `${pair.heroName} · ${def.name}` });
      row.insert.topLeft.textArea({ x: 12, y: 30, text: desc });
      row.insert.right.button({
        x: 8,
        width: 80,
        text: 'Treat',
        onClick: () => this.applyTreatWound(pair.heroIndex, pair.woundIndex),
      });
    }
  }

  private buildLeaveConfirm(panel: Frame): void {
    const run = appState.get().runState!;
    const lines: string[] = [
      `Bank ${run.pack.gold}g and ${run.pack.items.length} item${run.pack.items.length === 1 ? '' : 's'}.`,
      `${run.party.length} hero${run.party.length === 1 ? '' : 'es'} return safe.`,
    ];
    if (run.lost.length > 0) {
      lines.push(`(${run.lost.length} hero${run.lost.length === 1 ? ' was' : 'es were'} Lost.)`);
    }

    for (let i = 0; i < lines.length; i++) {
      panel.insert.topLeft.textArea({ x: 16, y: 20 + i * 26, text: lines[i] });
    }

    panel.insert.bottom.button({
      y: 12,
      width: 200,
      text: 'Confirm Leave',
      onClick: () => this.applyLeave(),
    });
  }

  private buildOutcome(panel: Frame): void {
    const action = _lastAction;
    if (!action) return;

    if (action.kind === 'heal') {
      for (let i = 0; i < action.lines.length; i++) {
        const line = action.lines[i];
        const text = line.delta > 0
          ? `${line.name}: +${line.delta} HP (${line.currentHp}/${line.maxHp})`
          : `${line.name}: full HP`;
        panel.insert.topLeft.textArea({ x: 16, y: 20 + i * 26, text });
      }
    } else {
      panel.insert.topLeft.textArea({ x: 16, y: 20, text: `${action.heroName}: ${action.woundName} treated` });
    }

    panel.insert.bottom.button({
      y: 12,
      width: 160,
      text: 'Dismiss',
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
