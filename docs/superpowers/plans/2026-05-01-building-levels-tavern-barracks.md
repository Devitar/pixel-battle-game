# Building Levels (29a) — Common Infrastructure + Tavern + Barracks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 of Cluster B · 29 (decomposed). Add `BuildingLevels` save field + per-panel Upgrade button infrastructure. Wire up Tavern (3/4/5 candidates) and Barracks (12/16/20 roster slots). Blacksmith and Hospital level effects ship in 29b/29c.

**Architecture:** Four sequential tasks. (1) Save schema + tunables file (`building_levels.ts`) + normalizer default + fresh-save default. (2) `applyBuildingUpgrade` helper that consolidates the upgrade mutation in one place. (3) Tavern wire-up (count param + Upgrade button). (4) Barracks wire-up (capacity-derived slot grid + Upgrade button + L2/L3 layout decision).

**Tech Stack:** TypeScript, Vitest, Phaser 3.

**Spec:** `docs/superpowers/specs/2026-05-01-building-levels-tavern-barracks-design.md`. Read before starting — note especially §1 (decomposition framing), §5 (Roster.capacity mutate-vs-derive choice), and §7 (the slot-grid layout decision deferred to execution).

---

## Task 1: Save schema + tunables file

Lays the foundation: types, the central tunables file, the save normalizer default, and the fresh-save default. Tests pin the tunables shape.

**Files:**
- Modify: `src/save/save.ts`
- Modify: `src/save/boot.ts`
- Create: `src/camp/building_levels.ts`
- Modify: `src/save/__tests__/save.test.ts`
- Create: `src/camp/__tests__/building_levels.test.ts`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL 1330 tests pass. Note the count for the post-change comparison (target: ~1336+ depending on test granularity).

- [ ] **Step 1.2: Add `BuildingLevels` types and field to `SaveFile`**

Open `src/save/save.ts`. Find the `SaveFile` interface (around line 12). Add the new types just above it:

```ts
export type BuildingId = 'tavern' | 'barracks' | 'blacksmith' | 'hospital';
export type BuildingLevel = 1 | 2 | 3;
export type BuildingLevels = Record<BuildingId, BuildingLevel>;

export interface SaveFile {
  version: number;
  roster: Roster;
  vault: Vault;
  stash: Stash;
  unlocks: Unlocks;
  buildingLevels: BuildingLevels;
  runState?: RunState;
  runRngState?: number;
  preferences?: Preferences;
}
```

`buildingLevels` is **required** (not optional). The normalizer fills the default for old saves; fresh saves construct it explicitly (next step).

- [ ] **Step 1.3: Add `buildingLevels` default to `normalizeSaveFile`**

In the same file, find `normalizeSaveFile` (around line 101). Add the field default alongside the existing ones:

```ts
function normalizeSaveFile(file: SaveFile): SaveFile {
  return {
    ...file,
    stash: file.stash ?? createStash(),
    buildingLevels: file.buildingLevels ?? { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
    roster: {
      ...file.roster,
      heroes: file.roster.heroes.map(normalizeHero),
    },
    runState: file.runState === undefined
      ? undefined
      : { ...file.runState, lost: file.runState.lost ?? [] },
  };
}
```

- [ ] **Step 1.4: Update `createFreshSave` to include `buildingLevels`**

Open `src/save/boot.ts`. Find `createFreshSave` (around line 29). Add the field to the return object:

```ts
function createFreshSave(rng: Rng): SaveFile {
  const heroes = generateStarterRoster(rng);
  let roster = createRoster();
  for (const hero of heroes) {
    roster = addHero(roster, hero);
  }
  return {
    version: CURRENT_SCHEMA_VERSION,
    roster,
    vault: credit(createVault(), STARTER_GOLD),
    stash: createStash(),
    unlocks: createDefaultUnlocks(),
    buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
  };
}
```

Fresh saves must construct the field explicitly because they don't go through `normalizeSaveFile` (only `load()`'d saves do).

- [ ] **Step 1.5: Create the tunables file `src/camp/building_levels.ts`**

```ts
import type { BuildingId, BuildingLevel } from '@save/save';

export interface BuildingLevelDef {
  level: BuildingLevel;
  upgradeCost: number;          // gold cost to upgrade FROM the previous level (0 at L1)
  unlockDescription: string;    // shown in / near the Upgrade button
}

export const BUILDING_LEVELS: Record<BuildingId, readonly BuildingLevelDef[]> = {
  tavern: [
    { level: 1, upgradeCost: 0,   unlockDescription: '3 candidates per visit' },
    { level: 2, upgradeCost: 200, unlockDescription: '4 candidates per visit' },
    { level: 3, upgradeCost: 500, unlockDescription: '5 candidates per visit' },
  ],
  barracks: [
    { level: 1, upgradeCost: 0,   unlockDescription: '12 hero slots' },
    { level: 2, upgradeCost: 200, unlockDescription: '16 hero slots' },
    { level: 3, upgradeCost: 500, unlockDescription: '20 hero slots' },
  ],
  blacksmith: [
    { level: 1, upgradeCost: 0, unlockDescription: 'Common → Uncommon' },
    // L2 / L3 added when 29b lands.
  ],
  hospital: [
    { level: 1, upgradeCost: 0, unlockDescription: 'Treat one wound at a time' },
    // L2 / L3 added when 29c lands.
  ],
};

// Aligned with createRoster's DEFAULT_ROSTER_CAPACITY = 12 (BARRACKS_CAPACITY[1]).
// If either changes, align the other.
export const BARRACKS_CAPACITY: Record<BuildingLevel, number> = {
  1: 12,
  2: 16,
  3: 20,
};

export function nextLevel(building: BuildingId, current: BuildingLevel): BuildingLevelDef | null {
  const tiers = BUILDING_LEVELS[building];
  return tiers.find((t) => t.level === current + 1) ?? null;
}

export function tavernCandidateCount(level: BuildingLevel): number {
  return [3, 4, 5][level - 1];
}
```

- [ ] **Step 1.6: Create `src/camp/__tests__/building_levels.test.ts` with tunables coverage**

```ts
import { describe, expect, it } from 'vitest';
import {
  BUILDING_LEVELS,
  BARRACKS_CAPACITY,
  nextLevel,
  tavernCandidateCount,
} from '../building_levels';

describe('BUILDING_LEVELS shape', () => {
  it('all four building IDs have at least L1', () => {
    expect(BUILDING_LEVELS.tavern[0]?.level).toBe(1);
    expect(BUILDING_LEVELS.barracks[0]?.level).toBe(1);
    expect(BUILDING_LEVELS.blacksmith[0]?.level).toBe(1);
    expect(BUILDING_LEVELS.hospital[0]?.level).toBe(1);
  });

  it('L1 always has zero upgrade cost', () => {
    for (const tiers of Object.values(BUILDING_LEVELS)) {
      expect(tiers[0]?.upgradeCost).toBe(0);
    }
  });
});

describe('nextLevel', () => {
  it('Tavern L1 → L2 def with upgrade cost', () => {
    expect(nextLevel('tavern', 1)?.level).toBe(2);
    expect(nextLevel('tavern', 1)?.upgradeCost).toBe(200);
  });

  it('Tavern L2 → L3 def with upgrade cost', () => {
    expect(nextLevel('tavern', 2)?.level).toBe(3);
    expect(nextLevel('tavern', 2)?.upgradeCost).toBe(500);
  });

  it('Tavern L3 → null (max level)', () => {
    expect(nextLevel('tavern', 3)).toBeNull();
  });

  it('Barracks parallel: L1 → L2, L3 → null', () => {
    expect(nextLevel('barracks', 1)?.level).toBe(2);
    expect(nextLevel('barracks', 3)).toBeNull();
  });

  it('Blacksmith / Hospital L1 → null (only L1 defined this phase)', () => {
    expect(nextLevel('blacksmith', 1)).toBeNull();
    expect(nextLevel('hospital', 1)).toBeNull();
  });
});

describe('tavernCandidateCount', () => {
  it('L1 → 3, L2 → 4, L3 → 5', () => {
    expect(tavernCandidateCount(1)).toBe(3);
    expect(tavernCandidateCount(2)).toBe(4);
    expect(tavernCandidateCount(3)).toBe(5);
  });
});

describe('BARRACKS_CAPACITY', () => {
  it('covers all three levels with the gdd-specified counts', () => {
    expect(BARRACKS_CAPACITY[1]).toBe(12);
    expect(BARRACKS_CAPACITY[2]).toBe(16);
    expect(BARRACKS_CAPACITY[3]).toBe(20);
  });
});
```

- [ ] **Step 1.7: Add the normalizer-default test to `src/save/__tests__/save.test.ts`**

Open `src/save/__tests__/save.test.ts`. Find an existing `describe('load — …')` block (or create a new `describe('load — buildingLevels normalizer', …)`) and add:

```ts
it('fills in default buildingLevels for old saves missing the field', () => {
  const storage = makeStorage();
  // Construct an old-shape save without buildingLevels, written directly to storage.
  const oldShape = {
    version: 1,
    roster: createRoster(),
    vault: createVault(),
    stash: createStash(),
    unlocks: createDefaultUnlocks(),
    // no buildingLevels field
  };
  storage.setItem('pixel-battle-game/save', JSON.stringify(oldShape));
  const loaded = load(storage);
  expect(loaded?.buildingLevels).toEqual({
    tavern: 1, barracks: 1, blacksmith: 1, hospital: 1,
  });
});
```

The test references `makeStorage`, `createRoster`, `createVault`, `createStash`, `createDefaultUnlocks`, `load` — all already imported in `save.test.ts` per existing tests. If any are missing from the file's imports, add them at the top.

- [ ] **Step 1.8: Run tsc + tests + build**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: green / green (1330 + ~13 new = ~1343 tests; the count depends on how many `it()` blocks landed) / build succeeds.

If a save-related test other than the new one fails, it likely needs a `buildingLevels` field added to its `SaveFile` literal. Investigate by `git grep "version: 1," -- 'src/**/__tests__/'` to find inline SaveFile literals; add `buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 }` to each.

---

## Task 2: `applyBuildingUpgrade` helper + tests

Centralizes the upgrade mutation in one place. Spending gold + bumping the level + (for Barracks only) updating `roster.capacity` all live here.

**Files:**
- Create: `src/camp/building_upgrade.ts`
- Create: `src/camp/__tests__/building_upgrade.test.ts`

- [ ] **Step 2.1: Create `src/camp/building_upgrade.ts`**

```ts
import type { BuildingId, BuildingLevel, SaveFile } from '@save/save';
import { BARRACKS_CAPACITY, nextLevel } from './building_levels';
import { spend } from './vault';

export function applyBuildingUpgrade(state: SaveFile, building: BuildingId): SaveFile {
  const current = state.buildingLevels[building];
  const next = nextLevel(building, current);
  if (next === null) {
    throw new Error(`applyBuildingUpgrade: ${building} already at max level ${current}`);
  }
  // spend() throws if insufficient gold; affordability checks at the UI layer
  // are convenience-not-correctness, so we re-validate here.
  const newVault = spend(state.vault, next.upgradeCost);
  const newLevel = next.level as BuildingLevel;
  const newBuildingLevels = { ...state.buildingLevels, [building]: newLevel };
  // Barracks-specific side effect: roster capacity grows.
  const newRoster = building === 'barracks'
    ? { ...state.roster, capacity: BARRACKS_CAPACITY[newLevel] }
    : state.roster;
  return {
    ...state,
    vault: newVault,
    buildingLevels: newBuildingLevels,
    roster: newRoster,
  };
}
```

- [ ] **Step 2.2: Create `src/camp/__tests__/building_upgrade.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRoster } from '../roster';
import { createStash } from '../stash';
import { createVault, credit } from '../vault';
import { createDefaultUnlocks } from '@save/save';
import type { SaveFile } from '@save/save';
import { applyBuildingUpgrade } from '../building_upgrade';

function makeBaseState(gold = 1000): SaveFile {
  return {
    version: 1,
    roster: createRoster(),
    vault: credit(createVault(), gold),
    stash: createStash(),
    unlocks: createDefaultUnlocks(),
    buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
  };
}

describe('applyBuildingUpgrade', () => {
  it('Tavern L1 → L2: deducts 200g, bumps level, leaves roster capacity alone', () => {
    const before = makeBaseState();
    const after = applyBuildingUpgrade(before, 'tavern');
    expect(after.buildingLevels.tavern).toBe(2);
    expect(after.vault.gold).toBe(800);  // 1000 - 200
    expect(after.roster.capacity).toBe(12);  // unchanged
  });

  it('Barracks L1 → L2: deducts 200g, bumps level, AND grows roster capacity to 16', () => {
    const before = makeBaseState();
    const after = applyBuildingUpgrade(before, 'barracks');
    expect(after.buildingLevels.barracks).toBe(2);
    expect(after.vault.gold).toBe(800);
    expect(after.roster.capacity).toBe(16);
  });

  it('Barracks L2 → L3 deducts 500g and grows capacity to 20', () => {
    const at_l2: SaveFile = {
      ...makeBaseState(),
      buildingLevels: { tavern: 1, barracks: 2, blacksmith: 1, hospital: 1 },
      roster: { ...createRoster(), capacity: 16 },
    };
    const after = applyBuildingUpgrade(at_l2, 'barracks');
    expect(after.buildingLevels.barracks).toBe(3);
    expect(after.vault.gold).toBe(500);  // 1000 - 500
    expect(after.roster.capacity).toBe(20);
  });

  it('throws when attempting to upgrade past max', () => {
    const at_l3: SaveFile = {
      ...makeBaseState(),
      buildingLevels: { tavern: 3, barracks: 3, blacksmith: 1, hospital: 1 },
    };
    expect(() => applyBuildingUpgrade(at_l3, 'tavern')).toThrow(/already at max/);
    expect(() => applyBuildingUpgrade(at_l3, 'barracks')).toThrow(/already at max/);
  });

  it('throws when insufficient gold (via spend)', () => {
    const broke = makeBaseState(50);  // can't afford 200g upgrade
    expect(() => applyBuildingUpgrade(broke, 'tavern')).toThrow();
  });

  it('Blacksmith / Hospital L1 → null: throws', () => {
    const state = makeBaseState();
    expect(() => applyBuildingUpgrade(state, 'blacksmith')).toThrow(/already at max/);
    expect(() => applyBuildingUpgrade(state, 'hospital')).toThrow(/already at max/);
  });

  it('does not mutate input state', () => {
    const before = makeBaseState();
    const snapshot = JSON.stringify(before);
    applyBuildingUpgrade(before, 'tavern');
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
```

- [ ] **Step 2.3: Run tsc + tests**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -10`

Expected: green / green (count grows by 7 from this task = ~1350).

---

## Task 3: Tavern wire-up

Migrate Tavern to read its level from the save and add the Upgrade button. The `generateCandidates` function gets a `count` parameter; the panel reads `appState.get().buildingLevels.tavern` and derives the count.

**Files:**
- Modify: `src/camp/buildings/tavern.ts`
- Modify: `src/camp/buildings/__tests__/tavern.test.ts`
- Modify: `src/scenes/tavern_panel_scene.ts`

- [ ] **Step 3.1: Update `generateCandidates` to take a `count` parameter**

Open `src/camp/buildings/tavern.ts`. Two changes:

1. Drop the `TAVERN_CANDIDATE_COUNT = 3` export (line 10).
2. Add `count: number` to `generateCandidates` and use it in the loop:

```ts
export function generateCandidates(
  rng: Rng,
  unlockedClasses: readonly ClassId[],
  count: number,
): Hero[] {
  const candidates: Hero[] = [];
  for (let i = 0; i < count; i++) {
    candidates.push(generateCandidate(rng, unlockedClasses));
  }
  return candidates;
}
```

- [ ] **Step 3.2: Update existing tavern tests to pass the `count` argument**

Open `src/camp/buildings/__tests__/tavern.test.ts`. The existing tests reference `TAVERN_CANDIDATE_COUNT` and call `generateCandidates(createRng(...), TIER1_CLASSES)`. Update:

1. Drop `TAVERN_CANDIDATE_COUNT` from the import (line 13). Drop the existing `describe('HIRE_COST and TAVERN_CANDIDATE_COUNT', ...)` block — the constant no longer exists; `tavernCandidateCount` is tested in `building_levels.test.ts`.

2. Update each `generateCandidates(...)` call site to pass the count. Since the existing tests presumably exercise the L1 behavior, pass `3` explicitly:

   ```ts
   const list = generateCandidates(createRng(1), TIER1_CLASSES, 3);
   expect(list).toHaveLength(3);
   ```

   Apply this pattern to every call site in the file (3 sites per the earlier grep).

3. Drop the `TAVERN_CANDIDATE_COUNT` reference in `expect(list).toHaveLength(TAVERN_CANDIDATE_COUNT)` — replace with the literal `3` matching the count just passed.

- [ ] **Step 3.3: Update `tavern_panel_scene.ts` — read level + pass count + add Upgrade button**

Open `src/scenes/tavern_panel_scene.ts`. Three changes:

1. **Add the new imports** alongside the existing camp imports near the top:

```ts
import { tavernCandidateCount } from '@camp/building_levels';
import { applyBuildingUpgrade } from '@camp/building_upgrade';
```

2. **Update both `generateCandidates` call sites** (lines 48 and 143 per grep). For each:

```ts
// Old:
this.candidates = generateCandidates(this.rng, appState.get().unlocks.classes);

// New:
const tavernLevel = appState.get().buildingLevels.tavern;
this.candidates = generateCandidates(this.rng, appState.get().unlocks.classes, tavernCandidateCount(tavernLevel));
```

(In `create()` — line 48 — and in the reroll handler around line 143. Verify with `git grep -n "generateCandidates(this.rng" -- 'src/scenes/tavern_panel_scene.ts'`.)

3. **Add an Upgrade button** in `buildPanelChrome` or similar — the existing scene has a `buildRerollButton` method around line 50; add `buildUpgradeButton` after it as a parallel pattern. Position the button at the bottom of the panel near the close button. Sample shape (adapt to existing constants in the file):

```ts
private buildUpgradeButton(): void {
  const level = appState.get().buildingLevels.tavern as BuildingLevel;
  const next = nextLevel('tavern', level);
  if (next === null) return;  // already at max — no button rendered

  const gold = balance(appState.get().vault);
  const canAfford = gold >= next.upgradeCost;

  const x = 800;  // adjust to fit the panel layout (right side near reroll/close)
  const y = 470;  // bottom of panel
  const bgColor = canAfford ? 0x335533 : 0x333333;
  const strokeColor = canAfford ? 0x66aa66 : 0x555555;
  const labelColor = canAfford ? '#ffffff' : '#777777';

  const bg = this.add.rectangle(x, y, 160, 30, bgColor).setStrokeStyle(2, strokeColor);
  this.add.text(x, y - 6, `Upgrade — ${next.upgradeCost}g`, {
    fontFamily: 'monospace', fontSize: '12px', color: labelColor,
  }).setOrigin(0.5);
  this.add.text(x, y + 8, `→ ${next.unlockDescription}`, {
    fontFamily: 'monospace', fontSize: '10px', color: '#aaaaaa',
  }).setOrigin(0.5);

  if (canAfford) {
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      appState.update((s) => applyBuildingUpgrade(s, 'tavern'));
      this.scene.restart();  // simplest path; matches Barracks Retire pattern (Cluster B · 14)
    });
  }
}
```

Add `nextLevel` and `BuildingLevel` to the imports at the top:

```ts
import { nextLevel, tavernCandidateCount } from '@camp/building_levels';
import type { BuildingLevel } from '@save/save';
```

Call `this.buildUpgradeButton()` from `create()` after `this.buildRerollButton()`.

The exact `x`/`y` constants may need tweaking — verify by manual play that the Upgrade button doesn't overlap the reroll button or the close ×. If it does, shift up/right.

- [ ] **Step 3.4: Run tsc + tests + build**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: green / green / build succeeds. The Tavern existing tests should pass with the count-arg updates; the panel scene has no unit tests (Phaser convention).

---

## Task 4: Barracks wire-up

Migrate Barracks to use `roster.capacity` directly (instead of the hard-coded `ROSTER_CAP_DISPLAY`) and add the Upgrade button. Resolve the L2/L3 slot-grid layout decision.

**Files:**
- Modify: `src/scenes/barracks_panel_scene.ts`

- [ ] **Step 4.1: Replace `ROSTER_CAP_DISPLAY` with `roster.capacity` reads**

Open `src/scenes/barracks_panel_scene.ts`. Find `const ROSTER_CAP_DISPLAY = 12` (around line 42) and the loop that uses it (around line 129). Two changes:

1. Drop the `ROSTER_CAP_DISPLAY` constant.

2. In `buildListPane` (around line 129), derive the cap from the roster:

```ts
private buildListPane(heroes: readonly Hero[]): void {
  // ...existing setup...
  const cap = appState.get().roster.capacity;
  for (let i = 0; i < cap; i++) {
    // ...existing loop body...
  }
}
```

- [ ] **Step 4.2: Add the Upgrade button to the Barracks panel**

In the same file, add a `buildUpgradeButton` method following the same pattern as the Tavern one (Step 3.3 sample). Place it inside the panel chrome — likely top-right area or bottom-right area of the panel. Sample:

```ts
private buildUpgradeButton(): void {
  const level = appState.get().buildingLevels.barracks as BuildingLevel;
  const next = nextLevel('barracks', level);
  if (next === null) return;

  const gold = balance(appState.get().vault);
  const canAfford = gold >= next.upgradeCost;

  // Place at top-right of panel to avoid clashing with the detail-pane action row
  // (Equip Gear + Retire at y=430).
  const x = 850;
  const y = 70;
  const bgColor = canAfford ? 0x335533 : 0x333333;
  const strokeColor = canAfford ? 0x66aa66 : 0x555555;
  const labelColor = canAfford ? '#ffffff' : '#777777';

  const bg = this.add.rectangle(x, y, 160, 30, bgColor).setStrokeStyle(2, strokeColor);
  this.add.text(x, y - 6, `Upgrade — ${next.upgradeCost}g`, {
    fontFamily: 'monospace', fontSize: '12px', color: labelColor,
  }).setOrigin(0.5);
  this.add.text(x, y + 8, `→ ${next.unlockDescription}`, {
    fontFamily: 'monospace', fontSize: '10px', color: '#aaaaaa',
  }).setOrigin(0.5);

  if (canAfford) {
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      appState.update((s) => applyBuildingUpgrade(s, 'barracks'));
      this.scene.restart();
    });
  }
}
```

Add the imports at the top of the file:

```ts
import { nextLevel } from '@camp/building_levels';
import { applyBuildingUpgrade } from '@camp/building_upgrade';
import { balance } from '@camp/vault';
import type { BuildingLevel } from '@save/save';
```

Call `this.buildUpgradeButton()` from `create()` after the existing chrome builders.

The `(x=850, y=70)` placement assumes top-right corner of the 920-wide panel — verify it doesn't clash with the close button at `(933, 63)`. Adjust if needed (e.g., shift x to 800 or y to 95).

- [ ] **Step 4.3: Resolve the L2/L3 slot-grid layout (decision during execution)**

The list pane is 380×360 today, holding a 2-column × 6-row grid of 184×60 slots (total grid height 360). At L3 (10 rows), the grid wants 600 height — overflows the pane.

**First try: shrink slot height** from 60→36px (10 rows × 36 = 360, fits exactly). Quick edit:

1. Find the slot-rendering code in `buildSlot` / equivalent (uses `SLOT_BG_W` and `SLOT_BG_H` constants — currently `SLOT_BG_W = 184`, `SLOT_BG_H = 60`).
2. Change `SLOT_BG_H = 60` → `SLOT_BG_H = 36`. Also reduce the y-offset between rows (likely `SLOT_STRIDE = 60` or similar) → 36.
3. Verify the slot text + HeroCard still fit at 36px height. The HeroCard "small" variant is currently 180×60 (per Cluster B · 11 HISTORY); shrinking the slot below the card height breaks the layout.

**If shrinking breaks the HeroCard fit:** fall back to **option (ii) — grow the pane vertically.** The list pane (`LIST_PANE_H = 360`) grows to ~600 at L3. The detail pane shifts/shrinks accordingly. This is a panel-wide layout rework — bigger scope.

**If neither (i) nor (ii) is clean:** fall back to **option (iii) — scroll the list.** Wrap the list contents in a Phaser scroll container; only the visible portion renders. New UX surface.

Try (i) first; revert and try (ii) if HeroCard breaks; revert and try (iii) only if (ii) creates worse problems. Document the chosen path in a comment near the slot constants.

- [ ] **Step 4.4: Run tsc + tests + build**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: green / green (no test count change in this task — Barracks panel has no unit tests) / build succeeds.

- [ ] **Step 4.5: Commit (single commit for all four tasks)**

```bash
git add src/save/save.ts src/save/boot.ts \
        src/save/__tests__/save.test.ts \
        src/camp/building_levels.ts src/camp/building_upgrade.ts \
        src/camp/__tests__/building_levels.test.ts src/camp/__tests__/building_upgrade.test.ts \
        src/camp/buildings/tavern.ts src/camp/buildings/__tests__/tavern.test.ts \
        src/scenes/tavern_panel_scene.ts src/scenes/barracks_panel_scene.ts
git status
git commit -m "feat(camp): building level upgrades — Tavern + Barracks (29a)

Adds BuildingLevels save field with normalizer default and fresh-save
default. New tunables file (camp/building_levels.ts) holds per-building
level data, costs, and the BARRACKS_CAPACITY table. New helper
applyBuildingUpgrade centralizes the spend + bump + Barracks-roster-cap
mutation.

Tavern panel: 3/4/5 candidates per visit at L1/L2/L3 + Upgrade button.
Barracks panel: 12/16/20 roster slots + Upgrade button + slot-grid
layout adjusted for L3.

Blacksmith and Hospital level effects deferred to 29b/29c (their
buildingLevels fields exist + default to 1; no upgrade buttons shown
because their tier arrays only define L1)."
```

(Per CLAUDE.md, commits land at user direction — leave this step gated until the user explicitly asks to commit.)

---

## Closing checklist

- [ ] **Four tasks landed in 1 commit** with green tsc + tests + build.
- [ ] **Test count delta:** roughly +12 to +14 (5 BUILDING_LEVELS / nextLevel / tavernCandidateCount / BARRACKS_CAPACITY tests; 7 applyBuildingUpgrade tests; 1 normalizer test; minus any that consolidated). Record actual count.
- [ ] **No `phaser` imports outside scene/UI/render layers** — `building_levels.ts` and `building_upgrade.ts` are pure TS.
- [ ] **Slot-grid layout decision documented** in a comment near the slot constants in `barracks_panel_scene.ts`, naming which of (i)/(ii)/(iii) was chosen and why.
- [ ] **Manual play verification:**
  - Open Tavern at L1: 3 candidates render. Click Upgrade — gold deducted (1000 → 800 if testing with starter gold tweaked to 1000), panel restarts, now showing 4 candidates and Upgrade now reads `500g`.
  - At L2: click Upgrade — 5 candidates show. Upgrade button hides at L3.
  - Reroll at L2/L3 produces 4/5 fresh candidates.
  - Open Barracks at L1: 12 slots render in the existing layout. Click Upgrade — gold deducted, panel restarts, 16 slots visible.
  - At L2 → L3: 20 slots visible. Verify the grid is readable (per the layout decision in Step 4.3).
  - Reload page mid-game — building levels persist via the save state.
  - Old save (manually edit localStorage to remove `buildingLevels`) — game loads, normalizer fills in defaults to all-1.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster B · 29 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source). Note in the entry that this is **29a** of a three-phase decomposition; 29b (Blacksmith) and 29c (Hospital) follow.
- [ ] **TODO.md update** — mark Cluster B · 29 as the 29a half shipped; create new entries for 29b (Blacksmith level gating) and 29c (Hospital level effects, "needs design") following the standard TODO format. Use new numbers (32, 33) per the no-renumber rule.
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commit, awaiting user direction per CLAUDE.md.
