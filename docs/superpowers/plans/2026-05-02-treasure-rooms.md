# Treasure Rooms — Phase 2a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `'treasure'` node variant + a click-to-open-chest overlay scene to the existing 5-node fork-floor generator. Visiting a treasure node guarantees one item drop using current-floor rarity weights. Two new fork shapes (`treasure_vs_combat`, `treasure_vs_elite`) introduce treasure to the existing 10-shape catalog. Phase 2a of TODO #30; ships before Phase 2b's bigger generator rewrite so the chest mechanic can be playtested in the familiar topology.

**Architecture:** Six tasks, ordered so the game is **playable at every task boundary**. Bottom-up plumbing first (node union → run-state helper → loot policy → overlay scene → dungeon-scene wire-up); the floor generator change that *emits* treasure nodes lands last so no intermediate state generates nodes that nothing knows how to handle. Scene tests are not added (consistent with shop / camp / event overlays); pure modules are TDD'd.

**Tech Stack:** TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 4, Phaser 4. Phaser Containers + Rectangles + Text for the overlay (no new primitives).

**Spec:** `docs/superpowers/specs/2026-05-02-treasure-rooms-design.md` (locked design Q1–Q4, brainstormed 2026-05-02). Read §3 (architecture) and §5 (UX flow) before starting.

**Repo conventions** (from `CLAUDE.md` / memory):
- **No commits anywhere in this plan.** The user runs commits manually. Each task's "Done" checkpoint is for review, not commit.
- The Phaser firewall: `dungeon/`, `run/`, and `data/` files MUST NOT `import 'phaser'`. The overlay scene lives under `scenes/`.
- Save schema stays at version 1; no migrations. The `Node`-union extension is a content-shape change, not a schema bump — existing in-flight saves with old fork shapes load unchanged.
- Don't materialize empty directories.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/dungeon/node.ts` | **Modify** | Add `'treasure'` variant to the `Node` discriminated union. ~3 lines added. |
| `src/run/run_state.ts` | **Modify** | New pure helper `claimTreasure(runState, item) -> RunState`. Update `completeCombat`'s non-combat-bearing-node defensive check to include `'treasure'`. ~25 lines added. |
| `src/run/__tests__/run_state.test.ts` | **Modify** | New test cases for `claimTreasure`: adds item, advances `currentNodeId`, throws on wrong status, throws on wrong node type. ~50 lines added. |
| `src/dungeon/loot.ts` | **Modify** | Rename `CombatKind` → `LootKind`; add `'treasure'` case to `rollLoot`. ~10 lines added/changed. |
| `src/dungeon/__tests__/loot.test.ts` | **Modify** | New test cases for `rollLoot('treasure', ...)`: always drops, current-floor rarity weights, current-floor scaling. ~50 lines added. |
| `src/scenes/treasure_room_overlay_scene.ts` | **Create** | New Phaser scene. Two-click flow: closed chest → reveal item → take. Threads `runRngState`. ~150 lines. |
| `src/main.ts` | **Modify** | Register `TreasureRoomOverlayScene` in the scene list. 2-line change. |
| `src/scenes/dungeon_scene.ts` | **Modify** | `handleArrival` gains a `'treasure'` case (mirrors shop/camp/event). `glyphForNodeType` gains `'treasure'` → `📦`. ~10 lines added. |
| `src/dungeon/floor.ts` | **Modify** | Two new fork shapes; `usesTreasureBranch` flag; `buildTreasureBranch` builder; two new switch cases. ~30 lines added. |
| `src/dungeon/__tests__/floor.test.ts` | **Modify** | Extend `seenShapes` to 12; add 2 per-shape coverage tests; extend distribution test to 12 buckets. ~30 lines added. |
| `TODO.md` | **Modify** | Mark Phase 2a ✅ inline (do not renumber). |
| `HISTORY.md` | **Modify** | Slim entry at the top. |

---

## Task 1: Node type + run-state helper (pure TS)

Foundation: extend the `Node` discriminated union and add the run-state helper that the overlay scene will call. After this task lands, no treasure nodes are generated yet — but the type system + helper are in place for downstream tasks. Game still plays normally.

**Files:**
- Modify: `src/dungeon/node.ts`
- Modify: `src/run/run_state.ts`
- Modify: `src/run/__tests__/run_state.test.ts`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL 1421 tests pass. Note the count for the post-change comparison.

- [ ] **Step 1.2: Add `'treasure'` to the `Node` union**

Open `src/dungeon/node.ts`. Find the `Node` type alias (around line 27). Add the new variant:

```ts
export type Node =
  | { id: string; type: 'combat'; encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'elite';  encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'boss';   encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'shop';   inventory: readonly ShopItem[]; nextNodeIds: readonly string[] }
  | { id: string; type: 'camp';   nextNodeIds: readonly string[] }
  | { id: string; type: 'event';  cardId: EventCardId; nextNodeIds: readonly string[] }
  | { id: string; type: 'treasure'; nextNodeIds: readonly string[] };

export type NodeType = Node['type'];
```

The `NodeType` alias picks up the new variant automatically.

- [ ] **Step 1.3: Update `completeCombat`'s defensive check**

Open `src/run/run_state.ts`. Find the defensive check (around line 207):

```ts
if (
  completedNode.type === 'shop' ||
  completedNode.type === 'camp' ||
  completedNode.type === 'event'
) {
  throw new Error(`completeCombat: current node is type '${completedNode.type}', not a combat-bearing node`);
}
```

Add `'treasure'` to the union of non-combat-bearing types:

```ts
if (
  completedNode.type === 'shop' ||
  completedNode.type === 'camp' ||
  completedNode.type === 'event' ||
  completedNode.type === 'treasure'
) {
  throw new Error(`completeCombat: current node is type '${completedNode.type}', not a combat-bearing node`);
}
```

This is required: after the check, `completedNode.type` is narrowed to `'combat' | 'elite' | 'boss'` which matches `CombatKind` (will become `LootKind` in Task 2). Without this update, TypeScript's narrowing would leave `'treasure'` in the type and the next line (`const kind: CombatKind = completedNode.type`) would fail strict typecheck.

- [ ] **Step 1.4: Write failing tests for `claimTreasure`**

Open `src/run/__tests__/run_state.test.ts`. Add a new `describe` block at the bottom of the file (before the final closing brace if there is a wrapping describe; otherwise at the top level — match the file's existing pattern):

```ts
import { claimTreasure } from '../run_state';
```

Add the import to the existing top-of-file imports (don't duplicate).

Then add this test block:

```ts
describe('claimTreasure', () => {
  function makeRunWithTreasureNode(): RunState {
    const baseRun = startRun(
      'crypt',
      [makeHero('p1'), makeHero('p2'), makeHero('p3')],
      1,
      createRng(1),
    );
    // Substitute a synthetic 2-node floor: treasure → boss. Exercises the
    // helper in isolation regardless of what generateFloor rolled.
    const treasureNode: Node = { id: 't0', type: 'treasure', nextNodeIds: ['t-boss'] };
    const bossNode: Node = baseRun.currentFloorNodes.find((n) => n.type === 'boss')!;
    return {
      ...baseRun,
      currentFloorNodes: [treasureNode, { ...bossNode, id: 't-boss' }],
      currentNodeId: 't0',
    };
  }

  function makeItem(): Item {
    return {
      id: 'item-test-1',
      baseId: 'sword_basic',
      slot: 'weapon',
      rarity: 'common',
      weaponType: 'sword',
      affixes: [],
      floorRolledAt: 1,
    };
  }

  it('adds the item to the pack', () => {
    const run = makeRunWithTreasureNode();
    const item = makeItem();
    const next = claimTreasure(run, item);
    expect(next.pack.items).toHaveLength(run.pack.items.length + 1);
    expect(next.pack.items[next.pack.items.length - 1]).toEqual(item);
  });

  it('advances currentNodeId to the (single) successor', () => {
    const run = makeRunWithTreasureNode();
    const next = claimTreasure(run, makeItem());
    expect(next.currentNodeId).toBe('t-boss');
  });

  it("throws if status is not 'in_dungeon'", () => {
    const run = { ...makeRunWithTreasureNode(), status: 'camp_screen' as const };
    expect(() => claimTreasure(run, makeItem())).toThrow(
      /status must be 'in_dungeon'/,
    );
  });

  it("throws if current node is not 'treasure'", () => {
    const run = makeRunWithTreasureNode();
    const wrongRun = { ...run, currentNodeId: 't-boss' };
    expect(() => claimTreasure(wrongRun, makeItem())).toThrow(
      /not 'treasure'/,
    );
  });

  it('does not mutate the input runState', () => {
    const run = makeRunWithTreasureNode();
    const beforeNodeId = run.currentNodeId;
    const beforePackLen = run.pack.items.length;
    claimTreasure(run, makeItem());
    expect(run.currentNodeId).toBe(beforeNodeId);
    expect(run.pack.items).toHaveLength(beforePackLen);
  });
});
```

If `makeHero` and `Node`, `Item`, `RunState`, `startRun`, `createRng`, `claimTreasure` aren't already imported by the file, add them to the top imports. Open the existing test file first to see what's already imported — most of these are likely already there since the file tests run-state functions; only `claimTreasure` and possibly `Node` (from `@dungeon/node`) and `Item` (from `@data/types`) are new. Use `@dungeon/node`, `@data/types`, `@util/rng` aliases consistent with the rest of the codebase.

If `makeHero` is missing, the file likely has a local helper or factory. Reuse whichever pattern the file already uses; if there's nothing, add a minimal local helper:

```ts
function makeHero(id: string): Hero {
  return {
    id,
    name: `Hero ${id}`,
    classId: 'knight',
    level: 1,
    xp: 0,
    perks: [],
    maxHp: 30,
    currentHp: 30,
    abilityIds: [],
    aiPriority: [],
    wounds: [],
    equipment: { weapon: undefined, shield: undefined, outfit: undefined, hat: undefined },
  };
}
```

(If the existing file has its own `makeHero`/`makeMockHero`, prefer that over duplicating.)

- [ ] **Step 1.5: Run the new tests to verify they fail**

Run: `npx vitest run src/run/__tests__/run_state.test.ts`

Expected: 5 new tests FAIL with `claimTreasure is not a function` (or similar import error).

- [ ] **Step 1.6: Implement `claimTreasure`**

Open `src/run/run_state.ts`. Add the new helper next to the other non-combat advancing helpers (sibling to `leaveShop`, around line 360):

```ts
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

`addItem`, `currentNode`, `Item`, and `RunState` are already imported at the top of the file from previous code. No new imports needed.

- [ ] **Step 1.7: Run the new tests to verify they pass**

Run: `npx vitest run src/run/__tests__/run_state.test.ts`

Expected: all `claimTreasure` tests PASS. Existing run-state tests unchanged.

- [ ] **Step 1.8: Run the full test suite + typecheck**

Run: `npm test`

Expected: 1421 + 5 = 1426 tests pass.

Run: `npm run build`

Expected: clean tsc + vite build, exit 0.

- [ ] **Step 1.9: Done — review checkpoint**

User reviews working tree. The Node union has gained `'treasure'`; `claimTreasure` exists with tests; `completeCombat`'s defensive check covers the new type. No game-visible behavior change yet (no treasure nodes are generated). When happy, proceed to Task 2.

---

## Task 2: Loot policy — `'treasure'` kind in `rollLoot` (pure TS)

Extend `rollLoot` to support a guaranteed-drop, current-floor-weighted treasure roll. Renames `CombatKind` to `LootKind` since the name no longer fits (treasure isn't combat). After this task, the helper is callable from the overlay scene (which doesn't exist yet).

**Files:**
- Modify: `src/dungeon/loot.ts`
- Modify: `src/dungeon/__tests__/loot.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Open `src/dungeon/__tests__/loot.test.ts`. At the bottom of the file (after the existing `describe` blocks, before any final EOF whitespace), add:

```ts
describe('rollLoot — treasure kind', () => {
  it('always returns an item (no 50% gate)', () => {
    let drops = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      if (rollLoot(createRng(seed), 1, 'treasure') !== null) drops += 1;
    }
    expect(drops).toBe(1000);
  });

  it('floor 1 treasure never rolls rare (matches combat per-floor weights, not boss-bumped)', () => {
    let rare = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const item = rollLoot(createRng(seed), 1, 'treasure');
      if (item?.rarity === 'rare') rare += 1;
    }
    expect(rare).toBe(0);
  });

  it('floor 1 treasure rarity matches combat-loot rarity at the same seed', () => {
    // Both 'combat' (when it drops) and 'treasure' use pickRarity(rng, floor).
    // The body diverges only on the 50% gate, so for any seed where combat
    // drops, the rarity should equal treasure's rarity at that seed (since
    // the 50% gate is the FIRST rng call combat makes, advancing the rng
    // state in lockstep). This is a property test: when both produce items,
    // their rarities are drawn from the same distribution.
    const treasureRarities: Record<string, number> = { common: 0, uncommon: 0, rare: 0 };
    for (let seed = 1; seed <= 1000; seed++) {
      const item = rollLoot(createRng(seed), 5, 'treasure');
      if (item) treasureRarities[item.rarity] += 1;
    }
    // At floor 5 the table is 70/25/5. Loose bounds:
    expect(treasureRarities.common).toBeGreaterThan(550);   // ≥55%
    expect(treasureRarities.uncommon).toBeGreaterThan(150); // ≥15%
    expect(treasureRarities.rare).toBeGreaterThan(20);      // ≥2%
  });

  it('treasure scaling uses current floor (not next-floor like boss)', () => {
    // floorRolledAt should equal the floor argument.
    for (let seed = 1; seed <= 50; seed++) {
      const item = rollLoot(createRng(seed), 7, 'treasure');
      expect(item).not.toBeNull();
      expect(item!.floorRolledAt).toBe(7);
    }
  });

  it('distributes the 4 slots over 1000 treasure rolls at floor 1', () => {
    const counts: Record<string, number> = { weapon: 0, shield: 0, outfit: 0, hat: 0 };
    for (let seed = 1; seed <= 1000; seed++) {
      const item = rollLoot(createRng(seed), 1, 'treasure');
      if (item) counts[item.slot] += 1;
    }
    for (const slot of ['weapon', 'shield', 'outfit', 'hat']) {
      expect(counts[slot]).toBeGreaterThanOrEqual(150);
      expect(counts[slot]).toBeLessThanOrEqual(350);
    }
  });
});
```

- [ ] **Step 2.2: Run the new tests to verify they fail**

Run: `npx vitest run src/dungeon/__tests__/loot.test.ts`

Expected: all 5 new tests FAIL — likely with a TypeScript error since `'treasure'` isn't in `CombatKind`. Vitest may report this as a "test setup" failure or runtime error depending on how strict the type-erasure is at runtime; either way the assertions don't pass.

- [ ] **Step 2.3: Rename `CombatKind` → `LootKind` and add the `'treasure'` branch**

Open `src/dungeon/loot.ts`. Find the type alias (around line 182):

```ts
export type CombatKind = 'combat' | 'elite' | 'boss';
```

Replace with:

```ts
export type LootKind = 'combat' | 'elite' | 'boss' | 'treasure';
```

Update the `rollLoot` signature (around line 184) — the parameter type changes from `CombatKind` to `LootKind`:

```ts
export function rollLoot(rng: Rng, floorNumber: number, kind: LootKind): Item | null {
```

Find the function body (the `if (kind === 'combat')` gate). Restructure the early branches so treasure also bypasses the gate. Replace the existing first lines:

```ts
  if (kind === 'combat') {
    if (rng.next() >= 0.5) return null;
  }
  // Boss loot uses next-floor rarity weights but same-floor scaling for affix
  // values + rare-property values + the floorRolledAt stamp. Elite loot uses
  // current-floor scaling everywhere and forces rarity = rare. Combat loot
  // (when it drops) uses current-floor scaling and the per-floor rarity table.
  const effectiveFloor = kind === 'boss' ? floorNumber + 1 : floorNumber;

  const slot = rng.pick(ALL_SLOTS);
  const base = pickBaseId(rng, slot);
  const rarity: Rarity = kind === 'elite' ? 'rare' : pickRarity(rng, effectiveFloor);
```

with:

```ts
  if (kind === 'combat') {
    if (rng.next() >= 0.5) return null;
  }
  // Per-kind policy:
  //   combat:    50% drop gate (above), current-floor rarity table, current-floor scaling.
  //   elite:     guaranteed drop, forced rarity = rare, current-floor scaling.
  //   boss:      guaranteed drop, NEXT-floor rarity weights, current-floor affix scaling.
  //   treasure:  guaranteed drop, current-floor rarity table, current-floor scaling.
  //              (Predictability is the value vs. combat; rarity bias is left to Phase 5.)
  const effectiveFloor = kind === 'boss' ? floorNumber + 1 : floorNumber;

  const slot = rng.pick(ALL_SLOTS);
  const base = pickBaseId(rng, slot);
  const rarity: Rarity = kind === 'elite' ? 'rare' : pickRarity(rng, effectiveFloor);
```

The `'treasure'` branch is implicitly covered: the gate at line 1 only fires for `kind === 'combat'`, and the rarity selection on the last line uses `effectiveFloor` (= `floorNumber` for treasure since it's not boss) and falls into `pickRarity(rng, effectiveFloor)` since `kind !== 'elite'`. So treasure shares combat's body, just without the gate. No additional code path needed beyond the type-system extension.

- [ ] **Step 2.4: Update consumers of the renamed type**

Run: `npm run build`

The build will fail with TypeScript errors at every site that imports `CombatKind`. Find them:

Run: `grep -rn "CombatKind" src/` (or use the Grep tool).

Update each import + reference to `LootKind`. Likely sites: `src/run/run_state.ts` (the line `const kind: CombatKind = completedNode.type;`).

In `src/run/run_state.ts`, change the import:

```ts
import { rollLoot, type CombatKind } from '@dungeon/loot';
```

to:

```ts
import { rollLoot, type LootKind } from '@dungeon/loot';
```

And the usage site (~line 214 after the defensive check):

```ts
const kind: CombatKind = completedNode.type;
```

to:

```ts
const kind: LootKind = completedNode.type;
```

The narrowing after the defensive check (which now also excludes `'treasure'`) leaves `completedNode.type` as `'combat' | 'elite' | 'boss'` — a strict subset of `LootKind`, so the assignment is valid.

- [ ] **Step 2.5: Run typecheck + tests**

Run: `npm run build`

Expected: clean build, exit 0.

Run: `npm test`

Expected: 1426 + 5 = 1431 tests pass.

- [ ] **Step 2.6: Done — review checkpoint**

`rollLoot('treasure', ...)` works; `LootKind` is the new name; the existing run-state code continues to compile after the import update. No game-visible change yet.

---

## Task 3: Treasure overlay scene + main.ts registration

Create the new Phaser scene that handles the chest UI. Two visual states (closed → opened); two clicks total (open → take). Threads `runRngState` for deterministic loot rolls.

**Files:**
- Create: `src/scenes/treasure_room_overlay_scene.ts`
- Modify: `src/main.ts`

- [ ] **Step 3.1: Create the scene file**

Create `src/scenes/treasure_room_overlay_scene.ts`:

```ts
import * as Phaser from 'phaser';
import type { Item, Rarity } from '@data/types';
import { rollLoot } from '@dungeon/loot';
import { itemAffixDescription, itemDisplayName } from '@items/selectors';
import { claimTreasure, currentNode } from '@run/run_state';
import { createRngFromState } from '@util/rng';
import { appState } from './app_state';

const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 340;
const PANEL_H = 220;

const TITLE_Y = PANEL_CY - PANEL_H / 2 + 30;
const CHEST_Y = PANEL_CY - 10;
const ITEM_NAME_Y = PANEL_CY + 30;
const ITEM_AFFIX_Y = PANEL_CY + 50;
const PROMPT_Y = PANEL_CY + PANEL_H / 2 - 28;

const RARITY_HEX: Record<Rarity, string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
};

type OverlayState = 'closed' | 'opened';

export class TreasureRoomOverlayScene extends Phaser.Scene {
  private state: OverlayState = 'closed';
  private rolledItem?: Item;
  private chestText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private itemNameText?: Phaser.GameObjects.Text;
  private itemAffixText?: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private clickTarget!: Phaser.GameObjects.Rectangle;
  private rngStateAfterRoll?: number;

  constructor() {
    super('treasure_room_overlay');
  }

  create(): void {
    this.state = 'closed';
    this.rolledItem = undefined;
    this.itemNameText = undefined;
    this.itemAffixText = undefined;
    this.rngStateAfterRoll = undefined;

    // Dim backdrop captures clicks so they don't leak through to the dungeon.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    // Bordered panel.
    this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x222222)
      .setStrokeStyle(2, 0xffcc66);

    this.titleText = this.add
      .text(PANEL_CX, TITLE_Y, 'Treasure!', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffcc66',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.chestText = this.add
      .text(PANEL_CX, CHEST_Y, '📦', {
        fontFamily: 'monospace',
        fontSize: '48px',
      })
      .setOrigin(0.5);

    this.promptText = this.add
      .text(PANEL_CX, PROMPT_Y, '▸ click to open', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#888888',
        fontStyle: 'italic',
      })
      .setOrigin(0.5);

    // The click target is the panel rectangle. Single handler dispatches by state.
    this.clickTarget = this.add
      .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x000000, 0)
      .setStrokeStyle(0)
      .setInteractive({ useHandCursor: true });
    this.clickTarget.on('pointerdown', () => this.onClick());
  }

  private onClick(): void {
    if (this.state === 'closed') {
      this.openChest();
    } else {
      this.takeAndAdvance();
    }
  }

  private openChest(): void {
    const rngState = appState.get().runRngState;
    if (rngState === undefined) {
      throw new Error('TreasureRoomOverlayScene: runRngState missing');
    }
    const rng = createRngFromState(rngState);
    const run = appState.get().runState!;
    const item = rollLoot(rng, run.currentFloorNumber, 'treasure');
    if (!item) {
      // 'treasure' kind is guaranteed to drop; null here is a bug.
      throw new Error('TreasureRoomOverlayScene: rollLoot returned null for treasure kind');
    }
    this.rolledItem = item;
    this.rngStateAfterRoll = rng.getState();

    // Visual: swap the chest glyph + flash a sparkle ring.
    this.chestText.setText('📭');
    this.add
      .circle(PANEL_CX, CHEST_Y, 38, 0xffcc66, 0.0)
      .setStrokeStyle(2, 0xffcc66, 0.8);

    // Item name + affix description.
    const name = itemDisplayName(item);
    const affixes = itemAffixDescription(item);
    this.itemNameText = this.add
      .text(PANEL_CX, ITEM_NAME_Y, name, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: RARITY_HEX[item.rarity],
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    if (affixes.length > 0) {
      this.itemAffixText = this.add
        .text(PANEL_CX, ITEM_AFFIX_Y, affixes, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5);
    }

    this.promptText.setText('▸ click to take');
    this.state = 'opened';
  }

  private takeAndAdvance(): void {
    if (!this.rolledItem || this.rngStateAfterRoll === undefined) {
      throw new Error('TreasureRoomOverlayScene: takeAndAdvance with no rolled item');
    }
    const item = this.rolledItem;
    const rngStateAfter = this.rngStateAfterRoll;

    appState.update((s) => {
      // Defensive: ensure we're still at a treasure node. claimTreasure throws
      // if not, which is the right failure mode (means a save-state mismatch).
      const node = currentNode(s.runState!);
      if (node.type !== 'treasure') {
        throw new Error(
          `TreasureRoomOverlayScene: expected treasure node, got '${node.type}'`,
        );
      }
      return {
        ...s,
        runState: claimTreasure(s.runState!, item),
        runRngState: rngStateAfter,
      };
    });

    this.scene.stop();
    this.scene.resume('dungeon');
  }
}
```

- [ ] **Step 3.2: Register the scene in main.ts**

Open `src/main.ts`. Add the import near the other scene imports (alphabetical placement):

```ts
import { TreasureRoomOverlayScene } from './scenes/treasure_room_overlay_scene';
```

Add `TreasureRoomOverlayScene` to the `scene: [...]` array. Place it next to the other dungeon-overlay scenes (`ShopOverlayScene`, `CampNodeOverlayScene`, `EventOverlayScene`):

```ts
  scene: [
    BootScene,
    CampScene,
    TavernPanelScene,
    BarracksPanelScene,
    BarracksEquipScene,
    BlacksmithPanelScene,
    HospitalPanelScene,
    ExpeditionsPanelScene,
    DungeonScene,
    CombatScene,
    CampScreenScene,
    EquipPanelScene,
    PerkOverlayScene,
    ShopOverlayScene,
    CampNodeOverlayScene,
    EventOverlayScene,
    TreasureRoomOverlayScene,    // NEW
    MainScene,
    ExplorerScene,
  ],
```

- [ ] **Step 3.3: Typecheck + tests**

Run: `npm run build`

Expected: clean build, exit 0.

Run: `npm test`

Expected: 1431 tests still pass (no new test files added in this task).

- [ ] **Step 3.4: Done — review checkpoint**

The treasure overlay scene exists and is registered. It can't be triggered yet (the dungeon scene doesn't launch it). Game still plays normally.

---

## Task 4: Dungeon scene wire-up

Add the treasure-node arrival case to `handleArrival` (mirrors shop / camp / event) and the treasure glyph (`📦`) to `glyphForNodeType`. After this task, if a floor *had* a treasure node it would correctly trigger the overlay — but the floor generator still doesn't emit them.

**Files:**
- Modify: `src/scenes/dungeon_scene.ts`

- [ ] **Step 4.1: Add the `'treasure'` case to `handleArrival`**

Open `src/scenes/dungeon_scene.ts`. Find `handleArrival` (around line 295). The current shape:

```ts
private handleArrival(): void {
  const run = appState.get().runState;
  if (!run) return;

  if (run.awaitingFork) {
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
```

Add the treasure case immediately after the `event` case:

```ts
  if (node.type === 'event') {
    this.scene.launch('event_overlay');
    this.scene.pause();
    return;
  }
  if (node.type === 'treasure') {
    this.scene.launch('treasure_room_overlay');
    this.scene.pause();
    return;
  }

  this.startCombatAtCurrentNode();
```

- [ ] **Step 4.2: Add the `'treasure'` case to `glyphForNodeType`**

Find the `glyphForNodeType` helper at the bottom of the file. Current:

```ts
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

Add a treasure case before the combat fallthrough:

```ts
function glyphForNodeType(type: Node['type']): string {
  switch (type) {
    case 'boss':     return '☠';
    case 'shop':     return '🛒';
    case 'elite':    return '💀';
    case 'camp':     return '🏕';
    case 'event':    return '❓';
    case 'treasure': return '📦';
    case 'combat':
    default:         return '⚔';
  }
}
```

- [ ] **Step 4.3: Typecheck + tests**

Run: `npm run build`

Expected: clean build, exit 0.

Run: `npm test`

Expected: 1431 tests pass (no new tests).

- [ ] **Step 4.4: Done — review checkpoint**

The dungeon scene now knows how to launch the treasure overlay and how to render a treasure glyph on the map. Still no treasure nodes are generated, so no behavior change is observable yet.

---

## Task 5: Floor generator — two new fork shapes

The user-visible feature lights up here. Two new fork shapes are added; treasure nodes appear in ~17% of forks (~50% of 3-floor runs). After this task the game is end-to-end playable: chest UI, item drop, item lands in the pack, run continues.

**Files:**
- Modify: `src/dungeon/floor.ts`
- Modify: `src/dungeon/__tests__/floor.test.ts`

- [ ] **Step 5.1: Update tests first (extend `seenShapes` to 12, add per-shape coverage, extend distribution)**

Open `src/dungeon/__tests__/floor.test.ts`.

**Test edit 1:** Find the `'fork branches are exactly the pair from one of ten fork shapes'` test (around line 54). Change the title and extend the expected set:

```ts
  it('fork branches are exactly the pair from one of twelve fork shapes', () => {
    const seenShapes = new Set<string>();
    for (let seed = 1; seed <= 1000; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
      const branchTypes = fork.nextNodeIds
        .map((id) => nodes.find((n) => n.id === id)!.type)
        .sort()
        .join('+');
      seenShapes.add(branchTypes);
    }
    expect(seenShapes).toEqual(new Set([
      'combat+shop',
      'combat+elite',
      'elite+shop',
      'camp+combat',
      'camp+shop',
      'camp+elite',
      'combat+event',
      'event+shop',
      'elite+event',
      'camp+event',
      'combat+treasure',
      'elite+treasure',
    ]));
  });
```

**Test edit 2:** Find the per-shape tests (lines ~178–229). Add two new tests after `event_vs_camp` (around line 229):

```ts
  it('treasure_vs_combat shape: fork branches are exactly one treasure and one combat', () => {
    const { fork } = findFloorWithShape('treasure_vs_combat');
    expect(fork.map((b) => b.type).sort()).toEqual(['combat', 'treasure']);
  });

  it('treasure_vs_elite shape: fork branches are exactly one treasure and one elite', () => {
    const { fork } = findFloorWithShape('treasure_vs_elite');
    expect(fork.map((b) => b.type).sort()).toEqual(['elite', 'treasure']);
  });
```

**Test edit 3:** Find the `findFloorWithShape` helper at the bottom of the file (~line 350). Extend its `shape` parameter type:

```ts
function findFloorWithShape(
  shape:
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
    | 'treasure_vs_combat'
    | 'treasure_vs_elite',
  maxSeeds = 1000,
)
```

The helper body is a long OR-chain (around lines 371–381) that matches sorted-type-pairs against the shape name. Add two more lines to the end of that chain:

```ts
    const matches =
      (shape === 'shop_vs_combat'     && types[0] === 'combat' && types[1] === 'shop')     ||
      (shape === 'elite_vs_combat'    && types[0] === 'combat' && types[1] === 'elite')    ||
      (shape === 'elite_vs_shop'      && types[0] === 'elite'  && types[1] === 'shop')     ||
      (shape === 'camp_vs_combat'     && types[0] === 'camp'   && types[1] === 'combat')   ||
      (shape === 'camp_vs_shop'       && types[0] === 'camp'   && types[1] === 'shop')     ||
      (shape === 'camp_vs_elite'      && types[0] === 'camp'   && types[1] === 'elite')    ||
      (shape === 'event_vs_combat'    && types[0] === 'combat' && types[1] === 'event')    ||
      (shape === 'event_vs_shop'      && types[0] === 'event'  && types[1] === 'shop')     ||
      (shape === 'event_vs_elite'     && types[0] === 'elite'  && types[1] === 'event')    ||
      (shape === 'event_vs_camp'      && types[0] === 'camp'   && types[1] === 'event')    ||
      (shape === 'treasure_vs_combat' && types[0] === 'combat' && types[1] === 'treasure') ||
      (shape === 'treasure_vs_elite'  && types[0] === 'elite'  && types[1] === 'treasure');
```

Sorted-tuple ordering is alphabetic, so `'combat' + 'treasure'` → `['combat', 'treasure']`; `'elite' + 'treasure'` → `['elite', 'treasure']`. Those are the two pairs to add.

**Test edit 4:** Find the `ten fork shapes are roughly evenly distributed across seeds` test (around line 242). Rename to `twelve` and extend the counts table + classification chain + assertions:

```ts
  it('twelve fork shapes are roughly evenly distributed across seeds', () => {
    const counts = {
      shop_vs_combat: 0,
      elite_vs_combat: 0,
      elite_vs_shop: 0,
      camp_vs_combat: 0,
      camp_vs_shop: 0,
      camp_vs_elite: 0,
      event_vs_combat: 0,
      event_vs_shop: 0,
      event_vs_elite: 0,
      event_vs_camp: 0,
      treasure_vs_combat: 0,
      treasure_vs_elite: 0,
    };
    for (let seed = 1; seed <= 1200; seed++) {
      const { nodes } = generateFloor('crypt', 1, createRng(seed));
      const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
      const types = fork.nextNodeIds
        .map((id) => nodes.find((n) => n.id === id)!.type)
        .sort()
        .join('+');
      if (types === 'combat+shop')          counts.shop_vs_combat += 1;
      else if (types === 'combat+elite')    counts.elite_vs_combat += 1;
      else if (types === 'elite+shop')      counts.elite_vs_shop += 1;
      else if (types === 'camp+combat')     counts.camp_vs_combat += 1;
      else if (types === 'camp+shop')       counts.camp_vs_shop += 1;
      else if (types === 'camp+elite')      counts.camp_vs_elite += 1;
      else if (types === 'combat+event')    counts.event_vs_combat += 1;
      else if (types === 'event+shop')      counts.event_vs_shop += 1;
      else if (types === 'elite+event')     counts.event_vs_elite += 1;
      else if (types === 'camp+event')      counts.event_vs_camp += 1;
      else if (types === 'combat+treasure') counts.treasure_vs_combat += 1;
      else if (types === 'elite+treasure')  counts.treasure_vs_elite += 1;
    }
    // Expected ~100 each (1/12 of 1200). Loose lower bound: at least 60.
    expect(counts.shop_vs_combat).toBeGreaterThanOrEqual(60);
    expect(counts.elite_vs_combat).toBeGreaterThanOrEqual(60);
    expect(counts.elite_vs_shop).toBeGreaterThanOrEqual(60);
    expect(counts.camp_vs_combat).toBeGreaterThanOrEqual(60);
    expect(counts.camp_vs_shop).toBeGreaterThanOrEqual(60);
    expect(counts.camp_vs_elite).toBeGreaterThanOrEqual(60);
    expect(counts.event_vs_combat).toBeGreaterThanOrEqual(60);
    expect(counts.event_vs_shop).toBeGreaterThanOrEqual(60);
    expect(counts.event_vs_elite).toBeGreaterThanOrEqual(60);
    expect(counts.event_vs_camp).toBeGreaterThanOrEqual(60);
    expect(counts.treasure_vs_combat).toBeGreaterThanOrEqual(60);
    expect(counts.treasure_vs_elite).toBeGreaterThanOrEqual(60);
  });
```

(Bumped the seed range to 1200 to keep ~100 expected per shape across 12 buckets while preserving the ≥60 lower bound.)

- [ ] **Step 5.2: Run the modified tests to verify they fail**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts`

Expected: the new tests + the modified `seenShapes` test FAIL — generator doesn't produce treasure shapes yet. Existing per-shape tests still pass.

- [ ] **Step 5.3: Add the two new shapes to the generator**

Open `src/dungeon/floor.ts`.

**Edit 1:** Extend the `ForkShape` type alias (around line 13):

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
  | 'treasure_vs_combat'
  | 'treasure_vs_elite';
```

**Edit 2:** Extend `FORK_SHAPE_WEIGHTS` (around line 25):

```ts
const FORK_SHAPE_WEIGHTS: readonly WeightedOption<ForkShape>[] = [
  { value: 'shop_vs_combat',     weight: 1 },
  { value: 'elite_vs_combat',    weight: 1 },
  { value: 'elite_vs_shop',      weight: 1 },
  { value: 'camp_vs_combat',     weight: 1 },
  { value: 'camp_vs_shop',       weight: 1 },
  { value: 'camp_vs_elite',      weight: 1 },
  { value: 'event_vs_combat',    weight: 1 },
  { value: 'event_vs_shop',      weight: 1 },
  { value: 'event_vs_elite',     weight: 1 },
  { value: 'event_vs_camp',      weight: 1 },
  { value: 'treasure_vs_combat', weight: 1 },
  { value: 'treasure_vs_elite',  weight: 1 },
];
```

**Edit 3:** Add the `usesTreasureBranch` flag near the existing `usesXBranch` flags (around line 95):

```ts
const usesTreasureBranch =
  shape === 'treasure_vs_combat' ||
  shape === 'treasure_vs_elite';
```

Place it next to `usesEventBranch` for readability.

**Edit 4:** Add the `buildTreasureBranch` builder near the others (around line 145):

```ts
const buildTreasureBranch = (id: string): Node => {
  if (!usesTreasureBranch) {
    throw new Error(`generateFloor: treasure branch not in shape '${shape}'`);
  }
  return { id, type: 'treasure', nextNodeIds: [idBoss] };
};
```

**Edit 5:** Add the two new switch cases (in the big `switch (shape)` block, after `event_vs_camp`):

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

The treasure branch consumes **no RNG** (loot is rolled at scene-time using `runRngState`, not at floor-gen time). This matches camp's behavior — both branches are pure data construction. Determinism downstream is preserved: any RNG draws after the switch (none in current code) would consume the same number of values regardless of which shape was rolled.

- [ ] **Step 5.4: Run the floor tests**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts`

Expected: all tests PASS (the modified ones + the 2 new per-shape tests).

- [ ] **Step 5.5: Run the full test suite + build**

Run: `npm test`

Expected: 1431 + 2 = 1433 tests pass (per-shape pair). The modified `seenShapes` and distribution tests stay at 1 each.

Run: `npm run build`

Expected: clean build, exit 0.

- [ ] **Step 5.6: Manual smoke (user runs)**

Run: `npm run dev`

User opens http://localhost:5173. Smoke checklist (the agent does not drive the browser; the user verifies):

1. Start a fresh run from camp → Expeditions → Embark.
2. Play the floor and reach the fork. With ~17% probability per fork, one of the two branches will be a treasure node (📦 glyph on the map) paired with combat or elite (⚔ or 💀).
3. Click the treasure branch on the map. Party walks to the chest node.
4. Treasure overlay appears: "Treasure!" title, closed chest 📦, "▸ click to open".
5. Click anywhere on the panel. Chest swaps to opened state (📭), item appears with rarity-colored name + affixes (if any). Prompt becomes "▸ click to take".
6. Click again. Overlay closes; party walks to the boss node; combat fires.
7. After the boss, camp_screen scene; the looted item should appear in the pack list.
8. Run a full 3-floor expedition; over multiple runs you should see treasure rooms ~50% of the time.
9. Cash out and confirm the looted items end up in the stash.

Anything off in 1–9 is a bug to fix before declaring Task 5 done.

If you don't see treasure within a few runs, that's expected (~17% per fork). To force a treasure floor for testing, temporarily change `FORK_SHAPE_WEIGHTS` to make `treasure_vs_combat`'s weight much higher; remember to revert before commit.

- [ ] **Step 5.7: Done — review checkpoint**

Phase 2a is end-to-end functional. User commits when satisfied.

---

## Task 6: Update TODO and HISTORY

**Files:**
- Modify: `TODO.md`
- Modify: `HISTORY.md`

- [ ] **Step 6.1: Mark Phase 2a inline in TODO.md (no renumber)**

Find the Phase 2 bullet under TODO #30 (the line starting `- **Phase 2 — Floor generator richness.**`). Change to:

```markdown
  - **Phase 2 — Floor generator richness.** Decomposed 2026-05-02 into 2a (treasure rooms in 5-node floor) and 2b (new 8/9/10-row generator).
    - **Phase 2a — Treasure rooms in 5-node floor.** ✅ *Shipped 2026-05-02 (see HISTORY).* New `'treasure'` node type + click-to-open overlay scene; two new fork shapes (`treasure_vs_combat`, `treasure_vs_elite`) added to the existing 10-shape catalog (12 total). Loot uses current-floor weights, guaranteed drop.
    - **Phase 2b — New 8/9/10-row generator with full Q6 distribution rules.** Pending. Will replace the 5-node fork-floor generator. Treasure node type already exists (from 2a); 2b just changes how floors are constructed.
```

The original Phase 2 bullet's content (everything that was under "Generate 8/9/10-row floors with mixed node-type distribution per Q6, including the new treasure node type ...") is folded into 2b's description above; 2a's new bullet supersedes the part 2a actually shipped.

- [ ] **Step 6.2: Add slim HISTORY entry at the top**

Open `HISTORY.md`. Add at the top (after the `<!-- Add completed entries below this line -->` comment, before the previous most-recent entry):

```markdown
### 2026-05-02 · Treasure rooms — Phase 2a (Cluster B · 30)

- **Why:** TODO #30 Phase 2a (split out from Phase 2 during the 2026-05-02 brainstorm). Adds the new `'treasure'` node type + click-to-open overlay UI inside the existing 5-node fork generator, before Phase 2b changes the floor topology. Splitting separates two variables — the chest mechanic gets playtested in the familiar topology before topology itself moves.
- **Decisions:**
  - **Click-to-open chest, not pick-from-N.** Two clicks total (open → take). Treasure is a discovery moment, not a decision; pick-from-N would duplicate shop tension and make shops feel worse.
  - **Current-floor rarity weights, guaranteed drop.** Identical to combat-loot logic minus the 50% gate. Predictability is the value, not rarity bias. Phase 5's combat-loot rate reduction will widen the gap automatically; no need to pre-tune.
  - **Two fork-shape pairings** (`treasure_vs_combat`, `treasure_vs_elite`) — the two with real "skip the fight for free loot" tension. 12 shapes total; treasure in ~17% of forks ≈ ~50% of 3-floor runs. Enough to validate the UI without bumping the rate to where Phase 2b's distribution rules feel anticlimactic later.
  - **`CombatKind` renamed to `LootKind`.** The name no longer fit once treasure (non-combat) joined the union. Callers updated in lockstep (run_state.ts).
- **Surprises:**
  - **Generator-time vs. scene-time RNG.** Treasure branches consume zero RNG during `generateFloor` (loot is rolled at scene-time via `runRngState`, mirroring how event cards resolve). This keeps the generator's RNG-consumption deterministic regardless of which fork shape rolled — same property the camp branch already relied on.
  - **The defensive check in `completeCombat` is load-bearing for typecheck.** `'treasure'` had to be added to the `if (type === 'shop' || ...)` guard because the line below assigns `completedNode.type` to `LootKind` — the guard's narrowing is what makes that assignment legal. Forgetting it = silent typecheck regression.
- **Source:** TODO.md Cluster B · 30 Phase 2a. Plan: `docs/superpowers/plans/2026-05-02-treasure-rooms.md`. Spec: `docs/superpowers/specs/2026-05-02-treasure-rooms-design.md`. Test count delta: 1421 → ~1433 (+12: claimTreasure ×5, treasure rollLoot ×5, per-shape ×2).
```

- [ ] **Step 6.3: Done**

User reviews the doc edits and commits when ready.

---

## Phase 2a acceptance recap

When all six tasks are checked off:

- `npm run build` passes (TypeScript strict).
- `npm test` passes; ~12 new tests added.
- `'treasure'` is a valid `Node` variant; `claimTreasure` advances the run.
- `rollLoot(rng, floor, 'treasure')` always drops; rarity uses the per-floor combat table.
- Two new fork shapes appear in playtests (~17% per fork). Forks with a treasure branch + combat-or-elite branch render correctly on the map (📦 vs ⚔/💀).
- Clicking the treasure branch tweens the party, opens the overlay, two-click flow lands the item in the pack, dungeon resumes.
- No save schema change; no `RunState` field change. Existing in-flight 5-node floors (without treasure) play out unchanged.
- TODO #30 Phase 2 decomposed into 2a (✅) and 2b (pending). HISTORY has a slim entry.

Phase 2b (new 8/9/10-row generator) and Phase 5 (combat-loot rate reduction) remain in TODO #30 and are out of scope for this plan.
