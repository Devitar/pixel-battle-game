# Wound display on HeroCard + Barracks — Design

- **TODO entry:** Cluster B · 9 (Wound display on hero card + Barracks).
- **Tier:** 2.
- **Date:** 2026-04-29.

## 1 · Scope

Two scene-layer additions:

- **HeroCard:** `🩸 N` badge in the top-right corner when `hero.wounds.length > 0`. Hidden when no wounds, and suppressed when `isDead === true`.
- **Barracks detail pane:** "WOUNDS" section between the trait line and the ABILITIES header, listing each wound's name + stat-effect description.

Reuses `describeWoundEffect` from `src/data/wounds.ts` (shipped with Cluster B · 1 Hospital UI). No data layer changes.

**Out of scope:**

- Wound display on combat-scene actor portraits (would need a separate task; combat HUD is its own thing).
- Wound display on the Tavern/recruit pane (recruits are unwounded by definition; the badge naturally hides).
- Per-wound treatment shortcut from the badge (Hospital is a separate scene).
- Per-wound stat-delta math beyond the existing `describeWoundEffect` output.

## 2 · HeroCard badge

`src/ui/hero_card.ts`. Add a wound badge at the top-right corner of both small and large cards. Visible only when `hero.wounds.length > 0`. Render inside `buildChildren` after the existing children so it sits on top of the card background.

**Coordinates:**

- Small card (180×60): badge at `(75, -22)` — ~15px from the right edge, 8px from the top.
- Large card (280×120): badge at `(125, -48)` — same relative offset.

Both anchor to top-right via `setOrigin(1, 0.5)`.

**Code (inserted near the end of `buildChildren`, before the `onClick` block):**

```ts
if (this.hero.wounds.length > 0 && !isDead) {
  const badgeX = size === 'small' ? 75 : 125;
  const badgeY = size === 'small' ? -22 : -48;
  const badgeText = this.scene.add.text(
    badgeX,
    badgeY,
    `🩸 ${this.hero.wounds.length}`,
    {
      fontFamily: 'monospace',
      fontSize: size === 'small' ? '11px' : '13px',
      color: '#ff6666',
    },
  ).setOrigin(1, 0.5);
  this.add(badgeText);
}
```

**Color:** `#ff6666` (light red) — readable against dark card backgrounds, distinct from the existing white name + grey class line.

**`isDead` suppression:** wound state on a Fallen hero rendered in cashout/wipe death-lists is not meaningful and would visually clutter the "this hero is gone" framing. Skip the badge when `isDead === true`.

## 3 · Barracks detail — Wounds section

`src/scenes/barracks_panel_scene.ts:rebuildDetail()` (around line 177). Insert a wound section between the trait line (at y≈172) and the ABILITIES header (currently fixed at y=215). Dynamically shift the ABILITIES section down when wounds are present so 0-wound heroes keep their existing layout exactly.

**Insertion logic (after the existing trait-line render):**

```ts
let woundsCursor = 192;  // just below the trait line at y=172 + 20

if (hero.wounds.length > 0) {
  this.detailContainer.add(
    this.add.text(DETAIL_TEXT_X, woundsCursor, 'WOUNDS', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ff6666',
    }),
  );
  woundsCursor += 18;

  for (const wound of hero.wounds) {
    const def = WOUNDS[wound.id];
    const desc = describeWoundEffect(def.effect);
    this.detailContainer.add(
      this.add.text(DETAIL_TEXT_X, woundsCursor, `${def.name} — ${desc}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#dddddd',
      }),
    );
    woundsCursor += 14;
  }

  woundsCursor += 6;  // gap before ABILITIES
}
```

**ABILITIES section shifts down dynamically.** The existing constants `ABILITY_HEADER_Y = 215` and `ABILITY_BLOCK_START_Y = 235` are used as the lower bound (no-wounds case keeps current layout):

```ts
const abilityHeaderY = Math.max(ABILITY_HEADER_Y, woundsCursor);
const abilityBlockStartY = abilityHeaderY + (ABILITY_BLOCK_START_Y - ABILITY_HEADER_Y);
```

Subsequent `this.add.text(..., abilityHeaderY, 'ABILITIES', ...)` calls and the kit-status text (positioned with the same Y) use `abilityHeaderY`. The ability rendering loop uses `abilityBlockStartY` as `yCursor` start.

The constants (`ABILITY_HEADER_Y`, `ABILITY_BLOCK_START_Y`) stay in source as the no-wounds baseline; only the local computation is new.

**Imports needed at the top of the file:**

```ts
import { WOUNDS, describeWoundEffect } from '../data/wounds';
```

## 4 · Files touched

| File | Change |
|---|---|
| `src/ui/hero_card.ts` | Add `🩸 N` wound-count badge in top-right when `wounds.length > 0` and `!isDead`. |
| `src/scenes/barracks_panel_scene.ts` | Add WOUNDS section to `rebuildDetail`; ABILITIES section dynamically lowered when wounds are present. Add `WOUNDS` + `describeWoundEffect` imports. |

## 5 · Test plan

No unit tests (Phaser scene/UI convention; matches Hospital, Camp node UI, Lost-hero rendering tasks).

**Acceptance:**

- `npx tsc --noEmit` green.
- `npm run build` succeeds.
- Existing tests stay green.

**Manual play verification:**

- HeroCard with no wounds: no badge visible.
- HeroCard with 1+ wounds: `🩸 N` badge in top-right corner; `N` matches `wounds.length`.
- HeroCard with `isDead` (cashout/wipe death-list rendering): no badge regardless of wound state.
- Barracks detail for hero with no wounds: layout matches current exactly (ABILITIES at y=215).
- Barracks detail for hero with 1+ wounds: `WOUNDS` header + name+description rows render between trait and ABILITIES; ABILITIES section pushes down to accommodate.

## 6 · Save schema

No change.

## 7 · Open questions

None at design time. The 6-wound theoretical maximum (one of each WoundId kind on a single hero) fits inside the Barracks panel's vertical space — abilities push down by ~84px (6 × 14), and the panel is `PANEL_H = 460` high.
