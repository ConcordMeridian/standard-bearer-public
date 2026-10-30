import {
  payloadHash,
  type AuthorityCapability,
  type AuthorityEnvelope,
  type AuthorityObservation,
  type DimensionHealth,
  type EvidenceEvent,
  type ObservationSource,
  type ObserverHealthChangedPayload,
  type PermissionSnapshotPayload,
  type Scenario06AuthorityDimension,
} from "@standard-bearer/protocol";
import type { OpenClawSnapshot } from "./snapshot.js";

export interface OpenClawAuthorityCapture {
  readonly snapshot: OpenClawSnapshot;
  readonly declaredAuthority: AuthorityEnvelope;
}

export interface OpenClawAdapter {
  toEvidenceEvents(capture: OpenClawAuthorityCapture): readonly EvidenceEvent[];
}

function observation(
  dimension: Scenario06AuthorityDimension,
  source: ObservationSource,
  capability?: AuthorityCapability,
): AuthorityObservation {
  return Object.freeze({ dimension, knowledge: "known", source, ...(capability === undefined ? {} : { capability: Object.freeze(capability) }) });
}

function unknown(dimension: Scenario06AuthorityDimension, source: ObservationSource): AuthorityObservation {
  return Object.freeze({ dimension, knowledge: "unknown", source });
}

function permissionSnapshot(snapshot: OpenClawSnapshot, source: ObservationSource): PermissionSnapshotPayload {
  const observations: AuthorityObservation[] = [];

  if (snapshot.workspaceAccess === "read-only") {
    observations.push(observation("workspace-filesystem", source, { id: "filesystem:workspace", kind: "filesystem", resource: "/workspace", access: ["read"] }));
  } else if (snapshot.workspaceAccess === "read-write") {
    observations.push(observation("workspace-filesystem", source, { id: "filesystem:workspace", kind: "filesystem", resource: "/workspace", access: ["read", "write"] }));
  } else if (snapshot.workspaceAccess === "none") {
    observations.push(observation("workspace-filesystem", source));
  } else {
    observations.push(unknown("workspace-filesystem", source));
  }

  if (snapshot.mounts === undefined) {
    observations.push(unknown("broader-filesystem", source));
  } else if (snapshot.mounts.length === 0) {
    observations.push(observation("broader-filesystem", source));
  } else {
    for (const mount of snapshot.mounts) {
      if (mount.access === "read-only") {
        observations.push(observation("broader-filesystem", source, { id: `filesystem:${mount.path}`, kind: "filesystem", resource: mount.path, access: ["read"] }));
      } else if (mount.access === "read-write") {
        observations.push(observation("broader-filesystem", source, { id: `filesystem:${mount.path}`, kind: "filesystem", resource: mount.path, access: ["read", "write"] }));
      } else {
        observations.push(unknown("broader-filesystem", source));
      }
    }
  }

  const shellPolicyKnown = snapshot.toolPolicy?.allow !== undefined && snapshot.toolPolicy.deny !== undefined;
  if (snapshot.executionTarget === undefined || !shellPolicyKnown || snapshot.sandbox?.mode === undefined || snapshot.sandbox.scope === undefined) {
    observations.push(unknown("shell-execution", source));
  } else {
    const shellAllowed = snapshot.executionTarget !== "none"
      && snapshot.toolPolicy?.allow?.includes("shell") === true
      && snapshot.toolPolicy.deny?.includes("shell") !== true;
    observations.push(observation("shell-execution", source, shellAllowed
      ? { id: "execution:shell", kind: "execution", resource: "shell", access: ["execute"] }
      : undefined));
  }

  if (snapshot.elevatedExecution === undefined) {
    observations.push(unknown("elevated-execution", source));
  } else {
    observations.push(observation("elevated-execution", source, snapshot.elevatedExecution
      ? { id: "execution:elevated", kind: "execution", resource: "elevated", access: ["execute"] }
      : undefined));
  }

  if (snapshot.network?.mode === "unrestricted") {
    observations.push(observation("network", source, {
      id: "network:internet",
      kind: "network",
      resource: "internet",
      access: ["connect"],
      constraints: { unrestricted: true },
    }));
  } else if (snapshot.network?.mode === "none") {
    observations.push(observation("network", source));
  } else if (snapshot.network?.mode === "restricted" && snapshot.network.destinations !== undefined) {
    if (snapshot.network.destinations.length === 0) observations.push(observation("network", source));
    for (const destination of snapshot.network.destinations) {
      observations.push(observation("network", source, { id: `network:${destination}`, kind: "network", resource: destination, access: ["connect"] }));
    }
  } else {
    observations.push(unknown("network", source));
  }

  return Object.freeze({
    observations: Object.freeze(observations),
    controlState: Object.freeze({
      sandbox: Object.freeze({ ...(snapshot.sandbox ?? {}) }),
      ...(snapshot.workspaceAccess === undefined ? {} : { workspaceAccess: snapshot.workspaceAccess }),
      toolPolicy: Object.freeze({
        ...(snapshot.toolPolicy?.allow === undefined ? {} : { allow: Object.freeze([...snapshot.toolPolicy.allow]) }),
        ...(snapshot.toolPolicy?.deny === undefined ? {} : { deny: Object.freeze([...snapshot.toolPolicy.deny]) }),
      }),
      ...(snapshot.elevatedExecution === undefined ? {} : { elevatedExecution: snapshot.elevatedExecution }),
      ...(snapshot.executionTarget === undefined ? {} : { executionTarget: snapshot.executionTarget }),
      ...(snapshot.mounts === undefined ? {} : { mounts: Object.freeze(snapshot.mounts.map((mount) => Object.freeze({ ...mount }))) }),
      network: Object.freeze({
        ...(snapshot.network?.mode === undefined ? {} : { mode: snapshot.network.mode }),
        ...(snapshot.network?.destinations === undefined ? {} : { destinations: Object.freeze([...snapshot.network.destinations]) }),
      }),
    }),
  });
}

function observerHealth(snapshot: PermissionSnapshotPayload): ObserverHealthChangedPayload {
  const requiredDimensions: readonly Scenario06AuthorityDimension[] = [
    "workspace-filesystem",
    "broader-filesystem",
    "shell-execution",
    "elevated-execution",
    "network",
  ];
  const dimensions: DimensionHealth[] = requiredDimensions.map((dimension) => Object.freeze({
    dimension,
    status: snapshot.observations.some((item) => item.dimension === dimension && item.knowledge === "unknown")
      ? "unavailable" as const
      : "observed" as const,
  }));
  const unavailable = dimensions.filter(({ status }) => status !== "observed");
  const observedCount = dimensions.length - unavailable.length;
  const status = unavailable.length === 0 ? "healthy" : observedCount === 0 ? "unknown" : "degraded";
  return Object.freeze({
    status,
    dimensions: Object.freeze(dimensions),
    issues: Object.freeze(unavailable.map(({ dimension }) => `Required authority dimension unavailable: ${dimension}`)),
  });
}

export class ScenarioOpenClawAdapter implements OpenClawAdapter {
  toEvidenceEvents({ snapshot, declaredAuthority }: OpenClawAuthorityCapture): readonly EvidenceEvent[] {
    if (!Number.isSafeInteger(snapshot.sequenceStart) || snapshot.sequenceStart < 1) {
      throw new Error("OpenClaw collector sequenceStart must be a positive safe integer");
    }
    const collectorId = `openclaw-config:${snapshot.deploymentId}`;
    const correlationId = `${collectorId}:${snapshot.capturedAt}`;
    const sequence = (offset: number): bigint => BigInt(snapshot.sequenceStart + offset);
    const eventId = (offset: number, type: string): string => `${collectorId}:${sequence(offset).toString()}:${type}`;
    const common = {
      schemaVersion: "0.2" as const,
      observedAt: snapshot.capturedAt,
      correlationId,
      agentId: snapshot.agentId,
      deploymentId: snapshot.deploymentId,
      collectorId,
      source: "openclaw.configuration",
      evidenceMode: "self_attested" as const,
      configVersions: Object.freeze({ ...(snapshot.configVersions ?? {}) }),
    };
    const source: ObservationSource = Object.freeze({ collectorId, source: common.source, evidenceMode: common.evidenceMode });
    const discoveredPayload = Object.freeze({
      deployment: Object.freeze({
        agent: Object.freeze({ provider: "openclaw", id: snapshot.agentId }),
        deploymentId: snapshot.deploymentId,
        ...(snapshot.environment === undefined ? {} : { environment: snapshot.environment }),
      }),
    });
    const declaredPayload = Object.freeze({ authority: declaredAuthority });
    const snapshotPayload = permissionSnapshot(snapshot, source);
    const healthPayload = observerHealth(snapshotPayload);
    const discovered: EvidenceEvent = Object.freeze({
      ...common,
      eventId: eventId(0, "agent.discovered"),
      type: "agent.discovered",
      sequence: sequence(0),
      payloadHash: payloadHash(discoveredPayload),
      payload: discoveredPayload,
    });
    const declared: EvidenceEvent = Object.freeze({
      ...common,
      eventId: eventId(1, "authority.declared"),
      type: "authority.declared",
      sequence: sequence(1),
      causationId: discovered.eventId,
      payloadHash: payloadHash(declaredPayload),
      payload: declaredPayload,
    });
    const permission: EvidenceEvent = Object.freeze({
      ...common,
      eventId: eventId(2, "permission.snapshot"),
      type: "permission.snapshot",
      sequence: sequence(2),
      causationId: declared.eventId,
      payloadHash: payloadHash(snapshotPayload),
      payload: snapshotPayload,
    });
    const health: EvidenceEvent = Object.freeze({
      ...common,
      eventId: eventId(3, "observer.health.changed"),
      type: "observer.health.changed",
      sequence: sequence(3),
      causationId: permission.eventId,
      payloadHash: payloadHash(healthPayload),
      payload: healthPayload,
    });
    return Object.freeze([discovered, declared, permission, health]);
  }
}
