import Image from "next/image";
import Link from "next/link";

interface LogoProps {
  size?: number;
  withText?: boolean;
  textClassName?: string;
  href?: string;
}

/**
 * Brand mark — the seriffed T from `tools/Trace.IconForge`, plus the wordmark.
 * The mark is drawn light-on-dark, so it keeps its own dark tile on the light
 * theme rather than being recoloured.
 */
export default function Logo({ size = 36, withText = true, textClassName, href = "/" }: LogoProps) {
  const content = (
    <span className="inline-flex items-center gap-2.5">
      <Image
        src="/logo.png"
        alt=""
        width={size}
        height={size}
        className="rounded-[26%] bg-ink-900"
        priority
      />
      {withText && (
        <span
          className={
            textClassName ??
            "font-display text-xl font-semibold tracking-[0.14em] text-slate-900 dark:text-slate-50"
          }
        >
          TRACE
        </span>
      )}
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} className="inline-flex items-center" aria-label="Trace — home">
      {content}
    </Link>
  );
}
