-- Trace schema v1.
--
-- Conventions (DOCS/data and database.md §24):
--   *_at, *_seen, timestamp, last_heartbeat  -> UTC epoch MILLISECONDS
--   *_seconds                                -> whole SECONDS
--
-- Events are the source of truth; sessions are the derived interpretation
-- (§1). Both are stored, so a future correction to the session logic can be
-- replayed against the original history.

CREATE TABLE schema_version (
    version INTEGER NOT NULL
);

-- Applications ------------------------------------------------------------
-- One row per application, not per launch (§3). Identity is the normalised
-- executable name, with the path kept as metadata, so an application that
-- moves or updates in place keeps one identity (§4).

CREATE TABLE applications (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,          -- "Google Chrome"
    executable  TEXT    NOT NULL,          -- "chrome.exe", lowercased
    path        TEXT,                      -- NULL when unreadable (protected process)
    first_seen  INTEGER NOT NULL,
    last_seen   INTEGER NOT NULL
);

CREATE UNIQUE INDEX ux_applications_executable ON applications(executable);

-- Sessions ----------------------------------------------------------------
-- ended_at IS NULL means the session is open. Exactly one may be open at a
-- time; the partial index below makes finding it free, which crash recovery
-- does on every startup.

CREATE TABLE sessions (
    id             INTEGER PRIMARY KEY,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    started_at     INTEGER NOT NULL,
    ended_at       INTEGER,
    active_seconds INTEGER NOT NULL DEFAULT 0,
    idle_seconds   INTEGER NOT NULL DEFAULT 0,
    end_reason     TEXT                    -- NULL while open
);

CREATE INDEX ix_sessions_started_at     ON sessions(started_at);
CREATE INDEX ix_sessions_application_id ON sessions(application_id, started_at);
CREATE INDEX ix_sessions_open           ON sessions(id) WHERE ended_at IS NULL;

-- Window sessions ---------------------------------------------------------
-- No rows are written at all when window-title recording is disabled: with
-- titles off this table has no purpose, and Trace does not collect what it
-- does not need (DOCS/Privacy.md §28 and the principle at §33).

CREATE TABLE window_sessions (
    id               INTEGER PRIMARY KEY,
    session_id       INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    title            TEXT,
    started_at       INTEGER NOT NULL,
    ended_at         INTEGER,
    duration_seconds INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX ix_window_sessions_session ON window_sessions(session_id, started_at);
CREATE INDEX ix_window_sessions_started ON window_sessions(started_at);
CREATE INDEX ix_window_sessions_title   ON window_sessions(title);

-- Events ------------------------------------------------------------------
-- The audit layer (§8-9). Deliberately keeps no copy of the window title:
-- the title lives in window_sessions, and one copy is one place to delete.

CREATE TABLE events (
    id             INTEGER PRIMARY KEY,
    timestamp      INTEGER NOT NULL,
    type           TEXT    NOT NULL,
    application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
    session_id     INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    metadata       TEXT                    -- JSON, or NULL
);

CREATE INDEX ix_events_timestamp ON events(timestamp);
CREATE INDEX ix_events_app       ON events(application_id, timestamp);

-- Tracker state -----------------------------------------------------------
-- A single row (§15). The heartbeat that maintains it is the anchor crash
-- recovery closes an interrupted session against, bounding over-attribution
-- to one heartbeat interval instead of inventing hours (§7, §14).

CREATE TABLE tracker_state (
    id                     INTEGER PRIMARY KEY CHECK (id = 1),
    last_heartbeat         INTEGER NOT NULL,
    current_session_id     INTEGER,
    current_application_id INTEGER,
    current_window         TEXT,
    state                  TEXT    NOT NULL
);

INSERT INTO schema_version (version) VALUES (1);
