import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { startOfLocalDay } from '@/lib/format';

/**
 * The day under review, shared by every screen.
 *
 * It lives in the URL (`?day=<local midnight, ms>`), so moving from the
 * calendar to the timeline to an application keeps the same day, a link can
 * carry it, and Back returns to where you were looking.
 */
export function useSelectedDay(): [Date, (day: Date) => void] {
  const [params, setParams] = useSearchParams();
  const day = useMemo(() => dayFromParam(params.get('day')), [params]);

  const setDay = useCallback(
    (next: Date) =>
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          updated.set('day', String(startOfLocalDay(next).getTime()));
          return updated;
        },
        { replace: true },
      ),
    [setParams],
  );

  return [day, setDay];
}

/** A path with the current day carried along, for links between screens. */
export function withDay(path: string, day: Date): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}day=${startOfLocalDay(day).getTime()}`;
}

/** Anything unreadable falls back to today rather than to an error. */
export function dayFromParam(value: string | null): Date {
  const parsed = value === null || value.trim() === '' ? Number.NaN : Number(value);
  return startOfLocalDay(parsed > 0 && Number.isFinite(parsed) ? new Date(parsed) : new Date());
}
