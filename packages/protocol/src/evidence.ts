export interface ObservationHealth {
  readonly status: "healthy" | "degraded" | "unknown";
  readonly lastObservedAt?: string;
  readonly issues: readonly string[];
}

export interface IntegrityReport {
  readonly valid: boolean;
  readonly eventCount: number;
  readonly issues: readonly string[];
}
