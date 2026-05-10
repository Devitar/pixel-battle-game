import * as Phaser from 'phaser';
import { COLOR, FONT, type FontKey } from './theme';

export interface BitmapTextOpts {
  scene: Phaser.Scene;
  /** Anchor x. */
  x: number;
  /** Anchor y. */
  y: number;
  text: string;
  /** Bitmap font key. Defaults to 'small' (mana_roots). */
  font?: FontKey;
  /** Font pixel size. Defaults to 16. */
  size?: number;
  /** Tint color (0xRRGGBB). Defaults to theme textDefault. */
  tint?: number;
  /** Origin (0..1). Defaults to top-left (0, 0). */
  originX?: number;
  originY?: number;
}

/**
 * Create a Phaser BitmapText with theme defaults applied. Returns the bare
 * Phaser game object — destroy via `text.destroy()`, set content via
 * `text.setText(...)`, and so on.
 *
 * Use this for short labels and headings where a fixed atlas font is
 * appropriate. Multi-color or per-character-tint scenarios still need
 * `scene.add.text(...)` (Phaser BitmapText only supports a uniform tint).
 */
export function createBitmapText(opts: BitmapTextOpts): Phaser.GameObjects.BitmapText {
  const t = opts.scene.add.bitmapText(
    opts.x,
    opts.y,
    FONT[opts.font ?? 'small'],
    opts.text,
    opts.size ?? 16,
  );
  t.setTint(opts.tint ?? COLOR.textDefault);
  t.setOrigin(opts.originX ?? 0, opts.originY ?? 0);
  return t;
}

