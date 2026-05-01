import * as Phaser from 'phaser';
import type { Stats } from '../combat/types';
import { BASE_ITEMS } from '../data/items';
import type { HeroEquipment, Item, ItemSlot } from '../data/types';
import type { Hero } from '../heroes/hero';
import { itemAffixDescription, itemDisplayName, previewStats, type StatPreview } from '../items/selectors';
import { applyEquipmentStats } from '../items/stats';
import { equipFromPack, unequipToPack } from '../run/equip_run';
import type { RunState } from '../run/run_state';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 920;
const PANEL_H = 460;

const LEFT_PANE_CX = 185;
const LEFT_PANE_W = 260;
const LEFT_PANE_H = 360;
const PARTY_ROW_Y = [180, 270, 360] as const;
const PARTY_ROW_H = 90;

const RIGHT_PANE_CX = 635;
const RIGHT_PANE_W = 640;
const RIGHT_PANE_H = 360;

const SLOTS: readonly ItemSlot[] = ['weapon', 'shield', 'outfit', 'hat'];
const SLOT_SQUARE_SIZE = 56;
const SLOT_STRIP_Y = 235;
const SLOT_STRIP_X = [475, 565, 655, 745] as const;

const RARITY_COLOR: Record<'common' | 'uncommon' | 'rare', number> = {
  common: 0xcccccc,
  uncommon: 0x4488ff,
  rare: 0xffcc66,
};

const SELECTION_GOLD = 0xffcc66;

const PACK_LIST_X_LEFT = 360;
const PACK_LIST_Y_START = 320;
const PACK_LIST_ROW_H = 32;
const PACK_LIST_VISIBLE_ROWS = 4;
const PACK_PAGE_ARROW_X = 905;

const BUTTON_Y = 440;
const BUTTON_W = 240;
const BUTTON_H = 32;
const BUTTON_X = 800;

const SLOT_TAG: Record<ItemSlot, string> = {
  weapon: '[w]',
  shield: '[s]',
  outfit: '[o]',
  hat:    '[h]',
};

const HEADER_X_LEFT = 350;
const HEADER_NAME_Y = 110;
const HEADER_STATS_CURRENT_Y = 132;
const HEADER_STATS_PREVIEW_Y = 158;
const PREVIEW_ARROW_Y = 145;

type Selection =
  | { kind: 'none' }
  | { kind: 'pack-item'; itemId: string }
  | { kind: 'equipped-slot'; slot: ItemSlot };

export class EquipPanelScene extends Phaser.Scene {
  private selectedHeroIndex: number = 0;
  private selection: Selection = { kind: 'none' };
  private packPageStart: number = 0;
  private contentContainer!: Phaser.GameObjects.Container;

  private returnTo: string = 'camp_screen';

  constructor() {
    super('equip_panel');
  }

  init(data: { returnTo?: string } = {}): void {
    this.returnTo = data.returnTo ?? 'camp_screen';
  }

  create(): void {
    this.selectedHeroIndex = 0;
    this.selection = { kind: 'none' };
    this.packPageStart = 0;

    this.buildOverlayAndPanel();
    this.buildCloseButton();
    this.contentContainer = this.add.container(0, 0);
    this.repaint();

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private buildOverlayAndPanel(): void {
    const overlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0);
    overlay.setInteractive();
    overlay.on('pointerdown', () => this.close());

    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666)
      .setInteractive();

    this.add
      .text(PANEL_CX, 60, 'Equip', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
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

  private repaint(): void {
    this.contentContainer.removeAll(true);
    const run = appState.get().runState;
    // Equip panel is reachable from camp_screen (post-boss) and from in-dungeon
    // overlays (e.g. shop's "Manage Gear"). Both states have valid party + pack.
    if (!run || (run.status !== 'camp_screen' && run.status !== 'in_dungeon')) return;

    this.buildLeftPane(run);
    this.buildRightPane(run);
  }

  private buildLeftPane(run: RunState): void {
    this.contentContainer.add(
      this.add
        .rectangle(LEFT_PANE_CX, PANEL_CY, LEFT_PANE_W, LEFT_PANE_H, 0x1a1a1a)
        .setStrokeStyle(1, 0x444444),
    );

    for (let i = 0; i < run.party.length; i++) {
      this.buildHeroRow(run.party[i], i, PARTY_ROW_Y[i]);
    }
  }

  private buildHeroRow(hero: Hero, index: number, y: number): void {
    const isSelected = this.selectedHeroIndex === index;
    const bg = this.add
      .rectangle(LEFT_PANE_CX, y, LEFT_PANE_W - 20, PARTY_ROW_H - 4, 0x222222)
      .setStrokeStyle(2, isSelected ? SELECTION_GOLD : 0x444444);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      this.selectedHeroIndex = index;
      this.selection = { kind: 'none' };
      this.packPageStart = 0;
      this.repaint();
    });
    this.contentContainer.add(bg);

    this.contentContainer.add(
      this.add.text(LEFT_PANE_CX - LEFT_PANE_W / 2 + 14, y - 28, hero.name, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      }),
    );
    this.contentContainer.add(
      this.add.text(LEFT_PANE_CX - LEFT_PANE_W / 2 + 14, y - 12, `${hero.classId} · HP ${hero.currentHp}/${hero.maxHp}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#aaaaaa',
      }),
    );

    // Mini-equipment-strip: 4 small squares
    const stripY = y + 22;
    const stripStartX = LEFT_PANE_CX - LEFT_PANE_W / 2 + 20;
    for (let s = 0; s < SLOTS.length; s++) {
      const slot = SLOTS[s];
      const item = hero.equipment[slot];
      const sx = stripStartX + s * 26;
      this.contentContainer.add(
        this.add
          .rectangle(sx, stripY, 22, 22, 0x111111)
          .setStrokeStyle(1, item ? RARITY_COLOR[item.rarity] : 0x333333),
      );
    }
  }

  private buildRightPane(run: RunState): void {
    this.contentContainer.add(
      this.add
        .rectangle(RIGHT_PANE_CX, PANEL_CY, RIGHT_PANE_W, RIGHT_PANE_H, 0x1a1a1a)
        .setStrokeStyle(1, 0x444444),
    );
    this.buildZoneOne(run);
    this.buildSlotStrip(run);
    this.buildPackListAndButton(run);
  }

  private buildZoneOne(run: RunState): void {
    const hero = run.party[this.selectedHeroIndex];
    if (!hero) return;

    this.contentContainer.add(
      this.add.text(HEADER_X_LEFT, HEADER_NAME_Y, `${hero.name} ◆ ${hero.classId}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      }),
    );

    const preview = this.computePreviewIfSelected(run, hero);
    const currentLine = this.formatStatsLine(preview ? preview.currentStats : this.computeEquipmentStats(hero));
    this.contentContainer.add(
      this.add.text(HEADER_X_LEFT, HEADER_STATS_CURRENT_Y, currentLine, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#dddddd',
      }),
    );

    if (preview) {
      this.contentContainer.add(
        this.add.text(HEADER_X_LEFT + 100, PREVIEW_ARROW_Y, '↓', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#888888',
        }),
      );
      this.buildPreviewStatsLine(preview);
    }
  }

  private computePreviewIfSelected(run: RunState, hero: Hero): StatPreview | null {
    const sel = this.selection;
    if (sel.kind === 'pack-item') {
      const item = run.pack.items.find((i) => i.id === sel.itemId);
      if (item) return previewStats(hero, item, item.slot);
    }
    if (sel.kind === 'equipped-slot') {
      return this.previewUnequipStats(hero, sel.slot);
    }
    return null;
  }

  private previewUnequipStats(hero: Hero, slot: ItemSlot): StatPreview {
    const item = hero.equipment[slot];
    const currentStats = this.computeEquipmentStats(hero);
    if (!item) {
      return { currentStats, previewStats: currentStats, deltas: {} };
    }
    const equipmentWithoutSlot: HeroEquipment = { ...hero.equipment };
    if (slot !== 'weapon') {
      delete equipmentWithoutSlot[slot];
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

  private computeEquipmentStats(hero: Hero): Stats {
    return applyEquipmentStats(hero.baseStats, hero.equipment);
  }

  private formatStatsLine(stats: Stats): string {
    return `HP ${stats.hp}  ATK ${stats.attack}  DEF ${stats.defense}  SPD ${stats.speed}  MND ${stats.mind}  CRT ${stats.crit}%  DDG ${stats.dodge}%`;
  }

  private buildPreviewStatsLine(preview: StatPreview): void {
    const tokens: { text: string; color: string }[] = [];
    const keys: (keyof Stats)[] = ['hp', 'attack', 'defense', 'speed', 'mind', 'crit', 'dodge'];
    const labels: Record<keyof Stats, string> = {
      hp: 'HP', attack: 'ATK', defense: 'DEF', speed: 'SPD', mind: 'MND',
      crit: 'CRT', dodge: 'DDG',
    };
    const suffix: Partial<Record<keyof Stats, string>> = { crit: '%', dodge: '%' };
    for (const k of keys) {
      const delta = preview.deltas[k];
      let color = '#dddddd';
      if (delta !== undefined && delta > 0) color = '#44cc44';
      else if (delta !== undefined && delta < 0) color = '#cc4444';
      tokens.push({ text: `${labels[k]} ${preview.previewStats[k]}${suffix[k] ?? ''}`, color });
    }
    let xCursor = HEADER_X_LEFT;
    for (const tok of tokens) {
      const t = this.add.text(xCursor, HEADER_STATS_PREVIEW_Y, tok.text, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: tok.color,
      });
      this.contentContainer.add(t);
      xCursor += t.width + 16;
    }
  }

  private buildSlotStrip(run: RunState): void {
    const hero = run.party[this.selectedHeroIndex];
    if (!hero) return;
    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const item = hero.equipment[slot];
      this.buildSlotSquare(slot, item, SLOT_STRIP_X[i]);
    }
  }

  private buildSlotSquare(slot: ItemSlot, item: Item | undefined, x: number): void {
    const isSelected =
      this.selection.kind === 'equipped-slot' && this.selection.slot === slot;
    const isWeapon = slot === 'weapon';
    const borderColor = item ? RARITY_COLOR[item.rarity] : 0x444444;
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

    if (item && !isWeapon) {
      square.setInteractive({ useHandCursor: true });
      square.on('pointerdown', () => {
        if (this.selection.kind === 'equipped-slot' && this.selection.slot === slot) {
          this.commit();
          return;
        }
        this.selection = { kind: 'equipped-slot', slot };
        this.repaint();
      });
    }
    this.contentContainer.add(square);
  }

  private buildPackListAndButton(run: RunState): void {
    const itemCount = run.pack.items.length;
    this.contentContainer.add(
      this.add.text(PACK_LIST_X_LEFT, PACK_LIST_Y_START - 18, `Pack (${itemCount})`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#cccccc',
      }),
    );

    const pageItems = run.pack.items.slice(
      this.packPageStart,
      this.packPageStart + PACK_LIST_VISIBLE_ROWS,
    );

    if (pageItems.length === 0) {
      this.contentContainer.add(
        this.add.text(PACK_LIST_X_LEFT, PACK_LIST_Y_START + 20, 'Pack is empty.', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#888888',
        }),
      );
    } else {
      for (let i = 0; i < pageItems.length; i++) {
        this.buildPackRow(pageItems[i], i);
      }
    }

    if (run.pack.items.length > PACK_LIST_VISIBLE_ROWS) {
      this.buildPaginationArrows(run);
    }

    this.buildBottomButton(run);
  }

  private buildPackRow(item: Item, indexInPage: number): void {
    const y = PACK_LIST_Y_START + indexInPage * PACK_LIST_ROW_H;
    const isSelected =
      this.selection.kind === 'pack-item' && this.selection.itemId === item.id;

    const bg = this.add
      .rectangle(PACK_LIST_X_LEFT + 250, y + 12, 510, PACK_LIST_ROW_H - 4,
        isSelected ? 0x2a2418 : 0x1a1a1a)
      .setStrokeStyle(1, isSelected ? SELECTION_GOLD : 0x222222);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.onPackRowTap(item));
    this.contentContainer.add(bg);

    this.contentContainer.add(
      this.add.text(PACK_LIST_X_LEFT + 8, y + 4, SLOT_TAG[item.slot], {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#888888',
      }),
    );

    this.contentContainer.add(
      this.add.text(PACK_LIST_X_LEFT + 38, y + 2,
        `${itemDisplayName(item)}  [${item.rarity}]`,
      {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: this.rarityHex(item.rarity),
      }),
    );

    const affixDesc = itemAffixDescription(item);
    if (affixDesc.length > 0) {
      this.contentContainer.add(
        this.add.text(PACK_LIST_X_LEFT + 38, y + 18, affixDesc, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#999999',
        }),
      );
    }
  }

  private rarityHex(rarity: 'common' | 'uncommon' | 'rare'): string {
    return rarity === 'common' ? '#cccccc' : rarity === 'uncommon' ? '#4488ff' : '#ffcc66';
  }

  private buildPaginationArrows(run: RunState): void {
    const canPageUp = this.packPageStart > 0;
    const canPageDown = this.packPageStart + PACK_LIST_VISIBLE_ROWS < run.pack.items.length;

    const upArrow = this.add
      .text(PACK_PAGE_ARROW_X, PACK_LIST_Y_START + 6, '▲', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: canPageUp ? '#cccccc' : '#444444',
      })
      .setOrigin(0.5);
    if (canPageUp) {
      upArrow.setInteractive({ useHandCursor: true });
      upArrow.on('pointerdown', () => {
        this.packPageStart = Math.max(0, this.packPageStart - PACK_LIST_VISIBLE_ROWS);
        this.repaint();
      });
    }
    this.contentContainer.add(upArrow);

    const downArrow = this.add
      .text(PACK_PAGE_ARROW_X, PACK_LIST_Y_START + 110, '▼', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: canPageDown ? '#cccccc' : '#444444',
      })
      .setOrigin(0.5);
    if (canPageDown) {
      downArrow.setInteractive({ useHandCursor: true });
      downArrow.on('pointerdown', () => {
        this.packPageStart += PACK_LIST_VISIBLE_ROWS;
        this.repaint();
      });
    }
    this.contentContainer.add(downArrow);
  }

  private buildBottomButton(run: RunState): void {
    const enabled = this.selection.kind !== 'none';
    const label = this.buttonLabel(run);

    const bg = this.add
      .rectangle(BUTTON_X, BUTTON_Y, BUTTON_W, BUTTON_H,
        enabled ? 0x3a2a1a : 0x222222)
      .setStrokeStyle(2, enabled ? 0xcc8844 : 0x444444);
    this.contentContainer.add(bg);
    this.contentContainer.add(
      this.add.text(BUTTON_X, BUTTON_Y, label, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: enabled ? '#ffffff' : '#666666',
      }).setOrigin(0.5),
    );
    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.commit());
    }
  }

  private buttonLabel(run: RunState): string {
    const sel = this.selection;
    if (sel.kind === 'pack-item') {
      const item = run.pack.items.find((i) => i.id === sel.itemId);
      if (item) return `Equip ${itemDisplayName(item)}`;
    }
    if (sel.kind === 'equipped-slot') {
      const hero = run.party[this.selectedHeroIndex];
      const item = hero?.equipment[sel.slot];
      if (item) return `Unequip ${itemDisplayName(item)}`;
    }
    return 'Equip';
  }

  private onPackRowTap(item: Item): void {
    if (this.selection.kind === 'pack-item' && this.selection.itemId === item.id) {
      this.commit();
      return;
    }
    this.selection = { kind: 'pack-item', itemId: item.id };
    this.repaint();
  }

  private commit(): void {
    if (this.selection.kind === 'pack-item') {
      const itemId = this.selection.itemId;
      const heroIdx = this.selectedHeroIndex;
      const run = appState.get().runState!;
      const item = run.pack.items.find((i) => i.id === itemId);
      if (!item) {
        this.selection = { kind: 'none' };
        this.repaint();
        return;
      }
      const slot = item.slot;
      appState.update((s) => ({
        ...s,
        runState: equipFromPack(s.runState!, heroIdx, itemId, slot),
      }));
    } else if (this.selection.kind === 'equipped-slot') {
      const slot = this.selection.slot;
      const heroIdx = this.selectedHeroIndex;
      appState.update((s) => ({
        ...s,
        runState: unequipToPack(s.runState!, heroIdx, slot),
      }));
    }
    this.selection = { kind: 'none' };
    this.repaint();
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume(this.returnTo);
  }
}
