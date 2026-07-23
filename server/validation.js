import { z } from "zod";
import sanitizeHtml from "sanitize-html";

const clean = (value) => typeof value === "string" ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim() : value;
const optionalText = z.preprocess(v => clean(v) || null, z.string().max(200).nullable());
export const songSchema = z.object({
  title: z.preprocess(clean, z.string().min(1, "Required").max(160)),
  artist: z.preprocess(clean, z.string().min(1, "Required").max(160)),
  language: optionalText,
  key: optionalText,
  bpm: z.preprocess(v => v === "" || v == null ? null : Number(v), z.number().int().min(20).max(300).nullable()),
  timeSignature: optionalText,
  capo: z.preprocess(v => v === "" || v == null ? null : Number(v), z.number().int().min(0).max(12).nullable()),
  genre: optionalText,
  vibe: optionalText,
  vibeIntensity: z.preprocess(v => Number(v || 5), z.number().int().min(1).max(10)),
  lyricsChordData: z.any().default({ sections: [] }),
  plainLyrics: z.preprocess(v => clean(v) || "", z.string().max(200000)),
  sourceName: optionalText,
  sourceUrl: z.preprocess(v => clean(v) || null, z.url().nullable()),
  sourceLicence: optionalText,
  licensingConfirmed: z.boolean().default(false),
  status: z.enum(["draft", "needs_review", "published"]).default("draft")
});

export function slugify(title, artist) {
  return `${title}-${artist}`.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 180) || `song-${Date.now()}`;
}

export function parseSong(input) {
  const result = songSchema.safeParse(input);
  if (result.success) return { data: result.data };
  const fields = {};
  for (const issue of result.error.issues) fields[issue.path[0] || "form"] = issue.message;
  return { error: fields };
}
