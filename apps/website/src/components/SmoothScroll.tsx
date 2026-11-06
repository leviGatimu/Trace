"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Wraps the site in inertial scrolling. Lenis still drives the native scroll
 * position, so framer-motion's viewport detection keeps working everywhere.
 */
export default function SmoothScroll() {
  useEffect(() => {
    // Respect visitors who prefer reduced motion.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Route in-page anchor links through Lenis so they glide rather than jump.
    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('a[href^="/#"], a[href^="#"]');
      if (!target) return;
      const href = target.getAttribute("href") || "";
      const id = href.split("#")[1];
      const el = id ? document.getElementById(id) : null;
      if (el) {
        e.preventDefault();
        lenis.scrollTo(el, { offset: -80 });
      }
    };
    document.addEventListener("click", onClick);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("click", onClick);
      lenis.destroy();
    };
  }, []);

  return null;
}
