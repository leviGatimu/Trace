"use client";

import { motion } from "framer-motion";
import {
  Database,
  Eye,
  Layers,
  MonitorCog,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/*  Pieces                                                            */
/* ------------------------------------------------------------------ */

/** A downward connector: line, an optional label, line, arrowhead. */
function Connector({ label, sub }: { label?: ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col items-center text-slate-300 dark:text-slate-600" aria-hidden="true">
      <span className="h-7 w-px bg-current" />
      {label && (
        <span className="my-2.5 flex flex-col items-center gap-1 text-center">
          <span className="data rounded-full border border-black/[0.08] bg-black/[0.03] px-3.5 py-1.5 text-[12px] text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300">
            {label}
          </span>
          {sub && (
            <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
              {sub}
            </span>
          )}
        </span>
      )}
      <span className="h-7 w-px bg-current" />
      <span className="h-0 w-0 border-x-[5px] border-x-transparent border-t-[7px] border-t-current" />
    </div>
  );
}

/** One stage in the tracker's internal pipeline. */
function Stage({
  label,
  icon: Icon,
  tone = "plain",
  note,
}: {
  label: string;
  icon?: LucideIcon;
  tone?: "plain" | "accent" | "solid";
  note?: string;
}) {
  const tones = {
    plain:
      "border-black/[0.08] bg-white text-slate-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200",
    accent: "border-accent-600 bg-accent-600 text-white shadow-[0_10px_24px_-10px_rgba(52,92,226,0.8)]",
    solid: "border-ink-900 bg-ink-900 text-white dark:border-white/15 dark:bg-white/[0.12]",
  };

  return (
    <span className="flex flex-col items-center gap-1.5">
      <span
        className={`data inline-flex items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-[13px] font-medium ${tones[tone]}`}
      >
        {Icon && <Icon size={14} className="flex-shrink-0" />}
        {label}
      </span>
      {note && (
        <span className="max-w-[9rem] text-center text-[11px] leading-snug text-slate-400 dark:text-slate-500">
          {note}
        </span>
      )}
    </span>
  );
}

/** The arrow between two pipeline stages — sideways on wide screens, down on narrow. */
function StageArrow() {
  return (
    <span
      /* Stacked: centred under the stage above. In a row: level with the pills,
         which sit at the top of each stage because some carry a note beneath. */
      className="flex flex-shrink-0 items-center justify-center self-center text-slate-300 dark:text-slate-600 lg:self-start lg:pt-4"
      aria-hidden="true"
    >
      {/* narrow: a downward chevron. wide: a rightward one. */}
      <span className="h-0 w-0 border-x-[5px] border-x-transparent border-t-[7px] border-t-current lg:hidden" />
      <span className="hidden h-0 w-0 border-y-[5px] border-y-transparent border-l-[7px] border-l-current lg:block" />
    </span>
  );
}

/** A process — the two boxes the whole design turns on. */
function Process({
  name,
  role,
  badge,
  children,
}: {
  name: string;
  role: string;
  badge?: string;
  children?: ReactNode;
}) {
  return (
    <div className="w-full rounded-[1.5rem] border border-black/[0.08] bg-white p-6 shadow-[0_20px_44px_-32px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-white/[0.04] md:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h3 className="data text-lg font-semibold text-slate-900 dark:text-slate-50">{name}</h3>
        <p className="text-[13px] text-slate-500 dark:text-slate-400">{role}</p>
      </div>
      {badge && (
        <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent-600/[0.1] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-accent-600 dark:text-accent-400">
          {badge}
        </span>
      )}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The two-process architecture, drawn rather than typed. This was an ASCII
 * diagram lifted from the README, which reads as a terminal artifact and breaks
 * apart on a narrow screen — the box-drawing characters need a monospaced grid
 * the page does not have.
 */
export default function ArchitectureDiagram() {
  return (
    <figure className="mx-auto w-full max-w-3xl">
      <p className="sr-only">
        Windows APIs report the foreground application, idle time, lock and sleep to
        TraceTracker.exe, a background process that owns the tray. Inside it, watchers feed a
        queue, which feeds the session engine, which can only reach the SQLite database through
        PrivacyGate. TraceTracker.exe then serves the dashboard, Trace.exe, over a named pipe with
        a per-user access control list.
      </p>

      <div aria-hidden="true" className="flex flex-col items-center">
        {/* Source */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-3 text-center"
        >
          <span className="inline-flex items-center gap-2.5 rounded-xl border border-dashed border-black/15 px-4 py-2.5 text-[15px] font-medium text-slate-600 dark:border-white/15 dark:text-slate-300">
            <MonitorCog size={16} className="text-slate-400 dark:text-slate-500" />
            Windows APIs
          </span>
          <span className="flex flex-wrap justify-center gap-1.5">
            {["foreground", "idle", "lock", "sleep"].map((signal) => (
              <span
                key={signal}
                className="data rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] text-slate-500 dark:bg-white/[0.06] dark:text-slate-400"
              >
                {signal}
              </span>
            ))}
          </span>
        </motion.div>

        <Connector />

        {/* The tracker */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full"
        >
          <Process
            name="TraceTracker.exe"
            role="C# · Win32 · SQLite"
            badge="Background · owns the tray"
          >
            <div className="mt-7 flex flex-col items-center gap-3 border-t border-black/[0.06] pt-7 dark:border-white/10 lg:flex-row lg:justify-between lg:gap-2">
              <Stage label="watchers" icon={Eye} />
              <StageArrow />
              <Stage label="queue" icon={Layers} />
              <StageArrow />
              <Stage label="engine" />
              <StageArrow />
              <Stage
                label="PrivacyGate"
                icon={ShieldCheck}
                tone="accent"
                note="the only route to storage"
              />
              <StageArrow />
              <Stage label="SQLite" icon={Database} tone="solid" />
            </div>
          </Process>
        </motion.div>

        <Connector label={<>{"\\\\.\\pipe\\Trace."}&lt;SID&gt;</>} sub="per-user DACL · NDJSON" />

        {/* The dashboard */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full"
        >
          <Process
            name="Trace.exe"
            role="Electron · React · TypeScript"
            badge="The window — optional"
          />
        </motion.div>
      </div>

      <figcaption className="mt-8 text-center text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
        Recording continues whether or not the window is open, because the window was never doing
        the recording.
      </figcaption>
    </figure>
  );
}
