import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'node:url';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { processAssetsDev, processAssetsProd } from 'pixel-tools';
import { assetsConfig } from './vite/assets.mjs';

const TOP_FOLDERS = [
  'camp', 'combat', 'data', 'dungeon', 'heroes', 'items',
  'render', 'run', 'save', 'scenes', 'ui', 'util',
];

const aliasFor = (folder: string) => ({
  find: `@${folder}`,
  replacement: fileURLToPath(new URL(`./src/${folder}`, import.meta.url)),
});

// On Windows, pixel-tools' spawnSync('fontpack', ...) fails: npm shims are
// .cmd files, which CreateProcess won't find without shell:true. Work around
// by copying the platform-suffixed binaries (fontpack-win32-x64.exe) to a
// cache dir as plain-named .exe files (fontpack.exe) and prepending that dir
// to PATH so spawnSync can find them by bare name.
if (process.platform === 'win32') {
  const pixelBinDir = path.resolve('node_modules/pixel-tools/bin');
  const shimDir = path.resolve('node_modules/.cache/pixel-tools-shims');
  mkdirSync(shimDir, { recursive: true });
  for (const tool of ['fontpack', 'atlaspack']) {
    const src = path.join(pixelBinDir, `${tool}-win32-x64.exe`);
    const dst = path.join(shimDir, `${tool}.exe`);
    if (!existsSync(src)) {
      throw new Error(
        `pixel-tools Windows shim: ${src} not found. ` +
        `This project currently requires win32-x64 binaries. ` +
        `If you're on win32-arm64, see vite.config.ts for the shim strategy.`,
      );
    }
    if (!existsSync(dst)) {
      copyFileSync(src, dst);
    }
  }
  if (!process.env.PATH?.includes(shimDir)) {
    process.env.PATH = shimDir + path.delimiter + (process.env.PATH ?? '');
  }
}

export default defineConfig(({ mode, command }) => ({
  plugins: [
    ...(mode === 'https' ? [basicSsl()] : []),
    command === 'serve' ? processAssetsDev(assetsConfig) : processAssetsProd(assetsConfig),
  ],
  resolve: {
    alias: TOP_FOLDERS.map(aliasFor),
  },
}));
