import { ConstraintMode, Clickable, UiScene } from 'phaser-pixui';
import type { Frame } from 'phaser-pixui';
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
import { fixPixuiCanvasViewport } from '@render/pixui_canvas_fix';
import { PixuiPaperdoll } from '@render/pixui_paperdoll';
import { uiTheme } from '@render/ui_theme';
import { appState } from './app_state';

// Module-level state — survives scene.restart() between selection changes
// and hero switches. Reset on init when the incoming mode changes.
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

// Layout constants
const PANEL_X = 20;
const PANEL_Y = 40;
const PANEL_W = 920;
const PANEL_H = 460;

// Left pane — absolute canvas coords
const LEFT_PANE_X = PANEL_X + 10;
const LEFT_PANE_Y = PANEL_Y + 70;
const LEFT_PANE_W = 260;
const LEFT_PANE_H = 360;

const HERO_ROW_W = 240;
const HERO_ROW_H = 76;
// Hero rows are positioned inside leftPane (pane-relative coords)
const HERO_ROW_PANE_X = 10;          // left margin inside left pane
const HERO_LIST_PANE_Y_START = 10;   // top margin inside left pane
const HERO_LIST_VISIBLE_ROWS = 4;
// Arrow x relative to left pane (right edge - margin)
const HERO_LIST_ARROW_PANE_X = LEFT_PANE_W - 16;

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

// Right pane — absolute canvas coords
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

// Picker positioned inside rightPane (pane-relative coords)
const PICKER_PANE_X = 10;                  // left margin inside right pane
const PICKER_PANE_Y_START = 185;           // top offset inside right pane (≈345-160)
const PICKER_W = 540;
const PICKER_ROW_H = 22;
const PICKER_VISIBLE_ROWS = 4;
// Arrow x relative to right pane right edge
const PICKER_ARROW_PANE_X = RIGHT_PANE_W - 14;

// Absolute coords for raw-Phaser content inside right pane — picker rows need
// per-instance rarity-color tinting, so they are placed via raw Phaser rather
// than pixui chrome (which uses pane-relative coords above).
const PICKER_X = 640;
const PICKER_Y_START = 345;

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

// Commit button — positioned relative to panel bottom-right
const COMMIT_BUTTON_PANEL_X = 850;
const COMMIT_BUTTON_PANEL_Y = 440;
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

export class EquipScene extends UiScene {
  constructor() {
    super({
      key: 'equip',
      viewportConstraints: { mode: ConstraintMode.Maximum, width: 960, height: 540 },
      theme: uiTheme,
    });
  }

  init(data: EquipMode): void {
    // Reset module state when the mode changes (i.e., a new open, not a restart).
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
    fixPixuiCanvasViewport(this);
    super.create();

    const mode = _mode!;

    // --- Dim overlay (raw Phaser — full-canvas modal backdrop) ---
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    // --- Panel frame ---
    const panel = this.insert.topLeft.frame({
      x: PANEL_X,
      y: PANEL_Y,
      width: PANEL_W,
      height: PANEL_H,
    });

    // --- Title ---
    const titleText = mode.kind === 'barracks' ? 'Equip · Barracks' : 'Equip';
    panel.insert.top.textArea({ y: 28, text: titleText });

    // --- Close button ---
    panel.insert.topRight.button({
      x: 4,
      y: 4,
      width: 48,
      text: 'X',
      onClick: () => this.close(),
    });

    // --- Left pane ---
    const leftPane = panel.insert.topLeft.frame({
      x: LEFT_PANE_X - PANEL_X,
      y: LEFT_PANE_Y - PANEL_Y,
      width: LEFT_PANE_W,
      height: LEFT_PANE_H,
    });
    this.buildLeftPane(leftPane);

    // --- Right pane ---
    const rightPane = panel.insert.topLeft.frame({
      x: RIGHT_PANE_X - PANEL_X,
      y: RIGHT_PANE_Y - PANEL_Y,
      width: RIGHT_PANE_W,
      height: RIGHT_PANE_H,
    });
    this.buildRightPane(rightPane);

    // --- Commit button ---
    const hero = this.resolveSelectedHero();
    if (hero) {
      this.buildCommitButton(panel, hero);
    }

    // --- ESC to close ---
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  // Init helper

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

  // Left pane — hero list with mini-equip-strip

  private buildLeftPane(leftPane: Frame): void {
    const list = this.getHeroList();
    const pageEnd = Math.min(list.length, _heroListPageStart + HERO_LIST_VISIBLE_ROWS);
    for (let i = _heroListPageStart; i < pageEnd; i++) {
      const rowPaneY = HERO_LIST_PANE_Y_START + (i - _heroListPageStart) * (HERO_ROW_H + 8);
      this.buildHeroRow(leftPane, list[i], rowPaneY);
    }

    if (list.length > HERO_LIST_VISIBLE_ROWS) {
      this.buildHeroListArrows(leftPane, list.length);
    }
  }

  private buildHeroRow(leftPane: Frame, hero: Hero, rowPaneY: number): void {
    const isSelected = _selectedHeroId === hero.id;

    // Row frame — pixui chrome for the background container.
    const rowFrame = leftPane.insert.topLeft.frame({
      x: HERO_ROW_PANE_X,
      y: rowPaneY,
      width: HERO_ROW_W,
      height: HERO_ROW_H,
    });

    // Selection gold border — raw Phaser inline rectangle (dynamic stroke per
    // selection state; same reason as Barracks gold border on selected rows).
    const absX = LEFT_PANE_X + HERO_ROW_PANE_X + HERO_ROW_W / 2;
    const absY = LEFT_PANE_Y + rowPaneY + HERO_ROW_H / 2;
    this.add
      .rectangle(absX, absY, HERO_ROW_W, HERO_ROW_H, 0x222222)
      .setStrokeStyle(2, isSelected ? SELECTION_GOLD : 0x444444);

    // Clickable overlay for hero selection.
    const clickable = new Clickable(this, {
      width: HERO_ROW_W,
      height: HERO_ROW_H,
      onClick: () => {
        if (_selectedHeroId === hero.id) return;
        _selectedHeroId = hero.id;
        _selection = { kind: 'none' };
        _pickerPageStart = 0;
        this.scene.restart();
      },
    });
    rowFrame.attach(clickable);

    // Hero name + class/level/HP text (raw Phaser — multi-color text pattern).
    const classDef = CLASSES[hero.classId];
    const textX = LEFT_PANE_X + HERO_ROW_PANE_X + 12;
    this.add.text(textX, LEFT_PANE_Y + rowPaneY + 8, hero.name, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff',
    });
    this.add.text(
      textX,
      LEFT_PANE_Y + rowPaneY + 26,
      `${classDef.name} · Lv ${hero.level} · HP ${hero.currentHp}/${hero.maxHp}`,
      { fontFamily: 'monospace', fontSize: '11px', color: '#aaaaaa' },
    );

    // Mini equip strip — 4 small rarity-bordered squares. Raw Phaser inline
    // rectangles — rarity color is dynamic per item (same reason as Blacksmith
    // row tinting workaround, Cluster B · 57).
    const stripY = LEFT_PANE_Y + rowPaneY + HERO_ROW_H - 20;
    const stripStartX = LEFT_PANE_X + HERO_ROW_PANE_X + 16;
    for (let s = 0; s < SLOTS.length; s++) {
      const slot = SLOTS[s];
      const item = hero.equipment[slot];
      const sx = stripStartX + s * 28;
      this.add
        .rectangle(sx, stripY, 22, 22, 0x111111)
        .setStrokeStyle(1, item ? RARITY_COLOR_NUM[item.rarity] : 0x333333);
    }
  }

  private buildHeroListArrows(leftPane: Frame, totalRows: number): void {
    const canPageUp = _heroListPageStart > 0;
    const canPageDown = _heroListPageStart + HERO_LIST_VISIBLE_ROWS < totalRows;

    // Page-up arrow — Up/Dn text labels (▲/▼ bitmap font support unverified, see plan Task 6 fallback note).
    leftPane.insert.topLeft.button({
      x: HERO_LIST_ARROW_PANE_X,
      y: HERO_LIST_PANE_Y_START,
      width: 24,
      height: 24,
      enabled: canPageUp,
      text: 'Up',
      onClick: () => {
        _heroListPageStart = Math.max(0, _heroListPageStart - HERO_LIST_VISIBLE_ROWS);
        this.scene.restart();
      },
    });

    // Page-down arrow — Up/Dn text labels (same fallback as above).
    leftPane.insert.topLeft.button({
      x: HERO_LIST_ARROW_PANE_X,
      y: HERO_LIST_PANE_Y_START + HERO_LIST_VISIBLE_ROWS * (HERO_ROW_H + 8) - 24,
      width: 24,
      height: 24,
      enabled: canPageDown,
      text: 'Dn',
      onClick: () => {
        _heroListPageStart += HERO_LIST_VISIBLE_ROWS;
        this.scene.restart();
      },
    });
  }

  // Right pane — paperdoll + header + slot strip + detail card + picker

  private buildRightPane(rightPane: Frame): void {
    const hero = this.resolveSelectedHero();
    if (!hero) {
      rightPane.insert.center.textArea({ text: 'No hero selected.' });
      return;
    }

    this.buildPaperdoll(hero);
    this.buildHeader(hero);
    this.buildSlotStrip(hero);
    this.buildSlotDetailCard(hero);
    this.buildPicker(rightPane, hero);
  }

  private buildPaperdoll(hero: Hero): void {
    // PixuiPaperdoll positioned via a topLeft frame acting as an anchor shim
    // (pattern from barracks_panel_scene.ts).
    const paperdollFrame = this.insert.topLeft.frame({
      x: PAPERDOLL_X - 24,
      y: PAPERDOLL_Y - 24,
      width: 48,
      height: 48,
    });
    const paperdoll = new PixuiPaperdoll(this, heroToLoadout(hero), { scale: PAPERDOLL_SCALE });
    paperdollFrame.attach(paperdoll);
  }

  private buildHeader(hero: Hero): void {
    const classDef = CLASSES[hero.classId];

    // Line 1: Name · Class · Lv N (raw Phaser text — color consistency)
    this.add.text(HEADER_X, HEADER_NAME_Y, `${hero.name} · ${classDef.name} · Lv ${hero.level}`, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffffff',
    });

    // Line 2: stat tokens with optional colored preview deltas.
    // Multi-instance raw Phaser text — one per stat token, each with its own
    // color based on delta sign. Width cursor advances per token.
    const preview = this.computePreviewStats(hero);
    if (preview) {
      this.buildStatsLineColored(preview);
    } else {
      const stats = applyEquipmentStats(hero.baseStats, hero.equipment);
      this.add.text(HEADER_X, HEADER_STATS_Y, this.formatStatsLine(stats), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#dddddd',
      });
    }

    // Line 3: kit line — colored if preview.
    this.buildKitLineColored(hero);
  }

  private buildStatsLineColored(preview: StatPreview): void {
    // Multi-instance raw Phaser text: one text object per stat token, each
    // colored by delta sign (green = positive, red = negative, gray = neutral).
    // Width-cursor advancement reads tok.width after add.text.
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

  // Slot strip — 4 large squares (weapon/shield/outfit/hat)

  private buildSlotStrip(hero: Hero): void {
    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const item = hero.equipment[slot];
      this.buildSlotSquare(slot, item, SLOT_STRIP_X[i]);
    }
  }

  private buildSlotSquare(slot: ItemSlot, item: Item | undefined, x: number): void {
    const isSelected =
      _selection.kind === 'equipped-slot' && _selection.slot === slot;
    const isWeapon = slot === 'weapon';
    const isEmpty = item === undefined;
    // Rarity-bordered rectangle — raw Phaser; rarity color is dynamic per item
    // (same reason as Blacksmith's row tinting workaround, Cluster B · 57).
    const borderColor = item ? RARITY_COLOR_NUM[item.rarity] : 0x444444;
    const square = this.add
      .rectangle(x, SLOT_STRIP_Y, SLOT_SQUARE_SIZE, SLOT_SQUARE_SIZE, 0x222222)
      .setStrokeStyle(isSelected ? 3 : 2, isSelected ? SELECTION_GOLD : borderColor);

    if (item) {
      // Item sprite icon — raw Phaser inline add.sprite (matches ShopOverlay pattern).
      this.add
        .sprite(x, SLOT_STRIP_Y, 'sprites', parseInt(BASE_ITEMS[item.baseId].spriteId, 10))
        .setScale(2);
    } else {
      this.add
        .text(x, SLOT_STRIP_Y, slot, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#666666',
        })
        .setOrigin(0.5);
    }

    this.add
      .text(x, SLOT_STRIP_Y + SLOT_SQUARE_SIZE / 2 + 8, slot, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#888888',
      })
      .setOrigin(0.5);

    // Weapon slot is non-clickable (cannot unequip). Empty non-weapon slots are
    // also non-clickable (nothing to unequip-preview).
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
    this.scene.restart();
  }

  // Slot detail card — before/after preview

  private buildSlotDetailCard(hero: Hero): void {
    // Detail card background — raw Phaser rectangle (multi-color rarity text
    // inside; no per-instance tint in pixui TextArea).
    this.add
      .rectangle(CARD_CX, CARD_Y, CARD_W, CARD_H, 0x111111)
      .setStrokeStyle(1, 0x333333);

    const sel = _selection;

    if (sel.kind === 'pack-item') {
      const newItem = this.findSourceItem(sel.itemId);
      if (newItem) {
        const beforeItem = hero.equipment[newItem.slot];
        this.renderBeforeAfterInCard(beforeItem, newItem);
        return;
      }
    }

    if (sel.kind === 'equipped-slot') {
      const beforeItem = hero.equipment[sel.slot];
      this.renderBeforeAfterInCard(beforeItem, undefined);
      return;
    }

    // At-rest: show weapon slot.
    this.renderItemSummaryInCard(hero.equipment.weapon, CARD_CX, CARD_Y);
  }

  private renderBeforeAfterInCard(before: Item | undefined, after: Item | undefined): void {
    const leftCx = CARD_CX - CARD_W / 4;
    const rightCx = CARD_CX + CARD_W / 4;

    this.add
      .text(CARD_CX, CARD_Y, '→', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#888888',
      })
      .setOrigin(0.5);

    this.renderItemSummaryInCard(before, leftCx, CARD_Y);
    this.renderItemSummaryInCard(after, rightCx, CARD_Y);
  }

  private renderItemSummaryInCard(item: Item | undefined, cx: number, cy: number): void {
    if (item === undefined) {
      this.add
        .text(cx, cy, '(empty)', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#888888',
          fontStyle: 'italic',
        })
        .setOrigin(0.5);
      return;
    }

    let title = `${itemDisplayName(item)} · ${item.rarity}`;
    if (item.slot === 'weapon' && item.weaponType) {
      title = `${title} · ${WEAPON_TYPE_DISPLAY[item.weaponType] ?? item.weaponType}`;
    }
    // Rarity-colored title — raw Phaser text; per-instance tint not available
    // in pixui TextArea (same reason as stat tokens).
    this.add
      .text(cx, cy - 14, title, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: RARITY_COLOR_HEX[item.rarity],
      })
      .setOrigin(0.5);

    const affixLine = itemAffixDescription(item);
    if (affixLine.length > 0) {
      this.add
        .text(cx, cy + 4, affixLine, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5);
    }
  }

  // Picker — paged list of pack/stash items

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

  private buildPicker(rightPane: Frame, hero: Hero): void {
    const items = this.sortedSourceItems();
    const sourceLabel = _mode?.kind === 'barracks' ? 'Stash' : 'Pack';
    this.add.text(PICKER_X - PICKER_W / 2, PICKER_Y_START - 16, `${sourceLabel} (${items.length})`, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cccccc',
    });

    if (items.length === 0) {
      this.add
        .text(PICKER_X, PICKER_Y_START + 20, `${sourceLabel} is empty.`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#888888',
        })
        .setOrigin(0.5);
      return;
    }

    const pageEnd = Math.min(items.length, _pickerPageStart + PICKER_VISIBLE_ROWS);
    for (let i = _pickerPageStart; i < pageEnd; i++) {
      const rowPaneY = PICKER_PANE_Y_START + (i - _pickerPageStart) * PICKER_ROW_H;
      this.buildPickerRow(rightPane, items[i], rowPaneY, hero);
    }

    if (items.length > PICKER_VISIBLE_ROWS) {
      this.buildPickerArrows(rightPane, items.length);
    }
  }

  private buildPickerRow(rightPane: Frame, item: Item, rowPaneY: number, hero: Hero): void {
    const isSelected =
      _selection.kind === 'pack-item' && _selection.itemId === item.id;

    // Row frame — pixui chrome for the background container.
    const rowFrame = rightPane.insert.topLeft.frame({
      x: PICKER_PANE_X,
      y: rowPaneY,
      width: PICKER_W,
      height: PICKER_ROW_H - 2,
    });

    // Selection highlight background — raw Phaser inline rectangle (dynamic
    // fill + stroke per selection state; same reason as Barracks gold border).
    const absX = RIGHT_PANE_X + PICKER_PANE_X + PICKER_W / 2;
    const absY = RIGHT_PANE_Y + rowPaneY + (PICKER_ROW_H - 2) / 2;
    this.add
      .rectangle(absX, absY, PICKER_W, PICKER_ROW_H - 2,
        isSelected ? 0x2a2418 : 0x111111)
      .setStrokeStyle(1, isSelected ? SELECTION_GOLD : 0x222222);

    // Clickable overlay for item selection.
    const clickable = new Clickable(this, {
      width: PICKER_W,
      height: PICKER_ROW_H - 2,
      onClick: () => this.onPickerRowClick(item),
    });
    rowFrame.attach(clickable);

    // Row text (raw Phaser — rarity-colored per item).
    const isEquipped = hero.equipment[item.slot]?.id === item.id;
    const equippedSuffix = isEquipped ? ' [Equipped]' : '';
    const name = `${SLOT_TAG[item.slot]} ${itemDisplayName(item)} [${item.rarity}]${equippedSuffix}`;
    this.add.text(PICKER_X - PICKER_W / 2 + 8, RIGHT_PANE_Y + rowPaneY + 3, name, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: RARITY_COLOR_HEX[item.rarity],
    });

    const affixLine = itemAffixDescription(item);
    if (affixLine.length > 0) {
      this.add.text(PICKER_X + PICKER_W / 2 - 8, RIGHT_PANE_Y + rowPaneY + 3, affixLine, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#999999',
      }).setOrigin(1, 0);
    }
  }

  private buildPickerArrows(rightPane: Frame, totalRows: number): void {
    const canPageUp = _pickerPageStart > 0;
    const canPageDown = _pickerPageStart + PICKER_VISIBLE_ROWS < totalRows;

    // Page-up arrow — Up/Dn text labels (▲/▼ bitmap font support unverified, see plan Task 6 fallback note).
    rightPane.insert.topLeft.button({
      x: PICKER_ARROW_PANE_X,
      y: PICKER_PANE_Y_START,
      width: 24,
      height: 20,
      enabled: canPageUp,
      text: 'Up',
      onClick: () => {
        _pickerPageStart = Math.max(0, _pickerPageStart - PICKER_VISIBLE_ROWS);
        this.scene.restart();
      },
    });

    // Page-down arrow — Up/Dn text labels (same fallback as above).
    rightPane.insert.topLeft.button({
      x: PICKER_ARROW_PANE_X,
      y: PICKER_PANE_Y_START + PICKER_VISIBLE_ROWS * PICKER_ROW_H - 20,
      width: 24,
      height: 20,
      enabled: canPageDown,
      text: 'Dn',
      onClick: () => {
        _pickerPageStart += PICKER_VISIBLE_ROWS;
        this.scene.restart();
      },
    });
  }

  private onPickerRowClick(item: Item): void {
    if (_selection.kind === 'pack-item' && _selection.itemId === item.id) {
      this.commit();
      return;
    }
    _selection = { kind: 'pack-item', itemId: item.id };
    this.scene.restart();
  }

  // Commit button

  private buildCommitButton(panel: Frame, hero: Hero): void {
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

    panel.insert.topLeft.button({
      x: COMMIT_BUTTON_PANEL_X - PANEL_X - COMMIT_BUTTON_W / 2,
      y: COMMIT_BUTTON_PANEL_Y - PANEL_Y,
      width: COMMIT_BUTTON_W,
      height: COMMIT_BUTTON_H,
      enabled,
      text: label,
      onClick: () => this.commit(),
    });
  }

  // Commit action

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

    // Clamp picker page cursor: committing may have removed the last item on
    // the current page, leaving _pickerPageStart past the end of the list.
    const newItems = this.getSourceItems();
    if (_pickerPageStart > 0 && _pickerPageStart >= newItems.length) {
      _pickerPageStart = Math.max(0, newItems.length - PICKER_VISIBLE_ROWS);
    }

    this.scene.restart();
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

  // Kit line with optional colored preview

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

  private buildKitLineColored(beforeHero: Hero): void {
    const afterHero = this.buildPreviewedHero(beforeHero);
    if (!afterHero) {
      // No preview — render the at-rest kit line.
      this.add.text(HEADER_X, HEADER_KIT_Y, this.buildKitLineText(beforeHero), {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#aaaaaa',
        wordWrap: { width: RIGHT_PANE_W - 80 },
      });
      return;
    }

    const diff = resolveAbilityDiff(beforeHero, afterHero);
    const afterStatus = describeKitStatus(afterHero);
    const afterAbilities = resolveCombatAbilities(afterHero).abilities;
    const removedSet = new Set(diff.removed);

    let bandColor = '#aaaaaa';
    if (diff.bandChange === 'upgrade') bandColor = '#44cc44';
    else if (diff.bandChange === 'downgrade') bandColor = '#cc4444';

    // Multi-instance raw Phaser text per token — same pattern as buildStatsLineColored.
    let xCursor = HEADER_X;
    const statusText = this.add.text(xCursor, HEADER_KIT_Y, `${afterStatus} · `, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: bandColor,
    });
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

  // Close

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
