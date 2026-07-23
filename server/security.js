import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { db } from "./db.js";
import { config } from "./config.js";

const DAY = 24 * 60 * 60 * 1000;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

export async function login(username, password) {
  if (!config.adminPasswordHash || username !== config.adminUsername) return null;
  if (!(await bcrypt.compare(password, config.adminPasswordHash))) return null;
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + DAY).toISOString();
  db.prepare("INSERT INTO sessions (token_hash, expires_at) VALUES (?,?)").run(hash(token), expires);
  return { token, expires };
}

export function requireAdmin(req, res, next) {
  const token = req.cookies.songbook_session;
  const row = token && db.prepare("SELECT expires_at FROM sessions WHERE token_hash=? AND expires_at > ?").get(hash(token), new Date().toISOString());
  if (!row) return res.status(401).json(fail("UNAUTHORISED", "Administrator sign-in required."));
  next();
}

export function session(req) {
  const token = req.cookies.songbook_session;
  if (!token) return false;
  return Boolean(db.prepare("SELECT 1 FROM sessions WHERE token_hash=? AND expires_at > ?").get(hash(token), new Date().toISOString()));
}

export function logout(token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(token));
}

export const ok = (data) => ({ success: true, data, error: null });
export const fail = (code, message, fields) => ({ success: false, data: null, error: { code, message, ...(fields ? { fields } : {}) } });
