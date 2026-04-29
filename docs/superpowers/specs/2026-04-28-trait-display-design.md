# Trait Display (Tavern + Hero Card)

**Status:** Design · **Date:** 2026-04-28 · **Source:** [`TODO.md`](../../../TODO.md) Cluster B · 7 — gdd §3 + §10 Tier 2.

## Purpose

Make the trait carried by every hero visible everywhere a hero is shown. Today the trait *name* renders only on the large hero card (Tavern, Camp Screen) and the trait *description* renders only on the Barracks detail pane. The Tavern player has to memorize what each trait does; the Barracks list pane omits the trait entirely. With 12 traits in the pool (per the [recruitment-traits work](2026-04-28-traits-at-recruitment-design.md)), the player needs the trait readable at the same prominence as class/HP wherever a roster is shown.

## Dependencies and invariants

**Vocabulary already in place:**
- `Hero.traitId: TraitId` is required; resolved via `TRAITS[hero.traitId]` (`src/data/traits.ts`).
- `TraitDef` (`src/data/types.ts:265-271`) currently holds `id`, `name`, `description`, `hpEffect?`, `statEffects?`.
- `HeroCard` widget (`src/ui/hero_card.ts`) takes `size: 'small' | 'large'`. Sizes:
  - `large` — 280×120; renders name, class, HP bar, stats line, trait line (`trait: ${traitDef.name}` only; description not surfaced).
  - `small` — 180×56; renders name, `Class · curHp/maxHp`, HP bar. **No trait line at all.**
- Consumers of `large`: `TavernPanelScene`, `CampScreenScene`.
- Consumers of `small`: `BarracksPanelScene` (list pane, 6 rows × 2 cols), `NoticeboardPanelScene` (eligible-heroes pool).
- `BarracksPanelScene` detail pane already shows `trait: ${traitDef.name} — ${traitDef.description}` (`barracks_panel_scene.ts:235-246`); not part of this task.
- No tooltip widget exists in the codebase. The single `pointerover` use (`noticeboard_panel_scene.ts:212`) is a button hover-highlight, not a tooltip pattern.
- Canvas is 960×540 (`main.ts`); `BarracksPanelScene` panel chrome already extends to y=500 (40 px top, 40 px bottom of canvas).

**Invariants this spec declares:**
- **No tooltip widget.** The trait description is rendered always-visible on the cards that need it. Touch and desktop behave identically.
- **`shortDescription` is required, not optional.** Every `TraitDef` carries one; no fallback to `description`. Asserted by tests.
- **Small-card layout footprint stays at 60 px tall.** Compress fonts and tighten internal padding rather than grow the card; this keeps the Barracks list pane (6 rows × 60 px stride = 360 px = full pane), Noticeboard slot height, and panel chrome unchanged. Single-widget blast radius.

## Module layout

| Path | Action | Responsibility |
|---|---|---|
| `src/data/types.ts` | **Modify** | Add required `shortDescription: string` field to `TraitDef`. |
| `src/data/traits.ts` | **Modify** | Add `shortDescription` to all 12 entries. |
| `src/ui/hero_card.ts` | **Modify** | Large card: append description to existing trait line. Small card: add new trait line at 10 px below HP bar; tighten internal layout (name 14→12 px, HP bar 6→5 px, padding -2 top/bottom) to keep card height at 60 px. |
| `src/data/__tests__/traits.test.ts` | **Modify** | Per-trait shape checks: `shortDescription` is a non-empty string of length ≤ 16. |

No changes to `BarracksPanelScene`, `TavernPanelScene`, `NoticeboardPanelScene`, `CampScreenScene`, save schema, or migration code. The card grows internally only — its bounding box stays at 180×60.

## Schema changes

### `TraitDef` (`data/types.ts`)

```ts
export interface TraitDef {
  id: TraitId;
  name: string;
  description: string;
  shortDescription: string;
  hpEffect?: TraitHpEffect;
  statEffects?: readonly TraitStatEffect[];
}
```

`shortDescription` is required. Long descriptions like `"-1 Speed when in slot 1"` get terse equivalents that fit the small-card width budget.

## Behavior

### Trait short descriptions

Hand-tuned per trait, all ≤ 16 characters:

| Trait id | `description` | `shortDescription` |
|---|---|---|
| `stout` | `+10% HP` | `+10% HP` |
| `quick` | `+1 Speed` | `+1 Spd` |
| `sturdy` | `+1 Defense` | `+1 Def` |
| `sharp_eyed` | `+1 Attack` | `+1 Atk` |
| `cowardly` | `-1 Speed when in slot 1` | `-1 Spd · S1` |
| `nervous` | `-1 Defense when in slot 1` | `-1 Def · S1` |
| `frail` | `-10% HP` | `-10% HP` |
| `sluggish` | `-1 Speed` | `-1 Spd` |
| `lucky` | `+5% Crit` | `+5% Crit` |
| `slippery` | `+5% Dodge` | `+5% Dodge` |
| `wise` | `+1 Mind` | `+1 Mind` |
| `bloodthirsty` | `+2 Attack when below 50% HP` | `+2 Atk <50%HP` |

The `S1` shorthand for "slot 1" appears only on the small card; the long description on the large card retains the natural-language form.

### Large hero card

Existing trait line (`hero_card.ts:127`) changes from:

```ts
const traitText = this.scene.add.text(textX, statsY + 14, `trait: ${traitDef.name}`, {...});
```

to:

```ts
const traitText = this.scene.add.text(
  textX,
  statsY + 14,
  `trait: ${traitDef.name} — ${traitDef.description}`,
  {...},
);
```

No layout, color, or font-size change. Card width 280 fits the longest combined string (`trait: Bloodthirsty — +2 Attack when below 50% HP`, 51 chars × ~6 px = ~306 px) — borderline, but Phaser text overflow is acceptable on the rightmost trait line which has no neighbor.

### Small hero card — layout adjustments

The card draws its own 56-tall background rectangle inside a 60 px slot (4 px slack). Grow `SMALL_HEIGHT` from 56 to 60 to use the slot's existing slack — the card now fills the slot exactly, picking up 4 px of vertical room for the new trait line. **No consuming-scene change required**, because Barracks `SLOT_BG_H` and Noticeboard `HERO_BG_H` were already 60.

Combined with mild internal compression, this fits a 10 px trait line below the HP bar:
- Top padding: 8 → 6 (saves 2 px)
- Name fontSize: 14 → 12 (saves ~2 px line height)
- Class+HP line: stays at 11
- HP bar height: 6 → 5 (saves 1 px)
- New: trait line at 10 px below HP bar, color `#ccbbaa` (matches Barracks detail pane trait color), text `${traitDef.name} · ${traitDef.shortDescription}` (no `trait:` prefix on the small card — saves chars and the `Name · Detail` form is recognizable in the roster context).
- Bottom padding: 8 → 4

Recomputed content span (with `SMALL_HEIGHT = 60`, `h/2 = 30`):
- Name top y = `-30 + 6 = -24`; height ~12; bottom y = -12.
- Class line y = -12 + 2 = -10; height ~14; bottom y = 4.
- HP bar y = 4 + 4 = 8; height 5; bottom y = 13.
- Trait line y = 13 + 2 = 15; height ~12; bottom y = 27.
- Bottom margin: 30 - 27 = 3 (≈ desired 4, close enough for visual comfort).

**Width budget for the trait line:** 132 px. Longest entry `Bloodthirsty · +2 Atk <50%HP` = 28 chars. At 10 px monospace, char width ≈ 6 px → 168 px. Overflows the 132 px budget by ~36 px.

**Resolution:** the trait label uses the card's full text-row width by anchoring at `textX` and letting Phaser render past the card's right edge. Acceptable because (a) the trait line is the last visual element on the card, (b) cards in the Barracks list pane have a 6 px gutter before the next card horizontally, and (c) the alternative — wrapping or growing the card — costs more layout work than overflow tolerance. Verified by inspection: 168 px from `textX = -42` ends at +126, which is 36 px past the card's right edge at +90. Adjacent slot center at x=340 (Barracks) is 190 px away; left edge of right slot bg = 248 px from card center → no overlap.

Where the small card lives in a layout with no right-side neighbor (Noticeboard's eligible-heroes pool, depending on grid arrangement), overflow is also acceptable — it sits within the panel's negative space.

### Paperdoll position

`Paperdoll` y stays at `dollY = 0` (card-center anchored). With card growing 56 → 60, the paperdoll's vertical position relative to the card's top edge moves down by 2 px — visually negligible.

## Tests

### `src/data/__tests__/traits.test.ts` — modify

Append two cases inside the existing `describe.each(EXPECTED_IDS)` block:

1. **`shortDescription` exists and is non-empty.**
   ```ts
   it('has a non-empty shortDescription', () => {
     expect(typeof TRAITS[id].shortDescription).toBe('string');
     expect(TRAITS[id].shortDescription.length).toBeGreaterThan(0);
   });
   ```

2. **`shortDescription` fits the small-card width budget.**
   ```ts
   it('shortDescription is at most 16 characters', () => {
     expect(TRAITS[id].shortDescription.length).toBeLessThanOrEqual(16);
   });
   ```

The 16-char ceiling is one character looser than the longest current entry (`+2 Atk <50%HP` = 13 chars; `-1 Spd · S1` = 11 chars) to give modest authoring slack without inviting overflow.

No hero-card render tests. The widget imports `phaser` and lives outside the testable firewall by repo convention; visual verification is done in-browser per the project's standard QA pass.

## Out of scope

- **Tooltip widget.** None built; "tooltip" in the TODO entry is interpreted as "the description must be reachable," satisfied by the always-visible inline approach.
- **Color treatment by trait sign.** Negative traits (Frail, Sluggish, Cowardly, Nervous) render in the same color as positives. Considered, deferred — Bloodthirsty is "positive but conditional" and muddies any sign-based scheme; defer until it earns its complexity.
- **Trait icons.** Glyph-based trait indicators (heart for Stout, lightning for Quick, etc.) would be nicer at small sizes but require sprite-frame work in `spritenames.txt` and `paperdoll.ts`. Out of scope.
- **Barracks detail pane.** Already shows `trait: name — description` in the desired form; no change.
- **Trait display on Combat scene combatants.** Combatants show stats but not provenance traits. Out of scope; UX-wise the combatant has already-effective stats baked in.

## Surprises / call-outs

- **Small-card width overflow on the trait line is intentional.** The Bloodthirsty short form (`Bloodthirsty · +2 Atk <50%HP`, 28 chars at 10 px ≈ 168 px) extends ~36 px past the card's right edge. Adjacent-slot collision verified non-existent (190 px to the next slot center, 248 px to its left edge). Cleaner long-term alternative: grow the small card to 240 wide and re-tune Barracks/Noticeboard layouts. Out of scope here.
- **Card height grows from 56 → 60 px** but the consuming slot was already 60 (4 px slack on the slot bg). No scene-side change.
- **`shortDescription` field is required, not optional.** A stricter contract than `hpEffect?` / `statEffects?`. Reason: there is no sensible fallback at the call site — degrading to `description` would re-introduce the overflow problem the field exists to solve. Tests guard the invariant.
