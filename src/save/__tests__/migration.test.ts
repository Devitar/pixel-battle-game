import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, migrate } from '../migration';

describe('migrate', () => {
  it('returns the input as-is when version matches CURRENT_SCHEMA_VERSION', () => {
    const raw = {
      version: CURRENT_SCHEMA_VERSION,
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      unlocks: { classes: ['knight'], dungeons: ['crypt'] },
    };
    expect(migrate(raw)).toEqual(raw);
  });

  it('returns null when no migration exists for an older version', () => {
    const raw = { version: 0, roster: {}, vault: {} };
    expect(migrate(raw)).toBeNull();
  });

  it('v1 → v2: adds campRngState (a number) and bumps version', () => {
    const v1 = {
      version: 1,
      roster: { heroes: [], capacity: 12 },
      vault: { gold: 0 },
      unlocks: { classes: ['knight'], dungeons: ['crypt'] },
    };
    const result = migrate(v1) as unknown as { version: number; campRngState: unknown };
    expect(result).not.toBeNull();
    expect(result.version).toBe(2);
    expect(typeof result.campRngState).toBe('number');
    expect(Number.isFinite(result.campRngState)).toBe(true);
  });

  it('returns null on null input', () => {
    expect(migrate(null)).toBeNull();
  });

  it('returns null on string input', () => {
    expect(migrate('string')).toBeNull();
  });

  it('returns null on number input', () => {
    expect(migrate(42)).toBeNull();
  });
});
