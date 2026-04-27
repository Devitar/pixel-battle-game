# Class: Rogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Rogue class — a slot-2 striker with a 4-ability kit (Strike, Backstab, Vanish, Poison Strike) — plus three small extensions to the effect machinery (`bonusCrit` rider on damage, new `moveToSlot` effect kind, new `poison` effect kind with DoT tick) that future Tier 2 / Tier 3 features will reuse.

**Architecture:** Pure-TS data + small extensions to `effects.ts`, `positions.ts`, `statuses.ts`, and `combat.ts`. Three new effect shapes follow the same per-effect-field pattern established by Barbarian (`healOnKill`, `selfTarget`). Save schema bumps 3→4 to discard old saves so existing rosters get the updated `unlocks.classes` list including Rogue.

**Tech Stack:** TypeScript, Vitest. No Phaser changes (existing `STATUS_GLYPHS` system handles new statuses with one-line additions).

**Spec:** `docs/superpowers/specs/2026-04-26-class-rogue-design.md`

**Project convention:** Never commit without explicit user instruction. Each task ends with "report ready for user commit" rather than running `git commit`.

---

## File structure

- **Modify** `src/data/types.ts` — `ClassId` (+`'rogue'`), `WeaponType` (+`'daggers'`), `StatusId` (+`'vanished'`, +`'poisoned'`), `AbilityId` (+4: rogue_strike, backstab, vanish, poison_strike), `AbilityEffect` damage variant (+`bonusCrit?`), new `moveToSlot` and `poison` variants.
- **Modify** `src/data/abilities.ts` — add 4 entries.
- **Modify** `src/data/classes.ts` — add `rogue` entry.
- **Modify** `src/data/ability_describe.ts` — `STATUS_LABEL` adds `vanished`, `poisoned`.
- **Modify** `src/combat/effects.ts` — `applyDamage` honors `bonusCrit`; `applyEffect` handles `moveToSlot` and `poison`; `applyAbility`'s pre-loop self-effect pass handles `moveToSlot`.
- **Modify** `src/combat/positions.ts` — export new `moveTo(combatant, slot, reason, events)` helper for the empty-destination case of `moveToSlot`.
- **Modify** `src/combat/statuses.ts` — `tickStatuses` ticks poison damage before decrement.
- **Modify** `src/combat/combat.ts` — after `tickStatuses` in the turn loop, check `combatant.isDead`; if poison-killed, call `collapseAfterDeath` and skip the rest of the turn.
- **Modify** `src/save/migration.ts` — bump `CURRENT_SCHEMA_VERSION` 3 → 4.
- **Modify** `src/save/save.ts` — `createDefaultUnlocks` adds `'rogue'`.
- **Modify** `src/render/combat_actor.ts` — `STATUS_GLYPHS` adds `vanished`, `poisoned`.
- **Modify** `src/data/__tests__/abilities.test.ts` — `EXPECTED_IDS` adds 4 ids.
- **Modify** `src/data/__tests__/classes.test.ts` — `EXPECTED_IDS` adds `'rogue'`.
- **Modify** `src/save/__tests__/save.test.ts` — `createDefaultUnlocks` test expects `'rogue'`.
- **Modify** `src/combat/__tests__/effects.test.ts` — extend with bonusCrit, moveToSlot, poison tests.
- **Modify** `src/combat/__tests__/statuses.test.ts` — extend with poison tick tests.

No new files. No deletions.

---

## Task 1: `bonusCrit` rider on damage effect

**Files:**
- Modify: `src/data/types.ts` (AbilityEffect damage variant)
- Modify: `src/combat/effects.ts:applyDamage`
- Modify: `src/combat/__tests__/effects.test.ts`

- [ ] **Step 1: Extend the `damage` variant**

In `src/data/types.ts`, change the damage line of the `AbilityEffect` union:

```ts
| { kind: 'damage'; power: number; scalingStat?: 'attack' | 'mind'; healOnKill?: number; bonusCrit?: number }
```

- [ ] **Step 2: Write failing tests**

Append to `src/combat/__tests__/effects.test.ts`:

```ts
describe('bonusCrit', () => {
  it('always crits when caster.crit + bonusCrit >= 100', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0, bonusCrit: 100 }],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied') as { wasCrit: boolean; amount: number };
    expect(dmg.wasCrit).toBe(true);
    // raw = 4; crit doubles to 8; defense 0; final = 8.
    expect(dmg.amount).toBe(8);
  });

  it('never crits when caster.crit + bonusCrit <= 0', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'damage' as const, power: 1.0 }],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied') as { wasCrit: boolean };
    expect(dmg.wasCrit).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests — should fail**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t bonusCrit`
Expected: the always-crits test FAILS — `applyDamage` doesn't yet read `bonusCrit`.

- [ ] **Step 4: Implement bonusCrit in applyDamage**

In `src/combat/effects.ts:applyDamage`, find the `wasCrit` line (after the mark-bonus block, before the defense subtraction):

```ts
  const wasCrit = rng.percent(getEffectiveStat(caster, 'crit'));
```

Replace with:

```ts
  const wasCrit = rng.percent(getEffectiveStat(caster, 'crit') + (effect.bonusCrit ?? 0));
```

The `rng.percent` helper already clamps p to [0, 100], so values > 100 always crit and ≤ 0 never do.

- [ ] **Step 5: Run tests — should pass**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t bonusCrit`
Expected: PASS.

- [ ] **Step 6: Run full suite**

Run: `npm test`
Expected: all tests PASS. Optional field; no existing ability sets it; no regressions.

- [ ] **Step 7: Report ready for user commit.**

---

## Task 2: `moveToSlot` effect kind + `moveTo` helper in positions

**Files:**
- Modify: `src/data/types.ts` (AbilityEffect union)
- Modify: `src/combat/positions.ts` (export new `moveTo` helper)
- Modify: `src/combat/effects.ts` (`applyEffect` handles `moveToSlot`; `applyAbility` pre-loop handles it)
- Modify: `src/combat/__tests__/effects.test.ts`

- [ ] **Step 1: Add `moveToSlot` to AbilityEffect union**

In `src/data/types.ts`, add to the `AbilityEffect` union (location near `shove`/`pull`):

```ts
| { kind: 'moveToSlot'; slot: SlotIndex }
```

- [ ] **Step 2: Export a `moveTo` helper from positions.ts**

The existing `swap` helper requires two combatants. For the empty-destination case of `moveToSlot`, we need to set a single combatant's slot directly. Add to `src/combat/positions.ts` after the existing `swap` function:

```ts
export function moveTo(
  combatant: Combatant,
  toSlot: SlotIndex,
  events: CombatEvent[],
): void {
  if (combatant.slot === toSlot) return;
  const fromSlot = combatant.slot;
  combatant.slot = toSlot;
  events.push({ kind: 'position_changed', combatantId: combatant.id, fromSlot, toSlot, reason: 'swap' });
}
```

(`reason: 'swap'` is the closest existing reason — `moveToSlot` semantically swaps with whoever's at the destination, and emits as a swap whether or not an ally was actually displaced. Keeps the event vocabulary unchanged.)

- [ ] **Step 3: Write failing tests**

Append to `src/combat/__tests__/effects.test.ts`:

```ts
describe('moveToSlot', () => {
  it('swaps caster with ally currently in destination slot', () => {
    const p0 = makeHeroCombatant('knight', 2, 'p0');
    const p1 = makeHeroCombatant('archer', 3, 'p1');
    const state = makeTestState([p0, p1], []);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'self' as const },
      effects: [{ kind: 'moveToSlot' as const, slot: 3 as const }],
    };
    applyAbility(ability, p0, ['p0'], state, rng, events);
    expect(p0.slot).toBe(3);
    expect(p1.slot).toBe(2);
    const moves = events.filter((e) => e.kind === 'position_changed');
    expect(moves).toHaveLength(2);
  });

  it('moves caster directly when destination slot is empty', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const state = makeTestState([p0], []);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'self' as const },
      effects: [{ kind: 'moveToSlot' as const, slot: 3 as const }],
    };
    applyAbility(ability, p0, ['p0'], state, rng, events);
    expect(p0.slot).toBe(3);
    const moves = events.filter((e) => e.kind === 'position_changed');
    expect(moves).toHaveLength(1);
  });

  it('is a no-op when caster already in destination slot', () => {
    const p0 = makeHeroCombatant('knight', 3, 'p0');
    const state = makeTestState([p0], []);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'self' as const },
      effects: [{ kind: 'moveToSlot' as const, slot: 3 as const }],
    };
    applyAbility(ability, p0, ['p0'], state, rng, events);
    expect(p0.slot).toBe(3);
    const moves = events.filter((e) => e.kind === 'position_changed');
    expect(moves).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run tests — should fail**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t moveToSlot`
Expected: the moveToSlot effect kind isn't handled in `applyEffect`; tests fail.

- [ ] **Step 5: Handle `moveToSlot` in `applyEffect`**

In `src/combat/effects.ts`, find the `applyEffect` switch statement. Add the new case (location: alongside `shove` / `pull`):

```ts
    case 'moveToSlot': {
      const sameSide = state.combatants.filter(
        (c) => c.side === caster.side && !c.isDead && c.id !== caster.id,
      );
      const occupant = sameSide.find((c) => c.slot === effect.slot);
      if (occupant) {
        swap(caster, occupant, events);
      } else {
        moveTo(caster, effect.slot, events);
      }
      return;
    }
```

Add `moveTo` to the imports at the top of `effects.ts`:

```ts
import { collapseAfterDeath, moveTo, pull, shove, swap } from './positions';
```

(`swap` is already used elsewhere; verify the import line covers all four.)

- [ ] **Step 6: Extend `applyAbility`'s pre-loop self-effect pass to include `moveToSlot`**

In `src/combat/effects.ts:applyAbility`, modify the pre-loop pass (currently checks for selfTarget buff/debuff). Replace both occurrences (the pre-loop pass AND the per-target loop's skip check) of:

```ts
const isSelfTarget =
  (effect.kind === 'buff' || effect.kind === 'debuff') && effect.selfTarget === true;
```

with:

```ts
const isSelfTarget =
  effect.kind === 'moveToSlot' ||
  ((effect.kind === 'buff' || effect.kind === 'debuff') && effect.selfTarget === true);
```

- [ ] **Step 7: Run tests — should pass**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t moveToSlot`
Expected: all 3 tests PASS.

- [ ] **Step 8: Run full suite**

Run: `npm test`
Expected: all tests PASS. The new effect kind isn't used by any existing ability.

- [ ] **Step 9: Report ready for user commit.**

---

## Task 3: `poison` effect kind + tick logic + death-mid-turn handling

**Files:**
- Modify: `src/data/types.ts` (AbilityEffect, StatusId)
- Modify: `src/combat/effects.ts` (`applyEffect` handles `poison`)
- Modify: `src/combat/statuses.ts` (`tickStatuses` ticks poison)
- Modify: `src/combat/combat.ts` (death-from-poison handling in turn loop)
- Modify: `src/combat/__tests__/statuses.test.ts`
- Modify: `src/combat/__tests__/effects.test.ts`

- [ ] **Step 1: Add `poison` to AbilityEffect and `'poisoned'` to StatusId**

In `src/data/types.ts`:

```ts
export type StatusId = 'bulwark' | 'taunting' | 'marked' | 'blessed' | 'rotting' | 'frailty' | 'stunned' | 'chilled' | 'enraged' | 'poisoned' | 'vanished';
```

(Adding both `'poisoned'` and `'vanished'` here; `'vanished'` is used by Vanish in Task 5.)

Add the new variant to `AbilityEffect`:

```ts
| { kind: 'poison'; damagePerTurn: number; duration: number; statusId: StatusId }
```

- [ ] **Step 2: Update `STATUS_LABEL` in ability_describe.ts**

In `src/data/ability_describe.ts`, extend `STATUS_LABEL`:

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
  poisoned: 'poisoned',
  vanished: 'vanished',
};
```

- [ ] **Step 3: Write failing tests for poison effect application**

Append to `src/combat/__tests__/effects.test.ts`:

```ts
describe('poison effect', () => {
  it('stores a "poisoned" status on the target', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = {
      id: 'knight_slash' as const,
      name: 'Test',
      canCastFrom: [1, 2] as const,
      target: { side: 'enemy' as const, slots: [1] as const },
      effects: [{ kind: 'poison' as const, damagePerTurn: 2, duration: 3, statusId: 'poisoned' as const }],
    };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    expect(e0.statuses['poisoned']).toBeDefined();
    expect(e0.statuses['poisoned'].remainingTurns).toBe(3);
    const statusEvent = events.find((e) => e.kind === 'status_applied' && e.statusId === 'poisoned');
    expect(statusEvent).toBeDefined();
  });
});
```

- [ ] **Step 4: Run tests — should fail**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t "poison effect"`
Expected: FAIL — `applyEffect` doesn't yet handle `poison`.

- [ ] **Step 5: Handle `poison` in `applyEffect`**

In `src/combat/effects.ts:applyEffect`, add a new case alongside `buff`/`debuff`:

```ts
    case 'poison':
      storeStatus(caster, target, effect.statusId, effect, effect.duration, events);
      return;
```

- [ ] **Step 6: Run application tests — should pass**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t "poison effect"`
Expected: PASS.

- [ ] **Step 7: Write failing tests for poison tick**

Append to `src/combat/__tests__/statuses.test.ts`:

```ts
describe('tickStatuses — poison', () => {
  it('decrements target HP by damagePerTurn each tick', () => {
    const c = createHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 100, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 10,
    });
    c.statuses['poisoned'] = {
      statusId: 'poisoned',
      remainingTurns: 3,
      effect: { kind: 'poison', damagePerTurn: 2, duration: 3, statusId: 'poisoned' },
      sourceId: 'enemy',
    };
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.currentHp).toBe(8);
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dmg).toMatchObject({ amount: 2, wasCrit: false, sourceId: 'enemy', targetId: 'p0' });
  });

  it('poison damage bypasses defense', () => {
    const c = createHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 100, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 10,
    });
    c.statuses['poisoned'] = {
      statusId: 'poisoned',
      remainingTurns: 1,
      effect: { kind: 'poison', damagePerTurn: 2, duration: 1, statusId: 'poisoned' },
      sourceId: 'enemy',
    };
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.currentHp).toBe(8);
  });

  it('poison expires after duration ticks', () => {
    const c = createHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 20,
    });
    c.statuses['poisoned'] = {
      statusId: 'poisoned',
      remainingTurns: 3,
      effect: { kind: 'poison', damagePerTurn: 2, duration: 3, statusId: 'poisoned' },
      sourceId: 'enemy',
    };
    for (let i = 0; i < 3; i++) {
      tickStatuses(c, [] as CombatEvent[]);
    }
    expect(c.currentHp).toBe(14);
    expect(c.statuses['poisoned']).toBeUndefined();
  });

  it('poison kills target — emits death event and sets isDead', () => {
    const c = createHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 1,
    });
    c.statuses['poisoned'] = {
      statusId: 'poisoned',
      remainingTurns: 3,
      effect: { kind: 'poison', damagePerTurn: 2, duration: 3, statusId: 'poisoned' },
      sourceId: 'enemy',
    };
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.isDead).toBe(true);
    const death = events.find((e) => e.kind === 'death');
    expect(death).toMatchObject({ combatantId: 'p0' });
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dmg).toMatchObject({ lethal: true });
  });
});
```

(Verify imports in statuses.test.ts include `createHeroCombatant` from `'../combatant'` and `tickStatuses` from `'../statuses'`. Add as needed.)

- [ ] **Step 8: Run tests — should fail**

Run: `npx vitest run src/combat/__tests__/statuses.test.ts -t poison`
Expected: tests fail — `tickStatuses` doesn't handle poison yet.

- [ ] **Step 9: Implement poison tick in `tickStatuses`**

Replace the body of `tickStatuses` in `src/combat/statuses.ts`:

```ts
import { TRAITS } from '../data/traits';
import type { BuffableStat, TraitCondition } from '../data/types';
import type { Combatant, CombatantId, CombatEvent } from './types';

function evaluateTraitCondition(
  condition: TraitCondition | undefined,
  combatant: Combatant,
): boolean {
  if (!condition) return true;
  switch (condition.kind) {
    case 'inSlot':
      return combatant.slot === condition.slot;
  }
}

export function getEffectiveStat(combatant: Combatant, stat: BuffableStat): number {
  let total = combatant.baseStats[stat === 'hp' ? 'hp' : stat];

  if (stat !== 'hp' && combatant.traitId) {
    const trait = TRAITS[combatant.traitId];
    for (const effect of trait.statEffects ?? []) {
      if (effect.stat === stat && evaluateTraitCondition(effect.condition, combatant)) {
        total += effect.delta;
      }
    }
  }

  for (const status of Object.values(combatant.statuses)) {
    const e = status.effect;
    if ((e.kind === 'buff' || e.kind === 'debuff') && e.stat === stat) {
      total += e.delta;
    }
  }
  return total;
}

export function tickStatuses(combatant: Combatant, events: CombatEvent[]): void {
  const ids = Object.keys(combatant.statuses);
  for (const id of ids) {
    const status = combatant.statuses[id];

    // Poison ticks first, before decrement, so it fires every turn including the expiry turn.
    // Poison damage bypasses defense / crit / dodge — it's "true damage" per auto-battler convention.
    if (status.effect.kind === 'poison' && !combatant.isDead) {
      applyPoisonDamage(combatant, status.effect.damagePerTurn, status.sourceId, events);
    }

    status.remainingTurns -= 1;
    if (status.remainingTurns <= 0) {
      const e = status.effect;
      if ((e.kind === 'buff' || e.kind === 'debuff') && e.stat === 'hp') {
        combatant.maxHp -= e.delta;
      }
      delete combatant.statuses[id];
      events.push({ kind: 'status_expired', targetId: combatant.id, statusId: status.statusId });
    }
  }
}

function applyPoisonDamage(
  target: Combatant,
  damagePerTurn: number,
  sourceId: CombatantId,
  events: CombatEvent[],
): void {
  target.currentHp -= damagePerTurn;
  const lethal = target.currentHp <= 0;
  events.push({
    kind: 'damage_applied',
    sourceId,
    targetId: target.id,
    amount: damagePerTurn,
    lethal,
    wasCrit: false,
  });
  if (lethal) {
    target.isDead = true;
    events.push({ kind: 'death', combatantId: target.id });
  }
}
```

- [ ] **Step 10: Run tick tests — should pass**

Run: `npx vitest run src/combat/__tests__/statuses.test.ts -t poison`
Expected: all 4 tick tests PASS.

- [ ] **Step 11: Handle death-from-poison in combat.ts turn loop**

In `src/combat/combat.ts:73`, the turn loop calls `tickStatuses(combatant, events)`. After this call, the combatant may be dead from poison. Currently the loop would continue to `tickCooldowns` and then `pickAbility` / `applyAbility` on a corpse.

Find the block (around lines 70-82):

```ts
      events.push({ kind: 'turn_start', combatantId: id });

      const willBeStunned = 'stunned' in combatant.statuses;
      tickStatuses(combatant, events);
      tickCooldowns(combatant);

      if (willBeStunned) {
        events.push({ kind: 'turn_skipped', combatantId: id, reason: 'stunned' });
      } else {
        const picked = pickAbility(combatant, state, rng);
```

Insert a death check after `tickStatuses` and before `tickCooldowns`:

```ts
      events.push({ kind: 'turn_start', combatantId: id });

      const willBeStunned = 'stunned' in combatant.statuses;
      tickStatuses(combatant, events);

      if (combatant.isDead) {
        // Poison (or future tick-damage status) killed them on their own turn.
        // Collapse the side and skip the rest of the turn.
        collapseAfterDeath(combatant.side, state, events);
        continue;
      }

      tickCooldowns(combatant);

      if (willBeStunned) {
```

Add `collapseAfterDeath` to imports at top of `combat.ts` (verify — may already be imported via positions module).

- [ ] **Step 12: Write a turn-loop test for poison death**

Append to `src/combat/__tests__/combat.test.ts` (or extend an existing describe block if appropriate):

```ts
describe('resolveCombat — poison kills mid-turn', () => {
  it('a poisoned combatant who dies from poison on their own turn skips the rest of the turn', () => {
    const hero = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 5, mind: 0, crit: 0, dodge: 0 },
      currentHp: 1,
      maxHp: 20,
    });
    hero.statuses['poisoned'] = {
      statusId: 'poisoned',
      remainingTurns: 3,
      effect: { kind: 'poison', damagePerTurn: 2, duration: 3, statusId: 'poisoned' },
      sourceId: 'e0',
    };
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 100,
      maxHp: 100,
    });
    const initial = makeTestState([hero], [enemy]);
    const result = resolveCombat(initial, createRng(1));
    // Hero dies from poison on their own turn.
    expect(result.outcome).toBe('player_defeat');
    // No 'ability_cast' from p0 should appear after the death.
    const heroDeathIdx = result.events.findIndex((e) => e.kind === 'death' && e.combatantId === 'p0');
    expect(heroDeathIdx).toBeGreaterThanOrEqual(0);
    const heroCastsAfterDeath = result.events
      .slice(heroDeathIdx + 1)
      .some((e) => e.kind === 'ability_cast' && e.casterId === 'p0');
    expect(heroCastsAfterDeath).toBe(false);
  });
});
```

- [ ] **Step 13: Run combat tests — should pass**

Run: `npx vitest run src/combat/__tests__/combat.test.ts -t poison`
Expected: PASS.

- [ ] **Step 14: Run the full suite**

Run: `npm test`
Expected: all tests PASS. No regressions in existing combat tests (the new death-mid-turn check only fires when isDead is true, which never happens before poison existed).

- [ ] **Step 15: Report ready for user commit.**

---

## Task 4: HUD glyphs for new statuses

**Files:**
- Modify: `src/render/combat_actor.ts` (STATUS_GLYPHS)

- [ ] **Step 1: Add the glyph entries**

In `src/render/combat_actor.ts`, find `STATUS_GLYPHS`. Add the two new entries:

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
  vanished: { letter: 'V', color: '#aaccff' },
  poisoned: { letter: 'P', color: '#88cc44' },
};
```

- [ ] **Step 2: Type-check + tests**

Run: `npm run build && npm test`
Expected: build clean, all tests PASS.

- [ ] **Step 3: Report ready for user commit.**

---

## Task 5: Add Rogue's four abilities

**Files:**
- Modify: `src/data/types.ts` (`AbilityId` union)
- Modify: `src/data/abilities.ts` (add 4 entries)
- Modify: `src/data/__tests__/abilities.test.ts` (`EXPECTED_IDS`)

- [ ] **Step 1: Extend `AbilityId` union**

In `src/data/types.ts`, append to the `AbilityId` union (after Barbarian's abilities):

```ts
  | 'barbarian_swing'
  | 'cleave'
  | 'rampage'
  | 'bloodthirst'
  | 'rogue_strike'
  | 'backstab'
  | 'vanish'
  | 'poison_strike';
```

- [ ] **Step 2: Update `EXPECTED_IDS` in abilities test**

In `src/data/__tests__/abilities.test.ts`, append to `EXPECTED_IDS`:

```ts
  'rogue_strike',
  'backstab',
  'vanish',
  'poison_strike',
];
```

- [ ] **Step 3: Run tests — should fail**

Run: `npx vitest run src/data/__tests__/abilities.test.ts`
Expected: failures — 4 new ids listed but not registered.

- [ ] **Step 4: Add the four abilities to ABILITIES**

In `src/data/abilities.ts`, append after Barbarian's abilities, before the closing `};`:

```ts
  rogue_strike: {
    id: 'rogue_strike',
    name: 'Strike',
    canCastFrom: [1, 2, 3],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 1.0 }],
  },
  backstab: {
    id: 'backstab',
    name: 'Backstab',
    canCastFrom: [2, 3],
    target: { side: 'enemy', slots: 'furthest' },
    effects: [{ kind: 'damage', power: 1.2, bonusCrit: 25 }],
    cooldown: 2,
  },
  vanish: {
    id: 'vanish',
    name: 'Vanish',
    canCastFrom: [1, 2],
    target: { side: 'self' },
    effects: [
      { kind: 'moveToSlot', slot: 3 },
      { kind: 'buff', stat: 'dodge', delta: 15, duration: 2, statusId: 'vanished', selfTarget: true },
    ],
    cooldown: 2,
    aiCondition: { kind: 'casterHpBelow', ratio: 0.5 },
  },
  poison_strike: {
    id: 'poison_strike',
    name: 'Poison Strike',
    canCastFrom: [1, 2, 3],
    target: { side: 'enemy', filter: { kind: 'lacksStatus', statusId: 'poisoned' }, pick: 'first' },
    effects: [
      { kind: 'damage', power: 0.8 },
      { kind: 'poison', damagePerTurn: 2, duration: 3, statusId: 'poisoned' },
    ],
  },
```

- [ ] **Step 5: Run abilities tests**

Run: `npx vitest run src/data/__tests__/abilities.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Report ready for user commit.**

---

## Task 6: Add Rogue class entry

**Files:**
- Modify: `src/data/types.ts` (`ClassId`, `WeaponType`)
- Modify: `src/data/classes.ts` (add `rogue`)
- Modify: `src/data/__tests__/classes.test.ts` (`EXPECTED_IDS`)

- [ ] **Step 1: Extend `ClassId` and `WeaponType`**

In `src/data/types.ts`:

```ts
export type ClassId = 'knight' | 'archer' | 'priest' | 'barbarian' | 'rogue';
```

```ts
export type WeaponType = 'sword' | 'bow' | 'holy_symbol' | 'axe' | 'daggers';
```

- [ ] **Step 2: Update `EXPECTED_IDS` in classes test**

In `src/data/__tests__/classes.test.ts`:

```ts
const EXPECTED_IDS: readonly ClassId[] = ['knight', 'archer', 'priest', 'barbarian', 'rogue'];
```

- [ ] **Step 3: Run tests — should fail**

Run: `npx vitest run src/data/__tests__/classes.test.ts`
Expected: failure — `rogue` listed but not registered.

- [ ] **Step 4: Add Rogue entry to CLASSES**

In `src/data/classes.ts`, append after `barbarian`:

```ts
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    baseStats: { hp: 13, attack: 5, defense: 1, speed: 6, mind: 0, crit: 20, dodge: 15 },
    preferredWeapon: 'daggers',
    abilities: ['rogue_strike', 'backstab', 'vanish', 'poison_strike'],
    aiPriority: ['vanish', 'backstab', 'poison_strike', 'rogue_strike'],
    starterLoadout: {
      weapon: String(SPRITE_NAMES.weapon.dagger_tier1),
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

## Task 7: Bump save schema and add Rogue to default unlocks

**Files:**
- Modify: `src/save/migration.ts:3` (CURRENT_SCHEMA_VERSION)
- Modify: `src/save/save.ts:77-82` (createDefaultUnlocks)
- Modify: `src/save/__tests__/save.test.ts` (createDefaultUnlocks assertion)

- [ ] **Step 1: Update the createDefaultUnlocks test assertion**

In `src/save/__tests__/save.test.ts`, find the `createDefaultUnlocks` test (it currently expects `['archer', 'barbarian', 'knight', 'priest']`). Update:

```ts
  it('includes the five launch classes and Crypt', () => {
    const u = createDefaultUnlocks();
    expect([...u.classes].sort()).toEqual(['archer', 'barbarian', 'knight', 'priest', 'rogue']);
    expect(u.dungeons).toEqual(['crypt']);
  });
```

- [ ] **Step 2: Run the save test — should fail**

Run: `npx vitest run src/save/__tests__/save.test.ts -t "launch classes"`
Expected: FAIL — current `createDefaultUnlocks` doesn't include rogue.

- [ ] **Step 3: Add `rogue` to createDefaultUnlocks**

In `src/save/save.ts:77-82`:

```ts
export function createDefaultUnlocks(): Unlocks {
  return {
    classes: ['knight', 'archer', 'priest', 'barbarian', 'rogue'],
    dungeons: ['crypt'],
  };
}
```

- [ ] **Step 4: Bump schema version**

In `src/save/migration.ts:3`:

```ts
export const CURRENT_SCHEMA_VERSION = 4;
```

No migration registered.

- [ ] **Step 5: Run save tests + full suite**

Run: `npx vitest run src/save/__tests__/ && npm test`
Expected: all tests PASS.

- [ ] **Step 6: Report ready for user commit.**

---

## Task 8: Browser smoke test (driven via Claude in Chrome)

This task verifies the Rogue works end-to-end. The pattern is the same as the Barbarian smoke test: drive the dev server via Claude in Chrome.

- [ ] **Step 1: Confirm dev server is running**

Check: `curl -sI http://localhost:5173 | head -1` — if `200 OK`, skip. Otherwise start: `npm run dev` (background).

- [ ] **Step 2: Verify schema bump and unlocks via browser JS**

After navigating to `localhost:5173`, run via `mcp__claude-in-chrome__javascript_tool`:

```js
(() => {
  const raw = localStorage.getItem('pixel-battle-game/save');
  const parsed = JSON.parse(raw);
  return {
    schemaVersion: parsed.version,
    unlockedClasses: parsed.unlocks?.classes,
  };
})()
```

Expected: `schemaVersion: 4`, `unlockedClasses` includes `'rogue'`.

- [ ] **Step 3: Verify Rogue rolls in Tavern**

```js
(async () => {
  const tavern = await import('/src/camp/buildings/tavern.ts');
  const rngMod = await import('/src/util/rng.ts');
  const classes = ['knight', 'archer', 'priest', 'barbarian', 'rogue'];
  const rng = rngMod.createRng(12345);
  const counts = {};
  for (let i = 0; i < 50; i++) {
    const c = tavern.generateCandidate(rng, classes);
    counts[c.classId] = (counts[c.classId] ?? 0) + 1;
  }
  return counts;
})()
```

Expected: `rogue` appears at roughly 1/5 rate (~10 of 50, plus or minus).

- [ ] **Step 4: Verify Rogue's abilities behave correctly**

```js
(async () => {
  const combatantMod = await import('/src/combat/combatant.ts');
  const abilitiesMod = await import('/src/data/abilities.ts');
  const effectsMod = await import('/src/combat/effects.ts');
  const pickMod = await import('/src/combat/ability_priority.ts');
  const rngMod = await import('/src/util/rng.ts');
  const statusesMod = await import('/src/combat/statuses.ts');

  // Backstab: targets back-most enemy
  const rogue = combatantMod.createHeroCombatant('rogue', 2, 'p0');
  const e0 = combatantMod.createEnemyCombatant('skeleton_warrior', 1, 'e0');
  const e1 = combatantMod.createEnemyCombatant('skeleton_warrior', 2, 'e1');
  const e2 = combatantMod.createEnemyCombatant('skeleton_warrior', 3, 'e2');
  const state1 = { combatants: [rogue, e0, e1, e2], round: 1, exhaustionLevel: 0 };
  const events1 = [];
  effectsMod.applyAbility(abilitiesMod.ABILITIES.backstab, rogue, [pickMod.pickAbility(rogue, state1, rngMod.createRng(1)).targetIds[0]], state1, rngMod.createRng(1), events1);
  const backstabTarget = events1.find(e => e.kind === 'damage_applied')?.targetId;

  // Vanish: rogue moves to slot 3
  const r2 = combatantMod.createHeroCombatant('rogue', 2, 'p1');
  r2.currentHp = 5;
  const ally = combatantMod.createHeroCombatant('knight', 3, 'p2');
  const state2 = { combatants: [r2, ally], round: 1, exhaustionLevel: 0 };
  const events2 = [];
  effectsMod.applyAbility(abilitiesMod.ABILITIES.vanish, r2, ['p1'], state2, rngMod.createRng(1), events2);

  // Poison: target gets poisoned status
  const r3 = combatantMod.createHeroCombatant('rogue', 2, 'p3');
  const e3 = combatantMod.createEnemyCombatant('skeleton_warrior', 1, 'e3');
  const state3 = { combatants: [r3, e3], round: 1, exhaustionLevel: 0 };
  const events3 = [];
  effectsMod.applyAbility(abilitiesMod.ABILITIES.poison_strike, r3, ['e3'], state3, rngMod.createRng(1), events3);
  // Tick poison once
  statusesMod.tickStatuses(e3, []);

  return {
    backstabHitsBackmost: backstabTarget === 'e2',
    rogueAfterVanishSlot: r2.slot,
    allyAfterVanishSlot: ally.slot,
    vanishedStatusOnRogue: r2.statuses['vanished'] !== undefined,
    poisonStatusOnE3: e3.statuses['poisoned'] !== undefined,
    e3HpAfterTick: e3.currentHp,
    e3StartHp: 12,
  };
})()
```

Expected:
- `backstabHitsBackmost: true`
- `rogueAfterVanishSlot: 3`, `allyAfterVanishSlot: 2` (swapped)
- `vanishedStatusOnRogue: true`
- `poisonStatusOnE3: true`
- `e3HpAfterTick`: starting HP minus poison_strike damage minus 2 (one poison tick).

- [ ] **Step 5: Console clean**

Read console messages with `pattern: '.'` and `onlyErrors: true`. Expected: no errors.

- [ ] **Step 6: Report ready for user commit.**

---

## Self-review

- **Spec coverage:**
  - §1 stat block → Task 6.
  - §2 weapon type → Task 6.
  - §3 class entry → Task 6.
  - §4 four abilities → Task 5.
  - §5a bonusCrit → Task 1.
  - §5b moveToSlot → Task 2.
  - §5c poison → Task 3.
  - §6 applyAbility extension → Task 2 (covers moveToSlot's pre-loop pass).
  - §6 tickStatuses extension → Task 3.
  - §6 death-mid-turn handling in combat.ts → Task 3.
  - §7 new StatusIds → Task 3 step 1 (both 'poisoned' and 'vanished' added together since both are needed before Task 5's abilities reference them).
  - §7 STATUS_GLYPHS → Task 4.
  - §7 STATUS_LABEL → Task 3 step 2.
  - §8 save schema + unlocks → Task 7.
  - §9 tests — split across Tasks 1, 2, 3, 5, 6, 7 (each task includes its own tests).
  - §10 manual acceptance → Task 8.
- **Placeholder scan:** No TBDs. Each step has concrete code or commands.
- **Type consistency:**
  - `bonusCrit: 25` used in Task 1 (test) and Task 5 (Backstab).
  - `moveToSlot, slot: 3` used in Task 2 (test) and Task 5 (Vanish).
  - `poison, damagePerTurn: 2, duration: 3, statusId: 'poisoned'` used in Task 3 (test) and Task 5 (Poison Strike).
  - `'rogue'`, `'rogue_strike'`, `'backstab'`, `'vanish'`, `'poison_strike'` consistent across Tasks 5/6/7.
  - `'vanished'` and `'poisoned'` StatusIds added in Task 3 step 1, used in Task 4 glyphs and Task 5 abilities.
- **Dependency note:** Task 5 (abilities) references types added across Tasks 1-3. The plan keeps abilities as Task 5 because adding them earlier would error on undefined effect kinds. Order matters; don't reorder.
- **Save schema concern:** the spec confirmed Option A (bump+discard) and the user is OK with this; documented in Task 7.
