import { spawn } from 'node:child_process';
import electron from 'electron';
import { createServer } from 'vite';
import { buildElectron } from './build.mjs';

/**
 * Development runner: Vite serves the interface, esbuild bundles the Electron
 * side, and Electron is launched pointing at the dev server.
 *
 * Editing a page hot-reloads. Editing the main process or preload does not —
 * restart. That is the honest trade for a dev setup with no plugin between us
 * and the two tools.
 */
const server = await createServer();
await server.listen();

const url = server.resolvedUrls?.local?.[0];
if (!url) {
  throw new Error('Vite did not report a dev server URL.');
}

server.printUrls();

await buildElectron();

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

child.on('close', async () => {
  await server.close();
  process.exit(0);
});
