# Combat Exhaustion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `src/combat/combat.ts`'s 30-round timeout-as-wipe with a soft cap that ramps an "exhaustion" damage multiplier on the player party, so long fights resolve to a real victory or defeat instead of an arbitrary cutoff.

**Architecture:** Five sequenced tasks. (1) Plumb the new `exhaustionLevel` field through `CombatState` and add the `exhaustion_applied` event — pure type/initializer changes that leave behavior unchanged. (2) Add the damage-amplification read in `applyDamage` (no level is ever non-zero yet, so still no behavioral diff in practice). (3) Bump `ROUND_CAP` to 1000 and add the level-bumping logic at round 100 / every 5 rounds with event emission. (4) Remove the now-dead `'timeout'` outcome and update the four touchpoints that reference it. (5) Add the remaining exhaustion test coverage (no kick-in before 100, enemies unaffected, deterministic resolution).

**Tech Stack:** TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 4. No new files — purely modifications inside `src/combat/`, `src/run/`, and their `__tests__/`.

**Spec:** `docs/superpowers/specs/2026-04-25-combat-exhaustion-design.md`

**Per-project convention (`CLAUDE.md`):** commits happen only on explicit user instruction. Each task ends with a commit step listed for completeness — when running this plan, only execute the commit step if the user has authorized commits in the current turn.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/combat/types.ts` | **Modify** | Add `exhaustionLevel: number` to `CombatState`. Remove `'timeout'` from `CombatOutcome`. Add `{ kind: 'exhaustion_applied'; level: number }` to `CombatEvent`. |
| `src/combat/__tests__/helpers.ts` | **Modify** | `makeTestState` returns `{ combatants: […], round: 0, exhaustionLevel: 0 }`. |
| `src/run/combat_setup.ts` | **Modify** | `buildCombatState` returns `{ combatants, round: 0, exhaustionLevel: 0 }`. |
| `src/run/__tests__/run_state.test.ts` | **Modify** | `mockCombatResult` builds state with `exhaustionLevel: 0`. Drop the "timeout triggers wipe" test and rename the surrounding `describe`. |
| `src/combat/effects.ts` | **Modify** | `applyDamage` receives `state` and amplifies final damage on player-side targets by `1 + 0.10 × state.exhaustionLevel`. `applyEffect`'s damage branch forwards `state`. |
| `src/combat/combat.ts` | **Modify** | `ROUND_CAP = 1000`. Initialize `state.exhaustionLevel = 0` after the structuredClone. At the start of each round, bump `exhaustionLevel` and emit the event when round ≥ 100 on the right cadence. Drop `hitCap` flag and the `'timeout'` outcome branch. |
| `src/run/run_state.ts` | **Modify** | `completeCombat` no longer references `'timeout'`. |
| `src/combat/__tests__/combat.test.ts` | **Modify** | Rewrite "no-damage matchup times out at 30 rounds" → exhaustion-resolves test. Drop `'timeout'` from the Crypt-boss allowed-outcomes list. Add new exhaustion tests. |

---

## Task 1: Plumb `exhaustionLevel` through types and state initializers

**Goal:** Every `CombatState` value in the codebase has a real `exhaustionLevel: number` field. No behavioral change yet — `'timeout'` stays in the outcome union and the field is read by no one.

**Files:**
- Modify: `src/combat/types.ts:49-70`
- Modify: `src/combat/__tests__/helpers.ts:7-15`
- Modify: `src/run/combat_setup.ts:48`
- Modify: `src/run/__tests__/run_state.test.ts:31`

- [ ] **Step 1: Add `exhaustionLevel` to `CombatState` and the new event variant**

In `src/combat/types.ts`, edit the `CombatState` interface (currently lines 49-52):

```ts
export interface CombatState {
  combatants: Combatant[];
  round: number;
  exhaustionLevel: number;
}
```

In the same file, extend the `CombatEvent` union (currently lines 56-70) — add a new variant before the closing `;` of the existing last variant. The full union becomes:

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
  | { kind: 'exhaustion_applied'; level: number }
  | { kind: 'combat_end'; outcome: CombatOutcome };
```

Leave `CombatOutcome` alone in this task (still includes `'timeout'`).

- [ ] **Step 2: Update the test-helper builder**

In `src/combat/__tests__/helpers.ts`, edit `makeTestState` (currently lines 7-15):

```ts
export function makeTestState(
  heroes: readonly Combatant[],
  enemies: readonly Combatant[],
): CombatState {
  return {
    combatants: [...heroes, ...enemies],
    round: 0,
    exhaustionLevel: 0,
  };
}
```

- [ ] **Step 3: Update `buildCombatState`**

In `src/run/combat_setup.ts:48`, change:

```ts
return { combatants, round: 0 };
```

to:

```ts
return { combatants, round: 0, exhaustionLevel: 0 };
```

- [ ] **Step 4: Update the `mockCombatResult` helper in `run_state.test.ts`**

In `src/run/__tests__/run_state.test.ts:31`, change:

```ts
const state: CombatState = { combatants, round: 1 };
```

to:

```ts
const state: CombatState = { combatants, round: 1, exhaustionLevel: 0 };
```

- [ ] **Step 5: Typecheck and run all tests**

Run: `npx tsc --noEmit`
Expected: clean — all `CombatState` constructions compile.

Run: `npm test`
Expected: existing test suite still passes (current test count, no failures, no new tests yet). The behavior is unchanged because no code reads `exhaustionLevel` yet.

- [ ] **Step 6: Commit (only if user has authorized commits this turn)**

```bash
git add src/combat/types.ts src/combat/__tests__/helpers.ts src/run/combat_setup.ts src/run/__tests__/run_state.test.ts
git commit -m "combat: plumb exhaustionLevel field and exhaustion_applied event"
```

---

## Task 2: Apply exhaustion multiplier in the damage formula (TDD)

**Goal:** When a player-side target takes damage, the final damage is multiplied by `1 + 0.10 × state.exhaustionLevel` (floored at 1, rounded). Enemies are not amplified. Heals are not amplified. With `exhaustionLevel: 0` (the only value reachable so far), behavior is unchanged.

**Files:**
- Modify: `src/combat/effects.ts:19-46` (`applyDamage` signature and body), `src/combat/effects.ts:83-121` (`applyEffect` damage branch forwards `state`).
- Test: `src/combat/__tests__/effects.test.ts` (likely exists; if not, the test goes in `src/combat/__tests__/combat.test.ts` — see step 1).

- [ ] **Step 1: Locate or create the effects test file**

Run: `ls src/combat/__tests__/`
Expected output should include `effects.test.ts`. If it does, add the new test there. If it does not, add the new test to the bottom of `src/combat/__tests__/combat.test.ts` inside a new `describe('resolveCombat — exhaustion', () => { … })` block.

- [ ] **Step 2: Write the failing test for player-side damage amplification**

This test exercises the engine end-to-end so we don't have to call `applyDamage` directly. It builds a state with `exhaustionLevel: 2` (20% extra damage) injected manually, runs one round, and asserts the player took ~20% more damage than they would at level 0.

Add to the chosen test file:

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../../util/rng';
import { resolveCombat } from '../combat';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

describe('exhaustion — damage amplification', () => {
  it('amplifies damage taken on player side by 10% per level, rounded, floor 1', () => {
    // A controlled 1v1 where the enemy reliably hits the hero on round 1.
    const hero = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 5, defense: 0, speed: 1 },
      currentHp: 100,
      maxHp: 100,
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 10, defense: 0, speed: 99 },
      currentHp: 100,
      maxHp: 100,
    });

    const baseline = makeTestState([hero], [enemy]);
    const baselineResult = resolveCombat(baseline, createRng(1));
    const baselineDamage = (baselineResult.events.find(
      (e) => e.kind === 'damage_applied' && e.targetId === 'p0',
    ) as { amount: number }).amount;

    const amped = makeTestState([hero], [enemy]);
    amped.exhaustionLevel = 3; // 30% extra damage
    const ampedResult = resolveCombat(amped, createRng(1));
    const ampedDamage = (ampedResult.events.find(
      (e) => e.kind === 'damage_applied' && e.targetId === 'p0',
    ) as { amount: number }).amount;

    expect(ampedDamage).toBe(Math.max(1, Math.round(baselineDamage * 1.30)));
  });

  it('does not amplify damage on enemy side', () => {
    const hero = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 10, defense: 0, speed: 99 },
      currentHp: 100,
      maxHp: 100,
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 5, defense: 0, speed: 1 },
      currentHp: 100,
      maxHp: 100,
    });

    const baseline = makeTestState([hero], [enemy]);
    const baselineResult = resolveCombat(baseline, createRng(2));
    const baselineDamage = (baselineResult.events.find(
      (e) => e.kind === 'damage_applied' && e.targetId === 'e0',
    ) as { amount: number }).amount;

    const amped = makeTestState([hero], [enemy]);
    amped.exhaustionLevel = 5; // would be +50% if it applied
    const ampedResult = resolveCombat(amped, createRng(2));
    const ampedDamage = (ampedResult.events.find(
      (e) => e.kind === 'damage_applied' && e.targetId === 'e0',
    ) as { amount: number }).amount;

    expect(ampedDamage).toBe(baselineDamage);
  });
});
```

- [ ] **Step 3: Run the new tests and verify they fail**

Run: `npx vitest run -t "exhaustion — damage amplification"`
Expected: both tests fail. The first because the amped damage equals the baseline (no amplification yet); the second test happens to pass already (no amplification still means equal). Confirm at least the first is red — that's enough to drive the implementation.

- [ ] **Step 4: Wire `state` through to `applyDamage`**

In `src/combat/effects.ts`, change the `applyDamage` signature (currently line 19) to accept `state`:

```ts
function applyDamage(
  caster: Combatant,
  target: Combatant,
  effect: Extract<AbilityEffect, { kind: 'damage' }>,
  ability: Ability,
  state: CombatState,
  events: CombatEvent[],
): void {
  const bonus = tagBonusMultiplier(ability, target);
  let raw = Math.round(effect.power * getEffectiveStat(caster, 'attack') * bonus);
  const mark = target.statuses['marked'];
  if (mark && mark.effect.kind === 'mark') {
    raw = Math.round(raw * (1 + mark.effect.damageBonus));
  }
  const final = Math.max(1, raw - getEffectiveStat(target, 'defense'));
  const amplified =
    target.side === 'player' && state.exhaustionLevel > 0
      ? Math.max(1, Math.round(final * (1 + 0.10 * state.exhaustionLevel)))
      : final;
  target.currentHp -= amplified;
  const lethal = target.currentHp <= 0;
  events.push({
    kind: 'damage_applied',
    sourceId: caster.id,
    targetId: target.id,
    amount: amplified,
    lethal,
  });
  if (lethal) {
    target.isDead = true;
    events.push({ kind: 'death', combatantId: target.id });
  }
}
```

- [ ] **Step 5: Update `applyEffect` to forward `state` into `applyDamage`**

In the same file, find `applyEffect` (currently line 83) and update its damage branch (currently line 93-94):

```ts
case 'damage':
  applyDamage(caster, target, effect, ability, state, events);
  return;
```

(`applyEffect` already receives `state` — line 88 — so no signature change is needed there.)

- [ ] **Step 6: Run the new tests and verify they pass**

Run: `npx vitest run -t "exhaustion — damage amplification"`
Expected: both pass.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: every previously-passing test still passes (since the only `exhaustionLevel` value created by production code is 0, the multiplier branch is dead, and behavior is unchanged for existing tests). Plus the two new tests are green.

- [ ] **Step 8: Commit (only if user has authorized commits this turn)**

```bash
git add src/combat/effects.ts src/combat/__tests__/
git commit -m "combat: amplify damage taken on player side by exhaustion level"
```

---

## Task 3: Bump exhaustion in the combat loop (TDD)

**Goal:** `ROUND_CAP` becomes 1000. Starting at the top of round 100, `state.exhaustionLevel` is set to 1 and an `exhaustion_applied` event is emitted. Every 5 rounds after that (105, 110, 115, …), level increments by 1 and a new event fires. The `'timeout'` outcome is not yet removed (Task 4); it just becomes much harder to reach.

**Files:**
- Modify: `src/combat/combat.ts:17` (`ROUND_CAP`), `src/combat/combat.ts:35-100` (the main loop).
- Test: same file as Task 2's tests.

- [ ] **Step 1: Write the failing test for the level-1 trigger**

Add inside the same `describe('exhaustion — damage amplification', …)` block (or a new `describe('exhaustion — round triggers', …)` — either is fine):

```ts
describe('exhaustion — round triggers', () => {
  it('sets level 1 and emits event at the top of round 100', () => {
    // True stalemate: 1 attack vs 1000 defense → 0 raw damage, floored to 1 per hit. 100 hp each.
    // At round 100 exhaustion kicks in; at 10% nothing changes (still floor of 1).
    // The point of this test is just the event + level, not damage outcome.
    const hero = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 1, defense: 1000, speed: 3 },
      currentHp: 100,
      maxHp: 100,
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 1, defense: 1000, speed: 3 },
      currentHp: 100,
      maxHp: 100,
    });
    const initial = makeTestState([hero], [enemy]);
    const result = resolveCombat(initial, createRng(1));

    const events = result.events.filter((e) => e.kind === 'exhaustion_applied') as Array<{
      kind: 'exhaustion_applied';
      level: number;
    }>;
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].level).toBe(1);
  });

  it('ramps level by 1 every 5 rounds after round 100', () => {
    const hero = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 1, defense: 1000, speed: 3 },
      currentHp: 100,
      maxHp: 100,
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 1, defense: 1000, speed: 3 },
      currentHp: 100,
      maxHp: 100,
    });
    const initial = makeTestState([hero], [enemy]);
    const result = resolveCombat(initial, createRng(1));

    const exhaustionEvents = result.events.filter(
      (e) => e.kind === 'exhaustion_applied',
    ) as Array<{ kind: 'exhaustion_applied'; level: number }>;

    // Levels emitted in order: 1, 2, 3, ...
    for (let i = 0; i < exhaustionEvents.length; i++) {
      expect(exhaustionEvents[i].level).toBe(i + 1);
    }
    // At least 3 levels emitted (means combat ran past round 110).
    expect(exhaustionEvents.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run: `npx vitest run -t "exhaustion — round triggers"`
Expected: both fail because (a) `ROUND_CAP = 30` makes the loop exit before round 100, and (b) no `exhaustion_applied` events are emitted yet.

- [ ] **Step 3: Update `ROUND_CAP` and the round loop**

In `src/combat/combat.ts`, change line 17:

```ts
const ROUND_CAP = 1000;
```

Then update the loop body (currently lines 47-100). Keep the existing structure but insert the exhaustion bump at the top of each round. The complete updated loop:

```ts
  let hitCap = false;

  for (let round = 1; round <= ROUND_CAP; round++) {
    state.round = round;

    if (round === 100) {
      state.exhaustionLevel = 1;
      events.push({ kind: 'exhaustion_applied', level: 1 });
    } else if (round > 100 && (round - 100) % 5 === 0) {
      state.exhaustionLevel += 1;
      events.push({ kind: 'exhaustion_applied', level: state.exhaustionLevel });
    }

    const order = computeInitiative(
      state.combatants.filter((c) => !c.isDead),
      rng,
    );
    events.push({ kind: 'round_start', round, order });

    let combatEndedMidRound = false;
    for (const id of order) {
      const combatant = state.combatants.find((c) => c.id === id);
      if (!combatant) continue;
      if (combatant.isDead) {
        events.push({ kind: 'turn_skipped', combatantId: id, reason: 'dead' });
        continue;
      }
      events.push({ kind: 'turn_start', combatantId: id });

      const willBeStunned = 'stunned' in combatant.statuses;
      tickStatuses(combatant, events);

      if (willBeStunned) {
        events.push({ kind: 'turn_skipped', combatantId: id, reason: 'stunned' });
      } else {
        const picked = pickAbility(combatant, state, rng);
        if (picked) {
          applyAbility(
            ABILITIES[picked.abilityId],
            combatant,
            picked.targetIds,
            state,
            rng,
            events,
          );
        } else {
          events.push({ kind: 'shuffle', combatantId: id });
          shuffle(combatant, state, events);
        }
      }

      if (!bothSidesAlive(state)) {
        combatEndedMidRound = true;
        break;
      }
    }

    events.push({ kind: 'round_end', round });

    if (combatEndedMidRound) break;
    if (round === ROUND_CAP && bothSidesAlive(state)) {
      hitCap = true;
      break;
    }
  }
```

(`hitCap` and the `'timeout'` outcome stay in this task. They're removed in Task 4.)

- [ ] **Step 4: Initialize `exhaustionLevel` defensively in `resolveCombat`**

Even though every `CombatState` constructor sets `exhaustionLevel: 0` (Task 1), defend against a stale clone path. Right after the `structuredClone` (currently line 36), add:

```ts
  const state: CombatState = structuredClone(initialState);
  state.exhaustionLevel = state.exhaustionLevel ?? 0;
```

- [ ] **Step 5: Run the new tests and verify they pass**

Run: `npx vitest run -t "exhaustion — round triggers"`
Expected: both pass.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all previously-passing tests still pass, including the existing "no-damage matchup times out at 30 rounds" test — that one is still green at this point because `'timeout'` still exists, and a stalemate now hits `ROUND_CAP=1000` rather than 30, but eventually exhaustion ramps high enough to break it. Actually verify — if the existing "no-damage" test now resolves to `player_defeat` instead of `'timeout'` because exhaustion eventually kills the hero, this test will fail. **If it fails, that's expected and gets fixed in Task 4.** Note the failure and move on (do not fix it here — Task 4 owns it).

If the existing "no-damage" test fails: confirm the failure mode is `expected 'timeout', got 'player_defeat'` (or similar), then proceed.

- [ ] **Step 7: Commit (only if user has authorized commits this turn)**

```bash
git add src/combat/combat.ts src/combat/__tests__/
git commit -m "combat: ramp exhaustion at round 100 and every 5 rounds, bump cap to 1000"
```

---

## Task 4: Remove the `'timeout'` outcome and clean up callers

**Goal:** With exhaustion guaranteeing resolution, `'timeout'` is unreachable in practice. Remove it from the outcome union and from every caller. Hitting `ROUND_CAP` (the safety cap) is treated as `'player_defeat'`. Fix the existing tests that assumed `'timeout'`.

**Files:**
- Modify: `src/combat/types.ts:54` (remove `'timeout'`).
- Modify: `src/combat/combat.ts` (drop `hitCap` flag and the timeout outcome branch).
- Modify: `src/run/run_state.ts:93` (drop `|| result.outcome === 'timeout'`).
- Modify: `src/combat/__tests__/combat.test.ts:40-54` (rewrite no-damage test) and `:96` (drop `'timeout'` from allow-list).
- Modify: `src/run/__tests__/run_state.test.ts:121-140` (rename describe, delete timeout test).

- [ ] **Step 1: Update the outcome union**

In `src/combat/types.ts:54`, change:

```ts
export type CombatOutcome = 'player_victory' | 'player_defeat' | 'timeout';
```

to:

```ts
export type CombatOutcome = 'player_victory' | 'player_defeat';
```

- [ ] **Step 2: Simplify the combat-loop outcome path**

In `src/combat/combat.ts`, replace `computeOutcome` (currently lines 27-33):

```ts
function computeOutcome(state: CombatState): CombatOutcome {
  const playerAlive = livingBySide(state, 'player').length > 0;
  const enemyAlive = livingBySide(state, 'enemy').length > 0;
  if (playerAlive && !enemyAlive) return 'player_victory';
  return 'player_defeat';
}
```

In the same file, drop the `hitCap` tracking from `resolveCombat`. After Task 3's edit, remove the `let hitCap = false;` line and the `if (round === ROUND_CAP && bothSidesAlive(state)) { hitCap = true; break; }` block. Replace it with a plain unconditional break check after `combatEndedMidRound`:

```ts
    if (combatEndedMidRound) break;
    if (round === ROUND_CAP) break;
```

Update the call site near the end of `resolveCombat`:

```ts
  const outcome = computeOutcome(state);
```

(was `computeOutcome(state, hitCap)`).

- [ ] **Step 3: Update `completeCombat` in `run_state.ts`**

In `src/run/run_state.ts:93`, change:

```ts
if (result.outcome === 'player_defeat' || result.outcome === 'timeout') {
```

to:

```ts
if (result.outcome === 'player_defeat') {
```

- [ ] **Step 4: Rewrite the existing "no-damage matchup" test**

In `src/combat/__tests__/combat.test.ts`, find the test at line 40 (`'no-damage matchup times out at 30 rounds'`). Replace it with:

```ts
  it('extreme stalemate resolves via exhaustion to player_defeat', () => {
    const hero = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 1, defense: 100, speed: 3 },
      currentHp: 100,
      maxHp: 100,
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 1, defense: 100, speed: 3 },
      currentHp: 100,
      maxHp: 100,
    });
    const initial = makeTestState([hero], [enemy]);
    const result = resolveCombat(initial, createRng(1));
    expect(result.outcome).toBe('player_defeat');
    const exhaustionEvents = result.events.filter((e) => e.kind === 'exhaustion_applied');
    expect(exhaustionEvents.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 5: Drop `'timeout'` from the Crypt-boss test's allow-list**

In `src/combat/__tests__/combat.test.ts:96`, change:

```ts
    expect(['player_victory', 'player_defeat', 'timeout']).toContain(result.outcome);
```

to:

```ts
    expect(['player_victory', 'player_defeat']).toContain(result.outcome);
```

- [ ] **Step 6: Update `run_state.test.ts` — rename describe and delete the timeout test**

In `src/run/__tests__/run_state.test.ts:121`, rename:

```ts
describe('completeCombat — defeat or timeout', () => {
```

to:

```ts
describe('completeCombat — defeat', () => {
```

Then delete the entire `it('timeout triggers wipe', () => { … })` block at lines 134-140 (six lines including the closing `});`).

- [ ] **Step 7: Typecheck and run all tests**

Run: `npx tsc --noEmit`
Expected: clean. The TS compiler will complain about any remaining `'timeout'` references — fix them in place if found.

Run: `npm test`
Expected: full suite green. The "no-damage" test now passes via exhaustion-driven defeat; the timeout test is gone; everything else unchanged.

- [ ] **Step 8: Commit (only if user has authorized commits this turn)**

```bash
git add src/combat/types.ts src/combat/combat.ts src/run/run_state.ts src/combat/__tests__/combat.test.ts src/run/__tests__/run_state.test.ts
git commit -m "combat: remove timeout outcome — exhaustion guarantees resolution"
```

---

## Task 5: Round out exhaustion test coverage

**Goal:** Lock down two additional invariants from the spec that aren't yet covered: (a) no exhaustion fires before round 100, and (b) exhaustion-driven combats resolve deterministically across multiple seeds.

**Files:**
- Modify: `src/combat/__tests__/combat.test.ts` (or `effects.test.ts` if Task 2 placed exhaustion tests there).

- [ ] **Step 1: Add the "no exhaustion before round 100" test**

Add to the `describe('exhaustion — round triggers', …)` block from Task 3:

```ts
  it('emits no exhaustion events when combat ends before round 100', () => {
    // A normal Knight vs Skeleton Warrior fight resolves well under 30 rounds.
    const hero = makeHeroCombatant('knight', 1, 'p0');
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const initial = makeTestState([hero], [enemy]);
    const result = resolveCombat(initial, createRng(1));
    expect(result.outcome).toBe('player_victory');
    const exhaustionEvents = result.events.filter((e) => e.kind === 'exhaustion_applied');
    expect(exhaustionEvents).toHaveLength(0);
  });
```

- [ ] **Step 2: Add the deterministic-resolution test across multiple seeds**

```ts
  it('extreme stalemate always resolves (never hits the 1000-round safety cap) across seeds', () => {
    for (const seed of [1, 7, 42, 99, 12345]) {
      const hero = makeHeroCombatant('knight', 1, 'p0', {
        baseStats: { hp: 100, attack: 1, defense: 100, speed: 3 },
        currentHp: 100,
        maxHp: 100,
      });
      const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
        baseStats: { hp: 100, attack: 1, defense: 100, speed: 3 },
        currentHp: 100,
        maxHp: 100,
      });
      const initial = makeTestState([hero], [enemy]);
      const result = resolveCombat(initial, createRng(seed));
      expect(['player_victory', 'player_defeat']).toContain(result.outcome);
      // The round at the final round_end must be well below the cap of 1000.
      const lastRoundEnd = [...result.events]
        .reverse()
        .find((e) => e.kind === 'round_end') as { kind: 'round_end'; round: number } | undefined;
      expect(lastRoundEnd).toBeDefined();
      expect(lastRoundEnd!.round).toBeLessThan(500);
    }
  });
```

- [ ] **Step 3: Run the new tests**

Run: `npx vitest run -t "exhaustion"`
Expected: every exhaustion test (from Tasks 2, 3, 5) passes.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: full suite green.

Run: `npm run build`
Expected: succeeds — final sanity check that the type changes typecheck for the production build.

- [ ] **Step 5: Commit (only if user has authorized commits this turn)**

```bash
git add src/combat/__tests__/
git commit -m "combat: lock down exhaustion invariants with additional tests"
```

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| `exhaustionLevel` field on `CombatState` | Task 1 |
| `exhaustion_applied` event variant | Task 1 |
| `'timeout'` removed from `CombatOutcome` | Task 4 |
| Damage formula amplification on player side, floor 1, rounded | Task 2 |
| Heals not amplified | Task 2 (no heal change made; existing heal path untouched) |
| Enemies not amplified | Task 2 (test) |
| Threshold = 100, level 1 | Task 3 |
| Ramp every 5 rounds, +1 per step | Task 3 |
| `ROUND_CAP = 1000` safety cap | Task 3 |
| Hitting safety cap → `'player_defeat'` | Task 4 |
| `run_state.ts` `'timeout'` clause removed | Task 4 |
| Existing test rewrites (combat.test.ts, run_state.test.ts) | Task 4 |
| New tests (no-kick-before-100, enemies-unaffected, deterministic resolution) | Tasks 2, 3, 5 |

**Out-of-scope items confirmed unaddressed (per spec):** UI surfacing of `exhaustion_applied`, tuning of 100/5/10%, enemy-side or two-sided exhaustion, save/load (combat is one-shot — no in-progress combat is serialized; verified by absence of `CombatState` references under `src/save/`).

**Type consistency check:** `exhaustionLevel` (lowercase camel) used identically in `types.ts`, helpers, `combat_setup.ts`, mock builder, and the loop. Event variant uses `level: number` (not `exhaustionLevel`) — consistent across emit sites in Task 3 and the test reads in Tasks 3 and 5.

**Placeholder scan:** No "TBD," no vague "add validation," no abstract "similar to Task N" — every step shows the actual code or command. Step 5 in Task 3 anticipates a test failure and explicitly defers the fix to Task 4 with an expected error message. The `?? 0` defensive default in Task 3 Step 4 is a small belt-and-suspenders addition; it has no effect when callers behave correctly (which Task 1 ensures), so it's safe to include.
