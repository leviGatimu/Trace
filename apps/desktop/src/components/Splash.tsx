import { useEffect, useState } from 'react';

const DURATION_MS = 2900;
const SEEN_KEY = 'trace.splash.seen';

/**
 * The opening sequence, played once per launch.
 *
 * A point of light starts recording: a trace line draws out from it and
 * activity pulses along the line. The pulses settle, the Trace mark lands, and
 * the name rises in. Then the whole thing lifts away and the app is there.
 *
 * Any click or key skips it. With reduced motion it is not shown at all.
 */
export function Splash() {
  const [phase, setPhase] = useState<'playing' | 'leaving' | 'done'>(() => {
    try {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'done';
      return window.sessionStorage.getItem(SEEN_KEY) ? 'done' : 'playing';
    } catch {
      return 'playing';
    }
  });

  // Settings > Display can ask for it again.
  useEffect(() => {
    const replay = () => setPhase('playing');
    window.addEventListener('trace:replay-splash', replay);
    return () => window.removeEventListener('trace:replay-splash', replay);
  }, []);

  useEffect(() => {
    if (phase !== 'playing') return;
    try {
      window.sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Storage unavailable: the splash simply plays again next time.
    }

    const leave = window.setTimeout(() => setPhase('leaving'), DURATION_MS);
    const skip = () => setPhase('leaving');
    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('mousedown', skip, { once: true });
    return () => {
      window.clearTimeout(leave);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('mousedown', skip);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const done = window.setTimeout(() => setPhase('done'), 650);
    return () => window.clearTimeout(done);
  }, [phase]);

  if (phase === 'done') return null;

  // Activity pulses along the trace line: heights in px, chosen to read as a
  // day's rhythm rather than a random graph.
  const pulses = [14, 26, 18, 40, 30, 58, 36, 22, 48, 28, 16, 34, 20, 12];

  return (
    <div
      className={`splash drag fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#030304] ${
        phase === 'leaving' ? 'splash-leave' : ''
      }`}
      aria-hidden
    >
      {/* Ambient glow that breathes behind everything */}
      <div className="splash-glow pointer-events-none absolute h-[520px] w-[520px] rounded-full" />

      {/* The trace: a line drawn out from the centre, with activity pulsing on it */}
      <div className="splash-trace absolute flex h-[80px] w-[560px] items-center justify-center">
        <span className="splash-line absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2" />
        <div className="relative flex h-full items-center gap-[14px]">
          {pulses.map((height, index) => (
            <span
              key={index}
              className="splash-pulse w-[5px] rounded-full"
              style={{ height, '--i': Math.abs(index - (pulses.length - 1) / 2) } as React.CSSProperties}
            />
          ))}
        </div>
        <span className="splash-spark absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full" />
      </div>

      {/* The mark and the name */}
      <div className="relative flex flex-col items-center">
        <svg className="splash-mark" width="96" height="108" viewBox="0 0 16 18" fill="none">
          <rect className="splash-bar" x="0" y="0" width="16" height="3.2" rx="1.6" fill="#f5f5f7" />
          <rect className="splash-stem" x="6.4" y="5" width="3.2" height="6.4" rx="1.6" fill="#f5f5f7" />
          <circle className="splash-dot" cx="8" cy="15.4" r="2.5" fill="#2f6bff" />
        </svg>

        <div className="mt-7 flex overflow-hidden text-[46px] font-medium leading-none tracking-[-0.03em] text-[#f5f5f7]">
          {'Trace'.split('').map((letter, index) => (
            <span key={index} className="splash-letter inline-block" style={{ '--i': index } as React.CSSProperties}>
              {letter}
            </span>
          ))}
        </div>
        <p className="splash-tagline mt-3 text-[14px] tracking-[0.02em] text-[#8e8e95]">Your PC, on the record. Only for you.</p>
      </div>

      <p className="splash-hint absolute bottom-8 text-[12px] text-[#4a4a50]">Click anywhere to skip</p>
    </div>
  );
}
