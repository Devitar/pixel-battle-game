import type { BuildingId, BuildingLevel, SaveFile } from '@save/save';
import { BARRACKS_CAPACITY, hospitalTreatmentCap, nextLevel } from './building_levels';
import { spend } from './vault';

export function applyBuildingUpgrade(state: SaveFile, building: BuildingId): SaveFile {
  const current = state.buildingLevels[building];
  const next = nextLevel(building, current);
  if (next === null) {
    throw new Error(`applyBuildingUpgrade: ${building} already at max level ${current}`);
  }
  // spend() throws if insufficient gold; affordability checks at the UI layer
  // are convenience-not-correctness, so we re-validate here.
  const newVault = spend(state.vault, next.upgradeCost);
  const newLevel: BuildingLevel = next.level;
  const newBuildingLevels = { ...state.buildingLevels, [building]: newLevel };
  // Barracks-specific side effect: roster capacity grows.
  const newRoster = building === 'barracks'
    ? { ...state.roster, capacity: BARRACKS_CAPACITY[newLevel] }
    : state.roster;
  // Hospital-specific side effect: refill treatment counter to the new cap so
  // the upgrade is felt immediately (otherwise an upgrade mid-run-cycle is
  // invisible until the next run-end).
  const newTreatments = building === 'hospital'
    ? hospitalTreatmentCap(newLevel)
    : state.hospitalTreatmentsRemaining;
  return {
    ...state,
    vault: newVault,
    buildingLevels: newBuildingLevels,
    roster: newRoster,
    hospitalTreatmentsRemaining: newTreatments,
  };
}
