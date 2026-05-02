import * as Phaser from 'phaser';
import { listHeroes, treatHeroWound, updateHero } from '@camp/roster';
import { balance, spend } from '@camp/vault';
import { HOSPITAL_TREATMENT_COST, WOUNDS, describeWoundEffect } from '@data/wounds';
import type { Hero } from '@heroes/hero';
import { HeroCard } from '@ui/hero_card';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 920;
const PANEL_H = 460;

const LIST_PANE_CX = 245;
const LIST_PANE_CY = 270;
const LIST_PANE_W = 380;
const LIST_PANE_H = 360;

const DETAIL_PANE_CX = 715;
const DETAIL_PANE_CY = 270;
const DETAIL_PANE_W = 440;
const DETAIL_PANE_H = 360;

const SLOT_X = 245;
const SLOT_Y_BASE = 130;
const SLOT_STRIDE = 60;
const SLOT_BG_W = 360;
const SLOT_BG_H = 56;

const WOUND_ROW_X = DETAIL_PANE_CX;
const WOUND_ROW_Y_BASE = 140;
const WOUND_ROW_STRIDE = 56;
const WOUND_ROW_W = 400;
const WOUND_ROW_H = 48;

interface RosterCard {
  bg: Phaser.GameObjects.Rectangle;
  card: HeroCard;
  countLabel: Phaser.GameObjects.Text;
  hero: Hero;
}

export class HospitalPanelScene extends Phaser.Scene {
  private rosterCards: RosterCard[] = [];
  private selectedHeroId: string | null = null;
  private titleText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private listContainer!: Phaser.GameObjects.Container;
  private detailContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('hospital_panel');
  }

  create(): void {
    this.rosterCards = [];
    this.selectedHeroId = null;

    this.buildOverlayAndPanel();
    this.buildCloseButton();
    this.buildListPaneBackground();
    this.buildDetailPaneBackground();
    this.listContainer = this.add.container(0, 0);
    this.detailContainer = this.add.container(0, 0);

    this.rebuild();

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private buildOverlayAndPanel(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0);
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666);

    this.titleText = this.add
      .text(PANEL_CX, 60, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.goldText = this.add
      .text(890, 60, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffcc66',
      })
      .setOrigin(1, 0.5);
  }

  private buildCloseButton(): void {
    const closeBg = this.add
      .rectangle(933, 63, 28, 28, 0x553333)
      .setStrokeStyle(1, 0x885555);
    this.add
      .text(933, 63, '×', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => this.close());
  }

  private buildListPaneBackground(): void {
    this.add
      .rectangle(LIST_PANE_CX, LIST_PANE_CY, LIST_PANE_W, LIST_PANE_H, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444);
  }

  private buildDetailPaneBackground(): void {
    this.add
      .rectangle(DETAIL_PANE_CX, DETAIL_PANE_CY, DETAIL_PANE_W, DETAIL_PANE_H, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444);
  }

  private rebuild(): void {
    this.listContainer.removeAll(true);
    this.detailContainer.removeAll(true);
    this.rosterCards = [];

    const wounded = listHeroes(appState.get().roster).filter((h) => h.wounds.length > 0);

    this.titleText.setText(`Hospital · ${wounded.length} wounded`);
    this.goldText.setText(`Gold: ${balance(appState.get().vault)}`);

    if (wounded.length === 0) {
      this.listContainer.add(
        this.add
          .text(LIST_PANE_CX, LIST_PANE_CY, 'All heroes are healthy.', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#888888',
          })
          .setOrigin(0.5),
      );
      this.selectedHeroId = null;
      return;
    }

    if (!this.selectedHeroId || !wounded.some((h) => h.id === this.selectedHeroId)) {
      this.selectedHeroId = wounded[0].id;
    }

    for (let i = 0; i < wounded.length && i < 6; i++) {
      this.buildHeroSlot(wounded[i], i);
    }

    this.refreshSelectionHighlights();
    this.rebuildDetail();
  }

  private buildHeroSlot(hero: Hero, index: number): void {
    const x = SLOT_X;
    const y = SLOT_Y_BASE + index * SLOT_STRIDE;

    const bg = this.add
      .rectangle(x, y, SLOT_BG_W, SLOT_BG_H, 0x000000, 0)
      .setStrokeStyle(2, 0xffcc66, 0);
    const card = new HeroCard(this, x - 80, y, hero, { size: 'small' });
    const countLabel = this.add
      .text(x + 130, y, `${hero.wounds.length} wound${hero.wounds.length === 1 ? '' : 's'}`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#cc8866',
      })
      .setOrigin(1, 0.5);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.selectHero(hero.id));

    this.listContainer.add(bg);
    this.listContainer.add(card);
    this.listContainer.add(countLabel);

    this.rosterCards.push({ bg, card, countLabel, hero });
  }

  private selectHero(id: string): void {
    this.selectedHeroId = id;
    this.refreshSelectionHighlights();
    this.rebuildDetail();
  }

  private refreshSelectionHighlights(): void {
    for (const rc of this.rosterCards) {
      const isSelected = rc.hero.id === this.selectedHeroId;
      rc.bg.setStrokeStyle(2, 0xffcc66, isSelected ? 1 : 0);
    }
  }

  private rebuildDetail(): void {
    this.detailContainer.removeAll(true);

    const hero = this.selectedHeroId
      ? this.rosterCards.find((rc) => rc.hero.id === this.selectedHeroId)?.hero
      : undefined;

    if (!hero) return;

    this.detailContainer.add(
      this.add
        .text(DETAIL_PANE_CX, 110, hero.name, {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );

    const vaultGold = balance(appState.get().vault);

    for (let i = 0; i < hero.wounds.length; i++) {
      this.buildWoundRow(hero, i, vaultGold);
    }
  }

  private buildWoundRow(hero: Hero, woundIndex: number, vaultGold: number): void {
    const wound = hero.wounds[woundIndex];
    const def = WOUNDS[wound.id];
    const desc = describeWoundEffect(def.effect);
    const cost = HOSPITAL_TREATMENT_COST;
    const canAfford = vaultGold >= cost;
    const y = WOUND_ROW_Y_BASE + woundIndex * WOUND_ROW_STRIDE;

    const rowBg = this.add
      .rectangle(WOUND_ROW_X, y, WOUND_ROW_W, WOUND_ROW_H, 0x222222)
      .setStrokeStyle(1, 0x444444);
    this.detailContainer.add(rowBg);

    this.detailContainer.add(
      this.add
        .text(WOUND_ROW_X - 180, y, def.name, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffffff',
        })
        .setOrigin(0, 0.5),
    );

    this.detailContainer.add(
      this.add
        .text(WOUND_ROW_X - 180, y + 14, desc, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#aaaaaa',
        })
        .setOrigin(0, 0.5),
    );

    this.detailContainer.add(
      this.add
        .text(WOUND_ROW_X + 60, y, `${cost}g`, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: canAfford ? '#ffcc66' : '#cc6666',
        })
        .setOrigin(1, 0.5),
    );

    const buttonBg = this.add
      .rectangle(WOUND_ROW_X + 140, y, 60, 26, canAfford ? 0x335533 : 0x333333)
      .setStrokeStyle(1, canAfford ? 0x66aa66 : 0x555555);
    this.detailContainer.add(buttonBg);
    this.detailContainer.add(
      this.add
        .text(WOUND_ROW_X + 140, y, 'Treat', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: canAfford ? '#ffffff' : '#777777',
        })
        .setOrigin(0.5),
    );

    if (canAfford) {
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

    const treatedHero = treatHeroWound(hero, woundIndex);
    const newRoster = updateHero(state.roster, treatedHero);
    const newVault = spend(state.vault, cost);

    appState.update((s) => ({ ...s, roster: newRoster, vault: newVault }));

    this.rebuild();
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
