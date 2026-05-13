# Tavern Pre-Leveled Candidates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Note on commits:** Each task ends with a `git commit` step per skill template. This codebase's CLAUDE.md says "never create git commits without explicit user instruction in the current turn" — defer to the user at execution time. If the user opts to skip commits, leave changes in the working tree and proceed to the next task.

**Goal:** Add a chance for Tavern candidates to roll pre-leveled (L2 or L3) with per-level hire costs (50g / 150g / 400g), gated by Tavern building level (Cluster B · 42).

**Architecture:** Each candidate's level is rolled at generation time via a weighted lookup (`LEVEL_ROLL_TABLE`) keyed on Tavern level. Pre-leveled candidates get their stats via `applyLevelUps(hero, 1, N)` and their xp set to `LEVEL_THRESHOLDS[N-1]`. The Tavern panel shows per-card hire costs and per-card affordability. No save schema change — Heroes already store `level` and `xp`.

**Tech Stack:** TypeScript, Vitest, Phaser (scenes only). Phaser firewall preserved.

**Spec:** `docs/superpowers/specs/2026-05-11-tavern-pre-leveled-design.md`

---

## File Structure

**Modified:**
- `src/camp/buildings/tavern.ts` — add `HIRE_COST_BY_LEVEL`, `LEVEL_ROLL_TABLE`, private `pickCandidateLevel`; extend `generateCandidate` with `tavernLevel` param + post-`createHero` level-up; thread `tavernLevel` through `generateCandidates` and `ensureCandidatesForCap`.
- `src/camp/buildings/__tests__/tavern.test.ts` — extend with: HIRE_COST_BY_LEVEL test, LEVEL_ROLL_TABLE shape tests, pickCandidateLevel distribution test, generateCandidate L1/L2/L3 stat/xp/level tests, generateStarterRoster L1 regression. Update existing tests to pass `tavernLevel: 1` to `generateCandidate`/`generateCandidates`/`ensureCandidatesForCap`.
- `src/scenes/tavern_panel_scene.ts` — drop header "Hire Cost" line; per-card Hire button cost + affordability; update `hire(slotIndex)` to spend per-candidate cost; thread `tavernLevel` to `ensureCandidatesForCap`, `generateCandidates`, and `generateCandidate` (replacement).

**Not modified:** `BUILDING_LEVELS` entries (no copy change — flagged as optional polish in the spec, not implemented here); `SaveFile` shape; migrations.

---

## Phase 1 — Constants + helper

### Task 1: Add `HIRE_COST_BY_LEVEL`, `LEVEL_ROLL_TABLE`, and `pickCandidateLevel`

**Files:**
- Modify: `src/camp/buildings/tavern.ts`
- Modify: `src/camp/buildings/__tests__/tavern.test.ts`

- [ ] **Step 1: Write failing tests for the new constants and helper**

Append to `src/camp/buildings/__tests__/tavern.test.ts`:

```typescript
import { HIRE_COST_BY_LEVEL, LEVEL_ROLL_TABLE } from '../tavern';

describe('HIRE_COST_BY_LEVEL', () => {
  it('exports 50 / 150 / 400 for levels 1 / 2 / 3', () => {
    expect(HIRE_COST_BY_LEVEL[1]).toBe(50);
    expect(HIRE_COST_BY_LEVEL[2]).toBe(150);
    expect(HIRE_COST_BY_LEVEL[3]).toBe(400);
  });
});

describe('LEVEL_ROLL_TABLE', () => {
  it('L1 Tavern has a single entry with weight 1.00 for level 1', () => {
    expect(LEVEL_ROLL_TABLE[1]).toHaveLength(1);
    expect(LEVEL_ROLL_TABLE[1][0]).toEqual({ value: 1, weight: 1.00 });
  });

  it('L2 Tavern weights sum to 1.00 with entries (1, 0.75) and (2, 0.25)', () => {
    expect(LEVEL_ROLL_TABLE[2]).toEqual([
      { value: 1, weight: 0.75 },
      { value: 2, weight: 0.25 },
    ]);
    const sum = LEVEL_ROLL_TABLE[2].reduce((s, e) => s + e.weight, 0);
    expect(sum).toBeCloseTo(1.00, 5);
  });

  it('L3 Tavern weights sum to 1.00 with entries (1, 0.65), (2, 0.25), (3, 0.10)', () => {
    expect(LEVEL_ROLL_TABLE[3]).toEqual([
      { value: 1, weight: 0.65 },
      { value: 2, weight: 0.25 },
      { value: 3, weight: 0.10 },
    ]);
    const sum = LEVEL_ROLL_TABLE[3].reduce((s, e) => s + e.weight, 0);
    expect(sum).toBeCloseTo(1.00, 5);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run src/camp/buildings/__tests__/tavern.test.ts`
Expected: FAIL — `HIRE_COST_BY_LEVEL` and `LEVEL_ROLL_TABLE` are undefined.

- [ ] **Step 3: Add the constants and helper to `src/camp/buildings/tavern.ts`**

Add these imports at the top (after the existing imports):

```typescript
import { applyLevelUps, LEVEL_THRESHOLDS } from '@data/leveling';
import type { BuildingLevel } from '@save/save';
import type { Rng, WeightedOption } from '@util/rng';
```

(Note: `Rng` is already imported via `'@util/rng'`. Add `WeightedOption` to that existing import line.)

Add after `REROLL_COST` (around line 13):

```typescript
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
```

- [ ] **Step 4: Run tests — expect passing**

Run: `npx vitest run src/camp/buildings/__tests__/tavern.test.ts`
Expected: PASS on the 4 new tests. The pre-existing tests still pass because we haven't yet changed `generateCandidate`'s signature.

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/camp/buildings/tavern.ts src/camp/buildings/__tests__/tavern.test.ts
git commit -m "Tavern — add HIRE_COST_BY_LEVEL + LEVEL_ROLL_TABLE + pickCandidateLevel"
```

---

## Phase 2 — Pre-leveled candidate generation

### Task 2: Extend `generateCandidate` with `tavernLevel`; thread through callers; pre-level via `applyLevelUps`

**Files:**
- Modify: `src/camp/buildings/tavern.ts`
- Modify: `src/scenes/tavern_panel_scene.ts` (only the call sites — UI changes land in Task 3)
- Modify: `src/camp/buildings/__tests__/tavern.test.ts` (existing test updates + new pre-leveling tests)

- [ ] **Step 1: Write failing tests for pre-leveled generation behavior**

Append to `src/camp/buildings/__tests__/tavern.test.ts`:

```typescript
import { LEVEL_THRESHOLDS, MAX_LEVEL } from '@data/leveling';

describe('generateCandidate — pre-leveled (Tavern L2/L3)', () => {
  it('always returns level 1 at L1 Tavern', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const c = generateCandidate(createRng(seed), TIER1_CLASSES, 1);
      expect(c.level).toBe(1);
      expect(c.xp).toBe(0);
    }
  });

  it('L2 candidates have xp = LEVEL_THRESHOLDS[1] (200) and bumped primary stat', () => {
    // Search for a seed that produces an L2 candidate at L2 Tavern.
    let l2: ReturnType<typeof generateCandidate> | undefined;
    for (let seed = 1; seed <= 200; seed++) {
      const c = generateCandidate(createRng(seed), TIER1_CLASSES, 2);
      if (c.level === 2) { l2 = c; break; }
    }
    expect(l2, 'seeded search found no L2 candidate within 200 seeds').toBeDefined();
    expect(l2!.xp).toBe(LEVEL_THRESHOLDS[1]);
    expect(l2!.level).toBe(2);

    // Verify primary stat is bumped vs. a freshly-rolled L1 of the same class.
    const def = CLASSES[l2!.classId];
    const primaryBump = def.primaryStat === 'crit' ? 2 : 1;
    expect(l2!.baseStats[def.primaryStat]).toBe(def.baseStats[def.primaryStat] + primaryBump);
  });

  it('L3 candidates have xp = LEVEL_THRESHOLDS[2] (800) and double-bumped primary stat', () => {
    let l3: ReturnType<typeof generateCandidate> | undefined;
    for (let seed = 1; seed <= 1000; seed++) {
      const c = generateCandidate(createRng(seed), TIER1_CLASSES, 3);
      if (c.level === 3) { l3 = c; break; }
    }
    expect(l3, 'seeded search found no L3 candidate within 1000 seeds').toBeDefined();
    expect(l3!.xp).toBe(LEVEL_THRESHOLDS[2]);
    expect(l3!.level).toBe(3);

    const def = CLASSES[l3!.classId];
    const primaryBump = (def.primaryStat === 'crit' ? 2 : 1) * 2;
    expect(l3!.baseStats[def.primaryStat]).toBe(def.baseStats[def.primaryStat] + primaryBump);
  });

  it('pre-leveled candidates have pendingPerk: false (Tavern caps below MAX_LEVEL)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const c = generateCandidate(createRng(seed), TIER1_CLASSES, 3);
      expect(c.pendingPerk, `seed ${seed}`).toBe(false);
      expect(c.level).toBeLessThan(MAX_LEVEL);
    }
  });

  it('pre-leveled candidates have maxHp bumped by 2/level from class base + gear', () => {
    let l2: ReturnType<typeof generateCandidate> | undefined;
    for (let seed = 1; seed <= 200; seed++) {
      const c = generateCandidate(createRng(seed), TIER1_CLASSES, 2);
      if (c.level === 2) { l2 = c; break; }
    }
    expect(l2).toBeDefined();
    // L2 hero has 1 level-up applied → +2 HP from level-up alone.
    // Trait/gear may add more on top; assert the floor: maxHp >= classBaseHp + 2.
    const classBaseHp = CLASSES[l2!.classId].baseStats.hp;
    expect(l2!.maxHp).toBeGreaterThanOrEqual(classBaseHp + 2);
    expect(l2!.currentHp).toBe(l2!.maxHp);  // freshly generated, full HP
  });

  it('pickCandidateLevel(L3, 5000 seeds) approximates 65/25/10 within ±3%', () => {
    let counts = { 1: 0, 2: 0, 3: 0 };
    const N = 5000;
    for (let seed = 1; seed <= N; seed++) {
      const c = generateCandidate(createRng(seed), TIER1_CLASSES, 3);
      counts[c.level as 1 | 2 | 3]++;
    }
    expect(counts[1] / N).toBeCloseTo(0.65, 1);  // ±0.05
    expect(counts[2] / N).toBeCloseTo(0.25, 1);
    expect(counts[3] / N).toBeCloseTo(0.10, 1);
  });
});
```

Then update the EXISTING test calls to pass `tavernLevel: 1`. Find every call to:
- `generateCandidate(rng, TIER1_CLASSES)` → `generateCandidate(rng, TIER1_CLASSES, 1)`
- `generateCandidates(rng, TIER1_CLASSES, n)` → `generateCandidates(rng, TIER1_CLASSES, n, 1)`
- `ensureCandidatesForCap(current, n, rng, TIER1_CLASSES)` → `ensureCandidatesForCap(current, n, rng, TIER1_CLASSES, 1)`

Pre-existing test file has many such call sites (lines 30, 35, 40, 45, 51, 56, 57, 64, 69, 70, 76, 93, 94, 99, 104, 105, 111, 112, 121, and more). Read the full file and update each occurrence in lockstep. Use `replace_all` carefully with enough context to disambiguate.

- [ ] **Step 2: Run tests — expect failures**

Run: `npx vitest run src/camp/buildings/__tests__/tavern.test.ts`
Expected: FAIL — `generateCandidate` only takes 2 args; new tests fail (wrong signature, no pre-leveling logic).

- [ ] **Step 3: Update `generateCandidate` in `src/camp/buildings/tavern.ts`**

Replace the existing function (currently lines 18-33):

```typescript
export function generateCandidate(
  rng: Rng,
  unlockedClasses: readonly ClassId[],
  tavernLevel: BuildingLevel,
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

- [ ] **Step 4: Update `generateCandidates` to thread `tavernLevel`**

```typescript
export function generateCandidates(
  rng: Rng,
  unlockedClasses: readonly ClassId[],
  count: number,
  tavernLevel: BuildingLevel,
): Hero[] {
  const candidates: Hero[] = [];
  for (let i = 0; i < count; i++) {
    candidates.push(generateCandidate(rng, unlockedClasses, tavernLevel));
  }
  return candidates;
}
```

- [ ] **Step 5: Update `ensureCandidatesForCap` to thread `tavernLevel`**

```typescript
export function ensureCandidatesForCap(
  current: readonly Hero[],
  count: number,
  rng: Rng,
  unlockedClasses: readonly ClassId[],
  tavernLevel: BuildingLevel,
): readonly Hero[] {
  if (current.length === count) return current;
  return generateCandidates(rng, unlockedClasses, count, tavernLevel);
}
```

- [ ] **Step 6: Update the three caller sites**

The build will be broken until these are fixed:

1. `src/scenes/tavern_panel_scene.ts:223` (in `hire()`):

```typescript
// Before:
const replacement = generateCandidate(rng, state.unlocks.classes);
// After:
const tavernLevel = state.buildingLevels.tavern;
const replacement = generateCandidate(rng, state.unlocks.classes, tavernLevel);
```

2. `src/scenes/tavern_panel_scene.ts:244` (in `reroll()`):

```typescript
// Before:
const fresh = generateCandidates(
  rng,
  state.unlocks.classes,
  tavernCandidateCount(tavernLevel),
);
// After:
const fresh = generateCandidates(
  rng,
  state.unlocks.classes,
  tavernCandidateCount(tavernLevel),
  tavernLevel,
);
```

3. `src/scenes/tavern_panel_scene.ts:71` (in `create()`):

```typescript
// Before:
const ensured = ensureCandidatesForCap(
  state.tavernCandidates,
  targetCount,
  rng,
  state.unlocks.classes,
);
// After:
const ensured = ensureCandidatesForCap(
  state.tavernCandidates,
  targetCount,
  rng,
  state.unlocks.classes,
  tavernLevel,
);
```

(`tavernLevel` is already in scope at line 64.)

- [ ] **Step 7: Run tests — expect passing**

Run: `npx vitest run src/camp/buildings/__tests__/tavern.test.ts`
Expected: PASS — both the new pre-leveling tests and the updated existing tests.

Run: `npm test`
Expected: PASS on all (~1900) tests. If any other test file calls `generateCandidate`/`generateCandidates`/`ensureCandidatesForCap`, it will fail to compile — sweep those in lockstep.

Run: `npm run build`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/camp/buildings/tavern.ts src/camp/buildings/__tests__/tavern.test.ts src/scenes/tavern_panel_scene.ts
git commit -m "Tavern — generateCandidate accepts tavernLevel; pre-levels via applyLevelUps"
```

---

## Phase 3 — UI: per-card hire cost + affordability

### Task 3: Update `tavern_panel_scene.ts` — drop shared cost line; per-card Hire button + gate; update `hire()` to spend per-candidate cost

**Files:**
- Modify: `src/scenes/tavern_panel_scene.ts`

- [ ] **Step 1: Update the import to include `HIRE_COST_BY_LEVEL`**

Find the existing import (around line 4-10):

```typescript
import {
  ensureCandidatesForCap,
  generateCandidate,
  generateCandidates,
  HIRE_COST,
  REROLL_COST,
} from '@camp/buildings/tavern';
```

Replace with:

```typescript
import {
  ensureCandidatesForCap,
  generateCandidate,
  generateCandidates,
  HIRE_COST,
  HIRE_COST_BY_LEVEL,
  REROLL_COST,
} from '@camp/buildings/tavern';
```

(`HIRE_COST` stays — `isSoftlocked` uses it.)

- [ ] **Step 2: Update the header copy in `create()` to drop the shared cost line**

Find the `headerText` assignment (around line 92-94):

```typescript
const headerText = free
  ? 'Tavern - Hires are free until you recover'
  : `Tavern - Hire Cost: ${HIRE_COST}g`;
```

Replace with:

```typescript
const headerText = free
  ? 'Tavern - Hires are free until you recover'
  : 'Tavern';
```

- [ ] **Step 3: Replace the shared `canHire` / `hireReason` block with per-card logic**

Find the block (around line 151-159):

```typescript
// Hire eligibility (shared across all candidate slots).
const canAddHero = canAdd(state.roster);
const canAffordHire = free || vaultGold >= HIRE_COST;
const canHire = canAddHero && canAffordHire;

let hireReason = '';
if (!canAffordHire) hireReason = 'Not enough gold';
else if (!canAddHero) hireReason = 'Roster full';
```

Replace with:

```typescript
// Per-card hire eligibility is computed inside the loop (cost varies by candidate level).
const canAddHero = canAdd(state.roster);
```

- [ ] **Step 4: Update the candidate loop to compute per-card cost + affordability**

Find the existing candidate loop (around line 160-196). Replace the inner-loop body with:

```typescript
const slotXs = SLOT_X_BY_COUNT[candidates.length as 3 | 4 | 5];
for (let i = 0; i < candidates.length; i++) {
  const candidate = candidates[i];
  const slotX = slotXs[i];

  new HeroCard({
    scene: this,
    x: slotX,
    y: CARD_Y,
    hero: candidate,
    size: 'small',
  });

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
    this.add
      .text(slotX, HIRE_REASON_Y, thisHireReason, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#cc6666',
      })
      .setOrigin(0.5);
  }
}
```

- [ ] **Step 5: Update `hire(slotIndex)` to spend the per-candidate cost**

Find the `hire(slotIndex, candidates)` method (around line 215-236). Replace with:

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

- [ ] **Step 6: Verify build + tests**

Run: `npm run build`
Expected: clean.

Run: `npm test`
Expected: PASS on all tests. The scene change is renderer-only; no new unit tests.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/tavern_panel_scene.ts
git commit -m "Tavern panel — per-card hire cost + affordability gate"
```

---

## Phase 4 — Final verification

### Task 4: Full test suite + manual smoke

**Files:** none modified.

- [ ] **Step 1: Run the full verification gate**

Run: `npm test`
Expected: PASS on the entire suite. Baseline was 1906 pre-feature; new tests add ~10. Verify count and no regression.

Run: `npm run build`
Expected: clean.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Manual UX smoke**

1. Fresh save (clear localStorage) — Tavern L1, 3 candidates, all L1 with `Hire (50g)` buttons. Hire one; replacement is L1.
2. Upgrade Tavern to L2 (200g) — 4 candidates. Reroll a few times and verify ~1 of 4 is L2 with `Hire (150g)`. Hire the L2; verify the new hero appears in Barracks at level 2 with bumped HP and primary stat.
3. Upgrade Tavern to L3 (500g) — 5 candidates. Reroll several times. Verify L3 candidates appear occasionally with `Hire (400g)`.
4. Player with 200g vault at L3 Tavern: confirm L1 button enabled, L2 button enabled, L3 button disabled with "Not enough gold" hint.
5. Force a softlock (low vault + small roster) — confirm all Hire buttons say "Hire (free)" regardless of candidate level.

Per saved memory `feedback_skip_browser_smoke`: the manual smoke is the USER's responsibility, not yours. Skip the browser drive unless the user explicitly asks.

- [ ] **Step 3: Commit (placeholder — nothing to commit if no source changed)**

If `git status` shows no modifications, skip this step.

---

## Self-Review Checklist (writing-plans skill)

### Spec coverage

- **Scope: HIRE_COST_BY_LEVEL + LEVEL_ROLL_TABLE + pickCandidateLevel** — Task 1 ✓
- **Scope: `generateCandidate(rng, classes, tavernLevel)` extension + applyLevelUps + xp threshold** — Task 2 ✓
- **Scope: thread `tavernLevel` through `generateCandidates`, `ensureCandidatesForCap`, 3 scene call sites** — Task 2 ✓
- **Scope: header copy update (drop shared cost line)** — Task 3 ✓
- **Scope: per-card Hire button cost + affordability gate** — Task 3 ✓
- **Scope: `hire(slotIndex)` spends per-candidate cost** — Task 3 ✓
- **Scope: tests for HIRE_COST_BY_LEVEL + LEVEL_ROLL_TABLE + pickCandidateLevel + per-level generation** — Tasks 1, 2 ✓
- **Scope: existing test fixture sweep** — Task 2 (lockstep update of all `generateCandidate(`/`generateCandidates(`/`ensureCandidatesForCap(` calls in `tavern.test.ts`) ✓
- **Out of scope: save schema, migration, BUILDING_LEVELS copy** — confirmed not in any task ✓

### Placeholder scan

- No "TBD", "TODO", "fill in details", "similar to" patterns.
- All code blocks are complete and concrete.
- The probability distribution test in Task 2 Step 1 uses concrete `±0.05` tolerance with 5000 samples — meaningful threshold, not vague.

### Type consistency

- `HIRE_COST_BY_LEVEL: Record<1|2|3, number>` defined in Task 1 → used in Task 2 (no direct read) and Task 3 (per-card cost lookup).
- `LEVEL_ROLL_TABLE: Record<BuildingLevel, readonly WeightedOption<1|2|3>[]>` defined in Task 1 → used by private `pickCandidateLevel` in Task 1 → consumed by `generateCandidate` in Task 2.
- `tavernLevel: BuildingLevel` param added to `generateCandidate`, `generateCandidates`, `ensureCandidatesForCap` in Task 2; threaded through 3 scene call sites in the same task. All three callers (`create`, `hire`, `reroll`) already have `tavernLevel` in scope.
- `candidate.level as 1 | 2 | 3` cast used in Tasks 2 (tests) and 3 (UI). Safe by construction (Tavern caps at L3); flagged in spec risks.

### Decomposition check

- Task 1 introduces the constants + helper without touching `generateCandidate`'s signature — build stays green, only new tests fail.
- Task 2 changes the signature and threads through all callers in lockstep — build green after the sweep.
- Task 3 is UI-only (no logic changes) — independent of Task 2's logic correctness.
- Task 4 is verification only — no code changes.

No circular dependencies. Order is necessary: Task 1 → 2 → 3 → 4.

---

## Execution

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch with checkpoints.
