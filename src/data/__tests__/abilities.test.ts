import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../abilities';
import type { AbilityEffect, AbilityId, StatusId, TargetFilter } from '../types';

const EXPECTED_IDS: readonly AbilityId[] = [
  'knight_slash',
  'shield_bash',
  'bulwark',
  'taunt',
  'archer_shoot',
  'piercing_shot',
  'volley',
  'flare_arrow',
  'priest_strike',
  'mend',
  'smite',
  'bless',
  'bone_slash',
  'bone_throw',
  'bone_arrow',
  'rotting_bite',
  'lurch',
  'wail',
  'dark_bolt',
  'dark_pact',
  'necrotic_wave',
  'lich_strike',
  'curse_of_frailty',
  'chilling_touch',
  'barbarian_swing',
  'cleave',
  'rampage',
  'bloodthirst',
  'rogue_strike',
  'backstab',
  'vanish',
  'poison_strike',
  'mage_zap',
  'firebolt',
  'frost_nova',
  'arc_shock',
  'knight_cleaving_swing',
  'knight_quick_slash',
  'barbarian_whirl_strike',
  'barbarian_frenzy',
  'rogue_riposte',
  'rogue_brutal_chop',
  'priest_arcane_bolt',
  'mage_holy_light',
  // Sunken Keep
  'drowning_embrace',
  'tidal_smash',
  'crushing_wave',
  'drowning_lure',
  // Paladin
  'paladin_strike',
  'lay_on_hands',
  'consecrate',
];

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function producedStatusIds(effects: readonly AbilityEffect[]): readonly StatusId[] {
  const out: StatusId[] = [];
  for (const e of effects) {
    if (e.kind === 'buff' || e.kind === 'debuff' || e.kind === 'mark' || e.kind === 'taunt') {
      out.push(e.statusId);
    }
  }
  return out;
}

function filterStatusId(filter: TargetFilter | undefined): StatusId | undefined {
  if (!filter) return undefined;
  if (filter.kind === 'hasStatus' || filter.kind === 'lacksStatus') return filter.statusId;
  return undefined;
}

describe('ABILITIES', () => {
  it('registers every expected ability id', () => {
    for (const id of EXPECTED_IDS) {
      expect(ABILITIES[id], `missing ability ${id}`).toBeDefined();
    }
  });

  it('has no stray entries', () => {
    const actual = Object.keys(ABILITIES).sort();
    const expected = [...EXPECTED_IDS].sort();
    expect(actual).toEqual(expected);
  });

  describe.each(EXPECTED_IDS)('ability %s', (id) => {
    it('has matching id field', () => {
      expect(ABILITIES[id].id).toBe(id);
    });

    it('has a non-empty canCastFrom of valid slots', () => {
      const slots = ABILITIES[id].canCastFrom;
      expect(slots.length).toBeGreaterThan(0);
      for (const s of slots) expect([1, 2, 3, 4]).toContain(s);
    });

    it('has at least one effect', () => {
      expect(ABILITIES[id].effects.length).toBeGreaterThan(0);
    });

    it('has valid target slots if array', () => {
      const slots = ABILITIES[id].target.slots;
      if (Array.isArray(slots)) {
        for (const s of slots) expect([1, 2, 3, 4]).toContain(s);
      }
    });

    it('produces only kebab-case statusIds', () => {
      for (const sid of producedStatusIds(ABILITIES[id].effects)) {
        expect(sid, `bad statusId on ${id}: ${sid}`).toMatch(KEBAB_CASE);
      }
    });

    it('round-trips statusId between filter and effect', () => {
      const filterId = filterStatusId(ABILITIES[id].target.filter);
      const produced = producedStatusIds(ABILITIES[id].effects);
      if (filterId && produced.length > 0) {
        expect(
          produced.includes(filterId),
          `ability ${id} filters on '${filterId}' but does not produce it`,
        ).toBe(true);
      }
    });
  });
});

describe('requiresShield flag', () => {
  it('shield_bash requires a shield', () => {
    expect(ABILITIES.shield_bash.requiresShield).toBe(true);
  });

  it('no other ability has requiresShield set', () => {
    for (const id of EXPECTED_IDS) {
      if (id === 'shield_bash') continue;
      expect(
        ABILITIES[id].requiresShield ?? false,
        `${id}.requiresShield should not be set`,
      ).toBe(false);
    }
  });
});

describe('drowning_embrace', () => {
  it('is registered with the expected effect shape (pull + drowning poison)', () => {
    const a = ABILITIES.drowning_embrace;
    expect(a.id).toBe('drowning_embrace');
    expect(a.canCastFrom).toContain(1);
    expect(a.cooldown).toBe(3);
    const pull = a.effects.find(e => e.kind === 'pull');
    expect(pull).toBeDefined();
    const poison = a.effects.find(e => e.kind === 'poison');
    expect(poison).toBeDefined();
    if (poison && poison.kind === 'poison') {
      expect(poison.statusId).toBe('drowning');
      expect(poison.damagePerTurn).toBeGreaterThan(0);
    }
  });
});

describe('drowning_lure', () => {
  it('is registered with poison effect that applies the drowning status', () => {
    const a = ABILITIES.drowning_lure;
    expect(a.id).toBe('drowning_lure');
    expect(a.cooldown).toBe(2);
    const poison = a.effects.find(e => e.kind === 'poison');
    expect(poison).toBeDefined();
    if (poison && poison.kind === 'poison') {
      expect(poison.statusId).toBe('drowning');
    }
  });

  it('targets lowest-hp enemy (the wounded hero)', () => {
    const a = ABILITIES.drowning_lure;
    expect(a.target.pick).toBe('lowestHp');
  });
});

describe('tidal_smash and crushing_wave', () => {
  it('tidal_smash is single-target high-damage', () => {
    const a = ABILITIES.tidal_smash;
    expect(a.id).toBe('tidal_smash');
    expect(a.target.slots).toEqual([1]);
    const dmg = a.effects.find(e => e.kind === 'damage');
    if (dmg && dmg.kind === 'damage') {
      expect(dmg.power).toBeCloseTo(1.4);
    }
  });

  it('crushing_wave is AoE with cooldown 3', () => {
    const a = ABILITIES.crushing_wave;
    expect(a.id).toBe('crushing_wave');
    expect(a.target.slots).toBe('all');
    expect(a.cooldown).toBe(3);
    const dmg = a.effects.find(e => e.kind === 'damage');
    if (dmg && dmg.kind === 'damage') {
      expect(dmg.power).toBeCloseTo(0.6);
    }
  });
});

describe('smite (shared by Priest and Paladin)', () => {
  it('canCastFrom includes slot 1 (Paladin frontline can cast)', () => {
    expect(ABILITIES.smite.canCastFrom).toContain(1);
    expect(ABILITIES.smite.canCastFrom).toContain(2);
    expect(ABILITIES.smite.canCastFrom).toContain(3);
  });
});

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
