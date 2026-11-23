"""
Fills a sandbox Trace database with made-up history for documentation
screenshots, so no real activity ever appears in the docs.

Run only against a TRACE_SANDBOX folder, with the sandbox tracker stopped:

    python -I demo_history.py <sandbox>\\Data\\activity.db

The tracker must have started once first, so the schema exists.
"""
import json
import random
import sqlite3
import sys
from datetime import datetime, timedelta

if len(sys.argv) != 2 or "sandbox" not in sys.argv[1].lower():
    sys.exit("Pass the sandbox database path (it must contain 'sandbox').")

random.seed(7)
IDENTITY_VERSION = 2001
LOCAL = datetime.now().astimezone().tzinfo


def ms(moment: datetime) -> int:
    return int(moment.timestamp() * 1000)


APPS = [
    # name, executable, path, category, weight, titles
    ("Google Chrome", "chrome.exe", r"C:\Program Files\Google\Chrome\Application\chrome.exe", "Browser", 30, [
        "Project brief - Google Docs - Google Chrome",
        "Pull requests · trace - GitHub - Google Chrome",
        "Inbox - Gmail - Google Chrome",
        "Calendar - Week of 23 November - Google Chrome",
        "SQLite query planner - Documentation - Google Chrome",
        "Design review notes - Google Docs - Google Chrome",
        "Lo-fi beats to focus - YouTube - Google Chrome",
    ]),
    ("Visual Studio Code", "code.exe", r"C:\Users\user\AppData\Local\Programs\Microsoft VS Code\Code.exe", "Development", 26, [
        "SessionEngine.cs - tracker - Visual Studio Code",
        "TimelinePage.tsx - desktop - Visual Studio Code",
        "README.md - website - Visual Studio Code",
        "schema.sql - tracker - Visual Studio Code",
    ]),
    ("Microsoft Edge", "msedge.exe", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", "Browser", 8, [
        "Quarterly figures - SharePoint - Microsoft Edge",
        "Team wiki - Onboarding - Microsoft Edge",
    ]),
    ("Spotify", "spotify.exe", r"C:\Users\user\AppData\Roaming\Spotify\Spotify.exe", "Media", 6, [
        "Spotify Premium",
        "Deep Focus - Spotify",
    ]),
    ("Microsoft Word", "winword.exe", None, "Productivity", 9, [
        "Concept note draft - Word",
        "Meeting minutes 21 Nov - Word",
    ]),
    ("Microsoft Excel", "excel.exe", None, "Productivity", 7, [
        "Budget 2027.xlsx - Excel",
        "Usage figures.xlsx - Excel",
    ]),
    ("Slack", "slack.exe", None, "Communication", 8, [
        "general (Channel) - Design team - Slack",
        "releases (Channel) - Design team - Slack",
    ]),
    ("File Explorer", "explorer.exe", r"C:\Windows\explorer.exe", "System", 4, [
        "Documents",
        "Downloads",
    ]),
    ("Notepad", "notepad.exe", r"C:\Windows\System32\notepad.exe", "Utilities", 2, [
        "todo.txt - Notepad",
    ]),
    ("Calculator", "calculatorapp.exe", r"C:\Windows\System32\calc.exe", "Utilities", 1, [
        "Calculator",
    ]),
]

BACKGROUND = [
    ("onedrive.exe", None), ("spotify.exe", 3), ("slack.exe", 6),
    ("phoneexperiencehost.exe", None), ("msedgewebview2.exe", None),
]

db = sqlite3.connect(sys.argv[1])
db.execute("PRAGMA foreign_keys = ON")
for table in ("window_sessions", "events", "sessions", "process_instances", "windows_records",
              "import_state", "applications", "profiles", "tamper_log"):
    db.execute(f"DELETE FROM {table}")

now = datetime.now(LOCAL).replace(second=0, microsecond=0)
first_day = (now - timedelta(days=40)).replace(hour=0, minute=0)

app_ids = {}
for index, (name, exe, path, category, *_rest) in enumerate(APPS, start=1):
    db.execute("INSERT INTO profiles (id, key, name, category) VALUES (?, ?, ?, ?)",
               (index, f"exe:{exe}", name, category))
    db.execute(
        """INSERT INTO applications (id, name, executable, path, first_seen, last_seen, category,
               identity_source, identity_version, profile_id, profile_link)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'registry', ?, ?, 'self')""",
        (index, name, exe, path, ms(first_day), ms(now), category, IDENTITY_VERSION, index))
    app_ids[exe] = index

weights = [app[4] for app in APPS]
record_id = 1000


def windows_record(kind: str, at: datetime) -> None:
    global record_id
    provider, event_id = {
        "BOOT": ("Microsoft-Windows-Kernel-General", 12),
        "SHUTDOWN": ("Microsoft-Windows-Kernel-General", 13),
        "SIGN_IN": ("Microsoft-Windows-Winlogon", 7001),
        "SIGN_OUT": ("Microsoft-Windows-Winlogon", 7002),
        "SLEEP": ("Microsoft-Windows-Kernel-Power", 42),
        "WAKE": ("Microsoft-Windows-Power-Troubleshooter", 1),
    }[kind]
    record_id += 1
    db.execute("INSERT INTO windows_records (log, record_id, provider, event_id, timestamp, kind) VALUES ('System', ?, ?, ?, ?, ?)",
               (record_id, provider, event_id, ms(at), kind))


def event(kind: str, at: datetime, app=None, session=None, metadata=None) -> None:
    db.execute("INSERT INTO events (timestamp, type, application_id, session_id, metadata) VALUES (?, ?, ?, ?, ?)",
               (ms(at), kind, app, session, json.dumps(metadata) if metadata else None))


def work_block(start: datetime, end: datetime) -> datetime:
    """Sessions from start until end; returns when the last one ended."""
    cursor = start
    previous = None
    while cursor < end - timedelta(minutes=2):
        app = random.choices(APPS, weights)[0]
        if app[1] == previous:
            continue
        previous = app[1]
        length = timedelta(minutes=random.choice([2, 3, 5, 8, 12, 18, 25, 35, 45]), seconds=random.randint(0, 59))
        stop = min(cursor + length, end)
        seconds = int((stop - cursor).total_seconds())
        idle = 0
        if seconds > 900 and random.random() < 0.25:
            idle = random.randint(300, min(900, seconds - 300))
        app_id = app_ids[app[1]]
        session = db.execute(
            "INSERT INTO sessions (application_id, started_at, ended_at, active_seconds, idle_seconds, end_reason) VALUES (?, ?, ?, ?, ?, 'APP_SWITCH')",
            (app_id, ms(cursor), ms(stop), seconds - idle, idle)).lastrowid
        event("FOREGROUND_CHANGED", cursor, app_id, session)
        event("SESSION_STARTED", cursor, app_id, session)
        titles = random.sample(app[5], k=min(len(app[5]), random.choice([1, 1, 2, 3])))
        slice_start = cursor
        for i, title in enumerate(titles):
            slice_end = stop if i == len(titles) - 1 else slice_start + (stop - cursor) / len(titles)
            db.execute("INSERT INTO window_sessions (session_id, title, started_at, ended_at, duration_seconds) VALUES (?, ?, ?, ?, ?)",
                       (session, title, ms(slice_start), ms(slice_end), int((slice_end - slice_start).total_seconds())))
            slice_start = slice_end
        if idle:
            idle_from = stop - timedelta(seconds=idle)
            event("IDLE_STARTED", idle_from, app_id, session)
            event("IDLE_ENDED", stop, app_id, session)
        event("SESSION_ENDED", stop, app_id, session)
        cursor = stop
    return cursor


day = first_day
while day.date() <= now.date():
    weekday = day.weekday() < 5
    if day.date() != now.date() and random.random() < (0.08 if weekday else 0.35):
        day += timedelta(days=1)
        continue  # laptop not used that day

    start = day.replace(hour=8 if weekday else 10, minute=random.randint(5, 50))
    windows_record("BOOT", start - timedelta(minutes=2))
    windows_record("SIGN_IN", start - timedelta(minutes=1))
    event("TRACKER_STARTED", start - timedelta(seconds=40))

    blocks = [(start, start.replace(hour=12, minute=random.randint(20, 50)))]
    if weekday:
        afternoon = blocks[0][1] + timedelta(minutes=random.randint(35, 60))
        blocks.append((afternoon, afternoon.replace(hour=17, minute=random.randint(10, 55))))
        if random.random() < 0.5:
            evening = afternoon.replace(hour=20, minute=random.randint(0, 40))
            blocks.append((evening, evening + timedelta(minutes=random.randint(30, 90))))

    last = start
    for i, (block_start, block_end) in enumerate(blocks):
        if day.date() == now.date():
            block_end = min(block_end, now - timedelta(minutes=3))
            if block_start >= block_end:
                break
        if i > 0:
            event("SYSTEM_UNLOCKED", block_start)
        last = work_block(block_start, block_end)
        if day.date() == now.date() and block_end >= now - timedelta(minutes=3):
            break
        db.execute("UPDATE sessions SET end_reason = 'SYSTEM_LOCK' WHERE id = (SELECT MAX(id) FROM sessions)")
        event("SYSTEM_LOCKED", last)
        if i == len(blocks) - 1:
            windows_record("SHUTDOWN", last + timedelta(minutes=4))
        elif random.random() < 0.4:
            windows_record("SLEEP", last + timedelta(minutes=10))
            windows_record("WAKE", blocks[i + 1][0] - timedelta(minutes=1))

    # One crash a fortnight or so, closed at the last heartbeat.
    if random.random() < 0.07 and day.date() != now.date():
        db.execute("UPDATE sessions SET end_reason = 'CRASH_RECOVERY' WHERE id = (SELECT MAX(id) FROM sessions)")
        event("TRACKER_RECOVERED", last + timedelta(minutes=30), metadata={"recoveredAt": ms(last + timedelta(minutes=30)), "lastHeartbeat": ms(last)})

    # Background apps while the machine was on.
    for exe, linked in BACKGROUND:
        if random.random() < 0.8:
            started = start + timedelta(seconds=random.randint(5, 300))
            ended = min(last, now) - timedelta(minutes=random.randint(0, 20))
            running = day.date() == now.date()
            db.execute(
                """INSERT INTO process_instances (pid, parent_pid, executable, path, application_id, started_at, start_observed,
                       last_seen_at, ended_at, end_state) VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?)""",
                (random.randint(2000, 60000), exe, app_ids.get(exe), ms(started), ms(started),
                 ms(now if running else ended), None if running else ms(ended), "running" if running else "ended"))
    day += timedelta(days=1)

last_end = db.execute("SELECT MAX(ended_at) FROM sessions").fetchone()[0]
db.execute("DELETE FROM tracker_state")
db.execute("INSERT INTO tracker_state (id, last_heartbeat, current_session_id, current_application_id, current_window, state) VALUES (1, ?, NULL, NULL, NULL, 'ACTIVE')",
           (last_end,))
db.execute("INSERT INTO import_state (source, imported_through) VALUES ('windows:System', ?)", (ms(now),))
db.commit()

sessions = db.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
print(f"Demo history: {sessions} sessions from {first_day:%Y-%m-%d} to {now:%Y-%m-%d %H:%M}.")
