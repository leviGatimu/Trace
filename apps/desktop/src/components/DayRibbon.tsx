import type { DayRange, TimelineEntry } from '@trace/contracts';
import { appColor } from '@/lib/appColor';
import { clockTime, duration } from '@/lib/format';

/**
 * The day, as one continuous band.
 *
 * This is the idea the product is built on made visible: a recorder's trace.
 * Twenty-four hours run left to right, and every session is a segment placed
 * where it actually happened, in its application's colour. Gaps are real —
 * they are the time nothing was recorded, and showing them honestly is the
 * whole point of a product that refuses to invent activity.
 *
 * Deliberately not a bar chart of hourly totals. A chart answers "how much";
 * this answers "when", which is the question someone looking back at their day
 * is actually asking.
 */
export function DayRibbon({
  entries,
  range,
  nowUtcMs,
}: {
  entries: TimelineEntry[];
  range: DayRange;
  nowUtcMs: number;
}) {
  const span = range.toUtcMs - range.fromUtcMs;

  const segments = entries
    .filter((entry): entry is Extract<TimelineEntry, { kind: 'session' }> => entry.kind === 'session')
    .map((entry) => {
      const start = Math.max(entry.startedAt, range.fromUtcMs);
      const end = Math.min(entry.endedAt ?? nowUtcMs, range.toUtcMs);

      return {
        key: entry.sessionId,
        name: entry.applicationName,
        colour: appColor(entry.executable),
        left: ((start - range.fromUtcMs) / span) * 100,
        // A floor of 0.22%, or a two-minute session would be sub-pixel and
        // vanish. Better slightly wide than silently absent.
        width: Math.max(((end - start) / span) * 100, 0.22),
        title: `${entry.applicationName} · ${clockTime(entry.startedAt)} · ${duration(entry.activeSeconds)}`,
      };
    });

  const systemSpans = entries
    .filter((entry): entry is Extract<TimelineEntry, { kind: 'system' }> => entry.kind === 'system')
    .map((entry, index) => {
      const start = Math.max(entry.startedAt, range.fromUtcMs);
      const end = Math.min(entry.endedAt ?? nowUtcMs, range.toUtcMs);

      return {
        key: `${entry.interval}-${index}`,
        left: ((start - range.fromUtcMs) / span) * 100,
        width: Math.max(((end - start) / span) * 100, 0.15),
        label: entry.interval.toLowerCase(),
      };
    });

  const nowFraction =
    nowUtcMs > range.fromUtcMs && nowUtcMs < range.toUtcMs
      ? ((nowUtcMs - range.fromUtcMs) / span) * 100
      : null;

  return (
    <div className="mb-9">
      <div className="relative h-11 w-full overflow-hidden rounded-sm bg-sunken">
        {/* Hour divisions, sunk beneath the segments so they read as a grid
            behind the record rather than as part of it. */}
        {Array.from({ length: 23 }, (_, index) => (
          <span
            key={index}
            className="absolute top-0 h-full w-px bg-white/4"
            style={{ left: `${((index + 1) / 24) * 100}%` }}
            aria-hidden
          />
        ))}

        {/* Locked, asleep and paused stretches: hatched, not coloured. They are
            an absence of activity, and should not look like activity. */}
        {systemSpans.map((span_) => (
          <span
            key={span_.key}
            className="absolute inset-y-0"
            style={{
              left: `${span_.left}%`,
              width: `${span_.width}%`,
              backgroundImage:
                'repeating-linear-gradient(135deg, rgb(255 255 255 / 5%) 0 2px, transparent 2px 6px)',
            }}
            title={span_.label}
            aria-hidden
          />
        ))}

        {segments.map((segment) => (
          <span
            key={segment.key}
            className="absolute inset-y-0 transition-opacity duration-150 hover:opacity-100"
            style={{
              left: `${segment.left}%`,
              width: `${segment.width}%`,
              background: segment.colour,
              opacity: 0.82,
            }}
            title={segment.title}
          />
        ))}

        {nowFraction !== null && (
          <span
            className="absolute inset-y-0 w-px bg-ink"
            style={{ left: `${nowFraction}%` }}
            title="Now"
            aria-hidden
          />
        )}
      </div>

      <div className="data mt-2 flex justify-between text-ink-4">
        {['00', '04', '08', '12', '16', '20', '24'].map((hour) => (
          <span key={hour}>{hour}</span>
        ))}
      </div>
    </div>
  );
}
