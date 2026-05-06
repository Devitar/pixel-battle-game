import * as Phaser from 'phaser';
import { CLASSES } from '@data/classes';
import type { AbilityId, Item, ItemSlot } from '@data/types';
import { BASE_ITEMS } from '@data/items';
import { ABILITIES } from '@data/abilities';
import type { Hero } from '@heroes/hero';
import { Paperdoll } from '@render/paperdoll';
import { heroToLoadout } from '@render/hero_loadout';
import { applyEquipmentStats } from '@items/stats';
import { describeKitStatus, resolveCombatAbilities, resolveAbilityDiff } from '@items/kit';
import { itemAffixDescription, itemDisplayName, previewStats, type StatPreview } from '@items/selectors';
import type { Stats } from '@combat/types';
import { equipFromStash, unequipToStash } from '@items/equip_camp';
import { equipFromPack, unequipToPack } from '@run/equip_run';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 920;
const PANEL_H = 460;

const TITLE_Y = 60;
const CLOSE_X = 918;
const CLOSE_Y = 63;

const LEFT_PANE_CX = 155;
const LEFT_PANE_W = 260;
const LEFT_PANE_H = 360;

const HERO_ROW_W = 240;
const HERO_ROW_H = 76;
const HERO_ROW_X = 155;
const HERO_LIST_Y_START = 110;
const HERO_LIST_VISIBLE_ROWS = 4;
const HERO_LIST_ARROW_X = 270;

const SELECTION_GOLD = 0xffcc66;

const RARITY_COLOR_NUM: Record<'common' | 'uncommon' | 'rare', number> = {
  common: 0xcccccc,
  uncommon: 0x4488ff,
  rare: 0xffcc66,
};

const RIGHT_PANE_CX = 640;
const RIGHT_PANE_W = 620;
const RIGHT_PANE_H = 360;

const PAPERDOLL_X = 380;
const PAPERDOLL_Y = 200;
const PAPERDOLL_SCALE = 3;

const HEADER_X = 460;
const HEADER_NAME_Y = 130;
const HEADER_STATS_Y = 152;
const HEADER_KIT_Y = 174;

const SLOTS: readonly ItemSlot[] = ['weapon', 'shield', 'outfit', 'hat'];
const SLOT_SQUARE_SIZE = 56;
const SLOT_STRIP_Y = 240;
const SLOT_STRIP_X = [460, 540, 620, 700] as const;

const CARD_CX = 640;  // matches RIGHT_PANE_CX
const CARD_Y = 305;
const CARD_W = 520;
const CARD_H = 60;

const RARITY_COLOR_HEX: Record<'common' | 'uncommon' | 'rare', string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
};

const PICKER_X = 640;  // matches RIGHT_PANE_CX
const PICKER_W = 540;
const PICKER_Y_START = 345;
const PICKER_ROW_H = 22;
const PICKER_VISIBLE_ROWS = 4;
const PICKER_ARROW_X = 905;

const SLOT_TAG: Record<ItemSlot, string> = {
  weapon: '[w]',
  shield: '[s]',
  outfit: '[o]',
  hat:    '[h]',
};

const RARITY_ORDER: Record<'common' | 'uncommon' | 'rare', number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
};

const SLOT_ORDER: Record<ItemSlot, number> = {
  weapon: 0,
  shield: 1,
  outfit: 2,
  hat: 3,
};

const COMMIT_BUTTON_X = 850;
const COMMIT_BUTTON_Y = 440;
const COMMIT_BUTTON_W = 200;
const COMMIT_BUTTON_H = 28;

const WEAPON_TYPE_DISPLAY: Record<string, string> = {
  sword: 'sword',
  bow: 'bow',
  holy_symbol: 'holy symbol',
  axe: 'axe',
  daggers: 'daggers',
  staff: 'staff',
};

type Selection =
  | { kind: 'none' }
  | { kind: 'pack-item'; itemId: string }
  | { kind: 'equipped-slot'; slot: ItemSlot };

export type EquipMode =
  | { kind: 'barracks'; heroId: string }
  | { kind: 'in_run'; returnTo: string };

export class EquipScene extends Phaser.Scene {
  private mode!: EquipMode;
  private contentContainer!: Phaser.GameObjects.Container;
  private selectedHeroId: string = '';
  private heroListPageStart: number = 0;
  private pickerPageStart: number = 0;
  private selection: Selection = { kind: 'none' };

  constructor() {
    super('equip');
  }

  init(data: EquipMode): void {
    this.mode = data;
  }

  create(): void {
    this.selectedHeroId = this.initialHeroId();
    this.heroListPageStart = 0;
    this.buildOverlayAndPanel();
    this.buildCloseButton();
    this.contentContainer = this.add.container(0, 0);
    this.repaint();
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private initialHeroId(): string {
    if (this.mode.kind === 'barracks') return this.mode.heroId;
    const run = appState.get().runState;
    return run?.party[0]?.id ?? '';
  }

  private getHeroList(): readonly Hero[] {
    if (this.mode.kind === 'barracks') return appState.get().roster.heroes;
    const run = appState.get().runState;
    if (!run) return [];
    return run.party;
  }

  private buildOverlayAndPanel(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666)
      .setInteractive();
    const titleText = this.mode.kind === 'barracks' ? 'Equip · Barracks' : 'Equip';
    this.add
      .text(PANEL_CX, TITLE_Y, titleText, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }

  private buildCloseButton(): void {
    const closeBg = this.add
      .rectangle(CLOSE_X, CLOSE_Y, 28, 28, 0x553333)
      .setStrokeStyle(1, 0x885555);
    this.add
      .text(CLOSE_X, CLOSE_Y, '×', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => this.close());
  }

  private buildLeftPane(): void {
    // Background frame.
    this.contentContainer.add(
      this.add
        .rectangle(LEFT_PANE_CX, PANEL_CY, LEFT_PANE_W, LEFT_PANE_H, 0x1a1a1a)
        .setStrokeStyle(1, 0x444444),
    );

    const list = this.getHeroList();
    const pageEnd = Math.min(list.length, this.heroListPageStart + HERO_LIST_VISIBLE_ROWS);
    for (let i = this.heroListPageStart; i < pageEnd; i++) {
      const y = HERO_LIST_Y_START + (i - this.heroListPageStart) * (HERO_ROW_H + 8);
      this.buildHeroRow(list[i], y);
    }

    if (list.length > HERO_LIST_VISIBLE_ROWS) {
      this.buildHeroListArrows(list.length);
    }
  }

  private buildHeroRow(hero: Hero, y: number): void {
    const isSelected = this.selectedHeroId === hero.id;
    const bg = this.add
      .rectangle(HERO_ROW_X, y + HERO_ROW_H / 2, HERO_ROW_W, HERO_ROW_H, 0x222222)
      .setStrokeStyle(2, isSelected ? SELECTION_GOLD : 0x444444);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.onHeroRowClick(hero.id));
    this.contentContainer.add(bg);

    const classDef = CLASSES[hero.classId];
    this.contentContainer.add(
      this.add.text(HERO_ROW_X - HERO_ROW_W / 2 + 12, y + 8, hero.name, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
      }),
    );
    this.contentContainer.add(
      this.add.text(
        HERO_ROW_X - HERO_ROW_W / 2 + 12,
        y + 26,
        `${classDef.name} · Lv ${hero.level} · HP ${hero.currentHp}/${hero.maxHp}`,
        { fontFamily: 'monospace', fontSize: '11px', color: '#aaaaaa' },
      ),
    );

    // Mini equip strip — 4 small squares.
    const stripY = y + HERO_ROW_H - 20;
    const stripStartX = HERO_ROW_X - HERO_ROW_W / 2 + 16;
    const slots: readonly ItemSlot[] = ['weapon', 'shield', 'outfit', 'hat'];
    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s];
      const item = hero.equipment[slot];
      const sx = stripStartX + s * 28;
      this.contentContainer.add(
        this.add
          .rectangle(sx, stripY, 22, 22, 0x111111)
          .setStrokeStyle(1, item ? RARITY_COLOR_NUM[item.rarity] : 0x333333),
      );
    }
  }

  private buildHeroListArrows(totalRows: number): void {
    const canPageUp = this.heroListPageStart > 0;
    const canPageDown = this.heroListPageStart + HERO_LIST_VISIBLE_ROWS < totalRows;

    const upArrow = this.add
      .text(HERO_LIST_ARROW_X, HERO_LIST_Y_START - 4, '▲', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: canPageUp ? '#cccccc' : '#444444',
      })
      .setOrigin(0.5);
    if (canPageUp) {
      upArrow.setInteractive({ useHandCursor: true });
      upArrow.on('pointerdown', () => {
        this.heroListPageStart = Math.max(0, this.heroListPageStart - HERO_LIST_VISIBLE_ROWS);
        this.repaint();
      });
    }
    this.contentContainer.add(upArrow);

    const downArrow = this.add
      .text(
        HERO_LIST_ARROW_X,
        HERO_LIST_Y_START + HERO_LIST_VISIBLE_ROWS * (HERO_ROW_H + 8) - 4,
        '▼',
        {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: canPageDown ? '#cccccc' : '#444444',
        },
      )
      .setOrigin(0.5);
    if (canPageDown) {
      downArrow.setInteractive({ useHandCursor: true });
      downArrow.on('pointerdown', () => {
        this.heroListPageStart += HERO_LIST_VISIBLE_ROWS;
        this.repaint();
      });
    }
    this.contentContainer.add(downArrow);
  }

  private onHeroRowClick(heroId: string): void {
    if (this.selectedHeroId === heroId) return;
    this.selectedHeroId = heroId;
    this.selection = { kind: 'none' };
    this.pickerPageStart = 0;
    this.repaint();
  }

  private resolveSelectedHero(): Hero | undefined {
    return this.getHeroList().find((h) => h.id === this.selectedHeroId);
  }

  private buildRightPane(): void {
    this.contentContainer.add(
      this.add
        .rectangle(RIGHT_PANE_CX, PANEL_CY, RIGHT_PANE_W, RIGHT_PANE_H, 0x1a1a1a)
        .setStrokeStyle(1, 0x444444),
    );

    const hero = this.resolveSelectedHero();
    if (!hero) {
      this.contentContainer.add(
        this.add
          .text(RIGHT_PANE_CX, PANEL_CY, 'No hero selected.', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#888888',
          })
          .setOrigin(0.5),
      );
      return;
    }

    this.buildPaperdoll(hero);
    this.buildHeader(hero);
    this.buildSlotStrip(hero);
    this.buildSlotDetailCard(hero);
    this.buildPicker(hero);
    this.buildCommitButton(hero);
  }

  private buildPaperdoll(hero: Hero): void {
    const doll = new Paperdoll(this, PAPERDOLL_X, PAPERDOLL_Y, heroToLoadout(hero));
    doll.setScale(PAPERDOLL_SCALE);
    this.contentContainer.add(doll);
  }

  private buildHeader(hero: Hero): void {
    const classDef = CLASSES[hero.classId];

    // Line 1: Name · Class · Lv N
    this.contentContainer.add(
      this.add.text(HEADER_X, HEADER_NAME_Y, `${hero.name} · ${classDef.name} · Lv ${hero.level}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      }),
    );

    // Line 2: Total stats — colored on preview.
    const preview = this.computePreviewStats(hero);
    if (preview) {
      this.buildStatsLineColored(preview);
    } else {
      const stats = applyEquipmentStats(hero.baseStats, hero.equipment);
      this.contentContainer.add(
        this.add.text(HEADER_X, HEADER_STATS_Y, this.formatStatsLine(stats), {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#dddddd',
        }),
      );
    }

    // Line 3: Kit — colored if preview, gray if at-rest.
    this.buildKitLineColored(hero);
  }

  private buildStatsLineColored(preview: StatPreview): void {
    const keys: readonly (keyof Stats)[] = ['hp', 'attack', 'defense', 'speed', 'mind', 'crit', 'dodge'];
    const labels: Record<keyof Stats, string> = {
      hp: 'HP', attack: 'ATK', defense: 'DEF', speed: 'SPD', mind: 'MND',
      crit: 'CRT', dodge: 'DDG',
    };
    const suffix: Partial<Record<keyof Stats, string>> = { crit: '%', dodge: '%' };
    let xCursor = HEADER_X;
    for (const k of keys) {
      const delta = preview.deltas[k];
      let color = '#dddddd';
      if (delta !== undefined && delta > 0) color = '#44cc44';
      else if (delta !== undefined && delta < 0) color = '#cc4444';
      const tok = this.add.text(
        xCursor,
        HEADER_STATS_Y,
        `${labels[k]} ${preview.previewStats[k]}${suffix[k] ?? ''}`,
        { fontFamily: 'monospace', fontSize: '12px', color },
      );
      this.contentContainer.add(tok);
      xCursor += tok.width + 12;
    }
  }

  private computePreviewStats(hero: Hero): StatPreview | null {
    const sel = this.selection;
    if (sel.kind === 'pack-item') {
      const item = this.findSourceItem(sel.itemId);
      if (item) return previewStats(hero, item, item.slot);
    }
    if (sel.kind === 'equipped-slot') {
      return this.previewUnequipStats(hero, sel.slot);
    }
    return null;
  }

  private previewUnequipStats(hero: Hero, slot: ItemSlot): StatPreview {
    const item = hero.equipment[slot];
    const currentStats = applyEquipmentStats(hero.baseStats, hero.equipment);
    if (!item) {
      return { currentStats, previewStats: currentStats, deltas: {} };
    }
    // Build a hero shape with the slot removed (weapon slot guarded earlier).
    const equipmentWithoutSlot: typeof hero.equipment = { ...hero.equipment };
    if (slot !== 'weapon') {
      delete (equipmentWithoutSlot as unknown as Record<string, unknown>)[slot];
    }
    const previewed = applyEquipmentStats(hero.baseStats, equipmentWithoutSlot);
    const deltas: Partial<Stats> = {};
    for (const k of Object.keys(currentStats) as (keyof Stats)[]) {
      if (currentStats[k] !== previewed[k]) {
        deltas[k] = previewed[k] - currentStats[k];
      }
    }
    return { currentStats, previewStats: previewed, deltas };
  }

  private buildSlotStrip(hero: Hero): void {
    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const item = hero.equipment[slot];
      this.buildSlotSquare(slot, item, SLOT_STRIP_X[i]);
    }
  }

  private buildSlotDetailCard(hero: Hero): void {
    this.contentContainer.add(
      this.add
        .rectangle(CARD_CX, CARD_Y, CARD_W, CARD_H, 0x111111)
        .setStrokeStyle(1, 0x333333),
    );

    const sel = this.selection;

    if (sel.kind === 'pack-item') {
      const newItem = this.findSourceItem(sel.itemId);
      if (newItem) {
        const beforeItem = hero.equipment[newItem.slot];
        this.renderBeforeAfterInCard(beforeItem, newItem);
        return;
      }
      // Fallback if item is gone (e.g., already equipped); fall through to at-rest.
    }

    if (sel.kind === 'equipped-slot') {
      const beforeItem = hero.equipment[sel.slot];
      // After = (empty) for unequip preview.
      this.renderBeforeAfterInCard(beforeItem, undefined);
      return;
    }

    // At-rest: show weapon slot.
    this.renderItemSummaryInCard(hero.equipment.weapon, CARD_CX, CARD_Y);
  }

  private findSourceItem(itemId: string): Item | undefined {
    return this.getSourceItems().find((i) => i.id === itemId);
  }

  private renderBeforeAfterInCard(before: Item | undefined, after: Item | undefined): void {
    // Two halves of the card.
    const leftCx = CARD_CX - CARD_W / 4;
    const rightCx = CARD_CX + CARD_W / 4;

    // Center arrow.
    this.contentContainer.add(
      this.add
        .text(CARD_CX, CARD_Y, '→', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#888888',
        })
        .setOrigin(0.5),
    );

    this.renderItemSummaryInCard(before, leftCx, CARD_Y);
    this.renderItemSummaryInCard(after, rightCx, CARD_Y);
  }

  private renderItemSummaryInCard(item: Item | undefined, cx: number, cy: number): void {
    if (item === undefined) {
      this.contentContainer.add(
        this.add
          .text(cx, cy, '(empty)', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#888888',
            fontStyle: 'italic',
          })
          .setOrigin(0.5),
      );
      return;
    }

    // Title line: "Sword · uncommon · sword" (weapon type appended for weapons).
    let title = `${itemDisplayName(item)} · ${item.rarity}`;
    if (item.slot === 'weapon' && item.weaponType) {
      title = `${title} · ${WEAPON_TYPE_DISPLAY[item.weaponType] ?? item.weaponType}`;
    }
    this.contentContainer.add(
      this.add
        .text(cx, cy - 14, title, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: RARITY_COLOR_HEX[item.rarity],
        })
        .setOrigin(0.5),
    );

    // Affix line. itemAffixDescription returns "+3 atk · +2 def" or "" if none.
    const affixLine = itemAffixDescription(item);
    if (affixLine.length > 0) {
      this.contentContainer.add(
        this.add
          .text(cx, cy + 4, affixLine, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#aaaaaa',
          })
          .setOrigin(0.5),
      );
    }
  }

  private buildSlotSquare(slot: ItemSlot, item: Item | undefined, x: number): void {
    const isSelected =
      this.selection.kind === 'equipped-slot' && this.selection.slot === slot;
    const isWeapon = slot === 'weapon';
    const isEmpty = item === undefined;
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

    // Weapon slot is non-clickable (cannot unequip). Empty non-weapon slots are
    // also non-clickable (nothing to unequip-preview).
    if (!isWeapon && !isEmpty) {
      square.setInteractive({ useHandCursor: true });
      square.on('pointerdown', () => this.onSlotClick(slot));
    }
    this.contentContainer.add(square);
  }

  private getSourceItems(): readonly Item[] {
    if (this.mode.kind === 'barracks') return appState.get().stash.items;
    const run = appState.get().runState;
    if (!run) return [];
    return run.pack.items;
  }

  private sortedSourceItems(): readonly Item[] {
    return [...this.getSourceItems()].sort((a, b) => {
      const slotDelta = SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot];
      if (slotDelta !== 0) return slotDelta;
      const rarityDelta = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
      if (rarityDelta !== 0) return rarityDelta;
      const floorDelta = a.floorRolledAt - b.floorRolledAt;
      if (floorDelta !== 0) return floorDelta;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  private buildPicker(hero: Hero): void {
    const items = this.sortedSourceItems();
    const sourceLabel = this.mode.kind === 'barracks' ? 'Stash' : 'Pack';
    this.contentContainer.add(
      this.add.text(PICKER_X - PICKER_W / 2, PICKER_Y_START - 16, `${sourceLabel} (${items.length})`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#cccccc',
      }),
    );

    if (items.length === 0) {
      this.contentContainer.add(
        this.add
          .text(PICKER_X, PICKER_Y_START + 20, `${sourceLabel} is empty.`, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#888888',
          })
          .setOrigin(0.5),
      );
      return;
    }

    const pageEnd = Math.min(items.length, this.pickerPageStart + PICKER_VISIBLE_ROWS);
    for (let i = this.pickerPageStart; i < pageEnd; i++) {
      const y = PICKER_Y_START + (i - this.pickerPageStart) * PICKER_ROW_H;
      this.buildPickerRow(items[i], y, hero);
    }

    if (items.length > PICKER_VISIBLE_ROWS) {
      this.buildPickerArrows(items.length);
    }
  }

  private buildPickerRow(item: Item, y: number, hero: Hero): void {
    const isSelected =
      this.selection.kind === 'pack-item' && this.selection.itemId === item.id;

    const bg = this.add
      .rectangle(PICKER_X, y + PICKER_ROW_H / 2, PICKER_W, PICKER_ROW_H - 2,
        isSelected ? 0x2a2418 : 0x111111)
      .setStrokeStyle(1, isSelected ? SELECTION_GOLD : 0x222222);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.onPickerRowClick(item));
    this.contentContainer.add(bg);

    const isEquipped = hero.equipment[item.slot]?.id === item.id;
    const equippedSuffix = isEquipped ? ' [Equipped]' : '';
    const name = `${SLOT_TAG[item.slot]} ${itemDisplayName(item)} [${item.rarity}]${equippedSuffix}`;
    this.contentContainer.add(
      this.add.text(PICKER_X - PICKER_W / 2 + 8, y + 3, name, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: RARITY_COLOR_HEX[item.rarity],
      }),
    );

    const affixLine = itemAffixDescription(item);
    if (affixLine.length > 0) {
      this.contentContainer.add(
        this.add.text(PICKER_X + PICKER_W / 2 - 8, y + 3, affixLine, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#999999',
        }).setOrigin(1, 0),
      );
    }
  }

  private buildPickerArrows(totalRows: number): void {
    const canPageUp = this.pickerPageStart > 0;
    const canPageDown = this.pickerPageStart + PICKER_VISIBLE_ROWS < totalRows;

    const upArrow = this.add
      .text(PICKER_ARROW_X, PICKER_Y_START + 4, '▲', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: canPageUp ? '#cccccc' : '#444444',
      })
      .setOrigin(0.5);
    if (canPageUp) {
      upArrow.setInteractive({ useHandCursor: true });
      upArrow.on('pointerdown', () => {
        this.pickerPageStart = Math.max(0, this.pickerPageStart - PICKER_VISIBLE_ROWS);
        this.repaint();
      });
    }
    this.contentContainer.add(upArrow);

    const downArrow = this.add
      .text(
        PICKER_ARROW_X,
        PICKER_Y_START + PICKER_VISIBLE_ROWS * PICKER_ROW_H - 4,
        '▼',
        {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: canPageDown ? '#cccccc' : '#444444',
        },
      )
      .setOrigin(0.5);
    if (canPageDown) {
      downArrow.setInteractive({ useHandCursor: true });
      downArrow.on('pointerdown', () => {
        this.pickerPageStart += PICKER_VISIBLE_ROWS;
        this.repaint();
      });
    }
    this.contentContainer.add(downArrow);
  }

  private onPickerRowClick(item: Item): void {
    if (this.selection.kind === 'pack-item' && this.selection.itemId === item.id) {
      this.commit();
      return;
    }
    this.selection = { kind: 'pack-item', itemId: item.id };
    this.repaint();
  }

  private onSlotClick(slot: ItemSlot): void {
    if (this.selection.kind === 'equipped-slot' && this.selection.slot === slot) {
      this.commit();
      return;
    }
    this.selection = { kind: 'equipped-slot', slot };
    this.repaint();
  }

  private buildCommitButton(hero: Hero): void {
    const sel = this.selection;
    let label = 'Equip';
    let enabled = false;

    if (sel.kind === 'pack-item') {
      const item = this.findSourceItem(sel.itemId);
      if (item) {
        label = `Equip ${itemDisplayName(item)}`;
        enabled = true;
      }
    } else if (sel.kind === 'equipped-slot') {
      const item = hero.equipment[sel.slot];
      if (item) {
        label = `Unequip ${itemDisplayName(item)}`;
        enabled = true;
      }
    }

    const bg = this.add
      .rectangle(COMMIT_BUTTON_X, COMMIT_BUTTON_Y, COMMIT_BUTTON_W, COMMIT_BUTTON_H,
        enabled ? 0x3a2a1a : 0x222222)
      .setStrokeStyle(2, enabled ? 0xcc8844 : 0x444444);
    this.contentContainer.add(bg);
    this.contentContainer.add(
      this.add.text(COMMIT_BUTTON_X, COMMIT_BUTTON_Y, label, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: enabled ? '#ffffff' : '#666666',
      }).setOrigin(0.5),
    );
    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.commit());
    }
  }

  private commit(): void {
    const sel = this.selection;
    const hero = this.resolveSelectedHero();
    if (!hero) return;

    if (sel.kind === 'pack-item') {
      const item = this.findSourceItem(sel.itemId);
      if (!item) return;
      this.commitEquip(item.id, item.slot);
    } else if (sel.kind === 'equipped-slot') {
      this.commitUnequip(sel.slot);
    }

    this.selection = { kind: 'none' };
    this.repaint();
  }

  private commitEquip(itemId: string, slot: ItemSlot): void {
    if (this.mode.kind === 'barracks') {
      const state = appState.get();
      const result = equipFromStash(state.roster, state.stash, this.selectedHeroId, itemId, slot);
      appState.update((s) => ({ ...s, roster: result.roster, stash: result.stash }));
    } else {
      const run = appState.get().runState;
      if (!run) return;
      const heroIndex = run.party.findIndex((h) => h.id === this.selectedHeroId);
      if (heroIndex < 0) return;
      appState.update((s) => ({
        ...s,
        runState: equipFromPack(s.runState!, heroIndex, itemId, slot),
      }));
    }
  }

  private commitUnequip(slot: ItemSlot): void {
    if (this.mode.kind === 'barracks') {
      const state = appState.get();
      const result = unequipToStash(state.roster, state.stash, this.selectedHeroId, slot);
      appState.update((s) => ({ ...s, roster: result.roster, stash: result.stash }));
    } else {
      const run = appState.get().runState;
      if (!run) return;
      const heroIndex = run.party.findIndex((h) => h.id === this.selectedHeroId);
      if (heroIndex < 0) return;
      appState.update((s) => ({
        ...s,
        runState: unequipToPack(s.runState!, heroIndex, slot),
      }));
    }
  }

  private formatStatsLine(stats: Stats): string {
    return `HP ${stats.hp}  ATK ${stats.attack}  DEF ${stats.defense}  SPD ${stats.speed}  MND ${stats.mind}  CRT ${stats.crit}%  DDG ${stats.dodge}%`;
  }

  private buildKitLineText(hero: Hero): string {
    const status = describeKitStatus(hero);
    const abilityIds: readonly AbilityId[] = resolveCombatAbilities(hero).abilities;
    const abilityNames = abilityIds.map((id) => ABILITIES[id].name).join(' · ');
    return `${status} · ${abilityNames}`;
  }

  private buildPreviewedHero(hero: Hero): Hero | null {
    const sel = this.selection;
    if (sel.kind === 'pack-item') {
      const item = this.findSourceItem(sel.itemId);
      if (!item) return null;
      return {
        ...hero,
        equipment: { ...hero.equipment, [item.slot]: item } as Hero['equipment'],
      };
    }
    if (sel.kind === 'equipped-slot') {
      if (sel.slot === 'weapon') return null;  // weapon non-unequippable
      const equipmentWithoutSlot: Hero['equipment'] = { ...hero.equipment };
      delete (equipmentWithoutSlot as unknown as Record<string, unknown>)[sel.slot];
      return { ...hero, equipment: equipmentWithoutSlot };
    }
    return null;
  }

  private buildKitLineColored(beforeHero: Hero): void {
    const afterHero = this.buildPreviewedHero(beforeHero);
    if (!afterHero) {
      // No preview — render the at-rest kit line.
      this.contentContainer.add(
        this.add.text(HEADER_X, HEADER_KIT_Y, this.buildKitLineText(beforeHero), {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#aaaaaa',
          wordWrap: { width: RIGHT_PANE_W - 80 },
        }),
      );
      return;
    }

    const diff = resolveAbilityDiff(beforeHero, afterHero);
    const afterStatus = describeKitStatus(afterHero);
    const afterAbilities = resolveCombatAbilities(afterHero).abilities;
    const removedSet = new Set(diff.removed);

    // Color for the band-label segment.
    let bandColor = '#aaaaaa';
    if (diff.bandChange === 'upgrade') bandColor = '#44cc44';
    else if (diff.bandChange === 'downgrade') bandColor = '#cc4444';

    // Render: status (band-colored), then each ability token (added/same/removed).
    let xCursor = HEADER_X;
    const statusText = this.add.text(xCursor, HEADER_KIT_Y, `${afterStatus} · `, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: bandColor,
    });
    this.contentContainer.add(statusText);
    xCursor += statusText.width;

    // Tokens: walk afterAbilities for green/gray, then append removed ones in red.
    const beforeAbilitiesSet = new Set(resolveCombatAbilities(beforeHero).abilities);
    for (let i = 0; i < afterAbilities.length; i++) {
      const id = afterAbilities[i];
      const isAdded = !beforeAbilitiesSet.has(id);
      const color = isAdded ? '#44cc44' : '#aaaaaa';
      const tokenText = `${ABILITIES[id].name}${i === afterAbilities.length - 1 && removedSet.size === 0 ? '' : ' · '}`;
      const tok = this.add.text(xCursor, HEADER_KIT_Y, tokenText, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color,
      });
      this.contentContainer.add(tok);
      xCursor += tok.width;
    }
    // Removed abilities — appended at the end, red.
    let removedIdx = 0;
    for (const id of diff.removed) {
      const isLast = removedIdx === diff.removed.length - 1;
      const text = `${ABILITIES[id].name}${isLast ? '' : ' · '}`;
      const tok = this.add.text(xCursor, HEADER_KIT_Y, text, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#cc4444',
      });
      this.contentContainer.add(tok);
      xCursor += tok.width;
      removedIdx++;
    }
  }

  private repaint(): void {
    this.contentContainer.removeAll(true);
    this.buildLeftPane();
    this.buildRightPane();
    // Slot strip / detail card / picker added in subsequent tasks.
  }

  private close(): void {
    this.scene.stop();
    if (this.mode.kind === 'barracks') {
      this.scene.resume('barracks_panel');
    } else {
      this.scene.resume(this.mode.returnTo);
    }
  }
}
