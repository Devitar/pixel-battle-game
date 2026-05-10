import * as Phaser from 'phaser';
import { BASE_ITEMS } from '@data/items';
import { itemAffixDescription, itemDisplayName } from '@items/selectors';
import { currentNode, leaveShop, purchaseItem } from '@run/run_state';
import type { ShopItem } from '@dungeon/node';
import { SHEET } from '@render/frames';
import {
  Button,
  createBitmapText,
  createPanel,
} from '@ui/widgets';
import { appState } from './app_state';

const PANEL_X = 140;
const PANEL_Y = 60;
const PANEL_W = 680;
const PANEL_H = 400;

const ROW_H = 52;
const ROW_STRIDE = 56;
const ROW_Y_FIRST = PANEL_Y + 20;
const ICON_SCALE = 2;

export class ShopOverlayScene extends Phaser.Scene {
  constructor() {
    super('shop_overlay');
  }

  create(): void {
    const run = appState.get().runState!;
    const node = currentNode(run);
    if (node.type !== 'shop') return;

    // Dim overlay (full-canvas modal backdrop). Interactive blocks clicks
    // from reaching scenes below.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    // Header (top strip, above panel).
    createBitmapText({
      scene: this,
      x: 480,
      y: 12,
      text: 'Shop',
      font: 'medium',
      size: 16,
      originX: 0.5,
    });
    createBitmapText({
      scene: this,
      x: 900,
      y: 12,
      text: `Pack: ${run.pack.gold}g`,
      font: 'small',
      size: 16,
      originX: 1,
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
      onClick: () => this.onLeave(),
    });

    // Main panel.
    createPanel({ scene: this, x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H });

    // Item rows.
    for (let i = 0; i < node.inventory.length; i++) {
      const slot = node.inventory[i];
      const rowY = ROW_Y_FIRST + i * ROW_STRIDE;
      this.buildRow(slot, rowY, run.pack.gold);
    }

    // Footer buttons (below panel).
    const footerY = PANEL_Y + PANEL_H + 12;
    new Button({
      scene: this,
      x: PANEL_X + 60,
      y: footerY,
      width: 160,
      height: 32,
      text: 'Manage Gear',
      font: 'medium',
      fontSize: 16,
      onClick: () => this.onManageGear(),
    });
    new Button({
      scene: this,
      x: PANEL_X + 280,
      y: footerY,
      width: 120,
      height: 32,
      text: 'Leave',
      font: 'medium',
      fontSize: 16,
      onClick: () => this.onLeave(),
    });

    this.input.keyboard?.on('keydown-ESC', () => this.onLeave());

    // Restart on RESUME so equip-scene changes are reflected immediately.
    this.events.once(Phaser.Scenes.Events.RESUME, () => this.scene.restart());
  }

  private buildRow(slot: ShopItem, rowY: number, packGold: number): void {
    const sold = slot.sold;
    const canAfford = packGold >= slot.price;
    const rowX = PANEL_X + 16;
    const rowW = PANEL_W - 32;

    // Subtle row background.
    this.add
      .rectangle(rowX + rowW / 2, rowY + ROW_H / 2, rowW, ROW_H, 0x111111)
      .setStrokeStyle(1, 0x333333);

    // Item icon (raw Phaser sprite — same pattern as the blacksmith rows).
    const iconX = rowX + 16;
    const iconY = rowY + ROW_H / 2;
    const sprite = this.add
      .sprite(iconX, iconY, SHEET.key, parseInt(BASE_ITEMS[slot.item.baseId].spriteId, 10))
      .setScale(ICON_SCALE);
    if (sold) sprite.setAlpha(0.4);

    // Item name (raw Phaser — multi-color name with rarity tag).
    const rarityTag = sold ? '' : ` [${slot.item.rarity}]`;
    const nameText = itemDisplayName(slot.item) + rarityTag;
    this.add.text(rowX + 40, rowY + 4, nameText, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: sold ? '#666666' : '#ffffff',
    });

    // Affix line.
    const affixLine = itemAffixDescription(slot.item);
    if (affixLine.length > 0) {
      this.add.text(rowX + 40, rowY + 26, affixLine, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#999999',
      });
    }

    // Price / state (right-aligned).
    let priceText: string;
    if (sold) {
      priceText = 'SOLD';
    } else if (!canAfford) {
      priceText = `${slot.price}g (need more)`;
    } else {
      priceText = `${slot.price}g`;
    }
    this.add
      .text(rowX + rowW - 100, rowY + ROW_H / 2, priceText, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: sold ? '#666666' : canAfford ? '#ffcc66' : '#cc6666',
      })
      .setOrigin(1, 0.5);

    // Buy button (only when purchasable). Compact raw-Phaser rect button
    // matches the blacksmith per-row pattern.
    if (!sold && canAfford) {
      const buttonCx = rowX + rowW - 40;
      const buttonBg = this.add
        .rectangle(buttonCx, rowY + ROW_H / 2, 64, 26, 0x335533)
        .setStrokeStyle(1, 0x66aa66);
      this.add
        .text(buttonCx, rowY + ROW_H / 2, 'Buy', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      buttonBg.setInteractive({ useHandCursor: true });
      buttonBg.on('pointerdown', () => this.onBuy(slot.item.id));
    }
  }

  private onBuy(itemId: string): void {
    appState.update((s) => ({
      ...s,
      runState: purchaseItem(s.runState!, itemId),
    }));
    this.scene.restart();
  }

  private onManageGear(): void {
    this.scene.launch('equip', { kind: 'in_run', returnTo: 'shop_overlay' });
    this.scene.bringToTop('equip');
    this.scene.pause();
  }

  private onLeave(): void {
    appState.update((s) => ({
      ...s,
      runState: leaveShop(s.runState!),
    }));
    this.scene.stop();
    this.scene.resume('corridor');
  }
}
