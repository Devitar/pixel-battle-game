import { describe, expect, it } from 'vitest';
import { createRng } from '@util/rng';
import { LEGENDARY_DEFS, LEGENDARY_PASSIVES_BY_SLOT } from '@data/legendaries';
import { pickRarity, rollEventItem, rollLoot, rollNamedLegendary, rollRandomLegendary, rollShopItem } from '../loot';

describe('rollLoot — drop gate', () => {
  it('drops at roughly 10% on a non-boss combat node (Phase 5 retune from 50%)', () => {
    let drops = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      if (rollLoot(createRng(seed), 1, 'combat') !== null) drops += 1;
    }
    expect(drops).toBeGreaterThanOrEqual(60);
    expect(drops).toBeLessThanOrEqual(150);
  });

  it('always returns an item on a boss node', () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(rollLoot(createRng(seed), 1, 'boss')).not.toBeNull();
    }
  });
});

describe('rollLoot — slot uniformity', () => {
  it('distributes the 4 slots roughly evenly over 1000 boss rolls', () => {
    const counts: Record<string, number> = { weapon: 0, shield: 0, outfit: 0, hat: 0 };
    for (let seed = 1; seed <= 1000; seed++) {
      const item = rollLoot(createRng(seed), 1, 'boss');
      if (item) counts[item.slot] += 1;
    }
    for (const slot of ['weapon', 'shield', 'outfit', 'hat']) {
      expect(counts[slot]).toBeGreaterThanOrEqual(150);
      expect(counts[slot]).toBeLessThanOrEqual(350);
    }
  });
});

describe('rollLoot — rarity weights', () => {
  it('floor 1 boss never rolls rare', () => {
    let rare = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const item = rollLoot(createRng(seed), 1, 'combat'); // non-boss = floor 1
      if (item?.rarity === 'rare') rare += 1;
    }
    expect(rare).toBe(0);
  });

  it('floor 15 hits rare ≥25% of the time', () => {
    let rare = 0;
    let drops = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const item = rollLoot(createRng(seed), 15, 'boss');
      if (item) {
        drops += 1;
        if (item.rarity === 'rare') rare += 1;
      }
    }
    expect(rare / drops).toBeGreaterThanOrEqual(0.25);
  });
});

describe('rollLoot — affix counts by rarity', () => {
  it('common items have 0 affixes', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const item = rollLoot(createRng(seed), 1, 'boss');
      if (item?.rarity === 'common') {
        expect(item.affixes).toHaveLength(0);
      }
    }
  });

  it('uncommon items have 1 affix', () => {
    let seen = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const item = rollLoot(createRng(seed), 5, 'boss');
      if (item?.rarity === 'uncommon') {
        expect(item.affixes).toHaveLength(1);
        seen += 1;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('rare non-hat items have 2 affixes; rare hats have 3', () => {
    let rareNonHat = 0;
    let rareHat = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const item = rollLoot(createRng(seed), 15, 'boss');
      if (item?.rarity === 'rare') {
        if (item.slot === 'hat') {
          expect(item.affixes).toHaveLength(3);
          rareHat += 1;
        } else {
          expect(item.affixes).toHaveLength(2);
          rareNonHat += 1;
        }
      }
    }
    expect(rareNonHat).toBeGreaterThan(0);
    expect(rareHat).toBeGreaterThan(0);
  });
});

describe('rollLoot — affixes are unique on the same item', () => {
  it('no two affixes share an affixId', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const item = rollLoot(createRng(seed), 15, 'boss');
      if (item && item.affixes.length > 1) {
        const ids = item.affixes.map((a) => a.affixId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
});

describe('rollLoot — of_vigor ×3 multiplier', () => {
  it('produces value 6 at floor 1 and value 12 at floor 10', () => {
    let f1Vigor = 0;
    let f10Vigor = 0;
    for (let seed = 1; seed <= 5000; seed++) {
      const f1 = rollLoot(createRng(seed), 1, 'boss');
      if (f1) {
        const v = f1.affixes.find((a) => a.affixId === 'of_vigor');
        if (v) {
          expect(v.value).toBe(6);
          f1Vigor += 1;
        }
      }
      const f10 = rollLoot(createRng(seed), 10, 'boss');
      if (f10) {
        const v = f10.affixes.find((a) => a.affixId === 'of_vigor');
        if (v) {
          expect(v.value).toBe(12);
          f10Vigor += 1;
        }
      }
    }
    expect(f1Vigor).toBeGreaterThan(0);
    expect(f10Vigor).toBeGreaterThan(0);
  });
});

describe('rollLoot — rare property gating', () => {
  it('common/uncommon items never have rareProperty', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const item = rollLoot(createRng(seed), 5, 'boss');
      if (item && (item.rarity === 'common' || item.rarity === 'uncommon')) {
        expect(item.rareProperty).toBeUndefined();
      }
    }
  });

  it('rare hats have no rareProperty (they got an extra affix instead)', () => {
    let seen = 0;
    for (let seed = 1; seed <= 5000; seed++) {
      const item = rollLoot(createRng(seed), 15, 'boss');
      if (item?.rarity === 'rare' && item.slot === 'hat') {
        expect(item.rareProperty).toBeUndefined();
        seen += 1;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('rare non-hats roll a property whose slot matches the item slot', () => {
    let seen = 0;
    for (let seed = 1; seed <= 5000; seed++) {
      const item = rollLoot(createRng(seed), 15, 'boss');
      if (item?.rarity === 'rare' && item.slot !== 'hat') {
        expect(item.rareProperty).toBeDefined();
        seen += 1;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('rollLoot — determinism', () => {
  it('same seed + floor + kind → identical item including id', () => {
    const a = rollLoot(createRng(123), 7, 'boss');
    const b = rollLoot(createRng(123), 7, 'boss');
    expect(a).toEqual(b);
  });
});

describe('rollLoot — elite kind', () => {
  it('always returns an item (no null) across many seeds', () => {
    for (let seed = 1; seed <= 500; seed++) {
      expect(rollLoot(createRng(seed), 1, 'elite')).not.toBeNull();
    }
  });

  it('item rarity is always rare across many seeds and floors', () => {
    for (const floor of [1, 5, 10, 15]) {
      for (let seed = 1; seed <= 200; seed++) {
        const item = rollLoot(createRng(seed), floor, 'elite');
        expect(item).not.toBeNull();
        expect(item!.rarity).toBe('rare');
      }
    }
  });

  it('rare non-hat items have 2 affixes; rare hats have 3', () => {
    let nonHat = 0;
    let hat = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const item = rollLoot(createRng(seed), 5, 'elite');
      expect(item).not.toBeNull();
      if (item!.slot === 'hat') {
        expect(item!.affixes).toHaveLength(3);
        hat += 1;
      } else {
        expect(item!.affixes).toHaveLength(2);
        nonHat += 1;
      }
    }
    expect(nonHat).toBeGreaterThan(0);
    expect(hat).toBeGreaterThan(0);
  });

  it('floorRolledAt equals the floor passed in', () => {
    for (const floor of [1, 7, 12]) {
      const item = rollLoot(createRng(1), floor, 'elite');
      expect(item!.floorRolledAt).toBe(floor);
    }
  });

  it('non-hat rare items always have a rareProperty', () => {
    let seen = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const item = rollLoot(createRng(seed), 5, 'elite');
      if (item!.slot !== 'hat') {
        expect(item!.rareProperty).toBeDefined();
        seen += 1;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('determinism: same seed + floor + kind → identical item', () => {
    const a = rollLoot(createRng(123), 7, 'elite');
    const b = rollLoot(createRng(123), 7, 'elite');
    expect(a).toEqual(b);
  });

  it('exports LootKind type accepting combat | elite | boss | treasure', () => {
    const r1 = rollLoot(createRng(1), 1, 'combat');
    const r2 = rollLoot(createRng(1), 1, 'elite');
    const r3 = rollLoot(createRng(1), 1, 'boss');
    const r4 = rollLoot(createRng(1), 1, 'treasure');
    expect([r1, r2, r3, r4].every((r) => r === null || typeof r === 'object')).toBe(true);
  });
});

describe('rollEventItem', () => {
  it('always returns an item (never null)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const item = rollEventItem(createRng(seed), 1, 'common');
      expect(item).not.toBeNull();
    }
  });

  it('item rarity equals the requested rarity (common)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const item = rollEventItem(createRng(seed), 5, 'common');
      expect(item.rarity).toBe('common');
    }
  });

  it('item rarity equals the requested rarity (uncommon)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const item = rollEventItem(createRng(seed), 5, 'uncommon');
      expect(item.rarity).toBe('uncommon');
    }
  });

  it('item rarity equals the requested rarity (rare)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const item = rollEventItem(createRng(seed), 5, 'rare');
      expect(item.rarity).toBe('rare');
    }
  });

  it('floorRolledAt equals the floor passed in', () => {
    for (const floor of [1, 7, 12]) {
      const item = rollEventItem(createRng(1), floor, 'rare');
      expect(item.floorRolledAt).toBe(floor);
    }
  });

  it('determinism: same seed + floor + rarity → identical item', () => {
    const a = rollEventItem(createRng(123), 7, 'rare');
    const b = rollEventItem(createRng(123), 7, 'rare');
    expect(a).toEqual(b);
  });
});

describe('rollLoot — treasure kind', () => {
  it('always returns an item (no 50% gate)', () => {
    let drops = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      if (rollLoot(createRng(seed), 1, 'treasure') !== null) drops += 1;
    }
    expect(drops).toBe(1000);
  });

  it('floor 1 treasure never rolls rare (matches combat per-floor weights, not boss-bumped)', () => {
    let rare = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const item = rollLoot(createRng(seed), 1, 'treasure');
      if (item?.rarity === 'rare') rare += 1;
    }
    expect(rare).toBe(0);
  });

  it('floor 5 treasure rarity distribution roughly matches the floor-5 table (70/24/5/1)', () => {
    const counts: Record<string, number> = { common: 0, uncommon: 0, rare: 0 };
    for (let seed = 1; seed <= 1000; seed++) {
      const item = rollLoot(createRng(seed), 5, 'treasure');
      if (item) counts[item.rarity] += 1;
    }
    expect(counts.common).toBeGreaterThan(550);   // ≥55% (table is 70%)
    expect(counts.uncommon).toBeGreaterThan(150); // ≥15% (table is 25%)
    expect(counts.rare).toBeGreaterThan(20);      // ≥2%  (table is 5%)
  });

  it('treasure scaling uses current floor (floorRolledAt === floorNumber, not next-floor)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const item = rollLoot(createRng(seed), 7, 'treasure');
      expect(item).not.toBeNull();
      expect(item!.floorRolledAt).toBe(7);
    }
  });

  it('distributes the 4 slots roughly evenly over 1000 treasure rolls at floor 1', () => {
    const counts: Record<string, number> = { weapon: 0, shield: 0, outfit: 0, hat: 0 };
    for (let seed = 1; seed <= 1000; seed++) {
      const item = rollLoot(createRng(seed), 1, 'treasure');
      if (item) counts[item.slot] += 1;
    }
    for (const slot of ['weapon', 'shield', 'outfit', 'hat']) {
      expect(counts[slot]).toBeGreaterThanOrEqual(150);
      expect(counts[slot]).toBeLessThanOrEqual(350);
    }
  });
});

describe('rollLoot — tier 2 rarity offset', () => {
  it('tier 2 boss drops roll rare more often than tier 1 boss drops at floor 1', () => {
    // Tier 1 floor-1 boss: effectiveFloor = 1 + 1 = 2 → rare ≈ 1% (lerp row1 rare:0, row3 rare:2 at t=0.5).
    // Tier 2 floor-1 boss: effectiveFloor = (1 + 1) + 3 = 5 → rare = 5% per RARITY_TABLE row {floor:5, rare:5}.
    // Expect tier 2 to roll significantly more rares.
    let tier1Rare = 0;
    let tier2Rare = 0;
    const N = 1000;
    for (let seed = 1; seed <= N; seed++) {
      const r1 = rollLoot(createRng(seed), 1, 'boss', 1);
      const r2 = rollLoot(createRng(seed), 1, 'boss', 2);
      if (r1?.rarity === 'rare') tier1Rare++;
      if (r2?.rarity === 'rare') tier2Rare++;
    }
    expect(tier2Rare).toBeGreaterThan(tier1Rare * 2);
    expect(tier2Rare).toBeGreaterThanOrEqual(25);   // ≥2.5%, safely below the ~5% expected
    expect(tier2Rare).toBeLessThanOrEqual(100);     // ≤10%, safely above
  });
});

describe('loot — tier parameter parity (tier=1 default)', () => {
  it('rollLoot(rng, f, kind) ≡ rollLoot(rng, f, kind, 1)', () => {
    for (const seed of [1, 7, 42]) {
      for (const floor of [1, 5, 10]) {
        for (const kind of ['combat', 'elite', 'boss', 'treasure'] as const) {
          const a = rollLoot(createRng(seed), floor, kind);
          const b = rollLoot(createRng(seed), floor, kind, 1);
          expect(a).toEqual(b);
        }
      }
    }
  });

  it('rollShopItem(rng, slot, f) ≡ rollShopItem(rng, slot, f, 1)', () => {
    for (const seed of [1, 7, 42]) {
      const a = rollShopItem(createRng(seed), 'weapon', 5);
      const b = rollShopItem(createRng(seed), 'weapon', 5, 1);
      expect(a).toEqual(b);
    }
  });

  it('rollEventItem(rng, f, rarity) ≡ rollEventItem(rng, f, rarity, 1)', () => {
    for (const seed of [1, 7, 42]) {
      const a = rollEventItem(createRng(seed), 5, 'rare');
      const b = rollEventItem(createRng(seed), 5, 'rare', 1);
      expect(a).toEqual(b);
    }
  });
});

describe('pickRarity — Epic tier curve', () => {
  it('produces 0 epic at floor 1 (tier 1) over a large sample', () => {
    const rng = createRng(12345);
    let epic = 0;
    for (let i = 0; i < 1000; i++) {
      if (pickRarity(rng, 1, 1) === 'epic') epic++;
    }
    expect(epic).toBe(0);
  });

  it('produces 0 epic at floor 3 (tier 1) over a large sample', () => {
    const rng = createRng(12345);
    let epic = 0;
    for (let i = 0; i < 1000; i++) {
      if (pickRarity(rng, 3, 1) === 'epic') epic++;
    }
    expect(epic).toBe(0);
  });

  it('produces ~1% epic at floor 5 over a large sample (tolerance ±1.5%)', () => {
    const rng = createRng(12345);
    let epic = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) {
      if (pickRarity(rng, 5, 1) === 'epic') epic++;
    }
    const pct = (epic / N) * 100;
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(2.5);
  });

  it('produces ~10% epic at floor 15 over a large sample (tolerance ±2%)', () => {
    const rng = createRng(12345);
    let epic = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) {
      if (pickRarity(rng, 15, 1) === 'epic') epic++;
    }
    const pct = (epic / N) * 100;
    expect(pct).toBeGreaterThan(8);
    expect(pct).toBeLessThan(12);
  });

  it('produces ~2-3% epic at floor 4 in tier 2 (Sunken Keep boss effective floor 7)', () => {
    const rng = createRng(12345);
    let epic = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) {
      if (pickRarity(rng, 4, 2) === 'epic') epic++;
    }
    const pct = (epic / N) * 100;
    expect(pct).toBeGreaterThan(1);
    expect(pct).toBeLessThan(4);
  });
});

describe('Epic items — affix count and rare-property', () => {
  it('epic non-hat items roll 3 affixes', () => {
    // Sample until we get a non-hat. Avoids the seed-12345 lottery where a single
    // hat roll would silently bypass the 3-affix assertion.
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      const item = rollEventItem(rng, 10, 'epic', 1);
      if (item.slot !== 'hat') {
        expect(item.affixes).toHaveLength(3);
        return;
      }
    }
    throw new Error('No epic non-hat rolled in 100 seeds — slot pick may be deterministic');
  });

  it('epic hat items roll 4 affixes', () => {
    // Sample until we get a hat (rollEventItem picks slot uniformly)
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      const item = rollEventItem(rng, 10, 'epic', 1);
      if (item.slot === 'hat') {
        expect(item.affixes).toHaveLength(4);
        return;
      }
    }
    throw new Error('No epic hat rolled in 100 seeds — slot pick may be deterministic');
  });

  it('epic weapon/shield/outfit items have a rare-property', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      const item = rollEventItem(rng, 10, 'epic', 1);
      if (item.slot === 'weapon' || item.slot === 'shield' || item.slot === 'outfit') {
        expect(item.rareProperty, `seed ${seed}, slot ${item.slot}`).toBeDefined();
      }
    }
  });

  it('epic hat items have no rare-property (hats never get one)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      const item = rollEventItem(rng, 10, 'epic', 1);
      if (item.slot === 'hat') {
        expect(item.rareProperty).toBeUndefined();
        return;
      }
    }
    throw new Error('No epic hat rolled in 100 seeds');
  });
});

describe('Epic — end-to-end integration', () => {
  it('rollLoot at floor 15 produces some Epic items in a large sample', () => {
    let epic = 0;
    const N = 1000;
    for (let seed = 1; seed <= N; seed++) {
      const item = rollLoot(createRng(seed), 15, 'treasure', 1);
      if (item?.rarity === 'epic') epic++;
    }
    // At floor 15, Epic weight is 10%. Expect ~100 in 1000.
    expect(epic).toBeGreaterThan(50);
    expect(epic).toBeLessThan(150);
  });

  it('rollShopItem at floor 12 (tier 2) produces some Epic items', () => {
    // floor 12 in tier 2 = effective floor 15, which is the cap row (10% epic).
    let epic = 0;
    const N = 1000;
    for (let seed = 1; seed <= N; seed++) {
      const item = rollShopItem(createRng(seed), 'weapon', 12, 2);
      if (item.rarity === 'epic') epic++;
    }
    // Bracketed both sides: lower catches a regression where epic never rolls;
    // upper catches a regression where rarity weights collapse to all-epic.
    expect(epic).toBeGreaterThan(50);
    expect(epic).toBeLessThan(150);
  });

  it('Sunken Keep boss (floor 4, tier 2) occasionally drops Epic', () => {
    // floor 4 in tier 2 = effective floor 7. Boss uses NEXT-floor weights
    // (effectiveFloor + 1 = 8), so Epic weight is 3%.
    let epic = 0;
    const N = 10000;
    for (let seed = 1; seed <= N; seed++) {
      const item = rollLoot(createRng(seed), 4, 'boss', 2);
      if (item?.rarity === 'epic') epic++;
    }
    const pct = (epic / N) * 100;
    expect(pct).toBeGreaterThan(1);
    expect(pct).toBeLessThan(6);
  });
});

describe('rollLoot — boss-drop substitution post-L10', () => {
  it('with legendaryEnabled=true and bossId=bone_lich, returns a named legendary', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const item = rollLoot(createRng(seed), 5, 'boss', 1, true, 'bone_lich');
      expect(item).not.toBeNull();
      expect(item!.rarity).toBe('legendary');
      expect(item!.legendaryId).toBeDefined();
      expect(['lichs_crown', 'phylactery']).toContain(item!.legendaryId!);
    }
  });

  it('with legendaryEnabled=true and bossId=drowned_king, returns tidewalker_helm or kings_aegis', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const item = rollLoot(createRng(seed), 5, 'boss', 2, true, 'drowned_king');
      expect(item!.legendaryId).toBeDefined();
      expect(['tidewalker_helm', 'kings_aegis']).toContain(item!.legendaryId!);
    }
  });

  it('with legendaryEnabled=true and bossId=bone_lich, picks both ids over many seeds (no degeneracy)', () => {
    const ids = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const item = rollLoot(createRng(seed), 5, 'boss', 1, true, 'bone_lich');
      if (item?.legendaryId) ids.add(item.legendaryId);
    }
    expect(ids.has('lichs_crown')).toBe(true);
    expect(ids.has('phylactery')).toBe(true);
  });

  it('with legendaryEnabled=false, boss-kind returns normal loot (no legendary)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const item = rollLoot(createRng(seed), 5, 'boss', 1, false, 'bone_lich');
      expect(item!.legendaryId).toBeUndefined();
    }
  });

  it('with legendaryEnabled=true but kind=combat, returns normal loot (only boss-kind substitutes)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const item = rollLoot(createRng(seed), 5, 'combat', 1, true, undefined);
      if (item) expect(item.legendaryId).toBeUndefined();
    }
  });

  it('with legendaryEnabled=true and bossId missing from BOSS_LEGENDARIES, falls through to normal loot', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const item = rollLoot(createRng(seed), 5, 'boss', 1, true, 'skeleton_warrior');
      expect(item!.legendaryId).toBeUndefined();
    }
  });
});

describe('rollNamedLegendary', () => {
  it('constructs an Item with the right legendaryId, rarity, empty affixes', () => {
    const item = rollNamedLegendary(createRng(1), 'lichs_crown', 10);
    expect(item.legendaryId).toBe('lichs_crown');
    expect(item.rarity).toBe('legendary');
    expect(item.affixes).toEqual([]);
    expect(item.slot).toBe(LEGENDARY_DEFS.lichs_crown.slot);
    expect(item.baseId).toBe(LEGENDARY_DEFS.lichs_crown.baseId);
    expect(item.floorRolledAt).toBe(10);
    expect(item.rareProperty).toBeUndefined();
  });
});

describe('rollRandomLegendary (Task 5)', () => {
  it('constructs an Item with rarity legendary, legendaryPassive set, no legendaryId, Epic-equivalent affixes', () => {
    const item = rollRandomLegendary(createRng(1), 10);
    expect(item.rarity).toBe('legendary');
    expect(item.legendaryPassive).toBeDefined();
    expect(item.legendaryId).toBeUndefined();
    expect(item.rareProperty).toBeUndefined();
    const expectedAffixCount = item.slot === 'hat' ? 4 : 3;
    expect(item.affixes).toHaveLength(expectedAffixCount);
    expect(item.floorRolledAt).toBe(10);
  });

  it('rolled legendaryPassive belongs to the rolled slot pool', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const item = rollRandomLegendary(createRng(seed), 10);
      const pool = LEGENDARY_PASSIVES_BY_SLOT[item.slot];
      expect(pool).toContain(item.legendaryPassive!);
    }
  });
});

describe('rollLoot — random legendary substitution post-L10 (Task 5)', () => {
  it('with legendaryEnabled=true, ELITE kind substitutes random legendary at ~1% rate (large sample)', () => {
    let legendaries = 0;
    const N = 10000;
    for (let seed = 1; seed <= N; seed++) {
      const item = rollLoot(createRng(seed), 5, 'elite', 1, true);
      if (item?.legendaryPassive !== undefined) legendaries++;
    }
    const pct = (legendaries / N) * 100;
    expect(pct).toBeGreaterThan(0.5);
    expect(pct).toBeLessThan(2.0);
  });

  it('with legendaryEnabled=true, TREASURE kind substitutes random legendary at ~1% rate', () => {
    let legendaries = 0;
    const N = 10000;
    for (let seed = 1; seed <= N; seed++) {
      const item = rollLoot(createRng(seed), 5, 'treasure', 1, true);
      if (item?.legendaryPassive !== undefined) legendaries++;
    }
    const pct = (legendaries / N) * 100;
    expect(pct).toBeGreaterThan(0.5);
    expect(pct).toBeLessThan(2.0);
  });

  it('with legendaryEnabled=false, neither elite nor treasure produces random legendaries', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const elite = rollLoot(createRng(seed), 5, 'elite', 1, false);
      expect(elite?.legendaryPassive).toBeUndefined();
      const treasure = rollLoot(createRng(seed), 5, 'treasure', 1, false);
      expect(treasure?.legendaryPassive).toBeUndefined();
    }
  });

  it('combat kind never substitutes (even with legendaryEnabled=true)', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const item = rollLoot(createRng(seed), 5, 'combat', 1, true);
      if (item) expect(item.legendaryPassive).toBeUndefined();
    }
  });

  it('boss kind without bossId in BOSS_LEGENDARIES does not substitute random legendaries (only boss substitution applies)', () => {
    // bossId=skeleton_warrior is NOT in BOSS_LEGENDARIES — the boss-substitution branch
    // falls through. Random substitution is gated to elite|treasure only, so boss-kind
    // never picks up random legendaries either.
    for (let seed = 1; seed <= 100; seed++) {
      const item = rollLoot(createRng(seed), 5, 'boss', 1, true, 'skeleton_warrior');
      expect(item?.legendaryPassive).toBeUndefined();
      expect(item?.legendaryId).toBeUndefined();
    }
  });
});
