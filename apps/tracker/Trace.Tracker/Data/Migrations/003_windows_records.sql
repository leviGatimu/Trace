-- 003 - Windows records (Trace 2.0, coverage)
--
-- Power, boot and sign-in events copied read-only from the Windows System log.
-- They let Trace say why its own record has a gap (asleep, off, signed out)
-- instead of only that it has one. They are Windows' records, not Trace's
-- observations, and are kept apart from `events` so the two can never be
-- confused or double-counted.
--
-- Windows rotates the System log and keeps only weeks of it, so a copy is the
-- only way the explanation survives as long as the history it explains.
CREATE TABLE windows_records (
    id        INTEGER PRIMARY KEY,
    log       TEXT    NOT NULL,   -- 'System'
    record_id INTEGER NOT NULL,   -- Windows' EventRecordID within that log
    provider  TEXT    NOT NULL,   -- e.g. 'Microsoft-Windows-Kernel-Power'
    event_id  INTEGER NOT NULL,   -- e.g. 42
    timestamp INTEGER NOT NULL,   -- UTC ms, as Windows recorded it
    kind      TEXT    NOT NULL    -- 'BOOT' | 'SHUTDOWN' | 'UNEXPECTED_SHUTDOWN' | 'SLEEP' | 'WAKE' | 'SIGN_IN' | 'SIGN_OUT'
);

-- Record ids restart when a log is cleared, so the id alone is not unique;
-- with its timestamp it is. Importing the same record twice is a no-op.
CREATE UNIQUE INDEX ux_windows_records_source ON windows_records(log, record_id, timestamp);
CREATE INDEX ix_windows_records_timestamp ON windows_records(timestamp);

-- How far each import has read. Kept apart from the records so that deleting
-- history does not make the next import copy the deleted records back in from
-- Windows' own log.
CREATE TABLE import_state (
    source          TEXT    PRIMARY KEY,   -- 'windows:System'
    imported_through INTEGER NOT NULL      -- UTC ms
);
