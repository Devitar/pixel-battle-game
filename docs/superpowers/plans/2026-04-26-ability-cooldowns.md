# Ability Cooldowns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic per-combatant per-ability cooldown system to the combat engine, then apply `cooldown: 2` to four data abilities (`mend`, `dark_pact`, `flare_arrow`, `piercing_shot`). Resolves the heal-stalemate bug (Cultist heals every turn → exhaustion wipe) and the archer-never-volleys bug (flare/piercing always fire, volley never gets a turn). Reverts the Cultist priority test-fixture and clears both entries from `bugs.md`.

**Architecture:** Six tasks, bottom-up. (1) Schema + factory plumbing — add `cooldown?` to `Ability` and required `cooldowns: Record<AbilityId, number>` to `Combatant`, default `{}` in factories and test helpers. (2) `src/combat/cooldowns.ts` with `tickCooldowns` and `setCooldown`, TDD'd with five unit tests. (3) `pickAbility` skip-on-cooldown line + integration tests in `cooldowns.test.ts` + one new test in `ability_priority.test.ts`. (4) Combat loop integration — `tickCooldowns` after `tickStatuses`, `setCooldown` after a successful cast iff the ability has a cooldown declared. (5) Data values — `cooldown: 2` on the four abilities + a `resolveCombat` integration test + adjustment for any round-count drift in `combat.test.ts`. (6) Cultist revert + `bugs.md` cleanup + final smoke test.

**Tech Stack:** TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 4, Phaser 4 (untouched — pure-engine work). All changes are inside the Phaser firewall (no scene files modified).

**Spec:** `docs/superpowers/specs/2026-04-26-ability-cooldowns-design.md`

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/data/types.ts` | **Modify** | Add optional `cooldown?: number` to `Ability` interface. |
| `src/data/abilities.ts` | **Modify** | Add `cooldown: 2` to `mend`, `dark_pact`, `flare_arrow`, `piercing_shot` (Task 5). |
| `src/data/enemies.ts` | **Modify** | Revert Cultist `aiPriority` to `['dark_pact', 'dark_bolt']` and drop the test-fixture comment (Task 6). |
| `src/combat/types.ts` | **Modify** | Add required `cooldowns: Record<AbilityId, number>` to `Combatant`. |
| `src/combat/combatant.ts` | **Modify** | Default `cooldowns: {}` in `createHeroCombatant` and `createEnemyCombatant`. |
| `src/combat/cooldowns.ts` | **Create** | New module with `tickCooldowns(combatant)` and `setCooldown(combatant, abilityId, turns)`. ~25 lines. |
| `src/combat/ability_priority.ts` | **Modify** | One new line: skip abilities whose `caster.cooldowns[id] > 0`. |
| `src/combat/combat.ts` | **Modify** | Two new lines in the turn body: `tickCooldowns(combatant)` after `tickStatuses`; `setCooldown(...)` after a successful cast where `ability.cooldown !== undefined`. |
| `src/combat/__tests__/cooldowns.test.ts` | **Create** | Five helper unit tests + three `pickAbility` integration tests. ~120 lines. |
| `src/combat/__tests__/ability_priority.test.ts` | **Modify** | Append one test exercising the skip rule. |
| `src/combat/__tests__/helpers.ts` | **Modify** | `makeHeroCombatant` and `makeEnemyCombatant` default `cooldowns: {}` and accept it as a partial override. |
| `src/combat/__tests__/combat.test.ts` | **Modify (likely)** | Numeric round-count tweaks if cooldowns shift fight resolution by 1-2 rounds. Adjust inline. |
| `bugs.md` | **Modify** | Remove the heal-cooldown and archer-volley entries (Task 6). |

No changes to scenes, save format, schema migrations, or `applyAbility`.

---

## Task 1: Schema + factory plumbing

**Goal:** Land the type changes and default the new required `cooldowns` field everywhere a `Combatant` is constructed. No behavior change yet — every existing test should still pass.

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/combat/types.ts`
- Modify: `src/combat/combatant.ts`
- Modify: `src/combat/__tests__/helpers.ts`

- [ ] **Step 1: Add `cooldown?` to `Ability`**

In `src/data/types.ts`, find the `Ability` interface (around line 65) and add the optional field:

```ts
export interface Ability {
  id: AbilityId;
  name: string;
  canCastFrom: readonly SlotIndex[];
  target: TargetSelector;
  effects: readonly AbilityEffect[];
  tags?: readonly AbilityTag[];
  cooldown?: number;
}
```

- [ ] **Step 2: Add `cooldowns` to `Combatant`**

In `src/combat/types.ts`, find the `Combatant` interface (around line 30) and add the required field next to `statuses`:

```ts
export interface Combatant {
  id: CombatantId;
  side: CombatSide;
  slot: SlotIndex;
  kind: 'hero' | 'enemy';
  classId?: ClassId;
  enemyId?: EnemyId;
  baseStats: Stats;
  currentHp: number;
  maxHp: number;
  statuses: Record<string, StatusInstance>;
  cooldowns: Record<AbilityId, number>;
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  preferredSlots?: readonly SlotIndex[];
  tags?: readonly CombatantTag[];
  traitId?: TraitId;
  isDead: boolean;
}
```

- [ ] **Step 3: Default `cooldowns: {}` in the production factories**

In `src/combat/combatant.ts`, both factories need the default. Find `createHeroCombatant` and add `cooldowns: {}` next to `statuses: {}`:

```ts
export function createHeroCombatant(
  classId: ClassId,
  slot: SlotIndex,
  id: CombatantId,
  overrides: Partial<Combatant> = {},
): Combatant {
  const def = CLASSES[classId];
  return {
    id,
    side: 'player',
    slot,
    kind: 'hero',
    classId,
    baseStats: { ...def.baseStats },
    currentHp: def.baseStats.hp,
    maxHp: def.baseStats.hp,
    statuses: {},
    cooldowns: {},
    abilities: def.abilities,
    aiPriority: def.aiPriority,
    isDead: false,
    ...overrides,
  };
}
```

Same change in `createEnemyCombatant` — add `cooldowns: {}` after `statuses: {}`:

```ts
export function createEnemyCombatant(
  enemyId: EnemyId,
  slot: SlotIndex,
  id: CombatantId,
  overrides: Partial<Combatant> = {},
): Combatant {
  const def = ENEMIES[enemyId];
  return {
    id,
    side: 'enemy',
    slot,
    kind: 'enemy',
    enemyId,
    baseStats: { ...def.baseStats },
    currentHp: def.baseStats.hp,
    maxHp: def.baseStats.hp,
    statuses: {},
    cooldowns: {},
    abilities: def.abilities,
    aiPriority: def.aiPriority,
    preferredSlots: def.preferredSlots,
    tags: def.tags,
    isDead: false,
    ...overrides,
  };
}
```

- [ ] **Step 4: Default `cooldowns: {}` in the test helpers**

In `src/combat/__tests__/helpers.ts`, find `makeHeroCombatant` and `makeEnemyCombatant`. They likely already accept a `Partial<Combatant>` overrides object — they just need `cooldowns: {}` defaulted before the spread.

The pattern (read the file first to confirm current shape, then mirror it):

```ts
export function makeHeroCombatant(
  classId: ClassId,
  slot: SlotIndex,
  id: CombatantId,
  overrides: Partial<Combatant> = {},
): Combatant {
  return createHeroCombatant(classId, slot, id, { cooldowns: {}, ...overrides });
}
```

`createHeroCombatant` already defaults `cooldowns: {}` after Step 3, so technically this line in the helper is redundant. **The reason to include it explicitly:** the spec wants tests to be able to seed cooldowns via the override (e.g., `makeHeroCombatant('priest', 2, 'p0', { cooldowns: { mend: 2 } })`). The override already works because `Partial<Combatant>` includes `cooldowns`. No code change needed in the helper for that — Step 4 is just verification that the override path types-correctly.

After confirming, no edit may be required here. Move on.

- [ ] **Step 5: Typecheck passes**

Run: `npx tsc --noEmit`
Expected: clean. If a strict-mode error fires from any other file constructing a `Combatant` directly (not via the factories), find that call site and add `cooldowns: {}`.

- [ ] **Step 6: Test suite stays green**

Run: `npm test`
Expected: 511 tests pass. The schema change adds a field that's defaulted everywhere; no behavior change.

- [ ] **Step 7: Commit**

```bash
git add src/data/types.ts src/combat/types.ts src/combat/combatant.ts src/combat/__tests__/helpers.ts
git commit -m "combat: add cooldown schema fields (no behavior change)"
```

---

## Task 2: Cooldown helpers + unit tests

**Goal:** Build `tickCooldowns` and `setCooldown` in a new `src/combat/cooldowns.ts` module. TDD: write the five helper-level tests first, verify they fail, implement, verify they pass.

**Files:**
- Create: `src/combat/__tests__/cooldowns.test.ts`
- Create: `src/combat/cooldowns.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `src/combat/__tests__/cooldowns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { setCooldown, tickCooldowns } from '../cooldowns';
import { makeHeroCombatant } from './helpers';

describe('tickCooldowns', () => {
  it('decrements every cooldown by 1', () => {
    const combatant = makeHeroCombatant('priest', 2, 'p0');
    combatant.cooldowns = { mend: 3, bless: 2 };
    tickCooldowns(combatant);
    expect(combatant.cooldowns).toEqual({ mend: 2, bless: 1 });
  });

  it('drops cooldowns that hit 0', () => {
    const combatant = makeHeroCombatant('priest', 2, 'p0');
    combatant.cooldowns = { mend: 1 };
    tickCooldowns(combatant);
    expect(combatant.cooldowns).toEqual({});
  });

  it('is a no-op when the combatant has no cooldowns', () => {
    const combatant = makeHeroCombatant('priest', 2, 'p0');
    expect(combatant.cooldowns).toEqual({});
    tickCooldowns(combatant);
    expect(combatant.cooldowns).toEqual({});
  });
});

describe('setCooldown', () => {
  it('sets the cooldown to the given value', () => {
    const combatant = makeHeroCombatant('priest', 2, 'p0');
    setCooldown(combatant, 'mend', 2);
    expect(combatant.cooldowns).toEqual({ mend: 2 });
  });

  it('overwrites an existing cooldown', () => {
    const combatant = makeHeroCombatant('priest', 2, 'p0');
    combatant.cooldowns = { mend: 1 };
    setCooldown(combatant, 'mend', 3);
    expect(combatant.cooldowns).toEqual({ mend: 3 });
  });
});
```

- [ ] **Step 2: Run tests — expect them to fail**

Run: `npx vitest run src/combat/__tests__/cooldowns.test.ts`
Expected: FAIL — module `'../cooldowns'` doesn't exist yet, so all tests report import error.

- [ ] **Step 3: Implement `cooldowns.ts`**

Create `src/combat/cooldowns.ts`:

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

Notes: `Object.keys(...)` returns `string[]`; the cast to `AbilityId[]` matches the `Record<AbilityId, number>` typing. Snapshot of the keys is taken at iteration start, so the `delete` mid-loop is safe.

- [ ] **Step 4: Run tests — expect them to pass**

Run: `npx vitest run src/combat/__tests__/cooldowns.test.ts`
Expected: PASS — 5 tests in `cooldowns.test.ts` pass.

- [ ] **Step 5: Full suite stays green**

Run: `npm test`
Expected: 516 tests pass (511 existing + 5 new).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/combat/cooldowns.ts src/combat/__tests__/cooldowns.test.ts
git commit -m "combat: add tickCooldowns and setCooldown helpers"
```

---

## Task 3: `pickAbility` skip rule + tests

**Goal:** Make `pickAbility` skip abilities whose cooldown is > 0. Add the unit test in `ability_priority.test.ts` and the three integration tests in `cooldowns.test.ts` (under a new describe block).

**Files:**
- Modify: `src/combat/ability_priority.ts`
- Modify: `src/combat/__tests__/ability_priority.test.ts`
- Modify: `src/combat/__tests__/cooldowns.test.ts`

- [ ] **Step 1: Write the failing unit test in `ability_priority.test.ts`**

Append to `src/combat/__tests__/ability_priority.test.ts` (inside the existing `describe('pickAbility', ...)`):

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

The Priest's aiPriority is `['mend', 'bless', 'smite', 'priest_strike']`. With `mend` on cooldown and `knight` injured, `mend` is skipped, then `bless` finds an unblessed ally (`knight`) and fires.

- [ ] **Step 2: Write the failing integration tests in `cooldowns.test.ts`**

Append a new describe block to `src/combat/__tests__/cooldowns.test.ts`:

```ts
import { createRng } from '../../util/rng';
import { pickAbility } from '../ability_priority';
import { makeEnemyCombatant, makeTestState } from './helpers';

describe('integration: pickAbility skips on-cooldown abilities', () => {
  it('falls through to the next priority when the first is on cooldown', () => {
    const rng = createRng(1);
    const archer = makeHeroCombatant('archer', 2, 'p0', {
      cooldowns: { flare_arrow: 2 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('skeleton_archer', 3, 'e1');
    const state = makeTestState([archer], [e0, e1]);
    const picked = pickAbility(archer, state, rng);
    expect(picked?.abilityId).toBe('piercing_shot');
  });

  it('falls through to a non-cooldown ability when all cooldown abilities are on cooldown', () => {
    const rng = createRng(1);
    const archer = makeHeroCombatant('archer', 2, 'p0', {
      cooldowns: { flare_arrow: 2, piercing_shot: 2 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('skeleton_archer', 3, 'e1');
    const state = makeTestState([archer], [e0, e1]);
    const picked = pickAbility(archer, state, rng);
    expect(picked?.abilityId).toBe('volley');
  });

  it('returns null when every priority is on cooldown and nothing else is castable', () => {
    const rng = createRng(1);
    const skeleton = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      cooldowns: { bone_slash: 1 },
    });
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const state = makeTestState([p0], [skeleton]);
    const picked = pickAbility(skeleton, state, rng);
    expect(picked).toBeNull();
  });
});
```

The skeleton_warrior's `aiPriority` is `['bone_slash']` (single entry); seeding `bone_slash` on cooldown leaves nothing castable.

- [ ] **Step 3: Run the tests — expect them to fail**

Run: `npx vitest run src/combat/__tests__/cooldowns.test.ts src/combat/__tests__/ability_priority.test.ts`
Expected: 4 new tests fail (each says `pickAbility` returned the cooldown'd ability instead of falling through).

- [ ] **Step 4: Implement the skip rule**

In `src/combat/ability_priority.ts`, add one line inside the `for` loop:

```ts
import { ABILITIES } from '../data/abilities';
import type { AbilityId } from '../data/types';
import type { Rng } from '../util/rng';
import { resolveTargetSelector } from './target_selector';
import type { Combatant, CombatantId, CombatState } from './types';

export interface PickedAction {
  abilityId: AbilityId;
  targetIds: readonly CombatantId[];
}

export function pickAbility(caster: Combatant, state: CombatState, rng: Rng): PickedAction | null {
  for (const abilityId of caster.aiPriority) {
    const ability = ABILITIES[abilityId];
    if ((caster.cooldowns[abilityId] ?? 0) > 0) continue;
    if (!ability.canCastFrom.includes(caster.slot)) continue;
    const targetIds = resolveTargetSelector(ability.target, caster, state, rng);
    if (targetIds.length === 0) continue;
    return { abilityId, targetIds };
  }
  return null;
}
```

The `?? 0` coercion: `cooldowns[abilityId]` is `undefined` when no cooldown is set; `undefined > 0` is a strict-mode comparison error. Falling back to `0` makes the comparison clean and the behavior correct.

- [ ] **Step 5: Run the tests — expect them to pass**

Run: `npx vitest run src/combat/__tests__/cooldowns.test.ts src/combat/__tests__/ability_priority.test.ts`
Expected: PASS — all integration tests + the new ability_priority test pass.

- [ ] **Step 6: Full suite stays green**

Run: `npm test`
Expected: 520 tests pass (516 + 1 ability_priority test + 3 integration tests).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/combat/ability_priority.ts src/combat/__tests__/ability_priority.test.ts src/combat/__tests__/cooldowns.test.ts
git commit -m "combat: pickAbility skips abilities on cooldown"
```

---

## Task 4: Combat loop integration

**Goal:** Wire `tickCooldowns` and `setCooldown` into the combat loop. No data abilities have cooldowns yet (that's Task 5), so this should be a no-op behaviorally — every test still passes.

**Files:**
- Modify: `src/combat/combat.ts`

- [ ] **Step 1: Modify the turn body in `combat.ts`**

In `src/combat/combat.ts`, two changes inside the `for (const id of order)` loop. Find the existing turn body and edit:

```ts
import { ABILITIES } from '../data/abilities';
import type { Rng } from '../util/rng';
import { pickAbility } from './ability_priority';
import { tickCooldowns, setCooldown } from './cooldowns';
import { applyAbility } from './effects';
import { shuffle } from './positions';
import { tickStatuses } from './statuses';
import { computeInitiative } from './turn_order';
import type {
  Combatant,
  CombatEvent,
  CombatOutcome,
  CombatResult,
  CombatSide,
  CombatState,
} from './types';
```

(Add `import { tickCooldowns, setCooldown } from './cooldowns';` to the existing import block.)

Then in the per-turn body (find `tickStatuses(combatant, events);` around line 72):

```ts
      events.push({ kind: 'turn_start', combatantId: id });

      const willBeStunned = 'stunned' in combatant.statuses;
      tickStatuses(combatant, events);
      tickCooldowns(combatant);

      if (willBeStunned) {
        events.push({ kind: 'turn_skipped', combatantId: id, reason: 'stunned' });
      } else {
        const picked = pickAbility(combatant, state, rng);
        if (picked) {
          const ability = ABILITIES[picked.abilityId];
          applyAbility(
            ability,
            combatant,
            picked.targetIds,
            state,
            rng,
            events,
          );
          if (ability.cooldown !== undefined) {
            setCooldown(combatant, ability.id, ability.cooldown);
          }
        } else {
          events.push({ kind: 'shuffle', combatantId: id });
          shuffle(combatant, state, events);
        }
      }
```

Two new things:
1. `tickCooldowns(combatant);` runs after `tickStatuses`, every turn (including stunned turns).
2. After a successful cast, `if (ability.cooldown !== undefined) setCooldown(...)`. Captured `ability` from `ABILITIES[picked.abilityId]` once instead of looking up twice.

The original code passed `ABILITIES[picked.abilityId]` directly to `applyAbility` — by hoisting it to a `const ability`, both the apply call and the cooldown-check use the same reference.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Full suite stays green**

Run: `npm test`
Expected: 520 tests pass. No abilities have `cooldown` declared yet, so `setCooldown` is never called in real combat; `tickCooldowns` is called every turn but operates on empty `cooldowns` — silent no-op. Behavior is identical to before.

- [ ] **Step 4: Commit**

```bash
git add src/combat/combat.ts
git commit -m "combat: tick cooldowns per turn, set after successful cast"
```

---

## Task 5: Apply cooldowns to data abilities

**Goal:** Add `cooldown: 2` to `mend`, `dark_pact`, `flare_arrow`, `piercing_shot` in `data/abilities.ts`. Add a `resolveCombat` integration test that observes Mend's cooldown actually gating consecutive casts. Adjust `combat.test.ts` for any round-count drift.

**Files:**
- Modify: `src/data/abilities.ts`
- Modify: `src/combat/__tests__/combat.test.ts` (numeric tweaks; possibly add the integration test here or in `cooldowns.test.ts`)

- [ ] **Step 1: Add `cooldown: 2` to the four ability defs**

In `src/data/abilities.ts`:

```ts
  archer_shoot: {
    id: 'archer_shoot',
    name: 'Shoot',
    canCastFrom: [1, 2, 3],
    target: { side: 'enemy', slots: 'all', pick: 'first' },
    effects: [{ kind: 'damage', power: 1.0 }],
  },
  piercing_shot: {
    id: 'piercing_shot',
    name: 'Piercing Shot',
    canCastFrom: [2, 3],
    target: { side: 'enemy', slots: [3, 4], pick: 'first' },
    effects: [{ kind: 'damage', power: 1.4 }],
    cooldown: 2,
  },
  volley: {
    id: 'volley',
    name: 'Volley',
    canCastFrom: [2, 3],
    target: { side: 'enemy', slots: 'all' },
    effects: [{ kind: 'damage', power: 0.5 }],
  },
  flare_arrow: {
    id: 'flare_arrow',
    name: 'Flare Arrow',
    canCastFrom: [2, 3],
    target: { side: 'enemy', filter: { kind: 'lacksStatus', statusId: 'marked' }, pick: 'first' },
    effects: [{ kind: 'mark', damageBonus: 0.5, duration: 2, statusId: 'marked' }],
    cooldown: 2,
  },
```

```ts
  mend: {
    id: 'mend',
    name: 'Mend',
    canCastFrom: [2, 3],
    target: { side: 'ally', filter: { kind: 'hurt' }, pick: 'lowestHp' },
    effects: [{ kind: 'heal', power: 1.2 }],
    cooldown: 2,
  },
```

```ts
  dark_pact: {
    id: 'dark_pact',
    name: 'Dark Pact',
    canCastFrom: [2, 3, 4],
    target: { side: 'ally', filter: { kind: 'hurt' }, pick: 'lowestHp' },
    effects: [{ kind: 'heal', power: 1.0 }],
    cooldown: 2,
  },
```

(Show the full updated entries — the engineer can match by `id` and add `cooldown: 2` after `effects: [...]`.)

- [ ] **Step 2: Add a `resolveCombat` integration test**

Append to `src/combat/__tests__/cooldowns.test.ts`:

```ts
import { resolveCombat } from '../combat';

describe('integration: cooldowns gate consecutive casts in resolveCombat', () => {
  it('priest with mend (cooldown 2) does not heal every turn', () => {
    const rng = createRng(42);
    const priest = makeHeroCombatant('priest', 2, 'p0');
    const knight = makeHeroCombatant('knight', 1, 'p1', { currentHp: 1, maxHp: 20 });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([priest, knight], [e0]);

    const result = resolveCombat(state, rng);

    const mendCasts = result.events.filter(
      (ev) => ev.kind === 'ability_cast' && ev.casterId === 'p0' && ev.abilityId === 'mend',
    );
    const priestTurns = result.events.filter(
      (ev) => ev.kind === 'turn_start' && ev.combatantId === 'p0',
    ).length;
    // Without cooldowns, priest would heal every single one of its turns.
    // With cooldown: 2, mend fires at most every 3 priest turns.
    expect(mendCasts.length).toBeLessThanOrEqual(Math.ceil(priestTurns / 3));
    expect(mendCasts.length).toBeGreaterThan(0);
  });
});
```

This test runs a real fight and asserts the cooldown actually gates Mend across resolveCombat. Knight starts at 1 HP so `hurt` filter always matches; that ensures Mend's only gate is the cooldown.

- [ ] **Step 3: Run the new integration test**

Run: `npx vitest run src/combat/__tests__/cooldowns.test.ts -t "priest with mend"`
Expected: PASS.

- [ ] **Step 4: Run the full suite — expect possible numeric drift**

Run: `npm test`
Expected: most tests pass. Some tests in `combat.test.ts` may show numeric drift (round counts shift by 1-2). For each failure, read the assertion, confirm it's a numeric round-count expectation, and adjust the expected value to match the new behavior. **No logic regressions** should occur — only assertion-tweaks. If a test fails for a non-numeric reason (e.g., outcome flipped from `player_victory` to `player_defeat`), stop and investigate before adjusting.

The likely candidates are:
- Tests that assert "fight ends in N rounds" against attrition setups — N shifts.
- Tests that count the number of `heal_applied` events in a fight — counts shift down.
- The 5-seed determinism test should still pass; if it fails, the new code introduced nondeterminism (bug — investigate).

For each numeric tweak, update the expected value to the *observed* value. Re-run to confirm.

- [ ] **Step 5: Full suite green**

Run: `npm test`
Expected: ~521-523 tests pass (depending on whether you added 1 or 2 integration tests in step 2/3). All assertions match.

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/data/abilities.ts src/combat/__tests__/cooldowns.test.ts src/combat/__tests__/combat.test.ts
git commit -m "combat: cooldown 2 on mend, dark_pact, flare_arrow, piercing_shot"
```

(If `combat.test.ts` didn't actually need adjustment, drop it from the `git add`.)

---

## Task 6: Cultist revert + bugs.md cleanup + smoke test

**Goal:** Revert the test-fixture priority flip on Cultist (the cooldown system *is* the proper fix). Remove both bugs.md entries (resolved). Manual smoke test in browser.

**Files:**
- Modify: `src/data/enemies.ts`
- Modify: `bugs.md`

- [ ] **Step 1: Revert Cultist's `aiPriority`**

In `src/data/enemies.ts`, find the `cultist` entry. Replace the test-fixture form:

```ts
  cultist: {
    id: 'cultist',
    name: 'Cultist',
    role: 'minion',
    baseStats: { hp: 10, attack: 3, defense: 1, speed: 3 },
    tags: ['humanoid'],
    abilities: ['dark_pact', 'dark_bolt'],
    // Bolt before pact until heal cooldowns exist (see bugs.md). Without a cooldown,
    // pact-first stalls every fight into an exhaustion wipe.
    aiPriority: ['dark_bolt', 'dark_pact'],
    preferredSlots: [3, 4],
    spriteId: 'cultist',
  },
```

…with the original:

```ts
  cultist: {
    id: 'cultist',
    name: 'Cultist',
    role: 'minion',
    baseStats: { hp: 10, attack: 3, defense: 1, speed: 3 },
    tags: ['humanoid'],
    abilities: ['dark_pact', 'dark_bolt'],
    aiPriority: ['dark_pact', 'dark_bolt'],
    preferredSlots: [3, 4],
    spriteId: 'cultist',
  },
```

Two-line comment removed. Priority restored.

- [ ] **Step 2: Remove the bug entries from `bugs.md`**

In `bugs.md`, delete both entries:
- "Healing abilities have no cooldown — enemy healers stall fights into wipes"
- "Archer never casts Volley"

The file should return to its previous shape:

```markdown
# Bugs

Unscoped bug reports captured during testing. When an item is ready, scope it into an actionable [`TODO.md`](TODO.md) entry and remove it from here.

## Format

One section per bug. Keep it terse — this is a triage bin, not a formal tracker.

```markdown
### Short bug title

- **What:** one-line description of the wrong behavior
- **Repro:** minimum steps to see it
- **Expected:** what should happen
- **Seen:** date, commit SHA, browser/resolution if it matters
- **Notes:** screenshots, console output, suspicions (optional)
```

---

<!-- Add bugs below this line. Newest at the top. -->
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Tests pass**

Run: `npm test`
Expected: ~521-523 tests pass. The Cultist revert may shift cultist-encounter test outcomes — but cultist tests likely don't exist (the AI is exercised through the determinism test and the `pickAbility` tests, not in encounter-specific tests). If anything fails, expect it to be Cultist-related and adjust per Task 5's pattern (numeric tweak only, not a logic regression).

- [ ] **Step 5: Production build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Manual smoke test**

Run: `npm run dev`. Open `http://localhost:5173`.

Two scenarios:

**A. Cultist encounter resolves normally.**
1. Hire 3 heroes via Tavern; descend via Noticeboard.
2. Walk through dungeon nodes until you hit a Cultist encounter (`skeleton_warrior` + `cultist` is the most common Crypt 2-enemy roll).
3. Combat resolves with the cultist healing once or twice, not every turn. Fight should end well under round 100 (no exhaustion).

**B. Archer cycles through their kit.**
1. Hire an Archer; place at slot 2 or 3.
2. In a 4-enemy combat (full formation), watch a few rounds:
   - T1: archer fires Flare Arrow (mark on first non-marked enemy).
   - T2: Piercing Shot on a back-rank enemy.
   - T3: Volley on all.
   - T4: Flare Arrow again.
   - T5: Piercing Shot.
   - T6: Volley.
3. Action log should show the rotation. (If the archer's at slot 1, only `Shoot` fires — that's WAI, separate kit-locked-out issue.)

Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/data/enemies.ts bugs.md
git commit -m "enemies: revert cultist test-fixture; clear resolved bugs"
```

---

## Verification summary

After all six tasks:

- `npx tsc --noEmit` — clean
- `npm test` — ~521-523 tests passing (511 baseline + ~10 new + 0-4 numeric tweaks)
- `npm run build` — succeeds
- Manual smoke test passes both scenarios (Cultist resolves; Archer cycles)
- Both `bugs.md` entries removed
- Cultist priority back to `['dark_pact', 'dark_bolt']`
- Cooldown system available for future ability balance work (Tier 1 cooldown pass per spec §Rejected alternatives, when ready)

---

## Out of scope (per spec §Risks and follow-ups)

- Cooldowns on `volley`, `necrotic_wave`, `shield_bash`, `smite` (Tier 1 balance pass — separate task once playtest data is in).
- UI surfacing of cooldowns in the combat scene (no `cooldown_set` / `cooldown_ticked` events emitted; combat playback unchanged).
- Cultist HP/damage rebalance if encounters now feel too easy (separate balance pass).
- Fix for "Archer at slot 1 ignores most of their kit" — formation-picker UX issue tracked separately.
- Cooldowns persisting across fights (intentionally battle-local).
- Per-target cooldowns or "tried-recently" suppression heuristics (rejected in favor of the simpler turns-based model).

---

## Notes for the implementer

- **Mutating helpers, not pure.** Both `tickCooldowns` and `setCooldown` mutate the combatant in place. This matches `tickStatuses` style. `resolveCombat` deep-clones state at entry (`combat.ts:35` — `structuredClone(initialState)`), so callers don't need to worry about leaking mutations into their inputs.
- **`Object.keys` snapshot.** `Object.keys(obj)` returns a fresh array, so deleting keys mid-loop in `tickCooldowns` is safe.
- **`?? 0` in the skip rule.** The `cooldowns[id] ?? 0 > 0` check coerces missing entries to 0, sidestepping a strict-mode comparison error on `undefined > 0`.
- **`structuredClone` and `cooldowns`.** `Record<AbilityId, number>` is a plain object — clones cleanly. Maps would lose identity through `structuredClone`. The choice of Record over Map is intentional.
- **Determinism is preserved.** All cooldown operations are pure data mutation — no rng calls, no side effects beyond the combatant. The 5-seed determinism test should remain stable.
- **The cast turn doesn't tick.** `setCooldown(... 2)` sets the value; the very next `tickCooldowns` (start of caster's *next* turn) decrements to 1. So cooldown 2 means the ability is unavailable for the caster's next 2 turns.
- **Stun + cooldown.** Stun is detected *before* `tickCooldowns` runs, but the tick still happens. This is correct — stun consumes a turn for cooldowns too.
- **Death + cooldown.** Dead combatants `continue` past the entire turn body, including the tick. Cooldowns freeze on death. Tier 1 has no revive.
- **Shuffle on all-cooldowns.** A combatant whose every priority entry is on cooldown (and who has no zero-cooldown fallback) shuffles. Same code path as "no valid targets for any ability." Not a deadlock — just a wasted turn.
- **`buildCombatState` is unchanged.** It calls the factories in `combatant.ts`, which now default `cooldowns: {}`. No change needed in `run/combat_setup.ts`.
- **Save format unchanged.** `CombatState` is never serialized; combat is rebuilt from `RunState` per fight. Adding fields to `Combatant` doesn't affect save schema.
- **Cooldowns are AI-only in this task.** No events, no UI rendering, no HUD changes. Tier 2 polish if wanted.
