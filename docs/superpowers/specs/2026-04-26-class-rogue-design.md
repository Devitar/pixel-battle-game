# Class: Rogue

**Source:** TODO Cluster A task 1
**Tier:** 2 (second of three Tier 2 classes per gdd §3 + §10)

## Goal

Implement the Rogue — striker archetype, slot 2, daggers, Attack/Crit primary. Three signature abilities (Backstab, Vanish, Poison Strike) plus a universal basic Strike. The kit forces three small engine extensions (`bonusCrit` on damage, new `moveToSlot` effect kind, new `poison` effect kind) that future Tier 2 / Tier 3 features will reuse.

## Decisions

### 1. Stat block

| | HP | Attack | Defense | Speed | Mind | Crit | Dodge |
|---|---|---|---|---|---|---|---|
| **Rogue** | 13 | 5 | 1 | 6 | 0 | 20 | 15 |

Comparison anchors: Archer `14/5/2/5/0/15/10` (similar damage, faster); Knight `20/4/4/3/0/5/5` (much tankier).

Reasoning:
- **HP 13** — lowest in roster. Squishy striker, dodges instead of tanking.
- **Attack 5** — ties Archer. Bursty striker; crit pumps the upside.
- **Defense 1** — lowest in roster. Wears no armor.
- **Speed 6** — fastest. Stabs first.
- **Crit 20** — highest. Signature stat. Backstab's `bonusCrit: 25` brings effective crit to 45% on that swing.
- **Dodge 15** — second-highest baseline. Vanish's +Dodge buff stacks on top.

### 2. Weapon type

`WeaponType` extends:

```ts
export type WeaponType = 'sword' | 'bow' | 'holy_symbol' | 'axe' | 'daggers';
```

Rogue's `preferredWeapon: 'daggers'`. Catalog has `dagger_tier1` (420) through `dagger_tier5`.

### 3. Class entry (`src/data/classes.ts`)

```ts
rogue: {
  id: 'rogue',
  name: 'Rogue',
  baseStats: { hp: 13, attack: 5, defense: 1, speed: 6, mind: 0, crit: 20, dodge: 15 },
  preferredWeapon: 'daggers',
  abilities: ['rogue_strike', 'backstab', 'vanish', 'poison_strike'],
  aiPriority: ['vanish', 'backstab', 'poison_strike', 'rogue_strike'],
  starterLoadout: {
    weapon: String(SPRITE_NAMES.weapon.dagger_tier1),
  },
},
```

`ClassId` union extends with `'rogue'`. No starter shield (rogues don't carry shields, same as Archer/Priest).

### 4. Abilities (`src/data/abilities.ts`)

```ts
rogue_strike: {
  id: 'rogue_strike',
  name: 'Strike',
  canCastFrom: [1, 2, 3],
  target: { side: 'enemy', slots: [1] },
  effects: [{ kind: 'damage', power: 1.0 }],
},

backstab: {
  id: 'backstab',
  name: 'Backstab',
  canCastFrom: [2, 3],
  target: { side: 'enemy', slots: 'furthest' },
  effects: [{ kind: 'damage', power: 1.2, bonusCrit: 25 }],
  cooldown: 2,
},

vanish: {
  id: 'vanish',
  name: 'Vanish',
  canCastFrom: [1, 2],
  target: { side: 'self' },
  effects: [
    { kind: 'moveToSlot', slot: 3 },
    { kind: 'buff', stat: 'dodge', delta: 15, duration: 2, statusId: 'vanished', selfTarget: true },
  ],
  cooldown: 2,
  aiCondition: { kind: 'casterHpBelow', ratio: 0.5 },
},

poison_strike: {
  id: 'poison_strike',
  name: 'Poison Strike',
  canCastFrom: [1, 2, 3],
  target: { side: 'enemy', filter: { kind: 'lacksStatus', statusId: 'poisoned' }, pick: 'first' },
  effects: [
    { kind: 'damage', power: 0.8 },
    { kind: 'poison', damagePerTurn: 2, duration: 3, statusId: 'poisoned' },
  ],
},
```

AI ordering rationale:

- **Vanish first** — `casterHpBelow 0.5` gates it; falls through at full HP. Defensive panic; Rogue retreats to slot 3 with a Dodge buff. Cooldown 2 prevents infinite back-pedaling.
- **Backstab second** — cooldown 2. Targets the back-most living enemy (`'furthest'`); always has a target if any enemies are alive. Keep it special; not spammable.
- **Poison Strike third** — only fires if at least one enemy lacks `poisoned` status. Falls through naturally once all enemies are DoT'd.
- **rogue_strike** — universal fallback.

Long-fight rhythm with one enemy: Backstab → Poison → Backstab → basic (target poisoned) → repeat.
Multi-enemy: Backstab nukes the back row (often the caster); Poison spreads across surviving non-poisoned targets.

Note on `vanish`'s `target: { side: 'self' }`: the moveToSlot effect implicitly operates on the caster regardless of selfTarget flag, since the effect kind takes a slot, not a target. The `buff` effect uses `selfTarget: true` to apply to the caster (the existing pattern from Rampage). Both effects target self, but expressed via different mechanisms — one inherent to the effect kind, one via the flag.

### 5. Three small extensions to types/effect resolver

**5a. `damage` effect gains `bonusCrit?: number`** (`src/data/types.ts`):

```ts
| { kind: 'damage'; power: number; scalingStat?: 'attack' | 'mind'; healOnKill?: number; bonusCrit?: number }
```

In `effects.ts:applyDamage`, the existing `wasCrit = rng.percent(getEffectiveStat(caster, 'crit'))` becomes `wasCrit = rng.percent(getEffectiveStat(caster, 'crit') + (effect.bonusCrit ?? 0))`. The clamp inside `rng.percent` handles values > 100 (always crits).

**5b. New `moveToSlot` effect kind** (`src/data/types.ts`):

```ts
| { kind: 'moveToSlot'; slot: SlotIndex }
```

Resolver behavior (`effects.ts:applyEffect` switch): treats this as a self-effect — applies to the caster regardless of the ability's target list. (Implementation note: treat it the same as `selfTarget` buffs in `applyAbility`'s pre-loop pass — see §6 below.) The resolver finds the caster's same-side ally currently in the destination slot. If found, swap caster with that ally (using existing `swap()` from `positions.ts`). If the destination slot is empty (e.g., 2-hero party trying to move to slot 3), set caster's slot directly via internal helper, emit a single `position_changed` event with `reason: 'swap'`.

Edge case: if caster is already in the destination slot, no-op (no events emitted).

**5c. New `poison` effect kind** (`src/data/types.ts`):

```ts
| { kind: 'poison'; damagePerTurn: number; duration: number; statusId: StatusId }
```

Resolver behavior: applies the status the same way `buff`/`debuff`/`stun` do (via `storeStatus`). The status's `effect` field carries the poison shape; ticking is handled in `tickStatuses` (see §6).

`StatusId` extends with `'poisoned'`.

### 6. `applyAbility` and `tickStatuses` changes

**`applyAbility` (`src/combat/effects.ts`)** — extend the existing self-target pre-loop pass to also handle `moveToSlot` effects (they're inherently self-targeted):

```ts
for (const effect of ability.effects) {
  const isSelfTarget =
    effect.kind === 'moveToSlot' ||
    ((effect.kind === 'buff' || effect.kind === 'debuff') && effect.selfTarget === true);
  if (isSelfTarget && !caster.isDead) {
    applyEffect(ability, effect, caster, caster, state, rng, events);
  }
}
```

The per-target loop's skip check extends similarly to skip `moveToSlot`.

**`tickStatuses` (`src/combat/statuses.ts`)** — add a poison-tick branch BEFORE the decrement-and-expire logic, so the tick fires every turn the status is alive (including the turn it expires):

```ts
export function tickStatuses(combatant: Combatant, events: CombatEvent[]): void {
  const ids = Object.keys(combatant.statuses);
  for (const id of ids) {
    const status = combatant.statuses[id];

    // Poison ticks first — emits damage even on the expiry turn.
    if (status.effect.kind === 'poison' && !combatant.isDead) {
      applyPoisonDamage(combatant, status.effect.damagePerTurn, status.sourceId, events);
    }

    status.remainingTurns -= 1;
    if (status.remainingTurns <= 0) {
      const e = status.effect;
      if ((e.kind === 'buff' || e.kind === 'debuff') && e.stat === 'hp') {
        combatant.maxHp -= e.delta;
      }
      delete combatant.statuses[id];
      events.push({ kind: 'status_expired', targetId: combatant.id, statusId: status.statusId });
    }
  }
}

function applyPoisonDamage(
  target: Combatant,
  damagePerTurn: number,
  sourceId: CombatantId,
  events: CombatEvent[],
): void {
  target.currentHp -= damagePerTurn;
  const lethal = target.currentHp <= 0;
  events.push({
    kind: 'damage_applied',
    sourceId,
    targetId: target.id,
    amount: damagePerTurn,
    lethal,
    wasCrit: false,
  });
  if (lethal) {
    target.isDead = true;
    events.push({ kind: 'death', combatantId: target.id });
  }
}
```

**Poison damage bypasses defense, crit, dodge, and exhaustion amplification** — it's "true damage" per common auto-battler convention. Keeps the math simple and ensures poison still bites tank targets (which is the whole point of DoT).

**Side effect on existing system:** poison ticks emit `damage_applied` events with `sourceId` = the original caster. If the original caster has died since applying the poison, the event still references their id (it's a historical reference, not a live combatant lookup). This matches how mark/debuff statuses behave today.

**Death-from-poison + collapse:** when poison kills a target during tick, `tickStatuses` emits a `death` event. The caller in `combat.ts` is responsible for noticing dead combatants and calling `collapseAfterDeath` if needed. Verify at implementation: `combat.ts`'s turn loop should already handle this for status-induced deaths, but check.

### 7. New status ids and HUD glyphs

`StatusId` adds:
- `'vanished'` — dodge buff applied by Vanish.
- `'poisoned'` — DoT applied by Poison Strike.

`STATUS_GLYPHS` (`src/render/combat_actor.ts`):

```ts
vanished: { letter: 'V', color: '#aaccff' },  // light blue, matches Miss! floater
poisoned: { letter: 'P', color: '#88cc44' },  // sickly green
```

Distinguishes from existing statuses.

`STATUS_LABEL` in `src/data/ability_describe.ts` adds `vanished: 'vanished'` and `poisoned: 'poisoned'`.

### 8. Save schema

`CURRENT_SCHEMA_VERSION` bumps from 3 → 4. No migration registered; old v3 saves discarded on load (per pre-launch policy, confirmed by user).

`createDefaultUnlocks()` extends:

```ts
return {
  classes: ['knight', 'archer', 'priest', 'barbarian', 'rogue'],
  dungeons: ['crypt'],
};
```

`generateStarterRoster` stays unchanged (Knight/Archer/Priest only). Rogue is recruitable via Tavern's `generateCandidate` after schema bump.

### 9. Tests

**Type/data registration:**
- `src/data/__tests__/abilities.test.ts` — `EXPECTED_IDS` adds `'rogue_strike'`, `'backstab'`, `'vanish'`, `'poison_strike'`.
- `src/data/__tests__/classes.test.ts` — `EXPECTED_IDS` adds `'rogue'`.
- `src/save/__tests__/save.test.ts` — `createDefaultUnlocks` test expects `'rogue'`.

**Effect resolver:**
- `src/combat/__tests__/effects.test.ts`:
  - `bonusCrit` adds to caster's crit (use a Rogue fixture with `crit: 0`, `bonusCrit: 100` → always crits; verify `wasCrit: true` and damage doubled).
  - `bonusCrit > 100 - caster.crit` clamps to always-crit (verified by `rng.percent` clamp behavior; smoke test only).
  - `moveToSlot` swaps caster with ally in destination slot. Set up a 3-hero party with Rogue in slot 2; cast Vanish (or a test ability with `moveToSlot 3`); verify Rogue ends in slot 3 and the ex-slot-3 hero ends in slot 2; verify two `position_changed` events with `reason: 'swap'`.
  - `moveToSlot` to empty slot just moves caster, no swap (set up a 1-hero party, target slot 3; verify Rogue moves and only one event emitted).
  - `moveToSlot` to caster's current slot is no-op (caster already in slot 3, target slot 3; verify no events).
  - `poison` effect applies a status that ticks damage. Set up a target with `currentHp: 10, maxHp: 10`; apply poison `damagePerTurn: 2, duration: 3`; call `tickStatuses` 3 times; verify HP goes 10 → 8 → 6 → 4; verify 3 `damage_applied` events emitted with `wasCrit: false`; verify status removed after 3rd tick.
  - Poison damage bypasses defense — set target `defense: 100`; poison `damagePerTurn: 2`; tick; HP drops by exactly 2.
  - Poison kills target — set target `currentHp: 1`; poison `damagePerTurn: 2`; tick; verify `lethal: true` damage event AND `death` event emitted; verify `target.isDead === true`.

**AI conditions:**
- `src/combat/__tests__/ability_priority.test.ts`:
  - Rogue at full HP picks Backstab over Vanish (Vanish gated by HP).
  - Rogue at full HP with all enemies poisoned picks Backstab > Strike (Poison Strike falls through via `lacksStatus` filter).
  - Rogue at HP < 50% picks Vanish.

**Tick integration:**
- `src/combat/__tests__/statuses.test.ts` — extend with poison tick test (HP decrement, expire after duration, lethal handling).

### 10. Out of scope

- Backstab "teleport" as actual position change (gdd's wording). Implementing as a `slots: 'furthest'` targeting selector is the right model — the Rogue stays in their slot; the abstraction is "this attack can reach the back row." A literal teleport (Rogue moves to enemy slot 4 momentarily) would require cross-side position handling, which doesn't exist and is YAGNI for an auto-battler — combat is a readout, not a watch-the-actual-movement experience.
- Poison stacking (apply poison twice on same target). Per `lacksStatus` filter on Poison Strike, only one stack at a time. If two casters poison the same target, the second poison overwrites the first via `storeStatus`'s direct-assign behavior. Acceptable for Tier 2; multi-stack DoT is post-launch tuning.
- Crit-on-poison. DoT damage is uncrittable per spec §6.
- Per-class crit visuals (uses existing CRIT! gold floater).
- Vanish persistence across combats (the +Dodge buff expires after 2 turns, intra-combat only — same as existing buff/debuff behavior).

## Manual acceptance

1. Start a fresh save (per option A above, schema bump discards any old save automatically).
2. Visit Tavern. Reroll until a Rogue appears. Verify:
   - Daggers sprite visible.
   - Stats display ~13 HP, ~5 Attack, ~6 Speed, ~20 Crit, ~15 Dodge.
3. Form a party with Rogue in slot 2.
4. Enter combat. Verify per-turn behavior:
   - At full HP, Rogue's first turn casts Backstab on the back-most enemy. Crits frequently (45% chance).
   - Poison Strike applies on next valid target; "P" green status icon appears.
   - When poisoned target's turn ticks, "2 dmg" floater appears (poison bypasses defense — verify by poisoning Knight-equivalent enemy).
   - When Rogue's HP drops below 50%, next turn casts Vanish: Rogue moves to slot 3 (swaps with whoever's in slot 3), "V" status icon appears, dodge increases.
   - Multi-enemy fights: Backstab consistently picks the back row; Poison spreads across enemies over multiple turns.
5. Spam combats — Rogue feels distinct from Archer (similar damage, more positional movement, more DoT pressure).
