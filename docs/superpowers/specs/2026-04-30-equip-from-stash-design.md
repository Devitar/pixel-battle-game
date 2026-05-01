# Equip-from-stash at Barracks — Design

- **TODO entry:** Cluster B · 12 (Equip-from-stash at Barracks).
- **Tier:** 2.
- **Date:** 2026-04-30.

## 1 · Scope

Add a path for moving items between the **stash** and a **camp hero's equipment**. Today, items go pack→stash on cashout, but the stash is read-only as far as equip operations go (only the Blacksmith reads it, and only for upgrades). Heroes who survive a run cannot wear the loot you banked. Closes the load-bearing meta-progression hole called out in gdd §6: *"Inspect stats, equip gear from stash, set formation defaults, retire heroes."*

The work adds:

- One pure core module (`src/items/equip_camp.ts`) that exposes `equipFromStash` and `unequipToStash`. Mirrors `src/run/equip_run.ts`'s shape but operates on `(roster, stash)` instead of `runState`.
- One Phaser scene (`src/scenes/barracks_equip_scene.ts`) launched from the existing Barracks panel.
- A small "Equip Gear" button on the Barracks detail pane.
- Scene registration in `main.ts`.

**Out of scope:**

- Auto-suggest item for hero class (e.g., "this Knight should wear the rare sword in stash").
- Bulk equip / "best gear" auto-fit button.
- Stash filter by stat / rarity (filter is slot-only).
- Multi-hero equip flow (single-hero focus; player exits to switch).
- "Set formation defaults" and "retire heroes" from the same gdd §6 line — both are separate Cluster B entries (#14 retire) or future work.

## 2 · Decisions

| Decision | Choice | Reasoning |
|---|---|---|
| UI placement | Separate scene launched from Barracks | Mirrors the proven shop-overlay→equip-panel pattern. Avoids the "Barracks file grows by 200 lines" problem of a sub-state, and the "scatter conditionals through 580+ lines" problem of reusing `equip_panel_scene.ts` with a `mode` parameter. |
| Hero context | Single-hero (heroId passed in launch data) | Player exits to switch heroes. Avoids duplicating Barracks' list pane in the equip scene. Most players will deliberately gear up one hero at a time. |
| Picker model | Slot-first | The mental model for stash management is "this hero is missing X — what X do I have?" Slot-first makes that direct. Mid-run pack uses item-first because the rhythm there is "I just looted X, where does it go?" — different question, different best UI. |
| Unequip UX | "(empty)" row at the top of the picker for non-weapon slots | Clicking sends current item to stash. Hidden for weapon slot (weapon-must-always-be-equipped per `items/equip.ts`). |
| Weapon slot | Swap-only, no unequip option | Matches `equip.ts:unequip()`'s explicit `'cannot unequip the weapon slot'` throw. The picker for weapon shows all weapons in stash (any family) so the player can change kit if desired — the gear-modifies-abilities rule already handles family-mismatch consequences. |
| Stat preview | Yes, with green/red deltas | `previewStats` already exists in `items/selectors.ts`. Stash items often carry significant stat differences; making the player commit blind would feel unsafe. |
| Commit model | 2-click: first click highlights + shows preview, second click on same row commits | Matches mid-run `equip_panel_scene.ts`'s pattern. Preserves stat-preview value on touch (no hover assumption) and keeps muscle-memory consistent with the existing equip flow. |
| Persistence | Atomic `appState.update` after each swap | Same pattern as Blacksmith / shop. Roster + stash both updated in one transaction. No save-schema change. |
| Core helpers | New `equipFromStash` / `unequipToStash` in `items/equip_camp.ts` | Mirrors the shape of `equip_run.ts`. Operates on `(roster, stash)`. Returns `{ roster, stash }`. Keeps the firewall: Phaser scene calls a pure function for the swap. |

## 3 · Core API (`items/equip_camp.ts`)

Pure TS, no Phaser. Lives in `src/items/`.

```ts
import { CLASSES } from '../data/classes';
import { TRAITS } from '../data/traits';
import type { ItemSlot } from '../data/types';
import { computeMaxHp, type Hero } from '../heroes/hero';
import { type Roster, updateHero } from '../camp/roster';
import { addItems, removeItem, type Stash } from '../camp/stash';
import { equip, unequip } from './equip';

export function equipFromStash(
  roster: Roster,
  stash: Stash,
  heroId: string,
  itemId: string,
  slot: ItemSlot,
): { roster: Roster; stash: Stash } {
  const hero = roster.heroes.find((h) => h.id === heroId);
  if (!hero) throw new Error(`equipFromStash: heroId '${heroId}' not in roster`);
  const stashItem = stash.items.find((i) => i.id === itemId);
  if (!stashItem) throw new Error(`equipFromStash: itemId '${itemId}' not in stash`);
  if (stashItem.slot !== slot) {
    throw new Error(
      `equipFromStash: item.slot '${stashItem.slot}' does not match target '${slot}'`,
    );
  }

  const { hero: nextHero, displaced } = equip(hero, stashItem, slot);
  const clampedHero = recomputeMaxHp(nextHero);

  let nextStash = removeItem(stash, itemId);
  if (displaced !== undefined) nextStash = addItems(nextStash, [displaced]);

  return { roster: updateHero(roster, clampedHero), stash: nextStash };
}

export function unequipToStash(
  roster: Roster,
  stash: Stash,
  heroId: string,
  slot: ItemSlot,
): { roster: Roster; stash: Stash } {
  if (slot === 'weapon') {
    throw new Error('unequipToStash: cannot unequip the weapon slot');
  }
  const hero = roster.heroes.find((h) => h.id === heroId);
  if (!hero) throw new Error(`unequipToStash: heroId '${heroId}' not in roster`);

  const { hero: nextHero, item } = unequip(hero, slot);
  if (item === undefined) return { roster, stash };

  const clampedHero = recomputeMaxHp(nextHero);
  return {
    roster: updateHero(roster, clampedHero),
    stash: addItems(stash, [item]),
  };
}

function recomputeMaxHp(hero: Hero): Hero {
  const classDef = CLASSES[hero.classId];
  const trait = TRAITS[hero.traitId];
  const newMaxHp = computeMaxHp(classDef.baseStats.hp, trait, hero.equipment);
  return {
    ...hero,
    maxHp: newMaxHp,
    currentHp: Math.min(hero.currentHp, newMaxHp),
  };
}
```

The `recomputeMaxHp` helper duplicates the same pattern in `equip_run.ts`. Promoting it to a shared module is reasonable future work but not blocking today; both files are short and the logic is mechanical.

## 4 · Tests (`items/__tests__/equip_camp.test.ts`)

Eight Vitest cases:

1. **`equipFromStash` to empty slot:** Hero gains item; stash loses item; roster's hero record reflects the new equipment.
2. **`equipFromStash` swap (slot already filled):** Hero ends up with the new item; the displaced (old) item appears in stash.
3. **`equipFromStash` recomputes maxHp + clamps currentHp:** Equipping outfit with `hp +6` boosts maxHp; equipping a lesser one when at max HP clamps currentHp to the new maxHp.
4. **`equipFromStash` throws on missing hero / missing item / slot mismatch:** Three subcases asserting `toThrow()`.
5. **`unequipToStash` non-weapon slot:** Hero loses item; stash gains it.
6. **`unequipToStash` weapon slot throws.**
7. **`unequipToStash` empty slot:** Returns same roster + stash (no-op, no throw — matches `unequip()`'s no-op-on-empty contract).
8. **Roundtrip:** `equipFromStash` then `unequipToStash` of the same slot returns to a state where the original item is back in stash.

## 5 · Scene layout (`barracks_equip_scene.ts`)

Reuses `equip_panel_scene.ts`'s constants where layout matches, with adjustments for the single-hero focus (no left-pane party list).

| Region | Position | Content |
|---|---|---|
| Overlay + panel chrome | center 480, 270; size 920×460 | Standard dimming + bordered panel. |
| Title | center top, y=60 | `"Equip · {heroName}"` |
| Close × | top-right (x=933, y=63) | ESC + click both close. |
| Paperdoll | x=200, y=200 (scale 4) | Reads `heroToLoadout(hero)`. Rebuilt on each commit (post-swap visuals). |
| Hero info | x=270, y starting at 110 | Name (16px white) + `"{class} · Lv {level}"` (13px muted). |
| 4-slot strip | x=[150, 240, 330, 420], y=380, 56×56 each | Each slot square shows item sprite if equipped, slot label if empty. Rarity-colored stroke (uses existing `RARITY_COLOR` map literal). Selected slot has gold accent (`SELECTION_GOLD = 0xffcc66`). |
| Current stats | x=180, y=440 | `"HP X/Y · ATK A · DEF D · SPD S · MND M · CRT C% · DDG D%"` (12px white). |
| Preview stats | x=180, y=455 | Only when a picker item is highlighted. Same format with per-stat green/red coloring on changed stats. Uses `previewStats` from `items/selectors.ts`. |
| Picker pane | right column, x≈635, y=120..420 | Header line + paged item rows. |
| Picker header | y=110 | `"Pick a {slot} item"` when slot selected; `"Click a slot to manage gear."` when no slot selected. |
| Picker rows | y=140..400 in 4 visible rows of ~60px each | Item sprite + display name (rarity-colored) + affix description. Currently-equipped item flagged with `[Equipped]` badge. Selected row uses gold border. |
| "(empty)" row | First row when slot selected and slot ≠ weapon | Visually distinct (italic "(empty)"). Click commits unequip via `unequipToStash`. |
| Picker paging | up/down arrows on the right | Same pattern as `equip_panel_scene.ts` and `blacksmith_panel_scene.ts`. 4 visible rows. |

**Selection state machine** (no enum — derived from selection fields):

- `selectedSlot: ItemSlot | null` — null means "no slot picked yet."
- `highlightedItemId: string | null` — null means "no item highlighted in picker (or `'__empty__'` if the empty row is highlighted)."

Three derived states:

- **No slot selected** → picker shows initial prompt. Stats line shows current only.
- **Slot selected, no item highlighted** → picker shows compatible items + "(empty)" row for non-weapon. Stats line shows current only.
- **Slot selected + item highlighted** → picker shows highlight on the selected row. Preview stats line appears under current.

Click on a slot toggles `selectedSlot`. Click on a picker row toggles `highlightedItemId`; clicking again on the same row commits the swap.

**2-click commit** (highlight then commit), matching the existing `equip_panel_scene.ts` pattern. The first click sets `highlightedItemId` and renders the preview stats; the second click on the same row calls `equipFromStash` (or `unequipToStash` for the empty row), persists, and rebuilds. This keeps stat-preview valuable on touch devices (no hover assumption) and preserves muscle-memory parity with the mid-run flow.

### 5.1 · Picker filter

Slot-compatible items are sourced via:

```ts
function pickerItemsForSlot(stash: Stash, slot: ItemSlot): readonly Item[] {
  return stash.items.filter((i) => i.slot === slot);
}
```

Sort: rarity asc (commons first → upgradeable items surface above already-rare ones), then `floorRolledAt` asc, then by id for stability — same convention as Blacksmith.

### 5.2 · Title-bar gold readout

Not needed for this scene — equip is free at camp. Skip the gold display.

## 6 · Barracks scene change

Add a single "Equip Gear" button to the Barracks detail pane. Place it at the bottom of the detail pane at a fixed y position (y=430, x near `DETAIL_TEXT_X`). The detail pane spans y=90..450; abilities currently end around y=415 worst-case (Knight/Mage with 3-4 abilities × ~45px from `abilityBlockStartY ≥ 235`). y=430 sits below abilities for current Tier 2 classes; if a future class with more abilities lands, the button position may need to become adaptive (e.g., `Math.max(430, abilitiesEndY + 8)`). Out of scope for v1.

```ts
// in rebuildDetail, after the abilities loop:
const equipBtn = this.add
  .rectangle(DETAIL_TEXT_X + 80, 430, 140, 32, 0x335533)
  .setStrokeStyle(2, 0x66aa66);
this.detailContainer.add(equipBtn);
this.detailContainer.add(
  this.add
    .text(DETAIL_TEXT_X + 80, 430, 'Equip Gear', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
    })
    .setOrigin(0.5),
);
equipBtn.setInteractive({ useHandCursor: true });
equipBtn.on('pointerdown', () => {
  this.scene.launch('barracks_equip', { heroId: hero.id });
  this.scene.pause();
});
```

When `barracks_equip` closes, Barracks' RESUME handler is **not** wired today — the scene just keeps its existing rendered detail. That's a problem: after equipping, the displayed paperdoll/stats are stale.

**Fix:** add a one-line RESUME handler to Barracks that calls `rebuildDetail()`. Same pattern as `camp_scene.ts`'s RESUME handler (which runs `refreshHud` + `maybeLaunchPerkPicker`).

```ts
// in create(), after the existing setup:
this.events.on(Phaser.Scenes.Events.RESUME, () => {
  this.rebuildDetail();
});
```

This ensures the post-equip detail view reflects the new equipment.

## 7 · Persistence

After each commit:

```ts
const result = equipFromStash(state.roster, state.stash, this.heroId, itemId, slot);
appState.update((s) => ({ ...s, roster: result.roster, stash: result.stash }));
this.rebuild();  // local rebuild — paperdoll, slot strip, stats refresh
```

Same atomic pattern as Blacksmith. No `runState` involvement (Barracks is camp-only; runState is undefined when the player is at camp).

## 8 · Save schema

No change. `roster` and `stash` are existing persisted state.

## 9 · Files touched

| File | Change |
|---|---|
| `src/items/equip_camp.ts` | **New.** `equipFromStash`, `unequipToStash`, private `recomputeMaxHp`. |
| `src/items/__tests__/equip_camp.test.ts` | **New.** 8 Vitest cases. |
| `src/scenes/barracks_equip_scene.ts` | **New.** The equip panel scene. |
| `src/scenes/barracks_panel_scene.ts` | Add "Equip Gear" button + RESUME handler that calls `rebuildDetail`. |
| `src/main.ts` | Register `BarracksEquipScene`. |

## 10 · Test plan

**Core:** the 8 cases from §4.

**Scene:** no automated tests (Phaser convention). Manual play verification:

- From Barracks, select a hero with at least one stash item available; click "Equip Gear" → equip scene opens with that hero's slot strip.
- Click an empty slot → picker shows compatible stash items.
- Click an item once → preview stats appear with green/red deltas.
- Click same item again → commit; slot now shows the new item; stash item is gone; HP/stats reflect.
- Click a filled non-weapon slot → picker shows alternatives + "(empty)" first row.
- Click "(empty)" twice → unequip; item returns to stash.
- Click weapon slot → picker shows weapons (any family) + no "(empty)" row.
- Try to manually invoke `unequipToStash` on weapon → throws (validated by core test).
- Equip / unequip several items; close scene; reopen Barracks → detail pane reflects all changes (RESUME hook works).
- ESC closes the scene; close × button closes the scene.
- Equip an item that boosts maxHp; verify HP doesn't overflow.

## 11 · Open questions

None. Layout constants reuse existing literals where possible (`RARITY_COLOR`, `SELECTION_GOLD`, paging arrows). Color palette matches Blacksmith / Hospital / equip_panel for consistency.
