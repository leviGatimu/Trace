import type { ReactNode } from 'react';

/**
 * The shared pieces.
 *
 * Notice what is missing: there is no card, panel or box. Sections are
 * separated by vertical space and a small label, lists by alignment and hover
 * alone. Enclosing every group in a bordered rectangle is what made the
 * earlier attempts look amateur — it gives a paragraph the same visual weight
 * as the day's headline figure and fills the screen with lines that mean
 * nothing.
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
    <header className="mb-9 flex items-baseline justify-between gap-6">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="truncate text-[18px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {meta && <span className="truncate text-ink-3">{meta}</span>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}

/**
 * A labelled band of content.
 *
 * The label is the only structure: no rule beneath it, no container around the
 * children. Space does the separating.
 */
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
    <section className={`mb-9 ${className}`.trim()}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="eyebrow">{label}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/**
 * The day's headline figure, with its subordinate facts on the same line.
 *
 * One large number, not four boxed ones. The others are context for it and are
 * set as running text, which is what they are.
 */
export function Headline({ value, unit, facts }: { value: string; unit: string; facts: string[] }) {
  return (
    <div className="mb-7">
      <div className="flex items-baseline gap-2.5">
        <span className="display text-[46px] leading-none text-ink">{value}</span>
        <span className="text-[13px] text-ink-3">{unit}</span>
      </div>
      <p className="mt-2.5 text-ink-2">
        {facts.map((fact, index) => (
          <span key={fact}>
            {index > 0 && <span className="mx-2 text-ink-4">·</span>}
            {fact}
          </span>
        ))}
      </p>
    </div>
  );
}

/**
 * A list row.
 *
 * No border and no radius at rest; a tint on hover, and negative horizontal
 * margin so the tint bleeds past the text into the gutter rather than drawing
 * a button around it.
 */
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
    '-mx-2 block w-[calc(100%+1rem)] rounded-sm px-2 py-[11px] text-left',
    selected ? 'bg-lift' : '',
  ].join(' ');

  if (!onClick) {
    return <div className={shared}>{children}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${shared} transition-colors duration-150 hover:bg-lift`}
    >
      {children}
    </button>
  );
}

/** A proportion, drawn as a thin rule. Reads as a measurement, not a chart. */
export function Meter({ fraction, color }: { fraction: number; color?: string }) {
  return (
    <span className="block h-[2px] w-full overflow-hidden bg-white/6" aria-hidden>
      <span
        className="block h-full transition-[width] duration-500 ease-out"
        style={{
          width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
          background: color ?? 'var(--color-accent)',
        }}
      />
    </span>
  );
}

/**
 * A figure with its label above it.
 *
 * Comparable numbers set as a row of columns, so the eye can scan across them.
 * They were previously run together into a sentence, which reads fine for one
 * fact and badly for four you are meant to compare.
 */
export function Figure({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow mb-1.5">{label}</div>
      <div
        className={`display text-[24px] leading-none ${muted ? 'text-ink-3' : 'text-ink'}`}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Tabs, as an underline.
 *
 * Used where a page has two equally important bodies of content and stacking
 * them would make the second invisible below the fold.
 */
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
    <div role="tablist" className="mb-6 flex gap-6 border-b border-hair">
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
              '-mb-px border-b-2 pb-2.5 transition-colors duration-150',
              active
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-3 hover:text-ink',
            ].join(' ')}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="data ml-2 text-ink-4">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A dot in an application's own colour, tying a row to its band in the ribbon. */
export function AppSwatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
      style={{ background: color }}
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
    <div className="py-14">
      <p className="text-ink-2">{title}</p>
      {detail && <p className="mt-1.5 max-w-md leading-relaxed text-ink-4">{detail}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="h-3 animate-pulse rounded-sm bg-white/5"
          style={{ width: `${92 - index * 11}%`, animationDelay: `${index * 70}ms` }}
        />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="py-8">
      <p className="text-ink-2">{message}</p>
      {onRetry && (
        <button
          type="button"
          className="mt-2.5 text-accent transition-opacity hover:opacity-70"
          onClick={onRetry}
        >
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
  variant?: 'default' | 'ghost' | 'accent' | 'danger';
  title?: string;
}) {
  const styles = {
    default: 'bg-lift text-ink hover:bg-white/10',
    ghost: 'text-ink-3 hover:bg-lift hover:text-ink',
    accent: 'bg-accent/15 text-accent hover:bg-accent/25',
    danger: 'bg-danger/12 text-danger hover:bg-danger/20',
  }[variant];

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-md px-2.5 py-[5px] transition-colors duration-150 ${styles}`}
    >
      {children}
    </button>
  );
}

/**
 * The tracking indicator.
 *
 * Always paired with a word. DOCS/Privacy.md §11 wants the answer to "is this
 * recording me?" to be unmissable, and a coloured dot alone is missable — and
 * invisible to anyone who cannot separate these hues.
 */
export function StatusDot({ state }: { state: 'live' | 'paused' | 'idle' | 'off' }) {
  const colour = {
    live: 'text-positive',
    idle: 'text-warning',
    paused: 'text-ink-4',
    off: 'text-danger',
  }[state];

  return (
    <span className={`relative inline-flex h-[6px] w-[6px] shrink-0 ${colour}`}>
      <span className="absolute inset-0 rounded-full bg-current" />
      {state === 'live' && <span className="pulse absolute inset-0" />}
    </span>
  );
}
