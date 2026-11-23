-- 002 - Application identity (Trace 2.0, phase 2)
--
-- Additive only. No existing row is changed by this script: names are
-- re-resolved afterwards by IdentityBackfill, which only ever rewrites the
-- presentation columns of `applications`, never a session or an event.

-- What the registry says this application is, e.g. 'Communication'. NULL when
-- Trace does not know, which is not the same as 'Other'.
ALTER TABLE applications ADD COLUMN category TEXT;

-- MSIX package family for packaged (Store) apps, e.g.
-- '5319275A.WhatsAppDesktop_cv1g1gvanyjgm'. NULL for ordinary executables.
ALTER TABLE applications ADD COLUMN package_family TEXT;

-- Where `name` came from: 'registry' | 'package' | 'version-info' | 'filename'.
-- NULL means it was recorded by Trace 0.1, before sources were tracked.
ALTER TABLE applications ADD COLUMN identity_source TEXT;

-- The resolver version that last named this row. 0 = never, so every existing
-- application is re-resolved once after this migration.
ALTER TABLE applications ADD COLUMN identity_version INTEGER NOT NULL DEFAULT 0;

-- The process that owned the foreground window. NULL for sessions recorded
-- before 002; never backfilled, because it was never observed.
ALTER TABLE sessions ADD COLUMN process_id INTEGER;

-- Application profiles: what the owner thinks of as one application.
-- WhatsApp.exe and WhatsApp.Root.exe are two rows in `applications` (what was
-- observed) and one row here (how Trace interprets them). The interpretation
-- lives in its own table, so it can be re-derived without touching evidence.
--   key: 'app:<registry name>' | 'package:<family>' | 'exe:<executable>'
CREATE TABLE profiles (
    id       INTEGER PRIMARY KEY,
    key      TEXT    NOT NULL UNIQUE,
    name     TEXT    NOT NULL,
    category TEXT
);

-- Which profile an executable belongs to, and why:
-- 'package' (verified by package identity) | 'executable-name' (inferred from
-- the filename) | 'self' (its own profile). Always set by the code that writes
-- `applications`; SQLite cannot add a NOT NULL column to a table with rows.
ALTER TABLE applications ADD COLUMN profile_id INTEGER REFERENCES profiles(id);
ALTER TABLE applications ADD COLUMN profile_link TEXT;

-- Until IdentityBackfill groups them, every existing executable is its own
-- profile, so history reads correctly from the first moment after migrating.
INSERT INTO profiles (key, name) SELECT 'exe:' || executable, name FROM applications;
UPDATE applications
   SET profile_id = (SELECT p.id FROM profiles p WHERE p.key = 'exe:' || applications.executable),
       profile_link = 'self';

CREATE INDEX ix_applications_profile ON applications(profile_id);
