import { readFileSync } from "node:fs";
import { AuthorityProjector, type AgentAuthorityMap } from "@standard-bearer/authority";
import { InMemoryEvidenceJournal } from "@standard-bearer/evidence";
import type { AuthorityCapability } from "@standard-bearer/protocol";
import {
  parseOpenClawScenarioFixture,
  ScenarioOpenClawAdapter,
  type OpenClawScenarioFixture,
} from "@standard-bearer/sensor-openclaw";

export class UnsupportedScenarioError extends Error {
  constructor(scenario: string) {
    super(`Unsupported scenario: ${scenario}`);
    this.name = "UnsupportedScenarioError";
  }
}

export class UnsupportedFixtureError extends Error {
  constructor(fixture: string) {
    super(`Unsupported fixture: ${fixture}`);
    this.name = "UnsupportedFixtureError";
  }
}

const fixtureNames = ["tightly-bounded", "unexpectedly-elevated", "incomplete"] as const;
export type Scenario06FixtureName = typeof fixtureNames[number];

function isFixtureName(value: string): value is Scenario06FixtureName {
  return fixtureNames.some((fixtureName) => fixtureName === value);
}

export function readScenario06Fixture(name: Scenario06FixtureName): OpenClawScenarioFixture {
  const url = new URL(`../../../scenarios/06-sandbox-mismatch/fixtures/${name}.json`, import.meta.url);
  return parseOpenClawScenarioFixture(JSON.parse(readFileSync(url, "utf8")) as unknown);
}

function accessLabel(capability: AuthorityCapability): string {
  if (capability.constraints?.unrestricted === true) return "UNRESTRICTED";
  if (capability.kind === "execution") return "ALLOWED";
  return capability.access.map((access) => access.toUpperCase()).join(" / ");
}

function authoritySection(title: string, capabilities: readonly AuthorityCapability[]): readonly string[] {
  const lines = [title];
  if (capabilities.length === 0) return [...lines, "  NONE"];
  for (const kind of ["filesystem", "execution", "network", "messaging", "credential", "tool"] as const) {
    const matching = capabilities.filter((capability) => capability.kind === kind);
    if (matching.length === 0) continue;
    lines.push("", `  ${kind[0].toUpperCase()}${kind.slice(1)}`);
    for (const capability of matching) lines.push(`    ${capability.resource.padEnd(20)} ${accessLabel(capability)}`);
  }
  return lines;
}

function unexpectedLabel(capability: AuthorityCapability): string {
  if (capability.kind === "execution") return capability.resource === "elevated" ? "elevated execution" : "shell execution";
  if (capability.kind === "network") return "unrestricted network";
  return `${capability.resource} ${capability.access.map((access) => access.toUpperCase()).join(" / ")}`;
}

export function formatAuthorityMap(map: AgentAuthorityMap): string {
  const lines = [
    "STANDARD BEARER",
    "",
    "Agent",
    `  ${map.deployment.agent.provider}:${map.deployment.agent.id}`,
    "",
    "Deployment",
    `  ${map.deployment.deploymentId}${map.deployment.environment ? ` (${map.deployment.environment})` : ""}`,
    "",
    "Authority Exposure Gap",
    `  ${map.exposureGap.status.toUpperCase()}`,
    "",
    "Observation Completeness",
    `  ${map.effectiveAuthority.completeness.toUpperCase()}`,
    "",
    "Unexpected Authority",
    ...(map.exposureGap.differences.length === 0
      ? [map.exposureGap.status === "unknown" ? "  NOT DETERMINABLE" : "  NONE"]
      : map.exposureGap.differences.map(({ capability }) => `  + ${unexpectedLabel(capability)}`)),
    "",
    ...authoritySection("Declared Authority", map.declaredAuthority.capabilities),
    "",
    ...authoritySection("Observed Effective Authority", map.effectiveAuthority.capabilities),
  ];
  if (map.sourceHealth.issues.length > 0) {
    lines.push("", "Observer Health", `  ${map.sourceHealth.status.toUpperCase()}`,
      ...map.sourceHealth.issues.map((issue) => `  ! ${issue}`));
  }
  return lines.join("\n");
}

export interface FixtureProjection {
  readonly map: AgentAuthorityMap;
  readonly eventCount: number;
}

export async function projectFixture(fixture: OpenClawScenarioFixture): Promise<FixtureProjection> {
  const adapter = new ScenarioOpenClawAdapter();
  const journal = new InMemoryEvidenceJournal();
  const projector = new AuthorityProjector();
  for (const event of adapter.toEvidenceEvents(fixture)) await journal.append(event);
  let eventCount = 0;
  for await (const event of journal.stream()) {
    projector.apply(event);
    eventCount += 1;
  }
  return Object.freeze({ map: projector.map(fixture.snapshot.agentId, fixture.snapshot.deploymentId), eventCount });
}

export async function replayScenario06(selected?: Scenario06FixtureName): Promise<readonly FixtureProjection[]> {
  const selectedNames = selected === undefined ? fixtureNames : [selected];
  return Promise.all(selectedNames.map((name) => projectFixture(readScenario06Fixture(name))));
}

export async function runCommand(arguments_: readonly string[]): Promise<string> {
  const [command, scenario, option, fixture] = arguments_;
  if (command !== "replay" || scenario !== "06-sandbox-mismatch") {
    throw new UnsupportedScenarioError(scenario ?? command ?? "");
  }
  if (option !== undefined && option !== "--fixture") throw new UnsupportedFixtureError(option);
  let selected: Scenario06FixtureName | undefined;
  if (option === "--fixture" && (fixture === undefined || !isFixtureName(fixture))) {
    throw new UnsupportedFixtureError(fixture ?? "");
  }
  if (option === "--fixture" && fixture !== undefined && isFixtureName(fixture)) selected = fixture;
  if (arguments_.length > (option === undefined ? 2 : 4)) throw new UnsupportedFixtureError(arguments_.slice(4).join(" "));
  const projections = await replayScenario06(selected);
  return projections.map(({ map }) => formatAuthorityMap(map)).join("\n\n========================================\n\n");
}
