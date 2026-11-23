import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectedDevice, DeviceKind, LiveProcess, SystemLive } from '@trace/contracts';
import { Workspace } from '@/app/Shell';
import { StatusPill } from '@/components/bento';
import { Icon, type IconName } from '@/components/Icon';
import { AppMark } from '@/components/primitives';
import { useConnection, useSystemLive } from '@/hooks/useTracker';
import { appColor } from '@/lib/appColor';

const HISTORY = 60;

const KINDS: { kind: DeviceKind; label: string; icon: IconName; tint: string }[] = [
  { kind: 'display', label: 'Screens', icon: 'display', tint: '#5b8cff' },
  { kind: 'keyboard', label: 'Keyboards', icon: 'keyboard', tint: '#b39dff' },
  { kind: 'mouse', label: 'Mice and pointers', icon: 'mouse', tint: '#7ee2a8' },
  { kind: 'camera', label: 'Cameras', icon: 'camera', tint: '#ff6b6b' },
  { kind: 'speaker', label: 'Speakers and headphones', icon: 'speaker', tint: '#f4a06b' },
  { kind: 'microphone', label: 'Microphones', icon: 'microphone', tint: '#ff9fcf' },
  { kind: 'storage', label: 'Drives', icon: 'storage', tint: '#f6dc7c' },
  { kind: 'phone', label: 'Phones and media', icon: 'phone', tint: '#5fd0e0' },
  { kind: 'controller', label: 'Game controllers', icon: 'controller', tint: '#7ee2a8' },
  { kind: 'printer', label: 'Printers', icon: 'printer', tint: '#8e8e95' },
  { kind: 'bluetooth', label: 'Paired Bluetooth devices', icon: 'bluetooth', tint: '#5b8cff' },
];

/**
 * The machine right now: how hard it is working, what is plugged in, and what
 * is running. Read every second and a half while this page is open, and never
 * written down.
 */
export function SystemPage() {
  const connected = useConnection().status === 'connected';
  const { data, isPending, error, refetch } = useSystemLive(connected);
  const history = useHistory(data);

  return (
    <Workspace>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-medium leading-tight tracking-[-0.02em] text-ink">System</h1>
          <p className="mt-1 text-[14.5px] text-ink-3">What this PC is doing right now, and what is plugged in.</p>
        </div>
        <span className="inline-flex h-10 items-center gap-2 rounded-full bg-card px-4 text-[13px] text-ink-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-mint opacity-60" />
            <span className="relative h-2 w-2 rounded-full bg-mint" />
          </span>
          Live, not saved
        </span>
      </header>

      {!connected ? (
        <Empty title="Waiting for the tracker" body="Trace's recorder is not running yet." />
      ) : error && !data ? (
        <Empty
          title={/unknown method|not found|E_UNKNOWN/i.test(error.message) ? 'The recorder needs updating' : 'System details could not be read'}
          body={
            /unknown method|not found|E_UNKNOWN/i.test(error.message)
              ? 'The Trace recorder running on this PC is older than this page. Update Trace, then come back here.'
              : error.message
          }
          onRetry={() => void refetch()}
        />
      ) : isPending || !data ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-[250px] animate-pulse rounded-[22px] bg-card" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-4 xl:grid-cols-3">
            <Gauge
              index={0}
              light
              icon="cpu"
              title="Processor"
              detail={`${data.cpu.name.replace(/\(R\)|\(TM\)|CPU|@.*$/g, '').replace(/\s+/g, ' ').trim()} · ${data.cpu.logicalCores} threads`}
              percent={data.cpu.usagePercent}
              history={history.cpu}
              colour="#2f6bff"
            />
            <Gauge
              index={1}
              icon="gpu"
              title="Graphics"
              detail={data.gpu ? data.gpu.names.join(', ') : 'No graphics adapter reported'}
              percent={data.gpu?.usagePercent ?? 0}
              history={history.gpu}
              colour="#b39dff"
              footnote={
                data.gpu?.dedicatedUsedBytes
                  ? `${bytes(data.gpu.dedicatedUsedBytes)} of video memory in use`
                  : undefined
              }
            />
            <Gauge
              index={2}
              icon="memory"
              title="Memory"
              detail={`${bytes(data.memory.usedBytes)} of ${bytes(data.memory.totalBytes)} in use`}
              percent={data.memory.totalBytes ? (data.memory.usedBytes / data.memory.totalBytes) * 100 : 0}
              history={history.memory}
              colour="#7ee2a8"
            />
          </div>

          <div className="mb-4 grid gap-4 xl:grid-cols-12">
            <Devices devices={data.devices} />
            <Busiest processes={data.processes} total={data.processCount} />
          </div>

          <ProcessTable processes={data.processes} />
        </>
      )}
    </Workspace>
  );
}

/** The last minute of readings, kept while the page is open. */
function useHistory(data: SystemLive | undefined) {
  const [history, setHistory] = useState<{ cpu: number[]; gpu: number[]; memory: number[] }>({ cpu: [], gpu: [], memory: [] });
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!data || data.atUtcMs === last.current) return;
    last.current = data.atUtcMs;
    const push = (list: number[], value: number) => [...list, value].slice(-HISTORY);
    setHistory((current) => ({
      cpu: push(current.cpu, data.cpu.usagePercent),
      gpu: push(current.gpu, data.gpu?.usagePercent ?? 0),
      memory: push(current.memory, data.memory.totalBytes ? (data.memory.usedBytes / data.memory.totalBytes) * 100 : 0),
    }));
  }, [data]);

  return history;
}

/* ------------------------------------------------------------------ */

function Gauge({
  index,
  icon,
  title,
  detail,
  percent,
  history,
  colour,
  light = false,
  footnote,
}: {
  index: number;
  icon: IconName;
  title: string;
  detail: string;
  percent: number;
  history: number[];
  colour: string;
  light?: boolean;
  footnote?: string;
}) {
  const size = 132;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = Math.max(0, Math.min(100, percent));
  const level = value >= 85 ? 'Very busy' : value >= 60 ? 'Busy' : value >= 25 ? 'Working' : 'Calm';

  return (
    <section
      className={`rise relative overflow-hidden rounded-[22px] p-6 ${light ? 'bg-[#f4f4f6] text-[#111114]' : 'bg-card text-ink'}`}
      style={{ '--i': index } as React.CSSProperties}
    >
      <div className="flex items-start gap-5">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={light ? '#e2e2e7' : '#232327'} strokeWidth={stroke} />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={colour}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - value / 100)}
              style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)', filter: `drop-shadow(0 0 6px ${colour}66)` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[30px] font-medium leading-none tracking-[-0.03em]">
              <Smooth value={value} />
              <span className="text-[16px]">%</span>
            </span>
            <span className={`mt-1 text-[11.5px] ${light ? 'text-[#77777e]' : 'text-ink-4'}`}>{level}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 pt-1">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-[12px] ${light ? 'bg-[#111114] text-white' : 'bg-card-2'}`}
            style={light ? undefined : { color: colour }}
          >
            <Icon name={icon} />
          </span>
          <p className="mt-3 text-[18px] font-medium">{title}</p>
          <p className={`mt-0.5 text-[12.5px] leading-snug ${light ? 'text-[#66666d]' : 'text-ink-3'}`}>{detail}</p>
          {footnote && <p className={`mt-1 text-[12px] ${light ? 'text-[#77777e]' : 'text-ink-4'}`}>{footnote}</p>}
        </div>
      </div>
      <Sparkline values={history} colour={colour} light={light} />
    </section>
  );
}

/** A number that glides to each new reading instead of jumping. */
function Smooth({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      const next = origin + (value - origin) * (1 - Math.pow(1 - t, 3));
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{Math.round(shown)}</>;
}

/** The last minute as a soft area chart that scrolls left as readings arrive. */
function Sparkline({ values, colour, light }: { values: number[]; colour: string; light: boolean }) {
  const width = 400;
  const height = 64;
  const id = useMemo(() => `spark-${Math.random().toString(36).slice(2)}`, []);
  const points = values.length < 2 ? [0, 0] : values;
  const step = width / (HISTORY - 1);
  const offset = (HISTORY - points.length) * step;
  const coords = points.map((value, index) => [offset + index * step, height - 4 - (value / 100) * (height - 8)] as const);
  const line = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1]![0].toFixed(1)},${height} L${coords[0]![0].toFixed(1)},${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="mt-5 h-16 w-full" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity={light ? 0.28 : 0.35} />
          <stop offset="100%" stopColor={colour} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={colour} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

function Devices({ devices }: { devices: ConnectedDevice[] }) {
  const groups = KINDS.map((kind) => ({ ...kind, items: devices.filter((device) => device.kind === kind.kind) })).filter(
    (group) => group.items.length > 0,
  );

  return (
    <section className="rise rounded-[22px] bg-card p-2 xl:col-span-8" style={{ '--i': 3 } as React.CSSProperties}>
      <div className="flex items-baseline justify-between px-4 pb-2 pt-3">
        <h2 className="text-[17px] font-medium text-ink">Connected devices</h2>
        <span className="text-[12.5px] text-ink-3">{devices.length} found</span>
      </div>
      {groups.length === 0 ? (
        <p className="px-4 pb-6 pt-2 text-ink-3">No devices reported.</p>
      ) : (
        <div className="space-y-4 px-2 pb-3">
          {groups.map((group) => (
            <div key={group.kind}>
              <p className="mb-2 px-2 text-[12px] font-medium uppercase tracking-[0.05em] text-ink-4">{group.label}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.items.map((device, index) => (
                  <div
                    key={`${device.name}-${device.connection}`}
                    className="pop flex items-center gap-3 rounded-[16px] bg-card-2 px-3 py-2.5 transition hover:bg-select"
                    style={{ '--i': index } as React.CSSProperties}
                    title={device.manufacturer ?? undefined}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
                      style={{ background: `${group.tint}1f`, color: group.tint }}
                    >
                      <Icon name={group.icon} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-ink">{device.name}</span>
                      {device.manufacturer && !device.manufacturer.startsWith('Standard') && (
                        <span className="block truncate text-[12px] text-ink-4">{device.manufacturer}</span>
                      )}
                    </span>
                    <StatusPill tone={device.connection === 'USB' ? 'lilac' : device.connection === 'Bluetooth' ? 'mint' : 'grey'}>
                      {device.connection}
                    </StatusPill>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Busiest({ processes, total }: { processes: LiveProcess[]; total: number }) {
  const top = processes.slice(0, 7);
  const peak = Math.max(...top.map((process) => process.cpuPercent), 1);

  return (
    <section className="rise rounded-[22px] bg-card p-2 xl:col-span-4" style={{ '--i': 4 } as React.CSSProperties}>
      <div className="flex items-baseline justify-between px-4 pb-2 pt-3">
        <h2 className="text-[17px] font-medium text-ink">Working hardest</h2>
        <span className="text-[12.5px] text-ink-3">{total} processes running</span>
      </div>
      <ul className="px-2 pb-2">
        {top.map((process) => (
          <li key={process.executable} className="flex items-center gap-3 rounded-[14px] px-2 py-2">
            <AppMark name={process.name} color={appColor(process.name)} size={34} applicationId={process.applicationId ?? undefined} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[14px] text-ink">{process.name}</span>
                <span className="shrink-0 text-[13px] font-medium text-ink">{process.cpuPercent.toFixed(1)}%</span>
              </span>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-card-2">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max(2, (process.cpuPercent / peak) * 100)}%`,
                    background: appColor(process.name),
                    transition: 'width 800ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProcessTable({ processes }: { processes: LiveProcess[] }) {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<'cpu' | 'memory' | 'name'>('cpu');
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    const text = filter.trim().toLowerCase();
    const list = processes.filter(
      (process) => !text || process.name.toLowerCase().includes(text) || process.executable.includes(text),
    );
    const order = {
      cpu: (a: LiveProcess, b: LiveProcess) => b.cpuPercent - a.cpuPercent || b.memoryBytes - a.memoryBytes,
      memory: (a: LiveProcess, b: LiveProcess) => b.memoryBytes - a.memoryBytes,
      name: (a: LiveProcess, b: LiveProcess) => a.name.localeCompare(b.name),
    }[sort];
    return [...list].sort(order);
  }, [processes, filter, sort]);

  const shown = showAll ? rows : rows.slice(0, 20);
  const peakMemory = Math.max(...processes.map((process) => process.memoryBytes), 1);

  return (
    <section className="rise rounded-[22px] bg-card" style={{ '--i': 5 } as React.CSSProperties}>
      <div className="flex flex-wrap items-center gap-3 px-6 pb-3 pt-5">
        <h2 className="text-[17px] font-medium text-ink">Running programs</h2>
        <label className="ml-auto flex h-10 w-[280px] items-center gap-2.5 rounded-[12px] bg-card-2 px-3.5 focus-within:ring-2 focus-within:ring-accent/60">
          <span className="text-ink-3">
            <Icon name="search" />
          </span>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Find a program"
            aria-label="Find a running program"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-4"
          />
        </label>
        <div className="inline-flex h-10 items-center gap-1 rounded-full bg-card-2 p-1">
          {(
            [
              ['cpu', 'CPU'],
              ['memory', 'Memory'],
              ['name', 'A–Z'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSort(value)}
              className={`h-8 rounded-full px-3.5 text-[13px] transition ${sort === value ? 'bg-white text-[#111114]' : 'text-ink-2 hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <table className="w-full table-fixed">
        <colgroup>
          <col />
          <col className="w-[90px]" />
          <col className="w-[190px]" />
          <col className="w-[200px]" />
        </colgroup>
        <thead>
          <tr className="text-left text-[11.5px] uppercase tracking-[0.05em] text-ink-4">
            <th className="px-6 pb-3 font-medium">Program</th>
            <th className="px-3 pb-3 text-right font-medium">Processes</th>
            <th className="px-3 pb-3 font-medium">CPU</th>
            <th className="px-6 pb-3 font-medium">Memory</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((process) => (
            <tr key={process.executable} className="border-t border-hair transition-colors hover:bg-card-2">
              <td className="px-6 py-3">
                <span className="flex min-w-0 items-center gap-3">
                  <AppMark name={process.name} color={appColor(process.name)} size={32} applicationId={process.applicationId ?? undefined} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] text-ink">{process.name}</span>
                    <span className="block truncate text-[12px] text-ink-4">{process.executable}</span>
                  </span>
                </span>
              </td>
              <td className="px-3 py-3 text-right text-[13px] text-ink-3">{process.count}</td>
              <td className="px-3 py-3">
                <Bar value={process.cpuPercent} max={100} label={`${process.cpuPercent.toFixed(1)}%`} colour="#5b8cff" />
              </td>
              <td className="px-6 py-3">
                <Bar value={process.memoryBytes} max={peakMemory} label={bytes(process.memoryBytes)} colour="#7ee2a8" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!showAll && rows.length > 20 && (
        <div className="border-t border-hair p-3 text-center">
          <button type="button" onClick={() => setShowAll(true)} className="rounded-full bg-card-2 px-4 py-2 text-[13px] text-ink-2 hover:text-ink">
            Show all {rows.length}
          </button>
        </div>
      )}
    </section>
  );
}

function Bar({ value, max, label, colour }: { value: number; max: number; label: string; colour: string }) {
  return (
    <span className="flex items-center gap-3">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-card-2">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(1, (value / max) * 100)}%`, background: colour, transition: 'width 800ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </span>
      <span className="w-16 shrink-0 text-right text-[13px] text-ink">{label}</span>
    </span>
  );
}

function bytes(value: number): string {
  if (value >= 1e9) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1e6) return `${Math.round(value / 1024 ** 2)} MB`;
  return `${Math.round(value / 1024)} KB`;
}

function Empty({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <div className="rounded-[22px] bg-card px-6 py-16 text-center">
      <p className="text-[16px] font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-ink-3">{body}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-5 h-10 rounded-full bg-white px-5 text-[13.5px] font-medium text-[#111114]">
          Try again
        </button>
      )}
    </div>
  );
}
