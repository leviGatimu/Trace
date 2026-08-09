import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DayActivity } from '@trace/contracts';
import { DayPicker } from '@/components/DayPicker';
import {
  Bar,
  EmptyState,
  ErrorState,
  PageHeader,
  Section,
  Skeleton,
  Stat,
} from '@/components/primitives';
import { useConnection, useDay } from '@/hooks/useTracker';
import { clockTime, duration, greeting, localDayRange, relativeDay, startOfLocalDay } from '@/lib/format';

/**
 * The home page. It answers one question — "what have I been doing today?" —
 * and resists becoming a wall of statistics, which the design document is
 * explicit about.
 */
export function OverviewPage() {
  const [day, setDay] = useState(() => startOfLocalDay(new Date()));
  const range = useMemo(() => localDayRange(day), [day]);

  const connection = useConnection();
  const connected = connection.status === 'connected';
  const { data, isPending, error, refetch } = useDay(range, connected);

  return (
    <>
      <PageHeader
        title={`${greeting()}`}
        subtitle={relativeDay(day)}
        actions={<DayPicker day={day} onChange={setDay} />}
      />

      {!connected ? (
        <EmptyState title="Waiting for the tracker" detail="Activity will appear once it is running." />
      ) : error ? (
        <ErrorState message="Today's activity could not be loaded." onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton rows={6} />
      ) : (
        <DayView day={data} />
      )}
    </>
  );
}

function DayView({ day }: { day: DayActivity }) {
  const navigate = useNavigate();

  if (day.sessionCount === 0) {
    return (
      <EmptyState
        title="Nothing recorded for this day"
        detail="Trace records an application once you actually switch to it. Anything shorter than a few seconds is treated as noise."
      />
    );
  }

  const busiest = Math.max(...day.applications.map((application) => application.activeSeconds), 1);

  return (
    <div className="fade-in">
      <div className="mb-9 flex gap-12">
        <Stat value={duration(day.totalActiveSeconds)} label="Active time" />
        <Stat value={String(day.applicationCount)} label="Applications" />
        <Stat value={String(day.sessionCount)} label="Sessions" />
        {day.totalIdleSeconds > 0 && (
          <Stat value={duration(day.totalIdleSeconds)} label="Idle" />
        )}
      </div>

      <HourStrip day={day} />

      <Section title="Most used">
        <div className="space-y-px">
          {day.applications.map((application) => (
            <button
              key={application.applicationId}
              type="button"
              onClick={() => navigate(`/applications/${application.applicationId}`)}
              className="relative flex w-full items-center gap-4 rounded-[4px] px-3 py-2 text-left transition-colors duration-150 hover:bg-card"
            >
              <Bar fraction={application.activeSeconds / busiest} />
              <span className="relative min-w-0 flex-1 truncate">{application.name}</span>
              <span className="tabular relative text-ink-dim">
                {application.sessionCount} {application.sessionCount === 1 ? 'session' : 'sessions'}
              </span>
              <span className="tabular relative w-20 text-right">
                {duration(application.activeSeconds)}
              </span>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

/**
 * Active time by hour.
 *
 * The one approximation in the interface, and it is the tracker's: a session's
 * active time is spread across the hours it spans. Every figure stated as fact
 * elsewhere comes from a stored total.
 */
function HourStrip({ day }: { day: DayActivity }) {
  const peak = Math.max(...day.hourBuckets.map((bucket) => bucket.activeSeconds), 1);

  return (
    <Section title="Through the day">
      <div className="flex h-[72px] items-end gap-[3px]">
        {day.hourBuckets.map((bucket) => {
          const height = (bucket.activeSeconds / peak) * 100;

          return (
            <div
              key={bucket.startUtcMs}
              className="group relative flex-1"
              title={`${clockTime(bucket.startUtcMs)} · ${duration(bucket.activeSeconds)}`}
            >
              <div
                className="w-full rounded-[2px] bg-accent/70 transition-all duration-500 ease-out group-hover:bg-accent"
                style={{ height: `${Math.max(height, bucket.activeSeconds > 0 ? 4 : 1.5)}%`, minHeight: '2px' }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-faint">
        {[0, 6, 12, 18].map((hour) => (
          <span key={hour}>{String(hour).padStart(2, '0')}:00</span>
        ))}
        <span>23:59</span>
      </div>
    </Section>
  );
}
