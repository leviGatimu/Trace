import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AnalyticsQuery, AnalyticsSummary } from '@trace/contracts';
import { App } from '@/app/App';
import { installMockBridge } from '@/test/setup';

/**
 * The analytics page states figures; it does not work them out.
 *
 * These tests make that checkable: the mock returns an average and a busiest
 * day that deliberately do not follow from the day totals, and the page is
 * expected to print what it was given. If someone later has the page divide a
 * total by a count, this fails — which is the point.
 */
describe('analytics', () => {
  beforeEach(() => {
    window.location.hash = '#/analytics';
  });

  function summaryFor({ dayStartsUtcMs }: AnalyticsQuery): AnalyticsSummary {
    return {
      fromUtcMs: dayStartsUtcMs[0]!,
      toUtcMs: dayStartsUtcMs.at(-1)! + 86_400_000,
      activeSeconds: 14_320,
      idleSeconds: 900,
      applicationCount: 4,
      sessionCount: 37,
      recordedDayCount: 3,
      // Not 14320/3 — the page must print this, not compute its own.
      averageActiveSecondsPerRecordedDay: 3661,
      days: dayStartsUtcMs.map((startUtcMs, index) => ({
        startUtcMs,
        activeSeconds: index === 0 ? 9000 : 0,
        sessionCount: index === 0 ? 12 : 0,
        applicationCount: index === 0 ? 3 : 0,
      })),
      busiestDayStartUtcMs: dayStartsUtcMs[0]!,
      hours: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        activeSeconds: hour === 14 ? 5000 : 0,
      })),
      topApplications: [
        {
          applicationId: 1,
          name: 'Visual Studio Code',
          executable: 'code.exe',
          activeSeconds: 8020,
          idleSeconds: 0,
          sessionCount: 9,
          lastUsedAt: dayStartsUtcMs[0]!,
        },
      ],
      longestSession: {
        sessionId: 5,
        applicationId: 1,
        applicationName: 'Visual Studio Code',
        executable: 'code.exe',
        startedAt: dayStartsUtcMs[0]! + 50_400_000,
        activeSeconds: 4440,
      },
    };
  }

  function mount() {
    installMockBridge({
      responses: {
        'analytics.getSummary': summaryFor,
        'activity.getCurrent': null,
      },
    });

    render(<App />);
  }

  it('prints the tracker\'s figures rather than deriving its own', async () => {
    mount();

    expect(await screen.findByText('3h 59m')).toBeDefined(); // 14,320s total
    expect(await screen.findByText('1h 1m on an average day')).toBeDefined(); // 3,661s, as given
    expect(await screen.findByText('4 applications')).toBeDefined();
    expect(await screen.findByText('15m idle')).toBeDefined();
  });

  it('names the longest stretch and the applications behind it', async () => {
    mount();

    expect(await screen.findByText(/Longest stretch/i)).toBeDefined();
    expect(await screen.findByText('1h 14m')).toBeDefined();
    expect(await screen.findAllByText('Visual Studio Code')).not.toHaveLength(0);
    expect(await screen.findByText('2h 14m')).toBeDefined(); // that application's 8,020s
  });

  it('offers every hour of the day, so an empty morning is visibly empty', async () => {
    mount();

    // One column per hour, plus one clickable day column for the recorded day.
    const columns = await screen.findAllByTitle(/·/);
    const hours = columns.filter((column) => /(AM|PM|^\d{1,2}\b)/.test(column.title));

    expect(hours.length).toBeGreaterThanOrEqual(24);
  });
});
