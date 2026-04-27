# Class: Barbarian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Barbarian class — a slot-1/2 bruiser with a 4-ability kit (Swing, Cleave, Rampage, Bloodthirst) — plus three small extensions to the effect/AI machinery (`healOnKill` rider, `selfTarget` flag, `aiCondition` predicates) that the kit and future Tier 2 classes will reuse.

**Architecture:** Pure-TS data + small extensions to `effects.ts` and `ability_priority.ts`. Three new shapes: `damage.healOnKill?: number` (Bloodthirst's lifesteal), `buff/debuff.selfTarget?: boolean` (Rampage's defense cost), and `Ability.aiCondition?` with `minTargets` + `casterHpBelow` predicates (Cleave / Rampage gates). Save schema bumps 2→3 to discard old saves so existing rosters get the updated `unlocks.classes` list including Barbarian.

**Tech Stack:** TypeScript, Vitest. No Phaser changes (combat HUD's existing status-glyph system handles the new `enraged` status with a one-line addition).

**Spec:** `docs/superpowers/specs/2026-04-26-class-barbarian-design.md`

**Project convention:** Never commit without explicit user instruction. Each task ends with "report ready for user commit" rather than running `git commit`.

---

## File structure

- **Modify** `src/data/types.ts` — `ClassId` (+'barbarian'), `WeaponType` (+'axe'), `StatusId` (+'enraged'), `AbilityId` (+4), `AbilityEffect` damage variant (+`healOnKill?`), buff/debuff variants (+`selfTarget?`), new `AiCondition` type, `Ability.aiCondition?` field.
- **Modify** `src/data/abilities.ts` — add `barbarian_swing`, `cleave`, `rampage`, `bloodthirst`.
- **Modify** `src/data/classes.ts` — add `barbarian` entry.
- **Modify** `src/combat/effects.ts` — `applyDamage` honors `healOnKill`; `applyAbility` applies `selfTarget` effects once before the per-target loop.
- **Modify** `src/combat/ability_priority.ts` — `pickAbility` checks `aiCondition`; new `checkAiCondition` helper.
- **Modify** `src/save/migration.ts` — `CURRENT_SCHEMA_VERSION` bumps 2 → 3.
- **Modify** `src/save/save.ts` — `createDefaultUnlocks` adds `'barbarian'`.
- **Modify** `src/render/combat_actor.ts` — `STATUS_GLYPHS` adds `enraged`.
- **Modify** `src/data/__tests__/abilities.test.ts` — `EXPECTED_IDS` adds the 4 new ability ids.
- **Modify** `src/data/__tests__/classes.test.ts` — `EXPECTED_IDS` adds `'barbarian'`.
- **Modify** `src/save/__tests__/save.test.ts` — `createDefaultUnlocks` test expects `'barbarian'`.
- **Modify** `src/combat/__tests__/effects.test.ts` — extend with healOnKill, selfTarget tests.
- **Modify** `src/combat/__tests__/ability_priority.test.ts` — extend with aiCondition tests.

No new files. No deletions.

---

## Task 1: `healOnKill` rider on damage effect

**Files:**
- Modify: `src/data/types.ts` (AbilityEffect damage variant)
- Modify: `src/combat/effects.ts:applyDamage`
- Modify: `src/combat/__tests__/effects.test.ts` (extend)

- [ ] **Step 1: Extend the `damage` variant of `AbilityEffect`**

In `src/data/types.ts`, change the damage line of the `AbilityEffect` union:

```ts
| { kind: 'damage'; power: number; scalingStat?: 'attack' | 'mind'; healOnKill?: number }
```

Heal variant unchanged. (Heal-on-kill conceptually only applies to damage effects.)

- [ ] **Step 2: Write failing tests for healOnKill**

Append the following describe block to `src/combat/__tests__/effects.test.ts`:

```ts
describe('healOnKill', () => {
  it('heals caster on lethal hit', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 6, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 5,
      maxHp: 20,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
      currentHp: 1,
      maxHp: 100,
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'bloodthirst' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0, healOnKill: 0.5 }],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    const heal = events.find((e) => e.kind === 'heal_applied');
    // healOnKill 0.5 * caster.attack 6 = 3
    expect(heal).toMatchObject({ sourceId: 'p0', targetId: 'p0', amount: 3 });
    expect(p0.currentHp).toBe(8);
  });

  it('does NOT heal on non-lethal hit', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 6, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 5,
      maxHp: 20,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
      currentHp: 100,
      maxHp: 100,
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'bloodthirst' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0, healOnKill: 0.5 }],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    const heal = events.find((e) => e.kind === 'heal_applied');
    expect(heal).toBeUndefined();
    expect(p0.currentHp).toBe(5);
  });

  it('caps healOnKill heal at caster missing HP (0 if full)', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 6, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 20,
      maxHp: 20,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
      currentHp: 1,
      maxHp: 100,
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'bloodthirst' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0, healOnKill: 0.5 }],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    const heal = events.find((e) => e.kind === 'heal_applied');
    expect(heal).toMatchObject({ amount: 0 });
    expect(p0.currentHp).toBe(20);
  });
});
```

- [ ] **Step 3: Run tests — should fail**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t healOnKill`
Expected: All 3 tests FAIL — `applyDamage` doesn't yet emit a heal_applied for caster.

- [ ] **Step 4: Implement healOnKill in `applyDamage`**

In `src/combat/effects.ts`, modify `applyDamage`. Find the `if (lethal)` block (currently emits `death` event after setting `target.isDead`). After that block, add the heal-on-kill logic. Final form of `applyDamage`'s tail:

```ts
  events.push({
    kind: 'damage_applied',
    sourceId: caster.id,
    targetId: target.id,
    amount: amplified,
    lethal,
    wasCrit,
  });
  if (lethal) {
    target.isDead = true;
    events.push({ kind: 'death', combatantId: target.id });
    if (effect.healOnKill !== undefined) {
      const healAmount = Math.round(effect.healOnKill * getEffectiveStat(caster, scalingStat));
      const actual = Math.min(healAmount, caster.maxHp - caster.currentHp);
      caster.currentHp += actual;
      events.push({
        kind: 'heal_applied',
        sourceId: caster.id,
        targetId: caster.id,
        amount: actual,
      });
    }
  }
}
```

The heal scales off the same `scalingStat` as the damage; capped by caster's missing HP. Emits a regular `heal_applied` event so playback renders it without new code.

- [ ] **Step 5: Run tests — should pass**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t healOnKill`
Expected: All 3 tests PASS.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests PASS. The new field is optional and existing damage abilities don't set it — no regressions.

- [ ] **Step 7: Report ready for user commit.**

---

## Task 2: `selfTarget` flag on buff/debuff effects

**Files:**
- Modify: `src/data/types.ts` (buff/debuff variants)
- Modify: `src/combat/effects.ts:applyAbility`
- Modify: `src/combat/__tests__/effects.test.ts` (extend)

- [ ] **Step 1: Extend the buff and debuff variants**

In `src/data/types.ts`, change the buff and debuff lines of the `AbilityEffect` union:

```ts
| { kind: 'buff'; stat: BuffableStat; delta: number; duration: number; statusId: StatusId; selfTarget?: boolean }
| { kind: 'debuff'; stat: BuffableStat; delta: number; duration: number; statusId: StatusId; selfTarget?: boolean }
```

- [ ] **Step 2: Add `'enraged'` to `StatusId`**

In `src/data/types.ts`, find the `StatusId` line:

```ts
export type StatusId = 'bulwark' | 'taunting' | 'marked' | 'blessed' | 'rotting' | 'frailty' | 'stunned' | 'chilled';
```

Add `'enraged'`:

```ts
export type StatusId = 'bulwark' | 'taunting' | 'marked' | 'blessed' | 'rotting' | 'frailty' | 'stunned' | 'chilled' | 'enraged';
```

- [ ] **Step 3: Update `STATUS_LABEL` in `ability_describe.ts`**

`StatusId` is also keyed in `src/data/ability_describe.ts:40` as `Record<StatusId, string>`. Add the `enraged` entry:

```ts
const STATUS_LABEL: Record<StatusId, string> = {
  bulwark: 'bulwark',
  taunting: 'taunting',
  marked: 'marked',
  blessed: 'blessed',
  rotting: 'rotting',
  frailty: 'frailty',
  stunned: 'stunned',
  chilled: 'chilled',
  enraged: 'enraged',
};
```

- [ ] **Step 4: Write failing tests for selfTarget**

Append to `src/combat/__tests__/effects.test.ts`:

```ts
describe('selfTarget on buff/debuff effects', () => {
  it('applies selfTarget debuff to caster, not to ability target', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 6, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'rampage' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [
        { kind: 'damage' as const, power: 1.0 },
        { kind: 'debuff' as const, stat: 'defense' as const, delta: -2, duration: 2, statusId: 'enraged' as const, selfTarget: true },
      ],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    // damage applied to e0
    expect(events.find((e) => e.kind === 'damage_applied' && e.targetId === 'e0')).toBeDefined();
    // enraged status applied to caster (p0), NOT to e0
    expect(p0.statuses['enraged']).toBeDefined();
    expect(e0.statuses['enraged']).toBeUndefined();
    const statusEvent = events.find((e) => e.kind === 'status_applied' && e.statusId === 'enraged');
    expect(statusEvent).toMatchObject({ sourceId: 'p0', targetId: 'p0' });
  });

  it('selfTarget effect fires even when target dodges', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 6, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 100 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'rampage' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [
        { kind: 'damage' as const, power: 1.0 },
        { kind: 'debuff' as const, stat: 'defense' as const, delta: -2, duration: 2, statusId: 'enraged' as const, selfTarget: true },
      ],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    // target dodged
    expect(events.find((e) => e.kind === 'attack_dodged')).toBeDefined();
    expect(events.find((e) => e.kind === 'damage_applied')).toBeUndefined();
    // BUT self-debuff still applied
    expect(p0.statuses['enraged']).toBeDefined();
  });

  it('selfTarget effect fires once per cast even on AoE (no double-apply)', () => {
    const p0 = makeHeroCombatant('archer', 2, 'p0', {
      baseStats: { hp: 14, attack: 5, defense: 2, speed: 5, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const e1 = makeEnemyCombatant('skeleton_warrior', 2, 'e1', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0, e1]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'volley' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: 'all' as const },
      effects: [
        { kind: 'damage' as const, power: 0.5 },
        { kind: 'buff' as const, stat: 'crit' as const, delta: 5, duration: 1, statusId: 'blessed' as const, selfTarget: true },
      ],
    };
    applyAbility(ability, p0, ['e0', 'e1'], state, rng, events);
    const statusEvents = events.filter((e) => e.kind === 'status_applied' && e.statusId === 'blessed');
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0]).toMatchObject({ targetId: 'p0' });
  });
});
```

- [ ] **Step 5: Run tests — should fail**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t selfTarget`
Expected: tests FAIL — `applyAbility` currently applies all effects to the resolved targets, ignoring `selfTarget`.

- [ ] **Step 6: Restructure `applyAbility` to handle selfTarget**

In `src/combat/effects.ts`, modify `applyAbility`. Insert a self-effect pass before the per-target loop, and skip selfTarget effects during the per-target loop. Final form:

```ts
export function applyAbility(
  ability: Ability,
  caster: Combatant,
  targetIds: readonly CombatantId[],
  state: CombatState,
  rng: Rng,
  events: CombatEvent[],
): void {
  events.push({ kind: 'ability_cast', casterId: caster.id, abilityId: ability.id, targetIds });

  // Self-target effects fire once per cast, regardless of how many targets dodge.
  // Flavor: a fully-dodged Rampage still costs the caster their defense — the
  // over-extension happens whether or not the swing connects.
  for (const effect of ability.effects) {
    const isSelfTarget =
      (effect.kind === 'buff' || effect.kind === 'debuff') && effect.selfTarget === true;
    if (isSelfTarget && !caster.isDead) {
      applyEffect(ability, effect, caster, caster, state, rng, events);
    }
  }

  const hasDamage = ability.effects.some((e) => e.kind === 'damage');
  const sidesWithDeaths = new Set<Combatant['side']>();

  for (const tid of targetIds) {
    const target = findById(state, tid);
    if (!target) continue;
    if (target.isDead) continue;

    if (hasDamage && rng.percent(getEffectiveStat(target, 'dodge'))) {
      events.push({
        kind: 'attack_dodged',
        sourceId: caster.id,
        targetId: target.id,
        abilityId: ability.id,
      });
      continue;
    }

    const wasAlive = !target.isDead;
    for (const effect of ability.effects) {
      if (target.isDead) break;
      const isSelfTarget =
        (effect.kind === 'buff' || effect.kind === 'debuff') && effect.selfTarget === true;
      if (isSelfTarget) continue;
      applyEffect(ability, effect, caster, target, state, rng, events);
    }
    if (wasAlive && target.isDead) sidesWithDeaths.add(target.side);
  }

  for (const side of sidesWithDeaths) {
    collapseAfterDeath(side, state, events);
  }
}
```

- [ ] **Step 7: Run selfTarget tests — should pass**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t selfTarget`
Expected: all 3 tests PASS.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all tests PASS. Existing buff/debuff abilities (`bulwark`, `bless`, etc.) don't set `selfTarget`, so they behave as before.

- [ ] **Step 9: Report ready for user commit.**

---

## Task 3: AI condition system

**Files:**
- Modify: `src/data/types.ts` (new `AiCondition` type, `Ability.aiCondition` field)
- Modify: `src/combat/ability_priority.ts` (`pickAbility` + `checkAiCondition`)
- Modify: `src/combat/__tests__/ability_priority.test.ts` (extend)

- [ ] **Step 1: Add `AiCondition` type and field to Ability**

In `src/data/types.ts`, after the `Ability` interface (or near the existing `AbilityEffect` definitions), add:

```ts
export type AiCondition =
  | { kind: 'minTargets'; n: number }
  | { kind: 'casterHpBelow'; ratio: number };
```

Then modify `Ability` to include the optional field:

```ts
export interface Ability {
  id: AbilityId;
  name: string;
  canCastFrom: readonly SlotIndex[];
  target: TargetSelector;
  effects: readonly AbilityEffect[];
  tags?: readonly AbilityTag[];
  cooldown?: number;
  aiCondition?: AiCondition;
}
```

- [ ] **Step 2: Write failing tests for aiCondition**

Append to `src/combat/__tests__/ability_priority.test.ts` (verify imports include `ABILITIES` from `../../data/abilities`; if not, add `import { ABILITIES } from '../../data/abilities';`):

```ts
describe('aiCondition: minTargets', () => {
  it('skips ability when fewer targets than n', () => {
    const rng = createRng(1);
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      aiPriority: ['cleave_test', 'knight_slash'],
      abilities: ['cleave_test', 'knight_slash'],
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([knight], [e0]);
    // Inject a cleave_test ability into ABILITIES temporarily for this test
    const original = (ABILITIES as Record<string, unknown>).cleave_test;
    (ABILITIES as Record<string, unknown>).cleave_test = {
      id: 'cleave_test',
      name: 'Cleave Test',
      canCastFrom: [1, 2],
      target: { side: 'enemy', slots: [1, 2] },
      effects: [{ kind: 'damage', power: 0.7 }],
      aiCondition: { kind: 'minTargets', n: 2 },
    };
    try {
      const picked = pickAbility(knight, state, rng);
      // Only 1 enemy in slots 1-2; cleave_test should skip; falls through to knight_slash
      expect(picked?.abilityId).toBe('knight_slash');
    } finally {
      if (original === undefined) {
        delete (ABILITIES as Record<string, unknown>).cleave_test;
      } else {
        (ABILITIES as Record<string, unknown>).cleave_test = original;
      }
    }
  });

  it('picks ability when targets meet n', () => {
    const rng = createRng(1);
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      aiPriority: ['cleave_test', 'knight_slash'],
      abilities: ['cleave_test', 'knight_slash'],
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const e1 = makeEnemyCombatant('skeleton_warrior', 2, 'e1');
    const state = makeTestState([knight], [e0, e1]);
    (ABILITIES as Record<string, unknown>).cleave_test = {
      id: 'cleave_test',
      name: 'Cleave Test',
      canCastFrom: [1, 2],
      target: { side: 'enemy', slots: [1, 2] },
      effects: [{ kind: 'damage', power: 0.7 }],
      aiCondition: { kind: 'minTargets', n: 2 },
    };
    try {
      const picked = pickAbility(knight, state, rng);
      expect(picked?.abilityId).toBe('cleave_test');
      expect(picked?.targetIds).toHaveLength(2);
    } finally {
      delete (ABILITIES as Record<string, unknown>).cleave_test;
    }
  });
});

describe('aiCondition: casterHpBelow', () => {
  it('skips ability when caster HP is at or above ratio', () => {
    const rng = createRng(1);
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      aiPriority: ['rampage_test', 'knight_slash'],
      abilities: ['rampage_test', 'knight_slash'],
      currentHp: 20,
      maxHp: 20,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([knight], [e0]);
    (ABILITIES as Record<string, unknown>).rampage_test = {
      id: 'rampage_test',
      name: 'Rampage Test',
      canCastFrom: [1, 2],
      target: { side: 'enemy', slots: [1] },
      effects: [{ kind: 'damage', power: 1.5 }],
      aiCondition: { kind: 'casterHpBelow', ratio: 0.5 },
    };
    try {
      const picked = pickAbility(knight, state, rng);
      expect(picked?.abilityId).toBe('knight_slash');
    } finally {
      delete (ABILITIES as Record<string, unknown>).rampage_test;
    }
  });

  it('picks ability when caster HP is below ratio', () => {
    const rng = createRng(1);
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      aiPriority: ['rampage_test', 'knight_slash'],
      abilities: ['rampage_test', 'knight_slash'],
      currentHp: 5,
      maxHp: 20,
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    const state = makeTestState([knight], [e0]);
    (ABILITIES as Record<string, unknown>).rampage_test = {
      id: 'rampage_test',
      name: 'Rampage Test',
      canCastFrom: [1, 2],
      target: { side: 'enemy', slots: [1] },
      effects: [{ kind: 'damage', power: 1.5 }],
      aiCondition: { kind: 'casterHpBelow', ratio: 0.5 },
    };
    try {
      const picked = pickAbility(knight, state, rng);
      expect(picked?.abilityId).toBe('rampage_test');
    } finally {
      delete (ABILITIES as Record<string, unknown>).rampage_test;
    }
  });
});
```

- [ ] **Step 3: Run tests — should fail**

Run: `npx vitest run src/combat/__tests__/ability_priority.test.ts -t aiCondition`
Expected: tests FAIL — `pickAbility` doesn't yet check `aiCondition`.

- [ ] **Step 4: Implement `aiCondition` in `pickAbility`**

In `src/combat/ability_priority.ts`, modify the file to add the condition check. Final form:

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
  for (const abilityId of caster.aiPriority) {
    const ability = ABILITIES[abilityId];
    if ((caster.cooldowns[abilityId] ?? 0) > 0) continue;
    if (!ability.canCastFrom.includes(caster.slot)) continue;
    const targetIds = resolveTargetSelector(ability.target, caster, state, rng);
    if (targetIds.length === 0) continue;
    if (ability.aiCondition && !checkAiCondition(ability.aiCondition, caster, targetIds)) continue;
    return { abilityId, targetIds };
  }
  return null;
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

- [ ] **Step 5: Run tests — should pass**

Run: `npx vitest run src/combat/__tests__/ability_priority.test.ts -t aiCondition`
Expected: all 4 tests PASS.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests PASS. No existing ability has `aiCondition`, so no behavior changes.

- [ ] **Step 7: Report ready for user commit.**

---

## Task 4: Add `enraged` glyph to combat HUD

**Files:**
- Modify: `src/render/combat_actor.ts` (STATUS_GLYPHS)

This is past the Phaser firewall (combat_actor.ts is rendering code), so no unit test. The glyph appears when Rampage's debuff lands on a Barbarian.

- [ ] **Step 1: Add the glyph entry**

In `src/render/combat_actor.ts`, find the `STATUS_GLYPHS` map (currently includes `stunned`, `bulwark`, `taunting`, `marked`, `blessed`, `rotting`, `frailty`, `chilled`). Add `enraged`:

```ts
const STATUS_GLYPHS: Partial<Record<StatusId, { letter: string; color: string }>> = {
  stunned: { letter: 'S', color: '#ff9944' },
  bulwark: { letter: 'B', color: '#44aacc' },
  taunting: { letter: 'T', color: '#ffcc44' },
  marked: { letter: 'M', color: '#cc4444' },
  blessed: { letter: '+', color: '#ffdd66' },
  rotting: { letter: 'r', color: '#aa44aa' },
  frailty: { letter: '−', color: '#888888' },
  chilled: { letter: 'c', color: '#88ccff' },
  enraged: { letter: 'E', color: '#ff4444' },
};
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests PASS (no behavioral change from adding a glyph).

- [ ] **Step 4: Report ready for user commit.**

---

## Task 5: Add Barbarian's four abilities to data

**Files:**
- Modify: `src/data/types.ts` (`AbilityId` union)
- Modify: `src/data/abilities.ts` (add 4 entries)
- Modify: `src/data/__tests__/abilities.test.ts` (extend `EXPECTED_IDS`)

- [ ] **Step 1: Extend `AbilityId` union**

In `src/data/types.ts`, find the `AbilityId` type and add the four new ids. Final form:

```ts
export type AbilityId =
  | 'knight_slash'
  | 'shield_bash'
  | 'bulwark'
  | 'taunt'
  | 'archer_shoot'
  | 'piercing_shot'
  | 'volley'
  | 'flare_arrow'
  | 'priest_strike'
  | 'mend'
  | 'smite'
  | 'bless'
  | 'bone_slash'
  | 'bone_arrow'
  | 'rotting_bite'
  | 'dark_bolt'
  | 'dark_pact'
  | 'necrotic_wave'
  | 'lich_strike'
  | 'curse_of_frailty'
  | 'chilling_touch'
  | 'barbarian_swing'
  | 'cleave'
  | 'rampage'
  | 'bloodthirst';
```

- [ ] **Step 2: Update `EXPECTED_IDS` in abilities test**

In `src/data/__tests__/abilities.test.ts`, add the four new ids to `EXPECTED_IDS`:

```ts
const EXPECTED_IDS: readonly AbilityId[] = [
  'knight_slash',
  'shield_bash',
  'bulwark',
  'taunt',
  'archer_shoot',
  'piercing_shot',
  'volley',
  'flare_arrow',
  'priest_strike',
  'mend',
  'smite',
  'bless',
  'bone_slash',
  'bone_arrow',
  'rotting_bite',
  'dark_bolt',
  'dark_pact',
  'necrotic_wave',
  'lich_strike',
  'curse_of_frailty',
  'chilling_touch',
  'barbarian_swing',
  'cleave',
  'rampage',
  'bloodthirst',
];
```

- [ ] **Step 3: Run tests — should fail**

Run: `npx vitest run src/data/__tests__/abilities.test.ts`
Expected: failures — the 4 new ids are listed but not registered in `ABILITIES`.

- [ ] **Step 4: Add the four abilities to `ABILITIES`**

In `src/data/abilities.ts`, append after the existing entries (before the closing `};`):

```ts
  barbarian_swing: {
    id: 'barbarian_swing',
    name: 'Swing',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 1.0 }],
  },
  cleave: {
    id: 'cleave',
    name: 'Cleave',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1, 2] },
    effects: [{ kind: 'damage', power: 0.7 }],
    aiCondition: { kind: 'minTargets', n: 2 },
  },
  rampage: {
    id: 'rampage',
    name: 'Rampage',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1] },
    effects: [
      { kind: 'damage', power: 1.5 },
      { kind: 'debuff', stat: 'defense', delta: -2, duration: 2, statusId: 'enraged', selfTarget: true },
    ],
    cooldown: 2,
    aiCondition: { kind: 'casterHpBelow', ratio: 0.5 },
  },
  bloodthirst: {
    id: 'bloodthirst',
    name: 'Bloodthirst',
    canCastFrom: [1, 2],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 1.0, healOnKill: 0.5 }],
  },
```

- [ ] **Step 5: Run tests — should pass**

Run: `npx vitest run src/data/__tests__/abilities.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Report ready for user commit.**

---

## Task 6: Add Barbarian class entry

**Files:**
- Modify: `src/data/types.ts` (`ClassId` union, `WeaponType` union)
- Modify: `src/data/classes.ts` (add `barbarian`)
- Modify: `src/data/__tests__/classes.test.ts` (extend `EXPECTED_IDS`)

- [ ] **Step 1: Extend `ClassId` and `WeaponType`**

In `src/data/types.ts`:

```ts
export type ClassId = 'knight' | 'archer' | 'priest' | 'barbarian';
```

```ts
export type WeaponType = 'sword' | 'bow' | 'holy_symbol' | 'axe';
```

- [ ] **Step 2: Update `EXPECTED_IDS` in classes test**

In `src/data/__tests__/classes.test.ts`:

```ts
const EXPECTED_IDS: readonly ClassId[] = ['knight', 'archer', 'priest', 'barbarian'];
```

- [ ] **Step 3: Run tests — should fail**

Run: `npx vitest run src/data/__tests__/classes.test.ts`
Expected: failures — `barbarian` listed but not registered in `CLASSES`.

- [ ] **Step 4: Add the Barbarian entry to `CLASSES`**

In `src/data/classes.ts`, append after the `priest` entry:

```ts
  barbarian: {
    id: 'barbarian',
    name: 'Barbarian',
    baseStats: { hp: 22, attack: 6, defense: 3, speed: 3, mind: 0, crit: 10, dodge: 5 },
    preferredWeapon: 'axe',
    abilities: ['barbarian_swing', 'cleave', 'rampage', 'bloodthirst'],
    aiPriority: ['rampage', 'cleave', 'bloodthirst', 'barbarian_swing'],
    starterLoadout: {
      weapon: String(SPRITE_NAMES.weapon.battleaxe_tier1),
    },
  },
```

- [ ] **Step 5: Run classes tests — should pass**

Run: `npx vitest run src/data/__tests__/classes.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Report ready for user commit.**

---

## Task 7: Bump save schema and add Barbarian to default unlocks

**Files:**
- Modify: `src/save/migration.ts:3` (CURRENT_SCHEMA_VERSION)
- Modify: `src/save/save.ts:77-82` (createDefaultUnlocks)
- Modify: `src/save/__tests__/save.test.ts` (createDefaultUnlocks assertion)

- [ ] **Step 1: Update the createDefaultUnlocks test assertion**

In `src/save/__tests__/save.test.ts`, find the test `'includes the three Tier 1 classes and Crypt'` (around line 151). It currently asserts `['archer', 'knight', 'priest']`. Update:

```ts
  it('includes the four launch classes and Crypt', () => {
    const u = createDefaultUnlocks();
    expect([...u.classes].sort()).toEqual(['archer', 'barbarian', 'knight', 'priest']);
    expect(u.dungeons).toEqual(['crypt']);
  });
```

- [ ] **Step 2: Run the save test — should fail**

Run: `npx vitest run src/save/__tests__/save.test.ts -t "launch classes"`
Expected: FAIL — current `createDefaultUnlocks` doesn't include barbarian.

- [ ] **Step 3: Add `barbarian` to `createDefaultUnlocks`**

In `src/save/save.ts:77-82`:

```ts
export function createDefaultUnlocks(): Unlocks {
  return {
    classes: ['knight', 'archer', 'priest', 'barbarian'],
    dungeons: ['crypt'],
  };
}
```

- [ ] **Step 4: Bump the schema version**

In `src/save/migration.ts:3`:

```ts
export const CURRENT_SCHEMA_VERSION = 3;
```

No migration registered. Old v2 saves load as null and the boot scene generates a fresh save with the updated unlocks. (Per the user's pre-launch policy.)

- [ ] **Step 5: Run save tests**

Run: `npx vitest run src/save/__tests__/`
Expected: all tests PASS. The migration test "returns null when no migration exists for an older version" continues to pass for any older version; the future-version test still uses `999 > 3`.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Note about `generateStarterRoster`**

`src/camp/buildings/tavern.ts:36-45` hardcodes the starter roster as `['knight', 'archer', 'priest']`. This is intentional and unchanged — the starter roster doesn't include every available class, only the 3 traditional Tier 1 classes. Players recruit Barbarians via the Tavern's `generateCandidate` function, which DOES pull from `unlocks.classes`. **Do not modify `generateStarterRoster`.**

- [ ] **Step 8: Report ready for user commit.**

---

## Task 8: Manual smoke test in browser

This task verifies the Barbarian works end-to-end. Browser-driven via Claude in Chrome (if available), otherwise manual.

- [ ] **Step 1: Start the dev server**

Check if dev is running: `curl -sI http://localhost:5173 | head -1` — if `200 OK`, skip. Otherwise start: `npm run dev` (background).

- [ ] **Step 2: Navigate to localhost:5173**

The schema bump in Task 7 means any existing save is automatically discarded on load. Verify the boot logs no errors and the camp scene renders.

- [ ] **Step 3: Inspect the new save**

In dev tools console (or via Claude-in-Chrome `javascript_tool`):

```js
JSON.parse(localStorage.getItem('pixel-battle-game/save')).unlocks.classes
```

Expected: `['knight', 'archer', 'priest', 'barbarian']`.

- [ ] **Step 4: Recruit a Barbarian from the Tavern**

Navigate to Tavern. Reroll candidates a few times until a Barbarian appears (1-in-4 chance per slot, 3 slots per roll). Verify:
- Barbarian candidate shows axe sprite (battleaxe).
- Stats display ~22 HP, ~6 Attack, ~3 Defense.
- Hire cost works as for other classes.

- [ ] **Step 5: Form a party with Barbarian in slot 1**

Visit Barracks, set party with Barbarian in slot 1. Enter the Crypt.

- [ ] **Step 6: Verify combat behavior**

In combat with 2+ enemies in slots 1-2:
- Barbarian's first turn at full HP picks **Cleave** (hits 2 enemies for ~3 each).

In combat with only 1 enemy in slots 1-2:
- Barbarian picks **Bloodthirst** (single hit; if lethal, gold "+3" heal floater appears on Barbarian; HP goes up).

When Barbarian's HP drops below 50%:
- Barbarian picks **Rampage** on next turn.
- Damage is ~9 to enemy.
- Red "E" status icon appears on Barbarian (enraged).
- Barbarian's effective Defense drops by 2 for 2 turns.

If a Rampage target dodges (rare with default 5% dodge):
- "Miss!" floater appears, but the "E" status STILL applies to Barbarian.

- [ ] **Step 7: Report any visual or behavioral issues**

If anything looks wrong, capture the symptom (screenshot if Claude-in-Chrome; console message; reproduction steps) and decide whether to fix before claiming done or open a `bugs.md` entry.

- [ ] **Step 8: Report ready for user commit.**

---

## Self-review

- **Spec coverage:**
  - §1 stat block → Task 6.
  - §2 weapon type → Task 6.
  - §3 class entry → Task 6.
  - §4 four abilities → Task 5.
  - §5a healOnKill → Task 1.
  - §5b selfTarget → Task 2.
  - §5c aiCondition → Task 3.
  - §6 enraged StatusId → Task 2 step 2.
  - §7 enraged HUD glyph → Task 4.
  - §8 save schema + unlocks (option A confirmed) → Task 7.
  - §9 tavern roll pool — no code change to tavern.ts; covered by Task 7 step 7 note (generateCandidate already uses unlocks).
  - §10 tests — split across Tasks 1, 2, 3, 5, 6, 7 (each task includes its own tests).
  - §11 manual acceptance → Task 8.
- **Placeholder scan:** no TBDs. Each step has concrete code.
- **Type consistency:**
  - `healOnKill: 0.5` used in Task 1 (spec) and Task 5 (Bloodthirst entry).
  - `selfTarget: true` used in Task 2 (test) and Task 5 (Rampage entry).
  - `aiCondition: { kind: 'minTargets', n: 2 }` used in Task 3 (test) and Task 5 (Cleave).
  - `aiCondition: { kind: 'casterHpBelow', ratio: 0.5 }` used in Task 3 (test) and Task 5 (Rampage).
  - `'enraged'` StatusId added in Task 2 (types + STATUS_LABEL), used in Task 2 (test) and Task 5 (Rampage).
  - `barbarian_swing` / `cleave` / `rampage` / `bloodthirst` consistent across Tasks 5/6.
  - `'barbarian'` ClassId added in Task 6, used in Task 7's createDefaultUnlocks.
- **Loop-restructure note (Task 2 step 6):** The new `applyAbility` adds a self-effect pass before the per-target loop. This is in addition to Cluster A task 1's earlier target-major restructure. Existing tests continued to pass after that restructure; verify the new restructure doesn't break any either (Task 2 step 8 catches it).
