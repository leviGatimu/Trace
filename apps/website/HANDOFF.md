# HANDOFF

## Current Task
Build the marketing website for **Trace** (the app in
this repository), matching the structure and craft of the reference site at
`C:\Users\user\Downloads\Study Tracker Website` but carrying Trace's own
content, palette and installer.

## Status
**Solved.** The site is complete and builds clean. `npm run build` produces all
13 routes as static pages; `npx tsc --noEmit` is clean; every route returns 200
in dev and the installer downloads from `/Trace-Setup-0.1.0.exe`.

## Progress
- [x] Same stack as the reference: Next.js 16 App Router, React 19, Tailwind 3,
      framer-motion, Lenis, lucide-react
- [x] Shared chrome: Navbar, Footer, ThemeToggle, CustomCursor, SmoothScroll,
      ScrollReveal, Logo
- [x] Trace-specific components: `DayRibbon` (the signature, with hover
      read-out), `AppWindow` (Windows 11 chrome around real screenshots),
      `SandText` reworked to the TRACE wordmark
- [x] Pages: home, download, docs, about, privacy, support, terms, changelog, 404
- [x] Brand assets copied from `../../brand`; installer copied to `public/`
- [x] Build, typecheck and an HTTP smoke test of every route
- [ ] Full visual pass. Only `/` and `/download` have been looked at, at 1440px
      in dark mode (2026-11-06): the hero cards cover the "y" of "you".

## Working Notes

### Decisions made
- **Light canvas, dark on request.** The reference site is light (`#ececec`);
  Trace itself is near-black. The site keeps the reference's light canvas as the
  default and uses the application's real ground (`#0b0c0f`) for dark mode,
  rather than picking one and losing either the match or the identity.
- **Accent scale, not a single hex.** Trace's `#6e9bff` is too pale for text on
  a light page, so `tailwind.config.js` defines an `accent` scale with `#6e9bff`
  as 400 (used in dark mode) darkening to `#345ce2` at 600 for light. One hue,
  two grounds.
- **Windows chrome, not a MacBook.** The reference wraps its screenshot in a
  laptop mockup. Trace is a Windows application, so `AppWindow` draws a Windows
  11 title bar instead.
- **No invented contact channels.** Trace has no Discord, YouTube or support
  address, so Support routes everything to GitHub issues and discussions.
- **The architecture diagram is drawn, not typed.** It started as the ASCII
  diagram lifted from `../../README.md`. That reads as a terminal artifact
  to anyone who is not a developer, and box-drawing characters need a monospaced
  grid the page does not have, so it fell apart on narrow screens.
  `ArchitectureDiagram.tsx` rebuilds it in markup: it reflows to a vertical
  stack below `lg`, highlights PrivacyGate as the only route to storage, and
  carries an `sr-only` prose description because the visual is `aria-hidden`.
- **No licence claimed.** the repository root has no `LICENSE` file, so `/terms` says
  the licence covering the *source* is whatever the repository states, and only
  governs the compiled app and the website itself. If a licence is added, that
  paragraph should be updated.

### Facts the copy depends on
Pulled from `../../README.md`, `HANDOFF.md` and `git log` — if these change,
the site is stale: version `0.1.0`, installer 132 MB, 122 tests, six app pages
(Overview, Timeline, Applications, Calendar, Analytics, Search) plus Settings,
paths `%LOCALAPPDATA%\Programs\Trace` and `%LOCALAPPDATA%\Trace\Data\activity.db`.

### Next step on resume
Run `npm run dev`, walk every page at 375px, 768px and 1440px in both themes,
and check the hero's draggable cards do not collide with the headline at
1024–1280px. Then set `site.url` and move the installer to a GitHub release.

## Recently Completed
- Moved into the Trace repository as the `apps/website` npm workspace. `next`
  is hoisted, so `turbopack.root` points at the repository root. Run with
  `npm run dev:website` from there.
- Replaced the ASCII architecture diagram on the home page with a real,
  responsive one (`ArchitectureDiagram.tsx`).
- Site scaffolded, built and verified end to end in one pass.
