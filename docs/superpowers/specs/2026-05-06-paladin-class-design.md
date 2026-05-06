# Paladin Class — Design Spec

**Date:** 2026-05-06
**Status:** Locked design, ready for implementation plan
**Related TODO:** (none yet — to be added as Cluster D · 3 alongside this spec)
**Builds on:** [`2026-05-06-sunken-keep-content-design.md`](./2026-05-06-sunken-keep-content-design.md) (spec 2; first-Crypt-clear handler already wired and waiting for class extension)

## Why

Spec 2 (Sunken Keep content) carved Paladin out as "a separate future spec that extends the same `first_crypt_clear` handler." This is that spec. Paladin is the first unlockable class — the player's reward for clearing the Crypt the first time. The class system, recruitment pipeline, perk picker, and milestone registry all already exist; this spec is purely additive content + a one-line handler extension.

After this ships:

- Defeating the Crypt floor-3 boss → `unlocks.classes` gains `'paladin'` (alongside the existing `unlocks.dungeons += 'sunken_keep'`).
- Paladin candidates appear in the Tavern hire pool at the same rate as the 6 base classes (1/7).
- Paladins recruited level up like any class; at level 5 they pick from a class-specific perk pair.

## Scope summary

**In scope:**

- 1 new `ClassId`: `'paladin'`
- 4 new `AbilityId`s: `'paladin_strike'`, `'lay_on_hands'`, `'consecrate'` (Smite is shared with Priest — see Q1)
- 1 new `StatusId`: `'consecrated'` (party HoT applied by Consecrate)
- 2 new `PerkId`s: `'righteous'`, `'vindicator'` (the level-5 perk pair)
- 1 new entry in `CLASSES` (paladin)
- 1 widening of `smite.canCastFrom` from `[2, 3]` to `[1, 2, 3]` so Paladin can cast it from slot 1
- 1 line added to the existing `first_crypt_clear` milestone handler: idempotently append `'paladin'` to `state.unlocks.classes`
- New ability entries in `abilities.ts` (paladin_strike, lay_on_hands, consecrate)
- New perk entries in `perks.ts` (righteous, vindicator)

**Out of scope (deferred):**

- **Hunter class** — gates on first Sunken Keep clear (gdd §9). Separate spec; will extend a future `first_sunken_keep_clear` handler the same way.
- **Bespoke Paladin sprite art** — Paladin renders via the existing paperdoll (sword + shield + outfit + hair + body). No bespoke art needed for this spec; visual identity comes from equipment.
- **Retroactive unlock for already-cleared saves** — pre-launch policy keeps schema at version 1; the milestone handler only fires on a *new* canonical-final-boss defeat. Players who cleared the Crypt before Paladin shipped will need to clear it again to unlock Paladin. Acceptable per saved-memory feedback (`feedback_save_migrations`).
- **Paladin recruitment-rate weighting** — Paladin appears uniformly in the tavern pool, not rarer than base classes. The unlock itself is the gate; once unlocked, Paladin is a normal hire.

## Locked decisions (brainstorm log)

| # | Question | Decision |
|---|---|---|
| Q1 | How to handle Smite (Priest already owns the id) | **A — Share** — Paladin's `abilities` array references the same `smite` id Priest uses. Same effect; balance differentiation comes from class stats and perks, not ability duplication. Requires widening `smite.canCastFrom` from `[2, 3]` to `[1, 2, 3]` so Paladin in slot 1 can cast it. No effect on Priest gameplay (Priest's preferred slots are 2-3). |
| Q2 | Stat profile relative to Knight | **B — Knight-with-magic** — `{ hp: 20, attack: 3, defense: 4, speed: 3, mind: 4, crit: 5, dodge: 5 }`. Same chassis as Knight; attack shaved by 1 to make room for mind=4. Hybrid identity comes from *what abilities do*, not *how much HP they have*. Avoids making Paladin a strict-better Knight. |
| Q3 | Ability kit | Smite (shared) + Lay on Hands (single-target burst heal, cooldown 3) + Consecrate (party HoT, cooldown 4) + paladin_strike (basic). Each ability owns one role: spike damage, burst heal, sustain heal, basic. Distinct from Priest's Mend (no-cooldown chip heal) and Bless (single-ally attack buff). |
| sub | AI priority order | `consecrate → lay_on_hands → smite → paladin_strike`. Paint sustain proactively; react to wounds; nuke when no urgent need; basic fills space. |
| Q4 | `primaryStat` (single-value identity) | `mind`. Defense ties at 4 but doesn't define the class identity. `primaryStat: mind` matches Priest and signals "Mind-scaling class" to gear pickers and UI. |
| sub | `starterLoadout` | `sword_basic` + `shield_basic`. Matches Knight (frontline + shield). No starter outfit/hat — same as every other class. |
| sub | `swapTarget` / `weaponSwaps` | **Revised post-launch follow-up:** initially declared as None ("sword-or-bust"), but discovered post-implementation that the "Archer pattern" claim didn't generalize — Archer has no same-family alternative weapons, so it never hits the off-preferred-but-same-family code path. Paladin without swap mappings dropped to Band 3 (basic-only) on axe/daggers. Added `swapTarget: 'smite'` with `weaponSwaps: { axe: 'paladin_cleaving_smite', daggers: 'paladin_quick_smite' }`. The flavor reads as "smite is holy power channeled through your weapon — different weapon, different smite." Both variants stay radiant + mind-scaling so the Paladin identity holds. |
| sub | `preferredWeapon` / `weaponFamily` | `sword` / `melee`. Equipping a holy_symbol drops Paladin to basic-only (different family) — same rule as everyone else. Hybrid identity lives in *abilities scaling on Mind*, not in cross-family equipment. |
| Q5 | Level-5 perk pair | `righteous` (+3 mind) and `vindicator` (+2 attack). Forces a meaningful identity fork between caster path (amplifies Smite + Lay on Hands; Consecrate is fixed-amplitude) and melee path (amplifies paladin_strike + frontline contribution). Avoids defense/HP perks because Paladin's chassis (HP 20, def 4) already matches Knight — pushing further into tank territory makes Paladin a strict-better Knight. |
| Q6 | Integration mechanics | (a) Modify existing `first_crypt_clear` handler to also append `'paladin'` to `unlocks.classes` (idempotent). (b) Don't seed paladin in `createDefaultUnlocks()`. (c) No save migration. (d) Tavern auto-handles via existing `state.unlocks.classes` filter. (e) UI auto-handles via `CLASSES[id]` registry — no scene edits. |

## Data model — concrete additions

### `src/data/types.ts`

```typescript
export type ClassId = 'knight' | 'archer' | 'priest' | 'barbarian' | 'rogue' | 'mage' | 'paladin';

export type AbilityId =
  | /* existing entries unchanged */
  | 'drowning_lure'
  // Paladin
  | 'paladin_strike'
  | 'lay_on_hands'
  | 'consecrate';

export type StatusId =
  // existing union entries unchanged, append:
  | 'drowning'
  | 'consecrated';

export type PerkId =
  | /* existing entries unchanged */
  | 'arcane_power' | 'quick_cast'
  // Paladin
  | 'righteous' | 'vindicator';
```

### `src/data/classes.ts`

Append one entry to `CLASSES`:

```typescript
paladin: {
  id: 'paladin',
  name: 'Paladin',
  baseStats: { hp: 20, attack: 3, defense: 4, speed: 3, mind: 4, crit: 5, dodge: 5 },
  primaryStat: 'mind',
  preferredWeapon: 'sword',
  weaponFamily: 'melee',
  basicAbility: 'paladin_strike',
  abilities: ['paladin_strike', 'smite', 'lay_on_hands', 'consecrate'],
  aiPriority: ['consecrate', 'lay_on_hands', 'smite', 'paladin_strike'],
  starterLoadout: { weapon: 'sword_basic', shield: 'shield_basic' },
},
```

### `src/data/abilities.ts`

Modify the existing `smite` entry — widen `canCastFrom` from `[2, 3]` to `[1, 2, 3]`. No other changes to smite.

Append three new entries:

```typescript
paladin_strike: {
  id: 'paladin_strike',
  name: 'Strike',
  canCastFrom: [1, 2],
  target: { side: 'enemy', slots: [1], pick: 'first' },
  effects: [{ kind: 'damage', power: 1.0, scalingStat: 'attack' }],
},

lay_on_hands: {
  id: 'lay_on_hands',
  name: 'Lay on Hands',
  canCastFrom: [1, 2, 3],
  target: { side: 'ally', filter: { kind: 'hurt' }, pick: 'lowestHp' },
  effects: [{ kind: 'heal', power: 3.0, scalingStat: 'mind' }],
  cooldown: 3,
},

consecrate: {
  id: 'consecrate',
  name: 'Consecrate',
  canCastFrom: [1, 2, 3],
  target: { side: 'ally', slots: 'all' },
  effects: [{ kind: 'poison', damagePerTurn: -3, duration: 3, statusId: 'consecrated' }],
  cooldown: 4,
  tags: ['radiant'],
},
```

**Numeric notes** (relative to existing kit, expect tuning during implementation):

- `paladin_strike` power 1.0 = same as `knight_slash`; basic-tier melee.
- `lay_on_hands` power 3.0 × mind = ~12 HP at mind=4 baseline (~2.5× Mend per cast, with longer 3-turn cooldown vs Mend's 2). Big enough to be the burst heal it advertises; small enough that Mend remains the workhorse.
- `consecrate` 3 HP/turn × 3 turns × 3 allies = **27 total party HP per cast** on cd 4. Achieved by setting `target.includeCaster: true` on the selector (engine extension landed in the same follow-up sweep). **Fixed-amplitude (does NOT scale on Mind)** — the existing `regen` effect kind has no `scalingStat` field. Adding mind-scaling to Consecrate would require engine changes outside this spec's scope. Acceptable: party HoT shape is the value, not the per-tick number.
- `damagePerTurn: -3` reuses the existing `poison` effect kind with a negative value — implementation needs to verify the engine accepts negative DoT for healing, OR a small new `'regen'` effect kind is added (out of scope; flag during implementation if `poison` doesn't support negatives).
- Smite and Lay on Hands scale on Mind; `paladin_strike` scales on Attack; Consecrate is fixed-amplitude. The `righteous` perk amplifies Smite and Lay on Hands but does NOT amplify Consecrate.

**Effect-kind risk:** `consecrate` uses `{ kind: 'poison', damagePerTurn: -3, ... }` to express "heal-over-time as a negative-damage poison." If the combat engine doesn't currently handle negative `damagePerTurn` cleanly (e.g., no max-HP cap on healing, or poison labeling treats it as damage), the implementation must add a separate `{ kind: 'regen'; healPerTurn: number; duration: number; statusId: StatusId }` effect kind. This is the single highest-risk implementation decision in the spec — flag and verify in Task 1 of the plan.

### `src/data/perks.ts`

Append two entries to `PERKS`:

```typescript
righteous: {
  id: 'righteous',
  name: 'Righteous',
  description: '+3 Mind. Smite hits harder; Lay on Hands heals more.',
  classId: 'paladin',
  statEffects: [{ stat: 'mind', delta: 3 }],
},

vindicator: {
  id: 'vindicator',
  name: 'Vindicator',
  description: '+2 Attack. Hit harder with Strike and basic melee.',
  classId: 'paladin',
  statEffects: [{ stat: 'attack', delta: 2 }],
},
```

These are paired in the perk picker via the existing class-pair lookup pattern (whatever the picker UI uses to find the pair for a given class).

### `src/run/milestones.ts`

Modify the existing `first_crypt_clear` handler to add idempotent paladin unlock alongside the existing dungeon append:

```typescript
first_crypt_clear: (state) => {
  let next = state;
  if (!next.unlocks.dungeons.includes('sunken_keep')) {
    next = {
      ...next,
      unlocks: { ...next.unlocks, dungeons: [...next.unlocks.dungeons, 'sunken_keep'] },
    };
  }
  if (!next.unlocks.classes.includes('paladin')) {
    next = {
      ...next,
      unlocks: { ...next.unlocks, classes: [...next.unlocks.classes, 'paladin'] },
    };
  }
  if (next === state) return state;  // identity preserved on full no-op
  return next;
},
```

### `src/save/save.ts`

**No change** to `createDefaultUnlocks()`. Paladin is NOT seeded; it's gated behind the milestone.

## Test impact

- `src/run/__tests__/milestones.test.ts` — the existing test "appends sunken_keep to unlocks.dungeons on a fresh state" needs widening to also assert `paladin` is appended. The "preserves classes unchanged" test (currently asserts `unlocks.classes` round-trips identically) needs replacing with an "appends paladin to unlocks.classes" test.
- `src/run/__tests__/run_state.test.ts` — the end-to-end Crypt-clear-→-Sunken-Keep-unlocked integration test should add a parallel `expect(after.unlocks.classes).toContain('paladin')` assertion.
- New tests in `src/data/__tests__/classes.test.ts` (or wherever class registration is verified) — assert `CLASSES.paladin` is registered with the expected shape.
- New tests in `src/data/__tests__/abilities.test.ts` — add the 3 new ids to `EXPECTED_IDS`; effect-shape tests for `lay_on_hands`, `consecrate`, `paladin_strike`; assertion that `smite.canCastFrom` includes 1.
- New tests in `src/data/__tests__/perks.test.ts` (or similar) — assert `righteous` and `vindicator` are registered and class-paired correctly.
- Integration test in tavern-recruitment area: after milestone fires, generated Tavern candidates can be of class `paladin`.

## Risks and open questions

- **Negative-DoT for Consecrate** (highest risk) — see "Effect-kind risk" above. If the engine doesn't support it, the implementation must add a `regen` effect kind, which expands scope by ~1 file (`combat/effects.ts` or wherever effect resolution lives) plus a test. The plan should make this a Task 1 verification: read existing `poison` effect resolution, decide between negative-poison vs new-effect-kind, document the choice.
- **Smite widening side effects** — confirm that `canCastFrom: [1, 2, 3]` for Smite doesn't break Priest tests that assert specific cast-slot constraints. Grep `__tests__` for `smite.*canCastFrom` before merging.
- **Perk picker UI** — assumes the picker auto-discovers pairs by `classId`. Verify by reading `src/scenes/perk_picker_scene.ts` (or wherever) before declaring zero-UI-change. If the picker hardcodes a class list, add 'paladin' to it.
- **Tavern hardcoded class list** — `src/camp/buildings/tavern.ts:58` has `const classes: ClassId[] = ['knight', 'archer', 'priest']` — looks like a stale narrower list separate from the unlock-driven recruitment path. Verify whether this is dead code, a non-recruitment path, or a bug that needs the same treatment. Don't fix unrelated issues, but note it during implementation.

## Future spec hooks (not implemented here)

- **Hunter class** unlocks on first Sunken Keep clear; that spec adds a `first_sunken_keep_clear` MilestoneId, a handler that appends `'hunter'` to `unlocks.classes`, and updates `detectBossMilestones` to fire on Sunken Keep floor-3 boss defeat.
- **Bespoke Paladin idle-pose sprite** if the paperdoll-only look reads as visually generic — Cluster C follow-up.
