# Barracks UI (Tier 1)

**Status:** Design · **Date:** 2026-04-25 · **Source TODO:** Cluster B, task 14

## Purpose

Replace task 12's `BarracksPanelScene` stub with the real Barracks UI: a split-pane panel showing the roster on the left (12 small `HeroCard` slots in a 2×6 grid) and a detail pane on the right (paperdoll + stats + trait + full ability breakdown for the selected hero). Read-only inspection — no equip, no formation, no dismiss in Tier 1. Second consumer of `HeroCard`'s `small` variant after task 11 was built.

## Dependencies and invariants

**Vocabulary from prior tasks:**
- `HeroCard` (task 11) — `small` variant used here.
- `appState` singleton (task 10), `appState.get()` for the read-only camp view.
- `ABILITIES`, `Ability` (task 2), `CLASSES`, `ClassDef`, `TRAITS`, `TraitDef` (tasks 2 + 8).
- `Hero`, `hero.baseStats`, `hero.maxHp`, `hero.traitId` (tasks 6 + 8).
- `listHeroes`, `Roster` (task 7).
- Phaser overlay pattern (task 12): `scene.launch('barracks_panel')` from camp pauses camp; close = `scene.stop()` + `scene.resume('camp')`. Camp's `RESUME` listener refreshes its HUD even though Barracks doesn't mutate state — keeps the pattern uniform.

**New invariants this spec declares:**
- **Read-only.** No mutation of `appState`. The panel reads roster on open, renders, and closes. If Tier 2 adds equip/dismiss, the rebuild touches `selectHero` and adds action buttons.
- **Selection by hero id.** `selectedHeroId: string | null`. Future-proofs against roster reordering and makes `rebuildDetail` correct under any external mutation (won't happen in Tier 1, cheap insurance).
- **Auto-select on open.** `create()` calls `selectHero(roster.heroes[0]?.id ?? null)`. Empty roster → null selection → empty placeholder in detail pane.
- **Selection state is scene-local.** Not persisted in `SaveFile` or `appState`. Each open auto-selects the first hero again.
- **`describeAbility` lives in `src/data/`.** Pure TS, no Phaser. Pairs with `abilities.ts` so the data layer owns its presentation. Reusable later by the combat scene (task 17) for tooltips.
- **Stat display is mixed-fidelity.** HP from `hero.maxHp` (post-trait, since `computeMaxHp` bakes Stout's +10% at hero creation), ATK/DEF/SPD from `hero.baseStats` (pre-trait, since speed/attack/defense traits apply at combat time via `getEffectiveStat`). The trait line below resolves the inconsistency by being explicit. No new "effective stats" helper.

## Module layout

| Path | Action | Responsibility |
|---|---|---|
| `src/scenes/barracks_panel_scene.ts` | **Rewrite** | Replace task 12's stub. Panel chrome, list pane (2×6 small `HeroCard` grid), detail pane, click-to-select, close. |
| `src/data/ability_describe.ts` | **Create** | Pure TS. `describeAbility(ability) → { castLine, targetLine, effectLines }` derived from `target` + `effects` + `canCastFrom`. |
| `src/data/__tests__/ability_describe.test.ts` | **Create** | ~10 unit tests covering each `target`/`effect` shape variant. |

**Imports for `barracks_panel_scene.ts`:** `phaser`, `appState`, `listHeroes` from camp/roster, `HeroCard` from `../ui/hero_card`, `describeAbility` from `../data/ability_describe`, `CLASSES` + `TRAITS` from `../data/...`, `Hero` type.

## Layout (panel coordinates inside 960×540 viewport)

| Element | Position (center) | Size | Notes |
|---|---|---|---|
| Overlay | (0, 0) origin | 960×540 | alpha 0.6 black |
| Panel rectangle | (480, 270) | 920×460 | `#222222` fill, `#666666` 2px border. Spans y=40..500, x=20..940. |
| Title | (480, 60) | 18px white | `Barracks · {N} / {cap}` |
| Close × | (933, 63) | 28×28 | `#553333` bg, `#885555` border, `×` glyph |
| List pane bg | (245, 270) | 380×360 | `#1a1a1a` fill, `#444` border. Spans x=55..435, y=90..450. |
| List slot centers | (150, 120+i*60) and (340, 120+i*60), i=0..5 | 184×60 click rect + 180×56 `HeroCard` | 2 cols × 6 rows = 12 slots. 10px gap between columns, 4px between rows, ~5px clearance at pane edges. Selected slot: `#ffcc66` 2px outline (drawn by the click rect that wraps the HeroCard). Empty: faded `empty` placeholder. |
| Detail pane bg | (715, 270) | 440×360 | `#1a1a1a` fill, `#444` border. Spans x=495..935, y=90..450. |
| Detail paperdoll | (540, 145) | 16×16 sprites at scale 4 (effective 64×64) | top-left of detail pane |
| Detail name | (590, 110) origin (0,0) | 18px white | right of paperdoll |
| Detail class | (590, 132) origin (0,0) | 13px gray | |
| Detail stats line | (590, 152) origin (0,0) | 12px white | `HP {currentHp}/{maxHp} · ATK {atk} · DEF {def} · SPD {spd}` |
| Detail trait | (590, 172) origin (0,0) | 11px tan | `trait: {name} — {description}` |
| Abilities header | (515, 215) origin (0,0) | 12px `#ffcc66` | uppercase `ABILITIES` |
| Ability blocks | (515, 235 + cumulative offset) origin (0,0) | ~410 wide × variable height | per-ability stat block; ~5px gap between |

**Detail-pane horizontal padding:** content (paperdoll, text, ability blocks) lives in the inner area roughly x=515..930, y=110..445.

### Ability block format

Each ability renders as a 2- to 3-line block (variable height; 3 lines is typical). Cast and target are combined onto one line to fit four ability blocks within the detail pane's 215px ability area:

```
{ability.name}                                       ← 13px white
Cast: {castLine} · Target: {targetLine}              ← 11px gray, single line
→ {effectLines[0]}                                   ← 11px white
→ {effectLines[1]}                                   ← 11px white  (only if multi-effect)
```

Block stride: name line (16px) + meta line (14px) + 14px per effect line. With a 6px gap between blocks:
- 1-effect block height ≈ 44px (16 + 14 + 14)
- 2-effect block height ≈ 58px (16 + 14 + 14 + 14)

Layout uses a `y_cursor` that advances by `blockHeight + 6` after each ability, not a fixed `i*55` index. Worst case in Tier 1 = the four Knight abilities (one of which is Shield Bash with 2 effects): 44 + 58 + 44 + 44 + 6*3 = 208px. Ability blocks start at y=235; with 208px stride that ends at y=443 — inside the detail pane bottom (y=450) with 7px residual clearance.

## Scene-local state

```ts
interface RosterCard {
  bg: Phaser.GameObjects.Rectangle;  // 184×60 click target + selection outline
  card: HeroCard;
  hero: Hero;
}

private rosterCards: RosterCard[] = [];
private selectedHeroId: string | null = null;
private detailContainer!: Phaser.GameObjects.Container;
```

**`bg` rectangle (per filled slot):** 184×60, centered on the slot — 4px larger than the HeroCard so its 2px stroke wraps the card from outside. Fill is alpha 0 (transparent — the visual content is the HeroCard sitting on top); stroke is `#ffcc66` 2px with alpha 0 by default (invisible). Selection toggles the stroke alpha between 0 (hidden) and 1 (visible yellow outline). The rectangle is the click hit-target — `setInteractive({ useHandCursor: true })` only on `bg`, never on the HeroCard. Z-order: `bg` added first (behind HeroCard); the card sits on top, but Phaser hit-tests through the non-interactive HeroCard to the interactive `bg` underneath.

**`detailContainer`** is the parent for all detail-pane children. `selectHero` does `detailContainer.removeAll(true)` and rebuilds — analogous to `HeroCard.setHero`. Keeps detail-pane teardown to one call.

## `create()` flow

1. Reset per-launch state: `this.rosterCards = []; this.selectedHeroId = null;` (Phaser scene-instance reuse — same trap as Tavern).
2. Build overlay + panel rectangle + title + close ×.
3. Build list pane background.
4. Read `const heroes = listHeroes(appState.get().roster); const cap = appState.get().roster.capacity;` — captured once for the duration of the scene (Barracks is read-only).
5. Build 12 list slots: for each `i` in `0..11`:
   - If `i < heroes.length`, create a `HeroCard` (`small`) at the slot center plus a transparent `Rectangle` of the same bounds for click+highlight; store as `RosterCard`.
   - Else, create a single muted `Rectangle` (180×56, fill `#1a1a1a`, border `#333`) with centered gray `empty` text. No `RosterCard` recorded.
6. Build detail pane background.
7. `this.detailContainer = this.add.container(0, 0)`.
8. Update title to `Barracks · ${heroes.length} / ${cap}`.
9. `selectHero(heroes[0]?.id ?? null)` — paints the initial detail.
10. ESC handler: `this.input.keyboard?.on('keydown-ESC', () => this.close())`.

## `selectHero(id: string | null)`

```ts
private selectHero(id: string | null): void {
  this.selectedHeroId = id;
  this.refreshSelectionHighlights();
  this.rebuildDetail();
}
```

`refreshSelectionHighlights()` walks `this.rosterCards` and for each: `bg.setStrokeStyle(2, 0xffcc66, hero.id === selectedHeroId ? 1 : 0)` (third arg is stroke alpha — 0 hides the outline, 1 shows it).

`rebuildDetail()` clears `detailContainer` (`removeAll(true)`) and:
- If `selectedHeroId === null`: add a single centered text `No heroes — visit the Tavern to recruit.` (12px gray) at detail-pane center.
- Else: lookup the hero (`heroes.find(h => h.id === id)`; cached in `rosterCards` mapping), render paperdoll + name + class + stats + trait + ABILITIES header + 4 ability blocks. The paperdoll is built via `new Paperdoll(...)` directly (the detail pane wants a `×4` scaled doll without the wrapping HeroCard's name/HP-bar chrome).

Click handlers: each `RosterCard.bg` gets `setInteractive({ useHandCursor: true })` + `on('pointerdown', () => this.selectHero(hero.id))`. The `HeroCard` itself is not interactive — the wrapping `bg` is the click target, sized to the same 180×56.

## `describeAbility(ability)` — `src/data/ability_describe.ts`

```ts
import type { Ability, AbilityEffect, SlotIndex, StatusId, TargetSelector } from './types';

export interface AbilityDescription {
  castLine: string;
  targetLine: string;
  effectLines: string[];
}

export function describeAbility(ability: Ability): AbilityDescription {
  return {
    castLine: describeCast(ability.canCastFrom),
    targetLine: describeTarget(ability.target),
    effectLines: ability.effects.map(describeEffect),
  };
}
```

### `describeCast(slots)`

- Sorted unique slots covering `[1, 2, 3, 4]` → `'any slot'`.
- Single slot `[n]` → `'slot {n}'`.
- Multiple slots → `'slot {a}, {b}, or {c}'` (Oxford comma when ≥3).
- Two slots → `'slot {a} or {b}'`.

### `describeTarget(t: TargetSelector)`

Composed from three pieces, joined with separators:

1. **Side phrase:**
   - `'enemy'` → `enemy`
   - `'ally'` → `ally`
   - `'self'` → `self`

2. **Slot phrase:**
   - `slots: [1]` → `slot 1`
   - `slots: [3, 4]` → `slot 3 or 4`
   - `slots: 'all'` → `all` (combined with side: `all enemies`, `all allies`)
   - `slots: 'furthest'` → `furthest` (e.g., `furthest enemy`)
   - `slots` omitted → no slot phrase

3. **Filter clause:** parenthesized suffix.
   - `{ kind: 'hurt' }` → `(hurt)`
   - `{ kind: 'hasStatus', statusId }` → `({label})`
   - `{ kind: 'lacksStatus', statusId }` → `(not {label})`
   - `{ kind: 'hasTag', tag }` → `({tag})`
   - `STATUS_LABEL` map: `bulwark`, `taunting`, `marked`, `blessed`, `rotting`, `frailty`, `stunned` → matching lowercase string. (Fine for Tier 1; full strings derive trivially.)

4. **Pick suffix** (rare):
   - `'lowestHp'` → `, lowest HP`
   - `'highestHp'` → `, highest HP`
   - `'first'` / `'random'` → omitted (default)
   - When `slots: 'all'` is paired with `pick: 'first'`, the result reads `enemy, first available` (handled as a special case to avoid `all enemies, first available`).

Examples (Tier 1 ability set):

| Ability | castLine | targetLine |
|---|---|---|
| Slash | `slot 1 or 2` | `enemy slot 1` |
| Shield Bash | `slot 1 or 2` | `enemy slot 1` |
| Bulwark | `any slot` | `self (not bulwark)` |
| Taunt | `any slot` | `self (not taunting)` |
| Shoot | `any slot` | `enemy, first available` |
| Piercing Shot | `slot 2 or 3` | `enemy slot 3 or 4, first available` |
| Volley | `slot 2 or 3` | `all enemies` |
| Flare Arrow | `slot 2 or 3` | `enemy (not marked), first available` |
| Strike | `slot 1 or 2` | `enemy slot 1` |
| Mend | `slot 2 or 3` | `ally (hurt), lowest HP` |
| Smite | `slot 2 or 3` | `enemy slot 1` |
| Bless | `slot 2 or 3` | `ally (not blessed), first available` |

### `describeEffect(e: AbilityEffect)`

- `damage power` → `Deal {power*100}% damage`  (e.g., `Deal 100% damage`, `Deal 60% damage`)
- `heal power` → `Heal {power*100}% power`
- `stun duration` → `Stun for {duration} turn{s}`
- `shove slots` → `Shove {slots} slot{s} back`
- `pull slots` → `Pull {slots} slot{s} forward`
- `buff stat delta duration` → `{+/-}{|delta|} {Stat} for {duration} turn{s}`  (e.g., `+2 Attack for 2 turns`)
- `debuff stat delta duration` → same format (delta is already negative for debuffs)
- `mark damageBonus duration` → `Mark target for +{damageBonus*100}% damage ({duration} turn{s})`
- `taunt duration` → `Taunt for {duration} turn{s}`

`Stat` capitalization: `attack`/`defense`/`speed`/`hp` → `Attack`/`Defense`/`Speed`/`HP`. Plural `turn` → `turns` when duration ≠ 1.

## Empty / edge states

- **Roster empty.** List pane shows 12 `empty` placeholders. Detail pane shows centered gray text `No heroes — visit the Tavern to recruit.` Closing the panel is the only useful action.
- **Roster < 12.** Slots after `heroes.length` render as `empty` placeholders. List grid stays the full 12-cell shape so the layout doesn't shift as the roster grows.
- **Roster mid-mutation.** Cannot occur — Barracks reads on `create()`, no other panel can be open simultaneously (camp pauses on launch, only one panel resumes camp on close).

## Tests

### Unit tests: `src/data/__tests__/ability_describe.test.ts`

~10 cases. Targets shape coverage, not every Tier-1 ability:

1. Single-effect damage (`Slash`) — `effectLines === ['Deal 100% damage']`.
2. Multi-effect (`Shield Bash`) — `effectLines === ['Deal 60% damage', 'Stun for 1 turn']`.
3. `slots: 'all'` (`Volley`) — `targetLine === 'all enemies'`.
4. Filter `hurt` + `pick: 'lowestHp'` (`Mend`) — `targetLine === 'ally (hurt), lowest HP'`.
5. Filter `lacksStatus` + side `self` (`Bulwark`) — `targetLine === 'self (not bulwark)'`.
6. Filter `lacksStatus` + slots omitted + pick `first` (`Flare Arrow`) — `targetLine === 'enemy (not marked), first available'`.
7. `canCastFrom: [1, 2, 3, 4]` (`Necrotic Wave`) — `castLine === 'any slot'`.
8. `canCastFrom: [1]` (synthetic test ability) — `castLine === 'slot 1'`.
9. Buff effect (`Bless`) — `effectLines === ['+2 Attack for 2 turns']`.
10. Mark effect (`Flare Arrow`) — `effectLines === ['Mark target for +50% damage (2 turns)']`.

Heal, stun, debuff, taunt, shove, pull are exercised in passing or by the broader fixtures. If any of those needs explicit coverage, add cases 11–13.

### Smoke test (manual, dev server)

`npm run dev`:

1. **Initial state.** From the post-task-13 save (some heroes hired): camp HUD shows current gold; click Barracks.
2. **Panel opens.** Title `Barracks · {N} / 12`. Left pane shows `N` filled cards + (12-N) empty placeholders. Right pane auto-renders `roster.heroes[0]`'s detail: paperdoll, name + class, stats line, trait line, then 4 ability blocks.
3. **Selection highlight.** First card has yellow `#ffcc66` border. Click any other filled card — its border becomes yellow, previous selection reverts. Detail pane repaints with the new hero's data.
4. **Click an empty placeholder.** Nothing happens (no click handler registered).
5. **Verify ability rendering across classes.** Click each of the three starter classes (Knight / Archer / Priest) and confirm:
   - Knight: `Slash`, `Shield Bash`, `Bulwark`, `Taunt` render with the spec's targetLines.
   - Archer: `Shoot`, `Piercing Shot`, `Volley`, `Flare Arrow`. `Volley` should read `Target: all enemies`. `Mend` does not appear here.
   - Priest: `Strike`, `Mend`, `Smite`, `Bless`. `Mend` should read `Target: ally (hurt), lowest HP`.
6. **Trait line.** Verify each hero's trait shows name + description (e.g., `trait: Quick — +1 Speed in combat`).
7. **Press ESC** to close. Camp HUD remains accurate (no state changed). Reopen — auto-selects `heroes[0]` again, no selection persistence.
8. **Empty roster scenario.** In DevTools, edit `pixel-battle-game/save` to set `roster.heroes = []` and reload. Open Barracks. List pane shows 12 empty placeholders. Detail pane shows the empty-state text. ESC closes.

### Automated checks

- `npx tsc --noEmit` clean.
- `npm test` — 481 + ~10 = ~491 tests pass.
- `npm run build` succeeds.

## Risks and follow-ups

- **No sort/filter.** Roster cap is 12; the 2×6 grid handles it. Tier 2 may add filters when class roster grows past 6 or perks/gear add filterable attributes.
- **Selection state not persisted.** Each open auto-selects `heroes[0]`. Acceptable for read-only inspection. Tier 2's equip flow may want session-persistent selection.
- **Stat display fidelity is mixed.** HP is post-trait (`hero.maxHp`); ATK/DEF/SPD are pre-trait (`hero.baseStats`). The trait line resolves the gap by being explicit. Alternative — show all-effective stats — would require duplicating `getEffectiveStat` into a slot-less helper; rejected as over-engineering for Tier 1.
- **Conditional trait effects rendered as text only.** Cowardly's `-1 Speed in slot 1` and Nervous's `-1 Defense in slot 1` show in the trait description but don't pre-compute against a candidate slot (because Barracks has no slot context). Tier 2's formation editor (task 15-related) is where slot-aware trait math lands.
- **`describeAbility` is English-only.** No localization layer. If localization arrives, this file becomes the natural seam.
- **Detail pane has no scroll.** All four Tier 1 ability blocks fit in 360px. Tier 2's longer ability sets may force scrolling — a `mask` + draggable container is the standard Phaser pattern.
- **Empty placeholder cells in the list grid.** Faded `empty` rectangles for indices `≥ heroes.length`. Visual consistency over blank space; could trivially become "Recruit at Tavern" CTA buttons in Tier 2.
- **Read-only.** No equip / formation / dismiss in Tier 1. Per TODO §14 acceptance criteria. Tier 2 task will replace `selectHero`'s detail rebuild with an editable variant + action buttons.
- **`describeAbility` doesn't account for ability tags.** `Smite` has `tags: ['radiant']` which combat uses for damage modifiers vs `undead`. Tier 1 doesn't surface this in the description; Tier 2 may add a `Tags: radiant` line.
