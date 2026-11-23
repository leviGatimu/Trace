import { addDays, isSameLocalDay, relativeDay, startOfLocalDay } from '@/lib/format';
import { Icon } from './Icon';

/**
 * Moves between days.
 *
 * Deliberately cannot go into the future: there is nothing there, and offering
 * to look implies otherwise.
 */
export function DayPicker({
  day,
  onChange,
}: {
  day: Date;
  onChange: (day: Date) => void;
}) {
  const today = startOfLocalDay(new Date());
  const isToday = isSameLocalDay(day, today);
  const arrow = 'flex h-8 w-8 items-center justify-center rounded-full text-ink-2 transition hover:bg-card-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <div className="inline-flex h-10 items-center gap-1 rounded-full bg-card px-1">
      <button type="button" className={arrow} title="Previous day" aria-label="Previous day" onClick={() => onChange(addDays(day, -1))}>
        <Icon name="left" />
      </button>
      <button
        type="button"
        className="min-w-[92px] px-1 text-center text-[13.5px] font-medium text-ink"
        title="Go to today"
        onClick={() => onChange(today)}
      >
        {isToday ? 'Today' : relativeDay(day) === 'Yesterday' ? 'Yesterday' : day.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
      </button>
      <button
        type="button"
        className={arrow}
        title="Next day"
        aria-label="Next day"
        disabled={isToday}
        onClick={() => onChange(addDays(day, 1))}
      >
        <Icon name="right" />
      </button>
    </div>
  );
}

export function DayLabel({ day }: { day: Date }) {
  return <span>{relativeDay(day)}</span>;
}
