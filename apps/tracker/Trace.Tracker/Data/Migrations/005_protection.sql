-- 005 - Protection: the Trace PIN and the tamper log
--
-- Kept in the database rather than settings.json because settings.json is a
-- plain file anyone at the keyboard can edit, and the point of the PIN is that
-- switching Trace off takes more than that.

-- At most one row. Only salted PBKDF2 hashes are stored, never the PIN or the
-- recovery code themselves.
CREATE TABLE protection (
    id               INTEGER PRIMARY KEY CHECK (id = 1),
    pin_hash         BLOB    NOT NULL,
    pin_salt         BLOB    NOT NULL,
    recovery_hash    BLOB    NOT NULL,
    recovery_salt    BLOB    NOT NULL,
    iterations       INTEGER NOT NULL,
    -- Wrong tries since the last right one; persisted so a restart does not
    -- reset the lockout.
    failed_attempts  INTEGER NOT NULL DEFAULT 0,
    locked_out_until INTEGER NOT NULL DEFAULT 0,
    -- JSON copy of the guarded settings as last allowed. A settings.json that
    -- disagrees at startup was edited by hand, and is put back.
    guarded_settings TEXT    NOT NULL,
    created_at       INTEGER NOT NULL
);

-- Every stop, pause, wrong PIN and repair, whether or not a PIN is set.
-- Not history of activity, so deleting history does not remove it; deleting
-- everything clears it and leaves one entry saying so.
CREATE TABLE tamper_log (
    id      INTEGER PRIMARY KEY,
    at      INTEGER NOT NULL,
    kind    TEXT    NOT NULL,
    detail  TEXT    NOT NULL,
    from_ms INTEGER,
    to_ms   INTEGER
);

CREATE INDEX ix_tamper_log_at ON tamper_log(at);
