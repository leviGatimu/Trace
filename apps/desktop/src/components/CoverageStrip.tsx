import type { CoverageKind, CoverageSegment, DayRange, TimelineEntry } from '@trace/contracts';
import { coverageLabel } from '@/components/Evidence';
import { appColor } from '@/lib/appColor';
import { clockTime, duration } from '@/lib/format';

/**
 * The day on one axis: which application was in front (upper lane), and how
 * much of the day Trace can speak for at all (lower lane).
 *
 * The lower lane uses the evidence marks: solid where Trace recorded, ruled
 * where Windows says the PC was off or asleep, amber hatch where the record is
 * missing and the reason is inferred, dots where nothing is known. A quiet
 * stretch and an unrecorded stretch can never look the same here.
 */
export function CoverageStrip({
  range,
  entries,
  segments,
  selectedAt,
  onSelect,
  compact = false,
}: {
  range: DayRange;
  entries: TimelineEntry[];
  segments: CoverageSegment[];
  selectedAt?: number | null;
  onSelect?: (atUtcMs: number) => void;
  compact?: boolean;
}) {
  const span = range.toUtcMs - range.fromUtcMs;
  const now = Date.now();
  const place = (start: number, end: number | null) => {
    const from = Math.max(start, range.fromUtcMs);
    const to = Math.min(end ?? now, range.toUtcMs);
    return {
      left: `${((from - range.fromUtcMs) / span) * 100}%`,
      // A floor, so a one-minute span is still a visible sliver.
      width: `max(1.5px, ${(Math.max(0, to - from) / span) * 100}%)`,
    };
  };

  const pick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onSelect) {
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - box.left) / box.width;
    onSelect(range.fromUtcMs + Math.max(0, Math.min(1, fraction)) * span);
  };

  const sessions = entries.filter((entry): entry is Extract<TimelineEntry, { kind: 'session' }> => entry.kind === 'session');

  return (
    <div className="select-none">
      <div
        className={`relative overflow-hidden rounded-[4px] bg-sunken ${onSelect ? 'cursor-crosshair' : ''}`}
        onClick={pick}
        role={onSelect ? 'presentation' : undefined}
      >
        {/* Applications */}
        <div className={`relative ${compact ? 'h-4' : 'h-7'}`}>
          {sessions.map((entry) => (
            <span
              key={entry.sessionId}
              className="absolute inset-y-[3px] rounded-[1px]"
              style={{ ...place(entry.startedAt, entry.endedAt), background: appColor(entry.applicationName) }}
              title={`${entry.applicationName} · ${clockTime(entry.startedAt)} · ${duration(entry.activeSeconds)}`}
            />
          ))}
        </div>

        {/* Coverage */}
        <div className={`relative border-t border-canvas ${compact ? 'h-2' : 'h-3'}`}>
          {segments.map((segment) => (
            <span
              key={`${segment.kind}-${segment.startedAt}`}
              className={`absolute inset-y-0 ${markFor(segment.kind)}`}
              style={place(segment.startedAt, segment.endedAt)}
              title={`${coverageLabel[segment.kind]} · ${clockTime(segment.startedAt)}`}
            />
          ))}
        </div>

        {selectedAt != null && selectedAt >= range.fromUtcMs && selectedAt < range.toUtcMs && (
          <span
            className="pointer-events-none absolute inset-y-0 w-px bg-ink"
            style={{ left: `${((selectedAt - range.fromUtcMs) / span) * 100}%` }}
          />
        )}
      </div>

      {!compact && (
        <div className="data relative mt-1.5 h-4 text-[11px] text-ink-4">
          {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => (
            <span key={hour} className="absolute -translate-x-0" style={{ left: `${(hour / 24) * 100}%` }}>
              {String(hour).padStart(2, '0')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Which evidence mark a coverage kind is drawn with. */
export function markFor(kind: CoverageKind): string {
  switch (kind) {
    case 'recorded':
      return 'ev-observed';
    case 'locked':
    case 'paused':
      return 'bg-observed/35';
    case 'asleep':
    case 'powered-off':
    case 'signed-out':
      return 'ev-dormant';
    case 'trace-stopped':
    case 'unrecorded-window':
      return 'ev-inferred';
    default:
      return 'ev-unknown';
  }
}

/** The key to the strip, shown once per screen that uses it. */
export function CoverageLegend() {
  const items: { mark: string; label: string }[] = [
    { mark: 'ev-observed', label: 'Recorded' },
    { mark: 'bg-observed/35', label: 'Locked or paused' },
    { mark: 'ev-dormant', label: 'Off, asleep or signed out (Windows)' },
    { mark: 'ev-inferred', label: 'No record, reason inferred' },
    { mark: 'ev-unknown', label: 'Unknown' },
  ];

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-4">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-4 rounded-[2px] ${item.mark}`} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
