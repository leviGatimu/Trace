import type { Metadata } from "next";
import { Ban, Cookie, Database, HardDrive, Lock, ShieldCheck, Trash2, WifiOff } from "lucide-react";
import Link from "next/link";
import ScrollReveal from "@/components/ScrollReveal";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Trace has no account, no server and no telemetry. This page states exactly what is recorded, what cannot be recorded, and why those are properties of the design rather than promises.",
};

const neverCollected = [
  ["Keystrokes", "There are no keyboard hooks."],
  ["Passwords", "Nothing reads input, so nothing can read a password."],
  ["Clipboard contents", "The clipboard is never opened."],
  ["Screenshots", "There is no screen-capture code."],
  ["Microphone", "No audio API is used."],
  ["Webcam", "No camera API is used."],
  ["File contents", "Only window titles, and only if you leave them on."],
  ["Browsing history", "No browser integration or extension exists."],
  ["Message contents", "A chat window is an application like any other."],
];

const properties = [
  {
    icon: <ShieldCheck size={20} />,
    title: "Filtering happens before persistence",
    body: "An excluded application produces no session, no window title and no event. It is not recorded and then hidden — it is never written. The engine physically cannot reach storage except through PrivacyGate.",
  },
  {
    icon: <Lock size={20} />,
    title: "Pausing is real, and survives a restart",
    body: "While paused nothing is written and nothing is buffered to be written later. If you paused it, it is still paused after a reboot.",
  },
  {
    icon: <Trash2 size={20} />,
    title: "Deleting deletes",
    body: "The schema has no soft-delete column, so “hidden but retained” is not a state the database can represent. Deleting a range removes those rows.",
  },
];

const recorded = [
  ["Application", "The executable name of whatever is in the foreground."],
  ["Window title", "The title bar text — switchable off, and clearable retroactively."],
  ["Start and end", "The real timestamps of each session, in your local time zone."],
  ["How it ended", "Switched away, went idle, locked, slept, or was interrupted by power loss."],
];

export default function PrivacyPage() {
  return (
    <div className="relative">
      <div className="grain" />

      {/* Hero */}
      <section className="px-6 pb-12 pt-40">
        <div className="mx-auto max-w-4xl">
          <ScrollReveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-accent-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-accent-400">
              <ShieldCheck size={13} /> Privacy
            </span>
            <h1 className="mt-6 font-display text-5xl font-semibold leading-[0.92] tracking-tight text-slate-900 dark:text-slate-50 md:text-7xl">
              Privacy is the <span className="text-accent-600 dark:text-accent-400">architecture,</span>
              <br />
              not a setting.
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-relaxed text-slate-500 dark:text-slate-400">
              Trace is a historian, not a surveillance tool. It records <em>that</em> something
              happened, never the private content of it. Everything below is a description of how
              the software is built, not a statement of intent.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* The one-line summary */}
      <section className="px-6 py-10">
        <ScrollReveal className="mx-auto max-w-4xl">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: <WifiOff size={18} />, t: "No network", d: "Nothing is uploaded, because nothing can be." },
              { icon: <Ban size={18} />, t: "No account", d: "There is nothing to sign up for." },
              { icon: <Database size={18} />, t: "No telemetry", d: "Not even crash or usage counts." },
            ].map((c) => (
              <div
                key={c.t}
                className="rounded-[1.5rem] border border-black/[0.06] bg-white p-6 dark:border-white/10 dark:bg-white/[0.04]"
              >
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-600/[0.1] text-accent-600 dark:text-accent-400">
                  {c.icon}
                </span>
                <p className="font-display text-lg font-semibold text-slate-900 dark:text-slate-50">{c.t}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">{c.d}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* Never collected */}
      <section className="px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-4xl">
          <ScrollReveal className="mb-8">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-600 dark:text-accent-400">
              Never collected
            </span>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-[1] tracking-tight text-slate-900 dark:text-slate-50 md:text-5xl">
              There is no code that could.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-500 dark:text-slate-400">
              No keyboard or mouse hooks, no screen capture, no DLL injection, no browser
              integration. Idle detection asks Windows a single question — how long since the last
              input? — and receives a number, never a keystroke.
            </p>
          </ScrollReveal>

          <ScrollReveal className="overflow-hidden rounded-[1.75rem] border border-black/[0.06] dark:border-white/10">
            <ul className="divide-y divide-black/[0.06] dark:divide-white/10">
              {neverCollected.map(([what, why]) => (
                <li
                  key={what}
                  className="flex flex-col gap-1 bg-white p-5 sm:flex-row sm:items-center sm:gap-6 dark:bg-white/[0.03]"
                >
                  <span className="flex min-w-[13rem] items-center gap-3 font-semibold text-slate-900 dark:text-slate-50">
                    <span className="relative block h-3 w-3 flex-shrink-0" aria-hidden="true">
                      <span className="absolute left-0 top-1/2 h-px w-full rotate-45 bg-app-5" />
                      <span className="absolute left-0 top-1/2 h-px w-full -rotate-45 bg-app-5" />
                    </span>
                    {what}
                  </span>
                  <span className="text-[15px] text-slate-500 dark:text-slate-400">{why}</span>
                </li>
              ))}
            </ul>
          </ScrollReveal>
        </div>
      </section>

      {/* What is recorded */}
      <section className="px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-4xl">
          <ScrollReveal className="mb-8">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-600 dark:text-accent-400">
              What is recorded
            </span>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-[1] tracking-tight text-slate-900 dark:text-slate-50 md:text-5xl">
              Four things, and only on your disk.
            </h2>
          </ScrollReveal>

          <ScrollReveal className="overflow-hidden rounded-[1.75rem] border border-black/[0.06] dark:border-white/10">
            <table className="w-full text-left">
              <tbody className="divide-y divide-black/[0.06] dark:divide-white/10">
                {recorded.map(([what, detail]) => (
                  <tr key={what} className="bg-white dark:bg-white/[0.03]">
                    <th
                      scope="row"
                      className="w-52 p-5 align-top font-semibold text-slate-900 dark:text-slate-50"
                    >
                      {what}
                    </th>
                    <td className="p-5 text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollReveal>

          <ScrollReveal className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.5rem] border border-black/[0.06] bg-white p-6 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="mb-2 flex items-center gap-2 font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
                <HardDrive size={18} className="text-accent-600 dark:text-accent-400" /> Where it lives
              </p>
              <p className="data break-all text-[13px] text-slate-600 dark:text-slate-300">
                %LOCALAPPDATA%\Trace\Data\activity.db
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
                Inside your own Windows profile, readable with any SQLite tool.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-black/[0.06] bg-white p-6 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="mb-2 flex items-center gap-2 font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
                <Lock size={18} className="text-accent-600 dark:text-accent-400" /> Who can reach it
              </p>
              <p className="text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
                The two processes talk over a named pipe whose ACL admits only your own account — not
                a local HTTP port, which every process on the machine and every page in your browser
                could reach.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Structural properties */}
      <section className="px-6 py-16 lg:py-20">
        <ScrollReveal className="mx-auto max-w-4xl">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-ink-900 px-8 py-14 text-white md:p-14">
            <div className="pointer-events-none absolute -right-20 -top-28 h-[420px] w-[420px] rounded-full bg-accent-600/25 blur-[120px]" />
            <div className="relative z-10">
              <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-300">
                Three properties
              </span>
              <h2 className="mt-4 font-display text-3xl font-semibold leading-[1.05] tracking-tight md:text-5xl">
                They hold structurally, <br /> rather than by policy.
              </h2>
              <div className="mt-10 space-y-8">
                {properties.map((p) => (
                  <div key={p.title} className="flex gap-5">
                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white/10 text-accent-300">
                      {p.icon}
                    </span>
                    <div>
                      <h3 className="mb-1 font-display text-xl font-semibold">{p.title}</h3>
                      <p className="leading-relaxed text-slate-300">{p.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* This website */}
      <section className="px-6 py-16 lg:py-24">
        <div className="mx-auto max-w-4xl">
          <ScrollReveal>
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-600 dark:text-accent-400">
              This website
            </span>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-[1] tracking-tight text-slate-900 dark:text-slate-50 md:text-5xl">
              It would be odd to track you here.
            </h2>
            <div className="mt-6 space-y-4 text-lg leading-relaxed text-slate-600 dark:text-slate-300">
              <p>
                This site sets no cookies, runs no analytics, and embeds no third-party scripts. The
                only thing stored in your browser is your light/dark preference, in{" "}
                <span className="data text-[15px]">localStorage</span>, which never leaves it.
              </p>
              <p>
                Fonts are loaded from Fontshare and Google Fonts, which means those services see the
                request your browser makes for them. Downloading the installer contacts whatever host
                is serving it. Nothing else on this site makes a request anywhere.
              </p>
            </div>

            <div className="mt-8 flex items-start gap-4 rounded-[1.5rem] border border-accent-600/15 bg-accent-600/[0.06] p-6">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent-600 text-white">
                <Cookie size={18} />
              </span>
              <div>
                <p className="mb-1 font-display font-semibold text-slate-900 dark:text-slate-50">
                  No banner, because there is nothing to consent to
                </p>
                <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
                  A cookie banner exists to obtain consent for tracking. With no tracking to consent
                  to, the honest version of the banner is its absence.
                </p>
              </div>
            </div>

            <p className="mt-10 text-[15px] text-slate-500 dark:text-slate-400">
              Questions, or something here that does not match what the code does? Open an issue on{" "}
              <a
                href={`${site.github}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-accent-600 underline-offset-4 hover:underline dark:text-accent-400"
              >
                GitHub
              </a>{" "}
              — the repository is the authoritative version of this page.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/download"
                className="inline-flex items-center gap-2 rounded-2xl bg-accent-600 px-8 py-4 font-semibold text-white transition-colors hover:bg-accent-500"
              >
                Download Trace
              </Link>
              <Link
                href="/docs#controls"
                className="inline-flex items-center gap-2 rounded-2xl border border-black/10 px-8 py-4 font-semibold text-slate-900 transition-colors hover:bg-black/[0.03] dark:border-white/15 dark:text-slate-50 dark:hover:bg-white/[0.06]"
              >
                Privacy controls in the app
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
