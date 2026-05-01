# Perk-HP equip-path bug fix — Design

- **TODO entry:** Cluster B · 25 (Fix perk-HP bug in equip paths).
- **Tier:** 2 (hygiene on shipped code).
- **Date:** 2026-05-01.

## 1 · Scope

Extract a shared `recomputeMaxHp(hero: Hero): Hero` helper to `src/heroes/hero.ts` alongside `computeMaxHp`. The helper looks up the hero's perk via `hero.perkId` and threads it into `computeMaxHp`, fixing the silent perk-HP loss on equip/unequip. Both equip paths (`src/run/equip_run.ts`, `src/items/equip_camp.ts`) consume the new helper, replacing their inline / locally-duplicated `recomputeMaxHp` blocks.

**Out of scope:**

- Adding new HP perks. The current set (`resolute` Knight +10% HP, `steadfast` Priest +10% HP) is the data shape the fix targets; new perks land via their own task.
- Changing `applyPerk`'s currentHp-scaling behavior. That's a one-time level-up event; recomputeMaxHp can run repeatedly (every equip swap) and would compound if it scaled.
- Touching `computeMaxHp` itself. The optional `perk` parameter has been correct since perks shipped — only the callers were buggy.
- Save schema migration. No serialized fields change.
- Centralizing the `recomputeMaxHp` pattern further (e.g., wrapping `equip` / `unequip` to always call it). Out of scope; would change the call surface that mid-task hotfixes can rely on.

## 2 · The bug

`computeMaxHp(classBaseHp, trait, equipment, perk?)` accepts an optional `perk` and applies its `hpEffect` when present. Both equip paths call `computeMaxHp` **without** the perk parameter:

- `src/run/equip_run.ts:32-34` (in `equipFromPack`) and `:66-68` (in `unequipToPack`) — inlined.
- `src/items/equip_camp.ts:60` (in the local `recomputeMaxHp` helper) — extracted but still missing the perk.

Concrete repro: Stout (trait, +10% HP) + Resolute (perk, +10% HP) Knight has `maxHp = 24` (20 → 22 from Stout → 24 from Resolute). Equip a +5 HP shield → buggy recompute drops the Resolute bonus, sets `maxHp` to **27** (= 22 + 5) instead of the correct **29** (= 24 + 5). Hero silently loses 2 max HP. Unequipping replays the bug in reverse.

Today this affects Knights with Resolute and Priests with Steadfast — and any future HP perk would inherit the same bug.

## 3 · New helper

Add to `src/heroes/hero.ts` immediately after `computeMaxHp` (around line 65):

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

**No new imports needed.** `hero.ts` already imports `BASE_ITEMS`, `CLASSES`, `PERKS`, `TRAITS` (lines 1–4).

**Behavior preserved from the current local helpers:**

- `currentHp` clamps DOWN to new maxHp (e.g., unequipping a +HP item from a hero at full HP).
- `currentHp` does NOT scale up. Equipping an HP item never auto-heals — equipment changes affect headroom, not current health.

This is a deliberate divergence from `applyPerk`'s scale-up behavior, because `applyPerk` runs once at level-up while `recomputeMaxHp` can run repeatedly (every equip swap) — proportional scaling would compound and silently inflate currentHp on each equip touch.

## 4 · `equip_camp.ts` change

Three steps:

1. Replace the local `recomputeMaxHp` function (lines 57–66) with an import.
2. Update the import line to drop `computeMaxHp` and add `recomputeMaxHp`:

   ```ts
   import { recomputeMaxHp, type Hero } from '../heroes/hero';
   ```

3. Drop the now-unused `CLASSES` and `TRAITS` imports (lines 1–2). The call sites at lines 27 and 50 keep working — same name, same signature.

The file shrinks by ~10 lines; behavior at the call sites is identical except the perk is now correctly passed.

## 5 · `equip_run.ts` change

Two steps:

1. Replace the inline `computeMaxHp` + `clampedHero` blocks in both `equipFromPack` (lines 32–39) and `unequipToPack` (lines 66–73) with one line each:

   ```ts
   const clampedHero = recomputeMaxHp(nextHero);
   ```

2. Update the import line to swap `computeMaxHp` for `recomputeMaxHp`, drop the now-unused `CLASSES` and `TRAITS` imports (lines 1–2):

   ```ts
   import { recomputeMaxHp } from '../heroes/hero';
   ```

The file shrinks by ~12 lines per call site (24 lines total); behavior at the call sites is identical except the perk is now correctly passed.

## 6 · Tests

Three new tests, two shapes.

### 6a · Unit test on the helper

`src/heroes/__tests__/hero.test.ts`, alongside the existing `computeMaxHp` perk test (line 144 area):

```ts
describe('recomputeMaxHp', () => {
  it('preserves perk HP effect when recomputing', () => {
    const knight = createHero('knight', 'K', 'h0', 'stout', 'body1');
    const withPerk = applyPerk(knight, 'resolute');
    expect(withPerk.maxHp).toBe(24);  // 20 → 22 (Stout) → 24 (Resolute)
    const recomputed = recomputeMaxHp(withPerk);
    expect(recomputed.maxHp).toBe(24);  // bug: would be 22 without the perk fix
  });
});
```

The currentHp-clamp behavior is preserved-as-was from the existing local helpers and is exercised by the integration tests below; not worth a separate unit test.

### 6b · Integration test in `src/run/__tests__/equip_run.test.ts`

Stout+Resolute knight, equip a +HP shield via `equipFromPack`, verify `maxHp` matches the correct post-equip value (NOT the bug's reduced value). Then unequip via `unequipToPack`, verify `maxHp` returns to the perk-inclusive baseline.

Test sketch (concrete shield-HP value depends on what's available in `BASE_ITEM_STATS` — likely the existing `shield_basic` or similar already used in equip_run tests; the spec doesn't pin a specific item, the implementer picks one with non-zero `hp`):

```ts
it('preserves perk HP effect across equip-from-pack round-trip', () => {
  // Build a Stout knight, apply Resolute perk → maxHp = 24
  // Construct a runState with this hero in party slot 0 and a +HP shield in pack
  // const initialMaxHp = state.party[0].maxHp;  // 24
  // const equipped = equipFromPack(state, 0, shieldItemId, 'shield');
  // expect(equipped.party[0].maxHp).toBe(initialMaxHp + shieldHp);
  // const restored = unequipToPack(equipped, 0, 'shield');
  // expect(restored.party[0].maxHp).toBe(initialMaxHp);
});
```

The implementer fills in the runState construction following the existing equip_run tests' patterns.

### 6c · Integration test in `src/items/__tests__/equip_camp.test.ts`

Same shape using `equipFromStash` / `unequipToStash` against a `Roster` + `Stash`. Reuse the test-helpers already in that file.

## 7 · Files touched

| File | Change |
|---|---|
| `src/heroes/hero.ts` | Add `recomputeMaxHp(hero: Hero): Hero` exported function after `computeMaxHp`. No new imports. |
| `src/heroes/__tests__/hero.test.ts` | Add one `describe('recomputeMaxHp', ...)` block with the perk-preservation test. |
| `src/items/equip_camp.ts` | Delete local `recomputeMaxHp` (lines 57–66). Update import to use the shared helper. Drop unused `CLASSES`, `TRAITS` imports. Call sites unchanged. |
| `src/items/__tests__/equip_camp.test.ts` | Add integration test: Resolute knight equip/unequip round-trip preserves perk HP. |
| `src/run/equip_run.ts` | Replace inline `computeMaxHp + clampedHero` blocks (2 sites) with `recomputeMaxHp(nextHero)` calls. Update import. Drop unused `CLASSES`, `TRAITS` imports. |
| `src/run/__tests__/equip_run.test.ts` | Add integration test: Resolute knight equip/unequip round-trip preserves perk HP. |

No other files touched. No save schema change. No data-layer change.

## 8 · Test plan

- `npx tsc --noEmit` green.
- `npm test` green (existing 1321 + 3 new = 1324).
- `npm run build` succeeds.

**Manual play verification (optional):** Create a Resolute knight in a fresh save, verify Barracks shows the perk's +HP bonus. Equip-from-stash a +HP shield, verify maxHp increases by the shield's bonus (not by `shield_bonus - perk_bonus`). Unequip, verify maxHp returns to the perk-inclusive value.

## 9 · Risk

Low. Pure additive helper + straight import-and-call swap in two call sites. The bug-fix portion is one parameter pass; the rest is deduplication that Cluster B · 12 HISTORY explicitly named as reasonable future work. Three new tests pin the fix and the helper's contract.

## 10 · Open questions

None at design time.
