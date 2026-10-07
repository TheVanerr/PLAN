CREATE TABLE IF NOT EXISTS docs (
  project    TEXT    NOT NULL,
  collection TEXT    NOT NULL,
  id         TEXT    NOT NULL,
  data       TEXT    NOT NULL,
  updated    INTEGER NOT NULL,
  PRIMARY KEY (project, collection, id)
);
