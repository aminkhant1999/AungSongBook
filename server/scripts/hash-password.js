import bcrypt from "bcrypt";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const rl = readline.createInterface({ input: stdin, output: stdout });
const password = await rl.question("New administrator password: ");
rl.close();
if (password.length < 12) throw new Error("Use at least 12 characters.");
console.log(await bcrypt.hash(password, 12));
