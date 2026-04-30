# Event Floor Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `'event'` to the `Node` discriminated union; extend the fork-shape RNG to 10 shapes (4 new event pairings); have `floor.ts` draw a card from `EVENTS` at gen-time and stamp `cardId` into the event node. Wire scene-side stubs (auto-skip on arrival, defensive guard, icon glyph) so events surface in the icon row but don't engage until Cluster B · 5 ships the overlay.

**Architecture:** Two sequential tasks.

1. Type + scene preparation. Extend `Node` union, add scene-side handlers (combat_scene guard, dungeon_scene icon + auto-skip stub). Type-system updates and dead code paths until Task 2 produces event nodes — but tsc and tests stay green throughout.
2. Floor.ts 10-shape RNG + extended floor tests. Event nodes now appear in the wild; the scene stubs from Task 1 catch them.

**Tech Stack:** TypeScript, Vitest, Phaser 3.

**Spec:** `docs/superpowers/specs/2026-04-29-event-floor-integration-design.md`. Read before starting.

---

## Task 1: Node union extension + scene preparation

Type changes + scene-side stubs that handle event nodes but don't fire until Task 2 produces them.

**Files:**
- Modify: `src/dungeon/node.ts`
- Modify: `src/scenes/combat_scene.ts`
- Modify: `src/scenes/dungeon_scene.ts`

- [ ] **Step 1.1: Extend the `Node` union with `'event'` variant**

Open `src/dungeon/node.ts`. Find the `Node` union (around line 26). Add `EventCardId` import alongside the existing imports:

```ts
import type { ModifierId } from '../data/modifiers';
import type { EnemyId, Item, SlotIndex } from '../data/types';
import type { EventCardId } from '../data/events';
```

Add the `'event'` variant to the union:

```ts
export type Node =
  | { id: string; type: 'combat'; encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'elite';  encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'boss';   encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'shop';   inventory: readonly ShopItem[]; nextNodeIds: readonly string[] }
  | { id: string; type: 'camp';   nextNodeIds: readonly string[] }
  | { id: string; type: 'event';  cardId: EventCardId; nextNodeIds: readonly string[] };
```

- [ ] **Step 1.2: Run tsc to find consumers needing updates**

Run: `npx tsc --noEmit`

Expected: errors at the call sites that pattern-match on `node.type` and don't handle `'event'`. The most likely:
- `src/scenes/combat_scene.ts` — the existing `'shop' || 'camp'` guard narrows the union; `node.encounter` access after the guard would fail tsc since `event` lacks `encounter`.
- `src/scenes/dungeon_scene.ts` — the `'boss' / 'shop' / 'elite' / 'camp'` glyph chain falls through to `'⚔'` for any unhandled type, so no type error there. The `if (node.type === 'shop')` shop-overlay branch in `handleArrival` falls through to `startCombatAtCurrentNode()`, which would try to access `node.encounter` and fail tsc.

Fix both in subsequent steps.

- [ ] **Step 1.3: Update combat_scene defensive guard**

Open `src/scenes/combat_scene.ts`. Find the existing guard (around line 59):

```ts
if (node.type === 'shop' || node.type === 'camp') {
  console.warn(`CombatScene entered with non-combat node type '${node.type}'; returning to dungeon`);
  this.scene.start('dungeon');
  return;
}
```

Replace with:

```ts
if (node.type === 'shop' || node.type === 'camp' || node.type === 'event') {
  console.warn(`CombatScene entered with non-combat node type '${node.type}'; returning to dungeon`);
  this.scene.start('dungeon');
  return;
}
```

- [ ] **Step 1.4: Add the event icon glyph in dungeon_scene**

Open `src/scenes/dungeon_scene.ts`. Find the glyph chain in `buildNodes` (around line 156):

```ts
const glyph =
  node.type === 'boss'  ? '☠' :
  node.type === 'shop'  ? '🛒' :
  node.type === 'elite' ? '💀' :
  node.type === 'camp'  ? '🏕' :
  '⚔';
```

Replace with:

```ts
const glyph =
  node.type === 'boss'  ? '☠' :
  node.type === 'shop'  ? '🛒' :
  node.type === 'elite' ? '💀' :
  node.type === 'camp'  ? '🏕' :
  node.type === 'event' ? '❓' :
  '⚔';
```

- [ ] **Step 1.5: Add the event auto-skip stub in dungeon_scene `handleArrival`**

In the same file, find `handleArrival` (around line 232). Locate the `'shop'` and `'camp'` branches; insert an event branch alongside them. After the `'camp'` branch (which ends with `return;`):

```ts
if (node.type === 'event') {
  // Stub: auto-skip until Cluster B · 5 ships the event overlay.
  // Player sees event nodes in the icon row but doesn't engage with them.
  // Equivalent to a "Decline" choice — no payload applied.
  appState.update((s) => ({
    ...s,
    runState: chooseNextNode(s.runState!, node.nextNodeIds[0]),
  }));
  this.refreshHud();
  this.refreshNodeColors();
  this.refreshStatusBar();
  this.setState('walking_to_next');
  return;
}
```

`chooseNextNode` is already imported in `dungeon_scene.ts` (used by the fork picker). No import change needed.

- [ ] **Step 1.6: Run tsc and tests**

Run: `npx tsc --noEmit && npm test`

Expected: PASS / green. tsc reports no errors (all consumers handle the new `'event'` variant). Test count unchanged from baseline — no event nodes exist in the wild yet, so the new code paths are dead.

- [ ] **Step 1.7: Commit**

```bash
git add src/dungeon/node.ts src/scenes/combat_scene.ts src/scenes/dungeon_scene.ts
git commit -m "feat(dungeon): add 'event' Node variant + scene stubs (icon, auto-skip, guard)"
```

---

## Task 2: Floor.ts 10-shape RNG + tests

Floor generation now picks from 10 fork shapes instead of 6, drawing an event card when an event branch is required. Existing tests update for the 10-shape distribution; 4 new shape-coverage tests verify each event pairing.

**Files:**
- Modify: `src/dungeon/floor.ts`
- Modify: `src/dungeon/__tests__/floor.test.ts`

- [ ] **Step 2.1: Write failing tests for the new shapes**

Open `src/dungeon/__tests__/floor.test.ts`. Update the `findFloorWithShape` helper (around line 301) to accept the 4 new shape names and add their match cases:

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
    | 'event_vs_camp',
  maxSeeds = 1000,
): { nodes: ReturnType<typeof generateFloor>['nodes']; fork: { type: string }[] } {
  for (let seed = 1; seed <= maxSeeds; seed++) {
    const { nodes } = generateFloor('crypt', 1, createRng(seed));
    const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
    const branches = fork.nextNodeIds
      .map((id) => nodes.find((n) => n.id === id)!)
      .map((n) => ({ type: n.type }));
    const types = branches.map((b) => b.type).sort();
    const matches =
      (shape === 'shop_vs_combat'  && types[0] === 'combat' && types[1] === 'shop')  ||
      (shape === 'elite_vs_combat' && types[0] === 'combat' && types[1] === 'elite') ||
      (shape === 'elite_vs_shop'   && types[0] === 'elite'  && types[1] === 'shop')  ||
      (shape === 'camp_vs_combat'  && types[0] === 'camp'   && types[1] === 'combat') ||
      (shape === 'camp_vs_shop'    && types[0] === 'camp'   && types[1] === 'shop')   ||
      (shape === 'camp_vs_elite'   && types[0] === 'camp'   && types[1] === 'elite')  ||
      (shape === 'event_vs_combat' && types[0] === 'combat' && types[1] === 'event')  ||
      (shape === 'event_vs_shop'   && types[0] === 'event'  && types[1] === 'shop')   ||
      (shape === 'event_vs_elite'  && types[0] === 'elite'  && types[1] === 'event')  ||
      (shape === 'event_vs_camp'   && types[0] === 'camp'   && types[1] === 'event');
    if (matches) return { nodes, fork: branches };
  }
  throw new Error(`no '${shape}' floor in first ${maxSeeds} seeds`);
}
```

(`maxSeeds` increased from 600 to 1000 to accommodate the rarer-per-shape distribution.)

Update the existing six-shape distribution test (around line 205) — replace the entire `it('six fork shapes are roughly evenly distributed across seeds', ...)` block with the ten-shape version:

```ts
it('ten fork shapes are roughly evenly distributed across seeds', () => {
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
  };
  for (let seed = 1; seed <= 1000; seed++) {
    const { nodes } = generateFloor('crypt', 1, createRng(seed));
    const fork = nodes.find((n) => n.nextNodeIds.length === 2)!;
    const types = fork.nextNodeIds
      .map((id) => nodes.find((n) => n.id === id)!.type)
      .sort()
      .join('+');
    if (types === 'combat+shop')        counts.shop_vs_combat += 1;
    else if (types === 'combat+elite')  counts.elite_vs_combat += 1;
    else if (types === 'elite+shop')    counts.elite_vs_shop += 1;
    else if (types === 'camp+combat')   counts.camp_vs_combat += 1;
    else if (types === 'camp+shop')     counts.camp_vs_shop += 1;
    else if (types === 'camp+elite')    counts.camp_vs_elite += 1;
    else if (types === 'combat+event')  counts.event_vs_combat += 1;
    else if (types === 'event+shop')    counts.event_vs_shop += 1;
    else if (types === 'elite+event')   counts.event_vs_elite += 1;
    else if (types === 'camp+event')    counts.event_vs_camp += 1;
  }
  // Expected ~100 each (1/10 of 1000). Loose lower bound: at least 60.
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
});
```

Update the existing six-shape `Set` test (around line 53) — replace the `it('fork branches are exactly the pair from one of six fork shapes', ...)` block with the ten-shape version:

```ts
it('fork branches are exactly the pair from one of ten fork shapes', () => {
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
  ]));
});
```

Add 4 new per-shape coverage tests after the existing `camp_vs_elite shape: ...` test (around line 203):

```ts
it('event_vs_combat shape: fork branches are exactly one event and one combat', () => {
  const { fork } = findFloorWithShape('event_vs_combat');
  expect(fork.map((b) => b.type).sort()).toEqual(['combat', 'event']);
});

it('event_vs_shop shape: fork branches are exactly one event and one shop', () => {
  const { fork } = findFloorWithShape('event_vs_shop');
  expect(fork.map((b) => b.type).sort()).toEqual(['event', 'shop']);
});

it('event_vs_elite shape: fork branches are exactly one event and one elite', () => {
  const { fork } = findFloorWithShape('event_vs_elite');
  expect(fork.map((b) => b.type).sort()).toEqual(['elite', 'event']);
});

it('event_vs_camp shape: fork branches are exactly one event and one camp', () => {
  const { fork } = findFloorWithShape('event_vs_camp');
  expect(fork.map((b) => b.type).sort()).toEqual(['camp', 'event']);
});
```

Add a "valid cardId" sanity test alongside the new shape tests:

```ts
it('event nodes carry a valid cardId from the EVENTS table', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const { nodes } = generateFloor('crypt', 1, createRng(seed));
    for (const node of nodes) {
      if (node.type !== 'event') continue;
      expect(EVENTS[node.cardId]).toBeDefined();
      expect(node.nextNodeIds).toHaveLength(1);
    }
  }
});
```

This requires importing `EVENTS` at the top of the test file:

```ts
import { EVENTS } from '../../data/events';
```

- [ ] **Step 2.2: Run tests and verify they fail**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts`

Expected: FAIL — the new shape names won't appear in `seenShapes`, distribution counts for event shapes are zero, `findFloorWithShape('event_vs_*')` throws because no event shapes are produced.

- [ ] **Step 2.3: Update `floor.ts` to the 10-shape RNG**

Open `src/dungeon/floor.ts`. Replace the `ForkShape` type and `FORK_SHAPE_WEIGHTS` (lines 11-26):

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
  | 'event_vs_camp';

const FORK_SHAPE_WEIGHTS: readonly WeightedOption<ForkShape>[] = [
  { value: 'shop_vs_combat',  weight: 1 },
  { value: 'elite_vs_combat', weight: 1 },
  { value: 'elite_vs_shop',   weight: 1 },
  { value: 'camp_vs_combat',  weight: 1 },
  { value: 'camp_vs_shop',    weight: 1 },
  { value: 'camp_vs_elite',   weight: 1 },
  { value: 'event_vs_combat', weight: 1 },
  { value: 'event_vs_shop',   weight: 1 },
  { value: 'event_vs_elite',  weight: 1 },
  { value: 'event_vs_camp',   weight: 1 },
];
```

Add the `EVENTS` and `drawEventCard` imports at the top of the file alongside the existing imports:

```ts
import { EVENTS } from '../data/events';
import { drawEventCard } from './event_deck';
```

- [ ] **Step 2.4: Add `usesEventBranch` flag and event card draw**

In `floor.ts`, find the existing `usesCampBranch` declaration (around line 73). Add a parallel `usesEventBranch`:

```ts
const usesCampBranch =
  shape === 'camp_vs_combat' ||
  shape === 'camp_vs_shop' ||
  shape === 'camp_vs_elite';
const usesEventBranch =
  shape === 'event_vs_combat' ||
  shape === 'event_vs_shop' ||
  shape === 'event_vs_elite' ||
  shape === 'event_vs_camp';
```

Find the existing `shopBranchInv` declaration (around line 91). Add the event card draw after it (and before the boss encounter generation):

```ts
const shopBranchInv = usesShopBranch ? generateShop(floorNumber, rng).inventory : undefined;

const eventBranchCardId = usesEventBranch
  ? drawEventCard(Object.values(EVENTS), dungeonId, rng).id
  : undefined;

const encBoss = composeBossEncounter(dungeon.bossId, dungeon.enemyPool, scale, rng);
```

- [ ] **Step 2.5: Add `buildEventBranch` builder + 4 new switch cases**

In `floor.ts`, find the `buildCampBranch` builder (around line 115). Add `buildEventBranch` after it:

```ts
const buildCampBranch = (id: string): Node => {
  if (!usesCampBranch) {
    throw new Error(`generateFloor: camp branch not in shape '${shape}'`);
  }
  return { id, type: 'camp', nextNodeIds: [idBoss] };
};
const buildEventBranch = (id: string): Node => {
  if (eventBranchCardId === undefined) {
    throw new Error(`generateFloor: eventBranchCardId undefined for shape '${shape}'`);
  }
  return { id, type: 'event', cardId: eventBranchCardId, nextNodeIds: [idBoss] };
};
```

Find the `switch (shape)` block (around line 124). Add 4 new cases after the existing `camp_vs_elite` case:

```ts
case 'camp_vs_elite':
  node2a = specialOnBranchA ? buildCampBranch(id2a)   : buildEliteBranch(id2a);
  node2b = specialOnBranchA ? buildEliteBranch(id2b)  : buildCampBranch(id2b);
  break;
case 'event_vs_combat':
  node2a = specialOnBranchA ? buildEventBranch(id2a)  : buildCombatBranch(id2a);
  node2b = specialOnBranchA ? buildCombatBranch(id2b) : buildEventBranch(id2b);
  break;
case 'event_vs_shop':
  node2a = specialOnBranchA ? buildEventBranch(id2a)  : buildShopBranch(id2a);
  node2b = specialOnBranchA ? buildShopBranch(id2b)   : buildEventBranch(id2b);
  break;
case 'event_vs_elite':
  node2a = specialOnBranchA ? buildEventBranch(id2a)  : buildEliteBranch(id2a);
  node2b = specialOnBranchA ? buildEliteBranch(id2b)  : buildEventBranch(id2b);
  break;
case 'event_vs_camp':
  node2a = specialOnBranchA ? buildEventBranch(id2a)  : buildCampBranch(id2a);
  node2b = specialOnBranchA ? buildCampBranch(id2b)   : buildEventBranch(id2b);
  break;
```

- [ ] **Step 2.6: Run the floor tests**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts`

Expected: PASS — all updated and new tests green.

- [ ] **Step 2.7: Run the full suite end-to-end**

Run: `npm test && npx tsc --noEmit && npm run build`

Expected: PASS / green. Total test count delta = +5 (4 new shape-coverage tests + 1 cardId sanity test).

- [ ] **Step 2.8: Smoke-check determinism**

Run: `npm test` again.

Expected: identical pass count, identical seed-bound test outputs.

- [ ] **Step 2.9: Commit**

```bash
git add src/dungeon/floor.ts src/dungeon/__tests__/floor.test.ts
git commit -m "feat(dungeon): 10-shape fork RNG with event branches"
```

---

## Closing checklist

- [ ] **Both tasks landed in 2 commits**, with green tests + tsc + build.
- [ ] **No `phaser` imports outside `src/scenes/`** (unchanged from baseline).
- [ ] **gdd.md** is the design source of truth (§4 lists `❓` as the event icon).
- [ ] **Manual play:** walk a run; ~40% of forks show ❓ (event). Walking onto an event node auto-skips to the boss with no payload applied.
- [ ] **Out-of-scope follow-ups:**
  - **Cluster B · 5 — Event card UI** is now unblocked. The auto-skip stub at `dungeon_scene.handleArrival` becomes a `scene.launch('event_overlay')` call once the overlay is built.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, this work can land in HISTORY as a Cluster A-style entry. No TODO entry to remove (this was a strategic precursor task added outside the TODO list).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commits, awaiting user direction per CLAUDE.md.

**Test count delta from baseline:** +5 (4 shape coverage + 1 cardId sanity).
