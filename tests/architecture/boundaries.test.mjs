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

test("architecture dependency and replay-path boundaries are automated", () => {
  for (const directory of ["packages/protocol/src", "packages/authority/src", "packages/evidence/src"]) {
    const files = execFileSync("find", [directory, "-name", "*.ts", "-type", "f"], { encoding: "utf8" }).trim().split("\n");
    for (const file of files) assert.doesNotMatch(readFileSync(file, "utf8"), /sensor-openclaw|OpenClaw/);
  }
  const adapterSource = readFileSync("packages/sensor-openclaw/src/adapter.ts", "utf8");
  assert.doesNotMatch(adapterSource, /calculateAuthorityExposureGap|AgentAuthorityMap|AuthorityProjector/);
  const cliSource = readFileSync("packages/cli/src/commands.ts", "utf8");
  assert.match(cliSource, /toEvidenceEvents/);
  assert.match(cliSource, /journal\.append/);
  assert.match(cliSource, /journal\.stream/);
  assert.match(cliSource, /projector\.apply/);
  assert.doesNotMatch(cliSource, /calculateEffectiveAuthority|calculateAuthorityExposureGap/);
});

