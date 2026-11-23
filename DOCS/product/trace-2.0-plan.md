# Trace 2.0 — Activity Intelligence: audit and plan

Status (2026-11-21): phase 1 (audit) done. **Phase 2 (application identity)
built and tested, not yet released.** Decision §3 taken: **option A**.
Phases 3–7 not started.

The brief asked for six things: application identity, process relationships,
rebuilt session reconstruction, an investigation-grade detail view, a full UI
redesign, and an intelligence layer, all while staying local-first and never a
covert monitoring tool. This document checks the brief's assumptions against the
real code and the real database first, because two of them turned out to be
wrong, and builds the plan on what is actually true.

---

## 0. Investigation brief (2026-11-22): what the records hold

A second brief reframed 2.0 around one incident. The owner suspects someone used
the unlocked PC, found a private video, and shared it in a WhatsApp group, date
unknown. It replaces phases 3–7 below with the slices in §0.4.

### 0.1 Available history (read-only checks, 2026-11-22)

| Source | Range | What it holds | Readable without admin |
|---|---|---|---|
| TRACE `activity.db` | 2026-08-09 → now, 106 days | 112,682 foreground spans, 58,890 window-title changes, 632 locks / 612 unlocks, 2,164 idle periods, 186 tracker starts, 163 crash recoveries | yes |
| Windows System log | 2026-10-07 → now | 248 boot/shutdown, 287 logon/logoff, 630 sleep/wake events | yes |
| Windows Security log | — | logons; process creation (4688) only if auditing was enabled, and it is off by default | **no** |
| Kernel-Process ETW log | — | disabled | — |
| Shell Recent items | 2025-12-01 → now | 2,797 shortcuts: a file's name and when it was last opened through the shell | yes |

- 52 TRACE gaps exceed 6 h, mostly overnight. TRACE alone cannot tell
  powered off, asleep, and collector not running apart. The System log can,
  from Oct 7 onwards.
- 163 sessions end at `CRASH_RECOVERY`. Their end time is the last
  heartbeat, so it is an estimate.
- No process lifetime history exists anywhere on this PC. TRACE never
  recorded processes, and Windows does not keep them by default.

### 0.2 What the records can and cannot establish

**Can:**
- which application held the foreground, and when;
- window titles;
- whether input was active or idle;
- lock and unlock times;
- coverage gaps;
- with the System log: boots, sleeps and logons.

**Cannot:**
- that a file was opened, a video played, or a message or attachment sent;
- who was at the keyboard;
- anything inside WhatsApp;
- background processes;
- anything before 2026-08-09 or inside a gap.

A WhatsApp message can also be sent from a linked device elsewhere, which this
PC would never see. The decisive records are WhatsApp's own: the message's
sender and time, and Settings → Linked devices. TRACE's job is to answer what
the PC was doing at that time.

### 0.3 Verified Windows event sources for short-lived processes

- **ETW kernel process provider and WMI `Win32_ProcessStartTrace`:** exact
  events, but both need admin.
- **Without admin, the only option is sampling:** a Toolhelp32 snapshot,
  or WMI `__InstanceCreationEvent WITHIN n`, which is also a poll.
- **What sampling gives:**
  - The exact start time comes from `GetProcessTimes`, so starts are
    *observed* even though they are found by polling.
  - The end time is bounded by the poll interval.
  - A process that lives shorter than one interval can be missed, and the
    UI must say so.
- **PID reuse:** solved by keying an instance on (pid, creation time).
  A parent link is valid only when the parent's creation time is earlier
  than the child's.

### 0.4 Slices

Each slice is shippable and maps to the brief's definition of done (DoD).

1. **Application profiles. Built 2026-11-22, uncommitted.** As built:
   - A `profiles` table, plus `applications.profile_id` and `profile_link`,
     added to migration 002. 002 has never shipped, so it was extended
     rather than adding a 003.
   - Every IPC `applicationId` now means a profile. The raw executable row
     appears only as `ApplicationAlias.executableId`.
   - Search matches the profile name, the executable name and the filename.
   - Delete-application removes every executable in the profile.
   - Colours are keyed by application name.
   - The app page has a new Executables tab.
   - Checked on a copy of the real history: 112,740 sessions, 58,909 windows
     and 402,201 events before and after. 265 executables became 257
     profiles, all grouped by package (Phone Link, Lively, Xbox, Bixby,
     Widgets). Searching "WhatsApp.Root" returns only WhatsApp.
   - Stable evidence IDs move to slice 2, where the inspector needs them.
   - Known gap: exclusions are still per executable, so excluding
     `whatsapp.root.exe` does not exclude `whatsapp.exe`. Fix with the
     Settings rebuild in slice 4.

   Original plan:
   - A `profiles` table holds the interpretation; `applications` stays raw,
     one row per executable.
   - Grouping uses registry id or package family; uncertain matches are
     marked as uncertain.
   - Aliases are searchable.
   - Stable evidence IDs (`S-<id>` span, `W-<id>` window, `E-<id>` event).
   - Covers DoD 1, except the process tree.
2. **Coverage. Built 2026-11-22, uncommitted.** As built:
   - Migration 003 adds `windows_records` and an `import_state` watermark,
     so deleted records are not copied back from Windows' log.
   - `Windows/SystemLogSource` reads Kernel-General 12/13, Kernel-Power
     41/42/107, Power-Troubleshooter 1 and Winlogon 7001/7002. Sign-ins
     are kept for the current account's SID only. No admin needed.
   - The import runs at startup and every 30 minutes, behind the
     `importWindowsRecords` setting (on by default, switch in Settings).
   - `coverage.get` returns segments of these kinds:
     - Trace's own: recorded, locked, paused, asleep.
     - From Windows: powered-off, asleep, signed-out.
     - From Trace's start events: trace-stopped.
     - From the absence of a start: unrecorded-window (Trace was running,
       but the window in front was excluded or protected).
     - Otherwise: unknown, or before-trace.
   - Each segment carries an evidence label, a source, evidence IDs and
     plain-language text.
   - Evidence IDs S-/W-/E-/WR- are searchable and shown in the session
     panel.
   - Real-data check: 337 Windows records copied, none on a second pass.
     The timeline and search were checked in the running app through the
     `TRACE_SANDBOX` copy.
   - Caught on real data: gaps with no restart had been labelled "Trace
     not running". They are Trace running while an excluded or protected
     window was in front. Fixed and tested.

   Original plan: Gaps are classified from TRACE events plus a read-only
   System log import that carries source labels and is deduplicated by
   record id. Partial and estimated boundaries are marked. Covers DoD 3.
3. **Process collector** (option A, opt-in, 2 s sampling, no command
   lines). Process instances, a process tree with PID-reuse checks, and
   running periods per profile; helpers fold into a profile. Covers DoD 1
   and 3.
4. **Investigation UI.**
   - Pages: Overview, Calendar, Timeline & search, Applications,
     Investigation, Processes, Settings.
   - A shared range and filters, an evidence inspector, before/after
     context and pins.
   - Export.
   - Covers DoD 2.
5. **Baseline findings.**
   - Deterministic and comparable-hour, with stated coverage and an
     insufficient-history state.
   - Run by the tracker, which runs at login, so review continues while
     the dashboard is closed.
   - Opt-in notifications with a quiet period and deduplication.
   - Dismiss and expected feedback live in their own table.
   - Covers DoD 4.
6. **Ask TRACE: dropped by the owner (2026-11-22, "leave AI").** Findings
   explain themselves with fixed, rule-written text that cites evidence IDs.
   For DoD 5, the "what these records cannot establish" text is shown on
   every finding and in the inspector instead of in a chat answer.
   **Recent items: approved, read-only, off by default.** Only file names
   and last-opened times are read, never contents. The source is labelled
   as recording the last open only.
7. **Verification in the running app.** Covers DoD 6.

---

## 1. Audit findings (phase 1)

Evidence: `apps/tracker/Trace.Tracker/Windows/ProcessIdentity.cs`, the schema in
`Data/Migrations/001_initial.sql`, and read-only queries against the owner's
`activity.db` (265 applications, ~112k sessions, Aug 9 – Nov 21 2026).

### 1.1 The WhatsApp problem is a naming bug, not a process bug

| What the brief assumed | What the data shows |
|---|---|
| `WhatsApp` and `WhatsApp.Root` are two related processes recorded as separate apps | There is **one** application row: `whatsapp.root.exe`, named "WhatsApp.Root". No `whatsapp.exe` was ever recorded. |
| Process lifetimes are being treated as usage sessions | Trace has **never** observed process lifetimes. A session is a foreground-window span (`SessionEngine`, driven by `EVENT_SYSTEM_FOREGROUND`). |
| The paired rows (47s/47s, 9s/9s) are two processes | Each pair is **one session and its one window**: session 112061 is 89 s, its window "WhatsApp" is 89 s. |

Why the pairs show up: `tidyWindowTitle` drops a window title that only repeats
the application's name, but the application is named "WhatsApp.Root" while the
window is titled "WhatsApp", so the redundant title survives as a second line.

**Root cause:** display names come from the executable's `FileDescription`.
For packaged (MSIX / Store) apps, that is an internal build name. The real name
lives in the package manifest. The same cause gives `Microsoft.MediaPlayer`,
`SnippingTool`, `FeedbackHub`, `NearbyDevices` and `Photos`. Separately, some
Win32 publishers ship poor descriptions (`Dwm`, `copilotapphost`, `S07`), which
needs a curated registry, not a better heuristic.

### 1.2 Fragmentation is real but small in time

2,391 of 4,326 WhatsApp sessions (55%) are under 5 s, including Alt-Tab,
notification clicks and focus bouncing. Together they are a small share of
WhatsApp's 38.9 h. Raw sessions are kept (`Tracking.md` §F); `SessionMerger`
already applies `minSessionSeconds` in read models. The detail views just don't
present the result as one coherent visit.

### 1.3 Constraints the brief runs into

- **ETW needs admin.** Starting a real-time trace session for the kernel
  process provider requires Administrator rights (or membership of Performance
  Log Users). Trace is per-user with no UAC prompt by decision (plan §14 D,
  `Privacy.md` §18). ETW would reverse that.
- **No-admin alternative:** a process snapshot (`CreateToolhelp32Snapshot`)
  every few seconds sees the owner's own processes with their parent process
  IDs. It finds start and end times to within one polling interval, and
  that limit must be shown as such, never presented as exact.
- **Collection scope grows.** Recording every process (often 150–300 on a
  desktop) is a large expansion of what Trace collects. `Privacy.md` lists what
  Trace collects by level. Background processes are a new category and need an
  explicit, visible switch. Command lines must **never** be recorded: they
  routinely contain file paths, URLs and tokens.

### 1.4 What already exists and should be kept

- `events` is already a raw audit log (`FOREGROUND_CHANGED`, `SESSION_*`,
  `IDLE_*`, `SYSTEM_LOCKED`…, 400k+ rows).
- `sessions` are raw foreground spans and are never rewritten.
- `SessionMerger` is already a reconstruction layer, applied at read time.
- `PrivacyGate` is the only route from engine to storage.

So the brief's principle, "never destroy raw records; build presentation on top",
is already the architecture. Trace 2.0 extends it rather than replacing it.

---

## 2. Concepts, made explicit

The brief's table, mapped onto what exists:

| Concept | Meaning | Source in Trace | Status |
|---|---|---|---|
| Raw event | One recorded system event | `events` | exists; add pid to metadata |
| Foreground span | An app held the foreground | `sessions` (raw, immutable) | exists |
| Application visit | Reconstructed period of use, with blips folded in | `SessionMerger` at read time | exists; surface it in UI |
| Process lifetime | How long a process existed | — | **new**, needs §3 decision |
| Background activity | Process alive while not in the foreground | lifetime minus foreground | **new**, needs §3 decision |

Every figure the UI shows gets an **evidence label**:

- **Observed**: Windows reported it (foreground change, lock, idle).
- **Reconstructed**: derived by a stated rule (a visit merging three spans;
  a process end time known to within a polling interval).
- **Not known**: always said out loud. A foreground window does not prove
  someone read a message, opened a file or watched a video, and the UI
  must never phrase it as if it did.

---

## 3. Open decision: background process recording

| Option | What you get | Cost |
|---|---|---|
| **A. Poll own-user processes, opt-in toggle** | Process tree, background activity, parent/child, lifetimes accurate to within ~5 s | New data category; more writes; must be disclosed in Settings and onboarding |
| B. Foreground-only (today's scope) | Process info only for the app in front (pid, parent, siblings at that moment) | No background or lifetime view |
| C. ETW with admin | Exact start/stop events | Reverses the no-UAC decision; elevated component |

Recommendation: **A**, off by default for existing installs and offered at
onboarding, with no command lines and the same exclusion list applied.
**Decided 2026-11-21: A.**

---

## 4. Plan

Each phase leaves Trace shippable. Raw data is never rewritten by a migration.

### Phase 2 — Application identity (the WhatsApp fix) — built

As built: `Identity/` (registry, `PackagePath`, resolver, backfill),
`Windows/WindowsIdentitySources.cs`, migration `002_application_identity.sql`,
and `TraceTracker.exe --identities` (read-only, shows old name → new name).
Against the owner's real history: 43 of 265 applications renamed, all 44
packaged apps resolved by registry or package. Deviation from the list below:
`sessions.executable` was not added, because `applications` stays one row per
executable, so the raw executable is already exact. Grouping several
executables into one application (three rows named "Phone Link") is moved to
phase 4; until then the Applications list shows the executable when names
collide.

- **Package identity:** resolve the owning process's package
  (`GetPackageFullName` / `GetApplicationUserModelId` from the process handle)
  and read the manifest `DisplayName`, `PublisherDisplayName` and logo. Fixes
  WhatsApp, Media Player, Photos, Snipping Tool and similar in one stroke.
- **Curated registry** (shipped JSON, versioned): executable or package family →
  name, category (Browser, Communication, Development, System…), aliases.
  Covers Edge, Chrome, WhatsApp, Discord, Telegram, VS Code, Claude, Explorer,
  system processes. Unknown apps fall through to package name, then
  `FileDescription`, then a title-cased filename, as today.
- **Schema (migration 002):** `applications` gains `category`, `package_family`,
  `identity_source` (`registry` | `package` | `version-info` | `filename`).
  `sessions` gains `process_id` and `executable` so the raw record keeps the
  exact process even when two executables resolve to one application.
- **Re-resolution of history:** names and categories are recomputed for existing
  rows; no session row is altered except to backfill the new columns.
- Tests: resolver table tests per source, a migration test on a copy of a
  real-shaped database, and the redundant-title rule.

### Phase 3 — Icons
- Extract from the executable (`SHGetFileInfo` / shell image factory) or the
  package logo, store as PNG under `%LOCALAPPDATA%\Trace\Icons\`, serve over IPC
  by application id. Monogram fallback in the app's existing hashed colour.

### Phase 4 — Reconstruction and the application detail page
- Visits as a first-class read model (the merged spans with the raw spans that
  formed them), returned by IPC with their evidence labels.
- Application page with sections for Overview, Visits, Timeline (raw events),
  Processes (phase 6), Technical details (path, package, identity source) and
  Evidence.

### Phase 5 — Interface redesign
- Navigation: **Dashboard · Activity · Applications · Investigation · Processes ·
  Settings**. Activity absorbs Timeline and Search; Calendar and Analytics move
  under Dashboard/Activity as views rather than being deleted.
- Direction: dark, restrained, dense, desktop-security rather than SaaS. Builds
  on the current flat typographic system (`HANDOFF.md`, "Visual direction")
  rather than a third restart.

### Phase 6 — Processes and investigation (needs §3)
- Process monitor (option A): snapshot diff → `PROCESS_STARTED` /
  `PROCESS_ENDED` raw events with pid, parent pid, executable and an `observed
  within ±interval` bound; a `processes` table built from them.
- Investigation workspace: choose a time window and see every event,
  foreground span and process change in it, correlated on one axis, each with
  its evidence label. Exportable.

### Phase 7 — Hardening
- History migration verified on a copy of the owner's real database.
- Profiling at 10× current volume; process polling CPU budget (< 0.5% of one
  core) measured, not assumed.
- Finish the open Milestone 9 items (sleep/wake, restart, two accounts).

---

## 5. Non-negotiables

- Local-first: nothing leaves the machine; no telemetry.
- Owner-facing: Trace shows the owner their own device. No stealth mode,
  no hidden tray, no remote viewing, no tracking of other users' sessions.
- Never collected: keystrokes, screen contents, clipboard, message or file
  contents, command lines.
- Every new data category is visible in Settings, can be turned off, and can be
  deleted.
