import type { EvidenceEvent } from "@standard-bearer/protocol";

export interface SemanticSensor {
  observe(): AsyncIterable<EvidenceEvent>;
}
