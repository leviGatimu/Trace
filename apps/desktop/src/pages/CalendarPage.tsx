import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CalendarDay } from '@trace/contracts';
import {
  Button,
  EmptyState,
  ErrorState,
  Headline,
  PageHeader,
  Skeleton,
} from '@/components/primitives';
import { useCalendar, useConnection } from '@/hooks/useTracker';
import { addDays, duration, isSameLocalDay, startOfLocalDay } from '@/lib/format';

/**
 * A month at a time, each day carrying how much of it was recorded.
 *
 * The point of a history is being able to reach back into it. Until now the
 * only way to a past day was the arrows on Overview, one day per click — fine
 * for yesterday, useless for last month.
 *
 * Days are shaded by how active they were rather than labelled with a figure:
 * the question a calendar answers is "which days were busy", and reading
 * thirty numbers to answer it is slower than looking.
 */
export function CalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const navigate = useNavigate();

  const connection = useConnection();
  const connected = connection.status === 'connected';

  // The grid always starts on a Monday and covers whole weeks, so the calendar
  // keeps its shape whichever day the month begins on.
  const grid = useMemo(() => buildGrid(month), [month]);
  const dayStarts = useMemo(() => grid.map((day) => day.getTime()), [grid]);

  const { data, isPending, error, refetch } = useCalendar(dayStarts, connected);

  const byDay = useMemo(
    () => new Map((data ?? []).map((day) => [day.startUtcMs, day])),
    [data],
  );

  const inMonth = (data ?? []).filter((day) => new Date(day.startUtcMs).getMonth() === month.getMonth());
  const total = inMonth.reduce((sum, day) => sum + day.activeSeconds, 0);
  const recorded = inMonth.filter((day) => day.activeSeconds > 0).length;
  const busiest = Math.max(...(data ?? []).map((day) => day.activeSeconds), 1);

  const today = startOfLocalDay(new Date());
  const isThisMonth = isSameLocalDay(startOfMonth(today), month);

  return (
    <>
      <PageHeader
        title={month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        actions={
          <div className="flex items-center gap-1">
            <Button variant="ghost" title="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
              ←
            </Button>
            <Button
              variant="ghost"
              title="Next month"
              onClick={() => !isThisMonth && setMonth(addMonths(month, 1))}
            >
              <span className={isThisMonth ? 'text-ink-4/40' : undefined}>→</span>
            </Button>
            {!isThisMonth && (
              <Button variant="ghost" onClick={() => setMonth(startOfMonth(today))}>
                This month
              </Button>
            )}
          </div>
        }
      />

      {!connected ? (
        <EmptyState title="Waiting for the tracker" />
      ) : error ? (
        <ErrorState message="This month could not be loaded." onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton rows={7} />
      ) : (
        <div className="enter">
          <Headline
            value={duration(total)}
            unit="this month"
            facts={[
              `${recorded} ${recorded === 1 ? 'day' : 'days'} recorded`,
              `${duration(recorded > 0 ? Math.round(total / recorded) : 0)} average`,
            ]}
          />

          <div className="mt-8 grid grid-cols-7 gap-1.5">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
              <div key={label} className="eyebrow px-2 pb-1">
                {label}
              </div>
            ))}

            {grid.map((day) => (
              <DayCell
                key={day.getTime()}
                day={day}
                data={byDay.get(day.getTime())}
                busiest={busiest}
                dimmed={day.getMonth() !== month.getMonth()}
                isToday={isSameLocalDay(day, today)}
                inFuture={day > today}
                onOpen={() => navigate(`/timeline?day=${day.getTime()}`)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function DayCell({
  day,
  data,
  busiest,
  dimmed,
  isToday,
  inFuture,
  onOpen,
}: {
  day: Date;
  data: CalendarDay | undefined;
  busiest: number;
  dimmed: boolean;
  isToday: boolean;
  inFuture: boolean;
  onOpen: () => void;
}) {
  const active = data?.activeSeconds ?? 0;

  // A floor, so a day with ten minutes on it still reads as "something
  // happened"; and a ceiling, so the busiest day stays dark enough for the
  // white figure sitting on it to be legible.
  const intensity = 0.12 + (active / busiest) * 0.46;

  return (
    <button
      type="button"
      disabled={inFuture || active === 0}
      onClick={onOpen}
      title={active > 0 ? `${duration(active)} · ${data?.sessionCount} sessions` : 'Nothing recorded'}
      className={[
        'relative flex h-16 flex-col justify-between rounded-md px-2 py-1.5 text-left transition duration-150',
        // Brightness rather than a hover colour: the ground here is computed
        // per day, so a class-based hover background would simply erase it.
        active > 0 ? 'cursor-pointer hover:brightness-[1.35]' : 'cursor-default',
        dimmed ? 'opacity-35' : '',
      ].join(' ')}
      style={{
        // A day with nothing on it gets no ground at all. Forty-two filled
        // rectangles would be a grid of boxes with the data hidden inside it;
        // this way the only marks on the page are the days that hold something.
        background:
          active > 0
            ? `color-mix(in oklab, var(--color-accent) ${Math.round(intensity * 100)}%, var(--color-canvas))`
            : undefined,
        boxShadow: isToday ? 'inset 0 0 0 1px var(--color-accent)' : undefined,
      }}
    >
      <span className={`data ${isToday || active > 0 ? 'text-ink' : 'text-ink-3'}`}>
        {day.getDate()}
      </span>
      {active > 0 && (
        <span className="data truncate text-ink">{duration(active)}</span>
      )}
    </button>
  );
}

function startOfMonth(date: Date): Date {
  const start = startOfLocalDay(date);
  start.setDate(1);
  return start;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

/**
 * Whole weeks covering the month, Monday first.
 *
 * Built by stepping real dates rather than by adding 86,400,000 milliseconds,
 * so a daylight-saving change inside the month does not slide every subsequent
 * day by an hour.
 */
function buildGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7; // Sunday is 0; we want Monday first
  const start = addDays(first, -offset);

  const last = addMonths(first, 1);
  const days: Date[] = [];

  for (let day = start; day < last || days.length % 7 !== 0; day = addDays(day, 1)) {
    days.push(day);

    if (days.length > 42) {
      break;
    }
  }

  return days;
}
