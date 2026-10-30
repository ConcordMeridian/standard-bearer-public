import {
  canonicalSerialize,
  payloadHash,
  validateEvidenceEvent,
  type EvidenceEvent,
  type IntegrityReport,
  type ObserverHealthChangedPayload,
} from "@standard-bearer/protocol";

export interface Cursor {
  readonly offset: number;
}

export interface EvidenceJournal {
  append(event: EvidenceEvent): Promise<void>;
  // All-or-nothing: either every event in the batch (plus any derived gap health events) is stored, or none is.
  appendBatch(events: readonly EvidenceEvent[]): Promise<void>;
  stream(from?: Cursor): AsyncIterable<EvidenceEvent>;
  verify(): Promise<IntegrityReport>;
}

export class OutOfOrderEventError extends Error {
  constructor(collectorId: string, sequence: bigint, previous: bigint) {
    super(`Out-of-order event for collector ${collectorId}: ${sequence.toString()} <= ${previous.toString()}`);
    this.name = "OutOfOrderEventError";
  }
}

function serializableEvent(event: EvidenceEvent): Readonly<Record<string, unknown>> {
  return {
    ...event,
    sequence: event.sequence.toString(),
  };
}

export function serializeEvidenceEvent(event: EvidenceEvent): string {
  return canonicalSerialize(serializableEvent(event));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function journalGapEvent(event: EvidenceEvent, previous: bigint, sequence: bigint): EvidenceEvent {
  const collectorId = `standard-bearer.journal:${event.deploymentId}`;
  const payload: ObserverHealthChangedPayload = Object.freeze({
    status: "degraded",
    dimensions: Object.freeze([]),
    issues: Object.freeze([`Sequence gap for collector ${event.collectorId}: ${previous.toString()} -> ${event.sequence.toString()}`]),
  });
  return Object.freeze({
    eventId: `${collectorId}:${sequence.toString()}:observer.health.changed:sequence-gap:${event.collectorId}:${previous.toString()}:${event.sequence.toString()}`,
    schemaVersion: "0.2",
    type: "observer.health.changed",
    observedAt: event.observedAt,
    sequence,
    correlationId: event.correlationId,
    causationId: event.eventId,
    agentId: event.agentId,
    deploymentId: event.deploymentId,
    collectorId,
    source: "standard-bearer.evidence-journal",
    evidenceMode: "observed",
    configVersions: Object.freeze({}),
    payloadHash: payloadHash(payload),
    payload,
  });
}

interface JournalIndex {
  readonly eventsById: Map<string, EvidenceEvent>;
  readonly lastSequenceByCollector: Map<string, bigint>;
}

function stage(index: JournalIndex, staged: EvidenceEvent[], event: EvidenceEvent): void {
  index.eventsById.set(event.eventId, event);
  index.lastSequenceByCollector.set(event.collectorId, event.sequence);
  staged.push(event);
}

export class InMemoryEvidenceJournal implements EvidenceJournal {
  readonly #events: EvidenceEvent[] = [];
  #index: JournalIndex = { eventsById: new Map(), lastSequenceByCollector: new Map() };

  async append(event: EvidenceEvent): Promise<void> {
    await this.appendBatch([event]);
  }

  async appendBatch(events: readonly EvidenceEvent[]): Promise<void> {
    const index: JournalIndex = {
      eventsById: new Map(this.#index.eventsById),
      lastSequenceByCollector: new Map(this.#index.lastSequenceByCollector),
    };
    const staged: EvidenceEvent[] = [];
    for (const event of events) {
      validateEvidenceEvent(event);
      const existing = index.eventsById.get(event.eventId);
      if (existing !== undefined) {
        if (serializeEvidenceEvent(existing) !== serializeEvidenceEvent(event)) {
          throw new Error(`Evidence event ID collision: ${event.eventId}`);
        }
        continue;
      }

      const lastSequence = index.lastSequenceByCollector.get(event.collectorId);
      if (lastSequence !== undefined && event.sequence <= lastSequence) {
        throw new OutOfOrderEventError(event.collectorId, event.sequence, lastSequence);
      }

      const ownedEvent = deepFreeze(structuredClone(event));
      stage(index, staged, ownedEvent);
      if (lastSequence !== undefined && event.sequence > lastSequence + 1n) {
        const gapCollectorId = `standard-bearer.journal:${event.deploymentId}`;
        const gapSequence = (index.lastSequenceByCollector.get(gapCollectorId) ?? 0n) + 1n;
        stage(index, staged, journalGapEvent(ownedEvent, lastSequence, gapSequence));
      }
    }
    // Commit only after every event in the batch was accepted.
    this.#events.push(...staged);
    this.#index = index;
  }

  async *stream(from: Cursor = { offset: 0 }): AsyncIterable<EvidenceEvent> {
    if (!Number.isInteger(from.offset) || from.offset < 0) {
      throw new Error("Journal cursor offset must be a non-negative integer");
    }
    for (const event of this.#events.slice(from.offset)) yield event;
  }

  async verify(): Promise<IntegrityReport> {
    const issues: string[] = [];
    const previousByCollector = new Map<string, bigint>();
    for (const event of this.#events) {
      validateEvidenceEvent(event);
      const previous = previousByCollector.get(event.collectorId);
      if (previous !== undefined && event.sequence !== previous + 1n) {
        issues.push(`Sequence gap for collector ${event.collectorId}: ${previous.toString()} -> ${event.sequence.toString()}`);
      }
      previousByCollector.set(event.collectorId, event.sequence);
    }
    return Object.freeze({ valid: issues.length === 0, eventCount: this.#events.length, issues: Object.freeze(issues) });
  }
}
