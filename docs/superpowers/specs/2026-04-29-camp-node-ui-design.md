# Camp node UI — Design

- **TODO entry:** Cluster B · 4 (Camp node UI — mid-floor).
- **Tier:** 2.
- **Date:** 2026-04-29.

## 1 · Scope

Replace the auto-leave stub at `src/scenes/dungeon_scene.ts:249-269` with a launchable overlay scene (`camp_node_overlay`) that lets the player pick from three actions: **Heal Party**, **Treat Wound**, **Leave Dungeon**. Three states inside one scene with content swapping in place — pattern-consistent with shop_overlay.

The data layer is fully shipped (Cluster A · 11): `chooseCampNodeEffect(rs, choice, rng)` handles all three effects and returns `{ runState, outcome? }` (outcome populated for `leave` via cashout).

**Out of scope:**

- Sharpen weapons effect (deferred from Cluster A · 11; no temp-buff mechanic exists).
- Cosmetic / tonal flourishes beyond plain monospace text.
- Animation between state swaps.
- Per-cashout summary scene before returning to camp (player sees results on the camp hub).

## 2 · Overlay scene structure

New `src/scenes/camp_node_overlay_scene.ts`:

- **Dimming overlay** + bordered panel (`PANEL_CX=480, CY=270, W=540, H=380`).
- **Title** at top: state-dependent (`Camp` / `Camp · Treat Wound` / `Camp · Leave Dungeon`).
- **Back button** (top-right) shown in sub-states; closes back to default `main` state.
- **Content container** that gets cleared and rebuilt on state transitions.
- **State machine** local to the scene: `'main' | 'treat_picker' | 'leave_confirm'`.

Class registers as `'camp_node_overlay'` and is added to `main.ts`'s scene list.

## 3 · State: `main` (default)

Three vertical option buttons stacked center-panel. Each button is a clickable rect (~400×60) with two text rows (label + short description):

```
  ┌──────────────────────────────────┐
  │  Heal Party                      │
  │  Each hero recovers 25% maxHp    │
  └──────────────────────────────────┘
  ┌──────────────────────────────────┐
  │  Treat Wound                     │
  │  Heal one wound on one hero      │
  └──────────────────────────────────┘
  ┌──────────────────────────────────┐
  │  Leave Dungeon                   │
  │  Bank pack and return to camp    │
  └──────────────────────────────────┘
```

**Disabled states (button greyed, non-interactive):**

- **Treat Wound** disabled when no party hero has wounds (computed: `party.every(h => h.wounds.length === 0)`).
- **Heal Party** never disabled (effect is no-op if everyone is at full HP — that's fine).
- **Leave Dungeon** never disabled.

**Click behaviour:**

- **Heal Party** → call `chooseCampNodeEffect(run, { kind: 'heal_party' }, rng)`, persist new RunState + rng state, close overlay (`scene.stop()` + `scene.resume('dungeon')`). Dungeon's existing RESUME handler walks to the next node.
- **Treat Wound** → swap content to `'treat_picker'` state.
- **Leave Dungeon** → swap content to `'leave_confirm'` state.

## 4 · State: `treat_picker`

Title: `Camp · Treat Wound` + Back button (top-right; click → swap back to `main`).

Body: vertical list of every (hero, wound) pair across the party. Each row (~50px tall):

```
  ┌──────────────────────────────────────────────┐
  │  Knight    Bruised — +20% damage taken       │
  │            [Treat]                           │
  └──────────────────────────────────────────────┘
```

- Top row: hero name + wound name.
- Bottom row: effect description via `describeWoundEffect(WOUNDS[id].effect)` (shipped in Hospital task).
- Treat button on the right of each row.

**Click Treat** → call `chooseCampNodeEffect(run, { kind: 'treat_wound', heroIndex, woundIndex }, rng)`, persist new RunState + rng, close overlay, dungeon walks to next.

**Empty state** (defensive — `main` state's disabled gate should prevent entry): "No wounds to treat." centered, with just the Back button.

The (hero, wound) pair list iterates `runState.party` in slot order; for each hero, iterate `hero.wounds` in array order.

## 5 · State: `leave_confirm`

Title: `Camp · Leave Dungeon` + Back button (top-right; click → swap back to `main`).

Body: a preview of what banking will yield, computed from current `runState`:

```
  Bank 175g and 3 items.
  3 heroes return safe.
  (1 hero was Lost.)              ← only shown if runState.lost.length > 0

         ┌─────────────────────┐
         │   Confirm Leave     │
         └─────────────────────┘
```

Preview values are read directly from `runState` (gold from `pack.gold`, item count from `pack.items.length`, surviving count from `party.length`, Lost count from `lost.length`). These match exactly what `cashout()` will populate into `CashoutOutcome` because that function reads the same fields.

**Click Confirm Leave** → call `chooseCampNodeEffect(run, { kind: 'leave' }, rng)` (status becomes `'ended'`), persist updated app state (vault credited, stash updated, roster restored), then transition:

```ts
this.scene.stop();              // camp_node_overlay
this.scene.stop('dungeon');     // dungeon scene
this.scene.start('camp');       // main camp hub
```

The player lands on the camp hub with the new vault balance and stash visible.

**Persisting the cashout outcome:** the `chooseCampNodeEffect` returns `{ runState, outcome }`. The outcome contains `goldBanked`, `itemsBanked`, `heroesReturned`, `heroesFallen`, `heroesLost`. The overlay must apply these to persistent state — **mirror exactly the existing `camp_screen_scene.ts:onLeave` pattern** for consistency:

```ts
const fallenIds = new Set(outcome.heroesFallen.map((h) => h.id));

appState.update((s) => {
  const vault = credit(s.vault, outcome.goldBanked);
  const stash = addItems(s.stash, outcome.itemsBanked);
  let roster = s.roster;
  for (const survivor of outcome.heroesReturned) {
    if (roster.heroes.some((h) => h.id === survivor.id)) {
      roster = updateHero(roster, survivor);  // preserves HP/XP changes from the run
    }
  }
  for (const id of fallenIds) {
    if (roster.heroes.some((h) => h.id === id)) {
      roster = removeHero(roster, id);
    }
  }
  roster = tickRosterWounds(roster);  // age existing wounds by 1 run
  return {
    ...s,
    vault,
    stash,
    roster,
    runState: undefined,
    runRngState: undefined,
  };
});
```

**Lost-hero roster handling is intentionally absent**, mirroring the existing camp_screen flow. Lost-hero roster removal is a Cluster B · 11 concern that will land in both call sites consistently. For Tier 2 ship: a Lost hero stays in the roster (latent bug; flagged in B · 11 acceptance).

## 6 · Dungeon-scene change

Replace the auto-leave stub at `src/scenes/dungeon_scene.ts:249-269`:

```ts
if (node.type === 'camp') {
  this.scene.launch('camp_node_overlay');
  this.scene.pause();
  return;
}
```

The dungeon's existing `RESUME` handler advances to the next node, matching the shop overlay flow.

## 7 · RNG threading

Camp effects use the run RNG. The overlay reads `runRngState` from `appState`, builds an `Rng`, passes to `chooseCampNodeEffect`, persists `rng.getState()` back. Same pattern as the existing stub.

## 8 · Layout constants

Inside `camp_node_overlay_scene.ts`:

```ts
const PANEL_CX = 480;
const PANEL_CY = 270;
const PANEL_W = 540;
const PANEL_H = 380;

const TITLE_Y = 110;
const BACK_X = 720;
const BACK_Y = 110;

// Main state
const OPTION_X = PANEL_CX;
const OPTION_W = 400;
const OPTION_H = 60;
const OPTION_Y_BASE = 175;
const OPTION_STRIDE = 70;

// Treat picker
const WOUND_ROW_X = PANEL_CX;
const WOUND_ROW_W = 460;
const WOUND_ROW_H = 50;
const WOUND_ROW_Y_BASE = 175;
const WOUND_ROW_STRIDE = 56;

// Leave confirm
const PREVIEW_Y = 180;
const PREVIEW_LINE_HEIGHT = 22;
const CONFIRM_BUTTON_Y = 320;
const CONFIRM_BUTTON_W = 200;
const CONFIRM_BUTTON_H = 36;
```

## 9 · Files touched

| File | Change |
|---|---|
| `src/scenes/camp_node_overlay_scene.ts` | **New.** The 3-state camp overlay scene. |
| `src/scenes/dungeon_scene.ts` | Replace auto-leave stub at lines 249-269 with `scene.launch('camp_node_overlay') + scene.pause()`. |
| `src/main.ts` | Register `CampNodeOverlayScene` in the scene list (alongside `ShopOverlayScene`). |

## 10 · Test plan

No unit tests (Phaser scene convention; matches Hospital and other scene tasks).

**Acceptance:**

- `npx tsc --noEmit` green.
- `npm run build` succeeds.
- Existing test suite stays green (no behavioral change to data layer).

**Manual play verification:**

- Reach a camp-bearing fork (1/3 of floors per current RNG; visible as 🏕 glyph in dungeon icon row). Pick the camp branch.
- Default view shows 3 buttons. Treat Wound is greyed if no party member has wounds.
- Heal Party click: party HP visibly restores; overlay closes; party walks to boss.
- Treat Wound (with wound): list shows wound rows; click Treat removes the wound from that hero, closes, advances.
- Leave Dungeon: confirmation panel shows current pack + party preview; Confirm banks the run and lands on main camp with vault updated and stash showing the items.
- Back from Treat / Leave returns to main state without applying changes.

## 11 · Save schema

No change. RunState is mutated through existing `chooseCampNodeEffect`; vault / stash / roster are updated through existing operations (`credit`, `addItems`, `removeHero`).

## 12 · Open questions

None at design time.
