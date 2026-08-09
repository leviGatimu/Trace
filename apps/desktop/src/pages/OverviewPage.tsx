import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApplicationSummary, TimelineEntry } from '@trace/contracts';
import { DayPicker } from '@/components/DayPicker';
import { DayRibbon } from '@/components/DayRibbon';
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
} from '@/components/primitives';
import { useConnection, useDay, useTimeline } from '@/hooks/useTracker';
import { appColor } from '@/lib/appColor';
import {
  clockTime,
  duration,
  localDayRange,
  relativeDay,
  startOfLocalDay,
  tidyWindowTitle,
} from '@/lib/format';

/**
 * "Where did my time go today?"
 *
 * One question, answered in three passes: the total, the shape of the day, and
 * what filled it. Nothing else belongs here.
 */
export function OverviewPage() {
  const [day, setDay] = useState(() => startOfLocalDay(new Date()));
  const range = useMemo(() => localDayRange(day), [day]);
  const navigate = useNavigate();

  const connection = useConnection();
  const connected = connection.status === 'connected';

  const dayQuery = useDay(range, connected);
  const timeline = useTimeline(range, connected);

  return (
    <>
      <PageHeader
        title={relativeDay(day)}
        meta={day.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
        actions={<DayPicker day={day} onChange={setDay} />}
      />

      {!connected ? (
        <EmptyState
          title="Waiting for the tracker"
          detail="Activity appears here once it is running."
        />
      ) : dayQuery.error ? (
        <ErrorState message="This day could not be loaded." onRetry={() => void dayQuery.refetch()} />
      ) : dayQuery.isPending ? (
        <Skeleton rows={6} />
      ) : dayQuery.data.sessionCount === 0 ? (
        <EmptyState
          title="Nothing recorded for this day"
          detail="Trace records an application once you switch to it. Anything shorter than a few seconds is treated as noise rather than history."
        />
      ) : (
        <div className="enter">
          <Headline
            value={duration(dayQuery.data.totalActiveSeconds)}
            unit="active"
            facts={[
              `${dayQuery.data.applicationCount} applications`,
              `${dayQuery.data.sessionCount} sessions`,
              `${duration(dayQuery.data.totalIdleSeconds)} idle`,
            ]}
          />

          <DayRibbon
            entries={timeline.data ?? []}
            range={range}
            nowUtcMs={Math.min(Date.now(), range.toUtcMs)}
          />

          <MostUsed
            applications={dayQuery.data.applications}
            onOpen={(applicationId) => navigate(`/applications/${applicationId}`)}
          />

          <Recent entries={timeline.data ?? []} />
        </div>
      )}
    </>
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
        {applications.slice(0, 8).map((application) => (
          <Row key={application.applicationId} onClick={() => onOpen(application.applicationId)}>
            <div className="flex items-center gap-3">
              <AppSwatch color={appColor(application.executable)} />
              <span className="min-w-0 flex-1 truncate text-ink">{application.name}</span>

              {/* Between the name and the figure, not beneath them: the eye
                  compares lengths in a single horizontal sweep. */}
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

function Recent({ entries }: { entries: TimelineEntry[] }) {
  const sessions = entries
    .filter(
      (entry): entry is Extract<TimelineEntry, { kind: 'session' }> => entry.kind === 'session',
    )
    .slice(-6)
    .reverse();

  if (sessions.length === 0) {
    return null;
  }

  return (
    <Section label="Recent">
      <div className="space-y-px">
        {sessions.map((session) => (
          <Row key={session.sessionId}>
            <div className="flex items-baseline gap-3">
              <span className="data w-12 shrink-0 text-ink-4">{clockTime(session.startedAt)}</span>
              <span className="w-36 shrink-0 truncate text-ink">{session.applicationName}</span>
              <span className="min-w-0 flex-1 truncate text-ink-3">
                {tidyWindowTitle(session.primaryWindowTitle, session.applicationName) ?? ''}
              </span>
              <span className="data w-16 shrink-0 text-right text-ink-2">
                {duration(session.activeSeconds)}
              </span>
            </div>
          </Row>
        ))}
      </div>
    </Section>
  );
}
