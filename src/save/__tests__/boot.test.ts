import { describe, expect, it, vi } from 'vitest';
import { createRoster } from '../../camp/roster';
import { createVault, credit } from '../../camp/vault';
import { createRng } from '../../util/rng';
import { resolveSaveState } from '../boot';
import {
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEY,
  createDefaultUnlocks,
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

describe('resolveSaveState', () => {
  it('returns the existing save when one is present', () => {
    const storage = new MemoryStorage();
    const original: SaveFile = {
      version: CURRENT_SCHEMA_VERSION,
      roster: createRoster(),
      vault: credit(createVault(), 200),
      unlocks: createDefaultUnlocks(),
    };
    save(original, storage);

    const { saveFile, isNew } = resolveSaveState(storage, createRng(1));
    expect(isNew).toBe(false);
    expect(saveFile).toEqual(original);
  });

  it('creates a fresh save when storage is empty', () => {
    const storage = new MemoryStorage();
    const { saveFile, isNew } = resolveSaveState(storage, createRng(42));
    expect(isNew).toBe(true);
    expect(saveFile.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(saveFile.roster.heroes).toHaveLength(3);
    expect(saveFile.vault).toEqual({ gold: 500 });
    expect(saveFile.unlocks).toEqual(createDefaultUnlocks());
    expect(saveFile.runState).toBeUndefined();
  });

  it('persists the fresh save to storage', () => {
    const storage = new MemoryStorage();
    resolveSaveState(storage, createRng(42));
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('starter roster has one hero of each Tier 1 class', () => {
    const storage = new MemoryStorage();
    const { saveFile } = resolveSaveState(storage, createRng(7));
    const classIds = saveFile.roster.heroes.map((h) => h.classId).sort();
    expect(classIds).toEqual(['archer', 'knight', 'priest']);
  });

  it('treats corrupt storage as fresh save', () => {
    const storage = new MemoryStorage();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.setItem(STORAGE_KEY, 'not valid json');
    const { saveFile, isNew } = resolveSaveState(storage, createRng(1));
    expect(isNew).toBe(true);
    expect(saveFile.roster.heroes).toHaveLength(3);
    warnSpy.mockRestore();
  });

  it('is deterministic for the same seed', () => {
    const a = resolveSaveState(new MemoryStorage(), createRng(99));
    const b = resolveSaveState(new MemoryStorage(), createRng(99));
    expect(a.saveFile).toEqual(b.saveFile);
  });
});
