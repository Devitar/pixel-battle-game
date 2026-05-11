import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, migrate } from '../migration';

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
    expect(result.version).toBe(4);
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
    expect(result.version).toBe(4);
    expect(result.runState).toBeUndefined();
    expect(result.buildingLevels.chapel).toBe(1);
    expect(result.unlocks.buildings).toEqual([]);
  });
});
