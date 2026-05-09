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

## Asset layout

The project has three asset locations, each with a different purpose:

- **`assets/`** — pixui inputs (sprite PNGs + bitmap-font PNGs + YAML manifests).
  Build-time only. Packed into atlases by [pixel-tools](https://www.npmjs.com/package/pixel-tools)
  via the Vite plugin defined in `vite/assets.mjs`. Not served at runtime.
- **`public/assets/`** — runtime-served audio + animated sprites + Phaser spritesheets
  (legacy game assets predating pixui). Vite copies this directory to `dist/assets/`
  unchanged during build.
- **`public/packed_assets/`** — pixel-tools build output (gitignored). Contains
  `mana_soul.png`/`mana_soul.json` (UI atlas) and `fonts.png`/`fonts.json`
  (bitmap-font atlas). Regenerated automatically when files in `assets/` change.

YAML manifests:
- `assets/ui.yaml` — sprite atlas description (frame sizes, slices, output target)
- `assets/fonts.yaml` — bitmap-font character map and source PNG references

## Pixel-tools pipeline

Asset packing runs as part of the Vite dev server / build. Configuration lives in
`vite/assets.mjs`:

```javascript
export const assetsConfig = {
  source_path: "assets",                          // where YAMLs + PNGs live
  destination_path: "public/packed_assets",       // build output directory
  fonts: [{ source: "fonts.yaml" }],              // font manifests
  atlases: [{ source: "ui.yaml", target: "mana_soul" }],  // atlas manifests
};
```

Both YAMLs are watched in dev mode — any change re-packs the affected atlas
without restarting the server.

## Windows shim

pixel-tools ships its CLI binaries as npm `.cmd` shims. Node's `spawnSync`
without `shell: true` can't resolve them on Windows. To work around this,
`vite.config.ts` copies the `.exe` binaries into `node_modules/.cache/pixel-tools-shims/`
at module-load time and prepends that directory to PATH. Linux/Mac unaffected.

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
