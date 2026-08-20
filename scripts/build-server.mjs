// Bundles the TypeScript server into a single CommonJS file that Electron can
// run directly with its built-in Node runtime (ELECTRON_RUN_AS_NODE=1). This is
// what makes the packaged kiosk fully portable — no system Node, pnpm, or tsx
// required on the target machine.
//
//   node scripts/build-server.mjs   ->   build/server/server.cjs
//
// gphoto2 / ffmpeg are still invoked as external system binaries (not bundled);
// they must be installed on the kiosk machine.

import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outfile = path.join(root, 'build', 'server', 'server.cjs');

// The server uses NodeNext-style imports (`./config.js`) that actually point at
// `.ts` sources. esbuild won't rewrite the extension on its own, so this plugin
// resolves relative `*.js` specifiers to their `*.ts` sibling when present.
const tsExtensionResolver = {
  name: 'ts-extension-resolver',
  setup(b) {
    b.onResolve({ filter: /\.js$/ }, (args) => {
      if (!args.importer || !args.path.startsWith('.')) return null;
      const tsPath = path.resolve(
        path.dirname(args.importer),
        args.path.replace(/\.js$/, '.ts'),
      );
      if (fs.existsSync(tsPath)) return { path: tsPath };
      return null;
    });
  },
};

await build({
  entryPoints: [path.join(root, 'server', 'index.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: false,
  minify: false,
  // Keep dynamic optional deps from breaking the build if they aren't present.
  logOverride: { 'require-resolve-not-external': 'silent' },
  plugins: [tsExtensionResolver],
  // The server source uses `import.meta.url` (ESM). In a CJS bundle that would
  // be empty and crash `fileURLToPath`, so map it to the real bundle location.
  define: { 'import.meta.url': 'IMPORT_META_URL' },
  banner: {
    js: "const IMPORT_META_URL = require('url').pathToFileURL(__filename).href;",
  },
});

console.log(`[build-server] wrote ${path.relative(root, outfile)}`);
