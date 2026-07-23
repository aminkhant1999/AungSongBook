import fs from "node:fs";
import path from "node:path";

const source = path.resolve("client");
const target = path.resolve("dist/client");
fs.rmSync(path.resolve("dist"), { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
for (const required of ["index.html", "css/styles.css", "js/main.js"]) {
  if (!fs.existsSync(path.join(target, required))) throw new Error(`Missing build asset: ${required}`);
}
console.log("Production client built in dist/client.");
