# Phase 2b — New 8/9/10-row DAG floor generator — Design

- **TODO entry:** Cluster B · 30 (Map-based dungeon scene). Phase 2b, split out from Phase 2 during the 2026-05-02 brainstorm; ships after Phase 2a (treasure rooms in 5-node floor).
- **Tier:** 2 polish (per gdd §10).
- **Date:** 2026-05-03.

## 1 · Scope

Replace the existing 5-node fork-floor generator (`shop_vs_combat`, `elite_vs_combat`, ... × 12 shapes) with a multi-row DAG generator that produces 8/9/10-row floors per floor depth, satisfying the locked Q3/Q4/Q6 design constraints from TODO #30. The new generator constructs floors row-by-row with strict no-cross edges via a 3-slot grid, assigns node types via a quota-based pre-roll, and enforces adjacency + back-to-back + penultimate-row constraints during placement.

Phase 2a already added the `'treasure'` Node variant + treasure-room overlay scene; Phase 2b uses both without further changes.

**Out of scope:**

- **Phase 5 (combat-loot rate reduction from 50% → ~20%).** Owns its own future task. Treasure already exists; balance comes later.
- **`RunState` field changes.** No top-level RunState fields added or modified.
- **Save schema bump.** Memory pre-launch policy: schema stays pinned at 1; the loader's "newer-than-supported" rejection handles stale browser saves. Pre-2b in-flight saves with 5-node `currentFloorNodes` continue to render and play out unchanged via Phase 1's map renderer (which handles arbitrary DAGs); only `pressOn` / `startRun` after 2b lands invokes the new generator.
- **Per-floor distribution scaling.** Quota counts for shop/camp/treasure/event stay constant across floors 1/2/3 in v1. Elite-count weighting shifts slightly toward 2 on later floors. Future balance work can add more floor-depth tuning.
- **New node types beyond what 2a introduced.** No mini-boss, no dual-encounter, no merchant-with-camp.
- **Layout module rewrite.** The Phase 1 module gets a small update (slot-based y positioning) but its API and `MapLayout` shape stay the same; the dungeon scene doesn't change.
- **Bespoke art.** No new sprites; existing glyphs cover all node types.

## 2 · Locked design (brainstormed 2026-05-03)

| Q | Decision |
|---|---|
| **Q1 — Generator algorithm** | **B. Row-by-row construction.** Maps cleanly to existing data model (`Node[]` with `nextNodeIds` indexed by depth-from-start) and to the Phase 1 layout module. Predictable + testable. |
| **Q2 — First / last row structure** | **C. Row 0 = exactly 1 combat (single start). Last row = exactly 1 boss (single terminal). Middle rows use the 1-3 column-count roll.** Preserves `startNodeId` semantics ("unique source with no incoming edges") and matches the design's "first row combat-only" + "Boss = 1 terminal" rules. |
| **Q3 — Type assignment** | **A. Quota-based pre-roll.** Roll exact counts up front (1 shop + 1 camp + 1-2 treasure + 1-2 event + 1-2 elite + remainder combat); shuffle into a typed list; place column-by-column with adjacency-violation swaps. Predictable counts, predictable tests. |
| **Q4 — Back-to-back rule scope** | **B. Combat-permitted; all 5 specials forbidden.** combat→combat is fine. Forbidden along any source-to-terminal path: shop→shop, camp→camp, treasure→treasure, event→event, elite→elite. The distribution math (combat ~55% of floor) makes strict alternation impossible, and StS uses this exact rule. |

## 3 · Architecture

Files touched:

| Path | Action | Responsibility |
|---|---|---|
| `src/dungeon/floor.ts` | **Rewrite** | New row-by-row generator. The 12-fork-shape catalog goes away entirely. ~250 lines of new logic. |
| `src/dungeon/__tests__/floor.test.ts` | **Rewrite** | Old per-shape tests replaced with topology + distribution + constraint assertions. ~350 lines. |
| `src/dungeon/map_layout.ts` | **Modify** | Slot-based y positioning instead of even distribution. ~10 lines changed. |
| `src/dungeon/__tests__/map_layout.test.ts` | **Modify** | Update the "fork branches share x but differ in y" test to use slot-based y values. Existing assertions otherwise hold. |
| `src/dungeon/node.ts` | **Modify** | Add `slot: 0 | 1 | 2` to every Node variant. ~7 lines added. |
| `src/run/run_state.ts` | **No change** | The DAG shape (`Node[]` + `nextNodeIds`) is unchanged. `playerPath`, `chooseNextNode`, etc. all work as-is. |
| `src/scenes/dungeon_scene.ts` | **No change** | Phase 1's renderer already handles arbitrary DAGs. New per-row counts + edge density just produce a denser map. |

## 4 · Data model

```ts
// dungeon/node.ts — add `slot` to every variant
export type Node =
  | { id: string; type: 'combat'; encounter: Encounter; nextNodeIds: readonly string[]; slot: 0 | 1 | 2 }
  | { id: string; type: 'elite';  encounter: Encounter; nextNodeIds: readonly string[]; slot: 0 | 1 | 2 }
  | { id: string; type: 'boss';   encounter: Encounter; nextNodeIds: readonly string[]; slot: 0 | 1 | 2 }
  | { id: string; type: 'shop';   inventory: readonly ShopItem[]; nextNodeIds: readonly string[]; slot: 0 | 1 | 2 }
  | { id: string; type: 'camp';   nextNodeIds: readonly string[]; slot: 0 | 1 | 2 }
  | { id: string; type: 'event';  cardId: EventCardId; nextNodeIds: readonly string[]; slot: 0 | 1 | 2 }
  | { id: string; type: 'treasure'; nextNodeIds: readonly string[]; slot: 0 | 1 | 2 };
```

Boss row and start row both have a single node at slot 1 (center) by convention.

**Save backward-compat for `slot`:** existing in-flight save data has nodes without a `slot` field. The layout module will fall back to even-distribution-by-row-index when `slot` is absent, matching Phase 1 behavior — so old floors render unchanged for one transitional run, then the new generator kicks in on `pressOn`. Not a schema bump; the field is additive on the union variants.

## 5 · Generation pipeline

```
generateFloor(dungeonId, floorNumber, rng) -> { nodes, startNodeId }:

  rowCount = 8 + (floorNumber - 1)            // 8/9/10 for floors 1/2/3

  // Pass 1: row sizes (column counts)
  rowSizes[0]            = 1                  // start row (combat)
  rowSizes[rowCount - 1] = 1                  // boss row
  for r in 1 .. rowCount - 2:
    rowSizes[r] = rng.weighted([{value: 1, weight: 20}, {value: 2, weight: 50}, {value: 3, weight: 30}])

  // Pass 2: slot assignment within each row
  // Row size 1 → slot [1] (center)
  // Row size 2 → uniform pick among [{0,1}, {0,2}, {1,2}]
  // Row size 3 → slots [0, 1, 2]
  rowSlots[r] = pick slot indices per rowSizes[r]

  // Pass 3: build node id stubs (without type yet)
  // Each node gets id = `${dungeonId}-f${floorNumber}-r${r}-s${slot}`
  // Also record slot index on the node (data shape extension from §4)

  // Pass 4: edges (slot ±1 rule, strict no-cross)
  for each r in 0 .. rowCount - 2:
    for each row-r node at slot s:
      candidates = row-(r+1) nodes at slots in {s-1, s, s+1} that exist
      edgeCount = clamp(rng.weighted([{1, 70}, {2, 30}]), 1, candidates.length)
      pick edgeCount distinct candidates uniformly → record outgoing edges

  // Pass 5: orphan-pruning. Every row-(r+1) node must have ≥1 incoming edge.
  for each r in 0 .. rowCount - 2:
    for each row-(r+1) node X at slot sx with no incoming edges:
      // Find the row-r node closest in |slot - sx|; tie-break by smaller slot
      add edge from that row-r node to X

  // Pass 6: type assignment via quota (over the middle rows only)
  middleNodeCount = sum(rowSizes[1..rowCount-2])
  quota = {
    shop:     1,
    camp:     1,
    treasure: rng.weighted([{1, 50}, {2, 50}]),
    event:    rng.weighted([{1, 50}, {2, 50}]),
    elite:    rng.weighted([
      // Floor 1: bias toward 1; floor 3: bias toward 2.
      {1, 60 - 20 * (floorNumber - 1)},
      {2, 40 + 20 * (floorNumber - 1)},
    ]),
  }
  combatCount = middleNodeCount - sum(quota values)
  if combatCount < 0:
    bump seed and retry from Pass 1   // rare; small middle-node count
  quota.combat = combatCount
  typedList = shuffle(flatten(quota))   // length = middleNodeCount

  // Pass 7: placement with adjacency + back-to-back enforcement
  for each middle node M (scanning row-major, slot-major within row):
    candidate = typedList.shift()
    if violates(M, candidate, alreadyPlaced):
      // Find the next index j in typedList where typedList[j] doesn't violate at M
      // AND swapping with index 0 doesn't break later placements
      swap typedList[0] ↔ typedList[j]; pop j-th element instead
      if no valid j → bump seed; restart from Pass 1
    M.type = candidate

  violates(M, candidate, alreadyPlaced):
    // Same-row adjacency: a node consecutive to M in the same row's slot ordering
    // ("adjacent" = next-in-row when nodes are sorted by slot, regardless of slot
    // gap; e.g., a 2-node row at slots [0, 2] has those two nodes adjacent even
    // though |Δslot|=2, because slot 1 is empty in that row).
    let rowSorted = nodes in M.row sorted by slot
    let mIndex = rowSorted.indexOf(M)
    for each neighbor in [rowSorted[mIndex - 1], rowSorted[mIndex + 1]] (when defined and already placed):
      if neighbor.type === candidate: return true
    // Back-to-back along path: any predecessor in row M.row - 1 with same type AND
    // candidate is in {shop, camp, treasure, event, elite} (combat allowed to repeat).
    if candidate in {shop, camp, treasure, event, elite}:
      for each pred in row M.row-1 with edge to M:
        if pred.type === candidate: return true
    return false

  // Pass 8: penultimate-row guarantee
  penult = nodes in row (rowCount - 2)
  if no node in penult has type ∈ {camp, treasure}:
    // Find a camp or treasure elsewhere in middle rows; swap its type with one penult node
    target = first non-row-0 non-boss non-penult node with type ∈ {camp, treasure}
    if target exists: swap target.type ↔ penult[0].type
    else: bump seed; restart from Pass 1   // very rare

  // Pass 9: encounter composition + shop inventory + event card draw
  for each combat/elite/boss node:
    encounter = composeCombatEncounter / composeEliteEncounter / composeBossEncounter (existing helpers)
  for each shop node:
    inventory = generateShop(floorNumber, rng).inventory (existing helper)
  for each event node:
    cardId = drawEventCard(...).id (existing helper)
  for each treasure node:
    no encounter / inventory / cardId — node is just a marker (loot rolls at scene-time)

  return { nodes, startNodeId: row-0-slot-1 node id }
```

**Bounded retries.** Passes 6/7/8 may cause a seed-bump-and-restart (rare). Cap at 10 retries per floor; if exceeded, throw — caller decides what to do (in practice the test sweep will assert this never fires on any seed in the first 1000).

**Determinism.** All RNG draws are sequential and well-defined by the pass order; same seed always produces same floor. The seed-bump path uses `rng.next()` once to advance state before retrying, so the retry path is also deterministic.

## 6 · Layout module update

Phase 1's `computeMapLayout` distributes nodes evenly within each row's height. Phase 2b switches to **slot-based y positioning**: slot 0 → top-third of layout rect, slot 1 → mid, slot 2 → bottom-third.

```ts
// map_layout.ts — replacement positioning logic for the per-row distribution loop
for each row r with nodes at slots [s0, s1, ...]:
  for each node:
    y = options.top + (options.height * (slot + 1)) / 4
    x = options.left + d * colSpacing      // unchanged from Phase 1
```

Slot-based positioning means: a slot-1 node at row 3 sits at the same y as a slot-1 node at row 5; an entire vertical column of edges between two-node rows always uses the same two y values. Visually consistent across rows.

**Backward compat for old saves.** Existing in-flight saves have nodes without a `slot` field. The layout module checks for `slot` presence:

```ts
const slot = (node as { slot?: 0 | 1 | 2 }).slot;
if (slot === undefined) {
  // Phase 1 fallback: even distribution by within-row index
  y = options.top + (options.height * (i + 1)) / (rowSize + 1);
} else {
  y = options.top + (options.height * (slot + 1)) / 4;
}
```

Phase 1 behavior preserved for one transitional run; no migration code needed.

## 7 · Tests

`floor.test.ts` is rewritten end-to-end. The old per-shape catalog (10/12 shapes) is gone; the new tests assert topology + distribution + constraint properties:

- **Topology:** row count = 8/9/10 by floor; row 0 has 1 node of type `'combat'`; last row has 1 node of type `'boss'`; middle row sizes ∈ [1, 3].
- **Edges:** every non-start node has ≥1 incoming edge; every non-boss node has ≥1 outgoing edge; every edge connects row r to row r+1; every edge respects slot ±1.
- **Determinism:** same seed → identical floor (full-equality on `nodes`).
- **Quota counts:** exactly 1 shop, exactly 1 camp, 1-2 treasure, 1-2 event, 1-2 elite, total summing to middleNodeCount, balance is combat. Verified across a 1000-seed sweep.
- **Combat percentage:** combat count / total node count ≈ 50% (loose lower bound 40%, upper 65%) across 1000 seeds.
- **Adjacency:** within any row, sort nodes by slot; no two consecutive entries (slot-sorted) share a type. (Defined this way because a 2-node row at slots [0, 2] has those two nodes "adjacent" — slot 1 is empty between them.)
- **Back-to-back:** along every source-to-terminal path, no two consecutive nodes of the same special type (shop/camp/treasure/event/elite).
- **Penultimate-row guarantee:** every floor has ≥1 camp or treasure in row (rowCount - 2).
- **Path length:** every path from start to boss is exactly rowCount nodes (path-length = depth; one node per row visited).
- **No-cross edges (visual):** for any two edges (a→b) and (c→d) in the same row pair (rows r → r+1), if a.slot < c.slot then b.slot ≤ d.slot.
- **Encounter composition:** every combat/elite has an `encounter` field; boss has 32×32 frame; shop has 4 inventory items; event has valid `cardId`; treasure has no encounter / inventory / cardId.
- **Retry budget:** over 1000 seeds, the seed-bump-and-restart path fires < N times for some small N (e.g., < 10). Asserts the algorithm converges almost always.

`map_layout.test.ts` updates: the existing fork-branches-share-x-differ-in-y test stays valid (slots 0 and 2 share x but have different y); add a new test verifying the slot-based y formula.

`run_state.test.ts` updates: tests that walk floors via `advanceToBossNode` may need helper adjustments since the floor topology is now rich (8-10 rows instead of 4). The Phase 2a fix (priority chain `combat → elite → shop → camp → fallback`) should already handle multi-row floors. Run the full suite to verify; small touch-ups expected.

**Test count delta target:** ~1433 → ~1430 ± 10. The existing 35 floor.test.ts tests are largely replaced by ~30 new topology/distribution/constraint tests. `map_layout.test.ts` gains 1-2 slot-positioning tests. `run_state.test.ts` may flux a couple of tests up or down depending on helper rewrites. Net change is small in number but the floor-test rewrite is significant in volume.

## 8 · Risks and mitigations

- **Risk: quota math infeasible.** A small middle-node count (e.g., 6 from low-rolled rowSizes) might leave too few combats once specials are subtracted (1+1+2+2+2 = 8 specials > 6 slots). Mitigation: Pass 6 catches `combatCount < 0` and bumps seed. Tests assert this almost never happens.
- **Risk: penultimate-row guarantee unsatisfiable.** Same shape — no camp/treasure outside penult to swap from. Mitigation: Pass 8 catches and bumps seed. Tests verify the rate.
- **Risk: existing `playerPath` / `pathPositionFor` consumers break with multi-node rows.** `playerPath` returns the player's traversal path; in Phase 2b that's the linear sequence of currentNodeId values the player has walked. Re-read the function — it should still produce sensible output. Phase 1's dungeon scene already removed the position-by-BFS-depth logic.
- **Risk: shop/camp/event tests in `run_state.test.ts` rely on specific seeds finding specific shapes.** With the new generator, the seed→shape relationship is gone. Likely need to update `startRunWithShop` / `navigateToShop` helpers to scan more seeds and walk longer paths. Identified as a touch-up in §7.

## 9 · Out-of-scope (revisit list)

- Per-floor distribution scaling beyond elite-count (e.g., more treasure on floor 3).
- Floor-themed special-node counts (e.g., Crypt always has 2 events because it's spooky).
- Player-visible row separators / floor-progress indicator on the map.
- Variant fork density (small-floor-1 → big-floor-3 player option).
