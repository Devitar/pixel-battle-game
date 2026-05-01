# Blacksmith UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Blacksmith scene to the camp hub. Player clicks the Blacksmith tile, sees a single list of upgradeable items pulled from both the stash and roster-equipped gear. Clicking **Upgrade** spends gold (`100g` common→uncommon, `300g` uncommon→rare) and replaces the item with a new one whose rarity is bumped one tier.

**Architecture:** Four sequential tasks.

1. Promote two private helpers in `src/dungeon/loot.ts` to `export` (mechanical, no behavior change). Required by the upgrade core.
2. Add the upgrade core: a constants module (`src/data/blacksmith.ts`) and a pure-TS module (`src/items/upgrade.ts`) with deterministic Vitest tests. Reusable, no Phaser.
3. Add the Phaser scene (`src/scenes/blacksmith_panel_scene.ts`). Mirrors the Hospital scene's left-list / right-detail layout, with `equip_panel_scene.ts`-style paging and item icons.
4. Wire the new tile into camp + register the scene in `main.ts`. Final manual-play verification.

**Tech Stack:** TypeScript, Vitest (core); Phaser 3 (scene). The scene may import Phaser; everything in `src/items/`, `src/data/`, `src/dungeon/`, `src/util/` must not.

**Spec:** `docs/superpowers/specs/2026-04-30-blacksmith-ui-design.md`. Read before starting.

---

## Task 1: Promote `loot.ts` helpers to `export`

Mechanical change. `src/items/upgrade.ts` (Task 2) needs `rollAffixValue` and `pickRareProperty`; both are currently `function` (module-private) in `src/dungeon/loot.ts`. Promote them to `export function`. No signature change. No behavior change. `pickAffixes` stays private — Task 2 doesn't need it.

**Files:**
- Modify: `src/dungeon/loot.ts` (lines ~94, ~100)

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL tests pass (1289 tests as of HISTORY 2026-04-29, may be slightly higher).
Note the count for comparison after this task.

- [ ] **Step 1.2: Promote `rollAffixValue` to `export`**

Open `src/dungeon/loot.ts`. Find:

```typescript
function rollAffixValue(affixId: AffixId, floor: number): number {
  const def = AFFIXES[affixId];
  const scaled = scaleByFloor(def.baseValue, floor);
  return def.hpMultiplier === 3 ? scaled * 3 : scaled;
}
```

Change the leading `function` to `export function`:

```typescript
export function rollAffixValue(affixId: AffixId, floor: number): number {
  const def = AFFIXES[affixId];
  const scaled = scaleByFloor(def.baseValue, floor);
  return def.hpMultiplier === 3 ? scaled * 3 : scaled;
}
```

- [ ] **Step 1.3: Promote `pickRareProperty` to `export`**

In the same file, find:

```typescript
function pickRareProperty(rng: Rng, slot: ItemSlot, floor: number): RolledRareProperty | undefined {
```

Change to:

```typescript
export function pickRareProperty(rng: Rng, slot: ItemSlot, floor: number): RolledRareProperty | undefined {
```

(The function body is unchanged.)

- [ ] **Step 1.4: Run tests to verify nothing broke**

Run: `npm test`

Expected: Same test count as Step 1.1, all PASS. No new tests added; this is a pure export-visibility change.

- [ ] **Step 1.5: Run typecheck**

Run: `npx tsc --noEmit`

Expected: clean exit, no diagnostics.

- [ ] **Step 1.6: Commit**

Stage and commit:

```bash
git add src/dungeon/loot.ts
git commit -m "Promote rollAffixValue + pickRareProperty to exported (Cluster B · 2 prep)"
```

---

## Task 2: Items upgrade core

Pure TS, no Phaser. Lives in `src/items/`. Two new files plus a constants module.

**Files:**
- Create: `src/data/blacksmith.ts`
- Create: `src/items/upgrade.ts`
- Create: `src/items/__tests__/upgrade.test.ts`

- [ ] **Step 2.1: Create the constants module**

Create `src/data/blacksmith.ts` with this exact content:

```typescript
import type { Rarity } from './types';

// Cost is keyed by the *target* rarity (i.e. the rarity the item will become).
export const BLACKSMITH_UPGRADE_COST: Record<Exclude<Rarity, 'common'>, number> = {
  uncommon: 100,
  rare: 300,
};
```

- [ ] **Step 2.2: Write the failing test file**

Create `src/items/__tests__/upgrade.test.ts` with this exact content:

```typescript
import { describe, expect, it } from 'vitest';
import { BLACKSMITH_UPGRADE_COST } from '../../data/blacksmith';
import type { AffixId, Item } from '../../data/types';
import { rollAffixValue } from '../../dungeon/loot';
import { createRng } from '../../util/rng';
import {
  canUpgrade,
  nextRarity,
  upgradeCost,
  upgradeItem,
} from '../upgrade';

const ALL_AFFIX_IDS: readonly AffixId[] = [
  'of_power', 'of_insight', 'of_the_bear', 'of_vigor',
  'of_swiftness', 'of_the_hawk', 'of_evasion',
];

function commonSwordAtFloor(floor: number): Item {
  return {
    id: 'fixture-common-sword',
    baseId: 'sword_basic',
    slot: 'weapon',
    rarity: 'common',
    weaponType: 'sword',
    affixes: [],
    floorRolledAt: floor,
  };
}

function uncommonSwordWithPower(floor: number): Item {
  return {
    id: 'fixture-uncommon-sword',
    baseId: 'sword_basic',
    slot: 'weapon',
    rarity: 'uncommon',
    weaponType: 'sword',
    affixes: [{ affixId: 'of_power', value: rollAffixValue('of_power', floor) }],
    floorRolledAt: floor,
  };
}

function uncommonHatWithPower(floor: number): Item {
  return {
    id: 'fixture-uncommon-hat',
    baseId: 'hat_cap',
    slot: 'hat',
    rarity: 'uncommon',
    affixes: [{ affixId: 'of_power', value: rollAffixValue('of_power', floor) }],
    floorRolledAt: floor,
  };
}

function rareWeapon(floor: number): Item {
  return {
    id: 'fixture-rare-weapon',
    baseId: 'sword_basic',
    slot: 'weapon',
    rarity: 'rare',
    weaponType: 'sword',
    affixes: [
      { affixId: 'of_power',     value: rollAffixValue('of_power', floor) },
      { affixId: 'of_swiftness', value: rollAffixValue('of_swiftness', floor) },
    ],
    rareProperty: { propertyId: 'of_burning', value: 2 },
    floorRolledAt: floor,
  };
}

describe('nextRarity', () => {
  it('maps common → uncommon, uncommon → rare, rare → null', () => {
    expect(nextRarity('common')).toBe('uncommon');
    expect(nextRarity('uncommon')).toBe('rare');
    expect(nextRarity('rare')).toBeNull();
  });
});

describe('canUpgrade', () => {
  it('returns true for common and uncommon, false for rare', () => {
    expect(canUpgrade(commonSwordAtFloor(5))).toBe(true);
    expect(canUpgrade(uncommonSwordWithPower(5))).toBe(true);
    expect(canUpgrade(rareWeapon(5))).toBe(false);
  });
});

describe('upgradeCost', () => {
  it('charges 100g for common→uncommon', () => {
    expect(upgradeCost(commonSwordAtFloor(5))).toBe(BLACKSMITH_UPGRADE_COST.uncommon);
    expect(upgradeCost(commonSwordAtFloor(5))).toBe(100);
  });

  it('charges 300g for uncommon→rare', () => {
    expect(upgradeCost(uncommonSwordWithPower(5))).toBe(BLACKSMITH_UPGRADE_COST.rare);
    expect(upgradeCost(uncommonSwordWithPower(5))).toBe(300);
  });

  it('throws on rare input', () => {
    expect(() => upgradeCost(rareWeapon(5))).toThrow();
  });
});

describe('upgradeItem', () => {
  it('common→uncommon adds one affix at the item floor', () => {
    const item = commonSwordAtFloor(6);
    const rng = createRng(1);
    const upgraded = upgradeItem(item, rng);

    expect(upgraded.rarity).toBe('uncommon');
    expect(upgraded.affixes.length).toBe(1);
    const newAffix = upgraded.affixes[0];
    expect(ALL_AFFIX_IDS).toContain(newAffix.affixId);
    expect(newAffix.value).toBe(rollAffixValue(newAffix.affixId, 6));
    expect(upgraded.rareProperty).toBeUndefined();
    expect(upgraded.floorRolledAt).toBe(6);
    expect(upgraded.id).not.toBe(item.id);
  });

  it('uncommon→rare on a weapon adds an affix and a rare property', () => {
    const item = uncommonSwordWithPower(6);
    const rng = createRng(2);
    const upgraded = upgradeItem(item, rng);

    expect(upgraded.rarity).toBe('rare');
    expect(upgraded.affixes.length).toBe(2);
    // First affix is preserved verbatim.
    expect(upgraded.affixes[0]).toEqual(item.affixes[0]);
    // Second affix is new and not a duplicate of the first.
    const newAffix = upgraded.affixes[1];
    expect(newAffix.affixId).not.toBe('of_power');
    expect(newAffix.value).toBe(rollAffixValue(newAffix.affixId, 6));
    // Rare property is rolled, weapon-valid.
    expect(upgraded.rareProperty).toBeDefined();
    expect(['of_burning', 'of_vampirism']).toContain(upgraded.rareProperty!.propertyId);
  });

  it('uncommon→rare on a hat adds one affix and no rare property', () => {
    const item = uncommonHatWithPower(6);
    const rng = createRng(3);
    const upgraded = upgradeItem(item, rng);

    expect(upgraded.rarity).toBe('rare');
    // Deliberate divergence from loot-side: Blacksmith adds ONE affix per tier
    // bump. A freshly-rolled rare hat would have 3 affixes; an upgraded one has 2.
    expect(upgraded.affixes.length).toBe(2);
    expect(upgraded.affixes[0]).toEqual(item.affixes[0]);
    expect(upgraded.affixes[1].affixId).not.toBe('of_power');
    // Hats never roll a rare property.
    expect(upgraded.rareProperty).toBeUndefined();
  });

  it('throws on rare input', () => {
    const item = rareWeapon(5);
    const rng = createRng(4);
    expect(() => upgradeItem(item, rng)).toThrow();
  });

  it('produces a fresh id', () => {
    const item = uncommonSwordWithPower(6);
    const rng = createRng(5);
    const upgraded = upgradeItem(item, rng);
    expect(upgraded.id).not.toBe(item.id);
    expect(upgraded.id.length).toBeGreaterThan(0);
  });

  it('preserves floorRolledAt across the upgrade', () => {
    const item = commonSwordAtFloor(7);
    const rng = createRng(6);
    const upgraded = upgradeItem(item, rng);
    expect(upgraded.floorRolledAt).toBe(7);
  });

  it('the new affix at common→uncommon is different from any existing affix', () => {
    // Construct a common item that has no affixes (the only realistic case for
    // common, but cement the uniqueness invariant by trying many seeds and
    // confirming the new affix never duplicates an existing one).
    const item = commonSwordAtFloor(6);
    for (let seed = 1; seed <= 10; seed++) {
      const upgraded = upgradeItem(item, createRng(seed));
      const newAffix = upgraded.affixes[0];
      // Common had 0 affixes — uniqueness is trivially satisfied. Just sanity-check.
      expect(newAffix).toBeDefined();
      expect(ALL_AFFIX_IDS).toContain(newAffix.affixId);
    }
  });
});
```

- [ ] **Step 2.3: Run the test file and verify it fails**

Run: `npx vitest run src/items/__tests__/upgrade.test.ts`

Expected: FAIL — module `'../upgrade'` cannot be resolved (file doesn't exist yet).

- [ ] **Step 2.4: Implement `src/items/upgrade.ts`**

Create `src/items/upgrade.ts` with this exact content:

```typescript
import { BLACKSMITH_UPGRADE_COST } from '../data/blacksmith';
import type { AffixId, Item, Rarity, RolledAffix } from '../data/types';
import { pickRareProperty, rollAffixValue } from '../dungeon/loot';
import { generateItemId, type Rng } from '../util/rng';

const ALL_AFFIX_IDS: readonly AffixId[] = [
  'of_power', 'of_insight', 'of_the_bear', 'of_vigor',
  'of_swiftness', 'of_the_hawk', 'of_evasion',
];

const NEXT_RARITY: Record<Rarity, Rarity | null> = {
  common: 'uncommon',
  uncommon: 'rare',
  rare: null,
};

export function nextRarity(r: Rarity): Rarity | null {
  return NEXT_RARITY[r];
}

export function canUpgrade(item: Item): boolean {
  return nextRarity(item.rarity) !== null;
}

export function upgradeCost(item: Item): number {
  const target = nextRarity(item.rarity);
  if (target === null) {
    throw new Error(`upgradeCost: item already at max rarity '${item.rarity}'`);
  }
  return BLACKSMITH_UPGRADE_COST[target];
}

export function upgradeItem(item: Item, rng: Rng): Item {
  const target = nextRarity(item.rarity);
  if (target === null) {
    throw new Error(`upgradeItem: cannot upgrade item at rarity '${item.rarity}'`);
  }

  const newAffix = rollNewAffix(item, rng);

  // Hats never roll a rare property; everything else rolls one when reaching rare.
  const rareProperty = target === 'rare' && item.slot !== 'hat'
    ? pickRareProperty(rng, item.slot, item.floorRolledAt)
    : item.rareProperty;

  const upgraded: Item = {
    ...item,
    id: generateItemId(rng),
    rarity: target,
    affixes: [...item.affixes, newAffix],
    ...(rareProperty !== undefined ? { rareProperty } : {}),
  };
  return upgraded;
}

function rollNewAffix(item: Item, rng: Rng): RolledAffix {
  const used = new Set(item.affixes.map((a) => a.affixId));
  const available = ALL_AFFIX_IDS.filter((id) => !used.has(id));
  if (available.length === 0) {
    // Defensive — items max at 3 affixes (hat at rare); upgrade is blocked at rare.
    throw new Error('rollNewAffix: no available affixes');
  }
  const affixId = rng.pick(available);
  return { affixId, value: rollAffixValue(affixId, item.floorRolledAt) };
}
```

- [ ] **Step 2.5: Run the test file and verify it passes**

Run: `npx vitest run src/items/__tests__/upgrade.test.ts`

Expected: PASS — all describe blocks (`nextRarity`, `canUpgrade`, `upgradeCost`, `upgradeItem`) green. ~12 tests.

- [ ] **Step 2.6: Run the full test suite**

Run: `npm test`

Expected: PASS for the whole suite. Test count up by ~12 from Task 1's baseline.

- [ ] **Step 2.7: Run typecheck**

Run: `npx tsc --noEmit`

Expected: clean exit.

- [ ] **Step 2.8: Commit**

```bash
git add src/data/blacksmith.ts src/items/upgrade.ts src/items/__tests__/upgrade.test.ts
git commit -m "Items upgrade core (Cluster B · 2)"
```

---

## Task 3: Blacksmith panel scene

The Phaser scene. Mirrors `hospital_panel_scene.ts`'s left-list / right-detail layout. List rows render item icons (sprite-frame pattern from `equip_panel_scene.ts`). Paging uses `equip_panel_scene.ts`'s arrow pattern. No automated tests for scenes (project convention); manual play in Task 4.

**Files:**
- Create: `src/scenes/blacksmith_panel_scene.ts`

- [ ] **Step 3.1: Create the scene file**

Create `src/scenes/blacksmith_panel_scene.ts` with this exact content:

```typescript
import * as Phaser from 'phaser';
import { listHeroes, updateHero } from '../camp/roster';
import { addItems, removeItem } from '../camp/stash';
import { balance, spend } from '../camp/vault';
import { BASE_ITEMS } from '../data/items';
import type { Item, ItemSlot, Rarity } from '../data/types';
import type { Hero } from '../heroes/hero';
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
    // Within each section, the natural insertion order is: stash items in stash
    // order, then equipped items in (roster, slot) order. Sort each section by
    // rarity asc, then floorRolledAt asc, then id for stable order.
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
      .setStrokeStyle(2, isSelected ? 0xffcc66 : 0x222222, isSelected ? 1 : 1);
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

    if (entry.location.kind === 'stash') {
      nextStash = addItems(removeItem(state.stash, entry.item.id), [upgraded]);
    } else {
      const hero = listHeroes(state.roster).find((h) => h.id === entry.location.heroId);
      if (!hero) return;
      const equipped = equip(hero, upgraded, entry.location.slot);
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
```

- [ ] **Step 3.2: Run typecheck**

Run: `npx tsc --noEmit`

Expected: clean exit. The scene file uses imports from existing modules — `equip` from `items/equip`, `addItems`/`removeItem` from `camp/stash`, `updateHero`/`listHeroes` from `camp/roster`, `spend`/`balance` from `camp/vault`. If anything fails to resolve, fix the import path before continuing.

- [ ] **Step 3.3: Run tests**

Run: `npm test`

Expected: PASS. The new scene file is not imported anywhere yet (Task 4 wires it up), so it's compiled but inert.

- [ ] **Step 3.4: Commit**

```bash
git add src/scenes/blacksmith_panel_scene.ts
git commit -m "Blacksmith panel scene (Cluster B · 2)"
```

---

## Task 4: Camp tile + main.ts wire-up + manual play verification

Add the camp tile and register the scene. Final task; closes Cluster B · 2.

**Files:**
- Modify: `src/scenes/camp_scene.ts:13-22` (the `buildBuilding` block in `create()`)
- Modify: `src/main.ts:1-19` (imports + scene array)

- [ ] **Step 4.1: Add the Blacksmith tile to the camp scene**

Open `src/scenes/camp_scene.ts`. Find the `buildBuilding` block in `create()` (lines ~16–19):

```typescript
this.buildBuilding('Tavern', 180, 0x664433, 100, 110, 'tavern_panel');
this.buildBuilding('Barracks', 440, 0x555555, 100, 130, 'barracks_panel');
this.buildBuilding('Hospital', 580, 0x885566, 100, 100, 'hospital_panel');
this.buildBuilding('Noticeboard', 720, 0x998866, 80, 60, 'noticeboard_panel');
```

Insert a new line for Blacksmith between Tavern and Barracks:

```typescript
this.buildBuilding('Tavern', 180, 0x664433, 100, 110, 'tavern_panel');
this.buildBuilding('Blacksmith', 300, 0x665533, 100, 120, 'blacksmith_panel');
this.buildBuilding('Barracks', 440, 0x555555, 100, 130, 'barracks_panel');
this.buildBuilding('Hospital', 580, 0x885566, 100, 100, 'hospital_panel');
this.buildBuilding('Noticeboard', 720, 0x998866, 80, 60, 'noticeboard_panel');
```

- [ ] **Step 4.2: Register the scene in `main.ts`**

Open `src/main.ts`. Import the new class — keep the alphabetic-by-class-name ordering of the existing imports. Add this line in alphabetical position (between `BarracksPanelScene` and `BootScene`):

```typescript
import { BlacksmithPanelScene } from './scenes/blacksmith_panel_scene';
```

Then add it to the `scene:` array. The Hospital scene is registered after Barracks; place Blacksmith between Barracks and Hospital to match the camp tile order:

```typescript
scene: [
  BootScene,
  CampScene,
  TavernPanelScene,
  BarracksPanelScene,
  BlacksmithPanelScene,
  HospitalPanelScene,
  NoticeboardPanelScene,
  // … existing entries unchanged …
],
```

- [ ] **Step 4.3: Run typecheck**

Run: `npx tsc --noEmit`

Expected: clean exit.

- [ ] **Step 4.4: Run tests**

Run: `npm test`

Expected: same total as end of Task 2 — no new tests, no regressions.

- [ ] **Step 4.5: Run the build**

Run: `npm run build`

Expected: clean tsc + vite build to `dist/`. No errors.

- [ ] **Step 4.6: Manual play verification**

Per CLAUDE.md, browser smoke tests are skipped by default. Confirm with the user before driving the browser. If running manually:

1. `npm run dev`, open `http://localhost:5173`.
2. From a save with at least one common-or-uncommon item in stash and at least one common-or-uncommon equipped item:
   - Click Blacksmith tile on camp; panel opens.
   - Title shows count of upgradeable items; gold matches HUD.
   - List shows stash items first, then equipped items grouped by hero.
   - Selecting a row shows the right pane (rarity transition + "what changes" block).
   - Upgrading a stash item: gold deducts, list updates, item replaced with bumped-rarity version.
   - Upgrading an equipped item: gold deducts, hero now has the upgraded item; verify in Barracks.
   - Insufficient-gold case: button greyed; click is no-op.
   - Up/Down arrows page; clamp at start/end.
   - Empty state: with all-rare equipped + empty stash, list shows "No items can be upgraded."
   - ESC and × close the panel.
3. Refresh the page after one upgrade — the upgraded item persists (save layer is unchanged but exercised via `appState.update`).

- [ ] **Step 4.7: Commit**

```bash
git add src/scenes/camp_scene.ts src/main.ts
git commit -m "Wire Blacksmith tile into camp + register scene (Cluster B · 2)"
```

- [ ] **Step 4.8: Migrate TODO entry to HISTORY**

Per CLAUDE.md workflow, after a task ships its TODO entry moves to `HISTORY.md` with implementation-time context added. Offer this to the user — do not modify either file without explicit direction in the same turn.

---

## Self-review (already applied)

**Spec coverage:**
- Decisions table (§2 of spec) → reflected in cost constants, RNG fresh-per-upgrade, hat divergence, etc.
- Camp scene tile (§3) → Task 4.1.
- `BLACKSMITH_UPGRADE_COST` constant (§4) → Task 2.1.
- `upgrade.ts` core API (§5) → Task 2.4.
- `loot.ts` promotions (§5.2) → Task 1.
- Tests (§6) → Task 2.2.
- UI layout, list rows, detail pane, paging, sort order, empty state (§7) → Task 3.1.
- Upgrade interaction with stash + equipped paths (§8) → Task 3.1's `upgrade()` method.
- Files-touched table (§9) → matches the four tasks' file lists exactly.
- Save-schema invariance (§10) → no schema work in any task.
- Test plan (§11) → core tests in Task 2; manual play in Task 4.6.

**Placeholder scan:** No `TODO`, `TBD`, or "implement later". All code blocks are concrete.

**Type consistency:**
- `nextRarity`, `canUpgrade`, `upgradeCost`, `upgradeItem` — same names in test, implementation, and scene.
- `Location` type with `'stash' | 'equipped'` discriminator used uniformly in scene code.
- `BLACKSMITH_UPGRADE_COST` keyed by target rarity — matches test assertion (`BLACKSMITH_UPGRADE_COST.uncommon`, `.rare`).
- `Rarity` type imports from `../data/types` consistent.
