# Camp Node UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the auto-leave stub in `dungeon_scene.ts` with a launchable overlay scene that lets the player pick from Heal Party / Treat Wound / Leave Dungeon at a camp node. Three states inside one scene, content swaps in place.

**Architecture:** Two sequential tasks.

1. Create `CampNodeOverlayScene` (full 3-state overlay) and register it in `main.ts`.
2. Replace the auto-leave stub in `dungeon_scene.ts` with `scene.launch('camp_node_overlay') + scene.pause()`.

**Tech Stack:** TypeScript, Phaser 3. Scene-layer; no unit tests (Phaser convention).

**Spec:** `docs/superpowers/specs/2026-04-29-camp-node-ui-design.md`. Read before starting.

---

## Task 1: Create `CampNodeOverlayScene` + register

Create the new overlay scene with all three states (`main`, `treat_picker`, `leave_confirm`). Register in `main.ts`'s scene list.

**Files:**
- Create: `src/scenes/camp_node_overlay_scene.ts`
- Modify: `src/main.ts`

- [ ] **Step 1.1: Create `camp_node_overlay_scene.ts`**

Create `src/scenes/camp_node_overlay_scene.ts` with this exact content:

```typescript
import * as Phaser from 'phaser';
import { removeHero, tickRosterWounds, updateHero } from '../camp/roster';
import { addItems } from '../camp/stash';
import { credit } from '../camp/vault';
import type { WoundId } from '../data/types';
import { WOUNDS, describeWoundEffect } from '../data/wounds';
import { chooseCampNodeEffect } from '../run/run_state';
import { createRngFromState } from '../util/rng';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 540;
const PANEL_H = 380;

const TITLE_Y = 110;
const BACK_X = 720;
const BACK_Y = TITLE_Y;

const OPTION_X = PANEL_CX;
const OPTION_W = 400;
const OPTION_H = 60;
const OPTION_Y_BASE = 175;
const OPTION_STRIDE = 70;

const WOUND_ROW_X = PANEL_CX;
const WOUND_ROW_W = 460;
const WOUND_ROW_H = 50;
const WOUND_ROW_Y_BASE = 175;
const WOUND_ROW_STRIDE = 56;

const PREVIEW_Y = 180;
const PREVIEW_LINE_HEIGHT = 22;
const CONFIRM_BUTTON_Y = 360;
const CONFIRM_BUTTON_W = 200;
const CONFIRM_BUTTON_H = 36;

type OverlayState = 'main' | 'treat_picker' | 'leave_confirm';

export class CampNodeOverlayScene extends Phaser.Scene {
  private contentContainer!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;
  private backButton?: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text };
  private state: OverlayState = 'main';

  constructor() {
    super('camp_node_overlay');
  }

  create(): void {
    this.state = 'main';
    this.buildBackgroundAndPanel();
    this.contentContainer = this.add.container(0, 0);
    this.rerender();
  }

  private buildBackgroundAndPanel(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0x666666);

    this.titleText = this.add
      .text(PANEL_CX, TITLE_Y, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }

  private rerender(): void {
    this.contentContainer.removeAll(true);
    this.destroyBackButton();

    if (this.state === 'main') {
      this.titleText.setText('Camp');
      this.buildMain();
    } else if (this.state === 'treat_picker') {
      this.titleText.setText('Camp · Treat Wound');
      this.buildBackButton();
      this.buildTreatPicker();
    } else {
      this.titleText.setText('Camp · Leave Dungeon');
      this.buildBackButton();
      this.buildLeaveConfirm();
    }
  }

  private setOverlayState(s: OverlayState): void {
    this.state = s;
    this.rerender();
  }

  private destroyBackButton(): void {
    if (this.backButton) {
      this.backButton.bg.destroy();
      this.backButton.label.destroy();
      this.backButton = undefined;
    }
  }

  private buildBackButton(): void {
    const bg = this.add
      .rectangle(BACK_X, BACK_Y, 60, 26, 0x444444)
      .setStrokeStyle(1, 0x888888);
    const label = this.add
      .text(BACK_X, BACK_Y, 'Back', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.setOverlayState('main'));
    this.backButton = { bg, label };
  }

  private buildMain(): void {
    const run = appState.get().runState!;
    const hasWounds = run.party.some((h) => h.wounds.length > 0);

    this.buildOptionButton(0, 'Heal Party', 'Each hero recovers 25% maxHp', true, () => {
      this.applyHealParty();
    });
    this.buildOptionButton(1, 'Treat Wound', 'Heal one wound on one hero', hasWounds, () => {
      this.setOverlayState('treat_picker');
    });
    this.buildOptionButton(2, 'Leave Dungeon', 'Bank pack and return to camp', true, () => {
      this.setOverlayState('leave_confirm');
    });
  }

  private buildOptionButton(
    index: number,
    label: string,
    subtitle: string,
    enabled: boolean,
    onClick: () => void,
  ): void {
    const y = OPTION_Y_BASE + index * OPTION_STRIDE;
    const bg = this.add
      .rectangle(OPTION_X, y, OPTION_W, OPTION_H, enabled ? 0x333333 : 0x1f1f1f)
      .setStrokeStyle(1, enabled ? 0x888888 : 0x444444);
    const labelText = this.add
      .text(OPTION_X, y - 10, label, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: enabled ? '#ffffff' : '#666666',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const subtitleText = this.add
      .text(OPTION_X, y + 12, subtitle, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: enabled ? '#bbbbbb' : '#555555',
      })
      .setOrigin(0.5);

    this.contentContainer.add(bg);
    this.contentContainer.add(labelText);
    this.contentContainer.add(subtitleText);

    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', onClick);
    }
  }

  private buildTreatPicker(): void {
    const run = appState.get().runState!;
    const pairs: { heroIndex: number; woundIndex: number; heroName: string; woundId: WoundId }[] = [];
    for (let hi = 0; hi < run.party.length; hi++) {
      const hero = run.party[hi];
      for (let wi = 0; wi < hero.wounds.length; wi++) {
        pairs.push({
          heroIndex: hi,
          woundIndex: wi,
          heroName: hero.name,
          woundId: hero.wounds[wi].id,
        });
      }
    }

    if (pairs.length === 0) {
      this.contentContainer.add(
        this.add
          .text(PANEL_CX, 220, 'No wounds to treat.', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#888888',
          })
          .setOrigin(0.5),
      );
      return;
    }

    for (let i = 0; i < pairs.length; i++) {
      this.buildWoundRow(pairs[i], i);
    }
  }

  private buildWoundRow(
    pair: { heroIndex: number; woundIndex: number; heroName: string; woundId: WoundId },
    rowIndex: number,
  ): void {
    const y = WOUND_ROW_Y_BASE + rowIndex * WOUND_ROW_STRIDE;
    const def = WOUNDS[pair.woundId];
    const desc = describeWoundEffect(def.effect);

    const rowBg = this.add
      .rectangle(WOUND_ROW_X, y, WOUND_ROW_W, WOUND_ROW_H, 0x222222)
      .setStrokeStyle(1, 0x444444);
    this.contentContainer.add(rowBg);

    this.contentContainer.add(
      this.add
        .text(WOUND_ROW_X - 210, y - 8, `${pair.heroName} · ${def.name}`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffffff',
        })
        .setOrigin(0, 0.5),
    );
    this.contentContainer.add(
      this.add
        .text(WOUND_ROW_X - 210, y + 10, desc, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#aaaaaa',
        })
        .setOrigin(0, 0.5),
    );

    const buttonBg = this.add
      .rectangle(WOUND_ROW_X + 180, y, 60, 26, 0x335533)
      .setStrokeStyle(1, 0x66aa66);
    this.contentContainer.add(buttonBg);
    this.contentContainer.add(
      this.add
        .text(WOUND_ROW_X + 180, y, 'Treat', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );

    buttonBg.setInteractive({ useHandCursor: true });
    buttonBg.on('pointerdown', () => this.applyTreatWound(pair.heroIndex, pair.woundIndex));
  }

  private buildLeaveConfirm(): void {
    const run = appState.get().runState!;
    const lines: string[] = [
      `Bank ${run.pack.gold}g and ${run.pack.items.length} item${run.pack.items.length === 1 ? '' : 's'}.`,
      `${run.party.length} hero${run.party.length === 1 ? '' : 'es'} return safe.`,
    ];
    if (run.lost.length > 0) {
      lines.push(`(${run.lost.length} hero${run.lost.length === 1 ? ' was' : 'es were'} Lost.)`);
    }

    for (let i = 0; i < lines.length; i++) {
      this.contentContainer.add(
        this.add
          .text(PANEL_CX, PREVIEW_Y + i * PREVIEW_LINE_HEIGHT, lines[i], {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#dddddd',
          })
          .setOrigin(0.5),
      );
    }

    const buttonBg = this.add
      .rectangle(PANEL_CX, CONFIRM_BUTTON_Y, CONFIRM_BUTTON_W, CONFIRM_BUTTON_H, 0x553355)
      .setStrokeStyle(2, 0xaa66aa);
    this.contentContainer.add(buttonBg);
    this.contentContainer.add(
      this.add
        .text(PANEL_CX, CONFIRM_BUTTON_Y, 'Confirm Leave', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    buttonBg.setInteractive({ useHandCursor: true });
    buttonBg.on('pointerdown', () => this.applyLeave());
  }

  private rng() {
    const rngState = appState.get().runRngState;
    if (rngState === undefined) {
      throw new Error('CampNodeOverlayScene: runRngState missing');
    }
    return createRngFromState(rngState);
  }

  private applyHealParty(): void {
    const run = appState.get().runState!;
    const rng = this.rng();
    const result = chooseCampNodeEffect(run, { kind: 'heal_party' }, rng);
    appState.update((s) => ({
      ...s,
      runState: result.runState,
      runRngState: rng.getState(),
    }));
    this.closeAndResume();
  }

  private applyTreatWound(heroIndex: number, woundIndex: number): void {
    const run = appState.get().runState!;
    const rng = this.rng();
    const result = chooseCampNodeEffect(
      run,
      { kind: 'treat_wound', heroIndex, woundIndex },
      rng,
    );
    appState.update((s) => ({
      ...s,
      runState: result.runState,
      runRngState: rng.getState(),
    }));
    this.closeAndResume();
  }

  private applyLeave(): void {
    const run = appState.get().runState!;
    const rng = this.rng();
    const result = chooseCampNodeEffect(run, { kind: 'leave' }, rng);
    const outcome = result.outcome!;
    const fallenIds = new Set(outcome.heroesFallen.map((h) => h.id));

    appState.update((s) => {
      const vault = credit(s.vault, outcome.goldBanked);
      const stash = addItems(s.stash, outcome.itemsBanked);
      let roster = s.roster;
      for (const survivor of outcome.heroesReturned) {
        if (roster.heroes.some((h) => h.id === survivor.id)) {
          roster = updateHero(roster, survivor);
        }
      }
      for (const id of fallenIds) {
        if (roster.heroes.some((h) => h.id === id)) {
          roster = removeHero(roster, id);
        }
      }
      roster = tickRosterWounds(roster);
      return {
        ...s,
        vault,
        stash,
        roster,
        runState: undefined,
        runRngState: undefined,
      };
    });

    this.scene.stop();
    this.scene.stop('dungeon');
    this.scene.start('camp');
  }

  private closeAndResume(): void {
    this.scene.stop();
    this.scene.resume('dungeon');
  }
}
```

- [ ] **Step 1.2: Register the scene in `main.ts`**

Open `src/main.ts`. Add the import alongside the other panel/overlay imports (alphabetically after `BarracksPanelScene`):

```typescript
import { CampNodeOverlayScene } from './scenes/camp_node_overlay_scene';
```

Add `CampNodeOverlayScene` to the scene list. Place it next to `ShopOverlayScene` for grouping (both are dungeon-launched overlays):

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
  CampNodeOverlayScene,
  MainScene,
  ExplorerScene,
],
```

- [ ] **Step 1.3: Run tsc and the full test suite**

Run: `npx tsc --noEmit && npm test`

Expected: PASS / green. The scene compiles but isn't yet launched by anything (the dungeon's auto-leave stub still fires). Total tests unchanged from baseline.

- [ ] **Step 1.4: Commit**

```bash
git add src/scenes/camp_node_overlay_scene.ts src/main.ts
git commit -m "feat(scenes): camp_node_overlay scene with 3-state picker"
```

---

## Task 2: Replace dungeon-scene auto-leave stub

Swap the auto-leave stub for an overlay launch. After this task, camp nodes route through the new picker UI in actual gameplay.

**Files:**
- Modify: `src/scenes/dungeon_scene.ts:248-269`

- [ ] **Step 2.1: Replace the camp branch in `handleArrival`**

Open `src/scenes/dungeon_scene.ts`. Find the camp branch in `handleArrival` (around lines 248-269):

```typescript
if (node.type === 'camp') {
  // Stub: auto-apply heal_party and advance. Cluster B · 4 replaces this
  // with a picker overlay launch (matching the shop_overlay pattern).
  const rngState = appState.get().runRngState;
  if (rngState === undefined) {
    console.warn('handleArrival: camp node reached without runRngState');
    return;
  }
  const rng = createRngFromState(rngState);
  const result = chooseCampNodeEffect(run, { kind: 'heal_party' }, rng);
  appState.update((s) => ({
    ...s,
    runState: result.runState,
    runRngState: rng.getState(),
  }));
  this.refreshHud();
  this.refreshNodeColors();
  this.refreshStatusBar();
  this.setState('walking_to_next');
  return;
}
```

Replace with:

```typescript
if (node.type === 'camp') {
  this.scene.launch('camp_node_overlay');
  this.scene.pause();
  return;
}
```

- [ ] **Step 2.2: Clean up now-unused imports in `dungeon_scene.ts`**

After the replacement, `chooseCampNodeEffect` may no longer be referenced in `dungeon_scene.ts`. Check:

Run: `grep -n 'chooseCampNodeEffect' src/scenes/dungeon_scene.ts`

If the only remaining reference is in the import line, remove it from the import block. The current import looks like:

```typescript
import {
  chooseCampNodeEffect,
  chooseNextNode,
  completeCombat,
  currentNode,
  playerPath,
  type RunState,
  type WipeOutcome,
} from '../run/run_state';
```

If `chooseCampNodeEffect` is unused, remove that one line:

```typescript
import {
  chooseNextNode,
  completeCombat,
  currentNode,
  playerPath,
  type RunState,
  type WipeOutcome,
} from '../run/run_state';
```

**Verify with `tsc`:** if it complains about an unused import (`TS6133`), confirm; if `tsc` is silent, the import is still needed somewhere else and leave it.

- [ ] **Step 2.3: Verify dungeon-scene RESUME still walks to next**

The dungeon scene's RESUME hook is what carries the player from a closed overlay to the next node. Look for the existing RESUME handler in `dungeon_scene.ts`. Find a line that includes `Phaser.Scenes.Events.RESUME`. Confirm the handler calls `setState('walking_to_next')` (or equivalent) — this is the same code the shop overlay close relies on.

If the existing RESUME handler doesn't already trigger walking, this is a blocker — stop and ask. Expected outcome: it does (since shop overlay already works).

- [ ] **Step 2.4: Run tsc + tests + build**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: all green; build produces dist output.

- [ ] **Step 2.5: Commit**

```bash
git add src/scenes/dungeon_scene.ts
git commit -m "feat(dungeon): camp nodes launch camp_node_overlay (replaces auto-leave stub)"
```

---

## Closing checklist

- [ ] **Both tasks landed in 2 commits**, with green tests + tsc + build.
- [ ] **No `phaser` imports in non-scene folders** (unchanged from baseline; Task only touches `src/scenes/` and `src/main.ts`).
- [ ] **Manual play verification:**
  - Reach a camp-bearing fork (look for the 🏕 glyph in the dungeon icon row).
  - Pick the camp branch — overlay opens with 3 buttons.
  - Treat Wound is greyed when no party member has wounds; clickable when at least one does.
  - Heal Party: party HP visibly restores; overlay closes; party walks to boss.
  - Treat Wound: list shows wound rows; click Treat removes the wound and walks to boss. Back returns to main view.
  - Leave Dungeon: confirmation panel shows current pack + party preview. Confirm transitions to main camp scene with vault and stash updated. Back returns to main view.
- [ ] **Out-of-scope follow-ups** the spec called out:
  - Cluster B · 11 — "Lost" hero handling in scenes. Includes the latent bug where Lost heroes stay in the roster after camp-leave. B · 11 will fix in both `camp_screen_scene.onLeave` and `camp_node_overlay_scene.applyLeave`.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster B · 4 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commits, awaiting user direction per CLAUDE.md.

**Test count delta from baseline:** +0 (Phaser scene convention).
