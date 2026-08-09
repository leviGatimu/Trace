import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ApplicationDetail } from '@trace/contracts';
import { DayPicker } from '@/components/DayPicker';
import { SessionPanel } from '@/components/SessionPanel';
import {
  AppSwatch,
  EmptyState,
  ErrorState,
  Figure,
  Meter,
  PageHeader,
  Row,
  Skeleton,
  Tabs,
} from '@/components/primitives';
import { useApplication, useApplications, useConnection } from '@/hooks/useTracker';
import { appColor } from '@/lib/appColor';
import {
  clockTime,
  duration,
  localDayRange,
  relativeDay,
  startOfLocalDay,
  tidyWindowTitle,
} from '@/lib/format';

export function ApplicationsPage() {
  const { applicationId } = useParams();
  const [day, setDay] = useState(() => startOfLocalDay(new Date()));
  const range = useMemo(() => localDayRange(day), [day]);

  const connection = useConnection();
  const connected = connection.status === 'connected';

  return applicationId ? (
    <Detail
      applicationId={Number(applicationId)}
      day={day}
      onDayChange={setDay}
      range={range}
      connected={connected}
    />
  ) : (
    <List day={day} onDayChange={setDay} range={range} connected={connected} />
  );
}

function List({
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
        meta={relativeDay(day)}
        actions={<DayPicker day={day} onChange={onDayChange} />}
      />

      {!connected ? (
        <EmptyState title="Waiting for the tracker" />
      ) : error ? (
        <ErrorState message="Applications could not be loaded." onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton rows={7} />
      ) : data.length === 0 ? (
        <EmptyState title="No applications recorded for this day" />
      ) : (
        <div className="enter">
          <input
            type="text"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter"
            aria-label="Filter applications"
            className="mb-7 w-full border-b border-hair bg-transparent pb-2 text-ink placeholder:text-ink-4 focus:border-accent focus:outline-none"
          />

          {shown.length === 0 ? (
            <EmptyState title={`Nothing matches “${filter}”`} />
          ) : (
            <div className="space-y-px">
              {shown.map((application) => (
                <Row
                  key={application.applicationId}
                  onClick={() => navigate(`/applications/${application.applicationId}`)}
                >
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
          )}
        </div>
      )}
    </>
  );
}

/**
 * One application, in detail.
 *
 * Restructured around the two questions someone actually opens this page with:
 * "how much do I use this?" and "what was I doing in it?"
 *
 * The four usage figures answer the first as a row of comparable numbers —
 * previously they were run together into a sentence, which reads fine for one
 * fact and badly for four you are meant to compare. The second is two distinct
 * bodies of content, when it ran and what it showed, so they are tabbed rather
 * than stacked one below the other where the lower would never be seen.
 *
 * Sessions now lead somewhere: the earlier version listed them as dead text
 * beside a full session view the user had no way to reach from here.
 */
function Detail({
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
  const [tab, setTab] = useState<'sessions' | 'windows'>('sessions');
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  const { data, isPending, error, refetch } = useApplication(applicationId, range, connected);

  if (error) {
    return (
      <ErrorState message="This application could not be loaded." onRetry={() => void refetch()} />
    );
  }

  if (isPending) {
    return <Skeleton rows={7} />;
  }

  const colour = appColor(data.executable);

  return (
    <div className="enter">
      <button
        type="button"
        onClick={() => navigate('/applications')}
        className="mb-7 -ml-1 rounded-md px-1 text-ink-3 transition-colors hover:text-ink"
      >
        ← All applications
      </button>

      {/* Identity: the colour it is drawn in everywhere else, the name, and the
          executable it actually is — which matters when two things share a name. */}
      <header className="mb-9 flex items-start justify-between gap-6">
        <div className="flex min-w-0 items-center gap-3.5">
          <span
            className="h-9 w-1 shrink-0 rounded-full"
            style={{ background: colour }}
            aria-hidden
          />
          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-semibold tracking-[-0.01em] text-ink">
              {data.name}
            </h1>
            <p className="data mt-1 truncate text-ink-4" title={data.path ?? undefined}>
              {data.executable}
            </p>
          </div>
        </div>
        <DayPicker day={day} onChange={onDayChange} />
      </header>

      <div className="mb-9 grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-4">
        <Figure label="Today" value={duration(data.usage.todayActiveSeconds)} />
        <Figure label="Yesterday" value={duration(data.usage.yesterdayActiveSeconds)} muted />
        <Figure label="Last 7 days" value={duration(data.usage.last7DaysActiveSeconds)} muted />
        <Figure label="All time" value={duration(data.usage.allTimeActiveSeconds)} muted />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'sessions', label: 'Sessions', count: data.sessions.length },
          { value: 'windows', label: 'Windows', count: data.windows.length },
        ]}
      />

      {tab === 'sessions' ? (
        <Sessions detail={data} day={day} onSelect={setSelectedSessionId} />
      ) : (
        <Windows detail={data} colour={colour} />
      )}

      {selectedSessionId !== null && (
        <SessionPanel sessionId={selectedSessionId} onClose={() => setSelectedSessionId(null)} />
      )}
    </div>
  );
}

function Sessions({
  detail,
  day,
  onSelect,
}: {
  detail: ApplicationDetail;
  day: Date;
  onSelect: (sessionId: number) => void;
}) {
  if (detail.sessions.length === 0) {
    return (
      <EmptyState
        title={`Not used ${relativeDay(day).toLowerCase()}`}
        detail="Pick another day to see when this application was last open."
      />
    );
  }

  const longest = Math.max(...detail.sessions.map((session) => session.activeSeconds), 1);

  return (
    <div className="space-y-px">
      {detail.sessions.map((session) => (
        <Row key={session.sessionId} onClick={() => onSelect(session.sessionId)}>
          <div className="flex items-center gap-4">
            <span className="data w-[156px] shrink-0 text-ink-2">
              {clockTime(session.startedAt)}
              {session.endedAt ? ` – ${clockTime(session.endedAt)}` : ' – now'}
            </span>

            <span className="hidden min-w-0 flex-1 sm:block">
              <Meter fraction={session.activeSeconds / longest} />
            </span>

            <span className="data w-20 shrink-0 text-right text-ink-4">
              {session.idleSeconds > 0 ? `${duration(session.idleSeconds)} idle` : ''}
            </span>
            <span className="data w-16 shrink-0 text-right text-ink">
              {duration(session.activeSeconds)}
            </span>
          </div>
        </Row>
      ))}
    </div>
  );
}

function Windows({ detail, colour }: { detail: ApplicationDetail; colour: string }) {
  const [showAll, setShowAll] = useState(false);

  if (detail.windows.length === 0) {
    return (
      <EmptyState
        title="No window titles recorded"
        detail="They may be switched off in Settings, or nothing stayed open long enough to be worth keeping."
      />
    );
  }

  const longest = Math.max(...detail.windows.map((window) => window.durationSeconds), 1);
  const shown = showAll ? detail.windows : detail.windows.slice(0, 12);

  return (
    <>
      <div className="space-y-px">
        {shown.map((window) => (
          <Row key={window.title}>
            <div className="flex items-center gap-4">
              <span className="min-w-0 flex-1 truncate text-ink-2" title={window.title}>
                {tidyWindowTitle(window.title, detail.name) ?? window.title}
              </span>
              <span className="hidden w-32 shrink-0 sm:block">
                <Meter fraction={window.durationSeconds / longest} color={colour} />
              </span>
              <span className="data w-10 shrink-0 text-right text-ink-4">
                {window.occurrences}×
              </span>
              <span className="data w-16 shrink-0 text-right text-ink">
                {duration(window.durationSeconds)}
              </span>
            </div>
          </Row>
        ))}
      </div>

      {/* Twelve is enough to see the shape of it. The rest is available rather
          than imposed — a browser can produce hundreds of titles in a day. */}
      {!showAll && detail.windows.length > 12 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-5 text-accent transition-opacity hover:opacity-70"
        >
          Show all {detail.windows.length}
        </button>
      )}
    </>
  );
}
