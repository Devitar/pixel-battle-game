# Dungeon Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace task 15's `DungeonScene` stub with the real side-scrolling dungeon — party paperdolls walk between fixed node positions, combat resolves inline via `resolveCombat`, result/wipe panels gate transitions to `'camp'` (wipe) or `'camp_screen'` (boss victory). Also stub `CampScreenScene` with real cashout work and route the boot scene to dungeon when a run is active.

**Architecture:** Three units, sequenced bottom-up. (1) `CampScreenScene` stub at `src/scenes/camp_screen_scene.ts` registered in main.ts — gives the dungeon's boss-victory transition somewhere to land. (2) Boot scene routing change — if `saveFile.runState` is present, route to `'dungeon'` instead of `'camp'`. (3) Full rewrite of `src/scenes/dungeon_scene.ts` with a state machine (`walking_in` / `walking_to_next` / `showing_result` / `showing_wipe`), inline `resolveCombat` calls threaded with a single `Rng` instance restored from `runRngState`, and atomic `appState.update` calls that pair `runState` + `runRngState` per the save invariant.

**Tech Stack:** TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 4 (existing 493 tests stay green; no new tests), Phaser 4 (Scene, Container, Rectangle, Text, Tween, Paperdoll, pointer/keyboard input).

**Spec:** `docs/superpowers/specs/2026-04-25-dungeon-scene-design.md`

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/scenes/camp_screen_scene.ts` | **Create** | Throwaway stub with key `'camp_screen'`. Renders run summary + `Return to Camp` button that does real cashout (banks gold, updates HP, removes fallen). Task 18 replaces with Leave / Press On UI. ~80 lines. |
| `src/main.ts` | **Modify** | Register `CampScreenScene` after `DungeonScene`. |
| `src/scenes/boot_scene.ts` | **Modify** | Route to `'dungeon'` if `saveFile.runState`, else `'camp'`. ~3 lines added. |
| `src/scenes/dungeon_scene.ts` | **Rewrite** | Full side-scrolling dungeon: state machine, party paperdolls walking between nodes, inline combat, result/wipe panels, scene transitions. ~280 lines. |

The bottom-up order ensures each task can independently typecheck and the boss-victory `scene.start('camp_screen')` call in Task 3 has a real registered scene. Same lesson as Tavern/Barracks/Noticeboard: strict-mode `noUnusedLocals` rules out incremental scaffolding inside Task 3 — the dungeon scene is one rewrite.

---

## Task 1: Camp screen stub + main.ts wiring

**Files:**
- Create: `src/scenes/camp_screen_scene.ts`
- Modify: `src/main.ts`

The stub does real cashout work (banks gold, updates surviving heroes' HP, removes fallen, clears runState) so Tier 1 is end-to-end playable as soon as Task 3 lands. Task 18 reuses this code path behind the Leave button.

- [ ] **Step 1: Create `src/scenes/camp_screen_scene.ts`**

```ts
import * as Phaser from 'phaser';
import { removeHero, updateHero } from '../camp/roster';
import { credit } from '../camp/vault';
import { cashout } from '../run/run_state';
import { appState } from './app_state';

export class CampScreenScene extends Phaser.Scene {
  constructor() {
    super('camp_screen');
  }

  create(): void {
    const run = appState.get().runState;
    if (!run || run.status !== 'camp_screen') {
      console.warn('CampScreenScene entered without runState in camp_screen status');
      this.scene.start('camp');
      return;
    }

    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x111111).setOrigin(0, 0);

    this.add
      .text(480, 80, 'Floor Cleared!', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#4caf50',
      })
      .setOrigin(0.5);

    this.add
      .text(480, 130, `The Crypt · Floor ${run.currentFloorNumber}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    this.add
      .text(480, 170, `Pack: ${run.pack.gold}g · ${run.party.length} survivors`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);

    if (run.fallen.length > 0) {
      this.add
        .text(480, 210, `Fallen: ${run.fallen.map((h) => h.name).join(', ')}`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#cc6666',
        })
        .setOrigin(0.5);
    }

    const btnBg = this.add
      .rectangle(480, 360, 200, 40, 0x2a4a2a)
      .setStrokeStyle(2, 0x44cc44);
    this.add
      .text(480, 360, 'Return to Camp', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerdown', () => this.returnToCamp());

    this.add
      .text(480, 460, '(Tier 1 stub — Press On unlocks in task 18)', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#666666',
      })
      .setOrigin(0.5);
  }

  private returnToCamp(): void {
    const run = appState.get().runState!;
    const { outcome } = cashout(run);
    const fallenIds = new Set(outcome.heroesLost.map((h) => h.id));

    appState.update((s) => {
      const vault = credit(s.vault, outcome.goldBanked);
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
      return {
        ...s,
        vault,
        roster,
        runState: undefined,
        runRngState: undefined,
      };
    });

    this.scene.start('camp');
  }
}
```

- [ ] **Step 2: Register `CampScreenScene` in `src/main.ts`**

Add the import next to the other scene imports (alphabetical insertion before `DungeonScene`):

```ts
import { CampScreenScene } from './scenes/camp_screen_scene';
```

Add `CampScreenScene` to the `scene:` array, immediately after `DungeonScene`. The full updated array should read:

```ts
  scene: [
    BootScene,
    CampScene,
    TavernPanelScene,
    BarracksPanelScene,
    NoticeboardPanelScene,
    DungeonScene,
    CampScreenScene,
    MainScene,
    ExplorerScene,
  ],
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Existing tests still pass**

Run: `npm test`
Expected: 493 tests pass (no test changes).

- [ ] **Step 5: Build still succeeds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/camp_screen_scene.ts src/main.ts
git commit -m "scenes: add camp_screen stub with cashout-on-return"
```

---

## Task 2: Boot routing — route to dungeon when run is active

**Files:**
- Modify: `src/scenes/boot_scene.ts`

Closes the page-reload-mid-run gap from task 15's risks. After this task, reloading the page with an active `runState` lands the player at the dungeon (still stubbed until Task 3) instead of camp.

- [ ] **Step 1: Modify `src/scenes/boot_scene.ts`**

Replace the unconditional `this.scene.start('camp');` at the end of `create()` with a conditional route. The full updated `create()` body should read:

```ts
  create(): void {
    const rng = createRng(Date.now());
    const { saveFile } = resolveSaveState(window.localStorage, rng);
    appState.init(saveFile, window.localStorage);

    if (saveFile.runState) {
      this.scene.start('dungeon');
    } else {
      this.scene.start('camp');
    }
  }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Existing tests still pass**

Run: `npm test`
Expected: 493 tests pass.

- [ ] **Step 4: Build still succeeds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Smoke check the routing in isolation**

Run: `npm run dev`. Open `http://localhost:5173`.

Two paths to verify:

1. **No save → camp.** Clear `localStorage` (DevTools → Application → Local Storage → delete `pixel-battle-game/save`), reload. Camp scene loads as before.
2. **Active runState → dungeon stub.** Hire 3 heroes, descend via Noticeboard. While the dungeon stub is showing, reload the page. Boot routes to `'dungeon'` and the (still stub) dungeon scene re-appears. Press ESC to abandon — back to camp.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/boot_scene.ts
git commit -m "boot: route to dungeon when save has active runState"
```

---

## Task 3: Rewrite `DungeonScene` with state machine + walking + inline combat

**Files:**
- Rewrite: `src/scenes/dungeon_scene.ts`

Full rewrite in one task — strict-mode `noUnusedLocals` rules out incremental scaffolding (same lesson as Tavern/Barracks/Noticeboard). The single file holds: scene state machine, RNG threading, party-container build, node icons + labels, HUD, status bar, walking tweens, inline `resolveCombat`, result/wipe panels, transitions.

- [ ] **Step 1: Rewrite `src/scenes/dungeon_scene.ts`**

Replace the entire contents of the file with:

```ts
import * as Phaser from 'phaser';
import { removeHero } from '../camp/roster';
import { resolveCombat } from '../combat/combat';
import type { CombatResult } from '../combat/types';
import { heroToLoadout } from '../render/hero_loadout';
import { Paperdoll } from '../render/paperdoll';
import { buildCombatState } from '../run/combat_setup';
import {
  completeCombat,
  currentNode,
  type WipeOutcome,
} from '../run/run_state';
import { createRngFromState, type Rng } from '../util/rng';
import { appState } from './app_state';

type DungeonSceneState =
  | 'walking_in'
  | 'walking_to_next'
  | 'showing_result'
  | 'showing_wipe';

const NODE_X = [180, 360, 540, 720] as const;
const NODE_Y = 460;
const NODE_LABEL_Y = 498;
const PARTY_BASE_Y = 440;
const PARTY_OFFSCREEN_X = -80;
const SLOT_X_OFFSETS = [-40, 0, 40] as const;

const COMBAT_NODE_REWARD = 15;
const BOSS_NODE_REWARD = 100;

const WALK_IN_DURATION = 800;
const WALK_NEXT_DURATION = 600;

export class DungeonScene extends Phaser.Scene {
  private state!: DungeonSceneState;
  private rng!: Rng;
  private partyContainer!: Phaser.GameObjects.Container;
  private nodeIcons: Phaser.GameObjects.Text[] = [];
  private nodeLabels: Phaser.GameObjects.Text[] = [];
  private hudFloor!: Phaser.GameObjects.Text;
  private hudPack!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private resultPanel?: Phaser.GameObjects.Container;
  private wipePanel?: Phaser.GameObjects.Container;
  private preCombatHp = new Map<string, number>();
  private lastResult?: CombatResult;
  private wipeOutcome?: WipeOutcome;

  constructor() {
    super('dungeon');
  }

  create(): void {
    // Reset per-launch state (Phaser scene reuse trap)
    this.nodeIcons = [];
    this.nodeLabels = [];
    this.preCombatHp.clear();
    this.resultPanel = undefined;
    this.wipePanel = undefined;
    this.lastResult = undefined;
    this.wipeOutcome = undefined;

    const state = appState.get();
    if (!state.runState || state.runState.status !== 'in_dungeon') {
      console.warn('DungeonScene entered without active runState');
      this.scene.start('camp');
      return;
    }

    this.rng = createRngFromState(state.runRngState!);

    this.buildBackground();
    this.buildHud();
    this.buildNodes();
    this.buildParty();
    this.buildStatusBar();
    this.refreshHud();
    this.refreshNodeColors();
    this.refreshStatusBar();

    this.setState('walking_in');
  }

  private buildBackground(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x1a1020)
      .setOrigin(0, 0);
    this.add.rectangle(0, 480, this.scale.width, 1, 0x555555).setOrigin(0, 0);
  }

  private buildHud(): void {
    this.hudFloor = this.add
      .text(16, 16, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0, 0);
    this.hudPack = this.add
      .text(944, 16, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffcc66',
      })
      .setOrigin(1, 0);
  }

  private buildNodes(): void {
    const run = appState.get().runState!;
    for (let i = 0; i < run.currentFloorNodes.length; i++) {
      const node = run.currentFloorNodes[i];
      const glyph = node.type === 'boss' ? '☠' : '⚔';
      const x = NODE_X[i];
      const icon = this.add
        .text(x, NODE_Y, glyph, {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#888888',
        })
        .setOrigin(0.5);
      const label = this.add
        .text(x, NODE_LABEL_Y, node.type, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5);
      this.nodeIcons.push(icon);
      this.nodeLabels.push(label);
    }
  }

  private buildParty(): void {
    const run = appState.get().runState!;
    this.partyContainer = this.add.container(PARTY_OFFSCREEN_X, PARTY_BASE_Y);
    for (let i = 0; i < run.party.length; i++) {
      const hero = run.party[i];
      const doll = new Paperdoll(this, SLOT_X_OFFSETS[i], 0, heroToLoadout(hero));
      doll.setScale(2);
      this.partyContainer.add(doll);
    }
  }

  private buildStatusBar(): void {
    this.statusText = this.add
      .text(16, 524, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#aaaaaa',
      })
      .setOrigin(0, 0);
  }

  private setState(next: DungeonSceneState): void {
    this.state = next;
    switch (next) {
      case 'walking_in':
        this.tweenPartyTo(
          this.partyXForNode(this.currentNodeIndex()),
          WALK_IN_DURATION,
          'Cubic.easeOut',
          () => this.startCombatAtCurrentNode(),
        );
        break;
      case 'walking_to_next':
        this.tweenPartyTo(
          this.partyXForNode(this.currentNodeIndex()),
          WALK_NEXT_DURATION,
          'Cubic.easeInOut',
          () => this.startCombatAtCurrentNode(),
        );
        break;
      case 'showing_result':
        this.buildResultPanel();
        break;
      case 'showing_wipe':
        this.buildWipePanel();
        break;
    }
  }

  private tweenPartyTo(
    targetX: number,
    duration: number,
    ease: string,
    onComplete: () => void,
  ): void {
    this.tweens.add({
      targets: this.partyContainer,
      x: targetX,
      duration,
      ease,
      onComplete,
    });
  }

  private partyXForNode(nodeIndex: number): number {
    return NODE_X[nodeIndex] - 80;
  }

  private currentNodeIndex(): number {
    return appState.get().runState!.currentNodeIndex;
  }

  private startCombatAtCurrentNode(): void {
    const run = appState.get().runState!;
    const node = currentNode(run);

    this.preCombatHp.clear();
    for (const hero of run.party) {
      this.preCombatHp.set(hero.id, hero.currentHp);
    }

    const combatState = buildCombatState(run.party, node.encounter);
    const result = resolveCombat(combatState, this.rng);
    const { runState: nextRun, wipe } = completeCombat(run, result);

    appState.update((s) => ({
      ...s,
      runState: nextRun,
      runRngState: this.rng.getState(),
    }));

    if (wipe) {
      this.wipeOutcome = wipe;
      this.setState('showing_wipe');
    } else {
      this.lastResult = result;
      this.setState('showing_result');
    }
  }

  private buildResultPanel(): void {
    const run = appState.get().runState!;

    const isBoss = run.status === 'camp_screen';
    const justCompletedIdx = isBoss ? run.currentNodeIndex : run.currentNodeIndex - 1;
    const completedNode = run.currentFloorNodes[justCompletedIdx];
    const reward =
      completedNode.type === 'boss'
        ? BOSS_NODE_REWARD * run.currentFloorNumber
        : COMBAT_NODE_REWARD * run.currentFloorNumber;

    const bg = this.add
      .rectangle(0, 0, 320, 180, 0x1a1a1a)
      .setStrokeStyle(2, 0x666666);
    const title = this.add
      .text(0, -65, 'Victory!', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#4caf50',
      })
      .setOrigin(0.5);
    const gold = this.add
      .text(0, -42, `+${reward}g`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);

    const lines: Phaser.GameObjects.Text[] = [];
    let y = -18;
    for (const hero of run.party) {
      const before = this.preCombatHp.get(hero.id) ?? hero.currentHp;
      const delta = before - hero.currentHp;
      const text =
        delta === 0
          ? `${hero.name}: untouched`
          : `${hero.name}: -${delta} HP (${hero.currentHp}/${hero.maxHp})`;
      lines.push(
        this.add
          .text(0, y, text, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#aaaaaa',
          })
          .setOrigin(0.5),
      );
      y += 14;
    }

    const dismiss = this.add
      .text(0, 70, '▸ click to continue', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#888888',
        fontStyle: 'italic',
      })
      .setOrigin(0.5);

    this.resultPanel = this.add.container(480, 270, [bg, title, gold, ...lines, dismiss]);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.onResultDismiss());
  }

  private onResultDismiss(): void {
    this.resultPanel?.destroy(true);
    this.resultPanel = undefined;
    this.refreshHud();
    this.refreshNodeColors();
    this.refreshStatusBar();

    const run = appState.get().runState!;
    if (run.status === 'camp_screen') {
      this.scene.start('camp_screen');
    } else if (run.status === 'in_dungeon') {
      this.setState('walking_to_next');
    }
  }

  private buildWipePanel(): void {
    const wipe = this.wipeOutcome!;

    const bg = this.add
      .rectangle(0, 0, 400, 220, 0x1a1a1a)
      .setStrokeStyle(2, 0xcc6666);
    const title = this.add
      .text(0, -85, 'Wipe!', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#cc6666',
      })
      .setOrigin(0.5);
    const subtitle = this.add
      .text(0, -60, 'Heroes lost:', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    const lines: Phaser.GameObjects.Text[] = [];
    let y = -36;
    for (const hero of wipe.heroesLost) {
      lines.push(
        this.add
          .text(0, y, hero.name, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#ffffff',
          })
          .setOrigin(0.5),
      );
      y += 14;
    }

    const btnBg = this.add
      .rectangle(0, 80, 180, 34, 0x2a4a2a)
      .setStrokeStyle(2, 0x44cc44);
    const btnLabel = this.add
      .text(0, 80, 'Return to Camp', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerdown', () => this.onWipeReturn());

    this.wipePanel = this.add.container(480, 270, [
      bg,
      title,
      subtitle,
      ...lines,
      btnBg,
      btnLabel,
    ]);
  }

  private onWipeReturn(): void {
    const lostIds = new Set(this.wipeOutcome!.heroesLost.map((h) => h.id));

    appState.update((s) => {
      let roster = s.roster;
      for (const id of lostIds) {
        if (roster.heroes.some((h) => h.id === id)) {
          roster = removeHero(roster, id);
        }
      }
      return {
        ...s,
        roster,
        runState: undefined,
        runRngState: undefined,
      };
    });

    this.scene.start('camp');
  }

  private refreshHud(): void {
    const run = appState.get().runState!;
    const total = run.currentFloorNodes.length;
    const displayIdx =
      run.status === 'camp_screen' ? total : run.currentNodeIndex + 1;
    this.hudFloor.setText(
      `The Crypt · Floor ${run.currentFloorNumber} · Node ${displayIdx} / ${total}`,
    );
    this.hudPack.setText(`Pack: ${run.pack.gold}g`);
  }

  private refreshNodeColors(): void {
    const run = appState.get().runState!;
    for (let i = 0; i < this.nodeIcons.length; i++) {
      const node = run.currentFloorNodes[i];
      const isBoss = node.type === 'boss';
      let color: string;
      if (i < run.currentNodeIndex) color = '#444444';
      else if (i === run.currentNodeIndex && run.status === 'in_dungeon') color = '#ffcc66';
      else color = isBoss ? '#cc6666' : '#888888';
      this.nodeIcons[i].setColor(color);
      this.nodeLabels[i].setColor(i < run.currentNodeIndex ? '#555555' : '#aaaaaa');
    }
  }

  private refreshStatusBar(): void {
    const run = appState.get().runState!;
    const parts = run.party.map((h) => `${h.name} ${h.currentHp}/${h.maxHp}`);
    this.statusText.setText(parts.join(' · '));
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Existing tests still pass**

Run: `npm test`
Expected: 493 tests pass (no test changes; this task adds no tests).

- [ ] **Step 4: Production build succeeds**

Run: `npm run build`
Expected: `tsc + vite build` finishes without errors.

- [ ] **Step 5: Smoke test (manual, dev server)**

Run: `npm run dev`. Open `http://localhost:5173`.

Walk through the spec's smoke-test sequence (`docs/superpowers/specs/2026-04-25-dungeon-scene-design.md` §Tests > Smoke test):

1. **Start a fresh run via the noticeboard.** Hire 3 heroes at the Tavern, click Noticeboard → Crypt → drag 3 heroes → Descend.
2. **Dungeon scene appears.** Background dark purple `#1a1020`. HUD top-left `The Crypt · Floor 1 · Node 1 / 4`. HUD top-right `Pack: 0g`. Four node icons at x=180/360/540/720 — first three ⚔, last ☠. Status bar `Eira 20/20 · Luna 14/14 · Soren 15/15` (or whatever names you hired). Party paperdolls slide in from off-screen-left to node 0's position (~800ms tween, ease-out).
3. **Combat resolves automatically** when the party reaches node 0. Result panel: `Victory!`, `+15g`, per-hero HP-delta lines (or `untouched`). HUD pack updates to `15g`. Click panel — it dismisses; node 0 colors switch to `cleared` (gray); node 1 highlights (yellow).
4. **Party walks to node 1** (~600ms tween, ease-in-out). Combat fires. Repeat for nodes 1 and 2. Each combat yields `+15g`.
5. **Reach the boss (node 3).** Walk-tween, then boss combat. Result panel: `Victory!` + `+100g`. Click — scene swaps to `camp_screen`.
6. **Camp screen stub.** Title `Floor Cleared!`, run summary (`Pack: Ng · M survivors`), `Return to Camp` button. Click. Camp scene appears: gold HUD reflects banked gold (pre-run gold + total pack); surviving heroes still in roster with post-run HP; fallen heroes (if any) removed.
7. **Inspect localStorage `pixel-battle-game/save`.** `runState` and `runRngState` absent. `vault.gold` incremented by banked total. `roster.heroes` is the surviving subset.
8. **Wipe scenario.** Hire 3 heroes; in DevTools, set their `currentHp` to 1 each on the save (so they can't survive a single hit). Reload, descend, fight. Wipe panel: `Wipe!`, `Heroes lost: ...`, `Return to Camp`. Click. Camp: roster missing the lost heroes; runState cleared.
9. **Page reload mid-run.** During step 4 (one combat done, party at or walking toward node 1), reload. Boot routes to `'dungeon'`. Dungeon scene resumes with `currentNodeIndex` correct (Node 2 / 4 in HUD), party walks in to that node's position, next combat fires. Combat outcomes deterministic from saved rng state.
10. **Survivor HP persistence.** After `Return to Camp`, open Barracks. Surviving heroes show post-run HP, not pre-run. Stat lines reflect the damage taken.

If any step diverges, stop and debug before committing. Most likely friction points: tween orchestration on resume (step 9), result-panel `completedNode` lookup for boss vs combat (the `isBoss` branch), or the wipe-panel's `Hero` lookup if any roster references diverge.
Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/dungeon_scene.ts
git commit -m "dungeon: rewrite stub with side-scrolling walking + inline combat"
```

---

## Verification summary

After all three tasks:

- `npx tsc --noEmit` — clean
- `npm test` — 493 tests passing (no new tests; pure-logic deps unchanged)
- `npm run build` — succeeds
- Manual smoke test — all 10 steps pass
- Page-reload-mid-run gap closed (boot routes to dungeon when `runState` set)
- Tier 1 fully end-to-end playable: hire → descend → fight → cashout → bank gold → continue

---

## Out of scope (per spec §Risks and follow-ups)

- Combat animation (task 17 introduces the combat scene as an animation layer)
- Combat-log review UI
- "Ready to fight" prompt at a node
- Abandon-from-dungeon UI (intentionally absent)
- Press On path through `camp_screen` (task 18 territory; stub only exposes Return to Camp)
- Floor-transition art / camera scroll for longer floors (Tier 2 dungeons)
- Visual damage states / HP overlays on party paperdolls (Tier 2 polish)
- Resume-skipping the walk-in tween (Tier 2 polish)

---

## Notes for the implementer

- **Phaser scene reuse trap.** `create()` runs every `scene.start`, but the JS instance persists. The state reset at the top of `create()` (clearing arrays, undefining optional refs, calling `preCombatHp.clear()`) is load-bearing for re-entries. Same pattern as Tavern/Barracks/Noticeboard.
- **Single rng instance for the scene's lifetime.** `create()` creates one `Rng` from `runRngState`; every `resolveCombat` call advances it; `appState.update` after each combat persists `rng.getState()` paired with the new `runState`. Splitting into multiple rng instances would break combat determinism on resume.
- **`completeCombat` advances `currentNodeIndex` for combat nodes, but not for the boss.** `buildResultPanel` branches on `run.status === 'camp_screen'` (boss just completed → use `currentNodeIndex` for the lookup) vs `'in_dungeon'` (combat just completed → use `currentNodeIndex - 1`). Off-by-one bugs here would point the result panel at the wrong node and miscompute the gold reward.
- **`refreshHud`'s `displayIdx` mirrors that branch.** When status is `camp_screen` (boss done), display the total node count (4 / 4); otherwise display `currentNodeIndex + 1` (1-indexed for the player).
- **Party paperdoll placement.** Container starts at `(PARTY_OFFSCREEN_X, PARTY_BASE_Y) = (-80, 440)`. Paperdolls are children at relative x `[-40, 0, 40]` for slots [0, 1, 2]. The container's `.x` is the only thing that tweens during walking; children stay relative.
- **Result panel click target.** Only the panel `bg` is interactive — clicking the title / lines / dismiss-hint does nothing because they're added on top of `bg` but aren't themselves interactive. Phaser's hit testing prefers top-most interactive object; the bg gets the click via the hit-test-fall-through pattern (same idiom as the slot bg in Barracks / Noticeboard).
- **Wipe panel button is a separate `bg` rectangle.** Click target is `btnBg`, not the panel bg. Clicking the wipe-panel title / fallen-list does nothing — that's by design.
- **`onWipeReturn`'s atomic update.** Roster mutation + `runState`/`runRngState` clear in the same producer call. Any split would risk an intermediate save state where roster is mutated but runState is still set (or vice-versa). The save invariant requires the pairing.
- **Camp_screen stub does real cashout work.** Banks gold, updates surviving heroes, removes fallen. Task 18 reuses this code path behind the Leave button. Don't be tempted to "stub" it as a pure-display screen — the player needs the cashout to happen for Tier 1 to feel rewarding.
- **Boot routing is binary.** No "resume run prompt." Players can't discard a run via UI; closing the tab is the workaround until Tier 2 adds an abandon flow.
