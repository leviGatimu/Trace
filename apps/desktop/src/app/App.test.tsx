import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DayActivity } from '@trace/contracts';
import { installMockBridge } from '@/test/setup';
import { App } from './App';

const DAY_START = new Date(2026, 7, 9).getTime();

function dayWith(overrides: Partial<DayActivity> = {}): DayActivity {
  return {
    range: { fromUtcMs: DAY_START, toUtcMs: DAY_START + 86_400_000 },
    // Deliberately not equal to any single application's total, so a test
    // asserting on the day figure cannot accidentally match a row instead.
    totalActiveSeconds: 14_320,
    totalIdleSeconds: 420,
    applicationCount: 2,
    sessionCount: 5,
    applications: [
      {
        applicationId: 1,
        name: 'Google Chrome',
        executable: 'chrome.exe',
        activeSeconds: 8020,
        idleSeconds: 420,
        sessionCount: 3,
        lastUsedAt: DAY_START,
      },
      {
        applicationId: 2,
        name: 'Visual Studio Code',
        executable: 'code.exe',
        activeSeconds: 6300,
        idleSeconds: 0,
        sessionCount: 2,
        lastUsedAt: DAY_START,
      },
    ],
    hourBuckets: Array.from({ length: 24 }, (_, hour) => ({
      startUtcMs: DAY_START + hour * 3_600_000,
      activeSeconds: hour === 9 ? 3600 : 0,
    })),
    ...overrides,
  };
}

describe('the dashboard', () => {
  it('shows the day using figures the tracker computed', async () => {
    installMockBridge({
      responses: {
        'activity.getDay': dayWith(),
        'system.status': {
          state: 'ACTIVE',
          trackingEnabled: true,
          startedAt: DAY_START,
          lastHeartbeatAt: DAY_START,
          lastError: null,
        },
        'activity.getCurrent': null,
      },
    });

    render(<App />);

    // 14,320 seconds formatted, not recomputed from anything.
    expect(await screen.findByText('3h 59m')).toBeDefined();
    expect(await screen.findByText('2h 14m')).toBeDefined();
    expect(await screen.findByText('Google Chrome')).toBeDefined();
    expect(await screen.findByText('Visual Studio Code')).toBeDefined();
  });

  it('says so plainly when there is nothing recorded, rather than showing zeros', async () => {
    installMockBridge({
      responses: {
        'activity.getDay': dayWith({
          totalActiveSeconds: 0,
          totalIdleSeconds: 0,
          applicationCount: 0,
          sessionCount: 0,
          applications: [],
        }),
        'system.status': {
          state: 'ACTIVE',
          trackingEnabled: true,
          startedAt: DAY_START,
          lastHeartbeatAt: DAY_START,
          lastError: null,
        },
        'activity.getCurrent': null,
      },
    });

    render(<App />);

    expect(await screen.findByText(/Nothing recorded for this day/)).toBeDefined();
  });

  it('offers to restart the tracker when it is unavailable, and never shows stale data as live', async () => {
    // DOCS/Windows Integration §21: not "Something went wrong".
    const { restartTracker } = installMockBridge({
      connection: { status: 'unavailable', reason: 'The Trace tracker is not running.' },
    });

    render(<App />);

    expect(await screen.findByText('Tracker unavailable')).toBeDefined();
    expect(await screen.findByText(/The Trace tracker is not running/)).toBeDefined();

    const button = await screen.findByRole('button', { name: 'Restart tracker' });
    button.click();

    await waitFor(() => expect(restartTracker).toHaveBeenCalled());

    // The live indicator must not claim to be tracking.
    expect(await screen.findByText('Not tracking')).toBeDefined();
  });

  it('refuses to interpret a contract version it does not understand', async () => {
    installMockBridge({
      connection: { status: 'incompatible', trackerContractVersion: '2.0' },
    });

    render(<App />);

    expect(await screen.findByText('Trace needs updating')).toBeDefined();
  });

  it('always tells the user whether anything is being recorded', async () => {
    installMockBridge({
      responses: {
        'activity.getDay': dayWith(),
        'system.status': {
          state: 'ACTIVE',
          trackingEnabled: false,
          startedAt: DAY_START,
          lastHeartbeatAt: DAY_START,
          lastError: null,
        },
        'activity.getCurrent': null,
      },
    });

    render(<App />);

    // DOCS/Privacy.md §11 — the answer to "is this thing recording me?" is
    // always visible.
    expect(await screen.findByText('Paused')).toBeDefined();
    expect(await screen.findByText(/Nothing is being recorded/)).toBeDefined();
    expect(await screen.findByText(/Everything stays on this device/)).toBeDefined();
  });
});
