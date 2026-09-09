/**
 * Observed-versus-gate platform peaks.
 *
 * Extracted from loadPlatformSampler so that file stays under the repository's
 * 500-line ceiling; the sampler owns collection, this owns how a partial
 * collection is reported.
 */

/**
 * Splits the GATE value from the OBSERVED value.
 *
 * Resource samples are useful when at least one sample succeeds. A transient
 * loss must remain visible in `resourceSampling`, but must not discard the valid
 * peak or turn an otherwise measurable run into NaN. The evaluator still fails
 * closed when no resource sample succeeds. Connection sampling remains
 * zero-tolerance because clustered connection misses can hide a cap breach.
 *
 * What it recovers is the EVIDENCE. NaN-ing the gate field also discarded the
 * measurement, so the 2026-08-28 rehearsal printed "Platform CPU/IO peak: NaN /
 * NaN%" while holding 10 good resource samples and 358 good connection samples —
 * and the question that run existed to answer, whether the instance saturated,
 * became unanswerable from its own evidence.
 *
 * The observed value is a LOWER BOUND on the true peak: sampling can only miss a
 * spike, never invent one. That asymmetry is why it is safe to report and why it
 * must never be read as a pass — a lower bound under the limit proves nothing,
 * while a lower bound over the limit is already a breach.
 */
export function summarizeObservedPeaks(input: {
  peakCpuPercent: number;
  peakIoPercent: number;
  peakConnections: number;
  connectionAttempts: number;
  connectionSuccesses: number;
}): {
  peakCpuPercent: number;
  peakIoPercent: number;
  peakConnections: number;
  observedPeakCpuPercent?: number;
  observedPeakIoPercent?: number;
  observedPeakConnections?: number;
} {
  const connectionsLost = input.connectionSuccesses < input.connectionAttempts;
  const sampledResources = Number.isFinite(input.peakCpuPercent);
  const sampledConnections = input.connectionSuccesses > 0;
  return {
    peakCpuPercent: sampledResources ? input.peakCpuPercent : Number.NaN,
    peakIoPercent: sampledResources ? input.peakIoPercent : Number.NaN,
    peakConnections: connectionsLost ? Number.NaN : input.peakConnections,
    ...(sampledResources
      ? {
          observedPeakCpuPercent: input.peakCpuPercent,
          observedPeakIoPercent: input.peakIoPercent,
        }
      : {}),
    ...(sampledConnections ? { observedPeakConnections: input.peakConnections } : {}),
  };
}
