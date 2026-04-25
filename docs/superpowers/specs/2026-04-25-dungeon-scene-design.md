# Dungeon Scene (Tier 1)

**Status:** Design · **Date:** 2026-04-25 · **Source TODO:** Cluster B, task 16

## Purpose

Replace task 15's `DungeonScene` stub with the real side-scrolling dungeon: party paperdolls walking between fixed node positions, inline combat resolution via `resolveCombat`, result/wipe panels, and clean transitions to either `camp` (wipe) or `camp_screen` (boss victory). Also closes the page-reload-mid-run gap by routing the boot scene to `'dungeon'` whenever a save has `runState`. Stubs `CampScreenScene` (key `'camp_screen'`) so the boss-victory transition has somewhere to land — task 18 replaces the body.

## Dependencies and invariants

**Vocabulary from prior tasks:**
- `RunState` shape (task 6): `dungeonId`, `seed`, `party`, `pack`, `currentFloorNumber`, `currentFloorNodes`, `currentNodeIndex`, `status`, `fallen`.
- `RunStatus = 'in_dungeon' | 'camp_screen' | 'ended'`.
- `currentNode(runState)` reads the active node (task 6).
- `completeCombat(runState, result)` advances state, returns `{ runState, wipe? }` (task 6).
- `cashout(runState)` returns `{ runState (status='ended'), outcome }` (task 6).
- `buildCombatState(party, encounter)` (task 6 helper, `combat_setup.ts`).
- `resolveCombat(state, rng)` returns `CombatResult` (task 4).
- `Paperdoll` + `heroToLoadout` (tasks 0 + 11).
- `removeHero`, `updateHero`, `listHeroes` (task 7).
- `credit` (task 7).
- `appState.update(producer)` for atomic save with auto-persist (task 10).
- `createRngFromState(state)` (task 9).
- Save invariant (task 9, `save.ts:20`): `runState` and `runRngState` must be both present or both absent.
- Boot scene's existing `resolveSaveState` → `appState.init` flow (task 10).

**New invariants this spec declares:**
- **Single rng instance per scene lifetime.** `dungeon.create()` creates one `Rng` from `runRngState` and reuses it for every `resolveCombat` call. After every combat, `appState.update` persists both the new `runState` and `rng.getState()` together.
- **Inline combat resolution, no scene swap.** `resolveCombat` runs synchronously between frames; combat is mechanically invisible in this task. Task 17 will refactor by introducing the combat scene as an animation layer.
- **State-machine driven transitions.** `walking_in` → (combat) → `showing_result` ↔ `walking_to_next` → ... → `showing_result` → `scene.start('camp_screen')` (boss victory) | `showing_wipe` → `scene.start('camp')` (wipe). No `idle_at_node` state — combat fires immediately on tween-complete.
- **Atomic mutations.** Every `appState.update` writes paired `runState` + `runRngState` (or both `undefined`) to honor the save-pairing invariant. The wipe handler also mutates `roster` in the same producer; the camp-screen stub mutates `roster` + `vault` in the same producer.
- **Boot routes by runState.** If the loaded `saveFile.runState` is set, boot transitions to `'dungeon'`. Otherwise to `'camp'`. The dungeon scene's `runRngState` non-null assertion is justified by this invariant + the save-pairing check.
- **No abandon path.** ESC does nothing during dungeon play. Player must close the tab to "abandon" (run state persists). This is intentionally rougher than the task-15 stub.
- **Camp-screen stub does real cashout work.** Banks pack gold, updates surviving heroes' HP, removes fallen heroes from roster, clears `runState`/`runRngState`. Task 18 reuses this logic behind a `Leave` button alongside `Press On`.

## Module layout

| Path | Action | Responsibility |
|---|---|---|
| `src/scenes/dungeon_scene.ts` | **Rewrite** | Replace task 15's stub. Side-scrolling level with party walking, inline combat, result/wipe panels, scene transitions. ~280 lines. |
| `src/scenes/camp_screen_scene.ts` | **Create** | Throwaway stub. Run summary + `Return to Camp` button that does cashout (real work). Task 18 replaces with Leave / Press On. ~80 lines. |
| `src/scenes/boot_scene.ts` | **Modify** | Route to `'dungeon'` if `saveFile.runState`, else `'camp'`. ~3 lines added. |
| `src/main.ts` | **Modify** | Register `CampScreenScene` after `DungeonScene`. |

**Imports for `dungeon_scene.ts`:** `phaser`, `appState`, `currentNode` + `completeCombat` from run/run_state, `buildCombatState` from run/combat_setup, `resolveCombat` from combat/combat, `heroToLoadout` from render/hero_loadout, `Paperdoll` from render/paperdoll, `Hero` type, `Rng` + `createRngFromState` from util/rng, `CombatResult` + `WipeOutcome` types.

**Imports for `camp_screen_scene.ts`:** `phaser`, `appState`, `cashout` from run/run_state, `credit` from camp/vault, `removeHero` + `updateHero` from camp/roster.

## Layout (coordinates inside 960×540 viewport)

| Element | Position (center unless noted) | Size | Notes |
|---|---|---|---|
| Background fill | (0, 0) origin | 960×540 | `#1a1020` solid (dark crypt purple) |
| HUD top-left | (16, 16) origin (0, 0) | 14px white | `The Crypt · Floor {N} · Node {M} / 4` |
| HUD top-right | (944, 16) origin (1, 0) | 14px tan `#ffcc66` | `Pack: {gold}g` |
| Ground line | y=480 | 960×1 strip `#555` | full-width baseline |
| Node icons | x=180, 360, 540, 720, y=460 | 32×32 text glyph | nodes 0..2 = ⚔, node 3 = ☠ |
| Node labels | per node, (icon_x, 498) | 9px gray | `combat`, `boss`, etc. |
| Party formation | tweens, base y=440 | 3 paperdolls scale 2 (32×32 each), 8px gaps → 112 wide | slot 1 leftmost (front), slot 3 rightmost |
| Status bar | (16, 524) origin (0, 0) | 11px gray | `Eira 12/20 · Luna 10/14 · Soren 15/15` |
| Result panel | (480, 270) | 320×180 | `#1a1a1a` fill, `#666` 2px border |
| Wipe panel | (480, 270) | 400×220 | `#1a1a1a` fill, `#cc6666` 2px border |

**Node colors (set by `refreshNodeColors`):**
- `cleared` (idx < currentNodeIndex): icon + label `#444`/`#555`
- `current` (idx === currentNodeIndex): icon + label `#ffcc66`
- `upcoming` combat (idx > currentNodeIndex, type='combat'): `#888`/`#aaa`
- `upcoming` boss (type='boss', idx !== currentNodeIndex): `#cc6666`
- `current` boss (type='boss', idx === currentNodeIndex): `#ffcc66`

**Party position math:**
- Formation center = `nodeX - 80` (formation right edge ~24px left of node icon)
- Walk-in: tween from `x=-80` (off-screen) to `x=100` (node 0's party position) over 800ms, ease-out
- Inter-node walk: 600ms, ease-in-out (180px segments)
- Per-paperdoll x within formation: `partyCenter + (slotIndex - 1) * 40` (so slot 1 at center-40, slot 2 at center, slot 3 at center+40)

**Result panel content:**
- Title `Victory!` (14px `#4caf50`, y=-65)
- Gold line `+{N}g` (12px `#ffcc66`, y=-42)
- Per-hero HP lines (10px gray, y starts at -18, stride 14): `{name}: -{delta} HP ({cur}/{max})` if delta > 0, else `{name}: untouched`
- Dismiss hint `▸ click to continue` (9px italic gray, y=70)

**Wipe panel content:**
- Title `Wipe!` (16px `#cc6666`, y=-85)
- Subtitle `Heroes lost:` (12px gray, y=-60)
- One line per fallen hero (11px white, y starts at -36, stride 14)
- `Return to Camp` button at (0, 80), 180×34 — green (`#2a4a2a` fill, `#44cc44` border)

## Scene state machine

```ts
type DungeonSceneState =
  | 'walking_in'       // initial walk from off-screen to node 0
  | 'walking_to_next'  // tween between nodes after a result-panel dismiss
  | 'showing_result'   // result panel up, awaiting click
  | 'showing_wipe';    // wipe panel up, awaiting click
```

**Scene-local fields:**
```ts
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
```

## `create()` flow

1. Reset per-launch state (Phaser scene reuse trap): clear arrays, undefined optional refs.
2. Read `appState.get()`. If `runState` is undefined or `runState.status !== 'in_dungeon'`, `console.warn` + `scene.start('camp')` — defensive guard.
3. `this.rng = createRngFromState(saveFile.runRngState!)` — non-null per save invariant.
4. Build background, ground line, HUD top-left/right, status bar (initial text content set by `refreshHud` / `refreshStatusBar`).
5. Build node icons + labels at fixed x positions for `runState.currentFloorNodes` (always 4 nodes per Crypt floor).
6. Build `partyContainer` with 3 paperdolls (one per `runState.party[i]`, positions `(i-1)*40` within container), placed at off-screen-left `(x=-80, y=440)`.
7. Refresh HUD + node colors + status text.
8. `setState('walking_in')` — kicks off the initial tween.

## `setState(next)`

```ts
private setState(next: DungeonSceneState): void {
  this.state = next;
  switch (next) {
    case 'walking_in':
      this.tweenPartyTo(
        this.partyXForNode(this.currentNodeIndex()),
        800,
        () => this.startCombatAtCurrentNode(),
      );
      break;
    case 'walking_to_next':
      this.tweenPartyTo(
        this.partyXForNode(this.currentNodeIndex()),
        600,
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

private tweenPartyTo(targetX: number, duration: number, onComplete: () => void): void {
  this.tweens.add({
    targets: this.partyContainer,
    x: targetX,
    duration,
    ease: duration === 800 ? 'Cubic.easeOut' : 'Cubic.easeInOut',
    onComplete,
  });
}

private partyXForNode(nodeIndex: number): number {
  return [180, 360, 540, 720][nodeIndex] - 80;
}

private currentNodeIndex(): number {
  return appState.get().runState!.currentNodeIndex;
}
```

## `startCombatAtCurrentNode()`

```ts
private startCombatAtCurrentNode(): void {
  const state = appState.get();
  const run = state.runState!;
  const node = currentNode(run);

  // Snapshot HP before combat for delta display
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
```

## `buildResultPanel()`

```ts
private buildResultPanel(): void {
  const run = appState.get().runState!;

  // After completeCombat: combat nodes advance currentNodeIndex; boss does not.
  const isBoss = run.status === 'camp_screen';
  const justCompletedIdx = isBoss ? run.currentNodeIndex : run.currentNodeIndex - 1;
  const completedNode = run.currentFloorNodes[justCompletedIdx];
  const reward = completedNode.type === 'boss'
    ? 100 * run.currentFloorNumber
    : 15 * run.currentFloorNumber;

  const bg = this.add.rectangle(0, 0, 320, 180, 0x1a1a1a).setStrokeStyle(2, 0x666666);
  const title = this.add.text(0, -65, 'Victory!', {
    fontFamily: 'monospace', fontSize: '14px', color: '#4caf50',
  }).setOrigin(0.5);
  const gold = this.add.text(0, -42, `+${reward}g`, {
    fontFamily: 'monospace', fontSize: '12px', color: '#ffcc66',
  }).setOrigin(0.5);

  const lines: Phaser.GameObjects.Text[] = [];
  let y = -18;
  for (const hero of run.party) {
    const before = this.preCombatHp.get(hero.id) ?? hero.currentHp;
    const delta = before - hero.currentHp;
    const text = delta === 0
      ? `${hero.name}: untouched`
      : `${hero.name}: -${delta} HP (${hero.currentHp}/${hero.maxHp})`;
    lines.push(this.add.text(0, y, text, {
      fontFamily: 'monospace', fontSize: '10px', color: '#aaaaaa',
    }).setOrigin(0.5));
    y += 14;
  }

  const dismiss = this.add.text(0, 70, '▸ click to continue', {
    fontFamily: 'monospace', fontSize: '9px', color: '#888888', fontStyle: 'italic',
  }).setOrigin(0.5);

  this.resultPanel = this.add.container(480, 270, [bg, title, gold, ...lines, dismiss]);

  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerdown', () => this.onResultDismiss());
}
```

## `onResultDismiss()`

```ts
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
  // 'ended' shouldn't happen here — wipe handler transitions before status reaches 'ended'.
}
```

The party paperdolls are static for Tier 1 — gear is fixed, no visible HP/damage state on the doll itself. Post-combat HP is reflected only in the status bar. Tier 2 polish is the natural place to add visible damage states or low-HP overlays on the dolls.

## `buildWipePanel()` and `onWipeReturn()`

```ts
private buildWipePanel(): void {
  const wipe = this.wipeOutcome!;

  const bg = this.add.rectangle(0, 0, 400, 220, 0x1a1a1a).setStrokeStyle(2, 0xcc6666);
  const title = this.add.text(0, -85, 'Wipe!', {
    fontFamily: 'monospace', fontSize: '16px', color: '#cc6666',
  }).setOrigin(0.5);
  const subtitle = this.add.text(0, -60, 'Heroes lost:', {
    fontFamily: 'monospace', fontSize: '12px', color: '#aaaaaa',
  }).setOrigin(0.5);

  const lines: Phaser.GameObjects.Text[] = [];
  let y = -36;
  for (const hero of wipe.heroesLost) {
    lines.push(this.add.text(0, y, hero.name, {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffffff',
    }).setOrigin(0.5));
    y += 14;
  }

  const btnBg = this.add.rectangle(0, 80, 180, 34, 0x2a4a2a).setStrokeStyle(2, 0x44cc44);
  const btnLabel = this.add.text(0, 80, 'Return to Camp', {
    fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
  }).setOrigin(0.5);
  btnBg.setInteractive({ useHandCursor: true });
  btnBg.on('pointerdown', () => this.onWipeReturn());

  this.wipePanel = this.add.container(480, 270, [bg, title, subtitle, ...lines, btnBg, btnLabel]);
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
```

## `refreshHud / refreshNodeColors / refreshStatusBar`

```ts
private refreshHud(): void {
  const run = appState.get().runState!;
  const total = run.currentFloorNodes.length;
  // For display: clamp to total when boss completes (status moves to camp_screen)
  const displayIdx = run.status === 'camp_screen' ? total : run.currentNodeIndex + 1;
  this.hudFloor.setText(`The Crypt · Floor ${run.currentFloorNumber} · Node ${displayIdx} / ${total}`);
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
```

## `CampScreenScene` stub (`src/scenes/camp_screen_scene.ts`)

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

    this.add.text(480, 80, 'Floor Cleared!', {
      fontFamily: 'monospace', fontSize: '28px', color: '#4caf50',
    }).setOrigin(0.5);

    this.add.text(480, 130, `The Crypt · Floor ${run.currentFloorNumber}`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#aaaaaa',
    }).setOrigin(0.5);

    this.add.text(480, 170, `Pack: ${run.pack.gold}g · ${run.party.length} survivors`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffcc66',
    }).setOrigin(0.5);

    if (run.fallen.length > 0) {
      this.add.text(480, 210, `Fallen: ${run.fallen.map((h) => h.name).join(', ')}`, {
        fontFamily: 'monospace', fontSize: '11px', color: '#cc6666',
      }).setOrigin(0.5);
    }

    const btnBg = this.add.rectangle(480, 360, 200, 40, 0x2a4a2a).setStrokeStyle(2, 0x44cc44);
    this.add.text(480, 360, 'Return to Camp', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff',
    }).setOrigin(0.5);
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerdown', () => this.returnToCamp());

    this.add.text(480, 460, '(Tier 1 stub — Press On unlocks in task 18)', {
      fontFamily: 'monospace', fontSize: '11px', color: '#666666',
    }).setOrigin(0.5);
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

## Boot scene modification (`src/scenes/boot_scene.ts`)

Replace the unconditional `scene.start('camp')` at the end of `create()`:

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

## `main.ts` registration

Add `CampScreenScene` import + entry to the `scene: [...]` array, after `DungeonScene`:

```ts
import { CampScreenScene } from './scenes/camp_screen_scene';
// ...
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

## Empty / edge states

- **Dungeon entered without runState.** The `create()` guard logs and routes to camp. Shouldn't happen via boot or noticeboard, but cheap insurance.
- **Page reload mid-run.** Boot routes to dungeon. The dungeon scene's `create()` reads the persisted `runState` + `runRngState` and resumes. Walk-in tween replays from off-screen — mildly redundant but visually consistent.
- **Pre-existing runState with corrupt rng pairing.** The save loader (`save.ts:60-63`) discards both fields if only one is present, so the dungeon scene can rely on the pairing being intact. If somehow both are set but rng state is invalid, `createRngFromState` accepts any 32-bit int — no crash, just a different RNG sequence.
- **All heroes start the run at HP 0** (dev-tools edit). Combat will likely wipe immediately. The result/wipe panel still renders correctly.
- **Boss combat times out** (`'timeout'` outcome). `completeCombat` treats timeout as a wipe (status='ended'). The wipe panel handles it identically to player_defeat.

## Tests

### Unit tests: none new

All pure-logic deps (`completeCombat`, `cashout`, `pressOn`, `resolveCombat`, `removeHero`, `updateHero`, `credit`, `createRngFromState`, save invariant) are already covered by tasks 4 / 6 / 7 / 9.

### Smoke test (manual, dev server)

`npm run dev`:

1. **Start a fresh run via the noticeboard.** Hire 3 heroes, click Noticeboard → Crypt → drag 3 heroes → Descend.
2. **Dungeon scene appears.** Background dark purple. HUD top-left `The Crypt · Floor 1 · Node 1 / 4`. HUD top-right `Pack: 0g`. Four node icons at x=180/360/540/720 (3 ⚔ + 1 ☠). Status bar shows party HP. Party paperdolls slide in from off-screen-left to node 0's position (~800ms tween).
3. **Combat resolves automatically.** Result panel: `Victory!`, `+15g`, per-hero HP-delta lines (or `untouched`). HUD pack updates to `15g`. Click panel — it dismisses; node 0 colors switch to `cleared`; node 1 highlights.
4. **Party walks to node 1** (~600ms tween). Combat fires. Repeat for nodes 1 and 2.
5. **Reach the boss (node 3).** Walk-tween, then boss combat. Result panel: `Victory!` + `+100g`. Click — scene swaps to `camp_screen`.
6. **Camp screen stub.** Title `Floor Cleared!`, run summary, `Return to Camp` button. Click. Camp scene appears: gold HUD reflects banked gold; surviving heroes still in roster with post-run HP; fallen heroes removed.
7. **Inspect localStorage.** `runState` and `runRngState` absent. `vault.gold` incremented by banked total. `roster.heroes` is the surviving subset.
8. **Wipe scenario.** Hire 3 heroes whose combats are likely to fail (e.g., set their HP to 1 via dev tools post-hire). Descend, fight. When the engine returns `'player_defeat'` or `'timeout'`, the wipe panel appears: `Wipe!`, `Heroes lost: ...`, `Return to Camp`. Click. Camp: roster missing the lost heroes; runState cleared.
9. **Page reload mid-run.** During step 4 (one combat done, party mid-tween toward node 1), reload page. Boot routes to `'dungeon'`. Dungeon resumes with `currentNodeIndex` correct. Combat outcomes deterministic from saved rng state.
10. **Survivor HP persistence.** After `Return to Camp` from the camp_screen stub, open Barracks. Surviving heroes show post-run HP, not pre-run.

### Automated checks

- `npx tsc --noEmit` clean.
- `npm test` — 493 tests pass.
- `npm run build` succeeds.

## Risks and follow-ups

- **No combat animation.** Combat is mechanically invisible. Task 17 introduces the combat scene and refactors `startCombatAtCurrentNode` to launch it.
- **Result panel is purely informational.** No combat-log review affordance. Tier 2 may add.
- **Combat fires immediately on tween-complete.** No "ready to fight" prompt. Tier 2 polish if players want it.
- **No abandon path.** ESC during dungeon does nothing. Player closes tab to abandon (run state persists). Intentionally rougher than the task-15 stub. Tier 2 may add a confirm-to-abandon flow.
- **Result panel assumes victory.** If `resolveCombat` ever returns a non-wipe non-victory outcome in the future, this assumption needs revisiting. Documented for the next person who touches `completeCombat`.
- **Camp-screen stub does real cashout work.** Banks gold, updates HP, removes fallen — same logic task 18 will reuse behind the Leave button. Press On is the only thing the stub doesn't expose.
- **No "press on" path tested.** Stub doesn't expose Press On; the floor-2 generation path through scenes is task 18's territory.
- **Walk-in tween replays on resume.** Mildly redundant. Tier 2 polish: detect mid-run resume and skip the intro tween.
- **HP delta math reads `appState.get().runState.party`** *after* `completeCombat`. The party here is the post-combat updated party. The "before HP" comes from `preCombatHp` (snapshot taken before `resolveCombat` was called). Assumes party member identity is preserved across `completeCombat` (it is — same `id` in new objects). If that ever changes, the lookup keys still work.
- **No floor-transition art.** Floor 1 → Floor 2 (only via task 18's Press On) reuses the same purple background.
- **No camera scroll.** All four node positions fit in the 960px viewport. Tier 2 dungeons with 5+ nodes per floor will need camera logic.
- **Boot routing is binary.** No "resume run prompt with abandon option." A player who wants to discard a run mid-play has no UI for it.
- **Party paperdolls are static.** No visible HP/damage state on the dolls themselves. Tier 2 polish hook: bind a small HP bar above each doll, or apply a red tint at low HP.
