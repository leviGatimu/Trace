import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Settings } from '@trace/contracts';
import { App } from '@/app/App';
import { installMockBridge } from '@/test/setup';

const SETTINGS: Settings = {
  trackingEnabled: true,
  recordWindowTitles: true,
  idleDetectionEnabled: true,
  idleThresholdSeconds: 300,
  excludedExecutables: ['1password.exe'],
  retention: 'FOREVER',
  startWithWindows: true,
  launchMinimised: false,
  clockFormat: 'TWENTY_FOUR_HOUR',
  theme: 'DARK',
  developerLogging: false,
  importWindowsRecords: true,
  recordBackgroundApps: false,
  backgroundNoticeShown: true,
  dataDirectory: 'C:\\Users\\test\\AppData\\Local\\Trace\\Data',
  onboardingCompleted: true,
};

function mount(overrides: Partial<Settings> = {}, calls: [string, unknown][] = []) {
  const settings = { ...SETTINGS, ...overrides };

  installMockBridge({
    responses: {
      'settings.get': settings,
      'settings.update': settings,
      'system.status': {
        state: 'ACTIVE',
        trackingEnabled: settings.trackingEnabled,
        startedAt: Date.now(),
        lastHeartbeatAt: Date.now(),
        lastError: null,
      },
      'activity.getCurrent': null,
      'applications.list': [],
      'tracking.pause': { ...SETTINGS, trackingEnabled: false },
      'data.deleteAll': {
        sessionsDeleted: 12,
        windowSessionsDeleted: 30,
        eventsDeleted: 90,
        applicationsDeleted: 4,
      },
    },
    onRequest: (method, params) => calls.push([method, params]),
  });

  render(<App />);
}

/**
 * Navigates via the sidebar link, by role: the nav item and the page heading
 * both read Settings, so matching on text alone is ambiguous.
 */
async function gotoSettings(section?: string) {
  fireEvent.click(await screen.findByRole('link', { name: 'Settings' }));
  if (section) {
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${section}`) }));
  }
}

describe('settings, as the privacy centre', () => {
  it('states plainly what Trace never records', async () => {
    mount();
    await gotoSettings('Privacy');

    expect(await screen.findByText('Never recorded')).toBeDefined();
    expect(await screen.findByText('Keystrokes')).toBeDefined();
    expect(await screen.findByText('Screenshots')).toBeDefined();
    expect(await screen.findByText('Clipboard')).toBeDefined();
  });

  it('says that pausing survives a restart, because it does', async () => {
    // DOCS/specs/privacy.md §27. If the interface did not say so, the user would have
    // no way to know without testing it.
    mount({ trackingEnabled: false });
    await gotoSettings();

    expect(await screen.findByText(/This lasts until you resume, even after a restart/)).toBeDefined();
  });

  it('pauses through the tracker rather than by hiding anything', async () => {
    const calls: [string, unknown][] = [];
    mount({}, calls);

    await gotoSettings();
    // The page's own button, not the sidebar's: they share a name on purpose.
    const buttons = await screen.findAllByRole('button', { name: /Pause recording/ });
    fireEvent.click(buttons[buttons.length - 1]!);

    await waitFor(() => expect(calls.some(([method]) => method === 'tracking.pause')).toBe(true));
  });

  it('lists excluded applications and explains that nothing is written for them', async () => {
    mount();
    await gotoSettings('Excluded apps');

    expect((await screen.findAllByText('1password.exe')).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Nothing about them is written down/)).toBeDefined();
  });

  it('will not delete everything until the words are typed', async () => {
    const calls: [string, unknown][] = [];
    mount({}, calls);

    await gotoSettings('Your data');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete everything' }));

    // The confirmation appears, and the action is refused until the words are typed.
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete your whole history?' });
    const confirm = () =>
      Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Delete everything')!;
    expect(confirm().hasAttribute('disabled')).toBe(true);
    fireEvent.click(confirm());
    expect(calls.some(([method]) => method === 'data.deleteAll')).toBe(false);

    fireEvent.change(dialog.querySelector('input')!, { target: { value: 'DELETE ALL' } });
    fireEvent.click(confirm());

    await waitFor(() => expect(calls.some(([method]) => method === 'data.deleteAll')).toBe(true));
  });

  it('shows where the data actually lives', async () => {
    mount();
    await gotoSettings();

    expect(await screen.findByText(/AppData\\Local\\Trace\\Data/)).toBeDefined();
  });
});

describe('onboarding', () => {
  it('asks for consent before anything else, and names what is never collected', async () => {
    mount({ onboardingCompleted: false });

    // The headline is set across three lines, so match a clause rather than
    // the whole sentence.
    expect(await screen.findByText(/Your activity\./)).toBeDefined();
    expect(await screen.findByText('Keystrokes')).toBeDefined();

    // Deliberately not phrased as a Windows permission request: nothing here
    // needs one (implementation plan §13.4).
    expect(screen.queryByText(/needs access/i)).toBeNull();
  });

  it('records the choices the user actually made', async () => {
    const calls: [string, unknown][] = [];
    mount({ onboardingCompleted: false }, calls);

    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    // Turn window titles off before starting.
    fireEvent.click(await screen.findByRole('checkbox', { name: /Window titles/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start tracking' }));

    await waitFor(() => {
      const update = calls.find(([method]) => method === 'settings.update');
      expect(update).toBeDefined();
      expect(update![1]).toMatchObject({
        recordWindowTitles: false,
        idleDetectionEnabled: true,
        onboardingCompleted: true,
      });
    });
  });
});
