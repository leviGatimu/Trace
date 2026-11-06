/**
 * One place for the facts that appear on every page. The version and the
 * installer name are duplicated in three places on a marketing site otherwise,
 * and the wrong one is always the one you forget.
 */
export const site = {
  name: "Trace",
  tagline: "Your computer, remembered.",
  description:
    "A private, local activity history for Windows. Trace records which applications you use and when, and gives you a searchable history of your day. Nothing leaves your machine.",
  url: "https://trace.app",
  version: "0.1.0",
  github: "https://github.com/leviGatimu/Trace",
} as const;

/**
 * The installer is served from `public/` so the site works offline and in
 * development. It is ~132 MB, which is too large for git — when this deploys,
 * point `installerHref` at the GitHub release asset instead and the rest of
 * the site needs no change.
 */
export const installer = {
  file: `Trace-Setup-${site.version}.exe`,
  href: `/Trace-Setup-${site.version}.exe`,
  size: "132 MB",
  platform: "Windows 10 1809 or later · 64-bit",
} as const;

export const requirementsSummary = `${installer.platform} · .exe (${installer.size}) · no administrator prompt`;
