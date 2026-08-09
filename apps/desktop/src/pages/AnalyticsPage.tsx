import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AnalyticsSummary, ApplicationSummary, CalendarDay } from '@trace/contracts';
import {
  AppSwatch,
  EmptyState,
  ErrorState,
  Headline,
  Meter,
  PageHeader,
  Row,
  Section,
  Skeleton,
  Tabs,
} from '@/components/primitives';
import { useAnalytics, useConnection } from '@/hooks/useTracker';
import { appColor } from '@/lib/appColor';
import {
  addDays,
  clockTime,
  duration,
  hourLabel,
  shortDate,
  startOfLocalDay,
} from '@/lib/format';

type Period = 'week' | 'month' | 'year';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
];

/**
 * "What does my computer time actually look like?"
 *
 * Overview answers for one day. This answers across many: which days were busy,
 * which hours you are at the machine, and what filled them. Every figure on the
 * page — including the averages and the busiest day — is computed by the
 * tracker, so nothing here can disagree with the rest of the product.
 *
 * Periods run to date rather than over the whole calendar unit. A month view
 * that averaged today's four hours over thirty-one days would be reporting a
 * number about days that have not happened yet.
 */
export function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('week');
  const navigate = useNavigate();

  const connection = useConnection();
  const connected = connection.status === 'connected';

  const days = useMemo(() => daysIn(period), [period]);
  const dayStarts = useMemo(() => days.map((day) => day.getTime()), [days]);

  const { data, isPending, error, refetch } = useAnalytics(dayStarts, connected);

  return (
    <>
      <PageHeader title="Analytics" meta={spanLabel(days)} />

      <Tabs value={period} options={PERIODS} onChange={setPeriod} />

      {!connected ? (
        <EmptyState title="Waiting for the tracker" />
      ) : error ? (
        <ErrorState message="This period could not be loaded." onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton rows={8} />
      ) : data.sessionCount === 0 ? (
        <EmptyState
          title="Nothing recorded in this period"
          detail="Leave Trace running and its picture of your days fills in on its own."
        />
      ) : (
        <Summary
          summary={data}
          onOpenDay={(startUtcMs) => navigate(`/timeline?day=${startUtcMs}`)}
          onOpenApplication={(applicationId) => navigate(`/applications/${applicationId}`)}
        />
      )}
    </>
  );
}

function Summary({
  summary,
  onOpenDay,
  onOpenApplication,
}: {
  summary: AnalyticsSummary;
  onOpenDay: (startUtcMs: number) => void;
  onOpenApplication: (applicationId: number) => void;
}) {
  return (
    <div className="enter">
      <Headline
        value={duration(summary.activeSeconds)}
        unit="recorded"
        facts={[
          `${duration(summary.averageActiveSecondsPerRecordedDay)} on an average day`,
          `${summary.recordedDayCount} ${summary.recordedDayCount === 1 ? 'day' : 'days'}`,
          `${summary.applicationCount} applications`,
          `${duration(summary.idleSeconds)} idle`,
        ]}
      />

      <Section label="Active time by day">
        <Columns
          bars={summary.days.map((day) => ({
            key: day.startUtcMs,
            value: day.activeSeconds,
            label: dayLabel(day, summary.days.length),
            // Nothing to single out when only one day has anything on it.
            emphasised:
              summary.recordedDayCount > 1 && day.startUtcMs === summary.busiestDayStartUtcMs,
            title: `${shortDate(day.startUtcMs)} · ${duration(day.activeSeconds)}`,
            onClick: day.activeSeconds > 0 ? () => onOpenDay(day.startUtcMs) : undefined,
          }))}
        />
      </Section>

      <Section label="When you are at the computer">
        <Columns
          bars={summary.hours.map((hour) => ({
            key: hour.hour,
            value: hour.activeSeconds,
            // Every third hour, so the axis stays legible at any width.
            label: hour.hour % 3 === 0 ? hourLabel(hour.hour) : '',
            title: `${hourLabel(hour.hour)} · ${duration(hour.activeSeconds)}`,
          }))}
        />
      </Section>

      {summary.longestSession && (
        <Section label="Longest stretch">
          <p className="text-ink-2">
            <span className="text-ink">{summary.longestSession.applicationName}</span> for{' '}
            <span className="data text-ink">{duration(summary.longestSession.activeSeconds)}</span>,
            starting {shortDate(summary.longestSession.startedAt)} at{' '}
            <span className="data">{clockTime(summary.longestSession.startedAt)}</span>
          </p>
        </Section>
      )}

      <MostUsed applications={summary.topApplications} onOpen={onOpenApplication} />
    </div>
  );
}

interface Bar {
  key: number;
  value: number;
  label: string;
  title: string;
  emphasised?: boolean;
  onClick?: () => void;
}

/**
 * A row of columns.
 *
 * Bars grow from a shared baseline with no axis, no gridlines and no frame —
 * the comparison is between the columns, and everything else is furniture. The
 * tallest is scaled to full height, so the shape of the period reads the same
 * whether the busiest day was two hours or ten.
 */
function Columns({ bars }: { bars: Bar[] }) {
  const tallest = Math.max(...bars.map((bar) => bar.value), 1);

  return (
    <div>
      <div className="flex h-[132px] items-end gap-[2px]">
        {bars.map((bar) => (
          <button
            key={bar.key}
            type="button"
            title={bar.title}
            disabled={bar.onClick === undefined}
            onClick={bar.onClick}
            // Capped, not stretched: a week of seven bars filling a 1,080-pixel
            // row reads as a wall rather than as a chart, and a single day fills
            // it edge to edge. Past about thirty bars the cap stops mattering
            // and the row fills on its own.
            className={[
              'group flex h-full min-w-[3px] max-w-[40px] flex-1 flex-col justify-end',
              bar.onClick ? 'cursor-pointer' : 'cursor-default',
            ].join(' ')}
          >
            <span
              className={[
                'block w-full rounded-t-[2px] transition-[height,background-color] duration-300 ease-out',
                bar.emphasised ? 'bg-accent' : 'bg-accent/45',
                bar.onClick ? 'group-hover:bg-accent' : '',
              ].join(' ')}
              // A floor of two pixels: a day with twenty minutes on it is not
              // the same as a day with nothing, and a sub-pixel bar says it is.
              style={{ height: bar.value > 0 ? `max(2px, ${(bar.value / tallest) * 100}%)` : 0 }}
            />
          </button>
        ))}
      </div>

      <div className="mt-2 flex gap-[2px]">
        {bars.map((bar) => (
          // Labels are sparse by design, so one is allowed to run past its own
          // column into the empty slots beside it rather than be clipped to
          // "03 A…".
          <span
            key={bar.key}
            className="eyebrow min-w-[3px] max-w-[40px] flex-1 overflow-visible whitespace-nowrap"
          >
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function MostUsed({
  applications,
  onOpen,
}: {
  applications: ApplicationSummary[];
  onOpen: (applicationId: number) => void;
}) {
  const busiest = Math.max(...applications.map((application) => application.activeSeconds), 1);

  return (
    <Section label="Most used">
      <div className="space-y-px">
        {applications.map((application) => (
          <Row key={application.applicationId} onClick={() => onOpen(application.applicationId)}>
            <div className="flex items-center gap-3">
              <AppSwatch color={appColor(application.executable)} />
              <span className="min-w-0 flex-1 truncate text-ink">{application.name}</span>

              <span className="hidden w-28 shrink-0 sm:block">
                <Meter
                  fraction={application.activeSeconds / busiest}
                  color={appColor(application.executable)}
                />
              </span>

              <span className="data w-10 shrink-0 text-right text-ink-4">
                {application.sessionCount}×
              </span>
              <span className="data w-16 shrink-0 text-right text-ink">
                {duration(application.activeSeconds)}
              </span>
            </div>
          </Row>
        ))}
      </div>
    </Section>
  );
}

/**
 * The local midnights of the period, up to and including today.
 *
 * Stepped as real dates rather than by adding milliseconds, so a daylight-saving
 * change inside the period does not shift every following boundary by an hour.
 */
function daysIn(period: Period): Date[] {
  const today = startOfLocalDay(new Date());
  const first = startOfLocalDay(new Date());

  if (period === 'week') {
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7)); // back to Monday
  } else if (period === 'month') {
    first.setDate(1);
  } else {
    first.setMonth(0, 1);
  }

  const days: Date[] = [];
  for (let day = first; day <= today; day = addDays(day, 1)) {
    days.push(day);
  }

  return days;
}

function spanLabel(days: Date[]): string {
  const first = days.at(0);
  const last = days.at(-1);

  if (!first || !last) {
    return '';
  }

  return first.getTime() === last.getTime()
    ? shortDate(first.getTime())
    : `${shortDate(first.getTime())} – ${shortDate(last.getTime())}`;
}

/**
 * Weekday letters for a week, dates for a month, and nothing for a year — at
 * 365 columns a label per bar is a grey smear, and the span is already stated
 * in the header.
 */
function dayLabel(day: CalendarDay, total: number): string {
  const at = new Date(day.startUtcMs);

  if (total <= 7) {
    return at.toLocaleDateString(undefined, { weekday: 'short' });
  }

  if (total <= 31) {
    return at.getDate() % 5 === 0 || at.getDate() === 1 ? String(at.getDate()) : '';
  }

  return at.getDate() === 1 ? at.toLocaleDateString(undefined, { month: 'short' }) : '';
}
