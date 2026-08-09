# Trace — Technical Implementation Plan

Derived from the product documentation in `DOCS/`. Where the documentation is
explicit, this plan follows it. Where the documentation conflicts or is silent,
the decision is marked **[DECISION]** with its reasoning, and every decision that
genuinely needs the product owner's sign-off is collected in
[§14 Open decisions](#14-open-decisions).

This plan does not restate the product requirements. It states how they get built.

---

## 1. Repository structure

```
Trace/
│
├── DOCS/                                  # Product documentation (source of truth)
│
├── apps/
│   │
│   ├── desktop/                           # Trace.exe — Electron + React + TypeScript
│   │   ├── electron/
│   │   │   ├── main/                      # Main process
│   │   │   │   ├── main.ts                # App lifecycle, single-instance, window
│   │   │   │   ├── window.ts              # BrowserWindow creation, close→hide policy
│   │   │   │   ├── tracker-client.ts      # Named-pipe client, reconnect, heartbeat
│   │   │   │   ├── tracker-launcher.ts    # Spawn/restart TraceTracker.exe
│   │   │   │   └── ipc-bridge.ts          # renderer↔main channel, contract-typed
│   │   │   └── preload/
│   │   │       └── preload.ts             # contextBridge surface (no Node in renderer)
│   │   │
│   │   ├── src/                           # Renderer (React)
│   │   │   ├── app/                       # Router, providers, shell
│   │   │   ├── pages/
│   │   │   │   ├── overview/
│   │   │   │   ├── timeline/
│   │   │   │   ├── applications/
│   │   │   │   ├── search/
│   │   │   │   └── settings/
│   │   │   ├── features/                  # Cross-page feature units
│   │   │   │   ├── live-activity/
│   │   │   │   ├── command-palette/
│   │   │   │   ├── session-detail/
│   │   │   │   └── onboarding/
│   │   │   ├── components/                # Presentational primitives
│   │   │   ├── hooks/
│   │   │   ├── services/                  # Typed wrappers over the IPC surface
│   │   │   ├── lib/                       # Formatting (duration, dates), pure utils
│   │   │   └── styles/                    # Tokens, Tailwind config extensions
│   │   │
│   │   ├── build/                         # Installer assets, NSIS include scripts
│   │   ├── electron-builder.yml
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── tracker/                           # TraceTracker.exe — C# / .NET
│       ├── Trace.Tracker/                 # Executable (WinExe, message pump + tray)
│       │   ├── Program.cs                 # Entry, single-instance mutex, DI wiring
│       │   ├── TrackerHost.cs             # Startup/shutdown orchestration
│       │   ├── Windows/                   # Win32 layer — the ONLY place P/Invoke lives
│       │   │   ├── NativeMethods.cs
│       │   │   ├── MessageWindow.cs       # Hidden HWND: session/power/shutdown msgs
│       │   │   ├── ForegroundWatcher.cs   # SetWinEventHook
│       │   │   ├── IdleWatcher.cs         # GetLastInputInfo poll
│       │   │   ├── SessionStateWatcher.cs # Lock/unlock via WTS notifications
│       │   │   ├── PowerStateWatcher.cs   # Sleep/wake/shutdown
│       │   │   ├── ProcessExitWatcher.cs  # Foreground PID exit only
│       │   │   └── ProcessIdentity.cs     # HWND→PID→exe→display name (+UWP fix)
│       │   ├── Engine/
│       │   │   ├── SessionEngine.cs       # The state machine
│       │   │   ├── TrackerState.cs        # In-memory current state
│       │   │   ├── SignalQueue.cs         # Serialises all inbound signals
│       │   │   └── Signals.cs             # Signal record types
│       │   ├── Privacy/
│       │   │   ├── PrivacyGate.cs         # Single choke point before persistence
│       │   │   └── ExclusionMatcher.cs
│       │   ├── Data/
│       │   │   ├── TraceDatabase.cs       # Connection, pragmas, transactions
│       │   │   ├── Migrations/            # Embedded .sql resources
│       │   │   ├── Repositories/          # Application/Session/Window/Event/State
│       │   │   └── Queries/               # Read models the UI consumes
│       │   ├── Ipc/
│       │   │   ├── PipeServer.cs          # Named pipe, ACL, framing
│       │   │   ├── RequestRouter.cs
│       │   │   └── Handlers/              # One handler per contract method
│       │   ├── Settings/
│       │   │   └── SettingsStore.cs       # settings.json, tracker-owned
│       │   ├── Tray/
│       │   │   └── TrayIcon.cs            # NotifyIcon + context menu
│       │   ├── Diagnostics/
│       │   │   └── Log.cs                 # Rolling file log, privacy-aware
│       │   └── Trace.Tracker.csproj
│       │
│       └── Trace.Tracker.Tests/           # xUnit
│
├── packages/
│   └── contracts/                         # The UI↔Tracker contract, one source
│       ├── ipc-contract.md                # Normative spec + version history
│       ├── ts/                            # TypeScript types (consumed by desktop)
│       └── cs/                            # C# records (linked into tracker)
│
├── scripts/                               # Build orchestration
├── HANDOFF.md
└── README.md
```

**Deviations from `project-architecture.md` §27, and why**

| Doc | Plan | Reason |
|---|---|---|
| `apps/browser-extension/` | Removed | Websites are explicitly out of MVP. |
| `packages/database/` | Folded into tracker | The tracker is the sole DB owner (§3). A shared DB package implies two writers. |
| `database/migrations/` at root | `apps/tracker/.../Migrations/` | Embedded resources ship inside the tracker binary; they cannot desync from the code that runs them. |
| `packages/shared-types/` | `packages/contracts/` | It carries the IPC protocol spec, not just types. |

---

## 2. Technology choices

| Layer | Choice | Justification |
|---|---|---|
| Tracker runtime | **.NET 10 (`net10.0-windows`)** | LTS through Nov 2028. `net8.0` LTS expires Nov 2026 — too close to pick for a product being started now. |
| Tracker project type | **WinExe** (no console window), WinForms reference | A message pump is required regardless (session/power/shutdown messages, `SetWinEventHook`). WinForms only supplies `NotifyIcon` and the pump — no UI is drawn. |
| Tracker publish | **Self-contained, single-file, win-x64, trimmed off** | The end user installs one `.exe` and needs no runtime. Trimming is disabled: reflection in the SQLite provider makes trimming a needless risk for ~30 MB. |
| SQLite access | **`Microsoft.Data.Sqlite`** | First-party, minimal, bundles SQLitePCLRaw. No ORM: the schema is five tables and the data doc explicitly warns against scattering logic. Hand-written SQL confined to `Data/Repositories` and `Data/Queries`. |
| UI shell | **Electron** | Locked by `Windows Integration` §16. |
| UI framework | **React + TypeScript**, Vite | Locked by docs. |
| Styling | **Tailwind CSS** + CSS custom-property token layer | Locked by `project-architecture.md` §26. Tokens carry the exact palette from `UI and UX-design.md`. |
| Charts | **Recharts** | Locked by docs. Used only where a chart earns its place (Overview day-strip, app bars). |
| Router | **React Router** (hash history) | `file://` origin in packaged Electron makes browser history unreliable. |
| Data fetching | **TanStack Query** | The UI is a cache over a slow-ish IPC read model; this is exactly its job (stale-while-revalidate, invalidation on tracker push events). |
| Packaging | **electron-builder**, NSIS target | Locked by docs. Bundles `TraceTracker.exe` via `extraResources`. |
| Tracker DB in UI | **None** | The UI never links `better-sqlite3`. Consequence of §3 — and it deletes the entire native-module-rebuild class of problems. |

**Dependencies deliberately not taken:** no ORM, no state-management library (TanStack Query + React state suffices), no logging framework in the tracker (~80 lines of rolling file writer, and a third-party logger is one more thing that could persist a window title), no IPC framework, no DI container beyond hand-wired constructors.

---

## 3. Process architecture

```
   Windows user session
   ┌──────────────────────────────────────────────────────────────┐
   │                                                              │
   │  TraceTracker.exe            ← HKCU\...\Run  (starts at logon)│
   │  ┌────────────────────────────────────────────────────────┐  │
   │  │ Win32 watchers → SignalQueue → SessionEngine           │  │
   │  │                                    │                    │  │
   │  │                              PrivacyGate                │  │
   │  │                                    │                    │  │
   │  │                              Repositories               │  │
   │  │                                    │                    │  │
   │  │                        ┌───────────▼──────────┐         │  │
   │  │                        │  activity.db (WAL)   │         │  │
   │  │                        │  EXCLUSIVE WRITER    │         │  │
   │  │                        └───────────▲──────────┘         │  │
   │  │                                    │                    │  │
   │  │  TrayIcon        PipeServer ───► Queries                │  │
   │  └──────┬──────────────────▲────────────────────────────────┘  │
   │         │                  │  \\.\pipe\Trace.<SID>             │
   │         │ "Open Trace"     │  NDJSON, user-only DACL           │
   │         ▼                  │                                   │
   │  ┌──────────────────────────┴─────────────────────────────┐   │
   │  │ Trace.exe  (Electron main)                             │   │
   │  │   tracker-client ─ contextBridge ─ React renderer      │   │
   │  └────────────────────────────────────────────────────────┘   │
   └──────────────────────────────────────────────────────────────┘
```

**[DECISION] The tracker is the sole owner of `activity.db`. The UI never opens it.**

`project-architecture.md` shows both `SQLite → Desktop UI` (§1) and
`UI → IPC → Tracker → SQLite` (§20). Only one can be true without risking
corruption and duplicated schema knowledge in two languages. Choosing
tracker-only ownership gives: a single writer (no lock contention, no
`SQLITE_BUSY` handling in two runtimes), one implementation of every duration
calculation — which is precisely what `data and database.md` §26 demands — and
no native SQLite module inside Electron. Cost: every read is a pipe round-trip
and the tracker must implement query handlers. That cost is small and paid once.

**Lifecycles**

- Tracker starts at logon, independent of the UI. Owns the tray icon.
- UI start is user-initiated (Start menu, tray "Open Trace"). Closing the window
  (`X`) **quits `Trace.exe` entirely** — it is not needed in the background,
  because the tracker owns the tray. Reopening is instant from the tray.
- "Quit Trace" in the tray menu stops the tracker (closing the open session with
  `end_reason = TRACKING_PAUSED`) and, if running, the UI.
- Single instance enforced per process: named mutex `Local\Trace.Tracker.<SID>`
  for the tracker; `app.requestSingleInstanceLock()` for the UI.

---

## 4. Windows API plan

All P/Invoke is confined to `Windows/NativeMethods.cs`. Nothing outside
`Windows/` knows Win32 exists; the rest of the tracker consumes plain C# signals.

| Need | Mechanism | Notes |
|---|---|---|
| Foreground change | `SetWinEventHook(EVENT_SYSTEM_FOREGROUND, …, WINEVENT_OUTOFCONTEXT)` | Callback delegate held in a static field so the GC cannot collect it — a classic crash source. Callback does nothing but enqueue a signal. |
| Title change of the *current* window | `SetWinEventHook(EVENT_OBJECT_NAMECHANGE, …)` scoped to the foreground PID | Catches Chrome tab switches, which do not change the HWND. Re-scoped on every foreground change. |
| Window title | `GetWindowTextLength` + `GetWindowText` | Recorded verbatim (`Tracking.md` closing note). Capped at 512 chars. |
| Owning process | `GetWindowThreadProcessId` → `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` → `QueryFullProcessImageName` | `LIMITED_INFORMATION` works without elevation for same-user processes. |
| Display name | `FileVersionInfo.FileDescription` → `ProductName` → filename | Turns `chrome.exe` into `Google Chrome`. Cached per executable path. |
| **UWP / packaged apps** | If the owning process is `ApplicationFrameHost.exe`, `EnumChildWindows` for class `Windows.UI.Core.CoreWindow` and use *that* window's process | Without this, Settings / Calculator / Store apps all record as "ApplicationFrameHost". **Not mentioned anywhere in the documentation** — see §13. |
| Idle | `GetLastInputInfo` polled every 2 s | Returns a tick count only — no key or coordinate data ever enters the process. Directly satisfies `Privacy.md` §3. |
| Lock / unlock | `WTSRegisterSessionNotification` → `WM_WTSSESSION_CHANGE` (`WTS_SESSION_LOCK` / `_UNLOCK`) | Delivered to the hidden message window. |
| Sleep / wake | `WM_POWERBROADCAST` (`PBT_APMSUSPEND`, `PBT_APMRESUMESUSPEND`, `PBT_APMRESUMEAUTOMATIC`) | Suspend is delivered *before* sleep, giving a clean close. |
| Shutdown / logoff | `WM_QUERYENDSESSION` / `WM_ENDSESSION` + `ShutdownBlockReasonCreate` briefly | Enough time to close the session and checkpoint WAL. |
| Foreground process exit | `Process.EnableRaisingEvents` on the single tracked PID | Yields `end_reason = APP_EXIT` instead of a generic switch. |
| DPAPI | `ProtectedData` (CurrentUser scope) | Reserved for future secret storage; not needed by MVP data. |

**[DECISION] No global process enumeration.** `project-architecture.md` §7
proposes polling every process every 1–2 s to emit `APPLICATION_STARTED` /
`APPLICATION_STOPPED`. The MVP never uses those events: `Tracking.md` §B says an
app is not counted until it is foreground, and §N says background apps
accumulate nothing. Polling every process on the machine costs continuous CPU,
touches processes Trace has no reason to observe, and produces rows nothing
reads. Watching the one foreground PID for exit satisfies `Tracking.md` §P
completely. Flagged in §13 as a deliberate scope reduction, not an oversight.

**Explicitly not used:** no keyboard/mouse hooks, no `SetWindowsHookEx`, no DLL
injection, no UI Automation into other processes, no browser or accessibility
hooking, no screen capture APIs. This is both a privacy requirement and what
keeps the binary from looking like malware to Defender (`Windows Integration` §32).

---

## 5. IPC design

**[DECISION] Named pipe, not localhost HTTP.**

`project-architecture.md` §20 offers both and calls HTTP "simple". For this
product a named pipe is materially better:

- A TCP listener is reachable by every process on the machine *and* by web pages
  in the browser (DNS-rebinding / CSRF against `127.0.0.1` is a well-worn
  technique). A named pipe with a DACL is reachable only by the intended user.
- Binding a socket can trigger a Windows Firewall prompt — an unacceptable
  first-run experience for a product whose promise is "no admin, nothing leaves
  the machine".
- Per-user pipe naming makes the multi-Windows-account isolation of
  `Windows Integration` §26 structural rather than conventional.

**Transport**

- Pipe name: `\\.\pipe\Trace.<UserSid>` — inherently per-user.
- Created with `PipeSecurity` granting `FullControl` to the current user SID and
  `SYSTEM` only, and with `FILE_FLAG_FIRST_PIPE_INSTANCE` so a squatter that
  pre-registers the name causes a loud startup failure instead of a silent
  impersonation.
- Framing: newline-delimited JSON (NDJSON), UTF-8. One JSON object per line.
- Duplex, multiple concurrent client connections (UI window + future CLI).

**Message shapes**

```jsonc
// request
{ "id": "7", "method": "activity.getDay", "params": { "fromUtcMs": …, "toUtcMs": … } }
// response
{ "id": "7", "ok": true,  "result": { … } }
{ "id": "7", "ok": false, "error": { "code": "E_RANGE", "message": "…" } }
// server push (no id)
{ "event": "state.changed", "data": { "state": "PAUSED" } }
```

**Contract v1 surface**

| Method | Purpose |
|---|---|
| `system.hello` | Handshake: contract version, tracker version, DB schema version. Version mismatch is reported to the user, never guessed around. |
| `system.status` | State (`ACTIVE`/`IDLE`/`PAUSED`/`LOCKED`), uptime, last error. |
| `activity.getCurrent` | Live Activity panel: app, title, started_at, active/idle seconds. |
| `activity.getDay` | Overview: totals, per-app rollup, hour buckets, top sessions. |
| `activity.getTimeline` | Timeline: merged sessions + system intervals for a range. |
| `applications.list` | Applications page with usage rollups. |
| `applications.getDetail` | One app: usage by period, sessions, window rollup. |
| `sessions.getDetail` | Session panel: window sessions + events within the session. |
| `search.query` | Titles + app names, ranked, capped. |
| `settings.get` / `settings.update` | Full settings object; update is atomic. |
| `tracking.pause` / `tracking.resume` | Real pause (§8). |
| `data.deleteRange` / `data.deleteApplication` / `data.deleteAll` | Hard deletes. |
| `data.export` | Streamed JSON export to a caller-supplied absolute path. |

Push events: `state.changed`, `activity.changed`, `settings.changed`,
`data.changed`. The UI invalidates TanStack Query caches on these rather than polling.

**Read-model rules.** Every query returns values the UI only formats:
`active_seconds`, `idle_seconds`, `session_count` — never raw endpoints the UI
subtracts. This is `data and database.md` §26 enforced by the contract's shape.

`data.export` validates that the supplied path is absolute, rooted in an existing
directory, and not inside the Trace data directory before writing.

---

## 6. Database implementation plan

**Location:** `%LOCALAPPDATA%\Trace\Data\activity.db`
**Logs:** `%LOCALAPPDATA%\Trace\Logs\`
**Settings:** `%LOCALAPPDATA%\Trace\settings.json`

**Pragmas:** `journal_mode=WAL`, `synchronous=FULL`, `foreign_keys=ON`,
`busy_timeout=5000`. `FULL` is chosen over the usual `NORMAL` because write
volume here is tiny (a few thousand commits a day) and the product's stated
philosophy is that recorded truth must survive power loss.

**Units — stated once, enforced everywhere:** timestamps are **UTC epoch
milliseconds** (`INTEGER`); durations are **whole seconds** (`INTEGER`), matching
the column names the documentation specifies. Column suffixes make the unit
unambiguous at every call site (`*_at` = ms, `*_seconds` = s).

### Schema (migration `001_initial.sql`)

```sql
CREATE TABLE schema_version (version INTEGER NOT NULL);

CREATE TABLE applications (
    id              INTEGER PRIMARY KEY,
    name            TEXT    NOT NULL,        -- "Google Chrome"
    executable      TEXT    NOT NULL,        -- "chrome.exe", lowercased
    path            TEXT,                    -- nullable: may be unreadable
    first_seen      INTEGER NOT NULL,
    last_seen       INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_applications_executable ON applications(executable);

CREATE TABLE sessions (
    id              INTEGER PRIMARY KEY,
    application_id  INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    started_at      INTEGER NOT NULL,
    ended_at        INTEGER,                 -- NULL = open
    active_seconds  INTEGER NOT NULL DEFAULT 0,
    idle_seconds    INTEGER NOT NULL DEFAULT 0,
    end_reason      TEXT                     -- NULL while open
);
CREATE INDEX ix_sessions_started_at     ON sessions(started_at);
CREATE INDEX ix_sessions_application_id ON sessions(application_id, started_at);
CREATE INDEX ix_sessions_open           ON sessions(id) WHERE ended_at IS NULL;

CREATE TABLE window_sessions (
    id               INTEGER PRIMARY KEY,
    session_id       INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    title            TEXT,
    started_at       INTEGER NOT NULL,
    ended_at         INTEGER,
    duration_seconds INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_window_sessions_session   ON window_sessions(session_id, started_at);
CREATE INDEX ix_window_sessions_started   ON window_sessions(started_at);
CREATE INDEX ix_window_sessions_title     ON window_sessions(title);

CREATE TABLE events (
    id              INTEGER PRIMARY KEY,
    timestamp       INTEGER NOT NULL,
    type            TEXT    NOT NULL,
    application_id  INTEGER REFERENCES applications(id) ON DELETE CASCADE,
    session_id      INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    metadata        TEXT                     -- JSON, or NULL
);
CREATE INDEX ix_events_timestamp ON events(timestamp);
CREATE INDEX ix_events_app       ON events(application_id, timestamp);

CREATE TABLE tracker_state (
    id                     INTEGER PRIMARY KEY CHECK (id = 1),
    last_heartbeat         INTEGER NOT NULL,
    current_session_id     INTEGER,
    current_application_id INTEGER,
    current_window         TEXT,
    state                  TEXT NOT NULL
);
```

Indexes are exactly those `data and database.md` §16 calls for, plus the partial
index on open sessions (crash recovery reads it on every start) and the title
index (search).

`end_reason` values: `APP_SWITCH`, `APP_EXIT`, `SYSTEM_LOCK`, `SYSTEM_SLEEP`,
`TRACKING_PAUSED`, `SYSTEM_SHUTDOWN`, `CRASH_RECOVERY`.

Event types: `FOREGROUND_CHANGED`, `WINDOW_CHANGED`, `SESSION_STARTED`,
`SESSION_ENDED`, `IDLE_STARTED`, `IDLE_ENDED`, `SYSTEM_LOCKED`,
`SYSTEM_UNLOCKED`, `SYSTEM_SLEEP`, `SYSTEM_WAKE`, `SYSTEM_SHUTDOWN`,
`TRACKING_PAUSED`, `TRACKING_RESUMED`, `TRACKER_STARTED`, `TRACKER_RECOVERED`.

### Migrations

Numbered `.sql` files as embedded resources, applied in a transaction, one
version step at a time, with `schema_version` updated in the same transaction.
On startup: if `db_version > app_version`, refuse to run and tell the user the
app is older than its data — never silently downgrade. A timestamped file copy
of `activity.db` is taken before any migration above version 1.

### Access layer

`Data/Repositories/` performs writes (one method per state transition, each a
single transaction). `Data/Queries/` performs reads and returns read-model
records shaped for the IPC contract. Raw SQL appears in exactly these two
folders, nowhere else — the explicit instruction in the kickoff brief.

### Retention & deletion

Retention is enforced by a sweep on startup and once daily, deleting `events`,
`window_sessions`, and `sessions` older than the cutoff, then orphaned
`applications`. Deletion is real `DELETE`, never a flag (`Privacy.md` §21).
`VACUUM` runs after a large delete, off the signal-processing path, with progress
reported over IPC.

---

## 7. Session engine design

### Signal serialisation

Win32 callbacks arrive on several threads (hook thread, message-window thread,
idle-poll timer, process-exit callback, pipe threads). Every watcher does one
thing: build an immutable `Signal` record stamped with the current UTC ms and
push it onto a `Channel<Signal>`. A single consumer thread runs the state
machine. **The engine is therefore single-threaded by construction** — no locks,
no interleaved transitions, and the entire state machine is unit-testable by
feeding it a scripted list of signals with no Windows involved at all.

Signals: `ForegroundChanged`, `WindowTitleChanged`, `IdleStarted`, `IdleEnded`,
`SessionLocked`, `SessionUnlocked`, `SystemSuspending`, `SystemResumed`,
`SystemShuttingDown`, `ForegroundProcessExited`, `PauseRequested`,
`ResumeRequested`, `SettingsChanged`, `Heartbeat`.

### States

`STOPPED → ACTIVE ⇄ IDLE`, with `LOCKED`, `SUSPENDED`, and `PAUSED` as
suspending states that hold no open session.

### Rules (traceable to `Tracking.md`)

| Rule | Behaviour |
|---|---|
| Foreground → app X | Close open session (`APP_SWITCH`), open session for X, open window session, emit events. Same app + same title ⇒ no-op (`data and database.md` §12). |
| Title change, same app | Close current `window_session`, open a new one. Application session untouched (§D). |
| Idle | Session stays **open**; the active-time accumulator stops. `IDLE_STARTED` event. |
| Idle → active | Accumulator resumes, `IDLE_ENDED`. |
| App switch while idle | Idle interval is attributed to the outgoing session (§H). |
| Lock | Close session `SYSTEM_LOCK`. → `LOCKED`. |
| Unlock | Re-read foreground and open a session for whatever is *now* foreground (§I). |
| Suspend | Close session `SYSTEM_SLEEP`, checkpoint WAL, → `SUSPENDED`. |
| Resume | Re-read foreground; open new session (§J). |
| Foreground process exits | Close `APP_EXIT`. |
| Shutdown | Close `SYSTEM_SHUTDOWN`, flush, exit. |
| Pause | Close `TRACKING_PAUSED`; persist nothing until resumed. |
| Excluded / Trace itself | No session at all; a `PrivacyBoundary` marker in memory only. |

**[DECISION] Idle start is backdated.** `GetLastInputInfo` reports the moment of
last input. When the poll notices the threshold has been crossed, the idle period
began at `lastInputTime`, not at detection time. Recording idle from detection
time would credit every idle period with 5 extra minutes of fabricated active
time. Not stated in the docs; required by "never fabricate activity".

**[DECISION] Active time is accumulated, not derived.** The engine keeps
`activeSeconds` and `idleSeconds` accumulators for the open session and advances
them on each transition and heartbeat. `active + idle == ended_at - started_at`
is asserted in tests, so a session can never report more active time than it
existed for.

**[DECISION] The <5 s merge rule lives in the query layer.** `Tracking.md` §F
says short switches stay in the raw data but should not clutter the UI, and
`data and database.md` §26 forbids the UI computing truth. So the merge is a
documented `minSessionSeconds` parameter on `activity.getTimeline`, implemented
once in the tracker. React renders exactly what it receives.

**[DECISION] Window sessions are written on completion, with a 5-second floor.**
Running the tracker for real exposed a defect the documentation does not
anticipate: window titles change for reasons that have nothing to do with the
user. A terminal with a progress spinner produced **nine window sessions in a
few seconds**; over a working day that is tens of thousands of rows, plus a
matching `WINDOW_CHANGED` event each, describing nothing anyone will ever read.

Unlike application sessions — where `Tracking.md` §F deliberately keeps every
raw transition — this churn is machine-driven and unbounded, so keeping it is
not preserving truth. The engine therefore holds the window it is watching in
memory and writes it only once it ends and has lasted at least
`SessionEngine.MinWindowSessionSeconds` (5 s, the same threshold §F proposes,
applied to the table that needed it).

Two consequences, both accepted deliberately:
- Window durations do not sum to their session's duration.
- The window in progress when a crash happens is lost, though the application
  session it belonged to is recovered in full. Recovery clamps any window that
  completed after the last heartbeat back inside the recovered session end, so a
  window can never outlast its session.

**[DECISION] Every read model applies the same merge.** Milestone 3's live run
showed how much this matters: Alt-Tab alone produced eight sessions in nine
seconds, most of them zero-length, including three for the `explorer.exe`
"Task Switching" overlay. Durations are already negligible, but a naive
**session count** would report File Explorer as one of the most-used
applications on the machine.

Filtering these at collection time was considered and rejected — a blocklist of
shell windows would silently lose real File Explorer usage, and `Tracking.md` §F
is explicit that raw transitions are kept. Instead `applications.list`,
`applications.getDetail` and `activity.getDay` compute `sessionCount` from the
same merged view as `activity.getTimeline`, so counts and durations always
describe the same history.

### Heartbeat

Every 30 s the engine writes `tracker_state` (single-row UPDATE) with the
timestamp, current session, and state. This bounds crash-recovery
over-attribution to 30 s. `data and database.md` §14 suggests "every few
minutes"; 30 s costs nothing at this write volume and makes recovery four to ten
times more accurate.

---

## 8. Privacy filtering architecture

`Privacy.md` §7 and §29 require that excluded data never reaches the database.
This is enforced structurally, not by convention:

```
Win32 watcher ──► Signal (in memory only)
                    │
                    ▼
              SessionEngine
                    │
                    ▼
            ┌───────────────┐
            │  PrivacyGate  │   ◄── the ONLY path from engine to repositories
            └───────┬───────┘
              deny  │  allow
                ✗   ▼
                Repositories ──► activity.db
```

- **Repositories are `internal`, and `PrivacyGate` is the only thing that calls
  them.** The engine depends on `IActivitySink` and holds no repository
  reference, so there is no route from the state machine to storage that skips
  the gate. Since both live in one assembly this is enforced by review and by an
  architecture test rather than by the compiler; a separate assembly per layer
  would make it a compile error, at the cost of a build split not worth taking
  for the MVP.
- **What is gated, and what is not.** Creating a record is gated; finishing one
  is not. `OpenSession` and `RecordWindowSession` are refused when paused,
  excluded, or (for titles) switched off. `CloseSession`, `AppendEvent` and
  `Checkpoint` always proceed — otherwise pausing would strand the open session,
  to be misreported as a crash on the next start.
- The gate evaluates, in order: tracking paused → drop everything; app is
  `Trace.exe`/`TraceTracker.exe` → drop (built-in, non-removable, `Tracking.md`
  §Q); app in user exclusion list → drop the app, its title, *and* any event
  naming it; window titles disabled → strip `title` to `NULL` before write.
- Exclusion matching is on the normalised executable name (lowercased filename),
  the same key as application identity, so an excluded app cannot slip through
  via a different install path.
- **Pause is real.** In `PAUSED`, watchers keep running only enough to notice a
  resume request; the engine drops every activity signal and writes nothing but
  the `TRACKING_PAUSED` event and the heartbeat. There is no buffer that gets
  flushed on resume.
- **Paused state survives reboot** (`Privacy.md` §27): it lives in
  `settings.json` and the tracker starts paused if it was paused.
- **Logging is a persistence path too.** Window titles and excluded application
  names are never written to the log above `Debug`; `Debug` is off by default and
  is enabled only by the explicit Settings → Advanced → Developer logs toggle.
  Not mentioned in the docs — see §13.
- Adding an exclusion offers "also delete existing history for this application"
  (`Privacy.md` §8), routed to `data.deleteApplication`.
- No network code exists in the tracker at all. There is no HTTP client to audit.

---

## 9. Installer and build architecture

**[DECISION] Per-user installation, no elevation.**

`Windows Integration` §29 says `C:\Program Files\Trace\`; §14 says avoid
administrator privileges. These conflict — writing to `Program Files` requires
elevation. Per-user install to `%LOCALAPPDATA%\Programs\Trace\` gives an
install with no UAC prompt at all, makes the `HKCU\Run` startup entry
consistent with where the binary lives, and reinforces that Trace is entirely
contained in one Windows user's profile. That is the better fit for this
product's stated identity. Flagged in §14.

**Build pipeline** (`scripts/build.ps1`):

1. `dotnet publish` the tracker: `-r win-x64 -c Release --self-contained true /p:PublishSingleFile=true` → `TraceTracker.exe`.
2. `vite build` the renderer; `tsc`/`esbuild` the Electron main + preload.
3. `electron-builder` with `extraResources` copying `TraceTracker.exe` into
   `resources/tracker/`, NSIS target, `perMachine: false`, `oneClick: false`.
4. Output: `Trace-Setup-<version>.exe`.

**Installer responsibilities**

- Install both binaries; create Start-menu and optional desktop shortcuts.
- Write the `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value
  `Trace` → `"<installdir>\resources\tracker\TraceTracker.exe"` when the user
  opts in during onboarding (not at install time — consent belongs in onboarding).
- **On uninstall**, a custom NSIS page asks the documented question
  (`Privacy.md` §23): Keep / Export / Delete my history. It always removes the
  binaries, the Run entry, and shortcuts; it touches `%LOCALAPPDATA%\Trace\Data`
  only per the user's choice. The uninstaller stops the tracker first via its
  named mutex/pipe.
- Upgrade installs replace binaries and never touch the data directory
  (`Windows Integration` §29–30); schema changes are handled by migrations.

**Code signing** is out of MVP scope per `Windows Integration` §32; the build
script exposes a signing hook so it can be added without restructuring.

---

## 10. Startup and tray architecture

**[DECISION] The tracker owns the tray icon.**

`Windows Integration` §6–7 describes the post-boot state as tracker running with
a tray indicator and the dashboard closed. That is only possible if the tray
belongs to the tracker. The alternative — Electron resident at boot purely to
draw an icon — costs ~150 MB of RAM permanently and makes the pause control die
with a UI crash, which defeats the separation the docs defend at length.

- Tracker is `WinExe` with `NotifyIcon`; the message pump it already needs for
  session/power notifications drives it.
- Menu (`Windows Integration` §8): status line, **Open Trace**, **Pause/Resume
  Tracking**, Today's Activity (opens the UI on Overview), Settings, Quit Trace.
- Icon state distinguishes tracking / paused, satisfying `Privacy.md` §11's
  requirement that the user can always tell.
- "Open Trace" launches `Trace.exe`, or focuses the existing instance via
  Electron's second-instance signal.
- **Startup registers the tracker only, never the UI** (`Windows Integration` §7).
- The tray menu is native Win32 chrome rather than the Electron design language.
  That is the correct trade — a native tray menu is what Windows users expect,
  and premium polish belongs in the dashboard.

---

## 11. Error and recovery strategy

| Failure | Behaviour |
|---|---|
| **Unclean tracker exit / power loss** | On start, any session with `ended_at IS NULL` is closed at `tracker_state.last_heartbeat` with `end_reason = CRASH_RECOVERY`, plus a `TRACKER_RECOVERED` event. Under-attributes by up to 30 s. Never invents time. |
| **Tracker crash while UI is open** | Pipe read fails; UI shows the documented "Tracker unavailable / [Restart Tracker]" state (`Windows Integration` §21) and reconnects with backoff (0.5 s → 10 s). It never renders stale data as live. |
| **UI crash** | Tracker unaffected; the pipe connection is simply dropped. |
| **Unhandled exception in the tracker** | Logged with a stack trace, the open session is closed `CRASH_RECOVERY`, WAL is checkpointed, then the process exits non-zero. A corrupted in-memory state is never allowed to keep writing. |
| **Automatic restart after a crash** | **Not in MVP.** A Windows Service needs admin; a watchdog process is a second background executable to justify to Defender. MVP relies on: a hardened tracker, the UI's [Restart Tracker] button, and the `Run` entry at next logon. Called out honestly in §13. |
| **Database locked / IO error** | Retry with `busy_timeout`; on persistent failure, enter `DEGRADED`, keep the pipe alive so the UI can report it, and stop writing rather than corrupt. |
| **Database corruption** | `PRAGMA integrity_check` on startup after an unclean exit. On failure: rename to `activity.corrupt-<ts>.db`, start a fresh DB, and tell the user plainly where the old file is. Nothing is silently discarded. |
| **Schema newer than app** | Refuse to run; instruct the user to update Trace. |
| **Foreground process unidentifiable** (protected/elevated process) | Fall back to `ProcessName` with `path = NULL`. If even that fails, record no session for that interval — a gap is honest, a guess is not. |
| **Pipe name already taken** | `FIRST_PIPE_INSTANCE` fails → log, notify, exit. Never fall back to an unprotected pipe. |

---

## 12. Testing strategy

**Tracker unit tests (xUnit)** — the highest-value layer, and cheap because the
engine consumes plain signals:

- `SessionEngine`: every row of the `Tracking.md` §"MVP rules" table becomes a
  named test that feeds a scripted signal sequence and asserts the emitted
  writes. Including: idle backdating, idle attributed to the outgoing app on a
  switch, duplicate foreground signals producing no rows, `active + idle` never
  exceeding wall-clock, unlock choosing the *current* foreground app.
- `PrivacyGate`: excluded app produces **zero** rows in *every* table (asserted
  by counting rows across all five tables, not by checking the sessions table);
  titles-off nulls the title; paused writes nothing.
- Migrations: apply 001→N on an empty DB and assert schema; apply to a seeded
  v1 DB and assert data survives.
- Recovery: seed an open session plus a heartbeat, start, assert the close
  timestamp and reason.
- Queries: seeded fixtures with known totals, including a session crossing
  midnight and a DST boundary.

**Integration tests** — a real temp SQLite file, a real pipe server, a scripted
signal source instead of Win32. Exercises the full engine → gate → DB → query →
pipe path without needing a desktop.

**Manual Win32 verification** — a `--diagnose` mode that prints live foreground
app / title / idle state to the console. This is how §4's UWP handling, elevated
processes, and multi-monitor behaviour get verified, because they cannot be
faked in a unit test.

**UI tests** — Vitest for formatting and reducer logic; React Testing Library
for the four pages against a mocked IPC surface, covering loading / empty /
error / partial states, which `UI and UX-design.md` treats as first-class.

**The acceptance test is `MVP.md` §10.** It is scripted as a manual runbook and
executed on a real machine before the MVP is called done: open Chrome, switch,
walk away, return, lock, unlock — then verify the Timeline matches.

**Soak testing** (Phase 9): 72 h continuous run with an automated app-switch
driver at high frequency, plus sleep/wake and lock/unlock cycles, checking
memory, handle count, DB size, and `active + idle` consistency.

---

## 13. Contradictions, gaps and risks found in the documentation

Resolved here; no action needed unless noted.

1. **Tracker language.** `project-architecture.md` §26 table says C++/Rust; its
   own §26 text and `Windows Integration` §16 both say C#. → C#, per the later,
   explicitly "locked" decision.
2. **`sessions` columns differ in three docs.** → `data and database.md` §5 wins
   (it is the dedicated schema doc and the only one with `end_reason`).
3. **UI sidebar in `UI and UX-design.md`** includes Websites, Windows, Reports,
   Trends — all out of MVP. → Full-product vision; MVP builds four pages and
   inherits the visual language.
4. **Onboarding calls the consent screen a permission request** (`MVP.md` §9).
   Nothing in Trace requires a Windows permission grant or UAC. Presenting it as
   "Trace needs access" would misdescribe what is happening. → Framed as explicit
   consent + collection choices, which is what `Privacy.md` §26 already specifies.
5. **`Privacy.md` §25 lists "Chrome" as an excluded app** in the sample settings.
   Read as placeholder text, not a default. No app is excluded by default except
   Trace itself.
6. **UWP / packaged apps are not mentioned anywhere.** Without the
   `ApplicationFrameHost` handling in §4, Settings, Calculator and Store apps all
   record under one meaningless name. Handled; flagging because it is a real
   accuracy gap the documentation does not anticipate.
7. **Idle-start backdating is not specified.** Without it, every idle period
   fabricates ~5 minutes of active time. Handled in §7.
8. **Logs are an unaddressed persistence path.** A window title in a log file is
   still a recorded window title. Handled in §8.
9. **Global process enumeration dropped** from MVP (§4). Deliberate reduction
   against `project-architecture.md` §7 — flagging rather than doing it silently.
10. **Automatic tracker restart after a crash is not implemented in MVP** (§11).
    `Windows Integration` §19 sketches it, but every mechanism costs either admin
    rights or a second background process. Stated plainly rather than implied.
11. **Sessions crossing local midnight** are unaddressed by the docs. Plan:
    attribute a session to the local day of its `started_at` for daily rollups,
    while the Timeline shows it at its true time. Splitting `active_seconds` at
    the boundary would require assuming a uniform distribution of activity across
    the session, which would be fabricating. See §14.
12. **Elevated / protected processes** may be unidentifiable without admin.
    Fallback defined in §11; a small number of sessions may carry a process name
    with no path or friendly name.
13. **Search has no defined scope.** Plan: window titles + application names,
    indexed `LIKE`, capped result set. FTS5 only if profiling on a large history
    shows it is needed.
14. **Window-title churn** (found at Milestone 4, resolved in §7) — machine-driven
    title updates would have produced tens of thousands of useless rows a day.
15. **Published tracker size: 136 MB.** Self-contained single-file win-x64 with
    WinForms and the full BCL. Combined with Electron the installer would be
    around 300 MB — large, though not unusual for an Electron product. Options
    for Milestone 8, in order of preference: enable trimming (Trace uses only
    `NotifyIcon` and `NativeWindow` from WinForms, so the saving is large) and
    verify SQLitePCLRaw still resolves its provider; or ship framework-dependent
    and have the installer carry the .NET runtime. Not addressed now because the
    binary is correct and Milestone 8 owns installer size.

---

## 14. Decisions — resolved

Settled with the product owner on 2026-08-09. These are now binding.

| # | Decision | Resolution |
|---|---|---|
| **A** | **Data retention default.** `MVP.md` §5 showed 30 days, `data and database.md` §18 argued Forever, `project-architecture.md` §25 showed 1 year. | ✅ **Forever.** Settings offers Forever / 1 year / 90 days / 30 days. |
| **B** | **Search placement.** `MVP.md` §5–6 says four pages and omits Search; the kickoff brief and `project-architecture.md` §24 require it. | ✅ **Search is a fifth sidebar page.** Navigation is Overview · Timeline · Applications · Search — Settings. The `Ctrl+K` command palette still ships (per `UI and UX-design.md`) and can jump to it, but Search is independently discoverable. |
| **C** | **IPC transport.** | ✅ **Named pipe** with per-user DACL (§5). Deliberate deviation from the "localhost HTTP is simple" suggestion in `project-architecture.md` §20. |
| **D** | **Install location.** `Windows Integration` §29 vs §14. | ✅ **Per-user, no elevation** — `%LOCALAPPDATA%\Programs\Trace` (§9). |
| **E** | **Midnight-crossing sessions** in daily totals (§13.11). | ✅ **Attributed to the local day of `started_at`.** The Timeline still shows them at their true time. Splitting `active_seconds` at the boundary would require assuming activity is uniformly distributed across a session — i.e. fabricating. |

Everything else in this plan is settled by the documentation.

---

## 15. Development milestones

Vertical and testable, matching the kickoff brief's phase order. Each milestone
ends with something that can be demonstrated and verified.

| # | Milestone | Done when |
|---|---|---|
| **0** | **Toolchain** — install .NET 10 SDK (see below). | `dotnet --list-sdks` reports a 10.x SDK. **Currently blocking.** |
| **1** | **Foundation** — repo layout, tracker + desktop projects, contracts package, logging, build scripts. | `scripts/build.ps1` produces both binaries; both start and exit cleanly. |
| **2** | **Tracker proof of concept** — `--diagnose` mode printing live foreground app, executable, title, idle state, lock/unlock, sleep/wake. No database. | Verified by hand against real switching, UWP apps, lock, and sleep. |
| **3** | **Session engine** — signal queue, state machine, accumulators, in-memory only. | Full `Tracking.md` rules table green in xUnit. |
| **4** | **Database** — migrations, repositories, queries, heartbeat, crash recovery. | Engine persists; recovery tests pass; `MVP.md` §10 scenario is visible via SQL. |
| **5** | **IPC** — pipe server, ACL, contract v1, handlers; a CLI probe client. | Every contract method returns real data from a real database. |
| **6** | **Core UI** — shell, Overview, Timeline, Applications, Search, live activity — on real tracker data from day one. | The four pages render the acceptance-test day correctly. |
| **7** | **Privacy controls** — pause/resume, exclusions, title toggle, delete, export, onboarding. | Exclusion test asserts zero rows across all tables; pause verified to write nothing. |
| **8** | **Windows integration** — tray, startup entry, installer, uninstall data choice, shutdown handling. | Clean install → reboot → tracking running → uninstall with each of the three data choices. |
| **9** | **Hardening** — 72 h soak, high-frequency switching, sleep/wake/lock cycles, large-history queries, corruption handling. | Soak completes with stable memory/handles and consistent durations. |
| **10** | **Polish** — motion, empty/loading/error states, command palette, installer experience, visual refinement. | Meets the bar in `UI and UX-design.md`. |

### Milestone 0 — required now

The machine has .NET **runtimes** 6/8/9/10 but **no SDK**, so no C# can be
compiled. Install the .NET 10 SDK (x64) before Milestone 1:

```
winget install Microsoft.DotNet.SDK.10
```

Node 24.12.0, npm 11.8.0 and git 2.54.0 are present and sufficient.
