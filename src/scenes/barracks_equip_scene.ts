import * as Phaser from 'phaser';
import { CLASSES } from '@data/classes';
import { BASE_ITEMS } from '@data/items';
import type { Item, ItemSlot, Rarity } from '@data/types';
import { equipFromStash, unequipToStash } from '@items/equip_camp';
import { itemAffixDescription, itemDisplayName, previewStats, type StatPreview } from '@items/selectors';
import { applyEquipmentStats } from '@items/stats';
import type { Hero } from '@heroes/hero';
import { heroToLoadout } from '@render/hero_loadout';
import { Paperdoll } from '@render/paperdoll';
import type { Stats } from '@combat/types';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 920;
const PANEL_H = 460;

const TITLE_Y = 60;
const CLOSE_X_X = 933;
const CLOSE_X_Y = 63;

const PAPERDOLL_X = 200;
const PAPERDOLL_Y = 200;
const PAPERDOLL_SCALE = 4;

const HERO_NAME_X = 270;
const HERO_NAME_Y = 110;
const HERO_CLASS_Y = 132;

const SLOTS: readonly ItemSlot[] = ['weapon', 'shield', 'outfit', 'hat'];
const SLOT_SQUARE_SIZE = 56;
const SLOT_STRIP_Y = 380;
const SLOT_STRIP_X = [150, 240, 330, 420] as const;

const STATS_X = 180;
const STATS_CURRENT_Y = 440;
const STATS_PREVIEW_Y = 455;

const PICKER_HEADER_X = 635;
const PICKER_HEADER_Y = 110;
const PICKER_X = 635;
const PICKER_Y_BASE = 150;
const PICKER_ROW_H = 56;
const PICKER_ROW_W = 540;
const PICKER_VISIBLE_ROWS = 4;
const PICKER_PAGE_ARROW_X = 905;

const RARITY_COLOR_NUM: Record<Rarity, number> = {
  common: 0xcccccc,
  uncommon: 0x4488ff,
  rare: 0xffcc66,
};

const RARITY_COLOR_HEX: Record<Rarity, string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
};

const SELECTION_GOLD = 0xffcc66;
const EMPTY_SENTINEL = '__empty__';

export class BarracksEquipScene extends Phaser.Scene {
  private heroId: string = '';
  private selectedSlot: ItemSlot | null = null;
  private highlightedItemId: string | null = null;
  private pickerPageStart: number = 0;
  private contentContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('barracks_equip');
  }

  init(data: { heroId: string }): void {
    this.heroId = data.heroId;
    this.selectedSlot = null;
    this.highlightedItemId = null;
    this.pickerPageStart = 0;
  }

  create(): void {
    this.buildBackgroundAndPanel();
    this.buildCloseButton();
    this.contentContainer = this.add.container(0, 0);
    this.rebuild();
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private buildBackgroundAndPanel(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666);
  }

  private buildCloseButton(): void {
    const closeBg = this.add
      .rectangle(CLOSE_X_X, CLOSE_X_Y, 28, 28, 0x553333)
      .setStrokeStyle(1, 0x885555);
    this.add
      .text(CLOSE_X_X, CLOSE_X_Y, '×', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => this.close());
  }

  private rebuild(): void {
    this.contentContainer.removeAll(true);

    const hero = this.currentHero();
    if (!hero) {
      // Defensive — should never happen if the launch heroId is valid.
      this.contentContainer.add(
        this.add
          .text(PANEL_CX, PANEL_CY, 'Hero not found.', {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#cc6666',
          })
          .setOrigin(0.5),
      );
      return;
    }

    this.buildTitle(hero);
    this.buildPaperdoll(hero);
    this.buildHeroInfo(hero);
    this.buildSlotStrip(hero);
    this.buildStatsLines(hero);
    this.buildPicker(hero);
  }

  private currentHero(): Hero | undefined {
    return appState.get().roster.heroes.find((h) => h.id === this.heroId);
  }

  private buildTitle(hero: Hero): void {
    this.contentContainer.add(
      this.add
        .text(PANEL_CX, TITLE_Y, `Equip · ${hero.name}`, {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );
  }

  private buildPaperdoll(hero: Hero): void {
    const doll = new Paperdoll(this, PAPERDOLL_X, PAPERDOLL_Y, heroToLoadout(hero));
    doll.setScale(PAPERDOLL_SCALE);
    this.contentContainer.add(doll);
  }

  private buildHeroInfo(hero: Hero): void {
    const classDef = CLASSES[hero.classId];
    this.contentContainer.add(
      this.add.text(HERO_NAME_X, HERO_NAME_Y, hero.name, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
      }),
    );
    this.contentContainer.add(
      this.add.text(HERO_NAME_X, HERO_CLASS_Y, `${classDef.name} · Lv ${hero.level}`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#aaaaaa',
      }),
    );
  }

  private buildSlotStrip(hero: Hero): void {
    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const x = SLOT_STRIP_X[i];
      this.buildSlotSquare(slot, hero.equipment[slot], x);
    }
  }

  private buildSlotSquare(slot: ItemSlot, item: Item | undefined, x: number): void {
    const isSelected = this.selectedSlot === slot;
    const borderColor = item ? RARITY_COLOR_NUM[item.rarity] : 0x444444;
    const square = this.add
      .rectangle(x, SLOT_STRIP_Y, SLOT_SQUARE_SIZE, SLOT_SQUARE_SIZE, 0x222222)
      .setStrokeStyle(isSelected ? 3 : 2, isSelected ? SELECTION_GOLD : borderColor);

    if (item) {
      const sprite = this.add
        .sprite(x, SLOT_STRIP_Y, 'sprites', parseInt(BASE_ITEMS[item.baseId].spriteId, 10))
        .setScale(2);
      this.contentContainer.add(sprite);
    } else {
      this.contentContainer.add(
        this.add
          .text(x, SLOT_STRIP_Y, slot, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#666666',
          })
          .setOrigin(0.5),
      );
    }

    this.contentContainer.add(
      this.add
        .text(x, SLOT_STRIP_Y + SLOT_SQUARE_SIZE / 2 + 8, slot, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#888888',
        })
        .setOrigin(0.5),
    );

    square.setInteractive({ useHandCursor: true });
    square.on('pointerdown', () => this.onSlotClick(slot));
    this.contentContainer.add(square);
  }

  private onSlotClick(slot: ItemSlot): void {
    if (this.selectedSlot === slot) {
      this.selectedSlot = null;
    } else {
      this.selectedSlot = slot;
    }
    this.highlightedItemId = null;
    this.pickerPageStart = 0;
    this.rebuild();
  }

  private buildStatsLines(hero: Hero): void {
    const currentStats = applyEquipmentStats(hero.baseStats, hero.equipment);
    this.contentContainer.add(
      this.add.text(STATS_X, STATS_CURRENT_Y, this.formatStatsLine(currentStats), {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#dddddd',
      }),
    );

    const preview = this.computePreviewIfHighlighted(hero);
    if (preview) {
      this.buildPreviewStatsTokens(preview);
    }
  }

  private computePreviewIfHighlighted(hero: Hero): StatPreview | null {
    if (this.selectedSlot === null) return null;
    if (this.highlightedItemId === null) return null;

    if (this.highlightedItemId === EMPTY_SENTINEL) {
      // Preview = unequip simulation
      const simulated = { ...hero.equipment };
      if (this.selectedSlot !== 'weapon') {
        delete (simulated as Record<string, unknown>)[this.selectedSlot];
      }
      const currentStats = applyEquipmentStats(hero.baseStats, hero.equipment);
      const previewedStats = applyEquipmentStats(hero.baseStats, simulated);
      const deltas: Partial<Stats> = {};
      for (const k of Object.keys(currentStats) as (keyof Stats)[]) {
        if (currentStats[k] !== previewedStats[k]) {
          deltas[k] = previewedStats[k] - currentStats[k];
        }
      }
      return { currentStats, previewStats: previewedStats, deltas };
    }

    const item = appState.get().stash.items.find((i) => i.id === this.highlightedItemId);
    if (!item) return null;
    return previewStats(hero, item, this.selectedSlot);
  }

  private formatStatsLine(stats: Stats): string {
    return `HP ${stats.hp}  ATK ${stats.attack}  DEF ${stats.defense}  SPD ${stats.speed}  MND ${stats.mind}  CRT ${stats.crit}%  DDG ${stats.dodge}%`;
  }

  private buildPreviewStatsTokens(preview: StatPreview): void {
    const keys: (keyof Stats)[] = ['hp', 'attack', 'defense', 'speed', 'mind', 'crit', 'dodge'];
    const labels: Record<keyof Stats, string> = {
      hp: 'HP', attack: 'ATK', defense: 'DEF', speed: 'SPD', mind: 'MND', crit: 'CRT', dodge: 'DDG',
    };
    const suffix: Partial<Record<keyof Stats, string>> = { crit: '%', dodge: '%' };
    let xCursor = STATS_X;
    for (const k of keys) {
      const delta = preview.deltas[k];
      let color = '#dddddd';
      if (delta !== undefined && delta > 0) color = '#44cc44';
      else if (delta !== undefined && delta < 0) color = '#cc4444';
      const tok = this.add.text(
        xCursor,
        STATS_PREVIEW_Y,
        `${labels[k]} ${preview.previewStats[k]}${suffix[k] ?? ''}`,
        {
          fontFamily: 'monospace',
          fontSize: '11px',
          color,
        },
      );
      this.contentContainer.add(tok);
      xCursor += tok.width + 12;
    }
  }

  private buildPicker(hero: Hero): void {
    if (this.selectedSlot === null) {
      this.contentContainer.add(
        this.add
          .text(PICKER_HEADER_X, PICKER_HEADER_Y, 'Click a slot to manage gear.', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#888888',
          })
          .setOrigin(0.5, 0),
      );
      return;
    }

    this.contentContainer.add(
      this.add
        .text(PICKER_HEADER_X, PICKER_HEADER_Y, `Pick a ${this.selectedSlot} item`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffcc66',
        })
        .setOrigin(0.5, 0),
    );

    const rows = this.pickerRowsForSlot(hero, this.selectedSlot);
    const pageRows = rows.slice(this.pickerPageStart, this.pickerPageStart + PICKER_VISIBLE_ROWS);
    for (let i = 0; i < pageRows.length; i++) {
      this.buildPickerRow(pageRows[i], i, hero);
    }

    if (rows.length > PICKER_VISIBLE_ROWS) {
      this.buildPaginationArrows(rows.length);
    }
  }

  private pickerRowsForSlot(hero: Hero, slot: ItemSlot): readonly PickerRow[] {
    const out: PickerRow[] = [];
    // "(empty)" first for non-weapon slots, only if something is currently equipped.
    if (slot !== 'weapon' && hero.equipment[slot] !== undefined) {
      out.push({ kind: 'empty' });
    }
    const stash = appState.get().stash;
    const compatible = stash.items.filter((i) => i.slot === slot);
    const rarityOrder: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2 };
    const sorted = [...compatible].sort((a, b) => {
      const ra = rarityOrder[a.rarity] - rarityOrder[b.rarity];
      if (ra !== 0) return ra;
      const fa = a.floorRolledAt - b.floorRolledAt;
      if (fa !== 0) return fa;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    for (const item of sorted) {
      out.push({ kind: 'item', item });
    }
    return out;
  }

  private buildPickerRow(row: PickerRow, indexInPage: number, hero: Hero): void {
    const y = PICKER_Y_BASE + indexInPage * PICKER_ROW_H;
    const rowId = row.kind === 'empty' ? EMPTY_SENTINEL : row.item.id;
    const isHighlighted = this.highlightedItemId === rowId;

    const bg = this.add
      .rectangle(PICKER_X, y, PICKER_ROW_W, PICKER_ROW_H - 4, isHighlighted ? 0x2a2418 : 0x1a1a1a)
      .setStrokeStyle(2, isHighlighted ? SELECTION_GOLD : 0x222222);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.onPickerRowClick(row));
    this.contentContainer.add(bg);

    if (row.kind === 'empty') {
      this.contentContainer.add(
        this.add
          .text(PICKER_X, y, '(empty)', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#888888',
            fontStyle: 'italic',
          })
          .setOrigin(0.5),
      );
      return;
    }

    const item = row.item;
    const iconX = PICKER_X - PICKER_ROW_W / 2 + 24;
    const sprite = this.add
      .sprite(iconX, y, 'sprites', parseInt(BASE_ITEMS[item.baseId].spriteId, 10))
      .setScale(2);
    this.contentContainer.add(sprite);

    const name = itemDisplayName(item);
    const isEquipped = hero.equipment[item.slot]?.id === item.id;
    const nameLine = isEquipped ? `${name}  [${item.rarity}]  [Equipped]` : `${name}  [${item.rarity}]`;
    this.contentContainer.add(
      this.add
        .text(iconX + 22, y - 10, nameLine, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: RARITY_COLOR_HEX[item.rarity],
        })
        .setOrigin(0, 0.5),
    );

    const affixDesc = itemAffixDescription(item);
    if (affixDesc.length > 0) {
      this.contentContainer.add(
        this.add
          .text(iconX + 22, y + 10, affixDesc, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#999999',
          })
          .setOrigin(0, 0.5),
      );
    }
  }

  private onPickerRowClick(row: PickerRow): void {
    const rowId = row.kind === 'empty' ? EMPTY_SENTINEL : row.item.id;

    // If this row is already highlighted, second click commits.
    if (this.highlightedItemId === rowId) {
      this.commit(row);
      return;
    }
    // Otherwise, first click highlights (preview).
    this.highlightedItemId = rowId;
    this.rebuild();
  }

  private commit(row: PickerRow): void {
    if (this.selectedSlot === null) return;
    const state = appState.get();

    if (row.kind === 'empty') {
      const result = unequipToStash(state.roster, state.stash, this.heroId, this.selectedSlot);
      appState.update((s) => ({ ...s, roster: result.roster, stash: result.stash }));
    } else {
      const result = equipFromStash(state.roster, state.stash, this.heroId, row.item.id, this.selectedSlot);
      appState.update((s) => ({ ...s, roster: result.roster, stash: result.stash }));
    }

    // Clear highlight + page; the picker contents likely changed.
    this.highlightedItemId = null;
    this.pickerPageStart = 0;
    this.rebuild();
  }

  private buildPaginationArrows(totalRows: number): void {
    const canPageUp = this.pickerPageStart > 0;
    const canPageDown = this.pickerPageStart + PICKER_VISIBLE_ROWS < totalRows;

    const upArrow = this.add
      .text(PICKER_PAGE_ARROW_X, PICKER_Y_BASE - 10, '▲', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: canPageUp ? '#cccccc' : '#444444',
      })
      .setOrigin(0.5);
    if (canPageUp) {
      upArrow.setInteractive({ useHandCursor: true });
      upArrow.on('pointerdown', () => {
        this.pickerPageStart = Math.max(0, this.pickerPageStart - PICKER_VISIBLE_ROWS);
        this.rebuild();
      });
    }
    this.contentContainer.add(upArrow);

    const downArrow = this.add
      .text(PICKER_PAGE_ARROW_X, PICKER_Y_BASE + (PICKER_VISIBLE_ROWS - 1) * PICKER_ROW_H + 10, '▼', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: canPageDown ? '#cccccc' : '#444444',
      })
      .setOrigin(0.5);
    if (canPageDown) {
      downArrow.setInteractive({ useHandCursor: true });
      downArrow.on('pointerdown', () => {
        this.pickerPageStart += PICKER_VISIBLE_ROWS;
        this.rebuild();
      });
    }
    this.contentContainer.add(downArrow);
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('barracks_panel');
  }
}

type PickerRow =
  | { kind: 'empty' }
  | { kind: 'item'; item: Item };
