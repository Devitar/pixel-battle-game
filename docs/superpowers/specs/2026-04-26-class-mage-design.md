# Class: Mage

**Source:** TODO Cluster A task 2
**Tier:** 2 (third and final Tier 2 class per gdd §3 + §10)

## Goal

Implement the Mage — glass-cannon caster, slot 3, staff, Mind primary. Three signature abilities (Firebolt, Frost Nova, Arc Shock) plus a universal basic Zap. Introduces one new engine extension — generic `chance?: number` on all effect kinds — so any effect can be probabilistic. Closes out the Tier 2 class lineup.

## Decisions

### 1. Stat block

| | HP | Attack | Defense | Speed | Mind | Crit | Dodge |
|---|---|---|---|---|---|---|---|
| Priest (caster anchor) | 15 | 3 | 2 | 4 | 5 | 5 | 5 |
| **Mage** | 12 | 2 | 1 | 4 | 8 | 5 | 5 |

Reasoning:
- **HP 12** — lowest in roster (Rogue is 13). Glass-cannon caster.
- **Attack 2** — lowest. Mage doesn't melee.
- **Defense 1** — ties Rogue's lowest. No armor.
- **Speed 4** — same as Priest. Casters aren't fast.
- **Mind 8** — highest in roster (beats Priest's 5). Primary stat. All Mage abilities scale off Mind.
- **Crit 5, Dodge 5** — baseline; Mage doesn't crit-fish or evade.

Mind-scaled damage values:
- Firebolt: `round(1.0 × 8) = 8` raw, big single-target nuke.
- Frost Nova: `round(0.5 × 8) = 4` raw per target (AoE).
- Arc Shock: `round(0.8 × 8) = round(6.4) = 6` raw single-target.
- Mage Zap: `round(1.0 × 8) = 8` raw basic.

### 2. Weapon type

`WeaponType` extends:

```ts
export type WeaponType = 'sword' | 'bow' | 'holy_symbol' | 'axe' | 'daggers' | 'staff';
```

Mage's `preferredWeapon: 'staff'`. Catalog has `staff_orange_*`, `staff_blue_*`, `staff_pink_*`, `staff_green_*`. Cultist already uses `staff_green_tier2`, so Mage gets `staff_blue_tier1` (frame 96) for visual distinction.

### 3. Class entry (`src/data/classes.ts`)

```ts
mage: {
  id: 'mage',
  name: 'Mage',
  baseStats: { hp: 12, attack: 2, defense: 1, speed: 4, mind: 8, crit: 5, dodge: 5 },
  preferredWeapon: 'staff',
  abilities: ['mage_zap', 'firebolt', 'frost_nova', 'arc_shock'],
  aiPriority: ['frost_nova', 'firebolt', 'arc_shock', 'mage_zap'],
  starterLoadout: {
    weapon: String(SPRITE_NAMES.weapon.staff_blue_tier1),
  },
},
```

`ClassId` union extends with `'mage'`. No starter shield.

### 4. Abilities (`src/data/abilities.ts`)

```ts
mage_zap: {
  id: 'mage_zap',
  name: 'Zap',
  canCastFrom: [2, 3],
  target: { side: 'enemy', slots: [1] },
  effects: [{ kind: 'damage', power: 1.0, scalingStat: 'mind' }],
},

firebolt: {
  id: 'firebolt',
  name: 'Firebolt',
  canCastFrom: [2, 3],
  target: { side: 'enemy', slots: [3, 4], pick: 'first' },
  effects: [{ kind: 'damage', power: 1.0, scalingStat: 'mind' }],
  cooldown: 2,
},

frost_nova: {
  id: 'frost_nova',
  name: 'Frost Nova',
  canCastFrom: [2, 3],
  target: { side: 'enemy', slots: 'all' },
  effects: [
    { kind: 'damage', power: 0.5, scalingStat: 'mind' },
    { kind: 'debuff', stat: 'speed', delta: -2, duration: 2, statusId: 'slowed' },
  ],
  cooldown: 2,
  aiCondition: { kind: 'minTargets', n: 2 },
},

arc_shock: {
  id: 'arc_shock',
  name: 'Arc Shock',
  canCastFrom: [2, 3],
  target: { side: 'enemy', slots: [1] },
  effects: [
    { kind: 'damage', power: 0.8, scalingStat: 'mind' },
    { kind: 'stun', duration: 1, chance: 40 },
  ],
  cooldown: 2,
},
```

AI ordering rationale:

- **Frost Nova first** — `minTargets 2` gates it; falls through if only one enemy left. Damage + slow on the whole front line is the Mage's high-value action.
- **Firebolt second** — single-target back-line (`slots: [3, 4], pick: 'first'`). Always has a target if any back-line enemy is alive; otherwise falls through.
- **Arc Shock third** — single-target slot 1 + 40% chance stun. Disables the front-line attacker.
- **Mage Zap** — universal mind-scaling fallback, no cooldown.

With all three signature abilities on cooldown 2, the standard rotation is:
- T1: Frost Nova (cd starts)
- T2: Firebolt (cd starts)
- T3: Arc Shock (cd starts)
- T4: Mage Zap (everything on cd)
- T5: Frost Nova back up; rotation restarts

Frost Nova falls through to Firebolt when only one enemy remains. Firebolt falls through to Arc Shock when no back-line enemy. The kit feels distinct from Priest (heals + radiant) and from Archer (high crit, single-target back-line) by leading with AoE chip + hard-CC.

### 5. Three small extensions

**5a. New StatusId `'slowed'`**

```ts
export type StatusId = 'bulwark' | 'taunting' | 'marked' | 'blessed' | 'rotting' | 'frailty' | 'stunned' | 'chilled' | 'enraged' | 'poisoned' | 'vanished' | 'slowed';
```

`STATUS_LABEL` in `ability_describe.ts` adds `slowed: 'slowed'`. `STATUS_GLYPHS` in `combat_actor.ts` adds `slowed: { letter: 's', color: '#88ccff' }` (light blue, distinct from `chilled` which uses lowercase 'c').

**5b. `chance?: number` on every applicable effect kind** (`src/data/types.ts`)

Add `chance?: number` to all variants of `AbilityEffect`. Optional everywhere; resolver gates each effect at the top of `applyEffect`.

```ts
export type AbilityEffect =
  | { kind: 'damage'; power: number; scalingStat?: 'attack' | 'mind'; healOnKill?: number; bonusCrit?: number; chance?: number }
  | { kind: 'heal'; power: number; scalingStat?: 'attack' | 'mind'; chance?: number }
  | { kind: 'stun'; duration: number; chance?: number }
  | { kind: 'shove'; slots: number; chance?: number }
  | { kind: 'pull'; slots: number; chance?: number }
  | { kind: 'moveToSlot'; slot: SlotIndex; chance?: number }
  | { kind: 'buff'; stat: BuffableStat; delta: number; duration: number; statusId: StatusId; selfTarget?: boolean; chance?: number }
  | { kind: 'debuff'; stat: BuffableStat; delta: number; duration: number; statusId: StatusId; selfTarget?: boolean; chance?: number }
  | { kind: 'mark'; damageBonus: number; duration: number; statusId: StatusId; chance?: number }
  | { kind: 'taunt'; duration: number; statusId: StatusId; chance?: number }
  | { kind: 'poison'; damagePerTurn: number; duration: number; statusId: StatusId; chance?: number };
```

**Resolver behavior** — at the top of `applyEffect` in `effects.ts`, before the kind switch:

```ts
function applyEffect(
  ability: Ability,
  effect: AbilityEffect,
  caster: Combatant,
  target: Combatant,
  state: CombatState,
  rng: Rng,
  events: CombatEvent[],
): void {
  if (target.isDead) return;
  if (effect.chance !== undefined && !rng.percent(effect.chance)) return;
  switch (effect.kind) {
    // ...
  }
}
```

The check applies uniformly to both per-target effects (called from `applyAbility`'s per-target loop) AND self-effects (called from the pre-loop self-target pass). A failed chance roll silently skips the effect — no event emitted. Auto-battler convention.

**Interaction with dodge:** Per-target dodge is rolled once per (caster, target) inside `applyAbility` before the per-effect loop. If target dodges, ALL effects on that target skip — chance roll never even fires (already short-circuited). If target doesn't dodge, each effect rolls its own chance independently. So Arc Shock's flow against a non-dodging target: damage always lands; stun rolls 40% chance.

**5c. New event for chance-failed?** Out of scope. A failed chance silently skips. If we ever want to surface it visually (e.g., "Stun resisted!" floater), we'd add a `effect_resisted` event. Tier 2 polish.

### 6. Save schema

`CURRENT_SCHEMA_VERSION` bumps from 4 → 5. No migration; old v4 saves discarded on load (per pre-launch policy, confirmed by user).

`createDefaultUnlocks()` extends:

```ts
return {
  classes: ['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage'],
  dungeons: ['crypt'],
};
```

`generateStarterRoster` stays unchanged. Mage is recruitable via Tavern.

### 7. Tests

**Type/data registration:**
- `src/data/__tests__/abilities.test.ts` — `EXPECTED_IDS` adds `'mage_zap'`, `'firebolt'`, `'frost_nova'`, `'arc_shock'`.
- `src/data/__tests__/classes.test.ts` — `EXPECTED_IDS` adds `'mage'`.
- `src/save/__tests__/save.test.ts` — `createDefaultUnlocks` test expects `'mage'`.

**Effect resolver — `chance` field:**
- `src/combat/__tests__/effects.test.ts`:
  - `chance: 0` always skips (effect doesn't fire even when target alive and not dodging).
  - `chance: 100` always fires.
  - `chance: undefined` (default) always fires (verifies backwards compat with all existing abilities).
  - `chance` on stun: `chance: 100` always stuns; `chance: 0` never stuns; verify event presence/absence.
  - `chance` on damage (theoretical, unused today): `chance: 0` skips the damage event entirely (no `damage_applied` emitted).
  - **Verify dodge short-circuits chance:** target with dodge 100, ability with stun chance 100 → `attack_dodged` emitted, no `status_applied` (because dodge skipped the entire effect loop).

**Mage abilities (light integration):**
- `frost_nova` applies the `slowed` status to all enemies hit; verifies the debuff effect is per-target (each enemy gets their own status entry).
- `arc_shock` over 100 seeds: stun fires roughly 40% of the time (verify `status_applied` event count is in [25, 55] range).
- `firebolt` targets the back-most enemy in [3, 4] (with enemies in slots 1, 3, 4 — picks slot 3 first per the existing `pick: 'first'` semantic).

### 8. Out of scope

- **Slow status interaction with turn order.** Frost Nova's slow is a `debuff stat: 'speed'`. Verified: `computeInitiative` in `src/combat/turn_order.ts:8` already reads `getEffectiveStat(c, 'speed')`, which includes buff/debuff deltas. So slow affects turn order on the next round automatically — no special-casing needed.
- **Chance-resisted floater UI.** Failed chance rolls are silent. Adding visual feedback for "Stun resisted!" is Tier 2 UI polish.
- **Stun chance scaling with Mind.** Could add `chance + mind × 5` style scaling. Out of scope; flat 40% is the design.
- **Multi-stack slow** (cast Frost Nova twice while slow active). Per `storeStatus`'s direct-assign, the second cast overwrites the first. Acceptable.

## Manual acceptance

1. Start a fresh save (per option A above, schema bump discards any old save automatically).
2. Visit Tavern. Reroll until a Mage appears (~1-in-6 odds with 6 unlocked classes; ~50% chance per 4 candidates rolled).
3. Verify candidate display: blue staff sprite, ~12 HP, ~2 Attack, ~8 Mind.
4. Form a party with Mage in slot 3.
5. Enter combat against the standard 3-enemy Crypt encounter:
   - **Turn 1:** Mage casts Frost Nova. Each enemy takes ~4 damage and gets the `s` (slowed) status. Light-blue 's' icons appear on all 3 enemies.
   - **Turn 2:** Mage casts Firebolt on the back-most enemy (slot 3 if alive). ~8 raw damage to back-line.
   - **Turn 3:** Mage casts Arc Shock on slot 1. ~6 raw damage; sometimes the front enemy is stunned (40% chance).
   - **Turn 4:** Mage casts Zap.
   - **Turn 5:** Frost Nova back; cycle repeats (until enemies die and `minTargets 2` falls through).
6. Verify enemies' turn order shifts later in the round when slowed (compare initiative order with/without `slowed` status).
7. Spam combats — Mage feels distinct from Priest (much higher single-target damage, no healing, AoE control instead of buffs).
