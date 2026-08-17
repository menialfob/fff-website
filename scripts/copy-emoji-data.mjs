// Copies the emojibase datasets the emoji picker needs into public/emoji/,
// so the picker loads them same-origin with zero third-party requests.
// Runs via the predev/prebuild npm hooks; output is gitignored.
import { mkdir, copyFile } from "fs/promises";
import { createRequire } from "module";
import path from "path";

const require = createRequire(import.meta.url);
const locales = ["da", "en"];
const files = ["data.json", "messages.json"];

for (const locale of locales) {
  const dir = path.join("public", "emoji", locale);
  await mkdir(dir, { recursive: true });
  for (const file of files) {
    const src = require.resolve(`emojibase-data/${locale}/${file}`);
    await copyFile(src, path.join(dir, file));
  }
}
console.log(`emoji data copied for: ${locales.join(", ")}`);
