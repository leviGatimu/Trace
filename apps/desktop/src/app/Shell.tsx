import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';
import { Button, StatusDot } from '@/components/primitives';
import { useUnseenTamperCount } from '@/hooks/useProtection';
import { useConnection, useCoverage, useStatus } from '@/hooks/useTracker';
import { localDayRange } from '@/lib/format';
import { withDay, useSelectedDay } from '@/lib/range';
import { bridge, trace } from '@/services/trace';

/**
 * The frame: a navigation rail, and a workspace each screen fills edge to
 * edge. Screens own their own scrolling, so a list can scroll while the
 * inspector beside it stays put.
 */
export function Shell() {
  const connection = useConnection();

  return (
    <div className="flex h-full">
      <Rail />

      <main className="flex min-w-0 flex-1 flex-col bg-canvas">
        {connection.status !== 'connected' && <ConnectionNotice state={connection} />}
        <div className="min-h-0 flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/** A screen's layout: scrolling content, and an optional docked drawer. */
export function Workspace({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto max-w-[1380px] px-8 pb-10 pt-4">{children}</div>
      </div>
      {aside}
    </div>
  );
}

type NavItem = {
  key: string;
  to: string;
  label: string;
  icon: IconName;
  isActive: (path: string, params: URLSearchParams) => boolean;
};

const NAV: NavItem[] = [
  { key: 'overview', to: '/', label: 'Overview', icon: 'overview', isActive: (path) => path === '/' },
  {
    key: 'timeline',
    to: '/timeline',
    label: 'Timeline',
    icon: 'timeline',
    isActive: (path, params) => path === '/timeline' && params.get('show') !== 'gaps',
  },
  {
    key: 'gaps',
    to: '/timeline?show=gaps',
    label: 'Gaps to review',
    icon: 'gaps',
    isActive: (path, params) => path === '/timeline' && params.get('show') === 'gaps',
  },
  {
    key: 'applications',
    to: '/applications',
    label: 'Applications',
    icon: 'applications',
    isActive: (path) => path.startsWith('/applications'),
  },
  {
    key: 'background',
    to: '/background',
    label: 'Background apps',
    icon: 'layers',
    isActive: (path) => path === '/background',
  },
  { key: 'calendar', to: '/calendar', label: 'Calendar', icon: 'calendar', isActive: (path) => path === '/calendar' },
  { key: 'system', to: '/system', label: 'System', icon: 'cpu', isActive: (path) => path === '/system' },
  { key: 'protection', to: '/protection', label: 'Protection', icon: 'shield', isActive: (path) => path === '/protection' },
  { key: 'settings', to: '/settings', label: 'Settings', icon: 'settings', isActive: (path) => path === '/settings' },
];

/** One 44px tile plus the 8px gap below it. */
const STEP = 52;

/**
 * Icons only, as in the reference. The white tile slides to the screen you
 * are on, and hovering an icon slides its name out beside it.
 */
function Rail() {
  const [day] = useSelectedDay();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const connected = useConnection().status === 'connected';
  const status = useStatus(connected);
  const recording = connected && status.data?.trackingEnabled !== false;
  const today = localDayRange(new Date());
  const coverage = useCoverage(today, connected);
  const gapCount = (coverage.data?.segments ?? []).filter(
    (segment) =>
      segment.evidence !== 'observed' &&
      segment.kind !== 'before-trace' &&
      (segment.endedAt ?? Date.now()) - segment.startedAt >= 600_000,
  ).length;

  const unseenTamper = useUnseenTamperCount(connected);

  const activeIndex = NAV.findIndex((item) => item.isActive(pathname, params));

  return (
    <div className="flex w-[76px] shrink-0 flex-col items-center bg-rail pb-5 pt-5">
      <nav className="relative flex flex-col items-center gap-2" aria-label="Main">
        {activeIndex >= 0 && (
          <span
            className="absolute left-0 top-0 h-11 w-11 rounded-[14px] bg-white shadow-[0_6px_18px_rgb(255_255_255/12%)]"
            style={{
              transform: `translateY(${activeIndex * STEP}px)`,
              transition: 'transform 420ms cubic-bezier(0.34, 1.4, 0.64, 1)',
            }}
            aria-hidden
          />
        )}
        {NAV.map((item, index) => (
          <RailLink
            key={item.key}
            to={withDay(item.to, day)}
            label={item.label}
            icon={item.icon}
            active={index === activeIndex}
            badge={
              item.key === 'gaps' && gapCount > 0
                ? gapCount
                : item.key === 'protection' && unseenTamper > 0
                  ? unseenTamper
                  : undefined
            }
          />
        ))}

        <span className="my-1 h-px w-8 bg-hair" aria-hidden />

        <RailButton
          label="Search everything (Ctrl K)"
          onClick={() => window.dispatchEvent(new Event('trace:focus-search'))}
        >
          <Icon name="search" />
        </RailButton>
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2">
        <RailButton
          label={recording ? 'Pause recording' : connected ? 'Resume recording' : 'The recorder is not running'}
          onClick={connected ? () => void (recording ? trace.pause() : trace.resume()) : undefined}
        >
          <Icon name={recording ? 'pause' : 'play'} />
        </RailButton>
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-[14px] bg-card ${recording ? 'breathe' : ''}`}
          title={recording ? 'Trace is recording' : connected ? 'Recording is paused' : 'The recorder is not running'}
          role="status"
          aria-label={recording ? 'Recording' : connected ? 'Paused' : 'Not running'}
        >
          <StatusDot state={recording ? 'live' : connected ? 'paused' : 'off'} />
        </span>
      </div>
    </div>
  );
}

function RailLink({
  to,
  label,
  icon,
  active,
  badge,
}: {
  to: string;
  label: string;
  icon: IconName;
  active: boolean;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={[
        'nav-icon group relative z-10 flex h-11 w-11 items-center justify-center rounded-[14px] transition-colors duration-200',
        active ? 'text-[#111114]' : 'text-ink-3 hover:bg-card hover:text-ink',
      ].join(' ')}
    >
      <Icon name={icon} />
      {badge !== undefined && (
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-peach px-1 text-[10.5px] font-semibold text-[#2a1406]">
          {badge}
        </span>
      )}
      <RailTip>{label}</RailTip>
    </NavLink>
  );
}

function RailButton({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="nav-icon group relative flex h-11 w-11 items-center justify-center rounded-[14px] text-ink-3 transition-colors hover:bg-card hover:text-ink"
    >
      {children}
      <RailTip>{label}</RailTip>
    </button>
  );
}

/** The name that slides out beside an icon on hover. */
function RailTip({ children }: { children: ReactNode }) {
  return (
    <span className="rail-tip pointer-events-none absolute left-[56px] z-50 whitespace-nowrap rounded-[10px] bg-white px-3 py-1.5 text-[13px] font-medium text-[#111114] shadow-lg">
      {children}
    </span>
  );
}

/**
 * The tracker being unavailable is a state of the product, not an error dialog.
 * DOCS/specs/windows-integration.md §21: say what is wrong and offer the one action that
 * fixes it.
 */
function ConnectionNotice({ state }: { state: ReturnType<typeof useConnection> }) {
  if (state.status === 'connected') {
    return null;
  }

  if (state.status === 'connecting') {
    return (
      <div className="border-b border-hair px-8 py-2.5 text-ink-3">Connecting to the tracker…</div>
    );
  }

  if (state.status === 'incompatible') {
    return (
      <div className="border-b border-hair px-8 py-3.5">
        <p className="text-ink">Trace needs updating</p>
        <p className="mt-1 text-ink-3">
          The tracker speaks contract {state.trackerContractVersion}, which this window does not
          understand. Rather than guess, Trace has stopped reading it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-6 border-b border-hair px-8 py-3.5">
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
