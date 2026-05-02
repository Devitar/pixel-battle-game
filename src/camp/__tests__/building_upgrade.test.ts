import { describe, expect, it } from 'vitest';
import { createRoster } from '../roster';
import { createStash } from '../stash';
import { createVault, credit } from '../vault';
import { createDefaultUnlocks } from '@save/save';
import type { SaveFile } from '@save/save';
import { applyBuildingUpgrade } from '../building_upgrade';

function makeBaseState(gold = 1000): SaveFile {
  return {
    version: 1,
    roster: createRoster(),
    vault: credit(createVault(), gold),
    stash: createStash(),
    unlocks: createDefaultUnlocks(),
    buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
  };
}

describe('applyBuildingUpgrade', () => {
  it('Tavern L1 → L2: deducts 200g, bumps level, leaves roster capacity alone', () => {
    const before = makeBaseState();
    const after = applyBuildingUpgrade(before, 'tavern');
    expect(after.buildingLevels.tavern).toBe(2);
    expect(after.vault.gold).toBe(800);  // 1000 - 200
    expect(after.roster.capacity).toBe(12);  // unchanged
  });

  it('Barracks L1 → L2: deducts 200g, bumps level, AND grows roster capacity to 16', () => {
    const before = makeBaseState();
    const after = applyBuildingUpgrade(before, 'barracks');
    expect(after.buildingLevels.barracks).toBe(2);
    expect(after.vault.gold).toBe(800);
    expect(after.roster.capacity).toBe(16);
  });

  it('Barracks L2 → L3 deducts 500g and grows capacity to 20', () => {
    const at_l2: SaveFile = {
      ...makeBaseState(),
      buildingLevels: { tavern: 1, barracks: 2, blacksmith: 1, hospital: 1 },
      roster: { ...createRoster(), capacity: 16 },
    };
    const after = applyBuildingUpgrade(at_l2, 'barracks');
    expect(after.buildingLevels.barracks).toBe(3);
    expect(after.vault.gold).toBe(500);  // 1000 - 500
    expect(after.roster.capacity).toBe(20);
  });

  it('throws when attempting to upgrade past max', () => {
    const at_l3: SaveFile = {
      ...makeBaseState(),
      buildingLevels: { tavern: 3, barracks: 3, blacksmith: 1, hospital: 1 },
    };
    expect(() => applyBuildingUpgrade(at_l3, 'tavern')).toThrow(/already at max/);
    expect(() => applyBuildingUpgrade(at_l3, 'barracks')).toThrow(/already at max/);
  });

  it('throws when insufficient gold (via spend)', () => {
    const broke = makeBaseState(50);  // can't afford 200g upgrade
    expect(() => applyBuildingUpgrade(broke, 'tavern')).toThrow();
  });

  it('Blacksmith / Hospital L1 → null: throws', () => {
    const state = makeBaseState();
    expect(() => applyBuildingUpgrade(state, 'blacksmith')).toThrow(/already at max/);
    expect(() => applyBuildingUpgrade(state, 'hospital')).toThrow(/already at max/);
  });

  it('does not mutate input state', () => {
    const before = makeBaseState();
    const snapshot = JSON.stringify(before);
    applyBuildingUpgrade(before, 'tavern');
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
