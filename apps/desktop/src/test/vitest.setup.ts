import { configure } from '@testing-library/react';

/**
 * Testing Library waits one second by default. The interface has a genuine
 * chain to work through before anything appears — resolve the connection state,
 * enable the queries, fetch, render — and in jsdom that can exceed a second on
 * a loaded machine.
 *
 * Raised rather than papered over with fixed sleeps, which would be both slower
 * and flakier.
 */
configure({ asyncUtilTimeout: 5000 });

/**
 * jsdom has no matchMedia. Answer "reduce motion" so counters and transitions
 * show their final values at once, which is what the tests assert on.
 */
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
