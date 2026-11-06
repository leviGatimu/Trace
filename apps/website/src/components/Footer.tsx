import { ArrowUpRight, Bug, Github, Package } from "lucide-react";
import Link from "next/link";
import Logo from "@/components/Logo";
import SandText from "@/components/SandText";
import { site } from "@/lib/site";

// Stable references so SandText doesn't rebuild its grains on every render.
const INK_GRAINS = ["#000000", "#070707", "#0d0d0d", "#050505", "#111111", "#030303"];
const APP_GRAINS = ["#6e9bff", "#5fb3a1", "#e0a458", "#c77dbb", "#8c8fe0", "#7fb069"];

const columns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Download", href: "/download" },
      { label: "Documentation", href: "/docs" },
      { label: "What's new", href: "/changelog" },
      { label: "Roadmap", href: "/download#roadmap" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "About", href: "/about" },
      { label: "Support", href: "/support" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
  {
    title: "Source",
    links: [
      { label: "GitHub", href: site.github, external: true },
      { label: "Releases", href: `${site.github}/releases`, external: true },
      { label: "Issues", href: `${site.github}/issues`, external: true },
      { label: "Build from source", href: "/docs#build" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-black/10 bg-[#ececec] text-slate-600 dark:border-white/10 dark:bg-ink-900 dark:text-slate-300">
      <div className="relative mx-auto max-w-7xl px-6 pt-28">
        <div className="grid gap-12 border-b border-black/10 pb-24 dark:border-white/10 md:grid-cols-12">
          {/* brand + CTA */}
          <div className="space-y-8 md:col-span-5">
            <Logo
              size={40}
              textClassName="font-display text-2xl font-semibold tracking-[0.14em] text-slate-900 dark:text-slate-50"
            />
            <p className="max-w-sm text-lg leading-relaxed text-slate-500 dark:text-slate-400">
              A private, local activity history for Windows. No account, no server, no telemetry —
              your day stays on your machine.
            </p>
            <Link
              href="/download"
              className="group inline-flex items-center gap-3 rounded-2xl bg-ink-900 py-4 pl-7 pr-5 font-semibold text-white shadow-[0_18px_40px_-14px_rgba(11,12,15,0.6)] transition-colors hover:bg-ink-700 dark:bg-white dark:text-ink-900 dark:hover:bg-slate-200"
            >
              Download free
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-600 text-white transition-transform group-hover:rotate-45">
                <ArrowUpRight size={16} />
              </span>
            </Link>
            <div className="flex gap-5 pt-2">
              <a
                href={site.github}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Trace on GitHub"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 transition-colors hover:border-accent-500 hover:text-accent-600 dark:border-white/10 dark:hover:text-accent-400"
              >
                <Github size={18} />
              </a>
              <a
                href={`${site.github}/releases`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Releases"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 transition-colors hover:border-accent-500 hover:text-accent-600 dark:border-white/10 dark:hover:text-accent-400"
              >
                <Package size={18} />
              </a>
              <a
                href={`${site.github}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Report an issue"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 transition-colors hover:border-accent-500 hover:text-accent-600 dark:border-white/10 dark:hover:text-accent-400"
              >
                <Bug size={18} />
              </a>
            </div>
          </div>

          {/* link columns */}
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 md:col-span-7">
            {columns.map((col) => (
              <div key={col.title}>
                <h3 className="mb-6 text-xs font-semibold uppercase tracking-[0.25em] text-accent-600 dark:text-accent-400">
                  {col.title}
                </h3>
                <ul className="space-y-4 text-[15px]">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        {...("external" in link && link.external
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="group inline-flex items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                      >
                        {link.label}
                        {"external" in link && link.external && (
                          <ArrowUpRight
                            size={13}
                            className="opacity-0 transition-opacity group-hover:opacity-100"
                          />
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* bottom meta */}
        <div className="flex flex-col items-center justify-between gap-4 py-8 text-xs text-slate-400 dark:text-slate-500 md:flex-row">
          <p>
            © {new Date().getFullYear()} Trace — built for people who want to remember their own
            day.
          </p>
          <div className="flex gap-8">
            <Link href="/terms" className="transition-colors hover:text-slate-900 dark:hover:text-slate-200">
              Terms
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-slate-900 dark:hover:text-slate-200">
              Privacy
            </Link>
            <span className="data">v{site.version}</span>
          </div>
        </div>
      </div>

      {/* Giant interactive wordmark */}
      <div className="relative w-full select-none">
        <div className="h-[26vw] min-h-[200px] w-full max-h-[380px]">
          <SandText
            lines={["TRACE"]}
            colors={INK_GRAINS}
            darkColors={APP_GRAINS}
            className="h-full w-full cursor-none touch-none"
          />
        </div>
        <p className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
          Drag your cursor through the grains
        </p>
      </div>
    </footer>
  );
}
