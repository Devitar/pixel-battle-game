# Run State & Gold-Only Pack (Tier 1)

**Status:** Design · **Date:** 2026-04-24 · **Source TODO:** Cluster A, task 6

## Purpose

Model the in-progress expedition as an immutable `RunState` that binds the floor generator (task 5) to the combat engine (task 4). This task introduces the `Hero` type, the gold-only `Pack`, and the `RunState` transitions (`startRun`, `completeCombat`, `pressOn`, `cashout`) that drive the player through a run. It also extracts production-grade combatant factories from test helpers and adds the encounter → `CombatState` bridge.

Scope is Tier 1: gold-only pack (no gear yet), fixed 3-hero party, Fallen death category only (no Lost), Leave / Press On decisions at post-boss camp screens (no Abandon, no mid-floor camp nodes).

## Dependencies and invariants

**Vocabulary from prior tasks:**
- `ClassId`, `EnemyId`, `DungeonId`, `Stats` (task 2), `SlotIndex` (task 2), `Node`, `Encounter`, `ScaleFactors` (task 5), `CombatState`, `Combatant`, `CombatantId`, `CombatResult` (task 4), `generateFloor` (task 5), `resolveCombat` (task 4).

**Invariants this spec declares:**
- `RunState` is **immutable**. Every operation returns a new `RunState`; callers swap the reference. Internal fields carry `readonly`.
- The run does not own its RNG. Operations take `(runState, rng)` separately; the `seed` field in `RunState` exists for save-file archival only.
- Party hero HP persists across combat nodes. No mid-run healing in Tier 1 (no camp nodes, no potions).
- Fallen heroes move from `party` to `fallen` array at death time. Both arrays are preserved until run end; roster-level permadeath happens at cashout/wipe.
- Timeout outcome from combat is treated as a wipe.
- All camp screens in Tier 1 are post-boss — Abandon is unreachable and omitted.
- Party size is fixed at 3. `startRun` throws on any other count.
- Combat bridging applies encounter scale to HP and Attack only (per task 5). Defense and Speed unscaled.

## Module layout

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/heroes/hero.ts` | Create | `Hero` type + `createHero`. Minimal Tier 1 shape. |
| `src/run/pack.ts` | Create | `Pack` type + `createPack`, `addGold`, `totalGold`, `emptyPack`. All immutable. |
| `src/run/run_state.ts` | Create | `RunState`, `RunStatus`, outcome types + transitions: `startRun`, `currentNode`, `completeCombat`, `pressOn`, `cashout`. |
| `src/run/combat_setup.ts` | Create | `buildCombatState(party, encounter) → CombatState`. Applies scale, assigns combatantIds. |
| `src/combat/combatant.ts` | Create | Production factories `createHeroCombatant`, `createEnemyCombatant` — extracted from test helpers. |
| `src/combat/__tests__/helpers.ts` | Modify | Thin shim: re-export production factories under old names; keep `makeTestState` as-is. |
| `src/heroes/__tests__/hero.test.ts` | Create | |
| `src/run/__tests__/pack.test.ts` | Create | |
| `src/run/__tests__/run_state.test.ts` | Create | |
| `src/run/__tests__/combat_setup.test.ts` | Create | |
| `src/combat/__tests__/combatant.test.ts` | Create | |

**Import boundary:** `src/run/` is the first domain that imports across all non-phaser layers — `src/data/`, `src/heroes/`, `src/dungeon/`, `src/combat/`, `src/util/`. `src/heroes/` imports from `src/data/` (for `ClassId` and `CLASSES`) and `src/combat/types` (for `Stats`). `src/dungeon/` remains unchanged — it does not import from `src/combat/` or `src/run/`. No phaser anywhere in this task.

## Types

### `Hero` (`src/heroes/hero.ts`)

```ts
export interface Hero {
  id: string;            // stable across runs; assigned at recruitment (task 8)
  classId: ClassId;
  name: string;
  baseStats: Stats;      // snapshot; immutable for Tier 1 (leveling is Tier 2)
  currentHp: number;
  maxHp: number;         // equals baseStats.hp in Tier 1
}

export function createHero(
  classId: ClassId,
  name: string,
  id: string,
): Hero;
```

`createHero` reads from `CLASSES[classId]` for base stats. Tier 1 heroes spawn at full HP (`currentHp === maxHp === baseStats.hp`).

### `Pack` (`src/run/pack.ts`)

```ts
export interface Pack {
  readonly gold: number;
}

export function createPack(): Pack;
export function addGold(pack: Pack, amount: number): Pack;  // throws if amount < 0
export function totalGold(pack: Pack): number;
export function emptyPack(pack: Pack): Pack;                 // returns { gold: 0 }
```

All operations are pure and return new `Pack` values. `addGold` throws on negative amounts — the pack is credits-only; wipes zero it via `emptyPack`, not a negative credit.

### `RunState` (`src/run/run_state.ts`)

```ts
export type RunStatus = 'in_dungeon' | 'camp_screen' | 'ended';

export interface RunState {
  readonly dungeonId: DungeonId;
  readonly seed: number;
  readonly party: readonly Hero[];
  readonly pack: Pack;
  readonly currentFloorNumber: number;     // 1-indexed
  readonly currentFloorNodes: readonly Node[];
  readonly currentNodeIndex: number;       // 0-indexed
  readonly status: RunStatus;
  readonly fallen: readonly Hero[];
}

export interface CashoutOutcome {
  goldBanked: number;
  heroesReturned: readonly Hero[];
  heroesLost: readonly Hero[];
}

export interface WipeOutcome {
  packLost: Pack;
  heroesLost: readonly Hero[];
}
```

**Field semantics:**
- `party` contains only living heroes. Newly-fallen heroes move to `fallen` at the `completeCombat` that killed them.
- `seed` is archival — preserved for save-file replay / debugging. The run does not derive its RNG from the seed on demand; callers pass a live `Rng` to operations.
- `currentFloorNodes` is populated at `startRun` and repopulated at each `pressOn`. Cached so the dungeon scene can walk the array without re-invoking the generator.

## Run lifecycle + transitions

### `startRun`

```ts
export function startRun(
  dungeonId: DungeonId,
  party: readonly Hero[],
  seed: number,
  rng: Rng,
): RunState
```

1. Assert `party.length === 3`; throw otherwise.
2. `nodes = generateFloor(dungeonId, 1, rng)`.
3. Return:
   ```ts
   {
     dungeonId, seed,
     party: [...party],
     pack: createPack(),
     currentFloorNumber: 1,
     currentFloorNodes: nodes,
     currentNodeIndex: 0,
     status: 'in_dungeon',
     fallen: [],
   }
   ```

### `currentNode`

```ts
export function currentNode(runState: RunState): Node
```

Returns `runState.currentFloorNodes[runState.currentNodeIndex]`. Throws if `status !== 'in_dungeon'`. No state transition — this is an accessor.

### `completeCombat`

```ts
export function completeCombat(
  runState: RunState,
  result: CombatResult,
): { runState: RunState; wipe?: WipeOutcome }
```

Procedure:

1. Assert `runState.status === 'in_dungeon'`; throw otherwise.
2. Match each Combatant in `result.finalState` to the corresponding Hero in `runState.party` by combatantId (`p0..p2` → party index 0..2).
3. Build two arrays:
   - `updatedPartyLiving`: heroes whose matching Combatant is not dead, with `currentHp` copied from the Combatant.
   - `newFallen`: heroes whose matching Combatant is dead.
4. **On `'player_defeat'` or `'timeout'`** (wipe path):
   - `allLost = [...runState.fallen, ...newFallen, ...updatedPartyLiving]` — every hero who won't return to the roster, including those who fell in earlier combats plus anyone still alive at wipe time.
   - `wipe: WipeOutcome = { packLost: runState.pack, heroesLost: allLost }`.
   - Return `{ runState: { ...runState, party: [], fallen: allLost, pack: createPack(), status: 'ended' }, wipe }`.
5. **On `'player_victory'`** (success path):
   - Determine the completed node type: `currentFloorNodes[currentNodeIndex].type`.
   - Award gold:
     - `'combat'` → `15 × currentFloorNumber`
     - `'boss'` → `100 × currentFloorNumber`
   - `newPack = addGold(runState.pack, reward)`.
   - If node type was `'boss'`: new status is `'camp_screen'`, `currentNodeIndex` unchanged.
   - Else: new status is `'in_dungeon'`, `currentNodeIndex += 1`.
   - Return `{ runState: { ...runState, party: updatedPartyLiving, fallen: [...runState.fallen, ...newFallen], pack: newPack, status, currentNodeIndex } }`.

### `pressOn`

```ts
export function pressOn(runState: RunState, rng: Rng): RunState
```

1. Assert `runState.status === 'camp_screen'`; throw otherwise.
2. `nextFloor = runState.currentFloorNumber + 1`.
3. `nodes = generateFloor(runState.dungeonId, nextFloor, rng)`.
4. Return `{ ...runState, currentFloorNumber: nextFloor, currentFloorNodes: nodes, currentNodeIndex: 0, status: 'in_dungeon' }`. Party, pack, fallen preserved.

### `cashout`

```ts
export function cashout(runState: RunState): { runState: RunState; outcome: CashoutOutcome }
```

1. Assert `runState.status === 'camp_screen'`; throw otherwise.
2. `outcome: CashoutOutcome = { goldBanked: totalGold(runState.pack), heroesReturned: runState.party, heroesLost: runState.fallen }`.
3. Return `{ runState: { ...runState, status: 'ended' }, outcome }`.

The caller (scene / roster at task 7) credits the vault with `goldBanked` and removes `heroesLost` from the roster. `run_state.ts` does not reach into roster state.

### Caller contract summary

| Operation | Requires status | Produces |
|---|---|---|
| `startRun` | — | `RunState` (status: `in_dungeon`) |
| `currentNode` | `in_dungeon` | `Node` (no state change) |
| `completeCombat` | `in_dungeon` | `{ runState, wipe? }` (status: `in_dungeon` / `camp_screen` / `ended`) |
| `pressOn` | `camp_screen` | `RunState` (status: `in_dungeon`) |
| `cashout` | `camp_screen` | `{ runState, outcome }` (status: `ended`) |

After `status === 'ended'`, no further operation is legal. The caller discards the run state and returns to camp.

## Combatant factories + combat_setup

### Production factory extraction (`src/combat/combatant.ts`)

The existing `src/combat/__tests__/helpers.ts` has `makeHeroCombatant` and `makeEnemyCombatant` — test helpers that read `CLASSES` / `ENEMIES` and produce Combatant instances. Promote both to production as `createHeroCombatant` and `createEnemyCombatant`. Full signatures:

```ts
export function createHeroCombatant(
  classId: ClassId,
  slot: SlotIndex,
  id: CombatantId,
  overrides?: Partial<Combatant>,
): Combatant;

export function createEnemyCombatant(
  enemyId: EnemyId,
  slot: SlotIndex,
  id: CombatantId,
  overrides?: Partial<Combatant>,
): Combatant;
```

The `overrides` parameter is the scaling hook: the run-side builder passes scaled `baseStats`, `currentHp`, and `maxHp` via overrides without the factory knowing about floor scaling.

The test helpers file becomes a shim that re-exports with the old `make*` names, so the existing 7 test files compile without edits. The shim can be dropped during a future test-rename pass.

### `buildCombatState` (`src/run/combat_setup.ts`)

```ts
export function buildCombatState(
  party: readonly Hero[],
  encounter: Encounter,
): CombatState
```

Procedure:

1. Party → player-side Combatants:
   - For each `hero` at party index `i`:
     - `createHeroCombatant(hero.classId, (i + 1) as SlotIndex, 'p' + i, { baseStats: hero.baseStats, currentHp: hero.currentHp, maxHp: hero.maxHp })`.
   - Preserves the hero's current HP across the combat.
2. Encounter → enemy-side Combatants:
   - For each `placement` at index `i`:
     - `scaled = scaleEnemyStats(placement.enemyId, encounter.scale)`.
     - `createEnemyCombatant(placement.enemyId, placement.slot, 'e' + i, { baseStats: scaled, currentHp: scaled.hp, maxHp: scaled.hp })`.
3. Return `{ combatants, round: 0 }`.

Where:

```ts
function scaleEnemyStats(enemyId: EnemyId, scale: ScaleFactors): Stats {
  const base = ENEMIES[enemyId].baseStats;
  return {
    hp: Math.round(base.hp * scale.hp),
    attack: Math.round(base.attack * scale.attack),
    defense: base.defense,
    speed: base.speed,
  };
}
```

**Notes:**
- Party slot is derived from the party array index. The run state preserves party order across nodes — whoever is at `party[0]` is always in slot 1. Reformation is out of scope for Tier 1.
- CombatantId scheme is `p0..pN-1` and `e0..eM-1`, matching the combat engine's existing convention.
- Rounding happens at construction time via `Math.round`. HP ties roll toward the larger integer (banker's rounding not used — standard `Math.round` suffices for Tier 1's small numbers).

## Test plan

### `src/heroes/__tests__/hero.test.ts`
- `createHero('knight', 'Eira', 'h1')` produces a Hero with `currentHp === maxHp === CLASSES.knight.baseStats.hp`.
- `baseStats` matches the class exactly.
- Two Heroes with identical inputs are `toEqual`-equivalent (plain value).

### `src/run/__tests__/pack.test.ts`
- `createPack()` → `{ gold: 0 }`.
- `addGold(pack, 10)` returns `{ gold: 10 }`; original pack unchanged (immutability check with a deep-equal snapshot).
- `addGold(pack, 0)` returns a new pack (not the same reference) with `gold: 0`.
- `totalGold` returns the gold field.
- `emptyPack({ gold: 42 })` → `{ gold: 0 }`.
- `addGold(pack, -1)` throws.

### `src/combat/__tests__/combatant.test.ts`
- `createHeroCombatant('knight', 1, 'p0')`: `side: 'player'`, `kind: 'hero'`, `classId: 'knight'`, baseStats/abilities from `CLASSES.knight`, `currentHp === maxHp`, empty statuses, `isDead: false`.
- `createEnemyCombatant('skeleton_warrior', 1, 'e0')`: `side: 'enemy'`, `kind: 'enemy'`, `tags: ['undead']`, `preferredSlots: [1, 2]`, correct baseStats.
- Override application: passing `{ currentHp: 5 }` results in a Combatant at 5 HP.

### `src/run/__tests__/combat_setup.test.ts`
- **Party slot ordering:** `buildCombatState([knight, archer, priest], encounter)` places them at slots 1, 2, 3 respectively.
- **Enemy slots preserved:** enemy placements from the encounter are respected.
- **Scaling at 1.5×:** enemy `baseStats.hp = round(base.hp × 1.5)` and `baseStats.attack = round(base.attack × 1.5)`. Defense and Speed unchanged.
- **Scaling at 1.0×:** no change to stats.
- **Party HP preserved:** passing heroes with `currentHp: 5, maxHp: 20` produces a Combatant at 5/20.
- **Enemy HP starts at scaled max.**
- **CombatantIds:** `p0..p2` for party, `e0..eM-1` for enemies.
- **Round starts at 0.**

### `src/run/__tests__/run_state.test.ts`

Scripted scenarios with mocked `CombatResult` values:

**`startRun`:**
- Three-hero party → returns `status: 'in_dungeon'`, `currentFloorNumber: 1`, `currentNodeIndex: 0`, empty pack, empty fallen.
- `currentFloorNodes` populated (4 nodes: 3 combat + 1 boss).
- Throws on party size 2, 4, or 0.

**`completeCombat` — combat node victory:**
- Increments `currentNodeIndex` by 1.
- Pack gold increases by `15 × currentFloorNumber`.
- Party HP updated from finalState.
- `wipe` undefined.
- Status remains `'in_dungeon'`.

**`completeCombat` — boss node victory:**
- `status` becomes `'camp_screen'`.
- Pack gold increases by `100 × currentFloorNumber`.
- `currentNodeIndex` unchanged.

**`completeCombat` — one hero dies, party survives:**
- Dead hero moves from `party` to `fallen`.
- Party length drops by 1; fallen length grows by 1.
- No wipe outcome.

**`completeCombat` — defeat:**
- `status` becomes `'ended'`.
- All party heroes move to `fallen`.
- Pack zeroed.
- `wipe` outcome with `packLost` carrying pre-wipe pack and `heroesLost` containing everyone.

**`completeCombat` — timeout:**
- Same as defeat (timeout treated as wipe per Q5).

**`pressOn`:**
- Throws unless `status === 'camp_screen'`.
- Returns RunState with `currentFloorNumber + 1`, new `currentFloorNodes`, `currentNodeIndex: 0`, `status: 'in_dungeon'`.
- Pack and party preserved across floor transitions.

**`cashout`:**
- Throws unless `status === 'camp_screen'`.
- Outcome: `goldBanked === pack.gold`, `heroesReturned === party`, `heroesLost === fallen`.
- `runState.status === 'ended'`.

**Immutability regression:**
- Capture RunState before an operation; assert deep-equal after the operation (original unchanged).

**Status-wrong-error assertions:**
- One test per (operation, wrong-status) pair — e.g., `pressOn` on an `in_dungeon` state throws.

## Risks and follow-ups

- **Save/load delegation.** Task 9 (save/load) serializes `RunState` + a separate RNG state snapshot. This spec doesn't address serialization directly; the `readonly` contract and plain-record shape of `RunState` make it JSON-safe with one exception: `currentFloorNodes` contains the generated `Node[]` which is also JSON-safe. No hidden state.
- **RNG state persistence is external.** The `seed` field alone isn't enough to recreate the current RNG state mid-run — the saved file needs to separately persist the RNG's accumulated consumption (typically an integer for mulberry32). Task 9's concern; a placeholder note here to avoid surprises.
- **Party reformation is Tier 2.** The run freezes party order at `startRun`; slot 1 is always `party[0]`. Tier 2 may introduce mid-run reformation at camp nodes.
- **No healing sources in Tier 1.** Party HP monotonically decreases across the run (or is restored via Priest's Mend during combat). The camp screen does not heal. Heroes enter each combat at whatever HP they exited the previous one with.
- **Abandon unimplemented.** Every camp screen in Tier 1 is post-boss, so Abandon is unreachable. Tier 2 adds it alongside mid-floor camp nodes.
- **Timeout treated as wipe** loses the "feels weird, you didn't actually die" nuance. In practice the round cap only triggers when balance is broken (tank-vs-tank stalemate). Reclassify if playtesting surfaces legitimate timeouts.
- **Gold reward formula is a placeholder.** 15g / 100g × floorNumber is a starting point; Tavern prices and Blacksmith costs (Tier 2) will pin down what "enough gold" feels like.
- **Test helpers shim is temporary.** The shim in `src/combat/__tests__/helpers.ts` aliases `makeHeroCombatant → createHeroCombatant` and `makeEnemyCombatant → createEnemyCombatant`. Drop on next test-rename pass.
