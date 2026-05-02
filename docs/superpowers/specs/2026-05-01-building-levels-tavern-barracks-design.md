# Building Levels — Common Infrastructure + Tavern + Barracks — Design

- **TODO entry:** Cluster B · 29 (Building level upgrades), decomposed into **29a / 29b / 29c**. This spec covers **29a only**.
- **Tier:** 2 polish.
- **Date:** 2026-05-01.

## 1 · Scope

This is the **first phase** of a three-phase decomposition of "Building level upgrades" (Cluster B · 29):

- **29a (this spec):** Common infrastructure (`BuildingLevels` save field + normalizer default + tunables file + per-panel Upgrade button pattern) + Tavern wire-up (3/4/5 candidates) + Barracks wire-up (12/16/20 roster cap).
- **29b (split out):** Blacksmith level gating (rarity unlocks). Independent of 29a once infrastructure exists.
- **29c (split out):** Hospital level effects. Needs its own design pass — current Hospital UX is unconstrained, and the gdd's "1 wound/run cheap / faster time-heal" doesn't cleanly map onto current code without an interpretive call.

Why this decomposition: Tavern and Barracks have clean L→effect mappings on existing code (just numeric tuning); Blacksmith needs a UI gate that's straightforward but separable; Hospital needs a real design pass before implementation. Splitting protects the implementation cycle from interpreting Hospital's underspecified gdd row mid-build.

**Out of scope for 29a:**

- **Blacksmith level effects.** L1 still permits common→uncommon AND uncommon→rare (the existing behavior — no new gate). 29b adds the gate that restricts uncommon→rare to L2+.
- **Hospital level effects.** Treatment behavior unchanged from today. 29c will define + ship them.
- **Tavern trait-odds tuning at L3.** gdd mentions "better trait odds" at L3 — implementation deferred until balance pass defines what "better" means against the current uniform-roll baseline.
- **Save schema version bump.** Pre-launch policy: schema stays at 1, normalizer adds defaults for new fields. Old saves get `buildingLevels = { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 }` automatically.
- **Cost balance tuning.** Initial costs L1→L2 = 200g, L2→L3 = 500g per building. Tunable in the new `building_levels.ts` file; balance is its own future task.

## 2 · Save schema

Add `BuildingLevels` types and a field on `SaveFile`:

```ts
// In src/save/save.ts (or a new src/save/building_levels_types.ts re-exported)
export type BuildingId = 'tavern' | 'barracks' | 'blacksmith' | 'hospital';
export type BuildingLevel = 1 | 2 | 3;
export type BuildingLevels = Record<BuildingId, BuildingLevel>;

export interface SaveFile {
  // ...existing fields
  buildingLevels: BuildingLevels;
}
```

Normalizer default in `normalizeSaveFile`:

```ts
buildingLevels: file.buildingLevels ?? { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
```

The shape includes all four building IDs from day one — even the ones whose effects don't ship until 29b/29c — so those phases don't need to migrate the field, only wire effects to a value that's already saved + defaulted.

## 3 · Tunables file

`src/camp/building_levels.ts` (new):

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

Single source of truth for: per-building level metadata, costs, descriptions, the capacity-per-Barracks-level table, and the Tavern candidate-count derivation.

## 4 · Upgrade button pattern (per building panel)

Each panel that supports upgrades adds a small "Upgrade" button at the bottom of the panel near other action buttons. The button:

- **Hidden** if `nextLevel(building, currentLevel) === null` (already at max — applies to Tavern and Barracks at L3, and to Blacksmith/Hospital today since their tier arrays only have L1).
- **Disabled (gray)** if `vault.gold < nextLevel.upgradeCost`.
- **Enabled (gold accent)** if affordable.
- **Label:** `Upgrade — {cost}g` on a single line. The unlock description (`'4 candidates per visit'`) shows as a sub-label or tooltip line below.

Click handler (extracted into a shared `applyBuildingUpgrade` helper to keep the per-panel code minimal):

```ts
// In a new src/camp/building_upgrade.ts
import type { BuildingId, BuildingLevel, SaveFile } from '@save/save';
import { BUILDING_LEVELS, BARRACKS_CAPACITY, nextLevel } from './building_levels';
import { spend } from './vault';

export function applyBuildingUpgrade(state: SaveFile, building: BuildingId): SaveFile {
  const current = state.buildingLevels[building];
  const next = nextLevel(building, current);
  if (next === null) {
    throw new Error(`applyBuildingUpgrade: ${building} already at max level ${current}`);
  }
  // (Affordability re-checked here via spend; spend throws if insufficient.)
  const newVault = spend(state.vault, next.upgradeCost);
  const newLevel = next.level as BuildingLevel;
  const newBuildingLevels = { ...state.buildingLevels, [building]: newLevel };
  // Barracks-specific: also bump roster capacity.
  const newRoster = building === 'barracks'
    ? { ...state.roster, capacity: BARRACKS_CAPACITY[newLevel] }
    : state.roster;
  return { ...state, vault: newVault, buildingLevels: newBuildingLevels, roster: newRoster };
}
```

Per-panel call sites:

```ts
// (Inside Tavern + Barracks panels, simplified)
upgradeBtn.on('pointerdown', () => {
  appState.update((s) => applyBuildingUpgrade(s, 'tavern'));  // or 'barracks'
  this.rebuild();  // panel-specific rebuild method
});
```

## 5 · Roster.capacity handling — mutate on upgrade

Two approaches considered:

- **Mutate (chosen):** when Barracks upgrades, the click handler also writes `roster.capacity = BARRACKS_CAPACITY[newLevel]`. `Roster.capacity` field already exists (currently always 12); the mutation just makes it dynamic. Roster API stays unchanged.
- **Derive (rejected):** drop `Roster.capacity`, derive from `buildingLevels.barracks` at every read. Cleaner one-source-of-truth in principle, but every existing `roster.capacity` reader (Barracks panel header, HeroCard rendering, recruitment validation in Tavern, list-pane iteration) would need to take a `buildingLevels` parameter or look up `appState.get().buildingLevels.barracks` directly. Disruptive for marginal benefit.

The mutate path is encapsulated in `applyBuildingUpgrade` — only one site writes capacity changes, so the "two sources of truth" risk is bounded.

For new-game starts: `createRoster()` continues to default to `DEFAULT_ROSTER_CAPACITY = 12`, which equals `BARRACKS_CAPACITY[1]`. Both are explicitly aligned; if either changes, a follow-up should align both (added as a comment in `building_levels.ts`).

## 6 · Tavern wire-up

`src/camp/buildings/tavern.ts`:

- Remove the `TAVERN_CANDIDATE_COUNT = 3` constant export.
- `generateCandidates(rng, unlockedClasses)` → `generateCandidates(rng, unlockedClasses, count)` — takes the count as a parameter rather than reading the constant.

`src/scenes/tavern_panel_scene.ts`:

- Read `appState.get().buildingLevels.tavern` to derive the candidate count via `tavernCandidateCount(level)`.
- Pass the count into `generateCandidates`.
- Add the Upgrade button (per §4).

The reroll button (Cluster B · 16) also calls `generateCandidates`; same one-line update there.

`src/camp/buildings/__tests__/tavern.test.ts`: existing tests assume the old signature — update to pass the count argument explicitly. Add a sanity test confirming `tavernCandidateCount(1) === 3`, `(2) === 4`, `(3) === 5`.

## 7 · Barracks wire-up

`src/scenes/barracks_panel_scene.ts`:

- Replace `const ROSTER_CAP_DISPLAY = 12` with a derived value: `const cap = appState.get().roster.capacity` (already updated to 16/20 post-upgrade via `applyBuildingUpgrade`).
- The list-pane slot iteration `for (let i = 0; i < ROSTER_CAP_DISPLAY; i++)` becomes `for (let i = 0; i < cap; i++)`.
- The 2-column slot grid grows from 6 rows to 8 (L2) or 10 (L3) rows.
- Add the Upgrade button (per §4).

**Layout risk:** the list pane is 380×360 today, holding a 2-column × 6-row grid of 184×60 slots (total grid height: 6 × 60 = 360). At L3 (10 rows), the grid wants 600 height — overflows the pane.

Mitigation paths (decision deferred to implementation, where it's testable):

- **(i) Shrink slot height** from 60 → 36px (10 rows × 36 = 360, fits).
- **(ii) Grow the pane vertically** — list pane absorbs more of the existing panel real estate; detail pane shrinks correspondingly. Likely needs a panel-wide rework.
- **(iii) Scroll the list** — add scrolling to the list-pane container. New UX surface; bigger lift.

The implementer picks (i), (ii), or (iii) during execution based on what looks cleanest. Spec flags this explicitly so it's not a discovered surprise.

## 8 · Files touched

| File | Change |
|---|---|
| `src/save/save.ts` | Add `BuildingId`, `BuildingLevel`, `BuildingLevels` types + field on `SaveFile`. Add `buildingLevels` default to `normalizeSaveFile`. |
| `src/camp/building_levels.ts` (new) | Tunables: `BUILDING_LEVELS`, `BARRACKS_CAPACITY`, `nextLevel`, `tavernCandidateCount`. |
| `src/camp/building_upgrade.ts` (new) | `applyBuildingUpgrade(state, building)` — spend gold, bump level, mutate Roster.capacity for Barracks. |
| `src/camp/buildings/tavern.ts` | Drop `TAVERN_CANDIDATE_COUNT` constant; add `count` parameter to `generateCandidates`. |
| `src/scenes/tavern_panel_scene.ts` | Pass derived count into `generateCandidates` (initial + reroll); add Upgrade button. |
| `src/scenes/barracks_panel_scene.ts` | Replace `ROSTER_CAP_DISPLAY` with `roster.capacity` reads; add Upgrade button; resolve slot-grid layout at L2/L3. |
| `src/camp/buildings/__tests__/tavern.test.ts` | Update existing tests to pass count arg; add sanity tests for `tavernCandidateCount`. |
| `src/camp/__tests__/building_levels.test.ts` (new) | Unit tests for `nextLevel`, `tavernCandidateCount`, `BARRACKS_CAPACITY` table. |
| `src/camp/__tests__/building_upgrade.test.ts` (new) | Unit tests for `applyBuildingUpgrade`: success path, throws at max level, Barracks-specific roster capacity update, Tavern doesn't touch roster. |
| `src/save/__tests__/save.test.ts` | Add test: normalizer fills in default `buildingLevels` for old saves missing the field. |

No other files touched. Existing `Roster.capacity` field shape unchanged. Save schema version unchanged (still 1). No data layer changes beyond the new tunables.

## 9 · Test plan

**New tests (~7):**
- `building_levels.test.ts`: `nextLevel` returns next def or null at max (3 cases per building × 4 buildings = ~12 if exhaustive, or 4 representative); `tavernCandidateCount(1/2/3) === 3/4/5`; `BARRACKS_CAPACITY` table covers all 3 levels.
- `building_upgrade.test.ts`: success path mutates `vault`/`buildingLevels`/`roster.capacity` correctly; throws on attempt to upgrade past max; Tavern upgrade leaves `roster.capacity` untouched.
- `save.test.ts`: `load()` of an old save (no `buildingLevels` field) returns a save with default `{ tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 }`.
- `tavern.test.ts`: existing tests updated to pass `count` arg (no behavior change); plus a count-arg coverage check.

**Acceptance:**
- `npx tsc --noEmit` green.
- `npm test` green (1330 → ~1335–1338, depending on test granularity).
- `npm run build` succeeds.

**Manual play verification:**
- Open Tavern at L1: 3 candidates render. Click Upgrade — gold deducted, panel rebuilds, now showing 4 candidates.
- Click Upgrade again at L2: 5 candidates show. Upgrade button hides at L3.
- Open Barracks at L1: 12 slots render. Click Upgrade — gold deducted, slot grid expands to 16 (then 20 at L3).
- At L3 Barracks, verify the slot grid is readable (per the layout-risk decision in §7).
- Verify reroll at L2/L3 Tavern produces 4/5 fresh candidates.
- Reload page mid-game — building levels persist via the save state.
- Old save (manually edit localStorage to remove `buildingLevels`) — game loads, normalizer fills in defaults.

## 10 · Risk

Medium. New save field, new tunables, two panels touched, two new helpers, two new test files. The Barracks slot-grid layout at L3 is the visual unknown; everything else is mechanical with strong test coverage.

The mutate-on-upgrade approach for `Roster.capacity` introduces a "two sources of truth" surface (`buildingLevels.barracks` and `roster.capacity`) that are kept in sync by `applyBuildingUpgrade`. Bounded because only that one helper writes capacity. Documented in `building_levels.ts` comment so future code knows.

## 11 · Open questions

None at design time. Cost balancing acknowledged as a follow-up; layout-at-L3 acknowledged as an implementation-time decision.
