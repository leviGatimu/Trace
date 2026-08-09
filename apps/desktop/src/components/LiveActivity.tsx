import { useConnection, useCurrentActivity, useStatus } from '@/hooks/useTracker';
import { appColor } from '@/lib/appColor';
import { liveDuration, tidyWindowTitle } from '@/lib/format';
import { AppSwatch, StatusDot } from './primitives';

/**
 * What is happening right now, at the foot of the rail.
 *
 * Also the tracking indicator DOCS/Privacy.md §11 requires: the user should
 * never have to wonder whether Trace is recording, so the state is named in
 * words and never left to a colour.
 */
export function LiveActivity() {
  const connection = useConnection();
  const connected = connection.status === 'connected';

  const { data: status } = useStatus(connected);
  const { data: current } = useCurrentActivity(connected);

  const paused = status?.trackingEnabled === false;
  const idle = status?.state === 'IDLE';
  const state = !connected ? 'off' : paused ? 'paused' : idle ? 'idle' : 'live';
  const label = !connected ? 'Not tracking' : paused ? 'Paused' : idle ? 'Idle' : 'Tracking';

  return (
    <div className="px-5 pb-5 pt-4">
      <div className="flex items-center gap-2">
        <StatusDot state={state} />
        <span className="eyebrow">{label}</span>
      </div>

      {connected && current && !paused ? (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <AppSwatch color={appColor(current.executable)} />
            <span className="truncate text-ink" title={current.applicationName}>
              {current.applicationName}
            </span>
          </div>

          {tidyWindowTitle(current.windowTitle, current.applicationName) && (
            <div className="mt-1 truncate text-ink-3" title={current.windowTitle ?? undefined}>
              {tidyWindowTitle(current.windowTitle, current.applicationName)}
            </div>
          )}

          <div className="display mt-2.5 text-[22px] leading-none text-ink">
            {liveDuration(current.activeSeconds)}
          </div>
          {current.idleSeconds > 0 && (
            <div className="data mt-1.5 text-ink-4">
              {liveDuration(current.idleSeconds)} idle
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-ink-4">
          {!connected
            ? 'The tracker is not running.'
            : paused
              ? 'Nothing is being recorded.'
              : 'Nothing tracked right now.'}
        </p>
      )}

      <p className="mt-6 text-[13px] leading-relaxed text-ink-4">
        Everything stays on this device.
        <br />
        Nothing is uploaded.
      </p>
    </div>
  );
}
