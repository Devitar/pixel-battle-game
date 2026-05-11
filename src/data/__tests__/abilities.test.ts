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
  'paladin_cleaving_smite',
  'paladin_quick_smite',
  // Hunter
  'hunter_shoot',
  'hunters_mark',
  'crippling_shot',
  'command_strike',
  // Pet kits
  'wolf_bite',
  'wolf_howl',
  'hawk_dive',
  'hawk_screech',
  'bear_maul',
  'bear_roar',
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
    expect(a.target.includeCaster).toBe(true);
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

describe('paladin_cleaving_smite (axe swap variant of smite)', () => {
  it('is a Mind-scaling AoE radiant strike on enemy slots 1-2 with cd 2', () => {
    const a = ABILITIES.paladin_cleaving_smite;
    expect(a.id).toBe('paladin_cleaving_smite');
    expect(a.canCastFrom).toEqual([1, 2]);
    expect(a.target.slots).toEqual([1, 2]);
    expect(a.cooldown).toBe(2);
    expect(a.tags).toContain('radiant');
    const dmg = a.effects.find((e) => e.kind === 'damage');
    if (dmg && dmg.kind === 'damage') {
      expect(dmg.power).toBeCloseTo(0.7);
      expect(dmg.scalingStat).toBe('mind');
    }
  });
});

describe('paladin_quick_smite (daggers swap variant of smite)', () => {
  it('is a Mind-scaling single-target radiant strike with bonus crit', () => {
    const a = ABILITIES.paladin_quick_smite;
    expect(a.id).toBe('paladin_quick_smite');
    expect(a.canCastFrom).toEqual([1, 2]);
    expect(a.target.slots).toEqual([1]);
    expect(a.cooldown).toBeUndefined();
    expect(a.tags).toContain('radiant');
    const dmg = a.effects.find((e) => e.kind === 'damage');
    if (dmg && dmg.kind === 'damage') {
      expect(dmg.power).toBeCloseTo(1.0);
      expect(dmg.scalingStat).toBe('mind');
      expect(dmg.bonusCrit).toBe(10);
    }
  });
});

describe('pet abilities', () => {
  it('wolf_bite is a melee single-target attack from any slot', () => {
    const a = ABILITIES.wolf_bite;
    expect(a.canCastFrom).toEqual([1, 2, 3, 4]);
    expect(a.target.slots).toEqual([1, 2]);
    expect(a.effects[0].kind).toBe('damage');
  });

  it('wolf_howl buffs allies (excluding caster) with blessed +1 attack', () => {
    const a = ABILITIES.wolf_howl;
    expect(a.cooldown).toBe(4);
    expect(a.target.side).toBe('ally');
    expect(a.target.slots).toBe('all');
    expect(a.target.includeCaster).toBe(false);
    const eff = a.effects[0] as Extract<AbilityEffect, { kind: 'buff' }>;
    expect(eff.statusId).toBe('blessed');
    expect(eff.stat).toBe('attack');
    expect(eff.delta).toBe(1);
  });

  it('hawk_dive targets back-row enemies with bonus crit', () => {
    const a = ABILITIES.hawk_dive;
    expect(a.target.slots).toEqual([3, 4]);
    const eff = a.effects[0] as Extract<AbilityEffect, { kind: 'damage' }>;
    expect(eff.bonusCrit).toBe(10);
  });

  it('hawk_screech is AoE enemy damage', () => {
    const a = ABILITIES.hawk_screech;
    expect(a.cooldown).toBe(4);
    expect(a.target.slots).toBe('all');
    expect(a.effects[0].kind).toBe('damage');
  });

  it('bear_maul targets slot-1 enemy from any slot', () => {
    const a = ABILITIES.bear_maul;
    expect(a.target.slots).toEqual([1]);
  });

  it('bear_roar is AoE damage with chance-stun', () => {
    const a = ABILITIES.bear_roar;
    expect(a.cooldown).toBe(4);
    expect(a.target.slots).toBe('all');
    expect(a.effects).toHaveLength(2);
    const stun = a.effects.find((e) => e.kind === 'stun') as Extract<AbilityEffect, { kind: 'stun' }>;
    expect(stun).toBeDefined();
    expect(stun.chance).toBe(0.2);
    expect(stun.duration).toBe(1);
  });
});

describe('hunter abilities', () => {
  it('hunter_shoot is a basic single-target ranged attack', () => {
    const a = ABILITIES.hunter_shoot;
    expect(a.canCastFrom).toEqual([1, 2, 3]);
    expect(a.target.side).toBe('enemy');
    expect(a.target.pick).toBe('first');
    expect(a.effects).toHaveLength(1);
    const eff = a.effects[0] as Extract<AbilityEffect, { kind: 'damage' }>;
    expect(eff.kind).toBe('damage');
    expect(eff.scalingStat).toBe('attack');
  });

  it('hunters_mark applies marked status with damageBonus', () => {
    const a = ABILITIES.hunters_mark;
    expect(a.cooldown).toBe(4);
    const filter = a.target.filter as Extract<TargetFilter, { kind: 'lacksStatus' }>;
    expect(filter.kind).toBe('lacksStatus');
    expect(filter.statusId).toBe('marked');
    const eff = a.effects[0] as Extract<AbilityEffect, { kind: 'mark' }>;
    expect(eff.kind).toBe('mark');
    expect(eff.statusId).toBe('marked');
    expect(eff.damageBonus).toBe(2);
    expect(eff.duration).toBe(3);
  });

  it('crippling_shot deals damage and applies slowed', () => {
    const a = ABILITIES.crippling_shot;
    expect(a.cooldown).toBe(3);
    expect(a.canCastFrom).toEqual([2, 3]);
    const damage = a.effects.find((e) => e.kind === 'damage');
    expect(damage).toBeDefined();
    const debuff = a.effects.find((e) => e.kind === 'debuff') as
      | Extract<AbilityEffect, { kind: 'debuff' }>
      | undefined;
    expect(debuff).toBeDefined();
    expect(debuff!.statusId).toBe('slowed');
    expect(debuff!.stat).toBe('speed');
    expect(debuff!.delta).toBe(-2);
  });

  it('command_strike has commandPet effect, petAlive aiCondition, self target', () => {
    const a = ABILITIES.command_strike;
    expect(a.cooldown).toBe(3);
    expect(a.target.side).toBe('self');
    expect(a.aiCondition).toEqual({ kind: 'petAlive' });
    expect(a.effects).toHaveLength(1);
    expect(a.effects[0].kind).toBe('commandPet');
  });
});
