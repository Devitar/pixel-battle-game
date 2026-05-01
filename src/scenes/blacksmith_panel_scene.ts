import * as Phaser from 'phaser';
import { listHeroes, updateHero } from '../camp/roster';
import { addItems, removeItem } from '../camp/stash';
import { balance, spend } from '../camp/vault';
import { BASE_ITEMS } from '../data/items';
import type { Item, ItemSlot, Rarity } from '../data/types';
import { equip } from '../items/equip';
import { itemAffixDescription, itemDisplayName } from '../items/selectors';
import { canUpgrade, nextRarity, upgradeCost, upgradeItem } from '../items/upgrade';
import { createRng } from '../util/rng';
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

export class BlacksmithPanelScene extends Phaser.Scene {
  private selectedItemId: string | null = null;
  private listPageStart = 0;
  private titleText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private listContainer!: Phaser.GameObjects.Container;
  private detailContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('blacksmith_panel');
  }

  create(): void {
    this.selectedItemId = null;
    this.listPageStart = 0;

    this.buildOverlayAndPanel();
    this.buildCloseButton();
    this.listContainer = this.add.container(0, 0);
    this.detailContainer = this.add.container(0, 0);
    this.buildListPaneBackground();
    this.buildDetailPaneBackground();

    this.rebuild();

    this.input.keyboard?.on('keydown-ESC', () => this.close());
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

  private collectUpgradeable(): UpgradeEntry[] {
    const state = appState.get();
    const entries: UpgradeEntry[] = [];

    // Stash first.
    for (const item of state.stash.items) {
      if (canUpgrade(item)) {
        entries.push({ item, location: { kind: 'stash' } });
      }
    }
    // Then equipped, in roster order.
    const slots: readonly ItemSlot[] = ['weapon', 'shield', 'outfit', 'hat'];
    for (const hero of listHeroes(state.roster)) {
      for (const slot of slots) {
        const item = hero.equipment[slot];
        if (item && canUpgrade(item)) {
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
