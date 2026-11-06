import type { Metadata } from "next";
import {
  Activity,
  Apple,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleDashed,
  Clock,
  Download,
  Github,
  HardDrive,
  Monitor,
  Package,
  ShieldCheck,
  Terminal,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import ScrollReveal from "@/components/ScrollReveal";
import { installer, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Download",
  description: `Download Trace ${site.version} for Windows — a per-user install with no administrator prompt. Free, offline and private.`,
};

const blobRadii = [
  "42% 58% 63% 37% / 41% 44% 56% 59%",
  "63% 37% 47% 53% / 38% 63% 37% 62%",
  "39% 61% 38% 62% / 58% 39% 61% 42%",
  "58% 42% 64% 36% / 49% 56% 44% 51%",
];

const platforms = [
  {
    name: "Windows",
    sub: "Windows 10 1809 or later · 64-bit",
    type: `.exe installer · ${installer.size}`,
    icon: <Monitor size={24} />,
    chip: "bg-accent-600",
    blob: "bg-accent-200 dark:bg-accent-500/25",
    href: installer.href,
    cta: "Download",
    state: "available" as const,
  },
  {
    name: "From source",
    sub: ".NET 10 SDK + Node 20.19",
    type: "npm run installer",
    icon: <Terminal size={24} />,
    chip: "bg-ink-900",
    blob: "bg-slate-300/60 dark:bg-white/10",
    href: `${site.github}#build-from-source`,
    cta: "Build it yourself",
    state: "external" as const,
  },
  {
    name: "Portable",
    sub: "Windows · no install",
    type: ".zip archive",
    icon: <Package size={24} />,
    chip: "bg-app-2",
    blob: "bg-app-2/30 dark:bg-app-2/20",
    href: "#roadmap",
    cta: "Planned",
    state: "planned" as const,
  },
  {
    name: "macOS & Linux",
    sub: "Not planned",
    type: "Win32-only by design",
    icon: <Apple size={24} />,
    chip: "bg-app-5",
    blob: "bg-app-5/25 dark:bg-app-5/15",
    href: "#platforms-note",
    cta: "Why not",
    state: "unplanned" as const,
  },
];

const steps = [
  {
    icon: <Download size={18} />,
    t: "Run the installer",
    d: "It installs under your own account, so Windows never asks for an administrator. Nothing is written outside your profile.",
  },
  {
    icon: <ShieldCheck size={18} />,
    t: "Read the consent screen",
    d: "On first launch Trace tells you exactly what it records and what it cannot record, and waits for you to agree before writing anything.",
  },
  {
    icon: <Activity size={18} />,
    t: "Then forget about it",
    d: "The tracker starts with Windows and lives in the tray. Come back in a week and the history is already there.",
  },
];

const requirements = [
  { icon: <Monitor size={18} />, t: "Windows 10 1809 or later", d: "64-bit" },
  { icon: <HardDrive size={18} />, t: "~500 MB free disk", d: "the application, plus your history" },
  { icon: <WifiOff size={18} />, t: "No internet required", d: "there is no network code to use one" },
  { icon: <ShieldCheck size={18} />, t: "No administrator prompt", d: "per-user install, per-user data" },
];

const paths = [
  { label: "Application", value: "%LOCALAPPDATA%\\Programs\\Trace" },
  { label: "Your history", value: "%LOCALAPPDATA%\\Trace\\Data\\activity.db" },
];

const roadmap = [
  {
    status: "Shipped",
    dot: "bg-app-3",
    badge: "bg-app-3/15 text-app-3",
    icon: <Check size={15} className="text-app-3" />,
    items: [
      "Session engine with idle, lock, sleep and crash recovery",
      "Overview, Timeline, Applications and Search",
      "Calendar and analytics across a week, month and year",
      "Privacy centre: pause, exclusions, retention, export, delete",
      "Per-user installer, tray icon and start with Windows",
    ],
  },
  {
    status: "In progress",
    dot: "bg-accent-500",
    badge: "bg-accent-500/15 text-accent-600 dark:text-accent-400",
    icon: <CircleDashed size={15} className="text-accent-500" />,
    items: [
      "Long soak, sleep/wake cycles and very large histories",
      "Two Windows accounts on one machine",
      "Polish pass across every empty and error state",
    ],
  },
  {
    status: "Planned",
    dot: "bg-app-2",
    badge: "bg-app-2/15 text-app-2",
    icon: <Clock size={15} className="text-app-2" />,
    items: [
      "Categories and rules for grouping applications",
      "Notes against a day or a session",
      "Exportable reports",
      "A portable, no-install build",
    ],
  },
];

export default function DownloadPage() {
  return (
    <div className="relative">
      <div className="grain" />

      {/* Hero */}
      <section className="px-6 pb-12 pt-40">
        <div className="mx-auto max-w-3xl text-center">
          <ScrollReveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-accent-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-accent-400">
              <Download size={13} /> Download · v{site.version}
            </span>
            <h1 className="mt-6 font-display text-6xl font-semibold leading-[0.9] tracking-tight text-slate-900 dark:text-slate-50 md:text-8xl">
              Get <span className="text-accent-600 dark:text-accent-400">Trace.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-xl leading-relaxed text-slate-500 dark:text-slate-400">
              Free, offline and entirely private. Install it once and your machine starts keeping a
              history you own.
            </p>
            <div className="mt-9 flex flex-col items-center gap-4">
              <a
                href={installer.href}
                download
                className="group relative inline-flex items-center gap-3 overflow-hidden rounded-2xl bg-ink-900 px-12 py-5 text-lg font-semibold text-white shadow-[0_24px_50px_-16px_rgba(0,0,0,0.6)] transition-transform hover:scale-[1.02] active:scale-95 dark:bg-white dark:text-ink-900"
              >
                <Download size={20} />
                <span className="relative z-10">Download for Windows</span>
                <span className="absolute bottom-0 right-0 h-0 w-0 border-b-[34px] border-l-[34px] border-b-accent-500 border-l-transparent" />
              </a>
              <p className="data text-[13px] text-slate-500 dark:text-slate-400">
                {installer.file} · {installer.size} · no administrator prompt
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Platforms */}
      <section className="px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <ScrollReveal className="mb-10">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 md:text-4xl">
              Ways to get it
            </h2>
          </ScrollReveal>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {platforms.map((p, i) => {
              const isLink = p.state === "available" || p.state === "external";
              return (
                <ScrollReveal key={p.name} delay={(i % 4) * 0.06}>
                  <div
                    className={`relative flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-black/[0.06] bg-white p-7 shadow-[0_28px_60px_-34px_rgba(15,23,42,0.3)] dark:border-white/10 dark:bg-white/[0.04] ${
                      isLink ? "" : "opacity-90"
                    }`}
                  >
                    <div
                      className={`absolute -right-7 -top-9 h-36 w-36 ${p.blob} opacity-60`}
                      style={{ borderRadius: blobRadii[i % blobRadii.length] }}
                    />
                    <div className="relative flex h-full flex-col">
                      <div
                        className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl ${p.chip} text-white shadow-[0_14px_30px_-12px_rgba(15,23,42,0.55)]`}
                      >
                        {p.icon}
                      </div>
                      <h3 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                        {p.name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{p.sub}</p>
                      <p className="data mt-1.5 flex-grow text-[12px] text-slate-400 dark:text-slate-500">
                        {p.type}
                      </p>

                      {p.state === "available" && (
                        <a
                          href={p.href}
                          download
                          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-600 py-3.5 font-semibold text-white transition-colors hover:bg-accent-500"
                        >
                          <Download size={16} />
                          {p.cta}
                        </a>
                      )}
                      {p.state === "external" && (
                        <a
                          href={p.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-black/10 py-3.5 font-semibold text-slate-900 transition-colors hover:bg-black/[0.03] dark:border-white/15 dark:text-slate-50 dark:hover:bg-white/[0.06]"
                        >
                          <Github size={16} />
                          {p.cta}
                        </a>
                      )}
                      {(p.state === "planned" || p.state === "unplanned") && (
                        <a
                          href={p.href}
                          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-black/[0.06] bg-black/[0.04] py-3.5 font-semibold text-slate-400 transition-colors hover:text-slate-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-500 dark:hover:text-slate-300"
                        >
                          {p.cta}
                        </a>
                      )}
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>

          <div id="platforms-note" className="scroll-mt-28" />
          <ScrollReveal className="mt-8">
            <p className="max-w-3xl text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
              <strong className="font-semibold text-slate-700 dark:text-slate-200">
                Why Windows only.
              </strong>{" "}
              Trace reads the foreground window, idle time and session lock state directly from
              Win32. Those are not portable APIs, and a cross-platform port would be a different
              tracker wearing the same interface — so rather than ship a worse version of the
              product on two more platforms, it stays a Windows tool.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* After install + requirements */}
      <section className="px-6 py-16 lg:py-24">
        <div className="mx-auto grid max-w-7xl items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <ScrollReveal direction="right">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-600 dark:text-accent-400">
              After you install
            </span>
            <h2 className="mb-9 mt-4 font-display text-4xl font-semibold leading-[1] tracking-tight text-slate-900 dark:text-slate-50 md:text-5xl">
              Three steps, and <span className="text-accent-600 dark:text-accent-400">one of them is waiting.</span>
            </h2>
            <div className="space-y-7">
              {steps.map((s, i) => (
                <div key={s.t} className="flex gap-5">
                  <span className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-ink-900 text-white dark:bg-white dark:text-ink-900">
                    {s.icon}
                    <span className="data absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent-600 text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                  </span>
                  <div className="pt-0.5">
                    <h3 className="mb-1 font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
                      {s.t}
                    </h3>
                    <p className="leading-relaxed text-slate-500 dark:text-slate-400">{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/docs"
              className="mt-9 inline-flex items-center gap-2 font-semibold text-accent-600 transition-all hover:gap-3 dark:text-accent-400"
            >
              Read the full setup guide <ArrowUpRight size={18} />
            </Link>
          </ScrollReveal>

          <ScrollReveal direction="left" className="relative">
            <div
              className="absolute -inset-5 -z-10 bg-accent-300/25 dark:bg-accent-500/15"
              style={{ borderRadius: blobRadii[3] }}
            />
            <div className="relative rounded-[2rem] border border-black/[0.06] bg-white p-9 shadow-[0_40px_80px_-40px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-white/[0.04] md:p-11">
              <h3 className="mb-7 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                What it needs
              </h3>
              <div className="space-y-5">
                {requirements.map((r) => (
                  <div key={r.t} className="flex items-center gap-4">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent-600/[0.1] text-accent-600 dark:text-accent-400">
                      {r.icon}
                    </span>
                    <div>
                      <p className="font-semibold leading-tight text-slate-900 dark:text-slate-50">
                        {r.t}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{r.d}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 border-t border-black/[0.06] pt-7 dark:border-white/10">
                <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
                  Where things live
                </p>
                <dl className="space-y-3">
                  {paths.map((p) => (
                    <div key={p.label}>
                      <dt className="text-sm text-slate-500 dark:text-slate-400">{p.label}</dt>
                      <dd className="data break-all text-[13px] text-slate-800 dark:text-slate-100">
                        {p.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="mt-7 flex items-center gap-3 border-t border-black/[0.06] pt-6 text-slate-500 dark:border-white/10 dark:text-slate-400">
                <Check size={16} className="flex-shrink-0 text-app-3" />
                <span className="text-sm font-medium">
                  Uninstalling asks what to do with your history rather than deciding for you.
                </span>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="scroll-mt-24 px-6 py-16 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <ScrollReveal className="mb-12 max-w-2xl">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-600 dark:text-accent-400">
              The plan
            </span>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-[0.98] tracking-tight text-slate-900 dark:text-slate-50 md:text-6xl">
              Where Trace is <span className="text-accent-600 dark:text-accent-400">headed.</span>
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-500 dark:text-slate-400">
              Version {site.version} is the first public build: the whole product works end to end,
              and the remaining work is hardening rather than features.
            </p>
          </ScrollReveal>

          <div className="grid gap-6 md:grid-cols-3">
            {roadmap.map((col, i) => (
              <ScrollReveal key={col.status} delay={i * 0.08}>
                <div className="h-full rounded-[1.75rem] border border-black/[0.06] bg-white p-7 shadow-[0_28px_60px_-34px_rgba(15,23,42,0.3)] dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                      <span className="font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
                        {col.status}
                      </span>
                    </div>
                    <span className={`data rounded-full px-2.5 py-1 text-[11px] font-bold ${col.badge}`}>
                      {col.items.length}
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {col.items.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-slate-600 dark:text-slate-300">
                        <span className="mt-1 flex-shrink-0">{col.icon}</span>
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-16 lg:py-24">
        <ScrollReveal className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-ink-900 px-8 py-20 text-center text-white md:p-24">
            <div className="pointer-events-none absolute -right-20 -top-28 h-[460px] w-[460px] rounded-full bg-accent-600/30 blur-[120px]" />
            <div className="pointer-events-none absolute -bottom-28 -left-20 h-[460px] w-[460px] rounded-full bg-app-6/20 blur-[120px]" />
            <div className="relative z-10 space-y-8">
              <h2 className="font-display text-4xl font-semibold leading-[0.98] tracking-tight md:text-6xl">
                Nothing to sign up for. <br /> Nothing to send anywhere.
              </h2>
              <div className="flex flex-col justify-center gap-4 sm:flex-row">
                <a
                  href={installer.href}
                  download
                  className="btn-on-dark inline-flex items-center justify-center gap-2 rounded-2xl px-9 py-5 text-lg font-semibold transition-colors"
                >
                  <Download size={20} /> Download free
                </a>
                <Link
                  href="/docs"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-9 py-5 text-lg font-semibold text-white transition-colors hover:bg-white/5"
                >
                  <BookOpen size={20} /> Read the docs
                </Link>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>
    </div>
  );
}
