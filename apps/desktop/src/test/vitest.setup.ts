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
