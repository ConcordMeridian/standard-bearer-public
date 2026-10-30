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

test("adapter deterministically emits only canonical, self-attested Scenario 06 events", () => {
  for (const name of fixtureNames) {
    const adapter = new ScenarioOpenClawAdapter();
    const first = adapter.toEvidenceEvents(fixture(name));
    const second = adapter.toEvidenceEvents(fixture(name));
    assert.deepEqual(first, second);
    assert.deepEqual(first.map(({ type }) => type), [
      "agent.discovered", "authority.declared", "permission.snapshot", "observer.health.changed",
    ]);
    assert.deepEqual(first.map(({ sequence }) => sequence), [1n, 2n, 3n, 4n]);
    assert.ok(first.every(({ evidenceMode }) => evidenceMode === "self_attested"));
    assert.ok(first.every(({ type }) => !type.includes("openclaw")));
    assert.equal("effectiveAuthority" in first[2].payload, false);
    assert.equal("exposureGap" in first[2].payload, false);
    first.forEach(validateEvidenceEvent);
  }
});

test("adapter preserves control facts and covers explicit known and unknown variants", () => {
  const base = structuredClone(fixture("tightly-bounded"));
  const adapter = new ScenarioOpenClawAdapter();
  const variants = [
    { workspaceAccess: "read-only", mounts: [{ path: "/rw", access: "read-write" }], network: { mode: "none" } },
    { workspaceAccess: "none", mounts: [{ path: "/unknown" }], network: { mode: "restricted", destinations: ["api.example.test"] } },
    { workspaceAccess: "invalid", mounts: undefined, network: { mode: "invalid" } },
    { sandbox: undefined, toolPolicy: undefined, executionTarget: undefined, elevatedExecution: undefined, network: undefined },
  ];
  const payloads = variants.map((overrides, index) => adapter.toEvidenceEvents({
    ...base,
    snapshot: { ...base.snapshot, ...overrides, deploymentId: `variant-${index.toString()}` },
  })[2].payload);
  assert.deepEqual(payloads[0].observations.find(({ dimension }) => dimension === "workspace-filesystem").capability.access, ["read"]);
  assert.ok(payloads[0].observations.some(({ capability }) => capability?.resource === "/rw"));
  assert.ok(payloads[1].observations.some(({ capability }) => capability?.resource === "api.example.test"));
  assert.ok(payloads[1].observations.some(({ dimension, knowledge }) => dimension === "broader-filesystem" && knowledge === "unknown"));
  assert.ok(payloads[2].observations.some(({ dimension, knowledge }) => dimension === "workspace-filesystem" && knowledge === "unknown"));
  assert.ok(payloads[3].observations.filter(({ knowledge }) => knowledge === "unknown").length >= 3);
  assert.deepEqual(payloads[0].controlState.mounts, [{ path: "/rw", access: "read-write" }]);
  const allUnknown = adapter.toEvidenceEvents({
    ...base,
    snapshot: {
      agentId: "coder",
      deploymentId: "all-unknown",
      capturedAt: base.snapshot.capturedAt,
      sequenceStart: 1,
    },
  });
  assert.equal(allUnknown[3].payload.status, "unknown");
  assert.throws(() => adapter.toEvidenceEvents({ ...base, snapshot: { ...base.snapshot, sequenceStart: 0 } }), /sequenceStart/);
});

test("fixture validation accepts canonical fixtures and rejects malformed boundaries deterministically", () => {
  for (const name of fixtureNames) assert.equal(parseOpenClawScenarioFixture(structuredClone(fixture(name))).id.startsWith("06-"), true);
  const valid = structuredClone(fixture("tightly-bounded"));
  const invalid = [
    null,
    { ...valid, id: "bad" },
    { ...valid, description: "" },
    { ...valid, declaredAuthority: null },
    { ...valid, declaredAuthority: { capabilities: [{ id: "x", kind: "bad", resource: "x", access: [] }] } },
    { ...valid, declaredAuthority: { capabilities: [{ id: "x", kind: "filesystem", resource: "x", access: ["bad"] }] } },
    { ...valid, declaredAuthority: { capabilities: [{ id: "x", kind: "filesystem", resource: "x", access: [], constraints: { x: [] } }] } },
    { ...valid, snapshot: { ...valid.snapshot, agentId: "" } },
    { ...valid, snapshot: { ...valid.snapshot, deploymentId: "" } },
    { ...valid, snapshot: { ...valid.snapshot, capturedAt: "" } },
    { ...valid, snapshot: { ...valid.snapshot, sequenceStart: 0 } },
    { ...valid, snapshot: { ...valid.snapshot, configVersions: { x: 1 } } },
    { ...valid, snapshot: { ...valid.snapshot, sandbox: { mode: 1 } } },
    { ...valid, snapshot: { ...valid.snapshot, toolPolicy: { allow: [1] } } },
    { ...valid, snapshot: { ...valid.snapshot, mounts: [{ path: 1 }] } },
    { ...valid, snapshot: { ...valid.snapshot, network: { destinations: [1] } } },
    { ...valid, snapshot: { ...valid.snapshot, elevatedExecution: "false" } },
    { ...valid, expectations: { completeness: "safe", aeg: "none", unexpectedAuthority: [] } },
  ];
  for (const value of invalid) assert.throws(() => parseOpenClawScenarioFixture(value), InvalidFixtureError);
});

