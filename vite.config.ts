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
// by copying the platform-suffixed binaries (fontpack-win32-${arch}.exe) to
// a cache dir as plain-named .exe files (fontpack.exe) and prepending that
// dir to PATH so spawnSync can find them by bare name.
if (process.platform === 'win32') {
  const arch = process.arch;
  const pixelBinDir = path.resolve('node_modules/pixel-tools/bin');
  const shimDir = path.resolve('node_modules/.cache/pixel-tools-shims');

  try {
    mkdirSync(shimDir, { recursive: true });
  } catch (e) {
    throw new Error(
      `pixel-tools Windows shim: failed to create cache dir at ${shimDir}. ` +
      `The shim needs a writable node_modules/.cache/ — configure your CI to ` +
      `allow this, or run on a non-Windows runner. Original error: ${(e as Error).message}`,
    );
  }

  for (const tool of ['fontpack', 'atlaspack']) {
    const src = path.join(pixelBinDir, `${tool}-win32-${arch}.exe`);
    const dst = path.join(shimDir, `${tool}.exe`);
    if (!existsSync(src)) {
      throw new Error(
        `pixel-tools Windows shim: ${src} not found. ` +
        `Expected a pixel-tools binary for win32-${arch}. ` +
        `If you're on a non-x64 architecture (e.g., arm64), pixel-tools may not ship ` +
        `a binary for it — file an issue at the pixel-tools repo or run on x64 hardware. ` +
        `If you're on x64, try \`npm install\` to ensure pixel-tools is fully installed.`,
      );
    }
    if (!existsSync(dst)) {
      try {
        copyFileSync(src, dst);
      } catch (e) {
        throw new Error(
          `pixel-tools Windows shim: failed to copy ${src} → ${dst}. ` +
          `The shim needs a writable node_modules/.cache/ — configure your CI to ` +
          `allow this, or run on a non-Windows runner. Original error: ${(e as Error).message}`,
        );
      }
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
