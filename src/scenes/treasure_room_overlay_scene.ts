import * as Phaser from 'phaser';
import { DUNGEONS } from '@data/dungeons';
import type { Item, Rarity } from '@data/types';
import { rollLoot } from '@dungeon/loot';
import { itemAffixDescription, itemDisplayName } from '@items/selectors';
import { claimTreasure, currentNode } from '@run/run_state';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 340;
const PANEL_H = 220;

const TITLE_Y = PANEL_CY - PANEL_H / 2 + 30;
const CHEST_Y = PANEL_CY - 10;
const ITEM_NAME_Y = PANEL_CY + 30;
const ITEM_AFFIX_Y = PANEL_CY + 50;
const PROMPT_Y = PANEL_CY + PANEL_H / 2 - 28;

const RARITY_HEX: Record<Rarity, string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
};

type OverlayState = 'closed' | 'opened';

export class TreasureRoomOverlayScene extends Phaser.Scene {
  private state: OverlayState = 'closed';
  private rolledItem?: Item;
  private chestText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private rngStateAfterRoll?: number;

  constructor() {
    super('treasure_room_overlay');
  }

  create(): void {
    this.state = 'closed';
    this.rolledItem = undefined;
    this.rngStateAfterRoll = undefined;

    // Dim backdrop captures clicks so they don't leak through to the dungeon.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0xffcc66);

    this.add
      .text(PANEL_CX, TITLE_Y, 'Treasure!', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffcc66',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.chestText = this.add
      .text(PANEL_CX, CHEST_Y, '📦', {
        fontFamily: 'monospace',
        fontSize: '48px',
      })
      .setOrigin(0.5);

    this.promptText = this.add
      .text(PANEL_CX, PROMPT_Y, '▸ click to open', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#888888',
        fontStyle: 'italic',
      })
      .setOrigin(0.5);

    const clickTarget = this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x000000, 0)
      .setStrokeStyle(0)
      .setInteractive({ useHandCursor: true });
    clickTarget.on('pointerdown', () => this.onClick());
  }

  private onClick(): void {
    if (this.state === 'closed') {
      this.openChest();
    } else {
      this.takeAndAdvance();
    }
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
    this.rolledItem = item;
    this.rngStateAfterRoll = rng.getState();

    this.chestText.setText('📭');
    this.add
      .circle(PANEL_CX, CHEST_Y, 38, 0xffcc66, 0.0)
      .setStrokeStyle(2, 0xffcc66, 0.8);

    const name = itemDisplayName(item);
    const affixes = itemAffixDescription(item);
    this.add
      .text(PANEL_CX, ITEM_NAME_Y, name, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: RARITY_HEX[item.rarity],
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    if (affixes.length > 0) {
      this.add
        .text(PANEL_CX, ITEM_AFFIX_Y, affixes, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5);
    }

    this.promptText.setText('▸ click to take');
    this.state = 'opened';
  }

  private takeAndAdvance(): void {
    if (!this.rolledItem || this.rngStateAfterRoll === undefined) {
      throw new Error('TreasureRoomOverlayScene: takeAndAdvance with no rolled item');
    }
    const item = this.rolledItem;
    const rngStateAfter = this.rngStateAfterRoll;

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

    this.scene.stop();
    this.scene.resume('corridor');
  }
}
