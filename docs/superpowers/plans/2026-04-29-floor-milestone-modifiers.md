# Floor-Milestone Enemy Modifiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three enemy modifiers — **Armored** (+2 defense), **Venomous** (poison-on-hit), **Enraged** (+3 attack at <50% HP) — that stamp on individual enemy combatants. Floor-milestone unlock for combat encounters (5 / 10 / 15); elites always carry one from the full pool regardless of floor; bosses are unmodified.

**Architecture:** Six sequential tasks, each landing a green test suite and one commit.

1. `data/modifiers.ts` — modifier definitions (types, MODIFIERS table, MODIFIER_IDS).
2. `EnemyPlacement.modifierIds` + new `dungeon/modifier_stamp.ts` — encounter shape change + stamping helpers (`poolForFloor`, `stampCombatModifiers`, `stampEliteModifiers`).
3. `Combatant` type extension (4 optional fields) + Armored wiring in `combat_setup.ts` — `applyModifiersToStats` injects `+defense` into scaled enemy stats.
4. Venomous on-hit — `combat_setup.ts` sets `venomousDamage`/`venomousDuration`; `combat/effects.ts` adds the parallel-to-burning poison-application block.
5. Enraged threshold — `combat_setup.ts` sets `enragedThreshold`/`enragedAttackDelta`; `combat/statuses.ts` adds a threshold check in `getEffectiveStat` for `'attack'`.
6. `floor.ts` integration — call stampers after each combat/elite encounter; extend `floor.test.ts` for floor-milestone and elite stamping rules.

After Task 6, modifiers stamp onto encounters in the wild, combatants pick up modifier-derived effects, and combat resolution applies them per-modifier-kind.

**Tech Stack:** TypeScript, Vitest. No Phaser imports under `src/dungeon/`, `src/data/`, `src/combat/`, `src/run/`.

**Spec:** `docs/superpowers/specs/2026-04-29-floor-milestone-modifiers-design.md`. Read it before starting.

**Naming-clash note:** `'enraged'` is already in the `StatusId` type (used by Barbarian's Rampage as a self-debuff). Our new **modifier** named `'enraged'` is unrelated — it stores `enragedThreshold` / `enragedAttackDelta` directly on `Combatant` and is never written to `combatant.statuses`. The string lives in two namespaces (`ModifierId` and `StatusId`) but they don't collide at runtime.

**Numerical knobs (from spec §2):**

- Armored: `+2 defense`
- Venomous: `2 dmg/turn × 2 turns` poison
- Enraged: `<50% HP → +3 attack`
- Milestone floors: 5 (Armored), 10 (Venomous), 15 (Enraged)

---

## Task 1: `data/modifiers.ts` — modifier definitions

Define the modifier types, the `MODIFIERS` table, and `MODIFIER_IDS`. Pure data addition; no behavior wiring yet.

**Files:**
- Create: `src/data/modifiers.ts`
- Create: `src/data/__tests__/modifiers.test.ts`

- [ ] **Step 1.1: Write the failing test file**

Create `src/data/__tests__/modifiers.test.ts` with this exact content:

```typescript
import { describe, expect, it } from 'vitest';
import { MODIFIERS, MODIFIER_IDS } from '../modifiers';

describe('MODIFIERS table', () => {
  it('armored has statDelta defense +2', () => {
    expect(MODIFIERS.armored.id).toBe('armored');
    expect(MODIFIERS.armored.name).toBe('Armored');
    expect(MODIFIERS.armored.effect).toEqual({
      kind: 'statDelta',
      stat: 'defense',
      delta: 2,
    });
  });

  it('venomous has venomous_on_hit 2 dmg × 2 turns', () => {
    expect(MODIFIERS.venomous.id).toBe('venomous');
    expect(MODIFIERS.venomous.name).toBe('Venomous');
    expect(MODIFIERS.venomous.effect).toEqual({
      kind: 'venomous_on_hit',
      damagePerTurn: 2,
      duration: 2,
    });
  });

  it('enraged has enraged_threshold 0.5 / +3 attack', () => {
    expect(MODIFIERS.enraged.id).toBe('enraged');
    expect(MODIFIERS.enraged.name).toBe('Enraged');
    expect(MODIFIERS.enraged.effect).toEqual({
      kind: 'enraged_threshold',
      hpRatio: 0.5,
      attackDelta: 3,
    });
  });
});

describe('MODIFIER_IDS', () => {
  it('contains exactly the three modifier IDs', () => {
    expect(MODIFIER_IDS).toHaveLength(3);
    expect(new Set(MODIFIER_IDS)).toEqual(new Set(['armored', 'venomous', 'enraged']));
  });
});
```

- [ ] **Step 1.2: Run the test and verify it fails**

Run: `npx vitest run src/data/__tests__/modifiers.test.ts`

Expected: FAIL — `Cannot find module '../modifiers'`.

- [ ] **Step 1.3: Create the modifiers module**

Create `src/data/modifiers.ts` with this exact content:

```typescript
import type { BuffableStat } from './types';

export type ModifierId = 'armored' | 'venomous' | 'enraged';

export type ModifierEffect =
  | { kind: 'statDelta'; stat: BuffableStat; delta: number }
  | { kind: 'venomous_on_hit'; damagePerTurn: number; duration: number }
  | { kind: 'enraged_threshold'; hpRatio: number; attackDelta: number };

export interface ModifierDef {
  id: ModifierId;
  name: string;
  effect: ModifierEffect;
}

export const MODIFIERS: Record<ModifierId, ModifierDef> = {
  armored:  { id: 'armored',  name: 'Armored',  effect: { kind: 'statDelta',         stat: 'defense', delta: 2 } },
  venomous: { id: 'venomous', name: 'Venomous', effect: { kind: 'venomous_on_hit',   damagePerTurn: 2, duration: 2 } },
  enraged:  { id: 'enraged',  name: 'Enraged',  effect: { kind: 'enraged_threshold', hpRatio: 0.5, attackDelta: 3 } },
};

export const MODIFIER_IDS: readonly ModifierId[] = Object.keys(MODIFIERS) as ModifierId[];
```

- [ ] **Step 1.4: Run the test and verify it passes**

Run: `npx vitest run src/data/__tests__/modifiers.test.ts`

Expected: PASS — all 4 cases green.

- [ ] **Step 1.5: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total = baseline + 4.

- [ ] **Step 1.6: Commit**

```bash
git add src/data/modifiers.ts src/data/__tests__/modifiers.test.ts
git commit -m "feat(data): modifier definitions (Armored, Venomous, Enraged)"
```

---

## Task 2: `EnemyPlacement.modifierIds` + `modifier_stamp.ts`

Extend `EnemyPlacement` with optional `modifierIds`. Add the stamping helpers (`poolForFloor`, `fullPool`, `rollModifier`, `stampCombatModifiers`, `stampEliteModifiers`). After this task, the encounter shape is ready and stamping is callable from tests but no production code path invokes it yet.

**Files:**
- Modify: `src/dungeon/node.ts`
- Create: `src/dungeon/modifier_stamp.ts`
- Create: `src/dungeon/__tests__/modifier_stamp.test.ts`

- [ ] **Step 2.1: Extend `EnemyPlacement`**

Open `src/dungeon/node.ts`. Find the existing `EnemyPlacement` interface:

```ts
export interface EnemyPlacement {
  enemyId: EnemyId;
  slot: SlotIndex;
}
```

Add the import for `ModifierId` and extend the interface:

```ts
import type { EnemyId, Item, ModifierId, SlotIndex } from '../data/types';
```

Wait — `ModifierId` is exported from `src/data/modifiers.ts`, not `src/data/types.ts`. Use a separate import line:

```ts
import type { ModifierId } from '../data/modifiers';
```

Then update the interface:

```ts
export interface EnemyPlacement {
  enemyId: EnemyId;
  slot: SlotIndex;
  modifierIds?: readonly ModifierId[];
}
```

- [ ] **Step 2.2: Run tsc to confirm baseline is green**

Run: `npx tsc --noEmit && npm test`

Expected: PASS / green. The optional field doesn't break any existing code.

- [ ] **Step 2.3: Write the failing test file**

Create `src/dungeon/__tests__/modifier_stamp.test.ts` with this exact content:

```typescript
import { describe, expect, it } from 'vitest';
import { createRng } from '../../util/rng';
import type { EnemyPlacement } from '../node';
import {
  fullPool,
  poolForFloor,
  rollModifier,
  stampCombatModifiers,
  stampEliteModifiers,
} from '../modifier_stamp';

const PLACEMENTS: EnemyPlacement[] = [
  { enemyId: 'skeleton_warrior', slot: 1 },
  { enemyId: 'skeleton_archer', slot: 4 },
];

describe('poolForFloor', () => {
  it('returns [] for floors 1..4', () => {
    expect(poolForFloor(1)).toEqual([]);
    expect(poolForFloor(4)).toEqual([]);
  });

  it('returns [armored] for floors 5..9', () => {
    expect(poolForFloor(5)).toEqual(['armored']);
    expect(poolForFloor(9)).toEqual(['armored']);
  });

  it('returns [armored, venomous] for floors 10..14', () => {
    expect(poolForFloor(10)).toEqual(['armored', 'venomous']);
    expect(poolForFloor(14)).toEqual(['armored', 'venomous']);
  });

  it('returns [armored, venomous, enraged] for floor 15+', () => {
    expect(poolForFloor(15)).toEqual(['armored', 'venomous', 'enraged']);
    expect(poolForFloor(30)).toEqual(['armored', 'venomous', 'enraged']);
  });
});

describe('fullPool', () => {
  it('returns all three modifier IDs', () => {
    expect(new Set(fullPool())).toEqual(new Set(['armored', 'venomous', 'enraged']));
  });
});

describe('rollModifier', () => {
  it('returns undefined for an empty pool', () => {
    expect(rollModifier([], createRng(1))).toBeUndefined();
  });

  it('returns a member of the pool for a non-empty pool', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const result = rollModifier(['armored', 'venomous'], createRng(seed));
      expect(['armored', 'venomous']).toContain(result);
    }
  });
});

describe('stampCombatModifiers', () => {
  it('returns input enemies with no modifierIds set on floor < 5', () => {
    const result = stampCombatModifiers(PLACEMENTS, 4, createRng(1));
    expect(result).toHaveLength(PLACEMENTS.length);
    for (const p of result) {
      expect(p.modifierIds).toBeUndefined();
    }
  });

  it('on floor 5: every enemy has exactly one modifierIds entry from [armored]', () => {
    const result = stampCombatModifiers(PLACEMENTS, 5, createRng(1));
    expect(result).toHaveLength(PLACEMENTS.length);
    for (const p of result) {
      expect(p.modifierIds).toHaveLength(1);
      expect(p.modifierIds![0]).toBe('armored');
    }
  });

  it('on floor 15: every enemy has one modifierIds from the full pool (all three appear across seeds)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const result = stampCombatModifiers(PLACEMENTS, 15, createRng(seed));
      for (const p of result) {
        expect(p.modifierIds).toHaveLength(1);
        seen.add(p.modifierIds![0]);
      }
    }
    expect(seen).toEqual(new Set(['armored', 'venomous', 'enraged']));
  });

  it('determinism: same input + seed → same modifierIds', () => {
    const a = stampCombatModifiers(PLACEMENTS, 15, createRng(42));
    const b = stampCombatModifiers(PLACEMENTS, 15, createRng(42));
    expect(a).toEqual(b);
  });

  it('does not mutate the input array', () => {
    const original = [...PLACEMENTS];
    stampCombatModifiers(PLACEMENTS, 15, createRng(1));
    expect(PLACEMENTS).toEqual(original);
    for (const p of PLACEMENTS) {
      expect(p.modifierIds).toBeUndefined();
    }
  });
});

describe('stampEliteModifiers', () => {
  it('on floor 1 (any floor): every enemy has one modifierIds from the full pool (all three appear across seeds)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const result = stampEliteModifiers(PLACEMENTS, createRng(seed));
      for (const p of result) {
        expect(p.modifierIds).toHaveLength(1);
        seen.add(p.modifierIds![0]);
      }
    }
    expect(seen).toEqual(new Set(['armored', 'venomous', 'enraged']));
  });

  it('determinism: same input + seed → same modifierIds', () => {
    const a = stampEliteModifiers(PLACEMENTS, createRng(42));
    const b = stampEliteModifiers(PLACEMENTS, createRng(42));
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2.4: Run the test and verify it fails**

Run: `npx vitest run src/dungeon/__tests__/modifier_stamp.test.ts`

Expected: FAIL — `Cannot find module '../modifier_stamp'`.

- [ ] **Step 2.5: Create the stamping helper module**

Create `src/dungeon/modifier_stamp.ts` with this exact content:

```typescript
import { MODIFIER_IDS, type ModifierId } from '../data/modifiers';
import type { Rng } from '../util/rng';
import type { EnemyPlacement } from './node';

export function poolForFloor(floorNumber: number): readonly ModifierId[] {
  if (floorNumber < 5)  return [];
  if (floorNumber < 10) return ['armored'];
  if (floorNumber < 15) return ['armored', 'venomous'];
  return ['armored', 'venomous', 'enraged'];
}

export function fullPool(): readonly ModifierId[] {
  return MODIFIER_IDS;
}

export function rollModifier(pool: readonly ModifierId[], rng: Rng): ModifierId | undefined {
  if (pool.length === 0) return undefined;
  return rng.pick(pool);
}

export function stampCombatModifiers(
  enemies: readonly EnemyPlacement[],
  floorNumber: number,
  rng: Rng,
): EnemyPlacement[] {
  const pool = poolForFloor(floorNumber);
  if (pool.length === 0) {
    return enemies.map((p) => ({ ...p }));
  }
  return enemies.map((p) => ({ ...p, modifierIds: [rng.pick(pool)] }));
}

export function stampEliteModifiers(
  enemies: readonly EnemyPlacement[],
  rng: Rng,
): EnemyPlacement[] {
  const pool = fullPool();
  return enemies.map((p) => ({ ...p, modifierIds: [rng.pick(pool)] }));
}
```

- [ ] **Step 2.6: Run the test and verify it passes**

Run: `npx vitest run src/dungeon/__tests__/modifier_stamp.test.ts`

Expected: PASS — all 12 cases green.

- [ ] **Step 2.7: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total = previous + 12.

- [ ] **Step 2.8: Commit**

```bash
git add src/dungeon/node.ts src/dungeon/modifier_stamp.ts src/dungeon/__tests__/modifier_stamp.test.ts
git commit -m "feat(dungeon): EnemyPlacement.modifierIds + modifier stamping helpers"
```

---

## Task 3: Combatant fields + Armored wiring

Extend `Combatant` with four optional fields (`venomousDamage`, `venomousDuration`, `enragedThreshold`, `enragedAttackDelta`). All four are added now even though only Armored uses combat-resolution wiring in this task — Tasks 4 and 5 then wire venomous and enraged. Add `applyModifiersToStats` to `combat_setup.ts` for the Armored statDelta path.

**Files:**
- Modify: `src/combat/types.ts`
- Modify: `src/run/combat_setup.ts`
- Modify: `src/run/__tests__/combat_setup.test.ts`

- [ ] **Step 3.1: Extend `Combatant`**

Open `src/combat/types.ts`. Find the existing `Combatant` interface (around line 35). The current optional-passive fields:

```ts
damageTakenMultiplier?: number;
// Candidates for consolidation into a `passives` bag once 3+ more land.
lifestealPercent?: number;
thornsDamage?: number;
regenPerRound?: number;
burningWeaponDamage?: number;
isDead: boolean;
```

Add four new optional fields just before `isDead`:

```ts
damageTakenMultiplier?: number;
// Candidates for consolidation into a `passives` bag once 3+ more land.
lifestealPercent?: number;
thornsDamage?: number;
regenPerRound?: number;
burningWeaponDamage?: number;
venomousDamage?: number;
venomousDuration?: number;
enragedThreshold?: number;
enragedAttackDelta?: number;
isDead: boolean;
```

- [ ] **Step 3.2: Write the failing tests for Armored wiring**

Open `src/run/__tests__/combat_setup.test.ts`. At the bottom of the file, append a new describe block:

```typescript
describe('buildCombatState — modifierIds', () => {
  it('Armored: enemy gets baseStats.defense = scaled defense + 2', () => {
    const party = [createHero('knight', 'K', 'h0', 'quick', 'body1')];
    const enemyDef = ENEMIES.skeleton_warrior;
    const encounter: Encounter = {
      enemies: [{ enemyId: 'skeleton_warrior', slot: 1, modifierIds: ['armored'] }],
      scale: FLAT_SCALE,
    };
    const state = buildCombatState(party, encounter);
    const enemy = state.combatants.find((c) => c.id === 'e0')!;
    expect(enemy.baseStats.defense).toBe(enemyDef.baseStats.defense + 2);
  });

  it('Venomous: enemy gets venomousDamage 2 and venomousDuration 2', () => {
    const party = [createHero('knight', 'K', 'h0', 'quick', 'body1')];
    const encounter: Encounter = {
      enemies: [{ enemyId: 'skeleton_warrior', slot: 1, modifierIds: ['venomous'] }],
      scale: FLAT_SCALE,
    };
    const state = buildCombatState(party, encounter);
    const enemy = state.combatants.find((c) => c.id === 'e0')!;
    expect(enemy.venomousDamage).toBe(2);
    expect(enemy.venomousDuration).toBe(2);
  });

  it('Enraged: enemy gets enragedThreshold 0.5 and enragedAttackDelta 3', () => {
    const party = [createHero('knight', 'K', 'h0', 'quick', 'body1')];
    const encounter: Encounter = {
      enemies: [{ enemyId: 'skeleton_warrior', slot: 1, modifierIds: ['enraged'] }],
      scale: FLAT_SCALE,
    };
    const state = buildCombatState(party, encounter);
    const enemy = state.combatants.find((c) => c.id === 'e0')!;
    expect(enemy.enragedThreshold).toBe(0.5);
    expect(enemy.enragedAttackDelta).toBe(3);
  });

  it('No modifierIds: enemy has none of the modifier-derived fields set', () => {
    const party = [createHero('knight', 'K', 'h0', 'quick', 'body1')];
    const encounter: Encounter = {
      enemies: [{ enemyId: 'skeleton_warrior', slot: 1 }],
      scale: FLAT_SCALE,
    };
    const state = buildCombatState(party, encounter);
    const enemy = state.combatants.find((c) => c.id === 'e0')!;
    expect(enemy.venomousDamage).toBeUndefined();
    expect(enemy.venomousDuration).toBeUndefined();
    expect(enemy.enragedThreshold).toBeUndefined();
    expect(enemy.enragedAttackDelta).toBeUndefined();
    // No statDelta applied (defense is base).
    expect(enemy.baseStats.defense).toBe(ENEMIES.skeleton_warrior.baseStats.defense);
  });

  it('Empty modifierIds: enemy has none of the modifier-derived fields set', () => {
    const party = [createHero('knight', 'K', 'h0', 'quick', 'body1')];
    const encounter: Encounter = {
      enemies: [{ enemyId: 'skeleton_warrior', slot: 1, modifierIds: [] }],
      scale: FLAT_SCALE,
    };
    const state = buildCombatState(party, encounter);
    const enemy = state.combatants.find((c) => c.id === 'e0')!;
    expect(enemy.venomousDamage).toBeUndefined();
    expect(enemy.enragedThreshold).toBeUndefined();
    expect(enemy.baseStats.defense).toBe(ENEMIES.skeleton_warrior.baseStats.defense);
  });
});
```

- [ ] **Step 3.3: Run the test and verify it fails**

Run: `npx vitest run src/run/__tests__/combat_setup.test.ts -t 'modifierIds'`

Expected: FAIL — Armored test fails (defense not boosted), Venomous/Enraged tests fail (fields undefined). The "no modifierIds" test passes (everything undefined / base by default).

- [ ] **Step 3.4: Add `applyModifiersToStats` and modifier-derived-field setting in `combat_setup.ts`**

Open `src/run/combat_setup.ts`. Add the `MODIFIERS` import at the top:

```ts
import { MODIFIERS, type ModifierId } from '../data/modifiers';
```

Add the helper function alongside `applyWoundsToStats` (around line 11):

```ts
function applyModifiersToStats(base: Stats, modifierIds: readonly ModifierId[] | undefined): Stats {
  if (!modifierIds || modifierIds.length === 0) return base;
  const result: Stats = { ...base };
  for (const id of modifierIds) {
    const effect = MODIFIERS[id].effect;
    if (effect.kind === 'statDelta') {
      result[effect.stat] += effect.delta;
    }
  }
  return result;
}
```

Find the enemy-build loop (around line 75):

```ts
for (let i = 0; i < encounter.enemies.length; i++) {
  const placement = encounter.enemies[i];
  const scaled = scaleEnemyStats(placement.enemyId, encounter.scale);
  combatants.push(
    createEnemyCombatant(placement.enemyId, placement.slot, `e${i}`, {
      baseStats: scaled,
      currentHp: scaled.hp,
      maxHp: scaled.hp,
    }),
  );
}
```

Replace it with:

```ts
for (let i = 0; i < encounter.enemies.length; i++) {
  const placement = encounter.enemies[i];
  const scaled = scaleEnemyStats(placement.enemyId, encounter.scale);
  const withModifierStats = applyModifiersToStats(scaled, placement.modifierIds);
  const modifierFields: Partial<Combatant> = {};
  for (const id of placement.modifierIds ?? []) {
    const effect = MODIFIERS[id].effect;
    if (effect.kind === 'venomous_on_hit') {
      modifierFields.venomousDamage = effect.damagePerTurn;
      modifierFields.venomousDuration = effect.duration;
    } else if (effect.kind === 'enraged_threshold') {
      modifierFields.enragedThreshold = effect.hpRatio;
      modifierFields.enragedAttackDelta = effect.attackDelta;
    }
  }
  combatants.push(
    createEnemyCombatant(placement.enemyId, placement.slot, `e${i}`, {
      baseStats: withModifierStats,
      currentHp: withModifierStats.hp,
      maxHp: withModifierStats.hp,
      ...modifierFields,
    }),
  );
}
```

This single block handles all three modifier kinds — Armored injects via `applyModifiersToStats`; Venomous and Enraged set the new optional Combatant fields. Tasks 4 and 5 will wire those fields into the per-modifier behavior.

- [ ] **Step 3.5: Run the tests and verify they pass**

Run: `npx vitest run src/run/__tests__/combat_setup.test.ts`

Expected: PASS — all existing combat_setup tests + 5 new modifierIds tests green.

- [ ] **Step 3.6: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total = previous + 5.

- [ ] **Step 3.7: Commit**

```bash
git add src/combat/types.ts src/run/combat_setup.ts src/run/__tests__/combat_setup.test.ts
git commit -m "feat(combat): Combatant modifier fields + Armored stat injection"
```

---

## Task 4: Venomous on-hit poison

Add the parallel-to-burning poison block in `combat/effects.ts`. The Combatant fields were already set by Task 3; this task just reads them and applies the `'poisoned'` status on a non-lethal hit.

**Files:**
- Modify: `src/combat/effects.ts`
- Modify: `src/combat/__tests__/effects.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Open `src/combat/__tests__/effects.test.ts`. At the bottom of the file, append a new describe block:

```typescript
describe('venomous on-hit', () => {
  it('applies poisoned status on non-lethal hit', () => {
    const venomousAttacker = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 10, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      venomousDamage: 2,
      venomousDuration: 2,
    });
    const target = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 30, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 30,
      maxHp: 30,
    });
    const state = makeTestState([target], [venomousAttacker]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, venomousAttacker, ['p0'], state, rng, events);
    expect(target.statuses['poisoned']).toBeDefined();
    expect(target.statuses['poisoned'].effect).toMatchObject({
      kind: 'poison',
      damagePerTurn: 2,
      duration: 2,
      statusId: 'poisoned',
    });
    expect(target.statuses['poisoned'].remainingTurns).toBe(2);
    const statusEvent = events.find((e) => e.kind === 'status_applied' && e.statusId === 'poisoned');
    expect(statusEvent).toBeDefined();
  });

  it('does NOT apply poisoned status on a lethal hit', () => {
    const venomousAttacker = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 10, attack: 100, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      venomousDamage: 2,
      venomousDuration: 2,
    });
    const target = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 1, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 1,
      maxHp: 1,
    });
    const state = makeTestState([target], [venomousAttacker]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, venomousAttacker, ['p0'], state, rng, events);
    expect(target.statuses['poisoned']).toBeUndefined();
    expect(target.isDead).toBe(true);
  });

  it('does NOT apply when venomousDamage is undefined', () => {
    const normalAttacker = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 10, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const target = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 30, attack: 4, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 30,
      maxHp: 30,
    });
    const state = makeTestState([target], [normalAttacker]);
    const events: CombatEvent[] = [];
    applyAbility(ABILITIES.bone_slash, normalAttacker, ['p0'], state, rng, events);
    expect(target.statuses['poisoned']).toBeUndefined();
  });
});
```

- [ ] **Step 4.2: Run the test and verify it fails**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t 'venomous on-hit'`

Expected: FAIL — first test fails (no poisoned status applied), second and third pass (no poison expected).

- [ ] **Step 4.3: Add the venomous block in `effects.ts`**

Open `src/combat/effects.ts`. Find the existing burning-weapon block (around line 72):

```typescript
if (caster.burningWeaponDamage !== undefined && !lethal) {
  target.statuses['burning'] = {
    statusId: 'burning',
    remainingTurns: 2,
    effect: { kind: 'poison', damagePerTurn: caster.burningWeaponDamage, duration: 2, statusId: 'burning' },
    sourceId: caster.id,
  };
  events.push({
    kind: 'status_applied',
    sourceId: caster.id,
    targetId: target.id,
    statusId: 'burning',
    duration: 2,
  });
}
```

Add a parallel block immediately after it (before the existing `thornsDamage` block):

```typescript
if (caster.venomousDamage !== undefined && !lethal) {
  const duration = caster.venomousDuration ?? 2;
  target.statuses['poisoned'] = {
    statusId: 'poisoned',
    remainingTurns: duration,
    effect: { kind: 'poison', damagePerTurn: caster.venomousDamage, duration, statusId: 'poisoned' },
    sourceId: caster.id,
  };
  events.push({
    kind: 'status_applied',
    sourceId: caster.id,
    targetId: target.id,
    statusId: 'poisoned',
    duration,
  });
}
```

- [ ] **Step 4.4: Run the tests and verify they pass**

Run: `npx vitest run src/combat/__tests__/effects.test.ts -t 'venomous on-hit'`

Expected: PASS — all 3 cases green.

- [ ] **Step 4.5: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total = previous + 3.

- [ ] **Step 4.6: Commit**

```bash
git add src/combat/effects.ts src/combat/__tests__/effects.test.ts
git commit -m "feat(combat): Venomous on-hit poison application"
```

---

## Task 5: Enraged threshold attack bonus

Add the threshold check in `combat/statuses.ts` `getEffectiveStat` for `'attack'`. When an enraged combatant's HP ratio drops below `enragedThreshold`, future Attack reads pick up the `enragedAttackDelta` bonus.

**Files:**
- Modify: `src/combat/statuses.ts`
- Modify: `src/combat/__tests__/statuses.test.ts`

- [ ] **Step 5.1: Write the failing tests**

Open `src/combat/__tests__/statuses.test.ts`. After the existing `getEffectiveStat` describe block (around line 37), append a new describe block:

```typescript
describe('getEffectiveStat — enraged threshold', () => {
  it('returns base attack when combatant is at full HP (threshold not crossed)', () => {
    const c = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 20, attack: 5, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 20,
      maxHp: 20,
      enragedThreshold: 0.5,
      enragedAttackDelta: 3,
    });
    expect(getEffectiveStat(c, 'attack')).toBe(5);
  });

  it('returns base + enragedAttackDelta when below threshold', () => {
    const c = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 20, attack: 5, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 9,  // 9/20 = 0.45 < 0.5
      maxHp: 20,
      enragedThreshold: 0.5,
      enragedAttackDelta: 3,
    });
    expect(getEffectiveStat(c, 'attack')).toBe(8);
  });

  it('returns base attack when at exactly 50% HP (strict less-than)', () => {
    const c = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 20, attack: 5, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 10,  // 10/20 = 0.5, not < 0.5
      maxHp: 20,
      enragedThreshold: 0.5,
      enragedAttackDelta: 3,
    });
    expect(getEffectiveStat(c, 'attack')).toBe(5);
  });

  it('does not apply enraged bonus to non-attack stats', () => {
    const c = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 20, attack: 5, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 1,
      maxHp: 20,
      enragedThreshold: 0.5,
      enragedAttackDelta: 3,
    });
    expect(getEffectiveStat(c, 'defense')).toBe(4);
    expect(getEffectiveStat(c, 'speed')).toBe(3);
  });

  it('does not apply when enragedThreshold is undefined', () => {
    const c = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 20, attack: 5, defense: 0, speed: 3, mind: 0, crit: 0, dodge: 0 },
      currentHp: 1,
      maxHp: 20,
    });
    expect(getEffectiveStat(c, 'attack')).toBe(5);
  });
});
```

- [ ] **Step 5.2: Run the test and verify it fails**

Run: `npx vitest run src/combat/__tests__/statuses.test.ts -t 'enraged threshold'`

Expected: FAIL — "returns base + enragedAttackDelta when below threshold" fails (returns 5 instead of 8); other tests pass (no bonus expected).

- [ ] **Step 5.3: Add the threshold check in `getEffectiveStat`**

Open `src/combat/statuses.ts`. Find the existing `getEffectiveStat` function. After the perk block (around line 39), before the statuses loop, add:

```typescript
if (
  stat === 'attack' &&
  combatant.enragedThreshold !== undefined &&
  combatant.enragedAttackDelta !== undefined &&
  combatant.maxHp > 0 &&
  combatant.currentHp / combatant.maxHp < combatant.enragedThreshold
) {
  total += combatant.enragedAttackDelta;
}
```

The full function should now look like:

```typescript
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

  if (stat !== 'hp' && combatant.perkId) {
    const perk = PERKS[combatant.perkId];
    for (const effect of perk.statEffects ?? []) {
      if (effect.stat === stat && evaluateTraitCondition(effect.condition, combatant)) {
        total += effect.delta;
      }
    }
  }

  if (
    stat === 'attack' &&
    combatant.enragedThreshold !== undefined &&
    combatant.enragedAttackDelta !== undefined &&
    combatant.maxHp > 0 &&
    combatant.currentHp / combatant.maxHp < combatant.enragedThreshold
  ) {
    total += combatant.enragedAttackDelta;
  }

  for (const status of Object.values(combatant.statuses)) {
    const e = status.effect;
    if ((e.kind === 'buff' || e.kind === 'debuff') && e.stat === stat) {
      total += e.delta;
    }
  }
  return total;
}
```

- [ ] **Step 5.4: Run the tests and verify they pass**

Run: `npx vitest run src/combat/__tests__/statuses.test.ts -t 'enraged threshold'`

Expected: PASS — all 5 cases green.

- [ ] **Step 5.5: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total = previous + 5.

- [ ] **Step 5.6: Commit**

```bash
git add src/combat/statuses.ts src/combat/__tests__/statuses.test.ts
git commit -m "feat(combat): Enraged threshold attack bonus in getEffectiveStat"
```

---

## Task 6: Floor.ts integration + extended floor tests

Wire the stampers into `floor.ts`. Each combat encounter (n0, n1, combat-fork-branch) gets `stampCombatModifiers`; elite encounters get `stampEliteModifiers`; boss is untouched. Extend `floor.test.ts` with milestone and elite stamping coverage. After this task, modifiers stamp onto encounters in the wild and the system is end-to-end live.

**Files:**
- Modify: `src/dungeon/floor.ts`
- Modify: `src/dungeon/__tests__/floor.test.ts`

- [ ] **Step 6.1: Write the failing tests**

Open `src/dungeon/__tests__/floor.test.ts`. Find the existing tests inside `describe('generateFloor — Crypt', ...)`. After the existing tests (around the bottom of the describe block, before the closing `});`), append:

```typescript
it('floor 1: combat encounters carry no modifierIds', () => {
  const { nodes } = generateFloor('crypt', 1, createRng(1));
  for (const node of nodes) {
    if (node.type !== 'combat') continue;
    for (const placement of node.encounter.enemies) {
      expect(placement.modifierIds).toBeUndefined();
    }
  }
});

it('floor 5: every combat-encounter enemy has exactly one modifierIds entry from [armored]', () => {
  const { nodes } = generateFloor('crypt', 5, createRng(1));
  for (const node of nodes) {
    if (node.type !== 'combat') continue;
    for (const placement of node.encounter.enemies) {
      expect(placement.modifierIds).toHaveLength(1);
      expect(placement.modifierIds![0]).toBe('armored');
    }
  }
});

it('floor 15: every combat-encounter enemy has one modifierIds from the full pool (across seeds, all three appear)', () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 50; seed++) {
    const { nodes } = generateFloor('crypt', 15, createRng(seed));
    for (const node of nodes) {
      if (node.type !== 'combat') continue;
      for (const placement of node.encounter.enemies) {
        expect(placement.modifierIds).toHaveLength(1);
        seen.add(placement.modifierIds![0]);
      }
    }
  }
  expect(seen).toEqual(new Set(['armored', 'venomous', 'enraged']));
});

it('elite encounter on floor 1: every enemy has one modifierIds from the full pool', () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 100; seed++) {
    const { nodes } = generateFloor('crypt', 1, createRng(seed));
    const elite = nodes.find((n) => n.type === 'elite');
    if (!elite || elite.type !== 'elite') continue;
    for (const placement of elite.encounter.enemies) {
      expect(placement.modifierIds).toHaveLength(1);
      seen.add(placement.modifierIds![0]);
    }
  }
  expect(seen).toEqual(new Set(['armored', 'venomous', 'enraged']));
});

it('boss encounter has no modifierIds (any floor)', () => {
  for (const floorNumber of [1, 5, 15]) {
    const { nodes } = generateFloor('crypt', floorNumber, createRng(1));
    const boss = nodes.find((n) => n.type === 'boss');
    expect(boss).toBeDefined();
    if (boss?.type === 'boss') {
      for (const placement of boss.encounter.enemies) {
        expect(placement.modifierIds).toBeUndefined();
      }
    }
  }
});
```

- [ ] **Step 6.2: Run the test and verify it fails**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts`

Expected: FAIL — floor 5 / floor 15 / elite tests fail because no stamping is wired into `floor.ts` yet.

- [ ] **Step 6.3: Wire the stampers into `floor.ts`**

Open `src/dungeon/floor.ts`. Add the stamping import at the top:

```typescript
import { stampCombatModifiers, stampEliteModifiers } from './modifier_stamp';
```

Find the preamble encounter generation (around line 36):

```typescript
const enc0 = composeCombatEncounter(dungeon.enemyPool, scale, rng);
const enc1 = composeCombatEncounter(dungeon.enemyPool, scale, rng);
```

Replace with stamped versions:

```typescript
const enc0Raw = composeCombatEncounter(dungeon.enemyPool, scale, rng);
const enc0: typeof enc0Raw = {
  ...enc0Raw,
  enemies: stampCombatModifiers(enc0Raw.enemies, floorNumber, rng),
};
const enc1Raw = composeCombatEncounter(dungeon.enemyPool, scale, rng);
const enc1: typeof enc1Raw = {
  ...enc1Raw,
  enemies: stampCombatModifiers(enc1Raw.enemies, floorNumber, rng),
};
```

Find the conditional combat-fork-branch and elite encounter generation (around line 51–55):

```typescript
const combatBranchEnc = usesCombatBranch
  ? composeCombatEncounter(dungeon.enemyPool, scale, rng)
  : undefined;
const eliteBranchEnc = usesEliteBranch
  ? composeEliteEncounter(dungeon.enemyPool, scale, rng)
  : undefined;
```

Replace with stamped versions:

```typescript
const combatBranchEncRaw = usesCombatBranch
  ? composeCombatEncounter(dungeon.enemyPool, scale, rng)
  : undefined;
const combatBranchEnc = combatBranchEncRaw === undefined
  ? undefined
  : { ...combatBranchEncRaw, enemies: stampCombatModifiers(combatBranchEncRaw.enemies, floorNumber, rng) };

const eliteBranchEncRaw = usesEliteBranch
  ? composeEliteEncounter(dungeon.enemyPool, scale, rng)
  : undefined;
const eliteBranchEnc = eliteBranchEncRaw === undefined
  ? undefined
  : { ...eliteBranchEncRaw, enemies: stampEliteModifiers(eliteBranchEncRaw.enemies, rng) };
```

Boss encounter is left untouched — no stamping call.

- [ ] **Step 6.4: Run the floor tests and verify they pass**

Run: `npx vitest run src/dungeon/__tests__/floor.test.ts`

Expected: PASS — all updated and new tests green.

- [ ] **Step 6.5: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total = previous + 5.

- [ ] **Step 6.6: Smoke-check determinism by running tests twice**

Run: `npm test` again.

Expected: identical pass count, identical seed-bound test outputs.

- [ ] **Step 6.7: Commit**

```bash
git add src/dungeon/floor.ts src/dungeon/__tests__/floor.test.ts
git commit -m "feat(dungeon): stamp modifiers on combat/elite encounters per floor"
```

---

## Closing checklist

- [ ] **All 6 tasks landed in 6 commits**, each with green tests and green tsc.
- [ ] **No imports of `phaser`** under `src/dungeon/`, `src/data/`, `src/combat/`, `src/run/`. Verify via:
  ```bash
  grep -r "from 'phaser'" src/dungeon src/data src/combat src/run || echo "OK — no phaser imports"
  ```
  Expected output: `OK — no phaser imports`.
- [ ] **`gdd.md`** is the design source of truth. Numerical knobs live as named constants in `data/modifiers.ts` and `dungeon/modifier_stamp.ts` for tuning.
- [ ] **Out-of-scope follow-ups** the spec called out:
  - Visual badges / icons on enemy combatants in the combat scene (no current TODO entry; user to decide if needed).
  - `passives` bag refactor of `Combatant`'s optional fields (now 9 with this task: `damageTakenMultiplier`, `lifestealPercent`, `thornsDamage`, `regenPerRound`, `burningWeaponDamage`, `venomousDamage`, `venomousDuration`, `enragedThreshold`, `enragedAttackDelta`). Reasonable cleanup task when the inline pattern starts hurting readability.
- [ ] **HISTORY.md migration** — move TODO entry from Cluster A · 12 into HISTORY.md newest-first when the user confirms work is good. Slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commits, awaiting user direction per CLAUDE.md.

**Test count delta from baseline:**
- +4 (Task 1: modifiers data)
- +12 (Task 2: stamper helpers)
- +5 (Task 3: combat_setup modifierIds)
- +3 (Task 4: venomous on-hit)
- +5 (Task 5: enraged threshold)
- +5 (Task 6: floor integration)
- = **+34 total**
