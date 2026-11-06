"use client";

import { motion } from "framer-motion";
import { CloudOff, Lock, MousePointer2, Pause, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRef, type ReactNode, type RefObject } from "react";

/* ------------------------------------------------------------------ */
/*  Floaty: idle bob + drag-to-throw                                  */
/* ------------------------------------------------------------------ */

function Floaty({
  className,
  rotate = 0,
  float = 12,
  duration = 7,
  delay = 0,
  z = 20,
  constraints,
  children,
}: {
  className?: string;
  rotate?: number;
  float?: number;
  duration?: number;
  delay?: number;
  z?: number;
  constraints?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <motion.div
      drag
      dragConstraints={constraints as RefObject<Element>}
      dragElastic={0.15}
      dragMomentum
      dragTransition={{ bounceStiffness: 300, bounceDamping: 22 }}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.97 }}
      whileDrag={{ scale: 1.12, zIndex: 60 }}
      style={{ zIndex: z }}
      className={`cursor-grow pointer-events-auto absolute touch-none ${className ?? ""}`}
    >
      <motion.div
        style={{ rotate }}
        animate={{ y: [0, -float, 0] }}
        transition={{ repeat: Infinity, duration, ease: "easeInOut", delay }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Session cards — a row out of the record, made physical            */
/* ------------------------------------------------------------------ */

function SessionCard({
  app,
  window,
  time,
  length,
  color,
  dark = false,
}: {
  app: string;
  window: string;
  time: string;
  length: string;
  color: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`pointer-events-none flex h-[150px] w-[264px] flex-col justify-between rounded-[1.6rem] border border-white/40 p-6 shadow-[0_30px_60px_-22px_rgba(0,0,0,0.45)] ${
        dark ? "bg-ink-900 text-white" : "bg-white text-slate-900"
      }`}
    >
      <div className="flex items-start justify-between">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">
            Session
          </span>
        </span>
        <span className="data text-[12px] opacity-60">{time}</span>
      </div>
      <div>
        <p className="font-display text-[26px] font-semibold leading-none">{app}</p>
        <p className="mt-2 truncate text-[12px] font-medium opacity-60">{window}</p>
      </div>
      <p className="data text-[15px] font-medium" style={{ color }}>
        {length}
      </p>
    </div>
  );
}

const FAN = [
  {
    app: "Chrome",
    window: "GitHub — pull requests",
    time: "10:05",
    length: "30m",
    color: "#5fb3a1",
    pos: "left-[-2%] top-[13%]",
    rotate: -16,
    float: 9,
    dur: 7.5,
  },
  {
    app: "VS Code",
    window: "engine/SessionMachine.cs",
    time: "11:10",
    length: "1h 30m",
    color: "#6e9bff",
    pos: "left-[4%] top-[23%]",
    rotate: -9,
    float: 8,
    dur: 8,
    dark: true,
  },
  {
    app: "Terminal",
    window: "dotnet test",
    time: "15:50",
    length: "25m",
    color: "#7fb069",
    pos: "left-[10%] top-[33%]",
    rotate: -3,
    float: 11,
    dur: 6.5,
  },
  {
    app: "Illustrator",
    window: "trace-mark.ai",
    time: "20:30",
    length: "45m",
    color: "#8c8fe0",
    pos: "left-[14%] top-[43%]",
    rotate: 6,
    float: 9,
    dur: 7,
    dark: true,
  },
] as const;

/* ------------------------------------------------------------------ */

export default function Hero() {
  const stageRef = useRef<HTMLDivElement>(null);

  return (
    <section className="relative">
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#ececec] dark:bg-ink-900">
        <div
          ref={stageRef}
          className="relative flex flex-1 flex-col items-center justify-center px-6 pb-24 pt-32 text-center"
        >
          {/* ---- headline (sits under the draggable elements) ----
               Sized so "you doing at" still holds one line on a 375px phone. */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.21, 0.5, 0.3, 1] }}
            className="relative z-10 font-display text-5xl font-bold leading-[0.9] tracking-[-0.03em] text-slate-900 dark:text-slate-50 sm:text-7xl lg:text-[8rem] xl:text-[9.5rem]"
          >
            <span className="block">What were</span>
            <span className="block">you doing at</span>
            <span className="block text-accent-600 dark:text-accent-400">seven?</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25 }}
            className="relative z-10 mt-10 max-w-md text-lg leading-relaxed text-slate-600 dark:text-slate-300"
          >
            Trace keeps a private, local record of which applications you used and when — so any
            hour of any day can be reconstructed instead of guessed at.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="relative z-10 mt-11 flex flex-col items-center gap-4"
          >
            <Link
              href="/download"
              className="group relative inline-flex items-center gap-3 overflow-hidden rounded-2xl bg-ink-900 px-14 py-5 text-lg font-semibold text-white shadow-[0_24px_50px_-16px_rgba(0,0,0,0.6)] transition-transform hover:scale-[1.02] active:scale-95 dark:bg-white dark:text-ink-900"
            >
              <span className="relative z-10">Get Trace</span>
              <span className="absolute bottom-0 right-0 h-0 w-0 border-b-[34px] border-l-[34px] border-b-accent-500 border-l-transparent transition-all duration-300 group-hover:border-b-accent-400" />
            </Link>
            <p className="data text-[13px] text-slate-500 dark:text-slate-400">
              Free · Windows 10 / 11 · no account
            </p>
          </motion.div>

          {/* ---- draggable floating elements (over the text, lg and up) ---- */}
          <div className="pointer-events-none absolute inset-0 z-20 hidden lg:block">
            <div className="data pointer-events-none absolute left-[3%] top-[26%] -rotate-12 select-none text-[9rem] font-bold leading-none text-black/[0.05] dark:text-white/[0.05]">
              19:00
            </div>

            {FAN.map((c, i) => (
              <Floaty
                key={c.app}
                constraints={stageRef}
                rotate={c.rotate}
                className={c.pos}
                z={20 + i}
                float={c.float}
                duration={c.dur}
                delay={i * 0.2}
              >
                <SessionCard
                  app={c.app}
                  window={c.window}
                  time={c.time}
                  length={c.length}
                  color={c.color}
                  dark={"dark" in c ? c.dark : false}
                />
              </Floaty>
            ))}

            {/* pointer sticker */}
            <Floaty constraints={stageRef} rotate={-10} className="left-[19%] top-[60%]" z={26} float={7} duration={6}>
              <MousePointer2
                size={54}
                className="pointer-events-none fill-white text-white drop-shadow-[0_8px_14px_rgba(0,0,0,0.35)]"
              />
            </Floaty>

            {/* the pause switch — tracking is genuinely stoppable, so it gets a toggle */}
            <Floaty constraints={stageRef} rotate={-4} className="right-[15%] top-[13%]" z={30} float={16} duration={7.5}>
              <div className="pointer-events-none flex h-[64px] w-[116px] items-center justify-start rounded-full border-4 border-white bg-app-3 px-2 shadow-[0_24px_44px_-14px_rgba(0,0,0,0.4)]">
                <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-white text-slate-500 shadow-md">
                  <Pause size={18} className="fill-current" />
                </div>
              </div>
            </Floaty>

            {/* no cloud */}
            <Floaty constraints={stageRef} rotate={-8} className="right-[13%] top-[52%]" z={32} float={14} duration={6.8} delay={0.4}>
              <div className="pointer-events-none flex h-[98px] w-[98px] items-center justify-center rounded-[1.8rem] border-4 border-white bg-ink-900 shadow-[0_28px_50px_-16px_rgba(0,0,0,0.5)]">
                <CloudOff size={44} className="text-app-5" />
              </div>
            </Floaty>

            {/* privacy gate */}
            <Floaty constraints={stageRef} rotate={7} className="right-[26%] top-[64%]" z={31} float={12} duration={7.2} delay={0.6}>
              <div className="pointer-events-none flex h-[88px] w-[88px] items-center justify-center rounded-[1.8rem] border-4 border-white bg-white/70 shadow-[0_28px_50px_-16px_rgba(0,0,0,0.4)] backdrop-blur-md">
                <ShieldCheck size={42} className="text-accent-500" />
              </div>
            </Floaty>

            {/* local vault */}
            <Floaty constraints={stageRef} rotate={11} className="right-[6%] top-[66%]" z={34} float={15} duration={7} delay={0.2}>
              <div className="pointer-events-none flex h-[100px] w-[100px] items-center justify-center rounded-[2rem] border-4 border-white bg-gradient-to-br from-accent-400 to-accent-600 shadow-[0_30px_56px_-16px_rgba(52,92,226,0.6)]">
                <Lock size={42} className="text-white" />
              </div>
            </Floaty>
          </div>
        </div>
      </div>
    </section>
  );
}
