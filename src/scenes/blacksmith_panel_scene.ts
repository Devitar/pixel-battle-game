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
import { SHEET } from '@render/frames';
import {
  Button,
  COLOR,
  createBitmapText,
  createDialog,
  createPanel,
} from '@ui/widgets';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';

// Module-level state — persists across scene.restart().
type Mode = 'upgrade' | 'sell';
let _mode: Mode = 'upgrade';
let _selectedItemId: string | null = null;
let _listPageStart = 0;
// When non-null, the sell-confirm dialog is shown for this item.
let _sellConfirmItem: Item | null = null;

const PANEL_X = 20;
const PANEL_Y = 40;
const PANEL_W = 920;
const PANEL_H = 460;

// List pane (canvas coords)
const LIST_X = PANEL_X + 10;
const LIST_W = 380;
const LIST_H = PANEL_H - 90;

// Detail pane (canvas coords)
const DETAIL_X = LIST_X + LIST_W + 20;
const DETAIL_Y = PANEL_Y + 70;
const DETAIL_W = 460;
const DETAIL_H = LIST_H;

// Row constants (canvas coords)
const ROW_X = LIST_X + LIST_W / 2;
const ROW_Y_BASE = PANEL_Y + 100;
const ROW_STRIDE = 56;
const ROW_W = 360;
const ROW_H = 50;
const VISIBLE_ROWS = 6;

const PAGE_ARROW_X = LIST_X + LIST_W + 8;
const PAGE_UP_Y = ROW_Y_BASE - 6;
const PAGE_DOWN_Y = ROW_Y_BASE + (VISIBLE_ROWS - 1) * ROW_STRIDE + 6;

const RARITY_LABEL: Record<Rarity, string> = {
  common: '[common]',
  uncommon: '[uncommon]',
  rare: '[rare]',
};

type Location =
  | { kind: 'stash' }
  | { kind: 'equipped'; heroId: string; slot: ItemSlot };

interface UpgradeEntry {
  item: Item;
  location: Location;
  heroName?: string;
}

export class BlacksmithPanelScene extends Phaser.Scene {
  // Refs used by selectItem() to do partial rebuilds instead of
  // scene.restart(). The detail-pane content all lives in a single Phaser
  // Container so teardown is just `_detailContainer.destroy(true)` — no
  // pixui dirty tricks needed.
  private _detailContainer: Phaser.GameObjects.Container | undefined;
  private _rowBgs: { bg: Phaser.GameObjects.Rectangle; id: string }[] = [];

  constructor() {
    super('blacksmith_panel');
  }

  create(): void {    this._detailContainer = undefined;
    this._rowBgs = [];

    // Main panel chrome.
    createPanel({ scene: this, x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H });

    const isUpgrade = _mode === 'upgrade';
    const state = appState.get();
    const gold = balance(state.vault);

    // Title (top strip, above the panel — matches the prior layout).
    const titleText = isUpgrade
      ? `Blacksmith · ${this.collectUpgradeable().length} upgradeable`
      : `Blacksmith · Sell (${this.collectSellable(state.stash.items).length} in stash)`;
    createBitmapText({
      scene: this,
      x: 480,
      y: 12,
      text: titleText,
      font: 'medium',
      size: 16,
      originX: 0.5,
    });

    // Gold display (top strip, right side).
    createBitmapText({
      scene: this,
      x: 900,
      y: 12,
      text: `Gold: ${gold}`,
      font: 'small',
      size: 16,
      tint: COLOR.affordable,
      originX: 1,
    });

    // Close button (top strip, far right).
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

    // Building-upgrade button (top strip, left side; conditional).
    this.buildUpgradeButton();

    // Mode toggle buttons (inside the panel header, just below the frame's
    // top decorative border).
    new Button({
      scene: this,
      x: PANEL_X + LIST_W / 2 - 130,
      y: PANEL_Y + 24,
      width: 120,
      height: 32,
      text: 'Upgrade',
      font: 'medium',
      fontSize: 16,
      onClick: () => this.setMode('upgrade'),
    });
    new Button({
      scene: this,
      x: PANEL_X + LIST_W / 2 + 10,
      y: PANEL_Y + 24,
      width: 120,
      height: 32,
      text: 'Sell',
      font: 'medium',
      fontSize: 16,
      onClick: () => this.setMode('sell'),
    });

    if (isUpgrade) {
      this.buildUpgradeMode();
    } else {
      this.buildSellMode();
    }

    if (_sellConfirmItem !== null) {
      this.buildSellConfirmDialog(_sellConfirmItem);
    }

    this.input.keyboard?.on('keydown-ESC', () => {
      if (_sellConfirmItem !== null) {
        _sellConfirmItem = null;
        this.scene.restart();
        return;
      }
      this.close();
    });
  }

  private buildUpgradeButton(): void {
    const level = appState.get().buildingLevels.blacksmith;
    const next = nextLevel('blacksmith', level);
    if (next === null) return;

    const gold = balance(appState.get().vault);
    const canAfford = gold >= next.upgradeCost;

    new Button({
      scene: this,
      x: 88,
      y: 4,
      width: 200,
      height: 32,
      enabled: canAfford,
      text: `Upgrade · ${next.upgradeCost}g`,
      font: 'medium',
      fontSize: 16,
      onClick: () => {
        if (!canAfford) return;
        appState.update((s) => applyBuildingUpgrade(s, 'blacksmith'));
        this.scene.restart();
      },
    });
  }

  private setMode(next: Mode): void {
    if (_mode === next) return;
    _mode = next;
    _selectedItemId = null;
    _listPageStart = 0;
    this.scene.restart();
  }

  // Partial update on selection click: only the row highlights and the
  // detail pane change — no scene.restart, no flicker.
  private selectItem(id: string): void {
    if (_selectedItemId === id) return;
    _selectedItemId = id;

    for (const row of this._rowBgs) {
      const sel = row.id === id;
      row.bg.setFillStyle(sel ? COLOR.rowBgSelected : COLOR.paneBg);
      row.bg.setStrokeStyle(2, sel ? COLOR.selectionGold : COLOR.rowStroke, 1);
    }

    this.rebuildDetailPane();
  }

  // Tear down the detail container (Phaser handles cascade-destroy of
  // children) and rebuild it. Native `Container.destroy(true)` replaces the
  // pixui sub-tree dirty trick.
  private rebuildDetailPane(): void {
    if (this._detailContainer) {
      this._detailContainer.destroy(true);
      this._detailContainer = undefined;
    }
    if (_mode === 'upgrade') {
      this.buildUpgradeDetail(this.collectUpgradeable());
    } else {
      this.buildSellDetail(this.collectSellable(appState.get().stash.items));
    }
  }

  private buildUpgradeMode(): void {
    const entries = this.collectUpgradeable();

    if (entries.length === 0) {
      this.add
        .text(ROW_X, ROW_Y_BASE + 60, 'No items can be upgraded.', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#888888',
        })
        .setOrigin(0.5);
      return;
    }

    const maxStart = Math.max(0, entries.length - VISIBLE_ROWS);
    if (_listPageStart > maxStart) _listPageStart = maxStart;

    if (!_selectedItemId || !entries.some((e) => e.item.id === _selectedItemId)) {
      _selectedItemId = entries[0].item.id;
    }

    const pageEntries = entries.slice(_listPageStart, _listPageStart + VISIBLE_ROWS);
    for (let i = 0; i < pageEntries.length; i++) {
      this.buildUpgradeRow(pageEntries[i], i);
    }

    if (entries.length > VISIBLE_ROWS) {
      this.buildPaginationArrows(entries.length);
    }

    this.buildUpgradeDetail(entries);
  }

  private buildSellMode(): void {
    const items = this.collectSellable(appState.get().stash.items);

    if (items.length === 0) {
      this.add
        .text(ROW_X, ROW_Y_BASE + 60, 'Stash is empty.', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#888888',
        })
        .setOrigin(0.5);
      return;
    }

    const maxStart = Math.max(0, items.length - VISIBLE_ROWS);
    if (_listPageStart > maxStart) _listPageStart = maxStart;

    if (!_selectedItemId || !items.some((i) => i.id === _selectedItemId)) {
      _selectedItemId = items[0].id;
    }

    const pageItems = items.slice(_listPageStart, _listPageStart + VISIBLE_ROWS);
    for (let i = 0; i < pageItems.length; i++) {
      this.buildSellRow(pageItems[i], i);
    }

    if (items.length > VISIBLE_ROWS) {
      this.buildPaginationArrows(items.length);
    }

    this.buildSellDetail(items);
  }

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

    for (const item of state.stash.items) {
      if (canBlacksmithUpgrade(item, blacksmithLevel)) {
        entries.push({ item, location: { kind: 'stash' } });
      }
    }
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

  private buildUpgradeRow(entry: UpgradeEntry, indexInPage: number): void {
    const y = ROW_Y_BASE + indexInPage * ROW_STRIDE;
    const isSelected = entry.item.id === _selectedItemId;
    const vaultGold = balance(appState.get().vault);
    const cost = upgradeCost(entry.item);
    const canAfford = vaultGold >= cost;

    const bg = this.add
      .rectangle(ROW_X, y, ROW_W, ROW_H, isSelected ? COLOR.rowBgSelected : COLOR.paneBg)
      .setStrokeStyle(2, isSelected ? COLOR.selectionGold : COLOR.rowStroke, 1);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.selectItem(entry.item.id));
    this._rowBgs.push({ bg, id: entry.item.id });

    const iconX = ROW_X - ROW_W / 2 + 24;
    this.add
      .sprite(iconX, y, SHEET.key, parseInt(BASE_ITEMS[entry.item.baseId].spriteId, 10))
      .setScale(1.5);

    const name = itemDisplayName(entry.item);
    this.add
      .text(iconX + 28, y - 10, `${name}  ${RARITY_LABEL[entry.item.rarity]}`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#cccccc',
      })
      .setOrigin(0, 0.5);

    const affixDesc = itemAffixDescription(entry.item);
    const locLabel = entry.location.kind === 'stash' ? 'Stash' : `on ${entry.heroName ?? '?'}`;
    const subtitle = affixDesc.length > 0 ? `${affixDesc}  ·  ${locLabel}` : locLabel;
    this.add
      .text(iconX + 28, y + 8, subtitle, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#999999',
      })
      .setOrigin(0, 0.5);

    this.add
      .text(ROW_X + ROW_W / 2 - 78, y, `${cost}g`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: canAfford ? '#ffcc66' : '#cc6666',
      })
      .setOrigin(1, 0.5);

    // Per-row Upgrade button: raw Phaser custom rect (compact, fits the row).
    const buttonX = ROW_X + ROW_W / 2 - 38;
    const buttonBg = this.add
      .rectangle(buttonX, y, 64, 26, canAfford ? 0x335533 : 0x333333)
      .setStrokeStyle(1, canAfford ? 0x66aa66 : 0x555555);
    this.add
      .text(buttonX, y, 'Upgrade', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: canAfford ? '#ffffff' : '#777777',
      })
      .setOrigin(0.5);
    if (canAfford) {
      buttonBg.setInteractive({ useHandCursor: true });
      buttonBg.on('pointerdown', () => this.upgrade(entry));
    }
  }

  private buildSellRow(item: Item, indexInPage: number): void {
    const y = ROW_Y_BASE + indexInPage * ROW_STRIDE;
    const isSelected = item.id === _selectedItemId;
    const value = itemSellValue(item);

    const bg = this.add
      .rectangle(ROW_X, y, ROW_W, ROW_H, isSelected ? COLOR.rowBgSelected : COLOR.paneBg)
      .setStrokeStyle(2, isSelected ? COLOR.selectionGold : COLOR.rowStroke, 1);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.selectItem(item.id));
    this._rowBgs.push({ bg, id: item.id });

    const iconX = ROW_X - ROW_W / 2 + 24;
    this.add
      .sprite(iconX, y, SHEET.key, parseInt(BASE_ITEMS[item.baseId].spriteId, 10))
      .setScale(1.5);

    const name = itemDisplayName(item);
    this.add
      .text(iconX + 28, y - 10, `${name}  ${RARITY_LABEL[item.rarity]}`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#cccccc',
      })
      .setOrigin(0, 0.5);

    const affixDesc = itemAffixDescription(item);
    const subtitle = affixDesc.length > 0 ? affixDesc : 'no affixes';
    this.add
      .text(iconX + 28, y + 8, subtitle, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#999999',
      })
      .setOrigin(0, 0.5);

    this.add
      .text(ROW_X + ROW_W / 2 - 78, y, `+${value}g`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffcc66',
      })
      .setOrigin(1, 0.5);

    const buttonX = ROW_X + ROW_W / 2 - 38;
    const buttonBg = this.add
      .rectangle(buttonX, y, 64, 26, 0x553333)
      .setStrokeStyle(1, 0x885555);
    this.add
      .text(buttonX, y, 'Sell', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    buttonBg.setInteractive({ useHandCursor: true });
    buttonBg.on('pointerdown', () => this.requestSell(item));
  }

  private buildUpgradeDetail(entries: readonly UpgradeEntry[]): void {
    const entry = _selectedItemId
      ? entries.find((e) => e.item.id === _selectedItemId)
      : undefined;
    if (!entry) return;

    const item = entry.item;
    const target = nextRarity(item.rarity);
    if (target === null) return;

    const container = this.add.container(0, 0);
    this._detailContainer = container;

    // Subtle backdrop for the detail area (pure visual, not pixui).
    const bg = this.add
      .rectangle(DETAIL_X + DETAIL_W / 2, DETAIL_Y + DETAIL_H / 2, DETAIL_W, DETAIL_H, 0x1a1a1a)
      .setStrokeStyle(1, 0x333333);
    container.add(bg);

    const cx = DETAIL_X + DETAIL_W / 2;
    container.add(
      createBitmapText({
        scene: this,
        x: cx,
        y: DETAIL_Y + 16,
        text: itemDisplayName(item),
        font: 'medium',
        size: 16,
        originX: 0.5,
      }),
    );
    container.add(
      createBitmapText({
        scene: this,
        x: cx,
        y: DETAIL_Y + 44,
        text: `${item.rarity}  >  ${target}`,
        font: 'small',
        size: 16,
        originX: 0.5,
      }),
    );
    container.add(
      createBitmapText({
        scene: this,
        x: DETAIL_X + 16,
        y: DETAIL_Y + 80,
        text: 'What this changes:',
        font: 'small',
        size: 16,
      }),
    );

    let cursorY = DETAIL_Y + 104;
    container.add(
      createBitmapText({
        scene: this,
        x: DETAIL_X + 32,
        y: cursorY,
        text: '+1 random affix',
        font: 'small',
        size: 16,
      }),
    );
    cursorY += 22;
    if (target === 'rare' && item.slot !== 'hat') {
      container.add(
        createBitmapText({
          scene: this,
          x: DETAIL_X + 32,
          y: cursorY,
          text: '+1 rare property',
          font: 'small',
          size: 16,
        }),
      );
      cursorY += 22;
    }

    const cost = upgradeCost(item);
    container.add(
      createBitmapText({
        scene: this,
        x: DETAIL_X + 16,
        y: cursorY + 16,
        text: `Cost: ${cost}g`,
        font: 'small',
        size: 16,
        tint: COLOR.affordable,
      }),
    );
  }

  private buildSellDetail(items: readonly Item[]): void {
    const item = _selectedItemId ? items.find((i) => i.id === _selectedItemId) : undefined;
    if (!item) return;

    const container = this.add.container(0, 0);
    this._detailContainer = container;

    const bg = this.add
      .rectangle(DETAIL_X + DETAIL_W / 2, DETAIL_Y + DETAIL_H / 2, DETAIL_W, DETAIL_H, 0x1a1a1a)
      .setStrokeStyle(1, 0x333333);
    container.add(bg);

    const cx = DETAIL_X + DETAIL_W / 2;
    container.add(
      createBitmapText({
        scene: this,
        x: cx,
        y: DETAIL_Y + 16,
        text: itemDisplayName(item),
        font: 'medium',
        size: 16,
        originX: 0.5,
      }),
    );
    container.add(
      createBitmapText({
        scene: this,
        x: cx,
        y: DETAIL_Y + 44,
        text: item.rarity,
        font: 'small',
        size: 16,
        originX: 0.5,
      }),
    );

    const affixes = itemAffixDescription(item);
    if (affixes.length > 0) {
      container.add(
        createBitmapText({
          scene: this,
          x: cx,
          y: DETAIL_Y + 80,
          text: affixes,
          font: 'small',
          size: 16,
          originX: 0.5,
        }),
      );
    }

    container.add(
      createBitmapText({
        scene: this,
        x: cx,
        y: DETAIL_Y + (affixes.length > 0 ? 110 : 80),
        text: `Sell value: ${itemSellValue(item)}g`,
        font: 'small',
        size: 16,
        tint: COLOR.affordable,
        originX: 0.5,
      }),
    );
  }

  private buildPaginationArrows(totalEntries: number): void {
    const canPageUp = _listPageStart > 0;
    const canPageDown = _listPageStart + VISIBLE_ROWS < totalEntries;

    const upArrow = this.add
      .text(PAGE_ARROW_X, PAGE_UP_Y, '▲', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: canPageUp ? '#cccccc' : '#444444',
      })
      .setOrigin(0, 0.5);
    if (canPageUp) {
      upArrow.setInteractive({ useHandCursor: true });
      upArrow.on('pointerdown', () => {
        _listPageStart = Math.max(0, _listPageStart - VISIBLE_ROWS);
        this.scene.restart();
      });
    }

    const downArrow = this.add
      .text(PAGE_ARROW_X, PAGE_DOWN_Y, '▼', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: canPageDown ? '#cccccc' : '#444444',
      })
      .setOrigin(0, 0.5);
    if (canPageDown) {
      downArrow.setInteractive({ useHandCursor: true });
      downArrow.on('pointerdown', () => {
        _listPageStart += VISIBLE_ROWS;
        this.scene.restart();
      });
    }
  }

  private requestSell(item: Item): void {
    // Rare items get a confirm step. Common/uncommon sell instantly.
    if (item.rarity === 'rare') {
      _sellConfirmItem = item;
      this.scene.restart();
      return;
    }
    this.performSell(item);
  }

  private buildSellConfirmDialog(item: Item): void {
    const dialog = createDialog({ scene: this, width: 420, height: 200 });
    const cx = dialog.frameX + dialog.width / 2;

    dialog.container.add(
      createBitmapText({
        scene: this,
        x: cx,
        y: dialog.frameY + 30,
        text: 'Sell rare item?',
        font: 'medium',
        size: 16,
        originX: 0.5,
      }),
    );
    dialog.container.add(
      createBitmapText({
        scene: this,
        x: cx,
        y: dialog.frameY + 70,
        text: `${itemDisplayName(item)} for ${itemSellValue(item)}g`,
        font: 'small',
        size: 16,
        originX: 0.5,
      }),
    );

    const cancelBtn = new Button({
      scene: this,
      x: dialog.frameX + 60,
      y: dialog.frameY + dialog.height - 56,
      width: 120,
      height: 32,
      text: 'Cancel',
      font: 'medium',
      fontSize: 16,
      onClick: () => {
        _sellConfirmItem = null;
        this.scene.restart();
      },
    });
    dialog.container.add(cancelBtn.gameObjects);

    const sellBtn = new Button({
      scene: this,
      x: dialog.frameX + dialog.width - 180,
      y: dialog.frameY + dialog.height - 56,
      width: 120,
      height: 32,
      text: 'Sell',
      font: 'medium',
      fontSize: 16,
      onClick: () => {
        _sellConfirmItem = null;
        this.performSell(item);
      },
    });
    dialog.container.add(sellBtn.gameObjects);
  }

  private performSell(item: Item): void {
    appState.update((s) => applyItemSell(s, item.id));
    _selectedItemId = null;
    _sellConfirmItem = null;
    this.scene.restart();
  }

  private upgrade(entry: UpgradeEntry): void {
    const state = appState.get();
    const cost = upgradeCost(entry.item);
    if (balance(state.vault) < cost) return;

    const rng = createRngFromState(state.campRngState);
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

    // Adopt the upgraded item's id so the selection sticks post-rebuild.
    _selectedItemId = upgraded.id;

    appState.update((s) => ({
      ...s,
      vault: newVault,
      stash: nextStash,
      roster: nextRoster,
      campRngState: rng.getState(),
    }));

    this.scene.restart();
  }

  private close(): void {
    _mode = 'upgrade';
    _selectedItemId = null;
    _listPageStart = 0;
    _sellConfirmItem = null;
    this.scene.stop();
    this.scene.resume('camp');
  }
}
