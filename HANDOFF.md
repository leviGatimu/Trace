# HANDOFF

## Current Task
Building **Trace** — a private, local-only Windows activity-history desktop app
(Electron/React UI + separate C#/.NET background tracker + local SQLite).
Following `DOCS/IMPLEMENTATION-PLAN.md`, which is derived from `DOCS/` and is the
binding technical spec.

## Status
**In progress — Milestones 1, 2 and 3 complete and verified.**
Next up: Milestone 4, the database.

## Progress
- [x] Read all seven product documents in `DOCS/`
- [x] `DOCS/IMPLEMENTATION-PLAN.md` written; 13 documentation
      contradictions/gaps identified; 5 open decisions resolved with the owner
- [x] .NET 10 SDK installed (10.0.302)
- [x] **Milestone 1 — foundation**: repo layout, git, npm workspaces, IPC
      contract (spec + TS + C# mirror), tracker project, paths, privacy-aware
      logging. Tracker builds clean with `TreatWarningsAsErrors`.
- [x] **Milestone 2 — tracker proof of concept**: `TraceTracker.exe --diagnose`
      verified against real Windows behaviour (see Working Notes).
- [x] **Milestone 3 — session engine**: pure state machine (`SessionEngine`,
      `TrackerState`) behind `IActivitySink` / `IWindowResolver`. 32 xUnit tests,
      one per rule in the `DOCS/Tracking.md` table, including the `MVP.md` §10
      acceptance scenario. Verified live via `--diagnose`, which now drives the
      real engine through the real signal queue and prints derived sessions.
- [ ] **Milestone 4 — database** (next)
- [ ] Milestone 5 — IPC
- [ ] Milestone 6 — core UI (desktop scaffolding started: `package.json` only)
- [ ] Milestones 7–10

## Working Notes

### Decisions locked with the owner (plan §14)
- **A** Retention default → **Forever** (options Forever / 1y / 90d / 30d)
- **B** Search → **a fifth sidebar page** (not only the Ctrl+K palette).
  Nav is Overview · Timeline · Applications · Search — Settings.
- **C** IPC → **named pipe** `\\.\pipe\Trace.<SID>`, per-user DACL
- **D** Install → **per-user** `%LOCALAPPDATA%\Programs\Trace`, no UAC
- **E** Midnight-crossing sessions → attributed to local day of `started_at`

### Milestone 2 verification — what real Windows actually did
Run: `TraceTracker.exe --diagnose`, driving real foreground changes.

Confirmed working:
- Foreground transitions across Roblox / Notepad / Explorer / Windows Terminal
- Friendly names from the version resource ("Roblox Game Client")
- Executable paths, including packaged apps under `WindowsApps`
- In-place title changes (`EVENT_OBJECT_NAMECHANGE` scoped to the foreground PID)
- `GetLastInputInfo` idle reporting

Three findings, two fixed:
1. **Fixed** — modern Notepad sets `FileDescription` to the literal
   `"Notepad.exe"`, which would have put a filename in the user's history.
   `ProcessIdentity.Clean` now strips a filename-shaped description.
2. **Fixed** — non-ASCII window titles were mojibake in diagnose output;
   `ConsoleBridge` now forces UTF-8.
3. **RESOLVED at Milestone 3** — Alt-Tab and shell transitions surface as real
   foreground events (`explorer.exe "(no title)"`, `explorer.exe
   "Task Switching"`), and Windows emits duplicate consecutive foreground
   events. Measured live: **8 sessions in 9 seconds, most 0s**.
   - Duplicate consecutive states are deduped in the engine and tested.
   - The shell noise is **kept in raw data** per `DOCS/Tracking.md` §F, and
     cleaned at the query layer. A collection-time blocklist was rejected: it
     would silently lose real File Explorer usage.
   - **Consequence to honour in Milestone 5**: every read model must apply the
     same `minSessionSeconds` merge. Durations are negligible either way, but a
     naive `sessionCount` would rank File Explorer among the most-used apps.
     Recorded in plan §7.

### Key architecture already locked and implemented
- **Tracker is the sole owner of `activity.db`**; the UI never opens the file.
  Kills two-writer risk and the `better-sqlite3` native-module problem.
- **Tracker owns the tray icon** (WinExe + NotifyIcon). Electron is not resident
  at boot, so pause survives a UI crash.
- **Single-threaded session engine** fed by `SignalQueue` (`Channel<Signal>`);
  all Win32 watchers only enqueue. The engine is testable with zero Windows.
- **Repositories will be `internal`, reachable only via `PrivacyGate`** — a
  write path that bypasses privacy filtering must be a compile error.
- **Idle is backdated** to `GetLastInputInfo`'s last-input time (`IdleStarted.
  SinceUtcMs`), otherwise every idle period fabricates ~5 min of active time.
- **UWP handling** via `ApplicationFrameHost` → `CoreWindow` child resolution.
- **No global process enumeration** (deliberate reduction vs
  `project-architecture.md` §7).
- `Log.Redact()` must wrap every window title or excluded-app name that reaches
  a log line; Debug level is off unless the user enables developer logging.

### Build notes worth keeping
- TFM is `net10.0-windows10.0.17763.0` — the platform version must be in the
  TFM, not only `SupportedOSPlatformVersion`.
- `AllowUnsafeBlocks=true` is required by `[LibraryImport]`.
- Buffer-filling Win32 calls take `char*` (pinned by the caller) rather than
  `char[]`, which would have forced `DisableRuntimeMarshalling` assembly-wide.
- `Microsoft.Data.Sqlite 10.0.10` still resolves SQLitePCLRaw 2.1.11, which
  carries **GHSA-2m69-gcr7-jv3q (high)**. Pinned forward with an explicit
  `SQLitePCLRaw.bundle_e_sqlite3 3.0.5` reference. Revisit when
  Microsoft.Data.Sqlite ships 3.x by default.
- `UseWindowsForms` + implicit usings makes a bare `Timer` ambiguous — always
  write `System.Threading.Timer`.

### Milestone 3 notes
- `SessionEngine` writes only through `IActivitySink`; it holds no repository
  and no Win32 reference. `RecordingSink` + `ScriptedScreen` + `EngineHarness`
  in the test project let a whole scripted day run in microseconds.
- Tests were **mutation-checked**: removing idle backdating fails 5 of 32,
  so they have teeth rather than merely passing.
- `TrackerHost` still runs the interim consumer — the engine cannot be wired in
  until Milestone 4 supplies a real `IActivitySink`. It records nothing and does
  not pretend to.
- Still untested, because it belongs to `PrivacyGate` in Milestone 4: the
  built-in, non-removable exclusion of `Trace.exe` / `TraceTracker.exe`
  (`DOCS/Tracking.md` §Q).

### Exact next step on resume
**Milestone 4 — database.** In order:
1. `Data/Migrations/001_initial.sql` exactly as specified in plan §6, applied
   transactionally with `schema_version`; refuse to run if the DB is newer than
   the app.
2. `Data/TraceDatabase.cs`: WAL, `synchronous=FULL`, `foreign_keys=ON`,
   `busy_timeout=5000`; `integrity_check` after an unclean exit, quarantining a
   corrupt file rather than discarding it.
3. `Data/Repositories/*` — `internal`, and reachable **only** through
   `Privacy/PrivacyGate.cs`, which implements `IActivitySink`. The gate is where
   pause, exclusions, the built-in Trace exclusion, and the window-title switch
   are enforced. A write path that bypasses it must not compile.
4. `Settings/SettingsStore.cs` over `settings.json`, including persisted pause
   state (`DOCS/Privacy.md` §27).
5. Crash recovery on startup: close any `ended_at IS NULL` session at
   `tracker_state.last_heartbeat` with `CRASH_RECOVERY`, plus `TRACKER_RECOVERED`.
6. Wire `SessionEngine` into `TrackerHost` and replace the interim consumer.

Tests to add: gate produces zero rows across **all five tables** for an excluded
app; migrations apply 001→N and preserve seeded data; recovery closes at the
heartbeat, not at start-up time.

Do **not** start UI pages before Milestone 5 (IPC) can serve real data.

## Recently Completed
- Milestone 2 — tracker proof of concept verified on real Windows (2026-08-09).
- Milestone 1 — project foundation, contracts, logging, build (2026-08-09).
- Implementation plan and documentation audit (2026-08-09).
