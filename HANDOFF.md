# HANDOFF

## Current Task
Building **Trace** — a private, local-only Windows activity-history desktop app
(Electron/React UI + separate C#/.NET background tracker + local SQLite).
Following `DOCS/IMPLEMENTATION-PLAN.md`, which is derived from `DOCS/` and is the
binding technical spec.

## Status
**In progress — Milestones 1 and 2 complete and verified on real Windows.**
Next up: Milestone 3, the session engine.

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
- [ ] **Milestone 3 — session engine** (next)
- [ ] Milestone 4 — database
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
3. **OPEN, input for Milestone 3** — Alt-Tab and shell transitions surface as
   real foreground events: `explorer.exe` with `"(no title)"` and
   `explorer.exe "Task Switching"`, often several within one second. Windows
   also emits **duplicate consecutive foreground events** for the same window.
   The engine must therefore:
     - dedupe identical consecutive states (`DOCS/data and database.md` §12) —
       already planned;
     - decide what to do about `"Task Switching"` and title-less `explorer.exe`
       bursts. The documented <5 s merge rule (`DOCS/Tracking.md` §F) cleans the
       *display*, but raw sessions would still be littered. Recommendation to
       weigh at Milestone 3: keep recording them (raw truth is the documented
       philosophy) and rely on the query-layer merge — do **not** add a
       hardcoded blocklist of shell windows, which would silently lose real
       File Explorer usage.

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

### Exact next step on resume
**Milestone 3 — session engine.** Build `Engine/SessionEngine.cs` and
`Engine/TrackerState.cs` as a pure state machine consuming `Signal` and emitting
intent (open/close session, open/close window session, append event) — with no
database and no Windows dependency, so it can be tested directly.

Turn every row of the `DOCS/Tracking.md` §"MVP rules" table into a named xUnit
test. Must include: idle backdating; idle attributed to the outgoing app on a
switch; duplicate foreground signals producing no rows; `active + idle` never
exceeding wall-clock; unlock/resume choosing the *current* foreground app rather
than assuming the previous one.

Create `apps/tracker/Trace.Tracker.Tests` (xUnit) as part of this milestone.
Do **not** start UI pages before Milestone 5 (IPC) can serve real data.

## Recently Completed
- Milestone 2 — tracker proof of concept verified on real Windows (2026-08-09).
- Milestone 1 — project foundation, contracts, logging, build (2026-08-09).
- Implementation plan and documentation audit (2026-08-09).
