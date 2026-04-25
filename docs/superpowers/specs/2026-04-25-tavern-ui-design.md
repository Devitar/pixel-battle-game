# Tavern UI (Tier 1)

**Status:** Design · **Date:** 2026-04-25 · **Source TODO:** Cluster B, task 13

## Purpose

Replace task 12's `TavernPanelScene` stub with the real Tavern UI: 3 candidate `HeroCard`s + hire button each, panel HUD showing vault gold + roster size, atomic hire flow that updates `AppState`. First real consumer of `HeroCard` (task 11) and the most-touched gameplay surface in Cluster B's camp loop.

## Dependencies and invariants

**Vocabulary from prior tasks:**
- `HeroCard` (task 11) — large variant used here.
- `appState` singleton (task 10), `appState.update(producer)` for atomic state changes with auto-save.
- `generateCandidate`, `generateCandidates`, `HIRE_COST`, `TAVERN_CANDIDATE_COUNT` (task 8).
- `addHero`, `canAdd`, `listHeroes` (task 7).
- `balance`, `spend` (task 7).
- `createRng` (task 1, extended task 9).
- `Phaser.Scenes.Events.RESUME` event for camp HUD refresh (task 12).

**New invariants this spec declares:**
- **Candidates regenerate on every panel open.** No persistent tavern state in SaveFile. Closing + reopening produces fresh candidates. The "no reroll" rule from GDD §10 is preserved as "no reroll button," not "fixed-across-sessions candidates." Tier 2 may persist candidates if a paid reroll system arrives.
- **Hire is one atomic `appState.update`.** Spend gold + add hero in a single producer call so the update is all-or-nothing and the auto-save reflects the consistent post-hire state.
- **Per-slot re-roll on hire.** Hiring slot N replaces `candidates[N]` with a freshly-rolled Hero. Other slots are untouched.
- **Buttons + footer refresh after every state-changing action.** `refreshButtons()` and `refreshFooter()` re-read `appState.get()` and update Phaser objects in place. No reactive subscription — explicit calls after `hire()` and on scene `create()`.
- **Gold-first reason ordering.** When both gold and roster cap would block a hire, the button shows "Not enough gold." Players can refill gold faster than freeing roster slots; the gold reason is the more actionable one.
- **`unlocks.classes` from `appState`** is the source of truth for the candidate pool. Tier 1 is always `['knight', 'archer', 'priest']`; Tier 2+ unlocks add to it without code changes here.

## Module layout

| Path | Create / Modify | Responsibility |
|---|---|---|
| `src/scenes/tavern_panel_scene.ts` | **Rewrite** | Replace task 12's stub. 3 candidate columns, hire flow, panel HUD. |

Single-file modification. The stub's `close()` mechanism + ESC key + × button stay unchanged — the rewrite preserves them and adds the real `create()` body.

**Imports:** phaser, `appState`, `generateCandidate` / `generateCandidates` / `HIRE_COST` from camp/buildings/tavern, `addHero` / `canAdd` / `listHeroes` from camp/roster, `balance` / `spend` from camp/vault, `HeroCard` from `../ui/hero_card`, `createRng` from `../util/rng`, `Hero` type, `Rng` type.

## Layout (panel coordinates inside 960×540 viewport)

| Element | Position | Size | Notes |
|---|---|---|---|
| Overlay | (0, 0) | 960×540, alpha 0.6 black | dims camp underneath |
| Panel rectangle | center (480, 270) | 920×340 | `#222222` fill, `#666666` 2px border |
| Title | center (480, 110) | text 20px | `Tavern · Hire Cost: 50g` |
| Card slot 1 | center (170, 230) | 280×120 (large HeroCard) | column anchor |
| Card slot 2 | center (480, 230) | 280×120 | |
| Card slot 3 | center (790, 230) | 280×120 | |
| Hire button bg | center per slot, y=320 | 120×30 rectangle | green/gray per state |
| Hire button label | same center | 14px text | `Hire (50g)` |
| Reason text | center per slot, y=345 | 11px text, color `#cc6666` | shown only when disabled |
| Footer HUD | center (480, 415) | 13px text | `Vault: Ng · Roster: M / 12` |
| Close × | (933, 113) | 28×28 (from stub) | top-right of panel |

The 280px-wide cards in slots 1/2/3 with centers at x=170/480/790 give 30px gaps between cards. Panel spans x=20–x=940; cards (x=30–x=930 across all three) sit inside with 10px clearance on each side.

## Scene-local state

```ts
private candidates: Hero[] = [];
private rng!: Rng;
private hireButtons: HireButton[] = [];
private footerText!: Phaser.GameObjects.Text;

interface HireButton {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  reason: Phaser.GameObjects.Text;
  card: HeroCard;
}
```

`HireButton` is a private interface tying together the four objects per slot so `refreshButtons()` can update them in lock-step.

## `create()` flow

1. Build overlay + panel rectangle + title (panel chrome).
2. `this.rng = createRng(Date.now())`.
3. `this.candidates = generateCandidates(this.rng, appState.get().unlocks.classes)`.
4. Build 3 candidate columns (HeroCard + hire button + reason text per slot) via `buildSlot(0, 170)`, `buildSlot(1, 480)`, `buildSlot(2, 790)`.
5. Build footer HUD text.
6. `refreshButtons()` and `refreshFooter()` — set initial states.
7. Build close × button + ESC key handler (preserved from stub).

## `hire(slotIndex: number)`

```ts
private hire(slotIndex: number): void {
  const state = appState.get();
  if (!canAdd(state.roster) || balance(state.vault) < HIRE_COST) return;

  const hired = this.candidates[slotIndex];
  appState.update((s) => ({
    ...s,
    vault: spend(s.vault, HIRE_COST),
    roster: addHero(s.roster, hired),
  }));

  this.candidates[slotIndex] = generateCandidate(this.rng, appState.get().unlocks.classes);
  this.hireButtons[slotIndex].card.setHero(this.candidates[slotIndex]);
  this.refreshButtons();
  this.refreshFooter();
}
```

**Race-condition note.** Single-threaded JavaScript; no async between the affordability check and the update. Even rapid double-clicks behave correctly because the second invocation re-reads `appState.get()` after the first's update.

## `refreshButtons()`

```ts
private refreshButtons(): void {
  const state = appState.get();
  const gold = balance(state.vault);
  const canAddHero = canAdd(state.roster);
  const canAfford = gold >= HIRE_COST;
  const enabled = canAddHero && canAfford;

  let reason = '';
  if (!canAfford) reason = 'Not enough gold';
  else if (!canAddHero) reason = 'Roster full';

  for (const btn of this.hireButtons) {
    if (enabled) {
      btn.bg.setFillStyle(0x2a4a2a).setStrokeStyle(2, 0x44cc44);
      btn.label.setColor('#ffffff');
    } else {
      btn.bg.setFillStyle(0x333333).setStrokeStyle(2, 0x555555);
      btn.label.setColor('#777777');
    }
    btn.reason.setText(reason);
  }
}
```

All three buttons share the same enabled-state at any moment (vault gold and roster cap are global, not per-candidate). The loop applies the same style across all three.

## `refreshFooter()`

```ts
private refreshFooter(): void {
  const state = appState.get();
  const gold = balance(state.vault);
  const heroes = listHeroes(state.roster).length;
  const cap = state.roster.capacity;
  this.footerText.setText(`Vault: ${gold}g · Roster: ${heroes} / ${cap}`);
}
```

## Hire button colors

- **Enabled:** fill `#2a4a2a`, border `#44cc44`, label `#ffffff`.
- **Disabled:** fill `#333333`, border `#555555`, label `#777777`.

Reason text always uses color `#cc6666`; emptied to `''` when enabled.

## Tests

### Unit tests: none

Phaser glue. The pure-logic operations (`generateCandidate`, `addHero`, `spend`, `canAdd`, `balance`) are already tested in tasks 7 and 8. The `hire()` method is a 4-line composition.

### Smoke test (manual, dev server)

`npm run dev`:

1. **Initial state.** From a fresh save: vault 0g, roster 3.
2. **Click Tavern.** Panel opens with title `Tavern · Hire Cost: 50g`. Three candidates rendered with paperdoll/name/class/HP bar/stats/trait. Footer reads `Vault: 0g · Roster: 3 / 12`.
3. **All buttons gray with "Not enough gold."** Click does nothing.
4. **Set vault gold to 200 in DevTools** (`pixel-battle-game/save` → `vault.gold = 200`), reload.
5. **Open Tavern.** Buttons now green; no reason text.
6. **Click Hire on candidate 1.** Card 1 changes to a fresh hero. Footer: `Vault: 150g · Roster: 4 / 12`. Buttons remain green.
7. **Continue hiring** until vault depleted. Buttons gray with "Not enough gold."
8. **Set vault to 5000 in DevTools, reload.** Open Tavern. Hire repeatedly until roster reaches 12. Buttons gray with "Roster full" (gold-first reason: with plenty of gold, cap is the actual blocker).
9. **Press ESC** to close. Camp HUD updates to reflect post-Tavern state via `RESUME` event from task 12.
10. **Reopen Tavern.** Fresh candidates appear.
11. **Inspect localStorage.** Hired heroes are in `roster.heroes`; vault.gold reflects spend.

### Automated checks

- `npx tsc --noEmit` clean.
- `npm test` — existing 481 tests pass; no new tests.
- `npm run build` succeeds.

## Risks and follow-ups

- **No reroll button.** Tier 1 has implicit "free reroll" via close+reopen. Players who notice this will exploit it. Tier 2's paid reroll button + cost addresses it directly.
- **Candidates lost on page refresh.** A player mid-Tavern who refreshes loses the current 3. Acceptable for Tier 1; if Tier 2 persists candidates in SaveFile (schema bump), the migration trivially adds `tavernCandidates: undefined`.
- **No animation on hire.** Card pop-in/out tween would feel polished. Tier 2 polish.
- **Same-RNG-across-rolls** means hire-then-rehire produces the next state in the deterministic stream. If we want explicit "always varied" behavior, swap to a fresh `Date.now()` RNG per hire — but that's noisier and the current behavior is already varied enough.
- **No "preview class flavor" UI.** New players can't tell what Knight vs Archer vs Priest does without metagame knowledge. Tier 2 may add a tooltip on hover or a "what does this class do?" sidebar.
- **No per-candidate price differentiation.** Tier 2 may price by trait rarity or class.
- **Hire button uses one shared enabled-state across all 3 slots.** All three light up or gray out together because the gating is global (vault gold + roster cap). If Tier 2 introduces per-candidate prices or class-specific cap rules, the loop becomes per-button.
- **No keyboard shortcuts for hire** (e.g., 1/2/3 to hire each candidate). Mouse only. Defensible — the action is destructive (gold spend, permanent roster change) and benefits from a deliberate click. ESC still closes.
- **Re-roll on hire uses `appState.get().unlocks.classes` rather than caching the value at scene create.** Reads on every hire, but cheap (one record access). If Tier 3 ever exposes mid-Tavern unlocks that should affect the next roll, this is correct; if not, no harm.
- **Footer HUD lives inside the panel** while the camp HUD lives outside. Two HUDs is mildly redundant but each has its own context; the panel's footer is the actionable one (informs hire decisions in real time), the camp's HUD is the persistent one.
