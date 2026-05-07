import { ConstraintMode, Dialog, Image, UiScene } from 'phaser-pixui';
import type { Frame } from 'phaser-pixui';
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
import { fixPixuiCanvasViewport } from '@render/pixui_canvas_fix';
import { uiTheme } from '@render/ui_theme';
import { createRng } from '@util/rng';
import { appState } from './app_state';

// Module-level state persists across scene.restart().
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

// List pane (left side of split)
const LIST_X = PANEL_X + 10;
const LIST_W = 380;
const LIST_H = PANEL_H - 90;

// Detail pane (right side of split)
const DETAIL_W = 460;

// Row constants (absolute coords)
const ROW_X = LIST_X + LIST_W / 2;
const ROW_Y_BASE = PANEL_Y + 140;
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

export class BlacksmithPanelScene extends UiScene {
  constructor() {
    super({
      key: 'blacksmith_panel',
      viewportConstraints: { mode: ConstraintMode.Maximum, width: 960, height: 540 },
      theme: uiTheme,
    });
  }

  create(): void {
    fixPixuiCanvasViewport(this);
    super.create();

    // Header
    const isUpgrade = _mode === 'upgrade';
    const state = appState.get();
    const gold = balance(state.vault);

    const titleText = isUpgrade
      ? `Blacksmith · ${this.collectUpgradeable().length} upgradeable`
      : `Blacksmith · Sell (${this.collectSellable(state.stash.items).length} in stash)`;

    this.insert.top.textArea({ y: 28, text: titleText });
    this.insert.topRight.textArea({ x: 60, y: 28, text: `Gold: ${gold}` });
    this.insert.topRight.button({
      x: 4,
      y: 4,
      width: 48,
      text: 'X',
      onClick: () => this.close(),
    });

    // Building upgrade button (top-left of header)
    this.buildUpgradeButton();

    // Mode toggle buttons
    this.insert.topLeft.button({
      x: PANEL_X + LIST_W / 2 - 70,
      y: PANEL_Y + 60,
      width: 120,
      text: 'Upgrade',
      style: isUpgrade ? undefined : undefined,
      onClick: () => this.setMode('upgrade'),
    });
    this.insert.topLeft.button({
      x: PANEL_X + LIST_W / 2 + 70,
      y: PANEL_Y + 60,
      width: 120,
      text: 'Sell',
      onClick: () => this.setMode('sell'),
    });

    // Main panel frame
    const panel = this.insert.topLeft.frame({
      x: PANEL_X,
      y: PANEL_Y,
      width: PANEL_W,
      height: PANEL_H,
    });

    if (isUpgrade) {
      this.buildUpgradeMode(panel);
    } else {
      this.buildSellMode(panel);
    }

    // Sell-confirm dialog (created hidden, shown immediately when _sellConfirmItem is set)
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

    this.insert.topLeft.button({
      x: 88,
      y: 28,
      width: 160,
      enabled: canAfford,
      text: `Upgrade · ${next.upgradeCost}g`,
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

  private buildUpgradeMode(panel: Frame): void {
    const entries = this.collectUpgradeable();

    if (entries.length === 0) {
      panel.insert.center.textArea({ text: 'No items can be upgraded.' });
      return;
    }

    // Clamp page
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

    this.buildUpgradeDetail(panel, entries);
  }

  private buildSellMode(panel: Frame): void {
    const items = this.collectSellable(appState.get().stash.items);

    if (items.length === 0) {
      panel.insert.center.textArea({ text: 'Stash is empty.' });
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

    this.buildSellDetail(panel, items);
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

    // Row background (raw Phaser for fine-grained selection highlight)
    const bg = this.add
      .rectangle(ROW_X, y, ROW_W, ROW_H, isSelected ? 0x2a2418 : 0x1a1a1a)
      .setStrokeStyle(2, isSelected ? 0xffcc66 : 0x222222, 1);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      _selectedItemId = entry.item.id;
      this.scene.restart();
    });

    // Item icon
    const iconX = ROW_X - ROW_W / 2 + 24;
    const itemIcon = new Image(this, {
      texture: 'sprites',
      frame: String(BASE_ITEMS[entry.item.baseId].spriteId),
    });
    itemIcon.internal.setScale(1.5);
    this.add.existing(itemIcon.internal);
    itemIcon.internal.setPosition(iconX, y);

    // Display name + rarity
    const name = itemDisplayName(entry.item);
    this.add
      .text(iconX + 28, y - 10, `${name}  ${RARITY_LABEL[entry.item.rarity]}`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#cccccc',
      })
      .setOrigin(0, 0.5);

    // Affix + location
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

    // Cost
    this.add
      .text(ROW_X + ROW_W / 2 - 78, y, `${cost}g`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: canAfford ? '#ffcc66' : '#cc6666',
      })
      .setOrigin(1, 0.5);

    // Upgrade button
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
      .rectangle(ROW_X, y, ROW_W, ROW_H, isSelected ? 0x2a2418 : 0x1a1a1a)
      .setStrokeStyle(2, isSelected ? 0xffcc66 : 0x222222, 1);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      _selectedItemId = item.id;
      this.scene.restart();
    });

    const iconX = ROW_X - ROW_W / 2 + 24;
    const itemIcon = new Image(this, {
      texture: 'sprites',
      frame: String(BASE_ITEMS[item.baseId].spriteId),
    });
    itemIcon.internal.setScale(1.5);
    this.add.existing(itemIcon.internal);
    itemIcon.internal.setPosition(iconX, y);

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

  private buildUpgradeDetail(panel: Frame, entries: UpgradeEntry[]): void {
    const entry = _selectedItemId
      ? entries.find((e) => e.item.id === _selectedItemId)
      : undefined;
    if (!entry) return;

    const item = entry.item;
    const target = nextRarity(item.rarity);
    if (target === null) return;

    const detailPanel = panel.insert.topLeft.frame({
      x: LIST_W + 20,
      y: 70,
      width: DETAIL_W,
      height: LIST_H,
    });

    detailPanel.insert.top.textArea({ y: 20, text: itemDisplayName(item) });
    detailPanel.insert.top.textArea({ y: 50, text: `${item.rarity}  →  ${target}` });
    detailPanel.insert.topLeft.textArea({ x: 12, y: 90, text: 'What this changes:' });

    let cursorY = 114;
    detailPanel.insert.topLeft.textArea({ x: 28, y: cursorY, text: '+1 random affix' });
    cursorY += 20;
    if (target === 'rare' && item.slot !== 'hat') {
      detailPanel.insert.topLeft.textArea({ x: 28, y: cursorY, text: '+1 rare property' });
      cursorY += 20;
    }

    const cost = upgradeCost(item);
    detailPanel.insert.topLeft.textArea({ x: 12, y: cursorY + 24, text: `Cost: ${cost}g` });
  }

  private buildSellDetail(panel: Frame, items: readonly Item[]): void {
    const item = _selectedItemId
      ? items.find((i) => i.id === _selectedItemId)
      : undefined;
    if (!item) return;

    const detailPanel = panel.insert.topLeft.frame({
      x: LIST_W + 20,
      y: 70,
      width: DETAIL_W,
      height: LIST_H,
    });

    detailPanel.insert.top.textArea({ y: 20, text: itemDisplayName(item) });
    detailPanel.insert.top.textArea({ y: 50, text: item.rarity });

    const affixes = itemAffixDescription(item);
    if (affixes.length > 0) {
      detailPanel.insert.top.textArea({ y: 90, text: affixes });
    }

    detailPanel.insert.top.textArea({
      y: affixes.length > 0 ? 120 : 90,
      text: `Sell value: ${itemSellValue(item)}g`,
    });
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
    // pixui.Dialog starts with visible:false; we set it true immediately.
    // Dismissal is done by setting visible=false, then clearing _sellConfirmItem + restart.
    // The dialog is placed at center via this.insert.center.dialog(...).
    const dialog: Dialog = this.insert.center.dialog({
      width: 420,
      height: 200,
    });

    dialog.insert.top.textArea({ y: 20, text: 'Sell rare item?' });
    dialog.insert.top.textArea({
      y: 56,
      text: `${itemDisplayName(item)} for ${itemSellValue(item)}g`,
    });

    dialog.insert.bottom.button({
      x: -72,
      y: 12,
      width: 120,
      text: 'Cancel',
      onClick: () => {
        dialog.visible = false;
        _sellConfirmItem = null;
        this.scene.restart();
      },
    });

    dialog.insert.bottom.button({
      x: 72,
      y: 12,
      width: 120,
      text: 'Sell',
      onClick: () => {
        dialog.visible = false;
        _sellConfirmItem = null;
        this.performSell(item);
      },
    });

    // Show immediately.
    dialog.visible = true;
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

    // Adopt the upgraded item's id so the selection sticks post-rebuild.
    _selectedItemId = upgraded.id;

    appState.update((s) => ({
      ...s,
      vault: newVault,
      stash: nextStash,
      roster: nextRoster,
    }));

    this.scene.restart();
  }

  private close(): void {
    // Reset module-level state on close so reopening starts fresh.
    _mode = 'upgrade';
    _selectedItemId = null;
    _listPageStart = 0;
    _sellConfirmItem = null;
    this.scene.stop();
    this.scene.resume('camp');
  }
}
