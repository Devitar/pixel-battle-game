# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-based pixel-art roguelike auto-battler in the style of *Darkest Dungeon* — the player manages a persistent roster of heroes at a camp, runs 3-hero expeditions into tiered dungeons, and chooses after every boss whether to cash out with loot or press deeper. Combat is ranked, position-based, and auto-resolved; the player's agency lives in setup, formation, gear, and the cash-out-vs-press-on decision.

**The full design is in [`gdd.md`](gdd.md).** Read it first for any feature work — it specifies combat model (positions, turn order, seven stats), classes, dungeon/floor structure, the economy (pack vs vault), death rules (Fallen vs Lost), meta-progression, and the tiered build plan.

## Commands

```bash
npm run dev              # Vite dev server at http://localhost:5173
npm run build            # tsc + vite build → dist/
npm run preview          # serve the production build locally
npm test                 # vitest run (one-shot, CI mode)
npm run test:watch       # vitest in watch mode
npm run generate:names   # regenerate src/render/sprite_names.generated.ts from spritenames.txt
```

Single-test invocation: `npx vitest run path/to/file.test.ts` or `npx vitest -t "name pattern"`.

## Architecture

### The Phaser firewall (load-bearing)

The single most important rule in this codebase:

> Files under `src/combat/`, `heroes/`, `items/`, `dungeon/`, `events/`, `run/`, `camp/`, `save/`, `data/`, and `util/` **must not import `phaser`**. Only `src/main.ts`, `scenes/`, `ui/`, and `render/` may.

This keeps game logic (combat resolution, AI priorities, loot rolls, save state) pure TypeScript that runs in Vitest without a browser, keeps tests fast, and enables a future headless simulator for balance work. If you find yourself wanting to `import * as Phaser` in a "core" folder, the concern belongs in a scene or UI widget — have the core folder expose a plain API and let the scene drive it.

`src/README.md` has the full directory table and placement rules.

### Three layers, plainly

1. **Core game logic** — pure TS modules in the firewalled folders above. No rendering.
2. **Scenes** (`src/scenes/`) — Phaser `Scene` subclasses. One per major screen (camp, dungeon, combat, camp-screen post-boss). Scenes own input handling and scene-lifecycle concerns; they call into core and tell UI widgets what to show.
3. **UI and render helpers** (`src/ui/`, `src/render/`) — reusable Phaser widgets (hero card, formation editor, pack panel) and the paperdoll/sprite-atlas helpers.

### Paperdoll + sprite catalog

Characters are rendered via layered 16×16 sprites: body, legs, feet, outfit, hair, hat, shield, weapon — drawn in that order by `render/paperdoll.ts`. Sprite frames are named in [`spritenames.txt`](spritenames.txt); running `npm run generate:names` parses that file into `src/render/sprite_names.generated.ts`, giving every frame a typed accessor like `SPRITE_NAMES.weapon.sword_tier2`. **Never edit `sprite_names.generated.ts` by hand** — edit `spritenames.txt` and regenerate. Adding a new sprite family is: draw in LibreSprite → export sheet → name frames in `spritenames.txt` → `npm run generate:names`.

### Content as TypeScript, not JSON

Classes, abilities, enemies, items, events, traits, perks, and names all live in `src/data/` as TS modules. Type safety + instant hot reload are the reasons; no runtime JSON loader. When adding content, extend the relevant `data/*.ts` module — do not introduce JSON files.

### Tests live in `__tests__/` per domain

A domain folder with tests has a `__tests__/` subdirectory alongside its source files — e.g., `src/render/paperdoll.ts` is tested by `src/render/__tests__/paperdoll.test.ts`. Test-support helpers live in the same `__tests__/` folder. Vitest picks them up automatically.

## Current build tier

The game design is ambitious; the build order is phased into tiers in `gdd.md §10`:

- **Tier 0** — paperdoll rendering, sprite catalog, codegen. *Done, in-repo.*
- **Tier 1** — vertical slice: 3 classes (Knight, Archer, Priest), 1 dungeon (Crypt, 3 linear floors), 4 stats, basic camp (Tavern/Barracks/Noticeboard), pack + cashout/press-on, permadeath, save/load. This is the next build target.
- **Tier 2** — feature-complete v1 (full 7-stat model, wounds, blacksmith, forks, shops, events, 6 classes).
- **Tier 3** — dungeons 2–4, unlockable classes, Training Grounds, Chapel, legendary tier, milestone achievements.

When asked to implement something, check which tier it belongs to and avoid building Tier 2/3 features before Tier 1 is done.

## Conventions for this repo

- **Never create git commits without explicit user instruction in the current turn.** The user runs their own commits and staging. Leave written changes in the working tree; do not `git add` or `git commit` preemptively. (This overrides skill defaults that suggest auto-committing.)
- Use `git mv` when moving files so history is preserved.
- Don't materialize empty directories. Create a folder when the first file lands in it, not before.

## Pointers

- [`gdd.md`](gdd.md) — full game design (combat, classes, dungeons, economy, meta, build tiers)
- [`src/README.md`](src/README.md) — `src/` directory layout and the Phaser firewall rule in detail
- [`README.md`](README.md) — tech stack, how to run, art pipeline
- [`spritenames.txt`](spritenames.txt) — sprite-sheet frame catalog (edit this, then `npm run generate:names`)
