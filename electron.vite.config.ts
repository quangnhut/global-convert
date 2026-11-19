import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const alias = { '@shared': resolve(import.meta.dirname, 'src/shared') };

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      rolldownOptions: {
        // The engine runs in its own utilityProcess; built next to main as out/main/engine.js.
        input: {
          index: resolve(import.meta.dirname, 'src/main/index.ts'),
          engine: resolve(import.meta.dirname, 'src/engine/index.ts'),
        },
      },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      // Sandboxed preload scripts must be CommonJS.
      rolldownOptions: {
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    resolve: { alias },
    plugins: [react()],
  },
});
