🖥️ 4. Windows Integration & Application Lifecycle

Our goal for the MVP should be:

The user downloads one .exe, installs Trace like any normal Windows application, and after that Trace quietly handles tracking in the background while the beautiful desktop UI is available whenever they want it.

The user shouldn't need:

Python
Node.js
Git
VS Code
a terminal
a database server
administrator knowledge

They download:

Trace-Setup.exe

Install → launch → configure → done.

1. 📦 How the user gets Trace

The final MVP should be distributed as a Windows .exe installer.

Something like:

Trace-Setup-1.0.0.exe

The user double-clicks it.

They get a proper Windows installation experience:

┌───────────────────────────────────────┐
│                                       │
│              TRACE                    │
│                                       │
│       Your computer, remembered.      │
│                                       │
│       Installing Trace...             │
│                                       │
│       ███████████████░░░              │
│                                       │
└───────────────────────────────────────┘

After installation:

[ Launch Trace ]

No command line.

No setup scripts.

No manually starting the tracker.

2. 🧩 What actually gets installed?

This is where our architecture becomes important.

I would not make the whole thing one giant Electron process.

Instead, the installation contains several components.

Conceptually:

Trace
│
├── Trace.exe
│   └── Desktop UI
│
├── TraceTracker.exe
│   └── Background Windows tracker
│
├── Trace data
│   └── SQLite database
│
└── Configuration
    └── Settings

The user sees Trace.

The technical components work behind the scenes.

3. 🖥️ Trace.exe

This is the application the user interacts with.

It's our desktop UI.

Potential stack:

Electron
+
React
+
TypeScript

This gives us:

Beautiful modern UI
Animations
Charts
Timeline
Search
Settings
Dashboard
Native desktop window
System tray integration

When the user opens Trace:

Trace.exe
    ↓
Beautiful UI
4. ⚙️ TraceTracker.exe

This is the important part.

The tracker is not the dashboard.

Its job is basically:

"Watch Windows activity and record it accurately."

It handles:

Foreground application detection
Window detection
Session management
Idle detection
Lock/unlock
Sleep/wake
Application exits
Database writes
Recovery
Tracker health

It doesn't need to render a beautiful interface.

It doesn't need React.

It doesn't need Electron.

It just needs to be extremely reliable.

5. Why separate the tracker from Electron?

Because we don't want:

User closes Trace
        ↓
Electron closes
        ↓
Tracking stops

Instead:

User closes Trace UI
        ↓
Trace.exe exits
        ↓
TraceTracker.exe
        ↓
🟢 STILL TRACKING

This is a huge difference.

The dashboard is optional.

The tracker is the actual engine.

6. 🟢 Starting Trace

When Windows starts:

Windows boots
       ↓
TraceTracker starts
       ↓
Tracker initializes
       ↓
SQLite opens
       ↓
Tracking begins

The UI doesn't necessarily need to open.

The user doesn't need to see a giant Trace window every time they start their PC.

Instead:

Desktop
   ↓
Trace quietly running
   ↓
System tray
7. 🚀 Start with Windows

I'd make:

Start Trace with Windows

enabled by default during onboarding.

But importantly:

Start the tracker, not necessarily the dashboard.

So after Windows boots:

TraceTracker.exe
        ↓
Running
        ↓
System tray indicator

The dashboard stays closed unless the user opens it.

That makes Trace feel like a proper background utility.

8. 🧰 System Tray

The tray becomes an important part of Trace.

Something like:

        Windows tray
             ↓

        ● Trace

Right-click:

┌─────────────────────────────┐
│ Trace                       │
├─────────────────────────────┤
│ ● Tracking                  │
│                             │
│ Open Trace                  │
│ Pause Tracking              │
│                             │
│ ─────────────────────────── │
│ Today's Activity            │
│                             │
│ Settings                    │
│                             │
│ Quit Trace                  │
└─────────────────────────────┘

This means the user can control Trace without opening the entire application.

9. Closing the window

This needs to be very intentional.

If the user clicks:

X

I don't want Trace to automatically stop tracking.

Instead:

X
 ↓
Close dashboard
 ↓
Tracker continues

The application disappears.

The tracker remains alive.

The tray icon remains.

10. Quit vs Close

We should distinguish:

Close
X

Means:

Close the dashboard.

Tracking continues.

Quit Trace

From tray:

Quit Trace

Means:

Stop the tracker and exit Trace completely.

Before quitting, we could potentially show:

Stop tracking?

Trace will stop recording activity
until it is started again.

[ Cancel ] [ Stop Tracking ]

Though we should avoid annoying confirmation dialogs for ordinary actions.

11. What if the user manually quits Trace?

Then:

TraceTracker.exe
      ↓
Stops
      ↓
Current session closed
      ↓
Tracking ends

On the next Windows startup, if automatic startup is enabled:

Windows starts
      ↓
TraceTracker starts again

So quitting is temporary unless startup settings are changed.

12. ⏸️ Pause vs Quit

These are different.

Pause
Tracker stays running
Tracking data collection stops

Useful when the user says:

"I'm doing something private."

Quit
Tracker shuts down
Trace stops entirely

Useful when:

"I don't want Trace running."

13. Remembering the paused state

This is important.

Suppose:

Monday
User pauses Trace

Then:

Tuesday
Windows restarts

Should Trace automatically start tracking again?

I'd say NO.

If the user deliberately paused tracking, we should respect that.

So:

Tracking state:
PAUSED

survives restart.

The user has to manually resume.

That's much better for trust.

14. 🔐 Windows permissions

Trace should use the minimum permissions possible.

We shouldn't have the installer screaming:

"Administrator privileges required!"

unless something genuinely requires it.

The ideal experience:

Install
 ↓
Windows user permissions
 ↓
Trace works

If a particular Windows feature requires elevated permissions, we should isolate that requirement rather than running the entire tracker as administrator.

15. 🪟 Windows APIs

The tracker will rely on native Windows functionality for things like:

Foreground window

We need to determine:

Which window is currently active?

Windows APIs can provide the foreground window handle.

From there we can identify:

HWND
 ↓
Process ID
 ↓
Executable
 ↓
Application
Window title

We can retrieve the title associated with the foreground window.

Example:

GitHub - Google Chrome
Process information

We need to associate the active window with:

process.exe
PID
executable path
Idle detection

Windows provides information that lets us determine the amount of time since the user's last input.

We don't need to record every mouse movement.

We only ask:

"How long since the user last interacted?"

Session / lock state

Windows provides system/session notifications that can tell us when the workstation becomes locked or unlocked.

Power state

We need to respond to Windows power events:

Sleep
Hibernate
Resume

so we don't accidentally count sleep as application usage.

16. Native tracker technology

This is another architectural decision.

We have a few options.

Option A — C#

Very attractive for a Windows-only application.

TraceTracker.exe
      ↓
.NET
      ↓
Windows APIs

Advantages:

Great Windows support
Easy Windows API access
Excellent tooling
Easy executable distribution
Option B — C++

Maximum native control, but more complicated.

Option C — Rust

Very interesting for reliability and performance.

But it adds more complexity for a young MVP project.

Option D — Node/Electron

Easy initially.

But I'd avoid making the core tracker dependent on Electron.

My MVP choice:
C# / .NET for TraceTracker.exe

Then:

Electron + React + TypeScript
              │
              │ IPC
              ▼
       TraceTracker.exe
              │
              ▼
          SQLite

That gives us a proper native Windows tracking engine without making the whole product difficult to build.

17. 🔄 UI ↔ Tracker communication

We need a communication layer.

Something like:

Trace UI
   │
   │ IPC
   ▼
TraceTracker

The UI might ask:

GET_CURRENT_ACTIVITY

Tracker responds:

Chrome
GitHub - Google Chrome
Active for 14m

The UI might send:

PAUSE_TRACKING

Tracker responds:

TRACKING_PAUSED
18. What happens if the UI crashes?

This is where the separation pays off.

Trace.exe
   💥

Tracker:

TraceTracker.exe
   🟢

Tracking continues.

When the user opens Trace again:

Trace.exe
   ↓
Connect to tracker
   ↓
Get current state
   ↓
Dashboard updates

No activity loss.

19. What if the tracker crashes?

This is more serious.

We need a recovery strategy.

Possibility:

TraceTracker.exe
       ↓
💥 crash
       ↓
Windows / Trace launcher detects failure
       ↓
Restart tracker
       ↓
Recover state
       ↓
Continue tracking

The tracker should also write enough state to SQLite that a crash doesn't corrupt the database or create ridiculous sessions.

20. Tracker heartbeat

The UI should know whether the tracker is alive.

Something like:

Tracker status

● Connected

or:

Tracker status

⚠ Tracker unavailable

Internally:

Tracker
   ↓
heartbeat
   ↓
UI

This also helps us diagnose problems.

21. What if the tracker is unavailable?

The dashboard shouldn't just show:

"Something went wrong."

It should say:

Tracker unavailable

Trace isn't currently receiving
activity data.

[ Restart Tracker ]

That's a much more professional experience.

22. 💤 Sleep / wake

Let's make the actual lifecycle crystal clear.

Before sleep
Chrome
14:00 → 14:32

Windows goes to sleep:

SYSTEM_SLEEP

Session closes/pause state recorded.

Wake
SYSTEM_WAKE

Tracker checks:

What's currently foreground?

Then creates a new session if appropriate.

It does not assume the previous app is still active.

23. 🔒 Lock / unlock

Same philosophy.

Lock:

Chrome
14:00 → 14:32

SYSTEM_LOCK

No tracking while locked.

Unlock:

SYSTEM_UNLOCK

Then determine the current foreground application and start/resume appropriately.

24. 🔄 Windows restart

Normal restart:

Windows
 ↓
TraceTracker receives shutdown lifecycle
 ↓
Close active session
 ↓
Flush database
 ↓
Exit

Then:

Windows starts
 ↓
TraceTracker starts
 ↓
Database opens
 ↓
Tracking resumes

Ideally this happens without the user ever thinking about it.

25. 💥 Unexpected shutdown

If the computer loses power:

Windows
 💥

Trace doesn't get the nice shutdown event.

So:

Next startup
 ↓
Tracker detects unfinished session
 ↓
Recover conservatively
 ↓
Mark session as interrupted

Which matches our database policy.

26. 🧑‍💻 Multiple Windows accounts

Suppose a family computer has:

Windows account A
Windows account B

Trace should not merge their activity.

Each Windows user gets their own:

%LOCALAPPDATA%\Trace\

So:

User A
└── activity.db

User B
└── activity.db

Separate histories.

This also reinforces our privacy model.

27. 🖥️ Multiple monitors

For MVP, let's keep this very simple.

If the user has:

Monitor 1 → Chrome
Monitor 2 → VS Code

Windows still has a concept of a foreground window.

Trace follows that.

So:

Foreground window = active application.

We don't attempt to track "attention" across multiple monitors.

That's a completely different and much harder problem.

28. 🔌 What happens if the user unplugs internet?

Nothing.

Trace should continue working.

Internet:
❌

Trace:
🟢 Tracking

Because our core architecture is local.

This is actually one of the nice properties of the product.

29. 📁 Installation directory vs data directory

We should keep these separate.

Application:

C:\Program Files\Trace\

User data:

C:\Users\<User>\AppData\Local\Trace\

Why?

Because application files and user data have different lifecycles.

When Trace updates:

Program files
   ↓
replace/update

But:

activity.db

stays untouched.

That's essential.

30. 🔄 Updates

Eventually:

Trace v1.0
     ↓
Trace v1.1

The installer updates the application.

But:

activity.db

remains.

Then database migrations handle schema changes.

For example:

App v1.0
DB v1

        ↓ update

App v1.1
DB migration
        ↓
DB v2

The user's history survives.

31. 🧹 Uninstall

The Windows uninstaller should remove:

Trace application
Trace tracker
Startup entries
Tray integration

But user data should have an explicit choice.

Something like:

Uninstall Trace

Your activity history is stored locally.

What would you like to do?

○ Keep my history
○ Export my history
● Delete my history

[ Uninstall ]

No surprise deletion.

No surprise preservation.

32. 🛡️ Windows Defender / security software

Because we're distributing an .exe that runs in the background and monitors active windows, security software may be understandably cautious.

That's another reason we want a clean architecture:

Signed binaries eventually
No stealth behavior
No keylogging
No injection into other processes
No browser hooking
No suspicious persistence mechanisms
Transparent installation
Clear product identity

The more legitimate the architecture looks, the easier it is to establish trust.

For a polished public release, we'd want code signing so Windows can identify the publisher and reduce scary SmartScreen warnings where possible.

For the early MVP, we can develop/test without having the full commercial signing setup.

33. 📦 What the user experience should actually be

This is the entire lifecycle:

                DOWNLOAD
                   │
                   ▼
          Trace-Setup.exe
                   │
                   ▼
              INSTALL
                   │
                   ▼
          First-run onboarding
                   │
                   ▼
          Privacy explanation
                   │
                   ▼
         Tracking preferences
                   │
                   ▼
            Start Tracking
                   │
                   ▼
       ┌─────────────────────┐
       │   TraceTracker.exe  │
       │       RUNNING       │
       └──────────┬──────────┘
                  │
                  ▼
             Windows
                  │
       ┌──────────┴──────────┐
       │                     │
       ▼                     ▼
   Activity               System
   events                 events
       │                     │
       └──────────┬──────────┘
                  ▼
               SQLite
                  │
                  ▼
             Trace UI
                  │
                  ▼
           Dashboard

And the user experiences it as simply:

Download
   ↓
Install
   ↓
Trace is running
   ↓
Forget about it
   ↓
Come back later
   ↓
"Oh damn, it actually remembers everything."

That's the magic we're aiming for.

34. Final MVP Windows architecture

So I'd lock the architecture roughly as:

┌─────────────────────────────────────────────┐
│                  WINDOWS                    │
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │         TraceTracker.exe            │   │
│   │                                     │   │
│   │  • Foreground detection             │   │
│   │  • Process detection                │   │
│   │  • Window titles                    │   │
│   │  • Idle detection                   │   │
│   │  • Lock/unlock                      │   │
│   │  • Sleep/wake                       │   │
│   │  • Session management               │   │
│   │  • Recovery                         │   │
│   └───────────────┬─────────────────────┘   │
│                   │                         │
│                   ▼                         │
│              SQLite DB                     │
│                                             │
│                   ▲                         │
│                   │ IPC                     │
│                   │                         │
│   ┌───────────────┴─────────────────────┐   │
│   │             Trace.exe               │   │
│   │                                     │   │
│   │        Electron + React             │   │
│   │                                     │   │
│   │  Dashboard                          │   │
│   │  Timeline                            │   │
│   │  Applications                        │   │
│   │  Search                              │   │
│   │  Settings                            │   │
│   └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘

And the downloadable product is:

Trace-Setup.exe

The installer installs and configures everything. The user doesn't have to know or care that there are two executables underneath.

🔒 What I'd consider "locked" for this topic
Area	MVP decision
Distribution	Windows .exe installer
UI	Electron + React + TypeScript
Tracker	Separate native TraceTracker.exe
Tracker language	C# / .NET
Database	Local SQLite
Internet required	❌ No
Background tracking	✅ Yes
Start with Windows	✅ Yes, configurable
System tray	✅ Yes
Close UI	Tracker continues
Quit Trace	Tracker stops
Pause	Stops data collection
Sleep/wake	Handled
Lock/unlock	Handled
Shutdown/restart	Handled
Unexpected crash	Recovery
Multiple Windows users	Separate histories
Multiple monitors	Foreground window only
Admin required	Avoid if possible
Updates	Installer + DB migrations
Uninstall	User chooses what happens to data
Code signing	Planned for polished distribution
And there's one architectural decision I'd strongly defend:

Don't make the tracker an Electron process.

The UI can be fancy, animated, heavy, whatever. If Electron crashes because we accidentally broke some React component, your activity tracking should not disappear with it.

The tracker should be the boring, reliable little machine in the background.

The UI is where we make Trace beautiful. The tracker is where we make Trace trustworthy.