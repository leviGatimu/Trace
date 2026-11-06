import type { Metadata } from "next";
import { ArrowUpRight, BookOpen, Database, Layers, Quote, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";
import ScrollReveal from "@/components/ScrollReveal";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why Trace exists: screen-time tools answer how much. The question you actually have is when — and answering it means keeping the shape of the day.",
};

const blobRadii = [
  "42% 58% 63% 37% / 41% 44% 56% 59%",
  "63% 37% 47% 53% / 38% 63% 37% 62%",
  "39% 61% 38% 62% / 58% 39% 61% 42%",
  "58% 42% 64% 36% / 49% 56% 44% 51%",
];

const values = [
  {
    icon: <Database size={20} />,
    chip: "bg-ink-900",
    blob: "bg-slate-300/60 dark:bg-white/10",
    title: "Local, structurally",
    desc: "Your history is one SQLite file under your own account. There is no server to breach and no network code that could reach one if there were.",
  },
  {
    icon: <ShieldCheck size={20} />,
    chip: "bg-accent-600",
    blob: "bg-accent-200 dark:bg-accent-500/25",
    title: "Guarantees, not promises",
    desc: "Exclusions filter before persistence, pausing survives a reboot, and the schema has no soft-delete column. Each is a property of the design, not a policy.",
  },
  {
    icon: <Zap size={20} />,
    chip: "bg-app-3",
    blob: "bg-app-3/30 dark:bg-app-3/20",
    title: "Honest over flattering",
    desc: "When the machine dies mid-session, Trace closes it at the last heartbeat and marks it interrupted. Undercounting beats a number that was invented.",
  },
  {
    icon: <Layers size={20} />,
    chip: "bg-app-2",
    blob: "bg-app-2/30 dark:bg-app-2/20",
    title: "Boring technology",
    desc: "Win32, SQLite, a named pipe and Electron. Nothing here is novel, which is exactly why it can be trusted to run every day for a year.",
  },
];

const stats = [
  { v: "122", l: "Automated tests" },
  { v: "0", l: "Network calls" },
  { v: "1", l: "Database you own" },
  { v: "2", l: "Processes, one optional" },
];

export default function About() {
  return (
    <div className="relative">
      <div className="grain" />

      {/* Hero */}
      <section className="px-6 pb-16 pt-40">
        <div className="mx-auto max-w-7xl">
          <ScrollReveal className="max-w-4xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-accent-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-accent-400">
              <BookOpen size={13} /> About Trace
            </span>
            <h1 className="mt-6 font-display text-6xl font-semibold leading-[0.9] tracking-tight text-slate-900 dark:text-slate-50 md:text-8xl">
              A recorder <br />
              for <span className="text-accent-600 dark:text-accent-400">your own day.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-xl leading-relaxed text-slate-500 dark:text-slate-400 md:text-2xl">
              Trace is a private, local activity history for Windows. It keeps the shape of your day
              — every session, with a start and an end — so the day can be reconstructed rather than
              summarised.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Story + quote */}
      <section className="px-6 py-16 lg:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2 lg:gap-24">
          <ScrollReveal direction="right">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-600 dark:text-accent-400">
              Why it exists
            </span>
            <h2 className="mb-7 mt-4 font-display text-4xl font-semibold leading-[1] tracking-tight text-slate-900 dark:text-slate-50 md:text-5xl">
              Totals answer the wrong question.
            </h2>
            <div className="space-y-5 text-lg leading-relaxed text-slate-600 dark:text-slate-300">
              <p>
                Screen-time tools tell you that you spent two hours in Chrome. That is almost never
                the thing you wanted to know. The question you actually have is{" "}
                <em>&ldquo;what was I doing at seven last night?&rdquo;</em> — and a daily total
                cannot answer it, because the answer is a sequence, not a sum.
              </p>
              <p>
                So Trace stores every session with its start, its end, and what was on screen, and
                draws the whole day as one continuous band. Nothing is aggregated away, because the
                aggregate was never the point.
              </p>
              <p>
                The other half of the design followed from the first: a tool that keeps this much
                detail has no business sending any of it anywhere. Privacy here is architectural —
                there is no account, no server, and no code in the repository that could upload a
                thing.
              </p>
            </div>
            <Link
              href="/docs"
              className="group mt-9 inline-flex items-center gap-3 rounded-2xl bg-ink-900 py-4 pl-8 pr-5 font-semibold text-white transition-colors hover:bg-ink-700 dark:bg-white dark:text-ink-900 dark:hover:bg-slate-200"
            >
              See how it works
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-600 text-white transition-transform group-hover:rotate-45">
                <ArrowUpRight size={16} />
              </span>
            </Link>
          </ScrollReveal>

          <ScrollReveal direction="left" className="relative">
            <div
              className="absolute -inset-5 -z-10 bg-accent-300/30 dark:bg-accent-500/15"
              style={{ borderRadius: blobRadii[1] }}
            />
            <div className="relative rounded-[2rem] border border-black/[0.06] bg-white p-10 shadow-[0_40px_80px_-40px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-white/[0.04] md:p-12">
              <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-600 text-white">
                <Quote size={22} />
              </div>
              <p className="font-display text-2xl font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-50 md:text-3xl">
                &ldquo;A chart of hourly totals answers <em>how much</em>. The ribbon answers{" "}
                <em>when</em> — which is the question a recorder exists to answer.&rdquo;
              </p>
              <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                From the design notes
              </p>
              <p className="mt-6 leading-relaxed text-slate-500 dark:text-slate-400">
                It is the sentence the whole interface is built around: dark, dense and typographic,
                with no cards and no boxes — sections separated by space and a label, lists by
                alignment, and every time and duration monospaced so columns can be compared without
                being read.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Values */}
      <section className="px-6 py-16 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <ScrollReveal className="mb-14 max-w-2xl">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-600 dark:text-accent-400">
              What it holds to
            </span>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-[0.98] tracking-tight text-slate-900 dark:text-slate-50 md:text-6xl">
              Principles, not <span className="text-accent-600 dark:text-accent-400">features.</span>
            </h2>
          </ScrollReveal>

          <div className="grid gap-6 sm:grid-cols-2">
            {values.map((v, i) => (
              <ScrollReveal key={v.title} delay={(i % 2) * 0.08}>
                <div className="relative h-full overflow-hidden rounded-[1.75rem] border border-black/[0.06] bg-white p-8 shadow-[0_28px_60px_-34px_rgba(15,23,42,0.3)] dark:border-white/10 dark:bg-white/[0.04]">
                  <div
                    className={`absolute -right-8 -top-10 h-40 w-40 ${v.blob} opacity-60`}
                    style={{ borderRadius: blobRadii[i % blobRadii.length] }}
                  />
                  <div className="relative">
                    <div
                      className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl ${v.chip} text-white shadow-[0_14px_30px_-12px_rgba(15,23,42,0.55)]`}
                    >
                      {v.icon}
                    </div>
                    <h3 className="mb-2 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                      {v.title}
                    </h3>
                    <p className="leading-relaxed text-slate-500 dark:text-slate-400">{v.desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="px-6 py-16 lg:py-20">
        <ScrollReveal className="mx-auto max-w-7xl">
          <div className="grid grid-cols-2 divide-x divide-y divide-black/[0.06] rounded-[2rem] border border-black/[0.06] bg-white shadow-[0_28px_60px_-40px_rgba(15,23,42,0.3)] dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.04] lg:grid-cols-4 lg:divide-y-0">
            {stats.map((s) => (
              <div key={s.l} className="p-8 text-center lg:p-10">
                <p className="data font-display text-5xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 md:text-6xl">
                  {s.v}
                </p>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  {s.l}
                </p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* CTA */}
      <section className="px-6 py-16 lg:py-24">
        <ScrollReveal className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-ink-900 px-8 py-20 text-center text-white md:p-24">
            <div className="pointer-events-none absolute -right-20 -top-28 h-[460px] w-[460px] rounded-full bg-accent-600/30 blur-[120px]" />
            <div className="pointer-events-none absolute -bottom-28 -left-20 h-[460px] w-[460px] rounded-full bg-app-6/20 blur-[120px]" />
            <div className="relative z-10 space-y-8">
              <h2 className="font-display text-4xl font-semibold leading-[0.98] tracking-tight md:text-6xl">
                Built in the open. <br /> Kept on <span className="text-accent-400">your machine.</span>
              </h2>
              <p className="mx-auto max-w-xl text-xl leading-relaxed text-slate-300">
                Read the source, build it yourself, or just install it and forget it is there.
              </p>
              <div className="flex flex-col justify-center gap-4 sm:flex-row">
                <Link
                  href="/download"
                  className="btn-on-dark inline-flex items-center justify-center gap-2 rounded-2xl px-9 py-5 text-lg font-semibold transition-colors"
                >
                  Download free
                </Link>
                <a
                  href={site.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-9 py-5 text-lg font-semibold text-white transition-colors hover:bg-white/5"
                >
                  <BookOpen size={20} /> Read the source
                </a>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>
    </div>
  );
}
