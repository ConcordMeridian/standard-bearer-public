import {
  canonicalSerialize,
  type AccountableOwner,
  type AgentDeploymentIdentity,
  type AuthorityEnvelope,
  type AuthorityObservation,
  type EffectiveAuthority,
  type EvidenceEvent,
  type ObservationHealth,
  type ObserverHealthStatus,
  type PermissionSnapshotPayload,
} from "@standard-bearer/protocol";
import { calculateAuthorityExposureGap, type AuthorityExposureGap } from "./aeg.js";
import { calculateEffectiveAuthority } from "./effective-authority.js";

export interface AgentAuthorityMap {
  readonly deployment: AgentDeploymentIdentity;
  readonly owner?: AccountableOwner;
  readonly declaredAuthority: AuthorityEnvelope;
  readonly authorityObservations: readonly AuthorityObservation[];
  readonly effectiveAuthority: EffectiveAuthority;
  readonly exposureGap: AuthorityExposureGap;
  readonly observedAt: string;
  readonly sourceHealth: ObservationHealth;
}

export interface AuthorityProjectionState {
  readonly agentId?: string;
  readonly deploymentId?: string;
  readonly deployment?: AgentDeploymentIdentity;
  readonly declaredAuthority?: AuthorityEnvelope;
  readonly permissionSnapshot?: PermissionSnapshotPayload;
  readonly observedAt?: string;
  readonly healthStatus?: ObserverHealthStatus;
  readonly healthIssues: readonly string[];
  readonly appliedEventIds: readonly string[];
}

export const emptyAuthorityProjection: AuthorityProjectionState = Object.freeze({
  healthIssues: Object.freeze([]),
  appliedEventIds: Object.freeze([]),
});

function mergeIssues(previous: readonly string[], additions: readonly string[]): readonly string[] {
  return Object.freeze([...new Set([...previous, ...additions])].sort());
}

function mergeHealth(previous: ObserverHealthStatus | undefined, current: ObserverHealthStatus): ObserverHealthStatus {
  if (previous === "unknown" || current === "unknown") return "unknown";
  if (previous === "degraded" || current === "degraded") return "degraded";
  return "healthy";
}

export function applyAuthorityEvent(previous: AuthorityProjectionState, event: EvidenceEvent): AuthorityProjectionState {
  if (previous.appliedEventIds.includes(event.eventId)) return previous;
  if (previous.deploymentId !== undefined && previous.deploymentId !== event.deploymentId) {
    throw new Error(`Projection deployment mismatch: ${previous.deploymentId} != ${event.deploymentId}`);
  }
  if (previous.agentId !== undefined && previous.agentId !== event.agentId) {
    throw new Error(`Projection agent mismatch: ${previous.agentId} != ${event.agentId}`);
  }
  const common = {
    ...previous,
    agentId: event.agentId,
    deploymentId: event.deploymentId,
    observedAt: event.observedAt,
    appliedEventIds: Object.freeze([...previous.appliedEventIds, event.eventId]),
  };
  switch (event.type) {
    case "agent.discovered":
      return Object.freeze({ ...common, deployment: event.payload.deployment });
    case "authority.declared":
      return Object.freeze({ ...common, declaredAuthority: event.payload.authority });
    case "permission.snapshot":
      return Object.freeze({ ...common, permissionSnapshot: event.payload });
    case "observer.health.changed":
      return Object.freeze({
        ...common,
        healthStatus: mergeHealth(previous.healthStatus, event.payload.status),
        healthIssues: mergeIssues(previous.healthIssues, event.payload.issues),
      });
    case "environment.changed":
      if (previous.deployment === undefined) throw new Error("Environment change preceded agent discovery");
      return Object.freeze({
        ...common,
        deployment: Object.freeze({
          ...previous.deployment,
          ...(event.payload.environment === undefined ? { environment: undefined } : { environment: event.payload.environment }),
        }),
      });
  }
}

export function authorityMapFromProjection(state: AuthorityProjectionState): AgentAuthorityMap {
  if (state.deployment === undefined) throw new Error("Projection has no discovered deployment");
  if (state.declaredAuthority === undefined) throw new Error("Projection has no declared authority");
  if (state.permissionSnapshot === undefined) throw new Error("Projection has no permission snapshot");
  if (state.observedAt === undefined) throw new Error("Projection has no observation time");
  if (state.healthStatus === undefined) throw new Error("Projection has no observer health state");

  const calculatedAuthority = calculateEffectiveAuthority(state.permissionSnapshot);
  const effectiveAuthority: EffectiveAuthority = state.healthStatus === "healthy"
    ? calculatedAuthority
    : Object.freeze({
      capabilities: calculatedAuthority.capabilities,
      completeness: calculatedAuthority.completeness === "unknown" ? "unknown" : "partial",
    });
  const exposureGap = calculateAuthorityExposureGap(state.declaredAuthority, effectiveAuthority);
  return Object.freeze({
    deployment: state.deployment,
    declaredAuthority: state.declaredAuthority,
    authorityObservations: state.permissionSnapshot.observations,
    effectiveAuthority,
    exposureGap,
    observedAt: state.observedAt,
    sourceHealth: Object.freeze({
      status: state.healthStatus,
      lastObservedAt: state.observedAt,
      issues: state.healthIssues,
    }),
  });
}

export function serializeAuthorityMap(map: AgentAuthorityMap): string {
  return canonicalSerialize(map);
}

export class ProjectionNotFoundError extends Error {
  constructor(agentId: string, deploymentId: string) {
    super(`No authority projection for agent ${agentId}, deployment ${deploymentId}`);
    this.name = "ProjectionNotFoundError";
  }
}

function projectionKey(agentId: string, deploymentId: string): string {
  return `${agentId}\u0000${deploymentId}`;
}

export class AuthorityProjector {
  readonly #states = new Map<string, AuthorityProjectionState>();

  apply(event: EvidenceEvent): void {
    const key = projectionKey(event.agentId, event.deploymentId);
    const previous = this.#states.get(key) ?? emptyAuthorityProjection;
    this.#states.set(key, applyAuthorityEvent(previous, event));
  }

  map(agentId: string, deploymentId: string): AgentAuthorityMap {
    const state = this.#states.get(projectionKey(agentId, deploymentId));
    if (state === undefined) throw new ProjectionNotFoundError(agentId, deploymentId);
    return authorityMapFromProjection(state);
  }

  rebuild(events: Iterable<EvidenceEvent>, agentId: string, deploymentId: string): AgentAuthorityMap {
    const projector = new AuthorityProjector();
    for (const event of events) projector.apply(event);
    return projector.map(agentId, deploymentId);
  }
}
