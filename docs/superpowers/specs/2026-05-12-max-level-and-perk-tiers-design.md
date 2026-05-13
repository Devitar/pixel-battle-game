# MAX_LEVEL bump (5→10) + L10 perk tier — design spec

**Date:** 2026-05-12
**Status:** Draft, awaiting review
**Source:** Brainstorm 2026-05-12, decomposed from a broader "legendary gear + L10 milestone" scope.

## Summary

Raise `MAX_LEVEL` from 5 to 10, extend the XP curve, and add a second perk tier at L10. Each hero will end the game with **two** perks (one from L5, one from L10). L10 perks introduce a constrained "triggered effect" system to the engine (5 triggers × 5 actions), establishing reusable combat-resolver hooks that later content (legendary passives) will tap.

This spec is **Spec 1 of 4** in a sequence. Sister specs (Epic tier, Legendary tier + L10 milestone gate, random legendaries + passive pool) wait on this one and are out of scope here.

## In scope

- `MAX_LEVEL` raises from 5 to 10.
- `LEVEL_THRESHOLDS` extends to 10 entries; flattened curve at high levels (L10 = 20K XP).
- Per-level stat bumps for L6-L10 continue the existing rule (2 HP + 1-2 primary stat per level via `applyLevelUps`).
- New L10 capstone perk pick — independent of the existing L5 pick. Each hero ends up with two perks at L10.
- `PerkDef` extends with an optional `triggeredEffect` (trigger + action) and a required `tier: 'l5' | 'l10'`.
- Combat resolver gains five fire-sites for triggered perks.
- 16 new L10 perks (2 per class × 8 classes).
- Hero schema: `pendingPerk` / `pickedPerkId` migrate to plural arrays.
- Schema version bump + migration step.

## Out of scope (deliberate)

- Epic & Legendary gear tiers, named boss drops, L10 milestone gate, random legendary passives — sister specs 2-4.
- Pre-run difficulty selection (gdd §5).
- Enemy scaling rework for overleveled parties (Crypt and Sunken Keep will be easy mode for L10 heroes; acceptable because future dungeons + difficulty selection are the real L10 challenge).
- New dungeons (Warren, Abyss).
- Aura-effect engine extension (e.g., perks that affect adjacent allies).
- Numerical retuning of existing L5 perks (the `tier: 'l5'` field gets added — that's mechanical, not balance).

## XP curve to L10

| Level | Threshold (cumulative XP) | Gap from previous |
|---|---|---|
| 1 | 0 | — |
| 2 | 200 | 200 |
| 3 | 800 | 600 |
| 4 | 2000 | 1200 |
| 5 | 4000 | 2000 |
| **6** | **6000** | **2000** |
| **7** | **9000** | **3000** |
| **8** | **12500** | **3500** |
| **9** | **16000** | **3500** |
| **10** | **20000** | **4000** |

L1-L5 untouched. L6-L10 added with a flattening ratio. L10 reachable in ~60 Sunken-Keep-heavy runs at current XP yields (drops as deeper dungeons ship).

## Hero schema changes

```ts
// Before (current shape — see `src/heroes/hero.ts:27-28`)
interface Hero {
  // ...
  pendingPerk: boolean;
  perkId?: PerkId;                            // singular; same field name on Combatant
}

// After
interface Hero {
  // ...
  pendingPerks: readonly ('l5' | 'l10')[];   // outstanding picks, FIFO
  pickedPerks: readonly PerkId[];            // picked perks (order: pick order)
}
```

`Combatant` (combat-state mirror of Hero) carries the same rename: `combatant.perkId` → `combatant.pickedPerks`. `getEffectiveStat` (in `src/combat/statuses.ts`) currently iterates a single perk's `statEffects`; new shape iterates all perks in `pickedPerks` and sums.

**`applyLevelUps` updates:** when the level span crosses 5, push `'l5'` to `pendingPerks`; when it crosses 10, push `'l10'`. A single multi-level transition (e.g., L4 → L10 via Training Grounds) pushes both.

**Perk-pick UI flow** (unchanged in shape): existing pending-perk indicator shows whenever `pendingPerks.length > 0`. Clicking opens the perk panel for the oldest pending tier (FIFO). On pick: append to `pickedPerks`, shift the tier off `pendingPerks`. Indicator stays visible if more pending.

## Triggered-perk system

```ts
// PerkDef extension
interface PerkDef {
  id: PerkId;
  name: string;
  description: string;
  classId: ClassId;
  tier: 'l5' | 'l10';                          // NEW: every perk lives in exactly one tier
  // L5-style (passive, additive — existing)
  statEffects?: readonly TraitStatEffect[];
  hpEffect?: TraitHpEffect;
  petAttackBonus?: number;
  // L10-style (triggered — new)
  triggeredEffect?: TriggeredEffect;
}

interface TriggeredEffect {
  trigger: PerkTrigger;
  action: PerkAction;
}

type PerkTrigger =
  | { kind: 'onCrit' }                                  // this hero crits
  | { kind: 'onKill' }                                  // this hero deals killing blow
  | { kind: 'onStruck'; whenAtFullHp?: boolean }        // this hero takes a hit
  | { kind: 'firstAttack' }                             // first action this combat
  | { kind: 'whenBelowHp'; ratio: number };             // continuous while HP fraction < ratio

type PerkAction =
  | { kind: 'gainStat'; stat: BuffableStat; delta: number; duration?: number; stacking?: boolean }
  | { kind: 'damageMod'; multiplier: number }            // outgoing damage on this attack
  | { kind: 'damageMitigation'; multiplier: number }     // incoming damage on this hit
  | { kind: 'lifesteal'; ratio: number }                 // heal ratio of damage dealt (reserved for future use)
  | { kind: 'applyStatus'; statusId: StatusId; duration: number; target: 'self' | 'other' };
```

**`CLASS_PERK_PAIRS` becomes `CLASS_PERK_TIERS`:**

```ts
export const CLASS_PERK_TIERS: Record<ClassId, Record<'l5' | 'l10', readonly [PerkId, PerkId]>>;
```

### Trigger semantics

- **`onCrit`**: fires when the attacker resolves a critical hit (after the crit decision in `resolveAttack`).
- **`onKill`**: fires when the attacker's damage instance brings the target to ≤ 0 HP (in `applyDamage`, after the HP write).
- **`onStruck`**: fires on the defender when a damage instance lands (in `applyDamage`, before final clamp). `whenAtFullHp: true` filters to "defender's HP was at max immediately before the hit."
- **`firstAttack`**: fires once per combat for the actor, on their first action (in `executeTurn` before the first action's effects).
- **`whenBelowHp`**: continuous. Evaluated at combat start and after every HP change for the perk-bearer. When `currentHp / maxHp < ratio`, the action is applied as a synthetic status (`perk_below_hp_<perkId>`); when the condition stops holding, the status is removed. This is the "passive while-condition" shape, not a one-shot trigger.

### Action semantics

- **`gainStat`**: applies as a self-buff status. `duration`-less version is permanent for the combat (typically used with `whenBelowHp` — the buff is bound to the synthetic while-condition status). `duration`-set version is timed; `stacking: true` lets multiple triggers accumulate (each a separate stack with its own timer).
- **`damageMod`**: multiplier on outgoing damage at the resolve site.
- **`damageMitigation`**: multiplier on incoming damage at the apply site.
- **`lifesteal`**: heal the perk-bearer for `ratio × damageDealt` on hit. Reserved — none of the 16 L10 perks use this in v1; left in the palette for legendary passives later.
- **`applyStatus`**: apply `statusId` to either the perk-bearer (`'self'`) or the trigger's "other party" (`'other'`). For `onCrit` / `onKill`, other = target. For `onStruck`, other = attacker.

### Stack cap

**Global cap of 5 stacks** for any `gainStat` action with `stacking: true`. When a new trigger fires at the cap, no new stack is added, but **the duration of all existing stacks is refreshed to full**. This keeps the snowball alive as long as the player keeps triggering it — kills don't get punished for being at cap.

When the duration of a stack expires without a refresh, that stack alone falls off (independent timers per stack). Multi-stack decay is therefore staggered: stacks earned earliest fall off earliest unless refreshed.

## The 16 L10 perks

| Class | Perk | Trigger | Action |
|---|---|---|---|
| Knight | **Unbreakable** | `onStruck { whenAtFullHp: true }` | `damageMitigation 0.5` |
| Knight | **Last Stand** | `whenBelowHp 0.3` | `gainStat defense +4` |
| Archer | **Eagle's Mark** | `onCrit` | `applyStatus 'mark' 3 turns, target: 'other'` (+25% dmg taken) |
| Archer | **First Strike** | `firstAttack` | `damageMod 2.0` |
| Priest | **Sanctity** | `whenBelowHp 0.5` | `gainStat mind +4` |
| Priest | **Holy Vigor** | `onStruck` | `applyStatus 'regen' 3 turns, target: 'self'` (+5 HP/turn) |
| Barbarian | **Rampage** | `onKill` | `gainStat attack +2, duration 3, stacking: true` |
| Barbarian | **Bloodlust** | `whenBelowHp 0.5` | `gainStat attack +4` |
| Rogue | **Backstab** | `firstAttack` | `damageMod 2.5` |
| Rogue | **Phantom** | `onCrit` | `gainStat dodge +20, duration 2` |
| Mage | **Spellweaver** | `onKill` | `gainStat mind +2, duration 3, stacking: true` |
| Mage | **Arcane Surge** | `onCrit` | `applyStatus 'mark' 2 turns, target: 'other'` (+50% dmg taken) |
| Paladin | **Crusader** | `onKill` | `gainStat mind +2, duration 3, stacking: true` |
| Paladin | **Aegis** | `whenBelowHp 0.4` | `gainStat defense +3` |
| Hunter | **Pack Tactics** | `onKill` | `gainStat speed +1, duration 2, stacking: true` |
| Hunter | **Killer Instinct** | `onCrit` | `gainStat attack +2, duration 2, stacking: true` |

**Trigger distribution:** `onCrit` ×4, `onKill` ×4, `onStruck` ×2, `firstAttack` ×2, `whenBelowHp` ×4. Every trigger gets exercised at least twice in production data.

**Snowball perks** (5): Rampage, Spellweaver, Crusader, Pack Tactics, Killer Instinct. All cap at 5 stacks per the global rule.

**Note on the Hunter pet:** Hunter's pet is a separate combatant with its own stats. The two L10 Hunter perks (Pack Tactics, Killer Instinct) buff the Hunter, not the pet. Pet buffs would require a separate trigger target option and are out of scope here — the L5 perk `beastmaster` (`petAttackBonus`) is the only pet-targeted perk in v1.

**Note on existing `'mark'` and `'regen'` statuses:** implementation must check whether these `StatusId` values already exist in `src/data/statuses.ts` (or wherever statuses are defined). If yes, reuse. If not, author minimal definitions as part of this spec (they're trivially small: a status with a stat delta or HP/turn effect plus a duration).

## Combat resolver integration

Five new fire-sites in the existing combat loop:

| Hook site | Existing function | Action |
|---|---|---|
| Crit decision resolves | `resolveAttack` (just after crit check, before damage calc) | Fire `onCrit` perks on attacker |
| Damage instance lands | `applyDamage` (before HP write) | Fire `onStruck` perks on defender (evaluate `whenAtFullHp` filter against pre-write HP) |
| Damage instance kills | `applyDamage` (after HP write, if HP ≤ 0) | Fire `onKill` perks on attacker |
| Actor's first action | `executeTurn` (before first action) | Fire `firstAttack` perks (mark "fired" on combatant state so it doesn't repeat) |
| HP changes | wherever HP mutates (damage, heal, combat start) | Re-evaluate `whenBelowHp` perks; add/remove synthetic status |

Each fire-site reads the perk-bearer's `pickedPerks`, looks up each perk's `triggeredEffect` in `PERKS`, evaluates trigger filters, and applies the action.

The resolver introduces a small helper module — probably `src/combat/perk_hooks.ts` — that consumers call from the five sites. Keeps the resolver hook-by-hook readable.

## Save migration

**`CURRENT_SCHEMA_VERSION` increments** (per the 2026-05-10 policy lift).

**Migration** (pseudocode; concrete version numbers and import paths resolved during implementation):

```ts
function migrateHeroPerks(hero: HeroPrev): HeroNext {
  const { pendingPerk, perkId, ...rest } = hero;
  return {
    ...rest,
    pendingPerks: pendingPerk ? ['l5'] : [],
    pickedPerks: perkId ? [perkId] : [],
  };
}
```

Applied to every hero-bearing path in the save:
- `roster` — primary store of hero objects
- `runState.party` — in-flight run (hero objects copied here for the duration of the run)

`SaveFile.traineeHeroIds` stores only ids (verified in `src/save/save.ts:33` — `readonly (string | null)[]`); the hero objects themselves live in `roster`, so no separate trainees path needs migration.

**Loss-less:** before migration, only L5 perks existed. Any pending perk was an L5 pending perk. Any picked perk was an L5 picked perk.

**No migration needed for:**
- `Hero.level` (saved values ≤ 5 are valid in the new MAX_LEVEL = 10 range)
- `Hero.xp` (existing XP values produce the same level under the extended `levelForXp`)
- `PerkDef.tier`, `PerkDef.triggeredEffect`, all type extensions — type-only, not serialized

## Testing strategy

### Updates to existing tests

- `src/data/__tests__/leveling.test.ts` — `MAX_LEVEL` assertion (5 → 10); `LEVEL_THRESHOLDS` length + content.
- Any test asserting `hero.pendingPerk` / `hero.pickedPerkId` — shift to the new array fields.
- Test asserting `CURRENT_SCHEMA_VERSION` value.

### New tests

| Area | Coverage |
|---|---|
| `applyLevelUps` crossing boundaries | L4→L5 pushes `'l5'`; L9→L10 pushes `'l10'`; L4→L10 pushes both (order: l5 then l10) |
| `levelForXp` at new thresholds | exact-threshold and boundary tests for L6-L10 |
| Migration | old save with `pendingPerk: true` + `pickedPerkId` migrates; old save without either also migrates; idempotency on already-migrated saves |
| `PerkDef.tier` consistency | every perk in `PERKS` has a `tier`; `CLASS_PERK_TIERS[class][tier]` references exist and are valid |
| Triggered-perk hooks — one minimal test per (trigger × action) combination used | `onCrit` + `applyStatus` (Eagle's Mark applies Mark to target on crit); `onKill` + `gainStat duration stacking` (Rampage adds a stack; stacks decay); `whenBelowHp` + `gainStat` untimed (Last Stand applies at HP < 30%, removes when healed past 30%); `onStruck whenAtFullHp:true` + `damageMitigation` (Unbreakable fires on full-HP hit, not on low-HP hit); `firstAttack` + `damageMod` (Backstab doubles first action only, doesn't double 2nd action) |
| Stack cap | snowball perk capped at 5 stacks; 6th trigger refreshes existing stacks' duration but adds no new stack; per-stack independent timer decay |
| Status defs | any newly authored status (e.g., `mark`, `regen`) has minimal lifecycle test (applied, ticks, expires) |

## Follow-ups (sister specs after this ships)

Add as TODO entries pointing at this spec as source:

1. **Spec 2 — Epic gear tier.** Rarity union extends to 5 entries (`common | uncommon | rare | epic | legendary`); `RARITY_TABLE` row(s) for Epic; affix count = 3 at Epic; Blacksmith upgrade cost / sell value for Epic; UI rarity color.
2. **Spec 3 — Legendary tier + L10 milestone gate + named boss drops.** Item shape extends with `legendaryId?` + `legendaryPassive?`; 4 named legendaries (2 per existing boss); new `MilestoneId 'first_hero_l10'` with detection at the XP-grant site; hard gate (pre-L10: bosses drop epic-table roll; post-L10: named legendary).
3. **Spec 4 — Random legendaries + curated unique-passive pool.** Random legendary roll on non-boss drops (low rate, post-L10); unique-passive pool reusing this spec's trigger/action system; slot rules.
4. **Pre-run difficulty selection** (gdd §5) — independent of legendary chain.
5. **Enemy scaling for overleveled parties** — defer until at least Spec 3 ships.

## Decisions made during this brainstorm

- **Two perk tiers, not three.** Rejected an L3/L6/L10 split because L5 stays untouched (less migration risk) and 16 new perks is already substantial content.
- **Constrained 5×5 hook palette.** Rejected open-ended effect languages and ambitious perks (positional swap on dodge, mid-combat extra turn, summon-on-kill, ability-specific modifiers like "Lay on Hands cleanses one debuff") because each would be its own engine extension. The palette delivers "build-defining" perks for all 8 classes without sprawl.
- **Global 5-stack cap.** Rejected per-perk caps (over-knobbed) and no cap (unbounded snowball).
- **L5 perks stay numerically unchanged.** Only the `tier: 'l5'` field gets added — mechanical. Resisted the urge to retune L5 alongside L10.
- **Enemy scaling deferred.** L10 heroes will steamroll Crypt/Sunken Keep; accepted because Warren/Abyss/difficulty-selection are the real L10 challenge. Calling this out explicitly in the spec rather than silently shipping it.
- **L10 = 20K XP, ~60 Sunken-Keep runs to reach.** Rejected 26K (~100 runs, too slow given current dungeon roster) and 40K (~150 runs, milestone fires too late in a sister spec).

## Risk flags

- **Combat resolver complexity.** The five new fire-sites and the per-stack status system are the meat of the implementation. Test coverage here is critical to avoid silent regressions in existing combat flows (which already have many edge cases per gdd §11).
- **`whenBelowHp` evaluation timing.** Needs to fire on every HP mutation, including from regen ticks and from the perk's own actions (which can themselves heal the bearer). Watch for re-entrancy and oscillation.
- **`firstAttack` "fired" state.** Needs to be on per-combat combatant state, cleared at combat start. Not on Hero (which persists across combats).
- **Stack-cap behavior across stat sources.** Must not interact with non-perk buffs (e.g., gear-rolled stat affixes). The cap is per-perk, not per-stat.
