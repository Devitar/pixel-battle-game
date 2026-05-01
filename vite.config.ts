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
