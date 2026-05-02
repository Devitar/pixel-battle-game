import { describe, expect, it, vi } from 'vitest';
import { createRoster } from '@camp/roster';
import { createStash } from '@camp/stash';
import { createVault, credit } from '@camp/vault';
import type { RunState } from '@run/run_state';
import {
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEY,
  clearSave,
  createDefaultUnlocks,
  load,
  save,
  type SaveFile,
} from '../save';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  key(index: number): string | null { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, value); }
}

function makeBaseSave(): SaveFile {
  return {
    version: CURRENT_SCHEMA_VERSION,
    roster: createRoster(),
    vault: credit(createVault(), 100),
    stash: createStash(),
    unlocks: createDefaultUnlocks(),
    buildingLevels: { tavern: 1, barracks: 1, blacksmith: 1, hospital: 1 },
  };
}

describe('save / load roundtrip', () => {
  it('preserves roster, vault, unlocks (no run)', () => {
    const storage = new MemoryStorage();
    const original = makeBaseSave();
    save(original, storage);
    const loaded = load(storage);
    expect(loaded).toEqual(original);
  });

  it('preserves an in-progress run with rng state', () => {
    const storage = new MemoryStorage();
    const fakeRunState: RunState = {
      dungeonId: 'crypt',
      seed: 1,
      party: [],
      pack: { gold: 50, items: [] },
      currentFloorNumber: 1,
      currentFloorNodes: [],
      currentNodeId: '',
      awaitingFork: false,
      status: 'in_dungeon',
      fallen: [],
      lost: [],
    };
    const original: SaveFile = {
      ...makeBaseSave(),
      runState: fakeRunState,
      runRngState: 1234567,
    };
    save(original, storage);
    const loaded = load(storage);
    expect(loaded?.runState).toEqual(fakeRunState);
    expect(loaded?.runRngState).toBe(1234567);
  });

  it('save throws if runState present without runRngState', () => {
    const storage = new MemoryStorage();
    const fakeRunState: RunState = {
      dungeonId: 'crypt',
      seed: 1,
      party: [],
      pack: { gold: 0, items: [] },
      currentFloorNumber: 1,
      currentFloorNodes: [],
      currentNodeId: '',
      awaitingFork: false,
      status: 'in_dungeon',
      fallen: [],
      lost: [],
    };
    const data: SaveFile = { ...makeBaseSave(), runState: fakeRunState };
    expect(() => save(data, storage)).toThrow();
  });

  it('save throws if runRngState present without runState', () => {
    const storage = new MemoryStorage();
    const data: SaveFile = { ...makeBaseSave(), runRngState: 42 };
    expect(() => save(data, storage)).toThrow();
  });

  it('round-trips preferences.combatSpeed', () => {
    const storage = new MemoryStorage();
    const original: SaveFile = {
      ...makeBaseSave(),
      preferences: { combatSpeed: 3 },
    };
    save(original, storage);
    const loaded = load(storage);
    expect(loaded?.preferences).toEqual({ combatSpeed: 3 });
  });

  it('loads an old save without preferences (field is optional)', () => {
    const storage = new MemoryStorage();
    save(makeBaseSave(), storage);
    const loaded = load(storage);
    expect(loaded).not.toBeNull();
    expect(loaded?.preferences).toBeUndefined();
  });
});

describe('load — missing / corrupt', () => {
  it('returns null when no save exists', () => {
    const storage = new MemoryStorage();
    expect(load(storage)).toBeNull();
  });

  it('returns null and warns on corrupt JSON', () => {
    const storage = new MemoryStorage();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.setItem(STORAGE_KEY, 'not valid json {{{');
    expect(load(storage)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns null and warns on shape mismatch (missing version)', () => {
    const storage = new MemoryStorage();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.setItem(STORAGE_KEY, JSON.stringify({ roster: {}, vault: {} }));
    expect(load(storage)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns null on future version', () => {
    const storage = new MemoryStorage();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...makeBaseSave(), version: 999 }));
    expect(load(storage)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('drops the run on pairing invariant violation in stored data', () => {
    const storage = new MemoryStorage();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...makeBaseSave(), runRngState: 42 }),
    );
    const loaded = load(storage);
    expect(loaded).not.toBeNull();
    expect(loaded?.runState).toBeUndefined();
    expect(loaded?.runRngState).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('clearSave', () => {
  it('removes the save key', () => {
    const storage = new MemoryStorage();
    save(makeBaseSave(), storage);
    expect(load(storage)).not.toBeNull();
    clearSave(storage);
    expect(load(storage)).toBeNull();
  });
});

describe('createDefaultUnlocks', () => {
  it('includes the six launch classes and Crypt', () => {
    const u = createDefaultUnlocks();
    expect([...u.classes].sort()).toEqual(['archer', 'barbarian', 'knight', 'mage', 'priest', 'rogue']);
    expect(u.dungeons).toEqual(['crypt']);
  });
});

describe('stash persistence', () => {
  it('round-trips an empty stash', () => {
    const storage = new MemoryStorage();
    save(makeBaseSave(), storage);
    const loaded = load(storage);
    expect(loaded?.stash).toEqual({ items: [] });
  });

  it('older v1 save without stash field defaults to empty stash on load', () => {
    const storage = new MemoryStorage();
    const stale = {
      version: CURRENT_SCHEMA_VERSION,
      roster: createRoster(),
      vault: { gold: 0 },
      unlocks: createDefaultUnlocks(),
      // no stash field — pre-Task-17 save shape
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(stale));
    const loaded = load(storage);
    expect(loaded?.stash).toEqual({ items: [] });
  });
});

describe('load — buildingLevels normalizer', () => {
  it('fills in default buildingLevels for old saves missing the field', () => {
    const storage = new MemoryStorage();
    // Construct an old-shape save without buildingLevels, written directly to storage.
    const oldShape = {
      version: 1,
      roster: createRoster(),
      vault: createVault(),
      stash: createStash(),
      unlocks: createDefaultUnlocks(),
      // no buildingLevels field
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(oldShape));
    const loaded = load(storage);
    expect(loaded?.buildingLevels).toEqual({
      tavern: 1, barracks: 1, blacksmith: 1, hospital: 1,
    });
  });
});

describe('load — normalize legacy heroes missing xp/level/pendingPerk', () => {
  it('fills defaults on heroes from a save predating leveling', () => {
    const storage = new MemoryStorage();
    const legacyHero = {
      id: 'h0',
      classId: 'knight' as const,
      name: 'Old Hero',
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 5, dodge: 5 },
      currentHp: 20,
      maxHp: 20,
      traitId: 'stout' as const,
      bodySpriteId: 'body1',
      wounds: [],
      equipment: {
        weapon: {
          id: 'w0',
          baseId: 'sword_basic' as const,
          slot: 'weapon' as const,
          rarity: 'common' as const,
          weaponType: 'sword' as const,
          affixes: [],
          floorRolledAt: 1,
        },
      },
      // xp / level / pendingPerk intentionally absent
    };
    const legacy = {
      version: 1,
      roster: { heroes: [legacyHero], capacity: 12 },
      vault: { gold: 0 },
      stash: createStash(),
      unlocks: createDefaultUnlocks(),
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(legacy));

    const loaded = load(storage);
    expect(loaded).not.toBeNull();
    const hero = loaded!.roster.heroes[0];
    expect(hero.xp).toBe(0);
    expect(hero.level).toBe(1);
    expect(hero.pendingPerk).toBe(false);
    expect(hero.perkId).toBeUndefined();
  });
});

describe('save normalizer — runState.lost default', () => {
  it('defaults missing runState.lost to []', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: CURRENT_SCHEMA_VERSION,
      roster: { heroes: [], slots: 12 },
      vault: { gold: 0 },
      stash: createStash(),
      unlocks: { classes: [], dungeons: [] },
      runState: {
        dungeonId: 'crypt',
        seed: 1,
        party: [],
        pack: { gold: 0, items: [] },
        currentFloorNumber: 1,
        currentFloorNodes: [],
        currentNodeId: '',
        awaitingFork: false,
        status: 'in_dungeon',
        fallen: [],
        // NOTE: lost intentionally omitted to simulate a pre-Task-13 save
      },
      runRngState: 12345,
    }));
    const loaded = load(storage);
    expect(loaded).not.toBeNull();
    expect(loaded!.runState).toBeDefined();
    expect(loaded!.runState!.lost).toEqual([]);
  });

  it('preserves an explicit runState.lost array', () => {
    const fakeHero = {
      id: 'h0', classId: 'knight', name: 'K',
      baseStats: { hp: 20, attack: 4, defense: 4, speed: 3, mind: 0, crit: 5, dodge: 5 },
      currentHp: 0, maxHp: 20,
      traitId: 'quick', bodySpriteId: 'body1',
      wounds: [], equipment: {},
      xp: 0, level: 1, pendingPerk: false,
    };
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: CURRENT_SCHEMA_VERSION,
      roster: { heroes: [], slots: 12 },
      vault: { gold: 0 },
      stash: createStash(),
      unlocks: { classes: [], dungeons: [] },
      runState: {
        dungeonId: 'crypt',
        seed: 1,
        party: [],
        pack: { gold: 0, items: [] },
        currentFloorNumber: 1,
        currentFloorNodes: [],
        currentNodeId: '',
        awaitingFork: false,
        status: 'in_dungeon',
        fallen: [],
        lost: [fakeHero],
      },
      runRngState: 12345,
    }));
    const loaded = load(storage);
    expect(loaded!.runState!.lost).toHaveLength(1);
    expect(loaded!.runState!.lost[0].id).toBe('h0');
  });
});
