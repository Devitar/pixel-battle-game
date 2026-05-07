import { Container, BitmapText, Rectangle, Clickable, Image, OriginX, OriginY } from 'phaser-pixui';
import type { Scene } from 'phaser';
import type { Hero } from '@heroes/hero';
import { CLASSES } from '@data/classes';
import { TRAITS } from '@data/traits';
import { heroToLoadout } from '@render/hero_loadout';
import { PixuiPaperdoll } from '@render/pixui_paperdoll';

// Bitmap font names registered by uiTheme in src/render/ui_theme.ts
const FONT_SMALL = 'mana_roots';
const FONT_MEDIUM = 'mana_trunk';

export type PixuiHeroCardSize = 'small' | 'large';

export interface PixuiHeroCardOptions {
  size: PixuiHeroCardSize;
  isDead?: boolean;
  onClick?: () => void;
}

const PAPERDOLL_SCALE_SMALL = 2;
const PAPERDOLL_SCALE_LARGE = 4;

const SMALL_W = 180;
const SMALL_H = 60;
const LARGE_W = 280;
const LARGE_H = 120;

// HP bar colors
const HP_HIGH = 0x44aa44;
const HP_MID = 0xaaaa44;
const HP_LOW = 0xaa4444;

/**
 * pixui-native hero card — Container of PixuiPaperdoll + BitmapText labels +
 * Rectangle HP bar + Clickable overlay. Same external API as HeroCard.
 *
 * Why BitmapText/Rectangle instead of TextArea/Progress: those are
 * StyledComponents whose constructors require an InsertContext (not a Scene).
 * BitmapText and Rectangle take Scene directly and are the correct primitives
 * for a self-contained Container subclass.
 *
 * Hover tooltip: createTooltip() requires a Phaser.GameObjects.Container as
 * parent, which PixuiHeroCard is not. Tooltip is added to the scene root
 * directly via scene.add.container and tracked for manual cleanup.
 */
export class PixuiHeroCard extends Container {
  private hero: Hero;
  private opts: PixuiHeroCardOptions;

  constructor(scene: Scene, hero: Hero, opts: PixuiHeroCardOptions) {
    const w = opts.size === 'large' ? LARGE_W : SMALL_W;
    const h = opts.size === 'large' ? LARGE_H : SMALL_H;
    super(scene, { width: w, height: h });
    this.hero = hero;
    this.opts = opts;
    this.build();
  }

  // No setHero() / in-place rebuild method. pixui's Container has no clear()
  // primitive, and a partial implementation that only destroys Renderable
  // .internal handles leaves zombie entries in Container._children. Callers
  // wanting to display a different hero should rebuild via scene.restart()
  // (same pattern Tavern uses), or construct a fresh PixuiHeroCard.

  private build(): void {
    const { size, isDead } = this.opts;
    const isLarge = size === 'large';
    const w = isLarge ? LARGE_W : SMALL_W;
    const h = isLarge ? LARGE_H : SMALL_H;
    const paperdollScale = isLarge ? PAPERDOLL_SCALE_LARGE : PAPERDOLL_SCALE_SMALL;

    // Background
    const bg = new Rectangle(this.scene, {
      width: w,
      height: h,
      fillColor: 0x222222,
      borderColor: isDead ? 0x553333 : 0x444444,
      borderWidth: 2,
    });
    this.attach(bg);

    // Paperdoll — positioned left-of-center
    const dollOffsetX = isLarge ? -80 : -60;
    const paperdoll = new PixuiPaperdoll(
      this.scene,
      heroToLoadout(this.hero),
      { scale: paperdollScale },
    );
    paperdoll.localX = dollOffsetX;
    this.attach(paperdoll);

    if (isDead) {
      paperdoll.forEach((child) => {
        if ('tint' in child) {
          (child as Image).tint = 0x884444;
        }
      });
    }

    // Text column — right side. Use top-left origin so y offsets stack naturally.
    const textX = isLarge ? 30 : 10;
    const textOffsetFromTop = isLarge ? 12 : 6;

    const classDef = CLASSES[this.hero.classId];
    const traitDef = TRAITS[this.hero.traitId];

    const nameLabel = isDead ? `${this.hero.name} (Fallen)` : this.hero.name;
    const nameLine = new BitmapText(this.scene, {
      font: FONT_MEDIUM,
      text: nameLabel,
      x: textX,
      y: textOffsetFromTop,
    });
    this.attach(nameLine, OriginX.Left, OriginY.Top);

    const classLine = isLarge
      ? `${classDef.name} · Lv ${this.hero.level}`
      : `${classDef.name} · Lv ${this.hero.level} · ${this.hero.currentHp}/${this.hero.maxHp}`;
    const classText = new BitmapText(this.scene, {
      font: FONT_SMALL,
      text: classLine,
      x: textX,
      y: textOffsetFromTop + (isLarge ? 24 : 16),
    });
    this.attach(classText, OriginX.Left, OriginY.Top);

    // HP bar (skip for dead heroes)
    if (!isDead) {
      const barY = textOffsetFromTop + (isLarge ? 52 : 32);
      const barW = isLarge ? 140 : 100;
      const barH = isLarge ? 6 : 5;
      const hpRatio = Math.max(0, this.hero.currentHp / this.hero.maxHp);
      const hpColor = hpRatio > 0.5 ? HP_HIGH : hpRatio > 0.25 ? HP_MID : HP_LOW;

      const hpBg = new Rectangle(this.scene, {
        width: barW,
        height: barH,
        fillColor: 0x333333,
        borderColor: 0x555555,
        borderWidth: 1,
        x: textX,
        y: barY,
      });
      this.attach(hpBg, OriginX.Left, OriginY.Top);

      if (hpRatio > 0) {
        const hpFill = new Rectangle(this.scene, {
          width: Math.max(1, Math.round(barW * hpRatio)),
          height: barH,
          fillColor: hpColor,
          x: textX,
          y: barY,
        });
        this.attach(hpFill, OriginX.Left, OriginY.Top);
      }

      // Trait line
      const traitY = barY + barH + (isLarge ? 6 : 3);
      const traitLabel = isLarge
        ? `${traitDef.name} — ${traitDef.description}`
        : `${traitDef.name} · ${traitDef.shortDescription}`;
      const traitText = new BitmapText(this.scene, {
        font: FONT_SMALL,
        text: traitLabel,
        x: textX,
        y: traitY,
      });
      this.attach(traitText, OriginX.Left, OriginY.Top);
    }

    // Clickable overlay — covers the whole card, on top of everything
    const clickable = new Clickable(this.scene, {
      width: w,
      height: h,
      onClick: this.opts.onClick,
    });
    // Wire hover events via the events EventEmitter (Clickable.events is a Phaser
    // container that emits pointerover/pointerout from its input listeners).
    clickable.events.on('pointerover', () => this.onPointerOver());
    clickable.events.on('pointerout', () => this.onPointerOut());
    this.attach(clickable);
  }

  private onPointerOver(): void {
    // Tooltip omitted in this PixuiHeroCard: createTooltip() requires a
    // Phaser.GameObjects.Container as parent, which Container is not. Wound
    // badge tooltip lives in the HeroCard Phaser implementation. PixuiHeroCard
    // is the Tavern-panel replacement where tooltip-on-hover is a future
    // enhancement (sub-spec 3b+).
  }

  private onPointerOut(): void {
    // Intentionally empty — see onPointerOver note.
  }
}
