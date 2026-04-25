import type { SaveFile } from './save';

export const CURRENT_SCHEMA_VERSION = 1;

type MigrationFn = (raw: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, MigrationFn> = {
  // Tier 1: empty.
  // Future example: { 1: (raw) => ({ ...raw, version: 2, stash: { items: [] } }) }
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
