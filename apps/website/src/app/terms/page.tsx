import type { Metadata } from "next";
import { Scale } from "lucide-react";
import Link from "next/link";
import ScrollReveal from "@/components/ScrollReveal";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "The terms covering your use of the Trace application and this website. Short, because there is no account, no payment and no data collection to govern.",
};

const sections = [
  {
    h: "What these terms cover",
    p: [
      "These terms cover your use of the Trace application and of this website. They are short because there is very little to govern: there is no account to hold, no payment to take, and no data of yours that ever reaches anyone else.",
      "Using the software means accepting what is written here. If you do not accept it, do not install it — and if you already have, uninstalling removes it completely.",
    ],
  },
  {
    h: "The software is free, and provided as it is",
    p: [
      "Trace is provided free of charge, without warranty of any kind, express or implied — including any implied warranty of merchantability, fitness for a particular purpose, or non-infringement.",
      "To the fullest extent permitted by law, the authors are not liable for any claim, damages or other liability arising from the software or its use, including loss of data. It is a recorder of your activity, not a system of record: do not use it where a missing or inaccurate entry would cause you harm.",
    ],
  },
  {
    h: "Your data is yours, and stays yours",
    p: [
      "Everything Trace records is stored on your own machine, under your own Windows account. It is never transmitted, and no one else receives a copy — including the authors.",
      "That also means recovery is entirely in your hands. If you delete your history, or lose the disk it was on, it is gone; there is no backup anywhere else to restore it from.",
      "You are responsible for what you record. If you use a shared or employer-owned machine, make sure recording your own activity on it is something you are permitted to do.",
    ],
  },
  {
    h: "The source",
    p: [
      "Trace's source is published on GitHub. Any licence governing reuse, modification or redistribution of that source is stated in the repository itself, and takes precedence there; these terms cover your use of the compiled application and of this website.",
    ],
  },
  {
    h: "This website",
    p: [
      "This site is provided as it is, without warranty of availability or accuracy. It sets no cookies and runs no analytics — the privacy page describes exactly what it does and does not do.",
      "The Trace name and mark identify this project. You are welcome to write about it, link to it and quote it; please do not use the name or mark in a way that suggests your own work is endorsed by or affiliated with it.",
    ],
  },
  {
    h: "Changes",
    p: [
      "These terms may change as the software does. Material changes will be noted in the changelog, and the version you agreed to is the one published at the time you installed. Continuing to use Trace after a change means accepting the revised terms.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="relative">
      <div className="grain" />

      <section className="px-6 pb-12 pt-40">
        <div className="mx-auto max-w-3xl">
          <ScrollReveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-accent-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-accent-400">
              <Scale size={13} /> Terms of use
            </span>
            <h1 className="mt-6 font-display text-5xl font-semibold leading-[0.92] tracking-tight text-slate-900 dark:text-slate-50 md:text-7xl">
              The short <span className="text-accent-600 dark:text-accent-400">version.</span>
            </h1>
            <p className="data mt-6 text-[13px] text-slate-400 dark:text-slate-500">
              Last updated 10 August 2026 · applies to v{site.version}
            </p>
          </ScrollReveal>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto max-w-3xl space-y-14">
          {sections.map((s, i) => (
            <ScrollReveal key={s.h} delay={Math.min(i, 3) * 0.05}>
              <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 md:text-3xl">
                {s.h}
              </h2>
              <div className="space-y-4 text-lg leading-relaxed text-slate-600 dark:text-slate-300">
                {s.p.map((para) => (
                  <p key={para}>{para}</p>
                ))}
              </div>
            </ScrollReveal>
          ))}

          <ScrollReveal className="flex flex-wrap gap-4 border-t border-black/[0.08] pt-10 dark:border-white/10">
            <Link
              href="/privacy"
              className="inline-flex items-center gap-2 rounded-2xl bg-ink-900 px-8 py-4 font-semibold text-white transition-colors hover:bg-ink-700 dark:bg-white dark:text-ink-900 dark:hover:bg-slate-200"
            >
              Read the privacy position
            </Link>
            <a
              href={site.github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-black/10 px-8 py-4 font-semibold text-slate-900 transition-colors hover:bg-black/[0.03] dark:border-white/15 dark:text-slate-50 dark:hover:bg-white/[0.06]"
            >
              The repository
            </a>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
