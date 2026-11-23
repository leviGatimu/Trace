-- 004 - Background apps (Trace 2.0, opt-in process recording)
--
-- One row per process instance that ran in this Windows session while
-- "Record background apps" was on. Identity is (pid, started_at): Windows
-- reuses process ids, and the start time is what tells two processes that
-- shared an id apart. No command line, memory or module is ever stored.
CREATE TABLE process_instances (
    id             INTEGER PRIMARY KEY,
    pid            INTEGER NOT NULL,
    parent_pid     INTEGER,
    executable     TEXT    NOT NULL,   -- lowercased filename, as in applications
    path           TEXT,               -- NULL when the process could not be opened
    application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
    -- Windows' own creation time when it could be read (start_observed = 1),
    -- otherwise the first poll that saw it (0): then the true start is earlier.
    started_at     INTEGER NOT NULL,
    start_observed INTEGER NOT NULL,
    last_seen_at   INTEGER NOT NULL,
    -- Set when a poll no longer finds the process: it ended between the
    -- previous poll and this one, so this is accurate to the poll interval.
    ended_at       INTEGER,
    -- 'running' | 'ended' | 'unknown' (recording stopped while it ran, so its
    -- end was never seen)
    end_state      TEXT    NOT NULL
);

CREATE UNIQUE INDEX ux_process_instances_key ON process_instances(pid, started_at);
CREATE INDEX ix_process_instances_started ON process_instances(started_at);
CREATE INDEX ix_process_instances_app ON process_instances(application_id, started_at);
CREATE INDEX ix_process_instances_running ON process_instances(end_state) WHERE end_state = 'running';
