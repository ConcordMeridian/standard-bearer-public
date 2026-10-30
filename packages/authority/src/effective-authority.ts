import type {
  AuthorityCapability,
  AuthorityObservation,
  EffectiveAuthority,
  PermissionSnapshotPayload,
  Scenario06AuthorityDimension,
} from "@standard-bearer/protocol";

const requiredDimensions: readonly Scenario06AuthorityDimension[] = [
  "workspace-filesystem",
  "broader-filesystem",
  "shell-execution",
  "elevated-execution",
  "network",
];

function dimensionOrder(observation: AuthorityObservation): number {
  return requiredDimensions.indexOf(observation.dimension);
}

function hasCapability(observation: AuthorityObservation): observation is AuthorityObservation & { readonly capability: AuthorityCapability } {
  return observation.knowledge === "known" && observation.capability !== undefined;
}

export function calculateEffectiveAuthority(snapshot: PermissionSnapshotPayload): EffectiveAuthority {
  const knownDimensions = requiredDimensions.filter((dimension) => {
    const matching = snapshot.observations.filter((observation) => observation.dimension === dimension);
    return matching.length > 0 && matching.every((observation) => observation.knowledge === "known");
  });
  const completeness = knownDimensions.length === requiredDimensions.length
    ? "complete"
    : knownDimensions.length === 0 ? "unknown" : "partial";
  const capabilities = snapshot.observations
    .filter(hasCapability)
    .map((observation) => ({
      key: `${dimensionOrder(observation).toString().padStart(2, "0")}\u0000${observation.capability.resource}`,
      capability: observation.capability,
    }))
    .sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
    .map(({ capability }) => capability);
  return Object.freeze({ capabilities: Object.freeze(capabilities), completeness });
}
