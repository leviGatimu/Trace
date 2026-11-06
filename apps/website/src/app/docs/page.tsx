"use client";

import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Clock,
  Database,
  Download,
  FileJson,
  History,
  Info,
  LayoutGrid,
  MonitorSmartphone,
  Pause,
  Search,
  Settings,
  ShieldCheck,
  Terminal,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import ScrollReveal from "@/components/ScrollReveal";
import { installer, site } from "@/lib/site";

/* ------------------------------------------------------------------ */
/*  Small building blocks                                             */
/* ------------------------------------------------------------------ */

const blobRadii = [
  "42% 58% 63% 37% / 41% 44% 56% 59%",
  "63% 37% 47% 53% / 38% 63% 37% 62%",
  "39% 61% 38% 62% / 58% 39% 61% 42%",
  "58% 42% 64% 36% / 49% 56% 44% 51%",
];

const chipColors: Record<string, string> = {
  accent: "bg-accent-600",
  teal: "bg-app-3",
  amber: "bg-app-2",
  violet: "bg-app-6",
  pink: "bg-app-4",
  red: "bg-app-5",
  green: "bg-app-7",
  dark: "bg-ink-900",
};

const blobColors: Record<string, string> = {
  accent: "bg-accent-200 dark:bg-accent-500/25",
  teal: "bg-app-3/30 dark:bg-app-3/20",
  amber: "bg-app-2/30 dark:bg-app-2/20",
  violet: "bg-app-6/30 dark:bg-app-6/20",
  pink: "bg-app-4/30 dark:bg-app-4/20",
  red: "bg-app-5/25 dark:bg-app-5/15",
  green: "bg-app-7/30 dark:bg-app-7/20",
  dark: "bg-slate-300/60 dark:bg-white/10",
};

function Feature({
  icon,
  color = "accent",
  title,
  children,
  i = 0,
}: {
  icon: ReactNode;
  color?: keyof typeof chipColors;
  title: string;
  children: ReactNode;
  i?: number;
}) {
  return (
    <div className="relative h-full overflow-hidden rounded-[1.5rem] border border-black/[0.06] bg-white p-7 shadow-[0_24px_50px_-34px_rgba(15,23,42,0.3)] dark:border-white/10 dark:bg-white/[0.04]">
      <div
        className={`absolute -right-6 -top-8 h-32 w-32 ${blobColors[color]} opacity-60`}
        style={{ borderRadius: blobRadii[i % blobRadii.length] }}
      />
      <div className="relative">
        <div
          className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${chipColors[color]} text-white shadow-[0_12px_26px_-12px_rgba(15,23,42,0.6)]`}
        >
          {icon}
        </div>
        <h4 className="mb-1.5 font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          {title}
        </h4>
        <p className="text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">{children}</p>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-5">
      <span className="data flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-ink-900 text-lg font-semibold text-white dark:bg-white dark:text-ink-900">
        {n}
      </span>
      <div className="pt-1">
        <h4 className="mb-1 font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
          {title}
        </h4>
        <p className="leading-relaxed text-slate-500 dark:text-slate-400">{children}</p>
      </div>
    </div>
  );
}

function Callout({
  icon,
  title,
  tone = "accent",
  children,
}: {
  icon: ReactNode;
  title: string;
  tone?: "accent" | "warn";
  children: ReactNode;
}) {
  const tones = {
    accent: "bg-accent-600/[0.06] border-accent-600/15 [&_.dot]:bg-accent-600",
    warn: "bg-app-2/[0.09] border-app-2/25 [&_.dot]:bg-app-2",
  };
  return (
    <div className={`flex gap-4 rounded-[1.5rem] border p-6 ${tones[tone]}`}>
      <span className="dot flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white">
        {icon}
      </span>
      <div>
        <p className="mb-1 font-display font-semibold text-slate-900 dark:text-slate-50">{title}</p>
        <div className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">{children}</div>
      </div>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <pre className="data custom-scrollbar overflow-x-auto rounded-[1.25rem] border border-black/[0.06] bg-ink-900 p-6 text-[13px] leading-[1.8] text-slate-200 dark:border-white/10">
      {children}
    </pre>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="data inline-flex items-center rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[13px] font-semibold text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200">
      {children}
    </kbd>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 pt-4">
      <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-600 dark:text-accent-400">
        {eyebrow}
      </span>
      <h2 className="mb-7 mt-4 font-display text-4xl font-semibold leading-[1] tracking-tight text-slate-900 dark:text-slate-50 md:text-5xl">
        {title}
      </h2>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const toc = [
  { id: "install", label: "Install" },
  { id: "first-run", label: "First run" },
  { id: "interface", label: "The interface" },
  { id: "recorded", label: "What gets recorded" },
  { id: "controls", label: "Privacy controls" },
  { id: "data", label: "Your data" },
  { id: "tray", label: "Tray and startup" },
  { id: "keyboard", label: "Keyboard" },
  { id: "build", label: "Build from source" },
  { id: "trouble", label: "Troubleshooting" },
];

export default function DocsPage() {
  const [active, setActive] = useState(toc[0].id);

  // Scroll-spy: the last heading to cross the top third of the viewport wins.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-96px 0px -66% 0px", threshold: 0 }
    );

    for (const item of toc) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative">
      <div className="grain" />

      {/* Hero */}
      <section className="px-6 pb-10 pt-40">
        <div className="mx-auto max-w-7xl">
          <ScrollReveal className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-accent-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-accent-400">
              <Info size={13} /> Documentation · v{site.version}
            </span>
            <h1 className="mt-6 font-display text-6xl font-semibold leading-[0.9] tracking-tight text-slate-900 dark:text-slate-50 md:text-8xl">
              How Trace <span className="text-accent-600 dark:text-accent-400">works.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-relaxed text-slate-500 dark:text-slate-400">
              Everything worth knowing: what it installs, what it records, what it refuses to
              record, and how to get your data back out again.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Body */}
      <section className="px-6 pb-24">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          {/* TOC */}
          <aside className="hidden lg:block">
            <nav className="sticky top-28" aria-label="On this page">
              <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
                On this page
              </p>
              <ul className="space-y-1">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[15px] transition-colors ${
                        active === item.id
                          ? "bg-black/[0.05] font-semibold text-slate-900 dark:bg-white/[0.07] dark:text-slate-50"
                          : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                      }`}
                    >
                      <ChevronRight
                        size={14}
                        className={active === item.id ? "text-accent-600 dark:text-accent-400" : "opacity-0"}
                      />
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* Content */}
          <div className="max-w-3xl space-y-20">
            <Section id="install" eyebrow="Getting started" title="Install">
              <p className="text-lg leading-relaxed text-slate-600 dark:text-slate-300">
                Download <span className="data text-[15px]">{installer.file}</span> and run it. The
                install is per-user, so Windows never asks for an administrator, and nothing is
                written outside your own profile.
              </p>

              <div className="overflow-hidden rounded-[1.5rem] border border-black/[0.06] dark:border-white/10">
                <table className="w-full text-left text-[15px]">
                  <tbody className="divide-y divide-black/[0.06] dark:divide-white/10">
                    <tr>
                      <th scope="row" className="bg-white p-5 font-medium text-slate-700 dark:bg-white/[0.04] dark:text-slate-200">
                        Application
                      </th>
                      <td className="data bg-white p-5 text-[13px] text-slate-600 dark:bg-white/[0.02] dark:text-slate-300">
                        %LOCALAPPDATA%\Programs\Trace
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className="bg-white p-5 font-medium text-slate-700 dark:bg-white/[0.04] dark:text-slate-200">
                        Your history
                      </th>
                      <td className="data bg-white p-5 text-[13px] text-slate-600 dark:bg-white/[0.02] dark:text-slate-300">
                        %LOCALAPPDATA%\Trace\Data\activity.db
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <Callout icon={<ShieldCheck size={18} />} title="Uninstalling asks first">
                The uninstaller offers to keep or delete your history rather than deciding for you.
                Choosing to delete removes the database file itself — there is no copy anywhere else.
              </Callout>

              <Link
                href="/download"
                className="inline-flex items-center gap-2 rounded-2xl bg-ink-900 px-8 py-4 font-semibold text-white transition-colors hover:bg-ink-700 dark:bg-white dark:text-ink-900 dark:hover:bg-slate-200"
              >
                <Download size={18} /> Go to downloads
              </Link>
            </Section>

            <Section id="first-run" eyebrow="Day one" title="First run">
              <div className="space-y-7">
                <Step n="1" title="Consent, before anything is written">
                  The first launch explains exactly what is recorded and what cannot be recorded, and
                  waits for you to agree. Nothing is written to the database until you do.
                </Step>
                <Step n="2" title="The tracker starts and takes the tray">
                  <span>
                    <span className="data text-[14px]">TraceTracker.exe</span> is a separate
                    background process. It owns the tray icon and does all the recording — the window
                    you are looking at is only a reader.
                  </span>
                </Step>
                <Step n="3" title="Come back later">
                  There is nothing to configure to get value. Leave it running, and by the end of the
                  day the ribbon on Overview already shows the shape of it.
                </Step>
              </div>
            </Section>

            <Section id="interface" eyebrow="Around the app" title="The interface">
              <p className="text-lg leading-relaxed text-slate-600 dark:text-slate-300">
                Six pages and a settings screen, in a narrow left rail. The content gets the rest.
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                <Feature icon={<Activity size={20} />} color="accent" title="Overview" i={0}>
                  Today at a glance: active time, application count, session count, the day ribbon,
                  and the most-used list underneath it.
                </Feature>
                <Feature icon={<History size={20} />} color="teal" title="Timeline" i={1}>
                  Every session in order, with real start and end times — including idle stretches,
                  lock, sleep and wake. Any session can be linked to directly.
                </Feature>
                <Feature icon={<LayoutGrid size={20} />} color="violet" title="Applications" i={2}>
                  One row per application, and a detail view with every session that application
                  ever had.
                </Feature>
                <Feature icon={<CalendarDays size={20} />} color="amber" title="Calendar" i={3}>
                  A month at a time, so you can navigate to a date rather than scrolling to it.
                </Feature>
                <Feature icon={<BarChart3 size={20} />} color="pink" title="Analytics" i={0}>
                  Totals and comparisons across a week, a month and a year — computed locally, from
                  the same database.
                </Feature>
                <Feature icon={<Search size={20} />} color="green" title="Search" i={1}>
                  Search across every recorded window title. You remember the document, not the hour.
                </Feature>
              </div>
            </Section>

            <Section id="recorded" eyebrow="The record" title="What gets recorded">
              <p className="text-lg leading-relaxed text-slate-600 dark:text-slate-300">
                A session is one continuous stretch with one application in the foreground. Each one
                stores the executable, the window title (unless you turn titles off), a start, an
                end, and how it ended.
              </p>
              <Code>{`09:00  Chrome     YouTube            20m
09:20  VS Code    project-x          40m
10:00  Chrome     GitHub             40m
10:30  Chrome     ·  10m idle
11:00  Computer locked
11:30  Computer unlocked`}</Code>
              <p className="leading-relaxed text-slate-600 dark:text-slate-300">
                Idle is detected by asking Windows how long it has been since the last input — a
                number, never a keystroke. Lock, unlock, sleep and wake are recorded as events, so a
                gap in the ribbon always has an explanation.
              </p>
              <Callout icon={<Info size={18} />} title="It never invents activity">
                If the machine loses power mid-session, that session is closed at its last heartbeat
                and marked interrupted. Trace would rather undercount than guess.
              </Callout>
            </Section>

            <Section id="controls" eyebrow="Settings" title="Privacy controls">
              <div className="grid gap-5 sm:grid-cols-2">
                <Feature icon={<Pause size={20} />} color="amber" title="Pause" i={2}>
                  While paused nothing is written and nothing is buffered for later. If you paused
                  it, it is still paused after a reboot.
                </Feature>
                <Feature icon={<ShieldCheck size={20} />} color="accent" title="Exclusions" i={3}>
                  An excluded application produces no session, no title and no event. It is not
                  recorded then hidden — it is never written.
                </Feature>
                <Feature icon={<MonitorSmartphone size={20} />} color="teal" title="Window titles" i={0}>
                  Turn titles off and only the application is recorded. Existing titles can be
                  cleared at the same time.
                </Feature>
                <Feature icon={<Clock size={20} />} color="violet" title="Retention" i={1}>
                  Keep everything forever, or have anything older than a chosen age deleted
                  automatically.
                </Feature>
              </div>
              <Callout icon={<ShieldCheck size={18} />} title="Filtering happens before persistence">
                The engine physically cannot reach storage except through <em>PrivacyGate</em>. That
                is why an exclusion is a structural guarantee rather than a setting the interface
                happens to respect.
              </Callout>
            </Section>

            <Section id="data" eyebrow="Ownership" title="Your data">
              <div className="grid gap-5 sm:grid-cols-3">
                <Feature icon={<Database size={20} />} color="dark" title="One file" i={0}>
                  A single SQLite database under your own account, readable with any SQLite tool.
                </Feature>
                <Feature icon={<FileJson size={20} />} color="accent" title="JSON export" i={1}>
                  Export a range, or everything, through a normal Windows save dialog.
                </Feature>
                <Feature icon={<Trash2 size={20} />} color="red" title="Real deletion" i={2}>
                  Delete a range or everything, behind a typed confirmation. The schema has no
                  soft-delete column, so &ldquo;hidden but retained&rdquo; is not representable.
                </Feature>
              </div>
            </Section>

            <Section id="tray" eyebrow="Windows integration" title="Tray and startup">
              <p className="text-lg leading-relaxed text-slate-600 dark:text-slate-300">
                The tracker owns the tray icon, not the window. Right-click it to pause or resume,
                open the dashboard on a particular page, or quit recording entirely.
              </p>
              <p className="leading-relaxed text-slate-600 dark:text-slate-300">
                Starting with Windows is a per-user registry entry under{" "}
                <span className="data text-[14px]">HKCU\Software\Microsoft\Windows\CurrentVersion\Run</span>{" "}
                — the same thing Task Manager&rsquo;s Startup tab shows you, and you can remove it
                there.
              </p>
              <Callout icon={<Info size={18} />} title="Closing the window is not stopping the tracker">
                That is the point of two processes: pausing still works if the interface has crashed
                or was never opened. To stop recording, pause it — from the tray or from Settings.
              </Callout>
            </Section>

            <Section id="keyboard" eyebrow="Speed" title="Keyboard">
              <div className="overflow-hidden rounded-[1.5rem] border border-black/[0.06] dark:border-white/10">
                <table className="w-full text-left text-[15px]">
                  <tbody className="divide-y divide-black/[0.06] dark:divide-white/10">
                    {[
                      ["Ctrl + K", "Open the command palette"],
                      ["Ctrl + F", "Jump to Search"],
                      ["← / →", "Previous or next day"],
                      ["T", "Back to today"],
                      ["Esc", "Close the session panel"],
                    ].map(([keys, what]) => (
                      <tr key={keys} className="bg-white dark:bg-white/[0.03]">
                        <th scope="row" className="w-48 p-4 align-middle">
                          <Kbd>{keys}</Kbd>
                        </th>
                        <td className="p-4 text-slate-600 dark:text-slate-300">{what}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section id="build" eyebrow="For developers" title="Build from source">
              <p className="text-lg leading-relaxed text-slate-600 dark:text-slate-300">
                Requires Windows 10 1809 or later, the .NET 10 SDK and Node.js 20.19+.
              </p>
              <Code>{`git clone ${site.github}.git
cd Trace
npm install

# brand assets, tracker, both test suites, dashboard, package
npm run installer      # the result lands in installer/`}</Code>
              <p className="leading-relaxed text-slate-600 dark:text-slate-300">
                In development the tracker is started first — the dashboard is only a client:
              </p>
              <Code>{`dotnet run --project apps/tracker/Trace.Tracker

TraceTracker.exe --diagnose   # live Win32 + engine trace, writes nothing
TraceTracker.exe --dump       # print the recorded history, read-only
TraceTracker.exe --probe      # exercise the IPC contract against a running tracker

cd apps/desktop && npm run dev`}</Code>
              <div className="flex flex-wrap gap-3">
                <a
                  href={site.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl border border-black/10 px-7 py-3.5 font-semibold text-slate-900 transition-colors hover:bg-black/[0.03] dark:border-white/15 dark:text-slate-50 dark:hover:bg-white/[0.06]"
                >
                  <Terminal size={18} /> Source on GitHub
                </a>
              </div>
            </Section>

            <Section id="trouble" eyebrow="When it misbehaves" title="Troubleshooting">
              <div className="space-y-4">
                {[
                  {
                    q: "The dashboard says it cannot reach the tracker",
                    a: "The tracker process is not running. Launch Trace from the Start menu, or check the tray — if the icon is gone, the tracker was quit rather than paused.",
                  },
                  {
                    q: "There is a gap in the ribbon I cannot explain",
                    a: "Open the Timeline for that day. Every gap has an event next to it: idle, locked, asleep, or an interrupted session where the machine lost power.",
                  },
                  {
                    q: "An application is missing entirely",
                    a: "Check Settings → Exclusions. An excluded application is never written, so it will not appear even in history recorded before the exclusion — that history is deleted when you exclude it.",
                  },
                  {
                    q: "Window titles stopped being recorded",
                    a: "Titles are a switch in Settings. Turning them back on affects new sessions only; titles that were never written cannot be recovered.",
                  },
                  {
                    q: "It says the database was corrupt",
                    a: "Trace detects a corrupt database at startup, moves it aside and starts a fresh one rather than refusing to run. The damaged file is left next to the new one so you can attempt a recovery.",
                  },
                ].map((item) => (
                  <details
                    key={item.q}
                    className="group rounded-[1.25rem] border border-black/[0.06] bg-white p-6 dark:border-white/10 dark:bg-white/[0.04]"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
                      {item.q}
                      <ChevronRight
                        size={18}
                        className="flex-shrink-0 text-slate-400 transition-transform group-open:rotate-90"
                      />
                    </summary>
                    <p className="mt-3 leading-relaxed text-slate-500 dark:text-slate-400">{item.a}</p>
                  </details>
                ))}
              </div>

              <Callout icon={<TriangleAlert size={18} />} tone="warn" title="Still stuck?">
                Open an issue on{" "}
                <a
                  href={`${site.github}/issues`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-accent-600 underline-offset-4 hover:underline dark:text-accent-400"
                >
                  GitHub
                </a>
                . Please include your Windows version and what you were doing — but never paste your
                database or an export, since those are your own history.
              </Callout>
            </Section>

            {/* Footer nav */}
            <div className="flex flex-wrap gap-4 border-t border-black/[0.06] pt-10 dark:border-white/10">
              <Link
                href="/download"
                className="inline-flex items-center gap-2 rounded-2xl bg-accent-600 px-8 py-4 font-semibold text-white transition-colors hover:bg-accent-500"
              >
                <Download size={18} /> Download Trace
              </Link>
              <Link
                href="/privacy"
                className="inline-flex items-center gap-2 rounded-2xl border border-black/10 px-8 py-4 font-semibold text-slate-900 transition-colors hover:bg-black/[0.03] dark:border-white/15 dark:text-slate-50 dark:hover:bg-white/[0.06]"
              >
                <ShieldCheck size={18} /> Privacy position
              </Link>
              <Link
                href="/support"
                className="inline-flex items-center gap-2 rounded-2xl border border-black/10 px-8 py-4 font-semibold text-slate-900 transition-colors hover:bg-black/[0.03] dark:border-white/15 dark:text-slate-50 dark:hover:bg-white/[0.06]"
              >
                <Settings size={18} /> Support
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
