import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CalendarQuery, DayRange } from '@trace/contracts';
import { App } from '@/app/App';
import { installMockBridge } from '@/test/setup';

/**
 * The month grid, driven through the same bridge the real renderer has.
 *
 * The page asks for whichever days the current month happens to cover, so the
 * mock answers from the request rather than from fixed dates — otherwise the
 * test would start failing on the first of a month. The activity is put on the
 * 1st: always inside the month, always in the grid, and never in the future.
 */
describe('the calendar', () => {
  beforeEach(() => {
    window.location.hash = '#/calendar';
  });

  const isFirstOfThisMonth = (utcMs: number) => {
    const day = new Date(utcMs);
    return day.getDate() === 1 && day.getMonth() === new Date().getMonth();
  };

  function mount() {
    const requests: { method: string; params?: unknown }[] = [];

    installMockBridge({
      onRequest: (method, params) => requests.push({ method, params }),
      responses: {
        'activity.getCalendar': ({ dayStartsUtcMs }: CalendarQuery) =>
          dayStartsUtcMs.map((startUtcMs) => ({
            startUtcMs,
            activeSeconds: isFirstOfThisMonth(startUtcMs) ? 7260 : 0,
            sessionCount: isFirstOfThisMonth(startUtcMs) ? 4 : 0,
            applicationCount: isFirstOfThisMonth(startUtcMs) ? 2 : 0,
          })),
        'activity.getTimeline': [],
        'activity.getCurrent': null,
      },
    });

    render(<App />);

    return requests;
  }

  it('totals the month and labels the day, using figures it only formats', async () => {
    mount();

    // 7,260 seconds, shown twice: once as the month's total, once on the day.
    expect(await screen.findAllByText('2h 1m')).toHaveLength(2);
    expect(await screen.findByText('1 day recorded')).toBeDefined();
  });

  it('opens a recorded day in the timeline, and leaves empty days unclickable', async () => {
    const requests = mount();

    const empty = await screen.findAllByTitle('Nothing recorded');
    expect(empty.every((day) => day.hasAttribute('disabled'))).toBe(true);

    const recorded = await screen.findByTitle('2h 1m · 4 sessions');
    const asked = requests.find((r) => r.method === 'activity.getCalendar')!
      .params as CalendarQuery;
    const firstOfMonth = asked.dayStartsUtcMs.find(isFirstOfThisMonth);

    recorded.click();

    // The timeline is then asked for exactly the day that was clicked.
    await waitFor(() => {
      const timeline = requests.findLast((r) => r.method === 'activity.getTimeline');

      expect((timeline?.params as DayRange | undefined)?.fromUtcMs).toBe(firstOfMonth);
    });
  });
});
