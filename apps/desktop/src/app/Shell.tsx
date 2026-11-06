import { NavLink, Outlet } from 'react-router-dom';
import { LiveActivity } from '@/components/LiveActivity';
import { Button } from '@/components/primitives';
import { useConnection } from '@/hooks/useTracker';
import { bridge } from '@/services/trace';

/**
 * The frame.
 *
 * Two regions, told apart by ground tone rather than by a border: the rail sits
 * a shade below the canvas. That is the only structural division in the whole
 * application, and it earns its place because the two regions genuinely are
 * different things.
 */
export function Shell() {
  const connection = useConnection();

  return (
    <div className="flex h-full">
      <Rail />

      <main className="flex min-w-0 flex-1 flex-col">
        {connection.status !== 'connected' && <ConnectionNotice state={connection} />}

        {/*
          Capped and left-aligned, not centred: on a wide monitor an uncapped
          row leaves a hand's width of nothing between an application's name and
          its duration, and the two stop reading as the same row. Left-aligned
          so the content keeps its spine against the rail instead of drifting
          into the middle of the screen.
        */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="min-w-0 max-w-[1080px] px-10 py-8">
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
  { to: '/calendar', label: 'Calendar', end: false },
  { to: '/analytics', label: 'Analytics', end: false },
  { to: '/search', label: 'Search', end: false },
];

/*
  No wordmark at the top of the rail any more: the title bar directly above it
  now carries the mark and the name, and two of them stacked read as a mistake
  rather than as branding. The rail keeps its top padding so the first
  navigation item is not welded to the bar.
*/
function Rail() {
  return (
    <div className="flex w-[212px] shrink-0 flex-col bg-rail">
      <nav className="flex-1 px-3 pt-5">
        {NAV.map((item) => (
          <Item key={item.to} {...item} />
        ))}

        <div className="my-3 h-px bg-hair" />
        <Item to="/settings" end={false} label="Settings" />
      </nav>

      <LiveActivity />
    </div>
  );
}

function Item({ to, end, label }: { to: string; end: boolean; label: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'block rounded-md px-2.5 py-[8px] transition-colors duration-150',
          isActive ? 'bg-lift text-ink' : 'text-ink-2 hover:text-ink',
        ].join(' ')
      }
    >
      {label}
    </NavLink>
  );
}

/**
 * The tracker being unavailable is a state of the product, not an error dialog.
 * DOCS/Windows Integration §21: say what is wrong and offer the one action that
 * fixes it.
 */
function ConnectionNotice({ state }: { state: ReturnType<typeof useConnection> }) {
  if (state.status === 'connected') {
    return null;
  }

  if (state.status === 'connecting') {
    return (
      <div className="border-b border-hair px-9 py-2.5 text-ink-3">Connecting to the tracker…</div>
    );
  }

  if (state.status === 'incompatible') {
    return (
      <div className="border-b border-hair px-9 py-3.5">
        <p className="text-ink">Trace needs updating</p>
        <p className="mt-1 text-ink-3">
          The tracker speaks contract {state.trackerContractVersion}, which this window does not
          understand. Rather than guess, Trace has stopped reading it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-6 border-b border-hair px-9 py-3.5">
      <div className="min-w-0">
        <p className="text-ink">Tracker unavailable</p>
        <p className="mt-0.5 truncate text-ink-3">
          {state.reason} Trace is not receiving activity data.
        </p>
      </div>
      <Button variant="accent" onClick={() => void bridge.restartTracker()}>
        Restart tracker
      </Button>
    </div>
  );
}
