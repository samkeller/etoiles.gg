CREATE TABLE IF NOT EXISTS players (
  puuid       TEXT PRIMARY KEY,
  game_name   TEXT,
  tag_line    TEXT
);

CREATE TABLE IF NOT EXISTS matches (
  match_id      TEXT PRIMARY KEY,     -- ex: EUW1_1234567890
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
  lineup_size INTEGER,   -- nb de joueurs de l'équipe présents dans CE match
  PRIMARY KEY (match_id, puuid)
);

CREATE TABLE IF NOT EXISTS ingest_runs (
  started_at   INTEGER,
  new_matches  INTEGER,
  status       TEXT
);