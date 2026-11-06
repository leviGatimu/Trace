import type { Metadata } from "next";
import {
  Bug,
  ChevronRight,
  Github,
  LifeBuoy,
  MessagesSquare,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import ScrollReveal from "@/components/ScrollReveal";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Support",
  description:
    "How to get help with Trace: where to report a bug, what to include, and the read-only diagnostics you can run yourself.",
};

const blobRadii = [
  "42% 58% 63% 37% / 41% 44% 56% 59%",
  "63% 37% 47% 53% / 38% 63% 37% 62%",
  "39% 61% 38% 62% / 58% 39% 61% 42%",
];

const channels = [
  {
    icon: <Bug size={22} />,
    chip: "bg-app-5",
    blob: "bg-app-5/25 dark:bg-app-5/15",
    title: "Report a bug",
    desc: "Something recorded wrongly, a crash, or a number that does not add up. Include your Windows version and what you were doing.",
    cta: "Open an issue",
    href: `${site.github}/issues/new`,
  },
  {
    icon: <MessagesSquare size={22} />,
    chip: "bg-accent-600",
    blob: "bg-accent-200 dark:bg-accent-500/25",
    title: "Ask a question",
    desc: "How something works, whether a behaviour is intended, or what a gap in the ribbon means. Questions make the documentation better.",
    cta: "Start a discussion",
    href: `${site.github}/discussions`,
  },
  {
    icon: <Github size={22} />,
    chip: "bg-ink-900",
    blob: "bg-slate-300/60 dark:bg-white/10",
    title: "Read the source",
    desc: "Every claim on this site is checkable. If the code and the copy disagree, the code is right and the copy is a bug.",
    cta: "Browse the repository",
    href: site.github,
  },
];

const faqs = [
  {
    q: "Does Trace slow my machine down?",
    a: "The tracker polls the foreground window and idle time on a timer and writes small rows to a local database. It holds no window open, renders nothing, and does no work at all while the machine is locked or asleep.",
  },
  {
    q: "Can my employer or anyone else see this?",
    a: "Not through Trace. There is no server, no account and no network code — the data never leaves the machine it was recorded on. Anyone with administrator rights on your computer can read files in your profile, as they always could; that is a property of the machine, not of Trace.",
  },
  {
    q: "What happens to my history if I uninstall?",
    a: "The uninstaller asks whether to keep or delete it. Keeping it means a later reinstall picks up exactly where you left off; deleting removes the database file itself.",
  },
  {
    q: "Can I move my history to another computer?",
    a: "Yes — copy activity.db from %LOCALAPPDATA%\\Trace\\Data to the same place on the other machine while Trace is not running. You can also export a JSON copy from Settings if you want something readable.",
  },
  {
    q: "Why is an app I use missing from the list?",
    a: "It is probably excluded. Check Settings → Exclusions; an excluded application is never written, so it does not appear anywhere, including in history recorded before the exclusion.",
  },
  {
    q: "Is there a mobile or web version?",
    a: "No. Trace records what a Windows desktop is doing, using Win32 APIs that have no equivalent elsewhere. A companion that showed the same data on a phone would require sending it somewhere, which is the one thing the product refuses to do.",
  },
];

export default function SupportPage() {
  return (
    <div className="relative">
      <div className="grain" />

      {/* Hero */}
      <section className="px-6 pb-12 pt-40">
        <div className="mx-auto max-w-4xl">
          <ScrollReveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-accent-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-accent-400">
              <LifeBuoy size={13} /> Support
            </span>
            <h1 className="mt-6 font-display text-5xl font-semibold leading-[0.92] tracking-tight text-slate-900 dark:text-slate-50 md:text-7xl">
              Something wrong? <br />
              <span className="text-accent-600 dark:text-accent-400">Tell someone.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-relaxed text-slate-500 dark:text-slate-400">
              Trace is developed in the open, so support happens in the open too — where the answer
              stays findable for whoever hits the same thing next.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Channels */}
      <section className="px-6 py-12 lg:py-16">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
          {channels.map((c, i) => (
            <ScrollReveal key={c.title} delay={i * 0.08}>
              <div className="relative flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-black/[0.06] bg-white p-8 shadow-[0_28px_60px_-34px_rgba(15,23,42,0.3)] dark:border-white/10 dark:bg-white/[0.04]">
                <div
                  className={`absolute -right-8 -top-10 h-40 w-40 ${c.blob} opacity-60`}
                  style={{ borderRadius: blobRadii[i % blobRadii.length] }}
                />
                <div className="relative flex h-full flex-col">
                  <div
                    className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl ${c.chip} text-white shadow-[0_14px_30px_-12px_rgba(15,23,42,0.55)]`}
                  >
                    {c.icon}
                  </div>
                  <h2 className="mb-2 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                    {c.title}
                  </h2>
                  <p className="flex-grow leading-relaxed text-slate-500 dark:text-slate-400">{c.desc}</p>
                  <a
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group mt-7 inline-flex items-center gap-1.5 font-semibold text-accent-600 dark:text-accent-400"
                  >
                    {c.cta}
                    <ChevronRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </a>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* Before you file */}
      <section className="px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-4xl">
          <ScrollReveal className="mb-8">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-600 dark:text-accent-400">
              Diagnose it yourself
            </span>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-[1] tracking-tight text-slate-900 dark:text-slate-50 md:text-5xl">
              Three read-only commands.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-500 dark:text-slate-400">
              The tracker ships with switches that inspect what it is doing without changing
              anything. Run them from{" "}
              <span className="data text-[15px]">%LOCALAPPDATA%\Programs\Trace</span>.
            </p>
          </ScrollReveal>

          <ScrollReveal>
            <pre className="data custom-scrollbar overflow-x-auto rounded-[1.5rem] border border-black/[0.06] bg-ink-900 p-7 text-[13px] leading-[2] text-slate-200 dark:border-white/10">
{`TraceTracker.exe --diagnose   # live Win32 + engine trace, writes nothing
TraceTracker.exe --dump       # print the recorded history, read-only
TraceTracker.exe --probe      # exercise the IPC contract against a running tracker`}
            </pre>
          </ScrollReveal>

          <ScrollReveal className="mt-6 flex items-start gap-4 rounded-[1.5rem] border border-app-2/25 bg-app-2/[0.09] p-6">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-app-2 text-white">
              <ShieldAlert size={18} />
            </span>
            <div>
              <p className="mb-1 font-display font-semibold text-slate-900 dark:text-slate-50">
                Never attach your history to a bug report
              </p>
              <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
                A dump or an export is a record of your day, including window titles. Describe the
                problem instead, or redact before you paste. Nobody helping you needs it.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-16 lg:py-24">
        <div className="mx-auto max-w-4xl">
          <ScrollReveal className="mb-8">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-600 dark:text-accent-400">
              Common questions
            </span>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-[1] tracking-tight text-slate-900 dark:text-slate-50 md:text-5xl">
              Asked often enough to answer here.
            </h2>
          </ScrollReveal>

          <div className="space-y-4">
            {faqs.map((f, i) => (
              <ScrollReveal key={f.q} delay={Math.min(i, 3) * 0.05}>
                <details className="group rounded-[1.25rem] border border-black/[0.06] bg-white p-6 dark:border-white/10 dark:bg-white/[0.04]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
                    {f.q}
                    <ChevronRight
                      size={18}
                      className="flex-shrink-0 text-slate-400 transition-transform group-open:rotate-90"
                    />
                  </summary>
                  <p className="mt-3 leading-relaxed text-slate-500 dark:text-slate-400">{f.a}</p>
                </details>
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal className="mt-12 flex flex-wrap gap-4">
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-2xl bg-ink-900 px-8 py-4 font-semibold text-white transition-colors hover:bg-ink-700 dark:bg-white dark:text-ink-900 dark:hover:bg-slate-200"
            >
              <Terminal size={18} /> Read the docs
            </Link>
            <a
              href={`${site.github}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-black/10 px-8 py-4 font-semibold text-slate-900 transition-colors hover:bg-black/[0.03] dark:border-white/15 dark:text-slate-50 dark:hover:bg-white/[0.06]"
            >
              <Github size={18} /> All open issues
            </a>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
