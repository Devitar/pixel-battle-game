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
src/
  main.ts         # Phaser.Game config + scene registration
  style.css       # host-page styling (canvas sizing, background)
public/           # static assets served as-is (sprites, audio, etc.)
```

## Art pipeline

Author sprites in LibreSprite, then **File → Export Sprite Sheet** to generate a PNG + JSON atlas. Drop both into `public/assets/` and load them in a scene's `preload()`:

```ts
this.load.atlas('hero', 'assets/hero.png', 'assets/hero.json');
```

## Notes

- Phaser 4's ESM build has no default export — import as `import * as Phaser from 'phaser'`.
- `pixelArt: true` is enabled in the game config so sprites stay crisp when scaled.
