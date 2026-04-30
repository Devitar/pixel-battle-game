# Event floor integration — Design

- **TODO entry:** none (strategic precursor for Cluster B · 5).
- **Tier:** 2.
- **Date:** 2026-04-29.

## 1 · Scope

Add `'event'` to the `Node` discriminated union; extend the fork-shape RNG to include event branches; `floor.ts` draws a card from `EVENTS` at gen-time and stamps the `cardId` into the node. Wire scene-side stubs (auto-skip on arrival, defensive guard in combat_scene, icon glyph in dungeon_scene). Cluster B · 5 (Event card UI) replaces the auto-skip stub.

The data layer is fully shipped (Cluster A · 13: `applyEventChoice`, `EventCard`, `EventCardId`; Cluster A · 14: 20-card `EVENTS` deck; `drawEventCard` helper).

**Out of scope:**

- The Event card UI overlay — Cluster B · 5.
- Any change to deck content or `applyEventChoice` resolver.
- Event-specific scaling / difficulty stamping (events are static authored cards).

## 2 · `Node` union extension

In `src/dungeon/node.ts`:

```ts
import type { EventCardId } from '../data/events';

export type Node =
  | { id: string; type: 'combat'; encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'elite';  encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'boss';   encounter: Encounter; nextNodeIds: readonly string[] }
  | { id: string; type: 'shop';   inventory: readonly ShopItem[]; nextNodeIds: readonly string[] }
  | { id: string; type: 'camp';   nextNodeIds: readonly string[] }
  | { id: string; type: 'event';  cardId: EventCardId; nextNodeIds: readonly string[] };
```

Storing `cardId` (not the full card object) keeps `EVENTS` as the single source of truth — the UI does `EVENTS[node.cardId]` at render time.

## 3 · Floor RNG: 6 shapes → 10 shapes

`ForkShape` enum gains 4 new entries:

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
```

`FORK_SHAPE_WEIGHTS` extends to 10 entries with uniform weight 1.

**Distribution:**

- Each new shape appears with probability 1/10.
- Each branch type (combat / shop / elite / camp / event) appears in 4/10 = 40% of forks.
- Existing shapes drop from 1/6 (~16.7%) to 1/10 (10%) frequency. Pattern matches the rebalance we did when camp was added.

**`specialOnBranchA` rule for new shapes** — `true` → branch A is event:

| Shape | A=true | B (when A=true) |
|---|---|---|
| `event_vs_combat` | event | combat |
| `event_vs_shop`   | event | shop |
| `event_vs_elite`  | event | elite |
| `event_vs_camp`   | event | camp |

For shapes pairing two "distinguished" types (event_vs_elite, event_vs_camp), the rule is arbitrary but consistent — pinning event to A on `true` keeps test coverage simple.

## 4 · `floor.ts` — card draw + branch construction

### 4.1 · RNG-consumption order

Order of draws inside `generateFloor` after the change:

1. `shape` weighted-roll (now 10 outcomes).
2. `specialOnBranchA` boolean.
3. Preamble n0 + modifier stamp.
4. Preamble n1 + modifier stamp.
5. **Conditional:** combat-fork-branch encounter + modifier stamp.
6. **Conditional:** elite encounter + modifier stamp.
7. **Conditional:** shop inventory.
8. **Conditional:** event card draw via `drawEventCard(Object.values(EVENTS), dungeonId, rng)`. *(NEW)*
9. Boss encounter.

The `drawEventCard` helper consumes one RNG draw via `rng.pick(eligible)`. Order is after the elite/shop draws to keep parallel structure.

### 4.2 · Implementation sketch

```ts
import { EVENTS } from '../data/events';
import { drawEventCard } from './event_deck';

// ...

const usesEventBranch =
  shape === 'event_vs_combat' ||
  shape === 'event_vs_shop' ||
  shape === 'event_vs_elite' ||
  shape === 'event_vs_camp';

// After the existing shop draw:
const eventBranchCardId = usesEventBranch
  ? drawEventCard(Object.values(EVENTS), dungeonId, rng).id
  : undefined;
```

New `buildEventBranch` builder:

```ts
const buildEventBranch = (id: string): Node => {
  if (eventBranchCardId === undefined) {
    throw new Error(`generateFloor: eventBranchCardId undefined for shape '${shape}'`);
  }
  return { id, type: 'event', cardId: eventBranchCardId, nextNodeIds: [idBoss] };
};
```

Switch on `shape` adds 4 new cases:

```ts
case 'event_vs_combat':
  node2a = specialOnBranchA ? buildEventBranch(id2a)  : buildCombatBranch(id2a);
  node2b = specialOnBranchA ? buildCombatBranch(id2b) : buildEventBranch(id2b);
  break;
case 'event_vs_shop':
  node2a = specialOnBranchA ? buildEventBranch(id2a) : buildShopBranch(id2a);
  node2b = specialOnBranchA ? buildShopBranch(id2b)  : buildEventBranch(id2b);
  break;
case 'event_vs_elite':
  node2a = specialOnBranchA ? buildEventBranch(id2a)  : buildEliteBranch(id2a);
  node2b = specialOnBranchA ? buildEliteBranch(id2b)  : buildEventBranch(id2b);
  break;
case 'event_vs_camp':
  node2a = specialOnBranchA ? buildEventBranch(id2a) : buildCampBranch(id2a);
  node2b = specialOnBranchA ? buildCampBranch(id2b)  : buildEventBranch(id2b);
  break;
```

### 4.3 · Empty-deck protection

`EVENTS` is populated from Cluster A · 14 with 20 cards. `drawEventCard` throws if no eligible cards exist for the dungeon. For Crypt, eligible cards = 15 shared + 5 Crypt-specific = 20. Always non-empty in practice. The throw acts as a defensive guard for future dungeons that might somehow have no eligible cards.

## 5 · Dungeon scene — auto-skip stub + icon glyph

`src/scenes/dungeon_scene.ts`:

### 5.1 · `handleArrival` event branch

Place between the `'shop'` and `'camp'` branches (or anywhere among the non-combat checks):

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

`chooseNextNode` is already imported (used by the fork picker). Reusing it for the auto-skip keeps the import surface unchanged.

### 5.2 · Icon glyph

Per gdd §4: `❓` for events. Add to the existing glyph chain in `buildNodes` (around line 156):

```ts
const glyph =
  node.type === 'boss'  ? '☠' :
  node.type === 'shop'  ? '🛒' :
  node.type === 'elite' ? '💀' :
  node.type === 'camp'  ? '🏕' :
  node.type === 'event' ? '❓' :
  '⚔';
```

`refreshNodeColors` doesn't add an event-specific color — events use the default future-state grey (`#888888`), like combat/shop/camp. Future polish can refine.

## 6 · Combat scene — defensive guard

`src/scenes/combat_scene.ts:create()` currently early-returns on `'shop' || 'camp'`. Extend to event:

```ts
if (node.type === 'shop' || node.type === 'camp' || node.type === 'event') {
  console.warn(`CombatScene entered with non-combat node type '${node.type}'; returning to dungeon`);
  this.scene.start('dungeon');
  return;
}
```

Keeps type-narrowing for `node.encounter` access intact.

## 7 · `playerPath` traversal

`src/run/run_state.ts:playerPath()` is a graph-traversal helper that doesn't care about node types — it inspects `nextNodeIds` only. Event nodes with a single `nextNodeIds` (always the boss, like camp/shop) work identically. No changes expected; verify in implementation that nothing surfaces a type-narrowing issue.

## 8 · Test plan

### `src/dungeon/__tests__/floor.test.ts` (extend)

**New tests:**

- Across N=1000 seeds, all 10 fork shapes appear at least once.
- `event_vs_combat` shape produces an event branch with a valid `cardId` (key exists in `EVENTS`).
- `event_vs_shop` shape: branches sort to `['event', 'shop']`.
- `event_vs_elite` shape: branches sort to `['elite', 'event']`.
- `event_vs_camp` shape: branches sort to `['camp', 'event']`.
- Event nodes have exactly one `nextNodeIds` entry pointing at the boss.

**Updated tests:**

- The existing distribution test (was "all six shapes appear evenly") becomes "all ten shapes appear with each ≥10%" or similar — bound shifts from `60` (6-shape baseline) to `100` for 1000 seeds, with a loose lower bound (e.g. ≥ 60 of 1000 = 6%).

### `src/dungeon/__tests__/event_deck.test.ts` (no change)

Existing tests for `drawEventCard` already cover the helper used by floor.ts.

### Manual play

- Walk a run; events appear in ~40% of fork rolls. Icon shows ❓.
- Walking onto an event node: auto-skip stub fires; player advances to the boss without applying any payload.
- Console may show the auto-skip transition; no errors.

## 9 · Files touched

| File | Change |
|---|---|
| `src/dungeon/node.ts` | Extend `Node` union with `'event'` variant carrying `cardId: EventCardId`. Import `EventCardId` from `data/events`. |
| `src/dungeon/floor.ts` | 10-shape RNG; `drawEventCard` + `EVENTS` imports; `usesEventBranch` + `eventBranchCardId` + `buildEventBranch`; 4 new switch cases. |
| `src/scenes/dungeon_scene.ts` | `handleArrival` event branch (auto-skip stub); icon glyph mapping for event. |
| `src/scenes/combat_scene.ts` | Defensive guard extends to `'event'`. |
| `src/dungeon/__tests__/floor.test.ts` | Extend for 10-shape distribution + 4 new shape coverage tests. |

## 10 · Save schema

No version bump. Saves predating this change have no event nodes; new saves on event-bearing fork shapes serialize the variant naturally. The pre-launch shape-mismatch loader rejection guards against any cardId that no longer exists if the deck content changes.

## 11 · Open questions

None at design time. The 1/10 uniform weighting is tunable via `FORK_SHAPE_WEIGHTS`.
