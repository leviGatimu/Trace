import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CoverageSegment, SearchResult } from '@trace/contracts';
import { Workspace } from '@/app/Shell';
import { AnimatedClock, CountUp, Popover, RoundButton, StatusPill, ToggleChip } from '@/components/bento';
import { DayPicker } from '@/components/DayPicker';
import { coverageLabel } from '@/components/Evidence';
import { Icon } from '@/components/Icon';
import { Inspector, type Selection, type TimelineRow } from '@/components/Inspector';
import { AppMark } from '@/components/primitives';
import { useConnection, useCoverage, useSearch, useTimeline } from '@/hooks/useTracker';
import { appColor } from '@/lib/appColor';
import { clockTime, duration, localDayRange, relativeDay, shortDate, tidyWindowTitle } from '@/lib/format';
import { useSelectedDay, withDay } from '@/lib/range';

type Show = 'all' | 'sessions' | 'gaps';
const PAGE_SIZE = 25;

/** What a row's status pill says, used to filter by it. */
type Status = 'recorded' | 'live' | 'estimated' | 'locked' | 'offline' | 'norecord';
const STATUSES: { value: Status; label: string }[] = [
  { value: 'recorded', label: 'Recorded' },
  { value: 'live', label: 'In front now' },
  { value: 'estimated', label: 'End estimated' },
  { value: 'locked', label: 'Locked' },
  { value: 'offline', label: 'Off or asleep' },
  { value: 'norecord', label: 'No record' },
];

type TimeOfDay = 'night' | 'morning' | 'afternoon' | 'evening';
const TIMES: { value: TimeOfDay; label: string; from: number; to: number }[] = [
  { value: 'night', label: 'Night, 12–6 AM', from: 0, to: 6 },
  { value: 'morning', label: 'Morning, 6–12', from: 6, to: 12 },
  { value: 'afternoon', label: 'Afternoon, 12–6 PM', from: 12, to: 18 },
  { value: 'evening', label: 'Evening, 6 PM–12', from: 18, to: 24 },
];

const LENGTHS: { value: number; label: string }[] = [
  { value: 0, label: 'Any length' },
  { value: 10, label: '10s or more' },
  { value: 60, label: '1m or more' },
  { value: 300, label: '5m or more' },
  { value: 1800, label: '30m or more' },
];

type Sort = 'newest' | 'oldest' | 'longest' | 'shortest' | 'app';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'longest', label: 'Longest first' },
  { value: 'shortest', label: 'Shortest first' },
  { value: 'app', label: 'Application A–Z' },
];

export function TimelinePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [day, setDay] = useSelectedDay();
  const query = params.get('q')?.trim() ?? '';
  const show = (params.get('show') as Show | null) ?? 'all';
  const apps = useMemo(() => (params.get('app') ? params.get('app')!.split('|') : []), [params]);
  const statuses = useMemo(() => (params.get('status') ? (params.get('status')!.split(',') as Status[]) : []), [params]);
  const times = useMemo(() => (params.get('time') ? (params.get('time')!.split(',') as TimeOfDay[]) : []), [params]);
  const minSeconds = Number(params.get('min')) || 0;
  const sort = (params.get('sort') as Sort | null) ?? 'newest';
  const [selection, setSelection] = useState<Selection | null>(null);
  const [page, setPage] = useState(0);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setPage(0);
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const range = useMemo(() => localDayRange(day), [day]);
  const connected = useConnection().status === 'connected';
  const timeline = useTimeline(range, connected);
  const coverage = useCoverage(range, connected);

  const allRows = useMemo<TimelineRow[]>(() => {
    const rows: TimelineRow[] = [];
    for (const entry of timeline.data ?? []) {
      rows.push(entry.kind === 'session' ? { kind: 'session', entry, at: entry.startedAt } : { kind: 'system', entry, at: entry.startedAt });
    }
    for (const segment of coverage.data?.segments ?? []) {
      if (segment.source !== 'trace') rows.push({ kind: 'gap', segment, at: segment.startedAt });
    }
    // Newest first, like any log you read from the top.
    return rows.sort((a, b) => b.at - a.at);
  }, [timeline.data, coverage.data]);

  const applications = useMemo(() => {
    const seen = new Map<string, number>();
    for (const row of allRows) {
      if (row.kind === 'session') seen.set(row.entry.applicationName, row.entry.applicationId);
    }
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [allRows]);

  const rows = useMemo(() => {
    const filtered = allRows.filter((row) => {
      if (show === 'sessions' && row.kind !== 'session') return false;
      if (show === 'gaps' && row.kind === 'session') return false;
      if (apps.length > 0 && (row.kind !== 'session' || !apps.includes(row.entry.applicationName))) return false;
      if (statuses.length > 0 && !statuses.includes(statusOf(row))) return false;
      if (times.length > 0) {
        const hour = new Date(row.at).getHours();
        if (!TIMES.some((time) => times.includes(time.value) && hour >= time.from && hour < time.to)) return false;
      }
      if (minSeconds > 0 && secondsOf(row) < minSeconds) return false;
      return true;
    });

    const name = (row: TimelineRow) => (row.kind === 'session' ? row.entry.applicationName : '~');
    const order: Record<Sort, (a: TimelineRow, b: TimelineRow) => number> = {
      newest: (a, b) => b.at - a.at,
      oldest: (a, b) => a.at - b.at,
      longest: (a, b) => secondsOf(b) - secondsOf(a),
      shortest: (a, b) => secondsOf(a) - secondsOf(b),
      app: (a, b) => name(a).localeCompare(name(b)) || a.at - b.at,
    };
    return filtered.sort(order[sort]);
  }, [allRows, show, apps, statuses, times, minSeconds, sort]);

  const toggleIn = (key: string, list: string[], value: string, separator = ',') =>
    setParam(key, (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]).join(separator) || null);
  const filterCount = apps.length + statuses.length + times.length + (minSeconds > 0 ? 1 : 0);
  const anyFilter = filterCount > 0 || show !== 'all';
  const clearAll = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const key of ['app', 'status', 'time', 'min', 'show']) next.delete(key);
        return next;
      },
      { replace: true },
    );

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const selectRow = useCallback((row: TimelineRow | undefined) => {
    if (!row) return;
    if (row.kind === 'session') setSelection({ kind: 'session', sessionId: row.entry.sessionId });
    else if (row.kind === 'gap') setSelection({ kind: 'gap', segment: row.segment });
  }, []);

  // Arrow keys step through the records while the drawer is open.
  useEffect(() => {
    if (query) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;
      const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      const selectable = rows.filter((row) => row.kind !== 'system');
      const current = selectable.findIndex((row) => isSelected(row, selection));
      const next = selectable[Math.max(0, Math.min(selectable.length - 1, current + step))];
      selectRow(next);
      const index = rows.indexOf(next!);
      if (index >= 0) setPage(Math.floor(index / PAGE_SIZE));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rows, selection, selectRow, query]);

  const totals = useMemo(() => summarise(coverage.data?.segments ?? []), [coverage.data]);

  return (
    <Workspace>
      {selection && <Inspector selection={selection} onSelect={setSelection} onClose={() => setSelection(null)} />}

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-medium leading-tight tracking-[-0.02em] text-ink">
            {query ? 'Search' : 'Timeline'}
          </h1>
          <p className="mt-1 text-[14.5px] text-ink-3">
            {query ? `Every record matching "${query}", across all history.` : `Everything recorded ${relativeDay(day) === 'Today' ? 'today' : relativeDay(day) === 'Yesterday' ? 'yesterday' : `on ${relativeDay(day)}`}, newest first.`}
          </p>
        </div>
        {!query && (
          <div className="flex items-center gap-2">
            <DayPicker
              day={day}
              onChange={(next) => {
                setSelection(null);
                setPage(0);
                setDay(next);
              }}
            />
            <RoundButton label="Open the calendar" onClick={() => navigate(withDay('/calendar', day))}>
              <Icon name="calendar" />
            </RoundButton>
          </div>
        )}
      </header>

      {!query && (
        <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatusCard index={0} tone="#8ea7ff" label="Recorded" seconds={totals.recorded} active={show === 'sessions'} onClick={() => setParam('show', show === 'sessions' ? null : 'sessions')} />
          <StatusCard index={1} tone="#f4a06b" label="No record" seconds={totals.missing} count={totals.missingCount} active={show === 'gaps'} onClick={() => setParam('show', show === 'gaps' ? null : 'gaps')} />
          <StatusCard index={2} tone="#f6dc7c" label="Off or asleep" seconds={totals.dormant} />
          <StatusCard index={3} tone="#7ee2a8" label="Locked" seconds={totals.locked} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchPill value={query} onChange={(text) => setParam('q', text)} />
        {!query && (
          <span className="text-[14px] text-ink">
            {rows.length} <span className="text-ink-4">records</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!query &&
            (
              [
                ['all', 'Everything'],
                ['sessions', 'Sessions'],
                ['gaps', 'Gaps'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setParam('show', value === 'all' ? null : value)}
                className={`h-10 rounded-full px-4 text-[13.5px] transition ${
                  show === value ? 'bg-white text-[#111114]' : 'bg-card text-ink-2 hover:bg-card-2 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          {!query && (
            <Popover
              width={380}
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={open}
                  className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] transition ${
                    open || filterCount > 0 ? 'bg-white text-[#111114]' : 'bg-card text-ink-2 hover:bg-card-2 hover:text-ink'
                  }`}
                >
                  <Icon name="filter" />
                  Filters
                  {filterCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] text-white">
                      {filterCount}
                    </span>
                  )}
                </button>
              )}
            >
              {() => (
                <div className="space-y-4">
                  <FilterGroup title="Application">
                    {applications.length === 0 ? (
                      <p className="text-[13px] text-ink-4">No applications on this day.</p>
                    ) : (
                      <div className="flex max-h-[148px] flex-wrap gap-1.5 overflow-y-auto pr-1">
                        {applications.map(([name, id]) => (
                          <ToggleChip key={name} on={apps.includes(name)} onClick={() => toggleIn('app', apps, name, '|')}>
                            <AppMark name={name} color={appColor(name)} size={18} applicationId={id} />
                            {name}
                          </ToggleChip>
                        ))}
                      </div>
                    )}
                  </FilterGroup>
                  <FilterGroup title="Status">
                    <div className="flex flex-wrap gap-1.5">
                      {STATUSES.map((status) => (
                        <ToggleChip key={status.value} on={statuses.includes(status.value)} onClick={() => toggleIn('status', statuses, status.value)}>
                          {status.label}
                        </ToggleChip>
                      ))}
                    </div>
                  </FilterGroup>
                  <FilterGroup title="Time of day">
                    <div className="flex flex-wrap gap-1.5">
                      {TIMES.map((time) => (
                        <ToggleChip key={time.value} on={times.includes(time.value)} onClick={() => toggleIn('time', times, time.value)}>
                          {time.label}
                        </ToggleChip>
                      ))}
                    </div>
                  </FilterGroup>
                  <FilterGroup title="Length">
                    <div className="flex flex-wrap gap-1.5">
                      {LENGTHS.map((length) => (
                        <ToggleChip key={length.value} on={minSeconds === length.value} onClick={() => setParam('min', length.value ? String(length.value) : null)}>
                          {length.label}
                        </ToggleChip>
                      ))}
                    </div>
                  </FilterGroup>
                  <div className="flex items-center justify-between border-t border-hair pt-3">
                    <span className="text-[13px] text-ink-3">{rows.length} records match</span>
                    <button type="button" onClick={clearAll} className="text-[13px] text-ink-3 hover:text-ink">
                      Clear all
                    </button>
                  </div>
                </div>
              )}
            </Popover>
          )}
          {!query && (
            <Popover
              width={220}
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={open}
                  className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] transition ${
                    open ? 'bg-white text-[#111114]' : 'bg-card text-ink-2 hover:bg-card-2 hover:text-ink'
                  }`}
                >
                  <Icon name="sort" />
                  Sort: {SORTS.find((option) => option.value === sort)!.label.toLowerCase()}
                </button>
              )}
            >
              {(close) => (
                <ul className="-m-1.5" role="listbox" aria-label="Sort records">
                  {SORTS.map((option) => (
                    <li key={option.value}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={sort === option.value}
                        onClick={() => {
                          setParam('sort', option.value === 'newest' ? null : option.value);
                          close();
                        }}
                        className={`flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-[13.5px] transition ${
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
          )}
        </div>
      </div>

      {!query && anyFilter && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-card text-ink-3">
            <Icon name="filter" />
          </span>
          {show !== 'all' && <Chip onRemove={() => setParam('show', null)}>{show === 'gaps' ? 'Gaps' : 'Sessions'}</Chip>}
          {apps.map((name) => (
            <Chip key={name} onRemove={() => toggleIn('app', apps, name, '|')}>
              {name}
            </Chip>
          ))}
          {statuses.map((status) => (
            <Chip key={status} onRemove={() => toggleIn('status', statuses, status)}>
              {STATUSES.find((option) => option.value === status)?.label ?? status}
            </Chip>
          ))}
          {times.map((time) => (
            <Chip key={time} onRemove={() => toggleIn('time', times, time)}>
              {TIMES.find((option) => option.value === time)?.label ?? time}
            </Chip>
          ))}
          {minSeconds > 0 && (
            <Chip onRemove={() => setParam('min', null)}>{LENGTHS.find((option) => option.value === minSeconds)?.label ?? `${minSeconds}s+`}</Chip>
          )}
          <button type="button" className="text-[12.5px] text-ink-4 hover:text-ink" onClick={clearAll}>
            Clear all
          </button>
          <Pager page={page} pages={pages} onPage={setPage} />
        </div>
      )}

      {query ? (
        <SearchTable query={query} connected={connected} selection={selection} onSelect={setSelection} />
      ) : (
        <>
          <div className="overflow-hidden rounded-[22px] bg-card">
            {!connected ? (
              <Empty title="Waiting for the tracker" detail="Trace's recorder is not running yet." />
            ) : timeline.error ? (
              <Empty title="This day could not be loaded" detail="Try again in a moment." />
            ) : timeline.isPending ? (
              <Loading />
            ) : shown.length === 0 ? (
              <Empty
                title={allRows.length === 0 ? 'Nothing recorded on this day' : 'No records match'}
                detail={allRows.length === 0 ? 'Pick another day.' : 'Clear the filters to see everything.'}
              />
            ) : (
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[120px]" />
                  <col className="w-[260px]" />
                  <col />
                  <col className="w-[110px]" />
                  <col className="w-[130px]" />
                </colgroup>
                <thead>
                  <tr className="text-left text-[11.5px] uppercase tracking-[0.05em] text-ink-4">
                    <th className="px-6 pb-3 pt-5 font-medium">Time</th>
                    <th className="px-3 pb-3 pt-5 font-medium">Application</th>
                    <th className="px-3 pb-3 pt-5 font-medium">Window</th>
                    <th className="px-3 pb-3 pt-5 font-medium">Length</th>
                    <th className="px-6 pb-3 pt-5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row, index) => (
                    <Row
                      key={rowKey(row, index)}
                      index={index}
                      row={row}
                      selected={isSelected(row, selection)}
                      onSelect={() => selectRow(row)}
                      onFilterApp={(name) => setParam('app', name)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {!anyFilter && rows.length > PAGE_SIZE && (
            <div className="mt-4 flex justify-end">
              <Pager page={page} pages={pages} onPage={setPage} />
            </div>
          )}
        </>
      )}
    </Workspace>
  );
}

function Row({
  index,
  row,
  selected,
  onSelect,
  onFilterApp,
}: {
  index: number;
  row: TimelineRow;
  selected: boolean;
  onSelect: () => void;
  onFilterApp: (name: string) => void;
}) {
  const selectedRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (selected) selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const motion = { '--i': index } as React.CSSProperties;
  const base = `slide-in border-t border-hair transition-colors ${selected ? 'bg-select' : row.kind === 'system' ? '' : 'cursor-pointer hover:bg-card-2'}`;

  if (row.kind === 'session') {
    const { entry } = row;
    return (
      <tr ref={selectedRef} className={base} style={motion} onClick={onSelect} aria-selected={selected}>
        <td className="px-6 py-3.5 text-ink-2">{clockTime(entry.startedAt)}</td>
        <td className="px-3 py-3.5">
          <span className="flex min-w-0 items-center gap-3">
            <AppMark name={entry.applicationName} color={appColor(entry.applicationName)} size={34} applicationId={entry.applicationId} />
            <span className="min-w-0">
              <button
                type="button"
                className="block max-w-full truncate text-left font-medium text-ink hover:underline"
                onClick={(event) => {
                  event.stopPropagation();
                  onFilterApp(entry.applicationName);
                }}
                title={`Only ${entry.applicationName}`}
              >
                {entry.applicationName}
              </button>
              <span className="block truncate text-[12px] text-ink-4">{entry.executable}</span>
            </span>
          </span>
        </td>
        <td className="truncate px-3 py-3.5 text-ink-3" title={entry.primaryWindowTitle ?? undefined}>
          {tidyWindowTitle(entry.primaryWindowTitle, entry.applicationName) ?? '—'}
        </td>
        <td className="px-3 py-3.5 text-ink">{entry.endedAt === null ? 'now' : duration(entry.activeSeconds + entry.idleSeconds)}</td>
        <td className="px-6 py-3.5">
          {entry.endedAt === null ? (
            <StatusPill tone="mint">
              <span className="pulse relative mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-mint" />
              in front now
            </StatusPill>
          ) : entry.endReason === 'CRASH_RECOVERY' ? (
            <StatusPill tone="peach">end estimated</StatusPill>
          ) : (
            <StatusPill tone="lilac">recorded</StatusPill>
          )}
        </td>
      </tr>
    );
  }

  if (row.kind === 'system') {
    const label = { LOCKED: 'Computer locked', ASLEEP: 'Computer asleep', PAUSED: 'Tracking paused', UNKNOWN: 'Not recorded' }[row.entry.interval];
    const length = row.entry.endedAt === null ? 'now' : duration(Math.round((row.entry.endedAt - row.entry.startedAt) / 1000));
    return (
      <tr className={base} style={motion}>
        <td className="px-6 py-3.5 text-ink-3">{clockTime(row.entry.startedAt)}</td>
        <td className="px-3 py-3.5">
          <span className="flex items-center gap-3">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-mint/12 text-mint">
              <Icon name="clock" />
            </span>
            <span className="text-ink-2">{label}</span>
          </span>
        </td>
        <td className="px-3 py-3.5 text-ink-4">—</td>
        <td className="px-3 py-3.5 text-ink-2">{length}</td>
        <td className="px-6 py-3.5">
          <StatusPill tone="mint">locked</StatusPill>
        </td>
      </tr>
    );
  }

  const { segment } = row;
  const dormant = segment.kind === 'powered-off' || segment.kind === 'asleep' || segment.kind === 'signed-out';
  return (
    <tr ref={selectedRef} className={base} style={motion} onClick={onSelect} aria-selected={selected}>
      <td className="px-6 py-3.5 text-ink-3">
        {segment.startEstimated && '~'}
        {clockTime(segment.startedAt)}
      </td>
      <td className="px-3 py-3.5">
        <span className="flex items-center gap-3">
          <span
            className={`flex h-[34px] w-[34px] items-center justify-center rounded-[10px] ${
              dormant ? 'bg-butter/12 text-butter' : 'bg-peach/12 text-peach'
            }`}
          >
            <AnimatedClock />
          </span>
          <span className="text-ink-2">{coverageLabel[segment.kind]}</span>
        </span>
      </td>
      <td className="truncate px-3 py-3.5 text-ink-4">{dormant ? 'Windows recorded this' : 'No application recorded'}</td>
      <td className="px-3 py-3.5 text-ink-2">{duration(Math.round(((segment.endedAt ?? Date.now()) - segment.startedAt) / 1000))}</td>
      <td className="px-6 py-3.5">
        {segment.evidence === 'observed' ? (
          <StatusPill tone="grey">{dormant ? 'from Windows' : 'recorded'}</StatusPill>
        ) : segment.evidence === 'inferred' ? (
          <StatusPill tone="peach">no record</StatusPill>
        ) : (
          <StatusPill tone="grey">unknown</StatusPill>
        )}
      </td>
    </tr>
  );
}

function StatusCard({
  index,
  tone,
  label,
  seconds,
  count,
  active = false,
  onClick,
}: {
  index: number;
  tone: string;
  label: string;
  seconds: number;
  count?: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="px-5 py-2.5 text-[14px] font-medium text-[#17171a]" style={{ background: tone }}>
        {label}
      </div>
      <div className="card-wave flex items-center gap-3 px-5 pb-5 pt-4">
        <span className="text-[30px] font-medium leading-none tracking-[-0.03em] text-ink">
          <CountUp value={seconds} format={duration} />
        </span>
        {count !== undefined && count > 0 && (
          <span className="rounded-full px-2 py-[2px] text-[11.5px] font-medium text-[#17171a]" style={{ background: tone }}>
            {count} {count === 1 ? 'gap' : 'gaps'}
          </span>
        )}
      </div>
    </>
  );

  const classes = `rise overflow-hidden rounded-[22px] bg-card text-left ${active ? 'ring-2 ring-white/80' : ''}`;
  const style = { '--i': index } as React.CSSProperties;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${classes} lift`} style={style}>
      {body}
    </button>
  ) : (
    <div className={classes} style={style}>
      {body}
    </div>
  );
}

function SearchPill({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <form
      role="search"
      className="flex h-11 w-[340px] items-center gap-2.5 rounded-[14px] bg-card px-4 focus-within:ring-2 focus-within:ring-accent/60"
      onSubmit={(event) => {
        event.preventDefault();
        onChange(draft.trim());
      }}
    >
      <span className="text-ink-3">
        <Icon name="search" />
      </span>
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && draft) {
            event.stopPropagation();
            setDraft('');
            onChange('');
          }
        }}
        placeholder="Search all history"
        aria-label="Search all history"
        className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} className="text-ink-3 hover:text-ink" aria-label="Clear search">
          <Icon name="close" />
        </button>
      )}
    </form>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-card pl-3 pr-1.5 text-[13px] text-ink">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove filter"
        className="flex h-6 w-6 items-center justify-center rounded-full bg-card-2 text-ink-3 hover:text-ink"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </span>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  const arrow = 'flex h-9 w-9 items-center justify-center rounded-[10px] bg-card text-ink-2 transition hover:bg-card-2 disabled:opacity-30';
  return (
    <span className="ml-auto flex items-center gap-2 text-[13px] text-ink-2">
      {page + 1} of {pages}
      <button type="button" className={arrow} disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">
        <Icon name="left" />
      </button>
      <button type="button" className={arrow} disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page">
        <Icon name="right" />
      </button>
    </span>
  );
}

function SearchTable({
  query,
  connected,
  selection,
  onSelect,
}: {
  query: string;
  connected: boolean;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}) {
  const navigate = useNavigate();
  const { data, isPending, error } = useSearch(query, connected);

  return (
    <div className="overflow-hidden rounded-[22px] bg-card">
      {error ? (
        <Empty title="The search could not be run" detail="Try again in a moment." />
      ) : isPending ? (
        <Loading />
      ) : data.length === 0 ? (
        <Empty title={`Nothing matches "${query}"`} detail="Try an app name, part of a window title, or an ID like S-1204." />
      ) : (
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-[170px]" />
            <col className="w-[260px]" />
            <col />
            <col className="w-[110px]" />
            <col className="w-[130px]" />
          </colgroup>
          <thead>
            <tr className="text-left text-[11.5px] uppercase tracking-[0.05em] text-ink-4">
              <th className="px-6 pb-3 pt-5 font-medium">When</th>
              <th className="px-3 pb-3 pt-5 font-medium">Application</th>
              <th className="px-3 pb-3 pt-5 font-medium">Matched</th>
              <th className="px-3 pb-3 pt-5 font-medium">Length</th>
              <th className="px-6 pb-3 pt-5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {data.map((result: SearchResult, index) => {
              const selected = selection?.kind === 'session' && selection.sessionId === result.sessionId;
              return (
                <tr
                  key={`${result.sessionId}-${index}`}
                  className={`cursor-pointer border-t border-hair transition-colors ${selected ? 'bg-select' : 'hover:bg-card-2'}`}
                  onClick={() => onSelect({ kind: 'session', sessionId: result.sessionId })}
                >
                  <td className="px-6 py-3.5 text-ink-2">
                    {shortDate(result.startedAt)}, {clockTime(result.startedAt)}
                  </td>
                  <td className="px-3 py-3.5">
                    <span className="flex min-w-0 items-center gap-3">
                      <AppMark name={result.applicationName} color={appColor(result.applicationName)} size={34} applicationId={result.applicationId} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{result.applicationName}</span>
                        <span className="block truncate text-[12px] text-ink-4">{result.executable}</span>
                      </span>
                    </span>
                  </td>
                  <td className="truncate px-3 py-3.5 text-ink-3">
                    {result.matchedOn === 'title'
                      ? tidyWindowTitle(result.matchedTitle, result.applicationName)
                      : result.matchedOn === 'evidence'
                        ? `Record ${result.matchedTitle}`
                        : 'Application name'}
                  </td>
                  <td className="px-3 py-3.5 text-ink">{duration(result.durationSeconds)}</td>
                  <td className="px-6 py-3.5 text-right">
                    <button
                      type="button"
                      className="rounded-full bg-card-2 px-3 py-1.5 text-[12.5px] text-ink-2 hover:text-ink"
                      onClick={(event) => {
                        event.stopPropagation();
                        const dayStart = new Date(result.startedAt);
                        dayStart.setHours(0, 0, 0, 0);
                        navigate(withDay('/timeline', dayStart));
                      }}
                    >
                      Open day
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Empty({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-[16px] font-medium text-ink">{title}</p>
      {detail && <p className="mt-1.5 text-ink-3">{detail}</p>}
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-3 p-6" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="h-11 animate-pulse rounded-[12px] bg-card-2" />
      ))}
    </div>
  );
}

function summarise(segments: CoverageSegment[]) {
  const now = Date.now();
  const totals = { recorded: 0, missing: 0, missingCount: 0, dormant: 0, locked: 0 };
  for (const segment of segments) {
    const seconds = Math.round(((segment.endedAt ?? now) - segment.startedAt) / 1000);
    if (segment.kind === 'recorded') totals.recorded += seconds;
    else if (segment.kind === 'locked' || segment.kind === 'paused') totals.locked += seconds;
    else if (segment.kind === 'powered-off' || segment.kind === 'asleep' || segment.kind === 'signed-out') totals.dormant += seconds;
    else if (segment.kind !== 'before-trace') {
      totals.missing += seconds;
      totals.missingCount += 1;
    }
  }
  return totals;
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[12px] font-medium uppercase tracking-[0.05em] text-ink-4">{title}</h3>
      {children}
    </section>
  );
}

function statusOf(row: TimelineRow): Status {
  if (row.kind === 'session') {
    if (row.entry.endedAt === null) return 'live';
    return row.entry.endReason === 'CRASH_RECOVERY' ? 'estimated' : 'recorded';
  }
  if (row.kind === 'system') return 'locked';
  const kind = row.segment.kind;
  return kind === 'powered-off' || kind === 'asleep' || kind === 'signed-out' ? 'offline' : 'norecord';
}

function secondsOf(row: TimelineRow): number {
  if (row.kind === 'session') {
    return row.entry.endedAt === null
      ? Math.round((Date.now() - row.entry.startedAt) / 1000)
      : row.entry.activeSeconds + row.entry.idleSeconds;
  }
  const start = row.kind === 'system' ? row.entry.startedAt : row.segment.startedAt;
  const end = (row.kind === 'system' ? row.entry.endedAt : row.segment.endedAt) ?? Date.now();
  return Math.round((end - start) / 1000);
}

function isSelected(row: TimelineRow, selection: Selection | null): boolean {
  if (!selection) return false;
  if (selection.kind === 'session') return row.kind === 'session' && row.entry.sessionId === selection.sessionId;
  return row.kind === 'gap' && row.segment.startedAt === selection.segment.startedAt && row.segment.kind === selection.segment.kind;
}

function rowKey(row: TimelineRow, index: number): string {
  if (row.kind === 'session') return `s${row.entry.sessionId}`;
  if (row.kind === 'gap') return `g${row.segment.kind}${row.segment.startedAt}`;
  return `y${row.entry.startedAt}-${index}`;
}
