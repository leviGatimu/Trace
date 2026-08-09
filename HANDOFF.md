# HANDOFF

## Current Task
Building **Trace** — a private, local-only Windows activity-history desktop app
(Electron/React UI + separate C#/.NET background tracker + local SQLite).
Following `DOCS/IMPLEMENTATION-PLAN.md`, which is derived from `DOCS/` and is the
binding technical spec.

## Status
**In progress — Milestones 1–6 complete and verified.**
Trace now runs end to end: tracker records → pipe → dashboard renders.
Next up: Milestone 7, privacy controls (Settings, exclusions, delete, export).

## Progress
- [x] Documentation audit; `DOCS/IMPLEMENTATION-PLAN.md`; 5 decisions resolved
- [x] **Milestone 1 — foundation**: repo, git, npm workspaces, IPC contract
      (spec + TS + C# mirror), tracker project, paths, privacy-aware logging
- [x] **Milestone 2 — tracker proof of concept**: Win32 layer verified live
- [x] **Milestone 3 — session engine**: pure state machine, 32 tests
- [x] **Milestone 4 — database**: schema + migrations, `TraceDatabase`,
      repositories, `PrivacyGate`, `SettingsStore`, crash recovery, retention.
      Engine wired into `TrackerHost`. **54 tests pass.** Verified end to end on
      this machine: recorded real activity, killed the process, restarted, and
      watched it recover the interrupted session at the last heartbeat.
- [x] **Milestone 5 — IPC**: named pipe with per-user DACL, NDJSON framing,
      all 17 contract methods, read models through `SessionMerger`, search,
      export, deletes. **74 tests.** Verified over a live pipe with `--probe`.
- [x] **Milestone 6 — core UI**: Electron + React + TypeScript + Tailwind 4.
      Pipe client with reconnect, shell, Overview, Timeline, Applications
      (+ detail), Search, session detail panel, live activity. **13 UI tests**
      (87 across the repo). Runs against the real tracker.
- [ ] **Milestone 7 — privacy controls** (next)
- [ ] Milestones 8–10

## Working Notes

### Decisions locked with the owner (plan §14)
- **A** Retention default → **Forever**
- **B** Search → **a fifth sidebar page** (Overview · Timeline · Applications ·
  Search — Settings). The Ctrl+K palette still ships and can jump to it.
- **C** IPC → **named pipe** `\\.\pipe\Trace.<SID>`, per-user DACL
- **D** Install → **per-user** `%LOCALAPPDATA%\Programs\Trace`, no UAC
- **E** Midnight-crossing sessions → attributed to local day of `started_at`

### How to run it today
```
TraceTracker.exe              # record + serve IPC (no tray or quit yet - Milestone 8)
TraceTracker.exe --diagnose   # live Win32 + engine trace, writes nothing
TraceTracker.exe --dump       # print the recorded history, read-only
TraceTracker.exe --probe      # exercise the IPC contract against a running tracker
TraceTracker.exe --help

cd apps/desktop && npm run dev     # dashboard against the running tracker
cd apps/desktop && npm run build   # dist/ (renderer) + dist-electron/ (main, preload)
```
Start the tracker first; without it the dashboard shows its "Tracker
unavailable / Restart Tracker" state, which is worth seeing at least once.
Data lives in `%LOCALAPPDATA%\Trace`. There is real activity data there from
development testing; delete `Data\activity.db*` to start clean.

### Architecture in place
- **`PrivacyGate` is the only route from engine to storage.** The engine depends
  on `IActivitySink` and holds no repository. Creating a record is gated;
  *finishing* one is not — otherwise pausing would strand the open session and it
  would be misreported as a crash next start.
- **Tracker is sole owner of `activity.db`.** One write connection behind a lock;
  readers get their own connections (WAL).
- **Crash recovery** closes interrupted sessions at `tracker_state.last_heartbeat`
  using the active/idle split the heartbeat stored, so recovery is accurate
  rather than a guess. Under-attributes by at most one heartbeat (30 s).
- **Run marker** (`%LOCALAPPDATA%\Trace\tracker.running`) decides whether to run
  an integrity check — that question has to be answered before the database is
  opened, so it cannot live in a table.
- **Window sessions are written on completion**, with a 5-second floor. See the
  finding below.
- **Paused survives reboot** (settings), and an unreadable `settings.json` falls
  back to *paused*, never to recording.

### Findings from running it for real
1. **Window-title churn — fixed.** A terminal with a progress spinner produced
   nine window sessions in seconds; unbounded, machine-driven, tens of thousands
   of rows a day. Window sessions are now held in memory and written only on
   completion and only if they lasted ≥ 5 s (plan §7). Trade-offs accepted:
   window durations don't sum to session duration, and the in-progress window is
   lost on a crash (the application session is not).
2. **Recovered sessions could contain windows outlasting them — fixed.** A window
   completing after the last heartbeat is still written; recovery now clamps it
   back inside the recovered session end.
3. **Alt-Tab noise — by design.** Eight sessions in nine seconds, mostly 0 s,
   including the `explorer.exe "Task Switching"` overlay. Kept raw per
   `Tracking.md` §F; **Milestone 5 must apply the same `minSessionSeconds` merge
   to every read model**, or a naive `sessionCount` ranks File Explorer among the
   most-used apps.
4. **Published tracker is 136 MB** (self-contained, WinForms + full BCL). Fine
   for now; revisit at Milestone 8 — trimming is the first thing to try.
5. **Coalescing bridged a gap — fixed (Milestone 5).** Two stretches of the same
   application from two different runs of Trace, an hour apart, merged into one
   timeline row spanning time nothing was recorded for. `SessionMerger` now
   refuses to coalesce across a gap: sessions are contiguous by construction, so
   any real gap means Trace was not running.
6. **`E_INTERNAL` hides the cause by design**, and tests do not initialise `Log`.
   Debugging a failing handler in a test means reading the SQL, not a message —
   it cost one round-trip on a compound-`SELECT` syntax error. Acceptable
   (leaking exception text to a client could leak a window title), but worth
   knowing before Milestone 6 adds more query surface.

### Build notes worth keeping
- TFM `net10.0-windows10.0.17763.0`; `AllowUnsafeBlocks` required by
  `[LibraryImport]`; buffer-filling Win32 calls take `char*`, not `char[]`.
- `Microsoft.Data.Sqlite` still resolves SQLitePCLRaw 2.1.11 (GHSA-2m69-gcr7-jv3q,
  high). Pinned forward via `SQLitePCLRaw.bundle_e_sqlite3 3.0.5`.
- `UseWindowsForms` + implicit usings makes bare `Timer` ambiguous — write
  `System.Threading.Timer`.
- PowerShell 5.1 mangles native-command arguments containing double quotes. Use
  `git commit -F <file>` for commit messages.

### Milestone 5 notes
- `RequestRouter` takes a string and returns a string — no transport in it — so
  the whole contract is testable without a pipe or a running tracker.
- `SessionEngine.Current` publishes an immutable snapshot including `AsOfUtcMs`.
  IPC threads must read that, never `TrackerState`, which only the queue
  consumer may touch. The handler extends whichever counter is running up to
  now, so the live timer ticks smoothly between transitions.
- `TimelineEntry` needs `[JsonPolymorphic]`; without it a `List<TimelineEntry>`
  serialises every element as the base type and the UI gets rows containing
  nothing but a discriminator.
- Pause/resume writes the setting **before** posting the signal, in both
  directions. On pause the gate refuses new records from the instant of the
  click; on resume it is already open when the engine starts a session.

### Milestone 6 notes
- **Build**: Vite for the renderer, esbuild for main + preload (`scripts/
  build.mjs`, `scripts/dev.mjs`). No Electron/Vite plugin — two entry points and
  one platform did not justify another dependency between us and the tools.
  Editing main/preload needs a restart; renderer hot-reloads.
- **Main and preload are CommonJS**, so `import.meta.url` is empty there —
  use `__dirname`. Getting this wrong resolves preload and `index.html` to the
  wrong place and the window comes up blank with no error.
- **CSP** is strict in `index.html` and relaxed by a Vite plugin for `dev` only.
- **Renderer has no Node.** `contextIsolation: true`, `nodeIntegration: false`;
  the whole surface is five methods in `electron/preload.ts`.
- **`QueryClient` is created per App mount**, not at module scope — otherwise
  one test sees another's cache (it silently broke two tests and made the suite
  4× slower).
- **Testing Library's 1s default timeout is too short here**; raised to 5s in
  `src/test/vitest.setup.ts`.
- The global CLAUDE.md asks for UI components from the Magic MCP server first.
  Those tools are not available in this environment, so components are
  hand-written to the palette and layout in `DOCS/UI and UX-design.md`.

### Exact next step on resume
**Milestone 7 — privacy controls.** The settings surface is the product's
privacy centre (`DOCS/Privacy.md` §25), not a checkbox page.

1. Settings page (fifth nav item, below the separator): Tracking, Activity
   collected, Window titles, Excluded applications, Your data, Data location.
2. Pause/resume from the UI via `tracking.pause` / `tracking.resume` — already
   wired in the contract and tested; needs the control.
3. Excluded applications: add/remove, and the "also delete existing history for
   this application" choice (`DOCS/Privacy.md` §8) → `data.deleteApplication`.
4. Delete: date range and delete-everything, with the literal confirmation the
   contract requires.
5. Export: a save dialog in the main process, then `data.export` with an
   absolute path.
6. Onboarding (`DOCS/Privacy.md` §26): the privacy explanation and collection
   choices, gated on `settings.onboardingCompleted`. Frame it as **consent**,
   not a permission request — nothing here needs a Windows permission
   (plan §13.4).
7. Verify by inspection *and* by dump: exclude an application, use it, and
   confirm `--dump` shows nothing for it.

## Recently Completed
- Milestone 4 — database, privacy gate, settings, crash recovery (2026-08-09).
- Milestone 3 — session engine with the tracking rules under test (2026-08-09).
- Milestone 2 — tracker proof of concept verified on real Windows (2026-08-09).
- Milestone 1 — project foundation, contracts, logging, build (2026-08-09).
