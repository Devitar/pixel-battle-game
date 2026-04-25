# Recruitment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Tavern candidate generator + starter-roster helper, and introduce the trait system (6 Tier 1 traits, HP bakes at Hero creation, non-HP evaluates at `getEffectiveStat` with condition support).

**Architecture:** Layered extensions. Types + trait/name/body data first (pure data). Then Hero signature extension (breaks callers — update atomically). Then Combatant + `getEffectiveStat` trait evaluation. Then `buildCombatState` propagation. Finally the Tavern module. Each layer keeps prior tests green.

**Tech Stack:** TypeScript 6.0, Vitest 4.1. No phaser.

**Repo convention:** `CLAUDE.md` says *"Never create git commits without explicit user instruction in the current turn."* No commit steps.

**Source spec:** [`docs/superpowers/specs/2026-04-24-recruitment-design.md`](../specs/2026-04-24-recruitment-design.md).

---

## File Structure

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/data/types.ts` | Modify | Add `TraitId`, `TraitCondition`, `TraitHpEffect`, `TraitStatEffect`, `TraitDef`. |
| `src/data/traits.ts` | Create | `TRAITS` registry (6 entries). |
| `src/data/names.ts` | Create | `NAMES` array. |
| `src/data/body_sprites.ts` | Create | `PLAYER_BODY_SPRITES` array. |
| `src/heroes/hero.ts` | Modify | `Hero` gains `traitId` + `bodySpriteId`; `createHero` signature extended with HP bake. |
| `src/combat/types.ts` | Modify | `Combatant` gains optional `traitId?`. |
| `src/combat/statuses.ts` | Modify | `getEffectiveStat` reads non-HP trait effects with condition evaluation. |
| `src/run/combat_setup.ts` | Modify | Propagate `hero.traitId` into the built Combatant. |
| `src/camp/buildings/tavern.ts` | Create | `generateCandidate`, `generateCandidates`, `generateStarterRoster`, `HIRE_COST`, `TAVERN_CANDIDATE_COUNT`. |
| `src/data/__tests__/traits.test.ts` | Create | |
| `src/data/__tests__/names.test.ts` | Create | |
| `src/heroes/__tests__/hero.test.ts` | Modify | Extend for trait + body. |
| `src/combat/__tests__/combatant.test.ts` | Modify | `traitId` propagation. |
| `src/combat/__tests__/statuses.test.ts` | Modify | Trait evaluation. |
| `src/run/__tests__/combat_setup.test.ts` | Modify | `traitId` flows through. |
| `src/run/__tests__/run_state.test.ts` | Modify | Mechanical: `createHero` signature churn. |
| `src/camp/buildings/__tests__/tavern.test.ts` | Create | |

---

## Task 1: Types + trait data + names + body sprites

**Files:**
- Modify: `src/data/types.ts`
- Create: `src/data/traits.ts`
- Create: `src/data/names.ts`
- Create: `src/data/body_sprites.ts`
- Create: `src/data/__tests__/traits.test.ts`
- Create: `src/data/__tests__/names.test.ts`

- [ ] **Step 1: Extend `src/data/types.ts`**

Append at the end of the file:

```ts
export type TraitId =
  | 'stout'
  | 'quick'
  | 'sturdy'
  | 'sharp_eyed'
  | 'cowardly'
  | 'nervous';

export type TraitCondition = { kind: 'inSlot'; slot: SlotIndex };

export interface TraitHpEffect {
  delta: number;
  mode: 'flat' | 'percent';
}

export interface TraitStatEffect {
  stat: 'attack' | 'defense' | 'speed';
  delta: number;
  condition?: TraitCondition;
}

export interface TraitDef {
  id: TraitId;
  name: string;
  description: string;
  hpEffect?: TraitHpEffect;
  statEffects?: readonly TraitStatEffect[];
}
```

- [ ] **Step 2: Create `src/data/traits.ts`**

```ts
import type { TraitDef, TraitId } from './types';

export const TRAITS: Record<TraitId, TraitDef> = {
  stout: {
    id: 'stout',
    name: 'Stout',
    description: '+10% HP',
    hpEffect: { delta: 10, mode: 'percent' },
  },
  quick: {
    id: 'quick',
    name: 'Quick',
    description: '+1 Speed',
    statEffects: [{ stat: 'speed', delta: 1 }],
  },
  sturdy: {
    id: 'sturdy',
    name: 'Sturdy',
    description: '+1 Defense',
    statEffects: [{ stat: 'defense', delta: 1 }],
  },
  sharp_eyed: {
    id: 'sharp_eyed',
    name: 'Sharp-eyed',
    description: '+1 Attack',
    statEffects: [{ stat: 'attack', delta: 1 }],
  },
  cowardly: {
    id: 'cowardly',
    name: 'Cowardly',
    description: '-1 Speed when in slot 1',
    statEffects: [{ stat: 'speed', delta: -1, condition: { kind: 'inSlot', slot: 1 } }],
  },
  nervous: {
    id: 'nervous',
    name: 'Nervous',
    description: '-1 Defense when in slot 1',
    statEffects: [{ stat: 'defense', delta: -1, condition: { kind: 'inSlot', slot: 1 } }],
  },
};
```

- [ ] **Step 3: Create `src/data/names.ts`**

```ts
export const NAMES: readonly string[] = [
  'Aldric', 'Brenna', 'Caelum', 'Dara', 'Edric', 'Fenris', 'Gwyn', 'Hale', 'Ilsa', 'Joren',
  'Kael', 'Lyra', 'Maren', 'Nyx', 'Orin', 'Pryce', 'Quinn', 'Rhea', 'Soren', 'Tamsin',
  'Ulric', 'Vesna', 'Wren', 'Xara', 'Yven', 'Zara', 'Ashen', 'Bryn', 'Cora', 'Doran',
  'Elara', 'Faren', 'Glyn', 'Hadrian', 'Ivor', 'Jora', 'Kestrel', 'Lark', 'Merek', 'Nell',
  'Oren', 'Perrin', 'Quill', 'Roran', 'Sable', 'Tamar', 'Vesper', 'Wilder', 'Yara', 'Zephyr',
];
```

- [ ] **Step 4: Create `src/data/body_sprites.ts`**

```ts
import { SPRITE_NAMES } from '../render/sprite_names.generated';

export const PLAYER_BODY_SPRITES: readonly string[] = [
  String(SPRITE_NAMES.character.female_light),
  String(SPRITE_NAMES.character.male_light),
  String(SPRITE_NAMES.character.female_tan),
  String(SPRITE_NAMES.character.male_tan),
  String(SPRITE_NAMES.character.female_dark),
  String(SPRITE_NAMES.character.male_dark),
  String(SPRITE_NAMES.character.female_orc),
  String(SPRITE_NAMES.character.male_orc),
];
```

- [ ] **Step 5: Create `src/data/__tests__/traits.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { TRAITS } from '../traits';
import type { TraitId } from '../types';

const EXPECTED_IDS: readonly TraitId[] = [
  'stout',
  'quick',
  'sturdy',
  'sharp_eyed',
  'cowardly',
  'nervous',
];

describe('TRAITS', () => {
  it('registers every expected trait id', () => {
    for (const id of EXPECTED_IDS) {
      expect(TRAITS[id], `missing trait ${id}`).toBeDefined();
    }
  });

  it('has no stray entries', () => {
    expect(Object.keys(TRAITS).sort()).toEqual([...EXPECTED_IDS].sort());
  });

  describe.each(EXPECTED_IDS)('trait %s', (id) => {
    it('has matching id field', () => {
      expect(TRAITS[id].id).toBe(id);
    });

    it('has a non-empty description', () => {
      expect(TRAITS[id].description.length).toBeGreaterThan(0);
    });

    it('has at least one effect (hpEffect or statEffects)', () => {
      const t = TRAITS[id];
      const hasHp = t.hpEffect !== undefined;
      const hasStat = t.statEffects !== undefined && t.statEffects.length > 0;
      expect(hasHp || hasStat).toBe(true);
    });

    it('hpEffect percent mode has delta within [-100, 100]', () => {
      const hp = TRAITS[id].hpEffect;
      if (hp && hp.mode === 'percent') {
        expect(hp.delta).toBeGreaterThanOrEqual(-100);
        expect(hp.delta).toBeLessThanOrEqual(100);
      }
    });

    it('every statEffect targets attack/defense/speed only', () => {
      const stats = TRAITS[id].statEffects ?? [];
      for (const e of stats) {
        expect(['attack', 'defense', 'speed']).toContain(e.stat);
      }
    });
  });
});
```

- [ ] **Step 6: Create `src/data/__tests__/names.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { NAMES } from '../names';

describe('NAMES', () => {
  it('has at least 50 entries', () => {
    expect(NAMES.length).toBeGreaterThanOrEqual(50);
  });

  it('has no duplicates', () => {
    expect(new Set(NAMES).size).toBe(NAMES.length);
  });

  it('every name is a non-empty string', () => {
    for (const n of NAMES) {
      expect(typeof n).toBe('string');
      expect(n.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run src/data/__tests__/traits.test.ts src/data/__tests__/names.test.ts`
Expected: all passing.

Run: `npx tsc --noEmit`
Expected: exit 0.

---

## Task 2: Hero extension with HP baking (atomic — updates all callers)

**Files:**
- Modify: `src/heroes/hero.ts`
- Modify: `src/heroes/__tests__/hero.test.ts`
- Modify: `src/run/__tests__/run_state.test.ts`
- Modify: `src/run/__tests__/combat_setup.test.ts`

`createHero` gains two required parameters. All existing callers must update in the same task to keep the suite green. Safe-default trait is `'quick'` (no HP effect, minimal test churn).

- [ ] **Step 1: Rewrite `src/heroes/hero.ts`**

Replace the file's entire contents:

```ts
import { CLASSES } from '../data/classes';
import { TRAITS } from '../data/traits';
import type { ClassId, TraitDef, TraitId } from '../data/types';
import type { Stats } from '../combat/types';

export interface Hero {
  id: string;
  classId: ClassId;
  name: string;
  baseStats: Stats;
  currentHp: number;
  maxHp: number;
  traitId: TraitId;
  bodySpriteId: string;
}

export function createHero(
  classId: ClassId,
  name: string,
  id: string,
  traitId: TraitId,
  bodySpriteId: string,
): Hero {
  const def = CLASSES[classId];
  const maxHp = computeMaxHp(def.baseStats.hp, TRAITS[traitId]);
  return {
    id,
    classId,
    name,
    baseStats: { ...def.baseStats },
    currentHp: maxHp,
    maxHp,
    traitId,
    bodySpriteId,
  };
}

function computeMaxHp(classBaseHp: number, trait: TraitDef): number {
  if (!trait.hpEffect) return classBaseHp;
  const { delta, mode } = trait.hpEffect;
  if (mode === 'percent') {
    return Math.round(classBaseHp * (1 + delta / 100));
  }
  return classBaseHp + delta;
}
```

- [ ] **Step 2: Rewrite `src/heroes/__tests__/hero.test.ts`**

Replace entirely:

```ts
import { describe, expect, it } from 'vitest';
import { CLASSES } from '../../data/classes';
import { createHero } from '../hero';

describe('createHero — basic shape', () => {
  it('builds a Knight with full HP and stored trait / body', () => {
    const h = createHero('knight', 'Eira', 'h1', 'quick', 'body1');
    expect(h.id).toBe('h1');
    expect(h.classId).toBe('knight');
    expect(h.name).toBe('Eira');
    expect(h.baseStats).toEqual(CLASSES.knight.baseStats);
    expect(h.currentHp).toBe(h.maxHp);
    expect(h.maxHp).toBe(CLASSES.knight.baseStats.hp);  // Quick: no HP effect
    expect(h.traitId).toBe('quick');
    expect(h.bodySpriteId).toBe('body1');
  });

  it('two heroes with identical inputs are structurally equal', () => {
    const a = createHero('archer', 'Luna', 'h2', 'quick', 'body2');
    const b = createHero('archer', 'Luna', 'h2', 'quick', 'body2');
    expect(a).toEqual(b);
  });

  it('baseStats is a copy, not a reference to CLASSES', () => {
    const h = createHero('priest', 'Ser', 'h3', 'quick', 'body3');
    expect(h.baseStats).not.toBe(CLASSES.priest.baseStats);
  });
});

describe('createHero — HP trait baking', () => {
  it('Stout Knight: 20 × 1.10 = 22', () => {
    const h = createHero('knight', 'K', 'h1', 'stout', 'body1');
    expect(h.maxHp).toBe(22);
    expect(h.currentHp).toBe(22);
  });

  it('Stout Archer: 14 × 1.10 = 15.4 → round 15', () => {
    const h = createHero('archer', 'A', 'h1', 'stout', 'body1');
    expect(h.maxHp).toBe(15);
  });

  it('Stout Priest: 15 × 1.10 = 16.5 → round 17', () => {
    const h = createHero('priest', 'P', 'h1', 'stout', 'body1');
    expect(h.maxHp).toBe(17);
  });

  it('Quick Knight: HP unaffected', () => {
    const h = createHero('knight', 'K', 'h1', 'quick', 'body1');
    expect(h.maxHp).toBe(CLASSES.knight.baseStats.hp);
  });

  it('Non-HP traits leave HP at class default', () => {
    for (const trait of ['quick', 'sturdy', 'sharp_eyed', 'cowardly', 'nervous'] as const) {
      const h = createHero('knight', 'K', 'h1', trait, 'body1');
      expect(h.maxHp, `trait ${trait}`).toBe(CLASSES.knight.baseStats.hp);
    }
  });
});
```

- [ ] **Step 3: Update `createHero` call sites in `src/run/__tests__/run_state.test.ts`**

Every call to `createHero(classId, name, id)` needs two additional args. Use `'quick'` trait (no HP effect) and `'body1'` body sprite for all updates. The `makeParty` helper shown below is already the primary factory used throughout the file — updating it propagates to all tests.

Find:

```ts
function makeParty(): Hero[] {
  return [
    createHero('knight', 'K', 'h0'),
    createHero('archer', 'A', 'h1'),
    createHero('priest', 'P', 'h2'),
  ];
}
```

Replace with:

```ts
function makeParty(): Hero[] {
  return [
    createHero('knight', 'K', 'h0', 'quick', 'body1'),
    createHero('archer', 'A', 'h1', 'quick', 'body1'),
    createHero('priest', 'P', 'h2', 'quick', 'body1'),
  ];
}
```

Also find the inline `createHero` call inside the "throws on party size != 3" test:

```ts
expect(() => startRun('crypt', [createHero('knight', 'K', 'h0')], 1, rng)).toThrow();
```

Replace with:

```ts
expect(() => startRun('crypt', [createHero('knight', 'K', 'h0', 'quick', 'body1')], 1, rng)).toThrow();
```

And the 4-hero array:

```ts
const four: Hero[] = [
  createHero('knight', 'K', 'h0'),
  createHero('archer', 'A', 'h1'),
  createHero('priest', 'P', 'h2'),
  createHero('knight', 'K2', 'h3'),
];
```

Replace with:

```ts
const four: Hero[] = [
  createHero('knight', 'K', 'h0', 'quick', 'body1'),
  createHero('archer', 'A', 'h1', 'quick', 'body1'),
  createHero('priest', 'P', 'h2', 'quick', 'body1'),
  createHero('knight', 'K2', 'h3', 'quick', 'body1'),
];
```

- [ ] **Step 4: Update `createHero` call sites in `src/run/__tests__/combat_setup.test.ts`**

Every `createHero('class', 'name', 'id')` call updates to `createHero('class', 'name', 'id', 'quick', 'body1')`. There are 6 call sites across the test file. Use project-wide find-replace or edit each manually.

- [ ] **Step 5: Run all affected tests**

Run: `npx vitest run src/heroes/__tests__/hero.test.ts src/run/__tests__/run_state.test.ts src/run/__tests__/combat_setup.test.ts`
Expected: all passing.

Run: `npx tsc --noEmit`
Expected: exit 0.

---

## Task 3: Combatant.traitId + `getEffectiveStat` trait evaluation

**Files:**
- Modify: `src/combat/types.ts`
- Modify: `src/combat/statuses.ts`
- Modify: `src/combat/__tests__/statuses.test.ts`
- Modify: `src/combat/__tests__/combatant.test.ts`

- [ ] **Step 1: Add `traitId` to `Combatant` in `src/combat/types.ts`**

Find the `Combatant` interface and add `traitId?: TraitId` as a new field. The `TraitId` import is needed — ensure `TraitId` is part of the existing import line from `'../data/types'`.

Change the import line from:

```ts
import type {
  AbilityEffect,
  AbilityId,
  ClassId,
  CombatantTag,
  EnemyId,
  SlotIndex,
  StatusId,
} from '../data/types';
```

to:

```ts
import type {
  AbilityEffect,
  AbilityId,
  ClassId,
  CombatantTag,
  EnemyId,
  SlotIndex,
  StatusId,
  TraitId,
} from '../data/types';
```

Find the `Combatant` interface block and add `traitId?: TraitId;` after `tags?`:

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
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  preferredSlots?: readonly SlotIndex[];
  tags?: readonly CombatantTag[];
  traitId?: TraitId;
  isDead: boolean;
}
```

- [ ] **Step 2: Rewrite `src/combat/statuses.ts`**

Replace entirely:

```ts
import { TRAITS } from '../data/traits';
import type { BuffableStat, TraitCondition } from '../data/types';
import type { Combatant, CombatEvent } from './types';

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
```

- [ ] **Step 3: Extend `src/combat/__tests__/statuses.test.ts` with trait cases**

Append the following block at the end of the file, before any trailing close:

```ts
describe('getEffectiveStat — trait evaluation', () => {
  it('Quick combatant adds +1 to speed', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', { traitId: 'quick' });
    expect(getEffectiveStat(c, 'speed')).toBe(c.baseStats.speed + 1);
  });

  it('Stout combatant does not change HP via getEffectiveStat (HP is baked at Hero creation)', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', { traitId: 'stout' });
    expect(getEffectiveStat(c, 'hp')).toBe(c.baseStats.hp);
  });

  it('Cowardly in slot 1 reduces speed by 1', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', { traitId: 'cowardly' });
    expect(getEffectiveStat(c, 'speed')).toBe(c.baseStats.speed - 1);
  });

  it('Cowardly in slot 2 does not change speed (condition not satisfied)', () => {
    const c = makeHeroCombatant('knight', 2, 'p0', { traitId: 'cowardly' });
    expect(getEffectiveStat(c, 'speed')).toBe(c.baseStats.speed);
  });

  it('Sturdy trait and Bulwark status stack on defense', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', { traitId: 'sturdy' });
    c.statuses['bulwark'] = status(
      { kind: 'buff', stat: 'defense', delta: 3, duration: 2, statusId: 'bulwark' },
      2,
    );
    expect(getEffectiveStat(c, 'defense')).toBe(c.baseStats.defense + 1 + 3);
  });

  it('Combatant with no traitId reads base + statuses only', () => {
    const c = makeEnemyCombatant('skeleton_warrior', 1, 'e0');
    expect(c.traitId).toBeUndefined();
    expect(getEffectiveStat(c, 'attack')).toBe(c.baseStats.attack);
  });
});
```

Note: `makeEnemyCombatant` is imported from `./helpers` in the existing test file. If not already imported, add `makeEnemyCombatant` to the imports.

- [ ] **Step 4: Extend `src/combat/__tests__/combatant.test.ts`**

Append within the existing `describe('createHeroCombatant', ...)` block:

```ts
  it('propagates traitId via overrides', () => {
    const c = createHeroCombatant('knight', 1, 'p0', { traitId: 'stout' });
    expect(c.traitId).toBe('stout');
  });
```

And inside `describe('createEnemyCombatant', ...)`:

```ts
  it('leaves traitId undefined', () => {
    const c = createEnemyCombatant('skeleton_warrior', 1, 'e0');
    expect(c.traitId).toBeUndefined();
  });
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/combat/__tests__/statuses.test.ts src/combat/__tests__/combatant.test.ts`
Expected: all passing.

Run: `npx tsc --noEmit`
Expected: exit 0.

---

## Task 4: `combat_setup` propagates `traitId`

**Files:**
- Modify: `src/run/combat_setup.ts`
- Modify: `src/run/__tests__/combat_setup.test.ts`

- [ ] **Step 1: Update `src/run/combat_setup.ts` to propagate `traitId`**

Find the party-combatant construction loop:

```ts
for (let i = 0; i < party.length; i++) {
  const hero = party[i];
  combatants.push(
    createHeroCombatant(hero.classId, (i + 1) as SlotIndex, `p${i}`, {
      baseStats: hero.baseStats,
      currentHp: hero.currentHp,
      maxHp: hero.maxHp,
    }),
  );
}
```

Replace with:

```ts
for (let i = 0; i < party.length; i++) {
  const hero = party[i];
  combatants.push(
    createHeroCombatant(hero.classId, (i + 1) as SlotIndex, `p${i}`, {
      baseStats: hero.baseStats,
      currentHp: hero.currentHp,
      maxHp: hero.maxHp,
      traitId: hero.traitId,
    }),
  );
}
```

- [ ] **Step 2: Extend `src/run/__tests__/combat_setup.test.ts`**

Append a new `describe` block:

```ts
describe('buildCombatState — trait propagation', () => {
  it('copies each Hero traitId into the resulting Combatant', () => {
    const party = [
      createHero('knight', 'K', 'h0', 'stout', 'body1'),
      createHero('archer', 'A', 'h1', 'cowardly', 'body1'),
      createHero('priest', 'P', 'h2', 'sharp_eyed', 'body1'),
    ];
    const encounter: Encounter = { enemies: [], scale: FLAT_SCALE };
    const state = buildCombatState(party, encounter);
    expect(state.combatants[0].traitId).toBe('stout');
    expect(state.combatants[1].traitId).toBe('cowardly');
    expect(state.combatants[2].traitId).toBe('sharp_eyed');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/run/__tests__/combat_setup.test.ts`
Expected: all passing.

---

## Task 5: Tavern + starter roster

**Files:**
- Create: `src/camp/buildings/tavern.ts`
- Create: `src/camp/buildings/__tests__/tavern.test.ts`

- [ ] **Step 1: Create `src/camp/buildings/tavern.ts`**

```ts
import { PLAYER_BODY_SPRITES } from '../../data/body_sprites';
import { NAMES } from '../../data/names';
import { TRAITS } from '../../data/traits';
import type { ClassId, TraitId } from '../../data/types';
import { createHero, type Hero } from '../../heroes/hero';
import type { Rng } from '../../util/rng';

export const HIRE_COST = 50;
export const TAVERN_CANDIDATE_COUNT = 3;

const ALL_TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

export function generateCandidate(
  rng: Rng,
  unlockedClasses: readonly ClassId[],
): Hero {
  const classId = rng.pick(unlockedClasses);
  const traitId = rng.pick(ALL_TRAIT_IDS);
  const bodySpriteId = rng.pick(PLAYER_BODY_SPRITES);
  const name = rng.pick(NAMES);
  const id = `hero_${rng.int(100000, 999999)}`;
  return createHero(classId, name, id, traitId, bodySpriteId);
}

export function generateCandidates(
  rng: Rng,
  unlockedClasses: readonly ClassId[],
): Hero[] {
  const candidates: Hero[] = [];
  for (let i = 0; i < TAVERN_CANDIDATE_COUNT; i++) {
    candidates.push(generateCandidate(rng, unlockedClasses));
  }
  return candidates;
}

export function generateStarterRoster(rng: Rng): Hero[] {
  const classes: ClassId[] = ['knight', 'archer', 'priest'];
  return classes.map((classId) => {
    const traitId = rng.pick(ALL_TRAIT_IDS);
    const bodySpriteId = rng.pick(PLAYER_BODY_SPRITES);
    const name = rng.pick(NAMES);
    const id = `hero_${rng.int(100000, 999999)}`;
    return createHero(classId, name, id, traitId, bodySpriteId);
  });
}
```

- [ ] **Step 2: Create `src/camp/buildings/__tests__/tavern.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { CLASSES } from '../../../data/classes';
import { PLAYER_BODY_SPRITES } from '../../../data/body_sprites';
import { NAMES } from '../../../data/names';
import { TRAITS } from '../../../data/traits';
import type { ClassId } from '../../../data/types';
import { createRng } from '../../../util/rng';
import {
  generateCandidate,
  generateCandidates,
  generateStarterRoster,
  HIRE_COST,
  TAVERN_CANDIDATE_COUNT,
} from '../tavern';

const TIER1_CLASSES: ClassId[] = ['knight', 'archer', 'priest'];

describe('HIRE_COST and TAVERN_CANDIDATE_COUNT', () => {
  it('exports the expected constants', () => {
    expect(HIRE_COST).toBe(50);
    expect(TAVERN_CANDIDATE_COUNT).toBe(3);
  });
});

describe('generateCandidate', () => {
  it('returns a Hero with classId in the unlocked set', () => {
    const c = generateCandidate(createRng(1), TIER1_CLASSES);
    expect(TIER1_CLASSES).toContain(c.classId);
  });

  it('returns a Hero with a registered trait', () => {
    const c = generateCandidate(createRng(1), TIER1_CLASSES);
    expect(TRAITS[c.traitId]).toBeDefined();
  });

  it('returns a Hero with a body sprite from PLAYER_BODY_SPRITES', () => {
    const c = generateCandidate(createRng(1), TIER1_CLASSES);
    expect(PLAYER_BODY_SPRITES).toContain(c.bodySpriteId);
  });

  it('returns a Hero with a name from NAMES', () => {
    const c = generateCandidate(createRng(1), TIER1_CLASSES);
    expect(NAMES).toContain(c.name);
  });

  it('is deterministic per seed', () => {
    const a = generateCandidate(createRng(42), TIER1_CLASSES);
    const b = generateCandidate(createRng(42), TIER1_CLASSES);
    expect(a).toEqual(b);
  });
});

describe('generateCandidates', () => {
  it('returns exactly TAVERN_CANDIDATE_COUNT heroes', () => {
    const list = generateCandidates(createRng(1), TIER1_CLASSES);
    expect(list).toHaveLength(TAVERN_CANDIDATE_COUNT);
  });

  it('is deterministic per seed', () => {
    const a = generateCandidates(createRng(7), TIER1_CLASSES);
    const b = generateCandidates(createRng(7), TIER1_CLASSES);
    expect(a).toEqual(b);
  });

  it('Stout candidates have maxHp > classBaseHp; others equal class base', () => {
    // Sample 50 seeds; assert the invariant on every candidate.
    for (let seed = 1; seed <= 50; seed++) {
      const list = generateCandidates(createRng(seed), TIER1_CLASSES);
      for (const h of list) {
        const classBase = CLASSES[h.classId].baseStats.hp;
        if (h.traitId === 'stout') {
          expect(h.maxHp, `seed ${seed} hero ${h.id}`).toBeGreaterThan(classBase);
        } else {
          expect(h.maxHp, `seed ${seed} hero ${h.id}`).toBe(classBase);
        }
      }
    }
  });
});

describe('generateStarterRoster', () => {
  it('returns exactly 3 heroes, one per Tier 1 class', () => {
    const roster = generateStarterRoster(createRng(1));
    expect(roster).toHaveLength(3);
    const classIds = roster.map((h) => h.classId).sort();
    expect(classIds).toEqual(['archer', 'knight', 'priest']);
  });

  it('is deterministic per seed', () => {
    const a = generateStarterRoster(createRng(99));
    const b = generateStarterRoster(createRng(99));
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/camp/buildings/__tests__/tavern.test.ts`
Expected: all passing.

---

## Task 6: Full-suite verification

**Files:** none changed.

- [ ] **Step 1: Run full Vitest suite**

Run: `npm test`
Expected: all passing. Baseline was 384; this task adds roughly +50 across data, hero, combatant, statuses, combat_setup, and tavern tests.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds. Pre-existing phaser chunk-size warning is unrelated.

- [ ] **Step 4: Hand off to user**

Summarize:
- Files created: 4 new data modules + 1 tavern + 3 new test files.
- Files modified: hero, combat/types, combat/statuses, combat_setup, and 2 test files (mechanical churn).
- Test count added vs. baseline.
- Offer to migrate TODO.md task 8 → HISTORY.md.

---

## Self-review

**Spec coverage:**

- `TraitId`, `TraitCondition`, `TraitHpEffect`, `TraitStatEffect`, `TraitDef` → Task 1.
- `TRAITS` registry (6 entries, flat + conditional) → Task 1.
- `NAMES` (~50 ungendered) → Task 1.
- `PLAYER_BODY_SPRITES` (8 entries) → Task 1.
- `Hero.traitId` + `Hero.bodySpriteId` + HP baking → Task 2.
- Existing `createHero` callers updated → Task 2 Steps 3–4.
- `Combatant.traitId?` → Task 3 Step 1.
- `getEffectiveStat` trait evaluation with condition support → Task 3 Step 2.
- `buildCombatState` propagation → Task 4.
- Tavern (`generateCandidate`, `generateCandidates`, `generateStarterRoster`, `HIRE_COST`, `TAVERN_CANDIDATE_COUNT`) → Task 5.
- All tests from spec covered across Tasks 1–5.

Gap: none.

**Placeholder scan:** no TBDs, no "similar to Task N," no "implement later." Every code step shows full code or exact edit.

**Type consistency:** `TraitId`, `Hero`, `Combatant`, `TRAITS`, `PLAYER_BODY_SPRITES`, `NAMES`, `HIRE_COST`, `TAVERN_CANDIDATE_COUNT`, `generateCandidate`/`generateCandidates`/`generateStarterRoster` all match across tests and implementations. `createHero` signature change (3→5 params) propagates consistently through all caller updates in Task 2.
