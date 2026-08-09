🧭 1. Exact Tracking Behavior

First, I want us to establish one core principle:

Trace records changes in activity, not every second of activity.

So instead of constantly writing to the database, the tracker listens for meaningful state changes and creates sessions from them.

A. What exactly is an "active app"?

The active app is the application owning the current foreground window.

Example:

10:00:00
Chrome is foreground
        ↓
Chrome = ACTIVE

Then:

10:17:42
VS Code becomes foreground
        ↓
Chrome = INACTIVE
VS Code = ACTIVE

Simple.

B. App opens

Suppose the user launches Chrome.

Windows tells us Chrome exists.

But we should NOT immediately count that as usage.

Instead:

Chrome process started
        ↓
Wait until Chrome becomes foreground
        ↓
Create activity session

So:

09:00:01 Chrome launched
09:00:03 Chrome becomes foreground

Session begins:

09:00:03
Chrome session START

This prevents background processes from being counted as usage.

C. Switching applications

This is the most important transition.

Example:

10:00 Chrome
10:23 VS Code

At 10:23:

Close Chrome's current active session.
Calculate its duration.
Create VS Code session.
Record the transition event.

Database conceptually:

Chrome
10:00 → 10:23
23m

VS Code
10:23 → ...
D. Switching windows inside the SAME application

This is where I want to make an important distinction.

Suppose:

Chrome → YouTube
Chrome → GitHub
Chrome → Google

We do not create three application sessions.

Chrome remains one continuous application session:

Chrome
10:00 → 10:40
40m

Inside it:

Window activity

10:00 YouTube
10:18 GitHub
10:31 Google

So:

Application session

answers:

How long was Chrome being used?

Window session

answers:

What was the user looking at during that time?

That separation is important.

E. Switching between windows of different apps

Example:

Chrome
   ↓
VS Code
   ↓
Chrome

That's three application sessions:

Chrome     10:00 → 10:20
VS Code    10:20 → 10:42
Chrome     10:42 → 11:01

Then the two Chrome sessions can be grouped when displaying daily totals:

Chrome
41m total
F. Very short switches

This is a subtle one.

Imagine:

14:00:00 Chrome
14:00:01 VS Code
14:00:02 Chrome

If we record everything literally, the timeline becomes ridiculous.

So I propose a rule:

Record every real transition, but don't create unnecessary visual clutter.

The database can retain the events.

The UI can decide:

Sessions shorter than X seconds are grouped into the surrounding activity.

I'd initially use 5 seconds as the threshold.

So the raw data stays accurate, while the UI stays clean.

G. Idle detection

This one needs a firm rule.

Let's say the threshold is:

5 minutes without user input

Then:

Chrome active
      ↓
5 minutes no keyboard/mouse
      ↓
IDLE

We do not end the Chrome session.

We pause its active-time counter.

Example:

Chrome session

10:00 → 11:00

Session duration: 60m
Active time:      42m
Idle time:        18m

This is better than creating:

Chrome
10:00 → 10:42

Idle

Chrome
11:00

because the user never actually stopped using Chrome as a session.

They simply stopped interacting.

H. What if they switch apps while idle?

Example:

Chrome active
↓
user walks away
↓
5 min
↓
IDLE
↓
user returns
↓
opens VS Code

We should handle it like:

Chrome
10:00 → 10:37
Active: 32m
Idle: 5m

VS Code
10:37 → ...

The idle period belongs to the Chrome session because Chrome was the foreground application when the idle state began.

I. What if the PC locks?

This is different from idle.

When Windows locks:

Chrome
10:00 → 10:42

10:42
SYSTEM LOCKED

We immediately pause tracking.

When unlocked:

11:31
SYSTEM UNLOCKED

We look at the currently foreground application.

If Chrome is foreground:

Chrome
11:31 → ...

If something else is foreground:

VS Code
11:31 → ...

We don't assume Chrome is still active.

J. What happens when Windows sleeps?

Very important.

Suppose:

Chrome
22:00

PC sleeps
22:30

PC wakes
07:00

We absolutely do not record:

Chrome — 9 hours

Instead:

Chrome
22:00 → 22:30
30m

SYSTEM SLEEP
22:30 → 07:00

Chrome
07:00 → ...

Sleep/hibernate/resume should therefore behave similarly to lock/unlock: activity is paused.

K. What happens when Trace itself closes?

This is crucial.

The tracker should continue.

Architecture:

Trace UI
     ✕ closed

Trace Tracker
     ● still running

So the user can close the dashboard and tracking continues.

L. What happens when the tracker crashes?

We need recovery.

On restart:

Previous session:
Chrome
14:00 → ???

Tracker stopped unexpectedly

We should close the previous session at the last known valid timestamp, mark it as interrupted, and start fresh when tracking resumes.

Something like:

Chrome
14:00 → 14:27
Status: Interrupted

rather than pretending we know what happened afterward.

M. What happens when the computer shuts down unexpectedly?

Same principle.

We don't pretend we know.

The next time Trace starts:

Previous session
Chrome
14:00 → 14:31
Ended: System shutdown

Then tracking begins again normally.

N. What if an app is running in the background?

Example:

Spotify running
Chrome foreground

Spotify should not accumulate active usage time.

It can have:

Process:
Running

but:

Active usage:
0m

until it becomes the foreground application.

This distinction is critical.

O. What if two windows belong to the same app?

Example:

VS Code window 1
VS Code window 2

Application:

VS Code

still has one application session.

Window sessions track the individual titles/windows.

P. What if an app crashes?

If Windows reports that the process disappeared:

Chrome
10:00 → 10:34
End reason: Process exited

We close the session.

No problem.

Q. What if the user opens Trace itself?

Trace is an application too.

But I don't think we should count Trace itself in normal activity statistics.

Otherwise:

Trace
1h 24m

because the dashboard happens to be open.

Instead:

Trace is excluded from tracking by default.

We can still monitor the tracker itself for diagnostics.

R. The final state machine

This is probably the cleanest way to define the MVP.

                  ┌─────────────┐
                  │    IDLE     │
                  └──────┬──────┘
                         │ user input
                         ▼
┌──────────┐       ┌─────────────┐
│  NONE    │──────▶│   ACTIVE    │
└──────────┘       └──────┬──────┘
                           │
                 no input ≥ 5 min
                           │
                           ▼
                    ┌─────────────┐
                    │    IDLE     │
                    └──────┬──────┘
                           │
                     app changes
                           │
                           ▼
                    ┌─────────────┐
                    │ NEW ACTIVE  │
                    └─────────────┘

And separately:

ACTIVE
  │
  ├── App switch → close session / start new
  │
  ├── Lock → pause
  │
  ├── Sleep → pause
  │
  ├── Process exit → close
  │
  └── Idle → pause active timer
📌 So I'd propose these MVP rules
Situation	Behavior
App launches	Don't count until foreground
App becomes foreground	Start session
Switch apps	End old session, start new
Switch windows same app	Keep app session, change window session
App goes background	Stop active usage
5 min no input	Mark idle
User returns	Resume active time
PC locks	Pause
PC sleeps	Pause
PC unlocks/wakes	Resume current foreground app
App crashes/closes	End session
Trace UI closes	Tracker keeps running
Tracker crashes	Recover previous session as interrupted
PC shuts down	Close session on next startup as interrupted
Background app	Don't count as active
Trace itself	Excluded from usage statistics
Very short <5s switch	Keep raw event, optionally merge visually
One thing I'd want to decide with you before we lock this:

Should window titles be recorded exactly as Windows gives them, or should Trace try to clean/normalize them?

For MVP, my vote is record the raw title exactly as Windows reports it, and only clean the presentation later. That gives us the most reliable underlying history.