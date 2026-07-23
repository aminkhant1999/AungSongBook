import "dotenv/config";
import path from "node:path";

const production = process.env.NODE_ENV === "production";
const test = process.env.NODE_ENV === "test";
export const config = {
  production,
  test,
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || (test ? ":memory:" : path.resolve("data/songbook.db")),
  clientUrl: process.env.CLIENT_URL || "http://localhost:3000",
  adminUsername: process.env.ADMIN_USERNAME || "AMK",
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",
  sessionSecret: process.env.SESSION_SECRET || (test ? "test-only-session-secret-not-for-production" : ""),
  openAiKey: process.env.OPENAI_API_KEY || ""
};

export function validateConfig() {
  if (production && (!config.adminPasswordHash || config.sessionSecret.length < 32)) {
    throw new Error("Production requires ADMIN_PASSWORD_HASH and a SESSION_SECRET of at least 32 characters.");
  }
  if (!production && (!config.adminPasswordHash || !config.sessionSecret)) {
    console.warn("Admin login is disabled until ADMIN_PASSWORD_HASH and SESSION_SECRET are configured.");
  }
}
