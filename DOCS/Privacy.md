🔐 2. PRIVACY & DATA RULES — MVP

The privacy philosophy should be:

Trace knows what happened on your computer, but it should never need to know the private content of what you were doing.

That distinction is the foundation.

We're building an activity historian, not a surveillance tool.

1. What exactly are we collecting?

For MVP, I'd divide everything into three levels.

🟢 Level 1 — Core activity

These are always collected while tracking is enabled:

Application identity
Google Chrome
chrome.exe
Application path

Potentially:

C:\Program Files\Google\Chrome\Application\chrome.exe
Foreground timestamps
14:02:13 → Chrome became active
14:37:42 → Chrome stopped being active
Window title

Example:

GitHub - Google Chrome
Idle state
14:42 → Idle
14:51 → Active
System state
Windows locked
Windows unlocked
Windows sleep
Windows wake

These are the foundation of Trace.

2. 🟡 Level 2 — Derived information

Trace can calculate these without collecting additional private information.

For example:

Chrome
2h 14m active

VS Code
1h 47m active

Discord
42m active

And:

Longest session:
VS Code — 1h 24m

Or:

Most used application:
Chrome

This isn't additional surveillance.

It's simply analysis of the activity we already collected.

3. 🔴 Level 3 — Things Trace NEVER collects

This is where I would be very strict.

❌ Keystrokes

Never record:

A
B
C
Password123

Not even temporarily.

❌ Mouse movements

We only need to know enough to determine:

"Has the user interacted with the computer?"

We don't need:

"The mouse moved from x=532,y=421 to x=800,y=211."

No mouse history.

❌ Screenshots

Absolutely not.

No:

Screenshot every 30 seconds.

No:

Screenshot when app changes.

No screenshot storage.

❌ Clipboard

Don't record:

Copied password
Copied text
Copied image

Nothing.

❌ Microphone

No audio recording.

❌ Webcam

No camera access.

❌ Files

We don't record:

"User opened personal_finances.xlsx."

At least not as a general filesystem surveillance mechanism.

For MVP, Trace is about application/window activity, not filesystem activity.

❌ Browser page contents

If Chrome's title says:

My Private Medical Information - Google Chrome

we're already potentially dealing with sensitive information.

Trace should therefore have mechanisms to exclude applications and eventually redact sensitive titles.

But we should NOT inspect webpage contents.

No DOM.

No page text.

No cookies.

No browsing history database.

No browser passwords.

4. The uncomfortable part: window titles

This is probably our biggest privacy issue.

Because window titles can contain sensitive information.

For example:

WhatsApp — John: "I need to tell you something..."

or:

Bank Account — $12,492

or:

Private Medical Document — ...

So we have to decide:

Do we record window titles by default?

My answer:

Yes, but with strong controls.

Because window titles are a major part of why Trace is useful.

But users need control over them.

5. Global "Window Titles" switch

Settings:

Privacy

Window titles

● Record window titles

Window titles help Trace provide
more detailed activity history.

[ ON ]

If disabled:

Chrome
14:00 → 14:42

instead of:

Chrome
YouTube
14:00 → 14:20
GitHub
14:20 → 14:42

This is a meaningful privacy control.

6. Application exclusions

This is mandatory MVP functionality.

Suppose the user doesn't want Trace touching their password manager.

They go:

Settings
   ↓
Privacy
   ↓
Excluded applications

Then:

+ Add application

Choose:

1Password.exe

Trace then behaves as if the application doesn't exist.

Meaning:

No app session
No window title
No events
No duration

Nothing.

7. Exclusion should happen BEFORE recording

This is important.

We don't want:

1Password
   ↓
Tracker records it
   ↓
Privacy filter removes it

Instead:

Windows event
      ↓
Privacy filter
      ↓
Is app excluded?
   ↙       ↘
 YES       NO
  ↓         ↓
IGNORE    RECORD

That means excluded information never enters the database.

Much cleaner.

8. What if the user adds an exclusion after using the app?

Example:

User used:

BankingApp

for six months.

Then decides:

"I don't want Trace recording this anymore."

Adding the exclusion doesn't magically erase the previous data.

We should offer:

Exclude application

☑ Stop tracking this application
☐ Delete existing history for this application

That lets the user choose.

9. One-click global pause

This should be extremely obvious.

Tray:

🟢 Trace is tracking

[ Pause Tracking ]

When paused:

⏸ Trace is paused

[ Resume Tracking ]

During the pause:

Nothing is recorded.

No:

Apps
Windows
Idle
Events

Nothing.

10. Pause should be real

We shouldn't say:

"Paused"

while still collecting some information in the background.

When paused:

Tracker
   ↓
Privacy gate
   ↓
RECORD NOTHING

The tracker can remain alive so it can detect when the user resumes, but activity data isn't persisted.

11. Tracking indicator

I think the user should always be able to tell whether Trace is active.

For example, in the tray:

● Trace
Tracking

or:

Ⅱ Trace
Paused

And inside the app:

● Tracking

This avoids the creepy feeling of:

"Wait... is this thing recording me?"

The answer should always be obvious.

12. No stealth mode

I'd explicitly exclude this from the MVP.

There should be no:

Hide Trace completely.

No:

Secret tracking.

No:

Invisible monitoring.

No:

Prevent user from knowing tracking is active.

That's inconsistent with the product philosophy.

13. Local-only architecture

For MVP:

No cloud.

This is a huge privacy advantage.

The data flow is:

Windows
   ↓
Trace Tracker
   ↓
SQLite
   ↓
Trace UI

Not:

Windows
   ↓
Trace
   ↓
Internet
   ↓
Our servers
   ↓
Database

There doesn't even need to be a Trace account.

14. No analytics about the user

This is another thing I'd be strict about.

Trace shouldn't quietly send:

User opened Chrome
User used Discord for 4h
User visited X

to our servers for "product analytics."

For MVP:

No activity telemetry.

Period.

If we later need crash diagnostics, that's a separate, explicit decision.

15. What about software updates?

This is one of those details people forget.

Trace may eventually need to check:

"Is there a new version?"

That's different from tracking the user's activity.

But for MVP, I'd keep it simple:

Update checking may happen separately.
It must not include activity history.
No activity data leaves the machine.

We should architect those concerns separately.

16. Database security

Now the question gets deeper.

The activity database is sitting on the user's computer.

Someone who gets access to that Windows account might potentially access it.

So we should consider:

Plain SQLite

Easy.

But the database is readable if someone gets the file.

Encrypted SQLite

More secure.

But introduces key management complexity.

Windows DPAPI

Interesting middle ground.

We can use Windows' built-in protection mechanisms to protect secrets/keys tied to the user's Windows account.

For MVP, I'd lean toward:

SQLite + Windows filesystem permissions + DPAPI for sensitive secrets/configuration.

We don't necessarily need to encrypt every SQLite page on day one if the threat model is simply protecting the user's data from other normal users on the same PC.

But we should make the architecture capable of adding database encryption cleanly.

17. Who can access the database?

Trace should operate under the current Windows user's account.

That means:

Levi
  ↓
Trace
  ↓
Levi's activity database

Another Windows user:

OtherUser
  ↓
Trace
  ↓
OtherUser's database

They shouldn't see each other's activity.

This becomes particularly important on shared computers.

18. Administrator privileges

I'd avoid requiring Administrator privileges for normal tracking if Windows APIs allow the required activity information under the user's account.

Why?

Because:

"Run Trace as administrator"

is a horrible first-run experience.

We should request the minimum permissions necessary.

19. Sensitive application defaults

We could ship a small default sensitive-app category, but I'd be careful.

For example:

Password managers
Authentication apps
Banking/security applications

The problem is that automatically deciding what is "sensitive" can become unreliable.

So I'd rather:

Make exclusions extremely easy.

Potentially during onboarding:

Protect private apps?

Trace can exclude applications from
your activity history.

[ Choose applications ]
[ Skip ]

And let the user decide.

20. Data deletion

Privacy isn't real if the user can't delete their own data.

We need:

Delete today's history
Delete today's activity
Delete application history
Delete Chrome history
Delete a date range
Delete:

From: Aug 1
To: Aug 5
Delete everything
Delete all Trace history

For MVP, at minimum:

Delete all + delete selected date range.

We don't need 17 different deletion modes yet.

21. Deletion should actually delete

No fake:

"Hidden from dashboard."

If the user says:

Delete my history.

we delete the corresponding database records.

No secret archive.

No:

deleted = true

while the data remains forever.

For MVP, deletion means deletion from Trace's database.

22. Exporting data

Privacy also means:

The user's data belongs to them.

So we should allow export.

Something like:

Settings
   ↓
Privacy & Data
   ↓
Export my data

Generate:

trace-export-2026-08-09.json

Containing the user's own activity data.

This is especially useful if they want to:

Back it up
Move computers
Analyze it themselves
Leave Trace
23. Uninstall behavior

This is very important.

When someone uninstalls Trace, what happens to their history?

I'd make the uninstaller ask:

Uninstall Trace

What should happen to your activity history?

○ Keep my data
○ Export my data
● Delete my data

[ Uninstall ]

And make the consequences crystal clear.

24. No account means something important

Because MVP is local-only:

There is no:

Trace account
email
password
cloud profile

That means we don't need to store:

User identity
Email
Name
Phone number

The application can basically be:

A piece of software installed on a Windows machine.

Beautifully simple.

25. Privacy settings structure

I'd make the MVP settings look roughly like:

PRIVACY & DATA

Tracking
────────────────────────

● Activity tracking
  Trace is currently recording activity.

[ Pause Tracking ]

Activity collected
────────────────────────

✓ Applications
✓ Window titles
✓ Active / idle state
✓ Session timestamps
✓ System lock / sleep events

Window titles
────────────────────────

[ ON ]
Record window titles for detailed history.

Excluded applications
────────────────────────

Chrome
Password Manager.exe

[ + Add Application ]

Your data
────────────────────────

[ Export Data ]

[ Delete History ]

Data location
────────────────────────

Local on this computer

[ Open Data Folder ]

That's a real privacy center, not a checkbox buried under Settings.

26. Privacy during onboarding

This is just as important as the settings page.

The first launch shouldn't say:

"Allow permissions."

and make the user wonder what the hell they're allowing.

Instead:

YOUR ACTIVITY.
YOUR COMPUTER.
YOUR DATA.

Trace records your application activity
to build a searchable history of your day.

Trace does NOT record:

• Keystrokes
• Screenshots
• Clipboard contents
• Microphone
• Webcam
• Passwords

Your activity stays on this computer.

[ Continue ]

Then:

WHAT SHOULD TRACE RECORD?

☑ Applications
☑ Window titles
☑ Active / idle time
☑ System events

[ Start Tracking ]

That's transparent.

27. Privacy around the tracker itself

Another important rule:

Trace should never secretly restart tracking after the user explicitly pauses it.

If they say:

Pause tracking

and reboot Windows:

Trace should remember:

Tracking: PAUSED

and remain paused until the user resumes it.

Otherwise the user loses trust immediately.

28. What happens if the user disables window titles?

We need to make this consistent.

Before:

Chrome
 ├── YouTube
 ├── GitHub
 └── Google

After disabling:

Chrome
14:02 → 14:47
45m

The application/session history still works.

Only the granular window history disappears.

29. Privacy and the raw event database

One subtle point:

If the user excludes an application, we don't want its name accidentally appearing in generic system events.

Bad:

Application excluded
Event:
BankingApp became foreground

That's still storing sensitive information.

So the privacy filter has to happen before event persistence.

Windows
   ↓
Activity detected
   ↓
Privacy filter
   ↓
┌───────────────┐
│ Allowed?      │
└───────┬───────┘
    YES │ NO
        │
        ├──────────→ discard
        │
        ▼
     Database

That's one of the most important architectural privacy decisions.

30. What Trace should say about privacy

I think the product should have a very clear philosophy:

Private by default. Local by design.

And not just marketing words.

That should actually be reflected in the architecture:

No account
No cloud
No activity uploads
No keylogging
No screenshots
No hidden mode
User-controlled exclusions
User-controlled pause
User-controlled deletion
User-owned export
31. The threat model

We should be realistic.

Trace cannot guarantee:

"Nobody can ever access your activity."

If someone has complete administrator/root-level access to the machine, they may be able to inspect many things.

What we can promise is:

Against casual access:

Protect the database with normal Windows permissions.

Against another Windows user:

Keep data inside the user's profile.

Against network exposure:

Don't send the activity anywhere.

Against Trace itself:

Don't collect things we don't need.

Against accidental collection:

Use exclusions and explicit settings.

That's a much more honest privacy model.

32. My final MVP privacy contract

I'd make this our internal rule:

Trace WILL collect:

Application

Name
Executable
Path

Activity

Foreground transitions
Start/end times
Active/idle state

Window

Window title, if enabled

System

Lock/unlock
Sleep/wake
Relevant lifecycle events
Trace WILL NEVER collect in MVP:
Keystrokes
Passwords
Clipboard
Screenshots
Webcam
Microphone
File contents
Browser cookies
Browser passwords
Message contents
Website page contents
General filesystem activity
Trace WILL provide:
Pause
Resume
Application exclusions
Window-title toggle
Data deletion
Data export
Local-only storage
Clear tracking indicator
Privacy-focused onboarding
Data cleanup on uninstall
🔐 The privacy principle I'd actually put at the top of the codebase

If Trace doesn't need the information to fulfill its core purpose, Trace doesn't collect it.

That's the rule that keeps us from slowly turning this into a creepy surveillance program six months into development.

And honestly, this makes the product stronger, not weaker. The whole appeal becomes:

"I can have a complete memory of my computer without giving some company a complete memory of me."

That's a pretty compelling product identity.