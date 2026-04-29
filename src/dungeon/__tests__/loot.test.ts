import { describe, expect, it } from 'vitest';
import { createRng } from '../../util/rng';
import { rollLoot } from '../loot';

describe('rollLoot — drop gate', () => {
  it('returns null roughly half the time at a non-boss combat node', () => {
    let drops = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      if (rollLoot(createRng(seed), 1, 'combat') !== null) drops += 1;
    }
    expect(drops).toBeGreaterThanOrEqual(400);
    expect(drops).toBeLessThanOrEqual(600);
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
  it('non-rare items never have rareProperty', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const item = rollLoot(createRng(seed), 5, 'boss');
      if (item && item.rarity !== 'rare') {
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

  it('exports CombatKind type accepting combat | elite | boss', () => {
    const r1 = rollLoot(createRng(1), 1, 'combat');
    const r2 = rollLoot(createRng(1), 1, 'elite');
    const r3 = rollLoot(createRng(1), 1, 'boss');
    expect([r1, r2, r3].every((r) => r === null || typeof r === 'object')).toBe(true);
  });
});
