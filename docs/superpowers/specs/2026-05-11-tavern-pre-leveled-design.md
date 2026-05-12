# Tavern Pre-Leveled Candidates — Design Spec

**Date:** 2026-05-11
**Status:** Locked design, ready for implementation plan
**Related TODO:** Cluster B · 42

## Why

The Tavern stops mattering in the late game. A level-1 hero costing 50g is irrelevant when the active party is level 4-5 with rare gear; players stop visiting Tavern past mid-game except for forced softlock recovery. The roster expansion path (Tavern → Barracks → expedition) loses tension because new hires are always rebuilt-from-scratch.

This spec adds a chance for the Tavern to roll pre-leveled candidates whose hire cost scales with their level. Late-game players who upgrade Tavern past L1 see occasional L2 and L3 candidates and can pay a premium to skip the XP grind for new recruits.

After this ships:

- L1 Tavern is unchanged — all 3 candidates are L1, 50g each.
- L2 Tavern rolls each of 4 candidates with 25% chance of being L2 (else L1). L2 hire cost is 150g.
- L3 Tavern rolls each of 5 candidates with 25% chance of L2 + 10% chance of L3 (else L1). L3 hire cost is 400g.
- Each candidate's Hire button displays its own per-level cost. Per-card affordability gate (a 200g vault enables L1+L2 buttons but disables L3).
- Pre-leveled candidates come with the correct `applyLevelUps` stat bumps and `xp = LEVEL_THRESHOLDS[N-1]` so they progress normally from the just-hit-N threshold.

## Scope summary

**In scope:**

- New constant `HIRE_COST_BY_LEVEL: Record<1|2|3, number> = { 1: 50, 2: 150, 3: 400 }` in `src/camp/buildings/tavern.ts`.
- New constant `LEVEL_ROLL_TABLE: Record<BuildingLevel, readonly WeightedOption<1|2|3>[]>` in the same file, with weights 1.00 at L1; 0.75/0.25 at L2; 0.65/0.25/0.10 at L3.
- New internal `pickCandidateLevel(rng, tavernLevel)` helper using the existing `rng.weighted(...)` from `src/util/rng.ts`.
- `generateCandidate(rng, unlockedClasses, tavernLevel)` extended: third param added; rolls level via `pickCandidateLevel`; on L>1 result, applies `applyLevelUps(baseHero, 1, N)` and sets `xp = LEVEL_THRESHOLDS[N-1]`.
- All 3 callers of `generateCandidate` updated to thread `tavernLevel`: `ensureCandidatesForCap`, `generateCandidates`, and `tavern_panel_scene.ts:hire()` (replacement candidate after a successful hire).
- `tavern_panel_scene.ts` UI updates:
  - Drop the shared "Hire Cost: 50g" line from the header.
  - Per-card Hire button label uses `HIRE_COST_BY_LEVEL[candidate.level]`.
  - Per-card affordability gate: button disabled when `balance(vault) < candidateCost` (or kept enabled in softlocked-free mode).
  - "Not enough gold" reason shown per-card on disabled buttons.
- `hire(slotIndex)` updated to spend the per-candidate cost (not `HIRE_COST`).
- `generateStarterRoster` unchanged — starter heroes are always L1 (Tavern doesn't exist at first save).
- Tests in lockstep for `pickCandidateLevel`, `generateCandidate` per-level stats, the `HIRE_COST_BY_LEVEL` table, and determinism (same RNG state → same candidate at same level).

**Out of scope (deferred):**

- **Save schema change.** Heroes already store `level` and `xp`; pre-leveled candidates serialize via the existing `Hero` shape. No migration.
- **`BUILDING_LEVELS` copy update.** The L2/L3 `unlockDescription` strings could be widened to mention pre-leveled chance ("4 candidates · chance of L2 hires") — flagged as optional copy polish during implementation. Default position: leave unchanged; players see the level on the HeroCard anyway.
- **Veteran Tavern L4.** Rejected during brainstorming — extending the existing 3 levels is cleaner than adding a 4th tier.
- **Milestone-gated pre-leveled candidates.** Rejected — Tavern level IS the gate; milestone-based gating adds a second axis with no clear gameplay benefit.
- **Gear-tier rolling for pre-leveled candidates.** Out of scope. Pre-leveled candidates ship with starter gear (common, no affixes), same as L1 candidates. Justification: keeps cost reasonable; preserves the gear-progression and level-progression as independent axes.
- **Pre-rolled perks for L5+ candidates.** Moot — Tavern caps at L3 candidates; `applyLevelUps` only sets `pendingPerk: true` at MAX_LEVEL (5).
- **Tunable probabilities exposed in settings.** The weights are constants; if playtesting shows they're off, edit `LEVEL_ROLL_TABLE` and re-test.

## Locked decisions (brainstorm log)

| # | Question | Decision |
|---|---|---|
| Q1 | Trigger mechanism | **Tavern building level extends existing.** Reuses the L1/L2/L3 tier system. No new building, no new milestone, no new save state. L1 is unchanged (100% L1 candidates). |
| Q2 | Level distribution | **Per-slot independent probability, capped at Tavern level.** Each candidate slot rolls independently from `LEVEL_ROLL_TABLE[tavernLevel]`. Visit-to-visit variance is preserved; rare L3 jackpots are possible. |
| Q3 | Probability weights | **L1: 100% L1. L2: 75% L1 / 25% L2. L3: 65% L1 / 25% L2 / 10% L3.** Tuned for ~1 leveled candidate per L2 visit, ~1.75 leveled per L3 visit. L3 candidates are rare-but-real (each slot has only 10% chance individually). |
| Q4 | Hire cost scaling | **Linear with XP threshold: 50g / 150g / 400g.** Mirrors how many runs of XP grind the player would have done to reach that level (L2=200 XP ≈ 1 run; L3=800 XP ≈ 3-4 runs). Fair against late-game player wealth. |
| Q5 | XP value at hire | **`xp = LEVEL_THRESHOLDS[N-1]`** (200 for L2, 800 for L3). Pre-leveled candidate is at the just-hit-N threshold and progresses normally from there. Avoids the bug case where `xp = 0` causes `levelForXp(xp) < hero.level`, which would freeze the hero at N indefinitely. |
| Q6 | Stat bumps | **`applyLevelUps(baseHero, 1, N)` at generation time.** Deterministic; matches what a hand-leveled L1 hero would have at N. HP +2/level; primary stat +1/level (or +2/level for crit primary). |
| Q7 | Gear at hire | **Starter equipment unchanged.** Same common-rarity, no-affix starter kit as L1 candidates. Keeps gear progression independent of level progression; keeps cost reasonable. |
| Q8 | Reroll cost | **25g (unchanged).** Cheap fishing is the intentional mechanic: players who care about a specific class/level can grind reroll gold to fish for it. |
| Q9 | Softlock free-hire | **Applies to all candidates regardless of level.** Softlocked players (vault < 50g AND roster < 3) can hire L3 candidates for free. Matches the spirit of the softlock-relief mechanic. |
| Q10 | Pre-leveled candidate gets `pendingPerk`? | **No** (moot via Q1 cap). Tavern caps at L3; `applyLevelUps` only sets `pendingPerk: true` at L5. No camp-scene perk-picker firing on hire. |

## Data model — concrete additions

### `src/camp/buildings/tavern.ts`

Two new exports, one helper, and `generateCandidate` extended.

```typescript
import { applyLevelUps, LEVEL_THRESHOLDS } from '@data/leveling';
import type { BuildingLevel } from '@save/save';
import type { Rng, WeightedOption } from '@util/rng';

export const HIRE_COST = 50;       // unchanged (kept for backwards-compat with isSoftlocked)
export const REROLL_COST = 25;     // unchanged

export const HIRE_COST_BY_LEVEL: Record<1 | 2 | 3, number> = {
  1: 50,
  2: 150,
  3: 400,
};

export const LEVEL_ROLL_TABLE: Record<BuildingLevel, readonly WeightedOption<1 | 2 | 3>[]> = {
  1: [
    { value: 1, weight: 1.00 },
  ],
  2: [
    { value: 1, weight: 0.75 },
    { value: 2, weight: 0.25 },
  ],
  3: [
    { value: 1, weight: 0.65 },
    { value: 2, weight: 0.25 },
    { value: 3, weight: 0.10 },
  ],
};

function pickCandidateLevel(rng: Rng, tavernLevel: BuildingLevel): 1 | 2 | 3 {
  return rng.weighted(LEVEL_ROLL_TABLE[tavernLevel]);
}

export function generateCandidate(
  rng: Rng,
  unlockedClasses: readonly ClassId[],
  tavernLevel: BuildingLevel,        // NEW param, threaded through 3 call sites
): Hero {
  const classId = rng.pick(unlockedClasses);
  const traitId = rng.pick(ALL_TRAIT_IDS);
  const bodySpriteId = rng.pick(PLAYER_BODY_SPRITES);
  const legsSpriteId = rng.pick(PLAYER_LEGS_SPRITES);
  const feetSpriteId = rng.pick(PLAYER_FEET_SPRITES);
  const name = rng.pick(NAMES);
  const id = `hero_${rng.int(100000, 999999)}`;
  const petSpeciesId = classId === 'hunter' ? rng.pick(PET_SPECIES_IDS) : undefined;

  const baseHero = createHero(
    classId, name, id, traitId, bodySpriteId, legsSpriteId, feetSpriteId, petSpeciesId,
  );
  const targetLevel = pickCandidateLevel(rng, tavernLevel);
  if (targetLevel === 1) return baseHero;

  const leveled = applyLevelUps(baseHero, 1, targetLevel);
  return { ...leveled, xp: LEVEL_THRESHOLDS[targetLevel - 1] };
}
```

**RNG-advancement note.** Calling `rng.weighted(...)` advances the RNG state by 1 `next()` call. This means `pickCandidateLevel` consumes 1 RNG step regardless of which level it returns. Existing seed/replay behavior shifts: any test or determinism-dependent flow that previously seeded the Tavern with seed S will now produce different candidates (the level roll is inserted between trait roll and pet roll in the existing sequence). This is acceptable — Tavern candidates are not part of any replay surface, and the regenerated tests will pass with fresh seeds.

**Why call `pickCandidateLevel` AFTER `createHero` and not before the per-field rolls:** Keeping the level roll at the tail of the function means every L1-equivalent field (class, trait, name, sprites, id, pet) is rolled with the same RNG sequence position it had pre-feature. A test fixing a specific seed at the head will still see the same class/trait/etc.; only the final level decision is new. This minimizes RNG-state churn in existing test fixtures that don't care about pre-leveling.

### `ensureCandidatesForCap` and `generateCandidates`

```typescript
export function ensureCandidatesForCap(
  current: readonly Hero[],
  count: number,
  rng: Rng,
  unlockedClasses: readonly ClassId[],
  tavernLevel: BuildingLevel,        // NEW param
): readonly Hero[] {
  if (current.length === count) return current;
  return generateCandidates(rng, unlockedClasses, count, tavernLevel);
}

export function generateCandidates(
  rng: Rng,
  unlockedClasses: readonly ClassId[],
  count: number,
  tavernLevel: BuildingLevel,        // NEW param
): Hero[] {
  const candidates: Hero[] = [];
  for (let i = 0; i < count; i++) {
    candidates.push(generateCandidate(rng, unlockedClasses, tavernLevel));
  }
  return candidates;
}
```

### `generateStarterRoster` unchanged

Starter heroes are always L1; the Tavern doesn't exist at fresh-save time. No parameter needed.

## UI — `src/scenes/tavern_panel_scene.ts`

### Header copy

**Before:**

```
Tavern - Hire Cost: 50g
Vault: 1240g · Roster: 8 / 12
```

**After:**

```
Tavern
Vault: 1240g · Roster: 8 / 12
```

The shared "Hire Cost: 50g" line is dropped. Cost moves to per-card Hire buttons. The softlocked-free header copy is unchanged: `Tavern - Hires are free until you recover`.

### Per-card Hire button

```typescript
import { HIRE_COST_BY_LEVEL } from '@camp/buildings/tavern';

// Inside the candidate-card loop:
const candidate = candidates[i];
const candidateCost = HIRE_COST_BY_LEVEL[candidate.level as 1 | 2 | 3];
const canAffordThis = free || vaultGold >= candidateCost;
const canHireThis = canAddHero && canAffordThis;

let thisHireReason = '';
if (!canAffordThis) thisHireReason = 'Not enough gold';
else if (!canAddHero) thisHireReason = 'Roster full';

const buttonText = free ? 'Hire (free)' : `Hire (${candidateCost}g)`;

new Button({
  scene: this,
  x: slotX - HIRE_BUTTON_W / 2,
  y: HIRE_BUTTON_Y,
  width: HIRE_BUTTON_W,
  height: HIRE_BUTTON_H,
  enabled: canHireThis,
  text: buttonText,
  font: 'medium',
  fontSize: 16,
  onClick: () => this.hire(i, candidates),
});

if (!canHireThis && thisHireReason) {
  this.add.text(slotX, HIRE_REASON_Y, thisHireReason, {
    fontFamily: 'monospace', fontSize: '11px', color: '#cc6666',
  }).setOrigin(0.5);
}
```

The pre-loop shared `canHire` / `hireReason` constants are removed (replaced by per-iteration values).

### `hire(slotIndex)` method

```typescript
private hire(slotIndex: number, candidates: Hero[]): void {
  const state = appState.get();
  const free = isSoftlocked(state);
  if (!canAdd(state.roster)) return;

  const hired = candidates[slotIndex];
  const cost = HIRE_COST_BY_LEVEL[hired.level as 1 | 2 | 3];
  if (!free && balance(state.vault) < cost) return;

  const rng = createRngFromState(state.campRngState);
  const tavernLevel = state.buildingLevels.tavern;
  const replacement = generateCandidate(rng, state.unlocks.classes, tavernLevel);
  const newCandidates = [...candidates];
  newCandidates[slotIndex] = replacement;

  appState.update((s) => ({
    ...s,
    vault: free ? s.vault : spend(s.vault, cost),
    roster: addHero(s.roster, hired),
    tavernCandidates: newCandidates,
    campRngState: rng.getState(),
  }));

  this.scene.restart();
}
```

The replacement candidate rolls its own level — hiring an L3 doesn't deterministically refill the slot with another L3.

### `reroll()` method

Updated to pass `tavernLevel`:

```typescript
private reroll(): void {
  const state = appState.get();
  if (balance(state.vault) < REROLL_COST) return;

  const tavernLevel = state.buildingLevels.tavern;
  const rng = createRngFromState(state.campRngState);
  const fresh = generateCandidates(
    rng,
    state.unlocks.classes,
    tavernCandidateCount(tavernLevel),
    tavernLevel,                                  // NEW arg
  );

  appState.update((s) => ({
    ...s,
    vault: spend(s.vault, REROLL_COST),
    tavernCandidates: fresh,
    campRngState: rng.getState(),
  }));

  this.scene.restart();
}
```

### `ensureCandidatesForCap` call site in `create()`

Updated to pass `tavernLevel`:

```typescript
const ensured = ensureCandidatesForCap(
  state.tavernCandidates,
  targetCount,
  rng,
  state.unlocks.classes,
  tavernLevel,                                    // NEW arg
);
```

## Save state + migration

**No schema change.** `Hero.level` and `Hero.xp` are existing fields. A pre-leveled candidate serializes via the existing JSON path. `tavernCandidates` is already a `readonly Hero[]` and stores fully-formed Hero objects.

**No migration.** Existing v5 saves keep their persisted all-L1 `tavernCandidates`. Next Tavern visit after this ships: `ensureCandidatesForCap` returns the existing list unchanged (length still matches `tavernCandidateCount(level)`). Pre-leveled candidates only start appearing after the player rerolls or hires through the existing slate.

## Test impact

### New tests

**`src/camp/buildings/__tests__/tavern.test.ts`** (extend existing):

- `HIRE_COST_BY_LEVEL` table values exactly match {1: 50, 2: 150, 3: 400}.
- `LEVEL_ROLL_TABLE[1]` yields only `{value: 1, weight: 1.00}` (single entry, weight 1).
- `LEVEL_ROLL_TABLE[2]` weights sum to 1.00; entries `(1, 0.75)` and `(2, 0.25)`.
- `LEVEL_ROLL_TABLE[3]` weights sum to 1.00; entries `(1, 0.65)`, `(2, 0.25)`, `(3, 0.10)`.
- `pickCandidateLevel(rng, 1)` always returns 1 (verify across N seeds).
- `pickCandidateLevel(rng, 3)` distribution over many seeds approximates 65/25/10 ±1% (use a large sample, e.g., 10000 rolls).
- `generateCandidate(rng, classes, 1)` produces `level: 1` and `xp: 0`.
- `generateCandidate(rng, classes, 3)` with a forced-L3 RNG seed produces:
  - `level: 3`
  - `xp: 800` (= `LEVEL_THRESHOLDS[2]`)
  - `baseStats[primary] === classBase[primary] + 2` (or +4 for crit primary)
  - `maxHp === classBase.hp + 4 + gearTotal(starterEquipment)`
  - `pendingPerk: false`
  - `currentHp === maxHp`
- Determinism: `generateCandidate(createRngFromState(S), classes, 3)` called twice with the same seed `S` produces equal Hero objects (every field, including `id`). Verifies the function is a pure RNG-state → Hero mapping.
- `generateStarterRoster(rng)` regression: returns 3 heroes, all `level: 1` and `xp: 0`. Doesn't accidentally pre-level its trio.

### Existing tests to update

- `src/camp/buildings/__tests__/tavern.test.ts`: any test calling `generateCandidate(rng, classes)` (2-arg) must now pass `tavernLevel`. Add `tavernLevel: 1` to preserve existing behavior in tests that don't care about pre-leveling.
- `src/scenes/__tests__/tavern_panel_scene.test.ts` (if it exists — check during implementation): same fixup.
- Per saved memory `feedback_grep_tests_before_data_edits`: grep `__tests__/` for `generateCandidate(` and `generateCandidates(` and update each call site.

### Manual UX smoke

- L1 Tavern: visit, see 3 L1 candidates with `Hire (50g)` buttons. Hire one; replacement is L1.
- Upgrade to L2 (200g): 4 candidates appear; ~1 of 4 is L2 with `Hire (150g)` button. Hire L2; replacement re-rolls (may be L1 or L2).
- Upgrade to L3 (500g): 5 candidates appear; occasionally see L3 with `Hire (400g)`. Reroll several times to verify the distribution.
- Player with 200g vault at L3 Tavern: verify L1 button enabled, L2 button enabled, L3 button disabled with "Not enough gold" hint.
- Softlocked save (vault < 50g, roster < 3): all Hire buttons say "Hire (free)" regardless of candidate level.
- Hire an L3 candidate at a normal save: 400g spent; hired hero appears in Barracks at level 3 with `xp: 800` and bumped HP / primary stat.

## Risks and open questions

- **Reroll grinding bypasses the rare-jackpot tension.** At 25g/reroll (12g post-Warren-clear), a 1000g vault buys 40+ rerolls. Players who care about a specific L3 hire can fish indefinitely. Accepted as a feature: the fishing IS the late-game Tavern depth.
- **Class-roll bias persists.** A player needing an L3 Hunter may see L3 Mages instead. Per-slot independence means class and level are joint-independent. Status quo for Tavern; this spec doesn't make it worse.
- **Probability sensitivity.** The 25%/10% rates are guesses. If playtesting shows L3 candidates are too rare or too common, the constants are one-line edits in `LEVEL_ROLL_TABLE`. No schema or test churn required beyond the dependent tests.
- **RNG-advancement determinism shift.** Appending `pickCandidateLevel` to the tail of `generateCandidate` (after the existing class/trait/sprite/name/id/pet rolls) advances the RNG state by 1 extra step compared to the pre-feature behavior. Fields rolled BEFORE the new call are byte-identical for the same seed; only the post-Tavern state is shifted. Tests that re-seed and assert a follow-up roll (e.g., the next `generateCandidate` from the new state) will need their expected values regenerated. Tests that only check the first candidate's fields are unaffected.
- **`generateCandidate` parameter count.** The function now takes 3 parameters (rng, classes, tavernLevel). Adding a 4th in the future feels noisy — flagged as a code-smell for a future refactor to an options-object signature.
- **`generateStarterRoster` doesn't take `tavernLevel`** by design (Tavern doesn't exist at first save), but it does call into the same generation infrastructure inline. If `generateCandidate` ever fundamentally restructures, the starter roster path may drift. Acceptable for now; documented here.

## Future spec hooks (not implemented here)

- **L4/L5 Tavern pre-leveled candidates.** Would require widening `BuildingLevel` past 3, which is a bigger structural change. Not needed unless playtesting shows L3 isn't late-game-relevant enough.
- **Class-bias controls.** A late-game feature where the Tavern can be "specialized" to favor certain classes. Out of scope; logged here for future ideas.md migration.
- **Pre-leveled candidate gear roll.** Letting L3 candidates come with rare-tier starter gear would mirror the level investment with gear investment. Not requested; deliberate exclusion to keep the level-progression and gear-progression axes independent.
- **Veteran Tavern building tier.** Rejected during brainstorming as adding unnecessary structural complexity vs. extending the existing 3 tiers. Logged here in case future design wants to revisit.
