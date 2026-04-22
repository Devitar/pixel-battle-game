import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSpriteNames } from './parse_sprite_names';

describe('parseSpriteNames', () => {
  it('parses a simple named entry', () => {
    const r = parseSpriteNames('0 character male_light');
    expect(r.errors).toEqual([]);
    expect(r.sprites).toEqual([
      { frame: 0, category: 'character', name: 'male_light' },
    ]);
  });

  it('ignores blank lines and comments (including ## section headers)', () => {
    const input = ['# top-level comment', '', '## character', '', '5 hair brown_1'].join('\n');
    const r = parseSpriteNames(input);
    expect(r.errors).toEqual([]);
    expect(r.sprites.map((s) => s.frame)).toEqual([5]);
  });

  it('records empty-cell sentinels in emptyFrames and skips them in sprites', () => {
    const r = parseSpriteNames('10 -\n11 -\n12 hair brown_1');
    expect(r.emptyFrames).toEqual([10, 11]);
    expect(r.sprites.map((s) => s.frame)).toEqual([12]);
  });

  it('resolves aliases by copying category and name from the target', () => {
    const r = parseSpriteNames('168 torso shirt_orange\n172 = 168');
    expect(r.errors).toEqual([]);
    const alias = r.sprites.find((s) => s.frame === 172);
    expect(alias).toEqual({
      frame: 172,
      category: 'torso',
      name: 'shirt_orange',
      isAlias: true,
      aliasOf: 168,
    });
  });

  it('returns an error when an alias points at a nonexistent frame', () => {
    const r = parseSpriteNames('100 = 999');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors.some((e) => e.includes('999'))).toBe(true);
  });

  it('returns an error on a duplicate frame index', () => {
    const r = parseSpriteNames('5 hair a\n5 hair b');
    expect(r.errors.some((e) => e.includes('duplicate frame 5'))).toBe(true);
  });

  it('returns an error on a duplicate name within a category', () => {
    const r = parseSpriteNames('1 hair brown\n2 hair brown');
    expect(r.errors.some((e) => e.includes('duplicate name "hair.brown"'))).toBe(true);
  });

  it('allows the same name in two different categories', () => {
    const r = parseSpriteNames('1 hair brown\n2 feet brown');
    expect(r.errors).toEqual([]);
  });

  it('rejects invalid identifier characters in category or name', () => {
    expect(parseSpriteNames('1 hair brown-1').errors.length).toBeGreaterThan(0);
    expect(parseSpriteNames('1 my-category brown').errors.length).toBeGreaterThan(0);
  });

  it('parses the real spritenames.txt without errors', () => {
    const path = resolve(import.meta.dirname, '..', 'spritenames.txt');
    const source = readFileSync(path, 'utf8');
    const r = parseSpriteNames(source);
    expect(r.errors).toEqual([]);
    expect(r.sprites.length).toBeGreaterThan(0);
  });

  it('maps a few known names from the real file to the right frames', () => {
    const path = resolve(import.meta.dirname, '..', 'spritenames.txt');
    const r = parseSpriteNames(readFileSync(path, 'utf8'));
    const byKey = new Map(r.sprites.map((s) => [`${s.category}.${s.name}`, s.frame]));
    expect(byKey.get('character.male_light')).toBe(0);
    expect(byKey.get('hair.brown_1')).toBe(19);
    expect(byKey.get('head.fullhelmet_1')).toBe(28);
    expect(byKey.get('weapon.bow_magic_tier2')).toBe(160);
  });
});
