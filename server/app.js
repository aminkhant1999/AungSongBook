import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { config, validateConfig } from "./config.js";
import { db } from "./db.js";
import { login, logout, requireAdmin, session, ok, fail } from "./security.js";
import { createSong, dashboard, filters, getById, getSong, listSongs, markOpened, setPublished, softDelete, updateSong } from "./repository.js";
import { parseSong } from "./validation.js";
import { suggestCorrection } from "./ai/service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
validateConfig();
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: { directives: { "script-src": ["'self'"], "img-src": ["'self'", "data:", "https:"], "font-src": ["'self'", "data:"] } } }));
app.use(compression());
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.test ? 5 : 8, standardHeaders: "draft-8", legacyHeaders: false,
  message: fail("RATE_LIMITED", "Too many sign-in attempts. Please try again later.") });

app.get("/api/health", (_req, res) => res.json(ok({ status: "healthy" })));
app.get("/api/songs", (req, res) => res.json(ok(listSongs(req.query))));
app.get("/api/songs/:slug", (req, res) => {
  const song = getSong(req.params.slug, session(req));
  return song ? res.json(ok(song)) : res.status(404).json(fail("NOT_FOUND", "Song not found."));
});
app.post("/api/songs/:id/open", (req, res) => { markOpened(Number(req.params.id)); res.json(ok({ recorded: true })); });
app.get("/api/filters", (_req, res) => res.json(ok(filters())));
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const result = await login(String(req.body.username || ""), String(req.body.password || ""));
  if (!result) return res.status(401).json(fail("INVALID_CREDENTIALS", "The username or password is incorrect."));
  res.cookie("songbook_session", result.token, { httpOnly: true, sameSite: "strict", secure: config.production, expires: new Date(result.expires), path: "/" });
  res.json(ok({ username: config.adminUsername }));
});
app.post("/api/auth/logout", (req, res) => { logout(req.cookies.songbook_session); res.clearCookie("songbook_session", { path: "/" }); res.json(ok({ loggedOut: true })); });
app.get("/api/auth/session", (req, res) => res.json(ok({ authenticated: session(req), username: session(req) ? config.adminUsername : null })));

app.get("/api/admin/dashboard", requireAdmin, (_req, res) => res.json(ok(dashboard())));
app.get("/api/admin/songs", requireAdmin, (req, res) => res.json(ok(listSongs(req.query, true))));
app.post("/api/admin/songs", requireAdmin, (req, res) => {
  const parsed = parseSong(req.body);
  if (parsed.error) return res.status(400).json(fail("VALIDATION_ERROR", "Please correct the highlighted fields.", parsed.error));
  res.status(201).json(ok(createSong(parsed.data)));
});
app.put("/api/admin/songs/:id", requireAdmin, (req, res) => {
  const parsed = parseSong(req.body);
  if (parsed.error) return res.status(400).json(fail("VALIDATION_ERROR", "Please correct the highlighted fields.", parsed.error));
  const song = updateSong(Number(req.params.id), parsed.data);
  return song ? res.json(ok(song)) : res.status(404).json(fail("NOT_FOUND", "Song not found."));
});
app.delete("/api/admin/songs/:id", requireAdmin, (req, res) => {
  const song = getById(Number(req.params.id));
  if (!song) return res.status(404).json(fail("NOT_FOUND", "Song not found."));
  softDelete(song.id); res.json(ok({ deleted: true, title: song.title }));
});
app.post("/api/admin/songs/:id/publish", requireAdmin, (req, res) => {
  const song = getById(Number(req.params.id));
  if (!song) return res.status(404).json(fail("NOT_FOUND", "Song not found."));
  if (!song.licensingConfirmed && (song.plainLyrics || song.lyricsChordData.sections?.some(s => s.type !== "note"))) return res.status(400).json(fail("LICENSING_REQUIRED", "Confirm that you are authorised to publish this content."));
  res.json(ok(setPublished(song.id, true)));
});
app.post("/api/admin/songs/:id/unpublish", requireAdmin, (req, res) => res.json(ok(setPublished(Number(req.params.id), false))));
app.post("/api/admin/songs/generate", requireAdmin, async (req, res) => {
  const title = String(req.body.title || "").trim(), artist = String(req.body.artist || "").trim();
  if (!title || !artist) return res.status(400).json(fail("VALIDATION_ERROR", "Title and artist are required."));
  const suggestion = await suggestCorrection({ title, artist });
  const result = db.prepare(`INSERT INTO songs (slug,title,artist,language,status,generation_status,original_title,original_artist,suggested_title,suggested_artist)
    VALUES (?,?,?,?, 'needs_review','needs_review',?,?,?,?)`).run(`${Date.now()}-draft`, title, artist, req.body.language || null, title, artist, suggestion.title, suggestion.artist);
  const job = db.prepare("INSERT INTO jobs (song_id,type,status) VALUES (?,'metadata','needs_review')").run(result.lastInsertRowid);
  res.status(202).json(ok({ jobId: job.lastInsertRowid, song: getById(result.lastInsertRowid), suggestion }));
});
app.get("/api/admin/jobs", requireAdmin, (_req, res) => res.json(ok(db.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all())));
app.get("/api/admin/jobs/:id", requireAdmin, (req, res) => { const job = db.prepare("SELECT * FROM jobs WHERE id=?").get(req.params.id); return job ? res.json(ok(job)) : res.status(404).json(fail("NOT_FOUND", "Job not found.")); });
app.post("/api/admin/jobs/:id/retry", requireAdmin, (req, res) => { db.prepare("UPDATE jobs SET status='needs_review',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id); res.json(ok({ status: "needs_review" })); });

const clientDir = path.resolve(__dirname, config.production && path.basename(path.dirname(__dirname)) !== "server" ? "../dist/client" : "../client");
app.use(express.static(clientDir, { maxAge: config.production ? "1h" : 0 }));
app.get("*splat", (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json(fail("SERVER_ERROR", "Something went wrong. Please try again.")); });

if (process.env.NODE_ENV !== "test") app.listen(config.port, () => console.log(`Songbook ready at http://localhost:${config.port}`));
