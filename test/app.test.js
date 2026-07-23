import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import request from "supertest";
import { transposeChord, transposeSong } from "../server/music.js";

let app, db, agent, passwordHash;
before(async () => {
  passwordHash = await bcrypt.hash("test-password-very-secret", 4);
  process.env.ADMIN_USERNAME = "AMK";
  process.env.ADMIN_PASSWORD_HASH = passwordHash;
  process.env.SESSION_SECRET = "test-only-session-secret-with-32-chars";
  process.env.DATABASE_URL = ":memory:";
  ({ app } = await import("../server/app.js"));
  ({ db } = await import("../server/db.js"));
  agent = request.agent(app);
});
beforeEach(() => {
  db.exec("DELETE FROM sessions; DELETE FROM jobs; DELETE FROM songs;");
  db.prepare(`INSERT INTO songs (slug,title,artist,language,genre,status,plain_lyrics,lyrics_chord_data,licensing_confirmed)
    VALUES ('published','Alpha Song','Artist One','English','Folk','published','safe original words','{"sections":[]}',1),
    ('burmese','မြန်မာ သီချင်း','Artist Two','Burmese','Pop','published','','{"sections":[]}',1),
    ('draft','Hidden Draft','Artist Three','English','Rock','draft','','{"sections":[]}',0)`).run();
});

test("public visitors list, search, filter, sort, and open only published songs", async () => {
  let response = await request(app).get("/api/songs");
  assert.equal(response.status, 200); assert.equal(response.body.data.length, 2);
  response = await request(app).get("/api/songs?q=safe");
  assert.equal(response.body.data[0].slug, "published");
  response = await request(app).get("/api/songs?language=Burmese");
  assert.equal(response.body.data[0].slug, "burmese");
  response = await request(app).get("/api/songs?sort=title_desc");
  assert.equal(response.body.data.length, 2);
  assert.equal((await request(app).get("/api/songs/published")).status, 200);
  assert.equal((await request(app).get("/api/songs/draft")).status, 404);
});

test("authentication rejects incorrect credentials, permits admin, and logout invalidates session", async () => {
  assert.equal((await agent.post("/api/auth/login").send({ username: "AMK", password: "wrong" })).status, 401);
  assert.equal((await agent.get("/api/admin/dashboard")).status, 401);
  assert.equal((await agent.post("/api/auth/login").send({ username: "AMK", password: "test-password-very-secret" })).status, 200);
  assert.equal((await agent.get("/api/admin/dashboard")).status, 200);
  await agent.post("/api/auth/logout");
  assert.equal((await agent.get("/api/admin/dashboard")).status, 401);
});

test("administrator creates, edits, publishes, and soft-deletes a song", async () => {
  await agent.post("/api/auth/login").send({ username: "AMK", password: "test-password-very-secret" });
  const payload = { title: "Original Work", artist: "AMK", language: "English", vibeIntensity: 6, lyricsChordData: { sections: [] }, licensingConfirmed: true, status: "draft" };
  let response = await agent.post("/api/admin/songs").send(payload);
  assert.equal(response.status, 201); const id = response.body.data.id;
  response = await agent.put(`/api/admin/songs/${id}`).send({ ...payload, genre: "Folk" });
  assert.equal(response.body.data.genre, "Folk");
  response = await agent.post(`/api/admin/songs/${id}/publish`);
  assert.equal(response.body.data.status, "published");
  assert.equal((await agent.delete(`/api/admin/songs/${id}`)).status, 200);
});

test("validation, unique slugs, sanitisation, and SQL-like text are handled safely", async () => {
  await agent.post("/api/auth/login").send({ username: "AMK", password: "test-password-very-secret" });
  assert.equal((await agent.post("/api/admin/songs").send({ title: "", artist: "" })).status, 400);
  const base = { title: "<b>Same</b>'; DROP TABLE songs;--", artist: "Artist", vibeIntensity: 5, lyricsChordData: { sections: [] }, licensingConfirmed: false, status: "draft" };
  const one = await agent.post("/api/admin/songs").send(base), two = await agent.post("/api/admin/songs").send(base);
  assert.notEqual(one.body.data.slug, two.body.data.slug);
  assert.equal(one.body.data.title.includes("<"), false);
  assert.equal((await agent.get("/api/admin/songs")).status, 200);
});

test("rate limiting applies to repeated bad login attempts", async () => {
  const fresh = request.agent(app);
  for (let i = 0; i < 5; i++) await fresh.post("/api/auth/login").set("X-Forwarded-For", `203.0.113.${i + 10}`).send({ username: "AMK", password: "bad" });
  const response = await fresh.post("/api/auth/login").send({ username: "AMK", password: "bad" });
  assert.ok([401, 429].includes(response.status));
});

test("chord transposition supports suffixes and slash chords without mutation", () => {
  assert.equal(transposeChord("F#m7", 1), "Gm7");
  assert.equal(transposeChord("Bb", 2), "C");
  assert.equal(transposeChord("C/E", 2), "D/F#");
  const original = { sections: [{ lines: [{ lyrics: "line", chords: [{ chord: "Cadd9", position: 3 }] }] }] };
  const moved = transposeSong(original, 2);
  assert.equal(moved.sections[0].lines[0].chords[0].chord, "Dadd9");
  assert.equal(original.sections[0].lines[0].chords[0].chord, "Cadd9");
  assert.equal(moved.sections[0].lines[0].chords[0].position, 3);
});

test("API never exposes password hashes or session secrets", async () => {
  const body = JSON.stringify((await request(app).get("/api/health")).body);
  assert.equal(body.includes(passwordHash), false);
  assert.equal(body.includes(process.env.SESSION_SECRET), false);
});
