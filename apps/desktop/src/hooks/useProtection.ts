import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { TamperEntry, TamperKind } from '@trace/contracts';
import { trace } from '@/services/trace';

/** Entries worth a look: anything that stopped Trace, weakened it, or tried to. */
const ROUTINE: ReadonlySet<TamperKind> = new Set(['paused', 'resumed', 'updated', 'protection-on', 'pin-changed']);

export function needsAttention(entry: TamperEntry) {
  return !ROUTINE.has(entry.kind);
}

export function useProtection(enabled: boolean) {
  return useQuery({
    queryKey: ['protection', 'status'],
    queryFn: trace.protectionStatus,
    enabled,
    refetchInterval: 5_000,
    retry: false,
  });
}

export function useTamperLog(enabled: boolean) {
  return useQuery({
    queryKey: ['protection', 'log'],
    queryFn: () => trace.tamperLog(200),
    enabled,
    refetchInterval: 15_000,
    retry: false,
  });
}

const SEEN_KEY = 'trace.protection.seenUntil';
const SEEN_EVENT = 'trace:protection-seen';

function readSeenUntil(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** Called by the Protection page: everything up to `at` has been seen. Per viewer, and optional. */
export function markSeen(at: number) {
  try {
    if (at > readSeenUntil()) {
      localStorage.setItem(SEEN_KEY, String(at));
      window.dispatchEvent(new Event(SEEN_EVENT));
    }
  } catch {
    // Storage unavailable: the badge simply stays.
  }
}

/** Entries needing a look that arrived since the Protection page was last open, for the sidebar badge. */
export function useUnseenTamperCount(enabled: boolean) {
  const log = useTamperLog(enabled);
  const [seenUntil, setSeenUntil] = useState(readSeenUntil);

  useEffect(() => {
    const update = () => setSeenUntil(readSeenUntil());
    window.addEventListener(SEEN_EVENT, update);
    return () => window.removeEventListener(SEEN_EVENT, update);
  }, []);

  return (log.data ?? []).filter((entry) => entry.atUtcMs > seenUntil && needsAttention(entry)).length;
}
