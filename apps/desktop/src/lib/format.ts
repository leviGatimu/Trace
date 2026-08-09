import type { DayRange } from '@trace/contracts';

/**
 * Formatting only.
 *
 * Everything here turns a number the tracker already computed into something
 * readable. Nothing in this file decides how long anything took — if a screen
 * needs a figure the contract does not return, the answer is to add it to the
 * contract, not to work it out here.
 */

/** `8020` → `2h 14m`. The form used everywhere a total is shown. */
export function duration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.max(0, Math.round(seconds))}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }

  // 119m reads worse than 1h 59m, but 60m rounding up to "2h 0m" reads worse
  // than either.
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** `1h 04m 12s`, for the live session timer where every second is visible. */
export function liveDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;

  return hours > 0
    ? `${hours}h ${pad(minutes)}m ${pad(remaining)}s`
    : `${minutes}m ${pad(remaining)}s`;
}

/** Local wall-clock time, e.g. `09:02`. Timestamps arrive in UTC. */
export function clockTime(utcMs: number): string {
  return new Date(utcMs).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function clockTimeWithSeconds(utcMs: number): string {
  return new Date(utcMs).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function longDate(utcMs: number): string {
  return new Date(utcMs).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function shortDate(utcMs: number): string {
  return new Date(utcMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** `Today`, `Yesterday`, or the date. */
export function relativeDay(dayStart: Date): string {
  const today = startOfLocalDay(new Date());
  const difference = Math.round((dayStart.getTime() - today.getTime()) / 86_400_000);

  if (difference === 0) return 'Today';
  if (difference === -1) return 'Yesterday';

  return dayStart.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Local-day boundaries as the UTC range the tracker expects.
 *
 * The client owns the timezone (contract §4). Using the browser's own date
 * arithmetic means daylight-saving days come out at 23 or 25 hours, which is
 * what actually happened, rather than a 24-hour assumption.
 */
export function localDayRange(day: Date): DayRange {
  const from = startOfLocalDay(day);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);

  return { fromUtcMs: from.getTime(), toUtcMs: to.getTime() };
}

export function startOfLocalDay(day: Date): Date {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function addDays(day: Date, days: number): Date {
  const next = new Date(day);
  next.setDate(next.getDate() + days);
  return next;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return startOfLocalDay(a).getTime() === startOfLocalDay(b).getTime();
}

/**
 * Window titles are recorded exactly as Windows reported them
 * (DOCS/Tracking.md, closing note), so tidying happens here at the last
 * possible moment and never in storage.
 */
export function tidyWindowTitle(title: string | null, applicationName: string): string | null {
  if (!title) {
    return null;
  }

  // "GitHub - Google Chrome" → "GitHub". Only the application's own suffix is
  // removed, so a title that merely contains a dash is left intact.
  const suffix = ` - ${applicationName}`;
  const trimmed = title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;

  return trimmed.trim() || null;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}
