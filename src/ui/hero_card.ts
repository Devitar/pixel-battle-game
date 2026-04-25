import * as Phaser from 'phaser';
import { CLASSES } from '../data/classes';
import { TRAITS } from '../data/traits';
import type { Hero } from '../heroes/hero';
import { heroToLoadout } from '../render/hero_loadout';
import { Paperdoll } from '../render/paperdoll';

export type HeroCardSize = 'small' | 'large';

export interface HeroCardOptions {
  size: HeroCardSize;
  isDead?: boolean;
  onClick?: () => void;
}

const PAPERDOLL_SCALE_SMALL = 2;
const PAPERDOLL_SCALE_LARGE = 4;

const SMALL_WIDTH = 180;
const SMALL_HEIGHT = 56;
const LARGE_WIDTH = 280;
const LARGE_HEIGHT = 120;

export class HeroCard extends Phaser.GameObjects.Container {
  private hero: Hero;
  private opts: HeroCardOptions;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    hero: Hero,
    opts: HeroCardOptions,
  ) {
    super(scene, x, y);
    this.hero = hero;
    this.opts = opts;
    this.buildChildren();
    scene.add.existing(this);
  }

  setHero(hero: Hero): void {
    this.hero = hero;
    this.removeAll(true);
    this.buildChildren();
  }

  private buildChildren(): void {
    const { size, isDead } = this.opts;
    const w = size === 'small' ? SMALL_WIDTH : LARGE_WIDTH;
    const h = size === 'small' ? SMALL_HEIGHT : LARGE_HEIGHT;

    const borderColor = isDead ? 0x553333 : 0x444444;
    const background = this.scene.add
      .rectangle(0, 0, w, h, 0x222222)
      .setStrokeStyle(2, borderColor);
    this.add(background);

    const dollScale = size === 'small' ? PAPERDOLL_SCALE_SMALL : PAPERDOLL_SCALE_LARGE;
    const dollX = -w / 2 + (size === 'small' ? 24 : 40);
    const dollY = 0;
    const paperdoll = new Paperdoll(this.scene, dollX, dollY, heroToLoadout(this.hero));
    paperdoll.setScale(dollScale);
    if (isDead) paperdoll.setAlpha(0.5);
    this.add(paperdoll);

    const textX = dollX + (size === 'small' ? 24 : 44);
    const classDef = CLASSES[this.hero.classId];
    const traitDef = TRAITS[this.hero.traitId];

    const nameText = this.scene.add.text(
      textX,
      -h / 2 + 8,
      isDead ? `${this.hero.name} (Fallen)` : this.hero.name,
      {
        fontFamily: 'monospace',
        fontSize: size === 'small' ? '14px' : '18px',
        color: '#ffffff',
      },
    );
    this.add(nameText);

    const classLine =
      size === 'small'
        ? `${classDef.name} · ${this.hero.currentHp}/${this.hero.maxHp}`
        : classDef.name;
    const classText = this.scene.add.text(
      textX,
      nameText.y + nameText.height + 2,
      classLine,
      {
        fontFamily: 'monospace',
        fontSize: size === 'small' ? '11px' : '13px',
        color: '#aaaaaa',
      },
    );
    this.add(classText);

    let lastY = classText.y + classText.height;

    if (!isDead) {
      const barY = lastY + 4;
      const barW = size === 'small' ? 100 : 140;
      const hpRatio = Math.max(0, this.hero.currentHp / this.hero.maxHp);
      const hpBarBg = this.scene.add
        .rectangle(textX, barY, barW, 6, 0x333333)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x555555);
      const hpBarFill = this.scene.add
        .rectangle(textX, barY, barW * hpRatio, 6, this.hpColor(hpRatio))
        .setOrigin(0, 0);
      this.add(hpBarBg);
      this.add(hpBarFill);
      lastY = barY + 6;
    }

    if (size === 'large' && !isDead) {
      const statsY = lastY + 6;
      const stats = `HP ${this.hero.currentHp}/${this.hero.maxHp}   ATK ${this.hero.baseStats.attack}   DEF ${this.hero.baseStats.defense}   SPD ${this.hero.baseStats.speed}`;
      const statsText = this.scene.add.text(textX, statsY, stats, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#888888',
      });
      this.add(statsText);

      const traitText = this.scene.add.text(textX, statsY + 14, `trait: ${traitDef.name}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#888888',
      });
      this.add(traitText);
    }

    if (this.opts.onClick) {
      background.setInteractive({ useHandCursor: true });
      background.on('pointerdown', this.opts.onClick);
    }
  }

  private hpColor(ratio: number): number {
    if (ratio > 0.5) return 0x44aa44;
    if (ratio > 0.25) return 0xaaaa44;
    return 0xaa4444;
  }
}
