export const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  puuid       TEXT PRIMARY KEY,
  game_name   TEXT,
  tag_line    TEXT
);

CREATE TABLE IF NOT EXISTS matches (
  match_id      TEXT PRIMARY KEY,
  game_start_ts INTEGER,
  duration_s    INTEGER,
  queue_id      INTEGER,
  raw_json      TEXT
);

CREATE TABLE IF NOT EXISTS participants (
  match_id   TEXT REFERENCES matches(match_id),
  puuid      TEXT,
  champion   TEXT,
  role       TEXT,
  kills      INTEGER,
  deaths     INTEGER,
  assists    INTEGER,
  win        INTEGER,
  lineup_size INTEGER,
  PRIMARY KEY (match_id, puuid)
);

CREATE TABLE IF NOT EXISTS ingest_runs (
  started_at   INTEGER,
  new_matches  INTEGER,
  status       TEXT
);

CREATE TABLE IF NOT EXISTS ingest_pending (
  match_id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS ingest_cursors (
  puuid TEXT PRIMARY KEY,
  start_time INTEGER NOT NULL
);
`;
