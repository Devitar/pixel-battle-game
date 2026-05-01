import * as Phaser from 'phaser';
import { BASE_ITEMS } from '../data/items';
import { itemAffixDescription, itemDisplayName } from '../items/selectors';
import { currentNode, leaveShop, purchaseItem } from '../run/run_state';
import type { ShopItem } from '../dungeon/node';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 680;
const PANEL_H = 360;

const HEADER_Y = 105;
const HEADER_TITLE_X = 160;
const HEADER_GOLD_X = 800;

const ROW_FIRST_Y = 175;
const ROW_HEIGHT = 52;
const ROW_SPRITE_X = 175;
const ROW_NAME_X = 215;
const ROW_PRICE_X = 790;
const ROW_BG_X = PANEL_CX;
const ROW_BG_W = PANEL_W - 40;

const FOOTER_Y = 425;
const MANAGE_GEAR_X = 380;
const LEAVE_X = 580;
const FOOTER_BUTTON_W = 140;
const FOOTER_BUTTON_H = 32;

const RARITY_COLOR: Record<'common' | 'uncommon' | 'rare', string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
};

export class ShopOverlayScene extends Phaser.Scene {
  private contentContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('shop_overlay');
  }

  create(): void {
    this.buildBackgroundAndPanel();
    this.contentContainer = this.add.container(0, 0);
    this.rerender();

    this.events.on(Phaser.Scenes.Events.RESUME, () => this.rerender());
  }

  private buildBackgroundAndPanel(): void {
    // Dim full canvas, click-blocking.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();
    // Panel chrome.
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666);
  }

  private rerender(): void {
    this.contentContainer.removeAll(true);
    this.buildHeader();
    this.buildRows();
    this.buildFooter();
  }

  private buildHeader(): void {
    const run = appState.get().runState!;
    this.contentContainer.add(
      this.add.text(HEADER_TITLE_X, HEADER_Y, 'Shop', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      }),
    );
    this.contentContainer.add(
      this.add
        .text(HEADER_GOLD_X, HEADER_Y, `Pack: ${run.pack.gold}g`, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffcc66',
        })
        .setOrigin(1, 0),
    );
  }

  private buildRows(): void {
    const run = appState.get().runState!;
    const node = currentNode(run);
    if (node.type !== 'shop') {
      // Defensive — shouldn't happen given dungeon scene's gate.
      return;
    }
    for (let i = 0; i < node.inventory.length; i++) {
      const slot = node.inventory[i];
      const y = ROW_FIRST_Y + i * ROW_HEIGHT;
      this.buildRow(slot, y, run.pack.gold);
    }
  }

  private buildRow(slot: ShopItem, y: number, packGold: number): void {
    const sold = slot.sold;
    const canAfford = packGold >= slot.price;
    const interactive = !sold && canAfford;

    // Background — invisible but interactive when allowed.
    const bg = this.add
      .rectangle(ROW_BG_X, y, ROW_BG_W, ROW_HEIGHT - 4, 0x000000, 0)
      .setStrokeStyle(0, 0xffcc66);
    this.contentContainer.add(bg);

    // Sprite.
    const spriteFrame = parseInt(BASE_ITEMS[slot.item.baseId].spriteId, 10);
    const sprite = this.add
      .sprite(ROW_SPRITE_X, y, 'sprites', spriteFrame)
      .setScale(2);
    if (sold) sprite.setAlpha(0.4);
    this.contentContainer.add(sprite);

    // Name (rarity color, dimmed if sold).
    const nameColor = sold ? '#666666' : RARITY_COLOR[slot.item.rarity];
    const nameText = this.add.text(ROW_NAME_X, y - 8, itemDisplayName(slot.item), {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: nameColor,
    });
    this.contentContainer.add(nameText);

    // Affix line (skip if empty).
    const affixLine = itemAffixDescription(slot.item);
    if (affixLine.length > 0) {
      const affixText = this.add.text(ROW_NAME_X, y + 10, affixLine, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: sold ? '#555555' : '#aaaaaa',
      });
      this.contentContainer.add(affixText);
    }

    // Price / state.
    let priceColor: string;
    let priceText: string;
    if (sold) {
      priceColor = '#666666';
      priceText = 'SOLD';
    } else if (!canAfford) {
      priceColor = '#cc6666';
      priceText = `${slot.price}g`;
    } else {
      priceColor = '#ffcc66';
      priceText = `${slot.price}g`;
    }
    this.contentContainer.add(
      this.add
        .text(ROW_PRICE_X, y, priceText, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: priceColor,
        })
        .setOrigin(1, 0.5),
    );

    if (interactive) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setStrokeStyle(1, 0xffcc66));
      bg.on('pointerout', () => bg.setStrokeStyle(0, 0xffcc66));
      bg.on('pointerdown', () => this.onBuy(slot.item.id));
    }
  }

  private buildFooter(): void {
    this.buildFooterButton(MANAGE_GEAR_X, 'Manage Gear', 0x555555, () =>
      this.onManageGear(),
    );
    this.buildFooterButton(LEAVE_X, 'Leave', 0xffcc66, () => this.onLeave());
  }

  private buildFooterButton(
    x: number,
    label: string,
    strokeColor: number,
    onClick: () => void,
  ): void {
    const bg = this.add
      .rectangle(x, FOOTER_Y, FOOTER_BUTTON_W, FOOTER_BUTTON_H, 0x333333)
      .setStrokeStyle(2, strokeColor);
    const text = this.add
      .text(x, FOOTER_Y, label, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', onClick);
    this.contentContainer.add(bg);
    this.contentContainer.add(text);
  }

  private onBuy(itemId: string): void {
    appState.update((s) => ({
      ...s,
      runState: purchaseItem(s.runState!, itemId),
    }));
    this.rerender();
  }

  private onManageGear(): void {
    this.scene.launch('equip_panel', { returnTo: 'shop_overlay' });
    // EquipPanelScene is registered earlier than ShopOverlayScene in main.ts, so
    // by default it renders BENEATH the shop overlay. Bring it to top so the
    // player can see and interact with it.
    this.scene.bringToTop('equip_panel');
    this.scene.pause();
  }

  private onLeave(): void {
    appState.update((s) => ({
      ...s,
      runState: leaveShop(s.runState!),
    }));
    this.scene.stop();
    this.scene.resume('dungeon');
  }
}
