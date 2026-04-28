# Hero Leveling + Level-5 Perks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-hero progression — XP from surviving combat, deterministic stat bumps per level, and a class-specific perk choice unlocked at level 5. Foundation only; the perk picker UI is Cluster B · 8.

**Architecture:** Six dependency-respecting tasks. (1) Schema foundations: `PerkId`, `PerkDef`, `primaryStat` on `ClassDef`. (2) `data/leveling.ts` — pure XP/level math, fully unit-tested. (3) `data/perks.ts` — 12 perk entries + `CLASS_PERK_PAIRS`. (4) `Hero` schema additions, `createHero` defaults, `normalizeSaveFile` backfill, single test fixture update. (5) Combat-side perk evaluation: `Combatant.perkId`, `getEffectiveStat` extension, `buildCombatState` pass-through. (6) XP awards wired into `completeCombat`. Each task lands green; later tasks depend on earlier types and helpers.

**Tech Stack:** TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 4. All code lives inside the Phaser firewall (`data/`, `heroes/`, `combat/`, `run/`, `save/`). No scenes touched.

**Spec:** [`docs/superpowers/specs/2026-04-28-hero-leveling-design.md`](../specs/2026-04-28-hero-leveling-design.md)

**Project policy reminder:** Per [`CLAUDE.md`](../../../CLAUDE.md), never run `git commit` without explicit user direction. Each task ends with a "stage and report" step — the user runs the commit themselves.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `src/data/types.ts` | **Modify** | Add `PerkId` union (12 IDs); add `PerkDef` interface; add required `primaryStat: BuffableStat` field to `ClassDef`. |
| `src/data/classes.ts` | **Modify** | Set `primaryStat` on each of the 6 class entries. |
| `src/data/__tests__/classes.test.ts` | **Modify** | Add per-class assertions that `primaryStat` is one of the 6 non-HP buffable stats. |
| `src/data/leveling.ts` | **Create** | Pure module: `MAX_LEVEL`, `LEVEL_THRESHOLDS`, `xpForCombatNode`, `xpForBossNode`, `levelForXp`, `applyLevelUps`. |
| `src/data/__tests__/leveling.test.ts` | **Create** | Boundary table + `applyLevelUps` per-class behavior + multi-level jump + `pendingPerk` flagging. |
| `src/data/perks.ts` | **Create** | `PERKS: Record<PerkId, PerkDef>` — 12 entries; `CLASS_PERK_PAIRS: Record<ClassId, readonly [PerkId, PerkId]>`. |
| `src/data/__tests__/perks.test.ts` | **Create** | Per-perk shape checks; per-class pair checks. |
| `src/heroes/hero.ts` | **Modify** | Add `xp`, `level`, `pendingPerk`, `perkId?` to `Hero`. Default `xp: 0, level: 1, pendingPerk: false` in `createHero`. |
| `src/heroes/__tests__/hero.test.ts` | **Modify** | Append a test asserting the new defaults on `createHero`. |
| `src/items/__tests__/equip.test.ts` | **Modify** | Update the `fakeHero` fixture to include `xp: 0, level: 1, pendingPerk: false`. |
| `src/save/save.ts` | **Modify** | `normalizeSaveFile` backfills `xp/level/pendingPerk` defaults on every roster hero. Extract a small helper for clarity. |
| `src/save/__tests__/save.test.ts` | **Modify** | Add a case: load a save with a hero missing `xp/level/pendingPerk` returns the hero with defaults filled. |
| `src/combat/types.ts` | **Modify** | Add `perkId?: PerkId` to `Combatant`. |
| `src/combat/statuses.ts` | **Modify** | `getEffectiveStat` reads `combatant.perkId` and adds `PERKS[id].statEffects` after the existing trait loop. |
| `src/combat/__tests__/statuses.test.ts` | **Modify** | Add 3 cases: perk delta applies; no perk reads as before; trait + perk stack. |
| `src/run/combat_setup.ts` | **Modify** | `buildCombatState` passes `perkId: hero.perkId` into `createHeroCombatant` overrides. |
| `src/run/run_state.ts` | **Modify** | In `completeCombat`, after computing `updatedPartyLiving`, award XP per fight type and apply level-ups. |
| `src/run/__tests__/run_state.test.ts` | **Modify** | Add cases: XP awarded to survivors, scaled by floor, boss bonus, level-up flag set; defeat awards no XP. |

---

## Task 1: Schema foundations + per-class `primaryStat`

**Goal:** Add `PerkId`, `PerkDef`, and required `primaryStat: BuffableStat` to `ClassDef`. Populate `primaryStat` on the 6 class entries. No combat or hero behavior changes yet — just types and class data.

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/classes.ts`
- Modify: `src/data/__tests__/classes.test.ts`

- [ ] **Step 1: Write the failing test for `primaryStat` on every class**

In `src/data/__tests__/classes.test.ts`, append a new `describe` block at the bottom:

```ts
import { CLASSES } from '../classes';

describe('class primaryStat', () => {
  const VALID_PRIMARIES: ReadonlyArray<string> = [
    'attack', 'defense', 'speed', 'mind', 'crit', 'dodge',
  ];

  for (const classId of Object.keys(CLASSES) as Array<keyof typeof CLASSES>) {
    it(`${classId} has a primaryStat that's a non-HP buffable stat`, () => {
      const def = CLASSES[classId];
      expect(VALID_PRIMARIES).toContain(def.primaryStat);
    });
  }
});
```

If `classes.test.ts` already has imports for `describe`/`expect`/`it` and `CLASSES`, reuse them — just append the new `describe` block.

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run src/data/__tests__/classes.test.ts`

Expected: 6 failures (one per class), each reporting `def.primaryStat` is `undefined` and not in `VALID_PRIMARIES`.

- [ ] **Step 3: Add `PerkId`, `PerkDef`, and `primaryStat` field to types**

In `src/data/types.ts`:

(a) Append `PerkId` union and `PerkDef` interface near the other trait/perk-shaped types (e.g., right after `TraitDef`):

```ts
export type PerkId =
  | 'iron_will' | 'resolute'
  | 'precise' | 'eagle_eye'
  | 'devout' | 'steadfast'
  | 'berserker' | 'tough_skin'
  | 'lethal' | 'evasive'
  | 'arcane_power' | 'quick_cast';

export interface PerkDef {
  id: PerkId;
  name: string;
  description: string;
  classId: ClassId;
  statEffects?: readonly TraitStatEffect[];
  hpEffect?: TraitHpEffect;
}
```

(b) Add a required `primaryStat: BuffableStat` field to `ClassDef` (currently lines 198-210):

```ts
export interface ClassDef {
  id: ClassId;
  name: string;
  baseStats: Stats;
  primaryStat: BuffableStat;
  preferredWeapon: WeaponType;
  weaponFamily: WeaponFamily;
  basicAbility: AbilityId;
  swapTarget?: AbilityId;
  weaponSwaps?: Partial<Record<WeaponType, AbilityId>>;
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  starterLoadout: StarterLoadout;
}
```

- [ ] **Step 4: Populate `primaryStat` on each class**

In `src/data/classes.ts`, add a `primaryStat` line to each of the 6 class entries:

```ts
knight: {
  id: 'knight',
  name: 'Knight',
  baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 5, dodge: 5 },
  primaryStat: 'defense',
  preferredWeapon: 'sword',
  // … rest unchanged
},
archer: {
  // …
  primaryStat: 'attack',
  // …
},
priest: {
  // …
  primaryStat: 'mind',
  // …
},
barbarian: {
  // …
  primaryStat: 'attack',
  // …
},
rogue: {
  // …
  primaryStat: 'crit',
  // …
},
mage: {
  // …
  primaryStat: 'mind',
  // …
},
```

The mapping is: knight→defense, archer→attack, priest→mind, barbarian→attack, rogue→crit, mage→mind.

- [ ] **Step 5: Run the classes test to confirm it passes**

Run: `npx vitest run src/data/__tests__/classes.test.ts`

Expected: PASS.

- [ ] **Step 6: Run the full test suite as a regression check**

Run: `npm test`

Expected: All tests pass. No code reads `primaryStat` yet (Task 2 will).

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`

Expected: Clean.

- [ ] **Step 8: Stage and report**

```bash
git add src/data/types.ts src/data/classes.ts src/data/__tests__/classes.test.ts
git status
```

Tell the user: **"Task 1 ready. `PerkId` / `PerkDef` types declared; `primaryStat` field added to `ClassDef` and populated on all 6 classes. Suggested commit message: `feat(classes): add primaryStat field; declare PerkId types`. Awaiting your direction to commit."**

---

## Task 2: Leveling math (`data/leveling.ts`)

**Goal:** Pure-TS module for the XP curve and level-up math. TDD'd with a comprehensive boundary test set. No coupling to combat or run state yet — just math.

**Files:**
- Create: `src/data/leveling.ts`
- Create: `src/data/__tests__/leveling.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/data/__tests__/leveling.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CLASSES } from '../classes';
import { createHero } from '../../heroes/hero';
import {
  applyLevelUps,
  LEVEL_THRESHOLDS,
  levelForXp,
  MAX_LEVEL,
  xpForBossNode,
  xpForCombatNode,
} from '../leveling';

describe('LEVEL_THRESHOLDS and MAX_LEVEL', () => {
  it('MAX_LEVEL is 5', () => {
    expect(MAX_LEVEL).toBe(5);
  });

  it('thresholds are [0, 200, 800, 2000, 4000]', () => {
    expect(LEVEL_THRESHOLDS).toEqual([0, 200, 800, 2000, 4000]);
  });
});

describe('xpForCombatNode / xpForBossNode', () => {
  it('combat node: 5 × floor', () => {
    expect(xpForCombatNode(1)).toBe(5);
    expect(xpForCombatNode(2)).toBe(10);
    expect(xpForCombatNode(3)).toBe(15);
  });

  it('boss node: 30 × floor', () => {
    expect(xpForBossNode(1)).toBe(30);
    expect(xpForBossNode(2)).toBe(60);
    expect(xpForBossNode(3)).toBe(90);
  });
});

describe('levelForXp', () => {
  it('xp 0 → level 1', () => { expect(levelForXp(0)).toBe(1); });
  it('xp 199 → level 1 (just below)', () => { expect(levelForXp(199)).toBe(1); });
  it('xp 200 → level 2 (boundary)', () => { expect(levelForXp(200)).toBe(2); });
  it('xp 799 → level 2', () => { expect(levelForXp(799)).toBe(2); });
  it('xp 800 → level 3', () => { expect(levelForXp(800)).toBe(3); });
  it('xp 1999 → level 3', () => { expect(levelForXp(1999)).toBe(3); });
  it('xp 2000 → level 4', () => { expect(levelForXp(2000)).toBe(4); });
  it('xp 3999 → level 4', () => { expect(levelForXp(3999)).toBe(4); });
  it('xp 4000 → level 5', () => { expect(levelForXp(4000)).toBe(5); });
  it('xp 99999 → level 5 (capped at MAX_LEVEL)', () => { expect(levelForXp(99999)).toBe(5); });
});

describe('applyLevelUps', () => {
  it('returns hero unchanged when no level cross', () => {
    const h = createHero('knight', 'K', 'h0', 'quick', 'body1');
    const result = applyLevelUps(h, 1, 1);
    expect(result).toEqual(h);
  });

  it('Knight L1→L2: +2 maxHp, +2 currentHp, +1 defense, level=2, no pendingPerk', () => {
    const h = createHero('knight', 'K', 'h0', 'quick', 'body1');
    const baseHp = h.maxHp;
    const baseDef = h.baseStats.defense;
    const result = applyLevelUps(h, 1, 2);
    expect(result.maxHp).toBe(baseHp + 2);
    expect(result.currentHp).toBe(h.currentHp + 2);
    expect(result.baseStats.defense).toBe(baseDef + 1);
    expect(result.level).toBe(2);
    expect(result.pendingPerk).toBe(false);
  });

  it('Rogue L1→L2: +2 crit (crit-primary special case)', () => {
    const h = createHero('rogue', 'R', 'h0', 'quick', 'body1');
    const baseCrit = h.baseStats.crit;
    const result = applyLevelUps(h, 1, 2);
    expect(result.baseStats.crit).toBe(baseCrit + 2);
  });

  it('Knight L1→L5 multi-level jump: +8 maxHp, +4 defense, pendingPerk=true', () => {
    const h = createHero('knight', 'K', 'h0', 'quick', 'body1');
    const baseHp = h.maxHp;
    const baseDef = h.baseStats.defense;
    const result = applyLevelUps(h, 1, 5);
    expect(result.maxHp).toBe(baseHp + 8);
    expect(result.baseStats.defense).toBe(baseDef + 4);
    expect(result.level).toBe(5);
    expect(result.pendingPerk).toBe(true);
  });

  it('L4→L5 sets pendingPerk', () => {
    const h = createHero('archer', 'A', 'h0', 'quick', 'body1');
    const result = applyLevelUps({ ...h, level: 4 }, 4, 5);
    expect(result.pendingPerk).toBe(true);
  });

  it('L5→L5 no-op preserves pendingPerk if already true', () => {
    const h = createHero('archer', 'A', 'h0', 'quick', 'body1');
    const atFive = { ...h, level: 5, pendingPerk: true };
    const result = applyLevelUps(atFive, 5, 5);
    expect(result).toEqual(atFive);
  });

  it('does not mutate the input hero', () => {
    const h = createHero('knight', 'K', 'h0', 'quick', 'body1');
    const baseDef = h.baseStats.defense;
    applyLevelUps(h, 1, 5);
    expect(h.baseStats.defense).toBe(baseDef);
    expect(h.level).toBe(1);
  });

  it('every class produces a level-up that bumps its primaryStat', () => {
    for (const classId of Object.keys(CLASSES) as Array<keyof typeof CLASSES>) {
      const def = CLASSES[classId];
      const h = createHero(classId, 'X', 'h0', 'quick', 'body1');
      const baseValue = h.baseStats[def.primaryStat];
      const result = applyLevelUps(h, 1, 2);
      expect(result.baseStats[def.primaryStat], `class ${classId}`)
        .toBeGreaterThan(baseValue);
    }
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run src/data/__tests__/leveling.test.ts`

Expected: Module not found / all named imports unresolved.

- [ ] **Step 3: Create `src/data/leveling.ts`**

```ts
import { CLASSES } from './classes';
import type { Hero } from '../heroes/hero';
import type { Stats } from '../combat/types';

export const MAX_LEVEL = 5;

// Cumulative XP required to reach each level. Index = level - 1.
export const LEVEL_THRESHOLDS: readonly number[] = [
  0,    // level 1
  200,  // level 2
  800,  // level 3
  2000, // level 4
  4000, // level 5
];

export function xpForCombatNode(floor: number): number {
  return 5 * floor;
}

export function xpForBossNode(floor: number): number {
  return 30 * floor;
}

export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return Math.min(level, MAX_LEVEL);
}

export function applyLevelUps(hero: Hero, prevLevel: number, newLevel: number): Hero {
  if (newLevel <= prevLevel) return hero;
  const def = CLASSES[hero.classId];
  const levels = newLevel - prevLevel;
  const hpBump = 2 * levels;
  const primaryBump = (def.primaryStat === 'crit' ? 2 : 1) * levels;
  const newBaseStats: Stats = { ...hero.baseStats };
  newBaseStats[def.primaryStat] = newBaseStats[def.primaryStat] + primaryBump;
  return {
    ...hero,
    baseStats: newBaseStats,
    maxHp: hero.maxHp + hpBump,
    currentHp: hero.currentHp + hpBump,
    level: newLevel,
    pendingPerk: hero.pendingPerk || newLevel >= MAX_LEVEL,
  };
}
```

The `applyLevelUps` function references `hero.level` and `hero.pendingPerk` which don't exist on `Hero` yet. Type-check will fail until Task 4. **This is intentional** — the next test step will compile because vitest transpiles per-file, but the regression sweep in Step 5 will surface compile errors that Task 4 resolves. To keep this task self-contained, the test-only verification here uses a hero literal that includes the future fields.

**Update the test fixture** in `src/data/__tests__/leveling.test.ts` so the hero objects passed to `applyLevelUps` include the future fields. Replace each `createHero(...)` call (in the `applyLevelUps` describe block only — `levelForXp` and the threshold tests don't construct heroes) with a wrapper:

```ts
function makeHero(classId: Parameters<typeof createHero>[0]): Hero {
  return {
    ...createHero(classId, 'X', 'h0', 'quick', 'body1'),
    xp: 0,
    level: 1,
    pendingPerk: false,
  } as Hero;
}
```

Place `makeHero` near the top of the test file and replace `createHero(...)` calls inside the `applyLevelUps` `describe` with `makeHero(classId)`. Add `import type { Hero } from '../../heroes/hero';` if not present. The `as Hero` cast is the **only** place we narrow over the schema gap; Task 4 makes the cast unnecessary (the new fields will be required on the actual `Hero` interface).

After this update, the test file references `xp/level/pendingPerk` on Hero literals — which TypeScript will accept *because of the `as` cast*.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/data/__tests__/leveling.test.ts`

Expected: PASS. All boundary, multi-level, no-op, and per-class cases green.

- [ ] **Step 5: Run the full test suite — expect type errors from Task 4 surface**

Run: `npm test`

**Expected: PASS for vitest** (vitest is permissive on type errors; transpiles per-file). The regression sweep should show all tests passing because the `as Hero` cast confines the schema gap to one fixture.

Run: `npx tsc --noEmit`

**Expected: errors in `leveling.ts` referencing `hero.level` and `hero.pendingPerk`**, plus errors in the test file's hero literal. This is expected — Task 4 closes the gap. Note the error count and proceed; do **not** add `// @ts-ignore` or similar.

If `tsc` is *clean* here (no errors), something is wrong — likely the `applyLevelUps` body doesn't actually reference the future fields. Re-verify the implementation matches Step 3.

- [ ] **Step 6: Stage and report**

```bash
git add src/data/leveling.ts src/data/__tests__/leveling.test.ts
git status
```

Tell the user: **"Task 2 ready. Pure leveling math + comprehensive tests. Note: `tsc --noEmit` reports errors on `Hero.level` / `Hero.pendingPerk` references — these resolve in Task 4 when the schema additions land. Vitest is green. Suggested commit message: `feat(leveling): XP curve and applyLevelUps`. Awaiting your direction."**

---

## Task 3: Perks data (`data/perks.ts`)

**Goal:** Author the 12 perk entries and `CLASS_PERK_PAIRS`. TDD'd via shape and pair tests. Pure data, no behavior.

**Files:**
- Create: `src/data/perks.ts`
- Create: `src/data/__tests__/perks.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/data/__tests__/perks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CLASSES } from '../classes';
import { CLASS_PERK_PAIRS, PERKS } from '../perks';
import type { ClassId, PerkId } from '../types';

const EXPECTED_IDS: readonly PerkId[] = [
  'iron_will', 'resolute',
  'precise', 'eagle_eye',
  'devout', 'steadfast',
  'berserker', 'tough_skin',
  'lethal', 'evasive',
  'arcane_power', 'quick_cast',
];

describe('PERKS map', () => {
  it('registers every expected perk id', () => {
    for (const id of EXPECTED_IDS) {
      expect(PERKS[id], `missing perk ${id}`).toBeDefined();
    }
  });

  it('has no stray entries', () => {
    expect(Object.keys(PERKS).sort()).toEqual([...EXPECTED_IDS].sort());
  });

  describe.each(EXPECTED_IDS)('perk %s', (id) => {
    it('id field matches map key', () => {
      expect(PERKS[id].id).toBe(id);
    });
    it('name and description are non-empty', () => {
      expect(PERKS[id].name.length).toBeGreaterThan(0);
      expect(PERKS[id].description.length).toBeGreaterThan(0);
    });
    it('classId is a valid ClassId', () => {
      expect(Object.keys(CLASSES)).toContain(PERKS[id].classId);
    });
    it('has at least one effect (statEffects or hpEffect)', () => {
      const p = PERKS[id];
      const hasStat = p.statEffects !== undefined && p.statEffects.length > 0;
      const hasHp = p.hpEffect !== undefined;
      expect(hasStat || hasHp).toBe(true);
    });
  });
});

describe('CLASS_PERK_PAIRS', () => {
  it('has exactly 6 entries (one per ClassId)', () => {
    const expectedClasses: ClassId[] =
      ['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage'];
    expect(Object.keys(CLASS_PERK_PAIRS).sort()).toEqual([...expectedClasses].sort());
  });

  describe.each(['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage'] as ClassId[])(
    'class %s pair',
    (classId) => {
      it('has exactly 2 distinct perks', () => {
        const pair = CLASS_PERK_PAIRS[classId];
        expect(pair).toHaveLength(2);
        expect(pair[0]).not.toBe(pair[1]);
      });
      it('both perks belong to this class', () => {
        const pair = CLASS_PERK_PAIRS[classId];
        for (const perkId of pair) {
          expect(PERKS[perkId].classId).toBe(classId);
        }
      });
    },
  );
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run src/data/__tests__/perks.test.ts`

Expected: Module not found / all named imports unresolved.

- [ ] **Step 3: Create `src/data/perks.ts`**

```ts
import type { ClassId, PerkDef, PerkId } from './types';

export const PERKS: Record<PerkId, PerkDef> = {
  iron_will: {
    id: 'iron_will',
    name: 'Iron Will',
    description: '+1 Defense',
    classId: 'knight',
    statEffects: [{ stat: 'defense', delta: 1 }],
  },
  resolute: {
    id: 'resolute',
    name: 'Resolute',
    description: '+10% HP',
    classId: 'knight',
    hpEffect: { delta: 10, mode: 'percent' },
  },
  precise: {
    id: 'precise',
    name: 'Precise',
    description: '+5% Crit',
    classId: 'archer',
    statEffects: [{ stat: 'crit', delta: 5 }],
  },
  eagle_eye: {
    id: 'eagle_eye',
    name: 'Eagle Eye',
    description: '+1 Attack',
    classId: 'archer',
    statEffects: [{ stat: 'attack', delta: 1 }],
  },
  devout: {
    id: 'devout',
    name: 'Devout',
    description: '+1 Mind',
    classId: 'priest',
    statEffects: [{ stat: 'mind', delta: 1 }],
  },
  steadfast: {
    id: 'steadfast',
    name: 'Steadfast',
    description: '+10% HP',
    classId: 'priest',
    hpEffect: { delta: 10, mode: 'percent' },
  },
  berserker: {
    id: 'berserker',
    name: 'Berserker',
    description: '+2 Attack',
    classId: 'barbarian',
    statEffects: [{ stat: 'attack', delta: 2 }],
  },
  tough_skin: {
    id: 'tough_skin',
    name: 'Tough Skin',
    description: '+1 Defense',
    classId: 'barbarian',
    statEffects: [{ stat: 'defense', delta: 1 }],
  },
  lethal: {
    id: 'lethal',
    name: 'Lethal',
    description: '+5% Crit',
    classId: 'rogue',
    statEffects: [{ stat: 'crit', delta: 5 }],
  },
  evasive: {
    id: 'evasive',
    name: 'Evasive',
    description: '+5% Dodge',
    classId: 'rogue',
    statEffects: [{ stat: 'dodge', delta: 5 }],
  },
  arcane_power: {
    id: 'arcane_power',
    name: 'Arcane Power',
    description: '+1 Mind',
    classId: 'mage',
    statEffects: [{ stat: 'mind', delta: 1 }],
  },
  quick_cast: {
    id: 'quick_cast',
    name: 'Quick Cast',
    description: '+1 Speed',
    classId: 'mage',
    statEffects: [{ stat: 'speed', delta: 1 }],
  },
};

export const CLASS_PERK_PAIRS: Record<ClassId, readonly [PerkId, PerkId]> = {
  knight:    ['iron_will',    'resolute'],
  archer:    ['precise',      'eagle_eye'],
  priest:    ['devout',       'steadfast'],
  barbarian: ['berserker',    'tough_skin'],
  rogue:     ['lethal',       'evasive'],
  mage:      ['arcane_power', 'quick_cast'],
};
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/data/__tests__/perks.test.ts`

Expected: PASS — every shape check, every per-class pair check.

- [ ] **Step 5: Stage and report**

```bash
git add src/data/perks.ts src/data/__tests__/perks.test.ts
git status
```

Tell the user: **"Task 3 ready. 12 perks defined, `CLASS_PERK_PAIRS` for all 6 classes. Suggested commit message: `feat(perks): 12 class-specific perks and CLASS_PERK_PAIRS`. Awaiting your direction."**

---

## Task 4: Hero schema additions + save normalization

**Goal:** Add `xp`, `level`, `pendingPerk`, `perkId?` to `Hero`; default in `createHero`; backfill at save load. Update the one test fixture (`fakeHero`) that constructs a Hero literal directly. After this task, `tsc --noEmit` is fully clean.

**Files:**
- Modify: `src/heroes/hero.ts`
- Modify: `src/heroes/__tests__/hero.test.ts`
- Modify: `src/items/__tests__/equip.test.ts`
- Modify: `src/save/save.ts`
- Modify: `src/save/__tests__/save.test.ts`

- [ ] **Step 1: Write the failing test for `createHero` defaults**

In `src/heroes/__tests__/hero.test.ts`, append a new case inside the existing `describe('createHero — basic shape', ...)` block:

```ts
  it('defaults xp=0, level=1, pendingPerk=false; perkId undefined', () => {
    const h = createHero('knight', 'K', 'h1', 'quick', 'body1');
    expect(h.xp).toBe(0);
    expect(h.level).toBe(1);
    expect(h.pendingPerk).toBe(false);
    expect(h.perkId).toBeUndefined();
  });
```

- [ ] **Step 2: Write the failing test for save normalization**

In `src/save/__tests__/save.test.ts`, append a new case at the end:

```ts
describe('load — normalize legacy heroes missing xp/level/pendingPerk', () => {
  it('fills defaults on heroes from a save predating leveling', () => {
    const storage = new MemoryStorage();
    const legacyHero = {
      id: 'h0',
      classId: 'knight' as const,
      name: 'Old Hero',
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 5, dodge: 5 },
      currentHp: 20,
      maxHp: 20,
      traitId: 'stout' as const,
      bodySpriteId: 'body1',
      wounds: [],
      equipment: {
        weapon: {
          id: 'w0',
          baseId: 'sword_basic' as const,
          slot: 'weapon' as const,
          rarity: 'common' as const,
          weaponType: 'sword' as const,
          affixes: [],
          floorRolledAt: 1,
        },
      },
      // xp / level / pendingPerk intentionally absent
    };
    const legacy = {
      version: 1,
      roster: { heroes: [legacyHero], capacity: 12 },
      vault: { gold: 0 },
      stash: createStash(),
      unlocks: createDefaultUnlocks(),
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(legacy));

    const loaded = load(storage);
    expect(loaded).not.toBeNull();
    const hero = loaded!.roster.heroes[0];
    expect(hero.xp).toBe(0);
    expect(hero.level).toBe(1);
    expect(hero.pendingPerk).toBe(false);
    expect(hero.perkId).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the new tests to confirm they fail**

Run: `npx vitest run src/heroes/__tests__/hero.test.ts src/save/__tests__/save.test.ts`

Expected: failures — `createHero` doesn't set the fields; `load` returns heroes without the fields.

- [ ] **Step 4: Update `Hero` interface + `createHero` defaults**

In `src/heroes/hero.ts`, update the `Hero` interface:

```ts
import type {
  ClassId, HeroEquipment, Item, ItemBaseId, ItemSlot,
  PerkId, StarterLoadout, TraitDef, TraitId, Wound,
} from '../data/types';

export interface Hero {
  id: string;
  classId: ClassId;
  name: string;
  baseStats: Stats;
  currentHp: number;
  maxHp: number;
  traitId: TraitId;
  bodySpriteId: string;
  wounds: Wound[];
  equipment: HeroEquipment;
  xp: number;
  level: number;
  pendingPerk: boolean;
  perkId?: PerkId;
}
```

Update `createHero` to default the new fields:

```ts
export function createHero(
  classId: ClassId,
  name: string,
  id: string,
  traitId: TraitId,
  bodySpriteId: string,
): Hero {
  const def = CLASSES[classId];
  const equipment = buildStarterEquipment(id, def.starterLoadout);
  const maxHp = computeMaxHp(def.baseStats.hp, TRAITS[traitId], equipment);
  return {
    id,
    classId,
    name,
    baseStats: { ...def.baseStats },
    currentHp: maxHp,
    maxHp,
    traitId,
    bodySpriteId,
    wounds: [],
    equipment,
    xp: 0,
    level: 1,
    pendingPerk: false,
  };
}
```

- [ ] **Step 5: Update the `fakeHero` fixture in `equip.test.ts`**

In `src/items/__tests__/equip.test.ts`, find `fakeHero` (around lines 16-28) and add the new fields:

```ts
const fakeHero = (overrides: Partial<Hero> = {}): Hero => ({
  id: 'h1',
  classId: 'knight',
  name: 'Test',
  baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 5, dodge: 5 },
  currentHp: 20,
  maxHp: 20,
  traitId: 'stout',
  bodySpriteId: '0',
  wounds: [],
  equipment: { weapon: fake('w0', 'weapon') },
  xp: 0,
  level: 1,
  pendingPerk: false,
  ...overrides,
});
```

- [ ] **Step 6: Update `normalizeSaveFile` to backfill heroes**

In `src/save/save.ts`, find `normalizeSaveFile` (currently lines 95-100). Replace it with a version that also normalizes heroes:

```ts
function normalizeSaveFile(file: SaveFile): SaveFile {
  return {
    ...file,
    stash: file.stash ?? createStash(),
    roster: {
      ...file.roster,
      heroes: file.roster.heroes.map(normalizeHero),
    },
  };
}

function normalizeHero(hero: Hero): Hero {
  return {
    ...hero,
    xp: hero.xp ?? 0,
    level: hero.level ?? 1,
    pendingPerk: hero.pendingPerk ?? false,
  };
}
```

Add the import at the top of `src/save/save.ts`:

```ts
import type { Hero } from '../heroes/hero';
```

(Verify against existing imports — the file already imports `Roster`; the `Hero` import may need to be added. Vitest will surface the missing import.)

- [ ] **Step 7: Update the leveling test fixture cast (now redundant)**

In `src/data/__tests__/leveling.test.ts`, the `makeHero` wrapper from Task 2 still has `as Hero` casts and an explicit `xp/level/pendingPerk` spread. Now that `createHero` returns these fields directly, the wrapper can simplify:

```ts
function makeHero(classId: Parameters<typeof createHero>[0]): Hero {
  return createHero(classId, 'X', 'h0', 'quick', 'body1');
}
```

The `as Hero` cast and explicit spread are no longer needed. Remove the `import type { Hero } from '../../heroes/hero';` if it becomes unused (TypeScript will flag).

- [ ] **Step 8: Run the failing tests to confirm they now pass**

Run: `npx vitest run src/heroes/__tests__/hero.test.ts src/save/__tests__/save.test.ts src/data/__tests__/leveling.test.ts`

Expected: PASS for all three files.

- [ ] **Step 9: Run the full test suite + type-check**

Run: `npm test`

Expected: All tests pass.

Run: `npx tsc --noEmit`

Expected: **Clean** — the `Hero` schema now matches what `applyLevelUps` reads, so all type errors from Task 2 resolve.

- [ ] **Step 10: Stage and report**

```bash
git add src/heroes/hero.ts src/heroes/__tests__/hero.test.ts \
        src/items/__tests__/equip.test.ts \
        src/save/save.ts src/save/__tests__/save.test.ts \
        src/data/__tests__/leveling.test.ts
git status
```

Tell the user: **"Task 4 ready. Hero schema gains xp/level/pendingPerk/perkId; createHero defaults them; save loader backfills legacy heroes; one test fixture updated. tsc clean. Suggested commit message: `feat(hero): add xp / level / pendingPerk fields with save backfill`. Awaiting your direction."**

---

## Task 5: Combat-side perk evaluation

**Goal:** Wire perks into combat stat lookups. `Combatant.perkId` field, `getEffectiveStat` extension, `buildCombatState` pass-through. Tests pin the new behavior.

**Files:**
- Modify: `src/combat/types.ts`
- Modify: `src/combat/statuses.ts`
- Modify: `src/combat/__tests__/statuses.test.ts`
- Modify: `src/run/combat_setup.ts`

- [ ] **Step 1: Write the failing tests**

In `src/combat/__tests__/statuses.test.ts`, append a new `describe` block at the bottom:

```ts
describe('getEffectiveStat — perk evaluation', () => {
  it('Precise combatant adds +5 to crit', () => {
    const c = makeHeroCombatant('archer', 1, 'p0', { perkId: 'precise' });
    expect(getEffectiveStat(c, 'crit')).toBe(c.baseStats.crit + 5);
  });

  it('Combatant with no perkId reads base + statuses + traits only', () => {
    const c = makeHeroCombatant('knight', 1, 'p0');
    expect(c.perkId).toBeUndefined();
    expect(getEffectiveStat(c, 'attack')).toBe(c.baseStats.attack);
  });

  it('Trait Sturdy + perk Iron Will stack additively on defense', () => {
    const c = makeHeroCombatant('knight', 1, 'p0', {
      traitId: 'sturdy',
      perkId: 'iron_will',
    });
    expect(getEffectiveStat(c, 'defense')).toBe(c.baseStats.defense + 1 + 1);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run src/combat/__tests__/statuses.test.ts`

Expected: failures — `Combatant` rejects `perkId` field; `getEffectiveStat` doesn't apply perk effects.

- [ ] **Step 3: Add `perkId` to `Combatant`**

In `src/combat/types.ts`, find the `Combatant` interface (around lines 34-58) and add the optional field next to `traitId`:

```ts
import type {
  AbilityEffect,
  AbilityId,
  ClassId,
  CombatantTag,
  EnemyId,
  PerkId,
  SlotIndex,
  StatusId,
  TraitId,
  WoundId,
} from '../data/types';

// …

export interface Combatant {
  // … existing fields up to traitId
  traitId?: TraitId;
  perkId?: PerkId;
  damageTakenMultiplier?: number;
  // … rest unchanged
}
```

The `PerkId` import is the only new line in the import block.

- [ ] **Step 4: Extend `getEffectiveStat` to walk perk effects**

In `src/combat/statuses.ts`, add the perk import at the top:

```ts
import { PERKS } from '../data/perks';
import { TRAITS } from '../data/traits';
import type { BuffableStat, TraitCondition } from '../data/types';
import type { Combatant, CombatantId, CombatEvent } from './types';
```

Inside `getEffectiveStat`, append a new perk-evaluation block after the existing trait-evaluation block (currently around lines 19-26):

```ts
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

  for (const status of Object.values(combatant.statuses)) {
    const e = status.effect;
    if ((e.kind === 'buff' || e.kind === 'debuff') && e.stat === stat) {
      total += e.delta;
    }
  }
  return total;
}
```

The HP exclusion (`stat !== 'hp'`) matches the trait rule — HP-effect perks (Resolute, Steadfast) are applied at perk-pick time, not per stat lookup.

- [ ] **Step 5: Pass `perkId` through `buildCombatState`**

In `src/run/combat_setup.ts`, find the heroes loop inside `buildCombatState` (around lines 52-72). Add the `perkId` pass-through to the `createHeroCombatant` overrides:

```ts
combatants.push(
  createHeroCombatant(hero.classId, (i + 1) as SlotIndex, `p${i}`, {
    baseStats: fullStats,
    currentHp: Math.min(hero.currentHp, woundedMaxHp),
    maxHp: woundedMaxHp,
    traitId: hero.traitId,
    abilities,
    aiPriority,
    ...(hero.perkId !== undefined ? { perkId: hero.perkId } : {}),
    ...(damageTakenMultiplier !== 1 ? { damageTakenMultiplier } : {}),
    ...rareFields,
  }),
);
```

The conditional spread keeps the override map free of an explicit `perkId: undefined` for heroes without a perk.

- [ ] **Step 6: Run the new tests to confirm they pass**

Run: `npx vitest run src/combat/__tests__/statuses.test.ts`

Expected: PASS for the new `describe` block plus all existing trait/status cases.

- [ ] **Step 7: Run the full test suite + type-check**

Run: `npm test`

Expected: All tests pass.

Run: `npx tsc --noEmit`

Expected: Clean.

- [ ] **Step 8: Stage and report**

```bash
git add src/combat/types.ts src/combat/statuses.ts \
        src/combat/__tests__/statuses.test.ts \
        src/run/combat_setup.ts
git status
```

Tell the user: **"Task 5 ready. `Combatant.perkId` field; `getEffectiveStat` applies perk stat effects after traits; `buildCombatState` pipes `hero.perkId` through. Suggested commit message: `feat(combat): apply perk stat effects in getEffectiveStat`. Awaiting your direction."**

---

## Task 6: XP awards in `completeCombat`

**Goal:** Wire XP into `completeCombat`. Surviving heroes gain XP per the curve; level-ups apply via `applyLevelUps`. Defeat path unaffected. Tests pin the per-fight, per-floor, and level-up-on-cross behaviors.

**Files:**
- Modify: `src/run/run_state.ts`
- Modify: `src/run/__tests__/run_state.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/run/__tests__/run_state.test.ts`, append a new `describe` block at the end of the file (after the existing `describe('completeCombat — loot drop', ...)` block):

```ts
describe('completeCombat — XP awards', () => {
  it('awards 5×floor XP to survivors after a floor-1 combat-node victory', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [18, 10, 12], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(5);
      expect(hero.level).toBe(1);
    }
  });

  it('awards 30×floor XP after a boss victory', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Advance to the boss node (floor 1 has 3 combat + 1 boss).
    for (let i = 0; i < 3; i++) {
      rs = completeCombat(rs, mockCombatResult(rs.party, [20, 14, 15], 'player_victory'), createRng(99)).runState;
    }
    const bossResult = mockCombatResult(rs.party, [20, 14, 15], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, bossResult, createRng(99));
    // Each survivor accumulated 3 × 5 (combat) + 30 (boss) = 45 XP.
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(45);
    }
  });

  it('does not award XP to dead heroes (combatant isDead)', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [18, 0, 12], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(5);
    }
    // Dead hero went into fallen, did not receive XP.
    expect(rs2.fallen).toHaveLength(1);
    expect(rs2.fallen[0].xp).toBe(0);
  });

  it('does not award XP on player_defeat', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const result = mockCombatResult(rs.party, [0, 0, 0], 'player_defeat');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    expect(rs2.party).toHaveLength(0);
    for (const hero of rs2.fallen) {
      expect(hero.xp).toBe(0);
    }
  });

  it('crossing the level-2 threshold applies stat bumps', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Pre-load each hero with 195 XP so the next 5-XP combat reward crosses 200.
    rs = {
      ...rs,
      party: rs.party.map((h) => ({ ...h, xp: 195 })),
    };
    const result = mockCombatResult(rs.party, [18, 10, 12], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(200);
      expect(hero.level).toBe(2);
    }
    // Knight got +1 defense; archer got +1 attack; priest got +1 mind.
    const knight = rs2.party.find((h) => h.classId === 'knight')!;
    expect(knight.baseStats.defense).toBe(5); // base 4 + 1
  });

  it('crossing to level 5 sets pendingPerk', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = {
      ...rs,
      party: rs.party.map((h) => ({ ...h, xp: 3995, level: 4 })),
    };
    const result = mockCombatResult(rs.party, [18, 10, 12], 'player_victory');
    const { runState: rs2 } = completeCombat(rs, result, createRng(99));
    for (const hero of rs2.party) {
      expect(hero.xp).toBe(4000);
      expect(hero.level).toBe(5);
      expect(hero.pendingPerk).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run src/run/__tests__/run_state.test.ts`

Expected: Failures — XP not awarded; `level`/`pendingPerk` unchanged after combat.

- [ ] **Step 3: Wire XP awards into `completeCombat`**

In `src/run/run_state.ts`, add imports near the top (alongside existing imports):

```ts
import { applyLevelUps, levelForXp, xpForBossNode, xpForCombatNode } from '../data/leveling';
```

Inside `completeCombat`, find the section that runs after `updatedPartyLiving` is built and before the `player_defeat` check (currently around lines 100-102). Insert the XP-award pass:

```ts
  // … existing code that builds updatedPartyLiving / newFallen …

  if (result.outcome === 'player_defeat') {
    // … existing wipe path unchanged
  }

  // XP awards — only on victory, only to survivors. Award amount depends on node type.
  const completedNode = runState.currentFloorNodes[runState.currentNodeIndex];
  const isBoss = completedNode.type === 'boss';
  const xpReward = isBoss
    ? xpForBossNode(runState.currentFloorNumber)
    : xpForCombatNode(runState.currentFloorNumber);

  const partyAfterXp = updatedPartyLiving.map((hero) => {
    const newXp = hero.xp + xpReward;
    const newLevel = levelForXp(newXp);
    return applyLevelUps({ ...hero, xp: newXp }, hero.level, newLevel);
  });

  // … existing reward / loot / fallen-gear-transfer code unchanged, except
  // replace `updatedPartyLiving` with `partyAfterXp` in the two return objects below.
```

Update the two return-statement bodies in `completeCombat` to use `partyAfterXp` instead of `updatedPartyLiving` for the `party` field:

```ts
  if (isBoss) {
    return {
      runState: {
        ...runState,
        party: partyAfterXp,
        fallen: [...runState.fallen, ...newFallen],
        pack: newPack,
        status: 'camp_screen',
      },
    };
  }

  return {
    runState: {
      ...runState,
      party: partyAfterXp,
      fallen: [...runState.fallen, ...newFallen],
      pack: newPack,
      status: 'in_dungeon',
      currentNodeIndex: runState.currentNodeIndex + 1,
    },
  };
}
```

The defeat path is unchanged — `updatedPartyLiving` only feeds into `allLost` there, which doesn't gain XP.

**Note on the `completedNode.type === 'boss'` reference:** the existing code already computes `isBoss` for gold-reward purposes (around line 122). The refactor here moves the `isBoss` computation up so XP-reward and gold-reward both share it. Verify by reading the surrounding code that there's no duplicate `isBoss` declaration after the move; if so, delete the lower one.

- [ ] **Step 4: Run the new tests to confirm they pass**

Run: `npx vitest run src/run/__tests__/run_state.test.ts`

Expected: PASS — all 6 new XP cases plus all existing run_state cases.

- [ ] **Step 5: Run the full test suite + type-check**

Run: `npm test`

Expected: All tests pass.

Run: `npx tsc --noEmit`

Expected: Clean.

- [ ] **Step 6: Stage and report**

```bash
git add src/run/run_state.ts src/run/__tests__/run_state.test.ts
git status
```

Tell the user: **"Task 6 ready. `completeCombat` awards XP to survivors per the curve; level-ups apply on the spot; level-5 crossings set `pendingPerk`. Defeat path untouched. Suggested commit message: `feat(run): award XP and apply level-ups in completeCombat`. Awaiting your direction."**

---

## Post-implementation: TODO and HISTORY

After Task 6 is committed, the user typically migrates the TODO entry into HISTORY. Don't do this unprompted — wait for direction. The TODO entry to migrate is the Cluster A · 7 entry in [`TODO.md`](../../../TODO.md). Per the [slim HISTORY entry policy](../../../CLAUDE.md), keep the new HISTORY entry to ~15-25 lines: Why / Decisions / Surprises / Source.

Suggested HISTORY-entry sketch (write it on the day work completes, newest-on-top):

```markdown
### YYYY-MM-DD · Hero leveling + level-5 perks (Cluster A · 7)

**Why:** With traits and gear in place, heroes had no second axis of progression — every Knight played identically across runs. Adds the gdd's "rookies become legends" arc: surviving heroes earn XP per fight, level up with deterministic stat bumps, and at level 5 unlock a class-specific choice of two minor perks. Foundation only — picker UI is Cluster B · 8.

**Decisions:**
- **Class-specific perk pairs over universal pairs.** 12 hand-tuned perks (2 per class) reinforce class identity at the level-5 milestone — Mage gets Arcane Power vs Quick Cast, Rogue gets Lethal vs Evasive. Avoids the "Mage offered Heavy Plate" mismatch problem of pooled rolling. Authoring scope (12 entries) matches the trait pool that just shipped.
- **Level cap 5 in Tier 2.** Gdd defines level-5 + level-10 perks; level 10 ships with Tier 3 alongside the Sunken Keep difficulty curve. Cap is a single constant; trivial to extend.
- **XP applied per-fight, mid-run.** Simpler data flow than per-run accumulation; level-up moments land as in-fight beats; no `runXp` shadow counter to keep in sync. `pendingPerk` flag lives on the Hero, persists across save-during-run, and is cleared by Cluster B · 8.
- **Crit-primary classes get +2 per level**, others +1. A level-5 Rogue with the +1 rule would gain +4 Crit (≈ negligible at integer-percent); +2 keeps progression visible for a class whose identity is built on crit.
- **Perks reuse `TraitStatEffect` / `TraitHpEffect` shapes verbatim.** No new effect kinds; `getEffectiveStat` extends with one analogous loop. Future conditional perks pick up `inSlot` / `belowHpRatio` for free.

**Surprises:**
- The save normalizer was the riskiest piece — heroes from saves predating leveling needed `xp/level/pendingPerk` defaulted at load. Adding a `normalizeHero` helper alongside the existing stash backfill kept the change additive; pre-launch policy meant no schema bump.
- `completeCombat` in `run_state.ts` already does ~5 things (HP/wound update, fallen separation, gold reward, loot, fallen-gear transfer); adding XP makes 6. If a 7th lands, splitting becomes worthwhile — flagged but not addressed here.

**Source:** TODO.md Cluster A · 7 → spec at `docs/superpowers/specs/2026-04-28-hero-leveling-design.md` → plan at `docs/superpowers/plans/2026-04-28-hero-leveling.md`.
```

---

## Self-review notes

Reviewed the plan against the spec:

- **Spec coverage:** Every section has a task. Schema changes (`PerkId`, `PerkDef`, `primaryStat`, `Hero` fields, `Combatant.perkId`) → Tasks 1, 4, 5. Behavior (XP curve, `applyLevelUps`, `getEffectiveStat` extension, `completeCombat` hook) → Tasks 2, 5, 6. Data (perk catalog, class primary stats) → Tasks 1, 3. Save backfill → Task 4. Tests cover all the spec's listed cases.
- **Type consistency:** `PerkId` declared in Task 1, used in Tasks 3, 4, 5. `applyLevelUps(hero, prevLevel, newLevel)` signature consistent across Task 2 implementation and Task 6 call site. `xpForCombatNode(floor)` / `xpForBossNode(floor)` signatures match. `Hero.xp` / `Hero.level` / `Hero.pendingPerk` field names match across Task 4 schema, Task 6 wiring, and all tests.
- **Inter-task type gap:** Task 2 implements `applyLevelUps` which references `Hero.level` / `Hero.pendingPerk` before they exist on the type (Task 4 adds them). Task 2's Step 5 explicitly notes this expected `tsc` failure and Task 4's Step 9 confirms `tsc` is clean afterward. The vitest suite stays green throughout because vitest transpiles per-file.
- **No placeholders:** Every step has actual code or a precise command. The HISTORY-entry sketch uses `YYYY-MM-DD` because the completion date isn't known yet — documentation, not implementation.
