"use client";

import { motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  CloudOff,
  Database,
  HardDrive,
  History,
  Lock,
  Plug,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import AppWindow from "@/components/AppWindow";
import ArchitectureDiagram from "@/components/ArchitectureDiagram";
import DayRibbon from "@/components/DayRibbon";
import Hero from "@/components/Hero";
import ScrollReveal from "@/components/ScrollReveal";

const blobRadii = [
  "42% 58% 63% 37% / 41% 44% 56% 59%",
  "63% 37% 47% 53% / 38% 63% 37% 62%",
  "39% 61% 38% 62% / 58% 39% 61% 42%",
  "58% 42% 64% 36% / 49% 56% 44% 51%",
  "47% 53% 35% 65% / 64% 47% 53% 36%",
  "61% 39% 56% 44% / 36% 58% 42% 64%",
];

const features = [
  {
    icon: <Activity />,
    chip: "bg-accent-600",
    blob: "bg-accent-200 dark:bg-accent-500/25",
    title: "The day ribbon",
    desc: "Twenty-four hours as one continuous band. Each session is a segment in its application's colour, and the gaps are left as gaps.",
  },
  {
    icon: <History />,
    chip: "bg-app-3",
    blob: "bg-app-3/30 dark:bg-app-3/20",
    title: "A readable timeline",
    desc: "Every session with its real start, end and duration — top to bottom, including idle, lock, sleep and the moment the machine came back.",
  },
  {
    icon: <Search />,
    chip: "bg-app-2",
    blob: "bg-app-2/30 dark:bg-app-2/20",
    title: "Search every title",
    desc: "You remember the document, not the hour. Search across every recorded window title and jump straight to when it was open.",
  },
  {
    icon: <BarChart3 />,
    chip: "bg-app-6",
    blob: "bg-app-6/30 dark:bg-app-6/20",
    title: "Weeks, months, years",
    desc: "A calendar to navigate by date, and analytics that compare a week against the week before it without ever leaving your device.",
  },
  {
    icon: <ShieldCheck />,
    chip: "bg-app-4",
    blob: "bg-app-4/30 dark:bg-app-4/20",
    title: "Filtering before writing",
    desc: "Exclude an application and it produces no session, no title and no event. It is not recorded then hidden — it is never written.",
  },
  {
    icon: <Lock />,
    chip: "bg-ink-900",
    blob: "bg-slate-300/60 dark:bg-white/10",
    title: "Local, and only local",
    desc: "One SQLite file under your own account. No login, no server, no telemetry, and nothing that could upload it if it wanted to.",
  },
];

const desktopPoints = [
  {
    t: "Install once, then forget it",
    d: "A per-user install with no administrator prompt. The tracker starts with Windows and lives in the tray.",
  },
  {
    t: "The tracker outlives the window",
    d: "Close the dashboard and recording continues — pausing works even if the interface was never opened.",
  },
  {
    t: "It never invents activity",
    d: "When the machine dies mid-session, the session closes at the last heartbeat and is marked interrupted. It undercounts rather than guesses.",
  },
];

const neverCollected = [
  "Keystrokes",
  "Passwords",
  "Clipboard contents",
  "Screenshots",
  "Microphone",
  "Webcam",
  "File contents",
  "Browsing history",
  "Message contents",
];

const mostUsed = [
  { app: "Visual Studio Code", color: "#6e9bff", sessions: "18×", total: "4h 20m", bar: 100 },
  { app: "Google Chrome", color: "#5fb3a1", sessions: "22×", total: "2h 30m", bar: 58 },
  { app: "Adobe Illustrator", color: "#8c8fe0", sessions: "6×", total: "45m", bar: 17 },
  { app: "Windows Terminal", color: "#7fb069", sessions: "8×", total: "25m", bar: 10 },
];

export default function Home() {
  return (
    <div className="relative">
      <div className="grain" />

      {/* Full-screen hero */}
      <Hero />

      {/* The signature — a whole day, in one band */}
      <section className="px-6 pt-24 lg:pt-32">
        <div className="mx-auto max-w-5xl">
          <ScrollReveal className="mx-auto mb-12 max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-600 dark:text-accent-400">
              The signature
            </span>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-[0.98] tracking-tight text-slate-900 dark:text-slate-50 md:text-6xl">
              A chart says <span className="text-accent-600 dark:text-accent-400">how much.</span>
              <br />
              The ribbon says <span className="text-accent-600 dark:text-accent-400">when.</span>
            </h2>
          </ScrollReveal>

          <ScrollReveal className="relative">
            <div
              className="absolute -inset-5 -z-10 bg-accent-300/30 blur-2xl dark:bg-accent-500/15"
              style={{ borderRadius: blobRadii[2] }}
            />
            <div className="rounded-[2rem] border border-black/[0.06] bg-white p-8 shadow-[0_40px_80px_-40px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-white/[0.04] md:p-12">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <div>
                  <p className="font-display text-5xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 md:text-6xl">
                    8h 04m <span className="text-lg font-medium text-slate-400 dark:text-slate-500">active</span>
                  </p>
                  <p className="data mt-2 text-[13px] text-slate-500 dark:text-slate-400">
                    9 applications · 42 sessions · 1h 05m idle
                  </p>
                </div>
                <p className="data text-[13px] text-slate-400 dark:text-slate-500">Monday, 9 August</p>
              </div>

              <DayRibbon className="mt-10" height={64} />

              <div className="mt-10 border-t border-black/[0.06] pt-8 dark:border-white/10">
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
                  Most used
                </p>
                <ul className="mt-5 space-y-4">
                  {mostUsed.map((row) => (
                    <li key={row.app} className="flex items-center gap-4">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: row.color }} />
                      <span className="flex-1 truncate text-[15px] text-slate-800 dark:text-slate-100">
                        {row.app}
                      </span>
                      <span className="hidden h-px w-32 bg-black/[0.07] dark:bg-white/10 sm:block">
                        <motion.span
                          className="block h-px"
                          style={{ background: row.color }}
                          initial={{ width: 0 }}
                          whileInView={{ width: `${row.bar}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.9, ease: [0.21, 0.5, 0.3, 1] }}
                        />
                      </span>
                      <span className="data w-10 text-right text-[13px] text-slate-400 dark:text-slate-500">
                        {row.sessions}
                      </span>
                      <span className="data w-16 text-right text-[13px] font-medium text-slate-900 dark:text-slate-50">
                        {row.total}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-24 px-6 py-28 lg:py-36">
        <div className="mx-auto max-w-7xl">
          <ScrollReveal className="max-w-3xl">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-600 dark:text-accent-400">
              What it does
            </span>
            <h2 className="mt-5 font-display text-5xl font-semibold leading-[0.95] tracking-tight text-slate-900 dark:text-slate-50 md:text-7xl">
              A recorder, <br />
              not a <span className="text-accent-600 dark:text-accent-400">scoreboard.</span>
            </h2>
            <p className="mt-6 text-xl leading-relaxed text-slate-500 dark:text-slate-400">
              Screen-time tools tell you that you spent two hours in Chrome. That is rarely the
              question you actually have. Trace keeps the shape of the day, not a daily total.
            </p>
          </ScrollReveal>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <ScrollReveal key={f.title} delay={(i % 3) * 0.08}>
                <motion.div
                  whileHover={{ y: -8 }}
                  transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  className="relative h-full overflow-hidden rounded-[1.9rem] border border-black/[0.06] bg-white p-8 shadow-[0_28px_60px_-34px_rgba(15,23,42,0.3)] dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <div
                    className={`absolute -right-8 -top-10 h-44 w-44 ${f.blob} opacity-70`}
                    style={{ borderRadius: blobRadii[i % blobRadii.length] }}
                  />
                  <div className="relative">
                    <div
                      className={`mb-7 flex h-16 w-16 items-center justify-center rounded-[1.3rem] ${f.chip} text-white shadow-[0_14px_30px_-10px_rgba(15,23,42,0.5)]`}
                    >
                      {f.icon}
                    </div>
                    <h3 className="mb-2 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                      {f.title}
                    </h3>
                    <p className="leading-relaxed text-slate-500 dark:text-slate-400">{f.desc}</p>
                  </div>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Desktop */}
      <section id="desktop" className="scroll-mt-24 px-6 py-20 lg:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2 lg:gap-24">
          <ScrollReveal direction="right">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-600 dark:text-accent-400">
              On Windows
            </span>
            <h2 className="mb-8 mt-5 font-display text-5xl font-semibold leading-[0.95] tracking-tight text-slate-900 dark:text-slate-50 md:text-6xl">
              Quiet, and <span className="text-accent-600 dark:text-accent-400">always on.</span>
            </h2>
            <div className="space-y-7">
              {desktopPoints.map((p) => (
                <div key={p.t} className="flex gap-4">
                  <span className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-accent-600 text-white shadow-[0_8px_20px_-6px_rgba(52,92,226,0.7)]">
                    <Check size={16} strokeWidth={3} />
                  </span>
                  <div>
                    <h3 className="mb-1 font-display text-xl font-semibold text-slate-900 dark:text-slate-50">
                      {p.t}
                    </h3>
                    <p className="leading-relaxed text-slate-500 dark:text-slate-400">{p.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/download"
              className="group mt-10 inline-flex items-center gap-3 rounded-2xl bg-ink-900 py-4 pl-8 pr-5 font-semibold text-white transition-colors hover:bg-ink-700 dark:bg-white dark:text-ink-900 dark:hover:bg-slate-200"
            >
              Get the desktop app
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-600 text-white transition-transform group-hover:rotate-45">
                <ArrowUpRight size={16} />
              </span>
            </Link>
          </ScrollReveal>

          <ScrollReveal direction="left" className="relative">
            <div
              className="absolute -inset-6 -z-10 bg-accent-300/30 dark:bg-accent-500/15"
              style={{ borderRadius: blobRadii[2] }}
            />
            <AppWindow
              src="/screenshots/overview.png"
              alt="Trace Overview — today's active time, the day ribbon, and the most-used applications"
              caption="Overview — the shape of today, before any of the numbers."
              priority
            />
          </ScrollReveal>
        </div>
      </section>

      {/* Application detail */}
      <section className="px-6 py-20 lg:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2 lg:gap-24">
          <ScrollReveal className="relative order-2 lg:order-1">
            <div
              className="absolute -inset-6 -z-10 bg-app-3/25 dark:bg-app-3/15"
              style={{ borderRadius: blobRadii[1] }}
            />
            <AppWindow
              src="/screenshots/application.png"
              alt="Trace application detail — every session recorded for one application"
              caption="One application, every session it ever had."
            />
          </ScrollReveal>

          <ScrollReveal direction="left" className="order-1 lg:order-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-600 dark:text-accent-400">
              Down to the session
            </span>
            <h2 className="mb-6 mt-5 font-display text-4xl font-semibold leading-[1] tracking-tight text-slate-900 dark:text-slate-50 md:text-5xl">
              Every row has a start, an end, and a reason.
            </h2>
            <p className="text-lg leading-relaxed text-slate-500 dark:text-slate-400">
              Open an application and you get its whole history: when it was in front, for how long,
              which window was on screen, and whether the session ended because you switched away,
              went idle, locked the machine, or lost power.
            </p>
            <p className="mt-5 text-lg leading-relaxed text-slate-500 dark:text-slate-400">
              Application colours are hashed from the executable name, so an application is the same
              colour everywhere, permanently, without anything being stored.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="scroll-mt-24 px-6 py-20 lg:py-28">
        <ScrollReveal className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-ink-900 to-[#05070d] px-8 py-16 text-white md:p-16 lg:p-20">
            <div className="pointer-events-none absolute -top-28 right-10 h-[440px] w-[440px] rounded-full bg-accent-600/25 blur-[130px]" />
            <div className="pointer-events-none absolute -bottom-32 -left-20 h-[440px] w-[440px] rounded-full bg-app-6/15 blur-[130px]" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:radial-gradient(rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:22px_22px]" />

            <div className="relative z-10 grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
              <div>
                <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.3em] text-accent-300">
                  <ShieldCheck size={14} /> Privacy is the architecture
                </span>
                <h2 className="mt-5 font-display text-4xl font-semibold leading-[0.98] tracking-tight md:text-6xl">
                  A historian, <br /> not a spy.
                </h2>
                <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-300">
                  Trace records <em>that</em> something happened, never the private content of it.
                  There are no keyboard or mouse hooks, no screen capture, no DLL injection and no
                  browser integration. Idle detection asks Windows one question — how long since the
                  last input? — and receives a number, never a keystroke.
                </p>

                <p className="mt-8 text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400">
                  Never collected
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {neverCollected.map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-sm text-slate-300"
                    >
                      <span className="relative block h-2.5 w-2.5" aria-hidden="true">
                        <span className="absolute left-0 top-1/2 h-px w-full rotate-45 bg-app-5" />
                        <span className="absolute left-0 top-1/2 h-px w-full -rotate-45 bg-app-5" />
                      </span>
                      {item}
                    </span>
                  ))}
                </div>

                <Link
                  href="/privacy"
                  className="mt-9 inline-flex items-center gap-2 font-semibold text-accent-300 transition-all hover:gap-3"
                >
                  Read the whole privacy position <ArrowUpRight size={18} />
                </Link>
              </div>

              {/* the vault */}
              <div className="relative mx-auto w-full max-w-sm lg:ml-auto">
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
                  className="absolute -right-2 -top-5 z-20 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-semibold text-slate-100 shadow-xl backdrop-blur-md"
                >
                  <CloudOff size={15} className="text-app-5" /> No cloud
                </motion.div>

                <div className="rounded-[1.9rem] border border-white/15 bg-white/[0.05] p-7 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.7)] backdrop-blur-xl">
                  <div className="mb-7 flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  </div>

                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-[1.6rem] bg-gradient-to-br from-accent-400 to-accent-600 shadow-[0_18px_44px_-10px_rgba(52,92,226,0.8)]">
                      <Lock size={34} className="text-white" />
                    </div>
                    <p className="mt-5 font-display text-lg font-semibold">Your local record</p>
                    <p className="text-sm text-slate-400">Everything lives on this device</p>
                  </div>

                  <div className="mt-6 space-y-2.5">
                    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                      <span className="data flex items-center gap-2.5 text-[13px] text-slate-200">
                        <Database size={16} className="text-accent-300" /> activity.db
                      </span>
                      <span className="text-[11px] font-semibold text-app-3">per-user ACL</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                      <span className="data flex items-center gap-2.5 text-[13px] text-slate-200">
                        <HardDrive size={16} className="text-accent-300" /> %LOCALAPPDATA%
                      </span>
                      <span className="text-[11px] font-semibold text-slate-400">no upload</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                      <span className="data flex items-center gap-2.5 text-[13px] text-slate-200">
                        <Trash2 size={16} className="text-accent-300" /> delete
                      </span>
                      <span className="text-[11px] font-semibold text-slate-400">really deletes</span>
                    </div>
                  </div>
                </div>

                <motion.div
                  animate={{ y: [0, 10, 0] }}
                  transition={{ repeat: Infinity, duration: 6, ease: "easeInOut", delay: 0.6 }}
                  className="absolute -bottom-4 -left-3 z-20 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-semibold text-slate-100 shadow-xl backdrop-blur-md"
                >
                  <Plug size={15} className="text-accent-300" /> No network code
                </motion.div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Architecture */}
      <section className="px-6 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <ScrollReveal className="max-w-2xl">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-600 dark:text-accent-400">
              How it works
            </span>
            <h2 className="mt-5 font-display text-4xl font-semibold leading-[0.98] tracking-tight text-slate-900 dark:text-slate-50 md:text-6xl">
              Two processes. <br />
              The window is the <span className="text-accent-600 dark:text-accent-400">optional one.</span>
            </h2>
          </ScrollReveal>

          <ScrollReveal className="mt-12 rounded-[2rem] border border-black/[0.06] bg-black/[0.02] p-6 shadow-[0_28px_60px_-40px_rgba(15,23,42,0.3)] dark:border-white/10 dark:bg-white/[0.02] md:p-12">
            <ArchitectureDiagram />
          </ScrollReveal>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                t: "The tracker is the only writer",
                d: "The interface never opens the database. Every duration, count and total arrives already computed, so two screens cannot disagree.",
              },
              {
                t: "A named pipe, not a local port",
                d: "A TCP listener is reachable by every process on the machine, and by pages in your browser. The pipe's ACL admits only your own account.",
              },
              {
                t: "One gate to storage",
                d: "The engine physically cannot reach the database except through PrivacyGate, so an exclusion is a structural guarantee rather than a policy.",
              },
            ].map((c, i) => (
              <ScrollReveal key={c.t} delay={i * 0.08}>
                <div className="h-full rounded-[1.5rem] border border-black/[0.06] bg-white p-7 dark:border-white/10 dark:bg-white/[0.04]">
                  <h3 className="mb-2 font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
                    {c.t}
                  </h3>
                  <p className="text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">{c.d}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="px-6 pb-32 pt-10 text-center">
        <ScrollReveal className="mx-auto max-w-3xl">
          <h2 className="font-display text-5xl font-semibold leading-[0.95] tracking-tight text-slate-900 dark:text-slate-50 md:text-7xl">
            Start <span className="text-accent-600 dark:text-accent-400">remembering</span> today.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-xl leading-relaxed text-slate-500 dark:text-slate-400">
            Free, offline and private. Install it once and, a week from now, you will be able to
            answer the question you could not answer this morning.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/download"
              className="group relative inline-flex items-center gap-3 overflow-hidden rounded-2xl bg-ink-900 px-12 py-5 text-lg font-semibold text-white shadow-[0_24px_50px_-16px_rgba(0,0,0,0.6)] transition-transform hover:scale-[1.02] active:scale-95 dark:bg-white dark:text-ink-900"
            >
              <span className="relative z-10">Download for Windows</span>
              <span className="absolute bottom-0 right-0 h-0 w-0 border-b-[34px] border-l-[34px] border-b-accent-500 border-l-transparent" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-10 py-5 text-lg font-semibold text-slate-900 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-50 dark:hover:bg-white/[0.08]"
            >
              <BookOpen size={20} />
              Read the docs
            </Link>
          </div>
        </ScrollReveal>
      </section>
    </div>
  );
}
