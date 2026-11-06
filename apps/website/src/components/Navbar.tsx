"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

const links = [
  { label: "Features", href: "/#features" },
  { label: "Privacy", href: "/privacy" },
  { label: "Docs", href: "/docs" },
  { label: "Support", href: "/support" },
];

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // A route change should never leave the mobile sheet hanging open.
  useEffect(() => setIsMenuOpen(false), [pathname]);

  return (
    <nav
      className={`fixed top-0 z-[100] w-full transition-all duration-300 ${
        scrolled ? "nav-blur py-3" : "bg-transparent py-6"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
        <Logo size={34} />

        <div className="hidden items-center gap-10 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors hover:text-slate-900 dark:hover:text-white ${
                pathname === link.href
                  ? "text-slate-900 dark:text-slate-50"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <ThemeToggle />
          <Link
            href="/download"
            className="group flex items-center gap-2 rounded-xl bg-accent-600 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(52,92,226,0.7)] transition-colors hover:bg-accent-500"
          >
            Download
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            className="p-1 text-slate-900 dark:text-slate-50"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-expanded={isMenuOpen}
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          >
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute left-0 top-full flex w-full flex-col gap-6 border-b border-black/5 bg-white px-6 py-6 shadow-2xl dark:border-white/10 dark:bg-ink-900 md:hidden"
          >
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-lg font-semibold text-slate-900 dark:text-slate-50"
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/download"
              className="rounded-2xl bg-accent-600 py-4 text-center font-semibold text-white"
              onClick={() => setIsMenuOpen(false)}
            >
              Download for Windows
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
