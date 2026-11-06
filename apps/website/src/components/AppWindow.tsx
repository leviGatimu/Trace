"use client";

import { motion } from "framer-motion";
import Image from "next/image";

/**
 * A Windows 11 window frame wrapped around a real screenshot. The product is a
 * Windows desktop application, so the chrome is Windows chrome — a laptop
 * mockup would be borrowing someone else's platform.
 */
export default function AppWindow({
  src,
  alt,
  caption,
  priority = false,
  className = "",
}: {
  src: string;
  alt: string;
  caption?: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <motion.figure
      initial={{ y: 40, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 1, ease: [0.21, 0.5, 0.3, 1] }}
      className={`relative mx-auto w-full ${className}`}
    >
      <div className="overflow-hidden rounded-[0.9rem] border border-black/15 bg-ink-950 shadow-[0_50px_100px_-35px_rgba(11,12,15,0.65)] dark:border-white/10">
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-ink-950 px-3 py-2">
          <span className="flex items-center gap-2">
            <Image src="/logo.png" alt="" width={16} height={16} className="rounded-[4px]" />
            <span className="text-[11px] font-medium tracking-[0.18em] text-slate-400">TRACE</span>
          </span>
          <span className="flex items-center gap-4 text-slate-500" aria-hidden="true">
            {/* Segoe-style caption glyphs, drawn rather than typed. */}
            <span className="block h-px w-2.5 bg-current" />
            <span className="block h-2 w-2 border border-current" />
            <span className="relative block h-2.5 w-2.5">
              <span className="absolute left-0 top-1/2 h-px w-full rotate-45 bg-current" />
              <span className="absolute left-0 top-1/2 h-px w-full -rotate-45 bg-current" />
            </span>
          </span>
        </div>

        <Image
          src={src}
          alt={alt}
          width={1683}
          height={974}
          priority={priority}
          sizes="(max-width: 1024px) 100vw, 900px"
          className="block h-auto w-full"
        />
      </div>

      {caption && (
        <figcaption className="mt-4 text-center text-[13px] text-slate-500 dark:text-slate-400">
          {caption}
        </figcaption>
      )}
    </motion.figure>
  );
}
