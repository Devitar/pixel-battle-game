import * as Phaser from 'phaser';
import { DUNGEONS } from '@data/dungeons';
import type { Item } from '@data/types';
import { rollLoot } from '@dungeon/loot';
import { itemAffixDescription, itemDisplayName } from '@items/selectors';
import { claimTreasure, currentNode } from '@run/run_state';
import {
  Button,
  assertWidgetAssetsLoaded,
  createBitmapText,
  createPanel,
} from '@ui/widgets';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';

// Persists across scene.restart() so the opened state survives the rebuild.
let _pendingState: 'closed' | 'opened' = 'closed';
let _pendingItem: Item | undefined;
let _pendingRngStateAfter: number | undefined;

const PANEL_X = 260;
const PANEL_Y = 80;
const PANEL_W = 440;
const PANEL_H = 360;

export class TreasureRoomOverlayScene extends Phaser.Scene {
  constructor() {
    super('treasure_room_overlay');
  }

  create(): void {
    assertWidgetAssetsLoaded(this);

    const opened = _pendingState === 'opened';

    // Dim overlay.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    // Header.
    createBitmapText({
      scene: this,
      x: 480,
      y: 12,
      text: 'Treasure!',
      font: 'medium',
      size: 16,
      originX: 0.5,
    });
    new Button({
      scene: this,
      x: 908,
      y: 4,
      width: 48,
      height: 32,
      text: 'X',
      font: 'medium',
      fontSize: 16,
      onClick: () => this.close(),
    });

    // Central panel.
    createPanel({ scene: this, x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H });

    const cx = PANEL_X + PANEL_W / 2;
    const buttonY = PANEL_Y + PANEL_H - 60;

    if (!opened) {
      createBitmapText({
        scene: this,
        x: cx,
        y: PANEL_Y + PANEL_H / 2 - 20,
        text: 'A chest awaits.',
        font: 'medium',
        size: 16,
        originX: 0.5,
      });
      new Button({
        scene: this,
        x: cx - 80,
        y: buttonY,
        width: 160,
        height: 32,
        text: 'Open',
        font: 'medium',
        fontSize: 16,
        onClick: () => this.openChest(),
      });
    } else {
      const item = _pendingItem!;
      const name = itemDisplayName(item);
      const affixes = itemAffixDescription(item);
      const rarityLabel = item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1);

      createBitmapText({
        scene: this,
        x: cx,
        y: PANEL_Y + 40,
        text: rarityLabel,
        font: 'small',
        size: 16,
        originX: 0.5,
      });
      createBitmapText({
        scene: this,
        x: cx,
        y: PANEL_Y + 80,
        text: name,
        font: 'medium',
        size: 16,
        originX: 0.5,
      });
      if (affixes.length > 0) {
        createBitmapText({
          scene: this,
          x: cx,
          y: PANEL_Y + 120,
          text: affixes,
          font: 'small',
          size: 16,
          originX: 0.5,
        });
      }
      new Button({
        scene: this,
        x: cx - 80,
        y: buttonY,
        width: 160,
        height: 32,
        text: 'Take',
        font: 'medium',
        fontSize: 16,
        onClick: () => this.takeAndAdvance(),
      });
    }

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private openChest(): void {
    const rngState = appState.get().runRngState;
    if (rngState === undefined) {
      throw new Error('TreasureRoomOverlayScene: runRngState missing');
    }
    const rng = createRngFromState(rngState);
    const run = appState.get().runState!;
    const item = rollLoot(rng, run.currentFloorNumber, 'treasure', DUNGEONS[run.dungeonId].tier);
    if (!item) {
      throw new Error('TreasureRoomOverlayScene: rollLoot returned null for treasure kind');
    }
    _pendingState = 'opened';
    _pendingItem = item;
    _pendingRngStateAfter = rng.getState();
    this.scene.restart();
  }

  private takeAndAdvance(): void {
    if (!_pendingItem || _pendingRngStateAfter === undefined) {
      throw new Error('TreasureRoomOverlayScene: takeAndAdvance with no rolled item');
    }
    const item = _pendingItem;
    const rngStateAfter = _pendingRngStateAfter;

    appState.update((s) => {
      const node = currentNode(s.runState!);
      if (node.type !== 'treasure') {
        throw new Error(
          `TreasureRoomOverlayScene: expected treasure node, got '${node.type}'`,
        );
      }
      return {
        ...s,
        runState: claimTreasure(s.runState!, item),
        runRngState: rngStateAfter,
      };
    });

    this.close();
  }

  private close(): void {
    _pendingState = 'closed';
    _pendingItem = undefined;
    _pendingRngStateAfter = undefined;
    this.scene.stop();
    this.scene.resume('corridor');
  }
}
