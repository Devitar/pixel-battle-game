import { TRAINEE_SLOT_CAPACITY } from '@camp/building_levels';
import { HIRE_COST } from '@camp/buildings/tavern';
import type { Roster } from '@camp/roster';
import { createStash, type Stash } from '@camp/stash';
import type { Vault } from '@camp/vault';
import { DEFAULT_FEET_SPRITE, DEFAULT_LEGS_SPRITE } from '@data/body_sprites';
import type { BuildingId, Unlocks } from '@data/types';
import type { Hero } from '@heroes/hero';
import { PARTY_SIZE, type RunState } from '@run/run_state';
import { CURRENT_SCHEMA_VERSION, migrate } from './migration';

export { CURRENT_SCHEMA_VERSION } from './migration';
export const STORAGE_KEY = 'pixel-battle-game/save';

export type { BuildingId } from '@data/types';
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
  /** Training Grounds trainee slots. Length matches
   *  `TRAINEE_SLOT_CAPACITY[buildingLevels.training_grounds]`. Each entry is
   *  either a roster hero's id (currently a trainee) or null (empty slot).
   *  Normalized on load: orphan ids (not in roster) are scrubbed to null,
   *  the array is padded/truncated to current capacity. */
  traineeHeroIds: readonly (string | null)[];
  /** Persisted RNG state for camp-side actions (Tavern hire/reroll, Blacksmith
   *  upgrade rolls, expedition-start seeding). Read via createRngFromState,
   *  advanced by the action, written back via rng.getState(). Mirrors the
   *  in-run runRngState pattern; threads determinism across camp→run boundary. */
  campRngState: number;
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
    buildings: [],
  };
}

function isPlausibleRawSave(parsed: unknown): parsed is { version: number } {
  if (typeof parsed !== 'object' || parsed === null) return false;
  const v = (parsed as Record<string, unknown>).version;
  return typeof v === 'number' && Number.isFinite(v) && v >= 1;
}

// Default-pads fields that were added to the v1 schema without a version
// bump (under the now-lifted pre-launch policy). New fields added going
// forward should ship as migrations in `migration.ts` instead, but existing
// defaults here stay until each is folded into an explicit migration.
// Single point of defaulting — do not scatter `?? createStash()` reads.
export function normalizeSaveFile(file: SaveFile): SaveFile {
  const withDefaults: SaveFile = {
    ...file,
    stash: file.stash ?? createStash(),
    buildingLevels: file.buildingLevels ?? {
      tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1, training_grounds: 1,
    },
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
          surprisesThisFloor: file.runState.surprisesThisFloor ?? 0,
          pendingMilestones: file.runState.pendingMilestones ?? [],
          traineeXpBase: file.runState.traineeXpBase ?? 0,
        },
  };
  return {
    ...withDefaults,
    traineeHeroIds: normalizeTraineeSlots(withDefaults),
  };
}

function normalizeHero(hero: Hero): Hero {
  // Legacy saves (pre-traitIds) stored a single `traitId: TraitId` field.
  // Wrap it in an array when upgrading from that shape.
  const raw = hero as Hero & { traitId?: string };
  const traitIds: readonly string[] = hero.traitIds
    ?? (raw.traitId !== undefined ? [raw.traitId] : []);
  return {
    ...hero,
    traitIds: traitIds as Hero['traitIds'],
    xp: hero.xp ?? 0,
    level: hero.level ?? 1,
    pendingPerk: hero.pendingPerk ?? false,
    legsSpriteId: hero.legsSpriteId ?? DEFAULT_LEGS_SPRITE,
    feetSpriteId: hero.feetSpriteId ?? DEFAULT_FEET_SPRITE,
  };
}

// Length-matches traineeHeroIds to TRAINEE_SLOT_CAPACITY[training_grounds level]
// and scrubs any id that no longer corresponds to a roster hero (e.g., hero
// died and was removed from roster). Pads with null when shorter than capacity,
// truncates when longer.
function normalizeTraineeSlots(file: SaveFile): readonly (string | null)[] {
  const level = file.buildingLevels?.training_grounds ?? 1;
  const capacity = TRAINEE_SLOT_CAPACITY[level];
  const rosterIds = new Set(file.roster.heroes.map((h) => h.id));
  const current = file.traineeHeroIds ?? [];
  const scrubbed = current.map((id) => (id !== null && rosterIds.has(id) ? id : null));
  if (scrubbed.length === capacity) return scrubbed;
  if (scrubbed.length < capacity) {
    return [...scrubbed, ...new Array(capacity - scrubbed.length).fill(null)];
  }
  return scrubbed.slice(0, capacity);
}
