import type { SaveFile } from './save';

// Bump on any change to the persisted SaveFile shape (or nested types
// like Hero, Roster, RunState, Vault, Unlocks, Preferences) and register a
// migration in MIGRATIONS[previousVersion] that maps old raw shape to new.
// Loaders newer than CURRENT_SCHEMA_VERSION are rejected at save.ts:load.
export const CURRENT_SCHEMA_VERSION = 2;

type MigrationFn = (raw: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, MigrationFn> = {
  // v1 → v2: introduce SaveFile.campRngState (Cluster B · 58, 2026-05-10).
  // Old saves seed it from load-time Date.now() — the same bootstrap used
  // for fresh saves' campRngState. Subsequent camp actions advance it.
  1: (raw) => ({ ...raw, campRngState: Date.now(), version: 2 }),
};

export function migrate(raw: unknown): SaveFile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  let cur = raw as Record<string, unknown>;
  let version = cur.version as number;

  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) return null;
    cur = migration(cur);
    version = cur.version as number;
  }

  if (version !== CURRENT_SCHEMA_VERSION) return null;
  return cur as unknown as SaveFile;
}
