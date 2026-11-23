import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ProtectionStatus, TamperEntry, TamperKind } from '@trace/contracts';
import { Workspace } from '@/app/Shell';
import { Card, StatusPill } from '@/components/bento';
import { Icon, type IconName } from '@/components/Icon';
import { markSeen, needsAttention, useProtection, useTamperLog } from '@/hooks/useProtection';
import { useConnection } from '@/hooks/useTracker';
import { clockTime, duration, relativeDay, shortDate, startOfLocalDay } from '@/lib/format';
import { withDay } from '@/lib/range';
import { trace, TraceError } from '@/services/trace';

type Tone = 'mint' | 'peach' | 'grey' | 'lilac' | 'coral';

/** How each kind of log entry reads, and whether it is something to look at. */
const KINDS: Record<TamperKind, { title: string; icon: IconName; tone: Tone }> = {
  'unexpected-stop': { title: 'Stopped unexpectedly', icon: 'alert', tone: 'coral' },
  quit: { title: 'Quit', icon: 'close', tone: 'peach' },
  paused: { title: 'Paused', icon: 'pause', tone: 'peach' },
  resumed: { title: 'Resumed', icon: 'play', tone: 'mint' },
  'setting-changed': { title: 'Setting turned down', icon: 'settings', tone: 'peach' },
  deleted: { title: 'History deleted', icon: 'close', tone: 'coral' },
  'wrong-pin': { title: 'Wrong PIN', icon: 'lock', tone: 'coral' },
  'locked-out': { title: 'PIN entry paused', icon: 'lock', tone: 'coral' },
  'recovery-used': { title: 'Recovery code used', icon: 'unlock', tone: 'lilac' },
  'settings-edited': { title: 'Settings file edited', icon: 'alert', tone: 'coral' },
  'settings-unreadable': { title: 'Settings file unreadable', icon: 'alert', tone: 'peach' },
  'auto-restart-repaired': { title: 'Auto-restart was removed', icon: 'alert', tone: 'coral' },
  updated: { title: 'Installed or updated', icon: 'download', tone: 'grey' },
  'protection-on': { title: 'Protection on', icon: 'shield', tone: 'mint' },
  'protection-off': { title: 'Protection off', icon: 'unlock', tone: 'peach' },
  'pin-changed': { title: 'PIN changed', icon: 'lock', tone: 'lilac' },
  'new-history': { title: 'History file replaced', icon: 'alert', tone: 'coral' },
};

const TONE_CLASS: Record<Tone, string> = {
  mint: 'bg-mint/15 text-mint',
  peach: 'bg-peach/15 text-peach',
  grey: 'bg-white/[0.07] text-ink-3',
  lilac: 'bg-lilac/15 text-lilac',
  coral: 'bg-coral/15 text-coral',
};

export function ProtectionPage() {
  const connected = useConnection().status === 'connected';
  const status = useProtection(connected);
  const log = useTamperLog(connected);
  const [setup, setSetup] = useState(false);

  useEffect(() => {
    const newest = log.data?.[0]?.atUtcMs;
    if (newest) {
      markSeen(newest);
    }
  }, [log.data]);

  const unknownMethod = status.error instanceof TraceError && status.error.code === 'E_UNKNOWN_METHOD';

  return (
    <Workspace>
      {setup && status.data && <SetPinDialog changing={status.data.enabled} onClose={() => setSetup(false)} />}

      <header className="mb-6">
        <h1 className="text-[34px] font-medium leading-tight tracking-[-0.02em] text-ink">Protection</h1>
        <p className="mt-1 text-[14.5px] text-ink-3">Who can switch Trace off, and every time someone did or tried.</p>
      </header>

      {!connected ? (
        <Notice title="Waiting for the tracker" body="Trace's recorder is not running yet." />
      ) : unknownMethod ? (
        <Notice
          title="The recorder needs updating"
          body="The Trace recorder running on this PC is older than this page. Update Trace, then come back here."
        />
      ) : !status.data ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-[200px] animate-pulse rounded-[22px] bg-card" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-4 xl:grid-cols-[1.35fr_1fr_1fr]">
            <Hero status={status.data} onSetPin={() => setSetup(true)} />
            <AutoRestartCard status={status.data} />
            <StopsCard entries={log.data ?? []} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
            <LogCard entries={log.data} />
            <LimitsCard />
          </div>
        </>
      )}
    </Workspace>
  );
}

function Hero({ status, onSetPin }: { status: ProtectionStatus; onSetPin: () => void }) {
  const queryClient = useQueryClient();
  const now = useNow(1000);
  const [problem, setProblem] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['protection'] });
  const run = (work: () => Promise<unknown>) => async () => {
    setProblem(null);
    try {
      await work();
    } catch (error) {
      // Cancelling the PIN window lands here too; that is not a problem to show.
      if (!(error instanceof TraceError && error.code === 'E_LOCKED' && !/Too many/.test(error.message))) {
        setProblem(error instanceof Error ? error.message : String(error));
      }
    }

    await refresh();
  };

  const unlockedFor = status.unlockedUntilUtcMs ? Math.max(0, status.unlockedUntilUtcMs - now) : 0;
  const lockedOutFor = status.lockedOutUntilUtcMs ? Math.max(0, status.lockedOutUntilUtcMs - now) : 0;

  return (
    <Card index={0} tone="light" className="min-h-[220px]">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-[18px] ${status.enabled ? 'bg-[#111114] text-white' : 'bg-[#e4e4e8] text-[#55555c]'} ${status.enabled ? 'shield-on' : ''}`}
        >
          <span className="scale-[1.45]">
            <Icon name={status.enabled ? 'shield' : 'unlock'} />
          </span>
        </span>
        {status.enabled && (
          <span className="rounded-full bg-[#111114] px-3 py-1 text-[12.5px] font-medium text-white">
            {lockedOutFor > 0
              ? `PIN entry paused · ${mmss(lockedOutFor)}`
              : unlockedFor > 0
                ? `Unlocked · relocks in ${mmss(unlockedFor)}`
                : 'Locked'}
          </span>
        )}
      </div>

      <h2 className="mt-5 text-[30px] font-medium leading-tight tracking-[-0.02em]">
        {status.enabled ? 'Trace is protected' : 'Anyone can switch Trace off'}
      </h2>
      <p className="mt-2 max-w-[460px] text-[14.5px] leading-relaxed text-[#55555c]">
        {status.enabled
          ? 'Pausing, quitting, deleting history and turning settings down all need your PIN, in this window and in the tray icon.'
          : 'Set a PIN so pausing, quitting, deleting history and turning settings down need it. Trace also restarts itself if it is ended.'}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {status.enabled ? (
          <>
            {unlockedFor > 0 && (
              <HeroButton dark onClick={run(trace.lockNow)}>
                <Icon name="lock" /> Lock now
              </HeroButton>
            )}
            <HeroButton dark={unlockedFor === 0} onClick={onSetPin}>
              Change PIN
            </HeroButton>
            <HeroButton onClick={run(trace.disableProtection)}>Turn protection off</HeroButton>
          </>
        ) : (
          <HeroButton dark onClick={onSetPin}>
            <Icon name="shield" /> Set a PIN
          </HeroButton>
        )}
      </div>
      {problem && <p className="mt-3 text-[13.5px] text-[#c22c2c]">{problem}</p>}
    </Card>
  );
}

function HeroButton({ children, onClick, dark = false }: { children: ReactNode; onClick: () => void; dark?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex h-10 items-center gap-2 rounded-full px-5 text-[13.5px] font-medium transition active:scale-[0.97]',
        dark ? 'bg-[#111114] text-white hover:bg-black' : 'bg-[#e4e4e8] text-[#111114] hover:bg-[#d8d8dd]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function AutoRestartCard({ status }: { status: ProtectionStatus }) {
  const on = status.enabled && status.autoRestart;
  return (
    <Card index={1} className="min-h-[220px]">
      <div className="flex items-center justify-between">
        <span className={`flex h-11 w-11 items-center justify-center rounded-[14px] ${on ? 'bg-mint/15 text-mint' : 'bg-white/[0.07] text-ink-3'}`}>
          <Icon name="play" />
        </span>
        <StatusPill tone={on ? 'mint' : status.enabled ? 'coral' : 'grey'}>
          {on ? 'On' : status.enabled ? 'Not working' : 'Off'}
        </StatusPill>
      </div>
      <h3 className="mt-5 text-[20px] font-medium text-ink">Auto-restart</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-3">
        {on
          ? 'If Trace is ended in Task Manager, it starts again within a minute. It also starts whenever you sign in.'
          : status.enabled
            ? 'Windows would not accept the restart task. Trace tries again every minute.'
            : 'Comes on with the PIN. A visible task in Task Scheduler, called "Trace Recorder", starts Trace again if it is ended.'}
      </p>
    </Card>
  );
}

function StopsCard({ entries }: { entries: TamperEntry[] }) {
  const weekAgo = Date.now() - 7 * 86_400_000;
  const recent = entries.filter((entry) => entry.atUtcMs >= weekAgo);
  const stops = recent.filter((entry) => entry.kind === 'unexpected-stop' || entry.kind === 'quit');
  const attempts = recent.filter((entry) => entry.kind === 'wrong-pin' || entry.kind === 'settings-edited' || entry.kind === 'auto-restart-repaired');
  const offSeconds = stops.reduce(
    (total, entry) => total + (entry.fromUtcMs && entry.toUtcMs ? Math.max(0, entry.toUtcMs - entry.fromUtcMs) / 1000 : 0),
    0,
  );

  return (
    <Card index={2} className="min-h-[220px]">
      <p className="text-[14px] text-ink-3">Last 7 days</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Figure value={stops.length} label={stops.length === 1 ? 'stop' : 'stops'} tone={stops.length ? 'text-coral' : 'text-ink'} />
        <Figure value={attempts.length} label={attempts.length === 1 ? 'attempt' : 'attempts'} tone={attempts.length ? 'text-peach' : 'text-ink'} />
      </div>
      <p className="mt-4 text-[14px] leading-relaxed text-ink-3">
        {stops.length === 0 && attempts.length === 0
          ? 'Nobody has stopped Trace or tried to get past the PIN this week.'
          : offSeconds > 0
            ? `Trace was not recording for ${duration(offSeconds)} because of these stops.`
            : 'See the log below for when and how.'}
      </p>
    </Card>
  );
}

function Figure({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="rounded-[16px] bg-card-2 px-4 py-3">
      <div className={`text-[34px] font-medium leading-none tracking-[-0.02em] ${tone}`}>{value}</div>
      <div className="mt-1.5 text-[13px] text-ink-3">{label}</div>
    </div>
  );
}

function LogCard({ entries }: { entries: TamperEntry[] | undefined }) {
  const [onlyAttention, setOnlyAttention] = useState(false);
  const shown = (entries ?? []).filter((entry) => !onlyAttention || needsAttention(entry));

  return (
    <Card index={3} className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h3 className="text-[20px] font-medium text-ink">Tamper log</h3>
          <p className="mt-0.5 text-[13.5px] text-ink-3">Every stop, pause and PIN attempt, newest first.</p>
        </div>
        <div className="flex rounded-full bg-card-2 p-1 text-[13px]">
          {[
            ['All', false],
            ['Needs a look', true],
          ].map(([label, value]) => (
            <button
              key={String(label)}
              type="button"
              onClick={() => setOnlyAttention(value as boolean)}
              className={`h-8 rounded-full px-3.5 transition ${onlyAttention === value ? 'bg-white font-medium text-[#111114]' : 'text-ink-3 hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {entries === undefined ? (
        <div className="space-y-2 px-6 pb-6">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-[14px] bg-card-2" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="px-6 pb-8 pt-4 text-[14.5px] text-ink-3">
          {onlyAttention ? 'Nothing here needs a look.' : 'Nothing logged yet. Stops and PIN attempts will appear here.'}
        </p>
      ) : (
        <ol className="max-h-[560px] overflow-y-auto px-3 pb-3">
          {shown.map((entry, index) => (
            <LogRow key={entry.id} entry={entry} index={index} />
          ))}
        </ol>
      )}
    </Card>
  );
}

function LogRow({ entry, index }: { entry: TamperEntry; index: number }) {
  const kind = KINDS[entry.kind] ?? { title: entry.kind, icon: 'alert' as IconName, tone: 'grey' as Tone };
  const day = startOfLocalDay(new Date(entry.fromUtcMs ?? entry.atUtcMs));
  const gap = entry.fromUtcMs && entry.toUtcMs && entry.toUtcMs > entry.fromUtcMs ? (entry.toUtcMs - entry.fromUtcMs) / 1000 : null;

  return (
    <li
      className="slide-in flex gap-3.5 rounded-[16px] px-3 py-3 transition-colors hover:bg-white/[0.03]"
      style={{ '--i': Math.min(index, 12) } as React.CSSProperties}
    >
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${TONE_CLASS[kind.tone]}`}>
        <Icon name={kind.icon} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-[15px] font-medium text-ink">{kind.title}</span>
          <span className="text-[13px] tabular-nums text-ink-3">
            {relativeDay(startOfLocalDay(new Date(entry.atUtcMs))) === 'Today' ? 'Today' : shortDate(entry.atUtcMs)}, {clockTime(entry.atUtcMs)}
          </span>
        </div>
        <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-3">{entry.detail}</p>
        {gap !== null && entry.fromUtcMs && entry.toUtcMs && (
          <Link
            to={withDay('/timeline?show=gaps', day)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-card-2 px-3 py-1 text-[12.5px] text-ink-2 hover:text-ink"
          >
            Not recording {clockTime(entry.fromUtcMs)} to {clockTime(entry.toUtcMs)} · {duration(gap)}
            <Icon name="right" />
          </Link>
        )}
      </div>
    </li>
  );
}

function LimitsCard() {
  return (
    <Card index={4}>
      <h3 className="text-[20px] font-medium text-ink">What it can and can't stop</h3>
      <ul className="mt-4 space-y-3 text-[14px] leading-relaxed">
        <Limit ok>Pause, Quit and turning settings down, from here or the tray icon.</Limit>
        <Limit ok>Deleting history, or excluding apps.</Limit>
        <Limit ok>Editing or breaking settings.json: Trace puts it back.</Limit>
        <Limit ok>Removing the auto-restart task while Trace runs.</Limit>
        <Limit>
          Ending Trace in Task Manager. It comes back within a minute, and the stop is logged.
        </Limit>
        <Limit>
          Uninstalling Trace or deleting its folder. Nothing on your own Windows account can block that, but the missing
          time shows as a gap.
        </Limit>
      </ul>
      <p className="mt-4 text-[13px] leading-relaxed text-ink-4">
        Five wrong PINs pause PIN entry for a minute, doubling each time. Lost your PIN? The recovery code unlocks Trace.
      </p>
    </Card>
  );
}

function Limit({ ok = false, children }: { ok?: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className={`mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] ${ok ? 'bg-mint/15 text-mint' : 'bg-peach/15 text-peach'}`}>
        {ok ? '✓' : '!'}
      </span>
      <span className="text-ink-2">{children}</span>
    </li>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <h2 className="text-[20px] font-medium text-ink">{title}</h2>
      <p className="mt-1 text-[14.5px] text-ink-3">{body}</p>
    </Card>
  );
}

/** Choosing a PIN, then showing the recovery code once. */
function SetPinDialog({ changing, onClose }: { changing: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pin !== again) {
      setError('The two PINs are different.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await trace.setPin(pin);
      setCode(result.recoveryCode);
      await queryClient.invalidateQueries({ queryKey: ['protection'] });
    } catch (caught) {
      if (!(caught instanceof TraceError && caught.code === 'E_LOCKED')) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      setBusy(false);
    }
  };

  const field =
    'h-14 w-full rounded-[14px] bg-card-2 px-4 text-center text-[26px] tracking-[0.5em] text-ink outline-none placeholder:text-[15px] placeholder:tracking-normal placeholder:text-ink-4 focus:ring-2 focus:ring-accent/70';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[3px]" onClick={code ? undefined : onClose} role="presentation" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={code ? 'Your recovery code' : changing ? 'Change PIN' : 'Set a PIN'}
        className="fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[26px] bg-[#141416] p-7 shadow-[0_30px_80px_rgb(0_0_0/70%)] ring-1 ring-white/[0.06]"
        style={{ animation: 'pop 300ms cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        {code ? (
          <>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mint/15 text-mint">
              <Icon name="shield" />
            </span>
            <h2 className="mt-4 text-[22px] font-medium text-ink">Save your recovery code</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">
              If you forget the PIN, this unlocks Trace. It is shown only now. Write it down somewhere other than this
              computer.
            </p>
            <div className="mt-5 rounded-[16px] bg-card-2 px-4 py-5 text-center font-medium tabular-nums tracking-[0.14em] text-[21px] text-ink">
              {code}
            </div>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(code).then(() => setCopied(true));
              }}
              className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink"
            >
              <Icon name="copy" /> {copied ? 'Copied' : 'Copy'}
            </button>
            <label className="mt-5 flex items-center gap-2.5 text-[14px] text-ink-2">
              <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} className="h-4 w-4 accent-[#2f6bff]" />
              I've saved it
            </label>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                disabled={!saved}
                onClick={onClose}
                className="h-10 rounded-full bg-white px-5 text-[13.5px] font-medium text-[#111114] transition disabled:opacity-40"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-lilac">
              <Icon name="lock" />
            </span>
            <h2 className="mt-4 text-[22px] font-medium text-ink">{changing ? 'Change your PIN' : 'Choose a PIN'}</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">
              4 to 12 digits, different from your Windows PIN. Anyone who knows it can switch Trace off.
            </p>
            <input
              autoFocus
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              type="password"
              inputMode="numeric"
              maxLength={12}
              placeholder="New PIN"
              aria-label="New PIN"
              className={`mt-5 ${field}`}
            />
            <input
              value={again}
              onChange={(event) => setAgain(event.target.value.replace(/\D/g, ''))}
              type="password"
              inputMode="numeric"
              maxLength={12}
              placeholder="Same PIN again"
              aria-label="Same PIN again"
              className={`mt-3 ${field}`}
            />
            <p className="mt-3 min-h-[20px] text-[13.5px] text-coral" role="alert">
              {error}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="h-10 rounded-full bg-card-2 px-5 text-[13.5px] text-ink-2 hover:text-ink">
                Cancel
              </button>
              <button
                type="submit"
                disabled={pin.length < 4 || again.length < 4 || busy}
                className="h-10 rounded-full bg-white px-5 text-[13.5px] font-medium text-[#111114] transition disabled:opacity-40"
              >
                {busy ? 'Saving…' : changing ? 'Change PIN' : 'Turn on protection'}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}

function mmss(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
