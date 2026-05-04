# Phase 6a — Travel Scene + Per-Step HP Changes Design

**Status:** Locked design (brainstormed 2026-05-03). Decomposed from TODO.md Cluster B · 30 Phase 6+. Phase 6b (hero chatter) and Phase 6c (surprise encounters with in-corridor combat) layer onto the per-step infrastructure built here.

## §1 — Overview

Phase 6a builds a dedicated `'travel'` scene that plays between map-node transitions, replacing the Phase 4 inline `walking_to_next` tween in `dungeon_scene.ts`. Heroes appear as bobbing/rotating sprites walking left-to-right across a corridor; one HP tick fires per edge as the first per-step event. The scene establishes the per-step timing infrastructure that Phase 6b and Phase 6c will hook into.

## §2 — Locked design

### §2.1 Scene architecture

- **New `'travel'` scene** that fully replaces the dungeon scene during travel. Map → travel → map flow via `scene.start`. No overlay; full scene swap matches existing pattern (combat scene already does this).
- **Triggered from** `dungeon_scene.ts:onNodeClicked` after `chooseNextNode`. The pre-Phase-6a flow `setState('walking_to_next')` is replaced with `scene.start('travel', sceneData)`.
- **Phase 6c forward-compat:** in-corridor combat will be a future sub-scene/overlay launched ON the travel scene; Phase 6a doesn't need to integrate that yet, but the travel scene's design must not preclude it (e.g., the walk tween must be pause-able).

### §2.2 Visual layout

- **Backdrop:** solid dark purple `0x1a1020` (matches `dungeon_scene.ts` background), horizontal ground line at hero-feet height, subtle vertical gradient (lighter band at top suggesting "ceiling," darker midline) drawn via two thin rectangles. No new art.
- **Hero arrangement:** single-file front-to-back along x axis, mirroring combat's `PARTY_X = [0, 400, 320, 240, 160]`. Slot 1 (frontmost) on the right (~x=400), slot 3 (back) on the left (~x=240). Heroes face right (their walking direction). y is the ground line.
- **Animation per hero:** vertical bob (±~3px sine wave, period ~1s) + rotation (±~5° sine wave, period ~1s, phase-offset per hero so they bob/rotate out of sync — looks more natural). No walk-cycle frames; reuses existing static body sprites + paperdoll layers.
- **Per-hero HP bar:** reuse combat scene's `combat_actor.ts` HP bar pattern (small rectangle below feet, fill width = `currentHp / maxHp`, color graded by ratio). Live-updates when HP ticks fire.
- **HP tick popup:** floating "+1" (green `#4caf50`) or "-1" (red `#cc6666`) text above the affected hero's head, fades out over ~500ms via tween (alpha 1 → 0, y -10). Skipped entirely if a hero has no delta (e.g., healthy hero at maxHp).
- **HUD:** floor info top-left, pack info top-right, walk-speed toggle top-right below pack — same positions as dungeon scene's HUD. No bottom status bar (heroes are visible with HP bars; bottom text would be redundant).

### §2.3 Step structure

- **5 steps per edge × 1.5s/step = 7.5s per edge at 1× walkSpeed.** At 3× walkSpeed = 2.5s per edge. `Preferences.walkSpeed` carries over from the map scene; the toggle is visible in the travel scene's chrome.
- **Steps are timing markers, NOT visual pauses.** The hero sprites tween left-to-right continuously over the full 7.5s — no stop-and-go. Per-step events (HP tick at step 3 in Phase 6a; chatter at step 2/4 in Phase 6b; encounter at any step in Phase 6c) fire as overlays/popups while the walk continues.
- **Phase 6a fires only one event per edge:** the HP tick at step 3 (midpoint, ~3.0s into the 7.5s travel at 1×).

### §2.4 Per-edge HP tick mechanic

- **Trigger condition (per hero, evaluated once per edge):**
  - Hero has ≥1 wound (`hero.wounds.length > 0`) → take **-1 HP**.
  - Hero has 0 wounds → gain **+1 HP**.
- **Heal cap:** `newHp = min(maxHp, currentHp + 1)`. A healthy hero at maxHp shows no popup.
- **Damage floor:** `newHp = max(1, currentHp - 1)`. **Travel chip damage CANNOT kill** a hero — cannot reduce HP to 0 or below. A wounded hero at 1 HP arriving at a combat node enters that combat at 1 HP and is in danger from any hit, but travel itself never delivers the killing blow.
- **Side effect:** `appState.update(...)` with new party HP values. Persists to localStorage immediately (existing `save()` invariant).

### §2.5 State mutation timing — pre-travel, not mid-travel

- **HP tick is applied in `dungeon_scene.ts:onNodeClicked` BEFORE calling `scene.start('travel', ...)`.** A new pure-TS helper `applyTravelTick(rs): { runState, deltas }` runs in `run_state.ts`. Returns the new run state and `deltas: readonly number[]` indexed parallel to `runState.party` — each entry is `-1`, `0`, or `+1` for the corresponding hero. (Index-parallel keeps the popup-rendering loop simple: iterate party, look up delta by index, position popup over the matching slot sprite.)
- **The deltas are passed as scene data to the travel scene** (similar to the existing `combat_handoff` pattern, but inline via scene init data). The travel scene reads the deltas to render popups at step 3, but the state is already mutated.
- **Why pre-travel mutation:** if the user closes the browser mid-travel, the saved state must be consistent. Applying the tick BEFORE the scene starts means the destination-state is fully consistent regardless of when the user closes. The travel scene is purely visual at that point.
- **Trade-off acknowledged:** if the user closes mid-travel and reopens, they'd reload at the destination with the new HP applied (rather than seeing the tick happen mid-travel). This is acceptable — closing mid-travel is rare and the state is internally consistent.

### §2.6 Walk-in special case

- **Dungeon entry** (`traversedNodeIds.length === 1`) does NOT use the travel scene. The existing walk-in tween in `dungeon_scene.ts` plays as today: party token tweens from `PARTY_OFFSCREEN_X` to the start node, then `handleWalkInArrival` fires the Phase 4 `awaitingEngage` click gate.
- **Rationale:** there's no "from" node to traverse from on entry — the travel scene's framing (walking from one map node to another) doesn't apply. Walk-in is a different visual moment.

### §2.7 Return from travel

- **When the travel scene's walk completes, it calls `scene.start('dungeon')`.**
- **Dungeon scene's `create()` distinguishes "return from travel" from other entry paths** by checking: no combat handoff present AND `traversedNodeIds.length > 1`. In that case:
  - Snap party token to `currentNodeId` position (no walk-in tween).
  - Immediately fire `handleArrival` to engage the destination (combat starts / overlay opens).
  - The Phase 4 `awaitingEngage` gate does NOT fire — the player already chose this node by clicking it on the map; auto-engage on arrival is consent-aligned.

### §2.8 Speed control

- `Preferences.walkSpeed: 1 | 3` (added in Phase 4) carries over to the travel scene.
- Per-step duration of 1.5s is divided by `walkSpeed`. At 3×, each step is 0.5s; full edge is 2.5s.
- Toggle button + F key binding visible in the travel scene's chrome (mirror the dungeon scene's FF UI; same persistence path via `appState.update`).

### §2.9 Edge cases

- **All heroes at maxHp with no wounds:** travel scene plays normally, HP tick fires at step 3, no popups appear (no deltas), HP bars stay full. Visually a "quiet" travel.
- **All heroes at 1 HP with wounds:** floor-at-1 prevents any deaths. HP tick fires, all show "-1" popups, but HP bars stay at 1. Heroes arrive at destination at 1 HP.
- **Mixed party (some wounded, some not):** each hero independent. Wounded heroes show "-1," unwounded show "+1" (or no popup if at maxHp).
- **Reload mid-travel:** state is already mutated (per §2.5), so reload returns the player to the dungeon scene at the destination node (via the §2.7 return path). The travel animation is skipped on reload.

## §3 — Out of scope (Phase 6b / 6c)

- **Hero chatter bubbles (Phase 6b):** will hook into step 2 and/or step 4 timings. Probabilistic — not every travel has chatter. Pure flavor; no state mutation.
- **Surprise encounters with in-corridor combat (Phase 6c):** RNG-driven. When triggered, pause the walk tween, spawn enemy sprites on the right side of the corridor, launch the combat scene as an overlay/sub-scene that uses the travel scene's backdrop. Win → resume walking. Wipe → standard wipe path. This is the largest remaining sub-feature.

## §4 — Files affected

| File | Action | Purpose |
|---|---|---|
| `src/scenes/travel_scene.ts` | **Create** | New scene. ~250-300 lines. Backdrop, hero sprites with bob/rotate, per-hero HP bars, HP popups at step 3, walk-speed toggle. |
| `src/scenes/dungeon_scene.ts` | **Modify** | `onNodeClicked` calls `applyTravelTick` then `scene.start('travel', { deltas })` instead of `setState('walking_to_next')`. `create()` adds a "return from travel" branch (no walk-in re-tween, snap + auto-engage). |
| `src/run/run_state.ts` | **Modify** | New pure-TS `applyTravelTick(rs): { runState, deltas }` helper. Per-hero ±1 with cap/floor. |
| `src/run/__tests__/run_state.test.ts` | **Modify** | Unit tests for `applyTravelTick`: wounded → -1 floored at 1, unwounded → +1 capped at maxHp, mixed party, edge cases (1 HP wounded, maxHp unwounded). |
| `src/main.ts` | **Modify** | Register the new `'travel'` scene with Phaser. |

## §5 — Test surface

**Pure-TS unit tests (`applyTravelTick`):**
- Hero with 0 wounds at maxHp/2: `+1` → maxHp/2 + 1
- Hero with 0 wounds at maxHp: `0` (no change, no delta in returned map)
- Hero with 1 wound at half HP: `-1` → half - 1
- Hero with 1 wound at 1 HP: `0` (floored — no change, no delta)
- Hero with 3 wounds: still `-1` (per-hero binary, not per-wound)
- Mixed 3-hero party: deltas map has correct per-hero entries (combination of wounded/unwounded)
- Pure (does not mutate input runState)
- Returned `runState` reflects updated party HP

**Scene-level:** visual smoke test only (consistent with existing Phaser-scene testing pattern in this repo). No new scene unit tests.

## §6 — Open questions

None. Design is locked through brainstorm dialogue (2026-05-03).
