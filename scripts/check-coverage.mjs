import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { measureStatementCoverage } from "./statement-coverage.mjs";

// Enforces 100% line, branch, function and statement coverage for EVERY file, not only the aggregate row.
// Line/branch/function percentages come from Node's test runner. Statements are measured separately from raw
// V8 block coverage (see statement-coverage.mjs) because Node 20 does not report statements. Every compiled
// module (packages/*/dist) must also be loaded by at least one test process, so an untested file cannot be omitted.
const root = process.cwd();
const v8Directory = mkdtempSync(join(tmpdir(), "standard-bearer-v8-"));
const testDirectories = ["tests"];
const result = spawnSync(process.execPath, ["--experimental-test-coverage", "--test", ...testDirectories], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, NODE_V8_COVERAGE: v8Directory },
});

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);

const failures = [];
try {
  if (result.status !== 0) throw new Error(`Test run failed with exit status ${String(result.status)}`);

  const lines = result.stdout.split("\n");
  const start = lines.findIndex((line) => line.includes("start of coverage report"));
  const end = lines.findIndex((line) => line.includes("end of coverage report"));
  const rows = lines.slice(start + 1, end)
    .map((line) => line.replace(/^# /, "").split("|").map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 4 && cells[0] !== "file" && !cells[0].startsWith("-"));
  if (start < 0 || end < 0 || !rows.some(([file]) => file === "all files")) failures.push("Coverage summary was not produced");
  for (const [file, line, branch, funcs] of rows) {
    const metrics = { line, branch, funcs };
    for (const [metric, value] of Object.entries(metrics)) {
      if (Number.parseFloat(value) !== 100) failures.push(`${file}: ${metric} coverage ${value}%`);
    }
  }

  // Compiled executable output: packages/*/dist.
  // Only directories: stray files such as macOS .DS_Store must not be scanned as packages.
  const compiled = (parent, output) => readdirSync(join(root, parent), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap(({ name }) => readdirSync(join(root, parent, name, output), { recursive: true })
      .filter((entry) => entry.endsWith(".js"))
      .map((entry) => join(root, parent, name, output, entry)));
  const distFiles = compiled("packages", "dist").sort();
  const statements = measureStatementCoverage(v8Directory, distFiles);
  console.log("# start of statement coverage report");
  console.log("# file | stmts % | covered / total | uncovered lines");
  let total = 0;
  let covered = 0;
  for (const entry of statements) {
    const file = relative(root, entry.file);
    const percent = entry.total === 0 ? 100 : (100 * entry.covered) / entry.total;
    total += entry.total;
    covered += entry.covered;
    console.log(`# ${file} | ${percent.toFixed(2)} | ${entry.covered.toString()} / ${entry.total.toString()} | ${entry.uncoveredLines.join(", ")}`);
    if (!entry.loaded) failures.push(`${file}: never loaded by any test process`);
    if (entry.covered !== entry.total) failures.push(`${file}: statement coverage ${percent.toFixed(2)}% (lines ${entry.uncoveredLines.join(", ")})`);
  }
  console.log(`# all package files | ${((100 * covered) / total).toFixed(2)} | ${covered.toString()} / ${total.toString()} |`);
  console.log("# end of statement coverage report");
} catch (error) {
  failures.push(String(error));
} finally {
  rmSync(v8Directory, { recursive: true, force: true });
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`Coverage threshold failed: ${failure}`);
  process.exit(1);
}
