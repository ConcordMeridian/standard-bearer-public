<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/standard-bearer/sb-lockup-standalone-reverse.svg">
    <img alt="Standard Bearer" src="assets/standard-bearer/sb-lockup-standalone.svg" width="320">
  </picture>
</p>

<p align="center"><strong>See what authority your AI agent actually has - and what changed.</strong></p>

> **Research preview - documentation only.** This repository describes Standard Bearer and the examples it runs today. The source code is not published yet.

## The problem

An AI agent's authority is spread across runtime configuration, tools, plug-ins, sandboxes, approval rules and deployment settings. No single place shows what the agent can actually do. So an agent can end up with more authority than its owner intended, and nobody notices until it uses it.

## What Standard Bearer does

Standard Bearer makes the authority delegated to an AI agent visible and bounded. It collects an agent's settings into one **Agent Authority Map**, compares the result with the authority its owner intended, and reports the difference: the **Authority Exposure Gap**.

OpenClaw is the first agent framework it supports. It is the proving ground, not the product boundary.

## Status of the research preview

Standard Bearer currently provides local authority observation and simulated authorization with self-attested evidence. Independent witnessing and stronger evidence assurance are outside the current release. Evidence integrity alone does not establish completeness or independence.

| Capability | Status |
| --- | --- |
| Agent Authority Map, Effective Authority and Authority Exposure Gap, from recorded OpenClaw snapshots | Working in the preview, offline |
| Append-only local evidence record with deterministic replay and integrity checks | Working in the preview, in memory |
| Simulated financial authority (Example 03), with a local browser demonstration | Working in the preview as a simulation only |
| Live connection to a running agent | Not yet built |
| Tracking changes in authority over time | Not yet built |
| Independent witness and evidence confidence levels | Not yet built |

## Example 01: sandbox / elevated execution mismatch

A developer believes their coding agent can only touch `/workspace`. Standard Bearer reads a recorded snapshot of the agent's deployment and reports:

```text
Authority Exposure Gap
  HIGH

Observation Completeness
  COMPLETE

Unexpected Authority
  + /home/user READ
  + shell execution
  + elevated execution
  + unrestricted network

Declared Authority

  Filesystem
    /workspace           READ / WRITE
```

The developer declared `/workspace` only. The deployment's settings also allow broader file reads, shell and elevated execution, and unrestricted network access. That difference is the Authority Exposure Gap.

## Example 03: financial authority (simulated)

A customer lets a bill-pay agent pay **one approved utility**, up to **$500 per billing cycle**.

- A $184.32 payment to the utility is permitted (in simulation).
- A $2,000 request is blocked, even when the agent is 99.99% confident it is right.
- A payment reserved before the customer revokes permission cannot execute afterwards.
- Two $400 requests arriving at once cannot both fit under the $500 limit.

The principle: **capability does not imply authority.** A valid login is not permission to do anything.

This example is a deterministic, offline simulation. It has no bank integration, no payment rail, no credentials and no money movement. Its results are labeled as simulated, never as a bank approval. Its evidence is self-attested, not independently witnessed. It uses fixed synthetic dates.

## How it is organized

Architecture: **AUTHORITY -> WITNESS -> EVIDENCE**

- **Authority** - what is this agent allowed to do? Declared authority, effective authority and the gap between them.
- **Witness** - what did this agent do? Today the only source is a **Semantic Sensor**: an adapter that reports what the agent's configuration and runtime say about themselves. It shares the agent's trust boundary, so it is not an independent witness.
- **Evidence** - can the record be trusted? An append-only record with replay and integrity checks. All evidence today is self-attested.

![Standard Bearer architecture](assets/standard-bearer-architecture.svg)

## Evidence confidence

Standard Bearer distinguishes **self-attested** evidence, reported by software inside the observed agent's trust boundary, from **independently witnessed** evidence, collected by controls the agent cannot modify, disable, impersonate or bypass without detection. Only the first kind exists today, and no evidence confidence level is assigned to it.

> **The agent should not possess the authority necessary to interfere with its observer.**

A consistent record shows that its entries agree with each other. It does not prove that they are complete.

## Follow and give feedback

If you build or run AI agents, or study how authority is delegated to them, we would like to hear from you:

- Does the Authority Exposure Gap match a problem you have seen?
- Which agent settings or permissions should an Authority Map show?
- What evidence would you need before trusting a record of what an agent did?

Open an issue in this repository, or watch it for updates. To report a security concern, see [SECURITY.md](SECURITY.md).

---

Copyright 2026 Vijay Harrell. All rights reserved.

Standard Bearer is an early-stage research and development project. Source code and open-source licensing details will be published separately.

The Standard Bearer name and logos are covered by [TRADEMARKS.md](TRADEMARKS.md).
