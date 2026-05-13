import { describe, expect, it } from 'vitest';
import { LEGENDARY_DEFS, BOSS_LEGENDARIES } from '../legendaries';
import type { LegendaryId } from '../types';

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
