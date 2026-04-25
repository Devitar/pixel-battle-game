# Combat Scene (Tier 1)

**Status:** Design · **Date:** 2026-04-25 · **Source TODO:** Cluster B, task 17

## Purpose

Replace the dungeon scene's inline `resolveCombat` call with a dedicated combat scene that animates playback of the engine's event log. The combat scene is "the readout of all the setup decisions" (GDD §2): party formation, class kit, slot pressure, status interactions all become visible. 3 heroes vs 3–4 enemies on a single 960×540 canvas; per-event animations driven by an async loop; FF toggle (1× ↔ 3×); 800ms linger on final tableau, then control returns to the dungeon scene which keeps its existing result/wipe panels.

The dungeon scene's `startCombatAtCurrentNode` (currently calls `resolveCombat` synchronously inline — see task 16 HISTORY decisions) is refactored: it now `scene.start('combat')`s, and the dungeon scene's `create()` detects "returning from combat" via an ephemeral handoff slot and runs `completeCombat` there. The result-panel + walk-to-next + camp_screen / wipe transitions stay in the dungeon scene.

## Dependencies and invariants

**Vocabulary from prior tasks:**
- `RunState`, `currentNode`, `completeCombat`, `WipeOutcome` (task 6).
- `buildCombatState(party, encounter)` (task 6 helper, `combat_setup.ts`).
- `resolveCombat(state, rng)` returns `CombatResult` with `events: readonly CombatEvent[]` (task 4).
- `CombatEvent` union: `combat_start`, `round_start`, `turn_start`, `turn_skipped`, `ability_cast`, `shuffle`, `damage_applied`, `heal_applied`, `status_applied`, `status_expired`, `position_changed`, `death`, `round_end`, `combat_end` (task 4).
- `Paperdoll` + `heroToLoadout` (tasks 0 + 11).
- `Rng` + `createRngFromState` (task 9).
- `appState.update(producer)` for atomic save with auto-persist (task 10).
- Save invariant (task 9, `save.ts:20`): `runState` and `runRngState` must be both present or both absent.
- Dungeon scene's `walking_in` / `walking_to_next` / `showing_result` / `showing_wipe` state machine (task 16).
- `ABILITIES`, `ENEMIES` (data modules) for display names and ability metadata.

**New invariants this spec declares:**
- **Combat scene owns the engine call.** `combat.create()` reads `runState`/`runRngState` from `appState`, calls `buildCombatState` + `resolveCombat`, then animates the resulting event log. The dungeon scene no longer calls the engine.
- **Ephemeral handoff via module-level slot.** A new `combat_handoff.ts` module exposes `setCombatResult(result, rngStateAfter)` / `consumeCombatResult(): { result, rngStateAfter } | undefined`. Memory-only, never serialized to save. Single-use semantics: `consume` clears the slot.
- **Dungeon scene processes the result.** When `dungeon.create()` finds a result via `consumeCombatResult()`, it calls `completeCombat(runState, result)`, persists `{ runState: next, runRngState: rngStateAfter }` atomically via `appState.update`, then opens the existing result/wipe panel directly (no walk-in tween).
- **No `appState.update` during playback.** The combat scene never writes to `appState` until combat ends. RngState in the saved file stays stale during animation; on reload mid-playback boot routes to dungeon, dungeon launches combat scene fresh, combat replays deterministically (same seed, same rng-from-runRngState).
- **Save invariant honored at every transition.** Combat scene never calls `appState.update`; it returns `rng.getState()` via the handoff slot. The dungeon scene's `processCombatReturn` performs the single atomic update that writes `{ runState: next, runRngState: rngStateAfter }`. The save invariant is observable only at write boundaries — `runState` and `runRngState` are paired at the only write that touches either one.
- **Async playback driver, abort-safe.** A `CombatPlayback` class runs `for (const ev of events) { await dispatch(ev); }`. Every handler checks `this.aborted` and `this.scene.sys.isActive()` before doing scene work. Scene `shutdown()` flips `aborted = true` and resets `tweens.timeScale` / `time.timeScale`.
- **No new unit tests.** Following tasks 13–16's precedent, scene/render code is verified by smoke testing. Pure-logic deps (`resolveCombat`, `completeCombat`, `buildCombatState`) are already covered.

## Module layout

| Path | Action | Responsibility |
|---|---|---|
| `src/scenes/combat_scene.ts` | **Create** | Phaser scene shell. `create()` reads run state, runs the engine, builds layout, kicks off `CombatPlayback`. ~150 lines. |
| `src/scenes/combat_playback.ts` | **Create** | `class CombatPlayback`. Async event-driven driver with per-event handlers, look-ahead batching for AoE / collapse, FF speed setter. ~280 lines. |
| `src/scenes/combat_handoff.ts` | **Create** | Module-level ephemeral slot. `setCombatResult(result, rngStateAfter)` / `consumeCombatResult()`. ~25 lines. |
| `src/render/combat_actor.ts` | **Create** | `class CombatActor extends Phaser.GameObjects.Container`. Wraps `Paperdoll` (heroes) or `EnemyPlaceholder` (enemies); owns name text, HP bar, status strip, hit-flash, lunge, pulse, damage-number spawn. ~180 lines. |
| `src/render/enemy_placeholder.ts` | **Create** | Placeholder enemy rendering until task 19 ships real sprites. 16×24 colored rect tinted by role + name text. ~60 lines. |
| `src/scenes/dungeon_scene.ts` | **Modify** | Refactor `startCombatAtCurrentNode` to `scene.start('combat')`; restructure `create()` to detect returning-from-combat via `consumeCombatResult()` and process result there. The `preCombatHp` field stays — it's now populated at scene-entry-from-combat instead of pre-combat. |
| `src/main.ts` | **Modify** | Register `CombatScene` after `DungeonScene` and before `CampScreenScene`. |

**Imports for `combat_scene.ts`:** `phaser`, `appState`, `currentNode` from run/run_state, `buildCombatState` from run/combat_setup, `resolveCombat` from combat/combat, `createRngFromState` from util/rng, `setCombatResult` from combat_handoff, `CombatActor` from render/combat_actor, `CombatPlayback` from combat_playback, `ABILITIES` from data/abilities (for action-log strings), `ENEMIES` from data/enemies (for display names).

**Imports for `combat_playback.ts`:** `phaser`, `CombatEvent` + `CombatResult` types, `ABILITIES`, `ENEMIES`, `CombatActor`. **No** `appState`, no `runState` access — driver is fed everything it needs by the scene.

**Imports for `combat_actor.ts`:** `phaser`, `Paperdoll`, `EnemyPlaceholder`, status-letter mapping (inlined here).

**Imports for `enemy_placeholder.ts`:** `phaser`, `ENEMIES`, `EnemyId`.

**Phaser firewall:** all five new files live under `src/scenes/` or `src/render/` and may import phaser. The combat engine, run state, and data modules are read-only from the scene side. ✓

## Layout (coordinates inside 960×540 viewport)

| Element | Position | Size | Notes |
|---|---|---|---|
| Background fill | (0, 0) origin | 960×540 | `#1a1020` solid (matches dungeon scene tone) |
| Ground line | (0, 480) origin | 960×1 strip `#555` | visual continuity with dungeon |
| Round counter | (480, 24) center | 16px monospace `#aaaaaa` | `Round {N}` |
| Round banner (transient) | (480, 200) center | 32px gold `#ffcc66`, alpha 0 by default | `Round {N}`, fades in/out per round_start |
| FF toggle button | (940, 24) origin (1, 0) | 60×24 rect + label | "1×" / "3×" (cyan border `#44cc44` when 3×) |
| Action log | (480, 510) center | 12px `#ffffff`, max width 920 | single-line current-event description |
| Party combatants | x = 400 / 320 / 240, y = 300 | 3× `CombatActor`s, paperdoll scale 3 | slot 1 closest to enemies (rightmost on player side) |
| Enemy combatants | x = 560 / 640 / 720 / 800, y = 300 | 3 or 4 `CombatActor`s, placeholder scale 3 | slot 1 closest to party (leftmost on enemy side) |

**Center gap:** front-line spacing is x=400 (party slot 1) to x=560 (enemy slot 1) → 160px. Comfortable for melee lunge animations (±20px).

**`CombatActor` internal layout** (positions relative to its own (0, 0)):
- `body` — `Paperdoll` (hero) or `EnemyPlaceholder` (enemy), centered.
- `nameText` — 9px monospace `#ffffff`, at (0, −56) center.
- `hpBarBg` — 56×4 rect `#333333`, at (0, −44) center.
- `hpBarFill` — 56×4 rect (color by ratio: green `#44aa44` >50%, yellow `#aaaa44` >25%, red `#aa4444` ≤25%), origin (0, 0.5), anchored at (−28, −44).
- `hpText` — 8px monospace `#cccccc`, at (0, −38) center, format `{cur}/{max}`.
- `statusStrip` — `Container` at (0, 38) center, holds 0..N letter `Text` glyphs spaced 10px apart, recentered on add/remove.
- `actorOutline` — 60×80 rounded rect outline, stroke `#ffcc66` 2px, alpha 0 by default. Shown when this actor is the currently-acting combatant.

**Status letter glyphs** (the 7 statuses in Tier 1 play):

| Status ID | Letter | Color |
|---|---|---|
| `stunned` | `S` | `#ff9944` |
| `bulwark` | `B` | `#44aacc` |
| `taunting` | `T` | `#ffcc44` |
| `marked` | `M` | `#cc4444` |
| `blessed` | `+` | `#ffdd66` |
| `rotting` | `r` | `#aa44aa` |
| `frailty` | `−` | `#888888` |

Statuses without a mapping fall back to `?` `#888888`. Tier 2 status additions extend the mapping; this spec doesn't cover that.

**Enemy placeholder** (`enemy_placeholder.ts`):
- 16×24 rect, scale 3 → 48×72 visual.
- Tint: `ENEMIES[id].role === 'boss'` → `#882222`; else `#664444`.
- Name text below the rect (handled by `CombatActor`).
- No facing flip in Tier 1 (rect is symmetric). When task 19 lands real sprites, `EnemyPlaceholder` gets a `setFlipX(true)` so enemies face the party.

**Boss visual scaling** (placeholder world): enemy placeholder for `bone_lich` is rendered at 1.5× the minion scale. The `CombatActor` for the boss respects this: its body is `EnemyPlaceholder` scale 1.5, but slot positioning is unchanged. (Task 19 will likely revisit this once real sprites exist.)

## Data flow

### Cold dungeon entry (no combat result pending)

```
boot → dungeon.create()
  consumeCombatResult() → undefined
  setState('walking_in') → tween → on complete → scene.start('combat')
```

### Combat scene lifecycle

```
combat.create():
  run = appState.get().runState
  rng = createRngFromState(appState.get().runRngState!)
  combatState = buildCombatState(run.party, currentNode(run).encounter)
  result = resolveCombat(combatState, rng)         // engine call
  build layout (background, HUD, actors, FF button)
  playback = new CombatPlayback(this, result.events, actors, hud, runningState)
  playback.run().then(() => onPlaybackComplete(result, rng))

onPlaybackComplete(result, rng):
  setCombatResult(result, rng.getState())
  scene.start('dungeon')
```

### Returning from combat

```
combat.scene.start('dungeon')
  → dungeon.create()
    handoff = consumeCombatResult() → { result, rngStateAfter }
    preCombatHp = Map(run.party.map(h => [h.id, h.currentHp]))    // snapshot pre-completeCombat
    { runState: next, wipe } = completeCombat(run, result)
    appState.update(s => ({ ...s, runState: next, runRngState: rngStateAfter }))
    position party at the just-completed node (skip walking_in tween)
    if wipe: setState('showing_wipe')
    else:    setState('showing_result')
```

The `preCombatHp` snapshot replaces today's same-named field. It's populated at scene-entry-from-combat (after `consumeCombatResult`, before `completeCombat`) by reading `runState.party` (which still holds pre-combat HP at that moment). After `completeCombat` runs, `runState.party` is post-combat — but we already snapshotted, so the result panel can compute deltas.

### Save invariant per transition

| Transition | Atomic update | runState | runRngState |
|---|---|---|---|
| Cold dungeon → combat (`scene.start('combat')`) | none | unchanged | unchanged |
| Combat playback running | none | unchanged | stale on disk; advanced in memory by combat scene |
| Combat end → dungeon (`scene.start('dungeon')`) | none in combat scene; module slot only | unchanged | unchanged on disk |
| Dungeon `create()` after return | `{ runState: next, runRngState: rngStateAfter }` | advanced | advanced (paired) |

The trick: combat scene doesn't write to `appState` itself. It returns the rng state via the handoff slot. The dungeon scene does the single atomic write that pairs `runState` (advanced by `completeCombat`) and `runRngState` (advanced by combat playback). Save invariant ✓ at every observable point.

### Reload mid-playback (recovery analysis)

1. Save on disk has pre-combat `runState` + pre-combat `runRngState`.
2. Reload: boot routes to `'dungeon'` (runState present).
3. Dungeon `create()`: handoff is empty (module-level state is in-memory only).
4. Dungeon enters cold-entry path: `setState('walking_in')`.
5. Walk-in completes: `scene.start('combat')`.
6. Combat scene rebuilds combat state from runState (same), restores rng from runRngState (same), calls `resolveCombat` (same outcome — deterministic).
7. Player sees the combat animation again. Acceptable.

The cost is "player watches the same fight twice" if they reload mid-fight. Not worth more elaborate recovery for Tier 1.

## `combat_handoff.ts`

```ts
import type { CombatResult } from '../combat/types';

let pending: { result: CombatResult; rngStateAfter: number } | undefined;

export function setCombatResult(result: CombatResult, rngStateAfter: number): void {
  pending = { result, rngStateAfter };
}

export function consumeCombatResult(): { result: CombatResult; rngStateAfter: number } | undefined {
  const out = pending;
  pending = undefined;
  return out;
}
```

That's the entire module. Single-use semantics — `consume` returns the slot's contents and clears it. If somehow consumed twice (logic bug), the second read returns `undefined`; dungeon scene falls through to cold-entry path. Fail-safe.

## `CombatPlayback` driver

### Construction

```ts
new CombatPlayback(scene, events, actors, hud, runningState)
```

- `scene: CombatScene` — for `tweens`, `time`, `add`, `sys.isActive()`.
- `events: readonly CombatEvent[]` — the engine output.
- `actors: Map<CombatantId, CombatActor>` — built by the scene.
- `hud: { roundCounter, roundBanner, actionLog, ffButton }` — references to scene-built HUD elements.
- `runningState: Map<CombatantId, { hp, maxHp, slot, statuses: Set<StatusId>, isDead, side, displayName }>` — the playback-time mirror of combatant state. Initialized from the initial `CombatState` (pre-resolve, full HP, alive, initial slots, no statuses). The driver mutates this mirror as it processes events — see "RunningState mirror update points" below.

### RunningState mirror update points

The mirror exists because event payloads carry deltas (`amount` on `damage_applied`, `delta` on stat buffs) but not post-state snapshots. Handlers read the mirror to compute "before" values and write back the new state.

| Event | Mirror reads | Mirror writes |
|---|---|---|
| `combat_start` | — | initialize entry per combatant from initial CombatState |
| `damage_applied` | `target.hp` (for HP-bar tween source) | `target.hp = max(0, target.hp − amount)` |
| `heal_applied` | `target.hp`, `target.maxHp` | `target.hp = min(maxHp, target.hp + amount)` |
| `status_applied` | — | `target.statuses.add(statusId)` |
| `status_expired` | — | `target.statuses.delete(statusId)` |
| `position_changed` | — | `target.slot = toSlot` (or `−1` for `reason='collapse'` of dead actor — handled by the death event) |
| `death` | — | `target.isDead = true; target.statuses.clear()` |
| all others | — | — |

Mirror is read-only outside the driver. Scene-side reads (e.g., for "what's the current HP" debugging) should read off `actors.get(id).getCurrentHp()` instead, so the rendered state and the mirror stay in lockstep.

### Speed control

```ts
private speed = 1;
setSpeed(s: 1 | 3): void {
  this.speed = s;
  this.scene.tweens.timeScale = s;
  this.scene.time.timeScale = s;
}
```

Toggling FF immediately accelerates in-flight tweens and any pending `delayedCall`. Scene `shutdown()` resets both to 1.0 so the dungeon scene starts at normal speed.

### Helpers

```ts
private tweenAsync(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise(resolve => {
    this.scene.tweens.add({ ...config, onComplete: () => resolve() });
  });
}

private delay(ms: number): Promise<void> {
  return new Promise(resolve => this.scene.time.delayedCall(ms, () => resolve()));
}

private duration(base: number): number {
  // tweens / time already get scaled by timeScale; this just makes per-event base durations explicit.
  return base;
}
```

### Main loop

```ts
async run(): Promise<void> {
  this.i = 0;
  while (this.i < this.events.length) {
    if (this.aborted || !this.scene.sys.isActive()) return;
    const ev = this.events[this.i];
    const consumed = await this.dispatch(ev);  // returns count of events consumed (>=1)
    this.i += consumed;
  }
  await this.delay(800);  // final tableau linger
  this.onComplete?.();
}
```

The cursor `this.i` is explicit so look-ahead batching can advance it by multiple events.

### Event dispatch + per-event handlers

```ts
async dispatch(ev: CombatEvent): Promise<number> {
  switch (ev.kind) {
    case 'combat_start':     return this.onCombatStart(ev);
    case 'round_start':      return this.onRoundStart(ev);
    case 'turn_start':       return this.onTurnStart(ev);
    case 'turn_skipped':     return this.onTurnSkipped(ev);
    case 'ability_cast':     return this.onAbilityCast(ev);  // may batch following damage_applieds
    case 'shuffle':          return this.onShuffle(ev);
    case 'damage_applied':   return this.onDamage(ev);        // when reached non-batched (rare)
    case 'heal_applied':     return this.onHeal(ev);
    case 'status_applied':   return this.onStatusApplied(ev);
    case 'status_expired':   return this.onStatusExpired(ev);
    case 'position_changed': return this.onPositionChanged(ev);
    case 'death':            return this.onDeath(ev);          // batches following collapses
    case 'round_end':        return this.onRoundEnd(ev);
    case 'combat_end':       return this.onCombatEnd(ev);
  }
}
```

**Per-event durations and visuals** (all at 1×; FF scales via timeScale):

| Event | Duration | Visual |
|---|---|---|
| `combat_start` | 0 | initialize runningState mirror; render initial HP bars at full |
| `round_start` | 400ms | round banner alpha 0→1 (100ms) → hold (100ms) → 1→0 (200ms); round counter text update |
| `turn_start` | 100ms | actor outline alpha 0→1 on current combatant; previous outline fades out |
| `turn_skipped` (`stunned`) | 250ms | spawn `Z` glyph above actor, floats up + fades |
| `turn_skipped` (`dead`) | 0 | no-op |
| `ability_cast` (melee, single target) | 350ms | caster lunge ±20px toward target side; action log update; consumes 1 event |
| `ability_cast` (ranged, single target) | 250ms | caster scale-pulse 1.0→1.1→1.0; consumes 1 event |
| `ability_cast` (AoE, multi-target) | 350ms | caster pulse + simultaneous flash on all damage-events that follow with same caster; consumes 1 + N damage events |
| `shuffle` | 200ms | brief x-jiggle on combatant; action log: "{name} shuffles" |
| `damage_applied` (standalone) | 200ms | target hit-flash 100ms + HP bar tween 200ms + damage number floats up 400ms (overlapping); action log appended |
| `heal_applied` | 200ms | target green-tint flash + HP bar tween + green number floats up; action log update |
| `status_applied` | 150ms | letter glyph pops into status strip (scale 1.3→1.0) |
| `status_expired` | 100ms | letter glyph fades out, removed from strip |
| `position_changed` (single) | 300ms | actor x tween to new slot position |
| `position_changed` (collapse, batched) | 300ms | all collapse moves run concurrently via Promise.all; consumes N events |
| `death` | 500ms | actor body alpha 1→0 + drop y by 8px; status strip cleared. If followed by collapse(s), runs collapses concurrently after death animation completes; consumes 1 + N collapse events |
| `round_end` | 100ms | brief beat (no visual) |
| `combat_end` | 0 | end of events; outer loop appends 800ms linger |

**Total time estimate** for a typical 3v3 minion fight (~10 turns × ~6 events/turn × ~200ms avg): ~12–18s at 1×, ~4–6s at 3×.

### Look-ahead batching

**AoE detection in `onAbilityCast`:**
```ts
const ability = ABILITIES[ev.abilityId];
const isAoE = ev.targetIds.length > 1;
const isMelee = !isAoE && ability.canCastFrom.includes(1) && hasDamageEffect(ability);
```

If AoE: scan forward from `i+1` while events are `damage_applied` with `sourceId === ev.casterId`. Run them all concurrently with the caster pulse. Return `1 + N` (consumed count). Only `damage_applied` is batched — heal/buff/debuff events trail their casts sequentially (small N in practice; not worth batching at Tier 1).

**Collapse batching in `onDeath`:**
After running the death animation, scan forward from `i+1` while events are `position_changed` with `reason === 'collapse'`. Run them all concurrently (single 300ms tween on all). Return `1 + N`.

**Why batching matters:** without it, AoE fights look like a slow conga line of single hits, and a 4-enemy wipe takes 1.2s of collapses instead of 0.3s. The cursor accounting is the load-bearing piece — each batched handler returns the exact consumed count.

### Action log content

The log is a single `Text` updated per event via `setText` + brief alpha pulse (0.4 → 1.0 over 80ms). Event handlers that update it:

- `round_start`: `— Round {N} —` (gray dim style, pseudo-separator)
- `ability_cast`: `{casterName} casts {abilityName} on {targetName(s)}` (single target) or `{casterName} casts {abilityName}` (AoE / self / no-target)
- `damage_applied`: appended to last cast (e.g., ` — 4 dmg`); for batched AoE accumulates: ` — 2/3/2 dmg`
- `heal_applied`: `{casterName} casts {abilityName} on {targetName} — +6 HP`
- `status_applied`: appended ` ({statusId})` to last cast line
- `status_expired`: `{targetName} is no longer {statusId}`
- `shuffle`: `{combatantName} shuffles`
- `death`: `{combatantName} falls`
- `combat_end`: cleared (empty)

Display name resolution at playback start (populated into each `runningState` entry's `displayName`):
- For each hero combatant `p${i}`: name = `runState.party[i].name`.
- For each enemy combatant `e${j}`: name = `ENEMIES[encounter.enemies[j].enemyId].name`.

The action log reads `runningState.get(id).displayName` for every event that names a combatant.

### Caster animation heuristic

Determining lunge vs pulse for `ability_cast`:
1. If `ev.targetIds.length > 1` → AoE → no lunge, caster pulse + concurrent target flashes.
2. Else if `ABILITIES[ev.abilityId]` has any `damage` effect AND its `canCastFrom` includes slot 1 → melee → caster lunges toward target.
3. Else → ranged or non-damage cast → caster pulses in place.

This correctly classifies every Tier 1 ability:
- Melee: `knight_slash`, `shield_bash`, `priest_strike`, `smite`, `bone_slash`, `rotting_bite`, `lich_strike` (cast-from includes 1, damage effect).
- Ranged: `archer_shoot`, `piercing_shot`, `flare_arrow`, `bone_arrow`, `dark_bolt` (cast-from excludes 1).
- AoE: `volley`, `necrotic_wave` (multi-target).
- Non-damage: `bulwark`, `taunt`, `mend`, `bless`, `dark_pact`, `curse_of_frailty` (no damage effect → pulse, target gets buff/heal/debuff visual).

### Abort and shutdown

```ts
abort(): void {
  this.aborted = true;
}
```

`CombatScene.shutdown()`:
```ts
this.playback?.abort();
this.tweens.timeScale = 1;
this.time.timeScale = 1;
```

Every async handler checks `this.aborted` before scene work and after every `await`. If aborted, returns early without rendering.

## `CombatActor`

Container exposing animation primitives. Constructed once per combatant during scene build, lives until scene shutdown.

```ts
class CombatActor extends Phaser.GameObjects.Container {
  constructor(scene, x, y, kind, data)
    // kind: 'hero' | 'enemy'
    // data: { combatantId, displayName, paperdoll? | enemyId?, maxHp, currentHp, side, slot }

  // Animation API:
  lunge(toward: 'left' | 'right'): Promise<void>      // ±20px tween + return
  pulse(): Promise<void>                              // scale 1→1.1→1
  flashHit(): Promise<void>                           // body white-tint 100ms
  flashHeal(): Promise<void>                          // body green-tint 100ms
  spawnNumber(text: string, color: number): void     // floats up + fades, fire-and-forget
  setHpBar(currentHp: number, maxHp: number): Promise<void>  // tween fill + update text
  setOutline(active: boolean): void                  // alpha 0/1 instant
  addStatusGlyph(statusId: StatusId): void           // pop scale, recenters strip
  removeStatusGlyph(statusId: StatusId): void        // fade out, recenters strip
  collapse(): Promise<void>                           // alpha 1→0, drop y by 8px
  moveToSlotX(x: number): Promise<void>              // x tween
}
```

**Hit-flash on `Paperdoll`** (multi-sprite container): iterate `paperdoll.list` (the layered images), call `setTintFill(0xffffff)` on each, schedule `clearTint()` after 100ms via `delayedCall`. If this reads visually as "costume disappears" instead of "flash," fallback is alpha-flash (1.0 → 0.4 → 1.0). Pick during smoke testing; spec accepts either.

**Hit-flash on `EnemyPlaceholder`**: it's a single rect + text — `rect.setFillStyle(0xffffff)` for 100ms then back to its tint color.

## Dungeon scene refactor

**`startCombatAtCurrentNode`** becomes:
```ts
private startCombatAtCurrentNode(): void {
  this.scene.start('combat');
}
```

That's the whole body. Walk-in / walk-to-next still call this on tween-complete. The combat scene reads `runState`/`runRngState` from `appState` directly — nothing else to pass.

**`create()`** restructured:
```ts
create(): void {
  // ... existing init (rng, background, hud, nodes, party, status bar) ...

  const handoff = consumeCombatResult();
  if (handoff) {
    this.processCombatReturn(handoff.result, handoff.rngStateAfter);
  } else {
    this.setState('walking_in');
  }
}

private processCombatReturn(result: CombatResult, rngStateAfter: number): void {
  const run = appState.get().runState!;
  this.preCombatHp.clear();
  for (const hero of run.party) {
    this.preCombatHp.set(hero.id, hero.currentHp);
  }

  const { runState: nextRun, wipe } = completeCombat(run, result);
  appState.update(s => ({ ...s, runState: nextRun, runRngState: rngStateAfter }));

  // Position party at the just-completed node (no walk-in tween).
  // run.currentNodeIndex is the just-completed node for both wipe and victory cases:
  //   - wipe: completeCombat doesn't advance the index
  //   - boss victory: completeCombat sets status='camp_screen' but doesn't advance the index either
  //   - combat-node victory: completeCombat advances the index, but `run` is the pre-update state
  this.partyContainer.x = this.partyXForNode(run.currentNodeIndex);

  this.refreshHud();
  this.refreshNodeColors();
  this.refreshStatusBar();

  if (wipe) {
    this.wipeOutcome = wipe;
    this.setState('showing_wipe');
  } else {
    this.setState('showing_result');
  }
}
```

**`preCombatHp`** field stays. It's now populated at scene-entry-from-combat (in `processCombatReturn`) instead of pre-combat. `buildResultPanel` reads it unchanged. The "snapshot before completeCombat" timing is the load-bearing piece — `runState.party` at that moment still holds pre-combat HP.

**Existing `setState('showing_result')` flow** is unchanged. Result panel reads `preCombatHp` (set by `processCombatReturn`) and `run` (updated by `completeCombat`). Click-to-continue → walk-to-next → `scene.start('combat')` → cycle repeats.

**Removed:** the `resolveCombat` import, `buildCombatState` import, the inline call site in `startCombatAtCurrentNode`. The scene no longer touches the engine.

**Edge case: returning to dungeon when current node was the boss.** `completeCombat` sets `run.status = 'camp_screen'` for boss nodes; doesn't advance `currentNodeIndex`. The result panel's `isBoss = run.status === 'camp_screen'` branch (added in task 16) keeps working unchanged. After dismiss, `onResultDismiss` does `scene.start('camp_screen')` as today. ✓

## Smoke test plan

1. **Cold start, single fight.** Start a Crypt run, walk in to node 0, watch the combat scene play. Confirm:
   - Round counter updates per round.
   - Caster outline jumps on each turn.
   - Melee abilities lunge; ranged abilities pulse; AoE flashes all targets simultaneously.
   - Damage numbers float and fade.
   - HP bars tween smoothly.
   - Status glyphs appear/disappear on apply/expire.
   - Action log updates per event.
   - Combat ends with 800ms linger.
   - Returns to dungeon scene with correct result panel (HP deltas).

2. **FF toggle.** Mid-fight, press F or click the FF button. Confirm in-flight tweens accelerate immediately and remaining playback runs at 3×. Toggle back; confirms returns to 1×.

3. **Multi-fight pacing.** Walk through all 4 nodes (3 combat + 1 boss). Confirm rng advances correctly across fights (different seeds = different outcomes = same outcomes given same seed).

4. **Wipe.** Force a wipe (e.g., low-HP party against bone_lich on floor 1). Confirm:
   - Combat scene plays through to player_defeat.
   - Returns to dungeon scene.
   - Wipe panel appears with heroes-lost list.
   - Click → returns to camp; roster has lost heroes removed.

5. **Reload mid-playback.** Start a fight, reload page mid-animation. Confirm:
   - Boot routes to dungeon.
   - Dungeon walks in (cold-entry path; handoff slot is empty).
   - Combat scene replays with same outcome.

6. **Boss → camp_screen.** Defeat the boss. Confirm:
   - Result panel shows boss-tier reward (`+100g × floor`).
   - Click → `scene.start('camp_screen')`.
   - Camp screen stub shows correct gold + survivors.

## Risks

1. **Phaser tween/time `timeScale` behavior.** The spec assumes setting `scene.tweens.timeScale = 3` accelerates in-flight tweens. If it only affects newly-started tweens, FF toggle still works on next event boundary (~200ms latency) — acceptable but less snappy. Worth verifying during implementation; no fallback needed since the worse case is still functional.

2. **Async loop after scene shutdown.** Scene-end mid-tween could cause callbacks against a destroyed scene. Mitigated by `aborted` flag + `scene.sys.isActive()` check at each handler entry. The look-ahead batching's concurrent `Promise.all` could hang if the scene tears down during one of the parallel tweens — Phaser's tween destruction on shutdown should resolve them as completed. If not, the abort flag + outer-loop early return prevents work after shutdown anyway.

3. **Cursor accounting in look-ahead batching.** AoE consumes `1 + N` events; collapse consumes `1 + M` events. Off-by-one bugs here cause double-rendering or skipped events — visible immediately as jank during smoke test. Each batched handler returns its consumed count; main loop adds. Defensive: add a cursor-end assert that we consumed the entire events array exactly.

4. **Hit-flash on `Paperdoll` legibility.** Multi-sprite tint may read as "costume disappears." Smoke test will tell; alpha-flash fallback is one line of code change.

5. **Damage number stacking.** AoE on three different actors → three different numbers, no overlap. Repeated hits on the same actor in rapid succession → numbers stack briefly until the older ones fade out. Acceptable for Tier 1.

6. **Tab-close mid-combat.** RngState in save is stale; rerun produces same outcome. Already analyzed. ✓

7. **Boss placeholder visual scale.** Rendering `bone_lich` at 1.5× the minion scale (in placeholder world) may visually clip into adjacent enemies if the boss is in slot 4 and slot 3 is full. Crypt floors don't currently spawn bosses with adjacent minions per `data/dungeons.ts` — verify during smoke test; if it clips, just nudge the boss y up by 10px or scale to 1.3× instead.

8. **Status glyph overflow.** A combatant with 4+ active statuses overflows the 56px-wide HP bar's footprint. Tier 1 doesn't realistically reach this (max simultaneous statuses per combatant is ~2 in observed play). If it ever happens, glyph spacing tightens to 8px in implementation.

## Out of scope (Tier 2+)

- Per-ability visual flavor (specific colors, particles per `Ability.tags`).
- Real backdrop art (current: solid color).
- Skip-to-result button.
- Pause button.
- Action log scrollback.
- Turn-order ribbon.
- Status tooltip on hover (would require a tooltip system).
- Real enemy sprites (task 19).
- Hero animation frames beyond static paperdoll (idle bob, attack frame, hit frame).
- Background screen-shake on heavy hits.
- Combo / chain visual hints.
