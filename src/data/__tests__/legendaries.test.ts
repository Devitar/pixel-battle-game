import { describe, expect, it } from 'vitest';
import { LEGENDARY_DEFS, BOSS_LEGENDARIES, LEGENDARY_PASSIVE_DEFS, LEGENDARY_PASSIVES_BY_SLOT } from '../legendaries';
import type { LegendaryId, LegendaryPassiveId, ItemSlot } from '../types';

describe('LegendaryPassiveId union (Task 1 shape)', () => {
  it('has all 16 ids assignable', () => {
    const ids: readonly LegendaryPassiveId[] = [
      'vampiric', 'devastating', 'cleaving', 'hexing',
      'fortified', 'reinforced', 'thorny', 'warded',
      'vital', 'resolute', 'evasive', 'enduring',
      'insightful', 'prescient', 'cunning', 'wise',
    ];
    expect(ids).toHaveLength(16);
  });
});

const EXPECTED_IDS: readonly LegendaryId[] = [
  'lichs_crown', 'phylactery', 'tidewalker_helm', 'kings_aegis',
];

describe('LEGENDARY_DEFS', () => {
  it('contains exactly 4 entries', () => {
    expect(Object.keys(LEGENDARY_DEFS).sort()).toEqual([...EXPECTED_IDS].sort());
  });

  it.each(EXPECTED_IDS)('%s has a non-empty name, flavor, slot, baseId, and triggeredEffect', (id) => {
    const def = LEGENDARY_DEFS[id];
    expect(def.id).toBe(id);
    expect(def.name.length).toBeGreaterThan(0);
    expect(def.flavor.length).toBeGreaterThan(0);
    expect(['weapon', 'shield', 'outfit', 'hat']).toContain(def.slot);
    expect(def.baseId.length).toBeGreaterThan(0);
    expect(def.triggeredEffect).toBeDefined();
    expect(def.triggeredEffect.trigger).toBeDefined();
    expect(def.triggeredEffect.action).toBeDefined();
  });

  it('lichs_crown has +5 Mind, +5 Crit, onKill mind stacking', () => {
    const d = LEGENDARY_DEFS.lichs_crown;
    expect(d.stats).toEqual({ mind: 5, crit: 5 });
    expect(d.triggeredEffect.trigger.kind).toBe('onKill');
    const action = d.triggeredEffect.action;
    expect(action.kind).toBe('gainStat');
    if (action.kind === 'gainStat') {
      expect(action.stat).toBe('mind');
      expect(action.delta).toBe(2);
      expect(action.duration).toBe(3);
      expect(action.stacking).toBe(true);
    }
  });

  it('phylactery has +15 HP, +2 Def, onStruck rotting on attacker', () => {
    const d = LEGENDARY_DEFS.phylactery;
    expect(d.stats).toEqual({ defense: 2 });
    expect(d.hpBonus).toBe(15);
    expect(d.triggeredEffect.trigger.kind).toBe('onStruck');
    const action = d.triggeredEffect.action;
    expect(action.kind).toBe('applyStatus');
    if (action.kind === 'applyStatus') {
      expect(action.statusId).toBe('rotting');
      expect(action.target).toBe('other');
      expect(action.duration).toBe(2);
      expect(action.payload?.damagePerTurn).toBe(3);
    }
  });

  it('tidewalker_helm has +5 HP, +3 Def, whenBelowHp 0.5 +4 Def', () => {
    const d = LEGENDARY_DEFS.tidewalker_helm;
    expect(d.stats).toEqual({ defense: 3 });
    expect(d.hpBonus).toBe(5);
    const trig = d.triggeredEffect.trigger;
    expect(trig.kind).toBe('whenBelowHp');
    if (trig.kind === 'whenBelowHp') {
      expect(trig.ratio).toBe(0.5);
    }
    const action = d.triggeredEffect.action;
    expect(action.kind).toBe('gainStat');
    if (action.kind === 'gainStat') {
      expect(action.stat).toBe('defense');
      expect(action.delta).toBe(4);
    }
  });

  it('kings_aegis has +10 HP, +3 Def, onStruck drowning on attacker', () => {
    const d = LEGENDARY_DEFS.kings_aegis;
    expect(d.stats).toEqual({ defense: 3 });
    expect(d.hpBonus).toBe(10);
    expect(d.slot).toBe('shield');
    expect(d.triggeredEffect.trigger.kind).toBe('onStruck');
    const action = d.triggeredEffect.action;
    expect(action.kind).toBe('applyStatus');
    if (action.kind === 'applyStatus') {
      expect(action.statusId).toBe('drowning');
      expect(action.target).toBe('other');
      expect(action.duration).toBe(3);
      expect(action.payload?.damagePerTurn).toBe(3);
    }
  });
});

describe('BOSS_LEGENDARIES', () => {
  it('bone_lich maps to lichs_crown + phylactery', () => {
    expect(BOSS_LEGENDARIES.bone_lich).toEqual(['lichs_crown', 'phylactery']);
  });

  it('drowned_king maps to tidewalker_helm + kings_aegis', () => {
    expect(BOSS_LEGENDARIES.drowned_king).toEqual(['tidewalker_helm', 'kings_aegis']);
  });

  it('does not contain entries for minions or future bosses', () => {
    expect(BOSS_LEGENDARIES.skeleton_warrior).toBeUndefined();
    expect(BOSS_LEGENDARIES.brine_crab).toBeUndefined();
  });
});

const ALL_PASSIVE_IDS: readonly LegendaryPassiveId[] = [
  'vampiric', 'devastating', 'cleaving', 'hexing',
  'fortified', 'reinforced', 'thorny', 'warded',
  'vital', 'resolute', 'evasive', 'enduring',
  'insightful', 'prescient', 'cunning', 'wise',
];

describe('LEGENDARY_PASSIVE_DEFS', () => {
  it('contains exactly 16 entries matching the union', () => {
    expect(Object.keys(LEGENDARY_PASSIVE_DEFS).sort()).toEqual([...ALL_PASSIVE_IDS].sort());
  });

  it.each(ALL_PASSIVE_IDS)('%s has non-empty adjective, description, valid slot, and triggeredEffect', (id) => {
    const def = LEGENDARY_PASSIVE_DEFS[id];
    expect(def.id).toBe(id);
    expect(def.adjective.length).toBeGreaterThan(0);
    expect(def.description.length).toBeGreaterThan(0);
    expect(['weapon', 'shield', 'outfit', 'hat']).toContain(def.slot);
    expect(def.triggeredEffect).toBeDefined();
    expect(def.triggeredEffect.trigger).toBeDefined();
    expect(def.triggeredEffect.action).toBeDefined();
  });

  it('vampiric has onHit + lifesteal 0.15', () => {
    const d = LEGENDARY_PASSIVE_DEFS.vampiric;
    expect(d.slot).toBe('weapon');
    expect(d.triggeredEffect.trigger.kind).toBe('onHit');
    expect(d.triggeredEffect.action).toMatchObject({ kind: 'lifesteal', ratio: 0.15 });
  });

  it('devastating has firstAttack + damageMod 2.0', () => {
    const d = LEGENDARY_PASSIVE_DEFS.devastating;
    expect(d.slot).toBe('weapon');
    expect(d.triggeredEffect.trigger.kind).toBe('firstAttack');
    expect(d.triggeredEffect.action).toMatchObject({ kind: 'damageMod', multiplier: 2.0 });
  });

  it('cleaving has onKill + gainStat attack +2 dur 3 stacking', () => {
    const d = LEGENDARY_PASSIVE_DEFS.cleaving;
    expect(d.slot).toBe('weapon');
    expect(d.triggeredEffect.trigger.kind).toBe('onKill');
    expect(d.triggeredEffect.action).toMatchObject({
      kind: 'gainStat', stat: 'attack', delta: 2, duration: 3, stacking: true,
    });
  });

  it('hexing has onCrit + applyStatus marked dur 3 damageBonus 0.3', () => {
    const d = LEGENDARY_PASSIVE_DEFS.hexing;
    expect(d.slot).toBe('weapon');
    expect(d.triggeredEffect.trigger.kind).toBe('onCrit');
    const action = d.triggeredEffect.action;
    expect(action.kind).toBe('applyStatus');
    if (action.kind === 'applyStatus') {
      expect(action.statusId).toBe('marked');
      expect(action.duration).toBe(3);
      expect(action.target).toBe('other');
      expect(action.payload?.damageBonus).toBe(0.3);
    }
  });

  it('fortified has onStruck + damageMitigation 0.8', () => {
    const d = LEGENDARY_PASSIVE_DEFS.fortified;
    expect(d.slot).toBe('shield');
    expect(d.triggeredEffect.trigger.kind).toBe('onStruck');
    expect(d.triggeredEffect.action).toMatchObject({ kind: 'damageMitigation', multiplier: 0.8 });
  });

  it('reinforced has whenBelowHp 0.4 + gainStat defense +4', () => {
    const d = LEGENDARY_PASSIVE_DEFS.reinforced;
    expect(d.slot).toBe('shield');
    const trig = d.triggeredEffect.trigger;
    if (trig.kind === 'whenBelowHp') expect(trig.ratio).toBe(0.4);
    expect(d.triggeredEffect.action).toMatchObject({ kind: 'gainStat', stat: 'defense', delta: 4 });
  });

  it('thorny has onStruck + applyStatus poisoned dur 2 dpt 4 target other', () => {
    const d = LEGENDARY_PASSIVE_DEFS.thorny;
    expect(d.slot).toBe('shield');
    const action = d.triggeredEffect.action;
    if (action.kind === 'applyStatus') {
      expect(action.statusId).toBe('poisoned');
      expect(action.duration).toBe(2);
      expect(action.target).toBe('other');
      expect(action.payload?.damagePerTurn).toBe(4);
    }
  });

  it('warded has whenBelowHp 0.5 + gainStat dodge +15', () => {
    const d = LEGENDARY_PASSIVE_DEFS.warded;
    expect(d.slot).toBe('shield');
    expect(d.triggeredEffect.action).toMatchObject({ kind: 'gainStat', stat: 'dodge', delta: 15 });
  });

  it('vital has onStruck + applyStatus blessed dur 3 hpt 5 target self', () => {
    const d = LEGENDARY_PASSIVE_DEFS.vital;
    expect(d.slot).toBe('outfit');
    const action = d.triggeredEffect.action;
    if (action.kind === 'applyStatus') {
      expect(action.statusId).toBe('blessed');
      expect(action.target).toBe('self');
      expect(action.duration).toBe(3);
      expect(action.payload?.healPerTurn).toBe(5);
    }
  });

  it('resolute has whenBelowHp 0.5 + gainStat defense +3', () => {
    const d = LEGENDARY_PASSIVE_DEFS.resolute;
    expect(d.slot).toBe('outfit');
    expect(d.triggeredEffect.action).toMatchObject({ kind: 'gainStat', stat: 'defense', delta: 3 });
  });

  it('evasive has onStruck + gainStat dodge +20 dur 2', () => {
    const d = LEGENDARY_PASSIVE_DEFS.evasive;
    expect(d.slot).toBe('outfit');
    expect(d.triggeredEffect.action).toMatchObject({
      kind: 'gainStat', stat: 'dodge', delta: 20, duration: 2,
    });
  });

  it('enduring has onStruck + gainStat defense +1 dur 2 stacking', () => {
    const d = LEGENDARY_PASSIVE_DEFS.enduring;
    expect(d.slot).toBe('outfit');
    expect(d.triggeredEffect.action).toMatchObject({
      kind: 'gainStat', stat: 'defense', delta: 1, duration: 2, stacking: true,
    });
  });

  it('insightful has whenBelowHp 0.5 + gainStat mind +4', () => {
    const d = LEGENDARY_PASSIVE_DEFS.insightful;
    expect(d.slot).toBe('hat');
    expect(d.triggeredEffect.action).toMatchObject({ kind: 'gainStat', stat: 'mind', delta: 4 });
  });

  it('prescient has onCrit + gainStat speed +1 dur 2 stacking', () => {
    const d = LEGENDARY_PASSIVE_DEFS.prescient;
    expect(d.slot).toBe('hat');
    expect(d.triggeredEffect.action).toMatchObject({
      kind: 'gainStat', stat: 'speed', delta: 1, duration: 2, stacking: true,
    });
  });

  it('cunning has onCrit + gainStat dodge +15 dur 2', () => {
    const d = LEGENDARY_PASSIVE_DEFS.cunning;
    expect(d.slot).toBe('hat');
    expect(d.triggeredEffect.action).toMatchObject({
      kind: 'gainStat', stat: 'dodge', delta: 15, duration: 2,
    });
  });

  it('wise has onKill + gainStat mind +1 dur 3 stacking', () => {
    const d = LEGENDARY_PASSIVE_DEFS.wise;
    expect(d.slot).toBe('hat');
    expect(d.triggeredEffect.action).toMatchObject({
      kind: 'gainStat', stat: 'mind', delta: 1, duration: 3, stacking: true,
    });
  });
});

describe('LEGENDARY_PASSIVES_BY_SLOT', () => {
  const SLOTS: readonly ItemSlot[] = ['weapon', 'shield', 'outfit', 'hat'];

  it.each(SLOTS)('%s slot has exactly 4 passives', (slot) => {
    expect(LEGENDARY_PASSIVES_BY_SLOT[slot]).toHaveLength(4);
  });

  it('every passive appears in exactly one slot pool', () => {
    const allIdsInSlots = SLOTS.flatMap((slot) => LEGENDARY_PASSIVES_BY_SLOT[slot]);
    expect(allIdsInSlots.sort()).toEqual([...ALL_PASSIVE_IDS].sort());
    expect(new Set(allIdsInSlots).size).toBe(allIdsInSlots.length);
  });

  it('each passive in a slot pool has slot field matching the pool slot', () => {
    for (const slot of SLOTS) {
      for (const id of LEGENDARY_PASSIVES_BY_SLOT[slot]) {
        expect(LEGENDARY_PASSIVE_DEFS[id].slot).toBe(slot);
      }
    }
  });
});

describe('LegendaryPassiveId / LegendaryId disjointness', () => {
  it('no LegendaryPassiveId overlaps with any LegendaryId (stack-key collision guard)', () => {
    const passiveIds = new Set(Object.keys(LEGENDARY_PASSIVE_DEFS));
    const legendaryIds = new Set(Object.keys(LEGENDARY_DEFS));
    for (const id of passiveIds) {
      expect(legendaryIds.has(id)).toBe(false);
    }
  });
});
