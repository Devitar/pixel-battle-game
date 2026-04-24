# Combat Engine — Resolution Loop (Tier 1)

**Status:** Design · **Date:** 2026-04-24 · **Source TODO:** Cluster A, task 4

## Purpose

Build the pure-TypeScript combat engine that consumes the data tasks 2 and 3 produced (classes, abilities, enemies) and resolves a 3v3–4 ranked fight deterministically. The engine takes an initial `CombatState` plus an RNG, runs rounds until one side wins or a round cap hits, and returns a final state along with a structured event log.

This is the load-bearing core of Tier 1. Every downstream system — the combat scene (task 17), the balance simulator, the save file's "combat in progress" state — consumes what this task produces.

## Dependencies and invariants carried in

**Vocabulary from task 2 (class data):**
- `Ability`, `AbilityEffect` (9-kind discriminated union), `TargetSelector`, `TargetFilter`, `StatusId`, `AbilityTag`, `SlotIndex`, `Side`, `BuffableStat`, `Stats`.
- `power × casterAttack` damage/heal formula.
- Flat buff/debuff deltas (no percent mode).
- Collapse-on-death: dead combatants do not hold slots; living combatants on that side shift forward.
- Selector empty-set semantics: an ability with no legal targets is not castable.

**Vocabulary from task 3 (enemy data):**
- `EnemyDef`, `EnemyRole`, `CombatantTag`, `preferredSlots`.
- Caster-relative `TargetSelector.side`: `'self'` = caster, `'ally'` = caster's side minus caster, `'enemy'` = opposite side.
- Max-HP debuff clamp: `currentHp = min(currentHp, newMax)` when max decreases. `currentHp` stays where it was when a max-HP buff/debuff expires.

**New invariants this spec declares:**
- Status ticking is per-target-turn, not per-round. Stun-check fires before tick so a freshly-applied `duration: 1` stun always costs exactly one turn.
- Turn order: `initiative = speed + rng.int(0, Math.max(2, Math.floor(speed * 0.1)))`, sort descending, tiebreak player-side-first then ascending slot.
- Damage floor of 1: `max(1, power × attack × tagBonus - defense)` after mark multipliers.
- Smite's `radiant` tag paired with an `undead` target carries a flat `× 1.5` bonus. This is the only tag-pair bonus in Tier 1.
- Mark persists for its full `duration` — every damage instance during that window is multiplied. Not single-use.
- Ties at combat end count as `'player_defeat'`.
- Round cap: 30.

**Small addition to `data/types.ts`:** `StatusId` grows by one literal — `'stunned'`. The `{ kind: 'stun', duration }` effect lands as a status with this implicit id. No other type changes in `data/`.

## File layout

All new files under `src/combat/`. Tests in `src/combat/__tests__/`.

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/combat/types.ts` | Modify | Extend (currently has only `Stats`). Add `CombatantId`, `Combatant`, `CombatState`, `StatusInstance`, `CombatEvent`, `CombatOutcome`, `CombatResult`. Also add `Side` here (distinct from `TargetSelector.side` — see below). |
| `src/combat/turn_order.ts` | Create | `computeInitiative(combatants, rng)` → ordered `CombatantId[]`. |
| `src/combat/target_selector.ts` | Create | `resolveTargetSelector(selector, caster, state, rng)` → `CombatantId[]`. |
| `src/combat/ability_priority.ts` | Create | `pickAbility(caster, state, rng)` → `PickedAction \| null`. |
| `src/combat/positions.ts` | Create | `shove`, `pull`, `swap`, `collapseAfterDeath`, `shuffle`. |
| `src/combat/effects.ts` | Create | `applyAbility` + per-kind handlers for damage/heal/stun/shove/pull/buff/debuff/mark/taunt. |
| `src/combat/statuses.ts` | Create | `tickStatuses`, `getEffectiveStat`. |
| `src/combat/combat.ts` | Create | `resolveCombat(initialState, rng) → CombatResult`. The top-level entry point. |
| `src/data/types.ts` | Modify | Extend `StatusId` with `'stunned'`. |

**Import boundary:** `src/combat/` imports from `src/data/` and `src/util/`. `src/data/` does not import from `src/combat/`. No file under `src/combat/` imports `phaser`.

**Side terminology:** task 2 defined `Side = 'self' \| 'ally' \| 'enemy'` (caster-relative, used in `TargetSelector`). The combat engine's runtime needs a separate absolute notion — which side of the arena is this combatant on. That's introduced here as `CombatSide = 'player' \| 'enemy'`. The two live under different names to prevent conflation.

## Runtime state

```ts
export type CombatantId = string;         // 'p0'..'p2' for party, 'e0'..'e3' for enemies
export type CombatSide = 'player' | 'enemy';

export interface StatusInstance {
  statusId: StatusId;
  remainingTurns: number;
  effect: AbilityEffect;                  // the original effect record that created it
  sourceId: CombatantId;
}

export interface Combatant {
  id: CombatantId;
  side: CombatSide;
  slot: SlotIndex;                        // mutable; set to -1 by the collapse protocol after death (not at death time itself)
  kind: 'hero' | 'enemy';
  classId?: ClassId;                      // set iff kind === 'hero'
  enemyId?: EnemyId;                      // set iff kind === 'enemy'
  baseStats: Stats;
  currentHp: number;
  maxHp: number;                          // mutates on HP buffs/debuffs
  statuses: Record<StatusId, StatusInstance>;
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  preferredSlots?: readonly SlotIndex[];  // from EnemyDef; absent on heroes
  tags?: readonly CombatantTag[];         // from EnemyDef; absent on heroes in Tier 1
  isDead: boolean;
}

export interface CombatState {
  combatants: Combatant[];
  round: number;                          // 1-indexed; incremented at round start
}

export type CombatOutcome = 'player_victory' | 'player_defeat' | 'timeout';

export interface CombatResult {
  finalState: CombatState;
  events: readonly CombatEvent[];
  outcome: CombatOutcome;
}
```

**Four notes:**

1. **Effective stats are computed.** `getEffectiveStat(combatant, stat)` sums `baseStats[stat]` plus all active `buff`/`debuff` statuses whose `effect.stat` matches. No caching. Combat is small; O(status count) per damage calc is fine.
2. **Max HP is the exception.** It's stored mutably on the combatant because `currentHp` has to be clamped against it whenever it changes. When an `hp` buff/debuff applies, engine updates `maxHp` and clamps `currentHp = min(currentHp, maxHp)`. When the status expires, `maxHp` is recomputed from `baseStats.hp + sum of still-active hp buff/debuff deltas`; `currentHp` stays where it was.
3. **Dead combatants stay in the array.** `isDead = true`, `slot = -1`. Event replay can still resolve `combatantId` references. Living-combatant queries filter on `!isDead`.
4. **Stable combatantIds.** Assigned once at combat start (`p0..p2` player party by starting slot, `e0..e3` enemy formation by starting slot). The id is independent of current slot after shoves/pulls/deaths.

## Event stream

14 event kinds. Fine-grained — one observable change per event.

```ts
export type CombatEvent =
  | { kind: 'combat_start'; party: readonly CombatantId[]; enemies: readonly CombatantId[] }
  | { kind: 'round_start'; round: number; order: readonly CombatantId[] }
  | { kind: 'turn_start'; combatantId: CombatantId }
  | { kind: 'turn_skipped'; combatantId: CombatantId; reason: 'stunned' | 'dead' }
  | { kind: 'ability_cast'; casterId: CombatantId; abilityId: AbilityId; targetIds: readonly CombatantId[] }
  | { kind: 'shuffle'; combatantId: CombatantId }
  | { kind: 'damage_applied'; sourceId: CombatantId; targetId: CombatantId; amount: number; lethal: boolean }
  | { kind: 'heal_applied'; sourceId: CombatantId; targetId: CombatantId; amount: number }
  | { kind: 'status_applied'; sourceId: CombatantId; targetId: CombatantId; statusId: StatusId; duration: number }
  | { kind: 'status_expired'; targetId: CombatantId; statusId: StatusId }
  | { kind: 'position_changed'; combatantId: CombatantId; fromSlot: SlotIndex; toSlot: SlotIndex; reason: 'shove' | 'pull' | 'swap' | 'collapse' | 'shuffle' }
  | { kind: 'death'; combatantId: CombatantId }
  | { kind: 'round_end'; round: number }
  | { kind: 'combat_end'; outcome: CombatOutcome };
```

**Intra-turn ordering guarantees:**

1. `turn_start` first.
2. Either `turn_skipped`, `ability_cast` + effect events, or `shuffle` + `position_changed` follow.
3. Within `ability_cast`: effects resolve in the order declared on the ability. All targets of effect #1 resolve before effect #2 begins.
4. Per-effect emission order: `damage_applied`/`heal_applied` → `death` (if HP hit 0) → `status_applied` (if any) → `position_changed` (if any).
5. After all effects, if any deaths occurred, `position_changed: 'collapse'` events are emitted in ascending slot order for each combatant that shifted.
6. No explicit `turn_end` event — implied by the next `turn_start` or by `round_end`.

## Turn order

```ts
export function computeInitiative(
  combatants: readonly Combatant[],
  rng: Rng,
): CombatantId[]
```

Per-round roll:

1. For each living combatant, `initiative = getEffectiveStat(c, 'speed') + rng.int(0, Math.max(2, Math.floor(speed * 0.1)))`.
2. Sort descending on initiative.
3. Stable tiebreak: player side before enemy side, then ascending slot.

Returned array is this round's turn sequence. The loop walks it; a combatant that was alive at round start but died mid-round is still in the order but gets `turn_skipped { reason: 'dead' }` when reached.

## AI picker

```ts
export interface PickedAction {
  abilityId: AbilityId;
  targetIds: readonly CombatantId[];
}

export function pickAbility(
  caster: Combatant,
  state: CombatState,
  rng: Rng,
): PickedAction | null
```

Walks `caster.aiPriority` top-to-bottom. For each ability:

1. If `caster.slot` ∉ `ability.canCastFrom` → skip.
2. Resolve target set via `resolveTargetSelector`.
3. If the set is empty → skip.
4. Return `{ abilityId, targetIds }`.

Returns `null` when nothing is castable → caller falls through to shuffle.

## Target selector

```ts
export function resolveTargetSelector(
  selector: TargetSelector,
  caster: Combatant,
  state: CombatState,
  rng: Rng,
): CombatantId[]
```

Procedure, in order:

1. **Candidate set from `selector.side`** (caster-relative):
   - `'self'` → `[caster]`
   - `'ally'` → all combatants on `caster.side` except caster
   - `'enemy'` → all combatants on the opposing `CombatSide`
2. **Drop the dead.** Filter out `isDead`.
3. **`slots` filter** (if present):
   - `SlotIndex[]` → keep those whose current slot is in the array
   - `'all'` or absent → keep everyone
   - `'furthest'` → keep only the combatant(s) in the highest-occupied slot on that side
4. **`filter` predicate** (if present): `{ kind: 'hurt' }` drops full-HP; `hasStatus`/`lacksStatus` test `statuses[statusId]`; `hasTag` tests the target's `CombatantTag[]`.
5. **Taunt narrowing** — only when `selector.side === 'enemy'` (i.e., caster targeting the opposite side) and at least one candidate remaining has `'taunting'`. Narrow to just taunting candidates.
6. **`pick` narrowing** (if present):
   - `'first'` → lowest slot
   - `'lowestHp'` / `'highestHp'` → by `currentHp`, ties break on slot ascending
   - `'random'` → `rng.pick(candidates)`

Return the final candidate ids.

## Effect application

```ts
export function applyAbility(
  ability: Ability,
  caster: Combatant,
  targetIds: readonly CombatantId[],
  state: CombatState,
  rng: Rng,
  events: CombatEvent[],
): void
```

Emits `ability_cast`, then iterates `ability.effects` in order. For each effect, iterates targets. If a target died earlier in this ability's processing, subsequent effects on that target are no-ops (not emitted).

### Per-kind handlers

**`damage` (`{ power }`):**
1. `tagBonus = ability.tags and target.tags share any member ? 1.5 : 1.0`.
2. `raw = Math.round(power * getEffectiveStat(caster, 'attack') * tagBonus)`.
3. If target has `'marked'` status: `raw = Math.round(raw * (1 + mark.effect.damageBonus))`.
4. `final = Math.max(1, raw - getEffectiveStat(target, 'defense'))`.
5. `target.currentHp -= final`; emit `damage_applied { amount: final, lethal: target.currentHp <= 0 }`.
6. If `target.currentHp <= 0`: set `isDead = true`, emit `death`. Do **not** set `slot = -1` yet and do **not** collapse yet — collapse is deferred until `applyAbility` finishes all effects (see "Collapse protocol" below).

**`heal` (`{ power }`):**
1. `amount = Math.round(power * getEffectiveStat(caster, 'attack'))`.
2. `actualHeal = Math.min(amount, target.maxHp - target.currentHp)`.
3. `target.currentHp += actualHeal`; emit `heal_applied { amount: actualHeal }`. (Always emitted, even for zero.)

**`stun`:** construct `StatusInstance { statusId: 'stunned', remainingTurns: effect.duration, effect, sourceId: caster.id }`. Store at `target.statuses['stunned']`. Emit `status_applied`.

**`buff` / `debuff`:** construct the status as above with `effect.statusId`. If `effect.stat === 'hp'`: `target.maxHp += effect.delta`; `target.currentHp = Math.min(target.currentHp, target.maxHp)`. Emit `status_applied`.

**`mark` / `taunt`:** construct and store; emit `status_applied`. No further state change at application time — the consequence lives in damage calc (mark) and target selection (taunt).

**`shove` (`{ slots: N }`):** call `positions.shove(target, N, state, events)`. Moves target back N slots; same-side combatants between old and new slot shift forward. Capped at back of formation. Emits `position_changed: 'shove'` per combatant whose slot changed.

**`pull` (`{ slots: N }`):** mirror of shove toward slot 1.

### Collapse protocol

Runs once at the end of `applyAbility` if any death occurred during effect processing. For each `CombatSide` independently:

1. Gather living combatants on that side, sort by current slot.
2. Reassign their slots as 1, 2, 3, ... in sorted order.
3. Set each dead combatant's slot to -1.
4. For each living combatant whose slot changed, emit `position_changed { combatantId, fromSlot, toSlot, reason: 'collapse' }`. Events are emitted in ascending new-slot order.

Shove/pull effects earlier in the ability emit their own `position_changed` events with their respective reasons; those are independent of collapse. Collapse only fires from deaths and only at ability end.

## Status tick protocol

At the start of each combatant's turn, before ability pick:

1. `turnSkipped = 'stunned' in combatant.statuses`.
2. `tickStatuses(combatant, events)`:
   - For each status: `remainingTurns -= 1`. If it reaches 0, emit `status_expired`, delete from `statuses`. For `buff`/`debuff` with `effect.stat === 'hp'`, also reverse the maxHp delta: `combatant.maxHp -= effect.delta`. `currentHp` is not touched on expiry (per task 3 invariant).
3. If `turnSkipped` → emit `turn_skipped { reason: 'stunned' }`, end turn immediately. Otherwise, proceed to ability pick.

This ordering guarantees `stun duration: 1` costs exactly one turn: stun applied → target's next turn → stun-check sees it → turn flagged → tick expires it → turn skipped.

## Combat loop

```ts
export function resolveCombat(
  initialState: CombatState,
  rng: Rng,
): CombatResult
```

1. Deep-clone `initialState` via `structuredClone` so the caller's copy is untouched.
2. Emit `combat_start { party, enemies }`.
3. **Round loop** (up to 30 rounds):
   a. `state.round += 1`.
   b. `order = computeInitiative(livingCombatants, rng)`; emit `round_start { round, order }`.
   c. For each `id` in `order`:
      - Look up combatant. If `isDead` → emit `turn_skipped { reason: 'dead' }`, continue.
      - Emit `turn_start`.
      - Run status tick protocol above.
      - If turn wasn't skipped: `picked = pickAbility(combatant, state, rng)`. If non-null → `applyAbility`. Else → emit `shuffle`; `positions.shuffle(combatant, state, events)`.
      - Check side-living counts. If either side is empty, break out of both loops.
   d. Emit `round_end { round }`.
4. **Outcome:**
   - Player side has living combatants, enemy side does not → `'player_victory'`.
   - Enemy side has living, player side does not → `'player_defeat'`.
   - Both sides zero (mutual wipe) → `'player_defeat'` (ties are losses).
   - Both sides still alive at round 30 → `'timeout'`.
5. Emit `combat_end { outcome }`.
6. Return `{ finalState: state, events, outcome }`.

## Shuffle fallback

`positions.shuffle(combatant, state, events)` when nothing is castable:

- **Enemy with `preferredSlots`:** pick the adjacent neighbor (slot ±1) that moves the combatant toward `preferredSlots`. If already inside preferredSlots, swap with the neighbor toward slot 1 (force forward).
- **Hero (no `preferredSlots`):** swap with the neighbor toward slot 1.
- Edge slot (1 or max): swap with the single available neighbor.
- **Emits:** `position_changed: 'shuffle'` for both combatants involved in the swap. The `shuffle` event has already been emitted by the caller before invoking this function.

In Tier 1's kits, heroes never hit shuffle (every class has at least one ability castable from any of slots 1–3). Shuffle is effectively an enemy-side safety valve.

## Tests

Tests split per module with one integration suite at the top.

### `turn_order.test.ts`
- Same seed + same combatants → identical order (determinism).
- Gap > variance: higher speed sorts earlier.
- Variance scales with speed: at speed 5 the range is `[0..2]`; at speed 100 it's `[0..10]`.
- Ties: player side first, then ascending slot.
- Dead combatants excluded.

### `target_selector.test.ts` (the hairiest)
- `side` routing: `'self'` → just caster; `'ally'` → caster's side minus caster; `'enemy'` → opposite side.
- Dead combatants excluded.
- `slots` variants: `SlotIndex[]`, `'all'`, absent, `'furthest'` (dynamic as slots collapse).
- `filter` predicates: `hurt`, `hasStatus`, `lacksStatus`, `hasTag`.
- Taunt narrowing fires only on enemy-side targeting; empty narrowed set = ability uncastable.
- Pick: `'first'`, `'random'`, `'lowestHp'`, `'highestHp'`; tiebreaks on slot ascending.

### `ability_priority.test.ts`
- Walks priority top-to-bottom; returns first castable.
- Skips abilities with `canCastFrom` excluding caster's slot.
- Skips abilities whose target set is empty.
- Returns `null` if nothing castable.

### `effects.test.ts`
- Damage formula: `max(1, power × attack × tagBonus - defense)`. Radiant × undead = 1.5×; radiant × humanoid = 1.0×.
- Mark persists and multiplies every hit within its duration.
- Lethal damage → emits `death` + `collapseAfterDeath` events in slot-ascending order.
- Heal capped at maxHp; emitted on zero heal too.
- Stun → `'stunned'` status; next turn skipped; status expires on that turn.
- Buff/debuff on non-HP stats updates `getEffectiveStat` correctly; reverses on expiry.
- Buff/debuff on `'hp'`: maxHp immediately updates; currentHp clamped on negative; on expiry, maxHp reverts and currentHp stays put.
- Shove/pull boundary: shoving back-slot combatant is a no-op; pulling from slot 1 is a no-op; displaced neighbors shift correctly.
- Multi-effect ordering: Shield Bash's damage-then-stun — if damage is lethal, stun is not applied.

### `positions.test.ts`
- `shove(target, 1)`: target back 1; displaced neighbor forward 1.
- `collapseAfterDeath`: living combatants behind the dead one shift forward by 1, events emitted in slot-ascending order.
- `shuffle`: enemy preferring `[3, 4]` currently in slot 1 shuffles to slot 2; enemy in slot 3 with nothing castable shuffles to slot 2 (forward default).

### `statuses.test.ts`
- `tickStatuses` decrements durations, expires zeroes, emits `status_expired`.
- HP buff/debuff reverts maxHp on expiry; currentHp untouched.
- `getEffectiveStat` aggregates multiple buffs/debuffs on the same stat.

### `combat.test.ts` — integration

**Scripted scenarios:**
- **Knight vs. Skeleton Warrior 1-on-1:** Knight wins; specific event sequence asserted.
- **Mutual wipe:** last hero and last enemy both reach 0 HP on the same AoE; outcome = `'player_defeat'`.
- **Timeout:** two tanky combatants with no damage output → outcome = `'timeout'` after 30 rounds.
- **Priest heal:** wounded ally exists → Mend fires first round, heal event emitted, HP updated.
- **Taunt redirection:** Knight taunts → a Skeleton Warrior's target selector narrows to the Knight even though the Priest is also valid.
- **Stun costs a turn:** Knight's Shield Bash stuns a Skeleton Warrior. On the skeleton's next turn → `turn_skipped { reason: 'stunned' }`; stun expires.
- **Full Crypt-boss scenario:** 3 heroes vs. Bone Lich + Skeleton Archer + Cultist. Assert combat ends without exception; outcome is one of three valid values.

**Determinism property:**
- Run the same `initialState` with the same RNG seed twice; assert `events` arrays are deeply equal and `finalState`s match.

## Risks and follow-ups

- **Balance is unvalidated.** Once the engine runs, expect the numbers from tasks 2 and 3 to need tuning. The engine doesn't commit to any specific outcome — it exposes the machinery.
- **Determinism depends on the RNG contract.** The engine consumes the RNG in a fixed call order (initiative → pick:random → nothing else in Tier 1). Any future addition (Crit rolls, Dodge rolls) has to be inserted at a deterministic point in the call order to preserve replayability.
- **`structuredClone` availability.** ES2022+; available in Node 20 and all modern browsers. The repo uses TS 6 and targets modern Vite builds; no polyfill needed.
- **Dead combatants stay in state.** Event replay + `finalState` inspection both work. Save/load (task 9) and the balance sim will inherit this.
- **Shuffle is crude.** Adjacent-neighbor swap toward preferred slots is adequate for Tier 1; Tier 2's more complex kits may justify a smarter shuffler (e.g., pathfind to the nearest legal slot). Not this task's concern.
- **No Crit, no Dodge.** Tier 1 scope. Introducing them means two new RNG consumption points per damage calc and new event kinds (`attack_missed`, `attack_critted`). Non-breaking but significant.
