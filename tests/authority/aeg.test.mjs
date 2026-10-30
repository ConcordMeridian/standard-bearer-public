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

test("AEG implements only none, high, and conservative unknown Scenario 06 semantics", () => {
  const declared = fixture("tightly-bounded").declaredAuthority;
  const workspace = declared.capabilities[0];
  const material = [
    { id: "filesystem:home", kind: "filesystem", resource: "/home/user", access: ["read"] },
    { id: "execution:shell", kind: "execution", resource: "shell", access: ["execute"] },
    { id: "execution:elevated", kind: "execution", resource: "elevated", access: ["execute"] },
    { id: "network:internet", kind: "network", resource: "internet", access: ["connect"], constraints: { unrestricted: true } },
  ];
  assert.equal(calculateAuthorityExposureGap(declared, { capabilities: [workspace], completeness: "complete" }).status, "none");
  for (const capability of material) {
    assert.equal(calculateAuthorityExposureGap(declared, { capabilities: [workspace, capability], completeness: "complete" }).status, "high");
  }
  assert.equal(calculateAuthorityExposureGap(declared, { capabilities: material, completeness: "partial" }).status, "unknown");
  assert.equal(calculateAuthorityExposureGap(declared, { capabilities: [], completeness: "unknown" }).status, "unknown");
  const constrained = { id: "network:x", kind: "network", resource: "x", access: ["connect"], constraints: { z: true, a: "x" } };
  const reordered = { ...constrained, constraints: { a: "x", z: true } };
  assert.equal(calculateAuthorityExposureGap({ capabilities: [constrained] }, { capabilities: [reordered], completeness: "complete" }).status, "none");
});

