import { describe, expect, it } from 'vitest';
import { CLASSES } from '../classes';
import { CLASS_PERK_PAIRS, PERKS } from '../perks';
import type { ClassId, PerkId } from '../types';

const EXPECTED_IDS: readonly PerkId[] = [
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
    it('has at least one effect (statEffects, hpEffect, or petAttackBonus)', () => {
      const p = PERKS[id];
      const hasStat = p.statEffects !== undefined && p.statEffects.length > 0;
      const hasHp = p.hpEffect !== undefined;
      const hasPetAttack = p.petAttackBonus !== undefined;
      expect(hasStat || hasHp || hasPetAttack).toBe(true);
    });
  });
});

describe('CLASS_PERK_PAIRS', () => {
  it('has exactly 8 entries (one per ClassId)', () => {
    const expectedClasses: ClassId[] =
      ['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage', 'paladin', 'hunter'];
    expect(Object.keys(CLASS_PERK_PAIRS).sort()).toEqual([...expectedClasses].sort());
  });

  describe.each(['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage', 'paladin', 'hunter'] as ClassId[])(
    'class %s pair',
    (classId) => {
      it('has exactly 2 distinct perks', () => {
        const pair = CLASS_PERK_PAIRS[classId];
        expect(pair).toHaveLength(2);
        expect(pair[0]).not.toBe(pair[1]);
      });
      it('both perks belong to this class', () => {
        const pair = CLASS_PERK_PAIRS[classId];
        for (const perkId of pair) {
          expect(PERKS[perkId].classId).toBe(classId);
        }
      });
    },
  );
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
