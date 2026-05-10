import * as Phaser from 'phaser';
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
import {
  Button,
  HeroCard,
  createBitmapText,
  createDialog,
  createPanel,
  createPaperdoll,
} from '@ui/widgets';
import { appState } from './app_state';

// Module-level state survives scene.restart() across selection changes and
// retire confirmations. Reset to defaults on close.
let _selectedHeroId: string | null = null;
let _confirmRetirePending = false;

// Slot stride is computed per-level so the 2-column grid always fits inside
// LIST_PANE_H = 360 (first slot center at SLOT_Y_TOP=120, last at SLOT_Y_BOTTOM=420).
const SLOT_Y_TOP = 120;
const SLOT_Y_BOTTOM = 420;
function slotStride(cap: number): number {
  const rows = Math.ceil(cap / 2);
  if (rows <= 1) return 0;
  return (SLOT_Y_BOTTOM - SLOT_Y_TOP) / (rows - 1);
}

const PANEL_X = 20;
const PANEL_Y = 40;
const PANEL_W = 920;
const PANEL_H = 460;

// Slot column x positions (canvas absolute).
const SLOT_X_LEFT = 135;
const SLOT_X_RIGHT = 325;
const SLOT_BG_W = 184;
const SLOT_BG_H = 60;

// Detail pane content positions (canvas absolute).
const DETAIL_PAPERDOLL_X = 525;
const DETAIL_PAPERDOLL_Y = 145;
const DETAIL_TEXT_X = 575;

const ABILITY_X = 500;
const ABILITY_HEADER_Y = 215;
const ABILITY_BLOCK_START_Y = 235;
const ABILITY_HEADER_TO_BLOCK_GAP = ABILITY_BLOCK_START_Y - ABILITY_HEADER_Y;
const ABILITY_NAME_LINE_HEIGHT = 16;
const ABILITY_LINE_HEIGHT = 14;
const ABILITY_BLOCK_GAP = 6;

export class BarracksPanelScene extends Phaser.Scene {
  // Detail-pane content lives in a single Phaser Container so partial
  // rebuilds (selection click) destroy + recreate the container in one
  // call — no pixui sub-tree dirty tricks.
  private _detailContainer: Phaser.GameObjects.Container | undefined;
  private _slotBgs: { bg: Phaser.GameObjects.Rectangle; id: string }[] = [];

  constructor() {
    super('barracks_panel');
  }

  create(): void {    this._detailContainer = undefined;
    this._slotBgs = [];

    const state = appState.get();
    const heroes = listHeroes(state.roster);
    const cap = state.roster.capacity;

    // Validate selected hero still exists; reset if gone.
    if (_selectedHeroId && !heroes.find((h) => h.id === _selectedHeroId)) {
      _selectedHeroId = null;
      _confirmRetirePending = false;
    }
    if (_selectedHeroId === null && heroes.length > 0) {
      _selectedHeroId = heroes[0].id;
    }

    // Dim overlay.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    // Header (top strip).
    createBitmapText({
      scene: this,
      x: 480,
      y: 12,
      text: `Barracks · ${heroes.length} / ${cap}`,
      font: 'medium',
      size: 16,
      originX: 0.5,
    });

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

    // Barracks-upgrade button (top strip, left, conditional).
    this.buildUpgradeButton();

    // Outer panel chrome.
    createPanel({ scene: this, x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H });

    // Detail pane background — a subtle dark rect, drawn before the
    // detail container so its content renders on top.
    this.add
      .rectangle(700, 270, 440, 360, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444);

    // Slot grid (left half).
    this.buildSlotGrid(heroes, cap);

    // Detail pane content (initial build).
    this.buildDetailPane(heroes);

    // Retire confirm dialog (modal over everything else).
    if (_confirmRetirePending) {
      const hero = heroes.find((h) => h.id === _selectedHeroId);
      if (hero) this.buildRetireDialog(hero, heroes.length);
    }

    // ESC closes panel (or dismisses retire dialog).
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

  private buildUpgradeButton(): void {
    const level = appState.get().buildingLevels.barracks;
    const next = nextLevel('barracks', level);
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
        appState.update((s) => applyBuildingUpgrade(s, 'barracks'));
        _selectedHeroId = null;
        _confirmRetirePending = false;
        this.scene.restart();
      },
    });
  }

  private buildSlotGrid(heroes: readonly Hero[], cap: number): void {
    const stride = slotStride(cap);
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
    // when this hero is selected. No interactivity — clicks go through the
    // HeroCard's own onClick.
    const isSelected = hero.id === _selectedHeroId;
    const bg = this.add
      .rectangle(x, y, SLOT_BG_W, slotBgH, 0x000000, 0)
      .setStrokeStyle(2, 0xffcc66, isSelected ? 1 : 0);
    this._slotBgs.push({ bg, id: hero.id });

    new HeroCard({
      scene: this,
      x,
      y,
      hero,
      size: 'small',
      onClick: () => this.selectHero(hero.id),
    });
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

  // Partial update on hero selection: just slot strokes + detail rebuild.
  private selectHero(id: string): void {
    if (_selectedHeroId === id) return;
    _selectedHeroId = id;
    _confirmRetirePending = false;

    for (const slot of this._slotBgs) {
      slot.bg.setStrokeStyle(2, 0xffcc66, slot.id === id ? 1 : 0);
    }

    this.rebuildDetailPane();
  }

  private rebuildDetailPane(): void {
    if (this._detailContainer) {
      this._detailContainer.destroy(true);
      this._detailContainer = undefined;
    }
    const heroes = listHeroes(appState.get().roster);
    this.buildDetailPane(heroes);
  }

  private buildDetailPane(heroes: readonly Hero[]): void {
    const container = this.add.container(0, 0);
    this._detailContainer = container;

    const hero = _selectedHeroId ? heroes.find((h) => h.id === _selectedHeroId) : null;
    if (!hero) {
      container.add(
        this.add
          .text(700, 270, 'No heroes - visit the Tavern to recruit.', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#888888',
          })
          .setOrigin(0.5),
      );
      return;
    }

    const classDef = CLASSES[hero.classId];
    const traitDef = TRAITS[hero.traitId];

    // Paperdoll (scale 4) — at canvas-absolute coords.
    container.add(
      createPaperdoll({
        scene: this,
        x: DETAIL_PAPERDOLL_X,
        y: DETAIL_PAPERDOLL_Y,
        loadout: heroToLoadout(hero),
        scale: 4,
      }),
    );

    // Raw Phaser text — per-instance colors.
    container.add(
      this.add.text(DETAIL_TEXT_X, 110, hero.name, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      }),
    );
    container.add(
      this.add.text(DETAIL_TEXT_X, 132, `${classDef.name} · Lv ${hero.level}`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#aaaaaa',
      }),
    );

    const equippedStats = applyEquipmentStats(hero.baseStats, hero.equipment);
    container.add(
      this.add.text(
        DETAIL_TEXT_X,
        152,
        `HP ${hero.currentHp}/${hero.maxHp} · ATK ${equippedStats.attack} · DEF ${equippedStats.defense} · SPD ${equippedStats.speed}`,
        { fontFamily: 'monospace', fontSize: '12px', color: '#dddddd' },
      ),
    );
    container.add(
      this.add.text(
        DETAIL_TEXT_X,
        168,
        `MND ${equippedStats.mind} · CRT ${equippedStats.crit}% · DDG ${equippedStats.dodge}%`,
        { fontFamily: 'monospace', fontSize: '12px', color: '#bbbbbb' },
      ),
    );

    const traitText = this.add.text(
      DETAIL_TEXT_X,
      188,
      `trait: ${traitDef.name} - ${traitDef.description}`,
      { fontFamily: 'monospace', fontSize: '11px', color: '#ccbbaa', wordWrap: { width: 340 } },
    );
    container.add(traitText);

    let cursor = traitText.y + traitText.height + 6;

    const propLines = describeRarePropertyFields(rarePropertyFields(hero.equipment));
    if (propLines.length > 0) {
      container.add(
        this.add.text(DETAIL_TEXT_X, cursor, 'PROPERTIES', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#bb9966',
        }),
      );
      cursor += 18;
      for (const line of propLines) {
        container.add(
          this.add.text(DETAIL_TEXT_X, cursor, line, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#dddddd',
          }),
        );
        cursor += 14;
      }
      cursor += 6;
    }

    let woundsCursor = Math.max(208, cursor);

    if (hero.wounds.length > 0) {
      container.add(
        this.add.text(DETAIL_TEXT_X, woundsCursor, 'WOUNDS', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ff6666',
        }),
      );
      woundsCursor += 18;

      for (const wound of hero.wounds) {
        const def = WOUNDS[wound.id];
        const desc = describeWoundEffect(def.effect);
        container.add(
          this.add.text(DETAIL_TEXT_X, woundsCursor, `${def.name} - ${desc}`, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#dddddd',
          }),
        );
        woundsCursor += 14;
      }
      woundsCursor += 6;
    }

    const abilityHeaderY = Math.max(ABILITY_HEADER_Y, woundsCursor);
    const abilityBlockStartY = abilityHeaderY + ABILITY_HEADER_TO_BLOCK_GAP;

    container.add(
      this.add.text(ABILITY_X, abilityHeaderY, 'ABILITIES', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffcc66',
      }),
    );
    container.add(
      this.add.text(ABILITY_X + 80, abilityHeaderY, `· ${describeKitStatus(hero)}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#aaaaaa',
      }),
    );

    const { abilities: resolvedAbilities } = resolveCombatAbilities(hero);
    let yCursor = abilityBlockStartY;
    for (const abilityId of resolvedAbilities) {
      const ability = ABILITIES[abilityId];
      const desc = describeAbility(ability);

      container.add(
        this.add.text(ABILITY_X, yCursor, ability.name, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffffff',
          fontStyle: 'bold',
        }),
      );
      yCursor += ABILITY_NAME_LINE_HEIGHT;

      container.add(
        this.add.text(ABILITY_X, yCursor, `Cast: ${desc.castLine} · Target: ${desc.targetLine}`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#999999',
        }),
      );
      yCursor += ABILITY_LINE_HEIGHT;

      for (const line of desc.effectLines) {
        container.add(
          this.add.text(ABILITY_X, yCursor, `> ${line}`, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#dddddd',
          }),
        );
        yCursor += ABILITY_LINE_HEIGHT;
      }

      yCursor += ABILITY_BLOCK_GAP;
    }

    // Action buttons (only when not in retire-confirm). Button widget creates
    // game objects that aren't in our container — track them separately and
    // destroy in rebuildDetailPane.
    if (!_confirmRetirePending) {
      const equipBtn = new Button({
        scene: this,
        x: DETAIL_TEXT_X + 80,
        y: 430,
        width: 140,
        height: 32,
        text: 'Equip Gear',
        font: 'medium',
        fontSize: 16,
        onClick: () => {
          this.scene.launch('equip', { kind: 'barracks', heroId: hero.id });
          this.scene.pause();
        },
      });
      container.add(equipBtn.gameObjects);

      const retireBtn = new Button({
        scene: this,
        x: DETAIL_TEXT_X + 230,
        y: 430,
        width: 140,
        height: 32,
        text: 'Retire',
        font: 'medium',
        fontSize: 16,
        onClick: () => {
          _confirmRetirePending = true;
          this.scene.restart();
        },
      });
      container.add(retireBtn.gameObjects);
    }
  }

  private buildRetireDialog(hero: Hero, rosterLen: number): void {
    let warningText = `Retire ${hero.name}? Hero is gone forever. No refund.`;
    if (rosterLen - 1 < 3) {
      warningText +=
        ' Roster will drop below 3 - recruit at the Tavern before starting a run.';
    }

    const dialog = createDialog({ scene: this, width: 460, height: 220 });
    const cx = dialog.frameX + dialog.width / 2;

    dialog.container.add(
      createBitmapText({
        scene: this,
        x: cx,
        y: dialog.frameY + 30,
        text: `Retire ${hero.name}?`,
        font: 'medium',
        size: 16,
        originX: 0.5,
      }),
    );
    dialog.container.add(
      this.add
        .text(cx, dialog.frameY + 80, warningText, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#dddddd',
          wordWrap: { width: dialog.width - 32 },
          align: 'center',
        })
        .setOrigin(0.5, 0),
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
        _confirmRetirePending = false;
        this.scene.restart();
      },
    });
    dialog.container.add(cancelBtn.gameObjects);

    const confirmBtn = new Button({
      scene: this,
      x: dialog.frameX + dialog.width - 200,
      y: dialog.frameY + dialog.height - 56,
      width: 140,
      height: 32,
      text: 'Confirm Retire',
      font: 'medium',
      fontSize: 16,
      onClick: () => {
        _confirmRetirePending = false;
        _selectedHeroId = null;
        appState.update((s) => ({ ...s, roster: removeHero(s.roster, hero.id) }));
        this.scene.restart();
      },
    });
    dialog.container.add(confirmBtn.gameObjects);
  }

  private close(): void {
    _selectedHeroId = null;
    _confirmRetirePending = false;
    this.scene.stop();
    this.scene.resume('camp');
  }
}
