# Paladin Class — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the Paladin as the first unlockable class. Defeating the Crypt floor-3 boss unlocks Paladin in the Tavern hire pool, alongside the existing Sunken Keep dungeon unlock.

**Architecture:** Strictly additive content (1 class, 3 new abilities + 1 shared, 2 perks, 1 status) plus one upstream engine addition (a `regen` effect kind for proper heal-over-time semantics). Spec 2's `first_crypt_clear` handler gets one extra branch that idempotently appends `'paladin'` to `state.unlocks.classes`. No save-schema migration; no UI scene edits (Tavern recruitment and Perk Picker both auto-discover via existing registries).

**Tech Stack:** TypeScript (strict), Phaser 3, Vitest, Vite.

**Spec:** [`docs/superpowers/specs/2026-05-06-paladin-class-design.md`](../specs/2026-05-06-paladin-class-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/data/types.ts` | Modify | Add `'paladin'` to `ClassId`; add 3 `AbilityId`s; add `'consecrated'` to `StatusId`; add 2 `PerkId`s; add `regen` effect-kind variant to `AbilityEffect`. |
| `src/combat/statuses.ts` | Modify | Add `regen` branch to `tickStatuses` (mirrors `poison`); new `applyRegen` helper that respects `maxHp` cap and emits `heal_applied`. |
| `src/combat/__tests__/statuses.test.ts` | Modify | Add tests for the new `regen` tick path: heals, respects maxHp cap, expires on duration, emits `heal_applied` event. |
| `src/combat/effects.ts` | Modify | Add `case 'regen':` to `applyEffect`'s switch (just calls `storeStatus` like buffs do). |
| `src/combat/__tests__/effects.test.ts` | Modify | Add a test that an ability with `regen` effect stores a `consecrated` status with the right shape. |
| `src/data/abilities.ts` | Modify | Widen `smite.canCastFrom` from `[2, 3]` to `[1, 2, 3]`; append 3 new ability entries (`paladin_strike`, `lay_on_hands`, `consecrate`). |
| `src/data/__tests__/abilities.test.ts` | Modify | Add the 3 new ids to `EXPECTED_IDS`; assert `smite.canCastFrom` includes 1; effect-shape tests for the new abilities. |
| `src/data/perks.ts` | Modify | Append `righteous` and `vindicator` perk entries; add `paladin: ['righteous', 'vindicator']` to `CLASS_PERK_PAIRS`. |
| `src/data/__tests__/perks.test.ts` | Modify | Add the 2 new perk ids to `EXPECTED_IDS`; add `'paladin'` to the expected-classes list; pair-validity assertions auto-cover via the existing `describe.each`. |
| `src/data/classes.ts` | Modify | Append `paladin` entry to `CLASSES`. |
| `src/data/__tests__/classes.test.ts` | Modify | Add `'paladin'` to `EXPECTED_IDS`; existing parameterized tests cover the rest. |
| `src/run/milestones.ts` | Modify | Refactor the `first_crypt_clear` handler to also idempotently append `'paladin'` to `state.unlocks.classes`. |
| `src/run/__tests__/milestones.test.ts` | Modify | Replace "preserves classes unchanged" with "appends paladin to classes"; widen idempotency tests to cover both unlocks. |
| `src/run/__tests__/run_state.test.ts` | Modify | End-to-end Crypt-clear test asserts `after.unlocks.classes` also contains `'paladin'`. |
| `HISTORY.md` | Modify | Append slim spec entry on completion. |
| `TODO.md` | Modify | Add Cluster D · 3 entry on plan creation; migrate to HISTORY on completion. |

**No new files.** Every change is additive against existing files.

---

## Tasks

### Task 1: Type-level additions

Lay all type-union changes in one shot. Other tasks fill in the registries to satisfy the `Record<...>` exhaustiveness.

**Files:**
- Modify: `src/data/types.ts`

- [ ] **Step 1: Run baseline checks**

```
npx tsc --noEmit
npm test
```

Expected: clean typecheck; all tests pass (post-Sunken-Keep baseline ~1640).

- [ ] **Step 2: Update `src/data/types.ts`**

Replace `ClassId`:

```typescript
export type ClassId = 'knight' | 'archer' | 'priest' | 'barbarian' | 'rogue' | 'mage' | 'paladin';
```

Append to `AbilityId` union (find the existing union ending with `'drowning_lure'`, replace its trailing `;`):

```typescript
export type AbilityId =
  | /* all existing entries unchanged through 'drowning_lure' */
  | 'drowning_lure'
  // Paladin
  | 'paladin_strike'
  | 'lay_on_hands'
  | 'consecrate';
```

Replace `StatusId` (append `'consecrated'`):

```typescript
export type StatusId = 'bulwark' | 'taunting' | 'marked' | 'blessed' | 'rotting' | 'frailty' | 'stunned' | 'chilled' | 'enraged' | 'poisoned' | 'vanished' | 'slowed' | 'burning' | 'drowning' | 'consecrated';
```

Append to `PerkId`:

```typescript
export type PerkId =
  | 'iron_will' | 'resolute'
  | 'precise' | 'eagle_eye'
  | 'devout' | 'steadfast'
  | 'berserker' | 'tough_skin'
  | 'lethal' | 'evasive'
  | 'arcane_power' | 'quick_cast'
  // Paladin
  | 'righteous' | 'vindicator';
```

Append a new variant to `AbilityEffect` (find the existing union, add at the end before the closing `;`):

```typescript
export type AbilityEffect =
  | /* existing variants unchanged */
  | { kind: 'taunt'; duration: number; statusId: StatusId; chance?: number }
  | { kind: 'regen'; healPerTurn: number; duration: number; statusId: StatusId };
```

- [ ] **Step 3: Run typecheck — expect cascade failures**

```
npx tsc --noEmit
```

Expected: Multiple errors. The cascade comes from:
- `CLASSES` is `Record<ClassId, ClassDef>` — missing `paladin` entry.
- `ABILITIES` is `Record<AbilityId, Ability>` — missing 3 new entries.
- `PERKS` is `Record<PerkId, PerkDef>` — missing 2 new entries.
- `CLASS_PERK_PAIRS` is `Record<ClassId, ...>` — missing `paladin` entry.
- `applyEffect` switch in `src/combat/effects.ts` is non-exhaustive (no `case 'regen'`).

These are EXPECTED — Tasks 2-6 fill them in.

- [ ] **Step 4: SKIP — DO NOT COMMIT.** (Per user's no-commit policy; leave changes in working tree.)

---

### Task 2: Implement `regen` effect kind (engine-side)

Add proper heal-over-time semantics so `consecrate` doesn't have to abuse negative-poison-damage. Mirrors the `poison` pattern but heals (with maxHp cap) and emits `heal_applied`.

**Files:**
- Modify: `src/combat/statuses.ts`
- Modify: `src/combat/__tests__/statuses.test.ts`
- Modify: `src/combat/effects.ts`
- Modify: `src/combat/__tests__/effects.test.ts`

- [ ] **Step 1: Update statuses tests FIRST**

In `src/combat/__tests__/statuses.test.ts`, append a new describe block at the end of the file (do NOT modify existing tests):

```typescript
describe('tickStatuses — regen', () => {
  it('increments target HP by healPerTurn each tick (capped at maxHp)', () => {
    const c = createHeroCombatant('priest', 2 as SlotIndex, 'p0', {
      baseStats: { hp: 20, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 10,
      maxHp: 20,
    });
    c.statuses['consecrated'] = status(
      { kind: 'regen', healPerTurn: 3, duration: 3, statusId: 'consecrated' },
      'p0',
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.currentHp).toBe(13);
    expect(events.find((e) => e.kind === 'heal_applied')).toBeDefined();
  });

  it('regen is capped at maxHp (no overheal)', () => {
    const c = createHeroCombatant('priest', 2 as SlotIndex, 'p0', {
      baseStats: { hp: 20, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 19,
      maxHp: 20,
    });
    c.statuses['consecrated'] = status(
      { kind: 'regen', healPerTurn: 5, duration: 3, statusId: 'consecrated' },
      'p0',
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.currentHp).toBe(20);  // capped, not 24
  });

  it('regen expires after duration ticks', () => {
    const c = createHeroCombatant('priest', 2 as SlotIndex, 'p0', {
      baseStats: { hp: 20, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 10,
      maxHp: 20,
    });
    c.statuses['consecrated'] = status(
      { kind: 'regen', healPerTurn: 3, duration: 3, statusId: 'consecrated' },
      'p0',
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    tickStatuses(c, events);
    tickStatuses(c, events);
    expect(c.statuses['consecrated']).toBeUndefined();
    expect(c.currentHp).toBe(19);  // 10 + 3 + 3 + 3
  });

  it('regen does NOT tick on dead combatants', () => {
    const c = createHeroCombatant('priest', 2 as SlotIndex, 'p0', {
      baseStats: { hp: 20, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      currentHp: 0,
      maxHp: 20,
      isDead: true,
    });
    c.statuses['consecrated'] = status(
      { kind: 'regen', healPerTurn: 3, duration: 3, statusId: 'consecrated' },
      'p0',
    );
    const events: CombatEvent[] = [];
    tickStatuses(c, events);
    expect(c.currentHp).toBe(0);  // unchanged
    expect(events.find((e) => e.kind === 'heal_applied')).toBeUndefined();
  });
});
```

(Use existing imports/helpers in the file — `status()`, `tickStatuses`, `createHeroCombatant`, `SlotIndex`, `CombatEvent` should already be imported. Confirm by checking the file's existing test pattern at impl time.)

- [ ] **Step 2: Run statuses tests — expect failure**

```
npx vitest run src/combat/__tests__/statuses.test.ts
```

Expected: 4 new tests fail because the `regen` branch doesn't exist in `tickStatuses` — `c.currentHp` stays at 10 (no heal applied), and no `heal_applied` events emitted.

- [ ] **Step 3: Implement `regen` in `src/combat/statuses.ts`**

Find the existing `tickStatuses` function. After the `poison` branch (around line 66-68), add a parallel `regen` branch:

```typescript
    // Poison ticks first, before decrement, so it fires every turn including the expiry turn.
    // Poison damage bypasses defense / crit / dodge — true damage per auto-battler convention.
    if (status.effect.kind === 'poison' && !combatant.isDead) {
      applyPoisonDamage(combatant, status.effect.damagePerTurn, status.sourceId, events);
    }
    // Regen mirrors poison's tick-before-decrement semantics so it fires every turn including the expiry turn.
    if (status.effect.kind === 'regen' && !combatant.isDead) {
      applyRegenHeal(combatant, status.effect.healPerTurn, status.sourceId, events);
    }
```

After `applyPoisonDamage` at the bottom of the file, add:

```typescript
function applyRegenHeal(
  target: Combatant,
  healPerTurn: number,
  sourceId: CombatantId,
  events: CombatEvent[],
): void {
  const before = target.currentHp;
  target.currentHp = Math.min(target.currentHp + healPerTurn, target.maxHp);
  const actual = target.currentHp - before;
  if (actual > 0) {
    events.push({
      kind: 'heal_applied',
      sourceId,
      targetId: target.id,
      amount: actual,
    });
  }
}
```

- [ ] **Step 4: Run statuses tests — expect pass**

```
npx vitest run src/combat/__tests__/statuses.test.ts
```

Expected: all 4 new tests pass; existing poison tests still pass.

- [ ] **Step 5: Update effects tests + add regen case**

In `src/combat/__tests__/effects.test.ts`, add a regen test (place near existing poison-effect tests around line 602):

```typescript
describe('regen effect', () => {
  it('stores a "consecrated" status on the target with regen shape', () => {
    const ability: Ability = {
      id: 'consecrate',
      name: 'Consecrate',
      canCastFrom: [1, 2, 3],
      target: { side: 'ally', slots: 'all' },
      effects: [{ kind: 'regen', healPerTurn: 3, duration: 3, statusId: 'consecrated' }],
    };
    const state = makeState();
    const caster = state.combatants.find((c) => c.id === 'p0')!;
    const events: CombatEvent[] = [];
    applyAbility(ability, caster, ['p0'], state, events);
    const target = state.combatants.find((c) => c.id === 'p0')!;
    expect(target.statuses['consecrated']).toBeDefined();
    expect(target.statuses['consecrated'].remainingTurns).toBe(3);
    expect(target.statuses['consecrated'].effect).toMatchObject({
      kind: 'regen',
      healPerTurn: 3,
      duration: 3,
      statusId: 'consecrated',
    });
  });
});
```

(Use the file's existing `makeState` / `applyAbility` helpers — pattern matches the poison test at line 602.)

- [ ] **Step 6: Run effects tests — expect failure**

```
npx vitest run src/combat/__tests__/effects.test.ts
```

Expected: the new regen test fails because `applyEffect`'s switch doesn't handle `'regen'`.

- [ ] **Step 7: Add the `regen` case in `src/combat/effects.ts`**

Find the `applyEffect` function's switch (around line 200-214). Add the `regen` case parallel to `poison`:

```typescript
    case 'poison':
      storeStatus(caster, target, effect.statusId, effect, effect.duration, events);
      return;
    case 'regen':
      storeStatus(caster, target, effect.statusId, effect, effect.duration, events);
      return;
```

- [ ] **Step 8: Run effects tests — expect pass**

```
npx vitest run src/combat/__tests__/effects.test.ts
```

Expected: all pass.

- [ ] **Step 9: Run combat suite + typecheck**

```
npx vitest run src/combat
npx tsc --noEmit
```

Expected: combat tests pass; typecheck still has cascade errors from missing `paladin` registry entries (Tasks 3-6) — the regen-specific errors should now be gone.

- [ ] **Step 10: SKIP — DO NOT COMMIT.**

---

### Task 3: Smite widening + verification

Single-line change to allow casting Smite from slot 1.

**Files:**
- Modify: `src/data/abilities.ts`
- Modify: `src/data/__tests__/abilities.test.ts`

- [ ] **Step 1: Grep for existing tests asserting smite.canCastFrom**

Use the Grep tool with pattern `smite.*canCastFrom|canCastFrom.*smite` over `src/`, output_mode `content`.

Expected: No tests should hardcode `canCastFrom: [2, 3]` for smite. If any do, they need updating to `[1, 2, 3]`. (Spec note: the only place `canCastFrom` is asserted in `abilities.test.ts` is via the parameterized `describe.each` shape tests, which validate that values are in `[1,2,3]`, not exact equality.)

- [ ] **Step 2: Add smite assertion to `src/data/__tests__/abilities.test.ts`**

Append a new test near the bottom (before any final closing braces):

```typescript
describe('smite (shared by Priest and Paladin)', () => {
  it('canCastFrom includes slot 1 (Paladin frontline can cast)', () => {
    expect(ABILITIES.smite.canCastFrom).toContain(1);
    expect(ABILITIES.smite.canCastFrom).toContain(2);
    expect(ABILITIES.smite.canCastFrom).toContain(3);
  });
});
```

- [ ] **Step 3: Run abilities tests — expect failure**

```
npx vitest run src/data/__tests__/abilities.test.ts
```

Expected: the new smite test fails because `canCastFrom` is currently `[2, 3]`.

- [ ] **Step 4: Update `src/data/abilities.ts` smite entry**

Find:

```typescript
  smite: {
    id: 'smite',
    name: 'Smite',
    canCastFrom: [2, 3],
```

Change to:

```typescript
  smite: {
    id: 'smite',
    name: 'Smite',
    canCastFrom: [1, 2, 3],
```

- [ ] **Step 5: Run abilities tests — expect pass**

```
npx vitest run src/data/__tests__/abilities.test.ts
```

Expected: smite test passes. Other ability tests still pass (the change is widening; nothing previously valid becomes invalid).

- [ ] **Step 6: Run any priest/combat tests that may exercise smite cast logic**

```
npx vitest run src/combat src/data
```

Expected: all pass. Widening `canCastFrom` is monotonic — anything that previously could cast smite still can.

- [ ] **Step 7: SKIP — DO NOT COMMIT.**

---

### Task 4: Three new Paladin abilities

Add `paladin_strike`, `lay_on_hands`, `consecrate` to the ABILITIES map.

**Files:**
- Modify: `src/data/abilities.ts`
- Modify: `src/data/__tests__/abilities.test.ts`

- [ ] **Step 1: Update test fixture FIRST**

In `src/data/__tests__/abilities.test.ts`, append the 3 new ids to `EXPECTED_IDS`:

```typescript
const EXPECTED_IDS: readonly AbilityId[] = [
  /* existing entries through 'drowning_lure' */
  'drowning_lure',
  // Paladin
  'paladin_strike',
  'lay_on_hands',
  'consecrate',
];
```

Add new test cases at the end of the file:

```typescript
describe('paladin_strike', () => {
  it('is registered as an attack-scaling basic', () => {
    const a = ABILITIES.paladin_strike;
    expect(a.id).toBe('paladin_strike');
    expect(a.canCastFrom).toEqual([1, 2]);
    expect(a.cooldown).toBeUndefined();  // basic, no cooldown
    const dmg = a.effects.find((e) => e.kind === 'damage');
    expect(dmg).toBeDefined();
    if (dmg && dmg.kind === 'damage') {
      expect(dmg.power).toBeCloseTo(1.0);
      expect(dmg.scalingStat).toBe('attack');
    }
  });
});

describe('lay_on_hands', () => {
  it('is registered as a Mind-scaling burst heal with cooldown 3', () => {
    const a = ABILITIES.lay_on_hands;
    expect(a.id).toBe('lay_on_hands');
    expect(a.canCastFrom).toEqual([1, 2, 3]);
    expect(a.cooldown).toBe(3);
    expect(a.target.side).toBe('ally');
    expect(a.target.pick).toBe('lowestHp');
    const heal = a.effects.find((e) => e.kind === 'heal');
    expect(heal).toBeDefined();
    if (heal && heal.kind === 'heal') {
      expect(heal.power).toBeCloseTo(3.0);
      expect(heal.scalingStat).toBe('mind');
    }
  });
});

describe('consecrate', () => {
  it('is registered as a party-wide regen with cooldown 4 and radiant tag', () => {
    const a = ABILITIES.consecrate;
    expect(a.id).toBe('consecrate');
    expect(a.canCastFrom).toEqual([1, 2, 3]);
    expect(a.cooldown).toBe(4);
    expect(a.target.side).toBe('ally');
    expect(a.target.slots).toBe('all');
    expect(a.tags).toContain('radiant');
    const regen = a.effects.find((e) => e.kind === 'regen');
    expect(regen).toBeDefined();
    if (regen && regen.kind === 'regen') {
      expect(regen.healPerTurn).toBe(3);
      expect(regen.duration).toBe(3);
      expect(regen.statusId).toBe('consecrated');
    }
  });
});
```

- [ ] **Step 2: Run abilities tests — expect failure**

```
npx vitest run src/data/__tests__/abilities.test.ts
```

Expected: tests fail because the 3 abilities are undefined.

- [ ] **Step 3: Add the 3 entries to `src/data/abilities.ts`**

Append inside the `ABILITIES` object literal, just before the closing `};` (after the existing `drowning_lure` entry):

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
    effects: [{ kind: 'regen', healPerTurn: 3, duration: 3, statusId: 'consecrated' }],
    cooldown: 4,
    tags: ['radiant'],
  },
```

- [ ] **Step 4: Run abilities tests — expect pass**

```
npx vitest run src/data/__tests__/abilities.test.ts
```

Expected: all pass (existing + 3 new).

- [ ] **Step 5: SKIP — DO NOT COMMIT.**

---

### Task 5: Two new perks + CLASS_PERK_PAIRS entry

**Files:**
- Modify: `src/data/perks.ts`
- Modify: `src/data/__tests__/perks.test.ts`

- [ ] **Step 1: Update test fixture FIRST**

In `src/data/__tests__/perks.test.ts`, append the 2 new ids to `EXPECTED_IDS`:

```typescript
const EXPECTED_IDS: readonly PerkId[] = [
  'iron_will', 'resolute',
  'precise', 'eagle_eye',
  'devout', 'steadfast',
  'berserker', 'tough_skin',
  'lethal', 'evasive',
  'arcane_power', 'quick_cast',
  // Paladin
  'righteous', 'vindicator',
];
```

Update the `CLASS_PERK_PAIRS` test fixtures (find `expectedClasses` and the parameterized `describe.each` array). In the existing `it('has exactly 6 entries (one per ClassId)', ...)` test, change the count to 7 and add `'paladin'`:

```typescript
  it('has exactly 7 entries (one per ClassId)', () => {
    const expectedClasses: ClassId[] =
      ['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage', 'paladin'];
    expect(Object.keys(CLASS_PERK_PAIRS).sort()).toEqual([...expectedClasses].sort());
  });

  describe.each(['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage', 'paladin'] as ClassId[])(
    'class %s pair',
    /* body unchanged */
  );
```

- [ ] **Step 2: Run perks tests — expect failure**

```
npx vitest run src/data/__tests__/perks.test.ts
```

Expected: many failures — both the EXPECTED_IDS count check and the class-pair tests fail because `righteous`, `vindicator`, and `CLASS_PERK_PAIRS.paladin` are undefined.

- [ ] **Step 3: Update `src/data/perks.ts`**

Append to the `PERKS` object literal (before the closing `};`):

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

Append to `CLASS_PERK_PAIRS` (before the closing `};`):

```typescript
export const CLASS_PERK_PAIRS: Record<ClassId, readonly [PerkId, PerkId]> = {
  knight:    ['iron_will',    'resolute'],
  archer:    ['precise',      'eagle_eye'],
  priest:    ['devout',       'steadfast'],
  barbarian: ['berserker',    'tough_skin'],
  rogue:     ['lethal',       'evasive'],
  mage:      ['arcane_power', 'quick_cast'],
  paladin:   ['righteous',    'vindicator'],
};
```

- [ ] **Step 4: Run perks tests — expect pass**

```
npx vitest run src/data/__tests__/perks.test.ts
```

Expected: all pass.

- [ ] **Step 5: SKIP — DO NOT COMMIT.**

---

### Task 6: CLASSES.paladin entry

**Files:**
- Modify: `src/data/classes.ts`
- Modify: `src/data/__tests__/classes.test.ts`

- [ ] **Step 1: Update test fixture FIRST**

In `src/data/__tests__/classes.test.ts`, append `'paladin'` to `EXPECTED_IDS`:

```typescript
const EXPECTED_IDS: readonly ClassId[] = ['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage', 'paladin'];
```

Add a Paladin-specific test before the final closing `});`:

```typescript
describe('Paladin', () => {
  it('has the expected stat profile (Knight chassis with mind=4)', () => {
    const p = CLASSES.paladin;
    expect(p.baseStats.hp).toBe(20);
    expect(p.baseStats.attack).toBe(3);
    expect(p.baseStats.defense).toBe(4);
    expect(p.baseStats.mind).toBe(4);
  });

  it('has primaryStat=mind, preferredWeapon=sword, weaponFamily=melee', () => {
    expect(CLASSES.paladin.primaryStat).toBe('mind');
    expect(CLASSES.paladin.preferredWeapon).toBe('sword');
    expect(CLASSES.paladin.weaponFamily).toBe('melee');
  });

  it('has the 4 expected abilities including shared smite', () => {
    expect([...CLASSES.paladin.abilities].sort()).toEqual(
      ['consecrate', 'lay_on_hands', 'paladin_strike', 'smite'].sort(),
    );
  });

  it('AI prioritizes consecrate > lay_on_hands > smite > basic', () => {
    expect(CLASSES.paladin.aiPriority).toEqual(['consecrate', 'lay_on_hands', 'smite', 'paladin_strike']);
  });

  it('starter loadout matches Knight pattern (sword + shield)', () => {
    expect(CLASSES.paladin.starterLoadout.weapon).toBe('sword_basic');
    expect(CLASSES.paladin.starterLoadout.shield).toBe('shield_basic');
  });

  it('declares no swapTarget or weaponSwaps (Archer pattern)', () => {
    expect(CLASSES.paladin.swapTarget).toBeUndefined();
    expect(CLASSES.paladin.weaponSwaps).toBeUndefined();
  });
});
```

Also note: the existing test "Archer has no swapTarget or weaponSwaps" lives in the `describe('swap mappings', ...)` block. The `SWAP_CLASSES` array there does NOT need paladin added — paladin intentionally has neither, like archer. The existing structure's `Archer` carve-out happens to cover paladin too, but the new "declares no swapTarget" test above makes it explicit.

- [ ] **Step 2: Run classes tests — expect failure**

```
npx vitest run src/data/__tests__/classes.test.ts
```

Expected: tests fail because `CLASSES.paladin` is undefined.

- [ ] **Step 3: Add the entry to `src/data/classes.ts`**

Append inside the `CLASSES` object literal (before the closing `};`):

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

- [ ] **Step 4: Run classes tests — expect pass**

```
npx vitest run src/data/__tests__/classes.test.ts
```

Expected: all pass (existing + new Paladin tests).

- [ ] **Step 5: Run typecheck**

```
npx tsc --noEmit
```

Expected: clean. All cascade errors from Task 1 should now be resolved (regen handled in Task 2; abilities/perks/classes registries all populated).

- [ ] **Step 6: SKIP — DO NOT COMMIT.**

---

### Task 7: Milestone handler — append paladin to unlocks.classes

Refactor the existing `first_crypt_clear` handler to do TWO idempotent appends (sunken_keep dungeon AND paladin class).

**Files:**
- Modify: `src/run/milestones.ts`
- Modify: `src/run/__tests__/milestones.test.ts`

- [ ] **Step 1: Update milestones tests FIRST**

Open `src/run/__tests__/milestones.test.ts`. Make these surgical changes:

(a) **Replace the test "preserves classes unchanged"** (currently at lines 54-61). The new behavior appends paladin:

```typescript
  it('appends paladin to unlocks.classes on a fresh state', () => {
    const before = makeFakeSave({
      classes: ['knight', 'archer', 'priest'],
      dungeons: ['crypt'],
    });
    const after = MILESTONES.first_crypt_clear(before);
    expect(after.unlocks.classes).toContain('paladin');
    expect(after.unlocks.classes).toContain('knight');  // preserves existing
    expect(after.unlocks.classes).toContain('archer');
    expect(after.unlocks.classes).toContain('priest');
  });
```

(b) **Widen the existing "is idempotent — second application does not duplicate" test** at lines 48-52. The current `before` state only has dungeons unlocked; we need to also have paladin unlocked for the test to actually exercise the both-already-unlocked short-circuit:

```typescript
  it('is idempotent — second application does not duplicate when both already unlocked', () => {
    const before = makeFakeSave({
      classes: ['knight', 'paladin'],
      dungeons: ['crypt', 'sunken_keep'],
    });
    const after = MILESTONES.first_crypt_clear(before);
    expect(after).toBe(before);  // identity return on full no-op
  });
```

(c) **Add a partial-idempotency test** for the case where only the class is missing (or only the dungeon is missing) — covers the refactored handler's behavior of independent appends:

```typescript
  it('appends only paladin when sunken_keep already unlocked', () => {
    const before = makeFakeSave({
      classes: ['knight'],
      dungeons: ['crypt', 'sunken_keep'],
    });
    const after = MILESTONES.first_crypt_clear(before);
    expect(after.unlocks.classes).toContain('paladin');
    expect(after.unlocks.dungeons).toEqual(['crypt', 'sunken_keep']);  // unchanged
  });

  it('appends only sunken_keep when paladin already unlocked', () => {
    const before = makeFakeSave({
      classes: ['knight', 'paladin'],
      dungeons: ['crypt'],
    });
    const after = MILESTONES.first_crypt_clear(before);
    expect(after.unlocks.dungeons).toContain('sunken_keep');
    expect(after.unlocks.classes).toEqual(['knight', 'paladin']);  // unchanged
  });
```

(d) **Update the `applyPendingMilestones` test "runs the first_crypt_clear handler when id is in list"** to also assert the class append:

```typescript
  it('runs the first_crypt_clear handler when id is in list', () => {
    const before = makeFakeSave({ classes: ['knight'], dungeons: ['crypt'] });
    const after = applyPendingMilestones(before, ['first_crypt_clear']);
    expect(after.unlocks.dungeons).toContain('sunken_keep');
    expect(after.unlocks.classes).toContain('paladin');
  });
```

- [ ] **Step 2: Run milestones tests — expect failure**

```
npx vitest run src/run/__tests__/milestones.test.ts
```

Expected: the new/changed tests fail because the handler doesn't touch `unlocks.classes` yet.

- [ ] **Step 3: Refactor the handler in `src/run/milestones.ts`**

Replace the `first_crypt_clear` entry in the `MILESTONES` registry:

```typescript
export const MILESTONES: Record<MilestoneId, MilestoneHandler> = {
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
    return next;  // identity preserved when both branches no-op
  },
};
```

(The "identity preserved" semantics works because each branch only reassigns `next` if it has work to do. If both branches are no-ops, `next === state` and the test `expect(after).toBe(before)` passes. JS object identity is preserved through unchanged reassignment.)

Also update the file's leading comment block — strike the "future Paladin spec extends..." sentence since this IS that spec landing:

```typescript
/**
 * Spec 2 introduced 'first_crypt_clear' (Sunken Keep dungeon unlock).
 * Spec 3 (Paladin) extended the handler to also unlock the Paladin class.
 *
 * Handlers are responsible for their own idempotency.
 */
```

- [ ] **Step 4: Run milestones tests — expect pass**

```
npx vitest run src/run/__tests__/milestones.test.ts
```

Expected: all pass.

- [ ] **Step 5: Update the end-to-end run_state integration test**

In `src/run/__tests__/run_state.test.ts`, find the test "full canonical Crypt run: cashout SaveFile gets sunken_keep unlocked" (the one added by spec 2 at the end of the file). Add an assertion right after the existing `expect(after.unlocks.dungeons).toContain('sunken_keep');`:

```typescript
    expect(after.unlocks.dungeons).toContain('sunken_keep');
    expect(after.unlocks.classes).toContain('paladin');
```

- [ ] **Step 6: Run run_state tests — expect pass**

```
npx vitest run src/run/__tests__/run_state.test.ts
```

Expected: all pass.

- [ ] **Step 7: SKIP — DO NOT COMMIT.**

---

### Task 8: Final regression sweep + Tavern smoke test + HISTORY/TODO

**Files:** `HISTORY.md`, `TODO.md`. Optional: `src/camp/buildings/__tests__/tavern.test.ts` (if a tavern test file exists; verify and add a smoke test if it does).

- [ ] **Step 1: Run full typecheck + test suite**

```
npx tsc --noEmit
npm test
```

Expected: clean typecheck; all tests pass. Final count ~1665-1685 (1640 baseline + ~25-45 new tests across regen, abilities, perks, classes, milestones).

- [ ] **Step 2: Tavern smoke test (optional but recommended)**

Check if a tavern test file exists:

```
ls src/camp/buildings/__tests__/tavern.test.ts 2>/dev/null
```

If it exists, append:

```typescript
describe('generateCandidate — paladin in unlocked pool', () => {
  it('produces a paladin candidate when paladin is in unlockedClasses', () => {
    const rng = createRng(1);
    const unlocked: ClassId[] = ['paladin'];  // single-class pool guarantees the roll
    const hero = generateCandidate(rng, unlocked);
    expect(hero.classId).toBe('paladin');
  });
});
```

(Imports: add `'paladin'` to whichever pattern the file uses — likely just `import { generateCandidate } from '../tavern'` and `import type { ClassId } from '@data/types'` and `import { createRng } from '@util/rng'`.)

If no tavern test file exists, skip — the type-level guarantees + the run_state integration test already cover the unlock plumbing end-to-end.

- [ ] **Step 3: Append the spec entry to `HISTORY.md`**

Add immediately below the `<!-- Add completed entries below this line. Newest at the top. -->` line:

```markdown
### 2026-05-06 · Paladin class — first unlockable (Cluster D · 3)

- **Why:** Spec 2 (Sunken Keep) carved Paladin out as a "future spec extending the same first_crypt_clear handler." This is that spec — Paladin is the player's reward for clearing the Crypt. After this lands, the Crypt floor-3 boss defeat unlocks both Sunken Keep (dungeon) AND Paladin (class).
- **Decisions** (Q1–Q6 in spec):
  - **Q1 — Share smite, don't duplicate.** Paladin's `abilities` array references the existing `smite` id Priest uses. Required widening `smite.canCastFrom` from `[2, 3]` to `[1, 2, 3]` so Paladin in slot 1 can cast it. Monotonic change; Priest unaffected.
  - **Q2 — Knight chassis with mind=4.** `{ hp: 20, attack: 3, defense: 4, speed: 3, mind: 4, crit: 5, dodge: 5 }`. Hybrid identity comes from *what abilities do*, not *how durable they are* — avoids making Paladin a strict-better Knight.
  - **Q3 — Each ability owns one role.** paladin_strike (basic), shared smite (burst), lay_on_hands (single-target burst heal cd 3), consecrate (party HoT cd 4). Distinct from Priest's Mend (chip heal) and Bless (single-ally buff).
  - **Q4 — primaryStat=mind, no swapTarget.** Sword-or-bust thematically; axe/dagger Paladin reads weird. Off-preferred melee weapons leave the kit unchanged (Archer pattern).
  - **Q5 — `righteous` (+3 mind) / `vindicator` (+2 attack).** Forces a meaningful identity fork. Avoids defense/HP perks because chassis already matches Knight.
  - **Q6 — Handler does both appends idempotently.** Refactored from spec 2's short-circuit pattern (which only checked dungeons) to two independent branches. Identity-return preserved when both already unlocked (existing test still passes).
- **Surprises:**
  - Engine had no native heal-over-time effect kind. Negative-poison-damage worked mechanically but emitted `damage_applied` events with negative amounts and ignored maxHp cap. Added a proper `regen` effect kind in `combat/statuses.ts` + `combat/effects.ts` mirroring poison's structure but capping at maxHp and emitting `heal_applied`. Spec flagged this as the highest-risk decision; turned out small (~30 LOC + tests).
  - `generateStarterRoster` in `tavern.ts` hardcodes `['knight', 'archer', 'priest']` for new-player starting roster — intentional, separate from the unlock-driven recruitment path. Verified during planning; no change needed.
  - `CLASS_PERK_PAIRS` is `Record<ClassId, ...>` so adding `'paladin'` to ClassId forced the perk pair entry to land in lockstep — exactly the kind of drift-prevention the type system pays for.
- **Source:** spec `docs/superpowers/specs/2026-05-06-paladin-class-design.md`; plan `docs/superpowers/plans/2026-05-06-paladin-class.md`. Test count delta: 1640 → ~1665-1685 (verify exact at impl time).
```

- [ ] **Step 4: Migrate TODO Cluster D · 3**

Open `TODO.md`. Find the Cluster D · 3 entry (the one created when this plan landed). DELETE it — content is now in HISTORY (Step 3).

(Per saved memory feedback: do NOT renumber other entries — gaps in cluster numbering are fine.)

- [ ] **Step 5: Run full suite one final time**

```
npm test
```

Expected: all tests pass.

- [ ] **Step 6: SKIP — DO NOT COMMIT.** Hand off the dirty working tree to the user for review and manual commit.

---

## Done

- 1 new class (Paladin), 3 new abilities (paladin_strike, lay_on_hands, consecrate), 1 new shared use (Smite widened to slot 1), 1 new status (consecrated), 2 new perks (righteous, vindicator) all land additively.
- 1 new effect kind (`regen`) in the combat engine — proper HoT semantics with maxHp cap and `heal_applied` events.
- Existing `first_crypt_clear` milestone handler now does both unlocks idempotently.
- Crypt continues to play identically; Paladin appears in Tavern hires after first Crypt clear.
- No save schema bump.
- Test count delta: 1640 → ~1665-1685 (verify exact at impl time).
- Spec 3 HISTORY entry captures decisions + the regen-engine surprise + source pointers.
