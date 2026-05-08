import * as Phaser from 'phaser';
import { hospitalTreatmentCap, nextLevel } from '@camp/building_levels';
import { applyBuildingUpgrade } from '@camp/building_upgrade';
import { listHeroes, treatHeroWound, updateHero } from '@camp/roster';
import { balance, spend } from '@camp/vault';
import { HOSPITAL_TREATMENT_COST, WOUNDS, describeWoundEffect } from '@data/wounds';
import type { Hero } from '@heroes/hero';
import {
  Button,
  COLOR,
  assertWidgetAssetsLoaded,
  createBitmapText,
  createPanel,
} from '@ui/widgets';
import { appState } from './app_state';

// Survives scene.restart() so the selected hero persists across rebuilds.
let _pendingSelectedHeroId: string | null = null;

const PANEL_X = 20;
const PANEL_Y = 40;
const PANEL_W = 920;
const PANEL_H = 460;

// List pane (canvas coords)
const LIST_X = PANEL_X + 10;
const LIST_W = 380;

// Detail pane (canvas coords)
const DETAIL_X = LIST_X + LIST_W + 20;
const DETAIL_Y = PANEL_Y + 70;
const DETAIL_W = 480;
const DETAIL_H = PANEL_H - 90;

// Hero list rows
const ROW_X = LIST_X + LIST_W / 2;
const ROW_Y_BASE = PANEL_Y + 100;
const ROW_STRIDE = 56;
const ROW_W = 360;
const ROW_H = 50;
const VISIBLE_ROWS = 6;

// Wound rows inside the detail pane
const WOUND_ROW_H = 50;
const WOUND_ROW_STRIDE = 58;

export class HospitalPanelScene extends Phaser.Scene {
  // Refs for partial-update on hero selection — only the hero-row strokes
  // and the detail pane change, no full scene.restart flicker.
  private _detailContainer: Phaser.GameObjects.Container | undefined;
  private _rowBgs: { bg: Phaser.GameObjects.Rectangle; id: string }[] = [];
  // Selection. Local copy of _pendingSelectedHeroId — kept on the instance
  // so partial selectHero updates don't have to round-trip through restart.
  private _selectedHeroId: string | null = null;

  constructor() {
    super('hospital_panel');
  }

  create(): void {
    assertWidgetAssetsLoaded(this);
    this._detailContainer = undefined;
    this._rowBgs = [];

    const state = appState.get();
    const wounded = listHeroes(state.roster).filter((h) => h.wounds.length > 0);
    const cap = hospitalTreatmentCap(state.buildingLevels.hospital);
    const remaining = state.hospitalTreatmentsRemaining;
    const vaultGold = balance(state.vault);

    // Restore or default selection.
    if (_pendingSelectedHeroId && wounded.some((h) => h.id === _pendingSelectedHeroId)) {
      this._selectedHeroId = _pendingSelectedHeroId;
    } else {
      this._selectedHeroId = wounded.length > 0 ? wounded[0].id : null;
    }
    _pendingSelectedHeroId = this._selectedHeroId;

    // Outer panel chrome.
    createPanel({ scene: this, x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H });

    // Title (top strip, above the panel).
    createBitmapText({
      scene: this,
      x: 480,
      y: 12,
      text: `Hospital · ${wounded.length} wounded · ${remaining}/${cap} treatments`,
      font: 'medium',
      size: 16,
      originX: 0.5,
    });

    // Gold display (top strip, right side).
    createBitmapText({
      scene: this,
      x: 900,
      y: 12,
      text: `Gold: ${vaultGold}`,
      font: 'small',
      size: 16,
      tint: COLOR.affordable,
      originX: 1,
    });

    // Close button (top strip, far right).
    new Button({
      scene: this,
      x: 908,
      y: 4,
      width: 48,
      height: 32,
      text: 'X',
      font: 'medium',
      fontSize: 16,
      onClick: () => this.close(),
    });

    // Hospital upgrade button (top strip, left side; conditional).
    const level = state.buildingLevels.hospital;
    const next = nextLevel('hospital', level);
    if (next !== null) {
      const canAfford = vaultGold >= next.upgradeCost;
      new Button({
        scene: this,
        x: 88,
        y: 4,
        width: 200,
        height: 32,
        enabled: canAfford,
        text: `Upgrade · ${next.upgradeCost}g`,
        font: 'medium',
        fontSize: 16,
        onClick: () => {
          if (!canAfford) return;
          appState.update((s) => applyBuildingUpgrade(s, 'hospital'));
          _pendingSelectedHeroId = null;
          this.scene.restart();
        },
      });
    }

    // Hero list (left). Empty state when there are no wounded heroes.
    if (wounded.length === 0) {
      this.add
        .text(ROW_X, ROW_Y_BASE + 60, 'All heroes are healthy.', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#888888',
        })
        .setOrigin(0.5);
    } else {
      const visible = wounded.slice(0, VISIBLE_ROWS);
      for (let i = 0; i < visible.length; i++) {
        this.buildHeroRow(visible[i], i);
      }
    }

    // Detail pane content (initial build).
    this.buildDetailPane(wounded, remaining, vaultGold);

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  // Selection click — partial update: just stroke colors + detail rebuild.
  private selectHero(id: string): void {
    if (this._selectedHeroId === id) return;
    this._selectedHeroId = id;
    _pendingSelectedHeroId = id;

    for (const row of this._rowBgs) {
      const sel = row.id === id;
      row.bg.setFillStyle(sel ? COLOR.rowBgSelected : COLOR.paneBg);
      row.bg.setStrokeStyle(2, sel ? COLOR.selectionGold : COLOR.rowStroke, 1);
    }

    this.rebuildDetailPane();
  }

  // Tear down the detail container (Phaser cascades destroys to children)
  // and re-run the build with current state.
  private rebuildDetailPane(): void {
    if (this._detailContainer) {
      this._detailContainer.destroy(true);
      this._detailContainer = undefined;
    }
    const state = appState.get();
    const wounded = listHeroes(state.roster).filter((h) => h.wounds.length > 0);
    this.buildDetailPane(wounded, state.hospitalTreatmentsRemaining, balance(state.vault));
  }

  private buildHeroRow(hero: Hero, indexInPage: number): void {
    const y = ROW_Y_BASE + indexInPage * ROW_STRIDE;
    const isSelected = hero.id === this._selectedHeroId;
    const woundCount = hero.wounds.length;
    const woundLabel = `${woundCount} wound${woundCount === 1 ? '' : 's'}`;

    const bg = this.add
      .rectangle(ROW_X, y, ROW_W, ROW_H, isSelected ? COLOR.rowBgSelected : COLOR.paneBg)
      .setStrokeStyle(2, isSelected ? COLOR.selectionGold : COLOR.rowStroke, 1);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.selectHero(hero.id));
    this._rowBgs.push({ bg, id: hero.id });

    // Hero name + wound count, raw Phaser text (multi-color matches the
    // blacksmith row pattern).
    this.add
      .text(ROW_X - ROW_W / 2 + 16, y - 10, hero.name, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0, 0.5);
    this.add
      .text(ROW_X - ROW_W / 2 + 16, y + 8, woundLabel, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#cc6666',
      })
      .setOrigin(0, 0.5);
  }

  private buildDetailPane(
    wounded: readonly Hero[],
    remaining: number,
    vaultGold: number,
  ): void {
    const container = this.add.container(0, 0);
    this._detailContainer = container;

    // Subtle backdrop for the detail area.
    const bg = this.add
      .rectangle(DETAIL_X + DETAIL_W / 2, DETAIL_Y + DETAIL_H / 2, DETAIL_W, DETAIL_H, 0x1a1a1a)
      .setStrokeStyle(1, 0x333333);
    container.add(bg);

    const cx = DETAIL_X + DETAIL_W / 2;
    const selectedHero = this._selectedHeroId
      ? wounded.find((h) => h.id === this._selectedHeroId)
      : undefined;

    if (!selectedHero) {
      if (wounded.length > 0) {
        container.add(
          createBitmapText({
            scene: this,
            x: cx,
            y: DETAIL_Y + DETAIL_H / 2 - 8,
            text: 'Select a hero.',
            font: 'small',
            size: 16,
            originX: 0.5,
          }),
        );
      }
      return;
    }

    container.add(
      createBitmapText({
        scene: this,
        x: cx,
        y: DETAIL_Y + 16,
        text: selectedHero.name,
        font: 'medium',
        size: 16,
        originX: 0.5,
      }),
    );

    if (remaining === 0) {
      container.add(
        createBitmapText({
          scene: this,
          x: cx,
          y: DETAIL_Y + 44,
          text: 'Cap reached - refills after next run.',
          font: 'small',
          size: 16,
          tint: COLOR.unaffordable,
          originX: 0.5,
        }),
      );
    }

    for (let i = 0; i < selectedHero.wounds.length; i++) {
      this.buildWoundRow(container, selectedHero, i, vaultGold, remaining > 0);
    }
  }

  private buildWoundRow(
    container: Phaser.GameObjects.Container,
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

    const rowY = DETAIL_Y + 76 + woundIndex * WOUND_ROW_STRIDE;
    const rowCx = DETAIL_X + DETAIL_W / 2;
    const rowW = DETAIL_W - 24;

    // Row background — raw Phaser, subtle frame.
    const rowBg = this.add
      .rectangle(rowCx, rowY + WOUND_ROW_H / 2, rowW, WOUND_ROW_H, 0x111111)
      .setStrokeStyle(1, 0x333333);
    container.add(rowBg);

    // Wound name + effect description (raw Phaser for multi-line).
    container.add(
      this.add
        .text(DETAIL_X + 16, rowY + 8, def.name, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffcc66',
        }),
    );
    container.add(
      this.add
        .text(DETAIL_X + 16, rowY + 26, desc, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#cccccc',
        }),
    );

    // Cost label (raw Phaser — affordable/unaffordable color).
    container.add(
      this.add
        .text(DETAIL_X + DETAIL_W - 100, rowY + WOUND_ROW_H / 2, `${cost}g`, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: canAfford ? '#ffcc66' : '#cc6666',
        })
        .setOrigin(1, 0.5),
    );

    // Treat button — raw Phaser custom rect (compact, fits the row), to
    // match the per-row buttons in the blacksmith.
    const buttonCx = DETAIL_X + DETAIL_W - 50;
    const buttonBg = this.add
      .rectangle(buttonCx, rowY + WOUND_ROW_H / 2, 64, 26, canTreat ? 0x335533 : 0x333333)
      .setStrokeStyle(1, canTreat ? 0x66aa66 : 0x555555);
    container.add(buttonBg);
    container.add(
      this.add
        .text(buttonCx, rowY + WOUND_ROW_H / 2, 'Treat', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: canTreat ? '#ffffff' : '#777777',
        })
        .setOrigin(0.5),
    );
    if (canTreat) {
      buttonBg.setInteractive({ useHandCursor: true });
      buttonBg.on('pointerdown', () => this.treatWound(hero.id, woundIndex));
    }
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
    _pendingSelectedHeroId = treatedHero.wounds.length > 0 ? heroId : null;
    this.scene.restart();
  }

  private close(): void {
    _pendingSelectedHeroId = null;
    this.scene.stop();
    this.scene.resume('camp');
  }
}
