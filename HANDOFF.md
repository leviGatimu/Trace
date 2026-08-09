# HANDOFF

## Current Task
Building **Trace** — a private, local-only Windows activity-history desktop app
(Electron/React UI + separate C#/.NET background tracker + local SQLite).
Following `DOCS/IMPLEMENTATION-PLAN.md`, which is derived from `DOCS/` and is the
binding technical spec.

## Status
**In progress — Milestones 1–4 complete and verified.**
The tracker now records real activity to a real database on this machine.
Next up: Milestone 5, IPC.

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
- [ ] **Milestone 5 — IPC** (next)
- [ ] Milestone 6 — core UI (desktop scaffolding: `package.json` only so far)
- [ ] Milestones 7–10

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
TraceTracker.exe              # record (no tray or quit yet - Milestone 8)
TraceTracker.exe --diagnose   # live Win32 + engine trace, writes nothing
TraceTracker.exe --dump       # print the recorded history, read-only
TraceTracker.exe --help
```
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

### Build notes worth keeping
- TFM `net10.0-windows10.0.17763.0`; `AllowUnsafeBlocks` required by
  `[LibraryImport]`; buffer-filling Win32 calls take `char*`, not `char[]`.
- `Microsoft.Data.Sqlite` still resolves SQLitePCLRaw 2.1.11 (GHSA-2m69-gcr7-jv3q,
  high). Pinned forward via `SQLitePCLRaw.bundle_e_sqlite3 3.0.5`.
- `UseWindowsForms` + implicit usings makes bare `Timer` ambiguous — write
  `System.Threading.Timer`.
- PowerShell 5.1 mangles native-command arguments containing double quotes. Use
  `git commit -F <file>` for commit messages.

### Exact next step on resume
**Milestone 5 — IPC.** In order:
1. `Ipc/PipeServer.cs`: `\\.\pipe\Trace.<SID>`, `PipeSecurity` granting only the
   current user SID and SYSTEM, `FILE_FLAG_FIRST_PIPE_INSTANCE` so a squatter
   causes a loud failure rather than silent impersonation. NDJSON framing, 8 MiB
   frame cap.
2. `Ipc/RequestRouter.cs` + one handler per method in
   `packages/contracts/ipc-contract.md` §5.
3. `Data/Queries/*` — read models shaped exactly as the contract returns them.
   **Every one must apply the same `minSessionSeconds` merge**, including
   `sessionCount` (finding 3 above).
4. `ContractSurfaceTests`: assert the router's registered methods equal
   `IpcMethods.All`, so the two sides of the contract cannot drift.
5. Add a `--probe` client command to exercise every method against a real
   database, the way `--dump` verifies the write path.

Do **not** start UI pages before the IPC layer returns real data.

## Recently Completed
- Milestone 4 — database, privacy gate, settings, crash recovery (2026-08-09).
- Milestone 3 — session engine with the tracking rules under test (2026-08-09).
- Milestone 2 — tracker proof of concept verified on real Windows (2026-08-09).
- Milestone 1 — project foundation, contracts, logging, build (2026-08-09).
