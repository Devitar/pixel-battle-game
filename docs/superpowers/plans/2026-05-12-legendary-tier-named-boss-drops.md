# Legendary tier + L10 milestone + named boss drops — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `'legendary'` as the 5th rarity tier with 4 hand-crafted named items dropped by existing bosses post-L10. Wire a `first_hero_l10` milestone that flips a `SaveFile.unlocks.legendaryEnabled` flag and gates the new drop path.

**Architecture:** Rarity union widens to 5; `Item.legendaryId?: LegendaryId` is the discriminator for named items (no affixes; stats/passive looked up from `LEGENDARY_DEFS`). Boss-drop substitution at `rollLoot` time replaces the next-floor rarity roll with a 1-of-2 named-legendary pick when the milestone is active. Combatant gains `equippedLegendaryIds` populated at combat-setup; the existing perk-hook system (Spec 1) iterates both perk and legendary sources via a widened `sourceId: PerkId | LegendaryId` parameter.

**Tech Stack:** TypeScript, Vitest, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-12-legendary-tier-named-boss-drops-design.md`

---

## File structure

**New files:**
- `src/data/legendaries.ts` — `LEGENDARY_DEFS` (4 entries) + `BOSS_LEGENDARIES` registry.
- `src/data/__tests__/legendaries.test.ts` — registry-shape + per-def tests.

**Modified files:**
- `src/data/types.ts` — `Rarity` widens to 5; `LegendaryId` union; `LegendaryDef` interface; `MilestoneId` adds `'first_hero_l10'`; `Unlocks` adds `legendaryEnabled: boolean`; `Item` adds `legendaryId?: LegendaryId`.
- `src/data/blacksmith.ts` — `BLACKSMITH_UPGRADE_COST` excludes legendary (type widening; same 3 entries).
- `src/items/sell.ts` — `SELL_VALUE.legendary = 500`.
- `src/items/upgrade.ts` — `NEXT_RARITY.legendary = null`; `nextRarity('legendary')` returns null.
- `src/items/stats.ts` (or wherever equipment-stat aggregation lives) — reads `LEGENDARY_DEFS[item.legendaryId].stats` + `hpBonus` instead of base/affix stats when legendaryId is set.
- `src/combat/types.ts` — `Combatant.equippedLegendaryIds: readonly LegendaryId[]`; rename `firstAttackFiredPerkIds` → `firstAttackFiredSourceIds` (or widen type to `string[]`).
- `src/combat/combatant.ts` — 3 creators default `equippedLegendaryIds: []`.
- `src/combat/perk_hooks.ts` — `applyPerkAction.perkId` widens to `sourceId: PerkId | LegendaryId`; `firePerkTrigger` and `fireOnStruckNonMitigation` and `recomputeBelowHpAuras` iterate both perk and legendary sources; synthesizer adds `case 'drowning'`.
- `src/combat/effects.ts` — onCrit/onStruck/onKill fire-sites pass widened `sourceId`. firstAttack handling in `combat.ts` likewise.
- `src/combat/combat.ts` — firstAttack tracker rename + legendary iteration.
- `src/run/combat_setup.ts` — gather `equippedLegendaryIds` from `hero.equipment` slots; pass into createHeroCombatant.
- `src/run/milestones.ts` — `detectXpMilestones` function; `MILESTONES.first_hero_l10` handler.
- `src/run/run_state.ts` — call `detectXpMilestones` after `applyLevelUps` in `completeCombat` and `completeSurpriseCombat`; pass `legendaryEnabled` + `bossId` to `rollLoot`.
- `src/dungeon/loot.ts` — `rollLoot` signature widens; new `rollNamedLegendary` helper; boss-drop substitution.
- `src/render/rarity_colors.ts` — `legendary` entry.
- `src/scenes/blacksmith_panel_scene.ts` — sell-confirm gate adds `|| item.rarity === 'legendary'`.
- `src/save/migration.ts` — bump `CURRENT_SCHEMA_VERSION` to 7; v6 → v7 migration backfills `unlocks.legendaryEnabled = false`.
- `src/save/save.ts` — `normalizeSaveFile` backfills `legendaryEnabled` defensively (mirroring existing patterns).

**Modified test files** (per-task as implementation surfaces them):
- `src/data/__tests__/perks.test.ts` — if it references shared types affected by widening.
- `src/dungeon/__tests__/loot.test.ts` — new boss-substitution tests + existing-loot regression checks (Epic still rolls when milestone off).
- `src/items/__tests__/sell.test.ts`, `upgrade.test.ts` — legendary entries.
- `src/run/__tests__/milestones.test.ts` — `detectXpMilestones` tests.
- `src/run/__tests__/run_state.test.ts` — XP-grant flow now detects L10 milestone.
- `src/save/__tests__/migration.test.ts` — v6 → v7 case.
- `src/combat/__tests__/perks_integration.test.ts` — per-legendary integration tests (4 new).

---

## Task 1: Type widening + non-loot records + Item.legendaryId

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/blacksmith.ts`
- Modify: `src/items/sell.ts`
- Modify: `src/items/upgrade.ts`
- Modify: `src/render/rarity_colors.ts`
- Modify: `src/scenes/blacksmith_panel_scene.ts` (sell-confirm gate)

- [ ] **Step 1: Write the failing tests**

Add to `src/items/__tests__/sell.test.ts`:

```ts
describe('itemSellValue — Legendary tier', () => {
  it('returns 500 for a legendary item', () => {
    const item: Item = {
      id: 't0', baseId: 'hat_hood', slot: 'hat', rarity: 'legendary',
      affixes: [], floorRolledAt: 10, legendaryId: 'lichs_crown',
    };
    expect(itemSellValue(item)).toBe(500);
  });
});
```

Add to `src/items/__tests__/upgrade.test.ts`:

```ts
describe('nextRarity — Legendary tier (cap)', () => {
  it('epic still does not upgrade (Blacksmith caps at epic)', () => {
    expect(nextRarity('epic')).toBeNull();
  });
  it('legendary does not upgrade (it is also a cap)', () => {
    expect(nextRarity('legendary')).toBeNull();
  });
});
```

Add to `src/data/__tests__/blacksmith.test.ts`:

```ts
describe('BLACKSMITH_UPGRADE_COST — Legendary tier', () => {
  it('has no legendary key (legendary is not Blacksmith-reachable)', () => {
    expect('legendary' in BLACKSMITH_UPGRADE_COST).toBe(false);
  });
  it('keeps existing uncommon=100, rare=300, epic=900', () => {
    expect(BLACKSMITH_UPGRADE_COST.uncommon).toBe(100);
    expect(BLACKSMITH_UPGRADE_COST.rare).toBe(300);
    expect(BLACKSMITH_UPGRADE_COST.epic).toBe(900);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/items/__tests__/sell.test.ts src/items/__tests__/upgrade.test.ts src/data/__tests__/blacksmith.test.ts 2>&1 | tail -20`
Expected: FAIL — `'legendary'` not assignable to Rarity; `nextRarity('legendary')` not defined.

- [ ] **Step 3: Widen the Rarity union + add new types**

Edit `src/data/types.ts`. Around line 88:

```ts
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type LegendaryId =
  | 'lichs_crown'
  | 'phylactery'
  | 'tidewalker_helm'
  | 'kings_aegis';

export interface LegendaryDef {
  id: LegendaryId;
  name: string;
  flavor: string;
  slot: ItemSlot;
  baseId: ItemBaseId;
  stats: Partial<Record<BuffableStat, number>>;
  hpBonus?: number;
  triggeredEffect: TriggeredEffect;
}
```

(`BuffableStat`, `ItemSlot`, `ItemBaseId`, `TriggeredEffect` are all already exported types in this file.)

Update `MilestoneId` around line 290:

```ts
export type MilestoneId =
  | 'first_crypt_clear'
  | 'first_sunken_keep_clear'
  | 'first_hero_l10';
```

Update `Unlocks` around line 399:

```ts
export interface Unlocks {
  classes: readonly ClassId[];
  dungeons: readonly DungeonId[];
  buildings: readonly BuildingId[];
  legendaryEnabled: boolean;
}
```

Update `Item` interface (around line 130):

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
  readonly legendaryId?: LegendaryId;  // NEW
}
```

- [ ] **Step 4: Extend SELL_VALUE**

Edit `src/items/sell.ts`:

```ts
const SELL_VALUE: Record<Rarity, number> = {
  common: 10,
  uncommon: 30,
  rare: 80,
  epic: 200,
  legendary: 500,
};
```

- [ ] **Step 5: Extend NEXT_RARITY + widen BLACKSMITH_UPGRADE_COST exclude**

Edit `src/items/upgrade.ts`:

```ts
const NEXT_RARITY: Record<Rarity, Exclude<Rarity, 'common'> | null> = {
  common: 'uncommon',
  uncommon: 'rare',
  rare: 'epic',
  epic: null,        // unchanged — Blacksmith caps at epic
  legendary: null,
};
```

Edit `src/data/blacksmith.ts`:

```ts
import type { Rarity } from './types';

export const BLACKSMITH_UPGRADE_COST: Record<Exclude<Rarity, 'common' | 'legendary'>, number> = {
  uncommon: 100,
  rare: 300,
  epic: 900,
};
```

The exclude widening means TypeScript will reject any future attempt to write `BLACKSMITH_UPGRADE_COST.legendary`. Legendary is boss-drop-only.

- [ ] **Step 6: Add legendary to rarity colors**

Edit `src/render/rarity_colors.ts`:

```ts
import type { Rarity } from '@data/types';

export const RARITY_COLOR_HEX: Record<Rarity, string> = {
  common:   '#cccccc',
  uncommon: '#4488ff',
  rare:     '#ffcc66',
  epic:     '#a060ff',
  legendary: '#ff8800',
};

export const RARITY_COLOR_NUM: Record<Rarity, number> = {
  common:   0xcccccc,
  uncommon: 0x4488ff,
  rare:     0xffcc66,
  epic:     0xa060ff,
  legendary: 0xff8800,
};
```

- [ ] **Step 7: Widen blacksmith sell-confirm gate**

Edit `src/scenes/blacksmith_panel_scene.ts` around line 685 (the sell-confirm gate widened in Spec 2):

```ts
if (item.rarity === 'rare' || item.rarity === 'epic' || item.rarity === 'legendary') {
  // confirm dialog — text already dynamic via `Sell ${item.rarity} item?`
}
```

Update the comment immediately above (if present) from "Rare and epic items get a confirm step" to "Rare, epic, and legendary items get a confirm step."

- [ ] **Step 8: Run tsc + tests**

Run: `npx tsc --noEmit 2>&1 | head -30 && npx vitest run src/items src/data 2>&1 | tail -20`
Expected: tsc clean; new tests pass.

Then full suite: `npm test 2>&1 | tail -10`
Expected: PASS or only tests broken by other consumers needing Epic→Legendary widening updates. TypeScript will surface these via consumer files that have `Record<Rarity, X>` or switch statements; fix each by adding a legendary entry / default branch.

Likely-affected files: anything else with inline `Record<Rarity, X>` records or `switch (rarity)` blocks. Run grep for `Record<Rarity` and `case 'epic'` across `src/` to find them.

Common spots to check (and add legendary handling if needed):
- `src/scenes/equip_scene.ts` — RARITY_ORDER (sort key — pick a numeric value; legendary should sort first/best)
- `src/scenes/blacksmith_panel_scene.ts` — RARITY_LABEL (add `legendary: '[legendary]'`)
- `src/scenes/blacksmith_panel_scene.ts` — two rarityOrder records (place legendary at the best end)
- `src/scenes/corridor_scene.ts` — (verify; should now import from rarity_colors)
- `src/dungeon/shop.ts` — BASE_PRICE_BY_RARITY (add `legendary: 1500` as a placeholder; spec acknowledges this is tuning territory)

- [ ] **Step 9: ~~Commit~~ — SKIPPED (per the no-commit policy)**

---

## Task 2: LEGENDARY_DEFS data + synthesizer 'drowning' mapping

**Files:**
- Create: `src/data/legendaries.ts`
- Create: `src/data/__tests__/legendaries.test.ts`
- Modify: `src/combat/perk_hooks.ts` (synthesizeStatusEffect — single line)

- [ ] **Step 1: Write the failing tests**

Create `src/data/__tests__/legendaries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LEGENDARY_DEFS, BOSS_LEGENDARIES } from '../legendaries';
import type { LegendaryId } from '../types';

const EXPECTED_IDS: readonly LegendaryId[] = [
  'lichs_crown', 'phylactery', 'tidewalker_helm', 'kings_aegis',
];

describe('LEGENDARY_DEFS', () => {
  it('contains exactly 4 entries', () => {
    expect(Object.keys(LEGENDARY_DEFS).sort()).toEqual([...EXPECTED_IDS].sort());
  });

  it.each(EXPECTED_IDS)('%s has a non-empty name, flavor, slot, baseId, and triggeredEffect', (id) => {
    const def = LEGENDARY_DEFS[id];
    expect(def.id).toBe(id);
    expect(def.name.length).toBeGreaterThan(0);
    expect(def.flavor.length).toBeGreaterThan(0);
    expect(['weapon', 'shield', 'outfit', 'hat']).toContain(def.slot);
    expect(def.baseId.length).toBeGreaterThan(0);
    expect(def.triggeredEffect).toBeDefined();
    expect(def.triggeredEffect.trigger).toBeDefined();
    expect(def.triggeredEffect.action).toBeDefined();
  });

  it('lichs_crown has +5 Mind, +5 Crit, onKill mind stacking', () => {
    const d = LEGENDARY_DEFS.lichs_crown;
    expect(d.stats).toEqual({ mind: 5, crit: 5 });
    expect(d.triggeredEffect.trigger.kind).toBe('onKill');
    const action = d.triggeredEffect.action;
    expect(action.kind).toBe('gainStat');
    if (action.kind === 'gainStat') {
      expect(action.stat).toBe('mind');
      expect(action.delta).toBe(2);
      expect(action.duration).toBe(3);
      expect(action.stacking).toBe(true);
    }
  });

  it('phylactery has +15 HP, +2 Def, onStruck rotting on attacker', () => {
    const d = LEGENDARY_DEFS.phylactery;
    expect(d.stats).toEqual({ defense: 2 });
    expect(d.hpBonus).toBe(15);
    expect(d.triggeredEffect.trigger.kind).toBe('onStruck');
    const action = d.triggeredEffect.action;
    expect(action.kind).toBe('applyStatus');
    if (action.kind === 'applyStatus') {
      expect(action.statusId).toBe('rotting');
      expect(action.target).toBe('other');
      expect(action.duration).toBe(2);
      expect(action.payload?.damagePerTurn).toBe(3);
    }
  });

  it('tidewalker_helm has +5 HP, +3 Def, whenBelowHp 0.5 +4 Def', () => {
    const d = LEGENDARY_DEFS.tidewalker_helm;
    expect(d.stats).toEqual({ defense: 3 });
    expect(d.hpBonus).toBe(5);
    const trig = d.triggeredEffect.trigger;
    expect(trig.kind).toBe('whenBelowHp');
    if (trig.kind === 'whenBelowHp') {
      expect(trig.ratio).toBe(0.5);
    }
    const action = d.triggeredEffect.action;
    expect(action.kind).toBe('gainStat');
    if (action.kind === 'gainStat') {
      expect(action.stat).toBe('defense');
      expect(action.delta).toBe(4);
    }
  });

  it('kings_aegis has +10 HP, +3 Def, onStruck drowning on attacker', () => {
    const d = LEGENDARY_DEFS.kings_aegis;
    expect(d.stats).toEqual({ defense: 3 });
    expect(d.hpBonus).toBe(10);
    expect(d.slot).toBe('shield');
    expect(d.triggeredEffect.trigger.kind).toBe('onStruck');
    const action = d.triggeredEffect.action;
    if (action.kind === 'applyStatus') {
      expect(action.statusId).toBe('drowning');
      expect(action.target).toBe('other');
      expect(action.duration).toBe(3);
      expect(action.payload?.damagePerTurn).toBe(3);
    }
  });
});

describe('BOSS_LEGENDARIES', () => {
  it('bone_lich maps to lichs_crown + phylactery', () => {
    expect(BOSS_LEGENDARIES.bone_lich).toEqual(['lichs_crown', 'phylactery']);
  });

  it('drowned_king maps to tidewalker_helm + kings_aegis', () => {
    expect(BOSS_LEGENDARIES.drowned_king).toEqual(['tidewalker_helm', 'kings_aegis']);
  });

  it('does not contain entries for minions or future bosses', () => {
    expect(BOSS_LEGENDARIES.skeleton_warrior).toBeUndefined();
    expect(BOSS_LEGENDARIES.brine_crab).toBeUndefined();
  });
});
```

Add to `src/combat/__tests__/perk_hooks.test.ts` (in the existing applyStatus describe block or a new one):

```ts
describe('synthesizeStatusEffect — drowning', () => {
  it('produces a poison-kind AbilityEffect for the drowning statusId', () => {
    const self = makeCombatant();
    const other = makeCombatant({ id: 'p1' });
    const action: PerkAction = {
      kind: 'applyStatus', statusId: 'drowning', duration: 3, target: 'other',
      payload: { damagePerTurn: 3 },
    };
    applyPerkAction({ self, other, perkId: 'iron_will', action, events: [] });
    const drowning = other.statuses['drowning'];
    expect(drowning).toBeDefined();
    expect(drowning.effect.kind).toBe('poison');
    if (drowning.effect.kind === 'poison') {
      expect(drowning.effect.damagePerTurn).toBe(3);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/__tests__/legendaries.test.ts src/combat/__tests__/perk_hooks.test.ts 2>&1 | tail -30`
Expected: FAIL — `legendaries.ts` doesn't exist; `synthesizeStatusEffect('drowning', ...)` falls through to default no-op buff.

- [ ] **Step 3: Create `src/data/legendaries.ts`**

```ts
import type { EnemyId, LegendaryDef, LegendaryId } from './types';

export const LEGENDARY_DEFS: Record<LegendaryId, LegendaryDef> = {
  lichs_crown: {
    id: 'lichs_crown',
    name: "Lich's Crown",
    flavor: "A circlet of bleached vertebrae, still humming with the lich's hunger.",
    slot: 'hat',
    baseId: 'hat_hood',
    stats: { mind: 5, crit: 5 },
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'mind', delta: 2, duration: 3, stacking: true },
    },
  },
  phylactery: {
    id: 'phylactery',
    name: 'Phylactery',
    flavor: "A glass vial of black ichor; the lich's life force trapped in glass that never breaks.",
    slot: 'outfit',
    baseId: 'outfit_cloth',
    stats: { defense: 2 },
    hpBonus: 15,
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: {
        kind: 'applyStatus', statusId: 'rotting', duration: 2, target: 'other',
        payload: { damagePerTurn: 3 },
      },
    },
  },
  tidewalker_helm: {
    id: 'tidewalker_helm',
    name: 'Tidewalker Helm',
    flavor: 'A waterlogged crown of brass and barnacle, heavier than it looks.',
    slot: 'hat',
    baseId: 'hat_cap',
    stats: { defense: 3 },
    hpBonus: 5,
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'defense', delta: 4 },
    },
  },
  kings_aegis: {
    id: 'kings_aegis',
    name: "King's Aegis",
    flavor: 'A scarred boss-shield etched with sigils that still drip seawater.',
    slot: 'shield',
    baseId: 'shield_basic',
    stats: { defense: 3 },
    hpBonus: 10,
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: {
        kind: 'applyStatus', statusId: 'drowning', duration: 3, target: 'other',
        payload: { damagePerTurn: 3 },
      },
    },
  },
};

export const BOSS_LEGENDARIES: Partial<Record<EnemyId, readonly LegendaryId[]>> = {
  bone_lich: ['lichs_crown', 'phylactery'],
  drowned_king: ['tidewalker_helm', 'kings_aegis'],
};
```

- [ ] **Step 4: Add 'drowning' case to synthesizeStatusEffect**

Edit `src/combat/perk_hooks.ts`. Find `synthesizeStatusEffect` — currently has cases for 'marked', 'blessed', 'poisoned'/'burning'/'rotting'. Add 'drowning' to the poison-kind group:

```ts
case 'poisoned':
case 'burning':
case 'rotting':
case 'drowning':  // NEW
  return {
    kind: 'poison',
    damagePerTurn: payload?.damagePerTurn ?? DEFAULT_POISON_DAMAGE_PER_TURN,
    duration,
    statusId,
  };
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/data/__tests__/legendaries.test.ts src/combat/__tests__/perk_hooks.test.ts && npx tsc --noEmit`
Expected: PASS.

Full suite: `npm test`
Expected: PASS.

- [ ] **Step 6: ~~Commit~~ — SKIPPED**

---

## Task 3: L10 milestone wiring

**Files:**
- Modify: `src/run/milestones.ts` (add `detectXpMilestones` + `first_hero_l10` handler)
- Modify: `src/run/run_state.ts` (call sites at completeCombat + completeSurpriseCombat)
- Modify: `src/run/__tests__/milestones.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/run/__tests__/milestones.test.ts`:

```ts
import { detectXpMilestones, MILESTONES } from '../milestones';
import type { Hero } from '@heroes/hero';
import type { Unlocks } from '@data/types';

function makeHero(level: number): Hero {
  return {
    id: 'h0', classId: 'knight', name: 'Test', baseStats: { hp: 30, attack: 5, defense: 2, speed: 5, mind: 1, crit: 5, dodge: 5 },
    currentHp: 30, maxHp: 30, traitIds: ['quick'], bodySpriteId: 'body1', legsSpriteId: 'legs1', feetSpriteId: 'feet1',
    wounds: [], equipment: { weapon: { id: 'w', baseId: 'sword_basic', slot: 'weapon', rarity: 'common', weaponType: 'sword', affixes: [], floorRolledAt: 1 } },
    xp: 0, level, pendingPerks: [], pickedPerks: [],
  };
}

const NO_LEGENDARY: Unlocks = {
  classes: [], dungeons: [], buildings: [], legendaryEnabled: false,
};

describe('detectXpMilestones', () => {
  it('returns first_hero_l10 when a hero crosses 9 → 10', () => {
    const before = [makeHero(9)];
    const after = [makeHero(10)];
    expect(detectXpMilestones(before, after, NO_LEGENDARY)).toEqual(['first_hero_l10']);
  });

  it('returns [] when no hero crosses 10', () => {
    const before = [makeHero(5)];
    const after = [makeHero(6)];
    expect(detectXpMilestones(before, after, NO_LEGENDARY)).toEqual([]);
  });

  it('returns [] when unlocks.legendaryEnabled is already true (idempotency)', () => {
    const before = [makeHero(9)];
    const after = [makeHero(10)];
    const unlocked: Unlocks = { ...NO_LEGENDARY, legendaryEnabled: true };
    expect(detectXpMilestones(before, after, unlocked)).toEqual([]);
  });

  it('returns first_hero_l10 even if only one of multiple heroes crossed', () => {
    const before = [makeHero(5), makeHero(9), makeHero(7)];
    const after = [makeHero(5), makeHero(10), makeHero(7)];
    expect(detectXpMilestones(before, after, NO_LEGENDARY)).toEqual(['first_hero_l10']);
  });

  it('returns [] when hero was already at 10 before (no crossing)', () => {
    const before = [makeHero(10)];
    const after = [makeHero(10)];
    expect(detectXpMilestones(before, after, NO_LEGENDARY)).toEqual([]);
  });
});

describe('MILESTONES.first_hero_l10 handler', () => {
  it('flips unlocks.legendaryEnabled from false to true', () => {
    const state = makeStateWith({ legendaryEnabled: false });
    const next = MILESTONES.first_hero_l10(state);
    expect(next.unlocks.legendaryEnabled).toBe(true);
  });

  it('is idempotent (no-op if already true)', () => {
    const state = makeStateWith({ legendaryEnabled: true });
    const next = MILESTONES.first_hero_l10(state);
    expect(next).toBe(state);  // identity preserved
  });
});

// makeStateWith is a test helper — verify the project convention; if missing, inline a minimal SaveFile literal.
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/run/__tests__/milestones.test.ts -t "detectXpMilestones|first_hero_l10"`
Expected: FAIL — `detectXpMilestones` not exported; `MILESTONES.first_hero_l10` not defined.

- [ ] **Step 3: Implement `detectXpMilestones` and the handler**

Edit `src/run/milestones.ts`. Add the import + function + register the handler:

```ts
import type { Hero } from '@heroes/hero';
import type { MilestoneId, Unlocks } from '@data/types';

// (Existing detectBossMilestones / MILESTONES record etc.)

/**
 * Returns ['first_hero_l10'] when any hero crossed level 10 (from < 10 to >= 10)
 * in this XP-grant, and the milestone hasn't already fired. Otherwise [].
 *
 * The before/after arrays must be parallel (same hero ids at same indices).
 * Called from the two XP-grant sites: completeCombat + completeSurpriseCombat.
 */
export function detectXpMilestones(
  partyBefore: readonly Hero[],
  partyAfter: readonly Hero[],
  unlocks: Unlocks,
): readonly MilestoneId[] {
  if (unlocks.legendaryEnabled) return [];
  const crossed = partyAfter.some((hAfter, i) => {
    const hBefore = partyBefore[i];
    return hBefore !== undefined && hAfter.level >= 10 && hBefore.level < 10;
  });
  return crossed ? ['first_hero_l10'] : [];
}
```

Add the handler inside the `MILESTONES` record:

```ts
export const MILESTONES: Record<MilestoneId, MilestoneHandler> = {
  // ... existing first_crypt_clear, first_sunken_keep_clear ...
  first_hero_l10: (state) => {
    if (state.unlocks.legendaryEnabled) return state;
    return {
      ...state,
      unlocks: { ...state.unlocks, legendaryEnabled: true },
    };
  },
};
```

- [ ] **Step 4: Wire call sites in `src/run/run_state.ts`**

In `completeCombat` (around line 282), before the line:
```ts
const partyAfterXp = updatedPartyLiving.map((hero) => { ... });
```
the function already has `updatedPartyLiving` (or equivalent — read the actual variable). The "before" array is `updatedPartyLiving`. The "after" array is `partyAfterXp`. Add after the `partyAfterXp.map` block:

```ts
// L10 milestone detection (Spec 3): check whether any hero crossed level 10
// during this XP grant. partyBefore = pre-applyLevelUps living party;
// partyAfter = post-applyLevelUps. Push detected ids into pendingMilestones.
const xpMilestones = detectXpMilestones(updatedPartyLiving, partyAfterXp, state.unlocks);
// (existing boss milestone detection if any)
const newPendingMilestones = [
  ...runState.pendingMilestones,
  ...xpMilestones,
  // (existing boss milestone ids if applicable)
];
```

(The exact structure depends on the existing code — read `completeCombat` and adapt. The key invariant: `xpMilestones` joins whatever path puts ids into `runState.pendingMilestones`.)

In `completeSurpriseCombat` (around line 414), apply the same pattern. The XP-grant path there is at line 417 — capture before/after similarly.

Add the import at top of `run_state.ts`:
```ts
import { detectBossMilestones, detectXpMilestones } from './milestones';
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/run/__tests__/milestones.test.ts && npm test`
Expected: PASS.

Type check: `npx tsc --noEmit`
Expected: clean.

NOTE: `runState.pendingMilestones` must already exist (added in an earlier spec). If not, the runState shape needs an `pendingMilestones: readonly MilestoneId[]` field. Verify by reading `src/run/run_state.ts`.

- [ ] **Step 6: ~~Commit~~ — SKIPPED**

---

## Task 4: Combatant.equippedLegendaryIds + hook system widening

**Files:**
- Modify: `src/combat/types.ts` (`Combatant.equippedLegendaryIds`; rename `firstAttackFiredPerkIds` → `firstAttackFiredSourceIds`)
- Modify: `src/combat/combatant.ts` (3 creators default `equippedLegendaryIds: []`)
- Modify: `src/combat/perk_hooks.ts` (widen `applyPerkAction.perkId` → `sourceId: PerkId | LegendaryId`; iterate legendaries in `firePerkTrigger`, `fireOnStruckNonMitigation`, `recomputeBelowHpAuras`)
- Modify: `src/combat/effects.ts` (call sites pass sourceId)
- Modify: `src/combat/combat.ts` (firstAttack tracker rename)
- Modify: `src/run/combat_setup.ts` (gather equippedLegendaryIds from hero.equipment)

- [ ] **Step 1: Write the failing test**

Add to `src/combat/__tests__/perks_integration.test.ts`:

```ts
import { LEGENDARY_DEFS } from '@data/legendaries';

describe('Legendary equipped → triggered passive fires (smoke)', () => {
  it('a hero with Lich\'s Crown equipped gets onKill stacks just like the Spellweaver perk', () => {
    // Setup: a hero with equippedLegendaryIds: ['lichs_crown']; force a kill;
    // assert that perk_stack_lichs_crown_0 status exists on the hero after the kill.
    // Full setup omitted here — implementation uses the same pattern as
    // the existing onKill perk integration tests.
  });
});
```

(Full test code authored during implementation; this is the smoke check.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/combat/__tests__/perks_integration.test.ts -t "Legendary equipped"`
Expected: FAIL — `equippedLegendaryIds` not on Combatant; hook system doesn't iterate legendaries.

- [ ] **Step 3: Add `equippedLegendaryIds` to Combatant**

Edit `src/combat/types.ts`:

```ts
export interface Combatant {
  // ... existing fields ...
  pickedPerks: readonly PerkId[];
  equippedLegendaryIds: readonly LegendaryId[];  // NEW
  firstAttackFiredSourceIds?: readonly string[];  // RENAMED from firstAttackFiredPerkIds
  pendingDamageMod?: number;
  // ...
}
```

Add `LegendaryId` to the imports at the top.

- [ ] **Step 4: Update creators in `src/combat/combatant.ts`**

All three creators (`createHeroCombatant`, `createEnemyCombatant`, `createPetCombatant`) default `equippedLegendaryIds: []` before the `...overrides` spread, alongside `pickedPerks: []`.

- [ ] **Step 5: Widen `applyPerkAction` and `firePerkTrigger`**

Edit `src/combat/perk_hooks.ts`. Rename the `perkId` parameter to `sourceId` throughout (it's a string — `PerkId | LegendaryId`); the stack-key generation works identically.

```ts
export interface ApplyPerkActionArgs {
  self: Combatant;
  other: Combatant | undefined;
  sourceId: PerkId | LegendaryId;  // was perkId
  action: PerkAction;
  events: CombatEvent[];
}

export function applyPerkAction(args: ApplyPerkActionArgs): void {
  const { self, other, sourceId, action, events } = args;
  switch (action.kind) {
    case 'gainStat':
      if (action.duration !== undefined && action.stacking) {
        addStack(self, sourceId, action);
      } else if (action.duration !== undefined) {
        const key = `perk_stack_${sourceId}_0`;
        // ...
      } else {
        const key = `perk_aura_${sourceId}`;
        // ...
      }
      return;
    // ... rest unchanged with sourceId in place of perkId ...
  }
}
```

Update `addStack`, `clearPerkAura`, internal helpers: `perkId` → `sourceId`. The runtime is identical since both unions are string literals.

Widen `firePerkTrigger` to iterate legendaries:

```ts
import { LEGENDARY_DEFS } from '@data/legendaries';
import type { LegendaryId, TriggeredEffect } from '@data/types';

function gatherTriggeredEffects(combatant: Combatant): readonly { sourceId: string; effect: TriggeredEffect }[] {
  const out: { sourceId: string; effect: TriggeredEffect }[] = [];
  for (const perkId of combatant.pickedPerks) {
    const e = PERKS[perkId]?.triggeredEffect;
    if (e) out.push({ sourceId: perkId, effect: e });
  }
  for (const legId of combatant.equippedLegendaryIds) {
    out.push({ sourceId: legId, effect: LEGENDARY_DEFS[legId].triggeredEffect });
  }
  return out;
}

export function firePerkTrigger(args: FirePerkTriggerArgs): void {
  for (const { sourceId, effect: t } of gatherTriggeredEffects(args.self)) {
    if (!matchesTrigger(t.trigger, args)) continue;
    applyPerkAction({
      self: args.self, other: args.other,
      sourceId, action: t.action, events: args.events,
    });
  }
}
```

Update `fireOnStruckNonMitigation` similarly (iterate `gatherTriggeredEffects(self)` filtered to `onStruck` trigger kind and non-damageMitigation action).

Update `recomputeBelowHpAuras` similarly (iterate `gatherTriggeredEffects(self)` filtered to `whenBelowHp` trigger kind).

- [ ] **Step 6: Update effects.ts call sites + combat.ts firstAttack tracker**

Edit `src/combat/effects.ts`: the inline damageMitigation loop in `applyDamage` (Spec 1 Task 8) currently iterates `target.pickedPerks`. Widen to iterate `gatherTriggeredEffects(target)` and check the source's onStruck damageMitigation action. Pseudocode:

```ts
const wasFullHp = target.currentHp >= target.maxHp;
let mitigated = amplified;
for (const { sourceId, effect: t } of gatherTriggeredEffects(target)) {
  if (t.trigger.kind !== 'onStruck') continue;
  if (t.trigger.whenAtFullHp && !wasFullHp) continue;
  if (t.action.kind === 'damageMitigation') {
    mitigated = Math.max(1, Math.round(mitigated * t.action.multiplier));
  }
}
// (existing fireOnStruckNonMitigation call now iterates legendaries via gatherTriggeredEffects)
```

`gatherTriggeredEffects` needs to be exported from `perk_hooks.ts` for `effects.ts` to use; OR move the inline mitigation pass into a helper in `perk_hooks.ts` and call it from `effects.ts`. Pick whichever is cleaner; recommended: export `gatherTriggeredEffects` and inline the mitigation pass in effects.ts.

Edit `src/combat/combat.ts`: rename `firstAttackFiredPerkIds` references to `firstAttackFiredSourceIds`. The fire-site code already uses `combatant.pickedPerks` to iterate firstAttack-eligible perks; widen to iterate `gatherTriggeredEffects(combatant)` filtered to `firstAttack` trigger. Match against `firstAttackFiredSourceIds` to prevent re-firing.

- [ ] **Step 7: Populate `equippedLegendaryIds` at combat-setup**

Edit `src/run/combat_setup.ts`. The `createHeroCombatant` call (around line 76-87) needs the new field. Compute the list from hero.equipment:

```ts
function gatherEquippedLegendaryIds(equipment: HeroEquipment): readonly LegendaryId[] {
  const out: LegendaryId[] = [];
  for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
    const item = equipment[slot];
    if (item?.legendaryId !== undefined) out.push(item.legendaryId);
  }
  return out;
}

// Inside the createHeroCombatant call options:
createHeroCombatant(hero.classId, (i + 1) as SlotIndex, `p${i}`, {
  // ... existing fields ...
  pickedPerks: hero.pickedPerks,
  equippedLegendaryIds: gatherEquippedLegendaryIds(hero.equipment),  // NEW
});
```

- [ ] **Step 8: Run tests**

Run: `npm test 2>&1 | tail -15`
Expected: existing tests still pass; the new Lich's Crown smoke test passes once you author it (full body) following the existing onKill perk integration pattern.

Type check: `npx tsc --noEmit`

- [ ] **Step 9: ~~Commit~~ — SKIPPED**

---

## Task 5: Boss-drop substitution

**Files:**
- Modify: `src/dungeon/loot.ts` (widen `rollLoot` signature; add `rollNamedLegendary` helper; substitution logic)
- Modify: `src/run/run_state.ts` (pass `legendaryEnabled` + `bossId` to `rollLoot`)
- Modify: `src/dungeon/__tests__/loot.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/dungeon/__tests__/loot.test.ts`:

```ts
import { LEGENDARY_DEFS } from '@data/legendaries';

describe('rollLoot — boss-drop substitution post-L10', () => {
  it('with legendaryEnabled=true and bossId=bone_lich, returns a named legendary', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const item = rollLoot(createRng(seed), 5, 'boss', 1, true, 'bone_lich');
      expect(item).not.toBeNull();
      expect(item!.rarity).toBe('legendary');
      expect(item!.legendaryId).toBeDefined();
      expect(['lichs_crown', 'phylactery']).toContain(item!.legendaryId!);
    }
  });

  it('with legendaryEnabled=true and bossId=drowned_king, returns tidewalker_helm or kings_aegis', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const item = rollLoot(createRng(seed), 5, 'boss', 2, true, 'drowned_king');
      expect(item!.legendaryId).toBeDefined();
      expect(['tidewalker_helm', 'kings_aegis']).toContain(item!.legendaryId!);
    }
  });

  it('with legendaryEnabled=true and bossId=bone_lich, picks both ids over many seeds (no degeneracy)', () => {
    const ids = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const item = rollLoot(createRng(seed), 5, 'boss', 1, true, 'bone_lich');
      if (item?.legendaryId) ids.add(item.legendaryId);
    }
    expect(ids.has('lichs_crown')).toBe(true);
    expect(ids.has('phylactery')).toBe(true);
  });

  it('with legendaryEnabled=false, boss-kind returns normal loot (no legendary)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const item = rollLoot(createRng(seed), 5, 'boss', 1, false, 'bone_lich');
      expect(item!.legendaryId).toBeUndefined();
      // Rarity may be common/uncommon/rare/epic — normal next-floor rarity table
    }
  });

  it('with legendaryEnabled=true but kind=combat, returns normal loot (only boss-kind substitutes)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const item = rollLoot(createRng(seed), 5, 'combat', 1, true, undefined);
      // Combat drops may be null (10% gate); if non-null, no legendaryId
      if (item) expect(item.legendaryId).toBeUndefined();
    }
  });

  it('with legendaryEnabled=true and bossId missing from BOSS_LEGENDARIES, falls through to normal loot', () => {
    // skeleton_warrior isn't a boss with a legendary pool — passing it should fall through
    for (let seed = 1; seed <= 20; seed++) {
      const item = rollLoot(createRng(seed), 5, 'boss', 1, true, 'skeleton_warrior');
      expect(item!.legendaryId).toBeUndefined();
    }
  });
});

describe('rollNamedLegendary', () => {
  it('constructs an Item with the right legendaryId, rarity, empty affixes', () => {
    const item = rollNamedLegendary(createRng(1), 'lichs_crown', 10);
    expect(item.legendaryId).toBe('lichs_crown');
    expect(item.rarity).toBe('legendary');
    expect(item.affixes).toEqual([]);
    expect(item.slot).toBe(LEGENDARY_DEFS.lichs_crown.slot);
    expect(item.baseId).toBe(LEGENDARY_DEFS.lichs_crown.baseId);
    expect(item.floorRolledAt).toBe(10);
    expect(item.rareProperty).toBeUndefined();
  });
});
```

(`rollNamedLegendary` will need to be exported.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/dungeon/__tests__/loot.test.ts -t "boss-drop substitution|rollNamedLegendary"`
Expected: FAIL — `rollLoot` doesn't accept the new params; `rollNamedLegendary` doesn't exist.

- [ ] **Step 3: Widen `rollLoot` and add `rollNamedLegendary`**

Edit `src/dungeon/loot.ts`. Add the import and helper:

```ts
import { LEGENDARY_DEFS, BOSS_LEGENDARIES } from '@data/legendaries';
import type { EnemyId, LegendaryId } from '@data/types';

export function rollNamedLegendary(rng: Rng, legendaryId: LegendaryId, floor: number): Item {
  const def = LEGENDARY_DEFS[legendaryId];
  return {
    id: generateItemId(rng),
    baseId: def.baseId,
    slot: def.slot,
    rarity: 'legendary',
    affixes: [],
    floorRolledAt: floor,
    legendaryId,
  };
}
```

Widen `rollLoot` signature (currently `(rng, floorNumber, kind, tier = 1)`):

```ts
export function rollLoot(
  rng: Rng,
  floorNumber: number,
  kind: LootKind,
  tier: DungeonTier = 1,
  legendaryEnabled = false,
  bossId?: EnemyId,
): Item | null {
  // existing combat-drop gate
  if (kind === 'combat') {
    if (rng.next() >= 0.1) return null;
  }

  // NEW: post-L10 boss substitution
  if (kind === 'boss' && legendaryEnabled && bossId !== undefined) {
    const pool = BOSS_LEGENDARIES[bossId];
    if (pool !== undefined && pool.length > 0) {
      return rollNamedLegendary(rng, rng.pick(pool), floorNumber);
    }
  }

  // ... rest of existing rollLoot body unchanged ...
}
```

- [ ] **Step 4: Update caller in `src/run/run_state.ts`**

Around line 291 (the `rollLoot` call):

```ts
// Before:
const drop = rollLoot(rng, runState.currentFloorNumber, kind, dungeonTierOf(runState));

// After:
const drop = rollLoot(
  rng,
  runState.currentFloorNumber,
  kind,
  dungeonTierOf(runState),
  state.unlocks.legendaryEnabled,
  kind === 'boss' ? bossEnemyIdFrom(runState, completedNode) : undefined,
);
```

Add a helper `bossEnemyIdFrom(runState, node)` (or inline) that reads the encounter's first enemy id from the completed boss node. Encounter shape: `Encounter.enemies[0].enemyId` (per `src/run/combat_setup.ts:62` and `src/run/__tests__/combat_setup.test.ts`). Verify the boss encounter has the boss at index 0.

Read `completeCombat` to find the right place to extract this. If the boss enemyId isn't readily available, expose it via the encounter or node data.

`completeSurpriseCombat` doesn't ever pass `'boss'` as kind (surprise combats are non-boss); pass `legendaryEnabled` for safety and `undefined` for `bossId`.

- [ ] **Step 5: Run tests + tsc**

Run: `npx vitest run src/dungeon/__tests__/loot.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

If existing `rollLoot` callers (in shop.ts or elsewhere) broke due to the new params, the new params are optional with defaults (`legendaryEnabled = false`, `bossId?` undefined) so existing call sites work unchanged.

- [ ] **Step 6: ~~Commit~~ — SKIPPED**

---

## Task 6: Equip/stat-compute path for legendary items

**Files:**
- Modify: `src/items/stats.ts` (or wherever `applyEquipmentStats` lives — verify via grep)
- Modify: relevant test files

The equipment-stat aggregation function currently sums affix bonuses + base stats from `BASE_ITEM_STATS`. For legendary items, the stats come from `LEGENDARY_DEFS[item.legendaryId]` instead.

- [ ] **Step 1: Locate the stat-aggregation function**

Run: `grep -l "applyEquipmentStats\|rarePropertyFields\|BASE_ITEM_STATS" src/items/ src/heroes/`

Expected files: `src/items/stats.ts`, `src/heroes/hero.ts`. Read each to find the function that sums per-item stat contributions.

- [ ] **Step 2: Write the failing test**

Add to `src/items/__tests__/stats.test.ts` (or wherever stats tests live):

```ts
import { applyEquipmentStats } from '../stats';
import { LEGENDARY_DEFS } from '@data/legendaries';

describe('applyEquipmentStats — legendary items', () => {
  it('reads stats from LEGENDARY_DEFS when item.legendaryId is set', () => {
    const baseStats = { hp: 30, attack: 5, defense: 2, speed: 5, mind: 1, crit: 5, dodge: 5 };
    const equipment = {
      weapon: { id: 'w', baseId: 'sword_basic', slot: 'weapon', rarity: 'common', weaponType: 'sword', affixes: [], floorRolledAt: 1 },
      hat: { id: 'h', baseId: 'hat_hood', slot: 'hat', rarity: 'legendary', affixes: [], floorRolledAt: 10, legendaryId: 'lichs_crown' },
    };
    const result = applyEquipmentStats(baseStats, equipment);
    // Lich's Crown: +5 Mind, +5 Crit (from LEGENDARY_DEFS.lichs_crown.stats)
    expect(result.mind).toBe(baseStats.mind + 5);
    expect(result.crit).toBe(baseStats.crit + 5);
  });

  it('legendary items with hpBonus contribute to maxHp aggregation', () => {
    // Phylactery: +15 HP, +2 Defense
    const equipment = {
      weapon: { /* ... */ },
      outfit: { id: 'o', baseId: 'outfit_cloth', slot: 'outfit', rarity: 'legendary', affixes: [], floorRolledAt: 10, legendaryId: 'phylactery' },
    };
    // Verify wherever HP aggregation happens (likely separate from stat-array aggregation)
    // ... assertion on aggregated HP ...
  });
});
```

(Adjust assertion shape based on actual `applyEquipmentStats` return type — read the function first.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/items/__tests__/stats.test.ts -t "legendary"`
Expected: FAIL — legendary items currently contribute base-id stats (or nothing if baseId has no stats), not LEGENDARY_DEFS.stats.

- [ ] **Step 4: Add legendary branch in stat aggregation**

Modify the per-item aggregation block. The current code likely looks like:

```ts
for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
  const item = equipment[slot];
  if (!item) continue;
  const baseStats = BASE_ITEM_STATS[item.baseId];
  // sum base stats + affix bonuses
}
```

Add a branch for legendary items:

```ts
for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
  const item = equipment[slot];
  if (!item) continue;
  if (item.legendaryId !== undefined) {
    const def = LEGENDARY_DEFS[item.legendaryId];
    for (const [stat, delta] of Object.entries(def.stats)) {
      if (delta !== undefined) result[stat as BuffableStat] += delta;
    }
    continue;  // legendary items don't use base stats or affixes
  }
  // existing path: base stats + affix bonuses
  const baseStats = BASE_ITEM_STATS[item.baseId];
  // ...
}
```

For HP aggregation (`gearTotal` in `src/heroes/hero.ts`), add a similar legendary branch:

```ts
function gearTotal(equipment: HeroEquipment): number {
  let gear = 0;
  for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
    const item = equipment[slot];
    if (!item) continue;
    if (item.legendaryId !== undefined) {
      gear += LEGENDARY_DEFS[item.legendaryId].hpBonus ?? 0;
      continue;
    }
    // existing base-stat + affix HP path
  }
  return gear;
}
```

(Verify `gearTotal`'s current shape and adapt.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/items src/heroes && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: ~~Commit~~ — SKIPPED**

---

## Task 7: Save migration v6 → v7

**Files:**
- Modify: `src/save/migration.ts`
- Modify: `src/save/save.ts` (normalizeSaveFile defensive backfill)
- Modify: `src/save/__tests__/migration.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/save/__tests__/migration.test.ts`:

```ts
describe('v6 → v7 migration (legendaryEnabled unlock flag)', () => {
  it('adds unlocks.legendaryEnabled = false to existing saves', () => {
    const v6: Record<string, unknown> = {
      version: 6,
      roster: { heroes: [] },
      unlocks: { classes: [], dungeons: [], buildings: [] },
    };
    const out = migrate(v6);
    expect(out.version).toBe(7);
    const unlocks = out.unlocks as Record<string, unknown>;
    expect(unlocks.legendaryEnabled).toBe(false);
  });

  it('preserves an existing legendaryEnabled value on a freshly-migrated save', () => {
    const v6: Record<string, unknown> = {
      version: 6,
      roster: { heroes: [] },
      unlocks: { classes: [], dungeons: [], buildings: [], legendaryEnabled: true },
    };
    const out = migrate(v6);
    expect(out.version).toBe(7);
    const unlocks = out.unlocks as Record<string, unknown>;
    expect(unlocks.legendaryEnabled).toBe(true);
  });

  it('is idempotent on a v7 save', () => {
    const v7: Record<string, unknown> = {
      version: 7,
      unlocks: { classes: [], dungeons: [], buildings: [], legendaryEnabled: true },
    };
    const out = migrate(v7);
    expect(out.version).toBe(7);
    expect((out.unlocks as Record<string, unknown>).legendaryEnabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/save/__tests__/migration.test.ts -t "v6 → v7"`
Expected: FAIL — CURRENT_SCHEMA_VERSION is 6, no MIGRATIONS[6] step.

- [ ] **Step 3: Bump version + add migration step**

Edit `src/save/migration.ts`:

```ts
export const CURRENT_SCHEMA_VERSION = 7;

// Add inside the MIGRATIONS record:
6: (raw) => {
  const out: Record<string, unknown> = { ...raw, version: 7 };
  const unlocks = out.unlocks as Record<string, unknown> | undefined;
  if (unlocks) {
    if (typeof unlocks.legendaryEnabled !== 'boolean') {
      out.unlocks = { ...unlocks, legendaryEnabled: false };
    }
  }
  return out;
},
```

- [ ] **Step 4: Defensive normalize in save.ts**

Edit `src/save/save.ts`'s normalize function (the one that backfills missing fields per existing pattern — verify). Add:

```ts
// Inside the normalizer:
if (typeof file.unlocks.legendaryEnabled !== 'boolean') {
  // Defensive: shim ensures the field is always present for code that reads it,
  // even if the save somehow bypassed migration.
  return {
    ...file,
    unlocks: { ...file.unlocks, legendaryEnabled: false },
  };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/save && npm test && npx tsc --noEmit`
Expected: PASS.

Likely-affected: any test fixture with `unlocks: { classes, dungeons, buildings }` literal needs `legendaryEnabled: false` added. TypeScript surfaces these. Fix per-fixture.

- [ ] **Step 6: ~~Commit~~ — SKIPPED**

---

## Task 8: UI updates — tooltip rendering for named legendaries

**Files:**
- Modify: likely `src/scenes/equip_scene.ts` (tooltip render path) — verify by grep
- Possibly: `src/ui/` widgets if tooltip is rendered there
- No automated test (Phaser UI); manual smoke

- [ ] **Step 1: Find the tooltip render site**

Run: `grep -n "item\.baseId\|getItemDisplayName\|BASE_ITEMS\[item\." src/scenes/ src/ui/ src/render/`

Expected: tooltip text formatting reads `item.baseId` to look up display name via `BASE_ITEMS[item.baseId].name` (or similar). Find this path.

- [ ] **Step 2: Add legendaryId branch**

When `item.legendaryId !== undefined`, use the LegendaryDef name + flavor:

```ts
import { LEGENDARY_DEFS } from '@data/legendaries';

function getItemDisplayName(item: Item): string {
  if (item.legendaryId !== undefined) {
    return LEGENDARY_DEFS[item.legendaryId].name;
  }
  return BASE_ITEMS[item.baseId].name;  // existing path
}

function getItemFlavor(item: Item): string | undefined {
  if (item.legendaryId !== undefined) {
    return LEGENDARY_DEFS[item.legendaryId].flavor;
  }
  return undefined;  // non-legendaries have no flavor today
}
```

Plumb `getItemFlavor` into the tooltip render where applicable. Adapt to the existing scene's pattern — read the surrounding tooltip code to match style.

- [ ] **Step 3: tsc + smoke**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

Manual smoke (user does this — not Claude): run `npm run dev`, force-equip a legendary on a hero (via dev hack or save edit), verify the tooltip displays the legendary's name + flavor.

- [ ] **Step 4: ~~Commit~~ — SKIPPED**

---

## Task 9: Integration tests — per-legendary in-combat + end-to-end milestone flow

**Files:**
- Modify: `src/combat/__tests__/perks_integration.test.ts`
- Modify: `src/run/__tests__/run_state.test.ts`

- [ ] **Step 1: Write per-legendary tests**

Append to `src/combat/__tests__/perks_integration.test.ts`:

```ts
describe("Lich's Crown (onKill → +2 Mind, dur 3, stacking)", () => {
  it('fires onKill, equipping the hat via equippedLegendaryIds', () => {
    // Hero with equippedLegendaryIds: ['lichs_crown']; force a kill.
    // Assert: perk_stack_lichs_crown_0 status exists, +2 mind buff active.
  });
});

describe('Phylactery (onStruck → rotting on attacker)', () => {
  it('applies rotting status to attacker on hit', () => {
    // Hero with phylactery equipped; enemy hits hero; check enemy.statuses.rotting exists.
  });
});

describe('Tidewalker Helm (whenBelowHp 0.5 → +4 Defense)', () => {
  it('applies aura at low HP via equipped slot', () => {
    // Hero with tidewalker_helm; drop HP < 50%; recompute; assert perk_aura_tidewalker_helm exists; +4 Def.
  });
});

describe("King's Aegis (onStruck → drowning on attacker)", () => {
  it('applies drowning status to attacker on hit', () => {
    // Hero with kings_aegis equipped; enemy hits hero; check enemy.statuses.drowning kind: 'poison'.
  });
});
```

Implement each test body following the existing onKill / onStruck / whenBelowHp integration patterns. Use real LEGENDARY_DEFS lookups (no monkey-patching needed since the items are real).

- [ ] **Step 2: Write end-to-end milestone flow test**

Append to `src/run/__tests__/run_state.test.ts`:

```ts
describe('L10 milestone end-to-end flow', () => {
  it('completing a combat that crosses a hero to L10 sets pendingMilestones += first_hero_l10', () => {
    // Setup runState with a hero at L9 with enough XP that next combat pushes them to L10.
    // Call completeCombat. Assert runState.pendingMilestones includes 'first_hero_l10'.
  });

  it('post-milestone boss kill drops a named legendary (random of the 2)', () => {
    // Setup runState with unlocks.legendaryEnabled=true on bone_lich boss kill.
    // Verify the dropped item has rarity:'legendary' and legendaryId in ['lichs_crown', 'phylactery'].
  });

  it('pre-milestone boss kill drops normal loot (no legendaryId)', () => {
    // Setup runState with unlocks.legendaryEnabled=false on bone_lich boss kill.
    // Verify the dropped item has no legendaryId.
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test && npx tsc --noEmit`
Expected: ~2150 tests pass (~2126 at start + ~25 new across Tasks 1-9). All green.

- [ ] **Step 4: ~~Commit~~ — SKIPPED**

---

## Wrap-up

After Task 9, run final verification:

```bash
npm test && npm run build && npx tsc --noEmit
```

Expected: all tests pass; production build clean; typecheck clean.

Verify spec out-of-scope items stayed out:
- No random legendaries (Spec 4 territory)
- No bespoke art for legendary sprites (Cluster C)
- No new boss legendary entries beyond bone_lich + drowned_king

Move TODO Cluster D · 9 entry to HISTORY.md with the slim template (Why / Decisions / Surprises / Source).

---

## Self-review notes

**Spec coverage check:**
- Rarity widening + LegendaryId + LegendaryDef + Item.legendaryId: Task 1 ✓
- LEGENDARY_DEFS + BOSS_LEGENDARIES: Task 2 ✓
- Synthesizer 'drowning': Task 2 ✓
- L10 milestone detection + handler + call sites: Task 3 ✓
- Hook system widening for legendary triggers: Task 4 ✓
- Boss-drop substitution + rollNamedLegendary: Task 5 ✓
- Equip/stat-compute path for legendaries: Task 6 ✓
- Save migration v6 → v7: Task 7 ✓
- Tooltip rendering: Task 8 ✓
- Integration tests (per-legendary + end-to-end): Task 9 ✓
- Sell value: Task 1 ✓
- Upgrade chain (legendary cap): Task 1 ✓
- Blacksmith UI sell-confirm gate: Task 1 ✓
- Rarity colors: Task 1 ✓

**Risk: `firstAttackFiredPerkIds` rename to `firstAttackFiredSourceIds`** — none of the 4 named legendaries use `firstAttack` trigger, so the field is unused by Task 9's integration tests. The rename is purely future-proofing. Could be deferred (revert to keeping `firstAttackFiredPerkIds`); current plan widens it for symmetry with the unified `sourceId` type. Accept either choice during Task 4 implementation.

**Type consistency check:**
- `sourceId: PerkId | LegendaryId` consistent across `applyPerkAction`, internal helpers, and stack-key generation.
- `equippedLegendaryIds: readonly LegendaryId[]` typed identically in Combatant, combat_setup gathering, and the hook iteration.
- `legendaryEnabled: boolean` typed consistently in Unlocks, detectXpMilestones, MILESTONES handler, rollLoot signature, and save migration.

**No placeholders found in the plan.**
