import { ArrowLeft, Download, Search } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-32">
      <div className="grain" />
      <div className="mx-auto max-w-2xl text-center">
        <p className="data text-[11px] font-bold uppercase tracking-[0.4em] text-accent-600 dark:text-accent-400">
          404
        </p>
        <h1 className="mt-5 font-display text-5xl font-semibold leading-[0.95] tracking-tight text-slate-900 dark:text-slate-50 md:text-7xl">
          No record of <br />
          <span className="text-accent-600 dark:text-accent-400">this page.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-slate-500 dark:text-slate-400">
          A gap in the ribbon usually has an explanation. This one is simpler than most: the address
          does not exist.
        </p>

        {/* A ribbon with a hole in it, which is the whole joke. */}
        <div
          className="mx-auto mt-12 flex h-12 w-full max-w-md overflow-hidden rounded-lg bg-black/[0.05] dark:bg-white/[0.04]"
          aria-hidden="true"
        >
          <span className="h-full w-[22%] bg-app-1" />
          <span className="h-full w-[14%] bg-app-3" />
          <span className="h-full w-[28%]" />
          <span className="h-full w-[10%] bg-app-2" />
          <span className="h-full w-[26%] bg-app-1/70" />
        </div>

        <div className="mt-12 flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ink-900 px-9 py-4 font-semibold text-white transition-colors hover:bg-ink-700 dark:bg-white dark:text-ink-900 dark:hover:bg-slate-200"
          >
            <ArrowLeft size={18} /> Back home
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 px-9 py-4 font-semibold text-slate-900 transition-colors hover:bg-black/[0.03] dark:border-white/15 dark:text-slate-50 dark:hover:bg-white/[0.06]"
          >
            <Search size={18} /> Search the docs
          </Link>
          <Link
            href="/download"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 px-9 py-4 font-semibold text-slate-900 transition-colors hover:bg-black/[0.03] dark:border-white/15 dark:text-slate-50 dark:hover:bg-white/[0.06]"
          >
            <Download size={18} /> Download
          </Link>
        </div>
      </div>
    </div>
  );
}
