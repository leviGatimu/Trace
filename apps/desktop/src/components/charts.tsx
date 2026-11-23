import { useEffect, useState } from 'react';
import { duration, hourLabel } from '@/lib/format';

/** Foreground time per hour, as rounded blue bars with a value on hover. */
export function HourBars({
  hours,
  height = 210,
}: {
  hours: { hour: number; seconds: number }[];
  height?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const peak = Math.max(...hours.map((hour) => hour.seconds), 60);
  const scale = niceScale(peak);

  return (
    <div className="flex gap-3">
      <div className="flex flex-col justify-between pb-6 text-right text-[11px] text-ink-4" style={{ height }}>
        {[...scale].reverse().map((tick) => (
          <span key={tick}>{tick === 0 ? '0' : duration(tick)}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative flex items-end gap-[5px] border-b border-dashed border-hair-strong" style={{ height: height - 24 }}>
          {scale.slice(1).map((tick) => (
            <span
              key={tick}
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-hair"
              style={{ bottom: `${(tick / scale[scale.length - 1]!) * 100}%` }}
            />
          ))}
          {hours.map((hour) => {
            const fraction = hour.seconds / scale[scale.length - 1]!;
            return (
              <div
                key={hour.hour}
                className="relative flex h-full flex-1 items-end"
                onMouseEnter={() => setHovered(hour.hour)}
                onMouseLeave={() => setHovered(null)}
              >
                {hovered === hour.hour && hour.seconds > 0 && (
                  <span
                    className="absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-[7px] bg-[#0b0b0c] px-2 py-1 text-[11px] text-ink shadow-lg"
                    style={{ bottom: `calc(${fraction * 100}% + 8px)` }}
                  >
                    {hourLabel(hour.hour)} · {duration(hour.seconds)}
                  </span>
                )}
                <span
                  className={`grow w-full rounded-t-[7px] transition-colors ${hovered === hour.hour ? 'bg-[#86a8ff]' : 'bg-chart'}`}
                  style={{ height: `${Math.max(hour.seconds > 0 ? 2 : 0, fraction * 100)}%`, '--i': hour.hour } as React.CSSProperties}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-ink-4">
          {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => (
            <span key={hour}>{hourLabel(hour)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Round tick values for the y axis: 0 and four steps that cover the peak. */
function niceScale(peakSeconds: number): number[] {
  const steps = [60, 300, 600, 900, 1200, 1800, 2700, 3600];
  const step = steps.find((candidate) => candidate * 4 >= peakSeconds) ?? 3600;
  return [0, step, step * 2, step * 3, step * 4];
}

/** A donut of shares with a gap between slices, and the total in the middle. */
export function Donut({
  slices,
  size = 170,
  centre,
}: {
  slices: { label: string; value: number; color: string }[];
  size?: number;
  centre?: { value: string; label: string };
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  const stroke = 26;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = slices.length > 1 ? 3 : 0;
  // Slices sweep round from nothing the first time the donut appears.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Share of time by application">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {slices.map((slice) => {
          const length = (slice.value / total) * circumference;
          const dash = drawn ? Math.max(0, length - gap) : 0;
          const element = (
            <circle
              key={slice.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              style={{ transition: 'stroke-dasharray 1100ms cubic-bezier(0.22,1,0.36,1)' }}
            />
          );
          offset += length;
          return element;
        })}
      </g>
      {centre && (
        <>
          <text x="50%" y="47%" textAnchor="middle" className="fill-ink" style={{ fontSize: 22, fontWeight: 500 }}>
            {centre.value}
          </text>
          <text x="50%" y="60%" textAnchor="middle" className="fill-ink-3" style={{ fontSize: 11.5 }}>
            {centre.label}
          </text>
        </>
      )}
    </svg>
  );
}
