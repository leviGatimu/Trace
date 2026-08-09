import type { ReactNode } from 'react';

/**
 * The small shared pieces every page is built from.
 *
 * Kept deliberately plain. DOCS/UI and UX-design.md is explicit about what this
 * product is not: no giant colourful cards, no glowing gradients, no fifteen
 * colours. Structure comes from spacing and hairline borders, emphasis from
 * typography, and colour is spent only where it carries meaning.
 */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-6 pb-6">
      <div className="min-w-0">
        <h1 className="truncate text-[19px] font-medium tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-ink-dim">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between gap-4 border-b border-line pb-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** A headline figure with its label underneath. */
export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="tabular text-[26px] font-light leading-none tracking-tight text-ink">
        {value}
      </div>
      <div className="mt-1.5 text-[11px] uppercase tracking-[0.08em] text-ink-faint">{label}</div>
    </div>
  );
}

/**
 * The proportional bar behind an application row.
 *
 * Drawn as a background rather than a separate element so the label sits on top
 * of it, which keeps rows compact and the list scannable.
 */
export function Bar({ fraction }: { fraction: number }) {
  const width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;

  return (
    <div
      className="absolute inset-y-0 left-0 rounded-[3px] bg-accent-wash transition-[width] duration-500 ease-out"
      style={{ width }}
      aria-hidden
    />
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
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-line px-6 py-14 text-center">
      <p className="text-ink-dim">{title}</p>
      {detail && <p className="mt-1.5 max-w-sm text-ink-faint">{detail}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * The loading state.
 *
 * Skeleton rows rather than a spinner: the layout does not jump when the data
 * lands, which is most of what makes an interface feel settled.
 */
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="h-9 animate-pulse rounded-[4px] bg-card"
          style={{ animationDelay: `${index * 60}ms` }}
        />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-md border border-line bg-card px-4 py-3">
      <p className="text-ink-dim">{message}</p>
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
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'ghost' | 'accent';
  title?: string;
}) {
  const styles = {
    default: 'border-line bg-card text-ink hover:border-line-strong hover:bg-raised',
    ghost: 'border-transparent text-ink-dim hover:bg-card hover:text-ink',
    accent: 'border-accent-dim bg-accent-wash text-accent hover:border-accent',
  }[variant];

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-[5px] border px-2.5 py-1.5 transition-colors duration-150 ${styles}`}
    >
      {children}
    </button>
  );
}

/**
 * The tracking indicator. The product should never leave the user wondering
 * whether it is recording (DOCS/Privacy.md §11), so this appears wherever state
 * is shown and always says which state it means.
 */
export function StatusDot({ state }: { state: 'live' | 'paused' | 'idle' | 'off' }) {
  const colour = {
    live: 'text-positive',
    idle: 'text-warning',
    paused: 'text-ink-faint',
    off: 'text-danger',
  }[state];

  return (
    <span className={`relative inline-flex h-1.5 w-1.5 shrink-0 ${colour}`}>
      <span className="absolute inset-0 rounded-full bg-current" />
      {state === 'live' && <span className="pulse-dot absolute inset-0" />}
    </span>
  );
}
