💾 3. DATA & DATABASE BEHAVIOR — MVP

The fundamental principle I'd use is:

The database is Trace's memory.

The UI is just a way of looking at that memory.

The tracker creates the truth. The database preserves it. The UI interprets it.

So we need to design this around accuracy, recoverability, performance, and useful history.

1. What exactly are we storing?

We actually have three different kinds of information.

A. Things

Things that exist on the computer.

Examples:

Google Chrome
Visual Studio Code
Discord
Spotify

These belong in an Applications table.

B. Events

Things that happened.

Examples:

Chrome became foreground
Window changed
User became idle
User became active
Windows locked
Windows unlocked
Application exited

These belong in an Events table.

C. Sessions

Human-readable periods of activity.

Example:

Chrome
14:02 → 14:47
45 minutes

These belong in a Sessions table.

Why not just store sessions?

Because sessions are an interpretation of what happened.

Imagine:

14:00 Chrome active
14:12 VS Code active
14:40 Chrome active
14:55 idle
15:10 active

If later we discover a bug in our session calculation, having the original events means we can reconstruct the session.

That's extremely valuable.

So:

Events = source of truth.

Sessions = derived interpretation.

2. Our database structure

For MVP, I'd use SQLite.

Not PostgreSQL.

Not MongoDB.

Not Firebase.

Not a cloud database.

Just:

Trace
└── activity.db

SQLite is perfect here because:

Local
Extremely fast
Zero server
Reliable
Single-user
Easy backups
Easy querying
Works beautifully for this amount of data
3. Applications table

Something like:

applications
────────────────────────────────────
id
name
executable
path
first_seen
last_seen

Example:

1 | Google Chrome       | chrome.exe | C:\...\chrome.exe
2 | Visual Studio Code  | Code.exe   | C:\...\Code.exe
3 | Discord             | Discord.exe
Important:

We shouldn't create a new application every time Chrome launches.

Chrome should have one identity.

So when we detect:

chrome.exe

we look it up.

If it exists:

use existing application.

If not:

create it.

4. Application identity

This gets surprisingly tricky.

Imagine the user has:

C:\Program Files\Google\Chrome\Application\chrome.exe

and later Chrome updates and becomes:

C:\Program Files\Google\Chrome\Application\chrome.exe

Same executable.

Easy.

But imagine:

C:\Apps\Chrome\chrome.exe

We shouldn't necessarily treat that as a completely different application just because the path differs.

For MVP, I'd primarily identify applications using:

executable identity + normalized executable name

and keep the path as metadata.

We don't need an insanely sophisticated application identity system yet.

5. Sessions table

This is the heart of the useful data.

sessions
──────────────────────────────
id
application_id
started_at
ended_at
active_seconds
idle_seconds
end_reason

Example:

42
Chrome
14:02
14:47
39m
6m
APP_SWITCH

Notice something important:

end_reason

I'd absolutely include it.

Possible values:

APP_SWITCH
APP_EXIT
SYSTEM_LOCK
SYSTEM_SLEEP
TRACKING_PAUSED
SYSTEM_SHUTDOWN
CRASH_RECOVERY

Why?

Because later the UI can explain why a session ended.

6. Open sessions

This is a major technical issue.

When Chrome becomes active:

started_at = 14:02
ended_at = NULL

The session is open.

While it's running, we don't need to update the database every second.

The tracker knows:

Chrome session started at 14:02.

Then at 14:47:

ended_at = 14:47

And calculates duration.

This massively reduces database writes.

7. What if the computer crashes?

This is where the database design matters.

Imagine:

14:00 Chrome session starts

14:32
💥 Windows crashes

We never receive:

Chrome session ended.

So the database still has:

started_at = 14:00
ended_at = NULL

Next time Trace starts, it sees:

"Uh... there is an unfinished session."

We don't just pretend it continued until today.

Instead:

Chrome
14:00 → 14:32
End reason: CRASH_RECOVERY

The tracker can determine the last known activity boundary from its persisted state / shutdown context and close it conservatively.

If we can't determine the exact end time, we should prefer undercounting rather than inventing usage.

That's a really important philosophy.

8. Events table

Now the detailed history.

Something like:

events
──────────────────────────────
id
timestamp
type
application_id
session_id
metadata

Examples:

101 | 14:02:01 | FOREGROUND_CHANGED | Chrome
102 | 14:14:32 | WINDOW_CHANGED     | Chrome
103 | 14:37:08 | FOREGROUND_CHANGED | VS Code
104 | 14:52:44 | IDLE_STARTED       |
105 | 15:03:21 | IDLE_ENDED         |
106 | 15:10:00 | SYSTEM_LOCKED      |
9. Why store events?

Imagine six months later you want to add a feature:

"Show me every time I became idle while using Chrome."

If you've only stored:

Chrome — 12h

you can't do it.

But with events:

IDLE_STARTED
IDLE_ENDED

you can.

This is why the event log is valuable.

10. Window sessions

Now we get to the more granular information.

Suppose Chrome is active:

14:02
YouTube

then:

14:15
GitHub

then:

14:29
Google

We want:

window_sessions
──────────────────────────────
id
session_id
title
started_at
ended_at
duration

So:

Chrome session
14:02 → 14:40

 ├── YouTube
 │   14:02 → 14:15
 │
 ├── GitHub
 │   14:15 → 14:29
 │
 └── Google
     14:29 → 14:40
11. Do we store every window change as an event AND a window session?

Yes.

Because they're serving different purposes.

Event:

Something happened.

Window session:

A continuous period of time spent in that window.

So:

WINDOW_CHANGED

creates/updates:

window_session

The event is historical truth.

The window session is convenient for querying.

12. What about duplicate events?

This is another thing we need to protect against.

Windows could theoretically give us repeated signals:

Chrome foreground
Chrome foreground
Chrome foreground

We don't want:

Chrome session #1
Chrome session #2
Chrome session #3

So the tracker maintains an in-memory state:

Current application:
Chrome

Current window:
YouTube

Current session:
#42

If Windows reports the same state again:

Do nothing.

Only genuine state changes create events.

13. How often does the database get written?

This is important for performance.

We should NOT do:
every 1 second:
    INSERT activity

That would be dumb.

Instead, writes happen on state transitions.

For example:

Chrome becomes active
        ↓
INSERT session
INSERT event

Window changes
        ↓
UPDATE previous window
INSERT new window
INSERT event

Idle starts
        ↓
INSERT event

Idle ends
        ↓
INSERT event

Chrome stops being active
        ↓
UPDATE session
INSERT event

The database should be very quiet when nothing is happening.

14. But what about an active session lasting 6 hours?

We have:

Chrome
10:00
ended_at = NULL

If the PC loses power at 16:00, we need some way to avoid losing the state.

So I'd have the tracker maintain a small checkpoint.

For example, periodically update a lightweight tracker state record, perhaps every few minutes, or whenever important transitions occur.

This isn't to count time every second.

It's for recovery.

15. Tracker state

I'd have something like:

tracker_state
────────────────────────
id
last_heartbeat
current_session_id
current_application_id
current_window
state

Example:

last_heartbeat:
2026-08-09 14:42:10

current_session:
582

state:
ACTIVE

This helps us understand what the tracker was doing before an unexpected interruption.

16. Database indexes

This sounds boring.

It isn't.

Trace will constantly ask questions like:

"Give me today's events."

"Give me Chrome sessions."

"Give me activity between 2PM and 4PM."

So we'd index:

events.timestamp
events.application_id

sessions.started_at
sessions.application_id

window_sessions.started_at
window_sessions.session_id

Then even after a lot of history accumulates, queries stay fast.

17. How much data are we actually talking about?

This is one reason I'm comfortable with forever retention.

Suppose someone generates:

1,000 events/day

That's:

365,000 events/year

That's not remotely scary for SQLite.

Even several years of activity is manageable, especially because our tracker is event-based rather than writing every second.

And realistically, many users won't generate anywhere near 1,000 meaningful events every day.

18. Forever retention

I'd make the MVP default:

Keep history indefinitely.

Because Trace's whole value proposition is:

Your computer has a memory.

Deleting old history automatically undermines that.

But the user can configure:

Data retention

○ Forever
○ 1 year
○ 90 days
○ 30 days

For MVP, we can implement the setting even if we keep the underlying cleanup mechanism simple.

19. Deleting history

We need two different deletion concepts.

Delete individual activity

For example:

Delete today's Chrome history.

Delete everything
Delete all activity

This permanently removes your
recorded activity from this device.

[ Cancel ] [ Delete Everything ]

This should be a serious destructive action with confirmation.

20. Should deleted data be recoverable?

For MVP:

No.

If the user deletes activity, Trace removes it.

We're not building a forensic recovery system.

21. Database location

I'd hide the database from normal users.

Something along the lines of:

%LOCALAPPDATA%\Trace\Data\activity.db

The application manages it.

Settings could show:

Data location

C:\Users\Levi\AppData\Local\Trace\Data

[ Open Folder ]

Useful for advanced users, but not something they need to touch.

22. Backup

For MVP, I would not build automatic cloud backup.

But I'd make local export possible.

For example:

Settings
   ↓
Data
   ↓
Export History

Could export:

trace-export.json

or:

trace-export.csv

I'd prioritize JSON because it can preserve the full event structure.

CSV is useful later for spreadsheets.

23. Database migration

This is something people forget until it's too late.

Suppose Trace v1 has:

sessions

Then Trace v2 needs a new column:

category

We shouldn't just alter random tables during startup.

We should have migrations:

migrations/
001_initial.sql
002_add_tracker_state.sql
003_add_end_reason.sql

When Trace starts:

Database version: 2
Application expects: 3

Run migration 003
        ↓
Database version: 3

This means we can evolve Trace without destroying users' history.

24. Time storage

This is a very important technical choice.

I would store timestamps as UTC internally.

Then the UI converts them into the user's local time.

Why?

Because time zones and daylight-saving changes can make local timestamps messy.

So database:

2026-08-09T12:42:10Z

UI:

2:42 PM

For duration, use integer seconds/milliseconds rather than formatted strings.

Database:

duration_seconds = 1842

UI:

30m 42s

Never store:

"30 minutes"

as the actual duration.

25. What does the UI query?

This is where our database design starts paying off.

Overview

Needs:

Total active time today
Top applications
Recent sessions
Current session
Timeline

Needs:

All sessions/events between
start-of-day and end-of-day
Applications

Needs:

All applications
Usage totals
Session count
Last used
Application detail

Needs:

Sessions for application
Window activity
Historical usage

All of that becomes straightforward with our schema.

26. One thing I REALLY want to avoid

Don't let the UI calculate fundamental truth.

For example, don't have React saying:

"Chrome was open from 2:00 to 2:40, therefore 40 minutes."

The tracker/database layer should provide:

active_seconds = 2400

The UI should only say:

40m

This keeps our architecture clean.

27. The data flow

So the final MVP flow looks like:

WINDOWS EVENT
     │
     ▼
Tracker
     │
     ├── Determine current app
     ├── Determine current window
     ├── Determine state
     │
     ▼
Event Processor
     │
     ├── Create event
     ├── Close previous session
     ├── Open new session
     └── Update state
     │
     ▼
SQLite
     │
     ├── Applications
     ├── Sessions
     ├── Window Sessions
     ├── Events
     └── Tracker State
     │
     ▼
Local API / IPC
     │
     ▼
React UI
28. The most important database principle

I'd actually write this into the project documentation:

Never fabricate activity.

If Trace doesn't know what happened, it should say so.

For example, if the PC crashes:

Bad:

Chrome — 7 hours 42 minutes

when we only know it was active before the crash.

Good:

Chrome — 32 minutes
Session interrupted by unexpected shutdown

Accuracy is more important than making the numbers look nice.

29. So our MVP database is essentially this
┌──────────────────┐
│   applications   │
├──────────────────┤
│ id               │
│ name             │
│ executable       │
│ path             │
│ first_seen       │
│ last_seen        │
└────────┬─────────┘
         │
         │
         ▼
┌──────────────────┐
│     sessions     │
├──────────────────┤
│ id               │
│ application_id   │
│ started_at       │
│ ended_at         │
│ active_seconds   │
│ idle_seconds     │
│ end_reason       │
└────────┬─────────┘
         │
         ▼
┌──────────────────────┐
│   window_sessions    │
├──────────────────────┤
│ id                   │
│ session_id           │
│ title                │
│ started_at           │
│ ended_at             │
│ duration_seconds     │
└──────────────────────┘


┌──────────────────┐
│      events      │
├──────────────────┤
│ id               │
│ timestamp        │
│ type             │
│ application_id   │
│ session_id       │
│ metadata         │
└──────────────────┘


┌──────────────────┐
│  tracker_state   │
├──────────────────┤
│ id               │
│ last_heartbeat   │
│ current_session  │
│ current_app      │
│ current_window   │
│ state            │
└──────────────────┘
My proposed MVP decisions
Question	Decision
Database	SQLite
Storage	Local only
Retention	Forever by default
Raw events	Yes
Sessions	Yes
Window sessions	Yes
Open sessions	Supported
Crash recovery	Yes
Database migrations	Yes
Timestamps	UTC
Durations	Integer seconds
Automatic cloud backup	No
Export	Yes, JSON
Delete history	Yes
Database writes	Event/state based, not every second
Source of truth	Events
UI calculations	No fundamental activity calculations
Data fabrication	Never
And one subtle but important thing:

I wouldn't over-engineer the database beyond this for the MVP.

No PostgreSQL.
No Redis.
No cloud sync.
No analytics warehouse.
No microservices.

One local SQLite database, owned by the tracker, with a clean event/session model.

That gives us a very strong foundation without turning a simple Windows app into a distributed systems thesis. 😭

Next logical MVP topic after this is 🖥️ Windows integration & lifecycle — startup, tray behavior, sleep/wake, shutdown, permissions, installer, and exactly how the tracker lives on the machine.