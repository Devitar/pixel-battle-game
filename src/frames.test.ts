import { describe, it, expect } from 'vitest';
import { SHEET, CATEGORIES, frameAt, firstFrameOf } from './frames';

describe('SHEET', () => {
  it('matches the Kenney Roguelike Characters pack layout', () => {
    expect(SHEET.frameWidth).toBe(16);
    expect(SHEET.frameHeight).toBe(16);
    expect(SHEET.spacing).toBe(1);
    expect(SHEET.margin).toBe(0);
    expect(SHEET.columns).toBe(54);
    expect(SHEET.rows).toBe(12);
  });
});

describe('frameAt', () => {
  it('returns column 0 row 0 = 0', () => {
    expect(frameAt(0, 0)).toBe(0);
  });

  it('reads left-to-right within a row', () => {
    expect(frameAt(1, 0)).toBe(1);
    expect(frameAt(53, 0)).toBe(53);
  });

  it('wraps to the next row at column 54', () => {
    expect(frameAt(0, 1)).toBe(54);
    expect(frameAt(5, 2)).toBe(54 * 2 + 5);
  });

  it('returns the last frame at col 53 row 11', () => {
    expect(frameAt(53, 11)).toBe(647);
  });
});

describe('CATEGORIES', () => {
  it('has contiguous blocks separated by the known empty columns (2, 5, 18, 27, 32, 41)', () => {
    const ordered = [
      CATEGORIES.character,
      CATEGORIES.undergarment,
      CATEGORIES.outergarment,
      CATEGORIES.hair,
      CATEGORIES.hat,
      CATEGORIES.shield,
      CATEGORIES.weapon,
    ];
    const separators = [];
    for (let i = 0; i < ordered.length - 1; i++) {
      const gapStart = ordered[i].lastCol + 1;
      const gapEnd = ordered[i + 1].firstCol - 1;
      expect(gapStart).toBe(gapEnd);
      separators.push(gapStart);
    }
    expect(separators).toEqual([2, 5, 18, 27, 32, 41]);
  });

  it('covers columns 0 through 53 inclusive', () => {
    expect(CATEGORIES.character.firstCol).toBe(0);
    expect(CATEGORIES.weapon.lastCol).toBe(53);
  });

  it('keeps firstCol <= lastCol for every category', () => {
    for (const { firstCol, lastCol } of Object.values(CATEGORIES)) {
      expect(firstCol).toBeLessThanOrEqual(lastCol);
    }
  });
});

describe('firstFrameOf', () => {
  it('returns the top-left frame of each category block', () => {
    expect(firstFrameOf('character')).toBe(0);
    expect(firstFrameOf('undergarment')).toBe(3);
    expect(firstFrameOf('outergarment')).toBe(6);
    expect(firstFrameOf('hair')).toBe(19);
    expect(firstFrameOf('hat')).toBe(28);
    expect(firstFrameOf('shield')).toBe(33);
    expect(firstFrameOf('weapon')).toBe(42);
  });
});
