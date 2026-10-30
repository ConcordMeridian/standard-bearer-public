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

test("event schema accepts canonical Scenario 06 events and enforces envelope identity", () => {
  const [valid] = events();
  validateEvidenceEvent(valid);
  const invalidCases = [
    null,
    { ...valid, schemaVersion: "0.1" },
    { ...valid, eventId: "" },
    { ...valid, type: "openclaw.permission" },
    { ...valid, observedAt: "" },
    { ...valid, sequence: 1 },
    { ...valid, sequence: 0n },
    { ...valid, agentId: "" },
    { ...valid, deploymentId: "" },
    { ...valid, collectorId: "" },
    { ...valid, source: "" },
    { ...valid, evidenceMode: "witness-ish" },
    { ...valid, configVersions: { version: 1 } },
    { ...valid, correlationId: "" },
    { ...valid, causationId: "" },
    { ...valid, redactions: "secret" },
    { ...valid, redactions: [""] },
    { ...valid, payloadHash: "" },
    { ...valid, payloadHash: "sha256:wrong" },
  ];
  for (const invalid of invalidCases) assert.throws(() => validateEvidenceEvent(invalid), InvalidEvidenceEventError);
  validateEvidenceEvent({ ...valid, redactions: ["payload.secret"] });
});

test("canonical serialization is insertion-order independent and SHA-256 deterministic", () => {
  const left = { z: 1, nested: { b: true, a: ["x", null] }, omitted: undefined };
  const right = { nested: { a: ["x", null], b: true }, z: 1 };
  assert.equal(canonicalSerialize(left), canonicalSerialize(right));
  assert.equal(payloadHash(left), payloadHash(right));
  assert.match(payloadHash(left), /^sha256:[0-9a-f]{64}$/);
  assert.equal(canonicalSerialize(false), "false");
  assert.equal(canonicalSerialize("x"), '"x"');
  assert.throws(() => canonicalSerialize(Number.NaN), /finite/);
  assert.throws(() => canonicalSerialize(undefined), /Unsupported/);
});

