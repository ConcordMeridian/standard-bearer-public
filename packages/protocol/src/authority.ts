export type Access = "read" | "write" | "execute" | "connect" | "use" | "admin";
export type AuthorityKind = "filesystem" | "network" | "execution" | "messaging" | "credential" | "tool";
export type ObservationCompleteness = "complete" | "partial" | "unknown";
export type Scenario06AuthorityDimension =
  | "workspace-filesystem"
  | "broader-filesystem"
  | "shell-execution"
  | "elevated-execution"
  | "network";

export interface AuthorityCapability {
  readonly id: string;
  readonly kind: AuthorityKind;
  readonly resource: string;
  readonly access: readonly Access[];
  readonly constraints?: Readonly<Record<string, string | boolean | number>>;
}

export interface EffectiveAuthority {
  readonly capabilities: readonly AuthorityCapability[];
  readonly completeness: ObservationCompleteness;
}

export interface AuthorityEnvelope {
  readonly capabilities: readonly AuthorityCapability[];
}

export interface ObservationSource {
  readonly collectorId: string;
  readonly source: string;
  readonly evidenceMode: "self_attested" | "observed" | "sealed" | "witnessed";
}

export interface AuthorityObservation {
  readonly dimension: Scenario06AuthorityDimension;
  readonly knowledge: "known" | "unknown";
  readonly capability?: AuthorityCapability;
  readonly source: ObservationSource;
}

export interface AgentIdentity { readonly provider: string; readonly id: string }
export interface AgentDeploymentIdentity {
  readonly agent: AgentIdentity;
  readonly deploymentId: string;
  readonly environment?: string;
}
export interface AccountableOwner { readonly id: string; readonly displayName?: string }
