import { describe, expect, it } from 'vitest';
import {
  BUILDING_LEVELS,
  BARRACKS_CAPACITY,
  hospitalTickAmount,
  hospitalTreatmentCap,
  nextLevel,
  tavernCandidateCount,
} from '../building_levels';

describe('BUILDING_LEVELS shape', () => {
  it('all four building IDs have at least L1', () => {
    expect(BUILDING_LEVELS.tavern[0]?.level).toBe(1);
    expect(BUILDING_LEVELS.barracks[0]?.level).toBe(1);
    expect(BUILDING_LEVELS.blacksmith[0]?.level).toBe(1);
    expect(BUILDING_LEVELS.hospital[0]?.level).toBe(1);
  });

  it('L1 always has zero upgrade cost', () => {
    for (const tiers of Object.values(BUILDING_LEVELS)) {
      expect(tiers[0]?.upgradeCost).toBe(0);
    }
  });
});

describe('nextLevel', () => {
  it('Tavern L1 → L2 def with upgrade cost', () => {
    expect(nextLevel('tavern', 1)?.level).toBe(2);
    expect(nextLevel('tavern', 1)?.upgradeCost).toBe(200);
  });

  it('Tavern L2 → L3 def with upgrade cost', () => {
    expect(nextLevel('tavern', 2)?.level).toBe(3);
    expect(nextLevel('tavern', 2)?.upgradeCost).toBe(500);
  });

  it('Tavern L3 → null (max level)', () => {
    expect(nextLevel('tavern', 3)).toBeNull();
  });

  it('Barracks parallel: L1 → L2, L3 → null', () => {
    expect(nextLevel('barracks', 1)?.level).toBe(2);
    expect(nextLevel('barracks', 3)).toBeNull();
  });

  it('Blacksmith L1 → L2 def (Common→Rare unlock at 200g)', () => {
    expect(nextLevel('blacksmith', 1)?.level).toBe(2);
    expect(nextLevel('blacksmith', 1)?.upgradeCost).toBe(200);
    expect(nextLevel('blacksmith', 1)?.unlockDescription).toBe('Common → Rare');
  });

  it('Blacksmith L2 → null (L3 waits on epic rarity)', () => {
    expect(nextLevel('blacksmith', 2)).toBeNull();
  });

  it('Hospital L1 → L2 def (2 treatments/run at 200g)', () => {
    expect(nextLevel('hospital', 1)?.level).toBe(2);
    expect(nextLevel('hospital', 1)?.upgradeCost).toBe(200);
  });

  it('Hospital L2 → L3 def (3 treatments/run + 2× time-heal at 500g)', () => {
    expect(nextLevel('hospital', 2)?.level).toBe(3);
    expect(nextLevel('hospital', 2)?.upgradeCost).toBe(500);
  });

  it('Hospital L3 → null (max level)', () => {
    expect(nextLevel('hospital', 3)).toBeNull();
  });
});

describe('hospitalTreatmentCap', () => {
  it('L1 → 1, L2 → 2, L3 → 3', () => {
    expect(hospitalTreatmentCap(1)).toBe(1);
    expect(hospitalTreatmentCap(2)).toBe(2);
    expect(hospitalTreatmentCap(3)).toBe(3);
  });
});

describe('hospitalTickAmount', () => {
  it('L1 / L2 → 1 tick per run-end; L3 → 2', () => {
    expect(hospitalTickAmount(1)).toBe(1);
    expect(hospitalTickAmount(2)).toBe(1);
    expect(hospitalTickAmount(3)).toBe(2);
  });
});

describe('tavernCandidateCount', () => {
  it('L1 → 3, L2 → 4, L3 → 5', () => {
    expect(tavernCandidateCount(1)).toBe(3);
    expect(tavernCandidateCount(2)).toBe(4);
    expect(tavernCandidateCount(3)).toBe(5);
  });
});

describe('BARRACKS_CAPACITY', () => {
  it('covers all three levels with the gdd-specified counts', () => {
    expect(BARRACKS_CAPACITY[1]).toBe(12);
    expect(BARRACKS_CAPACITY[2]).toBe(16);
    expect(BARRACKS_CAPACITY[3]).toBe(20);
  });
});
