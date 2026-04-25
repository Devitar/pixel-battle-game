import type { Roster } from '../camp/roster';
import type { Vault } from '../camp/vault';
import type { Unlocks } from '../data/types';
import type { RunState } from '../run/run_state';
import { CURRENT_SCHEMA_VERSION, migrate } from './migration';

export { CURRENT_SCHEMA_VERSION } from './migration';
export const STORAGE_KEY = 'pixel-battle-game/save';

export interface SaveFile {
  version: number;
  roster: Roster;
  vault: Vault;
  unlocks: Unlocks;
  runState?: RunState;
  runRngState?: number;
}

export function save(data: SaveFile, storage: Storage): void {
  if ((data.runState === undefined) !== (data.runRngState === undefined)) {
    throw new Error('save: runState and runRngState must both be present or both absent');
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function load(storage: Storage): SaveFile | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn('load: corrupt save (JSON parse failed)', e);
    return null;
  }

  if (!isPlausibleRawSave(parsed)) {
    console.warn('load: corrupt save (shape mismatch)');
    return null;
  }

  const versioned = parsed as { version: number };
  if (versioned.version > CURRENT_SCHEMA_VERSION) {
    console.warn(
      `load: save version ${versioned.version} is newer than supported ${CURRENT_SCHEMA_VERSION}`,
    );
    return null;
  }

  let migrated: SaveFile | null;
  try {
    migrated = migrate(parsed);
  } catch (e) {
    console.warn('load: migration failed', e);
    return null;
  }
  if (!migrated) return null;

  if ((migrated.runState === undefined) !== (migrated.runRngState === undefined)) {
    console.warn('load: runState/runRngState pairing invariant violated; discarding run');
    return { ...migrated, runState: undefined, runRngState: undefined };
  }

  return migrated;
}

export function clearSave(storage: Storage): void {
  storage.removeItem(STORAGE_KEY);
}

export function createDefaultUnlocks(): Unlocks {
  return {
    classes: ['knight', 'archer', 'priest'],
    dungeons: ['crypt'],
  };
}

function isPlausibleRawSave(parsed: unknown): parsed is { version: number } {
  if (typeof parsed !== 'object' || parsed === null) return false;
  const v = (parsed as Record<string, unknown>).version;
  return typeof v === 'number' && Number.isFinite(v) && v >= 1;
}
