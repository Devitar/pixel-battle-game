import * as Phaser from 'phaser';
import { SHEET } from './frames';
import {
  layerFramesFor,
  type Loadout,
  type OptionalSlot,
} from './paperdoll_layers';

export {
  LAYER_ORDER,
  layerFramesFor,
  type Loadout,
  type OptionalSlot,
  type PaperdollSlot,
} from './paperdoll_layers';

export class Paperdoll extends Phaser.GameObjects.Container {
  private loadout: Loadout;

  constructor(scene: Phaser.Scene, x: number, y: number, loadout: Loadout) {
    super(scene, x, y);
    this.loadout = { ...loadout };
    scene.add.existing(this);
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
    this.removeAll(true);
    for (const frame of layerFramesFor(this.loadout)) {
      this.add(this.scene.add.image(0, 0, SHEET.key, frame));
    }
  }
}
