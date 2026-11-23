import type { ReactNode } from 'react';
import { useAppIcon, useConnection } from '@/hooks/useTracker';

/**
 * The shared pieces of Trace 2.0.
 *
 * Regions that hold data (a table, the inspector, a chart) sit in a bordered
 * panel, because on an investigation screen it matters where one body of
 * evidence ends and the next begins. Prose and headings never get a box.
 */

export function PageHeader({
  title,
  meta,
  actions,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-end justify-between gap-6">
      <div className="min-w-0">
        <h1 className="truncate text-[22px] font-semibold tracking-[-0.015em] text-ink">{title}</h1>
        {meta && <p className="mt-0.5 truncate text-ink-3">{meta}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A bordered region of evidence, with an optional header line. */
export function Panel({
  title,
  detail,
  actions,
  children,
  className = '',
  flush = false,
}: {
  title?: string;
  detail?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** No inner padding: for tables whose rows run edge to edge. */
  flush?: boolean;
}) {
  return (
    <section className={`rounded-md border border-hair bg-canvas ${className}`.trim()}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-4 border-b border-hair px-4 py-2.5">
          <div className="flex min-w-0 items-baseline gap-3">
            {title && <h2 className="font-semibold text-ink">{title}</h2>}
            {detail && <span className="truncate text-ink-4">{detail}</span>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

/** A labelled band of content without a box, for settings and prose. */
export function Section({
  label,
  children,
  actions,
  className = '',
}: {
  label: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-8 ${className}`.trim()}>
      <div className="mb-2.5 flex items-center justify-between gap-4 border-b border-hair pb-2">
        <h2 className="eyebrow">{label}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** One headline figure with the facts that qualify it. */
export function Headline({ value, unit, facts }: { value: string; unit: string; facts: string[] }) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-2">
        <span className="display text-[38px] leading-none text-ink">{value}</span>
        <span className="text-ink-3">{unit}</span>
      </div>
      {facts.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-4 text-ink-3">
          {facts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </p>
      )}
    </div>
  );
}

/** A plain list row with a hover tint. */
export function Row({
  children,
  onClick,
  selected = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
}) {
  const shared = [
    'block w-full border-b border-hair px-4 py-2.5 text-left last:border-b-0',
    selected ? 'bg-select' : '',
  ].join(' ');

  if (!onClick) {
    return <div className={shared}>{children}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={`${shared} transition-colors duration-100 hover:bg-lift`}>
      {children}
    </button>
  );
}

/** A proportion, drawn as a short bar in a sunken track. */
export function Meter({ fraction, color }: { fraction: number; color?: string }) {
  return (
    <span className="block h-[4px] w-full overflow-hidden rounded-full bg-sunken" aria-hidden>
      <span
        className="block h-full rounded-full"
        style={{
          width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
          background: color ?? 'var(--color-accent)',
        }}
      />
    </span>
  );
}

/** A figure with its label above it, for a row of comparable numbers. */
export function Figure({
  label,
  value,
  muted = false,
  note,
}: {
  label: string;
  value: string;
  muted?: boolean;
  note?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-ink-3">{label}</div>
      <div className={`display mt-1 text-[22px] leading-none ${muted ? 'text-ink-2' : 'text-ink'}`}>{value}</div>
      {note && <div className="mt-1.5 text-[12.5px] text-ink-4">{note}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 border-b border-hair">
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={[
              '-mb-px border-b-2 px-3 pb-2 pt-1 transition-colors duration-100',
              active ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink',
            ].join(' ')}
          >
            {option.label}
            {option.count !== undefined && <span className="data ml-1.5 text-ink-4">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A small dot in an application's colour. */
export function AppSwatch({ color }: { color: string }) {
  return <span className="inline-block h-[7px] w-[7px] shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden />;
}

/**
 * An application's mark: its initials on a tile of its colour. Stands in for
 * the real icon until icons are extracted from executables, and remains the
 * fallback for anything Trace cannot get an icon for.
 */
export function AppMark({
  name,
  color,
  size = 22,
  applicationId,
}: {
  name: string;
  color: string;
  size?: number;
  /** When given, the application's real icon is shown, with the initials as the fallback. */
  applicationId?: number;
}) {
  const connected = useConnection().status === 'connected';
  const icon = useAppIcon(applicationId, connected);
  if (icon.data?.dataUrl) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-[10px] bg-white/[0.06]"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <img src={icon.data.dataUrl} alt="" draggable={false} style={{ width: size * 0.72, height: size * 0.72 }} />
      </span>
    );
  }

  const initials = name
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('') || '?';

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[10px] font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 30%, transparent)`,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** A label and its value, for detail panes. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 py-1.5">
      <dt className="text-ink-4">{label}</dt>
      <dd className="min-w-0 break-words text-ink-2">{children}</dd>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="data inline-flex min-w-[18px] items-center justify-center rounded-[3px] border border-hair-strong px-1 text-[11px] leading-[16px] text-ink-3">
      {children}
    </kbd>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="font-medium text-ink-2">{title}</p>
      {detail && <p className="mx-auto mt-1.5 max-w-md leading-relaxed text-ink-4">{detail}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="h-7 animate-pulse rounded-sm bg-white/[0.04]"
          style={{ animationDelay: `${index * 60}ms` }}
        />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="px-4 py-8" role="alert">
      <p className="text-danger">{message}</p>
      {onRetry && (
        <button type="button" className="mt-2 text-accent hover:underline" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  title,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'ghost' | 'accent' | 'danger';
  title?: string;
  disabled?: boolean;
}) {
  const styles = {
    default: 'border border-hair-strong bg-lift text-ink hover:bg-select',
    ghost: 'text-ink-3 hover:bg-lift hover:text-ink',
    accent: 'bg-accent text-[#10141a] font-medium hover:brightness-110',
    danger: 'border border-danger/40 text-danger hover:bg-danger/12',
  }[variant];

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-[5px] transition-colors duration-100 disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

/** The tracking indicator. Always paired with a word, never colour alone. */
export function StatusDot({ state }: { state: 'live' | 'paused' | 'idle' | 'off' }) {
  const colour = {
    live: 'text-positive',
    idle: 'text-warning',
    paused: 'text-ink-4',
    off: 'text-danger',
  }[state];

  return (
    <span className={`relative inline-flex h-[7px] w-[7px] shrink-0 ${colour}`}>
      <span className="absolute inset-0 rounded-full bg-current" />
      {state === 'live' && <span className="pulse absolute inset-0" />}
    </span>
  );
}
