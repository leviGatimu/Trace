import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ApplicationDetail } from '@trace/contracts';
import { DayPicker } from '@/components/DayPicker';
import {
  Bar,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Section,
  Skeleton,
  Stat,
} from '@/components/primitives';
import { useApplication, useApplications, useConnection } from '@/hooks/useTracker';
import {
  clockTime,
  duration,
  localDayRange,
  relativeDay,
  startOfLocalDay,
  tidyWindowTitle,
} from '@/lib/format';

/**
 * Applications, and one application in detail.
 *
 * The same route serves both, so moving between them keeps the selected day
 * rather than resetting to today underneath the user.
 */
export function ApplicationsPage() {
  const { applicationId } = useParams();
  const [day, setDay] = useState(() => startOfLocalDay(new Date()));
  const range = useMemo(() => localDayRange(day), [day]);

  const connection = useConnection();
  const connected = connection.status === 'connected';

  return applicationId ? (
    <ApplicationDetailView
      applicationId={Number(applicationId)}
      day={day}
      onDayChange={setDay}
      range={range}
      connected={connected}
    />
  ) : (
    <ApplicationListView day={day} onDayChange={setDay} range={range} connected={connected} />
  );
}

function ApplicationListView({
  day,
  onDayChange,
  range,
  connected,
}: {
  day: Date;
  onDayChange: (day: Date) => void;
  range: ReturnType<typeof localDayRange>;
  connected: boolean;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const { data, isPending, error, refetch } = useApplications(range, connected);

  const shown = useMemo(
    () =>
      (data ?? []).filter((application) =>
        application.name.toLowerCase().includes(filter.trim().toLowerCase()),
      ),
    [data, filter],
  );

  const busiest = Math.max(...shown.map((application) => application.activeSeconds), 1);

  return (
    <>
      <PageHeader
        title="Applications"
        subtitle={relativeDay(day)}
        actions={<DayPicker day={day} onChange={onDayChange} />}
      />

      {!connected ? (
        <EmptyState title="Waiting for the tracker" />
      ) : error ? (
        <ErrorState message="Applications could not be loaded." onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton rows={6} />
      ) : data.length === 0 ? (
        <EmptyState title="No applications recorded for this day" />
      ) : (
        <div className="fade-in">
          <input
            type="text"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter applications…"
            aria-label="Filter applications"
            className="mb-5 w-full select-text rounded-[5px] border border-line bg-card px-3 py-2 text-ink placeholder:text-ink-faint focus:border-accent-dim focus:outline-none"
          />

          {shown.length === 0 ? (
            <EmptyState title={`Nothing matches “${filter}”`} />
          ) : (
            <div className="space-y-px">
              {shown.map((application) => (
                <button
                  key={application.applicationId}
                  type="button"
                  onClick={() => navigate(`/applications/${application.applicationId}`)}
                  className="relative flex w-full items-center gap-4 rounded-[4px] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-card"
                >
                  <Bar fraction={application.activeSeconds / busiest} />
                  <span className="relative min-w-0 flex-1">
                    <span className="block truncate text-ink">{application.name}</span>
                    <span className="block truncate text-ink-faint">{application.executable}</span>
                  </span>
                  <span className="tabular relative text-ink-dim">
                    {application.sessionCount}{' '}
                    {application.sessionCount === 1 ? 'session' : 'sessions'}
                  </span>
                  <span className="tabular relative w-20 text-right text-ink">
                    {duration(application.activeSeconds)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ApplicationDetailView({
  applicationId,
  day,
  onDayChange,
  range,
  connected,
}: {
  applicationId: number;
  day: Date;
  onDayChange: (day: Date) => void;
  range: ReturnType<typeof localDayRange>;
  connected: boolean;
}) {
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useApplication(applicationId, range, connected);

  return (
    <>
      <Button variant="ghost" onClick={() => navigate('/applications')}>
        ← Applications
      </Button>

      {error ? (
        <div className="mt-6">
          <ErrorState
            message="This application could not be loaded."
            onRetry={() => void refetch()}
          />
        </div>
      ) : isPending ? (
        <div className="mt-6">
          <Skeleton rows={6} />
        </div>
      ) : (
        <div className="fade-in mt-4">
          <PageHeader
            title={data.name}
            subtitle={data.path ?? data.executable}
            actions={<DayPicker day={day} onChange={onDayChange} />}
          />

          <div className="mb-9 flex gap-12">
            <Stat value={duration(data.usage.todayActiveSeconds)} label="Today" />
            <Stat value={duration(data.usage.yesterdayActiveSeconds)} label="Yesterday" />
            <Stat value={duration(data.usage.last7DaysActiveSeconds)} label="7 days" />
            <Stat value={duration(data.usage.allTimeActiveSeconds)} label="All time" />
          </div>

          <SessionsSection detail={data} day={day} />
          <WindowsSection detail={data} />
        </div>
      )}
    </>
  );
}

function SessionsSection({ detail, day }: { detail: ApplicationDetail; day: Date }) {
  return (
    <Section title={`Sessions · ${relativeDay(day)}`}>
      {detail.sessions.length === 0 ? (
        <p className="px-3 py-2 text-ink-faint">Not used on this day.</p>
      ) : (
        <ul className="space-y-px">
          {detail.sessions.map((session) => (
            <li
              key={session.sessionId}
              className="flex items-center gap-4 rounded-[4px] px-3 py-2 hover:bg-card"
            >
              <span className="tabular w-28 shrink-0 text-ink-dim">
                {clockTime(session.startedAt)}
                {session.endedAt ? ` → ${clockTime(session.endedAt)}` : ' → now'}
              </span>
              <span className="flex-1" />
              {session.idleSeconds > 0 && (
                <span className="tabular text-ink-faint">
                  {duration(session.idleSeconds)} idle
                </span>
              )}
              <span className="tabular w-20 text-right text-ink">
                {duration(session.activeSeconds)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function WindowsSection({ detail }: { detail: ApplicationDetail }) {
  if (detail.windows.length === 0) {
    return (
      <Section title="Window activity">
        <p className="px-3 py-2 text-ink-faint">
          No window titles recorded. They may be switched off in Settings, or nothing was open long
          enough to be worth keeping.
        </p>
      </Section>
    );
  }

  const longest = Math.max(...detail.windows.map((window) => window.durationSeconds), 1);

  return (
    <Section title="Window activity">
      <div className="space-y-px">
        {detail.windows.map((window) => (
          <div
            key={window.title}
            className="relative flex items-center gap-4 rounded-[4px] px-3 py-2"
          >
            <Bar fraction={window.durationSeconds / longest} />
            <span className="relative min-w-0 flex-1 truncate text-ink-dim" title={window.title}>
              {tidyWindowTitle(window.title, detail.name) ?? window.title}
            </span>
            <span className="tabular relative w-20 text-right text-ink">
              {duration(window.durationSeconds)}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}
