# Absolute import paths — Design

- **TODO entry:** Cluster B · 28 (Absolute import paths).
- **Tier:** 2 (infrastructure / pre-launch hygiene).
- **Date:** 2026-05-01.

## 1 · Scope

Add 12 per-folder import aliases (`@camp/`, `@combat/`, `@data/`, `@dungeon/`, `@heroes/`, `@items/`, `@render/`, `@run/`, `@save/`, `@scenes/`, `@ui/`, `@util/`) configured in both `vite.config.ts` (for vite + vitest) and `tsconfig.json` (for tsc). Migrate all cross-folder imports across `src/` to use the aliases via a one-shot script. Intra-folder imports stay relative (including `__tests__/` files importing their parent module, and subfolder-to-sibling imports within the same top-level folder).

**Out of scope:**

- **Migrating bare-module imports** (`'phaser'`, etc.) — these aren't relative; the alias system has nothing to say about them.
- **Migrating asset imports** like `import './style.css'` — these are intra-folder and stay relative.
- **Adding aliases for nested subfolders** (`@buildings`, `@dev`) — keeps the path hierarchy in imports (`@camp/buildings/tavern`, `@scenes/dev/explorer_scene`) and avoids polluting the alias namespace with sub-grain folders.
- **Changing imports inside `HISTORY.md` / spec / plan markdown** — those are documentary artefacts; the imports there are frozen examples of the codebase at past times.
- **Single-root `@/` alias** instead of per-folder. Per-folder reads cleaner at call sites (`@camp/roster` vs `@/camp/roster`) and the user listed the per-folder style in the TODO entry.
- **Flipping intra-folder imports to absolute too.** Common JS convention is "absolute across folders, relative within"; staying relative within a folder communicates locality, leaves intra-folder file moves alone, and keeps `__tests__/foo.test.ts` importing `'../foo'` reading as "the module I'm testing."
- **Enforcing the convention via lint rule.** ESLint `import/no-relative-parent-imports` would catch regressions, but the project doesn't run ESLint today; adding the linter is its own task.

## 2 · The aliases

| Alias | Resolves to |
|---|---|
| `@camp` | `src/camp` |
| `@combat` | `src/combat` |
| `@data` | `src/data` |
| `@dungeon` | `src/dungeon` |
| `@heroes` | `src/heroes` |
| `@items` | `src/items` |
| `@render` | `src/render` |
| `@run` | `src/run` |
| `@save` | `src/save` |
| `@scenes` | `src/scenes` |
| `@ui` | `src/ui` |
| `@util` | `src/util` |

Twelve top-level folders, no subfolder aliases. Imports of files in nested subfolders read like `@camp/buildings/tavern` and `@scenes/dev/explorer_scene` — the alias prefix is the top-level folder; the rest of the path follows the on-disk shape.

## 3 · Config changes

### 3a · `vite.config.ts`

Add a `resolve.alias` array. Use `fileURLToPath(new URL('./src/...', import.meta.url))` to compute absolute paths from the config-file location (works in ESM context, which `package.json:type` is `"module"`).

```ts
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'node:url';

const TOP_FOLDERS = [
  'camp', 'combat', 'data', 'dungeon', 'heroes', 'items',
  'render', 'run', 'save', 'scenes', 'ui', 'util',
];

const aliasFor = (folder: string) => ({
  find: `@${folder}`,
  replacement: fileURLToPath(new URL(`./src/${folder}`, import.meta.url)),
});

export default defineConfig(({ mode }) => ({
  plugins: mode === 'https' ? [basicSsl()] : [],
  resolve: {
    alias: TOP_FOLDERS.map(aliasFor),
  },
}));
```

`TOP_FOLDERS` is duplicated in the migration script (§4) and tsconfig — kept as a small literal in three places rather than extracted, since each consumer needs the list in its own format and the list changes very rarely.

Vitest 4.1.5 reads `vite.config.ts` automatically (no `vitest.config.ts` exists in the repo). The same alias config powers `vite dev`, `vite build`, and `vitest run`.

### 3b · `tsconfig.json`

Add `baseUrl: "."` and a `paths` mapping that mirrors the vite aliases:

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "lib": ["ES2023", "DOM"],
    "types": ["vite/client", "node"],
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,

    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,

    "baseUrl": ".",
    "paths": {
      "@camp/*":    ["src/camp/*"],
      "@combat/*":  ["src/combat/*"],
      "@data/*":    ["src/data/*"],
      "@dungeon/*": ["src/dungeon/*"],
      "@heroes/*":  ["src/heroes/*"],
      "@items/*":   ["src/items/*"],
      "@render/*":  ["src/render/*"],
      "@run/*":     ["src/run/*"],
      "@save/*":    ["src/save/*"],
      "@scenes/*":  ["src/scenes/*"],
      "@ui/*":      ["src/ui/*"],
      "@util/*":    ["src/util/*"]
    }
  },
  "include": ["src"]
}
```

Both stages of `"build": "tsc && vite build"` (in `package.json`) need to agree on aliases. tsconfig handles tsc; vite config handles vite + vitest.

## 4 · Migration script

A one-shot script at `scripts/migrate-imports.ts`, runnable via `npx tsx scripts/migrate-imports.ts`. Walks `src/`, applies the depth-aware migration rule, prints a per-file count, and writes back in place.

### 4a · The depth rule

For each `.ts` file under `src/`:

1. Compute the file's depth from `src/`. E.g.:
   - `src/foo/bar.ts` → depth 1
   - `src/foo/__tests__/baz.test.ts` → depth 2
   - `src/scenes/dev/explorer_scene.ts` → depth 2
2. For each `from '<dotdots><name>(/<rest>)?'` import:
   - Count `..`s in `<dotdots>`.
   - If `..count === depth` AND `<name>` is one of the 12 top-level folders, the import is cross-folder → rewrite to `@<name>(/<rest>)?`.
   - Otherwise (intra-folder), leave the import untouched.

Why the depth check works: `..count === depth` means the import path "escapes" the file's enclosing top-level folder and lands at `src/`. The next path segment is then a top-level folder name (a sibling of the file's own top folder).

### 4b · Worked examples

| File | Original import | Migrated to | Reason |
|---|---|---|---|
| `src/items/equip.ts` (depth 1) | `'../data/types'` | `'@data/types'` | 1 dotdot = depth, `data` is top |
| `src/items/__tests__/equip.test.ts` (depth 2) | `'../equip'` | (unchanged) | 1 dotdot ≠ depth 2 |
| `src/items/__tests__/equip.test.ts` (depth 2) | `'../../data/types'` | `'@data/types'` | 2 dotdots = depth, `data` is top |
| `src/scenes/dev/explorer_scene.ts` (depth 2) | `'../boot_scene'` | (unchanged) | 1 dotdot ≠ depth 2 |
| `src/scenes/dev/explorer_scene.ts` (depth 2) | `'../../data/items'` | `'@data/items'` | 2 dotdots = depth, `data` is top |
| `src/camp/buildings/tavern.ts` (depth 2) | `'../roster'` | (unchanged) | 1 dotdot ≠ depth 2 |
| `src/camp/buildings/tavern.ts` (depth 2) | `'../../data/classes'` | `'@data/classes'` | 2 dotdots = depth, `data` is top |

### 4c · The script

`scripts/migrate-imports.ts`:

```ts
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
```

The single `from '...'` regex captures every shape that exists in the codebase:
- `import { Foo } from '../path';`
- `import type { Foo } from '../path';`
- `import * as Foo from '../path';`
- `import Foo from '../path';`
- `import './side-effect';` ← *not matched* (no `from`); intentional, side-effect imports stay
- `export { Foo } from '../path';`
- `export type { Foo } from '../path';`
- Multi-line imports (the `from '...'` part lands on a single line)

No dynamic `import()` calls exist in `src/` (verified by grep). Strings are single-quoted throughout (verified — codebase convention).

### 4d · Script lifecycle

Keep the script in the repo at `scripts/migrate-imports.ts` after the one-shot migration. It's small, costs almost nothing, and serves as future reference for "rename a folder, fix imports" or "add a new top-level folder, migrate to alias" recipes. No `package.json` script entry needed (run via `npx tsx scripts/migrate-imports.ts` when needed).

## 5 · Verification (4 layers)

After running the script:

1. **Grep check** — should return ZERO results:
   ```
   git grep -E "from '\.\./(camp|combat|data|dungeon|heroes|items|render|run|save|scenes|ui|util)" -- 'src/**/*.ts'
   ```
   Any hit means the script missed something or the depth heuristic was wrong for that file. Investigate.

2. **tsc** — `npx tsc --noEmit` confirms type-resolution works under the new aliases. Catches missed imports, alias-config typos, or paths/baseUrl misconfiguration.

3. **Tests** — `npm test` confirms vitest resolves aliases (via the vite config it reads automatically). Catches any test file with a missed import or a path-resolution edge case.

4. **Build** — `npm run build` (= `tsc && vite build`) confirms the production bundle resolves aliases via vite's `resolve.alias`. The `tsc` half also runs as part of the build, so this triples the type-check coverage.

## 6 · Files touched

| File | Change |
|---|---|
| `vite.config.ts` | Add `resolve.alias` with 12 entries via `TOP_FOLDERS.map(aliasFor)` helper. |
| `tsconfig.json` | Add `baseUrl: "."` and `paths` mapping (12 entries). |
| `scripts/migrate-imports.ts` | Create new file with the migration script (§4c). |
| ~125 files under `src/`* | Cross-folder imports rewritten via the script. |

\* Approximate count from baseline grep (`git grep -c "from '\.\./" -- 'src/**/*.ts' | wc -l` returned 125 files). Exact count appears in the script's output.

No other files touched. No `HISTORY.md` retro-edit. No `package.json` change (the script runs via `npx tsx`, no new dependencies).

## 7 · Test plan

No new tests added or removed; the migration is a behavior-preserving refactor. Verification is the 4-layer stack from §5.

**Acceptance:**

- `npx tsc --noEmit` green.
- `npm test` green (1330 → 1330, no count change).
- `npm run build` succeeds.
- `git grep -E "from '\.\./(camp|combat|data|dungeon|heroes|items|render|run|save|scenes|ui|util)" -- 'src/**/*.ts'` returns zero results.

**Manual play verification:** spot-check that `npm run dev` opens the game and core flows still work. The migration is mechanical; runtime behavior should be identical, but a quick smoke test of the camp scene rules out catastrophic alias-resolution failures the test suite somehow missed.

## 8 · Risk

Medium. Touches ~125 files but each touch is mechanical and the verification stack is strong (4 layers). Specific risks:

- **The `tsc && vite build` chain depends on tsconfig + vite alias agreement.** If the two configs drift, one half fails. Spec includes both configs explicitly above; verification step #4 catches divergence.
- **Vitest's vite-config loading.** Confirmed Vitest 4.1.5 reads `vite.config.ts` by default, but if a Vitest version bump ever changes this, tests would break and the fix is adding a `vitest.config.ts` that imports the vite config's `resolve` block. Not relevant today; flagged for future awareness.
- **The depth heuristic could mis-classify a clever import.** No clever imports exist in this codebase (verified — no dynamic imports, single-quoted strings, no unusual whitespace in import lines). The grep verification (step #1) catches any mis-classification immediately by surfacing residual `'../<top-folder>'` patterns.

The script is idempotent: running it a second time produces zero changes (already-rewritten imports use `@folder/...`, which doesn't match the regex). Safe to re-run during development if a regression appears.

## 9 · Open questions

None at design time.
