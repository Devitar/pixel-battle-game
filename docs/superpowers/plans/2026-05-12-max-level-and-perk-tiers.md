# MAX_LEVEL bump (5→10) + L10 perk tier — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise `MAX_LEVEL` from 5 to 10, extend the XP curve, add a second perk tier at L10 (16 new perks across 8 classes), and introduce a constrained triggered-effect system (5 triggers × 5 actions) to the combat resolver.

**Architecture:** Hero gains plural `pendingPerks` and `pickedPerks` arrays (migrated from singular `pendingPerk: boolean` + `perkId?: PerkId`). `PerkDef` extends with required `tier: 'l5' | 'l10'` and optional `triggeredEffect`. A new `src/combat/perk_hooks.ts` module owns trigger evaluation and action application. Five fire-sites in the existing combat resolver (mostly in `effects.ts:applyDamage` and `combat.ts:executeTurn`) call into the hook module.

**Tech Stack:** TypeScript, Vitest, no new dependencies. Existing `regen` and `mark` statuses (in `src/combat/effects.ts` and the AbilityEffect union) are reused.

**Spec:** `docs/superpowers/specs/2026-05-12-max-level-and-perk-tiers-design.md`

---

## File structure

**New files:**
- `src/combat/perk_hooks.ts` — trigger fire functions + action application helpers
- `src/combat/__tests__/perk_hooks.test.ts` — unit tests for action helpers
- `src/combat/__tests__/perks_integration.test.ts` — integration tests for the 16 L10 perks (one describe block per trigger)

**Modified files (high-level — full list per-task below):**
- `src/data/types.ts` — new types (PerkTier, TriggeredEffect, PerkTrigger, PerkAction); PerkDef extension; Hero + Combatant field renames
- `src/data/perks.ts` — `tier: 'l5'` on existing perks; `CLASS_PERK_PAIRS` → `CLASS_PERK_TIERS`; 16 new L10 perk defs
- `src/data/leveling.ts` — `MAX_LEVEL=10`; `LEVEL_THRESHOLDS` extended; `applyLevelUps` push tiers to `pendingPerks`
- `src/heroes/hero.ts` — Hero shape rename + helper updates
- `src/combat/types.ts` — Combatant shape rename + new `firstActionFiredIds` tracker
- `src/combat/statuses.ts` — `getEffectiveStat` iterates `pickedPerks`
- `src/combat/combatant.ts` — wire pickedPerks into createHeroCombatant
- `src/run/combat_setup.ts` — pass pickedPerks from Hero into combatant builder
- `src/combat/effects.ts` — three fire-sites in `applyDamage` (onCrit, onStruck, onKill)
- `src/combat/combat.ts` — firstAttack fire-site, whenBelowHp recompute hooks
- `src/save/migration.ts` — new MIGRATIONS[5] step, bump CURRENT_SCHEMA_VERSION to 6
- `src/save/__tests__/migration.test.ts` — v5→v6 migration tests
- `src/scenes/perk_overlay_scene.ts` — handle FIFO of multiple pending tiers
- Various test files for shape rename ripple

**Out of scope (sister specs, will land later):** Epic/Legendary tiers, L10 milestone gate, named boss legendaries, random legendary passives.

---

## Task 1: Type system + PERKS `tier: 'l5'` migration

**Files:**
- Modify: `src/data/types.ts:330-360` (PerkId + PerkDef)
- Modify: `src/data/perks.ts` (all 16 PerkDefs + CLASS_PERK_PAIRS export)
- Modify: `src/data/__tests__/perks.test.ts`
- Modify: any file importing `CLASS_PERK_PAIRS` (find via grep)

- [ ] **Step 1: Write the failing test (perks shape)**

Update `src/data/__tests__/perks.test.ts`. Replace the existing `'has at least one effect (statEffects, hpEffect, or petAttackBonus)'` test with a tier-aware version, and add tests for `CLASS_PERK_TIERS`:

```ts
// At top of file, alongside existing imports
import { CLASS_PERK_TIERS, PERKS } from '../perks';

// Replace the `describe('CLASS_PERK_PAIRS', ...)` block:
describe('CLASS_PERK_TIERS', () => {
  const expectedClasses: ClassId[] =
    ['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage', 'paladin', 'hunter'];

  it('has exactly 8 entries (one per ClassId)', () => {
    expect(Object.keys(CLASS_PERK_TIERS).sort()).toEqual([...expectedClasses].sort());
  });

  describe.each(expectedClasses)('class %s', (classId) => {
    it('has an l5 pair (length 2)', () => {
      expect(CLASS_PERK_TIERS[classId].l5).toHaveLength(2);
    });
    it('has an l10 array (length 0 for now)', () => {
      expect(CLASS_PERK_TIERS[classId].l10).toEqual([]);
    });
    it('all l5 perk ids reference real perks with classId match', () => {
      for (const perkId of CLASS_PERK_TIERS[classId].l5) {
        expect(PERKS[perkId]).toBeDefined();
        expect(PERKS[perkId].classId).toBe(classId);
        expect(PERKS[perkId].tier).toBe('l5');
      }
    });
  });
});

// Inside `describe.each(EXPECTED_IDS)`:
it('has tier field set to l5', () => {
  expect(PERKS[id].tier).toBe('l5');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/__tests__/perks.test.ts`
Expected: FAIL — `CLASS_PERK_TIERS` is undefined; `PERKS[id].tier` is undefined.

- [ ] **Step 3: Add new types in `src/data/types.ts`**

Locate the `PerkDef` interface around line 342. Add new types and extend PerkDef:

```ts
export type PerkTier = 'l5' | 'l10';

export type StatusId =
  // ... existing values ...
  ;

// New: triggered-effect system for L10 perks (and reusable for future content)
export type PerkTrigger =
  | { kind: 'onCrit' }
  | { kind: 'onKill' }
  | { kind: 'onStruck'; whenAtFullHp?: boolean }
  | { kind: 'firstAttack' }
  | { kind: 'whenBelowHp'; ratio: number };

export type PerkAction =
  | { kind: 'gainStat'; stat: BuffableStat; delta: number; duration?: number; stacking?: boolean }
  | { kind: 'damageMod'; multiplier: number }
  | { kind: 'damageMitigation'; multiplier: number }
  | { kind: 'lifesteal'; ratio: number }
  | { kind: 'applyStatus'; statusId: StatusId; duration: number; target: 'self' | 'other' };

export interface TriggeredEffect {
  trigger: PerkTrigger;
  action: PerkAction;
}

export interface PerkDef {
  id: PerkId;
  name: string;
  description: string;
  classId: ClassId;
  tier: PerkTier;                          // NEW: required
  statEffects?: readonly TraitStatEffect[];
  hpEffect?: TraitHpEffect;
  petAttackBonus?: number;
  triggeredEffect?: TriggeredEffect;       // NEW: optional, L10-style
}
```

- [ ] **Step 4: Update `src/data/perks.ts`**

Add `tier: 'l5'` to all 16 existing PerkDef literals. Rename the `CLASS_PERK_PAIRS` export to `CLASS_PERK_TIERS` with the new nested shape:

```ts
// Example for one perk:
iron_will: {
  id: 'iron_will',
  name: 'Iron Will',
  description: '+1 Defense',
  classId: 'knight',
  tier: 'l5',                              // NEW
  statEffects: [{ stat: 'defense', delta: 1 }],
},
// ... repeat for all 16 ...

// Replace CLASS_PERK_PAIRS with:
export const CLASS_PERK_TIERS: Record<ClassId, { readonly l5: readonly PerkId[]; readonly l10: readonly PerkId[] }> = {
  knight:    { l5: ['iron_will', 'resolute'],       l10: [] },
  archer:    { l5: ['precise', 'eagle_eye'],         l10: [] },
  priest:    { l5: ['devout', 'steadfast'],          l10: [] },
  barbarian: { l5: ['berserker', 'tough_skin'],      l10: [] },
  rogue:     { l5: ['lethal', 'evasive'],            l10: [] },
  mage:      { l5: ['arcane_power', 'quick_cast'],   l10: [] },
  paladin:   { l5: ['righteous', 'vindicator'],      l10: [] },
  hunter:    { l5: ['beastmaster', 'sharpshooter'],  l10: [] },
};
```

- [ ] **Step 5: Find and fix all `CLASS_PERK_PAIRS` callers**

Run: `npx vitest run src/data/__tests__/perks.test.ts` — type errors will surface.

Then grep: search the repo for `CLASS_PERK_PAIRS`. Likely callers:
- `src/scenes/perk_overlay_scene.ts` (uses it to look up choices for a class)

For each caller, replace `CLASS_PERK_PAIRS[classId]` with `CLASS_PERK_TIERS[classId].l5` (since `pendingPerk` only ever meant L5 before this plan completes). Don't introduce tier-awareness here yet — that's Task 19's job.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/data/__tests__/perks.test.ts && npx tsc --noEmit`
Expected: tests PASS; TypeScript clean.

- [ ] **Step 7: Run the full test suite to catch ripple**

Run: `npm test`
Expected: PASS. If any other test imports `CLASS_PERK_PAIRS`, fix the same way.

- [ ] **Step 8: Commit**

```bash
git add src/data/types.ts src/data/perks.ts src/data/__tests__/perks.test.ts src/scenes/perk_overlay_scene.ts
git commit -m "$(cat <<'EOF'
PerkDef.tier + CLASS_PERK_TIERS rename

Add PerkTier ('l5' | 'l10'), TriggeredEffect, PerkTrigger, PerkAction
types. PerkDef gains required tier and optional triggeredEffect fields.
All 16 existing perks get tier:'l5'. CLASS_PERK_PAIRS renames to
CLASS_PERK_TIERS with l5/l10 nested record (l10 empty for now).

Foundation for the L10 perk tier — Cluster D · 7.
EOF
)"
```

---

## Task 2: Hero schema migration (in-memory shape)

**Files:**
- Modify: `src/heroes/hero.ts` (Hero interface + createHero + applyPerk + recomputeMaxHp)
- Modify: `src/heroes/__tests__/hero.test.ts`
- Find and update all callers reading `hero.pendingPerk` or `hero.perkId`

- [ ] **Step 1: Find all current callers**

Run grep for these to map the blast radius before editing:
- `hero.pendingPerk`
- `hero.perkId`
- `pendingPerk:` (assignments)
- `perkId:` (assignments in hero contexts — not Combatant)

Expected callers: `src/scenes/perk_overlay_scene.ts`, `src/camp/buildings/tavern.ts`, `src/run/run_state.ts` (level-up path), tests across the repo.

- [ ] **Step 2: Write the failing test**

Edit `src/heroes/__tests__/hero.test.ts`. Replace existing pendingPerk / perkId assertions with the new array-shape assertions:

```ts
import { createHero, applyPerk } from '../hero';

describe('Hero schema (post-perk-tier rename)', () => {
  it('createHero initializes pendingPerks=[] and pickedPerks=[]', () => {
    const hero = createHero('knight', 'Bran', 'h1', 'stoic', 'body_warrior');
    expect(hero.pendingPerks).toEqual([]);
    expect(hero.pickedPerks).toEqual([]);
    // @ts-expect-error — old fields removed
    expect(hero.pendingPerk).toBeUndefined();
    // @ts-expect-error — old fields removed
    expect(hero.perkId).toBeUndefined();
  });

  it('applyPerk appends to pickedPerks and shifts oldest pendingPerks', () => {
    const hero = createHero('knight', 'Bran', 'h1', 'stoic', 'body_warrior');
    const withPending = { ...hero, pendingPerks: ['l5'] as const };
    const picked = applyPerk(withPending, 'iron_will');
    expect(picked.pickedPerks).toEqual(['iron_will']);
    expect(picked.pendingPerks).toEqual([]);
  });

  it('applyPerk keeps remaining pending tiers when picking from a multi-pending hero', () => {
    const hero = createHero('knight', 'Bran', 'h1', 'stoic', 'body_warrior');
    const withTwo = { ...hero, pendingPerks: ['l5', 'l10'] as const };
    const picked = applyPerk(withTwo, 'iron_will');
    expect(picked.pickedPerks).toEqual(['iron_will']);
    expect(picked.pendingPerks).toEqual(['l10']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/heroes/__tests__/hero.test.ts`
Expected: FAIL — `pendingPerks` is undefined on Hero, `applyPerk` signature mismatch.

- [ ] **Step 4: Update Hero interface and helpers**

Edit `src/heroes/hero.ts`. Replace lines 27-28:

```ts
// Before:
//   pendingPerk: boolean;
//   perkId?: PerkId;
// After:
  pendingPerks: readonly PerkTier[];
  pickedPerks: readonly PerkId[];
```

Add `PerkTier` to the imports from `@data/types`.

Update `createHero` (around line 45-62) — replace `pendingPerk: false` initializer with:

```ts
    pendingPerks: [],
    pickedPerks: [],
```

(Remove the conditional `perkId` field — there isn't one in createHero today, but verify.)

Update `applyPerk` (lines 91-101) to:

```ts
export function applyPerk(hero: Hero, perkId: PerkId): Hero {
  const perk = PERKS[perkId];
  const nextPending = hero.pendingPerks.length > 0 ? hero.pendingPerks.slice(1) : [];
  const nextPicked = [...hero.pickedPerks, perkId];
  const updated: Hero = { ...hero, pendingPerks: nextPending, pickedPerks: nextPicked };
  if (perk.hpEffect) {
    const newMaxHp = applyHpEffect(hero.maxHp, perk.hpEffect);
    const ratio = hero.maxHp > 0 ? newMaxHp / hero.maxHp : 1;
    updated.maxHp = newMaxHp;
    updated.currentHp = Math.max(1, Math.round(hero.currentHp * ratio));
  }
  return updated;
}
```

Update `recomputeMaxHp` (lines 79-89). Replace `hero.perkId ? PERKS[hero.perkId] : undefined` and the single-perk computeMaxHp call: now sum hpEffect from all picked perks. Also need to update `computeMaxHp`'s signature to accept perks array.

Edit `computeMaxHp` (lines 65-77):

```ts
export function computeMaxHp(
  classBaseHp: number,
  traits: readonly TraitDef[],
  equipment: HeroEquipment,
  perks: readonly PerkDef[] = [],
): number {
  let base = classBaseHp;
  for (const trait of traits) {
    if (trait.hpEffect) base = applyHpEffect(base, trait.hpEffect);
  }
  for (const perk of perks) {
    if (perk.hpEffect) base = applyHpEffect(base, perk.hpEffect);
  }
  return base + gearTotal(equipment);
}

export function recomputeMaxHp(hero: Hero): Hero {
  const classDef = CLASSES[hero.classId];
  const traits = hero.traitIds.map((id) => TRAITS[id]);
  const perks = hero.pickedPerks.map((id) => PERKS[id]);
  const newMaxHp = computeMaxHp(classDef.baseStats.hp, traits, hero.equipment, perks);
  return {
    ...hero,
    maxHp: newMaxHp,
    currentHp: Math.min(hero.currentHp, newMaxHp),
  };
}
```

- [ ] **Step 5: Fix Hero-shape ripple**

Run `npx tsc --noEmit`. Expected: errors at every site that reads `hero.pendingPerk` or `hero.perkId`. Fix each:

| Old read | New read |
|---|---|
| `hero.pendingPerk` | `hero.pendingPerks.length > 0` |
| `hero.pendingPerk = true` | `hero.pendingPerks = [...hero.pendingPerks, 'l5']` (or contextually `'l10'`) |
| `hero.perkId` (read) | `hero.pickedPerks` (iterate or look up specific tier) |
| `hero.perkId = X` (write — only `applyPerk` does this; now uses pickedPerks append) | Use `applyPerk`. |

Likely call sites:
- `src/scenes/perk_overlay_scene.ts` — checks if a perk is pending; offers picks. Update the "is pending" check to `hero.pendingPerks.length > 0`. When the panel opens, present perks from `CLASS_PERK_TIERS[classId][hero.pendingPerks[0]]` (oldest tier).
- `src/camp/buildings/tavern.ts` — Tavern candidates get pendingPerk:false on hire; rename. Pre-leveled candidates may need pendingPerks correctly initialized.
- `src/run/run_state.ts` — level-up path sets pendingPerk; Task 5 will rewrite this. For now, change `pendingPerk: hero.pendingPerk || newLevel >= MAX_LEVEL` to `pendingPerks: newLevel >= MAX_LEVEL && !hero.pendingPerks.includes('l5') ? [...hero.pendingPerks, 'l5'] : hero.pendingPerks` — temporary form that Task 5 supersedes.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/heroes/__tests__/hero.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Run full suite**

Run: `npm test`
Expected: PASS. Tests that previously read `hero.pendingPerk` / `hero.perkId` may fail with the new shape — fix each in this commit.

- [ ] **Step 8: Commit**

```bash
git add src/heroes/hero.ts src/heroes/__tests__/hero.test.ts src/scenes/perk_overlay_scene.ts src/camp/buildings/tavern.ts src/run/run_state.ts
git commit -m "Hero.pendingPerk/perkId → pendingPerks/pickedPerks arrays"
```

(Stage any other ripple-fix files surfaced by `npm test`.)

---

## Task 3: Combatant schema migration + getEffectiveStat update

**Files:**
- Modify: `src/combat/types.ts:55` (Combatant.perkId field)
- Modify: `src/combat/statuses.ts:33-40` (getEffectiveStat perk iteration)
- Modify: `src/combat/combatant.ts` (createHeroCombatant)
- Modify: `src/run/combat_setup.ts` (pass pickedPerks into combatant)
- Modify: `src/combat/__tests__/statuses.test.ts`

- [ ] **Step 1: Write the failing test**

Edit `src/combat/__tests__/statuses.test.ts` (or add a new test if it doesn't exist for multi-perk stat-effect summing):

```ts
import { describe, expect, it } from 'vitest';
import { getEffectiveStat } from '../statuses';
import type { Combatant } from '../types';

describe('getEffectiveStat with multiple pickedPerks', () => {
  it('sums statEffects across all picked perks', () => {
    const c = makeHeroCombatant({ pickedPerks: ['iron_will', 'eagle_eye'] });
    // iron_will: +1 defense; eagle_eye: +1 attack
    expect(getEffectiveStat(c, 'defense')).toBe(c.baseStats.defense + 1);
    expect(getEffectiveStat(c, 'attack')).toBe(c.baseStats.attack + 1);
  });

  it('returns base value when pickedPerks is empty', () => {
    const c = makeHeroCombatant({ pickedPerks: [] });
    expect(getEffectiveStat(c, 'defense')).toBe(c.baseStats.defense);
  });
});

// Helper at bottom of file or shared test helpers
function makeHeroCombatant(overrides: Partial<Combatant>): Combatant {
  return {
    id: 'p0', side: 'player', slot: 1, kind: 'hero',
    classId: 'knight',
    baseStats: { hp: 30, attack: 5, defense: 2, speed: 5, mind: 1, crit: 5, dodge: 5 },
    currentHp: 30, maxHp: 30,
    statuses: {}, cooldowns: {},
    abilities: [], aiPriority: [],
    pickedPerks: [],
    isDead: false,
    ...overrides,
  } as Combatant;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/combat/__tests__/statuses.test.ts`
Expected: FAIL — `Combatant.pickedPerks` is not a known field.

- [ ] **Step 3: Update Combatant interface**

Edit `src/combat/types.ts`. Replace line 55 (`perkId?: PerkId;`) with:

```ts
  pickedPerks: readonly PerkId[];
```

(Note: not optional. Empty array is the default.)

Inside the same `Combatant` interface, also add a new field that Task 10 will use, but ship it now to keep the type stable:

```ts
  /** Per-combat tracker for firstAttack-triggered perks. Cleared at combat start.
   *  Holds perk ids that have already fired their firstAttack trigger this combat. */
  firstAttackFiredPerkIds?: readonly PerkId[];
```

- [ ] **Step 4: Update getEffectiveStat**

Edit `src/combat/statuses.ts:33-40`. Replace the single-perk block:

```ts
// Before:
//   if (stat !== 'hp' && combatant.perkId) {
//     const perk = PERKS[combatant.perkId];
//     for (const effect of perk.statEffects ?? []) { ... }
//   }
// After:
  if (stat !== 'hp' && combatant.pickedPerks.length > 0) {
    for (const perkId of combatant.pickedPerks) {
      const perk = PERKS[perkId];
      for (const effect of perk.statEffects ?? []) {
        if (effect.stat === stat && evaluateTraitCondition(effect.condition, combatant)) {
          total += effect.delta;
        }
      }
    }
  }
```

- [ ] **Step 5: Update combatant builder**

Read `src/combat/combatant.ts`. Find `createHeroCombatant`. It currently receives a `perkId` field on its options bag (verify by reading the file). Rename to `pickedPerks: readonly PerkId[]`. Pass through to the returned Combatant.

- [ ] **Step 6: Update combat_setup**

Edit `src/run/combat_setup.ts:75-80` (the createHeroCombatant call). Replace `perkId: hero.perkId` (if present) with `pickedPerks: hero.pickedPerks`.

Also rare-property processing (`rarePropertyFields(hero.equipment)`) currently does not interact with perks, so no change there.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/combat/__tests__/statuses.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Run full suite**

Run: `npm test`
Expected: PASS. Combat tests using `perkId: 'iron_will'` in their setup need to switch to `pickedPerks: ['iron_will']`. Fix each.

- [ ] **Step 9: Commit**

```bash
git add src/combat/types.ts src/combat/statuses.ts src/combat/combatant.ts src/run/combat_setup.ts src/combat/__tests__/statuses.test.ts
git commit -m "Combatant.perkId → pickedPerks; getEffectiveStat sums across perks"
```

---

## Task 4: Save migration v5→v6

**Files:**
- Modify: `src/save/migration.ts` (CURRENT_SCHEMA_VERSION + new MIGRATIONS[5])
- Modify: `src/save/__tests__/migration.test.ts`

- [ ] **Step 1: Write the failing test**

Edit `src/save/__tests__/migration.test.ts`. Add a new describe block:

```ts
describe('v5 → v6 migration (hero perk shape: singular → plural)', () => {
  it('migrates pendingPerk:true and perkId:string to arrays', () => {
    const v5: Record<string, unknown> = {
      version: 5,
      roster: {
        heroes: [
          { id: 'h1', classId: 'knight', pendingPerk: true, perkId: 'iron_will', /* ...minimal fields... */ },
          { id: 'h2', classId: 'archer', pendingPerk: false, /* no perkId */ },
        ],
      },
      tavernCandidates: [
        { id: 'c1', classId: 'priest', pendingPerk: false },
      ],
      // minimal other fields needed for migrate() not to choke
    };
    const out = migrate(v5);
    expect(out.version).toBe(6);
    const heroes = (out.roster as { heroes: Array<Record<string, unknown>> }).heroes;
    expect(heroes[0].pendingPerks).toEqual(['l5']);
    expect(heroes[0].pickedPerks).toEqual(['iron_will']);
    expect(heroes[0].pendingPerk).toBeUndefined();
    expect(heroes[0].perkId).toBeUndefined();
    expect(heroes[1].pendingPerks).toEqual([]);
    expect(heroes[1].pickedPerks).toEqual([]);
    const candidates = out.tavernCandidates as Array<Record<string, unknown>>;
    expect(candidates[0].pendingPerks).toEqual([]);
    expect(candidates[0].pickedPerks).toEqual([]);
  });

  it('migrates runState.party heroes too', () => {
    const v5 = {
      version: 5,
      roster: { heroes: [] },
      runState: {
        party: [{ id: 'h1', classId: 'knight', pendingPerk: true, perkId: 'iron_will' }],
        fallen: [{ id: 'h2', classId: 'archer', pendingPerk: false, perkId: 'precise' }],
        lost: [],
      },
    };
    const out = migrate(v5);
    const party = ((out.runState as Record<string, unknown>).party) as Array<Record<string, unknown>>;
    expect(party[0].pendingPerks).toEqual(['l5']);
    expect(party[0].pickedPerks).toEqual(['iron_will']);
    const fallen = ((out.runState as Record<string, unknown>).fallen) as Array<Record<string, unknown>>;
    expect(fallen[0].pickedPerks).toEqual(['precise']);
  });

  it('is idempotent if applied to an already-v6 save', () => {
    const v6 = {
      version: 6,
      roster: { heroes: [{ id: 'h1', pendingPerks: ['l5'], pickedPerks: [] }] },
    };
    const out = migrate(v6);
    expect(out.version).toBe(6);
    const heroes = (out.roster as { heroes: Array<Record<string, unknown>> }).heroes;
    expect(heroes[0].pendingPerks).toEqual(['l5']);  // unchanged
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/save/__tests__/migration.test.ts`
Expected: FAIL — `CURRENT_SCHEMA_VERSION` is 5, no MIGRATIONS[5] step.

- [ ] **Step 3: Bump version + add migration step**

Edit `src/save/migration.ts`:

```ts
export const CURRENT_SCHEMA_VERSION = 6;

// Inside MIGRATIONS object, add:
  // v5 → v6: Hero.pendingPerk:boolean → pendingPerks:readonly PerkTier[];
  //          Hero.perkId?:PerkId    → pickedPerks:readonly PerkId[].
  //          MAX_LEVEL + L10 perk tier spec, 2026-05-12.
  5: (raw) => {
    const out: Record<string, unknown> = { ...raw, version: 6 };

    const migrateHero = (h: Record<string, unknown>): Record<string, unknown> => {
      // Idempotency: if already migrated, return unchanged.
      if (Array.isArray(h.pendingPerks) && Array.isArray(h.pickedPerks)) return h;
      const { pendingPerk, perkId, ...rest } = h;
      return {
        ...rest,
        pendingPerks: pendingPerk === true ? ['l5'] : [],
        pickedPerks: typeof perkId === 'string' ? [perkId] : [],
      };
    };

    const roster = out.roster as { heroes?: Array<Record<string, unknown>> } | undefined;
    if (roster?.heroes) roster.heroes = roster.heroes.map(migrateHero);

    const candidates = out.tavernCandidates as Array<Record<string, unknown>> | undefined;
    if (candidates) out.tavernCandidates = candidates.map(migrateHero);

    const runState = out.runState as Record<string, unknown> | undefined;
    if (runState) {
      const party = runState.party as Array<Record<string, unknown>> | undefined;
      if (party) runState.party = party.map(migrateHero);
      const fallen = runState.fallen as Array<Record<string, unknown>> | undefined;
      if (fallen) runState.fallen = fallen.map(migrateHero);
      const lost = runState.lost as Array<Record<string, unknown>> | undefined;
      if (lost) runState.lost = lost.map(migrateHero);
    }

    return out;
  },
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/save/__tests__/migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + boot test**

Run: `npm test`
Expected: PASS. Check `src/save/__tests__/boot.test.ts` and `src/save/__tests__/save.test.ts` for any version assertions; bump where needed.

- [ ] **Step 6: Commit**

```bash
git add src/save/migration.ts src/save/__tests__/migration.test.ts
git commit -m "Save schema v6: hero perk shape singular→plural migration"
```

---

## Task 5: MAX_LEVEL bump + extended LEVEL_THRESHOLDS + applyLevelUps tier-push

**Files:**
- Modify: `src/data/leveling.ts`
- Modify: `src/data/__tests__/leveling.test.ts`

- [ ] **Step 1: Write the failing test**

Edit `src/data/__tests__/leveling.test.ts`. Update the `MAX_LEVEL` test and add tier-push tests:

```ts
describe('MAX_LEVEL', () => {
  it('is 10', () => {
    expect(MAX_LEVEL).toBe(10);
  });
});

describe('LEVEL_THRESHOLDS', () => {
  it('has 10 entries matching the spec', () => {
    expect(LEVEL_THRESHOLDS).toEqual([0, 200, 800, 2000, 4000, 6000, 9000, 12500, 16000, 20000]);
  });
});

describe('levelForXp at extended thresholds', () => {
  it.each([
    [0,     1],
    [199,   1],
    [200,   2],
    [3999,  4],
    [4000,  5],
    [5999,  5],
    [6000,  6],
    [12499, 7],
    [12500, 8],
    [19999, 9],
    [20000, 10],
    [99999, 10],
  ])('xp=%d → level %d', (xp, level) => {
    expect(levelForXp(xp)).toBe(level);
  });
});

describe('applyLevelUps tier-push', () => {
  function baseHero(level: number): Hero {
    return {
      id: 'h1', classId: 'knight', name: 'Bran',
      baseStats: { hp: 30, attack: 5, defense: 2, speed: 5, mind: 1, crit: 5, dodge: 5 },
      currentHp: 30, maxHp: 30,
      traitIds: ['stoic'],
      bodySpriteId: 'body_warrior', legsSpriteId: 'legs_default', feetSpriteId: 'feet_default',
      wounds: [],
      equipment: { weapon: { id: 'w', baseId: 'sword_basic', slot: 'weapon', rarity: 'common', weaponType: 'sword', affixes: [], floorRolledAt: 1 } },
      xp: 0, level,
      pendingPerks: [], pickedPerks: [],
    };
  }

  it('L4→L5 pushes "l5" to pendingPerks', () => {
    const before = baseHero(4);
    const after = applyLevelUps(before, 4, 5);
    expect(after.pendingPerks).toEqual(['l5']);
  });

  it('L9→L10 pushes "l10" to pendingPerks', () => {
    const before = baseHero(9);
    const after = applyLevelUps(before, 9, 10);
    expect(after.pendingPerks).toEqual(['l10']);
  });

  it('L4→L10 pushes both ["l5", "l10"] in order', () => {
    const before = baseHero(4);
    const after = applyLevelUps(before, 4, 10);
    expect(after.pendingPerks).toEqual(['l5', 'l10']);
  });

  it('L6→L7 does not push any tier (no boundary crossed)', () => {
    const before = baseHero(6);
    const after = applyLevelUps(before, 6, 7);
    expect(after.pendingPerks).toEqual([]);
  });

  it('appends to existing pendingPerks rather than overwriting', () => {
    const before = { ...baseHero(4), pendingPerks: ['l5'] as const };
    const after = applyLevelUps(before, 4, 10);
    // Existing 'l5' preserved, new 'l5' NOT duplicated, 'l10' appended.
    expect(after.pendingPerks).toEqual(['l5', 'l10']);
  });

  it('per-level HP and primary-stat bumps apply per level (L4→L10 = 6 levels)', () => {
    const before = baseHero(4);
    const after = applyLevelUps(before, 4, 10);
    expect(after.maxHp).toBe(before.maxHp + 6 * 2);     // 2 HP per level
    expect(after.baseStats.defense).toBe(before.baseStats.defense + 6 * 1); // Knight primary = defense, +1/level
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/__tests__/leveling.test.ts`
Expected: FAIL — MAX_LEVEL is still 5, LEVEL_THRESHOLDS has 5 entries, applyLevelUps writes `pendingPerk: boolean`.

- [ ] **Step 3: Update `src/data/leveling.ts`**

```ts
import { CLASSES } from './classes';
import type { Hero } from '@heroes/hero';
import type { PerkTier } from './types';
import type { Stats } from '@combat/types';

export const MAX_LEVEL = 10;

export const LEVEL_THRESHOLDS: readonly number[] = [
  0,      // level 1
  200,    // level 2
  800,    // level 3
  2000,   // level 4
  4000,   // level 5
  6000,   // level 6
  9000,   // level 7
  12500,  // level 8
  16000,  // level 9
  20000,  // level 10
];

// xpForCombatNode / xpForEliteNode / xpForBossNode / levelForXp: UNCHANGED.
// They naturally extend to the new thresholds via Math.min(level, MAX_LEVEL).

export function applyLevelUps(hero: Hero, prevLevel: number, newLevel: number): Hero {
  if (newLevel <= prevLevel) return hero;
  const def = CLASSES[hero.classId];
  const levels = newLevel - prevLevel;
  const hpBump = 2 * levels;
  const primaryBump = (def.primaryStat === 'crit' ? 2 : 1) * levels;
  const newBaseStats: Stats = { ...hero.baseStats };
  newBaseStats[def.primaryStat] = newBaseStats[def.primaryStat] + primaryBump;

  // Compute tier crossings.
  const nextPending: PerkTier[] = [...hero.pendingPerks];
  if (prevLevel < 5 && newLevel >= 5 && !nextPending.includes('l5') && !hero.pickedPerks.some((id) => /* perk tier check */ false)) {
    nextPending.push('l5');
  }
  if (prevLevel < 10 && newLevel >= 10 && !nextPending.includes('l10') && !hero.pickedPerks.some((id) => /* perk tier check */ false)) {
    nextPending.push('l10');
  }

  return {
    ...hero,
    baseStats: newBaseStats,
    maxHp: hero.maxHp + hpBump,
    currentHp: hero.currentHp + hpBump,
    level: newLevel,
    pendingPerks: nextPending,
  };
}
```

NOTE on the `hero.pickedPerks.some(...)` placeholder above: the precise check needs to ask "has this hero already picked a perk at this tier?" Since each picked perk's `tier` lives on `PERKS[id].tier`, the real check is:

```ts
import { PERKS } from './perks';

// inside applyLevelUps:
const hasPicked = (tier: PerkTier) =>
  hero.pickedPerks.some((id) => PERKS[id].tier === tier);

if (prevLevel < 5 && newLevel >= 5 && !nextPending.includes('l5') && !hasPicked('l5')) {
  nextPending.push('l5');
}
if (prevLevel < 10 && newLevel >= 10 && !nextPending.includes('l10') && !hasPicked('l10')) {
  nextPending.push('l10');
}
```

Use this real version. The `hasPicked` guard prevents re-pushing a tier the hero already picked (e.g., if they were L5 with `pickedPerks: ['iron_will']` and somehow rerun through L4→L5 — defensive).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/data/__tests__/leveling.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: PASS. The Tavern pre-leveled feature already uses `applyLevelUps`; it should keep working. The `pendingPerk` write site in `run_state.ts` from Task 2 step 5 — replace its temporary form with simply trusting `applyLevelUps` (don't double-push).

- [ ] **Step 6: Commit**

```bash
git add src/data/leveling.ts src/data/__tests__/leveling.test.ts src/run/run_state.ts
git commit -m "$(cat <<'EOF'
MAX_LEVEL=10 + extended LEVEL_THRESHOLDS + tier-push in applyLevelUps

L6-L10 thresholds: 6000/9000/12500/16000/20000. Per-level stat bumps
unchanged. applyLevelUps now pushes 'l5'/'l10' tier markers to
pendingPerks when the level span crosses each boundary, guarded by
hasPicked() to avoid re-pushing for already-picked tiers.
EOF
)"
```

---

## Task 6: perk_hooks.ts module — skeleton + 5 PerkAction helpers

**Files:**
- Create: `src/combat/perk_hooks.ts`
- Create: `src/combat/__tests__/perk_hooks.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/combat/__tests__/perk_hooks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyPerkAction } from '../perk_hooks';
import type { Combatant, CombatEvent } from '../types';
import type { PerkAction, PerkId } from '@data/types';

function makeCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'p0', side: 'player', slot: 1, kind: 'hero', classId: 'knight',
    baseStats: { hp: 30, attack: 5, defense: 2, speed: 5, mind: 1, crit: 5, dodge: 5 },
    currentHp: 30, maxHp: 30, statuses: {}, cooldowns: {},
    abilities: [], aiPriority: [], pickedPerks: [],
    isDead: false,
    ...overrides,
  } as Combatant;
}

describe('applyPerkAction', () => {
  const perkId: PerkId = 'iron_will';

  describe('gainStat untimed (whenBelowHp continuous aura)', () => {
    it('adds a synthetic status that grants stat delta', () => {
      const self = makeCombatant();
      const action: PerkAction = { kind: 'gainStat', stat: 'defense', delta: 4 };
      const events: CombatEvent[] = [];
      applyPerkAction({ self, other: undefined, perkId, action, events });
      const statusKey = `perk_aura_${perkId}`;
      expect(self.statuses[statusKey]).toBeDefined();
      expect(self.statuses[statusKey].effect).toMatchObject({ kind: 'buff', stat: 'defense', delta: 4 });
    });

    it('clearPerkAura removes the aura status', () => {
      const self = makeCombatant();
      const action: PerkAction = { kind: 'gainStat', stat: 'defense', delta: 4 };
      const events: CombatEvent[] = [];
      applyPerkAction({ self, other: undefined, perkId, action, events });
      clearPerkAura(self, perkId);
      expect(self.statuses[`perk_aura_${perkId}`]).toBeUndefined();
    });
  });

  describe('gainStat timed (snowball stack)', () => {
    it('adds a stack with its own duration', () => {
      const self = makeCombatant();
      const action: PerkAction = { kind: 'gainStat', stat: 'attack', delta: 2, duration: 3, stacking: true };
      applyPerkAction({ self, other: undefined, perkId, action, events: [] });
      // First stack lives at perk_stack_<perkId>_0 (or similar key — implementation choice).
      const stackKeys = Object.keys(self.statuses).filter((k) => k.startsWith(`perk_stack_${perkId}`));
      expect(stackKeys).toHaveLength(1);
      expect(self.statuses[stackKeys[0]].effect).toMatchObject({ kind: 'buff', stat: 'attack', delta: 2 });
      expect(self.statuses[stackKeys[0]].remainingTurns).toBe(3);
    });

    it('a second trigger adds a second stack', () => {
      const self = makeCombatant();
      const action: PerkAction = { kind: 'gainStat', stat: 'attack', delta: 2, duration: 3, stacking: true };
      applyPerkAction({ self, other: undefined, perkId, action, events: [] });
      applyPerkAction({ self, other: undefined, perkId, action, events: [] });
      const stackKeys = Object.keys(self.statuses).filter((k) => k.startsWith(`perk_stack_${perkId}`));
      expect(stackKeys).toHaveLength(2);
    });
  });

  describe('damageMod', () => {
    it('returns an outgoing damage multiplier (host integrates at applyDamage)', () => {
      const action: PerkAction = { kind: 'damageMod', multiplier: 2 };
      const mod = computeDamageMod(action);
      expect(mod).toBe(2);
    });
  });

  describe('damageMitigation', () => {
    it('returns an incoming damage multiplier', () => {
      const action: PerkAction = { kind: 'damageMitigation', multiplier: 0.5 };
      const mit = computeDamageMitigation(action);
      expect(mit).toBe(0.5);
    });
  });

  describe('applyStatus to other', () => {
    it('applies status to the trigger target', () => {
      const self = makeCombatant();
      const other = makeCombatant({ id: 'p1' });
      const action: PerkAction = { kind: 'applyStatus', statusId: 'marked', duration: 3, target: 'other' };
      applyPerkAction({ self, other, perkId, action, events: [] });
      expect(other.statuses['marked']).toBeDefined();
      expect(other.statuses['marked'].remainingTurns).toBe(3);
    });
  });

  describe('applyStatus to self', () => {
    it('applies status to the perk-bearer', () => {
      const self = makeCombatant();
      const other = makeCombatant({ id: 'p1' });
      const action: PerkAction = { kind: 'applyStatus', statusId: 'regen', duration: 3, target: 'self' };
      applyPerkAction({ self, other, perkId, action, events: [] });
      expect(self.statuses['regen']).toBeDefined();
    });
  });

  describe('lifesteal', () => {
    it('returns the lifesteal ratio for host-side integration', () => {
      const action: PerkAction = { kind: 'lifesteal', ratio: 0.2 };
      const r = computeLifestealRatio(action);
      expect(r).toBe(0.2);
    });
  });
});

import { clearPerkAura, computeDamageMod, computeDamageMitigation, computeLifestealRatio } from '../perk_hooks';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/combat/__tests__/perk_hooks.test.ts`
Expected: FAIL — file doesn't exist.

- [ ] **Step 3: Create `src/combat/perk_hooks.ts`**

```ts
import { PERKS } from '@data/perks';
import type { AbilityEffect, PerkAction, PerkId, StatusId } from '@data/types';
import type { Combatant, CombatEvent } from './types';

export interface ApplyPerkActionArgs {
  self: Combatant;
  other: Combatant | undefined;
  perkId: PerkId;
  action: PerkAction;
  events: CombatEvent[];
}

export function applyPerkAction(args: ApplyPerkActionArgs): void {
  const { self, other, perkId, action, events } = args;
  switch (action.kind) {
    case 'gainStat':
      if (action.duration !== undefined && action.stacking) {
        addStack(self, perkId, action, events);
      } else if (action.duration !== undefined) {
        // Timed non-stacking: replace any existing instance.
        const key = `perk_stack_${perkId}_0`;
        self.statuses[key] = {
          statusId: key as StatusId,
          remainingTurns: action.duration,
          effect: makeBuffEffect(action.stat, action.delta, action.duration, key),
          sourceId: self.id,
        };
      } else {
        // Untimed aura: keyed by perk id, applied/removed in lockstep with whenBelowHp.
        const key = `perk_aura_${perkId}`;
        self.statuses[key] = {
          statusId: key as StatusId,
          remainingTurns: Number.POSITIVE_INFINITY,
          effect: makeBuffEffect(action.stat, action.delta, Number.POSITIVE_INFINITY, key),
          sourceId: self.id,
        };
      }
      return;
    case 'applyStatus':
      const target = action.target === 'self' ? self : other;
      if (!target) return;
      target.statuses[action.statusId] = {
        statusId: action.statusId,
        remainingTurns: action.duration,
        effect: synthesizeStatusEffect(action.statusId, action.duration),
        sourceId: self.id,
      };
      events.push({
        kind: 'status_applied',
        sourceId: self.id,
        targetId: target.id,
        statusId: action.statusId,
        duration: action.duration,
      });
      return;
    case 'damageMod':
    case 'damageMitigation':
    case 'lifesteal':
      // These are consumed at the applyDamage call site, not applied as state.
      return;
  }
}

function addStack(
  self: Combatant,
  perkId: PerkId,
  action: Extract<PerkAction, { kind: 'gainStat' }>,
  events: CombatEvent[],
): void {
  // Find lowest free index up to STACK_CAP.
  for (let i = 0; i < STACK_CAP; i++) {
    const key = `perk_stack_${perkId}_${i}`;
    if (!self.statuses[key]) {
      self.statuses[key] = {
        statusId: key as StatusId,
        remainingTurns: action.duration!,
        effect: makeBuffEffect(action.stat, action.delta, action.duration!, key),
        sourceId: self.id,
      };
      return;
    }
  }
  // At cap: refresh all existing stack durations to full (Task 12).
  refreshAllStackDurations(self, perkId, action.duration!);
}

function refreshAllStackDurations(self: Combatant, perkId: PerkId, duration: number): void {
  for (let i = 0; i < STACK_CAP; i++) {
    const key = `perk_stack_${perkId}_${i}`;
    if (self.statuses[key]) self.statuses[key].remainingTurns = duration;
  }
}

export const STACK_CAP = 5;

export function clearPerkAura(self: Combatant, perkId: PerkId): void {
  const key = `perk_aura_${perkId}`;
  if (self.statuses[key]) delete self.statuses[key];
}

export function computeDamageMod(action: Extract<PerkAction, { kind: 'damageMod' }>): number {
  return action.multiplier;
}

export function computeDamageMitigation(action: Extract<PerkAction, { kind: 'damageMitigation' }>): number {
  return action.multiplier;
}

export function computeLifestealRatio(action: Extract<PerkAction, { kind: 'lifesteal' }>): number {
  return action.ratio;
}

function makeBuffEffect(stat: string, delta: number, duration: number, statusId: string): AbilityEffect {
  return { kind: 'buff', stat: stat as any, delta, duration, statusId: statusId as StatusId };
}

function synthesizeStatusEffect(statusId: StatusId, duration: number): AbilityEffect {
  // Maps a status id to the AbilityEffect that tickStatuses already knows how to handle.
  // 'marked' → mark with damageBonus; 'regen' → regen with healPerTurn; etc.
  // Authored per-status here so the perk system can apply known statuses without ability machinery.
  switch (statusId) {
    case 'marked':
      return { kind: 'mark', damageBonus: 0.5, duration, statusId };
    case 'regen':
      return { kind: 'regen', healPerTurn: 5, duration, statusId };
    default:
      // Fallback: a no-op buff (still tracks duration for cleanup).
      return { kind: 'buff', stat: 'attack', delta: 0, duration, statusId };
  }
}
```

NOTE on `damageBonus: 0.5` and `healPerTurn: 5`: these are the values the L10 perks use (Eagle's Mark = +25% means damageBonus 0.25 actually — check spec). Adjust per-status here OR make the values parameters via richer `PerkAction.applyStatus` variant. Simpler: parameterize via the action.

Refined approach: extend `PerkAction.applyStatus` to carry the per-status payload:

```ts
| { kind: 'applyStatus'; statusId: 'marked'; duration: number; target: 'self' | 'other'; damageBonus: number }
| { kind: 'applyStatus'; statusId: 'regen'; duration: number; target: 'self' | 'other'; healPerTurn: number }
| { kind: 'applyStatus'; statusId: Exclude<StatusId, 'marked' | 'regen'>; duration: number; target: 'self' | 'other' };
```

If this discriminated-by-statusId shape is too verbose, **alternative**: a single `payload?: { damageBonus?: number; healPerTurn?: number }` field. Less type-safe, simpler. Pick during implementation; the test suite will catch wrong payloads.

This implementer decision should land in this commit message.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/combat/__tests__/perk_hooks.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: PASS (no changes to call sites yet).

- [ ] **Step 6: Commit**

```bash
git add src/combat/perk_hooks.ts src/combat/__tests__/perk_hooks.test.ts
git commit -m "perk_hooks: applyPerkAction with 5 PerkAction kinds + STACK_CAP=5"
```

---

## Task 7: Wire onCrit fire-site in applyDamage

**Files:**
- Modify: `src/combat/effects.ts:39-40` (after `wasCrit` decision)
- Modify: `src/combat/__tests__/effects.test.ts` or new test file

- [ ] **Step 1: Write the failing integration test**

Create or extend `src/combat/__tests__/perks_integration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveCombat } from '../combat';
import { mulberry32 } from '@util/rng';
// Use existing combat setup helpers; check src/combat/__tests__/helpers.ts for available utilities.

describe('onCrit triggered perks', () => {
  it('fires onCrit when the perk-bearer scores a crit', () => {
    // Setup: a knight combatant with a synthetic onCrit perk that adds a 'marked' status to target.
    // Crit is forced via 100% crit stat or a fixed-RNG seed that produces a crit.
    // After combat, verify the target had 'marked' applied at least once.
    // ...
  });

  it('does not fire onCrit on a non-crit hit', () => {
    // Setup: 0% crit chance. Verify no marked status applied.
    // ...
  });
});
```

(Full test code authored at implementation time using existing combat helpers; the file `src/combat/__tests__/helpers.ts` should provide `buildState`, `makeHero`, etc. Read it first.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/combat/__tests__/perks_integration.test.ts`
Expected: FAIL — no fire-site exists yet; crit doesn't trigger anything.

- [ ] **Step 3: Wire the fire-site in `effects.ts`**

Edit `src/combat/effects.ts` inside `applyDamage`. After line 40 (`if (wasCrit) raw = raw * 2;`):

```ts
import { firePerkTrigger } from './perk_hooks';

// ... inside applyDamage, after wasCrit check:
  if (wasCrit) {
    raw = raw * 2;
    firePerkTrigger({
      self: caster,
      other: target,
      triggerKind: 'onCrit',
      events,
    });
  }
```

In `perk_hooks.ts`, add `firePerkTrigger`:

```ts
export interface FirePerkTriggerArgs {
  self: Combatant;
  other: Combatant | undefined;
  triggerKind: 'onCrit' | 'onKill' | 'onStruck' | 'firstAttack';
  events: CombatEvent[];
}

export function firePerkTrigger(args: FirePerkTriggerArgs): void {
  for (const perkId of args.self.pickedPerks) {
    const perk = PERKS[perkId];
    const t = perk.triggeredEffect;
    if (!t) continue;
    if (!matchesTrigger(t.trigger, args)) continue;
    applyPerkAction({ self: args.self, other: args.other, perkId, action: t.action, events: args.events });
  }
}

function matchesTrigger(trigger: PerkTrigger, args: FirePerkTriggerArgs): boolean {
  if (trigger.kind !== args.triggerKind) return false;
  // whenAtFullHp filter on onStruck is handled inside the fire-site (see Task 8) since it
  // needs pre-write HP. For other triggers, no per-trigger filter.
  return true;
}
```

(Imports `PerkTrigger` from `@data/types`.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/combat/__tests__/perks_integration.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/combat/effects.ts src/combat/perk_hooks.ts src/combat/__tests__/perks_integration.test.ts
git commit -m "Wire onCrit fire-site in applyDamage"
```

---

## Task 8: Wire onStruck fire-site (with whenAtFullHp filter)

**Files:**
- Modify: `src/combat/effects.ts` (inside applyDamage, before `target.currentHp -= amplified`)
- Modify: `src/combat/__tests__/perks_integration.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `perks_integration.test.ts`:

```ts
describe('onStruck triggered perks', () => {
  it('fires onStruck when the perk-bearer is hit', () => {
    // Setup: defender with onStruck perk applying a regen status to self.
    // After combat, verify regen was applied.
  });

  it('whenAtFullHp:true filter prevents fire at low HP', () => {
    // Setup: defender at 50% HP with onStruck+whenAtFullHp perk.
    // Verify perk's action is NOT applied on next hit.
  });

  it('whenAtFullHp:true filter fires when at full HP', () => {
    // Setup: defender at full HP with onStruck+whenAtFullHp perk applying damageMitigation 0.5.
    // First hit's damage is halved; second hit (now at <full HP) is not halved.
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/combat/__tests__/perks_integration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Wire fire-site**

Edit `src/combat/effects.ts` inside `applyDamage`. Right before `target.currentHp -= amplified;`:

```ts
  // onStruck — must evaluate whenAtFullHp using pre-write HP.
  const wasFullHp = target.currentHp >= target.maxHp;
  // Apply damageMitigation from onStruck perks to `amplified` if any perk specifies it.
  let mitigated = amplified;
  for (const perkId of target.pickedPerks) {
    const perk = PERKS[perkId];
    const t = perk.triggeredEffect;
    if (!t || t.trigger.kind !== 'onStruck') continue;
    if (t.trigger.whenAtFullHp && !wasFullHp) continue;
    if (t.action.kind === 'damageMitigation') {
      mitigated = Math.max(1, Math.round(mitigated * t.action.multiplier));
    }
  }
  // Apply non-damageMitigation onStruck actions (status applies, gainStat, etc.) via firePerkTrigger.
  firePerkTrigger({
    self: target,
    other: caster,
    triggerKind: 'onStruck',
    events,
    extraFilter: (trigger) => trigger.kind === 'onStruck' && (!trigger.whenAtFullHp || wasFullHp),
    actionFilter: (action) => action.kind !== 'damageMitigation', // already handled above
  });
  target.currentHp -= mitigated;
```

Update `firePerkTrigger` to accept optional `extraFilter` and `actionFilter`. (Cleaner: have two specialized functions — `fireOnStruckDamageMitigation(target, wasFullHp)` returns the cumulative multiplier; `fireOnStruckSideEffects(target, caster, wasFullHp)` runs the rest. Refactor as needed during implementation.)

Use `mitigated` instead of `amplified` in the existing `damage_applied` event and `lethal` calculation.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/combat/__tests__/perks_integration.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/combat/effects.ts src/combat/perk_hooks.ts src/combat/__tests__/perks_integration.test.ts
git commit -m "Wire onStruck fire-site (with whenAtFullHp filter + damageMitigation pass)"
```

---

## Task 9: Wire onKill fire-site

**Files:**
- Modify: `src/combat/effects.ts` (after `lethal = target.currentHp <= 0`)
- Modify: `src/combat/__tests__/perks_integration.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('onKill triggered perks', () => {
  it('fires onKill when the perk-bearer deals the killing blow', () => {
    // Setup: attacker with onKill perk (Rampage-style: +2 attack, duration 3, stacking).
    // After a kill, attacker has 1 stack of +attack.
  });

  it('does not fire onKill on a non-lethal hit', () => {
    // Setup: attacker with onKill perk. Hit reduces target HP but doesn't kill.
    // Attacker has 0 stacks.
  });

  it('multiple kills stack to STACK_CAP (5)', () => {
    // Setup: attacker with Rampage; sim 7 kills.
    // Verify max 5 stacks; further kills refresh existing stack durations.
  });
});
```

- [ ] **Step 2: Run test to fail**

Run: `npx vitest run src/combat/__tests__/perks_integration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Wire fire-site**

Edit `src/combat/effects.ts` inside `applyDamage`. After `lethal = target.currentHp <= 0;`:

```ts
  if (lethal) {
    firePerkTrigger({
      self: caster,
      other: target,
      triggerKind: 'onKill',
      events,
    });
  }
```

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/combat/effects.ts src/combat/__tests__/perks_integration.test.ts
git commit -m "Wire onKill fire-site in applyDamage"
```

---

## Task 10: Wire firstAttack fire-site (per-combat fired tracker)

**Files:**
- Modify: `src/combat/types.ts` (already added `firstAttackFiredPerkIds` in Task 3 — confirm)
- Modify: `src/combat/combat.ts` (`executeTurn` or wherever a combatant first acts)
- Modify: `src/combat/__tests__/perks_integration.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('firstAttack triggered perks', () => {
  it('fires firstAttack on the first action only', () => {
    // Setup: attacker with firstAttack perk applying damageMod 2.0.
    // First attack deals 2x damage; second attack deals normal damage.
  });

  it('firstAttack tracker resets per combat', () => {
    // Setup: run two combats. Verify firstAttack fires in each independently.
  });
});
```

- [ ] **Step 2: Run test**

Expected: FAIL.

- [ ] **Step 3: Wire fire-site**

In `src/combat/combat.ts`, inside the per-combatant action loop (around line 77+), at the top of an actor's turn:

```ts
// Before executing the action — fire firstAttack for any perk the actor has that hasn't fired yet.
const fired = new Set(combatant.firstAttackFiredPerkIds ?? []);
for (const perkId of combatant.pickedPerks) {
  const perk = PERKS[perkId];
  const t = perk.triggeredEffect;
  if (!t || t.trigger.kind !== 'firstAttack') continue;
  if (fired.has(perkId)) continue;
  fired.add(perkId);
  // damageMod is special: it modifies the NEXT outgoing damage. Stash on combatant.
  if (t.action.kind === 'damageMod') {
    combatant.pendingDamageMod = (combatant.pendingDamageMod ?? 1) * t.action.multiplier;
  } else {
    applyPerkAction({ self: combatant, other: undefined, perkId, action: t.action, events });
  }
}
combatant.firstAttackFiredPerkIds = Array.from(fired);
```

Add `pendingDamageMod?: number` to Combatant in `src/combat/types.ts`. In `applyDamage`, consume it once:

```ts
// After existing raw computation, before final clamp:
if (caster.pendingDamageMod !== undefined && caster.pendingDamageMod !== 1) {
  raw = Math.round(raw * caster.pendingDamageMod);
  caster.pendingDamageMod = 1; // consume
}
```

Combat-start init: in `resolveCombat`, when constructing `state.combatants`, ensure each has `firstAttackFiredPerkIds: []` and no `pendingDamageMod`. Reset between combats via the `structuredClone` of `initialState` at the top of resolveCombat — should already happen.

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/combat/combat.ts src/combat/types.ts src/combat/__tests__/perks_integration.test.ts
git commit -m "Wire firstAttack fire-site with per-combat fired tracker + pendingDamageMod"
```

---

## Task 11: Wire whenBelowHp recompute on HP changes

**Files:**
- Modify: `src/combat/effects.ts` (after `target.currentHp -= mitigated` and after lifesteal heal)
- Modify: `src/combat/combat.ts` (after combat-start regen heal, after `tickStatuses` regen tick)
- Modify: `src/combat/perk_hooks.ts` (add `recomputeBelowHpAuras`)
- Modify: `src/combat/__tests__/perks_integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('whenBelowHp continuous-aura perks', () => {
  it('applies aura when HP drops below threshold', () => {
    // Setup: defender at 100% HP with Last Stand (whenBelowHp 0.3, +4 defense).
    // Initial: no aura.
    // After taking damage to 25% HP: aura active, getEffectiveStat(c, 'defense') += 4.
  });

  it('removes aura when healed above threshold', () => {
    // Setup: at 20% HP with active Last Stand aura.
    // Heal to 50% HP: aura removed.
  });

  it('multiple whenBelowHp perks evaluate independently', () => {
    // Setup: defender with both Sanctity (0.5) and Last Stand (0.3).
    // At 40% HP: Sanctity active, Last Stand not.
    // At 25% HP: both active.
  });
});
```

- [ ] **Step 2: Test fails**

Run: `npx vitest run src/combat/__tests__/perks_integration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `recomputeBelowHpAuras`**

In `src/combat/perk_hooks.ts`:

```ts
export function recomputeBelowHpAuras(self: Combatant, events: CombatEvent[]): void {
  if (self.maxHp <= 0) return;
  const hpRatio = self.currentHp / self.maxHp;
  for (const perkId of self.pickedPerks) {
    const perk = PERKS[perkId];
    const t = perk.triggeredEffect;
    if (!t || t.trigger.kind !== 'whenBelowHp') continue;
    const shouldBeActive = hpRatio < t.trigger.ratio;
    const auraKey = `perk_aura_${perkId}`;
    const currentlyActive = self.statuses[auraKey] !== undefined;
    if (shouldBeActive && !currentlyActive) {
      applyPerkAction({ self, other: undefined, perkId, action: t.action, events });
    } else if (!shouldBeActive && currentlyActive) {
      clearPerkAura(self, perkId);
    }
  }
}
```

- [ ] **Step 4: Call it at every HP-mutation site**

In `src/combat/effects.ts`:

```ts
// After target.currentHp -= mitigated;
recomputeBelowHpAuras(target, events);

// After lifesteal heal (caster.currentHp += actual):
recomputeBelowHpAuras(caster, events);
```

In `src/combat/combat.ts`:

```ts
// After combat-start regenPerRound heal (around line 70):
recomputeBelowHpAuras(c, events);

// After tickStatuses (around the round-end region):
for (const c of state.combatants) if (!c.isDead) recomputeBelowHpAuras(c, events);
```

Also call at combat start — after constructing combatants — to set initial auras (rare, but possible if a starting wound puts a hero below threshold).

- [ ] **Step 5: Tests pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/combat/perk_hooks.ts src/combat/effects.ts src/combat/combat.ts src/combat/__tests__/perks_integration.test.ts
git commit -m "Wire whenBelowHp continuous aura — recompute on every HP change"
```

---

## Task 12: Stack cap (5 stacks, refresh-all at cap)

**Files:**
- Modify: `src/combat/perk_hooks.ts` (`addStack` / `refreshAllStackDurations`)
- Modify: `src/combat/__tests__/perk_hooks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('stack cap behavior', () => {
  it('caps at STACK_CAP (5) stacks', () => {
    const self = makeCombatant();
    const action: PerkAction = { kind: 'gainStat', stat: 'attack', delta: 2, duration: 3, stacking: true };
    for (let i = 0; i < 7; i++) {
      applyPerkAction({ self, other: undefined, perkId: 'iron_will', action, events: [] });
    }
    const stackKeys = Object.keys(self.statuses).filter((k) => k.startsWith('perk_stack_iron_will'));
    expect(stackKeys.length).toBeLessThanOrEqual(STACK_CAP);
  });

  it('a trigger at cap refreshes all existing stack durations', () => {
    const self = makeCombatant();
    const action: PerkAction = { kind: 'gainStat', stat: 'attack', delta: 2, duration: 3, stacking: true };
    // Fill to cap
    for (let i = 0; i < STACK_CAP; i++) {
      applyPerkAction({ self, other: undefined, perkId: 'iron_will', action, events: [] });
    }
    // Manually decrement one stack to simulate time passing
    self.statuses['perk_stack_iron_will_0'].remainingTurns = 1;
    // Fire another trigger — should refresh all stacks to full duration (3)
    applyPerkAction({ self, other: undefined, perkId: 'iron_will', action, events: [] });
    for (let i = 0; i < STACK_CAP; i++) {
      expect(self.statuses[`perk_stack_iron_will_${i}`].remainingTurns).toBe(3);
    }
  });
});
```

- [ ] **Step 2: Tests fail**

Run: `npx vitest run src/combat/__tests__/perk_hooks.test.ts`
Expected: FAIL on the refresh-all test (cap behavior already there from Task 6, refresh-all maybe not).

- [ ] **Step 3: Ensure refresh-all is wired**

Task 6's `addStack` should already call `refreshAllStackDurations` when no free slot found. Verify and fix if not.

- [ ] **Step 4: Tests pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/combat/perk_hooks.ts src/combat/__tests__/perk_hooks.test.ts
git commit -m "Stack cap behavior: refresh-all when at STACK_CAP=5"
```

---

## Task 13: 16 L10 perks data + CLASS_PERK_TIERS.l10 wiring

**Files:**
- Modify: `src/data/types.ts` — extend `PerkId` union with 16 new ids
- Modify: `src/data/perks.ts` — add 16 PerkDef entries; wire CLASS_PERK_TIERS.l10 lists
- Modify: `src/data/__tests__/perks.test.ts` — update `EXPECTED_IDS` + l10 list assertions

- [ ] **Step 1: Update PerkId union**

In `src/data/types.ts`, find `export type PerkId =` and extend:

```ts
export type PerkId =
  | 'iron_will' | 'resolute'
  | 'precise' | 'eagle_eye'
  | 'devout' | 'steadfast'
  | 'berserker' | 'tough_skin'
  | 'lethal' | 'evasive'
  | 'arcane_power' | 'quick_cast'
  | 'righteous' | 'vindicator'
  | 'beastmaster' | 'sharpshooter'
  // L10 tier — Cluster D · 7
  | 'unbreakable' | 'last_stand'
  | 'eagles_mark' | 'first_strike'
  | 'sanctity' | 'holy_vigor'
  | 'rampage' | 'bloodlust'
  | 'backstab' | 'phantom'
  | 'spellweaver' | 'arcane_surge'
  | 'crusader' | 'aegis'
  | 'pack_tactics' | 'killer_instinct';
```

- [ ] **Step 2: Update EXPECTED_IDS in tests**

In `src/data/__tests__/perks.test.ts`, extend `EXPECTED_IDS` with the 16 new ids.

Add new assertions:

```ts
describe('L10 perks have triggeredEffect', () => {
  const L10_PERK_IDS: readonly PerkId[] = [
    'unbreakable', 'last_stand',
    'eagles_mark', 'first_strike',
    'sanctity', 'holy_vigor',
    'rampage', 'bloodlust',
    'backstab', 'phantom',
    'spellweaver', 'arcane_surge',
    'crusader', 'aegis',
    'pack_tactics', 'killer_instinct',
  ];
  it.each(L10_PERK_IDS)('%s has tier l10 and triggeredEffect', (id) => {
    expect(PERKS[id].tier).toBe('l10');
    expect(PERKS[id].triggeredEffect).toBeDefined();
  });
});

describe('CLASS_PERK_TIERS.l10 is populated', () => {
  it.each(['knight','archer','priest','barbarian','rogue','mage','paladin','hunter'] as ClassId[])(
    '%s has 2 l10 perks',
    (classId) => {
      expect(CLASS_PERK_TIERS[classId].l10).toHaveLength(2);
      for (const perkId of CLASS_PERK_TIERS[classId].l10) {
        expect(PERKS[perkId].classId).toBe(classId);
        expect(PERKS[perkId].tier).toBe('l10');
      }
    },
  );
});
```

- [ ] **Step 3: Run tests, see fail**

Run: `npx vitest run src/data/__tests__/perks.test.ts`
Expected: FAIL — 16 new perks missing.

- [ ] **Step 4: Add the 16 PerkDef entries to `src/data/perks.ts`**

Append to the PERKS map:

```ts
  // === L10 ===

  // Knight
  unbreakable: {
    id: 'unbreakable',
    name: 'Unbreakable',
    description: 'Halve incoming damage when struck at full HP.',
    classId: 'knight', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onStruck', whenAtFullHp: true },
      action: { kind: 'damageMitigation', multiplier: 0.5 },
    },
  },
  last_stand: {
    id: 'last_stand',
    name: 'Last Stand',
    description: '+4 Defense while below 30% HP.',
    classId: 'knight', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.3 },
      action: { kind: 'gainStat', stat: 'defense', delta: 4 },
    },
  },

  // Archer
  eagles_mark: {
    id: 'eagles_mark',
    name: "Eagle's Mark",
    description: 'Crits Mark the target (+25% damage taken, 3 turns).',
    classId: 'archer', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: { kind: 'applyStatus', statusId: 'marked', duration: 3, target: 'other' },
      // NOTE: 'marked' damageBonus is 0.25 — wire via the applyStatus payload (see Task 6).
    },
  },
  first_strike: {
    id: 'first_strike',
    name: 'First Strike',
    description: 'Your first attack each combat deals double damage.',
    classId: 'archer', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'firstAttack' },
      action: { kind: 'damageMod', multiplier: 2.0 },
    },
  },

  // Priest
  sanctity: {
    id: 'sanctity',
    name: 'Sanctity',
    description: '+4 Mind while below 50% HP.',
    classId: 'priest', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'mind', delta: 4 },
    },
  },
  holy_vigor: {
    id: 'holy_vigor',
    name: 'Holy Vigor',
    description: 'Gain Regen (+5 HP/turn, 3 turns) when struck.',
    classId: 'priest', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: { kind: 'applyStatus', statusId: 'regen', duration: 3, target: 'self' },
    },
  },

  // Barbarian
  rampage: {
    id: 'rampage',
    name: 'Rampage',
    description: '+2 Attack for 3 turns on kill (stacks up to 5).',
    classId: 'barbarian', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'attack', delta: 2, duration: 3, stacking: true },
    },
  },
  bloodlust: {
    id: 'bloodlust',
    name: 'Bloodlust',
    description: '+4 Attack while below 50% HP.',
    classId: 'barbarian', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'attack', delta: 4 },
    },
  },

  // Rogue
  backstab: {
    id: 'backstab',
    name: 'Backstab',
    description: 'Your first attack each combat deals 2.5x damage.',
    classId: 'rogue', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'firstAttack' },
      action: { kind: 'damageMod', multiplier: 2.5 },
    },
  },
  phantom: {
    id: 'phantom',
    name: 'Phantom',
    description: '+20 Dodge for 2 turns on crit.',
    classId: 'rogue', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: { kind: 'gainStat', stat: 'dodge', delta: 20, duration: 2 },
    },
  },

  // Mage
  spellweaver: {
    id: 'spellweaver',
    name: 'Spellweaver',
    description: '+2 Mind for 3 turns on kill (stacks up to 5).',
    classId: 'mage', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'mind', delta: 2, duration: 3, stacking: true },
    },
  },
  arcane_surge: {
    id: 'arcane_surge',
    name: 'Arcane Surge',
    description: 'Crits Mark the target (+50% damage taken, 2 turns).',
    classId: 'mage', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: { kind: 'applyStatus', statusId: 'marked', duration: 2, target: 'other' },
      // NOTE: 'marked' damageBonus is 0.5 here — distinguish from eagles_mark's 0.25.
    },
  },

  // Paladin
  crusader: {
    id: 'crusader',
    name: 'Crusader',
    description: '+2 Mind for 3 turns on kill (stacks up to 5).',
    classId: 'paladin', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'mind', delta: 2, duration: 3, stacking: true },
    },
  },
  aegis: {
    id: 'aegis',
    name: 'Aegis',
    description: '+3 Defense while below 40% HP.',
    classId: 'paladin', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.4 },
      action: { kind: 'gainStat', stat: 'defense', delta: 3 },
    },
  },

  // Hunter
  pack_tactics: {
    id: 'pack_tactics',
    name: 'Pack Tactics',
    description: '+1 Speed for 2 turns on kill (stacks up to 5).',
    classId: 'hunter', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'speed', delta: 1, duration: 2, stacking: true },
    },
  },
  killer_instinct: {
    id: 'killer_instinct',
    name: 'Killer Instinct',
    description: '+2 Attack for 2 turns on crit (stacks up to 5).',
    classId: 'hunter', tier: 'l10',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: { kind: 'gainStat', stat: 'attack', delta: 2, duration: 2, stacking: true },
    },
  },
```

Then update `CLASS_PERK_TIERS`:

```ts
export const CLASS_PERK_TIERS: Record<ClassId, { readonly l5: readonly PerkId[]; readonly l10: readonly PerkId[] }> = {
  knight:    { l5: ['iron_will', 'resolute'],       l10: ['unbreakable', 'last_stand'] },
  archer:    { l5: ['precise', 'eagle_eye'],         l10: ['eagles_mark', 'first_strike'] },
  priest:    { l5: ['devout', 'steadfast'],          l10: ['sanctity', 'holy_vigor'] },
  barbarian: { l5: ['berserker', 'tough_skin'],      l10: ['rampage', 'bloodlust'] },
  rogue:     { l5: ['lethal', 'evasive'],            l10: ['backstab', 'phantom'] },
  mage:      { l5: ['arcane_power', 'quick_cast'],   l10: ['spellweaver', 'arcane_surge'] },
  paladin:   { l5: ['righteous', 'vindicator'],      l10: ['crusader', 'aegis'] },
  hunter:    { l5: ['beastmaster', 'sharpshooter'],  l10: ['pack_tactics', 'killer_instinct'] },
};
```

**On the marked damageBonus parameterization:** there are two perks applying `marked` with different damageBonus values (eagles_mark=0.25, arcane_surge=0.5). The `applyStatus` action must carry the damageBonus payload to differentiate. Pick during Task 6 implementation between (a) discriminated-by-statusId or (b) generic `payload?` field. The PerkDef literals here use the same shape — adjust at this step to fit the implemented payload type.

Suggested payload-field approach in PerkDef literals:

```ts
action: {
  kind: 'applyStatus',
  statusId: 'marked',
  duration: 3,
  target: 'other',
  payload: { damageBonus: 0.25 },  // pass through into synthesizeStatusEffect
}
```

And `synthesizeStatusEffect` reads `payload?.damageBonus`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/data/__tests__/perks.test.ts && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/types.ts src/data/perks.ts src/data/__tests__/perks.test.ts src/combat/perk_hooks.ts
git commit -m "$(cat <<'EOF'
Add 16 L10 perks across 8 classes

Trigger distribution: onCrit x4, onKill x4, onStruck x2, firstAttack x2,
whenBelowHp x4. Snowball perks (Rampage, Spellweaver, Crusader,
Pack Tactics, Killer Instinct) all stacking with shared STACK_CAP=5.

PerkAction.applyStatus carries a payload field for status-specific
parameters (e.g., marked damageBonus differs between Eagle's Mark and
Arcane Surge).
EOF
)"
```

---

## Task 14: Integration tests — onCrit perks (Eagle's Mark, Phantom, Arcane Surge, Killer Instinct)

**Files:**
- Modify: `src/combat/__tests__/perks_integration.test.ts`

- [ ] **Step 1: Write tests for each of the 4 onCrit perks**

```ts
describe("Eagle's Mark (Archer onCrit → marked target, +25% damage taken)", () => {
  it('applies marked status to the target on crit', () => {
    // Setup: Archer with pickedPerks:['eagles_mark'], 100% crit.
    // After first attack, target.statuses.marked is set.
    // Subsequent damage to the target is +25%.
  });
});

describe('Phantom (Rogue onCrit → +20 Dodge self, 2 turns)', () => {
  it('grants Dodge buff on crit', () => {
    // Setup: Rogue with phantom, 100% crit.
    // After first attack: a duration-2 stack of +20 dodge on Rogue.
  });
});

describe('Arcane Surge (Mage onCrit → marked target, +50% damage taken)', () => {
  it('applies marked with damageBonus=0.5 (distinct from Eagle\'s Mark)', () => {
    // ...
  });
});

describe('Killer Instinct (Hunter onCrit → +2 Attack self, 2 turns, stacking)', () => {
  it('stacks attack buffs on crit', () => {
    // 3 crits → 3 stacks → +6 effective attack.
  });
});
```

(Full setup helpers from `src/combat/__tests__/helpers.ts` — read once before authoring.)

- [ ] **Step 2: Tests pass (everything already wired)**

Run: `npx vitest run src/combat/__tests__/perks_integration.test.ts`
Expected: PASS — wiring from Tasks 6-13 covers these.

- [ ] **Step 3: Commit**

```bash
git add src/combat/__tests__/perks_integration.test.ts
git commit -m "Integration tests — onCrit perks (Eagle's Mark, Phantom, Arcane Surge, Killer Instinct)"
```

---

## Task 15: Integration tests — onKill perks (Rampage, Spellweaver, Crusader, Pack Tactics)

**Files:**
- Modify: `src/combat/__tests__/perks_integration.test.ts`

- [ ] **Step 1: Write tests**

```ts
describe('Rampage (Barbarian onKill → +2 Attack, 3 turns, stacking)', () => {
  it('builds stacks across multiple kills', () => {
    // Kill 3 enemies. Verify 3 stacks of +attack.
  });

  it('decays old stacks first when timers run out', () => {
    // Kill 2 (stacks A=t3, B=t3), wait a turn (A=t2, B=t2), wait another (t1, t1),
    // wait another (expired both). At-cap refresh-all not tested here (Task 12 covers).
  });
});

describe('Spellweaver (Mage onKill → +2 Mind, 3 turns, stacking)', () => {
  // Symmetric to Rampage with mind stat.
});

describe('Crusader (Paladin onKill → +2 Mind, 3 turns, stacking)', () => {
  // Same effect as Spellweaver, distinct class.
});

describe('Pack Tactics (Hunter onKill → +1 Speed, 2 turns, stacking)', () => {
  it('grants speed stacks; affects turn order', () => {
    // After 2 kills, Hunter goes earlier in initiative.
  });
});
```

- [ ] **Step 2: Tests pass**

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/combat/__tests__/perks_integration.test.ts
git commit -m "Integration tests — onKill perks (Rampage, Spellweaver, Crusader, Pack Tactics)"
```

---

## Task 16: Integration tests — onStruck perks (Unbreakable, Holy Vigor)

**Files:**
- Modify: `src/combat/__tests__/perks_integration.test.ts`

- [ ] **Step 1: Write tests**

```ts
describe('Unbreakable (Knight onStruck whenAtFullHp → 0.5 damageMitigation)', () => {
  it('halves damage on a full-HP hit', () => {
    // Damage X → applied X*0.5 (then defense).
  });

  it('does NOT halve damage when not at full HP', () => {
    // After first hit drops HP, second hit applies full damage.
  });

  it('triggers again after a full heal', () => {
    // Knight gets full-heal (or starts full). First hit halved. Heal back. Next hit halved again.
  });
});

describe('Holy Vigor (Priest onStruck → regen self, 3 turns)', () => {
  it('applies regen status on every hit', () => {
    // First hit applies regen. Second hit refreshes (statuses.regen.remainingTurns reset to 3).
  });

  it('regen heals 5/turn while active', () => {
    // After taking damage, advance a round. Priest HP +5.
  });
});
```

- [ ] **Step 2: Tests pass**

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/combat/__tests__/perks_integration.test.ts
git commit -m "Integration tests — onStruck perks (Unbreakable, Holy Vigor)"
```

---

## Task 17: Integration tests — firstAttack perks (First Strike, Backstab)

**Files:**
- Modify: `src/combat/__tests__/perks_integration.test.ts`

- [ ] **Step 1: Write tests**

```ts
describe('First Strike (Archer firstAttack → 2.0 damageMod)', () => {
  it("doubles damage on Archer's first attack only", () => {
    // First attack: 2x. Second attack: 1x.
  });

  it('resets between combats', () => {
    // Run combat 1: first attack doubled.
    // Run combat 2 (same hero, new resolveCombat call): first attack doubled again.
  });
});

describe('Backstab (Rogue firstAttack → 2.5 damageMod)', () => {
  it("multiplies Rogue's first attack damage by 2.5", () => {
    // ...
  });

  it('does not stack with First Strike if a hero somehow had both', () => {
    // Defensive: a single hero with two firstAttack perks should apply both multipliers
    // (since pendingDamageMod is multiplicative). Verify expected behavior.
  });
});
```

- [ ] **Step 2: Tests pass**

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/combat/__tests__/perks_integration.test.ts
git commit -m "Integration tests — firstAttack perks (First Strike, Backstab)"
```

---

## Task 18: Integration tests — whenBelowHp perks (Last Stand, Sanctity, Bloodlust, Aegis)

**Files:**
- Modify: `src/combat/__tests__/perks_integration.test.ts`

- [ ] **Step 1: Write tests**

```ts
describe('Last Stand (Knight whenBelowHp 0.3 → +4 Defense)', () => {
  it('applies +4 defense aura at HP < 30%', () => {});
  it('removes aura when healed above 30%', () => {});
});

describe('Sanctity (Priest whenBelowHp 0.5 → +4 Mind)', () => {
  it('applies +4 mind aura at HP < 50%', () => {});
  it('makes Mend heal more while active', () => {});
});

describe('Bloodlust (Barbarian whenBelowHp 0.5 → +4 Attack)', () => {
  it('applies +4 attack aura at HP < 50%', () => {});
});

describe('Aegis (Paladin whenBelowHp 0.4 → +3 Defense)', () => {
  it('applies +3 defense aura at HP < 40%', () => {});
});

describe('multiple whenBelowHp perks coexist', () => {
  it('Sanctity (0.5) active and Last Stand (0.3) inactive at 40% HP', () => {
    // Defensive cross-perk check.
  });
});
```

- [ ] **Step 2: Tests pass**

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/combat/__tests__/perks_integration.test.ts
git commit -m "Integration tests — whenBelowHp perks (Last Stand, Sanctity, Bloodlust, Aegis)"
```

---

## Task 19: Perk-pick UI handles multiple pending tiers (FIFO)

**Files:**
- Modify: `src/scenes/perk_overlay_scene.ts`
- Possibly: smoke test (no automated UI test required if the scene is large; manual smoke is fine)

- [ ] **Step 1: Read the existing scene**

Read `src/scenes/perk_overlay_scene.ts`. Understand how it currently:
- Gets invoked (presumably when `hero.pendingPerk` was true — now `hero.pendingPerks.length > 0`).
- Sources its perk-choice list (currently `CLASS_PERK_PAIRS[classId]`, now needs `CLASS_PERK_TIERS[classId][hero.pendingPerks[0]]`).
- Closes (calls `applyPerk`).

- [ ] **Step 2: Update tier resolution**

The "current pending tier" is `hero.pendingPerks[0]` (FIFO). Use it to:
1. Fetch the choice list: `CLASS_PERK_TIERS[hero.classId][hero.pendingPerks[0]]`.
2. Display the title accordingly: "Choose your Level 5 perk" vs "Choose your Level 10 perk".

After the player picks, `applyPerk` already shifts the oldest tier off (Task 2). If `hero.pendingPerks.length > 0` after pick, the scene either:
- Closes and re-opens for the next tier (simpler), OR
- Refreshes its choice list with the next tier in-place (smoother UX).

Recommended: close-and-reopen. The "pending perk" badge/CTA in the camp scene will re-show the indicator; player clicks again. Same UX as if a second perk became pending later.

- [ ] **Step 3: Smoke test manually**

Run the dev server (`npm run dev`), boot a save, level a hero to L10 (use Training Grounds for fast leveling), verify both perks become pickable and the UI flows from L5 pick → L10 pick.

If a save with a pre-L10 hero is not handy: spawn a fresh game with the Tavern pre-leveled feature at L3 + Training Grounds passive XP from the existing roster.

(No automated test required since the scene is rendering Phaser objects — running scenes in Vitest requires the Phaser stub harness, which doesn't exist for this scene per CLAUDE.md's Phaser firewall.)

- [ ] **Step 4: Commit**

```bash
git add src/scenes/perk_overlay_scene.ts
git commit -m "Perk overlay: handle FIFO of multiple pending perk tiers"
```

---

## Wrap-up

After Task 19, run the full suite one more time:

```bash
npm test && npm run build
```

Expected: all tests pass; build clean.

Verify decisions from spec Section "Out of scope" are still out: no Epic/Legendary tier work landed, no L10 milestone wired (that's sister Spec D · 9), no balance retuning of L5 perks or enemies.

Move TODO entry `Cluster D · 7` to HISTORY.md following the project convention (slim template per memory: Why / Decisions / Surprises / Source).

Stage and commit any miscellaneous test/file ripple touched along the way.

---

## Self-review notes

- Spec coverage spot-check: every section of the spec maps to one or more tasks:
  - XP curve & MAX_LEVEL: Task 5
  - Hero schema: Task 2
  - PerkDef extension + 5×5 palette: Tasks 1, 6
  - Combat-resolver fire-sites: Tasks 7-11
  - 16 L10 perks: Task 13
  - Save migration: Task 4
  - UI multi-pending FIFO: Task 19
  - Testing strategy (unit + integration per trigger): Tasks 1, 5, 6, 12, 14-18
  - Out-of-scope sister specs: explicitly out of all tasks (referenced in plan header)
- Type consistency: `pendingPerks` / `pickedPerks` / `tier` field naming is used consistently across tasks. `Combatant.firstAttackFiredPerkIds` and `Combatant.pendingDamageMod` introduced in Tasks 3 and 10 are consumed where expected.
- Known mid-implementation decisions flagged in-task:
  - `PerkAction.applyStatus` payload shape (discriminated-by-statusId vs. generic `payload?` field) — Task 6, finalized at Task 13.
  - `firePerkTrigger`'s extraFilter/actionFilter shape — Task 8, may refactor during Task 7's onCrit wiring.
