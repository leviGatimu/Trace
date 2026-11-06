"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={`relative w-10 h-10 rounded-xl border border-black/10 dark:border-white/15 bg-white/60 dark:bg-white/5 text-slate-700 dark:text-slate-200 flex items-center justify-center hover:text-slate-900 dark:hover:text-white hover:border-black/20 dark:hover:border-white/30 transition-colors ${className}`}
    >
      {/* Nothing theme-specific renders until mounted, to avoid a hydration mismatch. */}
      {mounted && (dark ? <Sun size={18} className="text-app-2" /> : <Moon size={18} />)}
    </button>
  );
}
