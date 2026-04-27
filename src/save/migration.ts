import type { SaveFile } from './save';

// Pre-launch: stays at 1. Schema changes discard old saves via the loader's
// "newer-than-supported" rejection (which catches saves persisted at any prior
// transient bump value). Migrations get registered post-launch when real
// player saves exist.
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
