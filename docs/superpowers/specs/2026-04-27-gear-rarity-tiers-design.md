# Gear rarity tiers — design

**Status:** spec for TODO Cluster A · task 4 (Tier 2). Foundation task: introduces the items system.

**Source:** `gdd.md` §3 (gear-modifies-abilities preview), §7 (gear flow + rarity), §10 Tier 2.

**Scope:** full items foundation — types, drops, pack/stash, hero equipment, combat integration. No UI (deferred to follow-up Cluster B tasks).

---

## 1 · Architecture & module placement

Pure Cluster A. No `phaser` imports anywhere new or edited.

**New modules:**

- `src/data/items.ts` — type re-exports, the affix pool (`AFFIXES`), the rare-property pool (`RARE_PROPERTIES`), the base-item catalog (`BASE_ITEMS`). All static data.
- `src/items/equip.ts` — pure functions: `equip(hero, item, slot) → { hero, displaced }`, `unequip(hero, slot) → { hero, item }`. No validation of "can class equip this" — items move freely; gameplay restrictions live in tooltip / UI layers.
- `src/dungeon/loot.ts` — `rollLoot(rng, floorNumber, isBoss) → Item | null`. The single loot-roll entry point; returns `null` for combat-node "no drop" outcomes.
- `src/camp/stash.ts` — `Stash`, `createStash()`, `addItems(stash, items)`, `removeItem(stash, itemId)`. Mirrors `vault.ts` shape.

**Edited modules:**

- `src/data/types.ts` — adds `ItemSlot`, `Rarity`, `ItemBaseId`, `AffixId`, `RarePropertyId`, `AffixDef`, `RarePropertyDef`, `Item`, `RolledAffix`, `RolledRareProperty`, `HeroEquipment`. `StarterLoadout` retyped from sprite-string-based to `ItemBaseId`-based.
- `src/run/pack.ts` — `Pack` gains `items: readonly Item[]`. New helpers `addItem`, `removeItem`. `createPack()` returns `{ gold: 0, items: [] }`.
- `src/heroes/hero.ts` — `Hero` gains `equipment: HeroEquipment`. `createHero` instantiates real `Item` objects from the class's `starterLoadout`. `computeMaxHp` extends to fold in outfit base HP plus any `of_vigor` affix HP across all four equipment slots.
- `src/run/run_state.ts` — `completeCombat` signature gains `rng` parameter; rolls a loot drop on victory, appends to pack. `cashout` returns banked items in `CashoutOutcome.itemsBanked`. Fallen-hero gear transfers to pack on victory.
- `src/run/combat_setup.ts` — `buildCombatState` walks `hero.equipment` and folds gear stats into effective stats *after* trait/wound application. Same derive-on-build pattern as wounds. **No caching of effective stats anywhere.**
- `src/combat/types.ts` — `Combatant` gains `lifestealPercent?`, `thornsDamage?`, `regenPerRound?` numeric fields. `StatusId` adds `'burning'`.
- `src/combat/effects.ts`, `src/combat/combat.ts`, `src/combat/statuses.ts` — implement the 4 rare property hooks (see §4).
- `src/data/classes.ts` — `starterLoadout` per class swaps from sprite-string strings to `ItemBaseId` references.
- `src/save/save.ts` — `SaveFile` adds `stash: Stash`. Save round-trip preserves all new fields.
- `src/save/boot.ts` — old v1 saves missing new fields default sensibly: `pack.items = []`, `stash = createStash()`, `hero.equipment = derived from starterLoadout`. Schema version stays at `1` per pre-launch policy.

**Phaser firewall: clean.** All new code lives in firewalled folders (`data/`, `items/`, `dungeon/`, `camp/`, `run/`, `combat/`, `heroes/`, `save/`).

**Architectural decisions:**

1. **Items are immutable value objects with stable per-instance IDs.** `Item.id` is a UUID-ish string generated at drop time from the run RNG (so save round-trips replay deterministically). `Item.baseId` references the catalog entry. Two drops of "Iron Sword" are distinct `Item`s with different ids.

2. **Stat derivation order:** `class.baseStats` → trait deltas → wound deltas → equipment (base + affixes) → final. Traits are characterological (compound first); gear is situational (folds in last). Order is deterministic and preserved across the codebase.

3. **No item lookup at combat time.** `Combatant` carries flat numeric fields (`lifestealPercent`, `thornsDamage`, `regenPerRound`) computed once at `buildCombatState`. The combat resolver does not import from `src/items/`.

---

## 2 · Data shapes

```typescript
// src/data/types.ts
export type ItemSlot = 'weapon' | 'shield' | 'outfit' | 'hat';
export type Rarity = 'common' | 'uncommon' | 'rare';

export type ItemBaseId =
  | 'sword_basic' | 'bow_basic' | 'mace_basic'
  | 'axe_basic'   | 'daggers_basic' | 'staff_basic'
  | 'shield_basic'
  | 'outfit_cloth' | 'outfit_leather'
  | 'hat_cap' | 'hat_hood';

export type AffixId =
  | 'of_power' | 'of_insight' | 'of_the_bear' | 'of_vigor'
  | 'of_swiftness' | 'of_the_hawk' | 'of_evasion';

export type RarePropertyId =
  | 'of_burning' | 'of_vampirism'
  | 'of_thorns'
  | 'of_regeneration';

export interface AffixDef {
  id: AffixId;
  name: string;
  stat: BuffableStat;
  baseValue: number;
  hpMultiplier?: 3;  // sentinel; only set on of_vigor
}

export type RarePropertyDef =
  | { id: 'of_burning';      name: string; slots: readonly ['weapon']; kind: 'burn';      baseDamage: number; turns: 2 }
  | { id: 'of_vampirism';    name: string; slots: readonly ['weapon']; kind: 'lifesteal'; percentOfDamage: number }
  | { id: 'of_thorns';       name: string; slots: readonly ['shield']; kind: 'thorns';    baseDamage: number }
  | { id: 'of_regeneration'; name: string; slots: readonly ['outfit']; kind: 'regen';     baseHeal: number };

export interface Item {
  readonly id: string;
  readonly baseId: ItemBaseId;
  readonly slot: ItemSlot;
  readonly rarity: Rarity;
  readonly weaponType?: WeaponType;        // only when slot === 'weapon'
  readonly affixes: readonly RolledAffix[];
  readonly rareProperty?: RolledRareProperty;
  readonly floorRolledAt: number;
}

export interface RolledAffix {
  affixId: AffixId;
  value: number;  // final, post-floor-scale, post-HP-mult
}

export interface RolledRareProperty {
  propertyId: RarePropertyId;
  value: number;  // final, post-floor-scale
}

export interface HeroEquipment {
  weapon: Item;          // required (every hero ships with starter weapon)
  shield?: Item;
  outfit?: Item;
  hat?: Item;
}

export interface StarterLoadout {
  weapon: ItemBaseId;
  shield?: ItemBaseId;
  outfit?: ItemBaseId;
  hat?: ItemBaseId;
}
```

```typescript
// src/heroes/hero.ts
export interface Hero {
  // existing fields...
  equipment: HeroEquipment;
}

// src/run/pack.ts
export interface Pack {
  readonly gold: number;
  readonly items: readonly Item[];
}

// src/camp/stash.ts (new)
export interface Stash {
  readonly items: readonly Item[];
}
```

**Decisions baked into the shape:**

- **Affix value is the final number, not a base+scale to recompute.** When loot rolls at floor 7, *of Power* bakes its scaled value (e.g., +2) into `RolledAffix.value` and the item carries it forever. Items are *instances of a moment of luck*, not living objects that re-roll. Save round-trip is trivial.
- **`Item.floorRolledAt`** is preserved for tooltip / future Blacksmith use.
- **Weapon required in `HeroEquipment`** (every hero has a weapon, including starters). Other slots optional.

---

## 3 · Loot roll algorithm

Single entry point in `src/dungeon/loot.ts`:

```typescript
export function rollLoot(rng: Rng, floorNumber: number, isBoss: boolean): Item | null
```

Called by `completeCombat` on victory. Returns `null` for the 50% combat-node no-drop outcome.

**Algorithm in order:**

1. **Drop gate.** If `isBoss`: skip the gate (always drops). Else: roll `[0, 1)`; if `≥ 0.5`, return `null`.
2. **Effective floor for rarity weighting:** `effectiveFloor = isBoss ? floorNumber + 1 : floorNumber`. Affects rarity weight only, not affix values.
3. **Slot roll:** uniform across `['weapon', 'shield', 'outfit', 'hat']`.
4. **Weapon-family roll** (only if slot === 'weapon'): uniform across `['sword', 'bow', 'holy_symbol', 'axe', 'daggers', 'staff']`. Picks the matching `baseId` (e.g., `'bow_basic'`).
5. **Base-item resolve.** Weapon → mapped from family. Shield → `'shield_basic'`. Outfit → uniform pick from `['outfit_cloth', 'outfit_leather']`. Hat → uniform pick from `['hat_cap', 'hat_hood']`.
6. **Rarity roll** from the floor-keyed weight table:

   | Floor | Common | Uncommon | Rare |
   |------:|-------:|---------:|-----:|
   | 1     | 90%    | 10%      |  0%  |
   | 3     | 80%    | 18%      |  2%  |
   | 5     | 70%    | 25%      |  5%  |
   | 8     | 55%    | 32%      | 13%  |
   | 10    | 45%    | 35%      | 20%  |
   | 15+   | 30%    | 40%      | 30%  |

   Linear interpolation between defined rows; clamped at row 1 (floor 1) and row 6 (floor ≥ 15). Boss treats `effectiveFloor = currentFloor + 1`.

7. **Affix count.** Default by rarity: Common 0, Uncommon 1, Rare 2. **Hat exception:** Common 0, Uncommon 1, Rare 3 (hats trade rare property for an extra affix).

8. **Affix selection:** sample without replacement from the 7-affix pool. Roll N distinct affix ids uniformly.

9. **Affix value:** for each rolled `affixId`:
   - `scaledValue = round(affixDef.baseValue × floorScale(floorNumber).hp)` — reuses existing `floorScale` curve (1 + 0.1 × (floor − 1)).
   - If affix is `of_vigor`: apply additional `× 3` after floor-scaling.
   - Stored in `RolledAffix.value`.

10. **Rare property roll** — only if `rarity === 'rare' && slot !== 'hat'`:
    - Filter `RARE_PROPERTIES` by `slot`. Weapon has 2 candidates; shield and outfit have 1 each.
    - Uniform pick.
    - Scale base damage / heal / etc. by `floorScale` (same curve as affixes). Stored in `RolledRareProperty.value`.

11. **ID generation:** `generateItemId(rng)` — small new helper in `src/util/rng.ts` producing a 16-char base36 string. Deterministic from RNG seed for save round-trip determinism.

12. **Assemble & return** the `Item`.

**Affix pool (7 entries) — `AFFIXES`:**

| Affix | Stat | baseValue | Notes |
|---|---|---|---|
| `of_power` | attack | 1 | |
| `of_insight` | mind | 1 | |
| `of_the_bear` | defense | 1 | |
| `of_vigor` | hp | 2 | × 3 multiplier at apply |
| `of_swiftness` | speed | 1 | |
| `of_the_hawk` | crit | 5 | percent |
| `of_evasion` | dodge | 5 | percent |

Floor 1: round(1 × 1.0) = +1; floor 10: round(1 × 1.9) = +2; floor 15: round(1 × 2.4) = +2. `of_vigor` at floor 1 = 6 HP, floor 10 = 12 HP.

**Rare properties (4 entries) — `RARE_PROPERTIES`:**

| Property | Slot | kind | baseValue |
|---|---|---|---|
| `of_burning` | weapon | burn | baseDamage 2, turns 2 |
| `of_vampirism` | weapon | lifesteal | percentOfDamage 25 |
| `of_thorns` | shield | thorns | baseDamage 1 |
| `of_regeneration` | outfit | regen | baseHeal 1 |

Damage / heal values scale by `floorScale`; `percentOfDamage` does not scale (it's a ratio).

**Base items (~11 entries) — `BASE_ITEMS`:**

| baseId | slot | weaponType | base stat |
|---|---|---|---|
| `sword_basic` | weapon | sword | +1 attack |
| `bow_basic` | weapon | bow | +1 attack |
| `mace_basic` | weapon | holy_symbol | +1 attack |
| `axe_basic` | weapon | axe | +1 attack |
| `daggers_basic` | weapon | daggers | +1 attack |
| `staff_basic` | weapon | staff | +1 mind |
| `shield_basic` | shield | — | +1 defense |
| `outfit_cloth` | outfit | — | +2 hp (×3 = +6) |
| `outfit_leather` | outfit | — | +3 hp (×3 = +9) |
| `hat_cap` | hat | — | (no base) |
| `hat_hood` | hat | — | (no base) |

Holy_symbol uses the `mace_basic` sprite frame (current Priest convention; `mace_tier1` is what `data/classes.ts` already references). Outfit base HP applies the ×3 multiplier same as `of_vigor`.

**Sprite mapping** for new base items reuses existing tier1 sprites in `sprite_names.generated.ts`. Sprite-binding details are an implementation concern; the data layer references via `baseId`.

**Rolling notes:**

- **Effective floor only shifts rarity, not affix values.** Boss on floor 5 rolls rarity as-if floor 6, but affixes scale at floor 5. Two scaling axes orthogonal.
- **Without-replacement affix draw.** No two affixes on a single item share an `affixId`. Pool of 7, max draw 3 — never exhausts.

---

## 4 · Combat integration

**Stat aggregation in `buildCombatState`:**

```
class.baseStats
  → trait deltas (existing)
  → wound deltas (existing)
  → equipment (base + affixes flattened to Stats deltas) [NEW]
  → final effective stats fed to createHeroCombatant
```

New helper `equipmentStats(equipment) → Partial<Stats>` walks the four slots and folds:
- Each item's **base stat** (from `BASE_ITEM_STATS[baseId]`).
- Each item's **affix values** (already final, summed by `BuffableStat`).

`hp` aggregate flows into both `baseStats.hp` and `maxHp`.

**`computeMaxHp` evolution.** New signature `computeMaxHp(classBaseHp, trait, equipment)`. Folds in outfit HP base + any `of_vigor` affix HP across all four slots. Called at hero creation and (future) on every equip change.

**Rare property → combat hook mapping:**

| Property | Hook | Plumbing |
|---|---|---|
| `of_burning` (weapon) | After `damage_applied` from this hero, apply `burning` status to the target | New `'burning'` `StatusId`; reuses poison status plumbing in `effects.ts` and `statuses.ts`; added to `STATUS_GLYPHS` |
| `of_vampirism` (weapon) | On `damage_applied` from this hero, heal source for `floor(damage × percent / 100)` | `Combatant.lifestealPercent?: number`; applied right after damage in `applyDamage`; emits `heal_applied` |
| `of_thorns` (shield) | On `damage_applied` to this hero (landed hits only, not dodged), deal `value` back to source | `Combatant.thornsDamage?: number`; emits second inverse-direction `damage_applied`; non-lethal-source guard |
| `of_regeneration` (outfit) | On `round_start` for this hero, heal `value` HP, capped at maxHp | `Combatant.regenPerRound?: number`; resolved in existing round_start handler; emits `heal_applied` |

All four numeric fields are *optional, computed once at `buildCombatState`* from the hero's equipped rare properties. No item lookup at combat time.

**Why this shape:**

- **No new "item lookup at combat time."** Combat works on flat `Combatant` fields. Combat resolver does not import from `src/items/`.
- **Mirrors the wounds pattern exactly.** `damageTakenMultiplier` was added the same way. We're adding four more.
- **`burning` reuses poison machinery wholesale.** New status, zero new behavior class.

**Flag for future:** the pattern of stamping optional numeric fields on `Combatant` per mechanic (`damageTakenMultiplier`, `lifestealPercent`, `thornsDamage`, `regenPerRound`, …) will warrant a `Combatant.passives` bag if Tier 3 adds 3 more such fields. Add a code comment near the new fields noting this consolidation candidate.

**Edge cases:**
- Vampirism rounds *down* (`floor`). 10 dmg × 25% = 2 heal. 3 dmg × 25% = 0 heal.
- Vampirism fires on *lethal* hits to the target too (you absorb life from the kill). Source heals same as on a non-lethal hit.
- Burning status applied to a target that died from the same hit is a no-op (existing status-application machinery is idempotent on dead targets).
- Thorns fires only on *landed* hits, not on dodged attacks. Dodged attacks emit `attack_dodged` instead of `damage_applied`; thorns hangs off `damage_applied`.
- Thorns does not chain (a thorn-damage event does not trigger more thorns).
- Thorns can kill the source (e.g., a low-HP enemy striking a heavily-thorned shield dies to the reflect). Same lethal-damage path as a normal attack; emits `death` event.
- Regen at round_start respects `maxHp` cap; cannot heal a dead hero (existing round_start handlers already gate on `isDead`).

---

## 5 · Drop & banking flow

**Drop on combat victory** (in `run_state.ts → completeCombat`, after gold reward block):

```typescript
const drop = rollLoot(rng, runState.currentFloorNumber, isBoss);
if (drop) {
  newPack = addItem(newPack, drop);
}
```

`completeCombat` signature gains `rng` parameter; the same RNG threaded for floor generation handles loot rolls.

**Cashout banking:**

```typescript
export interface CashoutOutcome {
  goldBanked: number;
  itemsBanked: readonly Item[];   // NEW
  heroesReturned: readonly Hero[];
  heroesLost: readonly Hero[];
}
```

The camp scene (out of scope for this task) picks up `outcome.itemsBanked` and calls `stash = addItems(stash, itemsBanked)` next to its existing `vault = credit(vault, goldBanked)` call. **One new line of UI wiring.**

Equipped gear stays on the hero on cashout — already implicitly handled by `heroesReturned`.

**Wipe (everything in pack lost):** `WipeOutcome.packLost` already exists; the whole `Pack` (including `items`) is discarded. The existing `createPack()` call in the wipe branch zeros both gold and items. **No code changes beyond the type expansion.**

**Fallen hero gear transfer (per GDD §8):** when a hero falls in combat and the rest of the party survives, their equipped gear transfers to the pack:

```typescript
// In completeCombat victory branch:
for (const fallen of newFallen) {
  const items = [
    fallen.equipment.weapon,
    fallen.equipment.shield,
    fallen.equipment.outfit,
    fallen.equipment.hat,
  ].filter((i): i is Item => i !== undefined);
  for (const item of items) {
    newPack = addItem(newPack, item);
  }
}
```

If the *party also wipes the same fight*, this never executes — wipe branch zeros the pack. Aligns with GDD wording exactly.

**Lost heroes (per future TODO #15):** out of scope here. When that lands, the Lost path will *not* transfer gear (per GDD §8). Architecture supports this without rework.

**Stash wiring:**

- New `src/camp/stash.ts`: `Stash`, `createStash()`, `addItems(stash, items)`, `removeItem(stash, itemId)` (throws on missing id, like `pack.removeItem`). Mirrors `vault.ts`.
- `SaveFile` gains `stash: Stash`.
- `boot.ts` initializes a fresh stash on new save; old v1 saves missing the field default to `createStash()`.
- Camp scene's existing cashout handler picks up `outcome.itemsBanked` (one new line).

**Decisions baked in:**

- **No max stash size.** Unbounded for this task. Could cap later (Barracks-upgrade-gated). Data is small (~100 bytes / item; even 1000 items is fine in localStorage).
- **Gold banks to vault, items bank to stash — distinct destinations.** GDD §6 distinguishes them; Blacksmith reads stash, Tavern/Hospital read vault. Cleanest separation is type-level.

---

## 6 · Save / boot integration

**Schema version stays at `1`** per pre-launch policy (memory: don't bump pre-launch).

**SaveFile shape additions:**
- `stash: Stash`
- `pack.items` and `hero.equipment` are persisted as part of existing `runState` and `roster` round-trips.

**Boot defaults for older v1 saves missing new fields:**

| Missing field | Default |
|---|---|
| `pack.items` | `[]` |
| `stash` | `createStash()` |
| `hero.equipment` | derived from `class.starterLoadout` via the same helper used in `createHero` |

These defaults apply at load time in `boot.ts`. New saves write all fields explicitly.

**Determinism:** save round-trip preserves item IDs. Reloading mid-run produces an identical run state, including pack contents and equipped item IDs.

---

## 7 · Testing strategy

All Vitest, all pure-TS, no Phaser.

**`src/data/__tests__/items.test.ts` (new)** — catalog & data integrity:
- Every `ItemBaseId` has an entry in `BASE_ITEMS`.
- Every weapon-typed base item has its `weaponType` set.
- Every `RarePropertyDef.slots` only contains slots that match its `kind`.
- The 7 affixes cover the expected `BuffableStat` keys.

**`src/dungeon/__tests__/loot.test.ts` (new)** — loot roll behavior:
- Drop gate: combat-node with seeded "≥0.5" roll returns `null`; "<0.5" returns an item; boss always returns an item.
- Slot uniformity over 1000 seeded rolls (±10%).
- Rarity weights: floor 1 rare rate = 0%; floor 15 rare rate ≥ 25%; boss applies +1-floor effective shift.
- Rarity weight interpolation: floor 2 reads halfway between floor 1 and floor 3.
- Affix count by rarity: Common 0, Uncommon 1, Rare-non-hat 2, Rare-hat 3.
- Affix without-replacement: no two `RolledAffix` on a single item share `affixId`.
- HP affix ×3 multiplier: `of_vigor` at floor 1 has `value = 6`; at floor 10 has `value = 12`.
- Rare property only on rare non-hat items; rare hats have `rareProperty === undefined`.
- Slot constraint on rare property: rare weapons roll from `[burn, lifesteal]`; rare shields roll thorns; rare outfits roll regen.
- Determinism: same seed + floor + isBoss → identical item id + affix list + values.

**`src/items/__tests__/equip.test.ts` (new)** — equip/unequip purity:
- `equip` returns hero with new item + the displaced item.
- Equipping a weapon over an existing weapon displaces it.
- Equipping outfit when none was equipped returns `displaced: undefined`.
- Original hero object is unchanged (immutability).

**`src/run/__tests__/pack.test.ts` (extended)** — pack item helpers:
- `addItem` returns new pack with item appended.
- `removeItem` returns new pack without that item id; throws on missing id.
- `createPack()` returns `{ gold: 0, items: [] }`.

**`src/run/__tests__/run_state.test.ts` (extended)** — drop integration:
- Combat victory with seeded "drop" RNG appends an item to `runState.pack.items`.
- Combat victory with seeded "no drop" RNG leaves items untouched.
- Boss victory always appends an item.
- Wipe zeros pack items along with gold.
- `cashout` returns the pack's items in `outcome.itemsBanked`.
- Fallen-gear transfer: in a victory where one party member fell, their equipped items appear in `newPack.items`.

**`src/run/__tests__/combat_setup.test.ts` (extended)** — stat aggregation:
- Hero with `of_power` affix on weapon shows the bumped attack in resulting `Combatant.baseStats`.
- HP from `of_vigor` flows into both `baseStats.hp` and `maxHp`.
- Stat order preserved: traits → wounds → equipment (test by stacking on the same key).

**`src/combat/__tests__/effects.test.ts` (extended)** — rare property hooks:
- `of_burning`: hero with weapon damaging an enemy applies `burning` status with right value/duration.
- `of_vampirism`: hero with weapon dealing 10 dmg with 25% lifesteal heals for 2.
- `of_thorns`: enemy hitting hero with shield takes thorn damage.
- `of_regeneration`: hero with outfit heals at round_start.

**`src/save/__tests__/save.test.ts` and `boot.test.ts` (extended)**:
- Save round-trip preserves `pack.items`, `stash`, `hero.equipment` fully.
- Loading v1 save missing new fields fills `pack.items = []`, `stash = createStash()`, `hero.equipment` from class starterLoadout.

**Out of scope this task:**
- Paperdoll-rendering tests for new equipment sprites — paperdoll already takes sprite strings; doesn't care where they come from. Future UI task.
- Tooltip-rendering tests — no tooltip yet.
- Equip-swap-UI flow tests — UI deferred.

---

## 8 · Out of scope (explicitly deferred)

- **Equip-swap UI (Barracks or mid-run).** Substrate ships, no player-driven equip flow. Heroes start with `starterLoadout`-derived items already equipped.
- **Tooltip / item-display widgets.** Tooltip surfacing happens in Cluster B follow-up.
- **Paperdoll wiring to use `equipment` instead of `starterLoadout` sprite strings.** Today the paperdoll consumes sprite strings; that linkage is separately wired in a Cluster B / render task. Data side does not block it.
- **Multi-dungeon rarity tier multiplier.** Only one dungeon (Crypt) exists; tier multiplier hook stubs to 1 and waits for Tier 3 dungeons.
- **Lost-hero gear handling.** TODO #15 builds on this design without rework.
- **Tiered base items per sprite tier (tier1/tier2/tier3 sprites).** Affix scaling already expresses "deeper = stronger"; tiered bases are a clean later-pass.
- **Smart drops weighted to party classes.**
- **Multiple-item drops per combat.**
- **Treasure-chest nodes** (own drop rules, separate task).

---

## 9 · Open questions / risk flags

- **Vampirism rounding.** `floor(dmg × 0.25)` means 1-3 damage hits heal 0. Acceptable: lifesteal is meaningful on big hits, not chip damage. Revisit if tester feedback says otherwise.
- **Rarity weight tuning** is a feel-by-test exercise. The proposed table is a starting point; expect to tune after first playtest pass.
- **`Combatant` field bloat** is mounting (4 new optional fields). Consolidate to a `passives` bag when 3 more land. Code comment placed.
- **Item ID generation determinism.** Using the run RNG ensures save round-trip replay. If we ever need item IDs that survive *across* runs (e.g., for Blacksmith upgrade audit logs), we'd need a separate stable-ID generator. Not needed yet.
