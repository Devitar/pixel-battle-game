# Map-Based Dungeon Scene — Phase 3 (Fog-of-War) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fog-of-war to the dungeon map per the locked Q2 design — N=2 lookahead from the current row, total fog (no nodes, no edges) beyond that, and an unanchored boss that "discovers" when the player gets within N rows. Past nodes the party has actually walked through stay revealed (cartographer log) and continue rendering. Untaken branches at past forks become fogged behind the party as soon as they leave the lookahead window — they were never visited and are not part of the cartographer log.

**Architecture:** Three substantive tasks plus housekeeping.
1. **Data layer** — add `traversedNodeIds: readonly string[]` (the cartographer log) to `RunState`. Thread it through every place `currentNodeId` changes; default it in `normalizeSaveFile` for old in-progress saves.
2. **Visibility helper** — new pure-TS module `src/dungeon/visibility.ts` that takes `(nodes, currentNodeId, traversedNodeIds, lookahead)` and returns `{ revealed, visible }` sets plus a derived `isEdgeVisible(fromId, toId)` predicate. Lives below the Phaser firewall, unit-tested.
3. **Scene wiring** — in `src/scenes/dungeon_scene.ts`, compute visibility alongside the existing layout, hide fogged node containers and skip fogged edges in `refreshEdges`. Re-run visibility on every state change (already wired through `refreshNodeStates`).
4. **Housekeeping** — TODO mark Phase 3 ✅; HISTORY entry; this plan filed.

`playerPath` in `run_state.ts` has no production callers (only its own tests); leave it untouched. Removing it is out of scope for Phase 3 and would just be churn. The Phase 1 scene's `isNodeCleared` (backward-reachability heuristic) is replaced by reading the cartographer log directly — a node is "cleared" iff it's in `traversedNodeIds` and is not the current node. The old heuristic was the very footgun Phase 3 needs to fix: it would mark BOTH branches of a past converging fork as cleared, but only one was actually walked. With the explicit log there's no ambiguity.

Save schema stays at version 1 (per the pinned pre-launch policy in memory). `traversedNodeIds` is an additive field; `normalizeSaveFile` defaults it for in-progress saves predating this change to `[runState.currentNodeId]` — single-element best-guess history for the cell the party is currently in. Old saves lose the prior cartographer trail (a one-time cost on the upgrade), but visibility still works correctly going forward and the player's progress doesn't break.

**Tech Stack:** TypeScript 6 (strict), Vitest 4, Phaser 4 (no new Phaser primitives — just `setVisible(false)` on existing containers and skipping `lineTo` calls in the edge-drawing loop).

**Spec:** TODO.md Cluster B · 30 Phase 3 (locked Q2 design, brainstormed 2026-05-02). Specifically:
- N=2 lookahead, total fog beyond, unanchored boss
- Past nodes stay revealed (cartographer log)
- Current row + 2-row lookahead show types
- Beyond is blank space — no nodes, no edges

This plan does not introduce a separate spec file; the locked design fits in two paragraphs and is fully captured in the TODO entry, mirroring Phase 1's convention (its HISTORY entry calls out: "Spec is the locked design embedded in the TODO entry").

**Repo conventions** (from CLAUDE.md / memory):
- **No commits anywhere in this plan.** The user runs commits manually. Each task's "Done" checkpoint is a review point, not a commit point.
- The Phaser firewall: `dungeon/`, `run/`, `save/` files MUST NOT `import 'phaser'`. The visibility module is pure TS.
- Save schema stays at version 1; no migrations. `traversedNodeIds` is additive with a defaulted normalizer.
- Don't materialize empty directories. `dungeon/` already exists.
- HISTORY entries use the slim template: ~15-25 lines, Why / Decisions / Surprises / Source.
- Before editing data-shape constants or `SaveFile` fields, grep `__tests__/` for hardcoded references (per memory). The `RunState` literal in the save normalizer tests at `src/save/__tests__/save.test.ts:280-344` is the one to know about — it builds a literal `runState` object and the new field needs to be either added or omitted-and-defaulted depending on which behavior the test asserts.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/run/run_state.ts` | **Modify** | Add `traversedNodeIds: readonly string[]` to `RunState`. Initialize in `startRun` and `pressOn` to `[startNodeId]`. Append in `chooseNextNode`, `chooseCampNodeEffect`, `completeCombat` (single-fanout victory branch), `leaveShop`, `claimTreasure`. ~10 lines added across the file. |
| `src/run/__tests__/run_state.test.ts` | **Modify** | Add focused tests for `traversedNodeIds` lifecycle (init, append on each transition, reset on `pressOn`, untouched on awaitingFork). ~80 lines added in a new `describe('traversedNodeIds')` block. |
| `src/save/save.ts` | **Modify** | Default `runState.traversedNodeIds` to `[runState.currentNodeId]` in `normalizeSaveFile` for old in-progress saves. ~1 line added to the existing `runState` spread. |
| `src/save/__tests__/save.test.ts` | **Modify** | Add a test mirroring the existing "defaults missing runState.lost to []" pattern — assert that an old save with no `traversedNodeIds` field gets `[currentNodeId]` populated. ~30 lines added. |
| `src/dungeon/visibility.ts` | **Create** | Pure-TS visibility computation. Exports `computeVisibility(nodes, currentNodeId, traversedNodeIds, lookahead): VisibilityResult` and `LOOKAHEAD_ROWS = 2` constant. ~70 lines. |
| `src/dungeon/__tests__/visibility.test.ts` | **Create** | Unit tests for the helper: revealed = traversedNodeIds, visible = current row + N rows ahead, edge visibility predicate, boss-becomes-visible-at-distance-N, empty inputs, end-of-floor edge cases. ~150 lines. |
| `src/scenes/dungeon_scene.ts` | **Modify** | Wire `computeVisibility` into the render loop. `refreshNodeStates` hides containers for nodes not in (revealed ∪ visible). `refreshEdges` skips edges where either endpoint is fogged. Delete the now-dead `isNodeCleared` predecessor-walk method; replace its call in `computeNodeState` with a `traversedNodeIds.includes(nodeId)` check. ~20 lines net change. |
| `TODO.md` | **Modify** (Task 4) | Mark Phase 3 ✅ inline (parallels how 2a / 2b were marked). |
| `HISTORY.md` | **Modify** (Task 4) | Slim entry at the top per the established template. |

---

## Task 1: Data layer — `traversedNodeIds` on RunState

After this task: green build, all existing tests pass, `RunState` carries an explicit cartographer log that's updated wherever the player advances. No visible UI change yet — the scene still uses the predecessor-walk heuristic in `isNodeCleared`. Save loader handles the new field with a default for old in-progress saves.

**Files:**
- Modify: `src/run/run_state.ts`
- Modify: `src/run/__tests__/run_state.test.ts`
- Modify: `src/save/save.ts`
- Modify: `src/save/__tests__/save.test.ts`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL tests pass. Note the count for the post-change comparison (Task 1 adds tests; subsequent tasks add more).

- [ ] **Step 1.2: Add `traversedNodeIds` to the `RunState` interface**

Open `src/run/run_state.ts`. Find the `RunState` interface (around line 15) and add the field at the end:

```ts
export interface RunState {
  readonly dungeonId: DungeonId;
  readonly seed: number;
  readonly party: readonly Hero[];
  readonly pack: Pack;
  readonly currentFloorNumber: number;
  readonly currentFloorNodes: readonly Node[];
  readonly currentNodeId: string;
  readonly awaitingFork: boolean;
  readonly status: RunStatus;
  readonly fallen: readonly Hero[];
  readonly lost: readonly Hero[];
  readonly traversedNodeIds: readonly string[];
}
```

- [ ] **Step 1.3: Initialize `traversedNodeIds` in `startRun`**

In the same file, find `startRun` (around line 48). Add the field to the returned object:

```ts
return {
  dungeonId,
  seed,
  party: [...party],
  pack: createPack(),
  currentFloorNumber: 1,
  currentFloorNodes: nodes,
  currentNodeId: startNodeId,
  awaitingFork: false,
  status: 'in_dungeon',
  fallen: [],
  lost: [],
  traversedNodeIds: [startNodeId],
};
```

- [ ] **Step 1.4: Reset `traversedNodeIds` in `pressOn`**

Find `pressOn` (around line 290). Add the field to the returned object:

```ts
export function pressOn(runState: RunState, rng: Rng): RunState {
  if (runState.status !== 'camp_screen') {
    throw new Error(`pressOn: status must be 'camp_screen', got '${runState.status}'`);
  }
  const nextFloor = runState.currentFloorNumber + 1;
  const { nodes, startNodeId } = generateFloor(runState.dungeonId, nextFloor, rng);
  return {
    ...runState,
    currentFloorNumber: nextFloor,
    currentFloorNodes: nodes,
    currentNodeId: startNodeId,
    awaitingFork: false,
    status: 'in_dungeon',
    traversedNodeIds: [startNodeId],
  };
}
```

- [ ] **Step 1.5: Append in `chooseNextNode`**

Find `chooseNextNode` (around line 95). Update the returned object:

```ts
export function chooseNextNode(runState: RunState, nextNodeId: string): RunState {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`chooseNextNode: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const cur = currentNode(runState);
  if (!cur.nextNodeIds.includes(nextNodeId)) {
    throw new Error(
      `chooseNextNode: '${nextNodeId}' is not a valid next node from '${cur.id}'`,
    );
  }
  return {
    ...runState,
    currentNodeId: nextNodeId,
    awaitingFork: false,
    traversedNodeIds: [...runState.traversedNodeIds, nextNodeId],
  };
}
```

- [ ] **Step 1.6: Append in `chooseCampNodeEffect` (non-leave branch)**

Find `chooseCampNodeEffect` (around line 112). Only the non-leave branch advances `currentNodeId`. Update:

```ts
export function chooseCampNodeEffect(
  runState: RunState,
  choice: CampNodeChoice,
  rng: Rng,
): { runState: RunState; outcome?: CashoutOutcome } {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`chooseCampNodeEffect: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const cur = currentNode(runState);
  if (cur.type !== 'camp') {
    throw new Error(`chooseCampNodeEffect: current node is type '${cur.type}', not 'camp'`);
  }
  if (choice.kind === 'leave') {
    return cashout(runState);
  }
  const newRunState = applyCampNodeEffect(runState, choice, rng);
  const nextId = cur.nextNodeIds[0];
  return {
    runState: {
      ...newRunState,
      currentNodeId: nextId,
      traversedNodeIds: [...newRunState.traversedNodeIds, nextId],
    },
  };
}
```

- [ ] **Step 1.7: Append in `completeCombat` (single-fanout victory)**

Find `completeCombat` (around line 152). The function has three exit branches that affect `currentNodeId`: defeat (no change — run ends), boss (no change — moves to camp_screen), single-fanout (advances), fork (stays put with `awaitingFork=true`). Only the single-fanout branch needs the append. Update that branch:

```ts
// Non-boss victory — advance based on fanout.
if (fanout.length === 1) {
  return {
    runState: {
      ...runState,
      party: partyAfterXp,
      fallen: [...runState.fallen, ...newFallen],
      pack: newPack,
      status: 'in_dungeon',
      currentNodeId: fanout[0],
      traversedNodeIds: [...runState.traversedNodeIds, fanout[0]],
    },
  };
}
```

The fork branch (`fanout.length === 2`) does NOT change `currentNodeId` — the player is still at the fork-source node — so no append. The boss branch (`isBoss`) does NOT change `currentNodeId` either — the boss node was appended when the player advanced to it from the previous node.

- [ ] **Step 1.8: Append in `leaveShop`**

Find `leaveShop` (around line 361). Update:

```ts
export function leaveShop(runState: RunState): RunState {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`leaveShop: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const cur = currentNode(runState);
  if (cur.type !== 'shop') {
    throw new Error(`leaveShop: current node is type '${cur.type}', not 'shop'`);
  }
  const nextId = cur.nextNodeIds[0];
  return {
    ...runState,
    currentNodeId: nextId,
    traversedNodeIds: [...runState.traversedNodeIds, nextId],
  };
}
```

- [ ] **Step 1.9: Append in `claimTreasure`**

Find `claimTreasure` (around line 375). Update:

```ts
export function claimTreasure(runState: RunState, item: Item): RunState {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`claimTreasure: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const cur = currentNode(runState);
  if (cur.type !== 'treasure') {
    throw new Error(`claimTreasure: current node is type '${cur.type}', not 'treasure'`);
  }
  const nextId = cur.nextNodeIds[0];
  return {
    ...runState,
    pack: addItem(runState.pack, item),
    currentNodeId: nextId,
    traversedNodeIds: [...runState.traversedNodeIds, nextId],
  };
}
```

- [ ] **Step 1.10: Default `traversedNodeIds` in `normalizeSaveFile`**

Open `src/save/save.ts`. Find `normalizeSaveFile` (around line 117). Update the `runState` spread at the end of the returned object:

```ts
runState: file.runState === undefined
  ? undefined
  : {
      ...file.runState,
      lost: file.runState.lost ?? [],
      traversedNodeIds: file.runState.traversedNodeIds ?? [file.runState.currentNodeId],
    },
```

This mirrors the established additive-field pattern; the comment block above `normalizeSaveFile` already documents the policy.

- [ ] **Step 1.11: Run tests — confirm what breaks**

Run: `npm test`

Expected: TypeScript build passes (you've added the field everywhere it's constructed). Run-state tests for existing functions should still pass (the appends are pure-additive — `currentNodeId` changes still match prior assertions). Save tests likely still pass (the default handles old shapes).

If any test fails, read the failure and confirm it's a missing-field case. The likely candidates:
- A test that constructs a literal `RunState` for setup → needs `traversedNodeIds: [...]` added.
- A test that snapshot-equals a `RunState` → needs the field present in the expected value.

Fix per-failure. No test should require a behavioral change.

- [ ] **Step 1.12: Add `traversedNodeIds` lifecycle tests**

Open `src/run/__tests__/run_state.test.ts`. After the existing `describe('playerPath', ...)` block (around line 518), add a new describe:

```ts
describe('traversedNodeIds (cartographer log)', () => {
  it('startRun initializes to [startNodeId]', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.traversedNodeIds).toEqual([rs.currentNodeId]);
  });

  it('completeCombat single-fanout victory appends the new currentNodeId', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const initial = rs.traversedNodeIds;
    const after = completeCombat(
      rs,
      mockCombatResult(rs.party, [20, 14, 15], 'player_victory'),
      createRng(99),
    ).runState;
    if (after.awaitingFork) {
      // Floor 1 row 0 -> row 1 fanout depends on the seed; if it happens to be a
      // fork source, the append is skipped (covered by the next test). Pick a
      // seed-resilient assertion: traversedNodeIds is unchanged at a fork source.
      expect(after.traversedNodeIds).toEqual(initial);
    } else {
      expect(after.traversedNodeIds).toEqual([...initial, after.currentNodeId]);
    }
  });

  it('completeCombat at fork source does NOT append (currentNodeId unchanged)', () => {
    const rs = advanceToFork(startRun('crypt', makeParty(), 1, createRng(1)));
    // After advanceToFork, awaitingFork=true and currentNodeId is the fork-source
    // node. The previous completeCombat call inside advanceToFork should not have
    // appended anything past the fork source.
    expect(rs.awaitingFork).toBe(true);
    expect(rs.traversedNodeIds[rs.traversedNodeIds.length - 1]).toBe(rs.currentNodeId);
  });

  it('chooseNextNode appends the picked branch id', () => {
    const rs = advanceToFork(startRun('crypt', makeParty(), 1, createRng(1)));
    const fork = currentNode(rs);
    const picked = fork.nextNodeIds[1];
    const after = chooseNextNode(rs, picked);
    expect(after.traversedNodeIds).toEqual([...rs.traversedNodeIds, picked]);
  });

  it('completeCombat on boss does NOT append (currentNodeId unchanged on victory)', () => {
    const rs = advanceToBossNode(startRun('crypt', makeParty(), 1, createRng(1)));
    const before = rs.traversedNodeIds;
    const after = completeCombat(
      rs,
      mockCombatResult(rs.party, [20, 14, 15], 'player_victory'),
      createRng(99),
    ).runState;
    expect(after.status).toBe('camp_screen');
    expect(after.traversedNodeIds).toEqual(before);
  });

  it('pressOn resets traversedNodeIds to the new floor start', () => {
    let rs = advanceToBossNode(startRun('crypt', makeParty(), 1, createRng(1)));
    rs = completeCombat(
      rs,
      mockCombatResult(rs.party, [20, 14, 15], 'player_victory'),
      createRng(99),
    ).runState;
    expect(rs.status).toBe('camp_screen');
    const next = pressOn(rs, createRng(2));
    expect(next.traversedNodeIds).toEqual([next.currentNodeId]);
    expect(next.traversedNodeIds).toHaveLength(1);
  });

  it('current node is always the last entry in traversedNodeIds (between forks)', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    expect(rs.traversedNodeIds[rs.traversedNodeIds.length - 1]).toBe(rs.currentNodeId);
    // Walk a few non-fork steps; the last entry should always be currentNodeId.
    for (let i = 0; i < 3; i++) {
      const node = currentNode(rs);
      if (node.type === 'boss') break;
      const result = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99));
      rs = result.runState;
      if (rs.status !== 'in_dungeon') break;
      if (rs.awaitingFork) {
        // At a fork: last entry is the fork source itself (the current node).
        expect(rs.traversedNodeIds[rs.traversedNodeIds.length - 1]).toBe(rs.currentNodeId);
        break;
      }
      expect(rs.traversedNodeIds[rs.traversedNodeIds.length - 1]).toBe(rs.currentNodeId);
    }
  });
});
```

- [ ] **Step 1.13: Run the new tests**

Run: `npx vitest run src/run/__tests__/run_state.test.ts -t "traversedNodeIds"`

Expected: ALL traversedNodeIds tests pass.

- [ ] **Step 1.14: Add the save-loader default test**

Open `src/save/__tests__/save.test.ts`. After the `describe('save normalizer — runState.lost default', ...)` block (around line 344), add:

```ts
describe('save normalizer — runState.traversedNodeIds default', () => {
  it('defaults missing runState.traversedNodeIds to [currentNodeId]', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: CURRENT_SCHEMA_VERSION,
      roster: { heroes: [], slots: 12 },
      vault: { gold: 0 },
      stash: createStash(),
      unlocks: { classes: [], dungeons: [] },
      runState: {
        dungeonId: 'crypt',
        seed: 1,
        party: [],
        pack: { gold: 0, items: [] },
        currentFloorNumber: 1,
        currentFloorNodes: [],
        currentNodeId: 'crypt-f1-r3-s1',
        awaitingFork: false,
        status: 'in_dungeon',
        fallen: [],
        lost: [],
        // NOTE: traversedNodeIds intentionally omitted to simulate a pre-Phase-3 save
      },
      runRngState: 12345,
    }));
    const loaded = load(storage);
    expect(loaded).not.toBeNull();
    expect(loaded!.runState).toBeDefined();
    expect(loaded!.runState!.traversedNodeIds).toEqual(['crypt-f1-r3-s1']);
  });

  it('preserves an explicit traversedNodeIds array', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: CURRENT_SCHEMA_VERSION,
      roster: { heroes: [], slots: 12 },
      vault: { gold: 0 },
      stash: createStash(),
      unlocks: { classes: [], dungeons: [] },
      runState: {
        dungeonId: 'crypt',
        seed: 1,
        party: [],
        pack: { gold: 0, items: [] },
        currentFloorNumber: 1,
        currentFloorNodes: [],
        currentNodeId: 'crypt-f1-r3-s1',
        awaitingFork: false,
        status: 'in_dungeon',
        fallen: [],
        lost: [],
        traversedNodeIds: ['crypt-f1-r0-s1', 'crypt-f1-r1-s1', 'crypt-f1-r2-s1', 'crypt-f1-r3-s1'],
      },
      runRngState: 12345,
    }));
    const loaded = load(storage);
    expect(loaded!.runState!.traversedNodeIds).toEqual([
      'crypt-f1-r0-s1', 'crypt-f1-r1-s1', 'crypt-f1-r2-s1', 'crypt-f1-r3-s1',
    ]);
  });
});
```

- [ ] **Step 1.15: Run the save-loader tests**

Run: `npx vitest run src/save/__tests__/save.test.ts -t "traversedNodeIds"`

Expected: BOTH new tests pass.

- [ ] **Step 1.16: Final full-suite run for Task 1**

Run: `npm test`

Expected: ALL tests pass. Test count is up by ~9 (7 traversed lifecycle + 2 save normalizer). Note the new total.

If anything else broke (e.g., a test in another file that constructs a `RunState` literal), fix it by adding `traversedNodeIds: ['some-id']` (or `[]`) to that fixture. Use the smallest-needed value.

---

## Task 2: Pure-TS visibility helper + tests

After this task: green build, the visibility module is unit-tested, and the scene can consume it. No scene wiring yet — that's Task 3.

**Files:**
- Create: `src/dungeon/visibility.ts`
- Create: `src/dungeon/__tests__/visibility.test.ts`

- [ ] **Step 2.1: Write the failing test file**

Create `src/dungeon/__tests__/visibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '@util/rng';
import { generateFloor } from '../floor';
import type { Node } from '../node';
import { computeVisibility, LOOKAHEAD_ROWS } from '../visibility';

function startNodeId(nodes: readonly Node[]): string {
  const referenced = new Set(nodes.flatMap((n) => [...n.nextNodeIds]));
  return nodes.find((n) => !referenced.has(n.id))!.id;
}

function bossNodeId(nodes: readonly Node[]): string {
  return nodes.find((n) => n.type === 'boss')!.id;
}

function rowOf(nodes: readonly Node[], targetId: string): number {
  const start = startNodeId(nodes);
  if (targetId === start) return 0;
  const depth = new Map<string, number>([[start, 0]]);
  const queue = [start];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodes.find((n) => n.id === id)!;
    const d = depth.get(id)!;
    for (const nextId of node.nextNodeIds) {
      if (!depth.has(nextId)) {
        depth.set(nextId, d + 1);
        queue.push(nextId);
      }
    }
  }
  return depth.get(targetId)!;
}

describe('computeVisibility', () => {
  it('LOOKAHEAD_ROWS is 2 (per locked Q2 design)', () => {
    expect(LOOKAHEAD_ROWS).toBe(2);
  });

  it('revealed = traversedNodeIds (the cartographer log)', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const start = startNodeId(nodes);
    const second = nodes.find((n) => n.id !== start && nodes.some((m) => m.nextNodeIds.includes(n.id) && m.id === start))!.id;
    const traversed = [start, second];
    const result = computeVisibility(nodes, second, traversed, LOOKAHEAD_ROWS);
    expect(result.revealed).toEqual(new Set(traversed));
  });

  it('at row 0: visible = nodes in rows 0, 1, 2; row 3+ fogged', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const start = startNodeId(nodes);
    const result = computeVisibility(nodes, start, [start], LOOKAHEAD_ROWS);
    for (const node of nodes) {
      const r = rowOf(nodes, node.id);
      const isVisible = result.visible.has(node.id);
      if (r >= 0 && r <= LOOKAHEAD_ROWS) {
        expect(isVisible, `node ${node.id} at row ${r} should be visible`).toBe(true);
      } else {
        expect(isVisible, `node ${node.id} at row ${r} should be fogged`).toBe(false);
      }
    }
  });

  it('boss is fogged at run start (row 0; floor 1 has 8 rows; boss at row 7)', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const start = startNodeId(nodes);
    const boss = bossNodeId(nodes);
    const result = computeVisibility(nodes, start, [start], LOOKAHEAD_ROWS);
    expect(result.visible.has(boss)).toBe(false);
    expect(result.revealed.has(boss)).toBe(false);
  });

  it('boss becomes visible when current row is within LOOKAHEAD_ROWS of it', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const boss = bossNodeId(nodes);
    const bossRow = rowOf(nodes, boss); // 7 for floor 1
    // Pick any node at row (bossRow - LOOKAHEAD_ROWS) = row 5 → boss should become visible.
    const visibilityRow = bossRow - LOOKAHEAD_ROWS;
    const candidate = nodes.find((n) => rowOf(nodes, n.id) === visibilityRow)!;
    const result = computeVisibility(nodes, candidate.id, [candidate.id], LOOKAHEAD_ROWS);
    expect(result.visible.has(boss), `boss at row ${bossRow} should be visible from row ${visibilityRow}`).toBe(true);
  });

  it('past nodes (in traversedNodeIds) are revealed even if outside the lookahead window', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const start = startNodeId(nodes);
    // Build a fake traversed path of [start, row1node, row2node, row3node] — the
    // start should still be revealed even though it's row 0 and current is row 3.
    const r1 = nodes.find((n) => rowOf(nodes, n.id) === 1)!.id;
    const r2 = nodes.find((n) => rowOf(nodes, n.id) === 2)!.id;
    const r3 = nodes.find((n) => rowOf(nodes, n.id) === 3)!.id;
    const traversed = [start, r1, r2, r3];
    const result = computeVisibility(nodes, r3, traversed, LOOKAHEAD_ROWS);
    expect(result.revealed.has(start)).toBe(true);
  });

  it('untaken branch at a past fork is NOT revealed (fogged once outside lookahead)', () => {
    // Build a synthetic 5-row DAG with a fork at row 1: row1-A taken, row1-B not.
    // Player advances to row 4. row1-B should not be in revealed (never visited)
    // and should be outside the lookahead (row 4's lookahead covers rows 4-6;
    // row 1 is past).
    const nodes: Node[] = [
      { id: 'r0', type: 'combat', encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: ['r1a', 'r1b'], slot: 1 },
      { id: 'r1a', type: 'combat', encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: ['r2'], slot: 0 },
      { id: 'r1b', type: 'combat', encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: ['r2'], slot: 2 },
      { id: 'r2', type: 'combat', encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: ['r3'], slot: 1 },
      { id: 'r3', type: 'combat', encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: ['r4'], slot: 1 },
      { id: 'r4', type: 'boss',   encounter: { enemies: [], scale: { hp: 1, attack: 1 } }, nextNodeIds: [], slot: 1 },
    ];
    const traversed = ['r0', 'r1a', 'r2', 'r3', 'r4'];
    const result = computeVisibility(nodes, 'r4', traversed, LOOKAHEAD_ROWS);
    expect(result.revealed.has('r1b')).toBe(false);
    expect(result.visible.has('r1b')).toBe(false);
  });

  it('isEdgeVisible: true when both endpoints are revealed-or-visible', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const start = startNodeId(nodes);
    const result = computeVisibility(nodes, start, [start], LOOKAHEAD_ROWS);
    // Find an edge from start to one of its successors (both must be visible).
    const startNode = nodes.find((n) => n.id === start)!;
    const successor = startNode.nextNodeIds[0];
    expect(result.isEdgeVisible(start, successor)).toBe(true);
  });

  it('isEdgeVisible: false when target is fogged (out of lookahead)', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const start = startNodeId(nodes);
    const result = computeVisibility(nodes, start, [start], LOOKAHEAD_ROWS);
    // An edge from a row-2 node to a row-3 node: row 2 is visible (within lookahead),
    // row 3 is fogged. The edge should be hidden.
    const r2Node = nodes.find((n) => rowOf(nodes, n.id) === 2)!;
    const r3Successor = r2Node.nextNodeIds.find((id) => rowOf(nodes, id) === 3);
    if (r3Successor !== undefined) {
      expect(result.isEdgeVisible(r2Node.id, r3Successor)).toBe(false);
    }
    // (If no row-2 node has a row-3 successor in this seed, the assertion is
    // vacuously satisfied — the structural property still holds.)
  });

  it('empty nodes array yields empty sets and a no-op edge predicate', () => {
    const result = computeVisibility([], '', [], LOOKAHEAD_ROWS);
    expect(result.revealed.size).toBe(0);
    expect(result.visible.size).toBe(0);
    expect(result.isEdgeVisible('a', 'b')).toBe(false);
  });

  it('is deterministic for the same input', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(7));
    const start = startNodeId(nodes);
    const a = computeVisibility(nodes, start, [start], LOOKAHEAD_ROWS);
    const b = computeVisibility(nodes, start, [start], LOOKAHEAD_ROWS);
    expect([...a.revealed].sort()).toEqual([...b.revealed].sort());
    expect([...a.visible].sort()).toEqual([...b.visible].sort());
  });

  it('lookahead=0 → only the current row is visible', () => {
    const { nodes } = generateFloor('crypt', 1, createRng(1));
    const start = startNodeId(nodes);
    const result = computeVisibility(nodes, start, [start], 0);
    for (const node of nodes) {
      const r = rowOf(nodes, node.id);
      if (r === 0) {
        expect(result.visible.has(node.id)).toBe(true);
      } else {
        expect(result.visible.has(node.id)).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npx vitest run src/dungeon/__tests__/visibility.test.ts`

Expected: FAIL — `Cannot find module '../visibility'` (and similar). The module doesn't exist yet.

- [ ] **Step 2.3: Implement the visibility module**

Create `src/dungeon/visibility.ts`:

```ts
import type { Node } from './node';

export const LOOKAHEAD_ROWS = 2;

export interface VisibilityResult {
  /** Nodes the party has actually walked through (cartographer log). */
  readonly revealed: ReadonlySet<string>;
  /** Nodes within `lookahead` rows of the current row, including the current row. */
  readonly visible: ReadonlySet<string>;
  /** Whether the edge from `fromId` to `toId` should be drawn. True iff both
   *  endpoints are in (revealed ∪ visible). */
  isEdgeVisible(fromId: string, toId: string): boolean;
}

/**
 * Compute fog-of-war state for the current floor. The render loop uses this to
 * decide which node containers to show and which edges to draw.
 *
 * Per the locked Q2 design (TODO #30 Phase 3):
 * - `revealed` = the cartographer log (`traversedNodeIds`). These nodes stay
 *   shown even when the player has moved past them.
 * - `visible` = the current row plus the next `lookahead` rows. Beyond is fog
 *   (no node, no edge). The boss is "discovered" when within `lookahead` rows.
 * - Untaken branches at past forks are neither revealed (never visited) nor
 *   visible (out of lookahead window), so they fade behind the party.
 */
export function computeVisibility(
  nodes: readonly Node[],
  currentNodeId: string,
  traversedNodeIds: readonly string[],
  lookahead: number,
): VisibilityResult {
  if (nodes.length === 0) {
    return {
      revealed: new Set(),
      visible: new Set(),
      isEdgeVisible: () => false,
    };
  }

  const revealed = new Set(traversedNodeIds);

  const referenced = new Set<string>(nodes.flatMap((n) => [...n.nextNodeIds]));
  const start = nodes.find((n) => !referenced.has(n.id));
  if (!start) {
    return {
      revealed,
      visible: new Set(),
      isEdgeVisible: () => false,
    };
  }

  // BFS depth assignment (matches map_layout's row computation).
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

  const currentRow = depth.get(currentNodeId);
  const visible = new Set<string>();
  if (currentRow !== undefined) {
    for (const [id, d] of depth) {
      if (d >= currentRow && d <= currentRow + lookahead) {
        visible.add(id);
      }
    }
  }

  const isEdgeVisible = (fromId: string, toId: string): boolean => {
    const fromOk = revealed.has(fromId) || visible.has(fromId);
    const toOk = revealed.has(toId) || visible.has(toId);
    return fromOk && toOk;
  };

  return { revealed, visible, isEdgeVisible };
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `npx vitest run src/dungeon/__tests__/visibility.test.ts`

Expected: ALL tests pass.

- [ ] **Step 2.5: Full-suite run for Task 2**

Run: `npm test`

Expected: ALL tests pass. Test count up by ~12 from Task 1's total.

---

## Task 3: Wire visibility into the dungeon scene

After this task: the rendered map honors the cartographer-log fog-of-war design. Visual smoke-test instructions at the end of the task.

**Files:**
- Modify: `src/scenes/dungeon_scene.ts`

- [ ] **Step 3.1: Import the visibility helper**

Open `src/scenes/dungeon_scene.ts`. Add the import alongside the existing `computeMapLayout` import (around line 5):

```ts
import { computeMapLayout, type MapLayout } from '@dungeon/map_layout';
import { computeVisibility, LOOKAHEAD_ROWS, type VisibilityResult } from '@dungeon/visibility';
```

- [ ] **Step 3.2: Add a visibility cache field on the scene**

In the field declarations (around line 70, near `layout: MapLayout`), add:

```ts
private layout: MapLayout = { positions: new Map(), edges: [], rowCount: 0 };
private visibility: VisibilityResult = {
  revealed: new Set(),
  visible: new Set(),
  isEdgeVisible: () => false,
};
```

- [ ] **Step 3.3: Compute visibility alongside layout in `create()`**

Find the layout assignment in `create()` (around line 111). Right after it, add the visibility computation:

```ts
this.layout = computeMapLayout(state.runState.currentFloorNodes, {
  left: MAP_LEFT,
  top: MAP_TOP,
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
});
this.visibility = computeVisibility(
  state.runState.currentFloorNodes,
  state.runState.currentNodeId,
  state.runState.traversedNodeIds,
  LOOKAHEAD_ROWS,
);
```

- [ ] **Step 3.4: Recompute visibility on every state refresh**

Find `refreshNodeStates` (around line 433). Add a visibility recompute at the top:

```ts
private refreshNodeStates(): void {
  const run = appState.get().runState;
  if (!run) return;
  this.visibility = computeVisibility(
    run.currentFloorNodes,
    run.currentNodeId,
    run.traversedNodeIds,
    LOOKAHEAD_ROWS,
  );
  for (const node of run.currentFloorNodes) {
    const state = this.computeNodeState(node.id);
    const container = this.nodeContainers.get(node.id);
    const bg = this.nodeBgByNodeId.get(node.id);
    const glyph = this.nodeGlyphByNodeId.get(node.id);
    const label = this.nodeLabelByNodeId.get(node.id);
    if (!container || !bg || !glyph || !label) continue;
    const isFogged = !this.visibility.revealed.has(node.id) && !this.visibility.visible.has(node.id);
    container.setVisible(!isFogged);
    if (isFogged) {
      bg.disableInteractive();
      continue;
    }
    bg.setFillStyle(NODE_FILL_BY_STATE[state]);
    bg.setStrokeStyle(2, NODE_STROKE_BY_STATE[state]);
    glyph.setColor(GLYPH_COLOR_BY_STATE[state]);
    label.setColor(state === 'cleared' ? '#555555' : '#aaaaaa');
    if (state === 'fork_choice') {
      bg.setInteractive({ useHandCursor: true });
    } else {
      bg.disableInteractive();
    }
  }
  this.refreshEdges();
}
```

Note: `refreshEdges` is now called from inside `refreshNodeStates` so edge visibility tracks node visibility on every state refresh. Verify this isn't double-called — search the file for other `refreshEdges()` invocations and remove them if they'd double up. (At plan-write time, `refreshEdges()` is only called once from `buildEdges()` at scene construction; that's still fine because nodes haven't been built yet on that path. The new call inside `refreshNodeStates` will run it again every refresh.)

- [ ] **Step 3.5: Replace `isNodeCleared` with the cartographer log lookup**

Find `computeNodeState` (around line 397) and `isNodeCleared` (around line 415). Replace the cleared check in `computeNodeState`:

```ts
private computeNodeState(nodeId: string): NodeRenderState {
  const run = appState.get().runState;
  if (!run) return 'upcoming';
  if (nodeId === run.currentNodeId) return 'current';
  if (run.awaitingFork) {
    const cur = currentNode(run);
    if (cur.nextNodeIds.includes(nodeId)) return 'fork_choice';
  }
  if (run.traversedNodeIds.includes(nodeId)) return 'cleared';
  return 'upcoming';
}
```

Then DELETE the now-dead `isNodeCleared` method entirely (lines ~409-431 in the pre-change file). It has no other callers. (Verify with: search the file for `isNodeCleared` — should be zero references after deletion.)

- [ ] **Step 3.6: Update `refreshEdges` to filter by visibility**

Find `refreshEdges` (around line 211). Update:

```ts
private refreshEdges(): void {
  if (!this.edgeGraphics) return;
  this.edgeGraphics.clear();
  this.edgeGraphics.lineStyle(2, 0x555555, 1);
  for (const edge of this.layout.edges) {
    if (!this.visibility.isEdgeVisible(edge.fromId, edge.toId)) continue;
    const from = this.layout.positions.get(edge.fromId);
    const to = this.layout.positions.get(edge.toId);
    if (!from || !to) continue;
    this.edgeGraphics.beginPath();
    this.edgeGraphics.moveTo(from.x, from.y);
    this.edgeGraphics.lineTo(to.x, to.y);
    this.edgeGraphics.strokePath();
  }
}
```

- [ ] **Step 3.7: Run typecheck + full suite**

Run: `npm run build && npm test`

Expected: typecheck passes, all tests pass. Note the new total.

If typecheck fails on `RunState.traversedNodeIds` not being in scope, double-check Task 1 step 1.2 was applied. If a test fails because a fixture `RunState` is missing the field, add `traversedNodeIds: []` (or `[currentNodeId]`) as appropriate.

- [ ] **Step 3.8: Manual smoke test — start a fresh run**

Per the user-feedback memory ("skip browser smoke by default"), do NOT auto-launch the browser. Instead, prepare smoke-test instructions for the user:

```
Phase 3 visual smoke-test checklist:
1. `npm run dev`, open http://localhost:5173.
2. Start a fresh expedition into the Crypt.
3. On entering floor 1: only rows 0, 1, 2 should be drawn (start + lookahead 2).
   Boss at row 7 must NOT be visible. Total ~3-7 visible nodes depending on row sizes.
4. Edges from row 2 nodes that lead to row 3 should NOT be drawn (would terminate
   in fog).
5. Walk through one node. Newly visited node renders with the "cleared" style;
   it stays visible. The lookahead window slides forward by one row.
6. At a fork: pick one branch. Walk past the fork. The unpicked branch should
   render briefly while in lookahead, then disappear once the party is two rows
   past the fork.
7. Reach within 2 rows of the boss. The boss node "appears" in the visible set
   with its skull glyph.
8. Reach the boss → win → cash out / press on. Press on → new floor → only rows
   0, 1, 2 visible again, prior cartographer log gone.
```

Report results to the user; do not run a script-driven browser smoke unless they ask.

---

## Task 4: Housekeeping — TODO + HISTORY

After this task: TODO marks Phase 3 ✅ inline; HISTORY has a slim entry at the top describing the change.

**Files:**
- Modify: `TODO.md`
- Modify: `HISTORY.md`

- [ ] **Step 4.1: Mark Phase 3 done in TODO.md**

Open `TODO.md`. Find the line listing Phase 3 in the entry #30 acceptance bullets:

```
  - **Phase 3 — Fog-of-war.** Implement Q2 (N=2 lookahead, total fog beyond, unanchored boss). Past nodes stay revealed; current row + lookahead show types; beyond is blank. *Result: cartographer feel.*
```

Change to:

```
  - **Phase 3 — Fog-of-war.** ✅ *Shipped 2026-05-03 (see HISTORY).* Q2 implemented: N=2 lookahead, total fog beyond, unanchored boss. Past nodes stay revealed via new `traversedNodeIds` cartographer log on `RunState`; visibility computed by `src/dungeon/visibility.ts`; scene hides fogged containers and edges.
```

(Verify the exact original text first via Read; the date should be today's per the `currentDate` context — adjust if running on a different day.)

- [ ] **Step 4.2: Add the HISTORY entry**

Open `HISTORY.md`. Insert at the very top (newest on top per the file's convention), following the slim-template format from memory:

```markdown
### 2026-05-03 · Map-based dungeon scene — Phase 3 (fog-of-war) (Cluster B · 30)

- **Why:** TODO #30 Phase 3. Replaces the icon-row's "everything visible" with the locked Q2 cartographer-fog design — N=2 lookahead, total fog beyond, unanchored boss, past nodes stay revealed. The map redesign's narrative payoff: the dungeon stops telling the player what's coming and starts feeling like an unexplored space.
- **Decisions:**
  - **Explicit cartographer log over backward-reachability.** Phase 1's `isNodeCleared` walked predecessor edges from `currentNodeId`; for richer DAGs it would mark BOTH branches at a past converging fork as cleared, which is wrong (only the picked branch was walked). New `traversedNodeIds` field on `RunState` records the actual path. Phase 1 explicitly flagged this trade-off; Phase 3 is when it became load-bearing.
  - **Visibility helper as a separate module.** `src/dungeon/visibility.ts` mirrors the `src/dungeon/map_layout.ts` split — pure-TS, unit-tested, scene consumes the result. Same rationale: the BFS-depth computation is testable without Phaser, and an off-by-one in the lookahead window is the kind of bug a 200-node-DAG seed-loop test catches faster than manual play.
  - **Save schema stays at 1.** `traversedNodeIds` defaults to `[currentNodeId]` for old in-progress saves via `normalizeSaveFile`. Old saves lose their prior cartographer trail (one-time cost on upgrade); the field works correctly going forward and no migration is needed.
  - **`playerPath` left untouched.** No production callers; only tests reference it. Removing it is unrelated churn — defer.
- **Surprises:**
  - **`refreshEdges` had to move inside `refreshNodeStates`.** Edge visibility is derived from node visibility, so the two refreshes had to be coupled. The original Phase 1 code called `refreshEdges` once at scene setup and never again — fine when edges were static; not fine when fog slides forward. Net wiring stayed simple.
- **Source:** TODO.md Cluster B · 30 Phase 3. Plan: `docs/superpowers/plans/2026-05-03-map-dungeon-phase-3-fog.md`. Spec is the locked Q2 design embedded in the TODO entry (mirrors Phase 1's convention). Test count delta: $$BASELINE → $$NEW (+~21: 7 traversed-lifecycle, 2 save normalizer, 12 visibility module).
```

Replace `$$BASELINE` and `$$NEW` with the actual counts you noted in steps 1.1 and 3.7. Adjust the surprise list if you encountered something else worth recording during execution.

- [ ] **Step 4.3: Final full-suite run**

Run: `npm test`

Expected: ALL tests pass. Final count matches HISTORY's `$$NEW`. The user reviews the diff and decides on commits — do NOT commit.

- [ ] **Step 4.4: Report to the user**

Summarize: Phase 3 shipped per the locked Q2 design. Files touched, test count delta, smoke-test checklist (from step 3.8) for the user to run. Done.
