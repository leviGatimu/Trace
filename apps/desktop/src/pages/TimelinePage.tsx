import { useMemo, useState } from 'react';
import type { TimelineEntry, TimelineSessionEntry, TimelineSystemEntry } from '@trace/contracts';
import { DayPicker } from '@/components/DayPicker';
import { SessionPanel } from '@/components/SessionPanel';
import {
  AppSwatch,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  StatusDot,
} from '@/components/primitives';
import { useConnection, useTimeline } from '@/hooks/useTracker';
import { appColor } from '@/lib/appColor';
import {
  clockTime,
  duration,
  localDayRange,
  relativeDay,
  startOfLocalDay,
  tidyWindowTitle,
} from '@/lib/format';

/**
 * The day, read top to bottom.
 *
 * Time is the left column, and everything hangs off it. No spine, no nodes, no
 * ornament — the alignment of the clock column is the structure, which is
 * exactly how a log reads.
 */
export function TimelinePage() {
  const [day, setDay] = useState(() => startOfLocalDay(new Date()));
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const range = useMemo(() => localDayRange(day), [day]);

  const connection = useConnection();
  const connected = connection.status === 'connected';
  const { data, isPending, error, refetch } = useTimeline(range, connected);

  return (
    <>
      <PageHeader
        title="Timeline"
        meta={relativeDay(day)}
        actions={<DayPicker day={day} onChange={setDay} />}
      />

      {!connected ? (
        <EmptyState title="Waiting for the tracker" />
      ) : error ? (
        <ErrorState message="The timeline could not be loaded." onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton rows={9} />
      ) : data.length === 0 ? (
        <EmptyState
          title="Nothing recorded for this day"
          detail="Pick another day, or leave Trace running and come back later."
        />
      ) : (
        <ol className="enter">
          {data.map((entry, index) => (
            <li key={key(entry, index)}>
              {entry.kind === 'session' ? (
                <SessionLine entry={entry} onSelect={setSelectedSessionId} />
              ) : (
                <SystemLine entry={entry} />
              )}
            </li>
          ))}
        </ol>
      )}

      {selectedSessionId !== null && (
        <SessionPanel sessionId={selectedSessionId} onClose={() => setSelectedSessionId(null)} />
      )}
    </>
  );
}

function SessionLine({
  entry,
  onSelect,
}: {
  entry: TimelineSessionEntry;
  onSelect: (sessionId: number) => void;
}) {
  const title = tidyWindowTitle(entry.primaryWindowTitle, entry.applicationName);

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.sessionId)}
      className="-mx-2 flex w-[calc(100%+1rem)] items-baseline gap-3 rounded-sm px-2 py-[11px] text-left transition-colors duration-150 hover:bg-lift"
    >
      <span className="data w-12 shrink-0 text-ink-4">{clockTime(entry.startedAt)}</span>

      <AppSwatch color={appColor(entry.executable)} />

      <span className="w-40 shrink-0 truncate text-ink">{entry.applicationName}</span>

      <span className="min-w-0 flex-1 truncate text-ink-3" title={entry.primaryWindowTitle ?? undefined}>
        {title ?? ''}
      </span>

      {entry.endedAt === null && <StatusDot state="live" />}

      {/* Why a session ended is recorded, so it can be said. A day containing
          a crash should admit it rather than quietly show a shorter session. */}
      {entry.endReason === 'CRASH_RECOVERY' && (
        <span className="shrink-0 text-warning">interrupted</span>
      )}

      {entry.idleSeconds > 0 && (
        <span className="data w-20 shrink-0 text-right text-ink-4">
          {duration(entry.idleSeconds)} idle
        </span>
      )}

      <span className="data w-16 shrink-0 text-right text-ink">
        {duration(entry.activeSeconds)}
      </span>
    </button>
  );
}

/**
 * Locked, asleep, paused. These are absences, so they are set quietly and
 * without the application columns — the shape of the row itself says "nothing
 * happened here".
 */
function SystemLine({ entry }: { entry: TimelineSystemEntry }) {
  const label = {
    LOCKED: 'Computer locked',
    ASLEEP: 'Computer asleep',
    PAUSED: 'Tracking paused',
    UNKNOWN: 'Not recorded',
  }[entry.interval];

  const length =
    entry.endedAt === null
      ? null
      : duration(Math.round((entry.endedAt - entry.startedAt) / 1000));

  return (
    <div className="flex items-baseline gap-3 py-[11px] text-ink-4">
      <span className="data w-12 shrink-0">{clockTime(entry.startedAt)}</span>
      <span className="flex-1 truncate">{label}</span>
      {length && <span className="data w-16 shrink-0 text-right">{length}</span>}
    </div>
  );
}

function key(entry: TimelineEntry, index: number): string {
  return entry.kind === 'session'
    ? `s${entry.sessionId}`
    : `y${entry.interval}-${entry.startedAt}-${index}`;
}
