import * as Phaser from 'phaser';
import { CLASSES } from '@data/classes';
import { TRAITS } from '@data/traits';
import { WOUNDS, describeWoundEffect } from '@data/wounds';
import type { Hero } from '@heroes/hero';
import { heroToLoadout } from '@render/hero_loadout';
import { createTooltip } from '@ui/tooltip';
import { createPaperdoll } from './paperdoll';

export type HeroCardSize = 'small' | 'large';

export interface HeroCardOpts {
  scene: Phaser.Scene;
  /** Card center x in canvas coords. */
  x: number;
  /** Card center y in canvas coords. */
  y: number;
  hero: Hero;
  size: HeroCardSize;
  /** Render with the death tint and "(Fallen)" label. Suppresses HP bar
   *  and trait line. Wound badge is hidden. */
  isDead?: boolean;
  /** If provided, the card becomes interactive and fires this on click. */
  onClick?: () => void;
  /** If true, the card's hit area becomes a Phaser drag target. Drag
   *  events fire on `events`. */
  draggable?: boolean;
}

const SMALL_W = 180;
const SMALL_H = 60;
const LARGE_W = 280;
const LARGE_H = 120;

const PAPERDOLL_SCALE_SMALL = 2;
const PAPERDOLL_SCALE_LARGE = 4;

const HP_HIGH = 0x44aa44;
const HP_MID = 0xaaaa44;
const HP_LOW = 0xaa4444;

const BADGE_OFFSET_X_SMALL = 75;
const BADGE_OFFSET_Y_SMALL = -22;
const BADGE_OFFSET_X_LARGE = 125;
const BADGE_OFFSET_Y_LARGE = -48;
const TOOLTIP_X_NUDGE_FROM_BADGE = -30;

/**
 * Hero card widget — a layered Phaser container holding the paperdoll,
 * name/class/HP/trait labels, an optional HP bar, and an optional wound
 * badge that toggles a tooltip on tap.
 *
 * Sizes (small=180×60, large=280×120), optional isDead tint, optional
 * onClick handler, and optional draggable mode that re-emits Phaser drag
 * events on the public `events` emitter for consumers like Expeditions.
 *
 * Lifecycle: `card.destroy()` tears down the container and every child,
 * including any open tooltip — no leak.
 */
export class HeroCard {
  readonly container: Phaser.GameObjects.Container;
  /** Public emitter for click + drag events (drag events from Phaser fire
   *  directly on the hit area; we re-emit them here for callers). */
  readonly events: Phaser.Events.EventEmitter;

  private readonly scene: Phaser.Scene;
  private readonly hero: Hero;
  private readonly opts: HeroCardOpts;
  private readonly hitArea?: Phaser.GameObjects.Rectangle;
  private badgeText?: Phaser.GameObjects.Text;
  private tooltipChild?: Phaser.GameObjects.Container;
  private destroyed = false;

  constructor(opts: HeroCardOpts) {
    this.scene = opts.scene;
    this.hero = opts.hero;
    this.opts = opts;
    this.events = new Phaser.Events.EventEmitter();
    this.container = opts.scene.add.container(opts.x, opts.y);

    const { size, isDead = false } = opts;
    const isLarge = size === 'large';
    const w = isLarge ? LARGE_W : SMALL_W;
    const h = isLarge ? LARGE_H : SMALL_H;
    const paperdollScale = isLarge ? PAPERDOLL_SCALE_LARGE : PAPERDOLL_SCALE_SMALL;

    // Background
    const bg = this.scene.add
      .rectangle(0, 0, w, h, 0x222222)
      .setStrokeStyle(2, isDead ? 0x553333 : 0x444444);
    this.container.add(bg);

    // Paperdoll (left of center)
    const dollOffsetX = isLarge ? -80 : -60;
    const paperdoll = createPaperdoll({
      scene: this.scene,
      x: dollOffsetX,
      y: 0,
      loadout: heroToLoadout(this.hero),
      scale: paperdollScale,
    });
    if (isDead) {
      for (const child of paperdoll.list) {
        if (child instanceof Phaser.GameObjects.Sprite) child.setTint(0x884444);
      }
    }
    this.container.add(paperdoll);

    // Text column — right side. Offsets are top-left-relative; convert to
    // container-center-relative coords so the texts align with the card's
    // left/top edges. Text starts just past the paperdoll's right edge —
    // small (scale 2, 32px wide, dollOffsetX=-60) → paperdoll right edge
    // at card-left + 46, so text begins at card-left + 50. Large (scale 4,
    // 64px wide, dollOffsetX=-80) → paperdoll right edge at card-left + 92,
    // text begins at card-left + 96.
    const textX = (isLarge ? 96 : 50) - w / 2;
    const textOffsetFromTop = (isLarge ? 12 : 6) - h / 2;

    const classDef = CLASSES[this.hero.classId];
    const traitDef = TRAITS[this.hero.traitId];

    const nameLabel = isDead ? `${this.hero.name} (Fallen)` : this.hero.name;
    const nameLine = this.scene.add
      .text(textX, textOffsetFromTop, nameLabel, {
        fontFamily: 'monospace',
        fontSize: isLarge ? '14px' : '12px',
        color: '#ffffff',
      });
    this.container.add(nameLine);

    const classLine = isLarge
      ? `${classDef.name} · Lv ${this.hero.level}`
      : `${classDef.name} · Lv ${this.hero.level} · ${this.hero.currentHp}/${this.hero.maxHp}`;
    const classText = this.scene.add
      .text(textX, textOffsetFromTop + (isLarge ? 24 : 16), classLine, {
        fontFamily: 'monospace',
        fontSize: isLarge ? '12px' : '10px',
        color: '#aaaaaa',
      });
    this.container.add(classText);

    if (!isDead) {
      const barY = textOffsetFromTop + (isLarge ? 52 : 32);
      const barW = isLarge ? 140 : 100;
      const barH = isLarge ? 6 : 5;
      const hpRatio = Math.max(0, this.hero.currentHp / this.hero.maxHp);
      const hpColor = hpRatio > 0.5 ? HP_HIGH : hpRatio > 0.25 ? HP_MID : HP_LOW;

      const hpBg = this.scene.add
        .rectangle(textX, barY, barW, barH, 0x333333)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x555555);
      this.container.add(hpBg);

      if (hpRatio > 0) {
        const hpFill = this.scene.add
          .rectangle(textX, barY, Math.max(1, Math.round(barW * hpRatio)), barH, hpColor)
          .setOrigin(0, 0);
        this.container.add(hpFill);
      }

      // Trait line
      const traitY = barY + barH + (isLarge ? 6 : 3);
      const traitLabel = isLarge
        ? `${traitDef.name} - ${traitDef.description}`
        : `${traitDef.name} · ${traitDef.shortDescription}`;
      const traitText = this.scene.add
        .text(textX, traitY, traitLabel, {
          fontFamily: 'monospace',
          fontSize: isLarge ? '11px' : '10px',
          color: '#ccbbaa',
        });
      this.container.add(traitText);
    }

    // Click / drag overlay — only created when the card needs interaction.
    // Skipping it when neither onClick nor draggable is set means clicks
    // can fall through to whatever is rendered behind the card.
    if (opts.onClick || opts.draggable) {
      this.hitArea = this.scene.add
        .rectangle(0, 0, w, h, 0x000000, 0)
        .setInteractive({ useHandCursor: true, draggable: opts.draggable ?? false });
      if (opts.onClick) {
        this.hitArea.on('pointerup', opts.onClick);
      }
      // Re-emit drag events on the public emitter so callers (like
      // Expeditions) can subscribe via `card.events.on('drag', ...)`.
      if (opts.draggable) {
        for (const ev of ['dragstart', 'drag', 'drop', 'dragend'] as const) {
          this.hitArea.on(ev, (...args: unknown[]) => this.events.emit(ev, ...args));
        }
      }
      this.container.add(this.hitArea);
    }

    if (this.hero.wounds.length > 0 && !isDead) {
      this.buildWoundBadge();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.events.removeAllListeners();
    this.container.destroy(true);
  }

  private buildWoundBadge(): void {
    const isLarge = this.opts.size === 'large';
    const badgeX = isLarge ? BADGE_OFFSET_X_LARGE : BADGE_OFFSET_X_SMALL;
    const badgeY = isLarge ? BADGE_OFFSET_Y_LARGE : BADGE_OFFSET_Y_SMALL;

    this.badgeText = this.scene.add
      .text(badgeX, badgeY, `🩸 ${this.hero.wounds.length}`, {
        fontFamily: 'monospace',
        fontSize: isLarge ? '13px' : '11px',
        color: '#ff6666',
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    this.badgeText.on('pointerdown', () => this.toggleWoundTooltip(badgeX, badgeY));
    this.container.add(this.badgeText);
  }

  private toggleWoundTooltip(badgeX: number, badgeY: number): void {
    if (this.tooltipChild) {
      this.tooltipChild.destroy();
      this.tooltipChild = undefined;
      return;
    }
    const lines = this.hero.wounds.map((w) => {
      const def = WOUNDS[w.id];
      return `${def.name} - ${describeWoundEffect(def.effect)}`;
    });
    this.tooltipChild = createTooltip(
      this.scene,
      this.container,
      badgeX + TOOLTIP_X_NUDGE_FROM_BADGE,
      badgeY,
      lines,
    );
  }
}
