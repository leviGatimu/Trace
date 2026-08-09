import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { DayRange } from '@trace/contracts';
import { bridge, trace, type ConnectionState } from '@/services/trace';

/**
 * Whether the tracker is reachable.
 *
 * Everything else in the interface depends on this: when the tracker is gone,
 * screens must say so rather than showing a spinner forever or, worse, stale
 * numbers as though they were current (DOCS/Windows Integration §21).
 */
export function useConnection(): ConnectionState {
  const [state, setState] = useState<ConnectionState>({ status: 'connecting' });

  useEffect(() => {
    void bridge.connectionState().then(setState);
    return bridge.onConnectionState(setState);
  }, []);

  return state;
}

export function useStatus(enabled: boolean) {
  return useQuery({
    queryKey: ['status'],
    queryFn: trace.status,
    enabled,
    refetchInterval: 15_000,
  });
}

/**
 * The live session, polled once a second.
 *
 * The tracker extrapolates its counters to the moment of the request, so the
 * timer advances smoothly rather than stepping every thirty seconds when a
 * heartbeat lands.
 */
export function useCurrentActivity(enabled: boolean) {
  return useQuery({
    queryKey: ['activity', 'current'],
    queryFn: trace.current,
    enabled,
    refetchInterval: 1000,
    staleTime: 0,
  });
}

export function useDay(range: DayRange, enabled: boolean) {
  return useQuery({
    queryKey: ['activity', 'day', range.fromUtcMs, range.toUtcMs],
    queryFn: () => trace.day(range),
    enabled,
  });
}

export function useTimeline(range: DayRange, enabled: boolean) {
  return useQuery({
    queryKey: ['activity', 'timeline', range.fromUtcMs, range.toUtcMs],
    queryFn: () => trace.timeline(range),
    enabled,
  });
}

/**
 * A span of days, each with its totals.
 *
 * Keyed on the ends of the span rather than on the whole array, so a re-render
 * that rebuilds the same list of dates does not look like a new query.
 */
export function useCalendar(dayStartsUtcMs: number[], enabled: boolean) {
  return useQuery({
    queryKey: ['activity', 'calendar', dayStartsUtcMs[0], dayStartsUtcMs.at(-1)],
    queryFn: () => trace.calendar(dayStartsUtcMs),
    enabled: enabled && dayStartsUtcMs.length > 0,
  });
}

export function useAnalytics(dayStartsUtcMs: number[], enabled: boolean) {
  return useQuery({
    queryKey: ['activity', 'analytics', dayStartsUtcMs[0], dayStartsUtcMs.at(-1)],
    queryFn: () => trace.analytics(dayStartsUtcMs),
    enabled: enabled && dayStartsUtcMs.length > 0,
  });
}

export function useApplications(range: DayRange, enabled: boolean) {
  return useQuery({
    queryKey: ['activity', 'applications', range.fromUtcMs, range.toUtcMs],
    queryFn: () => trace.applications(range),
    enabled,
  });
}

export function useApplication(applicationId: number | null, range: DayRange, enabled: boolean) {
  return useQuery({
    queryKey: ['activity', 'application', applicationId, range.fromUtcMs, range.toUtcMs],
    queryFn: () => trace.application(applicationId!, range),
    enabled: enabled && applicationId !== null,
  });
}

/**
 * Search, debounced.
 *
 * Queries shorter than two characters are refused by the tracker, so the
 * interface simply does not ask.
 */
export function useSearch(text: string, enabled: boolean) {
  const [debounced, setDebounced] = useState(text);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text), 180);
    return () => clearTimeout(timer);
  }, [text]);

  const query = useQuery({
    queryKey: ['activity', 'search', debounced],
    queryFn: () => trace.search(debounced),
    enabled: enabled && debounced.trim().length >= 2,
  });

  return { ...query, isDebouncing: debounced !== text };
}
