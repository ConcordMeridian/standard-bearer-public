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

test("projector derives declaration, effective authority, and health without mutating history", () => {
  const batch = events("unexpectedly-elevated");
  const before = batch.map(serializeEvidenceEvent);
  const map = project(batch, "coder", "local-dev-elevated");
  assert.deepEqual(map.declaredAuthority, fixture("unexpectedly-elevated").declaredAuthority);
  assert.equal(map.sourceHealth.status, "healthy");
  assert.deepEqual(map.exposureGap.differences.map(({ capability }) => capability.resource), [
    "/home/user", "shell", "elevated", "internet",
  ]);
  assert.deepEqual(batch.map(serializeEvidenceEvent), before);
});

test("projector transition is pure, duplicate-idempotent, rebuildable, and byte deterministic", () => {
  const batch = events();
  const first = batch.reduce(applyAuthorityEvent, emptyAuthorityProjection);
  const duplicate = [...batch, ...batch].reduce(applyAuthorityEvent, emptyAuthorityProjection);
  assert.equal(serializeAuthorityMap(authorityMapFromProjection(first)), serializeAuthorityMap(authorityMapFromProjection(duplicate)));
  const projector = new AuthorityProjector();
  const rebuilt = projector.rebuild(batch, "coder", "local-dev-bounded");
  assert.equal(serializeAuthorityMap(rebuilt), serializeAuthorityMap(project(batch)));
  assert.equal(serializeAuthorityMap(project(batch)), serializeAuthorityMap(project(batch)));
});

test("projector isolates two deployments of the same agent and handles environment events", () => {
  const first = events();
  const secondFixture = structuredClone(fixture("tightly-bounded"));
  secondFixture.snapshot.deploymentId = "second-deployment";
  secondFixture.snapshot.environment = "staging";
  const second = new ScenarioOpenClawAdapter().toEvidenceEvents(secondFixture);
  const projector = new AuthorityProjector();
  for (const event of [...first, ...second]) projector.apply(event);
  assert.equal(projector.map("coder", "local-dev-bounded").deployment.environment, "development");
  assert.equal(projector.map("coder", "second-deployment").deployment.environment, "staging");
  const payload = { environment: "production" };
  const environmentEvent = {
    ...second[3],
    eventId: `${second[3].collectorId}:5:environment.changed`,
    type: "environment.changed",
    sequence: 5n,
    causationId: second[3].eventId,
    payload,
    payloadHash: payloadHash(payload),
  };
  validateEvidenceEvent(environmentEvent);
  projector.apply(environmentEvent);
  assert.equal(projector.map("coder", "second-deployment").deployment.environment, "production");
});

test("projector emits deterministic explicit errors for invalid projection state", () => {
  const batch = events();
  assert.throws(() => new AuthorityProjector().map("coder", "missing"), ProjectionNotFoundError);
  assert.throws(() => authorityMapFromProjection(emptyAuthorityProjection), /discovered/);
  const discovered = applyAuthorityEvent(emptyAuthorityProjection, batch[0]);
  assert.throws(() => authorityMapFromProjection(discovered), /declared/);
  const declared = applyAuthorityEvent(discovered, batch[1]);
  assert.throws(() => authorityMapFromProjection(declared), /permission/);
  const permission = applyAuthorityEvent(declared, batch[2]);
  assert.throws(() => authorityMapFromProjection(permission), /observer health/);
  const completeState = batch.reduce(applyAuthorityEvent, emptyAuthorityProjection);
  assert.throws(() => authorityMapFromProjection({ ...completeState, observedAt: undefined }), /observation time/);
  assert.throws(() => applyAuthorityEvent(permission, changedEvent(batch[3], { deploymentId: "other", eventId: "other" })), /deployment mismatch/);
  assert.throws(() => applyAuthorityEvent(permission, changedEvent(batch[3], { agentId: "other", eventId: "other" })), /agent mismatch/);
  assert.throws(() => applyAuthorityEvent(emptyAuthorityProjection, {
    ...batch[3], type: "environment.changed", payload: {}, payloadHash: payloadHash({}),
  }), /preceded agent discovery/);
  const withoutEnvironment = {
    ...batch[3],
    eventId: `${batch[3].collectorId}:5:environment.changed`,
    type: "environment.changed",
    sequence: 5n,
    payload: {},
    payloadHash: payloadHash({}),
  };
  const cleared = applyAuthorityEvent(completeState, withoutEnvironment);
  assert.equal(cleared.deployment.environment, undefined);
});

test("projector health merging is conservative for unknown and degraded states", () => {
  const base = structuredClone(fixture("tightly-bounded"));
  base.snapshot.workspaceAccess = undefined;
  base.snapshot.mounts = undefined;
  base.snapshot.sandbox = undefined;
  base.snapshot.toolPolicy = undefined;
  base.snapshot.executionTarget = undefined;
  base.snapshot.elevatedExecution = undefined;
  base.snapshot.network = undefined;
  const unknownEvents = new ScenarioOpenClawAdapter().toEvidenceEvents(base);
  const unknownState = unknownEvents.reduce(applyAuthorityEvent, emptyAuthorityProjection);
  assert.equal(authorityMapFromProjection(unknownState).effectiveAuthority.completeness, "unknown");
  const healthyPayload = events()[3].payload;
  const healthyAfterUnknown = {
    ...unknownEvents[3],
    eventId: `${unknownEvents[3].collectorId}:5:observer.health.changed`,
    sequence: 5n,
    payload: healthyPayload,
    payloadHash: payloadHash(healthyPayload),
  };
  assert.equal(applyAuthorityEvent(unknownState, healthyAfterUnknown).healthStatus, "unknown");

  const healthyState = events().reduce(applyAuthorityEvent, emptyAuthorityProjection);
  const degradedPayload = { status: "degraded", dimensions: [], issues: ["degraded test"] };
  const degraded = {
    ...events()[3],
    eventId: `${events()[3].collectorId}:5:observer.health.changed`,
    sequence: 5n,
    payload: degradedPayload,
    payloadHash: payloadHash(degradedPayload),
  };
  assert.equal(applyAuthorityEvent(healthyState, degraded).healthStatus, "degraded");
});


test("drift remains explicitly out of scope", () => {
  assert.throws(calculateAuthorityDrift, /NotImplemented/);
});

