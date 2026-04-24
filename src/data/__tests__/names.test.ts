import { describe, expect, it } from 'vitest';
import { NAMES } from '../names';

describe('NAMES', () => {
  it('has at least 50 entries', () => {
    expect(NAMES.length).toBeGreaterThanOrEqual(50);
  });

  it('has no duplicates', () => {
    expect(new Set(NAMES).size).toBe(NAMES.length);
  });

  it('every name is a non-empty string', () => {
    for (const n of NAMES) {
      expect(typeof n).toBe('string');
      expect(n.length).toBeGreaterThan(0);
    }
  });
});
