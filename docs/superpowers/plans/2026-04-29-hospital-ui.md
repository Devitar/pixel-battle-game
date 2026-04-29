# Hospital UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Hospital scene to the camp hub. Player clicks the Hospital tile, sees wounded heroes on the left, the selected hero's wounds on the right with a Treat button per wound. Treat spends `40g` from the vault and removes the wound.

**Architecture:** Two sequential tasks.

1. `describeWoundEffect` data-layer helper + tests. Pure TS; reusable by Cluster B · 9 later.
2. `HospitalPanelScene` Phaser class + camp scene tile + `main.ts` registration. Scenes are not unit-tested per convention; manual play verifies.

**Tech Stack:** TypeScript, Vitest (data layer); Phaser 3 (scene). The scene may import phaser; the data-layer helper must not.

**Spec:** `docs/superpowers/specs/2026-04-29-hospital-ui-design.md`. Read before starting.

---

## Task 1: `describeWoundEffect` helper

Pure-TS function in `src/data/wounds.ts` that turns a `WoundEffect` into a player-facing string. Reusable by Cluster B · 9 (Wound display elsewhere).

**Files:**
- Modify: `src/data/wounds.ts`
- Create: `src/data/__tests__/wounds.test.ts`

- [ ] **Step 1.1: Write the failing test file**

Create `src/data/__tests__/wounds.test.ts` with this exact content:

```typescript
import { describe, expect, it } from 'vitest';
import { WOUNDS, describeWoundEffect } from '../wounds';

describe('describeWoundEffect', () => {
  it('describes bruised as +20% damage taken', () => {
    expect(describeWoundEffect(WOUNDS.bruised.effect)).toBe('+20% damage taken');
  });

  it('describes hobbled as -2 Speed', () => {
    expect(describeWoundEffect(WOUNDS.hobbled.effect)).toBe('-2 Speed');
  });

  it('describes concussed as -2 Mind', () => {
    expect(describeWoundEffect(WOUNDS.concussed.effect)).toBe('-2 Mind');
  });

  it('describes winded as -2 Attack', () => {
    expect(describeWoundEffect(WOUNDS.winded.effect)).toBe('-2 Attack');
  });

  it('describes unsteady as -5 Crit', () => {
    expect(describeWoundEffect(WOUNDS.unsteady.effect)).toBe('-5 Crit');
  });

  it('describes broken_bone as -10 Max HP', () => {
    expect(describeWoundEffect(WOUNDS.broken_bone.effect)).toBe('-10 Max HP');
  });
});
```

- [ ] **Step 1.2: Run the test and verify it fails**

Run: `npx vitest run src/data/__tests__/wounds.test.ts`

Expected: FAIL — `describeWoundEffect is not exported from '../wounds'`.

- [ ] **Step 1.3: Add the helper to `src/data/wounds.ts`**

Open `src/data/wounds.ts`. The current file imports `WoundDef` and `WoundId` from `./types`. Extend that import to also bring in `WoundEffect` (which is defined in the same module):

```typescript
import type { WoundDef, WoundEffect, WoundId } from './types';
```

Then, after the existing exports at the bottom of the file, append:

```typescript
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function describeWoundEffect(effect: WoundEffect): string {
  if (effect.kind === 'statDelta') {
    const sign = effect.delta >= 0 ? '+' : '';
    const statName = effect.stat === 'hp' ? 'Max HP' : capitalize(effect.stat);
    return `${sign}${effect.delta} ${statName}`;
  }
  // damageTakenMult
  const pct = Math.round((effect.multiplier - 1) * 100);
  return `+${pct}% damage taken`;
}
```

- [ ] **Step 1.4: Run the test and verify it passes**

Run: `npx vitest run src/data/__tests__/wounds.test.ts`

Expected: PASS — all 6 cases green.

- [ ] **Step 1.5: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total = baseline + 6.

- [ ] **Step 1.6: Commit**

```bash
git add src/data/wounds.ts src/data/__tests__/wounds.test.ts
git commit -m "feat(data): describeWoundEffect helper for wound UI strings"
```

---

## Task 2: `HospitalPanelScene` + camp tile + scene registration

Add the Hospital scene class, hook the camp-scene tile, and register the scene in `main.ts`. No unit tests (Phaser convention); acceptance is `tsc --noEmit` green plus the scene loading without runtime errors when manually clicked.

**Files:**
- Create: `src/scenes/hospital_panel_scene.ts`
- Modify: `src/scenes/camp_scene.ts`
- Modify: `src/main.ts`

- [ ] **Step 2.1: Create `hospital_panel_scene.ts`**

Create `src/scenes/hospital_panel_scene.ts` with this exact content:

```typescript
import * as Phaser from 'phaser';
import { listHeroes, treatHeroWound, updateHero } from '../camp/roster';
import { balance, spend } from '../camp/vault';
import { HOSPITAL_TREATMENT_COST, WOUNDS, describeWoundEffect } from '../data/wounds';
import type { Hero } from '../heroes/hero';
import { HeroCard } from '../ui/hero_card';
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

const SLOT_X = 245;
const SLOT_Y_BASE = 130;
const SLOT_STRIDE = 60;
const SLOT_BG_W = 360;
const SLOT_BG_H = 56;

const WOUND_ROW_X = DETAIL_PANE_CX;
const WOUND_ROW_Y_BASE = 140;
const WOUND_ROW_STRIDE = 56;
const WOUND_ROW_W = 400;
const WOUND_ROW_H = 48;

interface RosterCard {
  bg: Phaser.GameObjects.Rectangle;
  card: HeroCard;
  countLabel: Phaser.GameObjects.Text;
  hero: Hero;
}

export class HospitalPanelScene extends Phaser.Scene {
  private rosterCards: RosterCard[] = [];
  private selectedHeroId: string | null = null;
  private titleText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private listContainer!: Phaser.GameObjects.Container;
  private detailContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('hospital_panel');
  }

  create(): void {
    this.rosterCards = [];
    this.selectedHeroId = null;

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
    this.rosterCards = [];

    const wounded = listHeroes(appState.get().roster).filter((h) => h.wounds.length > 0);

    this.titleText.setText(`Hospital · ${wounded.length} wounded`);
    this.goldText.setText(`Gold: ${balance(appState.get().vault)}`);

    if (wounded.length === 0) {
      this.listContainer.add(
        this.add
          .text(LIST_PANE_CX, LIST_PANE_CY, 'All heroes are healthy.', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#888888',
          })
          .setOrigin(0.5),
      );
      this.selectedHeroId = null;
      return;
    }

    // Pick a sensible default selection if the previous one is no longer wounded.
    if (!this.selectedHeroId || !wounded.some((h) => h.id === this.selectedHeroId)) {
      this.selectedHeroId = wounded[0].id;
    }

    for (let i = 0; i < wounded.length && i < 6; i++) {
      this.buildHeroSlot(wounded[i], i);
    }

    this.refreshSelectionHighlights();
    this.rebuildDetail();
  }

  private buildHeroSlot(hero: Hero, index: number): void {
    const x = SLOT_X;
    const y = SLOT_Y_BASE + index * SLOT_STRIDE;

    const bg = this.add
      .rectangle(x, y, SLOT_BG_W, SLOT_BG_H, 0x000000, 0)
      .setStrokeStyle(2, 0xffcc66, 0);
    const card = new HeroCard(this, x - 80, y, hero, { size: 'small' });
    const countLabel = this.add
      .text(x + 130, y, `${hero.wounds.length} wound${hero.wounds.length === 1 ? '' : 's'}`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#cc8866',
      })
      .setOrigin(1, 0.5);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.selectHero(hero.id));

    this.listContainer.add(bg);
    this.listContainer.add(card);
    this.listContainer.add(countLabel);

    this.rosterCards.push({ bg, card, countLabel, hero });
  }

  private selectHero(id: string): void {
    this.selectedHeroId = id;
    this.refreshSelectionHighlights();
    this.rebuildDetail();
  }

  private refreshSelectionHighlights(): void {
    for (const rc of this.rosterCards) {
      const isSelected = rc.hero.id === this.selectedHeroId;
      rc.bg.setStrokeStyle(2, 0xffcc66, isSelected ? 1 : 0);
    }
  }

  private rebuildDetail(): void {
    this.detailContainer.removeAll(true);

    const hero = this.selectedHeroId
      ? this.rosterCards.find((rc) => rc.hero.id === this.selectedHeroId)?.hero
      : undefined;

    if (!hero) return;

    this.detailContainer.add(
      this.add
        .text(DETAIL_PANE_CX, 110, hero.name, {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );

    const vaultGold = balance(appState.get().vault);

    for (let i = 0; i < hero.wounds.length; i++) {
      this.buildWoundRow(hero, i, vaultGold);
    }
  }

  private buildWoundRow(hero: Hero, woundIndex: number, vaultGold: number): void {
    const wound = hero.wounds[woundIndex];
    const def = WOUNDS[wound.id];
    const desc = describeWoundEffect(def.effect);
    const cost = HOSPITAL_TREATMENT_COST;
    const canAfford = vaultGold >= cost;
    const y = WOUND_ROW_Y_BASE + woundIndex * WOUND_ROW_STRIDE;

    const rowBg = this.add
      .rectangle(WOUND_ROW_X, y, WOUND_ROW_W, WOUND_ROW_H, 0x222222)
      .setStrokeStyle(1, 0x444444);
    this.detailContainer.add(rowBg);

    this.detailContainer.add(
      this.add
        .text(WOUND_ROW_X - 180, y, def.name, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffffff',
        })
        .setOrigin(0, 0.5),
    );

    this.detailContainer.add(
      this.add
        .text(WOUND_ROW_X - 180, y + 14, desc, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#aaaaaa',
        })
        .setOrigin(0, 0.5),
    );

    this.detailContainer.add(
      this.add
        .text(WOUND_ROW_X + 60, y, `${cost}g`, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: canAfford ? '#ffcc66' : '#cc6666',
        })
        .setOrigin(1, 0.5),
    );

    const buttonBg = this.add
      .rectangle(WOUND_ROW_X + 140, y, 60, 26, canAfford ? 0x335533 : 0x333333)
      .setStrokeStyle(1, canAfford ? 0x66aa66 : 0x555555);
    this.detailContainer.add(buttonBg);
    this.detailContainer.add(
      this.add
        .text(WOUND_ROW_X + 140, y, 'Treat', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: canAfford ? '#ffffff' : '#777777',
        })
        .setOrigin(0.5),
    );

    if (canAfford) {
      buttonBg.setInteractive({ useHandCursor: true });
      buttonBg.on('pointerdown', () => this.treatWound(hero.id, woundIndex));
    }
  }

  private treatWound(heroId: string, woundIndex: number): void {
    const state = appState.get();
    const hero = listHeroes(state.roster).find((h) => h.id === heroId);
    if (!hero) return;
    if (woundIndex < 0 || woundIndex >= hero.wounds.length) return;
    const cost = HOSPITAL_TREATMENT_COST;
    if (balance(state.vault) < cost) return;

    const treatedHero = treatHeroWound(hero, woundIndex);
    const newRoster = updateHero(state.roster, treatedHero);
    const newVault = spend(state.vault, cost);

    appState.update((s) => ({ ...s, roster: newRoster, vault: newVault }));

    this.rebuild();
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('camp');
  }
}
```

- [ ] **Step 2.2: Add the Hospital tile to `camp_scene.ts`**

Open `src/scenes/camp_scene.ts`. Find the existing three `buildBuilding` calls in `create()`:

```typescript
this.buildBuilding('Tavern', 180, 0x664433, 100, 110, 'tavern_panel');
this.buildBuilding('Barracks', 440, 0x555555, 100, 130, 'barracks_panel');
this.buildBuilding('Noticeboard', 720, 0x998866, 80, 60, 'noticeboard_panel');
```

Add the Hospital line between Barracks and Noticeboard:

```typescript
this.buildBuilding('Tavern', 180, 0x664433, 100, 110, 'tavern_panel');
this.buildBuilding('Barracks', 440, 0x555555, 100, 130, 'barracks_panel');
this.buildBuilding('Hospital', 580, 0x885566, 100, 100, 'hospital_panel');
this.buildBuilding('Noticeboard', 720, 0x998866, 80, 60, 'noticeboard_panel');
```

- [ ] **Step 2.3: Register the scene in `main.ts`**

Open `src/main.ts`. Add the import alongside the other panel imports:

```typescript
import { HospitalPanelScene } from './scenes/hospital_panel_scene';
```

Add `HospitalPanelScene` to the scene list. Place it next to `BarracksPanelScene` for grouping:

```typescript
scene: [
  BootScene,
  CampScene,
  TavernPanelScene,
  BarracksPanelScene,
  HospitalPanelScene,
  NoticeboardPanelScene,
  DungeonScene,
  CombatScene,
  CampScreenScene,
  EquipPanelScene,
  PerkOverlayScene,
  ShopOverlayScene,
  MainScene,
  ExplorerScene,
],
```

- [ ] **Step 2.4: Run tsc and the full test suite**

Run: `npx tsc --noEmit && npm test`

Expected: PASS / green. No new tests added in Task 2 (Phaser convention), so total stays at Task 1's baseline + 6.

- [ ] **Step 2.5: Smoke-check the build**

Run: `npm run build`

Expected: succeeds; produces `dist/` output. (Catches Phaser-side compile errors that `tsc --noEmit` may miss in some configurations.)

- [ ] **Step 2.6: Commit**

```bash
git add src/scenes/hospital_panel_scene.ts src/scenes/camp_scene.ts src/main.ts
git commit -m "feat(camp): Hospital scene with wound treatment UI"
```

---

## Closing checklist

- [ ] **Both tasks landed in 2 commits**, with green tests + tsc.
- [ ] **No imports of `phaser` under `src/data/`.** Verify via:
  ```bash
  grep -r "from 'phaser'" src/data || echo "OK — no phaser imports"
  ```
  Expected output: `OK — no phaser imports`.
- [ ] **Manual play verification** (not enforced by automated tests):
  - Hospital tile appears between Barracks and Noticeboard on the camp screen.
  - Clicking Hospital opens the panel.
  - With no wounded heroes: panel shows "All heroes are healthy."
  - With wounded heroes: list pane shows them; selecting one shows wounds in the right pane.
  - Treat button: if affordable, click removes wound and deducts gold. If not affordable, button is greyed and inert.
  - ESC and × close the panel.
- [ ] **Out-of-scope follow-ups** the spec called out:
  - Cluster B · 9 — Wound display on hero card + Barracks (reuses `describeWoundEffect`).
  - Hospital level / quota cost model (gdd §6) — Tier 3.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster B · 1 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commits, awaiting user direction per CLAUDE.md.

**Test count delta from baseline:** +6 (Task 1's `describeWoundEffect` cases). Task 2 adds no tests (scene-layer convention).
