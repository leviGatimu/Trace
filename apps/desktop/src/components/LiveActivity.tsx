import { liveDuration, tidyWindowTitle } from '@/lib/format';
import { useConnection, useCurrentActivity, useStatus } from '@/hooks/useTracker';
import { StatusDot } from './primitives';

/**
 * "Currently active", pinned to the bottom of the sidebar.
 *
 * The design document calls this the feature that makes the application feel
 * alive, and it doubles as the tracking indicator DOCS/Privacy.md §11 requires:
 * the user should never have to wonder whether Trace is recording.
 */
export function LiveActivity() {
  const connection = useConnection();
  const connected = connection.status === 'connected';

  const { data: status } = useStatus(connected);
  const { data: current } = useCurrentActivity(connected);

  const paused = status?.trackingEnabled === false;
  const idle = status?.state === 'IDLE';

  return (
    <div className="border-t border-line px-5 py-4">
      <div className="flex items-center gap-2">
        <StatusDot state={!connected ? 'off' : paused ? 'paused' : idle ? 'idle' : 'live'} />
        <span className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">
          {!connected ? 'Not tracking' : paused ? 'Paused' : idle ? 'Idle' : 'Tracking'}
        </span>
      </div>

      {connected && current && !paused ? (
        <div className="mt-3">
          <div className="truncate text-ink" title={current.applicationName}>
            {current.applicationName}
          </div>

          {tidyWindowTitle(current.windowTitle, current.applicationName) && (
            <div
              className="mt-0.5 truncate text-ink-dim"
              title={current.windowTitle ?? undefined}
            >
              {tidyWindowTitle(current.windowTitle, current.applicationName)}
            </div>
          )}

          <div className="tabular mt-2 text-ink-dim">
            {liveDuration(current.activeSeconds)}
            {current.idleSeconds > 0 && (
              <span className="text-ink-faint"> · {liveDuration(current.idleSeconds)} idle</span>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-ink-faint">
          {!connected
            ? 'The tracker is not running.'
            : paused
              ? 'Nothing is being recorded.'
              : 'Nothing tracked right now.'}
        </p>
      )}

      {/*
        The promise, stated where the user can see it while the thing is
        running. DOCS/UI and UX-design.md asks for exactly this.
      */}
      <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-faint">
        Everything stays on this device.
        <br />
        Nothing is uploaded.
      </p>
    </div>
  );
}
