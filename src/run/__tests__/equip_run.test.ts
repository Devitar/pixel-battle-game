import { describe, expect, it } from 'vitest';
import type { Item } from '../../data/types';
import { applyPerk, createHero } from '../../heroes/hero';
import { addItem, createPack } from '../pack';
import { startRun } from '../run_state';
import { createRng } from '../../util/rng';
import { equipFromPack, unequipToPack } from '../equip_run';

const sword = (id: string, overrides: Partial<Item> = {}): Item => ({
  id, baseId: 'sword_basic', slot: 'weapon', rarity: 'common',
  weaponType: 'sword', affixes: [], floorRolledAt: 1, ...overrides,
});

const outfit = (id: string, overrides: Partial<Item> = {}): Item => ({
  id, baseId: 'outfit_cloth', slot: 'outfit', rarity: 'common',
  affixes: [], floorRolledAt: 1, ...overrides,
});

function makeRunWithPackItems(items: readonly Item[]) {
  const party = [
    createHero('knight', 'K', 'h0', 'quick', '0'),
    createHero('archer', 'A', 'h1', 'quick', '0'),
    createHero('priest', 'P', 'h2', 'quick', '0'),
  ];
  const rs = startRun('crypt', party, 1, createRng(1));
  let pack = createPack();
  for (const it of items) pack = addItem(pack, it);
  return { ...rs, pack };
}

describe('equipFromPack — happy paths', () => {
  it('swaps weapon: hero gets new, old weapon goes to pack', () => {
    const newWeapon = sword('w_new', { affixes: [{ affixId: 'of_power', value: 1 }], rarity: 'uncommon' });
    const rs = makeRunWithPackItems([newWeapon]);
    const oldWeaponId = rs.party[0].equipment.weapon.id;
    const result = equipFromPack(rs, 0, 'w_new', 'weapon');
    expect(result.party[0].equipment.weapon.id).toBe('w_new');
    expect(result.pack.items.find((i) => i.id === oldWeaponId)).toBeDefined();
    expect(result.pack.items.find((i) => i.id === 'w_new')).toBeUndefined();
  });

  it('equips into empty slot: no displaced item', () => {
    const newOutfit = outfit('o_new');
    const rs = makeRunWithPackItems([newOutfit]);
    expect(rs.party[0].equipment.outfit).toBeUndefined();
    const result = equipFromPack(rs, 0, 'o_new', 'outfit');
    expect(result.party[0].equipment.outfit?.id).toBe('o_new');
    expect(result.pack.items).toHaveLength(0);
  });

  it('clamps currentHp when newMaxHp is lower than old currentHp', () => {
    const rs = makeRunWithPackItems([sword('w_new')]);
    const heroWithBoostedHp = { ...rs.party[0], currentHp: 999 };
    const rsWithBoost = { ...rs, party: [heroWithBoostedHp, rs.party[1], rs.party[2]] };
    const result = equipFromPack(rsWithBoost, 0, 'w_new', 'weapon');
    expect(result.party[0].currentHp).toBeLessThanOrEqual(result.party[0].maxHp);
  });

  it('vigor outfit raises maxHp; currentHp preserved if within new max', () => {
    const vigorOutfit = outfit('o_vigor', {
      rarity: 'rare',
      affixes: [{ affixId: 'of_vigor', value: 6 }],
    });
    const rs = makeRunWithPackItems([vigorOutfit]);
    const oldMaxHp = rs.party[0].maxHp;
    const oldCurrentHp = rs.party[0].currentHp;
    const result = equipFromPack(rs, 0, 'o_vigor', 'outfit');
    expect(result.party[0].maxHp).toBe(oldMaxHp + 6 + 6);
    expect(result.party[0].currentHp).toBe(oldCurrentHp);
  });

  it('item identity preserved across equip → re-equip cycle', () => {
    const swordA = sword('a');
    const swordB = sword('b');
    const rs = makeRunWithPackItems([swordA, swordB]);
    const initialWeaponId = rs.party[0].equipment.weapon.id;
    const after1 = equipFromPack(rs, 0, 'a', 'weapon');
    const after2 = equipFromPack(after1, 0, 'b', 'weapon');
    const packIds = after2.pack.items.map((i) => i.id).sort();
    expect(packIds).toContain(initialWeaponId);
    expect(packIds).toContain('a');
    expect(after2.party[0].equipment.weapon.id).toBe('b');
  });

  it('preserves perk HP effect across equip-from-pack round-trip', () => {
    const stoutKnight = applyPerk(
      createHero('knight', 'K', 'h0', 'stout', '0'),
      'resolute',
    );
    expect(stoutKnight.maxHp).toBe(24);  // sanity: 20 → 22 (Stout) → 24 (Resolute)

    const archer = createHero('archer', 'A', 'h1', 'quick', '0');
    const priest = createHero('priest', 'P', 'h2', 'quick', '0');
    const party = [stoutKnight, archer, priest];
    const rs = startRun('crypt', party, 1, createRng(1));
    const newOutfit = outfit('o_test');
    const rsWithItem = { ...rs, pack: addItem(createPack(), newOutfit) };

    // Equip a +6 HP outfit → maxHp should be 24 + 6 = 30
    // (bug: inline computeMaxHp drops perk → 22 + 6 = 28)
    const equipped = equipFromPack(rsWithItem, 0, 'o_test', 'outfit');
    expect(equipped.party[0].maxHp).toBe(30);

    // Unequip → maxHp should return to 24 (bug: would be 22)
    const restored = unequipToPack(equipped, 0, 'outfit');
    expect(restored.party[0].maxHp).toBe(24);
  });
});

describe('equipFromPack — validation', () => {
  it('throws on out-of-bounds heroIndex without mutating state', () => {
    const rs = makeRunWithPackItems([sword('w')]);
    const snapshot = JSON.stringify(rs);
    expect(() => equipFromPack(rs, 5, 'w', 'weapon')).toThrow(/heroIndex/);
    expect(JSON.stringify(rs)).toBe(snapshot);
  });

  it('throws on missing item id without mutating state', () => {
    const rs = makeRunWithPackItems([]);
    const snapshot = JSON.stringify(rs);
    expect(() => equipFromPack(rs, 0, 'nope', 'weapon')).toThrow(/'nope'/);
    expect(JSON.stringify(rs)).toBe(snapshot);
  });

  it('throws on slot/item mismatch without mutating state', () => {
    const rs = makeRunWithPackItems([sword('w')]);
    const snapshot = JSON.stringify(rs);
    expect(() => equipFromPack(rs, 0, 'w', 'shield')).toThrow(/does not match target slot/);
    expect(JSON.stringify(rs)).toBe(snapshot);
  });
});

describe('unequipToPack — happy paths', () => {
  it('moves shield to pack and clears the slot', () => {
    const rs = makeRunWithPackItems([]);
    expect(rs.party[0].equipment.shield).toBeDefined();
    const shieldId = rs.party[0].equipment.shield!.id;
    const result = unequipToPack(rs, 0, 'shield');
    expect(result.party[0].equipment.shield).toBeUndefined();
    expect(result.pack.items.map((i) => i.id)).toContain(shieldId);
  });

  it('no-op when slot is empty', () => {
    const rs = makeRunWithPackItems([]);
    expect(rs.party[0].equipment.outfit).toBeUndefined();
    const result = unequipToPack(rs, 0, 'outfit');
    expect(result).toBe(rs);
  });

  it('recomputes maxHp after unequipping a vigor outfit', () => {
    const vigorOutfit = outfit('o_vigor', {
      rarity: 'rare',
      affixes: [{ affixId: 'of_vigor', value: 6 }],
    });
    const rs1 = makeRunWithPackItems([vigorOutfit]);
    const rs2 = equipFromPack(rs1, 0, 'o_vigor', 'outfit');
    const boostedMaxHp = rs2.party[0].maxHp;
    const rs3 = unequipToPack(rs2, 0, 'outfit');
    expect(rs3.party[0].maxHp).toBeLessThan(boostedMaxHp);
  });
});

describe('unequipToPack — validation', () => {
  it('throws on weapon slot', () => {
    const rs = makeRunWithPackItems([]);
    expect(() => unequipToPack(rs, 0, 'weapon')).toThrow(/weapon/);
  });

  it('throws on out-of-bounds heroIndex', () => {
    const rs = makeRunWithPackItems([]);
    expect(() => unequipToPack(rs, 9, 'shield')).toThrow(/heroIndex/);
  });
});
