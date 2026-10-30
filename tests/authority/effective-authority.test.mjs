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

test("effective-authority completeness follows the exact five-dimension rule", () => {
  const completePayload = events("tightly-bounded")[2].payload;
  const partialPayload = events("incomplete")[2].payload;
  const allUnknown = {
    ...completePayload,
    observations: completePayload.observations.map((observation) => ({
      dimension: observation.dimension,
      knowledge: "unknown",
      source: observation.source,
    })),
  };
  assert.equal(calculateEffectiveAuthority(completePayload).completeness, "complete");
  assert.equal(calculateEffectiveAuthority(partialPayload).completeness, "partial");
  assert.equal(calculateEffectiveAuthority(allUnknown).completeness, "unknown");
  assert.equal(calculateEffectiveAuthority(partialPayload).capabilities.some(({ kind }) => kind === "network"), false);
  assert.equal(calculateEffectiveAuthority(partialPayload).capabilities.some(({ resource }) => resource === "elevated"), false);
  assert.deepEqual(calculateEffectiveAuthority(events("unexpectedly-elevated")[2].payload).capabilities.map(({ resource }) => resource), [
    "/workspace", "/home/user", "shell", "elevated", "internet",
  ]);
  const twoMounts = new ScenarioOpenClawAdapter().toEvidenceEvents({
    ...fixture("tightly-bounded"),
    snapshot: {
      ...fixture("tightly-bounded").snapshot,
      mounts: [{ path: "/z", access: "read-only" }, { path: "/a", access: "read-only" }],
    },
  })[2].payload;
  assert.deepEqual(calculateEffectiveAuthority(twoMounts).capabilities.slice(1, 3).map(({ resource }) => resource), ["/a", "/z"]);
  const duplicateMount = { ...twoMounts, observations: [...twoMounts.observations, twoMounts.observations[1]] };
  assert.equal(calculateEffectiveAuthority(duplicateMount).capabilities.length, calculateEffectiveAuthority(twoMounts).capabilities.length + 1);
});

