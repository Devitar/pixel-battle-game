# Ability Cooldowns

**Status:** Design · **Date:** 2026-04-26 · **Source:** `bugs.md` (heal-cooldown stalemate, archer-volley AI)

## Purpose

Add a generic per-combatant per-ability cooldown system to the combat engine, then apply cooldowns of 2 turns to four data abilities (`mend`, `dark_pact`, `flare_arrow`, `piercing_shot`). This fixes two bugs surfaced during task 18 smoke testing:

1. **Heal stalemate.** Cultist's `dark_pact` (heal, no cooldown) was its first AI priority, so any encounter with a Cultist healed every turn forever; the new exhaustion mechanic ramped player-only damage taken until the player wiped against an unkillable team. The same shape would apply to a player party leaning on `mend`.
2. **Archer never casts Volley.** The Archer's AI priority is `['flare_arrow', 'piercing_shot', 'volley', 'archer_shoot']`, but `flare_arrow` and `piercing_shot` always find valid targets — `volley` was reachable only as a fallback that almost never triggered. The kit felt single-target-locked.

A single mechanism (cooldowns) solves both. The engine change is small; the data changes are 4 lines. The Cultist test-fixture (`aiPriority: ['dark_bolt', 'dark_pact']` introduced during task 18 smoke testing) gets reverted to the original `['dark_pact', 'dark_bolt']` once the cooldown system is in place.

## Dependencies and invariants

**Vocabulary from prior tasks:**
- `Ability` schema: `id`, `name`, `canCastFrom`, `target`, `effects`, `tags?` (`data/types.ts:65-72`).
- `Combatant` shape: `statuses: Record<string, StatusInstance>`, `abilities: readonly AbilityId[]`, `aiPriority: readonly AbilityId[]`, `isDead`, etc. (`combat/types.ts:30-47`).
- `pickAbility(caster, state, rng)` walks `caster.aiPriority`, returns the first ability that has a valid `canCastFrom` slot and a non-empty target set (`combat/ability_priority.ts:12-21`).
- Combat loop turn structure (`combat/combat.ts:62-97`): per turn, check `isDead`, emit `turn_start`, snapshot `willBeStunned`, call `tickStatuses`, then either skip-due-to-stun or `pickAbility` → `applyAbility` (or `shuffle` if nothing castable).
- `tickStatuses(combatant, events)` (`combat/statuses.ts`) is the model for "decrement-and-emit" tick helpers.
- `structuredClone` is used at the top of `resolveCombat` (`combat.ts:35`) to isolate the in-flight state from `initialState`. All combatant fields must survive a structured clone.
- `resolveCombat` is a pure function of `(initialState, rng)` — same seed produces identical `events` and `finalState`.
- `buildCombatState` (`run/combat_setup.ts`) constructs `Combatant`s from heroes / enemies before each fight. New required fields on `Combatant` need a default here.
- Test conventions: pure-TS combat tests live under `src/combat/__tests__/`; helpers in `helpers.ts`. Ability-priority tests in `ability_priority.test.ts` exercise `pickAbility` directly.

**New invariants this spec declares:**
- **Cooldowns are battle-local.** They live only on `Combatant.cooldowns` inside a `CombatState`. They do not persist across fights, are not saved, are not visible on `RunState`. Battle-end discards them.
- **Cooldowns tick at the start of each combatant's turn**, alongside `tickStatuses`. Same per-turn rhythm. A cooldown of N means the ability is unavailable for the caster's next N turns after a cast (cast turn doesn't count).
- **Cooldowns never tick for dead combatants.** Dead combatants skip the whole turn-loop body; their cooldowns freeze. This is correct for any future revive mechanic and irrelevant in Tier 1.
- **Cooldowns tick while stunned.** Stun consumes a turn; the cooldown advances normally. Same rhythm as a hero who can't act but for whom time still passes.
- **The cooldown count is set after a successful cast, not on shuffle.** A combatant who shuffles (no castable ability) doesn't put anything on cooldown.
- **Determinism preserved.** All cooldown operations are deterministic — no rng involved. Same seed, same outcome.
- **Cooldowns are AI bookkeeping, not player-facing in this task.** No `cooldown_set` or `cooldown_ticked` events. The combat-scene playback layer doesn't render cooldowns. Tier 2 polish if wanted later.

## Module layout

| Path | Action | Responsibility |
|---|---|---|
| `src/data/types.ts` | **Modify** | Add optional `cooldown?: number` to `Ability` interface. |
| `src/data/abilities.ts` | **Modify** | Add `cooldown: 2` to `mend`, `dark_pact`, `flare_arrow`, `piercing_shot`. |
| `src/combat/types.ts` | **Modify** | Add `cooldowns: Record<AbilityId, number>` to `Combatant` (required field). |
| `src/combat/cooldowns.ts` | **Create** | New module with `tickCooldowns(combatant)` and `setCooldown(combatant, abilityId, turns)`. ~25 lines. |
| `src/combat/ability_priority.ts` | **Modify** | One new line in `pickAbility`'s loop: skip abilities where the caster's cooldown for that id is > 0. |
| `src/combat/combat.ts` | **Modify** | Two new lines in the turn loop: `tickCooldowns(combatant)` after `tickStatuses`, and `setCooldown(...)` after a successful cast where `ability.cooldown !== undefined`. |
| `src/combat/combatant.ts` | **Modify** | Initialize `cooldowns: {}` in `createHeroCombatant` and `createEnemyCombatant` factories. ~2 lines. |
| `src/combat/__tests__/cooldowns.test.ts` | **Create** | New test file. ~80 lines. Covers `tickCooldowns`, `setCooldown`, and integration with `pickAbility`. |
| `src/combat/__tests__/ability_priority.test.ts` | **Modify** | One new test: "skips abilities whose cooldown > 0." |
| `src/combat/__tests__/helpers.ts` | **Modify** | `makeHeroCombatant` and `makeEnemyCombatant` initialize `cooldowns: {}` and accept an optional `cooldowns` override. |
| `src/data/enemies.ts` | **Modify** | Revert Cultist's `aiPriority` to `['dark_pact', 'dark_bolt']`. Remove the test-fixture comment. |
| `bugs.md` | **Modify** | Remove both entries (heal-cooldown, archer-volley) — resolved by this change. |

No changes to scenes, save format, schema migrations, or `applyAbility`.

## Schema changes

### `Ability` (`data/types.ts:65-72`)

```ts
export interface Ability {
  id: AbilityId;
  name: string;
  canCastFrom: readonly SlotIndex[];
  target: TargetSelector;
  effects: readonly AbilityEffect[];
  tags?: readonly AbilityTag[];
  cooldown?: number;        // NEW. Turns of caster cooldown after a cast. Omitted = no cooldown.
}
```

`cooldown?: number` is optional — abilities without it have no cooldown (current behavior). Omitting reads as "no resource cost."

### `Combatant` (`combat/types.ts:30-47`)

```ts
export interface Combatant {
  id: CombatantId;
  side: CombatSide;
  slot: SlotIndex;
  kind: 'hero' | 'enemy';
  // ... existing fields ...
  statuses: Record<string, StatusInstance>;
  cooldowns: Record<AbilityId, number>;   // NEW. abilityId → turns remaining.
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  // ... existing fields ...
}
```

**Required, not optional.** Empty `{}` at battle start means "nothing on cooldown" — no need for callers to defensively check `cooldowns ?? {}`. Same shape as `statuses` next to it.

**Why `Record` not `Map`:** Records survive `structuredClone` cleanly; Combatants are treated as plain serializable structs throughout the engine; `statuses` is already a Record. Lookup ergonomics are identical (`cooldowns[abilityId]`).

**Why "remaining turns" not "expiry round":** Storing absolute turn-numbers would require a per-combatant turn counter that doesn't exist. Countdown matches `StatusInstance.remainingTurns`.

### No save migration

`CombatState` is never serialized. Combat is always rebuilt from `RunState` via `buildCombatState`. Adding fields to `Combatant` doesn't bump the save schema.

## Cooldown helpers (`src/combat/cooldowns.ts`)

```ts
import type { AbilityId } from '../data/types';
import type { Combatant } from './types';

export function tickCooldowns(combatant: Combatant): void {
  for (const id of Object.keys(combatant.cooldowns) as AbilityId[]) {
    const remaining = combatant.cooldowns[id]! - 1;
    if (remaining <= 0) {
      delete combatant.cooldowns[id];
    } else {
      combatant.cooldowns[id] = remaining;
    }
  }
}

export function setCooldown(
  combatant: Combatant,
  abilityId: AbilityId,
  turns: number,
): void {
  combatant.cooldowns[abilityId] = turns;
}
```

Both helpers are mutating (consistent with `tickStatuses` style — `resolveCombat` already deep-clones state at entry, so in-place mutation is safe). No event emission; cooldowns are silent AI bookkeeping in this task.

## Lifecycle in the combat loop

`src/combat/combat.ts` turn-body, with new lines marked:

```ts
events.push({ kind: 'turn_start', combatantId: id });

const willBeStunned = 'stunned' in combatant.statuses;
tickStatuses(combatant, events);
tickCooldowns(combatant);                              // NEW

if (willBeStunned) {
  events.push({ kind: 'turn_skipped', combatantId: id, reason: 'stunned' });
} else {
  const picked = pickAbility(combatant, state, rng);
  if (picked) {
    const ability = ABILITIES[picked.abilityId];
    applyAbility(ability, combatant, picked.targetIds, state, rng, events);
    if (ability.cooldown !== undefined) {                            // NEW
      setCooldown(combatant, ability.id, ability.cooldown + 1);      // NEW (see "Stored value = N+1" below)
    }
  } else {
    events.push({ kind: 'shuffle', combatantId: id });
    shuffle(combatant, state, events);
  }
}
```

**Stored value = `cooldown + 1`.** The declared `cooldown: N` on an ability means "the caster cannot use this ability for the next N caster-turns after a cast." With `tickCooldowns` decrementing at the start of every caster-turn (before the skip check), the stored countdown must survive N decrements before being deleted. Storing `cooldown + 1` is the only place this off-by-one lives — everything else in the engine treats `cooldowns[id]` as a pure remaining-ticks counter. Without the `+ 1`, declared `cooldown: 2` would skip only 1 turn (effectively "cast every other turn," not "skip 2"). The helper `setCooldown` is *direct* — tests that seed cooldowns specify the stored value, not a declared value — and the conversion lives at the consumer site in `combat.ts` so the test API stays predictable.

`pickAbility` (`src/combat/ability_priority.ts:12-21`), with new line marked:

```ts
export function pickAbility(caster: Combatant, state: CombatState, rng: Rng): PickedAction | null {
  for (const abilityId of caster.aiPriority) {
    const ability = ABILITIES[abilityId];
    if ((caster.cooldowns[abilityId] ?? 0) > 0) continue;     // NEW
    if (!ability.canCastFrom.includes(caster.slot)) continue;
    const targetIds = resolveTargetSelector(ability.target, caster, state, rng);
    if (targetIds.length === 0) continue;
    return { abilityId, targetIds };
  }
  return null;
}
```

**Why `?? 0` and not `?? 0 > 0`:** If the abilityId isn't in the cooldowns Record, lookup is `undefined`. `undefined > 0` is `false`, so the check would silently pass — but TypeScript's strict mode flags `undefined > 0` as a comparison error. Coercing missing entries to 0 is clearer.

**Cast-turn behavior:** Declared `cooldown: 2` on turn T → stored as `3`. `tickCooldowns` at start of T+1: `3 → 2`, skipped (`2 > 0`). T+2: `2 → 1`, skipped. T+3: `1 → 0`, deleted, available. Net: caster skips the ability for their next 2 turns and casts again on the 3rd. The `+ 1` happens once, in `combat.ts`, when the cooldown is set after a cast.

**Shuffle interaction:** If `pickAbility` returns `null` (every priority is on cooldown, on-wrong-slot, or has no targets), the combatant shuffles. Cooldowns don't get set on shuffle.

**Stunned interaction:** Stun is detected via `'stunned' in combatant.statuses` *before* `tickStatuses`/`tickCooldowns` run. Then both ticks run unconditionally. Then the stun branch skips ability picking. So cooldowns advance even on stunned turns — stun consumes a cooldown turn.

**Death interaction:** Dead combatants `continue` past the entire body. Their cooldowns freeze. No revive mechanic in Tier 1, so this is irrelevant in practice.

## Data values

Four ability defs in `src/data/abilities.ts` get `cooldown: 2`:

```ts
mend: {
  id: 'mend',
  // ... existing fields ...
  effects: [{ kind: 'heal', power: 1.2 }],
  cooldown: 2,
},
dark_pact: {
  id: 'dark_pact',
  // ... existing fields ...
  effects: [{ kind: 'heal', power: 1.0 }],
  cooldown: 2,
},
flare_arrow: {
  id: 'flare_arrow',
  // ... existing fields ...
  effects: [{ kind: 'mark', damageBonus: 0.5, duration: 2, statusId: 'marked' }],
  cooldown: 2,
},
piercing_shot: {
  id: 'piercing_shot',
  // ... existing fields ...
  effects: [{ kind: 'damage', power: 1.4 }],
  cooldown: 2,
},
```

### Resulting AI patterns

**Cultist** (`aiPriority: ['dark_pact', 'dark_bolt']`, *reverted* from the test-fixture):
- T1: hurt ally → heal (cooldown 2). No hurt → bolt.
- T2-T3: dark_pact on cooldown → bolt.
- T4: dark_pact ready. Repeat.

**Player Priest** (`aiPriority: ['mend', 'bless', 'smite', 'priest_strike']`):
- T1: hurt ally → mend (cooldown 2).
- T2-T3: mend on cooldown → bless / smite / priest_strike per existing fall-through.
- T4: mend ready.

**Archer** at slot 2 or 3 (`aiPriority: ['flare_arrow', 'piercing_shot', 'volley', 'archer_shoot']`):
- T1: flare_arrow (cooldown 2)
- T2: flare on cooldown → piercing_shot (cooldown 2)
- T3: flare on cooldown, piercing on cooldown → volley
- T4: flare ready → flare_arrow (cooldown 2)
- T5: flare on cooldown, piercing ready → piercing_shot (cooldown 2)
- T6: both on cooldown → volley
- ...stable rotation flare → piercing → volley → flare → piercing → volley.

**Archer at slot 1**: only `archer_shoot` is castable (`canCastFrom: [1, 2, 3]`); the other three abilities require slot 2 or 3. The kit-locked-out-at-slot-1 issue is a separate concern (formation-picker UX) and out of scope for this task.

### Cultist revert (`src/data/enemies.ts`)

```ts
cultist: {
  id: 'cultist',
  name: 'Cultist',
  role: 'minion',
  baseStats: { hp: 10, attack: 3, defense: 1, speed: 3 },
  tags: ['humanoid'],
  abilities: ['dark_pact', 'dark_bolt'],
  aiPriority: ['dark_pact', 'dark_bolt'],   // back to original
  preferredSlots: [3, 4],
  spriteId: 'cultist',
},
```

The two-line "Bolt before pact until heal cooldowns exist" comment is removed at the same time. The cooldown system *is* the proper fix.

### `bugs.md` cleanup

Both captured entries (heal-cooldown, archer-volley) are removed — they're resolved by this change.

## Tests

### `src/combat/__tests__/cooldowns.test.ts` (new)

```ts
describe('tickCooldowns', () => {
  it('decrements every cooldown by 1');
  it('drops cooldowns that hit 0');
  it('is a no-op when the combatant has no cooldowns');
});

describe('setCooldown', () => {
  it('sets the cooldown to the given value');
  it('overwrites an existing cooldown');
});

describe('integration: pickAbility skips on-cooldown abilities', () => {
  it('falls through to the next priority when first is on cooldown');
  it('returns null when every priority is on cooldown and no others are castable');
  it('falls through to a non-cooldown ability when all cooldowns are active');
});
```

### `src/combat/__tests__/ability_priority.test.ts` (append 1)

```ts
it('skips abilities whose cooldown > 0', () => {
  const rng = createRng(1);
  const priest = makeHeroCombatant('priest', 2, 'p0', { cooldowns: { mend: 2 } });
  const knight = makeHeroCombatant('knight', 1, 'p1', { currentHp: 5 });
  const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
  const state = makeTestState([priest, knight], [e0]);
  const picked = pickAbility(priest, state, rng);
  expect(picked?.abilityId).toBe('bless');
});
```

### `src/combat/__tests__/helpers.ts` updates

Both `makeHeroCombatant` and `makeEnemyCombatant` need to:
1. Default `cooldowns: {}` on the produced Combatant.
2. Accept an optional `cooldowns` field on the overrides object so tests can seed cooldowns.

### Adjustment to existing tests

Cooldowns on `mend` and `dark_pact` change the rhythm of attrition fights. The exhaustion-mechanic tests (added 2026-04-25) might shift round counts by 1-2. Expected impact: **2-4 numeric assertion tweaks**, no logic regressions. Will adjust inline as the test suite reveals them.

### Test count expectation

511 today → roughly **521-523** after this change (~10 new, ~0 deleted, 2-4 numeric tweaks).

## Edge cases

**Cooldown set on the cast turn.** Declared `cooldown: 2` set on turn T → stored as `3`. `tickCooldowns` at T+1 decrements `3→2` (skipped), T+2 `2→1` (skipped), T+3 `1→0` (deleted, available). The cast turn itself doesn't tick — the `+ 1` in `combat.ts` is what gives the declared count its caster-turn-aligned semantics.

**Combatant has no entry for an ability.** `cooldowns[id]` is `undefined`. The `?? 0 > 0` check correctly treats this as "not on cooldown."

**Stun mid-cooldown.** Cooldowns tick during the stunned turn (because `tickCooldowns` runs *before* the stun check). Equivalent to "stunned time still passes for cooldowns."

**Death mid-cooldown.** Cooldowns freeze on dead combatants (turn body skipped via `continue`). Tier 1 has no revive; this is academic.

**Battle ends mid-cooldown.** Cooldowns are discarded with the `CombatState` at battle end. Next battle starts with empty cooldowns. No carry-over.

**Multiple cooldowns simultaneously.** A combatant can have multiple abilities on cooldown at once. `tickCooldowns` decrements all of them independently. `pickAbility` skips each on-cooldown ability and tries the next.

**Combatant with all abilities on cooldown.** `pickAbility` returns null. Combat loop falls through to `shuffle`. Same path as "no valid targets for any ability." Not a deadlock — at least one combatant per turn isn't on a max-cooldown rotation, and even a fully cooldowned-out combatant just shuffles for one turn until something becomes available.

## Risks

1. **Existing combat tests may shift round counts.** Heals on cooldown change attrition speed. Expect 2-4 numeric tweaks in `combat.test.ts`. Visible immediately on test run; fix inline.

2. **The combatant factories in `combat/combatant.ts` need `cooldowns: {}` defaulted.** Strict mode catches the missing required field; `buildCombatState` and all tests flow through these factories, so updating them once covers every call site.

3. **Determinism re-verification.** A 5-seed determinism test should still pass. If anything diverges, the bug is in cloning or shared state, not in cooldown logic itself (which is pure data).

4. **Balance shift on Cultist encounters.** Cultists could feel too easy now. The correct response (if playtest shows it) is HP/damage tuning in `enemies.ts`, not reverting cooldowns. Tracked as a follow-up consideration, not a blocker.

5. **AI behavior change visible to the player.** Archer now uses Volley every third turn. Combat playback (`combat_playback.ts`) already handles AoE casts (look-ahead batching per task 17 HISTORY). No rendering work needed.

## Rejected alternatives

- *Track cooldowns globally on `CombatState` as `Map<CombatantId, Map<AbilityId, number>>`.* Complicates ownership; breaks "everything about a combatant lives on the combatant" pattern. Rejected.
- *Emit `cooldown_set` / `cooldown_ticked` events.* Not needed — playback doesn't surface cooldowns visually in this task. Add if Tier 2 wants the UI.
- *Decrement at end of turn instead of start.* Cooldown 2 would mean "skip 1 turn" — confusing. Start-of-turn-tick matches `tickStatuses` exactly.
- *`Map<AbilityId, number>`* instead of `Record`. Records survive `structuredClone` cleanly and match the existing `statuses` shape.
- *Cooldown 1 for heals, 2 for archer specials.* Heal-every-other-turn is still substantial heal pressure. All four at 2 is the cleanest starting point.
- *AI hint system instead of cooldowns* (Approach C from brainstorm Q1). More vocabulary; less generic; the auto-battler standard is cooldowns.
- *Tier 1 cooldown pass on `volley`, `necrotic_wave`, `shield_bash`, `smite`* (Approach C from brainstorm Q3). Scope creep. Better as a follow-up balance pass after playtesting.

## Acceptance criteria

- `Ability` has optional `cooldown?: number`.
- `Combatant` has required `cooldowns: Record<AbilityId, number>`.
- `tickCooldowns` decrements and drops zeros; `setCooldown` sets the value.
- Combat loop calls `tickCooldowns` after `tickStatuses` (per turn, before stun check); calls `setCooldown` after a successful cast iff the ability declares a cooldown.
- `pickAbility` skips abilities where the caster's cooldown for that id is > 0.
- `mend`, `dark_pact`, `flare_arrow`, `piercing_shot` all have `cooldown: 2`.
- Cultist `aiPriority` reverted to `['dark_pact', 'dark_bolt']`; test-fixture comment removed.
- Both `bugs.md` entries removed.
- All existing tests pass (with at most 2-4 numeric assertion tweaks).
- 10+ new tests cover cooldown helpers and `pickAbility` skip behavior.
- Manual smoke test: a Cultist encounter resolves in a reasonable round count (no exhaustion-driven wipe). Watching an archer fight, Volley fires on the 3rd turn after each flare/piercing pair.
- `npx tsc --noEmit` clean, `npm run build` succeeds.
