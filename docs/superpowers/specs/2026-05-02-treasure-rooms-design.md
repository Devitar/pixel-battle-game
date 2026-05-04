# Treasure rooms — Phase 2a — Design

- **TODO entry:** Cluster B · 30 (Map-based dungeon scene). Phase 2a, split out from Phase 2 during the 2026-05-02 brainstorm.
- **Tier:** 2 polish (per gdd §10).
- **Date:** 2026-05-02.

## 1 · Scope

Introduce a new `'treasure'` node type and matching overlay scene, integrated into the existing 5-node fork generator. Visiting a treasure node opens a chest UI; clicking the chest reveals a guaranteed item; clicking again adds it to the pack and resumes the dungeon. The new node type is reachable via two new fork shapes (`treasure_vs_combat`, `treasure_vs_elite`) that extend the current 10-shape catalog to 12.

Phase 2a deliberately ships **before** the new 8/9/10-row DAG generator (Phase 2b) so the treasure mechanic can be playtested inside the familiar 5-node topology before the topology itself changes — keeping two variables separate.

**Out of scope:**

- **Phase 2b (8/9/10-row generator with full Q6 distribution rules).** Owns its own spec/plan when 2a ships.
- **Phase 5 (combat-loot rate reduction from 50% → ~20%).** Treasure's value-over-combat is *currently* "guaranteed vs. coin-flip"; once Phase 5 lands the gap widens further. Do not pre-tune for Phase 5 here.
- **Bespoke chest sprite.** 2a uses emoji glyphs (📦 closed; opened state is glyph + color flash, no second sprite needed). Real pixel art for the chest is a Cluster C art-polish follow-up.
- **Pack-capacity / "leave it" branch.** The pack model has no capacity limit today; player always takes the item. No reject/leave path needed.
- **`RunState` field changes.** Treasure introduces a new `Node` variant in the discriminated union; no top-level `RunState` field is added or modified.
- **Save schema bump.** Memory: pre-launch policy keeps schema pinned at 1; the loader's "newer-than-supported" rejection discards stale browser saves automatically. The `Node` union extension is a content-shape change, not a schema change — existing in-flight saves with old 5-node floors deserialize unchanged.
- **Treasure-node fork branches.** Both new shapes route their treasure branch directly to the boss (`nextNodeIds: [idBoss]`), mirroring the existing camp/event branches. No fork-after-treasure mechanic.

## 2 · Locked design (brainstormed 2026-05-02)

| Q | Decision |
|---|---|
| **Q1 — Phase 2 scope** | Split into 2a (treasure rooms in 5-node floor) + 2b (new generator). 2a ships first. |
| **Q2 — Treasure mechanic** | **B. Click-to-open chest.** Two clicks: open → reveal → take → continue. Discovery moment, not a decision. Matches existing overlay-scene pattern (shop / camp / event). |
| **Q3 — Loot policy** | **A. Current-floor weights, guaranteed drop.** Identical to combat-loot logic except no 50% gate. Predictability is the value, not rarity bias. |
| **Q4 — Fork-shape integration** | **B. Two pairings: `treasure_vs_combat` + `treasure_vs_elite`.** 12 shapes total (was 10). Treasure appears in 2/12 = ~17% of forks ≈ ~50% of 3-floor runs. Enough to playtest the UI without bumping the rate to where it muddies what 2b will tune. |

## 3 · Architecture

Five units, each with one responsibility. Files that change together live together.

| Path | Action | Responsibility |
|---|---|---|
| `src/dungeon/node.ts` | **Modify** | Add `'treasure'` variant to the `Node` discriminated union. |
| `src/dungeon/loot.ts` | **Modify** | Rename `CombatKind` → `LootKind`; add `'treasure'` case to `rollLoot`. |
| `src/dungeon/floor.ts` | **Modify** | 2 new fork shapes; `usesTreasureBranch`/`buildTreasureBranch` plumbing; 2 switch cases. |
| `src/run/run_state.ts` | **Modify** | New pure helper `claimTreasure(runState, item) -> RunState`. Update `completeCombat`'s non-combat-bearing-node check to include `'treasure'`. |
| `src/scenes/treasure_room_overlay_scene.ts` | **Create** | New Phaser scene. Two-click flow: open → reveal → take. Threads `runRngState` for deterministic loot roll. |
| `src/scenes/dungeon_scene.ts` | **Modify** | `handleArrival` gains a `'treasure'` case; `glyphForNodeType` gains a `'treasure'` case. |
| `src/main.ts` | **Modify** | Register `TreasureRoomOverlayScene`. |

## 4 · Data model

```ts
// dungeon/node.ts — add to the Node union
| { id: string; type: 'treasure'; nextNodeIds: readonly string[] }
```

No `loot` field on the node; the item is rolled at scene-time using `runRngState` (same RNG-threading discipline combat uses). Floors generated pre-2a have no treasure nodes and play out unchanged. The `NodeType` exported alias picks up the new variant automatically.

## 5 · Treasure overlay UX flow

```
DungeonScene.handleArrival
        │  (current node type === 'treasure')
        ▼
scene.launch('treasure_room_overlay'); scene.pause('dungeon')
        ▼
[Overlay shows]
   • 60% black backdrop
   • Centered panel (~340×220, dark grey, gold stroke)
   • Title "Treasure!" (gold)
   • Closed chest glyph "📦" (large, centered)
   • Prompt "▸ click to open" (italic, subdued)
        │  click 1 (open)
        ▼
   • Restore Rng from runRngState
   • item = rollLoot(rng, floor, 'treasure')
   • Glyph swaps to opened state (color flash + 📦 → 📭 or sparkle suffix; final choice during execution)
   • Reveal: name + affixes, rarity-colored (uses RARITY_HEX)
   • Prompt becomes "▸ click to take"
        │  click 2 (take)
        ▼
   • appState.update writes runState = claimTreasure(s.runState, item)
                          runRngState = rng.getState()
   • scene.stop(); scene.resume('dungeon')
        ▼
DungeonScene RESUME handler walks the party to next node (existing flow,
single-fanout in 2a's treasure forks → no fork pick after)
```

The two clicks land on the same backdrop or panel rectangle — no separate buttons (matches the dungeon's result-panel "click anywhere to continue" pattern).

## 6 · Loot policy details

`rollLoot(rng, floor, 'treasure')`:

- Guaranteed drop (no `rng.next() >= 0.5` gate).
- `slot = rng.pick(ALL_SLOTS)` — uniform across all 4 slots.
- `rarity = pickRarity(rng, floor)` — same per-floor table combat uses (no boss-style next-floor bump, no elite-style forced rare).
- Affix values use `floorNumber` for scaling; `floorRolledAt` stamped with `floorNumber`.

Implementation = ~5 added lines inside the existing `rollLoot` body — a new branch that skips the 50% gate and falls into the same body the combat case uses (with `effectiveFloor = floorNumber`).

## 7 · Generator changes

`floor.ts`:

```ts
type ForkShape =
  | 'shop_vs_combat'
  | 'elite_vs_combat'
  | 'elite_vs_shop'
  | 'camp_vs_combat'
  | 'camp_vs_shop'
  | 'camp_vs_elite'
  | 'event_vs_combat'
  | 'event_vs_shop'
  | 'event_vs_elite'
  | 'event_vs_camp'
  | 'treasure_vs_combat'    // NEW
  | 'treasure_vs_elite';    // NEW

const FORK_SHAPE_WEIGHTS: readonly WeightedOption<ForkShape>[] = [
  // ...existing 10 entries unchanged...
  { value: 'treasure_vs_combat', weight: 1 },
  { value: 'treasure_vs_elite',  weight: 1 },
];
```

New flag + builder mirror the existing camp pattern:

```ts
const usesTreasureBranch =
  shape === 'treasure_vs_combat' ||
  shape === 'treasure_vs_elite';

const buildTreasureBranch = (id: string): Node => {
  if (!usesTreasureBranch) {
    throw new Error(`generateFloor: treasure branch not in shape '${shape}'`);
  }
  return { id, type: 'treasure', nextNodeIds: [idBoss] };
};
```

Treasure branches consume **no RNG** during generation (the loot is rolled at scene-time, not at floor-gen time — same as event cards' resolution-time rolls).

Two new switch cases:

```ts
case 'treasure_vs_combat':
  node2a = specialOnBranchA ? buildTreasureBranch(id2a) : buildCombatBranch(id2a);
  node2b = specialOnBranchA ? buildCombatBranch(id2b)   : buildTreasureBranch(id2b);
  break;
case 'treasure_vs_elite':
  node2a = specialOnBranchA ? buildTreasureBranch(id2a) : buildEliteBranch(id2a);
  node2b = specialOnBranchA ? buildEliteBranch(id2b)    : buildTreasureBranch(id2b);
  break;
```

## 8 · Run-state helper

```ts
// run/run_state.ts — new pure helper, sibling to leaveShop / chooseCampNodeEffect
export function claimTreasure(runState: RunState, item: Item): RunState {
  if (runState.status !== 'in_dungeon') {
    throw new Error(`claimTreasure: status must be 'in_dungeon', got '${runState.status}'`);
  }
  const cur = currentNode(runState);
  if (cur.type !== 'treasure') {
    throw new Error(`claimTreasure: current node is type '${cur.type}', not 'treasure'`);
  }
  return {
    ...runState,
    pack: addItem(runState.pack, item),
    currentNodeId: cur.nextNodeIds[0],
  };
}
```

`completeCombat`'s defensive check on non-combat-bearing nodes extends:

```ts
// Existing line:
if (completedNode.type === 'shop' || completedNode.type === 'camp' || completedNode.type === 'event') {
// Becomes:
if (completedNode.type === 'shop' || completedNode.type === 'camp' || completedNode.type === 'event' || completedNode.type === 'treasure') {
```

Treasure nodes don't fight, so reaching `completeCombat` from one is the same kind of bug the existing branches guard against.

## 9 · Tests

- **`floor.test.ts`** — `seenShapes` set extends from 10 to 12 entries (`'combat+treasure'`, `'elite+treasure'`). Add per-shape tests mirroring the existing `camp_vs_*` pattern: pair appears, branch types correct, both branches point at boss.
- **`loot.test.ts`** — new tests: treasure always drops over N seeds (no `null` returns); treasure rarity distribution matches combat's per-floor weights at floors 1, 5, 10; treasure scaling is current-floor (not boss-bumped, not elite-forced-rare).
- **`run_state.test.ts`** — new `claimTreasure` cases: adds item to pack, advances `currentNodeId`, throws on non-`'in_dungeon'` status, throws on non-`'treasure'` current node.
- **No scene tests.** Treasure overlay is verified by typecheck + manual smoke (consistent with shop / camp / event overlays which have no scene tests).

Test count delta target: ~1421 → ~1433 (+12: roughly 4 in floor.test, 4 in loot.test, 4 in run_state.test). The existing `seenShapes` test extends to a 12-entry set but stays one test, so it doesn't bump the count. Final delta will land within ±2 depending on how granularly each behavior gets sub-tested.

## 10 · Backward compat

In-flight saves with pre-2a 5-node floors: `currentFloorNodes` deserializes as the existing 4 fork shapes; no treasure nodes present. Play continues unchanged. New floors generated post-2a (via `pressOn` or new run start) draw from the 12-shape pool and may produce treasure forks. No migration code needed; no schema bump.

## 11 · UI / sprites

2a uses two emoji-based glyph states for the chest:

- **Closed:** `📦` (existing pack-emoji used elsewhere in the HUD; semantic match).
- **Opened:** `📭` (open mailbox — repurposed as opened-chest visual) OR `📦 ✨` (closed chest with sparkle suffix). Final pick during execution; no design impact.

Bespoke chest sprite is a Cluster C follow-up (low priority); this design intentionally avoids depending on art that doesn't exist yet.

The map-renderer node-glyph for treasure nodes (in `dungeon_scene.ts`'s `glyphForNodeType`) uses `📦` (matches the closed-chest state — visually signals "unopened treasure" before the player visits).
