import * as Phaser from 'phaser';
import { CLASSES } from '@data/classes';
import { TRAITS } from '@data/traits';
import { WOUNDS, describeWoundEffect } from '@data/wounds';
import type { Hero } from '@heroes/hero';
import { applyEquipmentStats } from '@items/stats';
import { heroToLoadout } from '@render/hero_loadout';
import { Paperdoll } from '@render/paperdoll';
import { createTooltip } from './tooltip';

export type HeroCardSize = 'small' | 'large';

export interface HeroCardOptions {
  size: HeroCardSize;
  isDead?: boolean;
  onClick?: () => void;
}

const PAPERDOLL_SCALE_SMALL = 2;
const PAPERDOLL_SCALE_LARGE = 4;

const SMALL_WIDTH = 180;
const SMALL_HEIGHT = 60;
const LARGE_WIDTH = 280;
const LARGE_HEIGHT = 120;

export class HeroCard extends Phaser.GameObjects.Container {
  private hero: Hero;
  private opts: HeroCardOptions;
  private tooltip?: Phaser.GameObjects.Container;

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
    this.tooltip = undefined; // child of `this`; cleared by removeAll(true)
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
      -h / 2 + (size === 'small' ? 6 : 8),
      isDead ? `${this.hero.name} (Fallen)` : this.hero.name,
      {
        fontFamily: 'monospace',
        fontSize: size === 'small' ? '12px' : '18px',
        color: '#ffffff',
      },
    );
    this.add(nameText);

    const classLine =
      size === 'small'
        ? `${classDef.name} · Lv ${this.hero.level} · ${this.hero.currentHp}/${this.hero.maxHp}`
        : `${classDef.name} · Lv ${this.hero.level}`;
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
      const barH = size === 'small' ? 5 : 6;
      const hpRatio = Math.max(0, this.hero.currentHp / this.hero.maxHp);
      const hpBarBg = this.scene.add
        .rectangle(textX, barY, barW, barH, 0x333333)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x555555);
      const hpBarFill = this.scene.add
        .rectangle(textX, barY, barW * hpRatio, barH, this.hpColor(hpRatio))
        .setOrigin(0, 0);
      this.add(hpBarBg);
      this.add(hpBarFill);
      lastY = barY + barH;
    }

    if (size === 'small' && !isDead) {
      const traitY = lastY + 2;
      const traitText = this.scene.add.text(
        textX,
        traitY,
        `${traitDef.name} · ${traitDef.shortDescription}`,
        {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#ccbbaa',
        },
      );
      this.add(traitText);
    }

    if (size === 'large' && !isDead) {
      const statsY = lastY + 6;
      const equipped = applyEquipmentStats(this.hero.baseStats, this.hero.equipment);
      const stats = `HP ${this.hero.currentHp}/${this.hero.maxHp}   ATK ${equipped.attack}   DEF ${equipped.defense}   SPD ${equipped.speed}`;
      const statsText = this.scene.add.text(textX, statsY, stats, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#888888',
      });
      this.add(statsText);

      const traitText = this.scene.add.text(
        textX,
        statsY + 14,
        `trait: ${traitDef.name} — ${traitDef.description}`,
        {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#888888',
        },
      );
      this.add(traitText);
    }

    if (this.hero.wounds.length > 0 && !isDead) {
      const badgeX = size === 'small' ? 75 : 125;
      const badgeY = size === 'small' ? -22 : -48;
      const badgeText = this.scene.add.text(
        badgeX,
        badgeY,
        `🩸 ${this.hero.wounds.length}`,
        {
          fontFamily: 'monospace',
          fontSize: size === 'small' ? '11px' : '13px',
          color: '#ff6666',
        },
      ).setOrigin(1, 0.5);
      this.add(badgeText);
      const wounds = this.hero.wounds;
      badgeText.setInteractive({ useHandCursor: true });
      badgeText.on('pointerdown', () => {
        const lines = wounds.map((w) => {
          const def = WOUNDS[w.id];
          return `${def.name} — ${describeWoundEffect(def.effect)}`;
        });
        this.toggleTooltip(badgeX - 30, badgeY, lines);
      });
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

  // Tap-to-toggle tooltip for the wound badge. One tooltip per card; tapping
  // the badge again dismisses it.
  private toggleTooltip(anchorX: number, anchorY: number, lines: readonly string[]): void {
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = undefined;
      return;
    }
    this.tooltip = createTooltip(this.scene, this, anchorX, anchorY, lines);
  }
}
