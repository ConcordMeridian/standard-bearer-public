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

test("journal append, stream, replay, deduplication, immutability, and intact verification conform", async () => {
  const batch = events();
  const mutable = structuredClone(batch[0]);
  const journal = new InMemoryEvidenceJournal();
  await journal.append(mutable);
  mutable.payload.deployment.agent.id = "mutated";
  await journal.append(batch[0]);
  for (const event of batch.slice(1)) await journal.append(event);
  const replay = await collect(journal.stream());
  assert.equal(replay.length, 4);
  assert.equal(replay[0].payload.deployment.agent.id, "coder");
  assert.equal(Object.isFrozen(replay[0].payload), true);
  assert.deepEqual(replay.map(({ eventId }) => eventId), batch.map(({ eventId }) => eventId));
  assert.deepEqual((await collect(journal.stream({ offset: 2 }))).map(({ sequence }) => sequence), [3n, 4n]);
  assert.equal((await journal.verify()).valid, true);
  assert.match(serializeEvidenceEvent(replay[0]), /"sequence":"1"/);
  await assert.rejects(collect(journal.stream({ offset: -1 })), /cursor/);
  await assert.rejects(collect(journal.stream({ offset: 0.5 })), /cursor/);
});

test("journal rejects conflicting IDs and approved out-of-order delivery", async () => {
  const batch = events();
  const journal = await journalFor([batch[0], batch[1]]);
  const collisionPayload = { authority: { capabilities: [] } };
  await assert.rejects(journal.append(changedEvent(batch[1], {
    payload: collisionPayload,
    payloadHash: payloadHash(collisionPayload),
  })), /collision/);
  await assert.rejects(journal.append(changedEvent(batch[0], { eventId: "new-but-old" })), OutOfOrderEventError);
});

