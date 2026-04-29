# Equip-swap UI — design

**Status:** spec for the equip-swap UI follow-up to the items foundation (Cluster A · task 4 HISTORY 2026-04-27).

**Source:** GDD §3 (gear modifies abilities), §7 (gear flow — pack ↔ equipment as a mid-run decision), and the user-tightened scope captured in this brainstorm.

**Scope:** ship a panel-scene equip UI for the **post-boss camp screen**, architected so the future TODO #11 (mid-floor rest areas) can launch the same scene. **Pack ↔ equipment only** — stash is never touched by this UI; it lives at the camp hub for future Blacksmith / hub-equip tasks.

---

## 1 · Architecture & module placement

**New panel scene:** `src/scenes/equip_panel_scene.ts` — 920×460 modal, mirrors `BarracksPanelScene`'s shell (overlay, ESC + X close, scene-pause/resume convention, `scene.stop()` on close to resume the launching scene).

**Wired into:** `src/scenes/camp_screen_scene.ts` — a new "Equip" button next to the existing Leave / Press On buttons. Click → `scene.launch('equip_panel'); scene.pause()`. On panel close, camp_screen resumes; existing `RESUME` event triggers a `scene.restart()` to rebuild against the mutated `appState`.

**Future-ready:** the panel scene reads its inputs (`runState.party`, `runState.pack`) from `appState.get()` and writes back via `appState.update()`. No camp-screen-specific assumptions. When TODO #11 (rest-area overlays) lands, it launches the same `equip_panel` scene.

**New pure-TS helpers:**
- `src/run/equip_run.ts` — `equipFromPack(runState, heroIndex, packItemId, slot)` and `unequipToPack(runState, heroIndex, slot)` — atomic transactions wrapping the existing `equip()`/`unequip()` from `src/items/equip.ts` plus pack add/remove. Pre/post invariants validated with throws; no partial mutations.
- `src/items/selectors.ts` — `filterPackBySlot`, `itemDisplayName`, `itemAffixDescription`, `previewStats`. Centralizes data → display transforms so the panel scene stays focused on layout/input.
- `src/items/stats.ts` — extracted `applyEquipmentStats(stats, equipment) → Stats` and `rarePropertyFields(equipment) → RarePropertyFields` from `combat_setup.ts`. Both `combat_setup.ts` and `selectors.ts` import from here. Targeted refactor; no functional change.

**Phaser firewall:** clean. Only `src/scenes/equip_panel_scene.ts` imports Phaser. All helpers are pure.

**Files touched:**
- Create: `src/scenes/equip_panel_scene.ts` (Phaser)
- Create: `src/run/equip_run.ts` (pure)
- Create: `src/run/__tests__/equip_run.test.ts`
- Create: `src/items/selectors.ts` (pure)
- Create: `src/items/__tests__/selectors.test.ts`
- Create: `src/items/stats.ts` (pure; extracted from `combat_setup.ts`)
- Create: `src/items/__tests__/stats.test.ts`
- Create: `src/scenes/__tests__/equip_panel_scene.test.ts` (shallow smoke)
- Modify: `src/run/combat_setup.ts` — import from `src/items/stats.ts` (no behavior change)
- Modify: `src/scenes/camp_screen_scene.ts` — Equip button, pack pill update, RESUME → `scene.restart()`
- Modify: `src/scenes/dungeon_scene.ts` — pack pill update only (no Equip button mid-floor)
- Modify: `src/main.ts` — register `EquipPanelScene` in the scene array

**Files explicitly NOT modified:**
- `src/scenes/camp_scene.ts` (the camp hub) — gets no equip button. Equip is during-run only.
- `src/scenes/dungeon_scene.ts` button row — no equip access mid-floor combat.

---

## 2 · Data & API shapes

### `src/run/equip_run.ts`

```typescript
import { equip, unequip } from '../items/equip';
import { addItem, removeItem } from './pack';
import { computeMaxHp } from '../heroes/hero';
import { CLASSES } from '../data/classes';
import { TRAITS } from '../data/traits';
import type { ItemSlot } from '../data/types';
import type { RunState } from './run_state';

export function equipFromPack(
  runState: RunState,
  heroIndex: number,
  packItemId: string,
  slot: ItemSlot,
): RunState {
  if (heroIndex < 0 || heroIndex >= runState.party.length) {
    throw new Error(`equipFromPack: heroIndex ${heroIndex} out of bounds (party size ${runState.party.length})`);
  }
  const hero = runState.party[heroIndex];
  const packItem = runState.pack.items.find((i) => i.id === packItemId);
  if (!packItem) {
    throw new Error(`equipFromPack: item id '${packItemId}' not in pack`);
  }
  if (packItem.slot !== slot) {
    throw new Error(`equipFromPack: item.slot '${packItem.slot}' does not match target slot '${slot}'`);
  }

  const { hero: nextHero, displaced } = equip(hero, packItem, slot);
  // Recompute maxHp after equipment change; clamp currentHp.
  const classDef = CLASSES[nextHero.classId];
  const trait = TRAITS[nextHero.traitId];
  const newMaxHp = computeMaxHp(classDef.baseStats.hp, trait, nextHero.equipment);
  const clampedHero = { ...nextHero, maxHp: newMaxHp, currentHp: Math.min(nextHero.currentHp, newMaxHp) };

  let nextPack = removeItem(runState.pack, packItemId);
  if (displaced !== undefined) nextPack = addItem(nextPack, displaced);

  const nextParty = [...runState.party];
  nextParty[heroIndex] = clampedHero;
  return { ...runState, party: nextParty, pack: nextPack };
}

export function unequipToPack(
  runState: RunState,
  heroIndex: number,
  slot: ItemSlot,
): RunState {
  if (slot === 'weapon') {
    throw new Error('unequipToPack: cannot unequip the weapon slot — every hero must have a weapon');
  }
  if (heroIndex < 0 || heroIndex >= runState.party.length) {
    throw new Error(`unequipToPack: heroIndex ${heroIndex} out of bounds`);
  }
  const hero = runState.party[heroIndex];
  const { hero: nextHero, item } = unequip(hero, slot);
  if (item === undefined) return runState;

  const classDef = CLASSES[nextHero.classId];
  const trait = TRAITS[nextHero.traitId];
  const newMaxHp = computeMaxHp(classDef.baseStats.hp, trait, nextHero.equipment);
  const clampedHero = { ...nextHero, maxHp: newMaxHp, currentHp: Math.min(nextHero.currentHp, newMaxHp) };

  const nextPack = addItem(runState.pack, item);
  const nextParty = [...runState.party];
  nextParty[heroIndex] = clampedHero;
  return { ...runState, party: nextParty, pack: nextPack };
}
```

### `src/items/selectors.ts`

```typescript
import { AFFIXES, BASE_ITEMS, RARE_PROPERTIES } from '../data/items';
import type { Item, ItemSlot } from '../data/types';
import type { Stats } from '../combat/types';
import type { Hero } from '../heroes/hero';
import type { Pack } from '../run/pack';

export function filterPackBySlot(pack: Pack, slot: ItemSlot): readonly Item[] {
  return pack.items.filter((i) => i.slot === slot);
}

export function itemDisplayName(item: Item): string {
  const baseName = BASE_ITEMS[item.baseId].name;
  if (item.rareProperty) {
    return `${baseName} ${RARE_PROPERTIES[item.rareProperty.propertyId].name}`;
  }
  if (item.rarity === 'uncommon' && item.affixes.length > 0) {
    return `${baseName} ${AFFIXES[item.affixes[0].affixId].name}`;
  }
  return baseName;
}

export function itemAffixDescription(item: Item): string {
  const parts: string[] = [];
  for (const a of item.affixes) parts.push(formatAffix(a));
  if (item.rareProperty) parts.push(formatRareProperty(item.rareProperty));
  return parts.join(' · ');
}

export interface StatPreview {
  currentStats: Stats;
  previewStats: Stats;
  deltas: Partial<Stats>;
}

/**
 * Equipment-only effective stats: class baseStats + equipment (base + affixes).
 * Trait and wound effects are NOT included — they're invariant across an equip
 * swap (same trait, same wounds before and after), so including them would shift
 * both `currentStats` and `previewStats` by identical amounts and obscure the
 * meaningful delta from the swap. Matches the existing Barracks display
 * convention.
 */
export function previewStats(hero: Hero, item: Item, slot: ItemSlot): StatPreview {
  // currentStats = applyEquipmentStats(hero.baseStats, hero.equipment)
  // previewStats  = applyEquipmentStats(hero.baseStats, simulatedEquipment)
  // deltas        = keys where current !== preview
  // (where simulatedEquipment is hero.equipment with `item` swapped into `slot`)
}
```

### `src/items/stats.ts`

Extracted from `combat_setup.ts`. Same function bodies; both consumers import from here.

```typescript
export function applyEquipmentStats(stats: Stats, equipment: HeroEquipment): Stats { … }

export interface RarePropertyFields {
  lifestealPercent?: number;
  thornsDamage?: number;
  regenPerRound?: number;
  burningWeaponDamage?: number;
}

export function rarePropertyFields(equipment: HeroEquipment): RarePropertyFields { … }
```

### Scene-local UI state (in `equip_panel_scene.ts`)

```typescript
private selectedHeroIndex: number = 0;
private selection:
  | { kind: 'none' }
  | { kind: 'pack-item'; itemId: string }
  | { kind: 'equipped-slot'; slot: ItemSlot }
  = { kind: 'none' };
private packPageStart: number = 0;
```

**Decisions baked in:**
1. **Atomic transactions.** `equipFromPack` validates everything before constructing new state; failures throw before any mutation.
2. **`currentHp` clamps to `newMaxHp` after equip change.** A Vigor outfit raises max HP but doesn't heal; equip-then-immediately-rest pattern stays meaningful. Matches existing wound-system convention.
3. **Single bottom button, contextual label.** `Equip <name>` when pack item selected, `Unequip <name>` when equipped non-weapon slot selected, dim `Equip` (disabled) when nothing selected.
4. **Selection is exclusive** — only one of {hero-row, pack-item, equipped-slot} active. Tap toggles selection; tap-same-thing-twice commits.

---

## 3 · Panel scene layout

920×460 modal centered on the 960×540 viewport.

**Top chrome (matches `BarracksPanelScene`):**
- Title: "Equip — Floor N" centered at y=60.
- × close button at top-right (x=933, y=63).
- Overlay rect (0.6 alpha black) full-screen behind panel.
- ESC binding closes.

**Left pane: party list (260×360, x=185, y=270)**
- 3 rows, ~110px each. Each row: small `HeroCard` + a 4-square mini-equipment-strip (rarity-bordered icons, no labels — at-a-glance loadout).
- Selected hero: 2px gold outline.
- Tap → selects that hero, resets selection to `{kind:'none'}`, resets pagination.

**Right pane: hero detail + equipment + pack (640×360, x=635, y=270)**

Three vertical zones:

**Zone 1 — header + stat preview (y=110-185):**
```
Eira ◆ Knight
HP 26 / 30   ATK 5   DEF 5   SPD 3
        ↓                                  (only when item/slot selected)
HP 26 / 30   ATK 7   DEF 5   SPD 3        (changed values colored: green=better, red=worse)
```

**Zone 2 — equipment slots (y=200-300):**
- Four 56×56 squares horizontal: weapon, shield, outfit, hat.
- Border colored by equipped item's rarity (white/blue/gold) or grey for empty.
- Below each square: 1-line item display name (truncated to ~14 chars).
- Tap a non-weapon occupied slot → selects it (preview shows post-unequip stats; bottom button → "Unequip <name>"). Second tap → commits.
- Tap weapon slot or empty slot: no-op.
- Selected slot square: thicker 3px gold outline.

**Zone 3 — pack list + button (y=315-455):**
- Header: "Pack (N)".
- Each row: 2 lines.
  - Line 1: `[w] Iron Sword of Burning` — slot-tag icon prefix + rarity-colored display name + small `[rare]` tag suffix.
  - Line 2: `+1 atk · +1 atk · burns 2 turns` in grey (empty for common items with no affixes).
  - Selected row: gold outline + `0x2a2418` background tint.
- Pagination: ~4 rows visible at once (28px each); ▲/▼ arrows on the right edge if pack has more than 4 items.
- Bottom button (200×32, bottom-right):
  - `none` → "Equip" disabled, dim background.
  - `pack-item` → "Equip <itemDisplayName>", active, gold border.
  - `equipped-slot` → "Unequip <itemDisplayName>", active, gold border.
  - Tap → commit.

**Empty states:**
- No items in pack: zone 3 shows "Pack is empty." Equip button disabled.
- Hero has no non-weapon equipment AND pack has no items: zone 2 still renders empty slots; zone 3 still renders "Pack is empty." Closing the panel is the only useful action — but the camp_screen-side `equipButtonEnabled` rule never opens the panel in this state in the first place.

**Visual conventions:**
- Rarity colors:
  - Common: `#cccccc`
  - Uncommon: `#4488ff`
  - Rare: `#ffcc66`
- Stat preview deltas:
  - Better: `#44cc44` green
  - Worse: `#cc4444` red
  - Unchanged: `#dddddd` (default text color)
- Active button: `#3a2a1a` bg, `#cc8844` border (matches Press On).
- Disabled button: `#222222` bg, `#444444` border, `#666666` text.

---

## 4 · Interaction flow + state model

### Event handlers (each ends in a `repaint()` call)

| Event | Action |
|---|---|
| Tap hero row | `selectedHeroIndex = i`; `selection = {kind:'none'}`; `packPageStart = 0`. |
| Tap pack item | If `selection.kind === 'pack-item' && selection.itemId === item.id`: commit equip. Otherwise: `selection = {kind:'pack-item', itemId: item.id}`. |
| Tap equipped non-weapon slot | If `selection.kind === 'equipped-slot' && selection.slot === slot`: commit unequip. Otherwise: `selection = {kind:'equipped-slot', slot}`. |
| Tap empty slot or weapon slot | No-op (selection unchanged). |
| Tap Equip/Unequip button (active) | Commit per current selection. |
| Tap pagination ▲/▼ | Adjust `packPageStart`. |
| Tap × close, ESC, or overlay outside panel | `scene.stop(); scene.resume('camp_screen')`. |

### Commit-equip flow

```typescript
private commitEquip(itemId: string): void {
  const heroIdx = this.selectedHeroIndex;
  const item = appState.get().runState!.pack.items.find((i) => i.id === itemId);
  if (!item) return; // selection invalidated by external mutation; defensive
  const slot = item.slot;
  appState.update((s) => ({
    ...s,
    runState: equipFromPack(s.runState!, heroIdx, itemId, slot),
  }));
  this.selection = { kind: 'none' };
  this.repaint();
}
```

### Commit-unequip flow

```typescript
private commitUnequip(slot: ItemSlot): void {
  const heroIdx = this.selectedHeroIndex;
  appState.update((s) => ({
    ...s,
    runState: unequipToPack(s.runState!, heroIdx, slot),
  }));
  this.selection = { kind: 'none' };
  this.repaint();
}
```

### `repaint()` — full right-pane rebuild

Tear down right-pane container's children and rebuild zones 1-3 from current `appState.get().runState` and current scene-local UI state. Cheap (~1ms for ~50 game objects). Avoids stale-state bugs.

### Edge cases

| Case | Behavior |
|---|---|
| Pack empty for selection | Zone 3 shows "Pack is empty." Bottom button disabled. |
| Hero falls during run, was wielding gear | Hero is removed from party (Task 15 logic); equipped gear flows to pack. Equip panel naturally surfaces gear in pack; player re-equips on a survivor. The fallen hero is absent from the party list. |
| Vigor-affix outfit equipped | Hero's `maxHp` rises by the vigor amount; `currentHp` stays at min(old, new max). Player gets headroom but not free heal. |
| Player rapid-taps Equip | First commit clears `selection`; second tap is a no-op. No race possible (appState.update is synchronous). |
| Player closes browser mid-equip | Every `appState.update` calls `save()`; state is durable. On reopen, panel re-initializes from persisted runState. |

### State invariants (enforced by helpers, not the panel)

- Every hero has exactly one weapon equipped.
- Pack and equipment together preserve every item — no drops, no duplicates.
- Item IDs stable across moves.
- `currentHp ≤ maxHp` always.

---

## 5 · camp_screen_scene wiring

### Equip button

Three-button row at y=470. Equip on the left.

```
   [Equip]   [Leave (+50g to vault)]   [Press On → Floor N+1]
```

Positions: Equip at x=160, Leave at x=460, Press On at x=760 (220×44 buttons, 80px gaps).

Equip button styling: `0x2a2a4a` bg, `0x6688cc` border (blue tint, distinct from Leave's green and Press On's amber).

### Disabling logic

```typescript
private equipButtonEnabled(run: RunState): boolean {
  if (run.pack.items.length > 0) return true;
  for (const hero of run.party) {
    if (hero.equipment.shield || hero.equipment.outfit || hero.equipment.hat) {
      return true;
    }
  }
  return false;
}
```

In practice the boss-victory loot drop almost always means the button is enabled.

### Pack pill — item count visibility

`Pack: 50g · 3 items` instead of `Pack: 50g`. Drops the suffix when item count is 0.

```typescript
const itemCount = run.pack.items.length;
const label = itemCount > 0
  ? `Pack: ${run.pack.gold}g · ${itemCount} item${itemCount === 1 ? '' : 's'}`
  : `Pack: ${run.pack.gold}g`;
```

Same change applies to `dungeon_scene`'s HUD pack pill (separate file, same pattern).

### Resume-driven repaint

```typescript
this.events.on(Phaser.Scenes.Events.RESUME, () => this.scene.restart());
```

`scene.restart()` over manual teardown — `CampScreenScene.create()` is small and idempotent. Trade-off: one-time scene rebuild, simpler than a `dynamicContainer` field with manual `removeAll(true)`.

---

## 6 · Testing strategy

### `src/run/__tests__/equip_run.test.ts` (new)
- `equipFromPack` swap: hero gets new, pack loses new + gains old, item count conserved.
- `equipFromPack` into empty optional slot: no displaced item.
- `equipFromPack` weapon swap displaces existing weapon.
- `equipFromPack` throws on out-of-bounds heroIndex without mutating state.
- `equipFromPack` throws on missing item id without mutating state.
- `equipFromPack` throws on slot/item mismatch without mutating state.
- `equipFromPack` clamps `currentHp` to `newMaxHp` after a Vigor outfit equip.
- `equipFromPack` preserves `currentHp` when below new max.
- `unequipToPack` moves shield/outfit/hat to pack and clears the slot.
- `unequipToPack` throws on weapon slot.
- `unequipToPack` is a no-op for an empty slot.
- Item identity preserved across re-equips (id of item A persists after `equip(A) → equip(B)` round-trip).

### `src/items/__tests__/selectors.test.ts` (new)
- `filterPackBySlot` returns only items matching the slot.
- `itemDisplayName` for common: returns `BASE_ITEMS.name`.
- `itemDisplayName` for uncommon: returns `<name> <affixName>`.
- `itemDisplayName` for rare: returns `<name> <rarePropertyName>` regardless of affixes.
- `itemAffixDescription` for common with no affixes: empty string.
- `itemAffixDescription` for rare with affixes + property: joined with ` · `.
- `previewStats.deltas` only contains changed keys.
- `previewStats` for a Vigor outfit reflects the HP delta correctly post-multiplier.

### `src/items/__tests__/stats.test.ts` (new — extracted helpers)
- `applyEquipmentStats` snapshot: a Knight with starter loadout has identical effective stats vs the prior in-line behavior in `combat_setup.ts`.
- `rarePropertyFields` returns the right fields for each of the 4 rare-property kinds.

### `src/run/__tests__/combat_setup.test.ts` (extended)
- All existing equipment-stat tests keep passing after the extraction.

### `src/scenes/__tests__/equip_panel_scene.test.ts` (new, shallow)
- Scene mounts when `appState` has a valid `camp_screen` runState.
- Scene exits cleanly via `scene.stop()`.

### Coverage explicitly NOT written
- Pixel-position layout assertions for the panel.
- Phaser tap/click flow tests (this repo's pattern: state-transition tests in pure helpers, not scene-level interaction tests).
- Scrollbar / pagination edge tests (re-extract to a pure helper if the pagination logic grows).

---

## 7 · Out of scope (explicitly deferred)

- **Camp-hub Barracks equip UI.** Per the design constraint, equipping happens *during* the run only. The camp hub stays read-only on equipment.
- **Stash UI.** Stash gets banked items on cashout but no UI surfaces it. Future Blacksmith / hub-equip task.
- **Mid-floor rest-area equip access.** TODO #11 will launch the same panel scene; this task just architects for it.
- **Gear comparison side-by-side** (see equipped vs each pack item simultaneously). Single-selection preview is enough for v1.
- **Item destruction** (drop / sell). Pack items can only be moved to equipment; nothing else. A "junk" path arrives with shops or blacksmith.
- **Drag-drop equip.** Tap-only.
- **Confirmation prompts** for unequip. Single tap-twice-to-commit suffices; player can always re-equip if mistaken.

---

## 8 · Open questions / risk flags

- **Pagination ergonomics.** ▲/▼ arrow buttons are the simplest; if pack regularly exceeds 4 items, may need wheel/touch-drag scrolling. Defer until playtest signals it.
- **Slot-tag icons in the pack list.** Spec uses ASCII tags `[w]/[s]/[o]/[h]`. If a small icon set is preferred over text, swap during implementation; data shape unchanged.
- **Equip-button disabling in zero-item-zero-equipped edge case.** Possible if a hero's full equipment was lost via Lost-event (TODO #15) and pack is empty. The `equipButtonEnabled` rule handles this. Will revisit when Lost lands.
- **`scene.restart()` flicker.** `CampScreenScene` rebuilds from scratch on every panel close. Visually: full redraw, ~1 frame. Should be imperceptible; if it isn't, switch to manual teardown of dynamic content.
