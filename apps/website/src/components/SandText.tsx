"use client";

import { useEffect, useRef } from "react";

interface SandTextProps {
  lines?: string[];
  className?: string;
  colors?: string[];
  darkColors?: string[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  size: number;
  color: string;
}

const DEFAULT_COLORS = ["#6e9bff", "#5fb3a1", "#e0a458", "#c77dbb", "#8c8fe0", "#e0736b"];

/**
 * Renders the wordmark as thousands of grains on a canvas. The grains rest in
 * the shape of the text but scatter away from the pointer, then flow back into
 * place — the footer centrepiece, and a small joke about a record that can be
 * disturbed but always settles back to the truth.
 */
export default function SandText({
  lines = ["TRACE"],
  className,
  colors = DEFAULT_COLORS,
  darkColors,
}: SandTextProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointer = useRef({ x: -9999, y: -9999, active: false, vx: 0, vy: 0, px: 0, py: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let visible = false;
    let running = false;

    const build = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = parent.clientWidth;
      height = parent.clientHeight;
      if (width === 0 || height === 0) return;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Offscreen pass to rasterise the text and sample its opaque pixels.
      const off = document.createElement("canvas");
      off.width = width;
      off.height = height;
      const octx = off.getContext("2d");
      if (!octx) return;

      const longest = lines.reduce((a, b) => (a.length >= b.length ? a : b));
      const byWidth = (width * 0.92) / (longest.length * 0.66);
      const byHeight = (height * 0.9) / (lines.length * 1.05);
      const fontSize = Math.max(40, Math.min(byWidth, byHeight));
      octx.fillStyle = "#fff";
      octx.textAlign = "center";
      octx.textBaseline = "middle";
      octx.font = `700 ${fontSize}px "Clash Display", "Arial Black", system-ui, sans-serif`;

      const lineHeight = fontSize * 1.02;
      const totalHeight = lineHeight * lines.length;
      const startY = height / 2 - totalHeight / 2 + lineHeight / 2;
      lines.forEach((line, i) => octx.fillText(line, width / 2, startY + i * lineHeight));

      const data = octx.getImageData(0, 0, width, height).data;
      // Sampling density scales with text size so the grain count stays sane.
      const gap = Math.max(4, Math.round(fontSize / 38));

      const targets: { x: number; y: number }[] = [];
      for (let y = 0; y < height; y += gap) {
        for (let x = 0; x < width; x += gap) {
          if (data[(y * width + x) * 4 + 3] > 130) targets.push({ x, y });
        }
      }

      const palette =
        darkColors && document.documentElement.classList.contains("dark") ? darkColors : colors;

      // Reuse particles across rebuilds so a resize doesn't snap everything.
      const next: Particle[] = [];
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const existing = particles[i];
        next.push({
          x: existing ? existing.x : Math.random() * width,
          y: existing ? existing.y : Math.random() * height,
          vx: 0,
          vy: 0,
          tx: t.x,
          ty: t.y,
          size: gap <= 3 ? 1.6 : Math.random() < 0.5 ? 1.7 : 2.4,
          color: palette[(Math.random() * palette.length) | 0],
        });
      }
      particles = next;
    };

    const RADIUS = 130;

    const tick = () => {
      ctx.clearRect(0, 0, width, height);
      const p = pointer.current;

      for (let i = 0; i < particles.length; i++) {
        const grain = particles[i];

        // Pointer repulsion — pushes grains outward, harder the closer they are.
        if (p.active) {
          const dx = grain.x - p.x;
          const dy = grain.y - p.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < RADIUS * RADIUS) {
            const dist = Math.sqrt(dist2) || 1;
            const force = (RADIUS - dist) / RADIUS;
            grain.vx += (dx / dist) * force * 7 + p.vx * 0.06 * force;
            grain.vy += (dy / dist) * force * 7 + p.vy * 0.06 * force;
          }
        }

        // Spring back home + friction = a fluid settle.
        grain.vx += (grain.tx - grain.x) * 0.018;
        grain.vy += (grain.ty - grain.y) * 0.018;
        grain.vx *= 0.88;
        grain.vy *= 0.88;
        grain.x += grain.vx;
        grain.y += grain.vy;

        ctx.fillStyle = grain.color;
        ctx.fillRect(grain.x, grain.y, grain.size, grain.size);
      }

      p.vx *= 0.85;
      p.vy *= 0.85;
      if (visible && !reduce) raf = requestAnimationFrame(tick);
      else running = false;
    };

    const beginLoop = () => {
      if (reduce || running || !visible) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };

    const renderStatic = () => {
      ctx.clearRect(0, 0, width, height);
      for (const grain of particles) {
        ctx.fillStyle = grain.color;
        ctx.fillRect(grain.tx, grain.ty, grain.size, grain.size);
      }
    };

    const start = () => {
      build();
      renderStatic();
      beginLoop();
    };

    const movePointer = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const p = pointer.current;
      p.vx = x - p.px;
      p.vy = y - p.py;
      p.px = x;
      p.py = y;
      p.x = x;
      p.y = y;
      p.active = true;
    };

    const onMouseMove = (e: MouseEvent) => movePointer(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) movePointer(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onLeave = () => {
      pointer.current.active = false;
      pointer.current.x = -9999;
      pointer.current.y = -9999;
    };

    // Fonts must be ready before sampling, or the grains form the fallback face.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);
    else start();

    // Only animate while the wordmark is actually on screen.
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? false;
        if (visible) beginLoop();
      },
      { threshold: 0 }
    );
    io.observe(canvas);

    // Recolour the grains when the site theme is toggled.
    const themeObserver = new MutationObserver(() => start());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const onResize = () => start();
    window.addEventListener("resize", onResize);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("touchend", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("touchend", onLeave);
    };
  }, [lines, colors, darkColors]);

  return <canvas ref={canvasRef} className={className} aria-label={lines.join(" ")} role="img" />;
}
