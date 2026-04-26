# Combat Exhaustion — Soft-Cap Replacement for Round Timeout

**Status:** Design · **Date:** 2026-04-25

## Purpose

Replace the hard 30-round timeout in `src/combat/combat.ts` with a soft cap that guarantees combat resolution. Long fights now accrue an "exhaustion" amplifier on the player party that grows over time, so eventually one side dies instead of the fight being declared a wipe at an arbitrary cutoff.

## Behavior

- **Threshold:** at the start of round 100, the player party becomes exhausted at level 1 (10% extra damage taken).
- **Ramp:** every 5 rounds after that (rounds 105, 110, 115, …), the level increments by 1, adding another 10%. There is no upper limit on level.
- **Effect:** for any damage instance whose target is on the player side, the final damage (after defense subtraction and any mark bonus) is multiplied by `1 + 0.10 × exhaustionLevel`, then floored at 1. Enemies are unaffected.
- **No cleanup:** exhaustion is a battle-wide condition that persists for the rest of the fight. There is no expiration, no removal, and no per-combatant status entry.
- **Outcome:** the `'timeout'` outcome is removed. With exhaustion ramping unbounded, the fight always resolves to `'player_victory'` or `'player_defeat'`.
- **Safety cap:** `ROUND_CAP` is set to 1000. Hitting it is a bug (exhaustion at level 181 = 1810% extra damage makes survival impossible long before this), so if reached, outcome is `'player_defeat'` and an event is emitted, but no separate outcome variant is added.

## Design choices

**Track exhaustion as global state on `CombatState`, not per-combatant statuses.** Exhaustion is a property of the battle, not of individuals. Putting it on `CombatState` avoids:
- A new `AbilityEffect` kind for "damage taken multiplier."
- Bookkeeping when heroes die (stale `exhausted` entries) or when they revive (would need re-application).
- A new `StatusId` literal for what isn't a real status (no duration, no stacking semantics, no source).

The damage formula in `effects.ts` already reads target-side state via the `mark` status; reading one more global field is a tiny addition.

## Type changes

In `src/combat/types.ts`:

```ts
export interface CombatState {
  combatants: Combatant[];
  round: number;
  exhaustionLevel: number;   // new — 0 until round 100
}

export type CombatOutcome = 'player_victory' | 'player_defeat';   // 'timeout' removed

export type CombatEvent =
  | …existing variants…
  | { kind: 'exhaustion_applied'; level: number };   // new
```

`CombatState` initializers in tests (`__tests__/helpers.ts:makeTestState`) and any production callers must set `exhaustionLevel: 0`.

## Combat loop changes (`src/combat/combat.ts`)

- `ROUND_CAP = 30` → `ROUND_CAP = 1000`.
- Remove the `hitCap` flag and `computeOutcome`'s timeout branch. Outcome is purely "who's still alive."
- At the top of each round (after setting `state.round = round`, before initiative), check:
  - If `round === 100`: set `state.exhaustionLevel = 1`, emit `{ kind: 'exhaustion_applied', level: 1 }`.
  - Else if `round > 100 && (round - 100) % 5 === 0`: increment `state.exhaustionLevel`, emit event.
- `bothSidesAlive` exit logic stays the same.

## Damage formula change (`src/combat/effects.ts:applyDamage`)

Pass `state` into `applyDamage` (currently it doesn't receive it; `applyEffect` does and would forward). After the existing computation:

```ts
const final = Math.max(1, raw - getEffectiveStat(target, 'defense'));
let amplified = final;
if (target.side === 'player' && state.exhaustionLevel > 0) {
  amplified = Math.max(1, Math.round(final * (1 + 0.10 * state.exhaustionLevel)));
}
target.currentHp -= amplified;
```

The damage-floor of 1 is preserved. Heals are not amplified — exhaustion is one-sided in stat AND in direction (extra damage taken, not reduced healing).

## Caller updates

- `src/run/run_state.ts:93` currently treats `'timeout'` as a wipe. After this change, the `|| result.outcome === 'timeout'` clause is dead and is removed.
- `src/run/__tests__/run_state.test.ts` — the "timeout triggers wipe" test (line 134) is removed (no longer reachable).
- `src/combat/__tests__/combat.test.ts`:
  - Line 53: "no-damage matchup times out at 30 rounds" — rewritten. With `attack: 1, defense: 100` on both sides and exhaustion amplifying only the player, after enough exhaustion ticks the player dies. New assertion: `outcome === 'player_defeat'` and the events include at least one `exhaustion_applied`.
  - Line 96: the Crypt-boss scenario's allowed-outcomes list drops `'timeout'`.

## Tests to add

In `src/combat/__tests__/combat.test.ts`:

1. **Exhaustion does not kick in before round 100.** A long stalemate that ends at round 99 (e.g., one side has just enough damage to win on round 99) emits no `exhaustion_applied` events.
2. **Exhaustion applies at round 100 with level 1.** A controlled stalemate hits round 100 and emits `{ kind: 'exhaustion_applied', level: 1 }`. The next damage event against the player has its amount inflated by ~10% relative to the same instance pre-100.
3. **Exhaustion ramps every 5 rounds.** A long stalemate emits `level: 1, 2, 3, …` at rounds 100, 105, 110, …
4. **Exhaustion only affects the player side.** In a stalemate, after round 100 the player's effective HP loss per matched exchange exceeds the enemy's. Implementation-level: assert no enemy `damage_applied` events are amplified — i.e., enemy damages stay at their pre-exhaustion values.
5. **Combat eventually resolves.** A near-stalemate with exhaustion always ends in `player_victory` or `player_defeat` (never times out at the safety cap). Run with a few seeds.

## Out of scope

- UI/log rendering of the new event in the combat scene. The event is emitted; surfacing it in `src/scenes/CombatScene` (and any combat-log widget) is a follow-up if the user wants player-facing feedback.
- Tuning. The 100/5/10% numbers are the user's spec; balance review can adjust them later.
- Enemy-side exhaustion or two-sided exhaustion variants.
- Persistence. Exhaustion lives in `CombatState`, which is already covered by save/load if combat-in-progress saves exist; no extra serialization work.
