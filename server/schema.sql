PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS labels (
  gaia_source_id TEXT PRIMARY KEY,
  display_label TEXT NOT NULL CHECK (length(trim(display_label)) > 0),
  evidence_json TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('seed', 'maintainer')),
  created_at TEXT NOT NULL,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS label_events (
  id INTEGER PRIMARY KEY,
  gaia_source_id TEXT NOT NULL REFERENCES labels(gaia_source_id),
  event_type TEXT NOT NULL CHECK (event_type IN ('seeded', 'created')),
  actor_login TEXT,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS label_events_gaia_source_id_index
  ON label_events(gaia_source_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS label_events_one_seed_event
  ON label_events(gaia_source_id)
  WHERE event_type = 'seeded';

CREATE TRIGGER IF NOT EXISTS label_events_no_update
BEFORE UPDATE ON label_events
BEGIN
  SELECT RAISE(ABORT, 'label events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS label_events_no_delete
BEFORE DELETE ON label_events
BEGIN
  SELECT RAISE(ABORT, 'label events are append-only');
END;
