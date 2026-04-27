# Class: Barbarian

**Source:** TODO Cluster A task 1
**Tier:** 2 (first of three Tier 2 classes per gdd §3 + §10)

## Goal

Implement the Barbarian — bruiser archetype, slot 1–2, attack-primary. Three signature abilities (Cleave, Rampage, Bloodthirst) plus a universal basic Swing. The build should land all four abilities, the class entry, the AI gates needed to make the kit play correctly, and the Tavern hook so Barbarian is rollable from a fresh save.

## Decisions

### 1. Stat block

| | HP | Attack | Defense | Speed | Mind | Crit | Dodge |
|---|---|---|---|---|---|---|---|
| **Knight** (existing baseline) | 20 | 4 | 4 | 3 | 0 | 5 | 5 |
| **Barbarian** | 22 | 6 | 3 | 3 | 0 | 10 | 5 |

Reasoning:
- **HP 22** (highest in roster). Bruiser fantasy + headroom for Rampage's defense-drop turns.
- **Attack 6** (highest in roster). Primary stat per gdd.
- **Defense 3** (one below Knight). Less armored — Rampage's debuff feels real because base is already lower.
- **Speed 3** matches Knight; melee frontline is slow.
- **Crit 10** between Knight (5) and Archer (15). Barbarians swing big and crit lands often enough to feel; Bloodthirst's heal-on-kill triggers more reliably with non-trivial crit.
- **Dodge 5** baseline; heavy melee doesn't dodge.

### 2. Weapon type

`WeaponType` extends:

```ts
export type WeaponType = 'sword' | 'bow' | 'holy_symbol' | 'axe';
```

Barbarian's `preferredWeapon: 'axe'`. The `'axe'` family covers axe / battleaxe / hatchet variants from the catalog. Greatsword is mentioned in the gdd but no greatsword frame exists in the catalog yet; the family stays `'axe'` until art lands. Cluster A task 6 (Gear-modifies-abilities rule) handles weapon-family substitutions later.

### 3. Class entry (`src/data/classes.ts`)

```ts
barbarian: {
  id: 'barbarian',
  name: 'Barbarian',
  baseStats: { hp: 22, attack: 6, defense: 3, speed: 3, mind: 0, crit: 10, dodge: 5 },
  preferredWeapon: 'axe',
  abilities: ['barbarian_swing', 'cleave', 'rampage', 'bloodthirst'],
  aiPriority: ['rampage', 'cleave', 'bloodthirst', 'barbarian_swing'],
  starterLoadout: {
    weapon: String(SPRITE_NAMES.weapon.battleaxe_tier1),
  },
},
```

`ClassId` union extends with `'barbarian'`.

`battleaxe_tier1` (frame 105) is the chosen starter weapon — reads as a two-handed barbarian weapon and contrasts visibly with Knight's sword + shield.

### 4. Abilities (`src/data/abilities.ts`)

```ts
barbarian_swing: {
  id: 'barbarian_swing',
  name: 'Swing',
  canCastFrom: [1, 2],
  target: { side: 'enemy', slots: [1] },
  effects: [{ kind: 'damage', power: 1.0 }],
},

cleave: {
  id: 'cleave',
  name: 'Cleave',
  canCastFrom: [1, 2],
  target: { side: 'enemy', slots: [1, 2] },
  effects: [{ kind: 'damage', power: 0.7 }],
  aiCondition: { kind: 'minTargets', n: 2 },
},

rampage: {
  id: 'rampage',
  name: 'Rampage',
  canCastFrom: [1, 2],
  target: { side: 'enemy', slots: [1] },
  effects: [
    { kind: 'damage', power: 1.5 },
    { kind: 'debuff', stat: 'defense', delta: -2, duration: 2, statusId: 'enraged', selfTarget: true },
  ],
  cooldown: 2,
  aiCondition: { kind: 'casterHpBelow', ratio: 0.5 },
},

bloodthirst: {
  id: 'bloodthirst',
  name: 'Bloodthirst',
  canCastFrom: [1, 2],
  target: { side: 'enemy', slots: [1] },
  effects: [{ kind: 'damage', power: 1.0, healOnKill: 0.5 }],
},
```

AI ordering rationale:

- **Rampage first** — fires only when caster HP < 50% (panic button); falls through otherwise. Does NOT compete with cleave/bloodthirst at full HP.
- **Cleave second** — fires only when 2+ targets in slots 1-2; falls through to Bloodthirst/Swing if only one front-liner.
- **Bloodthirst third** — opportunistic: at base attack 6, against a target with HP 6 or less (defense considered), Bloodthirst's `power 1.0` damage will be lethal and the heal triggers. No condition; always available if not on cooldown. Picked over Swing whenever a weak enemy is reachable.
- **Swing last** — universal fallback when nothing better fires.

### 5. Three small extensions to types/effect resolver

**5a. `damage` effect gains `healOnKill?: number`** (`src/data/types.ts`):

```ts
| { kind: 'damage'; power: number; scalingStat?: 'attack' | 'mind'; healOnKill?: number }
```

In `effects.ts:applyDamage`, after the existing `if (lethal)` block, if `effect.healOnKill !== undefined`:

```ts
const scalingStat = effect.scalingStat ?? 'attack';
const healAmount = Math.round(effect.healOnKill * getEffectiveStat(caster, scalingStat));
const actual = Math.min(healAmount, caster.maxHp - caster.currentHp);
caster.currentHp += actual;
events.push({ kind: 'heal_applied', sourceId: caster.id, targetId: caster.id, amount: actual });
```

The heal scales off the same `scalingStat` as the damage (so a hypothetical mind-scaled bloodthirst-style spell heals from mind too). Heal is capped by missing HP. Emits a regular `heal_applied` event so playback renders it without new code.

**5b. `buff`/`debuff` effects gain `selfTarget?: boolean`** (`src/data/types.ts`):

```ts
| { kind: 'buff'; stat: BuffableStat; delta: number; duration: number; statusId: StatusId; selfTarget?: boolean }
| { kind: 'debuff'; stat: BuffableStat; delta: number; duration: number; statusId: StatusId; selfTarget?: boolean }
```

In `effects.ts:applyAbility`, **before** the per-target loop, walk `ability.effects` once and apply any `selfTarget: true` effects to the caster (regardless of dodge / target count). Then the per-target loop processes only the non-`selfTarget` effects.

Self-effects fire **once per cast** regardless of how many targets dodge. This means a fully-dodged Rampage still costs the caster their defense — flavor: "you over-extended even though you whiffed." Documented inline.

Note: this changes `applyAbility`'s loop from "for each effect, for each target" (Cluster A task 1's restructure was target-major) to "self-effects once, then for each target apply non-self-effects." Snapshot tests that assert event order may need updating; verify in implementation.

**5c. New `aiCondition` field on `Ability`** (`src/data/types.ts`):

```ts
export type AiCondition =
  | { kind: 'minTargets'; n: number }       // resolved targetIds.length >= n
  | { kind: 'casterHpBelow'; ratio: number }; // caster.currentHp / caster.maxHp < ratio

export interface Ability {
  // ...existing fields...
  aiCondition?: AiCondition;
}
```

In `combat/ability_priority.ts:pickAbility`, after the existing target-list filter, evaluate `ability.aiCondition` against `(caster, targetIds)`. If it returns false, `continue`. Helper:

```ts
function checkAiCondition(cond: AiCondition, caster: Combatant, targetIds: readonly CombatantId[]): boolean {
  switch (cond.kind) {
    case 'minTargets': return targetIds.length >= cond.n;
    case 'casterHpBelow': return caster.maxHp > 0 && caster.currentHp / caster.maxHp < cond.ratio;
  }
}
```

Lives in `ability_priority.ts` for now; if the predicate set grows past 3-4 it migrates to `ai_conditions.ts`.

### 6. New status id

`StatusId` extends with `'enraged'` (used by Rampage's self-debuff).

### 7. Combat HUD glyph

`src/render/combat_actor.ts:STATUS_GLYPHS` adds:

```ts
enraged: { letter: 'E', color: '#ff4444' },
```

Distinguishes from `bulwark` (B, blue) and other status indicators.

### 8. Save schema — open question

The class definition itself doesn't change persisted save shape. BUT:

- `createDefaultUnlocks()` returns `{ classes: ['knight', 'archer', 'priest'], dungeons: ['crypt'] }`. After this work, fresh saves should include `'barbarian'` in that list.
- Existing saves carry their old `unlocks.classes` — they won't ever see Barbarian in Tavern unless we do something.

Three options (asking per the durable preference):

| Option | Effect | Cost |
|---|---|---|
| **A. Bump schema 2 → 3 + discard old saves** | Existing saves load as null; fresh save is created with the new unlocks list. User's current local save vanishes; they get a new roster. | One-line schema bump. |
| **B. Backfill unlocks on load** | Modify `load()` (or `migrate`) to add `'barbarian'` to `unlocks.classes` if missing. Preserves existing rosters. | Small addition to migrate or post-load reconciliation. |
| **C. Accept that existing saves never see Barbarian** | Only fresh saves get the class. User would need to manually clear localStorage to test Barbarian recruits. | Zero code, but bad UX even pre-launch. |

**Recommendation: A** (consistent with the per-launch policy already established for the 7-stat-model bump). User confirmed this preference and asked to be re-asked each time the save is touched. Spec assumes A unless changed.

### 9. Tavern roll pool

`createDefaultUnlocks()` in `src/save/save.ts:77` updates to:

```ts
return {
  classes: ['knight', 'archer', 'priest', 'barbarian'],
  dungeons: ['crypt'],
};
```

The Tavern recruitment generator (`src/camp/buildings/tavern.ts` per the boot scene's import) presumably rolls `classId` from `unlocks.classes`. With Barbarian in the list, it surfaces naturally. Verify at implementation time — if the generator hardcodes classes elsewhere, that needs updating too.

### 10. Tests

**Type/data registration:**
- `src/data/__tests__/abilities.test.ts` — extend `EXPECTED_IDS` with `'barbarian_swing'`, `'cleave'`, `'rampage'`, `'bloodthirst'`.
- `src/data/__tests__/classes.test.ts` (if exists; otherwise extend the closest equivalent) — assert `barbarian` is registered with the expected stat block, abilities list, AI priority.

**Effect resolver:**
- `src/combat/__tests__/effects.test.ts`:
  - `cleave` produces 2 `damage_applied` events when 2 enemies in slots 1-2 (each at `round(0.7 × attack)`).
  - `cleave` produces 1 `damage_applied` event when only 1 enemy in slots 1-2.
  - `rampage` produces 1 `damage_applied` (target enemy) AND 1 `status_applied` for `enraged` on the caster.
  - `rampage`'s self-debuff applies even when target dodges — fixture: target dodge 100, assert `attack_dodged` event AND `status_applied` for `enraged` on caster.
  - `bloodthirst` heals caster on lethal hit (assert `heal_applied` with `sourceId === targetId === casterId`, amount `round(0.5 × caster.attack)`).
  - `bloodthirst` does NOT heal when hit is non-lethal (no `heal_applied` event).
  - `bloodthirst` heal capped by caster's missing HP (caster at full HP → heal amount 0).

**AI conditions:**
- `src/combat/__tests__/ability_priority.test.ts` (extend or create):
  - `minTargets` condition: Cleave skipped when only 1 enemy in slots 1-2; Cleave picked when 2+.
  - `casterHpBelow` condition: Rampage skipped at HP > 50%; Rampage picked at HP < 50%.
  - Verify priority fall-through: a Barbarian at full HP with one front enemy picks Bloodthirst (or Swing if Bloodthirst is on cooldown), NOT Rampage and NOT Cleave.

**Save/unlocks (per option A in §8):**
- `src/save/__tests__/save.test.ts:createDefaultUnlocks` test updates to expect `'barbarian'` in the class list.
- `src/save/__tests__/migration.test.ts` may already cover the "old version returns null" behavior; if not, add a v2 → null assertion.

**Sprite/render:**
- No new tests; sprite mapping is verified visually.

### 11. Out of scope

- Greatsword sprite (catalog has axe variants only; will land with Cluster C art passes).
- Gear-modifies-abilities (Cluster A task 6) — Barbarian's kit is fixed for now; weapon-family substitution comes later.
- Stack-based Rampage (rejected per Q2; single cast with fixed cost is the design).
- Active-buff Bloodthirst with a duration (rejected per Q1; per-cast lifesteal is the design).
- Barbarian-specific crit visuals (uses the existing CRIT! floater).
- A `data/classes.test.ts` if one doesn't exist — only adding tests where existing patterns already are.

## Manual acceptance

1. Start a fresh save (per option A above, schema bump discards any old save automatically).
2. Visit Tavern. Barbarian appears in the candidate pool alongside Knight/Archer/Priest. Barbarian roll shows axe weapon, ~22 HP, ~6 Attack.
3. Recruit a Barbarian, form a party with Barbarian in slot 1.
4. Enter combat. Verify:
   - At full HP with 2+ front enemies: Barbarian picks Cleave first.
   - At full HP with 1 front enemy: Barbarian picks Bloodthirst (or Swing if Bloodthirst is on its first-ever cast turn — there's no cooldown so this is rare).
   - When Barbarian's HP drops below 50%, next turn picks Rampage. Damage is high, Barbarian's defense drops (E status icon visible), defense returns after 2 turns.
   - Bloodthirst on a low-HP enemy heals Barbarian for ~3 (`round(0.5 × 6)`).
5. Spam combats — Barbarian feels distinct from Knight (more damage, less armor, lethal-finishing).
