import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** A dashboard card: big radius, no border. `tone="light"` is the one white feature card. */
export function Card({
  children,
  className = '',
  tone = 'dark',
  index,
  lift = false,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'dark' | 'light';
  /** Its place in the page's entrance; cards rise in one after another. */
  index?: number;
  /** Lifts under the pointer: for cards that lead somewhere. */
  lift?: boolean;
}) {
  const ground = tone === 'light' ? 'bg-[#f4f4f6] text-[#111114]' : 'bg-card text-ink';
  return (
    <section
      className={`group relative overflow-hidden rounded-[22px] ${/(^|\s)p-0(\s|$)/.test(className) ? '' : 'p-5'} ${ground} ${index !== undefined ? 'rise' : ''} ${lift ? 'lift' : ''} ${className}`.trim()}
      style={index !== undefined ? ({ '--i': index } as React.CSSProperties) : undefined}
    >
      {children}
    </section>
  );
}

/**
 * A number that counts up to its value when it first appears or changes.
 * Formats every frame, so durations tick up as durations.
 */
export function CountUp({ value, format = String, ms = 900 }: { value: number; format?: (n: number) => string; ms?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + (value - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);

  return <>{format(Math.round(shown))}</>;
}

/** A clock icon whose hand goes round: for anything about time passing or missing. */
export function AnimatedClock({ size = 16, fast = false }: { size?: number; fast?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 8V4.6" className={fast ? 'clock-hand-fast' : 'clock-hand'} />
      <circle cx="8" cy="8" r="0.6" fill="currentColor" />
    </svg>
  );
}

/** The round arrow button in a card's corner, leading to the full view. */
export function CornerLink({ to, label, tone = 'dark' }: { to: string; label: string; tone?: 'dark' | 'accent' | 'light' }) {
  const styles = {
    dark: 'bg-card-2 text-ink-2 hover:bg-select hover:text-ink',
    accent: 'bg-accent text-white hover:brightness-110',
    light: 'bg-white text-[#111114] hover:bg-white/90',
  }[tone];

  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className={`arrow-turn absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full transition ${styles}`}
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        <path d="M5 11L11 5M6 5h5v5" />
      </svg>
    </Link>
  );
}

/** A small change pill: green when up, red when down, grey when level or unknown. */
export function Delta({ current, previous }: { current: number; previous: number | undefined }) {
  if (previous === undefined || (previous === 0 && current === 0)) {
    return null;
  }

  const change = previous === 0 ? 100 : Math.round(((current - previous) / previous) * 100);
  const up = change > 0;
  const level = change === 0;
  const style = level ? 'bg-card-2 text-ink-3' : up ? 'bg-mint text-[#0b3b22]' : 'bg-coral text-[#4a0c0c]';

  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-[2px] text-[11.5px] font-medium ${style}`}>
      {level ? '' : up ? '↑' : '↓'} {Math.abs(change)}%
    </span>
  );
}

/** A coloured status pill, as used in tables. */
export function StatusPill({ tone, children }: { tone: 'mint' | 'peach' | 'grey' | 'lilac' | 'coral'; children: ReactNode }) {
  const styles = {
    mint: 'bg-mint/12 text-mint',
    peach: 'bg-peach/12 text-peach',
    grey: 'bg-white/6 text-ink-3',
    lilac: 'bg-lilac/12 text-lilac',
    coral: 'bg-coral/12 text-coral',
  }[tone];

  return <span className={`inline-flex items-center rounded-[7px] px-2 py-[3px] text-[12px] font-medium ${styles}`}>{children}</span>;
}

/** A round icon button, for the top bar and card actions. */
export function RoundButton({
  label,
  onClick,
  children,
  active = false,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
        active ? 'bg-white text-[#111114]' : 'bg-card text-ink-2 hover:bg-card-2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

/** A dark pill-shaped control, like the reference's "This month" selector. */
export function PillButton({ children, onClick, label }: { children: ReactNode; onClick?: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-10 items-center gap-2 rounded-full bg-card px-4 text-ink-2 transition hover:bg-card-2 hover:text-ink"
    >
      {children}
    </button>
  );
}

/**
 * A floating panel under a toolbar button. Closes on Escape or a click
 * anywhere outside it.
 */
export function Popover({
  trigger,
  children,
  width = 340,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open && (
        <div
          className="absolute right-0 top-12 z-30 rounded-[18px] bg-card-2 p-4 shadow-[0_18px_50px_rgb(0_0_0/55%)]"
          style={{ width, maxHeight: 'calc(100vh - 230px)', overflowY: 'auto', animation: 'enter 160ms cubic-bezier(0.22,1,0.36,1) both' }}
          role="dialog"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** A pill you can switch on and off inside a filter panel. */
export function ToggleChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition ${
        on ? 'bg-white text-[#111114]' : 'bg-card text-ink-2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
