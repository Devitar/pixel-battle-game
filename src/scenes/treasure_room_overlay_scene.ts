import { ConstraintMode, UiScene } from 'phaser-pixui';
import { DUNGEONS } from '@data/dungeons';
import type { Item } from '@data/types';
import { rollLoot } from '@dungeon/loot';
import { itemAffixDescription, itemDisplayName } from '@items/selectors';
import { claimTreasure, currentNode } from '@run/run_state';
import { fixPixuiCanvasViewport } from '@render/pixui_canvas_fix';
import { uiTheme } from '@render/ui_theme';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';

// Persists across scene.restart() so the opened state survives the rebuild.
let _pendingState: 'closed' | 'opened' = 'closed';
let _pendingItem: Item | undefined;
let _pendingRngStateAfter: number | undefined;

export class TreasureRoomOverlayScene extends UiScene {
  constructor() {
    super({
      key: 'treasure_room_overlay',
      viewportConstraints: { mode: ConstraintMode.Maximum, width: 960, height: 540 },
      theme: uiTheme,
    });
  }

  create(): void {
    fixPixuiCanvasViewport(this);
    super.create();

    const opened = _pendingState === 'opened';

    // Header
    this.insert.top.textArea({ y: 28, text: 'Treasure!' });
    this.insert.topRight.button({
      x: 4,
      y: 4,
      width: 48,
      text: 'X',
      onClick: () => this.close(),
    });

    // Central content frame (top-anchored so y is from canvas top)
    const panel = this.insert.topLeft.frame({
      x: 260,
      y: 60,
      width: 440,
      height: 360,
    });

    if (!opened) {
      panel.insert.center.textArea({ text: 'A chest awaits.' });
      panel.insert.bottom.button({
        y: 12,
        width: 160,
        text: 'Open',
        onClick: () => this.openChest(),
      });
    } else {
      const item = _pendingItem!;
      const name = itemDisplayName(item);
      const affixes = itemAffixDescription(item);
      const rarityLabel = item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1);

      panel.insert.top.textArea({ y: 20, text: rarityLabel });
      panel.insert.top.textArea({ y: 60, text: name });

      if (affixes.length > 0) {
        panel.insert.top.textArea({ y: 100, text: affixes });
      }

      panel.insert.bottom.button({
        y: 12,
        width: 160,
        text: 'Take',
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
