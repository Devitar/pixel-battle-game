# Wounds system

**Source:** TODO Cluster A task 3
**Tier:** 2 (gdd §7 + §10)

## Goal

Implement Wounds as a Tier-2 drip cost. A wound is a persistent stat-debuff (or damage-taken multiplier) attached to a `Hero` that survives across combats and runs. Triggered by heavy hits or crits during combat. Heals at the Hospital (gold) or passively over N runs. This task ships everything pure-TS — wound data, trigger logic, save persistence, end-of-run tick, treat-wound operation. The Hospital UI is Cluster B task 1.

## Decisions

### 1. Trigger

In `applyDamage` (`src/combat/effects.ts`), AFTER damage_applied event is pushed AND only when `target.kind === 'hero'` AND `!lethal`:

```
isHeavyHit = amplified >= target.maxHp * 0.30
if (isHeavyHit || wasCrit) and rng.percent(30):
  woundId = rng.pick(WOUND_IDS)
  events.push({ kind: 'wound_inflicted', combatantId: target.id, woundId })
```

Heavy hit threshold: 30% of target's maxHp in a single hit.
Wound chance: 30%.
Crit hits ALWAYS qualify regardless of damage size (a clean head crit can wound even when light).
Wounds are emitted as events during combat; the post-combat handler walks events and mutates `Hero.wounds`.

### 2. Wound types

Six wounds, in `src/data/wounds.ts`:

| WoundId | Display name | Effect |
|---|---|---|
| `bruised` | Bruised | +20% damage taken (multiplier) |
| `hobbled` | Hobbled | −2 Speed (statDelta) |
| `concussed` | Concussed | −2 Mind (statDelta) |
| `winded` | Winded | −2 Attack (statDelta) |
| `unsteady` | Unsteady | −5 Crit (statDelta) |
| `broken_bone` | Broken Bone | −10 max HP (statDelta on hp) |

Stack additively. 2 × Bruised = +40% damage taken; 2 × Winded = −4 Attack.

Random pick on trigger — feature, not bug. A Knight rolling Concussed (-Mind, useless to them) is part of "luck of the draw" + Hospital decision pressure ("treat or live with it?").

### 3. Wound effect data shape

```ts
export type WoundEffect =
  | { kind: 'statDelta'; stat: BuffableStat; delta: number }
  | { kind: 'damageTakenMult'; multiplier: number };

export interface WoundDef {
  id: WoundId;
  name: string;
  effect: WoundEffect;
}

export const WOUNDS: Record<WoundId, WoundDef> = { ... };
export const WOUND_IDS: readonly WoundId[] = Object.keys(WOUNDS) as WoundId[];
```

### 4. Hero shape change

```ts
export interface Hero {
  // ...existing fields...
  wounds: Wound[];
}

export interface Wound {
  id: WoundId;
  runsRemaining: number;  // ticks down each run end; 0 = auto-removed
}
```

Default `runsRemaining: 5` when a new wound is applied.

### 5. Combat-build integration

`buildCombatState` (`src/run/combat_setup.ts`) walks `hero.wounds` and applies effects to the resulting `Combatant`:

- For `statDelta` wounds: subtract from `combatant.baseStats[stat]`. For `stat === 'hp'`, reduces both `baseStats.hp` AND `maxHp` AND clamps `currentHp` to new max.
- For `damageTakenMult` wounds: sum `multiplier - 1` deltas, store on new `Combatant.damageTakenMultiplier?: number` field. Default 1.0.

`Combatant.damageTakenMultiplier?: number` is a new optional field. `applyDamage` reads it after the existing exhaustion amplification:

```ts
const amplified = exhaustion-amplify(final);
const wounded = target.damageTakenMultiplier !== undefined
  ? Math.max(1, Math.round(amplified * target.damageTakenMultiplier))
  : amplified;
target.currentHp -= wounded;
```

Cap at floor of 1 like the existing `final` calc.

### 6. Combat resolver — `wound_inflicted` event

New `CombatEvent` variant:

```ts
| { kind: 'wound_inflicted'; combatantId: CombatantId; woundId: WoundId }
```

Emitted during `applyDamage` per §1. Combat playback (Phaser side, deferred to a small follow-up) can show a "Wounded!" floater. For this Tier 2 task, just emit the event — no playback handler change required (tests verify event presence).

### 7. Post-combat handler

After `resolveCombat` returns, the handler that finalizes results (likely in `run/combat_setup.ts` or `dungeon/encounter.ts`) walks `result.events` for `wound_inflicted` events and applies them to the corresponding `Hero` in `runState.party`.

```ts
function applyWoundEvents(party: Hero[], events: readonly CombatEvent[]): Hero[] {
  return party.map((hero, idx) => {
    const heroId = `p${idx}`;
    const newWounds: Wound[] = events
      .filter((e): e is Extract<CombatEvent, { kind: 'wound_inflicted' }> =>
        e.kind === 'wound_inflicted' && e.combatantId === heroId)
      .map((e) => ({ id: e.woundId, runsRemaining: 5 }));
    if (newWounds.length === 0) return hero;
    return { ...hero, wounds: [...hero.wounds, ...newWounds] };
  });
}
```

The exact call site lands at implementation — wherever `runState.party` is updated post-combat.

### 8. End-of-run tick

In both `cashout` and `wipe` paths (`src/run/run_state.ts`), tick wounds on **all surviving roster heroes** (party returnees + benched). Decrement `runsRemaining`; remove wounds at 0.

```ts
function tickWound(wound: Wound): Wound | null {
  const next = wound.runsRemaining - 1;
  return next <= 0 ? null : { ...wound, runsRemaining: next };
}

function tickRosterWounds(roster: Roster): Roster {
  return {
    ...roster,
    heroes: roster.heroes.map((h) => ({
      ...h,
      wounds: h.wounds.map(tickWound).filter((w): w is Wound => w !== null),
    })),
  };
}
```

Lives in `src/camp/roster.ts` (alongside other roster operations) or `src/data/wounds.ts`. Preference: `roster.ts` since it operates on Roster, not Wound primitives.

The call site is wherever cashout/wipe commits results to the camp roster — likely the camp_screen scene's handler. Implementation will identify the exact spot.

### 9. Treat-wound operation

```ts
// in src/camp/roster.ts (or src/data/wounds.ts)
export const HOSPITAL_TREATMENT_COST = 40;

export function treatWound(hero: Hero, woundIndex: number): Hero {
  if (woundIndex < 0 || woundIndex >= hero.wounds.length) {
    throw new Error(`treatWound: invalid index ${woundIndex}`);
  }
  return {
    ...hero,
    wounds: hero.wounds.filter((_, i) => i !== woundIndex),
  };
}
```

The Hospital UI (Cluster B task 1) will:
1. Read `hero.wounds` to display
2. Call `treatWound(hero, index)` and deduct `HOSPITAL_TREATMENT_COST` gold from vault via `appState.update`

Out of scope here.

### 10. Save schema

Per durable preference: asked. User picked **B (backfill via migration)** — not the bump-and-discard pattern, because the change is purely additive (`wounds: Wound[]`) and the empty-state has a trivial default (`[]`).

Implementation: bump `CURRENT_SCHEMA_VERSION` 5 → 6. Register `MIGRATIONS[5]`:

```ts
5: (raw) => {
  const next = { ...raw, version: 6 } as Record<string, unknown>;
  if (next.roster && typeof next.roster === 'object') {
    const roster = next.roster as { heroes?: unknown[] };
    if (Array.isArray(roster.heroes)) {
      roster.heroes = roster.heroes.map((h) => {
        const hero = h as Record<string, unknown>;
        return { ...hero, wounds: hero.wounds ?? [] };
      });
    }
  }
  return next;
},
```

Old v5 saves get `wounds: []` on every hero. No data lost.

### 11. Tests

- `src/data/__tests__/wounds.test.ts` (new) — `WOUNDS` registry shape, `WOUND_IDS` covers all variants, each wound has a defined effect.
- `src/combat/__tests__/effects.test.ts` — `wound_inflicted` event:
  - Heavy hit (≥30% maxHp) on hero rolls wound chance.
  - Crit (regardless of damage) rolls wound chance.
  - Light non-crit hit does NOT roll.
  - Hits on enemies never roll wounds.
  - Lethal hits do NOT roll wounds (dead heroes can't be wounded).
  - With wound chance 100% (mock rng.percent → true), event fires deterministically.
- `src/run/__tests__/combat_setup.test.ts` — `buildCombatState` applies hero.wounds:
  - statDelta wound reduces the corresponding stat.
  - bruised wound sets `damageTakenMultiplier` to 1.20; 2 bruises → 1.40.
  - broken_bone reduces both `baseStats.hp` AND `maxHp` AND clamps `currentHp`.
- `src/combat/__tests__/effects.test.ts` — `damageTakenMultiplier` math:
  - Damage applied to bruised target = round(normal_damage × 1.20), floor of 1.
  - No multiplier (undefined) means damage unchanged.
- `src/camp/__tests__/roster.test.ts` (extend if exists, else create) — `tickRosterWounds`:
  - Wounds with `runsRemaining > 1` decrement.
  - Wounds with `runsRemaining === 1` are removed.
- `src/save/__tests__/migration.test.ts` — v5 → v6 migration adds `wounds: []` to each hero.

### 12. Out of scope

- **Hospital UI** (Cluster B task 1) — visual treatment flow.
- **Wound display in hero card** (Cluster B task 9) — surfacing wounds in Barracks / hero panels.
- **Wound floater in combat playback** ("Wounded!" text) — small Phaser-side polish; can ship with the Hospital UI work or as a tiny standalone change.
- **Mid-combat wound math** — wounds are baked into Combatant at build time. They don't change mid-combat. A wound applied DURING combat doesn't affect that combat's stats; it lives on Hero.wounds for next combat.
- **Wound-tier scaling** (e.g., Severe vs Minor variants). Single severity per wound type for Tier 2.
- **Trait/perk interactions** that prevent wounds. Tier 2 polish.

## Manual acceptance

1. Run an existing v5 save through the migration (boot the dev server). Verify console shows no errors and `localStorage['pixel-battle-game/save']` shows `version: 6` with `wounds: []` on every roster hero.
2. Enter a combat. Take a heavy hit on a hero (e.g., let an enemy whale on a Priest). After ~3-4 heavy hits or crits, a `wound_inflicted` event fires (verify via console log or event inspector).
3. Check `appState.get().runState.party[heroIdx].wounds` after the combat ends. New wound should appear with `runsRemaining: 5`.
4. Enter another combat. Verify the wounded hero's effective stats are reduced (e.g., a Winded Knight's effective Attack is 4 - 2 = 2).
5. Cashout. Verify the wound's `runsRemaining` decreased by 1.
6. Run-cycle five times without treatment. Wound should auto-clear.
7. Manually call `treatWound(hero, 0)` via dev console. Wound removed.
