# Lost-vs-Fallen save serialization — Design

- **TODO entry:** Cluster A · 15 (narrowed scope — `loseHero` op + `RunState.lost` shipped in Cluster A · 13; Lost-bearing event cards shipped in Cluster A · 14).
- **Tier:** 2.
- **Date:** 2026-04-29.

## 1 · Scope

Distinguish narratively-Lost heroes from combat-Fallen heroes in the run-outcome shapes. Adjusts two interfaces (`CashoutOutcome`, `WipeOutcome`), four call sites in `run_state.ts`, two scene consumers (`dungeon_scene.ts`, `camp_screen_scene.ts`).

The existing `heroesLost` field on both outcome types currently holds **fallen** heroes (combat deaths) — a misnomer that became actively misleading once `RunState.lost` shipped in Task 13. This task fixes the naming and adds a parallel field for the actually-Lost set.

**Out of scope:**

- Visual distinction between Lost and Fallen in cashout / wipe panels — Cluster B · 11.
- Save-schema change. `RunState.lost` already exists from Task 13 with normalizer default; outcome shapes are transient (not persisted).

## 2 · Interface changes

`src/run/run_state.ts`:

```ts
export interface CashoutOutcome {
  goldBanked: number;
  itemsBanked: readonly Item[];
  heroesReturned: readonly Hero[];
  heroesFallen: readonly Hero[];   // RENAMED from heroesLost; semantic: died in combat this run
  heroesLost: readonly Hero[];     // NEW; semantic: narratively Lost via event/hazard during this run
}

export interface WipeOutcome {
  packLost: Pack;
  heroesFallen: readonly Hero[];   // RENAMED from heroesLost; semantic: died in combat
  heroesLost: readonly Hero[];     // NEW; semantic: narratively Lost prior to the wipe
}
```

## 3 · Populating sites

### 3.1 · `cashout` (around line 295 of `run_state.ts`)

```ts
const outcome: CashoutOutcome = {
  goldBanked: totalGold(runState.pack),
  itemsBanked: runState.pack.items,
  heroesReturned: runState.party,
  heroesFallen: runState.fallen,
  heroesLost: runState.lost,
};
```

### 3.2 · `completeCombat` wipe path (around line 187 of `run_state.ts`)

```ts
const wipe: WipeOutcome = {
  packLost: runState.pack,
  heroesFallen: allLost,           // existing local var: pre-fallen + new-fallen + just-killed party
  heroesLost: runState.lost,       // narratively-Lost heroes from earlier in this run
};
```

The local variable `allLost` inside `completeCombat` (which collects "everyone-killed-this-fight + prior fallen") keeps its existing name — it already means "everyone who fell in combat by run-end" and won't surprise a future reader. Only the field it populates gets renamed from `heroesLost` to `heroesFallen`.

### 3.3 · Wipe semantic decision

Narratively-Lost heroes from earlier in the run **stay Lost** on wipe. They were already removed from the `party` and `fallen` arrays when `loseHero` was called; their category doesn't change because the rest of the party died later. So `wipe.heroesLost` is `runState.lost` (unchanged from when those Lost outcomes were applied), and `wipe.heroesFallen` is the combat-death set.

## 4 · Scene consumer updates

Both scenes read `heroesLost` today thinking "fallen." Mechanical field rename — no behavior change:

### 4.1 · `src/scenes/dungeon_scene.ts`

Line 537 (wipe panel iteration):

```ts
// OLD
for (const hero of wipe.heroesLost) {
// NEW
for (const hero of wipe.heroesFallen) {
```

Line 567 (also rename the local var `lostIds` → `fallenIds` for internal consistency; the variable was tracking fallen heroes via the misnamed field):

```ts
// OLD
const lostIds = new Set(this.wipeOutcome!.heroesLost.map((h) => h.id));
// NEW
const fallenIds = new Set(this.wipeOutcome!.heroesFallen.map((h) => h.id));
```

Update the downstream usage of `lostIds` in the same function to `fallenIds`.

### 4.2 · `src/scenes/camp_screen_scene.ts`

Line 159:

```ts
// OLD
const fallenIds = new Set(outcome.heroesLost.map((h) => h.id));
// NEW
const fallenIds = new Set(outcome.heroesFallen.map((h) => h.id));
```

The local var name `fallenIds` was already correct — only the field it reads from changes. Cluster B · 11 later adds rendering of `outcome.heroesLost` / `wipe.heroesLost` (the narratively-Lost set) with distinct visual treatment ("X was Lost" vs "X Fell" per gdd §8).

## 5 · Test plan

### 5.1 · `src/run/__tests__/run_state.test.ts`

**Existing test updates:**

- Search for `outcome.heroesLost` and `wipe.heroesLost` reads in this file. Update those references to `heroesFallen` (matches the existing semantic — these tests were always asserting against fallen heroes via the misnamed field).

**New tests for the Lost separation:**

- **Cashout with a Lost hero, no fallen:** apply `loseHero(rs, 0)` mid-run, advance to camp_screen, call `cashout` — `outcome.heroesLost` contains the Lost hero (1); `outcome.heroesFallen` is empty array; `outcome.heroesReturned` has the 2 surviving party members.
- **Cashout with both Lost and Fallen heroes:** scenario where one hero falls in combat and another is Lost via event — `outcome.heroesFallen` has 1, `outcome.heroesLost` has 1, `outcome.heroesReturned` has 1.
- **Wipe with a pre-Lost hero:** apply `loseHero` mid-run, then trigger a wipe in a later combat — `wipe.heroesFallen` contains the just-killed party (the surviving heroes who got killed in the wipe); `wipe.heroesLost` contains only the previously-Lost hero (NOT promoted to Fallen).
- **Wipe with no Lost heroes:** straightforward wipe path — `wipe.heroesFallen` populated; `wipe.heroesLost` is empty array.

### 5.2 · Sanity checks at scene-consumer call sites

The two scene file edits are mechanical renames; if `tsc --noEmit` is green after the interface rename, the consumer reads are correct. No new scene tests needed (Phaser-side scenes are not unit-tested by convention).

## 6 · Files touched

| File | Change |
|---|---|
| `src/run/run_state.ts` | Interface rename (`heroesLost` → `heroesFallen`) + new `heroesLost` field; populating sites in `cashout` and `completeCombat` wipe path. |
| `src/run/__tests__/run_state.test.ts` | Update existing tests' field references; add 4 new tests for the Lost separation. |
| `src/scenes/dungeon_scene.ts` | Two reads of `wipe.heroesLost` → `wipe.heroesFallen`. |
| `src/scenes/camp_screen_scene.ts` | One read of `outcome.heroesLost` → `outcome.heroesFallen`. |

## 7 · Save schema

No schema change. `RunState.lost` was added in Task 13 with the normalizer default. Save → load roundtrip already preserves the field. The outcome shapes (`CashoutOutcome`, `WipeOutcome`) are transient — returned from operations, never serialized.

## 8 · Open questions

None at design time.
