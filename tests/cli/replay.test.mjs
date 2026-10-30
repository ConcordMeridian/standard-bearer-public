import {
  assert, execFileSync, spawnSync, readFileSync, test,
  AuthorityProjector, ProjectionNotFoundError, applyAuthorityEvent,
  authorityMapFromProjection, calculateAuthorityDrift,
  calculateAuthorityExposureGap, calculateEffectiveAuthority,
  emptyAuthorityProjection, serializeAuthorityMap, formatAuthorityMap,
  projectFixture, replayScenario06, runCommand, InMemoryEvidenceJournal,
  OutOfOrderEventError, serializeEvidenceEvent, InvalidEvidenceEventError,
  canonicalSerialize, payloadHash, validateEvidenceEvent, InvalidFixtureError,
  ScenarioOpenClawAdapter, parseOpenClawScenarioFixture, fixtureNames,
  fixture, events, collect, changedEvent, journalFor, project,
} from "../support.mjs";

test("CLI fixture selection, all-fixture ordering, rendering, and errors are deterministic", async () => {
  const all = await runCommand(["replay", "06-sandbox-mismatch"]);
  const repeated = await runCommand(["replay", "06-sandbox-mismatch"]);
  assert.equal(all, repeated);
  assert.ok(all.indexOf("local-dev-bounded") < all.indexOf("local-dev-elevated"));
  assert.ok(all.indexOf("local-dev-elevated") < all.indexOf("local-dev-incomplete"));
  for (const name of fixtureNames) {
    const output = await runCommand(["replay", "06-sandbox-mismatch", "--fixture", name]);
    const projected = await projectFixture(fixture(name));
    assert.equal(output, formatAuthorityMap(projected.map));
    const golden = readFileSync(`scenarios/06-sandbox-mismatch/expected/${name}.txt`, "utf8").trimEnd();
    assert.equal(output, golden);
  }
  const elevated = await runCommand(["replay", "06-sandbox-mismatch", "--fixture", "unexpectedly-elevated"]);
  assert.match(elevated, /\+ \/home\/user READ\n  \+ shell execution\n  \+ elevated execution\n  \+ unrestricted network/);
  const incomplete = await runCommand(["replay", "06-sandbox-mismatch", "--fixture", "incomplete"]);
  assert.match(incomplete, /Authority Exposure Gap\n  UNKNOWN/);
  assert.match(incomplete, /Observation Completeness\n  PARTIAL/);
  await assert.rejects(runCommand(["replay", "07-cross-context"]), /Unsupported scenario/);
  await assert.rejects(runCommand([]), /Unsupported scenario/);
  await assert.rejects(runCommand(["bad"]), /Unsupported scenario/);
  await assert.rejects(runCommand(["replay", "06-sandbox-mismatch", "--fixture"]), /Unsupported fixture/);
  await assert.rejects(runCommand(["replay", "06-sandbox-mismatch", "--fixture", "bad"]), /Unsupported fixture/);
  await assert.rejects(runCommand(["replay", "06-sandbox-mismatch", "--bad"]), /Unsupported fixture/);
  await assert.rejects(runCommand(["replay", "06-sandbox-mismatch", "--fixture", "incomplete", "extra"]), /Unsupported fixture/);
  const emptyMap = {
    ...(await projectFixture(fixture("tightly-bounded"))).map,
    deployment: { agent: { provider: "test", id: "empty" }, deploymentId: "empty" },
    declaredAuthority: { capabilities: [] },
    effectiveAuthority: { capabilities: [], completeness: "complete" },
    exposureGap: { status: "none", differences: [] },
    sourceHealth: { status: "healthy", issues: [] },
  };
  assert.match(formatAuthorityMap(emptyMap), /Deployment\n  empty\n[\s\S]*Declared Authority\n  NONE/);
});

test("CLI executable exits deterministically for success, invalid fixture, and no command", () => {
  const success = execFileSync(process.execPath, ["packages/cli/dist/index.js", "replay", "06-sandbox-mismatch", "--fixture", "tightly-bounded"], { encoding: "utf8" });
  assert.match(success, /Authority Exposure Gap\n  NONE/);
  const failure = spawnSync(process.execPath, ["packages/cli/dist/index.js", "replay", "06-sandbox-mismatch", "--fixture", "bad"], { encoding: "utf8" });
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /UnsupportedFixtureError/);
  const empty = spawnSync(process.execPath, ["packages/cli/dist/index.js"], { encoding: "utf8" });
  assert.equal(empty.status, 0);
  assert.equal(empty.stdout, "");
});

