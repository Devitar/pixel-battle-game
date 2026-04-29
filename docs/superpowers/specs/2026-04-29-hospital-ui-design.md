# Hospital building UI — Design

- **TODO entry:** Cluster B · 1 (Hospital building).
- **Tier:** 2.
- **Date:** 2026-04-29.

## 1 · Scope

Add a Hospital scene/screen to the camp hub. Player clicks the Hospital tile, sees a list of wounded heroes on the left, the selected hero's wounds on the right with a Treat button per wound. Treat spends vault gold (`HOSPITAL_TREATMENT_COST = 40`) and removes the wound. Pattern-consistent with `barracks_panel_scene.ts` (left list / right detail).

The wound data layer (Cluster A · 3) is fully shipped: `treatHeroWound`, `updateHero`, `WOUNDS` table, the `Wound` type, and the cost constant. This task is UI only, plus one small data-layer helper (`describeWoundEffect`) that Cluster B · 9 will reuse.

**Out of scope:**

- Hospital level / quota cost model from gdd §6 (1-wound-cheap, 2 cheap at L2, etc.) — Tier 3 scope; flat per-wound cost stays.
- Wound display elsewhere (hero cards, Barracks detail) — Cluster B · 9.
- Building upgrades — separate task when building upgrades land.

## 2 · Camp scene — add Hospital tile

`src/scenes/camp_scene.ts`'s `create()` currently calls `buildBuilding` three times (Tavern, Barracks, Noticeboard). Add a 4th between Barracks and Noticeboard:

```ts
this.buildBuilding('Tavern',     180, 0x664433, 100, 110, 'tavern_panel');
this.buildBuilding('Barracks',   440, 0x555555, 100, 130, 'barracks_panel');
this.buildBuilding('Hospital',   580, 0x885566, 100, 100, 'hospital_panel');  // NEW
this.buildBuilding('Noticeboard',720, 0x998866,  80,  60, 'noticeboard_panel');
```

`x=580` slots cleanly between Barracks (440) and Noticeboard (720). Color `0x885566` (muted rose) reads as "medical/blood" without screaming. Width/height matches Barracks visual scale.

## 3 · `hospital_panel` scene structure

New `src/scenes/hospital_panel_scene.ts`. Mirrors the layout constants from `barracks_panel_scene.ts`:

- **Overlay + bordered panel** (`PANEL_CX/CY/W/H` = 480, 270, 920, 460).
- **Title** at top: `Hospital · {N wounded}` (count of heroes with `wounds.length > 0`).
- **Vault gold display** at top-right of the title bar (e.g., `Gold: 240`).
- **Left pane** (`LIST_PANE_CX = 245, LIST_PANE_W = 380, LIST_PANE_H = 360`): vertical list of *only* wounded heroes. Each entry is a `HeroCard` (small) with the hero's wound count subtitle (e.g., "2 wounds").
- **Right pane** (`DETAIL_PANE_CX = 715, DETAIL_PANE_W = 440, DETAIL_PANE_H = 360`): selected hero's wound list — one row per wound with name, effect description, cost, and Treat button.
- **Close button** (× at panel top-right, ESC keybind) — dismiss returns to camp via `scene.stop()` + `scene.resume('camp')`.

Class registers as `'hospital_panel'` in the Phaser scene config and is added to `src/main.ts`'s scene list.

## 4 · Wound row in detail pane

Each wound row (~50px tall) renders horizontally:

```
┌──────────────────────────────────────────────────────┐
│  Bruised      +20% damage taken          40g  [Treat] │
└──────────────────────────────────────────────────────┘
```

- **Wound name** — `WOUNDS[id].name`.
- **Effect description** — `describeWoundEffect(WOUNDS[id].effect)` (new helper, see §6).
- **Cost** — `HOSPITAL_TREATMENT_COST` formatted as `40g`. Constant per wound.
- **Treat button** — interactive when `vault.gold >= cost`; greyed otherwise. Hover stroke = gold. Click stroke = brief flash, then rebuild.

Stack vertically inside the right pane with a small gap; wounds always fit because heroes can carry up to ~3-4 wounds in practice.

## 5 · Treat interaction

On Treat click for `(heroId, woundIndex)`:

```ts
const state = appState.get();
const hero = getHero(state.roster, heroId);
if (!hero) return;
const cost = HOSPITAL_TREATMENT_COST;
if (balance(state.vault) < cost) return;  // defensive — button should be disabled

const treatedHero = treatHeroWound(hero, woundIndex);
const newRoster = updateHero(state.roster, treatedHero);
const newVault = spend(state.vault, cost);

appState.update((s) => ({ ...s, roster: newRoster, vault: newVault }));

this.rebuild();
```

The whole panel rebuilds after a treat to keep state consistent (cheap; matches the simple "redraw on change" pattern used elsewhere).

## 6 · `describeWoundEffect` helper

Add to `src/data/wounds.ts` (pure data-layer function, no Phaser dependency):

```ts
export function describeWoundEffect(effect: WoundEffect): string {
  if (effect.kind === 'statDelta') {
    const sign = effect.delta >= 0 ? '+' : '';
    const statName = effect.stat === 'hp' ? 'Max HP' : capitalize(effect.stat);
    return `${sign}${effect.delta} ${statName}`;
  }
  // damageTakenMult
  const pct = Math.round((effect.multiplier - 1) * 100);
  return `+${pct}% damage taken`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

Cluster B · 9 (Wound display on hero card + Barracks) reuses the same helper.

**Expected outputs for the 6 existing wounds:**

| Wound id | Effect | Description |
|---|---|---|
| `bruised` | damageTakenMult 1.20 | `+20% damage taken` |
| `hobbled` | statDelta speed -2 | `-2 Speed` |
| `concussed` | statDelta mind -2 | `-2 Mind` |
| `winded` | statDelta attack -2 | `-2 Attack` |
| `unsteady` | statDelta crit -5 | `-5 Crit` |
| `broken_bone` | statDelta hp -10 | `-10 Max HP` |

## 7 · Empty-state and selection logic

- **No wounded heroes initially:** title `Hospital · 0 wounded`; list pane shows "All heroes are healthy" (centered text); detail pane is empty.
- **Selected hero treats their last wound:** the panel rebuild re-filters the wounded list, so the just-treated hero drops out. `selectedHeroId` is set to `wounded[0]?.id ?? null` on each rebuild — so a fresh selection happens automatically.
- **Insufficient gold for any wound:** Treat buttons greyed; player can browse but not treat. Vault display shows current balance.
- **All heroes treated mid-session:** title updates to `0 wounded`; right pane returns to empty.

## 8 · Files touched

| File | Change |
|---|---|
| `src/data/wounds.ts` | Add `describeWoundEffect(effect): string` exported helper. |
| `src/data/__tests__/wounds.test.ts` | **New.** Tests for `describeWoundEffect` covering all 6 wound effects. |
| `src/scenes/camp_scene.ts` | Add `'Hospital'` `buildBuilding` call between Barracks and Noticeboard. |
| `src/scenes/hospital_panel_scene.ts` | **New.** The Hospital scene class. |
| `src/main.ts` | Import `HospitalPanelScene`; add to scene list (alongside `BarracksPanelScene` etc.). |

## 9 · Test plan

**Data layer (`src/data/__tests__/wounds.test.ts` — new):**

- `describeWoundEffect` for `bruised` → `'+20% damage taken'`.
- `describeWoundEffect` for `hobbled` → `'-2 Speed'`.
- `describeWoundEffect` for `concussed` → `'-2 Mind'`.
- `describeWoundEffect` for `winded` → `'-2 Attack'`.
- `describeWoundEffect` for `unsteady` → `'-5 Crit'`.
- `describeWoundEffect` for `broken_bone` → `'-10 Max HP'`.

**Scene layer:** No unit tests (Phaser convention; see prior scene-task HISTORY entries). Acceptance via tsc-green + the existing scene patterns. Manual play verification:

- Hospital tile is clickable on camp; opens the panel.
- Wounded hero list renders only heroes with `wounds.length > 0`.
- Selecting a wounded hero shows their wounds in the right pane.
- Clicking Treat with sufficient gold: removes the wound, deducts gold, rebuilds.
- Clicking Treat with insufficient gold: no-op (button greyed).
- Treating the last wound on a hero removes them from the list.
- Empty state ("All heroes are healthy") renders when no heroes are wounded.
- ESC and × close the panel back to camp.

## 10 · Save schema

No schema change. Vault and roster are existing persisted state; their existing operations (`spend`, `updateHero`) are reused.

## 11 · Open questions

None. Numerical knob `HOSPITAL_TREATMENT_COST = 40` already lives in `data/wounds.ts` — tunable from a single point if balance shifts.
