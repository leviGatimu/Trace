import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CalendarDay, CoverageSegment } from '@trace/contracts';
import { Workspace } from '@/app/Shell';
import { Card, CornerLink, CountUp, Delta } from '@/components/bento';
import { HourBars } from '@/components/charts';
import { Icon } from '@/components/Icon';
import { AppMark } from '@/components/primitives';
import { useAnalytics, useCalendar, useConnection, useCoverage } from '@/hooks/useTracker';
import { appColor } from '@/lib/appColor';
import { addDays, duration, isSameLocalDay, startOfLocalDay } from '@/lib/format';
import { useSelectedDay, withDay } from '@/lib/range';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [selectedDay, setSelectedDay] = useSelectedDay();
  const month = useMemo(() => {
    const value = Number(params.get('month'));
    return startOfMonth(value > 0 ? new Date(value) : selectedDay);
  }, [params, selectedDay]);

  const setMonth = (next: Date) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set('month', String(startOfMonth(next).getTime()));
        return updated;
      },
      { replace: true },
    );

  const connected = useConnection().status === 'connected';
  const grid = useMemo(() => buildGrid(month), [month]);
  const dayStarts = useMemo(() => grid.map((day) => day.getTime()), [grid]);
  const monthDays = useMemo(() => daysOf(month), [month]);
  const previousMonthDays = useMemo(() => daysOf(addMonths(month, -1)), [month]);
  const range = useMemo(() => ({ fromUtcMs: dayStarts[0]!, toUtcMs: addDays(grid[grid.length - 1]!, 1).getTime() }), [dayStarts, grid]);

  const calendar = useCalendar(dayStarts, connected);
  const coverage = useCoverage(range, connected);
  const analytics = useAnalytics(monthDays, connected);
  const previous = useAnalytics(previousMonthDays, connected);

  const byDay = useMemo(() => new Map((calendar.data ?? []).map((day) => [day.startUtcMs, day])), [calendar.data]);
  const gapsByDay = useMemo(() => missingByDay(grid, coverage.data?.segments), [grid, coverage.data]);
  const busiest = Math.max(...(calendar.data ?? []).map((day) => day.activeSeconds), 1);
  const today = startOfLocalDay(new Date());
  const isThisMonth = isSameLocalDay(startOfMonth(today), month);

  const summary = analytics.data;
  const hours = (summary?.hours ?? []).map((hour) => ({ hour: hour.hour, seconds: hour.activeSeconds }));
  const monthName = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const open = (day: Date) => {
    setSelectedDay(day);
    navigate(withDay('/timeline', day));
  };

  return (
    <Workspace>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-medium leading-tight tracking-[-0.02em] text-ink">Calendar</h1>
          <p className="mt-1 text-[14.5px] text-ink-3">Pick any day to open everything recorded on it.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex h-10 items-center gap-1 rounded-full bg-card px-1">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 transition hover:bg-card-2 hover:text-ink"
              onClick={() => setMonth(addMonths(month, -1))}
              aria-label="Previous month"
            >
              <Icon name="left" />
            </button>
            <span className="min-w-[132px] text-center text-[13.5px] font-medium text-ink">{monthName}</span>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 transition hover:bg-card-2 hover:text-ink disabled:opacity-30"
              onClick={() => setMonth(addMonths(month, 1))}
              disabled={isThisMonth}
              aria-label="Next month"
            >
              <Icon name="right" />
            </button>
          </div>
          {!isThisMonth && (
            <button type="button" onClick={() => setMonth(today)} className="h-10 rounded-full bg-white px-4 text-[13.5px] font-medium text-[#111114]">
              This month
            </button>
          )}
        </div>
      </header>

      {/* The month in four numbers */}
      <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Card tone="light" className="min-h-[136px]" index={0}>
          <p className="text-[14px] text-[#55555c]">Time in front</p>
          <div className="mt-6 flex items-center gap-2.5">
            <span className="text-[30px] font-medium leading-none tracking-[-0.03em]">{summary ? <CountUp value={summary.activeSeconds} format={duration} /> : '—'}</span>
            <Delta current={summary?.activeSeconds ?? 0} previous={previous.data?.activeSeconds} />
          </div>
          <p className="mt-3 text-[12px] text-[#77777e]">This month vs last</p>
        </Card>
        <MonthStat index={1} label="Days recorded" value={summary ? <CountUp value={summary.recordedDayCount} /> : '—'} note={`of ${monthDays.length} days`} />
        <MonthStat
          index={2}
          label="Daily average"
          value={summary ? <CountUp value={summary.averageActiveSecondsPerRecordedDay} format={duration} /> : '—'}
          note="On days with a record"
        />
        <MonthStat
          index={3}
          label="Busiest day"
          value={summary?.busiestDayStartUtcMs ? new Date(summary.busiestDayStartUtcMs).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'}
          note={summary?.busiestDayStartUtcMs ? duration(byDay.get(summary.busiestDayStartUtcMs)?.activeSeconds ?? 0) + ' in front' : 'Nothing recorded yet'}
          onClick={summary?.busiestDayStartUtcMs ? () => open(new Date(summary.busiestDayStartUtcMs!)) : undefined}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        {/* The month */}
        <Card className="xl:col-span-8" index={2}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[17px] font-medium text-ink">{monthName}</h2>
            <Legend />
          </div>
          <div className="mb-2 grid grid-cols-7 gap-2">
            {WEEKDAYS.map((name) => (
              <span key={name} className="px-1 text-[12px] font-medium uppercase tracking-[0.05em] text-ink-4">
                {name}
              </span>
            ))}
          </div>
          {calendar.isPending ? (
            <div className="grid grid-cols-7 gap-2">
              {grid.map((day) => (
                <span key={day.getTime()} className="h-[84px] animate-pulse rounded-[14px] bg-card-2" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {grid.map((day, index) => (
                <DayTile
                  key={day.getTime()}
                  index={index}
                  day={day}
                  data={byDay.get(day.getTime())}
                  gapSeconds={gapsByDay.get(day.getTime()) ?? 0}
                  busiest={busiest}
                  inMonth={day.getMonth() === month.getMonth()}
                  isToday={isSameLocalDay(day, today)}
                  isSelected={isSameLocalDay(day, selectedDay)}
                  isFuture={day > today}
                  onOpen={() => open(day)}
                />
              ))}
            </div>
          )}
        </Card>

        {/* What filled the month */}
        <Card className="p-0 xl:col-span-4" index={3}>
          <div className="px-5 pb-2 pt-5">
            <h2 className="text-[17px] font-medium text-ink">Most in front</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-3">{monthName}</p>
          </div>
          <CornerLink to={withDay('/applications?scope=month', today)} label="All applications" tone="light" />
          {!summary || summary.topApplications.length === 0 ? (
            <p className="px-5 pb-6 pt-4 text-ink-3">Nothing recorded this month.</p>
          ) : (
            <ul className="px-2 pb-3">
              {summary.topApplications.map((application) => {
                const top = summary.topApplications[0]!.activeSeconds || 1;
                const colour = appColor(application.name);
                return (
                  <li key={application.applicationId} className="flex items-center gap-3 rounded-[14px] px-3 py-2.5">
                    <AppMark name={application.name} color={colour} size={36} applicationId={application.applicationId} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-medium text-ink">{application.name}</span>
                        <span className="shrink-0 text-[13px] text-ink-2">{duration(application.activeSeconds)}</span>
                      </span>
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-card-2">
                        <span className="block h-full rounded-full" style={{ width: `${(application.activeSeconds / top) * 100}%`, background: colour }} />
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Hours */}
        <Card className="xl:col-span-12" index={4}>
          <div className="mb-5 flex items-baseline gap-4">
            <h2 className="text-[17px] font-medium text-ink">When you use your PC</h2>
            <span className="text-[12.5px] text-ink-3">
              Time in front by hour, added up over {summary?.recordedDayCount ?? 0} recorded days
            </span>
          </div>
          {summary && summary.recordedDayCount > 0 ? (
            <HourBars hours={hours} height={200} />
          ) : (
            <p className="py-8 text-center text-ink-3">Nothing recorded this month.</p>
          )}
          {summary && summary.recordedDayCount > 0 && summary.recordedDayCount < 7 && (
            <p className="mt-4 text-[12.5px] text-peach">
              Only {summary.recordedDayCount} recorded days so far, too few to call any hour typical.
            </p>
          )}
        </Card>
      </div>
    </Workspace>
  );
}

function MonthStat({
  index,
  label,
  value,
  note,
  onClick,
}: {
  index: number;
  label: string;
  value: React.ReactNode;
  note: string;
  onClick?: () => void;
}) {
  return (
    <Card className={`min-h-[136px] ${onClick ? 'cursor-pointer' : ''}`} index={index} lift={Boolean(onClick)}>
      <div onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
        <p className="text-[14px] text-ink-2">{label}</p>
        <p className="mt-6 text-[30px] font-medium leading-none tracking-[-0.03em] text-ink">{value}</p>
        <p className="mt-3 text-[12px] text-ink-4">{note}</p>
      </div>
    </Card>
  );
}

/**
 * One day: shaded by how much was in front, its total in the corner, and an
 * orange dot when part of it has no record.
 */
function DayTile({
  index,
  day,
  data,
  gapSeconds,
  busiest,
  inMonth,
  isToday,
  isSelected,
  isFuture,
  onOpen,
}: {
  index: number;
  day: Date;
  data: CalendarDay | undefined;
  gapSeconds: number;
  busiest: number;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isFuture: boolean;
  onOpen: () => void;
}) {
  const active = data?.activeSeconds ?? 0;
  const strength = active > 0 ? 0.14 + 0.66 * (active / busiest) : 0;
  const label = `${day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}: ${
    active > 0 ? `${duration(active)} in front` : 'nothing recorded'
  }${gapSeconds >= 600 ? `, ${duration(gapSeconds)} with no record` : ''}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={isFuture}
      aria-label={label}
      title={label}
      className={[
        'pop group relative flex h-[84px] flex-col justify-between rounded-[14px] p-2.5 text-left transition hover:-translate-y-0.5',
        isFuture ? 'cursor-default opacity-30' : 'hover:ring-2 hover:ring-white/40',
        isSelected ? 'ring-2 ring-white' : '',
        inMonth ? '' : 'opacity-40',
      ].join(' ')}
      style={
        {
          background: active > 0 ? `rgb(91 140 255 / ${strength})` : 'var(--color-card-2)',
          '--i': index,
        } as React.CSSProperties
      }
    >
      <span className="flex items-center justify-between">
        <span
          className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[13px] font-medium ${
            isToday ? 'bg-white text-[#111114]' : 'text-ink'
          }`}
        >
          {day.getDate()}
        </span>
        {gapSeconds >= 600 && <span className="h-2 w-2 rounded-full bg-peach" aria-hidden />}
      </span>
      {active > 0 && <span className="text-[12.5px] font-medium text-ink">{duration(active)}</span>}
    </button>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-[12px] text-ink-3">
      <span className="flex items-center gap-1.5">
        Less
        {[0.14, 0.35, 0.55, 0.8].map((alpha) => (
          <span key={alpha} className="h-3 w-3 rounded-[4px]" style={{ background: `rgb(91 140 255 / ${alpha})` }} />
        ))}
        More
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-peach" /> Has gaps
      </span>
    </div>
  );
}

/** Seconds per day with no record and an inferred or unknown reason. */
function missingByDay(grid: Date[], segments: CoverageSegment[] | undefined): Map<number, number> {
  const totals = new Map<number, number>();
  if (!segments) return totals;
  for (const day of grid) {
    const from = day.getTime();
    const to = Math.min(addDays(day, 1).getTime(), Date.now());
    let seconds = 0;
    for (const segment of segments) {
      if (segment.evidence === 'observed' || segment.kind === 'before-trace') continue;
      const start = Math.max(segment.startedAt, from);
      const end = Math.min(segment.endedAt ?? Date.now(), to);
      if (end > start) seconds += (end - start) / 1000;
    }
    totals.set(from, Math.round(seconds));
  }
  return totals;
}

function daysOf(month: Date): number[] {
  const days: number[] = [];
  for (let day = startOfMonth(month); day.getMonth() === month.getMonth(); day = addDays(day, 1)) {
    days.push(day.getTime());
  }
  return days;
}

function startOfMonth(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), 1);
}

function addMonths(day: Date, months: number): Date {
  return new Date(day.getFullYear(), day.getMonth() + months, 1);
}

/** Whole weeks, Monday first, covering the month. */
function buildGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const days: Date[] = [];
  for (let day = start; day <= last || days.length % 7 !== 0; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}
