# Lost-vs-Fallen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distinguish Lost (narrative removal) from Fallen (combat death) in the run-outcome shapes. Rename `heroesLost` → `heroesFallen` on `CashoutOutcome` and `WipeOutcome`; add a new `heroesLost` field whose semantics actually match its name (sourced from `RunState.lost`). Two scene consumers update along with the rename.

**Architecture:** Single task. The interface rename ripples through `run_state.ts` (4 sites) and two scenes (3 sites total). Splitting into multiple tasks would leave tsc red between commits — better to bundle.

**Tech Stack:** TypeScript, Vitest. Touches `src/run/`, `src/scenes/` (firewall: scenes may import phaser; the run module continues not to).

**Spec:** `docs/superpowers/specs/2026-04-29-lost-vs-fallen-design.md`. Read before starting.

---

## Task 1: Interface rename + new `heroesLost` field + scene consumer updates

**Files:**
- Modify: `src/run/run_state.ts`
- Modify: `src/run/__tests__/run_state.test.ts`
- Modify: `src/scenes/dungeon_scene.ts`
- Modify: `src/scenes/camp_screen_scene.ts`

- [ ] **Step 1.1: Write failing tests for the Lost separation**

Open `src/run/__tests__/run_state.test.ts`. Add `loseHero` and `chooseCampNodeEffect` to imports if not already there (search the existing import block — they should already be imported from prior tasks).

At the end of the file, append:

```typescript
describe('cashout — Lost vs Fallen separation', () => {
  it('with one Lost hero and no fallen: heroesLost has 1, heroesFallen empty', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = loseHero(rs, 1);  // h1 is Lost
    // Force into camp_screen status without combat (synthetic — exercises cashout in isolation).
    const atCamp: ReturnType<typeof startRun> = { ...rs, status: 'camp_screen' };
    const { outcome } = cashout(atCamp);
    expect(outcome.heroesLost).toHaveLength(1);
    expect(outcome.heroesLost[0].id).toBe('h1');
    expect(outcome.heroesFallen).toHaveLength(0);
    expect(outcome.heroesReturned).toHaveLength(2);
  });

  it('with both Lost and Fallen: each outcome field carries the right hero', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    // Synthetically inject a fallen hero (mimicking what completeCombat does).
    const fallenHero = rs.party[0];
    rs = {
      ...rs,
      party: rs.party.filter((_, i) => i !== 0),
      fallen: [fallenHero],
    };
    rs = loseHero(rs, 0);  // the next hero (was h1) becomes Lost
    const atCamp: ReturnType<typeof startRun> = { ...rs, status: 'camp_screen' };
    const { outcome } = cashout(atCamp);
    expect(outcome.heroesFallen).toHaveLength(1);
    expect(outcome.heroesFallen[0].id).toBe('h0');
    expect(outcome.heroesLost).toHaveLength(1);
    expect(outcome.heroesLost[0].id).toBe('h1');
    expect(outcome.heroesReturned).toHaveLength(1);
    expect(outcome.heroesReturned[0].id).toBe('h2');
  });

  it('with no losses: both heroesFallen and heroesLost are empty', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const atCamp: ReturnType<typeof startRun> = { ...rs, status: 'camp_screen' };
    const { outcome } = cashout(atCamp);
    expect(outcome.heroesFallen).toEqual([]);
    expect(outcome.heroesLost).toEqual([]);
    expect(outcome.heroesReturned).toHaveLength(3);
  });
});

describe('completeCombat wipe — Lost vs Fallen separation', () => {
  it('with a pre-Lost hero, the wipe carries them in heroesLost (not heroesFallen)', () => {
    let rs = startRun('crypt', makeParty(), 1, createRng(1));
    rs = loseHero(rs, 1);  // h1 is Lost mid-run
    expect(rs.party).toHaveLength(2);
    expect(rs.lost).toHaveLength(1);
    // Trigger a wipe (defeat outcome — all remaining party dies).
    const wipeResult = mockCombatResult(rs.party, rs.party.map(() => 0), 'player_defeat');
    const { wipe } = completeCombat(rs, wipeResult, createRng(99));
    expect(wipe).toBeDefined();
    // heroesFallen contains the wiped party; heroesLost contains the previously-Lost hero.
    expect(wipe!.heroesLost).toHaveLength(1);
    expect(wipe!.heroesLost[0].id).toBe('h1');
    const fallenIds = wipe!.heroesFallen.map((h) => h.id);
    expect(fallenIds).toContain('h0');
    expect(fallenIds).toContain('h2');
    expect(fallenIds).not.toContain('h1');
  });

  it('with no Lost heroes: wipe.heroesLost is empty array', () => {
    const rs = startRun('crypt', makeParty(), 1, createRng(1));
    const wipeResult = mockCombatResult(rs.party, [0, 0, 0], 'player_defeat');
    const { wipe } = completeCombat(rs, wipeResult, createRng(99));
    expect(wipe).toBeDefined();
    expect(wipe!.heroesLost).toEqual([]);
    expect(wipe!.heroesFallen).toHaveLength(3);
  });
});
```

- [ ] **Step 1.2: Run the failing tests**

Run: `npx vitest run src/run/__tests__/run_state.test.ts -t 'Lost vs Fallen separation'`

Expected: FAIL — `heroesFallen` doesn't exist on the outcome types yet (TS compile error or runtime undefined access).

- [ ] **Step 1.3: Update `CashoutOutcome` and `WipeOutcome` interfaces**

Open `src/run/run_state.ts`. Find the interfaces (around lines 28-39):

```typescript
export interface CashoutOutcome {
  goldBanked: number;
  itemsBanked: readonly Item[];
  heroesReturned: readonly Hero[];
  heroesLost: readonly Hero[];
}

export interface WipeOutcome {
  packLost: Pack;
  heroesLost: readonly Hero[];
}
```

Replace with:

```typescript
export interface CashoutOutcome {
  goldBanked: number;
  itemsBanked: readonly Item[];
  heroesReturned: readonly Hero[];
  heroesFallen: readonly Hero[];   // died in combat this run
  heroesLost: readonly Hero[];     // narratively Lost via event/hazard during this run
}

export interface WipeOutcome {
  packLost: Pack;
  heroesFallen: readonly Hero[];   // died in combat (including the wiping fight)
  heroesLost: readonly Hero[];     // narratively Lost prior to the wipe
}
```

- [ ] **Step 1.4: Update `cashout` populating site**

Find `cashout` (around line 295). The existing `outcome` literal:

```typescript
const outcome: CashoutOutcome = {
  goldBanked: totalGold(runState.pack),
  itemsBanked: runState.pack.items,
  heroesReturned: runState.party,
  heroesLost: runState.fallen,
};
```

Replace with:

```typescript
const outcome: CashoutOutcome = {
  goldBanked: totalGold(runState.pack),
  itemsBanked: runState.pack.items,
  heroesReturned: runState.party,
  heroesFallen: runState.fallen,
  heroesLost: runState.lost,
};
```

- [ ] **Step 1.5: Update `completeCombat` wipe populating site**

Find the wipe construction in `completeCombat` (around line 187):

```typescript
const wipe: WipeOutcome = { packLost: runState.pack, heroesLost: allLost };
```

Replace with:

```typescript
const wipe: WipeOutcome = {
  packLost: runState.pack,
  heroesFallen: allLost,
  heroesLost: runState.lost,
};
```

The local `allLost` variable name stays — it correctly describes "everyone who fell in combat by run-end" (collected from `runState.fallen`, `newFallen`, and `updatedPartyLiving`).

- [ ] **Step 1.6: Update `dungeon_scene.ts` consumers**

Open `src/scenes/dungeon_scene.ts`. Find line 537 (wipe panel iteration):

```typescript
for (const hero of wipe.heroesLost) {
```

Replace with:

```typescript
for (const hero of wipe.heroesFallen) {
```

Find line 567 + 571 (the lost-id set + its downstream use):

```typescript
const lostIds = new Set(this.wipeOutcome!.heroesLost.map((h) => h.id));
```

Replace with:

```typescript
const fallenIds = new Set(this.wipeOutcome!.heroesFallen.map((h) => h.id));
```

Then line 571:

```typescript
for (const id of lostIds) {
```

Replace with:

```typescript
for (const id of fallenIds) {
```

- [ ] **Step 1.7: Update `camp_screen_scene.ts` consumer**

Open `src/scenes/camp_screen_scene.ts`. Find line 159:

```typescript
const fallenIds = new Set(outcome.heroesLost.map((h) => h.id));
```

Replace with:

```typescript
const fallenIds = new Set(outcome.heroesFallen.map((h) => h.id));
```

(The local var name `fallenIds` was already correct — only the field source changes.)

- [ ] **Step 1.8: Run the full suite and tsc**

Run: `npm test && npx tsc --noEmit`

Expected: PASS / green. Total = baseline + 5 (the new tests added in step 1.1).

- [ ] **Step 1.9: Smoke-check determinism (run twice)**

Run: `npm test` again.

Expected: identical pass count, identical seed-bound outputs.

- [ ] **Step 1.10: Commit**

```bash
git add src/run/run_state.ts src/run/__tests__/run_state.test.ts src/scenes/dungeon_scene.ts src/scenes/camp_screen_scene.ts
git commit -m "feat(run): split heroesFallen vs heroesLost in CashoutOutcome / WipeOutcome"
```

---

## Closing checklist

- [ ] **Task landed in 1 commit**, with green tests and green tsc.
- [ ] **No imports of `phaser`** under `src/run/`. Verify via:
  ```bash
  grep -r "from 'phaser'" src/run || echo "OK — no phaser imports"
  ```
  Expected output: `OK — no phaser imports`.
- [ ] **gdd.md** is the design source of truth for the Lost-vs-Fallen distinction (§8).
- [ ] **Out-of-scope follow-ups** the spec called out:
  - Cluster B · 11 — visual rendering of the Lost / Fallen split in cashout / wipe panels ("X was Lost" vs "X Fell"). Now that the outcome data carries the distinction, scene work is unblocked.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster A · 15 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commit, awaiting user direction per CLAUDE.md.

**Test count delta from baseline:** +5 (3 cashout tests + 2 wipe tests).
