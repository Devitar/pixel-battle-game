# Absolute Import Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 12 per-folder import aliases (`@camp/`, `@combat/`, `@data/`, `@dungeon/`, `@heroes/`, `@items/`, `@render/`, `@run/`, `@save/`, `@scenes/`, `@ui/`, `@util/`) configured in `vite.config.ts` + `tsconfig.json`. Migrate ~125 cross-folder imports across `src/` to use them via a one-shot script. Intra-folder imports stay relative.

**Architecture:** Three sequential tasks. (1) Add the alias config in vite + tsconfig. (2) Create and run the migration script (`scripts/migrate-imports.ts`); migrate all cross-folder imports in one pass. (3) Verify via the 4-layer stack (grep, tsc, tests, build). The script is depth-aware — uses each file's distance from `src/` to distinguish "escapes top folder" (rewrite) from "stays inside top folder" (leave alone).

**Tech Stack:** TypeScript, Vite, Vitest, Node.js fs/path, tsx (already a devDependency).

**Spec:** `docs/superpowers/specs/2026-05-01-absolute-import-paths-design.md`. Read before starting — note especially §4a (the depth heuristic) and §4b (worked examples) for context on edge cases like `__tests__/` and nested subfolders.

---

## Task 1: Configure aliases (vite + tsconfig)

Land the alias config first, BEFORE running the migration. With config in place but imports not yet migrated, the existing relative imports continue to work (they're orthogonal to the alias system); the new aliases are simply available. This decouples the config change from the migration, makes mid-task verification possible, and keeps the working tree usable if the user pauses between tasks.

**Files:**
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1.1: Run baseline tests to capture green state**

Run: `npm test`

Expected: ALL 1330 tests pass. Note for post-change comparison (target: still 1330 — pure refactor, no test count change).

- [ ] **Step 1.2: Update `vite.config.ts` to add the alias map**

Open `vite.config.ts`. Replace the entire file with:

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

The `fileURLToPath(new URL('./src/...', import.meta.url))` pattern computes absolute paths from the config file's location — works in ESM (the project's `package.json:type` is `"module"`).

- [ ] **Step 1.3: Update `tsconfig.json` to add `baseUrl` + `paths`**

Open `tsconfig.json`. Replace the entire file with:

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

Two new fields added: `baseUrl: "."` and the `paths` mapping (12 entries). All other existing options preserved.

- [ ] **Step 1.4: Verify baseline still green (config-only change)**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: green / green (1330 tests, no count change) / build succeeds. The aliases are now configured but no imports use them yet — existing relative imports continue to work.

If anything fails: a typo in vite.config.ts or tsconfig.json. Fix before proceeding.

---

## Task 2: Create + run migration script

Migrate all cross-folder imports in one pass via the script. Read the migration rule and worked examples in spec §4a–4b before writing the script.

**Files:**
- Create: `scripts/migrate-imports.ts`
- Modify: ~125 files under `src/` (modified by the script's run)

- [ ] **Step 2.1: Create the migration script**

Create `scripts/migrate-imports.ts` with this exact content:

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

The script:
- Walks every `.ts` under `src/`.
- For each file, computes its depth from `src/` (e.g., `src/foo/bar.ts` is depth 1; `src/foo/__tests__/baz.test.ts` is depth 2).
- Matches `from '<dotdots><folder>(/rest)?'` where `<folder>` is one of the 12 top-level folders.
- Rewrites only when `..count === depth` (the import escapes the file's own top-level folder). Intra-folder imports (where `..count < depth`) are left alone.
- Writes back in place; logs per-file counts.

The single regex covers `import`, `import type`, `import * as`, `export ... from`, multi-line imports — anything with `from '...'`. Side-effect imports like `import './style.css'` have no `from` and are correctly skipped.

The script is idempotent: a second run produces zero changes (already-rewritten imports use `@folder/...`, which doesn't match the regex).

- [ ] **Step 2.2: Run the migration script**

Run: `npx tsx scripts/migrate-imports.ts`

Expected: A list of files with per-file replacement counts, ending with a total line like `Total: 200+ imports rewritten across 100+ files`. The exact numbers depend on the codebase's current state; baseline grep showed 125 files have at least one `'../...'` import, and many files have multiple cross-folder imports per file.

Skim the per-file output as a sanity check. Look for:
- Any file with a surprisingly high count (might indicate a regex over-fire — investigate).
- Any expected file missing from the list (might mean the depth heuristic missed something — investigate via `git diff <file>`).

- [ ] **Step 2.3: Spot-check a representative migrated file**

Pick a file from the script's output (e.g., `src/items/equip_camp.ts`, which we touched recently). Run `git diff src/items/equip_camp.ts` and confirm:
- Cross-folder imports now use `@folder/...` (e.g., `from '@heroes/hero'`, `from '@camp/roster'`).
- Intra-folder imports remain relative (e.g., `from './equip'`).
- No semantic changes — only the `from '...'` strings on import/export lines.

If the diff looks wrong (e.g., intra-folder imports got rewritten), `git checkout -- src/` to revert and investigate the script before proceeding.

---

## Task 3: Verify completeness (4-layer stack)

**Files:** none modified — verification only.

- [ ] **Step 3.1: Grep check — should return zero residual cross-folder relative imports**

Run:

```bash
git grep -E "from '\.\./(camp|combat|data|dungeon|heroes|items|render|run|save|scenes|ui|util)" -- 'src/**/*.ts'
```

Expected: **zero results**. Any hit is a missed migration — investigate the file's depth and the matched import's dotdot count to understand why the script's heuristic skipped it. Common cause would be an unusual file location or whitespace in the import line; manual fix is fine.

- [ ] **Step 3.2: Typecheck**

Run: `npx tsc --noEmit`

Expected: green. Any error is either a missed import (didn't get rewritten and the path is now broken because of a different change) or an alias-config typo. The error message includes the file and line — fix and re-run.

- [ ] **Step 3.3: Run tests**

Run: `npm test`

Expected: green (1330 tests, no count change). Vitest reads `vite.config.ts` automatically, so the same alias config powers both `vite` and `vitest`. If a test fails on import resolution, the vite config alias is probably typo'd (verify by inspecting the failing test's import line and comparing to vite.config.ts entry).

- [ ] **Step 3.4: Build**

Run: `npm run build`

Expected: green build (`tsc && vite build`). The `tsc` half re-runs with the production-equivalent config (already covered by step 3.2). The `vite build` half exercises vite's actual production-bundling alias resolution. If this fails but step 3.2 passed, the vite config and tsconfig have drifted — diff them and align.

- [ ] **Step 3.5: Commit**

The migration touches a lot of files, but they're all the same kind of change (import rewrites). Stage by directory rather than by `git add -A` to avoid accidentally including unrelated tracked changes:

```bash
git add vite.config.ts tsconfig.json scripts/migrate-imports.ts src/
git status   # sanity-check: vite/tsconfig modifications + scripts/migrate-imports.ts new + src/* modifications, nothing else
git commit -m "refactor(imports): per-folder absolute aliases (@camp/, @combat/, …)

Adds 12 per-folder import aliases configured in vite.config.ts and
tsconfig.json. Migrates ~125 cross-folder imports across src/ via a
one-shot script kept at scripts/migrate-imports.ts. Intra-folder
imports stay relative. No behavior change; verified by grep + tsc +
1330 tests + build."
```

(Per CLAUDE.md, commits land at user direction — leave this step gated until the user explicitly asks to commit.)

---

## Closing checklist

- [ ] **Three tasks landed in 1 commit** (the alias config, script, and migrated imports are atomic — they all need to ship together for tsc/tests/build to stay green) with green grep + tsc + tests + build.
- [ ] **Phaser firewall preserved** — the migration is a path rewrite only; no module that previously didn't import phaser now does.
- [ ] **Test count unchanged:** 1330.
- [ ] **`scripts/migrate-imports.ts` kept in repo** as future-historical reference for "rename a folder, fix imports" or "add a new top-level folder, migrate to alias" recipes. No `package.json` script entry; runs via `npx tsx scripts/migrate-imports.ts` when needed.
- [ ] **Manual play verification:** `npm run dev` opens the game; spot-check the camp scene and one combat. The migration is mechanical and the test suite is comprehensive, but a quick smoke test rules out catastrophic alias-resolution failures the suite somehow missed.
- [ ] **Idempotency check (optional):** re-run `npx tsx scripts/migrate-imports.ts`; expect `Total: 0 imports rewritten across 0 files`. Confirms the script is safe to re-run.
- [ ] **HISTORY.md migration** — once the user confirms the work is good, follow the workflow in `CLAUDE.md`: move the TODO entry from Cluster B · 28 into HISTORY.md newest-first, slim template (Why / Decisions / Surprises / Source).
- [ ] **Spec + plan commit (doc-only)** — separate from implementation commit, awaiting user direction per CLAUDE.md.

**Test count delta from baseline:** 0 (1330 → 1330). Pure refactor.
