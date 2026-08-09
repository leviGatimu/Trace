import { NavLink, Outlet } from 'react-router-dom';
import { LiveActivity } from '@/components/LiveActivity';
import { Button } from '@/components/primitives';
import { useConnection } from '@/hooks/useTracker';
import { bridge } from '@/services/trace';

/**
 * The application frame: a narrow fixed sidebar and everything else.
 *
 * 232px, within the 220–240 the design document asks for, so the content keeps
 * the overwhelming majority of the window.
 */
export function Shell() {
  const connection = useConnection();

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {connection.status !== 'connected' && <ConnectionBanner state={connection} />}
        <div className="flex-1 overflow-y-auto px-8 py-7">
          <div className="mx-auto w-full max-w-[1080px]">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/timeline', label: 'Timeline', end: false },
  { to: '/applications', label: 'Applications', end: false },
  { to: '/search', label: 'Search', end: false },
];

function Sidebar() {
  return (
    <nav className="flex w-[232px] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="px-5 pb-6 pt-6">
        <div className="text-[13px] font-semibold tracking-[0.16em] text-ink">TRACE</div>
        <div className="mt-1 text-[11px] text-ink-faint">Your activity, remembered</div>
      </div>

      <div className="flex-1 px-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                'relative mb-0.5 block rounded-[5px] px-3 py-[7px] transition-colors duration-150',
                isActive ? 'bg-card text-ink' : 'text-ink-dim hover:bg-card/60 hover:text-ink',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                {/* A quiet marker on the active item rather than a filled block. */}
                {isActive && (
                  <span className="absolute inset-y-[7px] left-0 w-[2px] rounded-full bg-accent" />
                )}
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </div>

      <LiveActivity />
    </nav>
  );
}

/**
 * The tracker being unavailable is a first-class state, not an error dialog.
 *
 * DOCS/Windows Integration §21: say what is wrong and offer the one action that
 * fixes it, rather than "Something went wrong".
 */
function ConnectionBanner({ state }: { state: ReturnType<typeof useConnection> }) {
  if (state.status === 'connected') {
    return null;
  }

  if (state.status === 'connecting') {
    return (
      <div className="border-b border-line bg-card px-8 py-2 text-ink-dim">
        Connecting to the tracker…
      </div>
    );
  }

  if (state.status === 'incompatible') {
    return (
      <div className="border-b border-line bg-card px-8 py-3">
        <p className="text-ink">Trace needs updating</p>
        <p className="mt-0.5 text-ink-dim">
          The tracker speaks contract {state.trackerContractVersion}, which this window does not
          understand. Rather than guess, Trace has stopped reading it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-6 border-b border-line bg-card px-8 py-3">
      <div className="min-w-0">
        <p className="text-ink">Tracker unavailable</p>
        <p className="mt-0.5 truncate text-ink-dim">
          {state.reason} Trace is not receiving activity data.
        </p>
      </div>
      <Button variant="accent" onClick={() => void bridge.restartTracker()}>
        Restart Tracker
      </Button>
    </div>
  );
}
