import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const alias = { '@core': resolve('src/core'), '@shared': resolve('src/shared') };

// Módulos nativos e pesados ficam fora do bundle e são carregados do node_modules empacotado.
const external = [
  'better-sqlite3-multiple-ciphers', 'sqlite-vec', 'sherpa-onnx-node', 'playwright-core',
  '@azure/msal-node', 'exceljs', 'docx', 'pdf-lib', 'unpdf', 'linkedom', '@mozilla/readability', 'turndown',
  '@modelcontextprotocol/sdk', '@anthropic-ai/sdk', 'openai', 'croner', 'zod',
];

export default defineConfig({
  main: {
    resolve: { alias },
    build: { rollupOptions: { external, input: { index: resolve('src/main/index.ts') } } },
  },
  preload: {
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        // Preload com sandbox precisa ser CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: { alias },
    plugins: [react()],
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } },
  },
});
