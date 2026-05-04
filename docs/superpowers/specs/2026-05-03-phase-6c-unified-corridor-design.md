# Phase 6c — Unified Corridor (In-Action Scene) Design

**Status:** Locked design (brainstormed 2026-05-03). Subsumes the original Phase 6c scope (surprise encounters in corridor); the surprise-encounter logic itself moves to a new Phase 6d.

## §1 — Overview

Phase 6c unifies all in-dungeon-action moments into a single `'corridor'` scene (renamed from Phase 6a's `'travel'`). The scene handles travel, combat (regular + elite + boss), result/wipe panels, and node overlays (shop / camp / event / treasure) — all rendered over the corridor backdrop with camera-style scrolling. The standalone combat scene is deleted. The dungeon (map) scene is reduced to its core role: between-travel navigation surface where the player picks the next node.

The user-facing effect: no jarring screen swap during gameplay. The map appears only when the player needs to choose a path; the rest of the game happens in the corridor.

## §2 — Locked design

### §2.1 Scene structure

- **Rename `travel` scene → `corridor` scene.** Phaser key changes from `'travel'` to `'corridor'`. The scene is no longer just about travel — it hosts all in-dungeon-action UI.
- **Delete combat scene file** (`src/scenes/combat_scene.ts`). Its responsibilities are absorbed by the corridor scene; the standalone combat scene becomes dead code.
- **Dungeon scene's role narrows** to "the map." It renders the map graph (nodes, edges, fog-of-war), handles next-row click selection, and transitions to corridor scene. It no longer shows result panels, wipe panels, or hosts combat.
- **Overlay scenes** (camp_node, shop, event, treasure) change parent from `'dungeon'` to `'corridor'`. They launch over the corridor backdrop; close → resume corridor.

### §2.2 Camera scrolling

- **Heroes are static** at fixed x positions matching combat's `PARTY_X = [-, 400, 320, 240, 160]`. Slot 1 (frontmost) at x=400, slot 2 at x=320, slot 3 at x=240. y is the ground line (`GROUND_Y = 480` — matched to combat's existing value, NOT travel's prior 380).
- **The world scrolls left** during travel. A "world container" holds the scrollable backdrop (tile floor + ceiling band + decoration sprites like pillars/torches). The container tweens left by `WORLD_SCROLL_DISTANCE = 200px` (matches Phase 6a's existing `WALK_DISTANCE` so the perceived motion magnitude is unchanged) over the travel duration (`TOTAL_TRAVEL_MS / walkSpeed`).
- **Decoration content uses placeholders for now:**
  - **Floor tile pattern:** alternating colored rectangles (e.g., `#1a1020` / `#251530`) tiled along the ground band. ~32px per tile.
  - **Pillar/torch sprites:** simple placeholder rectangles (~8px wide × 40px tall) at every Nth tile position. Positions defined in a const array; real art drops in by replacing the placeholder Rectangle with a Phaser Image of the same dimensions.
- **Hero bob/rotate animations** stay (vertical sine on the hero container, rotation sine on the inner paperdoll only — so the HP bar doesn't tilt).

### §2.3 Hero rendering — `CombatActor` throughout

- **Heroes are rendered using `CombatActor` from `src/render/combat_actor.ts`** (not bare `Paperdoll`). Provides paperdoll + name label + HP bar + status strip + outline in one container.
- **Bob** applies to the `CombatActor` container (vertical sine, ±3px, ~500ms period, phase-offset per slot).
- **Rotate** applies to the actor's inner paperdoll only (±5°, ~500ms period, same phase). The HP bar and name label do NOT tilt.
- **HP bar updates** are unified: the per-edge HP tick (Phase 6a) and combat damage write to the same `CombatActor.setHp()` call. No more separate "travel HP bar" code path.
- **Names visible during travel** — useful for chatter attribution (clear which hero is speaking) and consistent with combat scene visual language.

### §2.4 Enemy entrance — embedded in scrolling world

- **Enemies are positioned within the scrolling world container at the destination's x-offset.** As the world scrolls left, the enemy enters view from the right naturally. Scroll completes → enemy lands at standard `ENEMY_X = [-, 560, 640, 720, 800]` positions → combat starts.
- **No separate slide-in tween.** The world scroll IS the entrance.
- **For non-combat destinations** (shop / camp / event / treasure): no enemy in the world container. Scroll completes; corridor scene opens the appropriate overlay (camp_node, shop, etc.).
- **For Phase 6d surprise encounters:** enemies are inserted into the world container at any x-offset along the way (mid-scroll). They become visible as scroll progresses. When scroll passes the enemy's position, scroll halts at that position and combat starts in-place. Phase 6c builds the infrastructure to support this; Phase 6d adds the RNG triggers.

### §2.5 Combat in corridor

- **Combat playback runs in the corridor scene.** `CombatPlayback` (from `src/combat/combat_playback.ts`) is reused as-is. The corridor scene constructs `CombatActor` instances for the enemy side at scroll-completion time and feeds them to `CombatPlayback` alongside the existing hero actors.
- **Combat HUD** (round counter, action log) appears at scroll-completion (combat start) and disappears at result-panel-dismiss. Mirrors combat scene's current positioning (round counter top-center, action log below).
- **Speed control:** combat playback uses `Preferences.combatSpeed` (existing preference; unchanged). The combat-speed FF toggle appears top-right during combat. Walk-speed FF toggle (existing in travel) is hidden during combat. Both prefs persist independently.
- **Result panel** renders in corridor on combat win. Same panel as today (gold + loot + per-hero HP delta). Click to dismiss → if next node is the boss-cleared state, transition to camp_screen scene; else transition to dungeon scene for fork pick.
- **Wipe panel** renders in corridor on combat defeat. Same panel as today (Heroes Fallen / Lost). Click "Return to Camp" → camp scene (existing wipe path).

### §2.6 Per-step events during travel only

- **HP popups** (Phase 6a per-edge tick): fire only during the travel portion of corridor scene. Suppressed during combat (combat damage uses standard combat HP bar updates and damage popups inside `CombatPlayback`).
- **Speech bubbles** (Phase 6b chatter): fire only during travel. Suppressed during combat.
- **Phase 6d surprise encounters** will fire during travel and pause it for combat.

### §2.7 First-node entry

- **No walk-in tween.** When the corridor scene starts a fresh expedition (`traversedNodeIds.length === 1`), it renders directly with heroes in their static positions and the start-node enemy already in place (positioned via the same scrolling-world mechanism, but with zero scroll).
- **Phase 4 `awaitingEngage` click gate stays** — player clicks the start node visual (or a dedicated "Engage" button) to begin the first combat. The gate now lives in the corridor scene instead of the dungeon scene.

### §2.8 Non-combat node overlays

- **Camp node overlay, shop overlay, event overlay, treasure overlay** all change parent scene from `'dungeon'` to `'corridor'`. Implementation: each overlay scene's `closeAndResume()` (or equivalent) calls `scene.resume('corridor')` instead of `scene.resume('dungeon')`. The overlay scenes themselves don't render the corridor — they just expect to close back to it.
- **The corridor scene's pause/resume cycle** handles overlay launches the same way the dungeon scene does today: `scene.launch('shop_overlay')` + `scene.pause()` then resume on overlay close.

### §2.9 Run-state mutation timing (carry from Phase 6a)

- The pre-travel `applyTravelTick` in `dungeon_scene.ts:onNodeClicked` moves to `dungeon_scene.ts` (where the click happens). Then `scene.start('corridor')` with the same handoff pattern. State mutation timing unchanged.

### §2.10 Edge cases

- **Boss combat:** rendered in corridor like any other. The bigger boss sprite (32×32) is created via `CombatActor` with the existing `bossSprite` pathway.
- **Press-on after boss:** dungeon scene's pressOn handler stays; corridor scene starts fresh on the new floor.
- **Reload mid-corridor:** state is consistent (HP tick was applied pre-travel in Phase 6a). On reload, dungeon scene starts → corridor scene starts (since the player is in_dungeon at a node) → renders heroes + destination state.
- **Cashout from camp overlay:** existing flow; overlay returns CashoutOutcome → transitions to camp scene as today.

## §3 — Out of scope

- **Phase 6d (new):** RNG-driven surprise encounters during travel toward non-combat nodes. Builds on the in-corridor combat infrastructure shipped here.
- **Real art for backdrop tiles / pillars / torches:** placeholders only this phase. New art adoption is a Cluster C polish task.
- **Walk-speed / combat-speed preference unification:** kept separate this phase. Could be merged into a single "game speed" preference later if user requests.
- **Camera-following vs fixed centering:** heroes always at fixed x positions; no dynamic camera following individual heroes.
- **Background parallax (multi-layer scrolling at different speeds):** single-speed scroll only. Could be polished later.

## §4 — Files affected

| Path | Action | Purpose |
|---|---|---|
| `src/scenes/travel_scene.ts` | **Rename + heavy modify** → `src/scenes/corridor_scene.ts` (use `git mv` to preserve history). Class `TravelScene` → `CorridorScene`. Phaser key `'travel'` → `'corridor'`. Adds: scrolling world container, CombatActor heroes, enemy embedding, combat playback integration, result/wipe panels, HUD modes (travel HUD vs combat HUD), no-walk first-node mode. ~600-700 lines after rewrite. |
| `src/scenes/combat_scene.ts` | **Delete** | Responsibilities absorbed. |
| `src/scenes/dungeon_scene.ts` | **Modify** | `onNodeClicked` calls `scene.start('corridor')` (instead of `'travel'`). `create()` still has the "return from corridor → fork pick" branch but no longer holds result/wipe panels (move to corridor). Removes: `processCombatReturn`, `buildResultPanel`, `buildWipePanel`, `onResultDismiss`, `onWipeReturn`, awaitingEngage click gate (moves to corridor). ~200 lines net reduction. |
| `src/scenes/travel_handoff.ts` | **Rename** → `src/scenes/corridor_handoff.ts` (use `git mv`). Same module, renamed for clarity. |
| `src/scenes/combat_handoff.ts` | **Delete** | Combat result no longer crosses scene boundaries (corridor scene runs combat AND shows result panel). |
| `src/scenes/camp_node_overlay_scene.ts` | **Modify** | Replace `scene.resume('dungeon')` with `scene.resume('corridor')`. ~1 line. |
| `src/scenes/shop_overlay_scene.ts` | **Modify** | Same. |
| `src/scenes/event_overlay_scene.ts` | **Modify** | Same. |
| `src/scenes/treasure_room_overlay_scene.ts` | **Modify** | Same. |
| `src/main.ts` | **Modify** | Replace `TravelScene` import and registration with `CorridorScene`. Remove `CombatScene` import + registration. |
| `src/data/dungeons.ts` / etc. | **No change** | Data layer untouched. |
| `TODO.md` | **Modify** | Mark Phase 6c ✅; add new Phase 6d entry. |
| `HISTORY.md` | **Modify** | Slim entry. |

## §5 — Test surface

The scene-level changes are not unit-tested per repo convention (Phaser scenes use manual smoke tests). The pure-TS pieces unaffected:

- `applyTravelTick` (Phase 6a) — already tested.
- `CHATTER` data + `computeChatterCondition` (Phase 6b) — already tested.
- `CombatPlayback` and combat engine — already tested at the engine level.

Tests likely to BREAK:
- Any tests that import `combat_scene.ts` directly. Likely none — combat scene is a Phaser scene; not unit-tested.
- Any tests that reference scene keys by string `'combat'` or `'travel'`. Likely none in core tests; might exist in scene tests.

**Phaser scene tests that test scene-key transitions** — none expected; the scenes themselves aren't unit-tested.

## §6 — Phasing during implementation

This is a substantial refactor. Recommended task order in the implementation plan:

1. **Rename + scaffold:** `git mv` travel_scene → corridor_scene, travel_handoff → corridor_handoff. Update imports, `main.ts` registration, dungeon scene `scene.start` call, and overlay scene parents. Smoke: existing flow works with renamed scene; no behavior change.
2. **Coordinate alignment:** Move corridor scene's `GROUND_Y` from 380 → 480 to match combat. Adjust hero positions, HP bar y, popup y, chatter bubble y. Smoke: travel still works; visuals shift down.
3. **Camera scroll:** Heroes static; introduce scrolling world container with placeholder pillar/torch + tile pattern. Smoke: heroes don't move; world scrolls past them.
4. **CombatActor heroes:** Replace Paperdoll-only hero visuals with CombatActor instances. HP bars + names visible during travel. Smoke: travel renders heroes via CombatActor.
5. **Enemy embedding + combat in corridor:** Embed enemies in scrolling world; wire CombatPlayback into corridor scene; combat HUD modes; combat plays in corridor. Result and wipe panels in corridor. Combat scene file deleted. Smoke: full combat flow in corridor.
6. **First-node entry no-walk:** Corridor scene handles `traversedNodeIds.length === 1` case (no scroll, click-to-engage gate). Smoke: fresh expedition starts in corridor.
7. **Housekeeping:** TODO + HISTORY.

Each task leaves the game in a working state.

## §7 — Open questions

None. Design is locked through brainstorm dialogue (2026-05-03).
