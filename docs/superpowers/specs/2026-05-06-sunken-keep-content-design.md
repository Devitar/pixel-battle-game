# Sunken Keep — Spec 2: Content + First-Crypt-Clear Handler

**Date:** 2026-05-06
**Status:** Locked design, ready for implementation plan
**Related TODO:** Cluster D · 1 (Sunken Keep — Spec 2)
**Builds on:** [`2026-05-05-sunken-keep-foundation-design.md`](./2026-05-05-sunken-keep-foundation-design.md) (Spec 1, completed 2026-05-05; foundation + milestone plumbing)

## Why

Spec 1 plumbed the dungeon-tier balance API, milestone registry, multi-dungeon Expeditions UI, and locked-card rendering. Nothing was visible to the player because no second dungeon existed. Spec 2 drops the Sunken Keep into the foundation as additive content — no API refactors, no new infrastructure. After spec 2 ships:

- The Crypt cleared at floor 3 → Sunken Keep unlocks in Expeditions.
- Sunken Keep renders as a tier-2 card with the T2 (blue) badge.
- 4 minion enemies + 1 boss (the Drowned King) + 4 new abilities + 1 new status (`drowning`) + concrete tier-2 balance numbers.

## Scope summary

**In scope:**

- 1 new `DungeonId`: `'sunken_keep'`
- 1 new `MilestoneId`: `'first_crypt_clear'`
- 5 new `EnemyId`s: `'drowned_knight'`, `'brine_crab'`, `'drowned_sailor'`, `'siren'`, `'drowned_king'`
- 4 new `AbilityId`s: `'drowning_embrace'`, `'tidal_smash'`, `'crushing_wave'`, `'drowning_lure'`
- 1 new `StatusId`: `'drowning'`
- New constants in `enemies.ts`: `SUNKEN_KEEP_POOL`, `SUNKEN_KEEP_BOSS`
- New entry in `dungeons.ts`: `DUNGEONS['sunken_keep']` (tier 2, floorsPerRun 3, rowsPerFloor 10, unlockRequirement set)
- Real tier-2 multipliers (slope `0.13`, rarity `+3`, gold `×1.5`)
- 5 new sprite mappings in `enemy_sprites.ts` (placeholders reusing existing frames)
- Milestone handler `first_crypt_clear` that idempotently appends `'sunken_keep'` to `state.unlocks.dungeons`
- Updated `detectBossMilestones` body to fire on Crypt floor-3 boss defeat

**Out of scope (deferred):**

- **Paladin class** — gdd §9 lists Paladin as a "first Crypt clear" unlock alongside Sunken Keep. Per-class precedent (Mage / Rogue / Barbarian each got their own spec) — Paladin gets its own spec later. The future Paladin spec extends the same `first_crypt_clear` handler to also append `'paladin'` to `state.unlocks.classes`. Idempotent unlocks mean players who already cleared the Crypt before Paladin ships will get the unlock on their next cashout (the milestone fires on every canonical-final-boss defeat, not just the first).
- **Bespoke art** — minion bodies and the Drowned King boss frame ship as placeholders (reused existing frames). Cluster C follow-up TODO entries: bespoke Drowned King 32×32 (high priority — currently visually identical to Bone Lich) + bespoke minion bodies (lower priority).
- **Hunter class, Chapel, Training Grounds** — gate on first-Sunken-Keep-clear (gdd §9); their handlers ship in those specs.
- **Legendary tier** — gates on first-hero-level-10 (gdd §9); separate concern.
- **Tier 3 / Tier 4 dungeons** (Warren, Abyss) — separate per-dungeon specs; balance multipliers for tier 3/4 stay placeholder until those specs ship.

## Locked decisions (brainstorm log)

| # | Question | Decision |
|---|---|---|
| Q1 | Paladin in spec 2? | **A — Out** — separate future spec. Per-class precedent. First-Crypt-clear handler in this spec only unlocks the dungeon. |
| Q2 | Ability design philosophy | **C — Hybrid** — boss gets bespoke abilities (3 new + 1 new status); minions reuse Crypt pool with one new minion ability that introduces `drowning` to encounters. |
| Q3 | Floor density | **A** — `floorsPerRun: 3, rowsPerFloor: 10` → 10/11/12 rows. Same run length as Crypt; modest density bump. |
| Q4 | Tier-2 multipliers | **B** — slope `0.13`, rarity floor-bonus `+3`, gold multiplier `×1.5`. Mid-pack tier-2; clearly steps up from Crypt without crushing post-Crypt parties. |
| Q5 | Boss archetype | **A — Drowned King** — front-line bruiser, mechanical foil to Bone Lich (back-line caster). Pull mechanic disrupts player formation. |
| sub | Drowning Embrace cooldown | 3 — recurring threat, not one-shot. |
| Q6 | Minion roster | Drowned Knight, Brine Crab, Drowned Sailor, Siren. Siren introduces `drowning` status to minion combat via new `drowning_lure` ability. Brine Crab uses existing `rotting_bite` (thematic mismatch accepted). |
| Q7 | Art approach | **A** — placeholders reusing existing frames; bespoke art deferred to Cluster C. |
| sub | Tier-2 badge color | Lock spec 1's placeholder `0x4488cc` (blue) as the real T2 color — sea theme reads. |
| sub | Milestone handler body | Idempotent `unlocks.dungeons += 'sunken_keep'`; future Paladin spec extends same handler. |
| sub | Sprite placeholders | `ENEMY_BODY` reuse: Drowned Knight ≡ skeleton, Brine Crab ≡ zombie, Drowned Sailor ≡ skeleton, Siren ≡ cultist; Drowned King reuses Bone Lich's `bossSprite: 0`. |

## Data model — concrete additions

### `src/data/types.ts`

```typescript
export type DungeonId = 'crypt' | 'sunken_keep';

export type MilestoneId = 'first_crypt_clear';

export type EnemyId =
  | 'skeleton_warrior'
  | 'skeleton_archer'
  | 'ghost'
  | 'zombie'
  | 'cultist'
  | 'bone_lich'
  // Sunken Keep
  | 'drowned_knight'
  | 'brine_crab'
  | 'drowned_sailor'
  | 'siren'
  | 'drowned_king';

export type AbilityId =
  | /* existing... */
  | 'drowning_embrace'
  | 'tidal_smash'
  | 'crushing_wave'
  | 'drowning_lure';

export type StatusId = /* existing... */ | 'drowning';
```

### `src/data/dungeons.ts`

```typescript
import { CRYPT_BOSS, CRYPT_POOL, SUNKEN_KEEP_BOSS, SUNKEN_KEEP_POOL } from './enemies';
import type { DungeonDef, DungeonId } from './types';

export const DUNGEONS: Record<DungeonId, DungeonDef> = {
  crypt: {
    id: 'crypt',
    name: 'The Crypt',
    theme: 'Undead ruins',
    tier: 1,
    floorsPerRun: 3,
    enemyPool: CRYPT_POOL,
    bossId: CRYPT_BOSS,
  },
  sunken_keep: {
    id: 'sunken_keep',
    name: 'The Sunken Keep',
    theme: 'Flooded castle',
    tier: 2,
    floorsPerRun: 3,
    rowsPerFloor: 10,
    enemyPool: SUNKEN_KEEP_POOL,
    bossId: SUNKEN_KEEP_BOSS,
    unlockRequirement: 'Defeat the Bone Lich',
  },
};
```

### `src/data/enemies.ts` (append to `ENEMIES`)

```typescript
// Sunken Keep — minions
drowned_knight: {
  id: 'drowned_knight',
  name: 'Drowned Knight',
  role: 'minion',
  baseStats: { hp: 14, attack: 4, defense: 3, speed: 3, mind: 0, crit: 5, dodge: 5 },
  tags: ['humanoid'],
  abilities: ['bone_slash', 'bone_throw'],
  aiPriority: ['bone_slash', 'bone_throw'],
  preferredSlots: [1, 2],
},
brine_crab: {
  id: 'brine_crab',
  name: 'Brine Crab',
  role: 'minion',
  baseStats: { hp: 18, attack: 3, defense: 4, speed: 2, mind: 0, crit: 5, dodge: 0 },
  tags: ['beast'],
  abilities: ['rotting_bite', 'lurch'],
  aiPriority: ['rotting_bite', 'lurch'],
  preferredSlots: [1, 2],
},
drowned_sailor: {
  id: 'drowned_sailor',
  name: 'Drowned Sailor',
  role: 'minion',
  baseStats: { hp: 11, attack: 5, defense: 1, speed: 4, mind: 0, crit: 5, dodge: 5 },
  tags: ['humanoid'],
  abilities: ['bone_arrow'],
  aiPriority: ['bone_arrow'],
  preferredSlots: [3, 4],
},
siren: {
  id: 'siren',
  name: 'Siren',
  role: 'minion',
  baseStats: { hp: 12, attack: 3, defense: 1, speed: 4, mind: 4, crit: 5, dodge: 10 },
  tags: ['humanoid'],
  abilities: ['drowning_lure', 'dark_bolt'],
  aiPriority: ['drowning_lure', 'dark_bolt'],
  preferredSlots: [3, 4],
},

// Sunken Keep — boss
drowned_king: {
  id: 'drowned_king',
  name: 'The Drowned King',
  role: 'boss',
  baseStats: { hp: 50, attack: 6, defense: 4, speed: 2, mind: 0, crit: 10, dodge: 0 },
  tags: ['humanoid'],
  abilities: ['drowning_embrace', 'tidal_smash', 'crushing_wave'],
  aiPriority: ['drowning_embrace', 'crushing_wave', 'tidal_smash'],
  preferredSlots: [1, 2],
},
```

```typescript
export const SUNKEN_KEEP_POOL: readonly EnemyId[] = [
  'drowned_knight',
  'brine_crab',
  'drowned_sailor',
  'siren',
];

export const SUNKEN_KEEP_BOSS: EnemyId = 'drowned_king';
```

### `src/data/abilities.ts` (append to `ABILITIES`)

```typescript
drowning_embrace: {
  id: 'drowning_embrace',
  name: 'Drowning Embrace',
  canCastFrom: [1, 2, 3],
  target: { side: 'enemy', slots: [3], pick: 'first' },
  effects: [
    { kind: 'pull', slots: 2 },
    { kind: 'poison', damagePerTurn: 3, duration: 3, statusId: 'drowning' },
  ],
  cooldown: 3,
},

tidal_smash: {
  id: 'tidal_smash',
  name: 'Tidal Smash',
  canCastFrom: [1, 2],
  target: { side: 'enemy', slots: [1], pick: 'first' },
  effects: [{ kind: 'damage', power: 1.4 }],
},

crushing_wave: {
  id: 'crushing_wave',
  name: 'Crushing Wave',
  canCastFrom: [1, 2, 3],
  target: { side: 'enemy', slots: 'all' },
  effects: [{ kind: 'damage', power: 0.6 }],
  cooldown: 3,
},

drowning_lure: {
  id: 'drowning_lure',
  name: 'Drowning Lure',
  canCastFrom: [3, 4],
  target: { side: 'enemy', slots: 'all', pick: 'lowestHp' },
  effects: [
    { kind: 'poison', damagePerTurn: 2, duration: 2, statusId: 'drowning' },
  ],
  cooldown: 2,
},
```

### `src/data/statuses.ts` (or wherever `StatusId` is consumed for descriptions)

`drowning` registered alongside `rotting`. Same shape — DoT poison status. Tooltip / battle-log description uses sea-themed copy ("X is drowning! −Y HP/turn"). No new effect kind; reuses `poison`.

### `src/render/enemy_sprites.ts` (append to `ENEMY_VISUALS`)

```typescript
drowned_knight: {
  bodyFrame: ENEMY_BODY.skeleton,
  weapon: SPRITE_NAMES.weapon.sword_tier2,
  shield: SPRITE_NAMES.shield.wood_buckler_tier1,
},
brine_crab: {
  bodyFrame: ENEMY_BODY.zombie,
  legs: SPRITE_NAMES.legs.black,
  feet: SPRITE_NAMES.feet.black,
},
drowned_sailor: {
  bodyFrame: ENEMY_BODY.skeleton,
  weapon: SPRITE_NAMES.weapon.bow_wood_tier1,
},
siren: {
  bodyFrame: ENEMY_BODY.cultist,
  legs: SPRITE_NAMES.legs.black,
  feet: SPRITE_NAMES.feet.black,
  outfit: SPRITE_NAMES.torso.shirt_black_long,
  hat: SPRITE_NAMES.head.wizardhat_4,
  weapon: SPRITE_NAMES.weapon.staff_green_tier2,
},
drowned_king: {
  bossSprite: 0,  // PLACEHOLDER — reuses Bone Lich frame; Cluster C follow-up paints bespoke 32x32
  bodyScale: 2,
},
```

## Tier-2 balance numbers

In `src/dungeon/scaling.ts`:

```typescript
const TIER_SCALING_SLOPE: Record<DungeonTier, number> = {
  1: 0.10,
  2: 0.13,   // Sunken Keep — was 0.10 placeholder
  3: 0.10,
  4: 0.10,
};

const TIER_GOLD_MULTIPLIER: Record<DungeonTier, number> = {
  1: 1,
  2: 1.5,    // Sunken Keep — was 1 placeholder
  3: 1,
  4: 1,
};
```

In `src/dungeon/loot.ts`:

```typescript
const TIER_RARITY_FLOOR_BONUS: Record<DungeonTier, number> = {
  1: 0,
  2: 3,      // Sunken Keep — was 0 placeholder
  3: 0,
  4: 0,
};
```

**Effective behavior at tier 2:**

- HP/Attack scaling slope of 0.13 vs 0.10 — floor 12 of Sunken Keep is `1 + 0.13 × 11 = 2.43×` baseline (vs Crypt floor 12 at `2.10×`). Roughly 16% steeper curve.
- Rarity floor-bonus +3 — Sunken Keep floor 1 reads the rarity table at floor 4 (≈5% rare). Crypt floor 1 today reads at floor 1 (0% rare). Sunken Keep floor 12 reads at floor 15 (rare-dominant).
- Gold multiplier ×1.5 — every gold-grant site (combat, elite, boss, surprise, event) pays out 50% more in Sunken Keep. Shop prices stay flat (per Q3 sub of spec 1).

## Milestone handler

In `src/run/milestones.ts`:

```typescript
import { DUNGEONS } from '@data/dungeons';
import type { DungeonId, MilestoneId } from '@data/types';
import type { SaveFile } from '@save/save';

export type MilestoneHandler = (state: SaveFile) => SaveFile;

export const MILESTONES: Record<MilestoneId, MilestoneHandler> = {
  first_crypt_clear: (state) => {
    if (state.unlocks.dungeons.includes('sunken_keep')) return state;
    return {
      ...state,
      unlocks: {
        ...state.unlocks,
        dungeons: [...state.unlocks.dungeons, 'sunken_keep'],
      },
    };
  },
};

export function detectBossMilestones(
  dungeonId: DungeonId,
  floorNumber: number,
): readonly MilestoneId[] {
  if (dungeonId === 'crypt' && floorNumber === DUNGEONS.crypt.floorsPerRun) {
    return ['first_crypt_clear'];
  }
  return [];
}

export function applyPendingMilestones(
  state: SaveFile,
  ids: readonly MilestoneId[],
): SaveFile {
  // unchanged from spec 1
  let next = state;
  for (const id of ids) {
    const handler = MILESTONES[id];
    if (handler) next = handler(next);
  }
  return next;
}
```

**Notes:**

- Idempotent — clearing the Crypt twice (or N times) only adds `'sunken_keep'` to `unlocks.dungeons` on the first occurrence.
- The cast in `applyPendingMilestones` (spec 1's `(MILESTONES as Record<string, MilestoneHandler | undefined>)`) becomes unnecessary now that `MilestoneId` is a real string union. Spec 2 simplifies it to direct indexing — TypeScript can now type-check `MILESTONES[id]()` cleanly.
- Future Paladin spec extends `first_crypt_clear` handler to also append `'paladin'` to `state.unlocks.classes` (idempotent in the same shape). Existing Crypt-clearers get Paladin unlocked on their next cashout because the milestone fires on every canonical-final-boss defeat.

## Architecture

Layers touched, all behind the existing Phaser firewall:

| Layer | Files | Role |
|---|---|---|
| **Data types** | `src/data/types.ts` | Add 1 `DungeonId`, 1 `MilestoneId`, 5 `EnemyId`s, 4 `AbilityId`s, 1 `StatusId`. |
| **Data values** | `src/data/dungeons.ts`, `src/data/enemies.ts`, `src/data/abilities.ts`, `src/data/statuses.ts` (or wherever the `drowning` status descriptor lives) | New dungeon entry, 5 enemies, 4 abilities, 1 status. |
| **Balance** | `src/dungeon/scaling.ts`, `src/dungeon/loot.ts` | Real tier-2 multipliers (slope `0.13`, gold `×1.5`, rarity bonus `+3`). |
| **Milestones** | `src/run/milestones.ts` | Register `first_crypt_clear` handler; update `detectBossMilestones` body; simplify `applyPendingMilestones` cast. |
| **Render** | `src/render/enemy_sprites.ts` | 5 new visual mappings (placeholders). |

**No scene changes.** Spec 1's multi-dungeon UI auto-renders the Sunken Keep card from `Object.values(DUNGEONS)`. Locked-card path activates because `'sunken_keep'` is NOT in `createDefaultUnlocks().dungeons`. The party-picker title becomes "The Sunken Keep — Pick Your Party" via the existing `selectedDungeonId` field.

**No API refactors.** Every API surface from spec 1 is consumed as-is.

## Test plan

**New tests:**

- `enemies.test.ts`:
  - Each new enemy is registered in `ENEMIES`.
  - Each new enemy's `abilities` references valid `AbilityId`s.
  - Each new enemy's `aiPriority` is a subset of `abilities`.
  - `SUNKEN_KEEP_POOL` references valid `EnemyId`s.
  - `SUNKEN_KEEP_BOSS` is a registered enemy with `role: 'boss'`.
- `dungeons.test.ts`:
  - `DUNGEONS.sunken_keep` is registered with `tier: 2`, `floorsPerRun: 3`, `rowsPerFloor: 10`, valid pool, valid boss.
  - `DUNGEONS.sunken_keep.unlockRequirement === 'Defeat the Bone Lich'`.
- `abilities.test.ts` (or wherever):
  - Each new ability is registered.
  - `drowning_embrace` has the expected effect shape (pull + poison with `statusId: 'drowning'`).
  - `drowning_lure` likewise.
- `milestones.test.ts`:
  - `MILESTONES.first_crypt_clear` is a function.
  - Handler is idempotent: applied to a state with `'sunken_keep'` already in `unlocks.dungeons` returns the same state.
  - Handler appends `'sunken_keep'` to `unlocks.dungeons` on a fresh state.
  - `detectBossMilestones('crypt', 3)` returns `['first_crypt_clear']`.
  - `detectBossMilestones('crypt', 1)` returns `[]`.
  - `detectBossMilestones('crypt', 4)` returns `[]` (post-canonical).
  - `detectBossMilestones('sunken_keep', 3)` returns `[]` (sunken_keep clear has no handler in spec 2).
  - `applyPendingMilestones(state, ['first_crypt_clear'])` mutates `unlocks.dungeons` correctly.
- `run_state.test.ts`:
  - Update existing `pendingMilestones` populate test: canonical-final-boss defeat in Crypt (floor 3) now populates `pendingMilestones === ['first_crypt_clear']` (replacing the spec-1 baseline assertion of `[]`).
  - Update cashout drain test: outcome.milestonesTriggered now contains `['first_crypt_clear']` after a canonical Crypt clear; SaveFile after `applyPendingMilestones` includes `'sunken_keep'` in `unlocks.dungeons`.
- `scaling.test.ts`:
  - `floorScale(1, 2)` returns `{ hp: 1, attack: 1 }` (slope baseline at floor 1).
  - `floorScale(12, 2)` returns `{ hp: ≈2.43, attack: ≈2.43 }` — verify via toBeCloseTo.
  - `floorScale(12, 2)` differs from `floorScale(12, 1)`.
  - `goldMultiplier(2) === 1.5`.
- `loot.test.ts`:
  - `_internal.rarityWeightsAt(1, 2)` differs from `_internal.rarityWeightsAt(1, 1)` (rarity bonus shifts the lookup).
  - Smoke: `rollLoot(rng, 1, 'combat', 2)` over many seeds produces a non-zero rare rate (since effective floor is 4 → ~3% rare per the table).
- `floor.test.ts`:
  - `generateFloor('sunken_keep', 1, rng)` produces 10-row floors.
  - `generateFloor('sunken_keep', 3, rng)` produces 12-row floors.
- `expeditions_layout.test.ts`:
  - Existing N=1, 2, 3, 4 tests stay valid (no change).

**Updated tests** (existing assertions that break and must be updated):

- `run_state.test.ts` — the spec-1 test that asserted `pendingMilestones === []` after canonical-final-boss defeat must update its expectation to `['first_crypt_clear']`.
- `milestones.test.ts` — spec-1's "MILESTONES is empty" test breaks (registry is no longer empty); replace with "MILESTONES has only the spec 2 entries" (Object.keys ⊂ MilestoneId values).
- `milestones.test.ts` — spec-1's "detectBossMilestones returns [] for any input" test breaks; replace with the case-coverage tests above.

**Estimated test count delta:** roughly +25-35 new + ~5-8 updated assertions. Existing baseline (after spec 1): 1543. Spec 2 should land around 1570-1580.

## Migration

Pre-launch — schema stays at version 1.

| Change | Migration |
|---|---|
| `DungeonId` adds `'sunken_keep'` | Code-only; no save migration. Existing in-flight saves with `dungeonId: 'crypt'` continue to load. |
| `MilestoneId` becomes `'first_crypt_clear'` (was `never`) | Code-only. `pendingMilestones` field on RunState stays `readonly MilestoneId[]`; old saves' `pendingMilestones: []` defaults still type-check. |
| `EnemyId` adds 5 new ids | Code-only. Existing saves never reference these ids in their RunState (Crypt-only); no migration needed. |
| `AbilityId` adds 4 new ids | Code-only. Existing saves never reference these. |
| `StatusId` adds `'drowning'` | Code-only. |
| `createDefaultUnlocks().dungeons` stays `['crypt']` | Existing saves load with their stored unlocks (typically `['crypt']`); the milestone handler unlocks `'sunken_keep'` on the first canonical-final-Crypt-boss defeat post-update. |

**Backward-compat guarantee:** A player who has already cleared the Crypt before spec 2 ships (with `unlocks.dungeons === ['crypt']` in their save) will get `'sunken_keep'` unlocked on their next canonical-final-boss defeat. The milestone fires on every clear, not just the first; the handler's `.includes` check makes this idempotent. **No save-load-time backfill needed.**

## Risks

1. **Encounter variety with pool-size 4.** Crypt has 5 enemies; Sunken Keep has 4. The `composeCombatEncounter` function picks N enemies weighted by encounter size. Smaller pool means more visual repetition. Mitigation: validate via playtest. If it feels stale, add a 5th archetype (e.g., `drowned_eel` with shove/swap mechanic) in a follow-up.
2. **Drowned Knight ≡ skeleton_warrior visually.** Same body frame + sword. Acceptable because they appear in different dungeons and never overlap. Cluster C TODO entry already filed.
3. **Drowned King reuses Bone Lich's boss frame.** Until bespoke art lands, the boss reveal visually mirrors Bone Lich. **High-priority Cluster C TODO entry should be created** — the boss is the marquee art moment.
4. **`gold_delta` symmetric scaling on penalties.** Tier 2 events that *cost* the player gold now charge `Math.round(amount × 1.5)`. A "bandits steal 30g" event becomes "steal 45g." Acceptable per design symmetry (tier-2 events scale up both rewards and penalties proportionally), but flag for playtest. If it feels punitive, opt-out via `Math.round(amount * (amount > 0 ? 1.5 : 1.0))` — single-line change in `event_resolver.ts`.
5. **`rotting` on Brine Crab is thematically rough.** Accepted in Q6; visual flavor abstracts it. If feedback is harsh, swap Brine Crab's kit to `[bone_slash, lurch]` (no DoT, pure tank archetype) — single-line edit to `enemies.ts`.
6. **Ability-table size growth.** Each new ability adds to `ABILITIES` and `AbilityId`. Spec 2 adds 4 — manageable. Future class specs (Paladin, Hunter) will add ~3-4 each. The table will grow; consider splitting `abilities.ts` into per-class/per-dungeon files if it crosses ~50 abilities. Not a spec-2 concern.

## Success criteria

- All existing tests pass after spec 2 lands; ~25-35 new tests added; ~5-8 assertions updated.
- Crypt continues to play identically to today (tier 1 unchanged; multiplier additions don't affect tier=1 callers).
- Sunken Keep entry renders as a locked card on a fresh save (not in `createDefaultUnlocks().dungeons`).
- Defeating the Crypt floor-3 boss → cashout → Sunken Keep card unlocks (`unlocks.dungeons` contains `'sunken_keep'` after cashout).
- Sunken Keep encounters compose correctly (no missing sprite frames, no missing ability handlers, no runtime errors).
- The Drowned King fight shows the Drowning Embrace pull + DoT mechanic working end-to-end (verified by a focused integration test or manual smoke).
- Tier-2 numbers visibly differ from tier-1 in playtest (gold rewards higher, rare drops more frequent, fights last longer per floor).
- New TODO entries filed for Cluster C bespoke art: (a) bespoke Drowned King 32×32, (b) bespoke Sunken Keep minion bodies.

## Hand-off / future work

- **Paladin class spec** — extends `first_crypt_clear` handler; adds `'paladin'` to `ClassId`, ability set, AI priority, sprite, starter loadout. ~Mage-equivalent surface.
- **Hunter / Chapel / Training Grounds** — gate on `first_sunken_keep_clear` (a new MilestoneId not yet introduced); the future Hunter spec or a dedicated milestone-extension spec would add this id.
- **Bespoke art for Sunken Keep** — Cluster C entries for Drowned King boss frame (high priority) and minion bodies (lower priority).
- **Pool expansion** — if encounter variety feels thin in playtest, add a 5th minion (e.g., `drowned_eel` with shove/pull mechanic) in a small follow-up.
