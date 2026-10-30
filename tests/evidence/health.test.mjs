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

test("sequence gaps create explicit degraded health and prevent complete-looking authority", async () => {
  const batch = events();
  const gappedPermission = changedEvent(batch[2], { sequence: 4n, eventId: `${batch[2].collectorId}:4:permission.snapshot` });
  const laterHealth = changedEvent(batch[3], {
    sequence: 5n,
    eventId: `${batch[3].collectorId}:5:observer.health.changed`,
    causationId: gappedPermission.eventId,
  });
  const journal = await journalFor([batch[0], batch[1], gappedPermission, laterHealth]);
  const replay = await collect(journal.stream());
  const gapHealth = replay.find(({ source }) => source === "standard-bearer.evidence-journal");
  assert.equal(gapHealth.type, "observer.health.changed");
  assert.equal(gapHealth.payload.status, "degraded");
  const map = project(replay);
  assert.equal(map.sourceHealth.status, "degraded");
  assert.equal(map.effectiveAuthority.completeness, "partial");
  assert.equal(map.exposureGap.status, "unknown");
  assert.equal((await journal.verify()).valid, false);
});

