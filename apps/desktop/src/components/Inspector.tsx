import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CoverageSegment, EventRow, TimelineEntry } from '@trace/contracts';
import { AnimatedClock, StatusPill } from '@/components/bento';
import { coverageLabel } from '@/components/Evidence';
import { Icon } from '@/components/Icon';
import { AppMark } from '@/components/primitives';
import { useConnection, useCoverage, useTimeline } from '@/hooks/useTracker';
import { appColor } from '@/lib/appColor';
import { clockTime, clockTimeWithSeconds, duration, localDayRange, longDate, tidyWindowTitle } from '@/lib/format';
import { trace } from '@/services/trace';

/** What the drawer is showing: a recorded session, or a stretch without one. */
export type Selection = { kind: 'session'; sessionId: number } | { kind: 'gap'; segment: CoverageSegment };

/**
 * The record drawer: one record in full, in plain words first and the
 * technical detail after, with what happened just before and after it.
 */
export function Inspector({
  selection,
  onSelect,
  onClose,
}: {
  selection: Selection;
  onSelect: (next: Selection) => void;
  onClose: () => void;
}) {
  // Every record opens at its top, however far the last one was scrolled.
  const scroller = useRef<HTMLDivElement | null>(null);
  const key = selection.kind === 'session' ? `s${selection.sessionId}` : `g${selection.segment.startedAt}`;
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [key]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px]" onClick={onClose} role="presentation" />
      <aside
        className="fixed bottom-3 right-3 top-3 z-40 flex w-[500px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[26px] bg-[#141416] shadow-[0_30px_80px_rgb(0_0_0/70%)] ring-1 ring-white/[0.06]"
        style={{ animation: 'panel-in 260ms cubic-bezier(0.22,1,0.36,1) both' }}
        aria-label="Record details"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.07] text-ink-2 transition hover:rotate-90 hover:bg-white/[0.12] hover:text-ink"
          title="Close (Esc)"
        >
          <Icon name="close" label="Close details" />
        </button>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-7 pb-8 pt-7">
          {selection.kind === 'session' ? (
            <SessionView key={selection.sessionId} sessionId={selection.sessionId} onSelect={onSelect} />
          ) : (
            <GapView key={selection.segment.startedAt} segment={selection.segment} onSelect={onSelect} />
          )}
        </div>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */

function SessionView({ sessionId, onSelect }: { sessionId: number; onSelect: (next: Selection) => void }) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['activity', 'session', sessionId],
    queryFn: () => trace.session(sessionId),
  });

  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-[16px] text-ink">This record could not be loaded.</p>
        <button type="button" className="mt-3 rounded-full bg-white/[0.08] px-4 py-2 text-ink-2 hover:text-ink" onClick={() => void refetch()}>
          Try again
        </button>
      </div>
    );
  }
  if (isPending) return <DrawerSkeleton />;

  const colour = appColor(data.applicationName);
  const end = data.endedAt;
  const total = data.activeSeconds + data.idleSeconds;
  const windows = data.windowSessions;

  return (
    <div className="rise">
      {/* Header */}
      <div className="flex items-center gap-4 pr-12">
        <AppMark name={data.applicationName} color={colour} size={60} applicationId={data.applicationId} />
        <div className="min-w-0">
          <h2 className="text-[24px] font-medium leading-tight tracking-[-0.02em] text-ink [overflow-wrap:anywhere]">
            {data.applicationName}
          </h2>
          <p className="mt-1 text-[14px] text-ink-3">{longDate(data.startedAt)}</p>
        </div>
      </div>

      {/* The span, big */}
      <div className="relative mt-6 overflow-hidden rounded-[20px] p-5" style={{ background: `color-mix(in srgb, ${colour} 14%, #1c1c20)` }}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[13px] text-ink-3">In front for</p>
            <p className="mt-1 text-[40px] font-medium leading-none tracking-[-0.03em] text-ink">{end === null ? 'now' : duration(total)}</p>
          </div>
          <div className="text-right">
            <p className="text-[15px] font-medium text-ink">{clockTimeWithSeconds(data.startedAt)}</p>
            <p className="my-0.5 text-[12px] text-ink-4">to</p>
            <p className="text-[15px] font-medium text-ink">{end === null ? 'still open' : clockTimeWithSeconds(end)}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusPill tone="mint">Observed by Trace</StatusPill>
          {data.idleSeconds > 0 && <StatusPill tone="grey">{duration(data.idleSeconds)} without input</StatusPill>}
          {data.endReason === 'CRASH_RECOVERY' && <StatusPill tone="peach">End time estimated</StatusPill>}
        </div>
      </div>

      {/* Windows */}
      {windows.length > 0 && (
        <Section title="Window" count={windows.length > 1 ? windows.length : undefined}>
          <ul className="space-y-2">
            {windows.map((window) => (
              <li key={window.windowSessionId} className="rounded-[16px] bg-white/[0.04] px-4 py-3">
                <p className="text-[15px] leading-snug text-ink [overflow-wrap:anywhere]">
                  {tidyWindowTitle(window.title, data.applicationName) ?? window.title ?? 'No title'}
                </p>
                <p className="mt-1 text-[12.5px] text-ink-4">
                  {clockTimeWithSeconds(window.startedAt)} for {duration(window.durationSeconds)}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Facts */}
      <Section title="Details">
        <div className="grid grid-cols-2 gap-2">
          <Fact label="Active" value={duration(data.activeSeconds)} />
          <Fact label="Without input" value={data.idleSeconds > 0 ? duration(data.idleSeconds) : 'None'} />
          <Fact label="Process ID" value={data.processId === null ? 'Not recorded' : String(data.processId)} muted={data.processId === null} />
          <Fact label="Ended because" value={endReasonLabel(data.endReason)} />
        </div>
        <div className="mt-2 rounded-[16px] bg-white/[0.04] px-4 py-3">
          <p className="text-[12.5px] text-ink-4">Program file</p>
          <p className="mt-0.5 text-[15px] font-medium text-ink">{data.executable}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3 [overflow-wrap:anywhere]">
            {data.executablePath ?? 'Location not readable (protected program)'}
          </p>
        </div>
      </Section>

      {/* What happened */}
      <Section title="What happened">
        <ol className="relative ml-1.5 border-l border-white/10 pl-5">
          {data.events.map((event) => (
            <li key={event.eventId} className="relative pb-3.5 last:pb-0">
              <span className="absolute -left-[26px] top-[5px] h-2.5 w-2.5 rounded-full border-2 border-[#141416]" style={{ background: colour }} />
              <p className="text-[14.5px] text-ink">{eventLabel(event)}</p>
              <p className="text-[12.5px] text-ink-4">{clockTimeWithSeconds(event.timestamp)}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Nearby at={data.startedAt} until={end ?? Date.now()} currentSessionId={data.sessionId} onSelect={onSelect} />

      <Limits>
        This shows {data.applicationName} was the app in front, and which window it showed. It cannot show who was at the
        keyboard, or what was read, opened, played or sent inside it.
      </Limits>

      <RecordId ids={[`S-${data.sessionId}`, ...windows.map((window) => `W-${window.windowSessionId}`)]} />
    </div>
  );
}

function GapView({ segment, onSelect }: { segment: CoverageSegment; onSelect: (next: Selection) => void }) {
  const end = segment.endedAt;
  const dormant = segment.kind === 'powered-off' || segment.kind === 'asleep' || segment.kind === 'signed-out';
  const tint = dormant ? '#f6dc7c' : '#f4a06b';

  return (
    <div className="rise">
      <div className="flex items-center gap-4 pr-12">
        <span className="flex h-[60px] w-[60px] items-center justify-center rounded-[18px]" style={{ background: `${tint}22`, color: tint }}>
          <AnimatedClock size={28} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[24px] font-medium leading-tight tracking-[-0.02em] text-ink">{coverageLabel[segment.kind]}</h2>
          <p className="mt-1 text-[14px] text-ink-3">{longDate(segment.startedAt)}</p>
        </div>
      </div>

      <div className="mt-6 rounded-[20px] p-5" style={{ background: `color-mix(in srgb, ${tint} 12%, #1c1c20)` }}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[13px] text-ink-3">Lasted</p>
            <p className="mt-1 text-[40px] font-medium leading-none tracking-[-0.03em] text-ink">
              {duration(Math.round(((end ?? Date.now()) - segment.startedAt) / 1000))}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[15px] font-medium text-ink">
              {segment.startEstimated && '~'}
              {clockTimeWithSeconds(segment.startedAt)}
            </p>
            <p className="my-0.5 text-[12px] text-ink-4">to</p>
            <p className="text-[15px] font-medium text-ink">{end === null ? 'now' : clockTimeWithSeconds(end)}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {segment.evidence === 'observed' ? (
            <StatusPill tone="mint">{segment.source === 'windows' ? 'Recorded by Windows' : 'Recorded by Trace'}</StatusPill>
          ) : segment.evidence === 'inferred' ? (
            <StatusPill tone="peach">No record, reason worked out</StatusPill>
          ) : (
            <StatusPill tone="grey">Nothing known</StatusPill>
          )}
          {segment.startEstimated && <StatusPill tone="peach">Start time estimated</StatusPill>}
        </div>
      </div>

      <Section title="What this means">
        <p className="rounded-[16px] bg-white/[0.04] px-4 py-3.5 text-[15px] leading-relaxed text-ink-2">{segment.explanation}</p>
      </Section>

      <Nearby at={segment.startedAt} until={end ?? Date.now()} onSelect={onSelect} />

      {segment.evidenceIds.length > 0 && <RecordId ids={segment.evidenceIds} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Just before and just after, across every app and every gap, with this record in the middle. */
function Nearby({
  at,
  until,
  currentSessionId,
  onSelect,
}: {
  at: number;
  until: number;
  currentSessionId?: number;
  onSelect: (next: Selection) => void;
}) {
  const connected = useConnection().status === 'connected';
  const range = useMemo(() => localDayRange(new Date(at)), [at]);
  const timeline = useTimeline(range, connected);
  const coverage = useCoverage(range, connected);

  const { before, after } = useMemo(() => {
    type Item = { at: number; label: string; detail: string; select: Selection; applicationId?: number };
    const items: Item[] = [];
    for (const entry of timeline.data ?? []) {
      if (entry.kind === 'session' && entry.sessionId !== currentSessionId) {
        items.push({
          at: entry.startedAt,
          label: entry.applicationName,
          detail: tidyWindowTitle(entry.primaryWindowTitle, entry.applicationName) ?? duration(entry.activeSeconds),
          select: { kind: 'session', sessionId: entry.sessionId },
          applicationId: entry.applicationId,
        });
      }
    }
    for (const segment of coverage.data?.segments ?? []) {
      if (segment.source !== 'trace' && segment.startedAt !== at) {
        items.push({
          at: segment.startedAt,
          label: coverageLabel[segment.kind],
          detail: duration(Math.round(((segment.endedAt ?? Date.now()) - segment.startedAt) / 1000)),
          select: { kind: 'gap', segment },
        });
      }
    }
    items.sort((a, b) => a.at - b.at);
    return {
      before: items.filter((item) => item.at < at).slice(-3),
      after: items.filter((item) => item.at >= until).slice(0, 3),
    };
  }, [timeline.data, coverage.data, at, until, currentSessionId]);

  if (timeline.isPending) return null;

  const row = (item: (typeof before)[number]) => (
    <li key={`${item.at}-${item.label}`}>
      <button
        type="button"
        onClick={() => onSelect(item.select)}
        className="flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left transition hover:bg-white/[0.05]"
      >
        {item.applicationId !== undefined ? (
          <AppMark name={item.label} color={appColor(item.label)} size={34} applicationId={item.applicationId} />
        ) : (
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-peach/12 text-peach">
            <AnimatedClock />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] text-ink">{item.label}</span>
          <span className="block truncate text-[12.5px] text-ink-4">{item.detail}</span>
        </span>
        <span className="shrink-0 text-[13px] text-ink-3">{clockTime(item.at)}</span>
      </button>
    </li>
  );

  return (
    <Section title="Before and after">
      <ul>
        {before.length === 0 ? <li className="px-2.5 py-2 text-[13.5px] text-ink-4">Nothing earlier that day.</li> : before.map(row)}
      </ul>
      <div className="my-2 flex items-center gap-3 px-2.5">
        <span className="h-px flex-1 bg-white/10" />
        <span className="rounded-full bg-white px-3 py-1 text-[12px] font-medium text-[#111114]">This record</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <ul>{after.length === 0 ? <li className="px-2.5 py-2 text-[13.5px] text-ink-4">Nothing later that day.</li> : after.map(row)}</ul>
    </Section>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h3 className="mb-3 flex items-center gap-2 text-[16px] font-medium text-ink">
        {title}
        {count !== undefined && <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[12px] text-ink-3">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

function Fact({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-[16px] bg-white/[0.04] px-4 py-3">
      <p className="text-[12.5px] text-ink-4">{label}</p>
      <p className={`mt-0.5 text-[16px] font-medium ${muted ? 'text-ink-3' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

function Limits({ children }: { children: ReactNode }) {
  return (
    <div className="mt-7 flex gap-3 rounded-[16px] border border-white/[0.07] px-4 py-3.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lilac/15 text-[13px] font-semibold text-lilac">i</span>
      <p className="text-[13.5px] leading-relaxed text-ink-3">{children}</p>
    </div>
  );
}

/** The record's IDs, small, with a copy button: for searching or citing it later. */
function RecordId({ ids }: { ids: string[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-5 flex items-center justify-between gap-3 rounded-[14px] bg-white/[0.03] px-4 py-2.5">
      <span className="min-w-0 truncate text-[12.5px] text-ink-4">
        Record ID <span className="text-ink-3">{ids.join(', ')}</span>
      </span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(ids[0]!);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        }}
        className="shrink-0 rounded-full bg-white/[0.07] px-3 py-1 text-[12px] text-ink-2 transition hover:text-ink"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-4">
        <div className="h-[60px] w-[60px] animate-pulse rounded-[18px] bg-white/[0.06]" />
        <div className="h-7 w-48 animate-pulse rounded-full bg-white/[0.06]" />
      </div>
      <div className="mt-6 h-[140px] animate-pulse rounded-[20px] bg-white/[0.05]" />
      <div className="mt-6 grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-[66px] animate-pulse rounded-[16px] bg-white/[0.05]" />
        ))}
      </div>
    </div>
  );
}

function endReasonLabel(reason: string | null): string {
  if (reason === null) return 'Still open';
  return (
    {
      APP_SWITCH: 'Switched away',
      APP_EXIT: 'App closed',
      SYSTEM_LOCK: 'PC locked',
      SYSTEM_SLEEP: 'PC slept',
      TRACKING_PAUSED: 'Paused',
      SYSTEM_SHUTDOWN: 'PC shut down',
      CRASH_RECOVERY: 'Trace stopped',
    }[reason] ?? reason
  );
}

/** Raw event names are for the database, not for a person. */
export function eventLabel(event: EventRow): string {
  return (
    {
      FOREGROUND_CHANGED: 'Came to the front',
      WINDOW_CHANGED: 'Window changed',
      SESSION_STARTED: 'Session started',
      SESSION_ENDED: 'Session ended',
      IDLE_STARTED: 'Keyboard and mouse went quiet',
      IDLE_ENDED: 'Keyboard or mouse used again',
      SYSTEM_LOCKED: 'PC locked',
      SYSTEM_UNLOCKED: 'PC unlocked',
      SYSTEM_SLEEP: 'PC went to sleep',
      SYSTEM_WAKE: 'PC woke up',
      SYSTEM_SHUTDOWN: 'PC shut down',
      TRACKING_PAUSED: 'Recording paused',
      TRACKING_RESUMED: 'Recording resumed',
      TRACKER_STARTED: 'Trace started',
      TRACKER_RECOVERED: 'Trace recovered after a stop',
    }[event.type] ?? event.type
  );
}

/** Rows a timeline-style list can be built from. */
export type TimelineRow =
  | { kind: 'session'; entry: Extract<TimelineEntry, { kind: 'session' }>; at: number }
  | { kind: 'system'; entry: Extract<TimelineEntry, { kind: 'system' }>; at: number }
  | { kind: 'gap'; segment: CoverageSegment; at: number };
