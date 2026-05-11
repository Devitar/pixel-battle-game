import * as Phaser from 'phaser';
import {
  MAX_TRAITS_PER_HERO,
  addTrait,
  chapelAddCost,
  chapelReplaceCost,
  replaceTrait,
} from '@camp/buildings/chapel';
import { listHeroes, updateHero } from '@camp/roster';
import { balance, spend } from '@camp/vault';
import { TRAITS } from '@data/traits';
import type { Hero } from '@heroes/hero';
import { createRngFromState } from '@util/rng';
import {
  Button,
  COLOR,
  createBitmapText,
  createPanel,
} from '@ui/widgets';
import { appState } from './app_state';

// Survives scene.restart() so the selected hero persists across rebuilds.
let _pendingSelectedHeroId: string | null = null;
// Survives scene.restart() so paging doesn't snap back to page 1.
// Reset to 0 when the panel closes (next visit starts at the top).
let _listPageStart = 0;

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

// Pagination arrows sit in the gap between list and detail pane, aligned
// with the first/last list rows. Mirrors hospital's pattern for parity.
const PAGE_ARROW_X = LIST_X + LIST_W + 8;
const PAGE_UP_Y = ROW_Y_BASE - 6;
const PAGE_DOWN_Y = ROW_Y_BASE + (VISIBLE_ROWS - 1) * ROW_STRIDE + 6;

// Trait rows inside the detail pane
const TRAIT_ROW_STRIDE = 48;

export class ChapelPanelScene extends Phaser.Scene {
  // Refs for partial-update on hero selection — only the hero-row strokes
  // and the detail pane change, no full scene.restart flicker.
  private _detailContainer: Phaser.GameObjects.Container | undefined;
  private _rowBgs: { bg: Phaser.GameObjects.Rectangle; id: string }[] = [];
  // Selection. Local copy of _pendingSelectedHeroId — kept on the instance
  // so partial selectHero updates don't have to round-trip through restart.
  private _selectedHeroId: string | null = null;

  constructor() {
    super('chapel_panel');
  }

  create(): void {
    this._detailContainer = undefined;
    this._rowBgs = [];

    const state = appState.get();
    const heroes = listHeroes(state.roster);
    const vaultGold = balance(state.vault);

    // Restore or default selection.
    if (_pendingSelectedHeroId && heroes.some((h) => h.id === _pendingSelectedHeroId)) {
      this._selectedHeroId = _pendingSelectedHeroId;
    } else {
      this._selectedHeroId = heroes.length > 0 ? heroes[0].id : null;
    }
    _pendingSelectedHeroId = this._selectedHeroId;

    // Outer panel chrome.
    createPanel({ scene: this, x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H });

    // Title (top strip, above the panel).
    createBitmapText({
      scene: this,
      x: 480,
      y: 12,
      text: `Chapel · ${heroes.length} hero${heroes.length === 1 ? '' : 's'}`,
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

    // Hero list (left). Empty state when there are no heroes.
    if (heroes.length === 0) {
      this.add
        .text(ROW_X, ROW_Y_BASE + 60, 'No heroes in your roster.', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#888888',
        })
        .setOrigin(0.5);
    } else {
      // Clamp page start in case the list shrank since last render.
      const maxStart = Math.max(0, heroes.length - VISIBLE_ROWS);
      if (_listPageStart > maxStart) _listPageStart = maxStart;

      const visible = heroes.slice(_listPageStart, _listPageStart + VISIBLE_ROWS);
      for (let i = 0; i < visible.length; i++) {
        this.buildHeroRow(visible[i], i);
      }

      if (heroes.length > VISIBLE_ROWS) {
        this.buildPaginationArrows(heroes.length);
      }
    }

    // Detail pane content (initial build).
    this.buildDetailPane(heroes, vaultGold);

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
    this.buildDetailPane(listHeroes(state.roster), balance(state.vault));
  }

  private buildHeroRow(hero: Hero, indexInPage: number): void {
    const y = ROW_Y_BASE + indexInPage * ROW_STRIDE;
    const isSelected = hero.id === this._selectedHeroId;
    const traitCount = hero.traitIds.length;
    const traitLabel = `${traitCount} trait${traitCount === 1 ? '' : 's'}`;

    const bg = this.add
      .rectangle(ROW_X, y, ROW_W, ROW_H, isSelected ? COLOR.rowBgSelected : COLOR.paneBg)
      .setStrokeStyle(2, isSelected ? COLOR.selectionGold : COLOR.rowStroke, 1);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.selectHero(hero.id));
    this._rowBgs.push({ bg, id: hero.id });

    this.add
      .text(ROW_X - ROW_W / 2 + 16, y - 10, hero.name, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0, 0.5);
    this.add
      .text(ROW_X - ROW_W / 2 + 16, y + 8, traitLabel, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#aabb88',
      })
      .setOrigin(0, 0.5);
  }

  private buildPaginationArrows(totalEntries: number): void {
    const canPageUp = _listPageStart > 0;
    const canPageDown = _listPageStart + VISIBLE_ROWS < totalEntries;

    const upArrow = this.add
      .text(PAGE_ARROW_X, PAGE_UP_Y, '▲', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: canPageUp ? '#cccccc' : '#444444',
      })
      .setOrigin(0, 0.5);
    if (canPageUp) {
      upArrow.setInteractive({ useHandCursor: true });
      upArrow.on('pointerdown', () => {
        _listPageStart = Math.max(0, _listPageStart - VISIBLE_ROWS);
        this.scene.restart();
      });
    }

    const downArrow = this.add
      .text(PAGE_ARROW_X, PAGE_DOWN_Y, '▼', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: canPageDown ? '#cccccc' : '#444444',
      })
      .setOrigin(0, 0.5);
    if (canPageDown) {
      downArrow.setInteractive({ useHandCursor: true });
      downArrow.on('pointerdown', () => {
        _listPageStart += VISIBLE_ROWS;
        this.scene.restart();
      });
    }
  }

  private buildDetailPane(heroes: readonly Hero[], vaultGold: number): void {
    const container = this.add.container(0, 0);
    this._detailContainer = container;

    // Subtle backdrop for the detail area.
    const bg = this.add
      .rectangle(DETAIL_X + DETAIL_W / 2, DETAIL_Y + DETAIL_H / 2, DETAIL_W, DETAIL_H, 0x1a1a1a)
      .setStrokeStyle(1, 0x333333);
    container.add(bg);

    const selectedHero = this._selectedHeroId
      ? heroes.find((h) => h.id === this._selectedHeroId)
      : undefined;

    if (!selectedHero) {
      if (heroes.length > 0) {
        container.add(
          createBitmapText({
            scene: this,
            x: DETAIL_X + DETAIL_W / 2,
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

    // Hero name heading.
    container.add(
      createBitmapText({
        scene: this,
        x: DETAIL_X + DETAIL_W / 2,
        y: DETAIL_Y + 16,
        text: `${selectedHero.name} · ${selectedHero.classId} · Lv ${selectedHero.level}`,
        font: 'medium',
        size: 16,
        originX: 0.5,
      }),
    );

    // "Current traits:" subheading.
    container.add(
      createBitmapText({
        scene: this,
        x: DETAIL_X + 16,
        y: DETAIL_Y + 44,
        text: 'Current traits:',
        font: 'small',
        size: 16,
        tint: 0xaaaaaa,
      }),
    );

    const replaceCost = chapelReplaceCost(selectedHero);

    // One row per existing trait with a Replace button.
    for (let i = 0; i < selectedHero.traitIds.length; i++) {
      this.buildTraitRow(container, selectedHero, i, replaceCost, vaultGold);
    }

    // Slots-used line + Add button below existing traits.
    const slotsY = DETAIL_Y + 70 + selectedHero.traitIds.length * TRAIT_ROW_STRIDE + 8;

    container.add(
      createBitmapText({
        scene: this,
        x: DETAIL_X + 16,
        y: slotsY,
        text: `Slots used: ${selectedHero.traitIds.length}/${MAX_TRAITS_PER_HERO}`,
        font: 'small',
        size: 16,
        tint: 0xaaaaaa,
      }),
    );

    const addCost = chapelAddCost(selectedHero);
    const atCap = selectedHero.traitIds.length >= MAX_TRAITS_PER_HERO;
    const canAffordAdd = !atCap && vaultGold >= addCost;
    const addLabel = atCap ? '+ Add — at cap' : `+ Add a trait — ${addCost}g`;

    const addBtn = new Button({
      scene: this,
      x: DETAIL_X + DETAIL_W - 240,
      y: slotsY + 20,
      width: 220,
      height: 32,
      text: addLabel,
      font: 'medium',
      fontSize: 14,
      enabled: canAffordAdd,
      onClick: () => this.doAdd(selectedHero.id),
    });
    for (const go of addBtn.gameObjects) container.add(go);
  }

  private buildTraitRow(
    container: Phaser.GameObjects.Container,
    hero: Hero,
    traitIndex: number,
    replaceCost: number,
    vaultGold: number,
  ): void {
    const trait = TRAITS[hero.traitIds[traitIndex]];
    const rowY = DETAIL_Y + 70 + traitIndex * TRAIT_ROW_STRIDE;
    const rowCx = DETAIL_X + DETAIL_W / 2;
    const rowW = DETAIL_W - 24;

    // Row background.
    const rowBg = this.add
      .rectangle(rowCx, rowY + 20, rowW, 40, 0x111111)
      .setStrokeStyle(1, 0x333333);
    container.add(rowBg);

    // Trait name.
    container.add(
      this.add
        .text(DETAIL_X + 16, rowY + 10, `• ${trait.name}`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ddcc88',
        }),
    );

    // Replace button.
    const canAfford = vaultGold >= replaceCost;
    const replaceBtn = new Button({
      scene: this,
      x: DETAIL_X + DETAIL_W - 170,
      y: rowY + 4,
      width: 150,
      height: 32,
      text: `Replace · ${replaceCost}g`,
      font: 'medium',
      fontSize: 13,
      enabled: canAfford,
      onClick: () => this.doReplace(hero.id, traitIndex),
    });
    for (const go of replaceBtn.gameObjects) container.add(go);
  }

  private doReplace(heroId: string, indexToReplace: number): void {
    const state = appState.get();
    const hero = state.roster.heroes.find((h) => h.id === heroId);
    if (!hero) return;
    const cost = chapelReplaceCost(hero);
    if (balance(state.vault) < cost) return;

    const campRng = createRngFromState(state.campRngState);
    const updatedHero = replaceTrait(hero, indexToReplace, campRng);
    const newRoster = updateHero(state.roster, updatedHero);
    const newVault = spend(state.vault, cost);
    const newCampRngState = campRng.getState();

    appState.update((s) => ({
      ...s,
      vault: newVault,
      roster: newRoster,
      campRngState: newCampRngState,
    }));

    _pendingSelectedHeroId = heroId;
    this.scene.restart();
  }

  private doAdd(heroId: string): void {
    const state = appState.get();
    const hero = state.roster.heroes.find((h) => h.id === heroId);
    if (!hero) return;
    const cost = chapelAddCost(hero);
    if (cost === Infinity || balance(state.vault) < cost) return;

    const campRng = createRngFromState(state.campRngState);
    const updatedHero = addTrait(hero, campRng);
    const newRoster = updateHero(state.roster, updatedHero);
    const newVault = spend(state.vault, cost);
    const newCampRngState = campRng.getState();

    appState.update((s) => ({
      ...s,
      vault: newVault,
      roster: newRoster,
      campRngState: newCampRngState,
    }));

    _pendingSelectedHeroId = heroId;
    this.scene.restart();
  }

  private close(): void {
    _pendingSelectedHeroId = null;
    _listPageStart = 0;
    this.scene.stop();
    this.scene.resume('camp');
  }
}
