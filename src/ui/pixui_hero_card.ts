import { Container, BitmapText, Rectangle, Clickable, Image, OriginX, OriginY } from 'phaser-pixui';
import type { Scene, Events } from 'phaser';
import type { Hero } from '@heroes/hero';
import { CLASSES } from '@data/classes';
import { TRAITS } from '@data/traits';
import { WOUNDS, describeWoundEffect } from '@data/wounds';
import { heroToLoadout } from '@render/hero_loadout';
import { PixuiPaperdoll } from '@render/pixui_paperdoll';
import { createTooltip } from './tooltip';

// Bitmap font names registered by uiTheme in src/render/ui_theme.ts
const FONT_SMALL = 'mana_roots';
const FONT_MEDIUM = 'mana_trunk';

export type PixuiHeroCardSize = 'small' | 'large';

export interface PixuiHeroCardOptions {
  size: PixuiHeroCardSize;
  isDead?: boolean;
  onClick?: () => void;
  draggable?: boolean;
}

const PAPERDOLL_SCALE_SMALL = 2;
const PAPERDOLL_SCALE_LARGE = 4;

const SMALL_W = 180;
const SMALL_H = 60;
const LARGE_W = 280;
const LARGE_H = 120;

// Wound-badge offsets — match legacy HeroCard's badge placement (top-right of card).
const BADGE_OFFSET_X_SMALL = 75;
const BADGE_OFFSET_Y_SMALL = -22;
const BADGE_OFFSET_X_LARGE = 125;
const BADGE_OFFSET_Y_LARGE = -48;
// Nudge the tooltip left of the badge so it doesn't overflow the right edge of the card.
const TOOLTIP_X_NUDGE_FROM_BADGE = -30;

// HP bar colors
const HP_HIGH = 0x44aa44;
const HP_MID = 0xaaaa44;
const HP_LOW = 0xaa4444;

/**
 * pixui-native hero card — Container of PixuiPaperdoll + BitmapText labels +
 * Rectangle HP bar + Clickable overlay. Same external API as legacy HeroCard.
 *
 * Why BitmapText/Rectangle instead of TextArea/Progress: those are
 * StyledComponents whose constructors require an InsertContext (not a Scene).
 * BitmapText and Rectangle take Scene directly and are the correct primitives
 * for a self-contained Container subclass.
 *
 * Wound badge + tooltip (Cluster B · 53):
 * - When `hero.wounds.length > 0 && !opts.isDead`, a `🩸 N` badge renders
 *   top-right of the card. Tap toggles a Phaser-rooted tooltip listing each
 *   wound's name + effect.
 * - Badge + tooltip live in a single scene-rooted Phaser.GameObjects.Container
 *   (`phaserOverlay`) whose position is synced to this card's resolved world
 *   coords via the `updatePosition()` override.
 *
 * Draggable mode:
 * - Pass `draggable: true` in options to enable Phaser drag-and-drop. Phaser
 *   drag events fire on the public `events` EventEmitter automatically.
 *
 * Lifetime constraints (load-bearing):
 * - PixuiHeroCard's Phaser-rooted children rely on `scene.restart()` for
 *   cleanup. Don't destroy a single PixuiHeroCard instance without restarting
 *   the scene — phaserOverlay would leak.
 * - PixuiHeroCard has no setHero() / in-place rebuild. pixui's Container has
 *   no clear() primitive; rebuild via scene.restart() (Tavern's pattern) or
 *   construct a fresh PixuiHeroCard.
 * - For the wound badge to position correctly, the card must be `attach`ed
 *   into a pixui-rooted parent so `updatePosition()` fires. A constructed-
 *   but-never-attached card with wounds will render its badge at (0, 0).
 */
export class PixuiHeroCard extends Container {
  private hero: Hero;
  private opts: PixuiHeroCardOptions;
  private clickable!: Clickable;

  // Phaser-rooted overlay holding the wound badge + active tooltip. Position
  // synced to PixuiHeroCard's resolved world coords via updatePosition()
  // override. See class-level doc for lifetime constraints (single-card
  // destroy leaks this overlay — cleanup relies on scene.restart()).
  // Only created when the hero has wounds and isn't dead.
  private phaserOverlay?: Phaser.GameObjects.Container;
  private woundBadge?: Phaser.GameObjects.Text;
  private tooltipChild?: Phaser.GameObjects.Container;

  /**
   * Public passthrough to the internal Clickable's events EventEmitter.
   *
   * When `draggable: true` is set in options, Phaser fires drag events on
   * this EventEmitter automatically:
   *
   *   card.events.on('dragstart', (pointer) => ...);
   *   card.events.on('drag', (pointer, dragX, dragY) => { card.localX = ...; });
   *   card.events.on('drop', (pointer, dropZone) => ...);
   *   card.events.on('dragend', (pointer, dropped) => ...);
   *
   * Drop-target identification: Phaser fires the per-GameObject 'drop' event
   * here with the `dropZone` GameObject; consumers map dropZone → slot index
   * using their own slot ownership. PixuiHeroCard owns the source-of-drag
   * identity (`this`).
   */
  get events(): Events.EventEmitter {
    return this.clickable.events;
  }

  constructor(scene: Scene, hero: Hero, opts: PixuiHeroCardOptions) {
    const w = opts.size === 'large' ? LARGE_W : SMALL_W;
    const h = opts.size === 'large' ? LARGE_H : SMALL_H;
    super(scene, { width: w, height: h });
    this.hero = hero;
    this.opts = opts;
    this.build();
  }

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
        if (child instanceof Image) {
          child.tint = 0x884444;
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

    // Clickable overlay — covers the whole card, on top of everything.
    // When draggable=true, Phaser drag events (dragstart/drag/drop/dragend)
    // fire on this Clickable's events EventEmitter automatically — exposed
    // via the public `events` getter for consumers like Expeditions.
    this.clickable = new Clickable(this.scene, {
      width: w,
      height: h,
      draggable: this.opts.draggable ?? false,
      onClick: this.opts.onClick,
    });
    this.attach(this.clickable);

    if (this.hero.wounds.length > 0 && !this.opts.isDead) {
      this.buildPhaserOverlay();
    }
  }

  protected override updatePosition(): void {
    super.updatePosition();
    this.phaserOverlay?.setPosition(this.x, this.y);
  }

  private buildPhaserOverlay(): void {
    const isLarge = this.opts.size === 'large';
    const badgeX = isLarge ? BADGE_OFFSET_X_LARGE : BADGE_OFFSET_X_SMALL;
    const badgeY = isLarge ? BADGE_OFFSET_Y_LARGE : BADGE_OFFSET_Y_SMALL;

    this.phaserOverlay = this.scene.add.container(0, 0);

    this.woundBadge = this.scene.add
      .text(badgeX, badgeY, `🩸 ${this.hero.wounds.length}`, {
        fontFamily: 'monospace',
        fontSize: isLarge ? '13px' : '11px',
        color: '#ff6666',
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });

    this.woundBadge.on('pointerdown', () => this.toggleWoundTooltip(badgeX, badgeY));

    this.phaserOverlay.add(this.woundBadge);
  }

  // Tap-to-toggle wound-details tooltip on the badge. Same UX as legacy
  // HeroCard. Tooltip is parented to phaserOverlay so destruction cascades:
  // dismissing destroys the tooltip; scene shutdown destroys the overlay
  // (and the tooltip with it).
  private toggleWoundTooltip(badgeX: number, badgeY: number): void {
    if (this.tooltipChild) {
      this.tooltipChild.destroy();
      this.tooltipChild = undefined;
      return;
    }
    if (!this.phaserOverlay) return;
    const lines = this.hero.wounds.map((w) => {
      const def = WOUNDS[w.id];
      return `${def.name} — ${describeWoundEffect(def.effect)}`;
    });
    this.tooltipChild = createTooltip(
      this.scene,
      this.phaserOverlay,
      badgeX + TOOLTIP_X_NUDGE_FROM_BADGE,
      badgeY,
      lines,
    );
  }
}
