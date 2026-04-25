# Pixel Battle Game

A browser-based pixel battle game.

## Tech stack

- **[Phaser 4](https://phaser.io/)** — HTML5 game framework (rendering, scenes, input, physics)
- **[Vite](https://vite.dev/)** — dev server and production bundler
- **[TypeScript](https://www.typescriptlang.org/)** — typed game code
- **[LibreSprite](https://libresprite.github.io/)** — pixel art and sprite sheet authoring

## Getting started

```bash
npm install
npm run dev      # start dev server at http://localhost:5173
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build locally
```

## Project layout

```
index.html        # Vite entry, mounts the game into #game
src/              # game code — see src/README.md for the layout
public/           # static assets served as-is (sprites, audio, etc.)
scripts/          # build-time helpers (sprite name codegen, etc.)
```

See [`src/README.md`](src/README.md) for the `src/` directory structure and the rules about where new files belong.

## Art pipeline

Author sprites in LibreSprite, then **File → Export Sprite Sheet** to generate a PNG + JSON atlas. Drop both into `public/assets/sprites/` (or `public/assets/animated/` for animated sprites) and load them in a scene's `preload()`:

```ts
this.load.atlas('hero', 'assets/sprites/hero.png', 'assets/sprites/hero.json');
```

Asset layout under `public/assets/`:

- `sprites/` — static sprite sheets (characters, tilesets, props).
- `animated/` — animated sprites + frame metadata (`animation_info.json`).
- `fonts/` — pixel fonts.

## Notes

- Phaser 4's ESM build has no default export — import as `import * as Phaser from 'phaser'`.
- `pixelArt: true` is enabled in the game config so sprites stay crisp when scaled.
