# Equipment Flow Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two existing equip scenes (`barracks_equip_scene` and `equip_panel_scene`) with a single unified `equip_scene` that surfaces currently-equipped item stats at-rest, presents a clean before/after preview when swapping, and shows ability gain/loss diffs when changing weapon types.

**Architecture:** One Phaser scene with a mode-discriminated config (`{ kind: 'barracks' } | { kind: 'in_run' }`) that picks hero list, item source, equip helpers, and close target. New `resolveAbilityDiff` helper in `@items/kit` powers the ability-diff coloring. Two-column layout: hero list on the left, paperdoll + header + slot strip + slot-detail card + item picker stacked vertically on the right.

**Tech Stack:** TypeScript, Phaser 3, Vitest. Companion spec: `docs/superpowers/specs/2026-05-04-equipment-flow-unification-design.md`.

---

## File Structure

**Files created:**

- `src/scenes/equip_scene.ts` — unified scene. Single responsibility: present a hero's equipment + the available item source, with previewable swap/unequip operations. ~600-700 lines after consolidation.

**Files modified:**

- `src/items/kit.ts` — add `resolveAbilityDiff(beforeHero, afterHero)` helper.
- `src/items/__tests__/kit.test.ts` — extend with `resolveAbilityDiff` tests.
- `src/main.ts` — register `EquipScene`; in Task 13, drop `BarracksEquipScene` and `EquipPanelScene` registrations.
- `src/scenes/barracks_panel_scene.ts:490` — launch site change.
- `src/scenes/camp_screen_scene.ts:128` — launch site change.
- `src/scenes/shop_overlay_scene.ts:213` — launch site change.

**Files deleted (Task 13):**

- `src/scenes/barracks_equip_scene.ts`
- `src/scenes/equip_panel_scene.ts`

**Housekeeping (Task 14):**

- `TODO.md`, `bugs.md`, `HISTORY.md`.

---

## Task 1: `resolveAbilityDiff` helper and tests

**Files:**
- Modify: `src/items/kit.ts`
- Test: `src/items/__tests__/kit.test.ts`

This task is the only TDD piece — pure TS, fast feedback. The rest of the plan builds the scene which is manually smoke-tested per repo convention.

- [ ] **Step 1: Write the failing tests**

Append to `src/items/__tests__/kit.test.ts`:

```ts
import { resolveAbilityDiff } from '../kit';

describe('resolveAbilityDiff — same kit', () => {
  it('returns empty diff and same band when equipment unchanged', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    const diff = resolveAbilityDiff(hero, hero);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.bandChange).toBe('same');
  });
});

describe('resolveAbilityDiff — preferred → off-preferred (same family)', () => {
  it('Knight sword → Knight axe records 1 ability swap and bandChange downgrade', () => {
    // Knight weaponSwaps: { axe: <swap ability> } per CLASSES.knight.
    const before = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    const after = makeHeroWith({ classId: 'knight', weaponBaseId: 'axe_basic', shieldBaseId: 'shield_basic' });
    const diff = resolveAbilityDiff(before, after);
    expect(diff.added.length).toBe(1);
    expect(diff.removed.length).toBe(1);
    expect(diff.bandChange).toBe('downgrade');
  });
});

describe('resolveAbilityDiff — off-preferred → preferred', () => {
  it('Knight axe → Knight sword records 1 swap and bandChange upgrade', () => {
    const before = makeHeroWith({ classId: 'knight', weaponBaseId: 'axe_basic', shieldBaseId: 'shield_basic' });
    const after = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    const diff = resolveAbilityDiff(before, after);
    expect(diff.added.length).toBe(1);
    expect(diff.removed.length).toBe(1);
    expect(diff.bandChange).toBe('upgrade');
  });
});

describe('resolveAbilityDiff — preferred → wrong family', () => {
  it('Knight sword → Knight bow drops to basic-only (large removed list, bandChange downgrade)', () => {
    const before = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    const after = makeHeroWith({ classId: 'knight', weaponBaseId: 'bow_basic', shieldBaseId: 'shield_basic' });
    const diff = resolveAbilityDiff(before, after);
    // Knight has 4 abilities at full kit; bow drops to basic only (1 ability, the basic).
    expect(diff.removed.length).toBeGreaterThan(0);
    expect(diff.bandChange).toBe('downgrade');
  });
});

describe('resolveAbilityDiff — wrong family → preferred', () => {
  it('Knight bow → Knight sword bandChange upgrade with abilities added', () => {
    const before = makeHeroWith({ classId: 'knight', weaponBaseId: 'bow_basic', shieldBaseId: 'shield_basic' });
    const after = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    const diff = resolveAbilityDiff(before, after);
    expect(diff.added.length).toBeGreaterThan(0);
    expect(diff.bandChange).toBe('upgrade');
  });
});

describe('resolveAbilityDiff — shield removed', () => {
  it('Knight sword + shield → Knight sword no shield records removed shield-required abilities', () => {
    const before = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    const noShield: Hero = { ...before, equipment: { weapon: before.equipment.weapon } };
    const diff = resolveAbilityDiff(before, noShield);
    expect(diff.removed.length).toBeGreaterThan(0);
    // bandChange interprets shield-loss as a downgrade — see plan Task 1 implementation.
    expect(diff.bandChange).toBe('downgrade');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/items/__tests__/kit.test.ts -t "resolveAbilityDiff"`
Expected: import error (`resolveAbilityDiff` doesn't exist yet).

- [ ] **Step 3: Implement `resolveAbilityDiff`**

Append to `src/items/kit.ts`. The existing imports at the top of the file already cover what `resolveAbilityDiff` needs (`ABILITIES`, `CLASSES`, `WEAPON_FAMILY`, `AbilityId`, `Hero` are all already imported). Do NOT duplicate them — append the type and function definitions only:

```ts
export type BandChange = 'upgrade' | 'downgrade' | 'same';

export interface AbilityDiff {
  added: readonly AbilityId[];
  removed: readonly AbilityId[];
  bandChange: BandChange;
}

// Band ordering, best to worst. Used to determine upgrade vs downgrade.
type Band = 'full_kit' | 'off_preferred' | 'no_shield' | 'wrong_family';
const BAND_RANK: Record<Band, number> = {
  full_kit: 3,
  off_preferred: 2,
  no_shield: 1,
  wrong_family: 0,
};

function classifyBand(hero: Hero): Band {
  const classDef = CLASSES[hero.classId];
  const weaponType = hero.equipment.weapon.weaponType;
  if (!weaponType) return 'wrong_family';
  const preferredFamily = classDef.weaponFamily;
  const equippedFamily = WEAPON_FAMILY[weaponType];
  const isPreferred = weaponType === classDef.preferredWeapon;

  if (isPreferred) {
    // Preferred weapon. Are any of the class's full-kit abilities shield-gated?
    const shieldRequiredInClass = classDef.abilities.some(
      (id) => ABILITIES[id].requiresShield === true,
    );
    if (shieldRequiredInClass && hero.equipment.shield === undefined) {
      return 'no_shield';
    }
    return 'full_kit';
  }
  if (
    equippedFamily === preferredFamily &&
    classDef.swapTarget !== undefined &&
    classDef.weaponSwaps !== undefined &&
    classDef.weaponSwaps[weaponType] !== undefined
  ) {
    return 'off_preferred';
  }
  return 'wrong_family';
}

export function resolveAbilityDiff(beforeHero: Hero, afterHero: Hero): AbilityDiff {
  const before = resolveCombatAbilities(beforeHero).abilities;
  const after = resolveCombatAbilities(afterHero).abilities;
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added: AbilityId[] = after.filter((a) => !beforeSet.has(a));
  const removed: AbilityId[] = before.filter((a) => !afterSet.has(a));

  const beforeBand = classifyBand(beforeHero);
  const afterBand = classifyBand(afterHero);
  let bandChange: BandChange;
  if (BAND_RANK[afterBand] > BAND_RANK[beforeBand]) bandChange = 'upgrade';
  else if (BAND_RANK[afterBand] < BAND_RANK[beforeBand]) bandChange = 'downgrade';
  else bandChange = 'same';

  return { added, removed, bandChange };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/items/__tests__/kit.test.ts -t "resolveAbilityDiff"`
Expected: 6 passes.

Then full kit suite:
Run: `npx vitest run src/items/__tests__/kit.test.ts`
Expected: all green.

Then full suite:
Run: `npm test`
Expected: all green.

- [ ] **Step 5: DO NOT COMMIT**

Per user preference, leave changes uncommitted in the working tree.

---

## Task 2: Scaffold `equip_scene.ts` and wire registration

**Files:**
- Create: `src/scenes/equip_scene.ts`
- Modify: `src/main.ts`

This task creates an empty-but-registered scene that you can launch (manually via `scene.start('equip', ...)` from the dev console). The scene shows just the panel chrome and close button. Subsequent tasks (3-12) build out the contents.

We defer wiring up real launch sites until Task 13 — until then the old scenes still handle barracks/camp_screen/shop launches, and we smoke-test the new scene by temporarily wiring the barracks launcher in this task too.

- [ ] **Step 1: Create `src/scenes/equip_scene.ts`**

Create the file with the scaffold:

```ts
import * as Phaser from 'phaser';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 920;
const PANEL_H = 460;

const TITLE_Y = 60;
const CLOSE_X = 933;
const CLOSE_Y = 63;

export type EquipMode =
  | { kind: 'barracks'; heroId: string }
  | { kind: 'in_run'; returnTo: string };

export class EquipScene extends Phaser.Scene {
  private mode!: EquipMode;
  private contentContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('equip');
  }

  init(data: EquipMode): void {
    this.mode = data;
  }

  create(): void {
    this.buildOverlayAndPanel();
    this.buildCloseButton();
    this.contentContainer = this.add.container(0, 0);
    this.repaint();
    this.input.keyboard?.on('keydown-ESC', () => this.close());
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

  private repaint(): void {
    this.contentContainer.removeAll(true);
    // Subsequent tasks (3-12) add panes here.
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
```

- [ ] **Step 2: Register `EquipScene` in `src/main.ts`**

Edit `src/main.ts`. Add import below the existing `EquipPanelScene` import (line 13):

```ts
import { EquipPanelScene } from './scenes/equip_panel_scene';
import { EquipScene } from './scenes/equip_scene';
```

Add `EquipScene` to the scene array, immediately after `EquipPanelScene`:

```ts
EquipPanelScene,
EquipScene,
```

- [ ] **Step 3: Verify the build**

Run: `npx tsc --noEmit`
Expected: clean (no type errors).

Run: `npm test`
Expected: all green (no behavior change yet).

- [ ] **Step 4: Smoke test (optional)**

Run: `npm run dev`. Open browser console, run: `game.scene.start('equip', { kind: 'barracks', heroId: 'h0' })`. Expected: blank panel with title "Equip · Barracks" and × close button. Click × or press ESC → returns to `barracks_panel`. (If `barracks_panel` isn't currently active, the resume target may not exist — that's fine for this smoke; just close the browser tab.)

- [ ] **Step 5: DO NOT COMMIT**

---

## Task 3: Hero list left pane

**Files:**
- Modify: `src/scenes/equip_scene.ts`

- [ ] **Step 1: Add hero-list constants and helpers**

In `src/scenes/equip_scene.ts`, add these constants near the existing layout constants:

```ts
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
```

Add these imports at the top (next to existing):

```ts
import { CLASSES } from '@data/classes';
import type { Item, ItemSlot } from '@data/types';
import type { Hero } from '@heroes/hero';
```

Add these instance fields to the `EquipScene` class:

```ts
private selectedHeroId: string = '';
private heroListPageStart: number = 0;
```

- [ ] **Step 2: Add hero-list helper methods to the class**

Add to `EquipScene`:

```ts
private getHeroList(): readonly Hero[] {
  if (this.mode.kind === 'barracks') return appState.get().roster.heroes;
  const run = appState.get().runState;
  if (!run) return [];
  return run.party;
}

private resolveSelectedHero(): Hero | undefined {
  return this.getHeroList().find((h) => h.id === this.selectedHeroId);
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
  this.repaint();
}
```

- [ ] **Step 3: Initialize `selectedHeroId` in `create()` and call `buildLeftPane`**

Update `create()` to initialize the selected hero, and update `repaint()` to call `buildLeftPane()`:

Replace existing `create()`:

```ts
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
```

Update `repaint()`:

```ts
private repaint(): void {
  this.contentContainer.removeAll(true);
  this.buildLeftPane();
  // Right pane added in subsequent tasks.
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Smoke test (optional)**

Run `npm run dev`. From console: `game.scene.start('equip', { kind: 'barracks', heroId: <a real hero id> })`. The left pane should show the roster with the chosen hero highlighted in gold. Click another hero — selection should move. ESC closes (may error if barracks_panel not active; ignore).

- [ ] **Step 6: DO NOT COMMIT**

---

## Task 4: Right pane scaffold + paperdoll + at-rest hero header

**Files:**
- Modify: `src/scenes/equip_scene.ts`

This task adds the right-pane background, paperdoll rendering, and the at-rest version of the hero header (name/class/level + total stats line + kit line). No diff coloring yet — that's Tasks 10 & 11.

- [ ] **Step 1: Add right-pane and paperdoll constants**

Add near other layout constants:

```ts
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
```

Add imports:

```ts
import { Paperdoll } from '@render/paperdoll';
import { heroToLoadout } from '@render/hero_loadout';
import { applyEquipmentStats } from '@items/stats';
import { describeKitStatus, resolveCombatAbilities } from '@items/kit';
import { ABILITIES } from '@data/abilities';
import type { AbilityId } from '@data/types';
import type { Stats } from '@combat/types';
```

- [ ] **Step 2: Add right-pane methods to the class**

Add to `EquipScene`:

```ts
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
  this.buildHeaderAtRest(hero);
}

private buildPaperdoll(hero: Hero): void {
  const doll = new Paperdoll(this, PAPERDOLL_X, PAPERDOLL_Y, heroToLoadout(hero));
  doll.setScale(PAPERDOLL_SCALE);
  this.contentContainer.add(doll);
}

private buildHeaderAtRest(hero: Hero): void {
  const classDef = CLASSES[hero.classId];

  // Line 1: Name · Class · Lv N
  this.contentContainer.add(
    this.add.text(HEADER_X, HEADER_NAME_Y, `${hero.name} · ${classDef.name} · Lv ${hero.level}`, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffffff',
    }),
  );

  // Line 2: Total effective stats.
  const stats = applyEquipmentStats(hero.baseStats, hero.equipment);
  this.contentContainer.add(
    this.add.text(HEADER_X, HEADER_STATS_Y, this.formatStatsLine(stats), {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#dddddd',
    }),
  );

  // Line 3: Kit + ability list.
  const kitText = this.buildKitLineText(hero);
  this.contentContainer.add(
    this.add.text(HEADER_X, HEADER_KIT_Y, kitText, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#aaaaaa',
      wordWrap: { width: RIGHT_PANE_W - 80 },
    }),
  );
}

private formatStatsLine(stats: Stats): string {
  return `HP ${stats.hp}  ATK ${stats.attack}  DEF ${stats.defense}  SPD ${stats.speed}  MND ${stats.mind}  CRT ${stats.crit}%  DDG ${stats.dodge}%`;
}

private buildKitLineText(hero: Hero): string {
  const status = describeKitStatus(hero);
  const abilityIds = resolveCombatAbilities(hero).abilities;
  const abilityNames = abilityIds.map((id) => ABILITIES[id].name).join(' · ');
  return `${status} · ${abilityNames}`;
}
```

- [ ] **Step 3: Call `buildRightPane()` from `repaint()`**

Update `repaint()`:

```ts
private repaint(): void {
  this.contentContainer.removeAll(true);
  this.buildLeftPane();
  this.buildRightPane();
  // Slot strip / detail card / picker added in subsequent tasks.
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Smoke test**

`npm run dev` → console launch with a real heroId. Right pane should show paperdoll + 3 header lines (name, stats, kit). Switch heroes via left pane — right pane should update to the selected hero. Stats and kit line should reflect current equipment.

- [ ] **Step 6: DO NOT COMMIT**

---

## Task 5: Slot strip

**Files:**
- Modify: `src/scenes/equip_scene.ts`

- [ ] **Step 1: Add slot-strip constants**

Add:

```ts
const SLOTS: readonly ItemSlot[] = ['weapon', 'shield', 'outfit', 'hat'];
const SLOT_SQUARE_SIZE = 56;
const SLOT_STRIP_Y = 240;
const SLOT_STRIP_X = [460, 540, 620, 700] as const;
```

Add imports:

```ts
import { BASE_ITEMS } from '@data/items';
```

- [ ] **Step 2: Add slot-strip methods**

Add to `EquipScene`:

```ts
private buildSlotStrip(hero: Hero): void {
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

private onSlotClick(slot: ItemSlot): void {
  // Selection state machine wired in Task 8.
  void slot;
}
```

Also add the `Selection` type and `selection` field to the class (used by `buildSlotSquare`'s `isSelected` check):

```ts
type Selection =
  | { kind: 'none' }
  | { kind: 'pack-item'; itemId: string }
  | { kind: 'equipped-slot'; slot: ItemSlot };

// Add to class fields:
private selection: Selection = { kind: 'none' };
```

(Place the `Selection` type immediately above the `EquipScene` class, like the existing `EquipMode` type.)

- [ ] **Step 3: Call `buildSlotStrip` from `buildRightPane`**

Update `buildRightPane`:

```ts
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
  this.buildHeaderAtRest(hero);
  this.buildSlotStrip(hero);
}
```

Also reset `this.selection = { kind: 'none' };` in the existing `onHeroRowClick`:

```ts
private onHeroRowClick(heroId: string): void {
  if (this.selectedHeroId === heroId) return;
  this.selectedHeroId = heroId;
  this.selection = { kind: 'none' };
  this.repaint();
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Smoke test**

`npm run dev` → launch. Should now see paperdoll + header + 4 slot squares with sprites + slot labels. Clicking weapon or empty slots: no effect. Clicking a non-empty non-weapon slot: also no effect (selection state isn't wired yet — Task 8). Verify all 4 slot squares render.

- [ ] **Step 6: DO NOT COMMIT**

---

## Task 6: Slot-detail card (at-rest)

**Files:**
- Modify: `src/scenes/equip_scene.ts`

- [ ] **Step 1: Add slot-detail card constants**

Add:

```ts
const CARD_CX = RIGHT_PANE_CX;
const CARD_Y = 305;
const CARD_W = 520;
const CARD_H = 60;

const RARITY_COLOR_HEX: Record<'common' | 'uncommon' | 'rare', string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
};

const WEAPON_TYPE_DISPLAY: Record<string, string> = {
  sword: 'sword',
  bow: 'bow',
  holy_symbol: 'holy symbol',
  axe: 'axe',
  daggers: 'daggers',
  staff: 'staff',
};
```

Add imports:

```ts
import { itemAffixDescription, itemDisplayName } from '@items/selectors';
```

- [ ] **Step 2: Add slot-detail card methods**

Add to `EquipScene`:

```ts
private buildSlotDetailCard(hero: Hero): void {
  // Frame.
  this.contentContainer.add(
    this.add
      .rectangle(CARD_CX, CARD_Y, CARD_W, CARD_H, 0x111111)
      .setStrokeStyle(1, 0x333333),
  );

  // At-rest mode shows the weapon slot's currently-equipped item.
  // (Preview mode added in Task 8.)
  const item = hero.equipment.weapon;
  this.renderItemSummaryInCard(item, CARD_CX, CARD_Y);
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
```

- [ ] **Step 3: Call `buildSlotDetailCard` from `buildRightPane`**

Update `buildRightPane` (after `buildSlotStrip`):

```ts
this.buildSlotStrip(hero);
this.buildSlotDetailCard(hero);
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Smoke test**

`npm run dev` → launch. Should now see a slot-detail card below the slot strip showing the weapon's currently-equipped details (name · rarity · weapon-type, then affix line if present). Switch heroes — the card updates to the new hero's weapon.

- [ ] **Step 6: DO NOT COMMIT**

---

## Task 7: Item picker (no preview)

**Files:**
- Modify: `src/scenes/equip_scene.ts`

This task renders the source list (stash for barracks, pack for in_run) sorted by slot → rarity → floor. No interaction yet — just rendering.

- [ ] **Step 1: Add picker constants**

Add:

```ts
const PICKER_X = RIGHT_PANE_CX;
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
```

- [ ] **Step 2: Add picker fields and methods**

Add field to class:

```ts
private pickerPageStart: number = 0;
```

Add methods:

```ts
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
  // Selection state machine wired in Task 8.
  void item;
}
```

- [ ] **Step 3: Call `buildPicker` from `buildRightPane`**

Update `buildRightPane` (after `buildSlotDetailCard`):

```ts
this.buildSlotDetailCard(hero);
this.buildPicker(hero);
```

Reset `pickerPageStart` in `onHeroRowClick`:

```ts
private onHeroRowClick(heroId: string): void {
  if (this.selectedHeroId === heroId) return;
  this.selectedHeroId = heroId;
  this.selection = { kind: 'none' };
  this.pickerPageStart = 0;
  this.repaint();
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Smoke test**

`npm run dev` → launch. Picker now shows the stash content sorted (weapons first, then shields, etc.). Clicking rows: no effect yet (Task 8). Pagination arrows appear if stash has 5+ items.

- [ ] **Step 6: DO NOT COMMIT**

---

## Task 8: Selection state machine + slot-detail card preview

**Files:**
- Modify: `src/scenes/equip_scene.ts`

This task wires up clicks on slot squares and picker rows to the `selection` state, and updates `buildSlotDetailCard` to render before/after preview.

- [ ] **Step 1: Implement `onSlotClick` and `onPickerRowClick`**

Replace the stubs from Tasks 5 and 7:

```ts
private onSlotClick(slot: ItemSlot): void {
  // Toggle: clicking the same selected slot clears.
  if (this.selection.kind === 'equipped-slot' && this.selection.slot === slot) {
    this.selection = { kind: 'none' };
  } else {
    this.selection = { kind: 'equipped-slot', slot };
  }
  this.repaint();
}

private onPickerRowClick(item: Item): void {
  if (this.selection.kind === 'pack-item' && this.selection.itemId === item.id) {
    // Same row clicked twice — commit (Task 12 implements commit).
    return;
  }
  this.selection = { kind: 'pack-item', itemId: item.id };
  this.repaint();
}
```

- [ ] **Step 2: Replace `buildSlotDetailCard` with preview-aware version**

Replace the existing `buildSlotDetailCard`:

```ts
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
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm test`
Expected: all green.

- [ ] **Step 4: Smoke test**

`npm run dev` → launch. Click a non-weapon slot (with item equipped) → card shows before/after where after = (empty). Click again → reverts to at-rest. Click a picker item → card shows before (= currently equipped in that slot, or "(empty)") and after (= the new item). Selecting a different item updates the preview. Slot squares get gold border when selected; picker rows get gold border + dark fill when selected.

- [ ] **Step 5: DO NOT COMMIT**

---

## Task 9: Stat-delta coloring in header line 2

**Files:**
- Modify: `src/scenes/equip_scene.ts`

Replace the at-rest header with a preview-aware version that recomputes stats and colors changed tokens.

- [ ] **Step 1: Add `computePreviewStats` helper**

Add to `EquipScene`:

```ts
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
    delete (equipmentWithoutSlot as Record<string, unknown>)[slot];
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
```

Add import:

```ts
import { previewStats, type StatPreview } from '@items/selectors';
```

- [ ] **Step 2: Replace `buildHeaderAtRest` with `buildHeader`**

Rename and rewrite the header builder so it handles both at-rest and preview cases:

```ts
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

  // Line 3: Kit (still at-rest in this task — Task 10 adds diff colors).
  const kitText = this.buildKitLineText(hero);
  this.contentContainer.add(
    this.add.text(HEADER_X, HEADER_KIT_Y, kitText, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#aaaaaa',
      wordWrap: { width: RIGHT_PANE_W - 80 },
    }),
  );
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
```

Update `buildRightPane` to call `buildHeader` instead of `buildHeaderAtRest`:

```ts
this.buildPaperdoll(hero);
this.buildHeader(hero);
this.buildSlotStrip(hero);
```

Delete the now-unused `buildHeaderAtRest` method.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm test`
Expected: all green.

- [ ] **Step 4: Smoke test**

`npm run dev` → launch. Click a picker item → header line 2 shows after-stats with green/red coloring on changed values. Click an equipped slot → stats show after-unequip with red coloring (mostly). Click again to clear → reverts to gray.

- [ ] **Step 5: DO NOT COMMIT**

---

## Task 10: Ability-diff coloring in header line 3

**Files:**
- Modify: `src/scenes/equip_scene.ts`

Replace the simple kit-text rendering with a token-by-token rendering that applies `resolveAbilityDiff` colors during preview.

- [ ] **Step 1: Add the kit-line preview rendering**

Add helper methods:

```ts
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
    delete (equipmentWithoutSlot as Record<string, unknown>)[sel.slot];
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

  // Tokens: every ability in afterAbilities, plus any removed ones inline.
  // Strategy: walk `afterAbilities` for green/gray, then append removed ones in red+strikethrough.
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
  // Removed abilities — appended at the end, red, strikethrough.
  let removedIdx = 0;
  for (const id of diff.removed) {
    const isLast = removedIdx === diff.removed.length - 1;
    const text = `${ABILITIES[id].name}${isLast ? '' : ' · '}`;
    const tok = this.add.text(xCursor, HEADER_KIT_Y, text, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#cc4444',
    });
    // Phaser's BitmapText doesn't support strikethrough; use Text with a manual line draw.
    // For this pass: use a Unicode strikethrough char combiner per char, OR draw a graphics line.
    // Simpler: skip the line; visual signal is the red color + position after the after-list.
    this.contentContainer.add(tok);
    xCursor += tok.width;
    removedIdx++;
  }
}
```

Note: implementing true strikethrough on Phaser `Text` requires a manual graphics line. For this pass we rely on red color + trailing position to communicate "removed" — the spec said strikethrough is the ideal but red+position is acceptable. If a future polish pass wants real strikethrough, the implementer can draw a `Phaser.GameObjects.Graphics` line over each removed-token's bounds.

- [ ] **Step 2: Update `buildHeader` to use the colored kit line**

Replace the kit line render in `buildHeader` (the current line that uses `buildKitLineText` directly):

```ts
// Line 3: Kit — colored if preview, gray if at-rest.
this.buildKitLineColored(hero);
```

Delete the inline kit-line block that previously called `buildKitLineText` (the `this.add.text(...)` below the stats line).

Also add the import:

```ts
import { describeKitStatus, resolveCombatAbilities, resolveAbilityDiff } from '@items/kit';
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm test`
Expected: all green.

- [ ] **Step 4: Smoke test**

`npm run dev` → launch a Knight with sword + shield. Click an axe in the picker (assuming one exists in stash) → kit line shows the after-state with the axe ability replacing the sword's swap target (red removed at end, green added inline, band label red because Off-preferred is a downgrade). Click a bow → kit line collapses to "Strike" with the rest of the abilities listed in red. Click an outfit/hat → kit line stays gray (no kit change).

If smoke testing reveals you'd like real strikethrough on the removed list, a follow-up task can add it.

- [ ] **Step 5: DO NOT COMMIT**

---

## Task 11: Commit button and double-click commit

**Files:**
- Modify: `src/scenes/equip_scene.ts`

- [ ] **Step 1: Add commit-button constants**

Add:

```ts
const COMMIT_BUTTON_X = 850;
const COMMIT_BUTTON_Y = 440;
const COMMIT_BUTTON_W = 200;
const COMMIT_BUTTON_H = 28;
```

Add imports:

```ts
import { equipFromStash, unequipToStash } from '@items/equip_camp';
import { equipFromPack, unequipToPack } from '@run/equip_run';
```

- [ ] **Step 2: Add commit-button method and helpers**

Add to `EquipScene`:

```ts
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
```

- [ ] **Step 3: Wire double-click commits in `onSlotClick` and `onPickerRowClick`**

Update `onPickerRowClick` to commit on second click:

```ts
private onPickerRowClick(item: Item): void {
  if (this.selection.kind === 'pack-item' && this.selection.itemId === item.id) {
    this.commit();
    return;
  }
  this.selection = { kind: 'pack-item', itemId: item.id };
  this.repaint();
}
```

Update `onSlotClick` similarly (for unequip):

```ts
private onSlotClick(slot: ItemSlot): void {
  if (this.selection.kind === 'equipped-slot' && this.selection.slot === slot) {
    this.commit();
    return;
  }
  this.selection = { kind: 'equipped-slot', slot };
  this.repaint();
}
```

- [ ] **Step 4: Call `buildCommitButton` from `buildRightPane`**

Update `buildRightPane` (after `buildPicker`):

```ts
this.buildPicker(hero);
this.buildCommitButton(hero);
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Smoke test**

`npm run dev` → launch (barracks mode). Click a picker item → commit button label shows "Equip <Item>" enabled. Click button → item moves from stash to hero. Paperdoll updates. Click an equipped non-weapon slot → button shows "Unequip <Item>" enabled. Double-click an item or slot → also commits. Click button while no selection → button is disabled.

- [ ] **Step 7: DO NOT COMMIT**

---

## Task 12: Switch launch sites and delete old scenes

**Files:**
- Modify: `src/scenes/barracks_panel_scene.ts:490`
- Modify: `src/scenes/camp_screen_scene.ts:128`
- Modify: `src/scenes/shop_overlay_scene.ts:213`
- Modify: `src/main.ts`
- Delete: `src/scenes/barracks_equip_scene.ts`
- Delete: `src/scenes/equip_panel_scene.ts`

- [ ] **Step 1: Update launch site in `barracks_panel_scene.ts`**

Find the line at ~490:

```ts
this.scene.launch('barracks_equip', { heroId: hero.id });
```

Replace with:

```ts
this.scene.launch('equip', { kind: 'barracks', heroId: hero.id });
```

- [ ] **Step 2: Update launch site in `camp_screen_scene.ts`**

Find the line at ~128:

```ts
this.scene.launch('equip_panel');
```

Replace with:

```ts
this.scene.launch('equip', { kind: 'in_run', returnTo: 'camp_screen' });
```

- [ ] **Step 3: Update launch site in `shop_overlay_scene.ts`**

Find the line at ~213:

```ts
this.scene.launch('equip_panel', { returnTo: 'shop_overlay' });
```

Replace with:

```ts
this.scene.launch('equip', { kind: 'in_run', returnTo: 'shop_overlay' });
```

- [ ] **Step 4: Delete old scene imports + registrations from `main.ts`**

In `src/main.ts`, remove these lines:

```ts
import { BarracksEquipScene } from './scenes/barracks_equip_scene';
```

```ts
import { EquipPanelScene } from './scenes/equip_panel_scene';
```

In the scene array, remove `BarracksEquipScene,` and `EquipPanelScene,`. The final scene array should still contain `EquipScene,`.

- [ ] **Step 5: Delete the two old scene files**

Run:

```bash
git rm src/scenes/barracks_equip_scene.ts
git rm src/scenes/equip_panel_scene.ts
```

(Per the user's no-commit policy, this stages the deletions but does not commit. The agent should NOT run `git commit`.)

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm test`
Expected: all green.

- [ ] **Step 7: Smoke test all three launch flows**

`npm run dev`. Test:

- **Barracks flow:** Camp → Barracks → click a hero → unified equip scene opens with that hero pre-selected, full roster in left pane. Equip/unequip from stash works. Close (× or ESC) returns to barracks panel.
- **Camp_screen (post-boss) flow:** Start a run, defeat the floor 1 boss, hit the camp_screen, click "Manage Gear" → equip scene opens with party of 3 in left pane, pack as source. Close returns to camp_screen.
- **Shop_overlay flow:** Start a run, route to a shop, click "Manage Gear" → equip scene opens, close returns to shop_overlay.

For each flow, verify:
- Left pane hero list is correct.
- Right pane paperdoll/header/slot strip/card/picker render.
- Stat-delta and ability-diff coloring works.
- Commit button activates correctly.
- Equip/unequip operations actually move items.

- [ ] **Step 8: DO NOT COMMIT**

---

## Task 13: TODO + bugs + HISTORY housekeeping

**Files:**
- Modify: `TODO.md`
- Modify: `bugs.md`
- Modify: `HISTORY.md`

- [ ] **Step 1: Remove the equipment bug from `bugs.md`**

In `bugs.md`, find the entry that begins:

```
### There isn't a way to see the stats of the currently equipped items from the barracks view. ...
```

(It's currently the last entry, around line 23.) Delete the entire entry.

- [ ] **Step 2: Add a HISTORY entry**

In `HISTORY.md`, at the top (above the most recent entry — should be the Cluster B · 30 capstone or Phase 6d entry), add:

```markdown
### 2026-05-04 · Equipment flow unification

- **What shipped:** Single unified `equip_scene` replacing both `barracks_equip_scene` and `equip_panel_scene`. Surfaces currently-equipped item stats at-rest via a slot-detail card; presents a clean before/after preview when swapping; shows ability gain/loss diffs with green/red coloring when changing weapon types.
- **Why:** Player feedback flagged three concrete gaps: barracks at-rest view didn't show item stats; the two equip screens had divergent layouts; weapon-type swaps didn't preview ability changes. Equipment management is the most-touched player workflow that still felt rough post-Tier-2.
- **Decisions:**
  - **Hero selector in both modes** over keeping barracks single-hero. Barracks gets a roster list; in-run gets the 3-hero party. Truly unified chrome at the cost of one extra UI element in barracks.
  - **Slot-detail card as single source of truth.** A dedicated card next to the paperdoll shows the currently-equipped item's full details for the selected slot, and flips to a before/after preview when an item is highlighted. Replaces the prior pattern of "click slot to open picker, find equipped row to read affixes."
  - **Kit + ability list in the hero header.** Abilities depend on weapon + shield together (not on any single slot), so they live with the hero summary. `describeKitStatus()` already existed; surfacing it cost ~3 lines.
  - **Two-column layout with stacked right pane** over three columns or a drawer. Each component gets vertical breathing room; the picker stays always-visible.
  - **Card at-rest scope: weapon only.** No "browse other slots at rest" mode — picker rows already show full affix detail per slot, so adding that affordance was deemed marginal information for state-machine cost. Revisitable if smoke testing reveals it feels weak.
- **Surprises:**
  - **Strikethrough on removed-ability tokens** isn't supported by Phaser `Text` directly. The shipped UI uses red color + trailing position to indicate removed abilities. True strikethrough would require a `Phaser.GameObjects.Graphics` line over each token's bounds — left as a follow-up polish.
  - **`describeKitStatus` and `resolveCombatAbilities` were both already in `kit.ts`** but never surfaced in the UI. Most of the "ability preview" work was just rendering existing data; only `resolveAbilityDiff` (~30 lines) was new.
- **Source:** TODO.md (none — this was a `bugs.md` migration). Spec: `docs/superpowers/specs/2026-05-04-equipment-flow-unification-design.md`. Brainstorm 2026-05-04 (Q1 selector/B, Q2 card/D, Q3 kit-in-header/A, Q4 two-column/B).
```

- [ ] **Step 3: TODO.md (no change required)**

The equipment bug never had a TODO entry — it was scoped directly from `bugs.md` to a brainstorm session. No TODO updates needed.

- [ ] **Step 4: Final verification**

Run: `npm test`
Expected: all green.

Run: `npm run build`
Expected: clean production build.

- [ ] **Step 5: DO NOT COMMIT**

---

## Plan complete

After Task 13, the equipment flow unification is shipped:

- One scene replaces two (~600 LOC vs ~1075 across the old pair).
- Currently-equipped item stats visible at-rest via the slot-detail card.
- Stat deltas + ability diffs colored on every preview.
- Three launch sites updated; old scenes deleted.

Estimated 13 tasks, mostly sequential since they all touch the same scene file. Tasks 1, 12, and 13 are quick (under 10 minutes each); Tasks 2-11 are the bulk of the build (each ~10-20 minutes).
