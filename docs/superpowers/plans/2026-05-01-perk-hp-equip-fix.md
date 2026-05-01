# Perk-HP Equip-Path Bug Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a shared `recomputeMaxHp(hero: Hero): Hero` helper to `src/heroes/hero.ts`, fix the silent perk-HP loss in both equip paths (`equip_run.ts`, `equip_camp.ts`) by routing through the shared helper, and pin the fix with one unit test + two integration tests.

**Architecture:** TDD-style single task. Add helper first (with failing unit test), then refactor each equip path to use it (each refactor preceded by an integration test that exposes the bug). The shared helper looks up the hero's perk via `hero.perkId` and threads it into `computeMaxHp` — fixing the bug while collapsing the duplication that Cluster B · 12 HISTORY explicitly named as future work.

**Tech Stack:** TypeScript, Vitest. Pure-TS data layer; tests run in Vitest as usual.

**Spec:** `docs/superpowers/specs/2026-05-01-perk-hp-equip-fix-design.md`. Read before starting.

---

## Task 1: Extract `recomputeMaxHp`, fix both equip paths

Single task with TDD ordering — each behavior change is preceded by a failing test that exposes the regression we're closing.

**Files:**
- Modify: `src/heroes/hero.ts` (add `recomputeMaxHp` export)
- Modify: `src/heroes/__tests__/hero.test.ts` (add unit test)
- Modify: `src/items/equip_camp.ts` (delete local helper, use shared)
- Modify: `src/items/__tests__/equip_camp.test.ts` (add integration test)
- Modify: `src/run/equip_run.ts` (replace inline blocks, use shared)
- Modify: `src/run/__tests__/equip_run.test.ts` (add integration test)

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL 1321 tests pass. Note the count for the post-change comparison (target: 1324, +3).

- [ ] **Step 1.2: Add the failing unit test for `recomputeMaxHp`**

Open `src/heroes/__tests__/hero.test.ts`. Find the existing `describe('computeMaxHp — perk HP effect', ...)` block (around line 144). Add a new describe block immediately after:

```ts
describe('recomputeMaxHp', () => {
  it('preserves perk HP effect when recomputing', () => {
    const knight = createHero('knight', 'K', 'h0', 'stout', 'body1');
    const withPerk = applyPerk(knight, 'resolute');
    expect(withPerk.maxHp).toBe(24);  // 20 → 22 (Stout +10%) → 24 (Resolute +10%)
    const recomputed = recomputeMaxHp(withPerk);
    expect(recomputed.maxHp).toBe(24);  // bug: would be 22 if perk dropped
  });
});
```

Update the import on line 5 to add `recomputeMaxHp`:

```ts
import { applyPerk, computeMaxHp, createHero, recomputeMaxHp, type Hero } from '../hero';
```

- [ ] **Step 1.3: Verify the test fails**

Run: `npx vitest run src/heroes/__tests__/hero.test.ts -t "recomputeMaxHp"`

Expected: FAIL with `recomputeMaxHp is not a function` (or "is not exported"). Confirms the test is wired up correctly and the function doesn't yet exist.

- [ ] **Step 1.4: Add the `recomputeMaxHp` helper to `src/heroes/hero.ts`**

Open `src/heroes/hero.ts`. After the `computeMaxHp` function (around line 65, after the closing brace), add:

```ts
export function recomputeMaxHp(hero: Hero): Hero {
  const classDef = CLASSES[hero.classId];
  const trait = TRAITS[hero.traitId];
  const perk = hero.perkId ? PERKS[hero.perkId] : undefined;
  const newMaxHp = computeMaxHp(classDef.baseStats.hp, trait, hero.equipment, perk);
  return {
    ...hero,
    maxHp: newMaxHp,
    currentHp: Math.min(hero.currentHp, newMaxHp),
  };
}
```

No new imports needed — `CLASSES`, `TRAITS`, `PERKS` are already imported (lines 1–4).

- [ ] **Step 1.5: Verify the unit test passes**

Run: `npx vitest run src/heroes/__tests__/hero.test.ts -t "recomputeMaxHp"`

Expected: PASS. The helper exists and correctly preserves the perk HP effect.

- [ ] **Step 1.6: Add the failing integration test in `equip_camp.test.ts`**

Open `src/items/__tests__/equip_camp.test.ts`. Add `applyPerk` to the existing `createHero` import on line 5:

```ts
import { applyPerk, createHero } from '../../heroes/hero';
```

Add the test inside the existing `describe('equipFromStash', ...)` block (around line 37+), as a new `it(...)` immediately after the existing tests in that block:

```ts
it('preserves perk HP effect across equip-from-stash round-trip', () => {
  const stoutKnight = applyPerk(
    createHero('knight', 'K', 'h0', 'stout', 'body1'),
    'resolute',
  );
  expect(stoutKnight.maxHp).toBe(24);  // sanity: 20 → 22 (Stout) → 24 (Resolute)

  const roster = addHero(createRoster(), stoutKnight);
  const newOutfit = makeOutfitItem('o_test');
  const stash = addItems(createStash(), [newOutfit]);

  // Equip a +6 HP outfit → maxHp should be 24 + 6 = 30
  // (bug: local helper drops perk → 22 + 6 = 28)
  const equipped = equipFromStash(roster, stash, stoutKnight.id, 'o_test', 'outfit');
  const equippedHero = equipped.roster.heroes[0];
  expect(equippedHero.maxHp).toBe(30);

  // Unequip → maxHp should return to 24 (bug: would be 22)
  const restored = unequipToStash(equipped.roster, equipped.stash, stoutKnight.id, 'outfit');
  const restoredHero = restored.roster.heroes[0];
  expect(restoredHero.maxHp).toBe(24);
});
```

- [ ] **Step 1.7: Verify the integration test fails**

Run: `npx vitest run src/items/__tests__/equip_camp.test.ts -t "perk HP effect"`

Expected: FAIL with `expected 28 to be 30` (or similar). Confirms the local helper's perk-drop bug is exposed.

- [ ] **Step 1.8: Update `equip_camp.ts` to use the shared helper**

Open `src/items/equip_camp.ts`. Replace the entire file with:

```ts
import type { ItemSlot } from '../data/types';
import { recomputeMaxHp, type Hero } from '../heroes/hero';
import { type Roster, updateHero } from '../camp/roster';
import { addItems, removeItem, type Stash } from '../camp/stash';
import { equip, unequip } from './equip';

export function equipFromStash(
  roster: Roster,
  stash: Stash,
  heroId: string,
  itemId: string,
  slot: ItemSlot,
): { roster: Roster; stash: Stash } {
  const hero = roster.heroes.find((h) => h.id === heroId);
  if (!hero) throw new Error(`equipFromStash: heroId '${heroId}' not in roster`);
  const stashItem = stash.items.find((i) => i.id === itemId);
  if (!stashItem) throw new Error(`equipFromStash: itemId '${itemId}' not in stash`);
  if (stashItem.slot !== slot) {
    throw new Error(
      `equipFromStash: item.slot '${stashItem.slot}' does not match target '${slot}'`,
    );
  }

  const { hero: nextHero, displaced } = equip(hero, stashItem, slot);
  const clampedHero = recomputeMaxHp(nextHero);

  let nextStash = removeItem(stash, itemId);
  if (displaced !== undefined) nextStash = addItems(nextStash, [displaced]);

  return { roster: updateHero(roster, clampedHero), stash: nextStash };
}

export function unequipToStash(
  roster: Roster,
  stash: Stash,
  heroId: string,
  slot: ItemSlot,
): { roster: Roster; stash: Stash } {
  if (slot === 'weapon') {
    throw new Error('unequipToStash: cannot unequip the weapon slot');
  }
  const hero = roster.heroes.find((h) => h.id === heroId);
  if (!hero) throw new Error(`unequipToStash: heroId '${heroId}' not in roster`);

  const { hero: nextHero, item } = unequip(hero, slot);
  if (item === undefined) return { roster, stash };

  const clampedHero = recomputeMaxHp(nextHero);
  return {
    roster: updateHero(roster, clampedHero),
    stash: addItems(stash, [item]),
  };
}
```

Changes from current file:
- Dropped `import { CLASSES } from '../data/classes';` (line 1)
- Dropped `import { TRAITS } from '../data/traits';` (line 2)
- Changed `import { computeMaxHp, type Hero } from '../heroes/hero';` to `import { recomputeMaxHp, type Hero } from '../heroes/hero';` (line 4)
- Deleted the local `recomputeMaxHp` function (lines 57–66)
- Call sites at lines 27 and 50 unchanged (same name, same signature)

- [ ] **Step 1.9: Verify the equip_camp integration test now passes**

Run: `npx vitest run src/items/__tests__/equip_camp.test.ts`

Expected: PASS — including the new perk test and all existing tests in the file.

- [ ] **Step 1.10: Add the failing integration test in `equip_run.test.ts`**

Open `src/run/__tests__/equip_run.test.ts`. Update the imports — add `applyPerk` to the `createHero` import (line 3), add `unequipToPack` to the `equipFromPack` import (line 7):

```ts
import { applyPerk, createHero } from '../../heroes/hero';
// ... existing imports unchanged ...
import { equipFromPack, unequipToPack } from '../equip_run';
```

Add the test inside the existing `describe('equipFromPack — happy paths', ...)` block (around line 31), as a new `it(...)` after the existing tests in that block:

```ts
it('preserves perk HP effect across equip-from-pack round-trip', () => {
  const stoutKnight = applyPerk(
    createHero('knight', 'K', 'h0', 'stout', '0'),
    'resolute',
  );
  expect(stoutKnight.maxHp).toBe(24);  // sanity: 20 → 22 (Stout) → 24 (Resolute)

  const archer = createHero('archer', 'A', 'h1', 'quick', '0');
  const priest = createHero('priest', 'P', 'h2', 'quick', '0');
  const party = [stoutKnight, archer, priest];
  const rs = startRun('crypt', party, 1, createRng(1));
  const newOutfit = outfit('o_test');
  const rsWithItem = { ...rs, pack: addItem(createPack(), newOutfit) };

  // Equip a +6 HP outfit → maxHp should be 24 + 6 = 30
  // (bug: inline computeMaxHp drops perk → 22 + 6 = 28)
  const equipped = equipFromPack(rsWithItem, 0, 'o_test', 'outfit');
  expect(equipped.party[0].maxHp).toBe(30);

  // Unequip → maxHp should return to 24 (bug: would be 22)
  const restored = unequipToPack(equipped, 0, 'outfit');
  expect(restored.party[0].maxHp).toBe(24);
});
```

- [ ] **Step 1.11: Verify the integration test fails**

Run: `npx vitest run src/run/__tests__/equip_run.test.ts -t "perk HP effect"`

Expected: FAIL with `expected 28 to be 30` (or similar). Confirms the inline computeMaxHp's perk-drop bug is exposed.

- [ ] **Step 1.12: Update `equip_run.ts` to use the shared helper**

Open `src/run/equip_run.ts`. Replace the entire file with:

```ts
import type { ItemSlot } from '../data/types';
import { recomputeMaxHp } from '../heroes/hero';
import { equip, unequip } from '../items/equip';
import { addItem, removeItem } from './pack';
import type { RunState } from './run_state';

export function equipFromPack(
  runState: RunState,
  heroIndex: number,
  packItemId: string,
  slot: ItemSlot,
): RunState {
  if (heroIndex < 0 || heroIndex >= runState.party.length) {
    throw new Error(
      `equipFromPack: heroIndex ${heroIndex} out of bounds (party size ${runState.party.length})`,
    );
  }
  const hero = runState.party[heroIndex];
  const packItem = runState.pack.items.find((i) => i.id === packItemId);
  if (!packItem) {
    throw new Error(`equipFromPack: item id '${packItemId}' not in pack`);
  }
  if (packItem.slot !== slot) {
    throw new Error(
      `equipFromPack: item.slot '${packItem.slot}' does not match target slot '${slot}'`,
    );
  }

  const { hero: nextHero, displaced } = equip(hero, packItem, slot);
  const clampedHero = recomputeMaxHp(nextHero);

  let nextPack = removeItem(runState.pack, packItemId);
  if (displaced !== undefined) nextPack = addItem(nextPack, displaced);

  const nextParty = [...runState.party];
  nextParty[heroIndex] = clampedHero;
  return { ...runState, party: nextParty, pack: nextPack };
}

export function unequipToPack(
  runState: RunState,
  heroIndex: number,
  slot: ItemSlot,
): RunState {
  if (slot === 'weapon') {
    throw new Error('unequipToPack: cannot unequip the weapon slot — every hero must have a weapon');
  }
  if (heroIndex < 0 || heroIndex >= runState.party.length) {
    throw new Error(
      `unequipToPack: heroIndex ${heroIndex} out of bounds (party size ${runState.party.length})`,
    );
  }
  const hero = runState.party[heroIndex];
  const { hero: nextHero, item } = unequip(hero, slot);
  if (item === undefined) return runState;

  const clampedHero = recomputeMaxHp(nextHero);
  const nextPack = addItem(runState.pack, item);
  const nextParty = [...runState.party];
  nextParty[heroIndex] = clampedHero;
  return { ...runState, party: nextParty, pack: nextPack };
}
```

Changes from current file:
- Dropped `import { CLASSES } from '../data/classes';` (line 1)
- Dropped `import { TRAITS } from '../data/traits';` (line 2)
- Changed `import { computeMaxHp } from '../heroes/hero';` to `import { recomputeMaxHp } from '../heroes/hero';` (line 4)
- Replaced inline `computeMaxHp + clampedHero` blocks (lines 32–39 in `equipFromPack`, lines 66–73 in `unequipToPack`) with a single `recomputeMaxHp(nextHero)` call each

- [ ] **Step 1.13: Verify the equip_run integration test now passes**

Run: `npx vitest run src/run/__tests__/equip_run.test.ts`

Expected: PASS — including the new perk test and all existing tests in the file.

- [ ] **Step 1.14: Run the full test suite + tsc + build**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: green / green (1324 tests, +3 from baseline) / build succeeds.

- [ ] **Step 1.15: Commit**

```bash
git add src/heroes/hero.ts src/heroes/__tests__/hero.test.ts src/items/equip_camp.ts src/items/__tests__/equip_camp.test.ts src/run/equip_run.ts src/run/__tests__/equip_run.test.ts
git commit -m "fix(heroes): preserve perk HP effect across equip/unequip

Extract shared recomputeMaxHp helper that threads the hero's perk
into computeMaxHp, fixing silent maxHp drift in equip_run and
equip_camp paths."
```

(Per CLAUDE.md, commits land at user direction — leave this step gated until the user explicitly asks to commit.)

---

## Closing checklist

- [ ] **Single task landed in 1 commit** with green tests + tsc + build.
- [ ] **`computeMaxHp` itself untouched** — only callers changed.
- [ ] **`applyPerk` untouched** — its currentHp scale-up behavior at level-up stays distinct from `recomputeMaxHp`'s clamp-only behavior.
- [ ] **No `phaser` imports anywhere new** — all touched files are pure TS.
- [ ] **Test count delta:** +3 (1321 → 1324). One unit test in `hero.test.ts`, two integration tests (one in `equip_camp.test.ts`, one in `equip_run.test.ts`).
- [ ] **Manual play verification (optional, low value):** Resolute knight in a fresh save, equip-from-stash a +HP shield, verify maxHp goes UP by the shield's bonus (not down by `perk - shield`). Same check via mid-run pack equip.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster B · 25 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commit, awaiting user direction per CLAUDE.md.
