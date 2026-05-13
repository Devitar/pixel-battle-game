import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, migrate } from '../migration';
import type { SaveFile } from '../save';

describe('migrate', () => {
  it('returns the input as-is when version matches CURRENT_SCHEMA_VERSION', () => {
    const raw = {
      version: CURRENT_SCHEMA_VERSION,
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      unlocks: { classes: ['knight'], dungeons: ['crypt'] },
    };
    expect(migrate(raw)).toEqual(raw);
  });

  it('returns null when no migration exists for an older version', () => {
    const raw = { version: 0, roster: {}, vault: {} };
    expect(migrate(raw)).toBeNull();
  });

  it('v1 → v2: adds campRngState (a number) and bumps version', () => {
    const v1 = {
      version: 1,
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      unlocks: { classes: ['knight'], dungeons: ['crypt'] },
    };
    const result = migrate(v1) as unknown as { version: number; campRngState: unknown };
    expect(result).not.toBeNull();
    // v1 chains through v2 → v3; final version is CURRENT_SCHEMA_VERSION
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(typeof result.campRngState).toBe('number');
    expect(Number.isFinite(result.campRngState)).toBe(true);
  });

  it('returns null on null input', () => {
    expect(migrate(null)).toBeNull();
  });

  it('returns null on string input', () => {
    expect(migrate('string')).toBeNull();
  });

  it('returns null on number input', () => {
    expect(migrate(42)).toBeNull();
  });

  it('v2 → v3: bumps version, backfills runState.petsDownByHeroId to []', () => {
    const v2 = {
      version: 2,
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      stash: { items: [] },
      unlocks: { classes: ['knight'], dungeons: ['crypt'] },
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
      hospitalTreatmentsRemaining: 0,
      tavernCandidates: [],
      campRngState: 12345,
      runState: {
        dungeonId: 'crypt',
        seed: 1,
        party: [],
        pack: { gold: 0, items: [] },
        currentFloorNumber: 1,
        currentFloorNodes: [],
        currentNodeId: 'start',
        awaitingFork: false,
        status: 'in_dungeon',
        fallen: [],
        lost: [],
        traversedNodeIds: [],
        surprisesThisFloor: 0,
        pendingMilestones: [],
      },
      runRngState: 99999,
    };
    const result = migrate(v2) as unknown as { version: number; runState: { petsDownByHeroId: unknown } };
    expect(result).not.toBeNull();
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.runState.petsDownByHeroId).toEqual([]);
  });

  it('v2 → v3: no runState (camp-only save) just bumps version', () => {
    const v2 = {
      version: 2,
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      stash: { items: [] },
      unlocks: { classes: ['knight'], dungeons: ['crypt'] },
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
      hospitalTreatmentsRemaining: 0,
      tavernCandidates: [],
      campRngState: 12345,
    };
    const result = migrate(v2) as unknown as { version: number; runState: unknown };
    expect(result).not.toBeNull();
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.runState).toBeUndefined();
  });

  it('v3 → v4: Hero.traitId → traitIds; buildingLevels.chapel = 1; unlocks.buildings = []', () => {
    const v3 = {
      version: 3,
      roster: {
        heroes: [
          { id: 'h1', classId: 'knight', traitId: 'stout', xp: 0, level: 1 },
        ],
        capacity: 12,
      },
      vault: { gold: 0 },
      stash: { items: [] },
      unlocks: { classes: ['knight'], dungeons: ['crypt'] },
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
      hospitalTreatmentsRemaining: 0,
      tavernCandidates: [
        { id: 'c1', classId: 'archer', traitId: 'quick', xp: 0, level: 1 },
      ],
      campRngState: 12345,
      runState: {
        dungeonId: 'crypt',
        seed: 1,
        party: [{ id: 'p1', classId: 'priest', traitId: 'wise', xp: 0, level: 1 }],
        fallen: [{ id: 'f1', classId: 'mage', traitId: 'frail', xp: 0, level: 1 }],
        lost: [{ id: 'l1', classId: 'rogue', traitId: 'lucky', xp: 0, level: 1 }],
        pack: { gold: 0, items: [] },
        currentFloorNumber: 1,
        currentFloorNodes: [],
        currentNodeId: 'start',
        awaitingFork: false,
        status: 'in_dungeon',
        traversedNodeIds: [],
        surprisesThisFloor: 0,
        pendingMilestones: [],
        petsDownByHeroId: [],
      },
      runRngState: 99999,
    };
    const result = migrate(v3) as unknown as {
      version: number;
      roster: { heroes: Array<{ traitIds?: string[]; traitId?: string }> };
      tavernCandidates: Array<{ traitIds?: string[] }>;
      runState: {
        party: Array<{ traitIds?: string[] }>;
        fallen: Array<{ traitIds?: string[] }>;
        lost: Array<{ traitIds?: string[] }>;
      };
      buildingLevels: { chapel?: number };
      unlocks: { buildings?: string[] };
    };
    expect(result).not.toBeNull();
    // v3 chains through v4 → v5; final version is CURRENT_SCHEMA_VERSION
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.roster.heroes[0].traitIds).toEqual(['stout']);
    expect(result.roster.heroes[0].traitId).toBeUndefined();
    expect(result.tavernCandidates[0].traitIds).toEqual(['quick']);
    expect(result.runState.party[0].traitIds).toEqual(['wise']);
    expect(result.runState.fallen[0].traitIds).toEqual(['frail']);
    expect(result.runState.lost[0].traitIds).toEqual(['lucky']);
    expect(result.buildingLevels.chapel).toBe(1);
    expect(result.unlocks.buildings).toEqual([]);
  });

  it('v3 → v4: heroes already migrated (defensive) pass through', () => {
    const v3 = {
      version: 3,
      roster: {
        heroes: [{ id: 'h1', classId: 'knight', traitIds: ['stout', 'quick'] }],
        capacity: 12,
      },
      vault: { gold: 0 },
      stash: { items: [] },
      unlocks: { classes: ['knight'], dungeons: ['crypt'] },
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
      hospitalTreatmentsRemaining: 0,
      tavernCandidates: [],
      campRngState: 12345,
    };
    const result = migrate(v3) as unknown as { roster: { heroes: Array<{ traitIds: string[] }> } };
    expect(result.roster.heroes[0].traitIds).toEqual(['stout', 'quick']);
  });

  it('v3 → v4: no runState (camp-only save) bumps version and defaults building/unlocks fields', () => {
    const v3 = {
      version: 3,
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      stash: { items: [] },
      unlocks: { classes: ['knight'], dungeons: ['crypt'] },
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
      hospitalTreatmentsRemaining: 0,
      tavernCandidates: [],
      campRngState: 12345,
    };
    const result = migrate(v3) as unknown as {
      version: number;
      runState?: unknown;
      buildingLevels: { chapel?: number };
      unlocks: { buildings?: string[] };
    };
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.runState).toBeUndefined();
    expect(result.buildingLevels.chapel).toBe(1);
    expect(result.unlocks.buildings).toEqual([]);
  });
});

describe('v4 → v5 migration (Training Grounds)', () => {
  it('adds buildingLevels.training_grounds = 1', () => {
    const raw = {
      version: 4,
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1 },
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      stash: { items: [] },
      unlocks: { classes: ['knight'], dungeons: ['crypt'], buildings: [] },
      hospitalTreatmentsRemaining: 1,
      tavernCandidates: [],
      campRngState: 0,
    };
    const migrated = migrate(raw) as SaveFile;
    expect(migrated.buildingLevels.training_grounds).toBe(1);
  });

  it('adds traineeHeroIds = [null, null] (L1 default)', () => {
    const raw = {
      version: 4,
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1 },
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      stash: { items: [] },
      unlocks: { classes: ['knight'], dungeons: ['crypt'], buildings: [] },
      hospitalTreatmentsRemaining: 1,
      tavernCandidates: [],
      campRngState: 0,
    };
    const migrated = migrate(raw) as SaveFile;
    expect(migrated.traineeHeroIds).toEqual([null, null]);
  });

  it('adds runState.traineeXpBase = 0 when a run is in progress', () => {
    const raw = {
      version: 4,
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1, chapel: 1 },
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      stash: { items: [] },
      unlocks: { classes: ['knight'], dungeons: ['crypt'], buildings: [] },
      hospitalTreatmentsRemaining: 1,
      tavernCandidates: [],
      campRngState: 0,
      runState: {
        dungeonId: 'crypt',
        seed: 0,
        party: [],
        pack: { gold: 0, items: [] },
        currentFloorNumber: 1,
        currentFloorNodes: [],
        currentNodeId: 'start',
        awaitingFork: false,
        status: 'in_dungeon',
        fallen: [],
        lost: [],
        traversedNodeIds: ['start'],
        surprisesThisFloor: 0,
        pendingMilestones: [],
        petsDownByHeroId: [],
      },
      runRngState: 0,
    };
    const migrated = migrate(raw) as SaveFile;
    expect(migrated.runState?.traineeXpBase).toBe(0);
  });

  it('full chain v1 → current produces a valid save', () => {
    const v1raw = {
      version: 1,
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      stash: { items: [] },
      unlocks: { classes: ['knight'], dungeons: ['crypt'] },
      buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
      hospitalTreatmentsRemaining: 1,
      tavernCandidates: [],
    };
    const migrated = migrate(v1raw) as SaveFile;
    expect(migrated.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.buildingLevels.training_grounds).toBe(1);
    expect(migrated.traineeHeroIds).toEqual([null, null]);
  });
});

describe('v5 → v6 migration (hero perk shape: singular → plural)', () => {
  it('migrates pendingPerk:true and perkId:string to arrays', () => {
    const v5: Record<string, unknown> = {
      version: 5,
      roster: {
        heroes: [
          { id: 'h1', classId: 'knight', pendingPerk: true, perkId: 'iron_will' },
          { id: 'h2', classId: 'archer', pendingPerk: false },
        ],
      },
      tavernCandidates: [
        { id: 'c1', classId: 'priest', pendingPerk: false },
      ],
    };
    const out = migrate(v5) as unknown as Record<string, unknown>;
    expect(out.version).toBe(CURRENT_SCHEMA_VERSION);
    const heroes = (out.roster as { heroes: Array<Record<string, unknown>> }).heroes;
    expect(heroes[0].pendingPerks).toEqual(['l5']);
    expect(heroes[0].pickedPerks).toEqual(['iron_will']);
    expect(heroes[0].pendingPerk).toBeUndefined();
    expect(heroes[0].perkId).toBeUndefined();
    expect(heroes[1].pendingPerks).toEqual([]);
    expect(heroes[1].pickedPerks).toEqual([]);
    const candidates = out.tavernCandidates as Array<Record<string, unknown>>;
    expect(candidates[0].pendingPerks).toEqual([]);
    expect(candidates[0].pickedPerks).toEqual([]);
  });

  it('migrates runState.party / fallen / lost heroes too', () => {
    const v5 = {
      version: 5,
      roster: { heroes: [] },
      runState: {
        party: [{ id: 'h1', classId: 'knight', pendingPerk: true, perkId: 'iron_will' }],
        fallen: [{ id: 'h2', classId: 'archer', pendingPerk: false, perkId: 'precise' }],
        lost: [{ id: 'h3', classId: 'priest', pendingPerk: true }],
      },
    };
    const out = migrate(v5) as unknown as Record<string, unknown>;
    const party = ((out.runState as Record<string, unknown>).party) as Array<Record<string, unknown>>;
    expect(party[0].pendingPerks).toEqual(['l5']);
    expect(party[0].pickedPerks).toEqual(['iron_will']);
    const fallen = ((out.runState as Record<string, unknown>).fallen) as Array<Record<string, unknown>>;
    expect(fallen[0].pickedPerks).toEqual(['precise']);
    expect(fallen[0].pendingPerks).toEqual([]);
    const lost = ((out.runState as Record<string, unknown>).lost) as Array<Record<string, unknown>>;
    expect(lost[0].pendingPerks).toEqual(['l5']);
    expect(lost[0].pickedPerks).toEqual([]);
  });

  it('is idempotent if applied to an already-v6 save', () => {
    const v6 = {
      version: 6,
      roster: { heroes: [{ id: 'h1', pendingPerks: ['l5'], pickedPerks: [] }] },
    };
    const out = migrate(v6) as unknown as Record<string, unknown>;
    // v6 chains through v7; final version is CURRENT_SCHEMA_VERSION
    expect(out.version).toBe(CURRENT_SCHEMA_VERSION);
    const heroes = (out.roster as { heroes: Array<Record<string, unknown>> }).heroes;
    expect(heroes[0].pendingPerks).toEqual(['l5']);
  });
});

describe('v6 → v7 migration (legendaryEnabled unlock flag)', () => {
  it('adds unlocks.legendaryEnabled = false to existing saves', () => {
    const v6: Record<string, unknown> = {
      version: 6,
      roster: { heroes: [] },
      unlocks: { classes: [], dungeons: [], buildings: [] },
    };
    const out = migrate(v6) as unknown as Record<string, unknown>;
    expect(out.version).toBe(7);
    const unlocks = out.unlocks as Record<string, unknown>;
    expect(unlocks.legendaryEnabled).toBe(false);
  });

  it('preserves an existing legendaryEnabled value on a freshly-migrated save', () => {
    const v6: Record<string, unknown> = {
      version: 6,
      roster: { heroes: [] },
      unlocks: { classes: [], dungeons: [], buildings: [], legendaryEnabled: true },
    };
    const out = migrate(v6) as unknown as Record<string, unknown>;
    expect(out.version).toBe(7);
    const unlocks = out.unlocks as Record<string, unknown>;
    expect(unlocks.legendaryEnabled).toBe(true);
  });

  it('is idempotent on a v7 save', () => {
    const v7: Record<string, unknown> = {
      version: 7,
      unlocks: { classes: [], dungeons: [], buildings: [], legendaryEnabled: true },
    };
    const out = migrate(v7) as unknown as Record<string, unknown>;
    expect(out.version).toBe(7);
    expect((out.unlocks as Record<string, unknown>).legendaryEnabled).toBe(true);
  });
});
