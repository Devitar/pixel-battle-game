import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PERKS } from '@data/perks';
import type { PerkDef } from '@data/types';
import { createRng } from '@util/rng';
import { resolveCombat } from '../combat';
import { applyPerkAction, recomputeBelowHpAuras, STACK_CAP } from '../perk_hooks';
import { getEffectiveStat } from '../statuses';
import type { CombatEvent } from '../types';
import { makeEnemyCombatant, makeHeroCombatant, makeTestState } from './helpers';

/**
 * Integration tests for the triggered-perk fire-site wiring. Each `describe`
 * block monkey-patches a real PerkId entry in PERKS to inject a synthetic
 * triggeredEffect, then drives `resolveCombat` and asserts the trigger fired
 * (or did not) by inspecting the event stream. Setup/teardown restores the
 * original perk to keep tests isolated.
 */
describe('onCrit triggered perks', () => {
  const ORIGINAL_IRON_WILL = PERKS.iron_will;

  beforeEach(() => {
    // Inject a synthetic onCrit triggeredEffect onto iron_will. The synthetic
    // action marks the target so we can assert via the status_applied event
    // (and the mutated target.statuses) that the trigger fired.
    const synthetic: PerkDef = {
      ...ORIGINAL_IRON_WILL,
      triggeredEffect: {
        trigger: { kind: 'onCrit' },
        action: {
          kind: 'applyStatus',
          statusId: 'marked',
          duration: 3,
          target: 'other',
        },
      },
    };
    (PERKS as Record<string, PerkDef>).iron_will = synthetic;
  });

  afterEach(() => {
    (PERKS as Record<string, PerkDef>).iron_will = ORIGINAL_IRON_WILL;
  });

  it('fires onCrit when the perk-bearer scores a crit', () => {
    // Knight with 100% crit and iron_will picked. Every damaging hit crits;
    // the synthetic onCrit perk should apply 'marked' to the enemy at least once.
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 30, attack: 5, defense: 4, speed: 5, mind: 0, crit: 100, dodge: 0 },
      pickedPerks: ['iron_will'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      // No dodge so the first attack lands. crit 0 so its hits don't trigger
      // anything (it has no perks anyway).
      baseStats: { hp: 12, attack: 3, defense: 2, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    const markEvents = result.events.filter(
      (e) => e.kind === 'status_applied' && e.statusId === 'marked' && e.sourceId === 'p0',
    );
    expect(markEvents.length).toBeGreaterThan(0);

    // Sanity: the recorded damage events should reflect crits firing.
    const damageEvents = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0',
    );
    expect(damageEvents.length).toBeGreaterThan(0);
    for (const d of damageEvents) {
      if (d.kind !== 'damage_applied') continue;
      expect(d.wasCrit).toBe(true);
    }
  });

  it('does not fire onCrit on a non-crit hit', () => {
    // Same setup but crit=0 so the knight never crits. No marked status should
    // ever appear (the knight has no other way to mark, and the enemy has no
    // perks).
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 30, attack: 5, defense: 4, speed: 5, mind: 0, crit: 0, dodge: 0 },
      pickedPerks: ['iron_will'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 12, attack: 3, defense: 2, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    const markEvents = result.events.filter(
      (e) => e.kind === 'status_applied' && e.statusId === 'marked' && e.sourceId === 'p0',
    );
    expect(markEvents).toHaveLength(0);

    // Sanity: damage landed but never crit.
    const damageEvents = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0',
    );
    expect(damageEvents.length).toBeGreaterThan(0);
    for (const d of damageEvents) {
      if (d.kind !== 'damage_applied') continue;
      expect(d.wasCrit).toBe(false);
    }
  });

  it('does not fire onCrit when the perk-bearer has not picked the perk', () => {
    // Same crit-100% setup but pickedPerks is empty. No marked status should
    // appear despite every hit crit'ing.
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 30, attack: 5, defense: 4, speed: 5, mind: 0, crit: 100, dodge: 0 },
      pickedPerks: [],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 12, attack: 3, defense: 2, speed: 3, mind: 0, crit: 0, dodge: 0 },
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    const markEvents = result.events.filter(
      (e) => e.kind === 'status_applied' && e.statusId === 'marked' && e.sourceId === 'p0',
    );
    expect(markEvents).toHaveLength(0);
  });
});

describe('onStruck triggered perks', () => {
  const ORIGINAL_IRON_WILL = PERKS.iron_will;

  afterEach(() => {
    (PERKS as Record<string, PerkDef>).iron_will = ORIGINAL_IRON_WILL;
  });

  it('fires onStruck when the perk-bearer is hit', () => {
    // Inject an onStruck triggeredEffect that applies a self-targeted 'blessed'
    // (regen) status, so we can assert via status_applied that the trigger fired
    // when the knight (the perk-bearer) was hit.
    const synthetic: PerkDef = {
      ...ORIGINAL_IRON_WILL,
      triggeredEffect: {
        trigger: { kind: 'onStruck' },
        action: {
          kind: 'applyStatus',
          statusId: 'blessed',
          duration: 3,
          target: 'self',
        },
      },
    };
    (PERKS as Record<string, PerkDef>).iron_will = synthetic;

    // Knight defender (with iron_will picked). Enemy attacks; the onStruck
    // perk should self-apply 'blessed' to the knight at least once.
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 60, attack: 2, defense: 2, speed: 2, mind: 0, crit: 0, dodge: 0 },
      maxHp: 60,
      currentHp: 60,
      pickedPerks: ['iron_will'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 30, attack: 6, defense: 2, speed: 5, mind: 0, crit: 0, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    const blessedEvents = result.events.filter(
      (e) => e.kind === 'status_applied' && e.statusId === 'blessed' && e.sourceId === 'p0',
    );
    expect(blessedEvents.length).toBeGreaterThan(0);
  });

  it('whenAtFullHp:true filter prevents fire at low HP', () => {
    // Knight starts at 50% HP so wasFullHp is false on every incoming hit.
    // The synthetic perk requires whenAtFullHp, so its action should never fire.
    const synthetic: PerkDef = {
      ...ORIGINAL_IRON_WILL,
      triggeredEffect: {
        trigger: { kind: 'onStruck', whenAtFullHp: true },
        action: {
          kind: 'applyStatus',
          statusId: 'blessed',
          duration: 3,
          target: 'self',
        },
      },
    };
    (PERKS as Record<string, PerkDef>).iron_will = synthetic;

    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 60, attack: 2, defense: 2, speed: 2, mind: 0, crit: 0, dodge: 0 },
      maxHp: 60,
      currentHp: 30, // starts at 50% — never at full HP when struck
      pickedPerks: ['iron_will'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 30, attack: 6, defense: 2, speed: 5, mind: 0, crit: 0, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Sanity: the knight did take hits.
    const damageEvents = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.targetId === 'p0',
    );
    expect(damageEvents.length).toBeGreaterThan(0);

    // The perk's blessed-self should never fire because HP was never full when struck.
    const blessedEvents = result.events.filter(
      (e) => e.kind === 'status_applied' && e.statusId === 'blessed' && e.sourceId === 'p0',
    );
    expect(blessedEvents).toHaveLength(0);
  });

  it('whenAtFullHp:true filter fires (mitigates) when at full HP, then stops mitigating after first hit', () => {
    // damageMitigation 0.5 with whenAtFullHp: the first hit (defender at full HP)
    // is halved; subsequent hits (now below full HP) are not.
    const synthetic: PerkDef = {
      ...ORIGINAL_IRON_WILL,
      triggeredEffect: {
        trigger: { kind: 'onStruck', whenAtFullHp: true },
        action: { kind: 'damageMitigation', multiplier: 0.5 },
      },
    };
    (PERKS as Record<string, PerkDef>).iron_will = synthetic;

    // Defender (archer — no stun ability) starts at full HP with the perk.
    // Archer's basic shot kills slowly enough that the enemy lands multiple hits.
    const archer = makeHeroCombatant('archer', 1, 'p0', {
      baseStats: { hp: 500, attack: 1, defense: 0, speed: 2, mind: 0, crit: 0, dodge: 0 },
      maxHp: 500,
      currentHp: 500,
      pickedPerks: ['iron_will'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 20, defense: 0, speed: 5, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([archer], [enemy]);
    const result = resolveCombat(state, createRng(1));

    const hitsOnKnight = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.targetId === 'p0',
    );
    expect(hitsOnKnight.length).toBeGreaterThan(1);

    const firstHit = hitsOnKnight[0];
    const secondHit = hitsOnKnight[1];
    if (firstHit.kind !== 'damage_applied' || secondHit.kind !== 'damage_applied') {
      throw new Error('expected damage_applied events');
    }
    // First hit was halved (rounded); second hit was not.
    // The second hit is the un-mitigated baseline; verify the first is roughly half.
    expect(firstHit.amount).toBeLessThan(secondHit.amount);
    expect(firstHit.amount).toBe(Math.max(1, Math.round(secondHit.amount * 0.5)));
  });
});

describe('onKill triggered perks', () => {
  const ORIGINAL_IRON_WILL = PERKS.iron_will;

  afterEach(() => {
    (PERKS as Record<string, PerkDef>).iron_will = ORIGINAL_IRON_WILL;
  });

  it('fires onKill when the perk-bearer deals the killing blow', () => {
    // Rampage-style: gainStat +attack, duration 3, stacking.
    const synthetic: PerkDef = {
      ...ORIGINAL_IRON_WILL,
      triggeredEffect: {
        trigger: { kind: 'onKill' },
        action: {
          kind: 'gainStat',
          stat: 'attack',
          delta: 2,
          duration: 3,
          stacking: true,
        },
      },
    };
    (PERKS as Record<string, PerkDef>).iron_will = synthetic;

    // Knight one-shots a 1-hp enemy on the first attack — guaranteed kill.
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 30, attack: 20, defense: 4, speed: 9, mind: 0, crit: 0, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: ['iron_will'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 1, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 1,
      currentHp: 1,
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Sanity: at least one of the knight's hits was lethal.
    const knightLethalHits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0' && e.lethal,
    );
    expect(knightLethalHits.length).toBeGreaterThan(0);

    // Verify the synthetic onKill perk produced a stack on the knight. Combat
    // returns a cloned final state; read statuses from finalState, not the
    // original input combatant. The stack may have decayed mid-combat if the
    // fight ran past the duration, so accept either: a live stack OR a
    // status_expired event proving one was created.
    const finalKnight = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalKnight).toBeDefined();
    const liveStackKeys = Object.keys(finalKnight!.statuses).filter((k) =>
      k.startsWith('perk_stack_iron_will_'),
    );
    const stackExpiredEvents = result.events.filter(
      (e) =>
        e.kind === 'status_expired' &&
        typeof e.statusId === 'string' &&
        e.statusId.startsWith('perk_stack_iron_will_'),
    );
    expect(liveStackKeys.length + stackExpiredEvents.length).toBeGreaterThan(0);
  });

  it('does not fire onKill on a non-lethal hit', () => {
    const synthetic: PerkDef = {
      ...ORIGINAL_IRON_WILL,
      triggeredEffect: {
        trigger: { kind: 'onKill' },
        action: {
          kind: 'gainStat',
          stat: 'attack',
          delta: 2,
          duration: 3,
          stacking: true,
        },
      },
    };
    (PERKS as Record<string, PerkDef>).iron_will = synthetic;

    // Tank enemy that can't be killed (very high HP, very high defense) within
    // the combat's round cap — knight chips at it but never lands a kill.
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 30, attack: 2, defense: 4, speed: 5, mind: 0, crit: 0, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: ['iron_will'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 1, defense: 100, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Sanity: the knight did land hits (non-lethal ones).
    const knightHits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0',
    );
    expect(knightHits.length).toBeGreaterThan(0);
    // None of those hits should be lethal.
    for (const h of knightHits) {
      if (h.kind !== 'damage_applied') continue;
      expect(h.lethal).toBe(false);
    }

    // No stacks should have accumulated. Read from finalState (resolveCombat
    // structuredClones the input, so `knight.statuses` is the unmutated original).
    const finalKnight = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalKnight).toBeDefined();
    const stackKeys = Object.keys(finalKnight!.statuses).filter((k) =>
      k.startsWith('perk_stack_iron_will_'),
    );
    expect(stackKeys).toHaveLength(0);
  });

  it('multiple kills stack to STACK_CAP (5)', () => {
    // Wiring already verified by the "fires onKill" test above. Here we drive
    // applyPerkAction directly 7 times to confirm the cap holds — cleaner than
    // wrangling 7 enemies through real combat. (Same approach the plan suggests.)
    const synthetic: PerkDef = {
      ...ORIGINAL_IRON_WILL,
      triggeredEffect: {
        trigger: { kind: 'onKill' },
        action: {
          kind: 'gainStat',
          stat: 'attack',
          delta: 2,
          duration: 3,
          stacking: true,
        },
      },
    };
    (PERKS as Record<string, PerkDef>).iron_will = synthetic;

    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 30, attack: 5, defense: 4, speed: 5, mind: 0, crit: 0, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: ['iron_will'],
    });
    const dummy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 1, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
      maxHp: 1,
      currentHp: 1,
    });

    const action = synthetic.triggeredEffect!.action;
    for (let i = 0; i < 7; i++) {
      applyPerkAction({
        self: knight,
        other: dummy,
        sourceId: 'iron_will',
        action,
        events: [],
      });
    }

    const stackKeys = Object.keys(knight.statuses).filter((k) =>
      k.startsWith('perk_stack_iron_will_'),
    );
    expect(stackKeys).toHaveLength(STACK_CAP);
    // Beyond-cap triggers refresh all durations to full (3).
    for (const k of stackKeys) {
      expect(knight.statuses[k].remainingTurns).toBe(3);
    }
  });
});

describe('firstAttack triggered perks', () => {
  const ORIGINAL_IRON_WILL = PERKS.iron_will;

  afterEach(() => {
    (PERKS as Record<string, PerkDef>).iron_will = ORIGINAL_IRON_WILL;
  });

  it('fires firstAttack on the first action only (damageMod doubles first hit, not second)', () => {
    // Synthetic: damageMod 2.0 on firstAttack. The first damaging hit the
    // bearer lands should be doubled; the second should be at the baseline.
    const synthetic: PerkDef = {
      ...ORIGINAL_IRON_WILL,
      triggeredEffect: {
        trigger: { kind: 'firstAttack' },
        action: { kind: 'damageMod', multiplier: 2.0 },
      },
    };
    (PERKS as Record<string, PerkDef>).iron_will = synthetic;

    // Knight (no crit, no dodge target) hitting a high-HP enemy so we get
    // multiple damage_applied events from the knight without one-shotting.
    // Speed 9 so knight goes first each round.
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 60, attack: 10, defense: 4, speed: 9, mind: 0, crit: 0, dodge: 0 },
      maxHp: 60,
      currentHp: 60,
      pickedPerks: ['iron_will'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    const knightHits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0',
    );
    expect(knightHits.length).toBeGreaterThan(1);

    const firstHit = knightHits[0];
    const secondHit = knightHits[1];
    if (firstHit.kind !== 'damage_applied' || secondHit.kind !== 'damage_applied') {
      throw new Error('expected damage_applied events');
    }
    // First hit was doubled (raw × 2 pre-defense); second is the unboosted baseline.
    expect(firstHit.amount).toBeGreaterThan(secondHit.amount);
    // The relationship: doubled_raw - defense vs. raw - defense. With effect
    // power 1 and attack 10 (knight ignores defense ≥ raw), raw=10 → first=20,
    // second=10. We don't hard-code the numbers (defense subtraction depends
    // on enemy defense 0), just assert the structural relationship.
    expect(firstHit.amount).toBe(Math.max(1, secondHit.amount * 2));

    // Confirm the tracker was set on the final-state knight.
    const finalKnight = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalKnight).toBeDefined();
    expect(finalKnight!.firstAttackFiredSourceIds).toContain('iron_will');
    // And the pendingDamageMod was consumed (back to 1).
    expect(finalKnight!.pendingDamageMod ?? 1).toBe(1);
  });

  it('firstAttack tracker resets per combat (fires independently in two combats)', () => {
    const synthetic: PerkDef = {
      ...ORIGINAL_IRON_WILL,
      triggeredEffect: {
        trigger: { kind: 'firstAttack' },
        action: { kind: 'damageMod', multiplier: 2.0 },
      },
    };
    (PERKS as Record<string, PerkDef>).iron_will = synthetic;

    function buildState() {
      const knight = makeHeroCombatant('knight', 1, 'p0', {
        baseStats: { hp: 60, attack: 10, defense: 4, speed: 9, mind: 0, crit: 0, dodge: 0 },
        maxHp: 60,
        currentHp: 60,
        pickedPerks: ['iron_will'],
      });
      const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
        baseStats: { hp: 9999, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
        maxHp: 9999,
        currentHp: 9999,
      });
      return makeTestState([knight], [enemy]);
    }

    // Run combat #1.
    const r1 = resolveCombat(buildState(), createRng(1));
    const r1Hits = r1.events.filter(
      (e): e is Extract<typeof e, { kind: 'damage_applied' }> =>
        e.kind === 'damage_applied' && e.sourceId === 'p0',
    );
    expect(r1Hits.length).toBeGreaterThan(1);
    expect(r1Hits[0].amount).toBe(Math.max(1, r1Hits[1].amount * 2));

    // Run combat #2 with a fresh state — the tracker must have reset.
    const r2 = resolveCombat(buildState(), createRng(1));
    const r2Hits = r2.events.filter(
      (e): e is Extract<typeof e, { kind: 'damage_applied' }> =>
        e.kind === 'damage_applied' && e.sourceId === 'p0',
    );
    expect(r2Hits.length).toBeGreaterThan(1);
    // Same shape: first hit doubled, second not. Proves the per-combat tracker
    // reset (since resolveCombat structuredClones initialState).
    expect(r2Hits[0].amount).toBe(Math.max(1, r2Hits[1].amount * 2));
  });

  it('does not fire firstAttack when the perk-bearer has not picked the perk', () => {
    const synthetic: PerkDef = {
      ...ORIGINAL_IRON_WILL,
      triggeredEffect: {
        trigger: { kind: 'firstAttack' },
        action: { kind: 'damageMod', multiplier: 2.0 },
      },
    };
    (PERKS as Record<string, PerkDef>).iron_will = synthetic;

    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 60, attack: 10, defense: 4, speed: 9, mind: 0, crit: 0, dodge: 0 },
      maxHp: 60,
      currentHp: 60,
      pickedPerks: [],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    const knightHits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0',
    );
    expect(knightHits.length).toBeGreaterThan(1);
    const firstHit = knightHits[0];
    const secondHit = knightHits[1];
    if (firstHit.kind !== 'damage_applied' || secondHit.kind !== 'damage_applied') {
      throw new Error('expected damage_applied events');
    }
    // Without the perk picked, no doubling.
    expect(firstHit.amount).toBe(secondHit.amount);

    const finalKnight = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalKnight!.firstAttackFiredSourceIds ?? []).toHaveLength(0);
  });
});

describe('whenBelowHp continuous-aura perks', () => {
  const ORIGINAL_IRON_WILL = PERKS.iron_will;
  const ORIGINAL_RESOLUTE = PERKS.resolute;

  afterEach(() => {
    (PERKS as Record<string, PerkDef>).iron_will = ORIGINAL_IRON_WILL;
    (PERKS as Record<string, PerkDef>).resolute = ORIGINAL_RESOLUTE;
  });

  it('applies aura when HP drops below threshold (via real combat HP-write site)', () => {
    // Last Stand-style: while HP < 30%, gain +4 defense.
    // Override statEffects to [] so the perk's baseline +1 defense doesn't
    // contaminate the aura assertion below.
    const synthetic: PerkDef = {
      ...ORIGINAL_IRON_WILL,
      statEffects: [],
      triggeredEffect: {
        trigger: { kind: 'whenBelowHp', ratio: 0.3 },
        action: { kind: 'gainStat', stat: 'defense', delta: 4 },
      },
    };
    (PERKS as Record<string, PerkDef>).iron_will = synthetic;

    // Drive recompute via real combat. Use an archer (no stun ability —
    // archers have no shield_bash) so the enemy keeps landing hits and the
    // archer's HP gets chipped below the 0.3 threshold. The archer's
    // pickedPerks is set to ['iron_will'] which the perk lookup tolerates
    // regardless of classId (the perk module is a flat map).
    const archer = makeHeroCombatant('archer', 1, 'p0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 100,
      currentHp: 100,
      pickedPerks: ['iron_will'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 30, defense: 0, speed: 9, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([archer], [enemy]);
    const result = resolveCombat(state, createRng(1));

    const finalArcher = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalArcher).toBeDefined();
    // Sanity: archer took multiple hits.
    const hitsOnArcher = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.targetId === 'p0',
    );
    expect(hitsOnArcher.length).toBeGreaterThan(0);
    // Archer must have crossed below the 0.3 threshold (alive or dead). The
    // aura is set in lockstep with HP writes, so the key must be present on
    // the final combatant's statuses regardless of whether the archer died.
    expect(finalArcher!.statuses['perk_aura_iron_will']).toBeDefined();
    // If still alive, the aura must also remain (HP did not climb back).
    if (!finalArcher!.isDead) {
      expect(finalArcher!.currentHp / finalArcher!.maxHp).toBeLessThan(0.3);
      expect(getEffectiveStat(finalArcher!, 'defense')).toBe(
        finalArcher!.baseStats.defense + 4,
      );
    }
  });

  it('removes aura when healed above threshold', () => {
    // Drive recompute manually: start a knight at 20% HP with the perk picked,
    // verify the aura applies; then heal above 30% and verify it's removed.
    // Override statEffects to [] so the perk's baseline +1 defense doesn't
    // contaminate the aura assertion below.
    const synthetic: PerkDef = {
      ...ORIGINAL_IRON_WILL,
      statEffects: [],
      triggeredEffect: {
        trigger: { kind: 'whenBelowHp', ratio: 0.3 },
        action: { kind: 'gainStat', stat: 'defense', delta: 4 },
      },
    };
    (PERKS as Record<string, PerkDef>).iron_will = synthetic;

    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 100,
      currentHp: 20, // 20% — below threshold
      pickedPerks: ['iron_will'],
    });
    const events: CombatEvent[] = [];

    // Initial recompute: aura should apply.
    recomputeBelowHpAuras(knight, events);
    expect(knight.statuses['perk_aura_iron_will']).toBeDefined();
    expect(getEffectiveStat(knight, 'defense')).toBe(knight.baseStats.defense + 4);

    // Heal back above threshold.
    knight.currentHp = 50; // 50% — above threshold
    recomputeBelowHpAuras(knight, events);
    expect(knight.statuses['perk_aura_iron_will']).toBeUndefined();
    expect(getEffectiveStat(knight, 'defense')).toBe(knight.baseStats.defense);
  });

  it('multiple whenBelowHp perks evaluate independently', () => {
    // Two synthetic perks: one at 0.5 (Sanctity-style), one at 0.3 (Last Stand-style).
    // Override statEffects to [] so the perks' baseline statEffects don't
    // contaminate the aura assertions below.
    const syntheticIronWill: PerkDef = {
      ...ORIGINAL_IRON_WILL,
      statEffects: [],
      triggeredEffect: {
        trigger: { kind: 'whenBelowHp', ratio: 0.5 },
        action: { kind: 'gainStat', stat: 'attack', delta: 3 },
      },
    };
    const syntheticResolute: PerkDef = {
      ...ORIGINAL_RESOLUTE,
      statEffects: [],
      hpEffect: undefined,
      triggeredEffect: {
        trigger: { kind: 'whenBelowHp', ratio: 0.3 },
        action: { kind: 'gainStat', stat: 'defense', delta: 4 },
      },
    };
    (PERKS as Record<string, PerkDef>).iron_will = syntheticIronWill;
    (PERKS as Record<string, PerkDef>).resolute = syntheticResolute;

    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 0, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 100,
      currentHp: 100,
      pickedPerks: ['iron_will', 'resolute'],
    });
    const events: CombatEvent[] = [];

    // At 100% HP: neither aura active.
    recomputeBelowHpAuras(knight, events);
    expect(knight.statuses['perk_aura_iron_will']).toBeUndefined();
    expect(knight.statuses['perk_aura_resolute']).toBeUndefined();

    // At 40%: iron_will (0.5) active, resolute (0.3) not.
    knight.currentHp = 40;
    recomputeBelowHpAuras(knight, events);
    expect(knight.statuses['perk_aura_iron_will']).toBeDefined();
    expect(knight.statuses['perk_aura_resolute']).toBeUndefined();
    expect(getEffectiveStat(knight, 'attack')).toBe(knight.baseStats.attack + 3);
    expect(getEffectiveStat(knight, 'defense')).toBe(knight.baseStats.defense);

    // At 25%: both active.
    knight.currentHp = 25;
    recomputeBelowHpAuras(knight, events);
    expect(knight.statuses['perk_aura_iron_will']).toBeDefined();
    expect(knight.statuses['perk_aura_resolute']).toBeDefined();
    expect(getEffectiveStat(knight, 'attack')).toBe(knight.baseStats.attack + 3);
    expect(getEffectiveStat(knight, 'defense')).toBe(knight.baseStats.defense + 4);

    // Heal back to 100%: both removed.
    knight.currentHp = 100;
    recomputeBelowHpAuras(knight, events);
    expect(knight.statuses['perk_aura_iron_will']).toBeUndefined();
    expect(knight.statuses['perk_aura_resolute']).toBeUndefined();
  });
});

// === Per-perk integration tests for L10 onCrit perks ===
// These tests use the real PERKS map (no monkey-patching) and assign the real
// perk to a class-appropriate hero via pickedPerks. They verify each perk's
// specific mechanical payload (damageBonus value for marks, stack mechanics
// for snowballs, duration for one-shot buffs).

describe("Eagle's Mark (Archer onCrit → marked target, +25% damage taken)", () => {
  it('applies marked status to the target on crit with damageBonus=0.25', () => {
    // Archer with 100% crit and eagles_mark picked. Restrict abilities to
    // archer_shoot so flare_arrow (which also applies marked, damageBonus 0.5)
    // can't contaminate the assertion. The first damaging hit should crit and
    // fire the perk, marking the enemy with damageBonus 0.25.
    const archer = makeHeroCombatant('archer', 1, 'p0', {
      baseStats: { hp: 30, attack: 5, defense: 2, speed: 9, mind: 0, crit: 100, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: ['eagles_mark'],
      abilities: ['archer_shoot'],
      aiPriority: ['archer_shoot'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([archer], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Sanity: every hit crit.
    const knightHits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0',
    );
    expect(knightHits.length).toBeGreaterThan(0);
    for (const h of knightHits) {
      if (h.kind !== 'damage_applied') continue;
      expect(h.wasCrit).toBe(true);
    }

    // status_applied event for marked was emitted by the perk.
    const markEvents = result.events.filter(
      (e) => e.kind === 'status_applied' && e.statusId === 'marked' && e.sourceId === 'p0',
    );
    expect(markEvents.length).toBeGreaterThan(0);

    // The enemy should have marked status with the perk-specific damageBonus.
    const finalEnemy = result.finalState.combatants.find((c) => c.id === 'e0');
    expect(finalEnemy).toBeDefined();
    const mark = finalEnemy!.statuses['marked'];
    expect(mark).toBeDefined();
    expect(mark.effect.kind).toBe('mark');
    if (mark.effect.kind === 'mark') {
      expect(mark.effect.damageBonus).toBe(0.25);
      expect(mark.effect.duration).toBe(3);
    }
  });

  it('subsequent damage to the marked target is amplified by +25%', () => {
    // Two combats: one with eagles_mark, one without. The marked target in the
    // perk-bearing combat should take more total damage on the second hit (the
    // first hit applies the mark; the second hit is amplified).
    function buildState(withPerk: boolean) {
      const archer = makeHeroCombatant('archer', 1, 'p0', {
        baseStats: { hp: 30, attack: 10, defense: 2, speed: 9, mind: 0, crit: 100, dodge: 0 },
        maxHp: 30,
        currentHp: 30,
        pickedPerks: withPerk ? ['eagles_mark'] : [],
        abilities: ['archer_shoot'],
        aiPriority: ['archer_shoot'],
      });
      const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
        baseStats: { hp: 9999, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
        maxHp: 9999,
        currentHp: 9999,
      });
      return makeTestState([archer], [enemy]);
    }

    const rWith = resolveCombat(buildState(true), createRng(1));
    const rWithout = resolveCombat(buildState(false), createRng(1));

    const withHits = rWith.events.filter(
      (e): e is Extract<typeof e, { kind: 'damage_applied' }> =>
        e.kind === 'damage_applied' && e.sourceId === 'p0',
    );
    const withoutHits = rWithout.events.filter(
      (e): e is Extract<typeof e, { kind: 'damage_applied' }> =>
        e.kind === 'damage_applied' && e.sourceId === 'p0',
    );
    expect(withHits.length).toBeGreaterThan(1);
    expect(withoutHits.length).toBeGreaterThan(1);

    // First hit applies the mark; both first hits should be equal (mark applies
    // on the same hit, but applyDamage reads the mark BEFORE the perk fires).
    expect(withHits[0].amount).toBe(withoutHits[0].amount);
    // Second hit: with the perk, raw is amplified by 1.25 (mark) before the
    // final - defense step. Without the perk, no amplification.
    expect(withHits[1].amount).toBeGreaterThan(withoutHits[1].amount);
  });
});

describe('Phantom (Rogue onCrit → +20 Dodge self, 2 turns, non-stacking)', () => {
  it('grants a duration-2 +20 dodge stack on the rogue on crit', () => {
    // Rogue with 100% crit and phantom picked. Restrict abilities to
    // rogue_strike so the AI doesn't waste turns on vanish (self-target,
    // no damage so no crit chance to trigger). After at least one crit, the
    // rogue should have a perk_stack_phantom_0 with +20 dodge.
    const rogue = makeHeroCombatant('rogue', 1, 'p0', {
      baseStats: { hp: 30, attack: 5, defense: 2, speed: 9, mind: 0, crit: 100, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: ['phantom'],
      abilities: ['rogue_strike'],
      aiPriority: ['rogue_strike'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([rogue], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Sanity: rogue landed at least one crit.
    const rogueCrits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0' && e.wasCrit,
    );
    expect(rogueCrits.length).toBeGreaterThan(0);

    // Phantom is non-stacking (duration set but stacking undefined) → single
    // slot perk_stack_phantom_0 overwritten on each crit. Accept either a live
    // stack on the rogue OR a status_expired event proving one was created.
    const finalRogue = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalRogue).toBeDefined();
    const liveStack = finalRogue!.statuses['perk_stack_phantom_0'];
    const expiredEvents = result.events.filter(
      (e) =>
        e.kind === 'status_expired' &&
        typeof e.statusId === 'string' &&
        e.statusId.startsWith('perk_stack_phantom_'),
    );
    expect((liveStack ? 1 : 0) + expiredEvents.length).toBeGreaterThan(0);

    // If still live, verify shape: +20 dodge, duration 2.
    if (liveStack) {
      expect(liveStack.effect.kind).toBe('buff');
      if (liveStack.effect.kind === 'buff') {
        expect(liveStack.effect.stat).toBe('dodge');
        expect(liveStack.effect.delta).toBe(20);
      }
      expect(liveStack.remainingTurns).toBeGreaterThan(0);
      expect(liveStack.remainingTurns).toBeLessThanOrEqual(2);
    }

    // Multiple crits never accumulate beyond slot _0 (non-stacking). No
    // perk_stack_phantom_1 / _2 / ... should exist.
    const extraSlots = Object.keys(finalRogue!.statuses).filter(
      (k) => k.startsWith('perk_stack_phantom_') && k !== 'perk_stack_phantom_0',
    );
    expect(extraSlots).toHaveLength(0);
  });
});

describe('Arcane Surge (Mage onCrit → marked target, +50% damage taken)', () => {
  it("applies marked with damageBonus=0.5 (distinct from Eagle's Mark)", () => {
    // Mage with 100% crit and arcane_surge picked. Restrict abilities to
    // mage_zap so no other ability (firebolt/frost_nova/arc_shock) introduces
    // statuses. Place the mage in slot 3 because mage_zap's canCastFrom is
    // [2, 3] — slot 1 (default) would leave the mage with no castable ability.
    // Verify the marked status carries the perk-specific damageBonus payload
    // of 0.5 and duration 2.
    const mage = makeHeroCombatant('mage', 3, 'p0', {
      baseStats: { hp: 30, attack: 0, defense: 2, speed: 9, mind: 5, crit: 100, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: ['arcane_surge'],
      abilities: ['mage_zap'],
      aiPriority: ['mage_zap'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([mage], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Sanity: mage crit at least once.
    const mageCrits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0' && e.wasCrit,
    );
    expect(mageCrits.length).toBeGreaterThan(0);

    // The status_applied event for marked must originate from the mage (perk).
    const markEvents = result.events.filter(
      (e) => e.kind === 'status_applied' && e.statusId === 'marked' && e.sourceId === 'p0',
    );
    expect(markEvents.length).toBeGreaterThan(0);

    const finalEnemy = result.finalState.combatants.find((c) => c.id === 'e0');
    expect(finalEnemy).toBeDefined();
    const mark = finalEnemy!.statuses['marked'];
    expect(mark).toBeDefined();
    expect(mark.effect.kind).toBe('mark');
    if (mark.effect.kind === 'mark') {
      // Distinct from Eagle's Mark (0.25) — proves the payload-driven
      // damageBonus is read per-perk, not a shared default.
      expect(mark.effect.damageBonus).toBe(0.5);
      expect(mark.effect.duration).toBe(2);
    }
  });
});

describe('Killer Instinct (Hunter onCrit → +2 Attack self, 2 turns, stacking)', () => {
  it('stacks attack buffs on multiple crits (3 stacks → +6 effective attack)', () => {
    // Drive applyPerkAction directly 3 times to verify the stacking shape
    // without tickStatuses-driven decay between hits. Mirrors the pattern used
    // by the existing onKill STACK_CAP test (drives applyPerkAction in a loop
    // rather than wrangling enemies through real combat). The in-combat fire-
    // site wiring is already verified by the "fires onCrit" test at the top
    // of this file.
    const hunter = makeHeroCombatant('hunter', 1, 'p0', {
      baseStats: { hp: 30, attack: 3, defense: 2, speed: 9, mind: 0, crit: 0, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: ['killer_instinct'],
    });
    const dummy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });

    const action = PERKS.killer_instinct.triggeredEffect!.action;
    for (let i = 0; i < 3; i++) {
      applyPerkAction({
        self: hunter,
        other: dummy,
        sourceId: 'killer_instinct',
        action,
        events: [],
      });
    }

    // 3 stacks live on the hunter; each is a duration-2 +2 attack buff.
    const stackKeys = Object.keys(hunter.statuses).filter((k) =>
      k.startsWith('perk_stack_killer_instinct_'),
    );
    expect(stackKeys).toHaveLength(3);
    for (const k of stackKeys) {
      const s = hunter.statuses[k];
      expect(s.effect.kind).toBe('buff');
      if (s.effect.kind === 'buff') {
        expect(s.effect.stat).toBe('attack');
        expect(s.effect.delta).toBe(2);
        expect(s.effect.duration).toBe(2);
      }
      expect(s.remainingTurns).toBe(2);
    }

    // Effective attack: base 3 + 2 * 3 stacks = 9.
    expect(getEffectiveStat(hunter, 'attack')).toBe(hunter.baseStats.attack + 6);
    expect(getEffectiveStat(hunter, 'attack')).toBe(9);
  });

  it('fires the stacking buff via the in-combat onCrit fire-site', () => {
    // Complementary to the direct-call test above: drive a real combat to
    // confirm the wiring is intact end-to-end. Asserts at least one live
    // perk_stack_killer_instinct_* exists or expired (no exact count — stacks
    // decay turn-by-turn at duration 2 so the count fluctuates).
    const hunter = makeHeroCombatant('hunter', 1, 'p0', {
      baseStats: { hp: 30, attack: 3, defense: 2, speed: 9, mind: 0, crit: 100, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: ['killer_instinct'],
      abilities: ['hunter_shoot'],
      aiPriority: ['hunter_shoot'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([hunter], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Sanity: hunter crit multiple times.
    const hunterCrits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0' && e.wasCrit,
    );
    expect(hunterCrits.length).toBeGreaterThan(1);

    const finalHunter = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalHunter).toBeDefined();
    const liveStackKeys = Object.keys(finalHunter!.statuses).filter((k) =>
      k.startsWith('perk_stack_killer_instinct_'),
    );
    const stackExpiredEvents = result.events.filter(
      (e) =>
        e.kind === 'status_expired' &&
        typeof e.statusId === 'string' &&
        e.statusId.startsWith('perk_stack_killer_instinct_'),
    );
    // Some live + some expired prove the wiring fired at least once.
    expect(liveStackKeys.length + stackExpiredEvents.length).toBeGreaterThan(0);

    // Every live stack has the canonical shape.
    for (const k of liveStackKeys) {
      const s = finalHunter!.statuses[k];
      expect(s.effect.kind).toBe('buff');
      if (s.effect.kind === 'buff') {
        expect(s.effect.stat).toBe('attack');
        expect(s.effect.delta).toBe(2);
      }
    }
  });
});

// === Per-perk integration tests for L10 onKill perks ===
// Same pattern as the onCrit blocks above: use real PERKS entries (no
// monkey-patching), drive applyPerkAction directly for stacking-shape
// assertions (decay-free), then verify the in-combat fire-site wiring with
// a real resolveCombat. Rampage / Spellweaver / Crusader / Pack Tactics are
// all stacking onKill gainStat perks — the same recipe used for Killer
// Instinct (a stacking onCrit) applies cleanly.

describe('Rampage (Barbarian onKill → +2 Attack self, 3 turns, stacking)', () => {
  it('stacks attack buffs on multiple kills (4 stacks → +8 effective attack)', () => {
    // Drive applyPerkAction directly to verify the stacking shape without
    // tickStatuses decay between iterations. Mirrors Killer Instinct's
    // direct-loop test.
    const barbarian = makeHeroCombatant('barbarian', 1, 'p0', {
      baseStats: { hp: 30, attack: 5, defense: 2, speed: 9, mind: 0, crit: 0, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: ['rampage'],
    });
    const dummy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });

    const action = PERKS.rampage.triggeredEffect!.action;
    for (let i = 0; i < 4; i++) {
      applyPerkAction({
        self: barbarian,
        other: dummy,
        sourceId: 'rampage',
        action,
        events: [],
      });
    }

    // 4 stacks live on the barbarian; each is a duration-3 +2 attack buff.
    const stackKeys = Object.keys(barbarian.statuses).filter((k) =>
      k.startsWith('perk_stack_rampage_'),
    );
    expect(stackKeys).toHaveLength(4);
    for (const k of stackKeys) {
      const s = barbarian.statuses[k];
      expect(s.effect.kind).toBe('buff');
      if (s.effect.kind === 'buff') {
        expect(s.effect.stat).toBe('attack');
        expect(s.effect.delta).toBe(2);
        expect(s.effect.duration).toBe(3);
      }
      expect(s.remainingTurns).toBe(3);
    }

    // Effective attack: base 5 + 2 * 4 stacks = 13.
    expect(getEffectiveStat(barbarian, 'attack')).toBe(barbarian.baseStats.attack + 8);
    expect(getEffectiveStat(barbarian, 'attack')).toBe(13);
  });

  it('fires the stacking buff via the in-combat onKill fire-site', () => {
    // Real combat with a one-shottable enemy: the barbarian's lethal hit should
    // fire rampage and produce at least one perk_stack_rampage_* status (live
    // or expired, since duration-3 stacks may decay before combat ends).
    const barbarian = makeHeroCombatant('barbarian', 1, 'p0', {
      baseStats: { hp: 30, attack: 20, defense: 2, speed: 9, mind: 0, crit: 0, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: ['rampage'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 1, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 1,
      currentHp: 1,
    });
    const state = makeTestState([barbarian], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Sanity: at least one lethal hit landed.
    const lethalHits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0' && e.lethal,
    );
    expect(lethalHits.length).toBeGreaterThan(0);

    const finalBarbarian = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalBarbarian).toBeDefined();
    const liveStackKeys = Object.keys(finalBarbarian!.statuses).filter((k) =>
      k.startsWith('perk_stack_rampage_'),
    );
    const stackExpiredEvents = result.events.filter(
      (e) =>
        e.kind === 'status_expired' &&
        typeof e.statusId === 'string' &&
        e.statusId.startsWith('perk_stack_rampage_'),
    );
    expect(liveStackKeys.length + stackExpiredEvents.length).toBeGreaterThan(0);

    // Every live stack has the canonical shape (+2 attack buff).
    for (const k of liveStackKeys) {
      const s = finalBarbarian!.statuses[k];
      expect(s.effect.kind).toBe('buff');
      if (s.effect.kind === 'buff') {
        expect(s.effect.stat).toBe('attack');
        expect(s.effect.delta).toBe(2);
      }
    }
  });
});

describe('Spellweaver (Mage onKill → +2 Mind self, 3 turns, stacking)', () => {
  it('stacks mind buffs on multiple kills (3 stacks → +6 effective mind)', () => {
    // Direct-loop test mirroring Rampage's shape — Spellweaver and Crusader
    // are mechanically identical (Mind+2 stacking on kill); we keep separate
    // tests for symmetry so a regression on either perk is reported
    // independently and points directly at the class.
    const mage = makeHeroCombatant('mage', 3, 'p0', {
      baseStats: { hp: 30, attack: 0, defense: 2, speed: 9, mind: 5, crit: 0, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: ['spellweaver'],
    });
    const dummy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });

    const action = PERKS.spellweaver.triggeredEffect!.action;
    for (let i = 0; i < 3; i++) {
      applyPerkAction({
        self: mage,
        other: dummy,
        sourceId: 'spellweaver',
        action,
        events: [],
      });
    }

    const stackKeys = Object.keys(mage.statuses).filter((k) =>
      k.startsWith('perk_stack_spellweaver_'),
    );
    expect(stackKeys).toHaveLength(3);
    for (const k of stackKeys) {
      const s = mage.statuses[k];
      expect(s.effect.kind).toBe('buff');
      if (s.effect.kind === 'buff') {
        expect(s.effect.stat).toBe('mind');
        expect(s.effect.delta).toBe(2);
        expect(s.effect.duration).toBe(3);
      }
      expect(s.remainingTurns).toBe(3);
    }

    // Effective mind: base 5 + 2 * 3 stacks = 11.
    expect(getEffectiveStat(mage, 'mind')).toBe(mage.baseStats.mind + 6);
    expect(getEffectiveStat(mage, 'mind')).toBe(11);
  });

  it('fires the stacking buff via the in-combat onKill fire-site', () => {
    // Place the mage in slot 3 (mage_zap's canCastFrom is [2, 3]) with mind 20
    // so the zap one-shots the 1-hp enemy. The lethal cast should fire
    // spellweaver and produce at least one perk_stack_spellweaver_*.
    const mage = makeHeroCombatant('mage', 3, 'p0', {
      baseStats: { hp: 30, attack: 0, defense: 2, speed: 9, mind: 20, crit: 0, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: ['spellweaver'],
      abilities: ['mage_zap'],
      aiPriority: ['mage_zap'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 1, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 1,
      currentHp: 1,
    });
    const state = makeTestState([mage], [enemy]);
    const result = resolveCombat(state, createRng(1));

    const lethalHits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0' && e.lethal,
    );
    expect(lethalHits.length).toBeGreaterThan(0);

    const finalMage = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalMage).toBeDefined();
    const liveStackKeys = Object.keys(finalMage!.statuses).filter((k) =>
      k.startsWith('perk_stack_spellweaver_'),
    );
    const stackExpiredEvents = result.events.filter(
      (e) =>
        e.kind === 'status_expired' &&
        typeof e.statusId === 'string' &&
        e.statusId.startsWith('perk_stack_spellweaver_'),
    );
    expect(liveStackKeys.length + stackExpiredEvents.length).toBeGreaterThan(0);

    for (const k of liveStackKeys) {
      const s = finalMage!.statuses[k];
      expect(s.effect.kind).toBe('buff');
      if (s.effect.kind === 'buff') {
        expect(s.effect.stat).toBe('mind');
        expect(s.effect.delta).toBe(2);
      }
    }
  });
});

describe('Crusader (Paladin onKill → +2 Mind self, 3 turns, stacking)', () => {
  it('stacks mind buffs on multiple kills (5 stacks → +10 effective mind, hits cap)', () => {
    // Direct-loop test driving 5 kills — the stack-cap boundary. Spellweaver
    // and Crusader share mechanics; we cover the cap edge here for variety.
    const paladin = makeHeroCombatant('paladin', 1, 'p0', {
      baseStats: { hp: 30, attack: 5, defense: 4, speed: 5, mind: 3, crit: 0, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: ['crusader'],
    });
    const dummy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });

    const action = PERKS.crusader.triggeredEffect!.action;
    for (let i = 0; i < 5; i++) {
      applyPerkAction({
        self: paladin,
        other: dummy,
        sourceId: 'crusader',
        action,
        events: [],
      });
    }

    const stackKeys = Object.keys(paladin.statuses).filter((k) =>
      k.startsWith('perk_stack_crusader_'),
    );
    expect(stackKeys).toHaveLength(STACK_CAP); // 5
    for (const k of stackKeys) {
      const s = paladin.statuses[k];
      expect(s.effect.kind).toBe('buff');
      if (s.effect.kind === 'buff') {
        expect(s.effect.stat).toBe('mind');
        expect(s.effect.delta).toBe(2);
        expect(s.effect.duration).toBe(3);
      }
      expect(s.remainingTurns).toBe(3);
    }

    // Effective mind: base 3 + 2 * 5 stacks = 13.
    expect(getEffectiveStat(paladin, 'mind')).toBe(paladin.baseStats.mind + 10);
    expect(getEffectiveStat(paladin, 'mind')).toBe(13);
  });

  it('fires the stacking buff via the in-combat onKill fire-site', () => {
    // Real-combat wiring check — symmetrical to Spellweaver but driven by a
    // paladin landing a lethal basic attack.
    const paladin = makeHeroCombatant('paladin', 1, 'p0', {
      baseStats: { hp: 30, attack: 20, defense: 4, speed: 9, mind: 3, crit: 0, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: ['crusader'],
      abilities: ['paladin_strike'],
      aiPriority: ['paladin_strike'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 1, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 1,
      currentHp: 1,
    });
    const state = makeTestState([paladin], [enemy]);
    const result = resolveCombat(state, createRng(1));

    const lethalHits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0' && e.lethal,
    );
    expect(lethalHits.length).toBeGreaterThan(0);

    const finalPaladin = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalPaladin).toBeDefined();
    const liveStackKeys = Object.keys(finalPaladin!.statuses).filter((k) =>
      k.startsWith('perk_stack_crusader_'),
    );
    const stackExpiredEvents = result.events.filter(
      (e) =>
        e.kind === 'status_expired' &&
        typeof e.statusId === 'string' &&
        e.statusId.startsWith('perk_stack_crusader_'),
    );
    expect(liveStackKeys.length + stackExpiredEvents.length).toBeGreaterThan(0);

    for (const k of liveStackKeys) {
      const s = finalPaladin!.statuses[k];
      expect(s.effect.kind).toBe('buff');
      if (s.effect.kind === 'buff') {
        expect(s.effect.stat).toBe('mind');
        expect(s.effect.delta).toBe(2);
      }
    }
  });
});

describe('Pack Tactics (Hunter onKill → +1 Speed self, 2 turns, stacking)', () => {
  it('stacks speed buffs on multiple kills (3 stacks → +3 effective speed)', () => {
    // Direct-loop test: 3 kills produce 3 +1-speed duration-2 stacks. Distinct
    // from the other onKill perks: delta=1 (not 2) and duration=2 (not 3).
    const hunter = makeHeroCombatant('hunter', 1, 'p0', {
      baseStats: { hp: 30, attack: 5, defense: 2, speed: 4, mind: 0, crit: 0, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: ['pack_tactics'],
    });
    const dummy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 0, defense: 0, speed: 0, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });

    const action = PERKS.pack_tactics.triggeredEffect!.action;
    for (let i = 0; i < 3; i++) {
      applyPerkAction({
        self: hunter,
        other: dummy,
        sourceId: 'pack_tactics',
        action,
        events: [],
      });
    }

    const stackKeys = Object.keys(hunter.statuses).filter((k) =>
      k.startsWith('perk_stack_pack_tactics_'),
    );
    expect(stackKeys).toHaveLength(3);
    for (const k of stackKeys) {
      const s = hunter.statuses[k];
      expect(s.effect.kind).toBe('buff');
      if (s.effect.kind === 'buff') {
        expect(s.effect.stat).toBe('speed');
        expect(s.effect.delta).toBe(1);
        expect(s.effect.duration).toBe(2);
      }
      expect(s.remainingTurns).toBe(2);
    }

    // Effective speed: base 4 + 1 * 3 stacks = 7.
    expect(getEffectiveStat(hunter, 'speed')).toBe(hunter.baseStats.speed + 3);
    expect(getEffectiveStat(hunter, 'speed')).toBe(7);
  });

  it('fires the stacking buff via the in-combat onKill fire-site', () => {
    // Real-combat wiring check. Hunter one-shots a 1-hp enemy with hunter_shoot
    // and the perk fires on the lethal hit.
    const hunter = makeHeroCombatant('hunter', 1, 'p0', {
      baseStats: { hp: 30, attack: 20, defense: 2, speed: 9, mind: 0, crit: 0, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: ['pack_tactics'],
      abilities: ['hunter_shoot'],
      aiPriority: ['hunter_shoot'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 1, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 1,
      currentHp: 1,
    });
    const state = makeTestState([hunter], [enemy]);
    const result = resolveCombat(state, createRng(1));

    const lethalHits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0' && e.lethal,
    );
    expect(lethalHits.length).toBeGreaterThan(0);

    const finalHunter = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalHunter).toBeDefined();
    const liveStackKeys = Object.keys(finalHunter!.statuses).filter((k) =>
      k.startsWith('perk_stack_pack_tactics_'),
    );
    const stackExpiredEvents = result.events.filter(
      (e) =>
        e.kind === 'status_expired' &&
        typeof e.statusId === 'string' &&
        e.statusId.startsWith('perk_stack_pack_tactics_'),
    );
    expect(liveStackKeys.length + stackExpiredEvents.length).toBeGreaterThan(0);

    for (const k of liveStackKeys) {
      const s = finalHunter!.statuses[k];
      expect(s.effect.kind).toBe('buff');
      if (s.effect.kind === 'buff') {
        expect(s.effect.stat).toBe('speed');
        expect(s.effect.delta).toBe(1);
      }
    }
  });
});

// === Per-perk integration tests for L10 onStruck perks ===
// Same pattern as the onCrit / onKill blocks above: use real PERKS entries (no
// monkey-patching), assign the real perk to a class-appropriate hero via
// pickedPerks, and verify each perk's specific mechanical payload end-to-end
// through resolveCombat. The synthetic-perk onStruck wiring tests at the top
// of this file already prove the trigger plumbing — these tests prove each
// real perk's payload is wired correctly.

describe('Unbreakable (Knight onStruck whenAtFullHp:true → damageMitigation 0.5)', () => {
  it('halves the first incoming hit at full HP; subsequent hits (now below full HP) unmitigated', () => {
    // Knight defender at full HP with unbreakable picked. The enemy is built
    // to land multiple hits without one-shotting (knight HP 500, enemy attack
    // 20 with no defense pierce). speed asymmetry is unimportant — the only
    // hits that matter target the knight.
    //
    // Knight has shield_bash in its ability set; we restrict abilities to
    // knight_strike so the knight doesn't stun the enemy and skip its turns
    // (which would deny us the multi-hit sequence we need to compare).
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 500, attack: 1, defense: 0, speed: 2, mind: 0, crit: 0, dodge: 0 },
      maxHp: 500,
      currentHp: 500,
      pickedPerks: ['unbreakable'],
      abilities: ['knight_slash'],
      aiPriority: ['knight_slash'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 20, defense: 0, speed: 5, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    const hitsOnKnight = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.targetId === 'p0',
    );
    expect(hitsOnKnight.length).toBeGreaterThan(1);

    const firstHit = hitsOnKnight[0];
    const secondHit = hitsOnKnight[1];
    if (firstHit.kind !== 'damage_applied' || secondHit.kind !== 'damage_applied') {
      throw new Error('expected damage_applied events');
    }
    // First hit (defender at full HP): mitigated by 0.5. Second hit (defender
    // now below full HP): unmitigated. Mirrors the synthetic-perk test at the
    // top of this file but uses the real `pickedPerks: ['unbreakable']`.
    expect(firstHit.amount).toBeLessThan(secondHit.amount);
    expect(firstHit.amount).toBe(Math.max(1, Math.round(secondHit.amount * 0.5)));
  });

  it('does not mitigate when the perk is not picked (no halving on the first hit)', () => {
    // Same setup as above but with empty pickedPerks. The first hit should
    // equal the second hit (no mitigation, no halving), proving the mitigation
    // is gated on the picked perk and not a default behavior.
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 500, attack: 1, defense: 0, speed: 2, mind: 0, crit: 0, dodge: 0 },
      maxHp: 500,
      currentHp: 500,
      pickedPerks: [],
      abilities: ['knight_slash'],
      aiPriority: ['knight_slash'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 20, defense: 0, speed: 5, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    const hitsOnKnight = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.targetId === 'p0',
    );
    expect(hitsOnKnight.length).toBeGreaterThan(1);

    const firstHit = hitsOnKnight[0];
    const secondHit = hitsOnKnight[1];
    if (firstHit.kind !== 'damage_applied' || secondHit.kind !== 'damage_applied') {
      throw new Error('expected damage_applied events');
    }
    // Without the perk, the first hit is NOT halved — equal to the second.
    expect(firstHit.amount).toBe(secondHit.amount);
  });
});

describe('Holy Vigor (Priest onStruck → applyStatus blessed, 3 turns, target:self, healPerTurn:5)', () => {
  it('applies blessed (regen, healPerTurn=5) to the priest when struck', () => {
    // Priest defender with holy_vigor picked. When the enemy lands a hit, the
    // perk should self-apply 'blessed' with the perk-specific healPerTurn=5.
    // Restrict the priest's abilities to priest_strike (damage-only, no status
    // applied) so the priest doesn't apply 'blessed' via bless or any other
    // status-applying ability and contaminate the assertion.
    const priest = makeHeroCombatant('priest', 1, 'p0', {
      baseStats: { hp: 60, attack: 2, defense: 2, speed: 2, mind: 5, crit: 0, dodge: 0 },
      maxHp: 60,
      currentHp: 60,
      pickedPerks: ['holy_vigor'],
      abilities: ['priest_strike'],
      aiPriority: ['priest_strike'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 6, defense: 2, speed: 5, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([priest], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Sanity: the priest took at least one hit.
    const hitsOnPriest = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.targetId === 'p0',
    );
    expect(hitsOnPriest.length).toBeGreaterThan(0);

    // status_applied event for blessed must originate from the priest (perk
    // self-target — sourceId is p0 because the perk-bearer is `self`).
    const blessedEvents = result.events.filter(
      (e) => e.kind === 'status_applied' && e.statusId === 'blessed' && e.sourceId === 'p0',
    );
    expect(blessedEvents.length).toBeGreaterThan(0);

    // The priest should have the blessed status with the canonical regen
    // AbilityEffect shape and the perk-specific healPerTurn=5. Accept either a
    // live status OR a status_expired event proving one was created (the 3-turn
    // duration may have decayed if the combat ran long).
    const finalPriest = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalPriest).toBeDefined();
    const blessed = finalPriest!.statuses['blessed'];
    const expiredEvents = result.events.filter(
      (e) =>
        e.kind === 'status_expired' &&
        typeof e.statusId === 'string' &&
        e.statusId === 'blessed',
    );
    expect((blessed ? 1 : 0) + expiredEvents.length).toBeGreaterThan(0);

    // If still live, verify the shape: regen kind, healPerTurn 5, duration 3.
    if (blessed) {
      expect(blessed.effect.kind).toBe('regen');
      if (blessed.effect.kind === 'regen') {
        expect(blessed.effect.healPerTurn).toBe(5);
        expect(blessed.effect.duration).toBe(3);
      }
      expect(blessed.remainingTurns).toBeGreaterThan(0);
      expect(blessed.remainingTurns).toBeLessThanOrEqual(3);
    }
  });

  it('does not apply blessed when the perk is not picked', () => {
    // Same setup but with empty pickedPerks — no blessed status should ever
    // appear, since priest_strike (the only allowed ability) is a damaging hit
    // with no self-applied status.
    const priest = makeHeroCombatant('priest', 1, 'p0', {
      baseStats: { hp: 60, attack: 2, defense: 2, speed: 2, mind: 5, crit: 0, dodge: 0 },
      maxHp: 60,
      currentHp: 60,
      pickedPerks: [],
      abilities: ['priest_strike'],
      aiPriority: ['priest_strike'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 6, defense: 2, speed: 5, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([priest], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Sanity: the priest took hits.
    const hitsOnPriest = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.targetId === 'p0',
    );
    expect(hitsOnPriest.length).toBeGreaterThan(0);

    // No blessed status_applied events from the priest (perk-less), no live
    // blessed status on the final priest.
    const blessedEvents = result.events.filter(
      (e) => e.kind === 'status_applied' && e.statusId === 'blessed' && e.sourceId === 'p0',
    );
    expect(blessedEvents).toHaveLength(0);
    const finalPriest = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalPriest!.statuses['blessed']).toBeUndefined();
  });
});

// === Per-perk integration tests for L10 firstAttack perks ===
// Same pattern as the onCrit / onKill / onStruck blocks above: use real PERKS
// entries (no monkey-patching), assign the real perk to a class-appropriate
// hero via pickedPerks, and verify each perk's specific multiplier end-to-end
// through resolveCombat. The synthetic-perk firstAttack wiring tests near the
// top of this file already prove the trigger plumbing (per-combat tracker
// reset, pendingDamageMod consumption, etc.) — these tests prove each real
// perk's multiplier payload is wired correctly.

describe('First Strike (Archer firstAttack → damageMod 2.0)', () => {
  it('doubles the first attack damage; second attack is unboosted', () => {
    // Archer with first_strike picked. Restrict abilities to archer_shoot so
    // flare_arrow (which applies 'marked', damageBonus 0.5) can't contaminate
    // the math — every hit must be a plain damage tick whose only difference
    // from the next hit is the firstAttack multiplier. Speed 9 so the archer
    // acts first each round, crit 0 / dodge 0 so the damage is deterministic.
    const archer = makeHeroCombatant('archer', 1, 'p0', {
      baseStats: { hp: 60, attack: 10, defense: 4, speed: 9, mind: 0, crit: 0, dodge: 0 },
      maxHp: 60,
      currentHp: 60,
      pickedPerks: ['first_strike'],
      abilities: ['archer_shoot'],
      aiPriority: ['archer_shoot'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([archer], [enemy]);
    const result = resolveCombat(state, createRng(1));

    const archerHits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0',
    );
    expect(archerHits.length).toBeGreaterThan(1);

    const firstHit = archerHits[0];
    const secondHit = archerHits[1];
    if (firstHit.kind !== 'damage_applied' || secondHit.kind !== 'damage_applied') {
      throw new Error('expected damage_applied events');
    }
    // First hit doubled (×2.0), second hit baseline. With enemy defense 0 the
    // relationship is exact: first = max(1, second * 2).
    expect(firstHit.amount).toBeGreaterThan(secondHit.amount);
    expect(firstHit.amount).toBe(Math.max(1, secondHit.amount * 2));

    // The firstAttack tracker should record that first_strike fired.
    const finalArcher = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalArcher).toBeDefined();
    expect(finalArcher!.firstAttackFiredSourceIds).toContain('first_strike');
    // And pendingDamageMod should be back to 1 (consumed by the first hit;
    // proves it didn't leak through to the second hit).
    expect(finalArcher!.pendingDamageMod ?? 1).toBe(1);
  });
});

describe('Backstab (Rogue firstAttack → damageMod 2.5)', () => {
  it('multiplies the first attack damage by 2.5x; second attack is unboosted', () => {
    // Rogue with the `backstab` perk picked. Restrict abilities to rogue_strike
    // — note that the rogue class also has an ability called `backstab` (a
    // different thing, a cooldown-2 finisher with bonusCrit 25); restricting
    // abilities ensures the rogue uses plain rogue_strike each turn so the
    // multiplier math is clean. Speed 9 / crit 0 / dodge 0 for determinism.
    const rogue = makeHeroCombatant('rogue', 1, 'p0', {
      baseStats: { hp: 60, attack: 10, defense: 4, speed: 9, mind: 0, crit: 0, dodge: 0 },
      maxHp: 60,
      currentHp: 60,
      pickedPerks: ['backstab'],
      abilities: ['rogue_strike'],
      aiPriority: ['rogue_strike'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([rogue], [enemy]);
    const result = resolveCombat(state, createRng(1));

    const rogueHits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0',
    );
    expect(rogueHits.length).toBeGreaterThan(1);

    const firstHit = rogueHits[0];
    const secondHit = rogueHits[1];
    if (firstHit.kind !== 'damage_applied' || secondHit.kind !== 'damage_applied') {
      throw new Error('expected damage_applied events');
    }
    // First hit ×2.5 (rounded by applyDamage), second hit baseline. The math:
    // applyDamage rounds raw * pendingDamageMod, so first = max(1,
    // round(second * 2.5)). With enemy defense 0 there's no subtraction.
    expect(firstHit.amount).toBeGreaterThan(secondHit.amount);
    expect(firstHit.amount).toBe(Math.max(1, Math.round(secondHit.amount * 2.5)));

    // The firstAttack tracker should record that backstab fired.
    const finalRogue = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalRogue).toBeDefined();
    expect(finalRogue!.firstAttackFiredSourceIds).toContain('backstab');
    // And pendingDamageMod should be back to 1 (consumed by the first hit;
    // proves it didn't leak through to the second hit).
    expect(finalRogue!.pendingDamageMod ?? 1).toBe(1);
  });
});

// === Per-perk integration tests for L10 whenBelowHp perks ===
// Same pattern as the prior per-perk blocks: use the real PERKS map (no
// monkey-patching), assign the real perk to a class-appropriate hero via
// pickedPerks, and verify each perk's specific ratio + stat + delta. The
// synthetic whenBelowHp tests near the top of this file already prove the
// recompute plumbing (apply on drop, remove on heal, multi-perk independence)
// — these tests prove each real perk's payload (correct ratio threshold,
// correct stat, correct delta) is wired correctly.

describe('Last Stand (Knight whenBelowHp 0.3 → +4 Defense)', () => {
  it('applies +4 defense aura when HP drops below 30%, removes when healed above', () => {
    // Knight with last_stand picked, full HP. Drive HP across the 0.3
    // threshold via direct mutation + recomputeBelowHpAuras.
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 4, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 0 },
      maxHp: 100,
      currentHp: 100,
      pickedPerks: ['last_stand'],
    });
    const events: CombatEvent[] = [];

    // Above threshold: aura inactive, defense at base.
    recomputeBelowHpAuras(knight, events);
    expect(knight.statuses['perk_aura_last_stand']).toBeUndefined();
    expect(getEffectiveStat(knight, 'defense')).toBe(knight.baseStats.defense);

    // Just above threshold (30%): aura still inactive (ratio is strict <).
    knight.currentHp = 30;
    recomputeBelowHpAuras(knight, events);
    expect(knight.statuses['perk_aura_last_stand']).toBeUndefined();
    expect(getEffectiveStat(knight, 'defense')).toBe(knight.baseStats.defense);

    // Below threshold (29%): aura active, defense +4.
    knight.currentHp = 29;
    recomputeBelowHpAuras(knight, events);
    expect(knight.statuses['perk_aura_last_stand']).toBeDefined();
    expect(getEffectiveStat(knight, 'defense')).toBe(knight.baseStats.defense + 4);

    // Heal above threshold (40%): aura removed, defense back to base.
    knight.currentHp = 40;
    recomputeBelowHpAuras(knight, events);
    expect(knight.statuses['perk_aura_last_stand']).toBeUndefined();
    expect(getEffectiveStat(knight, 'defense')).toBe(knight.baseStats.defense);
  });
});

describe('Sanctity (Priest whenBelowHp 0.5 → +4 Mind)', () => {
  it('applies +4 mind aura when HP drops below 50%, removes when healed above', () => {
    // Priest with sanctity picked. Drive HP across the 0.5 threshold.
    const priest = makeHeroCombatant('priest', 1, 'p0', {
      baseStats: { hp: 100, attack: 3, defense: 2, speed: 4, mind: 5, crit: 0, dodge: 0 },
      maxHp: 100,
      currentHp: 100,
      pickedPerks: ['sanctity'],
    });
    const events: CombatEvent[] = [];

    // Above threshold: aura inactive, mind at base.
    recomputeBelowHpAuras(priest, events);
    expect(priest.statuses['perk_aura_sanctity']).toBeUndefined();
    expect(getEffectiveStat(priest, 'mind')).toBe(priest.baseStats.mind);

    // Below threshold (40%): aura active, mind +4.
    priest.currentHp = 40;
    recomputeBelowHpAuras(priest, events);
    expect(priest.statuses['perk_aura_sanctity']).toBeDefined();
    expect(getEffectiveStat(priest, 'mind')).toBe(priest.baseStats.mind + 4);

    // Heal above threshold (60%): aura removed.
    priest.currentHp = 60;
    recomputeBelowHpAuras(priest, events);
    expect(priest.statuses['perk_aura_sanctity']).toBeUndefined();
    expect(getEffectiveStat(priest, 'mind')).toBe(priest.baseStats.mind);
  });
});

describe('Bloodlust (Barbarian whenBelowHp 0.5 → +4 Attack)', () => {
  it('applies +4 attack aura when HP drops below 50%, removes when healed above', () => {
    // Barbarian with bloodlust picked. Drive HP across the 0.5 threshold.
    const barbarian = makeHeroCombatant('barbarian', 1, 'p0', {
      baseStats: { hp: 100, attack: 6, defense: 3, speed: 3, mind: 0, crit: 0, dodge: 0 },
      maxHp: 100,
      currentHp: 100,
      pickedPerks: ['bloodlust'],
    });
    const events: CombatEvent[] = [];

    // Above threshold: aura inactive, attack at base.
    recomputeBelowHpAuras(barbarian, events);
    expect(barbarian.statuses['perk_aura_bloodlust']).toBeUndefined();
    expect(getEffectiveStat(barbarian, 'attack')).toBe(barbarian.baseStats.attack);

    // Below threshold (40%): aura active, attack +4.
    barbarian.currentHp = 40;
    recomputeBelowHpAuras(barbarian, events);
    expect(barbarian.statuses['perk_aura_bloodlust']).toBeDefined();
    expect(getEffectiveStat(barbarian, 'attack')).toBe(barbarian.baseStats.attack + 4);

    // Heal above threshold (60%): aura removed.
    barbarian.currentHp = 60;
    recomputeBelowHpAuras(barbarian, events);
    expect(barbarian.statuses['perk_aura_bloodlust']).toBeUndefined();
    expect(getEffectiveStat(barbarian, 'attack')).toBe(barbarian.baseStats.attack);
  });
});

describe('Aegis (Paladin whenBelowHp 0.4 → +3 Defense)', () => {
  it('applies +3 defense aura when HP drops below 40%, removes when healed above', () => {
    // Paladin with aegis picked. Drive HP across the 0.4 threshold. Note the
    // ratio (0.4) and delta (+3) differ from Last Stand (0.3 / +4); these
    // values are the payload under test.
    const paladin = makeHeroCombatant('paladin', 1, 'p0', {
      baseStats: { hp: 100, attack: 3, defense: 4, speed: 3, mind: 4, crit: 0, dodge: 0 },
      maxHp: 100,
      currentHp: 100,
      pickedPerks: ['aegis'],
    });
    const events: CombatEvent[] = [];

    // Above threshold: aura inactive, defense at base.
    recomputeBelowHpAuras(paladin, events);
    expect(paladin.statuses['perk_aura_aegis']).toBeUndefined();
    expect(getEffectiveStat(paladin, 'defense')).toBe(paladin.baseStats.defense);

    // 35% (below 0.4 but above 0.3 — proves the threshold is paladin-specific,
    // not the Knight's 0.3): aura active, defense +3.
    paladin.currentHp = 35;
    recomputeBelowHpAuras(paladin, events);
    expect(paladin.statuses['perk_aura_aegis']).toBeDefined();
    expect(getEffectiveStat(paladin, 'defense')).toBe(paladin.baseStats.defense + 3);

    // Heal above threshold (50%): aura removed.
    paladin.currentHp = 50;
    recomputeBelowHpAuras(paladin, events);
    expect(paladin.statuses['perk_aura_aegis']).toBeUndefined();
    expect(getEffectiveStat(paladin, 'defense')).toBe(paladin.baseStats.defense);
  });
});

// === Legendary-item triggered effects ===
// Smoke test that the hook system iterates `equippedLegendaryIds` alongside
// `pickedPerks`. Uses Lich's Crown (onKill → +2 mind, dur 3, stacking): wires
// the legendary on a hero whose `pickedPerks` is empty, forces a kill, and
// asserts the per-legendary stack key appears on the combatant. The stack-key
// shape is `perk_stack_${sourceId}_${i}` for any sourceId — perk or legendary.
describe('Legendary equipped → triggered passive fires (smoke)', () => {
  it("a hero with Lich's Crown equipped gets onKill stacks via equippedLegendaryIds", () => {
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 30, attack: 20, defense: 4, speed: 9, mind: 0, crit: 0, dodge: 0 },
      maxHp: 30,
      currentHp: 30,
      pickedPerks: [],
      equippedLegendaryIds: ['lichs_crown'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 1, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 1,
      currentHp: 1,
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Sanity: the knight landed a lethal hit.
    const knightLethalHits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0' && e.lethal,
    );
    expect(knightLethalHits.length).toBeGreaterThan(0);

    // Verify a perk_stack_lichs_crown_* status was produced (live or expired).
    const finalKnight = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalKnight).toBeDefined();
    const liveStackKeys = Object.keys(finalKnight!.statuses).filter((k) =>
      k.startsWith('perk_stack_lichs_crown_'),
    );
    const stackExpiredEvents = result.events.filter(
      (e) =>
        e.kind === 'status_expired' &&
        typeof e.statusId === 'string' &&
        e.statusId.startsWith('perk_stack_lichs_crown_'),
    );
    expect(liveStackKeys.length + stackExpiredEvents.length).toBeGreaterThan(0);
  });
});

// === Per-legendary integration tests ===
// Same pattern as the Lich's Crown smoke test above: wire a real legendary id
// via `equippedLegendaryIds` on a hero whose `pickedPerks` is empty, drive the
// trigger via resolveCombat (or recomputeBelowHpAuras for whenBelowHp), and
// assert the legendary's specific action payload landed. No monkey-patching —
// the LEGENDARY_DEFS entries themselves are under test.

describe('Phylactery (onStruck → rotting on attacker)', () => {
  it('applies rotting status to the attacker when the bearer is hit', () => {
    // Hero defender with phylactery equipped. Enemy attacks; the legendary's
    // onStruck should apply 'rotting' (poison-kind AbilityEffect, damagePerTurn=3,
    // duration=2) to the attacker. Restrict the priest's abilities to priest_strike
    // so no priest ability contaminates the assertion (priest_strike is damage-only).
    const priest = makeHeroCombatant('priest', 1, 'p0', {
      baseStats: { hp: 60, attack: 2, defense: 2, speed: 2, mind: 0, crit: 0, dodge: 0 },
      maxHp: 60,
      currentHp: 60,
      pickedPerks: [],
      equippedLegendaryIds: ['phylactery'],
      abilities: ['priest_strike'],
      aiPriority: ['priest_strike'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 6, defense: 2, speed: 5, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([priest], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Sanity: the priest took at least one hit.
    const hitsOnPriest = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.targetId === 'p0',
    );
    expect(hitsOnPriest.length).toBeGreaterThan(0);

    // status_applied event for 'rotting' targeting the enemy, sourced from p0
    // (the perk-bearer is `self`; legendary onStruck targets `other` = attacker).
    const rottingEvents = result.events.filter(
      (e) =>
        e.kind === 'status_applied' &&
        e.statusId === 'rotting' &&
        e.sourceId === 'p0' &&
        e.targetId === 'e0',
    );
    expect(rottingEvents.length).toBeGreaterThan(0);

    // The enemy should bear 'rotting' on the final state (poison kind, damagePerTurn=3).
    // Accept either a live status OR a status_expired event proving one was created
    // (duration=2 may have ticked away in a long combat).
    const finalEnemy = result.finalState.combatants.find((c) => c.id === 'e0');
    expect(finalEnemy).toBeDefined();
    const rotting = finalEnemy!.statuses['rotting'];
    const expiredEvents = result.events.filter(
      (e) =>
        e.kind === 'status_expired' &&
        typeof e.statusId === 'string' &&
        e.statusId === 'rotting',
    );
    expect((rotting ? 1 : 0) + expiredEvents.length).toBeGreaterThan(0);

    if (rotting) {
      expect(rotting.effect.kind).toBe('poison');
      if (rotting.effect.kind === 'poison') {
        expect(rotting.effect.damagePerTurn).toBe(3);
        expect(rotting.effect.duration).toBe(2);
      }
    }
  });
});

describe('Tidewalker Helm (whenBelowHp 0.5 → +4 Defense)', () => {
  it('applies +4 defense aura via equippedLegendaryIds when HP drops below 50%, removes when healed above', () => {
    // Hero with tidewalker_helm equipped (no perks), full HP. Drive HP across
    // the 0.5 threshold via direct mutation + recomputeBelowHpAuras — same
    // pattern as the real-perk whenBelowHp tests above. The aura key uses the
    // legendary id: `perk_aura_tidewalker_helm`.
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 4, defense: 4, speed: 3, mind: 0, crit: 0, dodge: 0 },
      maxHp: 100,
      currentHp: 100,
      pickedPerks: [],
      equippedLegendaryIds: ['tidewalker_helm'],
    });
    const events: CombatEvent[] = [];

    // Above threshold: aura inactive, defense at base.
    recomputeBelowHpAuras(knight, events);
    expect(knight.statuses['perk_aura_tidewalker_helm']).toBeUndefined();
    expect(getEffectiveStat(knight, 'defense')).toBe(knight.baseStats.defense);

    // Below threshold (40%): aura active, defense +4.
    knight.currentHp = 40;
    recomputeBelowHpAuras(knight, events);
    expect(knight.statuses['perk_aura_tidewalker_helm']).toBeDefined();
    expect(getEffectiveStat(knight, 'defense')).toBe(knight.baseStats.defense + 4);

    // Heal above threshold (60%): aura removed, defense back to base.
    knight.currentHp = 60;
    recomputeBelowHpAuras(knight, events);
    expect(knight.statuses['perk_aura_tidewalker_helm']).toBeUndefined();
    expect(getEffectiveStat(knight, 'defense')).toBe(knight.baseStats.defense);
  });
});

describe("King's Aegis (onStruck → drowning on attacker)", () => {
  it('applies drowning status to the attacker when the bearer is hit', () => {
    // Same pattern as Phylactery: hero with kings_aegis equipped (no perks);
    // enemy attacks; the legendary's onStruck should apply 'drowning'
    // (poison-kind, damagePerTurn=3, duration=3) to the attacker.
    const priest = makeHeroCombatant('priest', 1, 'p0', {
      baseStats: { hp: 60, attack: 2, defense: 2, speed: 2, mind: 0, crit: 0, dodge: 0 },
      maxHp: 60,
      currentHp: 60,
      pickedPerks: [],
      equippedLegendaryIds: ['kings_aegis'],
      abilities: ['priest_strike'],
      aiPriority: ['priest_strike'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 6, defense: 2, speed: 5, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([priest], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Sanity: the priest took at least one hit.
    const hitsOnPriest = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.targetId === 'p0',
    );
    expect(hitsOnPriest.length).toBeGreaterThan(0);

    // status_applied event for 'drowning' targeting the enemy, sourced from p0.
    const drowningEvents = result.events.filter(
      (e) =>
        e.kind === 'status_applied' &&
        e.statusId === 'drowning' &&
        e.sourceId === 'p0' &&
        e.targetId === 'e0',
    );
    expect(drowningEvents.length).toBeGreaterThan(0);

    // The enemy should bear 'drowning' on the final state (poison kind, damagePerTurn=3).
    const finalEnemy = result.finalState.combatants.find((c) => c.id === 'e0');
    expect(finalEnemy).toBeDefined();
    const drowning = finalEnemy!.statuses['drowning'];
    const expiredEvents = result.events.filter(
      (e) =>
        e.kind === 'status_expired' &&
        typeof e.statusId === 'string' &&
        e.statusId === 'drowning',
    );
    expect((drowning ? 1 : 0) + expiredEvents.length).toBeGreaterThan(0);

    if (drowning) {
      expect(drowning.effect.kind).toBe('poison');
      if (drowning.effect.kind === 'poison') {
        expect(drowning.effect.damagePerTurn).toBe(3);
        expect(drowning.effect.duration).toBe(3);
      }
    }
  });
});

describe('Vampiric weapon (onHit + lifesteal 0.15)', () => {
  it('heals 15% of damage dealt on every outgoing hit', () => {
    // Hero attacker with equippedLegendaryPassiveIds: ['vampiric'].
    // Abilities restricted to knight_slash (power=1.0) so every hit deals
    // floor(attack * 0.15) lifesteal heal. attack=20 → 20 damage → 3 HP per hit.
    // Enemy has attack=0 so the knight takes no damage (min-1 floor still applies,
    // but with defense=4 the enemy would need > 4 attack to deal damage, and the
    // floor-1 only fires on raw>0). Actually raw=0 → final=max(1,-4)=1 → always 1
    // damage. Defense is set to 999 to absorb this.
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 20, defense: 999, speed: 10, mind: 0, crit: 0, dodge: 0 },
      maxHp: 100,
      currentHp: 50,
      pickedPerks: [],
      equippedLegendaryIds: [],
      equippedLegendaryPassiveIds: ['vampiric'],
      abilities: ['knight_slash'],
      aiPriority: ['knight_slash'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 200, attack: 5, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 200,
      currentHp: 200,
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Sanity: the knight landed at least one hit.
    const knightHits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0',
    );
    expect(knightHits.length).toBeGreaterThan(0);

    // Knight's HP should have increased above 50 from lifesteal heals.
    const finalKnight = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalKnight).toBeDefined();
    expect(finalKnight!.currentHp).toBeGreaterThan(50);
  });

  it('does not heal when caster is at full HP (no headroom)', () => {
    // Knight at full HP (100/100) with a 1-HP enemy that dies on the first hit.
    // Knight attacks first (speed 10 >> enemy speed 1), kills the enemy instantly,
    // and never takes a hit. Lifesteal tries to fire but actual = min(heal, 0) = 0,
    // so no heal_applied event is pushed and HP stays at maxHp.
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 20, defense: 999, speed: 10, mind: 0, crit: 0, dodge: 0 },
      maxHp: 100,
      currentHp: 100,
      pickedPerks: [],
      equippedLegendaryIds: [],
      equippedLegendaryPassiveIds: ['vampiric'],
      abilities: ['knight_slash'],
      aiPriority: ['knight_slash'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 1, attack: 5, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 1,
      currentHp: 1,
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Knight's HP must not exceed maxHp (no overheal).
    const finalKnight = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalKnight).toBeDefined();
    expect(finalKnight!.currentHp).toBeLessThanOrEqual(100);

    // No heal_applied event sourced from the knight (nothing to heal into).
    const vampiricHeals = result.events.filter(
      (e) => e.kind === 'heal_applied' && e.sourceId === 'p0',
    );
    expect(vampiricHeals.length).toBe(0);
  });

  it('emits heal_applied events with hero as source and target', () => {
    // Hero with Vampiric weapon, low HP. Verify heal_applied events appear in
    // the event stream with sourceId === targetId === hero.id and amount > 0.
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 20, defense: 999, speed: 10, mind: 0, crit: 0, dodge: 0 },
      maxHp: 100,
      currentHp: 50,
      pickedPerks: [],
      equippedLegendaryIds: [],
      equippedLegendaryPassiveIds: ['vampiric'],
      abilities: ['knight_slash'],
      aiPriority: ['knight_slash'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 200, attack: 5, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 200,
      currentHp: 200,
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    const vampiricHeals = result.events.filter(
      (e) =>
        e.kind === 'heal_applied' &&
        e.sourceId === 'p0' &&
        e.targetId === 'p0' &&
        e.amount > 0,
    );
    expect(vampiricHeals.length).toBeGreaterThan(0);
  });
});

describe('Fortified shield (onStruck → damageMitigation 0.8)', () => {
  it('reduces incoming damage by ~20% on every hit', () => {
    // Two parallel runs: one hero with Fortified equipped, one without.
    // The Fortified run should deal ~80% of the damage of the baseline run.
    // Hero stats: high HP to survive multiple hits, low defense to keep damage
    // observable (no defense absorption). Enemy attack=20 so raw damage is well
    // above 0; Math.round(20 * 0.8) = 16 vs 20 baseline.
    const makeKnight = (withFortified: boolean) =>
      makeHeroCombatant('knight', 1, 'p0', {
        baseStats: { hp: 500, attack: 1, defense: 0, speed: 2, mind: 0, crit: 0, dodge: 0 },
        maxHp: 500,
        currentHp: 500,
        pickedPerks: [],
        equippedLegendaryIds: [],
        equippedLegendaryPassiveIds: withFortified ? ['fortified'] : [],
        abilities: ['knight_slash'],
        aiPriority: ['knight_slash'],
      });
    const makeEnemy = () =>
      makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
        baseStats: { hp: 9999, attack: 20, defense: 0, speed: 5, mind: 0, crit: 0, dodge: 0 },
        maxHp: 9999,
        currentHp: 9999,
      });

    const fortifiedResult = resolveCombat(
      makeTestState([makeKnight(true)], [makeEnemy()]),
      createRng(1),
    );
    const baselineResult = resolveCombat(
      makeTestState([makeKnight(false)], [makeEnemy()]),
      createRng(1),
    );

    const fortifiedHits = fortifiedResult.events.filter(
      (e) => e.kind === 'damage_applied' && e.targetId === 'p0',
    );
    const baselineHits = baselineResult.events.filter(
      (e) => e.kind === 'damage_applied' && e.targetId === 'p0',
    );
    expect(fortifiedHits.length).toBeGreaterThan(0);
    expect(baselineHits.length).toBeGreaterThan(0);

    const fortifiedFirst = fortifiedHits[0];
    const baselineFirst = baselineHits[0];
    if (fortifiedFirst.kind !== 'damage_applied' || baselineFirst.kind !== 'damage_applied') {
      throw new Error('expected damage_applied events');
    }
    // Fortified multiplier is 0.8; the first hit should be ~80% of the baseline.
    expect(fortifiedFirst.amount).toBeLessThan(baselineFirst.amount);
    expect(fortifiedFirst.amount).toBe(Math.max(1, Math.round(baselineFirst.amount * 0.8)));
  });
});

describe('Vital outfit (onStruck → applyStatus blessed self)', () => {
  it('applies Blessed (+5 HP/turn, 3 turns) to the hero when struck', () => {
    // Knight defender with Vital (outfit) equipped. When the enemy lands a hit
    // the passive should self-apply 'blessed' (regen, healPerTurn=5, duration=3).
    // Restrict the knight's abilities to knight_slash (no ability applies blessed)
    // and give the knight dodge=0 so the enemy hits reliably.
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 60, attack: 2, defense: 2, speed: 2, mind: 0, crit: 0, dodge: 0 },
      maxHp: 60,
      currentHp: 60,
      pickedPerks: [],
      equippedLegendaryIds: [],
      equippedLegendaryPassiveIds: ['vital'],
      abilities: ['knight_slash'],
      aiPriority: ['knight_slash'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 6, defense: 2, speed: 5, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Sanity: the knight took at least one hit.
    const hitsOnKnight = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.targetId === 'p0',
    );
    expect(hitsOnKnight.length).toBeGreaterThan(0);

    // status_applied event for blessed must originate from the knight (perk
    // self-target — sourceId is p0 because the perk-bearer fired the trigger).
    const blessedEvents = result.events.filter(
      (e) => e.kind === 'status_applied' && e.statusId === 'blessed' && e.sourceId === 'p0',
    );
    expect(blessedEvents.length).toBeGreaterThan(0);

    // Accept a live blessed status OR a status_expired event — the 3-turn
    // duration may have decayed if the combat ran long enough.
    const finalKnight = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalKnight).toBeDefined();
    const blessed = finalKnight!.statuses['blessed'];
    const expiredEvents = result.events.filter(
      (e) =>
        e.kind === 'status_expired' &&
        typeof e.statusId === 'string' &&
        e.statusId === 'blessed',
    );
    expect((blessed ? 1 : 0) + expiredEvents.length).toBeGreaterThan(0);

    // If still live, verify the shape: regen kind, healPerTurn 5, duration 3.
    if (blessed) {
      expect(blessed.effect.kind).toBe('regen');
      if (blessed.effect.kind === 'regen') {
        expect(blessed.effect.healPerTurn).toBe(5);
        expect(blessed.effect.duration).toBe(3);
      }
      expect(blessed.remainingTurns).toBeGreaterThan(0);
      expect(blessed.remainingTurns).toBeLessThanOrEqual(3);
    }
  });
});

describe('Cunning hat (onCrit → +15 Dodge for 2 turns)', () => {
  it('applies a +15 dodge stack on crit', () => {
    // Hero with Cunning (hat) equipped and crit=100 so every attack crits.
    // After the first crit the passive should create perk_stack_cunning_0
    // (timed non-stacking slot) with +15 dodge, duration 2. Restrict abilities
    // to knight_slash so every turn produces a damaging hit. Enemy has high HP
    // and low speed so the hero attacks first and survives multiple turns.
    const knight = makeHeroCombatant('knight', 1, 'p0', {
      baseStats: { hp: 100, attack: 5, defense: 2, speed: 9, mind: 0, crit: 100, dodge: 0 },
      maxHp: 100,
      currentHp: 100,
      pickedPerks: [],
      equippedLegendaryIds: [],
      equippedLegendaryPassiveIds: ['cunning'],
      abilities: ['knight_slash'],
      aiPriority: ['knight_slash'],
    });
    const enemy = makeEnemyCombatant('skeleton_warrior', 1, 'e0', {
      baseStats: { hp: 9999, attack: 1, defense: 0, speed: 1, mind: 0, crit: 0, dodge: 0 },
      maxHp: 9999,
      currentHp: 9999,
    });
    const state = makeTestState([knight], [enemy]);
    const result = resolveCombat(state, createRng(1));

    // Sanity: the knight landed at least one crit.
    const knightCrits = result.events.filter(
      (e) => e.kind === 'damage_applied' && e.sourceId === 'p0' && e.wasCrit,
    );
    expect(knightCrits.length).toBeGreaterThan(0);

    // Cunning is non-stacking (no stacking:true) → single slot perk_stack_cunning_0
    // overwritten on each crit. Accept either a live stack OR a status_expired event.
    const finalKnight = result.finalState.combatants.find((c) => c.id === 'p0');
    expect(finalKnight).toBeDefined();
    const liveStack = finalKnight!.statuses['perk_stack_cunning_0'];
    const expiredEvents = result.events.filter(
      (e) =>
        e.kind === 'status_expired' &&
        typeof e.statusId === 'string' &&
        e.statusId.startsWith('perk_stack_cunning_'),
    );
    expect((liveStack ? 1 : 0) + expiredEvents.length).toBeGreaterThan(0);

    // If still live, verify shape: +15 dodge, duration 2.
    if (liveStack) {
      expect(liveStack.effect.kind).toBe('buff');
      if (liveStack.effect.kind === 'buff') {
        expect(liveStack.effect.stat).toBe('dodge');
        expect(liveStack.effect.delta).toBe(15);
      }
      expect(liveStack.remainingTurns).toBeGreaterThan(0);
      expect(liveStack.remainingTurns).toBeLessThanOrEqual(2);
    }

    // Non-stacking: no perk_stack_cunning_1 / _2 / ... should exist.
    const extraSlots = Object.keys(finalKnight!.statuses).filter(
      (k) => k.startsWith('perk_stack_cunning_') && k !== 'perk_stack_cunning_0',
    );
    expect(extraSlots).toHaveLength(0);
  });
});

