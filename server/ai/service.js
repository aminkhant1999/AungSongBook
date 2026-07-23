import { config } from "../config.js";

const known = new Map([
  ["ocean eye|billy eillish", { title: "Ocean Eyes", artist: "Billie Eilish" }],
  ["kiss me|sixpence none the richer", { title: "Kiss Me", artist: "Sixpence None the Richer" }]
]);

export async function suggestCorrection({ title, artist }) {
  const deterministic = known.get(`${title.toLowerCase()}|${artist.toLowerCase()}`);
  if (deterministic) return { ...deterministic, provider: "deterministic", notice: "Review this suggestion before accepting it." };
  if (!config.openAiKey) return { title, artist, provider: "manual", notice: "No AI service is configured. Continue with manual entry." };
  return { title, artist, provider: "manual", notice: "AI metadata integration is isolated but no licensed content provider is configured. Review manually." };
}
