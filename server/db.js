import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

if (config.databaseUrl !== ":memory:") fs.mkdirSync(path.dirname(config.databaseUrl), { recursive: true });
export const db = new Database(config.databaseUrl);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      language TEXT,
      song_key TEXT,
      bpm INTEGER,
      time_signature TEXT,
      capo INTEGER,
      genre TEXT,
      vibe TEXT,
      vibe_intensity INTEGER NOT NULL DEFAULT 5 CHECK(vibe_intensity BETWEEN 1 AND 10),
      lyrics_chord_data TEXT NOT NULL DEFAULT '{"sections":[]}',
      plain_lyrics TEXT NOT NULL DEFAULT '',
      source_name TEXT,
      source_url TEXT,
      source_licence TEXT,
      licensing_confirmed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      generation_status TEXT NOT NULL DEFAULT 'draft',
      generation_error TEXT,
      original_title TEXT,
      original_artist TEXT,
      suggested_title TEXT,
      suggested_artist TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_opened_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id INTEGER,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(song_id) REFERENCES songs(id)
    );
    CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
    CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
    CREATE INDEX IF NOT EXISTS idx_songs_language ON songs(language);
    CREATE INDEX IF NOT EXISTS idx_songs_genre ON songs(genre);
    CREATE INDEX IF NOT EXISTS idx_songs_created ON songs(created_at);
    CREATE INDEX IF NOT EXISTS idx_songs_opened ON songs(last_opened_at);
  `);
}

const seedSongs = [
  ["ocean-eyes-billie-eilish", "Ocean Eyes", "Billie Eilish"],
  ["let-her-go-passenger", "Let Her Go", "Passenger"],
  ["kiss-me-sixpence-none-the-richer", "Kiss Me", "Sixpence None the Richer"]
];

export function seed() {
  const insert = db.prepare(`INSERT OR IGNORE INTO songs
    (slug,title,artist,status,generation_status,lyrics_chord_data,plain_lyrics,source_licence)
    VALUES (?,?,?,'draft','needs_review',?,'','Authorised lyrics and chords must be added through the admin editor.')`);
  const empty = JSON.stringify({ sections: [{ type: "note", label: "Content needed", lines: [{ lyrics: "Lyrics and chords have not been added. Sign in as administrator to add authorised content.", chords: [] }] }] });
  db.transaction(() => seedSongs.forEach(([slug, title, artist]) => insert.run(slug, title, artist, empty)))();
}

migrate();
if (!config.test) seed();
