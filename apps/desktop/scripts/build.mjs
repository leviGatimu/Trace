import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

/**
 * Bundles the Electron main and preload scripts.
 *
 * esbuild directly rather than a Vite Electron plugin: two entry points, one
 * platform, no HMR needed. Fewer moving parts to break when Vite or Electron
 * moves, and the whole build is legible in one file.
 *
 * Both emit CommonJS. Electron's preload must be CJS, and the main process is
 * simplest kept the same.
 */
export async function buildElectron({ watch = false, minify = false } = {}) {
  const shared = {
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    sourcemap: true,
    minify,
    // Provided by the Electron runtime; bundling them would break at load.
    external: ['electron'],
    logLevel: 'info',
  };

  const contexts = await Promise.all([
    build({
      ...shared,
      entryPoints: ['electron/main.ts'],
      outfile: 'dist-electron/main.cjs',
    }),
    build({
      ...shared,
      entryPoints: ['electron/preload.ts'],
      outfile: 'dist-electron/preload.cjs',
    }),
  ]);

  return contexts;
}

// pathToFileURL, not string concatenation: a Windows path produces
// file:///C:/... with three slashes, so a hand-built `file://` + path never
// matches and the build silently does nothing.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const { build: viteBuild } = await import('vite');

  await buildElectron({ minify: true });
  await viteBuild();

  console.log('\nBuilt Trace desktop: dist/ (renderer) and dist-electron/ (main, preload)');
}
