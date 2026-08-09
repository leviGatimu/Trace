import { useMemo, useState } from 'react';
import type { TimelineEntry, TimelineSessionEntry, TimelineSystemEntry } from '@trace/contracts';
import { DayPicker } from '@/components/DayPicker';
import { SessionPanel } from '@/components/SessionPanel';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  StatusDot,
} from '@/components/primitives';
import { useConnection, useTimeline } from '@/hooks/useTracker';
import { clockTime, duration, localDayRange, relativeDay, startOfLocalDay, tidyWindowTitle } from '@/lib/format';

/**
 * The signature page: the day, reconstructed.
 *
 * The design document describes it as a flight recorder, so it reads as one
 * continuous column of time rather than a grid of cards — including the
 * stretches where nothing was recorded, which are as much a part of the record
 * as the sessions.
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
        subtitle={relativeDay(day)}
        actions={<DayPicker day={day} onChange={setDay} />}
      />

      {!connected ? (
        <EmptyState title="Waiting for the tracker" />
      ) : error ? (
        <ErrorState message="The timeline could not be loaded." onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton rows={8} />
      ) : data.length === 0 ? (
        <EmptyState
          title="Nothing recorded for this day"
          detail="Switch to another day, or leave Trace running and come back later."
        />
      ) : (
        <ol className="fade-in relative border-l border-line pl-6">
          {data.map((entry, index) => (
            <TimelineRow
              key={rowKey(entry, index)}
              entry={entry}
              onSelect={setSelectedSessionId}
            />
          ))}
        </ol>
      )}

      {selectedSessionId !== null && (
        <SessionPanel sessionId={selectedSessionId} onClose={() => setSelectedSessionId(null)} />
      )}
    </>
  );
}

function TimelineRow({
  entry,
  onSelect,
}: {
  entry: TimelineEntry;
  onSelect: (sessionId: number) => void;
}) {
  return entry.kind === 'session' ? (
    <SessionRow entry={entry} onSelect={onSelect} />
  ) : (
    <SystemRow entry={entry} />
  );
}

function SessionRow({
  entry,
  onSelect,
}: {
  entry: TimelineSessionEntry;
  onSelect: (sessionId: number) => void;
}) {
  const title = tidyWindowTitle(entry.primaryWindowTitle, entry.applicationName);
  const isOpen = entry.endedAt === null;

  return (
    <li className="relative py-2">
      {/* The node on the spine. */}
      <span className="absolute -left-[25px] top-[15px] h-[5px] w-[5px] rounded-full bg-line-strong" />

      <button
        type="button"
        onClick={() => onSelect(entry.sessionId)}
        className="group flex w-full items-start gap-4 rounded-[5px] px-3 py-2 text-left transition-colors duration-150 hover:bg-card"
      >
        <span className="tabular w-12 shrink-0 pt-px text-ink-faint">
          {clockTime(entry.startedAt)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-ink">{entry.applicationName}</span>
            {isOpen && <StatusDot state="live" />}
          </span>

          {title && (
            <span className="mt-0.5 block truncate text-ink-dim" title={entry.primaryWindowTitle ?? undefined}>
              {title}
            </span>
          )}

          {/*
            Why a session ended is recorded, so it can be shown. A day that
            includes a crash should say so rather than quietly presenting a
            shorter session.
          */}
          {entry.endReason === 'CRASH_RECOVERY' && (
            <span className="mt-0.5 block text-warning">Interrupted — ended unexpectedly</span>
          )}
        </span>

        <span className="shrink-0 text-right">
          <span className="tabular block text-ink">{duration(entry.activeSeconds)}</span>
          {entry.idleSeconds > 0 && (
            <span className="tabular block text-ink-faint">
              {duration(entry.idleSeconds)} idle
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/**
 * Locked, asleep, paused. These are gaps rather than activity, so they are
 * rendered as quiet dividers instead of rows competing with real sessions.
 */
function SystemRow({ entry }: { entry: TimelineSystemEntry }) {
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
    <li className="relative py-2">
      <span className="absolute -left-[27px] top-[13px] h-[9px] w-[9px] rounded-full border border-line-strong bg-surface" />
      <div className="flex items-center gap-4 px-3 py-1 text-ink-faint">
        <span className="tabular w-12 shrink-0">{clockTime(entry.startedAt)}</span>
        <span className="flex-1 truncate">{label}</span>
        {length && <span className="tabular">{length}</span>}
      </div>
    </li>
  );
}

function rowKey(entry: TimelineEntry, index: number): string {
  return entry.kind === 'session'
    ? `session-${entry.sessionId}`
    : `system-${entry.interval}-${entry.startedAt}-${index}`;
}
