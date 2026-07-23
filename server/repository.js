import { db } from "./db.js";
import { slugify } from "./validation.js";

const select = `SELECT id,slug,title,artist,language,song_key AS key,bpm,time_signature AS timeSignature,capo,genre,vibe,
 vibe_intensity AS vibeIntensity,lyrics_chord_data AS lyricsChordData,plain_lyrics AS plainLyrics,
 source_name AS sourceName,source_url AS sourceUrl,source_licence AS sourceLicence,licensing_confirmed AS licensingConfirmed,
 status,generation_status AS generationStatus,generation_error AS generationError,original_title AS originalTitle,
 original_artist AS originalArtist,suggested_title AS suggestedTitle,suggested_artist AS suggestedArtist,
 created_at AS createdAt,updated_at AS updatedAt,last_opened_at AS lastOpenedAt FROM songs`;

function hydrate(row) {
  if (!row) return row;
  return { ...row, lyricsChordData: JSON.parse(row.lyricsChordData || '{"sections":[]}'), licensingConfirmed: Boolean(row.licensingConfirmed) };
}

const sortMap = {
  title_asc: "title COLLATE NOCASE ASC", title_desc: "title COLLATE NOCASE DESC",
  artist_asc: "artist COLLATE NOCASE ASC", artist_desc: "artist COLLATE NOCASE DESC",
  added_new: "created_at DESC", added_old: "created_at ASC",
  opened_new: "last_opened_at DESC", opened_old: "last_opened_at ASC",
  vibe_high: "vibe_intensity DESC", vibe_low: "vibe_intensity ASC", genre: "genre COLLATE NOCASE ASC"
};

export function listSongs(query = {}, admin = false) {
  const where = ["deleted_at IS NULL"];
  const values = [];
  if (!admin) where.push("status='published'");
  for (const [key, column] of [["language", "language"], ["genre", "genre"], ["vibe", "vibe"], ["key", "song_key"]]) {
    if (query[key]) { where.push(`${column} = ? COLLATE NOCASE`); values.push(query[key]); }
  }
  if (query.bpm) { where.push("bpm = ?"); values.push(Number(query.bpm)); }
  if (query.q) {
    where.push("(title LIKE ? OR artist LIKE ? OR genre LIKE ? OR language LIKE ? OR plain_lyrics LIKE ?)");
    values.push(...Array(5).fill(`%${query.q}%`));
  }
  const order = sortMap[query.sort] || "created_at DESC";
  const limit = Math.min(Math.max(Number(query.limit) || 60, 1), 100);
  return db.prepare(`${select} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ?`).all(...values, limit).map(hydrate);
}

export function getSong(slug, admin = false) {
  return hydrate(db.prepare(`${select} WHERE slug=? AND deleted_at IS NULL ${admin ? "" : "AND status='published'"}`).get(slug));
}

function params(song, slug) {
  return [slug, song.title, song.artist, song.language, song.key, song.bpm, song.timeSignature, song.capo, song.genre, song.vibe,
    song.vibeIntensity, JSON.stringify(song.lyricsChordData), song.plainLyrics, song.sourceName, song.sourceUrl, song.sourceLicence,
    song.licensingConfirmed ? 1 : 0, song.status];
}

export function createSong(song) {
  let slug = slugify(song.title, song.artist);
  let n = 2;
  while (db.prepare("SELECT 1 FROM songs WHERE slug=?").get(slug)) slug = `${slugify(song.title, song.artist)}-${n++}`;
  const result = db.prepare(`INSERT INTO songs (slug,title,artist,language,song_key,bpm,time_signature,capo,genre,vibe,vibe_intensity,
    lyrics_chord_data,plain_lyrics,source_name,source_url,source_licence,licensing_confirmed,status) VALUES (${Array(18).fill("?").join(",")})`).run(...params(song, slug));
  return getById(result.lastInsertRowid);
}

export function updateSong(id, song) {
  const current = getById(id);
  if (!current) return null;
  db.prepare(`UPDATE songs SET title=?,artist=?,language=?,song_key=?,bpm=?,time_signature=?,capo=?,genre=?,vibe=?,vibe_intensity=?,
    lyrics_chord_data=?,plain_lyrics=?,source_name=?,source_url=?,source_licence=?,licensing_confirmed=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(...params(song, current.slug).slice(1), id);
  return getById(id);
}

export function getById(id) { return hydrate(db.prepare(`${select} WHERE id=? AND deleted_at IS NULL`).get(id)); }
export function softDelete(id) { return db.prepare("UPDATE songs SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id).changes; }
export function setPublished(id, published) { db.prepare("UPDATE songs SET status=?,generation_status='ready',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(published ? "published" : "draft", id); return getById(id); }
export function markOpened(id) { db.prepare("UPDATE songs SET last_opened_at=CURRENT_TIMESTAMP WHERE id=? AND (last_opened_at IS NULL OR last_opened_at < datetime('now','-30 minutes'))").run(id); }
export function filters() {
  const values = column => db.prepare(`SELECT DISTINCT ${column} AS value FROM songs WHERE status='published' AND deleted_at IS NULL AND ${column} IS NOT NULL AND ${column}<>'' ORDER BY value`).all().map(x => x.value);
  return { languages: values("language"), genres: values("genre"), vibes: values("vibe"), keys: values("song_key"), bpms: values("bpm") };
}
export function dashboard() {
  const counts = db.prepare(`SELECT SUM(status='published') published,SUM(status='draft') drafts,SUM(status='needs_review' OR generation_status='needs_review') review,SUM(generation_status='failed') failed FROM songs WHERE deleted_at IS NULL`).get();
  return { ...counts, recent: listSongs({ sort: "added_new", limit: 6 }, true), opened: listSongs({ sort: "opened_new", limit: 6 }, true) };
}
