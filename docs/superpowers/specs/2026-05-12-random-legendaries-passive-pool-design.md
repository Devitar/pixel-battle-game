# Random legendaries + curated unique-passive pool — design spec

**Date:** 2026-05-12
**Status:** Draft, awaiting review
**Source:** Brainstorm 2026-05-12 (TODO Cluster D · 10).

## Summary

Round out the legendary cascade with **random** legendaries that drop from non-boss content (elite kills and treasure chests, 1% each post-`first_hero_l10` milestone). Each random legendary rolls a unique passive from a curated 16-passive pool, slot-restricted, plus Epic-equivalent affix counts. The passive reuses Spec 1's trigger/action palette with one new trigger (`onHit`) added for the iconic vampiric weapon case.

This is **Spec 4 of 4** in the legendary cascade. Specs 1 (MAX_LEVEL+L10 perks), 2 (Epic tier), and 3 (Legendary tier + L10 milestone + named boss drops) all shipped 2026-05-12 and are prerequisites.

## In scope

- New `LegendaryPassiveId` union (16 ids — 4 per slot).
- New `LegendaryPassiveDef` interface + `LEGENDARY_PASSIVE_DEFS` registry in `src/data/legendaries.ts`.
- `LEGENDARY_PASSIVES_BY_SLOT: Record<ItemSlot, readonly LegendaryPassiveId[]>` lookup for fast slot-to-pool resolution.
- `Item.legendaryPassive?: LegendaryPassiveId` — new optional field; mutually exclusive with `legendaryId`.
- New `PerkTrigger` variant `{ kind: 'onHit' }` for lifesteal-on-every-hit semantics.
- `rollRandomLegendary(rng, floor): Item` helper in `src/dungeon/loot.ts`.
- Substitution in `rollLoot`: post-milestone, 1% chance on `elite` and `treasure` kinds to substitute with a random legendary.
- `Combatant.equippedLegendaryPassiveIds: readonly LegendaryPassiveId[]` populated at combat-setup.
- `gatherTriggeredEffects` extended to iterate the third source.
- `applyDamage` adds an `onHit` + `lifesteal` consume site (post `damage_applied`).
- `itemDisplayName` (in `selectors.ts`) adds adjective-prefix branch for random legendaries.
- Tooltip body renders the passive description (via existing render path).

## Out of scope

- Bespoke art for random legendaries — Cluster C art polish. Orange rarity border is the visual cue today.
- Tooltip layout restructuring — random legendaries' passive description joins the existing tooltip text path. No new tooltip widget.
- Shop pricing tuning for random legendaries — random legendaries don't appear in shops (substitution is gated to elite + treasure only).
- onHit triggers with non-lifesteal actions — only `Vampiric` uses `onHit` in v1; future passives can extend with their own consume sites in applyDamage.
- Combat-drop substitution — only elite + treasure substitute. Combat drops (10% gate, normal rarity-table roll) stay legendary-free.

## Type system additions

```ts
// src/data/types.ts

export type LegendaryPassiveId =
  // Weapons
  | 'vampiric' | 'devastating' | 'cleaving' | 'hexing'
  // Shields
  | 'fortified' | 'reinforced' | 'thorny' | 'warded'
  // Outfits
  | 'vital' | 'resolute' | 'evasive' | 'enduring'
  // Hats
  | 'insightful' | 'prescient' | 'cunning' | 'wise';

export interface LegendaryPassiveDef {
  id: LegendaryPassiveId;
  adjective: string;       // 'Vampiric' — used as display-name prefix
  description: string;     // tooltip body line
  slot: ItemSlot;          // exactly one slot per passive
  triggeredEffect: TriggeredEffect;
}

export type PerkTrigger =
  | { kind: 'onCrit' }
  | { kind: 'onKill' }
  | { kind: 'onStruck'; whenAtFullHp?: boolean }
  | { kind: 'firstAttack' }
  | { kind: 'whenBelowHp'; ratio: number }
  | { kind: 'onHit' };     // NEW

export interface Item {
  // ... existing fields ...
  readonly legendaryPassive?: LegendaryPassiveId;  // NEW
}
```

`Item.legendaryId` (named legendaries) and `Item.legendaryPassive` (random legendaries) are mutually exclusive — both flow through `rarity: 'legendary'`. Named legendaries have empty `affixes`; random legendaries roll Epic-equivalent affixes.

## The 16 passives

| Slot | Id | Adjective | Trigger → Action | Description |
|---|---|---|---|---|
| weapon | vampiric | Vampiric | `onHit` → `lifesteal 0.15` | Heal 15% of damage dealt. |
| weapon | devastating | Devastating | `firstAttack` → `damageMod 2.0` | Your first attack each combat deals double damage. |
| weapon | cleaving | Cleaving | `onKill` → `gainStat attack +2, dur 3, stacking` | +2 Attack for 3 turns on kill (stacks). |
| weapon | hexing | Hexing | `onCrit` → `applyStatus marked, dur 3, payload damageBonus 0.3` | Crits Mark the target (+30% damage taken, 3 turns). |
| shield | fortified | Fortified | `onStruck` → `damageMitigation 0.8` | Reduce incoming damage by 20%. |
| shield | reinforced | Reinforced | `whenBelowHp 0.4` → `gainStat defense +4` | +4 Defense while below 40% HP. |
| shield | thorny | Thorny | `onStruck` → `applyStatus poisoned, dur 2, payload damagePerTurn 4, target other` | Reflect Poison (4/turn, 2 turns) to attackers. |
| shield | warded | Warded | `whenBelowHp 0.5` → `gainStat dodge +15` | +15 Dodge while below 50% HP. |
| outfit | vital | Vital | `onStruck` → `applyStatus blessed, dur 3, payload healPerTurn 5, target self` | Gain Blessed (+5 HP/turn, 3 turns) when struck. |
| outfit | resolute | Resolute | `whenBelowHp 0.5` → `gainStat defense +3` | +3 Defense while below 50% HP. |
| outfit | evasive | Evasive | `onStruck` → `gainStat dodge +20, dur 2` | +20 Dodge for 2 turns when struck. |
| outfit | enduring | Enduring | `onStruck` → `gainStat defense +1, dur 2, stacking` | +1 Defense for 2 turns when struck (stacks). |
| hat | insightful | Insightful | `whenBelowHp 0.5` → `gainStat mind +4` | +4 Mind while below 50% HP. |
| hat | prescient | Prescient | `onCrit` → `gainStat speed +1, dur 2, stacking` | +1 Speed for 2 turns on crit (stacks). |
| hat | cunning | Cunning | `onCrit` → `gainStat dodge +15, dur 2` | +15 Dodge for 2 turns on crit. |
| hat | wise | Wise | `onKill` → `gainStat mind +1, dur 3, stacking` | +1 Mind for 3 turns on kill (stacks). |

**Power-curve notes:** Random passives sit between L5 perks and L10 perks / named legendaries.
- `Wise` (+1 mind stack) is the weaker random sibling of `Lich's Crown` (+2 mind stack — named legendary).
- `Hexing` (damageBonus 0.3) sits between `Eagle's Mark` (0.25, Archer L10) and `Arcane Surge` (0.5, Mage L10).
- `Cleaving` matches `Rampage` (Barbarian L10) shape — same numeric, different acquisition path. Acceptable because the acquisition difference is the meaningful axis.
- `Vital` matches `Holy Vigor` (Priest L10) shape — same reasoning.
- `Resolute` matches `Aegis` (Paladin L10) shape and threshold. Slightly different from `Reinforced` (random shield, 0.4 threshold vs Resolute's 0.5).
- `Fortified` (always-20% mitigation) is decoupled from the full-HP gate, distinct from `Unbreakable` (Knight L10, halve at full HP). When both equipped on a full-HP Knight, mitigation stacks multiplicatively: `0.5 × 0.8 = 0.4` (60% reduction). Strong but earned.
- `Bulwark` from the brainstorm renamed to `Fortified` (better adjective form for the display-name prefix).

## LEGENDARY_PASSIVE_DEFS

New entries in `src/data/legendaries.ts` (added alongside `LEGENDARY_DEFS` + `BOSS_LEGENDARIES`):

```ts
export const LEGENDARY_PASSIVE_DEFS: Record<LegendaryPassiveId, LegendaryPassiveDef> = {
  vampiric: {
    id: 'vampiric',
    adjective: 'Vampiric',
    description: 'Heal 15% of damage dealt.',
    slot: 'weapon',
    triggeredEffect: {
      trigger: { kind: 'onHit' },
      action: { kind: 'lifesteal', ratio: 0.15 },
    },
  },
  devastating: {
    id: 'devastating',
    adjective: 'Devastating',
    description: 'Your first attack each combat deals double damage.',
    slot: 'weapon',
    triggeredEffect: {
      trigger: { kind: 'firstAttack' },
      action: { kind: 'damageMod', multiplier: 2.0 },
    },
  },
  cleaving: {
    id: 'cleaving',
    adjective: 'Cleaving',
    description: '+2 Attack for 3 turns on kill (stacks).',
    slot: 'weapon',
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'attack', delta: 2, duration: 3, stacking: true },
    },
  },
  hexing: {
    id: 'hexing',
    adjective: 'Hexing',
    description: 'Crits Mark the target (+30% damage taken, 3 turns).',
    slot: 'weapon',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: {
        kind: 'applyStatus', statusId: 'marked', duration: 3, target: 'other',
        payload: { damageBonus: 0.3 },
      },
    },
  },
  fortified: {
    id: 'fortified',
    adjective: 'Fortified',
    description: 'Reduce incoming damage by 20%.',
    slot: 'shield',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: { kind: 'damageMitigation', multiplier: 0.8 },
    },
  },
  reinforced: {
    id: 'reinforced',
    adjective: 'Reinforced',
    description: '+4 Defense while below 40% HP.',
    slot: 'shield',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.4 },
      action: { kind: 'gainStat', stat: 'defense', delta: 4 },
    },
  },
  thorny: {
    id: 'thorny',
    adjective: 'Thorny',
    description: 'Reflect Poison (4/turn, 2 turns) to attackers.',
    slot: 'shield',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: {
        kind: 'applyStatus', statusId: 'poisoned', duration: 2, target: 'other',
        payload: { damagePerTurn: 4 },
      },
    },
  },
  warded: {
    id: 'warded',
    adjective: 'Warded',
    description: '+15 Dodge while below 50% HP.',
    slot: 'shield',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'dodge', delta: 15 },
    },
  },
  vital: {
    id: 'vital',
    adjective: 'Vital',
    description: 'Gain Blessed (+5 HP/turn, 3 turns) when struck.',
    slot: 'outfit',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: {
        kind: 'applyStatus', statusId: 'blessed', duration: 3, target: 'self',
        payload: { healPerTurn: 5 },
      },
    },
  },
  resolute: {
    id: 'resolute',
    adjective: 'Resolute',
    description: '+3 Defense while below 50% HP.',
    slot: 'outfit',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'defense', delta: 3 },
    },
  },
  evasive: {
    id: 'evasive',
    adjective: 'Evasive',
    description: '+20 Dodge for 2 turns when struck.',
    slot: 'outfit',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: { kind: 'gainStat', stat: 'dodge', delta: 20, duration: 2 },
    },
  },
  enduring: {
    id: 'enduring',
    adjective: 'Enduring',
    description: '+1 Defense for 2 turns when struck (stacks).',
    slot: 'outfit',
    triggeredEffect: {
      trigger: { kind: 'onStruck' },
      action: { kind: 'gainStat', stat: 'defense', delta: 1, duration: 2, stacking: true },
    },
  },
  insightful: {
    id: 'insightful',
    adjective: 'Insightful',
    description: '+4 Mind while below 50% HP.',
    slot: 'hat',
    triggeredEffect: {
      trigger: { kind: 'whenBelowHp', ratio: 0.5 },
      action: { kind: 'gainStat', stat: 'mind', delta: 4 },
    },
  },
  prescient: {
    id: 'prescient',
    adjective: 'Prescient',
    description: '+1 Speed for 2 turns on crit (stacks).',
    slot: 'hat',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: { kind: 'gainStat', stat: 'speed', delta: 1, duration: 2, stacking: true },
    },
  },
  cunning: {
    id: 'cunning',
    adjective: 'Cunning',
    description: '+15 Dodge for 2 turns on crit.',
    slot: 'hat',
    triggeredEffect: {
      trigger: { kind: 'onCrit' },
      action: { kind: 'gainStat', stat: 'dodge', delta: 15, duration: 2 },
    },
  },
  wise: {
    id: 'wise',
    adjective: 'Wise',
    description: '+1 Mind for 3 turns on kill (stacks).',
    slot: 'hat',
    triggeredEffect: {
      trigger: { kind: 'onKill' },
      action: { kind: 'gainStat', stat: 'mind', delta: 1, duration: 3, stacking: true },
    },
  },
};

export const LEGENDARY_PASSIVES_BY_SLOT: Record<ItemSlot, readonly LegendaryPassiveId[]> = {
  weapon: ['vampiric', 'devastating', 'cleaving', 'hexing'],
  shield: ['fortified', 'reinforced', 'thorny', 'warded'],
  outfit: ['vital', 'resolute', 'evasive', 'enduring'],
  hat:    ['insightful', 'prescient', 'cunning', 'wise'],
};
```

## Drop substitution in rollLoot

`rollLoot` gains a new substitution branch AFTER the boss substitution (Spec 3) and BEFORE the normal rarity roll:

```ts
// In src/dungeon/loot.ts:rollLoot, after the boss-substitution branch:
if ((kind === 'elite' || kind === 'treasure') && legendaryEnabled && rng.percent(1)) {
  return rollRandomLegendary(rng, floorNumber);
}
```

The new helper:

```ts
export function rollRandomLegendary(rng: Rng, floor: number): Item {
  const slot = rng.pick(ALL_SLOTS);
  const base = pickBaseId(rng, slot);
  const pool = LEGENDARY_PASSIVES_BY_SLOT[slot];
  const passiveId = rng.pick(pool);
  const count = slot === 'hat' ? 4 : 3;  // Epic-equivalent
  const affixIds = pickAffixes(rng, count);
  const affixes: RolledAffix[] = affixIds.map((id) => ({
    affixId: id,
    value: rollAffixValue(id, floor),
  }));
  return {
    id: generateItemId(rng),
    baseId: base.baseId,
    slot,
    rarity: 'legendary',
    ...(base.weaponType !== undefined ? { weaponType: base.weaponType } : {}),
    affixes,
    floorRolledAt: floor,
    legendaryPassive: passiveId,
  };
}
```

Random legendaries:
- Roll a uniform slot (existing `ALL_SLOTS` pick — 25% each).
- Roll a uniform passive from the slot's pool (25% each within the slot — 6.25% chance per individual passive).
- Roll a normal `baseId` for the slot (e.g., weapon → one of the 6 weapon types).
- Get Epic-equivalent affix counts (3 non-hat, 4 hat).
- **No `rareProperty`** — the legendary passive replaces it conceptually.
- Have `legendaryPassive` set but NOT `legendaryId`.

**Combat drops + shops stay legendary-free.** The substitution is gated to `elite || treasure` only.

## Hook integration

**`Combatant.equippedLegendaryPassiveIds: readonly LegendaryPassiveId[]`** — new field on the combat-state mirror of Hero. Default `[]` in all 3 creators (`createHeroCombatant`, `createEnemyCombatant`, `createPetCombatant`).

**Combat-setup** (`src/run/combat_setup.ts`) gathers the field from `hero.equipment`:

```ts
function gatherEquippedLegendaryPassiveIds(
  equipment: HeroEquipment,
): readonly LegendaryPassiveId[] {
  const out: LegendaryPassiveId[] = [];
  for (const slot of ['weapon', 'shield', 'outfit', 'hat'] as const) {
    const item = equipment[slot];
    if (item?.legendaryPassive !== undefined) out.push(item.legendaryPassive);
  }
  return out;
}
```

Pass into `createHeroCombatant` alongside the existing `equippedLegendaryIds`.

**`gatherTriggeredEffects`** (in `src/combat/perk_hooks.ts`) gains a third loop:

```ts
export function gatherTriggeredEffects(
  combatant: Combatant,
): readonly { sourceId: PerkId | LegendaryId | LegendaryPassiveId; effect: TriggeredEffect }[] {
  const out: { sourceId: PerkId | LegendaryId | LegendaryPassiveId; effect: TriggeredEffect }[] = [];
  for (const perkId of combatant.pickedPerks) {
    const e = PERKS[perkId]?.triggeredEffect;
    if (e) out.push({ sourceId: perkId, effect: e });
  }
  for (const legId of combatant.equippedLegendaryIds) {
    out.push({ sourceId: legId, effect: LEGENDARY_DEFS[legId].triggeredEffect });
  }
  for (const passId of combatant.equippedLegendaryPassiveIds) {
    out.push({ sourceId: passId, effect: LEGENDARY_PASSIVE_DEFS[passId].triggeredEffect });
  }
  return out;
}
```

`sourceId` widens to `PerkId | LegendaryId | LegendaryPassiveId`. All three are string-literal unions; stack-key prefixes (`perk_stack_${sourceId}_${i}`, `perk_aura_${sourceId}`) work identically. `applyPerkAction.ApplyPerkActionArgs.sourceId` widens to the 3-union.

## onHit trigger + lifesteal consume site

New `PerkTrigger.onHit` fires once per outgoing damage instance.

In `src/combat/effects.ts:applyDamage`, after the existing rare-property lifesteal block (around line 109) and BEFORE the burning/venomous status checks, add the `onHit` consume site:

```ts
// Existing rare-property lifesteal (caster.lifestealPercent) unchanged.

// NEW: fire onHit triggers from gathered TriggeredEffects.
for (const { effect: t } of gatherTriggeredEffects(caster)) {
  if (t.trigger.kind !== 'onHit') continue;
  if (t.action.kind === 'lifesteal') {
    const heal = Math.floor(mitigated * t.action.ratio);
    if (heal > 0) {
      const actual = Math.min(heal, caster.maxHp - caster.currentHp);
      if (actual > 0) {
        caster.currentHp += actual;
        recomputeBelowHpAuras(caster, events);
        events.push({
          kind: 'heal_applied',
          sourceId: caster.id,
          targetId: caster.id,
          amount: actual,
        });
      }
    }
  }
  // Other onHit + action combinations not used in v1; future passives extend here.
}
```

**`onHit` is excluded from `FireableTriggerKind`** (the union used by `firePerkTrigger`). The trigger lives entirely in the `applyDamage` lifesteal block — `firePerkTrigger` would double-fire it otherwise. This is consistent with how `whenBelowHp` is excluded from `FireableTriggerKind` (handled by `recomputeBelowHpAuras` instead).

## UI

**`itemDisplayName`** (in `src/items/selectors.ts`) gains a branch for random legendaries:

```ts
export function itemDisplayName(item: Item): string {
  if (item.legendaryId !== undefined) {
    return LEGENDARY_DEFS[item.legendaryId].name;
  }
  if (item.legendaryPassive !== undefined) {
    const base = BASE_ITEMS[item.baseId].name;
    return `${LEGENDARY_PASSIVE_DEFS[item.legendaryPassive].adjective} ${base}`;
  }
  // ... existing rare-property suffix + baseId-name fallback ...
}
```

Examples: "Vampiric Sword", "Fortified Shield", "Vital Cloak", "Insightful Hood".

**`itemFlavor`** returns `undefined` for random legendaries (only named legendaries have flavor text).

**Tooltip body** renders the passive description (similar to how rare-property and affix lines render today). The existing equip-scene tooltip layout has the vertical room for one additional line; no layout restructuring needed.

## Stat compute

Random legendaries flow through the **existing** base-stats + affix aggregation path. The branches added in Spec 3 Task 6 check `item.legendaryId !== undefined` — random legendaries don't have `legendaryId`, so they fall through to the standard path. This is correct because:

- Random legendaries have a real `baseId` (their base stats contribute).
- They have a normal `affixes` array (their affix bonuses contribute).
- They have NO `rareProperty` (the legendary passive replaces it — and rare-property machinery already skips items without the field).

No change to `src/items/stats.ts` or `src/heroes/hero.ts` needed.

## Save migration

**None.** `Item.legendaryPassive?` is a new optional field; old saved items lack it and that's fine. `Combatant.equippedLegendaryPassiveIds` is combat-state, rebuilt at combat-setup from hero equipment. `CURRENT_SCHEMA_VERSION` stays at 7.

## Testing strategy

### Updates to existing tests

- `Item` interface test (if any) — accommodate the new optional field.
- `gatherTriggeredEffects` test — verify the third loop (equippedLegendaryPassiveIds → LEGENDARY_PASSIVE_DEFS lookup).

### New tests

| Area | Coverage |
|---|---|
| `LEGENDARY_PASSIVE_DEFS` shape | All 16 ids present; each has non-empty adjective/description; slot matches LEGENDARY_PASSIVES_BY_SLOT; triggeredEffect has valid trigger + action |
| `LEGENDARY_PASSIVES_BY_SLOT` | All 4 slots have exactly 4 ids; each id appears in exactly one slot's pool |
| `rollRandomLegendary` shape | Returns Item with rarity 'legendary', legendaryPassive set, no rareProperty, no legendaryId, Epic-equivalent affixCount (3 non-hat, 4 hat), correct baseId for slot |
| `rollLoot` substitution | Post-milestone elite + treasure return random legendaries at ~1% rate (large sample); pre-milestone returns normal loot; combat + shop kinds never substitute; both legendaries-with-legendaryId (Spec 3) and legendaries-with-legendaryPassive (Spec 4) can be produced |
| `gatherTriggeredEffects` legendary-passive iteration | Hero with equippedLegendaryPassiveIds: ['vampiric'] yields the Vampiric triggeredEffect |
| onHit + lifesteal consume site | Hero with Vampiric sword equipped heals 15% of damage on every outgoing hit; correctly skips when no heal headroom; emits heal_applied event |
| `Combatant.equippedLegendaryPassiveIds` | Populated at combat-setup from hero.equipment slots with legendaryPassive set; empty when no random legendaries equipped |
| `itemDisplayName` legendary-passive branch | Random legendary item returns `${adjective} ${baseName}` (e.g., 'Vampiric Sword'); named legendary still returns LegendaryDef.name; non-legendary unchanged |
| Per-passive smoke tests | At least one integration test per slot (4 total) — equip a random legendary, drive combat that triggers its passive, verify the expected effect (e.g., Cleaving stacks on kill; Vital regen on hit; Cunning dodge on crit; Vampiric heal on damage) |

## Risks

- **Lifesteal stacking with rare-property `of_vampirism`.** A hero with a Vampiric sword AND an existing `of_vampirism` rare property on another weapon... wait, rare-property is on weapon slots only, and a hero only equips one weapon. So no stacking via dual-weapon. A hero with a Vampiric legendary sword (legendary passive) gets ONLY the legendary's lifesteal (rare-property `of_vampirism` requires a rare-rarity item, which has no `legendaryPassive`). Risk does not materialize.
- **`onHit` trigger excluded from `FireableTriggerKind`.** Easy to miss when adding future trigger fires — a future contributor calling `firePerkTrigger` with `triggerKind: 'onHit'` would silently double-fire. Mitigation: comment near the type definition explains the exclusion and points to the applyDamage consume site.
- **Stack-key collision across the 3 source unions** (PerkId | LegendaryId | LegendaryPassiveId). Today's ids don't collide (perks like `iron_will`, named legendaries like `lichs_crown`, passive ids like `vampiric`). A future contributor adding e.g. a perk `vampiric` would create a stack-key collision. Mitigation: assertion test that the 3 unions are disjoint (`Object.keys(PERKS) ∩ Object.keys(LEGENDARY_DEFS) ∩ Object.keys(LEGENDARY_PASSIVE_DEFS) === ∅`).
- **1% drop rate variance at low sample sizes.** Distribution tests need ≥10,000 samples to land tolerances ±0.5%. Existing perk-distribution tests use this size; new tests should follow.

## Decisions

- **`onHit` trigger added as a new variant** to `PerkTrigger`, rather than special-casing `lifesteal` action in a trigger-agnostic loop. Keeps the trigger × action palette clean and unified.
- **`onHit` is NOT in `FireableTriggerKind`.** Its fire-site is the applyDamage lifesteal consume block. Parallels `whenBelowHp`'s exclusion (handled by `recomputeBelowHpAuras`).
- **16 passives, 4 per slot.** Larger than 13 (proposed in brainstorm) — gives each slot meaningful variety; manageable authoring/balance.
- **1% rate on elite + treasure only.** Combat drops (rare anyway via 10% gate) and shops stay legendary-free. Shops would otherwise let players gold-grind their way to legendaries, undermining the boss-farming + chest-luck loop.
- **Adjective-prefix naming over 'of X' suffix.** Each passive has an adjective form (e.g., "Vampiric"). Display: "Vampiric Sword". Parallel display path from rare-property's suffix; cleaner read.
- **Epic-equivalent affix counts** (3 non-hat, 4 hat) plus the passive. Random legendaries are strictly stronger than Epic items (more stats *and* a unique passive). The drop rate (1% × ~7 elite/treasure per run = ~7% per run) keeps them rare enough that the power is earned.
- **No rareProperty on random legendaries.** The passive replaces it conceptually. Existing affix machinery's `rareProperty: undefined` path handles them.
- **No `LegendaryPassiveDef.stats` field** (unlike `LegendaryDef`). Random legendaries get stats from baseId + affixes (the normal path). The passive contributes mechanics, not stats.
- **Stack with named legendaries' triggered effects.** A Knight with `Unbreakable` perk + a random `Fortified` shield gets BOTH `damageMitigation` actions firing on the same `onStruck` event — multiplicative (0.5 × 0.8 = 0.4 = 60% reduction at full HP). Strong but earned.
- **Power-curve placement.** Random passives sit between L5 perks and L10 perks / named legendaries. Where shapes overlap (Cleaving == Rampage, Wise == weaker Lich's Crown), the acquisition path is the differentiator.

## Follow-ups (out of scope for this spec)

To go into TODO entries once this ships:

- **Bespoke art for random legendaries.** Each baseId + legendary border combination renders today via the existing sprite catalog. Cluster C art polish.
- **Drowned King boss bespoke sprite** — already Cluster C · 3, unchanged by this spec.
- **Loot pricing tuning** for the 500g sell value on random legendaries — same SELL_VALUE.legendary as named legendaries today (which is fine; the value is on rarity, not on individual items).
- **`onHit` triggers with non-lifesteal actions.** Future passives may want e.g. "on hit, apply X status." The consume site in applyDamage would need to extend with the new action kind. Defer until a real need surfaces.
- **NG+ / Infinity mode unlock** (TODO future Tier 3) — closes the gdd §9 cascade. Currently unscoped; this Spec's `legendaryEnabled` precedent could inform the unlock-flag pattern.
