import type { SaveFile } from './save';

// Bump on any change to the persisted SaveFile shape (or nested types
// like Hero, Roster, RunState, Vault, Unlocks, Preferences) and register a
// migration in MIGRATIONS[previousVersion] that maps old raw shape to new.
// Loaders newer than CURRENT_SCHEMA_VERSION are rejected at save.ts:load.
export const CURRENT_SCHEMA_VERSION = 1;

type MigrationFn = (raw: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, MigrationFn> = {};

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
