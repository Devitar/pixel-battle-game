import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TOP_FOLDERS = new Set([
  'camp', 'combat', 'data', 'dungeon', 'heroes', 'items',
  'render', 'run', 'save', 'scenes', 'ui', 'util',
]);

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (path.endsWith('.ts')) yield path;
  }
}

const TOP_PATTERN = [...TOP_FOLDERS].join('|');
// from '<dotdots><folder>(/rest)?'
const IMPORT_RE = new RegExp(
  `from '((?:\\.\\./)+)(${TOP_PATTERN})((?:/[^']*)?)'`,
  'g',
);

let totalFiles = 0;
let totalReplacements = 0;

for (const file of walk('src')) {
  // src/foo/bar.ts → ['src', 'foo', 'bar.ts'] → depth = 1
  // src/foo/__tests__/baz.test.ts → depth = 2
  const parts = file.split(/[\\/]/);
  const srcIdx = parts.indexOf('src');
  const depth = parts.length - srcIdx - 2;

  const content = readFileSync(file, 'utf-8');
  let count = 0;
  const replaced = content.replace(IMPORT_RE, (match, dotDots: string, folder: string, rest: string) => {
    const upCount = (dotDots.match(/\.\.\//g) ?? []).length;
    if (upCount === depth) {
      count++;
      return `from '@${folder}${rest}'`;
    }
    return match;
  });
  if (count > 0) {
    writeFileSync(file, replaced);
    totalFiles++;
    totalReplacements += count;
    console.log(`${file}: ${count}`);
  }
}

console.log(`\nTotal: ${totalReplacements} imports rewritten across ${totalFiles} files`);
