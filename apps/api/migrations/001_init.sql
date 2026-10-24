CREATE TABLE IF NOT EXISTS puzzles (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  par INTEGER NOT NULL,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'Anonymous',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  puzzle_id TEXT NOT NULL REFERENCES puzzles(id),
  player_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  journal JSONB NOT NULL DEFAULT '[]',
  actions_spent INTEGER NOT NULL DEFAULT 0,
  resets INTEGER NOT NULL DEFAULT 0,
  failed BOOLEAN NOT NULL DEFAULT FALSE,
  solved BOOLEAN NOT NULL DEFAULT FALSE
);

-- One attempt per puzzle per player, Wordle-style.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_puzzle_player
  ON sessions (puzzle_id, player_id);

CREATE TABLE IF NOT EXISTS scores (
  puzzle_id TEXT NOT NULL REFERENCES puzzles(id),
  player_id TEXT NOT NULL,
  action_count INTEGER NOT NULL,
  elapsed_ms BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (puzzle_id, player_id)
);

CREATE INDEX IF NOT EXISTS scores_leaderboard
  ON scores (puzzle_id, action_count, elapsed_ms);
