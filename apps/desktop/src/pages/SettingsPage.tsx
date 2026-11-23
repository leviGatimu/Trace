import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import type { ApplicationSummary, ClockFormat, RetentionPolicy, Settings } from '@trace/contracts';
import { Workspace } from '@/app/Shell';
import { AnimatedClock, StatusPill } from '@/components/bento';
import { Icon, type IconName } from '@/components/Icon';
import { AppMark, StatusDot } from '@/components/primitives';
import { useApplications, useConnection, useStatus } from '@/hooks/useTracker';
import { appColor } from '@/lib/appColor';
import { addDays, clockTime, localDayRange, localUsagePeriods, longDate, startOfLocalDay } from '@/lib/format';
import { bridge, trace } from '@/services/trace';

type SectionKey = 'recording' | 'privacy' | 'excluded' | 'data' | 'display' | 'startup' | 'advanced';

const SECTIONS: { key: SectionKey; label: string; hint: string; icon: IconName }[] = [
  { key: 'recording', label: 'Recording', hint: 'What Trace writes down', icon: 'timeline' },
  { key: 'privacy', label: 'Privacy', hint: 'What it never touches', icon: 'lock' },
  { key: 'excluded', label: 'Excluded apps', hint: 'Apps Trace ignores', icon: 'applications' },
  { key: 'data', label: 'Your data', hint: 'Keep, export, delete', icon: 'download' },
  { key: 'display', label: 'Display', hint: 'How times look', icon: 'clock' },
  { key: 'startup', label: 'Startup', hint: 'When Trace runs', icon: 'play' },
  { key: 'advanced', label: 'Advanced', hint: 'Diagnostics', icon: 'settings' },
];

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const section = (params.get('section') as SectionKey | null) ?? 'recording';
  const connected = useConnection().status === 'connected';
  const queryClient = useQueryClient();
  const [note, setNote] = useState<{ text: string; tone: 'mint' | 'coral' } | null>(null);

  const settings = useQuery({ queryKey: ['settings'], queryFn: trace.settings, enabled: connected });
  const status = useStatus(connected);

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

  const go = (key: SectionKey) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('section', key);
        return next;
      },
      { replace: true },
    );

  return (
    <Workspace>
      <header className="mb-6">
        <h1 className="text-[34px] font-medium leading-tight tracking-[-0.02em] text-ink">Settings</h1>
        <p className="mt-1 text-[14.5px] text-ink-3">Choose what Trace records, what it ignores, and what happens to your history.</p>
      </header>

      {!connected ? (
        <Notice title="Waiting for the tracker" body="Settings are kept by Trace's recorder, which is not running yet." />
      ) : settings.error ? (
        <Notice title="Settings could not be loaded" body="Try again in a moment." />
      ) : settings.isPending ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-[150px] animate-pulse rounded-[22px] bg-card" />
          ))}
        </div>
      ) : (
        <>
          <Overview
            settings={settings.data}
            lastHeartbeat={status.data?.lastHeartbeatAt}
            startedAt={status.data?.startedAt}
            busy={toggleTracking.isPending}
            onToggle={() => toggleTracking.mutate(!settings.data.trackingEnabled)}
          />

          {note && (
            <div
              className={`rise mb-4 flex items-center justify-between gap-4 rounded-[16px] px-5 py-3.5 ${
                note.tone === 'mint' ? 'bg-mint/10 text-mint' : 'bg-coral/10 text-coral'
              }`}
              role="status"
            >
              <span className="text-[14px]">{note.text}</span>
              <button type="button" className="text-[13px] opacity-80 hover:opacity-100" onClick={() => setNote(null)}>
                Dismiss
              </button>
            </div>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <nav className="rise rounded-[22px] bg-card p-2 lg:sticky lg:top-4" style={{ '--i': 3 } as React.CSSProperties} aria-label="Settings sections">
              {SECTIONS.map((item) => {
                const active = item.key === section;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => go(item.key)}
                    aria-current={active ? 'page' : undefined}
                    className={`nav-icon flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition ${
                      active ? 'bg-white text-[#111114]' : 'text-ink-2 hover:bg-card-2 hover:text-ink'
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${active ? 'bg-[#111114] text-white' : 'bg-card-2 text-ink-3'}`}
                    >
                      <Icon name={item.icon} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14.5px] font-medium">{item.label}</span>
                      <span className={`block truncate text-[12px] ${active ? 'text-[#66666d]' : 'text-ink-4'}`}>{item.hint}</span>
                    </span>
                  </button>
                );
              })}
              <Link
                to="/protection"
                className="nav-icon flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left text-ink-2 transition hover:bg-card-2 hover:text-ink"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-card-2 text-ink-3">
                  <Icon name="shield" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-medium">Protection</span>
                  <span className="block truncate text-[12px] text-ink-4">PIN, auto-restart, tamper log</span>
                </span>
              </Link>
            </nav>

            <div key={section} className="rise min-w-0" style={{ '--i': 0 } as React.CSSProperties}>
              {section === 'recording' && <RecordingSection settings={settings.data} onSave={(patch) => save.mutate(patch)} />}
              {section === 'privacy' && <PrivacySection />}
              {section === 'excluded' && <ExcludedSection settings={settings.data} onSave={(patch) => save.mutate(patch)} onNote={setNote} />}
              {section === 'data' && <DataSection settings={settings.data} onSave={(patch) => save.mutate(patch)} onNote={setNote} />}
              {section === 'display' && (
                <div className="space-y-4">
                  <DisplaySection settings={settings.data} onSave={(patch) => save.mutate(patch)} />
                  <ReplayIntro />
                </div>
              )}
              {section === 'startup' && <StartupSection settings={settings.data} onSave={(patch) => save.mutate(patch)} />}
              {section === 'advanced' && <AdvancedSection settings={settings.data} onSave={(patch) => save.mutate(patch)} />}
            </div>
          </div>
        </>
      )}
    </Workspace>
  );
}

type Save = (patch: Partial<Settings>) => void;
type Note = (note: { text: string; tone: 'mint' | 'coral' }) => void;

/* ------------------------------------------------------------------ */
/*  The three cards at the top                                        */
/* ------------------------------------------------------------------ */

function Overview({
  settings,
  lastHeartbeat,
  startedAt,
  busy,
  onToggle,
}: {
  settings: Settings;
  lastHeartbeat: number | undefined;
  startedAt: number | undefined;
  busy: boolean;
  onToggle: () => void;
}) {
  const recording = settings.trackingEnabled;
  return (
    <div className="mb-4 grid gap-4 lg:grid-cols-3">
      <section
        className={`rise relative overflow-hidden rounded-[22px] p-6 ${recording ? 'bg-[#f4f4f6] text-[#111114]' : 'bg-card text-ink'}`}
        style={{ '--i': 0 } as React.CSSProperties}
      >
        <div className="flex items-center gap-2.5">
          <StatusDot state={recording ? 'live' : 'paused'} />
          <span className={`text-[14px] ${recording ? 'text-[#55555c]' : 'text-ink-3'}`}>Recording</span>
        </div>
        <p className="mt-4 text-[30px] font-medium leading-none tracking-[-0.03em]">{recording ? 'On' : 'Paused'}</p>
        <p className={`mt-2 text-[13px] ${recording ? 'text-[#66666d]' : 'text-ink-3'}`}>
          {recording ? 'Trace is noting which app is in front.' : 'Nothing is being recorded. This lasts until you resume, even after a restart.'}
        </p>
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          className={`mt-5 inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-medium transition disabled:opacity-50 ${
            recording ? 'bg-[#111114] text-white hover:bg-black' : 'bg-accent text-white hover:brightness-110'
          }`}
        >
          <Icon name={recording ? 'pause' : 'play'} />
          {recording ? 'Pause recording' : 'Resume recording'}
        </button>
      </section>

      <section className="rise rounded-[22px] bg-card p-6" style={{ '--i': 1 } as React.CSSProperties}>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card-2 text-mint">
          <AnimatedClock size={18} />
        </span>
        <p className="mt-4 text-[14px] text-ink-3">Last check-in from the recorder</p>
        <p className="mt-1 text-[26px] font-medium leading-none tracking-[-0.02em] text-ink">
          {lastHeartbeat ? clockTime(lastHeartbeat) : '—'}
        </p>
        <p className="mt-2 text-[13px] text-ink-4">{startedAt ? `Running since ${longDate(startedAt)}, ${clockTime(startedAt)}` : ' '}</p>
      </section>

      <section className="rise rounded-[22px] bg-card p-6" style={{ '--i': 2 } as React.CSSProperties}>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card-2 text-lilac">
          <Icon name="lock" />
        </span>
        <p className="mt-4 text-[14px] text-ink-3">Stored only on this PC</p>
        <p className="mt-1 truncate text-[15px] font-medium text-ink" title={settings.dataDirectory}>
          {settings.dataDirectory}
        </p>
        <button
          type="button"
          onClick={() => void bridge.openFolder(settings.dataDirectory)}
          className="mt-4 inline-flex h-9 items-center rounded-full bg-card-2 px-4 text-[13px] text-ink-2 transition hover:text-ink"
        >
          Open folder
        </button>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sections                                                          */
/* ------------------------------------------------------------------ */

function RecordingSection({ settings, onSave }: { settings: Settings; onSave: Save }) {
  return (
    <Panel title="Recording" subtitle="Trace notes which app is in front and for how long. These choices decide how much more it notes.">
      <Row
        icon="timeline"
        tint="#8ea7ff"
        title="Window titles"
        body="Shows what each window was, like the page or document name. Titles can contain private things, so you can switch them off."
        control={<Switch label="Record window titles" on={settings.recordWindowTitles} onChange={(recordWindowTitles) => onSave({ recordWindowTitles })} />}
      />
      <Row
        icon="clock"
        tint="#7ee2a8"
        title="Notice when you step away"
        body="Stops counting time when the keyboard and mouse go quiet, so an app left open is not counted as use."
        control={<Switch label="Detect idle time" on={settings.idleDetectionEnabled} onChange={(idleDetectionEnabled) => onSave({ idleDetectionEnabled })} />}
      >
        {settings.idleDetectionEnabled && (
          <Choices
            label="Count as away after"
            value={String(settings.idleThresholdSeconds)}
            options={[
              { value: '60', label: '1 min' },
              { value: '180', label: '3 min' },
              { value: '300', label: '5 min' },
              { value: '600', label: '10 min' },
              { value: '1800', label: '30 min' },
            ]}
            onChange={(value) => onSave({ idleThresholdSeconds: Number(value) })}
          />
        )}
      </Row>
      <Row
        icon="layers"
        tint="#b39dff"
        title="Background apps"
        body="Checks every 2 seconds which of your programs are running, including ones never in front, and when each started and stopped. Never what they were started with, and never what they did."
        control={<Switch label="Record background apps" on={settings.recordBackgroundApps} onChange={(recordBackgroundApps) => onSave({ recordBackgroundApps })} />}
      />
      <Row
        icon="gaps"
        tint="#f6dc7c"
        title="Explain gaps with Windows records"
        body="Copies when the PC started, shut down, slept, woke, and when you signed in. That is how Trace can tell you a gap was the PC being off. Nothing else is read."
        control={<Switch label="Copy Windows power and sign-in records" on={settings.importWindowsRecords} onChange={(importWindowsRecords) => onSave({ importWindowsRecords })} />}
      />
    </Panel>
  );
}

function PrivacySection() {
  const never = ['Keystrokes', 'Passwords', 'Clipboard', 'Screenshots', 'Microphone', 'Webcam', 'File contents', 'Browsing history', 'Messages'];
  return (
    <div className="space-y-4">
      <Panel title="Never recorded" subtitle="Trace has no code that could collect any of these.">
        <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3">
          {never.map((item, index) => (
            <div
              key={item}
              className="pop flex items-center gap-3 rounded-[16px] bg-card-2 px-4 py-3.5"
              style={{ '--i': index } as React.CSSProperties}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-coral/15 text-coral">
                <Icon name="close" />
              </span>
              <span className="text-[14.5px] text-ink">{item}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Where your history goes" subtitle="Nowhere.">
        <div className="grid gap-2 p-2 sm:grid-cols-3">
          {[
            ['No account', 'There is nothing to sign in to.'],
            ['No server', 'Nothing is uploaded, ever.'],
            ['Only you', 'Other Windows accounts cannot read it.'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-[16px] bg-card-2 px-4 py-4">
              <p className="text-[15px] font-medium text-ink">{title}</p>
              <p className="mt-1 text-[13px] text-ink-3">{body}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ExcludedSection({ settings, onSave, onNote }: { settings: Settings; onSave: Save; onNote: Note }) {
  const queryClient = useQueryClient();
  const connected = useConnection().status === 'connected';
  const [filter, setFilter] = useState('');
  const month = useMemo(() => {
    const today = startOfLocalDay(new Date());
    return { fromUtcMs: localDayRange(addDays(today, -29)).fromUtcMs, toUtcMs: localDayRange(today).toUtcMs };
  }, []);
  const { data: seen } = useApplications(month, connected);
  const excluded = settings.excludedExecutables;

  const byExecutable = useMemo(() => new Map((seen ?? []).map((application) => [application.executable, application])), [seen]);
  const candidates = (seen ?? [])
    .filter((application) => !excluded.includes(application.executable))
    .filter((application) => !filter.trim() || application.name.toLowerCase().includes(filter.trim().toLowerCase()))
    .slice(0, 12);

  // Excluding an app excludes every program file recorded under it, so
  // WhatsApp means whatsapp.exe and whatsapp.root.exe alike.
  const exclude = useMutation({
    mutationFn: async (application: ApplicationSummary) => {
      const detail = await trace.application(application.applicationId, localDayRange(new Date()), localUsagePeriods());
      const files = detail?.aliases.map((alias) => alias.executable) ?? [application.executable];
      return [...new Set([...excluded, ...files])];
    },
    onSuccess: (next, application) => {
      onSave({ excludedExecutables: next });
      onNote({ text: `${application.name} is now ignored. What was already recorded is still there.`, tone: 'mint' });
    },
  });

  const typed = filter.trim().toLowerCase();
  const canAddTyped = typed.endsWith('.exe') && !excluded.includes(typed);

  const deleteHistory = useMutation({
    mutationFn: trace.deleteApplication,
    onSuccess: (result) => {
      void queryClient.invalidateQueries();
      onNote({ text: `Deleted ${result.sessionsDeleted} sessions.`, tone: 'mint' });
    },
  });

  return (
    <div className="space-y-4">
      <Panel title="Ignored apps" subtitle="Trace behaves as if these apps do not exist. Nothing about them is written down.">
        {excluded.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-[15px] text-ink">No apps are ignored</p>
            <p className="mt-1 text-[13px] text-ink-3">Pick one below, for example a password manager.</p>
          </div>
        ) : (
          <ul className="grid gap-2 p-2 sm:grid-cols-2">
            {excluded.map((executable) => {
              const application = byExecutable.get(executable);
              const name = application?.name ?? executable;
              return (
                <li key={executable} className="pop flex items-center gap-3 rounded-[16px] bg-card-2 px-3 py-3">
                  <AppMark name={name} color={appColor(name)} size={36} applicationId={application?.applicationId} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] text-ink">{name}</span>
                    <span className="block truncate text-[12px] text-ink-4">{executable}</span>
                  </span>
                  {application && (
                    <button
                      type="button"
                      onClick={() => deleteHistory.mutate(application.applicationId)}
                      className="rounded-full px-3 py-1.5 text-[12.5px] text-coral transition hover:bg-coral/10"
                      title="Delete what was already recorded for this app"
                    >
                      Delete history
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onSave({ excludedExecutables: excluded.filter((item) => item !== executable) })}
                    aria-label={`Stop ignoring ${name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-ink-3 transition hover:text-ink"
                  >
                    <Icon name="close" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Ignore another app" subtitle="Apps used in the last 30 days.">
        <div className="p-2">
          <label className="flex h-11 items-center gap-2.5 rounded-[14px] bg-card-2 px-4 focus-within:ring-2 focus-within:ring-accent/60">
            <span className="text-ink-3">
              <Icon name="search" />
            </span>
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Find an app, or type a program file like 1password.exe"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-4"
              aria-label="Find an app to ignore"
            />
            {canAddTyped && (
              <button
                type="button"
                onClick={() => {
                  onSave({ excludedExecutables: [...excluded, typed] });
                  setFilter('');
                }}
                className="rounded-full bg-white px-3 py-1 text-[12.5px] font-medium text-[#111114]"
              >
                Ignore {typed}
              </button>
            )}
          </label>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {candidates.map((application, index) => (
              <button
                key={application.applicationId}
                type="button"
                disabled={exclude.isPending}
                onClick={() => exclude.mutate(application)}
                className="pop group flex items-center gap-3 rounded-[16px] bg-card-2 px-3 py-2.5 text-left transition hover:bg-select"
                style={{ '--i': index } as React.CSSProperties}
              >
                <AppMark name={application.name} color={appColor(application.name)} size={32} applicationId={application.applicationId} />
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{application.name}</span>
                <span className="rounded-full bg-card px-2.5 py-1 text-[12px] text-ink-3 transition group-hover:bg-white group-hover:text-[#111114]">
                  Ignore
                </span>
              </button>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function DataSection({ settings, onSave, onNote }: { settings: Settings; onSave: Save; onNote: Note }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<'week' | 'all' | null>(null);

  const exportData = useMutation({
    mutationFn: async () => {
      const destination = await bridge.chooseExportPath();
      return destination ? trace.exportTo(destination) : null;
    },
    onSuccess: (result) => {
      if (result) onNote({ text: `Exported ${result.sessionsExported} sessions to ${result.absolutePath}.`, tone: 'mint' });
    },
    onError: (error: Error) => onNote({ text: `The export failed: ${error.message}`, tone: 'coral' }),
  });

  const deleteWeek = useMutation({
    mutationFn: () => {
      const today = startOfLocalDay(new Date());
      return trace.deleteRange({ fromUtcMs: localDayRange(addDays(today, -6)).fromUtcMs, toUtcMs: localDayRange(today).toUtcMs });
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries();
      setConfirm(null);
      onNote({ text: `Deleted ${result.sessionsDeleted} sessions from the last 7 days.`, tone: 'mint' });
    },
  });

  const deleteAll = useMutation({
    mutationFn: trace.deleteEverything,
    onSuccess: (result) => {
      void queryClient.invalidateQueries();
      setConfirm(null);
      onNote({ text: `Deleted all ${result.sessionsDeleted} sessions. Trace is starting fresh.`, tone: 'mint' });
    },
  });

  return (
    <div className="space-y-4">
      <Panel title="Keep history for" subtitle="Anything older is deleted for good. Keeping everything is the default.">
        <div className="p-3">
          <Choices
            label="Keep history for"
            value={settings.retention}
            options={[
              { value: 'FOREVER', label: 'Forever' },
              { value: 'ONE_YEAR', label: '1 year' },
              { value: 'NINETY_DAYS', label: '90 days' },
              { value: 'THIRTY_DAYS', label: '30 days' },
            ]}
            onChange={(retention) => onSave({ retention: retention as RetentionPolicy })}
          />
        </div>
      </Panel>

      <Panel title="Take a copy">
        <Row
          icon="copy"
          tint="#8ea7ff"
          title="Export everything"
          body="Saves your whole history as one file you can keep or open elsewhere."
          control={<PillButton onClick={() => exportData.mutate()}>{exportData.isPending ? 'Exporting…' : 'Export'}</PillButton>}
        />
        <Row
          icon="lock"
          tint="#b39dff"
          title="Open the data folder"
          body={settings.dataDirectory}
          control={<PillButton onClick={() => void bridge.openFolder(settings.dataDirectory)}>Open</PillButton>}
        />
      </Panel>

      <section className="rounded-[22px] border border-coral/25 bg-coral/[0.04] p-2">
        <div className="px-4 pb-2 pt-3">
          <h2 className="text-[17px] font-medium text-coral">Delete history</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">Deleted history cannot be brought back.</p>
        </div>
        <Row
          icon="calendar"
          tint="#ff6b6b"
          title="Delete the last 7 days"
          body="Removes everything recorded this week."
          control={<PillButton danger onClick={() => setConfirm('week')}>Delete 7 days</PillButton>}
        />
        <Row
          icon="close"
          tint="#ff6b6b"
          title="Delete everything"
          body="Removes your whole history from this PC."
          control={<PillButton danger onClick={() => setConfirm('all')}>Delete everything</PillButton>}
        />
      </section>

      {confirm && (
        <ConfirmDialog
          title={confirm === 'all' ? 'Delete your whole history?' : 'Delete the last 7 days?'}
          body={
            confirm === 'all'
              ? 'Every app, session, window and event Trace has recorded will be deleted. There is no backup.'
              : 'The sessions, windows and events from the last 7 days will be deleted.'
          }
          word={confirm === 'all' ? 'DELETE ALL' : undefined}
          action={confirm === 'all' ? 'Delete everything' : 'Delete 7 days'}
          busy={deleteAll.isPending || deleteWeek.isPending}
          onConfirm={() => (confirm === 'all' ? deleteAll.mutate() : deleteWeek.mutate())}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function DisplaySection({ settings, onSave }: { settings: Settings; onSave: Save }) {
  const sample = new Date(2026, 0, 1, 14, 30);
  const options: { value: ClockFormat; title: string; example: string }[] = [
    { value: 'SYSTEM', title: 'Match Windows', example: sample.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) },
    { value: 'TWELVE_HOUR', title: '12-hour', example: '2:30 PM' },
    { value: 'TWENTY_FOUR_HOUR', title: '24-hour', example: '14:30' },
  ];
  return (
    <Panel title="Clock" subtitle="How times are shown everywhere in Trace. Nothing recorded changes.">
      <div className="grid gap-2 p-2 sm:grid-cols-3">
        {options.map((option) => {
          const active = settings.clockFormat === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSave({ clockFormat: option.value })}
              aria-pressed={active}
              className={`lift rounded-[18px] px-5 py-5 text-left ${active ? 'bg-white text-[#111114]' : 'bg-card-2 text-ink'}`}
            >
              <p className={`text-[13px] ${active ? 'text-[#66666d]' : 'text-ink-3'}`}>{option.title}</p>
              <p className="mt-2 text-[28px] font-medium leading-none tracking-[-0.02em]">{option.example}</p>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/** Plays the opening sequence again, over whatever is on screen. */
function ReplayIntro() {
  return (
    <Panel title="Opening animation" subtitle="Plays once each time Trace opens. Click anywhere to skip it.">
      <Row
        icon="play"
        tint="#5b8cff"
        title="Watch it again"
        body="Replays the animation now."
        control={<PillButton onClick={() => window.dispatchEvent(new Event('trace:replay-splash'))}>Replay</PillButton>}
      />
    </Panel>
  );
}

function StartupSection({ settings, onSave }: { settings: Settings; onSave: Save }) {
  return (
    <Panel title="Startup">
      <Row
        icon="play"
        tint="#7ee2a8"
        title="Start Trace when I sign in"
        body="The recorder starts quietly with Windows. The dashboard stays closed until you open it."
        control={<Switch label="Start with Windows" on={settings.startWithWindows} onChange={(startWithWindows) => onSave({ startWithWindows })} />}
      />
    </Panel>
  );
}

function AdvancedSection({ settings, onSave }: { settings: Settings; onSave: Save }) {
  return (
    <Panel title="Advanced">
      <Row
        icon="settings"
        tint="#f4a06b"
        title="Detailed logs"
        body="Writes extra diagnostics, including window titles, to Trace's log files. Only turn this on to report a problem."
        control={<Switch label="Developer logging" on={settings.developerLogging} onChange={(developerLogging) => onSave({ developerLogging })} />}
      />
      {settings.developerLogging && (
        <div className="mx-2 mb-2">
          <StatusPill tone="peach">Window titles are being written to log files</StatusPill>
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Pieces                                                            */
/* ------------------------------------------------------------------ */

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-[22px] bg-card p-2">
      <div className="px-4 pb-2 pt-3">
        <h2 className="text-[17px] font-medium text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({
  icon,
  tint,
  title,
  body,
  control,
  children,
}: {
  icon: IconName;
  tint: string;
  title: string;
  body: string;
  control: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[16px] px-4 py-3.5 transition hover:bg-card-2/60">
      <div className="flex items-center gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]" style={{ background: `${tint}1f`, color: tint }}>
          <Icon name={icon} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-ink">{title}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3 [overflow-wrap:anywhere]">{body}</p>
        </div>
        <div className="shrink-0">{control}</div>
      </div>
      {children && <div className="mt-3 pl-14">{children}</div>}
    </div>
  );
}

/** A large on/off switch with a sliding knob. */
function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[30px] w-[54px] rounded-full transition-colors duration-300 ${on ? 'bg-accent' : 'bg-white/[0.12]'}`}
    >
      <span
        className="absolute top-[3px] h-6 w-6 rounded-full bg-white shadow-md transition-all duration-300"
        style={{ left: on ? 27 : 3, transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      />
    </button>
  );
}

/** A row of pill choices, instead of a dropdown. */
function Choices({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[13px] text-ink-3">{label}</span>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`h-9 rounded-full px-4 text-[13.5px] transition ${active ? 'bg-white text-[#111114]' : 'bg-card-2 text-ink-2 hover:text-ink'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function PillButton({ children, onClick, danger = false }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-full px-5 text-[13.5px] font-medium transition ${
        danger ? 'bg-coral/15 text-coral hover:bg-coral/25' : 'bg-white text-[#111114] hover:bg-white/90'
      }`}
    >
      {children}
    </button>
  );
}

function ConfirmDialog({
  title,
  body,
  word,
  action,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  word?: string;
  action: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const ready = word === undefined || typed.trim().toUpperCase() === word;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/65 backdrop-blur-[2px]" onClick={onCancel} role="presentation" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[26px] bg-[#141416] p-7 shadow-[0_30px_80px_rgb(0_0_0/70%)] ring-1 ring-white/[0.06]"
        style={{ animation: 'pop 300ms cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-coral/15 text-coral">
          <Icon name="close" />
        </span>
        <h2 className="mt-4 text-[22px] font-medium text-ink">{title}</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">{body}</p>
        {word && (
          <label className="mt-5 block text-[13px] text-ink-3">
            Type <span className="font-medium text-ink">{word}</span> to confirm
            <input
              value={typed}
              autoFocus
              onChange={(event) => setTyped(event.target.value)}
              className="mt-2 h-11 w-full rounded-[12px] bg-card-2 px-4 text-[14px] text-ink outline-none focus:ring-2 focus:ring-coral/60"
            />
          </label>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-10 rounded-full bg-card-2 px-5 text-[13.5px] text-ink-2 hover:text-ink">
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={onConfirm}
            className="h-10 rounded-full bg-coral px-5 text-[13.5px] font-medium text-[#2a0707] transition disabled:opacity-40"
          >
            {busy ? 'Deleting…' : action}
          </button>
        </div>
      </div>
    </>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[22px] bg-card px-6 py-16 text-center">
      <p className="text-[16px] font-medium text-ink">{title}</p>
      <p className="mt-1.5 text-ink-3">{body}</p>
    </div>
  );
}
