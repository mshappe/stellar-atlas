CREATE TABLE catalog_sources (
  gaia_source_id TEXT PRIMARY KEY,
  host_names TEXT
);

CREATE TABLE source_index_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX catalog_sources_host_names_index
  ON catalog_sources(host_names)
  WHERE host_names IS NOT NULL;
