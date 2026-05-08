import * as Phaser from 'phaser';
import { ConstraintMode, Dialog, UiScene } from 'phaser-pixui';
import { nextLevel } from '@camp/building_levels';
import { applyBuildingUpgrade } from '@camp/building_upgrade';
import { listHeroes, removeHero } from '@camp/roster';
import { balance } from '@camp/vault';
import { ABILITIES } from '@data/abilities';
import { describeAbility } from '@data/ability_describe';
import { CLASSES } from '@data/classes';
import { TRAITS } from '@data/traits';
import { WOUNDS, describeWoundEffect } from '@data/wounds';
import type { Hero } from '@heroes/hero';
import { describeKitStatus, resolveCombatAbilities } from '@items/kit';
import { applyEquipmentStats, describeRarePropertyFields, rarePropertyFields } from '@items/stats';
import { heroToLoadout } from '@render/hero_loadout';
import { fixPixuiCanvasViewport } from '@render/pixui_canvas_fix';
import { destroyPixuiSubtree, detachPixuiChild } from '@render/pixui_dynamic_rebuild';
import { PixuiPaperdoll } from '@render/pixui_paperdoll';
import { uiTheme } from '@render/ui_theme';
import { PixuiHeroCard } from '@ui/pixui_hero_card';
import { appState } from './app_state';

// Module-level state survives scene.restart() across selection changes and
// retire confirmations. Reset to defaults on close.
let _selectedHeroId: string | null = null;
let _confirmRetirePending = false;

// Slot stride is computed per-level so the 2-column grid always fits inside
// LIST_PANE_H = 360 (first slot center at SLOT_Y_TOP=120, last at SLOT_Y_BOTTOM=420).
//
// At L1 (cap=12 → 6 rows) stride is 60 — cards do not overlap.
// At L2 (cap=16 → 8 rows) stride is ~43 — cards overlap by ~17px.
// At L3 (cap=20 → 10 rows) stride is ~33 — cards overlap by ~27px.
const SLOT_Y_TOP = 120;
const SLOT_Y_BOTTOM = 420;
function slotStride(cap: number): number {
  const rows = Math.ceil(cap / 2);
  if (rows <= 1) return 0;
  return (SLOT_Y_BOTTOM - SLOT_Y_TOP) / (rows - 1);
}

// Panel constants — absolute canvas coords
const PANEL_X = 20;
const PANEL_Y = 40;
const PANEL_W = 920;
const PANEL_H = 460;

// List pane (left)
const LIST_PANE_X = PANEL_X + 10;
const LIST_PANE_W = 380;
const LIST_PANE_H = PANEL_H - 80;

// Slot column x positions within the list pane (absolute)
const SLOT_X_LEFT = 135;
const SLOT_X_RIGHT = 325;
const SLOT_BG_W = 184;
const SLOT_BG_H = 60;

// Detail pane (right) — absolute canvas coords for raw-Phaser text
const DETAIL_PAPERDOLL_X = 525;
const DETAIL_PAPERDOLL_Y = 145;
const DETAIL_TEXT_X = 575;

const ABILITY_X = 500;
const ABILITY_HEADER_Y = 215;
const ABILITY_BLOCK_START_Y = 235;
const ABILITY_HEADER_TO_BLOCK_GAP = ABILITY_BLOCK_START_Y - ABILITY_HEADER_Y; // 20px
const ABILITY_NAME_LINE_HEIGHT = 16;
const ABILITY_LINE_HEIGHT = 14;
const ABILITY_BLOCK_GAP = 6;

export class BarracksPanelScene extends UiScene {
  // Refs used by selectHero() to do a partial rebuild instead of
  // scene.restart(). Reset on each create() — the scene instance is reused
  // across restarts.
  private _slotBgs: { bg: Phaser.GameObjects.Rectangle; id: string }[] = [];
  private _detailRawObjects: Phaser.GameObjects.GameObject[] = [];
  private _detailPixuiComponents: unknown[] = [];

  constructor() {
    super({
      key: 'barracks_panel',
      viewportConstraints: { mode: ConstraintMode.Maximum, width: 960, height: 540 },
      theme: uiTheme,
    });
  }

  create(): void {
    fixPixuiCanvasViewport(this);
    super.create();

    this._slotBgs = [];
    this._detailRawObjects = [];
    this._detailPixuiComponents = [];

    const state = appState.get();
    const heroes = listHeroes(state.roster);
    const cap = state.roster.capacity;

    // Validate selected hero still exists; reset if gone.
    if (_selectedHeroId && !heroes.find((h) => h.id === _selectedHeroId)) {
      _selectedHeroId = null;
      _confirmRetirePending = false;
    }
    // Default: select first hero on first open.
    if (_selectedHeroId === null && heroes.length > 0) {
      _selectedHeroId = heroes[0].id;
    }

    // --- Dim overlay (raw Phaser — full-canvas modal backdrop) ---
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0);

    // --- Header: title + close button ---
    this.insert.top.textArea({ y: 28, text: `Barracks · ${heroes.length} / ${cap}` });
    this.insert.topRight.button({
      x: 4,
      y: 4,
      width: 48,
      text: 'X',
      onClick: () => this.close(),
    });

    // --- Upgrade-Barracks button (top-left, conditional) ---
    this.buildUpgradeButton();

    // --- Main panel frame ---
    this.insert.topLeft.frame({
      x: PANEL_X,
      y: PANEL_Y,
      width: PANEL_W,
      height: PANEL_H,
    });

    // --- List pane (left half, background frame) ---
    this.insert.topLeft.frame({
      x: LIST_PANE_X,
      y: PANEL_Y + 70,
      width: LIST_PANE_W,
      height: LIST_PANE_H,
    });

    this.buildSlotGrid(heroes, cap);

    // --- Detail pane background (raw Phaser; content is raw-Phaser text below) ---
    const detailPaneCX = 700;
    const detailPaneCY = 270;
    this.add
      .rectangle(detailPaneCX, detailPaneCY, 440, 360, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444);

    // --- Detail pane content ---
    this.buildAndTrackDetailPane(heroes);

    // --- Retire confirm dialog (shown when _confirmRetirePending) ---
    if (_confirmRetirePending) {
      const hero = heroes.find((h) => h.id === _selectedHeroId);
      if (hero) {
        this.buildRetireDialog(hero, heroes.length);
      }
    }

    // ESC closes panel (or dismisses retire dialog)
    this.input.keyboard?.on('keydown-ESC', () => {
      if (_confirmRetirePending) {
        _confirmRetirePending = false;
        this.scene.restart();
        return;
      }
      this.close();
    });

    // RESUME listener: refresh detail after equip closes.
    this.events.once(Phaser.Scenes.Events.RESUME, () => this.scene.restart());
  }

  // -------------------------------------------------------------------------
  // Upgrade button
  // -------------------------------------------------------------------------

  private buildUpgradeButton(): void {
    const level = appState.get().buildingLevels.barracks;
    const next = nextLevel('barracks', level);
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
        appState.update((s) => applyBuildingUpgrade(s, 'barracks'));
        _selectedHeroId = null;
        _confirmRetirePending = false;
        this.scene.restart();
      },
    });
  }

  // -------------------------------------------------------------------------
  // Slot grid (2-column, capacity-scaled)
  // -------------------------------------------------------------------------

  private buildSlotGrid(heroes: readonly Hero[], cap: number): void {
    const stride = slotStride(cap);
    // Scale slot bg height to stride so click targets don't overlap at L2/L3.
    const slotBgH = stride < SLOT_BG_H ? stride - 2 : SLOT_BG_H;

    for (let i = 0; i < cap; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = col === 0 ? SLOT_X_LEFT : SLOT_X_RIGHT;
      const y = SLOT_Y_TOP + row * stride;

      if (i < heroes.length) {
        this.buildFilledSlot(heroes[i], x, y, slotBgH);
      } else {
        this.buildEmptySlot(x, y, slotBgH);
      }
    }
  }

  private buildFilledSlot(hero: Hero, x: number, y: number, slotBgH: number): void {
    // Selection highlight: transparent rect with a gold stroke shown only
    // when this hero is selected. No interactivity — the card's own
    // Clickable overlay (top of the card sub-tree) intercepts pointer
    // events first, so clicks must be routed through PixuiHeroCard's
    // onClick rather than this rectangle.
    const isSelected = hero.id === _selectedHeroId;
    const bg = this.add
      .rectangle(x, y, SLOT_BG_W, slotBgH, 0x000000, 0)
      .setStrokeStyle(2, 0xffcc66, isSelected ? 1 : 0);
    this._slotBgs.push({ bg, id: hero.id });

    // PixuiHeroCard(small) — wound badges from 3c-i auto-render.
    // Mini equip-strip per slot is intentionally omitted: PixuiHeroCard already
    // shows class/level/HP/trait; full equipment lives in the detail pane.
    // (Deliberate scope cut per plan Q2 decision.)
    const card = new PixuiHeroCard(this, hero, {
      size: 'small',
      onClick: () => this.selectHero(hero.id),
    });
    // Positioning-only wrapper. `container` (not `frame`) so no NineSlice
    // is drawn — frame_light would render on top of the card because pixui
    // adds the NineSlice to the display list when the wrapper is created
    // (after the card's children were already added during construction).
    // The bg rectangle above already supplies the per-slot visual frame.
    const slotContainer = this.insert.topLeft.container({
      x: x - SLOT_BG_W / 2,
      y: y - slotBgH / 2,
      width: SLOT_BG_W,
      height: slotBgH,
    });
    slotContainer.attach(card);
  }

  private buildEmptySlot(x: number, y: number, slotBgH: number): void {
    this.add
      .rectangle(x, y, 180, slotBgH - 4, 0x1a1a1a)
      .setStrokeStyle(1, 0x333333);
    this.add
      .text(x, y, 'empty', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#555555',
      })
      .setOrigin(0.5);
  }

  // -------------------------------------------------------------------------
  // Detail pane
  // -------------------------------------------------------------------------

  // Partial update on hero selection: only the slot strokes and the detail
  // pane change. A full scene.restart() here was visible as a one-frame
  // flicker (Blacksmith pattern).
  private selectHero(id: string): void {
    if (_selectedHeroId === id) return;
    _selectedHeroId = id;
    _confirmRetirePending = false;

    for (const slot of this._slotBgs) {
      slot.bg.setStrokeStyle(2, 0xffcc66, slot.id === id ? 1 : 0);
    }

    this.rebuildDetailPane();
  }

  // Wrap buildDetailPane so we know which Phaser game objects and pixui
  // components belong to the detail pane and can tear them down on
  // re-selection. We snapshot the scene's display list and the pixui _root
  // child list, run the build, then capture the diff.
  private buildAndTrackDetailPane(heroes: readonly Hero[]): void {
    const root = (this as unknown as { _root: { _children: { component: unknown }[] } })._root;
    const dlBefore = this.children.list.length;
    const rootBefore = root._children.length;
    this.buildDetailPane(heroes);
    this._detailRawObjects = this.children.list.slice(dlBefore);
    this._detailPixuiComponents = root._children
      .slice(rootBefore)
      .map((c) => c.component);
  }

  private rebuildDetailPane(): void {
    // Tear down previous detail pane content
    for (const obj of this._detailRawObjects) {
      if (!(obj as { isDestroyed?: boolean }).isDestroyed) obj.destroy();
    }
    this._detailRawObjects = [];

    const root = (this as unknown as { _root: unknown })._root;
    for (const comp of this._detailPixuiComponents) {
      destroyPixuiSubtree(comp);
      detachPixuiChild(root, comp);
    }
    this._detailPixuiComponents = [];

    // Re-build with current state
    const heroes = listHeroes(appState.get().roster);
    this.buildAndTrackDetailPane(heroes);

    // Newly attached pixui components were never reposition'd or initialized —
    // UiScene's events.once('create', () => _root.initialize()) only fires at
    // scene boot. Cascade reposition through _root (sets _parent on the new
    // children), then initialize each new top-level component.
    if (this._detailPixuiComponents.length > 0) {
      (this as unknown as { _updateRoot: () => void })._updateRoot();
      for (const comp of this._detailPixuiComponents) {
        (comp as { initialize: () => void }).initialize();
      }
    }
  }

  private buildDetailPane(heroes: readonly Hero[]): void {
    const hero = _selectedHeroId ? heroes.find((h) => h.id === _selectedHeroId) : null;

    if (!hero) {
      this.add
        .text(700, 270, 'No heroes — visit the Tavern to recruit.', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#888888',
        })
        .setOrigin(0.5);
      return;
    }

    const classDef = CLASSES[hero.classId];
    const traitDef = TRAITS[hero.traitId];

    // Paperdoll (scale 4) — PixuiPaperdoll; positioned via scene-level frame.
    const paperdollFrame = this.insert.topLeft.frame({
      x: DETAIL_PAPERDOLL_X - 32,
      y: DETAIL_PAPERDOLL_Y - 32,
      width: 64,
      height: 64,
    });
    const paperdoll = new PixuiPaperdoll(this, heroToLoadout(hero), { scale: 4 });
    paperdollFrame.attach(paperdoll);

    // Raw Phaser text for the detail pane — per-instance colors (gold/red/gray)
    // can't be preserved via pixui TextArea per-component, so we use the raw
    // Phaser text approach (precedent: event_overlay_scene outcome lines,
    // camp_screen_scene header).

    this.add.text(DETAIL_TEXT_X, 110, hero.name, {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
    });
    this.add.text(DETAIL_TEXT_X, 132, `${classDef.name} · Lv ${hero.level}`, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#aaaaaa',
    });

    const equippedStats = applyEquipmentStats(hero.baseStats, hero.equipment);
    this.add.text(
      DETAIL_TEXT_X,
      152,
      `HP ${hero.currentHp}/${hero.maxHp} · ATK ${equippedStats.attack} · DEF ${equippedStats.defense} · SPD ${equippedStats.speed}`,
      { fontFamily: 'monospace', fontSize: '12px', color: '#dddddd' },
    );
    this.add.text(
      DETAIL_TEXT_X,
      168,
      `MND ${equippedStats.mind} · CRT ${equippedStats.crit}% · DDG ${equippedStats.dodge}%`,
      { fontFamily: 'monospace', fontSize: '12px', color: '#bbbbbb' },
    );

    const traitText = this.add.text(
      DETAIL_TEXT_X,
      188,
      `trait: ${traitDef.name} — ${traitDef.description}`,
      { fontFamily: 'monospace', fontSize: '11px', color: '#ccbbaa', wordWrap: { width: 340 } },
    );

    // Cascade: trait may wrap; properties + wounds follow dynamically.
    let cursor = traitText.y + traitText.height + 6;

    const propLines = describeRarePropertyFields(rarePropertyFields(hero.equipment));
    if (propLines.length > 0) {
      this.add.text(DETAIL_TEXT_X, cursor, 'PROPERTIES', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#bb9966',
      });
      cursor += 18;
      for (const line of propLines) {
        this.add.text(DETAIL_TEXT_X, cursor, line, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#dddddd',
        });
        cursor += 14;
      }
      cursor += 6;
    }

    let woundsCursor = Math.max(208, cursor);

    if (hero.wounds.length > 0) {
      this.add.text(DETAIL_TEXT_X, woundsCursor, 'WOUNDS', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ff6666',
      });
      woundsCursor += 18;

      for (const wound of hero.wounds) {
        const def = WOUNDS[wound.id];
        const desc = describeWoundEffect(def.effect);
        this.add.text(DETAIL_TEXT_X, woundsCursor, `${def.name} — ${desc}`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#dddddd',
        });
        woundsCursor += 14;
      }

      woundsCursor += 6;
    }

    const abilityHeaderY = Math.max(ABILITY_HEADER_Y, woundsCursor);
    const abilityBlockStartY = abilityHeaderY + ABILITY_HEADER_TO_BLOCK_GAP;

    this.add.text(ABILITY_X, abilityHeaderY, 'ABILITIES', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffcc66',
    });
    this.add.text(ABILITY_X + 80, abilityHeaderY, `· ${describeKitStatus(hero)}`, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#aaaaaa',
    });

    const { abilities: resolvedAbilities } = resolveCombatAbilities(hero);
    let yCursor = abilityBlockStartY;
    for (const abilityId of resolvedAbilities) {
      const ability = ABILITIES[abilityId];
      const desc = describeAbility(ability);

      this.add.text(ABILITY_X, yCursor, ability.name, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold',
      });
      yCursor += ABILITY_NAME_LINE_HEIGHT;

      this.add.text(ABILITY_X, yCursor, `Cast: ${desc.castLine} · Target: ${desc.targetLine}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#999999',
      });
      yCursor += ABILITY_LINE_HEIGHT;

      for (const line of desc.effectLines) {
        this.add.text(ABILITY_X, yCursor, `→ ${line}`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#dddddd',
        });
        yCursor += ABILITY_LINE_HEIGHT;
      }

      yCursor += ABILITY_BLOCK_GAP;
    }

    // --- Action buttons (only shown when not in confirm-retire state) ---
    if (!_confirmRetirePending) {
      // Equip Gear button (path A: pixui.Button — single-line label).
      this.insert.topLeft.button({
        x: DETAIL_TEXT_X + 80,
        y: 430,
        width: 140,
        height: 32,
        text: 'Equip Gear',
        onClick: () => {
          this.scene.launch('equip', { kind: 'barracks', heroId: hero.id });
          this.scene.pause();
        },
      });

      // Retire button (path A: pixui.Button — destructive single-line label).
      this.insert.topLeft.button({
        x: DETAIL_TEXT_X + 230,
        y: 430,
        width: 140,
        height: 32,
        text: 'Retire',
        onClick: () => {
          _confirmRetirePending = true;
          this.scene.restart();
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Retire confirm dialog (pixui.Dialog — pattern from blacksmith_panel_scene)
  // -------------------------------------------------------------------------

  private buildRetireDialog(hero: Hero, rosterLen: number): void {
    let warningText = `Retire ${hero.name}? Hero is gone forever. No refund.`;
    if (rosterLen - 1 < 3) {
      warningText +=
        ' Roster will drop below 3 — recruit at the Tavern before starting a run.';
    }

    // pixui.Dialog starts hidden; set visible=true immediately (Blacksmith pattern).
    const dialog: Dialog = this.insert.center.dialog({
      width: 460,
      height: 220,
    });

    dialog.insert.top.textArea({ y: 20, text: `Retire ${hero.name}?` });
    dialog.insert.top.textArea({ y: 56, text: warningText });

    // Cancel button (path A: pixui.Button)
    dialog.insert.bottom.button({
      x: -72,
      y: 12,
      width: 120,
      text: 'Cancel',
      onClick: () => {
        dialog.visible = false;
        _confirmRetirePending = false;
        this.scene.restart();
      },
    });

    // Confirm Retire button (path A: pixui.Button)
    dialog.insert.bottom.button({
      x: 72,
      y: 12,
      width: 140,
      text: 'Confirm Retire',
      onClick: () => {
        dialog.visible = false;
        _confirmRetirePending = false;
        _selectedHeroId = null;
        appState.update((s) => ({ ...s, roster: removeHero(s.roster, hero.id) }));
        this.scene.restart();
      },
    });

    dialog.visible = true;
  }

  // -------------------------------------------------------------------------
  // Close
  // -------------------------------------------------------------------------

  private close(): void {
    // Reset module-level state so reopening starts fresh.
    _selectedHeroId = null;
    _confirmRetirePending = false;
    this.scene.stop();
    this.scene.resume('camp');
  }
}
