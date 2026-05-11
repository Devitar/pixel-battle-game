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
    buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1, training_grounds: 1 },
    hospitalTreatmentsRemaining: 1,
    tavernCandidates: [],
    traineeHeroIds: [null, null],
    campRngState: 0,
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
      buildingLevels: { tavern: 1, barracks: 2, blacksmith: 1, hospital: 1, chapel: 1, training_grounds: 1 },
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
      buildingLevels: { tavern: 3, barracks: 3, blacksmith: 1, hospital: 1, chapel: 1, training_grounds: 1 },
    };
    expect(() => applyBuildingUpgrade(at_l3, 'tavern')).toThrow(/already at max/);
    expect(() => applyBuildingUpgrade(at_l3, 'barracks')).toThrow(/already at max/);
  });

  it('throws when insufficient gold (via spend)', () => {
    const broke = makeBaseState(50);  // can't afford 200g upgrade
    expect(() => applyBuildingUpgrade(broke, 'tavern')).toThrow();
  });

  it('Blacksmith L1 → L2: deducts 200g, bumps level, leaves roster capacity alone', () => {
    const before = makeBaseState();
    const after = applyBuildingUpgrade(before, 'blacksmith');
    expect(after.buildingLevels.blacksmith).toBe(2);
    expect(after.vault.gold).toBe(800);
    expect(after.roster.capacity).toBe(12);
  });

  it('Blacksmith L2 throws (L3 waits on epic rarity)', () => {
    const at_l2: SaveFile = {
      ...makeBaseState(),
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 2, hospital: 1, chapel: 1, training_grounds: 1 },
    };
    expect(() => applyBuildingUpgrade(at_l2, 'blacksmith')).toThrow(/already at max/);
  });

  it('Hospital L1 → L2: deducts 200g, bumps level, refills treatments to new cap (2)', () => {
    const before: SaveFile = { ...makeBaseState(), hospitalTreatmentsRemaining: 0 };
    const after = applyBuildingUpgrade(before, 'hospital');
    expect(after.buildingLevels.hospital).toBe(2);
    expect(after.vault.gold).toBe(800);
    expect(after.hospitalTreatmentsRemaining).toBe(2);
  });

  it('Hospital L2 → L3: deducts 500g and refills treatments to new cap (3)', () => {
    const at_l2: SaveFile = {
      ...makeBaseState(),
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 2, chapel: 1, training_grounds: 1 },
      hospitalTreatmentsRemaining: 1,
    };
    const after = applyBuildingUpgrade(at_l2, 'hospital');
    expect(after.buildingLevels.hospital).toBe(3);
    expect(after.vault.gold).toBe(500);
    expect(after.hospitalTreatmentsRemaining).toBe(3);
  });

  it('Hospital L3 throws (max level)', () => {
    const at_l3: SaveFile = {
      ...makeBaseState(),
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 3, chapel: 1, training_grounds: 1 },
    };
    expect(() => applyBuildingUpgrade(at_l3, 'hospital')).toThrow(/already at max/);
  });

  it('non-hospital upgrades leave hospitalTreatmentsRemaining alone', () => {
    const before: SaveFile = { ...makeBaseState(), hospitalTreatmentsRemaining: 0 };
    const after = applyBuildingUpgrade(before, 'tavern');
    expect(after.hospitalTreatmentsRemaining).toBe(0);
  });

  it('does not mutate input state', () => {
    const before = makeBaseState();
    const snapshot = JSON.stringify(before);
    applyBuildingUpgrade(before, 'tavern');
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
