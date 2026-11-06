"use client";

import { motion } from "framer-motion";
import { useState } from "react";

export interface Segment {
  /** Application name. */
  app: string;
  /** Minutes from local midnight. */
  from: number;
  to: number;
  /** One of the eight hues Trace hashes application names onto. */
  color: string;
  /** Idle and locked stretches are drawn as gaps, not as activity. */
  gap?: boolean;
}

const m = (h: number, min = 0) => h * 60 + min;

/**
 * A believable day, hand-written rather than generated, so the server and the
 * browser render exactly the same ribbon and the shape stays deliberate.
 */
export const SAMPLE_DAY: Segment[] = [
  { app: "Google Chrome", from: m(8, 55), to: m(9, 20), color: "#5fb3a1" },
  { app: "Visual Studio Code", from: m(9, 20), to: m(10, 5), color: "#6e9bff" },
  { app: "Google Chrome", from: m(10, 5), to: m(10, 35), color: "#5fb3a1" },
  { app: "Idle", from: m(10, 35), to: m(10, 50), color: "transparent", gap: true },
  { app: "Slack", from: m(10, 50), to: m(11, 10), color: "#c77dbb" },
  { app: "Visual Studio Code", from: m(11, 10), to: m(12, 40), color: "#6e9bff" },
  { app: "Locked", from: m(12, 40), to: m(13, 25), color: "transparent", gap: true },
  { app: "Microsoft Outlook", from: m(13, 25), to: m(13, 45), color: "#e0736b" },
  { app: "Visual Studio Code", from: m(13, 45), to: m(15, 10), color: "#6e9bff" },
  { app: "Google Chrome", from: m(15, 10), to: m(15, 50), color: "#5fb3a1" },
  { app: "Windows Terminal", from: m(15, 50), to: m(16, 15), color: "#7fb069" },
  { app: "Visual Studio Code", from: m(16, 15), to: m(17, 30), color: "#6e9bff" },
  { app: "Spotify", from: m(17, 30), to: m(17, 45), color: "#e0a458" },
  { app: "Locked", from: m(17, 45), to: m(19, 40), color: "transparent", gap: true },
  { app: "Google Chrome", from: m(19, 40), to: m(20, 30), color: "#5fb3a1" },
  { app: "Adobe Illustrator", from: m(20, 30), to: m(21, 15), color: "#8c8fe0" },
  { app: "Google Chrome", from: m(21, 15), to: m(21, 50), color: "#5fb3a1" },
  { app: "Visual Studio Code", from: m(21, 50), to: m(23, 5), color: "#6e9bff" },
];

const DAY_MINUTES = 24 * 60;
const pct = (minutes: number) => (minutes / DAY_MINUTES) * 100;

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const duration = (minutes: number) =>
  minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;

/**
 * The signature: twenty-four hours as one continuous band, each session a
 * segment in its application's colour, gaps left as gaps. A chart of hourly
 * totals answers *how much*; the ribbon answers *when*.
 */
export default function DayRibbon({
  segments = SAMPLE_DAY,
  height = 56,
  axis = true,
  interactive = true,
  className = "",
}: {
  segments?: Segment[];
  height?: number;
  axis?: boolean;
  interactive?: boolean;
  className?: string;
}) {
  const [active, setActive] = useState<Segment | null>(null);

  return (
    <div className={className}>
      <div
        className="relative w-full overflow-hidden rounded-lg bg-black/[0.05] dark:bg-white/[0.04]"
        style={{ height }}
        onMouseLeave={() => setActive(null)}
      >
        {/* Hour gridlines — the band is a chart recorder's paper, not a progress bar. */}
        <div className="absolute inset-0 flex" aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} className="flex-1 border-r border-black/[0.06] last:border-r-0 dark:border-white/[0.05]" />
          ))}
        </div>

        {segments
          .filter((s) => !s.gap)
          .map((s, i) => (
            <motion.button
              key={`${s.app}-${s.from}`}
              type="button"
              tabIndex={interactive ? 0 : -1}
              aria-label={`${s.app}, ${clock(s.from)} to ${clock(s.to)}`}
              onMouseEnter={() => interactive && setActive(s)}
              onFocus={() => interactive && setActive(s)}
              initial={{ scaleY: 0.15, opacity: 0 }}
              whileInView={{ scaleY: 1, opacity: 1 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.025, ease: [0.21, 0.5, 0.3, 1] }}
              className="absolute inset-y-0 origin-bottom transition-[filter,opacity] hover:brightness-125 focus-visible:outline-none focus-visible:brightness-125"
              style={{
                left: `${pct(s.from)}%`,
                width: `${pct(s.to - s.from)}%`,
                background: s.color,
                opacity: active && active !== s ? 0.45 : 1,
              }}
            />
          ))}
      </div>

      {axis && (
        <div className="data mt-2 flex justify-between text-[11px] text-slate-400 dark:text-slate-500" aria-hidden="true">
          {["00", "04", "08", "12", "16", "20", "24"].map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>
      )}

      {interactive && (
        <p className="data mt-3 h-5 text-[13px] text-slate-500 dark:text-slate-400">
          {active ? (
            <>
              <span
                className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: active.color }}
              />
              <span className="font-sans font-medium text-slate-800 dark:text-slate-100">{active.app}</span>
              {"  "}
              {clock(active.from)}–{clock(active.to)} · {duration(active.to - active.from)}
            </>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">Hover a segment to read it</span>
          )}
        </p>
      )}
    </div>
  );
}
