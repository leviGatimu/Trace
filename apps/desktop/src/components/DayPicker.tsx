import { addDays, isSameLocalDay, relativeDay, startOfLocalDay } from '@/lib/format';
import { Button } from './primitives';

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

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" title="Previous day" onClick={() => onChange(addDays(day, -1))}>
        ←
      </Button>
      <Button
        variant="ghost"
        title="Next day"
        onClick={() => !isToday && onChange(addDays(day, 1))}
      >
        <span className={isToday ? 'text-ink-4/40' : undefined}>→</span>
      </Button>
      {!isToday && (
        <Button variant="ghost" onClick={() => onChange(today)}>
          Today
        </Button>
      )}
    </div>
  );
}

export function DayLabel({ day }: { day: Date }) {
  return <span>{relativeDay(day)}</span>;
}
