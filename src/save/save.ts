import { HIRE_COST } from '@camp/buildings/tavern';
import type { Roster } from '@camp/roster';
import { createStash, type Stash } from '@camp/stash';
import type { Vault } from '@camp/vault';
import { DEFAULT_FEET_SPRITE, DEFAULT_LEGS_SPRITE } from '@data/body_sprites';
import type { Unlocks } from '@data/types';
import type { Hero } from '@heroes/hero';
import { PARTY_SIZE, type RunState } from '@run/run_state';
import { CURRENT_SCHEMA_VERSION, migrate } from './migration';

export { CURRENT_SCHEMA_VERSION } from './migration';
export const STORAGE_KEY = 'pixel-battle-game/save';

export type BuildingId = 'tavern' | 'barracks' | 'blacksmith' | 'hospital';
export type BuildingLevel = 1 | 2 | 3;
export type BuildingLevels = Record<BuildingId, BuildingLevel>;

export interface SaveFile {
  version: number;
  roster: Roster;
  vault: Vault;
  stash: Stash;
  unlocks: Unlocks;
  buildingLevels: BuildingLevels;
  hospitalTreatmentsRemaining: number;
  tavernCandidates: readonly Hero[];
  runState?: RunState;
  runRngState?: number;
  preferences?: Preferences;
}

export interface Preferences {
  combatSpeed: 1 | 3;
  walkSpeed?: 1 | 3;
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
  if (!migrated) {
    console.warn(
      `load: discarding save with unsupported version ${versioned.version} (current is ${CURRENT_SCHEMA_VERSION})`,
    );
    return null;
  }

  if ((migrated.runState === undefined) !== (migrated.runRngState === undefined)) {
    console.warn('load: runState/runRngState pairing invariant violated; discarding run');
    return normalizeSaveFile({ ...migrated, runState: undefined, runRngState: undefined });
  }

  return normalizeSaveFile(migrated);
}

export function clearSave(storage: Storage): void {
  storage.removeItem(STORAGE_KEY);
}

// Save is softlocked when the player can't recruit (vault < HIRE_COST) AND
// can't field an expedition (roster < PARTY_SIZE). Tavern unlocks free hires
// while in this state; Camp scene surfaces a Reset Camp escape hatch.
export function isSoftlocked(state: SaveFile): boolean {
  return state.vault.gold < HIRE_COST && state.roster.heroes.length < PARTY_SIZE;
}

export function createDefaultUnlocks(): Unlocks {
  return {
    classes: ['knight', 'archer', 'priest', 'barbarian', 'rogue', 'mage'],
    dungeons: ['crypt'],
  };
}

function isPlausibleRawSave(parsed: unknown): parsed is { version: number } {
  if (typeof parsed !== 'object' || parsed === null) return false;
  const v = (parsed as Record<string, unknown>).version;
  return typeof v === 'number' && Number.isFinite(v) && v >= 1;
}

// Pre-launch policy: schema stays at 1 and we add new fields without bumps.
// Old v1 saves predating a field need defaults to be loadable. This is the
// single point of defaulting; do not scatter `?? createStash()` reads elsewhere.
function normalizeSaveFile(file: SaveFile): SaveFile {
  return {
    ...file,
    stash: file.stash ?? createStash(),
    buildingLevels: file.buildingLevels ?? { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
    hospitalTreatmentsRemaining: file.hospitalTreatmentsRemaining ?? 1,
    tavernCandidates: file.tavernCandidates ?? [],
    roster: {
      ...file.roster,
      heroes: file.roster.heroes.map(normalizeHero),
    },
    runState: file.runState === undefined
      ? undefined
      : {
          ...file.runState,
          lost: file.runState.lost ?? [],
          traversedNodeIds: file.runState.traversedNodeIds ?? [file.runState.currentNodeId],
        },
  };
}

function normalizeHero(hero: Hero): Hero {
  return {
    ...hero,
    xp: hero.xp ?? 0,
    level: hero.level ?? 1,
    pendingPerk: hero.pendingPerk ?? false,
    legsSpriteId: hero.legsSpriteId ?? DEFAULT_LEGS_SPRITE,
    feetSpriteId: hero.feetSpriteId ?? DEFAULT_FEET_SPRITE,
  };
}
