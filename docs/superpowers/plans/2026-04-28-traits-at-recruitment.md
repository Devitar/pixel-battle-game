# Traits at Recruitment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the per-hero trait pool from 6 to 12 entries, including a new conditional trait that activates below 50% HP. Keeps the existing `TraitDef` shape; widens two type unions to support a wider stat range and a new condition kind.

**Architecture:** Three additive tasks, each ending green. (1) Add Frail and Sluggish — pure data, no engine changes (Frail uses `hpEffect`, Sluggish uses `-1 speed` which is already allowed). Update the Stout-vs-others tavern test to also special-case Frail. (2) Widen `TraitStatEffect.stat` to allow `mind/crit/dodge`, then add Lucky / Slippery / Wise. Loosen the data-shape allow-list in `traits.test.ts` and add a Lucky integration test in `statuses.test.ts`. (3) Convert `TraitCondition` to a discriminated union with a new `belowHpRatio` variant, extend `evaluateTraitCondition`, then add Bloodthirsty. Cover the new condition kind in `traits.test.ts` and add active / inactive / boundary cases in `statuses.test.ts`.

**Tech Stack:** TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 4. All changes are inside the Phaser firewall — `data/`, `combat/`, and tests only. No scenes, no rendering, no save schema bump.

**Spec:** [`docs/superpowers/specs/2026-04-28-traits-at-recruitment-design.md`](../specs/2026-04-28-traits-at-recruitment-design.md)

**Project policy reminder:** Per [`CLAUDE.md`](../../../CLAUDE.md), never run `git commit` without explicit user direction. Each task ends with a "stage and report" step — the user runs the commit themselves.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/data/types.ts` | **Modify** | Extend `TraitId` union (Tasks 1, 2, 3); widen `TraitStatEffect.stat` (Task 2); convert `TraitCondition` to discriminated union with `belowHpRatio` (Task 3). |
| `src/data/traits.ts` | **Modify** | Add 6 new entries — Frail/Sluggish (Task 1), Lucky/Slippery/Wise (Task 2), Bloodthirsty (Task 3). |
| `src/combat/statuses.ts` | **Modify** | Extend `evaluateTraitCondition` to handle `belowHpRatio` (Task 3). |
| `src/data/__tests__/traits.test.ts` | **Modify** | Append IDs to `EXPECTED_IDS` per task; loosen stat allow-list (Task 2); add condition-shape coverage (Task 3). |
| `src/combat/__tests__/statuses.test.ts` | **Modify** | Add Lucky case (Task 2); add Bloodthirsty active / inactive / boundary cases (Task 3). |
| `src/camp/buildings/__tests__/tavern.test.ts` | **Modify** | Refactor the Stout-vs-others maxHp assertion to also special-case Frail (Task 1). |

No changes to `src/heroes/hero.ts`, `src/run/combat_setup.ts`, `src/camp/buildings/tavern.ts`, scenes, save schema, or migration. The existing roll loop (`rng.pick(Object.keys(TRAITS))`) automatically picks up new entries.

---

## Task 1: Add Frail and Sluggish

**Goal:** Add the two new traits that need no engine changes. Frail uses `hpEffect` (negative percent), Sluggish uses a negative speed delta that's already allowed by the existing `TraitStatEffect.stat` union.

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/traits.ts`
- Modify: `src/data/__tests__/traits.test.ts`
- Modify: `src/camp/buildings/__tests__/tavern.test.ts`

- [ ] **Step 1: Update `EXPECTED_IDS` in `traits.test.ts` to fail the registry tests**

In `src/data/__tests__/traits.test.ts`, update the `EXPECTED_IDS` constant (around lines 5-12):

```ts
const EXPECTED_IDS: readonly TraitId[] = [
  'stout',
  'quick',
  'sturdy',
  'sharp_eyed',
  'cowardly',
  'nervous',
  'frail',
  'sluggish',
];
```

- [ ] **Step 2: Run traits tests to confirm they fail at compile/runtime**

Run: `npx vitest run src/data/__tests__/traits.test.ts`

Expected: TypeScript / runtime failures referencing missing `TraitId` values `'frail'` / `'sluggish'` and missing `TRAITS` keys.

- [ ] **Step 3: Extend the `TraitId` union**

In `src/data/types.ts`, find the `TraitId` type (around line 244) and append the two new IDs:

```ts
export type TraitId =
  | 'stout'
  | 'quick'
  | 'sturdy'
  | 'sharp_eyed'
  | 'cowardly'
  | 'nervous'
  | 'frail'
  | 'sluggish';
```

- [ ] **Step 4: Add the two trait entries**

In `src/data/traits.ts`, append two entries to the `TRAITS` map. Insert before the closing `};`:

```ts
  frail: {
    id: 'frail',
    name: 'Frail',
    description: '-10% HP',
    hpEffect: { delta: -10, mode: 'percent' },
  },
  sluggish: {
    id: 'sluggish',
    name: 'Sluggish',
    description: '-1 Speed',
    statEffects: [{ stat: 'speed', delta: -1 }],
  },
```

- [ ] **Step 5: Re-run traits tests to confirm they pass**

Run: `npx vitest run src/data/__tests__/traits.test.ts`

Expected: PASS. The `describe.each(EXPECTED_IDS)` loop now exercises the shape checks for both new traits.

- [ ] **Step 6: Refactor the Stout-vs-others maxHp test for Frail**

The existing test in `src/camp/buildings/__tests__/tavern.test.ts` (lines 65-77) special-cases Stout but treats every other trait as "equal to class base." With Frail added, that's wrong — Frail heroes have `maxHp < classBase`. Replace the test:

```ts
  it('maxHp matches trait HP effect for stout / frail / others', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const list = generateCandidates(createRng(seed), TIER1_CLASSES);
      for (const h of list) {
        const classBase = CLASSES[h.classId].baseStats.hp;
        if (h.traitId === 'stout') {
          expect(h.maxHp, `seed ${seed} hero ${h.id}`).toBeGreaterThan(classBase);
        } else if (h.traitId === 'frail') {
          expect(h.maxHp, `seed ${seed} hero ${h.id}`).toBeLessThan(classBase);
        } else {
          expect(h.maxHp, `seed ${seed} hero ${h.id}`).toBe(classBase);
        }
      }
    }
  });
```

- [ ] **Step 7: Run the tavern tests to confirm they pass**

Run: `npx vitest run src/camp/buildings/__tests__/tavern.test.ts`

Expected: PASS. Across 50 seeds, the test now correctly validates Stout-up, Frail-down, and others-equal.

- [ ] **Step 8: Run the full test suite as a regression check**

Run: `npm test`

Expected: All tests pass. Type-check should be clean (`tsc` is part of `npm run build`, but Vitest runs the TS compiler in-process for module loading and will surface errors).

- [ ] **Step 9: Stage and report**

```bash
git add src/data/types.ts src/data/traits.ts src/data/__tests__/traits.test.ts src/camp/buildings/__tests__/tavern.test.ts
git status
```

Tell the user: **"Task 1 ready. Frail and Sluggish added; tavern maxHp test extended. Suggested commit message: `feat(traits): add Frail and Sluggish`. Awaiting your direction to commit."**

---

## Task 2: Widen `TraitStatEffect.stat`, add Lucky / Slippery / Wise

**Goal:** Allow trait stat-deltas on `mind`, `crit`, and `dodge` so the three "purely positive" new traits can land. Loosen the data-shape allow-list in `traits.test.ts`. Add an integration test that proves the wider stat range works end-to-end through `getEffectiveStat`.

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/traits.ts`
- Modify: `src/data/__tests__/traits.test.ts`
- Modify: `src/combat/__tests__/statuses.test.ts`

- [ ] **Step 1: Add the three IDs to `EXPECTED_IDS`**

In `src/data/__tests__/traits.test.ts`, update `EXPECTED_IDS`:

```ts
const EXPECTED_IDS: readonly TraitId[] = [
  'stout',
  'quick',
  'sturdy',
  'sharp_eyed',
  'cowardly',
  'nervous',
  'frail',
  'sluggish',
  'lucky',
  'slippery',
  'wise',
];
```

- [ ] **Step 2: Loosen the stat allow-list assertion**

In the same file, find the test `'every statEffect targets attack/defense/speed only'` (around lines 49-54) and replace it:

```ts
    it('every statEffect targets a non-HP buffable stat', () => {
      const stats = TRAITS[id].statEffects ?? [];
      for (const e of stats) {
        expect(['attack', 'defense', 'speed', 'mind', 'crit', 'dodge']).toContain(e.stat);
      }
    });
```

- [ ] **Step 3: Add the Lucky integration test in `statuses.test.ts`**

In `src/combat/__tests__/statuses.test.ts`, append a new case inside the existing `describe('getEffectiveStat — trait evaluation', ...)` block (around line 93). Place it just before the "Combatant with no traitId" test:

```ts
  it('Lucky combatant adds +5 to crit', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', { traitId: 'lucky' });
    expect(getEffectiveStat(c, 'crit')).toBe(c.baseStats.crit + 5);
  });
```

- [ ] **Step 4: Run the affected tests to confirm failures**

Run: `npx vitest run src/data/__tests__/traits.test.ts src/combat/__tests__/statuses.test.ts`

Expected: Failures referencing missing `TraitId` values `'lucky' | 'slippery' | 'wise'` and missing `TRAITS` keys.

- [ ] **Step 5: Widen `TraitStatEffect.stat` and extend `TraitId`**

In `src/data/types.ts`, find the `TraitStatEffect` interface (around lines 259-263) and widen the `stat` field:

```ts
export interface TraitStatEffect {
  stat: 'attack' | 'defense' | 'speed' | 'mind' | 'crit' | 'dodge';
  delta: number;
  condition?: TraitCondition;
}
```

In the same file, append the three new IDs to `TraitId`:

```ts
export type TraitId =
  | 'stout'
  | 'quick'
  | 'sturdy'
  | 'sharp_eyed'
  | 'cowardly'
  | 'nervous'
  | 'frail'
  | 'sluggish'
  | 'lucky'
  | 'slippery'
  | 'wise';
```

- [ ] **Step 6: Add the three trait entries**

In `src/data/traits.ts`, append three entries before the closing `};`:

```ts
  lucky: {
    id: 'lucky',
    name: 'Lucky',
    description: '+5% Crit',
    statEffects: [{ stat: 'crit', delta: 5 }],
  },
  slippery: {
    id: 'slippery',
    name: 'Slippery',
    description: '+5% Dodge',
    statEffects: [{ stat: 'dodge', delta: 5 }],
  },
  wise: {
    id: 'wise',
    name: 'Wise',
    description: '+1 Mind',
    statEffects: [{ stat: 'mind', delta: 1 }],
  },
```

- [ ] **Step 7: Re-run the affected tests to confirm they pass**

Run: `npx vitest run src/data/__tests__/traits.test.ts src/combat/__tests__/statuses.test.ts`

Expected: PASS. Knight's `baseStats.crit` is 5, so the Lucky test asserts `getEffectiveStat(c, 'crit') === 10`.

- [ ] **Step 8: Run the full test suite as a regression check**

Run: `npm test`

Expected: All tests pass. Stat lookups for `mind` / `crit` / `dodge` previously returned `baseStats[stat]` unchanged; now traits can additively modify them, but no existing trait does — only the 3 new entries.

- [ ] **Step 9: Stage and report**

```bash
git add src/data/types.ts src/data/traits.ts src/data/__tests__/traits.test.ts src/combat/__tests__/statuses.test.ts
git status
```

Tell the user: **"Task 2 ready. Lucky / Slippery / Wise added; `TraitStatEffect.stat` widened to cover all non-HP stats. Suggested commit message: `feat(traits): add Lucky, Slippery, Wise`. Awaiting your direction to commit."**

---

## Task 3: Add `belowHpRatio` condition kind and Bloodthirsty trait

**Goal:** Extend the trait condition vocabulary with a parameterized "below HP ratio" variant, then add the Bloodthirsty trait that uses it. Cover the new condition kind in `traits.test.ts` and add active / inactive / boundary cases in `statuses.test.ts`.

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/traits.ts`
- Modify: `src/combat/statuses.ts`
- Modify: `src/data/__tests__/traits.test.ts`
- Modify: `src/combat/__tests__/statuses.test.ts`

- [ ] **Step 1: Add `'bloodthirsty'` to `EXPECTED_IDS`**

In `src/data/__tests__/traits.test.ts`, update `EXPECTED_IDS`:

```ts
const EXPECTED_IDS: readonly TraitId[] = [
  'stout',
  'quick',
  'sturdy',
  'sharp_eyed',
  'cowardly',
  'nervous',
  'frail',
  'sluggish',
  'lucky',
  'slippery',
  'wise',
  'bloodthirsty',
];
```

- [ ] **Step 2: Add the condition-shape coverage test**

In the same file, inside the `describe.each(EXPECTED_IDS)('trait %s', (id) => { ... })` block, append a new test after the existing per-trait checks:

```ts
    it('every statEffect condition has a recognized kind', () => {
      const stats = TRAITS[id].statEffects ?? [];
      for (const e of stats) {
        if (e.condition) {
          expect(['inSlot', 'belowHpRatio']).toContain(e.condition.kind);
        }
      }
    });
```

- [ ] **Step 3: Add the three Bloodthirsty integration tests**

In `src/combat/__tests__/statuses.test.ts`, append three cases inside `describe('getEffectiveStat — trait evaluation', ...)`. Place them just after the Lucky test from Task 2:

```ts
  it('Bloodthirsty active: +2 attack when below 50% HP', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', {
      traitId: 'bloodthirsty',
      maxHp: 20,
      currentHp: 9,
    });
    expect(getEffectiveStat(c, 'attack')).toBe(c.baseStats.attack + 2);
  });

  it('Bloodthirsty inactive: no bonus at full HP', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', {
      traitId: 'bloodthirsty',
      maxHp: 20,
      currentHp: 20,
    });
    expect(getEffectiveStat(c, 'attack')).toBe(c.baseStats.attack);
  });

  it('Bloodthirsty boundary: no bonus at exactly 50% HP', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', {
      traitId: 'bloodthirsty',
      maxHp: 20,
      currentHp: 10,
    });
    expect(getEffectiveStat(c, 'attack')).toBe(c.baseStats.attack);
  });
```

- [ ] **Step 4: Run the affected tests to confirm failures**

Run: `npx vitest run src/data/__tests__/traits.test.ts src/combat/__tests__/statuses.test.ts`

Expected: Compile/runtime failures referencing missing `TraitId` value `'bloodthirsty'` and missing `TRAITS` key.

- [ ] **Step 5: Convert `TraitCondition` to a discriminated union and extend `TraitId`**

In `src/data/types.ts`, find `TraitCondition` (around line 252) and replace the single-variant declaration with a discriminated union:

```ts
export type TraitCondition =
  | { kind: 'inSlot'; slot: SlotIndex }
  | { kind: 'belowHpRatio'; ratio: number };
```

In the same file, append `'bloodthirsty'` to `TraitId`:

```ts
export type TraitId =
  | 'stout'
  | 'quick'
  | 'sturdy'
  | 'sharp_eyed'
  | 'cowardly'
  | 'nervous'
  | 'frail'
  | 'sluggish'
  | 'lucky'
  | 'slippery'
  | 'wise'
  | 'bloodthirsty';
```

- [ ] **Step 6: Extend `evaluateTraitCondition`**

In `src/combat/statuses.ts`, find the `evaluateTraitCondition` function (around lines 5-14) and extend the switch:

```ts
function evaluateTraitCondition(
  condition: TraitCondition | undefined,
  combatant: Combatant,
): boolean {
  if (!condition) return true;
  switch (condition.kind) {
    case 'inSlot':
      return combatant.slot === condition.slot;
    case 'belowHpRatio':
      return combatant.maxHp > 0 && combatant.currentHp / combatant.maxHp < condition.ratio;
  }
}
```

The `maxHp > 0` guard is defensive; combatants always have positive `maxHp` in normal play, but the check guarantees no divide-by-zero on a malformed Combatant.

- [ ] **Step 7: Add the Bloodthirsty trait entry**

In `src/data/traits.ts`, append before the closing `};`:

```ts
  bloodthirsty: {
    id: 'bloodthirsty',
    name: 'Bloodthirsty',
    description: '+2 Attack when below 50% HP',
    statEffects: [{ stat: 'attack', delta: 2, condition: { kind: 'belowHpRatio', ratio: 0.5 } }],
  },
```

- [ ] **Step 8: Re-run the affected tests to confirm they pass**

Run: `npx vitest run src/data/__tests__/traits.test.ts src/combat/__tests__/statuses.test.ts`

Expected: PASS. The boundary test with `maxHp: 20, currentHp: 10` gives `currentHp / maxHp === 0.5`, so the strict `<` returns false — no bonus.

- [ ] **Step 9: Run the full test suite as a regression check**

Run: `npm test`

Expected: All tests pass. The discriminated-union change to `TraitCondition` is type-compatible with the existing `cowardly` / `nervous` entries (their `condition: { kind: 'inSlot', slot: 1 }` still matches the union's first variant).

- [ ] **Step 10: Stage and report**

```bash
git add src/data/types.ts src/data/traits.ts src/combat/statuses.ts src/data/__tests__/traits.test.ts src/combat/__tests__/statuses.test.ts
git status
```

Tell the user: **"Task 3 ready. Bloodthirsty added; `belowHpRatio` condition kind wired into `evaluateTraitCondition`. All 12 traits now in place. Suggested commit message: `feat(traits): add Bloodthirsty with below-HP condition kind`. Awaiting your direction to commit."**

---

## Post-implementation: TODO and HISTORY

After Task 3 is committed, the user typically migrates the TODO entry into HISTORY. Don't do this unprompted — wait for direction. The TODO entry to migrate is the Cluster A · 6 entry in [`TODO.md`](../../../TODO.md). Per the [slim HISTORY entry policy](../../../CLAUDE.md), keep the new HISTORY entry to ~15-25 lines: Why / Decisions / Surprises / Source. Don't list shipped files (git diff has those).

Suggested HISTORY-entry sketch (write it on the day work completes, newest-on-top):

```markdown
### YYYY-MM-DD · Traits at recruitment (Cluster A · 6)

**Why:** Trait pool was 6 entries — small enough that two Tavern visits could feel identical. Doubled to 12 to make rolls produce visibly distinct heroes, and to land the foundation for future conditional traits without expanding the engine again.

**Decisions:**
- Picked Mix C (mixed positive / negative + one new condition kind) over all-upside or "no new conditions" alternatives. The `belowHpRatio` condition is parameterized (`ratio: number`) so future berserker-style traits ("+X when below 25% HP") drop in without engine changes.
- Bloodthirsty tuned to +2 (not +1). Conditional gating costs roughly half the uptime, so +2 ≈ unconditional +1 in expected value but with much higher variance and "comeback" feel.
- Frail uses `hpEffect` (mode: percent, delta: -10), not statEffects. Mirrors Stout exactly. No engine change required for negative HP traits.

**Surprises:**
- Tavern's existing maxHp test (lines 65-77) had to grow a third branch: stout-up, frail-down, others-equal. Easy to miss because it ran across 50 seeds with high false-pass rate before Frail existed.
- `TraitStatEffect.stat` widening was zero-risk: nothing else in the codebase narrows or branches on it. Once widened, mind/crit/dodge traits worked through `getEffectiveStat` with no other code change.

**Source:** TODO.md Cluster A · 6 → spec at `docs/superpowers/specs/2026-04-28-traits-at-recruitment-design.md`.
```

---

## Self-review notes

Reviewed the plan against the spec:

- **Spec coverage:** Every change in the spec's "Module layout" table maps to a step in this plan. The 6 trait entries map to Tasks 1 (Frail, Sluggish), 2 (Lucky, Slippery, Wise), and 3 (Bloodthirsty). The two type widenings (`TraitStatEffect.stat`, `TraitCondition`) and the `evaluateTraitCondition` extension are explicit steps. The four spec-mandated tests in `statuses.test.ts` (Lucky, Bloodthirsty active/inactive/boundary) are explicit steps. The tavern maxHp test refactor for Frail is an explicit step. The condition-shape test in `traits.test.ts` is an explicit step.
- **Type consistency:** `TraitId` is extended additively in three tasks; each task's union literal lists every prior ID. `TraitStatEffect.stat`, `TraitCondition`, and `evaluateTraitCondition` are quoted verbatim with the exact field names used elsewhere (`stat`, `delta`, `kind`, `ratio`).
- **No placeholders:** Every step has actual code or an exact command. The HISTORY-entry sketch uses `YYYY-MM-DD` because the completion date isn't known yet — this is a documentation suggestion, not an implementation step.
- **Boundary test math:** `currentHp: 10 / maxHp: 20 === 0.5` exactly, so the strict `<` returns false. No `Math.floor` ambiguity.
