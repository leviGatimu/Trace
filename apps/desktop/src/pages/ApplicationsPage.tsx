import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ApplicationAlias, ApplicationDetail, ApplicationSummary, DayRange } from '@trace/contracts';
import { Workspace } from '@/app/Shell';
import { Card, CountUp, Popover, RoundButton, StatusPill } from '@/components/bento';
import { HourBars } from '@/components/charts';
import { DayPicker } from '@/components/DayPicker';
import { Icon } from '@/components/Icon';
import { Inspector, type Selection } from '@/components/Inspector';
import { AppMark } from '@/components/primitives';
import { useApplication, useApplications, useConnection } from '@/hooks/useTracker';
import { appColor } from '@/lib/appColor';
import { addDays, clockTime, duration, localDayRange, longDate, relativeDay, shortDate, tidyWindowTitle } from '@/lib/format';
import { useSelectedDay, withDay } from '@/lib/range';

type Scope = 'day' | 'week' | 'month';
type Sort = 'time' | 'name' | 'sessions' | 'recent';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'time', label: 'Most time' },
  { value: 'recent', label: 'Most recent' },
  { value: 'sessions', label: 'Most sessions' },
  { value: 'name', label: 'Name A–Z' },
];

function scopeRange(day: Date, scope: Scope): DayRange {
  const days = scope === 'day' ? 1 : scope === 'week' ? 7 : 30;
  return { fromUtcMs: localDayRange(addDays(day, -(days - 1))).fromUtcMs, toUtcMs: localDayRange(day).toUtcMs };
}

export function ApplicationsPage() {
  const { applicationId } = useParams();
  return applicationId ? <Detail applicationId={Number(applicationId)} /> : <List />;
}

/* ------------------------------------------------------------------ */
/*  The list                                                          */
/* ------------------------------------------------------------------ */

function List() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [day, setDay] = useSelectedDay();
  const scope = (params.get('scope') as Scope | null) ?? 'day';
  const sort = (params.get('sort') as Sort | null) ?? 'time';
  const range = useMemo(() => scopeRange(day, scope), [day, scope]);
  const [filter, setFilter] = useState('');

  const connected = useConnection().status === 'connected';
  const { data, isPending } = useApplications(range, connected);

  const setParam = (key: string, value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const total = (data ?? []).reduce((sum, application) => sum + application.activeSeconds, 0);
  const shown = useMemo(() => {
    const text = filter.trim().toLowerCase();
    const list = (data ?? []).filter(
      (application) => !text || application.name.toLowerCase().includes(text) || application.executable.includes(text),
    );
    const order: Record<Sort, (a: ApplicationSummary, b: ApplicationSummary) => number> = {
      time: (a, b) => b.activeSeconds - a.activeSeconds,
      recent: (a, b) => b.lastUsedAt - a.lastUsedAt,
      sessions: (a, b) => b.sessionCount - a.sessionCount,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...list].sort(order[sort]);
  }, [data, filter, sort]);

  const podium = (data ?? []).slice(0, 3);
  const open = (id: number) => navigate(withDay(`/applications/${id}`, day));
  const period = scope === 'day' ? relativeDay(day).toLowerCase() : scope === 'week' ? 'in the last 7 days' : 'in the last 30 days';

  return (
    <Workspace>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-medium leading-tight tracking-[-0.02em] text-ink">Applications</h1>
          <p className="mt-1 text-[14.5px] text-ink-3">
            {data ? `${data.length} apps were in front ${scope === 'day' ? (period === 'today' || period === 'yesterday' ? period : `on ${relativeDay(day)}`) : period}.` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex h-10 items-center gap-1 rounded-full bg-card p-1">
            {(
              [
                ['day', 'Day'],
                ['week', '7 days'],
                ['month', '30 days'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setParam('scope', value === 'day' ? null : value)}
                className={`h-8 rounded-full px-3.5 text-[13px] transition ${scope === value ? 'bg-white text-[#111114]' : 'text-ink-2 hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <DayPicker day={day} onChange={setDay} />
        </div>
      </header>

      {/* The top three, large */}
      {podium.length > 0 && (
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          {podium.map((application, index) => (
            <PodiumCard
              key={application.applicationId}
              application={application}
              rank={index + 1}
              share={total ? application.activeSeconds / total : 0}
              index={index}
              onOpen={() => open(application.applicationId)}
            />
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex h-11 w-[340px] items-center gap-2.5 rounded-[14px] bg-card px-4 focus-within:ring-2 focus-within:ring-accent/60">
          <span className="text-ink-3">
            <Icon name="search" />
          </span>
          <input
            type="text"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Find an application"
            aria-label="Find an application"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
          />
        </label>
        <span className="text-[14px] text-ink">
          {shown.length} <span className="text-ink-4">apps</span>
        </span>
        <div className="ml-auto">
          <Popover
            width={210}
            trigger={({ open: isOpen, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] transition ${
                  isOpen ? 'bg-white text-[#111114]' : 'bg-card text-ink-2 hover:bg-card-2 hover:text-ink'
                }`}
              >
                <Icon name="sort" />
                Sort: {SORTS.find((option) => option.value === sort)!.label.toLowerCase()}
              </button>
            )}
          >
            {(close) => (
              <ul className="-m-1.5">
                {SORTS.map((option) => (
                  <li key={option.value}>
                    <button
                      type="button"
                      onClick={() => {
                        setParam('sort', option.value === 'time' ? null : option.value);
                        close();
                      }}
                      className={`flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-[13.5px] ${
                        sort === option.value ? 'bg-card text-ink' : 'text-ink-2 hover:bg-card hover:text-ink'
                      }`}
                    >
                      {option.label}
                      {sort === option.value && <span className="h-2 w-2 rounded-full bg-accent" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Popover>
        </div>
      </div>

      {!connected ? (
        <EmptyCard title="Waiting for the tracker" detail="Trace's recorder is not running yet." />
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="h-[172px] animate-pulse rounded-[22px] bg-card" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyCard
          title={data?.length ? `Nothing matches "${filter}"` : 'No app was in front in this period'}
          detail={data?.length ? 'Try another name.' : 'Choose a longer period or another day.'}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((application, index) => (
            <AppCard
              key={application.applicationId}
              application={application}
              share={total ? application.activeSeconds / total : 0}
              scope={scope}
              index={Math.min(index, 12)}
              onOpen={() => open(application.applicationId)}
            />
          ))}
        </div>
      )}
    </Workspace>
  );
}

function PodiumCard({
  application,
  rank,
  share,
  index,
  onOpen,
}: {
  application: ApplicationSummary;
  rank: number;
  share: number;
  index: number;
  onOpen: () => void;
}) {
  const colour = appColor(application.name);
  const light = rank === 1;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`rise lift relative overflow-hidden rounded-[22px] p-6 text-left ${light ? 'bg-[#f4f4f6] text-[#111114]' : 'bg-card text-ink'}`}
      style={{ '--i': index } as React.CSSProperties}
    >
      <span
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-25 blur-2xl"
        style={{ background: colour }}
        aria-hidden
      />
      <div className="flex items-start justify-between">
        <AppMark name={application.name} color={colour} size={56} applicationId={application.applicationId} />
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${light ? 'bg-[#111114] text-white' : 'bg-card-2 text-ink-2'}`}>
          #{rank}
        </span>
      </div>
      <p className={`mt-5 truncate text-[18px] font-medium ${light ? '' : 'text-ink'}`}>{application.name}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[34px] font-medium leading-none tracking-[-0.03em]">
          <CountUp value={application.activeSeconds} format={duration} />
        </span>
        <span className={`text-[13px] ${light ? 'text-[#66666d]' : 'text-ink-3'}`}>{Math.round(share * 100)}% of the time</span>
      </div>
      <span className={`mt-4 block h-1.5 overflow-hidden rounded-full ${light ? 'bg-[#dedee3]' : 'bg-card-2'}`}>
        <span className="block h-full rounded-full transition-[width] duration-1000" style={{ width: `${share * 100}%`, background: colour }} />
      </span>
    </button>
  );
}

function AppCard({
  application,
  share,
  scope,
  index,
  onOpen,
}: {
  application: ApplicationSummary;
  share: number;
  scope: Scope;
  index: number;
  onOpen: () => void;
}) {
  const colour = appColor(application.name);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rise lift group flex flex-col rounded-[22px] bg-card p-5 text-left"
      style={{ '--i': index } as React.CSSProperties}
    >
      <div className="flex items-center gap-3">
        <AppMark name={application.name} color={colour} size={44} applicationId={application.applicationId} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink">{application.name}</span>
          <span className="block truncate text-[12px] text-ink-4">{application.executable}</span>
        </span>
        <span className="arrow-turn flex h-8 w-8 items-center justify-center rounded-full bg-card-2 text-ink-3 transition group-hover:bg-white group-hover:text-[#111114]">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
            <path d="M5 11L11 5M6 5h5v5" />
          </svg>
        </span>
      </div>
      <p className="mt-5 text-[26px] font-medium leading-none tracking-[-0.03em] text-ink">{duration(application.activeSeconds)}</p>
      <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-card-2">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(2, share * 100)}%`, background: colour }} />
      </span>
      <div className="mt-3 flex items-center justify-between text-[12.5px] text-ink-3">
        <span>
          {application.sessionCount} {application.sessionCount === 1 ? 'session' : 'sessions'}
        </span>
        <span>Last {scope === 'day' ? clockTime(application.lastUsedAt) : shortDate(application.lastUsedAt)}</span>
      </div>
    </button>
  );
}

function EmptyCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[22px] bg-card px-6 py-16 text-center">
      <p className="text-[16px] font-medium text-ink">{title}</p>
      <p className="mt-1.5 text-ink-3">{detail}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  One application                                                   */
/* ------------------------------------------------------------------ */

function Detail({ applicationId }: { applicationId: number }) {
  const navigate = useNavigate();
  const [day, setDay] = useSelectedDay();
  const range = useMemo(() => localDayRange(day), [day]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const connected = useConnection().status === 'connected';
  const { data, isPending, error } = useApplication(applicationId, range, connected);

  if (error) {
    return (
      <Workspace>
        <EmptyCard title="This application could not be loaded" detail="It may have been deleted. Go back to all applications." />
      </Workspace>
    );
  }

  if (isPending || !data) {
    return (
      <Workspace>
        <div className="mb-6 h-[180px] animate-pulse rounded-[26px] bg-card" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-[120px] animate-pulse rounded-[22px] bg-card" />
          ))}
        </div>
      </Workspace>
    );
  }

  const colour = appColor(data.name);
  const hours = hoursOf(data, range);
  const isToday = relativeDay(day) === 'Today';

  return (
    <Workspace>
      {selection && <Inspector selection={selection} onSelect={setSelection} onClose={() => setSelection(null)} />}

      {/* Hero */}
      <section className="rise relative mb-4 overflow-hidden rounded-[26px] bg-card p-7" style={{ '--i': 0 } as React.CSSProperties}>
        <span className="pointer-events-none absolute -left-16 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl" style={{ background: colour }} aria-hidden />
        <span className="card-wave pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex min-w-0 items-center gap-5">
            <RoundButton label="All applications" onClick={() => navigate(withDay('/applications', day))}>
              <Icon name="left" />
            </RoundButton>
            <AppMark name={data.name} color={colour} size={76} applicationId={data.applicationId} />
            <div className="min-w-0">
              <h1 className="truncate text-[34px] font-medium leading-tight tracking-[-0.02em] text-ink">{data.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {data.category && <StatusPill tone="lilac">{data.category}</StatusPill>}
                <StatusPill tone="grey">
                  {data.aliases.length === 1 ? '1 program file' : `${data.aliases.length} program files`}
                </StatusPill>
                <StatusPill tone="grey">Since {shortDate(data.firstSeen)}</StatusPill>
                {isToday && data.sessions.some((session) => session.endedAt === null) && (
                  <StatusPill tone="mint">
                    <span className="pulse relative mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-mint" />
                    in front now
                  </StatusPill>
                )}
              </div>
            </div>
          </div>
          <DayPicker
            day={day}
            onChange={(next) => {
              setSelection(null);
              setDay(next);
            }}
          />
        </div>
      </section>

      {/* Numbers */}
      <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Card tone="light" index={1}>
          <p className="text-[14px] text-[#55555c]">{relativeDay(day)}</p>
          <p className="mt-5 text-[30px] font-medium leading-none tracking-[-0.03em]">
            <CountUp value={data.sessions.reduce((sum, session) => sum + session.activeSeconds, 0)} format={duration} />
          </p>
          <p className="mt-3 text-[12px] text-[#77777e]">
            {data.sessions.length} {data.sessions.length === 1 ? 'session' : 'sessions'}
          </p>
        </Card>
        <NumberCard index={2} label="Yesterday" seconds={data.usage.yesterdayActiveSeconds} />
        <NumberCard index={3} label="Last 7 days" seconds={data.usage.last7DaysActiveSeconds} />
        <NumberCard index={4} label="All recorded time" seconds={data.usage.allTimeActiveSeconds} />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7" index={5}>
          <div className="mb-5 flex items-baseline gap-4">
            <h2 className="text-[17px] font-medium text-ink">Hour by hour</h2>
            <span className="text-[12.5px] text-ink-3">{longDate(day.getTime())}</span>
          </div>
          {data.sessions.length ? <HourBars hours={hours} height={210} /> : <p className="py-16 text-center text-ink-3">Not in front on this day.</p>}
        </Card>

        <Card className="p-0 xl:col-span-5" index={6}>
          <div className="flex items-baseline justify-between px-5 pb-2 pt-5">
            <h2 className="text-[17px] font-medium text-ink">Sessions</h2>
            <span className="text-[12.5px] text-ink-3">Click one for its full record</span>
          </div>
          {data.sessions.length === 0 ? (
            <p className="px-5 pb-6 pt-4 text-ink-3">Not in front on this day.</p>
          ) : (
            <ul className="max-h-[262px] overflow-y-auto px-2 pb-3">
              {data.sessions.map((session, index) => {
                const longest = Math.max(...data.sessions.map((item) => item.activeSeconds), 1);
                return (
                  <li key={session.sessionId} className="slide-in" style={{ '--i': Math.min(index, 14) } as React.CSSProperties}>
                    <button
                      type="button"
                      onClick={() => setSelection({ kind: 'session', sessionId: session.sessionId })}
                      className="grid w-full grid-cols-[132px_minmax(0,1fr)_64px] items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition hover:bg-card-2"
                    >
                      <span className="text-[13px] text-ink-2">
                        {clockTime(session.startedAt)} – {session.endedAt === null ? 'now' : clockTime(session.endedAt)}
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-card-2">
                        <span className="block h-full rounded-full" style={{ width: `${(session.activeSeconds / longest) * 100}%`, background: colour }} />
                      </span>
                      <span className="text-right text-[13px] text-ink">{duration(session.activeSeconds)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-0 xl:col-span-7" index={7}>
          <div className="px-5 pb-2 pt-5">
            <h2 className="text-[17px] font-medium text-ink">Windows</h2>
          </div>
          <Windows detail={data} colour={colour} />
        </Card>

        <Card className="p-0 xl:col-span-5" index={8}>
          <div className="px-5 pb-1 pt-5">
            <h2 className="text-[17px] font-medium text-ink">Program files</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-3">Everything recorded as {data.name}</p>
          </div>
          <ul className="px-2 pb-3">
            {data.aliases.map((alias) => (
              <AliasRow key={alias.executableId} alias={alias} />
            ))}
          </ul>
        </Card>
      </div>
    </Workspace>
  );
}

function NumberCard({ index, label, seconds }: { index: number; label: string; seconds: number }) {
  return (
    <Card index={index}>
      <p className="text-[14px] text-ink-2">{label}</p>
      <p className="mt-5 text-[30px] font-medium leading-none tracking-[-0.03em] text-ink">
        <CountUp value={seconds} format={duration} />
      </p>
    </Card>
  );
}

function Windows({ detail, colour }: { detail: ApplicationDetail; colour: string }) {
  const [showAll, setShowAll] = useState(false);
  if (detail.windows.length === 0) {
    return <p className="px-5 pb-6 pt-2 text-ink-3">No window titles recorded on this day.</p>;
  }
  const shown = showAll ? detail.windows : detail.windows.slice(0, 7);
  const longest = Math.max(...detail.windows.map((window) => window.durationSeconds), 1);

  return (
    <>
      <ul className="px-2 pb-2">
        {shown.map((window) => (
          <li key={window.title} className="grid grid-cols-[minmax(0,1fr)_110px_64px] items-center gap-3 rounded-[12px] px-3 py-2.5 hover:bg-card-2">
            <span className="truncate text-ink-2" title={window.title}>
              {tidyWindowTitle(window.title, detail.name) ?? window.title}
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-card-2">
              <span className="block h-full rounded-full" style={{ width: `${(window.durationSeconds / longest) * 100}%`, background: colour }} />
            </span>
            <span className="text-right text-[13px] text-ink">{duration(window.durationSeconds)}</span>
          </li>
        ))}
      </ul>
      {!showAll && detail.windows.length > 7 && (
        <button type="button" onClick={() => setShowAll(true)} className="mx-5 mb-5 rounded-full bg-card-2 px-4 py-2 text-[13px] text-ink-2 hover:text-ink">
          Show all {detail.windows.length}
        </button>
      )}
    </>
  );
}

function AliasRow({ alias }: { alias: ApplicationAlias }) {
  const link =
    alias.link === 'package'
      ? { tone: 'mint' as const, label: 'Same Windows package' }
      : alias.link === 'executable-name'
        ? { tone: 'peach' as const, label: 'Matched by filename' }
        : { tone: 'grey' as const, label: 'Only program file' };

  return (
    <li className="rounded-[12px] px-3 py-3 hover:bg-card-2">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-medium text-ink">{alias.executable}</span>
        <StatusPill tone={link.tone}>{link.label}</StatusPill>
      </div>
      <p className="mt-1 truncate text-[12px] text-ink-4" title={alias.path ?? undefined}>
        {alias.path ?? 'Location not readable'}
      </p>
      <p className="mt-1 text-[12px] text-ink-3">
        {alias.sessionCount} sessions, {shortDate(alias.firstSeen)} to {shortDate(alias.lastSeen)}
      </p>
    </li>
  );
}

/** Seconds in front per hour of the day, from the day's sessions. */
function hoursOf(detail: ApplicationDetail, range: DayRange) {
  const seconds = new Array<number>(24).fill(0);
  for (const session of detail.sessions) {
    let at = Math.max(session.startedAt, range.fromUtcMs);
    const end = Math.min(session.endedAt ?? Date.now(), range.toUtcMs);
    // Spread the active time across the hours the session spans.
    const span = Math.max(1, end - at);
    const scale = session.activeSeconds / (span / 1000);
    while (at < end) {
      const hour = new Date(at).getHours();
      const next = Math.min(end, new Date(new Date(at).setMinutes(60, 0, 0)).getTime());
      seconds[hour]! += ((next - at) / 1000) * scale;
      at = next;
    }
  }
  return seconds.map((value, hour) => ({ hour, seconds: Math.round(value) }));
}
