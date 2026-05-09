import * as Phaser from 'phaser';
import { layerFramesFor, type Loadout } from '@render/paperdoll_layers';
import { SHEET } from '@render/frames';

export interface PaperdollOpts {
  scene: Phaser.Scene;
  /** Container x in canvas coords. */
  x: number;
  /** Container y in canvas coords. */
  y: number;
  loadout: Loadout;
  /** Per-sprite scale factor. Default 1 (16×16). */
  scale?: number;
}

/**
 * A layered character sprite stack (body, legs, feet, outfit, hair, hat,
 * shield, weapon) wrapped in a Phaser Container. Children are layered in
 * the order returned by `layerFramesFor`. The container's position is the
 * paperdoll's center; child sprites use Phaser's default origin (0.5).
 *
 * Returns the container so the caller can add it to its own parent
 * container, set tints on individual layer sprites, or destroy the whole
 * stack with `container.destroy(true)`.
 */
export function createPaperdoll(opts: PaperdollOpts): Phaser.GameObjects.Container {
  const { scene, x, y, loadout, scale = 1 } = opts;
  const container = scene.add.container(x, y);
  const frames = layerFramesFor(loadout);
  for (const frame of frames) {
    const sprite = scene.add.sprite(0, 0, SHEET.key, frame);
    if (scale !== 1) sprite.setScale(scale);
    container.add(sprite);
  }
  return container;
}
