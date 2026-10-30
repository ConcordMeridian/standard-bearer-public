import type { ObservationHealth } from "@standard-bearer/protocol";

export interface CollectorHealthSource { current(): Promise<ObservationHealth> }
