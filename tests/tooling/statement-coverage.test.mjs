import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { countAt, executableStatements, measureStatementCoverage } from "../../scripts/statement-coverage.mjs";

test("statement coverage is measured directly and catches statements that line coverage reports as covered", () => {
  const directory = mkdtempSync(join(tmpdir(), "sb-statement-coverage-"));
  try {
    const sample = join(directory, "sample.mjs");
    const unloaded = join(directory, "unloaded.mjs");
    writeFileSync(sample, "const f = (c) => { if (c) { return 1; } return 2; };\nf(true);\nexport { f };\n");
    writeFileSync(unloaded, "export const value = 1;\n");
    writeFileSync(join(directory, "sample.test.mjs"), 'import test from "node:test";\nimport "./sample.mjs";\ntest("loads", () => {});\n');
    const { NODE_TEST_CONTEXT: _parentRunner, ...inherited } = process.env;
    const env = { ...inherited, NODE_V8_COVERAGE: join(directory, "v8") };
    const run = spawnSync(process.execPath, ["--experimental-test-coverage", "--test", "sample.test.mjs"], { cwd: directory, encoding: "utf8", env });
    assert.equal(run.status, 0);
    assert.match(run.stdout, /sample\.mjs\s+\|\s+100\.00 \|/, "Node reports 100% line coverage for the sample");
    const [measured, missing] = measureStatementCoverage(join(directory, "v8"), [sample, unloaded]);
    assert.deepEqual([measured.loaded, measured.total, measured.covered, measured.uncoveredLines], [true, 6, 5, [1]]);
    assert.deepEqual([missing.loaded, missing.covered, missing.total], [false, 0, 1]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("statement enumeration counts class field initializers and concise arrow bodies, and offsets outside ranges are uncovered", () => {
  const statements = executableStatements("class A { x = 1; y; }\nconst g = () => 3;\nconst h = () => { return 4; };\n", "s.js");
  assert.deepEqual(statements.map(({ line }) => line), [1, 1, 2, 2, 3, 3]);
  assert.equal(countAt([], 0), 0);
  assert.equal(countAt([{ ranges: [{ startOffset: 0, endOffset: 10, count: 1 }, { startOffset: 2, endOffset: 4, count: 0 }] }], 3), 0);
  assert.equal(countAt([{ ranges: [{ startOffset: 0, endOffset: 10, count: 1 }, { startOffset: 2, endOffset: 4, count: 0 }] }], 5), 1);
});
