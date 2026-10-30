import { createHash } from "node:crypto";
import type {
  AgentDeploymentIdentity,
  AuthorityEnvelope,
  AuthorityObservation,
  Scenario06AuthorityDimension,
} from "./authority.js";

export type EvidenceMode = "self_attested" | "observed" | "sealed" | "witnessed";
export type ObserverHealthStatus = "healthy" | "degraded" | "unknown";
export type DimensionHealthStatus = "observed" | "unavailable" | "missing" | "degraded";

interface EvidenceEventEnvelope<TType extends string, TPayload> {
  readonly eventId: string;
  readonly schemaVersion: "0.2";
  readonly type: TType;
  readonly observedAt: string;
  readonly sequence: bigint;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly agentId: string;
  readonly deploymentId: string;
  readonly collectorId: string;
  readonly source: string;
  readonly evidenceMode: EvidenceMode;
  readonly configVersions: Readonly<Record<string, string>>;
  readonly payloadHash: string;
  readonly payload: TPayload;
  readonly redactions?: readonly string[];
}

export interface AgentDiscoveredPayload {
  readonly deployment: AgentDeploymentIdentity;
}

export interface AuthorityDeclaredPayload {
  readonly authority: AuthorityEnvelope;
}

export interface PermissionControlState {
  readonly sandbox: Readonly<{ mode?: string; scope?: string }>;
  readonly workspaceAccess?: string;
  readonly toolPolicy: Readonly<{ allow?: readonly string[]; deny?: readonly string[] }>;
  readonly elevatedExecution?: boolean;
  readonly executionTarget?: string;
  readonly mounts?: readonly Readonly<{ path: string; access?: string }>[];
  readonly network: Readonly<{ mode?: string; destinations?: readonly string[] }>;
}

export interface PermissionSnapshotPayload {
  readonly observations: readonly AuthorityObservation[];
  readonly controlState: PermissionControlState;
}

export interface DimensionHealth {
  readonly dimension: Scenario06AuthorityDimension;
  readonly status: DimensionHealthStatus;
}

export interface ObserverHealthChangedPayload {
  readonly status: ObserverHealthStatus;
  readonly dimensions: readonly DimensionHealth[];
  readonly issues: readonly string[];
}

export interface EnvironmentChangedPayload {
  readonly environment?: string;
}

export type AgentDiscoveredEvent = EvidenceEventEnvelope<"agent.discovered", AgentDiscoveredPayload>;
export type AuthorityDeclaredEvent = EvidenceEventEnvelope<"authority.declared", AuthorityDeclaredPayload>;
export type PermissionSnapshotEvent = EvidenceEventEnvelope<"permission.snapshot", PermissionSnapshotPayload>;
export type ObserverHealthChangedEvent = EvidenceEventEnvelope<"observer.health.changed", ObserverHealthChangedPayload>;
export type EnvironmentChangedEvent = EvidenceEventEnvelope<"environment.changed", EnvironmentChangedPayload>;

export type EvidenceEvent =
  | AgentDiscoveredEvent
  | AuthorityDeclaredEvent
  | PermissionSnapshotEvent
  | ObserverHealthChangedEvent
  | EnvironmentChangedEvent;

export class InvalidEvidenceEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEvidenceEventError";
  }
}

export function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new InvalidEvidenceEventError("Canonical payload numbers must be finite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalSerialize(record[key])}`).join(",")}}`;
  }
  throw new InvalidEvidenceEventError(`Unsupported canonical payload value: ${typeof value}`);
}

export function payloadHash(payload: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalSerialize(payload)).digest("hex")}`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasStringRecord(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

const eventTypes = new Set(["agent.discovered", "authority.declared", "permission.snapshot", "observer.health.changed", "environment.changed"]);
const evidenceModes = new Set(["self_attested", "observed", "sealed", "witnessed"]);

export function validateEvidenceEvent(value: unknown): asserts value is EvidenceEvent {
  if (!isRecord(value)) throw new InvalidEvidenceEventError("Evidence event must be an object");
  if (value.schemaVersion !== "0.2") throw new InvalidEvidenceEventError("Unsupported evidence event schema version");
  if (!isNonEmptyString(value.eventId)) throw new InvalidEvidenceEventError("Evidence eventId is required");
  if (!isNonEmptyString(value.type) || !eventTypes.has(value.type)) throw new InvalidEvidenceEventError("Unsupported evidence event type");
  if (!isNonEmptyString(value.observedAt)) throw new InvalidEvidenceEventError("Evidence observedAt is required");
  if (typeof value.sequence !== "bigint" || value.sequence < 1n) throw new InvalidEvidenceEventError("Evidence sequence must be a positive bigint");
  if (!isNonEmptyString(value.agentId)) throw new InvalidEvidenceEventError("Evidence agentId is required");
  if (!isNonEmptyString(value.deploymentId)) throw new InvalidEvidenceEventError("Evidence deploymentId is required");
  if (!isNonEmptyString(value.collectorId)) throw new InvalidEvidenceEventError("Evidence collectorId is required");
  if (!isNonEmptyString(value.source)) throw new InvalidEvidenceEventError("Evidence source is required");
  if (typeof value.evidenceMode !== "string" || !evidenceModes.has(value.evidenceMode)) throw new InvalidEvidenceEventError("Unsupported evidenceMode");
  if (!hasStringRecord(value.configVersions)) throw new InvalidEvidenceEventError("Evidence configVersions must contain strings");
  if (value.correlationId !== undefined && !isNonEmptyString(value.correlationId)) throw new InvalidEvidenceEventError("Evidence correlationId must be non-empty");
  if (value.causationId !== undefined && !isNonEmptyString(value.causationId)) throw new InvalidEvidenceEventError("Evidence causationId must be non-empty");
  if (value.redactions !== undefined && (!Array.isArray(value.redactions) || !value.redactions.every(isNonEmptyString))) {
    throw new InvalidEvidenceEventError("Evidence redactions must be non-empty strings");
  }
  if (!isNonEmptyString(value.payloadHash) || value.payloadHash !== payloadHash(value.payload)) {
    throw new InvalidEvidenceEventError(`Evidence payload hash mismatch: ${value.eventId}`);
  }
}
