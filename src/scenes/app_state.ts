import { save, type SaveFile } from '../save/save';

class AppState {
  private current: SaveFile | null = null;
  private storage: Storage | null = null;

  init(saveFile: SaveFile, storage: Storage): void {
    this.current = saveFile;
    this.storage = storage;
  }

  get(): SaveFile {
    if (!this.current) {
      throw new Error('AppState not initialized — boot scene must call init() first');
    }
    return this.current;
  }

  update(producer: (current: SaveFile) => SaveFile): void {
    if (!this.current || !this.storage) {
      throw new Error('AppState not initialized');
    }
    const next = producer(this.current);
    this.current = next;
    save(next, this.storage);
  }

  reset(): void {
    this.current = null;
    this.storage = null;
  }
}

export const appState = new AppState();
