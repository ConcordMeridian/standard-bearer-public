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

test("canonical fixtures produce exact NONE, HIGH, UNKNOWN results and four events", async () => {
  const [bounded, elevated, incomplete] = await replayScenario06();
  assert.deepEqual([bounded.map.effectiveAuthority.completeness, bounded.map.exposureGap.status, bounded.eventCount], ["complete", "none", 4]);
  assert.deepEqual([elevated.map.effectiveAuthority.completeness, elevated.map.exposureGap.status, elevated.eventCount], ["complete", "high", 4]);
  assert.deepEqual(elevated.map.exposureGap.differences.map(({ capability }) => capability.resource), ["/home/user", "shell", "elevated", "internet"]);
  assert.deepEqual([incomplete.map.effectiveAuthority.completeness, incomplete.map.exposureGap.status, incomplete.eventCount], ["partial", "unknown", 4]);
  assert.deepEqual(incomplete.map.authorityObservations.filter(({ knowledge }) => knowledge === "unknown").map(({ dimension }) => dimension), [
    "elevated-execution", "network",
  ]);
});

test("every fixture replays, rebuilds, and tolerates duplicate projector delivery identically", async () => {
  for (const name of fixtureNames) {
    const fixtureValue = fixture(name);
    const batch = new ScenarioOpenClawAdapter().toEvidenceEvents(fixtureValue);
    const journal = await journalFor(batch);
    const history = await collect(journal.stream());
    const original = project(history, fixtureValue.snapshot.agentId, fixtureValue.snapshot.deploymentId);
    const rebuilt = new AuthorityProjector().rebuild(history, fixtureValue.snapshot.agentId, fixtureValue.snapshot.deploymentId);
    const duplicated = project([...history, ...history], fixtureValue.snapshot.agentId, fixtureValue.snapshot.deploymentId);
    assert.equal(serializeAuthorityMap(original), serializeAuthorityMap(rebuilt));
    assert.equal(serializeAuthorityMap(original), serializeAuthorityMap(duplicated));
  }
});

