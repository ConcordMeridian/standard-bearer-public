import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryEvidenceJournal, OutOfOrderEventError } from "../../packages/evidence/dist/index.js";
import { InvalidEvidenceEventError } from "../../packages/protocol/dist/index.js";
import { changedEvent, collect, events } from "../support.mjs";

test("appendBatch is all-or-nothing: a rejected event leaves no partial evidence", async () => {
  const batch = events();
  const journal = new InMemoryEvidenceJournal();
  await journal.appendBatch([batch[0]]);
  await assert.rejects(journal.appendBatch([batch[1], { ...batch[2], payloadHash: "sha256:wrong" }]), InvalidEvidenceEventError);
  await assert.rejects(journal.appendBatch([batch[1], changedEvent(batch[0], { eventId: "reused-sequence" })]), OutOfOrderEventError);
  await assert.rejects(journal.appendBatch([batch[1], changedEvent(batch[1], { observedAt: "changed" })]), /collision/);
  assert.deepEqual((await collect(journal.stream())).map(({ eventId }) => eventId), [batch[0].eventId]);
  await journal.appendBatch(batch.slice(1));
  assert.equal((await collect(journal.stream())).length, 4);
  assert.equal((await journal.verify()).valid, true);
});

test("appendBatch keeps duplicate delivery idempotent and derives gap health exactly as single appends do", async () => {
  const batch = events();
  const gapped = changedEvent(batch[3], { sequence: 6n, eventId: `${batch[3].collectorId}:6:observer.health.changed` });
  const single = new InMemoryEvidenceJournal();
  for (const event of [batch[0], batch[0], batch[1], gapped]) await single.append(event);
  const batched = new InMemoryEvidenceJournal();
  await batched.appendBatch([batch[0], batch[0], batch[1], gapped]);
  const singleHistory = await collect(single.stream());
  assert.deepEqual(await collect(batched.stream()), singleHistory);
  assert.equal(singleHistory.at(-1).type, "observer.health.changed");
  assert.equal(singleHistory.at(-1).source, "standard-bearer.evidence-journal");
  await batched.appendBatch([]);
  assert.equal((await collect(batched.stream())).length, singleHistory.length);
});
