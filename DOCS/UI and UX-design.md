> **Amendment — 2026-08-09. The visual direction below has been superseded.**
>
> After seeing the flat dark interface built to this document, the product owner
> asked for **fluid glass**: layered translucency, generous radii, bubbly and
> responsive rather than austere. That reverses several specifics stated below —
> the rejections of "excessive rounded corners" and "glowing gradients", and the
> flat `#0D0F12` / `#111419` / `#15181D` surface palette.
>
> **What changed**
> - The window uses Windows 11 acrylic, so the bottom layer is the real desktop
>   blurred by the compositor.
> - Surfaces are translucent panes with backdrop blur, a top-edge highlight and
>   a soft drop shadow, floating over a slow-drifting field of colour.
> - Radii are large; anything pressable is a pill. Motion overshoots slightly.
>
> **What did not change, and must not**
> - One accent, still used only for state and action.
> - Dark-first, quiet, dense-but-not-cluttered.
> - Every state matters: loading, empty, error, partial, success.
> - Accessibility is a requirement. Text never sits on the colour field
>   directly — always on a surface with its own tint — and `prefers-reduced-motion`
>   stops the drift entirely.
>
> Everything below this line still describes the intended *structure*, *content*
> and *behaviour* of each page, which is unchanged. Read the colour and shape
> specifics as historical.

---

The app should feel like it's quietly watching the system and turning everything into an organized history.

🖥️ The overall feeling

When you open it, I want the immediate impression to be:

"This is a real piece of software."

Not:

"This is a React dashboard someone made in a weekend."

Design principles
Dark-first
Very clean
Lots of breathing room
Subtle borders
Almost no unnecessary gradients
Small amounts of color used intentionally
Smooth transitions
Strong typography
Dense enough to feel powerful, but never cluttered
Native desktop behavior
Keyboard shortcuts everywhere

I'd avoid the usual:

❌ giant colorful cards
❌ excessive rounded corners
❌ glowing gradients
❌ huge headings
❌ 15 different colors
❌ dashboard full of meaningless statistics

Instead:

quiet + precise + intelligent.

🧭 Main navigation

I'd make the application have a left sidebar.

┌─────────────────────────────────────────────────────┐
│                                                     │
│  ◉  ACTIVITY                                        │
│                                                     │
│  OVERVIEW                                           │
│  ◉ Overview                                         │
│  ◷ Timeline                                         │
│                                                     │
│  TRACKING                                           │
│  ▣ Applications                                     │
│  ◇ Windows                                          │
│  ◌ Websites                                         │
│                                                     │
│  INSIGHTS                                           │
│  ↗ Reports                                          │
│  ◫ Trends                                           │
│                                                     │
│  SYSTEM                                             │
│  ⚙ Settings                                         │
│                                                     │
│                                                     │
│  ● Tracking active                                  │
│                                                     │
│  Levi's PC                                          │
└─────────────────────────────────────────────────────┘

But I'd actually make the sidebar fairly narrow.

Around 220–240px.

The content gets the majority of the screen.

🏠 1. Overview

This is the home page.

Not a giant analytics dashboard.

It's a snapshot of what's happening on the machine.

Something like:

Good afternoon, Levi

Your activity today
──────────────────────────────────────────────────────

6h 42m
Active time

      08      10      12      14      16      18
      │       │       │       │       │       │
      █████████  ████    ███████████   ███

──────────────────────────────────────────────────────

Most used

Chrome                              2h 14m
██████████████████████

VS Code                             1h 47m
████████████████

Discord                              42m
██████

──────────────────────────────────────────────────────

Recent activity

14:02    Chrome       YouTube
13:41    VS Code      project-x
13:18    Chrome       GitHub
12:52    Discord

The page should immediately answer:

"What have I been doing today?"

🕐 2. Timeline

This should probably be the signature page.

I want this to feel almost like a flight recorder.

You have a chronological history of everything.

TODAY

08:00
│
│  08:14 ─ Chrome
│          YouTube
│          23m
│
│  08:37 ─ VS Code
│          project-x
│          51m
│
│  09:28 ─ Chrome
│          GitHub
│          17m
│
│  09:45 ─ Discord
│          12m
│
│  09:57 ─ VS Code
│          project-x
│          1h 04m
│
│  11:01 ─ Computer locked
│
│  11:47 ─ Computer unlocked
│
└──────────────────────
The killer interaction:

Hover a session → preview appears.

Click it → detailed session panel slides in from the right.

🔎 Session detail panel

For example:

Chrome

10:14 AM — 10:58 AM
44 minutes

────────────────────

Activity

10:14    Chrome opened
10:14    YouTube
10:32    Google
10:39    GitHub
10:58    Chrome closed

────────────────────

Session information

Application
Google Chrome

Window changes
3

Active time
39m

Idle time
5m

This makes the app feel deep without making the main interface overwhelming.

📦 3. Applications

This is where you explore every application.

I'd make it feel almost like Finder.

APPLICATIONS

Search applications...

Recently used
────────────────────────────────────────

Chrome
Google Chrome
2h 14m today

VS Code
Visual Studio Code
1h 47m today

Discord
Discord
42m today

Spotify
Spotify
31m today

You could have:

List / Grid toggle

List

Better for serious analysis.

Grid

Better for browsing.

🖥️ Application detail

Click Chrome.

You get a dedicated page:

← Applications

        Chrome

        Google Chrome
        chrome.exe

        Today
        2h 14m

────────────────────────────────────────

Usage

Today       2h 14m
Yesterday   1h 43m
7 days      11h 21m

────────────────────────────────────────

Sessions

09:02     30m
10:14     44m
13:02     60m

────────────────────────────────────────

Window activity

YouTube                 41m
GitHub                  32m
Google                  18m
Other                   43m
🌐 4. Websites

This should be optional, not core.

If browser tracking is enabled:

WEBSITES

Today

youtube.com             1h 12m
github.com               48m
google.com               31m
discord.com              18m
reddit.com               12m

Click:

youtube.com

and you can see:

Today

09:02 → 09:18
10:31 → 10:47
13:22 → 14:00

Again, clean and factual.

🪟 5. Windows

This could be one of the coolest differentiators.

Instead of applications, show individual windows/workspaces.

For example:

WINDOWS

Visual Studio Code
────────────────────────

project-x
main.ts

project-x
index.html

project-x
README.md

Chrome
────────────────────────

YouTube
GitHub
Google

This is basically your granular history layer.

📊 6. Reports

Don't make this another dashboard.

Make it generated reports.

Example:

WEEKLY REPORT

August 3 — August 9

Total active time
38h 42m

Most used
Chrome       12h 31m
VS Code       9h 47m
Discord       4h 12m

Most active day
Thursday — 7h 41m

Longest session
VS Code
2h 18m

And:

Export PDF

Export CSV

📈 7. Trends

This is where you get the beautiful charts.

Instead of:

"You spent 4 hours on Chrome."

You can show:

7 DAY ACTIVITY

          Mon Tue Wed Thu Fri Sat Sun

Chrome     █   █   █   █   █   █   █
VS Code    █   █   █   █   █   █   █
Discord    ░   █   ░   █   █   ░   █

And a proper line chart:

Active hours

8h ┤               ╭─╮
6h ┤      ╭──╮    │ │
4h ┤ ╭────╯  ╰────╯ ╰─╮
2h ┤╯                  ╰
0h └────────────────────────
    Mon Tue Wed Thu Fri Sat Sun
⚙️ 8. Settings

Very important.

This shouldn't be some ugly Electron settings page.

Make it look like a real application.

Categories:

General
Launch at startup
Start minimized
Theme
Notifications
Tracking
Application tracking
Window tracking
Website tracking
Idle detection
Lock/unlock tracking
Privacy
Excluded applications
Excluded websites
Data retention
Database encryption
Clear history
Data
Export
Import
Backup
Database location
Advanced
Developer logs
Diagnostics
Tracker status
🔐 Privacy should be a first-class feature

This app is literally monitoring activity.

So I would make privacy part of the identity of the product, not an afterthought.

Somewhere in the UI:

● Tracking Active

Everything stays on this device.
Nothing is uploaded.

That little message would make the product feel trustworthy.

🎨 Visual design

Here's where I would be picky.

Background

Almost black, but not pure black.

Something around:

#0D0F12
Sidebar

Slightly lighter:

#111419
Cards

Only when actually necessary:

#15181D
Borders

Very subtle:

rgba(255,255,255,.07)
Text

Primary:

#F5F5F5

Secondary:

#8B9099

🔵 Accent

I'd pick one accent.

Not rainbow.

Something like a muted electric blue.

Use it for:

Active navigation
Selected timeline events
Progress
Important actions
Tracking indicator

Everything else stays neutral.

✨ Animations

This is where you can make it feel expensive.

But subtle.

Page transitions

150–200ms.

Sidebar

Smooth active indicator.

Timeline

Events fade/slide in.

Application detail

Right-side panel slides in.

Charts

Animate when first appearing.

Live tracking

The current session could have a tiny animated indicator:

● Chrome
  23m 41s

The dot gently pulses.

Not some crazy glowing effect.

🧠 One REALLY cool feature
"Live Activity"

At the bottom of the sidebar:

● Currently active

Chrome
YouTube

23m 41s

Click it.

The right side opens:

CURRENT SESSION

Chrome

YouTube

Started
14:02:11

Duration
23m 41s

Active
22m 18s

Idle
1m 23s

And the timer updates live.

That makes the whole application feel alive.

⌨️ Keyboard-first

Since this is a desktop app, I'd add a command palette.

Press:

Ctrl + K

and:

╭─────────────────────────────────────╮
│ Search Activity...                  │
│                                     │
│ ↗ Open Timeline                     │
│ ▣ Applications                      │
│ ◷ Today's Activity                  │
│ ⚙ Settings                          │
│ ⏸ Pause Tracking                    │
╰─────────────────────────────────────╯

That's the kind of thing that makes someone go:

"Oh damn, this is actually polished."

🖥️ And one more thing...

I wouldn't call the app "Activity Tracker."

That's boring.

The product should have an actual identity.

Something like:

Trace

Know where your time went.

Chronicle

Your digital history, organized.

Sentinel

Know what happens on your machine.

Tracepoint

Every session. Every moment.

Ledger

Your digital activity, recorded.

Personally?

TRACE goes hard.

The app opens:

TRACE

Your digital activity, organized.

Then you're immediately inside the timeline.

That's much more like a real product than "PC Activity Monitor."