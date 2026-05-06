import { describe, expect, it } from 'vitest';
import { BASE_ITEMS } from '@data/items';
import { CLASSES } from '@data/classes';
import type { ClassId, Item, ItemBaseId, ItemSlot } from '@data/types';
import { createHero, type Hero } from '@heroes/hero';
import { describeKitStatus, resolveCombatAbilities, resolveAbilityDiff } from '../kit';

function makeItem(baseId: ItemBaseId, slot: ItemSlot, id: string): Item {
  const def = BASE_ITEMS[baseId];
  return {
    id,
    baseId,
    slot,
    rarity: 'common',
    ...(def.weaponType !== undefined ? { weaponType: def.weaponType } : {}),
    affixes: [],
    floorRolledAt: 1,
  };
}

function makeHeroWith(opts: {
  classId: ClassId;
  weaponBaseId: ItemBaseId;
  shieldBaseId?: ItemBaseId;
}): Hero {
  const hero = createHero(opts.classId, 'TestHero', `h_${opts.classId}`, 'quick', '0');
  const weapon = makeItem(opts.weaponBaseId, 'weapon', 'w_test');
  const shield = opts.shieldBaseId !== undefined
    ? makeItem(opts.shieldBaseId, 'shield', 's_test')
    : undefined;
  return {
    ...hero,
    equipment: {
      weapon,
      ...(shield !== undefined ? { shield } : {}),
    },
  };
}

const PREFERRED_WEAPON: Record<ClassId, ItemBaseId> = {
  knight: 'sword_basic',
  archer: 'bow_basic',
  priest: 'mace_basic',         // holy_symbol family base
  barbarian: 'axe_basic',
  rogue: 'daggers_basic',
  mage: 'staff_basic',
  paladin: 'sword_basic',
};

describe('resolveCombatAbilities — Band 1 (preferred weapon)', () => {
  it('Knight + sword + shield → full kit', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toEqual(CLASSES.knight.abilities);
    expect(result.aiPriority).toEqual(CLASSES.knight.aiPriority);
  });

  it.each(Object.keys(PREFERRED_WEAPON) as ClassId[])(
    '%s + preferred weapon → full kit',
    (classId) => {
      const opts: Parameters<typeof makeHeroWith>[0] = {
        classId,
        weaponBaseId: PREFERRED_WEAPON[classId],
      };
      if (classId === 'knight') opts.shieldBaseId = 'shield_basic';
      const hero = makeHeroWith(opts);
      const result = resolveCombatAbilities(hero);
      expect(result.abilities).toEqual(CLASSES[classId].abilities);
      expect(result.aiPriority).toEqual(CLASSES[classId].aiPriority);
    },
  );
});

describe('resolveCombatAbilities — Band 2 (same-family swap)', () => {
  it('Knight + axe → swap shield_bash to knight_cleaving_swing', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'axe_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('knight_cleaving_swing');
    expect(result.abilities).not.toContain('shield_bash');
    expect(result.aiPriority).toContain('knight_cleaving_swing');
    expect(result.aiPriority).not.toContain('shield_bash');
    expect(result.abilities).toContain('knight_slash');
    expect(result.abilities).toContain('bulwark');
    expect(result.abilities).toContain('taunt');
  });

  it('Knight + daggers → swap shield_bash to knight_quick_slash', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'daggers_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('knight_quick_slash');
    expect(result.abilities).not.toContain('shield_bash');
  });

  it('Barbarian + sword → swap cleave to barbarian_whirl_strike', () => {
    const hero = makeHeroWith({ classId: 'barbarian', weaponBaseId: 'sword_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('barbarian_whirl_strike');
    expect(result.abilities).not.toContain('cleave');
  });

  it('Barbarian + daggers → swap cleave to barbarian_frenzy', () => {
    const hero = makeHeroWith({ classId: 'barbarian', weaponBaseId: 'daggers_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('barbarian_frenzy');
    expect(result.abilities).not.toContain('cleave');
  });

  it('Rogue + sword → swap backstab to rogue_riposte', () => {
    const hero = makeHeroWith({ classId: 'rogue', weaponBaseId: 'sword_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('rogue_riposte');
    expect(result.abilities).not.toContain('backstab');
  });

  it('Rogue + axe → swap backstab to rogue_brutal_chop', () => {
    const hero = makeHeroWith({ classId: 'rogue', weaponBaseId: 'axe_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('rogue_brutal_chop');
    expect(result.abilities).not.toContain('backstab');
  });

  it('Priest + staff → swap smite to priest_arcane_bolt', () => {
    const hero = makeHeroWith({ classId: 'priest', weaponBaseId: 'staff_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('priest_arcane_bolt');
    expect(result.abilities).not.toContain('smite');
  });

  it('Mage + holy_symbol (mace_basic) → swap firebolt to mage_holy_light', () => {
    const hero = makeHeroWith({ classId: 'mage', weaponBaseId: 'mace_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('mage_holy_light');
    expect(result.abilities).not.toContain('firebolt');
  });
});

describe('resolveCombatAbilities — Band 3 (wholly wrong)', () => {
  it('Mage + sword → only mage_zap', () => {
    const hero = makeHeroWith({ classId: 'mage', weaponBaseId: 'sword_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toEqual(['mage_zap']);
    expect(result.aiPriority).toEqual(['mage_zap']);
  });

  it('Knight + bow → only knight_slash', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'bow_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toEqual(['knight_slash']);
  });

  it('Priest + daggers → only priest_strike', () => {
    const hero = makeHeroWith({ classId: 'priest', weaponBaseId: 'daggers_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toEqual(['priest_strike']);
  });

  it('Rogue + staff → only rogue_strike', () => {
    const hero = makeHeroWith({ classId: 'rogue', weaponBaseId: 'staff_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toEqual(['rogue_strike']);
  });
});

describe('resolveCombatAbilities — Archer special case', () => {
  it('Archer + bow → full kit', () => {
    const hero = makeHeroWith({ classId: 'archer', weaponBaseId: 'bow_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toEqual(CLASSES.archer.abilities);
  });

  it('Archer + sword → only archer_shoot (no same-family alt)', () => {
    const hero = makeHeroWith({ classId: 'archer', weaponBaseId: 'sword_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toEqual(['archer_shoot']);
  });

  it('Archer + staff → only archer_shoot', () => {
    const hero = makeHeroWith({ classId: 'archer', weaponBaseId: 'staff_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toEqual(['archer_shoot']);
  });
});

describe('resolveCombatAbilities — shield filter', () => {
  it('Knight + sword + shield → kit includes shield_bash', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).toContain('shield_bash');
  });

  it('Knight + sword + no shield → kit excludes shield_bash, length 3', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.abilities).not.toContain('shield_bash');
    expect(result.abilities).toHaveLength(3);
  });

  it('Knight + axe + no shield → kit unchanged from "axe + shield" case', () => {
    const heroNoShield = makeHeroWith({ classId: 'knight', weaponBaseId: 'axe_basic' });
    const heroWithShield = makeHeroWith({ classId: 'knight', weaponBaseId: 'axe_basic', shieldBaseId: 'shield_basic' });
    const r1 = resolveCombatAbilities(heroNoShield);
    const r2 = resolveCombatAbilities(heroWithShield);
    expect(r1.abilities).toEqual(r2.abilities);
  });

  it('aiPriority is filtered identically to abilities', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic' });
    const result = resolveCombatAbilities(hero);
    expect(result.aiPriority).not.toContain('shield_bash');
  });
});

describe('resolveCombatAbilities — invariants', () => {
  it('every result has at least one ability', () => {
    for (const classId of Object.keys(PREFERRED_WEAPON) as ClassId[]) {
      for (const weaponBaseId of ['sword_basic', 'bow_basic', 'staff_basic'] as const) {
        const hero = makeHeroWith({ classId, weaponBaseId });
        const result = resolveCombatAbilities(hero);
        expect(result.abilities.length, `${classId} + ${weaponBaseId}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('every aiPriority entry exists in abilities', () => {
    for (const classId of Object.keys(PREFERRED_WEAPON) as ClassId[]) {
      for (const weaponBaseId of ['sword_basic', 'axe_basic', 'bow_basic', 'staff_basic'] as const) {
        const hero = makeHeroWith({ classId, weaponBaseId });
        const result = resolveCombatAbilities(hero);
        const abilitySet = new Set<string>(result.abilities);
        for (const id of result.aiPriority) {
          expect(abilitySet.has(id), `${classId} + ${weaponBaseId}: aiPriority '${id}'`).toBe(true);
        }
      }
    }
  });

  it('does not mutate hero input', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'axe_basic' });
    const snapshot = JSON.stringify(hero);
    resolveCombatAbilities(hero);
    expect(JSON.stringify(hero)).toBe(snapshot);
  });

  it('is deterministic — same hero produces same result twice', () => {
    const hero = makeHeroWith({ classId: 'mage', weaponBaseId: 'mace_basic' });
    const a = resolveCombatAbilities(hero);
    const b = resolveCombatAbilities(hero);
    expect(a).toEqual(b);
  });
});

describe('describeKitStatus', () => {
  it('Knight + sword + shield → full kit', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    expect(describeKitStatus(hero)).toBe('Sword + Shield · Full kit');
  });

  it('Knight + sword + no shield → no-shield message', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic' });
    expect(describeKitStatus(hero)).toBe('Sword · No shield (Shield Bash unavailable)');
  });

  it('Knight + axe → off-preferred', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'axe_basic' });
    expect(describeKitStatus(hero)).toBe('Axe · Off-preferred (1 swap)');
  });

  it('Knight + bow → wrong family', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'bow_basic' });
    expect(describeKitStatus(hero)).toBe('Bow · Wrong family (basic only)');
  });

  it('Archer + bow → full kit (no "+ Shield" suffix — Archer has no shield-required ability)', () => {
    const hero = makeHeroWith({ classId: 'archer', weaponBaseId: 'bow_basic' });
    expect(describeKitStatus(hero)).toBe('Bow · Full kit');
  });

  it('Archer + sword → wrong family (no same-family alternative)', () => {
    const hero = makeHeroWith({ classId: 'archer', weaponBaseId: 'sword_basic' });
    expect(describeKitStatus(hero)).toBe('Sword · Wrong family (basic only)');
  });

  it('Mage + staff → full kit', () => {
    const hero = makeHeroWith({ classId: 'mage', weaponBaseId: 'staff_basic' });
    expect(describeKitStatus(hero)).toBe('Staff · Full kit');
  });

  it('Mage + holy_symbol (mace_basic) → off-preferred', () => {
    const hero = makeHeroWith({ classId: 'mage', weaponBaseId: 'mace_basic' });
    expect(describeKitStatus(hero)).toBe('Holy Symbol · Off-preferred (1 swap)');
  });

  it('Priest + staff → off-preferred', () => {
    const hero = makeHeroWith({ classId: 'priest', weaponBaseId: 'staff_basic' });
    expect(describeKitStatus(hero)).toBe('Staff · Off-preferred (1 swap)');
  });

  it('Priest + holy_symbol (mace_basic) → full kit', () => {
    const hero = makeHeroWith({ classId: 'priest', weaponBaseId: 'mace_basic' });
    expect(describeKitStatus(hero)).toBe('Holy Symbol · Full kit');
  });
});

describe('resolveAbilityDiff — same kit', () => {
  it('returns empty diff and same band when equipment unchanged', () => {
    const hero = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    const diff = resolveAbilityDiff(hero, hero);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.bandChange).toBe('same');
  });
});

describe('resolveAbilityDiff — preferred → off-preferred (same family)', () => {
  it('Knight sword → Knight axe records 1 ability swap and bandChange downgrade', () => {
    const before = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    const after = makeHeroWith({ classId: 'knight', weaponBaseId: 'axe_basic', shieldBaseId: 'shield_basic' });
    const diff = resolveAbilityDiff(before, after);
    expect(diff.added.length).toBe(1);
    expect(diff.removed.length).toBe(1);
    expect(diff.bandChange).toBe('downgrade');
  });
});

describe('resolveAbilityDiff — off-preferred → preferred', () => {
  it('Knight axe → Knight sword records 1 swap and bandChange upgrade', () => {
    const before = makeHeroWith({ classId: 'knight', weaponBaseId: 'axe_basic', shieldBaseId: 'shield_basic' });
    const after = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    const diff = resolveAbilityDiff(before, after);
    expect(diff.added.length).toBe(1);
    expect(diff.removed.length).toBe(1);
    expect(diff.bandChange).toBe('upgrade');
  });
});

describe('resolveAbilityDiff — preferred → wrong family', () => {
  it('Knight sword → Knight bow drops to basic-only (large removed list, bandChange downgrade)', () => {
    const before = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    const after = makeHeroWith({ classId: 'knight', weaponBaseId: 'bow_basic', shieldBaseId: 'shield_basic' });
    const diff = resolveAbilityDiff(before, after);
    expect(diff.removed.length).toBeGreaterThan(0);
    expect(diff.bandChange).toBe('downgrade');
  });
});

describe('resolveAbilityDiff — wrong family → preferred', () => {
  it('Knight bow → Knight sword bandChange upgrade with abilities added', () => {
    const before = makeHeroWith({ classId: 'knight', weaponBaseId: 'bow_basic', shieldBaseId: 'shield_basic' });
    const after = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    const diff = resolveAbilityDiff(before, after);
    expect(diff.added.length).toBeGreaterThan(0);
    expect(diff.bandChange).toBe('upgrade');
  });
});

describe('resolveAbilityDiff — shield removed', () => {
  it('Knight sword + shield → Knight sword no shield records removed shield-required abilities', () => {
    const before = makeHeroWith({ classId: 'knight', weaponBaseId: 'sword_basic', shieldBaseId: 'shield_basic' });
    const noShield: Hero = { ...before, equipment: { weapon: before.equipment.weapon } };
    const diff = resolveAbilityDiff(before, noShield);
    expect(diff.removed.length).toBeGreaterThan(0);
    expect(diff.bandChange).toBe('downgrade');
  });
});
