import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { ClockFormat, RetentionPolicy, Settings } from '@trace/contracts';
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Section,
  Skeleton,
  StatusDot,
} from '@/components/primitives';
import { DangerousAction, Select, SettingRow, Toggle } from '@/components/settings-controls';
import { useApplications, useConnection, useStatus } from '@/hooks/useTracker';
import { addDays, localDayRange, startOfLocalDay } from '@/lib/format';
import { bridge, trace } from '@/services/trace';

/**
 * Settings — which is really the privacy centre.
 *
 * DOCS/Privacy.md §25 asks for "a real privacy centre, not a checkbox buried
 * under Settings", so the page leads with what is being collected and what the
 * user can do about it, and the destructive controls state their consequences
 * before they are reachable.
 *
 * Only controls that actually do something are shown. Theme and launch-minimised
 * are in the product documentation but are not implemented yet, and a toggle
 * that silently does nothing is worse than no toggle.
 */
export function SettingsPage() {
  const connection = useConnection();
  const connected = connection.status === 'connected';
  const queryClient = useQueryClient();
  const [note, setNote] = useState<string | null>(null);

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: trace.settings,
    enabled: connected,
  });

  const { data: status } = useStatus(connected);

  const save = useMutation({
    mutationFn: trace.updateSettings,
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });

  const toggleTracking = useMutation({
    mutationFn: (enabled: boolean) => (enabled ? trace.resume() : trace.pause()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['status'] });
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  if (!connected) {
    return (
      <>
        <PageHeader title="Settings" />
        <EmptyState title="Waiting for the tracker" detail="Settings live with the tracker." />
      </>
    );
  }

  if (settings.error) {
    return (
      <>
        <PageHeader title="Settings" />
        <ErrorState message="Settings could not be loaded." onRetry={() => void settings.refetch()} />
      </>
    );
  }

  if (settings.isPending) {
    return (
      <>
        <PageHeader title="Settings" />
        <Skeleton rows={8} />
      </>
    );
  }

  const current = settings.data;
  const tracking = current.trackingEnabled;

  return (
    <div className="enter">
      <PageHeader title="Settings" meta="Privacy and data" />

      {note && (
        <div className="mb-7 border-l-2 border-accent pl-4 text-ink-2">
          {note}
          <button
            type="button"
            className="ml-3 text-accent hover:underline"
            onClick={() => setNote(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <Section label="Tracking">
        <div className="mb-3 flex items-center gap-2.5">
          <StatusDot state={!tracking ? 'paused' : status?.state === 'IDLE' ? 'idle' : 'live'} />
          <span className="flex-1 text-ink">
            {tracking ? 'Trace is recording your activity.' : 'Trace is not recording anything.'}
          </span>
          <Button
            variant={tracking ? 'default' : 'accent'}
            onClick={() => toggleTracking.mutate(!tracking)}
          >
            {tracking ? 'Pause tracking' : 'Resume tracking'}
          </Button>
        </div>

        {/*
          Pausing must survive a restart, or the control is a lie
          (DOCS/Privacy.md §27). Saying so is part of earning the trust.
        */}
        <p className="text-ink-4">
          Pausing stops all recording immediately, and stays paused until you resume it — including
          after restarting Windows.
        </p>
      </Section>

      <Section label="What Trace records">
        <SettingRow
          label="Window titles"
          description="Titles turn “Chrome — 2h” into “YouTube, GitHub, Google”. They can also contain private information, so this switches them off entirely."
          control={
            <Toggle
              label="Record window titles"
              checked={current.recordWindowTitles}
              onChange={(recordWindowTitles) => save.mutate({ recordWindowTitles })}
            />
          }
        />
        <SettingRow
          label="Idle detection"
          description="Stops counting time when you walk away, so a session you left open is not reported as use."
          control={
            <Toggle
              label="Detect idle time"
              checked={current.idleDetectionEnabled}
              onChange={(idleDetectionEnabled) => save.mutate({ idleDetectionEnabled })}
            />
          }
        />
        <SettingRow
          label="Idle after"
          description="How long without keyboard or mouse input counts as away."
          control={
            <Select
              label="Idle threshold"
              value={String(current.idleThresholdSeconds)}
              onChange={(value) => save.mutate({ idleThresholdSeconds: Number(value) })}
              options={[
                { value: '60', label: '1 minute' },
                { value: '180', label: '3 minutes' },
                { value: '300', label: '5 minutes' },
                { value: '600', label: '10 minutes' },
                { value: '1800', label: '30 minutes' },
              ]}
            />
          }
        />

        <NeverCollected />
      </Section>

      <ExcludedApplications settings={current} onSave={(patch) => save.mutate(patch)} />

      <Section label="Display">
        <SettingRow
          label="Clock"
          description="How times are shown throughout Trace. This changes the display only — nothing recorded is affected."
          control={
            <Select
              label="Clock format"
              value={current.clockFormat}
              onChange={(clockFormat) => save.mutate({ clockFormat: clockFormat as ClockFormat })}
              options={[
                { value: 'SYSTEM', label: `Match Windows (${systemClockExample()})` },
                { value: 'TWENTY_FOUR_HOUR', label: '24-hour · 14:30' },
                { value: 'TWELVE_HOUR', label: '12-hour · 2:30 PM' },
              ]}
            />
          }
        />
      </Section>

      <Section label="Windows">
        <SettingRow
          label="Start Trace with Windows"
          description="Starts the background tracker when you sign in. The dashboard stays closed until you open it."
          control={
            <Toggle
              label="Start with Windows"
              checked={current.startWithWindows}
              onChange={(startWithWindows) => save.mutate({ startWithWindows })}
            />
          }
        />
        <SettingRow
          label="Keep history for"
          description="Older activity is deleted permanently. Trace keeps everything by default — forgetting is the opposite of the point."
          control={
            <Select
              label="Data retention"
              value={current.retention}
              onChange={(retention) => save.mutate({ retention: retention as RetentionPolicy })}
              options={[
                { value: 'FOREVER', label: 'Forever' },
                { value: 'ONE_YEAR', label: '1 year' },
                { value: 'NINETY_DAYS', label: '90 days' },
                { value: 'THIRTY_DAYS', label: '30 days' },
              ]}
            />
          }
        />
      </Section>

      <YourData settings={current} onNote={setNote} />

      <Section label="Advanced">
        <SettingRow
          label="Developer logs"
          description="Writes detailed diagnostics, including window titles, to Trace's log files. Off by default for that reason."
          control={
            <Toggle
              label="Developer logging"
              checked={current.developerLogging}
              onChange={(developerLogging) => save.mutate({ developerLogging })}
            />
          }
        />
      </Section>
    </div>
  );
}

/**
 * What "Match Windows" will actually look like, shown in the option itself.
 *
 * Otherwise the default option is the only one whose result the user cannot
 * predict without selecting it and looking.
 */
function systemClockExample(): string {
  return new Date(2026, 0, 1, 14, 30).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The list of things Trace never touches.
 *
 * Stating it in the product, not only in marketing, is the point of
 * DOCS/Privacy.md §3 — and it is checkable: none of these have any
 * corresponding code in the tracker.
 */
function NeverCollected() {
  const never = [
    'Keystrokes',
    'Passwords',
    'Clipboard contents',
    'Screenshots',
    'Microphone',
    'Webcam',
    'File contents',
    'Browsing history',
    'Message contents',
  ];

  return (
    <div className="mt-8">
      <p className="eyebrow mb-3">Never recorded</p>
      <ul className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-ink-3 sm:grid-cols-3">
        {never.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="mt-5 text-ink-4">
        Your activity never leaves this computer. There is no account and no server.
      </p>
    </div>
  );
}

/**
 * Application exclusions.
 *
 * DOCS/Privacy.md §7: an excluded application is filtered before anything is
 * written, so nothing about it ever reaches the database. Adding an exclusion
 * does not remove what was already recorded, so §8's second choice is offered
 * explicitly rather than assumed either way.
 */
function ExcludedApplications({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (patch: { excludedExecutables: string[] }) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState('');
  const queryClient = useQueryClient();

  const today = useMemo(() => localDayRange(startOfLocalDay(new Date())), []);
  const { data: seen } = useApplications(today, true);

  const remove = (executable: string) =>
    onSave({ excludedExecutables: settings.excludedExecutables.filter((e) => e !== executable) });

  const add = (executable: string) => {
    const normalised = executable.trim().toLowerCase();
    if (!normalised || settings.excludedExecutables.includes(normalised)) {
      return;
    }

    onSave({ excludedExecutables: [...settings.excludedExecutables, normalised] });
    setTyped('');
    setAdding(false);
  };

  const deleteHistory = useMutation({
    mutationFn: trace.deleteApplication,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['activity'] }),
  });

  return (
    <Section
      label="Excluded applications"
      actions={
        !adding && (
          <Button variant="ghost" onClick={() => setAdding(true)}>
            + Add application
          </Button>
        )
      }
    >
      <p className="mb-3 text-ink-2">
        Trace behaves as though these applications do not exist. No sessions, no window titles, no
        events — nothing is written and nothing is hidden after the fact.
      </p>

      {adding && (
        <div className="mb-4 rounded-md border border-hair bg-p-4">
          <input
            type="text"
            autoFocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && add(typed)}
            placeholder="Executable name, for example 1password.exe"
            aria-label="Executable to exclude"
            className="w-full select-text rounded-md border border-hair bg-px-2.5 py-1.5 text-ink placeholder:text-ink-4 focus:border-accent focus:outline-none"
          />

          {(seen ?? []).length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-ink-4">Or pick one Trace has seen today</p>
              <div className="flex flex-wrap gap-1.5">
                {(seen ?? [])
                  .filter((a) => !settings.excludedExecutables.includes(a.executable))
                  .slice(0, 12)
                  .map((application) => (
                    <button
                      key={application.applicationId}
                      type="button"
                      onClick={() => add(application.executable)}
                      className="rounded-md border border-hair bg-lift px-2 py-1 text-ink-2 transition-colors hover:border-hair-strong hover:text-ink"
                    >
                      {application.name}
                    </button>
                  ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Button variant="accent" onClick={() => add(typed)}>
              Exclude
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setTyped('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {settings.excludedExecutables.length === 0 ? (
        <p className="py-2 text-ink-4">No applications are excluded.</p>
      ) : (
        <ul>
          {settings.excludedExecutables.map((executable) => {
            const recorded = (seen ?? []).find((a) => a.executable === executable);

            return (
              <li
                key={executable}
                className="flex items-center justify-between gap-4 border-b border-hair py-2.5 last:border-b-0"
              >
                <span className="font-mono text-ink">{executable}</span>
                <span className="flex items-center gap-2">
                  {recorded && (
                    <Button
                      variant="ghost"
                      title="Remove what Trace already recorded for this application"
                      onClick={() => deleteHistory.mutate(recorded.applicationId)}
                    >
                      Delete its history
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => remove(executable)}>
                    Remove
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/** Export, delete, and where the data actually lives. */
function YourData({
  settings,
  onNote,
}: {
  settings: Settings;
  onNote: (note: string) => void;
}) {
  const queryClient = useQueryClient();

  const exportData = useMutation({
    mutationFn: async () => {
      const destination = await bridge.chooseExportPath();
      if (!destination) {
        return null;
      }

      return trace.exportTo(destination);
    },
    onSuccess: (result) => {
      if (result) {
        onNote(
          `Exported ${result.sessionsExported} sessions and ${result.eventsExported} events to ${result.absolutePath}.`,
        );
      }
    },
    onError: (error: Error) => onNote(`The export failed: ${error.message}`),
  });

  const deleteRecent = useMutation({
    mutationFn: () => {
      // The last 7 local days, computed here because the client owns the
      // timezone (contract §4).
      const today = startOfLocalDay(new Date());
      const from = localDayRange(addDays(today, -6)).fromUtcMs;
      const to = localDayRange(today).toUtcMs;

      return trace.deleteRange({ fromUtcMs: from, toUtcMs: to });
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries();
      onNote(`Deleted ${result.sessionsDeleted} sessions from the last 7 days.`);
    },
  });

  const deleteEverything = useMutation({
    mutationFn: trace.deleteEverything,
    onSuccess: (result) => {
      void queryClient.invalidateQueries();
      onNote(`Deleted all ${result.sessionsDeleted} sessions. Trace is starting fresh.`);
    },
  });

  return (
    <Section label="Your data">
      <SettingRow
        label="Export your history"
        description="A JSON file containing everything Trace has recorded — applications, sessions, window activity and the full event log."
        control={
          <Button onClick={() => exportData.mutate()}>
            {exportData.isPending ? 'Exporting…' : 'Export'}
          </Button>
        }
      />

      <SettingRow
        label="Where your data is kept"
        description={<span className="font-mono">{settings.dataDirectory}</span>}
        control={<Button onClick={() => void bridge.openFolder(settings.dataDirectory)}>Open</Button>}
      />

      <DangerousAction
        label="Delete the last 7 days"
        description="Removes everything Trace recorded this week."
        confirmTitle="Delete the last 7 days?"
        confirmBody="This permanently removes those sessions, window activity and events. It cannot be undone."
        actionLabel="Delete 7 days"
        busy={deleteRecent.isPending}
        onConfirm={() => deleteRecent.mutate()}
      />

      <DangerousAction
        label="Delete everything"
        description="Removes your entire activity history from this computer."
        confirmTitle="Delete your entire history?"
        confirmBody="Every application, session, window and event Trace has ever recorded will be permanently deleted. There is no backup and no way to recover it."
        confirmWord="DELETE ALL"
        actionLabel="Delete everything"
        busy={deleteEverything.isPending}
        onConfirm={() => deleteEverything.mutate()}
      />
    </Section>
  );
}
