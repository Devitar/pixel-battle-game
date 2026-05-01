# Combat AI — shuffle toward preferred slots — Design

- **TODO entry:** Cluster B · 26 (Combat AI — shuffle toward preferred slots).
- **Tier:** 2 (combat-engine quality on shipped classes).
- **Date:** 2026-05-01.

## 1 · Scope

Modify `pickAbility` in `src/combat/ability_priority.ts` so that when a hero's would-be pick is a lower-priority ability AND a higher-priority ability is blocked solely by `canCastFrom` (current slot not in the ability's allowed slots), the engine returns `null` instead — forcing the existing shuffle path in `combat.ts:111-113`. The change is purely engine-side; no class data, no shuffle-direction logic, no enemy data touched.

**Out of scope:**

- **Adding `preferredSlots` to hero class definitions.** The shuffle-direction fallback in `positions.ts:90-127` ("toward slot 1, forward if at slot 1") happens to produce correct results for all three affected classes in current 3-hero parties. Adding explicit hero `preferredSlots` would duplicate information already implicit in `aiPriority` × `canCastFrom`. Promote to explicit data the day a class needs different behavior than the priority-list-derived rule produces (likely a Tier 3 class — Hunter [3] in a 4-hero party with pet at [4], or Paladin [1,2]).
- **Changing the shuffle direction logic.** `positions.ts:shuffle` already correctly uses `preferredSlots` when present and falls back to a sensible default. Untouched.
- **Changing enemy AI.** Surveyed every enemy in `data/enemies.ts`: single-ability minions (skeleton_warrior, skeleton_archer, ghost, zombie) can't trigger the rule (loop never reaches `i > 0`); Cultist's two abilities share the same canCastFrom range; Bone Lich's three abilities all canCastFrom every slot. The rule never fires for any current enemy. Combat tests stay seed-stable.
- **Changing ability data.** No abilities get their `canCastFrom` narrowed; the engine handles the bug entirely.
- **Taunt-interaction designs from ideas.md #2.** A Knight at slot 3 casting Taunt is awkward, but the new rule plus subsequent turns will eventually push the Knight to slot 1; designing a "taunt re-fires only at preferred slot" rule is YAGNI today.
- **Save schema changes.** No new fields anywhere.

## 2 · The bug

`pickAbility` returns the first castable ability in `caster.aiPriority`. For three of the six Tier-2 classes, this produces a wrong-feeling cast or a permanent role lockout when the hero is at a non-preferred slot:

| Class | Bug slot | Priority list | What pickAbility returns | What should happen |
|---|---|---|---|---|
| Knight | 3 | `[shield_bash, bulwark, taunt, knight_slash]` | `bulwark` (or `taunt`) — castable self-buff | shuffle to slot 2 |
| Archer | 1 | `[flare_arrow, piercing_shot, volley, archer_shoot]` | `archer_shoot` — basic, slot-1 castable | shuffle to slot 2 |
| Priest | 1 | `[mend, bless, smite, priest_strike]` | `priest_strike` — basic, slot-1 castable | shuffle to slot 2 |

In all three cases, the hero's full kit is locked behind a `canCastFrom` they can't reach without moving — but the engine never produces a `shuffle` event because *something* is castable. The existing `pickAbility` returns null only when *nothing* is castable.

Three classes are already correct:

- **Barbarian**: every ability `canCastFrom [1, 2]` — full lockout at slot 3 produces null naturally.
- **Mage**: every ability `canCastFrom [2, 3]` — full lockout at slot 1 produces null naturally.
- **Rogue**: at slot 1, Vanish (canCastFrom [1, 2]) is the highest-priority castable; its effect self-relocates the Rogue to slot 3 via `moveToSlot`.

## 3 · The rule

At pickAbility time, after determining a candidate pick at index `i` in `aiPriority`:

- If `i === 0`, return the candidate (no higher priority exists).
- Otherwise, scan indices `0..i-1`:
  - If the earlier ability is on cooldown, skip it (cooldown blocks would still apply from any slot — shuffling won't help).
  - If `caster.slot ∈ ability.canCastFrom`, skip (not slot-blocked from here).
  - Otherwise, this is a slot-blocked otherwise-available higher priority → return `null` instead of the candidate.
- Otherwise, return the candidate.

The rule deliberately **ignores target-availability and aiCondition** when checking higher-priority blocks. Those are dynamic per-turn properties; the slot is positional and the hero can fix it by walking. Shuffling toward a "would be available" slot is the right move even if the higher-priority ability ends up blocked by another reason next turn.

The rule deliberately **does not** check whether the hero is at a "preferred" slot (no class-data lookup). The priority list itself encodes the hero's intent; if a higher-priority ability is reachable elsewhere, that elsewhere IS the preferred slot for this turn.

## 4 · Implementation

`src/combat/ability_priority.ts`:

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

The `for` loop now uses an index variable instead of `for ... of` so the new rule can reference position. `checkAiCondition` is unchanged. `hasShufflableHigherPriority` is the new private helper.

## 5 · Behavior trace

| Combatant | Slot | shield_bash CD? | Loop reaches | Rule check | Result |
|---|---|---|---|---|---|
| Knight | 3 | 0 | bulwark (i=1) | shield_bash slot-blocked → fires | `null` → shuffle |
| Knight | 3 | 2 | bulwark (i=1) | shield_bash on cooldown → skip; no slot-blocked higher | bulwark |
| Knight | 1 | 0 | shield_bash (i=0) | i=0, no check | shield_bash |
| Knight | 2 | 0 | shield_bash (i=0) | i=0, no check | shield_bash |
| Archer | 1 | n/a | archer_shoot (i=3) | flare_arrow slot-blocked → fires | `null` → shuffle |
| Archer | 2 or 3 | n/a | flare_arrow (i=0) | i=0, no check | flare_arrow |
| Priest | 1 | n/a | priest_strike (i=3) | mend slot-blocked → fires | `null` → shuffle |
| Mage | 1 | n/a | (nothing castable, loop exits) | — | `null` → shuffle (existing path) |

After the shuffle, the next turn finds the hero at slot 2 (or wherever shuffle landed them) and the higher-priority ability becomes castable.

## 6 · Existing test that flips

`src/combat/__tests__/ability_priority.test.ts:17-24` currently asserts:

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

This asserts the bug we're fixing. Update to:

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

This is also test #5 in §7 (Priest at slot 1 → null) — same rule, different class. The Archer test stays as the canonical "falls through" test, just flipped to assert null.

## 7 · New tests

Five new cases in `src/combat/__tests__/ability_priority.test.ts`, plus one integration test in `combat.test.ts`.

1. **Knight at slot 3 → null** (full bug repro):
   ```ts
   it('returns null when higher-priority abilities are slot-blocked', () => {
     const rng = createRng(1);
     const knight = makeHeroCombatant('knight', 3, 'p0');
     const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
     const state = makeTestState([knight], [e0]);
     expect(pickAbility(knight, state, rng)).toBeNull();
   });
   ```

2. **Knight at slot 3 with shield_bash on cooldown → bulwark** (cooldown exclusion):
   ```ts
   it('does NOT prefer shuffle when the higher-priority is blocked by cooldown', () => {
     const rng = createRng(1);
     const knight = makeHeroCombatant('knight', 3, 'p0', { cooldowns: { shield_bash: 2 } });
     const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
     const state = makeTestState([knight], [e0]);
     expect(pickAbility(knight, state, rng)?.abilityId).toBe('bulwark');
   });
   ```

3. **Knight at slot 1 → shield_bash** (no rule fire at i=0):
   ```ts
   it('returns the highest priority when castable from current slot', () => {
     const rng = createRng(1);
     const knight = makeHeroCombatant('knight', 1, 'p0');
     const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
     const state = makeTestState([knight], [e0]);
     expect(pickAbility(knight, state, rng)?.abilityId).toBe('shield_bash');
   });
   ```

4. **Knight at slot 2 → shield_bash** (no rule fire when higher-priority castable):
   ```ts
   it('does not prefer shuffle when higher-priority is castable from current slot', () => {
     const rng = createRng(1);
     const knight = makeHeroCombatant('knight', 2, 'p0');
     const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
     const state = makeTestState([knight], [e0]);
     expect(pickAbility(knight, state, rng)?.abilityId).toBe('shield_bash');
   });
   ```

5. **Priest at slot 1 → null** (parallel to Archer, asserts coverage):
   ```ts
   it('Priest at slot 1 prefers shuffle over priest_strike', () => {
     const rng = createRng(1);
     const priest = makeHeroCombatant('priest', 1, 'p0');
     const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
     const state = makeTestState([priest], [e0]);
     expect(pickAbility(priest, state, rng)).toBeNull();
   });
   ```

6. **Combat-integration in `combat.test.ts`** — Knight at slot 3 in a real combat produces a shuffle event in round 1. The party must have at least 2 living heroes so `shuffle()` has a slot to move into (`maxSlot = sameSide.length`; a solo party returns 1 and shuffle is a no-op):

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

   The implementer can adjust the enemy mix if the seed produces a fast-end fight; the test's intent is "Knight at non-preferred slot in a real fight emits a shuffle in round 1."

## 8 · Files touched

| File | Change |
|---|---|
| `src/combat/ability_priority.ts` | Rewrite `pickAbility` to use indexed iteration; add private `hasShufflableHigherPriority` helper. |
| `src/combat/__tests__/ability_priority.test.ts` | Update existing "falls through when caster slot is not in canCastFrom" test to expect `null` (test name + assertion change). Add five new tests covering the rule, cooldown exclusion, and Priest parallel. |
| `src/combat/__tests__/combat.test.ts` | Add one integration test: Knight at slot 3 emits a `shuffle` event in round 1 of a real combat. |

No other files touched. No data-layer change. No save-schema change. No enemy AI change.

## 9 · Test plan

- `npx tsc --noEmit` green.
- `npm test` green (1324 baseline + 6 new = 1330; existing test flipped, not added).
- `npm run build` succeeds.

**Existing tests at risk (verified via grep):** the only existing tests that place heroes at non-preferred slots and exercise pickAbility are:
- `ability_priority.test.ts:17-24` (the existing buggy assertion — flipped in §6).
- Other tests at non-preferred slots (`effects.test.ts`, `positions.test.ts`, `statuses.test.ts`) call `applyAbility` directly with manufactured ability shapes, not `pickAbility`. Unaffected.

**Manual play verification:** Start a Crypt run with a Knight in slot 3 (drag formation). Round 1: Knight should produce a shuffle event (visible in combat playback's position-changed animation), not a Bulwark cast. By round 3 or so, Knight should be at slot 1 casting Shield Bash.

## 10 · Risk

Medium-low. Combat AI is load-bearing and the failure modes of getting the rule wrong are bounded:

- **If the rule fires too eagerly**, heroes freeze (always return null → always shuffle → never cast). Caught immediately by the existing combat resolution tests, which would never end (round cap hit) or would produce wrong outcomes.
- **If the rule never fires**, the bug remains. Caught by the new test #1 (Knight at slot 3 → null).
- **If the rule fires for enemies and produces a behavior change**, seed-stable combat tests would shift. Surveyed every enemy: rule cannot fire (single-ability minions don't reach `i > 0`; multi-ability enemies have uniform canCastFrom across their priority list). Confirmed safe.

## 11 · Open questions

None at design time.
