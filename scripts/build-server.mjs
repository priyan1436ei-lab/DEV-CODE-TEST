import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'dist-server');
const outFile = path.join(outDir, 'server.cjs');

async function buildStandaloneServer() {
  fs.mkdirSync(outDir, { recursive: true });

  await build({
    entryPoints: [path.join(rootDir, 'server.ts')],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['vite'],
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    sourcemap: false,
    minify: false,
    logLevel: 'info',
  });

  if (!fs.existsSync(outFile)) {
    throw new Error(`Expected server bundle at ${outFile}, but it was not generated.`);
  }

  const sizeKb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`[build-server] Bundled standalone production server -> dist-server/server.cjs (${sizeKb} KB)`);
}

buildStandaloneServer().catch((err) => {
  console.error('[build-server] Failed:', err);
  process.exit(1);
});
