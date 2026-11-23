# HANDOFF

## Current Task — tamper protection (2026-11-23), BUILT, NOT INSTALLED
Owner asked that someone using the laptop cannot simply switch Trace off.
Owner chose: all of it (PIN + auto-restart + settings-file repair + tamper
log) with a separate Trace PIN. Told plainly: it cannot be made impossible
on the same Windows account without stealth/admin software; it makes
stopping hard and always visible.

- Tracker: `Protection/` (Secrets = PBKDF2-SHA256 600k + 16-byte salt,
  recovery code XXXX-XXXX-XXXX-XXXX; GuardedSettings = which settings need
  the PIN to turn DOWN; ProtectionService = Demand/Setup/Unlock/Lock/Disable,
  lockout 5 tries then 1 min doubling to 1 h, persisted; tamper log).
  Migration 005 (`protection`, `tamper_log`), schema v5.
- Enforced in the tracker (RequestRouter: pause, settings weakening, all
  deletes; tray Pause/Quit via `Tray/PinPrompt.cs`). New error `E_LOCKED`,
  IPC `protection.status|setup|unlock|lock|disable|log`. Unlock lasts 5 min.
- Auto-restart: `Windows/AutoRestartTask.cs`, per-user scheduled task
  "Trace Recorder" (logon + every minute, IgnoreNew, no time limit,
  unelevated, visible) running `TraceTracker.exe --watchdog`. A watchdog
  launch that finds Trace running exits before logging. Checked every 60 s
  and reinstalled + logged if removed/disabled. Quit with PIN disables it
  (marker `quit-with-pin`); installer disables it and writes `updating`
  (installer.nsh); uninstall deletes it. Sandbox never touches it.
- Startup logs `unexpected-stop` (run marker left = ended/crash/power loss,
  from last heartbeat to now), `updated`, `new-history`; a hand-edited or
  unreadable settings.json is put back from the DB snapshot when a PIN is set.
- Dashboard: `services/trace.ts` asks for the PIN on E_LOCKED and retries;
  `components/PinGate.tsx`; `pages/ProtectionPage.tsx` (/protection, shield
  in the rail with a badge for unseen entries; link in Settings menu);
  `hooks/useProtection.ts`.
- Tests: tracker 180 pass (15 in ProtectionTests; opt-in
  `TRACE_REAL_TASK=1` AutoRestartTaskCheck registered a throwaway task with
  real Windows and removed it — passed). Desktop 35 pass, typecheck clean.
- **Installed 0.3.0 on the owner's PC (2026-11-23 13:10)**, data kept.
  Backup: `Documents\Trace backup before 0.3.0 (2026-11-23)`; tracker's own
  `activity.pre-v4-20261123-111053.db`. Migration 005 applied, tamper log
  got its "updated" entry. Versions are 0.3.0 everywhere. Committed and merged to main (2026-11-23),
  NOT released, website still 0.1.0.
- Next step: owner sets a PIN on the Protection page (their choice, never
  ours), then end TraceTracker.exe and confirm it is back within a minute
  with an `unexpected-stop` entry and the "Trace Recorder" task present.

## Earlier task
**Trace 2.0 — Activity Intelligence (2026-11-21).** Plan: `DOCS/product/trace-2.0-plan.md`.
Phase 1 audit done; owner chose **option A** (poll own-user processes, opt-in,
no command lines). **Phase 2 (application identity) built, all tests green,
UNCOMMITTED and UNRELEASED.**

What phase 2 changed: names now come from registry → package manifest →
version info → filename (`Identity/`). Migration 002 adds `applications.category,
package_family, identity_source, identity_version` and `sessions.process_id`.
`IdentityBackfill` re-names history once per resolver version, in the background
at startup, touching only `applications` presentation columns. A filename guess
never overwrites a recorded name. UI: a window title that only repeats the app
name is hidden; the Applications list shows the executable when names collide.

Gotchas found on the way: a package folder's ResourceId is usually EMPTY
(`_x64__pub`); static fields initialise in textual order (registry JSON options
must precede `Default`); `chatgpt.exe` lives in the `OpenAI.Codex` package, so
an exe-keyed "ChatGPT" entry would mislabel Codex.

**Do not run a dev tracker against the real database**: migration 002 upgrades
it and the installed 0.1.0 tracker then refuses to open it. Use
`TraceTracker.exe --identities` (read-only) to check naming on real data.

**2026-11-23: owner now runs 0.2.1** (in-place update over 0.2.0, data kept).
- 0.2.1 includes the System page, Background apps and the opening animation.
- The system.live call to the installed recorder was verified (CPU 44.8%,
  GPU 14.2%, 31 devices, 91 programs).
- Bug fixed: the System and Background pages showed skeletons for ever when
  the recorder errored (an older recorder does not know the method). They
  now show "The recorder needs updating".
- Versions are 0.2.1 in the package.json files and the csproj. Still NOT
  committed and NOT released.

**2026-11-23: System page added (live only, nothing stored).**
- `pages/SystemPage.tsx`, with sidebar item "System" (cpu icon) and route
  /system.
- Shows CPU, GPU and memory ring gauges with one-minute sparklines,
  connected devices grouped by kind, a "Working hardest" list, and a
  running-programs table.
- Tracker side is `Windows/SystemMonitor.cs`, IPC `system.live`, polled
  every 1.5 s while the page is open:
  - CPU via GetSystemTimes deltas; memory via GlobalMemoryStatusEx.
  - GPU via PDH GPU Engine Utilization Percentage, the Task-Manager
    method; adapters from the display class registry key.
  - Devices via SetupAPI DIGCF_PRESENT|ALLCLASSES, filtered to people's
    device kinds. Bluetooth entries are PAIRED devices, not necessarily
    connected.
- Real check on the owner's PC passed (i7-1260P, Iris Xe, devices listed).
- Tracker tests 164 and desktop 32 pass. NOT seen on screen (low RAM).
  Not in the installed 0.2.0.

**2026-11-23: opening animation added** (`components/Splash.tsx`, the
"Opening sequence" keyframes at the end of `styles/app.css`, mounted in
App.tsx).
- Plays once per launch (sessionStorage) and skips on click or key. Not shown
  with reduced motion.
- Typecheck and 32 tests pass. NOT seen on screen: only 0.9 GB of RAM was
  free, so no dev window was opened.
- It is not in the installed 0.2.0; that needs a rebuilt installer.

**2026-11-23: owner's machine now runs 0.2.0.**
- Installed from `installer/Trace-Setup-0.2.0.exe`; 0.1.0 was uninstalled
  silently and its data kept.
- Pre-upgrade backup: `Documents\Trace backup before 0.2.0 (2026-11-23)`,
  verified (113,559 sessions). The tracker's own backup is
  `activity.pre-v1-20261122-234346.db`.
- The live DB is schema 4 and recording.
- Versions were bumped to 0.2.0 in package.json files and the csproj.
  NOT committed, NOT published as a GitHub release, and the website still
  points at 0.1.0.

**2026-11-22: a second brief (investigation-focused) replaced phases 3–7.**
`DOCS/product/trace-2.0-plan.md` §0 holds the record audit and slices 1–7.
- The pre-code explanation has been given to the owner.
- Owner decisions: no AI (no local model, no Ask panel); Recent-items
  import yes, read-only, off by default.
- **Slice 1 (application profiles) built, uncommitted.** Tracker tests 132
  and desktop 35 all pass. Checked on a copy of the real history; see
  plan §0.4.
- To repeat that check: back up the real DB to a copy, set
  `TRACE_HISTORY_COPY`, then run
  `dotnet test --filter RealHistoryCheck`. The test is a no-op unless that
  variable is set.
- Not verified in the running app: the dev tracker cannot be pointed at a
  copy (no data-dir override, and it would share the installed tracker's
  pipe).
- **Slice 2 (coverage, Windows records, evidence IDs) built, uncommitted.**
  Tracker tests 153 and desktop 35 pass.
- Running-app check: run against a copy with `TRACE_SANDBOX=<folder>`
  (holding `Datactivity.db` and `settings.json`). It gets a separate
  pipe, mutex and userData, and never touches the startup entry.
  - Start the Debug `TraceTracker.exe` and `node scripts/dev.mjs` with
    `TRACE_DEBUG_PORT=9333`.
  - Take screenshots with `scripts/shot.mjs`.
- Not visually verified: the app page's Executables tab. The scripted
  route to `#/applications/314` landed on Overview; cause not checked.
- **UI rebuild in progress (2026-11-22), uncommitted.**
  - The owner REJECTED a dense "investigation instrument" redesign. See
    memory `feedback-ui-style`.
  - New direction follows the owner's reference image: black ground,
    #18181b cards with 22px radius, one white feature card, icon-only rail
    (active = white tile), Outfit font, delta pills, blue hour bars, donut.
  - Done: tokens (`styles/app.css`), `components/bento.tsx`,
    `components/charts.tsx`, rail and top bar (`app/Shell.tsx`,
    `components/TitleBar.tsx`), `DayPicker` pill, the new Overview.
    Screenshots were checked in the sandbox.
  - Timeline & search: rebuilt in the reference's "Order list" style
    (colour-headed status cards, search pill, chips, 25-row pages, status
    pills). The Inspector is now a rounded slide-over drawer.
  - Real app icons: `Windows/AppIcons.cs` uses `Icon.ExtractIcon(path, 0, 64)`,
    falling back to the package logo (largest `.scale-*.png`). Icons are
    cached as PNG in `%LOCALAPPDATA%\Trace\Icons` and served over IPC
    `applications.getIcon`. Delete-all clears them. `AppMark` takes an
    `applicationId`.
  - Since then, all rebuilt in the new style and checked by screenshot in
    the sandbox:
    - Calendar.
    - Applications: the list, with top-3 cards and a card grid.
    - Each app's own page.
    - The record drawer.
    - Timeline Filters and Sort popovers.
  - Animations live in `styles/app.css` under "Motion": rise, grow, pop,
    slide-in, lift, arrow-turn, nav-pop, clock-hand, breathe. Also
    `CountUp` and `AnimatedClock` in `bento.tsx`.
  - The sidebar now has Overview, Timeline, Gaps (with a badge),
    Applications, Calendar, Settings, Search, pause/resume and a status
    tile. A sliding white tile marks the active item, and labels slide out
    on hover.
  - Settings rebuilt:
    - Three status cards at the top, a section menu (Recording, Privacy,
      Excluded apps, Your data, Display, Startup, Advanced) and one section
      at a time.
    - Big switches, pill choices and confirmation windows before deleting.
    - Excluding an app now excludes ALL its program files, read from
      `applications.getDetail` aliases.
  - Settings icon is now a gear (Lucide path, 24-unit grid, `GRID_24` in
    Icon.tsx).
  - The 12 stale desktop tests were rewritten for the new screens; 32/32
    pass. Tests use a matchMedia(reduce) mock in vitest.setup.ts so
    counters show final values.
  - Owner reported "switched to WhatsApp and it didn't notice". It WAS
    recorded (22:43:05–22:43:26 in both DBs); the sandbox window had been
    left on yesterday by my screenshot scripts.
  - Background apps BUILT (2026-11-23), uncommitted:
    - Tracker side:
      - Migration 004 adds `process_instances`, keyed (pid, started_at);
        schema is now v4.
      - `Processes/ProcessRecorder.cs` diffs snapshots;
        `Windows/WindowsProcessSource.cs` takes a Toolhelp32 snapshot of
        this session only, with creation time from GetProcessTimes.
      - The host polls every 2 s while `RecordBackgroundApps` (default
        OFF) && TrackingEnabled. On stop or shutdown, running rows become
        'unknown'.
      - IPC `background.get`. DeleteOrphans keeps applications referenced
        by processes; delete-range, delete-all and retention include
        `process_instances`.
    - Dashboard side: `pages/BackgroundPage.tsx`, a sidebar item (layers
      icon), and the switch in Settings > Recording.
    - Tests: tracker 162 pass, plus a real opt-in check (293 processes, all
      with start time and path). Desktop 32 pass, typecheck clean.
    - NOT visually verified: the sandbox apps were killed by Claude Code
      for low memory, and must not be restarted without the owner asking.
  - 7 desktop tests are stale (they describe the old screens).
    Tracker tests were not rerun after the icon change.
  - `@fontsource/ibm-plex-*` is installed but unused; remove it.

**Earlier (2026-11-06):** the marketing site lives here as `apps/website`, an npm
workspace, with its own notes in `apps/website/HANDOFF.md`. Merged to `main`;
installer published as GitHub release `v0.1.0`.

Building **Trace** — a private, local-only Windows activity-history desktop app
(Electron/React UI + separate C#/.NET background tracker + local SQLite).
Following `DOCS/engineering/technical-implementation-plan.md`, which is derived from `DOCS/` and is the
binding technical spec.

## Status
**In progress — Milestones 1–8 complete and verified; Milestone 9 part-done;
first V2 slice (Calendar + Analytics) built.**
Trace is installable: `installer\Trace-Setup-0.1.0.exe` (132 MB). Install →
launch → tray → uninstall all verified on this machine.
122 tests pass (93 tracker, 29 dashboard).

## Progress
- [x] Documentation audit; `DOCS/engineering/technical-implementation-plan.md`; 5 decisions resolved
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
- [x] **Milestone 7 — privacy controls**: Settings as a privacy centre,
      pause/resume, exclusions (+ delete that app's history), window-title and
      idle toggles, retention, export via save dialog, delete range /
      delete-everything behind a typed confirmation, onboarding consent flow,
      and a real `HKCU\...\Run` startup registration. **95 tests** (74 tracker,
      21 UI).
- [x] **Milestone 8 — Windows integration**: logo and icons generated from code
      (`tools/Trace.IconForge`), tray icon owned by the tracker with pause /
      resume / open / quit, `--route` navigation from the tray, NSIS per-user
      installer, uninstall data choice, and auto-start of the tracker on first
      launch. Installer built, installed, run and uninstalled cleanly.
- [~] **Milestone 9 — hardening** (in progress): large-history profiling and
      database-corruption recovery done; soak running; physical lock / sleep /
      restart tests and the two-Windows-accounts test still to do
- [~] **V2** (`DOCS/product/mvp-v2.md`): **Calendar and Analytics done.** Next candidates
      from the doc: categories, rules, favourites, notes, reports.
- [ ] Milestone 10 — polish

### The custom title bar (2026-08-10)
The dashboard window is now **frameless** and draws its own title bar.
`apps/desktop/src/components/TitleBar.tsx` — 64px, brand mark at the left, a
centred search field (Ctrl+K, Enter hands the query to `/search?q=`), and custom
minimise / maximise / close. Window control IPC is in `electron/main.ts` +
`preload.ts` (`windowControls`), styles at the foot of `src/styles/app.css`.
34 UI tests pass (5 new); built and looked at in a running window.

Two things a future session should know:
- **The rail's TRACE wordmark was removed.** The title bar directly above it
  carries the mark and the name now, and two stacked read as a bug.
- **The bar is not truly translucent.** The window is opaque, so there is
  nothing behind it to blur; the glass read comes from a gradient and a
  top-edge highlight. Real translucency would mean Windows 11 acrylic on the
  window, which `createWindow` explicitly rejected once already.
- **Snap Layouts** (hovering the maximise button on Windows 11) is gone with the
  native frame. Win+Z and edge-dragging still work.

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

npm run installer                  # everything -> installer\Trace-Setup-<v>.exe
```
`npm run installer` runs the icon forge, publishes the tracker, runs both test
suites, builds the dashboard and packages. It stops any running Trace processes
first, because the installer cannot replace files that are in use.
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
  hand-written to the palette and layout in `DOCS/specs/ui-ux-design.md`.

### Milestone 7 notes
- **Exclusion verified empirically, not just by test**: `notepad.exe` excluded,
  Notepad used for 18 s, `--dump` shows no application, no session, no title —
  just an honest 2-second gap in the timeline where it was.
- **Start-with-Windows is real**, not a stored preference: `HKCU\Software\
  Microsoft\Windows\CurrentVersion\Run`, verified written and removed.
  The **setting is the authority** at startup, not the registry — the first
  attempt had the registry win, which silently undid the user enabling it.
  Task Manager's Startup tab disables via its own `StartupApproved` key rather
  than by deleting this value, so that choice still stands.
- **Onboarding is framed as consent, not permission.** `DOCS/product/mvp.md` §9 sketches
  "Trace needs access to…", but nothing here needs a Windows permission or a UAC
  prompt, so asking would misdescribe what is happening (plan §13.4). A test
  asserts the phrase "needs access" does not appear.
- **Only controls that work are shown.** `theme` and `launchMinimised` exist in
  the settings contract but have no implementation, so they are deliberately
  absent from the page — a toggle that does nothing is worse than no toggle.
  Both belong to Milestone 10.
- `settings.json` is only written on first save, so a fresh install has no file
  until something changes. Worth remembering when scripting a test.

### Milestone 8 notes
- **The logo is generated from code** (`tools/Trace.IconForge`), not checked in
  as an opaque binary: a "T" whose stem ends in a bright node — the trace it
  leaves. `brand/trace-preview.png` shows it at 16–32 px, which is the size that
  actually decides whether a tray icon works.
- **The tray belongs to the tracker.** Pause therefore works with the dashboard
  closed or crashed, and Electron is not resident just to draw an icon. Pause
  from the tray takes the identical path to the dashboard's — write the setting,
  then signal the engine — so the two cannot diverge.
- **Trace.exe starts the tracker once** if it cannot connect. Without it, the
  first thing a newly installed user saw was "Tracker unavailable".
- **`--route=/settings`** from the tray is honoured on the second instance, and
  validated to in-application paths so a tray click cannot become a navigation
  primitive.
- **Uninstall** removes binaries, the shortcut and the `Run` entry, stops the
  tracker, and asks before touching history. **Verified**: install → launch →
  auto-start tracker → uninstall → history preserved, no dangling startup entry.
- The uninstall prompt offers **Keep / Delete**, not the Keep / Export / Delete
  of `DOCS/specs/privacy.md` §23. Exporting from an uninstaller that is deleting the
  application is awkward; the message instead names the data folder so the user
  can copy it. Export lives in Settings, where the app still exists.
- **`electronVersion` is pinned in `electron-builder.yml`** — Electron is hoisted
  to the workspace root, where electron-builder cannot resolve a range.
- **The renderer's libraries are devDependencies.** Vite bundles them; listing
  them as runtime dependencies made electron-builder copy node_modules in as
  well, and `app.asar` was 35 MB instead of 0.3 MB.
- Careful with PowerShell `Set-Content -Encoding utf8`: it writes a BOM, which
  made `package.json` unparseable to Vite. Use the file-writing tools instead.

### Look at the UI before changing it — `scripts/shot.mjs`
```
# launch with the debugger, then screenshot any route
electron . --remote-debugging-port=9333
node scripts/shot.mjs out.png "#/applications/1" 9333
node scripts/measure.mjs 9333        # real widths, and anything overflowing
```
Use these. Three rounds of "fixes" went into an overflow bug that **did not
exist**: a PowerShell `PrintWindow` capture was DPI-unaware, so `GetWindowRect`
returned logical pixels while the render was physical, and every screenshot was
silently cropped to ~80% of the window. The crop looked exactly like the last
column running off the edge. `measure.mjs` reported `overflowing: []` and ended
it. Screenshot over CDP, not Win32.

### Visual direction changed twice after Milestone 8

**Second change — flat, typographic (current).** Glass was rejected too, along
with "separating each part by its own borders". The current design:

- **No cards, panels or boxes.** Sections are separated by vertical space and a
  small uppercase label; lists by alignment and a hover tint. A border appears
  only where two regions genuinely meet — the rail, a tab underline, the setting
  rows, the session panel's edge.
- **Signature: the day ribbon.** One continuous 24-hour band on Overview, with
  each session drawn as a segment in its application's colour and gaps left as
  gaps. It answers "when", which is what a recorder is for; a bar chart of
  hourly totals answers "how much", which the headline figure already does.
- **Type**: Segoe UI Variable *Display* for figures, *Text* for body, Cascadia
  Mono for every timestamp and duration (`.data`). Windows' own optical sizes,
  for a Windows tool.
- **Per-application colour**, hashed from the executable in `lib/appColor.ts` so
  it is stable forever without being stored. Six muted hues — an earlier eight
  put orchid, coral and pink together and half the list looked identical.
- **Base size is 15px**, raised from 13px on the owner's feedback that it was
  unfriendly. Dense is not the same as small. `--color-ink-4` was also lifted;
  at `#464c55` it was below a readable contrast.

### Superseded: the glass direction
The product owner reviewed the flat dark interface and asked for **fluid glass** —
layered translucency, bubbly, responsive. This reverses specifics in
`DOCS/specs/ui-ux-design.md`, which is now amended at the top rather than
rewritten; its page structure and behaviour still stand.

- `src/styles/app.css` holds the whole system: glass recipe, ambient field,
  motion curves. `.glass` for panes, `.glass-inner` for surfaces already on
  glass (a second full blur costs a compositor pass and muddies what is below).
- The window uses **Windows 11 acrylic** (`backgroundMaterial: 'acrylic'` with a
  transparent `backgroundColor`). Unsupported machines fall back to the app's
  own scrim, which is why that scrim is opaque enough to stand alone.
- **The readability rule**: text never sits on the drifting colour field
  directly, always on a surface with its own tint and blur. Break it and this
  design becomes unreadable — that is the usual failure of glass interfaces.
- `prefers-reduced-motion` stops the drift and all transitions.
- Watch the count of blurring surfaces: `backdrop-filter` is GPU work per layer.
  If the window ever feels sluggish, that is the first thing to look at.

### V2 — Calendar (done)
- `activity.getCalendar` takes the **local midnights** the caller wants totalled,
  never a start-plus-count: §4 of the contract says the tracker does not guess
  the user's timezone, and a month containing a DST change is not 30 equal days.
- One query over the whole span, merged once, then bucketed by binary search
  over the boundaries. A query per day would be 31 round trips *and* would split
  a session crossing midnight into two rows and count it twice.
- A day with nothing recorded gets **no background at all**. Forty-two filled
  rectangles is a grid of boxes with the data hidden inside it; shading only the
  days that hold something makes the month readable at a glance.
- The timeline's day now lives in the URL (`#/timeline?day=<ms>`), which is what
  lets the calendar link into it. `replace`, not `push`, so stepping through a
  week with the arrows does not build a week of back history.

### V2 — Analytics (done)
- `analytics.getSummary` takes the same day boundaries as the calendar. Every
  figure the page shows is in the response — averages, busiest day, longest
  session included — so the page formats and never derives. `AnalyticsPage.test`
  returns an average that deliberately does not follow from the day totals, so
  the test fails if anyone later has the page do its own arithmetic.
- **Hour-of-day needs no timezone**: an hour's place in the day is how many
  hours it sits after that day's supplied midnight. A 25-hour daylight-saving
  day folds its extra hour into 23 rather than inventing a column.
- Only sessions that *began* inside the span are counted, matching the calendar,
  so the headline total always equals the sum of the day bars.
- Periods are **this week / this month / this year, to date**. Daily analytics
  lives on Overview, which already answers the same question for one day;
  averaging today's four hours over a whole month would report on days that have
  not happened.
- Bars are capped at 40px wide. Un-capped, a week of seven bars across a
  1,080-pixel row is a wall, and a single day fills the row edge to edge.

### The UTC-midnight bug (fixed)
`ApplicationUsage`'s Today / Yesterday / Last 7 days came from UTC midnight
(`nowUtcMs - (nowUtcMs % dayMs)`), so on UTC+3 they were three hours out and the
page could show "Today 20m" beside "Not used today". `applications.getDetail`
now takes the three local midnights, required and validated — a missing one
deserialises to zero, and zero would file all of history under "today".

**If another figure ever looks wrong by a few hours, look for this pattern
first.** Grep for `% dayMs` and for any arithmetic on `nowUtcMs` that pretends
to know where a day starts.

### Exact next step on resume
0. **Website, open items:** hosted by the Vercel project `trace` (Root Directory
   `apps/website`). The owner wanted `traceapp.vercel.app`, but another account holds
   it (403), so `site.url` is `trace-nu-nine.vercel.app`; once a name is chosen, add
   it to the project and update `site.url`. The hero cards cover the headline at
   1440px. The installer is unsigned, so SmartScreen warns. `electron/
   tracker-client.ts` runs `whoami` from PATH: launched from Git Bash it finds the
   Unix one and hangs on "Connecting"; use the absolute System32 path. `--probe`
   fails `applications.getDetail` because it does not send the local midnights.
1. **Finish Milestone 9.** The list is in the plan §12; what is left, in order:

   - **Soak** (`scripts/soak.ps1`, passive, samples every 60 s to
     `%LOCALAPPDATA%\Trace\Logs\soak.csv`): started 2026-08-10 00:16, runs 8 h.
     The tracker was restarted at 00:36 to pick up the calendar, so the CSV
     contains two PIDs — read each run separately.
   - **Sleep / wake and lock / unlock** on real hardware, then `--dump` to check
     for `SYSTEM_LOCK` / `SYSTEM_SLEEP`. Needs the owner at the machine.
   - **Windows restart**, clean and by pulling power: `SYSTEM_SHUTDOWN` versus
     `CRASH_RECOVERY`, and the run marker.
   - **Multiple Windows accounts**: two users tracking at once, separate
     databases, neither pipe reachable from the other account.
   - Done already: large-history profiling (200k sessions — everything healthy
     except `search.query` at 707 ms, the documented `LIKE '%…%'` tripwire) and
     database-corruption quarantine.

## Recently Completed
- DOCS reorganised (2026-11-23): `pdf/` (Concept Note 11 pp, SRS 14 pp, Implementation Plan 11 pp, all with screenshots), `product/`, `specs/`, `engineering/` (kebab-case names; 52 code comments repointed), `images/screenshots/` (18 shots on demo history), `images/real-captures/` (owner's own 7 screens, private), `source/` (HTML, `doc.css`, `build-pdfs.mjs`, `screenshots/` capture kit + README). Index: `DOCS/README.md`.
- Root README updated for 0.3.0 (2026-11-23): demo screenshots from `DOCS/images/screenshots`, Windows records, background apps, System, Protection, sandbox note, test counts 180/35, new tracker folders, links to the three PDFs. `brand/screenshots` (old UI) no longer referenced.
- Merged the marketing site into the repo as the `apps/website` workspace
  (2026-11-06).
- An application's Today / Yesterday / Last 7 days now use the user's local
  midnights instead of UTC's (2026-08-10).
- V2 Analytics — week / month / year to date, active time by day, hour-of-day
  histogram, longest stretch, most used (2026-08-10).
- V2 Calendar — month grid, `activity.getCalendar`, deep link into the timeline
  (2026-08-10).
- Clock columns widened so 12-hour times stop wrapping onto two lines
  (2026-08-10).
- Milestone 9 — corrupt database no longer stops Trace starting (2026-08-10).
- Milestone 8 — Windows integration, tray, installer (2026-08-09).
- Milestone 7 — privacy controls (2026-08-09).
- Milestone 6 — core UI, twice redesigned to the current flat direction
  (2026-08-09).
- Milestone 5 — IPC over a named pipe, all contract methods (2026-08-09).
- Milestone 4 — database, privacy gate, settings, crash recovery (2026-08-09).
- Milestone 3 — session engine with the tracking rules under test (2026-08-09).
- Milestone 2 — tracker proof of concept verified on real Windows (2026-08-09).
- Milestone 1 — project foundation, contracts, logging, build (2026-08-09).
