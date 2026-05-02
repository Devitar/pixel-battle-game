import * as Phaser from 'phaser';
import { nextLevel } from '@camp/building_levels';
import { applyBuildingUpgrade } from '@camp/building_upgrade';
import { listHeroes, updateHero } from '@camp/roster';
import { addItems, removeItem } from '@camp/stash';
import { balance, spend } from '@camp/vault';
import { BASE_ITEMS } from '@data/items';
import type { Item, ItemSlot, Rarity } from '@data/types';
import { equip } from '@items/equip';
import { itemAffixDescription, itemDisplayName } from '@items/selectors';
import { applyItemSell, itemSellValue } from '@items/sell';
import { canBlacksmithUpgrade, nextRarity, upgradeCost, upgradeItem } from '@items/upgrade';
import { createRng } from '@util/rng';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 920;
const PANEL_H = 460;

const LIST_PANE_CX = 245;
const LIST_PANE_CY = 270;
const LIST_PANE_W = 380;
const LIST_PANE_H = 360;

const DETAIL_PANE_CX = 715;
const DETAIL_PANE_CY = 270;
const DETAIL_PANE_W = 440;
const DETAIL_PANE_H = 360;

const ROW_X = LIST_PANE_CX;
const ROW_Y_BASE = 130;
const ROW_STRIDE = 56;
const ROW_W = 360;
const ROW_H = 50;
const VISIBLE_ROWS = 6;

const PAGE_ARROW_X = 450;
const PAGE_UP_Y = ROW_Y_BASE - 6;
const PAGE_DOWN_Y = ROW_Y_BASE + (VISIBLE_ROWS - 1) * ROW_STRIDE + 6;

const RARITY_HEX: Record<Rarity, string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
};

type Location =
  | { kind: 'stash' }
  | { kind: 'equipped'; heroId: string; slot: ItemSlot };

interface UpgradeEntry {
  item: Item;
  location: Location;
  heroName?: string;
}

type Mode = 'upgrade' | 'sell';

export class BlacksmithPanelScene extends Phaser.Scene {
  private mode: Mode = 'upgrade';
  private selectedItemId: string | null = null;
  private listPageStart = 0;
  private titleText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private listContainer!: Phaser.GameObjects.Container;
  private detailContainer!: Phaser.GameObjects.Container;
  private modeButtonsContainer?: Phaser.GameObjects.Container;
  private confirmContainer?: Phaser.GameObjects.Container;

  constructor() {
    super('blacksmith_panel');
  }

  create(): void {
    this.mode = 'upgrade';
    this.selectedItemId = null;
    this.listPageStart = 0;
    this.confirmContainer = undefined;

    this.buildOverlayAndPanel();
    this.buildCloseButton();
    this.buildUpgradeButton();
    this.buildListPaneBackground();
    this.buildDetailPaneBackground();
    this.buildModeToggle();
    this.listContainer = this.add.container(0, 0);
    this.detailContainer = this.add.container(0, 0);

    this.rebuild();

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private buildModeToggle(): void {
    // Anchored above the list pane (LIST_PANE top edge ~ y=90).
    const y = 100;
    const upgradeX = 175;
    const sellX = 315;
    const w = 120;
    const h = 26;

    const upgradeBg = this.add
      .rectangle(upgradeX, y, w, h, 0x333333)
      .setStrokeStyle(2, 0x666666);
    const upgradeLabel = this.add
      .text(upgradeX, y, 'Upgrade', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    upgradeBg.setInteractive({ useHandCursor: true });
    upgradeBg.on('pointerdown', () => this.setMode('upgrade'));

    const sellBg = this.add
      .rectangle(sellX, y, w, h, 0x333333)
      .setStrokeStyle(2, 0x666666);
    const sellLabel = this.add
      .text(sellX, y, 'Sell', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    sellBg.setInteractive({ useHandCursor: true });
    sellBg.on('pointerdown', () => this.setMode('sell'));

    this.modeButtonsContainer = this.add.container(0, 0, [
      upgradeBg, upgradeLabel, sellBg, sellLabel,
    ]);
    // Tag for state-driven styling in refreshModeToggle.
    upgradeBg.setData('mode', 'upgrade');
    sellBg.setData('mode', 'sell');
    upgradeLabel.setData('mode', 'upgrade');
    sellLabel.setData('mode', 'sell');

    this.refreshModeToggle();
  }

  private refreshModeToggle(): void {
    if (!this.modeButtonsContainer) return;
    for (const child of this.modeButtonsContainer.list) {
      const m = child.getData('mode') as Mode | undefined;
      if (m === undefined) continue;
      const active = m === this.mode;
      if (child instanceof Phaser.GameObjects.Rectangle) {
        child.setFillStyle(active ? 0x2a4a2a : 0x333333);
        child.setStrokeStyle(2, active ? 0x44cc44 : 0x666666);
      } else if (child instanceof Phaser.GameObjects.Text) {
        child.setColor(active ? '#ffffff' : '#aaaaaa');
      }
    }
  }

  private setMode(next: Mode): void {
    if (this.mode === next) return;
    this.mode = next;
    this.selectedItemId = null;
    this.listPageStart = 0;
    this.refreshModeToggle();
    this.rebuild();
  }

  private buildOverlayAndPanel(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0);
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666);

    this.titleText = this.add
      .text(PANEL_CX, 60, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.goldText = this.add
      .text(890, 60, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffcc66',
      })
      .setOrigin(1, 0.5);
  }

  private buildCloseButton(): void {
    const closeBg = this.add
      .rectangle(933, 63, 28, 28, 0x553333)
      .setStrokeStyle(1, 0x885555);
    this.add
      .text(933, 63, '×', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => this.close());
  }

  private buildUpgradeButton(): void {
    const level = appState.get().buildingLevels.blacksmith;
    const next = nextLevel('blacksmith', level);
    if (next === null) return;

    const gold = balance(appState.get().vault);
    const canAfford = gold >= next.upgradeCost;

    // Mirrors barracks_panel_scene.ts placement: top-left of header strip,
    // close button at (933, 63) is the right-side anchor.
    const x = 160;
    const y = 55;
    const bgColor = canAfford ? 0x2a4a2a : 0x333333;
    const strokeColor = canAfford ? 0x44cc44 : 0x555555;
    const labelColor = canAfford ? '#ffffff' : '#777777';

    const bg = this.add
      .rectangle(x, y, 160, 24, bgColor)
      .setStrokeStyle(2, strokeColor);
    this.add
      .text(x, y, `Upgrade · ${next.upgradeCost}g`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: labelColor,
      })
      .setOrigin(0.5);
    this.add
      .text(x, y + 20, `→ ${next.unlockDescription}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    if (canAfford) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        appState.update((s) => applyBuildingUpgrade(s, 'blacksmith'));
        this.scene.restart();
      });
    }
  }

  private buildListPaneBackground(): void {
    this.add
      .rectangle(LIST_PANE_CX, LIST_PANE_CY, LIST_PANE_W, LIST_PANE_H, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444);
  }

  private buildDetailPaneBackground(): void {
    this.add
      .rectangle(DETAIL_PANE_CX, DETAIL_PANE_CY, DETAIL_PANE_W, DETAIL_PANE_H, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444);
  }

  private rebuild(): void {
    this.listContainer.removeAll(true);
    this.detailContainer.removeAll(true);

    if (this.mode === 'sell') {
      this.rebuildSellMode();
      return;
    }

    const entries = this.collectUpgradeable();

    this.titleText.setText(`Blacksmith · ${entries.length} upgradeable`);
    this.goldText.setText(`Gold: ${balance(appState.get().vault)}`);

    if (entries.length === 0) {
      this.listContainer.add(
        this.add
          .text(LIST_PANE_CX, LIST_PANE_CY, 'No items can be upgraded.', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#888888',
          })
          .setOrigin(0.5),
      );
      this.selectedItemId = null;
      return;
    }

    // Clamp page so we don't show an empty slice after an upgrade reduced the list.
    const maxStart = Math.max(0, entries.length - VISIBLE_ROWS);
    if (this.listPageStart > maxStart) this.listPageStart = maxStart;

    if (!this.selectedItemId || !entries.some((e) => e.item.id === this.selectedItemId)) {
      this.selectedItemId = entries[0].item.id;
    }

    const pageEntries = entries.slice(this.listPageStart, this.listPageStart + VISIBLE_ROWS);
    for (let i = 0; i < pageEntries.length; i++) {
      this.buildRow(pageEntries[i], i);
    }

    if (entries.length > VISIBLE_ROWS) {
      this.buildPaginationArrows(entries.length);
    }

    this.rebuildDetail(entries);
  }

  private rebuildSellMode(): void {
    const state = appState.get();
    const items = this.collectSellable(state.stash.items);

    this.titleText.setText(`Blacksmith · Sell (${items.length} in stash)`);
    this.goldText.setText(`Gold: ${balance(state.vault)}`);

    if (items.length === 0) {
      this.listContainer.add(
        this.add
          .text(LIST_PANE_CX, LIST_PANE_CY, 'Stash is empty.', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#888888',
          })
          .setOrigin(0.5),
      );
      this.selectedItemId = null;
      return;
    }

    const maxStart = Math.max(0, items.length - VISIBLE_ROWS);
    if (this.listPageStart > maxStart) this.listPageStart = maxStart;

    if (!this.selectedItemId || !items.some((i) => i.id === this.selectedItemId)) {
      this.selectedItemId = items[0].id;
    }

    const pageItems = items.slice(this.listPageStart, this.listPageStart + VISIBLE_ROWS);
    for (let i = 0; i < pageItems.length; i++) {
      this.buildSellRow(pageItems[i], i);
    }

    if (items.length > VISIBLE_ROWS) {
      this.buildPaginationArrows(items.length);
    }

    this.rebuildSellDetail(items);
  }

  // Sort: rarity desc (rares first — most valuable surfaced) then floorRolledAt
  // desc (newer drops on top within rarity). Encourages visibility of high-value
  // items players might forget they're holding.
  private collectSellable(items: readonly Item[]): readonly Item[] {
    const rarityOrder: Record<Rarity, number> = { common: 2, uncommon: 1, rare: 0 };
    return [...items].sort((a, b) => {
      const ra = rarityOrder[a.rarity] - rarityOrder[b.rarity];
      if (ra !== 0) return ra;
      const fa = b.floorRolledAt - a.floorRolledAt;
      if (fa !== 0) return fa;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  private collectUpgradeable(): UpgradeEntry[] {
    const state = appState.get();
    const blacksmithLevel = state.buildingLevels.blacksmith;
    const entries: UpgradeEntry[] = [];

    // Stash first.
    for (const item of state.stash.items) {
      if (canBlacksmithUpgrade(item, blacksmithLevel)) {
        entries.push({ item, location: { kind: 'stash' } });
      }
    }
    // Then equipped, in roster order.
    const slots: readonly ItemSlot[] = ['weapon', 'shield', 'outfit', 'hat'];
    for (const hero of listHeroes(state.roster)) {
      for (const slot of slots) {
        const item = hero.equipment[slot];
        if (item && canBlacksmithUpgrade(item, blacksmithLevel)) {
          entries.push({
            item,
            location: { kind: 'equipped', heroId: hero.id, slot },
            heroName: hero.name,
          });
        }
      }
    }
    // Within each section, sort by rarity asc, then floorRolledAt asc, then id
    // for stable ordering — cheap upgrades surface above expensive ones.
    const stashSection = entries.filter((e) => e.location.kind === 'stash');
    const equippedSection = entries.filter((e) => e.location.kind === 'equipped');
    const rarityOrder: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2 };
    const sortFn = (a: UpgradeEntry, b: UpgradeEntry): number => {
      const ra = rarityOrder[a.item.rarity] - rarityOrder[b.item.rarity];
      if (ra !== 0) return ra;
      const fa = a.item.floorRolledAt - b.item.floorRolledAt;
      if (fa !== 0) return fa;
      return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0;
    };
    stashSection.sort(sortFn);
    equippedSection.sort(sortFn);
    return [...stashSection, ...equippedSection];
  }

  private buildRow(entry: UpgradeEntry, indexInPage: number): void {
    const y = ROW_Y_BASE + indexInPage * ROW_STRIDE;
    const isSelected = entry.item.id === this.selectedItemId;
    const vaultGold = balance(appState.get().vault);
    const cost = upgradeCost(entry.item);
    const canAfford = vaultGold >= cost;

    const bg = this.add
      .rectangle(ROW_X, y, ROW_W, ROW_H, isSelected ? 0x2a2418 : 0x1a1a1a)
      .setStrokeStyle(2, isSelected ? 0xffcc66 : 0x222222, 1);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.selectItem(entry.item.id));
    this.listContainer.add(bg);

    // Item icon (left).
    const iconX = ROW_X - ROW_W / 2 + 24;
    const sprite = this.add
      .sprite(iconX, y, 'sprites', parseInt(BASE_ITEMS[entry.item.baseId].spriteId, 10))
      .setScale(2);
    this.listContainer.add(sprite);

    // Display name + rarity color.
    const name = itemDisplayName(entry.item);
    this.listContainer.add(
      this.add
        .text(iconX + 22, y - 10, `${name}  [${entry.item.rarity}]`, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: RARITY_HEX[entry.item.rarity],
        })
        .setOrigin(0, 0.5),
    );

    // Affix description + location label.
    const affixDesc = itemAffixDescription(entry.item);
    const locLabel = entry.location.kind === 'stash' ? 'Stash' : `on ${entry.heroName ?? '?'}`;
    const subtitle = affixDesc.length > 0 ? `${affixDesc}  ·  ${locLabel}` : locLabel;
    this.listContainer.add(
      this.add
        .text(iconX + 22, y + 8, subtitle, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#999999',
        })
        .setOrigin(0, 0.5),
    );

    // Cost (right of row, before button).
    this.listContainer.add(
      this.add
        .text(ROW_X + ROW_W / 2 - 78, y, `${cost}g`, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: canAfford ? '#ffcc66' : '#cc6666',
        })
        .setOrigin(1, 0.5),
    );

    // Upgrade button.
    const buttonX = ROW_X + ROW_W / 2 - 38;
    const buttonBg = this.add
      .rectangle(buttonX, y, 64, 26, canAfford ? 0x335533 : 0x333333)
      .setStrokeStyle(1, canAfford ? 0x66aa66 : 0x555555);
    this.listContainer.add(buttonBg);
    this.listContainer.add(
      this.add
        .text(buttonX, y, 'Upgrade', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: canAfford ? '#ffffff' : '#777777',
        })
        .setOrigin(0.5),
    );

    if (canAfford) {
      buttonBg.setInteractive({ useHandCursor: true });
      buttonBg.on('pointerdown', () => this.upgrade(entry));
    }
  }

  private buildSellRow(item: Item, indexInPage: number): void {
    const y = ROW_Y_BASE + indexInPage * ROW_STRIDE;
    const isSelected = item.id === this.selectedItemId;
    const value = itemSellValue(item);

    const bg = this.add
      .rectangle(ROW_X, y, ROW_W, ROW_H, isSelected ? 0x2a2418 : 0x1a1a1a)
      .setStrokeStyle(2, isSelected ? 0xffcc66 : 0x222222, 1);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.selectItem(item.id));
    this.listContainer.add(bg);

    const iconX = ROW_X - ROW_W / 2 + 24;
    const sprite = this.add
      .sprite(iconX, y, 'sprites', parseInt(BASE_ITEMS[item.baseId].spriteId, 10))
      .setScale(2);
    this.listContainer.add(sprite);

    const name = itemDisplayName(item);
    this.listContainer.add(
      this.add
        .text(iconX + 22, y - 10, `${name}  [${item.rarity}]`, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: RARITY_HEX[item.rarity],
        })
        .setOrigin(0, 0.5),
    );

    const affixDesc = itemAffixDescription(item);
    const subtitle = affixDesc.length > 0 ? affixDesc : 'no affixes';
    this.listContainer.add(
      this.add
        .text(iconX + 22, y + 8, subtitle, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#999999',
        })
        .setOrigin(0, 0.5),
    );

    this.listContainer.add(
      this.add
        .text(ROW_X + ROW_W / 2 - 78, y, `+${value}g`, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffcc66',
        })
        .setOrigin(1, 0.5),
    );

    const buttonX = ROW_X + ROW_W / 2 - 38;
    const buttonBg = this.add
      .rectangle(buttonX, y, 64, 26, 0x553333)
      .setStrokeStyle(1, 0x885555);
    this.listContainer.add(buttonBg);
    this.listContainer.add(
      this.add
        .text(buttonX, y, 'Sell', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );

    buttonBg.setInteractive({ useHandCursor: true });
    buttonBg.on('pointerdown', () => this.requestSell(item));
  }

  private rebuildSellDetail(items: readonly Item[]): void {
    this.detailContainer.removeAll(true);
    const item = this.selectedItemId
      ? items.find((i) => i.id === this.selectedItemId)
      : undefined;
    if (!item) return;

    this.detailContainer.add(
      this.add
        .text(DETAIL_PANE_CX, 110, itemDisplayName(item), {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: RARITY_HEX[item.rarity],
        })
        .setOrigin(0.5),
    );

    this.detailContainer.add(
      this.add
        .text(DETAIL_PANE_CX, 138, item.rarity, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#cccccc',
        })
        .setOrigin(0.5),
    );

    const affixes = itemAffixDescription(item);
    if (affixes.length > 0) {
      this.detailContainer.add(
        this.add
          .text(DETAIL_PANE_CX, 170, affixes, {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#bbbbbb',
            wordWrap: { width: 380 },
            align: 'center',
          })
          .setOrigin(0.5),
      );
    }

    this.detailContainer.add(
      this.add
        .text(DETAIL_PANE_CX, 220, `Sell value: ${itemSellValue(item)}g`, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffcc66',
        })
        .setOrigin(0.5),
    );
  }

  private requestSell(item: Item): void {
    // Rare items get a confirm step — losing an 80g resource by misclick is
    // painful. Common/uncommon sell instantly, mirroring the Upgrade flow.
    if (item.rarity === 'rare') {
      this.showSellConfirm(item);
      return;
    }
    this.performSell(item);
  }

  private showSellConfirm(item: Item): void {
    if (this.confirmContainer) return; // already open

    const overlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.75)
      .setOrigin(0, 0);
    const dialogBg = this.add
      .rectangle(PANEL_CX, PANEL_CY, 420, 180, 0x222222)
      .setStrokeStyle(2, 0x885555);
    const title = this.add
      .text(PANEL_CX, PANEL_CY - 56, 'Sell rare item?', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);
    const body = this.add
      .text(
        PANEL_CX,
        PANEL_CY - 18,
        `${itemDisplayName(item)} for ${itemSellValue(item)}g`,
        {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#dddddd',
          align: 'center',
        },
      )
      .setOrigin(0.5);

    const cancelBg = this.add
      .rectangle(PANEL_CX - 80, PANEL_CY + 40, 130, 32, 0x333333)
      .setStrokeStyle(2, 0x666666);
    const cancelLabel = this.add
      .text(PANEL_CX - 80, PANEL_CY + 40, 'Cancel', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const confirmBg = this.add
      .rectangle(PANEL_CX + 80, PANEL_CY + 40, 130, 32, 0x553333)
      .setStrokeStyle(2, 0xcc6666);
    const confirmLabel = this.add
      .text(PANEL_CX + 80, PANEL_CY + 40, 'Sell', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.confirmContainer = this.add.container(0, 0, [
      overlay, dialogBg, title, body, cancelBg, cancelLabel, confirmBg, confirmLabel,
    ]);

    cancelBg.setInteractive({ useHandCursor: true });
    cancelBg.on('pointerdown', () => this.dismissConfirm());

    confirmBg.setInteractive({ useHandCursor: true });
    confirmBg.on('pointerdown', () => {
      this.dismissConfirm();
      this.performSell(item);
    });
  }

  private dismissConfirm(): void {
    if (!this.confirmContainer) return;
    this.confirmContainer.destroy(true);
    this.confirmContainer = undefined;
  }

  private performSell(item: Item): void {
    appState.update((s) => applyItemSell(s, item.id));
    // After selling, drop selection — rebuild will pick the new top item.
    this.selectedItemId = null;
    this.rebuild();
  }

  private buildPaginationArrows(totalEntries: number): void {
    const canPageUp = this.listPageStart > 0;
    const canPageDown = this.listPageStart + VISIBLE_ROWS < totalEntries;

    const upArrow = this.add
      .text(PAGE_ARROW_X, PAGE_UP_Y, '▲', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: canPageUp ? '#cccccc' : '#444444',
      })
      .setOrigin(0.5);
    if (canPageUp) {
      upArrow.setInteractive({ useHandCursor: true });
      upArrow.on('pointerdown', () => {
        this.listPageStart = Math.max(0, this.listPageStart - VISIBLE_ROWS);
        this.rebuild();
      });
    }
    this.listContainer.add(upArrow);

    const downArrow = this.add
      .text(PAGE_ARROW_X, PAGE_DOWN_Y, '▼', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: canPageDown ? '#cccccc' : '#444444',
      })
      .setOrigin(0.5);
    if (canPageDown) {
      downArrow.setInteractive({ useHandCursor: true });
      downArrow.on('pointerdown', () => {
        this.listPageStart += VISIBLE_ROWS;
        this.rebuild();
      });
    }
    this.listContainer.add(downArrow);
  }

  private selectItem(id: string): void {
    this.selectedItemId = id;
    this.rebuild();
  }

  private rebuildDetail(entries: UpgradeEntry[]): void {
    this.detailContainer.removeAll(true);

    const entry = this.selectedItemId
      ? entries.find((e) => e.item.id === this.selectedItemId)
      : undefined;
    if (!entry) return;

    const item = entry.item;
    const target = nextRarity(item.rarity);
    if (target === null) return;

    // Display name.
    this.detailContainer.add(
      this.add
        .text(DETAIL_PANE_CX, 110, itemDisplayName(item), {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: RARITY_HEX[item.rarity],
        })
        .setOrigin(0.5),
    );

    // Rarity transition.
    this.detailContainer.add(
      this.add
        .text(DETAIL_PANE_CX, 138, `${item.rarity}  →  ${target}`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#cccccc',
        })
        .setOrigin(0.5),
    );

    // What this changes.
    this.detailContainer.add(
      this.add
        .text(DETAIL_PANE_CX - 180, 180, 'What this changes:', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#dddddd',
        })
        .setOrigin(0, 0.5),
    );
    let cursorY = 204;
    this.detailContainer.add(
      this.add
        .text(DETAIL_PANE_CX - 160, cursorY, '+1 random affix', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#bbbbbb',
        })
        .setOrigin(0, 0.5),
    );
    cursorY += 20;
    if (target === 'rare' && item.slot !== 'hat') {
      this.detailContainer.add(
        this.add
          .text(DETAIL_PANE_CX - 160, cursorY, '+1 rare property', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#bbbbbb',
          })
          .setOrigin(0, 0.5),
      );
      cursorY += 20;
    }

    // Cost summary.
    const cost = upgradeCost(item);
    this.detailContainer.add(
      this.add
        .text(DETAIL_PANE_CX, cursorY + 24, `Cost: ${cost}g`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffcc66',
        })
        .setOrigin(0.5),
    );
  }

  private upgrade(entry: UpgradeEntry): void {
    const state = appState.get();
    const cost = upgradeCost(entry.item);
    if (balance(state.vault) < cost) return;

    const rng = createRng(Math.floor(Math.random() * 0xffffffff));
    const upgraded = upgradeItem(entry.item, rng);
    const newVault = spend(state.vault, cost);

    let nextStash = state.stash;
    let nextRoster = state.roster;

    const location = entry.location;
    if (location.kind === 'stash') {
      nextStash = addItems(removeItem(state.stash, entry.item.id), [upgraded]);
    } else {
      const hero = listHeroes(state.roster).find((h) => h.id === location.heroId);
      if (!hero) return;
      const equipped = equip(hero, upgraded, location.slot);
      nextRoster = updateHero(state.roster, equipped.hero);
    }

    // Adopt the new item id as the selection so the post-rebuild selection
    // sticks to "the item the player just acted on" instead of jumping to top.
    this.selectedItemId = upgraded.id;

    appState.update((s) => ({
      ...s,
      vault: newVault,
      stash: nextStash,
      roster: nextRoster,
    }));

    this.rebuild();
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
