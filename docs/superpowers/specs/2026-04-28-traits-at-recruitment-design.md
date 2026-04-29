# Traits at Recruitment

**Status:** Design · **Date:** 2026-04-28 · **Source:** [`TODO.md`](../../../TODO.md) Cluster A · 6 — gdd §3 + §10 Tier 2.

## Purpose

Bring the per-hero trait pool from 6 to 12 entries so Tavern rolls produce more visibly distinct heroes, including some with real flaws. The trait scaffolding (data, types, application points, save persistence) is already in place from earlier recruitment / combat work — this task is mostly content plus two narrow type widenings to support a new condition kind and a wider stat range.

## Dependencies and invariants

**Vocabulary already in place:**
- `Hero.traitId: TraitId` is required on every hero (`src/heroes/hero.ts:17`). Created via `createHero(classId, name, id, traitId, bodySpriteId)`.
- `TRAITS: Record<TraitId, TraitDef>` map in `src/data/traits.ts` currently holds 6 entries: `stout`, `quick`, `sturdy`, `sharp_eyed`, `cowardly`, `nervous`.
- `TraitDef` shape (`src/data/types.ts:265-271`):
  - `hpEffect?: { delta: number; mode: 'flat' | 'percent' }`
  - `statEffects?: readonly TraitStatEffect[]`
- `computeMaxHp` in `src/heroes/hero.ts` applies `hpEffect` to class base HP at hero-creation time.
- `getEffectiveStat` in `src/combat/statuses.ts:16-35` reads `combatant.traitId`, walks `TRAITS[id].statEffects`, and adds matching deltas — gated by `evaluateTraitCondition` for conditional effects.
- `Combatant.traitId?: TraitId` exists (`src/combat/types.ts:50`) and `buildCombatState` already pipes `traitId: hero.traitId` into `createHeroCombatant` overrides (`src/run/combat_setup.ts:65`).
- `generateCandidate` / `generateCandidates` / `generateStarterRoster` (`src/camp/buildings/tavern.ts`) all roll via `rng.pick(Object.keys(TRAITS) as TraitId[])` — adding entries to `TRAITS` is automatically reflected in the roll pool.

**Invariants this spec declares:**
- **Trait IDs are append-only.** Adding new IDs is safe; renaming or removing an existing ID would orphan saved heroes (their `traitId` would no longer resolve in `TRAITS[id]`). Pre-launch policy still applies — schema stays at 1, no migration needed for additive trait IDs.
- **Trait stat effects only target non-HP buffable stats.** `hpEffect` is the sole channel for HP modifications; `statEffects` covers attack / defense / speed / mind / crit / dodge.
- **Conditions evaluate at stat-lookup time.** `getEffectiveStat` is called fresh for every ability resolution, so conditions like "below 50% HP" activate dynamically as combat state changes. No need to pre-bake or cache.
- **`belowHpRatio` uses strict less-than.** At exactly the boundary ratio, the condition is false. Test pins this.

## Module layout

| Path | Action | Responsibility |
|---|---|---|
| `src/data/types.ts` | **Modify** | Extend `TraitId` union with 6 new IDs; widen `TraitStatEffect.stat`; convert `TraitCondition` to discriminated union with new `belowHpRatio` variant. |
| `src/data/traits.ts` | **Modify** | Add 6 new `TraitDef` entries: `lucky`, `slippery`, `wise`, `frail`, `sluggish`, `bloodthirsty`. |
| `src/combat/statuses.ts` | **Modify** | Extend `evaluateTraitCondition` switch to handle `belowHpRatio`. |
| `src/data/__tests__/traits.test.ts` | **Modify** | Expand `EXPECTED_IDS`; loosen "stat must be attack/defense/speed" assertion to cover 6 stats; add condition-shape coverage. |
| `src/combat/__tests__/statuses.test.ts` | **Modify** | Add 4 new cases — Lucky stat-delta on `crit`, Bloodthirsty active / inactive / boundary. |
| `src/camp/buildings/__tests__/tavern.test.ts` | **Modify** | Extend the Stout-vs-others maxHp test to special-case Frail (maxHp < classBaseHp). |

No changes to scenes, save format, migration code, `createHero`, or `buildCombatState`.

## Schema changes

### `TraitId` (`data/types.ts`)

```ts
export type TraitId =
  | 'stout'
  | 'quick'
  | 'sturdy'
  | 'sharp_eyed'
  | 'cowardly'
  | 'nervous'
  | 'lucky'
  | 'slippery'
  | 'wise'
  | 'frail'
  | 'sluggish'
  | 'bloodthirsty';
```

### `TraitStatEffect.stat` (`data/types.ts`)

Widen from `'attack' | 'defense' | 'speed'` to:

```ts
export interface TraitStatEffect {
  stat: 'attack' | 'defense' | 'speed' | 'mind' | 'crit' | 'dodge';
  delta: number;
  condition?: TraitCondition;
}
```

`hp` remains excluded — HP modifications go through `hpEffect`.

### `TraitCondition` (`data/types.ts`)

Convert from a single object type to a discriminated union:

```ts
export type TraitCondition =
  | { kind: 'inSlot'; slot: SlotIndex }
  | { kind: 'belowHpRatio'; ratio: number };
```

`ratio` is a `0..1` fraction. Strict `<` semantics — at exactly `ratio`, the condition is false.

## Behavior

### Trait roster

Six new entries in `TRAITS`:

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
bloodthirsty: {
  id: 'bloodthirsty',
  name: 'Bloodthirsty',
  description: '+2 Attack when below 50% HP',
  statEffects: [{ stat: 'attack', delta: 2, condition: { kind: 'belowHpRatio', ratio: 0.5 } }],
},
```

Note that crit and dodge are stored as integer percent (e.g., Knight's `crit: 5` is 5%), so Lucky's `delta: 5` produces a +5-percentage-point effect.

### `evaluateTraitCondition` extension

In `src/combat/statuses.ts`, the switch gains one case:

```ts
case 'belowHpRatio':
  return combatant.maxHp > 0 && combatant.currentHp / combatant.maxHp < condition.ratio;
```

The `maxHp > 0` guard is defensive — combatants always have positive maxHp in normal play — but cheap and rules out a divide-by-zero on a malformed Combatant.

### Roll behavior — unchanged

`generateCandidate` continues to use `rng.pick(Object.keys(TRAITS) as TraitId[])` — uniform across all 12 traits. Rare-trait weighting (gdd §6 mentions Tavern L3: "better trait odds") is a Tier 3 building-upgrade concern and out of scope here.

### Save behavior — no change

Adding new trait IDs is purely additive: `traitId` is already a required field on saved heroes, the new IDs are valid `TraitId` strings, and pre-launch policy keeps the save schema pinned at 1. No migration code is needed. Saved heroes carry whichever trait was rolled when they were recruited; rolls of new trait IDs only occur for heroes recruited after the update lands.

### Combat behavior — Bloodthirsty mid-combat

Because `getEffectiveStat` is recomputed on every lookup, Bloodthirsty's +2 Attack activates dynamically as a hero takes damage and crosses the 50% HP threshold. It also deactivates if the hero is healed back above 50%. This is the intended behavior, consistent with how `inSlot` reflects current slot rather than starting slot.

## Tests

### `src/data/__tests__/traits.test.ts` — modify

1. Expand `EXPECTED_IDS` to include all 12 trait IDs.
2. Loosen `every statEffect targets attack/defense/speed only` to allow `'attack' | 'defense' | 'speed' | 'mind' | 'crit' | 'dodge'`.
3. Add a new case: every `statEffect.condition`, when present, has a `kind` of `'inSlot'` or `'belowHpRatio'`.

The existing `describe.each(EXPECTED_IDS)` loop automatically picks up the new IDs for shape checks (id field, non-empty description, has-effect).

### `src/combat/__tests__/statuses.test.ts` — modify

Add four cases under the existing trait describe block:

1. **Lucky** — `getEffectiveStat(c, 'crit')` returns `c.baseStats.crit + 5` for a combatant with `traitId: 'lucky'`. (Proves the `crit` widening works end-to-end.)
2. **Bloodthirsty active** — `getEffectiveStat(c, 'attack')` returns `c.baseStats.attack + 2` for a combatant with `traitId: 'bloodthirsty'`, constructed with `maxHp: 20, currentHp: 9` (45%, clearly below).
3. **Bloodthirsty inactive** — same hero at full HP returns `c.baseStats.attack` (no bonus).
4. **Bloodthirsty boundary** — combatant with `maxHp: 20, currentHp: 10` (exactly 50%) does not get the bonus. Documents strict `<` semantics. (Construct the combatant directly via `createHeroCombatant` overrides to pin both fields rather than relying on a class's natural HP, which may be odd.)

### `src/camp/buildings/__tests__/tavern.test.ts` — modify

The existing test `'Stout candidates have maxHp > classBaseHp; others equal class base'` (lines 65-77) now needs to handle Frail. Refactor to:

- `traitId === 'stout'` → `maxHp > classBase`
- `traitId === 'frail'` → `maxHp < classBase`
- otherwise → `maxHp === classBase`

Rename the test to `'maxHp matches trait HP effect for stout / frail / others'`.

## Out of scope

- **Trait display in Tavern / Barracks / hero card** — Cluster B · 7. Trait names and descriptions exist in `TraitDef` already; UI consumes them when that task lands.
- **Rare-trait weighting** — Tier 3 Tavern L3 upgrade.
- **Trait removal (Chapel)** — Tier 3.
- **Race / gender body-sprite influence on trait rolls** — out of scope; rolls remain uniform.
- **Persistent trait modifications** (e.g., a perk that rerolls a trait, or a wound that suppresses one) — none planned for Tier 2.

## Surprises / call-outs

- **Bloodthirsty value tuned to +2, not +1.** Conditional gating costs ~half the effect's uptime, so +2 with the condition lands roughly equivalent in expected value to a flat +1 — but with much higher variance and "comeback" feel. If playtesting shows it's swingy in a bad way, drop to +1 in `data/traits.ts` (no other code changes needed).
- **Frail does not need engine changes.** Negative `delta` in `hpEffect` works through the existing `computeMaxHp` arithmetic; the test suite's only assumption that breaks is the Stout-vs-others tavern test, hence its update.
- **No new condition kinds beyond `belowHpRatio`.** If future traits want HP-above conditions, ally-count conditions, etc., extend `TraitCondition` then. YAGNI for now.
