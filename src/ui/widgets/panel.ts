import * as Phaser from 'phaser';
import { ATLAS, FRAME } from './theme';

export type PanelVariant = 'light' | 'bright' | 'dark';

export interface PanelOpts {
  scene: Phaser.Scene;
  /** Top-left x in canvas coords. */
  x: number;
  /** Top-left y in canvas coords. */
  y: number;
  width: number;
  height: number;
  /** Frame style. Defaults to 'dark' (purple chrome) — harmonizes with the
   *  dark inner-content backdrops most camp panels use. Pass 'light' for the
   *  warm gray-cream chrome, or 'bright' for the cream variant. */
  variant?: PanelVariant;
}

/**
 * Create a NineSlice frame using one of the mana_soul panel sprites. Phaser
 * pulls the scale-9 borders from the atlas's scale9Borders metadata
 * automatically — callers don't specify them.
 *
 * The returned NineSlice is a plain Phaser game object: position with
 * `setPosition`, resize with `setSize`, destroy with `destroy()`. Children
 * are not parented automatically (this is intentionally a flat helper);
 * group them in a `Phaser.GameObjects.Container` if you want the panel + its
 * contents to share lifetime.
 */
export function createPanel(opts: PanelOpts): Phaser.GameObjects.NineSlice {
  const frameName = panelFrame(opts.variant ?? 'dark');
  const ns = opts.scene.add.nineslice(
    opts.x,
    opts.y,
    ATLAS,
    frameName,
    opts.width,
    opts.height,
  );
  ns.setOrigin(0, 0);
  return ns;
}

function panelFrame(variant: PanelVariant): string {
  switch (variant) {
    case 'bright': return FRAME.panelBright;
    case 'dark': return FRAME.panelDark;
    case 'light': return FRAME.panelLight;
  }
}
