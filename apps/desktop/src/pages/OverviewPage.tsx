import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CoverageSegment } from '@trace/contracts';
import { Workspace } from '@/app/Shell';
import { AnimatedClock, Card, CornerLink, CountUp, Delta, RoundButton, StatusPill } from '@/components/bento';
import { Donut, HourBars } from '@/components/charts';
import { DayPicker } from '@/components/DayPicker';
import { Icon } from '@/components/Icon';
import { AppMark } from '@/components/primitives';
import { useConnection, useCoverage, useCurrentActivity, useDay, useTimeline } from '@/hooks/useTracker';
import { appColor } from '@/lib/appColor';
import { addDays, clockTime, duration, greeting, liveDuration, localDayRange, relativeDay, tidyWindowTitle } from '@/lib/format';
import { useSelectedDay, withDay } from '@/lib/range';

const SLICE_COLOURS = ['#5b8cff', '#f4a06b', '#f6dc7c', '#ff6b6b', '#7ee2a8', '#b39dff'];

export function OverviewPage() {
  const navigate = useNavigate();
  const [day, setDay] = useSelectedDay();
  const range = useMemo(() => localDayRange(day), [day]);
  const previousRange = useMemo(() => localDayRange(addDays(day, -1)), [day]);

  const connected = useConnection().status === 'connected';
  const today = useDay(range, connected);
  const before = useDay(previousRange, connected);
  const coverage = useCoverage(range, connected);
  const previousCoverage = useCoverage(previousRange, connected);
  const timeline = useTimeline(range, connected);
  const current = useCurrentActivity(connected);

  const covered = recordedShare(coverage.data?.segments, range.fromUtcMs, range.toUtcMs);
  const previousCovered = recordedShare(previousCoverage.data?.segments, previousRange.fromUtcMs, previousRange.toUtcMs);
  const gaps = (coverage.data?.segments ?? []).filter(
    (segment) => segment.evidence !== 'observed' && segment.kind !== 'before-trace',
  );
  const gapSeconds = gaps.reduce((sum, gap) => sum + Math.round(((gap.endedAt ?? Date.now()) - gap.startedAt) / 1000), 0);

  const hours = (today.data?.hourBuckets ?? []).map((bucket, index) => ({ hour: index, seconds: bucket.activeSeconds }));
  const applications = today.data?.applications ?? [];
  const slices = useMemo(() => {
    const top = applications.slice(0, 5).map((application, index) => ({
      label: application.name,
      value: application.activeSeconds,
      color: SLICE_COLOURS[index]!,
    }));
    const rest = applications.slice(5).reduce((sum, application) => sum + application.activeSeconds, 0);
    return rest > 0 ? [...top, { label: 'Everything else', value: rest, color: SLICE_COLOURS[5]! }] : top;
  }, [applications]);
  const total = today.data?.totalActiveSeconds ?? 0;

  const recent = (timeline.data ?? [])
    .filter((entry): entry is Extract<typeof entry, { kind: 'session' }> => entry.kind === 'session')
    .slice(-6)
    .reverse();

  const isToday = relativeDay(day) === 'Today';

  return (
    <Workspace>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-medium leading-tight tracking-[-0.02em] text-ink">{greeting()}!</h1>
          <p className="mt-1 text-[14.5px] text-ink-3">
            This is what happened on your PC {isToday ? 'today' : relativeDay(day) === 'Yesterday' ? 'yesterday' : `on ${relativeDay(day)}`}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DayPicker day={day} onChange={setDay} />
          <RoundButton label="Open the calendar" onClick={() => navigate(withDay('/calendar', day))}>
            <Icon name="calendar" />
          </RoundButton>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-12">
        {/* Four headline numbers */}
        <div className="grid grid-cols-2 gap-4 xl:col-span-5">
          <Card tone="light" className="min-h-[156px]" index={0} lift>
            <p className="text-[14px] text-[#55555c]">Time in front</p>
            <CornerLink to={withDay('/timeline', day)} label="Open the timeline" tone="accent" />
            <div className="mt-7 flex items-center gap-2.5">
              <span className="text-[30px] font-medium leading-none tracking-[-0.03em]">{today.data ? <CountUp value={total} format={duration} /> : '—'}</span>
              <Delta current={total} previous={before.data?.totalActiveSeconds} />
            </div>
            <p className="mt-3 text-[12px] text-[#77777e]">Compared with the day before</p>
          </Card>

          <Stat
            index={1}
            label="Sessions"
            value={today.data ? <CountUp value={today.data.sessionCount} /> : '—'}
            current={today.data?.sessionCount ?? 0}
            previous={before.data?.sessionCount}
            to={withDay('/timeline?show=sessions', day)}
          />
          <Stat
            index={2}
            label="Applications"
            value={today.data ? <CountUp value={today.data.applicationCount} /> : '—'}
            current={today.data?.applicationCount ?? 0}
            previous={before.data?.applicationCount}
            to={withDay('/applications', day)}
          />
          <Stat
            index={3}
            label="Day recorded"
            value={covered === null ? '—' : <CountUp value={Math.round(covered * 100)} format={(n) => `${n}%`} />}
            current={Math.round((covered ?? 0) * 100)}
            previous={previousCovered === null ? undefined : Math.round(previousCovered * 100)}
            to={withDay('/timeline?show=gaps', day)}
          />
        </div>

        {/* Activity by hour */}
        <Card className="xl:col-span-7" index={2}>
          <div className="mb-5 flex items-baseline gap-4 pr-12">
            <h2 className="text-[17px] font-medium text-ink">Activity</h2>
            <span className="text-[12.5px] text-ink-3">Time in front, hour by hour</span>
          </div>
          <CornerLink to={withDay('/timeline', day)} label="Open the timeline" tone="light" />
          {hours.length > 0 ? <HourBars hours={hours} height={232} /> : <Placeholder height={232} />}
        </Card>

        {/* Gaps and now */}
        <Card className="p-0 xl:col-span-7" index={4}>
          <div className="grid h-full min-h-[210px] grid-cols-2">
            <div className="card-wave relative flex flex-col justify-end border-r border-canvas p-6">
              <span className="absolute left-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-card-2 text-peach">
                <AnimatedClock size={18} />
              </span>
              <p className="text-[40px] font-medium leading-none tracking-[-0.03em] text-ink">
                {coverage.data ? <CountUp value={gaps.length} /> : '—'}
                <span className="ml-2 text-[22px] font-normal text-ink-2">{gaps.length === 1 ? 'gap' : 'gaps'}</span>
              </p>
              <p className="mt-2 text-[13px] text-ink-3">
                {gaps.length === 0 ? (
                  'Every minute of this day is accounted for.'
                ) : (
                  <>
                    <span className="text-peach">{duration(gapSeconds)}</span> with no record to review.
                  </>
                )}
              </p>
            </div>

            <div className="relative flex flex-col justify-end p-6">
              <span className="absolute left-5 top-5">
                {current.data && isToday ? (
                  <AppMark name={current.data.applicationName} color={appColor(current.data.applicationName)} size={40} applicationId={current.data.applicationId} />
                ) : applications[0] ? (
                  <AppMark name={applications[0].name} color={appColor(applications[0].name)} size={40} applicationId={applications[0].applicationId} />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card-2 text-ink-3">
                    <Icon name="timeline" />
                  </span>
                )}
              </span>
              {current.data && isToday ? (
                <>
                  <p className="truncate text-[28px] font-medium leading-tight tracking-[-0.02em] text-ink">
                    {current.data.applicationName}
                  </p>
                  <p className="mt-2 text-[13px] text-ink-3">
                    In front now, for <span className="text-mint">{liveDuration(current.data.activeSeconds)}</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-ink">
                    {applications[0]?.name ?? 'Nothing yet'}
                  </p>
                  <p className="mt-2 text-[13px] text-ink-3">Most in front on this day</p>
                </>
              )}
            </div>

            <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-canvas p-1.5">
              <span
                className="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white text-[#111114]"
                onClick={() => navigate(withDay('/timeline?show=gaps', day))}
                role="link"
                aria-label="Review the gaps"
                title="Review the gaps"
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                  <path d="M5 11L11 5M6 5h5v5" />
                </svg>
              </span>
            </span>
          </div>
        </Card>

        {/* Time by application */}
        <Card className="xl:col-span-5" index={5}>
          <div className="mb-4 flex items-baseline gap-4 pr-12">
            <h2 className="text-[17px] font-medium text-ink">Time by application</h2>
          </div>
          <CornerLink to={withDay('/applications', day)} label="All applications" tone="light" />
          {slices.length === 0 ? (
            <p className="py-10 text-center text-ink-3">Nothing recorded on this day.</p>
          ) : (
            <div className="flex items-center gap-6">
              <Donut slices={slices} size={164} centre={{ value: duration(total), label: 'in front' }} />
              <ul className="min-w-0 flex-1 space-y-2.5">
                {slices.map((slice) => (
                  <li key={slice.label} className="flex items-center gap-2.5 text-[13px]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
                    <span className="min-w-0 flex-1 truncate text-ink-2">{slice.label}</span>
                    <span className="text-ink-3">{Math.round((slice.value / (total || 1)) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* Latest activity */}
        <Card className="p-0 xl:col-span-12" index={6}>
          <div className="flex items-center justify-between px-6 pb-2 pt-5">
            <h2 className="text-[17px] font-medium text-ink">Latest activity</h2>
            <button
              type="button"
              onClick={() => navigate(withDay('/timeline', day))}
              className="rounded-full bg-card-2 px-4 py-2 text-[13px] text-ink-2 transition hover:text-ink"
            >
              View all
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="px-6 pb-6 text-ink-3">No sessions on this day.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-[0.04em] text-ink-4">
                  <th className="px-6 py-3 font-medium">Application</th>
                  <th className="px-3 py-3 font-medium">Window</th>
                  <th className="px-3 py-3 font-medium">Started</th>
                  <th className="px-3 py-3 font-medium">Length</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((entry, index) => (
                  <tr
                    key={entry.sessionId}
                    className="slide-in border-t border-hair transition-colors hover:bg-card-2"
                    style={{ '--i': index + 8 } as React.CSSProperties}
                  >
                    <td className="px-6 py-3.5">
                      <span className="flex items-center gap-3">
                        <AppMark name={entry.applicationName} color={appColor(entry.applicationName)} size={30} applicationId={entry.applicationId} />
                        <span className="font-medium text-ink">{entry.applicationName}</span>
                      </span>
                    </td>
                    <td className="max-w-[340px] truncate px-3 py-3.5 text-ink-3">
                      {tidyWindowTitle(entry.primaryWindowTitle, entry.applicationName) ?? '—'}
                    </td>
                    <td className="px-3 py-3.5 text-ink-2">{clockTime(entry.startedAt)}</td>
                    <td className="px-3 py-3.5 text-ink">{entry.endedAt === null ? 'now' : duration(entry.activeSeconds)}</td>
                    <td className="px-6 py-3.5">
                      {entry.endedAt === null ? (
                        <StatusPill tone="mint">in front</StatusPill>
                      ) : entry.endReason === 'CRASH_RECOVERY' ? (
                        <StatusPill tone="peach">end estimated</StatusPill>
                      ) : (
                        <StatusPill tone="lilac">recorded</StatusPill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </Workspace>
  );
}

function Stat({
  label,
  value,
  current,
  previous,
  to,
  index,
}: {
  index: number;
  label: string;
  value: React.ReactNode;
  current: number;
  previous: number | undefined;
  to: string;
}) {
  return (
    <Card className="min-h-[156px]" index={index} lift>
      <p className="text-[14px] text-ink-2">{label}</p>
      <CornerLink to={to} label={`Open ${label.toLowerCase()}`} />
      <div className="mt-7 flex items-center gap-2.5">
        <span className="text-[30px] font-medium leading-none tracking-[-0.03em] text-ink">{value}</span>
        <Delta current={current} previous={previous} />
      </div>
      <p className="mt-3 text-[12px] text-ink-4">Compared with the day before</p>
    </Card>
  );
}

function Placeholder({ height }: { height: number }) {
  return <div className="animate-pulse rounded-[14px] bg-card-2" style={{ height }} />;
}

/** The share of the elapsed part of a day that Trace has its own record for. */
function recordedShare(segments: CoverageSegment[] | undefined, from: number, to: number): number | null {
  if (!segments) return null;
  const end = Math.min(to, Date.now());
  if (end <= from) return null;
  const recorded = segments
    .filter((segment) => segment.source === 'trace')
    .reduce((sum, segment) => sum + (Math.min(segment.endedAt ?? Date.now(), end) - Math.max(segment.startedAt, from)), 0);
  return recorded / (end - from);
}
