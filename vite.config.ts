import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

// Die Versionsnummer steht nur in package.json und wird beim Bauen ins Manifest übernommen.
function syncManifestVersion(): Plugin {
  return {
    name: 'sync-manifest-version',
    closeBundle() {
      const { version } = JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf8'));
      const path = resolve(here, 'dist/manifest.json');
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      manifest.version = version;
      writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
    },
  };
}

// pdf.js lädt Bild-Decoder (WebAssembly), Schriften und CMaps zur Laufzeit nach.
// Manifest V3 verbietet Code aus dem Netz, daher kommen sie mit in dist/pdfjs/.
function copyPdfjsAssets(): Plugin {
  return {
    name: 'copy-pdfjs-assets',
    closeBundle() {
      for (const dir of ['wasm', 'cmaps', 'standard_fonts', 'iccs']) {
        cpSync(resolve(here, 'node_modules/pdfjs-dist', dir), resolve(here, 'dist/pdfjs', dir), {
          recursive: true,
        });
      }
    },
  };
}

// Baut die Erweiterung nach dist/. Die HTML-Seiten liegen unter src/,
// das Manifest kommt unverändert aus public/.
export default defineConfig({
  root: resolve(here, 'src'),
  publicDir: resolve(here, 'public'),
  base: '',
  plugins: [copyPdfjsAssets(), syncManifestVersion()],
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
