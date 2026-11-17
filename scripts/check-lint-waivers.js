// Fails when a change turns a lint rule off for a file it was not already off
// for: a new file added to an override's `files`, or a new `"off"` rule.
// Usage: node scripts/check-lint-waivers.js
//
// The waivers in .oxlintrc.json are a list of debts to pay down, one entry
// per file that was already too big when the rules arrived. Adding to that
// list exempts new code instead of fixing it. When a rule fails on your code,
// change the code: split the function, extract the component.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONFIG = ".oxlintrc.json";

/** Removes // and /* *\/ comments, leaving anything inside a string alone. */
const stripComments = (text) =>
  text.replace(
    /("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (match, string) => string ?? ""
  );

const parse = (text) =>
  JSON.parse(stripComments(text).replace(/,(\s*[}\]])/g, "$1"));

const isOff = (setting) =>
  setting === "off" ||
  setting === 0 ||
  (Array.isArray(setting) && isOff(setting[0]));

/** Every `file  rule` pair the config turns off. `*` stands for every file. */
const waivers = (config) => {
  const pairs = new Set();
  for (const [rule, setting] of Object.entries(config.rules ?? {})) {
    if (isOff(setting)) pairs.add(`*  ${rule}`);
  }
  for (const override of config.overrides ?? []) {
    for (const [rule, setting] of Object.entries(override.rules ?? {})) {
      if (!isOff(setting)) continue;
      for (const file of override.files ?? []) pairs.add(`${file}  ${rule}`);
    }
  }
  return pairs;
};

const headText = (() => {
  try {
    return execFileSync("git", ["show", `HEAD:${CONFIG}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
})();

if (headText !== null) {
  const before = waivers(parse(headText));
  const added = [...waivers(parse(readFileSync(CONFIG, "utf8")))].filter(
    (pair) => !before.has(pair)
  );

  if (added.length > 0) {
    console.error(`${CONFIG} turns off rules it did not turn off before:\n`);
    for (const pair of added) console.error(`  ${pair.replace("  ", ": ")}`);
    console.error(`
Remove these entries and change the code so it passes the rule: split the long
function, extract the component, pass an object instead of many parameters.
The existing entries are debts on old files, not a pattern for new ones.
`);
    process.exit(1);
  }
}
