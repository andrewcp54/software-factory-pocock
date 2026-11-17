// Fails when a module under app/modules/ has no test file in its tests/
// folder. A module is a deep module: a lot of behaviour behind a small
// interface, and the tests are what pin that interface down.
// Usage: node scripts/check-module-tests.js

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MODULES = "app/modules";
const TEST_FILE = /\.test\.tsx?$/;

const untested = readdirSync(MODULES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => {
    const tests = join(MODULES, name, "tests");
    return (
      !existsSync(tests) ||
      !readdirSync(tests, { recursive: true }).some((file) =>
        TEST_FILE.test(String(file))
      )
    );
  });

if (untested.length > 0) {
  console.error("These modules have no tests:\n");
  for (const name of untested) {
    console.error(`  ${MODULES}/${name}/tests/`);
  }
  console.error(`
Add a <name>.test.ts in each module's tests/ folder that calls the module
through its entry points. See app/modules/README.md.
`);
  process.exit(1);
}
