import type { Metadata } from "next";
import { Bug, CircleDashed, Github, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";
import ScrollReveal from "@/components/ScrollReveal";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Changelog",
  description: `What has changed in Trace, release by release. Currently on v${site.version}.`,
};

type Kind = "new" | "fix" | "wip";

const kinds: Record<Kind, { label: string; dot: string; badge: string }> = {
  new: { label: "New", dot: "bg-app-3", badge: "bg-app-3/15 text-app-3" },
  fix: { label: "Fix", dot: "bg-accent-500", badge: "bg-accent-500/15 text-accent-600 dark:text-accent-400" },
  wip: { label: "In progress", dot: "bg-app-2", badge: "bg-app-2/15 text-app-2" },
};

const releases: {
  version: string;
  date: string;
  headline: string;
  summary: string;
  current?: boolean;
  entries: { kind: Kind; text: string }[];
}[] = [
  {
    version: "Unreleased",
    date: "In development",
    headline: "Hardening, and the first of V2",
    summary:
      "Work since the first build. These are in the repository and will land in the next release.",
    entries: [
      { kind: "new", text: "Analytics across a week, a month and a year — computed locally, from the same database." },
      { kind: "new", text: "A calendar for navigating to a date instead of scrolling to it, and a timeline whose sessions can be linked to directly." },
      { kind: "fix", text: "An application's “today” was UTC's today rather than yours. Days are now bounded by your local midnight." },
      { kind: "fix", text: "A corrupt database no longer stops Trace from starting: the damaged file is moved aside and a fresh one is created." },
      { kind: "wip", text: "Long soak, sleep/wake cycles, very large histories, and two Windows accounts on one machine." },
    ],
  },
  {
    version: "0.1.0",
    date: "10 August 2026",
    headline: "First public build",
    summary:
      "The whole product, end to end: a background tracker that records sessions, a dashboard that reads them, and privacy controls that are structural rather than cosmetic.",
    current: true,
    entries: [
      { kind: "new", text: "Session engine: foreground application and window, real start and end times, idle detection, lock/unlock, sleep/wake, and recovery from crashes and power loss." },
      { kind: "new", text: "Overview with the day ribbon, a readable timeline, per-application detail, and search across every recorded window title." },
      { kind: "new", text: "Privacy centre: pause, per-application exclusions, a window-title switch, retention, JSON export, and deletion by range or in full." },
      { kind: "new", text: "PrivacyGate — the only route from the engine to storage, so an exclusion filters before anything is written." },
      { kind: "new", text: "Named-pipe IPC with a per-user DACL, replacing what would otherwise have been a locally reachable HTTP port." },
      { kind: "new", text: "A logo generated from code, a tray icon owned by the tracker, and a per-user NSIS installer with no administrator prompt." },
      { kind: "new", text: "Flat, typographic redesign built around the day ribbon, plus a clock-format setting." },
      { kind: "fix", text: "“Open Trace” failed when the tracker was running from outside an install." },
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="relative">
      <div className="grain" />

      {/* Hero */}
      <section className="px-6 pb-12 pt-40">
        <div className="mx-auto max-w-4xl">
          <ScrollReveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-accent-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-accent-400">
              <Sparkles size={13} /> Changelog
            </span>
            <h1 className="mt-6 font-display text-5xl font-semibold leading-[0.92] tracking-tight text-slate-900 dark:text-slate-50 md:text-7xl">
              What&rsquo;s <span className="text-accent-600 dark:text-accent-400">changed.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-relaxed text-slate-500 dark:text-slate-400">
              Every release, with the fixes named rather than hidden behind &ldquo;various
              improvements&rdquo;.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Releases */}
      <section className="px-6 pb-24">
        <div className="mx-auto max-w-4xl">
          {releases.map((release, i) => (
            <ScrollReveal key={release.version} delay={i * 0.05}>
              <article className="relative border-t border-black/[0.08] py-12 first:border-t-0 dark:border-white/10">
                <div className="grid gap-8 md:grid-cols-[10rem_minmax(0,1fr)]">
                  <div>
                    <p className="data font-display text-2xl font-semibold text-slate-900 dark:text-slate-50">
                      {release.version}
                    </p>
                    <p className="data mt-1 text-[13px] text-slate-400 dark:text-slate-500">
                      {release.date}
                    </p>
                    {release.current && (
                      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-app-3/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-app-3">
                        Current
                      </span>
                    )}
                  </div>

                  <div>
                    <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                      {release.headline}
                    </h2>
                    <p className="mt-3 leading-relaxed text-slate-500 dark:text-slate-400">
                      {release.summary}
                    </p>

                    <ul className="mt-7 space-y-4">
                      {release.entries.map((entry) => (
                        <li key={entry.text} className="flex gap-4">
                          <span
                            className={`mt-1 inline-flex h-5 flex-shrink-0 items-center rounded-full px-2 text-[10px] font-bold uppercase tracking-[0.12em] ${kinds[entry.kind].badge}`}
                          >
                            {kinds[entry.kind].label}
                          </span>
                          <span className="leading-relaxed text-slate-600 dark:text-slate-300">
                            {entry.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            </ScrollReveal>
          ))}

          <ScrollReveal className="mt-6 flex flex-wrap items-center gap-4 border-t border-black/[0.08] pt-10 dark:border-white/10">
            <a
              href={`${site.github}/commits`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-black/10 px-8 py-4 font-semibold text-slate-900 transition-colors hover:bg-black/[0.03] dark:border-white/15 dark:text-slate-50 dark:hover:bg-white/[0.06]"
            >
              <Github size={18} /> Every commit
            </a>
            <Link
              href="/download#roadmap"
              className="inline-flex items-center gap-2 rounded-2xl bg-accent-600 px-8 py-4 font-semibold text-white transition-colors hover:bg-accent-500"
            >
              <CircleDashed size={18} /> What&rsquo;s next
            </Link>
            <p className="flex items-center gap-2 text-[15px] text-slate-500 dark:text-slate-400">
              <Wrench size={15} /> Found something broken? <Bug size={15} />
              <a
                href={`${site.github}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-accent-600 underline-offset-4 hover:underline dark:text-accent-400"
              >
                Report it
              </a>
            </p>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
