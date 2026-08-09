🎯 TRACE — MVP
The MVP's one job:

Automatically record what applications you use, when you use them, and how long you use them — then let you look back through that history.

That's it.

1. 👤 Who is the MVP for?

One person using their own Windows PC.

Not companies.
Not parents.
Not teams.
Not multi-device.

The user installs Trace on their computer and Trace quietly builds their personal activity history.

2. What does the MVP track?
✅ Applications

Example:

Chrome
VS Code
Discord
Spotify
File Explorer

For each:

When it became active
When it stopped being active
Total active duration
Number of sessions
✅ Sessions

Instead of just saying:

Chrome — 3h

we record:

Chrome

09:12 → 09:47    35m
10:03 → 10:21    18m
11:42 → 13:49    2h 07m

Total             3h

This is fundamental to the MVP.

✅ Foreground application

The MVP knows:

Which application is currently being used.

For example:

10:42:13
Chrome active

10:58:42
VS Code active

11:31:07
Chrome active
✅ Idle detection

This is also MVP.

If the computer hasn't received input for, say, 5 minutes:

Active → Idle

When the user returns:

Idle → Active

So we don't falsely report 4 hours of Chrome usage when the person walked away for 2 hours.

✅ Windows lock/unlock

Also MVP.

Computer locked
        ↓
Tracking paused

Computer unlocked
        ↓
Tracking resumes
3. What does the MVP NOT track?

This is important.

❌ No keystrokes
❌ No screenshots
❌ No mouse recordings
❌ No passwords
❌ No message contents
❌ No clipboard contents
❌ No microphone
❌ No webcam
❌ No hidden surveillance

We're recording activity metadata, not the user's private content.

4. What about window titles?
Yes.

I'd actually include this in the MVP.

Because:

Chrome — 2h 17m

is useful.

But:

Chrome

YouTube       42m
GitHub        31m
Google        18m
Other         46m

is much more useful.

So the MVP records:

Application + foreground window title + timestamps.

No browser extension yet.

No website-level tracking yet.

Just whatever Windows exposes through the active window.

5. MVP pages

Only 4 pages.

That's it.

🏠 Overview

The home page.

Answers:

"What have I been doing today?"

Shows:

Today

6h 42m
Active time

Chrome          2h 14m
VS Code         1h 47m
Discord           42m
Spotify           31m

And a simple activity timeline.

🕐 Timeline

The main history view.

TODAY

08:12
Chrome
YouTube
23m

08:35
VS Code
project-x
51m

09:26
Chrome
GitHub
17m

09:43
Discord
12m

09:55
VS Code
project-x
1h 04m

You can select a date.

That's the core "digital memory" experience.

📦 Applications

Shows all tracked applications.

APPLICATIONS

Chrome
2h 14m today

VS Code
1h 47m today

Discord
42m today

Spotify
31m today

Click an application:

Chrome

Today
2h 14m

Sessions

09:02 → 09:32
10:14 → 10:58
13:02 → 14:02

Window activity

YouTube
GitHub
Google
⚙️ Settings

Only essential settings.

Tracking
☑ Start Trace with Windows
☑ Track applications
☑ Track window titles
☑ Detect idle time
Privacy
Excluded applications

[ Add application ]

Data retention

30 days
General
Launch minimized
Theme

That's enough.

6. MVP navigation

Very simple:

TRACE

Overview
Timeline
Applications

────────────

Settings

● Tracking

No:

❌ Reports
❌ Trends
❌ AI
❌ Website dashboard
❌ Goals
❌ Productivity scores
❌ Accounts
❌ Cloud
❌ Teams

Those aren't MVP.

7. MVP database

Only four core tables.

Applications
applications

Stores:

id
name
executable
path
first_seen
last_seen
Sessions
sessions

Stores:

id
application_id
started_at
ended_at
active_duration
idle_duration
Window sessions
window_sessions

Stores:

id
session_id
title
started_at
ended_at
duration
Events
events

Stores important transitions:

id
timestamp
type
application_id
session_id
metadata

That's enough.

8. MVP background architecture

The MVP can literally be:

Windows
   │
   ▼
Trace Tracker
   │
   ├── Foreground detection
   ├── Process detection
   ├── Window title detection
   ├── Idle detection
   └── Lock/unlock detection
           │
           ▼
        SQLite
           │
           ▼
      Trace Desktop
           │
           ├── Overview
           ├── Timeline
           ├── Applications
           └── Settings

The tracker runs independently.

Close the UI → tracking continues.

9. The MVP user journey

This is the experience we should optimize.

Installation

User installs Trace.

↓

First launch
Welcome to Trace

Your computer's activity,
organized privately.

Everything stays on this device.

[ Get Started ]

↓

Permissions/setup
Activity Tracking

Trace needs access to basic
Windows activity information.

[ Enable Tracking ]

↓

Dashboard

Immediately:

Good afternoon

Trace is currently learning
your activity.

● Tracking

↓

User uses computer normally.

↓

Trace quietly records.

↓

At the end of the day:

Your day

6h 42m active

Chrome       2h 14m
VS Code      1h 47m
Discord        42m
Spotify        31m

↓

User clicks Timeline.

↓

They can see their entire day reconstructed.

That's the MVP.
10. The MVP success test

This is the most important part.

When we're done, we should be able to install Trace on a Windows PC and do this:

9:00

Open Chrome.

9:20

Switch to VS Code.

10:00

Go back to Chrome.

10:30

Walk away.

10:40

Return.

11:00

Lock PC.

11:30

Unlock.

Then open Trace and see something approximately like:

TODAY

09:00  Chrome       20m
09:20  VS Code      40m
10:00  Chrome       40m
10:30  Chrome       10m active
       Idle         0m → 10m
11:00  Computer locked
11:30  Computer unlocked

And:

Chrome       1h 10m
VS Code        40m

If we can do that reliably, the MVP works.

That's the version I'd build before adding anything else.

One sentence to keep us disciplined:

Trace MVP = a private Windows activity recorder + a beautiful interface for exploring that history.

No bloat. No AI. No accounts. No cloud. Just nail that.