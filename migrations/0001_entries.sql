CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL COLLATE NOCASE UNIQUE,
  length REAL NOT NULL CHECK(length > 0),
  girth REAL NOT NULL CHECK(girth > 0),
  unit TEXT NOT NULL CHECK(unit IN ('cm', 'in')),
  createdAt TEXT NOT NULL,
  salt TEXT NOT NULL,
  verifier TEXT NOT NULL
);
CREATE INDEX entries_created ON entries(createdAt DESC, id DESC);
