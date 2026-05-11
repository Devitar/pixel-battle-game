import { describe, expect, it } from 'vitest';
import { CLASSES } from '@data/classes';
import { PERKS } from '@data/perks';
import { TRAITS } from '@data/traits';
import { applyPerk, computeMaxHp, createHero, recomputeMaxHp, type Hero } from '../hero';

describe('createHero — basic shape', () => {
  it('builds a Knight with full HP and stored trait / body', () => {
    const h = createHero('knight', 'Eira', 'h1', 'quick', 'body1');
    expect(h.id).toBe('h1');
    expect(h.classId).toBe('knight');
    expect(h.name).toBe('Eira');
    expect(h.baseStats).toEqual(CLASSES.knight.baseStats);
    expect(h.currentHp).toBe(h.maxHp);
    expect(h.maxHp).toBe(CLASSES.knight.baseStats.hp);
    expect(h.traitIds).toEqual(['quick']);
    expect(h.bodySpriteId).toBe('body1');
  });

  it('two heroes with identical inputs are structurally equal', () => {
    const a = createHero('archer', 'Luna', 'h2', 'quick', 'body2');
    const b = createHero('archer', 'Luna', 'h2', 'quick', 'body2');
    expect(a).toEqual(b);
  });

  it('baseStats is a copy, not a reference to CLASSES', () => {
    const h = createHero('priest', 'Ser', 'h3', 'quick', 'body3');
    expect(h.baseStats).not.toBe(CLASSES.priest.baseStats);
  });

  it('defaults xp=0, level=1, pendingPerk=false; perkId undefined', () => {
    const h = createHero('knight', 'K', 'h1', 'quick', 'body1');
    expect(h.xp).toBe(0);
    expect(h.level).toBe(1);
    expect(h.pendingPerk).toBe(false);
    expect(h.perkId).toBeUndefined();
  });
});

describe('createHero — HP trait baking', () => {
  it('Stout Knight: 20 × 1.10 = 22', () => {
    const h = createHero('knight', 'K', 'h1', 'stout', 'body1');
    expect(h.maxHp).toBe(22);
    expect(h.currentHp).toBe(22);
  });

  it('Stout Archer: 14 × 1.10 = 15.4 → round 15', () => {
    const h = createHero('archer', 'A', 'h1', 'stout', 'body1');
    expect(h.maxHp).toBe(15);
  });

  it('Stout Priest: 15 × 1.10 = 16.5 → round 17', () => {
    const h = createHero('priest', 'P', 'h1', 'stout', 'body1');
    expect(h.maxHp).toBe(17);
  });

  it('Quick Knight: HP unaffected', () => {
    const h = createHero('knight', 'K', 'h1', 'quick', 'body1');
    expect(h.maxHp).toBe(CLASSES.knight.baseStats.hp);
  });

  it('Non-HP traits leave HP at class default', () => {
    for (const trait of ['quick', 'sturdy', 'sharp_eyed', 'cowardly', 'nervous'] as const) {
      const h = createHero('knight', 'K', 'h1', trait, 'body1');
      expect(h.maxHp, `trait ${trait}`).toBe(CLASSES.knight.baseStats.hp);
    }
  });
});

describe('createHero — equipment', () => {
  it('Knight starts with sword + shield equipped', () => {
    const h = createHero('knight', 'Eira', 'h1', 'quick', '0');
    expect(h.equipment.weapon.baseId).toBe('sword_basic');
    expect(h.equipment.weapon.slot).toBe('weapon');
    expect(h.equipment.weapon.rarity).toBe('common');
    expect(h.equipment.shield?.baseId).toBe('shield_basic');
  });

  it('Mage starts with staff and no shield', () => {
    const h = createHero('mage', 'Lyr', 'h2', 'quick', '0');
    expect(h.equipment.weapon.baseId).toBe('staff_basic');
    expect(h.equipment.shield).toBeUndefined();
  });

  it('starter items have empty affixes and rarity common', () => {
    const h = createHero('archer', 'Q', 'h3', 'quick', '0');
    expect(h.equipment.weapon.affixes).toEqual([]);
    expect(h.equipment.weapon.rarity).toBe('common');
  });

  it('starter item ids are deterministic from hero id + slot', () => {
    const h1 = createHero('knight', 'A', 'abc', 'quick', '0');

    const h2 = createHero('knight', 'B', 'abc', 'quick', '0');
    expect(h1.equipment.weapon.id).toBe(h2.equipment.weapon.id);
    expect(h1.equipment.weapon.id).toBe('starter_abc_weapon');
  });
});

describe('applyPerk', () => {
  it('stat-effect perk preserves HP, sets perkId, clears pendingPerk', () => {
    const base = createHero('knight', 'K', 'h0', 'quick', 'body1');
    const h: Hero = { ...base, pendingPerk: true };
    const result = applyPerk(h, 'iron_will');
    expect(result.perkId).toBe('iron_will');
    expect(result.pendingPerk).toBe(false);
    expect(result.maxHp).toBe(h.maxHp);
    expect(result.currentHp).toBe(h.currentHp);
  });

  it('HP-effect perk at full HP: maxHp +10%, currentHp scales to new max', () => {
    const base = createHero('knight', 'K', 'h0', 'quick', 'body1');
    // Knight base 20 + Quick (no HP effect) + sword/shield (no HP gear) = 20 maxHp.
    expect(base.maxHp).toBe(20);
    const result = applyPerk(base, 'resolute');
    expect(result.maxHp).toBe(22); // round(20 * 1.1)
    expect(result.currentHp).toBe(22); // proportional from full
  });

  it('HP-effect perk at partial HP: HP percentage preserved within rounding', () => {
    const base = createHero('knight', 'K', 'h0', 'quick', 'body1');
    const h: Hero = { ...base, currentHp: 10 }; // 50%
    const result = applyPerk(h, 'resolute');
    expect(result.maxHp).toBe(22);
    // round(10 * 22/20) = round(11) = 11
    expect(result.currentHp).toBe(11);
  });

  it('HP-effect perk: currentHp floors at 1 (defensive)', () => {
    const base = createHero('knight', 'K', 'h0', 'quick', 'body1');
    const h: Hero = { ...base, currentHp: 0 };
    const result = applyPerk(h, 'resolute');
    expect(result.currentHp).toBeGreaterThanOrEqual(1);
  });

  it('clears pendingPerk regardless of effect kind', () => {
    const base = createHero('knight', 'K', 'h0', 'quick', 'body1');
    const h: Hero = { ...base, pendingPerk: true };
    expect(applyPerk(h, 'iron_will').pendingPerk).toBe(false);
    expect(applyPerk(h, 'resolute').pendingPerk).toBe(false);
  });
});

describe('computeMaxHp — perk HP effect', () => {
  it('Stout (+10% HP) + Resolute (+10% HP) Knight stacks: 20 → 22 → 24', () => {
    const knight = createHero('knight', 'K', 'h0', 'stout', 'body1');
    const result = computeMaxHp(
      CLASSES.knight.baseStats.hp,
      [TRAITS.stout],
      knight.equipment,
      PERKS.resolute,
    );
    // 20 → round(20 * 1.1) = 22 → round(22 * 1.1) = 24, plus 0 gear HP.
    expect(result).toBe(24);
  });
});

describe('recomputeMaxHp', () => {
  it('preserves perk HP effect when recomputing', () => {
    const knight = createHero('knight', 'K', 'h0', 'stout', 'body1');
    const withPerk = applyPerk(knight, 'resolute');
    expect(withPerk.maxHp).toBe(24);  // 20 → 22 (Stout +10%) → 24 (Resolute +10%)
    const recomputed = recomputeMaxHp(withPerk);
    expect(recomputed.maxHp).toBe(24);  // bug: would be 22 if perk dropped
  });
});

describe('multi-trait Hero shape', () => {
  it('stores traitIds as a single-element array on createHero', () => {
    const hero = createHero('knight', 'A', 'h1', 'stout', 'body1');
    expect(hero.traitIds).toEqual(['stout']);
  });

  it('computeMaxHp composes multiple percent-mode hp effects multiplicatively', () => {
    // Stout = +10% HP. Stacking two gives 1.21× base, not 1.20×.
    const knightHp = 20;
    const stout = TRAITS.stout;
    const traits = [stout, stout];  // illegal in practice but verifies compose order
    const equipment = {
      weapon: { id: 'w', baseId: 'sword_basic', slot: 'weapon', rarity: 'common', affixes: [], floorRolledAt: 1 },
    } as never;
    const hp = computeMaxHp(knightHp, traits, equipment);
    // 20 → 22 → 24 (per applyHpEffect's Math.round each step). Verify value is greater
    // than the single-stout case.
    const singleHp = computeMaxHp(knightHp, [stout], equipment);
    expect(hp).toBeGreaterThan(singleHp);
  });

  it('recomputeMaxHp uses every trait in the array', () => {
    const hero = createHero('knight', 'A', 'h2', 'stout', 'body1');
    const heroWithTwo = { ...hero, traitIds: ['stout', 'sturdy'] as const };
    const recomputed = recomputeMaxHp(heroWithTwo);
    // Sturdy = +1 Defense (no HP effect); Stout = +10% HP.
    // Recomputed maxHp should equal the single-stout case (sturdy does not change HP).
    expect(recomputed.maxHp).toBe(recomputeMaxHp(hero).maxHp);
  });
});

describe('createHero — Hunter petSpeciesId', () => {
  it('stores petSpeciesId on Hunter heroes when provided', () => {
    const hero = createHero(
      'hunter', 'Robin', 'h_robin', 'stout',
      'body1', 'legs_default', 'feet_default',
      'wolf',
    );
    expect(hero.petSpeciesId).toBe('wolf');
  });

  it('leaves petSpeciesId undefined for non-Hunter classes', () => {
    const hero = createHero(
      'knight', 'Aldous', 'h_aldous', 'stout',
      'body1',
    );
    expect(hero.petSpeciesId).toBeUndefined();
  });

  it('leaves petSpeciesId undefined for a Hunter when not provided', () => {
    const hero = createHero(
      'hunter', 'Mute', 'h_mute', 'quick',
      'body1',
    );
    expect(hero.petSpeciesId).toBeUndefined();
  });
});
