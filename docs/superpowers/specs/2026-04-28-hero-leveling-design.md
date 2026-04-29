# Hero Leveling + Level-5 Perks

**Status:** Design · **Date:** 2026-04-28 · **Source:** [`TODO.md`](../../../TODO.md) Cluster A · 7 — gdd §3 + §10 Tier 2.

## Purpose

Add the per-hero progression layer the gdd describes ("watch rookies become legends"). Heroes earn XP for surviving combat, level up with deterministic stat bumps, and at level 5 unlock a class-specific choice of two perks. The perk *picker UI* is separately tracked as Cluster B · 8; this spec ships the foundation: data, math, lifecycle hooks, save persistence, and combat-stat application.

## Dependencies and invariants

**Vocabulary already in place:**
- `Hero` (`src/heroes/hero.ts:10-21`): `id`, `classId`, `name`, `baseStats`, `currentHp`, `maxHp`, `traitId`, `bodySpriteId`, `wounds`, `equipment`. No XP/level/perk fields today.
- `ClassDef` (`src/data/types.ts:198-210`): per-class `baseStats`, abilities, weapon family, starter loadout. No `primaryStat` field today.
- `BuffableStat` = `'hp' | 'attack' | 'defense' | 'speed' | 'mind' | 'crit' | 'dodge'` (`src/data/types.ts:124`).
- `TraitStatEffect` (`src/data/types.ts:259-263`) and `TraitHpEffect` (`src/data/types.ts:254-257`) — the existing data shapes for "static stat modifier with optional condition" and "flat / percent HP modifier."
- `getEffectiveStat(combatant, stat)` (`src/combat/statuses.ts:16-35`) walks trait stat effects with `evaluateTraitCondition` per-lookup.
- `Combatant` (`src/combat/types.ts:34-58`): has `traitId?: TraitId`. No `perkId` today.
- `completeCombat(runState, result, rng)` (`src/run/run_state.ts:71-168`): runs after each fight. On `player_victory` produces `updatedPartyLiving` (survivors), separates fallen, awards floor-scaled gold (`COMBAT_NODE_GOLD = 15`, `BOSS_NODE_GOLD = 100`), rolls loot, transfers fallen-hero gear to pack. Natural insertion point for XP awards.
- `buildCombatState` (`src/run/combat_setup.ts`) constructs Combatants from heroes; already pipes `traitId` through. Same hook will pipe `perkId`.
- Save policy (per project memory): pre-launch — schema stays at v1; new fields default at load via `normalizeSaveFile` (`src/save/save.ts:95-100`); no migration code.

**Invariants this spec declares:**
- **XP only on `player_victory`, only to surviving heroes.** A hero who dies in a winning fight does not gain XP for that fight (matches gdd's "from surviving combat"). On `player_defeat` (wipe) no XP is awarded — the wipe path discards the run before any XP step.
- **Levels are clamped at `MAX_LEVEL = 5`.** Hero already at 5 ignores further XP. The cumulative `xp` counter still increases (preserves "career XP" reading; trivial to extend cap to 10 in Tier 3).
- **Level-ups apply immediately on XP-cross**, inside `completeCombat`. A single fight can cross multiple levels (a level-1 hero awarded 250 XP becomes level 2). Stat bumps and HP healing happen in one pass.
- **HP bump heals the hero.** Each level grants `+2 HP` to both `maxHp` and `currentHp` — leveling restores some HP. Matches RPG convention; gives the level-up a tangible mid-run effect.
- **Perk effects layer additively over traits.** Both flow through `getEffectiveStat`; same evaluation order (trait → perk → status). No subtractive or override semantics.
- **`pendingPerk` is a boolean, not a payload.** The "which 2 are offered" question is answered by `CLASS_PERK_PAIRS[hero.classId]`, which is static. No need to remember the offered pair.
- **`perkId` is set exactly once per hero**, via the Cluster B · 8 picker. This spec ships nothing that mutates `perkId`; Cluster B · 8 does the writing. Once set, it's permanent (Tier 3 Chapel may add removal — out of scope).

## Module layout

| Path | Action | Responsibility |
|---|---|---|
| `src/data/types.ts` | **Modify** | Add `PerkId` union (12 IDs); add `PerkDef` interface; add `primaryStat: BuffableStat` field to `ClassDef`. |
| `src/data/classes.ts` | **Modify** | Set `primaryStat` on each of the 6 classes. |
| `src/data/leveling.ts` | **Create** | Pure module: `MAX_LEVEL`, `LEVEL_THRESHOLDS`, `xpForCombatNode(floor)`, `xpForBossNode(floor)`, `levelForXp(xp)`, `applyLevelUps(hero, prevLevel, newLevel)`. |
| `src/data/perks.ts` | **Create** | `PERKS: Record<PerkId, PerkDef>` map; `CLASS_PERK_PAIRS: Record<ClassId, [PerkId, PerkId]>`. |
| `src/heroes/hero.ts` | **Modify** | Add `xp`, `level`, `pendingPerk`, `perkId?` fields to `Hero`. Default in `createHero`: `xp: 0, level: 1, pendingPerk: false`. |
| `src/run/run_state.ts` | **Modify** | In `completeCombat`, after computing `updatedPartyLiving`, award XP per fight type and apply level-ups. |
| `src/combat/types.ts` | **Modify** | Add `perkId?: PerkId` to `Combatant`. |
| `src/combat/statuses.ts` | **Modify** | `getEffectiveStat` reads `combatant.perkId` and adds `PERKS[id].statEffects` after trait effects. |
| `src/run/combat_setup.ts` | **Modify** | `buildCombatState` passes `perkId: hero.perkId` into `createHeroCombatant` overrides. |
| `src/save/save.ts` | **Modify** | `normalizeSaveFile` defaults `xp/level/pendingPerk` on heroes loaded from saves predating leveling. |
| Tests | **Modify / Create** | See "Tests" section. |

No changes to scenes (camp picker is Cluster B · 8), migration code, or any combat module beyond `statuses.ts` and the type addition.

## Schema changes

### `Hero` (`src/heroes/hero.ts`)

```ts
export interface Hero {
  id: string;
  classId: ClassId;
  name: string;
  baseStats: Stats;
  currentHp: number;
  maxHp: number;
  traitId: TraitId;
  bodySpriteId: string;
  wounds: Wound[];
  equipment: HeroEquipment;
  xp: number;             // total cumulative XP across all runs (0 at recruitment, never decreases)
  level: number;          // 1..MAX_LEVEL; denormalized but always derivable from xp
  pendingPerk: boolean;   // true after hitting level 5; cleared by Cluster B · 8 when player picks
  perkId?: PerkId;        // set exactly once via the camp picker; permanent thereafter
}
```

### `ClassDef` (`src/data/types.ts`)

```ts
export interface ClassDef {
  // existing fields…
  primaryStat: BuffableStat;
}
```

### `Combatant` (`src/combat/types.ts`)

```ts
export interface Combatant {
  // existing fields…
  perkId?: PerkId;
}
```

### `PerkId` and `PerkDef` (`src/data/types.ts`)

```ts
export type PerkId =
  | 'iron_will' | 'resolute'
  | 'precise' | 'eagle_eye'
  | 'devout' | 'steadfast'
  | 'berserker' | 'tough_skin'
  | 'lethal' | 'evasive'
  | 'arcane_power' | 'quick_cast';

export interface PerkDef {
  id: PerkId;
  name: string;
  description: string;
  classId: ClassId;
  statEffects?: readonly TraitStatEffect[];
  hpEffect?: TraitHpEffect;
}
```

`PerkDef` reuses `TraitStatEffect` / `TraitHpEffect` shapes verbatim — no new effect types. `getEffectiveStat` already loops `TraitStatEffect[]`; perks plug in by appending `PERKS[combatant.perkId].statEffects` to the same loop.

## Behavior

### Class primary-stat mapping

Added to `ClassDef.primaryStat`:

| Class | `primaryStat` | Per-level bump |
|---|---|---|
| Knight | `defense` | +1 |
| Archer | `attack` | +1 |
| Priest | `mind` | +1 |
| Barbarian | `attack` | +1 |
| Rogue | `crit` | +2 (crit is integer-percent; +1 would be barely noticeable) |
| Mage | `mind` | +1 |

### XP curve (`data/leveling.ts`)

```ts
export const MAX_LEVEL = 5;

// Cumulative XP required to reach each level.
export const LEVEL_THRESHOLDS: readonly number[] = [
  0,    // level 1
  200,  // level 2
  800,  // level 3
  2000, // level 4
  4000, // level 5
];

export function xpForCombatNode(floor: number): number {
  return 5 * floor;
}

export function xpForBossNode(floor: number): number {
  return 30 * floor;
}

export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return Math.min(level, MAX_LEVEL);
}
```

Reference reward sizes (1×3 combat + 1 boss per floor):

| Floor | Combat XP each | Boss XP | Floor clear total |
|---|---|---|---|
| 1 | 5 | 30 | 45 |
| 2 | 10 | 60 | 90 |
| 3 | 15 | 90 | 135 |

A 3-floor Crypt clear awards 270 XP per surviving hero — enough to push a recruit from 0 → 200 (level 2), with leftover toward level 3. Reaching level 5 (4000 XP) takes ~15 deep clears.

### Level-up application (`data/leveling.ts`)

```ts
export function applyLevelUps(hero: Hero, prevLevel: number, newLevel: number): Hero {
  if (newLevel <= prevLevel) return hero;
  const def = CLASSES[hero.classId];
  const levels = newLevel - prevLevel;
  const hpBump = 2 * levels;
  const primaryBump = (def.primaryStat === 'crit' ? 2 : 1) * levels;
  const newBaseStats: Stats = { ...hero.baseStats };
  newBaseStats[def.primaryStat] += primaryBump;
  return {
    ...hero,
    baseStats: newBaseStats,
    maxHp: hero.maxHp + hpBump,
    currentHp: hero.currentHp + hpBump,
    level: newLevel,
    pendingPerk: hero.pendingPerk || newLevel >= MAX_LEVEL,
  };
}
```

The `pendingPerk` flag is sticky — `false || true` stays `true` across subsequent calls. Once set, only the camp picker (Cluster B · 8) clears it.

### XP awards in `completeCombat`

After `updatedPartyLiving` is computed (around `run_state.ts:100`), award XP. Sketch:

```ts
const completedNode = runState.currentFloorNodes[runState.currentNodeIndex];
const isBoss = completedNode.type === 'boss';
const xpReward = isBoss
  ? xpForBossNode(runState.currentFloorNumber)
  : xpForCombatNode(runState.currentFloorNumber);

const partyAfterXp = updatedPartyLiving.map((hero) => {
  const newXp = hero.xp + xpReward;
  const newLevel = levelForXp(newXp);
  const heroWithXp = { ...hero, xp: newXp };
  return applyLevelUps(heroWithXp, hero.level, newLevel);
});
```

`partyAfterXp` then replaces `updatedPartyLiving` in the rest of the function. The `applyLevelUps` call is a no-op when `newLevel === hero.level`.

XP is awarded *after* wound application but *before* any other RunState updates — order matters because applyLevelUps reads the post-combat `currentHp/maxHp`.

### Perk-effect application in combat

`getEffectiveStat` extends to also walk perk effects. After the existing trait loop:

```ts
if (stat !== 'hp' && combatant.perkId) {
  const perk = PERKS[combatant.perkId];
  for (const effect of perk.statEffects ?? []) {
    if (effect.stat === stat && evaluateTraitCondition(effect.condition, combatant)) {
      total += effect.delta;
    }
  }
}
```

`buildCombatState` adds one line in the heroes loop:

```ts
createHeroCombatant(hero.classId, (i + 1) as SlotIndex, `p${i}`, {
  // existing overrides…
  ...(hero.perkId !== undefined ? { perkId: hero.perkId } : {}),
});
```

The `evaluateTraitCondition` function already supports `inSlot` and `belowHpRatio` — perks can use those conditions for free if any future perk wants conditional effects. Tier 2 perks are all unconditional.

### HP-effect perks

Tier-2 perk catalog uses `hpEffect` for "Resolute" and "Steadfast" (each `+10% HP`). These apply on perk-pick, not in `getEffectiveStat` (HP isn't a per-lookup stat). The Cluster B · 8 picker UI will be responsible for recomputing `maxHp` and adjusting `currentHp` proportionally when the player picks an HP-effect perk. **This spec doesn't ship the HP-effect application path** — it lands with the picker UI. The data is in place; consumers handle it. (`getEffectiveStat` already gates HP from trait stat-effect application; perks follow the same rule.)

### Save loading

`normalizeSaveFile` extends to backfill missing per-hero fields:

```ts
function normalizeSaveFile(file: SaveFile): SaveFile {
  return {
    ...file,
    stash: file.stash ?? createStash(),
    roster: { ...file.roster, heroes: file.roster.heroes.map(normalizeHero) },
  };
}

function normalizeHero(h: Hero): Hero {
  return {
    ...h,
    xp: h.xp ?? 0,
    level: h.level ?? 1,
    pendingPerk: h.pendingPerk ?? false,
  };
}
```

(Final shape verified against the actual `Roster` type at implementation; the design intent is "default missing fields at load.")

### Perk catalog (`data/perks.ts`)

| Class | Perk A (id, effect) | Perk B (id, effect) |
|---|---|---|
| Knight | `iron_will` — +1 Defense | `resolute` — +10% HP |
| Archer | `precise` — +5% Crit | `eagle_eye` — +1 Attack |
| Priest | `devout` — +1 Mind | `steadfast` — +10% HP |
| Barbarian | `berserker` — +2 Attack | `tough_skin` — +1 Defense |
| Rogue | `lethal` — +5% Crit | `evasive` — +5% Dodge |
| Mage | `arcane_power` — +1 Mind | `quick_cast` — +1 Speed |

Concrete:

```ts
iron_will: {
  id: 'iron_will',
  name: 'Iron Will',
  description: '+1 Defense',
  classId: 'knight',
  statEffects: [{ stat: 'defense', delta: 1 }],
},
resolute: {
  id: 'resolute',
  name: 'Resolute',
  description: '+10% HP',
  classId: 'knight',
  hpEffect: { delta: 10, mode: 'percent' },
},
// …
```

```ts
export const CLASS_PERK_PAIRS: Record<ClassId, readonly [PerkId, PerkId]> = {
  knight:    ['iron_will',    'resolute'],
  archer:    ['precise',      'eagle_eye'],
  priest:    ['devout',       'steadfast'],
  barbarian: ['berserker',    'tough_skin'],
  rogue:     ['lethal',       'evasive'],
  mage:      ['arcane_power', 'quick_cast'],
};
```

## Tests

### `src/data/__tests__/leveling.test.ts` (new)

- `levelForXp(0)` → 1; `levelForXp(199)` → 1; `levelForXp(200)` → 2; `levelForXp(799)` → 2; `levelForXp(800)` → 3; `levelForXp(4000)` → 5; `levelForXp(99999)` → 5 (capped at MAX_LEVEL).
- `xpForCombatNode(1)` → 5; `xpForCombatNode(3)` → 15.
- `xpForBossNode(1)` → 30; `xpForBossNode(3)` → 90.
- `applyLevelUps(hero, 1, 1)` returns the hero unchanged (no-op when no level cross).
- `applyLevelUps(knightHero, 1, 2)` → `+2 maxHp`, `+2 currentHp`, `+1 defense`, `level: 2`, `pendingPerk: false`.
- `applyLevelUps(rogueHero, 1, 2)` → `+2 maxHp`, `+2 currentHp`, `+2 crit`, `level: 2` (crit-primary special case).
- `applyLevelUps(knightHero, 1, 5)` (multi-level jump) → `+8 maxHp`, `+8 currentHp`, `+4 defense`, `level: 5`, `pendingPerk: true`.
- `applyLevelUps(knightHero, 4, 5)` → `pendingPerk: true`.
- `applyLevelUps(knightHero, 5, 5)` returns hero unchanged.

### `src/data/__tests__/perks.test.ts` (new)

- `Object.keys(PERKS).sort()` equals the 12 perk IDs sorted.
- Each perk: `id` matches map key; `name` and `description` non-empty; `classId` is a valid `ClassId`; has at least one `statEffects` or `hpEffect`.
- `CLASS_PERK_PAIRS` has exactly 6 entries (one per `ClassId`).
- For each class: pair has 2 distinct perk IDs; both members have `classId === class`.

### `src/data/__tests__/classes.test.ts`

- Each class has a defined `primaryStat`.
- Every `primaryStat` is one of `'attack' | 'defense' | 'speed' | 'mind' | 'crit' | 'dodge'` (not `hp`).

### `src/run/__tests__/run_state.test.ts`

- After a victory on a combat node at floor 1, every survivor's `xp` increases by 5; dead survivors (combatants with `isDead: true`) get no XP.
- After a victory on a boss node at floor 2, every survivor's `xp` increases by 60.
- After a victory pushes a hero from xp 195 → 200, that hero's `level` becomes 2 and stat bumps apply.
- After a victory pushes a hero from xp 0 → 800 (hypothetical windfall), `level` becomes 3, stats reflect 2 levels of bumps.
- After a victory pushes a hero to xp ≥ 4000, `pendingPerk` is `true`.
- `player_defeat` does not award XP (the wipe path returns `party: []` regardless; this is a defensive test pinning the order).

### `src/combat/__tests__/statuses.test.ts`

- Combatant with `perkId: 'precise'` reads `getEffectiveStat(c, 'crit')` as `c.baseStats.crit + 5`.
- Combatant without `perkId` reads base + statuses + traits only (perk machinery doesn't fire when undefined).
- Combatant with both `traitId: 'sturdy'` (+1 Def) and `perkId: 'iron_will'` (+1 Def) reads defense as `base + 1 + 1` (additive layering).

### `src/save/__tests__/save.test.ts`

- Loading a save where heroes lack `xp`/`level`/`pendingPerk` fields returns heroes with `xp: 0, level: 1, pendingPerk: false` defaults; `perkId` stays undefined.

### `src/heroes/__tests__/hero.test.ts` (or wherever createHero is tested)

- `createHero(...)` defaults `xp: 0, level: 1, pendingPerk: false`; `perkId` is undefined.

## Out of scope

- **Camp perk-picker UI** — Cluster B · 8. This spec sets `pendingPerk: true` and stops; the UI clears the flag and writes `perkId`.
- **HP-effect perk application** — Resolute and Steadfast add `+10% HP`; the actual recompute of `maxHp` happens in the picker UI's perk-pick handler. The data is here; the application path lands with B · 8.
- **Level-up animations / "+1!" callouts** — combat-scene polish, not part of the foundation. The events emitted by combat already include enough for a future polish pass.
- **Per-hero XP display on the hero card** — separate UI task. Could be added inline during this work but the TODO entry doesn't require it; defer.
- **Level 10 + second perk choice** — Tier 3.
- **Trait removal / perk re-pick** — Tier 3 Chapel building.
- **Benched-hero XP (Training Grounds)** — Tier 3 building.

## Surprises / call-outs

- **`xp` is cumulative, not "XP toward next level."** Letting `xp` decrement or reset would complicate the curve and break the "career XP" reading. Cap is enforced by `level`, not by `xp`.
- **Crit-primary classes get +2 per level**, others +1. Without this special case, a level-5 Rogue would have +4 Crit (≈ negligible at integer-percent), which under-rewards levels for the class whose identity is *built on* crit. Reusing the +1 rule for everyone would feel inconsistent with Rogue's 20% base crit; +2 keeps progression visible.
- **`completeCombat` adds one new mapping pass.** The function already does ~5 things; XP awards is the 6th. If it grows further, splitting into smaller helpers becomes worthwhile — flagged but not addressed here.
- **Level-up healing is intentional.** Most RPGs heal on level-up; not doing so would feel punishing in a roguelike where HP attrition matters. The +2 HP per level is small enough not to break attrition pacing (a 5-level mid-run jump heals 10 HP, roughly one combat node's chip damage).
- **Perks reuse `TraitStatEffect` / `TraitHpEffect` verbatim.** No new effect types means `evaluateTraitCondition` covers any future conditional perk for free. Slight downside: a future "perk that adds an ability" or "perk that adds a status" would need a new effect kind, which is fine — extend the union when the first such perk lands.
