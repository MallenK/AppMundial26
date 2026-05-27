-- ============================================================
-- AppMundial26 — Initial Schema Migration
-- ============================================================

-- Better Auth tables (required by better-auth library)
CREATE TABLE IF NOT EXISTS "user" (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  email_verified  BOOLEAN NOT NULL DEFAULT false,
  image           TEXT,
  bio             TEXT,
  total_points    INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
  id              TEXT PRIMARY KEY,
  expires_at      TIMESTAMPTZ NOT NULL,
  token           TEXT UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address      TEXT,
  user_agent      TEXT,
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  id                      TEXT PRIMARY KEY,
  account_id              TEXT NOT NULL,
  provider_id             TEXT NOT NULL,
  user_id                 TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token            TEXT,
  refresh_token           TEXT,
  id_token                TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope                   TEXT,
  password                TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "verification" (
  id          TEXT PRIMARY KEY,
  identifier  TEXT NOT NULL,
  value       TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FOOTBALL DATA
-- ============================================================

CREATE TABLE IF NOT EXISTS competitions (
  id                  SERIAL PRIMARY KEY,
  fd_id               INTEGER UNIQUE NOT NULL, -- football-data.io ID
  name                TEXT NOT NULL,
  code                TEXT NOT NULL,           -- "WC"
  country             TEXT,
  emblem_url          TEXT,
  current_season_id   INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
  id          SERIAL PRIMARY KEY,
  fd_id       INTEGER UNIQUE NOT NULL,
  afl_id      INTEGER UNIQUE,                  -- api-football.com ID
  name        TEXT NOT NULL,
  short_name  TEXT,
  tla         TEXT,                            -- "ESP"
  crest_url   TEXT,
  flag_url    TEXT,
  group_name  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id              SERIAL PRIMARY KEY,
  fd_id           INTEGER UNIQUE,              -- football-data.io ID (puede ser NULL si solo viene de api-football)
  afl_id          INTEGER UNIQUE,              -- api-football.com fixture ID
  competition_id  INTEGER REFERENCES competitions(id),
  home_team_id    INTEGER REFERENCES teams(id),
  away_team_id    INTEGER REFERENCES teams(id),
  status          TEXT NOT NULL DEFAULT 'SCHEDULED',
  stage           TEXT NOT NULL DEFAULT 'GROUP_STAGE',
  group_name      TEXT,
  match_day       INTEGER,
  utc_date        TIMESTAMPTZ NOT NULL,
  home_score      INTEGER,
  away_score      INTEGER,
  home_score_ht   INTEGER,
  away_score_ht   INTEGER,
  home_score_et   INTEGER,
  away_score_et   INTEGER,
  home_score_pen  INTEGER,
  away_score_pen  INTEGER,
  minute          INTEGER,
  extra_minute    INTEGER,
  winner          TEXT,                        -- HOME_TEAM | AWAY_TEAM | DRAW
  venue           TEXT,
  referee         TEXT,
  last_synced     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_events (
  id          SERIAL PRIMARY KEY,
  match_id    INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  minute      INTEGER NOT NULL,
  extra_time  INTEGER NOT NULL DEFAULT 0,
  type        TEXT NOT NULL,                   -- GOAL | YELLOW_CARD | RED_CARD | SUBSTITUTION | VAR
  team_id     INTEGER REFERENCES teams(id),
  player_name TEXT,
  player_id   INTEGER,
  assist_name TEXT,
  detail      TEXT,                            -- "Normal Goal" | "Own Goal" | "Penalty"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS players (
  id              SERIAL PRIMARY KEY,
  fd_id           INTEGER UNIQUE,
  afl_id          INTEGER UNIQUE,
  name            TEXT NOT NULL,
  team_id         INTEGER REFERENCES teams(id),
  position        TEXT,
  nationality     TEXT,
  date_of_birth   DATE,
  shirt_number    INTEGER,
  photo_url       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_stats (
  id              SERIAL PRIMARY KEY,
  player_id       INTEGER NOT NULL REFERENCES players(id),
  competition_id  INTEGER NOT NULL REFERENCES competitions(id),
  goals           INTEGER NOT NULL DEFAULT 0,
  assists         INTEGER NOT NULL DEFAULT 0,
  minutes_played  INTEGER NOT NULL DEFAULT 0,
  yellow_cards    INTEGER NOT NULL DEFAULT 0,
  red_cards       INTEGER NOT NULL DEFAULT 0,
  shots           INTEGER NOT NULL DEFAULT 0,
  shots_on_target INTEGER NOT NULL DEFAULT 0,
  passes          INTEGER NOT NULL DEFAULT 0,
  pass_accuracy   NUMERIC(5,2),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(player_id, competition_id)
);

-- ============================================================
-- SOCIAL FEATURES
-- ============================================================

CREATE TABLE IF NOT EXISTS predictions (
  id                    SERIAL PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  match_id              INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  predicted_winner      TEXT NOT NULL,          -- HOME_TEAM | AWAY_TEAM | DRAW
  predicted_home_score  INTEGER,
  predicted_away_score  INTEGER,
  points_earned         INTEGER NOT NULL DEFAULT 0,
  is_scored             BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, match_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id          SERIAL PRIMARY KEY,
  match_id    INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  parent_id   INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  likes_count INTEGER NOT NULL DEFAULT 0,
  is_deleted  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comment_likes (
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  comment_id  INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, comment_id)
);

CREATE TABLE IF NOT EXISTS match_photos (
  id          SERIAL PRIMARY KEY,
  match_id    INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  r2_key      TEXT NOT NULL,
  url         TEXT NOT NULL,
  caption     TEXT CHECK (char_length(caption) <= 200),
  likes_count INTEGER NOT NULL DEFAULT 0,
  is_approved BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS photo_likes (
  user_id   TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  photo_id  INTEGER NOT NULL REFERENCES match_photos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, photo_id)
);

CREATE TABLE IF NOT EXISTS friendships (
  follower_id   TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  following_id  TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_utc_date ON matches(utc_date);
CREATE INDEX IF NOT EXISTS idx_matches_afl_id ON matches(afl_id) WHERE afl_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_match_id ON comments(match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_predictions_user_id ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_match_photos_match_id ON match_photos(match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON match_events(match_id, minute);
CREATE INDEX IF NOT EXISTS idx_friendships_follower ON friendships(follower_id);
CREATE INDEX IF NOT EXISTS idx_friendships_following ON friendships(following_id);
CREATE INDEX IF NOT EXISTS idx_user_total_points ON "user"(total_points DESC);
