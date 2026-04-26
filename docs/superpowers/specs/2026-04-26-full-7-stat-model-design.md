# Full 7-stat model: Mind, Crit, Dodge

**Source:** TODO Cluster A task 1
**Tier:** 2 (foundation for Tier 2 classes and gear depth)

## Goal

Extend the combat stat model from 4 stats (HP, Attack, Defense, Speed) to the full 7 specified in `gdd.md §2`: add **Mind** (scales magical damage and healing), **Crit** (per-attack chance to double a damage instance), and **Dodge** (per-incoming-attack chance to skip an attack entirely). This is foundation work for the Tier 2 Mage class (Cluster A task 4), which leans heavily on Mind, and for any future gear or perk that buffs the new stats.

## Decisions

### 1. Stat shape

Extend the `Stats` interface in `src/combat/types.ts:12-17`:

```ts
export interface Stats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  mind: number;     // primary scaling stat for magical effects
  crit: number;     // integer percent 0-100, chance to double damage
  dodge: number;    // integer percent 0-100, chance to skip an attack
}
```

`BuffableStat` (currently `'hp' | 'attack' | 'defense' | 'speed'` in `src/data/types.ts:39`) extends to include `'mind' | 'crit' | 'dodge'`. Future gear and perks need to be able to buff Mind/Crit/Dodge through the existing buff/debuff plumbing.

### 2. Per-effect scaling stat

Damage and heal effects gain an optional `scalingStat`:

```ts
{ kind: 'damage', power: 1.0, scalingStat?: 'attack' | 'mind' }   // default 'attack'
{ kind: 'heal',   power: 1.2, scalingStat?: 'attack' | 'mind' }   // default 'attack'
```

Resolver reads `effect.scalingStat ?? 'attack'` and uses `getEffectiveStat(caster, scalingStat)` accordingly. The union starts at `'attack' | 'mind'`; future scaling targets (e.g., `'currentHp'` for execute-style abilities) extend the union later — chosen this design over a coarser `tags: ['magical']` pattern specifically so each effect can specify its own scaling, opening room for non-trivial scaling sources later.

### 3. Damage pipeline (with Crit and Dodge)

Per (caster, target) inside `applyAbility`:

```
let dodged = false
if ability has any damage effect:
  if rng.percent(target.dodge):
    dodged = true
    emit 'attack_dodged' { sourceId, targetId, abilityId }

if dodged: skip ALL effects on this target

for each effect:
  damage:
    raw   = round(power × stat × radiantBonus)        # stat = attack or mind
    raw   = round(raw × (1 + markBonus))              # if marked
    isCrit = rng.percent(caster.crit)
    if isCrit: raw = raw × 2
    final = max(1, raw - defense)
    amplified = exhaustion-amplify(final)             # player-side punishment
    emit 'damage_applied' { ..., wasCrit: isCrit }

  heal: scales off scalingStat; otherwise unchanged

  buff/debuff/stun/mark/taunt/shove/pull: unchanged
```

Notes:

- **Dodge is per-target, gated on the ability having a damage effect.** Pure-utility abilities (`bulwark`, `taunt`, `bless`, `flare_arrow`) cannot be dodged — they would never have triggered the dodge roll in the first place.
- **Dodge skips ALL effects on the dodged target,** including riders like `shield_bash`'s stun. The intuition: a missed swing didn't connect, so no rider effects.
- **Crit doubles raw before defense subtraction.** Defense still mitigates; a crit on a tanky target is meaningfully better than on a soft target. Matches Darkest Dungeon convention.
- **Crit only rolls inside damage processing.** A successful dodge precludes the crit roll for that target/ability — you can't crit a swing that whiffed.

### 4. Event stream

Two changes to `CombatEvent` in `src/combat/types.ts:58-73`:

- New variant: `{ kind: 'attack_dodged'; sourceId: CombatantId; targetId: CombatantId; abilityId: AbilityId }`
- Extend existing: `damage_applied` gains a required `wasCrit: boolean` field.

`wasCrit` is required (not optional) so consumers can never silently miss the crit case — the field is always emitted, defaulting to `false` for non-crit hits.

### 5. RNG discipline

New helper in `src/util/rng.ts`:

```ts
percent(p: number): boolean   // returns true with probability clamp(p, 0, 100) / 100
```

Both crit and dodge rolls are **gated on `> 0`** before calling `rng.percent`. Combatants with `crit: 0` and `dodge: 0` consume zero additional RNG, preserving event-stream identity for existing test scenarios. The 5-seed determinism test (`combat.test.ts`) stays green because all existing combatants are migrated to defaults that include 0 in scenarios where it matters — see §8 below.

### 6. Combat playback (visual feedback)

`src/render/combat_actor.ts` and `src/scenes/combat_playback.ts` surface the new events:

- On `damage_applied` with `wasCrit: true`: spawn floating "CRIT!" text in a distinct color (gold, e.g. `#ffcc44`); action-log entry suffix `(crit)`.
- On `attack_dodged`: spawn floating "Miss!" text over the defender; action-log line `<defender> dodged <attacker>'s <ability>`.

These are presentational only; the underlying combat math is unchanged by playback.

### 7. Save schema

`CURRENT_SCHEMA_VERSION` bumps from 1 → 2 in `src/save/migration.ts`. **No migration registered.** Old (v1) saves load as `null` via the existing `migrate()` path (which returns null when no fn is registered for the source version), and the boot scene falls back to a fresh save through the existing `resolveSaveState` flow.

This is acceptable because the project is pre-launch and only internally tested by the user. Post-launch this would require a real migration; the user has elected to be re-asked at that point rather than have a default applied.

### 8. Stat defaults applied to data

**Classes** (`src/data/classes.ts`):

| Class  | HP | Attack | Defense | Speed | Mind | Crit | Dodge |
|--------|----|--------|---------|-------|------|------|-------|
| Knight | 20 | 4      | 4       | 3     | 0    | 5    | 5     |
| Archer | 14 | 5      | 2       | 5     | 0    | 15   | 10    |
| Priest | 15 | 3      | 2       | 4     | 5    | 5    | 5     |

**Enemies** (`src/data/enemies.ts`):

| Enemy             | HP | Attack | Defense | Speed | Mind | Crit | Dodge |
|-------------------|----|--------|---------|-------|------|------|-------|
| skeleton_warrior  | 12 | 3      | 2       | 3     | 0    | 5    | 5     |
| skeleton_archer   | 10 | 4      | 1       | 4     | 0    | 5    | 5     |
| ghost             | 12 | 3      | 1       | 4     | 0    | 5    | 5     |
| zombie            | 16 | 3      | 1       | 2     | 0    | 5    | 5     |
| cultist           | 10 | 3      | 1       | 3     | 3    | 5    | 5     |
| bone_lich (boss)  | 35 | 5      | 3       | 3     | 4    | 10   | 5     |

The cultist gains `mind: 3` because its kit (`dark_pact` heal, `dark_bolt` damage) gets re-tagged as mind-scaling — see §9.

### 9. Abilities re-tagged as mind-scaling

The following existing abilities gain `scalingStat: 'mind'` on their damage and heal effects:

- **`mend`** (priest heal) — heal effect.
- **`smite`** (priest radiant damage) — damage effect. Smite is divine, not weapon-physical.
- **`dark_pact`** (cultist heal) — heal effect.
- **`dark_bolt`** (cultist single-target spell) — damage effect.
- **`necrotic_wave`** (lich AoE) — damage effect.
- **`curse_of_frailty`** (lich debuff) — debuff effect; no scaling, but conceptually magical (no math change required since debuffs don't scale today; flagged here in case a future pass adds magical-debuff-amount scaling).

Untouched (remain attack-scaling):

- All Knight / Archer abilities (purely physical).
- `priest_strike` (priest's universal mace attack).
- `bone_slash`, `bone_arrow`, `rotting_bite` (skeleton + zombie melee).
- `lich_strike` (lich melee fallback).
- **`chilling_touch`** (ghost touch) — kept attack-scaling. A ghost is incorporeal but its touch is a corporeal-feeling debuff in the Crypt enemy fiction; tagging this mind-scaling against `mind: 0` would near-zero the damage. Could revisit if we ever give the ghost a non-zero Mind value.

### 10. Balance consequences (intentional, requires smoke-test)

Switching priest healing/spell scaling from attack=3 to mind=5 changes some numbers. Spelled out so we don't surprise ourselves at smoke test:

| Ability         | Before                    | After                  |
|-----------------|---------------------------|------------------------|
| `mend` heal     | round(1.2 × 3) = 4        | round(1.2 × 5) = 6     |
| `smite` damage  | round(1.1 × 3) = 3 (raw)  | round(1.1 × 5) = 6 (raw) |
| `dark_pact`     | round(1.0 × 3 attack) = 3 | round(1.0 × 3 mind) = 3 (cultist mind = 3, no change)|
| `dark_bolt`     | round(0.7 × 3 attack) = 2 | round(0.7 × 3 mind) = 2 (no change) |
| `necrotic_wave` | (lich attack 5)           | (lich mind 4)          |

`chilling_touch` is intentionally NOT in the mind-scaling list (see §9 untouched bullet) so the ghost retains current combat feel.

Cultist's healing/damage values are unchanged because cultist mind = cultist attack = 3 (deliberate so the cultist behaves identically before/after).

The Priest is intentionally buffed: `mend` heals 50% more (4 → 6) and `smite` does 100% more raw damage (3 → 6). This matches gdd's framing of Priest as Mind-primary; before this work, the Priest was strictly attack-bound which made the kit feel underpowered.

### 11. Tests

New / extended unit tests:

- `src/util/__tests__/rng.test.ts` — `rng.percent` boundary cases (0 always false, 100 always true, 50 produces ~50/50 across many rolls with a fixed seed).
- `src/combat/__tests__/effects.test.ts`:
  - Damage effect with `scalingStat: 'mind'` uses Mind not Attack.
  - Heal effect with `scalingStat: 'mind'` uses Mind not Attack.
  - Crit doubles raw before defense (target with high defense; verify the result is `max(1, 2 × raw - defense)`, not `2 × max(1, raw - defense)`).
  - `damage_applied` event always carries `wasCrit: boolean` (false for non-crit, true for crit).
- `src/combat/__tests__/dodge.test.ts` (new):
  - Dodge rolls per-target inside `applyAbility`.
  - Successful dodge emits `attack_dodged` and skips ALL effects (assert via `shield_bash`: damage + stun → dodged target receives no `damage_applied` and no `status_applied` for `stunned`).
  - Dodge does not roll for abilities with no damage effect (`bulwark`, `taunt`, `bless`, `flare_arrow`).
  - Dodge defaults to 0 (existing combatants without explicit `dodge` field don't dodge).
- `src/combat/__tests__/combat.test.ts` — existing 5-seed determinism stays green.

### 12. Out of scope

- **Crit on healing.** Heals are deterministic; only damage rolls crit.
- **Mind scaling for buff/debuff *amounts*.** `bless`'s `+2 attack` doesn't scale yet; that's Tier 2 polish per the gdd, not foundation.
- **UI surfacing of Mind/Crit/Dodge in hero card / Barracks detail view.** That's Cluster B task 10 (Wound display) territory and Cluster B task 1 (combat HUD) — separate tasks. This spec only adds the combat-playback floaters/log lines.
- **Per-class crit/dodge gear properties.** Belongs to Cluster A task 6 (gear rarity tiers) and beyond.

## Manual acceptance

1. Start a fresh save (old saves discarded automatically by the schema bump). Roster initial state still works.
2. Enter combat. Existing Tier 1 abilities behave identically except where re-tagged in §9 — verify Knight's slash, Archer's shot, etc. produce the same numbers as before.
3. Trigger Priest's `mend` on an injured ally — heals `~6` (was `~4`).
4. Force enough rolls to see at least one crit and one dodge in playback. Crit shows the gold floater + "(crit)" log; dodge shows "Miss!" floater + dodge log line.
5. Verify the 5-seed determinism vitest stays green.
