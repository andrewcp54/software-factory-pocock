// Fails when a file is too big for an agent to read and edit in one go.
// Tokens are estimated as bytes / 4, which is close enough for code.
// Usage: node scripts/check-file-tokens.js <file>...
//
// A ratchet, not a wall. A new file must be under the limit. A file that was
// already over the limit in HEAD may be edited, as long as it does not grow:
// otherwise any ticket that touches one of the oversized files on main has to
// split the whole file first, and a one-line fix turns into a refactor.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_TOKENS = 5000;
const BYTES_PER_TOKEN = 4;

// Generated files that nobody edits by hand, and workflow files, which
// GitHub reads as one file each and which cannot be split.
const IGNORED = [
  /(^|\/)package-lock\.json$/,
  /^drizzle\//,
  /^\.github\/workflows\/[^/]+\.yml$/,
];

const isBinary = (contents) => contents.subarray(0, 8000).includes(0);

const toTokens = (bytes) => Math.ceil(bytes / BYTES_PER_TOKEN);

/** The file's size in HEAD, in tokens, or null when HEAD does not have it. */
const tokensInHead = (file) => {
  try {
    const bytes = execFileSync("git", ["cat-file", "-s", `HEAD:${file}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return toTokens(Number(bytes.trim()));
  } catch {
    return null;
  }
};

const failures = process.argv
  .slice(2)
  .map((file) => file.replaceAll("\\", "/").replace(`${process.cwd()}/`, ""))
  .filter((file) => !IGNORED.some((pattern) => pattern.test(file)))
  .map((file) => ({ file, contents: readFileSync(file) }))
  .filter(({ contents }) => !isBinary(contents))
  .map(({ file, contents }) => ({ file, tokens: toTokens(contents.length) }))
  .filter(({ tokens }) => tokens > MAX_TOKENS)
  .map((entry) => ({ ...entry, before: tokensInHead(entry.file) }))
  .filter(({ tokens, before }) => before === null || tokens > before);

const grown = failures.filter(({ before }) => before !== null);
const created = failures.filter(({ before }) => before === null);

if (created.length > 0) {
  console.error(`These new files are over ${MAX_TOKENS} tokens (bytes / 4):\n`);
  for (const { file, tokens } of created) {
    console.error(`  ${file}: ~${tokens} tokens`);
  }
  console.error(`
Split each one before you commit. Do not delete code or squash it onto fewer
lines to get under the limit.

- Find the seams: groups of functions, components, or tests that change
  together and share little with the rest of the file.
- Routes (app/routes/*): keep the loader, action, and page component in the
  route file. Business logic goes in a module in app/modules/, sub-components
  in their own files in app/components/.
- Modules (app/modules/<name>/): split into more files under lib/. Keep the
  entry points small, and add no barrel file. See app/modules/README.md.
- Tests: one file per behaviour under test (<name>.refunds.test.ts), with
  shared fixtures in a fixtures file in the same tests/ folder.
- Scripts and seed data: move large data literals into their own files.
`);
}

if (grown.length > 0) {
  console.error(
    `These files were already over ${MAX_TOKENS} tokens, and this change makes them bigger:\n`
  );
  for (const { file, tokens, before } of grown) {
    console.error(`  ${file}: ~${before} → ~${tokens} tokens`);
  }
  console.error(`
An oversized file may be edited, but it must not grow. Move the part you are
changing (the component, the helper) into its own file and import it, so the
file ends up the same size or smaller. Leave the rest of the file where it is:
splitting all of it is a separate ticket, not part of yours.
`);
}

if (failures.length > 0) {
  console.error("When you are done, run `npm run check` and commit again.");
  process.exit(1);
}
