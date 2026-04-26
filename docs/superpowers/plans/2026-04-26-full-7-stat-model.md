# Full 7-stat model implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the combat stat model from 4 stats to the full 7 (HP, Attack, Defense, Speed + Mind, Crit, Dodge). Mind scales magical damage and healing; Crit doubles damage rolls (per-attack); Dodge skips an incoming attack outright (per-target).

**Architecture:** Pure-TS extension to `Stats` and effect resolver. Per-effect `scalingStat?: 'attack' | 'mind'` chooses the scaling source. Crit and dodge use a new `rng.percent(p)` helper; both gated on `> 0` so existing combatants (defaults of 0) consume zero additional RNG and the existing 5-seed determinism test stays green. Save schema bumps version 1 → 2 with no migration (pre-launch policy).

**Tech Stack:** TypeScript, Vitest, Phaser (combat playback only).

**Spec:** `docs/superpowers/specs/2026-04-26-full-7-stat-model-design.md`

**Project convention:** Never commit without explicit user instruction. Each task ends with "report ready for user commit" rather than running `git commit` directly.

---

## File structure

- **Modify** `src/util/rng.ts` — add `percent(p)` to the `Rng` interface and implementation.
- **Modify** `src/util/__tests__/rng.test.ts` (or create if absent) — boundary tests for `percent`.
- **Modify** `src/combat/types.ts` — extend `Stats` with mind/crit/dodge; extend `damage_applied` event with `wasCrit`; add `attack_dodged` variant to `CombatEvent`.
- **Modify** `src/data/types.ts` — extend `BuffableStat` to include `mind | crit | dodge`; add optional `scalingStat?: 'attack' | 'mind'` to the `damage` and `heal` variants of `AbilityEffect`.
- **Modify** `src/data/classes.ts` — backfill mind/crit/dodge defaults per spec §8.
- **Modify** `src/data/enemies.ts` — backfill mind/crit/dodge defaults per spec §8.
- **Modify** `src/data/abilities.ts` — tag mind-flavored abilities per spec §9 (mend, smite, dark_pact, dark_bolt, necrotic_wave).
- **Modify** `src/combat/effects.ts` — `applyDamage`/`applyHeal` honor `scalingStat`; `applyDamage` rolls crit and emits `wasCrit`; `applyAbility` runs per-target dodge gate.
- **Modify** `src/combat/__tests__/effects.test.ts` — extend with scalingStat + crit tests; update existing damage assertions to include `wasCrit: false`.
- **Create** `src/combat/__tests__/dodge.test.ts` — dodge unit tests.
- **Modify** `src/save/migration.ts` — bump `CURRENT_SCHEMA_VERSION` 1 → 2.
- **Modify** `src/scenes/combat_playback.ts` — handle `attack_dodged`; surface `wasCrit` on damage.
- **Modify** `src/render/combat_actor.ts` (only if a new helper is needed; currently `spawnNumber` is sufficient).

No deletions, no file renames.

---

## Task 1: Add `rng.percent` helper

**Files:**
- Modify: `src/util/rng.ts:6-13` (interface), `src/util/rng.ts:26-58` (implementation block)
- Test: `src/util/__tests__/rng.test.ts` (extend or create)

- [ ] **Step 1: Check whether `src/util/__tests__/rng.test.ts` exists**

Run: `ls src/util/__tests__/ 2>&1` (use the Bash tool). If `rng.test.ts` exists, extend it. If not, create it with the full contents shown in Step 2.

- [ ] **Step 2: Write the failing tests**

If creating the file, write:

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';

describe('rng.percent', () => {
  it('returns false for p = 0', () => {
    const rng = createRng(1);
    for (let i = 0; i < 100; i++) expect(rng.percent(0)).toBe(false);
  });

  it('returns true for p = 100', () => {
    const rng = createRng(1);
    for (let i = 0; i < 100; i++) expect(rng.percent(100)).toBe(true);
  });

  it('returns true roughly half the time for p = 50 over many rolls', () => {
    const rng = createRng(42);
    let trues = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) if (rng.percent(50)) trues++;
    // Allow ±10% drift; with N=1000 and a fixed seed this is very stable.
    expect(trues).toBeGreaterThan(400);
    expect(trues).toBeLessThan(600);
  });

  it('clamps p outside [0, 100]', () => {
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) expect(rng.percent(-50)).toBe(false);
    for (let i = 0; i < 50; i++) expect(rng.percent(150)).toBe(true);
  });

  it('is deterministic for the same seed', () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 50; i++) expect(a.percent(37)).toBe(b.percent(37));
  });
});
```

If extending an existing file, append the `describe('rng.percent', ...)` block at the end.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/util/__tests__/rng.test.ts`

Expected: FAIL — `rng.percent is not a function` or TypeScript error `Property 'percent' does not exist on type 'Rng'`.

- [ ] **Step 4: Add `percent` to the Rng interface**

In `src/util/rng.ts`, change the `Rng` interface (currently lines 6-13) to:

```ts
export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(array: readonly T[]): T;
  shuffle<T>(array: readonly T[]): T[];
  weighted<T>(options: readonly WeightedOption<T>[]): T;
  percent(p: number): boolean;
  getState(): number;
}
```

- [ ] **Step 5: Implement `percent` in the factory**

In `src/util/rng.ts`, inside the returned object literal in `createRngInternal` (currently lines 26-58), add the new method after `weighted` and before `getState`:

```ts
    percent(p: number): boolean {
      const clamped = p < 0 ? 0 : p > 100 ? 100 : p;
      if (clamped <= 0) return false;
      if (clamped >= 100) return true;
      return next() * 100 < clamped;
    },
```

The early returns for 0/100 are intentional: they avoid consuming RNG when the answer is determined. This is important for the determinism contract — see §5 of the spec.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/util/__tests__/rng.test.ts`
Expected: PASS for all five tests.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests PASS (no regressions; `Rng` consumers still type-check because we only *added* a method).

- [ ] **Step 8: Report ready for user commit**

Per project convention do not commit. Tell the user the change is staged-ready and what the diff covers.

---

## Task 2: Extend `Stats` and `BuffableStat`; backfill class and enemy data

**Files:**
- Modify: `src/combat/types.ts:12-17` (Stats)
- Modify: `src/data/types.ts` (BuffableStat — find with grep)
- Modify: `src/data/classes.ts` (all three classes — knight/archer/priest)
- Modify: `src/data/enemies.ts` (all six enemies)

This task changes the type and immediately backfills the data so the codebase still compiles. Cannot split the type and data into separate steps without breaking the build between them.

- [ ] **Step 1: Extend the `Stats` interface**

In `src/combat/types.ts`, change the `Stats` interface (lines 12-17) to:

```ts
export interface Stats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  mind: number;
  crit: number;
  dodge: number;
}
```

- [ ] **Step 2: Extend `BuffableStat`**

Find the definition with `grep -n "BuffableStat" src/data/types.ts`. It currently reads:

```ts
export type BuffableStat = 'hp' | 'attack' | 'defense' | 'speed';
```

Change it to:

```ts
export type BuffableStat = 'hp' | 'attack' | 'defense' | 'speed' | 'mind' | 'crit' | 'dodge';
```

- [ ] **Step 3: Run type-check to surface the cascade of errors**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: errors in `src/data/classes.ts` and `src/data/enemies.ts` complaining that `mind`, `crit`, `dodge` are missing from `baseStats` literals. Also possibly errors in tests that build a `Stats` literal directly.

- [ ] **Step 4: Backfill class baseStats**

In `src/data/classes.ts`, replace the three `baseStats` literals so each includes the new fields. Final values per spec §8:

```ts
  knight: {
    id: 'knight',
    name: 'Knight',
    baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 5, dodge: 5 },
    // ... rest unchanged
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    baseStats: { hp: 14, attack: 5, defense: 2, speed: 5, mind: 0, crit: 15, dodge: 10 },
    // ... rest unchanged
  },
  priest: {
    id: 'priest',
    name: 'Priest',
    baseStats: { hp: 15, attack: 3, defense: 2, speed: 4, mind: 5, crit: 5, dodge: 5 },
    // ... rest unchanged
  },
```

- [ ] **Step 5: Backfill enemy baseStats**

In `src/data/enemies.ts`, replace each `baseStats` literal. Final values per spec §8:

```ts
  skeleton_warrior: { ..., baseStats: { hp: 12, attack: 3, defense: 2, speed: 3, mind: 0, crit: 5, dodge: 5 }, ... },
  skeleton_archer:  { ..., baseStats: { hp: 10, attack: 4, defense: 1, speed: 4, mind: 0, crit: 5, dodge: 5 }, ... },
  ghost:            { ..., baseStats: { hp: 12, attack: 3, defense: 1, speed: 4, mind: 0, crit: 5, dodge: 5 }, ... },
  zombie:           { ..., baseStats: { hp: 16, attack: 3, defense: 1, speed: 2, mind: 0, crit: 5, dodge: 5 }, ... },
  cultist:          { ..., baseStats: { hp: 10, attack: 3, defense: 1, speed: 3, mind: 3, crit: 5, dodge: 5 }, ... },
  bone_lich:        { ..., baseStats: { hp: 35, attack: 5, defense: 3, speed: 3, mind: 4, crit: 10, dodge: 5 }, ... },
```

- [ ] **Step 6: Re-run type-check**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: no errors. If errors remain, they are likely in tests that build `Stats` literals directly. Add the three new fields (`mind: 0, crit: 0, dodge: 0` is fine for test fixtures unless the test specifically needs other values).

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests PASS. The new stats default to 0 in fixtures so existing combat math is unchanged. The 5-seed determinism test stays green.

- [ ] **Step 8: Report ready for user commit.**

---

## Task 3: Add `scalingStat` to effect types; resolver honors it; tag mind-scaling abilities

**Files:**
- Modify: `src/data/types.ts` (AbilityEffect — find the discriminated union)
- Modify: `src/combat/effects.ts:19-51` (applyDamage), `src/combat/effects.ts:53-63` (applyHeal)
- Modify: `src/data/abilities.ts` — tag mend, smite, dark_pact, dark_bolt, necrotic_wave
- Test: `src/combat/__tests__/effects.test.ts` (extend)

- [ ] **Step 1: Find the `AbilityEffect` damage and heal variants**

Run: `grep -n "kind: 'damage'" src/data/types.ts` and `grep -n "kind: 'heal'" src/data/types.ts`. Read the surrounding lines to understand the discriminated union shape.

- [ ] **Step 2: Add `scalingStat` to both variants**

In `src/data/types.ts`, change the damage and heal variants of `AbilityEffect` from (something like):

```ts
  | { kind: 'damage'; power: number }
  | { kind: 'heal'; power: number }
```

to:

```ts
  | { kind: 'damage'; power: number; scalingStat?: 'attack' | 'mind' }
  | { kind: 'heal'; power: number; scalingStat?: 'attack' | 'mind' }
```

The field is optional. Resolver defaults to `'attack'` when absent.

- [ ] **Step 3: Write failing tests for scalingStat**

Append the following describe block to `src/combat/__tests__/effects.test.ts`:

```ts
describe('damage scaling stat', () => {
  it('defaults to attack when scalingStat is unset', () => {
    const p0 = makeHeroCombatant('priest', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 } });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = { id: 'test_phys', name: 'Test', canCastFrom: [1, 2], target: { side: 'enemy', slots: [1] }, effects: [{ kind: 'damage' as const, power: 1.0 }] };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied');
    // priest base attack is 3, mind is 5 — defaulting to attack gives round(1.0 * 3) = 3
    expect(dmg).toMatchObject({ amount: 3 });
  });

  it('uses mind when scalingStat is "mind"', () => {
    const p0 = makeHeroCombatant('priest', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 } });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    const ability = { id: 'test_mag', name: 'Test', canCastFrom: [1, 2], target: { side: 'enemy', slots: [1] }, effects: [{ kind: 'damage' as const, power: 1.0, scalingStat: 'mind' as const }] };
    applyAbility(ability, p0, ['e0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied');
    // priest mind is 5 — round(1.0 * 5) = 5
    expect(dmg).toMatchObject({ amount: 5 });
  });
});

describe('heal scaling stat', () => {
  it('uses mind when scalingStat is "mind"', () => {
    const p0 = makeHeroCombatant('priest', 1, 'p0', { currentHp: 1 });
    const state = makeTestState([p0], []);
    const events: CombatEvent[] = [];
    const ability = { id: 'test_heal', name: 'Test', canCastFrom: [1, 2], target: { side: 'self' }, effects: [{ kind: 'heal' as const, power: 1.2, scalingStat: 'mind' as const }] };
    applyAbility(ability, p0, ['p0'], state, rng, events);
    const h = events.find((e) => e.kind === 'heal_applied');
    // priest mind is 5 — round(1.2 * 5) = 6
    expect(h).toMatchObject({ amount: 6 });
  });
});
```

(If `applyAbility` is not already imported, add `import { applyAbility } from '../effects';` to the test file's imports.)

- [ ] **Step 4: Run tests to verify scaling tests fail**

Run: `npx vitest run src/combat/__tests__/effects.test.ts`
Expected: the new "uses mind" tests FAIL — `applyDamage` / `applyHeal` currently always use attack.

- [ ] **Step 5: Update `applyDamage` to honor `scalingStat`**

In `src/combat/effects.ts`, change `applyDamage` (lines 19-51). The relevant edit is the `raw` calculation. Replace:

```ts
  let raw = Math.round(effect.power * getEffectiveStat(caster, 'attack') * bonus);
```

with:

```ts
  const scalingStat = effect.scalingStat ?? 'attack';
  let raw = Math.round(effect.power * getEffectiveStat(caster, scalingStat) * bonus);
```

- [ ] **Step 6: Update `applyHeal` to honor `scalingStat`**

In `src/combat/effects.ts`, change `applyHeal` (lines 53-63). Replace:

```ts
  const amount = Math.round(effect.power * getEffectiveStat(caster, 'attack'));
```

with:

```ts
  const scalingStat = effect.scalingStat ?? 'attack';
  const amount = Math.round(effect.power * getEffectiveStat(caster, scalingStat));
```

- [ ] **Step 7: Tag the mind-scaling abilities in data**

In `src/data/abilities.ts`, edit the following entries to add `scalingStat: 'mind'` to their damage/heal effects. Per spec §9, these are: `mend`, `smite`, `dark_pact`, `dark_bolt`, `necrotic_wave`.

For example, `mend` becomes:

```ts
  mend: {
    id: 'mend',
    name: 'Mend',
    canCastFrom: [2, 3],
    target: { side: 'ally', filter: { kind: 'hurt' }, pick: 'lowestHp' },
    effects: [{ kind: 'heal', power: 1.2, scalingStat: 'mind' }],
    cooldown: 2,
  },
```

`smite`:

```ts
  smite: {
    id: 'smite',
    name: 'Smite',
    canCastFrom: [2, 3],
    target: { side: 'enemy', slots: [1] },
    effects: [{ kind: 'damage', power: 1.1, scalingStat: 'mind' }],
    tags: ['radiant'],
  },
```

For `dark_pact`, `dark_bolt`, `necrotic_wave`: read each entry, add `scalingStat: 'mind'` to its `damage` or `heal` effect literal. (Each ability's heal effect — if any — and damage effect — if any — get tagged. `dark_pact` has both a heal and a self-damage; tag both.)

`chilling_touch` is intentionally NOT tagged (kept attack-scaling per spec §10).

- [ ] **Step 8: Run effects tests**

Run: `npx vitest run src/combat/__tests__/effects.test.ts`
Expected: all tests PASS, including the new scaling tests.

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: all tests PASS. Tagged abilities (mend, smite, dark_pact, dark_bolt, necrotic_wave) now scale off Mind. The 5-seed determinism test stays green because the change is deterministic (no new RNG calls yet).

If a combat or run test asserts a specific damage/heal number for one of the tagged abilities and the number changes, update the expected value. Spec §10 lists the expected before/after numbers as a reference.

- [ ] **Step 10: Report ready for user commit.**

---

## Task 4: Crit roll + `wasCrit` event field

**Files:**
- Modify: `src/combat/types.ts` (damage_applied event)
- Modify: `src/combat/effects.ts:applyDamage`
- Modify: `src/combat/__tests__/effects.test.ts`

- [ ] **Step 1: Extend the `damage_applied` event variant**

In `src/combat/types.ts`, find the `damage_applied` line in the `CombatEvent` union (currently `src/combat/types.ts:65`). Change:

```ts
  | { kind: 'damage_applied'; sourceId: CombatantId; targetId: CombatantId; amount: number; lethal: boolean }
```

to:

```ts
  | { kind: 'damage_applied'; sourceId: CombatantId; targetId: CombatantId; amount: number; lethal: boolean; wasCrit: boolean }
```

`wasCrit` is required (always emitted). This will cascade into a TS error at the existing `events.push({ kind: 'damage_applied', ... })` call site in `effects.ts`.

- [ ] **Step 2: Pass `wasCrit: false` at the existing emit site to keep the build compiling**

In `src/combat/effects.ts:applyDamage`, change the existing `events.push` (currently lines 40-46):

```ts
  events.push({
    kind: 'damage_applied',
    sourceId: caster.id,
    targetId: target.id,
    amount: amplified,
    lethal,
  });
```

to:

```ts
  events.push({
    kind: 'damage_applied',
    sourceId: caster.id,
    targetId: target.id,
    amount: amplified,
    lethal,
    wasCrit: false,
  });
```

This is a holding state — the next steps replace `false` with the real crit-roll result.

- [ ] **Step 3: Run type-check + tests**

Run: `npm run build && npm test`
Expected: build clean, all tests PASS. The `wasCrit: false` placeholder doesn't change any existing assertions because no test currently checks for `wasCrit`.

- [ ] **Step 4: Write failing tests for crit**

Append the following to `src/combat/__tests__/effects.test.ts`:

```ts
describe('crit', () => {
  it('does not roll crit when caster crit is 0', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', { baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 } });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 } });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dmg).toMatchObject({ wasCrit: false });
  });

  it('always crits when caster crit is 100, doubling raw before defense', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', { baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 100, dodge: 0 } });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { baseStats: { hp: 100, attack: 0, defense: 3, speed: 0, mind: 0, crit: 0, dodge: 0 } });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied');
    // raw = round(1.0 * 4) = 4; crit doubles to 8; defense subtracts 3; final = 5.
    expect(dmg).toMatchObject({ wasCrit: true, amount: 5 });
  });

  it('crit doubles before defense (proves the difference)', () => {
    // With high defense, doubling-after-defense would give max(1, 4 - 3) * 2 = 2.
    // Doubling-before-defense gives max(1, 4*2 - 3) = 5.
    // The previous test already proves this. This test is a redundant guard
    // against a future regression where someone moves the *2 below the
    // defense subtract.
    const p0 = makeHeroCombatant('knight', 1, 'p0', { baseStats: { hp: 20, attack: 4, defense: 0, speed: 3, mind: 0, crit: 100, dodge: 0 } });
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { baseStats: { hp: 100, attack: 0, defense: 3, speed: 0, mind: 0, crit: 0, dodge: 0 } });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dmg?.amount).toBe(5);
    expect(dmg?.amount).not.toBe(2);
  });
});
```

(Add `import { ABILITIES } from '../../data/abilities';` to the test file imports if missing.)

- [ ] **Step 5: Run tests to verify the 100%-crit tests fail**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t crit`
Expected: the "always crits" and "doubles before defense" tests FAIL — current code never crits.

- [ ] **Step 6: Implement crit in `applyDamage`**

In `src/combat/effects.ts:applyDamage`, replace the entire damage-calculation block. Current code:

```ts
  const bonus = tagBonusMultiplier(ability, target);
  const scalingStat = effect.scalingStat ?? 'attack';
  let raw = Math.round(effect.power * getEffectiveStat(caster, scalingStat) * bonus);
  const mark = target.statuses['marked'];
  if (mark && mark.effect.kind === 'mark') {
    raw = Math.round(raw * (1 + mark.effect.damageBonus));
  }
  const final = Math.max(1, raw - getEffectiveStat(target, 'defense'));
```

Insert the crit roll between the mark adjustment and the defense subtraction. Final form:

```ts
  const bonus = tagBonusMultiplier(ability, target);
  const scalingStat = effect.scalingStat ?? 'attack';
  let raw = Math.round(effect.power * getEffectiveStat(caster, scalingStat) * bonus);
  const mark = target.statuses['marked'];
  if (mark && mark.effect.kind === 'mark') {
    raw = Math.round(raw * (1 + mark.effect.damageBonus));
  }
  const wasCrit = rng.percent(getEffectiveStat(caster, 'crit'));
  if (wasCrit) raw = raw * 2;
  const final = Math.max(1, raw - getEffectiveStat(target, 'defense'));
```

This requires `applyDamage` to accept `rng` as a parameter. Update its signature (currently `applyDamage(caster, target, effect, ability, state, events)`) to:

```ts
function applyDamage(
  caster: Combatant,
  target: Combatant,
  effect: Extract<AbilityEffect, { kind: 'damage' }>,
  ability: Ability,
  state: CombatState,
  rng: Rng,
  events: CombatEvent[],
): void {
```

Add `import type { Rng } from '../util/rng';` at the top of `effects.ts` if missing.

Update the `wasCrit: false` placeholder in the `events.push` to use the new variable:

```ts
  events.push({
    kind: 'damage_applied',
    sourceId: caster.id,
    targetId: target.id,
    amount: amplified,
    lethal,
    wasCrit,
  });
```

Update the call site in `applyEffect` (`src/combat/effects.ts:97-100`) to pass `rng` through. Since `applyEffect` doesn't currently take `rng` either, update its signature too — and update its single caller in `applyAbility` (`src/combat/effects.ts:128-149`) to pass the `_rng` parameter (rename `_rng` → `rng` since it's no longer unused).

- [ ] **Step 7: Run all crit tests**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t crit`
Expected: all three crit tests PASS.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all tests PASS. The 5-seed determinism test stays green because all existing combatants in the test fixtures have `crit: 0`, which short-circuits in `rng.percent(0)` without consuming RNG.

If any test fails because a different code path now produces a `wasCrit: true` damage event, that's actually a sign your test fixtures have non-zero crit — verify and either zero them out for the relevant test or update the expected damage to account for the doubled value.

- [ ] **Step 9: Report ready for user commit.**

---

## Task 5: Dodge roll + `attack_dodged` event

**Files:**
- Modify: `src/combat/types.ts` (CombatEvent union)
- Modify: `src/combat/effects.ts:applyAbility` (per-target dodge gate)
- Create: `src/combat/__tests__/dodge.test.ts`

- [ ] **Step 1: Add the `attack_dodged` event variant**

In `src/combat/types.ts`, add a new variant to the `CombatEvent` discriminated union. Place it adjacent to `damage_applied` for organisational clarity. The new variant:

```ts
  | { kind: 'attack_dodged'; sourceId: CombatantId; targetId: CombatantId; abilityId: AbilityId }
```

- [ ] **Step 2: Write failing dodge tests**

Create `src/combat/__tests__/dodge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../../data/abilities';
import { createRng } from '../../util/rng';
import { applyAbility } from '../effects';
import type { CombatEvent } from '../types';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

const rng = createRng(1);

describe('dodge', () => {
  it('does not roll dodge when target dodge is 0', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 } });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    const dodged = events.find((e) => e.kind === 'attack_dodged');
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dodged).toBeUndefined();
    expect(dmg).toBeDefined();
  });

  it('always dodges when target dodge is 100, emits attack_dodged, no damage', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 100 } });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.knight_slash, p0, ['e0'], state, rng, events);
    const dodged = events.find((e) => e.kind === 'attack_dodged');
    const dmg = events.find((e) => e.kind === 'damage_applied');
    expect(dodged).toMatchObject({ sourceId: 'p0', targetId: 'e0', abilityId: 'knight_slash' });
    expect(dmg).toBeUndefined();
  });

  it('dodge skips ALL effects on the target including riders (shield_bash damage + stun)', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 100 } });
    const state = makeTestState([p0], [e0]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.shield_bash, p0, ['e0'], state, rng, events);
    expect(events.find((e) => e.kind === 'attack_dodged')).toBeDefined();
    expect(events.find((e) => e.kind === 'damage_applied')).toBeUndefined();
    expect(events.find((e) => e.kind === 'status_applied' && e.statusId === 'stunned')).toBeUndefined();
    // Status was not stored on the target either.
    expect(e0.statuses['stunned']).toBeUndefined();
  });

  it('does not roll dodge for abilities with no damage effect (bulwark)', () => {
    const p0 = makeHeroCombatant('knight', 1, 'p0', { baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 100 } });
    const state = makeTestState([p0], []);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bulwark, p0, ['p0'], state, rng, events);
    expect(events.find((e) => e.kind === 'attack_dodged')).toBeUndefined();
    expect(events.find((e) => e.kind === 'status_applied' && e.statusId === 'bulwark')).toBeDefined();
  });

  it('dodge is per-target on AoE (volley): one target dodges, others get hit', () => {
    const p0 = makeHeroCombatant('archer', 2, 'p0');
    const e0 = makeEnemyCombatant('skeleton_warrior', 1, 'e0', { baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 } });
    const e1 = makeEnemyCombatant('skeleton_warrior', 2, 'e1', { baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 100 } });
    const e2 = makeEnemyCombatant('skeleton_warrior', 3, 'e2', { baseStats: { hp: 100, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 } });
    const state = makeTestState([p0], [e0, e1, e2]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.volley, p0, ['e0', 'e1', 'e2'], state, rng, events);
    const dodgedTargets = events.filter((e) => e.kind === 'attack_dodged').map((e) => (e as Extract<CombatEvent, { kind: 'attack_dodged' }>).targetId);
    const damagedTargets = events.filter((e) => e.kind === 'damage_applied').map((e) => (e as Extract<CombatEvent, { kind: 'damage_applied' }>).targetId);
    expect(dodgedTargets).toEqual(['e1']);
    expect(damagedTargets.sort()).toEqual(['e0', 'e2']);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/combat/__tests__/dodge.test.ts`
Expected: most tests FAIL — `applyAbility` does not yet roll dodge.

- [ ] **Step 4: Implement dodge in `applyAbility`**

In `src/combat/effects.ts:applyAbility` (currently lines 128-154), restructure the per-target loop. Current code:

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

  const sidesWithDeaths = new Set<Combatant['side']>();

  for (const effect of ability.effects) {
    for (const tid of targetIds) {
      const target = findById(state, tid);
      if (!target) continue;
      if (target.isDead) continue;
      const wasAlive = !target.isDead;
      applyEffect(ability, effect, caster, target, state, rng, events);
      if (wasAlive && target.isDead) sidesWithDeaths.add(target.side);
    }
  }

  for (const side of sidesWithDeaths) {
    collapseAfterDeath(side, state, events);
  }
}
```

(Note: `_rng` was renamed to `rng` in Task 4 step 6.)

The dodge gate has to invert the loop ordering — dodge is per-target, not per-effect, because a single dodge skips all effects for that target. Replace the body with:

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
      applyEffect(ability, effect, caster, target, state, rng, events);
    }
    if (wasAlive && target.isDead) sidesWithDeaths.add(target.side);
  }

  for (const side of sidesWithDeaths) {
    collapseAfterDeath(side, state, events);
  }
}
```

Add `import { getEffectiveStat } from './statuses';` at the top of `effects.ts` (it may already be imported for the existing damage code path — check).

Note: this restructure changes loop order from `effect-major, target-minor` to `target-major, effect-minor`. The observable event order also changes: previously, all damage events came before all stun events for a multi-target ability with riders. Now each target's events are grouped. This might affect snapshot-style tests; verify in step 5.

- [ ] **Step 5: Run dodge tests + full suite**

Run: `npx vitest run src/combat/__tests__/dodge.test.ts && npm test`
Expected: dodge tests PASS, full suite PASS. If a combat snapshot test fails because the event order changed (effect-major → target-major), verify the new order is correct and update the expected snapshot (this is a deliberate restructure).

The 5-seed determinism test stays green because all existing combatants have `dodge: 0` in their fixtures.

- [ ] **Step 6: Report ready for user commit.**

---

## Task 6: Bump save schema version

**Files:**
- Modify: `src/save/migration.ts:3`

- [ ] **Step 1: Bump the version constant**

In `src/save/migration.ts`, change:

```ts
export const CURRENT_SCHEMA_VERSION = 1;
```

to:

```ts
export const CURRENT_SCHEMA_VERSION = 2;
```

Do NOT register a migration fn for version 1. Per spec §7, old saves load as `null` and the boot scene falls back to a fresh save through the existing `resolveSaveState` flow.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: most tests PASS. The save tests that explicitly hardcode `version: 1` may fail. Verify by running `npx vitest run src/save/__tests__/save.test.ts` and update any test that constructs a `SaveFile` literal with `version: 1` to use `CURRENT_SCHEMA_VERSION` (or `version: 2`).

The "future version" test (the one in `src/save/__tests__/save.test.ts` that asserts `version: 999` is rejected) should be unaffected since `999 > 2`.

- [ ] **Step 3: Verify the migration path for old saves**

Read `src/save/migration.ts:migrate` again. The function walks `MIGRATIONS[version]` and returns null when no fn is registered. So an old v1 save now hits the loop, finds no `MIGRATIONS[1]`, returns null, and the loader treats it as "no save" — which boots into a fresh roster. This is the desired behavior.

If you want to be extra-defensive and confirm the path empirically, add a single quick test in `src/save/__tests__/migration.test.ts`:

```ts
it('returns null for v1 saves now that the current version is 2', () => {
  const v1 = { version: 1, roster: { heroes: [] }, vault: { gold: 0 }, unlocks: { classes: [], dungeons: [] } };
  expect(migrate(v1)).toBeNull();
});
```

Run: `npx vitest run src/save/__tests__/migration.test.ts`
Expected: PASS.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Report ready for user commit.**

---

## Task 7: Combat playback renders crit and dodge

**Files:**
- Modify: `src/scenes/combat_playback.ts` — handle `attack_dodged`; surface `wasCrit` in damage handler.

This task is on the Phaser side of the firewall; behavior is verified via manual smoke test, not unit tests.

- [ ] **Step 1: Add the `attack_dodged` case to the dispatch switch**

In `src/scenes/combat_playback.ts:dispatch` (around line 118-136), add a new case to the switch statement:

```ts
      case 'attack_dodged': return this.onAttackDodged(ev);
```

- [ ] **Step 2: Implement `onAttackDodged`**

Add a new method to the `CombatPlayback` class. Place it next to `onDamage` for organisational adjacency:

```ts
  private async onAttackDodged(ev: Extract<CombatEvent, { kind: 'attack_dodged' }>): Promise<number> {
    const target = this.actors.get(ev.targetId);
    const targetEntry = this.running.get(ev.targetId);
    const sourceEntry = this.running.get(ev.sourceId);
    const ability = ABILITIES[ev.abilityId];
    target?.spawnNumber('Miss!', '#aaccff');
    if (sourceEntry && targetEntry && ability) {
      this.appendLog(` — ${targetEntry.displayName} dodged`);
    }
    return 1;
  }
```

The colour `#aaccff` is light blue — distinct from damage red (`#ff5555`) and heal green (`#44ff44`). Adjust if it clashes.

- [ ] **Step 3: Surface `wasCrit` in `onDamage`**

In `src/scenes/combat_playback.ts:onDamage` (around line 242-247), append a `(crit)` suffix and spawn a crit floater. Replace:

```ts
  private async onDamage(ev: Extract<CombatEvent, { kind: 'damage_applied' }>): Promise<number> {
    await this.applyDamageVisual(ev);
    this.appendLog(` — ${ev.amount} dmg`);
    if (D_DAMAGE_BUFFER > 0) await this.delay(D_DAMAGE_BUFFER);
    return 1;
  }
```

with:

```ts
  private async onDamage(ev: Extract<CombatEvent, { kind: 'damage_applied' }>): Promise<number> {
    await this.applyDamageVisual(ev);
    if (ev.wasCrit) {
      const target = this.actors.get(ev.targetId);
      target?.spawnNumber('CRIT!', '#ffcc44');
      this.appendLog(` — ${ev.amount} dmg (crit)`);
    } else {
      this.appendLog(` — ${ev.amount} dmg`);
    }
    if (D_DAMAGE_BUFFER > 0) await this.delay(D_DAMAGE_BUFFER);
    return 1;
  }
```

Also handle the AoE damage path (`src/scenes/combat_playback.ts:218-221`), which currently sums damage values into a single log line:

```ts
      if (followingDamages.length > 0) {
        const dmgs = followingDamages.map(d => d.amount).join('/');
        this.appendLog(` — ${dmgs} dmg`);
      }
```

For the AoE case, mark crit hits in the joined string. Replace the lines above with:

```ts
      if (followingDamages.length > 0) {
        const dmgs = followingDamages.map(d => (d.wasCrit ? `${d.amount}*` : `${d.amount}`)).join('/');
        this.appendLog(` — ${dmgs} dmg`);
      }
```

The `*` after a number indicates a crit in the joined log entry. Per-target floaters still spawn via `applyDamageVisual` if you want each crit to also pop a "CRIT!" floater on its target — but that path is shared with the single-target `onDamage`, so the per-target spawn would need to live inside `applyDamageVisual` instead. To keep this task simple, only the single-target path spawns the "CRIT!" floater; AoE crits are surfaced only in the log. If smoke testing reveals this feels weak, follow up by moving the crit-floater spawn into `applyDamageVisual`.

- [ ] **Step 4: Type-check + tests**

Run: `npm run build && npm test`
Expected: build clean, all tests PASS. (No new unit tests; this layer is past the Phaser firewall.)

- [ ] **Step 5: Manual smoke test in the browser**

Run: `npm run dev` and open the dev URL.

Verify:
1. Start a fresh save (the schema bump in Task 6 wipes any existing save). Roster initializes correctly.
2. Enter combat. Most hits should not crit / be dodged at the default rates (5-15% / 5-10%); play through 2-3 fights to see at least one of each.
3. When a crit fires: gold "CRIT!" floater appears over the target; the action-log entry ends with `(crit)`.
4. When a dodge fires: light-blue "Miss!" floater appears over the defender; the action-log entry shows `<defender> dodged`.
5. Verify Priest's `mend` heals approximately 6 (was 4) — confirms mind-scaling is wired through to playback.
6. Verify `chilling_touch` (ghost) still hits for normal damage (not 1) — confirms it stayed attack-scaling per spec §10.

If the crit/dodge rates feel too low to ever fire in a manual test, temporarily bump knight crit to 100 in `src/data/classes.ts` for the test, verify, then revert.

- [ ] **Step 6: Report ready for user commit.**

---

## Self-review

- **Spec coverage**:
  - §1 stat shape → Task 2.
  - §2 per-effect scaling → Task 3.
  - §3 damage pipeline (crit + dodge order) → Tasks 4, 5.
  - §4 events → Tasks 4 (wasCrit), 5 (attack_dodged).
  - §5 RNG discipline → Task 1 (gating in `percent`), reused in Tasks 4, 5.
  - §6 combat playback → Task 7.
  - §7 save schema → Task 6.
  - §8 stat defaults → Task 2.
  - §9 ability tagging → Task 3.
  - §10 chilling_touch kept attack-scaling → covered by NOT tagging it in Task 3.
  - §11 tests — split across Tasks 1, 3, 4, 5.
  - §12 out of scope — explicitly nothing to do.
- **Placeholder scan**: no TBDs. Each step has concrete code. The one "if smoke test feels weak" follow-up note in Task 7 is a calibration hint, not a placeholder.
- **Type consistency**: `scalingStat`, `wasCrit`, `attack_dodged`, `getEffectiveStat`, `rng.percent` are used identically across Tasks 1-5. `applyDamage`'s signature change in Task 4 (adding `rng` parameter) cascades to `applyEffect` and the `applyAbility` call site, all called out in step 6 of Task 4.
