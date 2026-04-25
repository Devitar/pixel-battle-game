import { beforeEach, describe, expect, it } from 'vitest';
import { createRoster } from '../../camp/roster';
import { createVault, credit } from '../../camp/vault';
import {
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEY,
  createDefaultUnlocks,
  type SaveFile,
} from '../../save/save';
import { appState } from '../app_state';

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
    vault: createVault(),
    unlocks: createDefaultUnlocks(),
  };
}

beforeEach(() => {
  appState.reset();
});

describe('AppState', () => {
  it('throws on get() before init', () => {
    expect(() => appState.get()).toThrow();
  });

  it('throws on update() before init', () => {
    expect(() => appState.update((s) => s)).toThrow();
  });

  it('init followed by get returns the saveFile', () => {
    const storage = new MemoryStorage();
    const sf = makeBaseSave();
    appState.init(sf, storage);
    expect(appState.get()).toBe(sf);
  });

  it('update applies the producer and persists', () => {
    const storage = new MemoryStorage();
    appState.init(makeBaseSave(), storage);
    appState.update((s) => ({ ...s, vault: credit(s.vault, 100) }));
    expect(appState.get().vault.gold).toBe(100);
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('multiple updates accumulate', () => {
    const storage = new MemoryStorage();
    appState.init(makeBaseSave(), storage);
    appState.update((s) => ({ ...s, vault: credit(s.vault, 50) }));
    appState.update((s) => ({ ...s, vault: credit(s.vault, 75) }));
    expect(appState.get().vault.gold).toBe(125);
  });

  it('persisted save reflects the current state', () => {
    const storage = new MemoryStorage();
    appState.init(makeBaseSave(), storage);
    appState.update((s) => ({ ...s, vault: credit(s.vault, 200) }));
    const stored = JSON.parse(storage.getItem(STORAGE_KEY)!);
    expect(stored.vault.gold).toBe(200);
  });

  it('reset clears state — get throws afterward', () => {
    appState.init(makeBaseSave(), new MemoryStorage());
    appState.reset();
    expect(() => appState.get()).toThrow();
  });
});
