# Epic gear tier — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `'epic'` to the `Rarity` union with full loot/upgrade/sell/UI plumbing. Epic items roll 3 affixes (4 for hats) plus a guaranteed rare-property, appearing at deeper floors per an extended drop curve.

**Architecture:** Widen the existing `Rarity` discriminated string union; every `Record<Rarity, X>` and similar consumer gets a new Epic entry. RARITY_TABLE rows gain an `epic` column with a conservative curve (0% to floor 3, 10% peak at floor 15). The `pickRareProperty` gate at three loot.ts call sites widens to include `'epic'`. Rarity colors centralize into a new `src/render/rarity_colors.ts` to remove existing duplication and make Spec 3's legendary addition a one-file edit.

**Tech Stack:** TypeScript, Vitest, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-12-epic-gear-tier-design.md`

---

## File structure

**New file:**
- `src/render/rarity_colors.ts` — central RARITY_COLOR_HEX / RARITY_COLOR_NUM. Each is `Record<Rarity, X>`. Single source of truth.

**Modified files:**
- `src/data/types.ts` — `Rarity` union widens to include `'epic'`.
- `src/data/blacksmith.ts` — `BLACKSMITH_UPGRADE_COST.epic = 900`.
- `src/items/sell.ts` — `SELL_VALUE.epic = 200`.
- `src/items/upgrade.ts` — `NEXT_RARITY` extends (rare → 'epic'; epic → null).
- `src/dungeon/loot.ts` — `RarityRow` adds `epic`; `RARITY_TABLE` adjusts rare percentages and adds epic column; `rarityWeightsAt` / `pluckWeights` / `lerp` extend; `pickRarity` adds `epic` to weighted options; `affixCount` handles `'epic'`; three `pickRareProperty` gates widen.
- `src/scenes/equip_scene.ts` — remove local `RARITY_COLOR_NUM` and `RARITY_COLOR_HEX`, import from `@render/rarity_colors`.
- `src/scenes/event_overlay_scene.ts` — same: remove local `RARITY_COLOR`, import.
- `src/scenes/blacksmith_panel_scene.ts:684` — replace `item.rarity === 'rare'` max-rarity check with `nextRarity(item.rarity) === null` so the indicator survives future tier additions.

**Modified test files:**
- `src/dungeon/__tests__/loot.test.ts` — many `=== 'rare'` assertions; existing rarity-distribution snapshots; add Epic-distribution tests, Epic-affix-count tests, Epic-rare-property tests.
- `src/items/__tests__/upgrade.test.ts` — add rare→epic upgrade tests; assert Epic is the cap (canUpgrade returns false).
- `src/items/__tests__/sell.test.ts` — add Epic sell value test.
- `src/dungeon/__tests__/shop.test.ts` — existing rare-property assertions may need widening for Epic at high floors.

---

## Task 1: Rarity widening + non-loot records

**Files:**
- Modify: `src/data/types.ts` (Rarity union)
- Modify: `src/data/blacksmith.ts` (BLACKSMITH_UPGRADE_COST)
- Modify: `src/items/sell.ts` (SELL_VALUE)
- Modify: `src/items/upgrade.ts` (NEXT_RARITY)
- Modify: `src/scenes/equip_scene.ts` (RARITY_COLOR_NUM, RARITY_COLOR_HEX — inline, will centralize in Task 4)
- Modify: `src/scenes/event_overlay_scene.ts` (RARITY_COLOR — inline, will centralize in Task 4)

- [ ] **Step 1: Write the failing tests**

Add to `src/items/__tests__/sell.test.ts` (or wherever the sell-value test lives — verify location first by running `npx vitest run -t "sell value"` or grepping for `SELL_VALUE`):

```ts
import { describe, expect, it } from 'vitest';
// Import via the same path used by the existing tests
import type { Item } from '@data/types';
import { itemSellValue } from '../sell';

describe('itemSellValue — Epic tier', () => {
  it('returns 200 for an epic item', () => {
    const item: Item = {
      id: 't0', baseId: 'sword_basic', slot: 'weapon', rarity: 'epic',
      weaponType: 'sword', affixes: [], floorRolledAt: 10,
    };
    expect(itemSellValue(item)).toBe(200);
  });
});
```

Add to `src/data/__tests__/blacksmith.test.ts` (create if missing — verify with `npx vitest run src/data`):

```ts
import { describe, expect, it } from 'vitest';
import { BLACKSMITH_UPGRADE_COST } from '../blacksmith';

describe('BLACKSMITH_UPGRADE_COST', () => {
  it('rare→epic costs 900g', () => {
    expect(BLACKSMITH_UPGRADE_COST.epic).toBe(900);
  });
  it('keeps existing uncommon=100 and rare=300', () => {
    expect(BLACKSMITH_UPGRADE_COST.uncommon).toBe(100);
    expect(BLACKSMITH_UPGRADE_COST.rare).toBe(300);
  });
});
```

Add to `src/items/__tests__/upgrade.test.ts`:

```ts
describe('nextRarity — Epic tier', () => {
  it('rare upgrades to epic', () => {
    expect(nextRarity('rare')).toBe('epic');
  });
  it('epic is the cap (no further upgrade)', () => {
    expect(nextRarity('epic')).toBeNull();
  });
});
```

(`nextRarity` is already exported from `src/items/upgrade.ts:18-20`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/items src/data/__tests__/blacksmith.test.ts 2>&1 | tail -30`
Expected: FAIL — `'epic'` is not assignable to `Rarity`; `BLACKSMITH_UPGRADE_COST.epic` is undefined; `nextRarity('rare')` returns null (not 'epic').

- [ ] **Step 3: Widen the Rarity union**

Edit `src/data/types.ts`. Find `export type Rarity =` (around line 88):

```ts
// Before:
export type Rarity = 'common' | 'uncommon' | 'rare';

// After:
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';
```

- [ ] **Step 4: Extend BLACKSMITH_UPGRADE_COST**

Edit `src/data/blacksmith.ts`:

```ts
import type { Rarity } from './types';

// Cost is keyed by the *target* rarity (i.e. the rarity the item will become).
export const BLACKSMITH_UPGRADE_COST: Record<Exclude<Rarity, 'common'>, number> = {
  uncommon: 100,
  rare: 300,
  epic: 900,
};
```

- [ ] **Step 5: Extend SELL_VALUE**

Edit `src/items/sell.ts`:

```ts
const SELL_VALUE: Record<Rarity, number> = {
  common: 10,
  uncommon: 30,
  rare: 80,
  epic: 200,
};
```

- [ ] **Step 6: Extend NEXT_RARITY**

Edit `src/items/upgrade.ts`:

```ts
const NEXT_RARITY: Record<Rarity, Exclude<Rarity, 'common'> | null> = {
  common: 'uncommon',
  uncommon: 'rare',
  rare: 'epic',
  epic: null,
};
```

- [ ] **Step 7: Extend the inline color records in scenes**

`tsc --noEmit` will now error on the inline `RARITY_COLOR_NUM` and `RARITY_COLOR_HEX` records in `equip_scene.ts` and `event_overlay_scene.ts` because the Item.rarity argument could be `'epic'` but the records don't have an `'epic'` key. Add Epic inline (Task 4 will centralize):

Edit `src/scenes/equip_scene.ts` lines 56-66:

```ts
const RARITY_COLOR_NUM: Record<Rarity, number> = {
  common: 0xcccccc,
  uncommon: 0x4488ff,
  rare: 0xffcc66,
  epic: 0xa060ff,
};

const RARITY_COLOR_HEX: Record<Rarity, string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
  epic: '#a060ff',
};
```

Add `import type { Rarity } from '@data/types';` if not already imported.

Edit `src/scenes/event_overlay_scene.ts` around line 56:

```ts
const RARITY_COLOR: Record<Rarity, string> = {
  common: '#cccccc',
  uncommon: '#4488ff',
  rare: '#ffcc66',
  epic: '#a060ff',
};
```

Add the same import if needed.

(The local record type was `Record<'common' | 'uncommon' | 'rare', X>` — widen to `Record<Rarity, X>` so future Rarity additions don't require touching this signature line.)

- [ ] **Step 8: Run tests + tsc to verify they pass and nothing else broke**

Run: `npx tsc --noEmit 2>&1 | head -30 && npx vitest run src/items src/data/__tests__/blacksmith.test.ts 2>&1 | tail -20`
Expected: tsc clean; new tests pass.

Then full suite: `npm test 2>&1 | tail -10`
Expected: PASS. Some loot tests may fail at this point because RARITY_TABLE doesn't yet have an `epic` column (rarityWeightsAt at line 53-72 still returns 3-key shape, which will type-error against the widened Rarity if any test asserts on Epic). If `npm test` fails with errors about missing `epic` weight or unreachable code, those break in Task 2.

If `npm test` is green here, that's fine — proceed to Task 2.
If `npm test` fails with type errors specifically in `loot.ts` about `epic` missing from RarityRow weights, that's expected — Task 2 fixes it.
If `npm test` fails with unexpected runtime errors, stop and report.

- [ ] **Step 9: ~~Commit~~ — SKIPPED (no-commit mode if applicable; otherwise commit normally)**

```bash
# Standard commit (not in no-commit mode):
git add src/data/types.ts src/data/blacksmith.ts src/items/sell.ts src/items/upgrade.ts src/scenes/equip_scene.ts src/scenes/event_overlay_scene.ts
git add src/items/__tests__/sell.test.ts src/items/__tests__/upgrade.test.ts
# Possibly: src/data/__tests__/blacksmith.test.ts (if newly created)
git commit -m "Rarity: widen union with 'epic'; extend non-loot records"
```

---

## Task 2: RARITY_TABLE extension + pickRarity

**Files:**
- Modify: `src/dungeon/loot.ts` (RarityRow interface, RARITY_TABLE rows, rarityWeightsAt, pluckWeights, lerp, pickRarity)
- Modify: `src/dungeon/__tests__/loot.test.ts` (update existing rare-distribution assertions; add epic-distribution assertions)

- [ ] **Step 1: Write the failing test**

Add to `src/dungeon/__tests__/loot.test.ts` (find an existing rarity-distribution test for the file pattern and follow it):

```ts
describe('pickRarity — Epic tier curve', () => {
  it('produces 0 epic at floor 1 (tier 1) over a large sample', () => {
    const rng = createRng(12345);
    let epic = 0;
    for (let i = 0; i < 1000; i++) {
      if (pickRarity(rng, 1, 1) === 'epic') epic++;
    }
    expect(epic).toBe(0);
  });

  it('produces 0 epic at floor 3 (tier 1) over a large sample', () => {
    const rng = createRng(12345);
    let epic = 0;
    for (let i = 0; i < 1000; i++) {
      if (pickRarity(rng, 3, 1) === 'epic') epic++;
    }
    expect(epic).toBe(0);
  });

  it('produces ~1% epic at floor 5 over a large sample (tolerance ±1.5%)', () => {
    const rng = createRng(12345);
    let epic = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) {
      if (pickRarity(rng, 5, 1) === 'epic') epic++;
    }
    const pct = (epic / N) * 100;
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(2.5);
  });

  it('produces ~10% epic at floor 15 over a large sample (tolerance ±2%)', () => {
    const rng = createRng(12345);
    let epic = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) {
      if (pickRarity(rng, 15, 1) === 'epic') epic++;
    }
    const pct = (epic / N) * 100;
    expect(pct).toBeGreaterThan(8);
    expect(pct).toBeLessThan(12);
  });

  it('produces ~2-3% epic at floor 4 in tier 2 (Sunken Keep boss effective floor 7)', () => {
    const rng = createRng(12345);
    let epic = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) {
      if (pickRarity(rng, 4, 2) === 'epic') epic++;
    }
    const pct = (epic / N) * 100;
    expect(pct).toBeGreaterThan(1);
    expect(pct).toBeLessThan(4);
  });
});
```

NOTE: If `pickRarity` is not currently exported from `loot.ts` (read the file — it currently isn't, it's a module-internal function at line 85), you'll need to either:
- Export it for testing (add `export` to `function pickRarity`), OR
- Test indirectly via `rollLoot` / `rollShopItem`

The exported approach is cleaner for these tests. Add `export` to `function pickRarity` at line 85.

`createRng` should be available from `@util/rng` (verify by reading the existing loot test's imports).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/dungeon/__tests__/loot.test.ts -t "Epic tier curve"`
Expected: FAIL — RARITY_TABLE has no `epic` column, weighted-options array doesn't include `epic`.

- [ ] **Step 3: Update RarityRow interface and RARITY_TABLE**

Edit `src/dungeon/loot.ts` lines 36-44:

```ts
interface RarityRow { floor: number; common: number; uncommon: number; rare: number; epic: number }
const RARITY_TABLE: readonly RarityRow[] = [
  { floor: 1,  common: 90, uncommon: 10, rare:  0, epic:  0 },
  { floor: 3,  common: 80, uncommon: 18, rare:  2, epic:  0 },
  { floor: 5,  common: 70, uncommon: 24, rare:  5, epic:  1 },
  { floor: 8,  common: 55, uncommon: 30, rare: 12, epic:  3 },
  { floor: 10, common: 45, uncommon: 32, rare: 18, epic:  5 },
  { floor: 15, common: 30, uncommon: 35, rare: 25, epic: 10 },
];
```

Verify each row sums to 100 by inspection: 100/100/100/100/100/100. ✓

- [ ] **Step 4: Update rarityWeightsAt, pluckWeights, lerp**

`rarityWeightsAt` (line 53-72): return type expands. `pluckWeights` (line 74): adds `epic`. The lerp block inside `rarityWeightsAt` adds an epic line.

```ts
function rarityWeightsAt(floor: number, tier: DungeonTier): { common: number; uncommon: number; rare: number; epic: number } {
  const effectiveFloor = floor + TIER_RARITY_FLOOR_BONUS[tier];
  if (effectiveFloor <= RARITY_TABLE[0].floor) return pluckWeights(RARITY_TABLE[0]);
  if (effectiveFloor >= RARITY_TABLE[RARITY_TABLE.length - 1].floor) {
    return pluckWeights(RARITY_TABLE[RARITY_TABLE.length - 1]);
  }
  for (let i = 0; i < RARITY_TABLE.length - 1; i++) {
    const lo = RARITY_TABLE[i];
    const hi = RARITY_TABLE[i + 1];
    if (effectiveFloor >= lo.floor && effectiveFloor <= hi.floor) {
      const t = (effectiveFloor - lo.floor) / (hi.floor - lo.floor);
      return {
        common: lerp(lo.common, hi.common, t),
        uncommon: lerp(lo.uncommon, hi.uncommon, t),
        rare: lerp(lo.rare, hi.rare, t),
        epic: lerp(lo.epic, hi.epic, t),
      };
    }
  }
  return pluckWeights(RARITY_TABLE[RARITY_TABLE.length - 1]);
}

function pluckWeights(r: RarityRow) {
  return { common: r.common, uncommon: r.uncommon, rare: r.rare, epic: r.epic };
}
```

(`lerp` itself doesn't change — it's a generic numeric function.)

- [ ] **Step 5: Update pickRarity weighted options**

Edit `src/dungeon/loot.ts` lines 85-93:

```ts
export function pickRarity(rng: Rng, floor: number, tier: DungeonTier = 1): Rarity {
  const w = rarityWeightsAt(floor, tier);
  const opts: WeightedOption<Rarity>[] = [
    { value: 'common',   weight: w.common },
    { value: 'uncommon', weight: w.uncommon },
    { value: 'rare',     weight: w.rare },
    { value: 'epic',     weight: w.epic },
  ];
  return rng.weighted(opts);
}
```

(Added `export` per Task 2 Step 1's testing note.)

- [ ] **Step 6: Update any tests that broke from the rare-percent adjustment**

The existing RARITY_TABLE had rare = 0/2/5/13/20/30. The new shape has rare = 0/2/5/12/18/25. Existing rare-distribution tests may now fail with off-by-1-or-2-percent assertions.

Run: `npx vitest run src/dungeon/__tests__/loot.test.ts 2>&1 | tail -40`
Expected: most Epic tests pass; some pre-existing rare-distribution tests fail with slightly tightened expected percentages.

For each failing rare-distribution test, widen the tolerance OR update the expected percentage to match the new curve. Read the test's intent — if it's asserting "rare appears at floor 15" the new 25% still satisfies that. If it's asserting an exact percentage match, update to the new value (12/18/25 at floors 8/10/15).

If `npx vitest run src/dungeon/__tests__/loot.test.ts` passes with only Epic-related changes, great. Otherwise iterate per failing test.

- [ ] **Step 7: Run full suite**

Run: `npm test`
Expected: PASS, with the new Epic tests passing.

- [ ] **Step 8: Commit**

```bash
git add src/dungeon/loot.ts src/dungeon/__tests__/loot.test.ts
git commit -m "RARITY_TABLE: add Epic column (curve 0→10% peak at floor 15)"
```

---

## Task 3: affixCount + pickRareProperty gate widening

**Files:**
- Modify: `src/dungeon/loot.ts` (affixCount + three pickRareProperty gates at lines 155, 182, 224)
- Modify: `src/dungeon/__tests__/loot.test.ts` (Epic affix count + Epic rare-property tests)

- [ ] **Step 1: Write the failing tests**

Add to `src/dungeon/__tests__/loot.test.ts`:

```ts
describe('Epic items — affix count and rare-property', () => {
  it('epic non-hat items roll 3 affixes', () => {
    // Force Epic via rollEventItem with rarity='epic'
    const rng = createRng(12345);
    const item = rollEventItem(rng, 10, 'epic', 1);
    if (item.slot !== 'hat') {
      expect(item.affixes).toHaveLength(3);
    } else {
      expect(item.affixes).toHaveLength(4);
    }
  });

  it('epic hat items roll 4 affixes', () => {
    // Sample until we get a hat (rollEventItem picks slot uniformly)
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      const item = rollEventItem(rng, 10, 'epic', 1);
      if (item.slot === 'hat') {
        expect(item.affixes).toHaveLength(4);
        return;
      }
    }
    throw new Error('No epic hat rolled in 100 seeds — slot pick may be deterministic');
  });

  it('epic weapon/shield/outfit items have a rare-property', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      const item = rollEventItem(rng, 10, 'epic', 1);
      if (item.slot === 'weapon' || item.slot === 'shield' || item.slot === 'outfit') {
        expect(item.rareProperty, `seed ${seed}, slot ${item.slot}`).toBeDefined();
      }
    }
  });

  it('epic hat items have no rare-property (hats never get one)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      const item = rollEventItem(rng, 10, 'epic', 1);
      if (item.slot === 'hat') {
        expect(item.rareProperty).toBeUndefined();
        return;
      }
    }
    throw new Error('No epic hat rolled in 100 seeds');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/dungeon/__tests__/loot.test.ts -t "Epic items"`
Expected: FAIL — `affixCount` returns 2 (or 3 for hat) for Epic; rareProperty is undefined because the gate excludes Epic.

- [ ] **Step 3: Update affixCount**

Edit `src/dungeon/loot.ts` lines 95-99:

```ts
function affixCount(rarity: Rarity, slot: ItemSlot): number {
  if (rarity === 'common') return 0;
  if (rarity === 'uncommon') return 1;
  if (rarity === 'rare') return slot === 'hat' ? 3 : 2;
  return slot === 'hat' ? 4 : 3; // epic
}
```

- [ ] **Step 4: Widen the three pickRareProperty gates**

Edit `src/dungeon/loot.ts` line 155 (inside `rollEventItem`):

```ts
const rareProperty = (rarity === 'rare' || rarity === 'epic')
  ? pickRareProperty(rng, slot, floorNumber)
  : undefined;
```

Edit line 182 (inside `rollShopItem`):

```ts
const rareProperty = (rarity === 'rare' || rarity === 'epic')
  ? pickRareProperty(rng, slot, floor)
  : undefined;
```

Edit line 224 (inside `rollLoot`):

```ts
const rareProperty = (rarity === 'rare' || rarity === 'epic')
  ? pickRareProperty(rng, slot, floorNumber)
  : undefined;
```

(`pickRareProperty` already returns `undefined` for `slot === 'hat'`, so epic hats correctly stay without a rare-property.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/dungeon/__tests__/loot.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Run full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/dungeon/loot.ts src/dungeon/__tests__/loot.test.ts
git commit -m "loot: Epic affix count (3/4 hat) + rare-property gate"
```

---

## Task 4: Centralize rarity colors

**Files:**
- Create: `src/render/rarity_colors.ts`
- Modify: `src/scenes/equip_scene.ts` (remove local color records; import)
- Modify: `src/scenes/event_overlay_scene.ts` (remove local color record; import)

- [ ] **Step 1: Verify no existing rarity_colors module**

Run: `npx tsc --noEmit && ls src/render/rarity_colors* 2>&1`
Expected: tsc clean from prior tasks; `rarity_colors*` does not exist.

- [ ] **Step 2: Create `src/render/rarity_colors.ts`**

```ts
import type { Rarity } from '@data/types';

/**
 * Centralized rarity color palette. Single source of truth for both
 * Phaser hex strings (text/tint via `'#xxxxxx'`) and numeric forms
 * (stroke styles via `0xXXXXXX`). Extend here when adding a new rarity tier.
 */
export const RARITY_COLOR_HEX: Record<Rarity, string> = {
  common:   '#cccccc',
  uncommon: '#4488ff',
  rare:     '#ffcc66',
  epic:     '#a060ff',
};

export const RARITY_COLOR_NUM: Record<Rarity, number> = {
  common:   0xcccccc,
  uncommon: 0x4488ff,
  rare:     0xffcc66,
  epic:     0xa060ff,
};
```

- [ ] **Step 3: Update equip_scene.ts to import from the new module**

Edit `src/scenes/equip_scene.ts`. Remove the local `RARITY_COLOR_NUM` and `RARITY_COLOR_HEX` declarations (lines 56-66 from the pre-Task-1 view; may have shifted to ~lines 56-68 after Task 1 widened them).

Add at the top with the other imports:

```ts
import { RARITY_COLOR_HEX, RARITY_COLOR_NUM } from '@render/rarity_colors';
```

If the file also has an unused `Rarity` type import that was added in Task 1 specifically for the inline record's type signature, remove it (TypeScript will flag).

- [ ] **Step 4: Update event_overlay_scene.ts to import from the new module**

Edit `src/scenes/event_overlay_scene.ts`. Remove the local `RARITY_COLOR` declaration (around line 56). The existing call site uses `RARITY_COLOR[item.rarity]` (line 300). Rename usage:

```ts
// Before:
color: RARITY_COLOR[item.rarity],

// After:
color: RARITY_COLOR_HEX[item.rarity],
```

Add the import:

```ts
import { RARITY_COLOR_HEX } from '@render/rarity_colors';
```

Remove the now-unused `Rarity` import if present.

- [ ] **Step 5: Run tsc + tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. The change is mechanical — no behavioral difference.

- [ ] **Step 6: Commit**

```bash
git add src/render/rarity_colors.ts src/scenes/equip_scene.ts src/scenes/event_overlay_scene.ts
git commit -m "Centralize RARITY_COLOR_HEX/NUM → src/render/rarity_colors.ts"
```

---

## Task 5: Upgrade chain end-to-end + blacksmith UI cap check + integration tests

**Files:**
- Modify: `src/scenes/blacksmith_panel_scene.ts:684` (max-rarity indicator check)
- Modify: `src/items/__tests__/upgrade.test.ts` (rare→epic end-to-end tests)

- [ ] **Step 1: Write the failing tests**

Add to `src/items/__tests__/upgrade.test.ts`:

```ts
describe('upgradeItem — rare → epic', () => {
  function makeRareItem(slot: ItemSlot = 'weapon'): Item {
    return {
      id: 'r0',
      baseId: 'sword_basic',
      slot,
      rarity: 'rare',
      weaponType: slot === 'weapon' ? 'sword' : undefined as never,
      affixes: [
        { affixId: 'of_power', value: 5 },
        { affixId: 'of_insight', value: 5 },
      ],
      rareProperty: { propertyId: 'of_burning', value: 3 },
      floorRolledAt: 10,
    };
  }

  it('upgradeCost(rare item) returns 900', () => {
    const item = makeRareItem();
    expect(upgradeCost(item)).toBe(900);
  });

  it('canUpgrade(epic item) returns false', () => {
    const item: Item = { ...makeRareItem(), rarity: 'epic', affixes: [
      { affixId: 'of_power', value: 5 },
      { affixId: 'of_insight', value: 5 },
      { affixId: 'of_the_bear', value: 5 },
    ]};
    expect(canUpgrade(item)).toBe(false);
  });

  it('upgradeItem(rare) → epic with one new affix and preserved rare-property', () => {
    const rng = createRng(12345);
    const item = makeRareItem();
    const upgraded = upgradeItem(item, rng);
    expect(upgraded.rarity).toBe('epic');
    expect(upgraded.affixes).toHaveLength(3);
    expect(upgraded.rareProperty).toEqual(item.rareProperty);
    // New affix is one of the unused affix ids.
    const oldAffixIds = new Set(item.affixes.map((a) => a.affixId));
    const newAffix = upgraded.affixes.find((a) => !oldAffixIds.has(a.affixId));
    expect(newAffix).toBeDefined();
  });

  it('upgradeItem(rare-hat) → epic with one new affix, no rare-property', () => {
    const rng = createRng(12345);
    const item: Item = {
      ...makeRareItem('hat'),
      baseId: 'hat_cap',
      weaponType: undefined as never,
      affixes: [
        { affixId: 'of_power', value: 5 },
        { affixId: 'of_insight', value: 5 },
        { affixId: 'of_the_bear', value: 5 },  // rare hats have 3 affixes
      ],
      rareProperty: undefined,
    };
    const upgraded = upgradeItem(item, rng);
    expect(upgraded.rarity).toBe('epic');
    expect(upgraded.affixes).toHaveLength(4);
    expect(upgraded.rareProperty).toBeUndefined();
  });

  it('upgradeItem(epic) throws (epic is the cap)', () => {
    const rng = createRng(12345);
    const item: Item = { ...makeRareItem(), rarity: 'epic', affixes: [
      { affixId: 'of_power', value: 5 },
      { affixId: 'of_insight', value: 5 },
      { affixId: 'of_the_bear', value: 5 },
    ]};
    expect(() => upgradeItem(item, rng)).toThrow(/cannot upgrade/);
  });
});
```

NOTE: `upgradeItem` calls `rollNewAffix` which throws if no affixes remain. The codebase has 7 affix ids (`AffixId` union). Epic non-hat has 3 affixes; epic hat has 4. Both leave enough remaining when upgrading from rare, so `rollNewAffix` doesn't throw — verify by reading `src/items/upgrade.ts:63-72`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/items/__tests__/upgrade.test.ts -t "rare → epic"`
Expected: FAIL — the upgrade flow currently treats `rare` as terminal because `NEXT_RARITY.rare` was `null` before Task 1. After Task 1, `NEXT_RARITY.rare === 'epic'`, so `upgradeItem(rare)` would actually try to upgrade — but `upgradeItem` line 49 (`target === 'rare' && item.slot !== 'hat'`) condition is now `false` for `target === 'epic'`, meaning the new epic item gets `rareProperty: item.rareProperty` (preserves the existing one). That's the correct behavior per spec ("rare items already have a rareProperty; preserve on upgrade"). Test should now pass without further changes.

Likely actual failure: nothing in `upgradeItem` is broken by the type widening, but the existing tests may need to update some assertion expecting `null` from `nextRarity('rare')` now that it returns `'epic'`.

Run: `npx vitest run src/items/__tests__/upgrade.test.ts 2>&1 | tail -30`

Expected: any tests that previously asserted `nextRarity('rare') === null` need to be updated, OR they're now asserting against the new behavior. Reconcile each.

- [ ] **Step 3: Update blacksmith UI cap check**

Read `src/scenes/blacksmith_panel_scene.ts` around line 684. Find:

```ts
if (item.rarity === 'rare') {
  // ... probably shows "MAX RARITY" indicator or disables upgrade button
}
```

Replace with:

```ts
if (nextRarity(item.rarity) === null) {
  // shows MAX RARITY indicator for items that can't upgrade further
}
```

Add to the imports at the top:

```ts
import { nextRarity } from '@items/upgrade';
```

This future-proofs the indicator for when Spec 3 adds Legendary (then Epic stops being the cap; Legendary takes over). The indicator now derives from the upgrade graph instead of hardcoding a tier name.

If the exact line at 684 differs from this sketch, adapt the pattern: find any `=== 'rare'` check that's gating "can this be upgraded?" UI behavior and replace with `nextRarity(item.rarity) === null` or `canUpgrade(item) === false`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/items/__tests__/upgrade.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: End-to-end loot integration check**

Add to `src/dungeon/__tests__/loot.test.ts`:

```ts
describe('Epic — end-to-end integration', () => {
  it('rollLoot at floor 15 produces some Epic items in a large sample', () => {
    const rng = createRng(12345);
    let epic = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const item = rollLoot(rng, 15, 'treasure', 1);
      if (item?.rarity === 'epic') epic++;
    }
    // At floor 15, Epic weight is 10%. Expect ~100 in 1000.
    expect(epic).toBeGreaterThan(50);
    expect(epic).toBeLessThan(150);
  });

  it('rollShopItem at floor 12 (tier 2) produces some Epic items', () => {
    // floor 12 in tier 2 = effective floor 15, which is the cap row.
    const rng = createRng(12345);
    let epic = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const item = rollShopItem(rng, 'weapon', 12, 2);
      if (item.rarity === 'epic') epic++;
    }
    expect(epic).toBeGreaterThan(50);
  });

  it('Sunken Keep boss (floor 4, tier 2) occasionally drops Epic', () => {
    // floor 4 in tier 2 = effective floor 7. Epic weight ~2-3%. Boss uses
    // NEXT-floor weights (effectiveFloor + 1 = 8), Epic = 3%.
    const rng = createRng(12345);
    let epic = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) {
      const item = rollLoot(rng, 4, 'boss', 2);
      if (item?.rarity === 'epic') epic++;
    }
    const pct = (epic / N) * 100;
    expect(pct).toBeGreaterThan(1);
    expect(pct).toBeLessThan(6);
  });
});
```

- [ ] **Step 6: Run all tests**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/blacksmith_panel_scene.ts src/items/__tests__/upgrade.test.ts src/dungeon/__tests__/loot.test.ts
git commit -m "Epic tier: upgrade chain wired; blacksmith UI cap-check generalized"
```

---

## Wrap-up

After Task 5, run final verification:

```bash
npm test && npm run build && npx tsc --noEmit
```

Expected: all tests pass; production build clean; typecheck clean.

Verify spec out-of-scope items stayed out:
- No `'legendary'` references in code (only in spec/plan docs)
- No new affix-value scaling for Epic (Epic uses `rollAffixValue` unchanged)
- No boss-drop substitution or named items
- No shop pricing retune

Move TODO Cluster D · 8 entry to HISTORY.md following the slim template (Why / Decisions / Surprises / Source).

---

## Self-review notes

**Spec coverage check:**
- Rarity widening: Task 1 ✓
- RARITY_TABLE curve: Task 2 ✓
- affixCount Epic: Task 3 ✓
- pickRareProperty gate widening: Task 3 ✓
- Blacksmith cost: Task 1 ✓
- Sell value: Task 1 ✓
- Centralized rarity colors: Task 4 ✓
- Blacksmith UI cap check: Task 5 ✓
- No save migration: nothing to do (covered by silence)
- Test coverage for loot/upgrade/sell: Tasks 2/3/5 ✓
- Risk: missed `pickRareProperty` call sites — Task 3 lists all three explicitly (lines 155, 182, 224 in loot.ts)
- Risk: exhaustiveness gaps in switches — TypeScript catches; no specific task needed, surfaces naturally during `tsc --noEmit`
- Risk: shop pricing tuning — explicit non-goal; Task 5's integration test verifies shops do produce Epics, doesn't assert price sanity

**Type consistency check:**
- `NEXT_RARITY` extension uses the same `Record<Rarity, Exclude<Rarity, 'common'> | null>` shape pre/post Task 1
- `RARITY_TABLE` row shape consistent: `{ floor, common, uncommon, rare, epic }` everywhere it's referenced
- `RARITY_COLOR_HEX` / `RARITY_COLOR_NUM` names consistent across Tasks 1 and 4
- `rarityWeightsAt` return type widens consistently through `pluckWeights` and `pickRarity`

**No placeholders found in the plan.**
