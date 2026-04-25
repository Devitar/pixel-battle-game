import { describe, expect, it, vi } from 'vitest';
import { createRoster } from '../../camp/roster';
import { createVault, credit } from '../../camp/vault';
import type { RunState } from '../../run/run_state';
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
    unlocks: createDefaultUnlocks(),
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
      pack: { gold: 50 },
      currentFloorNumber: 1,
      currentFloorNodes: [],
      currentNodeIndex: 0,
      status: 'in_dungeon',
      fallen: [],
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
      pack: { gold: 0 },
      currentFloorNumber: 1,
      currentFloorNodes: [],
      currentNodeIndex: 0,
      status: 'in_dungeon',
      fallen: [],
    };
    const data: SaveFile = { ...makeBaseSave(), runState: fakeRunState };
    expect(() => save(data, storage)).toThrow();
  });

  it('save throws if runRngState present without runState', () => {
    const storage = new MemoryStorage();
    const data: SaveFile = { ...makeBaseSave(), runRngState: 42 };
    expect(() => save(data, storage)).toThrow();
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
  it('includes the three Tier 1 classes and Crypt', () => {
    const u = createDefaultUnlocks();
    expect([...u.classes].sort()).toEqual(['archer', 'knight', 'priest']);
    expect(u.dungeons).toEqual(['crypt']);
  });
});
