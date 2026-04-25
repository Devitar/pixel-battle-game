import { addHero, createRoster } from '../camp/roster';
import { createVault, credit } from '../camp/vault';
import { generateStarterRoster } from '../camp/buildings/tavern';
import type { Rng } from '../util/rng';

const STARTER_GOLD = 500;
import {
  CURRENT_SCHEMA_VERSION,
  createDefaultUnlocks,
  load,
  save,
  type SaveFile,
} from './save';

export function resolveSaveState(
  storage: Storage,
  rng: Rng,
): { saveFile: SaveFile; isNew: boolean } {
  const existing = load(storage);
  if (existing) {
    return { saveFile: existing, isNew: false };
  }
  const fresh = createFreshSave(rng);
  save(fresh, storage);
  return { saveFile: fresh, isNew: true };
}

function createFreshSave(rng: Rng): SaveFile {
  const heroes = generateStarterRoster(rng);
  let roster = createRoster();
  for (const hero of heroes) {
    roster = addHero(roster, hero);
  }
  return {
    version: CURRENT_SCHEMA_VERSION,
    roster,
    vault: credit(createVault(), STARTER_GOLD),
    unlocks: createDefaultUnlocks(),
  };
}
