import { ConstraintMode, UiScene } from 'phaser-pixui';
import type { Frame } from 'phaser-pixui';
import { hospitalTreatmentCap, nextLevel } from '@camp/building_levels';
import { applyBuildingUpgrade } from '@camp/building_upgrade';
import { listHeroes, treatHeroWound, updateHero } from '@camp/roster';
import { balance, spend } from '@camp/vault';
import { HOSPITAL_TREATMENT_COST, WOUNDS, describeWoundEffect } from '@data/wounds';
import type { Hero } from '@heroes/hero';
import { uiTheme } from '@render/ui_theme';
import { appState } from './app_state';

// Survives scene.restart() calls so the selected hero persists across rebuild
let _pendingSelectedHeroId: string | null = null;

const LIST_MAX = 6;
const ROW_H = 48;
const ROW_GAP = 8;
const ROW_STRIDE = ROW_H + ROW_GAP;

export class HospitalPanelScene extends UiScene {
  private selectedHeroId: string | null = null;

  constructor() {
    super({
      key: 'hospital_panel',
      viewportConstraints: { mode: ConstraintMode.Maximum, width: 960, height: 540 },
      theme: uiTheme,
    });
  }

  create(): void {
    // pixui's ResponsiveScene reads window.innerWidth/innerHeight to size its
    // viewport — wrong for our embedded fixed-resolution game (canvas is always
    // 960×540; Phaser.Scale.FIT handles browser fitting). Patch the private
    // canvas-dim methods on this instance to use Phaser's logical canvas size,
    // then recompute the viewport before super.create() builds the UI tree.
    // Constructor-time _updateViewport ran with bad numbers but never reached
    // a render — re-running here corrects it.
    const self = this as unknown as {
      _getCanvasWidth: () => number;
      _getCanvasHeight: () => number;
      _getDevicePixelRatio: () => number;
      _updateViewport: () => void;
    };
    self._getCanvasWidth = () => this.game.scale.width;
    self._getCanvasHeight = () => this.game.scale.height;
    self._getDevicePixelRatio = () => 1;
    self._updateViewport();

    super.create();

    const state = appState.get();
    const wounded = listHeroes(state.roster).filter((h) => h.wounds.length > 0);
    const cap = hospitalTreatmentCap(state.buildingLevels.hospital);
    const remaining = state.hospitalTreatmentsRemaining;
    const vaultGold = balance(state.vault);

    // Restore or default selectedHeroId
    if (_pendingSelectedHeroId && wounded.some((h) => h.id === _pendingSelectedHeroId)) {
      this.selectedHeroId = _pendingSelectedHeroId;
    } else {
      this.selectedHeroId = wounded.length > 0 ? wounded[0].id : null;
    }
    _pendingSelectedHeroId = this.selectedHeroId;

    // Header
    const headerTitle = `Hospital · ${wounded.length} wounded · ${remaining}/${cap} treatments`;
    this.insert.top.textArea({ y: 28, text: headerTitle });
    this.insert.top.textArea({ y: 52, text: `Gold: ${vaultGold}` });
    this.insert.topRight.button({
      x: 4,
      y: 4,
      width: 48,
      text: 'X',
      onClick: () => this.close(),
    });

    // Upgrade button (top-left area)
    const level = state.buildingLevels.hospital;
    const next = nextLevel('hospital', level);
    if (next !== null) {
      const canAfford = vaultGold >= next.upgradeCost;
      this.insert.topLeft.button({
        x: 4,
        y: 4,
        width: 160,
        enabled: canAfford,
        text: `Upgrade ${next.upgradeCost}g`,
        onClick: () => {
          appState.update((s) => applyBuildingUpgrade(s, 'hospital'));
          _pendingSelectedHeroId = null;
          this.scene.restart();
        },
      });
    }

    // Left pane — wounded hero list
    const listPane = this.insert.left.frame({
      x: 8,
      y: 80,
      width: 380,
      height: -80,
    });

    if (wounded.length === 0) {
      listPane.insert.center.textArea({ text: 'All heroes are healthy.' });
    } else {
      for (let i = 0; i < wounded.length && i < LIST_MAX; i++) {
        const hero = wounded[i];
        const isSelected = hero.id === this.selectedHeroId;
        const woundText = `${hero.wounds.length} wound${hero.wounds.length === 1 ? '' : 's'}`;
        const slotY = 40 + i * ROW_STRIDE;
        listPane.insert.top.button({
          y: slotY,
          width: -16,
          height: 48,
          // 'selected' style not in theme yet — no highlight renders. Deferred to sub-spec 3.
          style: isSelected ? 'selected' : undefined,
          text: `${hero.name}  (${woundText})`,
          onClick: () => {
            _pendingSelectedHeroId = hero.id;
            this.scene.restart();
          },
        });
      }
    }

    // Right pane — detail for selected hero
    const detailPane = this.insert.right.frame({
      x: 8,
      y: 80,
      width: 440,
      height: -80,
    });

    const selectedHero = this.selectedHeroId
      ? wounded.find((h) => h.id === this.selectedHeroId)
      : undefined;

    if (!selectedHero) {
      if (wounded.length > 0) {
        detailPane.insert.center.textArea({ text: 'Select a hero.' });
      }
    } else {
      detailPane.insert.top.textArea({
        y: 20,
        text: selectedHero.name,
      });

      if (remaining === 0) {
        detailPane.insert.top.textArea({
          y: 48,
          text: 'Cap reached — refills after next run.',
        });
      }

      for (let i = 0; i < selectedHero.wounds.length; i++) {
        this.buildWoundRow(detailPane, selectedHero, i, vaultGold, remaining > 0);
      }
    }

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private buildWoundRow(
    detailPane: Frame,
    hero: Hero,
    woundIndex: number,
    vaultGold: number,
    hasTreatments: boolean,
  ): void {
    const wound = hero.wounds[woundIndex];
    const def = WOUNDS[wound.id];
    const desc = describeWoundEffect(def.effect);
    const cost = HOSPITAL_TREATMENT_COST;
    const canAfford = vaultGold >= cost;
    const canTreat = canAfford && hasTreatments;
    const rowY = 72 + woundIndex * ROW_STRIDE;

    const row = detailPane.insert.top.frame({
      y: rowY,
      width: -16,
      height: ROW_H,
    });

    row.insert.left.textArea({ x: 8, text: `${def.name}\n${desc}` });
    row.insert.right.textArea({ x: 64, text: `${cost}g` });
    row.insert.right.button({
      x: 8,
      width: 56,
      enabled: canTreat,
      text: 'Treat',
      onClick: () => this.treatWound(hero.id, woundIndex),
    });
  }

  private treatWound(heroId: string, woundIndex: number): void {
    const state = appState.get();
    const hero = listHeroes(state.roster).find((h) => h.id === heroId);
    if (!hero) return;
    if (woundIndex < 0 || woundIndex >= hero.wounds.length) return;
    const cost = HOSPITAL_TREATMENT_COST;
    if (balance(state.vault) < cost) return;
    if (state.hospitalTreatmentsRemaining <= 0) return;

    const treatedHero = treatHeroWound(hero, woundIndex);
    const newRoster = updateHero(state.roster, treatedHero);
    const newVault = spend(state.vault, cost);

    appState.update((s) => ({
      ...s,
      roster: newRoster,
      vault: newVault,
      hospitalTreatmentsRemaining: s.hospitalTreatmentsRemaining - 1,
    }));

    // Stay on this hero if more wounds remain; otherwise clear selection.
    if (treatedHero.wounds.length > 0) {
      _pendingSelectedHeroId = heroId;
    } else {
      _pendingSelectedHeroId = null;
    }
    this.scene.restart();
  }

  private close(): void {
    _pendingSelectedHeroId = null;
    this.scene.stop();
    this.scene.resume('camp');
  }
}
