import type { AuthorityCapability } from "@standard-bearer/protocol";
import type { AgentAuthorityMap } from "./map.js";

export interface AuthorityChange { readonly before: AuthorityCapability; readonly after: AuthorityCapability }
export interface AuthorityDrift {
  readonly previous: AgentAuthorityMap;
  readonly current: AgentAuthorityMap;
  readonly added: readonly AuthorityCapability[];
  readonly removed: readonly AuthorityCapability[];
  readonly changed: readonly AuthorityChange[];
}

export function calculateAuthorityDrift(): never {
  throw new Error("NotImplemented: drift calculation is outside the scaffolding milestone");
}
