# Equipment Flow Unification — Design

**Status:** Locked design (brainstormed 2026-05-04). Replaces the two existing equip scenes (`barracks_equip_scene.ts` and `equip_panel_scene.ts`) with a single unified `equip_scene` that surfaces previously-hidden information (currently-equipped item stats, kit/ability changes from weapon swaps).

## §1 — Overview

Today, equipment management lives in two near-duplicate scenes — `barracks_equip` (camp, single hero, stash as item source) and `equip_panel` (in-run, party of 3, pack as item source). Players have flagged three concrete gaps:

1. **No way to see currently-equipped item stats from the at-rest barracks view.** The slot strip shows sprite icons but no affix/rare-property text. The info is only accessible after clicking a slot to open the picker.
2. **The two screens diverge in layout, selection state, and chrome** despite covering the same conceptual workflow.
3. **No preview of which abilities are gained or lost when swapping a weapon type.** `describeKitStatus()` and `resolveCombatAbilities()` exist in `kit.ts` but their output is never surfaced to the player.

Phase 6d is shipped; the dungeon flow is mature. Equipment management is the most-touched player workflow that still feels rough. This redesign collapses both scenes into one, surfaces the missing info, and makes weapon swaps legible.

The design's load-bearing decisions, locked during the 2026-05-04 brainstorm:

- **Q1 — Hero selector in both modes.** Both barracks and in-run modes show a left-pane hero list. Barracks shows full roster; in-run shows the 3-hero party. Truly unified chrome.
- **Q2 — Slot-detail card.** A dedicated card next to the paperdoll/slot strip shows the currently-equipped item's full details (name, rarity, weapon-type, affixes, rare property) for the selected slot. The card flips to a before/after preview when an item is highlighted in the picker. Single source of truth for "what does this slot look like."
- **Q3 — Kit and ability list in the hero header.** Abilities depend on the *combination* of weapon + shield, not on any single slot, so they live with the hero summary (a function of the whole hero, not one slot). On preview the kit line recomputes against the previewed equipment with diff coloring.
- **Q4 — Two-column layout with stacked right pane.** Left: hero list. Right (top to bottom): paperdoll + header, slot strip, slot-detail card, item picker.

## §2 — Locked design

### §2.1 Scene structure

A single Phaser scene `equip_scene` (key `'equip'`) replaces both old scenes. It accepts a `mode` parameter that determines hero source, item source, equip helpers, and close target:

```ts
export type EquipMode =
  | { kind: 'barracks'; heroId: string }   // entered with one hero in focus
  | { kind: 'in_run'; returnTo: string };  // entered from camp_screen / shop_overlay
```

Configuration table:

| Field | Barracks mode | In-run mode |
|---|---|---|
| Hero list (left pane) | `appState.roster.heroes` (full roster, scrollable) | `runState.party` (3 heroes, no scroll) |
| Initially selected hero | the `heroId` passed in | party index 0 |
| Item source (picker) | `appState.stash.items` | `runState.pack.items` |
| Equip helper | `equipFromStash` (from `@items/equip_camp`) | `equipFromPack` (from `@run/equip_run`) |
| Unequip helper | `unequipToStash` | `unequipToPack` |
| Close target | `'barracks_panel'` | `mode.returnTo` (`'camp_screen'` or `'shop_overlay'`) |

Both modes share **all** other UI structure, layout, interaction model, slot-detail card behavior, and ability-preview rendering.

### §2.2 Layout — 920 × 460 panel, two columns

```
+------------------------- 920 × 460 panel -------------------------+
| Equip · <hero name>                                          [×]  |
+----------------+--------------------------------------------------+
| Hero list      | Paperdoll (3×)   Hero header                     |
|                |                  · <Name> · <Class> · Lv <N>     |
| (~250 wide,    |                  · HP X ATK Y DEF Z SPD W ...    |
|  scrollable    |                  · Sword + Shield · Full kit · …│
|  in barracks)  |                                                  |
|                | Slot strip [W][S][O][H]                          |
|                |                                                  |
|                | Slot-detail card                                 |
|                | (currently-equipped item · OR before/after)      |
|                |                                                  |
|                | Item picker (pack/stash, scrollable, 4 visible)  |
|                |                                       [Commit]   |
+----------------+--------------------------------------------------+
```

**Sizing constants** (preliminary; tune during implementation):

- **Panel:** centered at (480, 270), size 920×460. Reuses both old scenes' panel size.
- **Left pane:** centered at (155, 270), width ~260, height ~360.
- **Right pane:** centered at (640, 270), width ~620.
- **Paperdoll:** at (380, 200), scale 3× (down from barracks' 4×; mid-run had no paperdoll).
- **Hero header:** anchored at x=460, y=130 (line 1: name+class+level), y=152 (line 2: total stats), y=174 (line 3: kit). Text wraps if kit list is long; allow ≤2 lines for the kit.
- **Slot strip:** y=240, 4 squares at x=[460, 540, 620, 700], each 56×56.
- **Slot-detail card:** anchored at (640, 305), bordered rectangle ~520×60. Text inside.
- **Item picker:** y=345 to 440, 4 visible rows × ~22px each, scroll arrows on the right.
- **Commit button:** bottom-right corner of right pane, x=850, y=440.

### §2.3 Left pane — hero list

A vertical strip of hero rows. Each row contains:

- Hero name (top of row, ~14pt monospace).
- Class · level + HP `current/max` (second line, ~11pt gray).
- Mini equipment strip: 4 small (22×22) squares with rarity-colored borders, no sprites. Visual cue for "this hero has full gear / has empty slots."

Selected hero gets a gold outline. Click a row to select. In barracks mode, if the roster exceeds visible rows (~4), scroll arrows appear; in in-run mode, exactly 3 rows always fit, no scroll.

Selecting a hero:
- Clears any active preview state (slot/item selection).
- Resets the picker scroll position to 0.
- Repaints the right pane.

### §2.4 Paperdoll + hero header

**Paperdoll**: built via `new Paperdoll(this, x, y, heroToLoadout(hero))`, scaled 3× (192px tall — fits in the available vertical space alongside the header).

**Header lines**:
- Line 1 — `<Name> · <Class display> · Lv <N>`. White text, ~14pt.
- Line 2 — Total effective stats: `HP X  ATK Y  DEF Z  SPD W  MND M  CRT C%  DDG D%`. Computed via `applyEquipmentStats(hero.baseStats, hero.equipment)`. Light gray; on preview, individual stats whose values change get red/green coloring (existing pattern from both old scenes).
- Line 3 — Kit line: `<weaponType-display> + Shield · <band-label> · <ability1> · <ability2> · ...`. Composed from `describeKitStatus(hero)` (existing) plus `resolveCombatAbilities(hero).abilities` mapped to `ABILITIES[id].name`. Examples:
  - `Sword + Shield · Full kit · Strike · Slash · Shield Bash · Defend`
  - `Axe · Off-preferred (1 swap) · Strike · Slash · Heavy Cleave · Defend`
  - `Bow · Wrong family (basic only) · Strike`
  - `Sword · No shield · Strike · Slash · Defend`

Kit line wraps to a second line if it overflows. Truncation is not used.

### §2.5 Slot strip

4 slot squares (weapon, shield, outfit, hat), each 56×56. Sprite icon if equipped (`BASE_ITEMS[item.baseId].spriteId`); slot label below. Border color = rarity if equipped, dim gray if empty. Selected slot gets a 3px gold border (existing pattern).

Click a non-weapon slot square that has an item equipped → preview *unequip* of that slot. **Weapon slot is non-clickable** (cursor stays default, no hover effect) because the engine requires every hero to always have a weapon. **Empty non-weapon slots are also non-clickable** (nothing to unequip-preview). Both old scenes have this behavior today.

### §2.6 Slot-detail card

A bordered rectangle below the slot strip (~520×60). Two display modes:

**At-rest mode** (a slot is selected — defaulting to weapon on entry — but no item is highlighted in the picker):

```
Sword · uncommon · sword
+3 atk
```

For weapons, the third token of the title is the `WEAPON_DISPLAY_NAME[weaponType]` (sword/bow/axe/etc.). For non-weapons, the third token is omitted.

For rares, append a third line:
```
Crown · rare
+2 mind · +5% crit
of_burning · burns 2 turns
```

If the slot is empty (e.g., shield slot with no shield equipped), the card reads `(empty)` in italic gray.

**Preview mode** (an item is highlighted in the picker, *or* an equipped slot is selected for unequip preview):

A two-column before/after layout:

```
Sword · uncommon          →    Crown · rare
+3 atk                         +2 mind · +5% crit
                               of_burning · burns 2 turns
```

The arrow `→` is centered between the two columns. Each column has the same content shape as at-rest mode. If the after side is `(empty)`, it renders italic. If the before side was empty (currently no shield, previewing equipping a new shield), the before column reads `(empty)` and the after column has the new item's details.

For all preview cases, the card width is fixed; text wraps within columns rather than overflowing.

### §2.7 Item picker

A scrollable list of items from the source (stash or pack). 4 rows visible at once with up/down arrows on the right when overflow. Each row:

- Slot tag prefix: `[w]`, `[s]`, `[o]`, `[h]` (existing pattern).
- Item display name + rarity (`Crown [rare]`).
- Affix description on a second sub-line if present (`+2 mind · +5% crit`).
- For items currently equipped on the *selected hero*, append `[Equipped]` to the name. (The mid-run today does NOT mark equipped items in the pack list; the barracks today DOES mark them in the picker. We keep the marking — useful disambiguation.)

Sort order:
1. By slot (`weapon` → `shield` → `outfit` → `hat`).
2. Within a slot, by rarity (`common` < `uncommon` < `rare`).
3. Within rarity, by `floorRolledAt` ascending.
4. Tiebreak: `id` ascending.

Click an item row → enter preview state for that item (slot-detail card flips to before/after; header recomputes stats and kit). Click again on the same row, or click the Commit button → equip.

### §2.8 Selection state machine

Mirrors the in-run scene's existing `Selection` discriminated union, slightly extended:

```ts
type Selection =
  | { kind: 'none' }
  | { kind: 'pack-item'; itemId: string }       // user previewing equip of this item
  | { kind: 'equipped-slot'; slot: ItemSlot };  // user previewing unequip of this slot
```

**Locked rules:**

- On scene entry / hero switch: `selection = { kind: 'none' }`. The slot-detail card displays the weapon slot's currently-equipped item in at-rest mode.
- Click a non-empty, non-weapon slot square: `selection = { kind: 'equipped-slot', slot: clicked }`. The card flips to before/after with after = `(empty)`. Header recomputes stat / kit deltas for the unequip preview.
- Click a pack/stash item: `selection = { kind: 'pack-item', itemId }`. The card flips to before/after with before = item currently in that slot (or `(empty)`) and after = the new item. Header recomputes stat / kit deltas.
- Click the same selection again, OR click the Commit button: equip / unequip via the mode's helper, then reset to `selection = { kind: 'none' }`.

**Card at-rest content scope:** The card at rest shows *only* the weapon slot's currently-equipped item. To inspect the affix details of an equipped shield/outfit/hat without entering preview, the player reads the picker rows (which show full affix detail and are sorted by slot, so all 4 slots are easy to find). This is a deliberate scope choice — adding a "browse other slots at rest without committing to a preview" mode would multiply the state machine and provide marginal information that the picker already exposes. If smoke testing reveals this feels weak, expand in a follow-up.

### §2.9 Commit pattern

A "Commit" button anchored bottom-right of the right pane (label dynamically computed):

- `none`: button hidden, OR shown as disabled with label "Equip".
- `pack-item`: button enabled, label `Equip <itemDisplayName(item)>`.
- `equipped-slot`: button enabled, label `Unequip <itemDisplayName(equipped)>`. Hidden if the slot is empty (nothing to unequip).

Clicking Commit invokes the appropriate equip/unequip helper (per the mode table in §2.1) and resets selection to `none`. The picker auto-scrolls to keep the just-equipped item visible if it's still in the source.

Double-clicking the same selection (item row clicked twice; slot square clicked twice) also commits — same path.

### §2.10 Stats and ability diff coloring

**Stat deltas** (header line 2): per-stat token colors:
- Stat unchanged: light gray (`#dddddd`).
- Stat increased: green (`#44cc44`).
- Stat decreased: red (`#cc4444`).

Format remains `HP <value>  ATK <value> ...` (the after value), not the delta. (Existing pattern from both old scenes.)

**Kit / ability diffs** (header line 3): the entire kit line recomputes against previewed equipment. Coloring per token:
- Weapon-type display: same color as the band-label (green on band upgrade, red on band downgrade, gray on no band change).
- Band label (`Full kit` / `Off-preferred (1 swap)` / `Wrong family (basic only)` / `No shield (...)`): green if `bandChange === 'upgrade'` (e.g., `Off-preferred → Full kit`), red if `bandChange === 'downgrade'`, gray if `'same'`.
- Per-ability tokens: green if added by the swap, red with strikethrough if removed, gray if unchanged.

Band ordering for upgrade/downgrade detection (best to worst): `Full kit` > `Off-preferred (1 swap)` > `No shield (...)` > `Wrong family (basic only)`. The `bandChange` value comes from `resolveAbilityDiff` (see §2.10 and §4 below).

For non-weapon, non-shield previews (outfit/hat swap), the kit line recomputes but is identical → no diff coloring fires.

A new helper `resolveAbilityDiff(beforeHero, afterHero)` in `src/items/kit.ts` returns `{ added: AbilityId[]; removed: AbilityId[]; bandChange: 'upgrade' | 'downgrade' | 'same' }` for the rendering layer to consume. It composes `resolveCombatAbilities` for both inputs and diffs.

### §2.11 Edge cases

- **Empty roster (barracks).** Should be impossible at this entry point (you click a hero to launch the scene), but defend: if the hero is gone (e.g., dismissed), close back to barracks_panel.
- **Hero dies mid-run between equip-panel opens.** The party array shrinks; selectedHeroIndex defaults to 0 if out of range.
- **Empty pack/stash.** Picker shows "Pack is empty." / "Stash is empty." text. Slot squares still clickable for unequip preview.
- **Empty slot for non-weapon previews.** Card shows `(empty)` on either before or after side as appropriate.
- **Ability that requires shield with no shield.** The kit line shows the no-shield form (filtered list) and notes the missing one (`Strike · Slash · Defend` instead of `Strike · Slash · Shield Bash · Defend`). Existing `kit.ts` shield filter already handles this. No special UI flagging beyond the `· No shield (...)` band-label note from `describeKitStatus`.
- **Preview crosses slot.** A pack item is always equipable into its own slot; previewing a `weapon` item updates the weapon-slot card and the kit line. The slot-strip's selected-slot indicator follows the previewed item's slot (selected square = `pack-item.item.slot` when previewing equip).
- **Reload mid-flow.** Equip scene state isn't persisted; it's a UI scene. On reload, the user lands at camp/barracks and would re-enter equip if they want to continue.
- **In-run scene changes between launch sites.** Camp_screen (post-boss) and shop_overlay both launch with `kind: 'in_run'`; only `returnTo` differs. The scene's close logic uses `returnTo` to decide which scene to resume. Existing pattern (mid-run scene already does this).
- **Hero with no weapon.** Defensive: every hero is required to have a weapon (`hero.equipment.weapon: Item`, not optional). If somehow `weapon` is undefined, fall back to "Unknown weapon · ?" in the kit line. Existing `describeKitStatus` already handles this case.

## §3 — Out of scope

- **Compare two items side-by-side in the picker.** Not asked for; would require extending the slot-detail card to a 3-column compare.
- **Sort/filter controls in the picker** beyond the existing slot/rarity/floor sort. No filter UI ("only weapons" toggle, etc.).
- **Drag-and-drop equip.** Click-to-preview-then-commit only.
- **Hero selector for in-run mode beyond the 3-hero party.** Lost / fallen heroes are explicitly hidden.
- **Tooltip on item hover.** The slot-detail card is the click-driven reveal; no separate hover tooltip.
- **Stash/pack reordering (manual).** Sort is fixed (slot → rarity → floor → id).
- **Bulk operations** (sell-all, equip-all-best, swap-loadout). Single-action UI only.
- **Animations on equip / unequip.** Static replacement of the paperdoll on commit; no slide-in / glow.

## §4 — Files affected

| Path | Action | Purpose |
|---|---|---|
| `src/scenes/equip_scene.ts` | **New** | Unified scene. ~600-700 lines. |
| `src/scenes/barracks_equip_scene.ts` | **Delete** | Replaced. |
| `src/scenes/equip_panel_scene.ts` | **Delete** | Replaced. |
| `src/items/kit.ts` | **Modify** | Add `resolveAbilityDiff(beforeHero, afterHero)` helper. |
| `src/items/__tests__/kit.test.ts` | **Modify** | Cover `resolveAbilityDiff` cases (full→off, off→full, no-change, shield-removal). |
| `src/main.ts` | **Modify** | Drop `BarracksEquipScene` + `EquipPanelScene` import + registration; add `EquipScene`. |
| `src/scenes/barracks_panel_scene.ts:490` | **Modify** | `scene.launch('barracks_equip', { heroId })` → `scene.launch('equip', { kind: 'barracks', heroId })`. |
| `src/scenes/camp_screen_scene.ts:128` | **Modify** | `scene.launch('equip_panel')` → `scene.launch('equip', { kind: 'in_run', returnTo: 'camp_screen' })`. |
| `src/scenes/shop_overlay_scene.ts:213` | **Modify** | `scene.launch('equip_panel', { returnTo: 'shop_overlay' })` → `scene.launch('equip', { kind: 'in_run', returnTo: 'shop_overlay' })`. |
| `TODO.md` | **Modify** | Mark the equip-flow item ✅ on completion. |
| `bugs.md` | **Modify** | Remove the equipment-viewing bug entry on completion. |
| `HISTORY.md` | **Modify** | Slim entry on completion. |

No data layer changes (`equip_camp.ts`, `equip_run.ts`, `selectors.ts`, `stats.ts` all untouched). No save schema changes.

## §5 — Test surface

Pure-TS additions:
- `src/items/__tests__/kit.test.ts`: extend with `resolveAbilityDiff` tests.
  - Same hero in/out: diff is empty, `bandChange: 'same'`.
  - Preferred-weapon → off-family-same-weapon: diff records added/removed swap ability, `bandChange: 'downgrade'` (Off-preferred is worse than Full kit).
  - Wrong-family → preferred: diff records added abilities (full kit) + removed abilities (only basic), `bandChange: 'upgrade'`.
  - Shield-removed: `requiresShield` ability is in `removed`, `bandChange` reflects no-shield form.

Scene-level UI follows repo convention — no unit tests, manual smoke verification. Smoke checklist:
- Barracks entry flow: roster shown in left pane, drilled-in hero pre-selected, can switch heroes via list, equip/unequip from stash works.
- In-run entry from camp_screen: party shown, switching works, equip/unequip from pack works, return-to-camp_screen on close.
- In-run entry from shop_overlay: same, with return-to-shop_overlay.
- Slot-detail card renders correctly at rest for all 4 slots (incl. empty shield/outfit/hat).
- Slot-detail card renders before/after correctly for: equip into empty slot, equip replacing equipped item, unequip non-weapon slot, swapping weapon types.
- Kit line displays correctly for all 3 bands (full kit / off-preferred / wrong family) and shield-required-but-missing case.
- Stat-delta coloring works in header line 2 on item-preview and slot-preview.
- Ability-diff coloring works in header line 3 on weapon swap previews and shield-removal previews.
- Commit button label updates correctly across selections; double-click commit also works.

## §6 — Phasing during implementation

Each task should leave the game in a working state. Recommended order:

1. **`resolveAbilityDiff` helper + tests.** Pure-TS addition to `kit.ts`. No scene changes. Verify tests pass.
2. **Scaffold `equip_scene` with mode parameter and the basic layout.** Renders left pane (hero list) and right pane (placeholder). Wire scene registration in `main.ts`. Don't change existing scenes yet — just the new one is unwired. Smoke: `scene.launch('equip', ...)` from a temporary test path renders the layout. (Can be tested by temporarily adding a launch call to a debug button, then removed.)
3. **Implement paperdoll, hero header (incl. kit line), and slot strip.** Both at-rest. No preview state yet. Smoke: paperdoll + correct stats + kit line for the selected hero in both modes.
4. **Implement slot-detail card.** At-rest mode only. Defaults to weapon. Smoke: card shows correct content for the weapon slot at rest.
5. **Implement item picker (no preview yet).** Just renders the source list. Smoke: picker shows pack/stash content in correct sort.
6. **Wire selection state machine + preview rendering.** Click slot or item → preview state, header / card / picker update. Stat + ability diff coloring. Smoke: full preview-and-cancel cycle works for all preview kinds.
7. **Wire commit button + commit-on-double-click.** Equip/unequip helpers fire correctly per mode. Smoke: gear actually moves between hero and source on commit.
8. **Switch launch sites + delete old scenes.** Replace 3 launch calls; delete `barracks_equip_scene.ts` and `equip_panel_scene.ts`; drop their registrations from `main.ts`. Smoke: barracks → equip works; camp_screen → equip works; shop → equip works.
9. **Housekeeping.** Update TODO.md, bugs.md, HISTORY.md.

## §7 — Open questions

None. Design is locked through brainstorm dialogue (2026-05-04).
