Absolutely. If we're building this properly from zero, I'd make it a Windows-first desktop application with a small background tracking service and a polished dashboard on top.

The key architectural decision: separate collection from presentation. The tracker should keep working even when the dashboard is closed.

1. Overall architecture
┌─────────────────────────────────────────────────────┐
│                    WINDOWS 11                       │
│                                                     │
│  ┌───────────────┐       ┌───────────────────────┐  │
│  │ Windows APIs  │──────▶│ Background Tracker    │  │
│  │               │       │                       │  │
│  │ • Processes   │       │ • App detection       │  │
│  │ • Foreground  │       │ • Window detection    │  │
│  │ • Events      │       │ • Session tracking    │  │
│  └───────────────┘       │ • Activity events     │  │
│                          └───────────┬───────────┘  │
│                                      │              │
│                                      ▼              │
│                          ┌───────────────────────┐  │
│                          │       SQLite DB       │  │
│                          └───────────┬───────────┘  │
│                                      │              │
│                                      ▼              │
│                          ┌───────────────────────┐  │
│                          │    Desktop UI        │  │
│                          │                       │  │
│                          │ Dashboard             │  │
│                          │ Timeline              │  │
│                          │ Applications          │  │
│                          │ Sessions              │  │
│                          │ Search                │  │
│                          │ Settings              │  │
│                          └───────────────────────┘  │
└─────────────────────────────────────────────────────┘

I'd build the UI with Electron + React + TypeScript, while the tracking component is a native Windows component.

Why?

Electron is great for the UI, but you don't want your tracking engine to depend on Electron staying open.

2. The components

I'd use five major components.

A. Tracker

Runs in the background.

Responsibilities:

Detect active application
Detect application launch/exit
Detect foreground-window changes
Record timestamps
Calculate sessions
Capture permitted metadata
Write events to SQLite
B. Database

Local SQLite database.

No cloud required.

Something like:

activity.db

This makes the system:

Fast
Offline
Private
Easy to back up
Easy to query
C. Native Windows collector

This is the important part.

It talks directly to Windows rather than trying to make Electron do everything.

D. IPC/API layer

The UI needs to ask:

"Give me today's activity."

The tracker/database responds with structured data.

E. Dashboard

React application displaying:

Today's usage
Timeline
Applications
Sessions
Search
Statistics
Settings
3. Windows APIs

This is where the project gets interesting.

Foreground application

The most important API:

GetForegroundWindow()

It gives you the handle of the window currently in the foreground.

Then:

GetWindowThreadProcessId()

lets you determine which process owns that window.

So conceptually:

GetForegroundWindow()
        ↓
HWND
        ↓
GetWindowThreadProcessId()
        ↓
PID
        ↓
Process information
        ↓
Application

Example:

Foreground HWND
       ↓
PID 8420
       ↓
chrome.exe
       ↓
Google Chrome
4. Getting application information

Once you have the process ID, you can retrieve information about it.

Useful Windows functionality includes:

Process enumeration
Process executable path
Process name
Window title
Process start time

You can therefore turn:

PID: 8420

into:

Application:
Google Chrome

Executable:
chrome.exe

Path:
C:\Program Files\Google\Chrome\Application\chrome.exe

You shouldn't blindly store every piece of process information, though.

Store only what the application actually needs.

5. Window title tracking

This is how you make the system much more useful.

You can retrieve the foreground window's title using:

GetWindowText()

So instead of:

Chrome — 1h 23m

you could have:

Google Chrome
────────────────────

YouTube
22m

GitHub
31m

Google
12m

Other
18m

For VS Code:

Visual Studio Code
────────────────────

main.ts
27m

index.html
18m

README.md
6m

But I'd make window-title collection configurable, because titles can contain sensitive information.

6. Event-driven tracking

Don't constantly hammer Windows APIs every few milliseconds.

That's wasteful.

I'd use a combination of:

Event hooks

For foreground changes, Windows provides mechanisms such as:

SetWinEventHook()

You can listen for events like:

EVENT_SYSTEM_FOREGROUND

Then Windows tells you:

"The foreground window changed."

Your tracker records the transition.

Example:

10:00:00 Chrome
10:14:32 VS Code
10:46:08 Discord
11:02:41 Chrome

That's MUCH cleaner than polling constantly.

7. Process monitoring

You also want to know when applications launch and close.

There are several approaches.

For a first version, you could periodically enumerate processes.

For a more advanced version, use Windows management/event mechanisms such as:

ETW
Windows Event Tracing
WMI process events

I'd actually avoid overengineering this initially.

Version 1:

Every 1–2 seconds:
    enumerate relevant processes
    compare against previous snapshot

Then:

New process → PROCESS_STARTED

Missing process → PROCESS_STOPPED

Later you can replace this with a more event-driven implementation.

8. The most important concept: sessions

Don't store:

Chrome = 2h 17m

as your fundamental data.

Instead, store sessions.

Example:

Chrome

Session 1
09:02:14 → 09:32:45
30m 31s

Session 2
10:14:03 → 10:58:19
44m 16s

Session 3
13:02:11 → 14:04:28
1h 02m

Then total usage is calculated from sessions.

This makes your data dramatically more useful.

9. Database architecture

I'd use SQLite.

applications
CREATE TABLE applications (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    executable TEXT,
    executable_path TEXT,
    first_seen INTEGER,
    last_seen INTEGER
);

Example:

1 | Google Chrome | chrome.exe | ... | ...
2 | Visual Studio Code | Code.exe | ... | ...
3 | Discord | Discord.exe | ... | ...
10. Sessions table
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY,
    application_id INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    duration_seconds INTEGER,
    FOREIGN KEY(application_id)
        REFERENCES applications(id)
);

Example:

42
Chrome
14:02
14:37
2100 seconds
11. Window activity

I'd keep window information separate.

CREATE TABLE window_sessions (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL,
    title TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    duration_seconds INTEGER,
    FOREIGN KEY(session_id)
        REFERENCES sessions(id)
);

So:

Chrome session
      │
      ├── YouTube
      ├── Google
      └── GitHub
12. Event log

This is your audit/history layer.

CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    application_id INTEGER,
    session_id INTEGER,
    metadata TEXT
);

Possible events:

APPLICATION_STARTED
APPLICATION_STOPPED
FOREGROUND_CHANGED
WINDOW_CHANGED
SESSION_STARTED
SESSION_ENDED
SYSTEM_LOCKED
SYSTEM_UNLOCKED

Then you can build an incredibly useful timeline.

13. Example raw event history

Your database could contain:

14:00:03
APPLICATION_STARTED
Chrome

14:00:04
FOREGROUND_CHANGED
Chrome

14:14:22
WINDOW_CHANGED
YouTube

14:37:09
FOREGROUND_CHANGED
VS Code

14:37:10
SESSION_STARTED
VS Code

15:12:45
FOREGROUND_CHANGED
Chrome

15:30:12
APPLICATION_STOPPED
Chrome

And your UI turns that ugly data into something beautiful.

14. Handling idle time

This is very important.

Imagine:

Chrome active
↓
User walks away
↓
30 minutes pass

You don't want:

Chrome — 30 minutes

when the user wasn't actually using it.

Windows has APIs such as:

GetLastInputInfo()

which lets you determine the time since the last keyboard/mouse input.

You can establish an idle threshold.

For example:

< 5 min → active
≥ 5 min → idle

Then:

Chrome
09:00 → 09:40

Active: 27m
Idle:    13m

That's WAY more accurate.

15. Lock/unlock detection

You can also detect Windows session state changes.

Useful events include:

SESSION_LOCK
SESSION_UNLOCK

Then your tracker doesn't mistakenly interpret a locked computer as active usage.

Your timeline could say:

09:00 Chrome
09:35 Computer locked
10:12 Computer unlocked
10:12 Chrome
16. What about websites?

This is where things get complicated.

Windows itself knows:

chrome.exe

but it doesn't inherently know:

youtube.com
github.com

from the browser process.

You have two legitimate architectural choices.

Option A — Browser extension

Build a Chrome/Edge extension.

The extension can report:

tab activated
URL/domain changed
tab closed

to your local application.

Then:

Chrome
 ├── youtube.com — 21m
 ├── github.com — 32m
 └── google.com — 8m

This is much cleaner than trying to inspect browser internals.

Option B — Don't track websites

Version 1 could simply track:

Chrome — 2h 14m

I'd actually start here.

17. "What was done in the app?"

I'd not make this a keylogger.

Instead, define an Activity Provider architecture.

For example:

Activity Provider
       │
       ├── Windows Provider
       ├── Browser Provider
       ├── VS Code Provider
       └── Future providers

A provider can report safe, meaningful events.

For VS Code:

workspace opened
file became active
workspace changed

For browser:

domain visited
tab activated

For Windows:

application opened
window changed
application closed

This gives you useful history without recording every keystroke or private input.

18. Background tracker architecture

I'd make the tracker a native Windows process.

Something like:

ActivityTracker.exe

When Windows starts:

Windows
   ↓
ActivityTracker.exe
   ↓
Initialize SQLite
   ↓
Register Windows event hooks
   ↓
Start monitoring

It runs quietly in the background.

19. Tracker loop

Conceptually:

START

Initialize database

Load current foreground window

Register foreground event hook

Start idle monitor

Start process monitor

WHILE running:

    receive Windows event

    IF foreground changed:
        identify application
        close previous session
        create new session
        write event

    IF process started:
        record application

    IF process stopped:
        close process record

    IF user becomes idle:
        pause active session

    IF user becomes active:
        resume session

    IF Windows locks:
        pause tracking

    IF Windows unlocks:
        resume tracking

That's the heart of the whole application.

20. Communication with the UI

I'd use local IPC.

For example:

Electron UI
     │
     │ IPC
     ▼
Tracker Service
     │
     ▼
SQLite

You could expose a local API such as:

GET /today
GET /timeline
GET /applications
GET /applications/:id
GET /sessions
GET /statistics

But because everything is local, you could also use:

Named pipes
Unix-style local sockets aren't ideal on Windows
Electron IPC
Localhost HTTP

For your first version, localhost HTTP + JSON is simple.

Example:

GET http://127.0.0.1:37421/api/today

returns:

{
  "totalSeconds": 24120,
  "applications": [
    {
      "name": "Chrome",
      "duration": 8020
    },
    {
      "name": "VS Code",
      "duration": 6940
    }
  ]
}
21. Dashboard design

I'd make this feel more like Activity Monitor + security audit log than a boring screen-time app.

Home
┌─────────────────────────────────────────────────────┐
│ Activity                                             │
│ Sunday, August 9                                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  6h 42m                 17                 42       │
│  Active Time            Apps              Sessions  │
│                                                     │
├─────────────────────────────────────────────────────┤
│ Today's Activity                                    │
│                                                     │
│ Chrome       ████████████████████  2h 14m           │
│ VS Code      ███████████████      1h 47m           │
│ Discord      ██████                  42m            │
│ Spotify      ████                    31m            │
│                                                     │
├─────────────────────────────────────────────────────┤
│ Timeline                                            │
│                                                     │
│ 08:12  Chrome                                      │
│ 09:04  VS Code                                     │
│ 09:51  Chrome                                      │
│ 10:03  Discord                                     │
│ 10:21  VS Code                                     │
│ 11:42  Spotify                                     │
└─────────────────────────────────────────────────────┘
22. Applications page

Click Applications.

Applications

Chrome
2h 14m
██████████████████

VS Code
1h 47m
██████████████

Discord
42m
██████

Spotify
31m
████

Click Chrome:

Google Chrome

Today
2h 14m

Sessions
────────────────────────

09:02 → 09:32       30m
10:14 → 10:58       44m
13:02 → 14:02       60m

Window Activity
────────────────────────

YouTube             41m
GitHub              32m
Google              18m
Other               43m
23. Timeline page

This could be the coolest page.

ACTIVITY TIMELINE

08:00
│
├── 08:12  Chrome
│           YouTube
│
├── 08:44  VS Code
│           project-x
│
├── 09:17  Chrome
│           GitHub
│
├── 09:42  Discord
│
├── 10:03  VS Code
│           main.ts
│
└── 10:41  Computer locked

You can filter:

Today
Yesterday
This week
Custom
24. Search

This is where the database really pays off.

Search:

Search activity...

Type:

github

Results:

Aug 9
Chrome
GitHub
10:14 → 10:46
32m

Aug 8
Chrome
GitHub
15:02 → 15:31
29m
25. Privacy/security settings

Because this app itself is monitoring activity, the security model is extremely important.

I'd have:

Data collection
☑ Track applications
☑ Track window titles
☐ Track websites
☑ Track idle time
☑ Track lock/unlock
Retention
Keep activity for:

○ 7 days
○ 30 days
● 1 year
○ Forever
Sensitive applications
Never record details from:

[ Password Manager       ]
[ Banking apps            ]
[ Private browser         ]

And ideally encrypt the database or at least protect access to it.

26. Recommended tech stack

For your project, I'd go:

Component	Technology
Desktop UI	Electron
Frontend	React
Language	TypeScript
Styling	Tailwind CSS
Charts	Recharts
Database	SQLite
Tracker	C++ or Rust
Windows APIs	Win32
IPC	Local HTTP / Named Pipes
Browser tracking	Chrome/Edge Extension
Packaging	electron-builder
Why native C++/Rust?

Because the Windows tracking layer needs direct access to Win32 APIs.

You can write native Windows functionality in C++, Rust, C#, etc.

For your first implementation, I'd probably choose C# if the priority is learning and getting the Windows APIs working quickly, or Rust if the goal is a more serious long-term system component.

27. Folder architecture

I'd structure the repository like this:

activity-monitor/
│
├── apps/
│   │
│   ├── desktop/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── services/
│   │   │   └── types/
│   │   │
│   │   └── electron/
│   │
│   ├── tracker/
│   │   ├── src/
│   │   │   ├── windows/
│   │   │   ├── process/
│   │   │   ├── sessions/
│   │   │   ├── idle/
│   │   │   └── database/
│   │   │
│   │   └── tests/
│   │
│   └── browser-extension/
│       ├── src/
│       └── manifest.json
│
├── packages/
│   ├── shared-types/
│   └── database/
│
├── database/
│   └── migrations/
│
└── README.md
28. Build it in phases

Do NOT try to build the entire thing at once.

I'd go:

Phase 1 — Windows tracker

Get this working first:

Chrome opened
↓
Chrome active
↓
VS Code active
↓
Chrome active
↓
Chrome closed

Store it in SQLite.

Phase 2 — Sessions

Turn those events into:

Chrome
10:02 → 10:31
29m
Phase 3 — Idle detection

Add:

Active
Idle
Locked
Unlocked
Phase 4 — Dashboard

Build:

Today
Applications
Timeline
Sessions
Phase 5 — Window titles

Add:

Chrome
 ├─ YouTube
 ├─ GitHub
 └─ Google
Phase 6 — Browser extension

Now add websites.

Phase 7 — Advanced activity providers

Only then start experimenting with application-specific integrations.

The architecture I'd actually build

If this were my project, the final system would be:

                    WINDOWS
                       │
          ┌────────────┴────────────┐
          │                         │
     Win32 APIs               Browser Extension
          │                         │
          └────────────┬────────────┘
                       ▼
               TRACKER SERVICE
                       │
          ┌────────────┼────────────┐
          │            │            │
       Process      Windows       Idle
       Monitor       Events       Monitor
          │            │            │
          └────────────┼────────────┘
                       ▼
                  EVENT ENGINE
                       │
                       ▼
                  SESSION ENGINE
                       │
                       ▼
                    SQLite
                       │
                       ▼
                 LOCAL API / IPC
                       │
                       ▼
                ELECTRON + REACT
                       │
       ┌───────────────┼────────────────┐
       ▼               ▼                ▼
   Dashboard       Timeline        Applications
       │               │                │
       └───────────────┼────────────────┘
                       ▼
                    Search

And this is the key idea: don't think of it as "an app that records everything." Think of it as an event-sourced activity history system. Every meaningful change becomes an event, and your session/statistics engine turns those events into the history the user actually wants to see.

That architecture gives you a solid foundation to eventually make this way more powerful without turning the tracker into a giant, fragile mess