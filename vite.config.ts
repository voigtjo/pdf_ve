import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

// Baut die Erweiterung nach dist/. Die HTML-Seiten liegen unter src/,
// das Manifest kommt unverändert aus public/.
export default defineConfig({
  root: resolve(here, 'src'),
  publicDir: resolve(here, 'public'),
  base: '',
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    target: 'chrome120',
    sourcemap: true,
    // pdf.js ist groß; für eine lokal geladene Erweiterung ist das unkritisch.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        popup: resolve(here, 'src/popup/index.html'),
        editor: resolve(here, 'src/editor/index.html'),
        background: resolve(here, 'src/background.ts'),
      },
      output: {
        // Der Service Worker braucht einen festen Namen fürs Manifest.
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
