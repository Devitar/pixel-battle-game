# Phase 6d — Surprise Encounters Design

**Status:** Locked design (brainstormed 2026-05-04). Builds on the in-corridor combat infrastructure shipped in Phase 6c.

## §1 — Overview

Phase 6d adds RNG-driven surprise encounters: while the party is travelling toward a non-combat node (shop / camp / event / treasure), an ambush may fire mid-corridor. The world scroll halts at the ambush position, combat resolves in-place using the corridor scene's existing combat infrastructure, and on victory the scroll resumes to the original destination — which is preserved (the surprise is a **tax**, not a replacement).

The design's load-bearing decisions, locked during the 2026-05-04 brainstorm:

- **Q1 — Destination preservation: tax model.** Win the ambush → still arrive at the chosen shop / camp / event / treasure. The surprise costs HP and time, not the picked node.
- **Q2 — Cadence: per-edge roll with a soft floor cap.** Probability scales by floor (F1 15% / F2 20% / F3 25%); cap = 1 surprise per floor on F1 and F2, 2 on F3.
- **Q3 — Content: mini skirmish, mini reward.** 1–2 enemies from the dungeon pool (vs. regular combat's 2–4), same `floorScale`, no modifier stamping. Reward = half a regular combat node's gold; loot at the standard 10% combat drop rate.
- **Q4 — HP-tick interaction: surprise replaces tick.** When a surprise fires on an edge, the per-edge ±1 HP tick (Phase 6a) is suppressed for that edge. The ambush IS the corridor cost.

## §2 — Locked design

### §2.1 Trigger logic — pure TS module

New file `src/dungeon/surprise.ts` exposes a single function:

```ts
export function rollSurprise(
  run: RunState,
  dungeon: DungeonDef,
  destinationType: NodeType,
  rng: Rng,
): Encounter | null;
```

Logic:

1. Returns `null` immediately if `destinationType` is `'combat' | 'elite' | 'boss'` — surprises only fire toward non-combat nodes.
2. Returns `null` if `run.surprisesThisFloor >= floorCap(run.currentFloorNumber)`. `floorCap` is `1` for floors 1–2, `2` for floor 3.
3. Rolls a per-floor probability via `rng.next()`:
   - Floor 1: 15%
   - Floor 2: 20%
   - Floor 3: 25%
4. On a probability hit, composes a mini-encounter:
   - Size rolled from `[1: 30%, 2: 70%]` (vs. regular combat's `[2: 20%, 3: 60%, 4: 20%]`).
   - Picks `size` enemy ids from `dungeon.enemyPool` (uniform random).
   - Guarantees ≥1 front-liner: if no picks are front-liners, replace `picks[0]` with a uniform-random pick from `pool.filter(isFrontLiner)` — same fallback as `composeCombatEncounter`.
   - Calls `assignSlots(picks)` (reused from `encounter.ts`) to build placements.
   - **No modifier stamping** — `stampCombatModifiers` is NOT called. Surprise placements have no `modifierIds`.
   - Wraps in `{ enemies: placements, scale: floorScale(run.currentFloorNumber) }` and returns.

`rollSurprise` is the only public export. Tested directly in `src/dungeon/__tests__/surprise.test.ts`.

### §2.2 Run-state addition

`RunState` (`src/run/run_state.ts`) gains one field:

```ts
surprisesThisFloor: number;  // count of surprises that fired on the current floor
```

- Initialized to `0` in `createRunState()`.
- Reset to `0` in `pressOn()` (the floor-advance code path called after boss clear).
- Incremented at the same call site that builds the corridor handoff, immediately after `rollSurprise` returns a non-null encounter.

**Save schema:** stays pinned at version `1` (per pre-launch policy in feedback memory). The field is added with a default-on-read accessor — older saves missing this key are read as `surprisesThisFloor: 0`. No migration, no schema bump.

### §2.3 Pre-travel decision — handoff extension

`src/scenes/corridor_handoff.ts`'s payload gains one optional field:

```ts
export interface CorridorHandoffPayload {
  deltas: readonly number[];                  // existing — per-hero HP tick deltas
  surprise: SurpriseSpec | null;              // new
}

export interface SurpriseSpec {
  encounter: Encounter;
  spawnFraction: number;  // 0.4–0.6 of WORLD_SCROLL_DISTANCE — random per fire
}
```

In `dungeon_scene.ts:onNodeClicked`:

1. Resolve the destination node (already done — needed for `applyTravelTick`).
2. Call `rollSurprise(run, dungeon, destinationNode.type, rng)`.
3. **If `null` (no surprise):** existing flow — call `applyTravelTick`, build handoff with `deltas` populated and `surprise: null`.
4. **If non-null (surprise hit):**
   - Skip `applyTravelTick` (Q4-B: surprise replaces tick).
   - Mutate the run state: `surprisesThisFloor: prev + 1`. Persist via `appState.update`.
   - Roll `spawnFraction` via `rng` in `[0.4, 0.6]`.
   - Build handoff with `deltas: [0, 0, 0]` (no tick) and `surprise: { encounter, spawnFraction }`.
5. Persist the post-roll RNG state and call `scene.start('corridor')`.

This keeps all pre-travel state mutation in the click handler — single source of truth for what happens on this edge.

### §2.4 Corridor scene — surprise branch

`corridor_scene.ts:create()` after consuming handoff:

- **No surprise:** existing flow. Schedule HP-tick `delayedCall` at `TOTAL_TRAVEL_MS * HP_TICK_FRACTION`, schedule chatter, scroll world container the full `WORLD_SCROLL_DISTANCE` over `TOTAL_TRAVEL_MS / walkSpeed`. `onTravelComplete` → `engageDestination`.
- **Surprise:**
  - Skip the HP-tick `delayedCall` entirely (no tick this edge).
  - Schedule chatter normally, but only if its computed trigger time (`step * STEP_DURATION_MS`) lands before the surprise spawn time (`spawnFraction * TOTAL_TRAVEL_MS`). If chatter would land at-or-after the spawn, skip chatter for this edge.
  - Embed the surprise enemies inside the world container at world-relative x = `ENEMY_X_BY_SLOT[c.slot] + spawnFraction * WORLD_SCROLL_DISTANCE`. Derivation: world container starts at x=0; after scrolling left by `D` pixels its x is `-D`; a child at world-relative `P` appears on screen at `-D + P`. We want the enemy to appear at `ENEMY_X_BY_SLOT[c.slot]` when `D = spawnFraction * WORLD_SCROLL_DISTANCE`, so `P = ENEMY_X_BY_SLOT[c.slot] + spawnFraction * WORLD_SCROLL_DISTANCE`.
  - Tween the world container's x to `-(spawnFraction * WORLD_SCROLL_DISTANCE)` over `spawnFraction * TOTAL_TRAVEL_MS / walkSpeed`. On tween complete → `startSurpriseCombat()`.

### §2.5 `startSurpriseCombat()` — combat in-place mid-edge

Mirrors `startCombatInPlace()` with three differences:

1. **Encounter source:** uses `handoff.surprise.encounter` instead of `currentNode(run).encounter`.
2. **No enemy slide-in tween.** The surprise enemies are already embedded in the scrolling world (visible as scroll progresses). The partial scroll IS the entrance — same principle as 6c's standard combat entrance.
3. **Skip `ENEMY_SLIDE_IN_MS` delay** before `playback.run()`. Combat starts immediately on scroll-halt, since enemies have been visibly approaching during the partial scroll.

Otherwise identical: build `CombatActor`s, build combat HUD, hide walk-speed FF UI / show combat-speed FF UI, kill bob-rotate tweens on heroes, run `CombatPlayback`. On `playback.onComplete` → `processSurpriseCombatResult()`.

### §2.6 Surprise reward path — `completeSurpriseCombat`

A new pure-TS function in `src/run/run_state.ts`:

```ts
export function completeSurpriseCombat(
  run: RunState,
  result: CombatResult,
  rng: Rng,
): { runState: RunState; wipe?: WipeOutcome };
```

Differences from `completeCombat`:

- **Does NOT advance `currentNodeId`.** Heroes still need to walk to the destination.
- **Reduced gold:** `Math.floor(SURPRISE_GOLD_BASE * run.currentFloorNumber)` where `SURPRISE_GOLD_BASE = 7` (≈ half of `COMBAT_NODE_REWARD = 15`). Yields 7g on F1, 14g on F2, 21g on F3.
- **Loot rolled at the same 10% combat-drop rate** via the existing `rollLoot` helper. Same parameters as a regular combat node.
- **Fallen-hero gear recovery** mirrors `completeCombat` — fallen heroes' equipped items go into the pack.
- **Fallen-hero removal from party** mirrors `completeCombat`.
- **Wipe handling** mirrors `completeCombat`: returns `{ runState, wipe }` where `wipe` is set if the party is empty post-fight.

Tested in `src/run/__tests__/run_state.test.ts` (extend the existing test file).

### §2.7 Result panel — surprise variant

After a surprise combat win, the corridor scene calls `processSurpriseCombatResult` (sibling to `processCombatResultInline`) which:

1. Captures `preCombatParty` and `prePackLen` (same pattern).
2. Calls `completeSurpriseCombat(run, result, rng)`.
3. Stashes `combatLoot` (slice of pack from `prePackLen`).
4. Tears down combat HUD + enemy actors.
5. Builds the result panel with two cosmetic differences from `buildResultPanel`:
   - Title text: **"Ambushed!"** (color `#ffaa44` — orange/warning) instead of "Victory!" (green).
   - Reward gold uses the surprise gold value, not `COMBAT_NODE_REWARD`.
6. Otherwise identical: per-hero HP delta lines, Fallen lines, loot lines, click-to-dismiss.
7. Click-to-dismiss handler calls `resumeScrollToDestination()` instead of `scene.start('dungeon')`.

If wipe: standard wipe panel (no cosmetic differentiation needed — wipe is wipe).

### §2.8 `resumeScrollToDestination()`

After surprise result panel is dismissed:

1. Tear down result panel.
2. Restore travel-time hero animations: re-add bob tween to each `CombatActor` container, re-add rotate tween to each `CombatActor.bodyVisual`. (Mirrors `buildHeroes`'s tween setup.)
3. Compute remaining scroll distance: `(1 - spawnFraction) * WORLD_SCROLL_DISTANCE`. Tween world container's x from current value to `-WORLD_SCROLL_DISTANCE` over `(1 - spawnFraction) * TOTAL_TRAVEL_MS / walkSpeed`.
4. On tween complete → `engageDestination()` (standard non-combat overlay launch).

No HP tick or chatter on the resumed scroll — those were already decided (or skipped) for this edge in §2.4.

### §2.9 RNG determinism

The run RNG (seeded, persisted in `runRngState`) drives every roll:

1. The `rollSurprise` probability gate.
2. The mini-encounter size + enemy id picks + front-liner fallback.
3. The `spawnFraction` roll in `[0.4, 0.6]`.
4. Combat resolution (existing — `resolveCombat`).
5. Loot roll inside `completeSurpriseCombat` (existing — `rollLoot`).

RNG state is persisted at the same `appState.update` calls as today: once after the pre-travel handoff is built, once after `completeSurpriseCombat` runs. Reload from a save mid-surprise-combat is governed by §2.10.

### §2.10 Edge cases

- **Wipe during surprise combat:** corridor scene's existing wipe panel + `onWipeReturn` path. Heroes-Fallen / Heroes-Lost identical to combat-node wipe. Hospital tick + treatments-cap reset fire as today.
- **Reload mid-surprise combat:** inherits the codebase's existing mid-corridor reload limitation. The current implementation does not preserve in-flight combat state; on reload mid-combat, the player would land at the source node with the run RNG advanced past the trigger roll. **Out of scope for this phase** — robustness for mid-corridor save/reload is a separate, broader task that affects regular combat too.
- **First-node entry:** `traversedNodeIds.length === 1` skips the walk and goes straight to `engageDestination`. The surprise roll happens in the click handler (which doesn't run on first-node entry — first-node entry comes from the camp scene transition, not a node click). No code change needed: surprises naturally don't fire on first-node entry.
- **Floor cap reset:** `pressOn()` resets `surprisesThisFloor` to 0. Tested.
- **Surprise on the way to a fork-bound node:** no special handling needed. The destination is identified by `currentNodeId`; whether the player is `awaitingFork` afterwards is unchanged.
- **Empty enemy pool:** `dungeon.enemyPool` is data-defined and never empty for live dungeons. `rollSurprise` does not defend against an empty pool — failure mode is `rng.pick` throwing, which would surface a bug rather than silently mis-firing. Same posture as `composeCombatEncounter`.

## §3 — Out of scope

- Multi-stage surprises / mini-boss ambushes — not needed for Tier 2 polish.
- Fleeing from a surprise — combat is mandatory once triggered. Could revisit if a "flee" mechanic is added later.
- Visual telegraphing (audio sting, sprite flash before scroll halts) — placeholder corridor art doesn't warrant dedicated polish here. Cluster C art polish later.
- Modifier-stamped surprises (elite-flavored ambushes) — intentionally simple this phase. Could re-enable in a balance pass if surprises feel too easy.
- Surprise-specific enemy pool — reuses dungeon.enemyPool. A separate "ambush pool" data layer is overkill for the Crypt-only scope.
- Mid-corridor save/reload robustness — pre-existing limitation, separate broader task.
- Speech-bubble chatter that reacts to surprises — chatter remains generic per Phase 6b. Surprise-aware lines could be added later.

## §4 — Files affected

| Path | Action | Purpose |
|---|---|---|
| `src/dungeon/surprise.ts` | **New** | `rollSurprise` + helpers + `floorCap`. ~80 lines. |
| `src/dungeon/__tests__/surprise.test.ts` | **New** | Cap, gating, probability, encounter shape, no modifiers. |
| `src/run/run_state.ts` | **Modify** | Add `surprisesThisFloor` field with default-on-read; reset on floor advance; export `completeSurpriseCombat`. |
| `src/run/__tests__/run_state.test.ts` | **Modify** | Cover `surprisesThisFloor` increment / reset and `completeSurpriseCombat` (gold, loot, fallen handling, no node advance). |
| `src/scenes/corridor_handoff.ts` | **Modify** | Add `surprise: SurpriseSpec \| null` to payload type + handoff helpers. |
| `src/scenes/dungeon_scene.ts` | **Modify** | `onNodeClicked` calls `rollSurprise`, branches on result, handles increment + RNG persistence. |
| `src/scenes/corridor_scene.ts` | **Modify** | Surprise branch in `create()` (partial scroll), `startSurpriseCombat`, `processSurpriseCombatResult`, `resumeScrollToDestination`, surprise result-panel variant. ~200 lines added. |
| `TODO.md` | **Modify** | Mark Phase 6d ✅ on completion. |
| `HISTORY.md` | **Modify** | Slim entry on completion. |

No changes to: `src/data/*` (no new dungeon fields), `src/dungeon/floor.ts` (generator unchanged), overlay scenes, save schema version.

## §5 — Test surface

Pure-TS tests:

- `surprise.test.ts`:
  - Returns `null` for combat / elite / boss destinations regardless of probability roll.
  - Returns `null` when at floor cap; cap = 1 on F1/F2, 2 on F3.
  - Probability gate fires within tolerance for many trials with a seeded RNG.
  - Encounter has 1 or 2 enemies (size distribution); always ≥1 front-liner; no `modifierIds` on any placement.
  - `scale` matches `floorScale(currentFloorNumber)`.
- `run_state.test.ts` extensions:
  - `createRunState` initializes `surprisesThisFloor: 0`.
  - `pressOn()` resets `surprisesThisFloor` to 0.
  - `completeSurpriseCombat` does NOT advance `currentNodeId`.
  - `completeSurpriseCombat` adds correct gold per floor.
  - `completeSurpriseCombat` recovers fallen-hero gear and removes fallen heroes.
  - `completeSurpriseCombat` returns wipe when party empties.

Scene-level visuals (partial scroll, mid-corridor enemy embedding, surprise result panel) follow repo convention — no unit tests; manual smoke verification.

## §6 — Phasing during implementation

Each task leaves the game in a working state.

1. **Pure-TS trigger module.** Add `surprise.ts` + tests. Add `surprisesThisFloor` field + tests + reset path. No scene changes yet. Verify all tests pass.
2. **Reward function.** Add `completeSurpriseCombat` + tests. No scene changes yet.
3. **Handoff extension.** Add `surprise` field to corridor handoff payload. Wire up `onNodeClicked` to call `rollSurprise` and branch. Skip the corridor-scene rendering for now — surprise hits log a warning and fall through to standard travel. Smoke: tick / no-tick path correctly chosen based on roll.
4. **Corridor scene surprise branch.** Implement partial scroll, mid-edge enemy embedding, `startSurpriseCombat`, `processSurpriseCombatResult` with surprise-flavored result panel, `resumeScrollToDestination`. Smoke: surprise fires; combat plays mid-corridor; scroll resumes; destination overlay opens.
5. **Polish + housekeeping.** Tune probabilities if smoke testing reveals tuning issues. Update TODO + HISTORY.

## §7 — Open questions

None. Design is locked through brainstorm dialogue (2026-05-04).
