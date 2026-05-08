import { ConstraintMode, Image, OriginX, OriginY, UiScene } from 'phaser-pixui';
import type { Frame } from 'phaser-pixui';
import * as Phaser from 'phaser';
import { BASE_ITEMS } from '@data/items';
import { itemAffixDescription, itemDisplayName } from '@items/selectors';
import { currentNode, leaveShop, purchaseItem } from '@run/run_state';
import type { ShopItem } from '@dungeon/node';
import { SHEET } from '@render/frames';
import { fixPixuiCanvasViewport } from '@render/pixui_canvas_fix';
import { uiTheme } from '@render/ui_theme';
import { appState } from './app_state';

const PANEL_X = 140;
const PANEL_Y = 60;
const PANEL_W = 680;
const PANEL_H = 400;

const ROW_H = 52;
const ROW_STRIDE = 56;
const ROW_Y_FIRST = 20;
const ICON_SCALE = 2;

export class ShopOverlayScene extends UiScene {
  constructor() {
    super({
      key: 'shop_overlay',
      viewportConstraints: { mode: ConstraintMode.Maximum, width: 960, height: 540 },
      theme: uiTheme,
    });
  }

  create(): void {
    fixPixuiCanvasViewport(this);
    super.create();

    const run = appState.get().runState!;
    const node = currentNode(run);
    if (node.type !== 'shop') return;

    // Header
    this.insert.top.textArea({ y: 28, text: 'Shop' });
    this.insert.topRight.button({
      x: 4,
      y: 4,
      width: 48,
      text: 'X',
      onClick: () => this.onLeave(),
    });
    this.insert.topRight.textArea({
      x: 60,
      y: 28,
      text: `Pack: ${run.pack.gold}g`,
    });

    // Main panel
    const panel = this.insert.topLeft.frame({
      x: PANEL_X,
      y: PANEL_Y,
      width: PANEL_W,
      height: PANEL_H,
    });

    // Item rows
    for (let i = 0; i < node.inventory.length; i++) {
      const slot = node.inventory[i];
      const rowY = ROW_Y_FIRST + i * ROW_STRIDE;
      this.buildRow(panel, slot, rowY, run.pack.gold);
    }

    // Footer buttons
    const footerY = PANEL_Y + PANEL_H + 12;
    this.insert.topLeft.button({
      x: PANEL_X + 60,
      y: footerY,
      width: 160,
      text: 'Manage Gear',
      onClick: () => this.onManageGear(),
    });
    this.insert.topLeft.button({
      x: PANEL_X + 280,
      y: footerY,
      width: 120,
      text: 'Leave',
      onClick: () => this.onLeave(),
    });

    this.input.keyboard?.on('keydown-ESC', () => this.onLeave());

    // Restart on RESUME so equip-scene changes are reflected immediately.
    this.events.once(Phaser.Scenes.Events.RESUME, () => this.scene.restart());
  }

  private buildRow(
    panel: Frame,
    slot: ShopItem,
    rowY: number,
    packGold: number,
  ): void {
    const sold = slot.sold;
    const canAfford = packGold >= slot.price;

    // Row frame
    const row = panel.insert.topLeft.frame({
      x: 8,
      y: rowY,
      width: -16,
      height: ROW_H,
    });

    // Item icon via inline pixui.Image
    const itemSprite = new Image(this, {
      texture: SHEET.key,
      frame: BASE_ITEMS[slot.item.baseId].spriteId,
    });
    itemSprite.internal.setScale(ICON_SCALE);
    if (sold) itemSprite.internal.setAlpha(0.4);
    row.attach(itemSprite, OriginX.Left, OriginY.Center);

    // Item name (rarity indicated by text suffix since TextArea has no tint)
    const rarityTag = sold ? '' : ` [${slot.item.rarity}]`;
    const nameText = itemDisplayName(slot.item) + rarityTag;
    row.insert.topLeft.textArea({ x: 48, y: 4, text: nameText });

    // Affix line
    const affixLine = itemAffixDescription(slot.item);
    if (affixLine.length > 0) {
      row.insert.topLeft.textArea({ x: 48, y: 26, text: affixLine });
    }

    // Price / state (right-aligned)
    let priceText: string;
    if (sold) {
      priceText = 'SOLD';
    } else if (!canAfford) {
      priceText = `${slot.price}g (need more)`;
    } else {
      priceText = `${slot.price}g`;
    }
    row.insert.topRight.textArea({ x: 8, y: 16, text: priceText });

    // Buy button (only when purchasable)
    if (!sold && canAfford) {
      row.insert.right.button({
        x: 8,
        width: 80,
        text: 'Buy',
        onClick: () => this.onBuy(slot.item.id),
      });
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
