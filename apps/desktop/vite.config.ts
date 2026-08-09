import { fileURLToPath, URL } from 'node:url';
import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
// From vitest rather than vite: the same file configures both, and only
// vitest's defineConfig knows about the `test` block.
import { defineConfig } from 'vitest/config';

/**
 * The shipped policy is strict: no remote origins, no inline script. Vite's dev
 * server needs an inline preamble and a websocket for hot reload, so the policy
 * is relaxed for `vite dev` only — production keeps the tight one that is
 * written in index.html.
 */
function relaxCspInDev() {
  return {
    name: 'trace:relax-csp-in-dev',
    apply: 'serve' as const,
    transformIndexHtml(html: string) {
      return html.replace(
        /<meta http-equiv="Content-Security-Policy"[^>]*>/,
        '<!-- CSP relaxed for the dev server; the shipped policy is in index.html -->',
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwind(), relaxCspInDev()],
  // Assets are loaded from file:// in the packaged app, so every URL must be
  // relative. An absolute /assets/... path resolves to the filesystem root and
  // the window comes up blank.
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@trace/contracts': fileURLToPath(
        new URL('../../packages/contracts/ts/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5273,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/vitest.setup.ts'],
    testTimeout: 20_000,
  },
});
