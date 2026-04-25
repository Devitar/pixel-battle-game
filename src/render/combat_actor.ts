import * as Phaser from 'phaser';
import type { CombatantId } from '../combat/types';
import type { EnemyId, StatusId } from '../data/types';
import type { Hero } from '../heroes/hero';
import { EnemyPlaceholder } from './enemy_placeholder';
import { heroToLoadout } from './hero_loadout';
import { Paperdoll } from './paperdoll';

const STATUS_GLYPHS: Partial<Record<StatusId, { letter: string; color: string }>> = {
  stunned: { letter: 'S', color: '#ff9944' },
  bulwark: { letter: 'B', color: '#44aacc' },
  taunting: { letter: 'T', color: '#ffcc44' },
  marked: { letter: 'M', color: '#cc4444' },
  blessed: { letter: '+', color: '#ffdd66' },
  rotting: { letter: 'r', color: '#aa44aa' },
  frailty: { letter: '−', color: '#888888' },
};
const STATUS_FALLBACK = { letter: '?', color: '#888888' };

const HP_BAR_W = 56;
const HP_BAR_H = 4;
const STATUS_SPACING = 10;
const STATUS_FONT = '10px';
const OUTLINE_W = 60;
const OUTLINE_H = 80;
const OUTLINE_COLOR = 0xffcc66;
const FLASH_HIT_DURATION = 100;
const FLASH_HIT_COLOR = 0xffffff;
const FLASH_HEAL_COLOR = 0x44ff44;
const LUNGE_DISTANCE = 20;
const LUNGE_DURATION = 350;
const PULSE_DURATION = 250;
const PULSE_SCALE = 1.1;
const HP_TWEEN_DURATION = 200;
const NUMBER_RISE = 20;
const NUMBER_DURATION = 400;
const COLLAPSE_DURATION = 400;
const COLLAPSE_DROP = 8;
const SLOT_MOVE_DURATION = 300;

const NAME_Y = -56;
const HPBAR_Y = -44;
const HPTEXT_Y = -38;
const STATUS_Y = 38;

export type CombatActorKind = 'hero' | 'enemy';

export interface HeroActorInit {
  kind: 'hero';
  combatantId: CombatantId;
  displayName: string;
  hero: Hero;
  currentHp: number;
  maxHp: number;
}

export interface EnemyActorInit {
  kind: 'enemy';
  combatantId: CombatantId;
  displayName: string;
  enemyId: EnemyId;
  currentHp: number;
  maxHp: number;
  bodyScale?: number;
}

export type CombatActorInit = HeroActorInit | EnemyActorInit;

export class CombatActor extends Phaser.GameObjects.Container {
  readonly combatantId: CombatantId;
  private bodyView: Paperdoll | EnemyPlaceholder;
  private bodyScale: number;
  private nameText: Phaser.GameObjects.Text;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFill: Phaser.GameObjects.Rectangle;
  private hpText: Phaser.GameObjects.Text;
  private statusStrip: Phaser.GameObjects.Container;
  private statusGlyphs: Map<StatusId, Phaser.GameObjects.Text> = new Map();
  private actorOutline: Phaser.GameObjects.Rectangle;
  private currentHp: number;
  private maxHp: number;
  private bodyType: CombatActorKind;

  constructor(scene: Phaser.Scene, x: number, y: number, init: CombatActorInit) {
    super(scene, x, y);
    this.combatantId = init.combatantId;
    this.currentHp = init.currentHp;
    this.maxHp = init.maxHp;
    this.bodyType = init.kind;

    if (init.kind === 'hero') {
      this.bodyView = new Paperdoll(scene, 0, 0, heroToLoadout(init.hero));
      this.bodyScale = 3;
    } else {
      this.bodyView = new EnemyPlaceholder(scene, 0, 0, init.enemyId);
      this.bodyScale = init.bodyScale ?? 3;
    }
    this.bodyView.setScale(this.bodyScale);
    this.add(this.bodyView);

    this.actorOutline = scene.add
      .rectangle(0, 0, OUTLINE_W, OUTLINE_H)
      .setStrokeStyle(2, OUTLINE_COLOR)
      .setFillStyle();
    this.actorOutline.setAlpha(0);
    this.add(this.actorOutline);

    this.nameText = scene.add
      .text(0, NAME_Y, init.displayName, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.add(this.nameText);

    this.hpBarBg = scene.add.rectangle(0, HPBAR_Y, HP_BAR_W, HP_BAR_H, 0x333333);
    this.add(this.hpBarBg);
    this.hpBarFill = scene.add
      .rectangle(-HP_BAR_W / 2, HPBAR_Y, HP_BAR_W, HP_BAR_H, this.hpColor(1))
      .setOrigin(0, 0.5);
    this.add(this.hpBarFill);

    this.hpText = scene.add
      .text(0, HPTEXT_Y, `${init.currentHp}/${init.maxHp}`, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#cccccc',
      })
      .setOrigin(0.5);
    this.add(this.hpText);

    this.statusStrip = scene.add.container(0, STATUS_Y);
    this.add(this.statusStrip);

    this.refreshHpVisual();
    scene.add.existing(this);
  }

  setOutline(active: boolean): void {
    this.actorOutline.setAlpha(active ? 1 : 0);
  }

  lunge(toward: 'left' | 'right'): Promise<void> {
    const direction = toward === 'right' ? 1 : -1;
    const startX = this.x;
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: this,
        x: startX + direction * LUNGE_DISTANCE,
        duration: LUNGE_DURATION / 3,
        yoyo: true,
        hold: 50,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.x = startX;
          resolve();
        },
      });
    });
  }

  pulse(): Promise<void> {
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: this.bodyView,
        scale: this.bodyScale * PULSE_SCALE,
        duration: PULSE_DURATION / 2,
        yoyo: true,
        ease: 'Quad.easeInOut',
        onComplete: () => {
          this.bodyView.setScale(this.bodyScale);
          resolve();
        },
      });
    });
  }

  flashHit(): Promise<void> {
    return this.flashColor(FLASH_HIT_COLOR);
  }

  flashHeal(): Promise<void> {
    return this.flashColor(FLASH_HEAL_COLOR);
  }

  private flashColor(color: number): Promise<void> {
    if (this.bodyType === 'enemy') {
      (this.bodyView as EnemyPlaceholder).flash(color);
      return new Promise(resolve => {
        this.scene.time.delayedCall(FLASH_HIT_DURATION, () => {
          (this.bodyView as EnemyPlaceholder).unflash();
          resolve();
        });
      });
    }
    const paperdoll = this.bodyView as Paperdoll;
    for (const child of paperdoll.list) {
      const img = child as Phaser.GameObjects.Image;
      if (img.setTint) {
        img.setTint(color);
        img.setTintMode(Phaser.TintModes.FILL);
      }
    }
    return new Promise(resolve => {
      this.scene.time.delayedCall(FLASH_HIT_DURATION, () => {
        for (const child of paperdoll.list) {
          const img = child as Phaser.GameObjects.Image;
          if (img.clearTint) img.clearTint();
        }
        resolve();
      });
    });
  }

  setHpBar(currentHp: number, maxHp: number): Promise<void> {
    const clamped = Math.max(0, Math.min(maxHp, currentHp));
    this.currentHp = clamped;
    this.maxHp = maxHp;
    const ratio = maxHp > 0 ? clamped / maxHp : 0;
    const targetWidth = HP_BAR_W * ratio;
    this.hpBarFill.setFillStyle(this.hpColor(ratio));
    this.hpText.setText(`${clamped}/${maxHp}`);
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: this.hpBarFill,
        width: targetWidth,
        duration: HP_TWEEN_DURATION,
        ease: 'Quad.easeOut',
        onComplete: () => resolve(),
      });
    });
  }

  spawnNumber(text: string, color: string): void {
    const num = this.scene.add
      .text(this.x, this.y - 30, text, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.scene.tweens.add({
      targets: num,
      y: num.y - NUMBER_RISE,
      alpha: 0,
      duration: NUMBER_DURATION,
      ease: 'Quad.easeOut',
      onComplete: () => num.destroy(),
    });
  }

  addStatusGlyph(statusId: StatusId): void {
    if (this.statusGlyphs.has(statusId)) return;
    const info = STATUS_GLYPHS[statusId] ?? STATUS_FALLBACK;
    const glyph = this.scene.add
      .text(0, 0, info.letter, {
        fontFamily: 'monospace',
        fontSize: STATUS_FONT,
        color: info.color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.statusGlyphs.set(statusId, glyph);
    this.statusStrip.add(glyph);
    this.scene.tweens.add({
      targets: glyph,
      scale: { from: 1.3, to: 1 },
      duration: 150,
      ease: 'Back.easeOut',
    });
    this.relayoutStatusStrip();
  }

  removeStatusGlyph(statusId: StatusId): void {
    const glyph = this.statusGlyphs.get(statusId);
    if (!glyph) return;
    this.statusGlyphs.delete(statusId);
    this.scene.tweens.add({
      targets: glyph,
      alpha: 0,
      duration: 100,
      onComplete: () => {
        glyph.destroy();
        this.relayoutStatusStrip();
      },
    });
  }

  clearStatusGlyphs(): void {
    for (const glyph of this.statusGlyphs.values()) glyph.destroy();
    this.statusGlyphs.clear();
    this.relayoutStatusStrip();
  }

  collapse(): Promise<void> {
    this.clearStatusGlyphs();
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        y: this.y + COLLAPSE_DROP,
        duration: COLLAPSE_DURATION,
        ease: 'Quad.easeIn',
        onComplete: () => resolve(),
      });
    });
  }

  moveToSlotX(targetX: number): Promise<void> {
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: this,
        x: targetX,
        duration: SLOT_MOVE_DURATION,
        ease: 'Quad.easeInOut',
        onComplete: () => resolve(),
      });
    });
  }

  jiggle(): Promise<void> {
    const startX = this.x;
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: this,
        x: startX + 4,
        duration: 50,
        yoyo: true,
        repeat: 1,
        onComplete: () => {
          this.x = startX;
          resolve();
        },
      });
    });
  }

  private relayoutStatusStrip(): void {
    const glyphs = Array.from(this.statusGlyphs.values());
    const totalWidth = (glyphs.length - 1) * STATUS_SPACING;
    const startX = -totalWidth / 2;
    glyphs.forEach((g, i) => g.setPosition(startX + i * STATUS_SPACING, 0));
  }

  private refreshHpVisual(): void {
    const ratio = this.maxHp > 0 ? this.currentHp / this.maxHp : 0;
    this.hpBarFill.setSize(HP_BAR_W * ratio, HP_BAR_H);
    this.hpBarFill.setFillStyle(this.hpColor(ratio));
    this.hpText.setText(`${this.currentHp}/${this.maxHp}`);
  }

  private hpColor(ratio: number): number {
    if (ratio > 0.5) return 0x44aa44;
    if (ratio > 0.25) return 0xaaaa44;
    return 0xaa4444;
  }
}
