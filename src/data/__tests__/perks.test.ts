import { describe, expect, it } from 'vitest';
import { CLASSES } from '../classes';
import { CLASS_PERK_TIERS, PERKS } from '../perks';
import type { ClassId, PerkId } from '../types';

const L5_PERK_IDS: readonly PerkId[] = [
  'iron_will', 'resolute',
  'precise', 'eagle_eye',
  'devout', 'steadfast',
  'berserker', 'tough_skin',
  'lethal', 'evasive',
  'arcane_power', 'quick_cast',
  // Paladin
  'righteous', 'vindicator',
  // Hunter
  'beastmaster', 'sharpshooter',
];

const L10_PERK_IDS: readonly PerkId[] = [
  'unbreakable', 'last_stand',
  'eagles_mark', 'first_strike',
  'sanctity', 'holy_vigor',
  'rampage', 'bloodlust',
  'backstab', 'phantom',
  'spellweaver', 'arcane_surge',
  'crusader', 'aegis',
  'pack_tactics', 'killer_instinct',
];

const EXPECTED_IDS: readonly PerkId[] = [...L5_PERK_IDS, ...L10_PERK_IDS];

describe('PERKS map', () => {
  it('registers every expected perk id', () => {
    for (const id of EXPECTED_IDS) {
      expect(PERKS[id], `missing perk ${id}`).toBeDefined();
    }
  });

  it('has no stray entries', () => {
    expect(Object.keys(PERKS).sort()).toEqual([...EXPECTED_IDS].sort());
  });

  describe.each(EXPECTED_IDS)('perk %s', (id) => {
    it('id field matches map key', () => {
      expect(PERKS[id].id).toBe(id);
    });
    it('name and description are non-empty', () => {
      expect(PERKS[id].name.length).toBeGreaterThan(0);
      expect(PERKS[id].description.length).toBeGreaterThan(0);
    });
    it('classId is a valid ClassId', () => {
      expect(Object.keys(CLASSES)).toContain(PERKS[id].classId);
    });
    it('has at least one effect (statEffects, hpEffect, petAttackBonus, or triggeredEffect)', () => {
      const p = PERKS[id];
      const hasStat = p.statEffects !== undefined && p.statEffects.length > 0;
      const hasHp = p.hpEffect !== undefined;
      const hasPetAttack = p.petAttackBonus !== undefined;
      const hasTriggered = p.triggeredEffect !== undefined;
      expect(hasStat || hasHp || hasPetAttack || hasTriggered).toBe(true);
    });
  });

  describe.each(L5_PERK_IDS)('L5 perk %s', (id) => {
    it('has tier field set to l5', () => {
      expect(PERKS[id].tier).toBe('l5');
    });
  });

  describe('L10 perks have triggeredEffect', () => {
    it.each(L10_PERK_IDS)('%s has tier l10 and triggeredEffect', (id) => {
      expect(PERKS[id].tier).toBe('l10');
      expect(PERKS[id].triggeredEffect).toBeDefined();
    });
  });
});

describe('CLASS_PERK_TIERS', () => {
  const expectedClasses: ClassId[] =
    ['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage', 'paladin', 'hunter'];

  it('has exactly 8 entries (one per ClassId)', () => {
    expect(Object.keys(CLASS_PERK_TIERS).sort()).toEqual([...expectedClasses].sort());
  });

  describe.each(expectedClasses)('class %s', (classId) => {
    it('has an l5 pair (length 2)', () => {
      expect(CLASS_PERK_TIERS[classId].l5).toHaveLength(2);
    });
    it('has an l10 pair (length 2)', () => {
      expect(CLASS_PERK_TIERS[classId].l10).toHaveLength(2);
    });
    it('all l5 perk ids reference real perks with classId match', () => {
      for (const perkId of CLASS_PERK_TIERS[classId].l5) {
        expect(PERKS[perkId]).toBeDefined();
        expect(PERKS[perkId].classId).toBe(classId);
        expect(PERKS[perkId].tier).toBe('l5');
      }
    });
    it('all l10 perk ids reference real perks with classId match and l10 tier', () => {
      for (const perkId of CLASS_PERK_TIERS[classId].l10) {
        expect(PERKS[perkId]).toBeDefined();
        expect(PERKS[perkId].classId).toBe(classId);
        expect(PERKS[perkId].tier).toBe('l10');
      }
    });
  });
});

describe('hunter perks', () => {
  it('beastmaster: pet-only +2 attack via petAttackBonus field', () => {
    const p = PERKS.beastmaster;
    expect(p.classId).toBe('hunter');
    expect(p.petAttackBonus).toBe(2);
    expect(p.statEffects ?? []).toEqual([]);
  });

  it('sharpshooter: hero +2 attack via statEffects', () => {
    const p = PERKS.sharpshooter;
    expect(p.classId).toBe('hunter');
    expect(p.petAttackBonus).toBeUndefined();
    expect(p.statEffects).toEqual([{ stat: 'attack', delta: 2 }]);
  });
});
