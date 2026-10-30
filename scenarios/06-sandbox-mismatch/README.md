# Scenario 06 — Sandbox / Elevated Execution Mismatch

## Purpose

Scenario 06 answers whether a deployment has filesystem, shell, elevated-execution, or network authority beyond its declared `/workspace` envelope. It is a deterministic offline vertical slice; it does not connect to OpenClaw or enforce policy.

## Event-first execution path

```text
fixture
  -> OpenClaw adapter
  -> canonical EvidenceEvents
  -> EvidenceJournal.append/stream
  -> AuthorityProjector.apply
  -> AgentAuthorityMap
  -> AEG
  -> CLI rendering
```

The journal history is authoritative. The Authority Map is disposable derived state and must be reproducible byte-for-byte by replay.

## Fixtures

Canonical fixtures live under `fixtures/`:

- `tightly-bounded.json`: all five dimensions are known and effective authority remains inside `/workspace`; completeness `complete`, AEG `none`.
- `unexpectedly-elevated.json`: adds `/home/user READ`, shell execution, elevated execution, and unrestricted network; completeness `complete`, AEG `high` with exactly those four differences.
- `incomplete.json`: elevated execution and network are unavailable while other dimensions remain known; completeness `partial`, AEG `unknown`.

Each fixture emits, in order:

1. `agent.discovered`
2. `authority.declared`
3. `permission.snapshot`
4. `observer.health.changed`

All fixture events are `self_attested`. No event is labeled witnessed.

## Completeness and AEG

The required dimensions are workspace filesystem, broader filesystem reach, shell execution, elevated execution, and network authority.

- All five known: `complete`.
- At least one known and at least one unknown: `partial`.
- None known: `unknown`.

AEG is `none` only for a complete projection with no excess authority, `high` only for a complete projection with a material Scenario 06 excess, and `unknown` whenever partial or unknown information could affect the result.

## Replay, duplicates, sequence, and health

Stable event IDs make duplicate append and duplicate projector delivery idempotent. The journal owns immutable event copies. Rebuilding a new projector from the same journal produces byte-identical serialized state.

Per-collector sequence is authoritative; timestamps are informational. A forward sequence gap is retained and produces a deterministic `observer.health.changed` event from the journal, degrading the projection and preventing complete-looking authority. A new non-duplicate event at or below the last accepted sequence is rejected with `OutOfOrderEventError`; events are not silently reordered or buffered.

## CLI

```text
standard-bearer replay 06-sandbox-mismatch
standard-bearer replay 06-sandbox-mismatch --fixture tightly-bounded
standard-bearer replay 06-sandbox-mismatch --fixture unexpectedly-elevated
standard-bearer replay 06-sandbox-mismatch --fixture incomplete
```

Without selection, fixtures run in the order shown above. Output contains no runtime timestamps, randomness, or machine-dependent values.

## Non-goals

This release evaluates recorded synthetic snapshots. It does not provide live monitoring, production enforcement, independent witnessing, cloud services, or a graphical interface.
