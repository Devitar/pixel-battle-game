# Equip-from-stash at Barracks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a path for moving items between the camp stash and a hero's equipment. Player opens Barracks → selects a hero → clicks "Equip Gear" → a new scene shows the hero's slot strip with a slot-filtered stash item picker, stat preview, and 2-click commit. Closes the gdd §6 hole where banked stash items had no path onto camp heroes.

**Architecture:** Four sequential tasks.

1. **Core helpers** — `src/items/equip_camp.ts` with `equipFromStash` / `unequipToStash`; pure TS, mirrors `src/run/equip_run.ts`'s shape but operates on `(roster, stash)`. Vitest cases.
2. **Phaser scene** — `src/scenes/barracks_equip_scene.ts` with paperdoll + slot strip + slot-filtered stash picker + stat preview. 2-click commit.
3. **Barracks integration** — Add "Equip Gear" button to the detail pane; add a RESUME handler so post-equip state shows on return.
4. **Wire-up + verification** — Register the new scene in `main.ts`; typecheck/test/build; manual-play checklist.

**Tech Stack:** TypeScript, Vitest (data layer); Phaser 3 (scene). Core helpers must NOT import Phaser; the scene may.

**Spec:** `docs/superpowers/specs/2026-04-30-equip-from-stash-design.md`. Read before starting.

---

## Task 1: Core helpers (`equip_camp.ts`)

Pure-TS module with two functions plus a private `recomputeMaxHp` helper. Mirrors `src/run/equip_run.ts`'s shape but operates on `(roster, stash)` instead of `runState`. TDD: tests first.

**Files:**
- Create: `src/items/equip_camp.ts`
- Create: `src/items/__tests__/equip_camp.test.ts`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL tests pass (1307 as of the prior task).

- [ ] **Step 1.2: Write the failing test file**

Create `src/items/__tests__/equip_camp.test.ts` with this exact content:

```typescript
import { describe, expect, it } from 'vitest';
import { addHero, createRoster } from '../../camp/roster';
import { addItems, createStash } from '../../camp/stash';
import type { Item } from '../../data/types';
import { createHero } from '../../heroes/hero';
import { equipFromStash, unequipToStash } from '../equip_camp';

function makeOutfitItem(id: string): Item {
  return {
    id,
    baseId: 'outfit_cloth',
    slot: 'outfit',
    rarity: 'common',
    affixes: [],
    floorRolledAt: 1,
  };
}

function makeShieldItem(id: string): Item {
  return {
    id,
    baseId: 'shield_basic',
    slot: 'shield',
    rarity: 'common',
    affixes: [],
    floorRolledAt: 1,
  };
}

function makeSwordItem(id: string): Item {
  return {
    id,
    baseId: 'sword_basic',
    slot: 'weapon',
    weaponType: 'sword',
    rarity: 'common',
    affixes: [],
    floorRolledAt: 1,
  };
}

function setup(items: Item[] = []) {
  const hero = createHero('knight', 'K', 'h0', 'quick', 'body1');
  const roster = addHero(createRoster(), hero);
  const stash = addItems(createStash(), items);
  return { hero, roster, stash };
}

describe('equipFromStash', () => {
  it('equips a stash item to an empty slot — hero gains item, stash loses it', () => {
    const outfit = makeOutfitItem('o1');
    const { hero, roster, stash } = setup([outfit]);
    expect(hero.equipment.outfit).toBeUndefined();

    const result = equipFromStash(roster, stash, hero.id, outfit.id, 'outfit');

    const updatedHero = result.roster.heroes.find((h) => h.id === hero.id)!;
    expect(updatedHero.equipment.outfit).toEqual(outfit);
    expect(result.stash.items.find((i) => i.id === outfit.id)).toBeUndefined();
  });

  it('swap: when slot is filled, displaced item returns to stash', () => {
    const outfit1 = makeOutfitItem('o1');
    const outfit2 = makeOutfitItem('o2');
    const { hero, roster, stash } = setup([outfit2]);
    // Pre-equip outfit1 onto hero before testing swap.
    const preResult = equipFromStash(roster, addItems(stash, [outfit1]), hero.id, outfit1.id, 'outfit');
    // Now swap to outfit2.
    const result = equipFromStash(preResult.roster, preResult.stash, hero.id, outfit2.id, 'outfit');

    const updatedHero = result.roster.heroes.find((h) => h.id === hero.id)!;
    expect(updatedHero.equipment.outfit?.id).toBe('o2');
    expect(result.stash.items.find((i) => i.id === 'o1')).toBeDefined();
    expect(result.stash.items.find((i) => i.id === 'o2')).toBeUndefined();
  });

  it('recomputes maxHp and clamps currentHp', () => {
    const outfit = makeOutfitItem('o1');
    const { hero, roster, stash } = setup([outfit]);
    const initialMaxHp = hero.maxHp;

    const result = equipFromStash(roster, stash, hero.id, outfit.id, 'outfit');
    const updatedHero = result.roster.heroes.find((h) => h.id === hero.id)!;

    // outfit_cloth grants +6 hp per BASE_ITEM_STATS.
    expect(updatedHero.maxHp).toBe(initialMaxHp + 6);
    // currentHp was at full; should still be ≤ maxHp.
    expect(updatedHero.currentHp).toBeLessThanOrEqual(updatedHero.maxHp);
  });

  it('throws on missing hero', () => {
    const outfit = makeOutfitItem('o1');
    const { roster, stash } = setup([outfit]);
    expect(() => equipFromStash(roster, stash, 'no-such-hero', outfit.id, 'outfit')).toThrow();
  });

  it('throws on missing item', () => {
    const { hero, roster, stash } = setup();
    expect(() => equipFromStash(roster, stash, hero.id, 'no-such-item', 'outfit')).toThrow();
  });

  it('throws on slot mismatch', () => {
    const outfit = makeOutfitItem('o1');
    const { hero, roster, stash } = setup([outfit]);
    expect(() => equipFromStash(roster, stash, hero.id, outfit.id, 'shield')).toThrow();
  });
});

describe('unequipToStash', () => {
  it('non-weapon slot: hero loses item, stash gains it', () => {
    const shield = makeShieldItem('s1');
    const { hero, roster, stash } = setup([shield]);
    const equipped = equipFromStash(roster, stash, hero.id, shield.id, 'shield');

    const result = unequipToStash(equipped.roster, equipped.stash, hero.id, 'shield');

    const updatedHero = result.roster.heroes.find((h) => h.id === hero.id)!;
    expect(updatedHero.equipment.shield).toBeUndefined();
    expect(result.stash.items.find((i) => i.id === 's1')).toBeDefined();
  });

  it('weapon slot throws', () => {
    const { hero, roster, stash } = setup();
    expect(() => unequipToStash(roster, stash, hero.id, 'weapon')).toThrow();
  });

  it('empty slot is a no-op (returns same roster + stash)', () => {
    // Knight starts with no outfit equipped.
    const { hero, roster, stash } = setup();
    const result = unequipToStash(roster, stash, hero.id, 'outfit');
    expect(result.roster).toBe(roster);
    expect(result.stash).toBe(stash);
  });

  it('throws on missing hero', () => {
    const { roster, stash } = setup();
    expect(() => unequipToStash(roster, stash, 'no-such-hero', 'shield')).toThrow();
  });
});

describe('roundtrip', () => {
  it('equip then unequip returns the item to stash', () => {
    const shield = makeShieldItem('s1');
    const { hero, roster, stash } = setup([shield]);

    const equipped = equipFromStash(roster, stash, hero.id, shield.id, 'shield');
    const unequipped = unequipToStash(equipped.roster, equipped.stash, hero.id, 'shield');

    const finalHero = unequipped.roster.heroes.find((h) => h.id === hero.id)!;
    // Knight starts with a starter shield; after equip+unequip the stash should
    // contain BOTH the original starter shield (displaced by the swap) AND the
    // 's1' stash shield (which got unequipped). Finds at least the s1 we put in.
    expect(finalHero.equipment.shield).toBeUndefined();
    expect(unequipped.stash.items.find((i) => i.id === 's1')).toBeDefined();
  });
});
```

**Note on the roundtrip test:** Knight's starter loadout includes a shield, so the first `equipFromStash` swap displaces the starter shield to stash. After unequipping, the stash holds two shields: the starter (displaced) and `s1` (re-unequipped). The test asserts the `s1` returns and the slot is empty — sufficient invariants.

- [ ] **Step 1.3: Run the test file and verify it fails**

Run: `npx vitest run src/items/__tests__/equip_camp.test.ts`

Expected: FAIL — `Cannot find module '../equip_camp'`.

- [ ] **Step 1.4: Implement `src/items/equip_camp.ts`**

Create `src/items/equip_camp.ts` with this exact content:

```typescript
import { CLASSES } from '../data/classes';
import { TRAITS } from '../data/traits';
import type { ItemSlot } from '../data/types';
import { computeMaxHp, type Hero } from '../heroes/hero';
import { type Roster, updateHero } from '../camp/roster';
import { addItems, removeItem, type Stash } from '../camp/stash';
import { equip, unequip } from './equip';

export function equipFromStash(
  roster: Roster,
  stash: Stash,
  heroId: string,
  itemId: string,
  slot: ItemSlot,
): { roster: Roster; stash: Stash } {
  const hero = roster.heroes.find((h) => h.id === heroId);
  if (!hero) throw new Error(`equipFromStash: heroId '${heroId}' not in roster`);
  const stashItem = stash.items.find((i) => i.id === itemId);
  if (!stashItem) throw new Error(`equipFromStash: itemId '${itemId}' not in stash`);
  if (stashItem.slot !== slot) {
    throw new Error(
      `equipFromStash: item.slot '${stashItem.slot}' does not match target '${slot}'`,
    );
  }

  const { hero: nextHero, displaced } = equip(hero, stashItem, slot);
  const clampedHero = recomputeMaxHp(nextHero);

  let nextStash = removeItem(stash, itemId);
  if (displaced !== undefined) nextStash = addItems(nextStash, [displaced]);

  return { roster: updateHero(roster, clampedHero), stash: nextStash };
}

export function unequipToStash(
  roster: Roster,
  stash: Stash,
  heroId: string,
  slot: ItemSlot,
): { roster: Roster; stash: Stash } {
  if (slot === 'weapon') {
    throw new Error('unequipToStash: cannot unequip the weapon slot');
  }
  const hero = roster.heroes.find((h) => h.id === heroId);
  if (!hero) throw new Error(`unequipToStash: heroId '${heroId}' not in roster`);

  const { hero: nextHero, item } = unequip(hero, slot);
  if (item === undefined) return { roster, stash };

  const clampedHero = recomputeMaxHp(nextHero);
  return {
    roster: updateHero(roster, clampedHero),
    stash: addItems(stash, [item]),
  };
}

function recomputeMaxHp(hero: Hero): Hero {
  const classDef = CLASSES[hero.classId];
  const trait = TRAITS[hero.traitId];
  const newMaxHp = computeMaxHp(classDef.baseStats.hp, trait, hero.equipment);
  return {
    ...hero,
    maxHp: newMaxHp,
    currentHp: Math.min(hero.currentHp, newMaxHp),
  };
}
```

- [ ] **Step 1.5: Run the test file and verify it passes**

Run: `npx vitest run src/items/__tests__/equip_camp.test.ts`

Expected: PASS — all 11 cases green.

- [ ] **Step 1.6: Run the full test suite**

Run: `npm test`

Expected: PASS for the whole suite. Test count up by ~11 from Step 1.1's baseline.

- [ ] **Step 1.7: Run typecheck**

Run: `npx tsc --noEmit`

Expected: clean exit.

- [ ] **Step 1.8: Commit**

```bash
git add src/items/equip_camp.ts src/items/__tests__/equip_camp.test.ts
git commit -m "Items equip_camp core: equipFromStash + unequipToStash (Cluster B · 12)"
```

---

## Task 2: Phaser scene (`barracks_equip_scene.ts`)

The equip-from-stash scene. Reads roster/stash from appState; uses Task 1's core helpers for the swap. Layout reuses constants from `equip_panel_scene.ts` where they apply. 2-click commit (highlight then commit).

**Files:**
- Create: `src/scenes/barracks_equip_scene.ts`

- [ ] **Step 2.1: Create the scene file**

Create `src/scenes/barracks_equip_scene.ts` with this exact content:

```typescript
import * as Phaser from 'phaser';
import { CLASSES } from '../data/classes';
import { BASE_ITEMS } from '../data/items';
import type { Item, ItemSlot, Rarity } from '../data/types';
import { equipFromStash, unequipToStash } from '../items/equip_camp';
import { itemAffixDescription, itemDisplayName, previewStats, type StatPreview } from '../items/selectors';
import { applyEquipmentStats } from '../items/stats';
import type { Hero } from '../heroes/hero';
import { heroToLoadout } from '../render/hero_loadout';
import { Paperdoll } from '../render/paperdoll';
import type { Stats } from '../combat/types';
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
```

- [ ] **Step 2.2: Run typecheck**

Run: `npx tsc --noEmit`

Expected: clean exit. The scene file uses imports from existing modules — `equipFromStash`/`unequipToStash` from Task 1, `previewStats`/`itemDisplayName`/`itemAffixDescription` from `items/selectors`, `applyEquipmentStats` from `items/stats`, `Paperdoll` + `heroToLoadout` from `render/`, `BASE_ITEMS` + types from `data/`, `appState` from scenes. If anything fails to resolve, fix the import path before continuing.

- [ ] **Step 2.3: Run tests**

Run: `npm test`

Expected: PASS — total unchanged from end of Task 1. The scene file is not yet imported anywhere (Tasks 3 + 4 wire it up), so it's compiled but inert.

- [ ] **Step 2.4: Commit**

```bash
git add src/scenes/barracks_equip_scene.ts
git commit -m "BarracksEquipScene: slot-first picker + 2-click commit (Cluster B · 12)"
```

---

## Task 3: Barracks integration

Add the "Equip Gear" button to the Barracks detail pane and the RESUME hook so post-equip state shows when the equip scene closes.

**Files:**
- Modify: `src/scenes/barracks_panel_scene.ts`

- [ ] **Step 3.1: Add the "Equip Gear" button to `rebuildDetail`**

Open `src/scenes/barracks_panel_scene.ts`. Find the end of the `rebuildDetail` method — after the `for (const abilityId of resolvedAbilities)` loop's closing brace, but before the method's own closing brace.

The relevant ending of the method currently looks like:

```typescript
      yCursor += ABILITY_BLOCK_GAP;
    }
  }
```

Replace with:

```typescript
      yCursor += ABILITY_BLOCK_GAP;
    }

    // Equip Gear button — fixed position at bottom of the detail pane.
    const equipBtn = this.add
      .rectangle(DETAIL_TEXT_X + 80, 430, 140, 32, 0x335533)
      .setStrokeStyle(2, 0x66aa66);
    this.detailContainer.add(equipBtn);
    this.detailContainer.add(
      this.add
        .text(DETAIL_TEXT_X + 80, 430, 'Equip Gear', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    equipBtn.setInteractive({ useHandCursor: true });
    equipBtn.on('pointerdown', () => {
      this.scene.launch('barracks_equip', { heroId: hero.id });
      this.scene.pause();
    });
  }
```

- [ ] **Step 3.2: Add the RESUME handler**

Still in `src/scenes/barracks_panel_scene.ts`, find the end of the `create()` method. The current ending:

```typescript
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }
```

Replace with:

```typescript
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    // When BarracksEquipScene closes, refresh the detail pane so the post-equip
    // paperdoll / stats / equipment slot strip reflect the new state.
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.rebuildDetail();
    });
  }
```

- [ ] **Step 3.3: Run typecheck**

Run: `npx tsc --noEmit`

Expected: clean exit.

- [ ] **Step 3.4: Run tests**

Run: `npm test`

Expected: same total as end of Task 2; no regressions.

- [ ] **Step 3.5: Commit**

```bash
git add src/scenes/barracks_panel_scene.ts
git commit -m "Barracks: Equip Gear button + RESUME hook (Cluster B · 12)"
```

---

## Task 4: Wire-up + verification

Register the new scene in `main.ts`, run final checks, hand off manual play to the user.

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 4.1: Register `BarracksEquipScene` in `main.ts`**

Open `src/main.ts`. Add the import in alphabetical position. The current imports relevant here are `BarracksPanelScene` then `BlacksmithPanelScene` then `BootScene`. Insert the new import between `BarracksPanelScene` and `BlacksmithPanelScene`:

```typescript
import { BarracksPanelScene } from './scenes/barracks_panel_scene';
import { BarracksEquipScene } from './scenes/barracks_equip_scene';
import { BlacksmithPanelScene } from './scenes/blacksmith_panel_scene';
```

Then add it to the `scene:` array. Place it right after `BarracksPanelScene` so the equip scene is registered later (renders on top by default — no `bringToTop` shenanigans needed):

```typescript
scene: [
  BootScene,
  CampScene,
  TavernPanelScene,
  BarracksPanelScene,
  BarracksEquipScene,
  BlacksmithPanelScene,
  HospitalPanelScene,
  // … existing entries unchanged …
],
```

- [ ] **Step 4.2: Run typecheck**

Run: `npx tsc --noEmit`

Expected: clean exit.

- [ ] **Step 4.3: Run tests**

Run: `npm test`

Expected: same total as end of Task 3.

- [ ] **Step 4.4: Run the build**

Run: `npm run build`

Expected: clean tsc + vite build to `dist/`. No errors.

- [ ] **Step 4.5: Manual play verification**

Per CLAUDE.md, browser smoke tests are skipped by default. Confirm with the user before driving the browser. If running manually:

1. `npm run dev`, open `http://localhost:5173`.
2. From a save with at least one stash item (run a Crypt expedition or use dev tools to add one to `localStorage`):
   - Open Barracks; select a hero; "Equip Gear" button appears at the bottom of the detail pane.
   - Click "Equip Gear" → BarracksEquipScene opens with the hero's slot strip visible.
   - Click an equipment slot → picker on the right shows compatible stash items + "(empty)" first row for non-weapon slots.
   - Click an item once → row highlights gold; preview stats line appears with green/red deltas.
   - Click same item again → commit; slot now shows the new item; stash item is gone; HP reflects new maxHp.
   - Click a filled non-weapon slot → "(empty)" row visible; click it twice → unequip; item returns to stash; slot is empty.
   - Click weapon slot → no "(empty)" row; weapons-only items shown; swap weapons works.
   - Try paging if you have >4 stash items in a slot (use dev tools to seed if needed).
   - ESC closes; × button closes.
   - Returns to Barracks with the detail pane updated (paperdoll + stats + slot strip reflect changes).
3. Edge: equip an item that boosts maxHp — confirm currentHp doesn't overflow maxHp.

- [ ] **Step 4.6: Commit**

```bash
git add src/main.ts
git commit -m "Register BarracksEquipScene + wire equip-from-stash flow (Cluster B · 12)"
```

- [ ] **Step 4.7: Migrate TODO entry to HISTORY**

Per CLAUDE.md workflow, after a task ships its TODO entry moves to `HISTORY.md` with implementation-time context added. Offer this to the user — do not modify either file without explicit direction in the same turn.

---

## Self-review (already applied)

**Spec coverage:**
- Decisions table (§2 of spec) → reflected in Task 2's `EMPTY_SENTINEL`, 2-click commit, slot-first picker, stat preview, atomic persistence.
- Core API (§3) → Task 1's `equipFromStash` / `unequipToStash` / `recomputeMaxHp` match the spec verbatim.
- Tests (§4) → Task 1.2 covers all 8 categories specified (1 case per: equip-empty, swap, recompute, throw-missing-hero, throw-missing-item, throw-slot-mismatch, unequip non-weapon, unequip weapon throws, unequip empty no-op, throws on missing hero unequip, roundtrip).
- Scene layout (§5) → Task 2's constants and methods match the spec layout exactly.
- Selection state machine (§5) → `selectedSlot` + `highlightedItemId` derived states.
- Picker filter + sort (§5.1) → `pickerRowsForSlot` filters by slot and sorts (rarity, floorRolledAt, id).
- No gold readout (§5.2) → not present in scene code; confirmed.
- Barracks button + RESUME hook (§6) → Task 3.
- Persistence (§7) → atomic `appState.update` in `commit`.
- Save schema invariance (§8) → no schema work.
- Files-touched table (§9) → matches the four tasks' file lists exactly.
- Test plan (§10) → Task 1's tests + Task 4's manual play.

**Placeholder scan:** No `TODO`, `TBD`, or "implement later". Every code block is concrete.

**Type consistency:**
- `equipFromStash` / `unequipToStash` signatures match between Task 1 (impl), Task 1 (test), and Task 2 (scene call sites).
- `EMPTY_SENTINEL = '__empty__'` constant used consistently in `highlightedItemId` checks and in `commit` dispatch.
- `PickerRow` discriminated union: `{ kind: 'empty' } | { kind: 'item'; item: Item }`. Used uniformly in `pickerRowsForSlot`, `buildPickerRow`, `onPickerRowClick`, `commit`.
- `RARITY_COLOR_NUM` (number, for stroke style) vs `RARITY_COLOR_HEX` (string, for text color) — distinct types matched to their use sites.
- Scene key `'barracks_equip'` used in: scene constructor super() call, Barracks launch site, main.ts registration. All three match.
