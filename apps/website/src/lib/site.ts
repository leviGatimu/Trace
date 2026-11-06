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
  url: "https://trace-nu-nine.vercel.app",
  version: "0.1.0",
  github: "https://github.com/leviGatimu/Trace",
} as const;

/**
 * The installer is a GitHub release asset: at ~132 MB it is over the limit for
 * both git and a Vercel deployment. Releasing a new version means uploading the
 * asset to the tag `v<version>`, then changing `site.version` above.
 */
export const installer = {
  file: `Trace-Setup-${site.version}.exe`,
  href: `${site.github}/releases/download/v${site.version}/Trace-Setup-${site.version}.exe`,
  size: "132 MB",
  platform: "Windows 10 1809 or later · 64-bit",
} as const;

export const requirementsSummary = `${installer.platform} · .exe (${installer.size}) · no administrator prompt`;
