import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { BackgroundApp, ProcessInstanceRow } from '@trace/contracts';
import { Workspace } from '@/app/Shell';
import { Card, CountUp, StatusPill } from '@/components/bento';
import { DayPicker } from '@/components/DayPicker';
import { Icon } from '@/components/Icon';
import { AppMark, StatusDot } from '@/components/primitives';
import { useBackground, useConnection } from '@/hooks/useTracker';
import { appColor } from '@/lib/appColor';
import { clockTime, clockTimeWithSeconds, duration, localDayRange, longDate, relativeDay, shortDate } from '@/lib/format';
import { useSelectedDay } from '@/lib/range';
import { trace } from '@/services/trace';

/**
 * Windows' own helper processes. They run constantly in every session and
 * would bury the apps you actually have, so they are hidden unless asked for.
 */
const WINDOWS_HELPERS = new Set([
  'svchost.exe', 'conhost.exe', 'runtimebroker.exe', 'dllhost.exe', 'sihost.exe', 'taskhostw.exe', 'ctfmon.exe',
  'searchhost.exe', 'startmenuexperiencehost.exe', 'shellexperiencehost.exe', 'textinputhost.exe',
  'applicationframehost.exe', 'smartscreen.exe', 'backgroundtaskhost.exe', 'fontdrvhost.exe', 'dwm.exe',
  'winlogon.exe', 'csrss.exe', 'lockapp.exe', 'securityhealthsystray.exe', 'useroobebroker.exe', 'wudfhost.exe',
  'crossdeviceresume.exe', 'widgetservice.exe', 'systemsettings.exe', 'searchprotocolhost.exe',
  'searchfilterhost.exe', 'audiodg.exe', 'msedgewebview2.exe', 'cmd.exe', 'openconsole.exe',
]);

type Sort = 'running' | 'longest' | 'background' | 'name';

const isHelper = (app: BackgroundApp) =>
  app.category === 'System' || app.instances.every((instance) => WINDOWS_HELPERS.has(instance.executable));

export function BackgroundPage() {
  const [day, setDay] = useSelectedDay();
  const range = useMemo(() => localDayRange(day), [day]);
  const connected = useConnection().status === 'connected';
  const { data, isPending, error } = useBackground(range, connected);
  const [filter, setFilter] = useState('');
  const [showHelpers, setShowHelpers] = useState(false);
  const [sort, setSort] = useState<Sort>('running');
  const [open, setOpen] = useState<BackgroundApp | null>(null);

  const all = data?.apps ?? [];
  const helpers = all.filter(isHelper).length;
  const apps = useMemo(() => {
    const text = filter.trim().toLowerCase();
    const list = all
      .filter((app) => showHelpers || !isHelper(app))
      .filter((app) => !text || app.name.toLowerCase().includes(text) || app.instances.some((i) => i.executable.includes(text)));
    const background = (app: BackgroundApp) => app.runningSeconds - app.foregroundSeconds;
    const order: Record<Sort, (a: BackgroundApp, b: BackgroundApp) => number> = {
      running: (a, b) => b.runningNow - a.runningNow || b.runningSeconds - a.runningSeconds,
      longest: (a, b) => b.runningSeconds - a.runningSeconds,
      background: (a, b) => background(b) - background(a),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...list].sort(order[sort]);
  }, [all, filter, showHelpers, sort]);

  const shownApps = all.filter((app) => !isHelper(app));
  const runningNow = shownApps.filter((app) => app.runningNow > 0).length;
  const mostlyBackground = shownApps.filter((app) => app.runningSeconds > 300 && app.foregroundSeconds < app.runningSeconds * 0.1).length;
  const isToday = relativeDay(day) === 'Today';

  return (
    <Workspace>
      {open && <ProcessDrawer app={open} onClose={() => setOpen(null)} />}

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-medium leading-tight tracking-[-0.02em] text-ink">Background apps</h1>
          <p className="mt-1 text-[14.5px] text-ink-3">Every app that was running, whether or not you could see it.</p>
        </div>
        <DayPicker day={day} onChange={setDay} />
      </header>

      {!connected ? (
        <Empty title="Waiting for the tracker" body="Trace's recorder is not running yet." />
      ) : error && !data ? (
        <Empty
          title="The recorder needs updating"
          body="The Trace recorder running on this PC is older than this page. Update Trace, then come back here."
        />
      ) : isPending ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-[140px] animate-pulse rounded-[22px] bg-card" />
          ))}
        </div>
      ) : (
        <>
          {!data?.enabled && <TurnOn hasHistory={all.length > 0} />}

          {(data?.enabled || all.length > 0) && (
            <>
              <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <Card tone="light" index={0}>
                  <div className="flex items-center gap-2 text-[14px] text-[#55555c]">
                    {isToday && data?.enabled && <StatusDot state="live" />}
                    {isToday ? 'Running now' : 'Apps that ran'}
                  </div>
                  <p className="mt-5 text-[34px] font-medium leading-none tracking-[-0.03em]">
                    <CountUp value={isToday ? runningNow : shownApps.length} />
                  </p>
                  <p className="mt-3 text-[12px] text-[#77777e]">{isToday ? 'apps, not counting Windows helpers' : longDate(day.getTime())}</p>
                </Card>
                <Stat index={1} label="Apps that ran" value={<CountUp value={shownApps.length} />} note={`${helpers} Windows helpers hidden`} />
                <Stat index={2} label="Mostly in the background" value={<CountUp value={mostlyBackground} />} note="In front less than a tenth of the time" />
                <Stat
                  index={3}
                  label="Recording since"
                  value={data?.recordingSince ? shortDate(data.recordingSince) : '—'}
                  note={data?.recordingSince ? clockTime(data.recordingSince) : 'Nothing recorded yet'}
                />
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-3">
                <label className="flex h-11 w-[320px] items-center gap-2.5 rounded-[14px] bg-card px-4 focus-within:ring-2 focus-within:ring-accent/60">
                  <span className="text-ink-3">
                    <Icon name="search" />
                  </span>
                  <input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="Find an app or program file"
                    aria-label="Find a background app"
                    className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
                  />
                </label>
                <span className="text-[14px] text-ink">
                  {apps.length} <span className="text-ink-4">apps</span>
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {(
                    [
                      ['running', 'Running first'],
                      ['longest', 'Longest'],
                      ['background', 'Most background'],
                      ['name', 'A–Z'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSort(value)}
                      className={`h-10 rounded-full px-4 text-[13.5px] transition ${sort === value ? 'bg-white text-[#111114]' : 'bg-card text-ink-2 hover:bg-card-2 hover:text-ink'}`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowHelpers((value) => !value)}
                    aria-pressed={showHelpers}
                    className={`h-10 rounded-full px-4 text-[13.5px] transition ${showHelpers ? 'bg-lilac text-[#14142a]' : 'bg-card text-ink-2 hover:bg-card-2 hover:text-ink'}`}
                  >
                    {showHelpers ? 'Hide' : 'Show'} Windows helpers
                  </button>
                </div>
              </div>

              {apps.length === 0 ? (
                <Empty
                  title={data?.enabled ? 'Nothing recorded for this day yet' : 'No background apps recorded on this day'}
                  body={data?.enabled ? 'Apps appear here within a few seconds of starting.' : 'Turn background apps on to start recording them.'}
                />
              ) : (
                <div className="grid gap-3 xl:grid-cols-2">
                  {apps.map((app, index) => (
                    <AppRow key={app.applicationId} app={app} index={Math.min(index, 14)} onOpen={() => setOpen(app)} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </Workspace>
  );
}

function TurnOn({ hasHistory }: { hasHistory: boolean }) {
  const queryClient = useQueryClient();
  const enable = useMutation({
    mutationFn: () => trace.updateSettings({ recordBackgroundApps: true }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });

  return (
    <section className="rise relative mb-6 overflow-hidden rounded-[26px] bg-[#f4f4f6] p-8 text-[#111114]" style={{ '--i': 0 } as React.CSSProperties}>
      <span className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-[#8ea7ff] opacity-40 blur-3xl" aria-hidden />
      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#111114] text-white">
            <Icon name="layers" />
          </span>
          <h2 className="mt-5 text-[30px] font-medium leading-tight tracking-[-0.02em]">See what runs behind the scenes</h2>
          <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[#55555c]">
            Trace can note every program running on your account, including ones you never see on screen, and when each
            started and stopped. {hasHistory ? 'It is switched off now; what it recorded before is below.' : 'It is off until you switch it on.'}
          </p>
          <button
            type="button"
            onClick={() => enable.mutate()}
            disabled={enable.isPending}
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-[#111114] px-6 text-[15px] font-medium text-white transition hover:bg-black disabled:opacity-60"
          >
            <Icon name="play" />
            {enable.isPending ? 'Turning on…' : 'Turn on background apps'}
          </button>
        </div>
        <div className="grid content-center gap-2">
          {[
            ['Recorded', 'Program name and location, when it started and stopped, and which program started it', true],
            ['Only yours', 'Programs on your Windows account. Other accounts and system services are never listed', true],
            ['Never recorded', 'What a program was started with, what it opened, or anything it did', false],
          ].map(([title, body, yes]) => (
            <div key={title as string} className="flex gap-3 rounded-[18px] bg-white/70 px-4 py-3.5">
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                  yes ? 'bg-[#7ee2a8] text-[#0b3b22]' : 'bg-[#ff6b6b] text-[#4a0c0c]'
                }`}
              >
                {yes ? '✓' : '✕'}
              </span>
              <span>
                <span className="block text-[14.5px] font-medium">{title as string}</span>
                <span className="block text-[13px] text-[#66666d]">{body as string}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AppRow({ app, index, onOpen }: { app: BackgroundApp; index: number; onOpen: () => void }) {
  const colour = appColor(app.name);
  const front = Math.min(app.foregroundSeconds, app.runningSeconds);
  const back = app.runningSeconds - front;
  const total = Math.max(app.runningSeconds, 1);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="rise lift group flex items-center gap-4 rounded-[22px] bg-card p-4 text-left"
      style={{ '--i': index } as React.CSSProperties}
    >
      <AppMark name={app.name} color={colour} size={48} applicationId={app.applicationId} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15.5px] font-medium text-ink">{app.name}</span>
          {app.runningNow > 0 ? (
            <StatusPill tone="mint">
              <span className="pulse relative mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-mint" />
              running
            </StatusPill>
          ) : (
            <StatusPill tone="grey">stopped</StatusPill>
          )}
        </div>
        <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-card-2" title={`In front ${duration(front)}, background ${duration(back)}`}>
          <span className="h-full" style={{ width: `${(front / total) * 100}%`, background: colour }} />
          <span className="h-full bg-lilac/60" style={{ width: `${(back / total) * 100}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 text-[12.5px] text-ink-3">
          <span>
            Ran <span className="text-ink">{duration(app.runningSeconds)}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: colour }} /> in front {duration(front)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-lilac/60" /> background {duration(back)}
          </span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[20px] font-medium leading-none text-ink">{app.instanceCount}</p>
        <p className="mt-1 text-[12px] text-ink-4">{app.instanceCount === 1 ? 'process' : 'processes'}</p>
      </div>
    </button>
  );
}

/** One app's processes, as a tree: each under the process that started it. */
function ProcessDrawer({ app, onClose }: { app: BackgroundApp; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const colour = appColor(app.name);
  const roots = useMemo(() => {
    const byPid = new Map(app.instances.map((instance) => [instance.pid, instance]));
    return app.instances.filter((instance) => instance.parentPid === null || !byPid.has(instance.parentPid));
  }, [app.instances]);
  const children = (parent: ProcessInstanceRow) =>
    app.instances.filter((instance) => instance.parentPid === parent.pid && instance.startedAt >= parent.startedAt && instance !== parent);

  const renderTree = (instance: ProcessInstanceRow, depth: number): React.ReactNode => (
    <li key={instance.instanceId}>
      <ProcessLine instance={instance} depth={depth} />
      <ul>{children(instance).map((child) => renderTree(child, depth + 1))}</ul>
    </li>
  );

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px]" onClick={onClose} role="presentation" />
      <aside
        className="fixed bottom-3 right-3 top-3 z-40 flex w-[560px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[26px] bg-[#141416] shadow-[0_30px_80px_rgb(0_0_0/70%)] ring-1 ring-white/[0.06]"
        style={{ animation: 'panel-in 260ms cubic-bezier(0.22,1,0.36,1) both' }}
        aria-label={`${app.name} processes`}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.07] text-ink-2 transition hover:rotate-90 hover:text-ink"
          title="Close (Esc)"
        >
          <Icon name="close" label="Close" />
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-8 pt-7">
          <div className="flex items-center gap-4 pr-12">
            <AppMark name={app.name} color={colour} size={60} applicationId={app.applicationId} />
            <div className="min-w-0">
              <h2 className="truncate text-[24px] font-medium tracking-[-0.02em] text-ink">{app.name}</h2>
              <p className="mt-1 text-[14px] text-ink-3">
                {app.instanceCount} {app.instanceCount === 1 ? 'process' : 'processes'}, first started {clockTime(app.firstStartedAt)}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2">
            <Fact label="Ran for" value={duration(app.runningSeconds)} />
            <Fact label="In front" value={duration(Math.min(app.foregroundSeconds, app.runningSeconds))} />
            <Fact label="Background" value={duration(Math.max(0, app.runningSeconds - app.foregroundSeconds))} />
          </div>

          <h3 className="mb-3 mt-7 text-[16px] font-medium text-ink">Processes</h3>
          <p className="mb-3 text-[12.5px] text-ink-4">
            Each process sits under the one that started it. Start times come from Windows; an end is known to within 2 seconds.
          </p>
          <ul className="space-y-1.5">{roots.map((root) => renderTree(root, 0))}</ul>

          <div className="mt-7 flex gap-3 rounded-[16px] border border-white/[0.07] px-4 py-3.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lilac/15 text-[13px] font-semibold text-lilac">i</span>
            <p className="text-[13.5px] leading-relaxed text-ink-3">
              A running process shows the program was open. It does not show that anyone used it, or what it did. A process
              that lived for less than 2 seconds may not appear.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}

function ProcessLine({ instance, depth }: { instance: ProcessInstanceRow; depth: number }) {
  const end = instance.endedAt ?? (instance.endState === 'running' ? Date.now() : instance.lastSeenAt);
  return (
    <div className="rounded-[14px] bg-white/[0.04] px-4 py-3" style={{ marginLeft: depth * 22 }}>
      <div className="flex items-center gap-2">
        {depth > 0 && <span className="text-ink-4">↳</span>}
        <span className="truncate text-[14.5px] font-medium text-ink">{instance.executable}</span>
        <span className="text-[12px] text-ink-4">PID {instance.pid}</span>
        <span className="ml-auto">
          {instance.endState === 'running' ? (
            <StatusPill tone="mint">running</StatusPill>
          ) : instance.endState === 'ended' ? (
            <StatusPill tone="grey">ended</StatusPill>
          ) : (
            <StatusPill tone="peach">end not seen</StatusPill>
          )}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-3">
        {instance.startObserved ? '' : 'Seen from '}
        {clockTimeWithSeconds(instance.startedAt)}
        {instance.endState === 'running'
          ? ' to now'
          : instance.endState === 'ended'
            ? ` to ${clockTimeWithSeconds(instance.endedAt!)}`
            : `, last seen ${clockTimeWithSeconds(instance.lastSeenAt)}`}
        <span className="text-ink-4"> · {duration(Math.max(0, Math.round((end - instance.startedAt) / 1000)))}</span>
      </p>
      {instance.parentExecutable && depth === 0 && (
        <p className="mt-0.5 text-[12px] text-ink-4">Started by {instance.parentExecutable}</p>
      )}
    </div>
  );
}

function Stat({ index, label, value, note }: { index: number; label: string; value: React.ReactNode; note: string }) {
  return (
    <Card index={index}>
      <p className="text-[14px] text-ink-2">{label}</p>
      <p className="mt-5 text-[34px] font-medium leading-none tracking-[-0.03em] text-ink">{value}</p>
      <p className="mt-3 text-[12px] text-ink-4">{note}</p>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] bg-white/[0.04] px-4 py-3">
      <p className="text-[12.5px] text-ink-4">{label}</p>
      <p className="mt-0.5 text-[18px] font-medium text-ink">{value}</p>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[22px] bg-card px-6 py-16 text-center">
      <p className="text-[16px] font-medium text-ink">{title}</p>
      <p className="mt-1.5 text-ink-3">{body}</p>
    </div>
  );
}
