import { describe, expect, it } from 'vitest';
import { applyPerkAction, clearPerkAura, STACK_CAP } from '../perk_hooks';
import type { Combatant, CombatEvent } from '../types';
import type { PerkAction, PerkId } from '@data/types';

function makeCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'p0',
    side: 'player',
    slot: 1,
    kind: 'hero',
    classId: 'knight',
    baseStats: { hp: 30, attack: 5, defense: 2, speed: 5, mind: 1, crit: 5, dodge: 5 },
    currentHp: 30,
    maxHp: 30,
    statuses: {},
    cooldowns: {},
    abilities: [],
    aiPriority: [],
    pickedPerks: [],
    isDead: false,
    ...overrides,
  } as Combatant;
}

describe('applyPerkAction', () => {
  const perkId: PerkId = 'iron_will';

  describe('gainStat untimed (continuous aura)', () => {
    it('adds a synthetic status that grants stat delta', () => {
      const self = makeCombatant();
      const action: PerkAction = { kind: 'gainStat', stat: 'defense', delta: 4 };
      const events: CombatEvent[] = [];
      applyPerkAction({ self, other: undefined, perkId, action, events });
      const statusKey = `perk_aura_${perkId}`;
      expect(self.statuses[statusKey]).toBeDefined();
      expect(self.statuses[statusKey].effect).toMatchObject({
        kind: 'buff',
        stat: 'defense',
        delta: 4,
      });
    });

    it('clearPerkAura removes the aura status', () => {
      const self = makeCombatant();
      const action: PerkAction = { kind: 'gainStat', stat: 'defense', delta: 4 };
      const events: CombatEvent[] = [];
      applyPerkAction({ self, other: undefined, perkId, action, events });
      clearPerkAura(self, perkId);
      expect(self.statuses[`perk_aura_${perkId}`]).toBeUndefined();
    });

    it('clearPerkAura is a no-op when no aura exists', () => {
      const self = makeCombatant();
      expect(() => clearPerkAura(self, perkId)).not.toThrow();
    });
  });

  describe('gainStat timed (snowball stack)', () => {
    it('adds a stack with its own duration', () => {
      const self = makeCombatant();
      const action: PerkAction = {
        kind: 'gainStat',
        stat: 'attack',
        delta: 2,
        duration: 3,
        stacking: true,
      };
      applyPerkAction({ self, other: undefined, perkId, action, events: [] });
      const stackKeys = Object.keys(self.statuses).filter((k) =>
        k.startsWith(`perk_stack_${perkId}`),
      );
      expect(stackKeys).toHaveLength(1);
      expect(self.statuses[stackKeys[0]].effect).toMatchObject({
        kind: 'buff',
        stat: 'attack',
        delta: 2,
      });
      expect(self.statuses[stackKeys[0]].remainingTurns).toBe(3);
    });

    it('a second trigger adds a second stack', () => {
      const self = makeCombatant();
      const action: PerkAction = {
        kind: 'gainStat',
        stat: 'attack',
        delta: 2,
        duration: 3,
        stacking: true,
      };
      applyPerkAction({ self, other: undefined, perkId, action, events: [] });
      applyPerkAction({ self, other: undefined, perkId, action, events: [] });
      const stackKeys = Object.keys(self.statuses).filter((k) =>
        k.startsWith(`perk_stack_${perkId}`),
      );
      expect(stackKeys).toHaveLength(2);
    });

    it('at STACK_CAP, further triggers refresh all existing stack durations', () => {
      const self = makeCombatant();
      const action: PerkAction = {
        kind: 'gainStat',
        stat: 'attack',
        delta: 2,
        duration: 3,
        stacking: true,
      };
      // Fill up to STACK_CAP.
      for (let i = 0; i < STACK_CAP; i++) {
        applyPerkAction({ self, other: undefined, perkId, action, events: [] });
      }
      // Decrement a few to simulate a turn passing.
      for (let i = 0; i < STACK_CAP; i++) {
        self.statuses[`perk_stack_${perkId}_${i}`].remainingTurns = 1;
      }
      // Next trigger should refresh all to full duration, not add a new one.
      applyPerkAction({ self, other: undefined, perkId, action, events: [] });
      const stackKeys = Object.keys(self.statuses).filter((k) =>
        k.startsWith(`perk_stack_${perkId}`),
      );
      expect(stackKeys).toHaveLength(STACK_CAP);
      for (const k of stackKeys) {
        expect(self.statuses[k].remainingTurns).toBe(3);
      }
    });
  });

  describe('stack cap edge cases', () => {
    const stackingAction: PerkAction = {
      kind: 'gainStat',
      stat: 'attack',
      delta: 2,
      duration: 3,
      stacking: true,
    };

    it('refresh-all at cap restores an individually decayed stack', () => {
      const self = makeCombatant();
      // Fill to cap.
      for (let i = 0; i < STACK_CAP; i++) {
        applyPerkAction({ self, other: undefined, perkId, action: stackingAction, events: [] });
      }
      // Decay only slot 0 (simulating a turn passing for the oldest stack).
      self.statuses[`perk_stack_${perkId}_0`].remainingTurns = 1;
      // Sanity: other slots still at full.
      for (let i = 1; i < STACK_CAP; i++) {
        expect(self.statuses[`perk_stack_${perkId}_${i}`].remainingTurns).toBe(3);
      }
      // Trigger again — at cap, so all slots refresh to full.
      applyPerkAction({ self, other: undefined, perkId, action: stackingAction, events: [] });
      for (let i = 0; i < STACK_CAP; i++) {
        expect(self.statuses[`perk_stack_${perkId}_${i}`].remainingTurns).toBe(3);
      }
      // No 6th slot created.
      expect(self.statuses[`perk_stack_${perkId}_5`]).toBeUndefined();
    });

    it('below cap, a new trigger adds a stack into the first empty slot rather than refreshing', () => {
      const self = makeCombatant();
      // Fill 3 stacks (slots 0, 1, 2).
      for (let i = 0; i < 3; i++) {
        applyPerkAction({ self, other: undefined, perkId, action: stackingAction, events: [] });
      }
      // Decay slot 0 independently.
      self.statuses[`perk_stack_${perkId}_0`].remainingTurns = 1;
      // Trigger — should add slot 3 (first empty), NOT refresh slot 0.
      applyPerkAction({ self, other: undefined, perkId, action: stackingAction, events: [] });
      expect(self.statuses[`perk_stack_${perkId}_0`].remainingTurns).toBe(1); // unchanged
      expect(self.statuses[`perk_stack_${perkId}_1`].remainingTurns).toBe(3);
      expect(self.statuses[`perk_stack_${perkId}_2`].remainingTurns).toBe(3);
      expect(self.statuses[`perk_stack_${perkId}_3`].remainingTurns).toBe(3); // new
      expect(self.statuses[`perk_stack_${perkId}_4`]).toBeUndefined();
    });

    it('new stacks fill the lowest empty slot index (slot reuse after gap)', () => {
      const self = makeCombatant();
      // Fill 3 stacks.
      for (let i = 0; i < 3; i++) {
        applyPerkAction({ self, other: undefined, perkId, action: stackingAction, events: [] });
      }
      // Manually clear slot 1, leaving a gap (slots 0 and 2 occupied).
      delete self.statuses[`perk_stack_${perkId}_1`];
      // Next trigger should refill slot 1 (the lowest empty), not slot 3.
      applyPerkAction({ self, other: undefined, perkId, action: stackingAction, events: [] });
      expect(self.statuses[`perk_stack_${perkId}_1`]).toBeDefined();
      expect(self.statuses[`perk_stack_${perkId}_1`].remainingTurns).toBe(3);
      expect(self.statuses[`perk_stack_${perkId}_3`]).toBeUndefined();
    });

    it('without further triggers, each stack carries an independent remainingTurns', () => {
      const self = makeCombatant();
      // Add three stacks back-to-back; they all start with the same duration but
      // are stored in independent slots, so callers can decay them independently.
      for (let i = 0; i < 3; i++) {
        applyPerkAction({ self, other: undefined, perkId, action: stackingAction, events: [] });
      }
      // Mutate slot 0 only.
      self.statuses[`perk_stack_${perkId}_0`].remainingTurns = 0;
      expect(self.statuses[`perk_stack_${perkId}_1`].remainingTurns).toBe(3);
      expect(self.statuses[`perk_stack_${perkId}_2`].remainingTurns).toBe(3);
    });
  });

  describe('gainStat timed non-stacking', () => {
    it('replaces any existing instance instead of stacking', () => {
      const self = makeCombatant();
      const action: PerkAction = {
        kind: 'gainStat',
        stat: 'attack',
        delta: 2,
        duration: 3,
      };
      applyPerkAction({ self, other: undefined, perkId, action, events: [] });
      applyPerkAction({ self, other: undefined, perkId, action, events: [] });
      const stackKeys = Object.keys(self.statuses).filter((k) =>
        k.startsWith(`perk_stack_${perkId}`),
      );
      expect(stackKeys).toHaveLength(1);
    });
  });

  describe('applyStatus to other', () => {
    it('applies status to the trigger target', () => {
      const self = makeCombatant();
      const other = makeCombatant({ id: 'p1' });
      const action: PerkAction = {
        kind: 'applyStatus',
        statusId: 'marked',
        duration: 3,
        target: 'other',
      };
      applyPerkAction({ self, other, perkId, action, events: [] });
      expect(other.statuses['marked']).toBeDefined();
      expect(other.statuses['marked'].remainingTurns).toBe(3);
    });

    it('emits a status_applied event', () => {
      const self = makeCombatant();
      const other = makeCombatant({ id: 'p1' });
      const action: PerkAction = {
        kind: 'applyStatus',
        statusId: 'marked',
        duration: 3,
        target: 'other',
      };
      const events: CombatEvent[] = [];
      applyPerkAction({ self, other, perkId, action, events });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: 'status_applied',
        sourceId: 'p0',
        targetId: 'p1',
        statusId: 'marked',
        duration: 3,
      });
    });

    it('uses payload.damageBonus when provided for mark', () => {
      const self = makeCombatant();
      const other = makeCombatant({ id: 'p1' });
      const action: PerkAction = {
        kind: 'applyStatus',
        statusId: 'marked',
        duration: 3,
        target: 'other',
        payload: { damageBonus: 0.25 },
      };
      applyPerkAction({ self, other, perkId, action, events: [] });
      const mark = other.statuses['marked'];
      expect(mark.effect.kind).toBe('mark');
      if (mark.effect.kind === 'mark') {
        expect(mark.effect.damageBonus).toBe(0.25);
      }
    });

    it('does nothing when target is "other" but other is undefined', () => {
      const self = makeCombatant();
      const action: PerkAction = {
        kind: 'applyStatus',
        statusId: 'marked',
        duration: 3,
        target: 'other',
      };
      const events: CombatEvent[] = [];
      applyPerkAction({ self, other: undefined, perkId, action, events });
      expect(self.statuses['marked']).toBeUndefined();
      expect(events).toHaveLength(0);
    });
  });

  describe('applyStatus to self', () => {
    it('applies status to the perk-bearer', () => {
      const self = makeCombatant();
      const other = makeCombatant({ id: 'p1' });
      const action: PerkAction = {
        kind: 'applyStatus',
        statusId: 'blessed',
        duration: 3,
        target: 'self',
      };
      applyPerkAction({ self, other, perkId, action, events: [] });
      expect(self.statuses['blessed']).toBeDefined();
    });
  });

});
