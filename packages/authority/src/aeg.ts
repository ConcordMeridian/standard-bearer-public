import { canonicalSerialize, type AuthorityCapability, type AuthorityEnvelope, type EffectiveAuthority } from "@standard-bearer/protocol";

export interface AuthorityDifference {
  readonly capability: AuthorityCapability;
  readonly reason: string;
}
export interface AuthorityExposureGap {
  readonly status: "none" | "bounded" | "high" | "unknown" | "unbounded";
  readonly differences: readonly AuthorityDifference[];
}

function accessIncludes(declared: AuthorityCapability, effective: AuthorityCapability): boolean {
  return effective.access.every((access) => declared.access.includes(access));
}

function constraintsMatch(declared: AuthorityCapability, effective: AuthorityCapability): boolean {
  return canonicalSerialize(declared.constraints ?? {}) === canonicalSerialize(effective.constraints ?? {});
}

function isCovered(capability: AuthorityCapability, declared: AuthorityEnvelope): boolean {
  return declared.capabilities.some((candidate) =>
    candidate.kind === capability.kind
    && candidate.resource === capability.resource
    && accessIncludes(candidate, capability)
    && constraintsMatch(candidate, capability));
}

export function calculateAuthorityExposureGap(
  declared: AuthorityEnvelope,
  effective: EffectiveAuthority,
): AuthorityExposureGap {
  if (effective.completeness !== "complete") {
    return Object.freeze({ status: "unknown", differences: Object.freeze([]) });
  }

  const differences = effective.capabilities
    .filter((capability) => !isCovered(capability, declared))
    .map((capability) => ({
      capability,
      reason: `${capability.kind}:${capability.resource} exceeds the declared authority envelope`,
    }));

  if (differences.length > 0) {
    return Object.freeze({ status: "high", differences: Object.freeze(differences) });
  }

  return Object.freeze({ status: "none", differences: Object.freeze([]) });
}
