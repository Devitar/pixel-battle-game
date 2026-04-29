import * as Phaser from 'phaser';
import { listHeroes } from '../camp/roster';
import { CLASSES } from '../data/classes';
import { CLASS_PERK_PAIRS, PERKS } from '../data/perks';
import type { PerkId } from '../data/types';
import { applyPerk, type Hero } from '../heroes/hero';
import { heroToLoadout } from '../render/hero_loadout';
import { Paperdoll } from '../render/paperdoll';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 680;
const PANEL_H = 360;

const PAPERDOLL_X = 280;
const PAPERDOLL_Y = 200;
const PAPERDOLL_SCALE = 4;

const HEADER_X = 380;
const HEADER_NAME_Y = 130;
const HEADER_CLASS_Y = 158;
const HEADER_LEVEL_Y = 184;
const HEADER_PROMPT_Y = 230;

const CARD_W = 260;
const CARD_H = 140;
const CARD_Y = 380;
const CARD_A_X = 330;
const CARD_B_X = 630;

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
    if (!hero || !hero.pendingPerk) {
      // Defensive — shouldn't happen given camp's gate, but guard against
      // scene-restart edge cases.
      this.close();
      return;
    }
    this.buildOverlay(hero);
  }

  private buildOverlay(hero: Hero): void {
    // Dim background (full canvas, click-blocking).
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    // Panel chrome.
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666);

    // Paperdoll.
    const paperdoll = new Paperdoll(this, PAPERDOLL_X, PAPERDOLL_Y, heroToLoadout(hero));
    paperdoll.setScale(PAPERDOLL_SCALE);

    // Header text.
    const classDef = CLASSES[hero.classId];
    this.add.text(HEADER_X, HEADER_NAME_Y, hero.name, {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
    });
    this.add.text(HEADER_X, HEADER_CLASS_Y, `${classDef.name} · Level ${hero.level}`, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#aaaaaa',
    });
    this.add.text(HEADER_X, HEADER_LEVEL_Y, `Reached Level ${hero.level}!`, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffcc66',
    });
    this.add.text(HEADER_X, HEADER_PROMPT_Y, 'Choose a perk:', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#aaaaaa',
    });

    // Perk cards.
    const [perkAId, perkBId] = CLASS_PERK_PAIRS[hero.classId];
    this.buildPerkCard(CARD_A_X, perkAId);
    this.buildPerkCard(CARD_B_X, perkBId);
  }

  private buildPerkCard(centerX: number, perkId: PerkId): void {
    const perk = PERKS[perkId];
    const bg = this.add
      .rectangle(centerX, CARD_Y, CARD_W, CARD_H, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444);
    this.add
      .text(centerX, CARD_Y - 30, perk.name, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.add
      .text(centerX, CARD_Y + 0, perk.description, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#dddddd',
      })
      .setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setStrokeStyle(2, 0xffcc66));
    bg.on('pointerout', () => bg.setStrokeStyle(1, 0x444444));
    bg.on('pointerdown', () => this.onPick(perkId));
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
