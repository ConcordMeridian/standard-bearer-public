export { default as assert } from "node:assert/strict";
export { execFileSync, spawnSync } from "node:child_process";
export { readFileSync } from "node:fs";
export { default as test } from "node:test";

export {
  AuthorityProjector,
  ProjectionNotFoundError,
  applyAuthorityEvent,
  authorityMapFromProjection,
  calculateAuthorityDrift,
  calculateAuthorityExposureGap,
  calculateEffectiveAuthority,
  emptyAuthorityProjection,
  serializeAuthorityMap,
} from "../packages/authority/dist/index.js";
export {
  formatAuthorityMap,
  projectFixture,
  replayScenario06,
  runCommand,
} from "../packages/cli/dist/commands.js";
export {
  InMemoryEvidenceJournal,
  OutOfOrderEventError,
  serializeEvidenceEvent,
} from "../packages/evidence/dist/index.js";
export {
  InvalidEvidenceEventError,
  canonicalSerialize,
  payloadHash,
  validateEvidenceEvent,
} from "../packages/protocol/dist/index.js";
export {
  InvalidFixtureError,
  ScenarioOpenClawAdapter,
  parseOpenClawScenarioFixture,
} from "../packages/sensor-openclaw/dist/index.js";

import { AuthorityProjector } from "../packages/authority/dist/index.js";
import { readScenario06Fixture } from "../packages/cli/dist/commands.js";
import { InMemoryEvidenceJournal } from "../packages/evidence/dist/index.js";
import { ScenarioOpenClawAdapter } from "../packages/sensor-openclaw/dist/index.js";

export const fixtureNames = ["tightly-bounded", "unexpectedly-elevated", "incomplete"];

export function fixture(name) {
  return readScenario06Fixture(name);
}

export function events(name = "tightly-bounded") {
  return new ScenarioOpenClawAdapter().toEvidenceEvents(fixture(name));
}

export async function collect(stream) {
  const result = [];
  for await (const event of stream) result.push(event);
  return result;
}

export function changedEvent(event, changes) {
  return { ...structuredClone(event), ...changes };
}

export async function journalFor(eventBatch) {
  const journal = new InMemoryEvidenceJournal();
  for (const event of eventBatch) await journal.append(event);
  return journal;
}

export function project(eventBatch, agentId = "coder", deploymentId = "local-dev-bounded") {
  const projector = new AuthorityProjector();
  for (const event of eventBatch) projector.apply(event);
  return projector.map(agentId, deploymentId);
}
