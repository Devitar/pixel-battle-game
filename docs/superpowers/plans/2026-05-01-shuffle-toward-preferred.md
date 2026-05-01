# Combat AI — Shuffle Toward Preferred Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify `pickAbility` in `src/combat/ability_priority.ts` so heroes at non-preferred slots prefer shuffle over wrong-feeling lower-priority casts. Specifically: when the would-be pick is at index `i > 0` in `aiPriority` AND a higher-priority ability is blocked SOLELY by `canCastFrom` (not cooldown), return `null` instead — letting `combat.ts` trigger the existing shuffle path.

**Architecture:** TDD-style single task. Engine-only change in one file (`ability_priority.ts`); update one existing test that asserts the bug, add five new unit tests covering the rule + cooldown exclusion + Priest parallel, plus one combat-integration test. No data layer touched (no `preferredSlots` added to hero classes — the priority list is the source of truth, and the existing shuffle-direction fallback handles all current bug cases). No enemy AI change (surveyed — the rule cannot fire for any current enemy).

**Tech Stack:** TypeScript, Vitest. Pure-TS combat layer (Phaser firewall preserved).

**Spec:** `docs/superpowers/specs/2026-05-01-shuffle-toward-preferred-design.md`. Read before starting — note especially §2 (the bug map per class) and §3 (the rule) for context.

---

## Task 1: Add shuffle-toward-preferred rule to `pickAbility`

Single task with TDD ordering. Each behavior change is preceded by a failing test that exposes the regression we're closing. The existing buggy test gets flipped after the fix lands so the suite reads consistently.

**Files:**
- Modify: `src/combat/ability_priority.ts`
- Modify: `src/combat/__tests__/ability_priority.test.ts`
- Modify: `src/combat/__tests__/combat.test.ts`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL 1324 tests pass. Note the count for the post-change comparison (target: 1330 = 1324 + 6 new; one existing test flips its assertion, no count change from it).

- [ ] **Step 1.2: Add the five new failing tests in `ability_priority.test.ts`**

Open `src/combat/__tests__/ability_priority.test.ts`. The file currently has one `describe('pickAbility', ...)` block (lines 6–54) with five tests. Add the five new tests inside the same describe block, after the existing "skips abilities whose cooldown > 0" test (currently the last):

```ts
  it('returns null when higher-priority abilities are slot-blocked', () => {
    const rng = createRng(1);
    const knight = makeHeroCombatant('knight', 3, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([knight], [e0]);
    expect(pickAbility(knight, state, rng)).toBeNull();
  });

  it('does NOT prefer shuffle when the higher-priority is blocked by cooldown', () => {
    const rng = createRng(1);
    const knight = makeHeroCombatant('knight', 3, 'p0', { cooldowns: { shield_bash: 2 } });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([knight], [e0]);
    expect(pickAbility(knight, state, rng)?.abilityId).toBe('bulwark');
  });

  it('returns the highest priority when castable from current slot', () => {
    const rng = createRng(1);
    const knight = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([knight], [e0]);
    expect(pickAbility(knight, state, rng)?.abilityId).toBe('shield_bash');
  });

  it('does not prefer shuffle when higher-priority is castable from current slot', () => {
    const rng = createRng(1);
    const knight = makeHeroCombatant('knight', 2, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([knight], [e0]);
    expect(pickAbility(knight, state, rng)?.abilityId).toBe('shield_bash');
  });

  it('Priest at slot 1 prefers shuffle over priest_strike', () => {
    const rng = createRng(1);
    const priest = makeHeroCombatant('priest', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([priest], [e0]);
    expect(pickAbility(priest, state, rng)).toBeNull();
  });
```

- [ ] **Step 1.3: Flip the existing buggy assertion**

In the same file, find the existing test at lines 17–24:

```ts
  it('falls through when caster slot is not in canCastFrom', () => {
    const rng = createRng(1);
    const archer = makeHeroCombatant('archer', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([archer], [e0]);
    const picked = pickAbility(archer, state, rng);
    expect(picked?.abilityId).toBe('archer_shoot');
  });
```

Replace it with:

```ts
  it('returns null when only lower-priority abilities are castable from current slot', () => {
    const rng = createRng(1);
    const archer = makeHeroCombatant('archer', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([archer], [e0]);
    const picked = pickAbility(archer, state, rng);
    // Higher-priority abilities (flare_arrow, piercing_shot, volley) are
    // canCastFrom-blocked; engine prefers shuffle so the Archer can reach
    // slot 2 where the full kit unlocks.
    expect(picked).toBeNull();
  });
```

The test name reflects the new behavior; the comment explains why this isn't `archer_shoot` anymore.

- [ ] **Step 1.4: Add the failing combat-integration test in `combat.test.ts`**

Open `src/combat/__tests__/combat.test.ts`. Find the `describe('resolveCombat — scripted scenarios', ...)` block (around line 30). Add this test inside it:

```ts
  it('Knight at non-preferred slot shuffles toward the front in round 1', () => {
    const knight = makeHeroCombatant('knight', 3, 'p0');
    const archer = makeHeroCombatant('archer', 2, 'p1');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('zombie', 2, 'e1');
    const state = makeTestState([knight, archer], [e0, e1]);
    const result = resolveCombat(state, createRng(1));
    const knightShuffle = result.events.find(
      (e) => e.kind === 'shuffle' && e.combatantId === 'p0',
    );
    expect(knightShuffle).toBeDefined();
  });
```

The 2-hero party is required because `shuffle()` uses `maxSlot = sameSide.length` — a solo party has maxSlot=1 and shuffle is a no-op.

- [ ] **Step 1.5: Verify the bug-exposing tests fail**

Run: `npx vitest run src/combat/__tests__/ability_priority.test.ts src/combat/__tests__/combat.test.ts 2>&1 | tail -40`

Expected: **4 failures total**, all asserting behavior the current engine doesn't produce:
- `ability_priority.test.ts`: 3 failures
  - "returns null when higher-priority abilities are slot-blocked" (Knight at slot 3 — pre-fix returns `bulwark`, expects `null`).
  - "Priest at slot 1 prefers shuffle over priest_strike" (pre-fix returns `priest_strike`, expects `null`).
  - "returns null when only lower-priority abilities are castable…" (the flipped test — pre-fix returns `archer_shoot`, now expects `null`).
- `combat.test.ts`: 1 failure
  - "Knight at non-preferred slot shuffles toward the front in round 1" (pre-fix produces no shuffle event for p0).

The other three new tests (#2 cooldown-exclusion, #3 Knight-at-slot-1, #4 Knight-at-slot-2) assert behavior the existing engine already produces — they should PASS pre-fix and continue to pass post-fix. They're guard tests that pin "the rule doesn't accidentally fire when it shouldn't."

The point of this step is confirming the failing-test set covers the bug — exact counts are informational.

- [ ] **Step 1.6: Implement the rule in `ability_priority.ts`**

Open `src/combat/ability_priority.ts`. Replace the entire file with:

```ts
import { ABILITIES } from '../data/abilities';
import type { AbilityId, AiCondition } from '../data/types';
import type { Rng } from '../util/rng';
import { resolveTargetSelector } from './target_selector';
import type { Combatant, CombatantId, CombatState } from './types';

export interface PickedAction {
  abilityId: AbilityId;
  targetIds: readonly CombatantId[];
}

export function pickAbility(caster: Combatant, state: CombatState, rng: Rng): PickedAction | null {
  for (let i = 0; i < caster.aiPriority.length; i++) {
    const abilityId = caster.aiPriority[i];
    const ability = ABILITIES[abilityId];
    if ((caster.cooldowns[abilityId] ?? 0) > 0) continue;
    if (!ability.canCastFrom.includes(caster.slot)) continue;
    const targetIds = resolveTargetSelector(ability.target, caster, state, rng);
    if (targetIds.length === 0) continue;
    if (ability.aiCondition && !checkAiCondition(ability.aiCondition, caster, targetIds)) continue;

    // If a higher-priority ability is blocked SOLELY by canCastFrom, prefer
    // shuffle over this lower-priority pick. Avoids the Knight-at-slot-3
    // -spamming-Bulwark anti-pattern where the engine never reaches the
    // null/shuffle path because a self-buff or basic Attack is always castable.
    if (i > 0 && hasShufflableHigherPriority(caster, i)) return null;

    return { abilityId, targetIds };
  }
  return null;
}

function hasShufflableHigherPriority(caster: Combatant, currentIndex: number): boolean {
  for (let j = 0; j < currentIndex; j++) {
    const abilityId = caster.aiPriority[j];
    const ability = ABILITIES[abilityId];
    if ((caster.cooldowns[abilityId] ?? 0) > 0) continue;  // cooldown blocks regardless of slot
    if (ability.canCastFrom.includes(caster.slot)) continue;  // not slot-blocked from here
    return true;  // slot-blocked, otherwise-available higher priority found
  }
  return false;
}

function checkAiCondition(
  cond: AiCondition,
  caster: Combatant,
  targetIds: readonly CombatantId[],
): boolean {
  switch (cond.kind) {
    case 'minTargets':
      return targetIds.length >= cond.n;
    case 'casterHpBelow':
      return caster.maxHp > 0 && caster.currentHp / caster.maxHp < cond.ratio;
  }
}
```

Changes from current file:
- `for ... of` loop becomes indexed `for (let i = 0; ...)` so the new rule can reference position.
- New early-return after the candidate is fully validated: `if (i > 0 && hasShufflableHigherPriority(caster, i)) return null;`.
- New private `hasShufflableHigherPriority` helper.
- `checkAiCondition` unchanged.

- [ ] **Step 1.7: Verify the new tests + flipped existing test pass**

Run: `npx vitest run src/combat/__tests__/ability_priority.test.ts src/combat/__tests__/combat.test.ts`

Expected: ALL pass — the 5 new ability_priority tests, the new combat-integration test, the flipped existing test, and every other test in both files (existing tests stay seed-stable since the affected file's other tests use heroes at preferred slots).

- [ ] **Step 1.8: Run the full test suite + tsc + build**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: green / green (1330 tests, +6 from baseline) / build succeeds. If any other test in the suite fails, it's likely a seed-stability issue from a hero placed at a non-preferred slot somewhere I missed in the survey — investigate before proceeding.

- [ ] **Step 1.9: Commit**

```bash
git add src/combat/ability_priority.ts src/combat/__tests__/ability_priority.test.ts src/combat/__tests__/combat.test.ts
git commit -m "fix(combat): prefer shuffle when higher-priority abilities are slot-blocked

Knights at slot 3, Archers at slot 1, Priests at slot 1 were locked
out of their roles — the engine returned a low-priority self-buff or
basic Attack instead of triggering shuffle. pickAbility now returns
null when a higher-priority ability is blocked solely by canCastFrom,
letting the existing shuffle path move the hero toward where their
kit unlocks."
```

(Per CLAUDE.md, commits land at user direction — leave this step gated until the user explicitly asks to commit.)

---

## Closing checklist

- [ ] **Single task landed in 1 commit** with green tests + tsc + build.
- [ ] **Combat firewall preserved** — `ability_priority.ts` is pure TS, no Phaser imports.
- [ ] **No data-layer changes** — `data/classes.ts`, `data/abilities.ts`, `data/enemies.ts` untouched.
- [ ] **No enemy AI change observed** — combat tests with enemies stay seed-stable. (Survey in spec §1: every current enemy's priority list either has a single ability or uniform canCastFrom across all entries; the rule cannot fire.)
- [ ] **Test count delta:** +6 (1324 → 1330). Five new unit tests in `ability_priority.test.ts` + one combat-integration in `combat.test.ts`. The existing "falls through" test was flipped, not added.
- [ ] **Manual play verification:** Start a Crypt run with a Knight in slot 3 (drag formation). Round 1 should produce a shuffle event for the Knight (visible in the combat playback's position-changed animation), not a Bulwark cast. By round 3 or so, Knight should be at slot 1 casting Shield Bash.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster B · 26 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commit, awaiting user direction per CLAUDE.md.
