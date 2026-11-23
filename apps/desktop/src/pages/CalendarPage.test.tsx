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

  it('labels the day with the figure the tracker computed', async () => {
    mount();

    // 7,260 seconds, formatted on the day's tile and named in its label.
    expect((await screen.findAllByText('2h 1m')).length).toBeGreaterThan(0);
    expect(await screen.findByTitle(/2h 1m in front/)).toBeDefined();
  });

  it('opens a day in the timeline, and never offers a day that has not happened', async () => {
    const requests = mount();

    // Days with nothing in front still open: their gaps are worth seeing.
    // Only the future is out of reach.
    const empty = await screen.findAllByTitle(/nothing recorded/);
    const today = new Date();
    for (const day of empty) {
      const number = Number(day.textContent?.match(/^\d+/)?.[0]);
      if (number > today.getDate() && day.getAttribute('aria-label')?.includes(today.toLocaleDateString(undefined, { month: 'long' }))) {
        expect(day.hasAttribute('disabled')).toBe(true);
      }
    }

    const recorded = await screen.findByTitle(/2h 1m in front/);
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
