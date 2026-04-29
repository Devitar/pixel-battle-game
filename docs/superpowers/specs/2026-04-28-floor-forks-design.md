# Floor Generation: Forks

**Status:** Design · **Date:** 2026-04-28 · **Source:** [`TODO.md`](../../../TODO.md) Cluster A · 8 — gdd §4 + §10 Tier 2.

## Purpose

Convert dungeon floors from linear node lists into branching DAGs. Each Crypt floor gains 1 fork at a fixed position — after one preamble combat, the player picks one of two combat branches that converge at the boss. The data shape and traversal API are designed to absorb future node types (Cluster A · 9 shop nodes, A · 10 elites, A · 11 camp nodes) without further structural changes; in Tier 2, both fork branches are combat encounters with different RNG-rolled enemy compositions, so the *decision quality* is "which fight do you want" rather than "shop or elite?" — that becomes meaningful as soon as new node types land.

## Dependencies and invariants

**Vocabulary already in place:**
- `Node` type (`src/dungeon/node.ts`) — currently `{ combat | boss }` with `id`, `type`, `encounter`. No edge information today.
- `generateFloor(dungeonId, floor, rng): Node[]` (`src/dungeon/floor.ts`) — produces a flat list (3 combat + 1 boss for Crypt).
- `RunState` (`src/run/run_state.ts:13-23`) — tracks `currentFloorNodes: readonly Node[]` and `currentNodeIndex: number`. `currentNode(rs)` returns `currentFloorNodes[currentNodeIndex]`.
- `completeCombat` (`src/run/run_state.ts:71-168`) advances via `currentNodeIndex + 1` for non-boss victories; flips to `camp_screen` for boss.
- `pressOn` regenerates the floor and resets `currentNodeIndex: 0`.
- `Encounter`, `composeCombatEncounter`, `composeBossEncounter`, and `floorScale` are unchanged by this work — fork branches just compose more encounters.
- Save policy: pre-launch — schema stays at v1; new fields default at load via `normalizeSaveFile`; old saves with mismatched shape are discarded.

**Invariants this spec declares:**
- **Every node has `nextNodeIds: readonly string[]`.** Boss has length 0 (terminal). Linear nodes have length 1. Fork sources have length 2. No length-3+ in Tier 2.
- **The graph is a DAG with a single terminal (the boss).** No cycles. All non-start nodes are reachable from the start; the boss is reachable from every node.
- **`currentNodeId: string` replaces `currentNodeIndex: number`.** `currentNode(rs)` looks up by id, not index. Saves with `currentNodeIndex` are discarded as a shape mismatch (per pre-launch policy).
- **`awaitingFork: boolean` distinguishes two states at a fork source.** False during combat; true after combat completes when `nextNodeIds.length === 2`. Cleared by `chooseNextNode`. The boolean is the only state machine extension; no new top-level `RunStatus`.
- **Fork position is fixed at index 1** (after one preamble combat, before two parallel branches that converge at the boss). Tier 2 limitation; A · 9-11 expand to variable-position and 1-2 forks per floor.
- **Branch encounters are deterministic from run RNG.** Both `n2a` and `n2b` compose their encounters in graph order; same seed → same graph including the unchosen branch.

## Module layout

| Path | Action | Responsibility |
|---|---|---|
| `src/dungeon/node.ts` | **Modify** | Add `nextNodeIds: readonly string[]` to both `Node` variants. |
| `src/dungeon/floor.ts` | **Modify** | `generateFloor` returns `{ nodes, startNodeId }`; constructs the diamond graph. |
| `src/dungeon/__tests__/floor.test.ts` | **Modify** | Update length assertions; add fork-shape, terminality, reachability, uniqueness, and determinism tests. |
| `src/run/run_state.ts` | **Modify** | Replace `currentNodeIndex` with `currentNodeId`; add `awaitingFork: boolean`; rewrite `currentNode`; add `nextNodeChoices` and `chooseNextNode`; update `completeCombat` to set `awaitingFork` on fork-source completion and only auto-advance when `nextNodeIds.length === 1`. |
| `src/run/__tests__/run_state.test.ts` | **Modify** | Replace index-based assertions with id-based; add cases for `awaitingFork` lifecycle, `nextNodeChoices`, `chooseNextNode` validation. Existing fight-to-boss loops bridge forks via `chooseNextNode`. |
| `src/save/__tests__/save.test.ts` | **Modify** | Two `currentNodeIndex: 0` fixtures become `currentNodeId: ''` plus `awaitingFork: false`. |
| `src/scenes/dungeon_scene.ts` | **Modify (minimal — defer rest to B · 6)** | Replace `run.currentNodeIndex` reads with `currentNode(run)` lookups. When `awaitingFork: true`, auto-pick branch A as a stub; the proper picker is Cluster B · 6. |
| `src/scenes/combat_scene.ts` | **Modify** | One line: existing `currentNode(run)` call now goes through the helper without surface change. |

No changes to combat resolution, hero shape, perk/trait/leveling code, or save migration.

## Schema changes

### `Node` (`src/dungeon/node.ts`)

```ts
export type Node =
  | { id: string; type: 'combat'; encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'boss';   encounter: Encounter; nextNodeIds: readonly string[] };
```

`nextNodeIds` is required on both variants. Boss has `[]`; linear nodes have one id; fork sources have two ids.

### `RunState` (`src/run/run_state.ts`)

```ts
export interface RunState {
  readonly dungeonId: DungeonId;
  readonly seed: number;
  readonly party: readonly Hero[];
  readonly pack: Pack;
  readonly currentFloorNumber: number;
  readonly currentFloorNodes: readonly Node[];
  readonly currentNodeId: string;     // was: currentNodeIndex: number
  readonly awaitingFork: boolean;     // new
  readonly status: RunStatus;
  readonly fallen: readonly Hero[];
}
```

`currentNodeIndex: number` is removed. `currentNodeId: string` and `awaitingFork: boolean` are required.

### `generateFloor` return shape (`src/dungeon/floor.ts`)

Was: `Node[]`. Now: `{ nodes: readonly Node[]; startNodeId: string }`.

Callers (`startRun`, `pressOn`) read both fields.

## Behavior

### Generator algorithm — Crypt diamond floor

```ts
export function generateFloor(
  dungeonId: DungeonId,
  floorNumber: number,
  rng: Rng,
): { nodes: readonly Node[]; startNodeId: string } {
  const dungeon = DUNGEONS[dungeonId];
  const scale = floorScale(floorNumber);

  const idPrefix = `${dungeonId}-f${floorNumber}`;
  const id0    = `${idPrefix}-n0`;
  const id1    = `${idPrefix}-n1`;
  const id2a   = `${idPrefix}-n2a`;
  const id2b   = `${idPrefix}-n2b`;
  const idBoss = `${idPrefix}-boss`;

  const nodes: Node[] = [
    { id: id0,   type: 'combat', encounter: composeCombatEncounter(dungeon.enemyPool, scale, rng), nextNodeIds: [id1] },
    { id: id1,   type: 'combat', encounter: composeCombatEncounter(dungeon.enemyPool, scale, rng), nextNodeIds: [id2a, id2b] },
    { id: id2a,  type: 'combat', encounter: composeCombatEncounter(dungeon.enemyPool, scale, rng), nextNodeIds: [idBoss] },
    { id: id2b,  type: 'combat', encounter: composeCombatEncounter(dungeon.enemyPool, scale, rng), nextNodeIds: [idBoss] },
    { id: idBoss, type: 'boss',  encounter: composeBossEncounter(dungeon.bossId, dungeon.enemyPool, scale, rng), nextNodeIds: [] },
  ];

  return { nodes, startNodeId: id0 };
}
```

Encounters are composed in array order so the run's `Rng` produces a deterministic graph for a given seed.

The current `dungeon.floorLength` field (= 3 for Crypt) is **not used** by this generator — the diamond shape is hand-shaped at 5 nodes (2 linear + 2 branches + boss). For Tier 2 with one dungeon and a fixed shape, this is fine; A · 9-11 will introduce variable shapes per floor depth, at which point the generator should be parameterized off `floorLength` (or a richer dungeon descriptor) rather than hard-coded. Out of scope here.

### `RunState` traversal API

`currentNode`, `nextNodeChoices`, and `chooseNextNode` live in `src/run/run_state.ts`:

```ts
export function currentNode(runState: RunState): Node {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`currentNode: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const node = runState.currentFloorNodes.find((n) => n.id === runState.currentNodeId);
  if (!node) {
    throw new Error(`currentNode: id '${runState.currentNodeId}' not in current floor`);
  }
  return node;
}

export function nextNodeChoices(runState: RunState): readonly Node[] {
  const cur = currentNode(runState);
  return cur.nextNodeIds.map((id) => {
    const n = runState.currentFloorNodes.find((x) => x.id === id);
    if (!n) throw new Error(`nextNodeChoices: id '${id}' not in current floor`);
    return n;
  });
}

export function chooseNextNode(runState: RunState, nextNodeId: string): RunState {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`chooseNextNode: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const cur = currentNode(runState);
  if (!cur.nextNodeIds.includes(nextNodeId)) {
    throw new Error(`chooseNextNode: '${nextNodeId}' is not a valid next node from '${cur.id}'`);
  }
  return {
    ...runState,
    currentNodeId: nextNodeId,
    awaitingFork: false,
  };
}
```

### `completeCombat` updates

Replace the existing `currentNodeIndex + 1` advance with id-based logic gated on `nextNodeIds.length`:

```ts
// Inside the non-boss success branch of completeCombat (around line 158-167):
const completedNode = currentNode(runState);
const fanout = completedNode.nextNodeIds;

if (fanout.length === 1) {
  // Linear advance — auto-advance to the single next node.
  return {
    runState: {
      ...runState,
      party: partyAfterXp,
      fallen: [...runState.fallen, ...newFallen],
      pack: newPack,
      status: 'in_dungeon',
      currentNodeId: fanout[0],
      // awaitingFork already false
    },
  };
}

// fanout.length === 2: fork source. Stay at this node; flag awaitingFork.
// The dungeon scene shows the picker (Cluster B · 6) and calls chooseNextNode.
return {
  runState: {
    ...runState,
    party: partyAfterXp,
    fallen: [...runState.fallen, ...newFallen],
    pack: newPack,
    status: 'in_dungeon',
    awaitingFork: true,
  },
};
```

**Boss path unchanged:** `nextNodeIds.length === 0` is the boss case, which goes through the existing `if (isBoss)` branch and flips status to `camp_screen`.

### `startRun` and `pressOn`

Both consume the new `{ nodes, startNodeId }` shape:

```ts
// startRun:
const { nodes, startNodeId } = generateFloor(dungeonId, 1, rng);
return {
  // …
  currentFloorNodes: nodes,
  currentNodeId: startNodeId,
  awaitingFork: false,
  // …
};

// pressOn:
const { nodes, startNodeId } = generateFloor(runState.dungeonId, nextFloor, rng);
return {
  ...runState,
  currentFloorNumber: nextFloor,
  currentFloorNodes: nodes,
  currentNodeId: startNodeId,
  awaitingFork: false,
  status: 'in_dungeon',
};
```

### Dungeon scene — minimal stub

`src/scenes/dungeon_scene.ts` reads `currentNodeId` instead of `currentNodeIndex`. Per-position icon layout (`NODE_X[i]`) keeps the current 4-node row for Tier 2 (the unchosen branch isn't visualized — the icon row maps to the player's path: n0 → n1 → chosen-2x → boss). Once `awaitingFork: true`, the scene calls `chooseNextNode(rs, nextNodeIds[0])` automatically — a stub for the picker UI that ships in Cluster B · 6.

```ts
// in the appropriate state-transition handler:
const run = appState.get().runState!;
if (run.awaitingFork) {
  // Stub: auto-pick branch A. Cluster B · 6 replaces this with a picker overlay.
  const cur = currentNode(run);
  appState.update((s) => ({
    ...s,
    runState: chooseNextNode(s.runState!, cur.nextNodeIds[0]),
  }));
}
```

The stub call site lives wherever the scene currently transitions to `walking_to_next` — invoke it before computing `partyXForNode(...)` so the path advances automatically.

### Save persistence

Pre-launch policy: schema stays at v1. Old saves with `currentNodeIndex` no longer match the new `RunState` type — they get discarded by the loader's existing pairing-invariant check (`runState/runRngState`) or by the type-shape mismatch on `currentNodeId`. Acceptable per the pinned-at-1 policy. `awaitingFork` defaults to `false` if missing, via the existing `normalizeSaveFile`-style backfill (extend the function with one line if needed).

## Tests

### `src/dungeon/__tests__/floor.test.ts` — modify

1. `generateFloor` returns `{ nodes, startNodeId }` (shape change).
2. Crypt floor has 5 nodes (was 4).
3. `startNodeId === 'crypt-f1-n0'` (or matches the actual generated id format).
4. **Edge structure:**
   - `nodes.find(n => n.id === startNodeId).nextNodeIds` has length 1, points to `n1`.
   - `n1.nextNodeIds.length === 2`, contains both branch ids (test asserts membership; ordering covered by determinism test #8).
   - `n2a.nextNodeIds === [boss.id]`.
   - `n2b.nextNodeIds === [boss.id]`.
   - `boss.nextNodeIds.length === 0`.
5. **Single terminal:** exactly one node has `nextNodeIds.length === 0`, and it's the boss.
6. **Reachability:** every non-start node id appears in some other node's `nextNodeIds`.
7. **Unique ids:** `new Set(nodes.map(n => n.id)).size === nodes.length`.
8. **Determinism:** `generateFloor('crypt', 1, createRng(7))` produces structurally equal results across two calls (encounters included).

### `src/run/run_state.ts` — `src/run/__tests__/run_state.test.ts` — modify

9. `startRun` initializes `currentNodeId === startNodeId` and `awaitingFork === false`.
10. `currentNode(rs)` returns the node matching `currentNodeId`.
11. `currentNode(rs)` throws when `currentNodeId` isn't in the floor (defensive).
12. `currentNode(rs)` throws when `status !== 'in_dungeon'` (existing behavior preserved).
13. `nextNodeChoices(rs)` returns the array of next nodes — length 1 from `n0`, length 2 from `n1`, length 1 from either branch.
14. `chooseNextNode(rs, validId)` advances `currentNodeId`; clears `awaitingFork`.
15. `chooseNextNode(rs, invalidId)` throws.
16. `chooseNextNode(rs, ...)` throws when `status !== 'in_dungeon'`.
17. **`completeCombat` linear advance:** completing `n0` sets `currentNodeId` to `n1`'s id; `awaitingFork` stays false.
18. **`completeCombat` at fork source (n1):** `currentNodeId` stays at `n1`'s id; `awaitingFork` becomes true; status stays `'in_dungeon'`; party/pack/loot updates still apply.
19. **`completeCombat` after fork pick (n2a or n2b):** linear advance to boss; `awaitingFork` stays false.
20. **Boss path:** `completeCombat` on the boss flips status to `'camp_screen'` (existing behavior).
21. Existing fight-to-boss loops in tests use `nextNodeChoices(rs)` and `chooseNextNode(rs, choice.id)` to bridge the fork.

### `src/save/__tests__/save.test.ts` — modify

22. The two `runState` test fixtures with `currentNodeIndex: 0` switch to `currentNodeId: ''` and add `awaitingFork: false`. Both fields are required on `RunState`.

**Estimated test count delta:** ~+12 new cases minus ~3 obsoleted index-based assertions = **+9 net**.

## Out of scope

- **Variable fork count or position.** Tier 2 ships fixed 1 fork at index 1. Variable count/position lands with shop/elite/camp content (A · 9-11) where the decision is meaningful.
- **Multi-step branches.** Both fork branches are 1 node before convergence. "Blind path beyond" gdd framing kicks in when branches grow to 2+ nodes — Tier 3 with longer dungeons.
- **New node types.** Shop, elite, camp, event are A · 9-11 and 13/14. This task only ships combat-vs-combat forks.
- **Fork picker UI.** Cluster B · 6. This task ships a stub auto-pick so the run loop completes; the picker replaces the stub via the same `chooseNextNode` API.
- **Visual rendering of the unchosen branch.** Out of scope — the scene's icon row maps to the player's path; unchosen branches exist in data but aren't drawn. Cluster B · 6 owns the visualization.
- **Floor-shape parameterization off `dungeon.floorLength`.** Generator hard-codes the diamond shape; future generalization is an A · 9-11 concern.

## Surprises / call-outs

- **`awaitingFork` is the cleanest state encoding.** Considered overloading `status` with a new `'choosing_fork'` value, but that breaks more places (combat-scene checks, save normalizer, status-machine docs) than a boolean flag does. The flag also persists in saves naturally — a save during a fork moment restores correctly.
- **Tier 2 fork decision quality is low.** Both branches are combat — the player's choice is "which enemy comp fight do you prefer." Mechanically meaningful only when shops/elites land. Ships now because (a) the data shape is the foundation other tasks depend on, and (b) doing it before A · 9-11 means those tasks slot into branches without further refactoring.
- **Generator hardcodes the diamond shape.** `floorLength: 3` on `DungeonDef` is technically obsolete for the new generator — kept in the data file as documentation but unused. Document the obsolescence in the generator's comment so the next reader knows.
- **Old saves get discarded.** The loader's pairing-invariant check (`runState/runRngState`) plus type-shape mismatch on `currentNodeIndex` → `currentNodeId` ensures old in-progress runs don't carry over. Pre-launch acceptable; post-launch this would need a migration.
- **Dungeon scene gets a temporary auto-pick stub.** Functions correctly but auto-picks branch A every time. Cluster B · 6 replaces this with the real picker. The stub is one if-statement, cleanly removable.
