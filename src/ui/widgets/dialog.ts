import * as Phaser from 'phaser';
import { ATLAS, FRAME } from './theme';

export interface DialogOpts {
  scene: Phaser.Scene;
  width: number;
  height: number;
  /** Backdrop alpha. Defaults to 0.5. */
  backdropAlpha?: number;
  /** Backdrop color. Defaults to 0x000000. */
  backdropColor?: number;
  /** Frame variant. Defaults to 'bright'. */
  variant?: 'light' | 'bright' | 'dark';
}

export interface Dialog {
  /** Container holding backdrop + frame. Add content children to it for
   *  automatic teardown. */
  container: Phaser.GameObjects.Container;
  /** Top-left of the centered frame in canvas coords — useful for placing
   *  raw Phaser content relative to the dialog. */
  frameX: number;
  frameY: number;
  width: number;
  height: number;
  destroy: () => void;
}

/**
 * Centered modal dialog: full-canvas dim backdrop (interactive, blocks
 * clicks behind) + centered NineSlice frame. Caller is responsible for
 * adding their own content (text, buttons, etc.) and calling destroy().
 *
 * `container` is a scene-rooted Phaser Container that already holds the
 * backdrop and frame. Add your content to it via `container.add(...)` so
 * `destroy()` cleans everything up at once.
 */
export function createDialog(opts: DialogOpts): Dialog {
  const scene = opts.scene;
  const cw = scene.scale.width;
  const ch = scene.scale.height;

  const backdrop = scene.add
    .rectangle(0, 0, cw, ch, opts.backdropColor ?? 0x000000, opts.backdropAlpha ?? 0.5)
    .setOrigin(0, 0);
  // Block input to anything underneath.
  backdrop.setInteractive();

  const frameX = (cw - opts.width) / 2;
  const frameY = (ch - opts.height) / 2;
  const frameName =
    opts.variant === 'light' ? FRAME.panelLight :
    opts.variant === 'dark' ? FRAME.panelDark :
    FRAME.panelBright;
  const frame = scene.add
    .nineslice(frameX, frameY, ATLAS, frameName, opts.width, opts.height)
    .setOrigin(0, 0);

  const container = scene.add.container(0, 0, [backdrop, frame]);

  return {
    container,
    frameX,
    frameY,
    width: opts.width,
    height: opts.height,
    destroy: () => container.destroy(true),
  };
}
