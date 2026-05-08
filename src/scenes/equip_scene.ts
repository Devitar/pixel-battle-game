import { ConstraintMode, UiScene } from 'phaser-pixui';
import type { Frame } from 'phaser-pixui';
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
import { fixPixuiCanvasViewport } from '@render/pixui_canvas_fix';
import { destroyPixuiSubtree, detachPixuiChild } from '@render/pixui_dynamic_rebuild';
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

// Commit button — anchored to panel.bottomRight (8px inset on each axis).
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
  // Refs and tracking arrays for partial updates on selection / pagination /
  // commit, instead of scene.restart() (which caused the whole modal to flicker).
  // Reset on each create() — the scene instance is reused across restarts.
  private _panelFrame: Frame | undefined;
  private _leftRawObjects: Phaser.GameObjects.GameObject[] = [];
  private _leftPixuiTracked: { parent: unknown; component: unknown }[] = [];
  private _rightRawObjects: Phaser.GameObjects.GameObject[] = [];
  private _rightPixuiTracked: { parent: unknown; component: unknown }[] = [];
  private _heroRowStrokes: { rect: Phaser.GameObjects.Rectangle; id: string }[] = [];

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

    this._panelFrame = undefined;
    this._leftRawObjects = [];
    this._leftPixuiTracked = [];
    this._rightRawObjects = [];
    this._rightPixuiTracked = [];
    this._heroRowStrokes = [];

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
    this._panelFrame = panel;

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

    // --- Left pane (raw Phaser chrome — pixui Frame compounded paddings with
    //     panel paddingX/Y, shifting the leftPane 12/14px inside the intended
    //     canvas position, which left every raw-Phaser child positioned by
    //     LEFT_PANE_X / LEFT_PANE_Y misaligned with the visible frame). ---
    this.add
      .rectangle(
        LEFT_PANE_X + LEFT_PANE_W / 2,
        LEFT_PANE_Y + LEFT_PANE_H / 2,
        LEFT_PANE_W,
        LEFT_PANE_H,
        0x1a1a1a,
      )
      .setStrokeStyle(1, 0x444444);
    this.buildAndTrackLeftPane();

    // --- Right pane (raw Phaser chrome, same reason as left pane) ---
    this.add
      .rectangle(
        RIGHT_PANE_X + RIGHT_PANE_W / 2,
        RIGHT_PANE_Y + RIGHT_PANE_H / 2,
        RIGHT_PANE_W,
        RIGHT_PANE_H,
        0x1a1a1a,
      )
      .setStrokeStyle(1, 0x444444);
    this.buildAndTrackRightPane();

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

  // -------------------------------------------------------------------------
  // Partial updates (avoids the full-scene flicker that scene.restart() caused)
  // -------------------------------------------------------------------------

  // Hero selection click: update left-row strokes in place, rebuild the right
  // pane (paperdoll, header, slot strip, detail card, picker, commit button).
  // The left pane's row content doesn't change for selection — only the gold
  // stroke alpha — so we don't rebuild the left pane.
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

  // Snapshot-diff tracking: capture every Phaser game object and pixui
  // component added during the wrapped build call, so a later partial update
  // can tear them down without scene.restart(). The pixui side has two parents
  // we care about — scene._root (paperdoll, pagination buttons) and panel
  // (commit button) — so we snapshot both child arrays.
  private buildAndTrackLeftPane(): void {
    const root = (this as unknown as { _root: { _children: { component: unknown }[] } })._root;
    const dlBefore = this.children.list.length;
    const rootBefore = root._children.length;
    this.buildLeftPane();
    this._leftRawObjects = this.children.list.slice(dlBefore);
    this._leftPixuiTracked = root._children
      .slice(rootBefore)
      .map((c) => ({ parent: root, component: c.component }));
  }

  private buildAndTrackRightPane(): void {
    const panel = this._panelFrame;
    if (!panel) return;
    const root = (this as unknown as { _root: { _children: { component: unknown }[] } })._root;
    const panelInner = (panel as unknown as {
      _insert: { _container: { _children: { component: unknown }[] } };
    })._insert._container;

    const dlBefore = this.children.list.length;
    const rootBefore = root._children.length;
    const panelInnerBefore = panelInner._children.length;

    this.buildRightPane();
    const hero = this.resolveSelectedHero();
    if (hero) this.buildCommitButton(panel, hero);

    this._rightRawObjects = this.children.list.slice(dlBefore);
    this._rightPixuiTracked = [
      ...root._children.slice(rootBefore).map((c) => ({ parent: root, component: c.component })),
      ...panelInner._children
        .slice(panelInnerBefore)
        .map((c) => ({ parent: panel, component: c.component })),
    ];
  }

  private rebuildLeft(): void {
    for (const obj of this._leftRawObjects) {
      if (!(obj as { isDestroyed?: boolean }).isDestroyed) obj.destroy();
    }
    this._leftRawObjects = [];
    this._heroRowStrokes = [];

    for (const { parent, component } of this._leftPixuiTracked) {
      destroyPixuiSubtree(component);
      detachPixuiChild(parent, component);
    }
    this._leftPixuiTracked = [];

    this.buildAndTrackLeftPane();
    this.repositionAndInit(this._leftPixuiTracked);
  }

  private rebuildRight(): void {
    for (const obj of this._rightRawObjects) {
      if (!(obj as { isDestroyed?: boolean }).isDestroyed) obj.destroy();
    }
    this._rightRawObjects = [];

    for (const { parent, component } of this._rightPixuiTracked) {
      destroyPixuiSubtree(component);
      detachPixuiChild(parent, component);
    }
    this._rightPixuiTracked = [];

    this.buildAndTrackRightPane();
    this.repositionAndInit(this._rightPixuiTracked);
  }

  // Newly attached pixui components were never reposition'd or initialized —
  // UiScene's events.once('create', () => _root.initialize()) only fires at
  // scene boot. Cascade reposition through _root (sets _parent on the new
  // children at any depth), then initialize each new top-level component.
  private repositionAndInit(tracked: { component: unknown }[]): void {
    if (tracked.length === 0) return;
    (this as unknown as { _updateRoot: () => void })._updateRoot();
    for (const { component } of tracked) {
      (component as { initialize: () => void }).initialize();
    }
  }

  // Left pane — hero list with mini-equip-strip

  private buildLeftPane(): void {
    const list = this.getHeroList();
    const pageEnd = Math.min(list.length, _heroListPageStart + HERO_LIST_VISIBLE_ROWS);
    for (let i = _heroListPageStart; i < pageEnd; i++) {
      const rowPaneY = HERO_LIST_PANE_Y_START + (i - _heroListPageStart) * (HERO_ROW_H + 8);
      this.buildHeroRow(list[i], rowPaneY);
    }

    if (list.length > HERO_LIST_VISIBLE_ROWS) {
      this.buildHeroListArrows(list.length);
    }
  }

  private buildHeroRow(hero: Hero, rowPaneY: number): void {
    const isSelected = _selectedHeroId === hero.id;
    const absX = LEFT_PANE_X + HERO_ROW_PANE_X + HERO_ROW_W / 2;
    const absY = LEFT_PANE_Y + rowPaneY + HERO_ROW_H / 2;

    // Row background, gold-stroke selection highlight, and click target —
    // all on a single raw Phaser rectangle. (Replaces the previous pixui
    // rowFrame + raw rect + pixui Clickable combo: rowFrame's frame_light
    // NineSlice was rendering decorative artifacts behind the cards because
    // its inner-padding-shifted position no longer matched the raw rect.)
    const rowRect = this.add
      .rectangle(absX, absY, HERO_ROW_W, HERO_ROW_H, 0x222222)
      .setStrokeStyle(2, isSelected ? SELECTION_GOLD : 0x444444);
    rowRect.setInteractive({ useHandCursor: true });
    rowRect.on('pointerdown', () => this.selectHero(hero.id));
    this._heroRowStrokes.push({ rect: rowRect, id: hero.id });

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

    // Mini equip strip — 4 small rarity-bordered squares with item icons.
    const stripY = LEFT_PANE_Y + rowPaneY + HERO_ROW_H - 20;
    const stripStartX = LEFT_PANE_X + HERO_ROW_PANE_X + 16;
    for (let s = 0; s < SLOTS.length; s++) {
      const slot = SLOTS[s];
      const item = hero.equipment[slot];
      const sx = stripStartX + s * 28;
      this.add
        .rectangle(sx, stripY, 22, 22, 0x111111)
        .setStrokeStyle(1, item ? RARITY_COLOR_NUM[item.rarity] : 0x333333);
      if (item) {
        this.add
          .sprite(sx, stripY, SHEET.key, parseInt(BASE_ITEMS[item.baseId].spriteId, 10));
      }
    }
  }

  private buildHeroListArrows(totalRows: number): void {
    const canPageUp = _heroListPageStart > 0;
    const canPageDown = _heroListPageStart + HERO_LIST_VISIBLE_ROWS < totalRows;
    // Pagination buttons attached to scene root (not pane) since the pane is
    // raw Phaser. Position is canvas-absolute.
    const arrowX = LEFT_PANE_X + LEFT_PANE_W - 28;

    this.insert.topLeft.button({
      x: arrowX,
      y: LEFT_PANE_Y + 8,
      width: 24,
      height: 24,
      enabled: canPageUp,
      text: 'Up',
      onClick: () => {
        _heroListPageStart = Math.max(0, _heroListPageStart - HERO_LIST_VISIBLE_ROWS);
        this.rebuildLeft();
      },
    });

    this.insert.topLeft.button({
      x: arrowX,
      y: LEFT_PANE_Y + LEFT_PANE_H - 32,
      width: 24,
      height: 24,
      enabled: canPageDown,
      text: 'Dn',
      onClick: () => {
        _heroListPageStart += HERO_LIST_VISIBLE_ROWS;
        this.rebuildLeft();
      },
    });
  }

  // Right pane — paperdoll + header + slot strip + detail card + picker

  private buildRightPane(): void {
    const hero = this.resolveSelectedHero();
    if (!hero) {
      this.add
        .text(
          RIGHT_PANE_X + RIGHT_PANE_W / 2,
          RIGHT_PANE_Y + RIGHT_PANE_H / 2,
          'No hero selected.',
          { fontFamily: 'monospace', fontSize: '12px', color: '#888888' },
        )
        .setOrigin(0.5);
      return;
    }

    this.buildPaperdoll(hero);
    this.buildHeader(hero);
    this.buildSlotStrip(hero);
    this.buildSlotDetailCard(hero);
    this.buildPicker(hero);
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
        .sprite(x, SLOT_STRIP_Y, SHEET.key, parseInt(BASE_ITEMS[item.baseId].spriteId, 10))
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
    this.rebuildRight();
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

  private buildPicker(hero: Hero): void {
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
      this.buildPickerRow(items[i], rowPaneY, hero);
    }

    if (items.length > PICKER_VISIBLE_ROWS) {
      this.buildPickerArrows(items.length);
    }
  }

  private buildPickerRow(item: Item, rowPaneY: number, hero: Hero): void {
    const isSelected =
      _selection.kind === 'pack-item' && _selection.itemId === item.id;

    const absX = RIGHT_PANE_X + PICKER_PANE_X + PICKER_W / 2;
    const absY = RIGHT_PANE_Y + rowPaneY + (PICKER_ROW_H - 2) / 2;
    // Selection highlight background + click target — single raw Phaser
    // rectangle (replaces previous pixui rowFrame + raw rect + Clickable
    // combo, same reason as buildHeroRow).
    const rowRect = this.add
      .rectangle(absX, absY, PICKER_W, PICKER_ROW_H - 2,
        isSelected ? 0x2a2418 : 0x111111)
      .setStrokeStyle(1, isSelected ? SELECTION_GOLD : 0x222222);
    rowRect.setInteractive({ useHandCursor: true });
    rowRect.on('pointerdown', () => this.onPickerRowClick(item));

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

  private buildPickerArrows(totalRows: number): void {
    const canPageUp = _pickerPageStart > 0;
    const canPageDown = _pickerPageStart + PICKER_VISIBLE_ROWS < totalRows;
    const arrowX = RIGHT_PANE_X + RIGHT_PANE_W - 30;

    this.insert.topLeft.button({
      x: arrowX,
      y: PICKER_Y_START - 4,
      width: 24,
      height: 20,
      enabled: canPageUp,
      text: 'Up',
      onClick: () => {
        _pickerPageStart = Math.max(0, _pickerPageStart - PICKER_VISIBLE_ROWS);
        this.rebuildRight();
      },
    });

    this.insert.topLeft.button({
      x: arrowX,
      y: PICKER_Y_START + PICKER_VISIBLE_ROWS * PICKER_ROW_H - 20,
      width: 24,
      height: 20,
      enabled: canPageDown,
      text: 'Dn',
      onClick: () => {
        _pickerPageStart += PICKER_VISIBLE_ROWS;
        this.rebuildRight();
      },
    });
  }

  private onPickerRowClick(item: Item): void {
    if (_selection.kind === 'pack-item' && _selection.itemId === item.id) {
      this.commit();
      return;
    }
    _selection = { kind: 'pack-item', itemId: item.id };
    this.rebuildRight();
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

    // Anchor to panel's bottomRight so the button stays inside the inner
    // padding regardless of the frame's paddingX / paddingY. Previous
    // topLeft-with-x=730 placed the button's left edge there, ending at
    // canvas X=962 — past both the panel and the canvas right edge.
    panel.insert.bottomRight.button({
      x: 8,
      y: 8,
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

    // Equipment changed — left mini-strips and the entire right pane need
    // refreshing.
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
