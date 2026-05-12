import * as Phaser from 'phaser';
import { listHeroes } from '@camp/roster';
import { CLASSES } from '@data/classes';
import { CLASS_PERK_TIERS, PERKS } from '@data/perks';
import type { PerkId } from '@data/types';
import { applyPerk } from '@heroes/hero';
import { heroToLoadout } from '@render/hero_loadout';
import {
  createBitmapText,
  createPanel,
  createPaperdoll,
} from '@ui/widgets';
import { appState } from './app_state';

// Panel dimensions match the original layout for parity.
const PANEL_W = 680;
const PANEL_H = 360;
const PANEL_X = 480 - PANEL_W / 2; // 140 — centered horizontally
const PANEL_Y = 270 - PANEL_H / 2; // 90  — centered vertically
const PANEL_CX = 480;
const PANEL_CY = 270;

const PAPERDOLL_X = PANEL_CX - 200; // = 280
const PAPERDOLL_Y = PANEL_CY - 70;  // = 200
const PAPERDOLL_SCALE = 4;

const HEADER_X = PANEL_CX - 100;    // = 380
const HEADER_NAME_Y = PANEL_CY - 140; // = 130
const HEADER_CLASS_Y = PANEL_CY - 112; // = 158
const HEADER_LEVEL_Y = PANEL_CY - 86;  // = 184
const HEADER_PROMPT_Y = PANEL_CY - 40; // = 230

const CARD_W = 260;
const CARD_H = 140;
const CARD_Y = PANEL_CY + 110 - CARD_H / 2; // top of card
const CARD_A_X = PANEL_CX - 150 - CARD_W / 2; // top-left of card A
const CARD_B_X = PANEL_CX + 150 - CARD_W / 2; // top-left of card B

export class PerkOverlayScene extends Phaser.Scene {
  private heroId!: string;

  constructor() {
    super('perk_overlay');
  }

  init(data: { heroId: string }): void {
    this.heroId = data.heroId;
  }

  create(): void {
    const hero = listHeroes(appState.get().roster).find((h) => h.id === this.heroId);
    if (!hero || hero.pendingPerks.length === 0) {
      this.close();
      return;
    }

    // Dim overlay.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    // Panel chrome.
    createPanel({ scene: this, x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H });

    // Paperdoll (left side).
    createPaperdoll({
      scene: this,
      x: PAPERDOLL_X,
      y: PAPERDOLL_Y,
      loadout: heroToLoadout(hero),
      scale: PAPERDOLL_SCALE,
    });

    // Header text block. Tier reflects the oldest outstanding pending perk
    // (FIFO) — a hero who dinged 5 and then 10 in the same expedition picks
    // L5 first, then L10 on the re-open.
    const classDef = CLASSES[hero.classId];
    const currentTier = hero.pendingPerks[0];
    const tierLevel = currentTier === 'l5' ? 5 : 10;
    const remaining = hero.pendingPerks.length;
    createBitmapText({
      scene: this,
      x: HEADER_X,
      y: HEADER_NAME_Y,
      text: hero.name,
      font: 'medium',
      size: 16,
    });
    createBitmapText({
      scene: this,
      x: HEADER_X,
      y: HEADER_CLASS_Y,
      text: `${classDef.name} · Level ${hero.level}`,
      font: 'small',
      size: 16,
    });
    createBitmapText({
      scene: this,
      x: HEADER_X,
      y: HEADER_LEVEL_Y,
      text:
        remaining > 1
          ? `Reached Level ${tierLevel}! (${remaining} pending)`
          : `Reached Level ${tierLevel}!`,
      font: 'small',
      size: 16,
    });
    createBitmapText({
      scene: this,
      x: HEADER_X,
      y: HEADER_PROMPT_Y,
      text: `Choose your Level ${tierLevel} perk:`,
      font: 'small',
      size: 16,
    });

    // Perk cards — title + description with hover highlight.
    const [perkAId, perkBId] = CLASS_PERK_TIERS[hero.classId][currentTier];
    this.buildPerkCard(CARD_A_X, perkAId);
    this.buildPerkCard(CARD_B_X, perkBId);

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private buildPerkCard(cardX: number, perkId: PerkId): void {
    const perk = PERKS[perkId];

    // Bordered card background — gold border on hover, gray default. Single
    // raw Phaser rectangle handles both visual + click target.
    const card = this.add
      .rectangle(cardX + CARD_W / 2, CARD_Y + CARD_H / 2, CARD_W, CARD_H, 0x222222)
      .setStrokeStyle(1, 0x444444);
    card.setInteractive({ useHandCursor: true });
    card.on('pointerover', () => card.setStrokeStyle(2, 0xffcc66));
    card.on('pointerout', () => card.setStrokeStyle(1, 0x444444));
    card.on('pointerup', () => this.onPick(perkId));

    // Title (top of card).
    createBitmapText({
      scene: this,
      x: cardX + CARD_W / 2,
      y: CARD_Y + 16,
      text: perk.name,
      font: 'medium',
      size: 16,
      originX: 0.5,
    });

    // Description (centered below title). Raw Phaser text wraps cleanly
    // with wordWrap; bitmap text doesn't have wrap support out of the box.
    this.add
      .text(cardX + CARD_W / 2, CARD_Y + CARD_H / 2 + 8, perk.description, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#cccccc',
        wordWrap: { width: CARD_W - 24 },
        align: 'center',
      })
      .setOrigin(0.5);
  }

  private onPick(perkId: PerkId): void {
    appState.update((s) => ({
      ...s,
      roster: {
        ...s.roster,
        heroes: s.roster.heroes.map((h) =>
          h.id === this.heroId ? applyPerk(h, perkId) : h,
        ),
      },
    }));
    this.close();
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
