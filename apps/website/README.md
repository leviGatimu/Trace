# Trace — website

The marketing site for [Trace](../../README.md) — a private, local activity history
for Windows.

Next.js (App Router) · React · TypeScript · Tailwind · framer-motion · Lenis.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
```

## Layout

```
src/
  app/
    page.tsx          the landing page — hero, ribbon, features, privacy, architecture
    download/         platforms, what happens after install, roadmap
    docs/             one long page with a sticky, scroll-spied table of contents
    about/            why the product exists
    privacy/          the privacy position — what is and is not recorded
    support/          where to file, what to include, FAQ
    terms/            terms of use
    changelog/        releases, with fixes named
    globals.css       theme tokens, the grain, the custom cursor, dark mode
  components/
    Hero.tsx          full-screen hero with draggable session cards
    DayRibbon.tsx     the product's signature, redrawn for the web
    AppWindow.tsx     a Windows 11 frame around a real screenshot
    SandText.tsx      the footer wordmark as scatterable grains
    ...
  lib/site.ts         version, installer name and links — the single source of truth
public/
  screenshots/        real captures from the application
```

## Before deploying

**The installer is not part of the site.** The download buttons link to the
GitHub release asset for `site.version` in `src/lib/site.ts`, so a new version
needs its release published before the site is deployed. To build it:
`npm run installer`.

**On Vercel, set Root Directory to `apps/website`.** It is a workspace of this
repository, and `next` is installed at the repository root.

## Design notes

The palette is the application's own: accent `#6e9bff`, the near-black canvas
`#0b0c0f`, and the eight hues Trace hashes application names onto — so a ribbon
on the website is made of the same colours as a ribbon in the product.

Every time and duration on the site uses the `.data` class: monospaced and
tabular, the same rule the application follows. Numbers that will be compared
are set in a face that lets you compare them without reading them.

The site is light by default and dark on request; the dark theme is the
application's ground, not a dimmed version of the light one.
