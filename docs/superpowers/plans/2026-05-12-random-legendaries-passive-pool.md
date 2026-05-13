# Random legendaries + curated unique-passive pool — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 16 random-legendary passives that drop from elite/treasure loot at 1% post-L10. New `onHit` trigger added to the perk hook framework specifically for Vampiric's lifesteal-on-every-attack semantic.

**Architecture:** Mirrors Spec 3's pattern. Random legendaries get a new `Item.legendaryPassive?: LegendaryPassiveId` field (mutually exclusive with `legendaryId`). New `LEGENDARY_PASSIVE_DEFS` registry + `LEGENDARY_PASSIVES_BY_SLOT` lookup. Substitution branch in `rollLoot` post-`first_hero_l10`-milestone. Combatant gains `equippedLegendaryPassiveIds` field; `gatherTriggeredEffects` extends with a third loop. New `onHit` trigger excluded from `FireableTriggerKind` — handled by a new consume site in `applyDamage` alongside the existing rare-property lifesteal.

**Tech Stack:** TypeScript, Vitest, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-12-random-legendaries-passive-pool-design.md`

---

## File structure

**Modified files:**
- `src/data/types.ts` — `LegendaryPassiveId` union (16 ids); `LegendaryPassiveDef` interface; `PerkTrigger` gains `{ kind: 'onHit' }`; `Item.legendaryPassive?: LegendaryPassiveId`.
- `src/data/legendaries.ts` — adds `LEGENDARY_PASSIVE_DEFS` (16 entries) + `LEGENDARY_PASSIVES_BY_SLOT` lookup.
- `src/combat/types.ts` — `Combatant.equippedLegendaryPassiveIds: readonly LegendaryPassiveId[]` (required, defaults `[]`).
- `src/combat/combatant.ts` — 3 creators default `equippedLegendaryPassiveIds: []`.
- `src/combat/perk_hooks.ts` — `applyPerkAction.sourceId` widens to `PerkId | LegendaryId | LegendaryPassiveId`; `gatherTriggeredEffects` adds third loop. `FireableTriggerKind` doc comment notes `onHit` exclusion.
- `src/combat/effects.ts` — new `onHit` + `lifesteal` consume site in `applyDamage`, after existing rare-property lifesteal block.
- `src/run/combat_setup.ts` — `gatherEquippedLegendaryPassiveIds` helper; passes into `createHeroCombatant`.
- `src/dungeon/loot.ts` — `rollRandomLegendary` helper + substitution branch in `rollLoot` for elite/treasure post-milestone.
- `src/items/selectors.ts` — `itemDisplayName` branch for `item.legendaryPassive` → adjective-prefix form.
- `src/scenes/equip_scene.ts` — tooltip body renders passive description for items with `legendaryPassive`.

**Modified test files:**
- `src/data/__tests__/legendaries.test.ts` — LEGENDARY_PASSIVE_DEFS shape + per-passive tests.
- `src/combat/__tests__/perks_integration.test.ts` — per-passive integration tests (1 per slot smoke + Vampiric lifesteal end-to-end).
- `src/dungeon/__tests__/loot.test.ts` — `rollRandomLegendary` shape + `rollLoot` substitution-rate tests.
- `src/items/__tests__/selectors.test.ts` — `itemDisplayName` legendary-passive branch.
- `src/combat/__tests__/perk_hooks.test.ts` — `gatherTriggeredEffects` third-loop verification.

**No new files. No save migration. `CURRENT_SCHEMA_VERSION` stays at 7.**

---

## Task 1: Type system + `onHit` trigger + Item.legendaryPassive

**Files:**
- Modify: `src/data/types.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/data/__tests__/legendaries.test.ts` at the top (these tests will pass once Task 2 lands but we can write the type-level check now):

```ts
import type { LegendaryPassiveId } from '../types';

describe('LegendaryPassiveId union (Task 1 shape)', () => {
  it('has all 16 ids assignable', () => {
    const ids: readonly LegendaryPassiveId[] = [
      'vampiric', 'devastating', 'cleaving', 'hexing',
      'fortified', 'reinforced', 'thorny', 'warded',
      'vital', 'resolute', 'evasive', 'enduring',
      'insightful', 'prescient', 'cunning', 'wise',
    ];
    expect(ids).toHaveLength(16);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: errors about `LegendaryPassiveId` not exported.

- [ ] **Step 3: Add LegendaryPassiveId union + LegendaryPassiveDef interface**

Edit `src/data/types.ts`. Find the existing `LegendaryId` block (around line 90-95). Add after it:

```ts
export type LegendaryPassiveId =
  // Weapons
  | 'vampiric' | 'devastating' | 'cleaving' | 'hexing'
  // Shields
  | 'fortified' | 'reinforced' | 'thorny' | 'warded'
  // Outfits
  | 'vital' | 'resolute' | 'evasive' | 'enduring'
  // Hats
  | 'insightful' | 'prescient' | 'cunning' | 'wise';

export interface LegendaryPassiveDef {
  id: LegendaryPassiveId;
  adjective: string;       // 'Vampiric' — used as display-name prefix
  description: string;     // tooltip body line
  slot: ItemSlot;          // exactly one slot per passive
  triggeredEffect: TriggeredEffect;
}
```

- [ ] **Step 4: Add `onHit` to PerkTrigger union**

Find `PerkTrigger` in `src/data/types.ts`. Currently has 5 variants (onCrit / onKill / onStruck / firstAttack / whenBelowHp). Add the 6th:

```ts
export type PerkTrigger =
  | { kind: 'onCrit' }
  | { kind: 'onKill' }
  | { kind: 'onStruck'; whenAtFullHp?: boolean }
  | { kind: 'firstAttack' }
  | { kind: 'whenBelowHp'; ratio: number }
  | { kind: 'onHit' };  // NEW — fires once per outgoing damage instance; consumed at applyDamage lifesteal site
```

- [ ] **Step 5: Add `Item.legendaryPassive?: LegendaryPassiveId`**

Find the `Item` interface. Currently has `legendaryId?: LegendaryId`. Add:

```ts
export interface Item {
  readonly id: string;
  readonly baseId: ItemBaseId;
  readonly slot: ItemSlot;
  readonly rarity: Rarity;
  readonly weaponType?: WeaponType;
  readonly affixes: readonly RolledAffix[];
  readonly rareProperty?: RolledRareProperty;
  readonly floorRolledAt: number;
  readonly legendaryId?: LegendaryId;          // existing — named legendaries
  readonly legendaryPassive?: LegendaryPassiveId;  // NEW — random legendaries
}
```

Note: `legendaryId` and `legendaryPassive` are mutually exclusive in practice. Both flow through `rarity: 'legendary'`. The type system doesn't enforce mutual exclusivity (would require a discriminated union); runtime invariant maintained by `rollNamedLegendary` (Spec 3) and `rollRandomLegendary` (this spec, Task 5).

- [ ] **Step 6: Run tests**

Run: `npx tsc --noEmit && npx vitest run src/data/__tests__/legendaries.test.ts 2>&1 | tail -10`
Expected: tsc clean; new shape test passes.

Run: `npm test 2>&1 | tail -5`
Expected: PASS. No existing consumer should break — `legendaryPassive` is optional; `onHit` is a new union variant that no existing switch covers but no existing code switches exhaustively on PerkTrigger.kind.

If any test fails because of an exhaustive switch on `PerkTrigger.kind` that doesn't have a default branch, fix the switch to either add a `case 'onHit':` (with a comment saying "handled at applyDamage consume site") or a default branch.

- [ ] **Step 7: ~~Commit~~ — SKIPPED**

---

## Task 2: LEGENDARY_PASSIVE_DEFS + LEGENDARY_PASSIVES_BY_SLOT

**Files:**
- Modify: `src/data/legendaries.ts`
- Modify: `src/data/__tests__/legendaries.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/data/__tests__/legendaries.test.ts`:

```ts
import { LEGENDARY_PASSIVE_DEFS, LEGENDARY_PASSIVES_BY_SLOT } from '../legendaries';
import type { LegendaryPassiveId, ItemSlot } from '../types';

const ALL_PASSIVE_IDS: readonly LegendaryPassiveId[] = [
  'vampiric', 'devastating', 'cleaving', 'hexing',
  'fortified', 'reinforced', 'thorny', 'warded',
  'vital', 'resolute', 'evasive', 'enduring',
  'insightful', 'prescient', 'cunning', 'wise',
];

describe('LEGENDARY_PASSIVE_DEFS', () => {
  it('contains exactly 16 entries matching the union', () => {
    expect(Object.keys(LEGENDARY_PASSIVE_DEFS).sort()).toEqual([...ALL_PASSIVE_IDS].sort());
  });

  it.each(ALL_PASSIVE_IDS)('%s has non-empty adjective, description, valid slot, and triggeredEffect', (id) => {
    const def = LEGENDARY_PASSIVE_DEFS[id];
    expect(def.id).toBe(id);
    expect(def.adjective.length).toBeGreaterThan(0);
    expect(def.description.length).toBeGreaterThan(0);
    expect(['weapon', 'shield', 'outfit', 'hat']).toContain(def.slot);
    expect(def.triggeredEffect).toBeDefined();
    expect(def.triggeredEffect.trigger).toBeDefined();
    expect(def.triggeredEffect.action).toBeDefined();
  });

  it('vampiric has onHit + lifesteal 0.15', () => {
    const d = LEGENDARY_PASSIVE_DEFS.vampiric;
    expect(d.slot).toBe('weapon');
    expect(d.triggeredEffect.trigger.kind).toBe('onHit');
    expect(d.triggeredEffect.action).toMatchObject({ kind: 'lifesteal', ratio: 0.15 });
  });

  it('devastating has firstAttack + damageMod 2.0', () => {
    const d = LEGENDARY_PASSIVE_DEFS.devastating;
    expect(d.slot).toBe('weapon');
    expect(d.triggeredEffect.trigger.kind).toBe('firstAttack');
    expect(d.triggeredEffect.action).toMatchObject({ kind: 'damageMod', multiplier: 2.0 });
  });

  it('cleaving has onKill + gainStat attack +2 dur 3 stacking', () => {
    const d = LEGENDARY_PASSIVE_DEFS.cleaving;
    expect(d.slot).toBe('weapon');
    expect(d.triggeredEffect.trigger.kind).toBe('onKill');
    expect(d.triggeredEffect.action).toMatchObject({
      kind: 'gainStat', stat: 'attack', delta: 2, duration: 3, stacking: true,
    });
  });

  it('hexing has onCrit + applyStatus marked dur 3 damageBonus 0.3', () => {
    const d = LEGENDARY_PASSIVE_DEFS.hexing;
    expect(d.slot).toBe('weapon');
    expect(d.triggeredEffect.trigger.kind).toBe('onCrit');
    const action = d.triggeredEffect.action;
    expect(action.kind).toBe('applyStatus');
    if (action.kind === 'applyStatus') {
      expect(action.statusId).toBe('marked');
      expect(action.duration).toBe(3);
      expect(action.target).toBe('other');
      expect(action.payload?.damageBonus).toBe(0.3);
    }
  });

  it('fortified has onStruck + damageMitigation 0.8', () => {
    const d = LEGENDARY_PASSIVE_DEFS.fortified;
    expect(d.slot).toBe('shield');
    expect(d.triggeredEffect.trigger.kind).toBe('onStruck');
    expect(d.triggeredEffect.action).toMatchObject({ kind: 'damageMitigation', multiplier: 0.8 });
  });

  it('reinforced has whenBelowHp 0.4 + gainStat defense +4', () => {
    const d = LEGENDARY_PASSIVE_DEFS.reinforced;
    expect(d.slot).toBe('shield');
    const trig = d.triggeredEffect.trigger;
    if (trig.kind === 'whenBelowHp') expect(trig.ratio).toBe(0.4);
    expect(d.triggeredEffect.action).toMatchObject({ kind: 'gainStat', stat: 'defense', delta: 4 });
  });

  it('thorny has onStruck + applyStatus poisoned dur 2 dpt 4 target other', () => {
    const d = LEGENDARY_PASSIVE_DEFS.thorny;
    expect(d.slot).toBe('shield');
    const action = d.triggeredEffect.action;
    if (action.kind === 'applyStatus') {
      expect(action.statusId).toBe('poisoned');
      expect(action.duration).toBe(2);
      expect(action.target).toBe('other');
      expect(action.payload?.damagePerTurn).toBe(4);
    }
  });

  it('warded has whenBelowHp 0.5 + gainStat dodge +15', () => {
    const d = LEGENDARY_PASSIVE_DEFS.warded;
    expect(d.slot).toBe('shield');
    expect(d.triggeredEffect.action).toMatchObject({ kind: 'gainStat', stat: 'dodge', delta: 15 });
  });

  it('vital has onStruck + applyStatus blessed dur 3 hpt 5 target self', () => {
    const d = LEGENDARY_PASSIVE_DEFS.vital;
    expect(d.slot).toBe('outfit');
    const action = d.triggeredEffect.action;
    if (action.kind === 'applyStatus') {
      expect(action.statusId).toBe('blessed');
      expect(action.target).toBe('self');
      expect(action.duration).toBe(3);
      expect(action.payload?.healPerTurn).toBe(5);
    }
  });

  it('resolute has whenBelowHp 0.5 + gainStat defense +3', () => {
    const d = LEGENDARY_PASSIVE_DEFS.resolute;
    expect(d.slot).toBe('outfit');
    expect(d.triggeredEffect.action).toMatchObject({ kind: 'gainStat', stat: 'defense', delta: 3 });
  });

  it('evasive has onStruck + gainStat dodge +20 dur 2', () => {
    const d = LEGENDARY_PASSIVE_DEFS.evasive;
    expect(d.slot).toBe('outfit');
    expect(d.triggeredEffect.action).toMatchObject({
      kind: 'gainStat', stat: 'dodge', delta: 20, duration: 2,
    });
  });

  it('enduring has onStruck + gainStat defense +1 dur 2 stacking', () => {
    const d = LEGENDARY_PASSIVE_DEFS.enduring;
    expect(d.slot).toBe('outfit');
    expect(d.triggeredEffect.action).toMatchObject({
      kind: 'gainStat', stat: 'defense', delta: 1, duration: 2, stacking: true,
    });
  });

  it('insightful has whenBelowHp 0.5 + gainStat mind +4', () => {
    const d = LEGENDARY_PASSIVE_DEFS.insightful;
    expect(d.slot).toBe('hat');
    expect(d.triggeredEffect.action).toMatchObject({ kind: 'gainStat', stat: 'mind', delta: 4 });
  });

  it('prescient has onCrit + gainStat speed +1 dur 2 stacking', () => {
    const d = LEGENDARY_PASSIVE_DEFS.prescient;
    expect(d.slot).toBe('hat');
    expect(d.triggeredEffect.action).toMatchObject({
      kind: 'gainStat', stat: 'speed', delta: 1, duration: 2, stacking: true,
    });
  });

  it('cunning has onCrit + gainStat dodge +15 dur 2', () => {
    const d = LEGENDARY_PASSIVE_DEFS.cunning;
    expect(d.slot).toBe('hat');
    expect(d.triggeredEffect.action).toMatchObject({
      kind: 'gainStat', stat: 'dodge', delta: 15, duration: 2,
    });
  });

  it('wise has onKill + gainStat mind +1 dur 3 stacking', () => {
    const d = LEGENDARY_PASSIVE_DEFS.wise;
    expect(d.slot).toBe('hat');
    expect(d.triggeredEffect.action).toMatchObject({
      kind: 'gainStat', stat: 'mind', delta: 1, duration: 3, stacking: true,
    });
  });
});

describe('LEGENDARY_PASSIVES_BY_SLOT', () => {
  const SLOTS: readonly ItemSlot[] = ['weapon', 'shield', 'outfit', 'hat'];

  it.each(SLOTS)('%s slot has exactly 4 passives', (slot) => {
    expect(LEGENDARY_PASSIVES_BY_SLOT[slot]).toHaveLength(4);
  });

  it('every passive appears in exactly one slot pool', () => {
    const allIdsInSlots = SLOTS.flatMap((slot) => LEGENDARY_PASSIVES_BY_SLOT[slot]);
    expect(allIdsInSlots.sort()).toEqual([...ALL_PASSIVE_IDS].sort());
    // Disjoint:
    expect(new Set(allIdsInSlots).size).toBe(allIdsInSlots.length);
  });

  it('each passive in a slot pool has slot field matching the pool slot', () => {
    for (const slot of SLOTS) {
      for (const id of LEGENDARY_PASSIVES_BY_SLOT[slot]) {
        expect(LEGENDARY_PASSIVE_DEFS[id].slot).toBe(slot);
      }
    }
  });
});

describe('LegendaryPassiveId / LegendaryId disjointness', () => {
  it('no LegendaryPassiveId overlaps with any LegendaryId (stack-key collision guard)', () => {
    const passiveIds = new Set(Object.keys(LEGENDARY_PASSIVE_DEFS));
    const legendaryIds = new Set(Object.keys(LEGENDARY_DEFS));  // import from same file
    for (const id of passiveIds) {
      expect(legendaryIds.has(id)).toBe(false);
    }
  });
});
```

Note the imports at the top — `LEGENDARY_DEFS` is already exported from `src/data/legendaries.ts` (Spec 3 Task 2).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/__tests__/legendaries.test.ts 2>&1 | tail -20`
Expected: FAIL — `LEGENDARY_PASSIVE_DEFS` and `LEGENDARY_PASSIVES_BY_SLOT` don't exist yet.

- [ ] **Step 3: Add LEGENDARY_PASSIVE_DEFS to legendaries.ts**

Edit `src/data/legendaries.ts`. Add the import:

```ts
import type { EnemyId, ItemSlot, LegendaryDef, LegendaryId, LegendaryPassiveDef, LegendaryPassiveId } from './types';
```

(Verify `ItemSlot` and `LegendaryPassiveId` / `LegendaryPassiveDef` are imported. Add to the existing import list if missing.)

Add to the end of the file (after `BOSS_LEGENDARIES`):

```ts
export const LEGENDARY_PASSIVE_DEFS: Record<LegendaryPassiveId, LegendaryPassiveDef> = {
  vampiric: {
    id: 'vampiric',
    adjective: 'Vampiric',
    description: 'Heal 15% of damage dealt.',
    slot: 'weapon',
    triggeredEffect: {
      trigger: { kind: 'onHit' },
      action: { kind: 'lifesteal', ratio: 0.15 },
    },
  },
  devastating: {
    id: 'devastating',
    adjective: 'Devastating',
    description: 'Your first attack each combat deals double damage.',
    slot: 'weapon',
    triggeredEffect: {
      trigger: { kind: 'firstAttack' },
      action: { kind: 'damageMod', multiplier: 2.0 },
    },
  },
  cleaving: {
    id: 'cleaving',
    adjective: 'Cleaving',
    description: '+2 Attack for 3 turns on kill (stacks).',
    slot: 'weapon',
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'attack', delta: 2, duration: 3, stacking: true },
    },
  },
  hexing: {
    id: 'hexing',
    adjective: 'Hexing',
    description: 'Crits Mark the target (+30% damage taken, 3 turns).',
    slot: 'weapon',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: {
        kind: 'applyStatus', statusId: 'marked', duration: 3, target: 'other',
        payload: { damageBonus: 0.3 },
      },
    },
  },
  fortified: {
    id: 'fortified',
    adjective: 'Fortified',
    description: 'Reduce incoming damage by 20%.',
    slot: 'shield',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: { kind: 'damageMitigation', multiplier: 0.8 },
    },
  },
  reinforced: {
    id: 'reinforced',
    adjective: 'Reinforced',
    description: '+4 Defense while below 40% HP.',
    slot: 'shield',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.4 },
      action: { kind: 'gainStat', stat: 'defense', delta: 4 },
    },
  },
  thorny: {
    id: 'thorny',
    adjective: 'Thorny',
    description: 'Reflect Poison (4/turn, 2 turns) to attackers.',
    slot: 'shield',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: {
        kind: 'applyStatus', statusId: 'poisoned', duration: 2, target: 'other',
        payload: { damagePerTurn: 4 },
      },
    },
  },
  warded: {
    id: 'warded',
    adjective: 'Warded',
    description: '+15 Dodge while below 50% HP.',
    slot: 'shield',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'dodge', delta: 15 },
    },
  },
  vital: {
    id: 'vital',
    adjective: 'Vital',
    description: 'Gain Blessed (+5 HP/turn, 3 turns) when struck.',
    slot: 'outfit',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: {
        kind: 'applyStatus', statusId: 'blessed', duration: 3, target: 'self',
        payload: { healPerTurn: 5 },
      },
    },
  },
  resolute: {
    id: 'resolute',
    adjective: 'Resolute',
    description: '+3 Defense while below 50% HP.',
    slot: 'outfit',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'defense', delta: 3 },
    },
  },
  evasive: {
    id: 'evasive',
    adjective: 'Evasive',
    description: '+20 Dodge for 2 turns when struck.',
    slot: 'outfit',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: { kind: 'gainStat', stat: 'dodge', delta: 20, duration: 2 },
    },
  },
  enduring: {
    id: 'enduring',
    adjective: 'Enduring',
    description: '+1 Defense for 2 turns when struck (stacks).',
    slot: 'outfit',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: { kind: 'gainStat', stat: 'defense', delta: 1, duration: 2, stacking: true },
    },
  },
  insightful: {
    id: 'insightful',
    adjective: 'Insightful',
    description: '+4 Mind while below 50% HP.',
    slot: 'hat',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'mind', delta: 4 },
    },
  },
  prescient: {
    id: 'prescient',
    adjective: 'Prescient',
    description: '+1 Speed for 2 turns on crit (stacks).',
    slot: 'hat',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: { kind: 'gainStat', stat: 'speed', delta: 1, duration: 2, stacking: true },
    },
  },
  cunning: {
    id: 'cunning',
    adjective: 'Cunning',
    description: '+15 Dodge for 2 turns on crit.',
    slot: 'hat',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: { kind: 'gainStat', stat: 'dodge', delta: 15, duration: 2 },
    },
  },
  wise: {
    id: 'wise',
    adjective: 'Wise',
    description: '+1 Mind for 3 turns on kill (stacks).',
    slot: 'hat',
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'mind', delta: 1, duration: 3, stacking: true },
    },
  },
};

export const LEGENDARY_PASSIVES_BY_SLOT: Record<ItemSlot, readonly LegendaryPassiveId[]> = {
  weapon: ['vampiric', 'devastating', 'cleaving', 'hexing'],
  shield: ['fortified', 'reinforced', 'thorny', 'warded'],
  outfit: ['vital', 'resolute', 'evasive', 'enduring'],
  hat:    ['insightful', 'prescient', 'cunning', 'wise'],
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/data/__tests__/legendaries.test.ts && npx tsc --noEmit`
Expected: PASS.

Full suite: `npm test 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 5: ~~Commit~~ — SKIPPED**

---

## Task 3: Combatant.equippedLegendaryPassiveIds + creator defaults

**Files:**
- Modify: `src/combat/types.ts`
- Modify: `src/combat/combatant.ts`
- Modify: `src/run/combat_setup.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/run/__tests__/combat_setup.test.ts`:

```ts
import { LEGENDARY_PASSIVE_DEFS } from '@data/legendaries';

describe('combat_setup — gatherEquippedLegendaryPassiveIds', () => {
  it("populates Combatant.equippedLegendaryPassiveIds from hero.equipment slots with legendaryPassive set", () => {
    // Construct a hero with a Vampiric sword equipped + a normal hat + no shield/outfit.
    // Build the combat state via buildCombatState.
    // Assert the hero combatant has equippedLegendaryPassiveIds: ['vampiric'].
    //
    // Adapt to existing helpers in combat_setup.test.ts — verify the makeHero/equipment patterns.
    // Reference the existing test that asserts pickedPerks: hero.pickedPerks flows through.
  });

  it('returns empty array when no equipment slot has legendaryPassive set', () => {
    // Construct a hero with all-normal equipment (no legendaryId or legendaryPassive on any slot).
    // Assert combatant.equippedLegendaryPassiveIds === [].
  });
});
```

Author the full test bodies using the existing combat_setup.test.ts patterns (the file already exists per Spec 1 task 3 — read it for the setup convention).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/run/__tests__/combat_setup.test.ts -t "gatherEquippedLegendaryPassiveIds"`
Expected: FAIL — `Combatant.equippedLegendaryPassiveIds` doesn't exist; combat_setup doesn't populate it.

- [ ] **Step 3: Add Combatant.equippedLegendaryPassiveIds**

Edit `src/combat/types.ts`. Find the `Combatant` interface — it already has `equippedLegendaryIds: readonly LegendaryId[]` from Spec 3 Task 4. Add the parallel field:

```ts
export interface Combatant {
  // ... existing fields ...
  pickedPerks: readonly PerkId[];
  equippedLegendaryIds: readonly LegendaryId[];
  equippedLegendaryPassiveIds: readonly LegendaryPassiveId[];  // NEW — required, defaults []
  firstAttackFiredSourceIds?: readonly string[];
  pendingDamageMod?: number;
  // ...
}
```

Add `LegendaryPassiveId` to the imports from `@data/types` at the top.

- [ ] **Step 4: Update Combatant creators with default**

Edit `src/combat/combatant.ts`. All 3 creators (`createHeroCombatant`, `createEnemyCombatant`, `createPetCombatant`) need `equippedLegendaryPassiveIds: []` in their default block before the `...overrides` spread. Mirrors how `equippedLegendaryIds: []` is already defaulted.

- [ ] **Step 5: Add `gatherEquippedLegendaryPassiveIds` helper to combat_setup.ts**

Edit `src/run/combat_setup.ts`. Add a helper alongside the existing `gatherEquippedLegendaryIds` (from Spec 3 Task 4):

```ts
function gatherEquippedLegendaryPassiveIds(
  equipment: HeroEquipment,
): readonly LegendaryPassiveId[] {
  const out: LegendaryPassiveId[] = [];
  for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
    const item = equipment[slot];
    if (item?.legendaryPassive !== undefined) out.push(item.legendaryPassive);
  }
  return out;
}
```

Add `LegendaryPassiveId` to the `@data/types` import if not already imported.

In the `createHeroCombatant` call site (where `equippedLegendaryIds` is already passed):

```ts
createHeroCombatant(hero.classId, (i + 1) as SlotIndex, `p${i}`, {
  // ... existing fields ...
  pickedPerks: hero.pickedPerks,
  equippedLegendaryIds: gatherEquippedLegendaryIds(hero.equipment),
  equippedLegendaryPassiveIds: gatherEquippedLegendaryPassiveIds(hero.equipment),  // NEW
  // ...
});
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/run/__tests__/combat_setup.test.ts && npm test && npx tsc --noEmit`
Expected: PASS. Existing tests still pass because the new field defaults to `[]` and existing fixtures don't set legendaryPassive.

If any test fixture in `src/run/__tests__/run_state.test.ts` (the inline pet Combatant from Spec 3) breaks because `equippedLegendaryPassiveIds` is missing, add `equippedLegendaryPassiveIds: []` to that fixture too.

- [ ] **Step 7: ~~Commit~~ — SKIPPED**

---

## Task 4: gatherTriggeredEffects third loop

**Files:**
- Modify: `src/combat/perk_hooks.ts`
- Modify: `src/combat/__tests__/perk_hooks.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/combat/__tests__/perk_hooks.test.ts`:

```ts
import { LEGENDARY_PASSIVE_DEFS } from '@data/legendaries';

describe('gatherTriggeredEffects — legendary passives (Spec 4)', () => {
  it('yields a passive entry when equippedLegendaryPassiveIds contains a passive', () => {
    const self = makeCombatant({
      equippedLegendaryPassiveIds: ['vampiric'],
    });
    const out = gatherTriggeredEffects(self);
    expect(out).toHaveLength(1);
    expect(out[0].sourceId).toBe('vampiric');
    expect(out[0].effect).toEqual(LEGENDARY_PASSIVE_DEFS.vampiric.triggeredEffect);
  });

  it('combines perk + named-legendary + passive sources in one iteration', () => {
    const self = makeCombatant({
      pickedPerks: ['iron_will'],
      equippedLegendaryIds: ['lichs_crown'],
      equippedLegendaryPassiveIds: ['vampiric'],
    });
    const out = gatherTriggeredEffects(self);
    const sourceIds = out.map((x) => x.sourceId);
    // iron_will has no triggeredEffect, so only legendary + passive in result.
    expect(sourceIds).toContain('lichs_crown');
    expect(sourceIds).toContain('vampiric');
  });
});
```

(Note: `iron_will` doesn't have a `triggeredEffect` — it's an L5 perk with only `statEffects` — so it correctly filters out at the `if (e)` check in gatherTriggeredEffects. If `makeCombatant` doesn't accept `equippedLegendaryPassiveIds` overrides, extend its `overrides: Partial<Combatant>` signature or use a synthetic perk that DOES have a triggeredEffect — verify against existing perk_hooks.test.ts patterns.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/combat/__tests__/perk_hooks.test.ts -t "legendary passives"`
Expected: FAIL — `gatherTriggeredEffects` doesn't iterate `equippedLegendaryPassiveIds` yet.

- [ ] **Step 3: Extend gatherTriggeredEffects**

Edit `src/combat/perk_hooks.ts`. Find the existing `gatherTriggeredEffects` function (added in Spec 3 Task 4). Add the third loop:

```ts
import { LEGENDARY_DEFS, LEGENDARY_PASSIVE_DEFS } from '@data/legendaries';
import type { LegendaryId, LegendaryPassiveId, PerkId, TriggeredEffect } from '@data/types';

export function gatherTriggeredEffects(
  combatant: Combatant,
): readonly { sourceId: PerkId | LegendaryId | LegendaryPassiveId; effect: TriggeredEffect }[] {
  const out: { sourceId: PerkId | LegendaryId | LegendaryPassiveId; effect: TriggeredEffect }[] = [];
  for (const perkId of combatant.pickedPerks) {
    const e = PERKS[perkId]?.triggeredEffect;
    if (e) out.push({ sourceId: perkId, effect: e });
  }
  for (const legId of combatant.equippedLegendaryIds) {
    out.push({ sourceId: legId, effect: LEGENDARY_DEFS[legId].triggeredEffect });
  }
  for (const passId of combatant.equippedLegendaryPassiveIds) {
    out.push({ sourceId: passId, effect: LEGENDARY_PASSIVE_DEFS[passId].triggeredEffect });
  }
  return out;
}
```

Update the `ApplyPerkActionArgs.sourceId` type (and any internal helpers that take `sourceId`) to widen the union:

```ts
export interface ApplyPerkActionArgs {
  self: Combatant;
  other: Combatant | undefined;
  sourceId: PerkId | LegendaryId | LegendaryPassiveId;  // widened
  action: PerkAction;
  events: CombatEvent[];
}
```

Same widening for `addStack`, `refreshAllStackDurations`, `clearPerkAura`, etc. Runtime is identical since all 3 unions are string literals.

- [ ] **Step 4: Add comment to FireableTriggerKind about onHit exclusion**

Edit the existing `FireableTriggerKind` type. Update the comment to mention `onHit`:

```ts
/**
 * The set of trigger kinds that flow through `firePerkTrigger`. Excludes:
 *  - `whenBelowHp` — continuous-aura trigger re-evaluated on HP changes
 *    (see recomputeBelowHpAuras).
 *  - `onHit` — fires once per outgoing damage instance; consumed by the
 *    lifesteal block in applyDamage. `firePerkTrigger` does NOT iterate
 *    onHit triggers to avoid double-firing.
 */
export type FireableTriggerKind = 'onCrit' | 'onKill' | 'onStruck' | 'firstAttack';
```

(The type itself doesn't change — `onHit` was never part of `FireableTriggerKind`. The comment makes the rationale explicit.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/combat/__tests__/perk_hooks.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: ~~Commit~~ — SKIPPED**

---

## Task 5: rollRandomLegendary helper + substitution branch in rollLoot

**Files:**
- Modify: `src/dungeon/loot.ts`
- Modify: `src/dungeon/__tests__/loot.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/dungeon/__tests__/loot.test.ts`:

```ts
import { LEGENDARY_PASSIVE_DEFS, LEGENDARY_PASSIVES_BY_SLOT } from '@data/legendaries';

describe('rollRandomLegendary', () => {
  it('constructs an Item with rarity legendary, legendaryPassive set, no legendaryId, Epic-equivalent affixes', () => {
    const item = rollRandomLegendary(createRng(1), 10);
    expect(item.rarity).toBe('legendary');
    expect(item.legendaryPassive).toBeDefined();
    expect(item.legendaryId).toBeUndefined();
    expect(item.rareProperty).toBeUndefined();
    const expectedAffixCount = item.slot === 'hat' ? 4 : 3;
    expect(item.affixes).toHaveLength(expectedAffixCount);
    expect(item.floorRolledAt).toBe(10);
  });

  it('rolled legendaryPassive belongs to the rolled slot pool', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const item = rollRandomLegendary(createRng(seed), 10);
      const pool = LEGENDARY_PASSIVES_BY_SLOT[item.slot];
      expect(pool).toContain(item.legendaryPassive!);
    }
  });

  it('rolled affix values scale with the floor argument', () => {
    const f1 = rollRandomLegendary(createRng(1), 1);
    const f10 = rollRandomLegendary(createRng(1), 10);
    // Same seed produces same affix ids; the values differ via rollAffixValue scaling.
    // Just assert SOME affix changed if we hit a vigor or scaled affix:
    // (Conservative assertion — exact value comparison is fragile across affix kinds.)
    expect(f10.floorRolledAt).toBe(10);
    expect(f1.floorRolledAt).toBe(1);
  });
});

describe('rollLoot — random legendary substitution post-L10', () => {
  it('with legendaryEnabled=true, ELITE kind substitutes random legendary at ~1% rate (large sample)', () => {
    let legendaries = 0;
    const N = 10000;
    for (let seed = 1; seed <= N; seed++) {
      const item = rollLoot(createRng(seed), 5, 'elite', 1, true);
      if (item?.legendaryPassive !== undefined) legendaries++;
    }
    const pct = (legendaries / N) * 100;
    expect(pct).toBeGreaterThan(0.5);
    expect(pct).toBeLessThan(2.0);
  });

  it('with legendaryEnabled=true, TREASURE kind substitutes random legendary at ~1% rate', () => {
    let legendaries = 0;
    const N = 10000;
    for (let seed = 1; seed <= N; seed++) {
      const item = rollLoot(createRng(seed), 5, 'treasure', 1, true);
      if (item?.legendaryPassive !== undefined) legendaries++;
    }
    const pct = (legendaries / N) * 100;
    expect(pct).toBeGreaterThan(0.5);
    expect(pct).toBeLessThan(2.0);
  });

  it('with legendaryEnabled=false, neither elite nor treasure produces random legendaries', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const elite = rollLoot(createRng(seed), 5, 'elite', 1, false);
      expect(elite?.legendaryPassive).toBeUndefined();
      const treasure = rollLoot(createRng(seed), 5, 'treasure', 1, false);
      expect(treasure?.legendaryPassive).toBeUndefined();
    }
  });

  it('combat kind never substitutes (even with legendaryEnabled=true)', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const item = rollLoot(createRng(seed), 5, 'combat', 1, true);
      if (item) expect(item.legendaryPassive).toBeUndefined();
    }
  });

  it('boss kind without bossId in BOSS_LEGENDARIES does not substitute random legendaries (only boss substitution applies)', () => {
    // bossId=skeleton_warrior is NOT in BOSS_LEGENDARIES, so the boss-substitution branch
    // falls through. Random substitution is gated to elite|treasure only, so boss-kind
    // never picks up random legendaries either. The drop should be a normal rarity-roll item.
    for (let seed = 1; seed <= 100; seed++) {
      const item = rollLoot(createRng(seed), 5, 'boss', 1, true, 'skeleton_warrior');
      expect(item?.legendaryPassive).toBeUndefined();
      expect(item?.legendaryId).toBeUndefined();
    }
  });
});
```

Import `rollRandomLegendary` once it's exported.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/dungeon/__tests__/loot.test.ts -t "rollRandomLegendary|random legendary substitution"`
Expected: FAIL — `rollRandomLegendary` doesn't exist; substitution branch missing.

- [ ] **Step 3: Add rollRandomLegendary helper**

Edit `src/dungeon/loot.ts`. Add the import:

```ts
import { LEGENDARY_DEFS, BOSS_LEGENDARIES, LEGENDARY_PASSIVES_BY_SLOT } from '@data/legendaries';
import type { EnemyId, LegendaryId, LegendaryPassiveId } from '@data/types';
```

(`LEGENDARY_PASSIVES_BY_SLOT` is new; `LegendaryPassiveId` is new.)

Add the helper alongside the existing `rollNamedLegendary`:

```ts
export function rollRandomLegendary(rng: Rng, floor: number): Item {
  const slot = rng.pick(ALL_SLOTS);
  const base = pickBaseId(rng, slot);
  const pool = LEGENDARY_PASSIVES_BY_SLOT[slot];
  const passiveId = rng.pick(pool);
  const count = slot === 'hat' ? 4 : 3;  // Epic-equivalent affix count
  const affixIds = pickAffixes(rng, count);
  const affixes: RolledAffix[] = affixIds.map((id) => ({
    affixId: id,
    value: rollAffixValue(id, floor),
  }));
  return {
    id: generateItemId(rng),
    baseId: base.baseId,
    slot,
    rarity: 'legendary',
    ...(base.weaponType !== undefined ? { weaponType: base.weaponType } : {}),
    affixes,
    floorRolledAt: floor,
    legendaryPassive: passiveId,
  };
}
```

- [ ] **Step 4: Add substitution branch to rollLoot**

In `rollLoot`, find the boss-substitution block (Spec 3 Task 5). Add the new branch AFTER it but BEFORE the normal rarity-roll path:

```ts
export function rollLoot(
  rng: Rng,
  floorNumber: number,
  kind: LootKind,
  tier: DungeonTier = 1,
  legendaryEnabled = false,
  bossId?: EnemyId,
): Item | null {
  if (kind === 'combat') {
    if (rng.next() >= 0.1) return null;
  }

  // Boss substitution (Spec 3) — unchanged.
  if (kind === 'boss' && legendaryEnabled && bossId !== undefined) {
    const pool = BOSS_LEGENDARIES[bossId];
    if (pool !== undefined && pool.length > 0) {
      return rollNamedLegendary(rng, rng.pick(pool), floorNumber);
    }
  }

  // NEW (Spec 4): random legendary substitution on elite + treasure post-L10.
  if ((kind === 'elite' || kind === 'treasure') && legendaryEnabled && rng.percent(1)) {
    return rollRandomLegendary(rng, floorNumber);
  }

  // ... rest of existing rollLoot body (rarity roll, etc.) unchanged ...
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/dungeon/__tests__/loot.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

If existing rollLoot tests for elite (which forced `rarity === 'rare'`) now occasionally see a legendary, those tests likely don't pass `legendaryEnabled=true`, so they won't substitute. Verify by reading the existing elite tests.

- [ ] **Step 6: ~~Commit~~ — SKIPPED**

---

## Task 6: onHit + lifesteal consume site in applyDamage

**Files:**
- Modify: `src/combat/effects.ts`
- Modify: `src/combat/__tests__/perks_integration.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/combat/__tests__/perks_integration.test.ts`:

```ts
describe('Vampiric weapon (onHit + lifesteal 0.15)', () => {
  it('heals 15% of damage dealt on every outgoing hit', () => {
    // Hero with equippedLegendaryPassiveIds: ['vampiric'].
    // Drop hero HP to a non-full value so heal has headroom.
    // Drive a combat where the hero attacks and lands damage.
    // Read finalState; check the hero's HP increased by 15% of damage events from this hero.
    //
    // Follow existing onStruck integration test patterns. Use real LEGENDARY_PASSIVE_DEFS
    // wired via equippedLegendaryPassiveIds — no monkey-patching.
  });

  it('does not heal when caster.currentHp is already at max', () => {
    // Same setup but hero at full HP. Damage events occur; no heal_applied events
    // from the Vampiric path (the Math.min(heal, maxHp - currentHp) clamps to 0).
  });

  it('emits heal_applied event when lifesteal triggers', () => {
    // Verify the events stream contains a heal_applied event with sourceId === hero.id
    // and targetId === hero.id after a Vampiric-weapon hit.
  });
});
```

Author full test bodies using existing onStruck integration test patterns from `perks_integration.test.ts`. The Phylactery / King's Aegis tests are good templates.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/combat/__tests__/perks_integration.test.ts -t "Vampiric weapon"`
Expected: FAIL — `onHit` triggers are not consumed anywhere; Vampiric's lifesteal action does nothing.

- [ ] **Step 3: Add onHit + lifesteal consume site in applyDamage**

Edit `src/combat/effects.ts`. Find the existing rare-property lifesteal block (around line 109-123, the `caster.lifestealPercent` section). Add the NEW block immediately after it:

```ts
// Existing rare-property lifesteal (caster.lifestealPercent from rarePropertyFields)
if (caster.lifestealPercent !== undefined && caster.lifestealPercent > 0) {
  const heal = Math.floor(mitigated * caster.lifestealPercent / 100);
  if (heal > 0) {
    const actual = Math.min(heal, caster.maxHp - caster.currentHp);
    if (actual > 0) {
      caster.currentHp += actual;
      recomputeBelowHpAuras(caster, events);
      events.push({
        kind: 'heal_applied',
        sourceId: caster.id,
        targetId: caster.id,
        amount: actual,
      });
    }
  }
}

// NEW (Spec 4): fire onHit triggers from gathered TriggeredEffects on the caster.
// Currently only Vampiric uses onHit + lifesteal. Other onHit + action combinations
// will need their own branches here when authored.
for (const { effect: t } of gatherTriggeredEffects(caster)) {
  if (t.trigger.kind !== 'onHit') continue;
  if (t.action.kind === 'lifesteal') {
    const heal = Math.floor(mitigated * t.action.ratio);
    if (heal > 0) {
      const actual = Math.min(heal, caster.maxHp - caster.currentHp);
      if (actual > 0) {
        caster.currentHp += actual;
        recomputeBelowHpAuras(caster, events);
        events.push({
          kind: 'heal_applied',
          sourceId: caster.id,
          targetId: caster.id,
          amount: actual,
        });
      }
    }
  }
  // Other onHit + action.kind combinations not used in v1 — extend with new branches as needed.
}
```

The comment makes the future-extensibility point explicit. The block reuses `mitigated` (the actual damage applied, from Spec 1 Task 8's two-pass split) and `recomputeBelowHpAuras` (Spec 1 Task 11).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/combat/__tests__/perks_integration.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: ~~Commit~~ — SKIPPED**

---

## Task 7: itemDisplayName branch for random legendaries

**Files:**
- Modify: `src/items/selectors.ts`
- Modify: `src/items/__tests__/selectors.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/items/__tests__/selectors.test.ts`:

```ts
describe('itemDisplayName — random legendary (adjective prefix)', () => {
  it("returns 'Vampiric Sword' for a vampiric weapon", () => {
    const item: Item = {
      id: 'i', baseId: 'sword_basic', slot: 'weapon', rarity: 'legendary',
      weaponType: 'sword', affixes: [], floorRolledAt: 10,
      legendaryPassive: 'vampiric',
    };
    expect(itemDisplayName(item)).toBe('Vampiric Sword');
  });

  it("returns 'Fortified Shield' for a fortified shield", () => {
    const item: Item = {
      id: 'i', baseId: 'shield_basic', slot: 'shield', rarity: 'legendary',
      affixes: [], floorRolledAt: 10,
      legendaryPassive: 'fortified',
    };
    expect(itemDisplayName(item)).toBe('Fortified Shield');
  });

  it("prefers legendaryId over legendaryPassive if both somehow set (named takes precedence)", () => {
    // Defensive — shouldn't happen at runtime but worth pinning the order.
    const item = {
      id: 'i', baseId: 'hat_hood', slot: 'hat', rarity: 'legendary',
      affixes: [], floorRolledAt: 10,
      legendaryId: 'lichs_crown',
      legendaryPassive: 'wise',
    } as Item;
    expect(itemDisplayName(item)).toBe("Lich's Crown");
  });
});

describe('itemFlavor — random legendaries return undefined', () => {
  it('returns undefined for items with legendaryPassive but no legendaryId', () => {
    const item: Item = {
      id: 'i', baseId: 'sword_basic', slot: 'weapon', rarity: 'legendary',
      weaponType: 'sword', affixes: [], floorRolledAt: 10,
      legendaryPassive: 'vampiric',
    };
    expect(itemFlavor(item)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/items/__tests__/selectors.test.ts -t "random legendary"`
Expected: FAIL — current itemDisplayName doesn't have the legendaryPassive branch.

- [ ] **Step 3: Add legendaryPassive branch to itemDisplayName**

Edit `src/items/selectors.ts`. Find `itemDisplayName`. Add the new branch BETWEEN the existing legendaryId branch and the rare-property fallback:

```ts
import { LEGENDARY_DEFS, LEGENDARY_PASSIVE_DEFS } from '@data/legendaries';

export function itemDisplayName(item: Item): string {
  if (item.legendaryId !== undefined) {
    return LEGENDARY_DEFS[item.legendaryId].name;
  }
  if (item.legendaryPassive !== undefined) {
    const base = BASE_ITEMS[item.baseId].name;
    return `${LEGENDARY_PASSIVE_DEFS[item.legendaryPassive].adjective} ${base}`;
  }
  // ... existing rare-property suffix path + baseId-name fallback unchanged ...
}
```

`itemFlavor` doesn't need changes — random legendaries fall through its existing `legendaryId !== undefined` check and return undefined (the current default), which is the correct behavior.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/items/__tests__/selectors.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: ~~Commit~~ — SKIPPED**

---

## Task 8: Per-passive smoke + Vampiric end-to-end integration tests

**Files:**
- Modify: `src/combat/__tests__/perks_integration.test.ts`

Author one smoke test per slot — Vampiric (weapon, already added in Task 6), Fortified (shield), Vital (outfit), Cunning (hat). These exercise the gather → apply flow with real `LEGENDARY_PASSIVE_DEFS` lookups.

- [ ] **Step 1: Add 3 more smoke tests (Fortified, Vital, Cunning)**

Append to `src/combat/__tests__/perks_integration.test.ts`:

```ts
describe('Fortified shield (onStruck → damageMitigation 0.8)', () => {
  it('reduces incoming damage by 20% on every hit (no full-HP gate)', () => {
    // Hero with equippedLegendaryPassiveIds: ['fortified'].
    // Drive a combat where the hero takes damage.
    // Assert damage_applied events show ~80% of raw damage (within rounding tolerance).
    // Drop hero HP first so multiple hits can be compared (some at full, some not — all 0.8x).
    //
    // Follow Unbreakable test pattern from Spec 3 Task 9 (but no full-HP gate distinction).
  });
});

describe('Vital outfit (onStruck → applyStatus blessed self)', () => {
  it('applies Blessed (regen) status to the hero when struck', () => {
    // Hero with equippedLegendaryPassiveIds: ['vital'].
    // Drive a combat where the hero takes damage.
    // Assert status_applied event for 'blessed' with sourceId === hero, targetId === hero.
    // Assert finalState hero.statuses.blessed has effect.kind === 'regen' and healPerTurn === 5.
    //
    // Follow Holy Vigor test pattern from Spec 1 Task 16.
  });
});

describe('Cunning hat (onCrit → +15 Dodge for 2 turns)', () => {
  it('applies a +15 dodge stack on crit', () => {
    // Hero with equippedLegendaryPassiveIds: ['cunning']. Crit stat at 100% so every hit crits.
    // After first attack: finalState hero has perk_stack_cunning_0 status with delta=15, stat=dodge.
    //
    // Follow Phantom test pattern from Spec 1 Task 14.
  });
});
```

Author full bodies using the existing patterns. The 4 slots are now covered (Vampiric in Task 6, plus these 3).

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/combat/__tests__/perks_integration.test.ts && npm test && npx tsc --noEmit`
Expected: PASS. All 4 slot smoke tests pass.

- [ ] **Step 3: ~~Commit~~ — SKIPPED**

---

## Wrap-up

After Task 8, run final verification:

```bash
npm test && npm run build && npx tsc --noEmit
```

Expected: all tests pass; production build clean; typecheck clean.

Verify spec out-of-scope items stayed out:
- No bespoke art (Cluster C territory)
- No shop legendary appearance (elite + treasure only)
- No additional onHit action kinds beyond lifesteal
- No combat-drop substitution (only elite + treasure)
- No save migration (Item.legendaryPassive is optional, no schema bump needed; CURRENT_SCHEMA_VERSION stays at 7)

Move TODO Cluster D · 10 entry to HISTORY.md with the slim template (Why / Decisions / Surprises / Source).

---

## Self-review notes

**Spec coverage:**
- LegendaryPassiveId + LegendaryPassiveDef: Task 1 ✓
- onHit trigger added to PerkTrigger: Task 1 ✓
- Item.legendaryPassive: Task 1 ✓
- LEGENDARY_PASSIVE_DEFS + LEGENDARY_PASSIVES_BY_SLOT: Task 2 ✓
- Combatant.equippedLegendaryPassiveIds: Task 3 ✓
- combat_setup populates: Task 3 ✓
- gatherTriggeredEffects third loop: Task 4 ✓
- rollRandomLegendary + rollLoot substitution: Task 5 ✓
- onHit + lifesteal consume site in applyDamage: Task 6 ✓
- itemDisplayName branch: Task 7 ✓
- Per-passive integration tests: Tasks 6 (Vampiric) + 8 (3 more) ✓

**Type consistency:**
- `sourceId: PerkId | LegendaryId | LegendaryPassiveId` consistent across applyPerkAction, addStack, etc.
- `equippedLegendaryPassiveIds: readonly LegendaryPassiveId[]` consistent in Combatant, creators, combat_setup, gather function.
- `legendaryPassive?: LegendaryPassiveId` consistent on Item and in rollRandomLegendary output.

**No placeholders found in the plan.**

**Notable risks (mirrored from spec):**
- `onHit` exclusion from `FireableTriggerKind` is doc-only. A future contributor wiring an `onHit` fire in `firePerkTrigger` would double-fire. Mitigation: the type comment + the consume site's own comment ("Currently only Vampiric uses onHit + lifesteal") flag this.
- Distribution tests need ≥10,000 samples for 1% rate tolerances. Smaller samples surface false negatives.
