export const songsSchema = `
CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  language TEXT,
  song_key TEXT,
  display_key TEXT,
  bpm INTEGER,
  time_signature TEXT,
  capo INTEGER,
  genre TEXT,
  vibe_intensity INTEGER NOT NULL DEFAULT 5 CHECK (vibe_intensity BETWEEN 1 AND 10),
  lyrics_chord_data TEXT NOT NULL DEFAULT '{"sections":[]}',
  plain_lyrics TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','needs_review','published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_opened_at TEXT,
  deleted_at TEXT
)`;

export const songsStatusIndex = `
CREATE INDEX IF NOT EXISTS songs_status_idx
ON songs (status, deleted_at, created_at)
`;
