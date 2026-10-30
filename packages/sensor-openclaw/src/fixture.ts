import type { Access, AuthorityCapability, AuthorityEnvelope, AuthorityKind } from "@standard-bearer/protocol";
import type { OpenClawSnapshot } from "./snapshot.js";

export interface ScenarioExpectation {
  readonly completeness: "complete" | "partial" | "unknown";
  readonly aeg: "none" | "high" | "unknown";
  readonly unexpectedAuthority: readonly string[];
}

export interface OpenClawScenarioFixture {
  readonly id: string;
  readonly description: string;
  readonly declaredAuthority: AuthorityEnvelope;
  readonly snapshot: OpenClawSnapshot;
  readonly expectations: ScenarioExpectation;
}

export class InvalidFixtureError extends Error {
  constructor(message: string) {
    super(`Invalid fixture: ${message}`);
    this.name = "InvalidFixtureError";
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isAuthorityKind(value: unknown): value is AuthorityKind {
  return value === "filesystem" || value === "network" || value === "execution"
    || value === "messaging" || value === "credential" || value === "tool";
}

function isAccess(value: unknown): value is Access {
  return value === "read" || value === "write" || value === "execute"
    || value === "connect" || value === "use" || value === "admin";
}

function isCapability(value: unknown): value is AuthorityCapability {
  return isRecord(value)
    && typeof value.id === "string"
    && isAuthorityKind(value.kind)
    && typeof value.resource === "string"
    && Array.isArray(value.access)
    && value.access.every(isAccess)
    && (value.constraints === undefined || (isRecord(value.constraints)
      && Object.values(value.constraints).every((entry) => typeof entry === "string" || typeof entry === "boolean" || typeof entry === "number")));
}

function isAuthorityEnvelope(value: unknown): value is AuthorityEnvelope {
  return isRecord(value) && Array.isArray(value.capabilities) && value.capabilities.every(isCapability);
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isSnapshot(value: unknown): value is OpenClawSnapshot {
  if (!isRecord(value)
    || typeof value.agentId !== "string" || value.agentId.length === 0
    || typeof value.deploymentId !== "string" || value.deploymentId.length === 0
    || typeof value.capturedAt !== "string" || value.capturedAt.length === 0
    || typeof value.sequenceStart !== "number" || !Number.isSafeInteger(value.sequenceStart) || value.sequenceStart < 1
    || !isOptionalString(value.environment)
    || (value.configVersions !== undefined && !isStringRecord(value.configVersions))) return false;

  const sandboxValid = value.sandbox === undefined || (isRecord(value.sandbox)
    && isOptionalString(value.sandbox.mode) && isOptionalString(value.sandbox.scope));
  const toolPolicyValid = value.toolPolicy === undefined || (isRecord(value.toolPolicy)
    && (value.toolPolicy.allow === undefined || isStringArray(value.toolPolicy.allow))
    && (value.toolPolicy.deny === undefined || isStringArray(value.toolPolicy.deny)));
  const mountsValid = value.mounts === undefined || (Array.isArray(value.mounts) && value.mounts.every((mount) =>
    isRecord(mount) && typeof mount.path === "string" && isOptionalString(mount.access)));
  const networkValid = value.network === undefined || (isRecord(value.network)
    && isOptionalString(value.network.mode)
    && (value.network.destinations === undefined || isStringArray(value.network.destinations)));
  return sandboxValid && toolPolicyValid && mountsValid && networkValid
    && isOptionalString(value.workspaceAccess)
    && (value.elevatedExecution === undefined || typeof value.elevatedExecution === "boolean")
    && isOptionalString(value.executionTarget);
}

function isExpectation(value: unknown): value is ScenarioExpectation {
  return isRecord(value)
    && (value.completeness === "complete" || value.completeness === "partial" || value.completeness === "unknown")
    && (value.aeg === "none" || value.aeg === "high" || value.aeg === "unknown")
    && isStringArray(value.unexpectedAuthority);
}

export function parseOpenClawScenarioFixture(value: unknown): OpenClawScenarioFixture {
  if (!isRecord(value)) throw new InvalidFixtureError("root must be an object");
  if (typeof value.id !== "string" || !/^06-[a-z0-9-]+$/.test(value.id)) throw new InvalidFixtureError("id must identify Scenario 06");
  if (typeof value.description !== "string" || value.description.length === 0) throw new InvalidFixtureError("description is required");
  if (!isAuthorityEnvelope(value.declaredAuthority)) throw new InvalidFixtureError("declaredAuthority is invalid");
  if (!isSnapshot(value.snapshot)) throw new InvalidFixtureError("snapshot or deployment identity is invalid");
  if (!isExpectation(value.expectations)) throw new InvalidFixtureError("expectations are invalid");
  return Object.freeze({
    id: value.id,
    description: value.description,
    declaredAuthority: value.declaredAuthority,
    snapshot: value.snapshot,
    expectations: value.expectations,
  });
}
