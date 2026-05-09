import * as Phaser from 'phaser';
import { CLASSES } from '@data/classes';
import type { AbilityId, Item, ItemSlot } from '@data/types';
import { BASE_ITEMS } from '@data/items';
import { ABILITIES } from '@data/abilities';
import type { Hero } from '@heroes/hero';
import { applyEquipmentStats } from '@items/stats';
import { describeKitStatus, resolveCombatAbilities, resolveAbilityDiff } from '@items/kit';
import { itemAffixDescription, itemDisplayName, previewStats, type StatPreview } from '@items/selectors';
import type { Stats } from '@combat/types';
import { equipFromStash, unequipToStash } from '@items/equip_camp';
import { equipFromPack, unequipToPack } from '@run/equip_run';
import { heroToLoadout } from '@render/hero_loadout';
import { SHEET } from '@render/frames';
import {
  Button,
  assertWidgetAssetsLoaded,
  createBitmapText,
  createPanel,
  createPaperdoll,
} from '@ui/widgets';
import { appState } from './app_state';

type Selection =
  | { kind: 'none' }
  | { kind: 'pack-item'; itemId: string }
  | { kind: 'equipped-slot'; slot: ItemSlot };

export type EquipMode =
  | { kind: 'barracks'; heroId: string }
  | { kind: 'in_run'; returnTo: string };

let _selection: Selection = { kind: 'none' };
let _selectedHeroId: string = '';
let _heroListPageStart = 0;
let _pickerPageStart = 0;
let _mode: EquipMode | undefined = undefined;

const PANEL_X = 20;
const PANEL_Y = 40;
const PANEL_W = 920;
const PANEL_H = 460;

const LEFT_PANE_X = PANEL_X + 10;
const LEFT_PANE_Y = PANEL_Y + 70;
const LEFT_PANE_W = 260;
const LEFT_PANE_H = 360;

const HERO_ROW_W = 240;
const HERO_ROW_H = 76;
const HERO_ROW_PANE_X = 10;
const HERO_LIST_PANE_Y_START = 10;
const HERO_LIST_VISIBLE_ROWS = 4;

const SELECTION_GOLD = 0xffcc66;

const RARITY_COLOR_NUM: Record<'common' | 'uncommon' | 'rare', number> = {
  common: 0xcccccc,
  uncommon: 0x4488ff,
  rare: 0xffcc66,
};

const RARITY_COLOR_HEX: Record<'common' | 'uncommon' | 'rare', string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
};

const RIGHT_PANE_X = LEFT_PANE_X + LEFT_PANE_W + 10;
const RIGHT_PANE_Y = PANEL_Y + 70;
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

const CARD_CX = 640;
const CARD_Y = 305;
const CARD_W = 520;
const CARD_H = 60;

const PICKER_W = 540;
const PICKER_ROW_H = 22;
const PICKER_VISIBLE_ROWS = 4;

const PICKER_X = 640;
const PICKER_Y_START = 345;

const SLOT_TAG: Record<ItemSlot, string> = {
  weapon: '[w]',
  shield: '[s]',
  outfit: '[o]',
  hat: '[h]',
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

const COMMIT_BUTTON_W = 200;
const COMMIT_BUTTON_H = 32;

const WEAPON_TYPE_DISPLAY: Record<string, string> = {
  sword: 'sword',
  bow: 'bow',
  holy_symbol: 'holy symbol',
  axe: 'axe',
  daggers: 'daggers',
  staff: 'staff',
};

export class EquipScene extends Phaser.Scene {
  // Two Phaser Containers, each holding all game objects belonging to that
  // pane. Partial rebuilds destroy the container (cascades to children) +
  // recreate. Hero row strokes for the left pane are tracked separately
  // for in-place selection updates.
  private _leftContainer: Phaser.GameObjects.Container | undefined;
  private _rightContainer: Phaser.GameObjects.Container | undefined;
  private _heroRowStrokes: { rect: Phaser.GameObjects.Rectangle; id: string }[] = [];

  constructor() {
    super('equip');
  }

  init(data: EquipMode): void {
    const modeKey = JSON.stringify(data);
    const prevKey = _mode ? JSON.stringify(_mode) : '';
    if (modeKey !== prevKey) {
      _mode = data;
      _selection = { kind: 'none' };
      _heroListPageStart = 0;
      _pickerPageStart = 0;
      _selectedHeroId = this.initialHeroIdFor(data);
    }
  }

  create(): void {
    assertWidgetAssetsLoaded(this);
    this._leftContainer = undefined;
    this._rightContainer = undefined;
    this._heroRowStrokes = [];

    const mode = _mode!;

    // Dim overlay.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    // Outer panel chrome.
    createPanel({ scene: this, x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H });

    // Title (top strip).
    const titleText = mode.kind === 'barracks' ? 'Equip · Barracks' : 'Equip';
    createBitmapText({
      scene: this,
      x: 480,
      y: 12,
      text: titleText,
      font: 'medium',
      size: 16,
      originX: 0.5,
    });

    // Close button (top strip, right).
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

    // Left pane backdrop (raw rect, fixed).
    this.add
      .rectangle(
        LEFT_PANE_X + LEFT_PANE_W / 2,
        LEFT_PANE_Y + LEFT_PANE_H / 2,
        LEFT_PANE_W,
        LEFT_PANE_H,
        0x1a1a1a,
      )
      .setStrokeStyle(1, 0x444444);
    this.buildLeftPane();

    // Right pane backdrop (raw rect, fixed).
    this.add
      .rectangle(
        RIGHT_PANE_X + RIGHT_PANE_W / 2,
        RIGHT_PANE_Y + RIGHT_PANE_H / 2,
        RIGHT_PANE_W,
        RIGHT_PANE_H,
        0x1a1a1a,
      )
      .setStrokeStyle(1, 0x444444);
    this.buildRightPane();

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private initialHeroIdFor(mode: EquipMode): string {
    if (mode.kind === 'barracks') return mode.heroId;
    const run = appState.get().runState;
    return run?.party[0]?.id ?? '';
  }

  private getHeroList(): readonly Hero[] {
    if (!_mode) return [];
    if (_mode.kind === 'barracks') return appState.get().roster.heroes;
    const run = appState.get().runState;
    if (!run) return [];
    return run.party;
  }

  private resolveSelectedHero(): Hero | undefined {
    return this.getHeroList().find((h) => h.id === _selectedHeroId);
  }

  // -------------------------------------------------------------------------
  // Partial updates (Phaser Container teardown — no scene.restart flicker)
  // -------------------------------------------------------------------------

  private selectHero(id: string): void {
    if (_selectedHeroId === id) return;
    _selectedHeroId = id;
    _selection = { kind: 'none' };
    _pickerPageStart = 0;

    for (const row of this._heroRowStrokes) {
      row.rect.setStrokeStyle(2, row.id === id ? SELECTION_GOLD : 0x444444);
    }

    this.rebuildRight();
  }

  private rebuildLeft(): void {
    if (this._leftContainer) {
      this._leftContainer.destroy(true);
      this._leftContainer = undefined;
    }
    this._heroRowStrokes = [];
    this.buildLeftPane();
  }

  private rebuildRight(): void {
    if (this._rightContainer) {
      this._rightContainer.destroy(true);
      this._rightContainer = undefined;
    }
    this.buildRightPane();
  }

  // -------------------------------------------------------------------------
  // Left pane — hero list with mini-equip-strip
  // -------------------------------------------------------------------------

  private buildLeftPane(): void {
    const container = this.add.container(0, 0);
    this._leftContainer = container;

    const list = this.getHeroList();
    const pageEnd = Math.min(list.length, _heroListPageStart + HERO_LIST_VISIBLE_ROWS);
    for (let i = _heroListPageStart; i < pageEnd; i++) {
      const rowPaneY = HERO_LIST_PANE_Y_START + (i - _heroListPageStart) * (HERO_ROW_H + 8);
      this.buildHeroRow(container, list[i], rowPaneY);
    }

    if (list.length > HERO_LIST_VISIBLE_ROWS) {
      this.buildHeroListArrows(container, list.length);
    }
  }

  private buildHeroRow(
    container: Phaser.GameObjects.Container,
    hero: Hero,
    rowPaneY: number,
  ): void {
    const isSelected = _selectedHeroId === hero.id;
    const absX = LEFT_PANE_X + HERO_ROW_PANE_X + HERO_ROW_W / 2;
    const absY = LEFT_PANE_Y + rowPaneY + HERO_ROW_H / 2;

    const rowRect = this.add
      .rectangle(absX, absY, HERO_ROW_W, HERO_ROW_H, 0x222222)
      .setStrokeStyle(2, isSelected ? SELECTION_GOLD : 0x444444);
    rowRect.setInteractive({ useHandCursor: true });
    rowRect.on('pointerdown', () => this.selectHero(hero.id));
    container.add(rowRect);
    this._heroRowStrokes.push({ rect: rowRect, id: hero.id });

    const classDef = CLASSES[hero.classId];
    const textX = LEFT_PANE_X + HERO_ROW_PANE_X + 12;
    container.add(
      this.add.text(textX, LEFT_PANE_Y + rowPaneY + 8, hero.name, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
      }),
    );
    container.add(
      this.add.text(
        textX,
        LEFT_PANE_Y + rowPaneY + 26,
        `${classDef.name} · Lv ${hero.level} · HP ${hero.currentHp}/${hero.maxHp}`,
        { fontFamily: 'monospace', fontSize: '11px', color: '#aaaaaa' },
      ),
    );

    // Mini equip strip — 4 small rarity-bordered squares with item icons.
    const stripY = LEFT_PANE_Y + rowPaneY + HERO_ROW_H - 20;
    const stripStartX = LEFT_PANE_X + HERO_ROW_PANE_X + 16;
    for (let s = 0; s < SLOTS.length; s++) {
      const slot = SLOTS[s];
      const item = hero.equipment[slot];
      const sx = stripStartX + s * 28;
      container.add(
        this.add
          .rectangle(sx, stripY, 22, 22, 0x111111)
          .setStrokeStyle(1, item ? RARITY_COLOR_NUM[item.rarity] : 0x333333),
      );
      if (item) {
        container.add(
          this.add.sprite(sx, stripY, SHEET.key, parseInt(BASE_ITEMS[item.baseId].spriteId, 10)),
        );
      }
    }
  }

  private buildHeroListArrows(
    container: Phaser.GameObjects.Container,
    totalRows: number,
  ): void {
    const canPageUp = _heroListPageStart > 0;
    const canPageDown = _heroListPageStart + HERO_LIST_VISIBLE_ROWS < totalRows;
    const arrowX = LEFT_PANE_X + LEFT_PANE_W - 28;

    const upBtn = new Button({
      scene: this,
      x: arrowX,
      y: LEFT_PANE_Y + 8,
      width: 24,
      height: 24,
      enabled: canPageUp,
      text: 'Up',
      font: 'small',
      fontSize: 16,
      onClick: () => {
        _heroListPageStart = Math.max(0, _heroListPageStart - HERO_LIST_VISIBLE_ROWS);
        this.rebuildLeft();
      },
    });
    container.add(upBtn.gameObjects);

    const downBtn = new Button({
      scene: this,
      x: arrowX,
      y: LEFT_PANE_Y + LEFT_PANE_H - 32,
      width: 24,
      height: 24,
      enabled: canPageDown,
      text: 'Dn',
      font: 'small',
      fontSize: 16,
      onClick: () => {
        _heroListPageStart += HERO_LIST_VISIBLE_ROWS;
        this.rebuildLeft();
      },
    });
    container.add(downBtn.gameObjects);
  }

  // -------------------------------------------------------------------------
  // Right pane — paperdoll + header + slot strip + detail card + picker
  // -------------------------------------------------------------------------

  private buildRightPane(): void {
    const container = this.add.container(0, 0);
    this._rightContainer = container;

    const hero = this.resolveSelectedHero();
    if (!hero) {
      container.add(
        this.add
          .text(
            RIGHT_PANE_X + RIGHT_PANE_W / 2,
            RIGHT_PANE_Y + RIGHT_PANE_H / 2,
            'No hero selected.',
            { fontFamily: 'monospace', fontSize: '12px', color: '#888888' },
          )
          .setOrigin(0.5),
      );
      return;
    }

    this.buildPaperdoll(container, hero);
    this.buildHeader(container, hero);
    this.buildSlotStrip(container, hero);
    this.buildSlotDetailCard(container, hero);
    this.buildPicker(container, hero);
    this.buildCommitButton(container, hero);
  }

  private buildPaperdoll(container: Phaser.GameObjects.Container, hero: Hero): void {
    container.add(
      createPaperdoll({
        scene: this,
        x: PAPERDOLL_X,
        y: PAPERDOLL_Y,
        loadout: heroToLoadout(hero),
        scale: PAPERDOLL_SCALE,
      }),
    );
  }

  private buildHeader(container: Phaser.GameObjects.Container, hero: Hero): void {
    const classDef = CLASSES[hero.classId];

    container.add(
      this.add.text(
        HEADER_X,
        HEADER_NAME_Y,
        `${hero.name} · ${classDef.name} · Lv ${hero.level}`,
        { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' },
      ),
    );

    const preview = this.computePreviewStats(hero);
    if (preview) {
      this.buildStatsLineColored(container, preview);
    } else {
      const stats = applyEquipmentStats(hero.baseStats, hero.equipment);
      container.add(
        this.add.text(HEADER_X, HEADER_STATS_Y, this.formatStatsLine(stats), {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#dddddd',
        }),
      );
    }

    this.buildKitLineColored(container, hero);
  }

  private buildStatsLineColored(
    container: Phaser.GameObjects.Container,
    preview: StatPreview,
  ): void {
    const keys: readonly (keyof Stats)[] = ['hp', 'attack', 'defense', 'speed', 'mind', 'crit', 'dodge'];
    const labels: Record<keyof Stats, string> = {
      hp: 'HP',
      attack: 'ATK',
      defense: 'DEF',
      speed: 'SPD',
      mind: 'MND',
      crit: 'CRT',
      dodge: 'DDG',
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
      container.add(tok);
      xCursor += tok.width + 12;
    }
  }

  private computePreviewStats(hero: Hero): StatPreview | null {
    const sel = _selection;
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

  private buildSlotStrip(container: Phaser.GameObjects.Container, hero: Hero): void {
    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const item = hero.equipment[slot];
      this.buildSlotSquare(container, slot, item, SLOT_STRIP_X[i]);
    }
  }

  private buildSlotSquare(
    container: Phaser.GameObjects.Container,
    slot: ItemSlot,
    item: Item | undefined,
    x: number,
  ): void {
    const isSelected = _selection.kind === 'equipped-slot' && _selection.slot === slot;
    const isWeapon = slot === 'weapon';
    const isEmpty = item === undefined;
    const borderColor = item ? RARITY_COLOR_NUM[item.rarity] : 0x444444;
    const square = this.add
      .rectangle(x, SLOT_STRIP_Y, SLOT_SQUARE_SIZE, SLOT_SQUARE_SIZE, 0x222222)
      .setStrokeStyle(isSelected ? 3 : 2, isSelected ? SELECTION_GOLD : borderColor);
    container.add(square);

    if (item) {
      container.add(
        this.add
          .sprite(x, SLOT_STRIP_Y, SHEET.key, parseInt(BASE_ITEMS[item.baseId].spriteId, 10))
          .setScale(2),
      );
    } else {
      container.add(
        this.add
          .text(x, SLOT_STRIP_Y, slot, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#666666',
          })
          .setOrigin(0.5),
      );
    }

    container.add(
      this.add
        .text(x, SLOT_STRIP_Y + SLOT_SQUARE_SIZE / 2 + 8, slot, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#888888',
        })
        .setOrigin(0.5),
    );

    if (!isWeapon && !isEmpty) {
      square.setInteractive({ useHandCursor: true });
      square.on('pointerdown', () => this.onSlotClick(slot));
    }
  }

  private onSlotClick(slot: ItemSlot): void {
    if (_selection.kind === 'equipped-slot' && _selection.slot === slot) {
      this.commit();
      return;
    }
    _selection = { kind: 'equipped-slot', slot };
    this.rebuildRight();
  }

  private buildSlotDetailCard(container: Phaser.GameObjects.Container, hero: Hero): void {
    container.add(
      this.add
        .rectangle(CARD_CX, CARD_Y, CARD_W, CARD_H, 0x111111)
        .setStrokeStyle(1, 0x333333),
    );

    const sel = _selection;

    if (sel.kind === 'pack-item') {
      const newItem = this.findSourceItem(sel.itemId);
      if (newItem) {
        const beforeItem = hero.equipment[newItem.slot];
        this.renderBeforeAfterInCard(container, beforeItem, newItem);
        return;
      }
    }

    if (sel.kind === 'equipped-slot') {
      const beforeItem = hero.equipment[sel.slot];
      this.renderBeforeAfterInCard(container, beforeItem, undefined);
      return;
    }

    this.renderItemSummaryInCard(container, hero.equipment.weapon, CARD_CX, CARD_Y);
  }

  private renderBeforeAfterInCard(
    container: Phaser.GameObjects.Container,
    before: Item | undefined,
    after: Item | undefined,
  ): void {
    const leftCx = CARD_CX - CARD_W / 4;
    const rightCx = CARD_CX + CARD_W / 4;

    container.add(
      this.add
        .text(CARD_CX, CARD_Y, '>', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#888888',
        })
        .setOrigin(0.5),
    );

    this.renderItemSummaryInCard(container, before, leftCx, CARD_Y);
    this.renderItemSummaryInCard(container, after, rightCx, CARD_Y);
  }

  private renderItemSummaryInCard(
    container: Phaser.GameObjects.Container,
    item: Item | undefined,
    cx: number,
    cy: number,
  ): void {
    if (item === undefined) {
      container.add(
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

    let title = `${itemDisplayName(item)} · ${item.rarity}`;
    if (item.slot === 'weapon' && item.weaponType) {
      title = `${title} · ${WEAPON_TYPE_DISPLAY[item.weaponType] ?? item.weaponType}`;
    }
    container.add(
      this.add
        .text(cx, cy - 14, title, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: RARITY_COLOR_HEX[item.rarity],
        })
        .setOrigin(0.5),
    );

    const affixLine = itemAffixDescription(item);
    if (affixLine.length > 0) {
      container.add(
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

  private getSourceItems(): readonly Item[] {
    if (!_mode) return [];
    if (_mode.kind === 'barracks') return appState.get().stash.items;
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

  private findSourceItem(itemId: string): Item | undefined {
    return this.getSourceItems().find((i) => i.id === itemId);
  }

  private buildPicker(container: Phaser.GameObjects.Container, hero: Hero): void {
    const items = this.sortedSourceItems();
    const sourceLabel = _mode?.kind === 'barracks' ? 'Stash' : 'Pack';
    container.add(
      this.add.text(
        PICKER_X - PICKER_W / 2,
        PICKER_Y_START - 16,
        `${sourceLabel} (${items.length})`,
        { fontFamily: 'monospace', fontSize: '12px', color: '#cccccc' },
      ),
    );

    if (items.length === 0) {
      container.add(
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

    const pageEnd = Math.min(items.length, _pickerPageStart + PICKER_VISIBLE_ROWS);
    for (let i = _pickerPageStart; i < pageEnd; i++) {
      const rowOffsetY = (i - _pickerPageStart) * PICKER_ROW_H;
      this.buildPickerRow(container, items[i], rowOffsetY, hero);
    }

    if (items.length > PICKER_VISIBLE_ROWS) {
      this.buildPickerArrows(container, items.length);
    }
  }

  private buildPickerRow(
    container: Phaser.GameObjects.Container,
    item: Item,
    rowOffsetY: number,
    hero: Hero,
  ): void {
    const isSelected = _selection.kind === 'pack-item' && _selection.itemId === item.id;

    const absX = PICKER_X;
    const absY = PICKER_Y_START + rowOffsetY + (PICKER_ROW_H - 2) / 2;
    const rowRect = this.add
      .rectangle(absX, absY, PICKER_W, PICKER_ROW_H - 2,
        isSelected ? 0x2a2418 : 0x111111)
      .setStrokeStyle(1, isSelected ? SELECTION_GOLD : 0x222222);
    rowRect.setInteractive({ useHandCursor: true });
    rowRect.on('pointerdown', () => this.onPickerRowClick(item));
    container.add(rowRect);

    const isEquipped = hero.equipment[item.slot]?.id === item.id;
    const equippedSuffix = isEquipped ? ' [Equipped]' : '';
    const name = `${SLOT_TAG[item.slot]} ${itemDisplayName(item)} [${item.rarity}]${equippedSuffix}`;
    container.add(
      this.add.text(
        PICKER_X - PICKER_W / 2 + 8,
        PICKER_Y_START + rowOffsetY + 3,
        name,
        { fontFamily: 'monospace', fontSize: '11px', color: RARITY_COLOR_HEX[item.rarity] },
      ),
    );

    const affixLine = itemAffixDescription(item);
    if (affixLine.length > 0) {
      container.add(
        this.add
          .text(
            PICKER_X + PICKER_W / 2 - 8,
            PICKER_Y_START + rowOffsetY + 3,
            affixLine,
            { fontFamily: 'monospace', fontSize: '10px', color: '#999999' },
          )
          .setOrigin(1, 0),
      );
    }
  }

  private buildPickerArrows(
    container: Phaser.GameObjects.Container,
    totalRows: number,
  ): void {
    const canPageUp = _pickerPageStart > 0;
    const canPageDown = _pickerPageStart + PICKER_VISIBLE_ROWS < totalRows;
    const arrowX = RIGHT_PANE_X + RIGHT_PANE_W - 30;

    const upBtn = new Button({
      scene: this,
      x: arrowX,
      y: PICKER_Y_START - 4,
      width: 24,
      height: 20,
      enabled: canPageUp,
      text: 'Up',
      font: 'small',
      fontSize: 16,
      onClick: () => {
        _pickerPageStart = Math.max(0, _pickerPageStart - PICKER_VISIBLE_ROWS);
        this.rebuildRight();
      },
    });
    container.add(upBtn.gameObjects);

    const downBtn = new Button({
      scene: this,
      x: arrowX,
      y: PICKER_Y_START + PICKER_VISIBLE_ROWS * PICKER_ROW_H - 20,
      width: 24,
      height: 20,
      enabled: canPageDown,
      text: 'Dn',
      font: 'small',
      fontSize: 16,
      onClick: () => {
        _pickerPageStart += PICKER_VISIBLE_ROWS;
        this.rebuildRight();
      },
    });
    container.add(downBtn.gameObjects);
  }

  private onPickerRowClick(item: Item): void {
    if (_selection.kind === 'pack-item' && _selection.itemId === item.id) {
      this.commit();
      return;
    }
    _selection = { kind: 'pack-item', itemId: item.id };
    this.rebuildRight();
  }

  private buildCommitButton(container: Phaser.GameObjects.Container, hero: Hero): void {
    const sel = _selection;
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

    // Position bottom-right of panel.
    const btnX = PANEL_X + PANEL_W - 20 - COMMIT_BUTTON_W;
    const btnY = PANEL_Y + PANEL_H - 20 - COMMIT_BUTTON_H;
    const btn = new Button({
      scene: this,
      x: btnX,
      y: btnY,
      width: COMMIT_BUTTON_W,
      height: COMMIT_BUTTON_H,
      enabled,
      text: label,
      font: 'medium',
      fontSize: 16,
      onClick: () => this.commit(),
    });
    container.add(btn.gameObjects);
  }

  private commit(): void {
    const sel = _selection;
    const hero = this.resolveSelectedHero();
    if (!hero) return;

    if (sel.kind === 'pack-item') {
      const item = this.findSourceItem(sel.itemId);
      if (!item) return;
      this.commitEquip(item.id, item.slot);
    } else if (sel.kind === 'equipped-slot') {
      this.commitUnequip(sel.slot);
    }

    _selection = { kind: 'none' };

    const newItems = this.getSourceItems();
    if (_pickerPageStart > 0 && _pickerPageStart >= newItems.length) {
      _pickerPageStart = Math.max(0, newItems.length - PICKER_VISIBLE_ROWS);
    }

    // Equipment changed — left mini-strips and the entire right pane refresh.
    this.rebuildLeft();
    this.rebuildRight();
  }

  private commitEquip(itemId: string, slot: ItemSlot): void {
    if (_mode?.kind === 'barracks') {
      const state = appState.get();
      const result = equipFromStash(state.roster, state.stash, _selectedHeroId, itemId, slot);
      appState.update((s) => ({ ...s, roster: result.roster, stash: result.stash }));
    } else {
      const run = appState.get().runState;
      if (!run) return;
      const heroIndex = run.party.findIndex((h) => h.id === _selectedHeroId);
      if (heroIndex < 0) return;
      appState.update((s) => ({
        ...s,
        runState: equipFromPack(s.runState!, heroIndex, itemId, slot),
      }));
    }
  }

  private commitUnequip(slot: ItemSlot): void {
    if (_mode?.kind === 'barracks') {
      const state = appState.get();
      const result = unequipToStash(state.roster, state.stash, _selectedHeroId, slot);
      appState.update((s) => ({ ...s, roster: result.roster, stash: result.stash }));
    } else {
      const run = appState.get().runState;
      if (!run) return;
      const heroIndex = run.party.findIndex((h) => h.id === _selectedHeroId);
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

  private buildPreviewedHero(hero: Hero): Hero | null {
    const sel = _selection;
    if (sel.kind === 'pack-item') {
      const item = this.findSourceItem(sel.itemId);
      if (!item) return null;
      return {
        ...hero,
        equipment: { ...hero.equipment, [item.slot]: item } as Hero['equipment'],
      };
    }
    if (sel.kind === 'equipped-slot') {
      if (sel.slot === 'weapon') return null;
      const equipmentWithoutSlot: Hero['equipment'] = { ...hero.equipment };
      delete (equipmentWithoutSlot as unknown as Record<string, unknown>)[sel.slot];
      return { ...hero, equipment: equipmentWithoutSlot };
    }
    return null;
  }

  private buildKitLineColored(
    container: Phaser.GameObjects.Container,
    beforeHero: Hero,
  ): void {
    const afterHero = this.buildPreviewedHero(beforeHero);
    if (!afterHero) {
      container.add(
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

    let bandColor = '#aaaaaa';
    if (diff.bandChange === 'upgrade') bandColor = '#44cc44';
    else if (diff.bandChange === 'downgrade') bandColor = '#cc4444';

    let xCursor = HEADER_X;
    const statusText = this.add.text(xCursor, HEADER_KIT_Y, `${afterStatus} · `, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: bandColor,
    });
    container.add(statusText);
    xCursor += statusText.width;

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
      container.add(tok);
      xCursor += tok.width;
    }

    let removedIdx = 0;
    for (const id of diff.removed) {
      const isLast = removedIdx === diff.removed.length - 1;
      const text = `${ABILITIES[id].name}${isLast ? '' : ' · '}`;
      const tok = this.add.text(xCursor, HEADER_KIT_Y, text, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#cc4444',
      });
      container.add(tok);
      xCursor += tok.width;
      removedIdx++;
    }
  }

  private buildKitLineText(hero: Hero): string {
    const status = describeKitStatus(hero);
    const abilityIds: readonly AbilityId[] = resolveCombatAbilities(hero).abilities;
    const abilityNames = abilityIds.map((id) => ABILITIES[id].name).join(' · ');
    return `${status} · ${abilityNames}`;
  }

  private close(): void {
    const mode = _mode;
    this.scene.stop();
    if (mode?.kind === 'barracks') {
      this.scene.resume('barracks_panel');
    } else if (mode?.kind === 'in_run') {
      this.scene.resume(mode.returnTo);
    }
  }
}
