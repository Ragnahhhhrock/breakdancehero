CREATE TABLE IF NOT EXISTS scores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  difficulty  TEXT    NOT NULL CHECK (difficulty IN ('easy','normal','hard')),
  name        TEXT    NOT NULL,
  score       INTEGER NOT NULL,
  grade       TEXT    NOT NULL,
  accuracy    REAL    NOT NULL,
  max_combo   INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  ip_hash     TEXT
);
CREATE INDEX IF NOT EXISTS idx_scores_board ON scores (difficulty, score DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_scores_ip ON scores (ip_hash, created_at);
