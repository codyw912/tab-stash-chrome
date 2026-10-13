// Chrome only allows [A-Za-z0-9_] in message keys, and refuses to load the
// extension otherwise. Rename plural keys like "tab.one" to "tab__one", which
// $ts() falls back to when the dotted form isn't found.

import {readdirSync, readFileSync, writeFileSync} from "fs";
import {join} from "path";

const dir = process.argv[2];
if (!dir) throw new Error(`usage: node patch-locales-for-chrome.js <_locales>`);

for (const locale of readdirSync(dir)) {
  const file = join(dir, locale, "messages.json");
  const messages = JSON.parse(readFileSync(file, "utf8"));
  const patched = {};
  for (const [key, value] of Object.entries(messages)) {
    const newKey = key.replace(/\./g, "__");
    if (!/^[A-Za-z0-9_]+$/.test(newKey)) {
      throw new Error(`${file}: key "${key}" is not valid in Chrome`);
    }
    if (newKey in patched) {
      throw new Error(`${file}: key "${key}" collides with "${newKey}"`);
    }
    patched[newKey] = value;
  }
  writeFileSync(file, JSON.stringify(patched, undefined, 2) + "\n");
}
