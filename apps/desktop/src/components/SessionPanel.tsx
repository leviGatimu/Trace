import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { EventRow } from '@trace/contracts';
import { clockTimeWithSeconds, duration, tidyWindowTitle } from '@/lib/format';
import { trace } from '@/services/trace';
import { Button, ErrorState, Skeleton } from './primitives';

/**
 * The session detail panel, sliding in from the right.
 *
 * This is where the event log earns its place: the same stretch of time the
 * timeline shows as one row is broken down into exactly what happened, which is
 * the "deep without being overwhelming" the design document asks for.
 */
export function SessionPanel({
  sessionId,
  onClose,
}: {
  sessionId: number;
  onClose: () => void;
}) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['activity', 'session', sessionId],
    queryFn: () => trace.session(sessionId),
  });

  // Escape closes it. A desktop application that traps you in a panel is not a
  // desktop application.
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
      <div
        className="fixed inset-0 z-10 bg-black/40"
        onClick={onClose}
        role="presentation"
      />
      <aside
        className="fixed inset-y-0 right-0 z-20 flex w-[420px] flex-col border-l border-line bg-sidebar shadow-2xl"
        style={{ animation: 'slide-in 180ms ease-out' }}
        aria-label="Session detail"
      >
        <style>{`@keyframes slide-in { from { transform: translateX(16px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>

        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] text-ink">
              {data?.applicationName ?? 'Session'}
            </h2>
            {data && (
              <p className="mt-0.5 tabular text-ink-dim">
                {clockTimeWithSeconds(data.startedAt)}
                {data.endedAt ? ` — ${clockTimeWithSeconds(data.endedAt)}` : ' — now'}
              </p>
            )}
          </div>
          <Button variant="ghost" onClick={onClose} title="Close (Esc)">
            ✕
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <ErrorState message="This session could not be loaded." onRetry={() => void refetch()} />
          ) : isPending ? (
            <Skeleton rows={5} />
          ) : (
            <>
              <dl className="mb-6 grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Active time" value={duration(data.activeSeconds)} />
                <Field label="Idle time" value={duration(data.idleSeconds)} />
                <Field label="Windows" value={String(data.windowSessions.length)} />
                <Field label="Ended" value={endReasonLabel(data.endReason)} />
              </dl>

              {data.windowSessions.length > 0 && (
                <section className="mb-6">
                  <h3 className="mb-2 border-b border-line pb-2 text-[11px] uppercase tracking-[0.09em] text-ink-faint">
                    Window activity
                  </h3>
                  <ul className="space-y-1">
                    {data.windowSessions.map((window) => (
                      <li key={window.windowSessionId} className="flex items-baseline gap-3">
                        <span className="tabular w-12 shrink-0 text-ink-faint">
                          {clockTimeWithSeconds(window.startedAt).slice(0, 5)}
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate text-ink-dim"
                          title={window.title ?? undefined}
                        >
                          {tidyWindowTitle(window.title, data.applicationName) ?? '(no title)'}
                        </span>
                        <span className="tabular shrink-0 text-ink-faint">
                          {duration(window.durationSeconds)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="mb-2 border-b border-line pb-2 text-[11px] uppercase tracking-[0.09em] text-ink-faint">
                  What happened
                </h3>
                <ul className="space-y-1">
                  {data.events.map((event) => (
                    <li key={event.eventId} className="flex items-baseline gap-3">
                      <span className="tabular w-16 shrink-0 text-ink-faint">
                        {clockTimeWithSeconds(event.timestamp)}
                      </span>
                      <span className="text-ink-dim">{eventLabel(event)}</span>
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
      <dt className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">{label}</dt>
      <dd className="tabular mt-0.5 text-ink">{value}</dd>
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
    return 'Still open';
  }

  return (
    {
      APP_SWITCH: 'Switched away',
      APP_EXIT: 'Application closed',
      SYSTEM_LOCK: 'Computer locked',
      SYSTEM_SLEEP: 'Computer slept',
      TRACKING_PAUSED: 'Tracking paused',
      SYSTEM_SHUTDOWN: 'Computer shut down',
      CRASH_RECOVERY: 'Interrupted',
    }[reason] ?? reason
  );
}
