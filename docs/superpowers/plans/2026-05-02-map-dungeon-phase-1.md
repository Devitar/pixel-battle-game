# Map-Based Dungeon Scene — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dungeon scene's icon-row + fork-picker visuals with a horizontal node-graph map. Render `currentFloorNodes` as nodes + StS-strict edges; the player advances by clicking the next-row node at fork points (the map subsumes the fork picker). Behavior stays similar to today: combat auto-fires on arrival, single-fanout transitions auto-advance, the fork is the only place the player picks. *Result: visually transformed, functionally similar.* This is Phase 1 of TODO #30; later phases add fog-of-war, richer floor generation, travel animation, and balance tuning.

**Architecture:** Two units. (1) Pure-TS layout module at `src/dungeon/map_layout.ts` that takes a `Node[]` graph + a viewport rect and returns deterministic per-node `(x, y)` positions plus edge segments. Lives below the Phaser firewall and is unit-tested in `__tests__/`. (2) Rewrite of `src/scenes/dungeon_scene.ts` to consume the layout: draw nodes (circles + glyphs + type labels), draw edges as line graphics, render a small party token at the current node's position, and make the next-row nodes clickable when `awaitingFork=true`. Old icon-row constants (`NODE_X`, `NODE_Y`, `NODE_LABEL_Y`), `buildForkPicker`/`buildForkOption`, and the BFS-from-start `pathPositionFor` helper are deleted; the scene reads positions out of the layout map directly.

No changes to `dungeon/floor.ts`, `dungeon/node.ts`, or `run/run_state.ts`. No save schema change. No new tests for the scene itself (Phaser scenes aren't unit-tested in this repo); verification is `npm run build` (typecheck) + manual smoke instructions for the user.

**Tech Stack:** TypeScript 6 (strict), Vitest 4, Phaser 4. New rendering primitives used in the scene rewrite: `Phaser.GameObjects.Graphics` for drawing edges, `Phaser.GameObjects.Container` to group node visuals, existing `Text` and `Rectangle` for glyphs and node bodies.

**Spec:** `TODO.md` entry #30 (locked design, brainstormed 2026-05-02). Specifically Q5 (horizontal layout, fits-on-screen) and Q7 (heroes as small group indicator at current node, status bar unchanged) are the visual contract; Phase 1 acceptance ("Render `currentFloorNodes` as an interactive graph (StS-strict edges, horizontal layout) instead of the icon row. Click a connected next-row node to advance.") is the functional contract — read in conjunction with Phase 1's "*Result: visually transformed, functionally similar.*" framing, which means preserve today's auto-advance behavior at single-fanout transitions; the click-to-advance applies at fork points (replacing the fork picker).

**Repo conventions** (from `CLAUDE.md` / memory):
- **No commits anywhere in this plan.** The user runs commits manually. Treat each task's "Done" point as a checkpoint where the user reviews the working tree and decides whether to commit.
- The Phaser firewall: `dungeon/` files MUST NOT `import 'phaser'`. The layout module is pure TS.
- Save schema stays at version 1; no migrations. Phase 1 introduces no `RunState` field changes.
- Don't create empty directories; both `dungeon/` and `scenes/` already exist.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/dungeon/map_layout.ts` | **Create** | Pure-TS layout: BFS-assign depth per node → group by depth into rows → distribute vertically within each row → emit `{ positions, edges, rowCount }`. ~70 lines. |
| `src/dungeon/__tests__/map_layout.test.ts` | **Create** | Tests: 5-node Crypt fixture round-trips with all positions present, start-min-x / boss-max-x ordering, fork branches share x but differ in y, all edges left-to-right, determinism, empty-input safety. ~120 lines. |
| `src/scenes/dungeon_scene.ts` | **Rewrite** | Replace icon row + fork picker with the map renderer; party becomes a small token (no paperdolls in the dungeon scene anymore — they only render in combat); edges drawn via `Graphics`. Result panel + wipe panel stay byte-identical. ~440 lines (down from 745 once `buildParty`/`rebuildParty`/paperdoll imports/`buildForkPicker`/`buildForkOption`/`pathPositionFor` are removed). |

The bottom-up order — layout first, then scene rewrite — means Task 1 lands a unit-tested helper that Task 2 can consume confidently. Task 2 is a single big rewrite because TypeScript strict-mode `noUnusedLocals` rules out incremental scaffolding (you can't half-replace the icon-row code without breaking compilation, same lesson as the original 2026-04-25 dungeon-scene plan).

---

## Task 1: Pure layout module + tests

Lays the foundation: a deterministic positioning algorithm for the node graph that the scene will render. No Phaser. Tested in isolation.

**Files:**
- Create: `src/dungeon/map_layout.ts`
- Create: `src/dungeon/__tests__/map_layout.test.ts`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL tests pass. Note the count for the post-change comparison (Task 1 adds ~7 new tests).

- [ ] **Step 1.2: Write the failing test file**

Create `src/dungeon/__tests__/map_layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '@util/rng';
import { generateFloor } from '../floor';
import type { Node } from '../node';
import { computeMapLayout } from '../map_layout';

const VIEWPORT = { left: 100, top: 80, width: 760, height: 360 } as const;

describe('computeMapLayout', () => {
  it('returns a position for every node in the input', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const layout = computeMapLayout(nodes, VIEWPORT);
    expect(layout.positions.size).toBe(nodes.length);
    for (const node of nodes) {
      expect(layout.positions.has(node.id)).toBe(true);
    }
  });

  it('start node has the smallest x, boss the largest', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const layout = computeMapLayout(nodes, VIEWPORT);
    const referenced = new Set(nodes.flatMap((n) => [...n.nextNodeIds]));
    const start = nodes.find((n) => !referenced.has(n.id))!;
    const boss = nodes.find((n) => n.type === 'boss')!;
    const startX = layout.positions.get(start.id)!.x;
    const bossX = layout.positions.get(boss.id)!.x;
    for (const node of nodes) {
      const x = layout.positions.get(node.id)!.x;
      expect(x).toBeGreaterThanOrEqual(startX);
      expect(x).toBeLessThanOrEqual(bossX);
    }
  });

  it('all edges go strictly left-to-right (Δx > 0)', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const layout = computeMapLayout(nodes, VIEWPORT);
    for (const edge of layout.edges) {
      const fromX = layout.positions.get(edge.fromId)!.x;
      const toX = layout.positions.get(edge.toId)!.x;
      expect(toX).toBeGreaterThan(fromX);
    }
  });

  it('emits one edge per (node, nextNodeId) pair from the input', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const layout = computeMapLayout(nodes, VIEWPORT);
    const expectedEdges = nodes.flatMap((n) =>
      n.nextNodeIds.map((toId) => ({ fromId: n.id, toId })),
    );
    expect(layout.edges).toHaveLength(expectedEdges.length);
    for (const expected of expectedEdges) {
      expect(layout.edges).toContainEqual(expected);
    }
  });

  it('two fork-branch nodes at the same depth share x but differ in y', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const layout = computeMapLayout(nodes, VIEWPORT);
    const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
    const [aId, bId] = fork.nextNodeIds;
    const a = layout.positions.get(aId)!;
    const b = layout.positions.get(bId)!;
    expect(a.x).toBe(b.x);
    expect(a.y).not.toBe(b.y);
  });

  it('is deterministic for the same input', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(7));
    const a = computeMapLayout(nodes, VIEWPORT);
    const b = computeMapLayout(nodes, VIEWPORT);
    expect(Array.from(a.positions.entries())).toEqual(Array.from(b.positions.entries()));
    expect(a.edges).toEqual(b.edges);
    expect(a.rowCount).toBe(b.rowCount);
  });

  it('empty node array yields an empty layout', () => {
    const layout = computeMapLayout([] as readonly Node[], VIEWPORT);
    expect(layout.positions.size).toBe(0);
    expect(layout.edges).toHaveLength(0);
    expect(layout.rowCount).toBe(0);
  });
});
```

- [ ] **Step 1.3: Run tests to verify they fail**

Run: `npx vitest run src/dungeon/__tests__/map_layout.test.ts`

Expected: All 7 tests FAIL with `Cannot find module '../map_layout'`.

- [ ] **Step 1.4: Implement the layout module**

Create `src/dungeon/map_layout.ts`:

```ts
import type { Node } from './node';

export interface MapLayoutPosition {
  readonly x: number;
  readonly y: number;
}

export interface MapLayoutEdge {
  readonly fromId: string;
  readonly toId: string;
}

export interface MapLayout {
  readonly positions: ReadonlyMap<string, MapLayoutPosition>;
  readonly edges: readonly MapLayoutEdge[];
  readonly rowCount: number;
}

export interface MapLayoutOptions {
  /** Left edge of the layout rect, in pixels. */
  readonly left: number;
  /** Top edge of the layout rect, in pixels. */
  readonly top: number;
  /** Total horizontal extent of the layout rect. Nodes span left → left + width. */
  readonly width: number;
  /** Total vertical extent of the layout rect. Rows distribute within. */
  readonly height: number;
}

export function computeMapLayout(
  nodes: readonly Node[],
  options: MapLayoutOptions,
): MapLayout {
  if (nodes.length === 0) {
    return { positions: new Map(), edges: [], rowCount: 0 };
  }

  const referenced = new Set<string>(nodes.flatMap((n) => [...n.nextNodeIds]));
  const start = nodes.find((n) => !referenced.has(n.id));
  if (!start) {
    return { positions: new Map(), edges: [], rowCount: 0 };
  }

  // BFS depth assignment from the start node.
  const depth = new Map<string, number>();
  depth.set(start.id, 0);
  const queue: string[] = [start.id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodes.find((n) => n.id === id);
    if (!node) continue;
    const d = depth.get(id)!;
    for (const nextId of node.nextNodeIds) {
      if (!depth.has(nextId)) {
        depth.set(nextId, d + 1);
        queue.push(nextId);
      }
    }
  }

  const rowCount = Math.max(...depth.values()) + 1;

  // Group node ids by row, sort each row by id for determinism.
  const byRow = new Map<number, string[]>();
  for (const [id, d] of depth) {
    const arr = byRow.get(d);
    if (arr) arr.push(id);
    else byRow.set(d, [id]);
  }
  for (const arr of byRow.values()) arr.sort();

  // Position: x = left + d * colSpacing; y = vertically centered within the rect for each row.
  const positions = new Map<string, MapLayoutPosition>();
  const colSpacing = rowCount > 1 ? options.width / (rowCount - 1) : 0;
  for (const [d, ids] of byRow) {
    const x = options.left + d * colSpacing;
    const n = ids.length;
    for (let i = 0; i < n; i++) {
      const y = options.top + (options.height * (i + 1)) / (n + 1);
      positions.set(ids[i], { x, y });
    }
  }

  // Emit edges in the order they appear in the input.
  const edges: MapLayoutEdge[] = [];
  for (const node of nodes) {
    for (const nextId of node.nextNodeIds) {
      edges.push({ fromId: node.id, toId: nextId });
    }
  }

  return { positions, edges, rowCount };
}
```

- [ ] **Step 1.5: Run the new tests to verify they pass**

Run: `npx vitest run src/dungeon/__tests__/map_layout.test.ts`

Expected: All 7 tests PASS.

- [ ] **Step 1.6: Run the full test suite to confirm nothing else broke**

Run: `npm test`

Expected: All previously-green tests still pass; baseline count + 7 new tests.

- [ ] **Step 1.7: Done — review checkpoint**

The user reviews the new module + tests in the working tree. No commit yet (CLAUDE.md says commits are user-driven). When the user is happy, proceed to Task 2.

---

## Task 2: Rewrite DungeonScene as a map renderer

Replace the icon-row + fork-picker visuals with a graph drawn from the layout module. The result/wipe/HUD/status code stays intact; only the node visuals + party positioning + fork interaction change.

**Files:**
- Modify: `src/scenes/dungeon_scene.ts`

**Behavior contract (preserved from today):**
- Walk-in tween from offscreen → start node on scene create.
- Combat auto-fires on arrival at combat/elite/boss nodes.
- Shop/camp/event nodes launch their existing overlay scenes.
- After combat, `completeCombat` advances `currentNodeId` to `fanout[0]` for single-fanout, or sets `awaitingFork=true` for the 2-branch fork.
- Result panel + wipe panel render unchanged.

**Behavior change (the Phase 1 delta):**
- The icon row is gone; the map IS the row indicator.
- The fork picker overlay is gone; when `awaitingFork=true`, the two next-row nodes on the map become hover-highlightable + clickable, and clicking calls `chooseNextNode`.
- The 3 paperdolls in the dungeon scene are replaced by a single small party token (a colored circle with a "▣▣▣" or similar 3-token glyph) at the current node's position. (Paperdolls still render in the combat scene; this only affects the dungeon hub.)

- [ ] **Step 2.1: Open `src/scenes/dungeon_scene.ts` and read the file end-to-end**

This is a rewrite-in-place of a 745-line scene. Before editing, mentally separate what stays from what's replaced:

**Stays (verbatim or near-verbatim):**
- All imports except `Paperdoll` and `heroToLoadout` (those are removed since paperdolls leave this scene).
- `DungeonSceneState` type: drop `'awaiting_fork_pick'` (the map handles forks; no separate state is needed — the scene sits idle on the map after a combat-result dismiss when `awaitingFork` is true). Keep `'walking_in' | 'walking_to_next' | 'showing_result' | 'showing_wipe'`.
- `COMBAT_NODE_REWARD`, `BOSS_NODE_REWARD`, `RARITY_HEX`, `WALK_IN_DURATION`, `WALK_NEXT_DURATION`.
- `processCombatReturn`, `buildResultPanel`, `onResultDismiss`, `buildWipePanel`, `onWipeReturn`, `buildBackground`, `buildHud`, `buildStatusBar`, `refreshHud`, `refreshStatusBar`, `startCombatAtCurrentNode` (untouched).
- Scene-resume handler in `create()` and the `processCombatReturn` flow.

**Replaced:**
- `NODE_X`, `NODE_Y`, `NODE_LABEL_Y`, `PARTY_BASE_Y`, `PARTY_OFFSCREEN_X`, `SLOT_X_OFFSETS` constants → new map layout constants.
- `buildNodes`, `nodeIcons`, `nodeLabels` fields → `buildMap` rendering nodes + edges through `Graphics`.
- `buildParty`, `rebuildParty` → `buildPartyToken` (single token, not 3 paperdolls).
- `buildForkPicker`, `buildForkOption`, `forkPicker`, `destroyForkPicker`, `onForkPick` → fold into the per-node interactivity wired in `buildMap` / `refreshNodeInteractivity`.
- `partyXForNode`, `currentNodeIndex`, `pathPositionFor` → `partyPosForNode(nodeId)` that reads `layout.positions`.
- `refreshNodeColors` → `refreshNodeStates` operating on the map nodes.
- `setState('awaiting_fork_pick')` calls (in `handleArrival` + `onResultDismiss`) → just stop in place; the map's interactivity is already live, so the scene sits idle waiting for a click. (Document this with a one-line comment near where the old `'awaiting_fork_pick'` arm used to be.)

**Step 2.1 has no command — just read the file.**

- [ ] **Step 2.2: Replace the imports and top-of-file constants**

Open `src/scenes/dungeon_scene.ts`. Replace lines 1–47 (imports + top constants) with:

```ts
import * as Phaser from 'phaser';
import { hospitalTickAmount, hospitalTreatmentCap } from '@camp/building_levels';
import { removeHero, tickRosterWounds } from '@camp/roster';
import type { CombatResult } from '@combat/types';
import { computeMapLayout, type MapLayout } from '@dungeon/map_layout';
import type { Node } from '@dungeon/node';
import type { Item, Rarity } from '@data/types';
import type { Hero } from '@heroes/hero';
import { itemAffixDescription, itemDisplayName } from '@items/selectors';
import {
  chooseNextNode,
  completeCombat,
  currentNode,
  type RunState,
  type WipeOutcome,
} from '@run/run_state';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';
import { consumeCombatResult } from './combat_handoff';

type DungeonSceneState =
  | 'walking_in'
  | 'walking_to_next'
  | 'showing_result'
  | 'showing_wipe';

// Map layout rect — the area the node graph occupies. The HUD lives at y<60
// and the status bar at y>510, so the graph sits in the middle band.
const MAP_LEFT = 120;
const MAP_TOP = 100;
const MAP_WIDTH = 720;
const MAP_HEIGHT = 380;

const PARTY_OFFSCREEN_X = -40;
// Party-token offset from the node center: token sits slightly above the node
// dot so it doesn't obscure the glyph.
const PARTY_TOKEN_Y_OFFSET = -32;

const NODE_RADIUS = 18;

const COMBAT_NODE_REWARD = 15;
const BOSS_NODE_REWARD = 100;

const RARITY_HEX: Record<Rarity, string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
};

const WALK_IN_DURATION = 800;
const WALK_NEXT_DURATION = 600;

// Per-state visual treatment for nodes on the map.
const NODE_FILL_BY_STATE = {
  cleared: 0x2a2a2a,    // visited, dimmed
  current: 0x4a3a1a,    // where the party is
  upcoming: 0x1a1a1a,   // not yet reached
  fork_choice: 0x2a3a4a, // an interactable fork branch
} as const;
const NODE_STROKE_BY_STATE = {
  cleared: 0x444444,
  current: 0xffcc66,
  upcoming: 0x666666,
  fork_choice: 0x88aaff,
} as const;
const GLYPH_COLOR_BY_STATE = {
  cleared: '#555555',
  current: '#ffcc66',
  upcoming: '#aaaaaa',
  fork_choice: '#ffffff',
} as const;
type NodeRenderState = keyof typeof NODE_FILL_BY_STATE;
```

(Removes `Paperdoll`, `heroToLoadout`, `playerPath` — none referenced after the rewrite.)

- [ ] **Step 2.3: Rewrite the class body**

Replace the entire class body (everything from `export class DungeonScene extends Phaser.Scene {` through the end of the file) with:

```ts
export class DungeonScene extends Phaser.Scene {
  private partyToken!: Phaser.GameObjects.Container;
  private layout: MapLayout = { positions: new Map(), edges: [], rowCount: 0 };
  private nodeContainers = new Map<string, Phaser.GameObjects.Container>();
  private nodeBgByNodeId = new Map<string, Phaser.GameObjects.Arc>();
  private nodeGlyphByNodeId = new Map<string, Phaser.GameObjects.Text>();
  private nodeLabelByNodeId = new Map<string, Phaser.GameObjects.Text>();
  private edgeGraphics?: Phaser.GameObjects.Graphics;
  private hudFloor!: Phaser.GameObjects.Text;
  private hudPack!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private resultPanel?: Phaser.GameObjects.Container;
  // Snapshot of party at combat start, captured before completeCombat prunes
  // fallen heroes. Used by the result panel to (a) compute per-hero HP deltas
  // and (b) render Fallen lines for heroes who didn't survive the fight.
  private preCombatParty: Hero[] = [];
  // Items added to the pack during the just-completed combat (rollLoot drops +
  // recovered fallen-hero gear). Captured by diffing pack.items length.
  private combatLoot: readonly Item[] = [];
  private wipeOutcome?: WipeOutcome;

  constructor() {
    super('dungeon');
  }

  create(): void {
    this.nodeContainers = new Map();
    this.nodeBgByNodeId = new Map();
    this.nodeGlyphByNodeId = new Map();
    this.nodeLabelByNodeId = new Map();
    this.preCombatParty = [];
    this.combatLoot = [];
    this.resultPanel = undefined;
    this.wipeOutcome = undefined;

    const state = appState.get();
    if (!state.runState || state.runState.status !== 'in_dungeon') {
      console.warn('DungeonScene entered without active runState');
      this.scene.start('camp');
      return;
    }

    this.layout = computeMapLayout(state.runState.currentFloorNodes, {
      left: MAP_LEFT,
      top: MAP_TOP,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    });

    this.buildBackground();
    this.buildHud();
    this.buildEdges();
    this.buildNodes();
    this.buildPartyToken();
    this.buildStatusBar();

    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.refreshHud();
      this.refreshNodeStates();
      this.refreshStatusBar();
      this.setState('walking_to_next');
    });

    const handoff = consumeCombatResult();
    if (handoff) {
      this.processCombatReturn(handoff.result, handoff.rngStateAfter);
    } else {
      this.refreshHud();
      this.refreshNodeStates();
      this.refreshStatusBar();
      this.setState('walking_in');
    }
  }

  private processCombatReturn(result: CombatResult, rngStateAfter: number): void {
    const run = appState.get().runState!;

    this.preCombatParty = [...run.party];
    const prePackLen = run.pack.items.length;

    // Loot roll consumes RNG; thread it through completeCombat so the post-loot
    // state is what gets persisted.
    const rng = createRngFromState(rngStateAfter);
    const { runState: nextRun, wipe } = completeCombat(run, result, rng);
    // Items added during this fight = rollLoot drop + recovered fallen-hero gear.
    // addItem appends, so the tail of pack.items past the pre-fight length is
    // exactly what was added. Stash for the result panel.
    this.combatLoot = nextRun.pack.items.slice(prePackLen);

    appState.update((s) => ({
      ...s,
      runState: nextRun,
      runRngState: rng.getState(),
    }));

    // Snap the party token to the post-combat current node so the result panel
    // is anchored sensibly. (Same behavior as the old icon-row scene — combat
    // teleports the party visually; actual walking lives in Phase 4.)
    const posAfter = this.partyTokenPosFor(nextRun.currentNodeId);
    this.partyToken.x = posAfter.x;
    this.partyToken.y = posAfter.y;

    this.refreshHud();
    this.refreshNodeStates();
    this.refreshStatusBar();

    if (wipe) {
      this.wipeOutcome = wipe;
      this.setState('showing_wipe');
    } else {
      this.setState('showing_result');
    }
  }

  private buildBackground(): void {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x1a1020)
      .setOrigin(0, 0);
    this.add.rectangle(0, 510, this.scale.width, 1, 0x555555).setOrigin(0, 0);
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

  private buildEdges(): void {
    this.edgeGraphics = this.add.graphics();
    this.refreshEdges();
  }

  private refreshEdges(): void {
    if (!this.edgeGraphics) return;
    this.edgeGraphics.clear();
    this.edgeGraphics.lineStyle(2, 0x555555, 1);
    for (const edge of this.layout.edges) {
      const from = this.layout.positions.get(edge.fromId);
      const to = this.layout.positions.get(edge.toId);
      if (!from || !to) continue;
      this.edgeGraphics.beginPath();
      this.edgeGraphics.moveTo(from.x, from.y);
      this.edgeGraphics.lineTo(to.x, to.y);
      this.edgeGraphics.strokePath();
    }
  }

  private buildNodes(): void {
    const run = appState.get().runState!;
    for (const node of run.currentFloorNodes) {
      const pos = this.layout.positions.get(node.id);
      if (!pos) continue;
      const bg = this.add
        .circle(0, 0, NODE_RADIUS, NODE_FILL_BY_STATE.upcoming)
        .setStrokeStyle(2, NODE_STROKE_BY_STATE.upcoming);
      const glyph = this.add
        .text(0, -1, glyphForNodeType(node.type), {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: GLYPH_COLOR_BY_STATE.upcoming,
        })
        .setOrigin(0.5);
      const label = this.add
        .text(0, NODE_RADIUS + 8, node.type, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5);
      const container = this.add.container(pos.x, pos.y, [bg, glyph, label]);
      this.nodeContainers.set(node.id, container);
      this.nodeBgByNodeId.set(node.id, bg);
      this.nodeGlyphByNodeId.set(node.id, glyph);
      this.nodeLabelByNodeId.set(node.id, label);

      bg.on('pointerdown', () => this.onNodeClicked(node.id));
      bg.on('pointerover', () => this.onNodeHover(node.id, true));
      bg.on('pointerout',  () => this.onNodeHover(node.id, false));
    }
  }

  private buildPartyToken(): void {
    // 3-segment token = stylized "party of 3" without paperdolls.
    const ring = this.add
      .circle(0, 0, 11, 0x222244)
      .setStrokeStyle(2, 0xffcc66);
    const text = this.add
      .text(0, -1, '◆◆◆', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);
    this.partyToken = this.add.container(PARTY_OFFSCREEN_X, MAP_TOP, [ring, text]);
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
    switch (next) {
      case 'walking_in': {
        const target = this.partyTokenPosFor(this.currentNodeIdSafe());
        this.tweenPartyTo(target.x, target.y, WALK_IN_DURATION, 'Cubic.easeOut',
          () => this.handleArrival());
        break;
      }
      case 'walking_to_next': {
        const target = this.partyTokenPosFor(this.currentNodeIdSafe());
        this.tweenPartyTo(target.x, target.y, WALK_NEXT_DURATION, 'Cubic.easeInOut',
          () => this.handleArrival());
        break;
      }
      case 'showing_result':
        this.buildResultPanel();
        break;
      case 'showing_wipe':
        this.buildWipePanel();
        break;
    }
  }

  private handleArrival(): void {
    const run = appState.get().runState;
    if (!run) return;

    if (run.awaitingFork) {
      // The map's per-node interactivity is already wired; sit idle and wait
      // for the player to click a fork branch. (Old code used a separate
      // 'awaiting_fork_pick' state with its own overlay; the map subsumes it.)
      this.refreshNodeStates();
      return;
    }

    const node = currentNode(run);
    if (node.type === 'shop') {
      this.scene.launch('shop_overlay');
      this.scene.pause();
      return;
    }
    if (node.type === 'camp') {
      this.scene.launch('camp_node_overlay');
      this.scene.pause();
      return;
    }
    if (node.type === 'event') {
      this.scene.launch('event_overlay');
      this.scene.pause();
      return;
    }

    this.startCombatAtCurrentNode();
  }

  private tweenPartyTo(
    targetX: number,
    targetY: number,
    duration: number,
    ease: string,
    onComplete: () => void,
  ): void {
    this.tweens.add({
      targets: this.partyToken,
      x: targetX,
      y: targetY,
      duration,
      ease,
      onComplete,
    });
  }

  private partyTokenPosFor(nodeId: string): { x: number; y: number } {
    const pos = this.layout.positions.get(nodeId);
    if (!pos) return { x: PARTY_OFFSCREEN_X, y: MAP_TOP };
    return { x: pos.x, y: pos.y + PARTY_TOKEN_Y_OFFSET };
  }

  private currentNodeIdSafe(): string {
    const run = appState.get().runState;
    return run ? run.currentNodeId : '';
  }

  private startCombatAtCurrentNode(): void {
    this.scene.start('combat');
  }

  private onNodeClicked(nodeId: string): void {
    const run = appState.get().runState;
    if (!run || run.status !== 'in_dungeon') return;
    if (!run.awaitingFork) return; // only fork branches are clickable
    const cur = currentNode(run);
    if (!cur.nextNodeIds.includes(nodeId)) return;
    appState.update((s) => ({
      ...s,
      runState: chooseNextNode(s.runState!, nodeId),
    }));
    this.refreshNodeStates();
    this.setState('walking_to_next');
  }

  private onNodeHover(nodeId: string, hovering: boolean): void {
    const state = this.computeNodeState(nodeId);
    if (state !== 'fork_choice') return;
    const bg = this.nodeBgByNodeId.get(nodeId);
    if (!bg) return;
    bg.setStrokeStyle(hovering ? 3 : 2, NODE_STROKE_BY_STATE.fork_choice);
  }

  private computeNodeState(nodeId: string): NodeRenderState {
    const run = appState.get().runState;
    if (!run) return 'upcoming';
    if (nodeId === run.currentNodeId) return 'current';
    if (run.awaitingFork) {
      const cur = currentNode(run);
      if (cur.nextNodeIds.includes(nodeId)) return 'fork_choice';
    }
    if (this.isNodeCleared(run, nodeId)) return 'cleared';
    return 'upcoming';
  }

  /**
   * A node is "cleared" if it is reachable backward from currentNodeId via
   * predecessor edges — i.e., the player has moved past it on the active path.
   * For the simple 4-row Crypt graph this works without a separate history list;
   * Phase 2's richer floor generator may motivate a `traversed: string[]`
   * field on RunState.
   */
  private isNodeCleared(run: RunState, nodeId: string): boolean {
    if (nodeId === run.currentNodeId) return false;
    const predecessorsOf = (id: string): string[] =>
      run.currentFloorNodes
        .filter((n) => n.nextNodeIds.includes(id))
        .map((n) => n.id);
    const seen = new Set<string>();
    const stack: string[] = predecessorsOf(run.currentNodeId);
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (id === nodeId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...predecessorsOf(id));
    }
    return false;
  }

  private refreshNodeStates(): void {
    const run = appState.get().runState;
    if (!run) return;
    for (const node of run.currentFloorNodes) {
      const state = this.computeNodeState(node.id);
      const bg = this.nodeBgByNodeId.get(node.id);
      const glyph = this.nodeGlyphByNodeId.get(node.id);
      const label = this.nodeLabelByNodeId.get(node.id);
      if (!bg || !glyph || !label) continue;
      bg.setFillStyle(NODE_FILL_BY_STATE[state]);
      bg.setStrokeStyle(2, NODE_STROKE_BY_STATE[state]);
      glyph.setColor(GLYPH_COLOR_BY_STATE[state]);
      label.setColor(state === 'cleared' ? '#555555' : '#aaaaaa');
      // Only fork-choice branches are interactive in Phase 1.
      if (state === 'fork_choice') {
        bg.setInteractive({ useHandCursor: true });
      } else {
        bg.disableInteractive();
      }
    }
  }

  private buildResultPanel(): void {
    const run = appState.get().runState!;

    const isBoss = run.status === 'camp_screen';
    let completedNode: Node;
    if (isBoss) {
      // Find the boss node (unique terminal).
      completedNode = run.currentFloorNodes.find((n) => n.nextNodeIds.length === 0)!;
    } else if (run.awaitingFork) {
      // Just cleared the fork source — currentNodeId still points at it.
      completedNode = currentNode(run);
    } else {
      // Just cleared a linear node — currentNodeId has advanced; the just-completed
      // node is the one whose nextNodeIds contains the new current id.
      completedNode = run.currentFloorNodes.find((n) =>
        n.nextNodeIds.includes(run.currentNodeId),
      )!;
    }
    const reward =
      completedNode.type === 'boss'
        ? BOSS_NODE_REWARD * run.currentFloorNumber
        : COMBAT_NODE_REWARD * run.currentFloorNumber;

    // Panel grows downward to fit dynamic loot lines. Base height fits title +
    // gold + survivor lines + dismiss; each loot line adds 14px, with a header.
    const lootCount = this.combatLoot.length;
    const lootBlockHeight = lootCount > 0 ? 16 + lootCount * 14 : 0;
    const bgHeight = 180 + lootBlockHeight;
    const dismissY = 70 + lootBlockHeight;

    const bg = this.add
      .rectangle(0, 0, 320, bgHeight, 0x1a1a1a)
      .setStrokeStyle(2, 0x666666);
    const title = this.add
      .text(0, -bgHeight / 2 + 25, 'Victory!', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#4caf50',
      })
      .setOrigin(0.5);
    const gold = this.add
      .text(0, -bgHeight / 2 + 48, `+${reward}g`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffcc66',
      })
      .setOrigin(0.5);

    const lines: Phaser.GameObjects.Text[] = [];
    let y = -bgHeight / 2 + 72;
    const survivorsById = new Map(run.party.map((h) => [h.id, h]));
    for (const preHero of this.preCombatParty) {
      const survivor = survivorsById.get(preHero.id);
      const fallen = survivor === undefined;
      const text = fallen
        ? `${preHero.name}: Fallen`
        : (() => {
            const delta = preHero.currentHp - survivor.currentHp;
            return delta === 0
              ? `${survivor.name}: untouched`
              : `${survivor.name}: -${delta} HP (${survivor.currentHp}/${survivor.maxHp})`;
          })();
      lines.push(
        this.add
          .text(0, y, text, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: fallen ? '#cc8888' : '#aaaaaa',
          })
          .setOrigin(0.5),
      );
      y += 14;
    }

    if (lootCount > 0) {
      y += 4;
      lines.push(
        this.add
          .text(0, y, 'Loot:', {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#dddddd',
          })
          .setOrigin(0.5),
      );
      y += 14;
      for (const item of this.combatLoot) {
        const name = itemDisplayName(item);
        const affixes = itemAffixDescription(item);
        const text = affixes.length > 0 ? `${name} · ${affixes}` : name;
        lines.push(
          this.add
            .text(0, y, text, {
              fontFamily: 'monospace',
              fontSize: '10px',
              color: RARITY_HEX[item.rarity],
            })
            .setOrigin(0.5),
        );
        y += 14;
      }
    }

    const dismiss = this.add
      .text(0, dismissY, '▸ click to continue', {
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
    this.refreshNodeStates();
    this.refreshStatusBar();

    const run = appState.get().runState!;
    if (run.status === 'camp_screen') {
      this.scene.start('camp_screen');
      return;
    }

    if (run.awaitingFork) {
      // Sit idle on the map; refreshNodeStates() above already lit the fork
      // branches as interactive. Player picks via onNodeClicked.
      return;
    }

    this.setState('walking_to_next');
  }

  private buildWipePanel(): void {
    const wipe = this.wipeOutcome!;
    const fallenCount = wipe.heroesFallen.length;
    const lostCount = wipe.heroesLost.length;
    const totalLines =
      fallenCount + lostCount +
      (fallenCount > 0 ? 1 : 0) +
      (lostCount > 0 ? 1 : 0);

    const baseHeight = 220;
    const extraLines = Math.max(0, totalLines - 4);
    const panelHeight = baseHeight + extraLines * 14;

    const bg = this.add
      .rectangle(0, 0, 400, panelHeight, 0x1a1a1a)
      .setStrokeStyle(2, 0xcc6666);
    const title = this.add
      .text(0, -panelHeight / 2 + 20, 'Wipe!', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#cc6666',
      })
      .setOrigin(0.5);

    const lines: Phaser.GameObjects.Text[] = [];
    let y = -panelHeight / 2 + 50;

    if (fallenCount > 0) {
      lines.push(
        this.add
          .text(0, y, 'Heroes Fallen:', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#cc8888',
          })
          .setOrigin(0.5),
      );
      y += 16;
      for (const hero of wipe.heroesFallen) {
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
    }

    if (lostCount > 0) {
      lines.push(
        this.add
          .text(0, y, 'Heroes Lost:', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#aa66aa',
          })
          .setOrigin(0.5),
      );
      y += 16;
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
    }

    const btnY = panelHeight / 2 - 30;
    const btnBg = this.add
      .rectangle(0, btnY, 180, 34, 0x2a4a2a)
      .setStrokeStyle(2, 0x44cc44);
    const btnLabel = this.add
      .text(0, btnY, 'Return to Camp', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerdown', () => this.onWipeReturn());

    this.add.container(480, 270, [bg, title, ...lines, btnBg, btnLabel]);
  }

  private onWipeReturn(): void {
    const fallenIds = new Set(this.wipeOutcome!.heroesFallen.map((h) => h.id));
    const lostIds = new Set(this.wipeOutcome!.heroesLost.map((h) => h.id));

    appState.update((s) => {
      let roster = s.roster;
      for (const id of fallenIds) {
        if (roster.heroes.some((h) => h.id === id)) {
          roster = removeHero(roster, id);
        }
      }
      for (const id of lostIds) {
        if (roster.heroes.some((h) => h.id === id)) {
          roster = removeHero(roster, id);
        }
      }
      roster = tickRosterWounds(roster, hospitalTickAmount(s.buildingLevels.hospital));
      return {
        ...s,
        roster,
        hospitalTreatmentsRemaining: hospitalTreatmentCap(s.buildingLevels.hospital),
        runState: undefined,
        runRngState: undefined,
      };
    });

    this.scene.start('camp');
  }

  private refreshHud(): void {
    const run = appState.get().runState!;
    const total = run.currentFloorNodes.length;
    this.hudFloor.setText(
      `The Crypt · Floor ${run.currentFloorNumber} · ${total} nodes`,
    );
    const itemCount = run.pack.items.length;
    const packLabel =
      itemCount > 0
        ? `Pack: ${run.pack.gold}g · ${itemCount} item${itemCount === 1 ? '' : 's'}`
        : `Pack: ${run.pack.gold}g`;
    this.hudPack.setText(packLabel);
  }

  private refreshStatusBar(): void {
    const run = appState.get().runState!;
    const parts = run.party.map((h) => `${h.name} ${h.currentHp}/${h.maxHp}`);
    this.statusText.setText(parts.join(' · '));
  }
}

function glyphForNodeType(type: Node['type']): string {
  switch (type) {
    case 'boss':  return '☠';
    case 'shop':  return '🛒';
    case 'elite': return '💀';
    case 'camp':  return '🏕';
    case 'event': return '❓';
    case 'combat':
    default:      return '⚔';
  }
}
```

- [ ] **Step 2.4: Run typecheck**

Run: `npm run build`

Expected: build succeeds with no TypeScript errors. (`npm run build` runs `tsc` then Vite, so a green build means strict typecheck passes.)

If there are errors, common causes:
- Lingering `playerPath` import → confirm import block (Step 2.2) was applied cleanly.
- Lingering `Paperdoll` / `heroToLoadout` reference → also Step 2.2.
- `currentNodeIdSafe` returning `''` and being passed to `partyTokenPosFor` — that path returns `{ x: PARTY_OFFSCREEN_X, y: MAP_TOP }` so it's safe; if TS complains, double-check the return type annotation on `partyTokenPosFor`.

- [ ] **Step 2.5: Run the full test suite**

Run: `npm test`

Expected: all tests still pass. Scenes aren't unit-tested in this repo, so tests should be unaffected. The 7 new layout tests from Task 1 stay green.

- [ ] **Step 2.6: Manual smoke — run the dev server**

Run: `npm run dev`

Expected: Vite serves at http://localhost:5173. Open in a browser; the user drives the smoke. Verification checklist (the user runs through this; the agent does not drive Chrome):

1. Start a fresh run (camp → Expeditions → Embark).
2. The dungeon scene shows a horizontal node graph: 4 columns (n0, n1, fork pair, boss), edges as gray lines. The party token (3-diamond glyph in a yellow ring) walks in from the left and lands at n0.
3. Combat fires automatically; on victory, the result panel appears. Dismiss it.
4. The party token is now at n1; combat fires automatically again.
5. After clearing n1 (the fork source), the result panel shows. Dismiss it.
6. The two fork-branch nodes light up with a blue stroke. Hover one — the stroke thickens. Click one — the party tweens to that node, combat fires.
7. After clearing the fork branch, dismiss the result panel; the boss node is reached and combat fires.
8. After the boss, the camp_screen scene loads (existing behavior).
9. Restart the page mid-run — the party token + node states render correctly from save.
10. Run a wipe (deliberately under-leveled party) — the wipe panel renders and "Return to Camp" works.

Anything off in 1–10 is a bug to fix before declaring Task 2 done.

- [ ] **Step 2.7: Done — review checkpoint**

User reviews the new scene visually and decides whether to commit. No automated commits.

---

## Task 3: Update TODO and HISTORY entries

Mark Phase 1 as the first completed phase of TODO #30. Phases 2–6 stay in the TODO entry; only Phase 1's bullet is annotated.

**Files:**
- Modify: `TODO.md`
- Modify: `HISTORY.md`

- [ ] **Step 3.1: In `TODO.md`, mark Phase 1 complete inline**

Find the Phase 1 bullet under entry #30 (around line 56). Change the leading `- **Phase 1 — Map renderer scaffold.**` to `- **Phase 1 — Map renderer scaffold.** ✅ *Shipped 2026-05-02 (see HISTORY).*` and leave the rest of the bullet untouched. Do not renumber other phases.

- [ ] **Step 3.2: Add a slim HISTORY entry**

Open `HISTORY.md`. Add a new entry at the top following the slim-template convention (memory: `feedback_slim_history_entries`, ~15-25 lines, Why/Decisions/Surprises/Source). Drop the file-by-file shipped list — git diff has it.

```markdown
### 2026-05-02 · Map-based dungeon scene — Phase 1 (renderer scaffold)

**Why:** TODO #30 Phase 1. The icon-row dungeon view picked branch 0 silently at forks (lying about topology), revealed all future node types up front, and didn't fit the gdd's "Expeditions" / cartographer-party fiction. Phase 1 replaces the visualization with a node graph — visually transformed, functionally similar — without changing combat flow or the floor generator.

**Decisions:**
- Pure-TS layout module (`dungeon/map_layout.ts`) sits below the Phaser firewall and is unit-tested; the scene reads positions out of it. BFS-by-depth row assignment + sort-by-id within each row gives deterministic positions.
- The fork picker overlay was removed; the map's per-node interactivity replaces it. When `awaitingFork=true`, the next-row branches light up blue and become clickable. No new run-state fields — `awaitingFork` is the only signal needed.
- Paperdolls left the dungeon scene; party became a single small token. Paperdolls still render in combat. The dungeon hub had no per-hero info that wasn't already in the bottom status bar.
- "Cleared" node detection uses backward-reachability from `currentNodeId` rather than a `traversed` history. This works for Phase 1's simple 4-row floors; Phase 2's richer generator may motivate adding a history list.

**Surprises:**
- The old scene's "walking_to_next" tween was effectively a no-op — `processCombatReturn` snaps the party to the post-combat current node, so the subsequent tween moves zero distance. Phase 1 preserves this (the snap + zero-tween) for behavioral parity; actual walk animation is Phase 4's job.
- The `'awaiting_fork_pick'` scene state collapsed cleanly into "idle on map" — the per-node interactivity is set by `refreshNodeStates`, so the scene doesn't need a dedicated waiting state any more.

**Source:** TODO.md #30 Phase 1; spec/locked-design in the TODO entry itself (brainstormed 2026-05-02). Plan: `docs/superpowers/plans/2026-05-02-map-dungeon-phase-1.md`.
```

- [ ] **Step 3.3: Done**

The user reviews the doc edits and commits when ready.

---

## Phase 1 acceptance recap

When all three tasks are checked off:

- `npm run build` passes (TypeScript strict).
- `npm test` passes; 7 new tests added in `src/dungeon/__tests__/map_layout.test.ts`.
- Dungeon scene renders the floor graph as a horizontal node-and-edge map with a party token at the current node.
- Fork branches are interactive; clicking one calls `chooseNextNode` and tweens the party.
- All other dungeon-scene behavior (combat auto-fires, shop/camp/event overlays, result panel, wipe panel, scene-resume rebuild) is identical to the pre-rewrite version.
- No save schema changes; no `RunState` field changes.
- TODO #30 Phase 1 is marked ✅; HISTORY has a slim entry.

Phases 2–6 remain in TODO #30 and are out of scope for this plan.
