import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { EventRow } from '@trace/contracts';
import { clockTimeWithSeconds, duration, tidyWindowTitle } from '@/lib/format';
import { trace } from '@/services/trace';
import { Button, ErrorState, Skeleton } from './primitives';

/**
 * One session, in full.
 *
 * Where the event log earns its place: the stretch the timeline shows as a
 * single row, broken into what actually happened. An overlay is the one place a
 * hard edge is justified — the panel genuinely is in front of the page, so it
 * gets its own ground and a single dividing line, and nothing inside it is
 * boxed.
 */
export function SessionPanel({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['activity', 'session', sessionId],
    queryFn: () => trace.session(sessionId),
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-10 bg-black/45" onClick={onClose} role="presentation" />

      <aside
        className="fixed inset-y-0 right-0 z-20 flex w-[470px] flex-col border-l border-hair bg-rail"
        style={{ animation: 'panel-in 220ms cubic-bezier(0.22,1,0.36,1) both' }}
        aria-label="Session detail"
      >
        <header className="flex items-start justify-between gap-4 px-7 pb-6 pt-6">
          <div className="min-w-0">
            <h2 className="truncate text-[20px] font-semibold text-ink">
              {data?.applicationName ?? 'Session'}
            </h2>
            {data && (
              <p className="data mt-1 text-ink-3">
                {clockTimeWithSeconds(data.startedAt)}
                {data.endedAt ? ` – ${clockTimeWithSeconds(data.endedAt)}` : ' – now'}
              </p>
            )}
          </div>
          <Button variant="ghost" onClick={onClose} title="Close (Esc)">
            Esc
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-7 pb-7">
          {error ? (
            <ErrorState message="This session could not be loaded." onRetry={() => void refetch()} />
          ) : isPending ? (
            <Skeleton rows={6} />
          ) : (
            <>
              <dl className="mb-9 grid grid-cols-2 gap-x-6 gap-y-5">
                <Field label="Active" value={duration(data.activeSeconds)} />
                <Field label="Idle" value={duration(data.idleSeconds)} />
                <Field label="Windows" value={String(data.windowSessions.length)} />
                <Field label="Ended" value={endReasonLabel(data.endReason)} />
              </dl>

              {data.windowSessions.length > 0 && (
                <section className="mb-9">
                  <h3 className="eyebrow mb-3">Windows</h3>
                  <ul className="space-y-1.5">
                    {data.windowSessions.map((window) => (
                      <li key={window.windowSessionId} className="flex items-baseline gap-3">
                        <span className="data w-12 shrink-0 text-ink-4">
                          {clockTimeWithSeconds(window.startedAt).slice(0, 5)}
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate text-ink-2"
                          title={window.title ?? undefined}
                        >
                          {tidyWindowTitle(window.title, data.applicationName) ?? '(no title)'}
                        </span>
                        <span className="data shrink-0 text-ink-4">
                          {duration(window.durationSeconds)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="eyebrow mb-3">What happened</h3>
                <ul className="space-y-1.5">
                  {data.events.map((event) => (
                    <li key={event.eventId} className="flex items-baseline gap-3">
                      <span className="data w-16 shrink-0 text-ink-4">
                        {clockTimeWithSeconds(event.timestamp)}
                      </span>
                      <span className="text-ink-2">{eventLabel(event)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="display mt-1.5 text-[22px] leading-none text-ink">{value}</dd>
    </div>
  );
}

/** Raw event names are for the database, not for a person. */
function eventLabel(event: EventRow): string {
  return (
    {
      FOREGROUND_CHANGED: 'Became the active application',
      WINDOW_CHANGED: 'Switched window',
      SESSION_STARTED: 'Session started',
      SESSION_ENDED: 'Session ended',
      IDLE_STARTED: 'You stopped interacting',
      IDLE_ENDED: 'You came back',
      SYSTEM_LOCKED: 'Computer locked',
      SYSTEM_UNLOCKED: 'Computer unlocked',
      SYSTEM_SLEEP: 'Computer went to sleep',
      SYSTEM_WAKE: 'Computer woke',
      SYSTEM_SHUTDOWN: 'Computer shut down',
      TRACKING_PAUSED: 'Tracking paused',
      TRACKING_RESUMED: 'Tracking resumed',
      TRACKER_STARTED: 'Trace started',
      TRACKER_RECOVERED: 'Recovered after an unexpected stop',
    }[event.type] ?? event.type
  );
}

function endReasonLabel(reason: string | null): string {
  if (reason === null) {
    return 'Open';
  }

  return (
    {
      APP_SWITCH: 'Switched away',
      APP_EXIT: 'App closed',
      SYSTEM_LOCK: 'Locked',
      SYSTEM_SLEEP: 'Slept',
      TRACKING_PAUSED: 'Paused',
      SYSTEM_SHUTDOWN: 'Shut down',
      CRASH_RECOVERY: 'Interrupted',
    }[reason] ?? reason
  );
}
