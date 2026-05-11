import type { SaveFile } from './save';

// Bump on any change to the persisted SaveFile shape (or nested types
// like Hero, Roster, RunState, Vault, Unlocks, Preferences) and register a
// migration in MIGRATIONS[previousVersion] that maps old raw shape to new.
// Loaders newer than CURRENT_SCHEMA_VERSION are rejected at save.ts:load.
export const CURRENT_SCHEMA_VERSION = 4;

type MigrationFn = (raw: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, MigrationFn> = {
  // v1 → v2: introduce SaveFile.campRngState (Cluster B · 58, 2026-05-10).
  // Old saves seed it from load-time Date.now() — the same bootstrap used
  // for fresh saves' campRngState. Subsequent camp actions advance it.
  1: (raw) => ({ ...raw, campRngState: Date.now(), version: 2 }),

  // v2 → v3: introduce Hero.petSpeciesId (defensive — no Hunters can exist pre-v3)
  // and RunState.petsDownByHeroId (default to []). Hunter spec, 2026-05-10.
  2: (raw) => {
    const out: Record<string, unknown> = { ...raw, version: 3 };
    // Defensive Hunter petSpeciesId backfill in roster.heroes
    const roster = out.roster as { heroes?: Array<Record<string, unknown>> } | undefined;
    if (roster?.heroes) {
      roster.heroes = roster.heroes.map((h) =>
        h.classId === 'hunter' && !h.petSpeciesId ? { ...h, petSpeciesId: 'wolf' } : h,
      );
    }
    // Same in tavernCandidates
    const candidates = out.tavernCandidates as Array<Record<string, unknown>> | undefined;
    if (candidates) {
      out.tavernCandidates = candidates.map((h) =>
        h.classId === 'hunter' && !h.petSpeciesId ? { ...h, petSpeciesId: 'wolf' } : h,
      );
    }
    // In-progress run: backfill petsDownByHeroId + party heroes
    const runState = out.runState as Record<string, unknown> | undefined;
    if (runState) {
      if (runState.petsDownByHeroId === undefined) {
        runState.petsDownByHeroId = [];
      }
      const party = runState.party as Array<Record<string, unknown>> | undefined;
      if (party) {
        runState.party = party.map((h) =>
          h.classId === 'hunter' && !h.petSpeciesId ? { ...h, petSpeciesId: 'wolf' } : h,
        );
      }
    }
    return out;
  },

  // v3 → v4: Hero.traitId → traitIds (single → array); buildingLevels.chapel = 1;
  // unlocks.buildings = []. Chapel spec, 2026-05-11.
  3: (raw) => {
    const out: Record<string, unknown> = { ...raw, version: 4 };

    const migrateHero = (h: Record<string, unknown>): Record<string, unknown> => {
      if (Array.isArray(h.traitIds)) return h;
      if (typeof h.traitId !== 'string') return h;
      const { traitId, ...rest } = h;
      return { ...rest, traitIds: [traitId] };
    };

    const roster = out.roster as { heroes?: Array<Record<string, unknown>> } | undefined;
    if (roster?.heroes) roster.heroes = roster.heroes.map(migrateHero);

    const candidates = out.tavernCandidates as Array<Record<string, unknown>> | undefined;
    if (candidates) out.tavernCandidates = candidates.map(migrateHero);

    const runState = out.runState as Record<string, unknown> | undefined;
    if (runState) {
      const party = runState.party as Array<Record<string, unknown>> | undefined;
      if (party) runState.party = party.map(migrateHero);
      const fallen = runState.fallen as Array<Record<string, unknown>> | undefined;
      if (fallen) runState.fallen = fallen.map(migrateHero);
      const lost = runState.lost as Array<Record<string, unknown>> | undefined;
      if (lost) runState.lost = lost.map(migrateHero);
    }

    const bl = out.buildingLevels as Record<string, unknown> | undefined;
    if (bl && bl.chapel === undefined) bl.chapel = 1;

    const unlocks = out.unlocks as Record<string, unknown> | undefined;
    if (unlocks && unlocks.buildings === undefined) unlocks.buildings = [];

    return out;
  },
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
