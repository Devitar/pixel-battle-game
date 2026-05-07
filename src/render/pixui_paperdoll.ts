import { Container, Image } from 'phaser-pixui';
import type { Scene } from 'phaser';
import {
  layerFramesFor,
  type Loadout,
  type OptionalSlot,
} from './paperdoll_layers';
import { SHEET } from './frames';

export interface PixuiPaperdollOptions {
  /** Scale factor applied to each layer's underlying Phaser sprite. Default 1 (16×16 native). */
  scale?: number;
}

/**
 * pixui-native paperdoll — a Container of layered Image children, one per
 * LAYER_ORDER slot. Same external API as src/render/paperdoll.ts
 * (equip / unequip / currentLoadout) so callers can drop-in-replace.
 *
 * Rebuild notes (verified from pixui source):
 * - Container.attach() APPENDS to _children; it does not replace. There is no
 *   built-in clear() or detach(). On rebuild we destroy prior layer Images by
 *   calling .internal.destroy() — `internal` is a public readonly property on
 *   Renderable<T> that holds the underlying Phaser GameObject (Sprite or
 *   NineSlice). This is the correct, type-safe path; no escape-hatch casts needed.
 * - pixui has no scale API on Component/Image. Scale is applied directly to
 *   the Phaser sprite via img.internal.setScale(s).
 */
export class PixuiPaperdoll extends Container {
  private loadout: Loadout;
  private layerImages: Image[] = [];
  private readonly scale: number;

  constructor(scene: Scene, loadout: Loadout, opts: PixuiPaperdollOptions = {}) {
    super(scene);
    this.loadout = { ...loadout };
    this.scale = opts.scale ?? 1;
    this.rebuild();
  }

  equip(changes: Partial<Loadout>): void {
    this.loadout = { ...this.loadout, ...changes };
    this.rebuild();
  }

  unequip(slot: OptionalSlot): void {
    const next: Loadout = { ...this.loadout };
    delete next[slot];
    this.loadout = next;
    this.rebuild();
  }

  currentLoadout(): Readonly<Loadout> {
    return this.loadout;
  }

  private rebuild(): void {
    // Destroy prior layer Images. attach() appends, so we must tear down
    // existing children before rebuilding. .internal is a public readonly on
    // Renderable<T> holding the underlying Phaser Sprite/NineSlice.
    for (const img of this.layerImages) {
      img.internal.destroy();
    }
    this.layerImages = [];

    const frames = layerFramesFor(this.loadout);
    const newImages: Image[] = [];
    for (const frame of frames) {
      const img = new Image(this.scene, {
        texture: SHEET.key,
        frame: String(frame),
      });
      if (this.scale !== 1) {
        img.internal.setScale(this.scale);
      }
      newImages.push(img);
    }
    this.attach(newImages);
    this.layerImages = newImages;
  }
}
