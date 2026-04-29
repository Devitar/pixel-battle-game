# Gear-modifies-abilities — design

**Status:** spec for TODO Cluster A · task 5 (Tier 2). Adds the GDD §3 weapon-family rule that gates each class's signature kit by equipped weapon.

**Source:** `gdd.md` §3 ("Gear modifies abilities") + §10 Tier 2.

**Scope:** the rule itself + 8 new swap abilities + the resolver function + integration into `buildCombatState`. No UI changes (Barracks panel ability-display fix is flagged as the most important follow-up but deferred).

---

## 1 · Architecture & module placement

Pure Cluster A. No `phaser` imports. Kit resolution happens upstream of the combat resolver; combat itself doesn't change.

**New module:** `src/items/kit.ts`
- Exports `resolveCombatAbilities(hero) → { abilities, aiPriority }`. Pure function over `Hero` + class data + ability definitions. Deterministic, no RNG.

**Edited modules:**
- `src/data/types.ts` — adds `WeaponFamily`, extends `AbilityId` with 8 new ids, adds `requiresShield?: boolean` to `Ability`, extends `ClassDef` with `weaponFamily`, `basicAbility`, `swapTarget?`, `weaponSwaps?`.
- `src/data/items.ts` — adds `WEAPON_FAMILY: Record<WeaponType, WeaponFamily>` table.
- `src/data/abilities.ts` — adds 8 new ability defs; flags `shield_bash` with `requiresShield: true`.
- `src/data/classes.ts` — each class declares `weaponFamily` + `basicAbility`; non-Archer classes also declare `swapTarget` + `weaponSwaps`.
- `src/run/combat_setup.ts` — `buildCombatState` calls `resolveCombatAbilities(hero)` and passes `abilities` + `aiPriority` into `createHeroCombatant` overrides.

**Phaser firewall: clean.** All edits in firewalled folders.

**Files touched:**
- Create: `src/items/kit.ts`
- Create: `src/items/__tests__/kit.test.ts`
- Modify: `src/data/types.ts`, `src/data/items.ts`, `src/data/abilities.ts`, `src/data/classes.ts`, `src/run/combat_setup.ts`
- Modify (extended tests): `src/data/__tests__/classes.test.ts`, `src/data/__tests__/abilities.test.ts`, `src/run/__tests__/combat_setup.test.ts`

---

## 2 · Data shapes

### `src/data/types.ts` additions

```typescript
export type WeaponFamily = 'melee' | 'ranged' | 'magic';

export type AbilityId =
  | /* existing 32 ids... */
  | 'knight_cleaving_swing' | 'knight_quick_slash'
  | 'barbarian_whirl_strike' | 'barbarian_frenzy'
  | 'rogue_riposte' | 'rogue_brutal_chop'
  | 'priest_arcane_bolt'
  | 'mage_holy_light';

export interface Ability {
  // ...existing fields
  requiresShield?: boolean;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  baseStats: Stats;
  preferredWeapon: WeaponType;
  weaponFamily: WeaponFamily;                              // NEW
  basicAbility: AbilityId;                                  // NEW
  swapTarget?: AbilityId;                                   // NEW (omit for Archer)
  weaponSwaps?: Partial<Record<WeaponType, AbilityId>>;     // NEW (omit for Archer)
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
  starterLoadout: StarterLoadout;
}
```

### `src/data/items.ts` addition

```typescript
export const WEAPON_FAMILY: Record<WeaponType, WeaponFamily> = {
  sword: 'melee',
  axe: 'melee',
  daggers: 'melee',
  bow: 'ranged',
  staff: 'magic',
  holy_symbol: 'magic',
};
```

### `src/data/classes.ts` per-class additions

```typescript
knight: {
  // ...existing
  weaponFamily: 'melee',
  basicAbility: 'knight_slash',
  swapTarget: 'shield_bash',
  weaponSwaps: { axe: 'knight_cleaving_swing', daggers: 'knight_quick_slash' },
},
barbarian: {
  weaponFamily: 'melee',
  basicAbility: 'barbarian_swing',
  swapTarget: 'cleave',
  weaponSwaps: { sword: 'barbarian_whirl_strike', daggers: 'barbarian_frenzy' },
},
rogue: {
  weaponFamily: 'melee',
  basicAbility: 'rogue_strike',
  swapTarget: 'backstab',
  weaponSwaps: { sword: 'rogue_riposte', axe: 'rogue_brutal_chop' },
},
archer: {
  weaponFamily: 'ranged',
  basicAbility: 'archer_shoot',
  // no swapTarget, no weaponSwaps — Archer has no same-family alternative
  // (only ranged weapon is bow). Captured in ideas.md for future expansion.
},
priest: {
  weaponFamily: 'magic',
  basicAbility: 'priest_strike',
  swapTarget: 'smite',
  weaponSwaps: { staff: 'priest_arcane_bolt' },
},
mage: {
  weaponFamily: 'magic',
  basicAbility: 'mage_zap',
  swapTarget: 'firebolt',
  weaponSwaps: { holy_symbol: 'mage_holy_light' },
},
```

### `src/data/abilities.ts` — `requiresShield` + 8 new abilities

```typescript
shield_bash: {
  // ...existing fields
  requiresShield: true,
},

// Knight + axe — replaces Shield Bash with axe-flavored cleave
knight_cleaving_swing: {
  id: 'knight_cleaving_swing',
  name: 'Cleaving Swing',
  canCastFrom: [1, 2],
  target: { side: 'enemy', slots: [1, 2] },
  effects: [{ kind: 'damage', power: 0.7 }],
  aiCondition: { kind: 'minTargets', n: 2 },
},

// Knight + daggers — replaces Shield Bash with crit-fishing single strike
knight_quick_slash: {
  id: 'knight_quick_slash',
  name: 'Quick Slash',
  canCastFrom: [1, 2],
  target: { side: 'enemy', slots: [1] },
  effects: [{ kind: 'damage', power: 0.7, bonusCrit: 20 }],
},

// Barbarian + sword — replaces Cleave with sword-whirl AoE (slightly weaker than axe-cleave)
barbarian_whirl_strike: {
  id: 'barbarian_whirl_strike',
  name: 'Whirl Strike',
  canCastFrom: [1, 2],
  target: { side: 'enemy', slots: [1, 2] },
  effects: [{ kind: 'damage', power: 0.65 }],
  aiCondition: { kind: 'minTargets', n: 2 },
},

// Barbarian + daggers — replaces Cleave with single-target high-speed frenzy
barbarian_frenzy: {
  id: 'barbarian_frenzy',
  name: 'Frenzy',
  canCastFrom: [1, 2],
  target: { side: 'enemy', slots: [1] },
  effects: [{ kind: 'damage', power: 0.9, bonusCrit: 10 }],
},

// Rogue + sword — replaces Backstab with fencing-style riposte
rogue_riposte: {
  id: 'rogue_riposte',
  name: 'Riposte',
  canCastFrom: [1, 2, 3],
  target: { side: 'enemy', slots: [1] },
  effects: [{ kind: 'damage', power: 1.0, bonusCrit: 15 }],
  cooldown: 2,
},

// Rogue + axe — replaces Backstab with heavy axe burst
rogue_brutal_chop: {
  id: 'rogue_brutal_chop',
  name: 'Brutal Chop',
  canCastFrom: [1, 2],
  target: { side: 'enemy', slots: [1] },
  effects: [{ kind: 'damage', power: 1.4 }],
  cooldown: 2,
},

// Priest + staff — replaces Smite with generic mind-projectile (no radiant tag)
priest_arcane_bolt: {
  id: 'priest_arcane_bolt',
  name: 'Arcane Bolt',
  canCastFrom: [2, 3],
  target: { side: 'enemy', slots: [1] },
  effects: [{ kind: 'damage', power: 1.0, scalingStat: 'mind' }],
},

// Mage + holy_symbol — replaces Firebolt with radiant mind-projectile (gains undead bonus)
mage_holy_light: {
  id: 'mage_holy_light',
  name: 'Holy Light',
  canCastFrom: [2, 3],
  target: { side: 'enemy', slots: [1] },
  effects: [{ kind: 'damage', power: 1.0, scalingStat: 'mind' }],
  cooldown: 2,
  tags: ['radiant'],
},
```

**Balance philosophy:** "off-preferred-same-family supports a real playstyle, not a punished version." Numerical parity is loose — small intentional asymmetries where mechanically natural (sword sweep < axe sweep). Adjustments expected post-playtest.

**Decisions baked in:**

1. **`swapTarget` + `weaponSwaps` are present-or-both-absent.** If `swapTarget` is set, `weaponSwaps` should cover at least one alt weapon in the same family. Validated in tests (classes.test.ts).
2. **`basicAbility` is explicit, not derived.** Each class declares it; not assumed to be `abilities[0]` (avoids brittle ordering).
3. **No new effect kinds, no new status ids, no combat-resolver changes.** All 8 new abilities use existing effect machinery.

---

## 3 · Kit-resolution algorithm

Single function in `src/items/kit.ts`:

```typescript
import { ABILITIES } from '../data/abilities';
import { CLASSES } from '../data/classes';
import { WEAPON_FAMILY } from '../data/items';
import type { AbilityId } from '../data/types';
import type { Hero } from '../heroes/hero';

export interface ResolvedCombatAbilities {
  abilities: readonly AbilityId[];
  aiPriority: readonly AbilityId[];
}

export function resolveCombatAbilities(hero: Hero): ResolvedCombatAbilities {
  const classDef = CLASSES[hero.classId];
  const equippedWeaponType = hero.equipment.weapon.weaponType;
  if (!equippedWeaponType) {
    // Defensive against data corruption — every weapon item should have weaponType.
    return { abilities: [classDef.basicAbility], aiPriority: [classDef.basicAbility] };
  }

  const equippedFamily = WEAPON_FAMILY[equippedWeaponType];
  const preferredFamily = classDef.weaponFamily;
  const isPreferred = equippedWeaponType === classDef.preferredWeapon;

  let abilities: AbilityId[];
  let aiPriority: AbilityId[];

  if (isPreferred) {
    // Band 1: preferred weapon — full kit
    abilities = [...classDef.abilities];
    aiPriority = [...classDef.aiPriority];
  } else if (
    equippedFamily === preferredFamily &&
    classDef.swapTarget !== undefined &&
    classDef.weaponSwaps !== undefined &&
    classDef.weaponSwaps[equippedWeaponType] !== undefined
  ) {
    // Band 2: same family, swap one ability
    const replacement = classDef.weaponSwaps[equippedWeaponType]!;
    const target = classDef.swapTarget;
    abilities = classDef.abilities.map((a) => (a === target ? replacement : a));
    aiPriority = classDef.aiPriority.map((a) => (a === target ? replacement : a));
  } else {
    // Band 3: wholly wrong — only basic
    abilities = [classDef.basicAbility];
    aiPriority = [classDef.basicAbility];
  }

  // Shield filter — applied last
  if (hero.equipment.shield === undefined) {
    abilities = abilities.filter((id) => !ABILITIES[id].requiresShield);
    aiPriority = aiPriority.filter((id) => !ABILITIES[id].requiresShield);
  }

  return { abilities, aiPriority };
}
```

**Three things baked in:**

1. **Swap target maps to its replacement in BOTH `abilities` and `aiPriority`.** The replacement inherits the priority slot of what it replaces. Knight's aiPriority `['shield_bash', 'bulwark', 'taunt', 'knight_slash']` becomes `['knight_cleaving_swing', 'bulwark', 'taunt', 'knight_slash']` for axe-Knight.

2. **Wholly-wrong always falls to `[basicAbility]` for both lists.** No nuance — one ability, AI uses it.

3. **Shield filter is the last step.** Applied to whatever band's kit. Knight + axe + no shield: cleaving_swing has no `requiresShield`, so the filter is a no-op. Knight + sword + no shield: shield_bash drops; Knight has 3 abilities.

---

## 4 · Integration into `buildCombatState`

The hero loop in `src/run/combat_setup.ts` adds one line and routes the resolved kit through overrides:

```typescript
for (let i = 0; i < party.length; i++) {
  const hero = party[i];
  const woundedStats = applyWoundsToStats(hero.baseStats, hero.wounds);
  const fullStats = applyEquipmentStats(woundedStats, hero.equipment);
  const damageTakenMultiplier = computeDamageTakenMultiplier(hero.wounds);
  const rareFields = rarePropertyFields(hero.equipment);
  const { abilities, aiPriority } = resolveCombatAbilities(hero);   // NEW
  const woundedMaxHp = fullStats.hp;
  combatants.push(
    createHeroCombatant(hero.classId, (i + 1) as SlotIndex, `p${i}`, {
      baseStats: fullStats,
      currentHp: Math.min(hero.currentHp, woundedMaxHp),
      maxHp: woundedMaxHp,
      traitId: hero.traitId,
      abilities,         // NEW
      aiPriority,        // NEW
      ...(damageTakenMultiplier !== 1 ? { damageTakenMultiplier } : {}),
      ...rareFields,
    }),
  );
}
```

`createHeroCombatant`'s `overrides` parameter already supports `abilities` / `aiPriority`. No factory signature change.

**Why here:** `buildCombatState` is the natural seam between hero-state and combat-state. It already composes wounds, equipment stats, and rare-property combatant fields. Kit resolution joins the same pipeline.

---

## 5 · Edge cases

| Case | Behavior |
|---|---|
| Knight + sword + shield (starter) | Band 1 — full kit, no shield filter |
| Knight + sword + no shield | Band 1, filter drops `shield_bash` → 3 abilities |
| Knight + axe + shield | Band 2 — swap → kit includes `knight_cleaving_swing`, no `shield_bash`. Shield equipped but unused for abilities |
| Knight + axe + no shield | Band 2 — same as above, shield filter is a no-op |
| Knight + bow | Band 3 (wholly wrong) → `[knight_slash]` |
| Mage + holy_symbol | Band 2 — swap → `firebolt` becomes `mage_holy_light` (gains radiant + undead bonus, loses back-row reach) |
| Mage + sword | Band 3 → `[mage_zap]` (mind-scaled basic preserved) |
| Priest + staff | Band 2 — swap → `smite` becomes `priest_arcane_bolt` (loses radiant tag) |
| Archer + bow | Band 1 — full kit |
| Archer + anything else | Band 3 → `[archer_shoot]` (no same-family swap mapping) |
| Mid-run weapon swap (via equip panel) | Kit re-resolves at next `buildCombatState` call. No mid-combat updates |
| Save round-trip | Resolution is purely derived; nothing kit-related is saved |

**Empty-kit theoretical case:** if a class's `basicAbility` had `requiresShield: true` (data error) and the hero had no shield, the resolver would return an empty kit. **Acceptable risk** — `classes.test.ts` would catch this at first test run; the runtime guard would mask data errors.

---

## 6 · Testing strategy

All Vitest, all pure-TS.

### `src/items/__tests__/kit.test.ts` (new — main test surface, ~25 cases)

**Band 1 (preferred):**
- Knight + sword → kit equals `CLASSES.knight.abilities`. Parameterized loop over all 6 classes with their preferred weapon.

**Band 2 (same-family swap, per-weapon):**
- Knight + axe → kit contains `knight_cleaving_swing`, not `shield_bash`. aiPriority similarly. Other 3 abilities unchanged.
- Knight + daggers → contains `knight_quick_slash`, not `shield_bash`.
- Barbarian + sword → contains `barbarian_whirl_strike`, not `cleave`.
- Barbarian + daggers → contains `barbarian_frenzy`, not `cleave`.
- Rogue + sword → contains `rogue_riposte`, not `backstab`.
- Rogue + axe → contains `rogue_brutal_chop`, not `backstab`.
- Priest + staff → contains `priest_arcane_bolt`, not `smite`.
- Mage + holy_symbol → contains `mage_holy_light`, not `firebolt`.

**Band 3 (wholly wrong):**
- Mage + sword → `[mage_zap]`. Knight + bow → `[knight_slash]`. Priest + daggers → `[priest_strike]`. Parameterized loop covering one wholly-wrong weapon for each of 6 classes.

**Archer special case:**
- Archer + bow → full kit.
- Archer + sword → `[archer_shoot]`.
- Archer + staff → `[archer_shoot]`.

**Shield filter:**
- Knight + sword + shield → kit includes `shield_bash`.
- Knight + sword + no shield → kit excludes `shield_bash`. Length is 3.
- Knight + axe + no shield → kit unchanged from "Knight + axe + shield".
- aiPriority filtered identically.

**Invariants (every test asserts):**
- `abilities.length >= 1`.
- `aiPriority.every(id => abilities.includes(id))`.
- Resolver doesn't mutate `hero` (snapshot before/after).
- Determinism: same hero → same output twice in a row.

Test fixture: `makeHeroWith({ classId, weaponBaseId, shieldBaseId? })` helper.

### `src/data/__tests__/classes.test.ts` (extended)

- Each class declares a valid `weaponFamily`.
- Each class's `basicAbility` is in its `abilities` list.
- For classes with `swapTarget`: target ID is in `abilities`.
- For classes with `weaponSwaps`: every key is in the same family as the class but ≠ `preferredWeapon`. Every value is a valid `AbilityId` in `ABILITIES`.
- Archer has neither `swapTarget` nor `weaponSwaps`.

### `src/data/__tests__/abilities.test.ts` (extended)

- Each of the 8 new ability ids has an entry in `ABILITIES`.
- `shield_bash.requiresShield === true`.
- No other existing ability has `requiresShield: true` (catches accidental flags).

### `src/run/__tests__/combat_setup.test.ts` (extended — integration)

- Knight wielding axe → resulting `Combatant.abilities` excludes `shield_bash`, includes `knight_cleaving_swing`.
- Knight wielding bow → resulting `Combatant.abilities` is `[knight_slash]`.
- Existing combat_setup tests keep passing — kit resolution is purely additive when hero has preferred weapon + shield.

### Coverage explicitly NOT written

- Combat-engine tests for the 8 new abilities. They use existing effect kinds (damage, bonusCrit, radiant, cooldown); existing tests cover the mechanics. New abilities are *data*, not *behavior*.
- UI changes for showing the resolved kit in the Barracks panel (out of scope this task; flagged in §7).

---

## 7 · Out of scope (deferred)

- **Barracks panel resolved-kit display.** Currently shows `CLASSES[classId].abilities` directly. After this task, a Knight wielding an axe will *display* Shield Bash in Barracks but *fight* with Cleaving Swing. **Misleading.** Most important follow-up; should be next-task.
- **Equip panel ability preview** — "this weapon swaps Shield Bash → Cleaving Swing" overlay when hovering a pack item.
- **Two-handed weapon → blocks shield slot rule.** Currently a Knight could equip an axe AND a shield; nothing prevents it.
- **Per-tier weapon variants** (basic sword vs longsword vs greatsword). Future weapon sub-types extend the kit-resolution algorithm naturally.
- **Combat-flow tests for new abilities.** Mechanics use existing effect kinds.
- **Balance tuning of the swap abilities.** Numerical tuning best done via playtest.

---

## 8 · Open questions / risk flags

- **"Sword < Axe Cleave" intentional asymmetry.** Barbarian + sword (Whirl Strike 0.65) is mechanically weaker than Barbarian + axe (Cleave 0.7). Other class swaps are at parity. Revisit if playtest says it feels too punishing.
- **Priest + staff loses radiant + undead bonus.** Mechanically worse build in Crypt; fine elsewhere. May warrant a chance-debuff effect on Arcane Bolt if it feels too dead.
- **Mage + holy_symbol gains radiant + undead bonus.** Could be discovered as the better Crypt build than preferred Mage + staff. Acceptable as a "clever discovery" or compensable via Frost Nova / Arc Shock tuning.
- **Empty kit possibility.** If a basic ability ever gets `requiresShield: true` (data error) and shield is missing, kit returns empty. Surfaced as test failure, not runtime crash. Adding a runtime guard would mask bugs.
- **Resolver overhead.** Runs once per `buildCombatState` call (once per combat). Cost: ~6 lookups + 1 array op. No caching needed.
